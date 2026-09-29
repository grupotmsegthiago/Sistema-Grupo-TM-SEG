import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CampoFiltro, CampoPgr } from './ceva/CampoCliente';
import { AcessoCeva } from './ceva/AcessoCeva';
import { PessoasCeva } from './ceva/PessoasCeva';
import { PainelDiretoria } from './ceva/PainelDiretoria';
import { PainelAoVivo } from './ceva/PainelAoVivo';
import { TrocarSenhaCeva } from './ceva/TrocarSenhaCeva';
import { LogoCeva } from './ceva/LogoCeva';
import type { CampoFiltro as CampoFiltroNome } from '../lib/cevaPortal/camposCliente';
import { isoDeDataBrasil, mascaraDataBrasil, periodoMesAtualBrasil } from '../lib/cevaPortal/datas';
import { cabecalhosCeva, gravarSessaoCeva, lerSessaoCeva, limparSessaoCeva, type SessaoCeva } from '../lib/cevaPortal/sessaoCliente';
import { classeStatusSistema } from '../lib/cevaPortal/status';

type ReportRow = {
  os: string;
  status: string;
  dataInicio: string | null;
  dataFim: string | null;
  solicitante: string | null;
  quemAutorizou: string | null;
  servico: string | null;
  atendimentoPgr: string | null;
  contrato: string | null;
  operacao: string | null;
  tsp: string | null;
  placa: string | null;
  motorista: string | null;
  franquiaHora: string | null;
  franquiaKm: number | null;
  kmInicio: number | null;
  kmFim: number | null;
  kmRodado: number | null;
  kmExcedente: number | null;
  hrsTrabalhada: string | null;
  hrsExcedente: string | null;
  valorHrsExcedente: number | null;
  valorKmExcedente: number | null;
  valorAcionamento: number | null;
  valorTotal: number | null;
  pedagio: number | null;
  tarifaKm: number | null;
  tarifaHora: number | null;
  local: string | null;
  obs: string | null;
  financeiro: 'ENCONTRADO' | 'NÃO CARREGADO';
  valores?: 'APROVADO' | 'AGUARDANDO';
};

const CATALOGO_VAZIO: Record<CampoFiltroNome, string[]> = {
  solicitante: [],
  quemAutorizou: [],
  servico: [],
  contrato: [],
  operacao: [],
};

const CLIENT_HEAD = 'bg-slate-100 text-slate-600';
const SYSTEM_HEAD = 'bg-[#152c54] text-white';

function when(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function money(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function AguardandoConferencia() {
  return <span className="inline-flex whitespace-nowrap rounded-md bg-yellow-300 px-1.5 py-0.5 text-[10px] font-black text-red-700">Aguardando Conferência</span>;
}

function AguardandoValidacao() {
  return <span className="inline-flex whitespace-nowrap rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Aguardando validação</span>;
}

function celulaSistema(valor: string | number | null, texto: string) {
  if (valor == null || texto === '—') return <AguardandoConferencia />;
  return texto;
}

function celulaValor(item: ReportRow, value: number | null) {
  if (item.valores === 'AGUARDANDO') return <AguardandoValidacao />;
  if (value == null) return <AguardandoConferencia />;
  return money(value);
}

function qty(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR');
}

function text(value: string | null): string {
  return value || '—';
}

function maisNovaPrimeiro(a: ReportRow, b: ReportRow): number {
  const inicioA = a.dataInicio ? new Date(a.dataInicio).getTime() : 0;
  const inicioB = b.dataInicio ? new Date(b.dataInicio).getTime() : 0;
  if (inicioB !== inicioA) return inicioB - inicioA;
  return Number(b.os) - Number(a.os);
}

/** 1 na OS mais antiga. A próxima OS nova recebe o número seguinte. */
function numerosDeSolicitacao(rows: ReportRow[]): Map<string, number> {
  const daMaisAntiga = [...rows].sort((a, b) => maisNovaPrimeiro(b, a));
  return new Map(daMaisAntiga.map((row, index) => [row.os, index + 1]));
}

function diaBrasil(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function unicos(rows: ReportRow[], pick: (row: ReportRow) => string | null): string[] {
  const valores = new Set<string>();
  for (const row of rows) {
    const valor = (pick(row) || '').trim();
    if (valor) valores.add(valor);
  }
  return [...valores].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

type Filtros = {
  dataInicial: string;
  dataFinal: string;
  status: string;
  solicitante: string;
  quemAutorizou: string;
  servico: string;
  contrato: string;
  operacao: string;
  placa: string;
  motorista: string;
  local: string;
};

const FILTRO_VAZIO: Filtros = {
  dataInicial: '',
  dataFinal: '',
  status: '',
  solicitante: '',
  quemAutorizou: '',
  servico: '',
  contrato: '',
  operacao: '',
  placa: '',
  motorista: '',
  local: '',
};

function passaFiltro(row: ReportRow, filtro: Filtros): boolean {
  const dia = diaBrasil(row.dataInicio);
  const inicio = isoDeDataBrasil(filtro.dataInicial);
  const fim = isoDeDataBrasil(filtro.dataFinal);
  if (inicio && (!dia || dia < inicio)) return false;
  if (fim && (!dia || dia > fim)) return false;
  if (filtro.status && row.status !== filtro.status) return false;
  if (filtro.solicitante && row.solicitante !== filtro.solicitante) return false;
  if (filtro.quemAutorizou && row.quemAutorizou !== filtro.quemAutorizou) return false;
  if (filtro.servico && row.servico !== filtro.servico) return false;
  if (filtro.contrato && row.contrato !== filtro.contrato) return false;
  if (filtro.operacao && row.operacao !== filtro.operacao) return false;
  if (filtro.placa && row.placa !== filtro.placa) return false;
  if (filtro.motorista && row.motorista !== filtro.motorista) return false;
  if (filtro.local && !(row.local || '').toLocaleLowerCase('pt-BR').includes(filtro.local.trim().toLocaleLowerCase('pt-BR'))) return false;
  return true;
}

const POR_TELA = [10, 20, 50, 100] as const;

const CAMPO_FILTRO = 'inline-flex items-center gap-2 whitespace-nowrap text-[11px] font-bold text-slate-500';
const CONTROLE_FILTRO = 'h-8 rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-800 outline-none focus:border-[#152c54] focus:bg-white';
const LINHA_FILTRO = 'flex flex-nowrap items-center gap-3 overflow-x-auto px-4 py-3';

const CevaPortal: React.FC = () => {
  const [items, setItems] = useState<ReportRow[]>([]);
  const [catalogo, setCatalogo] = useState(CATALOGO_VAZIO);
  const [total, setTotal] = useState(0);
  const [sessao, setSessao] = useState<SessaoCeva | null>(() => lerSessaoCeva());
  const [pessoasAberto, setPessoasAberto] = useState(false);
  const [visao, setVisao] = useState<'controle' | 'diretoria' | 'aovivo'>('controle');
  const [loading, setLoading] = useState(() => Boolean(lerSessaoCeva()));
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<Filtros>(FILTRO_VAZIO);
  const [porTela, setPorTela] = useState<(typeof POR_TELA)[number]>(20);
  const [pagina, setPagina] = useState(1);
  const tabelaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sair = () => {
      limparSessaoCeva();
      setSessao(null);
      setPessoasAberto(false);
      setItems([]);
    };
    window.addEventListener('ceva-portal-sair', sair);
    return () => window.removeEventListener('ceva-portal-sair', sair);
  }, []);

  useEffect(() => {
    if (!sessao || sessao.user.trocarSenha) return;
    let ativo = true;
    setLoading(true);
    setError('');
    fetch('/api/ceva-portal/relatorio', { headers: cabecalhosCeva() })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
          limparSessaoCeva();
          if (ativo) setSessao(null);
          return;
        }
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o relatório.');
        if (!ativo) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setCatalogo({ ...CATALOGO_VAZIO, ...(data.catalogo || {}) });
        setTotal(Number(data.total) || 0);
      })
      .catch((err: Error) => { if (ativo) setError(err.message || 'Falha de comunicação.'); })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [sessao]);

  const linhas = [...items].sort(maisNovaPrimeiro);
  const visiveis = linhas.filter((row) => passaFiltro(row, filtro));
  const paginas = Math.max(1, Math.ceil(visiveis.length / porTela));
  const paginaAtual = Math.min(pagina, paginas);
  const inicio = (paginaAtual - 1) * porTela;
  const tela = visiveis.slice(inicio, inicio + porTela);
  const solicitacao = numerosDeSolicitacao(items);
  const filtroAtivo = Object.values(filtro).some((valor) => valor.trim() !== '');
  const opcoes = {
    status: unicos(items, (row) => row.status),
    solicitante: unicos(items, (row) => row.solicitante),
    quemAutorizou: unicos(items, (row) => row.quemAutorizou),
    servico: unicos(items, (row) => row.servico),
    contrato: unicos(items, (row) => row.contrato),
    operacao: unicos(items, (row) => row.operacao),
    placa: unicos(items, (row) => row.placa),
    motorista: unicos(items, (row) => row.motorista),
  };

  function abrirDiretoria() {
    const mes = periodoMesAtualBrasil();
    setFiltro((atual) => ({ ...atual, dataInicial: mes.inicio, dataFinal: mes.fim }));
    setPagina(1);
    setVisao('diretoria');
  }

  function mudarFiltro(campo: keyof Filtros, valor: string) {
    setFiltro((atual) => ({ ...atual, [campo]: valor }));
    setPagina(1);
  }

  function irPara(proxima: number) {
    setPagina(Math.min(paginas, Math.max(1, proxima)));
    tabelaRef.current?.scrollTo({ top: 0 });
  }

  function atualizarCampo(os: string, campo: CampoFiltroNome | 'atendimentoPgr', valor: string | null, filtroNovo: string | null = null) {
    setItems((atual) => atual.map((item) => item.os === os ? { ...item, [campo]: valor } : item));
    if (filtroNovo && campo !== 'atendimentoPgr') {
      setCatalogo((atual) => atual[campo].includes(filtroNovo) ? atual : { ...atual, [campo]: [...atual[campo], filtroNovo].sort((a, b) => a.localeCompare(b, 'pt-BR')) });
    }
  }

  if (!sessao) {
    return <AcessoCeva onEntrar={(proxima) => { setSessao(proxima); setLoading(true); setError(''); }} />;
  }

  if (sessao.user.trocarSenha) {
    return (
      <TrocarSenhaCeva
        onTrocou={(proxima) => { gravarSessaoCeva(proxima); setSessao(proxima); setLoading(true); }}
        onSair={() => { setSessao(null); setItems([]); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f3ef]">
      <header className="bg-[#152c54] text-white">
        <div className="grid items-center gap-3 px-4 py-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-3">
            <span className="inline-flex rounded-xl bg-white px-2.5 py-1">
              <LogoCeva />
            </span>
            <h1 className="text-xl font-black">Controle de Escolta</h1>
          </div>
          <nav className="flex justify-center">
            <div className="flex rounded-full bg-white/10 p-0.5">
              <button type="button" onClick={() => setVisao('controle')} className={`h-8 rounded-full px-3 text-xs font-bold ${visao === 'controle' ? 'bg-white text-[#152c54]' : 'text-white'}`}>Controle</button>
              <button type="button" onClick={() => setVisao('aovivo')} className={`h-8 rounded-full px-3 text-xs font-bold ${visao === 'aovivo' ? 'bg-white text-[#152c54]' : 'text-white'}`}>Ao vivo</button>
              <button type="button" onClick={abrirDiretoria} className={`h-8 rounded-full px-3 text-xs font-bold ${visao === 'diretoria' ? 'bg-white text-[#152c54]' : 'text-white'}`}>Diretoria</button>
            </div>
          </nav>
          <div className="flex items-center justify-end gap-2">
            <p className="text-right text-xs">
              <span className="block font-bold">{sessao.user.name}</span>
              <span className="capitalize text-slate-300">{sessao.user.perfil}</span>
            </p>
            {sessao.user.perfil === 'administrador' && (
              <button type="button" onClick={() => setPessoasAberto((aberto) => !aberto)} className="h-8 rounded-full border border-white/40 px-3 text-xs font-bold">Pessoas</button>
            )}
            <button type="button" onClick={() => { limparSessaoCeva(); setSessao(null); setPessoasAberto(false); setItems([]); }} className="h-8 rounded-full border border-white/40 px-3 text-xs font-bold">Sair</button>
          </div>
        </div>
      </header>
      <main className="p-4 md:p-6">
        {pessoasAberto && sessao.user.perfil === 'administrador' && <PessoasCeva onFechar={() => setPessoasAberto(false)} />}
        {visao !== 'aovivo' && loading && (
          <p className="inline-flex items-center gap-2 rounded-3xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm"><Loader2 className="animate-spin" size={16} /> Carregando relatório...</p>
        )}
        {visao !== 'aovivo' && error && <p className="rounded-3xl bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">{error}</p>}
        {visao === 'aovivo' && <PainelAoVivo />}
        {visao !== 'aovivo' && !loading && !error && (
          <div className="mb-4 rounded-3xl bg-white shadow-sm">
            <div className={`${LINHA_FILTRO} border-b border-slate-100`}>
              <p className="inline-flex items-center gap-2 rounded-full bg-[#152c54] px-3 py-1 text-xs font-bold text-white">
                {visiveis.length.toLocaleString('pt-BR')}{visiveis.length !== total ? ` de ${total.toLocaleString('pt-BR')}` : ''} OS
                {visiveis.length > 0 ? <span className="font-semibold text-slate-300">{inicio + 1}–{inicio + tela.length}</span> : null}
              </p>
              <label className={CAMPO_FILTRO}>Por tela
                <select value={porTela} onChange={(event) => { setPorTela(Number(event.target.value) as (typeof POR_TELA)[number]); setPagina(1); }} className={CONTROLE_FILTRO}>
                  {POR_TELA.map((quantidade) => <option key={quantidade} value={quantidade}>{quantidade}</option>)}
                </select>
              </label>
              <label className={CAMPO_FILTRO}>Data inicial
                <input value={filtro.dataInicial} inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} onChange={(event) => mudarFiltro('dataInicial', mascaraDataBrasil(event.target.value))} className={`${CONTROLE_FILTRO} w-[108px]`} />
              </label>
              <span className="text-xs font-bold text-slate-400">x</span>
              <label className={CAMPO_FILTRO}>Data final
                <input value={filtro.dataFinal} inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} onChange={(event) => mudarFiltro('dataFinal', mascaraDataBrasil(event.target.value))} className={`${CONTROLE_FILTRO} w-[108px]`} />
              </label>
              {([
                ['status', 'Status', opcoes.status],
                ['servico', 'Serviço', opcoes.servico],
              ] as const).map(([campo, rotulo, lista]) => (
                <label key={campo} className={CAMPO_FILTRO}>{rotulo}
                  <select value={filtro[campo]} onChange={(event) => mudarFiltro(campo, event.target.value)} className={CONTROLE_FILTRO}>
                    <option value="">Todos</option>
                    {lista.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              ))}
              {filtroAtivo && (
                <button type="button" onClick={() => { setFiltro(FILTRO_VAZIO); setPagina(1); }} className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-[#152c54]">Limpar</button>
              )}
            </div>
            <div className={LINHA_FILTRO}>
              {([
                ['solicitante', 'Solicitante', opcoes.solicitante],
                ['quemAutorizou', 'Quem autorizou', opcoes.quemAutorizou],
                ['contrato', 'Contrato', opcoes.contrato],
                ['operacao', 'Operação', opcoes.operacao],
                ['placa', 'Placa', opcoes.placa],
                ['motorista', 'Motorista', opcoes.motorista],
              ] as const).map(([campo, rotulo, lista]) => (
                <label key={campo} className={CAMPO_FILTRO}>{rotulo}
                  <select value={filtro[campo]} onChange={(event) => mudarFiltro(campo, event.target.value)} className={`${CONTROLE_FILTRO} max-w-[160px]`}>
                    <option value="">Todos</option>
                    {lista.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              ))}
              <label className={CAMPO_FILTRO}>Local
                <input value={filtro.local} onChange={(event) => mudarFiltro('local', event.target.value)} placeholder="Cidade" className={`${CONTROLE_FILTRO} w-36`} />
              </label>
            </div>
          </div>
        )}
        {sessao && !loading && !error && visao === 'diretoria' && <PainelDiretoria linhas={visiveis} />}
        {sessao && !loading && !error && visao === 'controle' && (
          <div ref={tabelaRef} className="max-h-[calc(100vh-280px)] overflow-auto rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/80">
            <table className="min-w-[2600px] border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className={`${SYSTEM_HEAD} px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em]`} colSpan={2}>OS</th>
                  <th className={`${CLIENT_HEAD} px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em]`} colSpan={14}>Cliente</th>
                  <th className={`${SYSTEM_HEAD} px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em]`} colSpan={15}>Sistema</th>
                </tr>
                <tr className="text-left">
                  {['OS', 'Status', 'Nº solicitação', 'Data início', 'Data fim', 'Solicitante', 'Quem autorizou', 'Serviço', 'Atendimento PGR', 'Contrato', 'Operação', 'TSP', 'Placa', 'Motorista', 'Franquia hora', 'Franquia km', 'Km início', 'Km fim', 'Km rodado', 'Km excedente', 'Horas trabalhadas', 'Horas excedentes', 'R$ horas excedentes', 'R$ km excedente', 'R$ acionamento', 'R$ total', 'Pedágio', 'R$ km excedente (tarifa)', 'R$ hora excedente (tarifa)', 'Local', 'Obs'].map((label, index) => (
                    <th key={label} className={`whitespace-nowrap border-b border-slate-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wide ${index === 0 ? 'sticky left-0 z-30' : ''} ${index <= 1 || index >= 16 ? SYSTEM_HEAD : CLIENT_HEAD}`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tela.length === 0 && (
                  <tr>
                    <td colSpan={31} className="px-4 py-10 text-center text-sm text-slate-500">Nenhuma OS neste recorte.</td>
                  </tr>
                )}
                {tela.map((item, index) => {
                  const fundo = index % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                  const celula = `border-b border-slate-100 px-3 py-2.5 ${fundo} text-slate-700`;
                  const valorCls = `${celula} whitespace-nowrap tabular-nums`;
                  return (
                  <tr key={item.os} className="transition-colors hover:bg-slate-100/80">
                    <td className={`${celula} sticky left-0 z-10 font-black whitespace-nowrap shadow-[6px_0_10px_-8px_rgba(15,23,42,0.45)] text-[#152c54] ${fundo}`}>{item.os}</td>
                    <td className={`${celula} whitespace-nowrap`}>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${classeStatusSistema(item.status)}`}>
                        {text(item.status)}
                      </span>
                    </td>
                    <td className={`${celula} font-bold`}>{solicitacao.get(item.os)}</td>
                    <td className={`${celula} whitespace-nowrap`}>{when(item.dataInicio)}</td>
                    <td className={`${celula} whitespace-nowrap`}>{when(item.dataFim)}</td>
                    <td className={`${celula} whitespace-nowrap`}><CampoFiltro os={item.os} campo="solicitante" valor={item.solicitante} opcoes={catalogo.solicitante} onChange={(valor, filtro) => atualizarCampo(item.os, 'solicitante', valor, filtro)} /></td>
                    <td className={`${celula} whitespace-nowrap`}><CampoFiltro os={item.os} campo="quemAutorizou" valor={item.quemAutorizou} opcoes={catalogo.quemAutorizou} onChange={(valor, filtro) => atualizarCampo(item.os, 'quemAutorizou', valor, filtro)} /></td>
                    <td className={`${celula} whitespace-nowrap`}><CampoFiltro os={item.os} campo="servico" valor={item.servico} opcoes={catalogo.servico} onChange={(valor, filtro) => atualizarCampo(item.os, 'servico', valor, filtro)} /></td>
                    <td className={`${celula} whitespace-nowrap`}><CampoPgr os={item.os} valor={item.atendimentoPgr} onChange={(valor) => atualizarCampo(item.os, 'atendimentoPgr', valor)} /></td>
                    <td className={`${celula} whitespace-nowrap`}><CampoFiltro os={item.os} campo="contrato" valor={item.contrato} opcoes={catalogo.contrato} onChange={(valor, filtro) => atualizarCampo(item.os, 'contrato', valor, filtro)} /></td>
                    <td className={`${celula} whitespace-nowrap`}><CampoFiltro os={item.os} campo="operacao" valor={item.operacao} opcoes={catalogo.operacao} onChange={(valor, filtro) => atualizarCampo(item.os, 'operacao', valor, filtro)} /></td>
                    <td className={celula}>{text(item.tsp)}</td>
                    <td className={`${celula} whitespace-nowrap font-semibold`}>{text(item.placa)}</td>
                    <td className={`${celula} whitespace-nowrap`}>{text(item.motorista)}</td>
                    <td className={celula}>{text(item.franquiaHora)}</td>
                    <td className={celula}>{qty(item.franquiaKm)}</td>
                    <td className={celula}>{celulaSistema(item.kmInicio, qty(item.kmInicio))}</td>
                    <td className={celula}>{celulaSistema(item.kmFim, qty(item.kmFim))}</td>
                    <td className={celula}>{celulaSistema(item.kmRodado, qty(item.kmRodado))}</td>
                    <td className={celula}>{celulaSistema(item.kmExcedente, qty(item.kmExcedente))}</td>
                    <td className={celula}>{celulaSistema(item.hrsTrabalhada, text(item.hrsTrabalhada))}</td>
                    <td className={celula}>{celulaSistema(item.hrsExcedente, text(item.hrsExcedente))}</td>
                    <td className={valorCls}>{celulaValor(item, item.valorHrsExcedente)}</td>
                    <td className={valorCls}>{celulaValor(item, item.valorKmExcedente)}</td>
                    <td className={valorCls}>{celulaValor(item, item.valorAcionamento)}</td>
                    <td className={`${valorCls} ${item.valores === 'APROVADO' ? 'font-black text-[#152c54]' : ''}`}>{celulaValor(item, item.valorTotal)}</td>
                    <td className={valorCls}>{celulaValor(item, item.pedagio)}</td>
                    <td className={valorCls}>{celulaValor(item, item.tarifaKm)}</td>
                    <td className={valorCls}>{celulaValor(item, item.tarifaHora)}</td>
                    <td className={`${celula} max-w-[280px] truncate`} title={item.local || ''}>{celulaSistema(item.local, text(item.local))}</td>
                    <td className={celula}>{item.valores === 'APROVADO' && item.valorTotal != null ? (item.obs || '') : celulaSistema(item.obs, text(item.obs))}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {sessao && !loading && !error && visao === 'controle' && visiveis.length > 0 && (
          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-600">
            <button type="button" disabled={paginaAtual <= 1} onClick={() => irPara(paginaAtual - 1)} className="h-9 rounded-full bg-white px-4 shadow-sm disabled:opacity-40">Anterior</button>
            <span className="px-2">Página {paginaAtual} de {paginas}</span>
            <button type="button" disabled={paginaAtual >= paginas} onClick={() => irPara(paginaAtual + 1)} className="h-9 rounded-full bg-[#152c54] px-4 text-white shadow-sm disabled:opacity-40">Próxima</button>
          </div>
        )}
      </main>
    </div>
  );
};

export default CevaPortal;
