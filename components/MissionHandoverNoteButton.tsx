import React, { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { publishMissionLive } from '../lib/missionLiveBroadcast';

export interface HandoverNote {
  mission_id: string;
  note: string;
  updated_by: string;
  updated_at: string;
}

interface MissionHandoverNoteButtonProps {
  missionId: string;
  note?: HandoverNote | null;
  onSaved: (note: HandoverNote) => void;
}

const MissionHandoverNoteButton: React.FC<MissionHandoverNoteButtonProps> = ({ missionId, note, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const hasNote = !!(note?.note && note.note.trim());

  const openModal = () => {
    setText(note?.note || '');
    setError('');
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await authFetch('/api/shift-handover-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_id: missionId, note: text.trim().slice(0, 2000) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Não foi possível salvar a observação.');
      onSaved(data as HandoverNote);
      void publishMissionLive('handover_note', data as Record<string, unknown>);
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar a observação.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all duration-200 hover:shadow-sm active:scale-95 ${hasNote ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-500 hover:text-white' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-500 hover:text-white'}`}
        title={hasNote ? 'Observação de passagem já registrada' : 'Observação para a passagem de plantão'}
        data-testid={`button-handover-note-${missionId}`}
      >
        <MessageSquare size={14} />
      </button>
      {open && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()} data-testid={`modal-handover-note-${missionId}`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-black text-slate-900">Observação de passagem · {missionId}</p>
                <p className="text-[11px] text-slate-500">O próximo turno vê este texto na Passagem de Plantão.</p>
              </div>
              <button type="button" onClick={() => !saving && setOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="O que o próximo operador precisa saber sobre esta OS..."
                className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-amber-400"
                data-testid={`input-handover-note-${missionId}`}
                autoFocus
              />
              {note?.updated_at && (
                <p className="text-[11px] text-slate-400">
                  Última gravação por {note.updated_by || 'operador'}
                </p>
              )}
              {error && <p className="text-xs font-bold text-red-700">{error}</p>}
              <button
                type="button"
                disabled={saving}
                onClick={() => { void save(); }}
                className="w-full rounded-full bg-red-700 py-2 text-sm font-black text-white disabled:opacity-50"
                data-testid={`button-save-handover-note-${missionId}`}
              >
                {saving ? 'Salvando…' : 'Salvar observação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MissionHandoverNoteButton;
