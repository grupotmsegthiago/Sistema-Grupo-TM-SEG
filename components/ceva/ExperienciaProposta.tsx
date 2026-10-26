import React, { useState } from 'react';
import { Mail, X } from 'lucide-react';
import {
  AVISO_PEDAGIO,
  CLIENTES_TMSEG,
  DIFERENCIAIS_TMSEG,
  FOTO_SALA,
  MARCA_TMSEG,
  numerosDaProposta,
  SERVICOS_TMSEG,
  caminhoDaProposta,
  regiaoLegivel,
} from '../../lib/portalCliente/apresentacao';
import type { PropostaPortal } from '../../lib/portalCliente/cotacao';
import type { CenaVisual } from '../../lib/portalCliente/frotaVisual';
import { authFetch } from '../../lib/authFetch';
import { prepararImagensDoElemento } from '../../lib/precificacao/imageUtils';
import ImagemSegura from '../ImagemSegura';
import { CenaRotaVisual } from './ClientTruckVisual';
import { usePortalCliente } from './portalMarca';

function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function numero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function dataDaProposta(): string {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function imprimirPropostaOnline(): boolean {
  const artigo = document.getElementById('proposta-tmseg-online');
  const janela = window.open('', '_blank', 'width=980,height=1200');
  if (!artigo || !janela) return false;
  const copia = artigo.cloneNode(true) as HTMLElement;
  copia.querySelector('[data-proposta-acoes]')?.remove();
  copia.querySelector('[aria-label="Fechar"]')?.remove();
  janela.document.open();
  janela.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Proposta Grupo TM SEG</title></head><body></body></html>');
  janela.document.close();
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((folha) => {
    janela.document.head.appendChild(folha.cloneNode(true));
  });
  const ajuste = janela.document.createElement('style');
  ajuste.textContent = '@page{size:A4;margin:8mm}html,body{margin:0;background:#fff!important}#proposta-tmseg-online,#proposta-tmseg-online [data-proposta-corpo]{height:auto!important;max-height:none!important;overflow:visible!important;box-shadow:none!important}#proposta-tmseg-online{width:100%!important;max-width:none!important;border-radius:0!important}figure,section{break-inside:avoid}';
  janela.document.head.appendChild(ajuste);
  void prepararImagensDoElemento(copia).then(() => {
    janela.document.body.appendChild(copia);
    janela.focus();
    janela.print();
  });
  return true;
}

export const ExperienciaProposta: React.FC<{
  frase: string;
  mostrando: boolean;
  proposta: PropostaPortal;
  pedido: { regiao: string; origem: string; destino: string; paradas: string[]; km: number };
  clienteInterno?: string;
  cena?: CenaVisual | null;
  /** Foto do mapa que estava na tela no momento de gerar a proposta. */
  printMapa?: string | null;
  operacoes?: string | null;
  onFechar: () => void;
  /** Fora da tela, sem opacidade zero, para o html2canvas ler a proposta salva. */
  modoCaptura?: boolean;
  dataTexto?: string;
}> = ({ frase, mostrando, proposta, pedido, clienteInterno, cena, printMapa, operacoes, onFechar, modoCaptura = false, dataTexto }) => {
  const portal = usePortalCliente();
  const [email, setEmail] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');
  const caminho = caminhoDaProposta(proposta);
  const data = dataTexto || dataDaProposta();
  const visivel = mostrando || modoCaptura;

  const postar = async (acao: 'salvar' | 'email') => {
    setOcupado(acao);
    setAviso('');
    try {
      if (clienteInterno) {
        if (acao === 'salvar') {
          const { supabase } = await import('../../lib/supabase');
          const { error } = await supabase.from('client_price_tables').insert({
            client: clienteInterno,
            operation_type: proposta.operacao,
            activation_fee: proposta.acionamento,
            franchise_km: proposta.kmFranquia,
            franchise_hours: proposta.horasFranquia,
            price_per_extra_km: proposta.kmExtra,
            price_per_extra_hour: proposta.horaExtra,
          });
          if (error) throw new Error('Não foi possível gravar a proposta na tabela do cliente.');
          setAviso('Proposta gravada na tabela do cliente.');
        } else {
          const resposta = await authFetch('/api/proposta-escolta/email', {
            method: 'POST',
            body: JSON.stringify({ para: email, proposta }),
          });
          const corpo = await resposta.json().catch(() => ({}));
          if (!resposta.ok) throw new Error(corpo.error || 'Não foi possível concluir.');
          setAviso(corpo.enviado ? `Proposta enviada para ${email}.` : (corpo.aviso || 'O e-mail não saiu agora.'));
        }
        return;
      }
      const resposta = await fetch(portal.url('/cotacao'), {
        method: 'POST',
        headers: { ...portal.cabecalhos(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, ...pedido, para: email }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || 'Não foi possível concluir.');
      if (acao === 'email') setAviso(corpo.enviado ? `Proposta enviada para ${email}.` : (corpo.aviso || 'O e-mail não saiu agora.'));
      else setAviso('Proposta gravada na tabela do cliente.');
    } catch (falha) {
      setAviso(falha instanceof Error ? falha.message : 'Não foi possível concluir.');
    } finally {
      setOcupado('');
    }
  };

  return (
    <div className={modoCaptura ? 'pointer-events-none fixed left-[-14000px] top-0 z-[-1] w-[960px]' : 'fixed inset-0 z-50 flex items-center justify-center bg-[#0c0d10]/80 p-3 backdrop-blur-md sm:p-6'} aria-hidden={modoCaptura || undefined}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Outfit:wght@400;500;600&display=swap');
        @keyframes tmseg-subir { from { opacity: 0; transform: translateY(36px) rotateX(8deg); } to { opacity: 1; transform: translateY(0) rotateX(0); } }
        @keyframes tmseg-rota { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        .tmseg-rota { animation: tmseg-rota 3.4s ease-in-out infinite; }
        .tmseg-parado { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .tmseg-rota { animation: none; stroke-dashoffset: 0; }
          .tmseg-anda { display: none; }
          .tmseg-parado { display: block; }
        }
      `}</style>
      {!visivel && (
        <div className="w-full max-w-xl text-center text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
          <svg viewBox="0 0 400 210" className="mx-auto mb-4 h-48 w-full max-w-lg" aria-hidden="true">
            <path d="M36 178 C 140 178, 230 118, 364 128" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeDasharray="5 7" />
            <path className="tmseg-rota" pathLength="1" strokeDasharray="1" d="M36 178 C 140 178, 230 118, 364 128" fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
            <circle cx="36" cy="178" r="6" fill="#16a34a" />
            <circle cx="364" cy="128" r="6" fill="#d0121a" />
            <g className="tmseg-anda">
              <image href="/logo-tm.svg" width="128" height="116" x="-64" y="-112" />
              <animateMotion dur="3.4s" repeatCount="indefinite" rotate="0" path="M36 178 C 140 178, 230 118, 364 128" />
            </g>
            <g className="tmseg-parado" transform="translate(200 168)">
              <image href="/logo-tm.svg" width="128" height="116" x="-64" y="-112" />
            </g>
          </svg>
          <p className="text-2xl font-semibold leading-snug">{frase}</p>
        </div>
      )}
      {visivel && (
        <article id={modoCaptura ? undefined : 'proposta-tmseg-online'} data-proposta-pdf={modoCaptura ? '1' : undefined} className={modoCaptura ? 'relative flex w-full flex-col bg-[#f7f5f2] text-[#161616]' : 'relative flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-[#f7f5f2] text-[#161616] shadow-[0_40px_90px_rgba(0,0,0,0.45)]'} style={modoCaptura ? { fontFamily: 'Outfit, sans-serif' } : { animation: 'tmseg-subir 0.7s ease', fontFamily: 'Outfit, sans-serif' }}>
          {!modoCaptura && <button type="button" onClick={onFechar} className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-[#0c0d10] text-white shadow-lg" aria-label="Fechar"><X size={16} /></button>}
          <div data-proposta-corpo className={modoCaptura ? '' : 'min-h-0 flex-1 overflow-auto'}>
            <header className="relative overflow-hidden bg-[#0c0d10] px-8 pb-10 pt-8 text-white sm:px-12">
              <div className="pointer-events-none absolute -right-10 top-8 h-56 w-56 rounded-full bg-[#d0121a]/30 blur-3xl" />
              <ImagemSegura src="/marca-grupotmseg.webp" alt="Grupo TM SEG" className="h-14 w-auto" />
              <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d0121a]" style={{ fontFamily: 'Oswald, sans-serif' }}>Proposta comercial</p>
              <h2 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl" style={{ fontFamily: 'Oswald, sans-serif' }}>{caminho}</h2>
              <p className="mt-4 text-sm text-white/70">{regiaoLegivel(proposta.regiao)} · {data}</p>
              <p className="mt-6 max-w-xl text-lg text-white/90">{MARCA_TMSEG.chamada}</p>
              {(printMapa || cena?.mapa) && (
                <figure className="mt-8 overflow-hidden rounded-3xl shadow-[0_24px_50px_rgba(0,0,0,0.35)]">
                  {printMapa ? (
                    <img src={printMapa} alt="Mapa da rota na tela" className="block h-auto w-full" />
                  ) : cena?.mapa ? (
                    <CenaRotaVisual mapa={cena.mapa} carreta={cena.carreta} logo={cena.logo} className="h-80" />
                  ) : null}
                </figure>
              )}
              <svg viewBox="0 0 640 90" className="mt-8 h-16 w-full max-w-xl" aria-hidden="true">
                <path d="M8 70 C 120 68, 180 18, 250 28 S 390 78, 632 16" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
                <circle cx="8" cy="70" r="5" fill="#ffffff" />
                <circle cx="632" cy="16" r="6" fill="#d0121a" />
              </svg>
            </header>

            <section className="grid gap-0 bg-[#0c0d10] text-white sm:grid-cols-4">
              {numerosDaProposta(operacoes).map((item) => (
                <div key={item.rotulo} className="border-t border-white/10 px-8 py-6 sm:px-6">
                  <p className="text-3xl font-semibold text-[#d0121a]" style={{ fontFamily: 'Oswald, sans-serif' }}>{item.valor}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/70">{item.rotulo}</p>
                </div>
              ))}
            </section>

            <section className="grid gap-8 px-8 py-10 sm:px-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <figure className="relative">
                <img src={FOTO_SALA} alt="Sala do Grupo TM SEG" className="h-80 w-full object-cover" />
                <figcaption className="absolute bottom-4 left-4 bg-[#d0121a] px-4 py-3 text-white">
                  <span className="block text-3xl leading-none" style={{ fontFamily: 'Oswald, sans-serif' }}>24/7</span>
                  <span className="text-[10px] uppercase tracking-[0.16em]">Atendimento</span>
                </figcaption>
              </figure>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d0121a]" style={{ fontFamily: 'Oswald, sans-serif' }}>A empresa</p>
                <h3 className="mt-2 text-3xl font-semibold" style={{ fontFamily: 'Oswald, sans-serif' }}>Quem acompanha a carga</h3>
                <p className="mt-4 text-base leading-relaxed text-[#3a3a3a]">{MARCA_TMSEG.quem}</p>
                <p className="mt-3 text-base leading-relaxed text-[#3a3a3a]">{MARCA_TMSEG.missao}</p>
              </div>
            </section>

            <section className="bg-white px-8 py-10 sm:px-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d0121a]" style={{ fontFamily: 'Oswald, sans-serif' }}>O que a operação cobre</p>
              <h3 className="mt-2 text-3xl font-semibold" style={{ fontFamily: 'Oswald, sans-serif' }}>Serviços</h3>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                {SERVICOS_TMSEG.map((servico) => (
                  <figure key={servico.titulo} className="overflow-hidden bg-[#f7f5f2]">
                    <img src={servico.foto} alt="" className="h-52 w-full object-cover" />
                    <figcaption className="px-4 py-4">
                      <p className="text-lg font-semibold">{servico.titulo}</p>
                      <p className="mt-2 text-sm leading-relaxed text-[#4b4b4b]">{servico.texto}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>

            <section className="px-8 py-10 sm:px-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d0121a]" style={{ fontFamily: 'Oswald, sans-serif' }}>Por que a TM SEG</p>
              <h3 className="mt-2 text-3xl font-semibold" style={{ fontFamily: 'Oswald, sans-serif' }}>Diferenciais</h3>
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                {DIFERENCIAIS_TMSEG.map((item) => (
                  <div key={item.titulo} className="border-t border-black/10 pt-4">
                    <p className="text-lg font-semibold">{item.titulo}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[#4b4b4b]">{item.texto}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-[#f3efe6] px-8 py-10 sm:px-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d0121a]" style={{ fontFamily: 'Oswald, sans-serif' }}>Quem confia a carga</p>
              <h3 className="mt-2 text-3xl font-semibold" style={{ fontFamily: 'Oswald, sans-serif' }}>Empresas que operam com a TM SEG</h3>
              <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {CLIENTES_TMSEG.map((cliente) => (
                  <div key={cliente.nome} className="flex h-16 items-center justify-center bg-white px-3">
                    <img src={cliente.logo} alt={cliente.nome} className="max-h-10 w-full object-contain" />
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white px-8 py-10 sm:px-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d0121a]" style={{ fontFamily: 'Oswald, sans-serif' }}>Esta rota</p>
              <h3 className="mt-2 text-3xl font-semibold" style={{ fontFamily: 'Oswald, sans-serif' }}>Condições comerciais</h3>
              <div className="mt-8 grid gap-8 border-y border-black/10 py-8 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#8a8a8a]" style={{ fontFamily: 'Oswald, sans-serif' }}>Acionamento</p>
                  <p className="mt-2 text-4xl font-semibold">{reais(proposta.acionamento)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#8a8a8a]" style={{ fontFamily: 'Oswald, sans-serif' }}>Km franquia</p>
                  <p className="mt-2 text-4xl font-semibold">{numero(proposta.kmFranquia)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#8a8a8a]" style={{ fontFamily: 'Oswald, sans-serif' }}>Horas franquia</p>
                  <p className="mt-2 text-4xl font-semibold">{numero(proposta.horasFranquia)}</p>
                </div>
              </div>
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <p className="text-lg leading-snug"><span className="block text-[11px] uppercase tracking-[0.18em] text-[#8a8a8a]" style={{ fontFamily: 'Oswald, sans-serif' }}>Valor do km extra</span><span className="mt-1 block text-3xl font-semibold">{reais(proposta.kmExtra)}</span></p>
                <p className="text-lg leading-snug"><span className="block text-[11px] uppercase tracking-[0.18em] text-[#8a8a8a]" style={{ fontFamily: 'Oswald, sans-serif' }}>Valor da hora extra</span><span className="mt-1 block text-3xl font-semibold">{reais(proposta.horaExtra)}</span></p>
              </div>
              <p className="mt-8 border-l-4 border-[#d0121a] pl-4 text-base font-medium">{AVISO_PEDAGIO}</p>
              {proposta.acordada && <p className="mt-4 text-sm text-[#4b4b4b]">Esta rota já está acordada na tabela do cliente.</p>}
            </section>
          </div>

          {!modoCaptura && <footer data-proposta-acoes className="border-t border-black/10 bg-white px-8 py-4 sm:px-12">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { if (!imprimirPropostaOnline()) setAviso('O navegador bloqueou a janela de impressão. Permita a janela e tente de novo.'); }} className="h-11 rounded-full bg-[#0c0d10] px-4 text-xs font-semibold text-white">Salvar em PDF</button>
              {!proposta.acordada && (
                <button type="button" disabled={ocupado === 'salvar'} onClick={() => postar('salvar')} className="h-11 rounded-full border border-black/15 px-4 text-xs font-semibold disabled:opacity-50">
                  Salvar essa proposta em nosso banco de dados
                </button>
              )}
              <p className="ml-auto text-xs text-[#6b6b6b]">{MARCA_TMSEG.telefone}</p>
            </div>
            <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(evento) => { evento.preventDefault(); postar('email'); }}>
              <label className="min-w-[220px] flex-1 text-xs font-medium text-[#6b6b6b]">E-mail
                <span className="mt-1 flex h-11 items-center gap-2 rounded-full border border-black/10 px-3">
                  <Mail size={14} />
                  <input value={email} onChange={(evento) => setEmail(evento.target.value)} type="email" required placeholder="cliente@empresa.com" className="h-full w-full bg-transparent text-sm outline-none" />
                </span>
              </label>
              <button type="submit" disabled={ocupado === 'email'} className="mt-5 h-11 rounded-full bg-[#d0121a] px-4 text-xs font-semibold text-white disabled:opacity-50">Enviar por e-mail</button>
            </form>
            {aviso && <p className="mt-3 text-sm font-medium">{aviso}</p>}
          </footer>}
        </article>
      )}
    </div>
  );
};
