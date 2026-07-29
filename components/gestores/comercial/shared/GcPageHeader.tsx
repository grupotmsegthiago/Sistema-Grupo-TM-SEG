import React from 'react';
import { ArrowLeft, LucideIcon } from 'lucide-react';

interface GcPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  onBack?: () => void;
  actions?: React.ReactNode;
}

const GcPageHeader: React.FC<GcPageHeaderProps> = ({ title, subtitle, icon: Icon, onBack, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <div className="flex items-center gap-3">
      {onBack && (
        <button type="button" onClick={onBack} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
          <ArrowLeft size={18} />
        </button>
      )}
      {Icon && (
        <div className="p-3 rounded-2xl bg-slate-900 text-amber-400 shadow-sm">
          <Icon size={22} />
        </div>
      )}
      <div>
        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export default GcPageHeader;
