import { digitosCnpj, formatarCnpj } from './cnpj';
import type { PartnerProspect } from './types';

/**
 * Payload mínimo para criar o fornecedor a partir do prospecto.
 * Status sempre Bloqueado — não entra na Nova OS até liberação manual.
 * Não grava provider_cost_tables.
 */
export function payloadFornecedorBloqueado(
  prospect: Pick<
    PartnerProspect,
    | 'cnpj'
    | 'company_name'
    | 'trade_name'
    | 'city'
    | 'state_uf'
    | 'email'
    | 'phone'
    | 'contact_name'
    | 'document_url'
    | 'alvara_validity'
  >,
  createdBy: string,
): Record<string, unknown> {
  const name = String(prospect.company_name || '').trim().toUpperCase();
  const trading = String(prospect.trade_name || prospect.company_name || '')
    .trim()
    .toUpperCase();
  const cnpjDigits = digitosCnpj(prospect.cnpj);
  return {
    name,
    trading_name: trading,
    cnpj: formatarCnpj(cnpjDigits),
    type: 'Escolta Caracterizada',
    status: 'Bloqueado',
    contact_name: String(prospect.contact_name || '').trim() || null,
    email: String(prospect.email || '').trim().toLowerCase() || null,
    phone: String(prospect.phone || '').trim() || null,
    city: String(prospect.city || '').trim().toUpperCase() || null,
    state: String(prospect.state_uf || '').trim().toUpperCase() || null,
    alvara_url: prospect.document_url || null,
    alvara_validity: prospect.alvara_validity || null,
    created_by: createdBy || 'SISTEMA',
  };
}
