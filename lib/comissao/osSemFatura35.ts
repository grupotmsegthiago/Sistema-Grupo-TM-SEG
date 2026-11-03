/**
 * OS concluída há mais de 35 dias sem fatura vinculada.
 * Só lê. Não recalcula receita e não grava.
 * Data civil em America/Sao_Paulo. Mais de 35 dias: a conclusão é anterior a hoje − 35.
 */
import { osEstaFaturada } from './coberturaOsPeriodo.js';
import { fetchAllRows, casarClienteDaFatura, type ClienteComissaoMatch } from './sincronizarComissoesFaturas.js';
import type { ComissaoDbClient } from './comissaoCore.js';
import { dataIsoCivil } from './rotaMissaoComissao.js';

export const PRAZO_OS_SEM_FATURA_DIAS = 35;

export type OrigemOsSemFatura = 'TM SEG' | 'TORRES';
export type EstadoAlertaOs = 'ENCONTRADO' | 'NÃO EXISTE' | 'CONSULTA INCOMPLETA' | 'ERRO';
export type EstadoValorAlerta = 'ENCONTRADO' | 'NÃO VALIDADO';

export type OsAlerta35Entrada = {
  id: string;
  numero?: string | null;
  cliente?: string | null;
  comercialId?: string | null;
  status?: string | null;
  dataConclusao?: string | null;
  faturada: boolean;
  valor?: number | null;
};

export type OsSemFatura35 = {
  origem: OrigemOsSemFatura;
  id: string;
  numero: string;
  cliente: string;
  comercialId: string | null;
  dataConclusao: string;
  valor: number | null;
};

export type AlertaOsSemFatura35 = {
  estado: EstadoAlertaOs;
  prazoDias: number;
  hoje: string;
  limite: string;
  itens: OsSemFatura35[];
  semData: OsSemFatura35[];
  quantidade: number;
  valor: number | null;
  valorEstado: EstadoValorAlerta;
  torres: 'ENCONTRADO' | 'NÃO VALIDADO' | 'ERRO';
  error?: string;
};

export function dataCivilSaoPaulo(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
  return /^\d{4}-\d{2}-\d{2}$/.test(partes) ? partes : '';
}

export function somarDiasCivis(iso: string, dias: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').slice(0, 10));
  if (!m) return '';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

export function rotuloDataCivilBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').slice(0, 10));
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function statusOsConcluida(status: unknown): boolean {
  const s = String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return s === 'concluida' || s === 'faturada';
}

function valorPersistido(bruto: unknown): number | null {
  if (bruto == null || bruto === '') return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function fecharAlerta(args: {
  hoje: string;
  limite: string;
  itens: OsSemFatura35[];
  semData: OsSemFatura35[];
  estado: EstadoAlertaOs;
  torres: AlertaOsSemFatura35['torres'];
  error?: string;
}): AlertaOsSemFatura35 {
  const faltaValor = args.itens.some((os) => os.valor == null);
  const valor = faltaValor ? null : args.itens.reduce((s, os) => s + (os.valor || 0), 0);
  return {
    estado: args.estado,
    prazoDias: PRAZO_OS_SEM_FATURA_DIAS,
    hoje: args.hoje,
    limite: args.limite,
    itens: args.itens,
    semData: args.semData,
    quantidade: args.itens.length,
    valor: valor == null ? null : Math.round(valor * 100) / 100,
    valorEstado: faltaValor ? 'NÃO VALIDADO' : 'ENCONTRADO',
    torres: args.torres,
    error: args.error,
  };
}

export function alertaOsSemFaturaVazio(
  estado: EstadoAlertaOs,
  error?: string,
  hoje = dataCivilSaoPaulo(),
): AlertaOsSemFatura35 {
  return fecharAlerta({
    hoje,
    limite: somarDiasCivis(hoje, -PRAZO_OS_SEM_FATURA_DIAS),
    itens: [],
    semData: [],
    estado,
    torres: estado === 'ERRO' ? 'ERRO' : 'NÃO VALIDADO',
    error,
  });
}

export function montarAlertaOsSemFatura35(args: {
  hoje: string;
  tm: OsAlerta35Entrada[];
  torres: OsAlerta35Entrada[] | null;
  torresEstado?: AlertaOsSemFatura35['torres'];
  error?: string;
  erroFatal?: boolean;
}): AlertaOsSemFatura35 {
  const hoje = String(args.hoje || '').slice(0, 10);
  const limite = somarDiasCivis(hoje, -PRAZO_OS_SEM_FATURA_DIAS);
  if (!limite) {
    return alertaOsSemFaturaVazio('ERRO', 'Data de hoje inválida.', hoje);
  }
  const itens: OsSemFatura35[] = [];
  const semData: OsSemFatura35[] = [];
  const ler = (origem: OrigemOsSemFatura, lista: OsAlerta35Entrada[]) => {
    for (const os of lista || []) {
      if (!statusOsConcluida(os.status) || os.faturada) continue;
      const id = String(os.id || '').trim();
      if (!id) continue;
      const data = dataIsoCivil(os.dataConclusao);
      const linha: OsSemFatura35 = {
        origem,
        id,
        numero: String(os.numero || '').trim() || id,
        cliente: String(os.cliente || '').trim() || '—',
        comercialId: String(os.comercialId || '').trim() || null,
        dataConclusao: data || '',
        valor: valorPersistido(os.valor),
      };
      if (!data) {
        semData.push(linha);
        continue;
      }
      if (data < limite) itens.push(linha);
    }
  };
  ler('TM SEG', args.tm);
  const torresLida = args.torres != null;
  if (torresLida) ler('TORRES', args.torres || []);
  itens.sort((a, b) => a.dataConclusao.localeCompare(b.dataConclusao) || a.origem.localeCompare(b.origem) || a.id.localeCompare(b.id));
  const torres = args.torresEstado || (torresLida ? 'ENCONTRADO' : 'NÃO VALIDADO');
  const incompleta = !torresLida || torres !== 'ENCONTRADO';
  const estado: EstadoAlertaOs = args.erroFatal
    ? 'ERRO'
    : incompleta
      ? 'CONSULTA INCOMPLETA'
      : itens.length === 0
        ? 'NÃO EXISTE'
        : 'ENCONTRADO';
  return fecharAlerta({ hoje, limite, itens, semData, estado, torres, error: args.error });
}

export function filtrarAlertaOs35(
  alerta: AlertaOsSemFatura35 | undefined,
  comercialId: string,
): AlertaOsSemFatura35 | undefined {
  if (!alerta) return alerta;
  const id = String(comercialId || '').trim();
  if (!id) {
    return fecharAlerta({
      hoje: alerta.hoje,
      limite: alerta.limite,
      itens: [],
      semData: [],
      estado: alerta.estado,
      torres: alerta.torres,
      error: alerta.error,
    });
  }
  const fica = (os: OsSemFatura35) => os.comercialId === id;
  return fecharAlerta({
    hoje: alerta.hoje,
    limite: alerta.limite,
    itens: alerta.itens.filter(fica),
    semData: alerta.semData.filter(fica),
    estado: alerta.estado,
    torres: alerta.torres,
    error: alerta.error,
  });
}

function comercialDoCliente(
  nome: string | null | undefined,
  clients: ClienteComissaoMatch[],
): string | null {
  const match = casarClienteDaFatura(nome, clients);
  return match.status === 'ok' ? String(match.client?.responsavel_comercial_id || '').trim() || null : null;
}

export async function carregarAlertaOsSemFatura35(
  sb: ComissaoDbClient,
  sbTorres: ComissaoDbClient | null,
  hoje = dataCivilSaoPaulo(),
): Promise<AlertaOsSemFatura35> {
  const limite = somarDiasCivis(hoje, -PRAZO_OS_SEM_FATURA_DIAS);
  if (!limite) return alertaOsSemFaturaVazio('ERRO', 'Data de hoje inválida.', hoje);
  const missRes = await fetchAllRows(
    sb,
    'missions',
    'id, client, status, end_time, invoice_number, revenue_value',
    (q) => q.in('status', ['Concluída', 'Faturada']).lt('end_time', `${limite}T00:00:00`),
  );
  if (missRes.error) return alertaOsSemFaturaVazio('ERRO', missRes.error, hoje);
  const vinculosRes = await fetchAllRows(sb, 'financial_invoice_missions', 'mission_id');
  const cliRes = await fetchAllRows(sb, 'clients', 'id, name, trading_name, responsavel_comercial_id');
  if (vinculosRes.error || cliRes.error) {
    return alertaOsSemFaturaVazio('CONSULTA INCOMPLETA', vinculosRes.error || cliRes.error, hoje);
  }
  const idsVinculados = new Set<string>();
  for (const row of vinculosRes.rows || []) {
    const id = String(row.mission_id || '').trim();
    if (id) idsVinculados.add(id);
  }
  const clients = (cliRes.rows || []) as ClienteComissaoMatch[];
  const tm: OsAlerta35Entrada[] = (missRes.rows || []).map((row) => {
    const id = String(row.id || '').trim();
    return {
      id,
      numero: id,
      cliente: row.client,
      comercialId: comercialDoCliente(row.client, clients),
      status: row.status,
      dataConclusao: dataIsoCivil(row.end_time),
      faturada: osEstaFaturada({ invoiceNumber: row.invoice_number, missionId: id, idsVinculados }),
      valor: row.revenue_value,
    };
  });

  if (!sbTorres) {
    return montarAlertaOsSemFatura35({ hoje, tm, torres: null, torresEstado: 'NÃO VALIDADO' });
  }
  const osRes = await fetchAllRows(
    sbTorres,
    'service_orders',
    'id, os_number, status, completed_date, finished_at, revenue_value, client_id',
  );
  const invRes = await fetchAllRows(sbTorres, 'invoices', 'id, service_order_id');
  const billRes = await fetchAllRows(sbTorres, 'escort_billings', 'service_order_id, os_number, invoice_id');
  const cliTorres = await fetchAllRows(sbTorres, 'clients', 'id, name, nome_fantasia, razao_social, responsavel_comercial_id');
  if (osRes.error || invRes.error || billRes.error || cliTorres.error) {
    return montarAlertaOsSemFatura35({
      hoje,
      tm,
      torres: null,
      torresEstado: 'ERRO',
      error: osRes.error || invRes.error || billRes.error || cliTorres.error,
    });
  }
  const faturadas = new Set<string>();
  for (const row of invRes.rows || []) {
    const id = String(row.service_order_id || '').trim();
    if (id) faturadas.add(id);
  }
  for (const row of billRes.rows || []) {
    if (!String(row.invoice_id || '').trim()) continue;
    const id = String(row.service_order_id || '').trim();
    const numero = String(row.os_number || '').trim();
    if (id) faturadas.add(id);
    if (numero) faturadas.add(numero);
  }
  const nomeTorres = new Map<string, { nome: string; comercialId: string | null }>();
  for (const row of cliTorres.rows || []) {
    const id = String(row.id || '').trim();
    if (!id) continue;
    nomeTorres.set(id, {
      nome: String(row.razao_social || row.name || row.nome_fantasia || '').trim() || `Cliente ${id}`,
      comercialId: String(row.responsavel_comercial_id || '').trim() || null,
    });
  }
  const torres: OsAlerta35Entrada[] = (osRes.rows || []).map((row) => {
    const id = String(row.id || '').trim();
    const numero = String(row.os_number || '').trim();
    const cli = nomeTorres.get(String(row.client_id || '').trim());
    return {
      id,
      numero: numero || id,
      cliente: cli?.nome || '—',
      comercialId: cli?.comercialId || null,
      status: row.status,
      dataConclusao: dataIsoCivil(row.completed_date) || dataIsoCivil(row.finished_at),
      faturada: faturadas.has(id) || (numero ? faturadas.has(numero) : false),
      valor: row.revenue_value,
    };
  });
  return montarAlertaOsSemFatura35({ hoje, tm, torres, torresEstado: 'ENCONTRADO' });
}
