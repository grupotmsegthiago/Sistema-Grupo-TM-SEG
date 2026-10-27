import React, { useEffect, useState } from 'react';
import { CLIENTES_TMSEG, DIFERENCIAIS_TMSEG, MARCA_TMSEG, SERVICOS_TMSEG, AVISO_PEDAGIO } from '../../lib/portalCliente/apresentacao';
import type { PropostaPortal } from '../../lib/portalCliente/cotacao';
import type { CenaVisual } from '../../lib/portalCliente/frotaVisual';
import { cenaOficial, type ImagensPremium } from '../../lib/portalCliente/propostaPremium';
import { rotuloCidadeUf } from '../../lib/portalCliente/rotaCotacao';
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

function Viatura() {
  return (
    <svg viewBox="0 0 86 36" className="h-8 w-20" aria-hidden="true">
      <rect x="8" y="14" width="70" height="14" rx="4" fill="#111827" />
      <path d="M20 14 28 6h28l8 8" fill="#1f2937" />
      <rect x="36" y="3" width="14" height="4" rx="1" fill="#f59e0b" />
      <circle cx="24" cy="28" r="4" fill="#0f172a" stroke="#94a3b8" />
      <circle cx="64" cy="28" r="4" fill="#0f172a" stroke="#94a3b8" />
    </svg>
  );
}

const RESERVA_SERVICO: Record<string, string | null> = {
  'Fiscal de rota': '/proposta-tmseg/service-fiscal-rota.png',
  'Intermediação de escolta armada': null,
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
  const origem = rotuloCidadeUf(proposta.origem);
  const destino = rotuloCidadeUf(proposta.destino);
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

      <section data-proposta-bloco className="relative min-h-[520px] overflow-hidden px-5 pb-8 pt-7 sm:px-8">
        {fundo ? (
          <Foto src={fundo} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" onVazio={() => setCapaFalhou(true)} />
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_45%,rgba(208,18,26,0.38),transparent_42%),linear-gradient(90deg,#07080d,#141820)]" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#07080d] via-[#07080d]/92 to-[#07080d]/20" />
        <div className="relative grid items-end gap-6 lg:grid-cols-[1.12fr_0.88fr]">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[#d0121a]" style={fonte}>Proposta comercial</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold uppercase leading-[1.05] sm:text-5xl" style={fonte}>{caminho}</h2>
            <p className="mt-4 text-sm text-white/70">{regiao} · {data}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <p className="rounded-2xl border border-white/10 bg-black/55 px-3 py-3 text-xs backdrop-blur-sm"><span className="block text-[10px] uppercase tracking-wide text-white/50">Data prevista</span><span className="mt-1 block font-semibold">{data}</span><span className="text-white/60">{regiao}</span></p>
              <p className="rounded-2xl border border-white/10 bg-black/55 px-3 py-3 text-xs backdrop-blur-sm" data-testid="nome-tabela-vigencia"><span className="block text-[10px] uppercase tracking-wide text-white/50">Tabela utilizada</span><span className="mt-1 block font-semibold">{tabela}</span></p>
              <p className="rounded-2xl border border-white/10 bg-black/55 px-3 py-3 text-xs backdrop-blur-sm" data-testid="nome-rota-vigencia"><span className="block text-[10px] uppercase tracking-wide text-white/50">Rota</span><span className="mt-1 block font-semibold">{rota}</span></p>
            </div>
          </div>
          <figure className="relative min-h-[220px]">
            {!fundo ? (
              <>
                <div className="absolute bottom-6 right-4 opacity-90"><Viatura /></div>
                <img src={oficial.veiculo} alt="" className="relative ml-auto h-56 w-auto max-w-full object-contain drop-shadow-[0_24px_30px_rgba(0,0,0,0.65)] sm:h-72" />
                {logo ? <img src={logo} alt="" className="absolute bottom-10 right-[22%] h-8 w-auto rounded bg-white px-1.5 py-0.5 object-contain" /> : null}
              </>
            ) : (
              <div className="flex h-full min-h-[220px] items-end justify-end">
                {logo ? <img src={logo} alt="" className="mb-8 h-10 w-auto rounded bg-white px-2 py-1 object-contain shadow-lg" /> : null}
              </div>
            )}
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
              {proposta.duracaoMin != null && proposta.duracaoMin > 0 ? (
                <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"><span className="block text-[10px] uppercase text-white/50">Tempo estimado</span><span className="text-base font-semibold">{Math.round(proposta.duracaoMin)} min</span></p>
              ) : null}
              <p className="rounded-full border border-[#d0121a]/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-white">Rota calculada</p>
            </div>
          </div>
          {mapa ? (
            <figure className="px-4 pb-2 [perspective:1100px]">
              <div className="origin-center overflow-hidden rounded-2xl [transform:rotateX(14deg)]">
                <CenaRotaVisual mapa={mapa} carreta={carreta} logo={logo} faixa={false} />
              </div>
              <figcaption className="mt-2 text-[10px] text-white/45">Mapa: Google. O traçado é o da rota calculada.</figcaption>
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
                className="h-36 w-full object-cover"
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
          {DIFERENCIAIS_TMSEG.map((item) => (
            <article key={item.titulo} className="rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <Circulo><Escudo /></Circulo>
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
            {proposta.duracaoMin != null && proposta.duracaoMin > 0 ? (
              <p><span className="block text-[10px] uppercase tracking-[0.14em] text-white/45">Tempo estimado</span><span className="mt-1 block text-xl font-semibold">{Math.round(proposta.duracaoMin)} min</span></p>
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
