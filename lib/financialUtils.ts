import { Mission, ClientPriceTable, ProviderCostTable, MissionStatus, Client } from '../types';
import {
    extractAutoMasterConfig,
    extractAutoMasterConfigFromProvider,
    buildAutoMasterRowsFromProviders,
    calculateProviderCostAuto,
    isAutoMasterRow,
    type ProviderAutoCalcBreakdown,
} from './providerAutoPricing';
import { findDhlAutoClient, selectDhlClientTable } from './dhlAutoTableSelector';

const STOP_WORDS = ['LTDA','LTDA.','S.A.','S.A','SA','S/A','S/A.','DO','DE','DA','E','DAS','DOS'];
// PostgREST trata ( ) , . : como reservados dentro de .or(); envolvemos
// o valor com aspas duplas quando aparecer algum deles, para evitar que a
// consulta seja interpretada incorretamente (e retorne 0 linhas).
function quoteForOr(v: string): string {
    return /[(),.:]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}
export function clientFuzzyFilter(clientName: string): string {
    const trimmed = (clientName || '').trim();
    if (!trimmed) return `client.eq.${quoteForOr(clientName)}`;
    const words = trimmed.split(/\s+/).filter(w => !STOP_WORDS.includes(w.toUpperCase()));
    const short = words.length >= 2 ? words[0] + ' ' + words[1].substring(0, Math.min(6, words[1].length)) : words[0] || trimmed;
    return `client.eq.${quoteForOr(clientName)},client.ilike.${quoteForOr('%' + short + '%')}`;
}

export function clientNameShort(clientName: string): string {
    const trimmed = (clientName || '').trim();
    if (!trimmed) return trimmed;
    const words = trimmed.split(/\s+/).filter(w => !STOP_WORDS.includes(w.toUpperCase()));
    return words.length >= 2 ? words[0] + ' ' + words[1].substring(0, Math.min(6, words[1].length)) : words[0] || trimmed;
}

// Normaliza um nome de cliente em um conjunto de tokens significativos:
// caixa alta, sem acentos, sem pontuação e sem stop-words (LTDA, S/A, DE...).
// Usado para decidir se duas grafias se referem ao mesmo cliente sem
// descartar tabelas válidas por diferenças de pontuação/sufixo societário.
function clientSignificantTokens(clientName: string): string[] {
    const norm = (clientName || '')
        .toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!norm) return [];
    return norm.split(' ').filter(w => w && !STOP_WORDS.includes(w));
}

// Decide se dois nomes de cliente representam o mesmo cliente.
// Critério inclusivo (não descartar tabelas válidas): considera igual quando
// o conjunto de tokens significativos de um é subconjunto do outro
// (ex.: "DHL SUPPLY" ⊆ "GRUPO DHL SUPPLY CHAIN"). Marcas distintas que só
// compartilham um token genérico (ex.: "DHL EXPRESS" x "DHL SUPPLY") não casam.
export function isSameClientName(a: string, b: string): boolean {
    const ta = clientSignificantTokens(a);
    const tb = clientSignificantTokens(b);
    if (ta.length === 0 || tb.length === 0) return false;
    const setA = new Set(ta);
    const setB = new Set(tb);
    const smaller = setA.size <= setB.size ? setA : setB;
    const larger = setA.size <= setB.size ? setB : setA;
    for (const tok of smaller) {
        if (!larger.has(tok)) return false;
    }
    return true;
}

export interface CalculatedFinancials {
    autoEngine?: {
        active: boolean;
        bandKm: number;
        bandHours: number;
        realKm: number;
        durationHours: number;
        durationMinutes: number;
        effectiveStartIso: string | null;
        endIso: string | null;
        extraKm: number;
        extraHours: number;
        baseValue: number;
        extraKmValue: number;
        extraHourValue: number;
        totalCost: number;
        config: {
            baseActivationValue: number;
            baseKmAllowance: number;
            baseHourAllowance: number;
            extraKmValue: number;
            extraHourValue: number;
        };
    };
    realTraveledKm: number;
    durationHours: number;
    tollValue: number;
    isCompleted: boolean;
    hasValidKms: boolean;
    clientMult: number;
    providerMult: number;
    agentCount: number; 
    hasTwoAgentsOnMission: boolean;
    regionConflict: boolean;
    detectedRegion: string;
    autoCorrected: boolean; 
    calculationMemory: string;
    iblFee: number; 
    effectiveStartLabel: string;
    isMinimumActivationRule: boolean;
    hasClientTable: boolean;
    hasProviderTable: boolean;
    client: {
      total: number;
      serviceTotal: number;
      base: number;
      extraKmVal: number;
      extraHrVal: number;
      excessKm: number;
      excessHours: number;
      excessHoursReal: number;
      unitPriceKm: number;
      unitPriceHour: number;
      franchiseKm: number;
      franchiseHours: number;
      usedSpecialRule: boolean;
      tableName?: string;
      tableId?: string;
      detectionLog: string; 
    };
    provider: {
      total: number;
      serviceTotal: number;
      base: number;
      extraKmVal: number;
      extraHrVal: number;
      excessKm: number;
      excessHours: number;
      excessHoursReal: number;
      unitCostKm: number;
      unitCostHour: number;
      franchiseKm: number;
      franchiseHours: number;
      tableName?: string;
      tableId?: string;
      usedSpecialRule?: boolean;
      detectionLog: string;
    };
    profit: number;
    marginPercent: number;
}

const safeNumber = (val: any): number => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str.includes(',') && str.includes('.')) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
};

const normalize = (str: string | undefined | null) => {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
};

export const UF_TO_REGION: Record<string, string> = {
    'SP': 'SUDESTE', 'RJ': 'SUDESTE', 'MG': 'SUDESTE', 'ES': 'SUDESTE',
    'DF': 'CENTRO-OESTE', 'GO': 'CENTRO-OESTE', 'MT': 'CENTRO-OESTE', 'MS': 'CENTRO-OESTE',
    'PR': 'SUL', 'SC': 'SUL', 'RS': 'SUL',
    'BA': 'NORDESTE', 'PE': 'NORDESTE', 'CE': 'NORDESTE', 'RN': 'NORDESTE', 
    'PB': 'NORDESTE', 'AL': 'NORDESTE', 'SE': 'NORDESTE', 'PI': 'NORDESTE', 'MA': 'NORDESTE',
    'AM': 'NORTE', 'PA': 'NORTE', 'AC': 'NORTE', 'RO': 'NORTE', 'RR': 'NORTE', 'AP': 'NORTE', 'TO': 'NORTE'
};

// Regra de OS CANCELADA: a HORA INÍCIO e a HORA FINAL devem ser iguais ao
// momento em que o status foi alterado para "Cancelada" (mission_history),
// resultando em 0 horas. Se a OS foi cancelada ANTES do horário agendado
// (start_time), usa-se a data/hora do agendamento. Retorna a ISO efetiva a
// ser usada TANTO em início QUANTO em fim, ou null se não houver base.
export const resolveCancelledTime = (
    scheduledIso?: string | null,
    cancelIso?: string | null
): string | null => {
    const sched = scheduledIso ? new Date(scheduledIso) : null;
    const cancel = cancelIso ? new Date(cancelIso) : null;
    const schedOk = !!sched && !isNaN(sched.getTime());
    const cancelOk = !!cancel && !isNaN(cancel.getTime());
    if (!cancelOk && !schedOk) return null;
    if (!cancelOk) return scheduledIso as string;
    if (!schedOk) return cancelIso as string;
    // Cancelada antes do agendamento -> usa o agendamento.
    return cancel!.getTime() < sched!.getTime() ? (scheduledIso as string) : (cancelIso as string);
};

// Janela de cobrança de OS CANCELADA (todas as OS). Define INÍCIO e FIM a
// partir do AGENDAMENTO e do momento do CANCELAMENTO (mission_history), nunca
// do end_time administrativo:
//  - Cancelada ANTES do agendamento (cancel <= agendamento): início = fim =
//    agendamento (0h) -> cobra somente o mínimo.
//  - Cancelada DEPOIS: início = agendamento, fim = cancelamento -> soma as
//    horas extras (descontada a franquia da tabela mínima).
export const resolveCancelledWindow = (
    scheduledIso?: string | null,
    cancelIso?: string | null
): { start: string; end: string; cancelledBefore: boolean } => {
    const sched = scheduledIso ? new Date(scheduledIso) : null;
    const cancel = cancelIso ? new Date(cancelIso) : null;
    const schedOk = !!sched && !isNaN(sched.getTime());
    const cancelOk = !!cancel && !isNaN(cancel.getTime());
    const startIso = schedOk ? (scheduledIso as string) : (cancelOk ? (cancelIso as string) : '');
    if (!schedOk || !cancelOk) {
        return { start: startIso, end: startIso, cancelledBefore: true };
    }
    const cancelledBefore = cancel!.getTime() <= sched!.getTime();
    return {
        start: scheduledIso as string,
        end: cancelledBefore ? (scheduledIso as string) : (cancelIso as string),
        cancelledBefore,
    };
};

export const extractUF = (address: string): string => {
    if (!address) return '';
    const cleanAddr = address.split('(')[0].trim(); 
    const upper = cleanAddr.toUpperCase();
    
    const VALID_UFS = new Set(Object.keys(UF_TO_REGION));
    
    const allMatches = [...upper.matchAll(/[-/,]\s*([A-Z]{2})\b/g)];
    for (let i = allMatches.length - 1; i >= 0; i--) {
        const uf = allMatches[i][1];
        if (VALID_UFS.has(uf)) return uf;
    }

    if (upper.includes('SAO PAULO') || upper.includes('SÃO PAULO')) return 'SP';
    if (upper.includes('RIO DE JANEIRO')) return 'RJ';
    if (upper.includes('MINAS GERAIS')) return 'MG';
    if (upper.includes('ESPIRITO SANTO') || upper.includes('ESPÍRITO SANTO')) return 'ES';
    if (upper.includes('DISTRITO FEDERAL') || upper.includes('BRASILIA') || upper.includes('BRASÍLIA')) return 'DF';
    if (upper.includes('PARANA') || upper.includes('PARANÁ')) return 'PR';
    if (upper.includes('SANTA CATARINA')) return 'SC';
    if (upper.includes('RIO GRANDE DO SUL')) return 'RS';
    if (upper.includes('BAHIA')) return 'BA';
    if (upper.includes('PERNAMBUCO')) return 'PE';
    if (upper.includes('CEARA') || upper.includes('CEARÁ')) return 'CE';
    if (upper.includes('MARANHAO') || upper.includes('MARANHÃO')) return 'MA';
    if (upper.includes('PARA') || upper.includes('PARÁ')) return 'PA';
    if (upper.includes('GOIAS') || upper.includes('GOIÁS')) return 'GO';
    if (upper.includes('MATO GROSSO DO SUL')) return 'MS';
    if (upper.includes('MATO GROSSO')) return 'MT';
    if (upper.includes('RIO GRANDE DO NORTE')) return 'RN';
    if (upper.includes('PARAIBA') || upper.includes('PARAÍBA')) return 'PB';
    if (upper.includes('ALAGOAS')) return 'AL';
    if (upper.includes('SERGIPE')) return 'SE';
    if (upper.includes('PIAUI') || upper.includes('PIAUÍ')) return 'PI';
    if (upper.includes('AMAZONAS')) return 'AM';
    if (upper.includes('TOCANTINS')) return 'TO';
    if (upper.includes('RONDONIA') || upper.includes('RONDÔNIA')) return 'RO';
    if (upper.includes('ACRE')) return 'AC';
    if (upper.includes('RORAIMA')) return 'RR';
    if (upper.includes('AMAPA') || upper.includes('AMAPÁ')) return 'AP';

    const CITY_TO_UF: Record<string, string> = {
        'JABOATAO DOS GUARARAPES': 'PE', 'JABOATAO': 'PE', 'RECIFE': 'PE', 'OLINDA': 'PE', 'CARUARU': 'PE', 'PETROLINA': 'PE', 'PAULISTA': 'PE', 'CABO DE SANTO AGOSTINHO': 'PE', 'CAMARAGIBE': 'PE', 'GARANHUNS': 'PE', 'IPOJUCA': 'PE', 'SUAPE': 'PE', 'IGARASSU': 'PE', 'ABREU E LIMA': 'PE',
        'SALVADOR': 'BA', 'FEIRA DE SANTANA': 'BA', 'VITORIA DA CONQUISTA': 'BA', 'CAMACARI': 'BA', 'LAURO DE FREITAS': 'BA', 'ILHEUS': 'BA', 'ITABUNA': 'BA', 'JUAZEIRO': 'BA', 'SIMOES FILHO': 'BA', 'DIAS D\'AVILA': 'BA', 'CANDEIAS': 'BA', 'ALAGOINHAS': 'BA',
        'FORTALEZA': 'CE', 'CAUCAIA': 'CE', 'JUAZEIRO DO NORTE': 'CE', 'MARACANAU': 'CE', 'SOBRAL': 'CE', 'CRATO': 'CE', 'EUSEBIO': 'CE', 'PECÉM': 'CE', 'PECEM': 'CE', 'HORIZONTE': 'CE', 'PACATUBA': 'CE',
        'SAO LUIS': 'MA', 'IMPERATRIZ': 'MA', 'TIMON': 'MA', 'CAXIAS': 'MA', 'BACABAL': 'MA',
        'NATAL': 'RN', 'MOSSORO': 'RN', 'PARNAMIRIM': 'RN', 'SAO GONCALO DO AMARANTE': 'RN', 'MACAIBA': 'RN',
        'JOAO PESSOA': 'PB', 'CAMPINA GRANDE': 'PB', 'SANTA RITA': 'PB', 'BAYEUX': 'PB', 'CABEDELO': 'PB',
        'MACEIO': 'AL', 'ARAPIRACA': 'AL', 'RIO LARGO': 'AL', 'MARECHAL DEODORO': 'AL',
        'ARACAJU': 'SE', 'NOSSA SENHORA DO SOCORRO': 'SE', 'LAGARTO': 'SE', 'ITABAIANA': 'SE',
        'TERESINA': 'PI', 'PARNAIBA': 'PI',
        'BELEM': 'PA', 'ANANINDEUA': 'PA', 'SANTAREM': 'PA', 'MARABA': 'PA', 'CASTANHAL': 'PA', 'BARCARENA': 'PA',
        'MANAUS': 'AM', 'PARINTINS': 'AM',
        'PALMAS': 'TO', 'PORTO VELHO': 'RO', 'RIO BRANCO': 'AC', 'BOA VISTA': 'RR', 'MACAPA': 'AP',
        'GOIANIA': 'GO', 'APARECIDA DE GOIANIA': 'GO', 'ANAPOLIS': 'GO', 'LUZIANIA': 'GO',
        'CUIABA': 'MT', 'VARZEA GRANDE': 'MT', 'RONDONOPOLIS': 'MT', 'SINOP': 'MT',
        'CAMPO GRANDE': 'MS', 'DOURADOS': 'MS', 'TRES LAGOAS': 'MS',
        'CURITIBA': 'PR', 'LONDRINA': 'PR', 'MARINGA': 'PR', 'PONTA GROSSA': 'PR', 'CASCAVEL': 'PR', 'SAO JOSE DOS PINHAIS': 'PR', 'FOZ DO IGUACU': 'PR', 'COLOMBO': 'PR', 'PARANAGUA': 'PR',
        'FLORIANOPOLIS': 'SC', 'JOINVILLE': 'SC', 'BLUMENAU': 'SC', 'ITAJAI': 'SC', 'CHAPECO': 'SC', 'CRICIUMA': 'SC', 'NAVEGANTES': 'SC',
        'PORTO ALEGRE': 'RS', 'CAXIAS DO SUL': 'RS', 'CANOAS': 'RS', 'PELOTAS': 'RS', 'SANTA MARIA': 'RS', 'GRAVATAI': 'RS', 'NOVO HAMBURGO': 'RS', 'SAO LEOPOLDO': 'RS',
        'BRASILIA': 'DF', 'TAGUATINGA': 'DF', 'CEILANDIA': 'DF', 'SAMAMBAIA': 'DF',
        'BELO HORIZONTE': 'MG', 'UBERLANDIA': 'MG', 'CONTAGEM': 'MG', 'JUIZ DE FORA': 'MG', 'BETIM': 'MG', 'MONTES CLAROS': 'MG', 'UBERABA': 'MG', 'GOVERNADOR VALADARES': 'MG', 'IPATINGA': 'MG', 'POUSO ALEGRE': 'MG', 'EXTREMA': 'MG',
        'CAMPINAS': 'SP', 'GUARULHOS': 'SP', 'OSASCO': 'SP', 'SANTO ANDRE': 'SP', 'SAO BERNARDO DO CAMPO': 'SP', 'SANTOS': 'SP', 'RIBEIRAO PRETO': 'SP', 'SOROCABA': 'SP', 'SAO JOSE DOS CAMPOS': 'SP', 'BARUERI': 'SP', 'JUNDIAI': 'SP', 'PIRACICABA': 'SP', 'MAUA': 'SP', 'CAJAMAR': 'SP', 'BAURU': 'SP', 'DIADEMA': 'SP', 'ITAQUAQUECETUBA': 'SP', 'TABOAO DA SERRA': 'SP', 'COTIA': 'SP', 'EMBU DAS ARTES': 'SP', 'SUMARE': 'SP', 'INDAIATUBA': 'SP', 'AMERICANA': 'SP', 'LIMEIRA': 'SP', 'FRANCA': 'SP', 'PRAIA GRANDE': 'SP', 'CUBATAO': 'SP', 'GUARUJA': 'SP',
        'NITEROI': 'RJ', 'SAO GONCALO': 'RJ', 'DUQUE DE CAXIAS': 'RJ', 'NOVA IGUACU': 'RJ', 'CAMPOS DOS GOYTACAZES': 'RJ', 'BELFORD ROXO': 'RJ', 'VOLTA REDONDA': 'RJ', 'PETROPOLIS': 'RJ', 'MACAE': 'RJ', 'ITABORAI': 'RJ', 'RESENDE': 'RJ',
        'VITORIA': 'ES', 'VILA VELHA': 'ES', 'SERRA': 'ES', 'CARIACICA': 'ES', 'CACHOEIRO DE ITAPEMIRIM': 'ES', 'LINHARES': 'ES', 'GUARAPARI': 'ES', 'ARACRUZ': 'ES'
    };
    const normalizedUpper = upper.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const [cityName, ufCode] of Object.entries(CITY_TO_UF)) {
        if (normalizedUpper.includes(cityName)) return ufCode;
    }
    
    return '';
};

export const extractCityFromAddress = (address: string): string => {
    if (!address) return '';
    const upper = address.toUpperCase().trim();
    
    const VALID_UFS = new Set(Object.keys(UF_TO_REGION));
    
    const ufPattern = /,\s*([A-ZÀ-Ú\s]+?)\s*[-–]\s*([A-Z]{2})\s*[,\b]/;
    const match = upper.match(ufPattern);
    if (match && VALID_UFS.has(match[2])) {
        return match[1].trim();
    }
    
    const ufPatternEnd = /,\s*([A-ZÀ-Ú\s]+?)\s*[-–]\s*([A-Z]{2})\s*$/;
    const matchEnd = upper.match(ufPatternEnd);
    if (matchEnd && VALID_UFS.has(matchEnd[2])) {
        return matchEnd[1].trim();
    }
    
    const segments = address.split(',').map(s => s.trim());
    for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i].trim();
        const ufSplit = seg.split(/\s*[-–]\s*/);
        if (ufSplit.length >= 2) {
            const possibleUF = ufSplit[ufSplit.length - 1].trim().toUpperCase();
            if (VALID_UFS.has(possibleUF)) {
                const city = ufSplit[ufSplit.length - 2].trim();
                if (city.length > 2 && !/^\d/.test(city)) return city.toUpperCase();
            }
        }
    }
    
    const parts = address.split(/[-,]/);
    if (parts.length >= 2) {
        const potentialCity = parts[parts.length - 2].trim();
        if (potentialCity.length > 2 && !/^\d/.test(potentialCity)) return potentialCity;
    }
    return parts[0].trim();
};

export const identifyRegionFromText = (text: string): string => {
    if (!text) return '';
    const upper = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const regions = ['SUDESTE', 'SUL', 'CENTRO-OESTE', 'NORDESTE', 'NORTE'];
    for (const region of regions) {
        if (upper.includes(region)) return region;
    }
    const uf = extractUF(text);
    if (uf && UF_TO_REGION[uf]) return UF_TO_REGION[uf];
    return '';
};

export const applyRegionSuffix = (address: string): string => {
    if (!address) return '';
    const cleanAddr = address.split('(')[0].trim();
    const uf = extractUF(cleanAddr);
    const region = UF_TO_REGION[uf];
    return region ? `${cleanAddr} (${region})` : cleanAddr;
};

const parseSafeDate = (dateInput: any): Date | null => {
    if (!dateInput) return null;
    try {
        if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
        let str = String(dateInput).trim();
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    } catch (e) { return null; }
};

export const calculateMissionFinancials = (
    mission: Mission,
    clientTables: ClientPriceTable[],
    providerTables: ProviderCostTable[],
    clientData?: Client,
    currentTime: Date = new Date(),
    manualTableOverrides?: { 
        clientTableId?: string; 
        providerTableId?: string; 
        forceIblFee?: boolean;
        customClientUnitKm?: number;
        customClientUnitHour?: number;
        customProviderUnitKm?: number;
        customProviderUnitHour?: number;
        customClientBase?: number;
        customProviderBase?: number;
        disableFixedKmRule?: boolean;
        providerOpsOverride?: {
            distanceKm: number;
            durationHours: number;
        };
    },
    providers?: any[] | null,
): CalculatedFinancials => {
    // Task #58: anexa linhas mestre sintéticas derivadas das colunas
    // dedicadas em providers (auto_calc_enabled etc.). Mantém o contrato
    // interno do engine intacto (continua filtrando via isAutoMasterRow).
    if (providers && providers.length > 0) {
        const autoRows = buildAutoMasterRowsFromProviders(providers);
        if (autoRows.length > 0) {
            providerTables = [...providerTables, ...autoRows];
        }
    }
    // Resolução de apelidos (razão social x nome fantasia): a missão pode
    // referenciar o fornecedor por qualquer um dos dois nomes, mas as
    // tabelas de custo podem estar cadastradas sob o outro. Constrói o
    // conjunto de apelidos normalizados a partir de providers e usa para
    // expandir o casamento mais abaixo (procurar por providerAliasSet).
    const providerAliasSet: Set<string> = new Set();
    if (providers && providers.length > 0 && mission?.provider) {
        const missionProvNorm = normalize(mission.provider);
        const match = providers.find((p: any) => {
            const n = normalize(p?.name || '');
            const tn = normalize(p?.trading_name || '');
            return (n && n === missionProvNorm) || (tn && tn === missionProvNorm);
        });
        if (match) {
            const n = normalize(match.name || '');
            const tn = normalize(match.trading_name || '');
            if (n) providerAliasSet.add(n);
            if (tn) providerAliasSet.add(tn);
        }
    }
    const isTerminalStatus = [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(mission.status as MissionStatus);
    const isFinished = mission.status === MissionStatus.COMPLETED;
    const isCancelled = mission.status === MissionStatus.CANCELLED;
    const isRefused = mission.status === MissionStatus.REFUSED;
    const isPending = mission.status === MissionStatus.PENDING;
    const cancelledWithValues = isCancelled && (safeNumber(mission.revenue_value) > 0 || safeNumber(mission.cost_value) > 0);
    const isZeroValueMission = (isCancelled && !cancelledWithValues) || isRefused;
    
    const getKm = (val: any) => typeof val === 'number' ? val : parseFloat(String(val || '0').replace(',', '.'));
    
    const startKm = getKm(mission.startKm || (mission as any).start_km);
    const endKm = getKm(mission.endKm || (mission as any).end_km);
    const hasValidKms = startKm > 0 && endKm > 0 && endKm >= startKm;
    
    let realTraveledKm = 0;
    if (hasValidKms) {
        realTraveledKm = endKm - startKm;
    }
    
    const totalDistance = safeNumber(mission.totalDistance || (mission as any).total_distance);
    // REGRA DE KM PARA CÁLCULO:
    // - Missão CONCLUÍDA: usa o KM REAL EXECUTADO (endKm - startKm) sempre que
    //   houver hodômetro válido. Esse é o KM canônico para faturamento.
    //   Se não houver hodômetro válido (legado), cai para o KM previsto da rota
    //   como fallback defensivo para não quebrar OS antigas.
    // - Missão EM ANDAMENTO (Agendada / Em Viagem / Origem / etc.): usa o KM
    //   PREVISTO (rota) para simulação. O KM REAL é mostrado apenas visualmente.
    // - Missão CANCELADA / RECUSADA: zera o KM (regra de acionamento mínimo).
    let distanceForCalculation: number;
    if (isFinished) {
        distanceForCalculation = hasValidKms ? realTraveledKm : totalDistance;
    } else if (isZeroValueMission) {
        distanceForCalculation = hasValidKms ? realTraveledKm : 0;
    } else {
        distanceForCalculation = totalDistance;
    }

    // REGRA DE CANCELAMENTO (acionamento mínimo + excedente quando executada):
    // Por padrão, OS CANCELADA cobra apenas o acionamento mínimo da menor
    // tabela regional, com KM zerado (cancelada ANTES de executar).
    // EXCEÇÃO confirmada pela diretoria: se a OS foi de fato EXECUTADA — há
    // hodômetro válido com rodagem real (end_km > start_km) — o KM rodado conta
    // normalmente e o excedente acima da franquia É cobrado. A pessoa foi
    // contratada, rodou mais que o combinado, então tem que receber por isso.
    // (As horas extras de cancelada seguem a regra própria via cancelStatusAt:
    //  cobra-se a hora excedente quando o cancelamento ocorre após a franquia.)
    if (isCancelled) {
        distanceForCalculation = (hasValidKms && realTraveledKm > 0) ? realTraveledKm : 0;
    }
    
    const scheduledDate = parseSafeDate(mission.startTime || (mission as any).start_time); 
    const creationDate = parseSafeDate(mission.createdAt); 
    let effectiveStartDate = scheduledDate || creationDate || currentTime;
    let startLabel = scheduledDate ? "Agendamento" : "Criação";

    let endDateObj = currentTime;
    
    const dbEndTime = parseSafeDate(mission.endTime || (mission as any).end_time);
    if (dbEndTime) {
        endDateObj = dbEndTime;
    } else if (isTerminalStatus) {
        const lastUpdateDate = parseSafeDate(mission.lastUpdate);
        endDateObj = lastUpdateDate || currentTime;
    } else if (isPending) {
        const lastUpdateDate = parseSafeDate(mission.lastUpdate);
        endDateObj = lastUpdateDate || currentTime;
    } else {
        endDateObj = currentTime;
    }

    // REGRA DE CANCELADA (todas as OS): o "fim" para cobrança é o momento do
    // CANCELAMENTO registrado em mission_history (_cancelStatusAt), NÃO o
    // end_time administrativo — que pode ser gravado dias depois e inflar as
    // horas (ex.: OS agendada 19/05 com end_time 27/05 -> ~200h falsas).
    // Cancelada ANTES do agendamento (cancelAt <= agendamento) cobra só o
    // mínimo (fim = início, 0h). Cancelada DEPOIS soma as horas extras do
    // AGENDAMENTO até o cancelamento.
    const cancelStatusAt = parseSafeDate((mission as any).cancelStatusAt || (mission as any)._cancelStatusAt);
    if (isCancelled) {
        endDateObj = (cancelStatusAt && cancelStatusAt.getTime() > effectiveStartDate.getTime())
            ? cancelStatusAt
            : effectiveStartDate;
    }

    const diffMs = endDateObj.getTime() - effectiveStartDate.getTime();
    let durationHours = Math.max(0, diffMs / (1000 * 60 * 60));

    // ALINHAMENTO COBRANÇA x EXIBIÇÃO:
    // O card "Duração" no MissionFinancialModal trunca os segundos com Math.floor
    // (ex.: 12h16min42s vira "12h16min"). Antes desta correção, o cálculo financeiro
    // usava o decimal completo com segundos, causando divergência: 12.27862h × R$129,60
    // = R$ 1.202,51 quando o esperado pela tela (12h16min × R$129,60) era R$ 1.200,96.
    // Truncamos para o minuto inteiro (igual ao display), zerando os segundos.
    durationHours = Math.floor(durationHours * 60) / 60;

    // Detecção de execução alinhada com a exibição (boletim): a OS é considerada
    // EXECUTADA quando tem hora de fim real POSTERIOR ao início (end > start),
    // independente da duração truncada ao minuto. Assim o motor e o boletim
    // classificam igual mesmo em durações < 1 min.
    const cancelledWithHours = isCancelled && !!cancelStatusAt && cancelStatusAt.getTime() > effectiveStartDate.getTime();
    // OS que foi EXECUTADA e cancelada depois (possui hora de fim real) deve
    // cobrar tempo/distância reais como uma OS normal. Apenas o cancelamento
    // ANTES da execução (sem hora de fim real) cobra somente o acionamento base.
    const cancelledBeforeExecution = isCancelled && !cancelledWithHours;
    if (isZeroValueMission && !cancelledWithHours) {
        durationHours = 0;
    }

    // REGRA DE CANCELAMENTO (acionamento mínimo):
    // Mesmo quando a OS cancelada tem valor salvo manualmente, a duração
    // usada na "Tabela Oficial" é zerada sempre que não houver endTime real.
    // Sem isso, missões canceladas sem encerramento formal acumulam horas
    // do agendamento até "agora" e geram referências oficiais absurdas
    // (ex.: 182h × R$/h = R$ 27 mil para uma OS de R$ 700 de acionamento).
    if (isCancelled && !cancelledWithHours) {
        durationHours = 0;
    }

    let tollValue = isZeroValueMission ? 0 : Math.max(0, safeNumber(mission.toll_value));
    
    const validAgents = [mission.agent1, mission.agent2]
        .map(a => a ? String(a).trim() : '')
        .filter(n => n && n !== '---' && n.toUpperCase() !== 'N/A');
    
    const agentCount = validAgents.length || 1;
    const missionTypeRaw = (mission.mission_type || '').toUpperCase();
    const isVelada = missionTypeRaw.includes('VELADA') || (mission.vehicleData?.type || '').toUpperCase().includes('VELADA');
    
    const missionTypeKeyword = isVelada ? 'VELADA' : 'CARACTERIZADA';
    const clientMultiplier = 1;
    const missionProviderName = normalize(mission.provider);
    
    const isSpecialProvider = missionProviderName.includes('ATIVA') || missionProviderName.includes('TM SEG');
    const isProviderMacor = missionProviderName.includes('MACOR');
    let providerMultiplier = 1;

    const selectStrictTable = (candidateTables: any[], dist: number, region: string, city: string, typeKeyword: string, destCity: string, routeCode?: string, agentAware?: { count: number, isSpecial: boolean }, originUFCode?: string, originAddress?: string) => {
        if (!candidateTables || candidateTables.length === 0) return { table: null, log: 'Sem tabelas cadastradas' };

        const normalizedRegion = normalize(region);
        const normalizedCity = normalize(city);
        const normalizedDestCity = normalize(destCity);
        const normalizedType = normalize(typeKeyword);
        const normalizedRouteCode = normalize(routeCode);
        const normalizedOriginAddr = normalize(originAddress);
        const ufCode = (originUFCode || '').toUpperCase();

        const isVeladaMission = normalizedType.includes('VELADA');
        const isCaracterizadaMission = normalizedType.includes('CARACTERIZADA');

        const scoredTables = candidateTables.map(t => {
            const tableOp = normalize(t.operation_type || '');
            let score = 0;
            let matchType = 'Genérico';

            const isArmadoTable = tableOp.includes('ARMADO') || tableOp.includes('ARMADOS') || tableOp.includes('PRONTA RESPOSTA');
            const isFranchiseKmTableName = tableOp.includes('ATE ') || tableOp.includes('ATE') || tableOp.includes('FAIXA');

            if (isVeladaMission) {
                if (isFranchiseKmTableName && !isArmadoTable) { score -= 5000; matchType = 'Velada não usa faixa KM'; }
                if (tableOp.includes('CARACTERIZADA') && !tableOp.includes('VELADA')) { score -= 5000; matchType = 'Tipo Incompatível (CARACTERIZADA)'; }
                if (isArmadoTable) { score += 3000; matchType = 'Tabela Armado (Velada)'; }
                if (tableOp.includes('VELADA')) { score += 2500; matchType = 'Tipo: VELADA'; }
            }

            if (isCaracterizadaMission) {
                if (isArmadoTable && !isFranchiseKmTableName) { score -= 3000; matchType = 'Caracterizada usa faixa KM'; }
                if (tableOp.includes('VELADA') && !tableOp.includes('CARACTERIZADA')) { score -= 5000; matchType = 'Tipo Incompatível (VELADA)'; }
                if (tableOp.includes('CARACTERIZADA')) { score += 2500; matchType = 'Tipo: CARACTERIZADA'; }
            }
            
            if (agentAware && agentAware.isSpecial) {
                const isTable02 = tableOp.includes('02 ARMADO') || tableOp.includes('02 ARMADOS') || tableOp.includes('DOIS ARMADO');
                const isTable01 = (tableOp.includes('01 ARMADO') || tableOp.includes('01 AGENTE') || tableOp.includes('01 PRONTA') || (tableOp.includes('PRONTA RESPOSTA') && !isTable02)) && !isTable02;
                
                if (agentAware.count >= 2) {
                    if (isTable02) { score += 3000; matchType = '02 Agentes (Tabela Dupla)'; }
                    else if (isTable01) { score -= 2000; }
                } else {
                    if (isTable01) { score += 3000; matchType = '01 Agente (Pronta Resposta)'; }
                    else if (isTable02) { score -= 2000; }
                }
            }
            
            if (normalizedRouteCode && tableOp.includes(normalizedRouteCode)) {
                score += 5000;
                matchType = `Código da Rota (${routeCode})`;
            }
            
            else if (normalizedCity.length > 3 && normalizedDestCity.length > 3 && 
                tableOp.includes(normalizedCity) && tableOp.includes(normalizedDestCity)) {
                score += 5000;
                matchType = `Rota Exata (${city} x ${destCity})`;
            }

            else if (normalizedCity.length > 3 && tableOp.includes(normalizedCity)) {
                score += 2000;
                matchType = `Cidade Origem (${city})`;
            }
            
            else if (normalizedOriginAddr && normalizedCity.length <= 3) {
                const cityNames = normalizedOriginAddr.split(/[,\-–]/).map((s: string) => s.trim()).filter((s: string) => s.length > 3 && !/^\d/.test(s));
                for (const cn of cityNames) {
                    if (tableOp.includes(cn)) {
                        score += 2000;
                        matchType = `Cidade Endereço (${cn})`;
                        break;
                    }
                }
            }

            if (tableOp.includes('EXCETO')) {
                if (ufCode === 'MG' && tableOp.includes('EXCETO MG')) {
                    score -= 5000;
                    matchType = 'Bloqueado (EXCETO MG)';
                } else if (ufCode === 'ES') {
                    const excetoIdx = tableOp.indexOf('EXCETO');
                    const afterExceto = tableOp.substring(excetoIdx);
                    if (afterExceto.includes('MG') && afterExceto.includes('ES')) {
                        score -= 5000;
                        matchType = 'Bloqueado (EXCETO ES)';
                    }
                }
            }

            if (ufCode && (ufCode === 'MG' || ufCode === 'ES')) {
                if (tableOp.includes('MG') && tableOp.includes('ES') && !tableOp.includes('EXCETO')) {
                    score += 1500;
                    matchType = `UF Específico MG/ES (${ufCode})`;
                }
            }

            if (score < 2000) {
                if (ufCode && ufCode.length === 2) {
                    const ufInOp = tableOp.match(/\b(SP|RJ|MG|ES|PR|SC|RS|BA|PE|CE|RN|PB|AL|SE|PI|MA|AM|PA|AC|RO|RR|AP|TO|DF|GO|MT|MS)\b/g);
                    if (ufInOp && ufInOp.includes(ufCode) && !tableOp.includes('EXCETO')) {
                        score += 1200;
                        if (matchType === 'Genérico') matchType = `UF (${ufCode})`;
                    }
                }

                if (normalizedRegion && tableOp.includes(normalizedRegion)) {
                    if (!tableOp.includes('EXCETO')) {
                        score += 800;
                        if (matchType === 'Genérico') matchType = `Região (${region})`;
                    }
                }
                else if (normalizedRegion === 'SUDESTE') {
                    if (ufCode === 'SP' && (tableOp.includes('SP') || tableOp.includes('SAO PAULO'))) {
                        score += 600;
                        if (matchType === 'Genérico') matchType = 'Estado (SP)';
                    } else if (ufCode === 'RJ' && (tableOp.includes('RJ') || tableOp.includes('RIO DE JANEIRO'))) {
                        score += 600;
                        if (matchType === 'Genérico') matchType = 'Estado (RJ)';
                    }
                }
            }

            const isNivelBrasil = tableOp.includes('NIVEL BRASIL') || tableOp.includes('BRASIL');
            const isRegionalTable = tableOp.includes('SUDESTE') || tableOp.includes('SUL') || tableOp.includes('CENTRO') || tableOp.includes('NORDESTE') || tableOp.includes('NORTE');
            if (isRegionalTable && score >= 800 && isNivelBrasil) {
                score -= 100;
            }

            const isFranchiseKmTable = tableOp.includes('ATE ') || tableOp.includes('ATE') || tableOp.includes('FAIXA');
            const franchiseKm = parseFloat(t.franchise_km) || 0;

            if (isFranchiseKmTable && franchiseKm > 0 && dist > 0) {
                if (dist <= franchiseKm) {
                    score += 600;
                    const excess = franchiseKm - dist;
                    score -= Math.min(excess * 0.5, 200);
                } else {
                    score -= 300;
                }
            } else if (franchiseKm >= dist) {
                score += 50;
            } else if (franchiseKm > 0) {
                score -= 10;
            }

            return { ...t, score, matchType };
        });

        const validCandidates = scoredTables.filter(t => t.score > -1000).sort((a, b) => b.score - a.score);
        if (validCandidates.length === 0) return { table: null, log: 'Bloqueio Regional Ativo' };

        const topScore = validCandidates[0].score;
        const bestGroup = validCandidates.filter(t => t.score >= topScore - 20); 

        const isFranchiseName = (name: string) => {
            const n = (name || '').toUpperCase();
            return n.includes('ATÉ') || n.includes('ATE ') || n.includes('FAIXA') || /\bATE\W*\d/i.test(n);
        };

        const franchiseTables = bestGroup.filter(t => isFranchiseName(t.operation_type || ''));
        if (franchiseTables.length > 0) {
            const coveringFranchise = franchiseTables
                .filter(t => t.franchise_km >= dist)
                .sort((a, b) => a.franchise_km - b.franchise_km);
            if (coveringFranchise.length > 0) {
                return { table: coveringFranchise[0], log: `Faixa KM (${coveringFranchise[0].matchType})` };
            }
            const largest = [...franchiseTables].sort((a, b) => b.franchise_km - a.franchise_km);
            return { table: largest[0], log: `Faixa KM Máx (${largest[0].matchType})` };
        }

        const sortedByKm = bestGroup.sort((a, b) => a.franchise_km - b.franchise_km);
        const exactCover = sortedByKm.find(t => t.franchise_km >= dist);
        const bestTable = exactCover || sortedByKm[sortedByKm.length - 1];

        return { table: bestTable, log: `${bestTable.matchType}` };
    };

    const originUF = extractUF(mission.origin || '');
    const detectedRegion = UF_TO_REGION[originUF] || ''; 
    const originCity = extractCityFromAddress(mission.origin || '');
    const destCity = extractCityFromAddress(mission.destination || '');
    const missionClientName = normalize(mission.originalClientName || mission.client);
    const missionRouteCode = (mission as any).route_code || (mission as any).code;

    let appliedClientTable: any = null;
    let clientLog = 'Manual';

    const allClientTablesForThisClient = clientTables.filter(t => normalize(t.client) === missionClientName);

    const isIblClient = missionClientName.includes('IBL') || missionClientName.includes('INTERMODAL BRASIL');

    let clientTablesFiltered = allClientTablesForThisClient;
    if (!isProviderMacor) {
        clientTablesFiltered = allClientTablesForThisClient.filter(t => !normalize(t.operation_type || '').includes('MACOR'));
    } else {
        const macorTables = allClientTablesForThisClient.filter(t => normalize(t.operation_type || '').includes('MACOR'));
        if (macorTables.length > 0) {
            clientTablesFiltered = macorTables;
        }
    }

    let isManualOverride = false;
    if (manualTableOverrides?.clientTableId) {
        const manualTable = clientTables.find(t => t.id.toString() === manualTableOverrides.clientTableId);
        const manualTableOp = (manualTable?.operation_type || '').toUpperCase();
        const regionNames = ['SUDESTE', 'SUL', 'CENTRO-OESTE', 'NORDESTE', 'NORTE'];
        const manualTableRegion = regionNames.find(r => manualTableOp.includes(r)) || '';
        const regionOk = !manualTableRegion || !detectedRegion || manualTableRegion === detectedRegion.toUpperCase();
        if (regionOk) {
            appliedClientTable = manualTable;
            clientLog = 'Seleção Manual / Memória';
            isManualOverride = true;
        }
    }
    // OS Cancelada ANTES da execução vence o motor DHL e qualquer outro fallback:
    // cobra-se a menor faixa da tabela (tipicamente 100KM). OS executada e
    // cancelada depois segue o fluxo normal de seleção. Critério: menor
    // franchise_km > 0; desempate por menor activation_fee. Quando há
    // detectedRegion (ex.: SUDESTE), priorizamos a tabela 100KM dessa região.
    let dhlEngineHandled = false;
    if (!appliedClientTable && isCancelled && clientTablesFiltered.length > 0) {
        const region = String(detectedRegion || '').toUpperCase();
        const isAutoMaster = (op: string) => (op || '').toUpperCase().includes('__AUTO_MASTER__');
        const withKm = clientTablesFiltered.filter(t =>
            (t.franchise_km || 0) > 0 &&
            (t.activation_fee || 0) > 0 &&
            !isAutoMaster(t.operation_type || '')
        );
        if (withKm.length > 0) {
            const sorted = [...withKm].sort((a, b) => {
                const km = (a.franchise_km || 0) - (b.franchise_km || 0);
                if (km !== 0) return km;
                const aRegion = region && (a.operation_type || '').toUpperCase().includes(region) ? 0 : 1;
                const bRegion = region && (b.operation_type || '').toUpperCase().includes(region) ? 0 : 1;
                if (aRegion !== bRegion) return aRegion - bRegion;
                return (a.activation_fee || 0) - (b.activation_fee || 0);
            });
            appliedClientTable = sorted[0];
            clientLog = `Cancelada → Menor Faixa KM (${appliedClientTable?.operation_type}, ${appliedClientTable?.franchise_km}km)`;
        } else {
            const sorted = [...clientTablesFiltered]
                .filter(t => (t.activation_fee || 0) > 0 && !isAutoMaster(t.operation_type || ''))
                .sort((a, b) => (a.activation_fee || 0) - (b.activation_fee || 0));
            appliedClientTable = sorted.length > 0 ? sorted[0] : clientTablesFiltered[0];
            clientLog = `Cancelada → Menor Acionamento (${appliedClientTable?.operation_type})`;
        }
        // marca como tratado para impedir que blocos abaixo (DHL Auto, faixa KM,
        // CEVA/LOGITECH, CESLOG) sobrescrevam a tabela escolhida pelo cancelamento.
        dhlEngineHandled = true;
    }

    // Task #108/#109: motor automático para razões sociais DHL registradas
    // (DHL Supply Chain, DHL Express, DHL Global Forwarding, DHL Logistics).
    // Cada empresa tem seu próprio gatilho via findDhlAutoClient e o seletor
    // isola as tabelas pelo nome exato do cliente, sem misturar contratos
    // entre empresas diferentes do grupo DHL. Não cai no selectStrictTable
    // nem nos blocos de fallback genéricos — mesmo no caso "none".
    const dhlClientCanonical = !appliedClientTable && !isManualOverride && !isCancelled
      ? findDhlAutoClient(missionClientName)
      : null;
    if (dhlClientCanonical) {
      const dhlResult = selectDhlClientTable(
        clientTablesFiltered,
        { origin: mission.origin || '', destination: mission.destination || '' },
        totalDistance,
        { clientName: dhlClientCanonical },
      );
      dhlEngineHandled = true;
      if (dhlResult.table) {
        appliedClientTable = dhlResult.table;
        clientLog = `DHL Auto [${dhlClientCanonical}][${dhlResult.matchLevel}]: ${dhlResult.reason}`;
      } else {
        appliedClientTable = null;
        clientLog = `DHL Auto [${dhlClientCanonical}][none]: ${dhlResult.reason}`;
      }
    }
    if (!appliedClientTable && !dhlEngineHandled) {
        const clientDistReference = Math.max(totalDistance, distanceForCalculation);
        const result = selectStrictTable(
            clientTablesFiltered, 
            clientDistReference, 
            detectedRegion,
            originCity,
            missionTypeKeyword,
            destCity,
            missionRouteCode,
            isSpecialProvider ? { count: agentCount, isSpecial: true } : undefined,
            originUF,
            mission.origin || ''
        );
        appliedClientTable = result.table;
        clientLog = result.log;

        const isFranchiseN = (name: string) => {
            const n = (name || '').toUpperCase();
            return n.includes('ATÉ') || n.includes('ATE ') || n.includes('FAIXA') || /\bATE\W*\d/i.test(n);
        };
        if (appliedClientTable && !isFranchiseN(appliedClientTable.operation_type || '')) {
            const selectedFranchiseKm = appliedClientTable.franchise_km || 0;
            if (selectedFranchiseKm > clientDistReference * 3 && clientDistReference > 0) {
                const franchiseCandidates = clientTablesFiltered.filter(t => {
                    if (!isFranchiseN(t.operation_type || '')) return false;
                    if ((t.franchise_km || 0) < clientDistReference) return false;
                    const op = normalize(t.operation_type || '');
                    if (op.includes('EXCETO')) {
                        if (originUF === 'MG' && op.includes('EXCETO MG')) return false;
                        if (originUF === 'ES' && op.includes('EXCETO MG') && op.includes('ES')) return false;
                    }
                    return true;
                });
                if (franchiseCandidates.length > 0) {
                    const bestFranchise = franchiseCandidates.sort((a, b) => (a.franchise_km || 0) - (b.franchise_km || 0))[0];
                    appliedClientTable = bestFranchise;
                    clientLog = `Faixa KM Corrigida → ${bestFranchise.operation_type}`;
                }
            }
        }
    }

    const isCevaClient = missionClientName.includes('CEVA');
    const normalizedOrigin = normalize(mission.origin || '');
    const normalizedDest = normalize(mission.destination || '');
    const isJundiai = normalizedOrigin.includes('JUNDIAI');
    const destHas200km = normalizedDest.includes('200KM') || normalizedDest.includes('200 KM') || normalizedDest.includes('ACOMPANHAMENTO');
    const referenceDistance = Math.max(totalDistance, distanceForCalculation);
    let is200kmAccompaniment = destHas200km && !isZeroValueMission;

    const cevaLogitech = isCevaClient && (isJundiai || destHas200km);
    let cevaTablesPool = allClientTablesForThisClient;
    if (isCevaClient && cevaTablesPool.length === 0) {
        cevaTablesPool = clientTables.filter(t => normalize(t.client || '').includes('CEVA'));
    }
    if (cevaLogitech && !cancelledBeforeExecution && !isManualOverride && cevaTablesPool.length > 0) {
        const logitech200 = cevaTablesPool.find(t => {
            const op = normalize(t.operation_type || '');
            return (op.includes('LOGITECH') || op.includes('200KM') || op.includes('200 KM')) && t.franchise_km >= 200;
        });
        if (logitech200) {
            appliedClientTable = logitech200;
            clientLog = `REGRA LOGITECH SOBERANA: CEVA Jundiaí → ${logitech200.operation_type} (KM real ignorado)`;
            is200kmAccompaniment = true;
        }
    }

    const isCeslogClient = missionClientName.includes('CESLOG') || missionClientName.includes('CESARI');
    const normalizedOriginCity = normalize(originCity);
    const normalizedDestCity2 = normalize(destCity);
    const isCubataoSantos = (normalizedOriginCity.includes('CUBATAO') && normalizedDestCity2.includes('SANTOS')) || 
                            (normalizedOriginCity.includes('SANTOS') && normalizedDestCity2.includes('CUBATAO'));
    
    if (isCeslogClient && isCubataoSantos && !cancelledBeforeExecution && !isManualOverride) {
        const cubSantosTable = allClientTablesForThisClient.find(t => {
            const op = normalize(t.operation_type || '');
            return op.includes('CUBATAO') && op.includes('SANTOS') && !op.includes('PRONTA RESPOSTA') && !op.includes('PRONTA');
        });
        if (cubSantosTable) {
            appliedClientTable = cubSantosTable;
            clientLog = `CESLOG Rota Fixa → ${cubSantosTable.operation_type}`;
        }
    }

    let appliedProviderTable: any = null;
    let providerLog = 'Manual';

    // Task #55: separa a linha mestre (__AUTO_MASTER__) das tabelas regulares.
    // A mestre nunca participa do score; é consumida exclusivamente pelo motor auto.
    const providerTablesNoMaster = providerTables.filter(t => !isAutoMasterRow(t));
    const matchesProviderAlias = (tProv: string) => {
        if (!tProv) return false;
        if (tProv === missionProviderName) return true;
        if (providerAliasSet.size > 0 && providerAliasSet.has(tProv)) return true;
        return false;
    };
    const autoMasterRows = providerTables.filter(t => matchesProviderAlias(normalize(t.provider)) && isAutoMasterRow(t));
    const autoMasterConfig = extractAutoMasterConfig(autoMasterRows);
    // Filtro do motor: aceita Região (SUDESTE, SUL...) OU Estado (SP, RJ...).
    // Detecção: valor com 2 letras = UF (compara com originUF). Senão = região
    // (compara com detectedRegion). Vazio = aplica a tudo.
    const autoRegionFilter = (autoMasterConfig?.region || '').toString().toUpperCase().trim();
    const originUFUpper = String(originUF || '').toUpperCase().trim();
    const missionRegionUpper = String(detectedRegion || '').toUpperCase().trim();
    const filterIsUF = autoRegionFilter.length === 2 && !!UF_TO_REGION[autoRegionFilter];
    const autoRegionMatches = !autoRegionFilter
        || (filterIsUF
            ? (!!originUFUpper && autoRegionFilter === originUFUpper)
            : (!!missionRegionUpper && autoRegionFilter === missionRegionUpper));
    // Task #55: motor automático é a fonte oficial quando ligado.
    // OS 5046: uma seleção MANUAL de uma tabela REAL (id existente) tem prioridade
    // e DESLIGA o motor para esta missão — permite que a auditoria (Thiago
    // Moreira/Simone/Barbara) corrija casos em que o valor automático está
    // incorreto. IMPORTANTE: a tabela sintética gerada pelo próprio motor tem id
    // "auto-..." e NÃO conta como override (senão o motor se desligaria sozinho).
    // As telas de relatório/canônico só passam providerTableId quando há ajuste
    // manual salvo, então continuam usando o motor (ou o valor já salvo) sem regressão.
    // Normaliza o override de tabela do fornecedor UMA vez: um id sintético do
    // motor ("auto-...") nunca conta como seleção manual, em nenhum ramo abaixo.
    const effectiveProviderTableId = (manualTableOverrides?.providerTableId
        && !String(manualTableOverrides.providerTableId).startsWith('auto-'))
        ? manualTableOverrides.providerTableId
        : undefined;
    const hasManualProviderOverride = !!effectiveProviderTableId;
    const autoEngineActive = !!autoMasterConfig && !mission.is_same_os && !isZeroValueMission && !isCancelled && autoRegionMatches && !hasManualProviderOverride;

    // Quando o motor está ativo, esvazia a lista de tabelas regulares para que
    // a lógica de score abaixo não selecione nada — o `appliedProviderTable`
    // será sobrescrito por uma tabela sintética derivada da configuração mestre.
    let filteredProviderTables = autoEngineActive
        ? []
        : providerTablesNoMaster.filter(t => matchesProviderAlias(normalize(t.provider)));
    if (filteredProviderTables.length === 0 && missionProviderName.length > 2) {
         filteredProviderTables = providerTablesNoMaster.filter(t => {
            const tProv = normalize(t.provider);
            if (tProv.length <= 2) return false;
            if (tProv.includes(missionProviderName) || missionProviderName.includes(tProv)) return true;
            // Tenta também via apelidos (razão social x nome fantasia)
            for (const alias of providerAliasSet) {
                if (alias.length > 2 && (tProv.includes(alias) || alias.includes(tProv))) return true;
            }
            return false;
         });
    }
    if (filteredProviderTables.length === 0 && missionProviderName.length > 3) {
         const providerWords = missionProviderName.split(/\s+/).filter(w => w.length > 2);
         if (providerWords.length > 0) {
             filteredProviderTables = providerTablesNoMaster.filter(t => {
                 const tProv = normalize(t.provider);
                 return providerWords.some(w => tProv.includes(w)) && tProv.length > 2;
             });
         }
    }

    const providerDistReference = manualTableOverrides?.providerOpsOverride 
        ? manualTableOverrides.providerOpsOverride.distanceKm 
        : Math.max(totalDistance, distanceForCalculation);

    if (effectiveProviderTableId) {
        appliedProviderTable = providerTables.find(t => t.id.toString() === effectiveProviderTableId);
        providerLog = 'Seleção Manual / Memória';
    } else if (isCancelled && filteredProviderTables.length > 0) {
        // OS Cancelada (todas): cobra pela menor faixa da tabela do fornecedor
        // (tipicamente a rota de 100KM). Cancelada antes -> só o mínimo; cancelada
        // depois -> mínimo + horas extras (calculadas adiante). Critério: menor
        // franchise_km > 0, com desempate pelo menor activation_cost.
        const withKm = filteredProviderTables.filter(t => (t.franchise_km || 0) > 0 && (t.activation_cost || 0) > 0);
        if (withKm.length > 0) {
            const sorted = [...withKm].sort((a, b) => {
                const km = (a.franchise_km || 0) - (b.franchise_km || 0);
                if (km !== 0) return km;
                return (a.activation_cost || 0) - (b.activation_cost || 0);
            });
            appliedProviderTable = sorted[0];
            providerLog = `Cancelada → Menor Faixa KM (${appliedProviderTable?.operation_type}, ${appliedProviderTable?.franchise_km}km)`;
        } else {
            const sorted = [...filteredProviderTables]
                .filter(t => (t.activation_cost || 0) > 0)
                .sort((a, b) => (a.activation_cost || 0) - (b.activation_cost || 0));
            appliedProviderTable = sorted.length > 0 ? sorted[0] : filteredProviderTables[0];
            providerLog = `Cancelada → Menor Custo (${appliedProviderTable?.operation_type})`;
        }
    } else if (isSpecialProvider && filteredProviderTables.length > 0) {
        const prontaResposta = filteredProviderTables.filter(t => {
            const op = normalize(t.operation_type || '');
            return op.includes('PRONTA RESPOSTA') || op.includes('PRONTA');
        });
        
        if (prontaResposta.length > 0) {
            let bestPR: any = null;
            if (agentCount >= 2) {
                bestPR = prontaResposta.find(t => {
                    const op = normalize(t.operation_type || '');
                    return op.includes('02') || op.includes('DOIS');
                });
            }
            if (!bestPR) {
                bestPR = prontaResposta.find(t => {
                    const op = normalize(t.operation_type || '');
                    return op.includes('01') || (!op.includes('02') && !op.includes('DOIS'));
                });
            }
            if (bestPR) {
                appliedProviderTable = bestPR;
                providerLog = `${agentCount >= 2 ? '02' : '01'} Agente → ${bestPR.operation_type}`;
            }
        }
        
        if (!appliedProviderTable) {
            const result = selectStrictTable(
                filteredProviderTables, providerDistReference, detectedRegion, originCity,
                missionTypeKeyword, destCity, missionRouteCode,
                { count: agentCount, isSpecial: true }, originUF, mission.origin || ''
            );
            appliedProviderTable = result.table;
            providerLog = result.log;
        }
    } else {
        const result = selectStrictTable(
            filteredProviderTables, 
            providerDistReference, 
            detectedRegion,
            originCity,
            missionTypeKeyword,
            destCity,
            missionRouteCode,
            { count: agentCount, isSpecial: isSpecialProvider },
            originUF,
            mission.origin || ''
        );
        appliedProviderTable = result.table;
        providerLog = result.log;
    }

    if (isCeslogClient && isCubataoSantos && !cancelledBeforeExecution && !effectiveProviderTableId) {
        const allProvForRoute = providerTables.filter(t => {
            const op = normalize(t.operation_type || '');
            return op.includes('CUBATAO') && op.includes('SANTOS') && !op.includes('PRONTA');
        });
        if (allProvForRoute.length > 0) {
            appliedProviderTable = allProvForRoute[0];
            providerLog = `CESLOG Rota Fixa → ${allProvForRoute[0].operation_type}`;
        }
    }

    if (!effectiveProviderTableId && appliedProviderTable && filteredProviderTables.length > 1) {
        const appliedOp = normalize(appliedProviderTable.operation_type || '');
        const appliedIs200 = appliedOp.includes('200KM') || appliedOp.includes('200 KM') || appliedOp.includes('ATE 200') || (appliedProviderTable.franchise_km >= 200);
        if (appliedIs200 && providerDistReference <= 200) {
            const table100Fallback = filteredProviderTables.find(t => {
                const op = normalize(t.operation_type || '');
                const tFr = t.franchise_km || 0;
                return tFr >= 100 && tFr < 200 && (op.includes('100KM') || op.includes('100 KM') || op.includes('ATE 100') || tFr === 100);
            });
            if (table100Fallback) {
                appliedProviderTable = table100Fallback;
                providerLog = `KM ≤200 → Tabela 100KM (${table100Fallback.operation_type})`;
            }
        }
    }

    if (is200kmAccompaniment && !cancelledBeforeExecution && !effectiveProviderTableId && filteredProviderTables.length > 0) {
        const provider200 = filteredProviderTables.find(t => {
            const op = normalize(t.operation_type || '');
            return (op.includes('ATE 200') || op.includes('200 KM') || op.includes('200KM')) && t.franchise_km >= 200 && t.franchise_km <= 200;
        });
        if (provider200) {
            appliedProviderTable = provider200;
            providerLog = `Regra 200KM Acompanhamento → ${provider200.operation_type}`;
        }
    }

    // Regra soberana 200KM acompanhamento também para o fornecedor.
    // Quando o cliente caiu em "200KM acompanhamento" (regra CEVA/LOGITECH),
    // procuramos uma tabela manual do fornecedor com 200KM na região
    // detectada (ex.: "SUDESTE ... 200KM"). Se existir, ela vence inclusive
    // o motor automático — mesma soberania que a regra tem do lado do cliente.
    // Busca em providerTablesNoMaster (não filtrada pelo "esvaziamento" do
    // motor auto) e considera apelidos do fornecedor.
    let logitech200ProviderApplied = false;
    if (is200kmAccompaniment && !cancelledBeforeExecution && !effectiveProviderTableId) {
        const candidatePool = providerTablesNoMaster.filter(t => {
            const tProv = normalize(t.provider);
            if (matchesProviderAlias(tProv)) return true;
            if (tProv.length > 2 && missionProviderName.length > 2 &&
                (tProv.includes(missionProviderName) || missionProviderName.includes(tProv))) return true;
            for (const alias of providerAliasSet) {
                if (alias.length > 2 && (tProv.includes(alias) || alias.includes(tProv))) return true;
            }
            return false;
        });
        const region = String(detectedRegion || '').toUpperCase();
        const is200Km = (t: any) => {
            const op = normalize(t.operation_type || '');
            return op.includes('200KM') || op.includes('200 KM') || op.includes('ATE 200') ||
                   (Number(t.franchise_km) >= 200 && Number(t.franchise_km) <= 200);
        };
        // 1ª tentativa: 200KM + região detectada batendo no operation_type
        let prov200 = region
            ? candidatePool.find(t => {
                const op = normalize(t.operation_type || '');
                return is200Km(t) && op.includes(region);
              })
            : null;
        // 2ª tentativa: qualquer tabela 200KM do fornecedor (fallback sem região)
        if (!prov200) prov200 = candidatePool.find(t => is200Km(t));
        if (prov200) {
            appliedProviderTable = prov200;
            providerLog = `REGRA 200KM SOBERANA → ${prov200.operation_type}${region ? ' [' + region + ']' : ''} (motor auto ignorado)`;
            logitech200ProviderApplied = true;
        }
    }

    // Task #55: Motor automático de fornecedor. Quando ativo, sobrescreve
    // appliedProviderTable por uma tabela sintética derivada das 5 variáveis
    // mestre + Regra de Ouro do tempo. Custos manuais (customProviderBase/Km/Hour)
    // continuam tendo prioridade via os checks `!== undefined` mais abaixo.
    // Exceção: regra 200KM soberana acima vence o motor (mesma lógica do cliente LOGITECH).
    let autoBreakdown: ProviderAutoCalcBreakdown | null = null;
    if (autoEngineActive && autoMasterConfig && !logitech200ProviderApplied) {
        // OS cancelada ANTES da execução no motor automático: força a menor
        // faixa (100KM) e zera horas extras (cancelamento cobra o piso da tabela).
        // OS executada e cancelada depois usa km/tempo reais normalmente.
        const realKmForAuto = cancelledBeforeExecution
            ? 0
            : (manualTableOverrides?.providerOpsOverride
                ? manualTableOverrides.providerOpsOverride.distanceKm
                : (isFinished && hasValidKms ? realTraveledKm : Math.max(totalDistance, distanceForCalculation)));
        const goldenStart = cancelledBeforeExecution ? null : ((mission as any).provider_start_time || mission.startTime || (mission as any).start_time);
        const goldenScheduled = cancelledBeforeExecution ? null : (mission.startTime || (mission as any).start_time);
        const goldenEnd = cancelledBeforeExecution ? null : ((mission as any).provider_end_time || mission.endTime || (mission as any).end_time);
        autoBreakdown = calculateProviderCostAuto(
            realKmForAuto,
            autoMasterConfig,
            goldenScheduled,
            goldenStart,
            goldenEnd,
        );
        appliedProviderTable = {
            id: `auto-${missionProviderName}-${autoBreakdown.bandKm}`,
            provider: mission.provider,
            operation_type: `AUTO ${autoBreakdown.bandKm}KM / ${autoBreakdown.bandHours}H`,
            activation_cost: autoBreakdown.baseValue,
            franchise_km: autoBreakdown.bandKm,
            franchise_hours: autoBreakdown.bandHours,
            cost_per_extra_km: autoMasterConfig.extraKmValue,
            cost_per_extra_hour: autoMasterConfig.extraHourValue,
            cancellation_fee: 0,
        };
        providerLog = `Motor Auto → Faixa ${autoBreakdown.bandKm}KM (${autoBreakdown.bandHours}h)`;
    }

    const cBase = isRefused ? 0 : (manualTableOverrides?.customClientBase !== undefined 
        ? manualTableOverrides.customClientBase 
        : Math.max(0, (appliedClientTable?.activation_fee || 0) * clientMultiplier));
    
    const cFranchiseKm = (appliedClientTable?.franchise_km || 100);
    const cFranchiseHr = (appliedClientTable?.franchise_hours || 3);
    
    let cExcessKm = Math.max(0, distanceForCalculation - cFranchiseKm);
    let cExcessHr = Math.max(0, durationHours - cFranchiseHr);
    
    const cUnitPriceKm = manualTableOverrides?.customClientUnitKm !== undefined 
        ? manualTableOverrides.customClientUnitKm 
        : (appliedClientTable?.price_per_extra_km || 0);

    const cUnitPriceHour = manualTableOverrides?.customClientUnitHour !== undefined
        ? manualTableOverrides.customClientUnitHour
        : (appliedClientTable?.price_per_extra_hour || 0);

    const appliedTableName = (appliedClientTable?.operation_type || '').toUpperCase();
    const missionDest = (mission.destination || '').toUpperCase();

    const isFranchiseTable = (name: string) => name.includes('ATÉ') || name.includes('ATE ') || name.includes('FAIXA') || /\bATE\W*\d/i.test(name);
    const clientHasExtraKmPrice = (appliedClientTable?.price_per_extra_km || 0) > 0
        || (manualTableOverrides?.customClientUnitKm || 0) > 0;
    const clientTableIs200km = appliedTableName.includes('200KM') || appliedTableName.includes('200 KM') || appliedTableName.includes('LOGITECH') || missionDest.includes('200KM');
    const clientTableIs100km = appliedTableName.includes('100KM') || appliedTableName.includes('100 KM');
    const isFixedDistanceClientRule = (clientTableIs200km || clientTableIs100km) && !isFranchiseTable(appliedTableName) && !clientHasExtraKmPrice;

    const clientHasExtraHrPrice = (appliedClientTable?.price_per_extra_hour || 0) > 0
        || (manualTableOverrides?.customClientUnitHour || 0) > 0;
    const isVtcClient = missionClientName.includes('VTC');
    const isFixedHoursClientRule = !clientHasExtraHrPrice && (
                                   appliedTableName.includes('02H') || 
                                   appliedTableName.includes('02 HORAS') ||
                                   (isVtcClient && (missionDest.includes('02 HORAS') || missionDest.includes('02H'))));

    const originalDistanceForCalc = distanceForCalculation;
    const originalDurationHours = durationHours;

    if (is200kmAccompaniment && !isZeroValueMission && !manualTableOverrides?.disableFixedKmRule) {
        distanceForCalculation = Math.min(distanceForCalculation, 200);
    }
    if (isFixedDistanceClientRule && !isZeroValueMission && !manualTableOverrides?.disableFixedKmRule) {
        distanceForCalculation = Math.min(distanceForCalculation, cFranchiseKm);
    }
    if (isFixedHoursClientRule && !isZeroValueMission) {
        durationHours = Math.min(durationHours, cFranchiseHr);
    }

    cExcessKm = Math.max(0, distanceForCalculation - cFranchiseKm);
    cExcessHr = Math.max(0, durationHours - cFranchiseHr);

    const providerTableName = (appliedProviderTable?.operation_type || '').toUpperCase();
    const providerHasExtraKmCost = (appliedProviderTable?.cost_per_extra_km || 0) > 0
        || (manualTableOverrides?.customProviderUnitKm || 0) > 0;
    const providerTableIs200km = providerTableName.includes('200KM') || providerTableName.includes('200 KM') || providerTableName.includes('LOGITECH');
    const providerTableIs100km = providerTableName.includes('100KM') || providerTableName.includes('100 KM');
    const isFixedDistanceProviderRule = (providerTableIs200km || providerTableIs100km) && !isFranchiseTable(providerTableName) && !providerHasExtraKmCost;

    const providerHasExtraHrCost = (appliedProviderTable?.cost_per_extra_hour || 0) > 0
        || (manualTableOverrides?.customProviderUnitHour || 0) > 0;
    const isFixedHoursProviderRule = !providerHasExtraHrCost && (
                                     providerTableName.includes('02H') || 
                                     providerTableName.includes('02 HORAS'));

    let providerDistForCalc = manualTableOverrides?.providerOpsOverride 
        ? manualTableOverrides.providerOpsOverride.distanceKm 
        : originalDistanceForCalc;
    let providerDurationForCalc = manualTableOverrides?.providerOpsOverride 
        ? manualTableOverrides.providerOpsOverride.durationHours 
        : originalDurationHours;

    if (is200kmAccompaniment && !isZeroValueMission && !manualTableOverrides?.disableFixedKmRule) {
        providerDistForCalc = Math.min(providerDistForCalc, 200);
    }

    // Task #55: quando motor auto está ativo, força a duração do fornecedor
    // a usar a Regra de Ouro do tempo (independente do que o cliente vê).
    if (autoEngineActive && autoBreakdown) {
        providerDurationForCalc = autoBreakdown.durationHours;
        providerDistForCalc = autoBreakdown.realKm;
    }

    const rawBaseCost = appliedProviderTable?.activation_cost || 0;
    const pBase = isRefused ? 0 : (manualTableOverrides?.customProviderBase !== undefined
        ? manualTableOverrides.customProviderBase
        : (mission.is_same_os ? 0 : Math.max(0, rawBaseCost * providerMultiplier)));
    
    const pFranchiseKm = (appliedProviderTable?.franchise_km || 100);
    const pFranchiseHr = (appliedProviderTable?.franchise_hours || 3);

    if (isFixedDistanceProviderRule && !isZeroValueMission && !manualTableOverrides?.disableFixedKmRule) {
        providerDistForCalc = Math.min(providerDistForCalc, pFranchiseKm);
    }
    if (isFixedHoursProviderRule && !isZeroValueMission) {
        providerDurationForCalc = Math.min(providerDurationForCalc, pFranchiseHr);
    }

    let pExcessKm = mission.is_same_os ? 0 : Math.max(0, providerDistForCalc - pFranchiseKm);
    let pExcessHr = mission.is_same_os ? 0 : Math.max(0, providerDurationForCalc - pFranchiseHr);

    if (!mission.is_same_os && !isZeroValueMission && !is200kmAccompaniment && providerHasExtraKmCost && pExcessKm === 0) {
        const rawDist = manualTableOverrides?.providerOpsOverride 
            ? manualTableOverrides.providerOpsOverride.distanceKm 
            : originalDistanceForCalc;
        if (rawDist > pFranchiseKm) {
            pExcessKm = Math.max(0, rawDist - pFranchiseKm);
        }
    }

    const pUnitCostKm = manualTableOverrides?.customProviderUnitKm !== undefined
        ? manualTableOverrides.customProviderUnitKm
        : (appliedProviderTable?.cost_per_extra_km || 0);
    
    const pUnitCostHour = manualTableOverrides?.customProviderUnitHour !== undefined
        ? manualTableOverrides.customProviderUnitHour
        : (appliedProviderTable?.cost_per_extra_hour || 0);

    const cExcessHrReal = cExcessHr;
    const pExcessHrReal = pExcessHr;

    // REGRA DE ARREDONDAMENTO DE HORA EXTRA:
    // Se o cliente tem full_extra_hour_after_16_min = true, qualquer fração > 15 minutos
    // é arredondada para a hora cheia seguinte. Ex: 1h16min extra → 2h extra.
    // Isso NÃO é bug — é comportamento configurável por cliente na tabela `clients`.
    // Pode parecer "hora extra em dobro" mas é o arredondamento contratual.
    const applyRoundingRule = (hours: number) => {
        if (hours <= 0) return 0;
        const integer = Math.floor(hours);
        const fraction = hours - integer;
        const minutes = fraction * 60;
        if (minutes > 15) {
            return integer + 1;
        }
        return hours;
    };

    if (clientData?.full_extra_hour_after_16_min) {
        cExcessHr = applyRoundingRule(cExcessHr);
    }

    const round2 = (v: number) => Math.round(v * 100) / 100;

    const effectiveDistanceForMinRule = Math.max(distanceForCalculation, totalDistance);
    const isMinimumActivationRule = !isZeroValueMission && effectiveDistanceForMinRule <= 200 && durationHours <= 2 && cFranchiseKm >= 200 && pFranchiseKm >= 200;
    if (isMinimumActivationRule) {
        cExcessKm = 0;
        cExcessHr = 0;
        pExcessKm = 0;
        pExcessHr = 0;
    }

    // OS cancelada ANTES da execução: cobra APENAS o acionamento da menor faixa
    // (ex.: R$ 690 da SUDESTE - 100KM da DHL). Zera os excessos (KM e hora)
    // tanto do cliente quanto do fornecedor.
    // EXCEÇÃO (regra confirmada pela diretoria): se a OS foi de fato EXECUTADA —
    // hodômetro com rodagem real (end_km > start_km) — o KM excedente real é
    // mantido e cobrado normalmente; a pessoa rodou mais que o combinado e tem
    // que receber. As horas extras permanecem regidas por cancelStatusAt
    // (cancelledWithHours), evitando inflar tempo por end_time administrativo
    // gravado dias depois — por isso seguem zeradas neste ramo "antes".
    const cancelledExecuted = isCancelled && hasValidKms && realTraveledKm > 0;
    if (cancelledBeforeExecution) {
        cExcessHr = 0;
        pExcessHr = 0;
        if (!cancelledExecuted) {
            cExcessKm = 0;
            pExcessKm = 0;
        }
    }

    let cExtraKmVal = round2(Math.max(0, cExcessKm * cUnitPriceKm));
    let cExtraHrVal = round2(Math.max(0, cExcessHr * cUnitPriceHour));

    let pExtraKmVal = round2(Math.max(0, pExcessKm * pUnitCostKm));
    let pExtraHrVal = round2(Math.max(0, pExcessHr * pUnitCostHour));

    const isLogitechTable = appliedTableName.includes('LOGITECH');
    if (isLogitechTable && !isZeroValueMission) {
        tollValue = 35;
    }

    const serviceSubtotal = round2(cBase + cExtraKmVal + cExtraHrVal);
    
    let iblFee = 0;
    if (manualTableOverrides?.forceIblFee) {
        iblFee = round2(serviceSubtotal * 0.12);
    }

    const clientServiceTotal = round2(serviceSubtotal + iblFee);
    const totalRevenue = round2(clientServiceTotal + tollValue);
    const providerServiceTotal = round2(pBase + pExtraKmVal + pExtraHrVal);
    const totalCost = round2(providerServiceTotal + tollValue);

    return {
        autoEngine: autoBreakdown ? {
            active: true,
            bandKm: autoBreakdown.bandKm,
            bandHours: autoBreakdown.bandHours,
            realKm: autoBreakdown.realKm,
            durationHours: autoBreakdown.durationHours,
            durationMinutes: autoBreakdown.durationMinutes,
            effectiveStartIso: autoBreakdown.effectiveStartIso,
            endIso: autoBreakdown.endIso,
            extraKm: autoBreakdown.extraKm,
            extraHours: autoBreakdown.extraHours,
            baseValue: autoBreakdown.baseValue,
            extraKmValue: autoBreakdown.extraKmValue,
            extraHourValue: autoBreakdown.extraHourValue,
            totalCost: autoBreakdown.totalCost,
            config: {
                baseActivationValue: autoMasterConfig!.baseActivationValue,
                baseKmAllowance: autoMasterConfig!.baseKmAllowance,
                baseHourAllowance: autoMasterConfig!.baseHourAllowance,
                extraKmValue: autoMasterConfig!.extraKmValue,
                extraHourValue: autoMasterConfig!.extraHourValue,
            },
        } : undefined,
        realTraveledKm, durationHours, tollValue, isCompleted: isFinished, hasValidKms,
        clientMult: clientMultiplier, providerMult: providerMultiplier, 
        agentCount, hasTwoAgentsOnMission: agentCount === 2,
        regionConflict: false, detectedRegion, autoCorrected: !manualTableOverrides,
        calculationMemory: isMinimumActivationRule ? 'Acionamento Mínimo (≤200km/≤2h)' : isVelada ? 'Regra Velada' : 'Regra Padrão',
        iblFee, effectiveStartLabel: startLabel,
        isMinimumActivationRule,
        hasClientTable: !!appliedClientTable,
        hasProviderTable: !!appliedProviderTable,
        client: { 
            total: totalRevenue, serviceTotal: clientServiceTotal, base: cBase, extraKmVal: cExtraKmVal, extraHrVal: cExtraHrVal, 
            excessKm: cExcessKm, 
            excessHours: cExcessHr,
            excessHoursReal: cExcessHrReal,
            unitPriceKm: cUnitPriceKm,
            unitPriceHour: cUnitPriceHour,
            franchiseKm: cFranchiseKm,
            franchiseHours: cFranchiseHr,
            usedSpecialRule: (isFixedDistanceClientRule && !manualTableOverrides?.disableFixedKmRule) || isFixedHoursClientRule, 
            tableName: appliedClientTable?.operation_type, 
            tableId: appliedClientTable?.id.toString(),
            detectionLog: clientLog
        },
        provider: { 
            total: totalCost, serviceTotal: providerServiceTotal, base: pBase, extraKmVal: pExtraKmVal, extraHrVal: pExtraHrVal, 
            excessKm: pExcessKm, 
            excessHours: pExcessHr,
            excessHoursReal: pExcessHrReal,
            unitCostKm: pUnitCostKm,
            unitCostHour: pUnitCostHour,
            franchiseKm: pFranchiseKm,
            franchiseHours: pFranchiseHr,
            tableName: appliedProviderTable?.operation_type, 
            tableId: appliedProviderTable?.id.toString(),
            usedSpecialRule: (isFixedDistanceProviderRule && !manualTableOverrides?.disableFixedKmRule) || isFixedHoursProviderRule,
            detectionLog: providerLog
        },
        profit: totalRevenue - totalCost,
        marginPercent: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0
    };
};

export interface AuditResult {
    missionId: string;
    client: string;
    storedRevenue: number;
    calculatedRevenue: number;
    storedCost: number;
    calculatedCost: number;
    revenueDiff: number;
    costDiff: number;
    isInconsistent: boolean;
    reason: string;
}

export const auditMissionFinancials = (
    mission: Mission,
    clientTables: ClientPriceTable[],
    providerTables: ProviderCostTable[],
    clientData?: Client,
    tolerance: number = 5,
    providers?: any[] | null,
): AuditResult => {
    const m = mission as any;
    const dispVal = safeNumber(m.displacement_value);
    const dispProvVal = safeNumber(m.displacement_value_provider);
    const hasManualOverride = !!(m.revenue_edit_reason) || !!(m.cost_edit_reason) || !!(m.snapshot_approved_by);
    if (hasManualOverride) {
        const storedRev = safeNumber(mission.revenue_value) + safeNumber(mission.toll_value) + dispVal;
        const storedCst = safeNumber(mission.cost_value) + safeNumber(mission.toll_value_provider != null ? mission.toll_value_provider : mission.toll_value) + dispProvVal;
        return {
            missionId: mission.id || '',
            client: mission.client || '',
            storedRevenue: storedRev,
            calculatedRevenue: storedRev,
            storedCost: storedCst,
            calculatedCost: storedCst,
            revenueDiff: 0,
            costDiff: 0,
            isInconsistent: false,
            reason: ''
        };
    }

    const fin = calculateMissionFinancials(mission, clientTables, providerTables, clientData, new Date(), undefined, providers);
    const isSameOs = !!(mission as any).is_same_os;
    
    const storedRevenue = safeNumber(mission.revenue_value) + safeNumber(mission.toll_value) + dispVal;
    const storedCost = isSameOs
        ? 0
        : safeNumber(mission.cost_value) + safeNumber(mission.toll_value_provider != null ? mission.toll_value_provider : mission.toll_value) + dispProvVal;
    const calculatedRevenue = fin.client.total + dispVal;
    const calculatedCost = isSameOs ? 0 : fin.provider.total + dispProvVal;
    
    const revenueDiff = Math.abs(storedRevenue - calculatedRevenue);
    const costDiff = Math.abs(storedCost - calculatedCost);
    
    const hasStoredValues = storedRevenue > 0 || storedCost > 0;
    const userVerified = !!(mission as any).billing_verified_by;
    const isInconsistent = hasStoredValues && !userVerified && (revenueDiff > tolerance || costDiff > tolerance);
    
    let reason = '';
    if (isInconsistent) {
        const reasons: string[] = [];
        if (revenueDiff > tolerance) reasons.push(`Receita: salvo R$${storedRevenue.toFixed(2)} vs tabela R$${calculatedRevenue.toFixed(2)} (dif: R$${revenueDiff.toFixed(2)})`);
        if (costDiff > tolerance) reasons.push(`Custo: salvo R$${storedCost.toFixed(2)} vs tabela R$${calculatedCost.toFixed(2)} (dif: R$${costDiff.toFixed(2)})`);
        reason = reasons.join(' | ');
    }
    
    return {
        missionId: mission.id || '',
        client: mission.client || '',
        storedRevenue,
        calculatedRevenue,
        storedCost,
        calculatedCost,
        revenueDiff,
        costDiff,
        isInconsistent,
        reason
    };
};