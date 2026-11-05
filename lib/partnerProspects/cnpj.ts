/** CNPJ da prospecção: sempre 14 dígitos na fila. */

export function digitosCnpj(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function cnpjValido14(value: unknown): boolean {
  return digitosCnpj(value).length === 14;
}

export function formatarCnpj(value: unknown): string {
  const d = digitosCnpj(value);
  if (d.length !== 14) return String(value ?? '');
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
