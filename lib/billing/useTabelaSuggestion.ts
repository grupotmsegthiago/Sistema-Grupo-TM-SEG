import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { destinoBloqueiaSugestao, fetchTopTabelasSugestao } from './tabelaNaCriacao';

export interface TabelaSuggestion {
  tabelaClienteSugeridaId: string | null;
  tabelaFornecedorSugeridaId: string | null;
  loadingSugestao: boolean;
}

const VAZIO: TabelaSuggestion = {
  tabelaClienteSugeridaId: null,
  tabelaFornecedorSugeridaId: null,
  loadingSugestao: false,
};

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
  isRotaPredefinida: boolean;
}): TabelaSuggestion {
  const [estado, setEstado] = useState<TabelaSuggestion>(VAZIO);
  const chaveAtual = `${entrada.clienteId}|${entrada.origem}|${entrada.destino}|${entrada.fornecedorId || ''}|${entrada.isRotaPredefinida}`;
  const chaveVista = useRef<string | null>(null);
  if (chaveVista.current !== chaveAtual) {
    chaveVista.current = chaveAtual;
    if (podeDispararSugestao(entrada.clienteId, entrada.origem, entrada.destino)) {
      setEstado({ tabelaClienteSugeridaId: null, tabelaFornecedorSugeridaId: null, loadingSugestao: true });
    } else {
      setEstado((prev) => (prev.loadingSugestao || prev.tabelaClienteSugeridaId || prev.tabelaFornecedorSugeridaId ? VAZIO : prev));
    }
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
    setEstado({ tabelaClienteSugeridaId: null, tabelaFornecedorSugeridaId: null, loadingSugestao: true });
    const timer = setTimeout(() => {
      fetchTopTabelasSugestao(supabase, clienteId, fornecedorId, origem, destino, ac.signal)
        .then((resultado) => {
          if (cancelado || ac.signal.aborted) return;
          setEstado({ ...resultado, loadingSugestao: false });
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
  }, [entrada.clienteId, entrada.fornecedorId, entrada.origem, entrada.destino, entrada.isRotaPredefinida]);

  return estado;
}
