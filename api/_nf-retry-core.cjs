"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/supabaseDefaults.ts
var TMSEG_SUPABASE_PROJECT_REF, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY;
var init_supabaseDefaults = __esm({
  "lib/supabaseDefaults.ts"() {
    "use strict";
    TMSEG_SUPABASE_PROJECT_REF = "ajhmmjuewdsukecaimik";
    DEFAULT_SUPABASE_URL = `https://${TMSEG_SUPABASE_PROJECT_REF}.supabase.co`;
    DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";
  }
});

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
function resolveSupabasePublicEnv(env) {
  const urlCandidates = [
    env.VITE_SUPABASE_URL,
    env.SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL
  ];
  let url = DEFAULT_SUPABASE_URL;
  for (const candidate of urlCandidates) {
    const value = cleanEnv(candidate);
    if (isValidHttpUrl(value) && isTmSegSupabaseUrl(value)) {
      url = value;
      break;
    }
  }
  const keyCandidates = [
    env.VITE_SUPABASE_ANON_KEY,
    env.SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ];
  let anonKey = DEFAULT_SUPABASE_ANON_KEY;
  for (const candidate of keyCandidates) {
    const value = cleanEnv(candidate);
    if (isTmSegSupabaseAnonKey(value, url)) {
      anonKey = value;
      break;
    }
  }
  return { url, anonKey };
}
var init_supabasePublicEnv = __esm({
  "lib/supabasePublicEnv.ts"() {
    "use strict";
    init_supabaseDefaults();
  }
});

// lib/supabaseAdmin.ts
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
function resolveServerSupabaseFromProcessEnv() {
  return resolveSupabasePublicEnv(process.env);
}
var import_supabase_js, warnedMissingServiceRole, warnedAnonKeyAsService, warnedAnonFallback, warnedForeignProject;
var init_supabaseAdmin = __esm({
  "lib/supabaseAdmin.ts"() {
    "use strict";
    import_supabase_js = require("@supabase/supabase-js");
    init_supabaseDefaults();
    init_supabasePublicEnv();
    warnedMissingServiceRole = false;
    warnedAnonKeyAsService = false;
    warnedAnonFallback = false;
    warnedForeignProject = false;
  }
});

// server/supabaseConfig.ts
var supabaseConfig_exports = {};
__export(supabaseConfig_exports, {
  createSupabaseAdminClient: () => createSupabaseAdminClient,
  getSupabaseAnonKey: () => getSupabaseAnonKey,
  getSupabaseServerKey: () => getSupabaseServerKey,
  getSupabaseServiceRoleKey: () => getSupabaseServiceRoleKey,
  getSupabaseUrl: () => getSupabaseUrl,
  resolveServerSupabaseFromProcessEnv: () => resolveServerSupabaseFromProcessEnv
});
var init_supabaseConfig = __esm({
  "server/supabaseConfig.ts"() {
    "use strict";
    init_supabaseAdmin();
  }
});

// server/nfRetryWorker.ts
var nfRetryWorker_exports = {};
__export(nfRetryWorker_exports, {
  listPendingNfs: () => listPendingNfs,
  listStuckNfs: () => listStuckNfs,
  reopenPausedNfs: () => reopenPausedNfs,
  retryOne: () => retryOne,
  runRetryCycle: () => runRetryCycle,
  startNfRetryWorker: () => startNfRetryWorker
});
module.exports = __toCommonJS(nfRetryWorker_exports);

// lib/asaasEnvKeys.ts
function sanitizeAsaasEnvValue(raw) {
  return String(raw || "").replace(/^\uFEFF/, "").replace(/[\r\n\u200b\u200c\u200d]/g, "").trim().replace(/^["']+|["']+$/g, "");
}
function readFirstEnv(...names) {
  for (const name of names) {
    const value = sanitizeAsaasEnvValue(process.env[name]);
    if (value) return value;
  }
  return "";
}
function getAsaasApiKeyTmGestao() {
  return readFirstEnv(
    "Asaas_TMSEGEST\xC3O_API",
    "ASAAS_TMSEGEST\xC3O_API",
    "Asaas_TMSEGESTAO_API",
    "ASAAS_TMSEGESTAO_API",
    "ASAAS_TMGESTAO_API",
    "TMGESTAO",
    "ASAAS_API_KEY",
    "ASAAS_API_KEY_TMGESTAO"
  );
}
function getAsaasApiKeyTmSeguranca() {
  return readFirstEnv(
    "TMSEGURANCA",
    "ASAAS_TMSEGURANCA_API",
    "TMSEGURAN\xC7A",
    "ASAAS_API_KEY_TMSECURITY",
    "ASAAS_API_KEY_TM_SEGURANCA"
  );
}
function getAsaasApiKeyTmSecurity() {
  return readFirstEnv(
    "ASAAS_TMSECURITY_API",
    "TMSECURITY",
    "ASAAS_API_KEY_TMSECURITY_60",
    "ASAAS_API_KEY_TM_SECURITY"
  );
}

// lib/asaasPendingTransferMemory.ts
var MEMORY_TTL_MS = 20 * 60 * 1e3;

// lib/services/asaasPendingTransferService.ts
var MEMORY_TTL_MS2 = 20 * 60 * 1e3;

// lib/nfDiscrimination.ts
var ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH = 250;
var NFSE_DISCRIMINATION_MAX_LENGTH = 2e3;
function normalizeLineBreaks(value) {
  return value.replace(/\r\n?|\n/g, "|").trim();
}
function assertXmlTextCompatible(value, field) {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new Error(`${field} cont\xE9m caractere de controle incompat\xEDvel com XML.`);
  }
}
function removeDuplicatedDescription(serviceDescription, observations) {
  if (observations === serviceDescription) return "";
  if (!observations.startsWith(serviceDescription)) return observations;
  const suffix = observations.slice(serviceDescription.length);
  if (suffix && !/^[\s|:;,\-–—]/.test(suffix)) return observations;
  return suffix.replace(/^[\s|:;,\-–—]+/, "");
}
function normalizeAsaasNfDiscrimination(input) {
  const serviceDescription = normalizeLineBreaks(String(input.serviceDescription || ""));
  if (!serviceDescription) {
    throw new Error("Descri\xE7\xE3o do servi\xE7o ausente para emiss\xE3o da NFS-e.");
  }
  assertXmlTextCompatible(serviceDescription, "Descri\xE7\xE3o do servi\xE7o");
  if (serviceDescription.length > ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      `Descri\xE7\xE3o do servi\xE7o excede ${ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH} caracteres; a emiss\xE3o foi bloqueada para evitar truncamento fiscal.`
    );
  }
  const normalizedObservations = normalizeLineBreaks(String(input.observations || ""));
  assertXmlTextCompatible(normalizedObservations, "Observa\xE7\xF5es da NFS-e");
  const observations = removeDuplicatedDescription(
    serviceDescription,
    normalizedObservations
  );
  const combinedLength = serviceDescription.length + (observations ? 1 + observations.length : 0);
  if (combinedLength > NFSE_DISCRIMINATION_MAX_LENGTH) {
    throw new Error(
      `Discrimina\xE7\xE3o fiscal excede ${NFSE_DISCRIMINATION_MAX_LENGTH} caracteres; a emiss\xE3o foi bloqueada sem truncar informa\xE7\xF5es.`
    );
  }
  return observations ? { serviceDescription, observations } : { serviceDescription };
}

// server/asaasService.ts
function asaasCompanies() {
  return {
    "TM GEST\xC3O": {
      apiKey: getAsaasApiKeyTmGestao(),
      cnpj: "60485843000157",
      name: "TM GEST\xC3O",
      aliases: ["TM GESTAO", "TM GEST\xC3O", "GESTAO", "GEST\xC3O"],
      nf: {
        // Amazon/TM GESTÃO: código 07930 (monitoramento) + ISS 2% (Simples Nacional).
        serviceDescription: "CONTRATA\xC7\xC3O E INTERMEDIA\xC7\xC3O DE CONTRATOS E AGENCIAMENTO DE VENDAS",
        issRate: 2,
        retainIss: false,
        municipalServiceCode: "07930",
        municipalServiceName: "07930 - Monitoramento e rastreamento a dist\xE2ncia de ve\xEDculos, cargas, pessoas e semoventes"
      }
    },
    "TM SEGURANCA": {
      apiKey: getAsaasApiKeyTmSeguranca(),
      cnpj: "28804378000167",
      name: "Tm Seguranca Consultoria & Tecnologia Integrada Ltda",
      aliases: ["TM SEGURAN\xC7A", "TM SEGURANCA", "TMSEGURANCA", "TMSEGURAN\xC7A", "SEGURAN\xC7A", "SEGURANCA", "TM SEGURANCA CONSULTORIA"],
      nf: {
        serviceDescription: "Ref. aos Servi\xE7os de Intermedia\xE7\xE3o de Escolta Armada",
        issRate: 5,
        retainIss: false,
        municipalServiceCode: "07930",
        municipalServiceName: "07930 - Monitoramento e rastreamento a dist\xE2ncia de ve\xEDculos, cargas, pessoas e semoventes"
      }
    },
    "TM SECURITY": {
      apiKey: getAsaasApiKeyTmSecurity(),
      cnpj: "60508931000127",
      name: "TM Security Gest\xE3o Corporativa Ltda",
      aliases: ["TM SECURITY", "TMSECURITY", "SECURITY", "TM SECURITY GESTAO", "TM SECURITY GEST\xC3O"],
      nf: {
        serviceDescription: "Ref. aos Servi\xE7os de Intermedia\xE7\xE3o de Escolta Armada",
        issRate: 5,
        retainIss: false,
        municipalServiceCode: "07930",
        municipalServiceName: "07930 - Monitoramento e rastreamento a dist\xE2ncia de ve\xEDculos, cargas, pessoas e semoventes"
      }
    }
  };
}
function resolveCompanyEntry(company) {
  const companies = asaasCompanies();
  if (company) {
    const upper = company.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const [, val] of Object.entries(companies)) {
      const normalizedAliases = val.aliases.map((a) => a.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      if (normalizedAliases.some((alias) => upper.includes(alias) || alias.includes(upper))) return val;
      if (upper.includes(val.cnpj)) return val;
      const normalizedName = val.name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedName.includes(upper) || upper.includes(normalizedName)) return val;
    }
  }
  return companies["TM GEST\xC3O"];
}
function resolveApiKey(company) {
  return resolveCompanyEntry(company).apiKey;
}
function resolveAsaasBaseUrl(company) {
  const custom = String(process.env.ASAAS_API_BASE_URL || process.env.ASAAS_BASE_URL || "").trim().replace(/\/$/, "");
  if (custom) return custom;
  const keySample = resolveApiKey(company) || "";
  if (keySample.includes("_hmlg_") || keySample.includes("_sandbox_")) {
    return "https://sandbox.asaas.com/api/v3";
  }
  return "https://api.asaas.com/v3";
}
var headers = (company) => ({
  "Content-Type": "application/json",
  "access_token": resolveApiKey(company)
});
var ASAAS_FETCH_TIMEOUT_MS = 8e3;
function buildAsaasAbortSignal(external) {
  let timeoutSignal;
  let cleanup;
  const anyFactory = AbortSignal.timeout;
  if (typeof anyFactory === "function") {
    timeoutSignal = anyFactory(ASAAS_FETCH_TIMEOUT_MS);
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ASAAS_FETCH_TIMEOUT_MS);
    timeoutSignal = controller.signal;
    cleanup = () => clearTimeout(timer);
  }
  if (external && typeof AbortSignal.any === "function") {
    return { signal: AbortSignal.any([external, timeoutSignal]), cleanup };
  }
  return { signal: timeoutSignal, cleanup };
}
async function asaasFetch(endpoint, options = {}, company) {
  const entry = resolveCompanyEntry(company);
  const apiKey = entry.apiKey;
  if (!apiKey) throw new Error("ASAAS_API_KEY n\xE3o configurada para a empresa selecionada");
  const keyPrefix = apiKey.substring(0, 12) + "...";
  if (options.method && options.method !== "GET") {
    console.log(`[Asaas] ${options.method} ${endpoint} | Empresa: ${entry.name} | CNPJ: ${entry.cnpj} | Key: ${keyPrefix}`);
  }
  const url = `${resolveAsaasBaseUrl(company)}${endpoint}`;
  const { signal, cleanup } = buildAsaasAbortSignal(options.signal || null);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      signal,
      headers: { ...headers(company), ...options.headers || {} }
    });
    const text = await res.text();
    let data = {};
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Resposta inv\xE1lida do Asaas (${res.status})`);
      }
    }
    if (!res.ok) {
      const errMsg = data.errors?.map((e) => e.description).join("; ") || data.message || JSON.stringify(data);
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Asaas API Error (${res.status}): ${errMsg} \u2014 empresa ${entry.name}. Confira na Vercel a chave de produ\xE7\xE3o ($aact_prod_...) desta empresa (TM GEST\xC3O: Asaas_TMSEGEST\xC3O_API). Saldo e NF usam a mesma chave em runtime.`
        );
      }
      throw new Error(`Asaas API Error (${res.status}): ${errMsg}`);
    }
    return data;
  } catch (err) {
    const name = String(err?.name || "");
    if (name === "AbortError" || name === "TimeoutError" || /aborted|timeout/i.test(String(err?.message || ""))) {
      throw new Error(
        `Timeout ao comunicar com Asaas (${ASAAS_FETCH_TIMEOUT_MS / 1e3}s) \u2014 ${endpoint} [${Date.now() - started}ms]`
      );
    }
    throw err;
  } finally {
    cleanup?.();
  }
}
async function listMunicipalServices(company) {
  const data = await asaasFetch("/invoices/municipalServices", {}, company);
  return data?.data || [];
}
var municipalServiceCache = {};
async function resolveMunicipalService(company) {
  const key = company || "__default__";
  if (municipalServiceCache[key]) return municipalServiceCache[key];
  try {
    const services = await listMunicipalServices(company);
    console.log(`[Asaas] Servi\xE7os municipais encontrados para ${key}: ${services.length} item(s)`);
    services.forEach((s, i) => {
      console.log(`[Asaas]   [${i}] ID=${s.id} | C\xF3digo=${s.code || s.municipalServiceCode || "-"} | ${(s.description || s.name || "-").substring(0, 100)}`);
    });
    if (services.length > 0) {
      const preferred = services.find((s) => {
        const desc = (s.description || s.name || "").toLowerCase();
        const code = String(s.code || s.municipalServiceCode || "");
        return code.includes("07930") || code.includes("03115") || code.includes("17.01") || desc.includes("monitoramento") || desc.includes("rastreamento") || desc.includes("escolta") || desc.includes("seguran\xE7a") || desc.includes("vigil\xE2ncia") || desc.includes("seguranca") || desc.includes("assessoria") || desc.includes("consultoria");
      }) || services[0];
      const rawName = String(preferred.description || preferred.name || "");
      const info = {
        id: String(preferred.id),
        code: String(preferred.code || preferred.municipalServiceCode || ""),
        name: rawName.length > 200 ? rawName.substring(0, 200) : rawName
      };
      municipalServiceCache[key] = info;
      console.log(`[Asaas] Servi\xE7o municipal selecionado para ${key}: ID=${info.id} | C\xF3digo=${info.code} | ${info.name}`);
      return info;
    }
  } catch (e) {
    console.log(`[Asaas] N\xE3o foi poss\xEDvel buscar servi\xE7os municipais: ${e.message}`);
  }
  return void 0;
}
var clientNfCache = {};
var CLIENT_NF_CACHE_TTL_MS = 6e4;
function formatCnpjMask(digits) {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 14) return d;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
function isAmazonClientLabel(name) {
  return String(name || "").toUpperCase().includes("AMAZON");
}
var AMAZON_NF_DEFAULTS = {
  serviceDescription: "CONTRATA\xC7\xC3O E INTERMEDIA\xC7\xC3O DE CONTRATOS E AGENCIAMENTO DE VENDAS",
  municipalServiceCode: "07930",
  municipalServiceName: "07930 - Monitoramento e rastreamento a dist\xE2ncia de ve\xEDculos, cargas, pessoas e semoventes"
};
async function lookupClientNfDefaults(cnpj, name) {
  if (!cnpj && !name) return null;
  const key = (cnpj || "").replace(/\D/g, "") || `name:${(name || "").toUpperCase().trim()}`;
  const cached = clientNfCache[key];
  if (cached && Date.now() - cached.ts < CLIENT_NF_CACHE_TTL_MS) return cached.value;
  try {
    const { createSupabaseAdminClient: createSupabaseAdminClient2 } = await Promise.resolve().then(() => (init_supabaseConfig(), supabaseConfig_exports));
    const supabase = createSupabaseAdminClient2();
    if (!supabase) {
      if (isAmazonClientLabel(name)) {
        clientNfCache[key] = { value: AMAZON_NF_DEFAULTS, ts: Date.now() };
        return AMAZON_NF_DEFAULTS;
      }
      return null;
    }
    let row = null;
    if (cnpj) {
      const cleanCnpj = cnpj.replace(/\D/g, "");
      const formatted = formatCnpjMask(cleanCnpj);
      const { data } = await supabase.from("clients").select("name, trading_name, nf_service_description, nf_municipal_service_code, nf_municipal_service_name").or(`cnpj.eq.${cleanCnpj},cnpj.eq.${formatted}`).limit(1).maybeSingle();
      row = data;
    }
    if (!row && name) {
      const { data } = await supabase.from("clients").select("name, trading_name, nf_service_description, nf_municipal_service_code, nf_municipal_service_name").ilike("name", name.split(/[\s,.]+/)[0] + "%").limit(1).maybeSingle();
      row = data;
    }
    const rowName = `${row?.name || ""} ${row?.trading_name || ""} ${name || ""}`;
    if (isAmazonClientLabel(rowName)) {
      const out2 = {
        serviceDescription: row?.nf_service_description || AMAZON_NF_DEFAULTS.serviceDescription,
        municipalServiceCode: row?.nf_municipal_service_code || AMAZON_NF_DEFAULTS.municipalServiceCode,
        municipalServiceName: row?.nf_municipal_service_name || AMAZON_NF_DEFAULTS.municipalServiceName
      };
      if (!out2.municipalServiceCode || out2.municipalServiceCode === "07930") {
        out2.municipalServiceCode = AMAZON_NF_DEFAULTS.municipalServiceCode;
        out2.municipalServiceName = AMAZON_NF_DEFAULTS.municipalServiceName;
        if (!out2.serviceDescription) out2.serviceDescription = AMAZON_NF_DEFAULTS.serviceDescription;
      }
      clientNfCache[key] = { value: out2, ts: Date.now() };
      return out2;
    }
    const out = row ? {
      serviceDescription: row.nf_service_description || null,
      municipalServiceCode: row.nf_municipal_service_code || null,
      municipalServiceName: row.nf_municipal_service_name || null
    } : null;
    clientNfCache[key] = { value: out, ts: Date.now() };
    return out;
  } catch (e) {
    if (e?.code === "42703") {
      console.log("[Asaas NF] coluna nf_service_description ainda n\xE3o existe \u2014 usando padr\xE3o da empresa.");
    }
    clientNfCache[key] = { value: null, ts: Date.now() };
    return null;
  }
}
async function scheduleInvoice(params) {
  const companyEntry = resolveCompanyEntry(params.company);
  const nfConfig = companyEntry.nf;
  const overrideCode = String(params.municipalServiceCode || "").replace(/\D/g, "");
  const clientDefaults = await lookupClientNfDefaults(params.clientCnpj, params.clientName);
  const isAmazonNf = isAmazonClientLabel(params.clientName);
  const taxes = {
    retainIss: params.taxes?.retainIss ?? nfConfig.retainIss,
    iss: params.taxes?.iss ?? nfConfig.issRate,
    cofins: params.taxes?.cofins ?? nfConfig.cofins ?? 0,
    csll: params.taxes?.csll ?? nfConfig.csll ?? 0,
    inss: params.taxes?.inss ?? nfConfig.inss ?? 0,
    ir: params.taxes?.ir ?? nfConfig.ir ?? 0,
    pis: params.taxes?.pis ?? nfConfig.pis ?? 0
  };
  let rawDesc = (isAmazonNf ? clientDefaults?.serviceDescription || AMAZON_NF_DEFAULTS.serviceDescription : clientDefaults?.serviceDescription) || params.serviceDescription || nfConfig.serviceDescription;
  const codePrefix = /^\s*\d{4,6}\s*[|\-–]/;
  if (codePrefix.test(rawDesc)) {
    console.log(`[Asaas NF] Descri\xE7\xE3o mal formatada detectada ("${rawDesc.substring(0, 60)}..."). Substituindo por padr\xE3o da empresa para evitar NFe003.`);
    rawDesc = nfConfig.serviceDescription;
  }
  const normalizedDiscrimination = normalizeAsaasNfDiscrimination({
    serviceDescription: rawDesc,
    observations: params.observations
  });
  const body = {
    payment: params.paymentId,
    ...normalizedDiscrimination,
    taxes,
    effectiveDatePeriod: "ON_PAYMENT_CREATION"
  };
  const overrideName = String(params.municipalServiceName || "").trim();
  const clientCode = String(clientDefaults?.municipalServiceCode || "").replace(/\D/g, "");
  const clientNameSvc = String(clientDefaults?.municipalServiceName || "").trim();
  if (isAmazonNf) {
    body.municipalServiceCode = AMAZON_NF_DEFAULTS.municipalServiceCode;
    body.municipalServiceName = AMAZON_NF_DEFAULTS.municipalServiceName;
  } else if (params.municipalServiceId) {
    body.municipalServiceId = params.municipalServiceId;
  } else if (overrideCode) {
    body.municipalServiceCode = overrideCode;
    if (overrideName) body.municipalServiceName = overrideName;
  } else if (clientCode) {
    body.municipalServiceCode = clientCode;
    if (clientNameSvc) body.municipalServiceName = clientNameSvc;
  } else if (nfConfig.municipalServiceCode) {
    body.municipalServiceCode = nfConfig.municipalServiceCode;
    if (nfConfig.municipalServiceName) body.municipalServiceName = nfConfig.municipalServiceName;
  } else {
    try {
      const municipalService = await Promise.race([
        resolveMunicipalService(params.company),
        new Promise((resolve) => setTimeout(() => resolve(null), 5e3))
      ]);
      if (municipalService) {
        body.municipalServiceId = municipalService.id;
        body.municipalServiceCode = municipalService.code;
        body.municipalServiceName = municipalService.name;
      }
    } catch {
    }
    if (!body.municipalServiceCode && !body.municipalServiceId) {
      throw new Error(
        `Servi\xE7o municipal ausente para ${companyEntry.name}. No painel Asaas: Configura\xE7\xF5es \u2192 Nota Fiscal (Inscri\xE7\xE3o Municipal + CNAE/c\xF3digo). Ou informe o c\xF3digo de servi\xE7o no modal de emiss\xE3o.`
      );
    }
  }
  if (params.externalReference) body.externalReference = params.externalReference;
  console.log(
    `[Asaas NF] POST /invoices payment=${params.paymentId} company=${companyEntry.name} code=${body.municipalServiceCode || body.municipalServiceId || "-"}`
  );
  try {
    return await asaasFetch("/invoices", { method: "POST", body: JSON.stringify(body) }, params.company);
  } catch (e) {
    const msg = String(e?.message || e);
    throw new Error(
      msg.includes("Asaas API Error") ? msg : `Falha ao agendar NF no Asaas: ${msg}. Verifique Inscri\xE7\xE3o Municipal / certificado / c\xF3digo de servi\xE7o no painel Asaas.`
    );
  }
}
async function getInvoice(invoiceId, company) {
  return asaasFetch(`/invoices/${invoiceId}`, {}, company);
}
async function cancelInvoice(invoiceId, company) {
  return asaasFetch(`/invoices/${invoiceId}/cancel`, { method: "POST" }, company);
}
async function getInvoiceByPayment(paymentId, company) {
  return asaasFetch(`/invoices?payment=${paymentId}`, {}, company);
}

// server/nfRetryWorker.ts
init_supabaseConfig();

// server/plugnotasService.ts
init_supabaseConfig();
var SANDBOX_URL = "https://api.sandbox.plugnotas.com.br";
var PRODUCTION_URL = "https://api.plugnotas.com.br";
function getPlugNotasEnv() {
  const env = (process.env.PLUGNOTAS_ENV || "sandbox").toLowerCase();
  return env === "production" ? "production" : "sandbox";
}
function getPlugNotasBaseUrl() {
  return getPlugNotasEnv() === "production" ? PRODUCTION_URL : SANDBOX_URL;
}
function getPlugNotasToken() {
  const env = getPlugNotasEnv();
  if (env === "production") {
    return process.env.PLUGNOTAS_API_TOKEN || "";
  }
  return process.env.PLUGNOTAS_API_TOKEN_SANDBOX || process.env.PLUGNOTAS_API_TOKEN || "";
}
function isPlugNotasConfigured() {
  return !!getPlugNotasToken();
}
var PLUGNOTAS_COMPANIES = {
  "TM GESTAO": {
    cnpj: "60485843000157",
    name: "TM GEST\xC3O",
    aliases: ["TM GESTAO", "TM GEST\xC3O", "GESTAO", "GEST\xC3O"],
    serviceDescription: "Ref. aos Servi\xE7os de Intermedia\xE7\xE3o de Escolta Armada",
    issRate: 5,
    municipalServiceCode: "07930",
    municipalServiceName: "07930 - Monitoramento e rastreamento a dist\xE2ncia de ve\xEDculos, cargas, pessoas e semoventes",
    cnae: "8011102",
    cidadeIBGE: "3550308",
    uf: "SP"
  },
  "TM SEGURANCA": {
    cnpj: "28804378000167",
    name: "Tm Seguranca Consultoria & Tecnologia Integrada Ltda",
    aliases: ["TM SEGURAN\xC7A", "TM SEGURANCA", "TMSEGURANCA", "TMSEGURAN\xC7A", "SEGURAN\xC7A", "SEGURANCA"],
    serviceDescription: "Ref. aos Servi\xE7os de Intermedia\xE7\xE3o de Escolta Armada",
    issRate: 5,
    municipalServiceCode: "07930",
    municipalServiceName: "07930 - Monitoramento e rastreamento a dist\xE2ncia de ve\xEDculos, cargas, pessoas e semoventes",
    cnae: "8011102",
    cidadeIBGE: "3550308",
    uf: "SP"
  },
  "TM SECURITY": {
    cnpj: "60508931000127",
    name: "TM Security Gest\xE3o Corporativa Ltda",
    aliases: ["TM SECURITY", "TMSECURITY", "SECURITY", "TM SECURITY GESTAO", "TM SECURITY GEST\xC3O"],
    serviceDescription: "Ref. aos Servi\xE7os de Intermedia\xE7\xE3o de Escolta Armada",
    issRate: 5,
    municipalServiceCode: "07930",
    municipalServiceName: "07930 - Monitoramento e rastreamento a dist\xE2ncia de ve\xEDculos, cargas, pessoas e semoventes",
    cnae: "8011102",
    cidadeIBGE: "3550308",
    uf: "SP"
  }
};
function normalize(s) {
  return (s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
function resolvePlugNotasCompany(company) {
  if (company) {
    const upper = normalize(company);
    for (const val of Object.values(PLUGNOTAS_COMPANIES)) {
      const aliases = val.aliases.map(normalize);
      if (aliases.some((a) => upper.includes(a) || a.includes(upper))) return val;
      if (upper.includes(val.cnpj)) return val;
      if (normalize(val.name).includes(upper) || upper.includes(normalize(val.name))) return val;
    }
  }
  return PLUGNOTAS_COMPANIES["TM GESTAO"];
}
function headers2() {
  return {
    "Content-Type": "application/json",
    "X-API-KEY": getPlugNotasToken()
  };
}
async function plugFetch(path, init = {}) {
  const token = getPlugNotasToken();
  if (!token) throw new Error("PlugNotas n\xE3o configurado \u2014 defina PLUGNOTAS_API_TOKEN_SANDBOX ou PLUGNOTAS_API_TOKEN.");
  const url = `${getPlugNotasBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12e3);
  try {
    const resp = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { ...headers2(), ...init.headers || {} }
    });
    const text = await resp.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!resp.ok) {
      const msg = extractPlugNotasError(data) || `HTTP ${resp.status}`;
      const err = new Error(`PlugNotas: ${msg}`);
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Timeout ao consultar PlugNotas (12s)");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
function extractPlugNotasError(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  const parts = [];
  if (data.message) parts.push(String(data.message));
  if (data.error) parts.push(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
  if (Array.isArray(data.erros)) {
    for (const e of data.erros) {
      if (typeof e === "string") parts.push(e);
      else if (e?.mensagem) parts.push(`${e.codigo || ""} ${e.mensagem}`.trim());
      else if (e?.message) parts.push(e.message);
    }
  }
  if (Array.isArray(data.errors)) {
    for (const e of data.errors) {
      if (typeof e === "string") parts.push(e);
      else if (e?.message) parts.push(e.message);
    }
  }
  if (data.protocoloPrefeitura?.mensagem) parts.push(String(data.protocoloPrefeitura.mensagem));
  return parts.join(" | ").substring(0, 500) || JSON.stringify(data).substring(0, 500);
}
async function lookupClientForNf(cnpj, name) {
  if (!cnpj && !name) return null;
  try {
    const sb = createSupabaseAdminClient();
    if (!sb) return null;
    let row = null;
    if (cnpj) {
      const cleanCnpj = cnpj.replace(/\D/g, "");
      const { data } = await sb.from("clients").select("*").eq("cnpj", cleanCnpj).maybeSingle();
      row = data;
    }
    if (!row && name) {
      const firstWord = name.split(/[\s,.]+/)[0];
      const { data } = await sb.from("clients").select("*").ilike("name", firstWord + "%").limit(1).maybeSingle();
      row = data;
    }
    if (!row) return name ? { name } : null;
    return {
      cnpj: (row.cnpj || "").replace(/\D/g, "") || void 0,
      name: row.name || name || "",
      email: row.email || row.financial_email || void 0,
      phone: row.phone || void 0,
      address: {
        logradouro: row.address || row.street || void 0,
        numero: row.address_number || row.number || "S/N",
        complemento: row.address_complement || void 0,
        bairro: row.address_neighborhood || row.neighborhood || void 0,
        codigoCidade: row.city_ibge_code || void 0,
        cidade: row.city || void 0,
        estado: row.state || void 0,
        cep: (row.zip_code || row.cep || "").replace(/\D/g, "") || void 0
      }
    };
  } catch (e) {
    console.log("[PlugNotas] lookupClientForNf falhou:", e?.message || e);
    return name ? { name } : null;
  }
}
function sanitizeDescription(desc, fallback) {
  let raw = desc || fallback;
  const codePrefix = /^\s*\d{4,6}\s*[|\-–]/;
  if (codePrefix.test(raw)) {
    console.log(`[PlugNotas] Descri\xE7\xE3o mal formatada ("${raw.substring(0, 60)}..."). Substituindo pela padr\xE3o.`);
    raw = fallback;
  }
  raw = raw.replace(/[^\w\s\-.,;:/À-ÿ()&]/g, " ").replace(/\s+/g, " ").trim();
  return raw.length > 250 ? raw.substring(0, 247) + "..." : raw;
}
async function issueNfse(params) {
  const cfg = resolvePlugNotasCompany(params.company);
  const client = await lookupClientForNf(params.clientCnpj, params.clientName);
  const valorServico = Math.round(params.amount * 100) / 100;
  const valorIss = Math.round(valorServico * (cfg.issRate / 100) * 100) / 100;
  const idIntegracao = `inv-${params.invoiceId}-${Date.now()}`;
  const tomadorDoc = (params.clientCnpj || client?.cnpj || "").replace(/\D/g, "");
  if (!tomadorDoc || tomadorDoc.length < 11) {
    throw new Error("CNPJ/CPF do tomador ausente ou inv\xE1lido \u2014 cadastre o documento do cliente antes de emitir.");
  }
  const tomadorEndereco = client?.address?.logradouro ? {
    logradouro: client.address.logradouro,
    numero: client.address.numero || "S/N",
    complemento: client.address.complemento,
    bairro: client.address.bairro,
    codigoCidade: client.address.codigoCidade,
    cidade: client.address.cidade,
    estado: client.address.estado,
    cep: client.address.cep
  } : void 0;
  const discriminacao = sanitizeDescription(params.serviceDescription || cfg.serviceDescription, cfg.serviceDescription);
  const payload = [{
    idIntegracao,
    cnpjEmissor: cfg.cnpj,
    referencia: params.externalReference || params.invoiceId,
    cliente: {
      cpfCnpj: tomadorDoc,
      razaoSocial: client?.name || params.clientName,
      email: client?.email || params.clientEmail || void 0,
      endereco: tomadorEndereco
    },
    servico: {
      valor: {
        servico: valorServico,
        iss: valorIss
      },
      discriminacao,
      codigoTributacaoMunicipio: String(params.municipalServiceCode || "").replace(/\D/g, "") || cfg.municipalServiceCode,
      codigoCnae: cfg.cnae,
      iss: {
        aliquota: cfg.issRate,
        tipoTributacao: 1,
        exigibilidade: 1
      }
    }
  }];
  console.log(`[PlugNotas] Emitindo NF (${getPlugNotasEnv()}): emissor=${cfg.cnpj} tomador=${tomadorDoc} valor=${valorServico} idIntegracao=${idIntegracao}`);
  const data = await plugFetch("/nfse", { method: "POST", body: JSON.stringify(payload) });
  const first = Array.isArray(data?.documents) ? data.documents[0] : Array.isArray(data) ? data[0] : data;
  return {
    idIntegracao,
    plugnotasId: first?.id || first?._id || data?.id || null,
    protocol: first?.protocoloPrefeitura?.numero || first?.protocolo || null,
    status: first?.status || data?.status || "PROCESSING",
    raw: data
  };
}
async function consultNfseByIntegration(idIntegracao) {
  return plugFetch(`/nfse/consultar/${encodeURIComponent(idIntegracao)}`);
}
async function consultNfseById(plugnotasId) {
  return plugFetch(`/nfse/${encodeURIComponent(plugnotasId)}`);
}
async function getNfsePdfUrl(plugnotasId) {
  return `${getPlugNotasBaseUrl()}/nfse/pdf/${encodeURIComponent(plugnotasId)}`;
}
async function cancelNfse(plugnotasId, motivo = "Cancelamento solicitado pelo emissor") {
  return plugFetch(`/nfse/${encodeURIComponent(plugnotasId)}/cancelar`, {
    method: "POST",
    body: JSON.stringify({ motivo: motivo.substring(0, 250) })
  });
}
function mapPlugNotasStatusToNf(status) {
  if (!status) return "PROCESSING";
  const s = String(status).toUpperCase();
  if (s.includes("CONCLUID") || s.includes("AUTORIZAD") || s === "AUTHORIZED" || s === "COMPLETED") return "AUTHORIZED";
  if (s.includes("REJEIT") || s === "ERROR" || s === "REJEITADA") return "ERROR";
  if (s.includes("CANCEL")) return "CANCELED";
  if (s.includes("PROCESS") || s === "PROCESSING" || s === "EM_PROCESSAMENTO") return "PROCESSING";
  if (s.includes("AGEND") || s === "SCHEDULED") return "SCHEDULED";
  return s;
}

// lib/nfRetryGuards.ts
var NF_SCHEDULE_PENDING_PATTERNS = [
  /NF isolada/i,
  /NF_SCHEDULE_PENDING/i,
  /ser[aá] agendada pelo Controle\/worker/i,
  /agendada pelo Controle\/worker/i
];
var NON_RETRYABLE_PATTERNS = [
  /NFe003/i,
  /descri[cç][aã]o do servi[cç]o/i,
  /descri[cç][aã]o municipal/i,
  /CNPJ inv[aá]lido/i,
  /endere[cç]o.*incompleto/i,
  /CEP.*inv[aá]lido/i,
  /inscri[cç][aã]o municipal/i,
  /tomador.*n[aã]o.*habilitad/i,
  // Credencial da Prefeitura no Asaas (Notas Fiscais → Informações Fiscais).
  // Retry/reopen automático não resolve — precisa atualizar login/senha CCM.
  /falha na autentica/i,
  /verifique suas credenciais/i
];
var RETRYABLE_PREFEITURA_PATTERNS = [
  /sobrecarregad/i,
  /tente novamente/i,
  /servidor.*prefeitura/i,
  /timeout/i,
  /tempo limite/i,
  /indispon[ií]vel/i
];
function isNfSchedulePendingMessage(errorMessage) {
  if (!errorMessage) return false;
  return NF_SCHEDULE_PENDING_PATTERNS.some((rx) => rx.test(errorMessage));
}
function isNonRetryable(errorMessage) {
  if (!errorMessage) return false;
  if (isNfSchedulePendingMessage(errorMessage)) return false;
  if (RETRYABLE_PREFEITURA_PATTERNS.some((rx) => rx.test(errorMessage))) return false;
  return NON_RETRYABLE_PATTERNS.some((rx) => rx.test(errorMessage));
}

// server/nfRetryWorker.ts
var RETRY_INTERVAL_MS = 15 * 60 * 1e3;
var MAX_RETRIES = 30;
var STUCK_HOURS_RETRY = 6;
var STUCK_HOURS_ALERT = 24;
var MAX_SYNC_RETRIES = 3;
function extractAsaasErrorText(invoice) {
  if (!invoice) return "";
  const parts = [];
  if (invoice.statusDescription) parts.push(String(invoice.statusDescription));
  const em = invoice.errorMessages;
  if (Array.isArray(em)) {
    for (const e of em) {
      if (typeof e === "string") parts.push(e);
      else if (e && (e.description || e.code)) parts.push([e.code, e.description].filter(Boolean).join(": "));
    }
  } else if (typeof em === "string" && em) {
    parts.push(em);
  }
  if (invoice.error && typeof invoice.error === "string") parts.push(invoice.error);
  return parts.join(" | ").substring(0, 500);
}
function getSupabase() {
  return createSupabaseAdminClient();
}
function parseInvoiceNfMeta(inv) {
  const notes = String(inv.notes || inv.description || "").trim();
  if (!notes) return {};
  const lines = notes.split("\n").map((l) => l.trim()).filter(Boolean);
  const main = lines.find((l) => !/^Ref\.\s*rastreio:/i.test(l) && !/^CNAE\//i.test(l));
  const cnaeLine = lines.find((l) => /^CNAE\//i.test(l)) || "";
  const codeMatch = cnaeLine.match(/(\d{4,6})/);
  const nameMatch = cnaeLine.match(/—\s*(.+)$/);
  return {
    serviceDescription: main || void 0,
    observations: notes.slice(0, 500),
    municipalServiceCode: codeMatch?.[1],
    municipalServiceName: nameMatch?.[1]?.trim()
  };
}
var PENDING_NF_STATUSES = ["ERROR", "FAILED", "PENDING", "PROCESSING", "SCHEDULED", "RETRY", "SYNCHRONIZED"];
async function listPendingNfs() {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from("financial_invoices").select("id, client, number, amount, asaas_payment_id, asaas_invoice_id, issuer_company, nf_status, nf_last_error, nf_retry_count, nf_retry_paused, nf_retry_at, created_at, nf_provider, plugnotas_invoice_id, plugnotas_protocol, notes").or("asaas_payment_id.not.is.null,plugnotas_invoice_id.not.is.null").or(`nf_status.is.null,nf_status.in.(${PENDING_NF_STATUSES.join(",")})`).or("nf_retry_paused.is.null,nf_retry_paused.eq.false").or(`nf_retry_count.is.null,nf_retry_count.lt.${MAX_RETRIES}`).order("nf_retry_at", { ascending: true, nullsFirst: true }).limit(100);
    if (error) {
      console.log("[NF Retry] erro ao listar pendentes:", error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.log("[NF Retry] exce\xE7\xE3o:", e.message);
    return [];
  }
}
async function listStuckNfs() {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from("financial_invoices").select("id, client, number, amount, asaas_payment_id, asaas_invoice_id, issuer_company, nf_status, nf_last_error, nf_retry_count, nf_retry_at, created_at, nf_provider, plugnotas_invoice_id").in("nf_status", ["STUCK", "SYNCHRONIZED"]).limit(200);
    if (error) {
      if (error.code === "42703") return [];
      console.log("[NF Retry] erro ao listar stuck:", error.message);
      return [];
    }
    const cutoff = Date.now() - STUCK_HOURS_ALERT * 36e5;
    return (data || []).filter((r) => {
      if (r.nf_status === "STUCK") return true;
      const ref = r.nf_retry_at || r.created_at;
      if (!ref) return false;
      return new Date(ref).getTime() < cutoff;
    }).map((r) => {
      const ref = r.nf_retry_at || r.created_at;
      const hours = ref ? Math.floor((Date.now() - new Date(ref).getTime()) / 36e5) : null;
      return { ...r, hours_stuck: hours };
    });
  } catch {
    return [];
  }
}
var HISTORY_MAX_ENTRIES = 50;
var nfHistoryColumnReady = null;
async function ensureNfHistoryColumn(sb) {
  if (nfHistoryColumnReady !== null) return nfHistoryColumnReady;
  try {
    const { error } = await sb.from("financial_invoices").select("nf_history").limit(1);
    if (!error) {
      nfHistoryColumnReady = true;
      return true;
    }
    if (error.code !== "42703") {
      nfHistoryColumnReady = true;
      return true;
    }
  } catch {
  }
  try {
    await sb.rpc("exec_sql", { sql: "ALTER TABLE financial_invoices ADD COLUMN IF NOT EXISTS nf_history JSONB DEFAULT '[]'::jsonb;" });
    nfHistoryColumnReady = true;
    console.log("[NF Retry] coluna nf_history criada (ou j\xE1 existia).");
    return true;
  } catch (e) {
    console.log("[NF Retry] n\xE3o foi poss\xEDvel criar nf_history (siga manual via Supabase SQL Editor):", e?.message || e);
    nfHistoryColumnReady = false;
    return false;
  }
}
async function markInvoice(id, patch, history) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    let finalPatch = patch;
    if (history) {
      const hasCol = await ensureNfHistoryColumn(sb);
      if (hasCol) {
        try {
          const { data } = await sb.from("financial_invoices").select("nf_history").eq("id", id).maybeSingle();
          const existing = Array.isArray(data?.nf_history) ? data.nf_history : [];
          const entry = {
            ts: (/* @__PURE__ */ new Date()).toISOString(),
            action: history.action,
            status: history.status || null,
            message: history.message ? String(history.message).substring(0, 500) : null
          };
          finalPatch = { ...patch, nf_history: [...existing, entry].slice(-HISTORY_MAX_ENTRIES) };
        } catch (e) {
          if (e?.code !== "42703") console.log("[NF Retry] erro ao montar hist\xF3rico:", e.message);
        }
      }
    }
    const { error } = await sb.from("financial_invoices").update(finalPatch).eq("id", id);
    if (error && error.code === "42703" && finalPatch.nf_history) {
      const { nf_history, ...rest } = finalPatch;
      await sb.from("financial_invoices").update(rest).eq("id", id);
    } else if (error && error.code !== "42703") {
      console.log("[NF Retry] erro ao gravar status:", error.message);
    }
  } catch (e) {
    if (e?.code !== "42703") console.log("[NF Retry] erro ao gravar status:", e.message);
  }
}
function ageHoursSince(iso) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return (Date.now() - t) / 36e5;
}
async function retryOnePlugNotas(inv) {
  if (!isPlugNotasConfigured()) {
    return { ok: false, error: "PlugNotas n\xE3o configurado \u2014 defina o token." };
  }
  if (!inv.plugnotas_invoice_id) {
    await markInvoice(inv.id, {
      nf_status: "ERROR",
      nf_retry_paused: true,
      nf_last_error: "NF marcada como PLUGNOTAS mas sem plugnotas_invoice_id \u2014 reemita pelo bot\xE3o.",
      nf_retry_at: (/* @__PURE__ */ new Date()).toISOString()
    }, { action: "paused-validation", status: "ERROR", message: "PLUGNOTAS sem ID \u2014 pausada." });
    return { ok: false, paused: true, action: "paused-validation" };
  }
  let current;
  const lookupId = inv.plugnotas_invoice_id;
  const isIdIntegracao = typeof lookupId === "string" && /^inv-/i.test(lookupId);
  try {
    current = isIdIntegracao ? await consultNfseByIntegration(lookupId) : await consultNfseById(lookupId);
  } catch (e) {
    await markInvoice(inv.id, { nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(), nf_last_error: String(e.message).substring(0, 500) }, { action: "lookup-error", message: e.message });
    return { ok: false, error: e.message };
  }
  const status = mapPlugNotasStatusToNf(current?.status || current?.situacao);
  if (status === "AUTHORIZED") {
    const realId = current?.id || current?._id || inv.plugnotas_invoice_id;
    const pdfUrl = current?.linkPdf || current?.pdfUrl || (realId && !/^inv-/i.test(realId) ? await getNfsePdfUrl(realId) : null);
    const consumablePdf = pdfUrl && /^https?:\/\//i.test(String(pdfUrl)) ? pdfUrl : null;
    await markInvoice(inv.id, {
      nf_status: "AUTHORIZED",
      nf_number: current?.numero || current?.number || inv.number,
      nf_image_url: consumablePdf,
      plugnotas_invoice_id: realId,
      plugnotas_protocol: current?.protocoloPrefeitura?.numero || current?.protocolo || null,
      nf_last_error: null,
      nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
      nf_retry_paused: false
    }, { action: "authorized", status: "AUTHORIZED", message: `NF PlugNotas autorizada${current?.numero ? ` (N\xBA ${current.numero})` : ""}` });
    return { ok: true, status: "AUTHORIZED", pdfUrl, number: current?.numero, action: "authorized" };
  }
  if (status === "ERROR") {
    const errMsg = extractPlugNotasError(current) || "Rejeitada na Prefeitura";
    const retries = inv.nf_retry_count || 0;
    if (retries >= MAX_SYNC_RETRIES || isNonRetryable(errMsg)) {
      await markInvoice(inv.id, {
        nf_status: "ERROR",
        nf_retry_paused: true,
        nf_last_error: errMsg.substring(0, 500),
        nf_retry_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { action: "paused-validation", status: "ERROR", message: `PlugNotas pausada: ${errMsg}` });
      return { ok: false, paused: true, error: errMsg, action: "paused-validation" };
    }
    await markInvoice(inv.id, {
      nf_status: "ERROR",
      nf_last_error: errMsg.substring(0, 500),
      nf_retry_at: (/* @__PURE__ */ new Date()).toISOString()
    }, { action: "schedule-failed", status: "ERROR", message: errMsg });
    return { ok: false, error: errMsg };
  }
  const ageH = ageHoursSince(inv.nf_retry_at || inv.created_at);
  if ((status === "PROCESSING" || status === "SCHEDULED" || status === "SYNCHRONIZED") && ageH >= STUCK_HOURS_RETRY && ageH < STUCK_HOURS_ALERT) {
    const retries = inv.nf_retry_count || 0;
    if (retries >= MAX_SYNC_RETRIES) {
      await markInvoice(inv.id, {
        nf_status: "STUCK",
        nf_retry_paused: true,
        nf_last_error: `NF PlugNotas travada em ${status} h\xE1 ${Math.floor(ageH)}h ap\xF3s ${retries} tentativas \u2014 verifique o painel PlugNotas.`,
        nf_retry_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { action: "stuck-alert", status: "STUCK", message: `PlugNotas: limite de ${MAX_SYNC_RETRIES} reemiss\xF5es atingido em ${Math.floor(ageH)}h.` });
      return { ok: false, paused: true, status: "STUCK", action: "stuck-alert" };
    }
    try {
      const realId = current?.id || current?._id || (isIdIntegracao ? null : inv.plugnotas_invoice_id);
      if (realId) {
        await cancelNfse(realId, "Reemiss\xE3o autom\xE1tica \u2014 NF travada na Prefeitura");
        console.log(`[NF Retry][PlugNotas] cancel ok para ${realId} (fatura ${inv.id})`);
      }
    } catch (cancelErr) {
      console.log(`[NF Retry][PlugNotas] cancel falhou para fatura ${inv.id} (seguindo com reemiss\xE3o): ${cancelErr.message}`);
    }
    try {
      const sb = getSupabase();
      let clientCnpj;
      let clientName = inv.client || "Cliente";
      let clientEmail;
      let serviceDescription;
      if (sb && inv.client) {
        const { data: clientRow } = await sb.from("clients").select("name, trading_name, cnpj, medicao_email, email").or(`name.eq.${inv.client},trading_name.eq.${inv.client}`).limit(1).maybeSingle();
        if (clientRow) {
          clientCnpj = clientRow.cnpj || void 0;
          clientName = clientRow.trading_name || clientRow.name || clientName;
          clientEmail = clientRow.medicao_email || clientRow.email || void 0;
        }
      }
      const reissued = await issueNfse({
        invoiceId: inv.id,
        amount: Number(inv.amount || 0),
        company: inv.issuer_company || void 0,
        clientCnpj,
        clientName,
        clientEmail,
        serviceDescription,
        externalReference: inv.id
      });
      const newId = reissued.plugnotasId || reissued.idIntegracao;
      await markInvoice(inv.id, {
        nf_status: reissued.status || "PROCESSING",
        plugnotas_invoice_id: newId,
        plugnotas_protocol: reissued.protocol || null,
        nf_retry_count: retries + 1,
        nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
        nf_last_error: null
      }, { action: "cancel-and-reschedule", status: reissued.status || "PROCESSING", message: `PlugNotas reemitida ap\xF3s ${Math.floor(ageH)}h (tentativa ${retries + 1}/${MAX_SYNC_RETRIES}). Novo id ${newId}.` });
      return { ok: true, status: reissued.status, action: "cancel-and-reschedule" };
    } catch (reissueErr) {
      const msg = reissueErr.message || "Falha ao reemitir NF PlugNotas";
      await markInvoice(inv.id, {
        nf_status: "ERROR",
        nf_last_error: msg.substring(0, 500),
        nf_retry_count: retries + 1,
        nf_retry_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { action: "schedule-failed", status: "ERROR", message: `PlugNotas reemiss\xE3o falhou (${retries + 1}/${MAX_SYNC_RETRIES}): ${msg}` });
      return { ok: false, error: msg, action: "schedule-failed" };
    }
  }
  if ((status === "PROCESSING" || status === "SCHEDULED" || status === "SYNCHRONIZED") && ageH >= STUCK_HOURS_ALERT) {
    await markInvoice(inv.id, {
      nf_status: "STUCK",
      nf_retry_paused: true,
      nf_last_error: `NF PlugNotas em ${status} h\xE1 ${Math.floor(ageH)}h \u2014 verifique o painel PlugNotas.`,
      nf_retry_at: (/* @__PURE__ */ new Date()).toISOString()
    }, { action: "stuck-alert", status: "STUCK", message: `PlugNotas travada h\xE1 ${Math.floor(ageH)}h em ${status}.` });
    return { ok: false, paused: true, status: "STUCK", action: "stuck-alert" };
  }
  await markInvoice(inv.id, {
    nf_status: status || "PROCESSING"
  });
  return { ok: false, status, action: "wait" };
}
async function retryOne(inv, opts) {
  const explicit = (inv.nf_provider || "").toUpperCase();
  const provider = explicit || (inv.plugnotas_invoice_id ? "PLUGNOTAS" : "ASAAS");
  if (provider === "PLUGNOTAS") {
    return retryOnePlugNotas(inv);
  }
  if (!inv.asaas_payment_id) {
    return { ok: false, error: "Fatura sem asaas_payment_id e provider != PLUGNOTAS." };
  }
  const company = inv.issuer_company || void 0;
  const paymentId = inv.asaas_payment_id;
  if (!inv.notes) {
    try {
      const sb = getSupabase();
      if (sb) {
        const { data: full } = await sb.from("financial_invoices").select("notes").eq("id", inv.id).maybeSingle();
        if (full) {
          inv.notes = full.notes || null;
        }
      }
    } catch {
    }
  }
  const nfMeta = parseInvoiceNfMeta(inv);
  const scheduleOpts = {
    paymentId,
    company,
    clientCnpj: opts?.clientCnpj,
    clientName: inv.client,
    serviceDescription: opts?.serviceDescription || nfMeta.serviceDescription,
    observations: nfMeta.observations,
    municipalServiceCode: nfMeta.municipalServiceCode,
    municipalServiceName: nfMeta.municipalServiceName
  };
  const reissueCount = (inv.nf_retry_count || 0) + 1;
  let currentInvoice = null;
  try {
    if (inv.asaas_invoice_id) {
      currentInvoice = await getInvoice(inv.asaas_invoice_id, company);
    } else {
      const list = await getInvoiceByPayment(paymentId, company);
      const items = list?.data || (Array.isArray(list) ? list : []);
      currentInvoice = items.find((n) => n.status === "AUTHORIZED" || n.pdfUrl) || items[0] || null;
    }
  } catch (e) {
    await markInvoice(inv.id, { nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(), nf_last_error: e.message.substring(0, 500) }, { action: "lookup-error", message: e.message });
    return { ok: false, error: e.message };
  }
  if (currentInvoice?.status === "AUTHORIZED" || currentInvoice?.pdfUrl) {
    await markInvoice(inv.id, {
      nf_status: "AUTHORIZED",
      nf_number: currentInvoice.number || null,
      asaas_invoice_id: currentInvoice.id,
      asaas_invoice_url: currentInvoice.pdfUrl || null,
      nf_image_url: currentInvoice.pdfUrl || null,
      nf_last_error: null,
      nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
      nf_retry_paused: false
    }, { action: "authorized", status: "AUTHORIZED", message: currentInvoice.number ? `NF n\xBA ${currentInvoice.number} autorizada` : "NF autorizada" });
    return { ok: true, status: "AUTHORIZED", pdfUrl: currentInvoice.pdfUrl, number: currentInvoice.number, action: "authorized" };
  }
  if (currentInvoice && currentInvoice.status === "SYNCHRONIZED") {
    const ageH = ageHoursSince(currentInvoice.dateCreated || currentInvoice.scheduledDate || inv.nf_retry_at || inv.created_at);
    const syncRetries = inv.nf_retry_count || 0;
    if (ageH >= STUCK_HOURS_ALERT) {
      await markInvoice(inv.id, {
        nf_status: "STUCK",
        asaas_invoice_id: currentInvoice.id,
        nf_retry_paused: true,
        nf_last_error: `NF em SYNCHRONIZED h\xE1 ${Math.floor(ageH)}h sem autoriza\xE7\xE3o \u2014 verifique configura\xE7\xE3o da empresa emissora no Asaas (Inscri\xE7\xE3o Municipal / certificado).`.substring(0, 500),
        nf_retry_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { action: "stuck-alert", status: "STUCK", message: `Travada h\xE1 ${Math.floor(ageH)}h em SYNCHRONIZED (${company || "default"}) \u2014 pausada para verifica\xE7\xE3o manual.` });
      console.log(`[NF Retry] STUCK: fatura ${inv.id} (${inv.client}) travada h\xE1 ${Math.floor(ageH)}h em ${company || "default"}`);
      return { ok: false, paused: true, status: "STUCK", action: "stuck-alert" };
    }
    if (ageH >= STUCK_HOURS_RETRY && syncRetries < MAX_SYNC_RETRIES) {
      let cancelled = false;
      try {
        await cancelInvoice(currentInvoice.id, company);
        cancelled = true;
        console.log(`[NF Retry] cancelada NF engasgada ${currentInvoice.id} (${Math.floor(ageH)}h em SYNCHRONIZED) para reemitir \u2014 fatura ${inv.id}`);
      } catch (e) {
        console.log(`[NF Retry] n\xE3o foi poss\xEDvel cancelar ${currentInvoice.id}: ${e.message} \u2014 aguardando pr\xF3ximo ciclo (sem criar duplicata).`);
        await markInvoice(inv.id, {
          nf_status: "SYNCHRONIZED",
          asaas_invoice_id: currentInvoice.id,
          nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
          nf_last_error: `Cancelamento bloqueado: ${e.message}`.substring(0, 500)
        }, { action: "cancel-blocked", status: "SYNCHRONIZED", message: `N\xE3o foi poss\xEDvel cancelar NF travada: ${e.message}` });
        return { ok: false, status: "SYNCHRONIZED", action: "cancel-blocked", error: e.message };
      }
      if (!cancelled) {
        return { ok: false, status: "SYNCHRONIZED", action: "cancel-blocked" };
      }
      try {
        const newInv = await scheduleInvoice(scheduleOpts);
        await markInvoice(inv.id, {
          nf_status: newInv?.status || "SCHEDULED",
          asaas_invoice_id: newInv?.id || null,
          nf_retry_count: reissueCount,
          nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
          nf_last_error: null
        }, { action: "cancel-and-reschedule", status: newInv?.status || "SCHEDULED", message: `Tentativa ${reissueCount}/${MAX_SYNC_RETRIES}: NF cancelada (engasgada h\xE1 ${Math.floor(ageH)}h) e reagendada.` });
        return { ok: true, status: newInv?.status, action: "cancel-and-reschedule" };
      } catch (e) {
        const msg = e.message || String(e);
        const paused = isNonRetryable(msg);
        await markInvoice(inv.id, {
          nf_status: "ERROR",
          nf_retry_count: reissueCount,
          nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
          nf_last_error: msg.substring(0, 500),
          nf_retry_paused: paused
        }, { action: "cancel-and-reschedule-failed", status: "ERROR", message: `Tentativa ${reissueCount}/${MAX_SYNC_RETRIES} falhou: ${msg}${paused ? " (pausada)" : ""}` });
        return { ok: false, error: msg, paused };
      }
    }
    await markInvoice(inv.id, {
      nf_status: "SYNCHRONIZED",
      asaas_invoice_id: currentInvoice.id,
      nf_retry_at: inv.nf_retry_at || (/* @__PURE__ */ new Date()).toISOString(),
      nf_last_error: null,
      nf_retry_paused: false
    });
    return { ok: false, status: "SYNCHRONIZED", action: "wait" };
  }
  if (currentInvoice && ["SCHEDULED", "PROCESSING_CANCELLATION"].includes(currentInvoice.status)) {
    await markInvoice(inv.id, {
      nf_status: currentInvoice.status,
      asaas_invoice_id: currentInvoice.id,
      nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
      nf_last_error: null,
      nf_retry_paused: false
    });
    return { ok: false, status: currentInvoice.status, action: "wait" };
  }
  if (currentInvoice && currentInvoice.status === "ERROR") {
    const asaasErr = extractAsaasErrorText(currentInvoice) || inv.nf_last_error || "";
    const errorRetries = inv.nf_retry_count || 0;
    if (isNonRetryable(asaasErr)) {
      await markInvoice(inv.id, {
        nf_status: "ERROR",
        asaas_invoice_id: currentInvoice.id,
        nf_retry_paused: true,
        nf_last_error: asaasErr.substring(0, 500),
        nf_retry_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      console.log(`[NF Retry] ERROR permanente em ${currentInvoice.id} \u2014 pausada. Motivo: ${asaasErr.substring(0, 120)}`);
      return { ok: false, paused: true, status: "ERROR", action: "paused-validation" };
    }
    if (errorRetries >= MAX_SYNC_RETRIES) {
      await markInvoice(inv.id, {
        nf_status: "STUCK",
        asaas_invoice_id: currentInvoice.id,
        nf_retry_paused: true,
        nf_last_error: `Ap\xF3s ${errorRetries} tentativas a Prefeitura ainda devolve erro: ${asaasErr.substring(0, 300)}`,
        nf_retry_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      console.log(`[NF Retry] STUCK por erro recorrente em ${currentInvoice.id} (${errorRetries} tentativas) \u2014 fatura ${inv.id}`);
      return { ok: false, paused: true, status: "STUCK", action: "stuck-after-errors" };
    }
    let cancelled = false;
    try {
      await cancelInvoice(currentInvoice.id, company);
      cancelled = true;
      console.log(`[NF Retry] cancelada NF ERROR ${currentInvoice.id} (Prefeitura: "${asaasErr.substring(0, 80)}") \u2014 fatura ${inv.id}`);
    } catch (e) {
      console.log(`[NF Retry] n\xE3o foi poss\xEDvel cancelar ${currentInvoice.id} em ERROR: ${e.message} \u2014 aguardando pr\xF3ximo ciclo.`);
      await markInvoice(inv.id, {
        nf_status: "ERROR",
        asaas_invoice_id: currentInvoice.id,
        nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
        nf_last_error: `Cancelamento bloqueado: ${e.message}`.substring(0, 500)
      });
      return { ok: false, status: "ERROR", action: "cancel-blocked", error: e.message };
    }
    if (cancelled) {
      try {
        const newInv = await scheduleInvoice(scheduleOpts);
        await markInvoice(inv.id, {
          nf_status: newInv?.status || "SCHEDULED",
          asaas_invoice_id: newInv?.id || null,
          nf_retry_count: reissueCount,
          nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
          nf_last_error: null
        });
        return { ok: true, status: newInv?.status, action: "cancel-and-reschedule" };
      } catch (e) {
        const msg = e.message || String(e);
        const paused = isNonRetryable(msg);
        await markInvoice(inv.id, {
          nf_status: "ERROR",
          nf_retry_count: reissueCount,
          nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
          nf_last_error: msg.substring(0, 500),
          nf_retry_paused: paused
        });
        return { ok: false, error: msg, paused };
      }
    }
  }
  const errMsg = extractAsaasErrorText(currentInvoice) || inv.nf_last_error || "";
  if (errMsg && !isNfSchedulePendingMessage(errMsg) && isNonRetryable(errMsg)) {
    await markInvoice(inv.id, {
      nf_status: "ERROR",
      nf_retry_paused: true,
      nf_last_error: String(errMsg).substring(0, 500),
      nf_retry_at: (/* @__PURE__ */ new Date()).toISOString()
    }, { action: "paused-validation", status: "ERROR", message: `Pausada por erro de valida\xE7\xE3o: ${errMsg}` });
    return { ok: false, paused: true, error: errMsg, action: "paused-validation" };
  }
  try {
    const newInv = await scheduleInvoice(scheduleOpts);
    await markInvoice(inv.id, {
      nf_status: newInv?.status || "SCHEDULED",
      asaas_invoice_id: newInv?.id || inv.asaas_invoice_id,
      nf_retry_count: reissueCount,
      nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
      nf_last_error: null
    }, { action: "scheduled", status: newInv?.status || "SCHEDULED", message: `Tentativa ${reissueCount}: NF agendada (${company || "default"}).` });
    return { ok: true, status: newInv?.status, action: "scheduled" };
  } catch (e) {
    const msg = e.message || String(e);
    const paused = isNonRetryable(msg);
    await markInvoice(inv.id, {
      nf_status: "ERROR",
      nf_retry_count: reissueCount,
      nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
      nf_last_error: msg.substring(0, 500),
      nf_retry_paused: paused
    }, { action: "schedule-failed", status: "ERROR", message: `Tentativa ${reissueCount} falhou: ${msg}${paused ? " (pausada)" : ""}` });
    return { ok: false, error: msg, paused };
  }
}
async function runRetryCycle(opts) {
  const pending = await listPendingNfs();
  const limit = Math.max(1, Math.min(Number(opts?.limit) || pending.length || 1, 100));
  const batch = pending.slice(0, limit);
  let ok = 0, paused = 0, errors = 0, stuck = 0;
  for (const inv of batch) {
    const res = await retryOne(inv);
    if (res.ok) ok++;
    else if (res.action === "stuck-alert") stuck++;
    else if (res.paused) paused++;
    else errors++;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (batch.length > 0) {
    console.log(`[NF Retry] ciclo conclu\xEDdo \u2014 ${batch.length}/${pending.length} processadas | ${ok} ok | ${paused} pausadas | ${stuck} STUCK | ${errors} erros`);
  }
  return { processed: batch.length, ok, paused, errors, stuck };
}
async function reopenPausedNfs(limit = 50) {
  const sb = getSupabase();
  if (!sb) return { reopened: 0 };
  try {
    const { data, error } = await sb.from("financial_invoices").select("id, nf_status, nf_last_error, nf_retry_paused, status").eq("nf_retry_paused", true).in("status", ["EMITIDA", "VENCIDA"]).in("nf_status", ["STUCK", "ERROR", "FAILED", "SYNCHRONIZED", "PENDING", "PROCESSING"]).limit(Math.max(1, Math.min(limit, 100)));
    if (error || !data?.length) return { reopened: 0 };
    let reopened = 0;
    for (const row of data) {
      const err = String(row.nf_last_error || "");
      if (isNonRetryable(err)) continue;
      await markInvoice(row.id, {
        nf_retry_paused: false,
        nf_status: "PROCESSING",
        nf_retry_at: (/* @__PURE__ */ new Date()).toISOString(),
        nf_last_error: null
      }, { action: "reopen-processing", status: "PROCESSING", message: "Reaberto para acompanhamento autom\xE1tico." });
      reopened++;
    }
    return { reopened };
  } catch {
    return { reopened: 0 };
  }
}
var workerStarted = false;
function startNfRetryWorker() {
  if (workerStarted) return;
  workerStarted = true;
  console.log(`[NF Retry] worker ativo \u2014 ciclo a cada ${RETRY_INTERVAL_MS / 6e4} min (cancela SYNC>${STUCK_HOURS_RETRY}h, alerta SYNC>${STUCK_HOURS_ALERT}h)`);
  const sb = getSupabase();
  if (sb) {
    ensureNfHistoryColumn(sb).catch((e) => console.log("[NF Retry] aviso ensureNfHistoryColumn:", e?.message || e));
  }
  setTimeout(() => {
    runRetryCycle().catch((e) => console.log("[NF Retry] erro:", e.message));
  }, 6e4);
  setInterval(() => {
    runRetryCycle().catch((e) => console.log("[NF Retry] erro:", e.message));
  }, RETRY_INTERVAL_MS);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  listPendingNfs,
  listStuckNfs,
  reopenPausedNfs,
  retryOne,
  runRetryCycle,
  startNfRetryWorker
});
