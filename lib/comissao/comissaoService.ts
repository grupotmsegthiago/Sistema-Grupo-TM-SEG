/**
 * Serviço de comissões comerciais (browser / Supabase anon).
 * Cálculo: lib/comissao/comissaoCalc.ts — geração/baixa: lib/comissao/comissaoCore.ts
 */
import { supabase } from '../supabase';
import { formatIsoDateBR } from '../dateUtils';
import { calcularComissao } from './comissaoCalc';
import { montarContaPagarComissao, notaContaPagarComissao, vencimentoPagamentoComissao } from './contaPagarComissao';
import {
  atualizarStatusAposBaixaCliente as atualizarCore,
  gerarComissaoAoFaturar as gerarCore,
} from './comissaoCore';

export { calcularComissao } from './comissaoCalc';
export type { CalculoComissao, ComissaoStatus } from './comissaoCalc';
export { COMISSAO_STATUS, COMISSAO_STATUS_LABEL } from './comissaoCalc';

const BUCKET = 'comissoes-comprovantes';
const FALLBACK_BUCKET = 'mission-evidence';

export async function gerarComissaoAoFaturar(
  faturaId: string,
  clienteId: number | string | null,
  valorFaturamento: number,
): Promise<ReturnType<typeof gerarCore>> {
  return gerarCore(supabase, {
    faturaId,
    clienteId,
    valorFaturamento,
  });
}

export async function atualizarStatusAposBaixaCliente(faturaId: string): Promise<{ ok: boolean; updated: number }> {
  return atualizarCore(supabase, faturaId);
}

export async function registrarPagamentoComissao(
  comissaoId: string,
  arquivoComprovante: File,
): Promise<{ ok: boolean; comprovanteUrl?: string; error?: string; aviso?: string }> {
  const id = String(comissaoId || '').trim();
  if (!id) return { ok: false, error: 'comissaoId ausente' };
  if (!arquivoComprovante) return { ok: false, error: 'Anexe o comprovante' };

  const ext = String(arquivoComprovante.name || 'pdf').split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'pdf';
  const path = `${id}/${Date.now()}.${ext}`;

  let bucket = BUCKET;
  let up = await supabase.storage.from(BUCKET).upload(path, arquivoComprovante, {
    upsert: true,
    contentType: arquivoComprovante.type || 'application/octet-stream',
  });
  if (up.error) {
    bucket = FALLBACK_BUCKET;
    up = await supabase.storage.from(FALLBACK_BUCKET).upload(`comissoes/${path}`, arquivoComprovante, {
      upsert: true,
      contentType: arquivoComprovante.type || 'application/octet-stream',
    });
  }
  if (up.error) return { ok: false, error: up.error.message };

  const storagePath = bucket === BUCKET ? path : `comissoes/${path}`;
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  const comprovanteUrl = urlData?.publicUrl || '';
  const agora = new Date();

  const dataPagamento = formatIsoDateBR(agora);
  const { data: paga, error } = await supabase
    .from('comissoes')
    .update({
      status: 'PAGO',
      comprovante_url: comprovanteUrl,
      data_pagamento_comissao: dataPagamento,
      pago_em: agora.toISOString(),
    })
    .eq('id', id)
    .eq('status', 'LIBERADO_PARA_PAGAMENTO')
    .select('conta_pagar_id');

  if (error) return { ok: false, error: error.message };
  const contaPagarId = String(paga?.[0]?.conta_pagar_id || '').trim();
  if (contaPagarId) {
    const { error: baixaErr } = await supabase
      .from('financial_transactions')
      .update({
        status: 'PAID',
        payment_date: dataPagamento,
        doc_comprovante_url: comprovanteUrl || null,
        updated_by: usuarioAtual(),
      })
      .eq('id', contaPagarId);
    if (baixaErr) {
      console.warn('[comissao] baixa do Contas a Pagar:', baixaErr.message);
      return {
        ok: true,
        comprovanteUrl,
        aviso: 'A comissão foi paga, mas o Contas a Pagar não foi baixado.',
      };
    }
  }
  return { ok: true, comprovanteUrl };
}

function usuarioAtual(): string | null {
  try {
    const nome = String(JSON.parse(localStorage.getItem('userData') || '{}')?.name || '').trim();
    return nome || null;
  } catch {
    return null;
  }
}

export async function lancarPagamentoComissao(input: {
  id: string;
  cliente?: string | null;
  fatura?: string | null;
  comercial?: string | null;
  dataFaturamento?: string | null;
  valor: number;
  contaPagarId?: string | null;
}): Promise<{ ok: boolean; transactionId?: string; error?: string }> {
  const id = String(input.id || '').trim();
  if (!id) return { ok: false, error: 'comissaoId ausente' };
  const valor = Math.round(Number(input.valor) * 100) / 100;
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'Valor a pagar inválido' };

  const { data: atual, error: leituraErr } = await supabase
    .from('comissoes')
    .select('id, status, conta_pagar_id, empresa_origem, data_recebimento_cliente, data_faturamento')
    .eq('id', id)
    .maybeSingle();
  if (leituraErr) return { ok: false, error: leituraErr.message };
  if (!atual || atual.status !== 'LIBERADO_PARA_PAGAMENTO') {
    return { ok: false, error: 'A comissão não está liberada para pagamento' };
  }
  if (String(atual.empresa_origem || '').toUpperCase() === 'TORRES') {
    return { ok: false, error: 'Comissão TORRES não entra no Contas a Pagar da TM SEG.' };
  }
  const jaInformado = String(input.contaPagarId || '').trim();
  if (jaInformado) return { ok: true, transactionId: jaInformado };
  if (atual.conta_pagar_id) return { ok: true, transactionId: String(atual.conta_pagar_id) };

  const nota = notaContaPagarComissao(id);
  const { data: existente, error: buscaErr } = await supabase
    .from('financial_transactions')
    .select('id')
    .eq('type', 'EXPENSE')
    .ilike('notes', `%${nota}%`)
    .limit(1);
  if (buscaErr) return { ok: false, error: buscaErr.message };

  let transactionId = String(existente?.[0]?.id || '').trim();
  if (!transactionId) {
    const { data: categoria } = await supabase
      .from('financial_categories')
      .select('id')
      .eq('type', 'EXPENSE')
      .eq('name', 'COMISSÃO')
      .limit(1);
    const payload = montarContaPagarComissao({
      id,
      cliente: input.cliente,
      fatura: input.fatura,
      comercial: input.comercial,
      dataFaturamento: input.dataFaturamento,
      valor,
      dueDate: vencimentoPagamentoComissao(atual.data_recebimento_cliente || atual.data_faturamento, formatIsoDateBR()),
      categoryId: categoria?.[0]?.id || null,
      createdBy: usuarioAtual(),
    });
    const { data: criado, error: insertErr } = await supabase
      .from('financial_transactions')
      .insert(payload)
      .select('id')
      .single();
    if (insertErr) return { ok: false, error: insertErr.message };
    transactionId = String(criado?.id || '').trim();
  }
  if (!transactionId) return { ok: false, error: 'Não foi possível criar o Contas a Pagar' };

  const { data: ligado, error: ligaErr } = await supabase
    .from('comissoes')
    .update({ conta_pagar_id: transactionId })
    .eq('id', id)
    .eq('status', 'LIBERADO_PARA_PAGAMENTO')
    .is('conta_pagar_id', null)
    .select('conta_pagar_id');
  if (ligaErr) return { ok: false, error: ligaErr.message };
  const gravado = String(ligado?.[0]?.conta_pagar_id || '').trim();
  if (gravado && gravado !== transactionId) {
    await supabase.from('financial_transactions').delete().eq('id', transactionId);
    return { ok: true, transactionId: gravado };
  }
  if (!gravado) {
    const { data: deNovo } = await supabase.from('comissoes').select('conta_pagar_id').eq('id', id).maybeSingle();
    const outro = String(deNovo?.conta_pagar_id || '').trim();
    if (outro && outro !== transactionId) {
      await supabase.from('financial_transactions').delete().eq('id', transactionId);
      return { ok: true, transactionId: outro };
    }
    return { ok: false, error: 'Não foi possível ligar o lançamento à comissão' };
  }
  return { ok: true, transactionId };
}

export async function listarComerciaisAtivos(): Promise<Array<{ id: string; nome: string }>> {
  const { data, error } = await supabase
    .from('comerciais')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome');
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({ id: String(r.id), nome: String(r.nome || '') }));
}
