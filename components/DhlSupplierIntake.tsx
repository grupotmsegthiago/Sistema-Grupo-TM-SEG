// Página pública para o fornecedor preencher dados de Escoltista 1, Escoltista 2 e Veículo
// de uma OS DHL. Acessada via /fornecedor/dhl?token=XXX
// Não exige login. Memória por fornecedor com seleção/reaproveitamento.

import React, { useEffect, useState, useMemo } from 'react';
import { User, Truck, CheckCircle2, ArrowRight, ArrowLeft, Loader2, AlertCircle, Search } from 'lucide-react';
import tmsegLogo from '../attached_assets/tmseg_logo_transparent.png';

const INPUT = "w-full bg-white border border-gray-300 rounded-lg px-3 h-11 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all";
const LABEL = "text-[10px] font-black text-gray-500 uppercase mb-1.5 block tracking-wider";
const SELECT = INPUT + " appearance-none pr-10";

type Escoltista = {
  id?: string;
  nome: string; cpf: string; rg: string; orgaoEmissor: string;
  cnh: string; cnhCategoria: string; cnhVencimento: string;
  cnvNumero: string; cnvValidade: string;
  rua: string; numero: string; complemento: string;
  bairro: string; cidade: string; uf: string; cep: string;
  celular: string; admissao: string;
};

type Veiculo = {
  id?: string;
  placa: string; renavam: string; marca: string; ano: string;
  modelo: string; cor: string; tecnologia: string;
  idRastreador: string; comunicacao: string;
};

const EMPTY_ESCOLTISTA: Escoltista = {
  nome: '', cpf: '', rg: '', orgaoEmissor: '',
  cnh: '', cnhCategoria: '', cnhVencimento: '',
  cnvNumero: '', cnvValidade: '',
  rua: '', numero: '', complemento: '',
  bairro: '', cidade: '', uf: '', cep: '',
  celular: '', admissao: '',
};
const EMPTY_VEICULO: Veiculo = {
  placa: '', renavam: '', marca: '', ano: '',
  modelo: '', cor: '', tecnologia: '',
  idRastreador: '', comunicacao: '',
};

const TECNOLOGIAS = ['OMNILINK', 'SASCAR', 'ONIXSAT', 'JABURSAT', 'SIGHRA', 'AUTOTRAC', 'OUTRA'];
const UF_LIST = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

// Máscaras
function maskCelular(v: string): string {
  // formato pedido: (12)34567-8910
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)})${d.slice(2)}`;
  return `(${d.slice(0,2)})${d.slice(2,7)}-${d.slice(7)}`;
}
function maskCep(v: string): string {
  const d = (v || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0,5)}-${d.slice(5)}`;
}
function maskCpf(v: string): string {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}
function maskPlaca(v: string): string {
  return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

const DhlSupplierIntake: React.FC = () => {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mission, setMission] = useState<any>(null);
  const [intake, setIntake] = useState<any>(null);
  const [savedEscoltistas, setSavedEscoltistas] = useState<any[]>([]);
  const [savedVeiculos, setSavedVeiculos] = useState<any[]>([]);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [agent1, setAgent1] = useState<Escoltista>({ ...EMPTY_ESCOLTISTA });
  const [agent2, setAgent2] = useState<Escoltista>({ ...EMPTY_ESCOLTISTA });
  const [veiculo, setVeiculo] = useState<Veiculo>({ ...EMPTY_VEICULO });
  const [mirrorProof, setMirrorProof] = useState<{ dataUrl: string; filename: string; size: number; contentType: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Marca progresso parcial no backend (best-effort: nunca bloqueia a UI).
  const sendProgress = async (patch: { agent1?: boolean; agent2?: boolean; vehicle?: boolean; mirror?: boolean }) => {
    try {
      await fetch(`/api/dhl/intake/public/${encodeURIComponent(token)}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {}
  };

  useEffect(() => {
    if (!token) { setError('Link inválido — token ausente'); setLoading(false); return; }
    (async () => {
      try {
        const r = await fetch(`/api/dhl/intake/public/${encodeURIComponent(token)}`);
        const j = await r.json();
        if (!r.ok) { setError(j.error || 'Link inválido ou expirado'); setLoading(false); return; }
        setMission(j.mission);
        setIntake(j.intake);
        setSavedEscoltistas(j.escoltistas || []);
        setSavedVeiculos(j.vehicles || []);
        if (j.intake?.status === 'preenchido') setDone(true);
        setLoading(false);
      } catch (e: any) {
        setError('Falha ao carregar — verifique sua conexão');
        setLoading(false);
      }
    })();
  }, [token]);

  const fromSaved = (sav: any): Escoltista => ({
    id: sav.id, nome: sav.nome || '', cpf: sav.cpf || '', rg: sav.rg || '', orgaoEmissor: sav.orgao_emissor || '',
    cnh: sav.cnh || '', cnhCategoria: sav.cnh_categoria || '', cnhVencimento: sav.cnh_vencimento || '',
    cnvNumero: sav.cnv_numero || '', cnvValidade: sav.cnv_validade || '',
    rua: sav.rua || '', numero: sav.numero || '', complemento: sav.complemento || '',
    bairro: sav.bairro || '', cidade: sav.cidade || '', uf: sav.uf || '', cep: sav.cep || '',
    celular: sav.celular || '', admissao: sav.admissao || '',
  });
  const fromSavedVeic = (sav: any): Veiculo => ({
    id: sav.id, placa: sav.placa || '', renavam: sav.renavam || '', marca: sav.marca || '',
    ano: sav.ano || '', modelo: sav.modelo || '', cor: sav.cor || '', tecnologia: sav.tecnologia || '',
    idRastreador: sav.id_rastreador || '', comunicacao: sav.comunicacao || '',
  });

  const validateEscoltista = (e: Escoltista, label: string): string | null => {
    // Mesmo registros já vindos do cadastro (com e.id) precisam ter todos os
    // campos obrigatórios. Se algum estiver vazio, o fornecedor deve preencher.
    const req: [keyof Escoltista, string][] = [
      ['nome','Nome'], ['cpf','CPF'], ['rg','RG'], ['orgaoEmissor','Órgão emis./UF'],
      ['cnh','CNH'], ['cnhCategoria','Categoria CNH'], ['cnhVencimento','Vencimento CNH'],
      ['cnvNumero','CNV Número'], ['cnvValidade','Validade CNV'],
      ['rua','Rua'], ['numero','Número'], ['bairro','Bairro'], ['cidade','Cidade'],
      ['uf','UF'], ['cep','CEP'], ['celular','Celular'], ['admissao','Admissão'],
    ];
    for (const [k, lbl] of req) { if (!String(e[k] || '').trim()) return `${label}: ${lbl} é obrigatório`; }
    if (e.celular.replace(/\D/g,'').length < 10) return `${label}: Celular incompleto (formato (12)34567-8910)`;
    if (e.cep.replace(/\D/g,'').length !== 8) return `${label}: CEP incompleto (00000-000)`;
    return null;
  };
  const validateVeiculo = (v: Veiculo): string | null => {
    if (v.id) return null;
    const req: [keyof Veiculo, string][] = [
      ['placa','Placa'], ['renavam','Renavam'], ['marca','Marca'], ['ano','Ano'],
      ['modelo','Modelo'], ['cor','Cor'], ['tecnologia','Tecnologia'],
      ['idRastreador','ID rastreador'], ['comunicacao','Comunicação'],
    ];
    for (const [k, lbl] of req) { if (!String(v[k] || '').trim()) return `Veículo: ${lbl} é obrigatório`; }
    return null;
  };

  const submit = async () => {
    const e1 = validateEscoltista(agent1, 'Escoltista 1');
    const e2 = validateEscoltista(agent2, 'Escoltista 2');
    const ev = validateVeiculo(veiculo);
    if (e1) { alert(e1); setStep(1); return; }
    if (e2) { alert(e2); setStep(2); return; }
    if (ev) { alert(ev); setStep(3); return; }
    if (!agent1.id && !agent2.id && agent1.cpf === agent2.cpf) {
      alert('Escoltista 1 e Escoltista 2 não podem ter o mesmo CPF');
      return;
    }
    if (!mirrorProof) {
      alert('Anexe o print do espelhamento (comprovante de que foi realizado) antes de enviar.');
      setStep(3);
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch(`/api/dhl/intake/public/${encodeURIComponent(token)}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent1, agent2, vehicle: veiculo, mirrorProof }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || 'Erro ao enviar'); setSubmitting(false); return; }
      setDone(true);
    } catch (e: any) {
      alert('Erro de conexão — tente novamente');
    } finally {
      setSubmitting(false);
    }
  };

  // ───── UI ─────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center"><Loader2 className="w-10 h-10 animate-spin text-red-600 mx-auto mb-3" /><p className="text-gray-500 text-sm font-semibold">Carregando...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border-t-4 border-red-600 p-8 text-center">
          <AlertCircle className="w-14 h-14 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Não foi possível acessar</h2>
          <p className="text-gray-600 text-sm">{error}</p>
          <p className="text-gray-400 text-xs mt-4">Se você acredita que isso é um engano, entre em contato com a equipe TM SEG.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 to-white p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border-t-4 border-green-500 p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Dados enviados!</h2>
          <p className="text-gray-600 text-sm mb-4">A equipe operacional da TM SEG foi notificada e dará sequência ao processo.</p>
          <div className="bg-gray-50 rounded-lg p-3 text-left text-xs text-gray-600 space-y-1">
            <p><span className="font-bold">OS:</span> {mission?.id}</p>
            <p><span className="font-bold">S.E.:</span> {mission?.dhl_se_number || '—'}</p>
            <p><span className="font-bold">Trajeto:</span> {mission?.origin} → {mission?.destination}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header DHL */}
      <div style={{ background: '#FFCC00', height: 8 }}></div>
      <div style={{ background: '#D40511', height: 4 }}></div>
      <header className="bg-[#1a1a1a] text-white">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={tmsegLogo} alt="Grupo TM SEG" className="h-14 md:h-16 w-auto object-contain" />
            <div>
              <h1 className="text-lg md:text-xl font-black tracking-wide">GRUPO <span className="text-red-500">TM SEG</span></h1>
              <p className="text-[10px] uppercase tracking-widest text-yellow-400 font-bold">Intermediação de Escolta Armada</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-400">OS</p>
            <p className="text-sm font-bold">{mission?.id || '—'}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* OS info card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-black uppercase text-gray-900 mb-3 border-b-2 border-yellow-400 pb-2">Dados da Solicitação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div><span className="text-[10px] uppercase text-gray-400 font-bold block">Nº S.E.</span><span className="font-bold text-red-600">{mission?.dhl_se_number || '—'}</span></div>
            <div><span className="text-[10px] uppercase text-gray-400 font-bold block">Fornecedor</span><span className="font-semibold text-gray-800">{intake?.providerName || '—'}</span></div>
            <div><span className="text-[10px] uppercase text-gray-400 font-bold block">Origem</span><span className="text-gray-700">{mission?.origin || '—'}</span></div>
            <div><span className="text-[10px] uppercase text-gray-400 font-bold block">Destino</span><span className="text-gray-700">{mission?.destination || '—'}</span></div>
            <div className="md:col-span-2"><span className="text-[10px] uppercase text-gray-400 font-bold block">Início previsto</span><span className="text-gray-700">{mission?.start_time ? new Date(mission.start_time).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</span></div>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-3">
          {[
            { n: 1, label: 'Escoltista 1', icon: <User size={14} /> },
            { n: 2, label: 'Escoltista 2', icon: <User size={14} /> },
            { n: 3, label: 'Veículo', icon: <Truck size={14} /> },
            { n: 4, label: 'Revisar', icon: <CheckCircle2 size={14} /> },
          ].map((s, i, arr) => (
            <React.Fragment key={s.n}>
              <button
                type="button"
                onClick={() => { if (s.n < step) setStep(s.n as any); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${step === s.n ? 'bg-red-600 text-white' : step > s.n ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}
              >
                {step > s.n ? <CheckCircle2 size={14} /> : s.icon}
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.n}</span>
              </button>
              {i < arr.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${step > s.n ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          {step === 1 && (
            <EscoltistaForm
              titulo="Escoltista 1"
              data={agent1}
              setData={setAgent1}
              savedList={savedEscoltistas}
              fromSaved={fromSaved}
              onNext={() => {
                const err = validateEscoltista(agent1, 'Escoltista 1');
                if (err) { alert(err); return; }
                sendProgress({ agent1: true });
                setStep(2);
              }}
            />
          )}
          {step === 2 && (
            <EscoltistaForm
              titulo="Escoltista 2"
              data={agent2}
              setData={setAgent2}
              savedList={savedEscoltistas.filter(s => !agent1.id || s.id !== agent1.id)}
              fromSaved={fromSaved}
              onBack={() => setStep(1)}
              onNext={() => {
                const err = validateEscoltista(agent2, 'Escoltista 2');
                if (err) { alert(err); return; }
                if (!agent1.id && !agent2.id && agent1.cpf === agent2.cpf) { alert('CPF não pode ser igual ao do Escoltista 1'); return; }
                sendProgress({ agent2: true });
                setStep(3);
              }}
            />
          )}
          {step === 3 && (
            <VeiculoForm
              data={veiculo}
              setData={setVeiculo}
              savedList={savedVeiculos}
              fromSavedVeic={fromSavedVeic}
              mirrorProof={mirrorProof}
              setMirrorProof={setMirrorProof}
              onBack={() => setStep(2)}
              onNext={() => {
                const err = validateVeiculo(veiculo);
                if (err) { alert(err); return; }
                if (!mirrorProof) { alert('Anexe o print do espelhamento (comprovante de que foi realizado) antes de avançar.'); return; }
                sendProgress({ vehicle: true, mirror: true });
                setStep(4);
              }}
            />
          )}
          {step === 4 && (
            <Revisao
              agent1={agent1} agent2={agent2} veiculo={veiculo}
              mirrorProof={mirrorProof}
              onBack={() => setStep(3)}
              onSubmit={submit}
              submitting={submitting}
            />
          )}
        </div>

        <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest pb-6">
          Grupo TM SEG &copy; {new Date().getFullYear()} — Intermediação de Escolta Armada
        </p>
      </main>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// Sub-componente: Formulário de Escoltista
// ────────────────────────────────────────────────────────────
const EscoltistaForm: React.FC<{
  titulo: string;
  data: Escoltista;
  setData: (e: Escoltista) => void;
  savedList: any[];
  fromSaved: (s: any) => Escoltista;
  onBack?: () => void;
  onNext: () => void;
}> = ({ titulo, data, setData, savedList, fromSaved, onBack, onNext }) => {
  const set = (patch: Partial<Escoltista>) => setData({ ...data, ...patch });
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'found' | 'notfound'>('idle');
  // Conjunto de campos que vieram preenchidos do cadastro — só esses ficam readOnly.
  // Os que vieram em branco continuam editáveis e obrigatórios para o fornecedor.
  const [lockedFields, setLockedFields] = useState<Set<string>>(new Set());

  // Busca no cadastro do fornecedor pelo CPF (comparação só por dígitos)
  const handleCpfChange = (raw: string) => {
    const masked = maskCpf(raw);
    const digits = masked.replace(/\D/g, '');

    // Se o CPF mudar depois de já ter encontrado, limpa o id e libera edição
    if (data.id && digits !== (data.cpf || '').replace(/\D/g, '')) {
      setData({ ...EMPTY_ESCOLTISTA, cpf: masked });
      setLookupStatus('idle');
      setLockedFields(new Set());
      return;
    }

    if (digits.length < 11) {
      set({ cpf: masked });
      setLookupStatus('idle');
      setLockedFields(new Set());
      return;
    }

    // CPF completo (11 dígitos): tenta encontrar no cadastro
    const found = savedList.find(s => (s.cpf || '').replace(/\D/g, '') === digits);
    if (found) {
      const mapped = fromSaved(found);
      setData(mapped);
      setLookupStatus('found');
      // Marca como travado apenas os campos que já vieram com valor.
      const filled = new Set<string>();
      (Object.keys(mapped) as Array<keyof Escoltista>).forEach(k => {
        if (k === 'id' || k === 'cpf') return;
        const v = mapped[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') filled.add(k as string);
      });
      setLockedFields(filled);
    } else {
      set({ cpf: masked });
      setLookupStatus('notfound');
      setLockedFields(new Set());
    }
  };

  const cpfDigits = (data.cpf || '').replace(/\D/g, '');
  const cpfComplete = cpfDigits.length === 11;
  const isLocked = lookupStatus === 'found';
  const showFields = cpfComplete || isLocked;
  const lock = (field: keyof Escoltista) => lockedFields.has(field as string);
  const lockCls = (field: keyof Escoltista) => lock(field) ? ' bg-gray-50 text-gray-600' : '';
  const missingFields = lookupStatus === 'found' && [
    'nome','rg','orgaoEmissor','cnh','cnhCategoria','cnhVencimento','cnvNumero','cnvValidade',
    'rua','numero','bairro','cidade','uf','cep','celular','admissao'
  ].some(k => !lockedFields.has(k));

  return (
    <div>
      <h3 className="text-base font-black uppercase text-gray-900 mb-1 flex items-center gap-2"><User className="w-5 h-5 text-red-600" /> {titulo}</h3>
      <p className="text-xs text-gray-500 mb-4">Digite o CPF do escoltista. Se ele já estiver cadastrado, os dados serão preenchidos automaticamente.</p>

      {/* CPF em destaque — entrada principal */}
      <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-4 mb-4">
        <label className={LABEL + ' flex items-center gap-1.5'}>
          <Search className="w-3.5 h-3.5 text-red-600" /> CPF do escoltista*
        </label>
        <input
          className={INPUT + ' text-lg font-bold tracking-wider'}
          placeholder="000.000.000-00"
          value={data.cpf}
          onChange={e => handleCpfChange(e.target.value)}
          inputMode="numeric"
          autoFocus
          data-testid={`input-cpf-${titulo.toLowerCase().replace(/\s/g, '-')}`}
        />
        {lookupStatus === 'found' && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2" data-testid="badge-cpf-found">
            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-green-800">
              <p className="font-bold">Encontrado no cadastro: {data.nome}</p>
              <p className="text-green-700">Os dados já cadastrados foram preenchidos automaticamente e ficam bloqueados. Para usar outro escoltista, apague o CPF e digite outro.</p>
            </div>
          </div>
        )}
        {missingFields && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2" data-testid="badge-cpf-missing">
            <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-800">
              <p className="font-bold">Complete os dados que faltam abaixo</p>
              <p>Os campos destacados em branco ainda não estão no cadastro deste escoltista. Preencha-os para concluir — ficarão salvos para as próximas OS.</p>
            </div>
          </div>
        )}
        {lookupStatus === 'notfound' && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2" data-testid="badge-cpf-notfound">
            <AlertCircle className="w-4 h-4 text-yellow-700 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-yellow-800">
              <p className="font-bold">CPF ainda não cadastrado</p>
              <p>Preencha todos os campos abaixo. Esses dados ficarão salvos para as próximas OS.</p>
            </div>
          </div>
        )}
        {!cpfComplete && !isLocked && (
          <p className="text-xs text-gray-500 mt-2 italic">Os demais campos aparecem após você digitar o CPF completo.</p>
        )}
      </div>

      {showFields && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2"><label className={LABEL}>Nome*</label><input className={INPUT + lockCls('nome')} value={data.nome} onChange={e => set({ nome: e.target.value })} readOnly={lock('nome')} data-testid="input-nome" /></div>
          <div><label className={LABEL}>RG*</label><input className={INPUT + lockCls('rg')} value={data.rg} onChange={e => set({ rg: e.target.value })} readOnly={lock('rg')} /></div>
          <div className="md:col-span-2"><label className={LABEL}>Órgão emis./UF*</label><input className={INPUT + lockCls('orgaoEmissor')} placeholder="SSP/SP" value={data.orgaoEmissor} onChange={e => set({ orgaoEmissor: e.target.value.toUpperCase() })} readOnly={lock('orgaoEmissor')} /></div>
          <div><label className={LABEL}>CNH*</label><input className={INPUT + lockCls('cnh')} value={data.cnh} onChange={e => set({ cnh: e.target.value })} readOnly={lock('cnh')} /></div>
          <div><label className={LABEL}>Categoria*</label><select className={SELECT + lockCls('cnhCategoria')} value={data.cnhCategoria} onChange={e => set({ cnhCategoria: e.target.value })} disabled={lock('cnhCategoria')}><option value="">—</option>{['A','B','AB','C','AC','D','AD','E','AE'].map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className={LABEL}>Venc. CNH*</label><input type="date" className={INPUT + lockCls('cnhVencimento')} value={data.cnhVencimento} onChange={e => set({ cnhVencimento: e.target.value })} readOnly={lock('cnhVencimento')} /></div>
          <div className="md:col-span-2"><label className={LABEL}>CNV Número*</label><input className={INPUT + lockCls('cnvNumero')} value={data.cnvNumero} onChange={e => set({ cnvNumero: e.target.value })} readOnly={lock('cnvNumero')} /></div>
          <div><label className={LABEL}>Validade CNV*</label><input type="date" className={INPUT + lockCls('cnvValidade')} value={data.cnvValidade} onChange={e => set({ cnvValidade: e.target.value })} readOnly={lock('cnvValidade')} /></div>
          <div className="md:col-span-2"><label className={LABEL}>Rua*</label><input className={INPUT + lockCls('rua')} value={data.rua} onChange={e => set({ rua: e.target.value })} readOnly={lock('rua')} /></div>
          <div><label className={LABEL}>Número*</label><input className={INPUT + lockCls('numero')} value={data.numero} onChange={e => set({ numero: e.target.value })} readOnly={lock('numero')} /></div>
          <div className="md:col-span-3"><label className={LABEL}>Complemento</label><input className={INPUT + lockCls('complemento')} value={data.complemento} onChange={e => set({ complemento: e.target.value })} readOnly={lock('complemento')} /></div>
          <div><label className={LABEL}>Bairro*</label><input className={INPUT + lockCls('bairro')} value={data.bairro} onChange={e => set({ bairro: e.target.value })} readOnly={lock('bairro')} /></div>
          <div><label className={LABEL}>Cidade*</label><input className={INPUT + lockCls('cidade')} value={data.cidade} onChange={e => set({ cidade: e.target.value })} readOnly={lock('cidade')} /></div>
          <div><label className={LABEL}>UF*</label><select className={SELECT + lockCls('uf')} value={data.uf} onChange={e => set({ uf: e.target.value })} disabled={lock('uf')}><option value="">—</option>{UF_LIST.map(u => <option key={u}>{u}</option>)}</select></div>
          <div><label className={LABEL}>CEP*</label><input className={INPUT + lockCls('cep')} placeholder="00000-000" value={data.cep} onChange={e => set({ cep: maskCep(e.target.value) })} readOnly={lock('cep')} /></div>
          <div><label className={LABEL}>Celular*</label><input className={INPUT + lockCls('celular')} placeholder="(12)34567-8910" value={data.celular} onChange={e => set({ celular: maskCelular(e.target.value) })} readOnly={lock('celular')} /></div>
          <div><label className={LABEL}>Admissão*</label><input type="date" className={INPUT + lockCls('admissao')} value={data.admissao} onChange={e => set({ admissao: e.target.value })} readOnly={lock('admissao')} /></div>
        </div>
      )}

      <div className="flex justify-between mt-6 pt-4 border-t border-gray-100">
        {onBack ? <button type="button" onClick={onBack} className="px-5 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-bold flex items-center gap-2"><ArrowLeft size={16} /> Voltar</button> : <span />}
        <button type="button" onClick={onNext} disabled={!cpfComplete && !isLocked} className="px-6 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold flex items-center gap-2 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed" data-testid="btn-avancar-escoltista">Avançar <ArrowRight size={16} /></button>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// Sub-componente: Veículo
// ────────────────────────────────────────────────────────────
const VeiculoForm: React.FC<{
  data: Veiculo;
  setData: (v: Veiculo) => void;
  savedList: any[];
  fromSavedVeic: (s: any) => Veiculo;
  mirrorProof: { dataUrl: string; filename: string; size: number; contentType: string } | null;
  setMirrorProof: (p: { dataUrl: string; filename: string; size: number; contentType: string } | null) => void;
  onBack: () => void;
  onNext: () => void;
}> = ({ data, setData, savedList, fromSavedVeic, mirrorProof, setMirrorProof, onBack, onNext }) => {
  const [mode, setMode] = useState<'novo' | 'cadastrado'>(savedList.length > 0 ? 'cadastrado' : 'novo');
  const set = (patch: Partial<Veiculo>) => setData({ ...data, ...patch });

  return (
    <div>
      <h3 className="text-base font-black uppercase text-gray-900 mb-1 flex items-center gap-2"><Truck className="w-5 h-5 text-red-600" /> Veículo da Escolta</h3>
      <p className="text-xs text-gray-500 mb-4">Selecione um veículo já cadastrado ou preencha um novo.</p>

      {savedList.length > 0 && (
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => { setMode('cadastrado'); setData({ ...EMPTY_VEICULO }); }} className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase ${mode === 'cadastrado' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Selecionar cadastrado</button>
          <button type="button" onClick={() => { setMode('novo'); setData({ ...EMPTY_VEICULO }); }} className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase ${mode === 'novo' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Novo cadastro</button>
        </div>
      )}

      {mode === 'cadastrado' && savedList.length > 0 && (
        <div>
          <label className={LABEL}>Selecione o veículo</label>
          <select className={SELECT} value={data.id || ''} onChange={e => { const sel = savedList.find(s => s.id === e.target.value); setData(sel ? fromSavedVeic(sel) : { ...EMPTY_VEICULO }); }}>
            <option value="">— Selecione —</option>
            {savedList.map(s => <option key={s.id} value={s.id}>{s.placa} — {s.marca} {s.modelo}</option>)}
          </select>
          {data.id && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
              <p className="font-bold">{data.placa} — {data.marca} {data.modelo} ({data.ano})</p>
              <p>Cor: {data.cor} • Tecnologia: {data.tecnologia} • ID: {data.idRastreador}</p>
            </div>
          )}
        </div>
      )}

      {mode === 'novo' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className={LABEL}>Placa*</label><input className={INPUT} placeholder="ABC1D23" value={data.placa} onChange={e => set({ placa: maskPlaca(e.target.value) })} /></div>
          <div className="md:col-span-2"><label className={LABEL}>Renavam*</label><input className={INPUT} value={data.renavam} onChange={e => set({ renavam: e.target.value.replace(/\D/g, '') })} /></div>
          <div><label className={LABEL}>Marca*</label><input className={INPUT} value={data.marca} onChange={e => set({ marca: e.target.value })} /></div>
          <div><label className={LABEL}>Ano*</label><input className={INPUT} value={data.ano} onChange={e => set({ ano: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></div>
          <div><label className={LABEL}>Modelo*</label><input className={INPUT} value={data.modelo} onChange={e => set({ modelo: e.target.value })} /></div>
          <div><label className={LABEL}>Cor*</label><input className={INPUT} value={data.cor} onChange={e => set({ cor: e.target.value })} /></div>
          <div><label className={LABEL}>Tecnologia*</label><select className={SELECT} value={data.tecnologia} onChange={e => set({ tecnologia: e.target.value })}><option value="">—</option>{TECNOLOGIAS.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label className={LABEL}>ID Rastreador*</label><input className={INPUT} value={data.idRastreador} onChange={e => set({ idRastreador: e.target.value })} /></div>
          <div className="md:col-span-3"><label className={LABEL}>Comunicação*</label><input className={INPUT} placeholder="GSM / Satélite / Híbrido" value={data.comunicacao} onChange={e => set({ comunicacao: e.target.value })} /></div>
        </div>
      )}

      {/* Print do espelhamento — obrigatório */}
      <div className="mt-6 pt-5 border-t border-gray-200">
        <h4 className="text-sm font-black uppercase text-gray-900 mb-1 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-red-600" /> Comprovante de Espelhamento*
        </h4>
        <p className="text-xs text-gray-500 mb-3">Anexe o print confirmando que o espelhamento do sinal foi realizado (PNG, JPG, WEBP ou PDF — até 8 MB).</p>
        {!mirrorProof ? (
          <label className="block border-2 border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-red-500 hover:bg-red-50/30 transition" data-testid="input-mirror-proof">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 8 * 1024 * 1024) { alert('Arquivo muito grande — limite de 8 MB.'); return; }
                const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
                if (!allowed.includes(f.type)) { alert('Tipo não suportado — envie PNG, JPG, WEBP ou PDF.'); return; }
                const dataUrl: string = await new Promise((resolve, reject) => {
                  const r = new FileReader();
                  r.onload = () => resolve(String(r.result));
                  r.onerror = () => reject(new Error('Falha ao ler arquivo'));
                  r.readAsDataURL(f);
                });
                setMirrorProof({ dataUrl, filename: f.name, size: f.size, contentType: f.type });
              }}
            />
            <p className="text-sm font-bold text-gray-700">Clique para selecionar o print</p>
            <p className="text-[11px] text-gray-400 mt-1">ou tire uma foto da tela do sistema de rastreamento</p>
          </label>
        ) : (
          <div className="border border-green-300 bg-green-50 rounded-lg p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {mirrorProof.contentType.startsWith('image/') ? (
                <img src={mirrorProof.dataUrl} alt="prévia" className="w-14 h-14 object-cover rounded border border-green-300" />
              ) : (
                <div className="w-14 h-14 rounded bg-white border border-green-300 flex items-center justify-center text-[10px] font-bold text-gray-500">PDF</div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-green-800 truncate">{mirrorProof.filename}</p>
                <p className="text-[11px] text-green-700">{(mirrorProof.size / 1024).toFixed(0)} KB — anexado</p>
              </div>
            </div>
            <button type="button" onClick={() => setMirrorProof(null)} className="px-3 py-1.5 rounded bg-white border border-red-300 text-red-600 text-xs font-bold hover:bg-red-50" data-testid="button-remove-mirror-proof">Remover</button>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-6 pt-4 border-t border-gray-100">
        <button type="button" onClick={onBack} className="px-5 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-bold flex items-center gap-2"><ArrowLeft size={16} /> Voltar</button>
        <button type="button" onClick={onNext} className="px-6 py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold flex items-center gap-2 hover:bg-red-700">Revisar <ArrowRight size={16} /></button>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// Sub-componente: Revisão
// ────────────────────────────────────────────────────────────
const Revisao: React.FC<{
  agent1: Escoltista; agent2: Escoltista; veiculo: Veiculo;
  mirrorProof: { dataUrl: string; filename: string; size: number; contentType: string } | null;
  onBack: () => void; onSubmit: () => void; submitting: boolean;
}> = ({ agent1, agent2, veiculo, mirrorProof, onBack, onSubmit, submitting }) => {
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-gray-100 text-xs">
      <span className="text-gray-500 font-bold uppercase tracking-wider">{k}</span>
      <span className="text-gray-800 text-right">{v || '—'}</span>
    </div>
  );
  const escolt = (e: Escoltista) => (
    <div className="bg-gray-50 rounded-lg p-4">
      <Row k="Nome" v={e.nome} />
      <Row k="CPF / RG" v={`${e.cpf} • ${e.rg}${e.orgaoEmissor ? ` (${e.orgaoEmissor})` : ''}`} />
      <Row k="CNH" v={`${e.cnh}${e.cnhCategoria ? ` (${e.cnhCategoria})` : ''}${e.cnhVencimento ? ` venc. ${e.cnhVencimento}` : ''}`} />
      <Row k="CNV" v={`${e.cnvNumero}${e.cnvValidade ? ` — val. ${e.cnvValidade}` : ''}`} />
      <Row k="Endereço" v={`${e.rua}${e.numero ? ', ' + e.numero : ''}${e.complemento ? ' — ' + e.complemento : ''}`} />
      <Row k="Bairro/Cidade/UF" v={`${e.bairro} — ${e.cidade}/${e.uf}`} />
      <Row k="CEP" v={e.cep} />
      <Row k="Celular" v={e.celular} />
      <Row k="Admissão" v={e.admissao} />
    </div>
  );

  return (
    <div>
      <h3 className="text-base font-black uppercase text-gray-900 mb-1 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-red-600" /> Revisão</h3>
      <p className="text-xs text-gray-500 mb-4">Confira os dados antes de enviar. Após o envio, a equipe operacional será notificada.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div>
          <h4 className="text-xs font-black uppercase text-red-600 mb-2 tracking-wider">Escoltista 1</h4>
          {escolt(agent1)}
        </div>
        <div>
          <h4 className="text-xs font-black uppercase text-red-600 mb-2 tracking-wider">Escoltista 2</h4>
          {escolt(agent2)}
        </div>
      </div>

      <h4 className="text-xs font-black uppercase text-red-600 mb-2 tracking-wider">Veículo</h4>
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <Row k="Placa" v={veiculo.placa} />
        <Row k="Renavam" v={veiculo.renavam} />
        <Row k="Marca / Modelo" v={`${veiculo.marca} / ${veiculo.modelo}`} />
        <Row k="Ano / Cor" v={`${veiculo.ano} • ${veiculo.cor}`} />
        <Row k="Tecnologia" v={veiculo.tecnologia} />
        <Row k="ID Rastreador" v={veiculo.idRastreador} />
        <Row k="Comunicação" v={veiculo.comunicacao} />
      </div>

      <h4 className="text-xs font-black uppercase text-red-600 mb-2 tracking-wider">Comprovante de Espelhamento</h4>
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        {mirrorProof ? (
          <div className="flex items-center gap-3">
            {mirrorProof.contentType.startsWith('image/') ? (
              <img src={mirrorProof.dataUrl} alt="comprovante" className="w-20 h-20 object-cover rounded border border-gray-300" />
            ) : (
              <div className="w-20 h-20 rounded bg-white border border-gray-300 flex items-center justify-center text-xs font-bold text-gray-500">PDF</div>
            )}
            <div>
              <p className="text-sm font-bold text-gray-800">{mirrorProof.filename}</p>
              <p className="text-[11px] text-gray-500">{(mirrorProof.size / 1024).toFixed(0)} KB</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-red-600 font-bold">Print do espelhamento não anexado — volte e anexe.</p>
        )}
      </div>

      <div className="flex justify-between pt-4 border-t border-gray-100">
        <button type="button" onClick={onBack} disabled={submitting} className="px-5 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-bold flex items-center gap-2"><ArrowLeft size={16} /> Voltar</button>
        <button type="button" onClick={onSubmit} disabled={submitting} className="px-6 py-3 rounded-lg bg-green-600 text-white text-sm font-black uppercase tracking-wider flex items-center gap-2 hover:bg-green-700 disabled:opacity-60">
          {submitting ? <><Loader2 className="animate-spin w-4 h-4" /> Enviando...</> : <><CheckCircle2 size={16} /> Confirmar e enviar</>}
        </button>
      </div>
    </div>
  );
};

export default DhlSupplierIntake;
