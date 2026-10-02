import { supabase } from '../supabase';
import {
  MEDICAO_ANEXO_BUCKET,
  MEDICAO_ANEXO_MAX_BYTES,
  montarCaminhoAnexoMedicao,
} from './medicaoAnexoStorage';

export type AnexoMedicaoGuardado = {
  filename: string;
  storagePath: string;
  contentType: string;
};

/** Grava o arquivo direto no armazenamento. O POST do e-mail leva só o caminho. */
export async function subirAnexoMedicao(
  blob: Blob,
  filename: string,
  contentType: string,
  pasta: string,
): Promise<AnexoMedicaoGuardado> {
  if (!blob || blob.size <= 0) {
    throw new Error(`O arquivo ${filename} saiu vazio.`);
  }
  if (blob.size > MEDICAO_ANEXO_MAX_BYTES) {
    throw new Error(`O arquivo ${filename} passou do tamanho aceito pelo e-mail.`);
  }
  const storagePath = montarCaminhoAnexoMedicao(pasta, filename);
  const { error } = await supabase.storage.from(MEDICAO_ANEXO_BUCKET).upload(storagePath, blob, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw new Error(`Não foi possível guardar ${filename} para o envio. ${error.message}`);
  }
  const nome = storagePath.split('/').pop() || filename;
  return { filename: nome, storagePath, contentType };
}
