import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, EyeOff, Loader2, MapPin, Radio, ShieldCheck, Smartphone,
} from 'lucide-react';
import { GoogleMap, InfoWindow, Marker, Polyline, useLoadScript } from '@react-google-maps/api';
import tmsegLogo from '../attached_assets/tmseg_logo_transparent.png';
import ativaLogo from '../attached_assets/ativa-pronta-resposta.jpg';
import { parseJsonResponse } from '../lib/parseJsonResponse';
import { formatDateTimeBR, formatTimeBR } from '../lib/dateUtils';
import { googleMapsLoadConfig } from '../lib/maps';
import { haversineMeters } from '../lib/liveTrack/pure';
import { startLiveTrackKeepalive, type LiveTrackKeepalive } from '../lib/liveTrack/backgroundKeepalive';

type Phase = 'loading' | 'marca' | 'consent' | 'sharing' | 'ended' | 'error';
type Ponto = { lat: number; lng: number };
type PontoTrilha = Ponto & { at?: string };

const PING_VISIVEL_MS = 1800;
const PING_OCULTO_MS = 60000;
const GPS_VERDE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#16a34a" stroke="#ffffff" stroke-width="4"/><circle cx="32" cy="32" r="10" fill="#ffffff"/><path d="M32 6 v10 M32 48 v10 M6 32 h10 M48 32 h10" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/></svg>')}`;
const PIN_ORIGEM = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52"><path d="M20 0C9 0 2 8 2 18c0 12 18 34 18 34s18-22 18-34C38 8 31 0 20 0z" fill="#dc2626"/><circle cx="20" cy="18" r="6" fill="#fff"/></svg>')}`;
const BANDEIRA_DESTINO = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="48" viewBox="0 0 44 48"><rect x="4" y="2" width="3" height="44" fill="#111"/><rect x="8" y="4" width="8" height="8" fill="#111"/><rect x="16" y="4" width="8" height="8" fill="#fff"/><rect x="24" y="4" width="8" height="8" fill="#111"/><rect x="32" y="4" width="8" height="8" fill="#fff"/><rect x="8" y="12" width="8" height="8" fill="#fff"/><rect x="16" y="12" width="8" height="8" fill="#111"/><rect x="24" y="12" width="8" height="8" fill="#fff"/><rect x="32" y="12" width="8" height="8" fill="#111"/></svg>')}`;

function textoDistancia(metros: number): string {
  const total = Math.max(0, Math.round(metros));
  const km = Math.floor(total / 1000);
  const resto = total % 1000;
  if (km <= 0) return `${resto} m`;
  return `${km} km ${resto} m`;
}

function textoPrevisao(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

const ATIVA_LGPD_SUMMARY =
  'A ATIVA Pronta Resposta acompanha a sua missão. Ao compartilhar, você autoriza o tratamento da sua localização em tempo real até o encerramento da OS.';

const ATIVA_LGPD_FULL = [
  'Finalidade: segurança e acompanhamento operacional da missão vinculada a esta OS. A equipe precisa saber onde você está até o fim da missão.',
  'Base legal (LGPD): execução do contrato de prestação de serviço e legítimo interesse de proteção à vida, à carga e à operação (arts. 7º, V e IX, e 11 da Lei 13.709/2018).',
  'Dados tratados: coordenadas GPS, precisão, velocidade, rumo, horário e o registro do seu consentimento.',
  'Retenção: enquanto a missão estiver ativa e, após o encerramento, pelo prazo de auditoria operacional.',
  'Como funciona: o GPS continua em segundo plano enquanto esta página existir. Com a tela oculta, a posição é enviada de 1 em 1 minuto. O rastreio para se você fechar esta página ou se a OS for finalizada.',
].join('\n\n');

const GEO_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 10000,
};

function tokenFromUrl(): string {
  return new URLSearchParams(window.location.search).get('token') || '';
}

function vis(): 'visible' | 'hidden' {
  return document.visibilityState === 'visible' ? 'visible' : 'hidden';
}

function pontoValido(p: any): Ponto | null {
  const lat = Number(p?.lat);
  const lng = Number(p?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function enquadrarMapa(map: google.maps.Map, origem?: Ponto | null, destino?: Ponto | null, ponto?: Ponto | null, trilha: Ponto[] = []) {
  const pts = [origem, destino, ponto, ...trilha].filter((p): p is Ponto => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!pts.length) return;
  if (pts.length === 1) {
    map.setCenter(pts[0]);
    map.setZoom(15);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  pts.forEach((p) => bounds.extend(p));
  map.fitBounds(bounds, 48);
}

function LiveMapBox({
  ponto,
  trilha,
  origem,
  destino,
  marca,
  modoCliente,
  enderecoAtual,
  quando,
  alto,
}: {
  ponto: Ponto | null;
  trilha: PontoTrilha[];
  origem?: Ponto | null;
  destino?: Ponto | null;
  marca?: string;
  modoCliente?: boolean;
  enderecoAtual?: string;
  quando?: string | null;
  alto?: boolean;
}) {
  const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);
  const [mapa, setMapa] = useState<google.maps.Map | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const centroInicial = useRef<Ponto>({ lat: -15.78, lng: -47.93 });
  const cameraPronta = useRef(false);
  const icone = isLoaded && marca
    ? { url: marca, scaledSize: new google.maps.Size(32, 32), anchor: new google.maps.Point(16, 46) }
    : undefined;
  const iconeGps = isLoaded
    ? { url: GPS_VERDE, scaledSize: new google.maps.Size(42, 42), anchor: new google.maps.Point(21, 21) }
    : undefined;
  const iconeOrigem = isLoaded
    ? { url: PIN_ORIGEM, scaledSize: new google.maps.Size(32, 42), anchor: new google.maps.Point(16, 42) }
    : undefined;
  const iconeDestino = isLoaded
    ? { url: BANDEIRA_DESTINO, scaledSize: new google.maps.Size(36, 40), anchor: new google.maps.Point(6, 40) }
    : undefined;
  const escudo = isLoaded && marca
    ? { url: marca, scaledSize: new google.maps.Size(18, 18), anchor: new google.maps.Point(9, 9) }
    : undefined;

  useEffect(() => {
    if (!mapa || modoCliente) return;
    enquadrarMapa(mapa, origem, destino, ponto, trilha);
  }, [mapa, modoCliente, origem, destino, ponto, trilha]);

  useEffect(() => {
    if (!mapa || !modoCliente || cameraPronta.current) return;
    const temRota = [origem, destino, ponto].filter(Boolean).length >= 2;
    if (temRota) {
      enquadrarMapa(mapa, origem, destino, ponto, []);
      cameraPronta.current = true;
      return;
    }
    if (ponto) {
      mapa.setCenter(ponto);
      mapa.setZoom(14);
      cameraPronta.current = true;
    }
  }, [mapa, modoCliente, ponto, origem, destino]);

  if (loadError) return <p className="text-sm text-amber-200">Mapa indisponível neste navegador.</p>;
  if (!isLoaded) return <div className="h-72 rounded-2xl bg-white/5 animate-pulse" data-testid="live-track-map" />;
  return (
    <div data-testid="live-track-map">
      <GoogleMap
        mapContainerClassName={alto ? 'w-full h-[48vh] min-h-[280px] rounded-2xl' : 'w-full h-72 rounded-2xl'}
        center={centroInicial.current}
        zoom={4}
        onLoad={(map) => { setMapa(map); if (!modoCliente) enquadrarMapa(map, origem, destino, ponto, trilha); }}
        options={{ disableDefaultUI: true, zoomControl: true }}
      >
        {modoCliente && [origem, ponto, destino].filter(Boolean).length > 1 ? (
          <Polyline path={[origem, ponto, destino].filter((p): p is Ponto => !!p)} options={{ strokeColor: '#ef4444', strokeWeight: 4 }} />
        ) : null}
        {!modoCliente && trilha.length > 1 ? <Polyline path={trilha} options={{ strokeColor: '#ef4444', strokeWeight: 4 }} /> : null}
        {!modoCliente && trilha.map((p, i) => (
          <Marker key={`${p.at || i}-${p.lat}-${p.lng}`} position={p} icon={icone} title="Posição gravada" onClick={() => setAberto(i)}>
            {aberto === i ? (
              <InfoWindow onCloseClick={() => setAberto(null)}>
                <div style={{ color: '#0f172a', fontFamily: 'sans-serif', minWidth: 140 }}>
                  <p style={{ margin: 0, fontWeight: 800 }}>{p.at ? formatDateTimeBR(p.at) : 'Sem horário'}</p>
                  <p style={{ margin: '4px 0 0', fontFamily: 'monospace', fontSize: 12 }}>{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</p>
                </div>
              </InfoWindow>
            ) : null}
          </Marker>
        ))}
        {origem ? <Marker position={origem} label={modoCliente ? undefined : 'O'} icon={modoCliente ? iconeOrigem : undefined} title="Origem" /> : null}
        {destino ? <Marker position={destino} label={modoCliente ? undefined : 'D'} icon={modoCliente ? iconeDestino : undefined} title="Destino" /> : null}
        {modoCliente && ponto && escudo ? <Marker position={ponto} icon={escudo} zIndex={4} title="TM SEG" /> : null}
        {modoCliente && ponto ? (
          <Marker position={ponto} icon={iconeGps} zIndex={3} title="Última posição" onClick={() => setAberto(-1)}>
            {aberto === -1 ? (
              <InfoWindow onCloseClick={() => setAberto(null)}>
                <div style={{ color: '#0f172a', fontFamily: 'sans-serif', minWidth: 180 }}>
                  <p style={{ margin: 0, fontWeight: 800 }}>Última posição</p>
                  <p style={{ margin: '4px 0 0' }}>{enderecoAtual || `${ponto.lat.toFixed(5)}, ${ponto.lng.toFixed(5)}`}</p>
                  <p style={{ margin: '4px 0 0' }}>{quando ? formatDateTimeBR(quando) : 'Sem horário'}</p>
                </div>
              </InfoWindow>
            ) : null}
          </Marker>
        ) : null}
        {!modoCliente && ponto ? <Marker position={ponto} label="A" title="Agente" /> : null}
      </GoogleMap>
    </div>
  );
}

function AndamentoCliente({
  origem,
  destino,
  ponto,
  velocidade,
}: {
  origem: Ponto | null;
  destino: Ponto | null;
  ponto: Ponto | null;
  velocidade: number | null;
}) {
  const falta = origem && destino && ponto ? haversineMeters(ponto, destino) : null;
  const andou = origem && destino && ponto ? haversineMeters(origem, ponto) : null;
  const total = falta != null && andou != null ? falta + andou : 0;
  const pct = total > 0 && andou != null ? Math.max(0, Math.min(100, Math.round((andou / total) * 100))) : 0;
  const previsao = falta != null && velocidade && velocidade > 0.5 ? textoPrevisao(falta / velocidade) : null;
  return (
    <div className="pt-3 border-t border-white/10" data-testid="live-track-progresso">
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wide text-slate-300">
        <span>Andamento</span>
        <span>{origem && destino && ponto ? `${pct}% concluído` : '—'}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-200">
        {falta == null
          ? 'Aguardando origem, destino e a posição do agente.'
          : `Faltam ${textoDistancia(falta)} em linha reta. ${previsao ? `Previsão: ${previsao}` : 'Previsão aguardando a velocidade do GPS.'}`}
      </p>
    </div>
  );
}

type Etapa = { lat: number; lng: number; at: string; endereco?: string | null };

function textoMinutos(minutos: number): string {
  if (minutos < 1) return 'menos de 1 min';
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function TimelineCliente({
  origemTexto,
  destinoTexto,
  etapas,
  encerrada,
}: {
  origemTexto: string;
  destinoTexto: string;
  etapas: Etapa[];
  encerrada: boolean;
}) {
  const saida = etapas[0]?.at;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#111827] p-4" data-testid="live-track-timeline">
      <p className="text-sm font-black">Timeline da viagem</p>
      <ol className="mt-4 space-y-3">
        <li className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-600 text-[10px] font-black">A</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold">Origem</p>
              <p className="text-xs text-slate-400">{saida ? formatTimeBR(saida) : '—'}</p>
            </div>
            <p className="text-xs text-slate-300 leading-snug">{origemTexto || '—'}</p>
          </div>
        </li>
        {etapas.map((etapa, i) => {
          const anterior = etapas[i - 1];
          const minutos = anterior ? Math.round((new Date(etapa.at).getTime() - new Date(anterior.at).getTime()) / 60000) : null;
          const metros = anterior ? haversineMeters(anterior, etapa) : null;
          const local = etapa.endereco || `${etapa.lat.toFixed(5)}, ${etapa.lng.toFixed(5)}`;
          return (
            <li key={`${etapa.at}-${etapa.lat}`} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-black">{i + 1}</span>
              <div className="min-w-0 flex-1">
                {minutos != null && metros != null ? (
                  <p className="mb-1 text-[11px] font-semibold text-emerald-300">{textoMinutos(Math.max(0, minutos))} · {textoDistancia(metros)}</p>
                ) : null}
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-snug">{local}</p>
                  <p className="text-xs text-slate-400 shrink-0">{formatTimeBR(etapa.at)}</p>
                </div>
              </div>
            </li>
          );
        })}
        <li className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-black text-slate-950">C</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold">Destino</p>
              <p className="text-xs text-slate-400">{encerrada && etapas.length ? formatTimeBR(etapas[etapas.length - 1].at) : 'A caminho'}</p>
            </div>
            <p className="text-xs text-slate-300 leading-snug">{destinoTexto || '—'}</p>
          </div>
        </li>
      </ol>
    </div>
  );
}

function ClientLiveMap({ credential }: { credential: string }) {
  const [phase, setPhase] = useState<'loading' | 'watching' | 'ended' | 'error'>('loading');
  const [error, setError] = useState('');
  const [ficha, setFicha] = useState<any>(null);
  const [ponto, setPonto] = useState<{ lat: number; lng: number } | null>(null);
  const [origem, setOrigem] = useState<Ponto | null>(null);
  const [destino, setDestino] = useState<Ponto | null>(null);
  const [trilha, setTrilha] = useState<PontoTrilha[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [endereco, setEndereco] = useState('');
  const [quando, setQuando] = useState<string | null>(null);
  const [velocidade, setVelocidade] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/live-track?op=public-get&watch=1&c=${encodeURIComponent(credential)}`, { cache: 'no-store' });
      const j = await parseJsonResponse(r);
      if (!r.ok) {
        setError(j?.error || 'Link indisponível');
        setPhase('error');
        return;
      }
      setFicha(j.mission || null);
      setOrigem(pontoValido(j.mission?.originPoint));
      setDestino(pontoValido(j.mission?.destinationPoint));
      const pts = Array.isArray(j.trail)
        ? j.trail.map((p: any) => ({ lat: Number(p.lat), lng: Number(p.lng), at: p.recorded_at ? String(p.recorded_at) : undefined })).filter((p: PontoTrilha) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        : [];
      setTrilha(pts);
      const ultima = j.position?.lat != null && j.position?.lng != null
        ? { lat: Number(j.position.lat), lng: Number(j.position.lng) }
        : (pts.length ? pts[pts.length - 1] : null);
      setPonto(ultima);
      setEndereco(typeof j.position?.address === 'string' ? j.position.address : '');
      setQuando(j.position?.at ? String(j.position.at) : (pts.length ? pts[pts.length - 1].at || null : null));
      const vel = Number(j.position?.speed);
      setVelocidade(Number.isFinite(vel) && vel > 0 ? vel : null);
      setEtapas(Array.isArray(j.etapas)
        ? j.etapas.map((e: any) => ({ lat: Number(e.lat), lng: Number(e.lng), at: String(e.at || ''), endereco: e.endereco ? String(e.endereco) : null })).filter((e: Etapa) => Number.isFinite(e.lat) && Number.isFinite(e.lng) && e.at)
        : []);
      setPhase(j.ended ? 'ended' : 'watching');
    } catch {
      setError('Falha ao acompanhar. Verifique a internet.');
      setPhase('error');
    }
  }, [credential]);

  useEffect(() => {
    void carregar();
    const t = window.setInterval(() => { void carregar(); }, 3000);
    return () => window.clearInterval(t);
  }, [carregar]);

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white" data-testid="live-track-client-view">
      <header className="px-4 pt-5 pb-3 border-b border-white/10">
        <p className="text-lg font-black">Rastreamento</p>
      </header>
      <div className="mx-auto w-full max-w-5xl lg:grid lg:grid-cols-[minmax(0,32rem)_22rem] lg:items-start lg:gap-4 lg:px-4">
      <main className="px-3 py-3 max-w-lg mx-auto w-full space-y-3 lg:max-w-none lg:px-0">
        {phase === 'loading' && <p className="text-sm text-slate-300">Abrindo o mapa…</p>}
        {phase === 'error' && <p className="text-sm text-red-300">{error}</p>}
        {phase === 'ended' && <p className="text-sm text-emerald-200">A missão foi concluída. O rastreio encerrou.</p>}
        {ficha && (
          <div className="rounded-2xl border border-white/10 bg-[#111827] p-3.5 space-y-3 text-sm" data-testid="live-track-resumo">
            <div className="space-y-1">
              <p><span className="text-slate-400">Cliente: </span>{ficha.client || '—'}</p>
              <p><span className="text-slate-400">Agente: </span>{ficha.agent || '—'}</p>
              <p><span className="text-slate-400">Viatura: </span>{[ficha.plate, ficha.vehicleModel].filter(Boolean).join(' · ') || '—'}</p>
              <p className="flex items-center gap-2">
                <span className="text-slate-400">Escolta: </span>
                <img src={tmsegLogo} alt="TM SEG" className="h-5 w-auto" />
                <span>TM SEG</span>
              </p>
            </div>
            <div className="space-y-1 border-t border-white/10 pt-3">
              <p><span className="text-slate-400">Origem: </span>{ficha.origin || '—'}</p>
              <p><span className="text-slate-400">Destino: </span>{ficha.destination || '—'}</p>
            </div>
            {(phase === 'watching' || phase === 'ended') && (
              <div className="border-t border-white/10 pt-3" data-testid="live-track-ultima">
                <p><span className="text-slate-400">Última posição: </span>{endereco || (ponto ? `${ponto.lat.toFixed(5)}, ${ponto.lng.toFixed(5)}` : 'Aguardando o agente.')}</p>
                <p className="mt-1"><span className="text-slate-400">Data/Hora: </span>{quando ? formatDateTimeBR(quando) : 'Sem horário gravado'}</p>
                <AndamentoCliente origem={origem} destino={destino} ponto={ponto} velocidade={velocidade} />
              </div>
            )}
          </div>
        )}
        {(phase === 'watching' || phase === 'ended') && (
          <LiveMapBox ponto={ponto} trilha={trilha} origem={origem} destino={destino} marca={tmsegLogo} modoCliente alto enderecoAtual={endereco} quando={quando} />
        )}
      </main>
      {ficha && (phase === 'watching' || phase === 'ended') && (
        <div className="px-3 pb-6 lg:px-0 lg:py-3">
          <TimelineCliente origemTexto={ficha.origin || ''} destinoTexto={ficha.destination || ''} etapas={etapas} encerrada={phase === 'ended'} />
        </div>
      )}
      </div>
    </div>
  );
}

function AgentLiveTrack() {
  const token = tokenFromUrl();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [lgpdSummary, setLgpdSummary] = useState('');
  const [lgpdFull, setLgpdFull] = useState('');
  const [osNumber, setOsNumber] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [ativa, setAtiva] = useState(false);
  const [originPoint, setOriginPoint] = useState<Ponto | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<Ponto | null>(null);
  const [showFullLgpd, setShowFullLgpd] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [ponto, setPonto] = useState<{ lat: number; lng: number } | null>(null);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const [hiddenWarn, setHiddenWarn] = useState(false);
  const [wakeOk, setWakeOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [minimized, setMinimized] = useState(false);
  const [bgOk, setBgOk] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const wakeRef = useRef<any>(null);
  const lastSentRef = useRef(0);
  const sendingRef = useRef(false);
  const lastPosRef = useRef<GeolocationPosition | null>(null);
  const endedRef = useRef(false);
  const keepaliveRef = useRef<LiveTrackKeepalive | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const stopKeepalive = useCallback(() => {
    try { keepaliveRef.current?.stop(); } catch { /* ignore */ }
    keepaliveRef.current = null;
    setBgOk(false);
  }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    try { wakeRef.current?.release?.(); } catch { /* ignore */ }
    wakeRef.current = null;
    stopKeepalive();
  }, [stopKeepalive]);

  const requestWake = useCallback(async () => {
    try {
      const lock = await (navigator as any).wakeLock?.request?.('screen');
      if (!lock) {
        setWakeOk(false);
        return;
      }
      wakeRef.current = lock;
      setWakeOk(true);
      lock.addEventListener?.('release', () => setWakeOk(false));
    } catch {
      setWakeOk(false);
    }
  }, []);

  const sendPing = useCallback(async (pos: GeolocationPosition, visibility: 'visible' | 'hidden') => {
    if (endedRef.current) return;
    lastPosRef.current = pos;
    setPonto({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    const now = Date.now();
    const intervalo = visibility === 'hidden' ? PING_OCULTO_MS : PING_VISIVEL_MS;
    if (sendingRef.current || now - lastSentRef.current < intervalo) return;
    sendingRef.current = true;
    const coords = pos.coords;
    const batt = (navigator as any).getBattery ? await (navigator as any).getBattery().catch(() => null) : null;
    const tok = tokenRef.current;
    const payload = {
      token: tok,
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      speed: coords.speed,
      heading: coords.heading,
      battery: batt ? Math.round(batt.level * 100) : undefined,
      visibility,
      background: visibility === 'hidden',
    };
    try {
      const r = await fetch(`/api/live-track?op=public-ping&token=${encodeURIComponent(tok)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        keepalive: true,
        body: JSON.stringify(payload),
      });
      const j = await parseJsonResponse(r);
      if (j?.ended || r.status === 410) {
        endedRef.current = true;
        stopWatch();
        setPhase('ended');
        setMinimized(false);
        return;
      }
      if (!r.ok) {
        setError(j?.error || 'Falha ao enviar localização');
        return;
      }
      lastSentRef.current = Date.now();
      setAccuracy(typeof coords.accuracy === 'number' ? coords.accuracy : null);
      setLastPingAt(Date.now());
      setError('');
    } catch {
      setError('Sem conexão — a última posição será reenviada automaticamente');
    } finally {
      sendingRef.current = false;
    }
  }, [stopWatch]);

  const pollOnce = useCallback(() => {
    if (endedRef.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { void sendPing(pos, vis()); },
      () => {
        const last = lastPosRef.current;
        if (last) void sendPing(last, vis());
      },
      GEO_OPTS,
    );
  }, [sendPing]);

  const startGps = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Este aparelho não oferece GPS no navegador. Abra o link no Chrome ou Safari do celular.');
      setPhase('error');
      return;
    }
    await requestWake();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPhase('sharing');
        void sendPing(pos, vis());
        watchIdRef.current = navigator.geolocation.watchPosition(
          (next) => { void sendPing(next, vis()); },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) {
              setError('Permissão de localização negada. Ative o GPS de alta precisão e recarregue esta página.');
            } else {
              pollOnce();
            }
          },
          GEO_OPTS,
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Permissão de localização negada. No celular: Configurações → este navegador → Localização → Permitir.');
        } else {
          setError('Não foi possível obter GPS. Ative a localização de alta precisão e tente de novo.');
        }
        setPhase('consent');
        stopKeepalive();
      },
      GEO_OPTS,
    );
  }, [pollOnce, requestWake, sendPing, stopKeepalive]);

  useEffect(() => {
    if (!token) {
      setError('Link incompleto. Peça um novo link ao operacional TM SEG.');
      setPhase('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/live-track?op=public-get&token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const j = await parseJsonResponse(r);
        if (cancelled) return;
        if (!r.ok) {
          setError(j?.error || 'Link inválido');
          setPhase('error');
          return;
        }
        setLgpdSummary(j.lgpdSummary || '');
        setLgpdFull(j.lgpdFull || '');
        setOsNumber(j.mission?.osNumber || '');
        setOrigin(j.mission?.origin || '');
        setDestination(j.mission?.destination || '');
        const ehAtiva = j.mission?.ativa === true;
        setAtiva(ehAtiva);
        setOriginPoint(pontoValido(j.mission?.originPoint));
        setDestinationPoint(pontoValido(j.mission?.destinationPoint));
        if (ehAtiva) document.title = 'ATIVA Pronta Resposta';
        if (j.ended || j.status === 'ended') {
          setPhase('ended');
          return;
        }
        setPhase(ehAtiva ? 'marca' : 'consent');
      } catch {
        if (!cancelled) {
          setError('Falha ao abrir o acompanhamento. Verifique a internet e tente de novo.');
          setPhase('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (phase !== 'marca') return;
    const t = window.setTimeout(() => setPhase('consent'), 2800);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'sharing') return;
    const clock = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'sharing') return;
    const onVis = () => {
      const hidden = document.visibilityState !== 'visible';
      setHiddenWarn(hidden);
      if (!hidden) void requestWake();
      if (watchIdRef.current == null && navigator.geolocation && !endedRef.current) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (next) => { void sendPing(next, vis()); },
          () => { pollOnce(); },
          GEO_OPTS,
        );
      }
      pollOnce();
    };
    const onFreeze = () => { pollOnce(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onVis);
    window.addEventListener('freeze', onFreeze);
    window.addEventListener('resume', onVis as EventListener);
    const tick = window.setInterval(() => { pollOnce(); }, 2500);
    const onHide = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Fechar a aba interrompe o rastreio da missão. Mantenha esta página aberta em segundo plano.';
    };
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) {
        pollOnce();
        return;
      }
      const pos = lastPosRef.current;
      const tok = tokenRef.current;
      if (!pos || !tok || endedRef.current) return;
      try {
        const body = JSON.stringify({
          token: tok,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          visibility: 'hidden',
          background: true,
        });
        navigator.sendBeacon(
          `/api/live-track?op=public-ping&token=${encodeURIComponent(tok)}`,
          new Blob([body], { type: 'application/json' }),
        );
      } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onVis);
      window.removeEventListener('freeze', onFreeze);
      window.removeEventListener('resume', onVis as EventListener);
      window.clearInterval(tick);
      window.removeEventListener('beforeunload', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [phase, pollOnce, requestWake, sendPing]);

  useEffect(() => () => stopWatch(), [stopWatch]);

  const onShare = async () => {
    if (!accepted) {
      setError('Marque o aceite LGPD para continuar.');
      return;
    }
    setBusy(true);
    setError('');
    if (!keepaliveRef.current) {
      void startLiveTrackKeepalive(ativa ? {
        title: 'ATIVA — rastreio ao vivo',
        artist: 'ATIVA Pronta Resposta',
        album: 'Acompanhamento da missão',
        body: 'Rastreio ativo em segundo plano. Pode ocultar a tela. A posição segue de 1 em 1 minuto.',
        icon: ativaLogo,
      } : {}).then((k) => {
        keepaliveRef.current = k;
        setBgOk(true);
      }).catch(() => setBgOk(false));
    }
    try {
      const r = await fetch(`/api/live-track?op=public-consent&token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, accepted: true }),
      });
      const j = await parseJsonResponse(r);
      if (!r.ok) {
        setError(j?.error || 'Não foi possível registrar o aceite');
        setBusy(false);
        return;
      }
      await startGps();
    } catch {
      setError('Falha de rede ao confirmar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'sharing' && minimized) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-white flex items-end justify-center p-3">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          data-testid="live-track-expand"
          className="w-full max-w-lg rounded-2xl bg-emerald-500 text-slate-950 px-4 py-3 shadow-2xl flex items-center gap-3"
        >
          <span className="w-3 h-3 rounded-full bg-slate-950 animate-pulse shrink-0" />
          <span className="text-left flex-1">
            <span className="block text-[10px] font-black uppercase tracking-widest">Segundo plano ativo</span>
            <span className="block text-sm font-bold">{ativa ? 'ATIVA rastreando' : 'TM SEG rastreando'}{osNumber ? ` · OS ${osNumber}` : ''}</span>
          </span>
          <span className="text-[10px] font-black uppercase">Abrir</span>
        </button>
      </div>
    );
  }

  const avisoAberto = (
    <p className="bg-amber-400 text-slate-950 px-4 py-3 text-sm font-black leading-snug" data-testid="live-track-keep-open">
      Atenção: mantenha esta página aberta em segundo plano. Fechar a aba interrompe o rastreio da missão.
    </p>
  );

  if (phase === 'marca') {
    return (
      <div className="min-h-[100dvh] bg-black text-white flex flex-col" data-testid="live-track-ativa-marca">
        {avisoAberto}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <img src={ativaLogo} alt="ATIVA Pronta Resposta" className="w-56 h-56 object-contain" />
        <p className="mt-8 text-lg font-black leading-snug max-w-xs">Você será redirecionado para os dados da missão.</p>
        <button
          type="button"
          onClick={() => setPhase('consent')}
          className="mt-8 h-12 px-6 rounded-2xl bg-red-600 text-white text-sm font-black uppercase tracking-wide"
        >
          Continuar
        </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col">
      {avisoAberto}
      <header className="px-5 pt-8 pb-4 flex items-center gap-3 border-b border-white/10">
        {phase === 'loading' ? (
          <p className="text-sm font-bold text-slate-300">Abrindo missão…</p>
        ) : ativa ? (
          <>
            <img src={ativaLogo} alt="ATIVA Pronta Resposta" className="h-14 w-14 rounded-full object-cover" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">ATIVA Pronta Resposta</p>
              <p className="text-sm font-bold">Dados da missão</p>
            </div>
          </>
        ) : (
          <>
            <img src={tmsegLogo} alt="TM SEG" className="h-10 w-auto" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">Grupo TM SEG</p>
              <p className="text-sm font-bold">Acompanhamento em tempo real</p>
            </div>
          </>
        )}
      </header>

      <main className="flex-1 px-5 py-6 max-w-lg mx-auto w-full">
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-300">
            <Loader2 className="animate-spin" size={36} />
            <p className="text-xs font-black uppercase tracking-widest">Abrindo missão…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-5 space-y-3">
            <AlertTriangle className="text-red-400" />
            <p className="font-bold">Não foi possível iniciar o rastreio</p>
            <p className="text-sm text-red-100/80">{error}</p>
          </div>
        )}

        {phase === 'ended' && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-5 space-y-3 text-center">
            <CheckCircle2 className="mx-auto text-emerald-400" size={40} />
            <p className="font-black uppercase tracking-wide">Missão encerrada</p>
            <p className="text-sm text-emerald-100/80">O acompanhamento GPS desta OS foi finalizado. Você já pode fechar esta tela.</p>
            {osNumber ? <p className="text-xs font-mono text-emerald-200">OS {osNumber}</p> : null}
          </div>
        )}

        {phase === 'consent' && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-red-600 p-5 shadow-xl shadow-red-900/40">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">Você está em acompanhamento</p>
              <h1 className="text-2xl font-black leading-tight mt-1">{ativa ? 'A ATIVA Pronta Resposta está acompanhando esta missão' : 'A Central TM SEG está acompanhando esta missão'}</h1>
              {osNumber ? <p className="mt-3 font-mono text-sm bg-black/20 inline-block px-2 py-1 rounded">OS {osNumber}</p> : null}
            </div>
            {(origin || destination) && (
              <p className="text-xs text-slate-300 leading-relaxed">
                {origin ? <>Origem: {origin}<br /></> : null}
                {destination ? <>Destino: {destination}</> : null}
              </p>
            )}
            <p className="text-sm text-slate-200 leading-relaxed">{ativa ? ATIVA_LGPD_SUMMARY : lgpdSummary}</p>
            <label className="flex items-start gap-3 text-sm bg-white/5 rounded-xl p-4 border border-white/10">
              <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} data-testid="live-track-lgpd-check" />
              <span>Li e autorizo o tratamento da minha localização em tempo real, inclusive em segundo plano (tela oculta), até o fim da missão.</span>
            </label>
            <button
              type="button"
              onClick={() => setShowFullLgpd((v) => !v)}
              className="text-[11px] uppercase font-black tracking-widest text-slate-400"
            >
              {showFullLgpd ? 'Ocultar texto LGPD' : 'Ver garantias LGPD completas'}
            </button>
            {showFullLgpd && (
              <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300 bg-black/40 rounded-xl p-4 border border-white/10">{ativa ? ATIVA_LGPD_FULL : lgpdFull}</pre>
            )}
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={onShare}
              data-testid="live-track-share-btn"
              className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-wide text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="animate-spin" size={18} /> : <Radio size={18} />}
              Compartilhar localização em tempo real
            </button>
            <p className="text-[11px] text-slate-400 text-center">Na permissão de GPS escolha Permitir. Depois use Ocultar para ir ao WhatsApp — o rastreio segue até você fechar esta página.</p>
          </div>
        )}

        {phase === 'sharing' && (
          <div className="space-y-5">
            {hiddenWarn && (
              <div className="rounded-2xl bg-emerald-400 text-slate-950 p-4 font-bold text-sm">
                {ativa
                  ? 'Segundo plano ativo. A posição segue de 1 em 1 minuto. O GPS só para se você fechar esta página.'
                  : 'Segundo plano ativo. Pode usar o WhatsApp. O GPS só para se você fechar esta página.'}
              </div>
            )}
            <LiveMapBox ponto={ponto} trilha={ponto ? [ponto] : []} origem={originPoint} destino={destinationPoint} />
            {(origin || destination) && (
              <p className="text-xs text-slate-300 leading-relaxed">
                {origin ? <>Origem: {origin}<br /></> : null}
                {destination ? <>Destino: {destination}</> : null}
              </p>
            )}
            <div className="rounded-3xl bg-emerald-500 text-slate-950 p-6 text-center shadow-2xl">
              <div className="mx-auto w-16 h-16 rounded-full bg-white/30 flex items-center justify-center mb-3 animate-pulse">
                <MapPin size={32} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em]">Transmitindo ao vivo</p>
              <p className="text-2xl font-black mt-1">{ativa ? 'ATIVA acompanhando' : 'Central TM SEG acompanhando'}</p>
              {osNumber ? <p className="font-mono text-sm mt-2">OS {osNumber}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => setMinimized(true)}
              data-testid="live-track-minimize"
              className="w-full h-12 rounded-2xl bg-white/10 border border-white/20 text-white text-sm font-black uppercase tracking-wide flex items-center justify-center gap-2"
            >
              <EyeOff size={16} /> Ocultar e rastrear em segundo plano
            </button>
            <ul className="space-y-2 text-sm text-slate-200">
              <li className="flex gap-2"><EyeOff size={16} className="mt-0.5 shrink-0" /> Ocultar, Home ou WhatsApp: GPS continua. Só para se você fechar esta página.</li>
              <li className="flex gap-2"><Smartphone size={16} className="mt-0.5 shrink-0" /> Deixe o Chrome/Safari aberto (pode ficar oculto) até o fim da missão.</li>
              <li className="flex gap-2"><Radio size={16} className="mt-0.5 shrink-0" /> GPS em alta precisão (não use só Wi‑Fi).</li>
              <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0" /> Localização usada só nesta OS, com registro LGPD.</li>
            </ul>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-white/5 p-3 border border-white/10">
                <p className="text-slate-400 uppercase font-black tracking-widest text-[9px]">Precisão</p>
                <p className="font-mono text-lg">{accuracy != null ? `${Math.round(accuracy)} m` : '—'}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-3 border border-white/10">
                <p className="text-slate-400 uppercase font-black tracking-widest text-[9px]">Último envio</p>
                <p className="font-mono text-lg">{lastPingAt ? `${Math.max(0, Math.round((nowTs - lastPingAt) / 1000))}s` : '—'}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Segundo plano: {bgOk ? 'ativo (notificação + áudio de manutenção)' : 'limitado neste aparelho — não feche a aba'}.
              {' '}Tela ligada: {wakeOk ? 'ativa' : 'o celular pode apagar a tela; o rastreio tenta seguir'}.
            </p>
            {error && <p className="text-sm text-amber-300">{error}</p>}
            {accuracy != null && accuracy > 80 && (
              <p className="text-sm text-amber-300">Precisão fraca. Ative o GPS de alta precisão nas configurações do celular.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function PublicLiveTrack() {
  const credencial = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('c') || '';
  if (credencial) return <ClientLiveMap credential={credencial} />;
  return <AgentLiveTrack />;
}
