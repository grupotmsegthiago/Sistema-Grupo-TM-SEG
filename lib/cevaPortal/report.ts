/**
 * Linha do controle de escolta CEVA com os mesmos números do boletim de medição.
 * O número da OS é o que o boletim imprime (sem o prefixo GTM-).
 * Os números seguem o boletim. O dinheiro só entra quando a OS está aprovada no sistema.
 */
import { calculateMissionFinancials, resolveCancelledWindow } from '../financialUtils';
import { resolveMissionDisplacement } from '../billing/resolveMissionDisplacement';
import { resolveStoredClientToll } from '../toll/clientTollBilling';

export type CevaReportSnapshot = {
  kmTotal?: unknown;
  franchiseKm?: unknown;
  franchiseHours?: unknown;
  durationHours?: unknown;
  hrExtraQtd?: unknown;
  kmExtraQtd?: unknown;
  hrExtraTotal?: unknown;
  kmExtraTotal?: unknown;
  activationFee?: unknown;
  totalGeral?: unknown;
  unitKm?: unknown;
  unitHr?: unknown;
  tollVal?: unknown;
  route?: unknown;
  displacementVal?: unknown;
  /** Receita de serviço do cliente gravada no snapshot. Não inclui pedágio nem deslocamento. */
  revenueServiceOnly?: unknown;
};

/** OS no formato gravado, com os campos que o boletim lê. */
export type CevaBoletimMission = {
  id: string;
  status?: string | null;
  client?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  start_km?: unknown;
  end_km?: unknown;
  total_distance?: unknown;
  traveled_distance?: unknown;
  mission_type?: string | null;
  driver_name?: string | null;
  origin?: string | null;
  destination?: string | null;
  region?: string | null;
  revenue_value?: unknown;
  toll_value?: unknown;
  toll_value_provider?: unknown;
  displacement_value?: unknown;
  displacement_value_provider?: unknown;
  dhl_deslocamento_km?: unknown;
  is_same_os?: boolean | null;
  billing_verified_by?: unknown;
  revenue_edit_reason?: unknown;
  snapshot_data?: CevaReportSnapshot | null;
  snapshot_approved_by?: string | null;
  billing_approved?: boolean | null;
  _cancelStatusAt?: string | null;
  /** Placa já resolvida em client_vehicles. Nunca o id do veículo. */
  plate?: string | null;
};

export type CevaBoletimContext = {
  priceTables: any[];
  providerTables: any[];
  clientData?: any;
  adjustment?: any;
};

export type CevaReportRow = {
  os: string;
  status: string;
  dataInicio: string | null;
  dataFim: string | null;
  solicitante: null;
  quemAutorizou: null;
  servico: string | null;
  atendimentoPgr: null;
  contrato: null;
  operacao: null;
  tsp: string | null;
  placa: string | null;
  motorista: string | null;
  franquiaHora: string | null;
  franquiaKm: number | null;
  kmInicio: number | null;
  kmFim: number | null;
  kmRodado: number | null;
  kmExcedente: number | null;
  hrsTrabalhada: string | null;
  hrsExcedente: string | null;
  valorHrsExcedente: number | null;
  valorKmExcedente: number | null;
  valorAcionamento: number | null;
  valorTotal: number | null;
  pedagio: number | null;
  tarifaKm: number | null;
  tarifaHora: number | null;
  local: string | null;
  obs: null;
  financeiro: 'ENCONTRADO';
  valores: 'APROVADO' | 'AGUARDANDO';
};

export function numeroOuNulo(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Km gravado na OS. Vazio continua vazio — zero só quando o sistema gravou zero. */
export function kmGravado(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  return numeroOuNulo(value);
}

function centavos(value: number): number {
  return Math.round(value * 100);
}

/**
 * A OS aprovada mudou depois do boletim congelado.
 * Receita, pedágio do cliente ou hodômetro diferentes do snapshot.
 * O carimbo de aprovação sozinho não conta: ele existe em toda OS aprovada.
 */
export function osMudouDepoisDoSnapshot(mission: CevaBoletimMission, snap: CevaReportSnapshot): boolean {
  const receita = numeroEntregue(mission.revenue_value);
  const servicoSnap = numeroOuNulo(snap.revenueServiceOnly);
  const baseSnap = servicoSnap != null
    ? servicoSnap
    : Math.max(0, numeroEntregue(snap.totalGeral) - numeroEntregue(snap.tollVal) - Math.max(0, numeroEntregue(snap.displacementVal)));
  if (centavos(receita) !== centavos(baseSnap)) return true;

  const pedagio = resolveStoredClientToll(mission.toll_value ?? 0, mission.toll_value_provider, mission.client);
  if (snap.tollVal != null && centavos(pedagio) !== centavos(numeroEntregue(snap.tollVal))) return true;

  const inicio = kmGravado(mission.start_km);
  const fim = kmGravado(mission.end_km);
  const kmSnap = numeroOuNulo(snap.kmTotal);
  if (inicio != null && fim != null && fim >= inicio && kmSnap != null && kmSnap > 0) {
    if (Math.abs((fim - inicio) - kmSnap) > 0.5) return true;
  }
  return false;
}

/** Número impresso no boletim. Qualquer outro id é OS fantasma e não entra. */
export function numeroOsDoBoletim(id: string): string | null {
  const match = String(id || '').trim().match(/^GTM-(\d+)$/);
  return match ? match[1] : null;
}

export function horaDoBoletim(value: unknown): string {
  const hours = numeroOuNulo(value) ?? 0;
  if (!Number.isFinite(hours) || hours <= 0) return '00:00';
  const hrs = Math.floor(hours);
  const mins = Math.round((hours - hrs) * 60);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function texto(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function placaReal(value: unknown): string | null {
  const text = texto(value);
  if (!text || text === '-' || /^\d+$/.test(text)) return null;
  return text;
}

function numeroEntregue(value: unknown): number {
  return numeroOuNulo(value) ?? 0;
}

const UF_VALIDA = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;
const LIGACAO = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function tituloCidade(city: string): string {
  return city
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && LIGACAO.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1);
    })
    .join(' ');
}

/** Cidade e UF reais do endereço, sem rua, bairro ou código do mapa. */
export function cidadeUfDoEndereco(address: unknown): string | null {
  const text = String(address || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const found: { city: string; uf: string }[] = [];
  const pattern = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.\s]{1,80}?)\s*(?:[-–]|,)\s*([A-Za-z]{2})\b/g;
  for (const match of text.matchAll(pattern)) {
    const uf = match[2].toUpperCase();
    if (!UF_VALIDA.test(uf)) continue;
    const comma = match[1].lastIndexOf(',');
    let city = (comma >= 0 ? match[1].slice(comma + 1) : match[1]).trim();
    city = city.replace(/^[A-Z0-9]{2,}\+[A-Z0-9]{2,}\s*[-–]?\s*/i, '').replace(/^[\s.-]+/, '').trim();
    if (city.length < 3 || /\d|\+/.test(city)) continue;
    found.push({ city, uf });
  }
  const last = found[found.length - 1];
  return last ? `${tituloCidade(last.city)} - ${last.uf}` : null;
}

export function localOrigemDestino(origin: unknown, destination: unknown): string | null {
  const from = cidadeUfDoEndereco(origin);
  const to = cidadeUfDoEndereco(destination);
  if (from && to) return `${from} x ${to}`;
  return from || to;
}

function baseDaLinha(mission: CevaBoletimMission, os: string): Omit<CevaReportRow, 'franquiaHora' | 'franquiaKm' | 'kmInicio' | 'kmFim' | 'kmRodado' | 'kmExcedente' | 'hrsTrabalhada' | 'hrsExcedente' | 'valorHrsExcedente' | 'valorKmExcedente' | 'valorAcionamento' | 'valorTotal' | 'pedagio' | 'tarifaKm' | 'tarifaHora' | 'local'> {
  return {
    os,
    status: texto(mission.status) || 'Concluída',
    dataInicio: texto(mission.start_time),
    dataFim: texto(mission.end_time),
    solicitante: null,
    quemAutorizou: null,
    servico: texto(mission.mission_type),
    atendimentoPgr: null,
    contrato: null,
    operacao: null,
    tsp: null,
    placa: placaReal(mission.plate),
    motorista: texto(mission.driver_name),
    obs: null,
    financeiro: 'ENCONTRADO',
    valores: 'AGUARDANDO',
  };
}

/** Mesma marca do boletim: só billing_approved libera o dinheiro para o cliente. */
export function osAprovadaParaValores(mission: { billing_approved?: boolean | null }): boolean {
  return mission.billing_approved === true;
}

function fecharLinha(row: CevaReportRow, mission: CevaBoletimMission): CevaReportRow {
  if (osAprovadaParaValores(mission)) return { ...row, valores: 'APROVADO' };
  return {
    ...row,
    valores: 'AGUARDANDO',
    valorHrsExcedente: null,
    valorKmExcedente: null,
    valorAcionamento: null,
    valorTotal: null,
    pedagio: null,
    tarifaKm: null,
    tarifaHora: null,
  };
}

/**
 * Monta a linha com a mesma regra do boletim de medição (modo cliente).
 * Retorna null quando o id não é o número entregue no boletim.
 */
export function linhaDoBoletimCeva(mission: CevaBoletimMission, ctx: CevaBoletimContext): CevaReportRow | null {
  const os = numeroOsDoBoletim(mission.id);
  if (!os) return null;

  const priceTables = ctx.priceTables || [];
  const providerTables = ctx.providerTables || [];
  const clientData = ctx.clientData;
  const snap = mission.snapshot_data && typeof mission.snapshot_data === 'object' ? mission.snapshot_data : null;
  const hasValidSnapshot = !!(mission.snapshot_approved_by && snap);
  const base = baseDaLinha(mission, os);

  if (hasValidSnapshot && snap) {
    const useBase = numeroEntregue(snap.activationFee);
    const useKmEx = numeroEntregue(snap.kmExtraTotal);
    const useHrEx = numeroEntregue(snap.hrExtraTotal);
    const useToll = resolveStoredClientToll(mission.toll_value ?? snap.tollVal ?? 0, mission.toll_value_provider, mission.client);
    let snapClientUnitKm = numeroEntregue(snap.unitKm);
    let snapProviderUnitKm = 0;
    try {
      const finSnapRates = calculateMissionFinancials(mission as any, priceTables, providerTables, clientData, new Date());
      if (snapClientUnitKm <= 0) snapClientUnitKm = finSnapRates.client.unitPriceKm || 0;
      snapProviderUnitKm = finSnapRates.provider.unitCostKm || 0;
    } catch { /* mesma folga do boletim */ }
    const useDisp = resolveMissionDisplacement({
      dhl_deslocamento_km: numeroOuNulo(mission.dhl_deslocamento_km),
      displacement_value: numeroOuNulo(mission.displacement_value ?? snap.displacementVal ?? 0),
      displacement_value_provider: numeroOuNulo(mission.displacement_value_provider),
      origin: mission.origin,
      is_same_os: mission.is_same_os,
    }, {
      clientUnitPriceKm: snapClientUnitKm,
      providerUnitPriceKm: snapProviderUnitKm,
    }).client;
    const dbRevenue = numeroEntregue(mission.revenue_value);
    const dbTotal = dbRevenue + resolveStoredClientToll(mission.toll_value || 0, mission.toll_value_provider, mission.client) + useDisp;
    const wasManuallyEdited = !!(mission.billing_verified_by || mission.revenue_edit_reason);
    const snapTotal = numeroEntregue(snap.totalGeral);
    const snapDispStored = Math.max(0, numeroEntregue(snap.displacementVal));
    const snapTotalWithDisp = snapTotal > 0 && snapDispStored <= 0 && useDisp > 0
      ? snapTotal + useDisp
      : snapTotal;
    const useTotal = wasManuallyEdited ? dbTotal : (snapTotalWithDisp > 0 ? snapTotalWithDisp : (useBase + useKmEx + useHrEx + useToll + useDisp));

    let snapFranchiseHours = numeroEntregue(snap.franchiseHours);
    let snapFranchiseKm = numeroEntregue(snap.franchiseKm);
    let snapUnitHr = numeroEntregue(snap.unitHr);
    let snapUnitKm = numeroEntregue(snap.unitKm);
    let snapHrExtraQtd = numeroEntregue(snap.hrExtraQtd);
    let snapKmExtraQtd = numeroEntregue(snap.kmExtraQtd);
    let snapDurationHours = numeroEntregue(snap.durationHours);

    if (snapFranchiseHours === 0 && snapFranchiseKm === 0 && snapUnitHr === 0 && snapUnitKm === 0) {
      try {
        const finFallback = calculateMissionFinancials(mission as any, priceTables, providerTables, clientData, new Date());
        const tblFallback = priceTables.find((t) => t.id.toString() === finFallback.client.tableId);
        if (tblFallback) {
          snapFranchiseHours = tblFallback.franchise_hours ?? 0;
          snapFranchiseKm = tblFallback.franchise_km ?? 0;
          snapUnitHr = tblFallback.price_per_extra_hour ?? 0;
          snapUnitKm = tblFallback.price_per_extra_km ?? 0;
          snapHrExtraQtd = finFallback.client.excessHours ?? 0;
          snapKmExtraQtd = finFallback.client.excessKm ?? 0;
          snapDurationHours = finFallback.durationHours ?? 0;
        }
      } catch { /* mantém o snapshot */ }
    }

    const isCancelledSnap = (mission.status || '').toString().toLowerCase().includes('cancel');
    const wasExecutedSnap = isCancelledSnap && !!mission.end_time && !!mission.start_time && new Date(mission.end_time).getTime() > new Date(mission.start_time).getTime();
    const cancelledBeforeSnap = isCancelledSnap && !wasExecutedSnap;
    const kmDoSnapshot = numeroEntregue(snap.kmTotal);
    const kmInicio = kmGravado(mission.start_km);
    const kmFim = kmGravado(mission.end_km);
    const kmPeloHodometro = kmInicio != null && kmFim != null && kmFim >= kmInicio ? kmFim - kmInicio : null;
    const kmTotalRawSnap = kmDoSnapshot > 0
      ? kmDoSnapshot
      : (kmPeloHodometro ?? kmGravado(mission.total_distance) ?? kmGravado(mission.traveled_distance));
    const kmTotal = cancelledBeforeSnap ? 0 : kmTotalRawSnap;

    const linha: CevaReportRow = {
      ...base,
      franquiaHora: horaDoBoletim(snapFranchiseHours),
      franquiaKm: snapFranchiseKm,
      kmInicio,
      kmFim,
      kmRodado: kmTotal,
      kmExcedente: snapKmExtraQtd,
      hrsTrabalhada: horaDoBoletim(snapDurationHours),
      hrsExcedente: horaDoBoletim(snapHrExtraQtd),
      valorHrsExcedente: useHrEx,
      valorKmExcedente: useKmEx,
      valorAcionamento: useBase,
      valorTotal: useTotal,
      pedagio: useToll,
      tarifaKm: snapUnitKm,
      tarifaHora: snapUnitHr,
      local: localOrigemDestino(mission.origin, mission.destination),
    };

    if (osMudouDepoisDoSnapshot(mission, snap)) {
      linha.valorTotal = dbTotal;
      linha.pedagio = useToll;
      if (!cancelledBeforeSnap && kmPeloHodometro != null && Math.abs(kmPeloHodometro - kmDoSnapshot) > 0.5) {
        linha.kmInicio = kmInicio;
        linha.kmFim = kmFim;
        linha.kmRodado = kmPeloHodometro;
      }
      try {
        const finVivo = calculateMissionFinancials(mission as any, priceTables, providerTables, clientData, new Date());
        const tabelaViva = priceTables.find((t) => t.id.toString() === finVivo.client.tableId);
        if (tabelaViva) {
          linha.franquiaHora = horaDoBoletim(tabelaViva.franchise_hours ?? 0);
          linha.franquiaKm = tabelaViva.franchise_km ?? 0;
          linha.kmExcedente = finVivo.client.excessKm ?? 0;
          linha.hrsTrabalhada = horaDoBoletim(finVivo.durationHours);
          linha.hrsExcedente = horaDoBoletim(finVivo.client.excessHours);
          linha.valorHrsExcedente = finVivo.client.extraHrVal ?? 0;
          linha.valorKmExcedente = finVivo.client.extraKmVal ?? 0;
          linha.valorAcionamento = tabelaViva.activation_fee ?? 0;
          linha.tarifaKm = tabelaViva.price_per_extra_km ?? 0;
          linha.tarifaHora = tabelaViva.price_per_extra_hour ?? 0;
        }
      } catch { /* sem tabela, o total do cliente ainda acompanha a OS */ }
    }

    return fecharLinha(linha, mission);
  }

  const tollVal = resolveStoredClientToll(mission.toll_value || 0, mission.toll_value_provider, mission.client);
  const savedRevenue = numeroEntregue(mission.revenue_value);
  const adj = ctx.adjustment;
  const overrides = adj ? {
    clientTableId: adj.clientTableId || undefined,
    providerTableId: (adj.providerTableId && !String(adj.providerTableId).startsWith('auto-')) ? adj.providerTableId : undefined,
    customClientBase: adj.customClientBase ? Number(adj.customClientBase) : undefined,
    customClientUnitKm: adj.customClientKm ? Number(adj.customClientKm) : undefined,
    customClientUnitHour: adj.customClientHour ? Number(adj.customClientHour) : undefined,
    customProviderBase: adj.customProviderBase ? Number(adj.customProviderBase) : undefined,
    customProviderUnitKm: adj.customProviderKm ? Number(adj.customProviderKm) : undefined,
    customProviderUnitHour: adj.customProviderHour ? Number(adj.customProviderHour) : undefined,
  } : undefined;
  const fin = calculateMissionFinancials(mission as any, priceTables, providerTables, clientData, new Date(), overrides);
  const usedTable = priceTables.find((t) => t.id.toString() === fin.client.tableId);
  const franchiseHours = usedTable?.franchise_hours ?? 0;
  const activationFee = usedTable?.activation_fee ?? 0;
  const unitKm = usedTable?.price_per_extra_km ?? 0;
  const unitHr = usedTable?.price_per_extra_hour ?? 0;
  const dispValN = resolveMissionDisplacement(mission as any, {
    clientUnitPriceKm: fin.client.unitPriceKm,
    providerUnitPriceKm: fin.provider.unitCostKm,
  }).client;

  const isCancelled = (mission.status || '').toString().toLowerCase().includes('cancel');
  const cancelWindow = isCancelled ? resolveCancelledWindow(mission.start_time, mission._cancelStatusAt) : null;
  const cancelledBefore = !!cancelWindow?.cancelledBefore;
  const kmInicio = kmGravado(mission.start_km);
  const kmFim = kmGravado(mission.end_km);
  const kmPeloHodometro = kmInicio != null && kmFim != null && kmFim >= kmInicio ? kmFim - kmInicio : null;
  const kmTotalRaw = fin.realTraveledKm > 0
    ? fin.realTraveledKm
    : (kmPeloHodometro ?? kmGravado(mission.total_distance) ?? kmGravado(mission.traveled_distance));
  const kmTotal = isCancelled ? 0 : kmTotalRaw;
  const totalGeral = savedRevenue + tollVal + dispValN;

  return fecharLinha({
    ...base,
    dataInicio: texto(isCancelled ? (cancelWindow!.start || mission.start_time || '') : (mission.start_time || '')),
    dataFim: texto(isCancelled ? (cancelWindow!.end || mission.start_time || '') : (mission.end_time || '')),
    franquiaHora: horaDoBoletim(franchiseHours),
    franquiaKm: usedTable?.franchise_km ?? 0,
    kmInicio,
    kmFim,
    kmRodado: kmTotal,
    kmExcedente: fin.client.excessKm ?? 0,
    hrsTrabalhada: cancelledBefore ? '00:00' : horaDoBoletim(fin.durationHours),
    hrsExcedente: horaDoBoletim(fin.client.excessHours),
    valorHrsExcedente: fin.client.extraHrVal ?? 0,
    valorKmExcedente: fin.client.extraKmVal ?? 0,
    valorAcionamento: activationFee,
    valorTotal: totalGeral,
    pedagio: tollVal,
    tarifaKm: unitKm,
    tarifaHora: unitHr,
    local: localOrigemDestino(mission.origin, mission.destination),
  }, mission);
}
