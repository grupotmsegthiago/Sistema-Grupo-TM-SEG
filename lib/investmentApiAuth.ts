/**
 * Auth compartilhada para rotas /api/investment/* (Express + handlers Vercel).
 * Reutiliza assertAsaasApiAccess — mesmo padrão de investment-accounts.
 */
import { assertAsaasApiAccess, extractAuthToken } from './asaasApiAuth.js';

type ReqHeaders = Record<string, string | string[] | undefined>;

export type InvestmentApiReq = { headers?: ReqHeaders };

/** Retorna null se autorizado; mensagem de erro se negado. */
export async function denyInvestmentApiUnlessAuthorized(
  req: InvestmentApiReq,
): Promise<string | null> {
  const token = extractAuthToken(req);
  return assertAsaasApiAccess(token, req);
}

export function investmentApiDeniedStatus(message: string): 401 | 403 {
  return message === 'Não autorizado' ? 401 : 403;
}
