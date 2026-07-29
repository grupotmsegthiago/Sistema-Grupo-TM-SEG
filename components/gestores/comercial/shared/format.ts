export function formatBrl(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function formatBrlExact(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0);
}

export function formatPct(value: number): string {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

export function toneFromPct(value: number, good = 80, warn = 50): 'good' | 'warn' | 'bad' {
  if (value >= good) return 'good';
  if (value >= warn) return 'warn';
  return 'bad';
}
