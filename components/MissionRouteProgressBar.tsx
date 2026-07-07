import React, { useEffect, useMemo, useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { fetchRouteProgress, formatRouteEta } from '../lib/routeProgress';
import RouteProgressCarTopIcon from './icons/RouteProgressCarTopIcon';

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
  const kmLabel = googleProgress
    ? `${googleProgress.totalKm.toFixed(1)}KM`
    : plannedKmLabel.replace(/\s*KM\s*/i, 'KM').replace(/\s+/g, '');
  const carHalfWidthPx = 22;
  const carLeft =
    pct <= 0 ? '0%' : pct >= 100 ? '100%' : `calc(${pct}% - ${carHalfWidthPx}px)`;

  return (
    <div className="mt-3 pt-2 border-t border-gray-100" data-testid={`route-progress-${missionId}`}>
      <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-black text-gray-500 uppercase tracking-wide shrink-0">
            Acompanhamento {kmLabel}
          </span>
          {loadingMaps && <Loader2 size={10} className="animate-spin text-blue-500 shrink-0" />}
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[11px] font-black uppercase tracking-wide text-gray-500">
          {!googleProgress && fallback.odometerAnomaly && (
            <span
              className="text-[9px] font-black text-amber-700 bg-amber-100 px-1 py-0.5 rounded border border-amber-300 normal-case"
              title="KM do hodômetro acima do previsto"
            >
              ⚠ Hodômetro
            </span>
          )}
          <span className="tabular-nums text-gray-600">
            {pct}% {display.sourceLabel}
          </span>
          {display.eta !== '—' && (
            <span className="text-[10px] font-bold text-indigo-700 normal-case" title="Previsão Google Maps">
              ETA {display.eta}
            </span>
          )}
        </div>
      </div>

      <div className="relative w-full pt-3 pb-1">
        <div
          className="relative w-full h-4 rounded-full shadow-inner overflow-visible"
          style={{
            background: 'linear-gradient(90deg, #ef4444 0%, #7f1d3f 42%, #312e81 72%, #1e3a8a 100%)',
          }}
        >
          <div
            className="absolute top-1/2 z-20 flex items-center justify-center transition-all duration-700 ease-out pointer-events-none"
            style={{
              left: carLeft,
              transform: pct >= 100 ? 'translate(-100%, calc(-50% - 6px))' : 'translateY(calc(-50% - 6px))',
            }}
          >
            {pct >= 100 ? (
              <Flag size={16} className="text-green-600 drop-shadow-md" strokeWidth={2.5} />
            ) : (
              <RouteProgressCarTopIcon className="h-8 w-[44px] shrink-0 drop-shadow-lg" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissionRouteProgressBar;
