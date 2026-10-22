import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete, GoogleMap, Marker, Polyline, useLoadScript } from '@react-google-maps/api';
import { ArrowLeftRight, ArrowRight, Clock3, FileText, Loader2, MapPinned, Minus, Plus, Route, Satellite, Trash2 } from 'lucide-react';
import { googleMapsApiKey, googleMapsLoadConfig } from '../../lib/maps';
import { authFetch } from '../../lib/authFetch';
import { corSegura, logoConhecido, slugVisual, urlMapaEstatico, type CenaVisual, type PontoMapa } from '../../lib/portalCliente/frotaVisual';
import {
  REGIOES_COTACAO,
  montarProposta,
  tabelaDeLinha,
  valoresDaRegiao,
  type PropostaPortal,
  type TabelaCotacao,
} from '../../lib/portalCliente/cotacao';
import { carretaDoCliente, ClientTruckVisual } from './ClientTruckVisual';
import { ExperienciaProposta } from './ExperienciaProposta';
import { usePortalCliente } from './portalMarca';

function filtroDoCliente(nome: string): string {
  const limpo = nome.trim().replace(/"/g, '');
  const citar = (valor: string) => (/[(),.:]/.test(valor) ? `"${valor}"` : valor);
  const primeira = limpo.split(/\s+/).find((parte) => !['LTDA', 'LTDA.', 'S.A.', 'S.A', 'SA', 'S/A', 'DO', 'DE', 'DA', 'E', 'DAS', 'DOS'].includes(parte.toUpperCase())) || limpo;
  return `client.eq.${citar(limpo)},client.ilike.${citar(`%${primeira}%`)}`;
}

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

function CampoLugar(props: { id: string; valor: string; placeholder: string; cor: string; onValor: (valor: string) => void; onEditando: (id: string, editando: boolean) => void }) {
  const campo = useRef<google.maps.places.Autocomplete | null>(null);
  const caixa = useRef<HTMLInputElement | null>(null);
  const escolhido = useRef(props.valor);
  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento || document.activeElement === elemento) return;
    elemento.value = props.valor;
    escolhido.current = props.valor;
  }, [props.valor]);
  return (
    <div className="relative">
      <span className={`absolute left-3 top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full ring-4 ring-white ${props.cor}`} />
      <Autocomplete
        onLoad={(item) => { campo.current = item; }}
        onPlaceChanged={() => {
          const lugar = campo.current?.getPlace();
          const endereco = lugar?.formatted_address || lugar?.name || '';
          if (!endereco || !lugar?.geometry?.location) return;
          escolhido.current = endereco;
          if (caixa.current) caixa.current.value = endereco;
          props.onValor(endereco);
        }}
        options={{ componentRestrictions: { country: 'br' }, fields: ['formatted_address', 'name', 'geometry'] }}
      >
        <input
          ref={caixa}
          defaultValue={props.valor}
          onChange={(evento) => {
            const novo = evento.target.value;
            if (novo === escolhido.current) return;
            escolhido.current = '';
            if (props.valor) props.onValor('');
          }}
          onFocus={() => props.onEditando(props.id, true)}
          onBlur={() => window.setTimeout(() => props.onEditando(props.id, false), 300)}
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
};

function pontoDe(lugar?: google.maps.LatLng | null): PontoMapa | null {
  if (!lugar) return null;
  const lat = lugar.lat();
  const lng = lugar.lng();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function lerCacheCarreta(slug: string): { carreta: string; logo: string | null; gerada: boolean } | null {
  try {
    const bruto = localStorage.getItem(`tmseg-carreta-v1:${slug}`);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as { carreta?: string; logo?: string | null; gerada?: boolean };
    if (!dados.carreta || dados.carreta.length > 1_800_000) return null;
    return { carreta: dados.carreta, logo: dados.logo || null, gerada: Boolean(dados.gerada) };
  } catch {
    return null;
  }
}

function gravarCacheCarreta(slug: string, dados: { carreta: string; logo: string | null; gerada: boolean }) {
  if (dados.carreta.length > 1_800_000) return;
  try {
    localStorage.setItem(`tmseg-carreta-v1:${slug}`, JSON.stringify(dados));
  } catch {
    // o arquivo no servidor continua valendo na próxima leitura
  }
}

function imagemExiste(src: string): Promise<boolean> {
  return new Promise((resolver) => {
    const imagem = new Image();
    imagem.onload = () => resolver(imagem.naturalWidth > 80);
    imagem.onerror = () => resolver(false);
    imagem.src = src;
  });
}

function MapaCotacao(props: {
  origem: string;
  destino: string;
  paradas: string[];
  cliente: string;
  onRota: (km: number | null, segundos: number | null) => void;
  onTrajeto: (trajeto: TrajetoMapa | null) => void;
  mapaPronto: boolean;
  mapaErro: boolean;
  mostrarCarreta: boolean;
  carreta: string | null;
  logo: string | null;
}) {
  const mapa = useRef<google.maps.Map | null>(null);
  const [rota, setRota] = useState<google.maps.DirectionsResult | null>(null);
  const [satelite, setSatelite] = useState(true);
  const [falha, setFalha] = useState('');
  const paradas = props.paradas.map((item) => item.trim()).filter(Boolean).join('|');

  useEffect(() => {
    mapa.current?.setMapTypeId(satelite ? 'hybrid' : 'roadmap');
  }, [satelite]);

  useEffect(() => {
    if (!props.mapaPronto) return;
    if (!props.origem.trim() || !props.destino.trim()) {
      setRota(null);
      setFalha('');
      props.onRota(null, null);
      props.onTrajeto(null);
      return;
    }
    let ativo = true;
    const espera = window.setTimeout(() => {
      const servico = new google.maps.DirectionsService();
      servico.route({
        origin: props.origem,
        destination: props.destino,
        waypoints: paradas.split('|').filter(Boolean).map((location) => ({ location, stopover: true })),
        travelMode: google.maps.TravelMode.DRIVING,
        region: 'BR',
      }).then((resultado) => {
        if (!ativo) return;
        const pernas = resultado.routes[0]?.legs || [];
        const metros = pernas.reduce((soma, trecho) => soma + (trecho.distance?.value || 0), 0);
        const segundos = pernas.reduce((soma, trecho) => soma + (trecho.duration?.value || 0), 0);
        setRota(resultado);
        setFalha('');
        props.onRota(Math.round(metros / 100) / 10, segundos);
        const rotaDesenhada = resultado.routes[0];
        const linha = typeof rotaDesenhada?.overview_polyline === 'string' ? rotaDesenhada.overview_polyline : '';
        const caminhoCodificado = linha || (rotaDesenhada?.overview_path ? google.maps.geometry?.encoding?.encodePath(rotaDesenhada.overview_path) : '');
        props.onTrajeto(caminhoCodificado ? {
          polyline: caminhoCodificado,
          inicio: pontoDe(pernas[0]?.start_location),
          fim: pontoDe(pernas[pernas.length - 1]?.end_location),
          paradas: pernas.slice(0, -1).map((perna) => pontoDe(perna.end_location)).filter((ponto): ponto is PontoMapa => ponto != null),
        } : null);
        const limites = rotaDesenhada?.bounds;
        if (limites) mapa.current?.fitBounds(limites, 64);
      }).catch(() => {
        if (!ativo) return;
        setRota(null);
        setFalha('Não foi possível traçar essa rota. Escolha origem e destino na lista do Google.');
        props.onRota(null, null);
        props.onTrajeto(null);
      });
    }, 400);
    return () => {
      ativo = false;
      window.clearTimeout(espera);
    };
  }, [props.mapaPronto, props.origem, props.destino, paradas]);

  const pernas = rota?.routes[0]?.legs || [];
  const caminho = rota?.routes[0]?.overview_path || [];
  const saida = pernas[0]?.start_location;
  const chegada = pernas[pernas.length - 1]?.end_location;
  const paradasNoMapa = pernas.slice(0, -1).map((perna) => perna.end_location).filter(Boolean);

  const carretaVisivel = Boolean(rota && props.mostrarCarreta);

  return (
    <div className="relative h-[460px] overflow-hidden rounded-[28px] bg-slate-200 shadow-[0_22px_40px_rgba(15,23,42,0.18)] xl:h-[520px]">
      {props.mapaErro ? (
        <p className="flex h-full items-center justify-center px-6 text-center text-sm font-bold text-slate-600">O mapa não carregou.</p>
      ) : !props.mapaPronto ? (
        <p className="flex h-full items-center justify-center text-sm font-bold text-slate-600">Carregando mapa…</p>
      ) : (
        <GoogleMap
          onLoad={(instancia) => { mapa.current = instancia; instancia.setMapTypeId(satelite ? 'hybrid' : 'roadmap'); const limites = rota?.routes[0]?.bounds; if (limites) instancia.fitBounds(limites, 64); }}
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={{ lat: -23.5, lng: -46.6 }}
          zoom={6}
          options={{ disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false, mapTypeId: satelite ? 'hybrid' : 'roadmap' }}
        >
          {caminho.length > 0 && (
            <>
              <Polyline path={caminho} options={{ strokeColor: '#7dd3fc', strokeOpacity: 0.28, strokeWeight: 26 }} />
              <Polyline path={caminho} options={{ strokeColor: '#38bdf8', strokeOpacity: 0.95, strokeWeight: 8 }} />
              <Polyline path={caminho} options={{ strokeColor: '#f0f9ff', strokeOpacity: 1, strokeWeight: 3 }} />
            </>
          )}
          {saida && <Marker position={saida} label={{ text: nomeCurto(pernas[0]?.start_address), color: '#0f172a', fontSize: '12px', fontWeight: '700' }} icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#16a34a', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 }} />}
          {paradasNoMapa.map((ponto, indice) => (
            <Marker key={`parada-${indice}`} position={ponto} icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#f59e0b', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 }} />
          ))}
          {chegada && <Marker position={chegada} label={{ text: nomeCurto(pernas[pernas.length - 1]?.end_address), color: '#0f172a', fontSize: '12px', fontWeight: '700' }} icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#dc2626', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 }} />}
        </GoogleMap>
      )}
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(8,16,32,0.42)_100%)]" />
      <div className="absolute right-3 top-3 z-30 flex flex-col gap-2">
        <button type="button" onClick={() => setSatelite((atual) => !atual)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/90 text-slate-700 shadow-lg backdrop-blur" aria-label="Trocar o tipo do mapa"><Satellite size={16} /></button>
        <button type="button" onClick={() => mapa.current?.setZoom((mapa.current.getZoom() || 4) + 1)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/90 text-slate-700 shadow-lg backdrop-blur" aria-label="Aproximar"><Plus size={16} /></button>
        <button type="button" onClick={() => mapa.current?.setZoom((mapa.current.getZoom() || 4) - 1)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/90 text-slate-700 shadow-lg backdrop-blur" aria-label="Afastar"><Minus size={16} /></button>
      </div>
      {carretaVisivel && (
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-3">
        <ClientTruckVisual cliente={props.cliente} src={props.carreta} logo={props.logo} className="h-36 w-auto max-w-none object-contain drop-shadow-[0_18px_18px_rgba(0,0,0,0.35)]" />
        <div className="mb-2 hidden gap-2 sm:flex">
          <p className="rounded-2xl border border-white/50 bg-white/75 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow backdrop-blur">Escolta intermediada</p>
          <p className="rounded-2xl border border-white/50 bg-white/75 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow backdrop-blur">Acompanhamento da operação</p>
          <p className="rounded-2xl border border-white/50 bg-white/75 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow backdrop-blur">Atendimento 24/7</p>
        </div>
      </div>
      )}
      {!props.origem.trim() || !props.destino.trim() ? (
        <p className="pointer-events-none absolute left-4 top-4 rounded-2xl bg-white/90 px-3 py-2 text-xs font-bold text-slate-600 shadow">Escolha a origem e o destino no Google para ver o trajeto.</p>
      ) : null}
      {falha && <p className="absolute left-4 top-4 max-w-sm rounded-2xl bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow">{falha}</p>}
    </div>
  );
}

export const CotacaoPortal: React.FC<{ clienteNome?: string }> = ({ clienteNome }) => {
  const portal = usePortalCliente();
  const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);
  const [tabelas, setTabelas] = useState<TabelaCotacao[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [regiao, setRegiao] = useState('');
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [paradas, setParadas] = useState<{ id: number; texto: string }[]>([]);
  const [kmRota, setKmRota] = useState<number | null>(null);
  const [duracaoSeg, setDuracaoSeg] = useState<number | null>(null);
  const [proposta, setProposta] = useState<PropostaPortal | null>(null);
  const [passo, setPasso] = useState(0);
  const [etapa, setEtapa] = useState<'parada' | 'animando' | 'proposta'>('parada');
  const [trajeto, setTrajeto] = useState<TrajetoMapa | null>(null);
  const [cena, setCena] = useState<CenaVisual | null>(null);
  const [editando, setEditando] = useState<Record<string, boolean>>({});
  const [carretaPronta, setCarretaPronta] = useState<string | null>(null);
  const [logoPronto, setLogoPronto] = useState<string | null>(null);
  const [operacoes, setOperacoes] = useState<string | null>(null);
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
        .or(filtroDoCliente(clienteNome)))
        .then(({ data, error }) => {
          if (!ativo) return;
          if (error) throw error;
          const lista = ((data || []) as Parameters<typeof tabelaDeLinha>[0][])
            .map((linha) => tabelaDeLinha(linha))
            .filter((linha): linha is TabelaCotacao => linha != null);
          setTabelas(lista);
          const primeira = REGIOES_COTACAO.find((item) => valoresDaRegiao(lista.filter((tabela) => tabela.regiao === item))) || '';
          setRegiao(primeira);
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
        const primeira = REGIOES_COTACAO.find((item) => valoresDaRegiao(lista.filter((tabela) => tabela.regiao === item))) || '';
        setRegiao(primeira);
      })
      .catch((falha: unknown) => {
        if (ativo) setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar a tabela.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => { ativo = false; };
  }, [portal, clienteNome]);

  const regioes = useMemo(
    () => REGIOES_COTACAO.filter((item) => valoresDaRegiao(tabelas.filter((tabela) => tabela.regiao === item))),
    [tabelas],
  );
  const tabela = useMemo(
    () => valoresDaRegiao(tabelas.filter((item) => item.regiao === regiao)),
    [tabelas, regiao],
  );
  const frases = proposta?.acordada ? FRASES_ACORDADA : FRASES_NOVA;
  const podeGerar = Boolean(tabela && origem.trim() && destino.trim() && kmRota != null && kmRota > 0);

  useEffect(() => {
    if (etapa !== 'animando') return;
    if (passo >= frases.length) {
      setEtapa('proposta');
      return;
    }
    const espera = window.setTimeout(() => setPasso((atual) => atual + 1), 1600);
    return () => window.clearTimeout(espera);
  }, [etapa, passo, frases.length]);

  const gerar = () => {
    if (!tabela || kmRota == null) return;
    const nova = montarProposta({
      tabelas,
      regiao,
      origem,
      destino,
      paradas: paradas.map((item) => item.texto),
      kmRota,
      tabelaRegiao: tabela,
    });
    setProposta(nova);
    setPasso(0);
    setEtapa('animando');
  };

  const clienteVisual = clienteNome || portal.marca.rotulo;
  const trechoCurto = origem.trim() && destino.trim() ? `${nomeCurto(origem)} → ${nomeCurto(destino)}` : 'Aguardando a rota';

  useEffect(() => {
    if (!trajeto?.polyline) {
      setCena(null);
      setCarretaPronta(null);
      setLogoPronto(null);
      return;
    }
    let ativo = true;
    const slug = slugVisual(clienteVisual);
    const noPortal = !clienteNome;
    const logoPortal = noPortal && (portal.marca.logo.startsWith('/') || portal.marca.logo.startsWith('https://')) ? portal.marca.logo : null;
    const corPortal = noPortal ? corSegura(portal.marca.css['--portal-marca']) : null;
    const aplicar = async (carreta: string, logo: string | null, gerada: boolean) => {
      if (!ativo) return;
      const mapa = urlMapaEstatico({ polyline: trajeto.polyline, chave: googleMapsApiKey, inicio: trajeto.inicio, fim: trajeto.fim, paradas: trajeto.paradas });
      const marca = logo || logoConhecido(clienteVisual) || logoPortal;
      setCarretaPronta(gerada ? carreta : null);
      setLogoPronto(marca);
      setCena(mapa ? { mapa, carreta, logo: marca, sobreporLogo: Boolean(marca) } : null);
    };
    const trabalhar = async () => {
      const cache = lerCacheCarreta(slug);
      if (cache && await imagemExiste(cache.carreta)) {
        await aplicar(cache.carreta, cache.logo || logoConhecido(clienteVisual) || logoPortal, cache.gerada);
        return;
      }
      const arquivo = `/caminhoes/gerados/${slug}.png?v=1`;
      if (await imagemExiste(arquivo)) {
        const logo = logoConhecido(clienteVisual) || logoPortal;
        gravarCacheCarreta(slug, { carreta: arquivo, logo, gerada: true });
        await aplicar(arquivo, logo, true);
        return;
      }
      try {
        const corpo = JSON.stringify({ cliente: clienteVisual, cor: corPortal });
        const resposta = clienteNome
          ? await authFetch('/api/proposta-escolta/visual', { method: 'POST', body: corpo })
          : await fetch('/api/proposta-escolta/visual', { method: 'POST', headers: { ...portal.cabecalhos(), 'Content-Type': 'application/json' }, body: corpo });
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (!resposta.ok) throw new Error(dados.error || 'visual');
        const logo = (typeof dados.logo === 'string' && dados.logo) || logoConhecido(clienteVisual) || logoPortal;
        const gerada = Boolean(dados.gerada && typeof dados.carreta === 'string' && dados.carreta);
        const carreta = gerada ? String(dados.carreta) : carretaDoCliente(clienteVisual);
        if (gerada) gravarCacheCarreta(slug, { carreta, logo, gerada: true });
        await aplicar(carreta, logo, gerada);
      } catch {
        if (ativo) await aplicar(carretaDoCliente(clienteVisual), logoConhecido(clienteVisual) || logoPortal, false);
      }
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
              <CampoLugar id="origem" valor={origem} placeholder="Origem" cor="bg-emerald-500" onValor={setOrigem} onEditando={marcarEdicao} />
              <button type="button" onClick={() => { setOrigem(destino); setDestino(origem); }} className="z-10 grid h-9 w-9 place-items-center justify-self-center rounded-full border border-slate-200 bg-white text-slate-500 shadow" aria-label="Inverter origem e destino"><ArrowLeftRight size={14} /></button>
              {paradas.map((parada) => (
                <div key={parada.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <CampoLugar id={`parada-${parada.id}`} valor={parada.texto} placeholder="Parada" cor="bg-amber-400" onValor={(texto) => setParadas((lista) => lista.map((item) => item.id === parada.id ? { ...item, texto } : item))} onEditando={marcarEdicao} />
                  </div>
                  <button type="button" onClick={() => setParadas((lista) => lista.filter((item) => item.id !== parada.id))} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500" aria-label="Remover parada"><Trash2 size={16} /></button>
                </div>
              ))}
              <CampoLugar id="destino" valor={destino} placeholder="Destino" cor="bg-red-500" onValor={setDestino} onEditando={marcarEdicao} />
              <button type="button" onClick={() => setParadas((lista) => [...lista, { id: Date.now(), texto: '' }])} className="inline-flex h-10 items-center gap-2 text-sm font-bold text-[#152c54]">
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
            <p className="mt-2 text-2xl font-black capitalize text-slate-900">{regiao ? regiao.toLowerCase() : '—'}</p>
            <p className="truncate text-[11px] text-slate-400">{trechoCurto}</p>
          </article>
        </div>
        <MapaCotacao origem={origem} destino={destino} paradas={paradas.map((item) => item.texto)} cliente={clienteVisual} onRota={(km, segundos) => { setKmRota(km); setDuracaoSeg(segundos); }} onTrajeto={setTrajeto} mapaPronto={isLoaded} mapaErro={Boolean(loadError)} mostrarCarreta={!digitando} carreta={carretaPronta} logo={logoPronto} />
        <button
          type="button"
          onClick={gerar}
          disabled={!podeGerar || etapa !== 'parada'}
          className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-[#10284f] text-sm font-black text-white shadow-[0_14px_28px_rgba(16,40,79,0.35)] motion-safe:transition hover:shadow-[0_16px_32px_rgba(56,189,248,0.28)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FileText size={18} /> Gerar proposta <ArrowRight size={18} />
        </button>
        {!podeGerar && <p className="text-center text-xs font-semibold text-slate-500">{kmRota == null ? 'A rota do Google ainda não fechou.' : 'Escolha a região e os endereços.'}</p>}
      </div>
      {etapa !== 'parada' && proposta && (
        <ExperienciaProposta
          frase={frases[Math.min(passo, frases.length - 1)] || ''}
          mostrando={etapa === 'proposta'}
          proposta={proposta}
          pedido={{ regiao, origem, destino, paradas: paradas.map((item) => item.texto).filter(Boolean), km: kmRota || 0 }}
          clienteInterno={clienteNome}
          cena={cena}
          operacoes={operacoes}
          onFechar={() => { setEtapa('parada'); setProposta(null); setPasso(0); }}
        />
      )}
    </section>
  );
};
