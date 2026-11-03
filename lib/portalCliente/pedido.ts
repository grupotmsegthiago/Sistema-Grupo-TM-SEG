/** Pedido de escolta no portal. O cliente não informa preço, tabela nem valor. */

import { normalizePlate, parseBrazilDateTime } from '../cevaPortal/rules';

export const PEDIDOS_PORTAL = ['Escolta Caracterizada', 'Escolta Velada'] as const;
export const EMAIL_OPERACIONAL_TMSEG = 'operacional@grupotmseg.com.br';

export type PedidoPortalNome = (typeof PEDIDOS_PORTAL)[number];
export type TipoOsPortal = 'Caracterizada' | 'Velada';

export type PedidoPortal = {
  dataInicio: string;
  dataFim: string | null;
  pedido: PedidoPortalNome;
  /** Na escolta velada, 1 ou 2. Nos outros pedidos fica vazio. */
  agentes: 1 | 2 | null;
  /** Texto que o controle já exibe na coluna Serviço. */
  servico: string;
  /** Tipo que a OS usa para a tabela, depois da validação interna. */
  missionType: TipoOsPortal;
  origem: string;
  destino: string;
  operacao: string;
  identificacao: string;
  motorista: string;
  placa: string;
  telefone: string;
  solicitante: string;
  quemAutorizou: string | null;
  atendimentoPgr: string | null;
  contrato: string | null;
  tsp: string | null;
  franquiaHora: string | null;
  franquiaKm: string | null;
  /** Nome da tabela na proposta. Não renomeia linha de preço já gravada. */
  nomeLinhaVigencia: string | null;
  /** Nome da rota na proposta. Não renomeia rota já gravada. */
  nomeRotaVigencia: string | null;
};

const CHAVES_PRECO = ['preco', 'preço', 'valor', 'revenue', 'tabela', 'price', 'tarifa', 'custo'];
export const QUANTIDADE_MAXIMA_OS = 20;

/** Dia civil em America/Sao_Paulo, no formato AAAA-MM-DD. */
function diaCivilBrasil(ms: number): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const pegar = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)?.value || '';
  return `${pegar('year')}-${pegar('month')}-${pegar('day')}`;
}

function texto(valor: unknown, max: number): string {
  return String(valor ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function opcional(valor: unknown, max: number): string | null {
  const limpo = texto(valor, max);
  return limpo || null;
}

export function emailsDaSolicitacao(operationalEmail: string | null | undefined): string[] {
  const doCliente = String(operationalEmail || '')
    .split(/[\s,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes('@') && item.includes('.'));
  return [...new Set([EMAIL_OPERACIONAL_TMSEG, ...doCliente])];
}

export function corpoTrazPreco(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return Object.keys(body as Record<string, unknown>).some((chave) => {
    const nome = chave.toLowerCase();
    return CHAVES_PRECO.some((marca) => nome.includes(marca));
  });
}

export function quantidadeDoPedido(body: unknown): { ok: true; value: number } | { ok: false; error: string } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (source.quantidade == null || source.quantidade === '') return { ok: true, value: 1 };
  const numero = Number(source.quantidade);
  if (!Number.isInteger(numero) || numero < 1 || numero > QUANTIDADE_MAXIMA_OS) {
    return { ok: false, error: `A quantidade fica entre 1 e ${QUANTIDADE_MAXIMA_OS} OS.` };
  }
  return { ok: true, value: numero };
}

export function validarPedidoPortal(
  body: unknown,
  solicitanteSessao: string,
  agora = Date.now(),
): { ok: true; value: PedidoPortal } | { ok: false; error: string } {
  if (corpoTrazPreco(body)) {
    return { ok: false, error: 'O pedido não aceita preço, tarifa ou tabela.' };
  }
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const solicitante = texto(solicitanteSessao, 160);
  if (solicitante.length < 2) return { ok: false, error: 'Sessão sem identificação da pessoa.' };

  const dataInicio = parseBrazilDateTime(source.dataInicio);
  if (!dataInicio) return { ok: false, error: 'Informe a data e a hora de início.' };
  const inicioMs = new Date(dataInicio).getTime();
  const hojeCivil = diaCivilBrasil(agora);
  if (diaCivilBrasil(inicioMs) < hojeCivil) return { ok: false, error: 'A data de início tem de ser hoje ou um dia à frente.' };
  if (inicioMs > agora + 90 * 24 * 60 * 60 * 1000) return { ok: false, error: 'A data de início passa de 90 dias.' };
  const fimInformado = String(source.dataFim ?? '').trim();
  const dataFim = fimInformado ? parseBrazilDateTime(source.dataFim) : null;
  if (fimInformado && !dataFim) return { ok: false, error: 'A data de fim não foi entendida.' };
  if (dataFim && diaCivilBrasil(new Date(dataFim).getTime()) < hojeCivil) {
    return { ok: false, error: 'A data de fim tem de ser hoje ou um dia à frente.' };
  }

  const pedido = PEDIDOS_PORTAL.find((item) => item === texto(source.pedido, 40));
  if (!pedido) return { ok: false, error: 'Informe se é escolta caracterizada ou escolta velada.' };
  const agentesNumero = Number(source.agentes);
  const agentes = pedido === 'Escolta Velada' && (agentesNumero === 1 || agentesNumero === 2) ? agentesNumero as 1 | 2 : null;
  if (pedido === 'Escolta Velada' && !agentes) return { ok: false, error: 'Na escolta velada, informe um ou dois agentes.' };
  const missionType: TipoOsPortal = pedido === 'Escolta Caracterizada' ? 'Caracterizada' : 'Velada';

  const origem = texto(source.origem, 240);
  const destino = texto(source.destino, 240);
  if (origem.length < 3 || destino.length < 3) return { ok: false, error: 'Informe a cidade de origem e a de destino.' };
  const operacao = texto(source.operacao, 160);
  if (operacao.length < 2) return { ok: false, error: 'Informe a operação.' };
  const identificacao = texto(source.identificacao, 80);
  const motorista = texto(source.motorista, 160);
  if (motorista.length < 2) return { ok: false, error: 'Informe o motorista.' };
  const placa = normalizePlate(source.placa);
  if (!placa || placa.length < 7) return { ok: false, error: 'Informe a placa do veículo.' };
  const telefone = texto(source.telefone, 30).replace(/[^\d+()\-\s]/g, '');
  if (telefone.replace(/\D/g, '').length < 8) return { ok: false, error: 'Informe o telefone.' };
  const nomeVigencia = (valor: unknown, prefixo: 'Tabela' | 'Rota'): string | null => {
    const limpo = texto(valor, 180);
    if (!limpo) return null;
    if (!new RegExp(`^${prefixo}: .+ \\(202[67]-\\)$`).test(limpo)) return null;
    return limpo;
  };

  return {
    ok: true,
    value: {
      dataInicio,
      dataFim,
      pedido,
      agentes,
      servico: agentes ? `${pedido} — ${agentes} ${agentes === 1 ? 'agente' : 'agentes'}` : pedido,
      missionType,
      origem: origem.toUpperCase(),
      destino: destino.toUpperCase(),
      operacao: operacao.toUpperCase(),
      identificacao: identificacao.toUpperCase(),
      motorista: motorista.toUpperCase(),
      placa,
      telefone,
      solicitante,
      quemAutorizou: opcional(source.quemAutorizou, 160),
      atendimentoPgr: opcional(source.atendimentoPgr, 300),
      contrato: opcional(source.contrato, 160),
      tsp: opcional(source.tsp, 160),
      franquiaHora: null,
      franquiaKm: null,
      nomeLinhaVigencia: nomeVigencia(source.nomeLinhaVigencia, 'Tabela'),
      nomeRotaVigencia: nomeVigencia(source.nomeRotaVigencia, 'Rota'),
    },
  };
}
