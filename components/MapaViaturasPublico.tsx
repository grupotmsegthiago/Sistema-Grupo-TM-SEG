import React, { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Circle, GoogleMap, OverlayView, useLoadScript } from '@react-google-maps/api';
import { MapPin, Radio } from 'lucide-react';
import { googleMapsLoadConfig } from '../lib/maps';
import { supabase } from '../lib/supabase';
import { textoHaQuantoTempo } from '../lib/dhlViaturaDisponivel';
import {
  filtrarViaturasPorRaio,
  montarPontosPublicos,
  RAIO_MAX_KM,
  type LinhaMapaViatura,
  type PontoMapaPublico,
} from '../lib/dhlViaturaMapa';

const CENTRO_BRASIL = { lat: -14.2, lng: -51.9 };

function rotuloRegiaoSimples(regiao: string): string {
  const mapa: Record<string, string> = {
    NORTE: 'Norte',
    NORDESTE: 'Nordeste',
    'CENTRO-OESTE': 'Centro-Oeste',
    SUDESTE: 'Sudeste',
    SUL: 'Sul',
  };
  return mapa[regiao] || regiao;
}

function zoomDoRaio(km: number): number {
  if (km <= 25) return 10;
  if (km <= 80) return 8;
  if (km <= 200) return 7;
  if (km <= 450) return 6;
  if (km <= 800) return 5;
  return 4;
}

async function carregarPontos(): Promise<PontoMapaPublico[]> {
  try {
    const resp = await fetch('/api/viaturas-disponiveis', { cache: 'no-store' });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data?.viaturas)) return data.viaturas as PontoMapaPublico[];
    }
  } catch {
    /* o mapa ainda lê o banco direto se a API não estiver no ar */
  }
  const corte = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('dhl_viatura_disponivel')
    .select('posicao, uf, regiao, finalizada_em, status')
    .gte('finalizada_em', corte)
    .in('status', ['pendente', 'copiado', 'confirmado'])
    .limit(80);
  if (error || !data) return [];
  const linhas = (data as Omit<LinhaMapaViatura, 'mission_id'>[]).map((row) => ({
    ...row,
    mission_id: `${row.uf}|${row.posicao}|${row.finalizada_em}`,
  }));
  return montarPontosPublicos(linhas);
}

export default function MapaViaturasPublico() {
  const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);
  const [pontos, setPontos] = useState<PontoMapaPublico[]>([]);
  const [agora, setAgora] = useState(() => new Date());
  const [raio, setRaio] = useState(200);
  const [busca, setBusca] = useState<{ lat: number; lng: number; endereco: string } | null>(null);
  const [autocomplete, setAutocomplete] = useState<any>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [mapa, setMapa] = useState<any>(null);

  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      const lista = await carregarPontos();
      if (vivo) setPontos(lista);
    };
    void ler();
    const timer = window.setInterval(() => { void ler(); }, 20000);
    const relogio = window.setInterval(() => setAgora(new Date()), 30000);
    return () => {
      vivo = false;
      window.clearInterval(timer);
      window.clearInterval(relogio);
    };
  }, []);

  const visiveis = useMemo(
    () => filtrarViaturasPorRaio(pontos, busca, raio),
    [pontos, busca, raio],
  );

  useEffect(() => {
    if (!mapa || !busca) return;
    mapa.panTo(busca);
    mapa.setZoom(zoomDoRaio(raio));
  }, [mapa, busca, raio]);

  const aoEscolherLugar = () => {
    const lugar = autocomplete?.getPlace();
    const loc = lugar?.geometry?.location;
    if (!loc) return;
    setBusca({
      lat: loc.lat(),
      lng: loc.lng(),
      endereco: lugar?.formatted_address || lugar?.name || 'Endereço informado',
    });
    setSelecionado(null);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900" data-testid="mapa-viaturas-publico">
      {isLoaded && !loadError ? (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={busca || CENTRO_BRASIL}
          zoom={busca ? zoomDoRaio(raio) : 4}
          onLoad={setMapa}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            clickableIcons: false,
          }}
        >
          {busca && (
            <Circle
              center={busca}
              radius={raio * 1000}
              options={{
                fillColor: '#991b1b',
                fillOpacity: 0.08,
                strokeColor: '#991b1b',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                clickable: false,
              }}
            />
          )}
          {visiveis.map((ponto) => (
            <OverlayView
              key={ponto.id}
              position={{ lat: ponto.lat, lng: ponto.lng }}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -h })}
            >
              <button
                type="button"
                onClick={() => setSelecionado(ponto.id)}
                className="flex flex-col items-center"
                title="Viatura TM Segue"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-red-800 bg-white shadow-lg">
                  <img src="/logo.png" alt="TM Segue" className="h-8 w-8 object-contain" />
                </span>
                <span className="h-0 w-0 border-x-[8px] border-t-[12px] border-x-transparent border-t-red-800" />
              </button>
            </OverlayView>
          ))}
        </GoogleMap>
      ) : (
        <div className="flex h-full items-center justify-center text-sm font-bold text-white">
          {loadError ? 'Não foi possível abrir o mapa.' : 'Abrindo o mapa...'}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
        <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-red-900/20 bg-white/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-wide text-red-900">TM Segue · Viaturas disponíveis</p>
              <p className="text-[11px] font-semibold text-slate-500">Escolta TM Segue. A posição é a cidade do fim da viagem.</p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-800">
              <Radio size={12} /> {visiveis.length}
            </span>
          </div>

          {isLoaded && (
            <Autocomplete onLoad={setAutocomplete} onPlaceChanged={aoEscolherLugar}>
              <input
                type="text"
                placeholder="Digite a cidade ou o endereço"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-800"
                data-testid="mapa-viaturas-busca"
              />
            </Autocomplete>
          )}

          <label className="mt-3 block">
            <span className="flex items-center justify-between text-[11px] font-black uppercase text-slate-600">
              <span>Raio</span>
              <span className="text-red-800">{raio} km</span>
            </span>
            <input
              type="range"
              min={0}
              max={RAIO_MAX_KM}
              step={10}
              value={raio}
              onChange={(e) => setRaio(Number(e.target.value))}
              className="mt-1 w-full accent-red-800"
              data-testid="mapa-viaturas-raio"
            />
            <span className="flex justify-between text-[10px] font-bold text-slate-400">
              <span>0 km</span>
              <span>1000 km</span>
            </span>
            {!busca && (
              <span className="mt-1 block text-[10px] font-semibold text-slate-400">
                Digite a cidade para filtrar as viaturas dentro do raio.
              </span>
            )}
          </label>

          {busca && (
            <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
              <MapPin size={12} className="mr-1 inline" />
              {busca.endereco}
            </p>
          )}

          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {visiveis.length === 0 && (
              <p className="rounded-lg bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-500">
                {busca
                  ? 'Nenhuma viatura TM Segue dentro desse raio agora.'
                  : 'Nenhuma viatura disponível nesta hora.'}
              </p>
            )}
            {visiveis.map((ponto) => (
              <button
                key={ponto.id}
                type="button"
                onClick={() => {
                  setSelecionado(ponto.id);
                  mapa?.panTo({ lat: ponto.lat, lng: ponto.lng });
                  mapa?.setZoom(11);
                }}
                className={`flex w-full items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-left ${selecionado === ponto.id ? 'bg-red-50' : 'hover:bg-slate-50'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black text-slate-800">Viatura TM Segue · {ponto.posicao}</span>
                  <span className="block text-[10px] font-semibold text-slate-500">
                    {rotuloRegiaoSimples(ponto.regiao)} · {textoHaQuantoTempo(ponto.finalizadaEm, agora)}
                  </span>
                </span>
                {ponto.distanciaKm != null && (
                  <span className="shrink-0 text-[11px] font-black text-red-800">
                    {Math.max(1, Math.round(ponto.distanciaKm))} km
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
