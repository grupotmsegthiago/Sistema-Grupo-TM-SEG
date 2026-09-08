/**
 * Núcleo de comissões comerciais — aceita cliente Supabase (admin ou browser).
 * Falha de forma isolada: emissão/baixa de fatura NÃO deve quebrar se a comissão falhar.
 */
import { calcularComissao, type ComissaoStatus } from './comissaoCalc.js';

export type ComissaoDbClient = {
  from: (table: string) => any;
};

export type EmpresaOrigem = 'TM_SEG' | 'TORRES';

export type GerarComissaoInput = {
  faturaId?: string | null;
  origemFaturaId?: string | null;
  empresaOrigem?: EmpresaOrigem;
  clienteId?: number | string | null;
  clienteOrigemId?: number | string | null;
  clienteNome?: string | null;
  comercialId?: string | null;
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

export function normalizeEmpresaOrigem(value?: string | null): EmpresaOrigem {
  return String(value || '').toUpperCase() === 'TORRES' ? 'TORRES' : 'TM_SEG';
}

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

async function findExistingComissao(
  sb: ComissaoDbClient,
  empresa: EmpresaOrigem,
  origemFaturaId: string,
  faturaId: string,
) {
  if (origemFaturaId) {
    const { data } = await sb
      .from('comissoes')
      .select('id')
      .eq('empresa_origem', empresa)
      .eq('origem_fatura_id', origemFaturaId)
      .maybeSingle();
    if (data?.id) return data;
  }
  if (empresa === 'TM_SEG' && faturaId) {
    const { data } = await sb
      .from('comissoes')
      .select('id')
      .eq('fatura_id', faturaId)
      .maybeSingle();
    if (data?.id) return data;
  }
  return null;
}

export async function gerarComissaoAoFaturar(
  sb: ComissaoDbClient,
  input: GerarComissaoInput,
): Promise<GerarComissaoResult> {
  try {
    const empresa = normalizeEmpresaOrigem(input.empresaOrigem);
    const faturaId = String(input.faturaId || '').trim();
    const origemFaturaId = String(input.origemFaturaId || faturaId || '').trim();
    if (!origemFaturaId) return { ok: false, skipped: true, reason: 'fatura_id ausente' };

    const existing = await findExistingComissao(sb, empresa, origemFaturaId, faturaId);
    if (existing?.id) {
      return { ok: true, skipped: true, reason: 'já existe', comissaoId: String(existing.id) };
    }

    let comercialId = String(input.comercialId || '').trim() || null;
    let clienteNome = input.clienteNome || null;

    if (empresa === 'TORRES') {
      if (!comercialId) {
        return { ok: true, skipped: true, reason: 'cliente sem responsável comercial' };
      }
      const origemId = input.clienteOrigemId != null && String(input.clienteOrigemId).trim()
        ? Number(input.clienteOrigemId)
        : null;
      const origemClienteId = Number.isFinite(origemId as number) ? origemId : null;
      const regra = await resolveRegra(sb, comercialId);
      const calc = calcularComissao(input.valorFaturamento, regra.percentual_imposto, regra.percentual_comissao);
      const dataFat = String(input.dataFaturamento || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
      const { data, error } = await sb
        .from('comissoes')
        .insert({
          fatura_id: null,
          origem_fatura_id: origemFaturaId,
          empresa_origem: empresa,
          ordem_servico_id: input.ordemServicoId || null,
          fatura_numero: input.faturaNumero || null,
          cliente_id: null,
          cliente_origem_id: origemClienteId,
          cliente_nome: clienteNome,
          comercial_id: comercialId,
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
    }

    const cliente = await resolveCliente(sb, input.clienteId, input.clienteNome);
    comercialId = comercialId || cliente.comercialId;
    const clienteId = cliente.id;
    clienteNome = cliente.nome || input.clienteNome || null;
    if (!comercialId) {
      return { ok: true, skipped: true, reason: 'cliente sem responsável comercial' };
    }

    const regra = await resolveRegra(sb, comercialId);
    const calc = calcularComissao(input.valorFaturamento, regra.percentual_imposto, regra.percentual_comissao);
    const dataFat = String(input.dataFaturamento || '').slice(0, 10) || new Date().toISOString().slice(0, 10);

    const { data, error } = await sb
      .from('comissoes')
      .insert({
        fatura_id: faturaId || null,
        origem_fatura_id: origemFaturaId,
        empresa_origem: empresa,
        ordem_servico_id: input.ordemServicoId || null,
        fatura_numero: input.faturaNumero || null,
        cliente_id: clienteId,
        cliente_origem_id: null,
        cliente_nome: clienteNome,
        comercial_id: comercialId,
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

export async function atualizarStatusAposBaixaPorOrigem(
  sb: ComissaoDbClient,
  empresaOrigem: EmpresaOrigem | string,
  origemFaturaId: string,
  dataRecebimento?: string | null,
): Promise<{ ok: boolean; updated: number; error?: string }> {
  try {
    const empresa = normalizeEmpresaOrigem(empresaOrigem);
    const id = String(origemFaturaId || '').trim();
    if (!id) return { ok: true, updated: 0 };
    const today = String(dataRecebimento || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const { data, error } = await sb
      .from('comissoes')
      .update({
        status: 'LIBERADO_PARA_PAGAMENTO',
        data_recebimento_cliente: today,
      })
      .eq('empresa_origem', empresa)
      .eq('origem_fatura_id', id)
      .eq('status', 'AGUARDANDO_PAGAMENTO_CLIENTE')
      .select('id');
    if (error) return { ok: false, updated: 0, error: error.message };
    return { ok: true, updated: data?.length || 0 };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[comissao] atualizarStatusAposBaixaPorOrigem:', message);
    return { ok: false, updated: 0, error: message };
  }
}

export async function cancelarComissaoPorOrigem(
  sb: ComissaoDbClient,
  empresaOrigem: EmpresaOrigem | string,
  origemFaturaId: string,
): Promise<{ ok: boolean; updated: number; error?: string }> {
  try {
    const empresa = normalizeEmpresaOrigem(empresaOrigem);
    const id = String(origemFaturaId || '').trim();
    if (!id) return { ok: true, updated: 0 };
    const { data, error } = await sb
      .from('comissoes')
      .update({ status: 'CANCELADO' satisfies ComissaoStatus })
      .eq('empresa_origem', empresa)
      .eq('origem_fatura_id', id)
      .in('status', ['AGUARDANDO_PAGAMENTO_CLIENTE', 'LIBERADO_PARA_PAGAMENTO'])
      .select('id');
    if (error) return { ok: false, updated: 0, error: error.message };
    return { ok: true, updated: data?.length || 0 };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[comissao] cancelarComissaoPorOrigem:', message);
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
