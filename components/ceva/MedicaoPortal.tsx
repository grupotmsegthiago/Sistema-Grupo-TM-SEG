import React, { useEffect, useState } from 'react';
import { DirectionsRenderer, GoogleMap, useLoadScript } from '@react-google-maps/api';
import { googleMapsLoadConfig } from '../../lib/maps';
import { ITENS_MEDICAO, type MedicaoCliente } from '../../lib/portalCliente/medicao';
import type { FotoEvento } from '../../lib/portalCliente/fotosMedicao';
import { relatoMedicao, type TrechoRelato } from '../../lib/portalCliente/relatoMedicao';

export type LinhaMedicao = {
  os: string;
  status: string;
  dataInicio: string | null;
  dataFim: string | null;
  solicitante?: string | null;
  quemAutorizou?: string | null;
  servico: string | null;
  atendimentoPgr?: string | null;
  contrato?: string | null;
  operacao?: string | null;
  tsp?: string | null;
  local: string | null;
  origem?: string | null;
  destino?: string | null;
  franquiaHora: string | null;
  franquiaKm: number | null;
  kmInicio: number | null;
  kmFim: number | null;
  kmRodado: number | null;
  kmExcedente: number | null;
  hrsTrabalhada: string | null;
  hrsExcedente: string | null;
  valorHrsExcedente: number | null;
  valorKmExcedente: number | null;
  valorAcionamento: number | null;
  valorTotal: number | null;
  pedagio: number | null;
  tarifaKm: number | null;
  tarifaHora: number | null;
  placa: string | null;
  motorista: string | null;
  telefone?: string | null;
  identificacao?: string | null;
  obs?: string | null;
  medicao?: { status: string } | null;
};

type Modo = 'analise' | 'conferir';

function reais(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(valor)) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function km(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(valor)) return '—';
  return valor.toLocaleString('pt-BR');
}

function instante(valor: string | null): Date | null {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function hora(valor: string | null): string {
  const data = instante(valor);
  if (!data) return valor || '—';
  return data.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
}

function dia(valor: string | null): string {
  const data = instante(valor);
  if (!data) return '';
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function Campo(props: { rotulo: string; linhas: string[] }) {
  return (
    <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-center px-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{props.rotulo}</p>
      {props.linhas.map((linha, indice) => (
        <p key={`${props.rotulo}-${indice}`} className="truncate text-sm font-black leading-5 tabular-nums text-slate-950">{linha}</p>
      ))}
    </div>
  );
}

function Extra(props: { rotulo: string; cima: string; baixo: string }) {
  return (
    <div className="m-1.5 flex min-h-12 w-28 shrink-0 flex-col justify-center rounded-xl bg-slate-950 px-2.5 text-white">
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{props.rotulo}</p>
      <p className="truncate text-sm font-black leading-5 tabular-nums">{props.cima}</p>
      <p className="truncate text-xs font-black leading-4 text-emerald-400">{props.baixo}</p>
    </div>
  );
}

function Painel(props: { titulo: string; franquia?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-slate-100 p-2">
      <div className="mb-1 flex h-4 items-center justify-between gap-3 px-1">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{props.titulo}</p>
        <p className="truncate text-[11px] font-semibold text-slate-400">{props.franquia ? `Franquia: ${props.franquia}` : ''}</p>
      </div>
      <div className="flex items-stretch rounded-2xl bg-white shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
        {props.children}
      </div>
    </section>
  );
}

function Seta() {
  return <span className="flex w-6 shrink-0 items-center justify-center text-lg text-slate-300" aria-hidden="true">→</span>;
}

function Traco() {
  return <span className="my-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />;
}

function relatoDaOs(linha: LinhaMedicao, origem: string, destino: string): TrechoRelato[] {
  return relatoMedicao({
    os: linha.os,
    status: linha.status,
    servico: linha.servico,
    local: linha.local,
    origem,
    destino,
    dataInicio: linha.dataInicio,
    dataFim: linha.dataFim,
    franquiaHora: linha.franquiaHora,
    franquiaKm: linha.franquiaKm,
    kmInicio: linha.kmInicio,
    kmFim: linha.kmFim,
    kmRodado: linha.kmRodado,
    kmExcedente: linha.kmExcedente,
    hrsTrabalhada: linha.hrsTrabalhada,
    hrsExcedente: linha.hrsExcedente,
    valorHrsExcedente: linha.valorHrsExcedente,
    valorKmExcedente: linha.valorKmExcedente,
    valorAcionamento: linha.valorAcionamento,
    valorTotal: linha.valorTotal,
    pedagio: linha.pedagio,
    tarifaHora: linha.tarifaHora,
    tarifaKm: linha.tarifaKm,
    placa: linha.placa,
    motorista: linha.motorista,
    telefone: linha.telefone || null,
    identificacao: linha.identificacao || null,
    solicitante: linha.solicitante || null,
    quemAutorizou: linha.quemAutorizou || null,
    operacao: linha.operacao || null,
    contrato: linha.contrato || null,
    atendimentoPgr: linha.atendimentoPgr || null,
    tsp: linha.tsp || null,
    obs: linha.obs || null,
  });
}

function RelatoOs(props: { itens: TrechoRelato[] }) {
  if (props.itens.length === 0) return null;
  return (
    <section className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-slate-100 p-2">
      <p className="mb-1 flex h-4 items-center px-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Relato da OS</p>
      <div className="rounded-2xl bg-white px-3 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
        <div className="space-y-1">
          {props.itens.map((item) => (
            <div key={item.rotulo} className="grid grid-cols-[5.6rem_minmax(0,1fr)] items-start gap-x-2">
              <p className="pt-px text-[10px] font-black uppercase tracking-wide text-slate-400">{item.rotulo}</p>
              <p className="text-xs leading-4 text-slate-800">{item.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LinhaValor(props: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className={`flex h-10 items-center justify-between rounded-xl px-4 ${props.forte ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-950'}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{props.rotulo}</p>
      <p className={`font-black tabular-nums ${props.forte ? 'text-xl' : 'text-lg'}`}>{props.valor}</p>
    </div>
  );
}

function kmComUnidade(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(valor)) return '—';
  return `${km(valor)} km`;
}

function texto(valor: string | number | null | undefined): string {
  if (valor == null || valor === '') return '—';
  return String(valor);
}

function quando(valor: string | null): string {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function lerArquivo(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result || ''));
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
}

function MapaRota(props: { origem: string; destino: string }) {
  const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);
  const [rota, setRota] = useState<google.maps.DirectionsResult | null>(null);
  const [falha, setFalha] = useState('');

  useEffect(() => {
    if (!isLoaded || !props.origem || !props.destino) return;
    let ativo = true;
    const servico = new google.maps.DirectionsService();
    servico.route({
      origin: props.origem,
      destination: props.destino,
      travelMode: google.maps.TravelMode.DRIVING,
      region: 'BR',
    }).then((resultado) => {
      if (!ativo) return;
      if (resultado && 'status' in resultado && resultado.status !== 'OK') {
        setFalha('Não foi possível traçar a rota entre a origem e o destino.');
        return;
      }
      setRota(resultado);
    }).catch(() => {
      if (ativo) setFalha('Não foi possível traçar a rota entre a origem e o destino.');
    });
    return () => { ativo = false; };
  }, [isLoaded, props.origem, props.destino]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-2xl bg-slate-200 shadow-[0_12px_24px_rgba(15,23,42,0.22)]">
      {!props.origem || !props.destino ? (
        <p className="flex h-full items-center justify-center px-6 text-center text-sm font-bold text-slate-600">Esta OS não tem origem e destino para o mapa.</p>
      ) : loadError ? (
        <p className="flex h-full items-center justify-center px-6 text-center text-sm font-bold text-slate-600">O mapa não carregou.</p>
      ) : !isLoaded ? (
        <p className="flex h-full items-center justify-center text-sm font-bold text-slate-600">Carregando mapa…</p>
      ) : (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={{ lat: -14.2, lng: -51.9 }}
          zoom={4}
          options={{ disableDefaultUI: true, zoomControl: true, streetViewControl: false, mapTypeControl: false }}
        >
          {rota && (
            <DirectionsRenderer
              directions={rota}
              options={{
                suppressInfoWindows: true,
                polylineOptions: { strokeColor: '#1d4ed8', strokeWeight: 6 },
              }}
            />
          )}
        </GoogleMap>
      )}
      {falha && <p className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow">{falha}</p>}
    </div>
  );
}

function Ponto(props: { letra: string; rotulo: string; texto: string; selo: string }) {
  return (
    <article className="flex min-h-0 flex-col rounded-xl bg-white p-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${props.selo}`}>{props.letra}</span>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{props.rotulo}</p>
      </div>
      <p className="mt-1 line-clamp-3 text-xs font-semibold leading-snug text-slate-900">{props.texto}</p>
    </article>
  );
}

function PontosRota(props: { origem: string; destino: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-stretch">
      <Ponto letra="A" rotulo="Origem" texto={props.origem || '—'} selo="bg-slate-950 text-white" />
      <div className="flex items-center justify-center text-lg text-slate-300" aria-hidden="true">→</div>
      <Ponto letra="B" rotulo="Destino" texto={props.destino || '—'} selo="bg-emerald-500 text-slate-950" />
    </div>
  );
}

const CARTAO = 'min-h-0 rounded-xl bg-white px-2.5 py-1.5 shadow-[0_4px_10px_rgba(15,23,42,0.04)]';

const FOTOS_VAZIAS: FotoEvento[] = [
  { rotulo: 'Origem', url: null },
  { rotulo: 'Fim', url: null },
  { rotulo: 'Km inicial', url: null },
  { rotulo: 'Km final', url: null },
];

function FotosEvento(props: { fotos: FotoEvento[]; onAbrir: (url: string) => void }) {
  return (
    <section className="shrink-0 px-3 pb-2">
      <div className="grid grid-cols-4 gap-2">
        {props.fotos.map((foto) => (
          <button key={foto.rotulo} type="button" disabled={!foto.url} onClick={() => foto.url && props.onAbrir(foto.url)} className="overflow-hidden rounded-xl bg-slate-100 text-left disabled:cursor-default">
            <p className="px-2 pt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{foto.rotulo}</p>
            {foto.url ? (
              <img src={foto.url} alt={foto.rotulo} className="h-16 w-full object-cover" />
            ) : (
              <p className="flex h-16 items-center justify-center px-2 text-center text-[11px] font-semibold text-slate-400">Sem foto gravada</p>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

export function MedicaoPortal(props: {
  linha: LinhaMedicao;
  modo: Modo;
  onFechar: () => void;
  onGravou: (os: string, medicao: MedicaoCliente, aviso: string) => void;
  enviar: (corpo: Record<string, unknown>) => Promise<{ ok?: boolean; error?: string; emailEnviado?: boolean; medicao?: MedicaoCliente | null }>;
  podeReverter?: boolean;
  onReverter?: () => void;
  buscarFotos: (os: string) => Promise<FotoEvento[]>;
}) {
  const { linha } = props;
  const [itens, setItens] = useState<string[]>([]);
  const [justificativa, setJustificativa] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [deAcordo, setDeAcordo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [fotos, setFotos] = useState<FotoEvento[]>(FOTOS_VAZIAS);
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setFotos(FOTOS_VAZIAS);
    setFotoAberta(null);
    props.buscarFotos(linha.os).then((lista) => {
      if (vivo && lista.length === 4) setFotos(lista);
    }).catch(() => undefined);
    return () => { vivo = false; };
  }, [linha.os]);

  const origem = String(linha.origem || '').trim();
  const destino = String(linha.destino || '').trim();

  const detalhes: Array<[string, string]> = [
    ['OS', linha.os],
    ['Status', texto(linha.status)],
    ['Nº interno', texto(linha.identificacao)],
    ['Serviço', texto(linha.servico)],
    ['Solicitante', texto(linha.solicitante)],
    ['Quem autorizou', texto(linha.quemAutorizou)],
    ['Atendimento', texto(linha.atendimentoPgr)],
    ['Contrato', texto(linha.contrato)],
    ['Operação', texto(linha.operacao)],
    ['TSP', texto(linha.tsp)],
    ['Placa', texto(linha.placa)],
    ['Motorista', texto(linha.motorista)],
    ['Telefone', texto(linha.telefone)],
    ['Local', texto(linha.local)],
    ['Km rodado', texto(linha.kmRodado)],
    ['Obs', texto(linha.obs)],
  ];

  async function aprovar() {
    setEnviando(true);
    setErro('');
    try {
      const resposta = await props.enviar({ os: linha.os, acao: 'aprovar', deAcordo: true });
      if (!resposta.ok || !resposta.medicao) {
        setErro(resposta.error || 'Não foi possível aprovar.');
        return;
      }
      props.onGravou(linha.os, resposta.medicao, 'Medição aprovada.');
    } catch {
      setErro('Não foi possível aprovar.');
    } finally {
      setEnviando(false);
    }
  }

  async function conferir() {
    setEnviando(true);
    setErro('');
    try {
      let anexoBase64 = '';
      if (arquivo) {
        if (arquivo.size > 3_000_000) {
          setErro('O anexo passa de 3 MB.');
          setEnviando(false);
          return;
        }
        anexoBase64 = await lerArquivo(arquivo);
      }
      const resposta = await props.enviar({
        os: linha.os,
        acao: 'conferir',
        itens,
        justificativa,
        anexoNome: arquivo?.name || '',
        anexoTipo: arquivo?.type || '',
        anexoBase64,
        detalhes: {
          servico: linha.servico,
          dataInicio: quando(linha.dataInicio),
          dataFim: quando(linha.dataFim),
          local: linha.local,
          origem,
          destino,
          franquiaHora: linha.franquiaHora,
          franquiaKm: linha.franquiaKm,
          kmInicio: linha.kmInicio,
          kmFim: linha.kmFim,
          kmRodado: linha.kmRodado,
          kmExcedente: linha.kmExcedente,
          hrsTrabalhada: linha.hrsTrabalhada,
          hrsExcedente: linha.hrsExcedente,
          valorHrsExcedente: reais(linha.valorHrsExcedente),
          valorKmExcedente: reais(linha.valorKmExcedente),
          valorAcionamento: reais(linha.valorAcionamento),
          pedagio: reais(linha.pedagio),
          tarifaKm: reais(linha.tarifaKm),
          tarifaHora: reais(linha.tarifaHora),
          valorTotal: reais(linha.valorTotal),
        },
      });
      if (!resposta.ok || !resposta.medicao) {
        setErro(resposta.error || 'Não foi possível enviar a conferência.');
        return;
      }
      const aviso = resposta.emailEnviado
        ? 'Pedido de conferência enviado ao financeiro.'
        : 'Pedido gravado. O e-mail ao financeiro não saiu neste momento.';
      props.onGravou(linha.os, resposta.medicao, aviso);
    } catch {
      setErro('Não foi possível enviar a conferência.');
    } finally {
      setEnviando(false);
    }
  }

  function alternar(item: string) {
    setItens((atual) => atual.includes(item) ? atual.filter((escolhido) => escolhido !== item) : [...atual, item]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/70 p-3 backdrop-blur-md" role="dialog" aria-modal="true">
      <div className="relative flex h-full max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-slate-100 via-white to-slate-200 shadow-[0_40px_80px_rgba(2,6,23,0.55),0_12px_0_rgba(15,23,42,0.18)]">
        <div className="flex shrink-0 items-center justify-between gap-4 bg-gradient-to-r from-slate-950 via-slate-800 to-slate-700 px-5 py-3 text-white">
          <div className="flex items-baseline gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">Medição</p>
            <h2 className="text-2xl font-black tracking-tight">GTM-{linha.os}</h2>
          </div>
          <button type="button" onClick={props.onFechar} className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-black">Fechar</button>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
            <div className="space-y-2">
              <LinhaValor rotulo="Acionamento" valor={reais(linha.valorAcionamento)} />
              <Painel titulo="Jornada e horas" franquia={linha.franquiaHora || undefined}>
                <Campo rotulo="Hora inicial" linhas={[dia(linha.dataInicio) || '—', hora(linha.dataInicio)]} />
                <Seta />
                <Campo rotulo="Hora final" linhas={[dia(linha.dataFim) || '—', hora(linha.dataFim)]} />
                <Traco />
                <Campo rotulo="Total" linhas={[texto(linha.hrsTrabalhada)]} />
                <Extra rotulo="Hora extra" cima={texto(linha.hrsExcedente)} baixo={reais(linha.valorHrsExcedente)} />
              </Painel>
              <Painel titulo="Odômetro e quilometragem" franquia={linha.franquiaKm != null ? `${km(linha.franquiaKm)} km` : undefined}>
                <Campo rotulo="Km inicial" linhas={[km(linha.kmInicio)]} />
                <Seta />
                <Campo rotulo="Km final" linhas={[km(linha.kmFim)]} />
                <Traco />
                <Campo rotulo="Km rodado" linhas={[kmComUnidade(linha.kmRodado)]} />
                <Extra rotulo="Km extra" cima={km(linha.kmExcedente)} baixo={reais(linha.valorKmExcedente)} />
              </Painel>
              <LinhaValor rotulo="Pedágio" valor={reais(linha.pedagio)} />
              <LinhaValor rotulo="Total" valor={reais(linha.valorTotal)} forte />
            </div>
            <dl className="grid min-h-0 content-start grid-cols-5 gap-1.5">
              {detalhes.map(([rotulo, valor]) => (
                <div key={rotulo} className={CARTAO}>
                  <dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">{rotulo}</dt>
                  <dd className="mt-0.5 line-clamp-2 text-xs font-semibold leading-4 text-slate-900">{valor}</dd>
                </div>
              ))}
            </dl>
            <RelatoOs itens={relatoDaOs(linha, origem, destino)} />
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <div className="min-h-0 flex-1">
              <MapaRota origem={origem} destino={destino} />
            </div>
            <PontosRota origem={texto(origem || null)} destino={texto(destino || null)} />
          </div>
        </div>
        <FotosEvento fotos={fotos} onAbrir={setFotoAberta} />
        {fotoAberta && (
          <button type="button" className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 p-6" onClick={() => setFotoAberta(null)}>
            <img src={fotoAberta} alt="" className="max-h-full max-w-full rounded-2xl object-contain" onClick={(event) => event.stopPropagation()} />
          </button>
        )}
        <div className="shrink-0 border-t border-slate-200 bg-white/80 px-3 py-2.5">
          {props.modo === 'analise' && (
            <div className="flex flex-col gap-3">
              {linha.medicao?.status === 'conferir' && <p className="text-sm font-bold text-amber-700">Aguarde a modificação da equipe para aprovar.</p>}
              {linha.medicao?.status === 'modificado' && <p className="text-sm font-bold text-amber-700">Modificação realizada. Marque a declaração para aprovar.</p>}
              <div className="flex items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 shadow-[0_14px_28px_rgba(15,23,42,0.28)]">
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input type="checkbox" className="peer sr-only" checked={deAcordo} onChange={(event) => setDeAcordo(event.target.checked)} disabled={linha.medicao?.status === 'conferir' || linha.medicao?.status === 'aprovado'} />
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-slate-500 text-sm font-black text-slate-950 peer-checked:border-emerald-400 peer-checked:bg-emerald-400">{deAcordo ? '✓' : ''}</span>
                  <span className="text-sm leading-snug text-slate-300">
                    <strong className="text-white">Declaração de Conformidade:</strong> Certifico que conferi a quilometragem, tempo e valor de <strong className="text-emerald-400">{reais(linha.valorTotal)}</strong>.
                  </span>
                </label>
                <div className="flex shrink-0 items-center gap-3">
                  {props.podeReverter && (
                    <button type="button" disabled={enviando} onClick={props.onReverter} className="h-11 rounded-full bg-white px-5 text-sm font-black text-slate-900">Voltar para verificar</button>
                  )}
                  <button type="button" disabled={enviando || !deAcordo || linha.medicao?.status === 'conferir' || linha.medicao?.status === 'aprovado'} onClick={aprovar} className="h-11 rounded-full bg-emerald-500 px-6 text-sm font-black text-slate-950 shadow-[0_10px_20px_rgba(16,185,129,0.35)] disabled:opacity-40">Aprovar</button>
                </div>
              </div>
            </div>
          )}
          {props.modo === 'conferir' && (
            <div className="space-y-3">
              <p className="text-sm font-black text-slate-800">O que não foi aprovado</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {ITENS_MEDICAO.map((item) => (
                  <label key={item} className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_14px_rgba(15,23,42,0.06)]">
                    <input type="checkbox" checked={itens.includes(item)} onChange={() => alternar(item)} />
                    {item}
                  </label>
                ))}
              </div>
              <label className="block text-sm font-black text-slate-800">Justificativa
                <textarea value={justificativa} onChange={(event) => setJustificativa(event.target.value)} rows={3} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 font-normal shadow-inner" />
              </label>
              <div className="flex flex-nowrap items-center justify-between gap-3">
                <label className="text-sm font-black text-slate-800">Anexo
                  <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setArquivo(event.target.files?.[0] || null)} className="mt-1 block text-sm font-normal" />
                </label>
                <button type="button" disabled={enviando} onClick={conferir} className="h-11 shrink-0 rounded-full bg-amber-400 px-6 text-sm font-black text-slate-950 shadow-[0_10px_20px_rgba(251,191,36,0.45)] disabled:opacity-50">{enviando ? 'Enviando…' : 'Enviar conferência'}</button>
              </div>
            </div>
          )}
          {erro && <p className="mt-3 text-sm font-bold text-red-600">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
