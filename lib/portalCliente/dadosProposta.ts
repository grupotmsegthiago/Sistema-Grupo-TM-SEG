import { numerosDaTela, type PropostaPortal } from './cotacao';

/** JSON da proposta. Os números saem do motor da cotação, não de um desenho. */
export type DadosProposta = {
  origem: string;
  destino: string;
  paradas: string[];
  distanciaKm: number | null;
  tempoMin: number | null;
  subRegiao: string;
  total: number;
  kmFaturado: number;
  franquiaKm: number;
  franquiaHoras: number;
  horas: number;
  kmExtra: number;
  horaExtra: number;
  pernoite: number | null;
  mostraFranquiaIncluida: boolean;
};

export function dadosDaProposta(proposta: PropostaPortal): DadosProposta {
  const tela = numerosDaTela(proposta);
  const km = Number(proposta.kmRota);
  const tempo = Number(proposta.duracaoMin);
  return {
    origem: String(proposta.origem || ''),
    destino: String(proposta.destino || ''),
    paradas: Array.isArray(proposta.paradas) ? proposta.paradas.filter((item) => typeof item === 'string') : [],
    distanciaKm: Number.isFinite(km) && km > 0 ? km : null,
    tempoMin: Number.isFinite(tempo) && tempo > 0 ? tempo : null,
    subRegiao: String(proposta.regiao || ''),
    total: tela.total,
    kmFaturado: tela.kmFaturado,
    franquiaKm: tela.franquiaKm,
    franquiaHoras: tela.franquiaHoras,
    horas: tela.horas,
    kmExtra: tela.kmExtra,
    horaExtra: tela.horaExtra,
    pernoite: tela.pernoite,
    mostraFranquiaIncluida: tela.mostraFranquiaIncluida,
  };
}

/** Payload divergente do motor não substitui o total, a tarifa nem a região. */
export function dadosConfiaveis(bruto: unknown, proposta: PropostaPortal): DadosProposta {
  const oficial = dadosDaProposta(proposta);
  if (!bruto || typeof bruto !== 'object') return oficial;
  const item = bruto as Partial<DadosProposta>;
  const igual = Number(item.total) === oficial.total
    && Number(item.kmExtra) === oficial.kmExtra
    && Number(item.horaExtra) === oficial.horaExtra
    && String(item.subRegiao || '') === oficial.subRegiao
    && String(item.origem || '') === oficial.origem
    && String(item.destino || '') === oficial.destino;
  return igual ? oficial : oficial;
}
