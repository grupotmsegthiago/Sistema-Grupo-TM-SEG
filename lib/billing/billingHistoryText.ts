const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "Serviço Fornecedor: de R$ 1.197,85 para R$ 1.244,60" — ou null se não mudou. */
export function describeMoneyChange(label: string, from: number, to: number): string | null {
  if (Math.abs(Number(from) - Number(to)) <= 0.01) return null;
  return `${label}: de ${brl(Number(from) || 0)} para ${brl(Number(to) || 0)}`;
}

/** "Tabela Fornecedor: de 100KM para 200KM" — ou null se a tabela é a mesma. */
export function describeTableChange(
  label: string,
  fromId: string | null | undefined,
  fromName: string | null | undefined,
  toId: string | null | undefined,
  toName: string | null | undefined,
): string | null {
  const idFrom = String(fromId || '');
  const idTo = String(toId || '');
  if (!idFrom && !String(fromName || '').trim()) return null;
  if (idFrom && idTo && idFrom === idTo) return null;
  const nameFrom = String(fromName || '').trim() || idFrom || '—';
  const nameTo = String(toName || '').trim() || idTo || '—';
  if (nameFrom.toLowerCase() === nameTo.toLowerCase()) return null;
  return `${label}: de ${nameFrom} para ${nameTo}`;
}

/** "Aprovado pelo Financeiro · Serviço Fornecedor: de R$ 1 para R$ 2" */
export function formatHistoryAlteration(action: string, changes: string[] | null | undefined): string {
  const detail = (changes || []).map((c) => String(c || '').trim()).filter(Boolean);
  if (action && detail.length) return `${action} · ${detail.join(' · ')}`;
  if (action) return action;
  return detail.join(' · ') || 'Alteração';
}
