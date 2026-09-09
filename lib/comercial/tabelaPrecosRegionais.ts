/**
 * Piso regional mínimo para cotação comercial rápida.
 * Fonte: public.tabela_precos_regioes (editável pela Diretoria).
 *
 * Isolamento de regra:
 * - Esta tabela NÃO alimenta cálculo de OS, NF, Asaas ou boletim.
 * - Faturamento real continua em client_price_tables.
 * - Cotação rápida grava em quotes; só vira tabela de cliente ao fechar.
 */

export type QuoteSource = 'ROTA' | 'RAPIDA_REGIONAL';

export type QuinzenaFiltro = 'todas' | 'q1' | 'q2';

export type RegiaoPrecoPiso = {
  id: string;
  codigo: string;
  regiao: string;
  estados: string;
  valor_acionamento: number;
  valor_km_extra: number;
  valor_hora_extra: number;
  ativo?: boolean;
  ordem?: number;
};

export type CalculoCotacaoRapidaInput = {
  regiao: RegiaoPrecoPiso;
  kmEstimado: number;
  horasExtrasEstimadas: number;
};

export type ResultadoCotacaoRapida = {
  regiao: RegiaoPrecoPiso;
  kmEstimado: number;
  horasExtrasEstimadas: number;
  valorAcionamento: number;
  valorTotalKm: number;
  valorTotalHoras: number;
  valorTotalEstimado: number;
};

export type PayloadQuoteRapida = {
  client_id: number | null;
  client_name: string;
  origin: string;
  destination: string;
  total_km: number;
  total_hours: number;
  total_value: number;
  status: 'Rascunho';
  quote_source: 'RAPIDA_REGIONAL';
  created_by: string;
  items: Array<{
    uf: string;
    price_km: number;
    price_km_extra: number;
    price_hour_extra: number;
    region_id: string;
    kind: 'RAPIDA_REGIONAL';
  }>;
  contract_details: string;
};

export type PayloadTabelaClientePiso = {
  client: string;
  operation_type: string;
  activation_fee: number;
  franchise_hours: number;
  franchise_km: number;
  price_per_extra_km: number;
  price_per_extra_hour: number;
};

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function calcularCotacaoRapida(input: CalculoCotacaoRapidaInput): ResultadoCotacaoRapida {
  const km = Math.max(0, Number(input.kmEstimado) || 0);
  const horas = Math.max(0, Number(input.horasExtrasEstimadas) || 0);
  const valorAcionamento = roundMoney(Number(input.regiao.valor_acionamento) || 0);
  const valorTotalKm = roundMoney(km * (Number(input.regiao.valor_km_extra) || 0));
  const valorTotalHoras = roundMoney(horas * (Number(input.regiao.valor_hora_extra) || 0));
  return {
    regiao: input.regiao,
    kmEstimado: km,
    horasExtrasEstimadas: horas,
    valorAcionamento,
    valorTotalKm,
    valorTotalHoras,
    valorTotalEstimado: roundMoney(valorAcionamento + valorTotalKm + valorTotalHoras),
  };
}

export function formatBRL(n: number): string {
  return roundMoney(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function primeiraUfDaRegiao(estados: string): string {
  const uf = String(estados || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .find((s) => /^[A-Z]{2}$/.test(s));
  return uf || 'BR';
}

export function montarResumoCotacao(resultado: ResultadoCotacaoRapida, clienteNome: string): string {
  const cliente = String(clienteNome || '').trim() || 'Prospect sem cadastro';
  return [
    'COTAÇÃO RÁPIDA REGIONAL — PISO MÍNIMO (não é faturamento)',
    `Cliente/Prospect: ${cliente}`,
    `Região: ${resultado.regiao.regiao} (${resultado.regiao.estados})`,
    `KM estimado: ${resultado.kmEstimado}`,
    `Horas extras estimadas: ${resultado.horasExtrasEstimadas}`,
    `Acionamento: ${formatBRL(resultado.valorAcionamento)}`,
    `KM extra: ${formatBRL(resultado.valorTotalKm)}`,
    `Hora extra: ${formatBRL(resultado.valorTotalHoras)}`,
    `Total estimado: ${formatBRL(resultado.valorTotalEstimado)}`,
  ].join('\n');
}

export function montarPayloadQuoteRapida(params: {
  resultado: ResultadoCotacaoRapida;
  clienteNome: string;
  clientId?: number | null;
  createdBy: string;
}): PayloadQuoteRapida {
  const { resultado, createdBy } = params;
  const clienteNome = String(params.clienteNome || '').trim();
  return {
    client_id: params.clientId && Number.isFinite(params.clientId) ? params.clientId : null,
    client_name: clienteNome,
    origin: resultado.regiao.regiao,
    destination: 'Cotação rápida regional',
    total_km: resultado.kmEstimado,
    total_hours: resultado.horasExtrasEstimadas,
    total_value: resultado.valorTotalEstimado,
    status: 'Rascunho',
    quote_source: 'RAPIDA_REGIONAL',
    created_by: createdBy || 'SISTEMA',
    items: [{
      uf: primeiraUfDaRegiao(resultado.regiao.estados),
      price_km: resultado.valorAcionamento,
      price_km_extra: Number(resultado.regiao.valor_km_extra) || 0,
      price_hour_extra: Number(resultado.regiao.valor_hora_extra) || 0,
      region_id: resultado.regiao.codigo,
      kind: 'RAPIDA_REGIONAL',
    }],
    contract_details: montarResumoCotacao(resultado, clienteNome),
  };
}

export function montarPayloadTabelaCliente(params: {
  clienteNome: string;
  resultado: ResultadoCotacaoRapida;
}): PayloadTabelaClientePiso {
  const cliente = String(params.clienteNome || '').trim();
  const { resultado } = params;
  return {
    client: cliente,
    operation_type: `PISO REGIONAL - ${resultado.regiao.regiao}`.toUpperCase(),
    activation_fee: resultado.valorAcionamento,
    franchise_hours: resultado.horasExtrasEstimadas,
    franchise_km: resultado.kmEstimado,
    price_per_extra_km: Number(resultado.regiao.valor_km_extra) || 0,
    price_per_extra_hour: Number(resultado.regiao.valor_hora_extra) || 0,
  };
}

export function resultadoFromQuoteItems(quote: {
  origin?: string | null;
  total_km?: number | null;
  total_hours?: number | null;
  items?: Array<{
    region_id?: string;
    price_km?: number;
    price_km_extra?: number;
    price_hour_extra?: number;
    uf?: string;
  }> | null;
}): ResultadoCotacaoRapida | null {
  const item = Array.isArray(quote.items) ? quote.items[0] : null;
  if (!item) return null;
  const kmExtra = Number(item.price_km_extra) || 0;
  const horaExtra = Number(item.price_hour_extra) || 0;
  const acionamento = Number(item.price_km) || 0;
  const fakeRegiao: RegiaoPrecoPiso = {
    id: item.region_id || '',
    codigo: item.region_id || '',
    regiao: String(quote.origin || 'Região'),
    estados: item.uf || '',
    valor_acionamento: acionamento,
    valor_km_extra: kmExtra,
    valor_hora_extra: horaExtra,
  };
  return calcularCotacaoRapida({
    regiao: fakeRegiao,
    kmEstimado: Number(quote.total_km) || 0,
    horasExtrasEstimadas: Number(quote.total_hours) || 0,
  });
}

export function diaDoIsoDate(iso?: string | null): number | null {
  const day = String(iso || '').slice(0, 10).split('-')[2];
  const n = Number(day);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

export function quinzenaDeDataFaturamento(iso?: string | null): QuinzenaFiltro | null {
  const dia = diaDoIsoDate(iso);
  if (!dia) return null;
  return dia <= 15 ? 'q1' : 'q2';
}

export function labelQuinzena(q: QuinzenaFiltro | null): string {
  if (q === 'q1') return '1ª Quinzena';
  if (q === 'q2') return '2ª Quinzena';
  return 'Mês completo';
}

/** Intervalo civil YYYY-MM-DD, sem Date UTC (evita virar o dia no fuso). */
export function intervaloQuinzena(
  year: number,
  month: number,
  quinzena: QuinzenaFiltro,
): { start: string; end: string } {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  if (quinzena === 'q1') {
    return { start: `${y}-${m}-01`, end: `${y}-${m}-15` };
  }
  if (quinzena === 'q2') {
    return { start: `${y}-${m}-16`, end: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
  }
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type LinhaRelatorioComissao = {
  empresa?: string | null;
  cliente_nome?: string | null;
  comercial_nome?: string | null;
  fatura_numero?: string | null;
  data_faturamento?: string | null;
  valor_faturamento?: number | null;
  valor_comissao?: number | null;
  status?: string | null;
};

export function montarCsvRelatorioComissoes(
  rows: LinhaRelatorioComissao[],
  meta: { year: number; month: number; quinzena: QuinzenaFiltro; comercialNome?: string },
): string {
  const headers = [
    'Empresa',
    'Cliente',
    'Comercial',
    'NF',
    'Data faturamento',
    'Quinzena',
    'Faturamento (R$)',
    'Comissão (R$)',
    'Status',
  ];
  const body = rows.map((r) => [
    csvCell(r.empresa || 'TM SEG'),
    csvCell(r.cliente_nome || ''),
    csvCell(r.comercial_nome || meta.comercialNome || ''),
    csvCell(r.fatura_numero || ''),
    csvCell(String(r.data_faturamento || '').slice(0, 10)),
    csvCell(labelQuinzena(quinzenaDeDataFaturamento(r.data_faturamento))),
    csvCell(roundMoney(Number(r.valor_faturamento) || 0).toFixed(2).replace('.', ',')),
    csvCell(roundMoney(Number(r.valor_comissao) || 0).toFixed(2).replace('.', ',')),
    csvCell(r.status || ''),
  ].join(';'));
  return [headers.join(';'), ...body].join('\n');
}

export function nomeArquivoRelatorioComissoes(meta: {
  year: number;
  month: number;
  quinzena: QuinzenaFiltro;
  comercialNome?: string;
}): string {
  const comercial = String(meta.comercialNome || 'todos')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'todos';
  const q = meta.quinzena === 'todas' ? 'mes' : meta.quinzena;
  const ym = `${meta.year}-${String(meta.month).padStart(2, '0')}`;
  return `comissoes_${comercial}_${ym}_${q}.csv`;
}
