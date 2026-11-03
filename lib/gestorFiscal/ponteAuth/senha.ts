/**
 * Conferência de senha no servidor, só para o repositório isolado.
 * O hash fica no repositório. A senha em claro não é guardada.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const TAMANHO = 32;
const CUSTO = { N: 16384, r: 8, p: 1 } as const;

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = (await scrypt(senha, sal, TAMANHO, CUSTO)) as Buffer;
  return `scrypt$${sal.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function conferirSenha(senha: string, armazenada: string): Promise<boolean> {
  if (!senha || !armazenada) return false;
  const partes = armazenada.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  const sal = Buffer.from(partes[1], 'base64url');
  const esperado = Buffer.from(partes[2], 'base64url');
  if (sal.length === 0 || esperado.length === 0) return false;
  const calculado = (await scrypt(senha, sal, esperado.length, CUSTO)) as Buffer;
  if (calculado.length !== esperado.length) return false;
  return timingSafeEqual(calculado, esperado);
}
