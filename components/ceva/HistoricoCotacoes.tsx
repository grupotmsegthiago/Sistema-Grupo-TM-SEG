import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, Loader2, Mail, MoreHorizontal, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { authFetch } from '../../lib/authFetch';
import { cotacaoSelecionavel, type VersaoTabelaRegional } from '../../lib/precificacao/tabela2027';
import { cartaEmailCotacao, cotacaoExcluida, podeGerirCotacao, textoHoraExtra, textoTarifaKm, type AtorCotacao } from '../../lib/portalCliente/gestaoCotacao';
import { nomesDaVigencia } from '../../lib/portalCliente/cotacao';
import {
  TEXTO_HISTORICO_VAZIO,
  TAMANHO_PAGINA_HISTORICO,
  JANELA_HISTORICO_VIGENCIA,
  dataLongaCotacao,
  formatarDataHoraCotacao,
  formatarValorCotacao,
  lerSnapshot,
  nomePdfCotacao,
  normalizarLinhaHistorico,
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

export type EdicaoCotacao = {
  origem: string;
  destino: string;
  paradas: string[];
  regiao?: string;
};

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
}> = ({ clienteNome, clientId, recarga, aviso, versao, onVersao, onEditar }) => {
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
  const [menuId, setMenuId] = useState<string | null>(null);
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
        if (modo === 'email') {
          const { pdfBase64DaProposta } = await import('./abrirPdfCotacao');
          const pdf = await pdfBase64DaProposta(artigo);
          const pendente = emailPendente.current;
          const init = { method: 'POST', body: JSON.stringify({ para: pendente?.para || '', cc: pendente?.cc || '', mensagem: pendente?.mensagem || '', pdf }) };
          const resposta = clienteNome
            ? await authFetch(`/api/cotacoes/${linha.id}/enviar-email`, init)
            : await fetch(`/api/cotacoes/${linha.id}/enviar-email`, { ...init, headers: { ...portal.cabecalhos(), 'Content-Type': 'application/json' } });
          const corpo = await resposta.json().catch(() => ({}));
          if (!resposta.ok) throw new Error(corpo.error || 'Não foi possível enviar o e-mail.');
          if (corpo.enviado === false) setErroPdf(String(corpo.aviso || 'O e-mail não saiu agora.'));
          else setToast('Proposta enviada por e-mail.');
        } else {
          const { abrirPdfDaProposta } = await import('./abrirPdfCotacao');
          await abrirPdfDaProposta(artigo, nomePdfCotacao(linha.client_name || 'CEVA', linha.id), janela);
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
  }, [captura, clienteNome, portal]);

  const abrirCaptura = async (linha: LinhaHistoricoCotacao, modo: 'pdf' | 'email') => {
    const mapa = await mapaEstaticoDaLinha(linha, clienteNome, portal);
    setMapaCaptura(mapa);
    setCaptura({ linha, modo });
  };

  const verPdf = (linha: LinhaHistoricoCotacao) => {
    setMenuId(null);
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
    setMenuId(null);
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

  const abrirEmail = (linha: LinhaHistoricoCotacao) => {
    setMenuId(null);
    const salvo = lerSnapshot(linha.contract_details);
    const para = salvo?.solicitanteEmail || ator.email || '';
    setEmail({
      linha,
      para,
      cc: '',
      mensagem: cartaEmailCotacao({ origem: linha.origin, destino: linha.destination, km: linha.total_km, valor: linha.total_value }),
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
    setMenuId(null);
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
    setMenuId(null);
    const salvo = lerSnapshot(linha.contract_details);
    onEditar?.({ origem: linha.origin, destino: linha.destination, paradas: salvo?.paradas || [], regiao: salvo?.regiao });
  };

  const propostaCaptura = captura ? propostaDoHistorico(captura.linha) : null;
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
      <p className="mt-1 text-xs text-slate-500">As 10 mais recentes da Tabela {versaoAtiva}. A validade é de 30 dias.</p>
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
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => {
                const salvo = lerSnapshot(linha.contract_details);
                const validade = rotuloValidade(linha);
                const regiao = salvo?.regiao || '—';
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
                    <td className="px-3 py-3 whitespace-nowrap">{textoDistanciaTempo(linha.total_km, salvo?.duracaoMin ?? null)}</td>
                    <td className="px-3 py-3">{textoRegiaoFranquia(regiao, franquia)}</td>
                    <td className="px-3 py-3 whitespace-nowrap" data-testid={`valor-km-${linha.id}`}>{textoTarifaKm(salvo?.kmExtra)}</td>
                    <td className="px-3 py-3 whitespace-nowrap" data-testid={`hora-extra-${linha.id}`}>{textoHoraExtra(salvo?.horaExtra)}</td>
                    <td className="px-3 py-3 font-black text-slate-900">{formatarValorCotacao(linha.total_value)}</td>
                    <td className="px-3 py-3">{selo(validade.tom, validade.rotulo)}</td>
                    <td className="relative px-3 py-3">
                      <button type="button" aria-label="Ações da cotação" data-testid={`acoes-${linha.id}`} onClick={() => setMenuId((atual) => atual === linha.id ? null : linha.id)} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-600">
                        <MoreHorizontal size={16} />
                      </button>
                      {menuId === linha.id && (
                        <div className="absolute right-2 z-20 mt-1 w-44 rounded-2xl border border-slate-100 bg-white p-1 shadow-xl">
                          <button type="button" onClick={() => verPdf(linha)} data-testid={`ver-pdf-${linha.id}`} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold text-slate-700 hover:bg-slate-50"><FileDown size={14} /> Ver PDF</button>
                          {!clienteNome && cotacaoSelecionavel(linha) && (
                            <button type="button" onClick={() => criarOs(linha)} data-testid={`criar-os-${linha.id}`} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold text-slate-700 hover:bg-slate-50"><Plus size={14} /> Criar OS</button>
                          )}
                          <button type="button" onClick={() => editar(linha)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold text-slate-700 hover:bg-slate-50"><Pencil size={14} /> Alterar</button>
                          <button type="button" onClick={() => abrirEmail(linha)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold text-slate-700 hover:bg-slate-50"><Mail size={14} /> Enviar por e-mail</button>
                          {podeGerirCotacao(ator, { id: linha.id, client_name: linha.client_name, created_by: linha.created_by, solicitanteEmail: salvo?.solicitanteEmail }) && (
                            <>
                              <button type="button" onClick={() => { void inativar(linha); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold text-amber-800 hover:bg-amber-50"><Power size={14} /> Inativar</button>
                              <button type="button" onClick={() => { setMenuId(null); setExcluir(linha); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold text-red-700 hover:bg-red-50"><Trash2 size={14} /> Excluir</button>
                            </>
                          )}
                        </div>
                      )}
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
            <p className="mt-2 text-[11px] text-slate-500">O PDF da cotação segue em anexo.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEmail(null)} className="h-10 rounded-full border border-slate-200 px-4 text-xs font-black text-slate-600">Cancelar</button>
              <button type="submit" disabled={enviando} className="h-10 rounded-full bg-[#10284f] px-4 text-xs font-black text-white disabled:opacity-40">Enviar</button>
            </div>
          </form>
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
