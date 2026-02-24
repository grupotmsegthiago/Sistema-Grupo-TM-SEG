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
    
    const match = upper.match(/[-/,]\s*([A-Z]{2})\b/);
    if (match) return match[1];

    if (upper.includes('SAO PAULO') || upper.includes('SÃO PAULO') || upper.includes('SP')) return 'SP';
    if (upper.includes('RIO DE JANEIRO') || upper.includes('RJ')) return 'RJ';
    if (upper.includes('MINAS GERAIS') || upper.includes('MG')) return 'MG';
    if (upper.includes('ESPIRITO SANTO') || upper.includes('ES')) return 'ES';
    if (upper.includes('DISTRITO FEDERAL') || upper.includes('BRASILIA')) return 'DF';
    
    return '';
};

export const extractCityFromAddress = (address: string): string => {
    if (!address) return '';
    const parts = address.split(/[-,]/);
    if (parts.length >= 2) {
        const potentialCity = parts[parts.length - 2].trim();
        if (potentialCity.length > 2) return potentialCity;
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
    
    const getKm = (val: any) => typeof val === 'number' ? val : parseFloat(String(val || '0').replace(',', '.'));
    
    const startKm = getKm(mission.startKm || (mission as any).start_km);
    const endKm = getKm(mission.endKm || (mission as any).end_km);
    const hasValidKms = startKm > 0 && endKm > 0 && endKm >= startKm;
    
    let realTraveledKm = 0;
    if (hasValidKms) {
        realTraveledKm = endKm - startKm;
    }
    
    let distanceForCalculation = hasValidKms ? realTraveledKm : safeNumber(mission.totalDistance);
    
    if (isCancelled) {
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
    } else {
        // LÓGICA DE TEMPO REAL: Missão Ativa usa Hora Atual para forçar cálculo de Hora Extra ao vivo
        endDateObj = currentTime;
    }

    const diffMs = endDateObj.getTime() - effectiveStartDate.getTime();
    let durationHours = Math.max(0, diffMs / (1000 * 60 * 60));

    if (isCancelled) {
        durationHours = 0;
    }

    const tollValue = isCancelled ? 0 : Math.max(0, safeNumber(mission.toll_value));
    
    const validAgents = [mission.agent1, mission.agent2]
        .map(a => a ? String(a).trim() : '')
        .filter(n => n && n !== '---' && n.toUpperCase() !== 'N/A');
    
    const agentCount = validAgents.length || 1;
    const missionTypeRaw = (mission.mission_type || '').toUpperCase();
    const isVelada = missionTypeRaw.includes('VELADA') || (mission.vehicleData?.type || '').toUpperCase().includes('VELADA');
    
    const missionTypeKeyword = isVelada ? 'VELADA' : 'CARACTERIZADA';
    const clientMultiplier = 1;
    const missionProviderName = normalize(mission.provider);
    
    // --- REGRA DE AGENTES ALOCADOS (AJUSTADA) ---
    // O valor só deve ser multiplicado se houver 2 agentes E o fornecedor for 'ATIVA' ou 'TM SEG'
    const isSpecialProvider = missionProviderName.includes('ATIVA') || missionProviderName.includes('TM SEG');
    let providerMultiplier = (agentCount === 2 && isSpecialProvider) ? 2 : 1;
    
    // Fallback: Se for velada e não for desses fornecedores, mantém regra base (1 agente)
    // a menos que a regra anterior já tenha definido como 2.
    // --------------------------------------------

    const selectStrictTable = (candidateTables: any[], dist: number, region: string, city: string, typeKeyword: string, destCity: string, routeCode?: string) => {
        if (!candidateTables || candidateTables.length === 0) return { table: null, log: 'Sem tabelas cadastradas' };

        const normalizedRegion = normalize(region);
        const normalizedCity = normalize(city);
        const normalizedDestCity = normalize(destCity);
        const normalizedType = normalize(typeKeyword);
        const normalizedRouteCode = normalize(routeCode);
        
        const allRegions = ['NORTE', 'NORDESTE', 'CENTRO-OESTE', 'SUDESTE', 'SUL'];
        const prohibitedRegions = normalizedRegion ? allRegions.filter(r => r !== normalizedRegion) : [];

        const scoredTables = candidateTables.map(t => {
            const tableOp = normalize(t.operation_type || '');
            let score = 0;
            let matchType = 'Genérico';

            if (normalizedType && !tableOp.includes(normalizedType)) {
                 score -= 500; 
            }
            
            // --- HIERARQUIA INTELIGENTE DE BUSCA ---
            
            // 1. PRIORIDADE MÁXIMA: CÓDIGO DA ROTA
            if (normalizedRouteCode && tableOp.includes(normalizedRouteCode)) {
                score += 5000;
                matchType = `Código da Rota (${routeCode})`;
            }
            
            // 2. PRIORIDADE ALTA: CIDADE ORIGEM X DESTINO (UF inclusa no normalize se houver)
            else if (normalizedCity.length > 3 && normalizedDestCity.length > 3 && 
                tableOp.includes(normalizedCity) && tableOp.includes(normalizedDestCity)) {
                score += 2000;
                matchType = `Rota Exata (${city} x ${destCity})`;
            }

            // 3. PRIORIDADE MÉDIA: CIDADE DE ORIGEM (Exclusividade como Palhoça)
            else if (normalizedCity.length > 3 && tableOp.includes(normalizedCity)) {
                score += 1000;
                matchType = `Cidade Origem (${city})`;
            }
            
            // 4. PRIORIDADE BASE: REGIÃO
            else if (normalizedRegion && tableOp.includes(normalizedRegion)) {
                score += 500;
                matchType = `Região (${region})`;
            }
            else if (normalizedRegion === 'SUDESTE' && (tableOp.includes('SP') || tableOp.includes('SAO PAULO'))) {
                score += 250;
                matchType = 'Estado (SP)';
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

    if (manualTableOverrides?.clientTableId) {
        appliedClientTable = clientTables.find(t => t.id.toString() === manualTableOverrides.clientTableId);
        clientLog = 'Seleção Manual / Memória';
    } else {
        const result = selectStrictTable(
            clientTables.filter(t => normalize(t.client) === missionClientName), 
            distanceForCalculation, 
            detectedRegion,
            originCity,
            missionTypeKeyword,
            destCity,
            missionRouteCode
        );
        appliedClientTable = result.table;
        clientLog = result.log;
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

    if (manualTableOverrides?.providerTableId) {
        appliedProviderTable = providerTables.find(t => t.id.toString() === manualTableOverrides.providerTableId);
        providerLog = 'Seleção Manual / Memória';
    } else {
        const result = selectStrictTable(
            filteredProviderTables, 
            distanceForCalculation, 
            detectedRegion,
            originCity,
            missionTypeKeyword,
            destCity,
            missionRouteCode
        );
        appliedProviderTable = result.table;
        providerLog = result.log;
    }

    const cBase = manualTableOverrides?.customClientBase !== undefined 
        ? manualTableOverrides.customClientBase 
        : Math.max(0, (appliedClientTable?.activation_fee || 0) * clientMultiplier);
    
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
    const isCeva = missionClientName.includes('CEVA');
    const isStrict200KmRule = isCeva && (appliedTableName.includes('200KM') || appliedTableName.includes('LOGITECH'));
    
    // Provider Vars
    const rawBaseCost = appliedProviderTable?.activation_cost || 0;
    const pBase = manualTableOverrides?.customProviderBase !== undefined
        ? manualTableOverrides.customProviderBase
        : (mission.is_same_os ? 0 : Math.max(0, rawBaseCost * providerMultiplier));
    
    const pFranchiseKm = (appliedProviderTable?.franchise_km || 100);
    const pFranchiseHr = (appliedProviderTable?.franchise_hours || 3);

    let pExcessKm = mission.is_same_os ? 0 : Math.max(0, distanceForCalculation - pFranchiseKm);
    let pExcessHr = mission.is_same_os ? 0 : Math.max(0, durationHours - pFranchiseHr);

    const pUnitCostKm = manualTableOverrides?.customProviderUnitKm !== undefined
        ? manualTableOverrides.customProviderUnitKm
        : (appliedProviderTable?.cost_per_extra_km || 0);
    
    const pUnitCostHour = manualTableOverrides?.customProviderUnitHour !== undefined
        ? manualTableOverrides.customProviderUnitHour
        : (appliedProviderTable?.cost_per_extra_hour || 0);

    const providerTableName = (appliedProviderTable?.operation_type || '').toUpperCase();
    const isProviderFixed200Km = (isCeva || missionClientName.includes('LOGITECH')) && 
                                 (providerTableName.includes('200KM') || 
                                  providerTableName.includes('200 KM') || 
                                  providerTableName.includes('LOGITECH'));

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
        
        // Aplica também ao fornecedor conforme regra de negócio "espelho"
        pExcessHr = applyRoundingRule(pExcessHr);
    }
    // ---------------------------------------------------------

    let cExtraKmVal = Math.max(0, cExcessKm * cUnitPriceKm);
    let cExtraHrVal = Math.max(0, cExcessHr * cUnitPriceHour);

    if (isStrict200KmRule) {
         cExtraKmVal = 0;
         cExtraHrVal = 0;
    }

    let pExtraKmVal = Math.max(0, pExcessKm * pUnitCostKm * providerMultiplier);
    let pExtraHrVal = Math.max(0, pExcessHr * pUnitCostHour * providerMultiplier);

    if (isProviderFixed200Km) {
        pExtraKmVal = 0;
        pExtraHrVal = 0;
    }

    const serviceSubtotal = cBase + cExtraKmVal + cExtraHrVal;
    
    let iblFee = 0;
    if (manualTableOverrides?.forceIblFee) {
        iblFee = serviceSubtotal * 0.12;
    }

    // TOTAL = SOMA MATEMÁTICA PURA dos componentes calculados
    // (Base + Extra KM + Extra Hora) + IBL + Pedágio = Valor Final
    // O total SEMPRE reflete os componentes visíveis na tela. Valores do banco
    // são gerenciados pelo frontend (MissionFinancialModal) via isLoadedFromDB.
    const totalRevenue = serviceSubtotal + iblFee + tollValue;
    const totalCost = pBase + pExtraKmVal + pExtraHrVal + tollValue;

    return {
        realTraveledKm, durationHours, tollValue, isCompleted: isFinished, hasValidKms,
        clientMult: clientMultiplier, providerMult: providerMultiplier, 
        agentCount, hasTwoAgentsOnMission: agentCount === 2,
        regionConflict: false, detectedRegion, autoCorrected: !manualTableOverrides,
        calculationMemory: isVelada ? 'Regra Velada' : 'Regra Padrão', iblFee, effectiveStartLabel: startLabel,
        client: { 
            total: totalRevenue, base: cBase, extraKmVal: cExtraKmVal, extraHrVal: cExtraHrVal, 
            excessKm: isStrict200KmRule ? 0 : cExcessKm, 
            excessHours: isStrict200KmRule ? 0 : cExcessHr,
            unitPriceKm: cUnitPriceKm,
            unitPriceHour: cUnitPriceHour,
            usedSpecialRule: isStrict200KmRule, 
            tableName: appliedClientTable?.operation_type, 
            tableId: appliedClientTable?.id.toString(),
            detectionLog: clientLog
        },
        provider: { 
            total: totalCost, base: pBase, extraKmVal: pExtraKmVal, extraHrVal: pExtraHrVal, 
            excessKm: isProviderFixed200Km ? 0 : pExcessKm, 
            excessHours: isProviderFixed200Km ? 0 : pExcessHr,
            unitCostKm: pUnitCostKm,
            unitCostHour: pUnitCostHour,
            tableName: appliedProviderTable?.operation_type, 
            tableId: appliedProviderTable?.id.toString(),
            usedSpecialRule: isProviderFixed200Km,
            detectionLog: providerLog
        },
        profit: totalRevenue - totalCost,
        marginPercent: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0
    };
};