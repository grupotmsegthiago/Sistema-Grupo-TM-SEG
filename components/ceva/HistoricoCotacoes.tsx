import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, FileDown, Link2, Loader2, Mail, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { authFetch } from '../../lib/authFetch';
import { PRAZO_COTACAO_DIAS, cotacaoSelecionavel, type VersaoTabelaRegional } from '../../lib/precificacao/tabela2027';
import { COPIA_FIXA_COTACAO, cartaEmailCotacao, cotacaoExcluida, mostrarDesativarCotacao, mostrarExcluirCotacao, textoHoraExtra, textoTarifaKm, type AtorCotacao, type CotacaoGestao } from '../../lib/portalCliente/gestaoCotacao';
import { aplicarContaNaProposta, nomesDaVigencia, type ContaVisivelCotacao } from '../../lib/portalCliente/cotacao';
import { cartaDaProposta } from '../../lib/portalCliente/apresentacao';
import {
  TEXTO_HISTORICO_VAZIO,
  TAMANHO_PAGINA_HISTORICO,
  JANELA_HISTORICO_VIGENCIA,
  dataLongaCotacao,
  formatarDataHoraCotacao,
  formatarValorCotacao,
  lerSnapshot,
  mensagemCompletaCotacao,
  linhaConfereComTela,
  patchDaTelaNoSnapshot,
  valoresExibidosDaLinha,
  type TelaCotacao,
  nomePdfCotacao,
  normalizarLinhaHistorico,
  reservarNumeroCotacao,
  propostaDoHistorico,
  resumirEndereco,
  rotuloValidade,
  textoDistanciaTempo,
  textoRegiaoFranquia,
  vigenciaDaCotacao,
  type LinhaHistoricoCotacao,
} from '../../lib/portalCliente/historicoCotacoes';
import { SeletorVigencia } from '../precificacao/SeletorVigencia';
import { ExperienciaProposta } from './ExperienciaProposta';
import { usePortalCliente } from './portalMarca';

const COLUNAS = 'id, client_id, client_name, origin, destination, total_km, total_hours, total_value, created_at, created_by, status, is_active, converted_to_order_id, contract_details';

export function HistoricoVazio({ texto = TEXTO_HISTORICO_VAZIO }: { texto?: string }) {
  return (
    <p data-testid="historico-vazio" className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
      {texto}
    </p>
  );
}

function gestaoDaLinha(linha: LinhaHistoricoCotacao, email?: string): CotacaoGestao {
  return {
    id: linha.id,
    client_name: linha.client_name,
    created_by: linha.created_by,
    solicitanteEmail: email,
    status: linha.status,
    is_active: linha.is_active,
    converted_to_order_id: linha.converted_to_order_id,
  };
}

function selo(tom: 'ativa' | 'convertida' | 'expirada' | 'inativa', rotulo: string) {
  const classe = tom === 'ativa'
    ? 'bg-emerald-50 text-emerald-800'
    : tom === 'convertida'
      ? 'bg-sky-50 text-sky-800'
      : tom === 'inativa'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-black ${classe}`}>{rotulo}</span>;
}

const BOTAO = 'inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[10px] font-black whitespace-nowrap';

export type EdicaoCotacao = {
  origem: string;
  destino: string;
  paradas: string[];
  regiao?: string;
};

export function AcoesDaLinha({
  id,
  mostrarDesativar,
  mostrarExcluir,
  mostrarCriarOs,
  mostrarAlterar,
  onPdf,
  onEmail,
  onCopiar,
  onLink,
  onDesativar,
  onExcluir,
  onCriarOs,
  onAlterar,
  painelAberto = false,
}: {
  id: string;
  mostrarDesativar: boolean;
  mostrarExcluir: boolean;
  mostrarCriarOs?: boolean;
  mostrarAlterar?: boolean;
  onPdf?: () => void;
  onEmail?: () => void;
  onCopiar?: () => void;
  onLink?: () => void;
  onDesativar?: () => void;
  onExcluir?: () => void;
  onCriarOs?: () => void;
  onAlterar?: () => void;
  /** Só o teste abre o painel sem clique. Na tela ele começa fechado. */
  painelAberto?: boolean;
}) {
  const [aberto, setAberto] = useState(painelAberto);
  const fechar = (acao?: () => void) => {
    setAberto(false);
    acao?.();
  };
  const item = 'flex h-11 w-full items-center gap-2 rounded-2xl border px-3 text-left text-sm font-black';
  const painel = aberto ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4" onClick={() => setAberto(false)}>
          <div role="dialog" aria-label="Opções da cotação" className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl" onClick={(evento) => evento.stopPropagation()} data-testid={`painel-acoes-${id}`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-black text-slate-900">Ações</h3>
              <button type="button" onClick={() => setAberto(false)} className="h-9 rounded-full border border-slate-200 px-3 text-xs font-black text-slate-600">Fechar</button>
            </div>
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={() => fechar(onPdf)} data-testid={`ver-pdf-${id}`} className={`${item} border-slate-200 text-slate-800 hover:bg-slate-50`}><FileDown size={16} /> PDF</button>
              <button type="button" onClick={() => fechar(onEmail)} data-testid={`email-${id}`} className={`${item} border-slate-200 text-slate-800 hover:bg-slate-50`}><Mail size={16} /> E-mail</button>
              <button type="button" onClick={() => fechar(onCopiar)} data-testid={`copiar-msg-${id}`} className={`${item} border-slate-200 text-slate-800 hover:bg-slate-50`}><Copy size={16} /> Copiar MSG</button>
              {onLink && (
                <button type="button" onClick={() => fechar(onLink)} data-testid={`link-visualizacao-${id}`} className={`${item} border-slate-200 text-slate-800 hover:bg-slate-50`}><Link2 size={16} /> Link de visualização</button>
              )}
              {mostrarCriarOs && (
                <button type="button" onClick={() => fechar(onCriarOs)} data-testid={`criar-os-${id}`} className={`${item} border-slate-200 text-slate-800 hover:bg-slate-50`}><Plus size={16} /> Criar OS</button>
              )}
              {mostrarAlterar && (
                <button type="button" onClick={() => fechar(onAlterar)} data-testid={`alterar-${id}`} className={`${item} border-slate-200 text-slate-800 hover:bg-slate-50`}><Pencil size={16} /> Alterar</button>
              )}
              {mostrarDesativar && (
                <button type="button" onClick={() => fechar(onDesativar)} data-testid={`desativar-${id}`} className={`${item} border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`}><Power size={16} /> Desativar</button>
              )}
              {mostrarExcluir && (
                <button type="button" onClick={() => fechar(onExcluir)} data-testid={`excluir-${id}`} className={`${item} border-red-200 bg-red-50 text-red-800 hover:bg-red-100`}><Trash2 size={16} /> Excluir</button>
              )}
            </div>
          </div>
        </div>
  ) : null;
  const destino = typeof document !== 'undefined' ? document.body : null;
  return (
    <div data-testid={`acoes-linha-${id}`}>
      <button type="button" onClick={() => setAberto(true)} data-testid={`abrir-acoes-${id}`} className={`${BOTAO} border-slate-200 text-slate-700 hover:bg-slate-50`}>Ações</button>
      {painel && destino ? createPortal(painel, destino) : painel}
    </div>
  );
}

async function esperarPropostaHistorico(aindaAtivo: () => boolean): Promise<HTMLElement | null> {
  const prazo = Date.now() + 4000;
  let artigo: HTMLElement | null = null;
  while (Date.now() < prazo) {
    if (!aindaAtivo()) return null;
    const achado = document.querySelector('[data-proposta-pdf="historico"]');
    if (achado instanceof HTMLElement) {
      artigo = achado;
      break;
    }
    await new Promise((resolver) => window.setTimeout(resolver, 40));
  }
  if (!artigo || !aindaAtivo()) return null;
  const fontes = document.fonts;
  if (fontes?.ready) {
    try { await fontes.ready; } catch { /* a fonte do sistema segue no PDF */ }
  }
  if (!aindaAtivo()) return null;
  const imagens = Array.from(artigo.querySelectorAll('img'));
  await Promise.all(imagens.map((imagem) => {
    if (imagem.complete) return Promise.resolve();
    return new Promise<void>((resolver) => {
      imagem.addEventListener('load', () => resolver(), { once: true });
      imagem.addEventListener('error', () => resolver(), { once: true });
    });
  }));
  if (!aindaAtivo()) return null;
  await new Promise((resolver) => window.setTimeout(resolver, 60));
  return aindaAtivo() ? artigo : null;
}

async function mapaEstaticoDaLinha(
  linha: LinhaHistoricoCotacao,
  clienteNome: string | undefined,
  portal: { cabecalhos: () => Record<string, string> },
): Promise<string | null> {
  const salvo = lerSnapshot(linha.contract_details);
  const corpo = JSON.stringify({
    origem: linha.origin,
    destino: linha.destination,
    paradas: salvo?.paradas || [],
  });
  try {
    const resposta = clienteNome
      ? await authFetch('/api/proposta-escolta/mapa', { method: 'POST', body: corpo })
      : await fetch('/api/proposta-escolta/mapa', {
        method: 'POST',
        headers: { ...portal.cabecalhos(), 'Content-Type': 'application/json' },
        body: corpo,
      });
    const dados = await resposta.json().catch(() => ({}));
    if (resposta.ok && typeof dados.mapa === 'string' && dados.mapa.startsWith('data:image/')) return dados.mapa;
  } catch {
    return null;
  }
  return null;
}

export const HistoricoCotacoes: React.FC<{
  clienteNome?: string;
  clientId?: string | number | null;
  recarga: number;
  aviso?: string;
  versao?: VersaoTabelaRegional;
  onVersao?: (versao: VersaoTabelaRegional) => void;
  onEditar?: (edicao: EdicaoCotacao) => void;
  contaAtual?: ContaVisivelCotacao | null;
  origemAtual?: string;
  destinoAtual?: string;
  kmAtual?: number | null;
  duracaoMinAtual?: number | null;
}> = ({ clienteNome, clientId, recarga, aviso, versao, onVersao, onEditar, contaAtual = null, origemAtual = '', destinoAtual = '', kmAtual = null, duracaoMinAtual = null }) => {
  const portal = usePortalCliente();
  const [versaoLocal, setVersaoLocal] = useState<VersaoTabelaRegional>('2027');
  const versaoAtiva = versao ?? versaoLocal;
  const [linhas, setLinhas] = useState<LinhaHistoricoCotacao[]>([]);
  const [pagina, setPagina] = useState(0);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [erroPdf, setErroPdf] = useState('');
  const [captura, setCaptura] = useState<{ linha: LinhaHistoricoCotacao; modo: 'pdf' | 'email' } | null>(null);
  const [mapaCaptura, setMapaCaptura] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<LinhaHistoricoCotacao | null>(null);
  const [email, setEmail] = useState<{ linha: LinhaHistoricoCotacao; para: string; cc: string; mensagem: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState('');
  const janelaPdf = useRef<Window | null>(null);
  const emailPendente = useRef<{ para: string; cc: string; mensagem: string } | null>(null);
  const ator = useMemo<AtorCotacao>(() => {
    const doSistema = () => {
      try {
        const user = JSON.parse(localStorage.getItem('userData') || '{}') as { name?: string; email?: string; role?: string };
        return { nome: String(user.name || ''), email: String(user.email || ''), perfil: String(user.role || '') };
      } catch {
        return { nome: '', email: '', perfil: '' };
      }
    };
    if (clienteNome) return doSistema();
    const sessao = portal.ler();
    if (sessao?.user.equipeInterna) {
      const interno = doSistema();
      return { nome: interno.nome || sessao.user.name, email: interno.email || sessao.user.email, perfil: interno.perfil };
    }
    if (!sessao) return { nome: '', email: '', perfil: '', portalCliente: portal.marca.rotulo };
    return { nome: sessao.user.name, email: sessao.user.email, perfil: sessao.user.perfil, portalCliente: portal.marca.rotulo };
  }, [clienteNome, portal]);
  const versaoVista = useRef(versaoAtiva);

  const trocarVersao = (proxima: VersaoTabelaRegional) => {
    setLinhas([]);
    setPagina(0);
    if (onVersao) onVersao(proxima);
    else setVersaoLocal(proxima);
  };

  useEffect(() => {
    if (versaoVista.current === versaoAtiva) return;
    versaoVista.current = versaoAtiva;
    setLinhas([]);
    setPagina(0);
  }, [versaoAtiva]);

  useEffect(() => {
    let ativo = true;
    setLinhas([]);
    setCarregando(true);
    setErro('');
    const ler = async () => {
      try {
        if (!clienteNome) {
          const resposta = await fetch(portal.url(`/cotacao?lista=historico&pagina=${pagina}&vigencia=${versaoAtiva}`), { headers: portal.cabecalhos() });
          const corpo = await resposta.json().catch(() => ({}));
          if (!resposta.ok) throw new Error(corpo.error || 'Não foi possível ler o histórico.');
          if (!ativo) return;
          setLinhas(Array.isArray(corpo.cotacoes) ? corpo.cotacoes.map((item: Record<string, unknown>) => normalizarLinhaHistorico(item)).filter((item: LinhaHistoricoCotacao) => !cotacaoExcluida(item)) : []);
          setTemMais(Boolean(corpo.temMais));
          if (corpo.aviso) setErro(String(corpo.aviso));
          return;
        }
        let idCliente = Number(clientId);
        if (!Number.isFinite(idCliente) || idCliente <= 0) {
          const { data } = await supabase.from('clients').select('id').ilike('name', clienteNome).limit(1).maybeSingle();
          idCliente = Number(data?.id);
        }
        const inicio = pagina * TAMANHO_PAGINA_HISTORICO;
        const base = supabase.from('quotes').select(COLUNAS);
        const filtrada = Number.isFinite(idCliente) && idCliente > 0
          ? base.eq('client_id', idCliente)
          : base.eq('client_name', clienteNome);
        const { data, error } = await filtrada.order('created_at', { ascending: false }).range(0, JANELA_HISTORICO_VIGENCIA - 1);
        if (error) throw new Error(error.message || 'Não foi possível ler o histórico.');
        if (!ativo) return;
        const daVigencia = ((data || []) as Record<string, unknown>[])
          .map((item) => normalizarLinhaHistorico(item))
          .filter((item) => vigenciaDaCotacao(item) === versaoAtiva && !cotacaoExcluida(item));
        setLinhas(daVigencia.slice(inicio, inicio + TAMANHO_PAGINA_HISTORICO));
        setTemMais(daVigencia.length > inicio + TAMANHO_PAGINA_HISTORICO);
      } catch (falha) {
        if (!ativo) return;
        setLinhas([]);
        setTemMais(false);
        setErro(falha instanceof Error ? falha.message : 'Não foi possível ler o histórico.');
      } finally {
        if (ativo) setCarregando(false);
      }
    };
    void ler();
    return () => { ativo = false; };
  }, [clienteNome, clientId, pagina, portal, recarga, versaoAtiva]);

  const garantirNumero = async (linha: LinhaHistoricoCotacao): Promise<number | null> => {
    const salvo = lerSnapshot(linha.contract_details);
    if (salvo?.numero) return salvo.numero;
    if (/^\d+$/.test(linha.id)) return Number(linha.id);
    if (!salvo || !clienteNome) return null;
    const reservado = await reservarNumeroCotacao(async (inicio, fim) => {
      const { data, error } = await supabase.from('quotes').select('id, contract_details').order('created_at', { ascending: true }).range(inicio, fim);
      if (error) return null;
      return { linhas: Array.isArray(data) ? data : [] };
    });
    if (!reservado) return null;
    const atualizado = { ...salvo, numero: reservado };
    const { error } = await supabase.from('quotes').update({ contract_details: JSON.stringify(atualizado) }).eq('id', linha.id);
    if (error) return null;
    const corpo = JSON.stringify(atualizado);
    setLinhas((lista) => lista.map((item) => item.id === linha.id ? { ...item, contract_details: corpo } : item));
    return reservado;
  };

  const telaAtual = (): TelaCotacao | null => {
    if (!contaAtual?.aplicar || kmAtual == null) return null;
    return {
      origem: origemAtual,
      destino: destinoAtual,
      regiao: contaAtual.regiao,
      tarifaKm: contaAtual.tarifaKm,
      horaExtra: contaAtual.horaExtra,
      total: contaAtual.total,
      km: kmAtual,
      duracaoMin: duracaoMinAtual,
      horas: contaAtual.horasFaturadas,
      usouMinimo: contaAtual.usouMinimo,
      vigencia: contaAtual.vigencia,
    };
  };

  useEffect(() => {
    if (!clienteNome) return;
    const tela = telaAtual();
    if (!tela) return;
    const alvos = linhas.flatMap((linha) => {
      if (!linhaConfereComTela(linha, tela)) return [];
      const patch = patchDaTelaNoSnapshot(linha.contract_details, tela);
      return patch ? [{ id: linha.id, patch }] : [];
    });
    if (!alvos.length) return;
    let ativo = true;
    void (async () => {
      for (const alvo of alvos) {
        const { error } = await supabase.from('quotes').update(alvo.patch).eq('id', alvo.id);
        if (!ativo || error) return;
      }
      if (!ativo) return;
      const porId = new Map(alvos.map((alvo) => [alvo.id, alvo.patch]));
      setLinhas((lista) => lista.map((item) => {
        const patch = porId.get(item.id);
        return patch ? { ...item, contract_details: patch.contract_details, total_value: patch.total_value, total_hours: patch.total_hours } : item;
      }));
    })();
    return () => { ativo = false; };
  }, [linhas, contaAtual, origemAtual, destinoAtual, kmAtual, duracaoMinAtual, clienteNome]);

  const contaDaLinha = (linha: LinhaHistoricoCotacao): ContaVisivelCotacao | null => {
    if (!contaAtual?.aplicar) return null;
    if (lerSnapshot(linha.contract_details)?.acordada) return null;
    if (!linhaConfereComTela(linha, { origem: origemAtual, destino: destinoAtual, km: kmAtual })) return null;
    return contaAtual;
  };

  const propostaDaLinha = (linha: LinhaHistoricoCotacao) => {
    const base = propostaDoHistorico(linha);
    const conta = contaDaLinha(linha);
    return conta ? aplicarContaNaProposta(base, conta) : base;
  };

  useEffect(() => {
    if (!captura) return;
    const linha = captura.linha;
    const modo = captura.modo;
    const janela = janelaPdf.current;
    let ativo = true;
    const gerar = async () => {
      let artigo: HTMLElement | null = null;
      try {
        artigo = await esperarPropostaHistorico(() => ativo);
        if (!ativo) return;
        if (!(artigo instanceof HTMLElement)) {
          setErroPdf('Não foi possível montar o PDF desta cotação.');
          try { janela?.close(); } catch { /* popup bloqueado */ }
          return;
        }
        const numero = await garantirNumero(linha);
        if (modo === 'email') {
          const { pdfBase64DaProposta } = await import('./abrirPdfCotacao');
          const pdf = await pdfBase64DaProposta(artigo);
          const pendente = emailPendente.current;
          const init = { method: 'POST', body: JSON.stringify({ para: pendente?.para || '', cc: pendente?.cc || '', mensagem: pendente?.mensagem || '', pdf, proposta: propostaDaLinha(linha) }) };
          const resposta = clienteNome
            ? await authFetch(`/api/cotacoes/${linha.id}/enviar-email`, init)
            : await fetch(`/api/cotacoes/${linha.id}/enviar-email`, { ...init, headers: { ...portal.cabecalhos(), 'Content-Type': 'application/json' } });
          const corpo = await resposta.json().catch(() => ({}));
          if (!resposta.ok) throw new Error(corpo.error || 'Não foi possível enviar o e-mail.');
          if (corpo.enviado === false) setErroPdf(String(corpo.aviso || 'O e-mail não saiu agora.'));
          else {
            const copias = Array.isArray(corpo.copias) ? corpo.copias.filter((item: unknown) => typeof item === 'string' && item) : [];
            setToast(copias.length ? `Proposta enviada. Cópia para ${copias.join(', ')}.` : 'Proposta enviada por e-mail.');
          }
        } else {
          const { abrirPdfDaProposta } = await import('./abrirPdfCotacao');
          await abrirPdfDaProposta(artigo, nomePdfCotacao({
            cliente: linha.client_name || 'Cliente',
            numero,
            data: linha.created_at,
          }), janela);
        }
      } catch (falha) {
        if (ativo) setErroPdf(falha instanceof Error ? falha.message : 'Não foi possível reabrir o PDF.');
        try { janela?.close(); } catch { /* a janela pode já ter fechado */ }
      } finally {
        if (ativo) {
          setCaptura(null);
          setMapaCaptura(null);
        }
        setEnviando(false);
      }
    };
    void gerar();
    return () => { ativo = false; };
  }, [captura, clienteNome, portal, contaAtual, origemAtual, destinoAtual, kmAtual]);

  const abrirCaptura = async (linha: LinhaHistoricoCotacao, modo: 'pdf' | 'email') => {
    const mapa = await mapaEstaticoDaLinha(linha, clienteNome, portal);
    setMapaCaptura(mapa);
    setCaptura({ linha, modo });
  };

  const verPdf = (linha: LinhaHistoricoCotacao) => {
    if (captura) return;
    janelaPdf.current = window.open('', '_blank');
    try {
      janelaPdf.current?.document.write('<!DOCTYPE html><title>Cotação</title><p style="font-family:sans-serif;padding:24px">Gerando o PDF da cotação…</p>');
    } catch { /* popup bloqueado segue no download */ }
    setErroPdf('');
    void abrirCaptura(linha, 'pdf');
  };

  const chamar = async (caminho: string, method: string) => {
    if (clienteNome) return authFetch(caminho, { method });
    return fetch(caminho, { method, headers: portal.cabecalhos() });
  };

  const inativar = async (linha: LinhaHistoricoCotacao) => {
    setErro('');
    const resposta = await chamar(`/api/cotacoes/${linha.id}/inativar`, 'PATCH');
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      setErro(String(corpo.error || 'Não foi possível inativar a cotação.'));
      return;
    }
    setLinhas((lista) => lista.map((item) => item.id === linha.id ? { ...item, is_active: false, status: 'Inativa' } : item));
    setToast('Cotação inativada.');
  };

  const confirmarExclusao = async () => {
    if (!excluir) return;
    const linha = excluir;
    setExcluir(null);
    setErro('');
    const resposta = await chamar(`/api/cotacoes/${linha.id}`, 'DELETE');
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      setErro(String(corpo.error || 'Não foi possível excluir a cotação.'));
      return;
    }
    setLinhas((lista) => lista.filter((item) => item.id !== linha.id));
    setToast('Cotação excluída.');
  };

  const copiarLink = async (linha: LinhaHistoricoCotacao) => {
    setErro('');
    const init = { method: 'POST' };
    const resposta = clienteNome
      ? await authFetch(`/api/cotacoes/${linha.id}/link-visualizacao`, init)
      : await fetch(`/api/cotacoes/${linha.id}/link-visualizacao`, { ...init, headers: portal.cabecalhos() });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok || typeof corpo.caminho !== 'string') {
      setErro(String(corpo.error || 'Não foi possível gerar o link.'));
      return;
    }
    const url = `${window.location.origin}${corpo.caminho}`;
    try {
      await navigator.clipboard.writeText(url);
      const validade = typeof corpo.expiraEm === 'string'
        ? new Date(corpo.expiraEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';
      setToast(validade ? `Link copiado. Vale até ${validade}. A pessoa só vê esta proposta.` : 'Link copiado. A pessoa só vê esta proposta.');
    } catch {
      setToast(url);
    }
  };

  const abrirEmail = (linha: LinhaHistoricoCotacao) => {
    if (captura) return;
    const salvo = lerSnapshot(linha.contract_details);
    const para = salvo?.solicitanteEmail || ator.email || '';
    const proposta = propostaDaLinha(linha);
    setEmail({
      linha,
      para,
      cc: '',
      mensagem: cartaDaProposta(proposta),
    });
  };

  const dispararEmail = () => {
    if (!email || enviando) return;
    emailPendente.current = { para: email.para, cc: email.cc, mensagem: email.mensagem };
    setEnviando(true);
    setErroPdf('');
    const linha = email.linha;
    setEmail(null);
    void abrirCaptura(linha, 'email');
  };

  const criarOs = (linha: LinhaHistoricoCotacao) => {
    try {
      const salvo = lerSnapshot(linha.contract_details);
      const nomes = nomesDaVigencia(linha.origin, linha.destination, salvo?.vigencia);
      sessionStorage.setItem('tmseg-cotacao-os', JSON.stringify({
        origem: linha.origin,
        destino: linha.destination,
        nomeLinhaVigencia: nomes.tabela,
        nomeRotaVigencia: nomes.rota,
      }));
    } catch { /* a solicitação abre mesmo sem o endereço preenchido */ }
    window.dispatchEvent(new CustomEvent('tmseg-cotacao-criar-os'));
  };

  const editar = (linha: LinhaHistoricoCotacao) => {
    const salvo = lerSnapshot(linha.contract_details);
    onEditar?.({ origem: linha.origin, destino: linha.destination, paradas: salvo?.paradas || [], regiao: salvo?.regiao });
  };

  const copiarMsg = async (linha: LinhaHistoricoCotacao) => {
    const texto = mensagemCompletaCotacao(linha);
    try {
      await navigator.clipboard.writeText(texto);
      setErro('');
      setToast('Mensagem copiada.');
    } catch {
      setErro('Não foi possível copiar a mensagem.');
    }
  };

  const propostaCaptura = captura ? propostaDaLinha(captura.linha) : null;
  const linhaCaptura = captura?.linha;

  return (
    <section data-testid="historico-cotacoes" className="rounded-[28px] border border-white/80 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Cotações</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">Histórico de Cotações Recentes</h2>
        </div>
        <SeletorVigencia versao={versaoAtiva} onChange={trocarVersao} testId="seletor-vigencia-historico" />
      </div>
      <p className="mt-1 text-xs text-slate-500">As 10 mais recentes da Tabela {versaoAtiva}. A validade é de {PRAZO_COTACAO_DIAS} dias.</p>
      {toast && <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900" data-testid="toast-cotacao">{toast}</p>}
      {(aviso || erro || erroPdf) && (
        <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{erroPdf || aviso || erro}</p>
      )}
      {carregando && (
        <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="animate-spin" size={16} /> Lendo cotações…</p>
      )}
      {!carregando && linhas.length === 0 && <div className="mt-4"><HistoricoVazio texto={`Nenhuma cotação da Tabela ${versaoAtiva} deste cliente.`} /></div>}
      {!carregando && linhas.length > 0 && (
        <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-slate-100">
          <table className="min-w-[1180px] w-full text-left text-xs text-slate-700">
            <thead className="sticky top-0 bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Data/Hora</th>
                <th className="px-3 py-2">Solicitante</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Destino</th>
                <th className="px-3 py-2">Distância / Tempo</th>
                <th className="px-3 py-2">Região / Franquia</th>
                <th className="px-3 py-2">Valor KM</th>
                <th className="px-3 py-2">Hora Extra</th>
                <th className="px-3 py-2">Valor Total</th>
                <th className="px-3 py-2">Status / Validade</th>
                <th className="px-3 py-2"> </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => {
                const salvo = lerSnapshot(linha.contract_details);
                const validade = rotuloValidade(linha);
                const exibido = valoresExibidosDaLinha(linha, telaAtual());
                const franquia = salvo ? Boolean(salvo.usouMinimo) : linha.total_km > 0 && linha.total_km <= 100;
                return (
                  <tr key={linha.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3 font-semibold text-slate-900">{formatarDataHoraCotacao(linha.created_at)}</td>
                    <td className="px-3 py-3">
                      <span className="block font-semibold text-slate-900">{linha.created_by || '—'}</span>
                      {salvo?.solicitanteEmail ? <span className="mt-0.5 block text-[11px] text-slate-400">{salvo.solicitanteEmail}</span> : null}
                    </td>
                    <td className="px-3 py-3">{resumirEndereco(linha.origin)}</td>
                    <td className="px-3 py-3">{resumirEndereco(linha.destination)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{textoDistanciaTempo(exibido.km, exibido.duracaoMin)}</td>
                    <td className="px-3 py-3">{textoRegiaoFranquia(exibido.regiao, franquia)}</td>
                    <td className="px-3 py-3 whitespace-nowrap" data-testid={`valor-km-${linha.id}`}>{textoTarifaKm(exibido.tarifaKm)}</td>
                    <td className="px-3 py-3 whitespace-nowrap" data-testid={`hora-extra-${linha.id}`}>{textoHoraExtra(exibido.horaExtra)}</td>
                    <td className="px-3 py-3 font-black text-slate-900">{formatarValorCotacao(exibido.total)}</td>
                    <td className="px-3 py-3">{selo(validade.tom, validade.rotulo)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <AcoesDaLinha
                        id={linha.id}
                        mostrarDesativar={mostrarDesativarCotacao(ator, gestaoDaLinha(linha, salvo?.solicitanteEmail))}
                        mostrarExcluir={mostrarExcluirCotacao(ator, gestaoDaLinha(linha, salvo?.solicitanteEmail))}
                        mostrarCriarOs={!clienteNome && cotacaoSelecionavel(linha)}
                        mostrarAlterar={Boolean(onEditar)}
                        onPdf={() => verPdf(linha)}
                        onEmail={() => abrirEmail(linha)}
                        onCopiar={() => { void copiarMsg(linha); }}
                        onLink={() => { void copiarLink(linha); }}
                        onCriarOs={() => criarOs(linha)}
                        onAlterar={() => editar(linha)}
                        onDesativar={() => { void inativar(linha); }}
                        onExcluir={() => setExcluir(linha)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(pagina > 0 || temMais) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" disabled={pagina === 0} onClick={() => setPagina((atual) => Math.max(0, atual - 1))} className="h-9 rounded-full border border-slate-200 px-3 text-xs font-black text-slate-600 disabled:opacity-40">Mais recentes</button>
          <button type="button" disabled={!temMais} onClick={() => setPagina((atual) => atual + 1)} className="h-9 rounded-full border border-slate-200 px-3 text-xs font-black text-slate-600 disabled:opacity-40">Cotações mais antigas</button>
        </div>
      )}
      {excluir && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <p className="text-sm font-semibold text-slate-800">Tem certeza que deseja excluir esta cotação? Esta ação não pode ser desfeita.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setExcluir(null)} className="h-10 rounded-full border border-slate-200 px-4 text-xs font-black text-slate-600">Cancelar</button>
              <button type="button" onClick={() => { void confirmarExclusao(); }} className="h-10 rounded-full bg-red-700 px-4 text-xs font-black text-white">Excluir</button>
            </div>
          </div>
        </div>
      )}
      {email && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl" onSubmit={(evento) => { evento.preventDefault(); dispararEmail(); }}>
            <h3 className="text-base font-black text-slate-900">Enviar proposta</h3>
            <label className="mt-3 block text-[11px] font-bold uppercase text-slate-400">Destinatário
              <input required type="email" value={email.para} onChange={(evento) => setEmail({ ...email, para: evento.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold normal-case text-slate-900" />
            </label>
            <label className="mt-3 block text-[11px] font-bold uppercase text-slate-400">Cópia (CC)
              <input value={email.cc} onChange={(evento) => setEmail({ ...email, cc: evento.target.value })} placeholder="separe por vírgula" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold normal-case text-slate-900" />
            </label>
            <label className="mt-3 block text-[11px] font-bold uppercase text-slate-400">Mensagem
              <textarea value={email.mensagem} onChange={(evento) => setEmail({ ...email, mensagem: evento.target.value })} rows={7} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold normal-case text-slate-900" />
            </label>
            <p className="mt-2 text-[11px] text-slate-500">O PDF da cotação segue em anexo. Cópia para {COPIA_FIXA_COTACAO} e para quem fez a cotação.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEmail(null)} className="h-10 rounded-full border border-slate-200 px-4 text-xs font-black text-slate-600">Cancelar</button>
              <button type="submit" disabled={enviando} className="h-10 rounded-full bg-[#10284f] px-4 text-xs font-black text-white disabled:opacity-40">Enviar</button>
            </div>
          </form>
        </div>
      )}
      {captura && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45" role="status" data-testid="overlay-pdf-historico">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-2xl">
            <Loader2 className="animate-spin text-slate-900" size={22} />
            <p className="text-sm font-semibold text-slate-900">Gerando PDF da proposta, aguarde...</p>
          </div>
        </div>
      )}
      {linhaCaptura && propostaCaptura && (
        <ExperienciaProposta
          modoCaptura
          frase=""
          mostrando
          proposta={propostaCaptura}
          pedido={{ regiao: propostaCaptura.regiao, origem: linhaCaptura.origin, destino: linhaCaptura.destination, paradas: propostaCaptura.paradas, km: linhaCaptura.total_km }}
          clienteInterno={clienteNome}
          printMapa={mapaCaptura}
          marcaPdf="historico"
          dataTexto={dataLongaCotacao(linhaCaptura.created_at)}
          onFechar={() => setCaptura(null)}
        />
      )}
    </section>
  );
};
