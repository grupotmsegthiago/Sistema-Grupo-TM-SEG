export const FINANCIAL_PAYMENT_METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'TRANSFERENCIA', label: 'Transferência' },
  { value: 'DEBITO_AUTOMATICO', label: 'Déb. Automático' },
] as const;

export type FinancialPaymentMethod =
  (typeof FINANCIAL_PAYMENT_METHODS)[number]['value'];
