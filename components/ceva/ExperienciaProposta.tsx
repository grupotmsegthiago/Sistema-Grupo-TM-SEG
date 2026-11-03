import React, { useEffect, useState } from 'react';
import { Loader2, Mail, X } from 'lucide-react';
import {
  MARCA_TMSEG,
  caminhoDaProposta,
  regiaoLegivel,
} from '../../lib/portalCliente/apresentacao';
import { rotulosSemAno, type PropostaPortal } from '../../lib/portalCliente/cotacao';
import { dadosDaProposta, type DadosProposta } from '../../lib/portalCliente/dadosProposta';
import { COPIA_FIXA_COTACAO } from '../../lib/portalCliente/gestaoCotacao';
import { nomePdfCotacao } from '../../lib/portalCliente/historicoCotacoes';
import type { CenaVisual } from '../../lib/portalCliente/frotaVisual';
import { nomeArquivoPdfProposta, type ImagensPremium } from '../../lib/portalCliente/propostaPremium';
import { authFetch } from '../../lib/authFetch';
import { formatDateBR } from '../../lib/dateUtils';
import { PropostaPremium } from './PropostaPremium';
import { usePortalCliente } from './portalMarca';

function textoEnvio(corpo: { para?: unknown; copias?: unknown }, digitado: string): string {
  const para = typeof corpo.para === 'string' && corpo.para ? corpo.para : digitado;
  const copias = Array.isArray(corpo.copias) ? corpo.copias.filter((item) => typeof item === 'string' && item).join(', ') : '';
  return copias ? `Proposta enviada para ${para}. Cópia para ${copias}.` : `Proposta enviada para ${para}.`;
}

function dataDaProposta(): string {
  return formatDateBR(new Date());
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
  /** Fora da tela, sem opacidade zero. O PDF traz o bloco para a esquerda só na hora da foto. */
  modoCaptura?: boolean;
  dataTexto?: string;
  /** Separa o artigo do histórico do artigo que está na tela. */
  marcaPdf?: string;
  /** Página do link: só a proposta, sem gravar, enviar ou abrir o sistema. */
  somenteLeitura?: boolean;
  validadeTexto?: string;
  idCotacao?: string | null;
  /** Grava a cotação no histórico. Não grava ao fechar a tela. Devolve o id quando grava. */
  onSalvarCotacao?: () => Promise<boolean | string | null>;
  /** Cena ilustrativa. Sem imagem, a proposta usa a carreta já publicada. */
  hero?: string | null;
  pecas?: Partial<ImagensPremium> | null;
  /** OS concluídas e parceiros ativos. Sem consulta, o card fica em branco. */
  operacoesRealizadas?: string | null;
  parceiros?: string | null;
  /** Mapa estático da rota, sem o painel da tela. */
  mapaLimpo?: string | null;
  /** JSON consolidado da cotação. Sem ele, a tela lê o mesmo motor. */
  dados?: DadosProposta | null;
}> = ({ frase, mostrando, proposta, pedido, clienteInterno, cena, printMapa, operacoes, onFechar, modoCaptura = false, dataTexto, marcaPdf = '1', somenteLeitura = false, validadeTexto, idCotacao, onSalvarCotacao, hero, pecas, operacoesRealizadas, parceiros, mapaLimpo, dados: dadosInformados }) => {
  const portal = usePortalCliente();
  const [email, setEmail] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [linkAviso, setLinkAviso] = useState('');
  const [erroPdf, setErroPdf] = useState('');
  const caminho = caminhoDaProposta(proposta);
  const nomes = rotulosSemAno(proposta.origem, proposta.destino);
  const arquivoPdf = nomePdfCotacao({
    cliente: clienteInterno || portal.marca.rotulo,
    origem: proposta.origem,
    destino: proposta.destino,
    numero: proposta.numero,
  });
  const data = dataTexto || dataDaProposta();
  const dados = dadosInformados ?? dadosDaProposta(proposta);
  const visivel = mostrando || modoCaptura;
  const artigoRef = React.useRef<HTMLElement | null>(null);

  const pdfDaTela = async (): Promise<string> => {
    const artigo = artigoRef.current;
    if (!artigo) throw new Error('A proposta ainda não está pronta para o PDF.');
    const { pdfBase64DaProposta } = await import('./abrirPdfCotacao');
    return pdfBase64DaProposta(artigo);
  };

  const salvarPdf = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setAviso('');
    const janela = window.open('', '_blank');
    try {
      const artigo = artigoRef.current;
      if (!artigo) throw new Error('A proposta ainda não está pronta para o PDF.');
      const { abrirPdfDaProposta } = await import('./abrirPdfCotacao');
      await abrirPdfDaProposta(artigo, arquivoPdf, janela);
    } catch (falha) {
      try { janela?.close(); } catch { /* a janela pode já ter fechado */ }
      setAviso(falha instanceof Error ? falha.message : 'Não foi possível gerar o PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copiarLink = async () => {
    if (!idCotacao || isGenerating) return;
    setLinkAviso('');
    try {
      const init = { method: 'POST' };
      const resposta = clienteInterno
        ? await authFetch(`/api/cotacoes/${idCotacao}/link-visualizacao`, init)
        : await fetch(`/api/cotacoes/${idCotacao}/link-visualizacao`, { ...init, headers: portal.cabecalhos() });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok || typeof corpo.caminho !== 'string') throw new Error(corpo.error || 'Não foi possível gerar o link.');
      const url = `${window.location.origin}${corpo.caminho}`;
      await navigator.clipboard.writeText(url);
      const validade = typeof corpo.expiraEm === 'string' ? formatDateBR(corpo.expiraEm) : '';
      const mesmo = corpo.reutilizado === true;
      setLinkAviso(validade
        ? (mesmo ? `O mesmo link de antes. Vale até ${validade}. Não é gerado outro nestes 10 dias.` : `Link copiado. Vale até ${validade}. A pessoa só vê esta proposta.`)
        : 'Link copiado. A pessoa só vê esta proposta.');
    } catch (falha) {
      setLinkAviso(falha instanceof Error ? falha.message : 'Não foi possível copiar o link.');
    }
  };

  const medirPagina = () => {
    const artigo = artigoRef.current;
    const miolo = artigo?.querySelector('.proposta-container') as HTMLElement | null;
    const altura = Math.ceil((miolo?.offsetHeight || artigo?.scrollHeight || 3200) + 8);
    const pagina = Math.max(2200, Math.min(altura, 9000));
    let estilo = document.getElementById('proposta-pagina-continua');
    if (!estilo) {
      estilo = document.createElement('style');
      estilo.id = 'proposta-pagina-continua';
      document.head.appendChild(estilo);
    }
    estilo.textContent = `@page { size: 980px ${pagina}px; margin: 0; }`;
    document.body.appendChild(estilo);
  };

  useEffect(() => {
    if (!somenteLeitura) return undefined;
    medirPagina();
    const artigo = artigoRef.current;
    const imagens = artigo ? Array.from(artigo.querySelectorAll('img')) : [];
    imagens.forEach((img) => img.addEventListener('load', medirPagina));
    const espera = window.setTimeout(medirPagina, 600);
    return () => {
      window.clearTimeout(espera);
      imagens.forEach((img) => img.removeEventListener('load', medirPagina));
    };
  }, [somenteLeitura, proposta, pecas, cena]);

  const baixarPdf = () => {
    if (isGenerating) return;
    const miolo = artigoRef.current?.querySelector('.proposta-container');
    if (!(miolo instanceof HTMLElement)) return;
    setErroPdf('');
    setIsGenerating(true);
    void (async () => {
      try {
        const { baixarEspelhoDaProposta } = await import('./abrirPdfCotacao');
        await baixarEspelhoDaProposta(miolo, nomeArquivoPdfProposta(idCotacao, clienteInterno || portal.marca.rotulo));
      } catch (falha) {
        setErroPdf(falha instanceof Error ? falha.message : 'Não foi possível baixar o PDF.');
      } finally {
        setIsGenerating(false);
      }
    })();
  };

  const garantirLink = async (): Promise<string | null> => {
    let id = idCotacao || null;
    if (!id && onSalvarCotacao) {
      const salvo = await onSalvarCotacao();
      if (typeof salvo === 'string' && salvo) id = salvo;
    }
    if (!id) return null;
    try {
      const init = { method: 'POST' };
      const resposta = clienteInterno
        ? await authFetch(`/api/cotacoes/${id}/link-visualizacao`, init)
        : await fetch(`/api/cotacoes/${id}/link-visualizacao`, { ...init, headers: portal.cabecalhos() });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok || typeof corpo.caminho !== 'string') return null;
      return `${window.location.origin}${corpo.caminho}`;
    } catch {
      return null;
    }
  };

  const postar = async (acao: 'salvar' | 'email') => {
    if (isGenerating) return;
    setOcupado(acao);
    if (acao === 'email') setIsGenerating(true);
    setAviso('');
    try {
      const link = acao === 'email' ? await garantirLink() : null;
      const pdf = acao === 'email' && !link ? await pdfDaTela() : undefined;
      if (acao === 'email' && !pdf && !link) throw new Error('Salve a cotação para abrir o link da proposta.');
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
            body: JSON.stringify({ para: email, proposta, pdf, nomePdf: arquivoPdf, link }),
          });
          const corpo = await resposta.json().catch(() => ({}));
          if (!resposta.ok) throw new Error(corpo.error || 'Não foi possível concluir.');
          setAviso(corpo.enviado ? textoEnvio(corpo, email) : (corpo.aviso || 'O e-mail não saiu agora.'));
        }
        return;
      }
      const resposta = await fetch(portal.url('/cotacao'), {
        method: 'POST',
        headers: { ...portal.cabecalhos(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, ...pedido, para: email, pdf, nomePdf: arquivoPdf, link }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || 'Não foi possível concluir.');
      if (acao === 'email') setAviso(corpo.enviado ? textoEnvio(corpo, email) : (corpo.aviso || 'O e-mail não saiu agora.'));
      else setAviso('Proposta gravada na tabela do cliente.');
    } catch (falha) {
      setAviso(falha instanceof Error ? falha.message : 'Não foi possível concluir.');
    } finally {
      setOcupado('');
      setIsGenerating(false);
    }
  };

  return (
    <div data-captura-proposta={modoCaptura ? marcaPdf : undefined} className={modoCaptura ? 'pointer-events-none fixed left-[-14000px] top-0 z-[-1] w-[960px]' : somenteLeitura ? 'min-h-screen bg-[#0c0d10]' : 'fixed inset-0 z-50 flex items-center justify-center bg-[#0c0d10]/80 p-3 backdrop-blur-md sm:p-6'} aria-hidden={modoCaptura || undefined}>
      {!modoCaptura && isGenerating && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45" role="status" data-testid="overlay-pdf-proposta">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-2xl">
            <Loader2 className="animate-spin text-slate-900" size={22} />
            <p className="text-sm font-semibold text-slate-900">Gerando PDF da proposta, aguarde...</p>
          </div>
        </div>
      )}
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
        [data-proposta-pdf], [data-proposta-pdf] * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .cartao-3d { background-image: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0) 34%); box-shadow: 0 16px 30px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.16); }
        .mapa-palco { perspective: 1100px; }
        .mapa-placa { transform: rotateX(12deg); transform-origin: center bottom; }
        @page { margin: 0; }
        @media print {
          html, body, [data-proposta-pdf] {
            background: #07090e !important;
            color: #fff !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          [data-proposta-pdf] {
            position: static !important;
            width: 980px !important;
            max-width: 980px !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          [data-proposta-corpo] { overflow: visible !important; height: auto !important; max-height: none !important; }
          [data-print-oculto], [data-proposta-acoes], .no-print { display: none !important; }
          .proposta-container {
            width: 980px !important;
            max-width: 980px !important;
            margin: 0 auto !important;
            background-color: #07090e !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .cabecalho-proposta { display: flex !important; flex-wrap: nowrap !important; align-items: center !important; justify-content: space-between !important; }
          .hero-proposta { min-height: 0 !important; }
          .grade-hero { display: block !important; max-width: 560px !important; }
          .grade-quatro { display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)) !important; gap: 12px !important; }
          .grade-empresa, .grade-origem { display: grid !important; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; }
          .grade-comercial { display: grid !important; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr) !important; }
          .grade-logos { display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
          .banner-caminhao { min-height: 0 !important; height: 220px !important; max-height: 220px !important; }
          .caminhao-proposta { height: 220px !important; max-height: 220px !important; width: 100% !important; object-fit: contain !important; object-position: right center !important; }
          .card-servico, .card-diferencial, .card-comercial, .card-metrica, .secao-bloco {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .card-servico, .card-diferencial, .card-metrica {
            background: #12151c !important;
            border: 1px solid rgba(255,255,255,0.14) !important;
            border-radius: 24px !important;
            overflow: hidden !important;
          }
          .card-comercial { background: #10131a !important; border: 1px solid rgba(208,18,26,0.45) !important; border-radius: 28px !important; }
          .foto-servico, .foto-empresa { width: 100% !important; object-fit: cover !important; max-height: 220px !important; }
          .foto-servico { height: 148px !important; }
          .foto-empresa { height: 220px !important; }
          .mapa-perspectiva, .mapa-perspectiva > div { transform: none !important; }
          .proposta-container .line-clamp-1, .proposta-container .line-clamp-2 {
            overflow: visible !important;
            display: block !important;
            -webkit-line-clamp: unset !important;
          }
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
        <article ref={artigoRef} id={modoCaptura ? undefined : 'proposta-tmseg-online'} data-proposta-pdf={marcaPdf} className={modoCaptura ? 'relative mx-auto flex w-full max-w-[980px] flex-col bg-[#07090e] text-white' : somenteLeitura ? 'relative mx-auto flex min-h-screen w-full max-w-[980px] flex-col bg-[#07090e] text-white' : 'relative flex h-[92vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[28px] bg-[#07090e] text-white shadow-[0_40px_90px_rgba(0,0,0,0.45)]'} style={modoCaptura || somenteLeitura ? { fontFamily: 'Outfit, sans-serif' } : { animation: 'tmseg-subir 0.7s ease', fontFamily: 'Outfit, sans-serif' }}>
          {somenteLeitura && (
            <div data-print-oculto className="no-print flex flex-wrap items-center justify-center gap-3 bg-[#0c0d10] px-6 py-3 text-center text-sm text-white">
              <p data-testid="aviso-link-proposta">
                Visualização da proposta{validadeTexto ? ` • Válida até ${validadeTexto}` : ''} • Este link não abre o restante do sistema.
              </p>
              <button type="button" onClick={baixarPdf} data-testid="baixar-proposta-pdf" className="h-10 rounded-full bg-[#d0121a] px-4 text-xs font-semibold text-white">Baixar Proposta em PDF</button>
              {erroPdf ? <p className="w-full text-xs text-red-300" data-testid="erro-pdf-proposta">{erroPdf}</p> : null}
            </div>
          )}
          {!modoCaptura && !somenteLeitura && <button type="button" onClick={onFechar} className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-[#0c0d10] text-white shadow-lg" aria-label="Fechar"><X size={16} /></button>}
          <div data-proposta-corpo data-proposta-bloco className={modoCaptura ? '' : 'min-h-0 flex-1 overflow-auto'}>
            <PropostaPremium
              cliente={clienteInterno || portal.marca.rotulo}
              caminho={caminho}
              tabela={nomes.tabela}
              rota={nomes.rota}
              regiao={regiaoLegivel(proposta.regiao)}
              data={data}
              validade={validadeTexto}
              proposta={proposta}
              dados={dados}
              cena={cena}
              printMapa={printMapa}
              hero={hero}
              pecas={pecas}
              operacoes={operacoes}
              operacoesRealizadas={operacoesRealizadas}
              parceiros={parceiros}
              mapaLimpo={mapaLimpo}
              linkPublico={somenteLeitura}
              altMapa="Mapa da rota na tela"
            />
          </div>

          {!modoCaptura && !somenteLeitura && <footer data-proposta-acoes className="border-t border-black/10 bg-white px-8 py-4 sm:px-12">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={isGenerating} onClick={() => { void salvarPdf(); }} className="h-11 rounded-full bg-[#0c0d10] px-4 text-xs font-semibold text-white disabled:opacity-50">Salvar em PDF</button>
              {onSalvarCotacao && (
                <button type="button" disabled={isGenerating || ocupado === 'cotacao' || Boolean(idCotacao)} data-testid="salvar-cotacao-proposta" onClick={() => { void (async () => { setOcupado('cotacao'); setAviso(''); const ok = await onSalvarCotacao(); setOcupado(''); if (ok) setAviso('Cotação salva.'); })(); }} className="h-11 rounded-full bg-[#d0121a] px-4 text-xs font-semibold text-white disabled:opacity-50">{idCotacao ? 'Cotação salva' : 'Salvar cotação'}</button>
              )}
              {idCotacao && (
                <button type="button" onClick={() => { void copiarLink(); }} data-testid="link-visualizacao-proposta" className="h-11 rounded-full border border-black/15 px-4 text-xs font-semibold">Link de visualização</button>
              )}
              {!proposta.acordada && (
                <button type="button" disabled={isGenerating || ocupado === 'salvar'} onClick={() => postar('salvar')} className="h-11 rounded-full border border-black/15 px-4 text-xs font-semibold disabled:opacity-50">
                  Salvar essa proposta em nosso banco de dados
                </button>
              )}
              <p className="ml-auto text-xs text-[#6b6b6b]">{MARCA_TMSEG.telefone}</p>
            </div>
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(evento) => { evento.preventDefault(); postar('email'); }}>
              <label className="min-w-[220px] flex-1 text-xs font-medium text-[#6b6b6b]">Enviar para o e-mail
                <span className="mt-1 flex h-11 items-center gap-2 rounded-full border border-black/10 px-3">
                  <Mail size={14} />
                  <input value={email} onChange={(evento) => setEmail(evento.target.value)} type="text" required placeholder="cliente@empresa.com — separe por vírgula" className="h-full w-full bg-transparent text-sm outline-none" />
                </span>
              </label>
              <button type="submit" disabled={isGenerating || ocupado === 'email'} data-testid="enviar-proposta-email" className="h-11 rounded-full bg-[#d0121a] px-4 text-xs font-semibold text-white disabled:opacity-50">{isGenerating ? 'Gerando PDF da proposta, aguarde...' : 'Enviar para o e-mail'}</button>
            </form>
            <p className="mt-2 text-[11px] text-[#6b6b6b]">O e-mail abre a proposta no link de visualização e traz o resumo da cotação. O PDF só vai em anexo quando o link não puder ser gerado. Cópia para {COPIA_FIXA_COTACAO} e para quem fez a cotação.</p>
            {aviso && <p className="mt-3 text-sm font-medium">{aviso}</p>}
            {linkAviso && <p className="mt-2 text-sm font-medium" data-testid="aviso-link-copiado">{linkAviso}</p>}
          </footer>}
        </article>
      )}
    </div>
  );
};
