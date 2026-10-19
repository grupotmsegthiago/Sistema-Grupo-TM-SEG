/**
 * Formatos que o sistema já grava. Esta fase não reescreve senha.
 * Funcionário: texto em system_users, comparado sem espaços nas pontas.
 * Portal: prefixo scrypt$, sal e hash em hexadecimal.
 * Prefixo de outro algoritmo não é tratado como texto.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export type FormatoSenhaExistente = 'texto' | 'scrypt' | 'vazia' | 'nao_reconhecido';

export function classificarSenhaGravada(gravada: string | null | undefined): FormatoSenhaExistente {
  const salva = gravada == null ? '' : String(gravada);
  if (!salva) return 'vazia';
  if (salva.startsWith('$2a$') || salva.startsWith('$2b$') || salva.startsWith('$2y$') || salva.startsWith('$argon2')) {
    return 'nao_reconhecido';
  }
  const partes = salva.split('$');
  if (partes[0] === 'scrypt' && partes.length === 3 && partes[1] && partes[2]) return 'scrypt';
  if (salva.includes('$')) return 'nao_reconhecido';
  return 'texto';
}

/** Igual ao hash já usado no portal. Não é o hash experimental da fase 2. */
export function gerarHashScryptCompativel(senha: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function conferirSenhaExistente(informada: string, gravada: string | null | undefined): boolean {
  const formato = classificarSenhaGravada(gravada);
  const limpa = String(informada ?? '').trim();
  if (!limpa || formato === 'vazia' || formato === 'nao_reconhecido') return false;
  if (formato === 'scrypt') return scryptConfere(limpa, String(gravada));
  const digitada = Buffer.from(limpa);
  const armazenada = Buffer.from(String(gravada));
  if (digitada.length !== armazenada.length) return false;
  return timingSafeEqual(digitada, armazenada);
}

function scryptConfere(senha: string, armazenada: string): boolean {
  const partes = armazenada.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt' || !partes[1] || !partes[2]) return false;
  const calculado = scryptSync(senha, partes[1], 32);
  const salvo = Buffer.from(partes[2], 'hex');
  if (calculado.length !== salvo.length || !/^[0-9a-f]+$/i.test(partes[2])) return false;
  return timingSafeEqual(calculado, salvo);
}
