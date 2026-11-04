import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { destinoBloqueiaSugestao, fetchUltimaTabelaAprovada } from './tabelaNaCriacao';

export interface TabelaSuggestion {
  tabelaClienteSugeridaId: string | null;
  tabelaFornecedorSugeridaId: string | null;
  osOrigemId: string | null;
  osOrigemEm: string | null;
  pedagioReal: number | null;
  loadingSugestao: boolean;
}

const VAZIO: TabelaSuggestion = {
  tabelaClienteSugeridaId: null,
  tabelaFornecedorSugeridaId: null,
  osOrigemId: null,
  osOrigemEm: null,
  pedagioReal: null,
  loadingSugestao: false,
};

/** A herança volta quando cliente, fornecedor, rota ou tipo mudam. A troca manual segura a tabela. */
export function deveAplicarSugestao(operadorAlterouTabela: boolean, camposChaveMudaram: boolean): boolean {
  if (camposChaveMudaram) return true;
  return !operadorAlterouTabela;
}

export function podeDispararSugestao(clienteId: string, origem: string, destino: string): boolean {
  if (!String(clienteId || '').trim() || !String(origem || '').trim()) return false;
  return !destinoBloqueiaSugestao(destino);
}

/** Rota pré-cadastrada dispara na hora. Digitação de origem, destino ou fornecedor espera 1,2s. */
export function atrasoDaSugestao(entrada: {
  isRotaPredefinida: boolean;
  rotaMudou: boolean;
  ligouRotaPredefinida: boolean;
}): number {
  if (entrada.ligouRotaPredefinida || (entrada.isRotaPredefinida && entrada.rotaMudou)) return 0;
  return 1200;
}

export function useTabelaSuggestion(entrada: {
  clienteId: string;
  fornecedorId?: string | null;
  origem: string;
  destino: string;
  tipoMissao?: string | null;
  isRotaPredefinida: boolean;
}): TabelaSuggestion {
  const [estado, setEstado] = useState<TabelaSuggestion>(VAZIO);
  const chaveAtual = `${entrada.clienteId}|${entrada.origem}|${entrada.destino}|${entrada.fornecedorId || ''}|${entrada.tipoMissao || ''}|${entrada.isRotaPredefinida}`;
  const chaveVista = useRef<string | null>(null);
  let exibicao = estado;
  if (chaveVista.current !== chaveAtual) {
    chaveVista.current = chaveAtual;
    exibicao = podeDispararSugestao(entrada.clienteId, entrada.origem, entrada.destino)
      ? { ...VAZIO, loadingSugestao: true }
      : VAZIO;
    setEstado(exibicao);
  }
  const anterior = useRef({
    clienteId: entrada.clienteId,
    origem: entrada.origem,
    destino: entrada.destino,
    isRotaPredefinida: entrada.isRotaPredefinida,
  });

  useEffect(() => {
    const clienteId = String(entrada.clienteId || '');
    const origem = String(entrada.origem || '');
    const destino = String(entrada.destino || '');
    const fornecedorId = String(entrada.fornecedorId || '');
    const tipoMissao = String(entrada.tipoMissao || '');
    const rotaMudou = anterior.current.clienteId !== clienteId
      || anterior.current.origem !== origem
      || anterior.current.destino !== destino;
    const ligouRotaPredefinida = entrada.isRotaPredefinida && !anterior.current.isRotaPredefinida;
    anterior.current = {
      clienteId,
      origem,
      destino,
      isRotaPredefinida: entrada.isRotaPredefinida,
    };

    if (!podeDispararSugestao(clienteId, origem, destino)) {
      setEstado(VAZIO);
      return;
    }

    const atraso = atrasoDaSugestao({
      isRotaPredefinida: entrada.isRotaPredefinida,
      rotaMudou,
      ligouRotaPredefinida,
    });
    const ac = new AbortController();
    let cancelado = false;
    setEstado({ ...VAZIO, loadingSugestao: true });
    const timer = setTimeout(() => {
      fetchUltimaTabelaAprovada(supabase, clienteId, fornecedorId, origem, destino, tipoMissao, ac.signal)
        .then((resultado) => {
          if (cancelado || ac.signal.aborted) return;
          setEstado({
            tabelaClienteSugeridaId: resultado.tabelaClienteSugeridaId,
            tabelaFornecedorSugeridaId: resultado.tabelaFornecedorSugeridaId,
            osOrigemId: resultado.osOrigemId || null,
            osOrigemEm: resultado.osOrigemEm || null,
            pedagioReal: resultado.pedagioReal == null || !Number.isFinite(Number(resultado.pedagioReal))
              ? null
              : Number(resultado.pedagioReal),
            loadingSugestao: false,
          });
        })
        .catch((erro: unknown) => {
          if (cancelado || ac.signal.aborted) return;
          console.warn('[Tabela da criação] histórico indisponível', erro);
          setEstado(VAZIO);
        });
    }, atraso);

    return () => {
      cancelado = true;
      clearTimeout(timer);
      ac.abort();
    };
  }, [entrada.clienteId, entrada.fornecedorId, entrada.origem, entrada.destino, entrada.tipoMissao, entrada.isRotaPredefinida]);

  return exibicao;
}
