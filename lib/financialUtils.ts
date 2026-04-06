import { Mission, ClientPriceTable, ProviderCostTable, MissionStatus, Client } from '../types';

export interface CalculatedFinancials {
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
        providerOpsOverride?: {
            distanceKm: number;
            durationHours: number;
        };
    }
): CalculatedFinancials => {
    const isTerminalStatus = [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(mission.status as MissionStatus);
    const isFinished = mission.status === MissionStatus.COMPLETED;
    const isCancelled = mission.status === MissionStatus.CANCELLED;
    const isRefused = mission.status === MissionStatus.REFUSED;
    const isPending = mission.status === MissionStatus.PENDING;
    const isZeroValueMission = isCancelled || isRefused;
    
    const getKm = (val: any) => typeof val === 'number' ? val : parseFloat(String(val || '0').replace(',', '.'));
    
    const startKm = getKm(mission.startKm || (mission as any).start_km);
    const endKm = getKm(mission.endKm || (mission as any).end_km);
    const hasValidKms = startKm > 0 && endKm > 0 && endKm >= startKm;
    
    let realTraveledKm = 0;
    if (hasValidKms) {
        realTraveledKm = endKm - startKm;
    }
    
    const totalDistance = safeNumber(mission.totalDistance || (mission as any).total_distance);
    let distanceForCalculation = hasValidKms ? realTraveledKm : totalDistance;
    
    if (isZeroValueMission) {
        distanceForCalculation = 0;
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

    const diffMs = endDateObj.getTime() - effectiveStartDate.getTime();
    let durationHours = Math.max(0, diffMs / (1000 * 60 * 60));

    const cancelledWithHours = isCancelled && durationHours > 0 && !!parseSafeDate(mission.endTime || (mission as any).end_time);
    if (isZeroValueMission && !cancelledWithHours) {
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
    if (!appliedClientTable && isCancelled && clientTablesFiltered.length > 0) {
        const sorted = [...clientTablesFiltered]
            .filter(t => (t.activation_fee || 0) > 0)
            .sort((a, b) => (a.activation_fee || 0) - (b.activation_fee || 0));
        appliedClientTable = sorted.length > 0 ? sorted[0] : clientTablesFiltered[0];
        clientLog = `Cancelada → Menor Acionamento (${appliedClientTable?.operation_type})`;
    }
    if (!appliedClientTable) {
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

    if (isCevaClient && isJundiai && !isCancelled && !isManualOverride && allClientTablesForThisClient.length > 0) {
        if (referenceDistance > 200 || destHas200km) {
            const logitech200 = allClientTablesForThisClient.find(t => {
                const op = normalize(t.operation_type || '');
                return (op.includes('LOGITECH') || op.includes('200KM') || op.includes('200 KM')) && t.franchise_km >= 200;
            });
            if (logitech200) {
                appliedClientTable = logitech200;
                clientLog = `CEVA Jundiaí >200km → ${logitech200.operation_type}`;
            }
            is200kmAccompaniment = true;
        } else {
            const table100 = allClientTablesForThisClient.find(t => {
                const op = normalize(t.operation_type || '');
                return (op.includes('ESTADO DE SP') || (op.includes('SP') && op.includes('RJ')))
                    && !op.includes('LOGITECH') && !op.includes('200KM') && !op.includes('200 KM')
                    && (t.franchise_km || 0) <= 100;
            });
            if (table100) {
                appliedClientTable = table100;
                clientLog = `CEVA Jundiaí ≤200km → ${table100.operation_type}`;
            } else {
                const tableFallback = allClientTablesForThisClient.find(t => {
                    const op = normalize(t.operation_type || '');
                    return !op.includes('LOGITECH') && !op.includes('200KM') && !op.includes('200 KM') && (t.franchise_km || 0) <= 100;
                });
                if (tableFallback) {
                    appliedClientTable = tableFallback;
                    clientLog = `CEVA Jundiaí ≤200km (fallback) → ${tableFallback.operation_type}`;
                }
            }
        }
    }

    const isCeslogClient = missionClientName.includes('CESLOG') || missionClientName.includes('CESARI');
    const normalizedOriginCity = normalize(originCity);
    const normalizedDestCity2 = normalize(destCity);
    const isCubataoSantos = (normalizedOriginCity.includes('CUBATAO') && normalizedDestCity2.includes('SANTOS')) || 
                            (normalizedOriginCity.includes('SANTOS') && normalizedDestCity2.includes('CUBATAO'));
    
    if (isCeslogClient && isCubataoSantos && !isCancelled && !isManualOverride) {
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

    let filteredProviderTables = providerTables.filter(t => normalize(t.provider) === missionProviderName);
    if (filteredProviderTables.length === 0 && missionProviderName.length > 2) {
         filteredProviderTables = providerTables.filter(t => {
            const tProv = normalize(t.provider);
            return (tProv.includes(missionProviderName) || missionProviderName.includes(tProv)) && tProv.length > 2;
         });
    }
    if (filteredProviderTables.length === 0 && missionProviderName.length > 3) {
         const providerWords = missionProviderName.split(/\s+/).filter(w => w.length > 2);
         if (providerWords.length > 0) {
             filteredProviderTables = providerTables.filter(t => {
                 const tProv = normalize(t.provider);
                 return providerWords.some(w => tProv.includes(w)) && tProv.length > 2;
             });
         }
    }

    const providerDistReference = manualTableOverrides?.providerOpsOverride 
        ? manualTableOverrides.providerOpsOverride.distanceKm 
        : Math.max(totalDistance, distanceForCalculation);

    if (manualTableOverrides?.providerTableId) {
        appliedProviderTable = providerTables.find(t => t.id.toString() === manualTableOverrides.providerTableId);
        providerLog = 'Seleção Manual / Memória';
    } else if (isCancelled && filteredProviderTables.length > 0) {
        const sorted = [...filteredProviderTables]
            .filter(t => (t.activation_cost || 0) > 0)
            .sort((a, b) => (a.activation_cost || 0) - (b.activation_cost || 0));
        appliedProviderTable = sorted.length > 0 ? sorted[0] : filteredProviderTables[0];
        providerLog = `Cancelada → Menor Custo (${appliedProviderTable?.operation_type})`;
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

    if (isCeslogClient && isCubataoSantos && !isCancelled && !manualTableOverrides?.providerTableId) {
        const allProvForRoute = providerTables.filter(t => {
            const op = normalize(t.operation_type || '');
            return op.includes('CUBATAO') && op.includes('SANTOS') && !op.includes('PRONTA');
        });
        if (allProvForRoute.length > 0) {
            appliedProviderTable = allProvForRoute[0];
            providerLog = `CESLOG Rota Fixa → ${allProvForRoute[0].operation_type}`;
        }
    }

    if (!manualTableOverrides?.providerTableId && appliedProviderTable && filteredProviderTables.length > 1) {
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

    if (is200kmAccompaniment && !manualTableOverrides?.providerTableId && filteredProviderTables.length > 0) {
        const provider200 = filteredProviderTables.find(t => {
            const op = normalize(t.operation_type || '');
            return (op.includes('ATE 200') || op.includes('200 KM') || op.includes('200KM')) && t.franchise_km >= 200 && t.franchise_km <= 200;
        });
        if (provider200) {
            appliedProviderTable = provider200;
            providerLog = `Regra 200KM Acompanhamento → ${provider200.operation_type}`;
        }
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
    const clientHasExtraKmPrice = (appliedClientTable?.price_per_extra_km || 0) > 0;
    const clientTableIs200km = appliedTableName.includes('200KM') || appliedTableName.includes('200 KM') || appliedTableName.includes('LOGITECH') || missionDest.includes('200KM');
    const clientTableIs100km = appliedTableName.includes('100KM') || appliedTableName.includes('100 KM');
    const isFixedDistanceClientRule = (clientTableIs200km || clientTableIs100km) && !isFranchiseTable(appliedTableName) && !clientHasExtraKmPrice;

    const clientHasExtraHrPrice = (appliedClientTable?.price_per_extra_hour || 0) > 0;
    const isVtcClient = missionClientName.includes('VTC');
    const isFixedHoursClientRule = !clientHasExtraHrPrice && (
                                   appliedTableName.includes('02H') || 
                                   appliedTableName.includes('02 HORAS') ||
                                   (isVtcClient && (missionDest.includes('02 HORAS') || missionDest.includes('02H'))));

    const originalDistanceForCalc = distanceForCalculation;
    const originalDurationHours = durationHours;

    if (is200kmAccompaniment && !isZeroValueMission) {
        distanceForCalculation = Math.min(distanceForCalculation, 200);
    }
    if (isFixedDistanceClientRule && !isZeroValueMission) {
        distanceForCalculation = Math.min(distanceForCalculation, cFranchiseKm);
    }
    if (isFixedHoursClientRule && !isZeroValueMission) {
        durationHours = Math.min(durationHours, cFranchiseHr);
    }

    cExcessKm = Math.max(0, distanceForCalculation - cFranchiseKm);
    cExcessHr = Math.max(0, durationHours - cFranchiseHr);

    const providerTableName = (appliedProviderTable?.operation_type || '').toUpperCase();
    const providerHasExtraKmCost = (appliedProviderTable?.cost_per_extra_km || 0) > 0;
    const providerTableIs200km = providerTableName.includes('200KM') || providerTableName.includes('200 KM') || providerTableName.includes('LOGITECH');
    const providerTableIs100km = providerTableName.includes('100KM') || providerTableName.includes('100 KM');
    const isFixedDistanceProviderRule = (providerTableIs200km || providerTableIs100km) && !isFranchiseTable(providerTableName) && !providerHasExtraKmCost;

    const providerHasExtraHrCost = (appliedProviderTable?.cost_per_extra_hour || 0) > 0;
    const isFixedHoursProviderRule = !providerHasExtraHrCost && (
                                     providerTableName.includes('02H') || 
                                     providerTableName.includes('02 HORAS'));

    let providerDistForCalc = manualTableOverrides?.providerOpsOverride 
        ? manualTableOverrides.providerOpsOverride.distanceKm 
        : originalDistanceForCalc;
    let providerDurationForCalc = manualTableOverrides?.providerOpsOverride 
        ? manualTableOverrides.providerOpsOverride.durationHours 
        : originalDurationHours;

    if (is200kmAccompaniment && !isZeroValueMission) {
        providerDistForCalc = Math.min(providerDistForCalc, 200);
    }

    const rawBaseCost = appliedProviderTable?.activation_cost || 0;
    const pBase = isRefused ? 0 : (manualTableOverrides?.customProviderBase !== undefined
        ? manualTableOverrides.customProviderBase
        : (mission.is_same_os ? 0 : Math.max(0, rawBaseCost * providerMultiplier)));
    
    const pFranchiseKm = (appliedProviderTable?.franchise_km || 100);
    const pFranchiseHr = (appliedProviderTable?.franchise_hours || 3);

    if (isFixedDistanceProviderRule && !isZeroValueMission) {
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

    let cExtraKmVal = round2(Math.max(0, cExcessKm * cUnitPriceKm));
    let cExtraHrVal = round2(Math.max(0, cExcessHr * cUnitPriceHour));

    let pExtraKmVal = round2(Math.max(0, pExcessKm * pUnitCostKm));
    let pExtraHrVal = round2(Math.max(0, pExcessHr * pUnitCostHour));

    const isLogitechTable = appliedTableName.includes('LOGITECH') || appliedTableName.includes('200KM') || appliedTableName.includes('200 KM');
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
            usedSpecialRule: isFixedDistanceClientRule || isFixedHoursClientRule, 
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
            usedSpecialRule: isFixedDistanceProviderRule || isFixedHoursProviderRule,
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
    tolerance: number = 5
): AuditResult => {
    const m = mission as any;
    const hasManualOverride = !!(m.revenue_edit_reason) || !!(m.cost_edit_reason) || !!(m.snapshot_approved_by);
    if (hasManualOverride) {
        const storedRev = safeNumber(mission.revenue_value) + safeNumber(mission.toll_value);
        const storedCst = safeNumber(mission.cost_value) + safeNumber(mission.toll_value_provider != null ? mission.toll_value_provider : mission.toll_value);
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

    const fin = calculateMissionFinancials(mission, clientTables, providerTables, clientData);
    
    const storedRevenue = safeNumber(mission.revenue_value) + safeNumber(mission.toll_value);
    const storedCost = safeNumber(mission.cost_value) + safeNumber(mission.toll_value_provider != null ? mission.toll_value_provider : mission.toll_value);
    const calculatedRevenue = fin.client.total;
    const calculatedCost = fin.provider.total;
    
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