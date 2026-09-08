/**
 * Núcleo de comissões comerciais — aceita cliente Supabase (admin ou browser).
 * Falha de forma isolada: emissão/baixa de fatura NÃO deve quebrar se a comissão falhar.
 */
import { calcularComissao, type ComissaoStatus } from './comissaoCalc.js';

export type ComissaoDbClient = {
  from: (table: string) => any;
};

export type GerarComissaoInput = {
  faturaId: string;
  clienteId?: number | string | null;
  clienteNome?: string | null;
  valorFaturamento: number;
  dataFaturamento?: string | null;
  faturaNumero?: string | null;
  ordemServicoId?: string | null;
};

export type GerarComissaoResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  comissaoId?: string;
  error?: string;
};

async function resolveCliente(
  sb: ComissaoDbClient,
  clienteId?: number | string | null,
  clienteNome?: string | null,
): Promise<{ id: number | null; nome: string | null; comercialId: string | null }> {
  if (clienteId != null && String(clienteId).trim()) {
    const { data } = await sb
      .from('clients')
      .select('id, name, trading_name, responsavel_comercial_id')
      .eq('id', clienteId)
      .maybeSingle();
    if (data) {
      return {
        id: Number(data.id),
        nome: data.name || data.trading_name || null,
        comercialId: data.responsavel_comercial_id || null,
      };
    }
  }
  const nome = String(clienteNome || '').trim();
  if (!nome) return { id: null, nome: null, comercialId: null };
  const { data: byName } = await sb
    .from('clients')
    .select('id, name, trading_name, responsavel_comercial_id')
    .eq('name', nome)
    .limit(1);
  const hit = byName?.[0];
  if (hit) {
    return {
      id: Number(hit.id),
      nome: hit.name || hit.trading_name || nome,
      comercialId: hit.responsavel_comercial_id || null,
    };
  }
  const { data: byTrading } = await sb
    .from('clients')
    .select('id, name, trading_name, responsavel_comercial_id')
    .eq('trading_name', nome)
    .limit(1);
  const hit2 = byTrading?.[0];
  if (hit2) {
    return {
      id: Number(hit2.id),
      nome: hit2.name || hit2.trading_name || nome,
      comercialId: hit2.responsavel_comercial_id || null,
    };
  }
  return { id: null, nome, comercialId: null };
}

async function resolveRegra(
  sb: ComissaoDbClient,
  comercialId: string,
): Promise<{ percentual_imposto: number; percentual_comissao: number }> {
  const { data: especifica } = await sb
    .from('regras_comissao')
    .select('percentual_imposto, percentual_comissao')
    .eq('comercial_id', comercialId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (especifica?.[0]) {
    return {
      percentual_imposto: Number(especifica[0].percentual_imposto) || 16,
      percentual_comissao: Number(especifica[0].percentual_comissao) || 3,
    };
  }
  const { data: geral } = await sb
    .from('regras_comissao')
    .select('percentual_imposto, percentual_comissao')
    .is('comercial_id', null)
    .order('created_at', { ascending: false })
    .limit(1);
  return {
    percentual_imposto: Number(geral?.[0]?.percentual_imposto) || 16,
    percentual_comissao: Number(geral?.[0]?.percentual_comissao) || 3,
  };
}

export async function gerarComissaoAoFaturar(
  sb: ComissaoDbClient,
  input: GerarComissaoInput,
): Promise<GerarComissaoResult> {
  try {
    const faturaId = String(input.faturaId || '').trim();
    if (!faturaId) return { ok: false, skipped: true, reason: 'fatura_id ausente' };

    const { data: existing } = await sb
      .from('comissoes')
      .select('id')
      .eq('fatura_id', faturaId)
      .maybeSingle();
    if (existing?.id) {
      return { ok: true, skipped: true, reason: 'já existe', comissaoId: String(existing.id) };
    }

    const cliente = await resolveCliente(sb, input.clienteId, input.clienteNome);
    if (!cliente.comercialId) {
      return { ok: true, skipped: true, reason: 'cliente sem responsável comercial' };
    }

    const regra = await resolveRegra(sb, cliente.comercialId);
    const calc = calcularComissao(input.valorFaturamento, regra.percentual_imposto, regra.percentual_comissao);
    const dataFat = String(input.dataFaturamento || '').slice(0, 10) || new Date().toISOString().slice(0, 10);

    const { data, error } = await sb
      .from('comissoes')
      .insert({
        fatura_id: faturaId,
        ordem_servico_id: input.ordemServicoId || null,
        fatura_numero: input.faturaNumero || null,
        cliente_id: cliente.id,
        cliente_nome: cliente.nome || input.clienteNome || null,
        comercial_id: cliente.comercialId,
        valor_faturamento: calc.valorFaturamento,
        percentual_imposto_aplicado: calc.percentualImposto,
        valor_base_liquida: calc.valorBaseLiquida,
        percentual_comissao_aplicado: calc.percentualComissao,
        valor_comissao: calc.valorComissao,
        status: 'AGUARDANDO_PAGAMENTO_CLIENTE' satisfies ComissaoStatus,
        data_faturamento: dataFat,
      })
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    return { ok: true, comissaoId: data?.id ? String(data.id) : undefined };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[comissao] gerarComissaoAoFaturar:', message);
    return { ok: false, error: message };
  }
}

export async function atualizarStatusAposBaixaCliente(
  sb: ComissaoDbClient,
  faturaId: string,
  dataRecebimento?: string | null,
): Promise<{ ok: boolean; updated: number; error?: string }> {
  try {
    const id = String(faturaId || '').trim();
    if (!id) return { ok: true, updated: 0 };
    const today = String(dataRecebimento || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const { data, error } = await sb
      .from('comissoes')
      .update({
        status: 'LIBERADO_PARA_PAGAMENTO',
        data_recebimento_cliente: today,
      })
      .eq('fatura_id', id)
      .eq('status', 'AGUARDANDO_PAGAMENTO_CLIENTE')
      .select('id');
    if (error) return { ok: false, updated: 0, error: error.message };
    return { ok: true, updated: data?.length || 0 };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[comissao] atualizarStatusAposBaixaCliente:', message);
    return { ok: false, updated: 0, error: message };
  }
}

export async function atualizarStatusAposBaixaPorNumeroFatura(
  sb: ComissaoDbClient,
  faturaNumero: string,
  dataRecebimento?: string | null,
): Promise<{ ok: boolean; updated: number; error?: string }> {
  try {
    const numero = String(faturaNumero || '').trim();
    if (!numero) return { ok: true, updated: 0 };
    const today = String(dataRecebimento || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const { data, error } = await sb
      .from('comissoes')
      .update({
        status: 'LIBERADO_PARA_PAGAMENTO',
        data_recebimento_cliente: today,
      })
      .eq('fatura_numero', numero)
      .eq('status', 'AGUARDANDO_PAGAMENTO_CLIENTE')
      .select('id');
    if (error) return { ok: false, updated: 0, error: error.message };
    return { ok: true, updated: data?.length || 0 };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[comissao] atualizarStatusAposBaixaPorNumeroFatura:', message);
    return { ok: false, updated: 0, error: message };
  }
}

export function extractFaturaNumeroFromNotes(notes?: string | null, description?: string | null): string | null {
  const blob = `${notes || ''} ${description || ''}`;
  const m = blob.match(/Fatura\s+([A-Z0-9._-]+)/i);
  return m?.[1] || null;
}
