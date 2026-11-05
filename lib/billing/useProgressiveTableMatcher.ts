import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import {
  ATRASO_DIGITACAO_MS,
  RESULTADO_TABELA_VAZIO,
  carregarHistoricoAprovado,
  resolverTabelaProgressiva,
  type LinhaPreco,
  type OsHistoricoTabela,
  type ResultadoTabelaProgressiva,
} from './progressiveTableMatcher';

export interface ProgressiveTableMatcherInput {
  cliente: string;
  fornecedor?: string | null;
  origem: string;
  destino: string;
  tipoMissao?: string | null;
  distanciaKm?: number | null;
  tabelasCliente: LinhaPreco[];
  tabelasFornecedor: LinhaPreco[];
  imediato?: boolean;
}

export interface ProgressiveTableMatcherState extends ResultadoTabelaProgressiva {
  carregando: boolean;
}

const VAZIO: ProgressiveTableMatcherState = { ...RESULTADO_TABELA_VAZIO, carregando: false };

/**
 * Histórico do cliente entra uma vez. Origem, destino e fornecedor resolvem em memória.
 * A escolha manual da tela fica fora daqui: quem chama decide se aplica o resultado.
 */
export function useProgressiveTableMatcher(entrada: ProgressiveTableMatcherInput): ProgressiveTableMatcherState {
  const cliente = String(entrada.cliente || '').trim();
  const [historico, setHistorico] = useState<OsHistoricoTabela[]>([]);
  const [historicoCliente, setHistoricoCliente] = useState('');
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [estado, setEstado] = useState<ProgressiveTableMatcherState>(VAZIO);

  useEffect(() => {
    if (!cliente) {
      setHistorico([]);
      setHistoricoCliente('');
      setCarregandoHistorico(false);
      return;
    }
    const ac = new AbortController();
    let cancelado = false;
    setCarregandoHistorico(true);
    setHistorico([]);
    setHistoricoCliente('');
    carregarHistoricoAprovado(supabase, cliente, ac.signal)
      .then((linhas) => {
        if (cancelado || ac.signal.aborted) return;
        setHistorico(linhas);
        setHistoricoCliente(cliente);
      })
      .catch((erro: unknown) => {
        if (cancelado || ac.signal.aborted) return;
        console.warn('[Tabela progressiva] histórico indisponível', erro);
        setHistorico([]);
        setHistoricoCliente(cliente);
      })
      .finally(() => {
        if (!cancelado) setCarregandoHistorico(false);
      });
    return () => {
      cancelado = true;
      ac.abort();
    };
  }, [cliente]);

  const assinaturaTabelas = `${entrada.tabelasCliente.map((tabela) => tabela.id).join(',')}|${entrada.tabelasFornecedor.map((tabela) => tabela.id).join(',')}`;

  useEffect(() => {
    const tipo = String(entrada.tipoMissao || '').trim();
    const destino = String(entrada.destino || '').trim();
    if (!cliente || !tipo || !destino || carregandoHistorico || historicoCliente !== cliente) {
      setEstado(carregandoHistorico ? { ...VAZIO, carregando: true } : VAZIO);
      return;
    }
    const atraso = entrada.imediato ? 0 : ATRASO_DIGITACAO_MS;
    let cancelado = false;
    setEstado((atual) => ({ ...atual, carregando: true }));
    const timer = setTimeout(() => {
      if (cancelado) return;
      const resultado = resolverTabelaProgressiva({
        tipoMissao: tipo,
        cliente,
        fornecedor: entrada.fornecedor,
        origem: entrada.origem,
        destino,
        distanciaKm: entrada.distanciaKm,
        tabelasCliente: entrada.tabelasCliente,
        tabelasFornecedor: entrada.tabelasFornecedor,
        historico,
      });
      setEstado({ ...resultado, carregando: false });
    }, atraso);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [
    cliente,
    entrada.fornecedor,
    entrada.origem,
    entrada.destino,
    entrada.tipoMissao,
    entrada.distanciaKm,
    entrada.imediato,
    assinaturaTabelas,
    historico,
    historicoCliente,
    carregandoHistorico,
  ]);

  return estado;
}
