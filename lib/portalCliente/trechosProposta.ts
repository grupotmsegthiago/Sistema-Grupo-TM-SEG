/**
 * Vários trechos na mesma proposta.
 * Cada trecho usa calculateTripCost. A fórmula em tabela2027.ts não muda.
 * DHL e IBL continuam fora desta conta.
 */

import {
  calculateTripCost,
  clienteContratualDhlOuIbl,
  FAIXAS_REGIONAIS,
  FRANQUIA_HORAS,
  FRANQUIA_KM,
  getRegionFromLocation,
  nomeRegiao,
  numerosDaCotacaoRegional,
  roundMoney,
  type VersaoTabelaRegional,
} from '../precificacao/tabela2027';

export const LIMITE_TRECHOS_PROPOSTA = 8;

export type PisoRegional2027 = {
  regiao: string;
  acionamento: number;
  kmExtra: number;
  horaExtra: number;
};

export type TrechoPersistido = {
  origem: string;
  destino: string;
  km: number;
  kmFaturado: number;
  horas: number;
  kmExcedente: number;
  horasExcedentes: number;
  kmExtra: number;
  horaExtra: number;
  valor: number;
  regiao: string;
  usouMinimo: boolean;
};

type LinhaTarifa = {
  operation_type?: string | null;
  price_per_extra_km?: number | null;
  price_per_extra_hour?: number | null;
};

export type EntradaTrechoProposta = {
  origem: string;
  destino: string;
  km: number;
  cliente: string;
  versao: VersaoTabelaRegional;
  linhas?: LinhaTarifa[];
  tarifaKmFallback?: number | null;
  horaExtraFallback?: number | null;
  vigenciaFallback?: VersaoTabelaRegional | null;
  kmExtraInformado?: number | null;
  horaExtraInformado?: number | null;
};

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function numeroFino(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Piso da faixa 2027 da origem. Cliente DHL ou IBL não entra. Sem UF, não há piso. */
export function pisoRegional2027(origem: string, cliente: string): PisoRegional2027 | null {
  if (clienteContratualDhlOuIbl(cliente)) return null;
  const local = getRegionFromLocation(origem, '', cliente);
  if (!local.region) return null;
  const faixa = FAIXAS_REGIONAIS.find((item) => item.region === local.region);
  if (!faixa) return null;
  return {
    regiao: nomeRegiao(faixa.region),
    acionamento: roundMoney(FRANQUIA_KM * faixa.km2027),
    kmExtra: faixa.km2027,
    horaExtra: faixa.hora2026,
  };
}

/** Valor já positivo e menor que o piso. Zero não trava cotação antiga sem tarifa preenchida. */
export function mensagemAbaixoDoPiso(
  valores: { acionamento?: number | null; kmExtra?: number | null; horaExtra?: number | null },
  piso: PisoRegional2027,
): string | null {
  const falhas: string[] = [];
  const km = Number(valores.kmExtra);
  const hora = Number(valores.horaExtra);
  const acionamento = Number(valores.acionamento);
  if (Number.isFinite(km) && km > 0 && km + 0.001 < piso.kmExtra) {
    falhas.push(`km extra abaixo de ${moeda(piso.kmExtra)}`);
  }
  if (Number.isFinite(hora) && hora > 0 && hora + 0.001 < piso.horaExtra) {
    falhas.push(`hora extra abaixo de ${moeda(piso.horaExtra)}`);
  }
  if (Number.isFinite(acionamento) && acionamento > 0 && acionamento + 0.01 < piso.acionamento) {
    falhas.push(`acionamento abaixo de ${moeda(piso.acionamento)}`);
  }
  if (!falhas.length) return null;
  return `Abaixo do piso 2027 de ${piso.regiao}: ${falhas.join('; ')}. Só é possível aumentar.`;
}

export function recusarPisoDaProposta(entrada: {
  cliente: string;
  origem: string;
  vigencia: VersaoTabelaRegional | null | undefined;
  acordada: boolean;
  acionamento: number;
  kmExtra: number;
  horaExtra: number;
}): string | null {
  if (entrada.acordada || entrada.vigencia !== '2027') return null;
  const piso = pisoRegional2027(entrada.origem, entrada.cliente);
  if (!piso) return null;
  return mensagemAbaixoDoPiso(entrada, piso);
}

function excedenteDoTrecho(km: number, taxa: number): {
  kmFaturado: number;
  horas: number;
  kmExcedente: number;
  horasExcedentes: number;
  valor: number;
  usouMinimo: boolean;
} {
  const conta = calculateTripCost(km, taxa);
  return {
    kmFaturado: conta.kmFaturado,
    horas: conta.horasFaturadas,
    kmExcedente: conta.usouMinimo ? 0 : roundMoney(Math.max(0, conta.kmFaturado - FRANQUIA_KM)),
    horasExcedentes: Math.max(0, conta.horasFaturadas - FRANQUIA_HORAS),
    valor: conta.valor,
    usouMinimo: conta.usouMinimo,
  };
}

/** Um trecho pela conta vigente. Taxa abaixo do piso 2027 sobe até o piso. Taxa digitada abaixo da base é recusada. */
export function calcularTrechoProposta(
  entrada: EntradaTrechoProposta,
): { ok: true; trecho: TrechoPersistido } | { ok: false; error: string } {
  const origem = String(entrada.origem || '').trim();
  const destino = String(entrada.destino || '').trim();
  const km = Number(entrada.km);
  if (!origem || !destino) return { ok: false, error: 'Informe origem e destino do trecho.' };
  if (!Number.isFinite(km) || km <= 0) return { ok: false, error: 'Informe o km do trecho.' };
  if (clienteContratualDhlOuIbl(entrada.cliente)) {
    return { ok: false, error: 'Cliente contratual permanece na tabela já cadastrada.' };
  }
  const piso = entrada.versao === '2027' ? pisoRegional2027(origem, entrada.cliente) : null;
  const regional = numerosDaCotacaoRegional({
    cliente: entrada.cliente,
    origem,
    km,
    versao: entrada.versao,
    linhas: entrada.linhas || [],
    tarifaKmFallback: entrada.tarifaKmFallback ?? piso?.kmExtra ?? null,
    horaExtraFallback: entrada.horaExtraFallback ?? piso?.horaExtra ?? null,
    vigenciaFallback: entrada.vigenciaFallback,
  });
  if (!regional.aplicar) {
    if (regional.motivo === 'contratual') return { ok: false, error: 'Cliente contratual permanece na tabela já cadastrada.' };
    return { ok: false, error: 'Este trecho não tem tarifa para a origem.' };
  }
  let taxa = regional.tarifaKm;
  let hora = regional.horaExtra ?? 0;
  if (piso) {
    if (taxa + 0.001 < piso.kmExtra) taxa = piso.kmExtra;
    if (hora + 0.001 < piso.horaExtra) hora = piso.horaExtra;
  }
  const kmInformado = numeroFino(entrada.kmExtraInformado);
  const horaInformada = numeroFino(entrada.horaExtraInformado);
  if (kmInformado != null) {
    if (kmInformado + 0.001 < taxa) {
      return { ok: false, error: `O km extra não pode ficar abaixo de ${moeda(taxa)}.` };
    }
    taxa = roundMoney(kmInformado);
  }
  if (horaInformada != null) {
    if (horaInformada + 0.001 < hora) {
      return { ok: false, error: `A hora extra não pode ficar abaixo de ${moeda(hora)}.` };
    }
    hora = roundMoney(horaInformada);
  }
  const conta = excedenteDoTrecho(km, taxa);
  const avisoPiso = piso ? mensagemAbaixoDoPiso({ acionamento: conta.valor, kmExtra: taxa, horaExtra: hora }, piso) : null;
  if (avisoPiso) return { ok: false, error: avisoPiso };
  return {
    ok: true,
    trecho: {
      origem: origem.slice(0, 300),
      destino: destino.slice(0, 300),
      km: roundMoney(km),
      kmFaturado: conta.kmFaturado,
      horas: conta.horas,
      kmExcedente: conta.kmExcedente,
      horasExcedentes: conta.horasExcedentes,
      kmExtra: taxa,
      horaExtra: hora,
      valor: conta.valor,
      regiao: nomeRegiao(regional.region) || regional.nome,
      usouMinimo: conta.usouMinimo,
    },
  };
}

export function somarTrechos(trechos: TrechoPersistido[]): {
  total: number;
  km: number;
  kmFaturado: number;
  horas: number;
  kmExcedente: number;
  horasExcedentes: number;
} {
  return trechos.reduce((soma, trecho) => ({
    total: roundMoney(soma.total + trecho.valor),
    km: roundMoney(soma.km + trecho.km),
    kmFaturado: roundMoney(soma.kmFaturado + trecho.kmFaturado),
    horas: soma.horas + trecho.horas,
    kmExcedente: roundMoney(soma.kmExcedente + trecho.kmExcedente),
    horasExcedentes: soma.horasExcedentes + trecho.horasExcedentes,
  }), { total: 0, km: 0, kmFaturado: 0, horas: 0, kmExcedente: 0, horasExcedentes: 0 });
}

function textoTrecho(valor: unknown, limite: number): string {
  return String(valor || '').trim().slice(0, limite);
}

/** Confere o que a tela manda gravar. O total não pode ficar abaixo de calculateTripCost. */
export function conferirTrechosGravados(
  bruto: unknown,
  cliente: string,
  vigencia: VersaoTabelaRegional,
): { ok: true; trechos: TrechoPersistido[]; total: number; km: number; horas: number } | { ok: false; error: string } {
  if (!Array.isArray(bruto) || bruto.length === 0) return { ok: false, error: 'Informe ao menos um trecho.' };
  if (bruto.length > LIMITE_TRECHOS_PROPOSTA) return { ok: false, error: `A proposta aceita até ${LIMITE_TRECHOS_PROPOSTA} trechos.` };
  const trechos: TrechoPersistido[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Trecho inválido.' };
    const registro = item as Record<string, unknown>;
    const origem = textoTrecho(registro.origem, 300);
    const destino = textoTrecho(registro.destino, 300);
    const km = Number(registro.km);
    const kmExtra = Number(registro.kmExtra);
    const horaExtra = Number(registro.horaExtra);
    const valor = Number(registro.valor);
    if (!origem || !destino || !Number.isFinite(km) || km <= 0) return { ok: false, error: 'Trecho sem origem, destino ou km.' };
    if (!Number.isFinite(kmExtra) || kmExtra <= 0 || !Number.isFinite(horaExtra) || horaExtra <= 0 || !Number.isFinite(valor) || valor <= 0) {
      return { ok: false, error: 'Trecho sem acionamento, km extra ou hora extra.' };
    }
    if (vigencia === '2027') {
      const piso = pisoRegional2027(origem, cliente);
      const aviso = piso ? mensagemAbaixoDoPiso({ acionamento: valor, kmExtra, horaExtra }, piso) : null;
      if (aviso) return { ok: false, error: aviso };
    }
    const conta = excedenteDoTrecho(km, kmExtra);
    if (valor + 0.02 < conta.valor) return { ok: false, error: 'O total do trecho ficou abaixo da tabela vigente.' };
    trechos.push({
      origem,
      destino,
      km: roundMoney(km),
      kmFaturado: conta.kmFaturado,
      horas: conta.horas,
      kmExcedente: conta.kmExcedente,
      horasExcedentes: conta.horasExcedentes,
      kmExtra: roundMoney(kmExtra),
      horaExtra: roundMoney(horaExtra),
      valor: roundMoney(valor),
      regiao: textoTrecho(registro.regiao, 80),
      usouMinimo: conta.usouMinimo,
    });
  }
  const soma = somarTrechos(trechos);
  return { ok: true, trechos, total: soma.total, km: soma.km, horas: soma.horas };
}

export function lerTrechosPersistidos(bruto: unknown): TrechoPersistido[] | null {
  const lido = conferirTrechosGravados(bruto, '', '2026');
  if (!lido.ok) return null;
  return lido.trechos;
}
