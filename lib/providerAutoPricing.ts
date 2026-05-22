// Motor de precificação automática de fornecedores (Task #55).
// Task #58: a configuração agora vive em colunas dedicadas em providers
//   (auto_calc_enabled, auto_base_value, auto_base_km, auto_base_hr,
//   auto_extra_km, auto_extra_hr). A antiga linha __AUTO_MASTER__ em
//   provider_cost_tables foi descontinuada e migrada via SQL.
//   Helpers legados (`AUTO_MASTER_OP_TYPE`, `isAutoMasterRow`,
//   `extractAutoMasterConfig`) ficam só para compatibilidade durante a
//   transição e não devem ser usados em código novo.

export const AUTO_MASTER_OP_TYPE = '__AUTO_MASTER__';

export interface ProviderAutoMasterConfig {
    baseActivationValue: number;
    baseKmAllowance: number;
    baseHourAllowance: number;
    extraKmValue: number;
    extraHourValue: number;
}

// Task #58: lê a configuração mestre direto do registro do fornecedor.
export function extractAutoMasterConfigFromProvider(
    provider: any | null | undefined,
): ProviderAutoMasterConfig | null {
    if (!provider) return null;
    if (!provider.auto_calc_enabled) return null;
    const cfg: ProviderAutoMasterConfig = {
        baseActivationValue: Number(provider.auto_base_value) || 0,
        baseKmAllowance: Number(provider.auto_base_km) || 0,
        baseHourAllowance: Number(provider.auto_base_hr) || 0,
        extraKmValue: Number(provider.auto_extra_km) || 0,
        extraHourValue: Number(provider.auto_extra_hr) || 0,
    };
    // Salvaguarda: motor exige pelo menos valor base e km franquia > 0.
    if (cfg.baseActivationValue <= 0 || cfg.baseKmAllowance <= 0) return null;
    return cfg;
}

// Task #58: sintetiza uma "linha mestre" (no formato ProviderCostTable) a
// partir do registro de provider. Usado pelo engine financeiro pra preservar
// o contrato interno sem precisar reescrever toda a engine.
export function synthesizeAutoMasterRow(provider: any | null | undefined): any | null {
    const cfg = extractAutoMasterConfigFromProvider(provider);
    if (!cfg) return null;
    return {
        id: `__auto_master__:${provider?.id || provider?.name || 'unknown'}`,
        provider: provider?.name || '',
        operation_type: AUTO_MASTER_OP_TYPE,
        activation_cost: cfg.baseActivationValue,
        franchise_km: cfg.baseKmAllowance,
        franchise_hours: cfg.baseHourAllowance,
        cost_per_extra_km: cfg.extraKmValue,
        cost_per_extra_hour: cfg.extraHourValue,
        cancellation_fee: 0,
        __synthetic_auto_master: true,
    };
}

// Task #58: dado um array de providers, gera as linhas-mestre sintéticas
// pra todos os fornecedores com motor ligado.
export function buildAutoMasterRowsFromProviders(providers: any[] | null | undefined): any[] {
    if (!providers || providers.length === 0) return [];
    const out: any[] = [];
    for (const p of providers) {
        const row = synthesizeAutoMasterRow(p);
        if (row) out.push(row);
    }
    return out;
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

// Task #56 — Sugestão de configuração mestre a partir das tabelas manuais existentes.
// Calcula a mediana de cada uma das 5 variáveis sobre as linhas manuais (ignora a linha mestre).
// Retorna null quando não há linhas manuais aproveitáveis.
export interface ProviderAutoMasterSuggestion {
    config: ProviderAutoMasterConfig;
    sampleCount: number;
}

function median(values: number[]): number {
    const arr = values.filter(v => Number.isFinite(v)).slice().sort((a, b) => a - b);
    if (arr.length === 0) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

export function suggestAutoMasterFromManualTables(rows: any[] | null | undefined): ProviderAutoMasterSuggestion | null {
    if (!rows || rows.length === 0) return null;
    const manual = rows.filter(r => r && !isAutoMasterRow(r));
    if (manual.length === 0) return null;

    const activation = manual.map(r => Number(r.activation_cost)).filter(v => Number.isFinite(v) && v > 0);
    const km = manual.map(r => Number(r.franchise_km)).filter(v => Number.isFinite(v) && v > 0);
    const hours = manual.map(r => Number(r.franchise_hours)).filter(v => Number.isFinite(v) && v > 0);
    const extraKm = manual.map(r => Number(r.cost_per_extra_km)).filter(v => Number.isFinite(v) && v >= 0);
    const extraHour = manual.map(r => Number(r.cost_per_extra_hour)).filter(v => Number.isFinite(v) && v >= 0);

    if (activation.length === 0 && km.length === 0 && hours.length === 0 && extraKm.length === 0 && extraHour.length === 0) return null;

    return {
        sampleCount: manual.length,
        config: {
            baseActivationValue: truncTo2(median(activation)),
            baseKmAllowance: Math.round(median(km)) || 100,
            baseHourAllowance: Math.round(median(hours)) || 3,
            extraKmValue: truncTo2(median(extraKm)),
            extraHourValue: truncTo2(median(extraHour)),
        },
    };
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
