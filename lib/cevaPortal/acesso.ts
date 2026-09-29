import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export const PERFIS_CEVA = ['administrador', 'analista'] as const;
export type PerfilCeva = (typeof PERFIS_CEVA)[number];

export function podeCadastrarPessoa(perfil: string | null | undefined): boolean {
  return perfil === 'administrador';
}

export function emailDeAcesso(value: unknown): string | null {
  const email = String(value ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) return null;
  return email;
}

export function nomeDeAcesso(value: unknown): string | null {
  const nome = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ');
  if (nome.length < 2 || nome.length > 120) return null;
  return nome;
}

export function perfilDeAcesso(value: unknown): PerfilCeva | null {
  const perfil = String(value ?? '').trim().toLowerCase();
  return perfil === 'administrador' || perfil === 'analista' ? perfil : null;
}

export function validarSenha(senha: string): string | null {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (senha.length > 72) return 'A senha passou do limite.';
  return null;
}

export function hashSenha(senha: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function senhaConfere(senha: string, armazenada: string | null | undefined): boolean {
  const partes = String(armazenada || '').split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt' || !partes[1] || !partes[2]) return false;
  const calculado = scryptSync(senha, partes[1], 32);
  const salvo = Buffer.from(partes[2], 'hex');
  if (calculado.length !== salvo.length) return false;
  return timingSafeEqual(calculado, salvo);
}

const ALFABETO_SENHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function gerarSenhaTemporaria(): string {
  const bytes = randomBytes(12);
  return [...bytes].map((byte) => ALFABETO_SENHA[byte % ALFABETO_SENHA.length]).join('');
}

export function decidirPrimeiroAcesso(input: {
  existeAdministrador: boolean;
}): { ok: true; acao: 'criar-administrador' } | { ok: false; error: string } {
  if (!input.existeAdministrador) return { ok: true, acao: 'criar-administrador' };
  return { ok: false, error: 'A senha chega por e-mail quando o administrador libera o acesso. Entre com ela para trocar no primeiro acesso.' };
}
