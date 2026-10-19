/**
 * Hash de senha com scrypt do Node. Não é algoritmo próprio.
 * v1 explicita os parâmetros. O portal continua em scrypt$sal$hash, com os mesmos números implícitos.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const PARAMETROS_SCRYPT_V1 = { versao: 1, N: 16384, r: 8, p: 1, keylen: 32 } as const;

export type FormatoHash = 'scrypt_portal' | 'scrypt_v1' | 'outro';

export function identificarFormatoHash(gravada: string | null | undefined): FormatoHash | null {
  const salva = gravada == null ? '' : String(gravada);
  if (!salva) return null;
  if (salva.startsWith('$2a$') || salva.startsWith('$2b$') || salva.startsWith('$2y$') || salva.startsWith('$argon2')) {
    return 'outro';
  }
  const partes = salva.split('$');
  if (partes[0] !== 'scrypt') return salva.includes('$') ? 'outro' : null;
  if (partes.length === 3 && hex(partes[1]) && hex(partes[2])) return 'scrypt_portal';
  if (partes.length === 8 && partes[1] === 'v1' && parametrosConhecidos(partes) && hex(partes[6]) && hex(partes[7])) {
    return 'scrypt_v1';
  }
  return 'outro';
}

export function gerarHashVersionado(senha: string): string {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, sal, PARAMETROS_SCRYPT_V1.keylen, {
    N: PARAMETROS_SCRYPT_V1.N,
    r: PARAMETROS_SCRYPT_V1.r,
    p: PARAMETROS_SCRYPT_V1.p,
  }).toString('hex');
  return `scrypt$v1$${PARAMETROS_SCRYPT_V1.N}$${PARAMETROS_SCRYPT_V1.r}$${PARAMETROS_SCRYPT_V1.p}$${PARAMETROS_SCRYPT_V1.keylen}$${sal}$${hash}`;
}

export function verificarSenhaArmazenada(senha: string, armazenada: string | null | undefined): boolean {
  const limpa = String(senha ?? '').trim();
  if (!limpa) return false;
  const formato = identificarFormatoHash(armazenada);
  if (formato === 'scrypt_portal') return portalConfere(limpa, String(armazenada));
  if (formato === 'scrypt_v1') return v1Confere(limpa, String(armazenada));
  return false;
}

function portalConfere(senha: string, armazenada: string): boolean {
  const partes = armazenada.split('$');
  const calculado = scryptSync(senha, partes[1], 32);
  const salvo = Buffer.from(partes[2], 'hex');
  if (calculado.length !== salvo.length) return false;
  return timingSafeEqual(calculado, salvo);
}

function v1Confere(senha: string, armazenada: string): boolean {
  const partes = armazenada.split('$');
  const calculado = scryptSync(senha, partes[6], PARAMETROS_SCRYPT_V1.keylen, {
    N: PARAMETROS_SCRYPT_V1.N,
    r: PARAMETROS_SCRYPT_V1.r,
    p: PARAMETROS_SCRYPT_V1.p,
  });
  const salvo = Buffer.from(partes[7], 'hex');
  if (calculado.length !== salvo.length) return false;
  return timingSafeEqual(calculado, salvo);
}

function parametrosConhecidos(partes: string[]): boolean {
  return Number(partes[2]) === PARAMETROS_SCRYPT_V1.N
    && Number(partes[3]) === PARAMETROS_SCRYPT_V1.r
    && Number(partes[4]) === PARAMETROS_SCRYPT_V1.p
    && Number(partes[5]) === PARAMETROS_SCRYPT_V1.keylen;
}

function hex(valor: string): boolean {
  return valor.length > 0 && valor.length % 2 === 0 && /^[0-9a-f]+$/i.test(valor);
}
