import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete, GoogleMap, Marker, OverlayView, Polyline, useLoadScript } from '@react-google-maps/api';
import { ArrowLeftRight, Clock3, FileText, Loader2, MapPinned, Minus, Plus, Route, Satellite, Trash2 } from 'lucide-react';
import { googleMapsApiKey, googleMapsLoadConfig } from '../../lib/maps';
import { authFetch } from '../../lib/authFetch';
import { logoConhecido, urlMapaEstatico, type CenaVisual, type PontoMapa } from '../../lib/portalCliente/frotaVisual';
import {
  destinoDirections,
  ESTILO_MAPA_COTACAO,
  indiceNaRota,
  lerCoordenada,
  localDaRota,
  lugarComGeometria,
  lugarPreenchido,
  mensagemFalhaDirections,
  polylineCodificada,
  precisaFallbackDeTexto,
  restricoesDaRota,
  resumirPontos,
  rotuloCidadeUf,
  rotuloMarcaTransito,
  statusDaFalhaDirections,
  textoComBrasil,
  textoKmMonitor,
  textoTempoMonitor,
  TRACO_PIN,
  type Coordenada,
  type LocalPedido,
} from '../../lib/portalCliente/rotaCotacao';
import {
  REGIOES_COTACAO,
  consultaDoCliente,
  contaVisivelDaCotacao,
  propostaDaConta,
  primeiraRegiaoComTarifa,
  regiaoAcompanhaOrigem,
  regiaoTemLinha,
  tabelaDeLinha,
  tarifaDoBotao,
  textoCardRegiao,
  type PropostaPortal,
  type TabelaCotacao,
} from '../../lib/portalCliente/cotacao';
import { carretaDoCliente, ClientTruckVisual } from './ClientTruckVisual';
import { ExperienciaProposta } from './ExperienciaProposta';
import { usePortalCliente } from './portalMarca';
import { getRegionFromLocation, type VersaoTabelaRegional } from '../../lib/precificacao/tabela2027';
import { nomePdfCotacao, pedidoParaRegistro, reservarNumeroCotacao } from '../../lib/portalCliente/historicoCotacoes';
import QuoteCalculatorCard from '../precificacao/QuoteCalculatorCard';
import { HistoricoCotacoes } from './HistoricoCotacoes';

const FRASES_NOVA = [
  'Recebendo dados..',
  'Verificando rota..',
  'Carregando Informações..',
  'Aguarde mais um instante, estamos verificando a melhor proposta..',
  'Hmmmm.. vamos lá! consegui algo legal pra você..',
];

const FRASES_ACORDADA = [
  'Recebendo dados..',
  'Verificando rota..',
  'Carregando Informações..',
  'Opa, essa rota já temos aqui acordada, segue os valores..',
];

function CampoLugar(props: {
  id: string;
  valor: string;
  placeholder: string;
  cor: string;
  onValor: (valor: string, coordenada: Coordenada | null, placeId: string | null) => void;
  onEditando: (id: string, editando: boolean) => void;
}) {
  const campo = useRef<google.maps.places.Autocomplete | null>(null);
  const caixa = useRef<HTMLInputElement | null>(null);
  const escolhido = useRef(props.valor);
  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento || document.activeElement === elemento) return;
    elemento.value = props.valor;
    escolhido.current = props.valor;
  }, [props.valor]);
  const aplicarLugar = (endereco: string, coordenada: Coordenada | null, placeId: string | null) => {
    escolhido.current = endereco;
    if (caixa.current) caixa.current.value = endereco;
    props.onValor(endereco, coordenada, placeId);
  };
  const resolverTexto = async () => {
    const limpo = (caixa.current?.value || '').trim();
    if (!limpo) {
      if (props.valor) props.onValor('', null, null);
      return;
    }
    if (limpo === escolhido.current) return;
    if (typeof google === 'undefined' || !google.maps?.Geocoder) {
      props.onValor(limpo, null, null);
      return;
    }
    try {
      const resposta = await new google.maps.Geocoder().geocode({ address: textoComBrasil(limpo), componentRestrictions: { country: 'BR' } });
      const achado = lugarComGeometria(resposta.results?.[0], limpo);
      if (!achado) {
        props.onValor(limpo, null, null);
        return;
      }
      aplicarLugar(achado.endereco, achado.coordenada, achado.placeId);
    } catch {
      props.onValor(limpo, null, null);
    }
  };
  return (
    <div className="relative">
      <span className={`absolute left-3 top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full ring-4 ring-white ${props.cor}`} />
      <Autocomplete
        onLoad={(item) => { campo.current = item; }}
        onPlaceChanged={() => {
          const achado = lugarComGeometria(campo.current?.getPlace(), caixa.current?.value);
          if (!achado) return;
          aplicarLugar(achado.endereco, achado.coordenada, achado.placeId);
        }}
        options={{ componentRestrictions: { country: 'BR' }, fields: ['formatted_address', 'name', 'geometry', 'place_id', 'address_components'] }}
      >
        <input
          ref={caixa}
          defaultValue={props.valor}
          onChange={(evento) => {
            const novo = evento.target.value;
            if (novo === escolhido.current) return;
            escolhido.current = '';
            if (props.valor) props.onValor('', null, null);
          }}
          onKeyDown={(evento) => {
            if (evento.key !== 'Enter') return;
            window.setTimeout(() => { void resolverTexto(); }, 280);
          }}
          onFocus={() => props.onEditando(props.id, true)}
          onBlur={() => {
            window.setTimeout(() => {
              props.onEditando(props.id, false);
              void resolverTexto();
            }, 320);
          }}
          placeholder={props.placeholder}
          className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.06)] outline-none focus:border-[#152c54]"
        />
      </Autocomplete>
    </div>
  );
}

function tempoDaRota(segundos: number | null): string {
  if (segundos == null || segundos <= 0) return '—';
  const minutos = Math.round(segundos / 60);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas <= 0) return `${resto} min`;
  return `${horas}h ${String(resto).padStart(2, '0')}min`;
}

function nomeCurto(endereco?: string): string {
  return (endereco || '').split(',')[0]?.trim() || '';
}

type TrajetoMapa = {
  polyline: string;
  inicio: PontoMapa | null;
  fim: PontoMapa | null;
  paradas: PontoMapa[];
  pontos: PontoMapa[];
};

/** Pede o mapa estático em Base64 na rota que já existe. A URL https fica só se o servidor não devolver a imagem. */
async function pedirMapaBase64(alvo: TrajetoMapa, enviar: (corpo: string) => Promise<Response>): Promise<string> {
  const mapaUrl = urlMapaEstatico({
    polyline: alvo.polyline,
    pontos: alvo.pontos,
    chave: googleMapsApiKey,
    inicio: alvo.inicio,
    fim: alvo.fim,
    paradas: alvo.paradas,
  }) || '';
  try {
    const corpo = JSON.stringify({
      polyline: alvo.polyline,
      inicio: alvo.inicio,
      fim: alvo.fim,
      paradas: alvo.paradas,
      pontos: alvo.pontos,
    });
    const resposta = await enviar(corpo);
    const dados = await resposta.json().catch(() => ({}));
    if (resposta.ok && typeof dados.mapa === 'string' && dados.mapa.startsWith('data:image/')) return dados.mapa;
  } catch {
    // a URL https continua disponível quando o servidor não devolve a imagem
  }
  return mapaUrl;
}

function pontoDe(lugar: unknown): PontoMapa | null {
  return lerCoordenada(lugar);
}

function pinDoMapa(cor: string, letra: string | null): google.maps.Symbol {
  return {
    path: TRACO_PIN,
    fillColor: cor,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 1.5,
    scale: letra ? 1.45 : 1.05,
    anchor: new google.maps.Point(12, 22),
    labelOrigin: new google.maps.Point(12, 9),
  };
}

function folgaDoMapa(): google.maps.Padding {
  return { top: 72, right: 80, bottom: 96, left: 300 };
}

function enquadrarMapa(instancia: google.maps.Map, limites: google.maps.LatLngBounds | null | undefined) {
  if (!limites) return;
  instancia.fitBounds(limites, folgaDoMapa());
}

function esperarMapaParado(instancia: google.maps.Map): Promise<void> {
  return new Promise((resolver) => {
    let resolvido = false;
    const acabar = () => {
      if (resolvido) return;
      resolvido = true;
      window.setTimeout(resolver, 160);
    };
    const timer = window.setTimeout(acabar, 1500);
    try {
      google.maps.event.addListenerOnce(instancia, 'idle', () => {
        window.clearTimeout(timer);
        acabar();
      });
    } catch {
      window.clearTimeout(timer);
      acabar();
    }
  });
}

function MapaCotacao(props: {
  origem: string | Coordenada;
  destino: string | Coordenada;
  origemPlaceId?: string | null;
  destinoPlaceId?: string | null;
  origemTexto: string;
  destinoTexto: string;
  km: number | null;
  duracaoSeg: number | null;
  paradas: Array<{ texto: string; local: string | Coordenada; placeId?: string | null }>;
  cliente: string;
  onRota: (km: number | null, segundos: number | null) => void;
  onTrajeto: (trajeto: TrajetoMapa | null) => void;
  mapaPronto: boolean;
  mapaErro: boolean;
  mostrarCarreta: boolean;
  carreta: string | null;
  logo: string | null;
  podeGerar: boolean;
  gerando: boolean;
  onGerar: () => void;
  onPdf: () => void;
}) {
  const mapa = useRef<google.maps.Map | null>(null);
  const [rota, setRota] = useState<google.maps.DirectionsResult | null>(null);
  const [satelite, setSatelite] = useState(false);
  const [falha, setFalha] = useState('');
  const paradas = props.paradas.filter((item) => item.texto.trim() || lugarPreenchido(item.local));
  const chaveParadas = paradas.map((item) => `${item.placeId || ''}|${item.texto}|${typeof item.local === 'string' ? item.local : `${item.local.lat},${item.local.lng}`}`).join('||');
  const chaveOrigem = `${props.origemPlaceId || ''}|${typeof props.origem === 'string' ? props.origem : `${props.origem.lat},${props.origem.lng}`}`;
  const chaveDestino = `${props.destinoPlaceId || ''}|${typeof props.destino === 'string' ? props.destino : `${props.destino.lat},${props.destino.lng}`}`;

  useEffect(() => {
    mapa.current?.setMapTypeId(satelite ? 'hybrid' : 'roadmap');
    mapa.current?.setOptions({ styles: satelite ? [] : ESTILO_MAPA_COTACAO });
  }, [satelite]);

  useEffect(() => {
    if (!props.mapaPronto) return;
    if (!lugarPreenchido(props.origem) || !lugarPreenchido(props.destino)) {
      setRota(null);
      setFalha('');
      props.onRota(null, null);
      props.onTrajeto(null);
      return;
    }
    let ativo = true;
    const espera = window.setTimeout(() => {
      void (async () => {
      const opcoes = restricoesDaRota();
      const origemPedido = localDaRota({ placeId: props.origemPlaceId, coordenada: props.origem, texto: props.origemTexto });
      const destinoPedido = localDaRota({ placeId: props.destinoPlaceId, coordenada: props.destino, texto: props.destinoTexto });
      const viasPedido = paradas.map((item) => localDaRota({ placeId: item.placeId, coordenada: item.local, texto: item.texto }));
      const pedir = (origin: LocalPedido, destination: LocalPedido, vias: LocalPedido[]) => new google.maps.DirectionsService().route({
        origin,
        destination,
        waypoints: vias.map((location) => ({ location, stopover: true })),
        travelMode: google.maps.TravelMode.DRIVING,
        avoidTolls: opcoes.avoidTolls,
        avoidHighways: opcoes.avoidHighways,
        avoidFerries: opcoes.avoidFerries,
        provideRouteAlternatives: opcoes.provideRouteAlternatives,
        region: opcoes.region,
      });
      const aplicar = (resultado: google.maps.DirectionsResult) => {
        if (!ativo) return;
        const pernas = resultado.routes[0]?.legs || [];
        const metros = pernas.reduce((soma, trecho) => soma + (trecho.distance?.value || 0), 0);
        const segundos = pernas.reduce((soma, trecho) => soma + (trecho.duration?.value || 0), 0);
        const km = Math.round(metros / 100) / 10;
        setRota(resultado);
        setFalha('');
        props.onRota(km > 0 ? km : null, segundos > 0 ? segundos : null);
        const rotaDesenhada = resultado.routes[0];
        let trajeto: TrajetoMapa | null = null;
        try {
          const pontos = resumirPontos((rotaDesenhada?.overview_path || []).map((ponto) => pontoDe(ponto)));
          let linha = polylineCodificada(rotaDesenhada);
          if (linha.length < 8 && pontos.length >= 2 && google.maps.geometry?.encoding?.encodePath) {
            linha = google.maps.geometry.encoding.encodePath(pontos.map((ponto) => new google.maps.LatLng(ponto.lat, ponto.lng)));
          }
          trajeto = {
            polyline: linha,
            inicio: pontoDe(pernas[0]?.start_location),
            fim: pontoDe(pernas[pernas.length - 1]?.end_location),
            paradas: pernas.slice(0, -1).map((perna) => pontoDe(perna.end_location)).filter((ponto): ponto is PontoMapa => ponto != null),
            pontos,
          };
        } catch {
          trajeto = null;
        }
        props.onTrajeto(trajeto);
        const limites = rotaDesenhada?.bounds;
        if (limites && mapa.current) enquadrarMapa(mapa.current, limites);
      };
      try {
        let resultado: google.maps.DirectionsResult;
        try {
          resultado = await pedir(origemPedido, destinoPedido, viasPedido);
        } catch (erro) {
          const origemTexto = textoComBrasil(props.origemTexto);
          const destinoTexto = textoComBrasil(props.destinoTexto);
          const viasTexto = paradas.map((item) => textoComBrasil(item.texto));
          const jaEraTexto = origemPedido === origemTexto && destinoPedido === destinoTexto && viasPedido.every((item, indice) => item === viasTexto[indice]);
          if (!precisaFallbackDeTexto(statusDaFalhaDirections(erro)) || jaEraTexto || !origemTexto || !destinoTexto) throw erro;
          resultado = await pedir(origemTexto, destinoTexto, viasTexto);
        }
        aplicar(resultado);
      } catch (erro) {
        if (!ativo) return;
        setRota(null);
        setFalha(mensagemFalhaDirections(statusDaFalhaDirections(erro)));
        props.onRota(null, null);
        props.onTrajeto(null);
      }
      })();
    }, 400);
    return () => {
      ativo = false;
      window.clearTimeout(espera);
    };
  }, [props.mapaPronto, chaveOrigem, chaveDestino, chaveParadas]);

  const pernas = rota?.routes[0]?.legs || [];
  const caminho = rota?.routes[0]?.overview_path || [];
  const saida = pernas[0]?.start_location;
  const chegada = pernas[pernas.length - 1]?.end_location;
  const paradasNoMapa = pernas.slice(0, -1).map((perna) => perna.end_location).filter(Boolean);

  const carretaVisivel = Boolean(rota && props.mostrarCarreta);
  const raizMapa = useRef<HTMLDivElement | null>(null);
  const limites = rota?.routes[0]?.bounds;

  const publicarEnquadramento = (instancia: google.maps.Map, bounds: google.maps.LatLngBounds | null | undefined) => {
    const raiz = raizMapa.current;
    if (!raiz) return;
    (raiz as HTMLElement & { enquadrarParaProposta?: () => Promise<void> }).enquadrarParaProposta = async () => {
      enquadrarMapa(instancia, bounds);
      await esperarMapaParado(instancia);
    };
  };

  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia) return;
    publicarEnquadramento(instancia, limites);
  }, [limites]);

  return (
    <div ref={raizMapa} data-mapa-cotacao="1" className="relative h-[clamp(460px,52vw,640px)] w-full overflow-hidden rounded-[28px] bg-slate-950 shadow-[0_22px_40px_rgba(15,23,42,0.18)]">
      {props.mapaErro ? (
        <p className="flex h-full items-center justify-center px-6 text-center text-sm font-bold text-slate-600">O mapa não carregou.</p>
      ) : !props.mapaPronto ? (
        <p className="flex h-full items-center justify-center text-sm font-bold text-slate-600">Carregando mapa…</p>
      ) : (
        <GoogleMap
          onLoad={(instancia) => { mapa.current = instancia; instancia.setMapTypeId(satelite ? 'hybrid' : 'roadmap'); if (!satelite) instancia.setOptions({ styles: ESTILO_MAPA_COTACAO }); const bounds = rota?.routes[0]?.bounds; enquadrarMapa(instancia, bounds); publicarEnquadramento(instancia, bounds); }}
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={{ lat: -14.2, lng: -45.5 }}
          zoom={5}
          options={{ disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false, mapTypeId: satelite ? 'hybrid' : 'roadmap', styles: satelite ? undefined : ESTILO_MAPA_COTACAO }}
        >
          {caminho.length > 0 && (
            <>
              <Polyline path={caminho} options={{ strokeColor: '#7dd3fc', strokeOpacity: 0.35, strokeWeight: 22 }} />
              <Polyline path={caminho} options={{ strokeColor: '#38bdf8', strokeOpacity: 0.95, strokeWeight: 7 }} />
              <Polyline path={caminho} options={{ strokeColor: '#f8fafc', strokeOpacity: 1, strokeWeight: 2 }} />
            </>
          )}
          {saida && <Marker position={saida} label={{ text: 'A', color: '#ffffff', fontSize: '12px', fontWeight: '800' }} title={nomeCurto(pernas[0]?.start_address)} icon={pinDoMapa('#16a34a', 'A')} />}
          {paradasNoMapa.map((ponto, indice) => (
            <Marker key={`parada-${indice}`} position={ponto} icon={pinDoMapa('#f59e0b', null)} />
          ))}
          {chegada && <Marker position={chegada} label={{ text: 'B', color: '#ffffff', fontSize: '12px', fontWeight: '800' }} title={nomeCurto(pernas[pernas.length - 1]?.end_address)} icon={pinDoMapa('#dc2626', 'B')} />}
          {carretaVisivel && caminho.length > 1 && (
            <OverlayView position={caminho[indiceNaRota(caminho.length)]} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
              <div className="pointer-events-none relative w-[210px] -translate-x-1/2 -translate-y-[78%]">
                <span className="absolute left-1/2 top-[78%] h-16 w-16 -translate-x-1/2 rounded-full bg-sky-400/30 blur-md" />
                <span className="absolute left-1/2 top-[82%] h-10 w-28 -translate-x-1/2 rounded-full border border-sky-200/50 bg-sky-300/15 shadow-[0_0_28px_rgba(56,189,248,0.55)]" />
                <p className="relative z-10 mb-1 whitespace-nowrap rounded-full bg-[#0b1f3a]/90 px-3 py-1 text-[10px] font-black text-white shadow-lg ring-1 ring-sky-300/60">{rotuloMarcaTransito(props.cliente)} • Em Trânsito • {textoKmMonitor(props.km)}</p>
                <div className="relative z-10 origin-center -rotate-6">
                  <ClientTruckVisual cliente={props.cliente} src={props.carreta} logo={props.logo} className="h-24 w-auto max-w-none object-contain drop-shadow-[0_16px_14px_rgba(0,0,0,0.55)]" />
                </div>
              </div>
            </OverlayView>
          )}
        </GoogleMap>
      )}
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(8,16,32,0.5)_100%)]" />
      <aside data-testid="painel-rota" data-fora-pdf="painel" className="absolute left-3 top-3 z-20 w-[min(320px,calc(100%-5.5rem))] rounded-3xl border border-white/20 bg-slate-950/55 p-4 text-white shadow-[0_18px_40px_rgba(2,6,23,0.45)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-black">Informações da Rota</h3>
          <button type="button" onClick={props.onPdf} disabled={!props.podeGerar || props.gerando} className="inline-flex h-7 items-center gap-1 rounded-full border border-white/25 bg-white/10 px-2 text-[10px] font-bold text-white disabled:opacity-40">
            <FileText size={12} /> PDF preview
          </button>
        </div>
        <div className="mt-3 grid gap-2 text-sm">
          <p className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[10px] font-black">A</span><span><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-300">Origem</span>{rotuloCidadeUf(props.origemTexto)}</span></p>
          <p className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[10px] font-black">B</span><span><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-300">Destino</span>{rotuloCidadeUf(props.destinoTexto)}</span></p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300">Distância</p>
            <p className="text-lg font-black">{textoKmMonitor(props.km)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300">Est. Time</p>
            <p className="text-sm font-black leading-snug">{textoTempoMonitor(props.duracaoSeg != null && props.duracaoSeg > 0 ? Math.round(props.duracaoSeg / 60) : null)}</p>
          </div>
        </div>
        <button type="button" onClick={props.onGerar} disabled={!props.podeGerar || props.gerando} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 text-sm font-black text-slate-950 shadow-[0_10px_24px_rgba(56,189,248,0.35)] disabled:cursor-not-allowed disabled:opacity-40">
          <FileText size={16} /> Gerar proposta
        </button>
        {!props.podeGerar && <p className="mt-2 text-[11px] font-semibold text-slate-300">{props.km == null ? 'A rota do Google ainda não fechou.' : 'Escolha a região e os endereços.'}</p>}
      </aside>
      <div className="absolute right-3 top-3 z-30 flex flex-col gap-2">
        <button type="button" onClick={() => setSatelite((atual) => !atual)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/90 text-slate-700 shadow-lg backdrop-blur" aria-label="Trocar o tipo do mapa"><Satellite size={16} /></button>
        <button type="button" onClick={() => mapa.current?.setZoom((mapa.current.getZoom() || 4) + 1)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/90 text-slate-700 shadow-lg backdrop-blur" aria-label="Aproximar"><Plus size={16} /></button>
        <button type="button" onClick={() => mapa.current?.setZoom((mapa.current.getZoom() || 4) - 1)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/90 text-slate-700 shadow-lg backdrop-blur" aria-label="Afastar"><Minus size={16} /></button>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 hidden gap-2 sm:flex">
        <p className="rounded-2xl border border-white/50 bg-white/75 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow backdrop-blur">Escolta intermediada</p>
        <p className="rounded-2xl border border-white/50 bg-white/75 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow backdrop-blur">Acompanhamento da operação</p>
        <p className="rounded-2xl border border-white/50 bg-white/75 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow backdrop-blur">Atendimento 24/7</p>
      </div>
      {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
        <p className="pointer-events-none absolute bottom-2 left-3 z-10 text-[10px] font-semibold text-white/80">Ambiente de Testes / localhost</p>
      )}
      {falha && <p className="absolute bottom-14 left-3 z-20 max-w-sm rounded-2xl bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow">{falha}</p>}
    </div>
  );
}

export const CotacaoPortal: React.FC<{
  clienteNome?: string;
  clientId?: string | number | null;
  versao?: VersaoTabelaRegional;
  onVersao?: (versao: VersaoTabelaRegional) => void;
}> = ({ clienteNome, clientId, versao, onVersao }) => {
  const portal = usePortalCliente();
  const [versaoInterna, setVersaoInterna] = useState<VersaoTabelaRegional>('2027');
  const versaoAtiva = versao ?? versaoInterna;
  const trocarVersao = (proxima: VersaoTabelaRegional) => {
    if (onVersao) onVersao(proxima);
    else setVersaoInterna(proxima);
  };
  const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);
  const [tabelas, setTabelas] = useState<TabelaCotacao[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [regiao, setRegiao] = useState('');
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [coordOrigem, setCoordOrigem] = useState<Coordenada | null>(null);
  const [coordDestino, setCoordDestino] = useState<Coordenada | null>(null);
  const [placeOrigem, setPlaceOrigem] = useState<string | null>(null);
  const [placeDestino, setPlaceDestino] = useState<string | null>(null);
  const [paradas, setParadas] = useState<{ id: number; texto: string; coordenada: Coordenada | null; placeId: string | null }[]>([]);
  const [kmRota, setKmRota] = useState<number | null>(null);
  const [duracaoSeg, setDuracaoSeg] = useState<number | null>(null);
  const [proposta, setProposta] = useState<PropostaPortal | null>(null);
  const [passo, setPasso] = useState(0);
  const [etapa, setEtapa] = useState<'parada' | 'animando' | 'proposta'>('parada');
  const [trajeto, setTrajeto] = useState<TrajetoMapa | null>(null);
  const [cena, setCena] = useState<CenaVisual | null>(null);
  const [printMapa, setPrintMapa] = useState<string | null>(null);
  const [editando, setEditando] = useState<Record<string, boolean>>({});
  const [carretaPronta, setCarretaPronta] = useState<string | null>(null);
  const [logoPronto, setLogoPronto] = useState<string | null>(null);
  const [operacoes, setOperacoes] = useState<string | null>(null);
  const [recargaHistorico, setRecargaHistorico] = useState(0);
  const [avisoHistorico, setAvisoHistorico] = useState('');
  const [previewPdf, setPreviewPdf] = useState<PropostaPortal | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [idCotacaoAberta, setIdCotacaoAberta] = useState<string | null>(null);
  const printGuardado = useRef<{ chave: string; foto: string | null } | null>(null);
  const digitando = Object.values(editando).some(Boolean);
  const marcarEdicao = (id: string, ativo: boolean) => {
    setEditando((atual) => (Boolean(atual[id]) === ativo ? atual : { ...atual, [id]: ativo }));
  };

  useEffect(() => {
    let ativo = true;
    if (clienteNome) {
      import('../../lib/supabase').then(({ supabase }) => supabase
        .from('client_price_tables')
        .select('id, operation_type, activation_fee, franchise_hours, franchise_km, price_per_extra_km, price_per_extra_hour')
        .or(consultaDoCliente(clienteNome)))
        .then(({ data, error }) => {
          if (!ativo) return;
          if (error) throw error;
          const lista = ((data || []) as Parameters<typeof tabelaDeLinha>[0][])
            .map((linha) => tabelaDeLinha(linha))
            .filter((linha): linha is TabelaCotacao => linha != null);
          setTabelas(lista);
        })
        .then(() => {
          if (!ativo) return;
          void authFetch('/api/proposta-escolta/operacoes')
            .then(async (resposta) => {
              const corpo = await resposta.json().catch(() => ({}));
              if (ativo && resposta.ok) setOperacoes(typeof corpo.operacoes === 'string' ? corpo.operacoes : null);
            })
            .catch(() => undefined);
        })
        .catch((falha: unknown) => {
          if (ativo) setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar a tabela.');
        })
        .finally(() => {
          if (ativo) setCarregando(false);
        });
      return () => { ativo = false; };
    }
    fetch(portal.url('/cotacao'), { headers: portal.cabecalhos() })
      .then(async (resposta) => {
        const corpo = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(corpo.error || 'Não foi possível carregar a tabela.');
        if (ativo) setOperacoes(typeof corpo.operacoes === 'string' ? corpo.operacoes : null);
        return (corpo.tabelas || []) as TabelaCotacao[];
      })
      .then((lista) => {
        if (!ativo) return;
        setTabelas(lista);
      })
      .catch((falha: unknown) => {
        if (ativo) setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar a tabela.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => { ativo = false; };
  }, [portal, clienteNome]);

  const clienteDaRegiao = clienteNome || portal.marca.rotulo;
  useEffect(() => {
    setRegiao((atual) => regiaoAcompanhaOrigem(origem, clienteDaRegiao, atual));
  }, [origem, clienteDaRegiao]);
  useEffect(() => {
    setRegiao((atual) => {
      if (atual && regiaoTemLinha(tabelas, atual, versaoAtiva)) return atual;
      return primeiraRegiaoComTarifa(tabelas, versaoAtiva) || atual;
    });
  }, [tabelas, versaoAtiva]);
  const linhasTarifa = useMemo(
    () => tabelas.map((item) => ({
      operation_type: item.operacao,
      price_per_extra_km: item.kmExtra,
      price_per_extra_hour: item.horaExtra,
    })),
    [tabelas],
  );
  const regioes = useMemo(
    () => REGIOES_COTACAO.filter((item) => regiaoTemLinha(tabelas, item, versaoAtiva)),
    [tabelas, versaoAtiva],
  );
  const resolvida = useMemo(
    () => tarifaDoBotao(tabelas, regiao, versaoAtiva),
    [tabelas, regiao, versaoAtiva],
  );
  const tabela = resolvida?.tabela ?? null;
  const contaAtual = useMemo(() => contaVisivelDaCotacao({
    cliente: clienteDaRegiao,
    origem,
    km: kmRota ?? -1,
    versao: versaoAtiva,
    linhas: linhasTarifa,
    tarifaKmFallback: tabela?.kmExtra,
    horaExtraFallback: tabela?.horaExtra,
    vigenciaFallback: resolvida?.vigencia,
  }), [clienteDaRegiao, origem, kmRota, versaoAtiva, linhasTarifa, tabela, resolvida?.vigencia]);
  const frases = proposta?.acordada ? FRASES_ACORDADA : FRASES_NOVA;
  const podeGerar = Boolean(
    origem.trim() && destino.trim() && kmRota != null && kmRota > 0
    && (tabela || getRegionFromLocation(origem, '', clienteDaRegiao).region),
  );

  useEffect(() => {
    if (etapa !== 'animando') return;
    if (passo >= frases.length) {
      setEtapa('proposta');
      return;
    }
    const espera = window.setTimeout(() => setPasso((atual) => atual + 1), 1600);
    return () => window.clearTimeout(espera);
  }, [etapa, passo, frases.length]);

  const montarAtual = (): { nova: PropostaPortal; usouMinimo: boolean; vigencia: VersaoTabelaRegional } | null => {
    if (kmRota == null) return null;
    const conta = contaAtual.aplicar && Math.abs(contaAtual.kmRodado - kmRota) < 0.001
      ? contaAtual
      : contaVisivelDaCotacao({
        cliente: clienteNome || portal.marca.rotulo,
        origem,
        km: kmRota,
        versao: versaoAtiva,
        linhas: linhasTarifa,
        tarifaKmFallback: tabela?.kmExtra,
        horaExtraFallback: tabela?.horaExtra,
        vigenciaFallback: resolvida?.vigencia,
      });
    const tabelaRegiao = tabela ?? (conta.aplicar ? {
      acionamento: conta.total,
      franquiaHoras: conta.franquiaHoras,
      franquiaKm: conta.franquiaKm,
      kmExtra: conta.tarifaKm,
      horaExtra: conta.horaExtra,
    } : null);
    if (!tabelaRegiao) return null;
    const nova = propostaDaConta({
      tabelas,
      regiao,
      origem,
      destino,
      paradas: paradas.map((item) => item.texto),
      kmRota,
      conta,
      tabelaRegiao,
      duracaoMin: duracaoSeg != null && duracaoSeg > 0 ? Math.round(duracaoSeg / 60) : null,
    });
    if (nova.acordada) {
      nova.vigencia = versaoAtiva;
      nova.kmRota = kmRota;
      nova.duracaoMin = duracaoSeg != null && duracaoSeg > 0 ? Math.round(duracaoSeg / 60) : null;
      return { nova, usouMinimo: kmRota <= 100, vigencia: versaoAtiva };
    }
    const vigente = conta.aplicar ? conta.vigencia : versaoAtiva;
    nova.vigencia = nova.vigencia || vigente;
    nova.kmRota = kmRota;
    nova.duracaoMin = duracaoSeg != null && duracaoSeg > 0 ? Math.round(duracaoSeg / 60) : null;
    const usouMinimo = conta.aplicar ? conta.usouMinimo : kmRota <= 100;
    return { nova, usouMinimo, vigencia: vigente };
  };

  const colarPrintDoMapa = async (): Promise<string | null> => {
    const chave = `${origem}|${destino}|${kmRota ?? ''}|${trajeto?.polyline || ''}`;
    if (printGuardado.current?.chave === chave && printGuardado.current.foto) return printGuardado.current.foto;
    const raiz = document.querySelector('[data-mapa-cotacao="1"]');
    if (!(raiz instanceof HTMLElement) || !trajeto) return null;
    const fundo = cena?.mapa?.startsWith('data:image/') ? cena.mapa : await pedirMapaBase64(trajeto, (corpo) => (
      clienteNome
        ? authFetch('/api/proposta-escolta/mapa', { method: 'POST', body: corpo })
        : fetch('/api/proposta-escolta/mapa', { method: 'POST', headers: { ...portal.cabecalhos(), 'Content-Type': 'application/json' }, body: corpo })
    ));
    const enquadrar = (raiz as HTMLElement & { enquadrarParaProposta?: () => Promise<void> }).enquadrarParaProposta;
    if (enquadrar) await enquadrar();
    const { printDoMapaVisivel } = await import('./abrirPdfCotacao');
    const foto = await printDoMapaVisivel(raiz, fundo.startsWith('data:image/') ? fundo : null);
    printGuardado.current = { chave, foto };
    return foto;
  };

  const gerar = () => {
    const feito = montarAtual();
    if (!feito) return;
    void (async () => {
      const print = await colarPrintDoMapa();
      const gravado = await gravarNoHistorico(feito.nova, feito.usouMinimo, feito.vigencia);
      if (gravado?.numero) feito.nova.numero = gravado.numero;
      setIdCotacaoAberta(gravado?.id ?? null);
      setPrintMapa(print);
      setProposta(feito.nova);
      setPasso(0);
      setEtapa('animando');
    })();
  };

  const preverPdf = () => {
    if (isGenerating) return;
    const feito = montarAtual();
    if (!feito) return;
    setIsGenerating(true);
    void (async () => {
      try {
        const print = await colarPrintDoMapa();
        setPrintMapa(print);
        setPreviewPdf(feito.nova);
      } catch {
        setIsGenerating(false);
        setAvisoHistorico('Não foi possível abrir o PDF.');
      }
    })();
  };

  const editarCotacao = (edicao: { origem: string; destino: string; paradas: string[]; regiao?: string }) => {
    setOrigem(edicao.origem);
    setDestino(edicao.destino);
    setCoordOrigem(null);
    setCoordDestino(null);
    setPlaceOrigem(null);
    setPlaceDestino(null);
    setParadas(edicao.paradas.map((texto, indice) => ({ id: Date.now() + indice, texto, coordenada: null, placeId: null })));
    if (edicao.regiao) setRegiao(edicao.regiao);
    setEtapa('parada');
    setProposta(null);
    setIdCotacaoAberta(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const gravarNoHistorico = async (nova: PropostaPortal, usouMinimo: boolean, vigencia: VersaoTabelaRegional): Promise<{ numero: number | null; id: string | null } | null> => {
    setAvisoHistorico('');
    const pedido = {
      origem,
      destino,
      paradas: paradas.map((item) => item.texto).filter(Boolean),
      km: kmRota,
      duracaoMin: duracaoSeg != null && duracaoSeg > 0 ? Math.round(duracaoSeg / 60) : null,
      valor: nova.acionamento,
      horas: nova.horasContadas ?? nova.horasFranquia,
      regiao: nova.regiao,
      kmFranquia: nova.kmFaturado ?? nova.kmFranquia,
      kmExtra: nova.kmExtra,
      horaExtra: nova.horaExtra,
      acionamento: nova.acionamento,
      acordada: nova.acordada,
      operacao: nova.operacao,
      usouMinimo,
      vigencia,
    };
    try {
      if (clienteNome) {
        const { supabase } = await import('../../lib/supabase');
        let idCliente = Number(clientId);
        if (!Number.isFinite(idCliente) || idCliente <= 0) {
          const { data } = await supabase.from('clients').select('id').ilike('name', clienteNome).limit(1).maybeSingle();
          idCliente = Number(data?.id);
        }
        let usuario: { name?: string; email?: string } = {};
        try { usuario = JSON.parse(localStorage.getItem('userData') || '{}') as { name?: string; email?: string }; } catch { usuario = {}; }
        const numero = await reservarNumeroCotacao(async (inicio, fim) => {
          const { data, error } = await supabase.from('quotes').select('id, contract_details').order('created_at', { ascending: true }).range(inicio, fim);
          if (error) return null;
          return { linhas: Array.isArray(data) ? data : [] };
        });
        const registro = pedidoParaRegistro({ ...pedido, numero }, { id: idCliente, name: clienteNome }, { name: usuario.name || '', email: usuario.email || '' });
        if (!registro.ok) throw new Error(registro.error);
        const { data, error } = await supabase.from('quotes').insert(registro.linha).select('id').single();
        if (error) throw new Error('A proposta abriu, mas o histórico não gravou.');
        setRecargaHistorico((atual) => atual + 1);
        return { numero, id: data?.id ? String(data.id) : null };
      }
      const resposta = await fetch(portal.url('/cotacao'), {
        method: 'POST',
        headers: { ...portal.cabecalhos(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'registrar', ...pedido }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || 'A proposta abriu, mas o histórico não gravou.');
      setRecargaHistorico((atual) => atual + 1);
      return {
        numero: typeof corpo.numero === 'number' ? corpo.numero : null,
        id: typeof corpo.id === 'string' && corpo.id ? corpo.id : null,
      };
    } catch (falha) {
      setAvisoHistorico(falha instanceof Error ? falha.message : 'A proposta abriu, mas o histórico não gravou.');
      return null;
    }
  };

  useEffect(() => {
    if (!previewPdf) return;
    let ativo = true;
    const gerarPdf = async () => {
      await new Promise((resolver) => window.setTimeout(resolver, 80));
      const artigo = document.querySelector('[data-proposta-pdf="preview"]');
      if (!(artigo instanceof HTMLElement) || !ativo) return;
      await Promise.all(Array.from(artigo.querySelectorAll('img')).map((imagem) => (
        imagem.complete ? null : new Promise<void>((resolver) => {
          imagem.onload = () => resolver();
          imagem.onerror = () => resolver();
        })
      )));
      try {
        const { abrirPdfDaProposta } = await import('./abrirPdfCotacao');
        await abrirPdfDaProposta(artigo, nomePdfCotacao({
          cliente: clienteNome || portal.marca.rotulo,
          origem: previewPdf.origem,
          destino: previewPdf.destino,
          numero: previewPdf.numero,
        }), null);
      } catch (falha) {
        if (ativo) setAvisoHistorico(falha instanceof Error ? falha.message : 'Não foi possível abrir o PDF.');
      } finally {
        if (ativo) {
          setPreviewPdf(null);
          setIsGenerating(false);
        }
      }
    };
    void gerarPdf();
    return () => { ativo = false; };
  }, [previewPdf, clienteNome, portal.marca.rotulo]);

  const clienteVisual = clienteNome || portal.marca.rotulo;
  const trechoCurto = origem.trim() && destino.trim() ? `${nomeCurto(origem)} → ${nomeCurto(destino)}` : 'Aguardando a rota';

  useEffect(() => {
    if (!trajeto?.polyline && (trajeto?.pontos.length || 0) < 2) {
      setCena(null);
      setPrintMapa(null);
      setCarretaPronta(null);
      setLogoPronto(null);
      return;
    }
    let ativo = true;
    const noPortal = !clienteNome;
    const logoPortal = noPortal && (portal.marca.logo.startsWith('/') || portal.marca.logo.startsWith('https://')) ? portal.marca.logo : null;
    const carreta = carretaDoCliente(clienteVisual);
    const marca = logoConhecido(clienteVisual) || logoPortal;
    const trabalhar = async () => {
      if (!trajeto) return;
      const mapa = await pedirMapaBase64(trajeto, (corpo) => (
        clienteNome
          ? authFetch('/api/proposta-escolta/mapa', { method: 'POST', body: corpo })
          : fetch('/api/proposta-escolta/mapa', { method: 'POST', headers: { ...portal.cabecalhos(), 'Content-Type': 'application/json' }, body: corpo })
      ));
      if (!ativo) return;
      setCarretaPronta(null);
      setLogoPronto(marca);
      setCena(mapa ? { mapa, carreta, logo: marca, sobreporLogo: Boolean(marca) } : null);
    };
    void trabalhar();
    return () => { ativo = false; };
  }, [trajeto, clienteVisual, clienteNome, portal]);

  return (
    <section className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <style>{`.pac-container { z-index: 20000 !important; }`}</style>
      <div className="grid gap-4">
        <div className="rounded-[28px] border border-white/80 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Cotação</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">Escolha a região</h2>
          <p className="mt-1 text-xs text-slate-500">Selecione a região de operação</p>
          {carregando && <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={16} /> Lendo os valores da região…</p>}
          {erro && <p className="mt-4 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</p>}
          {!carregando && !erro && regioes.length === 0 && (
            <p className="mt-4 text-sm text-slate-600">Este cliente ainda não tem valor por km nas regiões.</p>
          )}
          {regioes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {regioes.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRegiao(item)}
                  aria-pressed={regiao === item}
                  data-testid={`botao-regiao-${item}`}
                  className={`h-10 rounded-2xl px-3 text-[11px] font-black shadow-[0_8px_16px_rgba(15,23,42,0.08)] motion-safe:transition motion-safe:hover:-translate-y-0.5 motion-reduce:transform-none ${regiao === item ? 'bg-[#152c54] text-white shadow-[0_10px_18px_rgba(21,44,84,0.35)]' : 'bg-slate-100 text-slate-600'}`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-[28px] border border-white/80 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Rota</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">Origem e destino</h2>
          {isLoaded ? (
            <div className="relative mt-4 grid gap-3">
              <span className="absolute bottom-16 left-[17px] top-6 w-px bg-slate-200" />
              <CampoLugar id="origem" valor={origem} placeholder="Origem" cor="bg-emerald-500" onValor={(texto, coordenada, placeId) => { setOrigem(texto); setCoordOrigem(coordenada); setPlaceOrigem(placeId); }} onEditando={marcarEdicao} />
              <button type="button" onClick={() => { setOrigem(destino); setDestino(origem); setCoordOrigem(coordDestino); setCoordDestino(coordOrigem); setPlaceOrigem(placeDestino); setPlaceDestino(placeOrigem); }} className="z-10 grid h-9 w-9 place-items-center justify-self-center rounded-full border border-slate-200 bg-white text-slate-500 shadow" aria-label="Inverter origem e destino"><ArrowLeftRight size={14} /></button>
              {paradas.map((parada) => (
                <div key={parada.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <CampoLugar id={`parada-${parada.id}`} valor={parada.texto} placeholder="Parada" cor="bg-amber-400" onValor={(texto, coordenada, placeId) => setParadas((lista) => lista.map((item) => item.id === parada.id ? { ...item, texto, coordenada, placeId } : item))} onEditando={marcarEdicao} />
                  </div>
                  <button type="button" onClick={() => setParadas((lista) => lista.filter((item) => item.id !== parada.id))} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500" aria-label="Remover parada"><Trash2 size={16} /></button>
                </div>
              ))}
              <CampoLugar id="destino" valor={destino} placeholder="Destino" cor="bg-red-500" onValor={(texto, coordenada) => { setDestino(texto); setCoordDestino(coordenada); }} onEditando={marcarEdicao} />
              <button type="button" onClick={() => setParadas((lista) => [...lista, { id: Date.now(), texto: '', coordenada: null, placeId: null }])} className="inline-flex h-10 items-center gap-2 text-sm font-bold text-[#152c54]">
                <Plus size={16} /> Adicionar parada
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm font-bold text-slate-500">{loadError ? 'O Google não carregou.' : 'Carregando o Google…'}</p>
          )}
        </div>
      </div>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <article className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur">
            <p className="flex items-center gap-2 text-[11px] font-bold text-slate-400"><Route size={14} /> Distância</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{kmRota == null ? '—' : `${kmRota.toLocaleString('pt-BR')} km`}</p>
          </article>
          <article className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur">
            <p className="flex items-center gap-2 text-[11px] font-bold text-slate-400"><Clock3 size={14} /> Tempo de viagem</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{tempoDaRota(duracaoSeg)}</p>
          </article>
          <article className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur">
            <p className="flex items-center gap-2 text-[11px] font-bold text-slate-400"><MapPinned size={14} /> Pedágio</p>
            <p className="mt-2 text-2xl font-black text-slate-900">À parte</p>
            <p className="text-[11px] text-slate-400">Sem estimativa nesta rota</p>
          </article>
          <article className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur">
            <p className="text-[11px] font-bold text-slate-400">Região</p>
            <p className="mt-2 text-2xl font-black text-slate-900" data-testid="card-regiao-cotacao">{textoCardRegiao(origem, clienteDaRegiao, regiao) || '—'}</p>
            <p className="truncate text-[11px] text-slate-400">{trechoCurto}</p>
          </article>
        </div>
        <QuoteCalculatorCard
          cliente={clienteVisual}
          versao={versaoAtiva}
          linhas={linhasTarifa}
          origem={origem}
          destino={destino}
          km={kmRota == null ? '' : String(kmRota)}
          onOrigem={(texto) => { if (texto === origem) return; setOrigem(texto); setCoordOrigem(null); setPlaceOrigem(null); }}
          onDestino={(texto) => { if (texto === destino) return; setDestino(texto); setCoordDestino(null); setPlaceDestino(null); }}
          onKm={() => undefined}
          tarifaKm={tabela?.kmExtra}
          horaExtra={tabela?.horaExtra}
          conta={contaAtual}
          ocultarCampos
        />
        <MapaCotacao origem={destinoDirections(coordOrigem, origem)} destino={destinoDirections(coordDestino, destino)} origemPlaceId={placeOrigem} destinoPlaceId={placeDestino} origemTexto={origem} destinoTexto={destino} km={kmRota} duracaoSeg={duracaoSeg} paradas={paradas.filter((item) => item.texto.trim()).map((item) => ({ texto: item.texto, local: destinoDirections(item.coordenada, item.texto), placeId: item.placeId }))} cliente={clienteVisual} onRota={(km, segundos) => { setKmRota(km); setDuracaoSeg(segundos); }} onTrajeto={setTrajeto} mapaPronto={isLoaded} mapaErro={Boolean(loadError)} mostrarCarreta={!digitando} carreta={carretaPronta} logo={logoPronto || logoConhecido(clienteVisual)} podeGerar={podeGerar} gerando={etapa !== 'parada'} onGerar={gerar} onPdf={preverPdf} />
        <HistoricoCotacoes clienteNome={clienteNome} clientId={clientId} recarga={recargaHistorico} aviso={avisoHistorico} versao={versaoAtiva} onVersao={trocarVersao} onEditar={editarCotacao} contaAtual={contaAtual} origemAtual={origem} destinoAtual={destino} kmAtual={kmRota} />
        {isGenerating && (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45" data-testid="overlay-pdf-cotacao" role="status">
            <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-2xl">
              <Loader2 className="animate-spin text-slate-900" size={22} />
              <p className="text-sm font-semibold text-slate-900">Gerando PDF da proposta, aguarde...</p>
            </div>
          </div>
        )}
      </div>
      {previewPdf && (
        <ExperienciaProposta
          modoCaptura
          frase=""
          mostrando
          proposta={previewPdf}
          pedido={{ regiao, origem, destino, paradas: paradas.map((item) => item.texto).filter(Boolean), km: kmRota || 0 }}
          clienteInterno={clienteNome}
          cena={cena}
          printMapa={printMapa}
          operacoes={operacoes}
          marcaPdf="preview"
          onFechar={() => setPreviewPdf(null)}
        />
      )}
      {etapa !== 'parada' && proposta && (
        <ExperienciaProposta
          frase={frases[Math.min(passo, frases.length - 1)] || ''}
          mostrando={etapa === 'proposta'}
          proposta={proposta}
          pedido={{ regiao, origem, destino, paradas: paradas.map((item) => item.texto).filter(Boolean), km: kmRota || 0 }}
          clienteInterno={clienteNome}
          cena={cena}
          printMapa={printMapa}
          operacoes={operacoes}
          idCotacao={idCotacaoAberta}
          onFechar={() => { setEtapa('parada'); setProposta(null); setPasso(0); setIdCotacaoAberta(null); }}
        />
      )}
    </section>
  );
};
