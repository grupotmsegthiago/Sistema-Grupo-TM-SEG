import React, { useState } from 'react';
import { Check, Copy, Link2, Loader2, Radio, Share2, Square } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { parseJsonResponse } from '../lib/parseJsonResponse';
import { isVeladaMission } from '../lib/liveTrack/isVeladaMission';
import { liveTrackOperatorLabel, useLiveTrackWatch } from '../lib/liveTrack/useLiveTrackWatch';
import type { Mission } from '../types';

type Props = {
  mission: Pick<Mission, 'id' | 'mission_type' | 'status' | 'vehicleType' | 'vehicleData'>;
  compact?: boolean;
};

export default function LiveTrackPanel({ mission, compact }: Props) {
  const enabled = isVeladaMission(mission);
  const { data, error, reload } = useLiveTrackWatch(enabled ? mission.id : null, enabled && !compact, !compact);
  const [busy, setBusy] = useState<'gen' | 'end' | null>(null);
  const [copied, setCopied] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const label = liveTrackOperatorLabel(data);
  const url = data?.url || '';

  if (!enabled) return null;

  const generate = async () => {
    setBusy('gen');
    setLocalErr(null);
    try {
      const r = await authFetch('/api/live-track?op=generate', {
        method: 'POST',
        body: JSON.stringify({ missionId: mission.id }),
      });
      const j = await parseJsonResponse(r);
      if (!r.ok || !j?.url) {
        setLocalErr(j?.error || 'Falha ao gerar o link');
        if (compact) alert(j?.error || 'Falha ao gerar o link de localização ao vivo.');
        return;
      }
      try {
        await navigator.clipboard.writeText(j.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
      if (compact) {
        alert(`Link copiado. Envie ao agente:\n\n${j.url}`);
      }
      await reload();
    } catch (e: any) {
      setLocalErr(e?.message || 'Falha de rede');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!url) {
      await generate();
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const shareWa = async () => {
    let text = data?.whatsappText;
    if (!text) {
      await generate();
      return;
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, '_blank');
  };

  const end = async () => {
    if (!confirm('Encerrar o rastreio ao vivo desta OS? O agente deixará de transmitir.')) return;
    setBusy('end');
    try {
      await authFetch('/api/live-track?op=end', {
        method: 'POST',
        body: JSON.stringify({ missionId: mission.id, reason: 'operator_end' }),
      });
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const tone =
    label.tone === 'live' ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
      : label.tone === 'stale' ? 'border-amber-300 bg-amber-50 text-amber-800'
        : label.tone === 'ended' ? 'border-gray-200 bg-gray-50 text-gray-600'
          : 'border-indigo-200 bg-indigo-50 text-indigo-800';

  if (compact) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); void generate(); }}
        disabled={busy === 'gen'}
        title="Gerar link de localização ao vivo (velada)"
        data-testid={`btn-live-track-${mission.id}`}
        className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all duration-200 hover:shadow-sm active:scale-95 ${
          label.tone === 'live'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-600 hover:text-white animate-pulse'
            : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-600 hover:text-white'
        }`}
      >
        {busy === 'gen' ? <Loader2 size={14} className="animate-spin" /> : copied ? <Check size={14} /> : <Radio size={14} />}
      </button>
    );
  }

  return (
    <div className="p-6 bg-white border border-indigo-100 rounded-[2.5rem] shadow-sm space-y-4" data-testid="live-track-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <Radio size={14} /> Localização ao vivo — velada
          </h4>
          <p className="text-xs text-gray-500 mt-1">O agente só precisa abrir o link e tocar em compartilhar. A Central vê o GPS em tempo real até o fim da missão.</p>
        </div>
        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full border ${tone}`}>{label.text}</span>
      </div>

      {(error || localErr) && <p className="text-xs text-red-600 font-semibold">{localErr || error}</p>}

      {url && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <Link2 size={14} className="text-slate-400 shrink-0" />
          <input readOnly value={url} className="flex-1 bg-transparent text-[11px] font-mono text-slate-700 outline-none" data-testid="live-track-url" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy === 'gen'}
          data-testid="live-track-generate"
          className="h-10 px-4 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wide flex items-center gap-2 disabled:opacity-60"
        >
          {busy === 'gen' ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
          {url ? 'Copiar / reutilizar link' : 'Gerar link'}
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          className="h-10 px-3 rounded-xl border border-slate-200 text-[11px] font-black uppercase tracking-wide flex items-center gap-2"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} Copiar
        </button>
        <button
          type="button"
          onClick={() => void shareWa()}
          className="h-10 px-3 rounded-xl bg-[#25D366] text-white text-[11px] font-black uppercase tracking-wide flex items-center gap-2"
        >
          <Share2 size={14} /> WhatsApp
        </button>
        {data?.hasTrack && data.track?.status !== 'ended' && (
          <button
            type="button"
            onClick={() => void end()}
            disabled={busy === 'end'}
            className="h-10 px-3 rounded-xl border border-red-200 text-red-700 text-[11px] font-black uppercase tracking-wide flex items-center gap-2"
          >
            <Square size={14} /> Encerrar
          </button>
        )}
      </div>

      {data?.track?.last_lat != null && data?.track?.last_lng != null && (
        <p className="text-[11px] font-mono text-slate-500">
          {Number(data.track.last_lat).toFixed(5)}, {Number(data.track.last_lng).toFixed(5)}
          {data.track.last_accuracy != null ? ` · ±${Math.round(Number(data.track.last_accuracy))} m` : ''}
        </p>
      )}
    </div>
  );
}
