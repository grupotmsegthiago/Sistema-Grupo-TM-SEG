/**
 * Auth das rotas de pagamentos parciais.
 * Reutiliza assertAsaasApiAccess — mesmos papéis do módulo Financeiro:
 * administrador, diretoria, financeiro, ceo, * / fin-* / finance-group.
 */
import { assertAsaasApiAccess, extractAuthToken } from '../asaasApiAuth.js';

type ReqHeaders = Record<string, string | string[] | undefined>;

export type FinancialPaymentsApiReq = { headers?: ReqHeaders };

/** Retorna null se autorizado; mensagem de erro se negado. */
export async function denyFinancialPaymentsApiUnlessAuthorized(
  req: FinancialPaymentsApiReq,
): Promise<string | null> {
  const token = extractAuthToken(req);
  return assertAsaasApiAccess(token, req);
}

export function financialPaymentsApiDeniedStatus(message: string): 401 | 403 {
  return message === 'Não autorizado' ? 401 : 403;
}

export { extractAuthToken };
