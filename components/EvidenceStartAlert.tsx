import React, { useCallback, useEffect, useState } from 'react';
import { Camera, ImagePlus, Loader2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatTimeBR, getBrazilDayBounds } from '../lib/dateUtils';
import {
  EVIDENCE_NAG_OPEN_STATUSES,
  EVIDENCE_NAG_STORAGE_KEY,
  evidenceNagIsDue,
  missionNeedsStartEvidence,
} from '../lib/evidenceStartAlert';

type PendingOs = {
  id: string;
  client?: string | null;
  origin?: string | null;
  destination?: string | null;
  start_time?: string | null;
  status?: string | null;
};

const POLL_MS = 60_000;

function readName(): string {
  try {
    return String(JSON.parse(localStorage.getItem('userData') || '{}')?.name || 'Operador');
  } catch {
    return 'Operador';
  }
}

function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > 1400) {
        h = (1400 / w) * h;
        w = 1400;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível preparar o print.'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível preparar o print.'))), 'image/jpeg', 0.72);
    };
    img.onerror = () => reject(new Error('Print inválido.'));
    img.src = URL.createObjectURL(file);
  });
}

const EvidenceStartAlert: React.FC = () => {
  const [rows, setRows] = useState<PendingOs[]>([]);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const now = new Date();
    const today = getBrazilDayBounds();
    const todayStart = new Date(today.start).getTime();
    const [openRes, doneRes] = await Promise.all([
      supabase
        .from('missions')
        .select('id, client, origin, destination, start_time, status')
        .in('status', [...EVIDENCE_NAG_OPEN_STATUSES])
        .lte('start_time', now.toISOString())
        .order('start_time', { ascending: true })
        .limit(100),
      supabase
        .from('missions')
        .select('id, client, origin, destination, start_time, status')
        .eq('status', 'Concluída')
        .gte('start_time', today.start)
        .lte('start_time', now.toISOString())
        .order('start_time', { ascending: true })
        .limit(100),
    ]);
    if (openRes.error || doneRes.error) return;
    const data = [...(openRes.data || []), ...(doneRes.data || [])];
    const candidates = (data as PendingOs[]).filter((row) => missionNeedsStartEvidence({
      status: row.status,
      startTime: row.start_time,
      hasEvidence: false,
      nowMs: now.getTime(),
      todayStartMs: todayStart,
    }));
    if (candidates.length === 0) {
      setRows([]);
      setOpen(false);
      return;
    }
    const ids = candidates.map((row) => row.id);
    const evidenced = new Set<string>();
    for (let i = 0; i < ids.length; i += 80) {
      const batch = ids.slice(i, i + 80);
      const { data: logs } = await supabase
        .from('system_logs')
        .select('entity_id')
        .eq('entity', 'MissionEvidence')
        .in('entity_id', batch);
      for (const log of logs || []) evidenced.add(String(log.entity_id || ''));
    }
    const pending = candidates.filter((row) => !evidenced.has(row.id));
    setRows(pending);
    if (pending.length === 0) {
      setOpen(false);
      return;
    }
    const stored = localStorage.getItem(EVIDENCE_NAG_STORAGE_KEY);
    if (evidenceNagIsDue(stored, Date.now())) setOpen(true);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, POLL_MS);
    window.addEventListener('refreshMissions', load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('refreshMissions', load);
    };
  }, [load]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const active = rows.find((row) => row.id === activeId) || rows[0] || null;

  const closeForAnHour = () => {
    localStorage.setItem(EVIDENCE_NAG_STORAGE_KEY, String(Date.now()));
    setOpen(false);
  };

  const pickFile = (next: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : '');
    setError('');
  };

  const save = async () => {
    if (!active || !file || saving) {
      if (!file) setError('Cole ou anexe o print do início da missão.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const blob = await compressImage(file);
      const path = `${active.id}/${Date.now()}_0.jpg`;
      const { error: uploadError } = await supabase.storage.from('mission-evidence').upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const publicUrl = supabase.storage.from('mission-evidence').getPublicUrl(path).data.publicUrl;
      const { error: logError } = await supabase.from('system_logs').insert({
        entity: 'MissionEvidence',
        entity_id: active.id,
        action_type: 'evidence_upload',
        user_name: readName(),
        details: JSON.stringify({
          publicUrl,
          uploadedBy: readName(),
          uploadedAt: new Date().toISOString(),
          fileName: file.name || 'print-inicio.jpg',
          source: 'evidence_start_alert',
        }),
        created_at: new Date().toISOString(),
      });
      if (logError) throw logError;
      pickFile(null);
      window.dispatchEvent(new CustomEvent('refreshMissions'));
      await load();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o print.');
    } finally {
      setSaving(false);
    }
  };

  if (rows.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[225] bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg font-black text-xs uppercase flex items-center gap-2"
        data-testid="evidence-start-pill"
      >
        <Camera size={16} /> {rows.length} OS sem print de início
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[225] bg-black/70 flex items-center justify-center p-4" data-testid="evidence-start-alert">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border-2 border-red-600 overflow-hidden">
        <div className="bg-red-600 text-white px-4 py-3 flex items-start gap-2">
          <Camera size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-black uppercase">Falta o print do início</p>
            <p className="text-[11px] font-semibold">Cole a evidência desta OS. O aviso volta em uma hora enquanto o print não for salvo.</p>
          </div>
          <button type="button" onClick={closeForAnHour} className="rounded-lg p-1 hover:bg-red-500" aria-label="Fechar por uma hora" data-testid="button-evidence-nag-close">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => { setActiveId(row.id); pickFile(null); }}
                className={`px-2 py-1 rounded text-[10px] font-black uppercase ${row.id === active?.id ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {row.id}
              </button>
            ))}
          </div>
          {active && (
            <>
              <p className="text-sm font-black text-gray-900">{active.id} · {active.client || 'Cliente'}</p>
              <p className="text-xs text-gray-600">{active.origin} → {active.destination} · início {active.start_time ? formatTimeBR(active.start_time) : '—'}</p>
              <label
                tabIndex={0}
                className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-red-300 bg-red-50 p-3 text-center outline-none focus:border-red-500"
                onPaste={(e) => {
                  const item = Array.from(e.clipboardData?.items || []).find((it) => it.type.startsWith('image/'));
                  const pasted = item?.getAsFile();
                  if (pasted) {
                    e.preventDefault();
                    pickFile(pasted);
                  }
                }}
              >
                {preview ? (
                  <img src={preview} alt="Print do início" className="max-h-40 rounded-lg" />
                ) : (
                  <>
                    <ImagePlus size={22} className="text-red-600" />
                    <span className="text-[11px] font-black uppercase text-red-800">Anexar print do início</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="input-evidence-start-print"
                  onChange={(e) => {
                    pickFile(e.target.files?.[0] || null);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </>
          )}
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          <button type="button" onClick={() => { void save(); }} disabled={saving} className="w-full py-3 rounded-xl bg-red-600 text-white text-xs font-black uppercase disabled:opacity-60" data-testid="button-evidence-start-save">
            {saving ? <Loader2 size={14} className="inline animate-spin" /> : null} Salvar print de início
          </button>
          <button type="button" onClick={closeForAnHour} className="w-full py-2 rounded-xl border border-red-200 text-red-700 text-xs font-black uppercase">
            Fechar e lembrar em 1 hora
          </button>
        </div>
      </div>
    </div>
  );
};

export default EvidenceStartAlert;
