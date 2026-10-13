/**
 * Auditoria de divergência Fatura ↔ soma das OS (e comissão).
 * Só considera faturas com vínculo em financial_invoice_missions.
 * Consulta incompleta ≠ “sem divergência”.
 */
import { supabase } from '../supabase';
import { roundMoney } from '../comissao/comissaoCalc';
import {
  deveSincronizarStatusFatura,
  somarReceitasOs,
  type InvoiceSyncClient,
  type ReceitaOsFaturaInput,
} from './sincronizarFaturaAberta';

export const DIVERGENCIA_TOLERANCIA_BRL = 0.01;

export type EstadoDivergencia = 'DIVERGENTE' | 'CONSULTA_INCOMPLETA';

export type ItemDivergenciaFinanceira = {
  invoiceId: string;
  faturaNumero: string | null;
  cliente: string;
  status: string;
  valorOs: number;
  valorFatura: number;
  valorComissaoFaturamento: number | null;
  diferencaFatura: number;
  diferencaComissao: number | null;
  osCount: number;
  missionIdSync: string;
  estado: EstadoDivergencia;
  podeSincronizar: boolean;
  /** Só vai ao cockpit da Diretoria depois que outra NF do mesmo cliente foi vinculada e a diferença continua. */
  escalarDiretoria: boolean;
  nfsVinculadas: string[];
};

export type AuditoriaDivergenciasResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  consultaIncompleta?: boolean;
  items: ItemDivergenciaFinanceira[];
  error?: string;
};

export type EntradaAuditoriaFatura = {
  invoiceId: string;
  faturaNumero?: string | null;
  cliente?: string | null;
  status?: string | null;
  valorFatura: number;
  valorOs: number;
  valorComissaoFaturamento?: number | null;
  osCount: number;
  missionIdSync: string;
  consultaOsIncompleta?: boolean;
};

const MISSION_SELECT =
  'id, revenue_value, toll_value, toll_value_provider, displacement_value';

function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === '42703' || /does not exist/i.test(String(error.message || ''));
}

export function valoresDivergem(a: number, b: number, tolerancia = DIVERGENCIA_TOLERANCIA_BRL): boolean {
  return Math.abs(roundMoney(roundMoney(a) - roundMoney(b))) > tolerancia;
}

export function avaliarDivergenciaFatura(entrada: EntradaAuditoriaFatura): ItemDivergenciaFinanceira | null {
  const status = String(entrada.status || '').trim().toUpperCase();
  const valorOs = roundMoney(entrada.valorOs);
  const valorFatura = roundMoney(entrada.valorFatura);
  const valorComissao = entrada.valorComissaoFaturamento == null
    ? null
    : roundMoney(entrada.valorComissaoFaturamento);
  const base: ItemDivergenciaFinanceira = {
    invoiceId: String(entrada.invoiceId),
    faturaNumero: entrada.faturaNumero || null,
    cliente: String(entrada.cliente || '—').trim() || '—',
    status,
    valorOs,
    valorFatura,
    valorComissaoFaturamento: valorComissao,
    diferencaFatura: roundMoney(valorOs - valorFatura),
    diferencaComissao: valorComissao == null ? null : roundMoney(valorOs - valorComissao),
    osCount: entrada.osCount,
    missionIdSync: String(entrada.missionIdSync || ''),
    estado: 'DIVERGENTE',
    podeSincronizar: deveSincronizarStatusFatura(status),
    escalarDiretoria: false,
    nfsVinculadas: [],
  };

  if (entrada.consultaOsIncompleta) {
    return { ...base, estado: 'CONSULTA_INCOMPLETA', podeSincronizar: false };
  }

  const fatDiverge = valoresDivergem(valorOs, valorFatura);
  const comDiverge = valorComissao != null && valoresDivergem(valorOs, valorComissao);
  if (!fatDiverge && !comDiverge) return null;
  return base;
}

export function filtrarDivergenciasAbertas(
  items: ItemDivergenciaFinanceira[] | null | undefined,
): ItemDivergenciaFinanceira[] {
  return (items || []).filter((i) => deveSincronizarStatusFatura(i.status));
}

export function filtrarDivergenciasDiretoria(
  items: ItemDivergenciaFinanceira[] | null | undefined,
): ItemDivergenciaFinanceira[] {
  return filtrarDivergenciasAbertas(items).filter((i) => i.escalarDiretoria);
}

/** O financeiro já viu a linha. Ela sai da auditoria, sem alterar valor de OS, NF ou comissão. */
export function filtrarDivergenciasNaoVerificadas(
  items: ItemDivergenciaFinanceira[] | null | undefined,
  invoiceIdsVistos: Iterable<string> | null | undefined,
): ItemDivergenciaFinanceira[] {
  const vistos = new Set(
    [...(invoiceIdsVistos || [])].map((id) => String(id || '').trim()).filter(Boolean),
  );
  return (items || []).filter((item) => !vistos.has(item.invoiceId));
}

/** O vínculo escolhe outra fatura que já está nesta auditoria. */
export function candidatasDaMesmaAuditoria(
  items: ItemDivergenciaFinanceira[] | null | undefined,
  invoiceIdAtual: string,
): Array<{ id: string; client: string; number: string | null; amount: number }> {
  const atual = String(invoiceIdAtual || '').trim();
  return (items || [])
    .filter((item) => item.invoiceId && item.invoiceId !== atual)
    .map((item) => ({
      id: item.invoiceId,
      client: item.cliente,
      number: item.faturaNumero,
      amount: item.valorFatura,
    }));
}

function normalizarNomeCliente(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** CNPJ separado ainda é o mesmo cliente quando o nome coincide ou um contém o outro. */
export function nfEhDoMesmoCliente(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarNomeCliente(a);
  const nb = normalizarNomeCliente(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length < 8 || nb.length < 8) return false;
  return na.startsWith(nb) || nb.startsWith(na);
}

export type ClienteComCnpj = {
  name?: string | null;
  trading_name?: string | null;
  cnpj?: string | null;
};

export function somenteDigitosCnpj(value: string | null | undefined): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 || digits.length === 14 ? digits : '';
}

export function formatarCnpj(value: string | null | undefined): string | null {
  const digits = somenteDigitosCnpj(value);
  if (digits.length !== 14) return digits || null;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** CNPJs cadastrados para o nome da fatura. Vazio quando o cliente não está no cadastro. */
export function cnpjsDoNome(nome: string | null | undefined, clientes: ClienteComCnpj[]): string[] {
  const docs = new Set<string>();
  for (const cliente of clientes) {
    const bate = nfEhDoMesmoCliente(nome, cliente.name) || nfEhDoMesmoCliente(nome, cliente.trading_name);
    if (!bate) continue;
    const doc = somenteDigitosCnpj(cliente.cnpj);
    if (doc) docs.add(doc);
  }
  return [...docs];
}

/**
 * A lista de vínculo mostra a NF quando ela é de outro CNPJ.
 * O mesmo CNPJ fica de fora. Sem cadastro, entra se o nome não for o mesmo cliente.
 */
export function faturaEhDeOutroCnpj(
  clienteAtual: string | null | undefined,
  clienteFatura: string | null | undefined,
  clientes: ClienteComCnpj[],
): boolean {
  const atuais = cnpjsDoNome(clienteAtual, clientes);
  const daFatura = cnpjsDoNome(clienteFatura, clientes);
  if (atuais.length === 0 || daFatura.length === 0) {
    return !nfEhDoMesmoCliente(clienteAtual, clienteFatura);
  }
  return daFatura.every((doc) => !atuais.includes(doc));
}

export type FaturaParaGrupoNf = {
  invoiceId: string;
  faturaNumero: string | null;
  cliente: string;
  status: string;
  valorFatura: number;
  missionIds: string[];
  consultaOsIncompleta: boolean;
  valorComissaoFaturamento: number | null;
};

export type VinculoNf = { invoiceId: string; outraInvoiceId: string };

/**
 * Junta NFs vinculadas do mesmo cliente.
 * A Diretoria só vê o grupo se, somando a outra NF e as OS dela, a diferença continuar.
 */
export function consolidarDivergenciasComNf(
  faturas: FaturaParaGrupoNf[],
  valorPorMissao: Record<string, number>,
  vinculos: VinculoNf[],
): ItemDivergenciaFinanceira[] {
  const porId = new Map(faturas.map((f) => [f.invoiceId, f]));
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) || id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const unite = (a: string, b: string) => {
    if (!porId.has(a) || !porId.has(b)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const f of faturas) parent.set(f.invoiceId, f.invoiceId);
  for (const v of vinculos) unite(v.invoiceId, v.outraInvoiceId);

  const grupos = new Map<string, FaturaParaGrupoNf[]>();
  for (const f of faturas) {
    const root = find(f.invoiceId);
    const list = grupos.get(root) || [];
    list.push(f);
    grupos.set(root, list);
  }

  const items: ItemDivergenciaFinanceira[] = [];
  for (const grupo of grupos.values()) {
    const abertas = grupo.filter((f) => deveSincronizarStatusFatura(f.status));
    const principal = abertas[0] || grupo[0];
    if (!principal) continue;
    const missionIds = [...new Set(grupo.flatMap((f) => f.missionIds))];
    const incompleta = grupo.some((f) => f.consultaOsIncompleta) || missionIds.some((id) => valorPorMissao[id] == null);
    let valorOs = 0;
    if (!incompleta) {
      for (const id of missionIds) valorOs = roundMoney(valorOs + (Number(valorPorMissao[id]) || 0));
    }
    const valorFatura = grupo.reduce((s, f) => roundMoney(s + (Number(f.valorFatura) || 0)), 0);
    const outras = grupo.filter((f) => f.invoiceId !== principal.invoiceId);
    const item = avaliarDivergenciaFatura({
      invoiceId: principal.invoiceId,
      faturaNumero: principal.faturaNumero,
      cliente: principal.cliente,
      status: principal.status,
      valorFatura,
      valorOs,
      valorComissaoFaturamento: principal.valorComissaoFaturamento,
      osCount: missionIds.length,
      missionIdSync: missionIds[0] || '',
      consultaOsIncompleta: incompleta,
    });
    if (!item) continue;
    item.escalarDiretoria = outras.length > 0;
    item.nfsVinculadas = outras.map((f) => f.faturaNumero || f.invoiceId);
    items.push(item);
  }
  return items;
}

async function fetchAllRows(
  sb: InvoiceSyncClient,
  table: string,
  columns: string,
): Promise<{ rows: any[]; complete: boolean; error?: string }> {
  const rows: any[] = [];
  let from = 0;
  const page = 1000;
  const max = 50_000;
  while (rows.length < max) {
    const to = from + page - 1;
    let q = sb.from(table).select(columns);
    if (typeof q.range === 'function') q = q.range(from, to);
    const { data, error } = await q;
    if (error) {
      return { rows: [], complete: false, error: error.message };
    }
    const batch = data || [];
    rows.push(...batch);
    if (typeof q.range !== 'function') {
      return { rows, complete: true };
    }
    if (batch.length < page) return { rows, complete: true };
    from += batch.length;
  }
  return { rows, complete: false };
}

async function fetchByIds<T>(
  sb: InvoiceSyncClient,
  table: string,
  columns: string,
  idField: string,
  ids: string[],
): Promise<{ data: T[]; error?: string }> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await sb.from(table).select(columns).in(idField, chunk);
    if (error) return { data: [], error: error.message };
    out.push(...((data || []) as T[]));
  }
  return { data: out };
}

function pickComissaoFaturamento(rows: Array<{ valor_faturamento?: number | null; status?: string | null }>): number | null {
  const vivos = (rows || []).filter((r) => String(r.status || '').toUpperCase() !== 'CANCELADO');
  if (vivos.length === 0) return null;
  const aguardando = vivos.find((r) => String(r.status || '').toUpperCase() === 'AGUARDANDO_PAGAMENTO_CLIENTE');
  const escolhida = aguardando || vivos[0];
  return Number(escolhida.valor_faturamento) || 0;
}

export async function auditarDivergenciasInvoices(
  opts?: { sb?: InvoiceSyncClient },
): Promise<AuditoriaDivergenciasResult> {
  const sb = opts?.sb || supabase;
  try {
    const vinculosRes = await fetchAllRows(sb, 'financial_invoice_missions', 'invoice_id, mission_id');
    if (vinculosRes.error) {
      if (isMissingRelation({ message: vinculosRes.error })) {
        return { ok: true, skipped: true, reason: 'tabela_vinculo_ausente', items: [] };
      }
      return { ok: false, items: [], error: vinculosRes.error };
    }

    const byInvoice = new Map<string, string[]>();
    for (const row of vinculosRes.rows) {
      const invoiceId = String(row.invoice_id || '').trim();
      const missionId = String(row.mission_id || '').trim();
      if (!invoiceId || !missionId) continue;
      const list = byInvoice.get(invoiceId) || [];
      if (!list.includes(missionId)) list.push(missionId);
      byInvoice.set(invoiceId, list);
    }

    const invoiceIds = [...byInvoice.keys()];
    if (invoiceIds.length === 0) {
      return { ok: true, items: [], consultaIncompleta: !vinculosRes.complete };
    }

    const fatRes = await fetchByIds<{
      id: string;
      client?: string | null;
      number?: string | null;
      status?: string | null;
      amount?: number | null;
    }>(sb, 'financial_invoices', 'id, client, number, status, amount', 'id', invoiceIds);
    if (fatRes.error) return { ok: false, items: [], error: fatRes.error };

    const allMissionIds = [...new Set(invoiceIds.flatMap((id) => byInvoice.get(id) || []))];
    const missRes = await fetchByIds<ReceitaOsFaturaInput>(
      sb,
      'missions',
      MISSION_SELECT,
      'id',
      allMissionIds,
    );
    if (missRes.error) return { ok: false, items: [], error: missRes.error };

    const missionsById = new Map<string, ReceitaOsFaturaInput>();
    for (const m of missRes.data) {
      const id = String(m.id || '').trim();
      if (id) missionsById.set(id, m);
    }

    const comResFat = await fetchByIds<{
      fatura_id?: string | null;
      origem_fatura_id?: string | null;
      valor_faturamento?: number | null;
      status?: string | null;
    }>(
      sb,
      'comissoes',
      'fatura_id, origem_fatura_id, valor_faturamento, status',
      'fatura_id',
      invoiceIds,
    );
    const comResOrig = await fetchByIds<{
      fatura_id?: string | null;
      origem_fatura_id?: string | null;
      valor_faturamento?: number | null;
      status?: string | null;
    }>(
      sb,
      'comissoes',
      'fatura_id, origem_fatura_id, valor_faturamento, status',
      'origem_fatura_id',
      invoiceIds,
    );
    const comErr = comResFat.error || comResOrig.error;
    if (comErr && !isMissingRelation({ message: comErr })) {
      return { ok: false, items: [], error: comErr };
    }

    const comByInvoice = new Map<string, Array<{ valor_faturamento?: number | null; status?: string | null }>>();
    for (const c of [...(comResFat.data || []), ...(comResOrig.data || [])]) {
      const key = String(c.fatura_id || c.origem_fatura_id || '').trim();
      if (!key) continue;
      const list = comByInvoice.get(key) || [];
      list.push(c);
      comByInvoice.set(key, list);
    }

    const valorPorMissao: Record<string, number> = {};
    for (const [id, mission] of missionsById) {
      valorPorMissao[id] = somarReceitasOs([mission]);
    }

    const nfVinculosRes = await fetchAllRows(sb, 'financial_invoice_nf_vinculos', 'invoice_id, outra_invoice_id');
    const vinculos: VinculoNf[] = [];
    if (!nfVinculosRes.error) {
      for (const row of nfVinculosRes.rows) {
        const invoiceId = String(row.invoice_id || '').trim();
        const outraInvoiceId = String(row.outra_invoice_id || '').trim();
        if (invoiceId && outraInvoiceId) vinculos.push({ invoiceId, outraInvoiceId });
      }
    } else if (!isMissingRelation({ message: nfVinculosRes.error })) {
      return { ok: false, items: [], error: nfVinculosRes.error };
    }

    const conhecidas = new Set(fatRes.data.map((f) => String(f.id)));
    const extrasIds = [...new Set(vinculos.flatMap((v) => [v.invoiceId, v.outraInvoiceId]))].filter((id) => !conhecidas.has(id));
    let faturasFonte = fatRes.data;
    if (extrasIds.length > 0) {
      const extraRes = await fetchByIds<{
        id: string;
        client?: string | null;
        number?: string | null;
        status?: string | null;
        amount?: number | null;
      }>(sb, 'financial_invoices', 'id, client, number, status, amount', 'id', extrasIds);
      if (extraRes.error) return { ok: false, items: [], error: extraRes.error };
      faturasFonte = [...fatRes.data, ...extraRes.data];
    }

    const faturasGrupo: FaturaParaGrupoNf[] = faturasFonte.map((fatura) => {
      const invoiceId = String(fatura.id);
      const missionIds = byInvoice.get(invoiceId) || [];
      const found = missionIds.map((id) => missionsById.get(id)).filter(Boolean) as ReceitaOsFaturaInput[];
      return {
        invoiceId,
        faturaNumero: fatura.number || null,
        cliente: String(fatura.client || ''),
        status: String(fatura.status || ''),
        valorFatura: Number(fatura.amount) || 0,
        missionIds,
        consultaOsIncompleta: found.length !== missionIds.length,
        valorComissaoFaturamento: pickComissaoFaturamento(comByInvoice.get(invoiceId) || []),
      };
    });
    const items = consolidarDivergenciasComNf(faturasGrupo, valorPorMissao, vinculos);
    const vistasRes = await fetchAllRows(sb, 'financial_invoice_divergencia_vista', 'invoice_id');
    if (vistasRes.error && !isMissingRelation({ message: vistasRes.error })) {
      return { ok: false, items: [], error: vistasRes.error };
    }
    if (!vistasRes.error && !vistasRes.complete) {
      return { ok: false, items: [], error: 'Consulta incompleta das divergências já verificadas.' };
    }
    const vistas = (vistasRes.rows || []).map((row) => String(row.invoice_id || '').trim()).filter(Boolean);

    return {
      ok: true,
      items: filtrarDivergenciasNaoVerificadas(items, vistas),
      consultaIncompleta: !vinculosRes.complete || fatRes.data.length !== invoiceIds.length,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[BILLING_AUDIT_DIVERGENCE]', message);
    return { ok: false, items: [], error: message };
  }
}

export async function listarNfCandidatasDoCliente(
  cliente: string,
  excluirIds: string[],
  opts?: { sb?: InvoiceSyncClient },
): Promise<{ ok: boolean; itens: Array<{ id: string; client: string; number: string | null; amount: number; status: string; cnpj: string | null }>; error?: string }> {
  const sb = opts?.sb || supabase;
  const res = await fetchAllRows(sb, 'financial_invoices', 'id, client, number, amount, status');
  if (res.error) return { ok: false, itens: [], error: res.error };
  const clientesRes = await fetchAllRows(sb, 'clients', 'name, trading_name, cnpj');
  if (clientesRes.error) return { ok: false, itens: [], error: clientesRes.error };
  if (!res.complete || !clientesRes.complete) {
    return { ok: false, itens: [], error: 'Consulta incompleta das NFs ou dos CNPJs.' };
  }
  const clientes = (clientesRes.rows || []) as ClienteComCnpj[];
  const excluir = new Set(excluirIds);
  const itens = (res.rows || [])
    .filter((row) => {
      const id = String(row.id || '').trim();
      if (!id || excluir.has(id)) return false;
      if (String(row.status || '').toUpperCase() === 'CANCELADA') return false;
      return faturaEhDeOutroCnpj(cliente, row.client, clientes);
    })
    .map((row) => {
      const nome = String(row.client || '');
      const docs = cnpjsDoNome(nome, clientes);
      return {
        id: String(row.id),
        client: nome,
        number: row.number ? String(row.number) : null,
        amount: Number(row.amount) || 0,
        status: String(row.status || ''),
        cnpj: formatarCnpj(docs[0]),
      };
    })
    .sort((a, b) => a.client.localeCompare(b.client, 'pt-BR') || String(a.number || '').localeCompare(String(b.number || ''), 'pt-BR'));
  return { ok: true, itens };
}

export async function marcarDivergenciaVerificada(
  invoiceId: string,
  vistoPor?: string | null,
  opts?: { sb?: InvoiceSyncClient },
): Promise<{ ok: boolean; error?: string }> {
  const id = String(invoiceId || '').trim();
  if (!id) return { ok: false, error: 'Fatura ausente' };
  const sb = opts?.sb || supabase;
  const { error } = await sb.from('financial_invoice_divergencia_vista').upsert(
    {
      invoice_id: id,
      visto_em: new Date().toISOString(),
      visto_por: String(vistoPor || '').trim() || null,
    },
    { onConflict: 'invoice_id' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function gravarVinculoOutraNf(
  invoiceId: string,
  outraInvoiceId: string,
  opts?: { sb?: InvoiceSyncClient },
): Promise<{ ok: boolean; error?: string }> {
  const a = String(invoiceId || '').trim();
  const b = String(outraInvoiceId || '').trim();
  if (!a || !b || a === b) return { ok: false, error: 'Escolha outra NF do mesmo cliente.' };
  const [invoice_id, outra_invoice_id] = a < b ? [a, b] : [b, a];
  const sb = opts?.sb || supabase;
  const { error } = await sb.from('financial_invoice_nf_vinculos').upsert(
    { invoice_id, outra_invoice_id },
    { onConflict: 'invoice_id,outra_invoice_id', ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function formatarTagDivergencia(item: Pick<ItemDivergenciaFinanceira, 'valorOs' | 'valorFatura'>): string {
  const os = item.valorOs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fat = item.valorFatura.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `[ ⚠️ Divergência Detectada: OS R$ ${os} vs Fatura R$ ${fat} ]`;
}
