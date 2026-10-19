/**
 * Ponte de autenticação da fase 1. Nasce desligada.
 * Ausência da variável, vazio ou qualquer valor diferente de "true" significa desligada.
 * Mesmo ligada, esta fase não tem adaptador de produção.
 */

export const FLAG_PONTE_AUTH = 'GESTOR_FISCAL_PONTE_AUTH_ENABLED';

export function ponteAuthHabilitada(
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): boolean {
  return env[FLAG_PONTE_AUTH] === 'true';
}
