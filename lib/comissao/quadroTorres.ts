/**
 * Faturamento TORRES no quadro de comissões.
 * Fonte 1: ingest gravado na TM SEG (tabela comissoes).
 * Fonte 2: leitura ao vivo no Supabase TORRES, se TORRES_SUPABASE_SERVICE_ROLE_KEY existir.
 * Só entra cliente com responsável comercial.
 */
import { casarClienteDaFatura, fetchAllRows, type ClienteComissaoMatch } from './sincronizarComissoesFaturas.js';
import type { ComissaoDbClient } from './comissaoCore.js';
import {
  faturaCancelada,
  faturaNoPeriodo,
  mesclarLinhasQuadro,
  montarQuadroClientes,
  quadroDeComissoesTorres,
  unirOsIds,
  type FaturaQuadro,
  type LinhaQuadroCliente,
} from './quadroFaturamentoComissao.js';
import { createTorresAdminClient } from './torresSupabase.js';

type ClienteTorres = ClienteComissaoMatch & {
  nome_fantasia?: string | null;
  razao_social?: string | null;
};

function clienteTorresMatch(row: ClienteTorres): ClienteComissaoMatch {
  return {
    id: Number(row.id),
    name: row.name || row.razao_social || null,
    trading_name: row.trading_name || row.nome_fantasia || null,
    responsavel_comercial_id: row.responsavel_comercial_id || null,
  };
}

function acharClienteTorres(
  entityId: string | number | null | undefined,
  entityName: string | null | undefined,
  byId: Map<number, ClienteComissaoMatch>,
  byNome: Map<string, ClienteComissaoMatch>,
): ClienteComissaoMatch | null {
  const idNum = Number(entityId);
  if (Number.isFinite(idNum) && byId.has(idNum)) return byId.get(idNum) || null;
  const nome = String(entityName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (nome && byNome.has(nome)) return byNome.get(nome) || null;
  const match = casarClienteDaFatura(entityName, [...byId.values()]);
  return match.status === 'ok' ? match.client || null : null;
}

export async function carregarFaturasQuadroTorresLive(
  sbTorres: ComissaoDbClient,
  periodStart: string,
  periodEnd: string,
): Promise<{ faturas: FaturaQuadro[]; error?: string }> {
  const cliRes = await fetchAllRows(
    sbTorres,
    'clients',
    'id, name, nome_fantasia, razao_social, responsavel_comercial_id',
  );
  const invRes = await fetchAllRows(
    sbTorres,
    'invoices',
    'id, client_id, client_name, value, status, due_date, payment_date, service_order_id',
  );
  const txRes = await fetchAllRows(
    sbTorres,
    'financial_transactions',
    'id, entity_name, entity_id, amount, status, due_date, payment_date, origin_type, origin_id, type',
    (q) => q.eq('type', 'INCOME'),
  );
  const billRes = await fetchAllRows(
    sbTorres,
    'escort_billings',
    'invoice_id, os_number, service_order_id, pago_em, fat_total, data_missao, faturado_em, created_at, status, client_id, client_name',
  );
  const byId = new Map<number, ClienteComissaoMatch>();
  const byNome = new Map<string, ClienteComissaoMatch>();
  for (const row of (cliRes.rows || []) as ClienteTorres[]) {
    const cli = clienteTorresMatch(row);
    byId.set(Number(cli.id), cli);
    for (const raw of [cli.name, cli.trading_name, row.nome_fantasia, row.razao_social]) {
      const nome = String(raw || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
      if (nome) byNome.set(nome, cli);
    }
  }
  const osPorInvoice = new Map<string, string[]>();
  for (const row of billRes.rows || []) {
    const invoiceId = String(row.invoice_id || '').trim();
    if (!invoiceId) continue;
    const os = String(row.os_number || row.service_order_id || '').trim();
    if (!os) continue;
    const prev = osPorInvoice.get(invoiceId) || [];
    prev.push(os);
    osPorInvoice.set(invoiceId, prev);
  }
  const faturas: FaturaQuadro[] = [];
  const idsContados = new Set<string>();
  for (const inv of invRes.rows || []) {
    if (faturaCancelada(inv.status)) continue;
    const date = String(inv.due_date || '').slice(0, 10);
    if (!faturaNoPeriodo(date, periodStart, periodEnd)) continue;
    const cli = byId.get(Number(inv.client_id)) || acharClienteTorres(inv.client_id, inv.client_name, byId, byNome);
    const comercialId = String(cli?.responsavel_comercial_id || '').trim() || null;
    if (!comercialId) continue;
    const id = `inv:${inv.id}`;
    idsContados.add(String(inv.id));
    faturas.push({
      id,
      empresa: 'TORRES',
      cliente: String(inv.client_name || cli?.name || '').trim() || null,
      number: String(inv.id),
      amount: Number(inv.value) || 0,
      date,
      status: inv.status || null,
      asaasStatus: inv.status || null,
      comercialId,
      osIds: unirOsIds(
        inv.service_order_id != null ? [String(inv.service_order_id)] : [],
        osPorInvoice.get(String(inv.id)),
      ),
      paymentDate: inv.payment_date || null,
    });
  }
  for (const tx of txRes.rows || []) {
    if (String(tx.type || '').toUpperCase() !== 'INCOME') continue;
    if (faturaCancelada(tx.status)) continue;
    const date = String(tx.due_date || '').slice(0, 10);
    if (!faturaNoPeriodo(date, periodStart, periodEnd)) continue;
    const originId = String(tx.origin_id || '').trim();
    if (tx.origin_type === 'invoice' && originId && idsContados.has(originId)) continue;
    const cli = acharClienteTorres(tx.entity_id, tx.entity_name, byId, byNome);
    const comercialId = String(cli?.responsavel_comercial_id || '').trim() || null;
    if (!comercialId) continue;
    const id = String(tx.id || '').trim();
    if (id) idsContados.add(id);
    faturas.push({
      id: id || `tx:${date}|${tx.entity_name}`,
      empresa: 'TORRES',
      cliente: String(tx.entity_name || cli?.name || '').trim() || null,
      number: originId || id || null,
      amount: Number(tx.amount) || 0,
      date,
      status: tx.status || null,
      receivableStatus: tx.status || null,
      comercialId,
      osIds: String(tx.origin_type || '') === 'service_order' && originId ? [originId] : [],
      paymentDate: tx.payment_date || null,
    });
  }
  const osJaContada = new Set<string>();
  for (const fat of faturas) {
    for (const os of fat.osIds || []) osJaContada.add(String(os));
  }
  for (const bill of billRes.rows || []) {
    const status = String(bill.status || '').toUpperCase();
    if (status === 'CANCELADO' || /CANCEL/.test(status)) continue;
    const valor = Number(bill.fat_total) || 0;
    if (valor <= 0) continue;
    const date = String(bill.data_missao || bill.faturado_em || bill.created_at || '').slice(0, 10);
    if (!faturaNoPeriodo(date, periodStart, periodEnd)) continue;
    const invoiceId = String(bill.invoice_id || '').trim();
    if (invoiceId && idsContados.has(invoiceId)) continue;
    const osId = String(bill.os_number || bill.service_order_id || '').trim();
    if (osId && osJaContada.has(osId)) continue;
    const cli = acharClienteTorres(bill.client_id, bill.client_name, byId, byNome);
    const comercialId = String(cli?.responsavel_comercial_id || '').trim() || null;
    if (!comercialId) continue;
    if (osId) osJaContada.add(osId);
    faturas.push({
      id: `os:${osId || bill.service_order_id || date}`,
      empresa: 'TORRES',
      cliente: String(bill.client_name || cli?.name || '').trim() || null,
      number: osId || null,
      amount: valor,
      date,
      status: bill.pago_em ? 'PAGA' : 'EMITIDA',
      comercialId,
      osIds: osId ? [osId] : [],
      paymentDate: bill.pago_em || null,
    });
  }
  return {
    faturas,
    error: cliRes.error || invRes.error || txRes.error || billRes.error,
  };
}

export async function carregarQuadroTorres(
  sbTm: ComissaoDbClient,
  periodStart: string,
  periodEnd: string,
  comerciais: Array<{ id: string; nome?: string | null }>,
  sbTorres?: ComissaoDbClient | null,
): Promise<{ linhas: LinhaQuadroCliente[]; error?: string }> {
  const torresCols =
    'id, origem_fatura_id, fatura_numero, empresa_origem, cliente_nome, valor_faturamento, valor_comissao, percentual_imposto_aplicado, valor_base_liquida, data_faturamento, status, comercial_id, ordem_servico_id, comerciais(nome)';
  let ingestRes = await fetchAllRows(
    sbTm,
    'comissoes',
    torresCols,
    (q) => q.eq('empresa_origem', 'TORRES').gte('data_faturamento', periodStart).lte('data_faturamento', periodEnd),
  );
  if (ingestRes.error) {
    ingestRes = await fetchAllRows(
      sbTm,
      'comissoes',
      'id, origem_fatura_id, fatura_numero, empresa_origem, cliente_nome, valor_faturamento, valor_comissao, percentual_imposto_aplicado, valor_base_liquida, data_faturamento, status, comercial_id, ordem_servico_id',
      (q) => q.eq('empresa_origem', 'TORRES').gte('data_faturamento', periodStart).lte('data_faturamento', periodEnd),
    );
  }
  const linhasIngest = quadroDeComissoesTorres(ingestRes.rows || [], comerciais);
  const liveClient = sbTorres === undefined ? createTorresAdminClient() : sbTorres;
  if (!liveClient) {
    return { linhas: linhasIngest, error: ingestRes.error };
  }
  const live = await carregarFaturasQuadroTorresLive(liveClient, periodStart, periodEnd);
  const linhasLive = montarQuadroClientes(live.faturas, [], comerciais, periodStart, periodEnd);
  return {
    linhas: mesclarLinhasQuadro(linhasLive, linhasIngest),
    error: ingestRes.error || live.error,
  };
}
