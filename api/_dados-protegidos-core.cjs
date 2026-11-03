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

// lib/dadosProtegidos/proxy.ts
var proxy_exports = {};
__export(proxy_exports, {
  atenderDadosProtegidos: () => atenderDadosProtegidos,
  tabelaDaUrl: () => tabelaDaUrl
});
module.exports = __toCommonJS(proxy_exports);
var import_supabase_js2 = require("@supabase/supabase-js");

// lib/supabaseAdmin.ts
var import_supabase_js = require("@supabase/supabase-js");

// lib/supabaseDefaults.ts
var TMSEG_SUPABASE_PROJECT_REF = "ajhmmjuewdsukecaimik";
var DEFAULT_SUPABASE_URL = `https://${TMSEG_SUPABASE_PROJECT_REF}.supabase.co`;

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

// lib/supabaseAdmin.ts
var warnedMissingServiceRole = false;
var warnedAnonKeyAsService = false;
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

// lib/sessao/token.ts
var import_node_crypto = require("node:crypto");
var PREFIXO = "ponte.v1.";
var TTL_SESSAO_MS = 12 * 60 * 60 * 1e3;
function segredoDaSessao(env = process.env) {
  return String(env.SESSION_SECRET || "").trim();
}
function tokenLegado(token) {
  const limpo = String(token || "").replace(/^Bearer\s+/i, "").trim();
  return limpo.startsWith("tmseg-token-") || limpo.startsWith("impersonation-token-");
}
function assinar(segredo, carga) {
  return (0, import_node_crypto.createHmac)("sha256", segredo).update(carga).digest("base64url");
}
function abrirSessao(segredo, token, agora = Date.now()) {
  const limpo = String(token || "").replace(/^Bearer\s+/i, "").trim();
  if (!segredo || tokenLegado(limpo) || !limpo.startsWith(PREFIXO)) return null;
  const resto = limpo.slice(PREFIXO.length);
  const ponto = resto.lastIndexOf(".");
  if (ponto <= 0) return null;
  const corpo = resto.slice(0, ponto);
  const assinatura = resto.slice(ponto + 1);
  const esperada = assinar(segredo, corpo);
  const recebida = Buffer.from(assinatura);
  const calculada = Buffer.from(esperada);
  if (recebida.length !== calculada.length || !(0, import_node_crypto.timingSafeEqual)(recebida, calculada)) return null;
  try {
    const json = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    if (!json.sub || typeof json.exp !== "number" || !json.csrf) return null;
    if (agora >= json.exp) return null;
    return {
      usuarioId: String(json.sub),
      csrf: json.csrf,
      expiraEm: json.exp,
      epoch: typeof json.ep === "number" ? json.ep : 0
    };
  } catch {
    return null;
  }
}

// lib/dadosProtegidos/tabelas.ts
var TABELAS_PROTEGIDAS = [
  "missions",
  "clients",
  "client_price_tables",
  "provider_cost_tables",
  "financial_transactions",
  "financial_categories",
  "financial_invoices",
  "financial_invoice_missions",
  "providers",
  "financial_accounts"
];
var CONJUNTO = new Set(TABELAS_PROTEGIDAS);
var FINANCEIRAS = /* @__PURE__ */ new Set([
  "financial_transactions",
  "financial_categories",
  "financial_invoices",
  "financial_invoice_missions",
  "financial_accounts"
]);
function ehTabelaProtegida(nome) {
  return CONJUNTO.has(nome);
}
function ehTabelaFinanceira(nome) {
  return FINANCEIRAS.has(nome);
}
function dobrar(valor) {
  return valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
function portal(ficha) {
  return ficha.permissoes.some((item) => item === "portal-only" || item.startsWith("portal:") || item.startsWith("portal-perfil:"));
}
function escreveFinanceiro(ficha) {
  const perfil = dobrar(ficha.perfil);
  if (perfil === "avancado") return false;
  if (perfil === "diretoria" || perfil === "financeiro" || perfil === "administrador" || perfil === "ceo") return true;
  return ficha.permissoes.some(
    (item) => item === "*" || item === "fin-dashboard" || item === "finance-group" || item === "diretoria-faturamento"
  );
}
function autorizarTabela(ficha, tabela, method) {
  if (!ficha || ficha.status !== "Ativo") return "sem_autenticacao";
  if (!ehTabelaProtegida(tabela)) return "sem_permissao";
  const escrita = method !== "GET" && method !== "HEAD";
  if (portal(ficha)) {
    if (escrita || ehTabelaFinanceira(tabela)) return "sem_permissao";
    if (tabela === "missions" || tabela === "clients") return "ok";
    return "sem_permissao";
  }
  if (dobrar(ficha.perfil) === "avancado" && ehTabelaFinanceira(tabela)) return "sem_permissao";
  if (ehTabelaFinanceira(tabela) && escrita && !escreveFinanceiro(ficha)) return "sem_permissao";
  return "ok";
}

// lib/dadosProtegidos/proxy.ts
var CABECALHOS_UTEIS = ["accept", "content-type", "prefer", "range"];
function tabelaDaUrl(url, origemEsperada) {
  let lida;
  try {
    lida = new URL(url);
  } catch {
    return null;
  }
  let origem;
  try {
    origem = new URL(origemEsperada);
  } catch {
    return null;
  }
  if (lida.host !== origem.host) return null;
  const partes = lida.pathname.split("/").filter(Boolean);
  if (partes.length !== 3 || partes[0] !== "rest" || partes[1] !== "v1") return null;
  const tabela = partes[2];
  if (!ehTabelaProtegida(tabela)) return null;
  if (/system_users|password/i.test(lida.search)) return null;
  return { tabela, destino: `${origem.origin}/rest/v1/${tabela}${lida.search}` };
}
function fichaDe(linha) {
  const bruto = linha.profiles;
  const perfil = Array.isArray(bruto) ? bruto[0] : bruto;
  const doPerfil = Array.isArray(perfil?.permissions) ? perfil.permissions : [];
  const doUsuario = Array.isArray(linha.permissions) ? linha.permissions : [];
  return {
    id: String(linha.id),
    status: String(linha.status || ""),
    perfil: String(perfil?.name || ""),
    permissoes: [.../* @__PURE__ */ new Set([...doPerfil, ...doUsuario])],
    clienteId: linha.client_id ? String(linha.client_id) : null
  };
}
async function atenderDadosProtegidos(pedido, opcoes = {}) {
  const env = opcoes.env ?? process.env;
  const segredo = segredoDaSessao(env);
  const negado = (status, codigo) => ({
    status,
    body: JSON.stringify({ ok: false, codigo, message: codigo }),
    contentType: "application/json",
    contentRange: null
  });
  if (!segredo || tokenLegado(String(pedido.authorization || ""))) return negado(401, "sessao_invalida");
  const aberta = abrirSessao(segredo, String(pedido.authorization || ""), opcoes.agora);
  if (!aberta) return negado(401, "sessao_invalida");
  const origem = getSupabaseUrl();
  const alvo = tabelaDaUrl(pedido.url, origem);
  if (!alvo) return negado(403, "sem_permissao");
  const buscar = opcoes.buscar ?? ((id) => lerFicha(id));
  const ficha = await buscar(aberta.usuarioId);
  if (ficha === "erro") return negado(503, "fonte_indisponivel");
  const metodo = String(pedido.method || "GET").toUpperCase();
  if (autorizarTabela(ficha, alvo.tabela, metodo) !== "ok") return negado(403, "sem_permissao");
  const chave = opcoes.chave ?? getSupabaseServiceRoleKey();
  if (!chave) return negado(503, "fonte_indisponivel");
  const cabecalhos = new Headers();
  cabecalhos.set("apikey", chave);
  cabecalhos.set("authorization", `Bearer ${chave}`);
  for (const nome of CABECALHOS_UTEIS) {
    const valor = pedido.headers[nome] || pedido.headers[nome.toLowerCase()];
    if (valor) cabecalhos.set(nome, valor);
  }
  const encaminhar = opcoes.encaminhar ?? ((destino, init) => fetch(destino, init));
  const resposta = await encaminhar(alvo.destino, {
    method: metodo,
    headers: cabecalhos,
    body: metodo === "GET" || metodo === "HEAD" ? void 0 : pedido.body
  });
  return {
    status: resposta.status,
    body: await resposta.text(),
    contentType: resposta.headers.get("content-type") || "application/json",
    contentRange: resposta.headers.get("content-range")
  };
}
async function lerFicha(id) {
  const chave = getSupabaseServiceRoleKey();
  if (!chave) return "erro";
  const cliente = (0, import_supabase_js2.createClient)(getSupabaseUrl(), chave);
  const { data, error } = await cliente.from("system_users").select("id, status, permissions, client_id, profiles:profile_id ( name, permissions )").eq("id", id).maybeSingle();
  if (error) return "erro";
  if (!data) return null;
  return fichaDe(data);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  atenderDadosProtegidos,
  tabelaDaUrl
});
