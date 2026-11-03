/**
 * Ponte de autenticação. Nasce desligada.
 * Ausência da variável, vazio ou qualquer valor diferente de "true" significa desligada.
 * A flag HTTP, sozinha, não arma a integração: INTEGRACAO_HTTP_LIBERADA permanece falsa.
 */

export const FLAG_PONTE_AUTH = 'GESTOR_FISCAL_PONTE_AUTH_ENABLED';
export const FLAG_PONTE_HTTP = 'GESTOR_FISCAL_PONTE_HTTP_ARMADA';

/** Liberação de código. Ambiente não vira esta constante. */
export const INTEGRACAO_HTTP_LIBERADA = false;

export function ponteAuthHabilitada(
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): boolean {
  return env[FLAG_PONTE_AUTH] === 'true';
}

export function ponteHttpArmada(
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): boolean {
  return env[FLAG_PONTE_HTTP] === 'true';
}
