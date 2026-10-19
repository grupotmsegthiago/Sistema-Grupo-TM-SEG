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

// lib/sessao/vercel.ts
var vercel_exports = {};
__export(vercel_exports, {
  criarHandlerSessao: () => criarHandlerSessao
});
module.exports = __toCommonJS(vercel_exports);

// lib/sessao/loginProducao.ts
var import_supabase_js2 = require("@supabase/supabase-js");

// lib/gestorFiscal/ponteAuth/formatoSenha.ts
var import_node_crypto2 = require("node:crypto");

// lib/gestorFiscal/ponteAuth/hashSenha.ts
var import_node_crypto = require("node:crypto");
var PARAMETROS_SCRYPT_V1 = { versao: 1, N: 16384, r: 8, p: 1, keylen: 32 };
function identificarFormatoHash(gravada) {
  const salva = gravada == null ? "" : String(gravada);
  if (!salva) return null;
  if (salva.startsWith("$2a$") || salva.startsWith("$2b$") || salva.startsWith("$2y$") || salva.startsWith("$argon2")) {
    return "outro";
  }
  const partes = salva.split("$");
  if (partes[0] !== "scrypt") return salva.includes("$") ? "outro" : null;
  if (partes.length === 3 && hex(partes[1]) && hex(partes[2])) return "scrypt_portal";
  if (partes.length === 8 && partes[1] === "v1" && parametrosConhecidos(partes) && hex(partes[6]) && hex(partes[7])) {
    return "scrypt_v1";
  }
  return "outro";
}
function gerarHashVersionado(senha) {
  const sal = (0, import_node_crypto.randomBytes)(16).toString("hex");
  const hash = (0, import_node_crypto.scryptSync)(senha, sal, PARAMETROS_SCRYPT_V1.keylen, {
    N: PARAMETROS_SCRYPT_V1.N,
    r: PARAMETROS_SCRYPT_V1.r,
    p: PARAMETROS_SCRYPT_V1.p
  }).toString("hex");
  return `scrypt$v1$${PARAMETROS_SCRYPT_V1.N}$${PARAMETROS_SCRYPT_V1.r}$${PARAMETROS_SCRYPT_V1.p}$${PARAMETROS_SCRYPT_V1.keylen}$${sal}$${hash}`;
}
function verificarSenhaArmazenada(senha, armazenada) {
  const limpa = String(senha ?? "").trim();
  if (!limpa) return false;
  const formato = identificarFormatoHash(armazenada);
  if (formato === "scrypt_portal") return portalConfere(limpa, String(armazenada));
  if (formato === "scrypt_v1") return v1Confere(limpa, String(armazenada));
  return false;
}
function portalConfere(senha, armazenada) {
  const partes = armazenada.split("$");
  const calculado = (0, import_node_crypto.scryptSync)(senha, partes[1], 32);
  const salvo = Buffer.from(partes[2], "hex");
  if (calculado.length !== salvo.length) return false;
  return (0, import_node_crypto.timingSafeEqual)(calculado, salvo);
}
function v1Confere(senha, armazenada) {
  const partes = armazenada.split("$");
  const calculado = (0, import_node_crypto.scryptSync)(senha, partes[6], PARAMETROS_SCRYPT_V1.keylen, {
    N: PARAMETROS_SCRYPT_V1.N,
    r: PARAMETROS_SCRYPT_V1.r,
    p: PARAMETROS_SCRYPT_V1.p
  });
  const salvo = Buffer.from(partes[7], "hex");
  if (calculado.length !== salvo.length) return false;
  return (0, import_node_crypto.timingSafeEqual)(calculado, salvo);
}
function parametrosConhecidos(partes) {
  return Number(partes[2]) === PARAMETROS_SCRYPT_V1.N && Number(partes[3]) === PARAMETROS_SCRYPT_V1.r && Number(partes[4]) === PARAMETROS_SCRYPT_V1.p && Number(partes[5]) === PARAMETROS_SCRYPT_V1.keylen;
}
function hex(valor) {
  return valor.length > 0 && valor.length % 2 === 0 && /^[0-9a-f]+$/i.test(valor);
}

// lib/gestorFiscal/ponteAuth/formatoSenha.ts
function classificarSenhaGravada(gravada) {
  const salva = gravada == null ? "" : String(gravada);
  if (!salva) return "vazia";
  if (salva.startsWith("$2a$") || salva.startsWith("$2b$") || salva.startsWith("$2y$") || salva.startsWith("$argon2")) {
    return "nao_reconhecido";
  }
  const formato = identificarFormatoHash(salva);
  if (formato === "scrypt_portal" || formato === "scrypt_v1") return "scrypt";
  if (formato === "outro" || salva.includes("$")) return "nao_reconhecido";
  return "texto";
}
function conferirSenhaDaFicha(informada, ficha) {
  if (ficha.password_hash && verificarSenhaArmazenada(informada, ficha.password_hash)) return "hash";
  if (conferirSenhaExistente(informada, ficha.password)) return "texto";
  return "nao";
}
function conferirSenhaExistente(informada, gravada) {
  const formato = classificarSenhaGravada(gravada);
  const limpa = String(informada ?? "").trim();
  if (!limpa || formato === "vazia" || formato === "nao_reconhecido") return false;
  if (formato === "scrypt") return verificarSenhaArmazenada(limpa, gravada);
  const digitada = Buffer.from(limpa);
  const armazenada = Buffer.from(String(gravada));
  if (digitada.length !== armazenada.length) return false;
  return (0, import_node_crypto2.timingSafeEqual)(digitada, armazenada);
}

// lib/cevaPortal/regrasAcesso.ts
var PERMISSAO_SO_PORTAL = "portal-only";
function usuarioSoPortal(perms) {
  return Array.isArray(perms) && perms.includes(PERMISSAO_SO_PORTAL);
}

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

// lib/sessao/gravarSenha.ts
function colunaAusente(mensagem, coluna) {
  return new RegExp(coluna, "i").test(mensagem) && /does not exist|n[aã]o existe|schema cache|could not find/i.test(mensagem);
}
async function gravarSenhaNoServidor(cliente, usuarioId, senha, extras = {}) {
  const hash = gerarHashVersionado(senha);
  const base = {
    password_hash: hash,
    password: null,
    ...extras
  };
  let resultado = await cliente.from("system_users").update(base).eq("id", usuarioId);
  if (resultado.error && colunaAusente(resultado.error.message || "", "session_epoch")) {
    const semEpoch = { ...base };
    delete semEpoch.session_epoch;
    resultado = await cliente.from("system_users").update(semEpoch).eq("id", usuarioId);
  }
  if (!resultado.error) return "hash";
  const mensagem = resultado.error.message || "";
  if (!colunaAusente(mensagem, "password_hash")) {
    throw new Error("Falha ao gravar a senha.");
  }
  const legado = { password: senha };
  for (const [chave, valor] of Object.entries(extras)) {
    if (chave === "session_epoch" || chave === "force_password_change") continue;
    legado[chave] = valor;
  }
  const texto = await cliente.from("system_users").update(legado).eq("id", usuarioId);
  if (texto.error) throw new Error("Falha ao gravar a senha.");
  return "texto";
}

// lib/sessao/token.ts
var import_node_crypto3 = require("node:crypto");
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
  return (0, import_node_crypto3.createHmac)("sha256", segredo).update(carga).digest("base64url");
}
function emitirSessao(segredo, usuarioId, agora = Date.now(), ttl = TTL_SESSAO_MS, epoch = 0) {
  if (!segredo || !usuarioId) throw new Error("sessao_indisponivel");
  const csrf = (0, import_node_crypto3.randomBytes)(32).toString("base64url");
  const expiraEm = agora + ttl;
  const corpo = Buffer.from(JSON.stringify({ sub: usuarioId, exp: expiraEm, csrf, ep: epoch }), "utf8").toString("base64url");
  return { token: `${PREFIXO}${corpo}.${assinar(segredo, corpo)}`, csrf, expiraEm, epoch };
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
  if (recebida.length !== calculada.length || !(0, import_node_crypto3.timingSafeEqual)(recebida, calculada)) return null;
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

// lib/sessao/loginProducao.ts
function recusar(status, codigo, motivo, cookies = []) {
  return { status, body: { ok: false, codigo, motivo }, cookies };
}
function cookieSessao(token, maxAge) {
  const valor = maxAge > 0 ? token : "";
  return `tmseg_ponte=${valor}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
function perfilDe(ficha) {
  const bruto = ficha.profiles;
  const perfil = Array.isArray(bruto) ? bruto[0] : bruto;
  const doPerfil = Array.isArray(perfil?.permissions) ? perfil.permissions : [];
  const doUsuario = Array.isArray(ficha.permissions) ? ficha.permissions : [];
  return {
    nome: perfil?.name || "Usu\xE1rio",
    permissoes: [.../* @__PURE__ */ new Set([...doPerfil, ...doUsuario])]
  };
}
function publico(ficha) {
  const perfil = perfilDe(ficha);
  return {
    id: ficha.id,
    name: ficha.name,
    email: ficha.email,
    role: perfil.nome,
    permissions: perfil.permissoes,
    clientId: ficha.client_id,
    providerId: ficha.provider_id,
    force_password_change: Boolean(ficha.force_password_change),
    trainingRequired: Boolean(ficha.training_required),
    trainingPassedAt: ficha.training_passed_at || null,
    trainingModules: ficha.training_modules ?? null,
    trainingScore: ficha.training_score ?? null
  };
}
function clienteAdmin() {
  const chave = getSupabaseServiceRoleKey();
  if (!chave) return null;
  return (0, import_supabase_js2.createClient)(getSupabaseUrl(), chave);
}
var COLUNAS = `
  id, name, email, password, password_hash, session_epoch, status, client_id, provider_id, force_password_change,
  permissions, training_required, training_passed_at, training_modules, training_score,
  profiles:profile_id ( name, permissions )
`;
var COLUNAS_ANTIGAS = `
  id, name, email, password, status, client_id, provider_id, force_password_change,
  permissions, training_required, training_passed_at, training_modules, training_score,
  profiles:profile_id ( name, permissions )
`;
async function lerFicha(cliente, aplicar) {
  const primeira = await aplicar(cliente.from("system_users").select(COLUNAS));
  if (!primeira.error) return primeira.data ?? null;
  if (!/password_hash|session_epoch/i.test(primeira.error.message || "")) return "erro";
  const segunda = await aplicar(cliente.from("system_users").select(COLUNAS_ANTIGAS));
  if (segunda.error) return "erro";
  return segunda.data ?? null;
}
async function porEmail(cliente, email) {
  return lerFicha(cliente, (consulta) => consulta.ilike("email", email).maybeSingle());
}
async function porId(cliente, id) {
  return lerFicha(cliente, (consulta) => consulta.eq("id", id).maybeSingle());
}
function sessaoDoPedido(pedido, segredo, agora) {
  const bruto = String(pedido.authorization || "");
  if (tokenLegado(bruto)) return null;
  return abrirSessao(segredo, bruto, agora);
}
async function atenderLoginProducao(pedido, opcoes = {}) {
  const env = opcoes.env ?? process.env;
  const agora = opcoes.agora ?? (() => Date.now());
  const segredo = segredoDaSessao(env);
  if (!segredo) return recusar(503, "sessao_indisponivel", "O segredo da sess\xE3o n\xE3o est\xE1 configurado.");
  const cliente = opcoes.cliente ?? clienteAdmin();
  if (!cliente) return recusar(503, "fonte_indisponivel", "A fonte confi\xE1vel n\xE3o est\xE1 dispon\xEDvel. O acesso foi negado.");
  try {
    if (pedido.acao === "login") return await entrar(pedido, cliente, segredo, agora());
    const aberta = sessaoDoPedido(pedido, segredo, agora());
    if (!aberta) return recusar(401, "sessao_invalida", "O token local n\xE3o prova a sess\xE3o.");
    const ficha = await porId(cliente, aberta.usuarioId);
    if (ficha === "erro") return recusar(503, "fonte_indisponivel", "A fonte confi\xE1vel n\xE3o respondeu. O acesso foi negado.");
    if (!ficha || ficha.status !== "Ativo") {
      return recusar(403, "usuario_desativado", "Usu\xE1rio desativado.", [cookieSessao("", 0)]);
    }
    if (typeof ficha.session_epoch === "number" && ficha.session_epoch !== aberta.epoch) {
      return recusar(401, "sessao_invalida", "A sess\xE3o foi encerrada.", [cookieSessao("", 0)]);
    }
    if (pedido.acao === "logout") {
      return { status: 200, body: { ok: true, codigo: "ok" }, cookies: [cookieSessao("", 0)] };
    }
    if (pedido.acao === "sessao") {
      return { status: 200, body: { ok: true, codigo: "ok", usuario: publico(ficha) }, cookies: [] };
    }
    if (pedido.acao === "confirmar") return confirmar(pedido, ficha);
    if (pedido.acao === "senha") return trocar(pedido, cliente, ficha, segredo, agora());
    if (pedido.acao === "personificar") return personificar(pedido, cliente, ficha, segredo, agora());
    return recusar(405, "metodo_nao_permitido", "A\xE7\xE3o n\xE3o aceita.");
  } catch {
    return recusar(503, "fonte_indisponivel", "A fonte confi\xE1vel n\xE3o respondeu. O acesso foi negado.");
  }
}
async function entrar(pedido, cliente, segredo, agora) {
  if (pedido.method !== "POST") return recusar(405, "metodo_nao_permitido", "O login seguro aceita POST.");
  if (tokenLegado(String(pedido.authorization || ""))) {
    return recusar(401, "sessao_invalida", "O token local n\xE3o prova a sess\xE3o.");
  }
  const email = String(pedido.body.email || "").trim().toLowerCase();
  const senha = String(pedido.body.senha || "");
  if (!email || !senha.trim()) return recusar(401, "credenciais_invalidas", "Credenciais n\xE3o conferem.");
  const ficha = await porEmail(cliente, email);
  if (ficha === "erro") return recusar(503, "fonte_indisponivel", "A fonte confi\xE1vel n\xE3o respondeu. O acesso foi negado.");
  const conferida = ficha ? conferirSenhaDaFicha(senha, ficha) : "nao";
  if (!ficha || conferida === "nao") {
    return recusar(401, "credenciais_invalidas", "Credenciais n\xE3o conferem.");
  }
  if (ficha.status !== "Ativo") return recusar(403, "usuario_desativado", "Usu\xE1rio desativado. Nenhuma sess\xE3o foi aberta.");
  const perfil = perfilDe(ficha);
  if (usuarioSoPortal(perfil.permissoes)) {
    return recusar(403, "portal_only", "Este acesso \xE9 somente o portal do cliente.");
  }
  if (conferida === "texto") {
    const modo = await gravarSenhaNoServidor(cliente, String(ficha.id), senha.trim(), { force_password_change: true });
    if (modo === "hash") ficha.force_password_change = true;
  }
  const emitida = emitirSessao(segredo, String(ficha.id), agora, TTL_SESSAO_MS, Number(ficha.session_epoch || 0));
  return {
    status: 200,
    body: { ok: true, codigo: "ok", csrf: emitida.csrf, token: emitida.token, usuario: publico(ficha) },
    cookies: [cookieSessao(emitida.token, Math.floor(TTL_SESSAO_MS / 1e3))]
  };
}
function confirmar(pedido, ficha) {
  const senha = String(pedido.body.senha || "");
  const pedidoId = String(pedido.body.usuarioId || "");
  if (pedidoId && pedidoId !== String(ficha.id)) {
    return recusar(403, "sem_permissao", "A confirma\xE7\xE3o exige a senha de quem est\xE1 na sess\xE3o.");
  }
  const ok = conferirSenhaDaFicha(senha, ficha) !== "nao";
  return { status: 200, body: { ok, codigo: ok ? "ok" : "credenciais_invalidas" }, cookies: [] };
}
async function trocar(pedido, cliente, ficha, segredo, agora) {
  if (pedido.method !== "POST") return recusar(405, "metodo_nao_permitido", "A troca de senha aceita POST.");
  const nova = String(pedido.body.senhaNova || "").trim();
  const atual = String(pedido.body.senhaAtual || "");
  if (nova.length < 6) return recusar(400, "senha_curta", "A nova senha deve ter no m\xEDnimo 6 caracteres.");
  const alvoId = String(pedido.body.usuarioId || "");
  if (alvoId && alvoId !== String(ficha.id)) {
    const perfil = dobrar(perfilDe(ficha).nome);
    if (perfil !== "diretoria" && perfil !== "administrador" && perfil !== "ceo") {
      return recusar(403, "sem_permissao", "A ficha do servidor n\xE3o autoriza gravar a senha de outro usu\xE1rio.");
    }
    await gravarSenhaNoServidor(cliente, alvoId, nova, { force_password_change: true });
    return { status: 200, body: { ok: true, codigo: "ok" }, cookies: [] };
  }
  if (!ficha.force_password_change && conferirSenhaDaFicha(atual, ficha) === "nao") {
    return recusar(401, "credenciais_invalidas", "A senha atual n\xE3o confere.");
  }
  const epoch = Number(ficha.session_epoch || 0) + 1;
  await gravarSenhaNoServidor(cliente, String(ficha.id), nova, {
    force_password_change: false,
    session_epoch: epoch
  });
  const emitida = emitirSessao(segredo, String(ficha.id), agora, TTL_SESSAO_MS, epoch);
  return {
    status: 200,
    body: { ok: true, codigo: "ok", token: emitida.token, csrf: emitida.csrf },
    cookies: [cookieSessao(emitida.token, Math.floor(TTL_SESSAO_MS / 1e3))]
  };
}
async function personificar(pedido, cliente, ficha, segredo, agora) {
  if (pedido.method !== "POST") return recusar(405, "metodo_nao_permitido", "A personifica\xE7\xE3o aceita POST.");
  const perfil = dobrar(perfilDe(ficha).nome);
  if (perfil !== "diretoria" && perfil !== "administrador" && perfil !== "ceo") {
    return recusar(403, "sem_permissao", "A ficha do servidor n\xE3o autoriza a auditoria de outro usu\xE1rio.");
  }
  const alvoId = String(pedido.body.usuarioId || "");
  const alvo = await porId(cliente, alvoId);
  if (alvo === "erro") return recusar(503, "fonte_indisponivel", "A fonte confi\xE1vel n\xE3o respondeu. O acesso foi negado.");
  if (!alvo || alvo.status !== "Ativo") return recusar(403, "usuario_desativado", "Usu\xE1rio desativado.");
  const emitida = emitirSessao(segredo, String(alvo.id), agora, TTL_SESSAO_MS, Number(alvo.session_epoch || 0));
  return {
    status: 200,
    body: { ok: true, codigo: "ok", token: emitida.token, csrf: emitida.csrf, usuario: publico(alvo) },
    cookies: [cookieSessao(emitida.token, Math.floor(TTL_SESSAO_MS / 1e3))]
  };
}
function dobrar(valor) {
  return valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// lib/sessao/vercel.ts
function cabecalho(req, nome) {
  const valor = req.headers?.[nome] ?? req.headers?.[nome.toLowerCase()];
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}
function corpoDe(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  if (typeof body === "string" && body.trim()) {
    try {
      const lido = JSON.parse(body);
      if (lido && typeof lido === "object" && !Array.isArray(lido)) return lido;
    } catch {
      return {};
    }
  }
  return {};
}
function criarHandlerSessao(acao) {
  return async function handler(req, res) {
    const resposta = await atenderLoginProducao({
      method: String(req.method || "GET").toUpperCase(),
      acao,
      authorization: cabecalho(req, "authorization"),
      body: corpoDe(req.body)
    });
    res.setHeader("Cache-Control", "no-store");
    if (resposta.cookies.length) res.setHeader("Set-Cookie", resposta.cookies);
    res.status(resposta.status).json(resposta.body);
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  criarHandlerSessao
});
