/** Histórico da cotação do portal. A OS continua em missions; esta gravação não recalcula valor aprovado. */

import {
  PRAZO_COTACAO_MS,
  cotacaoConvertida,
  cotacaoVencida,
  type CotacaoPrazo,
  type VersaoTabelaRegional,
} from '../precificacao/tabela2027';
import type { PropostaPortal } from './cotacao';

export const TEXTO_HISTORICO_VAZIO = 'Nenhuma cotação recente deste cliente.';
export const TAMANHO_PAGINA_HISTORICO = 10;
export const JANELA_HISTORICO_VIGENCIA = 100;
export const KIND_PORTAL_COTACAO = 'PORTAL_COTACAO';

export type SnapshotCotacaoPortal = {
  kind: typeof KIND_PORTAL_COTACAO;
  duracaoMin: number | null;
  usouMinimo: boolean;
  regiao: string;
  kmFranquia: number;
  horasFranquia: number;
  kmExtra: number;
  horaExtra: number;
  acionamento: number;
  paradas: string[];
  solicitanteEmail: string;
  acordada: boolean;
  operacao: string;
  vigencia: VersaoTabelaRegional;
};

export type LinhaHistoricoCotacao = CotacaoPrazo & {
  id: string;
  client_id: number | null;
  client_name: string;
  origin: string;
  destination: string;
  total_km: number;
  total_hours: number;
  total_value: number;
  created_by: string;
  contract_details?: string | null;
};

export type ValidadeCotacao = {
  tom: 'ativa' | 'convertida' | 'expirada';
  rotulo: string;
};

export type PedidoRegistroCotacao = {
  origem?: unknown;
  destino?: unknown;
  km?: unknown;
  duracaoMin?: unknown;
  valor?: unknown;
  horas?: unknown;
  regiao?: unknown;
  kmFranquia?: unknown;
  kmExtra?: unknown;
  horaExtra?: unknown;
  acionamento?: unknown;
  paradas?: unknown;
  acordada?: unknown;
  operacao?: unknown;
  usouMinimo?: unknown;
  vigencia?: unknown;
};

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function texto(valor: unknown, limite = 240): string {
  return String(valor || '').trim().slice(0, limite);
}

export function resumirEndereco(endereco: string | null | undefined, limite = 42): string {
  const trecho = String(endereco || '').split(',')[0]?.trim() || '';
  if (!trecho) return '—';
  if (trecho.length <= limite) return trecho;
  return `${trecho.slice(0, Math.max(1, limite - 1)).trimEnd()}…`;
}

export function formatarDataHoraCotacao(iso: string | null | undefined): string {
  const data = iso ? new Date(iso) : null;
  if (!data || Number.isNaN(data.getTime())) return '—';
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(data);
  const pegar = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value || '';
  const hora = pegar('hour').padStart(2, '0');
  const minuto = pegar('minute').padStart(2, '0');
  return `${pegar('day')}/${pegar('month')}/${pegar('year')} ${hora}:${minuto}`;
}

export function dataLongaCotacao(iso: string | null | undefined): string {
  const data = iso ? new Date(iso) : null;
  if (!data || Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function nomePdfCotacao(cliente: string, id: string): string {
  const palavra = String(cliente || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
  const limpa = palavra.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '') || 'Cliente';
  const sufixo = String(id || 'sem-id').replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) || 'sem-id';
  return `Cotacao-${limpa}-${sufixo}.pdf`;
}

export function diasRestantesCotacao(cotacao: CotacaoPrazo, agora = new Date()): number {
  const criada = cotacao.created_at ? new Date(cotacao.created_at) : null;
  if (!criada || Number.isNaN(criada.getTime())) return 0;
  const restante = criada.getTime() + PRAZO_COTACAO_MS - agora.getTime();
  if (restante <= 0) return cotacaoVencida(cotacao, agora) ? 0 : 1;
  return Math.max(1, Math.ceil(restante / (24 * 60 * 60 * 1000)));
}

export function rotuloValidade(cotacao: CotacaoPrazo, agora = new Date()): ValidadeCotacao {
  if (cotacaoConvertida(cotacao)) return { tom: 'convertida', rotulo: 'Convertida em OS' };
  const status = String(cotacao.status || '').trim().toLowerCase();
  if (cotacaoVencida(cotacao, agora) || status === 'expirada' || cotacao.is_active === false) {
    return { tom: 'expirada', rotulo: 'Expirada' };
  }
  const dias = diasRestantesCotacao(cotacao, agora);
  return { tom: 'ativa', rotulo: dias === 1 ? 'Ativa · 1 dia' : `Ativa · ${dias} dias` };
}

export function textoDistanciaTempo(km: number, duracaoMin: number | null): string {
  const kmTexto = `${numero(km).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  if (duracaoMin == null || !Number.isFinite(duracaoMin) || duracaoMin <= 0) return kmTexto;
  const minutos = Math.round(duracaoMin);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const tempo = horas <= 0 ? `${resto} min` : `${horas}h ${String(resto).padStart(2, '0')}min`;
  return `${kmTexto} | ${tempo}`;
}

export function textoRegiaoFranquia(regiao: string, usouMinimo: boolean): string {
  const nome = String(regiao || '').trim() || '—';
  return usouMinimo ? `${nome} · franquia mínima` : nome;
}

export function vigenciaInformada(valor: unknown): VersaoTabelaRegional | null {
  const marca = String(valor || '').trim();
  if (marca === '2026' || marca === '2027') return marca;
  return null;
}

/** Cotação sem marca foi feita antes da Tabela 2027 e permanece na vigência 2026. */
export function vigenciaDaCotacao(cotacao: { contract_details?: string | null } | null | undefined): VersaoTabelaRegional {
  const bruto = cotacao?.contract_details;
  if (!bruto) return '2026';
  try {
    const dados = JSON.parse(bruto) as { vigencia?: unknown; pricing_version?: unknown };
    return vigenciaInformada(dados?.vigencia) || vigenciaInformada(dados?.pricing_version) || '2026';
  } catch {
    return '2026';
  }
}

export function formatarValorCotacao(valor: number): string {
  return numero(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function montarSnapshot(entrada: {
  duracaoMin?: number | null;
  usouMinimo?: boolean;
  regiao?: string;
  kmFranquia?: number;
  horasFranquia?: number;
  kmExtra?: number;
  horaExtra?: number;
  acionamento?: number;
  paradas?: string[];
  solicitanteEmail?: string;
  acordada?: boolean;
  operacao?: string;
  vigencia?: VersaoTabelaRegional | null;
}): SnapshotCotacaoPortal {
  return {
    kind: KIND_PORTAL_COTACAO,
    duracaoMin: entrada.duracaoMin != null && Number.isFinite(entrada.duracaoMin) && entrada.duracaoMin > 0 ? Math.round(entrada.duracaoMin) : null,
    usouMinimo: Boolean(entrada.usouMinimo),
    regiao: texto(entrada.regiao, 80),
    kmFranquia: numero(entrada.kmFranquia),
    horasFranquia: numero(entrada.horasFranquia),
    kmExtra: numero(entrada.kmExtra),
    horaExtra: numero(entrada.horaExtra),
    acionamento: numero(entrada.acionamento),
    paradas: (entrada.paradas || []).map((item) => texto(item, 180)).filter(Boolean).slice(0, 12),
    solicitanteEmail: texto(entrada.solicitanteEmail, 160),
    acordada: Boolean(entrada.acordada),
    operacao: texto(entrada.operacao, 180),
    vigencia: entrada.vigencia === '2027' ? '2027' : '2026',
  };
}

export function lerSnapshot(bruto: string | null | undefined): SnapshotCotacaoPortal | null {
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto) as Partial<SnapshotCotacaoPortal>;
    if (!dados || dados.kind !== KIND_PORTAL_COTACAO) return null;
    return montarSnapshot({
      duracaoMin: dados.duracaoMin,
      usouMinimo: dados.usouMinimo,
      regiao: dados.regiao,
      kmFranquia: dados.kmFranquia,
      horasFranquia: dados.horasFranquia,
      kmExtra: dados.kmExtra,
      horaExtra: dados.horaExtra,
      acionamento: dados.acionamento,
      paradas: Array.isArray(dados.paradas) ? dados.paradas : [],
      solicitanteEmail: dados.solicitanteEmail,
      acordada: dados.acordada,
      operacao: dados.operacao,
      vigencia: vigenciaInformada(dados.vigencia),
    });
  } catch {
    return null;
  }
}

export function propostaDoHistorico(linha: Pick<LinhaHistoricoCotacao, 'origin' | 'destination' | 'total_km' | 'total_hours' | 'total_value' | 'contract_details'>): PropostaPortal {
  const salvo = lerSnapshot(linha.contract_details);
  if (salvo) {
    return {
      acordada: salvo.acordada,
      regiao: salvo.regiao,
      origem: linha.origin,
      destino: linha.destination,
      paradas: salvo.paradas,
      acionamento: salvo.acionamento || numero(linha.total_value),
      kmFranquia: salvo.kmFranquia,
      horasFranquia: salvo.horasFranquia,
      kmExtra: salvo.kmExtra,
      horaExtra: salvo.horaExtra,
      operacao: salvo.operacao || `${linha.origin} X ${linha.destination}`,
    };
  }
  return {
    acordada: false,
    regiao: '',
    origem: linha.origin,
    destino: linha.destination,
    paradas: [],
    acionamento: numero(linha.total_value),
    kmFranquia: numero(linha.total_km),
    horasFranquia: numero(linha.total_hours),
    kmExtra: 0,
    horaExtra: 0,
    operacao: `${linha.origin} X ${linha.destination}`,
  };
}

export function pedidoParaRegistro(
  pedido: PedidoRegistroCotacao,
  cliente: { id?: unknown; name?: string | null },
  solicitante: { name?: string | null; email?: string | null },
): { ok: true; linha: Record<string, unknown>; snapshot: SnapshotCotacaoPortal } | { ok: false; error: string } {
  const origem = texto(pedido.origem, 300);
  const destino = texto(pedido.destino, 300);
  const km = numero(pedido.km);
  const valor = numero(pedido.valor ?? pedido.acionamento);
  const idCliente = Number(cliente.id);
  const nomeCliente = texto(cliente.name, 180);
  if (!Number.isFinite(idCliente) || idCliente <= 0 || !nomeCliente) return { ok: false, error: 'Cliente da cotação não encontrado.' };
  if (!origem || !destino || km <= 0) return { ok: false, error: 'Faltam origem, destino ou a distância da rota.' };
  const nome = texto(solicitante.name, 160) || texto(solicitante.email, 160) || 'Portal';
  const snapshot = montarSnapshot({
    duracaoMin: pedido.duracaoMin == null || pedido.duracaoMin === '' ? null : numero(pedido.duracaoMin),
    usouMinimo: Boolean(pedido.usouMinimo),
    regiao: texto(pedido.regiao, 80),
    kmFranquia: numero(pedido.kmFranquia),
    horasFranquia: numero(pedido.horas),
    kmExtra: numero(pedido.kmExtra),
    horaExtra: numero(pedido.horaExtra),
    acionamento: numero(pedido.acionamento ?? pedido.valor),
    paradas: Array.isArray(pedido.paradas) ? pedido.paradas.map((item) => String(item || '')) : [],
    solicitanteEmail: texto(solicitante.email, 160),
    acordada: Boolean(pedido.acordada),
    operacao: texto(pedido.operacao, 180),
    vigencia: vigenciaInformada(pedido.vigencia) || '2026',
  });
  return {
    ok: true,
    snapshot,
    linha: {
      client_id: idCliente,
      client_name: nomeCliente,
      origin: origem,
      destination: destino,
      total_km: km,
      total_hours: numero(pedido.horas),
      total_value: valor,
      status: 'Enviada',
      is_active: true,
      quote_source: 'ROTA',
      created_by: nome,
      contract_details: JSON.stringify(snapshot),
    },
  };
}

export function normalizarLinhaHistorico(row: Record<string, unknown>): LinhaHistoricoCotacao {
  return {
    id: String(row.id || ''),
    client_id: row.client_id == null ? null : Number(row.client_id),
    client_name: String(row.client_name || ''),
    origin: String(row.origin || ''),
    destination: String(row.destination || ''),
    total_km: numero(row.total_km),
    total_hours: numero(row.total_hours),
    total_value: numero(row.total_value),
    created_at: row.created_at == null ? null : String(row.created_at),
    created_by: String(row.created_by || ''),
    status: (row.status as LinhaHistoricoCotacao['status']) || 'Enviada',
    is_active: row.is_active == null ? null : Boolean(row.is_active),
    converted_to_order_id: row.converted_to_order_id == null ? null : String(row.converted_to_order_id),
    contract_details: row.contract_details == null ? null : String(row.contract_details),
  };
}
