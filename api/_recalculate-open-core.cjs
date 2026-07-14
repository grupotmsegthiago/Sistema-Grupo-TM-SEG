"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/financialUtils.ts
var financialUtils_exports = {};
__export(financialUtils_exports, {
  UF_TO_REGION: () => UF_TO_REGION,
  applyRegionSuffix: () => applyRegionSuffix,
  auditMissionFinancials: () => auditMissionFinancials,
  calculateMissionFinancials: () => calculateMissionFinancials,
  clientFuzzyFilter: () => clientFuzzyFilter,
  clientNameShort: () => clientNameShort,
  clientTableMatchesMission: () => clientTableMatchesMission,
  dhlDefaultUnitKmExcess: () => dhlDefaultUnitKmExcess,
  extractCityFromAddress: () => extractCityFromAddress,
  extractUF: () => extractUF,
  fetchClientPriceTables: () => fetchClientPriceTables,
  identifyRegionFromText: () => identifyRegionFromText,
  isIntentionalBillingOverride: () => isIntentionalBillingOverride,
  isSameClientName: () => isSameClientName,
  resolveCancelledTime: () => resolveCancelledTime,
  resolveCancelledWindow: () => resolveCancelledWindow
});
module.exports = __toCommonJS(financialUtils_exports);

// lib/providerAutoPricing.ts
var AUTO_MASTER_OP_TYPE = "__AUTO_MASTER__";
function extractAutoMasterConfigFromProvider(provider) {
  if (!provider) return null;
  if (!provider.auto_calc_enabled) return null;
  const cfg = {
    baseActivationValue: Number(provider.auto_base_value) || 0,
    baseKmAllowance: Number(provider.auto_base_km) || 0,
    baseHourAllowance: Number(provider.auto_base_hr) || 0,
    extraKmValue: Number(provider.auto_extra_km) || 0,
    extraHourValue: Number(provider.auto_extra_hr) || 0,
    region: provider.auto_region ? String(provider.auto_region).toUpperCase().trim() : null
  };
  if (cfg.baseActivationValue <= 0 || cfg.baseKmAllowance <= 0) return null;
  return cfg;
}
function synthesizeAutoMasterRow(provider) {
  const cfg = extractAutoMasterConfigFromProvider(provider);
  if (!cfg) return null;
  return {
    id: `__auto_master__:${provider?.id || provider?.name || "unknown"}`,
    provider: provider?.name || "",
    operation_type: AUTO_MASTER_OP_TYPE,
    activation_cost: cfg.baseActivationValue,
    franchise_km: cfg.baseKmAllowance,
    franchise_hours: cfg.baseHourAllowance,
    cost_per_extra_km: cfg.extraKmValue,
    cost_per_extra_hour: cfg.extraHourValue,
    cancellation_fee: 0,
    auto_region: cfg.region || null,
    __synthetic_auto_master: true
  };
}
function buildAutoMasterRowsFromProviders(providers) {
  if (!providers || providers.length === 0) return [];
  const out = [];
  for (const p of providers) {
    const row = synthesizeAutoMasterRow(p);
    if (row) out.push(row);
  }
  return out;
}
var AUTO_BAND_STEP_KM = 100;
var AUTO_BAND_MAX_KM = 3e3;
var AUTO_HOUR_PER_KM_DIVISOR = 40;
var truncTo2 = (v) => Math.round(v * 100) / 100;
function isAutoMasterRow(t) {
  if (!t) return false;
  return (t.operation_type || "").toUpperCase().trim() === AUTO_MASTER_OP_TYPE;
}
function extractAutoMasterConfig(rows) {
  if (!rows || rows.length === 0) return null;
  const master = rows.find(isAutoMasterRow);
  if (!master) return null;
  return {
    baseActivationValue: Number(master.activation_cost) || 0,
    baseKmAllowance: Number(master.franchise_km) || 0,
    baseHourAllowance: Number(master.franchise_hours) || 0,
    extraKmValue: Number(master.cost_per_extra_km) || 0,
    extraHourValue: Number(master.cost_per_extra_hour) || 0,
    region: master.auto_region ? String(master.auto_region).toUpperCase().trim() : null
  };
}
function selectAutoBandKm(realKm, _config) {
  if (!Number.isFinite(realKm) || realKm <= 0) return AUTO_BAND_STEP_KM;
  const CUTOFF_OFFSET = AUTO_BAND_STEP_KM - 51;
  let band = Math.floor((realKm + CUTOFF_OFFSET) / AUTO_BAND_STEP_KM) * AUTO_BAND_STEP_KM;
  if (band < AUTO_BAND_STEP_KM) band = AUTO_BAND_STEP_KM;
  if (band > AUTO_BAND_MAX_KM) band = AUTO_BAND_MAX_KM;
  return band;
}
function computeGoldenRuleHours(scheduledTime, startTime, endTime) {
  const toDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const sched = toDate(scheduledTime);
  const start = toDate(startTime);
  const end = toDate(endTime);
  if (!end) return { effectiveStart: sched || start, end: null, durationMinutes: 0, durationHours: 0 };
  let effectiveStart = null;
  if (sched && start) {
    effectiveStart = start.getTime() <= sched.getTime() ? sched : start;
  } else {
    effectiveStart = start || sched;
  }
  if (!effectiveStart) return { effectiveStart: null, end, durationMinutes: 0, durationHours: 0 };
  const diffMs = end.getTime() - effectiveStart.getTime();
  if (diffMs <= 0) return { effectiveStart, end, durationMinutes: 0, durationHours: 0 };
  const durationMinutes = Math.floor(diffMs / 6e4);
  const durationHours = durationMinutes / 60;
  return { effectiveStart, end, durationMinutes, durationHours };
}
function calculateProviderCostAuto(realKm, config, scheduledTime, startTime, endTime) {
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
    totalCost
  };
}

// lib/dhlAutoTableSelector.ts
var DHL_CLIENT_NAME = "DHL SUPPLY CHAIN (BRAZIL) LTDA";
var DHL_AUTO_CLIENT_NAMES = [
  DHL_CLIENT_NAME,
  "DHL EXPRESS BRAZIL LTDA",
  "DHL GLOBAL FORWARDING (BRAZIL) LTDA",
  "DHL LOGISTICS (BRASIL) LTDA"
];
var normalize = (s) => {
  if (!s) return "";
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
};
var NORMALIZED_DHL_CLIENTS = new Map(
  DHL_AUTO_CLIENT_NAMES.map((name) => [normalize(name), name])
);
var findDhlAutoClient = (clientName) => {
  const n = normalize(clientName);
  if (!n) return null;
  return NORMALIZED_DHL_CLIENTS.get(n) ?? null;
};
var sameDhlClient = (a, b) => {
  const na = normalize(a);
  const nb = normalize(b);
  return !!na && na === nb;
};
var computeDhlBand = (km) => {
  const k = Math.max(0, Number(km) || 0);
  if (k <= 150) return 100;
  return Math.ceil((k - 50) / 100) * 100;
};
var VALID_REGIONS = /* @__PURE__ */ new Set(["SUDESTE", "SUL", "CENTRO-OESTE", "NORDESTE", "NORTE", "BRASIL"]);
var stripDhlOpDescription = (op) => {
  if (!op) return { region: null, desc: "", km: null };
  const raw = op.trim();
  let region = null;
  let rest = raw;
  const mLegacy = raw.match(/^REGI[ÃA]O\s*-\s*(CENTRO-OESTE|SUDESTE|NORDESTE|NORTE|SUL|BRASIL)\s*-\s*(.+)$/i);
  if (mLegacy) {
    const candidate = normalize(mLegacy[1]);
    if (VALID_REGIONS.has(candidate)) {
      region = candidate;
      rest = mLegacy[2];
    }
  } else {
    const mShort = raw.match(/^(CENTRO-OESTE|SUDESTE|NORDESTE|NORTE|SUL|BRASIL)\s*-\s*(.+)$/i);
    if (mShort) {
      const candidate = normalize(mShort[1]);
      if (VALID_REGIONS.has(candidate)) {
        region = candidate;
        rest = mShort[2];
      }
    }
  }
  let km = null;
  const kmMatch = rest.match(/(?:^|\s)(\d{2,5})\s*KM\s*$/i);
  if (kmMatch) {
    km = parseInt(kmMatch[1], 10);
    rest = rest.slice(0, kmMatch.index).trim();
  }
  return { region, desc: normalize(rest), km };
};
var regionFromDhlOperationType = (op) => {
  return stripDhlOpDescription(op).region;
};
var extractEmbeddedKms = (desc) => {
  const matches = desc.matchAll(/(\d{2,5})(?!\d)/g);
  const out = [];
  for (const m of matches) out.push(parseInt(m[1], 10));
  return out;
};
var DHL_CORRECTIONS_CACHE = [];
var pickFromCorrections = (candidates, dhlTables) => {
  if (candidates.length === 0) return null;
  const tally = /* @__PURE__ */ new Map();
  for (const c of candidates) {
    const ts = Date.parse(c.createdAt || "") || 0;
    const cur = tally.get(c.chosenTableId);
    if (!cur) tally.set(c.chosenTableId, { count: 1, latest: ts });
    else {
      cur.count += 1;
      if (ts > cur.latest) cur.latest = ts;
    }
  }
  const ranked = Array.from(tally.entries()).sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return b[1].latest - a[1].latest;
  });
  for (const [tableId] of ranked) {
    const found = dhlTables.find((t) => String(t.id) === String(tableId));
    if (found) return found;
  }
  return null;
};
var selectDhlClientTable = (tables, mission, googleKm, options) => {
  const targetClient = findDhlAutoClient(options?.clientName) || DHL_CLIENT_NAME;
  const originUF = extractUF(mission.origin || "");
  const detectedRegion = UF_TO_REGION[originUF] || "";
  const band = computeDhlBand(googleKm);
  const originCity = normalize(extractCityFromAddress(mission.origin || ""));
  const destCity = normalize(extractCityFromAddress(mission.destination || ""));
  const dhlTables = (tables || []).filter((t) => sameDhlClient(t.client, targetClient));
  if (!detectedRegion) {
    return {
      table: null,
      matchLevel: "none",
      detectedRegion: "",
      band,
      reason: `Origem sem UF identificada (faixa ${band}km) \u2014 selecione manualmente`,
      clientName: targetClient
    };
  }
  if (originCity && destCity) {
    const routeKey = `${originCity}-${destCity}`;
    const inverseKey = `${destCity}-${originCity}`;
    const tableRouteKey = (op) => {
      const parts = stripDhlOpDescription(op);
      if (parts.region && parts.region !== detectedRegion) return null;
      const desc = parts.desc;
      if (!desc) return null;
      const dash = desc.indexOf("-");
      if (dash <= 0) return null;
      const left = desc.slice(0, dash).trim();
      const right = desc.slice(dash + 1).trim();
      if (!left || !right) return null;
      return `${left}-${right}`;
    };
    const matchRoute = (wantInverse) => dhlTables.find((t) => tableRouteKey(t.operation_type) === (wantInverse ? inverseKey : routeKey));
    const direct = matchRoute(false);
    const exact = direct || matchRoute(true);
    if (exact) {
      return {
        table: exact,
        matchLevel: "exact_route",
        detectedRegion,
        band,
        reason: direct ? `Rota Exata (${detectedRegion}, franquia ${exact.franchise_km || 0}km)` : `Rota Inversa (${detectedRegion}, franquia ${exact.franchise_km || 0}km)`,
        clientName: targetClient
      };
    }
  }
  if (DHL_CORRECTIONS_CACHE.length > 0) {
    const routeMatches = originCity && destCity ? DHL_CORRECTIONS_CACHE.filter((c) => c.region === detectedRegion && c.band === band && c.originCity === originCity && c.destCity === destCity) : [];
    const routeChosen = pickFromCorrections(routeMatches, dhlTables);
    if (routeChosen) {
      return {
        table: routeChosen,
        matchLevel: "memory_route",
        detectedRegion,
        band,
        reason: `Mem\xF3ria do auditor (rota ${originCity}\u2192${destCity}, ${detectedRegion} + ${band}km)`,
        clientName: targetClient
      };
    }
    const regionMatches = DHL_CORRECTIONS_CACHE.filter((c) => c.region === detectedRegion && c.band === band);
    const regionChosen = pickFromCorrections(regionMatches, dhlTables);
    if (regionChosen) {
      return {
        table: regionChosen,
        matchLevel: "memory_region",
        detectedRegion,
        band,
        reason: `Mem\xF3ria do auditor (${detectedRegion} + ${band}km)`,
        clientName: targetClient
      };
    }
  }
  const k = Math.max(0, Number(googleKm) || 0);
  const ufRaioDesc = `RAIO ${originUF}`;
  const ufDistDesc = `DISTRIBUICAO ${originUF}`;
  const ufBandMatch = (wanted) => dhlTables.find((t) => {
    if ((t.franchise_km || 0) !== band) return false;
    const parts = stripDhlOpDescription(t.operation_type);
    if (parts.region && parts.region !== detectedRegion) return false;
    return parts.desc === wanted;
  });
  const ufTable = ufBandMatch(ufRaioDesc) || ufBandMatch(ufDistDesc);
  if (ufTable) {
    return {
      table: ufTable,
      matchLevel: "region_band",
      detectedRegion,
      band,
      reason: `Faixa por UF (${originUF} + ${band}km, ${ufTable.operation_type})`,
      clientName: targetClient,
      ufSpecific: true
    };
  }
  const regionCandidates = dhlTables.filter((t) => {
    if ((t.franchise_km || 0) !== band) return false;
    const region = regionFromDhlOperationType(t.operation_type);
    if (!region) return false;
    return region === detectedRegion;
  });
  if (regionCandidates.length > 0) {
    const scored = regionCandidates.map((t) => {
      const desc = stripDhlOpDescription(t.operation_type).desc;
      const embedded = extractEmbeddedKms(desc);
      const diff = embedded.length > 0 ? Math.min(...embedded.map((n) => Math.abs(n - k))) : Number.POSITIVE_INFINITY;
      return { t, diff, op: t.operation_type || "" };
    });
    scored.sort((a, b) => {
      if (a.diff !== b.diff) return a.diff - b.diff;
      return a.op.localeCompare(b.op);
    });
    return {
      table: scored[0].t,
      matchLevel: "region_band",
      detectedRegion,
      band,
      reason: `Sugest\xE3o por Proximidade (${detectedRegion} + ${band}km)`,
      clientName: targetClient
    };
  }
  const sameRegionAnyKm = dhlTables.filter((t) => {
    const region = regionFromDhlOperationType(t.operation_type);
    return region === detectedRegion;
  });
  if (sameRegionAnyKm.length > 0) {
    const scored = sameRegionAnyKm.map((t) => {
      const desc = stripDhlOpDescription(t.operation_type).desc;
      const embedded = extractEmbeddedKms(desc);
      const fk = Number(t.franchise_km || 0);
      const candidates = [...embedded];
      if (fk > 0) candidates.push(fk);
      const diff = candidates.length > 0 ? Math.min(...candidates.map((n) => Math.abs(n - k))) : Number.POSITIVE_INFINITY;
      return { t, diff, fk, op: t.operation_type || "" };
    });
    scored.sort((a, b) => {
      if (a.diff !== b.diff) return a.diff - b.diff;
      if (a.fk !== b.fk) return b.fk - a.fk;
      return a.op.localeCompare(b.op);
    });
    const best = scored[0];
    return {
      table: best.t,
      matchLevel: "region_any_km",
      detectedRegion,
      band,
      reason: `Proximidade Regional (${detectedRegion}, mais pr\xF3xima de ${Math.round(k)}km)`,
      clientName: targetClient
    };
  }
  return {
    table: null,
    matchLevel: "none",
    detectedRegion,
    band,
    reason: `Sem tabela DHL para ${detectedRegion} \u2014 selecione manualmente`,
    clientName: targetClient
  };
};

// lib/financialUtils.ts
var STOP_WORDS = ["LTDA", "LTDA.", "S.A.", "S.A", "SA", "S/A", "S/A.", "DO", "DE", "DA", "E", "DAS", "DOS"];
function quoteForOr(v) {
  return /[(),.:]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}
function clientFuzzyFilter(clientName) {
  const trimmed = (clientName || "").trim();
  if (!trimmed) return `client.eq.${quoteForOr(clientName)}`;
  const words = trimmed.split(/\s+/).filter((w) => !STOP_WORDS.includes(w.toUpperCase()));
  const short = words.length >= 2 ? words[0] + " " + words[1].substring(0, Math.min(6, words[1].length)) : words[0] || trimmed;
  return `client.eq.${quoteForOr(clientName)},client.ilike.${quoteForOr("%" + short + "%")}`;
}
function clientNameShort(clientName) {
  const trimmed = (clientName || "").trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/).filter((w) => !STOP_WORDS.includes(w.toUpperCase()));
  return words.length >= 2 ? words[0] + " " + words[1].substring(0, Math.min(6, words[1].length)) : words[0] || trimmed;
}
function clientSignificantTokens(clientName) {
  const norm = (clientName || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!norm) return [];
  return norm.split(" ").filter((w) => w && !STOP_WORDS.includes(w));
}
function isSameClientName(a, b) {
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
function dhlDefaultUnitKmExcess(originUF) {
  const uf = String(originUF || "").toUpperCase().trim();
  return uf === "SC" || uf === "RS" ? 7.35 : 6.9;
}
function clientTableMatchesMission(tableClient, missionClientName) {
  const mission = String(missionClientName || "").trim();
  const tc = String(tableClient || "").trim();
  if (!mission || !tc) return false;
  if (normalize2(tc) === normalize2(mission)) return true;
  if (isSameClientName(tc, mission)) return true;
  const missionDhl = findDhlAutoClient(mission);
  const tableDhl = findDhlAutoClient(tc);
  return !!(missionDhl && tableDhl && missionDhl === tableDhl);
}
function isIntentionalBillingOverride(editReason) {
  const raw = String(editReason || "").trim();
  if (!raw) return false;
  const r = raw.toLowerCase();
  const allowAutoResync = [
    "salvamento manual confirmado",
    "recalculado pelo sistema",
    "tabela oficial aplicada"
  ];
  if (allowAutoResync.some((p) => r.includes(p))) return false;
  const blockAutoResync = [
    "edi\xE7\xE3o manual",
    "edicao manual",
    "ajuste manual",
    "divergente",
    "sugeria:",
    "sistema sugeria:",
    "motor auto sugeria",
    "valor zero confirmado"
  ];
  if (blockAutoResync.some((p) => r.includes(p))) return true;
  return true;
}
async function fetchClientPriceTables(supabase, clientName) {
  const trimmed = String(clientName || "").trim();
  if (!trimmed) return [];
  const pageSize = 1e3;
  const byId = /* @__PURE__ */ new Map();
  const ingest = async (builder) => {
    let offset = 0;
    for (; ; ) {
      const { data, error } = await builder.range(offset, offset + pageSize - 1);
      if (error) throw error;
      const rows = data || [];
      for (const row of rows) byId.set(String(row.id), row);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  };
  const dhlCanonical = findDhlAutoClient(trimmed);
  if (dhlCanonical) {
    await ingest(supabase.from("client_price_tables").select("*").eq("client", dhlCanonical));
  }
  await ingest(supabase.from("client_price_tables").select("*").or(clientFuzzyFilter(trimmed)));
  return Array.from(byId.values());
}
var safeNumber = (val) => {
  if (val === null || val === void 0 || val === "") return 0;
  if (typeof val === "number") return val;
  let str = String(val).trim();
  if (str.includes(",") && str.includes(".")) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
};
var normalize2 = (str) => {
  if (!str) return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
};
var UF_TO_REGION = {
  "SP": "SUDESTE",
  "RJ": "SUDESTE",
  "MG": "SUDESTE",
  "ES": "SUDESTE",
  "DF": "CENTRO-OESTE",
  "GO": "CENTRO-OESTE",
  "MT": "CENTRO-OESTE",
  "MS": "CENTRO-OESTE",
  "PR": "SUL",
  "SC": "SUL",
  "RS": "SUL",
  "BA": "NORDESTE",
  "PE": "NORDESTE",
  "CE": "NORDESTE",
  "RN": "NORDESTE",
  "PB": "NORDESTE",
  "AL": "NORDESTE",
  "SE": "NORDESTE",
  "PI": "NORDESTE",
  "MA": "NORDESTE",
  "AM": "NORTE",
  "PA": "NORTE",
  "AC": "NORTE",
  "RO": "NORTE",
  "RR": "NORTE",
  "AP": "NORTE",
  "TO": "NORTE"
};
var resolveCancelledTime = (scheduledIso, cancelIso) => {
  const sched = scheduledIso ? new Date(scheduledIso) : null;
  const cancel = cancelIso ? new Date(cancelIso) : null;
  const schedOk = !!sched && !isNaN(sched.getTime());
  const cancelOk = !!cancel && !isNaN(cancel.getTime());
  if (!cancelOk && !schedOk) return null;
  if (!cancelOk) return scheduledIso;
  if (!schedOk) return cancelIso;
  return cancel.getTime() < sched.getTime() ? scheduledIso : cancelIso;
};
var resolveCancelledWindow = (scheduledIso, cancelIso) => {
  const sched = scheduledIso ? new Date(scheduledIso) : null;
  const cancel = cancelIso ? new Date(cancelIso) : null;
  const schedOk = !!sched && !isNaN(sched.getTime());
  const cancelOk = !!cancel && !isNaN(cancel.getTime());
  const startIso = schedOk ? scheduledIso : cancelOk ? cancelIso : "";
  if (!schedOk || !cancelOk) {
    return { start: startIso, end: startIso, cancelledBefore: true };
  }
  const cancelledBefore = cancel.getTime() <= sched.getTime();
  return {
    start: scheduledIso,
    end: cancelledBefore ? scheduledIso : cancelIso,
    cancelledBefore
  };
};
var extractUF = (address) => {
  if (!address) return "";
  const cleanAddr = address.split("(")[0].trim();
  const upper = cleanAddr.toUpperCase();
  const VALID_UFS = new Set(Object.keys(UF_TO_REGION));
  const allMatches = [...upper.matchAll(/[-/,]\s*([A-Z]{2})\b/g)];
  for (let i = allMatches.length - 1; i >= 0; i--) {
    const uf = allMatches[i][1];
    if (VALID_UFS.has(uf)) return uf;
  }
  if (upper.includes("SAO PAULO") || upper.includes("S\xC3O PAULO")) return "SP";
  if (upper.includes("RIO DE JANEIRO")) return "RJ";
  if (upper.includes("MINAS GERAIS")) return "MG";
  if (upper.includes("ESPIRITO SANTO") || upper.includes("ESP\xCDRITO SANTO")) return "ES";
  if (upper.includes("DISTRITO FEDERAL") || upper.includes("BRASILIA") || upper.includes("BRAS\xCDLIA")) return "DF";
  if (upper.includes("PARANA") || upper.includes("PARAN\xC1")) return "PR";
  if (upper.includes("SANTA CATARINA")) return "SC";
  if (upper.includes("RIO GRANDE DO SUL")) return "RS";
  if (upper.includes("BAHIA")) return "BA";
  if (upper.includes("PERNAMBUCO")) return "PE";
  if (upper.includes("CEARA") || upper.includes("CEAR\xC1")) return "CE";
  if (upper.includes("MARANHAO") || upper.includes("MARANH\xC3O")) return "MA";
  if (upper.includes("PARA") || upper.includes("PAR\xC1")) return "PA";
  if (upper.includes("GOIAS") || upper.includes("GOI\xC1S")) return "GO";
  if (upper.includes("MATO GROSSO DO SUL")) return "MS";
  if (upper.includes("MATO GROSSO")) return "MT";
  if (upper.includes("RIO GRANDE DO NORTE")) return "RN";
  if (upper.includes("PARAIBA") || upper.includes("PARA\xCDBA")) return "PB";
  if (upper.includes("ALAGOAS")) return "AL";
  if (upper.includes("SERGIPE")) return "SE";
  if (upper.includes("PIAUI") || upper.includes("PIAU\xCD")) return "PI";
  if (upper.includes("AMAZONAS")) return "AM";
  if (upper.includes("TOCANTINS")) return "TO";
  if (upper.includes("RONDONIA") || upper.includes("ROND\xD4NIA")) return "RO";
  if (upper.includes("ACRE")) return "AC";
  if (upper.includes("RORAIMA")) return "RR";
  if (upper.includes("AMAPA") || upper.includes("AMAP\xC1")) return "AP";
  const CITY_TO_UF = {
    "JABOATAO DOS GUARARAPES": "PE",
    "JABOATAO": "PE",
    "RECIFE": "PE",
    "OLINDA": "PE",
    "CARUARU": "PE",
    "PETROLINA": "PE",
    "PAULISTA": "PE",
    "CABO DE SANTO AGOSTINHO": "PE",
    "CAMARAGIBE": "PE",
    "GARANHUNS": "PE",
    "IPOJUCA": "PE",
    "SUAPE": "PE",
    "IGARASSU": "PE",
    "ABREU E LIMA": "PE",
    "SALVADOR": "BA",
    "FEIRA DE SANTANA": "BA",
    "VITORIA DA CONQUISTA": "BA",
    "CAMACARI": "BA",
    "LAURO DE FREITAS": "BA",
    "ILHEUS": "BA",
    "ITABUNA": "BA",
    "JUAZEIRO": "BA",
    "SIMOES FILHO": "BA",
    "DIAS D'AVILA": "BA",
    "CANDEIAS": "BA",
    "ALAGOINHAS": "BA",
    "FORTALEZA": "CE",
    "CAUCAIA": "CE",
    "JUAZEIRO DO NORTE": "CE",
    "MARACANAU": "CE",
    "SOBRAL": "CE",
    "CRATO": "CE",
    "EUSEBIO": "CE",
    "PEC\xC9M": "CE",
    "PECEM": "CE",
    "HORIZONTE": "CE",
    "PACATUBA": "CE",
    "SAO LUIS": "MA",
    "IMPERATRIZ": "MA",
    "TIMON": "MA",
    "CAXIAS": "MA",
    "BACABAL": "MA",
    "NATAL": "RN",
    "MOSSORO": "RN",
    "PARNAMIRIM": "RN",
    "SAO GONCALO DO AMARANTE": "RN",
    "MACAIBA": "RN",
    "JOAO PESSOA": "PB",
    "CAMPINA GRANDE": "PB",
    "SANTA RITA": "PB",
    "BAYEUX": "PB",
    "CABEDELO": "PB",
    "MACEIO": "AL",
    "ARAPIRACA": "AL",
    "RIO LARGO": "AL",
    "MARECHAL DEODORO": "AL",
    "ARACAJU": "SE",
    "NOSSA SENHORA DO SOCORRO": "SE",
    "LAGARTO": "SE",
    "ITABAIANA": "SE",
    "TERESINA": "PI",
    "PARNAIBA": "PI",
    "BELEM": "PA",
    "ANANINDEUA": "PA",
    "SANTAREM": "PA",
    "MARABA": "PA",
    "CASTANHAL": "PA",
    "BARCARENA": "PA",
    "MANAUS": "AM",
    "PARINTINS": "AM",
    "PALMAS": "TO",
    "PORTO VELHO": "RO",
    "RIO BRANCO": "AC",
    "BOA VISTA": "RR",
    "MACAPA": "AP",
    "GOIANIA": "GO",
    "APARECIDA DE GOIANIA": "GO",
    "ANAPOLIS": "GO",
    "LUZIANIA": "GO",
    "CUIABA": "MT",
    "VARZEA GRANDE": "MT",
    "RONDONOPOLIS": "MT",
    "SINOP": "MT",
    "CAMPO GRANDE": "MS",
    "DOURADOS": "MS",
    "TRES LAGOAS": "MS",
    "CURITIBA": "PR",
    "LONDRINA": "PR",
    "MARINGA": "PR",
    "PONTA GROSSA": "PR",
    "CASCAVEL": "PR",
    "SAO JOSE DOS PINHAIS": "PR",
    "FOZ DO IGUACU": "PR",
    "COLOMBO": "PR",
    "PARANAGUA": "PR",
    "FLORIANOPOLIS": "SC",
    "JOINVILLE": "SC",
    "BLUMENAU": "SC",
    "ITAJAI": "SC",
    "CHAPECO": "SC",
    "CRICIUMA": "SC",
    "NAVEGANTES": "SC",
    "PORTO ALEGRE": "RS",
    "CAXIAS DO SUL": "RS",
    "CANOAS": "RS",
    "PELOTAS": "RS",
    "SANTA MARIA": "RS",
    "GRAVATAI": "RS",
    "NOVO HAMBURGO": "RS",
    "SAO LEOPOLDO": "RS",
    "BRASILIA": "DF",
    "TAGUATINGA": "DF",
    "CEILANDIA": "DF",
    "SAMAMBAIA": "DF",
    "BELO HORIZONTE": "MG",
    "UBERLANDIA": "MG",
    "CONTAGEM": "MG",
    "JUIZ DE FORA": "MG",
    "BETIM": "MG",
    "MONTES CLAROS": "MG",
    "UBERABA": "MG",
    "GOVERNADOR VALADARES": "MG",
    "IPATINGA": "MG",
    "POUSO ALEGRE": "MG",
    "EXTREMA": "MG",
    "CAMPINAS": "SP",
    "GUARULHOS": "SP",
    "OSASCO": "SP",
    "SANTO ANDRE": "SP",
    "SAO BERNARDO DO CAMPO": "SP",
    "SANTOS": "SP",
    "RIBEIRAO PRETO": "SP",
    "SOROCABA": "SP",
    "SAO JOSE DOS CAMPOS": "SP",
    "BARUERI": "SP",
    "JUNDIAI": "SP",
    "PIRACICABA": "SP",
    "MAUA": "SP",
    "CAJAMAR": "SP",
    "BAURU": "SP",
    "DIADEMA": "SP",
    "ITAQUAQUECETUBA": "SP",
    "TABOAO DA SERRA": "SP",
    "COTIA": "SP",
    "EMBU DAS ARTES": "SP",
    "SUMARE": "SP",
    "INDAIATUBA": "SP",
    "AMERICANA": "SP",
    "LIMEIRA": "SP",
    "FRANCA": "SP",
    "PRAIA GRANDE": "SP",
    "CUBATAO": "SP",
    "GUARUJA": "SP",
    "NITEROI": "RJ",
    "SAO GONCALO": "RJ",
    "DUQUE DE CAXIAS": "RJ",
    "NOVA IGUACU": "RJ",
    "CAMPOS DOS GOYTACAZES": "RJ",
    "BELFORD ROXO": "RJ",
    "VOLTA REDONDA": "RJ",
    "PETROPOLIS": "RJ",
    "MACAE": "RJ",
    "ITABORAI": "RJ",
    "RESENDE": "RJ",
    "VITORIA": "ES",
    "VILA VELHA": "ES",
    "SERRA": "ES",
    "CARIACICA": "ES",
    "CACHOEIRO DE ITAPEMIRIM": "ES",
    "LINHARES": "ES",
    "GUARAPARI": "ES",
    "ARACRUZ": "ES"
  };
  const normalizedUpper = upper.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [cityName, ufCode] of Object.entries(CITY_TO_UF)) {
    if (normalizedUpper.includes(cityName)) return ufCode;
  }
  return "";
};
var extractCityFromAddress = (address) => {
  if (!address) return "";
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
  const segments = address.split(",").map((s) => s.trim());
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
var identifyRegionFromText = (text) => {
  if (!text) return "";
  const upper = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const regions = ["SUDESTE", "SUL", "CENTRO-OESTE", "NORDESTE", "NORTE"];
  for (const region of regions) {
    if (upper.includes(region)) return region;
  }
  const uf = extractUF(text);
  if (uf && UF_TO_REGION[uf]) return UF_TO_REGION[uf];
  return "";
};
var applyRegionSuffix = (address) => {
  if (!address) return "";
  const cleanAddr = address.split("(")[0].trim();
  const uf = extractUF(cleanAddr);
  const region = UF_TO_REGION[uf];
  return region ? `${cleanAddr} (${region})` : cleanAddr;
};
var parseSafeDate = (dateInput) => {
  if (!dateInput) return null;
  try {
    if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
    let str = String(dateInput).trim();
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  } catch (e) {
    return null;
  }
};
var calculateMissionFinancials = (mission, clientTables, providerTables, clientData, currentTime = /* @__PURE__ */ new Date(), manualTableOverrides, providers) => {
  if (providers && providers.length > 0) {
    const autoRows = buildAutoMasterRowsFromProviders(providers);
    if (autoRows.length > 0) {
      providerTables = [...providerTables, ...autoRows];
    }
  }
  const providerAliasSet = /* @__PURE__ */ new Set();
  if (providers && providers.length > 0 && mission?.provider) {
    const missionProvNorm = normalize2(mission.provider);
    const match = providers.find((p) => {
      const n = normalize2(p?.name || "");
      const tn = normalize2(p?.trading_name || "");
      return n && n === missionProvNorm || tn && tn === missionProvNorm;
    });
    if (match) {
      const n = normalize2(match.name || "");
      const tn = normalize2(match.trading_name || "");
      if (n) providerAliasSet.add(n);
      if (tn) providerAliasSet.add(tn);
    }
  }
  const isTerminalStatus = ["Conclu\xEDda" /* COMPLETED */, "Cancelada" /* CANCELLED */, "Recusada" /* REFUSED */].includes(mission.status);
  const isFinished = mission.status === "Conclu\xEDda" /* COMPLETED */;
  const isCancelled = mission.status === "Cancelada" /* CANCELLED */;
  const isRefused = mission.status === "Recusada" /* REFUSED */;
  const isPending = mission.status === "Pendente" /* PENDING */;
  const cancelledWithValues = isCancelled && (safeNumber(mission.revenue_value) > 0 || safeNumber(mission.cost_value) > 0);
  const isZeroValueMission = isCancelled && !cancelledWithValues || isRefused;
  const getKm = (val) => typeof val === "number" ? val : parseFloat(String(val || "0").replace(",", "."));
  const startKm = getKm(mission.startKm || mission.start_km);
  const endKm = getKm(mission.endKm || mission.end_km);
  const hasValidKms = startKm > 0 && endKm > 0 && endKm >= startKm;
  let realTraveledKm = 0;
  if (hasValidKms) {
    realTraveledKm = endKm - startKm;
  }
  const totalDistance = safeNumber(mission.totalDistance || mission.total_distance);
  let distanceForCalculation;
  if (isFinished) {
    distanceForCalculation = hasValidKms ? realTraveledKm : totalDistance;
  } else if (isZeroValueMission) {
    distanceForCalculation = hasValidKms ? realTraveledKm : 0;
  } else {
    distanceForCalculation = totalDistance;
  }
  if (isCancelled) {
    distanceForCalculation = hasValidKms && realTraveledKm > 0 ? realTraveledKm : 0;
  }
  const getTableSelectionDistance = () => {
    if (isFinished && hasValidKms && realTraveledKm > 0) {
      return realTraveledKm;
    }
    return Math.max(totalDistance, distanceForCalculation);
  };
  const scheduledDate = parseSafeDate(mission.startTime || mission.start_time);
  const creationDate = parseSafeDate(mission.createdAt);
  let effectiveStartDate = scheduledDate || creationDate || currentTime;
  let startLabel = scheduledDate ? "Agendamento" : "Cria\xE7\xE3o";
  let endDateObj = currentTime;
  const dbEndTime = parseSafeDate(mission.endTime || mission.end_time);
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
  const cancelStatusAt = parseSafeDate(mission.cancelStatusAt || mission._cancelStatusAt);
  if (isCancelled) {
    endDateObj = cancelStatusAt && cancelStatusAt.getTime() > effectiveStartDate.getTime() ? cancelStatusAt : effectiveStartDate;
  }
  const diffMs = endDateObj.getTime() - effectiveStartDate.getTime();
  let durationHours = Math.max(0, diffMs / (1e3 * 60 * 60));
  durationHours = Math.floor(durationHours * 60) / 60;
  const cancelledWithHours = isCancelled && !!cancelStatusAt && cancelStatusAt.getTime() > effectiveStartDate.getTime();
  const cancelledBeforeExecution = isCancelled && !cancelledWithHours;
  if (isZeroValueMission && !cancelledWithHours) {
    durationHours = 0;
  }
  if (isCancelled && !cancelledWithHours) {
    durationHours = 0;
  }
  let tollValue = isZeroValueMission ? 0 : Math.max(0, safeNumber(mission.toll_value));
  const validAgents = [mission.agent1, mission.agent2].map((a) => a ? String(a).trim() : "").filter((n) => n && n !== "---" && n.toUpperCase() !== "N/A");
  const agentCount = validAgents.length || 1;
  const missionTypeRaw = (mission.mission_type || "").toUpperCase();
  const isVelada = missionTypeRaw.includes("VELADA") || (mission.vehicleData?.type || "").toUpperCase().includes("VELADA");
  const missionTypeKeyword = isVelada ? "VELADA" : "CARACTERIZADA";
  const clientMultiplier = 1;
  const missionProviderName = normalize2(mission.provider);
  const isSpecialProvider = missionProviderName.includes("ATIVA") || missionProviderName.includes("TM SEG");
  const isProviderMacor = missionProviderName.includes("MACOR");
  let providerMultiplier = 1;
  const selectStrictTable = (candidateTables, dist, region, city, typeKeyword, destCity2, routeCode, agentAware, originUFCode, originAddress) => {
    if (!candidateTables || candidateTables.length === 0) return { table: null, log: "Sem tabelas cadastradas" };
    const normalizedRegion = normalize2(region);
    const normalizedCity = normalize2(city);
    const normalizedDestCity = normalize2(destCity2);
    const normalizedType = normalize2(typeKeyword);
    const normalizedRouteCode = normalize2(routeCode);
    const normalizedOriginAddr = normalize2(originAddress);
    const ufCode = (originUFCode || "").toUpperCase();
    const isVeladaMission = normalizedType.includes("VELADA");
    const isCaracterizadaMission = normalizedType.includes("CARACTERIZADA");
    const scoredTables = candidateTables.map((t) => {
      const tableOp = normalize2(t.operation_type || "");
      let score = 0;
      let matchType = "Gen\xE9rico";
      const isArmadoTable = tableOp.includes("ARMADO") || tableOp.includes("ARMADOS") || tableOp.includes("PRONTA RESPOSTA");
      const isFranchiseKmTableName = tableOp.includes("ATE ") || tableOp.includes("ATE") || tableOp.includes("FAIXA");
      if (isVeladaMission) {
        if (isFranchiseKmTableName && !isArmadoTable) {
          score -= 5e3;
          matchType = "Velada n\xE3o usa faixa KM";
        }
        if (tableOp.includes("CARACTERIZADA") && !tableOp.includes("VELADA")) {
          score -= 5e3;
          matchType = "Tipo Incompat\xEDvel (CARACTERIZADA)";
        }
        if (isArmadoTable) {
          score += 3e3;
          matchType = "Tabela Armado (Velada)";
        }
        if (tableOp.includes("VELADA")) {
          score += 2500;
          matchType = "Tipo: VELADA";
        }
      }
      if (isCaracterizadaMission) {
        if (isArmadoTable && !isFranchiseKmTableName) {
          score -= 3e3;
          matchType = "Caracterizada usa faixa KM";
        }
        if (tableOp.includes("VELADA") && !tableOp.includes("CARACTERIZADA")) {
          score -= 5e3;
          matchType = "Tipo Incompat\xEDvel (VELADA)";
        }
        if (tableOp.includes("CARACTERIZADA")) {
          score += 2500;
          matchType = "Tipo: CARACTERIZADA";
        }
      }
      if (agentAware && agentAware.isSpecial) {
        const isTable02 = tableOp.includes("02 ARMADO") || tableOp.includes("02 ARMADOS") || tableOp.includes("DOIS ARMADO");
        const isTable01 = (tableOp.includes("01 ARMADO") || tableOp.includes("01 AGENTE") || tableOp.includes("01 PRONTA") || tableOp.includes("PRONTA RESPOSTA") && !isTable02) && !isTable02;
        if (agentAware.count >= 2) {
          if (isTable02) {
            score += 3e3;
            matchType = "02 Agentes (Tabela Dupla)";
          } else if (isTable01) {
            score -= 2e3;
          }
        } else {
          if (isTable01) {
            score += 3e3;
            matchType = "01 Agente (Pronta Resposta)";
          } else if (isTable02) {
            score -= 2e3;
          }
        }
      }
      if (normalizedRouteCode && tableOp.includes(normalizedRouteCode)) {
        score += 5e3;
        matchType = `C\xF3digo da Rota (${routeCode})`;
      } else if (normalizedCity.length > 3 && normalizedDestCity.length > 3 && tableOp.includes(normalizedCity) && tableOp.includes(normalizedDestCity)) {
        score += 5e3;
        matchType = `Rota Exata (${city} x ${destCity2})`;
      } else if (normalizedCity.length > 3 && tableOp.includes(normalizedCity)) {
        score += 2e3;
        matchType = `Cidade Origem (${city})`;
      } else if (normalizedOriginAddr && normalizedCity.length <= 3) {
        const cityNames = normalizedOriginAddr.split(/[,\-–]/).map((s) => s.trim()).filter((s) => s.length > 3 && !/^\d/.test(s));
        for (const cn of cityNames) {
          if (tableOp.includes(cn)) {
            score += 2e3;
            matchType = `Cidade Endere\xE7o (${cn})`;
            break;
          }
        }
      }
      if (tableOp.includes("EXCETO")) {
        if (ufCode === "MG" && tableOp.includes("EXCETO MG")) {
          score -= 5e3;
          matchType = "Bloqueado (EXCETO MG)";
        } else if (ufCode === "ES") {
          const excetoIdx = tableOp.indexOf("EXCETO");
          const afterExceto = tableOp.substring(excetoIdx);
          if (afterExceto.includes("MG") && afterExceto.includes("ES")) {
            score -= 5e3;
            matchType = "Bloqueado (EXCETO ES)";
          }
        }
      }
      if (ufCode && (ufCode === "MG" || ufCode === "ES")) {
        if (tableOp.includes("MG") && tableOp.includes("ES") && !tableOp.includes("EXCETO")) {
          score += 1500;
          matchType = `UF Espec\xEDfico MG/ES (${ufCode})`;
        }
      }
      if (score < 2e3) {
        if (ufCode && ufCode.length === 2) {
          const ufInOp = tableOp.match(/\b(SP|RJ|MG|ES|PR|SC|RS|BA|PE|CE|RN|PB|AL|SE|PI|MA|AM|PA|AC|RO|RR|AP|TO|DF|GO|MT|MS)\b/g);
          if (ufInOp && ufInOp.includes(ufCode) && !tableOp.includes("EXCETO")) {
            score += 1200;
            if (matchType === "Gen\xE9rico") matchType = `UF (${ufCode})`;
          }
        }
        if (normalizedRegion && tableOp.includes(normalizedRegion)) {
          if (!tableOp.includes("EXCETO")) {
            score += 800;
            if (matchType === "Gen\xE9rico") matchType = `Regi\xE3o (${region})`;
          }
        } else if (normalizedRegion === "SUDESTE") {
          if (ufCode === "SP" && (tableOp.includes("SP") || tableOp.includes("SAO PAULO"))) {
            score += 600;
            if (matchType === "Gen\xE9rico") matchType = "Estado (SP)";
          } else if (ufCode === "RJ" && (tableOp.includes("RJ") || tableOp.includes("RIO DE JANEIRO"))) {
            score += 600;
            if (matchType === "Gen\xE9rico") matchType = "Estado (RJ)";
          }
        }
      }
      const isNivelBrasil = tableOp.includes("NIVEL BRASIL") || tableOp.includes("BRASIL");
      const isRegionalTable = tableOp.includes("SUDESTE") || tableOp.includes("SUL") || tableOp.includes("CENTRO") || tableOp.includes("NORDESTE") || tableOp.includes("NORTE");
      if (isRegionalTable && score >= 800 && isNivelBrasil) {
        score -= 100;
      }
      const isFranchiseKmTable = tableOp.includes("ATE ") || tableOp.includes("ATE") || tableOp.includes("FAIXA");
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
    const validCandidates = scoredTables.filter((t) => t.score > -1e3).sort((a, b) => b.score - a.score);
    if (validCandidates.length === 0) return { table: null, log: "Bloqueio Regional Ativo" };
    const topScore = validCandidates[0].score;
    const bestGroup = validCandidates.filter((t) => t.score >= topScore - 20);
    const isFranchiseName = (name) => {
      const n = (name || "").toUpperCase();
      return n.includes("AT\xC9") || n.includes("ATE ") || n.includes("FAIXA") || /\bATE\W*\d/i.test(n);
    };
    const franchiseTables = bestGroup.filter((t) => isFranchiseName(t.operation_type || ""));
    if (franchiseTables.length > 0) {
      const coveringFranchise = franchiseTables.filter((t) => t.franchise_km >= dist).sort((a, b) => a.franchise_km - b.franchise_km);
      if (coveringFranchise.length > 0) {
        return { table: coveringFranchise[0], log: `Faixa KM (${coveringFranchise[0].matchType})` };
      }
      const largest = [...franchiseTables].sort((a, b) => b.franchise_km - a.franchise_km);
      return { table: largest[0], log: `Faixa KM M\xE1x (${largest[0].matchType})` };
    }
    const sortedByKm = bestGroup.sort((a, b) => a.franchise_km - b.franchise_km);
    const exactCover = sortedByKm.find((t) => t.franchise_km >= dist);
    const bestTable = exactCover || sortedByKm[sortedByKm.length - 1];
    return { table: bestTable, log: `${bestTable.matchType}` };
  };
  const originUF = extractUF(mission.origin || "");
  const detectedRegion = UF_TO_REGION[originUF] || "";
  const originCity = extractCityFromAddress(mission.origin || "");
  const destCity = extractCityFromAddress(mission.destination || "");
  const missionClientName = normalize2(mission.originalClientName || mission.client);
  const missionRouteCode = mission.route_code || mission.code;
  let appliedClientTable = null;
  let clientLog = "Manual";
  const missionClientRaw = String(mission.originalClientName || mission.client || "");
  const allClientTablesForThisClient = clientTables.filter(
    (t) => clientTableMatchesMission(t.client || "", missionClientRaw)
  );
  const isIblClient = missionClientName.includes("IBL") || missionClientName.includes("INTERMODAL BRASIL");
  let clientTablesFiltered = allClientTablesForThisClient;
  if (!isProviderMacor) {
    clientTablesFiltered = allClientTablesForThisClient.filter((t) => !normalize2(t.operation_type || "").includes("MACOR"));
  } else {
    const macorTables = allClientTablesForThisClient.filter((t) => normalize2(t.operation_type || "").includes("MACOR"));
    if (macorTables.length > 0) {
      clientTablesFiltered = macorTables;
    }
  }
  let isManualOverride = false;
  if (manualTableOverrides?.clientTableId) {
    const manualTable = clientTables.find((t) => t.id.toString() === manualTableOverrides.clientTableId);
    const manualTableOp = (manualTable?.operation_type || "").toUpperCase();
    const regionNames = ["SUDESTE", "SUL", "CENTRO-OESTE", "NORDESTE", "NORTE"];
    const manualTableRegion = regionNames.find((r) => manualTableOp.includes(r)) || "";
    const regionOk = !manualTableRegion || !detectedRegion || manualTableRegion === detectedRegion.toUpperCase();
    if (regionOk) {
      appliedClientTable = manualTable;
      clientLog = "Sele\xE7\xE3o Manual / Mem\xF3ria";
      isManualOverride = true;
    }
  }
  let dhlEngineHandled = false;
  if (!appliedClientTable && isCancelled && clientTablesFiltered.length > 0) {
    const region = String(detectedRegion || "").toUpperCase();
    const isAutoMaster = (op) => (op || "").toUpperCase().includes("__AUTO_MASTER__");
    const withKm = clientTablesFiltered.filter(
      (t) => (t.franchise_km || 0) > 0 && (t.activation_fee || 0) > 0 && !isAutoMaster(t.operation_type || "")
    );
    if (withKm.length > 0) {
      const sorted = [...withKm].sort((a, b) => {
        const km = (a.franchise_km || 0) - (b.franchise_km || 0);
        if (km !== 0) return km;
        const aRegion = region && (a.operation_type || "").toUpperCase().includes(region) ? 0 : 1;
        const bRegion = region && (b.operation_type || "").toUpperCase().includes(region) ? 0 : 1;
        if (aRegion !== bRegion) return aRegion - bRegion;
        return (a.activation_fee || 0) - (b.activation_fee || 0);
      });
      appliedClientTable = sorted[0];
      clientLog = `Cancelada \u2192 Menor Faixa KM (${appliedClientTable?.operation_type}, ${appliedClientTable?.franchise_km}km)`;
    } else {
      const sorted = [...clientTablesFiltered].filter((t) => (t.activation_fee || 0) > 0 && !isAutoMaster(t.operation_type || "")).sort((a, b) => (a.activation_fee || 0) - (b.activation_fee || 0));
      appliedClientTable = sorted.length > 0 ? sorted[0] : clientTablesFiltered[0];
      clientLog = `Cancelada \u2192 Menor Acionamento (${appliedClientTable?.operation_type})`;
    }
    dhlEngineHandled = true;
  }
  const dhlClientCanonical = !appliedClientTable && !isManualOverride && !isCancelled ? findDhlAutoClient(missionClientName) : null;
  if (dhlClientCanonical) {
    const dhlResult = selectDhlClientTable(
      clientTablesFiltered,
      { origin: mission.origin || "", destination: mission.destination || "" },
      getTableSelectionDistance(),
      { clientName: dhlClientCanonical }
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
    const clientDistReference = getTableSelectionDistance();
    const result = selectStrictTable(
      clientTablesFiltered,
      clientDistReference,
      detectedRegion,
      originCity,
      missionTypeKeyword,
      destCity,
      missionRouteCode,
      isSpecialProvider ? { count: agentCount, isSpecial: true } : void 0,
      originUF,
      mission.origin || ""
    );
    appliedClientTable = result.table;
    clientLog = result.log;
    const isFranchiseN = (name) => {
      const n = (name || "").toUpperCase();
      return n.includes("AT\xC9") || n.includes("ATE ") || n.includes("FAIXA") || /\bATE\W*\d/i.test(n);
    };
    if (appliedClientTable && !isFranchiseN(appliedClientTable.operation_type || "")) {
      const selectedFranchiseKm = appliedClientTable.franchise_km || 0;
      if (selectedFranchiseKm > clientDistReference * 3 && clientDistReference > 0) {
        const franchiseCandidates = clientTablesFiltered.filter((t) => {
          if (!isFranchiseN(t.operation_type || "")) return false;
          if ((t.franchise_km || 0) < clientDistReference) return false;
          const op = normalize2(t.operation_type || "");
          if (op.includes("EXCETO")) {
            if (originUF === "MG" && op.includes("EXCETO MG")) return false;
            if (originUF === "ES" && op.includes("EXCETO MG") && op.includes("ES")) return false;
          }
          return true;
        });
        if (franchiseCandidates.length > 0) {
          const bestFranchise = franchiseCandidates.sort((a, b) => (a.franchise_km || 0) - (b.franchise_km || 0))[0];
          appliedClientTable = bestFranchise;
          clientLog = `Faixa KM Corrigida \u2192 ${bestFranchise.operation_type}`;
        }
      }
    }
  }
  const isCevaClient = missionClientName.includes("CEVA");
  const normalizedOrigin = normalize2(mission.origin || "");
  const normalizedDest = normalize2(mission.destination || "");
  const isJundiai = normalizedOrigin.includes("JUNDIAI");
  const destHas200km = normalizedDest.includes("200KM") || normalizedDest.includes("200 KM") || normalizedDest.includes("ACOMPANHAMENTO");
  const referenceDistance = getTableSelectionDistance();
  let is200kmAccompaniment = destHas200km && !isZeroValueMission;
  const cevaLogitech = isCevaClient && (isJundiai || destHas200km);
  let cevaTablesPool = allClientTablesForThisClient;
  if (isCevaClient && cevaTablesPool.length === 0) {
    cevaTablesPool = clientTables.filter((t) => normalize2(t.client || "").includes("CEVA"));
  }
  if (cevaLogitech && !cancelledBeforeExecution && !isManualOverride && cevaTablesPool.length > 0) {
    const logitech200 = cevaTablesPool.find((t) => {
      const op = normalize2(t.operation_type || "");
      return (op.includes("LOGITECH") || op.includes("200KM") || op.includes("200 KM")) && t.franchise_km >= 200;
    });
    if (logitech200) {
      appliedClientTable = logitech200;
      clientLog = `REGRA LOGITECH SOBERANA: CEVA Jundia\xED \u2192 ${logitech200.operation_type} (KM real ignorado)`;
      is200kmAccompaniment = true;
    }
  }
  const isCeslogClient = missionClientName.includes("CESLOG") || missionClientName.includes("CESARI");
  const normalizedOriginCity = normalize2(originCity);
  const normalizedDestCity2 = normalize2(destCity);
  const isCubataoSantos = normalizedOriginCity.includes("CUBATAO") && normalizedDestCity2.includes("SANTOS") || normalizedOriginCity.includes("SANTOS") && normalizedDestCity2.includes("CUBATAO");
  if (isCeslogClient && isCubataoSantos && !cancelledBeforeExecution && !isManualOverride) {
    const cubSantosTable = allClientTablesForThisClient.find((t) => {
      const op = normalize2(t.operation_type || "");
      return op.includes("CUBATAO") && op.includes("SANTOS") && !op.includes("PRONTA RESPOSTA") && !op.includes("PRONTA");
    });
    if (cubSantosTable) {
      appliedClientTable = cubSantosTable;
      clientLog = `CESLOG Rota Fixa \u2192 ${cubSantosTable.operation_type}`;
    }
  }
  let appliedProviderTable = null;
  let providerLog = "Manual";
  const providerTablesNoMaster = providerTables.filter((t) => !isAutoMasterRow(t));
  const matchesProviderAlias = (tProv) => {
    if (!tProv) return false;
    if (tProv === missionProviderName) return true;
    if (providerAliasSet.size > 0 && providerAliasSet.has(tProv)) return true;
    return false;
  };
  const autoMasterRows = providerTables.filter((t) => matchesProviderAlias(normalize2(t.provider)) && isAutoMasterRow(t));
  const autoMasterConfig = extractAutoMasterConfig(autoMasterRows);
  const autoRegionFilter = (autoMasterConfig?.region || "").toString().toUpperCase().trim();
  const originUFUpper = String(originUF || "").toUpperCase().trim();
  const missionRegionUpper = String(detectedRegion || "").toUpperCase().trim();
  const filterIsUF = autoRegionFilter.length === 2 && !!UF_TO_REGION[autoRegionFilter];
  const autoRegionMatches = !autoRegionFilter || (filterIsUF ? !!originUFUpper && autoRegionFilter === originUFUpper : !!missionRegionUpper && autoRegionFilter === missionRegionUpper);
  const effectiveProviderTableId = manualTableOverrides?.providerTableId && !String(manualTableOverrides.providerTableId).startsWith("auto-") ? manualTableOverrides.providerTableId : void 0;
  const hasManualProviderOverride = !!effectiveProviderTableId;
  const autoEngineActive = !!autoMasterConfig && !mission.is_same_os && !isZeroValueMission && !isCancelled && autoRegionMatches && !hasManualProviderOverride;
  let filteredProviderTables = autoEngineActive ? [] : providerTablesNoMaster.filter((t) => matchesProviderAlias(normalize2(t.provider)));
  if (filteredProviderTables.length === 0 && missionProviderName.length > 2) {
    filteredProviderTables = providerTablesNoMaster.filter((t) => {
      const tProv = normalize2(t.provider);
      if (tProv.length <= 2) return false;
      if (tProv.includes(missionProviderName) || missionProviderName.includes(tProv)) return true;
      for (const alias of providerAliasSet) {
        if (alias.length > 2 && (tProv.includes(alias) || alias.includes(tProv))) return true;
      }
      return false;
    });
  }
  if (filteredProviderTables.length === 0 && missionProviderName.length > 3) {
    const providerWords = missionProviderName.split(/\s+/).filter((w) => w.length > 2);
    if (providerWords.length > 0) {
      filteredProviderTables = providerTablesNoMaster.filter((t) => {
        const tProv = normalize2(t.provider);
        return providerWords.some((w) => tProv.includes(w)) && tProv.length > 2;
      });
    }
  }
  const providerDistReference = manualTableOverrides?.providerOpsOverride ? manualTableOverrides.providerOpsOverride.distanceKm : getTableSelectionDistance();
  if (effectiveProviderTableId) {
    appliedProviderTable = providerTables.find((t) => t.id.toString() === effectiveProviderTableId);
    providerLog = "Sele\xE7\xE3o Manual / Mem\xF3ria";
  } else if (isCancelled && filteredProviderTables.length > 0) {
    const withKm = filteredProviderTables.filter((t) => (t.franchise_km || 0) > 0 && (t.activation_cost || 0) > 0);
    if (withKm.length > 0) {
      const sorted = [...withKm].sort((a, b) => {
        const km = (a.franchise_km || 0) - (b.franchise_km || 0);
        if (km !== 0) return km;
        return (a.activation_cost || 0) - (b.activation_cost || 0);
      });
      appliedProviderTable = sorted[0];
      providerLog = `Cancelada \u2192 Menor Faixa KM (${appliedProviderTable?.operation_type}, ${appliedProviderTable?.franchise_km}km)`;
    } else {
      const sorted = [...filteredProviderTables].filter((t) => (t.activation_cost || 0) > 0).sort((a, b) => (a.activation_cost || 0) - (b.activation_cost || 0));
      appliedProviderTable = sorted.length > 0 ? sorted[0] : filteredProviderTables[0];
      providerLog = `Cancelada \u2192 Menor Custo (${appliedProviderTable?.operation_type})`;
    }
  } else if (isSpecialProvider && filteredProviderTables.length > 0) {
    const prontaResposta = filteredProviderTables.filter((t) => {
      const op = normalize2(t.operation_type || "");
      return op.includes("PRONTA RESPOSTA") || op.includes("PRONTA");
    });
    if (prontaResposta.length > 0) {
      let bestPR = null;
      if (agentCount >= 2) {
        bestPR = prontaResposta.find((t) => {
          const op = normalize2(t.operation_type || "");
          return op.includes("02") || op.includes("DOIS");
        });
      }
      if (!bestPR) {
        bestPR = prontaResposta.find((t) => {
          const op = normalize2(t.operation_type || "");
          return op.includes("01") || !op.includes("02") && !op.includes("DOIS");
        });
      }
      if (bestPR) {
        appliedProviderTable = bestPR;
        providerLog = `${agentCount >= 2 ? "02" : "01"} Agente \u2192 ${bestPR.operation_type}`;
      }
    }
    if (!appliedProviderTable) {
      const result = selectStrictTable(
        filteredProviderTables,
        providerDistReference,
        detectedRegion,
        originCity,
        missionTypeKeyword,
        destCity,
        missionRouteCode,
        { count: agentCount, isSpecial: true },
        originUF,
        mission.origin || ""
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
      mission.origin || ""
    );
    appliedProviderTable = result.table;
    providerLog = result.log;
  }
  if (isCeslogClient && isCubataoSantos && !cancelledBeforeExecution && !effectiveProviderTableId) {
    const allProvForRoute = providerTables.filter((t) => {
      const op = normalize2(t.operation_type || "");
      return op.includes("CUBATAO") && op.includes("SANTOS") && !op.includes("PRONTA");
    });
    if (allProvForRoute.length > 0) {
      appliedProviderTable = allProvForRoute[0];
      providerLog = `CESLOG Rota Fixa \u2192 ${allProvForRoute[0].operation_type}`;
    }
  }
  if (!effectiveProviderTableId && appliedProviderTable && filteredProviderTables.length > 1) {
    const appliedOp = normalize2(appliedProviderTable.operation_type || "");
    const appliedIs200 = appliedOp.includes("200KM") || appliedOp.includes("200 KM") || appliedOp.includes("ATE 200") || appliedProviderTable.franchise_km >= 200;
    if (appliedIs200 && providerDistReference <= 200) {
      const table100Fallback = filteredProviderTables.find((t) => {
        const op = normalize2(t.operation_type || "");
        const tFr = t.franchise_km || 0;
        return tFr >= 100 && tFr < 200 && (op.includes("100KM") || op.includes("100 KM") || op.includes("ATE 100") || tFr === 100);
      });
      if (table100Fallback) {
        appliedProviderTable = table100Fallback;
        providerLog = `KM \u2264200 \u2192 Tabela 100KM (${table100Fallback.operation_type})`;
      }
    }
  }
  if (is200kmAccompaniment && !cancelledBeforeExecution && !effectiveProviderTableId && filteredProviderTables.length > 0) {
    const provider200 = filteredProviderTables.find((t) => {
      const op = normalize2(t.operation_type || "");
      return (op.includes("ATE 200") || op.includes("200 KM") || op.includes("200KM")) && t.franchise_km >= 200 && t.franchise_km <= 200;
    });
    if (provider200) {
      appliedProviderTable = provider200;
      providerLog = `Regra 200KM Acompanhamento \u2192 ${provider200.operation_type}`;
    }
  }
  let logitech200ProviderApplied = false;
  if (is200kmAccompaniment && !cancelledBeforeExecution && !effectiveProviderTableId) {
    const candidatePool = providerTablesNoMaster.filter((t) => {
      const tProv = normalize2(t.provider);
      if (matchesProviderAlias(tProv)) return true;
      if (tProv.length > 2 && missionProviderName.length > 2 && (tProv.includes(missionProviderName) || missionProviderName.includes(tProv))) return true;
      for (const alias of providerAliasSet) {
        if (alias.length > 2 && (tProv.includes(alias) || alias.includes(tProv))) return true;
      }
      return false;
    });
    const region = String(detectedRegion || "").toUpperCase();
    const is200Km = (t) => {
      const op = normalize2(t.operation_type || "");
      return op.includes("200KM") || op.includes("200 KM") || op.includes("ATE 200") || Number(t.franchise_km) >= 200 && Number(t.franchise_km) <= 200;
    };
    let prov200 = region ? candidatePool.find((t) => {
      const op = normalize2(t.operation_type || "");
      return is200Km(t) && op.includes(region);
    }) : null;
    if (!prov200) prov200 = candidatePool.find((t) => is200Km(t));
    if (prov200) {
      appliedProviderTable = prov200;
      providerLog = `REGRA 200KM SOBERANA \u2192 ${prov200.operation_type}${region ? " [" + region + "]" : ""} (motor auto ignorado)`;
      logitech200ProviderApplied = true;
    }
  }
  let autoBreakdown = null;
  if (autoEngineActive && autoMasterConfig && !logitech200ProviderApplied) {
    const realKmForAuto = cancelledBeforeExecution ? 0 : manualTableOverrides?.providerOpsOverride ? manualTableOverrides.providerOpsOverride.distanceKm : getTableSelectionDistance();
    const goldenStart = cancelledBeforeExecution ? null : mission.provider_start_time || mission.startTime || mission.start_time;
    const goldenScheduled = cancelledBeforeExecution ? null : mission.startTime || mission.start_time;
    const goldenEnd = cancelledBeforeExecution ? null : mission.provider_end_time || mission.endTime || mission.end_time;
    autoBreakdown = calculateProviderCostAuto(
      realKmForAuto,
      autoMasterConfig,
      goldenScheduled,
      goldenStart,
      goldenEnd
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
      cancellation_fee: 0
    };
    providerLog = `Motor Auto \u2192 Faixa ${autoBreakdown.bandKm}KM (${autoBreakdown.bandHours}h)`;
  }
  const cBase = isRefused ? 0 : manualTableOverrides?.customClientBase !== void 0 ? manualTableOverrides.customClientBase : Math.max(0, (appliedClientTable?.activation_fee || 0) * clientMultiplier);
  const cFranchiseKm = appliedClientTable?.franchise_km || 100;
  const cFranchiseHr = appliedClientTable?.franchise_hours || 3;
  let cExcessKm = Math.max(0, distanceForCalculation - cFranchiseKm);
  let cExcessHr = Math.max(0, durationHours - cFranchiseHr);
  let cUnitPriceKm = manualTableOverrides?.customClientUnitKm !== void 0 ? manualTableOverrides.customClientUnitKm : appliedClientTable?.price_per_extra_km || 0;
  if (cUnitPriceKm <= 0 && findDhlAutoClient(missionClientRaw) && manualTableOverrides?.customClientUnitKm === void 0) {
    cUnitPriceKm = dhlDefaultUnitKmExcess(originUF);
  }
  const cUnitPriceHour = manualTableOverrides?.customClientUnitHour !== void 0 ? manualTableOverrides.customClientUnitHour : appliedClientTable?.price_per_extra_hour || 0;
  const appliedTableName = (appliedClientTable?.operation_type || "").toUpperCase();
  const missionDest = (mission.destination || "").toUpperCase();
  const isFranchiseTable = (name) => name.includes("AT\xC9") || name.includes("ATE ") || name.includes("FAIXA") || /\bATE\W*\d/i.test(name);
  const clientHasExtraKmPrice = (appliedClientTable?.price_per_extra_km || 0) > 0 || (manualTableOverrides?.customClientUnitKm || 0) > 0 || findDhlAutoClient(missionClientRaw) && cUnitPriceKm > 0;
  const clientTableIs200km = appliedTableName.includes("200KM") || appliedTableName.includes("200 KM") || appliedTableName.includes("LOGITECH") || missionDest.includes("200KM");
  const clientTableIs100km = appliedTableName.includes("100KM") || appliedTableName.includes("100 KM");
  const isFixedDistanceClientRule = (clientTableIs200km || clientTableIs100km) && !isFranchiseTable(appliedTableName) && !clientHasExtraKmPrice;
  const clientHasExtraHrPrice = (appliedClientTable?.price_per_extra_hour || 0) > 0 || (manualTableOverrides?.customClientUnitHour || 0) > 0;
  const isVtcClient = missionClientName.includes("VTC");
  const isFixedHoursClientRule = !clientHasExtraHrPrice && (appliedTableName.includes("02H") || appliedTableName.includes("02 HORAS") || isVtcClient && (missionDest.includes("02 HORAS") || missionDest.includes("02H")));
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
  const providerTableName = (appliedProviderTable?.operation_type || "").toUpperCase();
  const providerHasExtraKmCost = (appliedProviderTable?.cost_per_extra_km || 0) > 0 || (manualTableOverrides?.customProviderUnitKm || 0) > 0;
  const providerTableIs200km = providerTableName.includes("200KM") || providerTableName.includes("200 KM") || providerTableName.includes("LOGITECH");
  const providerTableIs100km = providerTableName.includes("100KM") || providerTableName.includes("100 KM");
  const isFixedDistanceProviderRule = (providerTableIs200km || providerTableIs100km) && !isFranchiseTable(providerTableName) && !providerHasExtraKmCost;
  const providerHasExtraHrCost = (appliedProviderTable?.cost_per_extra_hour || 0) > 0 || (manualTableOverrides?.customProviderUnitHour || 0) > 0;
  const isFixedHoursProviderRule = !providerHasExtraHrCost && (providerTableName.includes("02H") || providerTableName.includes("02 HORAS"));
  let providerDistForCalc = manualTableOverrides?.providerOpsOverride ? manualTableOverrides.providerOpsOverride.distanceKm : originalDistanceForCalc;
  let providerDurationForCalc = manualTableOverrides?.providerOpsOverride ? manualTableOverrides.providerOpsOverride.durationHours : originalDurationHours;
  if (is200kmAccompaniment && !isZeroValueMission && !manualTableOverrides?.disableFixedKmRule) {
    providerDistForCalc = Math.min(providerDistForCalc, 200);
  }
  if (autoEngineActive && autoBreakdown) {
    providerDurationForCalc = autoBreakdown.durationHours;
    providerDistForCalc = autoBreakdown.realKm;
  }
  const rawBaseCost = appliedProviderTable?.activation_cost || 0;
  const pBase = isRefused ? 0 : manualTableOverrides?.customProviderBase !== void 0 ? manualTableOverrides.customProviderBase : mission.is_same_os ? 0 : Math.max(0, rawBaseCost * providerMultiplier);
  const pFranchiseKm = appliedProviderTable?.franchise_km || 100;
  const pFranchiseHr = appliedProviderTable?.franchise_hours || 3;
  if (isFixedDistanceProviderRule && !isZeroValueMission && !manualTableOverrides?.disableFixedKmRule) {
    providerDistForCalc = Math.min(providerDistForCalc, pFranchiseKm);
  }
  if (isFixedHoursProviderRule && !isZeroValueMission) {
    providerDurationForCalc = Math.min(providerDurationForCalc, pFranchiseHr);
  }
  let pExcessKm = mission.is_same_os ? 0 : Math.max(0, providerDistForCalc - pFranchiseKm);
  let pExcessHr = mission.is_same_os ? 0 : Math.max(0, providerDurationForCalc - pFranchiseHr);
  if (!mission.is_same_os && !isZeroValueMission && !is200kmAccompaniment && providerHasExtraKmCost && pExcessKm === 0) {
    const rawDist = manualTableOverrides?.providerOpsOverride ? manualTableOverrides.providerOpsOverride.distanceKm : originalDistanceForCalc;
    if (rawDist > pFranchiseKm) {
      pExcessKm = Math.max(0, rawDist - pFranchiseKm);
    }
  }
  const pUnitCostKm = manualTableOverrides?.customProviderUnitKm !== void 0 ? manualTableOverrides.customProviderUnitKm : appliedProviderTable?.cost_per_extra_km || 0;
  const pUnitCostHour = manualTableOverrides?.customProviderUnitHour !== void 0 ? manualTableOverrides.customProviderUnitHour : appliedProviderTable?.cost_per_extra_hour || 0;
  const cExcessHrReal = cExcessHr;
  const pExcessHrReal = pExcessHr;
  const applyRoundingRule = (hours) => {
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
  const round2 = (v) => Math.round(v * 100) / 100;
  const effectiveDistanceForMinRule = Math.max(distanceForCalculation, totalDistance);
  const isMinimumActivationRule = !isZeroValueMission && effectiveDistanceForMinRule <= 200 && durationHours <= 2 && cFranchiseKm >= 200 && pFranchiseKm >= 200;
  if (isMinimumActivationRule) {
    cExcessKm = 0;
    cExcessHr = 0;
    pExcessKm = 0;
    pExcessHr = 0;
  }
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
  const isLogitechTable = appliedTableName.includes("LOGITECH");
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
        baseActivationValue: autoMasterConfig.baseActivationValue,
        baseKmAllowance: autoMasterConfig.baseKmAllowance,
        baseHourAllowance: autoMasterConfig.baseHourAllowance,
        extraKmValue: autoMasterConfig.extraKmValue,
        extraHourValue: autoMasterConfig.extraHourValue
      }
    } : void 0,
    realTraveledKm,
    durationHours,
    tollValue,
    isCompleted: isFinished,
    hasValidKms,
    clientMult: clientMultiplier,
    providerMult: providerMultiplier,
    agentCount,
    hasTwoAgentsOnMission: agentCount === 2,
    regionConflict: false,
    detectedRegion,
    autoCorrected: !manualTableOverrides,
    calculationMemory: isMinimumActivationRule ? "Acionamento M\xEDnimo (\u2264200km/\u22642h)" : isVelada ? "Regra Velada" : "Regra Padr\xE3o",
    iblFee,
    effectiveStartLabel: startLabel,
    isMinimumActivationRule,
    hasClientTable: !!appliedClientTable,
    hasProviderTable: !!appliedProviderTable,
    client: {
      total: totalRevenue,
      serviceTotal: clientServiceTotal,
      base: cBase,
      extraKmVal: cExtraKmVal,
      extraHrVal: cExtraHrVal,
      excessKm: cExcessKm,
      excessHours: cExcessHr,
      excessHoursReal: cExcessHrReal,
      unitPriceKm: cUnitPriceKm,
      unitPriceHour: cUnitPriceHour,
      franchiseKm: cFranchiseKm,
      franchiseHours: cFranchiseHr,
      usedSpecialRule: isFixedDistanceClientRule && !manualTableOverrides?.disableFixedKmRule || isFixedHoursClientRule,
      tableName: appliedClientTable?.operation_type,
      tableId: appliedClientTable?.id.toString(),
      detectionLog: clientLog
    },
    provider: {
      total: totalCost,
      serviceTotal: providerServiceTotal,
      base: pBase,
      extraKmVal: pExtraKmVal,
      extraHrVal: pExtraHrVal,
      excessKm: pExcessKm,
      excessHours: pExcessHr,
      excessHoursReal: pExcessHrReal,
      unitCostKm: pUnitCostKm,
      unitCostHour: pUnitCostHour,
      franchiseKm: pFranchiseKm,
      franchiseHours: pFranchiseHr,
      tableName: appliedProviderTable?.operation_type,
      tableId: appliedProviderTable?.id.toString(),
      usedSpecialRule: isFixedDistanceProviderRule && !manualTableOverrides?.disableFixedKmRule || isFixedHoursProviderRule,
      detectionLog: providerLog
    },
    profit: totalRevenue - totalCost,
    marginPercent: totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue * 100 : 0
  };
};
var auditMissionFinancials = (mission, clientTables, providerTables, clientData, tolerance = 5, providers) => {
  const m = mission;
  const dispVal = safeNumber(m.displacement_value);
  const dispProvVal = safeNumber(m.displacement_value_provider);
  const hasManualOverride = !!m.revenue_edit_reason || !!m.cost_edit_reason || !!m.snapshot_approved_by;
  if (hasManualOverride) {
    const storedRev = safeNumber(mission.revenue_value) + safeNumber(mission.toll_value) + dispVal;
    const storedCst = safeNumber(mission.cost_value) + safeNumber(mission.toll_value_provider != null ? mission.toll_value_provider : mission.toll_value) + dispProvVal;
    return {
      missionId: mission.id || "",
      client: mission.client || "",
      storedRevenue: storedRev,
      calculatedRevenue: storedRev,
      storedCost: storedCst,
      calculatedCost: storedCst,
      revenueDiff: 0,
      costDiff: 0,
      isInconsistent: false,
      reason: ""
    };
  }
  const fin = calculateMissionFinancials(mission, clientTables, providerTables, clientData, /* @__PURE__ */ new Date(), void 0, providers);
  const isSameOs = !!mission.is_same_os;
  const storedRevenue = safeNumber(mission.revenue_value) + safeNumber(mission.toll_value) + dispVal;
  const storedCost = isSameOs ? 0 : safeNumber(mission.cost_value) + safeNumber(mission.toll_value_provider != null ? mission.toll_value_provider : mission.toll_value) + dispProvVal;
  const calculatedRevenue = fin.client.total + dispVal;
  const calculatedCost = isSameOs ? 0 : fin.provider.total + dispProvVal;
  const revenueDiff = Math.abs(storedRevenue - calculatedRevenue);
  const costDiff = Math.abs(storedCost - calculatedCost);
  const hasStoredValues = storedRevenue > 0 || storedCost > 0;
  const userVerified = !!mission.billing_verified_by;
  const isInconsistent = hasStoredValues && !userVerified && (revenueDiff > tolerance || costDiff > tolerance);
  let reason = "";
  if (isInconsistent) {
    const reasons = [];
    if (revenueDiff > tolerance) reasons.push(`Receita: salvo R$${storedRevenue.toFixed(2)} vs tabela R$${calculatedRevenue.toFixed(2)} (dif: R$${revenueDiff.toFixed(2)})`);
    if (costDiff > tolerance) reasons.push(`Custo: salvo R$${storedCost.toFixed(2)} vs tabela R$${calculatedCost.toFixed(2)} (dif: R$${costDiff.toFixed(2)})`);
    reason = reasons.join(" | ");
  }
  return {
    missionId: mission.id || "",
    client: mission.client || "",
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UF_TO_REGION,
  applyRegionSuffix,
  auditMissionFinancials,
  calculateMissionFinancials,
  clientFuzzyFilter,
  clientNameShort,
  clientTableMatchesMission,
  dhlDefaultUnitKmExcess,
  extractCityFromAddress,
  extractUF,
  fetchClientPriceTables,
  identifyRegionFromText,
  isIntentionalBillingOverride,
  isSameClientName,
  resolveCancelledTime,
  resolveCancelledWindow
});
