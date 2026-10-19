/**
 * Fase 2. A homologação real nasce desligada.
 * Ausência da variável, vazio ou qualquer valor diferente de "true" significa desligado.
 * A flag não substitui autenticação, autorização no servidor nem RLS.
 */

export const FLAG_HOMOLOGACAO_REAL = 'GESTOR_FISCAL_HOMOLOGACAO_REAL_ENABLED';

export function homologacaoRealHabilitada(
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): boolean {
  return env[FLAG_HOMOLOGACAO_REAL] === 'true';
}
