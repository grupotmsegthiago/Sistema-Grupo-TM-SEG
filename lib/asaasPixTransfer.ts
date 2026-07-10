/** Reserva mínima que deve permanecer em cada conta Asaas. */
export const ASAAS_PIX_MIN_RESERVE_BRL = 100;

/** Destino fixo dos repasses via Pix. */
export const ASAAS_PIX_FINANCEIRO_EMAIL = 'financeiro@grupotmseg.com.br';

export const ASAAS_PIX_FINANCEIRO_KEY_TYPE = 'EMAIL' as const;

export function roundMoneyBrl(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Valor máximo transferível respeitando a reserva de R$ 100,00. */
export function calcMaxPixTransfer(balance: number, reserve = ASAAS_PIX_MIN_RESERVE_BRL): number {
  const max = roundMoneyBrl(balance - reserve);
  return max > 0 ? max : 0;
}

export function isValidPixTransferAmount(
  value: number,
  balance: number,
  reserve = ASAAS_PIX_MIN_RESERVE_BRL,
): { ok: true } | { ok: false; error: string } {
  const max = calcMaxPixTransfer(balance, reserve);
  const v = roundMoneyBrl(value);

  if (!Number.isFinite(v) || v <= 0) {
    return { ok: false, error: 'Informe um valor maior que zero.' };
  }
  if (max <= 0) {
    return {
      ok: false,
      error: `Saldo insuficiente. É necessário manter R$ ${reserve.toFixed(2).replace('.', ',')} na conta.`,
    };
  }
  if (v > max + 0.001) {
    return {
      ok: false,
      error: `Valor máximo disponível: R$ ${max.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (reserva de R$ ${reserve.toFixed(2).replace('.', ',')}).`,
    };
  }
  return { ok: true };
}
