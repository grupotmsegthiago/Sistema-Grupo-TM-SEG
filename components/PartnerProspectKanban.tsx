import React, { useState } from 'react';
import { Bot, StickyNote } from 'lucide-react';
import { KANBAN_COLUMNS, type PartnerProspect, type PartnerProspectStatus } from '../lib/partnerProspects/types';
import { podeTransicionar } from '../lib/partnerProspects/status';
import { formatarCnpj } from '../lib/partnerProspects/cnpj';

interface Props {
  items: PartnerProspect[];
  onMove: (id: string, status: PartnerProspectStatus) => Promise<void>;
  onHomologar: (p: PartnerProspect) => void;
  onNotes: (p: PartnerProspect) => void;
}

const PartnerProspectKanban: React.FC<Props> = ({ items, onMove, onHomologar, onNotes }) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const onDropColumn = async (status: PartnerProspectStatus) => {
    if (!draggingId) return;
    const item = items.find((p) => p.id === draggingId);
    setDraggingId(null);
    if (!item || item.status === status) return;
    if (!podeTransicionar(item.status, status)) return;
    await onMove(item.id, status);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {KANBAN_COLUMNS.map((col) => {
        const cards = items.filter((p) => p.status === col.id);
        return (
          <div
            key={col.id}
            className="bg-gray-50 border border-gray-200 rounded-xl min-h-[280px] flex flex-col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => void onDropColumn(col.id)}
          >
            <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
              <h4 className="text-[11px] font-black uppercase tracking-wide text-gray-700">{col.label}</h4>
              <span className="text-[10px] font-bold text-gray-400">{cards.length}</span>
            </div>
            <div className="p-2 space-y-2 flex-1">
              {cards.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => setDraggingId(p.id)}
                  className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing"
                >
                  <p className="text-xs font-bold text-gray-800 leading-snug">{p.trade_name || p.company_name}</p>
                  {p.source === 'robo_24h' ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase text-indigo-700 bg-indigo-50 rounded px-1.5 py-0.5">
                      <Bot size={10} /> Robô IA 24h
                    </span>
                  ) : null}
                  <p className="text-[10px] text-gray-500 mt-1 font-mono">{formatarCnpj(p.cnpj)}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {[p.city, p.state_uf].filter(Boolean).join(' / ') || '—'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => onNotes(p)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      <StickyNote size={12} /> Notas
                    </button>
                    {col.id === 'homologacao' ? (
                      <button
                        type="button"
                        onClick={() => onHomologar(p)}
                        className="px-2 py-1 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      >
                        Homologar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PartnerProspectKanban;
