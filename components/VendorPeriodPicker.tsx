import React, { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  VENDOR_MONTH_NAMES,
  defaultVendorFilterYear,
  describeVendorPeriod,
  parseVendorPeriod,
  resolveVendorPeriod,
  type VendorFortnight,
} from '../lib/vendorVerificationPeriod';

type Props = {
  dateFrom: string;
  dateTo: string;
  onApply: (dateFrom: string, dateTo: string) => void;
  onClear: () => void;
};

const VendorPeriodPicker: React.FC<Props> = ({ dateFrom, dateTo, onApply, onClear }) => {
  const parsed = parseVendorPeriod(dateFrom, dateTo);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => parsed?.year || defaultVendorFilterYear());
  const [monthIndex, setMonthIndex] = useState<number | null>(parsed?.monthIndex ?? null);

  const label = describeVendorPeriod(dateFrom, dateTo);
  const hasPeriod = Boolean(dateFrom || dateTo);

  const openPicker = () => {
    const current = parseVendorPeriod(dateFrom, dateTo);
    setYear(current?.year || defaultVendorFilterYear());
    setMonthIndex(current?.monthIndex ?? null);
    setOpen(true);
  };

  const apply = (m: number, fortnight: VendorFortnight) => {
    const range = resolveVendorPeriod(year, m, fortnight);
    onApply(range.dateFrom, range.dateTo);
    setOpen(false);
  };

  return (
    <div className="relative" data-testid="vendor-period-picker">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openPicker}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-black uppercase tracking-wide border transition-colors ${
            hasPeriod
              ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
              : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
          }`}
          data-testid="btn-open-period-picker"
        >
          <Calendar size={16} />
          {label || 'Selecionar mês'}
        </button>
        {hasPeriod && (
          <button
            type="button"
            onClick={onClear}
            className="py-2 px-4 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors flex items-center gap-2"
            data-testid="btn-clear-dates"
          >
            <X size={14} /> Limpar período
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)} data-testid="modal-period-picker">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-blue-700 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest">Filtrar por período</h3>
                <p className="text-[10px] font-bold text-blue-100 uppercase tracking-wider mt-0.5">Mês → Quinzena</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-2 hover:bg-white/10 rounded-xl" data-testid="btn-close-period-picker">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setYear(y => Math.max(2026, y - 1))}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  disabled={year <= 2026}
                  data-testid="btn-period-year-prev"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-lg font-black text-gray-900" data-testid="text-period-year">{year}</span>
                <button
                  type="button"
                  onClick={() => setYear(y => y + 1)}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                  data-testid="btn-period-year-next"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {VENDOR_MONTH_NAMES.map((name, idx) => {
                  const active = monthIndex === idx;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setMonthIndex(idx)}
                      className={`py-2.5 px-2 rounded-xl text-[11px] font-black uppercase tracking-wide border transition-colors ${
                        active
                          ? 'bg-blue-600 text-white border-blue-700'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-200'
                      }`}
                      data-testid={`btn-period-month-${idx}`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>

              {monthIndex !== null && (
                <div className="pt-2 border-t border-gray-100 space-y-2" data-testid="period-fortnight-step">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    {VENDOR_MONTH_NAMES[monthIndex]} {year} — escolha a quinzena
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => apply(monthIndex, 'month')}
                      className="py-2.5 rounded-xl text-[11px] font-black uppercase bg-gray-900 text-white hover:bg-black"
                      data-testid="btn-period-full-month"
                    >
                      Mês completo
                    </button>
                    <button
                      type="button"
                      onClick={() => apply(monthIndex, 1)}
                      className="py-2.5 rounded-xl text-[11px] font-black uppercase bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
                      data-testid="btn-period-q1"
                    >
                      1ª Quinzena
                    </button>
                    <button
                      type="button"
                      onClick={() => apply(monthIndex, 2)}
                      className="py-2.5 rounded-xl text-[11px] font-black uppercase bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
                      data-testid="btn-period-q2"
                    >
                      2ª Quinzena
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorPeriodPicker;
