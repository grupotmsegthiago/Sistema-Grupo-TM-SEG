import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeDollarSign, Filter, Loader2, Receipt,
  Wallet, X, Landmark, FileSpreadsheet, RefreshCw, ChevronDown, ChevronUp, ChevronRight,
  TrendingUp, Percent, Briefcase, CircleDollarSign, Gift, ClipboardList,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateTimeBR, formatNowDateTimeBR } from '../lib/dateUtils';
import { authFetch } from '../lib/authFetch';
import { useNotification } from '../lib/NotificationContext';
import { fetchAllPages } from '../lib/supabasePaging';
import {
  COMISSAO_STATUS_LABEL,
  type ComissaoStatus,
} from '../lib/comissao/comissaoCalc';
import { garantirFormaPixEComprovante, lancarPagamentoComissao, registrarPagamentoComissao } from '../lib/comissao/comissaoService';
import { isFinanceProfileRole } from '../lib/financeSupervisorAccess';
import { comprovantesJaGravados, decidirComprovante } from '../lib/financial/avisoComprovante';
import { sincronizarComerciaisDeUsuarios } from '../lib/comissao/comissaoUsuarios';
import {
  anosFiltroComissao,
  aplicarPisoComissaoQuadro,
  carregarQuadroTmSeg,
  chaveLinhaQuadro,
  mesclarLinhasQuadro,
  mesclarOsSemFaturaNoQuadro,
  quadroDeComissoesTorres,
  resolverPeriodoInicialFaturas,
  somarQuadro,
  type LinhaQuadroCliente,
} from '../lib/comissao/quadroFaturamentoComissao';
import { carregarCoberturaOsPeriodo, coberturaVazia, type CoberturaOsPeriodo } from '../lib/comissao/coberturaOsPeriodo';
import {
  acharComissaoDaFatura,
  montarApuracaoPorComercial,
  montarKpisDashboard,
  montarClientesDashboard,
  montarQuadrosFuncionarios,
  type QuadroFuncionario,
  type StatusPagamentoPar,
} from '../lib/comissao/dashboardComissoes';
import type { LinhaTempoCliente } from '../lib/comissao/linhaTempoComissao';
import {
  gerarLinhasTabelaReferencia,
  TABELA_COMISSAO_PADRAO,
  ordenarComissoesLiberadasPrimeiro,
  somarListaComissao,
  valorColunaPagamentoComissao,
  valorComissaoLinhaAposPiso,
} from '../lib/comissao/tabelaComissaoPadrao';
import { filtrarLinhasAposCadastro, lancamentoAposCadastro } from '../lib/comissao/dataInicioComissao';
import {
  comissaoDuplicadaNoPeriodo,
  decorarComissaoTorres,
  linhaNaQuinzenaComissao,
  resumoLocal,
  type DecoracaoComissao,
  type RotaMissaoComissao,
} from '../lib/comissao/rotaMissaoComissao';
import { comissaoSomentePropria } from '../lib/diretoriaAccess';
import { carregarNomesClientesDoComercial } from '../lib/comercialEscopo';
import {
  intervaloQuinzena,
  labelQuinzena,
  montarCsvRelatorioComissoes,
  nomeArquivoRelatorioComissoes,
  quinzenaDeDataFaturamento,
  type QuinzenaFiltro,
} from '../lib/comercial/tabelaPrecosRegionais';

type Comercial = {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  pix_chave?: string | null;
  ativo?: boolean;
  usuario_id?: number | null;
  valor_fixo?: number | null;
  tabela_comissao_codigo?: string | null;
};

type EmpresaOrigem = 'TM_SEG' | 'TORRES';

type ComissaoRow = {
  id: string;
  fatura_id: string | null;
  origem_fatura_id?: string | null;
  fatura_numero: string | null;
  empresa_origem?: EmpresaOrigem | string | null;
  cliente_id: number | null;
  cliente_origem_id?: number | null;
  cliente_nome: string | null;
  comercial_id: string;
  valor_faturamento: number;
  percentual_imposto_aplicado: number;
  valor_base_liquida: number;
  percentual_comissao_aplicado: number;
  valor_comissao: number;
  status: ComissaoStatus;
  data_faturamento: string | null;
  data_recebimento_cliente: string | null;
  data_pagamento_comissao: string | null;
  pago_em?: string | null;
  conta_pagar_id?: string | null;
  comprovante_url: string | null;
  comerciais?: { nome?: string | null; pix_chave?: string | null } | null;
};

function empresaLabel(empresa?: string | null): string {
  return String(empresa || '').toUpperCase() === 'TORRES' ? 'TORRES' : 'TM SEG';
}

function LogoEmpresa({ empresa }: { empresa?: string | null }) {
  const torres = String(empresa || '').toUpperCase() === 'TORRES';
  return (
    <img
      src={torres ? '/logo-torres.jpeg' : '/logo-tm.svg'}
      alt={torres ? 'Torres' : 'TM SEG'}
      title={empresaLabel(empresa)}
      className={`h-10 w-auto object-contain ${torres ? 'max-w-[76px]' : 'max-w-[92px]'}`}
      data-testid={torres ? 'logo-empresa-torres' : 'logo-empresa-tm'}
    />
  );
}

function fmtBRL(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  if (!y || !m || !day) return s;
  return `${day}/${m}/${y}`;
}

function labelMesAno(ym: string): string {
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const [y, m] = String(ym).split('-');
  const i = Number(m) - 1;
  return `${nomes[i] || m}/${y}`;
}

function clsEtapaLinhaTempo(estado: LinhaTempoCliente['etapas'][number]['estado']): string {
  if (estado === 'FEITO') return 'bg-green-50 text-green-800 border-green-200';
  if (estado === 'ATUAL') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-gray-50 text-gray-400 border-gray-200';
}

function LinhaTempoClienteView({
  linha,
  cliente,
}: {
  linha: LinhaTempoCliente;
  cliente: string;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-1" data-testid={`linha-tempo-cliente-${cliente}`}>
      {linha.etapas.map((e, i) => (
        <li key={e.id} className="flex items-center gap-1">
          {i > 0 ? <span className="text-[10px] text-slate-300 font-black" aria-hidden>›</span> : null}
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${clsEtapaLinhaTempo(e.estado)}`}>
            {e.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function labelPagamento(status: StatusPagamentoPar): { texto: string; cls: string } {
  if (status === 'PAGO') return { texto: 'Fechado', cls: 'bg-green-50 text-green-800 border-green-200' };
  if (status === 'PARCIAL') return { texto: 'Parcial', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { texto: 'Em aberto', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
}

const STATUS_BADGE: Record<ComissaoStatus, string> = {
  AGUARDANDO_PAGAMENTO_CLIENTE: 'bg-amber-50 text-amber-800 border-amber-200',
  LIBERADO_PARA_PAGAMENTO: 'bg-blue-50 text-blue-800 border-blue-200',
  PAGO: 'bg-green-50 text-green-800 border-green-200',
  CANCELADO: 'bg-gray-100 text-gray-500 border-gray-200',
};

function fmtHistoricoPagamento(pagoEm?: string | null, data?: string | null): string {
  if (pagoEm) return formatDateTimeBR(pagoEm);
  if (data) return fmtDate(data);
  return '—';
}

function TrocaNfComissao({
  row,
  pode,
  onTrocar,
}: {
  row: ComissaoRow;
  pode: boolean;
  onTrocar: (id: string, faturaNumero: string) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [numero, setNumero] = useState(String(row.fatura_numero || ''));
  const [salvando, setSalvando] = useState(false);
  if (!pode) return null;
  if (String(row.empresa_origem || '').toUpperCase() !== 'TORRES') return null;
  if (row.status === 'PAGO' || row.conta_pagar_id) return null;
  if (!aberto) {
    return (
      <button
        type="button"
        className="mt-1 text-[10px] font-black uppercase text-slate-600 underline"
        data-testid={`btn-trocar-fatura-${row.id}`}
        onClick={() => {
          setNumero(String(row.fatura_numero || ''));
          setAberto(true);
        }}
      >
        Trocar NF
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex flex-col gap-1"
      onSubmit={async (event) => {
        event.preventDefault();
        setSalvando(true);
        try {
          await onTrocar(row.id, numero);
          setAberto(false);
        } catch {
          /* o aviso fica na página */
        } finally {
          setSalvando(false);
        }
      }}
    >
      <input
        value={numero}
        onChange={(event) => setNumero(event.target.value)}
        className="w-28 border rounded px-1 py-0.5 text-[10px] font-bold"
        placeholder="Nº da fatura"
        data-testid={`input-trocar-fatura-${row.id}`}
      />
      <button
        type="submit"
        disabled={salvando || !numero.trim()}
        className="text-[10px] font-black uppercase text-white bg-slate-800 rounded px-1 py-0.5 disabled:opacity-50"
        data-testid={`btn-salvar-fatura-${row.id}`}
      >
        {salvando ? 'Puxando…' : 'Puxar da TORRES'}
      </button>
    </form>
  );
}

function BlocoListaComissao({
  titulo,
  testId,
  vazio,
  rows,
  soma,
  comissaoLinha,
  onLancar,
  lancandoId,
  onPagar,
  perfilFinanceiro,
  comprovantePorComissao,
  comprovantesCompletos,
  decorar,
  podeTrocarNf,
  onTrocarFatura,
}: {
  titulo: string;
  testId: string;
  vazio: string;
  rows: ComissaoRow[];
  soma: { comissao: number; aPagar: number };
  comissaoLinha: (r: ComissaoRow) => { valor: number; percentual: number; abaixoDoPiso: boolean };
  onLancar: (r: ComissaoRow) => void;
  lancandoId: string | null;
  onPagar: (r: ComissaoRow) => void;
  perfilFinanceiro: boolean;
  comprovantePorComissao: Record<string, string>;
  comprovantesCompletos: boolean;
  decorar: (r: ComissaoRow) => DecoracaoComissao;
  podeTrocarNf: boolean;
  onTrocarFatura: (id: string, faturaNumero: string) => Promise<void>;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid={testId}>
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-black uppercase text-gray-800">{titulo}</h3>
          <p className="text-[10px] text-gray-400 font-bold">{rows.length} lançamento(s)</p>
        </div>
        <div className="flex flex-wrap gap-4 text-right">
          <div>
            <div className="text-[9px] font-black uppercase text-gray-400">Valor da comissão</div>
            <div className="text-sm font-black text-gray-900" data-testid={`${testId}-soma-comissao`}>{fmtBRL(soma.comissao)}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase text-gray-400">Valor a pagar</div>
            <div className="text-sm font-black text-blue-800" data-testid={`${testId}-soma-a-pagar`}>{fmtBRL(soma.aPagar)}</div>
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">{vazio}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
                <th className="text-left px-3 py-2">Empresa</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">NF / OS</th>
                <th className="text-left px-3 py-2">Fechamento</th>
                <th className="text-right px-3 py-2">Faturamento</th>
                <th className="text-right px-3 py-2">Imposto %</th>
                <th className="text-right px-3 py-2">Lucro base</th>
                <th className="text-right px-3 py-2">% Comissão</th>
                <th className="text-right px-3 py-2">Vlr. comissão</th>
                <th className="text-right px-3 py-2">A pagar</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-center px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const linhaPiso = comissaoLinha(r);
                const aPagar = valorColunaPagamentoComissao(r.status, linhaPiso.valor, linhaPiso.abaixoDoPiso);
                const pago = r.status === 'PAGO';
                const comprovante = decidirComprovante({
                  exige: comprovantesCompletos && (pago || r.status === 'LIBERADO_PARA_PAGAMENTO'),
                  urls: [r.comprovante_url, comprovantePorComissao[r.id]],
                  perfilFinanceiro,
                });
                const rota = decorar(r);
                const dataMissao = rota.datasMissao[0] || null;
                const dataQuinzena = dataMissao || r.data_faturamento;
                const missaoConcluidaNaTela = rota.concluida && (rota.substituida || !!rota.jaNaFatura);
                return (
                  <tr key={r.id} className={`border-t border-gray-50 ${pago ? 'bg-green-50/40' : aPagar != null ? 'bg-blue-50/60' : ''}`} data-testid={`comissao-row-${r.id}`}>
                    <td className="px-3 py-2"><LogoEmpresa empresa={r.empresa_origem} /></td>
                    <td className="px-3 py-2">
                      <div className="font-bold text-gray-900 uppercase text-xs">{r.cliente_nome || '—'}</div>
                      <div className="text-[10px] text-gray-400">{r.comerciais?.nome || '—'}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <div>{r.fatura_numero || r.fatura_id?.slice(0, 8) || '—'}</div>
                      <TrocaNfComissao row={r} pode={podeTrocarNf} onTrocar={onTrocarFatura} />
                      {rota.os.map((os) => (
                        <div key={os.osId} className="mt-1 font-sans" data-testid={`rota-os-${r.id}-${os.osId}`}>
                          <div className="font-black text-gray-800">OS {os.osNumero}</div>
                          <div className="text-[10px] font-bold text-gray-500 normal-case" title={`${os.origem || ''} → ${os.destino || ''}`}>
                            {resumoLocal(os.origem) || '—'} → {resumoLocal(os.destino) || '—'}
                          </div>
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-[10px] font-bold text-gray-600">
                      {rota.os.length > 0 ? rota.os.map((os) => (
                        <div key={`data-${os.osId}`}>{fmtDate(os.dataMissao)}</div>
                      )) : <div>{fmtDate(r.data_faturamento)}</div>}
                      <div className="text-gray-400 uppercase">{labelQuinzena(quinzenaDeDataFaturamento(dataQuinzena))}</div>
                      {dataMissao && dataMissao !== String(r.data_faturamento || '').slice(0, 10) && (
                        <div className="text-[9px] font-bold text-amber-700 normal-case">Fatura lançada em {fmtDate(r.data_faturamento)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(Number(r.valor_faturamento))}</td>
                    <td className="px-3 py-2 text-right">{Number(r.percentual_imposto_aplicado).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(Number(r.valor_base_liquida))}</td>
                    <td className="px-3 py-2 text-right">{linhaPiso.percentual.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-black">
                      {fmtBRL(linhaPiso.valor)}
                      {linhaPiso.abaixoDoPiso && (
                        <div className="text-[9px] font-bold text-amber-700 uppercase">Abaixo do piso</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-black text-blue-800" data-testid={`comissao-a-pagar-${r.id}`}>
                      {aPagar == null ? '—' : fmtBRL(aPagar)}
                    </td>
                    <td className="px-3 py-2">
                      {missaoConcluidaNaTela ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border bg-green-50 text-green-800 border-green-200" data-testid={`status-missao-${r.id}`}>
                          Concluída
                        </span>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${STATUS_BADGE[r.status]}`}>
                          {COMISSAO_STATUS_LABEL[r.status]}
                        </span>
                      )}
                      {rota.substituida && (
                        <div className="mt-1 text-[10px] font-bold text-gray-500 normal-case max-w-[220px]" data-testid={`aviso-fatura-substituida-${r.id}`}>
                          A fatura {r.fatura_numero} foi cancelada na TORRES. A missão está concluída e a comissão fica na fatura {rota.faturaViva}.
                        </div>
                      )}
                      {rota.jaNaFatura && (
                        <div className="mt-1 text-[10px] font-bold text-gray-500 normal-case" data-testid={`aviso-os-na-fatura-${r.id}`}>
                          Esta OS já entrou na fatura {rota.jaNaFatura}.
                        </div>
                      )}
                      {pago && (
                        <div className="mt-1 text-[10px] font-bold text-green-800" data-testid={`comissao-pago-em-${r.id}`}>
                          {fmtHistoricoPagamento(r.pago_em, r.data_pagamento_comissao)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                      {r.status === 'LIBERADO_PARA_PAGAMENTO' && !linhaPiso.abaixoDoPiso && !r.conta_pagar_id && (
                        <button type="button" disabled={lancandoId === r.id} onClick={() => onLancar(r)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase disabled:opacity-50" data-testid={`btn-lancar-pagamento-${r.id}`}>
                          {lancandoId === r.id ? <Loader2 size={12} className="animate-spin" /> : <CircleDollarSign size={12} />}
                          {lancandoId === r.id ? 'Lançando…' : (String(r.empresa_origem || '').toUpperCase() === 'TORRES' ? 'Lançar na TORRES' : 'Lançar pagamento')}
                        </button>
                      )}
                      {r.status === 'LIBERADO_PARA_PAGAMENTO' && !linhaPiso.abaixoDoPiso && !!r.conta_pagar_id && (
                        <button type="button" onClick={() => onPagar(r)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase" data-testid={`btn-pagar-${r.id}`}>
                          <Wallet size={12} /> Pagar comissão
                        </button>
                      )}
                      {comprovante.link && (
                        <a href={comprovante.link} target="_blank" rel="noreferrer" title="Comprovante do pagamento do cliente" className="text-[10px] font-black text-emerald-800 underline uppercase inline-flex items-center gap-1" data-testid={`link-comprovante-comissao-${r.id}`}>
                          <Receipt size={12} /> Comprovante
                        </a>
                      )}
                      {comprovante.avisarFalta && (
                        <div className="text-[10px] font-black text-amber-700 uppercase" data-testid={`aviso-comprovante-comissao-${r.id}`}>
                          Falta anexar o comprovante
                        </div>
                      )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Sparkline({ tone }: { tone: 'white' | 'muted' }) {
  const stroke = tone === 'white' ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.18)';
  return (
    <svg className="absolute right-2 bottom-2 w-24 h-10 pointer-events-none" viewBox="0 0 96 40" fill="none" aria-hidden>
      <path d="M0 28 C12 28 14 12 24 16 C34 20 38 8 48 12 C58 16 62 6 72 10 C82 14 86 22 96 18" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

function KpiTile({
  label, value, sub, tone, icon: Icon, testid,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'blue' | 'amber' | 'green' | 'rose' | 'sky' | 'lime' | 'emerald' | 'peach';
  icon: React.ComponentType<{ size?: number; className?: string }>;
  testid?: string;
}) {
  const solid = tone === 'blue' || tone === 'amber' || tone === 'green' || tone === 'rose';
  const box: Record<string, string> = {
    blue: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white',
    amber: 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white',
    green: 'bg-gradient-to-br from-emerald-400 to-green-500 text-white',
    rose: 'bg-gradient-to-br from-rose-400 to-rose-500 text-white',
    sky: 'bg-gradient-to-br from-sky-50 to-blue-50 text-slate-800 border border-sky-100',
    lime: 'bg-gradient-to-br from-lime-50 to-green-50 text-slate-800 border border-lime-100',
    emerald: 'bg-gradient-to-br from-emerald-50 to-teal-50 text-slate-800 border border-emerald-100',
    peach: 'bg-gradient-to-br from-orange-50 to-rose-50 text-slate-800 border border-orange-100',
  };
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 min-h-[104px] ${box[tone]}`} data-testid={testid}>
      <Sparkline tone={solid ? 'white' : 'muted'} />
      <div className="flex items-start justify-between gap-2 relative z-10">
        <p className={`text-[10px] font-black uppercase tracking-wide ${solid ? 'text-white/80' : 'text-slate-500'}`}>{label}</p>
        <Icon size={16} className={solid ? 'opacity-80' : 'text-slate-400'} />
      </div>
      <p className="text-xl font-black mt-2 relative z-10 tracking-tight">{value}</p>
      {sub ? <p className={`text-[10px] font-bold mt-1 relative z-10 ${solid ? 'text-white/75' : 'text-slate-500'}`}>{sub}</p> : null}
    </div>
  );
}

function TabelaQuadroEmpresa({
  titulo,
  linhas,
  rows,
  cobertura,
  vazio,
  testid,
}: {
  titulo: string;
  linhas: LinhaQuadroCliente[];
  rows: ComissaoRow[];
  cobertura: CoberturaOsPeriodo;
  vazio: string;
  testid: string;
}) {
  const tot = somarQuadro(linhas);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const dashPorKey = useMemo(() => {
    const lista = montarClientesDashboard({ linhas, rows, cobertura });
    return new Map(lista.map((c) => [c.key, c]));
  }, [linhas, rows, cobertura]);
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid={testid}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase">{titulo}</p>
          <p className="text-[11px] text-gray-500">OS gerada no comercial segue até a comissão, com ou sem NF. Clique na seta para cada NF/OS.</p>
        </div>
        <p className="text-[11px] font-black text-gray-700 whitespace-nowrap">{fmtBRL(tot.faturamento)}</p>
      </div>
      {linhas.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">{vazio}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
                <th className="w-8 px-2 py-2" />
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Comercial</th>
                <th className="text-right px-3 py-2">Faturas</th>
                <th className="text-right px-3 py-2">Faturamento</th>
                <th className="text-right px-3 py-2">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => {
                const key = chaveLinhaQuadro(c);
                const aberto = !!abertos[key];
                const dash = dashPorKey.get(key);
                return (
                  <React.Fragment key={key}>
                    <tr className="border-t border-gray-50">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-gray-100"
                          aria-expanded={aberto}
                          data-testid={`btn-expand-cliente-${c.cliente}`}
                          onClick={() => setAbertos((prev) => ({ ...prev, [key]: !prev[key] }))}
                        >
                          {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-xs font-bold uppercase">
                        <div>{c.cliente}</div>
                        {dash ? <div className="mt-1 font-medium normal-case"><LinhaTempoClienteView linha={dash.linhaTempo} cliente={c.cliente} /></div> : null}
                      </td>
                      <td className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">{c.comercialNome || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{c.faturas}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.faturamento)}</td>
                      <td className="px-3 py-2 text-right font-black">
                        {fmtBRL(c.comissao)}
                        {c.abaixoDoPiso && (
                          <div className="text-[9px] font-bold text-amber-700 uppercase">Abaixo do piso</div>
                        )}
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="bg-slate-50/80" data-testid={`detalhe-cliente-${c.cliente}`}>
                        <td colSpan={6} className="px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-gray-500 mb-2">
                            Comercial: {c.comercialNome || '—'}
                          </p>
                          {c.abaixoDoPiso && (
                            <p className="text-[11px] text-amber-800 font-bold mb-2" data-testid={`piso-cliente-${c.cliente}`}>
                              Comissão só entra depois de R$ 50 mil de faturamento do comercial no período (TM SEG + TORRES). Até lá o valor a pagar é R$ 0,00 (fica o salário fixo).
                            </p>
                          )}
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-[10px] font-black text-gray-400 uppercase">
                                <th className="text-left py-1 pr-3">Fatura / OS</th>
                                <th className="text-left py-1 pr-3">Data</th>
                                <th className="text-right py-1 pr-3">Faturamento</th>
                                <th className="text-right py-1 pr-3">Imposto</th>
                                <th className="text-right py-1 pr-3">Valor a pagar</th>
                                <th className="text-left py-1 pr-3">Fatura cliente</th>
                                <th className="text-left py-1">Comissão</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(c.detalhes || []).map((d) => {
                                const com = acharComissaoDaFatura(rows, d);
                                const comissaoPaga = String(com?.status || '') === 'PAGO';
                                return (
                                <tr key={d.id} className="border-t border-gray-200">
                                  <td className="py-1.5 pr-3 font-mono">
                                    {d.numero || d.id.slice(0, 8)}
                                    {(d.rotas || []).length > 0 ? (d.rotas || []).map((os) => (
                                      <div key={os.osId} className="text-[10px] text-gray-600 font-bold font-sans normal-case" title={`${os.origem || ''} → ${os.destino || ''}`}>
                                        OS {os.osNumero} · {resumoLocal(os.origem) || '—'} → {resumoLocal(os.destino) || '—'}
                                      </div>
                                    )) : d.osIds.length > 0 && (
                                      <div className="text-[10px] text-gray-500 font-bold">OS {d.osIds.join(', ')}</div>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    {(d.rotas || []).some((os) => os.dataMissao)
                                      ? (d.rotas || []).map((os) => <div key={`d-${os.osId}`}>{fmtDate(os.dataMissao || d.date)}</div>)
                                      : fmtDate(d.date)}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right font-mono">{fmtBRL(d.faturamento)}</td>
                                  <td className="py-1.5 pr-3 text-right font-mono">{fmtBRL(d.imposto)}</td>
                                  <td className="py-1.5 pr-3 text-right font-black">{fmtBRL(d.valorAPagar)}</td>
                                  <td className="py-1.5 pr-3">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                      d.pago
                                        ? 'bg-green-50 text-green-800 border-green-200'
                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                    }`}>
                                      {d.pago ? 'Pago' : 'Em aberto'}
                                    </span>
                                  </td>
                                  <td className="py-1.5">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                      comissaoPaga
                                        ? 'bg-green-50 text-green-800 border-green-200'
                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                    }`}>
                                      {comissaoPaga ? 'Fechado' : (COMISSAO_STATUS_LABEL[(com?.status as ComissaoStatus)] || 'Em aberto')}
                                    </span>
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td className="px-3 py-2 text-[10px] font-black uppercase" colSpan={3}>Total</td>
                <td className="px-3 py-2 text-right font-mono font-black">{tot.faturas}</td>
                <td className="px-3 py-2 text-right font-mono font-black">{fmtBRL(tot.faturamento)}</td>
                <td className="px-3 py-2 text-right font-black">{fmtBRL(tot.comissao)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function CardFuncionario({
  quadro,
  dataInicio,
  aberto,
  onToggle,
}: {
  quadro: QuadroFuncionario;
  dataInicio?: string | null;
  aberto: boolean;
  onToggle: () => void;
}) {
  const fat = labelPagamento(quadro.statusPagamento);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden" data-testid={`card-funcionario-${quadro.id}`}>
      <button type="button" onClick={onToggle} className="w-full text-left px-4 py-3 hover:bg-slate-50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase text-slate-900">{quadro.nome}</p>
            <p className="text-[10px] text-slate-500 font-bold">
              {quadro.missoes} missão(ões) · {quadro.osFaturadas} faturada(s)
              {quadro.osSemFatura > 0 ? ` · ${quadro.osSemFatura} sem fatura` : ''}
              {dataInicio ? ` · comissão desde ${fmtDate(dataInicio)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${fat.cls}`}>{fat.texto}</span>
            {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase">Bruto do período</p>
            <p className="text-sm font-black">{fmtBRL(quadro.faturamentoBruto)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase">Imposto 16%</p>
            <p className="text-sm font-black text-rose-700">{fmtBRL(quadro.imposto)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase">Comissão 3% líquido</p>
            <p className="text-sm font-black text-emerald-700" data-testid="card-comissao-percentual">{fmtBRL(quadro.comissao3)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase">Fixo</p>
            <p className="text-sm font-black text-slate-800" data-testid="card-valor-fixo">{fmtBRL(quadro.valorFixo)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase">Total a pagar</p>
            <p className="text-sm font-black" data-testid="card-total-pagar">{fmtBRL(quadro.totalAPagar)}</p>
            <p className="text-[9px] font-bold text-slate-400">comissão + fixo</p>
          </div>
        </div>
      </button>
      {aberto && (
        <div className="px-4 pb-4 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 text-[11px]">
            <p>Líquido: <strong>{fmtBRL(quadro.liquido)}</strong></p>
            <p>Fixo: <strong>{fmtBRL(quadro.valorFixo)}</strong></p>
            <p>Bônus: <strong>{fmtBRL(quadro.bonus)}</strong></p>
            <p>PIX: <strong>{quadro.pix || '—'}</strong></p>
          </div>
          {quadro.abaixoDoPiso && (
            <p className="text-[11px] font-bold text-amber-800">Abaixo do piso de R$ 50 mil — comissão % zerada; permanece o valor fixo.</p>
          )}
          <p className="text-[10px] font-black uppercase text-slate-400">
            Fatura cliente {quadro.faturasPagas} paga(s) / {quadro.faturasAbertas} em aberto · Comissão {fmtBRL(quadro.comissaoPaga)} paga · {fmtBRL(quadro.comissaoLiberada)} liberada · {fmtBRL(quadro.comissaoAguardando)} aguardando cliente
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-[10px] font-black text-gray-400 uppercase">
                  <th className="text-left py-1 pr-3">Cliente</th>
                  <th className="text-right py-1 pr-3">OS</th>
                  <th className="text-right py-1 pr-3">Sem fatura</th>
                  <th className="text-right py-1 pr-3">Bruto</th>
                  <th className="text-right py-1 pr-3">Margem OS</th>
                  <th className="text-left py-1 pr-3">Fatura</th>
                  <th className="text-left py-1">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {quadro.clientes.map((c) => {
                  const fatStatus = labelPagamento(c.statusFatura);
                  const comStatus = labelPagamento(c.statusComissao);
                  return (
                    <tr key={c.key} className="border-t border-gray-100" data-testid={`margem-cliente-${c.cliente}`}>
                      <td className="py-1.5 pr-3 font-bold uppercase">
                        <div>{c.cliente}</div>
                        <div className="mt-1 font-medium normal-case"><LinhaTempoClienteView linha={c.linhaTempo} cliente={c.cliente} /></div>
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono">{c.missoes || '—'}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">{c.coberturaEstado === 'CONSULTA INCOMPLETA' ? 'NÃO VALIDADO' : c.osSemFatura}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">{fmtBRL(c.faturamento)}</td>
                      <td className="py-1.5 pr-3 text-right font-black">
                        {c.margemPct == null ? 'NÃO VALIDADO' : `${c.margemPct.toFixed(1)}%`}
                        {c.margemPct != null && (
                          <div className="text-[9px] text-slate-500 font-bold">{fmtBRL(c.lucroOs)}</div>
                        )}
                      </td>
                      <td className="py-1.5 pr-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${fatStatus.cls}`}>{fatStatus.texto}</span></td>
                      <td className="py-1.5"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${comStatus.cls}`}>{comStatus.texto}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const ComissoesComerciaisPage: React.FC = () => {
  const { showNotification } = useNotification();
  const usuarioAtual = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; }
  }, []);
  const soProprio = comissaoSomentePropria(usuarioAtual);
  const perfilFinanceiro = isFinanceProfileRole(usuarioAtual?.role);
  const now = new Date();
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(9);
  const [periodoPronto, setPeriodoPronto] = useState(false);
  const [quinzenaFiltro, setQuinzenaFiltro] = useState<QuinzenaFiltro>('todas');
  const [comercialId, setComercialId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ComissaoStatus>('');
  const [empresaFilter, setEmpresaFilter] = useState<'' | EmpresaOrigem>('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ComissaoRow[]>([]);
  const [comprovantePorComissao, setComprovantePorComissao] = useState<Record<string, string>>({});
  const [comprovantesCompletos, setComprovantesCompletos] = useState(true);
  const [comerciais, setComerciais] = useState<Comercial[]>([]);
  const [paying, setPaying] = useState<ComissaoRow | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [savingPay, setSavingPay] = useState(false);
  const [lancandoId, setLancandoId] = useState<string | null>(null);
  const [showCadastro, setShowCadastro] = useState(false);
  const [syncingUsers, setSyncingUsers] = useState(false);
  const [showTabela, setShowTabela] = useState(false);
  const [novoPix, setNovoPix] = useState('');
  const [novoFixo, setNovoFixo] = useState('');
  const [savingComercial, setSavingComercial] = useState(false);
  const [syncingFaturas, setSyncingFaturas] = useState(false);
  const [syncingTmTorres, setSyncingTmTorres] = useState(false);
  const [syncTorresInfo, setSyncTorresInfo] = useState<{
    clientes: Array<{ id: number; nome: string; comercialId: string }>;
    live: boolean;
    error?: string;
  } | null>(null);
  const [quadroTm, setQuadroTm] = useState<LinhaQuadroCliente[]>([]);
  const [quadroTorres, setQuadroTorres] = useState<LinhaQuadroCliente[]>([]);
  const [mesesDisponiveis, setMesesDisponiveis] = useState<string[]>([]);
  const [cobertura, setCobertura] = useState<CoberturaOsPeriodo>(coberturaVazia());
  const [funcionarioAberto, setFuncionarioAberto] = useState<string | null>(null);
  const [iniciosComissao, setIniciosComissao] = useState<Record<string, string>>({});
  const [rotasTorres, setRotasTorres] = useState<RotaMissaoComissao[]>([]);
  const [escopoPronto, setEscopoPronto] = useState(!soProprio);
  const autoSyncRef = useRef(false);
  const autoTorresRef = useRef(new Set<string>());

  const { start: periodStart, end: periodEnd } = intervaloQuinzena(year, month, quinzenaFiltro);

  const loadComerciais = useCallback(async () => {
    const { data, error } = await supabase.from('comerciais').select('id, nome, email, telefone, pix_chave, ativo, usuario_id, valor_fixo, tabela_comissao_codigo').order('nome');
    if (error) throw new Error(error.message);
    let lista = (data || []) as Comercial[];
    if (soProprio) {
      const uid = Number(usuarioAtual?.id);
      lista = lista.filter((c) => Number(c.usuario_id) === uid);
    }
    setComerciais(lista);
    return lista;
  }, [soProprio, usuarioAtual?.id]);

  const load = useCallback(async () => {
    if (!periodoPronto || !escopoPronto) return;
    if (soProprio && !comercialId) {
      setRows([]);
      setQuadroTm([]);
      setQuadroTorres([]);
      setCobertura(coberturaVazia('NÃO EXISTE', undefined, false));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const listaComerciais = await loadComerciais();
      if (!autoSyncRef.current && !soProprio) {
        autoSyncRef.current = true;
        setSyncingFaturas(true);
        try {
          const syncRes = await authFetch('/api/comissoes/sync-faturas', { method: 'POST', body: '{}' });
          await syncRes.json().catch(() => ({}));
        } catch {
          /* fail-soft: quadro das faturas continua */
        } finally {
          setSyncingFaturas(false);
        }
      }
      const mesCheio = intervaloQuinzena(year, month, 'todas');
      const result = await fetchAllPages<ComissaoRow>(async (from, size) => {
        let q = supabase
          .from('comissoes')
          .select('*, comerciais(nome, pix_chave)', { count: 'exact' })
          .gte('data_faturamento', mesCheio.start)
          .lte('data_faturamento', mesCheio.end)
          .order('data_faturamento', { ascending: false })
          .range(from, from + size - 1);
        if (comercialId) q = q.eq('comercial_id', comercialId);
        if (statusFilter) q = q.eq('status', statusFilter);
        if (empresaFilter) q = q.eq('empresa_origem', empresaFilter);
        const { data, error, count } = await q;
        return { data: data as ComissaoRow[] | null, error, count };
      });
      const publicarLinhas = (rotas: RotaMissaoComissao[]) => {
        setRotasTorres(rotas);
        const visiveis = result.rows.filter((r) => linhaNaQuinzenaComissao(
          decorarComissaoTorres(r, rotas).datasMissao,
          r.data_faturamento,
          quinzenaFiltro,
        ));
        setRows(visiveis);
        return visiveis;
      };
      const comOsSemFatura = async (linhas: LinhaQuadroCliente[], cobertura: CoberturaOsPeriodo | null) => {
        let cob = cobertura;
        if (!cob || cob.consultaIncompleta || cob.estado !== 'ENCONTRADO') {
          cob = await carregarCoberturaOsPeriodo(supabase, periodStart, periodEnd, listaComerciais);
        }
        if (!cob || cob.consultaIncompleta || cob.estado === 'ERRO') {
          return {
            linhas,
            cobertura: cob || coberturaVazia('CONSULTA INCOMPLETA', 'Cobertura de OS incompleta.', true),
          };
        }
        return {
          linhas: mesclarOsSemFaturaNoQuadro(linhas, cob.itens, listaComerciais, periodStart, periodEnd),
          cobertura: cob,
        };
      };
      try {
        const quadroRes = await authFetch(`/api/comissoes/quadro?start=${encodeURIComponent(periodStart)}&end=${encodeURIComponent(periodEnd)}`);
        const quadroJson = await quadroRes.json().catch(() => ({}));
        if (quadroJson.iniciosComissao && typeof quadroJson.iniciosComissao === 'object') {
          setIniciosComissao(quadroJson.iniciosComissao);
        }
        if (quadroRes.ok && (quadroJson.ok || (quadroJson.linhasTm || []).length > 0 || (quadroJson.linhasTorres || []).length > 0 || (quadroJson.meses || []).length > 0)) {
          const visiveis = publicarLinhas(Array.isArray(quadroJson.rotasTorres) ? quadroJson.rotasTorres : []);
          const completo = await comOsSemFatura(quadroJson.linhasTm || [], quadroJson.cobertura || null);
          setQuadroTm(completo.linhas);
          setQuadroTorres(mesclarLinhasQuadro(quadroJson.linhasTorres || [], quadroDeComissoesTorres(visiveis, listaComerciais)));
          setMesesDisponiveis(quadroJson.meses || []);
          setCobertura(completo.cobertura);
          if (quadroJson.error && !(quadroJson.linhasTm || []).length && !(quadroJson.linhasTorres || []).length) {
            showNotification('Quadro', quadroJson.error, 'warning');
          }
        } else {
          const visiveis = publicarLinhas([]);
          const quadro = await carregarQuadroTmSeg(supabase, periodStart, periodEnd, listaComerciais);
          const completo = await comOsSemFatura(quadro.linhas, null);
          setQuadroTm(completo.linhas);
          setQuadroTorres(quadroDeComissoesTorres(visiveis, listaComerciais));
          setMesesDisponiveis(quadro.meses);
          setCobertura(completo.cobertura);
          if (quadro.error || quadroJson.error) {
            showNotification('Quadro', quadroJson.error || quadro.error || 'Falha ao carregar faturamento', 'warning');
          }
        }
      } catch (e: any) {
        try {
          const visiveis = publicarLinhas([]);
          const quadro = await carregarQuadroTmSeg(supabase, periodStart, periodEnd, listaComerciais);
          const completo = await comOsSemFatura(quadro.linhas, null);
          setQuadroTm(completo.linhas);
          setQuadroTorres(quadroDeComissoesTorres(visiveis, listaComerciais));
          setMesesDisponiveis(quadro.meses);
          setCobertura(completo.cobertura);
        } catch {
          const visiveis = publicarLinhas([]);
          setQuadroTm([]);
          setQuadroTorres(quadroDeComissoesTorres(visiveis, listaComerciais));
          setCobertura(coberturaVazia('ERRO', e?.message || 'Falha ao carregar cobertura de OS', true));
        }
        showNotification('Quadro', e?.message || 'Falha ao carregar faturamento', 'warning');
      }
      if (!result.complete) {
        showNotification('Consulta incompleta', 'Nem todas as comissões do período foram carregadas.', 'warning');
      }
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao carregar comissões', 'error');
      setRows([]);
      setRotasTorres([]);
    } finally {
      setLoading(false);
    }
  }, [periodoPronto, escopoPronto, periodStart, periodEnd, year, month, comercialId, statusFilter, empresaFilter, quinzenaFiltro, loadComerciais, showNotification, soProprio]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await resolverPeriodoInicialFaturas(supabase);
      if (alive && p) {
        setYear(p.year);
        setMonth(p.month);
      }
      if (alive) setPeriodoPronto(true);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!soProprio) return;
    let alive = true;
    (async () => {
      const carteira = await carregarNomesClientesDoComercial(supabase, usuarioAtual?.id);
      if (!alive) return;
      if (carteira.comercialId) setComercialId(carteira.comercialId);
      setEscopoPronto(true);
    })();
    return () => { alive = false; };
  }, [soProprio, usuarioAtual?.id]);

  useEffect(() => { if (periodoPronto && escopoPronto) void load(); }, [load, periodoPronto, escopoPronto]);

  useEffect(() => {
    let alive = true;
    const elegiveis = rows.filter((r) => r.status === 'LIBERADO_PARA_PAGAMENTO' || r.status === 'PAGO');
    if (!elegiveis.length) {
      setComprovantePorComissao({});
      setComprovantesCompletos(true);
      return;
    }
    (async () => {
      try {
        const numeros = [...new Set(elegiveis.map((r) => String(r.fatura_numero || '').trim()).filter((n) => n.length >= 8 || n.includes('-')))];
        const idsFatura = [...new Set(elegiveis.map((r) => String(r.fatura_id || '').trim()).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
        const faturas: Array<{ id: string; number: string | null; notes: string | null; manual_payment_evidence_url: string | null; asaas_payment_id: string | null; issuer_company: string | null }> = [];
        for (let i = 0; i < numeros.length; i += 40) {
          const { data, error } = await supabase
            .from('financial_invoices')
            .select('id, number, notes, manual_payment_evidence_url, asaas_payment_id, issuer_company')
            .in('number', numeros.slice(i, i + 40));
          if (error) throw error;
          faturas.push(...(data || []));
        }
        for (let i = 0; i < idsFatura.length; i += 40) {
          const { data, error } = await supabase
            .from('financial_invoices')
            .select('id, number, notes, manual_payment_evidence_url, asaas_payment_id, issuer_company')
            .in('id', idsFatura.slice(i, i + 40));
          if (error) throw error;
          faturas.push(...(data || []));
        }
        const titulos: Array<{ description: string | null; notes: string | null; doc_comprovante_url: string | null }> = [];
        for (let i = 0; i < numeros.length; i += 8) {
          const chunk = numeros.slice(i, i + 8);
          const or = chunk.map((n) => {
            const token = n.replace(/[%_,.()]/g, '');
            return `description.ilike.%${token}%,notes.ilike.%${token}%`;
          }).join(',');
          const result = await fetchAllPages<{ description: string | null; notes: string | null; doc_comprovante_url: string | null }>(async (from, size) => {
            const { data, error, count } = await supabase
              .from('financial_transactions')
              .select('description, notes, doc_comprovante_url', { count: 'exact' })
              .eq('type', 'INCOME')
              .not('doc_comprovante_url', 'is', null)
              .or(or)
              .range(from, from + size - 1);
            return { data, error, count };
          });
          if (!result.complete) throw new Error('consulta incompleta');
          titulos.push(...result.rows);
        }
        const gravados = comprovantesJaGravados({ comissoes: elegiveis, faturas, titulos });
        const mapa = { ...gravados.urls };
        let completo = true;
        const pendentes = gravados.pendentes.filter((item) => item.paymentId || item.torresOrigemId);
        if (pendentes.length) {
          const res = await authFetch('/api/comissoes/comprovantes', {
            method: 'POST',
            body: JSON.stringify({ itens: pendentes }),
          });
          const json = await res.json().catch(() => null) as { urls?: Record<string, string>; completo?: boolean } | null;
          if (!res.ok || !json) completo = false;
          else {
            Object.assign(mapa, json.urls || {});
            if (json.completo !== true) completo = false;
          }
        }
        if (alive) {
          setComprovantePorComissao(mapa);
          setComprovantesCompletos(completo);
        }
      } catch {
        if (alive) setComprovantesCompletos(false);
      }
    })();
    return () => { alive = false; };
  }, [rows]);

  const pixContaRef = useRef(new Set<string>());
  useEffect(() => {
    const alvos = rows.filter((r) => {
      if (!r.conta_pagar_id) return false;
      if (String(r.empresa_origem || '').toUpperCase() === 'TORRES') return false;
      const chave = `${r.conta_pagar_id}|${comprovantePorComissao[r.id] || ''}`;
      if (pixContaRef.current.has(chave)) return false;
      pixContaRef.current.add(chave);
      return true;
    });
    for (const r of alvos) {
      void garantirFormaPixEComprovante(r.conta_pagar_id || '', comprovantePorComissao[r.id] || null);
    }
  }, [rows, comprovantePorComissao]);

  useEffect(() => {
    const c = comerciais.find((x) => x.id === comercialId);
    setNovoPix(c?.pix_chave || '');
    setNovoFixo(c?.valor_fixo != null ? String(c.valor_fixo) : '');
  }, [comercialId, comerciais]);

  const quadroVisivel = useMemo(() => {
    const tmCad = filtrarLinhasAposCadastro(quadroTm, iniciosComissao);
    const torresCad = filtrarLinhasAposCadastro(quadroTorres, iniciosComissao);
    const { linhasTm: tmPiso, linhasTorres: torresPiso } = aplicarPisoComissaoQuadro(tmCad, torresCad);
    const matchComercial = (l: LinhaQuadroCliente) => !comercialId || l.comercialId === comercialId;
    const tm = empresaFilter === 'TORRES' ? [] : tmPiso.filter(matchComercial);
    const torres = empresaFilter === 'TM_SEG' ? [] : torresPiso.filter(matchComercial);
    const all = [...tm, ...torres];
    return {
      tm,
      torres,
      all,
      totais: somarQuadro(all),
      totTm: somarQuadro(tm),
      totTorres: somarQuadro(torres),
    };
  }, [quadroTm, quadroTorres, empresaFilter, comercialId, iniciosComissao]);

  const rowsAposCadastro = useMemo(
    () => ordenarComissoesLiberadasPrimeiro(
      rows.filter((r) => lancamentoAposCadastro(r.data_faturamento, iniciosComissao[String(r.comercial_id || '').trim()] || null)),
    ),
    [rows, iniciosComissao],
  );

  const apuracaoPorComercial = useMemo(
    () => montarApuracaoPorComercial({ linhas: quadroVisivel.all, comerciais }),
    [quadroVisivel.all, comerciais],
  );

  const brutoComercialPeriodo = useMemo(() => {
    const map = new Map<string, number>();
    for (const linha of apuracaoPorComercial) map.set(linha.id, linha.fat);
    return map;
  }, [apuracaoPorComercial]);

  const comissaoLinha = useCallback((r: ComissaoRow) => valorComissaoLinhaAposPiso({
    valorComissao: Number(r.valor_comissao),
    brutoComercialNoPeriodo: brutoComercialPeriodo.get(String(r.comercial_id || '').trim()) || 0,
    percentual: Number(r.percentual_comissao_aplicado),
  }), [brutoComercialPeriodo]);

  const decorarLinha = useCallback(
    (r: ComissaoRow) => decorarComissaoTorres(r, rotasTorres),
    [rotasTorres],
  );

  const listasComissao = useMemo(() => {
    const liberadas = rowsAposCadastro.filter((r) => r.status === 'LIBERADO_PARA_PAGAMENTO');
    const pendentes = rowsAposCadastro.filter((r) => r.status !== 'PAGO' && r.status !== 'LIBERADO_PARA_PAGAMENTO');
    const pagas = rowsAposCadastro.filter((r) => r.status === 'PAGO');
    const faturasVisiveis = new Set(
      rowsAposCadastro.map((r) => String(r.fatura_numero || '').trim()).filter(Boolean),
    );
    const entraNaSoma = (r: ComissaoRow) => !comissaoDuplicadaNoPeriodo(decorarLinha(r), faturasVisiveis);
    const linhaSoma = (r: ComissaoRow) => {
      const linha = comissaoLinha(r);
      return {
        valorComissao: linha.valor,
        aPagar: valorColunaPagamentoComissao(r.status, linha.valor, linha.abaixoDoPiso),
      };
    };
    return {
      liberadas,
      pendentes,
      pagas,
      somaLiberada: somarListaComissao(liberadas.filter(entraNaSoma).map(linhaSoma)),
      somaPendente: somarListaComissao(pendentes.filter(entraNaSoma).map(linhaSoma)),
      somaPaga: somarListaComissao(pagas.filter(entraNaSoma).map(linhaSoma)),
    };
  }, [rowsAposCadastro, comissaoLinha, decorarLinha]);

  const stats = useMemo(() => {
    const lib = rowsAposCadastro.filter((r) => r.status === 'LIBERADO_PARA_PAGAMENTO').reduce((s, r) => s + comissaoLinha(r).valor, 0);
    const pago = rowsAposCadastro.filter((r) => r.status === 'PAGO').reduce((s, r) => s + comissaoLinha(r).valor, 0);
    return { lib, pago, porComercial: apuracaoPorComercial };
  }, [rowsAposCadastro, comissaoLinha, apuracaoPorComercial]);

  const funcionarios = useMemo(() => {
    const lista = montarQuadrosFuncionarios({
      comerciais,
      linhas: quadroVisivel.all,
      rows: rowsAposCadastro,
      cobertura,
    });
    return comercialId ? lista.filter((f) => f.id === comercialId) : lista;
  }, [comerciais, quadroVisivel.all, rowsAposCadastro, cobertura, comercialId]);

  const kpis = useMemo(() => montarKpisDashboard({
    linhas: quadroVisivel.all,
    funcionarios,
    cobertura,
  }), [quadroVisivel.all, funcionarios, cobertura]);

  const lancarNoContasAPagar = async (r: ComissaoRow, silencioso = false) => {
    const linha = comissaoLinha(r);
    const valor = valorColunaPagamentoComissao(r.status, linha.valor, linha.abaixoDoPiso);
    if (valor == null || valor <= 0) {
      if (!silencioso) showNotification('Lançar pagamento', 'Esta comissão não tem valor a pagar.', 'warning');
      return false;
    }
    const torres = String(r.empresa_origem || '').toUpperCase() === 'TORRES';
    setLancandoId(r.id);
    try {
      if (torres) {
        const res = await authFetch('/api/comissoes/conta-pagar-torres', {
          method: 'POST',
          body: JSON.stringify({ acao: 'lancar', id: r.id, valor }),
        });
        const json = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao lançar no Contas a Pagar da TORRES');
        if (!silencioso) showNotification('Contas a Pagar da TORRES', 'Lançamento criado na TORRES, separado da TM SEG.', 'success');
      } else {
        const res = await lancarPagamentoComissao({
          id: r.id,
          cliente: r.cliente_nome,
          fatura: r.fatura_numero,
          comercial: r.comerciais?.nome,
          dataFaturamento: r.data_faturamento,
          valor,
          contaPagarId: r.conta_pagar_id,
          comprovanteUrl: comprovantePorComissao[r.id] || null,
        });
        if (!res.ok) throw new Error(res.error || 'Falha ao lançar no Contas a Pagar');
        if (!silencioso) showNotification('Contas a Pagar', 'Lançamento criado. Agora é possível pagar a comissão.', 'success');
      }
      await load();
      return true;
    } catch (e: any) {
      if (!silencioso) showNotification('Erro', e?.message || 'Falha ao lançar pagamento', 'error');
      return false;
    } finally {
      setLancandoId(null);
    }
  };

  useEffect(() => {
    if (soProprio) return;
    const alvos = rows.filter((r) => {
      if (autoTorresRef.current.has(r.id)) return false;
      if (String(r.empresa_origem || '').toUpperCase() !== 'TORRES') return false;
      if (r.status !== 'LIBERADO_PARA_PAGAMENTO' || r.conta_pagar_id) return false;
      const linha = comissaoLinha(r);
      const valor = valorColunaPagamentoComissao(r.status, linha.valor, linha.abaixoDoPiso);
      return valor != null && valor > 0 && !linha.abaixoDoPiso;
    });
    if (!alvos.length) return;
    let vivo = true;
    (async () => {
      let criou = false;
      let erro = '';
      for (const r of alvos) {
        autoTorresRef.current.add(r.id);
        const linha = comissaoLinha(r);
        const valor = valorColunaPagamentoComissao(r.status, linha.valor, linha.abaixoDoPiso);
        if (valor == null) continue;
        try {
          const res = await authFetch('/api/comissoes/conta-pagar-torres', {
            method: 'POST',
            body: JSON.stringify({ acao: 'lancar', id: r.id, valor }),
          });
          const json = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
          if (!res.ok || !json?.ok) erro = json?.error || erro || 'Falha ao lançar na TORRES';
          else criou = true;
        } catch (e: any) {
          erro = e?.message || erro;
        }
      }
      if (!vivo) return;
      if (criou) {
        showNotification('Contas a Pagar da TORRES', 'Comissão da TORRES lançada no contas a pagar dela.', 'success');
        await load();
      } else if (erro) {
        showNotification('Contas a Pagar da TORRES', erro, 'warning');
      }
    })();
    return () => { vivo = false; };
  }, [rows, soProprio]);

  const confirmarPagamento = async () => {
    if (!paying || !file) {
      showNotification('Comprovante', 'Anexe o comprovante da transferência.', 'warning');
      return;
    }
    setSavingPay(true);
    try {
      const res = await registrarPagamentoComissao(paying.id, file);
      if (!res.ok) throw new Error(res.error || 'Falha ao registrar pagamento');
      if (String(paying.empresa_origem || '').toUpperCase() === 'TORRES') {
        const baixa = await authFetch('/api/comissoes/conta-pagar-torres', {
          method: 'POST',
          body: JSON.stringify({ acao: 'baixar', id: paying.id }),
        });
        const json = await baixa.json().catch(() => null) as { ok?: boolean; error?: string } | null;
        if (!json?.ok) {
          showNotification('Pago', json?.error || 'A comissão foi paga, mas o Contas a Pagar da TORRES não foi baixado.', 'warning');
          setPaying(null);
          setFile(null);
          await load();
          return;
        }
      }
      showNotification('Pago', res.aviso || 'Comprovante anexado. Data e hora do pagamento gravadas.', res.aviso ? 'warning' : 'success');
      setPaying(null);
      setFile(null);
      await load();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao pagar comissão', 'error');
    } finally {
      setSavingPay(false);
    }
  };

  const exportarRelatorio = () => {
    if (rowsAposCadastro.length === 0) {
      showNotification('Relatório', 'Não há comissões neste filtro para exportar.', 'warning');
      return;
    }
    const comercialNome = comerciais.find((c) => c.id === comercialId)?.nome || 'Todos';
    const csv = montarCsvRelatorioComissoes(
      rowsAposCadastro.map((r) => {
        const rota = decorarLinha(r);
        return {
          empresa: empresaLabel(r.empresa_origem),
          cliente_nome: r.cliente_nome,
          comercial_nome: r.comerciais?.nome || comercialNome,
          fatura_numero: r.fatura_numero,
          data_faturamento: r.data_faturamento,
          valor_faturamento: Number(r.valor_faturamento),
          valor_comissao: comissaoLinha(r).valor,
          status: rota.substituida && rota.concluida ? 'Concluída' : (COMISSAO_STATUS_LABEL[r.status] || r.status),
          os_numero: rota.os.map((os) => os.osNumero).join(' | '),
          origem: rota.os.map((os) => os.origem || '').filter(Boolean).join(' | '),
          destino: rota.os.map((os) => os.destino || '').filter(Boolean).join(' | '),
          data_missao: rota.datasMissao.join(' | '),
        };
      }),
      { year, month, quinzena: quinzenaFiltro, comercialNome },
    );
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivoRelatorioComissoes({ year, month, quinzena: quinzenaFiltro, comercialNome });
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const trocarFaturaTorres = async (id: string, faturaNumero: string) => {
    const res = await authFetch('/api/comissoes/religar-fatura-torres', {
      method: 'POST',
      body: JSON.stringify({ id, faturaNumero }),
    });
    const json = await res.json().catch(() => null) as { ok?: boolean; error?: string; mensagem?: string } | null;
    if (!res.ok || !json?.ok) {
      const erro = json?.error || 'Não foi possível puxar a fatura da TORRES.';
      showNotification('Fatura', erro, 'error');
      throw new Error(erro);
    }
    showNotification('Fatura', json.mensagem || 'Fatura puxada da TORRES.', 'success');
    await load();
  };

  const sincronizarFaturasExistentes = async () => {
    setSyncingFaturas(true);
    try {
      const syncRes = await authFetch('/api/comissoes/sync-faturas', { method: 'POST', body: '{}' });
      const res = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok || res.ok === false) throw new Error(res.error || 'Falha ao sincronizar faturas');
      showNotification(
        'Comissões',
        `${res.generated || 0} gerada(s). Sem comercial: ${res.skippedSemComercial || 0}. Já existiam: ${res.skippedJaExiste || 0}.`,
        res.generated > 0 ? 'success' : 'warning',
      );
      await load();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao gerar comissões das faturas existentes.', 'error');
    } finally {
      setSyncingFaturas(false);
    }
  };

  const sincronizarTmETorres = async () => {
    setSyncingTmTorres(true);
    try {
      const qs = `start=${encodeURIComponent(periodStart)}&end=${encodeURIComponent(periodEnd)}`;
      const syncRes = await authFetch(`/api/comissoes/sync-tm-torres?${qs}`, { method: 'POST', body: '{}' });
      const json = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok) throw new Error(json.error || 'Falha no sincronismo');
      setSyncTorresInfo({
        clientes: json.torres?.clientesComComercial || [],
        live: !!json.torres?.liveDisponivel || !!json.torres?.pushed,
        error: json.torres?.error,
      });
      const nCli = json.torres?.clientesComComercial?.length || 0;
      const torresOk = json.torres?.ok !== false && !json.torres?.error;
      showNotification(
        'Sincronismo TM SEG + TORRES',
        `TM SEG: ${json.tm?.generated || 0} comissão(ões) gerada(s). TORRES: ${nCli} cliente(s) com comercial, ${json.torres?.faturasLidas || 0} lançamento(s) lido(s), ${json.torres?.generated || 0} novo(s).${json.torres?.error ? ` ${json.torres.error}` : ''}`,
        torresOk ? 'success' : 'warning',
      );
      await load();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao sincronizar TM SEG e TORRES.', 'error');
    } finally {
      setSyncingTmTorres(false);
    }
  };

  const sincronizarUsuarios = async () => {
    setSyncingUsers(true);
    try {
      const res = await sincronizarComerciaisDeUsuarios(supabase);
      if (!res.ok) throw new Error(res.error || 'Falha ao sincronizar');
      showNotification('Usuários', `${res.linked} comercial(is) vinculado(s) à tabela padrão.`, 'success');
      await loadComerciais();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao sincronizar usuários Comercial.', 'error');
    } finally {
      setSyncingUsers(false);
    }
  };

  const salvarDadosComercial = async () => {
    if (!comercialId) {
      showNotification('Comercial', 'Selecione o comercial no filtro para gravar PIX e valor fixo.', 'warning');
      return;
    }
    setSavingComercial(true);
    try {
      const { error } = await supabase.from('comerciais').update({
        pix_chave: novoPix.trim() || null,
        valor_fixo: Number(novoFixo) || 0,
      }).eq('id', comercialId);
      if (error) throw error;
      showNotification('Salvo', 'PIX e valor fixo atualizados.', 'success');
      await loadComerciais();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao salvar dados do comercial', 'error');
    } finally {
      setSavingComercial(false);
    }
  };

  const osSemFatura = cobertura.consultaIncompleta ? [] : cobertura.porCliente.filter((c) => c.semFatura > 0);

  return (
    <div className="space-y-5 p-2" data-testid="comissoes-comerciais-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
            <BadgeDollarSign className="text-red-600" size={22} /> Comissões Comerciais
          </h1>
          <p className="text-xs text-gray-500 font-medium">Controle único TM SEG + TORRES. Vínculo pelo usuário COMERCIAL. OS gerada no nome do comercial segue o fluxo até o pagamento da comissão, com ou sem NF: OS Gerada › Faturado › Pago › Comissão. Entra a partir da data de cadastro do comercial. OS em Origem/Agendada ainda não entra no valor. Fórmula: bruto − 16% = líquido; 3% sobre o líquido. Comissão % só a partir de R$ 50 mil no período. Abaixo disso: só o valor fixo. Sincronismo automático a cada 6 horas (botão também dispara na hora).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowTabela((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-black uppercase text-gray-700 hover:bg-gray-50"
            data-testid="btn-toggle-tabela-comissao"
          >
            {showTabela ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Tabela padrão
          </button>
          {!soProprio && (
            <>
          <button
            type="button"
            disabled={syncingUsers}
            onClick={() => void sincronizarUsuarios()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-black uppercase text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            data-testid="btn-sync-usuarios-comercial"
          >
            {syncingUsers ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sincronizar usuários
          </button>
          <button
            type="button"
            disabled={syncingTmTorres}
            onClick={() => void sincronizarTmETorres()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-black uppercase text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            data-testid="btn-sync-tm-torres"
          >
            {syncingTmTorres ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sincronizar TM SEG + TORRES
          </button>
          <button
            type="button"
            disabled={syncingFaturas}
            onClick={() => void sincronizarFaturasExistentes()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-black uppercase text-red-800 hover:bg-red-100 disabled:opacity-50"
            data-testid="btn-sync-comissoes-faturas"
          >
            {syncingFaturas ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Gerar comissões das faturas
          </button>
          <button
            type="button"
            onClick={() => setShowCadastro((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-black uppercase text-gray-700 hover:bg-gray-50"
            data-testid="btn-toggle-cadastro-comercial"
          >
            {showCadastro ? 'Fechar PIX/fixo' : 'PIX e valor fixo'}
          </button>
            </>
          )}
        </div>
      </div>

      {syncTorresInfo ? (
        <div
          className={`rounded-xl border p-4 ${syncTorresInfo.live ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}
          data-testid="comissao-sync-torres-info"
        >
          <p className="text-xs font-black uppercase text-gray-800">
            TORRES · clientes com responsável comercial ({syncTorresInfo.clientes.length})
          </p>
          <p className="mt-1 text-[11px] text-gray-600">
            {syncTorresInfo.error
              ? syncTorresInfo.error
              : 'Só entra no quadro quem tem responsável comercial e faturamento/OS no período.'}
          </p>
          {syncTorresInfo.clientes.length > 0 ? (
            <p className="mt-2 text-[11px] font-bold text-gray-800">
              {syncTorresInfo.clientes.map((c) => c.nome).join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="border border-slate-200 bg-white rounded-xl p-4" data-testid="cobertura-os-periodo">
        <p className="font-black text-sm uppercase text-slate-800">OS do período × faturamento</p>
        {cobertura.consultaIncompleta ? (
          <p className="text-[11px] text-amber-800 font-bold mt-1">CONSULTA INCOMPLETA — não dá para afirmar que todas as OS foram faturadas.</p>
        ) : cobertura.estado === 'NÃO EXISTE' ? (
          <p className="text-[11px] text-slate-500 mt-1">Nenhuma OS concluída/faturada neste período (end_time).</p>
        ) : osSemFatura.length === 0 ? (
          <p className="text-[11px] text-emerald-700 font-bold mt-1">
            {cobertura.totais.missoes} OS do período rastreadas e todas com fatura/vínculo.
          </p>
        ) : (
          <div className="mt-2">
            <p className="text-[11px] text-amber-800 font-bold">
              {cobertura.totais.semFatura} OS concluída(s) no período sem fatura (invoice_number ou vínculo financial_invoice_missions).
            </p>
            <div className="overflow-x-auto mt-2 max-h-40">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase">
                    <th className="text-left py-1 pr-3">Cliente</th>
                    <th className="text-left py-1 pr-3">Comercial</th>
                    <th className="text-right py-1 pr-3">OS</th>
                    <th className="text-right py-1 pr-3">Sem fatura</th>
                    <th className="text-left py-1">IDs</th>
                  </tr>
                </thead>
                <tbody>
                  {osSemFatura.map((c) => (
                    <tr key={`${c.comercialId}|${c.cliente}`} className="border-t border-slate-100">
                      <td className="py-1 pr-3 font-bold uppercase">{c.cliente}</td>
                      <td className="py-1 pr-3 uppercase">{c.comercialNome || '—'}</td>
                      <td className="py-1 pr-3 text-right font-mono">{c.missoes}</td>
                      <td className="py-1 pr-3 text-right font-mono">{c.semFatura}</td>
                      <td className="py-1 font-mono text-[10px]">{c.osSemFaturaIds.slice(0, 8).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showTabela && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid="tabela-comissao-padrao">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase">{TABELA_COMISSAO_PADRAO.nome}</p>
            <p className="text-[11px] text-gray-500">Até R$ 50 mil: só o valor fixo. Depois: bruto − 16% da NF = líquido, e 3% sobre esse líquido. Os 16% não entram no pagamento. Bônus R$ 5.000 a partir de R$ 500 mil e R$ 10.000 a partir de R$ 1 milhão.</p>
          </div>
          <div className="overflow-x-auto max-h-80">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
                  <th className="text-right px-3 py-2">Valor bruto</th>
                  <th className="text-right px-3 py-2">NF (−16%)</th>
                  <th className="text-right px-3 py-2">Líquido</th>
                  <th className="text-right px-3 py-2">Comissão 3%</th>
                  <th className="text-right px-3 py-2">Bônus</th>
                  <th className="text-right px-3 py-2">Total escala</th>
                </tr>
              </thead>
              <tbody>
                {gerarLinhasTabelaReferencia().map((l) => (
                  <tr key={l.valorBruto} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 text-right font-mono">{fmtBRL(l.valorBruto)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-red-700">− {fmtBRL(l.notaFiscal)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtBRL(l.resultadoLiquido)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtBRL(l.comissao)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtBRL(l.bonusAcumulado)}</td>
                    <td className="px-3 py-1.5 text-right font-black">{fmtBRL(l.totalAPagar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCadastro && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3" data-testid="cadastro-comercial">
          <p className="md:col-span-4 text-[11px] text-gray-500">Cadastre o vendedor em Configurações → Usuários internos com perfil COMERCIAL, depois sincronize. Aqui só grava PIX e o salário fixo do selecionado no filtro.</p>
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Chave PIX" value={novoPix} onChange={(e) => setNovoPix(e.target.value)} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Valor fixo (R$)" type="number" min="0" step="0.01" value={novoFixo} onChange={(e) => setNovoFixo(e.target.value)} data-testid="input-comercial-valor-fixo" />
          <button type="button" disabled={savingComercial} onClick={() => void salvarDadosComercial()} className="bg-black text-white rounded-lg px-3 py-2 text-xs font-black uppercase disabled:opacity-50">
            {savingComercial ? 'Salvando…' : 'Salvar PIX e fixo'}
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end" data-testid="comissoes-filtros">
        <label className="text-[10px] font-black text-gray-400 uppercase">Mês
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Ano
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold" value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="filter-ano-comissao">
            {anosFiltroComissao(year, now.getFullYear()).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Quinzena
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold" value={quinzenaFiltro} onChange={(e) => setQuinzenaFiltro(e.target.value as QuinzenaFiltro)} data-testid="filter-quinzena-comissao">
            <option value="todas">Mês completo</option>
            <option value="q1">1ª Quinzena (01 a 15)</option>
            <option value="q2">2ª Quinzena (16 ao fim)</option>
          </select>
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Comercial
          <select
            className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold min-w-[180px]"
            value={comercialId}
            onChange={(e) => setComercialId(e.target.value)}
            disabled={soProprio}
            data-testid="filter-comercial"
          >
            {!soProprio && <option value="">Todos</option>}
            {comerciais.filter((c) => c.ativo !== false).map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Empresa
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold" value={empresaFilter} onChange={(e) => setEmpresaFilter(e.target.value as EmpresaOrigem | '')} data-testid="filter-empresa-comissao">
            <option value="">Todas</option>
            <option value="TM_SEG">TM SEG</option>
            <option value="TORRES">TORRES</option>
          </select>
        </label>
        <label className="text-[10px] font-black text-gray-400 uppercase">Status
          <select className="block mt-1 border rounded-lg px-3 py-2 text-sm font-bold" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ComissaoStatus | '')} data-testid="filter-status-comissao">
            <option value="">Todos</option>
            <option value="AGUARDANDO_PAGAMENTO_CLIENTE">Aguardando cliente</option>
            <option value="LIBERADO_PARA_PAGAMENTO">Liberado</option>
            <option value="PAGO">Pago</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </label>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-black uppercase">
          <Filter size={12} /> Atualizar
        </button>
        <button type="button" onClick={exportarRelatorio} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-black uppercase text-gray-700 hover:bg-gray-50" data-testid="btn-exportar-relatorio-comissao">
          <FileSpreadsheet size={12} /> Exportar relatório
        </button>
      </div>

      {mesesDisponiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="meses-com-fatura">
          <span className="text-[10px] font-black text-gray-400 uppercase">Faturamento em</span>
          {mesesDisponiveis.map((ym) => (
            <button
              key={ym}
              type="button"
              onClick={() => {
                const [y, m] = ym.split('-');
                setYear(Number(y));
                setMonth(Number(m));
                setComercialId('');
              }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border ${
                `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}` === ym
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {labelMesAno(ym)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" data-testid="dashboard-comissoes-kpis">
        <KpiTile tone="blue" icon={TrendingUp} label="Faturamento bruto" value={fmtBRL(kpis.faturamento)} sub={`${quadroVisivel.totais.faturas} fatura(s)`} testid="kpi-faturamento" />
        <KpiTile tone="amber" icon={Percent} label="Imposto 16% (NF)" value={fmtBRL(kpis.imposto)} sub="Abatido do bruto, não pago ao comercial" testid="kpi-imposto" />
        <KpiTile tone="green" icon={CircleDollarSign} label="Líquido (lucro base)" value={fmtBRL(kpis.lucroBase)} sub="Bruto − 16%" testid="kpi-liquido" />
        <KpiTile tone="rose" icon={BadgeDollarSign} label="Comissão 3% líquido" value={fmtBRL(kpis.comissao3)} sub="Após piso de R$ 50 mil" testid="kpi-comissao" />
        <KpiTile tone="sky" icon={Briefcase} label="Missões do período" value={kpis.consultaIncompleta ? 'NÃO VALIDADO' : String(kpis.missoes)} sub={kpis.consultaIncompleta ? 'Consulta incompleta' : 'Concluída / Faturada'} testid="kpi-missoes" />
        <KpiTile tone="lime" icon={ClipboardList} label="OS sem fatura" value={kpis.consultaIncompleta ? 'NÃO VALIDADO' : String(kpis.osSemFatura)} sub={kpis.consultaIncompleta ? kpis.coberturaEstado : 'Rastreio por cliente'} testid="kpi-os-sem-fatura" />
        <KpiTile tone="emerald" icon={TrendingUp} label="Margem operacional OS" value={kpis.margemOperacionalPct == null ? 'NÃO VALIDADO' : `${kpis.margemOperacionalPct.toFixed(1)}%`} sub="Receita OS − custo persistido" testid="kpi-margem-os" />
        <KpiTile tone="peach" icon={Gift} label="Bônus da escala" value={fmtBRL(kpis.bonus)} sub={`Liberadas ${fmtBRL(stats.lib)} · Pagas ${fmtBRL(stats.pago)}`} testid="kpi-bonus" />
      </div>

      <div className="space-y-3" data-testid="quadros-funcionarios">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase">Quadro por funcionário comissionado</p>
            <p className="text-[11px] text-gray-500">Bruto = NF + OS concluída do cliente do comercial, a partir do cadastro. Cada cliente tem a linha do tempo OS Gerada › Faturado › Pago › Comissão.</p>
          </div>
        </div>
        {loading && funcionarios.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} /> Carregando quadros…</div>
        ) : funcionarios.length === 0 ? (
          <div className="bg-white border rounded-xl p-6 text-center text-sm text-gray-500">Nenhum comercial com faturamento ou OS neste filtro.</div>
        ) : funcionarios.map((f) => (
          <CardFuncionario
            key={f.id}
            quadro={f}
            dataInicio={iniciosComissao[f.id] || null}
            aberto={funcionarioAberto === f.id}
            onToggle={() => setFuncionarioAberto((prev) => prev === f.id ? null : f.id)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {empresaFilter !== 'TORRES' && (
          <TabelaQuadroEmpresa
            titulo="TM SEG — por cliente"
            linhas={quadroVisivel.tm}
            rows={rowsAposCadastro}
            cobertura={cobertura}
            vazio={loading ? 'Carregando faturamento…' : 'Sem faturamento TM SEG com comercial neste filtro. Vincule o responsável no cadastro do cliente. OS concluída sem NF do cliente vinculado entra no bruto após o cadastro.'}
            testid="quadro-tm-seg"
          />
        )}
        {empresaFilter !== 'TM_SEG' && (
          <TabelaQuadroEmpresa
            titulo="TORRES — por cliente"
            linhas={quadroVisivel.torres}
            rows={rowsAposCadastro}
            cobertura={cobertura}
            vazio={loading ? 'Carregando faturamento…' : 'Sem faturamento TORRES com comercial neste filtro. Use Sincronizar TM SEG + TORRES. Só entra cliente com responsável comercial no cadastro da TORRES.'}
            testid="quadro-torres"
          />
        )}
      </div>

      {stats.porComercial.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid="apuracao-escala-comercial">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase">Apuração do período (TM SEG + TORRES)</p>
            <p className="text-[11px] text-gray-500">Mesma base do quadro do funcionário. Imposto de 16% é abatido do bruto. Comissão = 3% do líquido, só a partir de R$ 50 mil. Total a pagar = comissão + fixo (+ bônus, se houver).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
                  <th className="text-left px-3 py-2">Comercial</th>
                  <th className="text-right px-3 py-2">Bruto TM SEG</th>
                  <th className="text-right px-3 py-2">Bruto TORRES</th>
                  <th className="text-right px-3 py-2">Bruto total</th>
                  <th className="text-right px-3 py-2">Líquido (−16%)</th>
                  <th className="text-right px-3 py-2">Fixo</th>
                  <th className="text-right px-3 py-2">Comissão 3%</th>
                  <th className="text-right px-3 py-2">Bônus</th>
                  <th className="text-right px-3 py-2">Total a pagar</th>
                </tr>
              </thead>
              <tbody>
                {stats.porComercial.map((c) => (
                  <tr key={c.id} className="border-t border-gray-50">
                    <td className="px-3 py-2 text-xs font-black uppercase">
                      {c.comercial}
                      {c.apuracao.abaixoDoPiso && <span className="ml-2 text-[9px] font-bold text-amber-700">Abaixo do piso</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.tm)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.torres)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.fat)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.apuracao.resultadoLiquido)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.apuracao.valorFixo)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.apuracao.comissaoPercentual)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(c.apuracao.bonusAcumulado)}</td>
                    <td className="px-3 py-2 text-right font-black">{fmtBRL(c.apuracao.totalAPagar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 flex items-center justify-center gap-2 text-gray-500 text-sm"><Loader2 className="animate-spin" size={16} /> Carregando comissões…</div>
      ) : rowsAposCadastro.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-500">Nenhuma comissão lançada para pagamento neste filtro. O quadro acima já lista o faturamento das faturas.</div>
      ) : (
        <div className="space-y-4">
          <BlocoListaComissao
            titulo="Liberado para pagamento"
            testId="comissoes-liberadas"
            vazio="Nenhuma comissão liberada para pagamento neste filtro."
            rows={listasComissao.liberadas}
            soma={listasComissao.somaLiberada}
            comissaoLinha={comissaoLinha}
            onLancar={(r) => { void lancarNoContasAPagar(r); }}
            lancandoId={lancandoId}
            onPagar={(r) => { setPaying(r); setFile(null); }}
            perfilFinanceiro={perfilFinanceiro}
            comprovantePorComissao={comprovantePorComissao}
            comprovantesCompletos={comprovantesCompletos}
            decorar={decorarLinha}
            podeTrocarNf={!soProprio}
            onTrocarFatura={trocarFaturaTorres}
          />
          <BlocoListaComissao
            titulo="Pendente"
            testId="comissoes-pendentes"
            vazio="Nenhuma comissão pendente neste filtro."
            rows={listasComissao.pendentes}
            soma={listasComissao.somaPendente}
            comissaoLinha={comissaoLinha}
            onLancar={(r) => { void lancarNoContasAPagar(r); }}
            lancandoId={lancandoId}
            onPagar={(r) => { setPaying(r); setFile(null); }}
            perfilFinanceiro={perfilFinanceiro}
            comprovantePorComissao={comprovantePorComissao}
            comprovantesCompletos={comprovantesCompletos}
            decorar={decorarLinha}
            podeTrocarNf={!soProprio}
            onTrocarFatura={trocarFaturaTorres}
          />
          <BlocoListaComissao
            titulo="Já pago"
            testId="comissoes-pagas"
            vazio="Nenhuma comissão paga neste filtro."
            rows={listasComissao.pagas}
            soma={listasComissao.somaPaga}
            comissaoLinha={comissaoLinha}
            onLancar={(r) => { void lancarNoContasAPagar(r); }}
            lancandoId={lancandoId}
            onPagar={(r) => { setPaying(r); setFile(null); }}
            perfilFinanceiro={perfilFinanceiro}
            comprovantePorComissao={comprovantePorComissao}
            comprovantesCompletos={comprovantesCompletos}
            decorar={decorarLinha}
            podeTrocarNf={!soProprio}
            onTrocarFatura={trocarFaturaTorres}
          />
        </div>
      )}


      {paying && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-testid="modal-pagar-comissao">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm uppercase">Pagar comissão</h3>
              <button type="button" onClick={() => setPaying(null)}><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-700">{paying.cliente_nome} · {fmtBRL(comissaoLinha(paying).valor)}</p>
            {paying.comerciais?.pix_chave && (
              <p className="text-xs text-gray-500 flex items-center gap-1"><Landmark size={12} /> PIX: {paying.comerciais.pix_chave}</p>
            )}
            <p className="text-xs text-gray-600" data-testid="comissao-pagamento-historico">
              Anexe o comprovante. A data e a hora deste pagamento ficam no histórico: {formatNowDateTimeBR()}.
            </p>
            <label className="block text-[10px] font-black text-gray-400 uppercase">
              Comprovante
              <input type="file" accept="image/*,.pdf" className="mt-1 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="input-comprovante-comissao" />
              <span className="mt-1 block normal-case font-bold text-gray-600">{file ? file.name : 'Nenhum arquivo selecionado'}</span>
            </label>
            <button type="button" disabled={savingPay || !file} onClick={() => void confirmarPagamento()} className="w-full bg-red-600 text-white rounded-lg py-2.5 text-xs font-black uppercase disabled:opacity-50">
              {savingPay ? 'Confirmando…' : 'Confirmar pagamento'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComissoesComerciaisPage;
