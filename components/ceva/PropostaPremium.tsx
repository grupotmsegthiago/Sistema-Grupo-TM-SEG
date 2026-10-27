import React, { useEffect, useState } from 'react';
import { CLIENTES_TMSEG, DIFERENCIAIS_TMSEG, MARCA_TMSEG, SERVICOS_TMSEG, AVISO_PEDAGIO } from '../../lib/portalCliente/apresentacao';
import type { PropostaPortal } from '../../lib/portalCliente/cotacao';
import type { CenaVisual } from '../../lib/portalCliente/frotaVisual';
import { dadosDaProposta, type DadosProposta } from '../../lib/portalCliente/dadosProposta';
import { cenaOficial, textoDuracaoViagem, type ImagensPremium } from '../../lib/portalCliente/propostaPremium';
import { rotuloCidadeUf, tituloCidade } from '../../lib/portalCliente/rotaCotacao';
import { CenaRotaVisual } from './ClientTruckVisual';

function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function numero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function Foto(props: { src?: string | null; reserva?: string | null; className?: string; alt: string; onVazio?: () => void }) {
  const [atual, setAtual] = useState(props.src || props.reserva || '');
  useEffect(() => {
    setAtual(props.src || props.reserva || '');
  }, [props.src, props.reserva]);
  if (!atual) return null;
  return (
    <img
      src={atual}
      alt={props.alt}
      className={props.className}
      onError={() => {
        if (props.reserva && atual !== props.reserva) {
          setAtual(props.reserva);
          return;
        }
        setAtual('');
        props.onVazio?.();
      }}
    />
  );
}

function Circulo(props: { children: React.ReactNode }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d0121a] text-white shadow-[0_6px_14px_rgba(208,18,26,0.4)]">
      {props.children}
    </span>
  );
}

function IconeMetrica(props: { indice: number }) {
  const comum = { viewBox: '0 0 24 24', className: 'h-4 w-4', 'aria-hidden': true } as const;
  if (props.indice === 0) {
    return (
      <svg {...comum}>
        <path fill="currentColor" d="M4 19h16v2H2V3h2v16zm3-3h2V9H7v7zm4 0h2V5h-2v11zm4 0h2v-6h-2v6z" />
      </svg>
    );
  }
  if (props.indice === 1) {
    return (
      <svg {...comum}>
        <path fill="currentColor" d="M12 2a10 10 0 1 0 .01 20.01A10 10 0 0 0 12 2zm1 11h4v-2h-3V6h-2v7z" />
      </svg>
    );
  }
  if (props.indice === 2) return <Escudo />;
  return (
    <svg {...comum}>
      <path fill="currentColor" d="M9 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm7 1a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM9 14c-3.3 0-6 1.6-6 3.5V20h12v-2.5C15 15.6 12.3 14 9 14zm7 .5c-.4 0-.8 0-1.2.1 1.3.9 2.2 2.1 2.2 3.4V20h6v-2C23 16.1 20.3 14.5 16 14.5z" />
    </svg>
  );
}

function Celula(props: { rotulo: string; valor: string; teste?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-2.5 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">{props.rotulo}</p>
      <p className="mt-1 text-sm font-semibold leading-none" data-testid={props.teste}>{props.valor}</p>
    </div>
  );
}

function Escudo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 8.4 8 11 4.6-2.6 8-6 8-11V5l-8-3z" />
    </svg>
  );
}

function Viatura(props: { className?: string }) {
  return (
    <svg viewBox="0 0 86 36" className={props.className || 'h-8 w-20'} aria-hidden="true">
      <rect x="8" y="14" width="70" height="14" rx="4" fill="#111827" />
      <path d="M20 14 28 6h28l8 8" fill="#1f2937" />
      <rect x="36" y="3" width="14" height="4" rx="1" fill="#f59e0b" />
      <circle cx="24" cy="28" r="4" fill="#0f172a" stroke="#94a3b8" />
      <circle cx="64" cy="28" r="4" fill="#0f172a" stroke="#94a3b8" />
    </svg>
  );
}

function IconeDiferencial(props: { indice: number }) {
  const comum = { viewBox: '0 0 24 24', className: 'h-5 w-5', 'aria-hidden': true } as const;
  if (props.indice === 1) {
    return (
      <svg {...comum}>
        <path fill="none" stroke="currentColor" strokeWidth="1.7" d="M4 15c2-1 4-4 8-4s6 3 8 4" />
        <circle cx="8" cy="16.5" r="1.4" fill="currentColor" />
        <circle cx="16" cy="16.5" r="1.4" fill="currentColor" />
        <path fill="currentColor" d="M12 4 7 6.2v3.2c0 2.4 1.8 4.2 5 5.6 3.2-1.4 5-3.2 5-5.6V6.2L12 4z" />
      </svg>
    );
  }
  if (props.indice === 2) {
    return (
      <svg {...comum}>
        <circle cx="12" cy="12" r="2" fill="currentColor" />
        <path fill="none" stroke="currentColor" strokeWidth="1.7" d="M12 5a7 7 0 0 1 7 7M12 2.5a9.5 9.5 0 0 1 9.5 9.5M7.2 16.8 5 21" />
      </svg>
    );
  }
  if (props.indice === 3) {
    return (
      <svg {...comum}>
        <path fill="currentColor" d="M3 15h6l1.2-2.2H14L16 15h5v2H3v-2z" />
        <path fill="currentColor" d="M5 13 8 8h5l2 3H8.2L7 13H5z" />
        <circle cx="7.5" cy="17.5" r="1.3" fill="#07080d" />
        <circle cx="17" cy="17.5" r="1.3" fill="#07080d" />
      </svg>
    );
  }
  return (
    <svg {...comum}>
      <path fill="currentColor" d="M12 2 5 5.2v6.1c0 4.2 2.8 7.2 7 9.2 4.2-2 7-5 7-9.2V5.2L12 2z" />
      <path fill="none" stroke="#07080d" strokeWidth="1.7" d="m8.5 12 2.2 2.2 4.3-4.4" />
    </svg>
  );
}

const RESERVA_SERVICO: Record<string, string | null> = {
  'Fiscal de rota': '/proposta-tmseg/service-fiscal-rota.png',
  'Intermediação de escolta armada': '/proposta-tmseg/service-escolta.png',
  'Acompanhamento logístico': '/proposta-tmseg/service-acompanhamento.png',
  Guincho: '/proposta-tmseg/service-guincho.png',
};

const CHAVE_SERVICO = ['fiscal', 'escolta', 'acompanhamento', 'guincho'] as const;

export const PropostaPremium: React.FC<{
  cliente: string;
  caminho: string;
  tabela: string;
  rota: string;
  regiao: string;
  data: string;
  validade?: string;
  proposta: PropostaPortal;
  dados?: DadosProposta | null;
  cena?: CenaVisual | null;
  printMapa?: string | null;
  mapaLimpo?: string | null;
  hero?: string | null;
  pecas?: Partial<ImagensPremium> | null;
  operacoes?: string | null;
  operacoesRealizadas?: string | null;
  parceiros?: string | null;
  linkPublico?: boolean;
  altMapa: string;
}> = ({ cliente, caminho, tabela, rota, regiao, data, validade, proposta, dados: dadosInformados, cena, printMapa, mapaLimpo, hero, pecas, operacoesRealizadas, parceiros, linkPublico, altMapa }) => {
  const oficial = cenaOficial(cliente);
  const origem = tituloCidade(proposta.origem);
  const destino = tituloCidade(proposta.destino);
  const mapa = mapaLimpo || (!printMapa ? (cena?.mapa || '') : '');
  const carreta = cena?.carreta || oficial.recorte;
  const logo = cena?.logo || oficial.logo;
  const capa = pecas?.capa || hero || null;
  const capaMarca = ['ceva', 'dhl', 'ibl'].includes(oficial.slug) ? `/propostas-premium/capas/${oficial.slug}.webp` : '';
  const [capaFalhou, setCapaFalhou] = useState(false);
  const [marcaFalhou, setMarcaFalhou] = useState(false);
  useEffect(() => { setCapaFalhou(false); setMarcaFalhou(false); }, [capa, capaMarca]);
  const fundoPedido = capa && !capaFalhou ? capa : '';
  const fundo = fundoPedido || (marcaFalhou ? '' : capaMarca);
  const marcos = [origem, ...proposta.paradas.map((item) => rotuloCidadeUf(item)).filter((item) => item && item !== '—'), destino];
  const fonte = { fontFamily: 'Oswald, sans-serif' } as const;
  const operacoesTexto = operacoesRealizadas || '—';
  const parceirosTexto = parceiros || '—';
  const dados = dadosInformados ?? dadosDaProposta(proposta);
  const tempoViagem = textoDuracaoViagem(dados.tempoMin ?? proposta.duracaoMin);
  const kmMostrado = dados.distanciaKm;
  const celulas: Array<{ rotulo: string; valor: string; teste?: string }> = [
    { rotulo: 'Total', valor: reais(dados.total), teste: 'proposta-total' },
    { rotulo: 'KM faturado', valor: numero(dados.kmFaturado), teste: 'proposta-km' },
    { rotulo: 'Horas', valor: numero(dados.horas), teste: 'proposta-horas' },
    { rotulo: 'Franquia de km', valor: numero(dados.franquiaKm) },
    { rotulo: 'Franquia de horas', valor: numero(dados.franquiaHoras) },
    { rotulo: 'Valor do km extra', valor: reais(dados.kmExtra) },
    { rotulo: 'Valor da hora extra', valor: reais(dados.horaExtra) },
    ...(kmMostrado != null ? [{ rotulo: 'KM na rota', valor: `${numero(kmMostrado)} km` }] : []),
    ...(tempoViagem ? [{ rotulo: 'Tempo estimado', valor: tempoViagem }] : []),
  ];

  return (
    <div data-testid="proposta-premium" className="proposta-container mx-auto flex w-full max-w-[980px] flex-col gap-3 bg-[#07090e] px-3 py-3 text-white">
      <header data-proposta-bloco className="cabecalho-proposta flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <img src="/marca-grupotmseg.webp" alt="Grupo TM SEG" className="h-11 w-auto" />
        <p className="text-center text-[10px] font-semibold uppercase leading-4 tracking-[0.18em] text-white/80" style={fonte}>
          Escolta armada<br />Pronta resposta<br />Gestão integrada
        </p>
        <div className="flex items-center gap-2">
          {logo ? <img src={logo} alt="" className="h-8 w-auto rounded bg-white px-1.5 py-0.5 object-contain" /> : null}
          <div className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-right text-[10px]">
            {linkPublico ? <p className="font-semibold text-white/75">Visualização da proposta</p> : null}
            <p className="font-semibold text-white">{validade ? `Válida até ${validade}` : 'Validade da proposta: 10 dias'}</p>
          </div>
        </div>
      </header>

      <section data-proposta-bloco className="hero-proposta secao-bloco relative min-h-[248px] overflow-hidden rounded-2xl">
        {fundo ? (
          <Foto src={fundo} reserva={fundoPedido ? capaMarca : undefined} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[72%_center]" onVazio={() => { if (fundoPedido) setCapaFalhou(true); else setMarcaFalhou(true); }} />
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_42%,rgba(208,18,26,0.42),transparent_46%),linear-gradient(90deg,#07090e,#141820)]" />
        )}
        {!fundo ? (
          <figure className="banner-caminhao pointer-events-none absolute inset-y-0 right-0 w-[46%]">
            <img src={oficial.veiculo} alt="" className="caminhao-proposta absolute bottom-2 right-2 h-44 w-auto max-w-full object-contain" />
            <Viatura className="absolute bottom-3 right-3 h-8 w-20" />
          </figure>
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#07090e] via-[#07090e]/82 to-[#07090e]/10" />
        <div className="grade-hero relative z-10 max-w-[560px] px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d0121a]" style={fonte}>Proposta comercial</p>
          <h2 className="mt-1 text-3xl font-semibold uppercase leading-[0.95] sm:text-4xl" style={fonte}>{origem}<span className="mx-2 text-[#d0121a]">→</span>{destino}</h2>
          <p className="mt-1 line-clamp-1 text-[11px] text-white/50">{caminho}</p>
          <p className="mt-1 text-xs text-white/75">{regiao} · {data}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <p className="rounded-xl border border-white/10 bg-black/50 px-2.5 py-1.5 text-[10px]"><span className="block uppercase tracking-wide text-white/50">Data prevista</span><span className="mt-0.5 block font-semibold">{data}</span></p>
            <p className="max-w-[180px] rounded-xl border border-white/10 bg-black/50 px-2.5 py-1.5 text-[10px]" data-testid="nome-tabela-vigencia"><span className="block uppercase tracking-wide text-white/50">Tabela utilizada</span><span className="mt-0.5 line-clamp-2 block font-semibold">{tabela}</span></p>
            <p className="max-w-[180px] rounded-xl border border-white/10 bg-black/50 px-2.5 py-1.5 text-[10px]" data-testid="nome-rota-vigencia"><span className="block uppercase tracking-wide text-white/50">Rota</span><span className="mt-0.5 line-clamp-2 block font-semibold">{rota}</span></p>
          </div>
        </div>
      </section>

      <section data-proposta-bloco className="grade-quatro secao-bloco grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { valor: operacoesTexto, rotulo: 'Operações realizadas', teste: 'indicador-operacoes' },
          { valor: '24/7', rotulo: 'Atendimento', teste: 'indicador-atendimento' },
          { valor: '100%', rotulo: 'Compromisso', teste: 'indicador-compromisso' },
          { valor: parceirosTexto, rotulo: 'Parceiros ativos', teste: 'indicador-parceiros' },
        ].map((item, indice) => (
          <div key={item.rotulo} data-testid={item.teste} className="card-metrica flex items-center gap-2 rounded-2xl border border-white/10 bg-[#12151c] px-3 py-2.5">
            <Circulo><IconeMetrica indice={indice} /></Circulo>
            <div>
              <p className="text-2xl font-semibold leading-none text-white" style={fonte}>{item.valor}</p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-white/55">{item.rotulo}</p>
            </div>
          </div>
        ))}
      </section>

      <section data-proposta-bloco data-proposta-mapa="1">
        <div className="secao-bloco overflow-hidden rounded-2xl border border-[#d0121a]/45 bg-[#10141c]">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d0121a]" style={fonte}>Rota da operação</p>
              <p className="mt-1 max-w-xl text-sm font-semibold">{rota}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {kmMostrado != null ? (
                <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"><span className="block text-[10px] uppercase text-white/50">Distância aproximada</span><span className="text-base font-semibold">{numero(kmMostrado)} km</span></p>
              ) : null}
              {tempoViagem ? (
                <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"><span className="block text-[10px] uppercase text-white/50">Tempo estimado</span><span className="text-base font-semibold">{tempoViagem}</span></p>
              ) : null}
              <p className="rounded-full border border-[#d0121a]/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-white">Rota calculada</p>
            </div>
          </div>
          {mapa ? (
            <figure className="mapa-perspectiva px-3 pb-3">
              <div className="overflow-hidden rounded-xl">
                <CenaRotaVisual mapa={mapa} carreta={carreta} logo={logo} faixa={false} />
              </div>
              <figcaption className="mt-2 text-[10px] text-white/45">Mapa: Google. O traçado vermelho é o da rota calculada.</figcaption>
            </figure>
          ) : printMapa ? (
            <figure className="px-3 pb-2">
              <img src={printMapa} alt={altMapa} className="block h-auto w-full rounded-xl object-cover" />
              <figcaption className="mt-2 text-[10px] text-white/45">Mapa: Google. O traçado é o da rota calculada.</figcaption>
            </figure>
          ) : (
            <p className="px-4 pb-4 text-sm text-white/60">O mapa da rota aparece quando o Google devolve o trajeto.</p>
          )}
          <div className="grade-origem grid gap-3 px-4 pb-3 sm:grid-cols-2">
            <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs"><span className="block text-[10px] uppercase tracking-wide text-emerald-400">Origem</span><span className="mt-1 block font-semibold">{proposta.origem}</span></p>
            <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs"><span className="block text-[10px] uppercase tracking-wide text-[#d0121a]">Destino</span><span className="mt-1 block font-semibold">{proposta.destino}</span></p>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-[11px] text-white/80">
            {marcos.map((marco, indice) => (
              <React.Fragment key={`${marco}-${indice}`}>
                {indice > 0 ? <span className="h-px min-w-6 flex-1 bg-gradient-to-r from-[#d0121a] to-white/30" /> : null}
                <span className="font-semibold">{marco}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      <section data-proposta-bloco className="grade-empresa secao-bloco grid items-center gap-3 lg:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d0121a]" style={fonte}>A empresa</p>
          <h3 className="mt-1 text-2xl font-semibold" style={fonte}>Quem acompanha a carga</h3>
          <p className="mt-2 text-xs leading-5 text-white/75">{MARCA_TMSEG.quem}</p>
          <p className="mt-2 text-xs leading-5 text-white/75">{MARCA_TMSEG.missao}</p>
        </div>
        <Foto
          src={pecas?.central}
          reserva="/proposta-tmseg/about-team-original.webp"
          alt=""
          className="foto-empresa h-44 w-full rounded-2xl border border-white/10 object-cover"
        />
      </section>

      <section data-proposta-bloco>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d0121a]" style={fonte}>Nossos serviços</p>
        <div className="grade-quatro mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {SERVICOS_TMSEG.map((item, indice) => (
            <article key={item.titulo} className="card-servico secao-bloco overflow-hidden rounded-2xl border border-white/10 bg-[#12151c]">
              <Foto
                src={pecas?.[CHAVE_SERVICO[indice]]}
                reserva={RESERVA_SERVICO[item.titulo]}
                alt=""
                className="foto-servico h-28 w-full object-cover"
              />
              <div className="px-3 py-3">
                <Circulo><Escudo /></Circulo>
                <h4 className="mt-2 text-sm font-semibold">{item.titulo}</h4>
                <p className="mt-1 text-[11px] leading-4 text-white/65">{item.texto}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section data-proposta-bloco>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d0121a]" style={fonte}>Diferenciais</p>
        <div className="grade-quatro mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {DIFERENCIAIS_TMSEG.map((item, indice) => (
            <article key={item.titulo} className="card-diferencial secao-bloco rounded-2xl border border-white/10 bg-[#12151c] px-3 py-3">
              <Circulo><IconeDiferencial indice={indice} /></Circulo>
              <h4 className="mt-2 text-sm font-semibold">{item.titulo}</h4>
              <p className="mt-1 text-[11px] leading-4 text-white/65">{item.texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section data-proposta-bloco className="grade-comercial secao-bloco grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d0121a]" style={fonte}>Empresas que operam com a TM SEG</p>
          <div className="grade-logos mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {CLIENTES_TMSEG.map((item) => (
              <div key={item.nome} className="grid h-12 place-items-center rounded-xl border border-white/10 bg-[#10131a] px-2">
                <img src={item.logo} alt={item.nome} className="max-h-7 max-w-full object-contain" />
              </div>
            ))}
          </div>
        </div>
        <div className="card-comercial rounded-2xl border border-[#d0121a]/40 bg-[#10131a] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d0121a]" style={fonte}>Condições comerciais</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {celulas.map((item) => <Celula key={item.rotulo} rotulo={item.rotulo} valor={item.valor} teste={item.teste} />)}
          </div>
          {dados.mostraFranquiaIncluida ? (
            <p className="mt-2 text-[11px] text-white/75" data-testid="proposta-franquia-incluida">Franquia incluída: {numero(dados.franquiaKm)} km e {numero(dados.franquiaHoras)} h.</p>
          ) : null}
          {dados.pernoite != null ? (
            <p className="mt-2 text-[11px] text-white/80">Pernoite: {reais(dados.pernoite)}</p>
          ) : null}
          <p className="mt-2 text-[11px] font-semibold">Tipo de escolta: escolta armada</p>
          <p className="mt-2 border-l-4 border-[#d0121a] pl-2 text-[11px] leading-4 text-white/70">{AVISO_PEDAGIO}</p>
          <p className="mt-2 text-[11px] text-white/60">Validade da proposta: 10 dias. {MARCA_TMSEG.chamada}</p>
          {proposta.acordada ? <p className="mt-2 text-[11px] text-white/70">Esta rota já está acordada na tabela do cliente.</p> : null}
        </div>
      </section>
    </div>
  );
};
