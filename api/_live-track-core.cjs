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

// lib/liveTrack/httpHandler.ts
var httpHandler_exports = {};
__export(httpHandler_exports, {
  handleLiveTrackHttp: () => handleLiveTrackHttp
});
module.exports = __toCommonJS(httpHandler_exports);

// lib/liveTrack/service.ts
var import_node_crypto = require("node:crypto");

// lib/publicAppUrl.ts
var CANONICAL_PUBLIC_ORIGIN = "https://sistema.grupotmseg.com.br";
var LEGACY_BAD_HOST = "app.grupotmseg.com.br";
function normalizeOrigin(url) {
  const trimmed = String(url || "").trim().replace(/\/$/, "");
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (u.hostname === LEGACY_BAD_HOST) {
      u.hostname = "sistema.grupotmseg.com.br";
    }
    return u.origin;
  } catch {
    return trimmed.replace(LEGACY_BAD_HOST, "sistema.grupotmseg.com.br");
  }
}
function resolvePublicAppUrl(req) {
  const fromEnv = normalizeOrigin(
    String(process.env.APP_PUBLIC_URL || process.env.SYSTEM_URL || "")
  );
  if (fromEnv) return fromEnv;
  const replitDomain = String(process.env.REPLIT_DOMAINS || "").split(",")[0].trim();
  if (replitDomain) return normalizeOrigin(`https://${replitDomain}`);
  const host = String(
    req?.headers?.["x-forwarded-host"] || req?.headers?.host || ""
  ).split(",")[0].trim();
  if (host && !host.includes("localhost")) {
    const proto = String(req?.headers?.["x-forwarded-proto"] || "https");
    return normalizeOrigin(`${proto}://${host}`);
  }
  return CANONICAL_PUBLIC_ORIGIN;
}

// lib/liveTrack/lgpd.ts
var LIVE_TRACK_LGPD_VERSION = "2026-09-15-bg";
var LIVE_TRACK_LGPD_SUMMARY = "A Central TM SEG realiza o acompanhamento operacional da sua miss\xE3o de escolta velada. Ao clicar em compartilhar, voc\xEA autoriza o tratamento da sua localiza\xE7\xE3o em tempo real at\xE9 o encerramento da OS, com a mesma finalidade de um compartilhamento ao vivo no WhatsApp ou no Uber.";
var LIVE_TRACK_LGPD_FULL = [
  "Controlador: GRUPO TM SEG (sistema.grupotmseg.com.br).",
  "Finalidade: seguran\xE7a e acompanhamento operacional da miss\xE3o de escolta velada vinculada \xE0 OS informada \u2014 a Central precisa saber onde o agente est\xE1 at\xE9 o fim da miss\xE3o.",
  "Base legal (LGPD): execu\xE7\xE3o do contrato de presta\xE7\xE3o de servi\xE7o de escolta e leg\xEDtimo interesse de prote\xE7\xE3o \xE0 vida, \xE0 carga e \xE0 opera\xE7\xE3o (arts. 7\xBA, V e IX, e 11 da Lei 13.709/2018).",
  "Dados tratados: coordenadas GPS, precis\xE3o, velocidade, rumo, hor\xE1rio, identificador do aparelho (navegador) e registro do seu consentimento. N\xE3o pedimos nome, CPF nem fotos nesta tela.",
  "Compartilhamento: somente a equipe operacional da TM SEG autenticada no sistema, na OS correspondente. O link usa token secreto; n\xE3o publique em redes sociais.",
  "Reten\xE7\xE3o: enquanto a miss\xE3o estiver ativa e, ap\xF3s o encerramento, pelo prazo de auditoria operacional. Depois os pontos podem ser eliminados ou anonimizados.",
  "Seus direitos: confirmar o tratamento, acessar, corrigir e solicitar elimina\xE7\xE3o ap\xF3s o fim da miss\xE3o, pelos canais da TM SEG.",
  "Obrigatoriedade: sem o compartilhamento em tempo real a Central n\xE3o consegue acompanhar a velada. Voc\xEA pode recusar; nesse caso avise o operacional antes de seguir.",
  "Como funciona: o GPS \xE9 lido por esta p\xE1gina e continua em segundo plano enquanto ela existir (tela apagada, WhatsApp, bot\xE3o Ocultar/Home). O rastreio s\xF3 para se voc\xEA fechar esta p\xE1gina, encerrar o Chrome/Safari ou a OS for finalizada."
].join("\n\n");

// api/geocode-address.ts
var PUBLIC_GOOGLE_MAPS_KEY = "AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k";
async function geocodeWithGoogle(address) {
  const keys = Array.from(new Set([
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.VITE_GOOGLE_MAPS_API_KEY,
    PUBLIC_GOOGLE_MAPS_KEY
  ].map((key) => String(key || "").trim()).filter(Boolean)));
  for (const key of keys) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=pt-BR&region=br&key=${encodeURIComponent(key)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.status === "OK" && data.results?.[0]?.geometry?.location) {
      const first = data.results[0];
      return {
        success: true,
        address: first.formatted_address,
        location: first.geometry.location,
        source: "google"
      };
    }
  }
  return null;
}
async function geocodeWithNominatim(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(address)}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "TMSEG/1.0 (contato@grupotmseg.com.br)",
      "Accept-Language": "pt-BR,pt;q=0.9"
    }
  });
  const data = await resp.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.lat || !first?.lon) return null;
  return {
    success: true,
    address: first.display_name,
    location: { lat: Number(first.lat), lng: Number(first.lon) },
    source: "nominatim"
  };
}
async function reverseGeocode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const keys = Array.from(new Set([
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.VITE_GOOGLE_MAPS_API_KEY,
    PUBLIC_GOOGLE_MAPS_KEY
  ].map((key) => String(key || "").trim()).filter(Boolean)));
  for (const key of keys) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${lat},${lng}`)}&language=pt-BR&region=br&key=${encodeURIComponent(key)}`;
    const resp2 = await fetch(url);
    const data2 = await resp2.json();
    const texto2 = String(data2?.results?.[0]?.formatted_address || "").trim();
    if (data2?.status === "OK" && texto2) return texto2;
  }
  const osm = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`;
  const resp = await fetch(osm, { headers: { "User-Agent": "TMSEG/1.0 (contato@grupotmseg.com.br)", "Accept-Language": "pt-BR,pt;q=0.9" } });
  const data = await resp.json();
  const texto = String(data?.display_name || "").trim();
  return texto || null;
}
async function geocodeAddress(address) {
  const q = String(address || "").trim();
  if (q.length < 3) return null;
  const result = await geocodeWithGoogle(q) || await geocodeWithNominatim(q);
  const lat = Number(result?.location?.lat);
  const lng = Number(result?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

// lib/liveTrack/isVeladaMission.ts
function isVeladaMission(input) {
  if (!input) return false;
  const blob = [
    input.mission_type,
    input.missionType,
    input.vehicleType,
    input.vehicleData?.type
  ].map((v) => String(v || "").toUpperCase()).join(" ");
  return blob.includes("VELAD");
}
var TERMINAL_MISSION_STATUSES = ["Conclu\xEDda", "Cancelada", "Recusada"];
function isTerminalMissionStatus(status) {
  const s = String(status || "").trim();
  return TERMINAL_MISSION_STATUSES.includes(s);
}
function fornecedorAtiva(nome) {
  const n = String(nome || "").toUpperCase();
  return /(^|[^A-Z])ATIVA([^A-Z]|$)/.test(n);
}
function rastreioOsAberta(status) {
  const s = String(status || "").trim();
  if (!s || s === "Pendente") return false;
  return !isTerminalMissionStatus(s);
}

// lib/liveTrack/pure.ts
var LIVE_TRACK_PING_MIN_MS = 2e3;
var LIVE_TRACK_SINAL_FRESCO_MS = 10 * 60 * 1e3;
var LIVE_TRACK_TRAIL_MIN_METERS = 25;
var LIVE_TRACK_TRAIL_MIN_MS = 8e3;
var LIVE_TRACK_PUBLIC_PATH = "/rastreio";
function validateCoords(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}
function haversineMeters(a, b) {
  const R = 6371e3;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
var RAIO_CHEGADA_METROS = 500;
function instanteChegada(pontos, destino) {
  if (!destino || !Number.isFinite(destino.lat) || !Number.isFinite(destino.lng)) return null;
  let quando = null;
  for (const p of pontos) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (haversineMeters(p, destino) > RAIO_CHEGADA_METROS) continue;
    const at = String(p.at || "").trim();
    if (!at) continue;
    if (!quando || at < quando) quando = at;
  }
  return quando;
}
function etapasDaTrilha(trail) {
  const pts = trail.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng), at: String(p.recorded_at || p.at || "") })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.at);
  if (!pts.length) return [];
  const kept = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = kept[kept.length - 1];
    const cur = pts[i];
    const ultimo = i === pts.length - 1;
    const dt = new Date(cur.at).getTime() - new Date(prev.at).getTime();
    const dist = haversineMeters(prev, cur);
    if (ultimo || dist >= 2e3 || dt >= 10 * 60 * 1e3) {
      if (cur.at !== prev.at || dist >= 30) kept.push(cur);
    }
  }
  const max = 12;
  if (kept.length <= max) return kept;
  const meio = kept.slice(1, -1);
  const passo = Math.ceil(meio.length / (max - 2));
  const amostra = meio.filter((_, i) => i % passo === 0).slice(0, max - 2);
  return [kept[0], ...amostra, kept[kept.length - 1]];
}
function buildLiveTrackPublicPath(token) {
  return `${LIVE_TRACK_PUBLIC_PATH}?token=${encodeURIComponent(token)}`;
}
function buildLiveTrackPublicUrl(token, origin = CANONICAL_PUBLIC_ORIGIN) {
  return `${String(origin || CANONICAL_PUBLIC_ORIGIN).replace(/\/$/, "")}${buildLiveTrackPublicPath(token)}`;
}
function buildLiveTrackClientUrl(credential, origin = CANONICAL_PUBLIC_ORIGIN) {
  const base = String(origin || CANONICAL_PUBLIC_ORIGIN).replace(/\/$/, "");
  return `${base}${LIVE_TRACK_PUBLIC_PATH}?c=${encodeURIComponent(credential)}`;
}
function buildLiveTrackWhatsappText(opts) {
  const os = String(opts.osNumber || "").trim() || "\u2014";
  return [
    "*TM SEG \u2014 Acompanhamento em tempo real*",
    "",
    "A Central TM SEG est\xE1 realizando o acompanhamento da sua miss\xE3o.",
    `OS: ${os}`,
    "",
    "Abra o link e clique para compartilhar sua localiza\xE7\xE3o em tempo real at\xE9 o fim da miss\xE3o.",
    "Deixe a tela acesa e a p\xE1gina em primeiro plano. Se o celular bloquear ou voc\xEA abrir o WhatsApp, o GPS pode pausar. Fechar esta p\xE1gina interrompe o rastreio.",
    "",
    opts.url
  ].join("\n");
}
function clampAccuracy(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, 5e3);
}
function clampOptionalNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

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

// lib/liveTrack/schema.ts
var ready = false;
async function getLiveTrackSupabase() {
  const sb = createSupabaseAdminClient();
  if (!sb) {
    throw new Error("Supabase admin indispon\xEDvel para o rastreio ao vivo.");
  }
  return sb;
}
async function ensureLiveTrackSchema() {
  if (ready) return;
  const sb = await getLiveTrackSupabase();
  const { error } = await sb.from("mission_live_tracks").select("id").limit(1);
  if (error) {
    const msg = String(error.message || error);
    if (/does not exist|schema cache|could not find/i.test(msg)) {
      throw new Error("Rastreio ao vivo ainda n\xE3o est\xE1 no banco. Aplique migrations/2026_09_14_mission_live_track.sql.");
    }
    throw new Error(msg);
  }
  ready = true;
}

// lib/liveTrack/service.ts
var ACTIVE_STATUSES = ["pending", "consented", "sharing", "paused"];
var cacheEndereco = /* @__PURE__ */ new Map();
async function enderecoDaPosicao(lat, lng) {
  const chave = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
  const salvo = cacheEndereco.get(chave);
  if (salvo && salvo.expira > Date.now()) return salvo.texto;
  const texto = await reverseGeocode(Number(lat), Number(lng));
  if (!texto) return null;
  cacheEndereco.set(chave, { texto, expira: Date.now() + 30 * 60 * 1e3 });
  return texto;
}
function segredoDoCliente() {
  return String(process.env.LIVE_TRACK_CLIENT_SECRET || "tmseg-rastreio-cliente-v1");
}
function assinarCliente(trackId) {
  return (0, import_node_crypto.createHmac)("sha256", segredoDoCliente()).update(String(trackId)).digest("base64url").slice(0, 32);
}
function credencialDoCliente(trackId) {
  return `${trackId}.${assinarCliente(trackId)}`;
}
function idPeloLinkDoCliente(credencial) {
  const bruto = String(credencial || "").trim();
  const ponto = bruto.lastIndexOf(".");
  if (ponto <= 0) return null;
  const id = bruto.slice(0, ponto);
  const assinatura = bruto.slice(ponto + 1);
  const esperada = assinarCliente(id);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !(0, import_node_crypto.timingSafeEqual)(a, b)) return null;
  return id;
}
function newToken() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function clientIp(req) {
  const xf = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  if (xf) return xf.slice(0, 80);
  return String(req?.headers?.["x-real-ip"] || "").slice(0, 80);
}
function clientUa(req) {
  return String(req?.headers?.["user-agent"] || "").slice(0, 400);
}
async function loadMission(missionId) {
  const sb = await getLiveTrackSupabase();
  const { data, error } = await sb.from("missions").select("id, client, provider, origin, destination, status, mission_type, agent1, agent2, driver_name, client_vehicle").eq("id", missionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function getActiveTrack(missionId) {
  const sb = await getLiveTrackSupabase();
  const { data, error } = await sb.from("mission_live_tracks").select("*").eq("mission_id", missionId).in("status", ACTIVE_STATUSES).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function getTrackByToken(token) {
  const sb = await getLiveTrackSupabase();
  const { data, error } = await sb.from("mission_live_tracks").select("*").eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function viaturaDaMissao(vehicleId) {
  const id = Number(vehicleId);
  if (!Number.isFinite(id) || id <= 0) return { plate: "", model: "" };
  try {
    const sb = await getLiveTrackSupabase();
    const { data } = await sb.from("client_vehicles").select("plate, model").eq("id", id).maybeSingle();
    return { plate: String(data?.plate || ""), model: String(data?.model || "") };
  } catch {
    return { plate: "", model: "" };
  }
}
function fichaDoCliente(mission, viatura) {
  return {
    osNumber: mission.id,
    client: mission.client || "",
    provider: mission.provider || "",
    origin: mission.origin || "",
    destination: mission.destination || "",
    status: mission.status || "",
    agent: mission.agent1 || mission.driver_name || "",
    agent2: mission.agent2 || "",
    plate: viatura.plate,
    vehicleModel: viatura.model,
    ativa: fornecedorAtiva(mission.provider)
  };
}
function linksDoRastreio(track, origin, osNumber) {
  const url = buildLiveTrackPublicUrl(track.token, origin);
  return {
    url,
    clientUrl: buildLiveTrackClientUrl(credencialDoCliente(track.id), origin),
    whatsappText: buildLiveTrackWhatsappText({ osNumber, url })
  };
}
function publicMissionView(mission, pontos) {
  return {
    osNumber: mission.id,
    origin: mission.origin || "",
    destination: mission.destination || "",
    status: mission.status || "",
    agentHint: mission.agent1 ? String(mission.agent1).split(" ")[0] : "",
    ativa: fornecedorAtiva(mission.provider),
    originPoint: pontos?.originPoint || null,
    destinationPoint: pontos?.destinationPoint || null
  };
}
var cacheRota = /* @__PURE__ */ new Map();
function enderecoParaMapa(valor) {
  return String(valor || "").replace(/\([^)]*\)/g, " ").replace(/\([^)]*$/g, " ").replace(/\s+/g, " ").trim();
}
async function pontosDaRota(mission) {
  const origem = enderecoParaMapa(mission?.origin);
  const destino = enderecoParaMapa(mission?.destination);
  const chave = `${origem}
${destino}`;
  const salvo = cacheRota.get(chave);
  if (salvo && Date.now() - salvo.at < 30 * 60 * 1e3) {
    return { originPoint: salvo.originPoint, destinationPoint: salvo.destinationPoint };
  }
  try {
    const [originPoint, destinationPoint] = await Promise.all([
      geocodeAddress(origem),
      geocodeAddress(destino)
    ]);
    const pontos = { originPoint, destinationPoint };
    cacheRota.set(chave, { at: Date.now(), ...pontos });
    return pontos;
  } catch {
    return { originPoint: null, destinationPoint: null };
  }
}
var cacheChegada = /* @__PURE__ */ new Map();
function listaParaChegada(trail, track) {
  const lista = trail.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng), at: p.recorded_at || null }));
  if (track.last_lat != null && track.last_lng != null && track.last_seen_at) {
    lista.push({ lat: Number(track.last_lat), lng: Number(track.last_lng), at: track.last_seen_at });
  }
  return lista;
}
async function chegadaDoRastreio(sb, track, destino, trail) {
  if (!destino) return null;
  const guardado = cacheChegada.get(track.id);
  if (guardado) return guardado;
  let pontos = trail ? listaParaChegada(trail, track) : [];
  if (!trail) {
    if (track.last_lat == null || track.last_lng == null) return null;
    if (haversineMeters({ lat: Number(track.last_lat), lng: Number(track.last_lng) }, destino) > RAIO_CHEGADA_METROS) return null;
    const { data } = await sb.from("mission_live_positions").select("lat, lng, recorded_at").eq("track_id", track.id).order("recorded_at", { ascending: true }).limit(800);
    pontos = listaParaChegada(data || [], track);
  }
  const quando = instanteChegada(pontos, destino);
  if (quando) cacheChegada.set(track.id, quando);
  return quando;
}
function reentradaBloqueada(track, chegadaEm) {
  if (!chegadaEm) return false;
  const liberada = String(track.reentrada_liberada_em || "").trim();
  if (!liberada) return true;
  return liberada < chegadaEm;
}
var SESSAO_AGENTE_VIVA_MS = 12e4;
async function generateLiveTrack(opts) {
  await ensureLiveTrackSchema();
  const missionId = String(opts.missionId || "").trim();
  if (!missionId) return { status: 400, body: { error: "missionId \xE9 obrigat\xF3rio" } };
  const mission = await loadMission(missionId);
  if (!mission) return { status: 404, body: { error: "OS n\xE3o encontrada" } };
  if (!isVeladaMission(mission)) {
    return { status: 400, body: { error: "Link de localiza\xE7\xE3o ao vivo s\xF3 est\xE1 dispon\xEDvel para miss\xE3o velada." } };
  }
  if (!rastreioOsAberta(mission.status)) {
    const erro = isTerminalMissionStatus(mission.status) ? "A OS j\xE1 foi encerrada. O link de rastreio parou." : "O link fica indispon\xEDvel enquanto a OS est\xE1 pendente.";
    return { status: 409, body: { error: erro } };
  }
  const existing = await getActiveTrack(missionId);
  const origin = resolvePublicAppUrl(opts.req);
  if (existing) {
    const links2 = linksDoRastreio(existing, origin, mission.id);
    return {
      status: 200,
      body: {
        reused: true,
        trackId: existing.id,
        token: existing.token,
        ...links2,
        trackStatus: existing.status,
        osNumber: mission.id
      }
    };
  }
  const sb = await getLiveTrackSupabase();
  const token = newToken();
  const { data, error } = await sb.from("mission_live_tracks").insert({
    mission_id: missionId,
    token,
    status: "pending",
    created_by: opts.createdBy || null
  }).select("*").single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const raced = await getActiveTrack(missionId);
      if (raced) {
        const links2 = linksDoRastreio(raced, origin, mission.id);
        return {
          status: 200,
          body: {
            reused: true,
            trackId: raced.id,
            token: raced.token,
            ...links2,
            trackStatus: raced.status,
            osNumber: mission.id
          }
        };
      }
    }
    throw new Error(error.message);
  }
  const links = linksDoRastreio(data, origin, mission.id);
  return {
    status: 201,
    body: {
      reused: false,
      trackId: data.id,
      token,
      ...links,
      trackStatus: "pending",
      osNumber: mission.id
    }
  };
}
async function endLiveTrack(opts) {
  await ensureLiveTrackSchema();
  const missionId = String(opts.missionId || "").trim();
  if (!missionId) return { status: 400, body: { error: "missionId \xE9 obrigat\xF3rio" } };
  const track = await getActiveTrack(missionId);
  if (!track) return { status: 200, body: { ok: true, ended: false } };
  const sb = await getLiveTrackSupabase();
  const { error } = await sb.from("mission_live_tracks").update({
    status: "ended",
    ended_at: (/* @__PURE__ */ new Date()).toISOString(),
    ended_reason: opts.reason || "operator_end"
  }).eq("id", track.id);
  if (error) throw new Error(error.message);
  return { status: 200, body: { ok: true, ended: true } };
}
async function watchLiveTrack(opts) {
  await ensureLiveTrackSchema();
  const missionId = String(opts.missionId || "").trim();
  if (!missionId) return { status: 400, body: { error: "missionId \xE9 obrigat\xF3rio" } };
  const mission = await loadMission(missionId);
  if (!mission) return { status: 404, body: { error: "OS n\xE3o encontrada" } };
  if (!isVeladaMission(mission)) {
    return { status: 200, body: { enabled: false, reason: "not_velada" } };
  }
  const sb = await getLiveTrackSupabase();
  const { data: track } = await sb.from("mission_live_tracks").select("*").eq("mission_id", missionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!track) {
    return { status: 200, body: { enabled: true, hasTrack: false, osNumber: mission.id, missionStatus: mission.status } };
  }
  if (isTerminalMissionStatus(mission.status) && ACTIVE_STATUSES.includes(track.status)) {
    await sb.from("mission_live_tracks").update({
      status: "ended",
      ended_at: (/* @__PURE__ */ new Date()).toISOString(),
      ended_reason: "mission_terminal"
    }).eq("id", track.id);
    track.status = "ended";
    track.ended_reason = "mission_terminal";
  }
  let trail = [];
  if (opts.includeTrail && track.id) {
    const { data: pts } = await sb.from("mission_live_positions").select("lat, lng, recorded_at").eq("track_id", track.id).order("recorded_at", { ascending: false }).limit(250);
    trail = (pts || []).slice().reverse();
  }
  const origin = resolvePublicAppUrl();
  const links = linksDoRastreio(track, origin, mission.id);
  const pontos = await pontosDaRota(mission);
  const chegadaEm = await chegadaDoRastreio(sb, track, pontos.destinationPoint);
  return {
    status: 200,
    body: {
      enabled: true,
      hasTrack: true,
      osNumber: mission.id,
      missionStatus: mission.status,
      ...links,
      track: {
        id: track.id,
        status: track.status,
        consent_at: track.consent_at,
        opened_at: track.opened_at,
        open_count: track.open_count,
        sharing_started_at: track.sharing_started_at,
        last_seen_at: track.last_seen_at,
        last_lat: track.last_lat,
        last_lng: track.last_lng,
        last_accuracy: track.last_accuracy,
        last_speed: track.last_speed,
        last_heading: track.last_heading,
        ended_at: track.ended_at,
        ended_reason: track.ended_reason
      },
      trail,
      chegadaEm,
      reentradaBloqueada: reentradaBloqueada(track, chegadaEm),
      reentradaLiberadaEm: track.reentrada_liberada_em || null
    }
  };
}
async function getTrackById(id) {
  const sb = await getLiveTrackSupabase();
  const { data, error } = await sb.from("mission_live_tracks").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function publicGetLiveTrack(opts) {
  await ensureLiveTrackSchema();
  const credencial = String(opts.clientCredential || "").trim();
  const token = String(opts.token || "").trim();
  const papel = credencial ? "cliente" : "agente";
  let track = null;
  if (credencial) {
    const id = idPeloLinkDoCliente(credencial);
    if (!id) return { status: 404, body: { error: "Link inv\xE1lido ou expirado." } };
    track = await getTrackById(id);
  } else if (token) {
    track = await getTrackByToken(token);
  } else {
    return { status: 400, body: { error: "token \xE9 obrigat\xF3rio" } };
  }
  if (!track) return { status: 404, body: { error: "Link inv\xE1lido ou expirado." } };
  const mission = await loadMission(track.mission_id);
  if (!mission) return { status: 404, body: { error: "OS n\xE3o encontrada." } };
  if (!rastreioOsAberta(mission.status)) {
    if (isTerminalMissionStatus(mission.status) && track.status !== "ended") {
      const sbFim = await getLiveTrackSupabase();
      await sbFim.from("mission_live_tracks").update({ status: "ended", ended_at: (/* @__PURE__ */ new Date()).toISOString(), ended_reason: "mission_terminal" }).eq("id", track.id);
      track.status = "ended";
    }
    if (track.status !== "ended") {
      return { status: 403, body: { error: "O link fica indispon\xEDvel enquanto a OS est\xE1 pendente." } };
    }
  }
  const sb = await getLiveTrackSupabase();
  if (opts.contarAbertura !== false) {
    await sb.from("mission_live_tracks").update({
      opened_at: track.opened_at || (/* @__PURE__ */ new Date()).toISOString(),
      open_count: Number(track.open_count || 0) + 1
    }).eq("id", track.id);
  }
  let trail = [];
  let ficha = null;
  const pontos = await pontosDaRota(mission);
  const { data: pts } = await sb.from("mission_live_positions").select("lat, lng, recorded_at").eq("track_id", track.id).order("recorded_at", { ascending: false }).limit(800);
  trail = (pts || []).slice().reverse();
  if (papel === "cliente") {
    const viatura = await viaturaDaMissao(mission.client_vehicle);
    ficha = { ...fichaDoCliente(mission, viatura), ...pontos };
  }
  let endereco = null;
  let etapas = [];
  if (papel === "cliente" && track.last_lat != null && track.last_lng != null) {
    endereco = await enderecoDaPosicao(Number(track.last_lat), Number(track.last_lng));
  }
  if (papel === "cliente" && trail.length) {
    for (const etapa of etapasDaTrilha(trail)) {
      etapas.push({ ...etapa, endereco: await enderecoDaPosicao(etapa.lat, etapa.lng) });
    }
  }
  const chegadaEm = await chegadaDoRastreio(sb, track, pontos.destinationPoint, trail);
  const bloqueada = papel === "agente" && reentradaBloqueada(track, chegadaEm);
  return {
    status: 200,
    body: {
      ok: true,
      papel,
      status: track.status,
      ended: track.status === "ended",
      reentradaBloqueada: bloqueada,
      lgpdVersion: LIVE_TRACK_LGPD_VERSION,
      lgpdSummary: LIVE_TRACK_LGPD_SUMMARY,
      lgpdFull: LIVE_TRACK_LGPD_FULL,
      mission: papel === "cliente" ? ficha : publicMissionView(mission, pontos),
      position: track.last_lat != null ? {
        lat: track.last_lat,
        lng: track.last_lng,
        accuracy: track.last_accuracy,
        speed: track.last_speed,
        at: track.last_seen_at,
        address: endereco
      } : null,
      trail,
      etapas,
      chegadaEm
    }
  };
}
async function publicConsentLiveTrack(opts) {
  await ensureLiveTrackSchema();
  const token = String(opts.token || "").trim();
  if (!token) return { status: 400, body: { error: "token \xE9 obrigat\xF3rio" } };
  if (!opts.accepted) return { status: 400, body: { error: "\xC9 necess\xE1rio aceitar o compartilhamento para continuar." } };
  const track = await getTrackByToken(token);
  if (!track) return { status: 404, body: { error: "Link inv\xE1lido ou expirado." } };
  if (track.status === "ended") return { status: 410, body: { error: "Este acompanhamento j\xE1 foi encerrado." } };
  const mission = await loadMission(track.mission_id);
  if (!mission) return { status: 404, body: { error: "OS n\xE3o encontrada." } };
  if (!rastreioOsAberta(mission.status)) {
    const erro = isTerminalMissionStatus(mission.status) ? "A miss\xE3o j\xE1 foi encerrada. O rastreio n\xE3o \xE9 mais necess\xE1rio." : "O link fica indispon\xEDvel enquanto a OS est\xE1 pendente.";
    return { status: isTerminalMissionStatus(mission.status) ? 410 : 403, body: { error: erro } };
  }
  const sb = await getLiveTrackSupabase();
  const pontos = await pontosDaRota(mission);
  const chegadaEm = await chegadaDoRastreio(sb, track, pontos.destinationPoint);
  if (reentradaBloqueada(track, chegadaEm)) {
    return { status: 403, body: { reentradaBloqueada: true, error: "Chegada no destino registrada. Um operador precisa liberar o acesso do agente de novo." } };
  }
  const nextStatus = track.status === "sharing" ? "sharing" : "consented";
  const { error } = await sb.from("mission_live_tracks").update({
    status: nextStatus,
    consent_at: track.consent_at || (/* @__PURE__ */ new Date()).toISOString(),
    consent_ip: clientIp(opts.req),
    consent_user_agent: clientUa(opts.req),
    lgpd_version: LIVE_TRACK_LGPD_VERSION
  }).eq("id", track.id);
  if (error) throw new Error(error.message);
  return { status: 200, body: { ok: true, status: nextStatus, pingIntervalMs: LIVE_TRACK_PING_MIN_MS } };
}
async function publicPingLiveTrack(opts) {
  await ensureLiveTrackSchema();
  const token = String(opts.token || "").trim();
  if (!token) return { status: 400, body: { error: "token \xE9 obrigat\xF3rio" } };
  const track = await getTrackByToken(token);
  if (!track) return { status: 404, body: { error: "Link inv\xE1lido ou expirado." } };
  if (track.status === "ended") {
    return { status: 410, body: { ok: false, ended: true, error: "Acompanhamento encerrado." } };
  }
  if (!track.consent_at && track.status === "pending") {
    return { status: 403, body: { error: "Aceite o compartilhamento antes de enviar GPS." } };
  }
  const mission = await loadMission(track.mission_id);
  if (!mission) return { status: 404, body: { error: "OS n\xE3o encontrada." } };
  if (isTerminalMissionStatus(mission.status)) {
    const sbEnd = await getLiveTrackSupabase();
    await sbEnd.from("mission_live_tracks").update({ status: "ended", ended_at: (/* @__PURE__ */ new Date()).toISOString(), ended_reason: "mission_terminal" }).eq("id", track.id);
    return { status: 410, body: { ok: false, ended: true, error: "A miss\xE3o foi encerrada. O rastreio parou." } };
  }
  if (!rastreioOsAberta(mission.status)) {
    return { status: 403, body: { error: "O link fica indispon\xEDvel enquanto a OS est\xE1 pendente." } };
  }
  const sbPre = await getLiveTrackSupabase();
  const pontosPing = await pontosDaRota(mission);
  const chegadaPing = await chegadaDoRastreio(sbPre, track, pontosPing.destinationPoint);
  if (reentradaBloqueada(track, chegadaPing)) {
    const visto = track.last_seen_at ? new Date(track.last_seen_at).getTime() : 0;
    const sessaoViva = visto > 0 && Date.now() - visto < SESSAO_AGENTE_VIVA_MS;
    if (!sessaoViva) {
      return { status: 403, body: { reentradaBloqueada: true, error: "Chegada no destino registrada. Um operador precisa liberar o acesso do agente de novo." } };
    }
  }
  const coords = validateCoords(opts.body?.lat, opts.body?.lng);
  if (!coords) return { status: 400, body: { error: "Coordenadas GPS inv\xE1lidas." } };
  const now = Date.now();
  const lastSeen = track.last_seen_at ? new Date(track.last_seen_at).getTime() : 0;
  if (lastSeen && now - lastSeen < LIVE_TRACK_PING_MIN_MS - 200) {
    return { status: 200, body: { ok: true, throttled: true, status: track.status, ended: false } };
  }
  const accuracy = clampAccuracy(opts.body?.accuracy);
  const speed = clampOptionalNumber(opts.body?.speed, -1, 80);
  const heading = clampOptionalNumber(opts.body?.heading, 0, 360);
  const battery = clampOptionalNumber(opts.body?.battery, 0, 100);
  const nextStatus = "sharing";
  const nowIso = new Date(now).toISOString();
  const sb = await getLiveTrackSupabase();
  const patch = {
    status: nextStatus,
    last_seen_at: nowIso,
    last_lat: coords.lat,
    last_lng: coords.lng,
    last_accuracy: accuracy,
    last_speed: speed,
    last_heading: heading,
    last_battery: battery
  };
  if (!track.sharing_started_at) patch.sharing_started_at = nowIso;
  const { error: upErr } = await sb.from("mission_live_tracks").update(patch).eq("id", track.id);
  if (upErr) throw new Error(upErr.message);
  let insertTrail = true;
  if (track.last_lat != null && track.last_lng != null && track.last_seen_at) {
    const dist = haversineMeters(
      { lat: Number(track.last_lat), lng: Number(track.last_lng) },
      coords
    );
    const dt = now - lastSeen;
    insertTrail = dist >= LIVE_TRACK_TRAIL_MIN_METERS || dt >= LIVE_TRACK_TRAIL_MIN_MS;
  }
  if (insertTrail) {
    await sb.from("mission_live_positions").insert({
      track_id: track.id,
      mission_id: track.mission_id,
      lat: coords.lat,
      lng: coords.lng,
      accuracy,
      speed,
      heading,
      battery,
      recorded_at: nowIso
    });
  }
  return {
    status: 200,
    body: {
      ok: true,
      ended: false,
      status: nextStatus,
      missionStatus: mission.status
    }
  };
}
async function liberarReentradaAgente(opts) {
  await ensureLiveTrackSchema();
  const missionId = String(opts.missionId || "").trim();
  if (!missionId) return { status: 400, body: { error: "missionId \xE9 obrigat\xF3rio" } };
  const track = await getActiveTrack(missionId);
  if (!track) return { status: 404, body: { error: "N\xE3o h\xE1 rastreio ativo nesta OS." } };
  const sb = await getLiveTrackSupabase();
  const quando = (/* @__PURE__ */ new Date()).toISOString();
  const { error } = await sb.from("mission_live_tracks").update({ reentrada_liberada_em: quando }).eq("id", track.id);
  if (error) throw new Error(error.message);
  return { status: 200, body: { ok: true, reentradaLiberadaEm: quando } };
}

// lib/liveTrack/httpHandler.ts
function parseBody(body) {
  if (typeof body === "string") {
    if (!body.trim()) return {};
    return JSON.parse(body);
  }
  return body || {};
}
function authToken(req) {
  return String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "") || String(req.headers?.["x-auth-token"] || "");
}
function createdBy(req) {
  return String(req.headers?.["x-tmseg-user-name"] || req.headers?.["x-tmseg-user-id"] || "").slice(0, 120);
}
async function handleLiveTrackHttp(req, res) {
  res.setHeader?.("Cache-Control", "no-store");
  const op = String(req.query?.op || req.body?.op || "").trim();
  const method = String(req.method || "GET").toUpperCase();
  try {
    if (op === "public-get" && method === "GET") {
      const token = String(req.query?.token || "").trim();
      const clientCredential = String(req.query?.c || "").trim();
      const contarAbertura = String(req.query?.watch || "") !== "1";
      const result = await publicGetLiveTrack({ token, clientCredential, contarAbertura, req });
      res.status(result.status).json(result.body);
      return;
    }
    if (op === "public-consent" && method === "POST") {
      const body = parseBody(req.body);
      const token = String(req.query?.token || body.token || "").trim();
      const result = await publicConsentLiveTrack({ token, accepted: body.accepted === true, req });
      res.status(result.status).json(result.body);
      return;
    }
    if (op === "public-ping" && method === "POST") {
      const body = parseBody(req.body);
      const token = String(req.query?.token || body.token || "").trim();
      const result = await publicPingLiveTrack({ token, body, req });
      res.status(result.status).json(result.body);
      return;
    }
    if (!authToken(req)) {
      res.status(401).json({ error: "N\xE3o autorizado" });
      return;
    }
    if (op === "generate" && method === "POST") {
      const body = parseBody(req.body);
      const result = await generateLiveTrack({
        missionId: String(body.missionId || req.query?.missionId || ""),
        createdBy: createdBy(req),
        req
      });
      res.status(result.status).json(result.body);
      return;
    }
    if (op === "watch" && method === "GET") {
      const result = await watchLiveTrack({
        missionId: String(req.query?.missionId || ""),
        includeTrail: String(req.query?.trail || "") === "1"
      });
      res.status(result.status).json(result.body);
      return;
    }
    if (op === "end" && method === "POST") {
      const body = parseBody(req.body);
      const result = await endLiveTrack({
        missionId: String(body.missionId || req.query?.missionId || ""),
        reason: String(body.reason || "operator_end")
      });
      res.status(result.status).json(result.body);
      return;
    }
    if (op === "liberar-reentrada" && method === "POST") {
      const body = parseBody(req.body);
      const result = await liberarReentradaAgente({
        missionId: String(body.missionId || req.query?.missionId || "")
      });
      res.status(result.status).json(result.body);
      return;
    }
    res.status(400).json({ error: "op inv\xE1lida" });
  } catch (e) {
    console.error("[live-track]", e);
    res.status(500).json({ error: e?.message || "Erro interno" });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handleLiveTrackHttp
});
