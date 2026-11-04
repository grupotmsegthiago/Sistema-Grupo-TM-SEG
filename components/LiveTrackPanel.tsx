import React, { useState } from 'react';
import { Check, Copy, Loader2, Radio, Share2, Square, Users } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { parseJsonResponse } from '../lib/parseJsonResponse';
import { isVeladaMission, rastreioOsAberta } from '../lib/liveTrack/isVeladaMission';
import { liveTrackOperatorLabel, useLiveTrackWatch } from '../lib/liveTrack/useLiveTrackWatch';
import type { Mission } from '../types';

type Props = {
  mission: Pick<Mission, 'id' | 'mission_type' | 'status' | 'vehicleType' | 'vehicleData'>;
  compact?: boolean;
};

export default function LiveTrackPanel({ mission, compact }: Props) {
  const enabled = isVeladaMission(mission) && rastreioOsAberta(mission.status);
  const { data, error, reload } = useLiveTrackWatch(enabled ? mission.id : null, enabled && !compact, !compact);
  const [busy, setBusy] = useState<'gen' | 'end' | 'liberar' | null>(null);
  const [copied, setCopied] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const label = liveTrackOperatorLabel(data);
  const url = data?.url || '';
  const clientUrl = data?.clientUrl || '';

  if (!enabled) return null;

  const generate = async (qual: 'agente' | 'cliente') => {
    setBusy('gen');
    setLocalErr(null);
    try {
      const r = await authFetch('/api/live-track?op=generate', {
        method: 'POST',
        body: JSON.stringify({ missionId: mission.id }),
      });
      const j = await parseJsonResponse(r);
      const link = qual === 'cliente' ? j?.clientUrl : j?.url;
      if (!r.ok || !link) {
        setLocalErr(j?.error || 'Falha ao gerar o link');
        if (compact) alert(j?.error || 'Falha ao gerar o link de localização ao vivo.');
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
      if (compact) {
        const titulo = qual === 'cliente' ? 'Link do cliente copiado' : 'Link do agente copiado';
        alert(`${titulo}. Envie a quem for acompanhar:\n\n${link}`);
      }
      await reload();
      return link as string;
    } catch (e: any) {
      setLocalErr(e?.message || 'Falha de rede');
      return '';
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!url) {
      await generate('agente');
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
      await generate('agente');
      return;
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, '_blank');
  };

  const liberar = async () => {
    setBusy('liberar');
    setLocalErr(null);
    try {
      const r = await authFetch('/api/live-track?op=liberar-reentrada', {
        method: 'POST',
        body: JSON.stringify({ missionId: mission.id }),
      });
      const j = await parseJsonResponse(r);
      if (!r.ok) {
        setLocalErr(j?.error || 'Falha ao liberar o agente');
        return;
      }
      await reload();
    } catch (e: any) {
      setLocalErr(e?.message || 'Falha de rede');
    } finally {
      setBusy(null);
    }
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
      <div className="col-span-3 flex flex-col gap-1 w-full" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => { void generate('agente'); }}
          disabled={busy === 'gen'}
          title="Gerar Link do agente — mapa e transmissão ao vivo"
          data-testid={`btn-live-track-agent-${mission.id}`}
          className="h-8 px-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-[8px] font-black uppercase leading-tight"
        >
          {busy === 'gen' ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Gerar Link do agente'}
        </button>
        <button
          type="button"
          onClick={() => { void generate('cliente'); }}
          disabled={busy === 'gen'}
          title="Gerar Link do cliente — ficha, viatura e histórico"
          data-testid={`btn-live-track-client-${mission.id}`}
          className="h-8 px-1.5 rounded-xl border border-indigo-200 bg-white text-indigo-700 text-[8px] font-black uppercase leading-tight"
        >
          Gerar Link do cliente
        </button>
      </div>
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
          <Radio size={14} className="text-slate-400 shrink-0" />
          <input readOnly value={url} className="flex-1 bg-transparent text-[11px] font-mono text-slate-700 outline-none" data-testid="live-track-url" />
        </div>
      )}
      {clientUrl && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <Users size={14} className="text-slate-400 shrink-0" />
          <input readOnly value={clientUrl} className="flex-1 bg-transparent text-[11px] font-mono text-slate-700 outline-none" data-testid="live-track-client-url" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void generate('agente')}
          disabled={busy === 'gen'}
          data-testid="live-track-generate"
          className="h-10 px-4 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wide flex items-center gap-2 disabled:opacity-60"
        >
          {busy === 'gen' ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
          Gerar Link do agente
        </button>
        <button
          type="button"
          onClick={() => void generate('cliente')}
          disabled={busy === 'gen'}
          data-testid="live-track-client"
          className="h-10 px-4 rounded-xl border border-indigo-200 text-indigo-700 text-[11px] font-black uppercase tracking-wide flex items-center gap-2 disabled:opacity-60"
        >
          <Users size={14} /> Gerar Link do cliente
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
        {data?.chegadaEm && data.reentradaBloqueada && (
          <button
            type="button"
            onClick={() => void liberar()}
            disabled={busy === 'liberar'}
            data-testid="live-track-liberar-reentrada"
            className="h-10 px-3 rounded-xl bg-[#C50000] text-white text-[11px] font-black uppercase tracking-wide flex items-center gap-2 disabled:opacity-60"
          >
            {busy === 'liberar' ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
            Liberar entrada do agente
          </button>
        )}
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
