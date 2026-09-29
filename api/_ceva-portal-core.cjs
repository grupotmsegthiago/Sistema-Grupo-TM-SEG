"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/cevaPortal/camposCliente.ts
var camposCliente_exports = {};
__export(camposCliente_exports, {
  CAMPOS_FILTRO: () => CAMPOS_FILTRO,
  CAMPOS_NOVOS_SO_ADMIN: () => CAMPOS_NOVOS_SO_ADMIN,
  CAMPO_PGR: () => CAMPO_PGR,
  SERVICOS_FIXOS: () => SERVICOS_FIXOS,
  avisoInclusaoAdmin: () => avisoInclusaoAdmin,
  decidirGravacao: () => decidirGravacao,
  ehCampoFiltro: () => ehCampoFiltro,
  nomeParaFiltro: () => nomeParaFiltro,
  podeIncluirFiltroNovo: () => podeIncluirFiltroNovo,
  servicoDoSistema: () => servicoDoSistema,
  textoPgr: () => textoPgr
});
function servicoDoSistema(missionType) {
  const tipo = String(missionType || "").toUpperCase();
  if (tipo.includes("VELAD") || tipo.includes("PRONTA")) return "Pronta Resposta";
  return "Escolta Caracterizada";
}
function nomeParaFiltro(valor) {
  return valor.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}
function decidirGravacao(campo, valor, catalogo) {
  const bruto = valor.trim().replace(/\s+/g, " ");
  if (!bruto) return { acao: "limpar" };
  if (bruto.length > LIMITE_FILTRO) return { acao: "confirmar", nome: nomeParaFiltro(bruto).slice(0, LIMITE_FILTRO) };
  if (campo === "servico") {
    const fixo = SERVICOS_FIXOS.find((item) => nomeParaFiltro(item) === nomeParaFiltro(bruto));
    if (fixo) return { acao: "aplicar", valor: fixo, novoFiltro: false };
  }
  const nome = nomeParaFiltro(bruto);
  const existente = catalogo.find((item) => nomeParaFiltro(item) === nome);
  if (existente) return { acao: "aplicar", valor: existente, novoFiltro: false };
  return { acao: "confirmar", nome };
}
function textoPgr(valor) {
  return valor.trim().replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").slice(0, LIMITE_PGR);
}
function ehCampoFiltro(campo) {
  return CAMPOS_FILTRO.includes(campo);
}
function podeIncluirFiltroNovo(perfil, campo) {
  if (campo !== "operacao" && campo !== "tsp") return true;
  return perfil === "administrador";
}
function avisoInclusaoAdmin(campo) {
  if (campo === "tsp") return "S\xF3 o administrador inclui uma TSP nova.";
  if (campo === "operacao") return "S\xF3 o administrador inclui uma opera\xE7\xE3o nova.";
  return "S\xF3 o administrador inclui esse nome.";
}
var CAMPOS_FILTRO, CAMPOS_NOVOS_SO_ADMIN, CAMPO_PGR, SERVICOS_FIXOS, LIMITE_FILTRO, LIMITE_PGR;
var init_camposCliente = __esm({
  "lib/cevaPortal/camposCliente.ts"() {
    "use strict";
    CAMPOS_FILTRO = ["solicitante", "quemAutorizou", "servico", "contrato", "operacao", "tsp"];
    CAMPOS_NOVOS_SO_ADMIN = ["operacao", "tsp"];
    CAMPO_PGR = "atendimentoPgr";
    SERVICOS_FIXOS = ["Escolta Caracterizada", "Pronta Resposta"];
    LIMITE_FILTRO = 120;
    LIMITE_PGR = 2e3;
  }
});

// types.ts
var init_types = __esm({
  "types.ts"() {
    "use strict";
  }
});

// lib/providerAutoPricing.ts
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
var AUTO_MASTER_OP_TYPE, AUTO_BAND_STEP_KM, AUTO_BAND_MAX_KM, AUTO_HOUR_PER_KM_DIVISOR, truncTo2;
var init_providerAutoPricing = __esm({
  "lib/providerAutoPricing.ts"() {
    "use strict";
    AUTO_MASTER_OP_TYPE = "__AUTO_MASTER__";
    AUTO_BAND_STEP_KM = 100;
    AUTO_BAND_MAX_KM = 3e3;
    AUTO_HOUR_PER_KM_DIVISOR = 40;
    truncTo2 = (v) => Math.round(v * 100) / 100;
  }
});

// lib/dhlAutoTableSelector.ts
var DHL_CLIENT_NAME, DHL_AUTO_CLIENT_NAMES, normalize, NORMALIZED_DHL_CLIENTS, findDhlAutoClient, sameDhlClient, computeDhlBand, VALID_REGIONS, stripDhlOpDescription, regionFromDhlOperationType, extractEmbeddedKms, DHL_CORRECTIONS_CACHE, pickFromCorrections, selectDhlClientTable;
var init_dhlAutoTableSelector = __esm({
  "lib/dhlAutoTableSelector.ts"() {
    "use strict";
    init_financialUtils();
    DHL_CLIENT_NAME = "DHL SUPPLY CHAIN (BRAZIL) LTDA";
    DHL_AUTO_CLIENT_NAMES = [
      DHL_CLIENT_NAME,
      "DHL EXPRESS BRAZIL LTDA",
      "DHL GLOBAL FORWARDING (BRAZIL) LTDA",
      "DHL LOGISTICS (BRASIL) LTDA"
    ];
    normalize = (s) => {
      if (!s) return "";
      return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
    };
    NORMALIZED_DHL_CLIENTS = new Map(
      DHL_AUTO_CLIENT_NAMES.map((name) => [normalize(name), name])
    );
    findDhlAutoClient = (clientName) => {
      const n = normalize(clientName);
      if (!n) return null;
      return NORMALIZED_DHL_CLIENTS.get(n) ?? null;
    };
    sameDhlClient = (a, b) => {
      const na = normalize(a);
      const nb = normalize(b);
      return !!na && na === nb;
    };
    computeDhlBand = (km) => {
      const k = Math.max(0, Number(km) || 0);
      if (k <= 150) return 100;
      return Math.ceil((k - 50) / 100) * 100;
    };
    VALID_REGIONS = /* @__PURE__ */ new Set(["SUDESTE", "SUL", "CENTRO-OESTE", "NORDESTE", "NORTE", "BRASIL"]);
    stripDhlOpDescription = (op) => {
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
    regionFromDhlOperationType = (op) => {
      return stripDhlOpDescription(op).region;
    };
    extractEmbeddedKms = (desc) => {
      const matches = desc.matchAll(/(\d{2,5})(?!\d)/g);
      const out = [];
      for (const m of matches) out.push(parseInt(m[1], 10));
      return out;
    };
    DHL_CORRECTIONS_CACHE = [];
    pickFromCorrections = (candidates, dhlTables) => {
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
    selectDhlClientTable = (tables, mission, googleKm, options) => {
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
  }
});

// lib/toll/clientTollBilling.ts
function isDhlClientTollExempt(clientName) {
  if (!clientName) return false;
  const n = String(clientName).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return n.includes("DHL");
}
function normalizeTollAmount(value) {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}
function clientTollMarkupFactor(baseOrEntered, clientName) {
  if (isDhlClientTollExempt(clientName)) return 1;
  const base = normalizeTollAmount(baseOrEntered);
  if (base <= TOLL_NO_MARKUP_MAX_BRL) return 1;
  if (base <= TOLL_MARKUP_20_MAX_BRL) return 1.2;
  if (base <= TOLL_MARKUP_10_MAX_BRL) return 1.1;
  return 1.05;
}
function billableClientToll(baseOrEntered, clientName) {
  const base = normalizeTollAmount(baseOrEntered);
  const factor = clientTollMarkupFactor(base, clientName);
  if (factor === 1) return base;
  return Math.round(base * factor * 100) / 100;
}
function resolveStoredClientToll(tollValue, tollValueProvider, clientName) {
  const client = normalizeTollAmount(tollValue);
  if (isDhlClientTollExempt(clientName)) {
    if (tollValueProvider !== void 0 && tollValueProvider !== null) {
      const provider2 = normalizeTollAmount(tollValueProvider);
      if (provider2 > 0) return provider2;
    }
    return client;
  }
  if (tollValueProvider === void 0 || tollValueProvider === null) {
    return billableClientToll(client, clientName);
  }
  const provider = normalizeTollAmount(tollValueProvider);
  if (Math.abs(client - provider) < 9e-3) {
    return billableClientToll(client, clientName);
  }
  return client;
}
function resolveStoredProviderToll(tollValue, tollValueProvider, isSameOs = false) {
  if (isSameOs) return 0;
  if (tollValueProvider !== void 0 && tollValueProvider !== null) {
    return normalizeTollAmount(tollValueProvider);
  }
  return normalizeTollAmount(tollValue);
}
var TOLL_NO_MARKUP_MAX_BRL, TOLL_MARKUP_20_MAX_BRL, TOLL_MARKUP_10_MAX_BRL;
var init_clientTollBilling = __esm({
  "lib/toll/clientTollBilling.ts"() {
    "use strict";
    TOLL_NO_MARKUP_MAX_BRL = 10;
    TOLL_MARKUP_20_MAX_BRL = 100;
    TOLL_MARKUP_10_MAX_BRL = 150;
  }
});

// lib/financialUtils.ts
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
function isUndefinedDestinationPlaceholder(dest) {
  const n = String(dest || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return n.includes("DESTINO A DEFINIR");
}
function mentionsFixedKmBand(text, band) {
  const n = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const re = band === 200 ? /(^|[^0-9])200\s*KM/ : /(^|[^0-9])100\s*KM/;
  return re.test(n);
}
function resolveDisplacementFromAuthorizedKm(opts) {
  const km = Math.max(0, Number(opts.dhlDeslocamentoKm) || 0);
  const storedClient = Math.max(0, Number(opts.displacementValue) || 0);
  const storedProvider = Math.max(0, Number(opts.displacementValueProvider) || 0);
  let clientRate = Math.max(0, Number(opts.clientUnitPriceKm) || 0);
  if (km > 0 && clientRate <= 0) {
    clientRate = dhlDefaultUnitKmExcess(extractUF(opts.origin || ""));
  }
  const providerRate = opts.isSameOs ? 0 : Math.max(0, Number(opts.providerUnitPriceKm) || 0);
  const derivedClient = km > 0 && clientRate > 0 ? Math.round(km * clientRate * 100) / 100 : 0;
  const derivedProvider = km > 0 && providerRate > 0 ? Math.round(km * providerRate * 100) / 100 : 0;
  return {
    km,
    clientRate,
    providerRate,
    client: storedClient > 0 ? Math.round(storedClient * 100) / 100 : derivedClient,
    provider: opts.isSameOs ? 0 : storedProvider > 0 ? Math.round(storedProvider * 100) / 100 : derivedProvider
  };
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
function evaluateRegionalTableConstraint(operationType, opts) {
  const tableOp = normalize2(operationType || "");
  if (!tableOp) return { blocked: false, reason: "" };
  const originCity = normalize2(opts.originCity || "");
  const destCity = normalize2(opts.destCity || "");
  const originAddr = normalize2(opts.originAddress || "");
  const originRegion = normalize2(opts.originRegion || "");
  const missionText = `${originCity} ${destCity} ${originAddr}`;
  const citiesInTable = TABLE_SPECIFIC_CITY_KEYWORDS.filter((c) => tableOp.includes(c));
  if (citiesInTable.length > 0) {
    const matchedCity = citiesInTable.find((c) => missionText.includes(c));
    if (!matchedCity) {
      return { blocked: true, reason: `BLOQUEIO CIDADE (${citiesInTable[0]})` };
    }
    return { blocked: false, reason: "", matchedCity };
  }
  const isNivelBrasil = tableOp.includes("NIVEL BRASIL") || tableOp.includes("BRASIL") && !tableOp.includes("CENTRO") && !tableOp.includes("SUDESTE") && !tableOp.includes("SUL") && !tableOp.includes("NORTE");
  if (!isNivelBrasil && originRegion) {
    const tableRegions = [];
    if (tableOp.includes("SUDESTE")) tableRegions.push("SUDESTE");
    else if (tableOp.includes("SUL")) tableRegions.push("SUL");
    if (tableOp.includes("NORDESTE")) tableRegions.push("NORDESTE");
    else if (tableOp.includes("NORTE")) tableRegions.push("NORTE");
    if (tableOp.includes("CENTRO")) tableRegions.push("CENTRO-OESTE");
    if (tableRegions.length > 0) {
      const matches = tableRegions.some((r) => {
        const rn = normalize2(r);
        return originRegion === rn || originRegion.includes(rn) || rn.includes(originRegion);
      });
      if (!matches) {
        return { blocked: true, reason: `BLOQUEIO REGIONAL (${tableRegions.join("/")})` };
      }
    }
  }
  return { blocked: false, reason: "" };
}
var STOP_WORDS, safeNumber, normalize2, UF_TO_REGION, resolveCancelledWindow, extractUF, extractCityFromAddress, TABLE_SPECIFIC_CITY_KEYWORDS, parseSafeDate, calculateMissionFinancials;
var init_financialUtils = __esm({
  "lib/financialUtils.ts"() {
    "use strict";
    init_types();
    init_providerAutoPricing();
    init_dhlAutoTableSelector();
    init_clientTollBilling();
    STOP_WORDS = ["LTDA", "LTDA.", "S.A.", "S.A", "SA", "S/A", "S/A.", "DO", "DE", "DA", "E", "DAS", "DOS"];
    safeNumber = (val) => {
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
    normalize2 = (str) => {
      if (!str) return "";
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
    };
    UF_TO_REGION = {
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
    resolveCancelledWindow = (scheduledIso, cancelIso) => {
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
    extractUF = (address) => {
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
        "PALHOCA": "SC",
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
    extractCityFromAddress = (address) => {
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
    TABLE_SPECIFIC_CITY_KEYWORDS = [
      "PALHOCA",
      "FLORIANOPOLIS",
      "JOINVILLE",
      "BLUMENAU",
      "ITAJAI",
      "CHAPECO",
      "CRICIUMA",
      "NAVEGANTES",
      "CUBATAO",
      "SANTOS",
      "GUARULHOS",
      "JUNDIAI",
      "CAMPINAS",
      "BARUERI",
      "CAJAMAR",
      "OSASCO",
      "MANAUS",
      "BELEM",
      "FORTALEZA",
      "RECIFE",
      "SALVADOR",
      "CURITIBA",
      "PORTO ALEGRE",
      "BELO HORIZONTE",
      "BRASILIA",
      "GOIANIA",
      "VITORIA",
      "NITEROI",
      "SAO JOSE DOS PINHAIS",
      "EXTREMA",
      "SUAPE",
      "PECEM"
    ];
    parseSafeDate = (dateInput) => {
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
    calculateMissionFinancials = (mission, clientTables, providerTables, clientData, currentTime = /* @__PURE__ */ new Date(), manualTableOverrides, providers) => {
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
      const cancelledExecuted = isCancelled && hasValidKms && realTraveledKm > 0;
      const scheduledDate = parseSafeDate(mission.startTime || mission.start_time);
      const creationDate = parseSafeDate(mission.createdAt);
      let effectiveStartDate = scheduledDate || creationDate || currentTime;
      let startLabel = scheduledDate ? "Agendamento" : "Cria\xE7\xE3o";
      let endDateObj = currentTime;
      const dbEndTime = parseSafeDate(mission.endTime || mission.end_time);
      const hasOperationalWindow = !!(scheduledDate && dbEndTime && dbEndTime.getTime() > scheduledDate.getTime());
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
      let usedOperationalWindow = false;
      if (isCancelled) {
        const cancelEnd = cancelStatusAt && cancelStatusAt.getTime() > effectiveStartDate.getTime() ? cancelStatusAt : effectiveStartDate;
        if (hasOperationalWindow) {
          const opMs = dbEndTime.getTime() - scheduledDate.getTime();
          const cancelMs = cancelEnd.getTime() - effectiveStartDate.getTime();
          if (opMs > 0 && (cancelMs <= 0 || opMs <= cancelMs)) {
            effectiveStartDate = scheduledDate;
            endDateObj = dbEndTime;
            startLabel = "Execu\xE7\xE3o";
            usedOperationalWindow = true;
          } else {
            endDateObj = cancelEnd;
          }
        } else {
          endDateObj = cancelEnd;
        }
      }
      const diffMs = endDateObj.getTime() - effectiveStartDate.getTime();
      let durationHours = Math.max(0, diffMs / (1e3 * 60 * 60));
      durationHours = Math.floor(durationHours * 60) / 60;
      const cancelledWithHours = isCancelled && (usedOperationalWindow || cancelledExecuted && hasOperationalWindow || !!cancelStatusAt && cancelStatusAt.getTime() > effectiveStartDate.getTime());
      const cancelledBeforeExecution = isCancelled && !cancelledWithHours;
      if (isZeroValueMission && !cancelledWithHours) {
        durationHours = 0;
      }
      if (isCancelled && !cancelledWithHours) {
        durationHours = 0;
      }
      let tollValue = isZeroValueMission ? 0 : Math.max(0, safeNumber(mission.toll_value));
      let providerTollValue = isZeroValueMission ? 0 : resolveStoredProviderToll(mission.toll_value, mission.toll_value_provider, !!mission.is_same_os);
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
          const regionalGate = evaluateRegionalTableConstraint(tableOp, {
            originCity: city,
            destCity: destCity2,
            originRegion: region,
            originUF: ufCode,
            originAddress
          });
          if (regionalGate.blocked) {
            return { ...t, score: -9999, matchType: regionalGate.reason };
          }
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
        const wantedId = String(manualTableOverrides.clientTableId);
        const manualTable = clientTables.find((t) => String(t.id) === wantedId);
        if (manualTable) {
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
      const destHas200km = !isUndefinedDestinationPlaceholder(mission.destination) && (mentionsFixedKmBand(normalizedDest, 200) || normalizedDest.includes("ACOMPANHAMENTO"));
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
          return (op.includes("ATE 200") || mentionsFixedKmBand(op, 200)) && t.franchise_km >= 200 && t.franchise_km <= 200;
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
          return mentionsFixedKmBand(op, 200) || op.includes("ATE 200") || Number(t.franchise_km) >= 200 && Number(t.franchise_km) <= 200;
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
      const destLooks200 = mentionsFixedKmBand(missionDest, 200) && !isUndefinedDestinationPlaceholder(mission.destination);
      const clientTableIs200km = mentionsFixedKmBand(appliedTableName, 200) || appliedTableName.includes("LOGITECH") || destLooks200;
      const clientTableIs100km = mentionsFixedKmBand(appliedTableName, 100);
      const isFixedDistanceClientRule = (clientTableIs200km || clientTableIs100km) && !isFranchiseTable(appliedTableName) && !clientHasExtraKmPrice;
      const clientHasExtraHrPrice = (appliedClientTable?.price_per_extra_hour || 0) > 0 || (manualTableOverrides?.customClientUnitHour || 0) > 0;
      const isVtcClient = missionClientName.includes("VTC");
      const isFixedHoursClientRule = !clientHasExtraHrPrice && (appliedTableName.includes("02H") || appliedTableName.includes("02 HORAS") || isVtcClient && (missionDest.includes("02 HORAS") || missionDest.includes("02H")));
      const originalDistanceForCalc = distanceForCalculation;
      const originalDurationHours = durationHours;
      if (is200kmAccompaniment && !isZeroValueMission && !manualTableOverrides?.disableFixedKmRule && cFranchiseKm <= 200) {
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
      const providerTableIs200km = mentionsFixedKmBand(providerTableName, 200) || providerTableName.includes("LOGITECH");
      const providerTableIs100km = mentionsFixedKmBand(providerTableName, 100);
      const isFixedDistanceProviderRule = (providerTableIs200km || providerTableIs100km) && !isFranchiseTable(providerTableName) && !providerHasExtraKmCost;
      const providerHasExtraHrCost = (appliedProviderTable?.cost_per_extra_hour || 0) > 0 || (manualTableOverrides?.customProviderUnitHour || 0) > 0;
      const isFixedHoursProviderRule = !providerHasExtraHrCost && (providerTableName.includes("02H") || providerTableName.includes("02 HORAS"));
      let providerDistForCalc = manualTableOverrides?.providerOpsOverride ? manualTableOverrides.providerOpsOverride.distanceKm : originalDistanceForCalc;
      let providerDurationForCalc = manualTableOverrides?.providerOpsOverride ? manualTableOverrides.providerOpsOverride.durationHours : originalDurationHours;
      const pFranchiseKmForCap = Number(appliedProviderTable?.franchise_km || 0);
      if (is200kmAccompaniment && !isZeroValueMission && !manualTableOverrides?.disableFixedKmRule && pFranchiseKmForCap <= 200) {
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
        providerTollValue = 35;
      }
      const serviceSubtotal = round2(cBase + cExtraKmVal + cExtraHrVal);
      let iblFee = 0;
      if (manualTableOverrides?.forceIblFee) {
        iblFee = round2(serviceSubtotal * 0.12);
      }
      const clientServiceTotal = round2(serviceSubtotal + iblFee);
      const clientTollBillable = isZeroValueMission ? 0 : isLogitechTable ? resolveStoredClientToll(tollValue, providerTollValue, mission.client) : resolveStoredClientToll(mission.toll_value, mission.toll_value_provider, mission.client);
      const totalRevenue = round2(clientServiceTotal + clientTollBillable);
      const providerServiceTotal = round2(pBase + pExtraKmVal + pExtraHrVal);
      const totalCost = round2(providerServiceTotal + providerTollValue);
      tollValue = providerTollValue;
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
  }
});

// lib/billing/resolveMissionDisplacement.ts
function resolveMissionDisplacement(m, rates) {
  if (!m) return { client: 0, provider: 0, km: 0 };
  const r = resolveDisplacementFromAuthorizedKm({
    dhlDeslocamentoKm: m.dhl_deslocamento_km,
    displacementValue: m.displacement_value,
    displacementValueProvider: m.displacement_value_provider,
    clientUnitPriceKm: rates?.clientUnitPriceKm,
    providerUnitPriceKm: rates?.providerUnitPriceKm,
    origin: m.origin,
    isSameOs: !!m.is_same_os
  });
  return { client: r.client, provider: r.provider, km: r.km };
}
var init_resolveMissionDisplacement = __esm({
  "lib/billing/resolveMissionDisplacement.ts"() {
    "use strict";
    init_financialUtils();
  }
});

// lib/cevaPortal/report.ts
var report_exports = {};
__export(report_exports, {
  cidadeUfDoEndereco: () => cidadeUfDoEndereco,
  horaDoBoletim: () => horaDoBoletim,
  kmGravado: () => kmGravado,
  linhaDoBoletimCeva: () => linhaDoBoletimCeva,
  localOrigemDestino: () => localOrigemDestino,
  numeroOsDoBoletim: () => numeroOsDoBoletim,
  numeroOuNulo: () => numeroOuNulo,
  osAprovadaParaValores: () => osAprovadaParaValores,
  osMudouDepoisDoSnapshot: () => osMudouDepoisDoSnapshot
});
function numeroOuNulo(value) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
function kmGravado(value) {
  if (value == null || String(value).trim() === "") return null;
  return numeroOuNulo(value);
}
function centavos(value) {
  return Math.round(value * 100);
}
function osMudouDepoisDoSnapshot(mission, snap) {
  const receita = numeroEntregue(mission.revenue_value);
  const servicoSnap = numeroOuNulo(snap.revenueServiceOnly);
  const baseSnap = servicoSnap != null ? servicoSnap : Math.max(0, numeroEntregue(snap.totalGeral) - numeroEntregue(snap.tollVal) - Math.max(0, numeroEntregue(snap.displacementVal)));
  if (centavos(receita) !== centavos(baseSnap)) return true;
  const pedagio = resolveStoredClientToll(mission.toll_value ?? 0, mission.toll_value_provider, mission.client);
  if (snap.tollVal != null && centavos(pedagio) !== centavos(numeroEntregue(snap.tollVal))) return true;
  const inicio = kmGravado(mission.start_km);
  const fim = kmGravado(mission.end_km);
  const kmSnap = numeroOuNulo(snap.kmTotal);
  if (inicio != null && fim != null && fim >= inicio && kmSnap != null && kmSnap > 0) {
    if (Math.abs(fim - inicio - kmSnap) > 0.5) return true;
  }
  return false;
}
function numeroOsDoBoletim(id) {
  const match = String(id || "").trim().match(/^GTM-(\d+)$/);
  return match ? match[1] : null;
}
function horaDoBoletim(value) {
  const hours = numeroOuNulo(value) ?? 0;
  if (!Number.isFinite(hours) || hours <= 0) return "00:00";
  const hrs = Math.floor(hours);
  const mins = Math.round((hours - hrs) * 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}
function texto(value) {
  const text = String(value ?? "").trim();
  return text || null;
}
function placaReal(value) {
  const text = texto(value);
  if (!text || text === "-" || /^\d+$/.test(text)) return null;
  return text;
}
function numeroEntregue(value) {
  return numeroOuNulo(value) ?? 0;
}
function tituloCidade(city) {
  return city.toLocaleLowerCase("pt-BR").split(/\s+/).filter(Boolean).map((word, index) => {
    if (index > 0 && LIGACAO.has(word)) return word;
    return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
  }).join(" ");
}
function cidadeUfDoEndereco(address) {
  const text = String(address || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const found = [];
  const pattern = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.\s]{1,80}?)\s*(?:[-–]|,)\s*([A-Za-z]{2})\b/g;
  for (const match of text.matchAll(pattern)) {
    const uf = match[2].toUpperCase();
    if (!UF_VALIDA.test(uf)) continue;
    const comma = match[1].lastIndexOf(",");
    let city = (comma >= 0 ? match[1].slice(comma + 1) : match[1]).trim();
    city = city.replace(/^[A-Z0-9]{2,}\+[A-Z0-9]{2,}\s*[-–]?\s*/i, "").replace(/^[\s.-]+/, "").trim();
    if (city.length < 3 || /\d|\+/.test(city)) continue;
    found.push({ city, uf });
  }
  const last = found[found.length - 1];
  return last ? `${tituloCidade(last.city)} - ${last.uf}` : null;
}
function localOrigemDestino(origin, destination) {
  const from = cidadeUfDoEndereco(origin);
  const to = cidadeUfDoEndereco(destination);
  if (from && to) return `${from} x ${to}`;
  return from || to;
}
function baseDaLinha(mission, os) {
  return {
    os,
    status: texto(mission.status) || "Conclu\xEDda",
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
    financeiro: "ENCONTRADO",
    valores: "AGUARDANDO"
  };
}
function osAprovadaParaValores(mission) {
  return mission.billing_approved === true;
}
function fecharLinha(row, mission) {
  if (osAprovadaParaValores(mission)) return { ...row, valores: "APROVADO" };
  return {
    ...row,
    valores: "AGUARDANDO",
    valorHrsExcedente: null,
    valorKmExcedente: null,
    valorAcionamento: null,
    valorTotal: null,
    pedagio: null,
    tarifaKm: null,
    tarifaHora: null
  };
}
function linhaDoBoletimCeva(mission, ctx) {
  const os = numeroOsDoBoletim(mission.id);
  if (!os) return null;
  const priceTables = ctx.priceTables || [];
  const providerTables = ctx.providerTables || [];
  const clientData = ctx.clientData;
  const snap = mission.snapshot_data && typeof mission.snapshot_data === "object" ? mission.snapshot_data : null;
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
      const finSnapRates = calculateMissionFinancials(mission, priceTables, providerTables, clientData, /* @__PURE__ */ new Date());
      if (snapClientUnitKm <= 0) snapClientUnitKm = finSnapRates.client.unitPriceKm || 0;
      snapProviderUnitKm = finSnapRates.provider.unitCostKm || 0;
    } catch {
    }
    const useDisp = resolveMissionDisplacement({
      dhl_deslocamento_km: numeroOuNulo(mission.dhl_deslocamento_km),
      displacement_value: numeroOuNulo(mission.displacement_value ?? snap.displacementVal ?? 0),
      displacement_value_provider: numeroOuNulo(mission.displacement_value_provider),
      origin: mission.origin,
      is_same_os: mission.is_same_os
    }, {
      clientUnitPriceKm: snapClientUnitKm,
      providerUnitPriceKm: snapProviderUnitKm
    }).client;
    const dbRevenue = numeroEntregue(mission.revenue_value);
    const dbTotal = dbRevenue + resolveStoredClientToll(mission.toll_value || 0, mission.toll_value_provider, mission.client) + useDisp;
    const wasManuallyEdited = !!(mission.billing_verified_by || mission.revenue_edit_reason);
    const snapTotal = numeroEntregue(snap.totalGeral);
    const snapDispStored = Math.max(0, numeroEntregue(snap.displacementVal));
    const snapTotalWithDisp = snapTotal > 0 && snapDispStored <= 0 && useDisp > 0 ? snapTotal + useDisp : snapTotal;
    const useTotal = wasManuallyEdited ? dbTotal : snapTotalWithDisp > 0 ? snapTotalWithDisp : useBase + useKmEx + useHrEx + useToll + useDisp;
    let snapFranchiseHours = numeroEntregue(snap.franchiseHours);
    let snapFranchiseKm = numeroEntregue(snap.franchiseKm);
    let snapUnitHr = numeroEntregue(snap.unitHr);
    let snapUnitKm = numeroEntregue(snap.unitKm);
    let snapHrExtraQtd = numeroEntregue(snap.hrExtraQtd);
    let snapKmExtraQtd = numeroEntregue(snap.kmExtraQtd);
    let snapDurationHours = numeroEntregue(snap.durationHours);
    if (snapFranchiseHours === 0 && snapFranchiseKm === 0 && snapUnitHr === 0 && snapUnitKm === 0) {
      try {
        const finFallback = calculateMissionFinancials(mission, priceTables, providerTables, clientData, /* @__PURE__ */ new Date());
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
      } catch {
      }
    }
    const isCancelledSnap = (mission.status || "").toString().toLowerCase().includes("cancel");
    const wasExecutedSnap = isCancelledSnap && !!mission.end_time && !!mission.start_time && new Date(mission.end_time).getTime() > new Date(mission.start_time).getTime();
    const cancelledBeforeSnap = isCancelledSnap && !wasExecutedSnap;
    const kmDoSnapshot = numeroEntregue(snap.kmTotal);
    const kmInicio2 = kmGravado(mission.start_km);
    const kmFim2 = kmGravado(mission.end_km);
    const kmPeloHodometro2 = kmInicio2 != null && kmFim2 != null && kmFim2 >= kmInicio2 ? kmFim2 - kmInicio2 : null;
    const kmTotalRawSnap = kmDoSnapshot > 0 ? kmDoSnapshot : kmPeloHodometro2 ?? kmGravado(mission.total_distance) ?? kmGravado(mission.traveled_distance);
    const kmTotal2 = cancelledBeforeSnap ? 0 : kmTotalRawSnap;
    const linha = {
      ...base,
      franquiaHora: horaDoBoletim(snapFranchiseHours),
      franquiaKm: snapFranchiseKm,
      kmInicio: kmInicio2,
      kmFim: kmFim2,
      kmRodado: kmTotal2,
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
      local: localOrigemDestino(mission.origin, mission.destination)
    };
    if (osMudouDepoisDoSnapshot(mission, snap)) {
      linha.valorTotal = dbTotal;
      linha.pedagio = useToll;
      if (!cancelledBeforeSnap && kmPeloHodometro2 != null && Math.abs(kmPeloHodometro2 - kmDoSnapshot) > 0.5) {
        linha.kmInicio = kmInicio2;
        linha.kmFim = kmFim2;
        linha.kmRodado = kmPeloHodometro2;
      }
      try {
        const finVivo = calculateMissionFinancials(mission, priceTables, providerTables, clientData, /* @__PURE__ */ new Date());
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
      } catch {
      }
    }
    return fecharLinha(linha, mission);
  }
  const tollVal = resolveStoredClientToll(mission.toll_value || 0, mission.toll_value_provider, mission.client);
  const savedRevenue = numeroEntregue(mission.revenue_value);
  const adj = ctx.adjustment;
  const overrides = adj ? {
    clientTableId: adj.clientTableId || void 0,
    providerTableId: adj.providerTableId && !String(adj.providerTableId).startsWith("auto-") ? adj.providerTableId : void 0,
    customClientBase: adj.customClientBase ? Number(adj.customClientBase) : void 0,
    customClientUnitKm: adj.customClientKm ? Number(adj.customClientKm) : void 0,
    customClientUnitHour: adj.customClientHour ? Number(adj.customClientHour) : void 0,
    customProviderBase: adj.customProviderBase ? Number(adj.customProviderBase) : void 0,
    customProviderUnitKm: adj.customProviderKm ? Number(adj.customProviderKm) : void 0,
    customProviderUnitHour: adj.customProviderHour ? Number(adj.customProviderHour) : void 0
  } : void 0;
  const fin = calculateMissionFinancials(mission, priceTables, providerTables, clientData, /* @__PURE__ */ new Date(), overrides);
  const usedTable = priceTables.find((t) => t.id.toString() === fin.client.tableId);
  const franchiseHours = usedTable?.franchise_hours ?? 0;
  const activationFee = usedTable?.activation_fee ?? 0;
  const unitKm = usedTable?.price_per_extra_km ?? 0;
  const unitHr = usedTable?.price_per_extra_hour ?? 0;
  const dispValN = resolveMissionDisplacement(mission, {
    clientUnitPriceKm: fin.client.unitPriceKm,
    providerUnitPriceKm: fin.provider.unitCostKm
  }).client;
  const isCancelled = (mission.status || "").toString().toLowerCase().includes("cancel");
  const cancelWindow = isCancelled ? resolveCancelledWindow(mission.start_time, mission._cancelStatusAt) : null;
  const cancelledBefore = !!cancelWindow?.cancelledBefore;
  const kmInicio = kmGravado(mission.start_km);
  const kmFim = kmGravado(mission.end_km);
  const kmPeloHodometro = kmInicio != null && kmFim != null && kmFim >= kmInicio ? kmFim - kmInicio : null;
  const kmTotalRaw = fin.realTraveledKm > 0 ? fin.realTraveledKm : kmPeloHodometro ?? kmGravado(mission.total_distance) ?? kmGravado(mission.traveled_distance);
  const kmTotal = isCancelled ? 0 : kmTotalRaw;
  const totalGeral = savedRevenue + tollVal + dispValN;
  return fecharLinha({
    ...base,
    dataInicio: texto(isCancelled ? cancelWindow.start || mission.start_time || "" : mission.start_time || ""),
    dataFim: texto(isCancelled ? cancelWindow.end || mission.start_time || "" : mission.end_time || ""),
    franquiaHora: horaDoBoletim(franchiseHours),
    franquiaKm: usedTable?.franchise_km ?? 0,
    kmInicio,
    kmFim,
    kmRodado: kmTotal,
    kmExcedente: fin.client.excessKm ?? 0,
    hrsTrabalhada: cancelledBefore ? "00:00" : horaDoBoletim(fin.durationHours),
    hrsExcedente: horaDoBoletim(fin.client.excessHours),
    valorHrsExcedente: fin.client.extraHrVal ?? 0,
    valorKmExcedente: fin.client.extraKmVal ?? 0,
    valorAcionamento: activationFee,
    valorTotal: totalGeral,
    pedagio: tollVal,
    tarifaKm: unitKm,
    tarifaHora: unitHr,
    local: localOrigemDestino(mission.origin, mission.destination)
  }, mission);
}
var UF_VALIDA, LIGACAO;
var init_report = __esm({
  "lib/cevaPortal/report.ts"() {
    "use strict";
    init_financialUtils();
    init_resolveMissionDisplacement();
    init_clientTollBilling();
    UF_VALIDA = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;
    LIGACAO = /* @__PURE__ */ new Set(["de", "da", "do", "das", "dos", "e"]);
  }
});

// lib/cevaPortal/aoVivo.ts
var aoVivo_exports = {};
__export(aoVivo_exports, {
  STATUS_AO_VIVO: () => STATUS_AO_VIVO,
  montarMissaoAoVivo: () => montarMissaoAoVivo,
  ordenarMissoesAoVivo: () => ordenarMissoesAoVivo
});
function texto2(value) {
  const text = String(value ?? "").trim();
  return text || null;
}
function montarMissaoAoVivo(input) {
  const os = numeroOsDoBoletim(input.id);
  if (!os) return null;
  const campos = input.campos;
  return {
    os,
    status: texto2(input.status) || "Pendente",
    servico: texto2(campos?.servico) || servicoDoSistema(input.missionType),
    placa: texto2(input.plate),
    motorista: texto2(input.driver),
    local: localOrigemDestino(input.origin, input.destination),
    origem: cidadeUfDoEndereco(input.origin),
    destino: cidadeUfDoEndereco(input.destination),
    dataInicio: texto2(input.start),
    dataFim: texto2(input.end),
    kmInicio: kmGravado(input.startKm),
    kmFim: kmGravado(input.endKm),
    solicitante: texto2(campos?.solicitante),
    quemAutorizou: texto2(campos?.quem_autorizou),
    operacao: texto2(campos?.operacao),
    tsp: texto2(campos?.tsp),
    atendimentoPgr: texto2(campos?.atendimento_pgr)
  };
}
function ordenarMissoesAoVivo(linhas) {
  return [...linhas].sort((a, b) => {
    const peso = (PESO[a.status] ?? 9) - (PESO[b.status] ?? 9);
    if (peso) return peso;
    const inicioA = a.dataInicio ? new Date(a.dataInicio).getTime() : 0;
    const inicioB = b.dataInicio ? new Date(b.dataInicio).getTime() : 0;
    if (inicioB !== inicioA) return inicioB - inicioA;
    return Number(b.os) - Number(a.os);
  });
}
var STATUS_AO_VIVO, PESO;
var init_aoVivo = __esm({
  "lib/cevaPortal/aoVivo.ts"() {
    "use strict";
    init_camposCliente();
    init_report();
    STATUS_AO_VIVO = ["Em Viagem", "Origem", "Agendada", "Solicitada", "Documenta\xE7\xE3o", "Pendente"];
    PESO = {
      "Em Viagem": 0,
      Origem: 1,
      Agendada: 2,
      Solicitada: 3,
      "Documenta\xE7\xE3o": 4,
      Pendente: 5
    };
  }
});

// lib/supabasePaging.ts
async function fetchAllKeysetPages(buildQuery, pageSize = 1e3, maxRows = 5e4, options) {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize deve ser um inteiro positivo.");
  }
  if (!Number.isInteger(maxRows) || maxRows <= 0) {
    throw new Error("maxRows deve ser um inteiro positivo.");
  }
  const all = [];
  const seenKeys = /* @__PURE__ */ new Set();
  let afterKey = null;
  let exhausted = false;
  let pagesLoaded = 0;
  let expectedRows = null;
  while (all.length < maxRows) {
    const take = Math.min(pageSize, maxRows - all.length);
    const { data, error, count } = await buildQuery(afterKey, take);
    pagesLoaded += 1;
    if (error) throw error;
    if (typeof count === "number") {
      if (expectedRows !== null && count !== expectedRows) {
        throw new SupabasePagingIntegrityError(
          `A contagem mudou durante a pagina\xE7\xE3o (${expectedRows} \u2192 ${count}).`,
          "COUNT_CHANGED"
        );
      }
      expectedRows = count;
    }
    if (data === null) {
      throw new SupabasePagingIntegrityError(
        `P\xE1gina ${pagesLoaded} retornou dados nulos sem erro expl\xEDcito.`,
        "NULL_PAGE"
      );
    }
    if (data.length === 0) {
      exhausted = true;
      break;
    }
    for (const row of data) {
      const key = options.getRowKey(row);
      if (seenKeys.has(key)) {
        throw new SupabasePagingIntegrityError(
          `Registro duplicado entre p\xE1ginas: ${String(key)}.`,
          "DUPLICATE_ROW"
        );
      }
      seenKeys.add(key);
      all.push(row);
    }
    afterKey = options.getRowKey(data[data.length - 1]);
    if (expectedRows !== null && all.length > expectedRows) {
      throw new SupabasePagingIntegrityError(
        `Foram carregados ${all.length} registros para uma contagem esperada de ${expectedRows}.`,
        "ROW_COUNT_MISMATCH"
      );
    }
    if (data.length < take) {
      exhausted = true;
      break;
    }
  }
  let truncated = false;
  if (!exhausted && all.length >= maxRows) {
    const { data, error } = await buildQuery(afterKey, 1);
    pagesLoaded += 1;
    if (error) throw error;
    if (data === null) {
      throw new SupabasePagingIntegrityError(
        "P\xE1gina sentinela retornou dados nulos sem erro expl\xEDcito.",
        "NULL_PAGE"
      );
    }
    truncated = data.length > 0;
  }
  if (!truncated && expectedRows !== null && all.length !== expectedRows) {
    throw new SupabasePagingIntegrityError(
      `A pagina\xE7\xE3o terminou com ${all.length} de ${expectedRows} registros esperados.`,
      "ROW_COUNT_MISMATCH"
    );
  }
  return { rows: all, truncated, pagesLoaded, complete: !truncated, expectedRows };
}
var SupabasePagingIntegrityError;
var init_supabasePaging = __esm({
  "lib/supabasePaging.ts"() {
    "use strict";
    SupabasePagingIntegrityError = class extends Error {
      constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "SupabasePagingIntegrityError";
      }
      code;
    };
  }
});

// lib/billing/fetchBillingMissionUniverse.ts
var fetchBillingMissionUniverse_exports = {};
__export(fetchBillingMissionUniverse_exports, {
  BILLING_DATASET_INCOMPLETE_MESSAGE: () => BILLING_DATASET_INCOMPLETE_MESSAGE,
  BillingDatasetIncompleteError: () => BillingDatasetIncompleteError,
  fetchBillingMissionUniverse: () => fetchBillingMissionUniverse
});
async function fetchBillingMissionUniverse(supabase, params) {
  const pageSize = params.pageSize ?? 1e3;
  const maxRows = params.maxRows ?? 5e4;
  const periodUnionFilter = [
    `and(start_time.gte.${params.rangeStart},start_time.lte.${params.rangeEnd})`,
    `and(billing_period_override.gte.${params.rangeStart},billing_period_override.lte.${params.rangeEnd})`
  ].join(",");
  const buildUniverseQuery = (selectColumns, withExactCount, head = false) => supabase.from("missions").select(selectColumns, withExactCount ? { count: "exact", head } : void 0).in(params.filterColumn, params.canonicalNames).neq("status", "Recusada").or(periodUnionFilter);
  const rows = await fetchAllKeysetPages(
    async (afterId, size) => {
      let query = buildUniverseQuery(
        "*, company_vehicle:vehicles(*)",
        afterId === null
      ).order("id", { ascending: true }).limit(size);
      if (afterId !== null) query = query.gt("id", afterId);
      const { data, error, count } = await query;
      return { data, error, count };
    },
    pageSize,
    maxRows,
    { getRowKey: (row) => row.id }
  );
  if (rows.truncated) {
    throw new BillingDatasetIncompleteError("ROW_CAP_EXCEEDED");
  }
  const identities = await fetchAllKeysetPages(
    async (afterId, size) => {
      let query = buildUniverseQuery("id", afterId === null).order("id", { ascending: true }).limit(size);
      if (afterId !== null) query = query.gt("id", afterId);
      const { data, error, count } = await query;
      return { data, error, count };
    },
    pageSize,
    maxRows,
    { getRowKey: (row) => row.id }
  );
  if (identities.truncated) {
    throw new BillingDatasetIncompleteError("ROW_CAP_EXCEEDED");
  }
  const finalCountQuery = buildUniverseQuery("id", true, true);
  const { error: finalCountError, count: finalCount } = await finalCountQuery;
  if (finalCountError) throw finalCountError;
  if (rows.expectedRows === null || identities.expectedRows === null || typeof finalCount !== "number") {
    throw new BillingDatasetIncompleteError("COUNT_UNAVAILABLE");
  }
  const rowIds = rows.rows.map((row) => row.id);
  const identityIds = identities.rows.map((row) => row.id);
  const sameIdentities = rowIds.length === identityIds.length && rowIds.every((id, index) => id === identityIds[index]);
  const sameCounts = rows.expectedRows === identities.expectedRows && identities.expectedRows === finalCount && rowIds.length === finalCount;
  if (!sameIdentities || !sameCounts) {
    throw new BillingDatasetIncompleteError("UNSTABLE_SNAPSHOT");
  }
  const sortedRows = [...rows.rows].sort((a, b) => {
    const dateDiff = new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime();
    return dateDiff || String(a.id).localeCompare(String(b.id));
  });
  return {
    rows: sortedRows,
    recordsLoaded: sortedRows.length,
    pagesLoaded: rows.pagesLoaded + identities.pagesLoaded,
    complete: true
  };
}
var BILLING_DATASET_INCOMPLETE_MESSAGE, BillingDatasetIncompleteError;
var init_fetchBillingMissionUniverse = __esm({
  "lib/billing/fetchBillingMissionUniverse.ts"() {
    "use strict";
    init_supabasePaging();
    BILLING_DATASET_INCOMPLETE_MESSAGE = "N\xE3o foi poss\xEDvel carregar todas as OS do per\xEDodo. O faturamento foi bloqueado para evitar valores incompletos.";
    BillingDatasetIncompleteError = class extends Error {
      constructor(reason) {
        super(BILLING_DATASET_INCOMPLETE_MESSAGE);
        this.reason = reason;
        this.name = "BillingDatasetIncompleteError";
      }
      reason;
    };
  }
});

// lib/cevaPortal/httpHandler.ts
var httpHandler_exports = {};
__export(httpHandler_exports, {
  handleCevaPortalHttp: () => handleCevaPortalHttp
});
module.exports = __toCommonJS(httpHandler_exports);

// lib/supabaseAdmin.ts
var import_supabase_js = require("@supabase/supabase-js");

// lib/supabaseDefaults.ts
var TMSEG_SUPABASE_PROJECT_REF = "ajhmmjuewdsukecaimik";
var DEFAULT_SUPABASE_URL = `https://${TMSEG_SUPABASE_PROJECT_REF}.supabase.co`;
var DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";

// lib/supabasePublicEnv.ts
function cleanEnv(value) {
  if (value == null) return "";
  return String(value).trim().replace(/^["']|["']$/g, "");
}
function isValidHttpUrl(url) {
  return /^https?:\/\/.+/i.test(url);
}
function extractSupabaseProjectRef(url) {
  const match = cleanEnv(url).match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1]?.toLowerCase() ?? null;
}
function normalizeSupabaseProjectUrl(url) {
  const cleaned = cleanEnv(url);
  if (!cleaned) return "";
  return cleaned.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}
function decodeJwtProjectRef(key) {
  try {
    const part = cleanEnv(key).split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    return payload.ref?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
function isTmSegSupabaseUrl(url) {
  return extractSupabaseProjectRef(url) === TMSEG_SUPABASE_PROJECT_REF;
}
function isTmSegSupabaseAnonKey(key, expectedUrl) {
  const cleaned = cleanEnv(key);
  if (!cleaned) return false;
  const keyRef = decodeJwtProjectRef(cleaned);
  if (keyRef && keyRef !== TMSEG_SUPABASE_PROJECT_REF) return false;
  if (expectedUrl) {
    const urlRef = extractSupabaseProjectRef(expectedUrl);
    if (urlRef && keyRef && urlRef !== keyRef) return false;
  }
  return true;
}

// lib/supabaseAdmin.ts
var warnedMissingServiceRole = false;
var warnedAnonKeyAsService = false;
var warnedAnonFallback = false;
var warnedForeignProject = false;
function warnForeignProjectOnce() {
  if (warnedForeignProject) return;
  warnedForeignProject = true;
  console.warn(
    "[Supabase] Variaveis de outro projeto ignoradas \u2014 usando projeto TM SEG (ajhmmjuewdsukecaimik). Remova na Vercel envs de integracao Supabase incorretas ou alinhe SUPABASE_URL/VITE_SUPABASE_URL."
  );
}
function pickServerUrl() {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.TMSEG_SUPABASE_URL
  ];
  for (const candidate of candidates) {
    const value = normalizeSupabaseProjectUrl(candidate);
    if (isValidHttpUrl(value) && isTmSegSupabaseUrl(value)) return value;
    if (isValidHttpUrl(value)) warnForeignProjectOnce();
  }
  return DEFAULT_SUPABASE_URL;
}
function pickServerAnonKey(url) {
  const candidates = [
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.TMSEG_SUPABASE_ANON_KEY
  ];
  for (const candidate of candidates) {
    const value = cleanEnv(candidate);
    if (isTmSegSupabaseAnonKey(value, url)) return value;
    if (value) warnForeignProjectOnce();
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}
function decodeJwtRole(key) {
  try {
    const part = key.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    return payload.role ?? null;
  } catch {
    return null;
  }
}
function isTmSegServiceRoleKey(key, expectedRef = TMSEG_SUPABASE_PROJECT_REF) {
  const cleaned = cleanEnv(key);
  if (!cleaned) return { ok: false, reason: "empty" };
  if (cleaned.startsWith("sb_")) return { ok: false, reason: "not_jwt" };
  const ref = decodeJwtProjectRef(cleaned);
  const role = decodeJwtRole(cleaned);
  if (!ref || !role) return { ok: false, reason: "not_jwt" };
  if (ref !== expectedRef) return { ok: false, reason: "foreign_project" };
  if (role !== "service_role") return { ok: false, reason: "anon_role" };
  return { ok: true };
}
function getSupabaseUrl() {
  return pickServerUrl();
}
function getSupabaseAnonKey() {
  return pickServerAnonKey(getSupabaseUrl());
}
function getSupabaseServiceRoleKey() {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.TMSEG_SUPABASE_SERVICE_ROLE_KEY
  ];
  const expectedRef = extractSupabaseProjectRef(getSupabaseUrl()) || TMSEG_SUPABASE_PROJECT_REF;
  for (const candidate of candidates) {
    const key = cleanEnv(candidate);
    if (!key) continue;
    const check = isTmSegServiceRoleKey(key, expectedRef);
    if (!check.ok) {
      if (check.reason === "foreign_project") warnForeignProjectOnce();
      if (check.reason === "anon_role" && !warnedAnonKeyAsService) {
        warnedAnonKeyAsService = true;
        console.error(
          '[Supabase] SUPABASE_SERVICE_KEY cont\xE9m a chave ANON, n\xE3o service_role. Substitua pelo valor "service_role" LEGACY (eyJ...) no .env (Settings \u2192 API no Supabase).'
        );
      }
      if (check.reason === "not_jwt" && !warnedAnonKeyAsService) {
        warnedAnonKeyAsService = true;
        console.error(
          '[Supabase] SUPABASE_SERVICE_ROLE_KEY n\xE3o \xE9 JWT service_role LEGACY. Use a chave "service_role (LEGACY)" (eyJ...), n\xE3o sb_secret_/sb_publishable_.'
        );
      }
      continue;
    }
    return key;
  }
  if (!warnedMissingServiceRole) {
    warnedMissingServiceRole = true;
    console.warn(
      '[Supabase] SUPABASE_SERVICE_ROLE_KEY n\xE3o definida para o projeto TM SEG. Copie a chave "service_role" em Supabase \u2192 Settings \u2192 API e adicione na Vercel.'
    );
  }
  return "";
}
function getSupabaseServerKey() {
  const service = getSupabaseServiceRoleKey();
  if (service) return service;
  const anon = getSupabaseAnonKey();
  if (anon && !warnedAnonFallback) {
    warnedAnonFallback = true;
    console.warn("[Supabase] Servidor operando com chave ANON \u2014 algumas rotas podem falhar por RLS.");
  }
  return anon;
}
function createSupabaseAdminClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseServerKey();
  if (!url || !key) return null;
  return (0, import_supabase_js.createClient)(url, key);
}

// lib/cevaPortal/acesso.ts
var import_crypto = require("crypto");
function podeCadastrarPessoa(perfil) {
  return perfil === "administrador";
}
function emailDeAcesso(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) return null;
  return email;
}
function nomeDeAcesso(value) {
  const nome = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > 120) return null;
  return nome;
}
function perfilDeAcesso(value) {
  const perfil = String(value ?? "").trim().toLowerCase();
  return perfil === "administrador" || perfil === "analista" ? perfil : null;
}
function validarSenha(senha) {
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (senha.length > 72) return "A senha passou do limite.";
  return null;
}
function hashSenha(senha) {
  const salt = (0, import_crypto.randomBytes)(16).toString("hex");
  const hash = (0, import_crypto.scryptSync)(senha, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
function senhaConfere(senha, armazenada) {
  const partes = String(armazenada || "").split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt" || !partes[1] || !partes[2]) return false;
  const calculado = (0, import_crypto.scryptSync)(senha, partes[1], 32);
  const salvo = Buffer.from(partes[2], "hex");
  if (calculado.length !== salvo.length) return false;
  return (0, import_crypto.timingSafeEqual)(calculado, salvo);
}
var ALFABETO_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function gerarSenhaTemporaria() {
  const bytes = (0, import_crypto.randomBytes)(12);
  return [...bytes].map((byte) => ALFABETO_SENHA[byte % ALFABETO_SENHA.length]).join("");
}
function decidirPrimeiroAcesso(input) {
  if (!input.existeAdministrador) return { ok: true, acao: "criar-administrador" };
  return { ok: false, error: "A senha chega por e-mail quando o administrador libera o acesso. Entre com ela para trocar no primeiro acesso." };
}

// lib/cevaPortal/rules.ts
var CEVA_PORTAL_LOGIN_ENABLED = false;
function issueCevaPortalToken(userId, now = Date.now()) {
  return `ceva-portal-${userId}-${now}`;
}
function parseCevaPortalToken(token) {
  const match = String(token || "").trim().match(/^ceva-portal-(\d+)-(\d{10,})$/);
  return match ? match[1] : null;
}
function readPortalToken(header) {
  const raw = String(header || "").replace(/^Bearer\s+/i, "").trim();
  return parseCevaPortalToken(raw);
}
function cleanText(value, max) {
  const text = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!text) return null;
  return text.slice(0, max);
}
function parseBrazilDateTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return `${text}:00-03:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) return `${text}-03:00`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
function normalizePlate(value) {
  const plate = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  return plate || null;
}
function solicitanteDaSessao(sessionName) {
  return String(sessionName || "").trim();
}
function buildCevaSolicitacao(session, body) {
  const source = body && typeof body === "object" ? body : {};
  const solicitanteInformado = cleanText(source.solicitante, 160);
  const solicitante = CEVA_PORTAL_LOGIN_ENABLED ? solicitanteDaSessao(session?.name || "") : solicitanteInformado || "";
  const email = CEVA_PORTAL_LOGIN_ENABLED ? String(session?.email || "").trim().toLowerCase() : "sem-login";
  const userId = CEVA_PORTAL_LOGIN_ENABLED ? String(session?.id || "").trim() : "aberto";
  if (!solicitante) {
    return { ok: false, error: CEVA_PORTAL_LOGIN_ENABLED ? "Sess\xE3o sem identifica\xE7\xE3o da pessoa." : "Informe o solicitante." };
  }
  if (CEVA_PORTAL_LOGIN_ENABLED && (!email || !userId)) {
    return { ok: false, error: "Sess\xE3o sem identifica\xE7\xE3o da pessoa." };
  }
  const dataInicio = parseBrazilDateTime(source.dataInicio);
  if (!dataInicio) return { ok: false, error: "Informe a data de in\xEDcio." };
  const servico = cleanText(source.servico, 120);
  if (!servico) return { ok: false, error: "Informe o servi\xE7o." };
  return {
    ok: true,
    value: {
      dataInicio,
      dataFim: parseBrazilDateTime(source.dataFim),
      solicitante,
      quemAutorizou: cleanText(source.quemAutorizou, 160),
      servico,
      atendimentoPgr: cleanText(source.atendimentoPgr, 300),
      contrato: cleanText(source.contrato, 160),
      operacao: cleanText(source.operacao, 160),
      tsp: cleanText(source.tsp, 160),
      placa: normalizePlate(source.placa),
      motorista: cleanText(source.motorista, 160),
      franquiaHora: cleanText(source.franquiaHora, 20),
      franquiaKm: cleanText(source.franquiaKm, 20),
      filledByUserId: userId,
      filledByName: solicitante,
      filledByEmail: email
    }
  };
}

// lib/email/smtp.ts
var import_nodemailer = __toESM(require("nodemailer"), 1);
var EMAIL_USER = process.env.EMAIL_USER || "adm@grupotmseg.com.br";
var SMTP_FROM = '"Grupo TM SEG" <adm@grupotmseg.com.br>';
var transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || "";
  transporter = import_nodemailer.default.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: { user: EMAIL_USER, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
    requireTLS: true
  });
  return transporter;
}
async function sendMail(opts) {
  return getTransporter().sendMail(opts);
}

// lib/cevaPortal/emailAcesso.ts
function escapar(valor) {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function systemAppUrl(path) {
  const base = process.env.SYSTEM_URL || `https://${process.env.REPLIT_DOMAINS?.split(",")[0] || "sistema.grupotmseg.com.br"}`;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
async function sendCevaPortalAccessEmail(input) {
  const link = systemAppUrl("/ceva");
  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Segoe UI,Arial,sans-serif;color:#333;line-height:1.6">
    <h2>Acesso ao Controle de Escolta</h2>
    <p>Ol\xE1, <strong>${escapar(input.nome)}</strong>.</p>
    <p>O administrador liberou o seu acesso ao controle de escolta da CEVA. Use a senha tempor\xE1ria abaixo e troque-a no primeiro acesso.</p>
    <p><strong>Link:</strong> <a href="${link}">${link}</a><br>
    <strong>E-mail:</strong> ${escapar(input.email)}<br>
    <strong>Senha tempor\xE1ria:</strong> <code>${escapar(input.senhaTemporaria)}</code></p>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  </body></html>`;
  try {
    await sendMail({
      from: SMTP_FROM,
      to: input.email,
      subject: "Acesso ao Controle de Escolta CEVA",
      html
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Email] Falha no acesso CEVA para ${input.email}:`, message);
    return false;
  }
}

// lib/cevaPortal/httpHandler.ts
var STOP_WORDS2 = ["LTDA", "LTDA.", "S.A.", "S.A", "SA", "S/A", "S/A.", "DO", "DE", "DA", "E", "DAS", "DOS"];
function quoteForOr(v) {
  return /[(),.:]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}
function clientFuzzyFilter(clientName) {
  const trimmed = (clientName || "").trim();
  if (!trimmed) return `client.eq.${quoteForOr(clientName)}`;
  const words = trimmed.split(/\s+/).filter((w) => !STOP_WORDS2.includes(w.toUpperCase()));
  const short = words.length >= 2 ? `${words[0]} ${words[1].substring(0, Math.min(6, words[1].length))}` : words[0] || trimmed;
  return `client.eq.${quoteForOr(clientName)},client.ilike.${quoteForOr("%" + short + "%")}`;
}
var INVALID_LOGIN = "E-mail ou senha inv\xE1lidos.";
var attempts = /* @__PURE__ */ new Map();
function clientIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || req.ip || "unknown";
}
function tooManyAttempts(key) {
  const row = attempts.get(key);
  if (!row || row.resetAt < Date.now()) {
    if (row) attempts.delete(key);
    return false;
  }
  return row.count >= 10;
}
function registerFailure(key) {
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || row.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1e3 });
    return;
  }
  row.count += 1;
}
function clearFailures(key) {
  attempts.delete(key);
}
function usuarioPublico(row) {
  return {
    id: String(row.id),
    name: String(row.nome || "").trim(),
    email: String(row.email || "").trim().toLowerCase(),
    perfil: row.perfil,
    trocarSenha: row.trocarSenha === true
  };
}
function sessaoDe(row) {
  const perfil = perfilDeAcesso(row.perfil);
  if (!perfil) return null;
  const user = usuarioPublico({ ...row, perfil, trocarSenha: row.trocar_senha === true });
  return { ...user, perfil, trocarSenha: user.trocarSenha };
}
async function portalSession(req) {
  const userId = readPortalToken(String(req.headers?.authorization || req.headers?.["x-ceva-portal"] || ""));
  if (!userId) return null;
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  const { data: user } = await sb.from("ceva_portal_usuarios").select("id, nome, email, perfil, status, trocar_senha").eq("id", userId).maybeSingle();
  if (!user || user.status !== "ativo") return null;
  return sessaoDe(user);
}
function exigirUso(res, session) {
  if (!session) {
    res.status(401).json({ error: "Sess\xE3o expirada. Entre novamente." });
    return false;
  }
  if (session.trocarSenha) {
    res.status(403).json({ error: "Troque a senha enviada por e-mail para continuar.", trocarSenha: true });
    return false;
  }
  return true;
}
async function existeAdministrador(sb) {
  const { count, error } = await sb.from("ceva_portal_usuarios").select("id", { count: "exact", head: true }).eq("perfil", "administrador");
  if (error) throw error;
  return (count || 0) > 0;
}
async function outroAdministradorVivo(sb, id) {
  const { count, error } = await sb.from("ceva_portal_usuarios").select("id", { count: "exact", head: true }).eq("perfil", "administrador").neq("status", "inativo").neq("id", id);
  if (error) throw error;
  return (count || 0) > 0;
}
function rowToJson(row) {
  return {
    id: row.id,
    numero: row.numero,
    dataInicio: row.data_inicio,
    dataFim: row.data_fim,
    solicitante: row.solicitante,
    quemAutorizou: row.quem_autorizou,
    servico: row.servico,
    atendimentoPgr: row.atendimento_pgr,
    contrato: row.contrato,
    operacao: row.operacao,
    tsp: row.tsp,
    placa: row.placa,
    motorista: row.motorista,
    franquiaHora: row.franquia_hora,
    franquiaKm: row.franquia_km,
    filledByName: row.filled_by_name,
    filledByEmail: row.filled_by_email,
    createdAt: row.created_at
  };
}
function vehicleKey(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  return "";
}
function chunks(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}
async function loadAll(sb, table) {
  const pageSize = 1e3;
  const rows = [];
  for (let from = 0; from < 2e4; from += pageSize) {
    const { data, error } = await sb.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data || []);
    if (!data || data.length < pageSize) return rows;
  }
  throw new Error(`Consulta de ${table} incompleta.`);
}
async function loadPriceTables(sb, clientName) {
  const pageSize = 1e3;
  const rows = [];
  for (let from = 0; from < 2e4; from += pageSize) {
    const { data, error } = await sb.from("client_price_tables").select("*").or(clientFuzzyFilter(clientName)).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data || []);
    if (!data || data.length < pageSize) return rows;
  }
  throw new Error("Tabelas de pre\xE7o da CEVA incompletas.");
}
async function loadPlates(sb, vehicleIds) {
  const ids = [...new Set(vehicleIds.map(vehicleKey).filter(Boolean))];
  const plates = /* @__PURE__ */ new Map();
  for (const part of chunks(ids, 200)) {
    const { data, error } = await sb.from("client_vehicles").select("id, plate").in("id", part);
    if (error) throw error;
    for (const row of data || []) {
      const plate = String(row.plate || "").trim();
      if (plate && !/^\d+$/.test(plate)) plates.set(String(row.id), plate);
    }
  }
  return plates;
}
async function loadCancelTimes(sb, missionIds) {
  const times = /* @__PURE__ */ new Map();
  for (const part of chunks(missionIds, 80)) {
    const pageSize = 1e3;
    for (let from = 0; from < 2e4; from += pageSize) {
      const { data, error } = await sb.from("mission_history").select("mission_id, changed_at, new_value").in("mission_id", part).eq("field_name", "status").order("changed_at", { ascending: true }).range(from, from + pageSize - 1);
      if (error) throw error;
      for (const row of data || []) {
        if (String(row.new_value || "").toLowerCase().includes("cancel") && row.changed_at) {
          times.set(String(row.mission_id), String(row.changed_at));
        }
      }
      if (!data || data.length < pageSize) break;
      if (from + pageSize >= 2e4) throw new Error("Hist\xF3rico de cancelamento incompleto.");
    }
  }
  return times;
}
async function loadLatestLogs(sb, entity, missionIds) {
  const logs = /* @__PURE__ */ new Map();
  for (const part of chunks(missionIds, 80)) {
    const pageSize = 1e3;
    for (let from = 0; from < 2e4; from += pageSize) {
      const { data, error } = await sb.from("system_logs").select("entity_id, details, created_at").eq("entity", entity).in("entity_id", part).order("created_at", { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw error;
      for (const row of data || []) {
        const id = String(row.entity_id || "");
        if (!id || logs.has(id)) continue;
        try {
          logs.set(id, JSON.parse(row.details));
        } catch {
        }
      }
      if (!data || data.length < pageSize) break;
      if (from + pageSize >= 2e4) throw new Error(`Log ${entity} incompleto.`);
    }
  }
  return logs;
}
var COLUNA_CAMPO = {
  solicitante: "solicitante",
  quemAutorizou: "quem_autorizou",
  servico: "servico",
  atendimentoPgr: "atendimento_pgr",
  contrato: "contrato",
  operacao: "operacao",
  tsp: "tsp"
};
var CATALOGO_CAMPO = {
  solicitante: "solicitante",
  quemAutorizou: "quem_autorizou",
  servico: "servico",
  contrato: "contrato",
  operacao: "operacao",
  tsp: "tsp"
};
function aplicarCamposCliente(item, salvo, servicoDoSistema2) {
  item.solicitante = salvo?.solicitante ?? null;
  item.quemAutorizou = salvo?.quem_autorizou ?? null;
  item.servico = salvo?.servico || servicoDoSistema2(item.servico);
  item.atendimentoPgr = salvo?.atendimento_pgr ?? null;
  item.contrato = salvo?.contrato ?? null;
  item.operacao = salvo?.operacao ?? null;
  item.tsp = salvo?.tsp ?? null;
}
async function loadCamposCliente(sb, missionIds) {
  const map = /* @__PURE__ */ new Map();
  for (const part of chunks(missionIds, 200)) {
    const { data, error } = await sb.from("ceva_portal_os_campos").select("*").in("mission_id", part);
    if (error) throw error;
    for (const row of data || []) map.set(String(row.mission_id), row);
  }
  return map;
}
async function loadCatalogo(sb) {
  const catalogo = {
    solicitante: [],
    quemAutorizou: [],
    servico: [],
    contrato: [],
    operacao: [],
    tsp: []
  };
  const { data, error } = await sb.from("ceva_portal_catalogo").select("campo, valor").order("valor");
  if (error) throw error;
  const reverso = {
    solicitante: "solicitante",
    quem_autorizou: "quemAutorizou",
    servico: "servico",
    contrato: "contrato",
    operacao: "operacao",
    tsp: "tsp"
  };
  for (const row of data || []) {
    const campo = reverso[String(row.campo)];
    if (campo) catalogo[campo].push(String(row.valor));
  }
  return catalogo;
}
async function gravarColuna(sb, missionId, campo, valor) {
  const coluna = COLUNA_CAMPO[campo];
  const { data: atual, error: leitura } = await sb.from("ceva_portal_os_campos").select("*").eq("mission_id", missionId).maybeSingle();
  if (leitura) throw leitura;
  const payload = { ...atual || { mission_id: missionId }, [coluna]: valor, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  delete payload.id;
  const { error } = await sb.from("ceva_portal_os_campos").upsert(payload, { onConflict: "mission_id" });
  if (error) throw error;
  return atual;
}
function hydrateSnapshot(mission, logSnapshot) {
  if (!logSnapshot || mission.snapshot_approved_by) return mission;
  return {
    ...mission,
    snapshot_data: logSnapshot,
    snapshot_approved_by: logSnapshot.approved_by || "Sistema"
  };
}
function parseBody(body) {
  if (typeof body === "string") {
    if (!body.trim()) return {};
    return JSON.parse(body);
  }
  return body || {};
}
function resolveOp(req) {
  const fromQuery = String(req.query?.op || "").trim();
  if (fromQuery) return fromQuery;
  const url = String(req.url || "");
  const path = url.split("?")[0];
  const match = path.match(/\/api\/ceva-portal\/([^/]+)(?:\/([^/]+))?/);
  if (!match) return "";
  const head = match[1];
  const tail = match[2];
  if (head === "pessoas" && tail) {
    req.query = { ...req.query || {}, id: tail };
    return "pessoas-item";
  }
  if (head === "pgr" && tail) {
    req.query = { ...req.query || {}, os: tail };
    return "pgr";
  }
  return head;
}
async function handleCevaPortalHttp(req, res) {
  res.setHeader?.("Cache-Control", "no-store");
  const method = String(req.method || "GET").toUpperCase();
  const op = resolveOp(req);
  const body = method === "GET" || method === "HEAD" ? {} : parseBody(req.body);
  try {
    if (op === "acesso" && method === "GET") {
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      try {
        res.status(200).json({ temAdministrador: await existeAdministrador(sb) });
      } catch (error) {
        console.error("[ceva-portal] acesso", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel abrir o acesso." });
      }
      return;
    }
    if (op === "login" && method === "POST") {
      const email = emailDeAcesso(body?.email) || "";
      const senha = String(body?.senha || body?.password || "");
      const key = `${clientIp(req)}|${email}`;
      if (tooManyAttempts(key)) {
        res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
        return;
      }
      if (!email || !senha) {
        res.status(400).json({ error: "Informe e-mail e senha." });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      const { data: user } = await sb.from("ceva_portal_usuarios").select("id, nome, email, senha_hash, perfil, status, trocar_senha").eq("email", email).maybeSingle();
      if (!user || !senhaConfere(senha, user.senha_hash)) {
        registerFailure(key);
        res.status(401).json({ error: INVALID_LOGIN });
        return;
      }
      if (user.status === "inativo") {
        res.status(403).json({ error: "Este acesso est\xE1 bloqueado. Fale com o administrador." });
        return;
      }
      if (user.status !== "ativo") {
        res.status(403).json({ error: "O administrador ainda n\xE3o liberou este acesso." });
        return;
      }
      const session = sessaoDe(user);
      if (!session) {
        res.status(401).json({ error: INVALID_LOGIN });
        return;
      }
      clearFailures(key);
      res.status(200).json({ token: issueCevaPortalToken(user.id), user: session });
      return;
    }
    if (op === "primeiro-acesso" && method === "POST") {
      const email = emailDeAcesso(body?.email);
      const senha = String(body?.senha || "");
      const confirmacao = String(body?.confirmacao || "");
      const key = `${clientIp(req)}|primeiro|${email || ""}`;
      if (tooManyAttempts(key)) {
        res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
        return;
      }
      if (!email) {
        res.status(400).json({ error: "Informe um e-mail v\xE1lido." });
        return;
      }
      const senhaInvalida = validarSenha(senha);
      if (senhaInvalida) {
        res.status(400).json({ error: senhaInvalida });
        return;
      }
      if (senha !== confirmacao) {
        res.status(400).json({ error: "A confirma\xE7\xE3o da senha n\xE3o confere." });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      try {
        const decisao = decidirPrimeiroAcesso({ existeAdministrador: await existeAdministrador(sb) });
        if (!decisao.ok) {
          res.status(403).json({ error: decisao.error });
          return;
        }
        const nome = nomeDeAcesso(body?.nome);
        if (!nome) {
          res.status(400).json({ error: "Informe o nome do administrador." });
          return;
        }
        if (await existeAdministrador(sb)) {
          res.status(409).json({ error: "O administrador j\xE1 foi criado. Use o login." });
          return;
        }
        const { data: criado, error } = await sb.from("ceva_portal_usuarios").insert({ nome, email, senha_hash: hashSenha(senha), perfil: "administrador", status: "ativo", trocar_senha: false }).select("id, nome, email, perfil, trocar_senha").single();
        if (error || !criado) {
          console.error("[ceva-portal] primeiro administrador", error?.message);
          res.status(500).json({ error: "N\xE3o foi poss\xEDvel criar o administrador." });
          return;
        }
        const session = sessaoDe(criado);
        if (!session) {
          res.status(500).json({ error: "N\xE3o foi poss\xEDvel criar o administrador." });
          return;
        }
        clearFailures(key);
        res.status(201).json({ token: issueCevaPortalToken(criado.id), user: session });
      } catch (error) {
        console.error("[ceva-portal] primeiro acesso", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel concluir o primeiro acesso." });
      }
      return;
    }
    if (op === "me" && method === "GET") {
      const session = await portalSession(req);
      if (!session) {
        res.status(401).json({ error: "Sess\xE3o expirada. Entre novamente." });
        return;
      }
      res.status(200).json({ user: session });
      return;
    }
    if (op === "trocar-senha" && method === "POST") {
      const session = await portalSession(req);
      if (!session) {
        res.status(401).json({ error: "Sess\xE3o expirada. Entre novamente." });
        return;
      }
      const senhaAtual = String(body?.senhaAtual || "");
      const senhaNova = String(body?.senhaNova || "");
      const confirmacao = String(body?.confirmacao || "");
      const senhaInvalida = validarSenha(senhaNova);
      if (!senhaAtual || senhaInvalida) {
        res.status(400).json({ error: senhaInvalida || "Informe a senha atual." });
        return;
      }
      if (senhaNova !== confirmacao) {
        res.status(400).json({ error: "A confirma\xE7\xE3o da senha n\xE3o confere." });
        return;
      }
      if (senhaNova === senhaAtual) {
        res.status(400).json({ error: "A nova senha precisa ser diferente da senha enviada por e-mail." });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      const { data: user } = await sb.from("ceva_portal_usuarios").select("id, senha_hash").eq("id", session.id).maybeSingle();
      if (!user || !senhaConfere(senhaAtual, user.senha_hash)) {
        res.status(401).json({ error: "A senha atual n\xE3o confere." });
        return;
      }
      const { error } = await sb.from("ceva_portal_usuarios").update({ senha_hash: hashSenha(senhaNova), trocar_senha: false, atualizado_em: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", session.id);
      if (error) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel trocar a senha." });
        return;
      }
      res.status(200).json({ user: { ...session, trocarSenha: false } });
      return;
    }
    if (op === "pessoas" && method === "GET") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: "O analista n\xE3o cadastra pessoas." });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      const { data, error } = await sb.from("ceva_portal_usuarios").select("id, nome, email, perfil, status, trocar_senha").order("nome");
      if (error) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel carregar as pessoas." });
        return;
      }
      res.status(200).json({
        pessoas: (data || []).map((row) => ({
          id: row.id,
          nome: row.nome,
          email: row.email,
          perfil: row.perfil,
          status: row.status,
          trocarSenha: row.trocar_senha === true
        }))
      });
      return;
    }
    if (op === "pessoas" && method === "POST") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: "O analista n\xE3o cadastra pessoas." });
        return;
      }
      const nome = nomeDeAcesso(body?.nome);
      const email = emailDeAcesso(body?.email);
      const perfil = perfilDeAcesso(body?.perfil);
      if (!nome) {
        res.status(400).json({ error: "Informe o nome da pessoa." });
        return;
      }
      if (!email) {
        res.status(400).json({ error: "Informe um e-mail v\xE1lido." });
        return;
      }
      if (!perfil) {
        res.status(400).json({ error: "Escolha administrador ou analista." });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      const senhaTemporaria = gerarSenhaTemporaria();
      const { data, error } = await sb.from("ceva_portal_usuarios").insert({ nome, email, perfil, status: "ativo", trocar_senha: true, senha_hash: hashSenha(senhaTemporaria), criado_por: Number(session.id) }).select("id, nome, email, perfil, status, trocar_senha").single();
      if (error?.code === "23505") {
        res.status(409).json({ error: "Este e-mail j\xE1 est\xE1 cadastrado." });
        return;
      }
      if (error || !data) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel liberar o acesso." });
        return;
      }
      const enviou = await sendCevaPortalAccessEmail({ nome, email, senhaTemporaria });
      if (!enviou) {
        await sb.from("ceva_portal_usuarios").delete().eq("id", data.id);
        res.status(503).json({ error: "N\xE3o foi poss\xEDvel enviar o e-mail. O acesso n\xE3o foi liberado." });
        return;
      }
      res.status(201).json({
        pessoa: { id: data.id, nome: data.nome, email: data.email, perfil: data.perfil, status: data.status, trocarSenha: true }
      });
      return;
    }
    if (op === "pessoas-item" && method === "PATCH") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: "O analista n\xE3o cadastra pessoas." });
        return;
      }
      const id = Number(req.query?.id || req.params?.id);
      const status = body?.status === "inativo" ? "inativo" : body?.status === "ativo" ? "ativo" : "";
      if (!Number.isInteger(id) || !status) {
        res.status(400).json({ error: "Informe a pessoa e a situa\xE7\xE3o." });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      const { data: atual, error: leitura } = await sb.from("ceva_portal_usuarios").select("id, perfil, status, senha_hash").eq("id", id).maybeSingle();
      if (leitura) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel alterar a pessoa." });
        return;
      }
      if (!atual) {
        res.status(404).json({ error: "Pessoa n\xE3o encontrada." });
        return;
      }
      const vaiSairDeAdmin = atual.perfil === "administrador" && atual.status !== "inativo" && status === "inativo";
      if (vaiSairDeAdmin && !await outroAdministradorVivo(sb, id)) {
        res.status(409).json({ error: "O portal precisa manter pelo menos um administrador." });
        return;
      }
      const proximo = status === "inativo" ? "inativo" : atual.senha_hash ? "ativo" : "pendente";
      const { data, error } = await sb.from("ceva_portal_usuarios").update({ status: proximo, atualizado_em: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).select("id, nome, email, perfil, status").single();
      if (error || !data) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel alterar a pessoa." });
        return;
      }
      res.status(200).json({ pessoa: data });
      return;
    }
    if (op === "ao-vivo" && method === "GET") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Painel indispon\xEDvel." });
        return;
      }
      try {
        const { montarMissaoAoVivo: montarMissaoAoVivo2, ordenarMissoesAoVivo: ordenarMissoesAoVivo2, STATUS_AO_VIVO: STATUS_AO_VIVO2 } = await Promise.resolve().then(() => (init_aoVivo(), aoVivo_exports));
        const { data, error } = await sb.from("missions").select("id, status, start_time, end_time, mission_type, driver_name, origin, destination, client_vehicle, start_km, end_km").eq("client", "CEVA LOGISTICS LTDA").in("status", [...STATUS_AO_VIVO2]).order("start_time", { ascending: false }).limit(500);
        if (error) throw error;
        if ((data || []).length >= 500) {
          res.status(503).json({ error: "A consulta das miss\xF5es em andamento n\xE3o fechou." });
          return;
        }
        const linhas = data || [];
        const [plates, campos] = await Promise.all([
          loadPlates(sb, linhas.map((row) => row.client_vehicle)),
          loadCamposCliente(sb, linhas.map((row) => String(row.id || "")))
        ]);
        const missoes = ordenarMissoesAoVivo2(linhas.flatMap((row) => {
          const missao = montarMissaoAoVivo2({
            id: String(row.id || ""),
            status: row.status,
            missionType: row.mission_type,
            plate: plates.get(vehicleKey(row.client_vehicle)) || null,
            driver: row.driver_name,
            origin: row.origin,
            destination: row.destination,
            start: row.start_time,
            end: row.end_time,
            startKm: row.start_km,
            endKm: row.end_km,
            campos: campos.get(String(row.id || "")) || null
          });
          return missao ? [missao] : [];
        }));
        res.status(200).json({ atualizadoEm: (/* @__PURE__ */ new Date()).toISOString(), missoes });
      } catch (error) {
        console.error("[ceva-portal] ao-vivo", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel atualizar as miss\xF5es." });
      }
      return;
    }
    if (op === "relatorio" && method === "GET") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Relat\xF3rio indispon\xEDvel." });
        return;
      }
      try {
        const { BillingDatasetIncompleteError: BillingDatasetIncompleteError2, fetchBillingMissionUniverse: fetchBillingMissionUniverse2 } = await Promise.resolve().then(() => (init_fetchBillingMissionUniverse(), fetchBillingMissionUniverse_exports));
        const { linhaDoBoletimCeva: linhaDoBoletimCeva2, numeroOsDoBoletim: numeroOsDoBoletim2 } = await Promise.resolve().then(() => (init_report(), report_exports));
        const { servicoDoSistema: servicoDoSistema2 } = await Promise.resolve().then(() => (init_camposCliente(), camposCliente_exports));
        const { data: clientRow, error: clientError } = await sb.from("clients").select("*").eq("name", "CEVA LOGISTICS LTDA").maybeSingle();
        if (clientError) throw clientError;
        if (!clientRow?.name) {
          res.status(503).json({ error: "Cliente CEVA n\xE3o encontrado." });
          return;
        }
        const canonicalNames = [String(clientRow.name).trim()];
        const tradingName = String(clientRow.trading_name || "").trim();
        if (tradingName && tradingName !== canonicalNames[0]) canonicalNames.push(tradingName);
        const universe = await fetchBillingMissionUniverse2(sb, {
          filterColumn: "client",
          canonicalNames,
          rangeStart: "2026-01-01T03:00:00.000Z",
          rangeEnd: "2100-01-01T02:59:59.999Z"
        });
        const missions = universe.rows.filter((row) => row.exclude_from_billing !== true && numeroOsDoBoletim2(row.id)).sort((a, b) => new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime() || String(b.id).localeCompare(String(a.id)));
        const missionIds = missions.map((row) => row.id);
        const [plates, cancelTimes, adjustments, snapshots, priceTables, providerTables] = await Promise.all([
          loadPlates(sb, missions.map((row) => row.client_vehicle)),
          loadCancelTimes(sb, missions.filter((row) => String(row.status || "").toLowerCase().includes("cancel")).map((row) => row.id)),
          loadLatestLogs(sb, "BillingAdjustment", missionIds),
          loadLatestLogs(sb, "BillingSnapshot", missionIds),
          loadPriceTables(sb, String(clientRow.name)),
          loadAll(sb, "provider_cost_tables")
        ]);
        const items = missions.map((row) => {
          const hydrated = hydrateSnapshot(row, snapshots.get(row.id));
          return linhaDoBoletimCeva2({
            ...hydrated,
            plate: plates.get(vehicleKey(row.client_vehicle)) || null,
            _cancelStatusAt: cancelTimes.get(row.id) || null
          }, {
            priceTables,
            providerTables,
            clientData: clientRow,
            adjustment: adjustments.get(row.id) || void 0
          });
        }).filter((row) => row != null);
        const [campos, catalogo] = await Promise.all([
          loadCamposCliente(sb, missionIds),
          loadCatalogo(sb)
        ]);
        for (const item of items) aplicarCamposCliente(item, campos.get(`GTM-${item.os}`), servicoDoSistema2);
        res.status(200).json({
          periodo: "2026-01-01",
          total: items.length,
          completo: true,
          catalogo,
          items
        });
      } catch (error) {
        const incompleto = error instanceof Error && error.name === "BillingDatasetIncompleteError";
        if (incompleto) {
          console.error("[ceva-portal] relatorio incompleto", error.reason);
          res.status(503).json({ error: "O conjunto de OS do boletim n\xE3o fechou. Nada foi exibido para n\xE3o inventar n\xFAmero." });
          return;
        }
        const message = error instanceof Error ? error.message : "falha";
        console.error("[ceva-portal] relatorio", message);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel carregar as OS da CEVA." });
      }
      return;
    }
    if (op === "campos" && method === "POST") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const { avisoInclusaoAdmin: avisoInclusaoAdmin2, decidirGravacao: decidirGravacao2, ehCampoFiltro: ehCampoFiltro2, podeIncluirFiltroNovo: podeIncluirFiltroNovo2, textoPgr: textoPgr2 } = await Promise.resolve().then(() => (init_camposCliente(), camposCliente_exports));
      const os = String(body?.os || "").trim();
      const campo = String(body?.campo || "");
      const valor = String(body?.valor ?? "");
      const confirmarNovo = body?.confirmarNovo === true;
      if (!/^\d+$/.test(os)) {
        res.status(400).json({ error: "OS inv\xE1lida." });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      const missionId = `GTM-${os}`;
      const { data: mission, error: missionError } = await sb.from("missions").select("id").eq("id", missionId).eq("client", "CEVA LOGISTICS LTDA").maybeSingle();
      if (missionError) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel conferir a OS." });
        return;
      }
      if (!mission) {
        res.status(404).json({ error: "OS n\xE3o encontrada no boletim da CEVA." });
        return;
      }
      try {
        if (campo === "atendimentoPgr") {
          const texto3 = textoPgr2(valor);
          const atual = await gravarColuna(sb, missionId, "atendimentoPgr", texto3 || null);
          const anterior = atual?.atendimento_pgr ?? null;
          if ((anterior || "") !== texto3) {
            const { error: histError } = await sb.from("ceva_portal_pgr_historico").insert({
              mission_id: missionId,
              valor: texto3,
              valor_anterior: anterior,
              alterado_por: session?.name || "Portal CEVA"
            });
            if (histError) throw histError;
          }
          res.status(200).json({ valor: texto3 || null });
          return;
        }
        if (!ehCampoFiltro2(campo)) {
          res.status(400).json({ error: "Campo inv\xE1lido." });
          return;
        }
        const { data: linhas, error: catError } = await sb.from("ceva_portal_catalogo").select("valor").eq("campo", CATALOGO_CAMPO[campo]);
        if (catError) throw catError;
        const catalogo = (linhas || []).map((row) => String(row.valor));
        const decisao = decidirGravacao2(campo, valor, catalogo);
        if (decisao.acao === "confirmar" && !podeIncluirFiltroNovo2(session?.perfil, campo)) {
          res.status(403).json({ error: avisoInclusaoAdmin2(campo) });
          return;
        }
        if (decisao.acao === "confirmar" && !confirmarNovo) {
          res.status(409).json({ confirmar: true, nome: decisao.nome });
          return;
        }
        const gravar = decisao.acao === "limpar" ? null : decisao.acao === "aplicar" ? decisao.valor : decisao.nome;
        if (decisao.acao === "confirmar") {
          const { error: novoError } = await sb.from("ceva_portal_catalogo").upsert(
            { campo: CATALOGO_CAMPO[campo], valor: decisao.nome },
            { onConflict: "campo,valor", ignoreDuplicates: true }
          );
          if (novoError) throw novoError;
        }
        await gravarColuna(sb, missionId, campo, gravar);
        res.status(200).json({ valor: gravar, filtro: decisao.acao === "confirmar" ? decisao.nome : null });
      } catch (error) {
        const message = error instanceof Error ? error.message : "falha";
        console.error("[ceva-portal] campos", message);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel salvar o campo." });
      }
      return;
    }
    if (op === "catalogo" && method === "POST") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (session.perfil !== "administrador") {
        res.status(403).json({ error: "S\xF3 o administrador inclui opera\xE7\xE3o ou TSP nova." });
        return;
      }
      const campo = String(body?.campo || "");
      if (campo !== "operacao" && campo !== "tsp") {
        res.status(400).json({ error: "Informe opera\xE7\xE3o ou TSP." });
        return;
      }
      const confirmarNovo = body?.confirmarNovo === true;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      try {
        const { decidirGravacao: decidirGravacao2 } = await Promise.resolve().then(() => (init_camposCliente(), camposCliente_exports));
        const { data: linhas, error: catError } = await sb.from("ceva_portal_catalogo").select("valor").eq("campo", CATALOGO_CAMPO[campo]);
        if (catError) throw catError;
        const catalogo = (linhas || []).map((row) => String(row.valor));
        const decisao = decidirGravacao2(campo, String(body?.valor ?? ""), catalogo);
        if (decisao.acao === "limpar") {
          res.status(400).json({ error: "Informe o nome." });
          return;
        }
        if (decisao.acao === "confirmar" && !confirmarNovo) {
          res.status(409).json({ confirmar: true, nome: decisao.nome });
          return;
        }
        const nome = decisao.acao === "aplicar" ? decisao.valor : decisao.nome;
        if (decisao.acao === "confirmar") {
          const { error: novoError } = await sb.from("ceva_portal_catalogo").upsert(
            { campo: CATALOGO_CAMPO[campo], valor: nome },
            { onConflict: "campo,valor", ignoreDuplicates: true }
          );
          if (novoError) throw novoError;
        }
        res.status(200).json({ valor: nome });
      } catch (error) {
        console.error("[ceva-portal] catalogo", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel incluir o nome." });
      }
      return;
    }
    if (op === "status" && method === "GET") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Status indispon\xEDvel." });
        return;
      }
      try {
        const { numeroOsDoBoletim: numeroOsDoBoletim2 } = await Promise.resolve().then(() => (init_report(), report_exports));
        const { data: clientRow, error: clientError } = await sb.from("clients").select("name, trading_name").eq("name", "CEVA LOGISTICS LTDA").maybeSingle();
        if (clientError) throw clientError;
        if (!clientRow?.name) {
          res.status(503).json({ error: "Cliente CEVA n\xE3o encontrado." });
          return;
        }
        const names = [String(clientRow.name).trim()];
        const trading = String(clientRow.trading_name || "").trim();
        if (trading && trading !== names[0]) names.push(trading);
        const pageSize = 1e3;
        const rows = [];
        for (let from = 0; from < 2e4; from += pageSize) {
          const { data, error } = await sb.from("missions").select("id, status").in("client", names).range(from, from + pageSize - 1);
          if (error) throw error;
          for (const row of data || []) rows.push({ id: String(row.id || ""), status: row.status });
          if (!data || data.length < pageSize) {
            const items = rows.flatMap((row) => {
              const os = numeroOsDoBoletim2(row.id);
              if (!os) return [];
              const status = String(row.status || "").trim() || "Conclu\xEDda";
              return [{ os, status }];
            });
            res.status(200).json({ atualizadoEm: (/* @__PURE__ */ new Date()).toISOString(), items });
            return;
          }
        }
        res.status(503).json({ error: "A consulta de status da CEVA n\xE3o fechou." });
      } catch (error) {
        console.error("[ceva-portal] status", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel atualizar o status." });
      }
      return;
    }
    if (op === "pgr" && method === "GET") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const os = String(req.query?.os || req.params?.os || "").trim();
      if (!/^\d+$/.test(os)) {
        res.status(400).json({ error: "OS inv\xE1lida." });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      const { data, error } = await sb.from("ceva_portal_pgr_historico").select("valor, valor_anterior, alterado_em, alterado_por").eq("mission_id", `GTM-${os}`).order("alterado_em", { ascending: false }).limit(30);
      if (error) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel carregar o hist\xF3rico." });
        return;
      }
      res.status(200).json({
        historico: (data || []).map((row) => ({
          valor: row.valor || "",
          anterior: row.valor_anterior || "",
          em: row.alterado_em,
          por: row.alterado_por
        }))
      });
      return;
    }
    if (op === "solicitacoes" && method === "GET") {
      if (CEVA_PORTAL_LOGIN_ENABLED) {
        const session = await portalSession(req);
        if (!session) {
          res.status(401).json({ error: "Sess\xE3o expirada. Entre novamente." });
          return;
        }
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      const { data, error } = await sb.from("ceva_escolta_solicitacoes").select("id, numero, data_inicio, data_fim, solicitante, quem_autorizou, servico, atendimento_pgr, contrato, operacao, tsp, placa, motorista, franquia_hora, franquia_km, filled_by_name, filled_by_email, created_at").order("created_at", { ascending: false }).limit(200);
      if (error) {
        console.error("[ceva-portal] list", error.message);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel carregar as solicita\xE7\xF5es." });
        return;
      }
      res.status(200).json({ items: (data || []).map(rowToJson) });
      return;
    }
    if (op === "solicitacoes" && method === "POST") {
      let session = null;
      if (CEVA_PORTAL_LOGIN_ENABLED) {
        session = await portalSession(req);
        if (!session) {
          res.status(401).json({ error: "Sess\xE3o expirada. Entre novamente." });
          return;
        }
      }
      const draft = buildCevaSolicitacao(session, body);
      if (!draft.ok) {
        res.status(400).json({ error: draft.error });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      const value = draft.value;
      const { data, error } = await sb.from("ceva_escolta_solicitacoes").insert({
        data_inicio: value.dataInicio,
        data_fim: value.dataFim,
        solicitante: value.solicitante,
        quem_autorizou: value.quemAutorizou,
        servico: value.servico,
        atendimento_pgr: value.atendimentoPgr,
        contrato: value.contrato,
        operacao: value.operacao,
        tsp: value.tsp,
        placa: value.placa,
        motorista: value.motorista,
        franquia_hora: value.franquiaHora,
        franquia_km: value.franquiaKm,
        filled_by_user_id: value.filledByUserId,
        filled_by_name: value.filledByName,
        filled_by_email: value.filledByEmail
      }).select("id, numero, data_inicio, data_fim, solicitante, quem_autorizou, servico, atendimento_pgr, contrato, operacao, tsp, placa, motorista, franquia_hora, franquia_km, filled_by_name, filled_by_email, created_at").single();
      if (error || !data) {
        console.error("[ceva-portal] insert", error?.message);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel registrar a solicita\xE7\xE3o." });
        return;
      }
      res.status(201).json({ item: rowToJson(data) });
      return;
    }
    res.status(404).json({ error: "Rota do portal CEVA n\xE3o encontrada." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ceva-portal]", message);
    if (!res.headersSent) {
      res.status(500).json({ error: message || "Falha no portal CEVA." });
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handleCevaPortalHttp
});
