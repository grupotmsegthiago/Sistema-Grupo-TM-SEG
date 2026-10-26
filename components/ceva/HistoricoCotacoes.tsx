import React, { useEffect, useRef, useState } from 'react';
import { FileDown, Loader2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cotacaoSelecionavel, type VersaoTabelaRegional } from '../../lib/precificacao/tabela2027';
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

function selo(tom: 'ativa' | 'convertida' | 'expirada', rotulo: string) {
  const classe = tom === 'ativa'
    ? 'bg-emerald-50 text-emerald-800'
    : tom === 'convertida'
      ? 'bg-sky-50 text-sky-800'
      : 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-black ${classe}`}>{rotulo}</span>;
}

export const HistoricoCotacoes: React.FC<{
  clienteNome?: string;
  clientId?: string | number | null;
  recarga: number;
  aviso?: string;
  versao?: VersaoTabelaRegional;
  onVersao?: (versao: VersaoTabelaRegional) => void;
}> = ({ clienteNome, clientId, recarga, aviso, versao, onVersao }) => {
  const portal = usePortalCliente();
  const [versaoLocal, setVersaoLocal] = useState<VersaoTabelaRegional>('2027');
  const versaoAtiva = versao ?? versaoLocal;
  const [linhas, setLinhas] = useState<LinhaHistoricoCotacao[]>([]);
  const [pagina, setPagina] = useState(0);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [erroPdf, setErroPdf] = useState('');
  const [captura, setCaptura] = useState<LinhaHistoricoCotacao | null>(null);
  const janelaPdf = useRef<Window | null>(null);
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
          setLinhas(Array.isArray(corpo.cotacoes) ? corpo.cotacoes.map((item: Record<string, unknown>) => normalizarLinhaHistorico(item)) : []);
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
          .filter((item) => vigenciaDaCotacao(item) === versaoAtiva);
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
    const linha = captura;
    const janela = janelaPdf.current;
    let ativo = true;
    const gerar = async () => {
      await new Promise((resolver) => window.setTimeout(resolver, 80));
      const artigo = document.querySelector('[data-proposta-pdf="1"]');
      if (!(artigo instanceof HTMLElement) || !ativo) return;
      try {
        const { abrirPdfDaProposta } = await import('./abrirPdfCotacao');
        await abrirPdfDaProposta(artigo, nomePdfCotacao(linha.client_name || 'CEVA', linha.id), janela);
      } catch (falha) {
        if (ativo) setErroPdf(falha instanceof Error ? falha.message : 'Não foi possível reabrir o PDF.');
        try { janela?.close(); } catch { /* a janela pode já ter fechado */ }
      } finally {
        if (ativo) setCaptura(null);
      }
    };
    void gerar();
    return () => { ativo = false; };
  }, [captura]);

  const verPdf = (linha: LinhaHistoricoCotacao) => {
    janelaPdf.current = window.open('', '_blank');
    try {
      janelaPdf.current?.document.write('<!DOCTYPE html><title>Cotação</title><p style="font-family:sans-serif;padding:24px">Gerando o PDF da cotação…</p>');
    } catch { /* popup bloqueado segue no download */ }
    setErroPdf('');
    setCaptura(linha);
  };

  const criarOs = (linha: LinhaHistoricoCotacao) => {
    try {
      sessionStorage.setItem('tmseg-cotacao-os', JSON.stringify({ origem: linha.origin, destino: linha.destination }));
    } catch { /* a solicitação abre mesmo sem o endereço preenchido */ }
    window.dispatchEvent(new CustomEvent('tmseg-cotacao-criar-os'));
  };

  const propostaCaptura = captura ? propostaDoHistorico(captura) : null;

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
      {(aviso || erro || erroPdf) && (
        <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{erroPdf || aviso || erro}</p>
      )}
      {carregando && (
        <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="animate-spin" size={16} /> Lendo cotações…</p>
      )}
      {!carregando && linhas.length === 0 && <div className="mt-4"><HistoricoVazio texto={`Nenhuma cotação da Tabela ${versaoAtiva} deste cliente.`} /></div>}
      {!carregando && linhas.length > 0 && (
        <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-slate-100">
          <table className="min-w-[980px] w-full text-left text-xs text-slate-700">
            <thead className="sticky top-0 bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Data/Hora</th>
                <th className="px-3 py-2">Solicitante</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Destino</th>
                <th className="px-3 py-2">Distância / Tempo</th>
                <th className="px-3 py-2">Região / Franquia</th>
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
                    <td className="px-3 py-3 font-black text-slate-900">{formatarValorCotacao(linha.total_value)}</td>
                    <td className="px-3 py-3">{selo(validade.tom, validade.rotulo)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => verPdf(linha)} data-testid={`ver-pdf-${linha.id}`} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#10284f] px-3 text-[11px] font-black text-white">
                          <FileDown size={14} /> Ver PDF
                        </button>
                        {!clienteNome && cotacaoSelecionavel(linha) && (
                          <button type="button" onClick={() => criarOs(linha)} data-testid={`criar-os-${linha.id}`} className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 px-3 text-[11px] font-black text-[#10284f]">
                            <Plus size={14} /> Criar OS
                          </button>
                        )}
                      </div>
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
      {captura && propostaCaptura && (
        <ExperienciaProposta
          modoCaptura
          frase=""
          mostrando
          proposta={propostaCaptura}
          pedido={{ regiao: propostaCaptura.regiao, origem: captura.origin, destino: captura.destination, paradas: propostaCaptura.paradas, km: captura.total_km }}
          clienteInterno={clienteNome}
          dataTexto={dataLongaCotacao(captura.created_at)}
          onFechar={() => setCaptura(null)}
        />
      )}
    </section>
  );
};
