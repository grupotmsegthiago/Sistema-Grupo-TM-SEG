import React, { useEffect, useMemo, useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { fetchRouteProgress, formatRouteEta } from '../lib/routeProgress';
import EscoltaViaturaIcon from './icons/EscoltaViaturaIcon';

export interface FallbackProgress {
  progressVisual: number;
  progressReal: number;
  odometerAnomaly: boolean;
  traveledKm: number;
  plannedKm: number;
  source: 'odometer' | 'saved' | 'time' | 'destination' | 'terminal';
}

interface Props {
  missionId: string;
  origin?: string;
  destination?: string;
  currentCoords: { lat: number; lng: number } | null;
  isActive: boolean;
  fallback: FallbackProgress;
  plannedKmLabel: string;
}

const MissionRouteProgressBar: React.FC<Props> = ({
  missionId,
  origin,
  destination,
  currentCoords,
  isActive,
  fallback,
  plannedKmLabel,
}) => {
  const [googleProgress, setGoogleProgress] = useState<{
    progressPct: number;
    traveledKm: number;
    totalKm: number;
    remainingKm: number;
    etaMinutes: number | null;
  } | null>(null);
  const [loadingMaps, setLoadingMaps] = useState(false);

  useEffect(() => {
    if (!isActive || !origin || !destination || !currentCoords) {
      setGoogleProgress(null);
      return;
    }
    let cancelled = false;
    const current = `${currentCoords.lat},${currentCoords.lng}`;
    setLoadingMaps(true);
    fetchRouteProgress({ origin, destination, current })
      .then((data) => {
        if (cancelled || !data.success) return;
        setGoogleProgress({
          progressPct: data.progressPct,
          traveledKm: data.traveledKm,
          totalKm: data.totalKm,
          remainingKm: data.remainingKm,
          etaMinutes: data.etaMinutes,
        });
      })
      .catch(() => {
        if (!cancelled) setGoogleProgress(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingMaps(false);
      });
    return () => {
      cancelled = true;
    };
  }, [missionId, origin, destination, currentCoords?.lat, currentCoords?.lng, isActive]);

  const display = useMemo(() => {
    if (googleProgress) {
      return {
        pct: googleProgress.progressPct,
        traveledKm: googleProgress.traveledKm,
        totalKm: googleProgress.totalKm,
        remainingKm: googleProgress.remainingKm,
        eta: formatRouteEta(googleProgress.etaMinutes),
        sourceLabel: 'Google Maps',
        maps: true as const,
      };
    }
    return {
      pct: fallback.progressVisual,
      realPct: fallback.progressReal,
      traveledKm: fallback.traveledKm,
      totalKm: fallback.plannedKm,
      remainingKm: Math.max(0, Math.round((fallback.plannedKm - fallback.traveledKm) * 10) / 10),
      eta: '—' as const,
      sourceLabel:
        fallback.source === 'odometer'
          ? 'Hodômetro'
          : fallback.source === 'time'
            ? 'Estimativa'
            : 'Salvo',
      maps: false as const,
      anomaly: fallback.odometerAnomaly,
    };
  }, [googleProgress, fallback]);

  const pct = Math.min(100, Math.max(0, display.pct));
  const truckLeft = pct <= 0 ? '0%' : pct >= 100 ? '100%' : `calc(${pct}% - 8px)`;

  return (
    <div className="mt-3 pt-2 border-t border-gray-100" data-testid={`route-progress-${missionId}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1.5 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0">
            Acompanhamento
          </span>
          <span
            className="text-[10px] font-black text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 shrink-0"
            title="Distância total da rota"
          >
            {googleProgress ? `${googleProgress.totalKm.toFixed(1)} KM` : plannedKmLabel}
          </span>
          {loadingMaps && <Loader2 size={10} className="animate-spin text-blue-500 shrink-0" />}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[10px] font-bold tabular-nums">
          {!googleProgress && fallback.odometerAnomaly && (
            <span
              className="text-[9px] font-black text-amber-700 bg-amber-100 px-1 py-0.5 rounded border border-amber-300"
              title="KM do hodômetro acima do previsto"
            >
              ⚠ HODÔMETRO
            </span>
          )}
          <span className="font-black text-gray-900">{pct}%</span>
          {display.traveledKm > 0 && (
            <span className="text-red-600" title="Percorrido desde a origem">
              {display.traveledKm.toFixed(1)} km
            </span>
          )}
          {display.remainingKm > 0 && pct < 100 && (
            <span className="text-blue-600" title="Restante até o destino">
              falta {display.remainingKm.toFixed(1)} km
            </span>
          )}
          {display.eta !== '—' && (
            <span className="text-indigo-700 bg-indigo-50 px-1 rounded border border-indigo-100" title="Previsão Google Maps">
              ETA {display.eta}
            </span>
          )}
          <span className="text-[8px] text-gray-400 uppercase hidden sm:inline">{display.sourceLabel}</span>
        </div>
      </div>

      <div className="relative w-full h-3 rounded-full bg-blue-500 shadow-inner border border-blue-600/30 overflow-visible">
        <div
          className="absolute top-0 left-0 h-full bg-red-600 rounded-l-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 z-20 flex items-center justify-center transition-all duration-700 ease-out pointer-events-none"
          style={{
            left: truckLeft,
            transform: pct >= 100 ? 'translate(-100%, -50%)' : 'translateY(-50%)',
          }}
        >
          {pct >= 100 ? (
            <Flag size={14} className="text-green-700 drop-shadow" strokeWidth={2.5} />
          ) : (
            <EscoltaViaturaIcon className="h-[18px] w-[52px] shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
};

export default MissionRouteProgressBar;
