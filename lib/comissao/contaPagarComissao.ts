/**
 * Título e payload do lançamento de comissão em Contas a Pagar.
 * Uma linha por comissão, despesa pendente, categoria já existente COMISSÃO.
 */

const MESES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
] as const;

export function notaContaPagarComissao(comissaoId: string): string {
  return `comissao_id:${String(comissaoId || '').trim()}`;
}

function partesDaData(iso?: string | null): { y: number; mo: number; d: number } | null {
  const m = String(iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

function isoDia(y: number, mo: number, d: number): string {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Comissão é paga no dia 15.
 * Pagamento do cliente até o dia 15 entra nesse dia 15.
 * A partir do dia 16, entra no dia 15 do mês seguinte.
 */
export function vencimentoPagamentoComissao(dataPagamentoCliente?: string | null, hoje?: string | null): string {
  const base = partesDaData(dataPagamentoCliente) || partesDaData(hoje) || partesDaData(new Date().toISOString().slice(0, 10));
  if (!base) return '';
  let { y, mo } = base;
  if (base.d >= 16) {
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return isoDia(y, mo, 15);
}

/** Fechamento da comissão: 1º ou 2º quinzena do mês da data de faturamento. */
export function fechamentoComissao(dataFaturamento?: string | null): string {
  const raw = String(dataFaturamento || '').slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 'SEM FECHAMENTO';
  const mes = MESES[Number(m[2]) - 1];
  if (!mes) return 'SEM FECHAMENTO';
  const ordem = Number(m[3]) <= 15 ? '1º' : '2º';
  return `${ordem} QUINZENA DE ${mes}`;
}

export function tituloContaPagarComissao(input: {
  cliente?: string | null;
  fatura?: string | null;
  comercial?: string | null;
  dataFaturamento?: string | null;
}): string {
  const cliente = String(input.cliente || '').trim().toUpperCase() || 'SEM CLIENTE';
  const fatura = String(input.fatura || '').trim().toUpperCase() || 'SEM NF';
  const comercial = String(input.comercial || '').trim().toUpperCase() || 'SEM COMERCIAL';
  return `Comissão Comercial - ${cliente} / ${fatura} / ${comercial} / ${fechamentoComissao(input.dataFaturamento)}`;
}

export function montarContaPagarComissao(input: {
  id: string;
  cliente?: string | null;
  fatura?: string | null;
  comercial?: string | null;
  dataFaturamento?: string | null;
  valor: number;
  dueDate: string;
  categoryId?: string | null;
  createdBy?: string | null;
}): {
  type: 'EXPENSE';
  description: string;
  amount: number;
  due_date: string;
  payment_date: null;
  status: 'PENDING';
  category_id: string | null;
  category_name: 'COMISSÃO';
  account_id: null;
  account_name: null;
  entity_type: 'Other';
  entity_id: null;
  entity_name: string | null;
  notes: string;
  created_by: string | null;
  updated_by: string | null;
} {
  const comercial = String(input.comercial || '').trim();
  const amount = Math.round(Number(input.valor) * 100) / 100;
  return {
    type: 'EXPENSE',
    description: tituloContaPagarComissao(input),
    amount,
    due_date: String(input.dueDate || '').slice(0, 10),
    payment_date: null,
    status: 'PENDING',
    category_id: input.categoryId || null,
    category_name: 'COMISSÃO',
    account_id: null,
    account_name: null,
    entity_type: 'Other',
    entity_id: null,
    entity_name: comercial || null,
    notes: notaContaPagarComissao(input.id),
    created_by: input.createdBy || null,
    updated_by: input.createdBy || null,
  };
}
