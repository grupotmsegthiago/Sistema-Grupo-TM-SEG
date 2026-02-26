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
    client: {
      total: number;
      base: number;
      extraKmVal: number;
      extraHrVal: number;
      excessKm: number;
      excessHours: number;
      unitPriceKm: number;
      unitPriceHour: number;
      usedSpecialRule: boolean;
      tableName?: string;
      tableId?: string;
      detectionLog: string; 
    };
    provider: {
      total: number;
      base: number;
      extraKmVal: number;
      extraHrVal: number;
      excessKm: number;
      excessHours: number;
      unitCostKm: number;
      unitCostHour: number;
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
    
    if (isTerminalStatus) {
        const dbEndTime = parseSafeDate(mission.endTime || (mission as any).end_time);
        if (dbEndTime) {
            endDateObj = dbEndTime;
        } else {
            const lastUpdateDate = parseSafeDate(mission.lastUpdate);
            endDateObj = lastUpdateDate || currentTime;
        }
    } else if (isPending) {
        const lastUpdateDate = parseSafeDate(mission.lastUpdate);
        endDateObj = lastUpdateDate || currentTime;
    } else {
        endDateObj = currentTime;
    }

    const diffMs = endDateObj.getTime() - effectiveStartDate.getTime();
    let durationHours = Math.max(0, diffMs / (1000 * 60 * 60));

    if (isZeroValueMission) {
        durationHours = 0;
    }

    const tollValue = isZeroValueMission ? 0 : Math.max(0, safeNumber(mission.toll_value));
    
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

        const scoredTables = candidateTables.map(t => {
            const tableOp = normalize(t.operation_type || '');
            let score = 0;
            let matchType = 'Genérico';

            if (normalizedType && !tableOp.includes(normalizedType)) {
                 score -= 500; 
            }
            
            if (agentAware && agentAware.isSpecial) {
                const isTable02 = tableOp.includes('02 ARMADO') || tableOp.includes('DOIS ARMADO');
                const isTable01 = tableOp.includes('01 ARMADO') || tableOp.includes('01 PRONTA') || (tableOp.includes('PRONTA RESPOSTA') && !isTable02);
                
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

            if (score < 2000) {
                if (normalizedRegion && tableOp.includes(normalizedRegion)) {
                    score += 500;
                    if (matchType === 'Genérico') matchType = `Região (${region})`;
                }
                else if (normalizedRegion === 'SUDESTE' && (tableOp.includes('SP') || tableOp.includes('SAO PAULO'))) {
                    score += 250;
                    if (matchType === 'Genérico') matchType = 'Estado (SP)';
                }
            }

            if (tableOp.includes('EXCETO')) {
                if (ufCode === 'MG' && tableOp.includes('EXCETO MG')) {
                    score -= 3000;
                    matchType = 'Bloqueado (EXCETO MG)';
                }
                if (ufCode === 'ES' && (tableOp.includes('EXCETO') && tableOp.includes('ES'))) {
                    score -= 3000;
                    matchType = 'Bloqueado (EXCETO ES)';
                }
            }

            if (ufCode && (ufCode === 'MG' || ufCode === 'ES')) {
                if (tableOp.includes('MG') && tableOp.includes('ES') && !tableOp.includes('EXCETO')) {
                    score += 800;
                    matchType = `UF Específico (${ufCode})`;
                }
            }

            if (t.franchise_km >= dist) {
                score += 10;
            } else {
                score -= 5;
            }

            return { ...t, score, matchType };
        });

        const validCandidates = scoredTables.filter(t => t.score > -1000).sort((a, b) => b.score - a.score);
        if (validCandidates.length === 0) return { table: null, log: 'Bloqueio Regional Ativo' };

        const topScore = validCandidates[0].score;
        const bestGroup = validCandidates.filter(t => t.score >= topScore - 20); 
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

    if (manualTableOverrides?.clientTableId) {
        appliedClientTable = clientTables.find(t => t.id.toString() === manualTableOverrides.clientTableId);
        clientLog = 'Seleção Manual / Memória';
    } else {
        const clientDistReference = Math.max(totalDistance, distanceForCalculation);
        const result = selectStrictTable(
            allClientTablesForThisClient, 
            clientDistReference, 
            detectedRegion,
            originCity,
            missionTypeKeyword,
            destCity,
            missionRouteCode,
            undefined,
            originUF,
            mission.origin || ''
        );
        appliedClientTable = result.table;
        clientLog = result.log;
    }

    const isCevaClient = missionClientName.includes('CEVA');
    const normalizedOrigin = normalize(mission.origin || '');
    const normalizedDest = normalize(mission.destination || '');
    const isJundiai = normalizedOrigin.includes('JUNDIAI');
    const destHas200km = normalizedDest.includes('200KM') || normalizedDest.includes('200 KM');
    const referenceDistance = Math.max(totalDistance, distanceForCalculation);

    if (isCevaClient && isJundiai && allClientTablesForThisClient.length > 0) {
        if (referenceDistance > 200 || destHas200km) {
            const currentOp = normalize(appliedClientTable?.operation_type || '');
            const isAlreadyLogitech = currentOp.includes('LOGITECH') || currentOp.includes('200KM') || currentOp.includes('200 KM');
            if (!isAlreadyLogitech) {
                const logitech200 = allClientTablesForThisClient.find(t => {
                    const op = normalize(t.operation_type || '');
                    return (op.includes('LOGITECH') || op.includes('200KM') || op.includes('200 KM')) && t.franchise_km >= 200;
                });
                if (logitech200) {
                    appliedClientTable = logitech200;
                    clientLog = `CEVA Jundiaí >200km → ${logitech200.operation_type}`;
                }
            }
        } else {
            const currentOp = normalize(appliedClientTable?.operation_type || '');
            if (currentOp.includes('LOGITECH') || currentOp.includes('200KM') || currentOp.includes('200 KM')) {
                const table100 = allClientTablesForThisClient.find(t => {
                    const op = normalize(t.operation_type || '');
                    return !op.includes('LOGITECH') && !op.includes('200KM') && !op.includes('200 KM') && t.franchise_km <= 200;
                });
                if (table100) {
                    appliedClientTable = table100;
                    clientLog = `CEVA Jundiaí ≤200km → ${table100.operation_type}`;
                }
            }
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

    const providerDistReference = Math.max(totalDistance, distanceForCalculation);

    if (manualTableOverrides?.providerTableId) {
        appliedProviderTable = providerTables.find(t => t.id.toString() === manualTableOverrides.providerTableId);
        providerLog = 'Seleção Manual / Memória';
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

    if (isCevaClient && isJundiai && filteredProviderTables.length > 0) {
        if (referenceDistance > 200 || destHas200km) {
            const provOp = normalize(appliedProviderTable?.operation_type || '');
            const provAlready200 = provOp.includes('LOGITECH') || provOp.includes('200KM') || provOp.includes('200 KM');
            if (!provAlready200) {
                const prov200 = filteredProviderTables.find(t => {
                    const op = normalize(t.operation_type || '');
                    return (op.includes('LOGITECH') || op.includes('200KM') || op.includes('200 KM')) && t.franchise_km >= 200;
                });
                if (prov200) {
                    appliedProviderTable = prov200;
                    providerLog = `CEVA Jundiaí >200km → ${prov200.operation_type}`;
                }
            }
        } else {
            const provOp = normalize(appliedProviderTable?.operation_type || '');
            if (provOp.includes('LOGITECH') || provOp.includes('200KM') || provOp.includes('200 KM')) {
                const prov100 = filteredProviderTables.find(t => {
                    const op = normalize(t.operation_type || '');
                    return !op.includes('LOGITECH') && !op.includes('200KM') && !op.includes('200 KM') && t.franchise_km <= 200;
                });
                if (prov100) {
                    appliedProviderTable = prov100;
                    providerLog = `CEVA Jundiaí ≤200km → ${prov100.operation_type}`;
                }
            }
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

    const hasAtePrefix = (name: string) => name.includes('ATÉ') || name.includes('ATE');
    const isFixedDistanceClientRule = (!hasAtePrefix(appliedTableName)) && (
                                      appliedTableName.includes('200KM') || 
                                      appliedTableName.includes('200 KM') || 
                                      appliedTableName.includes('100KM') || 
                                      appliedTableName.includes('100 KM') || 
                                      appliedTableName.includes('LOGITECH') ||
                                      missionDest.includes('200KM'));

    const isFixedHoursClientRule = appliedTableName.includes('02H') || 
                                   appliedTableName.includes('02 HORAS') ||
                                   missionDest.includes('02 HORAS') ||
                                   missionDest.includes('02H');

    if (isFixedDistanceClientRule && !isZeroValueMission) {
        distanceForCalculation = Math.min(distanceForCalculation, cFranchiseKm);
    }
    if (isFixedHoursClientRule && !isZeroValueMission) {
        durationHours = Math.min(durationHours, cFranchiseHr);
    }

    cExcessKm = Math.max(0, distanceForCalculation - cFranchiseKm);
    cExcessHr = Math.max(0, durationHours - cFranchiseHr);

    const providerTableName = (appliedProviderTable?.operation_type || '').toUpperCase();
    const isFixedDistanceProviderRule = (!hasAtePrefix(providerTableName)) && (
                                        providerTableName.includes('200KM') || 
                                        providerTableName.includes('200 KM') || 
                                        providerTableName.includes('100KM') || 
                                        providerTableName.includes('100 KM') || 
                                        providerTableName.includes('LOGITECH'));

    const isFixedHoursProviderRule = providerTableName.includes('02H') || 
                                     providerTableName.includes('02 HORAS');

    let providerDistForCalc = distanceForCalculation;
    let providerDurationForCalc = durationHours;

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

    const pUnitCostKm = manualTableOverrides?.customProviderUnitKm !== undefined
        ? manualTableOverrides.customProviderUnitKm
        : (appliedProviderTable?.cost_per_extra_km || 0);
    
    const pUnitCostHour = manualTableOverrides?.customProviderUnitHour !== undefined
        ? manualTableOverrides.customProviderUnitHour
        : (appliedProviderTable?.cost_per_extra_hour || 0);

    // --- APLICAÇÃO DA REGRA DE 16 MINUTOS (ARREDONDAMENTO) ---
    if (clientData?.full_extra_hour_after_16_min) {
        const applyRoundingRule = (hours: number) => {
            if (hours <= 0) return 0;
            const integer = Math.floor(hours);
            const fraction = hours - integer;
            const minutes = fraction * 60;
            
            // Regra: Se exceder 15 minutos (tolerância), considera a hora cheia (próximo inteiro)
            if (minutes > 15) {
                return integer + 1;
            }
            return hours; // Caso contrário, mantém o proporcional
        };

        cExcessHr = applyRoundingRule(cExcessHr);
    }
    // ---------------------------------------------------------

    const round2 = (v: number) => Math.round(v * 100) / 100;

    let cExtraKmVal = round2(Math.max(0, cExcessKm * cUnitPriceKm));
    let cExtraHrVal = round2(Math.max(0, cExcessHr * cUnitPriceHour));

    let pExtraKmVal = round2(Math.max(0, pExcessKm * pUnitCostKm));
    let pExtraHrVal = round2(Math.max(0, pExcessHr * pUnitCostHour));

    const serviceSubtotal = round2(cBase + cExtraKmVal + cExtraHrVal);
    
    let iblFee = 0;
    if (manualTableOverrides?.forceIblFee) {
        iblFee = round2(serviceSubtotal * 0.12);
    }

    const totalRevenue = round2(serviceSubtotal + iblFee + tollValue);
    const totalCost = round2(pBase + pExtraKmVal + pExtraHrVal + tollValue);

    return {
        realTraveledKm, durationHours, tollValue, isCompleted: isFinished, hasValidKms,
        clientMult: clientMultiplier, providerMult: providerMultiplier, 
        agentCount, hasTwoAgentsOnMission: agentCount === 2,
        regionConflict: false, detectedRegion, autoCorrected: !manualTableOverrides,
        calculationMemory: isVelada ? 'Regra Velada' : 'Regra Padrão', iblFee, effectiveStartLabel: startLabel,
        client: { 
            total: totalRevenue, base: cBase, extraKmVal: cExtraKmVal, extraHrVal: cExtraHrVal, 
            excessKm: cExcessKm, 
            excessHours: cExcessHr,
            unitPriceKm: cUnitPriceKm,
            unitPriceHour: cUnitPriceHour,
            usedSpecialRule: isFixedDistanceClientRule || isFixedHoursClientRule, 
            tableName: appliedClientTable?.operation_type, 
            tableId: appliedClientTable?.id.toString(),
            detectionLog: clientLog
        },
        provider: { 
            total: totalCost, base: pBase, extraKmVal: pExtraKmVal, extraHrVal: pExtraHrVal, 
            excessKm: pExcessKm, 
            excessHours: pExcessHr,
            unitCostKm: pUnitCostKm,
            unitCostHour: pUnitCostHour,
            tableName: appliedProviderTable?.operation_type, 
            tableId: appliedProviderTable?.id.toString(),
            usedSpecialRule: isFixedDistanceProviderRule || isFixedHoursProviderRule,
            detectionLog: providerLog
        },
        profit: totalRevenue - totalCost,
        marginPercent: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0
    };
};