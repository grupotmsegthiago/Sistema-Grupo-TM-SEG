/**
 * Endereço fiscal mínimo do cliente para emitir NF no Asaas.
 * Sem CEP/cidade/UF a Prefeitura/Asaas devolve erro depois da cobrança.
 */

export type ClientAddressLike = {
  zip_code?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  /** Formato Asaas (lookup create-charge) */
  postalCode?: string | null;
  address?: string | null;
  addressNumber?: string | null;
};

export type ClientAddressFieldKey =
  | 'CEP'
  | 'Logradouro'
  | 'Número'
  | 'Cidade'
  | 'UF';

const FIELD_LABELS: ClientAddressFieldKey[] = [
  'CEP',
  'Logradouro',
  'Número',
  'Cidade',
  'UF',
];

function readCep(input: ClientAddressLike): string {
  return String(input.zip_code || input.postalCode || '').replace(/\D/g, '');
}

function readStreet(input: ClientAddressLike): string {
  return String(input.street || input.address || '').trim();
}

function readNumber(input: ClientAddressLike): string {
  return String(input.number || input.addressNumber || '').trim();
}

function readCity(input: ClientAddressLike): string {
  return String(input.city || '').trim();
}

function readState(input: ClientAddressLike): string {
  return String(input.state || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
}

/** Campos faltantes para NF (labels em PT-BR). */
export function missingClientAddressFields(input: ClientAddressLike | null | undefined): ClientAddressFieldKey[] {
  if (!input) return [...FIELD_LABELS];
  const missing: ClientAddressFieldKey[] = [];
  if (readCep(input).length !== 8) missing.push('CEP');
  if (!readStreet(input)) missing.push('Logradouro');
  if (!readNumber(input)) missing.push('Número');
  if (!readCity(input)) missing.push('Cidade');
  if (readState(input).length !== 2) missing.push('UF');
  return missing;
}

export function isClientAddressComplete(input: ClientAddressLike | null | undefined): boolean {
  return missingClientAddressFields(input).length === 0;
}

/** Converte cadastro `clients` → payload Asaas. */
export function toAsaasAddressPayload(input: ClientAddressLike): {
  postalCode: string;
  address: string;
  addressNumber: string;
  complement?: string;
  province?: string;
  city: string;
  state: string;
} {
  return {
    postalCode: readCep(input),
    address: readStreet(input),
    addressNumber: readNumber(input),
    complement: String(input.complement || '').trim() || undefined,
    province: String(input.neighborhood || '').trim() || undefined,
    city: readCity(input),
    state: readState(input),
  };
}

export function formatClientAddressIncompleteError(opts: {
  clientName?: string;
  missing: ClientAddressFieldKey[];
  cnpj?: string;
}): { error: string; code: string; missing: ClientAddressFieldKey[] } {
  const who = opts.clientName ? `"${opts.clientName}"` : 'do cliente';
  const list = opts.missing.join(', ');
  const cnpjHint = opts.cnpj ? ` (CNPJ ${opts.cnpj})` : '';
  return {
    code: 'CLIENT_ADDRESS_INCOMPLETE',
    missing: opts.missing,
    error:
      `Cadastro incompleto ${who}${cnpjHint}: falta ${list}. ` +
      `Abra Clientes → edite o cadastro → preencha CEP, Logradouro, Número, Cidade e UF (use a busca por CEP) e salve. ` +
      `Só então emita a fatura/NF novamente.`,
  };
}
