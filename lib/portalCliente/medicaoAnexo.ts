export const ANEXO_MEDICAO_MAX_BYTES = 3_000_000;

const TIPOS_ANEXO: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function anexoMedicao(input: { nome?: unknown; tipo?: unknown; base64?: unknown }): { ok: true; nome: string; tipo: string; bytes: Buffer } | { ok: true; vazio: true } | { ok: false; erro: string } {
  const base64 = String(input.base64 || '').trim();
  if (!base64) return { ok: true, vazio: true };
  const tipo = String(input.tipo || '').trim().toLowerCase();
  const extensao = TIPOS_ANEXO[tipo];
  if (!extensao) return { ok: false, erro: 'Anexe PDF ou imagem (PNG, JPG ou WEBP).' };
  const limpo = base64.replace(/^data:[^;]+;base64,/, '');
  let bytes: Buffer;
  try {
    bytes = Buffer.from(limpo, 'base64');
  } catch {
    return { ok: false, erro: 'Não foi possível ler o anexo.' };
  }
  if (bytes.length === 0) return { ok: false, erro: 'O anexo está vazio.' };
  if (bytes.length > ANEXO_MEDICAO_MAX_BYTES) return { ok: false, erro: 'O anexo passa de 3 MB.' };
  const nomeBruto = String(input.nome || `anexo.${extensao}`).replace(/[^\w.\- ]+/g, '').trim() || `anexo.${extensao}`;
  return { ok: true, nome: nomeBruto.slice(0, 120), tipo, bytes };
}
