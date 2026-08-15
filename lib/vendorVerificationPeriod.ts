/**
 * Período da tela Controle de OS Fornecedor: Mês → Quinzena.
 * Datas em calendário civil (YYYY-MM-DD), sem deslocar fuso via toISOString.
 */

export const VENDOR_MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

export const VENDOR_DATA_FLOOR = '2026-01-01';
export const VENDOR_FILTER_STORAGE_KEY = 'tmseg_vendor_verification_filters';

export type VendorFortnight = 'month' | 1 | 2;

export type VendorPeriodRange = {
  dateFrom: string;
  dateTo: string;
};

export type VendorSavedFilters = {
  searchTerm: string;
  selectedProvider: string;
  filterStatus: 'ALL' | 'PENDING' | 'VERIFIED';
  dateFrom: string;
  dateTo: string;
  columnFilters: Record<string, string[]>;
  currentPage: number;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

export function toCivilDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function resolveVendorPeriod(year: number, monthIndex: number, fortnight: VendorFortnight): VendorPeriodRange {
  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error('Mês inválido');
  }
  const last = lastDayOfMonth(year, monthIndex);
  if (fortnight === 1) {
    return { dateFrom: toCivilDate(year, monthIndex, 1), dateTo: toCivilDate(year, monthIndex, 15) };
  }
  if (fortnight === 2) {
    return { dateFrom: toCivilDate(year, monthIndex, 16), dateTo: toCivilDate(year, monthIndex, last) };
  }
  return { dateFrom: toCivilDate(year, monthIndex, 1), dateTo: toCivilDate(year, monthIndex, last) };
}

export function describeVendorPeriod(dateFrom: string, dateTo: string): string {
  if (!dateFrom && !dateTo) return '';
  const parsed = parseVendorPeriod(dateFrom, dateTo);
  if (parsed) {
    const monthLabel = VENDOR_MONTH_NAMES[parsed.monthIndex];
    if (parsed.fortnight === 1) return `${monthLabel} ${parsed.year} · 1ª Quinzena`;
    if (parsed.fortnight === 2) return `${monthLabel} ${parsed.year} · 2ª Quinzena`;
    return `${monthLabel} ${parsed.year}`;
  }
  if (dateFrom && dateTo) {
    const [yf, mf, df] = dateFrom.split('-');
    const [yt, mt, dt] = dateTo.split('-');
    return `${df}/${mf}/${yf} a ${dt}/${mt}/${yt}`;
  }
  return dateFrom || dateTo;
}

export function parseVendorPeriod(dateFrom: string, dateTo: string): { year: number; monthIndex: number; fortnight: VendorFortnight } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) return null;
  const [y, m] = dateFrom.split('-').map(Number);
  const monthIndex = m - 1;
  const expectedMonth = resolveVendorPeriod(y, monthIndex, 'month');
  const expectedQ1 = resolveVendorPeriod(y, monthIndex, 1);
  const expectedQ2 = resolveVendorPeriod(y, monthIndex, 2);
  if (dateFrom === expectedQ1.dateFrom && dateTo === expectedQ1.dateTo) {
    return { year: y, monthIndex, fortnight: 1 };
  }
  if (dateFrom === expectedQ2.dateFrom && dateTo === expectedQ2.dateTo) {
    return { year: y, monthIndex, fortnight: 2 };
  }
  if (dateFrom === expectedMonth.dateFrom && dateTo === expectedMonth.dateTo) {
    return { year: y, monthIndex, fortnight: 'month' };
  }
  return null;
}

export function defaultVendorFilterYear(now = new Date()): number {
  return Math.max(now.getFullYear(), 2026);
}

const EMPTY_FILTERS: VendorSavedFilters = {
  searchTerm: '',
  selectedProvider: 'ALL',
  filterStatus: 'ALL',
  dateFrom: '',
  dateTo: '',
  columnFilters: {},
  currentPage: 1,
};

export function emptyVendorFilters(): VendorSavedFilters {
  return { ...EMPTY_FILTERS, columnFilters: {} };
}

export function serializeVendorFilters(filters: VendorSavedFilters): string {
  return JSON.stringify({
    searchTerm: filters.searchTerm || '',
    selectedProvider: filters.selectedProvider || 'ALL',
    filterStatus: filters.filterStatus || 'ALL',
    dateFrom: filters.dateFrom || '',
    dateTo: filters.dateTo || '',
    columnFilters: filters.columnFilters || {},
    currentPage: Number(filters.currentPage) > 0 ? Number(filters.currentPage) : 1,
  });
}

export function parseVendorFilters(raw: string | null | undefined): VendorSavedFilters {
  if (!raw) return emptyVendorFilters();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyVendorFilters();
    const status = parsed.filterStatus;
    return {
      searchTerm: typeof parsed.searchTerm === 'string' ? parsed.searchTerm : '',
      selectedProvider: typeof parsed.selectedProvider === 'string' ? parsed.selectedProvider : 'ALL',
      filterStatus: status === 'PENDING' || status === 'VERIFIED' ? status : 'ALL',
      dateFrom: typeof parsed.dateFrom === 'string' ? parsed.dateFrom : '',
      dateTo: typeof parsed.dateTo === 'string' ? parsed.dateTo : '',
      columnFilters: parsed.columnFilters && typeof parsed.columnFilters === 'object' ? parsed.columnFilters : {},
      currentPage: Number(parsed.currentPage) > 0 ? Number(parsed.currentPage) : 1,
    };
  } catch {
    return emptyVendorFilters();
  }
}

export function loadVendorFilters(storage?: Pick<Storage, 'getItem'>): VendorSavedFilters {
  try {
    const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : undefined);
    return parseVendorFilters(store?.getItem(VENDOR_FILTER_STORAGE_KEY));
  } catch {
    return emptyVendorFilters();
  }
}

export function saveVendorFilters(filters: VendorSavedFilters, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : undefined);
    store?.setItem(VENDOR_FILTER_STORAGE_KEY, serializeVendorFilters(filters));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Só dispara carga da grade quando há data — busca textual continua independente. */
export function shouldLoadVendorGrid(dateFrom: string, dateTo: string): boolean {
  return Boolean(dateFrom || dateTo);
}
