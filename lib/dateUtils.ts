const TZ = 'America/Sao_Paulo';

export const nowBR = (): Date => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
};

export const formatDateBR = (date: string | Date | null | undefined): string => {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString('pt-BR', { timeZone: TZ });
  } catch { return '—'; }
};

export const formatDateTimeBR = (date: string | Date | null | undefined): string => {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleString('pt-BR', { timeZone: TZ });
  } catch { return '—'; }
};

export const toISOBR = (): string => {
  return new Date().toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T');
};
