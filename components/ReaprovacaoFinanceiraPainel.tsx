import React, { useRef, useState } from 'react';
import { authFetch } from '../lib/authFetch';
import {
  ETAPAS_REAPROVACAO,
  type EtapasReaprovacao,
  type OsReaprovacao,
  type UsuarioReaprovacao,
} from '../lib/reaprovacaoFinanceira/tipos';
import {
  etapasVazias,
  exibirPainelReaprovacao,
  justificativaValida,
  percentualEtapas,
  percentualExibido,
  podeReaprovar,
  rotuloEtapa,
} from '../lib/reaprovacaoFinanceira/regras';

type Resposta = {
  ok?: boolean;
  erro?: string;
  percentual?: number;
  etapas?: EtapasReaprovacao;
  status?: string;
  resumo?: { campos?: { campo: string; antes: number; depois: number }[] } | null;
};

function dinheiro(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function capturar(elemento: HTMLElement): Promise<string> {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(elemento, { backgroundColor: '#ffffff', scale: 1, logging: false });
  const data = canvas.toDataURL('image/jpeg', 0.85);
  if (!data.startsWith('data:image/jpeg')) throw new Error('captura');
  return data;
}

export default function ReaprovacaoFinanceiraPainel({
  os,
  usuario,
  onConcluida,
}: {
  os: OsReaprovacao;
  usuario: UsuarioReaprovacao;
  onConcluida?: (valores: { revenue_value: number; cost_value: number }) => void;
}) {
  const resumoRef = useRef<HTMLDivElement>(null);
  const [fase, setFase] = useState<'leitura' | 'edicao'>('leitura');
  const [receita, setReceita] = useState(String(os.revenue_value ?? 0));
  const [custo, setCusto] = useState(String(os.cost_value ?? 0));
  const [justificativa, setJustificativa] = useState('');
  const [tentativaId, setTentativaId] = useState('');
  const [capturaAntes, setCapturaAntes] = useState('');
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [senha, setSenha] = useState('');
  const [capturaDepois, setCapturaDepois] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState<Resposta | null>(null);

  if (!exibirPainelReaprovacao(usuario, os)) return null;
  const permissao = podeReaprovar(usuario, os);

  const etapasLocais = etapasVazias();
  if (permissao.permitido) etapasLocais.permissao = true;
  if (capturaAntes && capturaDepois) etapasLocais.capturas = true;
  if (justificativaValida(justificativa).ok) etapasLocais.justificativa = true;
  const concluida = resposta?.status === 'concluida' && resposta.ok === true;
  const parcial = resposta?.percentual ?? percentualEtapas(etapasLocais);
  const percentual = percentualExibido(parcial, concluida);
  const etapas = resposta?.etapas || etapasLocais;

  const iniciar = async () => {
    setErro('');
    setResposta(null);
    if (!resumoRef.current) {
      setErro('Falha na captura do estado anterior. A correção não foi aberta.');
      return;
    }
    try {
      const imagem = await capturar(resumoRef.current);
      setCapturaAntes(imagem);
      setTentativaId(crypto.randomUUID());
      setFase('edicao');
    } catch {
      setErro('Falha na captura do estado anterior. A correção não foi aberta.');
    }
  };

  const pedirSenha = async () => {
    setErro('');
    if (!justificativaValida(justificativa).ok) {
      setErro('Informe a justificativa da reaprovação.');
      return;
    }
    if (!resumoRef.current || !capturaAntes) {
      setErro('Falha na captura obrigatória. A reaprovação não foi concluída.');
      return;
    }
    try {
      const imagem = await capturar(resumoRef.current);
      setCapturaDepois(imagem);
      setSenha('');
      setSenhaAberta(true);
    } catch {
      setErro('Falha na captura do estado posterior. A reaprovação não foi concluída.');
    }
  };

  const confirmar = async () => {
    if (!senha.trim() || !capturaAntes || !capturaDepois) {
      setErro('Informe a senha pessoal. Sem senha válida a reaprovação não conclui.');
      return;
    }
    setEnviando(true);
    setErro('');
    const senhaEnviada = senha;
    setSenha('');
    try {
      const res = await authFetch('/api/reaprovacao-financeira?op=reaprovar', {
        method: 'POST',
        body: JSON.stringify({
          op: 'reaprovar',
          missionId: os.id,
          tentativaId,
          justificativa,
          senha: senhaEnviada,
          capturaAntes,
          capturaDepois,
          revenue_value: Number(String(receita).replace(',', '.')),
          cost_value: Number(String(custo).replace(',', '.')),
        }),
      });
      const data = await res.json().catch(() => ({})) as Resposta;
      setResposta(data);
      if (!res.ok || data.ok !== true || data.status !== 'concluida') {
        setErro(data.erro || 'A reaprovação não foi concluída.');
        setSenhaAberta(false);
        return;
      }
      setSenhaAberta(false);
      setFase('leitura');
      onConcluida?.({
        revenue_value: Number(String(receita).replace(',', '.')),
        cost_value: Number(String(custo).replace(',', '.')),
      });
    } catch {
      setErro('Falha de comunicação. A conclusão não foi confirmada.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-4 mb-4 p-3 bg-white rounded-xl border border-slate-200" data-testid="panel-reaprovacao-financeira">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Reaprovação financeira</p>
      <div ref={resumoRef} className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-1" data-testid="reaprovacao-resumo-visual">
        <p className="text-xs font-black text-slate-900">OS {os.id}</p>
        <p className="text-[11px] text-slate-700">Receita do serviço: {fase === 'edicao' ? dinheiro(Number(String(receita).replace(',', '.')) || 0) : dinheiro(Number(os.revenue_value || 0))}</p>
        <p className="text-[11px] text-slate-700">Custo do serviço: {fase === 'edicao' ? dinheiro(Number(String(custo).replace(',', '.')) || 0) : dinheiro(Number(os.cost_value || 0))}</p>
        <p className="text-[11px] text-slate-500">Pedágio preservado: {dinheiro(Number(os.toll_value || 0))}. Snapshot, franquia e comissão não entram nesta correção.</p>
        <p className="text-[11px] text-slate-500">Aprovado originalmente por {os.snapshot_approved_by || os.billing_verified_by || '—'}</p>
      </div>

      {!permissao.permitido && (
        <p className="mt-2 text-[11px] font-bold text-amber-800" data-testid="reaprovacao-bloqueio">{permissao.motivo}</p>
      )}

      {permissao.permitido && fase === 'leitura' && (
        <button
          type="button"
          onClick={() => { void iniciar(); }}
          className="mt-3 px-3 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase"
          data-testid="button-corrigir-valores-aprovados"
        >
          Corrigir valores
        </button>
      )}

      {permissao.permitido && fase === 'edicao' && (
        <div className="mt-3 space-y-2">
          <label className="block text-[10px] font-black uppercase text-slate-500">
            Nova receita do serviço
            <input
              value={receita}
              onChange={(e) => setReceita(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              data-testid="input-reaprovacao-receita"
            />
          </label>
          <label className="block text-[10px] font-black uppercase text-slate-500">
            Novo custo do serviço
            <input
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              data-testid="input-reaprovacao-custo"
            />
          </label>
          <label className="block text-[10px] font-black uppercase text-slate-500">
            Justificativa
            <textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={2}
              className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              data-testid="input-reaprovacao-justificativa"
            />
          </label>
          <button
            type="button"
            onClick={() => { void pedirSenha(); }}
            disabled={enviando}
            className="px-3 py-2 rounded-lg bg-blue-700 text-white text-[10px] font-black uppercase disabled:opacity-40"
            data-testid="button-reaprovar"
          >
            Reaprovar
          </button>
        </div>
      )}

      <div className="mt-3" data-testid="reaprovacao-progresso">
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-blue-700" style={{ width: `${percentual}%` }} />
        </div>
        <p className="mt-1 text-[10px] font-bold text-slate-600">{percentual}%</p>
        <ul className="mt-1 space-y-0.5">
          {ETAPAS_REAPROVACAO.map((etapa) => (
            <li key={etapa} className={`text-[10px] ${etapas[etapa] ? 'text-emerald-700' : 'text-slate-400'}`}>
              {etapas[etapa] ? 'Concluída' : 'Pendente'} — {rotuloEtapa(etapa)}
            </li>
          ))}
        </ul>
      </div>
      {erro && <p className="mt-2 text-[11px] font-bold text-red-700" data-testid="reaprovacao-erro">{erro}</p>}

      {senhaAberta && (
        <div className="fixed inset-0 z-[130] bg-black/60 flex items-center justify-center p-4" data-testid="modal-senha-reaprovacao">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3">
            <h3 className="text-sm font-black uppercase text-slate-900">Reaprovar com senha</h3>
            <p className="text-[11px] text-slate-600">Digite a senha pessoal deste acesso. Ela não fica no histórico.</p>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              data-testid="input-senha-reaprovacao"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setSenhaAberta(false); setSenha(''); setCapturaDepois(''); }}
                className="px-3 py-2 text-[10px] font-black uppercase text-slate-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { void confirmar(); }}
                disabled={enviando || !senha.trim()}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase disabled:opacity-40"
                data-testid="button-confirmar-senha-reaprovacao"
              >
                {enviando ? 'Conferindo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
