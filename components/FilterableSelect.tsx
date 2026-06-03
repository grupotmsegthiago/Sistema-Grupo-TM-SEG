import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

export type FilterableSelectOption = {
  value: string;
  label: string;
  title?: string;
  prefix?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: FilterableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  accentColor?: 'blue' | 'red';
  'data-testid'?: string;
};

export default function FilterableSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione…',
  disabled,
  className,
  buttonClassName,
  accentColor = 'blue',
  ...rest
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const current = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const tokens = q.split(/\s+/).filter(Boolean);
    return options.filter(o => {
      const hay = `${o.prefix || ''} ${o.label}`.toLowerCase();
      return tokens.every(t => hay.includes(t));
    });
  }, [query, options]);

  const displayLabel = current ? `${current.prefix || ''}${current.label}` : placeholder;
  const focusBorder = accentColor === 'red' ? 'focus:border-red-500' : 'focus:border-blue-500';
  const activeBg = accentColor === 'red' ? 'bg-red-50 text-red-900' : 'bg-blue-50 text-blue-900';
  const hoverBg = accentColor === 'red' ? 'hover:bg-red-50' : 'hover:bg-blue-50';
  const checkColor = accentColor === 'red' ? 'text-red-600' : 'text-blue-600';

  return (
    <div ref={ref} className={`relative w-full ${className || ''}`} data-testid={rest['data-testid']}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={
          buttonClassName ||
          `w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 uppercase outline-none ${focusBorder} flex items-center justify-between gap-2 ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-gray-300'}`
        }
      >
        <span className="truncate text-left flex-1">{displayLabel}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-white rounded-lg border border-gray-200 shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Search size={12} className="text-gray-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite para filtrar…"
              className={`w-full p-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded outline-none ${focusBorder} normal-case`}
              data-testid="input-filterable-select"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="p-3 text-[11px] text-gray-400 text-center font-medium">Nenhum resultado</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value || '__empty__'}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
                title={o.title}
                className={`w-full text-left px-3 py-2 text-xs font-bold uppercase flex items-start gap-2 ${hoverBg} ${o.value === value ? activeBg : 'text-gray-700'}`}
                data-testid={`option-filterable-${o.value || 'empty'}`}
              >
                {o.value === value
                  ? <Check size={12} className={`shrink-0 mt-0.5 ${checkColor}`} />
                  : <span className="w-3 shrink-0" />}
                <span className="flex-1 whitespace-normal break-words leading-snug">{o.prefix}{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
