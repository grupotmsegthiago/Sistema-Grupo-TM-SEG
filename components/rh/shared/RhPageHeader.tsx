import React from 'react';
import { ArrowLeft, LucideIcon } from 'lucide-react';

interface RhPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  onBack?: () => void;
  actions?: React.ReactNode;
}

const RhPageHeader: React.FC<RhPageHeaderProps> = ({ title, subtitle, icon: Icon, onBack, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <div className="flex items-center gap-3">
      {onBack && (
        <button type="button" onClick={onBack} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft size={18} />
        </button>
      )}
      {Icon && (
        <div className="p-3 rounded-2xl bg-red-50 text-red-600">
          <Icon size={22} />
        </div>
      )}
      <div>
        <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export default RhPageHeader;
