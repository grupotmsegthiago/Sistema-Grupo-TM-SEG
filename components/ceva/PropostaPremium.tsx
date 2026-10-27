import React, { useEffect, useState } from 'react';
import { CLIENTES_TMSEG, DIFERENCIAIS_TMSEG, MARCA_TMSEG, SERVICOS_TMSEG, AVISO_PEDAGIO } from '../../lib/portalCliente/apresentacao';
import type { PropostaPortal } from '../../lib/portalCliente/cotacao';
import type { CenaVisual } from '../../lib/portalCliente/frotaVisual';
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
    <span className="grid h-11 w-11 place-items-center rounded-full bg-[#d0121a] text-white shadow-[0_8px_18px_rgba(208,18,26,0.45)]">
      {props.children}
    </span>
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
  tela: {
    total: number;
    kmFaturado: number;
    horas: number;
    franquiaKm: number;
    franquiaHoras: number;
    kmExtra: number;
    horaExtra: number;
    pernoite: number | null;
    mostraFranquiaIncluida: boolean;
  };
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
}> = ({ cliente, caminho, tabela, rota, regiao, data, validade, proposta, tela, cena, printMapa, mapaLimpo, hero, pecas, operacoesRealizadas, parceiros, linkPublico, altMapa }) => {
  const oficial = cenaOficial(cliente);
  const origem = tituloCidade(proposta.origem);
  const destino = tituloCidade(proposta.destino);
  const mapa = mapaLimpo || (!printMapa ? (cena?.mapa || '') : '');
  const carreta = cena?.carreta || oficial.recorte;
  const logo = cena?.logo || oficial.logo;
  const capa = pecas?.capa || hero || null;
  const [capaFalhou, setCapaFalhou] = useState(false);
  useEffect(() => { setCapaFalhou(false); }, [capa]);
  const fundo = capa && !capaFalhou ? capa : '';
  const marcos = [origem, ...proposta.paradas.map((item) => rotuloCidadeUf(item)).filter((item) => item && item !== '—'), destino];
  const fonte = { fontFamily: 'Oswald, sans-serif' } as const;
  const operacoesTexto = operacoesRealizadas || '—';
  const parceirosTexto = parceiros || '—';
  const tempoViagem = textoDuracaoViagem(proposta.duracaoMin);

  return (
    <div data-testid="proposta-premium" className="bg-[#07080d] text-white">
      <header data-proposta-bloco className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-8">
        <img src="/marca-grupotmseg.webp" alt="Grupo TM SEG" className="h-14 w-auto" />
        <p className="text-center text-[11px] font-semibold uppercase leading-5 tracking-[0.22em] text-white/85" style={fonte}>
          Escolta armada<br />Pronta resposta<br />Gestão integrada
        </p>
        <div className="rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-2 text-right text-[11px]">
          {linkPublico ? <p className="font-semibold text-white/80">Visualização da proposta</p> : null}
          <p className="font-semibold text-white">{validade ? `Válida até ${validade}` : 'Validade da proposta: 10 dias'}</p>
          {linkPublico ? <p className="text-white/55">Este link não abre o restante do sistema.</p> : null}
        </div>
      </header>

      <section data-proposta-bloco className="relative min-h-[440px] overflow-hidden px-5 pb-6 pt-6 sm:px-8">
        {fundo ? (
          <Foto src={fundo} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right" onVazio={() => setCapaFalhou(true)} />
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_42%,rgba(208,18,26,0.42),transparent_46%),linear-gradient(90deg,#07080d,#141820)]" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#07080d] via-[#07080d]/78 to-transparent" />
        <div className="relative grid items-end gap-4 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[#d0121a]" style={fonte}>Proposta comercial</p>
            <h2 className="mt-2 max-w-xl text-4xl font-semibold uppercase leading-[0.95] sm:text-6xl" style={fonte}>{origem}<span className="mx-2 text-[#d0121a]">→</span>{destino}</h2>
            <p className="mt-2 line-clamp-1 max-w-xl text-[11px] text-white/45">{caminho}</p>
            <p className="mt-2 text-sm text-white/70">{regiao} · {data}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <p className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-[11px] backdrop-blur-sm"><span className="block text-[10px] uppercase tracking-wide text-white/50">Data prevista</span><span className="mt-0.5 block font-semibold">{data}</span></p>
              <p className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-[11px] backdrop-blur-sm" data-testid="nome-tabela-vigencia"><span className="block text-[10px] uppercase tracking-wide text-white/50">Tabela utilizada</span><span className="mt-0.5 line-clamp-2 block font-semibold">{tabela}</span></p>
              <p className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-[11px] backdrop-blur-sm" data-testid="nome-rota-vigencia"><span className="block text-[10px] uppercase tracking-wide text-white/50">Rota</span><span className="mt-0.5 line-clamp-2 block font-semibold">{rota}</span></p>
            </div>
          </div>
          <figure className="relative min-h-[240px] sm:min-h-[300px]">
            <div className="absolute bottom-4 right-2 z-10 drop-shadow-[0_18px_18px_rgba(0,0,0,0.65)]"><Viatura className="h-12 w-28 sm:h-16 sm:w-36" /></div>
            <img src={oficial.veiculo} alt="" className="relative z-0 ml-auto h-64 w-auto max-w-full object-contain drop-shadow-[0_28px_28px_rgba(0,0,0,0.7)] sm:h-80" />
            {logo ? <img src={logo} alt="" className="absolute bottom-16 right-[18%] z-20 h-9 w-auto rounded bg-white px-1.5 py-0.5 object-contain shadow-lg" /> : null}
          </figure>
        </div>
      </section>

      <section data-proposta-bloco className="grid gap-3 px-5 pb-8 sm:grid-cols-4 sm:px-8">
        {[
          { valor: operacoesTexto, rotulo: 'Operações realizadas', teste: 'indicador-operacoes' },
          { valor: '24/7', rotulo: 'Atendimento', teste: 'indicador-atendimento' },
          { valor: '100%', rotulo: 'Compromisso', teste: 'indicador-compromisso' },
          { valor: parceirosTexto, rotulo: 'Parceiros ativos', teste: 'indicador-parceiros' },
        ].map((item) => (
          <div key={item.rotulo} data-testid={item.teste} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <Circulo><Escudo /></Circulo>
            <div>
              <p className="text-3xl font-semibold leading-none text-white" style={fonte}>{item.valor}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/55">{item.rotulo}</p>
            </div>
          </div>
        ))}
      </section>

      <section data-proposta-bloco data-proposta-mapa="1" className="px-5 pb-8 sm:px-8">
        <div className="overflow-hidden rounded-[28px] border border-[#d0121a]/50 bg-[#0c1018] shadow-[0_0_40px_rgba(208,18,26,0.18)]">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d0121a]" style={fonte}>Rota da operação</p>
              <p className="mt-1 max-w-xl text-sm font-semibold">{rota}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {proposta.kmRota != null && proposta.kmRota > 0 ? (
                <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"><span className="block text-[10px] uppercase text-white/50">Distância aproximada</span><span className="text-base font-semibold">{numero(proposta.kmRota)} km</span></p>
              ) : null}
              {tempoViagem ? (
                <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"><span className="block text-[10px] uppercase text-white/50">Tempo estimado</span><span className="text-base font-semibold">{tempoViagem}</span></p>
              ) : null}
              <p className="rounded-full border border-[#d0121a]/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-white">Rota calculada</p>
            </div>
          </div>
          {mapa ? (
            <figure className="px-4 pb-4 [perspective:1400px]">
              <div className="origin-bottom overflow-hidden rounded-2xl shadow-[0_36px_70px_rgba(0,0,0,0.55),0_0_36px_rgba(208,18,26,0.28)] [transform:rotateX(18deg)]">
                <CenaRotaVisual mapa={mapa} carreta={carreta} logo={logo} faixa={false} />
              </div>
              <figcaption className="mt-3 text-[10px] text-white/45">Mapa: Google. O traçado vermelho é o da rota calculada.</figcaption>
            </figure>
          ) : printMapa ? (
            <figure className="px-4 pb-2">
              <img src={printMapa} alt={altMapa} className="block h-auto w-full rounded-2xl object-contain" />
              <figcaption className="mt-2 text-[10px] text-white/45">Mapa: Google. O traçado é o da rota calculada.</figcaption>
            </figure>
          ) : (
            <p className="px-5 pb-5 text-sm text-white/60">O mapa da rota aparece quando o Google devolve o trajeto.</p>
          )}
          <div className="grid gap-3 px-5 pb-4 sm:grid-cols-2">
            <p className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-xs"><span className="block text-[10px] uppercase tracking-wide text-emerald-400">Origem</span><span className="mt-1 block font-semibold">{proposta.origem}</span></p>
            <p className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-xs"><span className="block text-[10px] uppercase tracking-wide text-[#d0121a]">Destino</span><span className="mt-1 block font-semibold">{proposta.destino}</span></p>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-5 pb-5 text-[11px] text-white/80">
            {marcos.map((marco, indice) => (
              <React.Fragment key={`${marco}-${indice}`}>
                {indice > 0 ? <span className="h-px min-w-6 flex-1 bg-gradient-to-r from-[#d0121a] to-white/30" /> : null}
                <span className="font-semibold">{marco}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      <section data-proposta-bloco className="grid items-center gap-6 px-5 pb-10 sm:px-8 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d0121a]" style={fonte}>A empresa</p>
          <h3 className="mt-2 text-3xl font-semibold" style={fonte}>Quem acompanha a carga</h3>
          <p className="mt-4 text-sm leading-6 text-white/75">{MARCA_TMSEG.quem}</p>
          <p className="mt-3 text-sm leading-6 text-white/75">{MARCA_TMSEG.missao}</p>
        </div>
        <Foto
          src={pecas?.central}
          reserva="/proposta-tmseg/about-team-original.webp"
          alt=""
          className="h-72 w-full rounded-[28px] border border-white/10 object-cover"
        />
      </section>

      <section data-proposta-bloco className="px-5 pb-10 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d0121a]" style={fonte}>Nossos serviços</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICOS_TMSEG.map((item, indice) => (
            <article key={item.titulo} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
              <Foto
                src={pecas?.[CHAVE_SERVICO[indice]]}
                reserva={RESERVA_SERVICO[item.titulo]}
                alt=""
                className="h-44 w-full object-cover"
              />
              <div className="px-4 py-4">
                <Circulo><Escudo /></Circulo>
                <h4 className="mt-3 text-base font-semibold">{item.titulo}</h4>
                <p className="mt-2 text-xs leading-5 text-white/65">{item.texto}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section data-proposta-bloco className="px-5 pb-10 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d0121a]" style={fonte}>Diferenciais</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DIFERENCIAIS_TMSEG.map((item, indice) => (
            <article key={item.titulo} className="rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <Circulo><IconeDiferencial indice={indice} /></Circulo>
              <h4 className="mt-3 text-base font-semibold">{item.titulo}</h4>
              <p className="mt-2 text-xs leading-5 text-white/65">{item.texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section data-proposta-bloco className="grid gap-6 px-5 pb-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d0121a]" style={fonte}>Empresas que operam com a TM SEG</p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {CLIENTES_TMSEG.map((item) => (
              <div key={item.nome} className="grid h-16 place-items-center rounded-2xl border border-white/10 bg-[#10131a] px-2">
                <img src={item.logo} alt={item.nome} className="max-h-8 max-w-full object-contain" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[28px] border border-[#d0121a]/40 bg-[#10131a] px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d0121a]" style={fonte}>Condições comerciais</p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Total</p>
              <p className="mt-1 text-2xl font-semibold" data-testid="proposta-total">{reais(tela.total)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Franquia de km</p>
              <p className="mt-1 text-2xl font-semibold">{numero(tela.franquiaKm)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Franquia de horas</p>
              <p className="mt-1 text-2xl font-semibold">{numero(tela.franquiaHoras)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <p><span className="block text-[10px] uppercase tracking-[0.14em] text-white/45">Valor do km extra</span><span className="mt-1 block text-xl font-semibold">{reais(tela.kmExtra)}</span></p>
            <p><span className="block text-[10px] uppercase tracking-[0.14em] text-white/45">Valor da hora extra</span><span className="mt-1 block text-xl font-semibold">{reais(tela.horaExtra)}</span></p>
            <p><span className="block text-[10px] uppercase tracking-[0.14em] text-white/45">KM faturado</span><span className="mt-1 block text-xl font-semibold" data-testid="proposta-km">{numero(tela.kmFaturado)}</span></p>
            <p><span className="block text-[10px] uppercase tracking-[0.14em] text-white/45">Horas</span><span className="mt-1 block text-xl font-semibold" data-testid="proposta-horas">{numero(tela.horas)}</span></p>
            {proposta.kmRota != null && proposta.kmRota > 0 ? (
              <p><span className="block text-[10px] uppercase tracking-[0.14em] text-white/45">Distância</span><span className="mt-1 block text-xl font-semibold">{numero(proposta.kmRota)} km</span></p>
            ) : null}
            {tempoViagem ? (
              <p><span className="block text-[10px] uppercase tracking-[0.14em] text-white/45">Tempo estimado</span><span className="mt-1 block text-xl font-semibold">{tempoViagem}</span></p>
            ) : null}
          </div>
          {tela.mostraFranquiaIncluida ? (
            <p className="mt-4 text-sm text-white/75" data-testid="proposta-franquia-incluida">Franquia incluída: {numero(tela.franquiaKm)} km e {numero(tela.franquiaHoras)} h.</p>
          ) : null}
          {tela.pernoite != null ? (
            <p className="mt-3 text-sm text-white/80">Pernoite: {reais(tela.pernoite)}</p>
          ) : null}
          <p className="mt-4 text-sm font-semibold">Tipo de escolta: escolta armada</p>
          <p className="mt-3 border-l-4 border-[#d0121a] pl-3 text-xs leading-5 text-white/70">{AVISO_PEDAGIO}</p>
          <p className="mt-3 text-xs text-white/60">Validade da proposta: 10 dias. {MARCA_TMSEG.chamada}</p>
          {proposta.acordada ? <p className="mt-3 text-xs text-white/70">Esta rota já está acordada na tabela do cliente.</p> : null}
        </div>
      </section>
    </div>
  );
};
