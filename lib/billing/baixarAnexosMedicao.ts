import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import {
  MEDICAO_ANEXO_BUCKET,
  MEDICAO_ANEXO_MAX_BYTES,
  caminhoAnexoMedicaoValido,
} from './medicaoAnexoStorage.js';

/** Lê o anexo gravado pelo navegador. Recusa caminho fora da pasta da medição. */
export async function baixarAnexoMedicao(storagePath: string): Promise<Buffer> {
  if (!caminhoAnexoMedicaoValido(storagePath)) {
    throw new Error('Caminho do anexo da medição inválido');
  }
  const sb = createSupabaseAdminClient();
  if (!sb) {
    throw new Error('Armazenamento da medição indisponível');
  }
  const { data, error } = await sb.storage.from(MEDICAO_ANEXO_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(error?.message || 'Não foi possível ler o anexo da medição');
  }
  const buf = Buffer.from(await data.arrayBuffer());
  if (buf.length === 0) {
    throw new Error('Anexo da medição veio vazio');
  }
  if (buf.length > MEDICAO_ANEXO_MAX_BYTES) {
    throw new Error('O anexo da medição passou do tamanho aceito pelo e-mail');
  }
  return buf;
}

export async function apagarAnexosMedicao(paths: string[]): Promise<void> {
  const validos = paths.filter((p) => caminhoAnexoMedicaoValido(p));
  if (validos.length === 0) return;
  const sb = createSupabaseAdminClient();
  if (!sb) return;
  await sb.storage.from(MEDICAO_ANEXO_BUCKET).remove(validos);
}
