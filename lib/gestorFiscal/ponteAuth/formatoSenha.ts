/**
 * Formatos que o sistema já grava. Esta fase não reescreve senha.
 * Funcionário: texto em system_users, comparado sem espaços nas pontas.
 * Portal: prefixo scrypt$, sal e hash em hexadecimal.
 * Prefixo de outro algoritmo não é tratado como texto.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { identificarFormatoHash, verificarSenhaArmazenada } from './hashSenha';

export type FormatoSenhaExistente = 'texto' | 'scrypt' | 'vazia' | 'nao_reconhecido';

export function classificarSenhaGravada(gravada: string | null | undefined): FormatoSenhaExistente {
  const salva = gravada == null ? '' : String(gravada);
  if (!salva) return 'vazia';
  if (salva.startsWith('$2a$') || salva.startsWith('$2b$') || salva.startsWith('$2y$') || salva.startsWith('$argon2')) {
    return 'nao_reconhecido';
  }
  const formato = identificarFormatoHash(salva);
  if (formato === 'scrypt_portal' || formato === 'scrypt_v1') return 'scrypt';
  if (formato === 'outro' || salva.includes('$')) return 'nao_reconhecido';
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
  if (formato === 'scrypt') return verificarSenhaArmazenada(limpa, gravada);
  const digitada = Buffer.from(limpa);
  const armazenada = Buffer.from(String(gravada));
  if (digitada.length !== armazenada.length) return false;
  return timingSafeEqual(digitada, armazenada);
}

