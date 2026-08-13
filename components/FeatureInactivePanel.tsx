import React from 'react';
import { Bot, Info } from 'lucide-react';

type Props = {
  title: string;
  statusLabel?: string;
  reason: string;
  backlogRef?: string;
};

/** Painel read-only para rotas mantidas inativas de forma intencional (P2). */
const FeatureInactivePanel: React.FC<Props> = ({
  title,
  statusLabel = 'Desativado intencionalmente',
  reason,
  backlogRef,
}) => (
  <div className="max-w-2xl mx-auto mt-10 p-8 bg-white rounded-2xl border border-gray-200 shadow-sm">
    <div className="flex items-center gap-3 mb-4">
      <div className="p-3 rounded-xl bg-gray-100 text-gray-600">
        <Bot size={22} />
      </div>
      <div>
        <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">{title}</h2>
        <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">{statusLabel}</p>
      </div>
    </div>
    <p className="text-sm text-gray-700 leading-relaxed">{reason}</p>
    {backlogRef && (
      <p className="mt-3 text-[11px] text-gray-500 flex items-start gap-1.5">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>{backlogRef}</span>
      </p>
    )}
  </div>
);

export default FeatureInactivePanel;
