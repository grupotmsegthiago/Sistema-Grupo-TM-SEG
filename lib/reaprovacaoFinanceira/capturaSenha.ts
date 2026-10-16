/**
 * Conferência da senha e da imagem. Uso só no servidor.
 * A senha não entra em mensagem de erro, log nem retorno.
 */
import { timingSafeEqual } from 'node:crypto';

export function senhasConferem(gravada: string, informada: string): boolean {
  const a = Buffer.from(String(gravada ?? ''), 'utf8');
  const b = Buffer.from(String(informada ?? ''), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function validarJpegBase64(
  entrada: unknown,
): { ok: true; base64: string; bytes: Uint8Array } | { ok: false; erro: string } {
  const texto = String(entrada || '').trim().replace(/^data:image\/jpeg;base64,/i, '');
  if (!texto) return { ok: false, erro: 'A captura obrigatória não foi gerada.' };
  let bytes: Uint8Array;
  try {
    const bin = Buffer.from(texto, 'base64');
    bytes = new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength);
  } catch {
    return { ok: false, erro: 'A captura obrigatória está inválida.' };
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { ok: false, erro: 'A captura obrigatória precisa ser uma imagem JPEG.' };
  }
  if (bytes.length > 3_500_000) {
    return { ok: false, erro: 'A captura obrigatória passou do tamanho permitido.' };
  }
  return { ok: true, base64: texto, bytes };
}
