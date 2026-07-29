import React from 'react';
import { LucideIcon } from 'lucide-react';

interface GcStatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
  onClick?: () => void;
}

const TONES: Record<NonNullable<GcStatCardProps['tone']>, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  good: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-rose-50 text-rose-700',
  accent: 'bg-slate-900 text-amber-400',
};

const GcStatCard: React.FC<GcStatCardProps> = ({
  title,
  value,
  icon: Icon,
  subtitle,
  tone = 'neutral',
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-5 transition-all ${
      onClick ? 'hover:shadow-md hover:border-slate-300 cursor-pointer' : 'cursor-default'
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
        <p className="text-2xl font-black text-slate-900 mt-1 truncate">{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className={`p-3 rounded-xl shrink-0 ${TONES[tone]}`}>
        <Icon size={20} />
      </div>
    </div>
  </button>
);

export default GcStatCard;
