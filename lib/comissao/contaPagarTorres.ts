/**
 * Contas a Pagar da TORRES (projeto separado da TM SEG).
 * Só comissão com empresa TORRES. A TM SEG continua no lançamento dela.
 * O comprovante copiado é o do pagamento do cliente, já gravado na fatura da TORRES.
 */
import { createClient } from '@supabase/supabase-js';
import { formatIsoDateBR } from '../dateUtils.js';
import { extractAuthToken } from '../billingApiAuth.js';
import { resolveSupabasePublicConfig } from '../resolveSupabasePublicConfig.js';
import { caminhoComprovanteTorres } from './comprovantesComissao.js';
import { assertComissoesQuadroAccess } from './comissaoQuadroAuth.js';
import { montarContaPagarComissao, notaContaPagarComissao, tituloContaPagarComissao, vencimentoPagamentoComissao } from './contaPagarComissao.js';
import { createTorresAdminClient } from './torresSupabase.js';

export const CATEGORIA_COMISSAO_TORRES = 'Comissões';
export const ORIGEM_CONTA_PAGAR_TORRES = 'comissao_comercial';

export type ComissaoParaContaTorres = {
  id: string;
  status: string;
  empresa_origem?: string | null;
  conta_pagar_id?: string | null;
  cliente_nome?: string | null;
  fatura_numero?: string | null;
  origem_fatura_id?: string | null;
  data_faturamento?: string | null;
  valor_comissao: number;
  comercial_nome?: string | null;
};

/** O valor lançado pode ser o da tela (após o piso), nunca maior que a comissão gravada. */
export function valorAceitoNoContasPagarTorres(informado: number, oficial: number): boolean {
  const valor = Math.round(Number(informado) * 100) / 100;
  const teto = Math.round(Number(oficial) * 100) / 100;
  return Number.isFinite(valor) && valor > 0 && Number.isFinite(teto) && valor <= teto + 0.001;
}

export function montarContaPagarTorres(input: {
  id: string;
  cliente?: string | null;
  fatura?: string | null;
  comercial?: string | null;
  dataFaturamento?: string | null;
  valor: number;
  dueDate: string;
  categoryId?: string | null;
  createdBy?: string | null;
  comprovantePath?: string | null;
}): Record<string, unknown> {
  const base = montarContaPagarComissao({
    id: input.id,
    cliente: input.cliente,
    fatura: input.fatura,
    comercial: input.comercial,
    dataFaturamento: input.dataFaturamento,
    valor: input.valor,
    dueDate: input.dueDate,
    categoryId: input.categoryId,
    createdBy: input.createdBy,
  });
  const path = String(input.comprovantePath || '').trim();
  return {
    ...base,
    category_name: CATEGORIA_COMISSAO_TORRES,
    origin_type: ORIGEM_CONTA_PAGAR_TORRES,
    origin_id: String(input.id || '').trim(),
    account_id: null,
    account_name: null,
    comprovante_path: path || null,
    comprovante_url: null,
  };
}

export async function executarLancamentoTorres(
  input: {
    comissao: ComissaoParaContaTorres;
    valor: number;
    dueDate: string;
    createdBy?: string | null;
    comprovantePath?: string | null;
  },
  deps: {
    buscarExistente: (comissaoId: string) => Promise<string | null>;
    buscarCategoriaId: () => Promise<string | null>;
    inserir: (payload: Record<string, unknown>) => Promise<string>;
    ligar: (comissaoId: string, transactionId: string) => Promise<boolean>;
  },
): Promise<{ ok: boolean; transactionId?: string; error?: string }> {
  const row = input.comissao;
  const id = String(row.id || '').trim();
  if (String(row.empresa_origem || '').toUpperCase() !== 'TORRES') {
    return { ok: false, error: 'Esta comissão não é da TORRES' };
  }
  if (row.status !== 'LIBERADO_PARA_PAGAMENTO') {
    return { ok: false, error: 'A comissão não está liberada para pagamento' };
  }
  const ja = String(row.conta_pagar_id || '').trim();
  if (ja) return { ok: true, transactionId: ja };
  if (!valorAceitoNoContasPagarTorres(input.valor, row.valor_comissao)) {
    return { ok: false, error: 'Valor a pagar inválido' };
  }

  const existente = String(await deps.buscarExistente(id) || '').trim();
  let transactionId = existente;
  if (!transactionId) {
    const categoryId = await deps.buscarCategoriaId();
    const payload = montarContaPagarTorres({
      id,
      cliente: row.cliente_nome,
      fatura: row.fatura_numero,
      comercial: row.comercial_nome,
      dataFaturamento: row.data_faturamento,
      valor: input.valor,
      dueDate: input.dueDate,
      categoryId,
      createdBy: input.createdBy,
      comprovantePath: input.comprovantePath,
    });
    transactionId = String(await deps.inserir(payload) || '').trim();
  }
  if (!transactionId) return { ok: false, error: 'Não foi possível criar o Contas a Pagar da TORRES' };

  const ligado = await deps.ligar(id, transactionId);
  if (!ligado) {
    return { ok: false, transactionId, error: 'O título foi criado na TORRES, mas não ligou na comissão. Tente de novo.' };
  }
  return { ok: true, transactionId };
}

function clienteDoUsuario(token: string) {
  const { url, anonKey } = resolveSupabasePublicConfig();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function nomeUsuario(req: { headers?: Record<string, unknown> }): string | null {
  const raw = req.headers?.['x-tmseg-user-name'] ?? req.headers?.['X-Tmseg-User-Name'];
  const nome = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
  return nome || null;
}

function comercialNome(raw: unknown): string | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') return null;
  const nome = String((row as { nome?: string }).nome || '').trim();
  return nome || null;
}

export async function tratarPedidoContaPagarTorres(req: any, res: any): Promise<void> {
  if (String(req.method || '').toUpperCase() !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const access = await assertComissoesQuadroAccess(req);
  if (!access.ok) {
    res.status(access.status).json({ ok: false, error: access.error });
    return;
  }
  if (!access.podeEscrever) {
    res.status(403).json({ ok: false, error: 'Permissão negada' });
    return;
  }

  const id = String(req.body?.id || '').trim();
  const acao = String(req.body?.acao || 'lancar').trim().toLowerCase();
  if (!id) {
    res.status(400).json({ ok: false, error: 'comissaoId ausente' });
    return;
  }

  const torres = createTorresAdminClient();
  if (!torres) {
    res.status(200).json({ ok: false, error: 'A TORRES não está ligada neste computador.' });
    return;
  }

  const token = extractAuthToken(req);
  const sb = clienteDoUsuario(token);
  const { data, error } = await sb
    .from('comissoes')
    .select('id, status, empresa_origem, conta_pagar_id, cliente_nome, fatura_numero, origem_fatura_id, data_faturamento, data_recebimento_cliente, valor_comissao, comerciais(nome)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    res.status(200).json({ ok: false, error: error?.message || 'Comissão não encontrada' });
    return;
  }

  if (acao === 'baixar') {
    const hoje = formatIsoDateBR();
    const { data: baixado, error: baixaErr } = await torres
      .from('financial_transactions')
      .update({ status: 'PAID', payment_date: hoje, updated_by: nomeUsuario(req) })
      .eq('type', 'EXPENSE')
      .eq('origin_type', ORIGEM_CONTA_PAGAR_TORRES)
      .eq('origin_id', id)
      .select('id');
    if (baixaErr) {
      res.status(200).json({ ok: false, error: baixaErr.message });
      return;
    }
    res.status(200).json({ ok: true, baixado: (baixado || []).length > 0 });
    return;
  }

  const origem = String(data.origem_fatura_id || '').trim();
  let comprovantePath: string | null = null;
  if (/^\d+$/.test(origem)) {
    const { data: fatura } = await torres.from('invoices').select('comprovante_url').eq('id', Number(origem)).maybeSingle();
    comprovantePath = caminhoComprovanteTorres(origem, fatura?.comprovante_url);
  }

  const valorInformado = req.body?.valor == null ? Number(data.valor_comissao) : Number(req.body.valor);
  try {
    const resultado = await executarLancamentoTorres({
      comissao: {
        id: String(data.id),
        status: String(data.status || ''),
        empresa_origem: data.empresa_origem,
        conta_pagar_id: data.conta_pagar_id,
        cliente_nome: data.cliente_nome,
        fatura_numero: data.fatura_numero,
        origem_fatura_id: data.origem_fatura_id,
        data_faturamento: data.data_faturamento,
        valor_comissao: Number(data.valor_comissao) || 0,
        comercial_nome: comercialNome(data.comerciais),
      },
      valor: valorInformado,
      dueDate: vencimentoPagamentoComissao(data.data_recebimento_cliente || data.data_faturamento, formatIsoDateBR()),
      createdBy: nomeUsuario(req),
      comprovantePath,
    }, {
      buscarExistente: async (comissaoId) => {
        const { data: achou, error: buscaErr } = await torres
          .from('financial_transactions')
          .select('id')
          .eq('type', 'EXPENSE')
          .eq('origin_type', ORIGEM_CONTA_PAGAR_TORRES)
          .eq('origin_id', comissaoId)
          .limit(1);
        if (buscaErr) throw new Error(buscaErr.message);
        return achou?.[0]?.id ? String(achou[0].id) : null;
      },
      buscarCategoriaId: async () => {
        const { data: categoria } = await torres
          .from('financial_categories')
          .select('id')
          .eq('type', 'EXPENSE')
          .eq('name', CATEGORIA_COMISSAO_TORRES)
          .limit(1);
        return categoria?.[0]?.id ? String(categoria[0].id) : null;
      },
      inserir: async (payload) => {
        const { data: criado, error: insertErr } = await torres
          .from('financial_transactions')
          .insert(payload)
          .select('id')
          .single();
        if (insertErr) throw new Error(insertErr.message);
        return String(criado?.id || '');
      },
      ligar: async (comissaoId, transactionId) => {
        const { data: ligado, error: ligaErr } = await sb
          .from('comissoes')
          .update({ conta_pagar_id: transactionId })
          .eq('id', comissaoId)
          .eq('status', 'LIBERADO_PARA_PAGAMENTO')
          .is('conta_pagar_id', null)
          .select('conta_pagar_id');
        if (ligaErr) return false;
        const gravado = String(ligado?.[0]?.conta_pagar_id || '').trim();
        return gravado === transactionId;
      },
    });
    res.status(200).json(resultado);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[comissao] contas a pagar TORRES:', message);
    res.status(200).json({ ok: false, error: message });
  }
}

export function tituloContaTorres(input: {
  cliente?: string | null;
  fatura?: string | null;
  comercial?: string | null;
  dataFaturamento?: string | null;
}): string {
  return tituloContaPagarComissao(input);
}

export { notaContaPagarComissao };
