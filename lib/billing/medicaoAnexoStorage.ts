/**
 * Anexos da medição não entram no corpo do POST (limite de 4,5 MB da Vercel).
 * O navegador grava o arquivo e a API só recebe este caminho.
 */
export const MEDICAO_ANEXO_BUCKET = 'mission-evidence';
export const MEDICAO_ANEXO_PREFIX = 'medicoes/';
/** Abaixo do teto do e-mail (Office 365) e da memória da função. */
export const MEDICAO_ANEXO_MAX_BYTES = 18 * 1024 * 1024;

export function caminhoAnexoMedicaoValido(path: string): boolean {
  const p = String(path || '').trim().replace(/\\/g, '/');
  if (!p.startsWith(MEDICAO_ANEXO_PREFIX)) return false;
  if (p.length > 180) return false;
  if (p.split('/').some((part) => part === '' || part === '.' || part === '..')) return false;
  return /^medicoes\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(p);
}

export function montarCaminhoAnexoMedicao(pasta: string, filename: string): string {
  const pastaLimpa = String(pasta || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const nome = String(filename || 'anexo.bin').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  const path = `${MEDICAO_ANEXO_PREFIX}${pastaLimpa}/${nome}`;
  if (!caminhoAnexoMedicaoValido(path)) {
    throw new Error('Nome de anexo da medição inválido');
  }
  return path;
}

export function nomeAnexoMedicaoSeguro(name: string, fallback: string): string {
  const nome = String(name || fallback).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return nome || fallback;
}
