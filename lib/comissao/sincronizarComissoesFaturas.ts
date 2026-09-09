/**
 * Sincroniza comissões a partir de faturas TM SEG já emitidas.
 * Não usa client_id na fatura (não existe): casa pelo nome/fantasia do cliente.
 * Sem responsável comercial = não inventa comissão.
 */
import { gerarComissaoAoFaturar, atualizarStatusAposBaixaCliente, type ComissaoDbClient } from './comissaoCore';

export type ClienteComissaoMatch = {
  id: number;
  name?: string | null;
  trading_name?: string | null;
  responsavel_comercial_id?: string | null;
};

export type InvoiceComissaoMatch = {
  id: string;
  client?: string | null;
  number?: string | null;
  amount?: number | null;
  date?: string | null;
  status?: string | null;
};

export function normalizeClienteNome(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function casarClienteDaFatura(
  invoiceClient: string | null | undefined,
  clients: ClienteComissaoMatch[],
): { status: 'ok' | 'none' | 'ambiguous'; client?: ClienteComissaoMatch } {
  const needle = normalizeClienteNome(invoiceClient);
  if (!needle) return { status: 'none' };
  const hits = clients.filter((c) => {
    const name = normalizeClienteNome(c.name);
    const trading = normalizeClienteNome(c.trading_name);
    return needle === name || (trading && needle === trading);
  });
  const uniqueIds = [...new Set(hits.map((c) => Number(c.id)))];
  if (uniqueIds.length === 0) return { status: 'none' };
  if (uniqueIds.length > 1) return { status: 'ambiguous' };
  return { status: 'ok', client: hits[0] };
}

export type PendenciaComissaoCliente = {
  cliente: string;
  faturas: number;
  total: number;
  motivo: 'sem_comercial' | 'cadastro_nao_encontrado' | 'cadastro_ambiguo';
};

export function montarPendenciasComissao(
  invoices: InvoiceComissaoMatch[],
  clients: ClienteComissaoMatch[],
): PendenciaComissaoCliente[] {
  const map = new Map<string, PendenciaComissaoCliente>();
  for (const inv of invoices) {
    if (String(inv.status || '').toUpperCase() === 'CANCELADA') continue;
    const match = casarClienteDaFatura(inv.client, clients);
    let motivo: PendenciaComissaoCliente['motivo'] | null = null;
    if (match.status === 'none') motivo = 'cadastro_nao_encontrado';
    else if (match.status === 'ambiguous') motivo = 'cadastro_ambiguo';
    else if (!match.client?.responsavel_comercial_id) motivo = 'sem_comercial';
    if (!motivo) continue;
    const key = `${motivo}|${normalizeClienteNome(inv.client)}`;
    const prev = map.get(key) || {
      cliente: String(inv.client || '—'),
      faturas: 0,
      total: 0,
      motivo,
    };
    prev.faturas += 1;
    prev.total += Number(inv.amount) || 0;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export type SyncComissoesFaturasResult = {
  ok: boolean;
  generated: number;
  skippedJaExiste: number;
  skippedSemComercial: number;
  skippedCancelada: number;
  skippedSemMatch: number;
  skippedAmbiguo: number;
  errors: number;
  pendencias: PendenciaComissaoCliente[];
  error?: string;
};

async function fetchAllRows(
  sb: ComissaoDbClient,
  table: string,
  columns: string,
): Promise<{ rows: any[]; error?: string }> {
  const rows: any[] = [];
  let from = 0;
  const page = 1000;
  while (true) {
    let q = sb.from(table).select(columns);
    if (typeof q.range === 'function') q = q.range(from, from + page - 1);
    const { data, error } = await q;
    if (error) return { rows: [], error: error.message };
    const batch = data || [];
    rows.push(...batch);
    if (typeof q.range !== 'function' || batch.length < page) return { rows };
    from += batch.length;
  }
}

export async function carregarPendenciasComissao(
  sb: ComissaoDbClient,
): Promise<{ ok: boolean; pendencias: PendenciaComissaoCliente[]; error?: string }> {
  const invRes = await fetchAllRows(sb, 'financial_invoices', 'id, client, number, amount, date, status');
  if (invRes.error) return { ok: false, pendencias: [], error: invRes.error };
  const cliRes = await fetchAllRows(sb, 'clients', 'id, name, trading_name, responsavel_comercial_id');
  if (cliRes.error) return { ok: false, pendencias: [], error: cliRes.error };
  return {
    ok: true,
    pendencias: montarPendenciasComissao(
      (invRes.rows || []) as InvoiceComissaoMatch[],
      (cliRes.rows || []) as ClienteComissaoMatch[],
    ),
  };
}

export async function sincronizarComissoesFaturasExistentes(
  sb: ComissaoDbClient,
): Promise<SyncComissoesFaturasResult> {
  const empty: SyncComissoesFaturasResult = {
    ok: true,
    generated: 0,
    skippedJaExiste: 0,
    skippedSemComercial: 0,
    skippedCancelada: 0,
    skippedSemMatch: 0,
    skippedAmbiguo: 0,
    errors: 0,
    pendencias: [],
  };
  try {
    const invRes = await fetchAllRows(sb, 'financial_invoices', 'id, client, number, amount, date, status');
    if (invRes.error) return { ...empty, ok: false, error: invRes.error };
    const cliRes = await fetchAllRows(sb, 'clients', 'id, name, trading_name, responsavel_comercial_id');
    if (cliRes.error) return { ...empty, ok: false, error: cliRes.error };

    const invoices = (invRes.rows || []) as InvoiceComissaoMatch[];
    const clients = (cliRes.rows || []) as ClienteComissaoMatch[];
    const pendencias = montarPendenciasComissao(invoices, clients);

    for (const inv of invoices) {
      const status = String(inv.status || '').toUpperCase();
      if (status === 'CANCELADA') {
        empty.skippedCancelada += 1;
        continue;
      }
      const match = casarClienteDaFatura(inv.client, clients);
      if (match.status === 'none') {
        empty.skippedSemMatch += 1;
        continue;
      }
      if (match.status === 'ambiguous') {
        empty.skippedAmbiguo += 1;
        continue;
      }
      if (!match.client?.responsavel_comercial_id) {
        empty.skippedSemComercial += 1;
        continue;
      }

      const res = await gerarComissaoAoFaturar(sb, {
        faturaId: String(inv.id),
        origemFaturaId: String(inv.id),
        empresaOrigem: 'TM_SEG',
        clienteId: match.client.id,
        clienteNome: match.client.name || inv.client,
        comercialId: match.client.responsavel_comercial_id,
        valorFaturamento: Number(inv.amount) || 0,
        dataFaturamento: String(inv.date || '').slice(0, 10),
        faturaNumero: inv.number || null,
      });
      if (!res.ok) {
        empty.errors += 1;
        continue;
      }
      if (res.skipped && res.reason === 'já existe') {
        empty.skippedJaExiste += 1;
      } else if (res.skipped) {
        empty.skippedSemComercial += 1;
      } else {
        empty.generated += 1;
        if (status === 'PAGA') {
          await atualizarStatusAposBaixaCliente(sb, String(inv.id), String(inv.date || '').slice(0, 10));
        }
      }
    }

    return { ...empty, ok: true, pendencias };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ...empty, ok: false, error: message };
  }
}
