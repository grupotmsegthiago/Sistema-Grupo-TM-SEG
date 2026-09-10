/**
 * Painel de controle de faturamento (Diretoria).
 * Fail-closed: ausência de ciclo/vínculo/data ≠ “tudo faturado”.
 */

import {
  competenciaOs,
  diffDaysIso,
  isoInRange,
  labelCicloFaturamento,
  osExcluidaDoBoletim,
  parseCicloFaturamento,
  periodoEstaFechado,
  periodoQueContemData,
  periodosFechadosNoIntervalo,
  periodoVigente,
  type CicloFaturamento,
  type PeriodoFaturamento,
} from './cicloFaturamento.js';

export type EstadoDado =
  | 'ENCONTRADO'
  | 'NÃO EXISTE'
  | 'NÃO CARREGADO'
  | 'CONSULTA INCOMPLETA'
  | 'ERRO'
  | 'NÃO VALIDADO';

export type SemaforoFaturamento = 'ok' | 'alerta' | 'critico';

export type MissaoPainel = {
  id?: string | null;
  client?: string | null;
  status?: string | null;
  start_time?: string | null;
  billing_period_override?: string | null;
  billing_approved?: boolean | null;
  invoice_number?: string | null;
  exclude_from_billing?: boolean | null;
  revenue_value?: number | null;
};

export type ClientePainel = {
  id?: string | number | null;
  name?: string | null;
  trading_name?: string | null;
  status?: string | null;
  ciclo_faturamento?: string | null;
};

export type FaturaPainel = {
  id?: string | null;
  client?: string | null;
  number?: string | null;
  amount?: number | null;
  date?: string | null;
  status?: string | null;
  boleto_due_date?: string | null;
  notes?: string | null;
  period_start?: string | null;
  period_end?: string | null;
};

export type VinculoPainel = {
  invoice_id?: string | null;
  mission_id?: string | null;
};

export type ReceberPainel = {
  description?: string | null;
  notes?: string | null;
  status?: string | null;
  due_date?: string | null;
  payment_date?: string | null;
  amount?: number | null;
  entity_name?: string | null;
};

export type AlertaFaturamento = {
  severidade: 'critico' | 'alerta';
  tipo: 'OS_SEM_FATURA' | 'OS_SEM_APROVACAO' | 'CICLO_VENCIDO' | 'CICLO_NAO_CADASTRADO' | 'FATURA_ATRASADA' | 'OS_ABERTA';
  cliente: string;
  clienteId: string | null;
  periodo: string;
  detalhe: string;
  osIds: string[];
};

export type FilaClienteFaturamento = {
  cliente: string;
  clienteId: string | null;
  ciclo: CicloFaturamento | null;
  cicloLabel: string;
  periodo: string;
  osTotal: number;
  osFaturadas: number;
  osSemFatura: number;
  osSemAprovacao: number;
  osAbertas: number;
  semaforo: SemaforoFaturamento;
  estado: EstadoDado;
};

export type LinhaRelatorioFaturamento = {
  faturaId: string;
  cliente: string;
  periodo: string;
  periodoEstado: EstadoDado;
  dataFaturamento: string;
  dataPagamento: string | null;
  vencimento: string | null;
  diasAtraso: number | null;
  statusPagamento: 'PAGO' | 'EM ABERTO' | 'ATRASADO' | 'CANCELADA';
  valor: number;
  osVinculadas: number;
  osPeriodo: number | null;
  coberturaOk: boolean | null;
  coberturaEstado: EstadoDado;
};

export type KpisFaturamento = {
  semaforo: SemaforoFaturamento;
  estado: EstadoDado;
  osSemFaturaFechado: number;
  osSemAprovacaoFechado: number;
  osPendentesAberto: number;
  faturasEmAberto: number;
  faturasAtrasadas: number;
  clientesSemCiclo: number;
  clientesCriticos: number;
  coberturaPct: number | null;
  osCicloFechado: number;
  osFaturadasFechado: number;
};

export type PainelFaturamento = {
  estado: EstadoDado;
  error?: string;
  consultaIncompleta: boolean;
  todayIso: string;
  kpis: KpisFaturamento;
  fila: FilaClienteFaturamento[];
  alertas: AlertaFaturamento[];
  relatorio: LinhaRelatorioFaturamento[];
};

function normName(s: unknown): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function faturaCancelada(status: string | null | undefined): boolean {
  const s = String(status || '').toUpperCase();
  return s.includes('CANCEL');
}

function faturaPaga(status: string | null | undefined): boolean {
  const s = String(status || '').toUpperCase();
  return s === 'PAGA' || s === 'PAGO' || s === 'RECEIVED' || s === 'CONFIRMED';
}

function isoDate(v: unknown): string | null {
  const s = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function osFaturada(args: {
  invoiceNumber?: string | null;
  missionId?: string | null;
  idsVinculados: Set<string>;
}): boolean {
  const numero = String(args.invoiceNumber || '').trim();
  if (numero && numero !== '0') return true;
  const id = String(args.missionId || '').trim();
  return Boolean(id && args.idsVinculados.has(id));
}

function osAprovada(mission: { billing_approved?: boolean | null }): boolean {
  return mission.billing_approved === true;
}

function osAbertaOperacional(status: string | null | undefined): boolean {
  const s = String(status || '').trim();
  if (!s) return true;
  const low = s.toLowerCase();
  if (low === 'concluída' || low === 'concluida' || low === 'faturada' || low.includes('cancel')) return false;
  return true;
}

function matchCliente(missionClient: string, clients: ClientePainel[]): ClientePainel | null {
  const n = normName(missionClient);
  if (!n) return null;
  return (
    clients.find((c) => normName(c.name) === n || normName(c.trading_name) === n) ||
    null
  );
}

function displayCliente(c: ClientePainel | null, fallback: string): string {
  if (!c) return fallback || '—';
  return String(c.trading_name || c.name || fallback || '—').trim() || '—';
}

function clientIdOf(c: ClientePainel | null): string | null {
  if (c?.id == null) return null;
  return String(c.id);
}

function emptyKpis(estado: EstadoDado): KpisFaturamento {
  return {
    semaforo: estado === 'ENCONTRADO' ? 'ok' : 'alerta',
    estado,
    osSemFaturaFechado: 0,
    osSemAprovacaoFechado: 0,
    osPendentesAberto: 0,
    faturasEmAberto: 0,
    faturasAtrasadas: 0,
    clientesSemCiclo: 0,
    clientesCriticos: 0,
    coberturaPct: null,
    osCicloFechado: 0,
    osFaturadasFechado: 0,
  };
}

export function painelVazio(estado: EstadoDado, error?: string, todayIso = ''): PainelFaturamento {
  return {
    estado,
    error,
    consultaIncompleta: estado === 'CONSULTA INCOMPLETA' || estado === 'ERRO' || estado === 'NÃO CARREGADO',
    todayIso,
    kpis: emptyKpis(estado),
    fila: [],
    alertas: [],
    relatorio: [],
  };
}

function dataPagamentoDaFatura(
  fatura: FaturaPainel,
  receber: ReceberPainel[],
): { paid: string | null; estado: EstadoDado } {
  if (!faturaPaga(fatura.status)) return { paid: null, estado: 'ENCONTRADO' };
  const num = String(fatura.number || '').trim();
  const hits = receber.filter((t) => {
    const blob = `${t.description || ''} ${t.notes || ''}`;
    return num && blob.includes(num);
  });
  const paid = hits
    .map((t) => isoDate(t.payment_date))
    .filter((d): d is string => Boolean(d))
    .sort()[0] || null;
  if (paid) return { paid, estado: 'ENCONTRADO' };
  return { paid: null, estado: 'NÃO CARREGADO' };
}

function periodoDaFatura(
  fatura: FaturaPainel,
  ciclo: CicloFaturamento | null,
  osDoVinculo: Array<{ competencia: string | null }>,
): { label: string; start: string | null; end: string | null; estado: EstadoDado } {
  const ps = isoDate(fatura.period_start);
  const pe = isoDate(fatura.period_end);
  if (ps && pe) {
    const p = ciclo ? periodoQueContemData(ciclo, ps) : null;
    const label = p && p.start === ps && p.end === pe ? p.label : `${ps.slice(8, 10)}/${ps.slice(5, 7)}–${pe.slice(8, 10)}/${pe.slice(5, 7)}`;
    return { label, start: ps, end: pe, estado: 'ENCONTRADO' };
  }
  const comps = osDoVinculo.map((o) => o.competencia).filter((d): d is string => Boolean(d)).sort();
  if (ciclo && comps[0]) {
    const p = periodoQueContemData(ciclo, comps[0]);
    if (p) return { label: p.label, start: p.start, end: p.end, estado: 'ENCONTRADO' };
  }
  if (comps.length) {
    return {
      label: `${comps[0]} → ${comps[comps.length - 1]}`,
      start: comps[0],
      end: comps[comps.length - 1],
      estado: 'NÃO VALIDADO',
    };
  }
  const d = isoDate(fatura.date);
  if (ciclo && d) {
    const p = periodoQueContemData(ciclo, d);
    if (p) return { label: p.label, start: p.start, end: p.end, estado: 'NÃO VALIDADO' };
  }
  return { label: '—', start: null, end: null, estado: 'NÃO VALIDADO' };
}

export function montarPainelFaturamento(args: {
  todayIso: string;
  lookbackStart: string;
  clients: ClientePainel[];
  missions: MissaoPainel[];
  invoices: FaturaPainel[];
  vinculos: VinculoPainel[];
  receber: ReceberPainel[];
  consultaIncompleta?: boolean;
  error?: string;
}): PainelFaturamento {
  const today = String(args.todayIso || '').slice(0, 10);
  if (!today) return painelVazio('NÃO VALIDADO', 'Data de hoje indisponível');
  if (args.error && !(args.missions || []).length && !(args.invoices || []).length) {
    return painelVazio('ERRO', args.error, today);
  }
  if (args.consultaIncompleta) {
    const base = montarPainelFaturamento({ ...args, consultaIncompleta: false, error: undefined });
    return {
      ...base,
      estado: 'CONSULTA INCOMPLETA',
      consultaIncompleta: true,
      error: args.error,
      kpis: { ...base.kpis, estado: 'CONSULTA INCOMPLETA', semaforo: 'critico' },
    };
  }

  const ativos = (args.clients || []).filter((c) => String(c.status || 'Ativo') === 'Ativo');
  const idsVinculados = new Set<string>();
  const osPorFatura = new Map<string, string[]>();
  for (const v of args.vinculos || []) {
    const mid = String(v.mission_id || '').trim();
    const iid = String(v.invoice_id || '').trim();
    if (mid) idsVinculados.add(mid);
    if (iid && mid) {
      const arr = osPorFatura.get(iid) || [];
      arr.push(mid);
      osPorFatura.set(iid, arr);
    }
  }

  type OsNorm = {
    id: string;
    clienteNome: string;
    cliente: ClientePainel | null;
    ciclo: CicloFaturamento | null;
    competencia: string | null;
    aprovada: boolean;
    faturada: boolean;
    aberta: boolean;
    status: string;
  };

  const osNorm: OsNorm[] = [];
  for (const m of args.missions || []) {
    if (osExcluidaDoBoletim(m)) continue;
    const id = String(m.id || '').trim();
    if (!id) continue;
    const cliente = matchCliente(String(m.client || ''), ativos.length ? ativos : args.clients);
    osNorm.push({
      id,
      clienteNome: displayCliente(cliente, String(m.client || '—')),
      cliente,
      ciclo: parseCicloFaturamento(cliente?.ciclo_faturamento),
      competencia: competenciaOs(m),
      aprovada: osAprovada(m),
      faturada: osFaturada({ invoiceNumber: m.invoice_number, missionId: id, idsVinculados }),
      aberta: osAbertaOperacional(m.status),
      status: String(m.status || ''),
    });
  }

  const alertas: AlertaFaturamento[] = [];
  const filaMap = new Map<string, FilaClienteFaturamento>();

  const upsertFila = (row: FilaClienteFaturamento) => {
    const key = `${row.clienteId || row.cliente}|${row.periodo}`;
    const prev = filaMap.get(key);
    if (!prev) {
      filaMap.set(key, row);
      return;
    }
    prev.osTotal += row.osTotal;
    prev.osFaturadas += row.osFaturadas;
    prev.osSemFatura += row.osSemFatura;
    prev.osSemAprovacao += row.osSemAprovacao;
    prev.osAbertas += row.osAbertas;
    if (row.semaforo === 'critico' || prev.semaforo === 'critico') prev.semaforo = 'critico';
    else if (row.semaforo === 'alerta' || prev.semaforo === 'alerta') prev.semaforo = 'alerta';
  };

  let osCicloFechado = 0;
  let osFaturadasFechado = 0;
  let osSemFaturaFechado = 0;
  let osSemAprovacaoFechado = 0;
  let osPendentesAberto = 0;

  const clientesSemCicloList = ativos.filter((c) => !parseCicloFaturamento(c.ciclo_faturamento));

  const byCliente = new Map<string, { client: ClientePainel | null; ciclo: CicloFaturamento | null; os: OsNorm[] }>();
  for (const os of osNorm) {
    const key = os.cliente ? `id:${os.cliente.id}` : `nome:${normName(os.clienteNome)}`;
    const prev = byCliente.get(key) || { client: os.cliente, ciclo: os.ciclo, os: [] as OsNorm[] };
    prev.os.push(os);
    if (!prev.client && os.cliente) prev.client = os.cliente;
    if (!prev.ciclo && os.ciclo) prev.ciclo = os.ciclo;
    byCliente.set(key, prev);
  }

  for (const c of ativos) {
    const key = `id:${c.id}`;
    if (!byCliente.has(key)) {
      byCliente.set(key, { client: c, ciclo: parseCicloFaturamento(c.ciclo_faturamento), os: [] });
    }
  }

  for (const group of byCliente.values()) {
    const ciclo = group.ciclo;
    const nome = displayCliente(group.client, group.os[0]?.clienteNome || '—');
    const cid = clientIdOf(group.client);

    if (!ciclo) {
      // Sem ciclo no cadastro não dá para saber o prazo. Não inventa atraso.
      continue;
    }

    const vigentes = periodoVigente(ciclo, today);
    const fechados = periodosFechadosNoIntervalo(ciclo, args.lookbackStart, today, today);

    for (const periodo of fechados) {
      const noPeriodo = group.os.filter((o) => o.competencia && isoInRange(o.competencia, periodo.start, periodo.end));
      if (!noPeriodo.length) continue;
      const semFatura = noPeriodo.filter((o) => !o.faturada);
      const semAprov = noPeriodo.filter((o) => !o.aprovada);
      const abertas = noPeriodo.filter((o) => o.aberta);
      osCicloFechado += noPeriodo.length;
      osFaturadasFechado += noPeriodo.length - semFatura.length;
      osSemFaturaFechado += semFatura.length;
      osSemAprovacaoFechado += semAprov.length;

      const semaforo: SemaforoFaturamento =
        semFatura.length || semAprov.length || abertas.length ? 'critico' : 'ok';

      if (semaforo !== 'ok') {
        upsertFila({
          cliente: nome,
          clienteId: cid,
          ciclo,
          cicloLabel: labelCicloFaturamento(ciclo),
          periodo: periodo.label,
          osTotal: noPeriodo.length,
          osFaturadas: noPeriodo.length - semFatura.length,
          osSemFatura: semFatura.length,
          osSemAprovacao: semAprov.length,
          osAbertas: abertas.length,
          semaforo,
          estado: 'ENCONTRADO',
        });
      }

      if (semFatura.length) {
        alertas.push({
          severidade: 'critico',
          tipo: 'OS_SEM_FATURA',
          cliente: nome,
          clienteId: cid,
          periodo: periodo.label,
          detalhe: `${semFatura.length} OS sem fatura`,
          osIds: semFatura.map((o) => o.id),
        });
      }
      if (semAprov.length) {
        alertas.push({
          severidade: 'critico',
          tipo: 'OS_SEM_APROVACAO',
          cliente: nome,
          clienteId: cid,
          periodo: periodo.label,
          detalhe: `${semAprov.length} OS sem APROVADA`,
          osIds: semAprov.map((o) => o.id),
        });
      }
      if (abertas.length) {
        alertas.push({
          severidade: 'alerta',
          tipo: 'OS_ABERTA',
          cliente: nome,
          clienteId: cid,
          periodo: periodo.label,
          detalhe: `${abertas.length} OS ainda não concluída`,
          osIds: abertas.map((o) => o.id),
        });
      }
    }

    if (vigentes && !periodoEstaFechado(vigentes, today)) {
      const noPeriodo = group.os.filter((o) => o.competencia && isoInRange(o.competencia, vigentes.start, vigentes.end));
      osPendentesAberto += noPeriodo.filter((o) => !o.aprovada).length;
    }
  }

  const osById = new Map(osNorm.map((o) => [o.id, o]));
  const relatorio: LinhaRelatorioFaturamento[] = [];
  let faturasEmAberto = 0;
  let faturasAtrasadas = 0;

  for (const inv of args.invoices || []) {
    if (faturaCancelada(inv.status)) continue;
    const cliente = matchCliente(String(inv.client || ''), ativos.length ? ativos : args.clients);
    const ciclo = parseCicloFaturamento(cliente?.ciclo_faturamento);
    const ids = osPorFatura.get(String(inv.id || '')) || [];
    const osVinc = ids.map((id) => osById.get(id)).filter((o): o is OsNorm => Boolean(o));
    const periodo = periodoDaFatura(
      inv,
      ciclo,
      osVinc.map((o) => ({ competencia: o.competencia })),
    );
    const { paid, estado: pagoEstado } = dataPagamentoDaFatura(inv, args.receber);
    const venc = isoDate(inv.boleto_due_date);
    const paga = faturaPaga(inv.status);
    let statusPagamento: LinhaRelatorioFaturamento['statusPagamento'] = 'EM ABERTO';
    let dias: number | null = null;
    if (paga) {
      statusPagamento = 'PAGO';
      dias = paid && venc ? Math.max(0, diffDaysIso(venc, paid) || 0) : pagoEstado === 'NÃO CARREGADO' ? null : 0;
    } else if (venc && venc < today) {
      statusPagamento = 'ATRASADO';
      dias = diffDaysIso(venc, today);
      faturasAtrasadas += 1;
      faturasEmAberto += 1;
      alertas.push({
        severidade: 'critico',
        tipo: 'FATURA_ATRASADA',
        cliente: displayCliente(cliente, String(inv.client || '—')),
        clienteId: clientIdOf(cliente),
        periodo: periodo.label,
        detalhe: `${dias ?? '?'} dia(s) após o vencimento`,
        osIds: ids,
      });
    } else {
      faturasEmAberto += 1;
    }

    let osPeriodo: number | null = null;
    let coberturaOk: boolean | null = null;
    let coberturaEstado: EstadoDado = 'NÃO VALIDADO';
    if (periodo.start && periodo.end) {
      const noPeriodo = osNorm.filter((o) => {
        const same = cliente
          ? o.cliente?.id != null && String(o.cliente.id) === String(cliente.id)
          : normName(o.clienteNome) === normName(inv.client);
        return same && o.competencia && isoInRange(o.competencia, periodo.start!, periodo.end!);
      });
      osPeriodo = noPeriodo.length;
      coberturaOk = noPeriodo.length > 0 && noPeriodo.every((o) => o.faturada);
      coberturaEstado = 'ENCONTRADO';
    }

    relatorio.push({
      faturaId: String(inv.id || ''),
      cliente: displayCliente(cliente, String(inv.client || '—')),
      periodo: periodo.label,
      periodoEstado: periodo.estado,
      dataFaturamento: isoDate(inv.date) || '—',
      dataPagamento: paid,
      vencimento: venc,
      diasAtraso: dias,
      statusPagamento,
      valor: Number(inv.amount) || 0,
      osVinculadas: ids.length,
      osPeriodo,
      coberturaOk,
      coberturaEstado,
    });
  }

  relatorio.sort((a, b) => String(b.dataFaturamento).localeCompare(String(a.dataFaturamento)) || a.cliente.localeCompare(b.cliente, 'pt-BR'));

  const fila = [...filaMap.values()].sort((a, b) => {
    const rank = (s: SemaforoFaturamento) => (s === 'critico' ? 0 : s === 'alerta' ? 1 : 2);
    return rank(a.semaforo) - rank(b.semaforo) || b.osSemFatura - a.osSemFatura || a.cliente.localeCompare(b.cliente, 'pt-BR');
  });

  alertas.sort((a, b) => (a.severidade === 'critico' && b.severidade !== 'critico' ? -1 : a.severidade !== 'critico' && b.severidade === 'critico' ? 1 : a.cliente.localeCompare(b.cliente, 'pt-BR')));

  const clientesCriticos = new Set(fila.filter((f) => f.semaforo === 'critico').map((f) => f.clienteId || f.cliente)).size;
  const coberturaPct =
    osCicloFechado > 0 ? Math.round((osFaturadasFechado / osCicloFechado) * 1000) / 10 : osCicloFechado === 0 ? 100 : null;

  const temBuraco = osSemFaturaFechado > 0 || osSemAprovacaoFechado > 0 || faturasAtrasadas > 0;
  const temAlerta = clientesSemCicloList.length > 0 || fila.some((f) => f.semaforo === 'alerta');
  const semaforo: SemaforoFaturamento = temBuraco ? 'critico' : temAlerta ? 'alerta' : 'ok';

  return {
    estado: 'ENCONTRADO',
    consultaIncompleta: false,
    todayIso: today,
    kpis: {
      semaforo,
      estado: 'ENCONTRADO',
      osSemFaturaFechado,
      osSemAprovacaoFechado,
      osPendentesAberto,
      faturasEmAberto,
      faturasAtrasadas,
      clientesSemCiclo: clientesSemCicloList.length,
      clientesCriticos,
      coberturaPct,
      osCicloFechado,
      osFaturadasFechado,
    },
    fila,
    alertas,
    relatorio,
  };
}
