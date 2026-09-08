/**
 * Serviço de comissões comerciais (browser / Supabase anon).
 * Cálculo: lib/comissao/comissaoCalc.ts — geração/baixa: lib/comissao/comissaoCore.ts
 */
import { supabase } from '../supabase';
import { calcularComissao } from './comissaoCalc';
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
): Promise<{ ok: boolean; comprovanteUrl?: string; error?: string }> {
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
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from('comissoes')
    .update({
      status: 'PAGO',
      comprovante_url: comprovanteUrl,
      data_pagamento_comissao: today,
    })
    .eq('id', id)
    .eq('status', 'LIBERADO_PARA_PAGAMENTO');

  if (error) return { ok: false, error: error.message };
  return { ok: true, comprovanteUrl };
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
