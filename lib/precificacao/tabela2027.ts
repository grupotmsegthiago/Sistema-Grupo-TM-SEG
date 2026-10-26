/**
 * Tabela regional 2026/2027 e classificação de rota (fixa ou esporádica).
 *
 * Esta função não entra em calculateMissionFinancials.
 * OS aprovada, faturada ou com override continua no motor oficial.
 * A cotação do portal (lib/portalCliente/cotacao.ts) também permanece como está.
 * DHL e IBL conservam a tabela contratual já gravada.
 */

export const FRANQUIA_KM = 100;
export const FRANQUIA_HORAS = 3;
export const KM_POR_HORA = 40;
export const CORTE_MINUTOS = 40;
export const CHAVE_TABELA_REGIONAL_VIGENTE = 'tabela_regional_vigente';

export const REGIOES_TABELA = [
  'sudeste_sp_rj',
  'sudeste_mg_es',
  'sul',
  'centro_oeste',
  'nordeste',
  'norte',
] as const;

export type RegiaoTabela = (typeof REGIOES_TABELA)[number];
export type VersaoTabelaRegional = '2026' | '2027';
export type TipoRota = 'fixa' | 'esporadica';

export type FaixaRegional = {
  region: RegiaoTabela;
  nome: string;
  ufs: readonly string[];
  km2026: number;
  km2027: number;
  hora2026: number;
};

export const FAIXAS_REGIONAIS: readonly FaixaRegional[] = [
  { region: 'sudeste_sp_rj', nome: 'SUDESTE SP/RJ', ufs: ['SP', 'RJ'], km2026: 6.5, km2027: 6.9, hora2026: 159 },
  { region: 'sudeste_mg_es', nome: 'SUDESTE MG/ES', ufs: ['MG', 'ES'], km2026: 7, km2027: 7.3, hora2026: 169 },
  { region: 'sul', nome: 'SUL', ufs: ['PR', 'SC', 'RS'], km2026: 7.5, km2027: 7.5, hora2026: 179 },
  { region: 'centro_oeste', nome: 'CENTRO-OESTE', ufs: ['MT', 'MS', 'GO', 'DF'], km2026: 8.5, km2027: 8.5, hora2026: 189 },
  { region: 'nordeste', nome: 'NORDESTE', ufs: ['BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA'], km2026: 7.3, km2027: 8.3, hora2026: 169 },
  { region: 'norte', nome: 'NORTE', ufs: ['AM', 'RR', 'AP', 'PA', 'TO', 'RO', 'AC'], km2026: 9, km2027: 10, hora2026: 210 },
];

const UF_PARA_REGIAO: Record<string, RegiaoTabela> = {};
for (const faixa of FAIXAS_REGIONAIS) {
  for (const uf of faixa.ufs) UF_PARA_REGIAO[uf] = faixa.region;
}

const UFS = Object.keys(UF_PARA_REGIAO);

export type ResultadoRegiao = {
  clienteContratual: boolean;
  aplicaPrecificacaoRegional: boolean;
  region: RegiaoTabela | null;
  uf: string | null;
  motivo: 'cliente_dhl' | 'cliente_ibl' | 'uf' | 'uf_ausente';
};

export type LinhaPrecoPadrao = {
  id?: string;
  client: string;
  operation_type: string;
  activation_fee: number;
  franchise_km: number;
  franchise_hours: number;
  price_per_extra_km: number;
  price_per_extra_hour: number;
  region: RegiaoTabela;
};

export type RotaPadrao = {
  name: string;
  region: RegiaoTabela;
  criar: {
    code: string;
    name: string;
    origin: string;
    destination: string;
    distance: string;
    route_type: 'fixa';
    is_active: true;
    region: RegiaoTabela;
    toll_cost: number;
  };
  atualizar: {
    route_type: 'fixa';
    is_active: true;
    region: RegiaoTabela;
  };
};

export type CatalogoRegional = {
  versao: VersaoTabelaRegional;
  region: RegiaoTabela;
  nome: string;
  estados: string;
  valor_km: number;
  franquia_km: number;
  franquia_horas: number;
  valor_hora_extra: number;
};

export type PlanoTabelaRegional = {
  aplicarNoCliente: boolean;
  motivo: string;
  versao: VersaoTabelaRegional;
  linhas: LinhaPrecoPadrao[];
  rotas: RotaPadrao[];
  catalogo: CatalogoRegional[];
};

export type RotaClassificacao = {
  id?: string | number | null;
  route_type?: string | null;
  is_active?: boolean | null;
  consumed_in_order_id?: string | null;
  region?: string | null;
  name?: string | null;
};

export type CustoViagem = {
  totalKm: number;
  kmFaturado: number;
  horasFaturadas: number;
  horasInteiras: number;
  minutos: number;
  valor: number;
  acionamentoMinimo: number;
  usouMinimo: boolean;
};

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function normalizarNomeCliente(nome: string): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** DHL pelo nome. IBL também pelo cadastro oficial INTERMODAL BRASIL. */
export function clienteContratualDhlOuIbl(clientName: string): 'DHL' | 'IBL' | null {
  const nome = normalizarNomeCliente(clientName);
  if (!nome) return null;
  if (nome.includes('DHL')) return 'DHL';
  if (/\bIBL\b/.test(nome) || nome.includes('INTERMODAL BRASIL')) return 'IBL';
  return null;
}

export function extrairUf(city: string, state: string): string | null {
  const direto = String(state || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (direto.length === 2 && UFS.includes(direto)) return direto;
  const texto = `${city || ''} ${state || ''}`.toUpperCase();
  const marcas = texto.match(/(?:^|[\s,/\-])(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?=$|[\s,/\-.])/g);
  if (!marcas?.length) return null;
  return marcas[marcas.length - 1].replace(/[^A-Z]/g, '');
}

export function extrairCep(texto: string): string | null {
  const encontrado = String(texto || '').match(/\b(\d{5})-?(\d{3})\b/);
  if (!encontrado) return null;
  return `${encontrado[1]}${encontrado[2]}`;
}

export function getRegionFromLocation(city: string, state: string, clientName: string): ResultadoRegiao {
  const contratual = clienteContratualDhlOuIbl(clientName);
  const uf = extrairUf(city, state);
  if (contratual) {
    return {
      clienteContratual: true,
      aplicaPrecificacaoRegional: false,
      region: null,
      uf,
      motivo: contratual === 'DHL' ? 'cliente_dhl' : 'cliente_ibl',
    };
  }
  const region = uf ? UF_PARA_REGIAO[uf] || null : null;
  return {
    clienteContratual: false,
    aplicaPrecificacaoRegional: !!region,
    region,
    uf,
    motivo: region ? 'uf' : 'uf_ausente',
  };
}

export function nomeRegiao(region: RegiaoTabela | null): string {
  return FAIXAS_REGIONAIS.find((faixa) => faixa.region === region)?.nome || '';
}

export function perfilPodeAplicarTabelaRegional(role: string | null | undefined): boolean {
  const perfil = String(role || '').trim().toLowerCase();
  return perfil === 'diretoria' || perfil === 'administrador' || perfil === 'admin';
}

export function nomeLinhaPadrao(versao: VersaoTabelaRegional, faixa: FaixaRegional): string {
  return `TABELA ${versao} - ${faixa.nome}`;
}

export function ehLinhaPadraoRegional(operationType: string): boolean {
  return /^TABELA 20(26|27) - /.test(String(operationType || '').trim().toUpperCase());
}

export function valorKmDaFaixa(faixa: FaixaRegional, versao: VersaoTabelaRegional): number {
  return versao === '2027' ? faixa.km2027 : faixa.km2026;
}

export function catalogoDaVersao(versao: VersaoTabelaRegional): CatalogoRegional[] {
  return FAIXAS_REGIONAIS.map((faixa) => ({
    versao,
    region: faixa.region,
    nome: faixa.nome,
    estados: faixa.ufs.join(', '),
    valor_km: valorKmDaFaixa(faixa, versao),
    franquia_km: FRANQUIA_KM,
    franquia_horas: FRANQUIA_HORAS,
    valor_hora_extra: faixa.hora2026,
  }));
}

type LinhaExistente = {
  id?: string;
  operation_type?: string | null;
  price_per_extra_hour?: number | null;
};

/**
 * Gera só as seis linhas padrão da versão pedida.
 * Rota nomeada (cidade x cidade) não entra.
 * Hora extra nova copia a Tabela 2026, porque a 2027 não informou outro valor.
 * Linha padrão que já existe conserva a hora extra gravada.
 */
export function montarAplicacaoTabela(input: {
  versao: VersaoTabelaRegional;
  cliente: string;
  existentes?: LinhaExistente[];
}): PlanoTabelaRegional {
  const versao = input.versao;
  const cliente = String(input.cliente || '').trim();
  const catalogo = catalogoDaVersao(versao);
  const contratual = clienteContratualDhlOuIbl(cliente);
  if (contratual) {
    return {
      aplicarNoCliente: false,
      motivo: contratual === 'DHL'
        ? 'DHL permanece na tabela contratual. Nenhuma regra deste cliente foi alterada.'
        : 'IBL permanece na tabela contratual. Nenhuma regra deste cliente foi alterada.',
      versao,
      linhas: [],
      rotas: [],
      catalogo,
    };
  }

  const existentes = input.existentes || [];
  const linhas: LinhaPrecoPadrao[] = [];
  const rotas: RotaPadrao[] = [];

  FAIXAS_REGIONAIS.forEach((faixa, indice) => {
    const operationType = nomeLinhaPadrao(versao, faixa);
    const atual = existentes.find((linha) => String(linha.operation_type || '').trim().toUpperCase() === operationType);
    const km = valorKmDaFaixa(faixa, versao);
    const horaExistente = atual ? Number(atual.price_per_extra_hour) : NaN;
    const hora = Number.isFinite(horaExistente) ? horaExistente : faixa.hora2026;
    linhas.push({
      id: atual?.id,
      client: cliente,
      operation_type: operationType,
      activation_fee: roundMoney(FRANQUIA_KM * km),
      franchise_km: FRANQUIA_KM,
      franchise_hours: FRANQUIA_HORAS,
      price_per_extra_km: km,
      price_per_extra_hour: hora,
      region: faixa.region,
    });
    const criar = {
      code: `T${versao.slice(2)}-${String(indice + 1).padStart(2, '0')}`,
      name: operationType,
      origin: faixa.ufs.join(', '),
      destination: 'PADRÃO REGIONAL',
      distance: String(FRANQUIA_KM),
      route_type: 'fixa' as const,
      is_active: true as const,
      region: faixa.region,
      toll_cost: 0,
    };
    rotas.push({
      name: operationType,
      region: faixa.region,
      criar,
      atualizar: { route_type: 'fixa', is_active: true, region: faixa.region },
    });
  });

  return {
    aplicarNoCliente: true,
    motivo: '',
    versao,
    linhas,
    rotas,
    catalogo,
  };
}

/**
 * Corte em 40 minutos. 40 desce, 41 sobe.
 * 02:62 vira 03:02 e permanece em 3 horas.
 */
export function arredondarHorasPeloCorte(horasInteiras: number, minutos: number): number {
  let horas = Math.floor(Number(horasInteiras) || 0);
  let resto = Math.round(Number(minutos) || 0);
  if (resto >= 60) {
    horas += Math.floor(resto / 60);
    resto = resto % 60;
  }
  if (resto < 0) resto = 0;
  if (resto > CORTE_MINUTOS) return horas + 1;
  return horas;
}

export function horasDaQuilometragem(totalKm: number): { horasInteiras: number; minutos: number; horasFaturadas: number } {
  const km = Math.max(0, Number(totalKm) || 0);
  const brutas = km / KM_POR_HORA;
  let horasInteiras = Math.floor(brutas);
  let minutos = Math.round((brutas - horasInteiras) * 60);
  if (minutos >= 60) {
    horasInteiras += Math.floor(minutos / 60);
    minutos = minutos % 60;
  }
  return {
    horasInteiras,
    minutos,
    horasFaturadas: arredondarHorasPeloCorte(horasInteiras, minutos),
  };
}

export function calculateTripCost(totalKm: number, regionRate: number): CustoViagem {
  const km = Math.max(0, Number(totalKm) || 0);
  const taxa = Math.max(0, Number(regionRate) || 0);
  const acionamentoMinimo = roundMoney(FRANQUIA_KM * taxa);
  if (km <= FRANQUIA_KM) {
    return {
      totalKm: km,
      kmFaturado: FRANQUIA_KM,
      horasFaturadas: FRANQUIA_HORAS,
      horasInteiras: FRANQUIA_HORAS,
      minutos: 0,
      valor: acionamentoMinimo,
      acionamentoMinimo,
      usouMinimo: true,
    };
  }
  const horas = horasDaQuilometragem(km);
  return {
    totalKm: km,
    kmFaturado: km,
    horasFaturadas: Math.max(FRANQUIA_HORAS, horas.horasFaturadas),
    horasInteiras: horas.horasInteiras,
    minutos: horas.minutos,
    valor: roundMoney(km * taxa),
    acionamentoMinimo,
    usouMinimo: false,
  };
}

export function rotaEsporadica(route: RotaClassificacao | null | undefined): boolean {
  return String(route?.route_type || '').trim().toLowerCase() === 'esporadica';
}

export function deveConsumirRotaNaOs(route: RotaClassificacao | null | undefined): boolean {
  if (!route || !rotaEsporadica(route)) return false;
  if (route.is_active === false) return false;
  if (route.consumed_in_order_id) return false;
  return true;
}

export function patchConsumoRota(orderId: string): { is_active: false; consumed_in_order_id: string } {
  return { is_active: false, consumed_in_order_id: String(orderId) };
}

export function aplicarConsumoRota<T extends RotaClassificacao>(route: T, orderId: string): T {
  if (!deveConsumirRotaNaOs(route)) return route;
  return { ...route, ...patchConsumoRota(orderId) };
}

/** Some do select e do autocomplete de OS nova. Rota fixa e rota antiga sem coluna continuam. */
export function rotaVisivelEmNovaOs(route: RotaClassificacao | null | undefined): boolean {
  if (!route) return false;
  if (route.is_active === false) return false;
  if (rotaEsporadica(route) && route.consumed_in_order_id) return false;
  return true;
}

export function filtrarRotasParaNovaOs<T extends RotaClassificacao>(routes: T[]): T[] {
  return (routes || []).filter((route) => rotaVisivelEmNovaOs(route));
}

export function colunaRegionalAusente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const mensagem = String(error.message || '');
  return error.code === '42703'
    || error.code === 'PGRST204'
    || error.code === 'PGRST205'
    || error.code === '42P01'
    || /schema cache|does not exist|Could not find/i.test(mensagem);
}

type AtualizadorRota = {
  from: (table: string) => {
    update: (patch: { is_active: false; consumed_in_order_id: string }) => {
      eq: (column: string, value: string) => PromiseLike<{ error: { code?: string; message?: string } | null }>;
    };
  };
};

export async function consumirRotaEsporadica(
  db: AtualizadorRota,
  route: RotaClassificacao,
  orderId: string,
): Promise<{ consumida: boolean; motivo: 'nao_esporadica' | 'ok' | 'coluna_ausente' | 'erro'; detalhe?: string }> {
  if (!deveConsumirRotaNaOs(route) || route.id == null || route.id === '') {
    return { consumida: false, motivo: 'nao_esporadica' };
  }
  const { error } = await db.from('client_routes').update(patchConsumoRota(orderId)).eq('id', String(route.id));
  if (!error) return { consumida: true, motivo: 'ok' };
  if (colunaRegionalAusente(error)) return { consumida: false, motivo: 'coluna_ausente', detalhe: error.message };
  return { consumida: false, motivo: 'erro', detalhe: error.message };
}

export function camposAoSalvarRota(input: {
  routeType: TipoRota;
  region: RegiaoTabela | null;
  jaConsumida: boolean;
  consumedInOrderId?: string | null;
}): Record<string, unknown> {
  if (input.routeType === 'fixa') {
    return { route_type: 'fixa', is_active: true, region: input.region, consumed_in_order_id: null };
  }
  if (input.jaConsumida) {
    return {
      route_type: 'esporadica',
      is_active: false,
      region: input.region,
      consumed_in_order_id: input.consumedInOrderId || null,
    };
  }
  return { route_type: 'esporadica', is_active: true, region: input.region, consumed_in_order_id: null };
}
