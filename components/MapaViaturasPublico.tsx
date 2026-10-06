import React, { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Circle, GoogleMap, OverlayView, useLoadScript } from '@react-google-maps/api';
import { MapPin, Radio } from 'lucide-react';
import { googleMapsLoadConfig } from '../lib/maps';
import { supabase } from '../lib/supabase';
import { textoHaQuantoTempo } from '../lib/dhlViaturaDisponivel';
import { ehCidadeTopo, ordemCidadeTopo } from '../lib/dhlReferenciaGeografica';
import {
  filtrarViaturasPorRaio,
  JANELA_MAPA_MS,
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
    TOPO: 'No topo · Extrema, Pouso Alegre e Varginha',
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
  const corte = new Date(Date.now() - JANELA_MAPA_MS).toISOString();
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
  const grupos = useMemo(() => {
    const ordem = ['NORTE', 'NORDESTE', 'CENTRO-OESTE', 'SUDESTE', 'SUL'];
    const topo = visiveis
      .filter((ponto) => ehCidadeTopo(ponto.posicao))
      .sort((a, b) => ordemCidadeTopo(a.posicao) - ordemCidadeTopo(b.posicao));
    const mapa = new Map<string, typeof visiveis>();
    for (const ponto of visiveis) {
      if (ehCidadeTopo(ponto.posicao)) continue;
      const lista = mapa.get(ponto.regiao) || [];
      lista.push(ponto);
      mapa.set(ponto.regiao, lista);
    }
    const resto = [...mapa.entries()].sort((a, b) => {
      const ia = ordem.indexOf(a[0]);
      const ib = ordem.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return topo.length ? [['TOPO', topo] as [string, typeof visiveis], ...resto] : resto;
  }, [visiveis]);

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

  const abrirPonto = (ponto: { id: string; lat: number; lng: number }) => {
    setSelecionado(ponto.id);
    mapa?.panTo({ lat: ponto.lat, lng: ponto.lng });
    mapa?.setZoom(11);
  };

  const lista = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-black/10 px-4 py-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-[#D40511]">Tudo que está liberado</p>
        <p className="text-sm font-black text-[#323232]">
          {busca ? `${visiveis.length} dentro do raio` : `${pontos.length} viatura${pontos.length === 1 ? '' : 's'} nesta hora`}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {visiveis.length === 0 && (
          <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">
            {busca
              ? 'Nenhuma viatura liberada dentro desse raio agora.'
              : 'Nenhuma viatura liberada nesta hora.'}
          </p>
        )}
        {grupos.map(([regiao, itens]) => (
          <div key={regiao}>
            <p className="mb-1 px-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
              {rotuloRegiaoSimples(regiao)} · {itens.length}
            </p>
            <div className="space-y-1">
              {itens.map((ponto) => (
                <button
                  key={ponto.id}
                  type="button"
                  onClick={() => abrirPonto(ponto)}
                  className={`flex w-full items-start justify-between gap-2 rounded-lg px-2 py-2 text-left ${selecionado === ponto.id ? 'bg-[#FFCC00]' : 'hover:bg-[#f2f2f2]'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black text-[#323232]">Viatura TM Segue · {ponto.posicao}</span>
                    <span className="block text-[10px] font-semibold text-slate-500">
                      Liberada {textoHaQuantoTempo(ponto.finalizadaEm, agora)}
                    </span>
                  </span>
                  {ponto.distanciaKm != null && (
                    <span className="shrink-0 text-[11px] font-black text-[#D40511]">
                      {Math.max(1, Math.round(ponto.distanciaKm))} km
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-[#f2f2f2]" data-testid="portal-dhl">
      <header
        className="z-20 flex items-center gap-3 px-4 py-2.5 text-[#323232] shadow-md"
        style={{ backgroundImage: 'linear-gradient(to right, #ffcc00 30%, #ffe57f 79%, #fff0b2)' }}
      >
        <img src="/logo-dhl.svg" alt="DHL" className="h-7 w-auto" />
        <div className="min-w-0 border-l border-black/15 pl-3">
          <p className="text-sm font-black uppercase leading-tight text-[#D40511]">Portal DHL</p>
          <p className="text-[11px] font-semibold text-[#323232]">30 minutos · fora de 100 km de São Paulo e do Rio</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#D40511] px-2.5 py-1 text-[10px] font-black uppercase text-white">
          <Radio size={12} /> {pontos.length} liberadas
        </span>
        <img src="/logo.png" alt="TM Segue" className="h-9 w-9 object-contain" />
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 h-[42vh] border-t border-black/10 bg-white lg:order-1 lg:h-auto lg:w-[360px] lg:border-r lg:border-t-0">
          {lista}
        </aside>

        <div className="relative order-1 min-h-[52vh] flex-1 lg:order-2">
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
                    fillColor: '#D40511',
                    fillOpacity: 0.08,
                    strokeColor: '#D40511',
                    strokeOpacity: 0.85,
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
                    <span className={`flex h-12 w-12 items-center justify-center rounded-full border-[3px] bg-white shadow-lg ${selecionado === ponto.id ? 'border-[#FFCC00]' : 'border-[#D40511]'}`}>
                      <img src="/logo.png" alt="TM Segue" className="h-8 w-8 object-contain" />
                    </span>
                    <span className={`h-0 w-0 border-x-[8px] border-t-[12px] border-x-transparent ${selecionado === ponto.id ? 'border-t-[#FFCC00]' : 'border-t-[#D40511]'}`} />
                  </button>
                </OverlayView>
              ))}
            </GoogleMap>
          ) : (
            <div className="flex h-full items-center justify-center bg-slate-900 text-sm font-bold text-white">
              {loadError ? 'Não foi possível abrir o mapa.' : 'Abrindo o mapa...'}
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
            <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-black/10 bg-white/95 p-3 shadow-2xl backdrop-blur">
              <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-[#D40511]">
                Busque uma cidade e veja as viaturas liberadas por perto
              </p>
              {isLoaded && (
                <Autocomplete onLoad={setAutocomplete} onPlaceChanged={aoEscolherLugar}>
                  <input
                    type="text"
                    placeholder="Digite a cidade ou o endereço"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#D40511]"
                    data-testid="mapa-viaturas-busca"
                  />
                </Autocomplete>
              )}
              <label className="mt-3 block">
                <span className="flex items-center justify-between text-[11px] font-black uppercase text-slate-600">
                  <span>Raio</span>
                  <span className="text-[#D40511]">{raio} km</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={RAIO_MAX_KM}
                  step={10}
                  value={raio}
                  onChange={(e) => setRaio(Number(e.target.value))}
                  className="mt-1 w-full accent-[#D40511]"
                  data-testid="mapa-viaturas-raio"
                />
                <span className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>0 km</span>
                  <span>1000 km</span>
                </span>
              </label>
              {busca && (
                <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                  <MapPin size={12} className="mr-1 inline" />
                  {busca.endereco}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
