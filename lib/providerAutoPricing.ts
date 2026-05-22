// Motor de precificação automática de fornecedores (Task #55).
// Armazenamento: linha em `provider_cost_tables` com operation_type === AUTO_MASTER_OP_TYPE.
// Esta linha é a "configuração mestre"; sua presença = auto_calc_enabled.
// Mapeamento das 5 variáveis para colunas existentes (evita migration):
//   activation_cost      → valor do acionamento (cobre KM da faixa + franquia de horas da faixa)
//   franchise_km         → KM da faixa-base (ex: 100)
//   franchise_hours      → horas da faixa-base (usada só como referência; engine recalcula via ceil(km/40))
//   cost_per_extra_km    → R$/KM excedente
//   cost_per_extra_hour  → R$/hora excedente

export const AUTO_MASTER_OP_TYPE = '__AUTO_MASTER__';

export interface ProviderAutoMasterConfig {
    baseActivationValue: number;
    baseKmAllowance: number;
    baseHourAllowance: number;
    extraKmValue: number;
    extraHourValue: number;
}

export interface ProviderAutoBand {
    kmFaixa: number;
    franquiaHoras: number;
    valorBase: number;
}

export const AUTO_BAND_STEP_KM = 100;
export const AUTO_BAND_MAX_KM = 3000;
export const AUTO_HOUR_PER_KM_DIVISOR = 40;

const truncTo2 = (v: number) => Math.round(v * 100) / 100;

export function isAutoMasterRow(t: { operation_type?: string | null } | null | undefined): boolean {
    if (!t) return false;
    return (t.operation_type || '').toUpperCase().trim() === AUTO_MASTER_OP_TYPE;
}

export function extractAutoMasterConfig(rows: any[] | null | undefined): ProviderAutoMasterConfig | null {
    if (!rows || rows.length === 0) return null;
    const master = rows.find(isAutoMasterRow);
    if (!master) return null;
    return {
        baseActivationValue: Number(master.activation_cost) || 0,
        baseKmAllowance: Number(master.franchise_km) || 0,
        baseHourAllowance: Number(master.franchise_hours) || 0,
        extraKmValue: Number(master.cost_per_extra_km) || 0,
        extraHourValue: Number(master.cost_per_extra_hour) || 0,
    };
}

// Gera as 30 faixas fixas de 100 em 100 até 3000.
// A faixa-base (definida em baseKmAllowance) é a primeira que não cobra extra de KM;
// faixas acima cobram (km - baseKmAllowance) * extraKmValue acima do valor de acionamento.
export function generateAutoBands(config: ProviderAutoMasterConfig): ProviderAutoBand[] {
    const bands: ProviderAutoBand[] = [];
    for (let km = AUTO_BAND_STEP_KM; km <= AUTO_BAND_MAX_KM; km += AUTO_BAND_STEP_KM) {
        const horas = Math.ceil(km / AUTO_HOUR_PER_KM_DIVISOR);
        const excessoKm = Math.max(0, km - (config.baseKmAllowance || 0));
        const valorBase = truncTo2(
            (config.baseActivationValue || 0) + excessoKm * (config.extraKmValue || 0)
        );
        bands.push({ kmFaixa: km, franquiaHoras: horas, valorBase });
    }
    return bands;
}

// Arredonda KM real para a faixa, com corte em 51 km dentro de cada faixa de 100.
// Regra: km <= base+50 → base; km >= base+51 → próxima faixa.
// Ex: 0..150→100, 151..250→200, 251..350→300, ..., 2951..3000→3000.
// Implementação determinística: floor((km + 49) / 100) * 100, clamp [100, 3000].
export function selectAutoBandKm(realKm: number, _config?: ProviderAutoMasterConfig): number {
    if (!Number.isFinite(realKm) || realKm <= 0) return AUTO_BAND_STEP_KM;
    const CUTOFF_OFFSET = AUTO_BAND_STEP_KM - 51; // 49 → corte em 51 km dentro da faixa
    let band = Math.floor((realKm + CUTOFF_OFFSET) / AUTO_BAND_STEP_KM) * AUTO_BAND_STEP_KM;
    if (band < AUTO_BAND_STEP_KM) band = AUTO_BAND_STEP_KM;
    if (band > AUTO_BAND_MAX_KM) band = AUTO_BAND_MAX_KM;
    return band;
}

// Regra de Ouro do tempo (proteção do fornecedor).
// Se a viatura já estava na origem no horário agendado → cronômetro começa em scheduled.
// Se chegou depois → cronômetro começa em start.
export function computeGoldenRuleHours(
    scheduledTime: Date | string | null | undefined,
    startTime: Date | string | null | undefined,
    endTime: Date | string | null | undefined,
): { effectiveStart: Date | null; end: Date | null; durationMinutes: number; durationHours: number } {
    const toDate = (v: any): Date | null => {
        if (!v) return null;
        if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
    };
    const sched = toDate(scheduledTime);
    const start = toDate(startTime);
    const end = toDate(endTime);

    if (!end) return { effectiveStart: sched || start, end: null, durationMinutes: 0, durationHours: 0 };

    let effectiveStart: Date | null = null;
    if (sched && start) {
        effectiveStart = start.getTime() <= sched.getTime() ? sched : start;
    } else {
        effectiveStart = start || sched;
    }
    if (!effectiveStart) return { effectiveStart: null, end, durationMinutes: 0, durationHours: 0 };

    const diffMs = end.getTime() - effectiveStart.getTime();
    if (diffMs <= 0) return { effectiveStart, end, durationMinutes: 0, durationHours: 0 };
    const durationMinutes = Math.floor(diffMs / 60000);
    const durationHours = durationMinutes / 60;
    return { effectiveStart, end, durationMinutes, durationHours };
}

export interface ProviderAutoCalcBreakdown {
    config: ProviderAutoMasterConfig;
    realKm: number;
    bandKm: number;
    bandHours: number;
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
}

export function calculateProviderCostAuto(
    realKm: number,
    config: ProviderAutoMasterConfig,
    scheduledTime: Date | string | null | undefined,
    startTime: Date | string | null | undefined,
    endTime: Date | string | null | undefined,
): ProviderAutoCalcBreakdown {
    const safeKm = Number.isFinite(realKm) && realKm > 0 ? realKm : 0;
    const bandKm = selectAutoBandKm(safeKm, config);
    const bandHours = Math.ceil(bandKm / AUTO_HOUR_PER_KM_DIVISOR);

    const golden = computeGoldenRuleHours(scheduledTime, startTime, endTime);
    const durationHours = golden.durationHours;

    const extraKm = Math.max(0, safeKm - bandKm);
    const extraHours = Math.max(0, durationHours - bandHours);

    const baseValue = truncTo2((config.baseActivationValue || 0) + Math.max(0, bandKm - config.baseKmAllowance) * (config.extraKmValue || 0));
    const extraKmValueRs = truncTo2(extraKm * (config.extraKmValue || 0));
    const extraHourValueRs = truncTo2(extraHours * (config.extraHourValue || 0));
    const totalCost = truncTo2(baseValue + extraKmValueRs + extraHourValueRs);

    return {
        config,
        realKm: safeKm,
        bandKm,
        bandHours,
        durationHours,
        durationMinutes: golden.durationMinutes,
        effectiveStartIso: golden.effectiveStart ? golden.effectiveStart.toISOString() : null,
        endIso: golden.end ? golden.end.toISOString() : null,
        extraKm,
        extraHours,
        baseValue,
        extraKmValue: extraKmValueRs,
        extraHourValue: extraHourValueRs,
        totalCost,
    };
}
