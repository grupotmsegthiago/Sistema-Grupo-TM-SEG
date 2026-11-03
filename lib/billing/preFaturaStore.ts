/**
 * Leitura e gravação da pré-fatura. Não altera o cadastro do serviço ao editar o mês.
 */
import { supabase } from '../supabase';
import {
  MENSAGEM_MIGRACAO_PRE_FATURA,
  competenciaValida,
  colunaCobranca,
  montarLinhasDoCadastro,
  podeAprovar,
  podeCancelar,
  podeEditar,
  podeGerarFatura,
  prepararAjusteValor,
  referenciaRastreio,
  tabelaAusente,
  totaisDaPreFatura,
  usuarioDoNavegador,
  validarJustificativa,
  validarNovoValor,
  validarServicoMensal,
  valorInformadoDaLinha,
  type LinhaPreFatura,
  type ServicoMensalEntrada,
  type ServicoVigente,
  type StatusPreFatura,
  type TipoLinhaPreFatura,
} from './preFaturaMensal';

export type ClientePreFatura = {
  id: string;
  name: string;
  trading_name?: string | null;
  cnpj?: string | null;
  email?: string | null;
  medicao_email?: string | null;
  phone?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  issuer_company?: string | null;
  nf_municipal_service_code?: string | null;
  nf_municipal_service_name?: string | null;
  nf_service_description?: string | null;
};

export type ServicoMensalRow = {
  id: string;
  client_id: number;
  short_name: string;
  description: string;
  post_count: number;
  schedule_type: string;
  work_hours: string;
  monthly_amount: number;
  start_date: string;
  end_date: string | null;
  active: boolean;
};

export type PreFaturaRow = {
  id: string;
  client_id: number;
  competence: string;
  status: StatusPreFatura;
  total_contractual_amount: number;
  total_invoiced_amount: number;
  financial_invoice_id: string | null;
  emission_ref: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
};

export type ItemRow = {
  id: string;
  pre_invoice_id: string;
  service_id: string | null;
  item_kind: TipoLinhaPreFatura;
  billing_reference: string;
  short_name: string | null;
  description: string;
  service_start_date: string | null;
  contractual_amount: number;
  calculated_amount: number;
  invoiced_amount: number;
  excluded: boolean;
  exclusion_reason: string | null;
  sort_order: number;
};

export type AjusteRow = {
  id: string;
  item_id: string;
  pre_invoice_id: string;
  previous_amount: number;
  new_amount: number;
  reason: string;
  adjustment_kind: string;
  user_name: string;
  created_at: string;
};

type ErroDb = { code?: string; message?: string };

function falha(erro: ErroDb | null, acao: string): never {
  if (tabelaAusente(erro)) throw new Error(MENSAGEM_MIGRACAO_PRE_FATURA);
  throw new Error(erro?.message || acao);
}

function agoraIso(): string {
  return new Date().toISOString();
}

function paraServicoVigente(row: ServicoMensalRow): ServicoVigente {
  return {
    id: row.id,
    shortName: row.short_name,
    description: row.description,
    monthlyAmount: Number(row.monthly_amount) || 0,
    startDate: String(row.start_date).slice(0, 10),
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
    active: row.active !== false,
  };
}

function paraLinha(row: ItemRow): LinhaPreFatura {
  return {
    id: row.id,
    serviceId: row.service_id,
    itemKind: row.item_kind,
    billingReference: row.billing_reference,
    shortName: row.short_name,
    description: row.description,
    serviceStartDate: row.service_start_date,
    contractualAmount: Number(row.contractual_amount) || 0,
    calculatedAmount: Number(row.calculated_amount) || 0,
    invoicedAmount: Number(row.invoiced_amount) || 0,
    excluded: row.excluded === true,
    sortOrder: Number(row.sort_order) || 0,
  };
}

export async function listarClientesPreFatura(): Promise<ClientePreFatura[]> {
  const saida: ClientePreFatura[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, trading_name, cnpj, email, medicao_email, phone, street, number, complement, neighborhood, city, state, zip_code, issuer_company, nf_municipal_service_code, nf_municipal_service_name, nf_service_description')
      .order('name', { ascending: true })
      .range(de, de + 999);
    if (error) falha(error, 'Não foi possível listar os clientes.');
    const pagina = (data || []) as ClientePreFatura[];
    saida.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return saida;
}

export async function listarServicosDoCliente(clientId: string): Promise<ServicoMensalRow[]> {
  const { data, error } = await supabase
    .from('client_monthly_services')
    .select('*')
    .eq('client_id', Number(clientId))
    .order('short_name', { ascending: true });
  if (error) falha(error, 'Não foi possível listar os serviços.');
  return (data || []) as ServicoMensalRow[];
}

export async function salvarServicoMensal(clientId: string, entrada: ServicoMensalEntrada, id?: string): Promise<void> {
  const erro = validarServicoMensal(entrada);
  if (erro) throw new Error(erro);
  const usuario = usuarioDoNavegador();
  const payload: Record<string, unknown> = {
    client_id: Number(clientId),
    short_name: entrada.shortName.trim(),
    description: entrada.description.trim(),
    post_count: entrada.postCount,
    schedule_type: String(entrada.scheduleType || '').trim(),
    work_hours: String(entrada.workHours || '').trim(),
    monthly_amount: entrada.monthlyAmount,
    start_date: entrada.startDate,
    end_date: entrada.endDate ? entrada.endDate : null,
    active: entrada.active !== false,
    updated_at: agoraIso(),
  };
  if (!id) {
    payload.created_by = usuario.name;
    payload.created_by_user_id = usuario.id;
  }
  const consulta = id
    ? supabase.from('client_monthly_services').update(payload).eq('id', id).eq('client_id', Number(clientId))
    : supabase.from('client_monthly_services').insert(payload);
  const { error } = await consulta;
  if (error && usuario.id && /created_by_user_id|system_users/i.test(error.message || '')) {
    delete payload.created_by_user_id;
    const retry = id
      ? await supabase.from('client_monthly_services').update(payload).eq('id', id).eq('client_id', Number(clientId))
      : await supabase.from('client_monthly_services').insert(payload);
    if (retry.error) falha(retry.error, 'Não foi possível salvar o serviço.');
    return;
  }
  if (error) falha(error, 'Não foi possível salvar o serviço.');
}

export async function alternarServicoAtivo(id: string, clientId: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('client_monthly_services')
    .update({ active, updated_at: agoraIso() })
    .eq('id', id)
    .eq('client_id', Number(clientId));
  if (error) falha(error, 'Não foi possível atualizar a situação do serviço.');
}

async function gravarTotais(preInvoiceId: string, linhas: ItemRow[]): Promise<PreFaturaRow> {
  const totais = totaisDaPreFatura(linhas.map(paraLinha));
  const { data, error } = await supabase
    .from('client_pre_invoices')
    .update({
      total_contractual_amount: totais.contratual,
      total_invoiced_amount: totais.faturar,
      updated_at: agoraIso(),
    })
    .eq('id', preInvoiceId)
    .select('*')
    .single();
  if (error) falha(error, 'Não foi possível atualizar o total.');
  return data as PreFaturaRow;
}

export async function carregarPreFatura(id: string): Promise<{ fatura: PreFaturaRow; itens: ItemRow[]; ajustes: AjusteRow[] }> {
  const [faturaRes, itensRes, ajustesRes] = await Promise.all([
    supabase.from('client_pre_invoices').select('*').eq('id', id).single(),
    supabase.from('client_pre_invoice_items').select('*').eq('pre_invoice_id', id).order('sort_order', { ascending: true }),
    supabase.from('client_pre_invoice_adjustments').select('*').eq('pre_invoice_id', id).order('created_at', { ascending: false }),
  ]);
  if (faturaRes.error) falha(faturaRes.error, 'Não foi possível abrir a pré-fatura.');
  if (itensRes.error) falha(itensRes.error, 'Não foi possível ler as linhas.');
  if (ajustesRes.error) falha(ajustesRes.error, 'Não foi possível ler o histórico.');
  return {
    fatura: faturaRes.data as PreFaturaRow,
    itens: (itensRes.data || []) as ItemRow[],
    ajustes: (ajustesRes.data || []) as AjusteRow[],
  };
}

export async function buscarPreFaturaAberta(clientId: string, competencia: string): Promise<PreFaturaRow | null> {
  if (!competenciaValida(competencia)) throw new Error('Competência inválida.');
  const { data, error } = await supabase
    .from('client_pre_invoices')
    .select('*')
    .eq('client_id', Number(clientId))
    .eq('competence', competencia)
    .neq('status', 'CANCELADA')
    .maybeSingle();
  if (error) falha(error, 'Não foi possível buscar a pré-fatura.');
  return (data as PreFaturaRow) || null;
}

export async function montarPreFatura(clientId: string, competencia: string): Promise<{ fatura: PreFaturaRow; itens: ItemRow[]; ajustes: AjusteRow[] }> {
  if (!competenciaValida(competencia)) throw new Error('Competência inválida.');
  const existente = await buscarPreFaturaAberta(clientId, competencia);
  if (existente) return carregarPreFatura(existente.id);

  const servicos = await listarServicosDoCliente(clientId);
  const linhas = montarLinhasDoCadastro(servicos.map(paraServicoVigente), competencia);
  if (linhas.length === 0) {
    throw new Error('Nenhum serviço vigente nesta competência.');
  }
  const usuario = usuarioDoNavegador();
  const totais = totaisDaPreFatura(linhas);
  const { data, error } = await supabase
    .from('client_pre_invoices')
    .insert({
      client_id: Number(clientId),
      competence: competencia,
      status: 'RASCUNHO',
      total_contractual_amount: totais.contratual,
      total_invoiced_amount: totais.faturar,
      created_by: usuario.name,
      created_by_user_id: usuario.id,
      updated_at: agoraIso(),
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      const deNovo = await buscarPreFaturaAberta(clientId, competencia);
      if (deNovo) return carregarPreFatura(deNovo.id);
    }
    if (usuario.id && /created_by_user_id|system_users/i.test(error.message || '')) {
      const retry = await supabase
        .from('client_pre_invoices')
        .insert({
          client_id: Number(clientId),
          competence: competencia,
          status: 'RASCUNHO',
          total_contractual_amount: totais.contratual,
          total_invoiced_amount: totais.faturar,
          created_by: usuario.name,
          updated_at: agoraIso(),
        })
        .select('*')
        .single();
      if (retry.error) falha(retry.error, 'Não foi possível criar a pré-fatura.');
      return inserirItens(retry.data as PreFaturaRow, linhas);
    }
    falha(error, 'Não foi possível criar a pré-fatura.');
  }
  return inserirItens(data as PreFaturaRow, linhas);
}

async function inserirItens(fatura: PreFaturaRow, linhas: LinhaPreFatura[]): Promise<{ fatura: PreFaturaRow; itens: ItemRow[]; ajustes: AjusteRow[] }> {
  const registros = linhas.map((linha) => ({
    pre_invoice_id: fatura.id,
    service_id: linha.serviceId || null,
    item_kind: linha.itemKind,
    billing_reference: linha.billingReference,
    short_name: linha.shortName || null,
    description: linha.description,
    service_start_date: linha.serviceStartDate || null,
    contractual_amount: linha.contractualAmount,
    calculated_amount: linha.calculatedAmount,
    invoiced_amount: linha.invoicedAmount,
    excluded: false,
    sort_order: linha.sortOrder,
    updated_at: agoraIso(),
  }));
  const { error } = await supabase.from('client_pre_invoice_items').insert(registros);
  if (error) falha(error, 'Não foi possível gravar as linhas da pré-fatura.');
  return carregarPreFatura(fatura.id);
}

async function exigirRascunho(id: string): Promise<PreFaturaRow> {
  const { data, error } = await supabase.from('client_pre_invoices').select('*').eq('id', id).single();
  if (error) falha(error, 'Não foi possível ler a pré-fatura.');
  const fatura = data as PreFaturaRow;
  if (!podeEditar(fatura.status)) throw new Error('Esta pré-fatura está travada.');
  return fatura;
}

async function registrarAjuste(item: ItemRow, ajuste: { previousAmount: number; newAmount: number; reason: string; adjustmentKind: string }): Promise<void> {
  const usuario = usuarioDoNavegador();
  const { error } = await supabase.from('client_pre_invoice_adjustments').insert({
    item_id: item.id,
    pre_invoice_id: item.pre_invoice_id,
    previous_amount: ajuste.previousAmount,
    new_amount: ajuste.newAmount,
    reason: ajuste.reason,
    adjustment_kind: ajuste.adjustmentKind,
    user_name: usuario.name,
    user_id: usuario.id,
  });
  if (error && usuario.id && /user_id|system_users/i.test(error.message || '')) {
    const retry = await supabase.from('client_pre_invoice_adjustments').insert({
      item_id: item.id,
      pre_invoice_id: item.pre_invoice_id,
      previous_amount: ajuste.previousAmount,
      new_amount: ajuste.newAmount,
      reason: ajuste.reason,
      adjustment_kind: ajuste.adjustmentKind,
      user_name: usuario.name,
    });
    if (retry.error) falha(retry.error, 'Não foi possível gravar o histórico.');
    return;
  }
  if (error) falha(error, 'Não foi possível gravar o histórico.');
}

export async function ajustarValorLinha(itemId: string, novoValor: number, motivo: string, tipo: string): Promise<void> {
  const { data, error } = await supabase.from('client_pre_invoice_items').select('*').eq('id', itemId).single();
  if (error) falha(error, 'Linha não encontrada.');
  const item = data as ItemRow;
  await exigirRascunho(item.pre_invoice_id);
  if (item.excluded) throw new Error('A linha excluída não recebe valor. Reinclua antes.');
  const valor = item.item_kind === 'DESCONTO'
    ? valorInformadoDaLinha('DESCONTO', novoValor)
    : valorInformadoDaLinha('SERVICO', novoValor);
  const erroValor = validarNovoValor(item.item_kind === 'DESCONTO' ? 'DESCONTO' : 'SERVICO', valor);
  if (erroValor) throw new Error(erroValor);
  const preparado = prepararAjusteValor({
    atual: Number(item.invoiced_amount) || 0,
    novo: valor,
    motivo,
    tipo,
  });
  if (!preparado.ok) throw new Error(preparado.erro);
  await registrarAjuste(item, preparado.ajuste);
  const { error: upErr } = await supabase
    .from('client_pre_invoice_items')
    .update({ invoiced_amount: preparado.ajuste.newAmount, updated_at: agoraIso() })
    .eq('id', item.id);
  if (upErr) falha(upErr, 'Não foi possível gravar o valor.');
  const itens = await supabase.from('client_pre_invoice_items').select('*').eq('pre_invoice_id', item.pre_invoice_id);
  if (itens.error) falha(itens.error, 'Não foi possível reler as linhas.');
  await gravarTotais(item.pre_invoice_id, (itens.data || []) as ItemRow[]);
}

export async function incluirLinhaExtra(preInvoiceId: string, entrada: {
  tipo: Exclude<TipoLinhaPreFatura, 'SERVICO'>;
  description: string;
  valor: number;
  motivo: string;
}): Promise<void> {
  const fatura = await exigirRascunho(preInvoiceId);
  if (!String(entrada.description || '').trim()) throw new Error('Informe a descrição.');
  const motivo = validarJustificativa(entrada.motivo);
  if (motivo) throw new Error(motivo);
  const valor = valorInformadoDaLinha(entrada.tipo, entrada.valor);
  const erroValor = validarNovoValor(entrada.tipo, valor);
  if (erroValor) throw new Error(erroValor);
  const { data: atuais, error: listErr } = await supabase
    .from('client_pre_invoice_items')
    .select('sort_order')
    .eq('pre_invoice_id', preInvoiceId)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (listErr) falha(listErr, 'Não foi possível ordenar a linha.');
  const ordem = ((atuais && atuais[0]?.sort_order) || 0) + 1;
  const { data: criada, error } = await supabase
    .from('client_pre_invoice_items')
    .insert({
      pre_invoice_id: preInvoiceId,
      service_id: null,
      item_kind: entrada.tipo,
      billing_reference: colunaCobranca(String(fatura.competence).trim()),
      description: entrada.description.trim(),
      contractual_amount: 0,
      calculated_amount: 0,
      invoiced_amount: valor,
      excluded: false,
      sort_order: ordem,
      updated_at: agoraIso(),
    })
    .select('*')
    .single();
  if (error) falha(error, 'Não foi possível incluir a linha.');
  const item = criada as ItemRow;
  await registrarAjuste(item, {
    previousAmount: 0,
    newAmount: valor,
    reason: entrada.motivo.trim(),
    adjustmentKind: entrada.tipo,
  });
  const itens = await supabase.from('client_pre_invoice_items').select('*').eq('pre_invoice_id', preInvoiceId);
  if (itens.error) falha(itens.error, 'Não foi possível reler as linhas.');
  await gravarTotais(preInvoiceId, (itens.data || []) as ItemRow[]);
}

export async function excluirLinha(itemId: string, motivo: string): Promise<void> {
  const texto = validarJustificativa(motivo);
  if (texto) throw new Error(texto);
  const { data, error } = await supabase.from('client_pre_invoice_items').select('*').eq('id', itemId).single();
  if (error) falha(error, 'Linha não encontrada.');
  const item = data as ItemRow;
  await exigirRascunho(item.pre_invoice_id);
  if (item.excluded) throw new Error('A linha já está fora da composição.');
  const anterior = Number(item.invoiced_amount) || 0;
  await registrarAjuste(item, {
    previousAmount: anterior,
    newAmount: 0,
    reason: motivo.trim(),
    adjustmentKind: 'EXCLUSAO',
  });
  const { error: upErr } = await supabase
    .from('client_pre_invoice_items')
    .update({
      excluded: true,
      exclusion_reason: motivo.trim(),
      invoiced_amount: 0,
      updated_at: agoraIso(),
    })
    .eq('id', item.id);
  if (upErr) falha(upErr, 'Não foi possível excluir a linha.');
  const itens = await supabase.from('client_pre_invoice_items').select('*').eq('pre_invoice_id', item.pre_invoice_id);
  if (itens.error) falha(itens.error, 'Não foi possível reler as linhas.');
  await gravarTotais(item.pre_invoice_id, (itens.data || []) as ItemRow[]);
}

export async function reincluirLinha(itemId: string, motivo: string): Promise<void> {
  const texto = validarJustificativa(motivo);
  if (texto) throw new Error(texto);
  const { data, error } = await supabase.from('client_pre_invoice_items').select('*').eq('id', itemId).single();
  if (error) falha(error, 'Linha não encontrada.');
  const item = data as ItemRow;
  await exigirRascunho(item.pre_invoice_id);
  if (!item.excluded) throw new Error('A linha já está na composição.');
  const { data: historico, error: histErr } = await supabase
    .from('client_pre_invoice_adjustments')
    .select('previous_amount')
    .eq('item_id', item.id)
    .eq('adjustment_kind', 'EXCLUSAO')
    .order('created_at', { ascending: false })
    .limit(1);
  if (histErr) falha(histErr, 'Não foi possível ler o valor anterior.');
  const anterior = historico && historico[0] ? Number(historico[0].previous_amount) || 0 : Number(item.contractual_amount) || 0;
  await registrarAjuste(item, {
    previousAmount: 0,
    newAmount: anterior,
    reason: motivo.trim(),
    adjustmentKind: 'REINCLUSAO',
  });
  const { error: upErr } = await supabase
    .from('client_pre_invoice_items')
    .update({
      excluded: false,
      exclusion_reason: null,
      invoiced_amount: anterior,
      updated_at: agoraIso(),
    })
    .eq('id', item.id);
  if (upErr) falha(upErr, 'Não foi possível reincluir a linha.');
  const itens = await supabase.from('client_pre_invoice_items').select('*').eq('pre_invoice_id', item.pre_invoice_id);
  if (itens.error) falha(itens.error, 'Não foi possível reler as linhas.');
  await gravarTotais(item.pre_invoice_id, (itens.data || []) as ItemRow[]);
}

export async function aprovarPreFatura(id: string): Promise<PreFaturaRow> {
  const { data, error } = await supabase.from('client_pre_invoices').select('*').eq('id', id).single();
  if (error) falha(error, 'Não foi possível ler a pré-fatura.');
  const fatura = data as PreFaturaRow;
  if (!podeAprovar(fatura.status)) throw new Error('Só um rascunho pode ser aprovado.');
  const usuario = usuarioDoNavegador();
  const { data: atualizada, error: upErr } = await supabase
    .from('client_pre_invoices')
    .update({
      status: 'APROVADA',
      approved_by: usuario.name,
      approved_by_user_id: usuario.id,
      approved_at: agoraIso(),
      updated_at: agoraIso(),
    })
    .eq('id', id)
    .eq('status', 'RASCUNHO')
    .select('*')
    .single();
  if (upErr && usuario.id && /approved_by_user_id|system_users/i.test(upErr.message || '')) {
    const retry = await supabase
      .from('client_pre_invoices')
      .update({
        status: 'APROVADA',
        approved_by: usuario.name,
        approved_at: agoraIso(),
        updated_at: agoraIso(),
      })
      .eq('id', id)
      .eq('status', 'RASCUNHO')
      .select('*')
      .single();
    if (retry.error) falha(retry.error, 'Não foi possível aprovar.');
    return retry.data as PreFaturaRow;
  }
  if (upErr) falha(upErr, 'Não foi possível aprovar.');
  return atualizada as PreFaturaRow;
}

export async function cancelarPreFatura(id: string, motivo: string): Promise<void> {
  const texto = validarJustificativa(motivo);
  if (texto) throw new Error(texto);
  const { data, error } = await supabase.from('client_pre_invoices').select('status, financial_invoice_id').eq('id', id).single();
  if (error) falha(error, 'Não foi possível ler a pré-fatura.');
  if (!podeCancelar(String(data.status))) throw new Error('Pré-fatura faturada não é cancelada por aqui.');
  if (data.financial_invoice_id) throw new Error('Já existe fatura ligada. Cancele no Controle de Faturas.');
  const { error: upErr } = await supabase
    .from('client_pre_invoices')
    .update({
      status: 'CANCELADA',
      cancel_reason: motivo.trim(),
      updated_at: agoraIso(),
    })
    .eq('id', id);
  if (upErr) falha(upErr, 'Não foi possível cancelar.');
}

export async function reservarEmissao(id: string): Promise<string> {
  const { data, error } = await supabase.from('client_pre_invoices').select('*').eq('id', id).single();
  if (error) falha(error, 'Não foi possível ler a pré-fatura.');
  const fatura = data as PreFaturaRow;
  if (!podeGerarFatura(fatura.status, fatura.financial_invoice_id, fatura.emission_ref)) {
    throw new Error('A geração de fatura só fica disponível na pré-fatura aprovada, sem emissão em andamento.');
  }
  const ref = referenciaRastreio();
  const { data: reservada, error: upErr } = await supabase
    .from('client_pre_invoices')
    .update({ emission_ref: ref, updated_at: agoraIso() })
    .eq('id', id)
    .eq('status', 'APROVADA')
    .is('financial_invoice_id', null)
    .is('emission_ref', null)
    .select('id');
  if (upErr) falha(upErr, 'Não foi possível reservar a emissão.');
  if (!reservada || reservada.length === 0) {
    throw new Error('Esta pré-fatura já tem uma emissão em andamento. Confira o Controle de Faturas antes de tentar de novo.');
  }
  return ref;
}

export async function liberarEmissao(id: string, ref: string): Promise<void> {
  await supabase
    .from('client_pre_invoices')
    .update({ emission_ref: null, updated_at: agoraIso() })
    .eq('id', id)
    .eq('emission_ref', ref)
    .is('financial_invoice_id', null);
}

export async function ligarFatura(id: string, invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('client_pre_invoices')
    .update({
      status: 'FATURADA',
      financial_invoice_id: invoiceId,
      updated_at: agoraIso(),
    })
    .eq('id', id)
    .eq('status', 'APROVADA');
  if (error) falha(error, 'A cobrança pode ter sido criada. Confira o Controle de Faturas antes de emitir de novo.');
}
