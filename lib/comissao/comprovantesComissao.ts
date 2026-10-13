/**
 * Comprovante do pagamento do cliente na comissão liberada.
 * Automático: URL oficial do Asaas. Manual: arquivo da TORRES ou anexo já gravado.
 * Ausência de chave ou de URL não inventa link.
 */
import { getPayment } from '../asaasChargeApi.js';
import { urlComprovanteHttp } from '../asaasReceiptDetails.js';
import { assertComissoesQuadroAccess } from './comissaoQuadroAuth.js';
import { createTorresAdminClient } from './torresSupabase.js';

export const BUCKET_COMPROVANTE_TORRES = 'comprovantes-pagamento';

export type ItemComprovanteAoVivo = {
  id: string;
  paymentId?: string | null;
  company?: string | null;
  torresOrigemId?: string | null;
};

export type ResultadoComprovanteAoVivo = {
  urls: Record<string, string>;
  completo: boolean;
};

type ReciboAsaas = (paymentId: string, company?: string) => Promise<{ url: string | null; ok: boolean }>;
type LeituraTorres = (ids: string[]) => Promise<{ rows: Array<{ id: string; comprovante_url: string | null }>; ok: boolean }>;
type AssinaturaTorres = (path: string) => Promise<string | null>;

/** Só o arquivo invoices/{id}/nome.pdf do bucket privado. */
export function caminhoComprovanteTorres(origemId: string, raw: string | null | undefined): string | null {
  const id = String(origemId || '').trim();
  if (!/^\d+$/.test(id)) return null;
  const path = String(raw || '').trim().replace(/^\/+/, '');
  if (!path || path.includes('..') || path.includes('\\') || path.includes('?')) return null;
  if (!new RegExp(`^invoices/${id}/[A-Za-z0-9._-]+$`).test(path)) return null;
  return path;
}

function itensValidos(raw: unknown): ItemComprovanteAoVivo[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  const itens: ItemComprovanteAoVivo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as ItemComprovanteAoVivo;
    const id = String(row.id || '').trim();
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const paymentId = String(row.paymentId || '').trim();
    const torresOrigemId = String(row.torresOrigemId || '').trim();
    itens.push({
      id,
      paymentId: /^pay_[A-Za-z0-9]+$/.test(paymentId) ? paymentId : null,
      company: String(row.company || '').trim().slice(0, 40) || null,
      torresOrigemId: /^\d+$/.test(torresOrigemId) ? torresOrigemId : null,
    });
    if (itens.length >= 40) break;
  }
  return itens;
}

export async function resolverComprovantesAoVivo(
  itens: ItemComprovanteAoVivo[],
  deps?: {
    reciboAsaas?: ReciboAsaas;
    lerTorres?: LeituraTorres;
    assinarTorres?: AssinaturaTorres;
  },
): Promise<ResultadoComprovanteAoVivo> {
  const reciboAsaas = deps?.reciboAsaas || reciboAsaasOficial;
  const lerTorres = deps?.lerTorres || lerComprovantesTorres;
  const assinarTorres = deps?.assinarTorres || assinarComprovanteTorres;
  const urls: Record<string, string> = {};
  let completo = true;

  const torresIds = [...new Set(itens.map((item) => item.torresOrigemId).filter((id): id is string => !!id))];
  const torres = torresIds.length ? await lerTorres(torresIds) : { rows: [], ok: true };
  if (!torres.ok) completo = false;
  const porTorres = new Map(torres.rows.map((row) => [String(row.id), row.comprovante_url]));

  for (const item of itens) {
    if (item.torresOrigemId) {
      if (!torres.ok) continue;
      const bruto = porTorres.get(item.torresOrigemId) ?? null;
      const https = urlComprovanteHttp(bruto);
      if (https) {
        urls[item.id] = https;
        continue;
      }
      const path = caminhoComprovanteTorres(item.torresOrigemId, bruto);
      if (!path) continue;
      try {
        const assinado = urlComprovanteHttp(await assinarTorres(path));
        if (assinado) urls[item.id] = assinado;
        else completo = false;
      } catch {
        completo = false;
      }
      continue;
    }
    if (!item.paymentId) continue;
    const recibo = await reciboAsaas(item.paymentId, item.company || undefined);
    if (!recibo.ok) {
      completo = false;
      continue;
    }
    if (recibo.url) urls[item.id] = recibo.url;
  }

  return { urls, completo };
}

async function reciboAsaasOficial(paymentId: string, company?: string): Promise<{ url: string | null; ok: boolean }> {
  try {
    const payment = await getPayment(paymentId, company);
    return { url: urlComprovanteHttp(payment?.transactionReceiptUrl), ok: true };
  } catch {
    return { url: null, ok: false };
  }
}

async function lerComprovantesTorres(ids: string[]): Promise<{ rows: Array<{ id: string; comprovante_url: string | null }>; ok: boolean }> {
  const sb = createTorresAdminClient();
  if (!sb) return { rows: [], ok: false };
  const { data, error } = await sb.from('invoices').select('id, comprovante_url').in('id', ids.map((id) => Number(id)));
  if (error) return { rows: [], ok: false };
  return {
    ok: true,
    rows: (data || []).map((row) => ({
      id: String(row.id),
      comprovante_url: row.comprovante_url ? String(row.comprovante_url) : null,
    })),
  };
}

async function assinarComprovanteTorres(path: string): Promise<string | null> {
  const sb = createTorresAdminClient();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(BUCKET_COMPROVANTE_TORRES).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}

export async function tratarPedidoComprovantesComissao(req: any, res: any): Promise<void> {
  if (String(req.method || '').toUpperCase() !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const access = await assertComissoesQuadroAccess(req);
  if (!access.ok) {
    res.status(access.status).json({ ok: false, urls: {}, completo: false, error: access.error });
    return;
  }
  const itens = itensValidos(req.body?.itens);
  try {
    const resultado = await resolverComprovantesAoVivo(itens);
    res.status(200).json({ ok: true, ...resultado });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[comissao] comprovante:', message);
    res.status(200).json({ ok: false, urls: {}, completo: false });
  }
}
