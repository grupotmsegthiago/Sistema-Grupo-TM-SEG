// ============================================================================
// MOTOR DE CÁLCULO PADRÃO (precificação automática por faixa de KM)
// ----------------------------------------------------------------------------
// Pacote portátil e SEM dependências externas. Cole este arquivo em qualquer
// projeto TypeScript/React.
//
// A ideia: em vez de cadastrar dezenas de tabelas manuais (uma por faixa de
// km), você define 5 variáveis MESTRE e o motor gera/calcula tudo:
//   1. baseActivationValue  -> Valor base (acionamento)
//   2. baseKmAllowance      -> KM de franquia base (ex: 100)
//   3. baseHourAllowance    -> Horas de franquia base (ex: 3)
//   4. extraKmValue         -> Valor por KM excedente
//   5. extraHourValue       -> Valor por hora excedente
//
// Regras embutidas:
//   - 30 faixas fixas de 100 em 100 km (100..3000).
//   - Arredondamento de km real para a faixa com corte em 51 km.
//   - Franquia de horas por faixa = ceil(km_faixa / 40).
//   - "Regra de Ouro" do tempo: protege o fornecedor quando a viatura já
//     estava na origem no horário agendado.
//
// Como usar no cálculo de uma OS/missão:
//   const cfg: ProviderAutoMasterConfig = { baseActivationValue: 480,
//     baseKmAllowance: 100, baseHourAllowance: 3, extraKmValue: 4.8,
//     extraHourValue: 110 };
//   const r = calculateProviderCostAuto(realKm, cfg, scheduledTime, startTime, endTime);
//   console.log(r.totalCost); // custo final
// ============================================================================

export interface ProviderAutoMasterConfig {
    baseActivationValue: number;
    baseKmAllowance: number;
    baseHourAllowance: number;
    extraKmValue: number;
    extraHourValue: number;
    // Filtro opcional (ex: "SUDESTE", "SUL", "SP"). Vazio/null = aplica a tudo.
    // A decisão de aplicar ou não o motor por região fica a cargo do seu
    // código consumidor; aqui ele é só um campo informativo de configuração.
    region?: string | null;
}

export interface ProviderAutoBand {
    kmFaixa: number;
    franquiaHoras: number;
    valorBase: number;
}

export const AUTO_BAND_STEP_KM = 100;   // tamanho da faixa
export const AUTO_BAND_MAX_KM = 3000;   // teto
export const AUTO_HOUR_PER_KM_DIVISOR = 40; // franquia de horas = ceil(km / 40)

const truncTo2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Gera as 30 faixas fixas de 100 em 100 até 3000.
// A faixa-base (baseKmAllowance) é a primeira que não cobra extra de km;
// faixas acima cobram (km - baseKmAllowance) * extraKmValue sobre o acionamento.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Arredonda KM real para a faixa, com corte em 51 km dentro de cada faixa.
// Regra: km <= base+50 -> base; km >= base+51 -> próxima faixa.
// Ex: 0..150->100, 151..250->200, 251..350->300, ..., 2951..3000->3000.
// ---------------------------------------------------------------------------
export function selectAutoBandKm(realKm: number): number {
    if (!Number.isFinite(realKm) || realKm <= 0) return AUTO_BAND_STEP_KM;
    const CUTOFF_OFFSET = AUTO_BAND_STEP_KM - 51; // 49 -> corte em 51 km
    let band = Math.floor((realKm + CUTOFF_OFFSET) / AUTO_BAND_STEP_KM) * AUTO_BAND_STEP_KM;
    if (band < AUTO_BAND_STEP_KM) band = AUTO_BAND_STEP_KM;
    if (band > AUTO_BAND_MAX_KM) band = AUTO_BAND_MAX_KM;
    return band;
}

// ---------------------------------------------------------------------------
// Regra de Ouro do tempo (proteção do fornecedor).
// Se a viatura já estava na origem no horário agendado -> cronômetro começa
// em scheduled. Se chegou depois -> cronômetro começa em start.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// CÁLCULO PRINCIPAL: dado o km real e a config mestre, devolve o custo
// detalhado (base + km extra + hora extra).
// ---------------------------------------------------------------------------
export function calculateProviderCostAuto(
    realKm: number,
    config: ProviderAutoMasterConfig,
    scheduledTime: Date | string | null | undefined,
    startTime: Date | string | null | undefined,
    endTime: Date | string | null | undefined,
): ProviderAutoCalcBreakdown {
    const safeKm = Number.isFinite(realKm) && realKm > 0 ? realKm : 0;
    const bandKm = selectAutoBandKm(safeKm);
    const bandHours = Math.ceil(bandKm / AUTO_HOUR_PER_KM_DIVISOR);

    const golden = computeGoldenRuleHours(scheduledTime, startTime, endTime);
    const durationHours = golden.durationHours;

    const extraKm = Math.max(0, safeKm - bandKm);
    const extraHours = Math.max(0, durationHours - bandHours);

    const baseValue = truncTo2(
        (config.baseActivationValue || 0)
        + Math.max(0, bandKm - config.baseKmAllowance) * (config.extraKmValue || 0)
    );
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

// ---------------------------------------------------------------------------
// SUGESTÃO automática da config mestre a partir de tabelas manuais existentes.
// Calcula a MEDIANA de cada uma das 5 variáveis. Cada linha de tabela deve
// ter: activation_cost, franchise_km, franchise_hours, cost_per_extra_km,
// cost_per_extra_hour. Retorna null quando não há linhas aproveitáveis.
// ---------------------------------------------------------------------------
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

export interface ManualCostRow {
    activation_cost?: number | string;
    franchise_km?: number | string;
    franchise_hours?: number | string;
    cost_per_extra_km?: number | string;
    cost_per_extra_hour?: number | string;
}

export function suggestAutoMasterFromManualTables(
    rows: ManualCostRow[] | null | undefined,
): ProviderAutoMasterSuggestion | null {
    if (!rows || rows.length === 0) return null;
    const manual = rows.filter(Boolean);
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
