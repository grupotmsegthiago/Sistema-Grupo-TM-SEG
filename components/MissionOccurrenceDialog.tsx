import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ImagePlus, Loader2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateBR, formatTimeBR } from '../lib/dateUtils';
import { normalizeOccurrenceText, occurrenceTextError } from '../lib/missionOccurrence';

type OccurrenceRow = {
  id: string;
  description: string;
  evidence_url?: string | null;
  created_by?: string | null;
  created_at: string;
};

export type OccurrenceContext = {
  os?: string;
  cliente?: string;
  rota?: string;
  motorista?: string;
  origem?: string;
  destino?: string;
  fornecedor?: string;
  equipe?: string;
  viatura?: string;
};

type Props = {
  missionId: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: (count: number) => void;
  context?: OccurrenceContext;
};

function readUserName(): string {
  try {
    const raw = JSON.parse(localStorage.getItem('userData') || '{}');
    return String(raw?.name || 'Operador');
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
      const maxWidth = 1400;
      if (w > maxWidth) {
        h = (maxWidth / w) * h;
        w = maxWidth;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível preparar a imagem.'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível preparar a imagem.'))), 'image/jpeg', 0.72);
    };
    img.onerror = () => reject(new Error('Imagem inválida.'));
    img.src = URL.createObjectURL(file);
  });
}

const MissionOccurrenceDialog: React.FC<Props> = ({ missionId, canWrite, onClose, onSaved, context }) => {
  const facts = [
    ['Cliente', context?.cliente],
    ['Rota', context?.rota],
    ['Motorista', context?.motorista],
    ['Origem', context?.origem],
    ['Destino', context?.destino],
    ['Fornecedor', context?.fornecedor],
    ['Equipe', context?.equipe],
    ['Viatura', context?.viatura],
  ].filter((item) => String(item[1] || '').trim());
  const [rows, setRows] = useState<OccurrenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('mission_occurrences')
      .select('id, description, evidence_url, created_by, created_at')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: false });
    if (queryError) setError(queryError.message);
    else setRows((data || []) as OccurrenceRow[]);
    setLoading(false);
  }, [missionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pickFile = (next: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : '');
  };

  const pastePrint = (event: React.ClipboardEvent) => {
    const item = Array.from(event.clipboardData?.items || []).find((it) => it.type.startsWith('image/'));
    const pasted = item?.getAsFile();
    if (!pasted) return;
    event.preventDefault();
    pickFile(pasted);
    setError('');
  };

  const save = async () => {
    const message = occurrenceTextError(text);
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const author = readUserName();
      const description = normalizeOccurrenceText(text);
      let evidenceUrl: string | null = null;
      if (file) {
        const blob = await compressImage(file);
        const path = `ocorrencias/${missionId}/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage.from('mission-evidence').upload(path, blob, {
          upsert: false,
          contentType: 'image/jpeg',
        });
        if (upErr) throw upErr;
        evidenceUrl = supabase.storage.from('mission-evidence').getPublicUrl(path).data.publicUrl;
      }
      const { error: insertError } = await supabase.from('mission_occurrences').insert([{
        mission_id: missionId,
        description,
        evidence_url: evidenceUrl,
        created_by: author,
      }]);
      if (insertError) throw insertError;

      const { count, error: countError } = await supabase
        .from('mission_occurrences')
        .select('id', { count: 'exact', head: true })
        .eq('mission_id', missionId);
      if (countError) throw countError;
      const total = count || rows.length + 1;
      const { error: missionError } = await supabase
        .from('missions')
        .update({ occurrence_count: total })
        .eq('id', missionId);
      if (missionError) throw missionError;

      const { error: logError } = await supabase.from('system_logs').insert([{
        user_name: author,
        action_type: 'OTHER',
        entity: 'MissionOccurrence',
        entity_id: missionId,
        details: JSON.stringify({
          texto: description,
          evidencia: evidenceUrl,
          aviso: 'Essa OS possui ocorrências, verificar..',
        }),
      }]);
      if (logError) {
        setError('A ocorrência ficou salva na OS. O histórico da auditoria não registrou desta vez.');
      }

      setText('');
      pickFile(null);
      onSaved(total);
      window.dispatchEvent(new CustomEvent('refreshMissions'));
      await load();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar a ocorrência.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] bg-black/60 flex items-center justify-center p-4" data-testid="mission-occurrence-dialog" onPaste={pastePrint}>
      <div className="bg-white w-full max-w-2xl rounded-[28px] shadow-2xl border border-orange-200 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-orange-600 text-white px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-black uppercase">Ocorrência da OS {context?.os || missionId}</p>
            <p className="text-[11px] font-semibold text-orange-50">Histórico com data, hora, evidência, quem gravou e o motivo.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-orange-500" aria-label="Fechar" data-testid="button-occurrence-close">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          {facts.length > 0 && (
            <div className="grid grid-cols-2 gap-2" data-testid="occurrence-context">
              {facts.map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-zinc-50 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{label}</p>
                  <p className="text-sm font-semibold text-zinc-900">{value}</p>
                </div>
              ))}
            </div>
          )}
          {canWrite && (
            <>
              <label className="block text-[10px] font-black uppercase text-gray-500">
                O que aconteceu
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  placeholder="Descreva o problema desta OS"
                  className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-medium normal-case"
                  data-testid="input-occurrence-text"
                />
              </label>
              <div
                tabIndex={0}
                onPaste={pastePrint}
                className="flex min-h-[120px] cursor-text flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/70 p-3 text-center outline-none focus:border-orange-500"
                data-testid="dropzone-occurrence-print"
              >
                {preview ? (
                  <img src={preview} alt="Print da ocorrência" className="max-h-40 rounded-lg border border-orange-200" data-testid="img-occurrence-print" />
                ) : (
                  <>
                    <ImagePlus size={22} className="text-orange-700" />
                    <p className="text-[11px] font-black uppercase text-orange-900">Cole o print aqui</p>
                    <p className="text-[10px] font-semibold text-orange-800/80">Clique nesta área e tecle Ctrl+V</p>
                  </>
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase text-orange-800">
                  <ImagePlus size={14} /> Ou anexar arquivo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    data-testid="input-occurrence-evidence"
                    onChange={(e) => {
                      pickFile(e.target.files?.[0] || null);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
              {error && <p className="text-xs font-bold text-red-600">{error}</p>}
              <button
                type="button"
                onClick={() => { void save(); }}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-orange-600 text-white text-xs font-black uppercase disabled:opacity-60"
                data-testid="button-occurrence-save"
              >
                {saving ? <Loader2 size={14} className="inline animate-spin" /> : null} Salvar ocorrência
              </button>
            </>
          )}
          {!canWrite && error && <p className="text-xs font-bold text-red-600">{error}</p>}
          <div>
            <p className="text-[10px] font-black uppercase text-gray-500 mb-2">Histórico</p>
            {loading && <p className="text-xs text-gray-500">Carregando...</p>}
            {!loading && rows.length === 0 && <p className="text-xs text-gray-500">Nenhuma ocorrência nesta OS.</p>}
            <div className="space-y-2">
              {rows.map((row) => (
                <article key={row.id} className="rounded-2xl border border-orange-100 bg-orange-50/60 px-3 py-3" data-testid={`occurrence-row-${row.id}`}>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <p data-testid={`occurrence-date-${row.id}`}><span className="font-black uppercase text-zinc-400">Data </span><span className="font-semibold text-zinc-800">{formatDateBR(row.created_at)}</span></p>
                    <p data-testid={`occurrence-time-${row.id}`}><span className="font-black uppercase text-zinc-400">Hora </span><span className="font-semibold text-zinc-800">{formatTimeBR(row.created_at)}</span></p>
                    <p data-testid={`occurrence-author-${row.id}`}><span className="font-black uppercase text-zinc-400">Quem gravou </span><span className="font-semibold text-zinc-800">{row.created_by || 'Operador'}</span></p>
                    <p>
                      <span className="font-black uppercase text-zinc-400">Evidência </span>
                      {row.evidence_url ? (
                        <a href={row.evidence_url} target="_blank" rel="noreferrer" className="font-black text-orange-700 underline" data-testid={`occurrence-evidence-${row.id}`}>Abrir</a>
                      ) : (
                        <span className="font-semibold text-zinc-500">Sem evidência</span>
                      )}
                    </p>
                  </div>
                  <p className="mt-2 text-[10px] font-black uppercase text-zinc-400">Motivo</p>
                  <p className="text-sm font-semibold text-gray-900" data-testid={`occurrence-reason-${row.id}`}>{row.description}</p>
                  {row.evidence_url && (
                    <img src={row.evidence_url} alt="Evidência da ocorrência" className="mt-2 max-h-36 rounded-xl border border-orange-200" />
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissionOccurrenceDialog;
