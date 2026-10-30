"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/passwordReset.ts
var passwordReset_exports = {};
__export(passwordReset_exports, {
  handlePasswordResetConfirm: () => handlePasswordResetConfirm,
  handlePasswordResetRequest: () => handlePasswordResetRequest,
  handlePasswordResetValidate: () => handlePasswordResetValidate,
  redefinirComTextoDeCriacao: () => redefinirComTextoDeCriacao
});
module.exports = __toCommonJS(passwordReset_exports);
var import_crypto2 = __toESM(require("crypto"), 1);

// lib/gestorFiscal/ponteAuth/hashSenha.ts
var import_node_crypto = require("node:crypto");
var PARAMETROS_SCRYPT_V1 = { versao: 1, N: 16384, r: 8, p: 1, keylen: 32 };
function gerarHashVersionado(senha) {
  const sal = (0, import_node_crypto.randomBytes)(16).toString("hex");
  const hash = (0, import_node_crypto.scryptSync)(senha, sal, PARAMETROS_SCRYPT_V1.keylen, {
    N: PARAMETROS_SCRYPT_V1.N,
    r: PARAMETROS_SCRYPT_V1.r,
    p: PARAMETROS_SCRYPT_V1.p
  }).toString("hex");
  return `scrypt$v1$${PARAMETROS_SCRYPT_V1.N}$${PARAMETROS_SCRYPT_V1.r}$${PARAMETROS_SCRYPT_V1.p}$${PARAMETROS_SCRYPT_V1.keylen}$${sal}$${hash}`;
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
    if (chave === "session_epoch") continue;
    if (chave === "force_password_change") {
      if (valor === false) legado[chave] = false;
      continue;
    }
    legado[chave] = valor;
  }
  const texto = await cliente.from("system_users").update(legado).eq("id", usuarioId);
  if (texto.error) throw new Error("Falha ao gravar a senha.");
  return "texto";
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

// lib/email/passwordResetEmails.ts
function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}
function baseTemplate(content, senderName) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <div style="background:#1a1a1a;padding:28px 32px;text-align:center;">
    <h1 style="color:#ffffff;font-size:22px;margin:0 0 4px;letter-spacing:1px;">GRUPO <span style="color:#c0392b;font-weight:700;">TM SEG</span></h1>
    <p style="color:#999;font-size:12px;margin:0;letter-spacing:2px;text-transform:uppercase;">Seguran\xE7a &amp; Escolta Armada</p>
  </div>
  <div style="height:3px;background:linear-gradient(90deg,#c0392b,#1a1a1a);"></div>
  <div style="padding:32px;color:#333;line-height:1.7;font-size:14px;">${content}</div>
  <div style="background:#1a1a1a;padding:24px 32px;text-align:center;border-top:3px solid #c0392b;">
    <p style="color:#ffffff;font-weight:600;font-size:13px;margin:4px 0;">${senderName ? toTitleCase(senderName) : "Equipe Grupo TM SEG"}</p>
    <p style="color:#c0392b;font-weight:600;margin:4px 0;">Grupo TM SEG</p>
    <p style="color:#999;font-size:11px;margin:8px 0 0;">E-mail autom\xE1tico. D\xFAvidas: adm@grupotmseg.com.br</p>
  </div>
</div>
</body></html>`;
}
async function sendPasswordResetEmail(to, name, resetLink, senderName, portalLink) {
  try {
    const portal = portalLink ? `<p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px 0;">Depois de definir a senha, entre no portal do cliente:<br/><a href="${portalLink}" style="color:#2563eb;word-break:break-all;">${portalLink}</a></p>` : "";
    const html = baseTemplate(`
    <h2 style="color:#111827;font-size:18px;font-weight:800;margin:0 0 12px 0;">Redefini\xE7\xE3o de Senha</h2>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px 0;">Ol\xE1 <strong>${toTitleCase(name)}</strong>,</p>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px 0;">Uma nova senha foi solicitada para o seu acesso ao sistema <strong>Grupo TM SEG</strong>.</p>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px 0;">Clique no bot\xE3o abaixo para definir sua nova senha de acesso:</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${resetLink}" style="display:inline-block;background-color:#dc2626;color:#ffffff;font-size:14px;font-weight:800;text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:0.5px;text-transform:uppercase;">Definir Nova Senha</a>
    </div>
    ${portal}
    <p style="color:#6b7280;font-size:12px;line-height:1.5;margin:20px 0 0 0;">\u26A0\uFE0F Este link \xE9 v\xE1lido por <strong>24 horas</strong>. Se voc\xEA n\xE3o solicitou essa altera\xE7\xE3o, ignore este e-mail.</p>
    <p style="color:#9ca3af;font-size:11px;line-height:1.5;margin:12px 0 0 0;">Caso o bot\xE3o n\xE3o funcione, copie e cole o link abaixo no seu navegador:<br/><span style="color:#2563eb;word-break:break-all;">${resetLink}</span></p>
    `, senderName);
    await sendMail({
      from: SMTP_FROM,
      to,
      subject: "\u{1F510} Redefini\xE7\xE3o de Senha \u2014 Grupo TM SEG",
      html
    });
    console.log(`[Email] Reset de senha enviado \u2192 ${to}`);
    return { ok: true };
  } catch (err) {
    console.error(`[Email] Erro ao enviar reset de senha:`, err?.message);
    return { ok: false, erro: err?.message || "Falha ao enviar e-mail" };
  }
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

// lib/cevaPortal/acesso.ts
var import_crypto = require("crypto");

// lib/cevaPortal/regrasAcesso.ts
var PERMISSAO_SO_PORTAL = "portal-only";
function usuarioSoPortal(perms) {
  return Array.isArray(perms) && perms.includes(PERMISSAO_SO_PORTAL);
}
function normalizarTelefoneWhatsapp(valor) {
  const bruto = String(valor ?? "").trim();
  if (!bruto || bruto.includes("@g.us") || bruto.includes("@lid")) return null;
  const digits = bruto.replace(/\D/g, "");
  if (digits.startsWith("120363")) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}
function mensagemNovaSenhaWhatsapp(input) {
  return [
    "\u{1F510} *GRUPO TMSEG \u2014 Nova senha de acesso*",
    "",
    `Ol\xE1 *${input.nome}*,`,
    "",
    "Sua senha foi redefinida pela equipe da TM SEG.",
    "",
    `\u{1F4E7} *Login:* ${input.email}`,
    `\u{1F511} *Senha:* ${input.senha}`,
    `\u{1F310} *Link:* ${input.link}`,
    "",
    "\u26A0\uFE0F Assim que acessar novamente, troque esta senha.",
    "",
    "_Grupo TMSEG \u2014 Gest\xE3o Operacional_"
  ].join("\n");
}

// lib/cevaPortal/acesso.ts
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
var ALFABETO_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function gerarSenhaTemporaria() {
  const bytes = (0, import_crypto.randomBytes)(12);
  return [...bytes].map((byte) => ALFABETO_SENHA[byte % ALFABETO_SENHA.length]).join("");
}

// lib/cevaPortal/cadastroSistema.ts
function colunaSenhaAlteradaAusente(error) {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return error.code === "42703" || error.code === "PGRST204" || message.includes("senha_alterada_em");
}
async function gravarLinha(sb2, tabela, id, campos) {
  const tentar = async (dados) => {
    if (id == null) return sb2.from(tabela).insert(dados).select("id").single();
    return sb2.from(tabela).update(dados).eq("id", id).select("id").single();
  };
  let resultado = await tentar(campos);
  if (colunaSenhaAlteradaAusente(resultado.error) && Object.prototype.hasOwnProperty.call(campos, "senha_alterada_em")) {
    const resto = { ...campos };
    delete resto.senha_alterada_em;
    resultado = await tentar(resto);
  }
  return resultado;
}
async function lerAcessoPortal(sb2, input) {
  let leitura = sb2.from(input.tabela).select("id").ilike("email", input.email);
  if (input.tabela === "portal_cliente_usuarios" && input.clientId != null && String(input.clientId) !== "") {
    leitura = leitura.eq("client_id", input.clientId);
  }
  const achou = await leitura.maybeSingle();
  if (achou.error) {
    const msg = String(achou.error.message || "");
    if (/does not exist|schema cache|Could not find|PGRST205|42P01/i.test(msg)) {
      return { ok: true, id: null };
    }
    return { ok: false, error: "N\xE3o foi poss\xEDvel ler o acesso do portal." };
  }
  return { ok: true, id: achou.data?.id ?? null };
}
async function aplicarSenhaNoPortal(sb2, input) {
  const senhaInvalida = validarSenha(input.senha);
  if (senhaInvalida) return { ok: false, error: senhaInvalida };
  const acesso = await lerAcessoPortal(sb2, input);
  if (!acesso.ok) return acesso;
  if (acesso.id == null) return { ok: true, atualizado: false };
  const campos = {
    senha_hash: hashSenha(input.senha),
    trocar_senha: input.trocarSenha,
    senha_alterada_em: input.trocarSenha ? null : (/* @__PURE__ */ new Date()).toISOString(),
    atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
  };
  const gravado = await gravarLinha(sb2, input.tabela, acesso.id, campos);
  if (gravado.error) return { ok: false, error: "N\xE3o foi poss\xEDvel gravar a nova senha do portal." };
  return { ok: true, atualizado: true };
}

// lib/cevaPortal/portalServidor.ts
var PORTAL_CEVA = {
  rotulo: "CEVA",
  clienteNome: "CEVA LOGISTICS LTDA",
  tokenPrefix: "ceva-portal",
  headerSessao: "x-ceva-portal",
  logPrefix: "ceva-portal",
  caminho: "/ceva",
  exigeLogin: true,
  tabelas: {
    usuarios: "ceva_portal_usuarios",
    osCampos: "ceva_portal_os_campos",
    catalogo: "ceva_portal_catalogo",
    pgrHistorico: "ceva_portal_pgr_historico",
    solicitacoes: "ceva_escolta_solicitacoes"
  }
};
var PORTAL_IBL = {
  rotulo: "IBL",
  clienteNome: "INTERMODAL BRASIL LOGISTICA S.A.",
  clienteBusca: "INTERMODAL",
  tokenPrefix: "ibl-portal",
  headerSessao: "x-ibl-portal",
  logPrefix: "ibl-portal",
  caminho: "/ibl",
  exigeLogin: true,
  tabelas: {
    usuarios: "ibl_portal_usuarios",
    osCampos: "ibl_portal_os_campos",
    catalogo: "ibl_portal_catalogo",
    pgrHistorico: "ibl_portal_pgr_historico",
    solicitacoes: "ibl_escolta_solicitacoes"
  }
};
var TABELAS_PORTAL_GENERICO = {
  usuarios: "portal_cliente_usuarios",
  osCampos: "portal_cliente_os_campos",
  catalogo: "portal_cliente_catalogo",
  pgrHistorico: "portal_cliente_pgr_historico",
  solicitacoes: "portal_cliente_solicitacoes"
};
var PORTAIS_CLIENTE = [PORTAL_CEVA, PORTAL_IBL];
function portalGenerico(cliente) {
  const slug = String(cliente.portal_slug || "").trim().toLowerCase();
  const id = Number(cliente.id);
  const nome = String(cliente.name || "").trim();
  if (!slug || !nome || !Number.isFinite(id)) return null;
  const fantasia = String(cliente.trading_name || "").trim();
  return {
    rotulo: fantasia || nome,
    clienteNome: nome,
    clientId: id,
    tokenPrefix: `portal-${slug}`,
    headerSessao: "x-portal-cliente",
    logPrefix: `portal-${slug}`,
    caminho: `/${slug}`,
    exigeLogin: true,
    tabelas: { ...TABELAS_PORTAL_GENERICO }
  };
}
function portalPorNomeCliente(nome) {
  const texto = String(nome || "").trim().toUpperCase();
  if (!texto) return null;
  const exato = PORTAIS_CLIENTE.find((portal) => portal.clienteNome.toUpperCase() === texto);
  if (exato) return exato;
  if (texto.includes("CEVA")) return PORTAL_CEVA;
  if (texto.includes("INTERMODAL")) return PORTAL_IBL;
  return null;
}
function portalDaFicha(cliente) {
  if (!cliente) return null;
  const fixo = portalPorNomeCliente(cliente.name);
  if (fixo) return fixo;
  if (cliente.portal_ativo === true) return portalGenerico(cliente);
  return null;
}

// server/whatsapp/zapiMobileEnv.ts
var WHATSAPP_BOT_DISPLAY_NAME = "Monitoramento 24h";
var OFFICIAL_BOT_PHONE_LOCAL = "11926839456";
function hasExplicitZapiMobileEnv() {
  return !!(String(process.env.ZAPI_MOBILE_ID || "").trim() && String(process.env.ZAPI_MOBILE_TOKEN || "").trim());
}
function hasExplicitZapiWebEnv() {
  return !hasExplicitZapiMobileEnv() && String(process.env.ZAPI_INSTANCE_TYPE || "").trim().toLowerCase() === "web" && !!String(process.env.ZAPI_INSTANCE_ID || "").trim() && !!String(process.env.ZAPI_TOKEN || "").trim();
}
function getZapiEnvInstanceType() {
  if (hasExplicitZapiMobileEnv()) return "mobile";
  return String(process.env.ZAPI_INSTANCE_TYPE || "mobile").trim().toLowerCase() === "web" ? "web" : "mobile";
}
function getZapiMobileEnvCreds() {
  const explicitMobile = hasExplicitZapiMobileEnv();
  const instanceId = String(
    process.env.ZAPI_MOBILE_ID || process.env.ZAPI_INSTANCE_ID || ""
  ).trim();
  const token = String(
    process.env.ZAPI_MOBILE_TOKEN || process.env.ZAPI_TOKEN || ""
  ).trim();
  if (!instanceId || !token) return null;
  const label = String(
    process.env.ZAPI_MOBILE_INSTANCIA || process.env.ZAPI_INSTANCE_LABEL || ""
  ).trim() || WHATSAPP_BOT_DISPLAY_NAME;
  const clientToken = [
    process.env.ZAPI_CLIENT_TOKEN,
    process.env.ZAPI_CLIENTE_TOKEN,
    process.env.VITE_ZAPI_CLIENT_TOKEN,
    process.env.ZAPI_SECURITY_TOKEN
  ].map((v) => String(v || "").trim()).find(Boolean) || "";
  return { instanceId, token, label, clientToken, explicitMobileEnv: explicitMobile };
}

// server/whatsapp/instanceStore.ts
var CACHE_TTL_MS = 3e4;
var cachedDefault = null;
var cachedDefaultAt = 0;
function sb() {
  return createSupabaseAdminClient();
}
function mapRow(r) {
  return {
    id: r.id,
    slug: r.slug,
    label: r.label,
    provider: r.provider,
    instance_type: r.instance_type,
    zapi_instance_id: r.zapi_instance_id,
    zapi_token: r.zapi_token,
    zapi_client_token: r.zapi_client_token,
    meta_phone_number_id: r.meta_phone_number_id,
    meta_access_token: r.meta_access_token,
    meta_api_version: r.meta_api_version,
    official_ddi: r.official_ddi || "55",
    official_phone: r.official_phone || "",
    is_default: !!r.is_default,
    enabled: r.enabled !== false,
    last_checked_at: r.last_checked_at,
    last_connected: r.last_connected,
    last_connected_phone: r.last_connected_phone,
    phone_matches_official: r.phone_matches_official,
    last_error: r.last_error,
    last_heartbeat_at: r.last_heartbeat_at,
    last_qr_base64: r.last_qr_base64,
    last_connected_at: r.last_connected_at,
    last_status_raw: r.last_status_raw,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}
function invalidateDefaultCache() {
  cachedDefault = null;
  cachedDefaultAt = 0;
}
async function getDefaultWhatsappInstance(force = false) {
  if (!force && cachedDefault && Date.now() - cachedDefaultAt < CACHE_TTL_MS) return cachedDefault;
  const client = sb();
  if (!client) return envFallbackInstance();
  const { data } = await client.from("whatsapp_instances").select("*").eq("is_default", true).eq("enabled", true).maybeSingle();
  if (data) {
    cachedDefault = mapRow(data);
    cachedDefaultAt = Date.now();
    return cachedDefault;
  }
  const { data: first } = await client.from("whatsapp_instances").select("*").eq("enabled", true).order("created_at").limit(1).maybeSingle();
  if (first) {
    cachedDefault = mapRow(first);
    cachedDefaultAt = Date.now();
    return cachedDefault;
  }
  return envFallbackInstance();
}
function envFallbackInstance() {
  const envCreds = getZapiMobileEnvCreds();
  if (!envCreds) return null;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const phone = (process.env.ZAPI_OFFICIAL_PHONE || OFFICIAL_BOT_PHONE_LOCAL).replace(/\D/g, "").replace(/^55/, "");
  const type = getZapiEnvInstanceType();
  return {
    id: "env-fallback",
    slug: "central",
    label: envCreds.label,
    provider: "zapi",
    instance_type: type,
    zapi_instance_id: envCreds.instanceId,
    zapi_token: envCreds.token,
    zapi_client_token: envCreds.clientToken || null,
    meta_phone_number_id: null,
    meta_access_token: null,
    meta_api_version: null,
    official_ddi: "55",
    official_phone: phone,
    is_default: true,
    enabled: true,
    last_checked_at: null,
    last_connected: null,
    last_connected_phone: null,
    phone_matches_official: null,
    last_error: null,
    last_heartbeat_at: null,
    last_qr_base64: null,
    last_connected_at: null,
    last_status_raw: null,
    created_at: now,
    updated_at: now
  };
}
async function saveConnectionHealth(id, health) {
  const client = sb();
  if (!client || id === "env-fallback") return;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await client.from("whatsapp_instances").update({
    last_checked_at: now,
    last_heartbeat_at: now,
    last_connected: health.connected,
    last_connected_phone: health.connectedPhone,
    phone_matches_official: health.phoneMatchesOfficial,
    last_error: health.error,
    last_status_raw: health.statusRaw ?? null,
    last_qr_base64: health.qrBase64 ?? null,
    last_connected_at: health.connected ? now : void 0,
    updated_at: now
  }).eq("id", id);
  invalidateDefaultCache();
}
function instanceConfigured(row) {
  if (!row || !row.enabled) return false;
  if (row.provider === "zapi") return !!(row.zapi_instance_id && row.zapi_token);
  if (row.provider === "meta") return !!(row.meta_phone_number_id && row.meta_access_token);
  if (row.provider === "mock") return true;
  return false;
}

// server/whatsapp/types.ts
function fullOfficialPhone(row) {
  const ddi = String(row.official_ddi || "55").replace(/\D/g, "");
  const local = String(row.official_phone || "").replace(/\D/g, "");
  return local.startsWith(ddi) ? local : `${ddi}${local}`;
}
function expectedOfficialPhone(row) {
  return fullOfficialPhone(row);
}

// server/whatsapp/providers/meta.ts
var MetaWhatsappProvider = class {
  providerId = "meta";
  instance;
  constructor(instance) {
    this.instance = instance;
  }
  notReady() {
    return new Error("Provider Meta ainda n\xE3o implementado para envios \u2014 configure Z-API ou aguarde migra\xE7\xE3o.");
  }
  async getStatus() {
    const version = this.instance.meta_api_version || "v21.0";
    const phoneId = this.instance.meta_phone_number_id;
    const token = this.instance.meta_access_token;
    if (!phoneId || !token) return { connected: false, error: "Meta n\xE3o configurado" };
    try {
      const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await r.json();
      return { connected: r.ok, error: r.ok ? void 0 : data?.error?.message, raw: data };
    } catch (e) {
      return { connected: false, error: e?.message };
    }
  }
  async getConnectedPhone() {
    return expectedOfficialPhone(this.instance);
  }
  async testConnection() {
    const expected = expectedOfficialPhone(this.instance);
    const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
    const status = await this.getStatus();
    const ok = status.connected === true;
    const message = ok ? "Meta Cloud API respondeu." : status.error || "Meta indispon\xEDvel";
    await saveConnectionHealth(this.instance.id, {
      connected: ok,
      connectedPhone: ok ? expected : null,
      phoneMatchesOfficial: ok,
      error: ok ? null : message,
      statusRaw: status.raw
    });
    return {
      ok,
      instanceId: this.instance.id,
      slug: this.instance.slug,
      provider: "meta",
      apiReachable: ok,
      connected: ok,
      connectedPhone: ok ? expected : null,
      expectedPhone: expected,
      phoneMatchesOfficial: ok,
      message,
      status,
      checkedAt
    };
  }
  async sendText(_params) {
    throw this.notReady();
  }
  async sendImage(_params) {
    throw this.notReady();
  }
  async bootstrapConnection() {
    return { phase: "unsupported", message: "Conex\xE3o Meta via painel Meta Business \u2014 provider de envio em desenvolvimento." };
  }
};

// server/whatsapp/providers/mock.ts
var MockWhatsappProvider = class {
  providerId = "mock";
  instance;
  constructor(instance) {
    this.instance = instance;
  }
  async getStatus() {
    return { connected: true, raw: { mock: true } };
  }
  async getConnectedPhone() {
    return expectedOfficialPhone(this.instance);
  }
  async testConnection() {
    const expected = expectedOfficialPhone(this.instance);
    const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
    await saveConnectionHealth(this.instance.id, {
      connected: true,
      connectedPhone: expected,
      phoneMatchesOfficial: true,
      error: null,
      statusRaw: { mock: true }
    });
    return {
      ok: true,
      instanceId: this.instance.id,
      slug: this.instance.slug,
      provider: "mock",
      apiReachable: true,
      connected: true,
      connectedPhone: expected,
      expectedPhone: expected,
      phoneMatchesOfficial: true,
      message: "Mock \u2014 sempre conectado.",
      checkedAt
    };
  }
  async sendText(params) {
    console.log(`[WhatsApp Mock] sendText \u2192 ${params.phone}: ${params.message.slice(0, 80)}\u2026`);
    return { ok: true, httpStatus: 200, data: { mock: true, id: `mock-${Date.now()}` } };
  }
  async sendImage(params) {
    console.log(`[WhatsApp Mock] sendImage \u2192 ${params.phone}`);
    return { ok: true, httpStatus: 200, data: { mock: true } };
  }
  async bootstrapConnection() {
    return { phase: "connected", message: "Mock conectado." };
  }
};

// server/zapiThrottle.ts
var DEFAULT_MIN_INTERVAL_MS = 2e4;
function minIntervalMs() {
  const raw = Number(process.env.ZAPI_SEND_MIN_INTERVAL_MS || "");
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_MIN_INTERVAL_MS;
}
var MAX_HOLD_MS = 45e3;
var lastSendAt = 0;
var chain = Promise.resolve();
var chainPending = 0;
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function throttleZapiSend(label, fn, meta) {
  const depthAtEntry = chainPending;
  chainPending += 1;
  if (meta) meta.queueDepth = depthAtEntry;
  const prev = chain;
  let release;
  chain = new Promise((r) => release = r);
  return (async () => {
    try {
      await prev;
      const wait = lastSendAt + minIntervalMs() - Date.now();
      const queueWaitMs = wait > 0 ? wait : 0;
      if (meta) meta.queueWaitMs = queueWaitMs;
      if (wait > 0) {
        console.log(`[Z-API Fila] Aguardando ${(wait / 1e3).toFixed(1)}s (fila=${depthAtEntry}) antes de enviar (${label}).`);
        await sleep(wait);
      }
      const p = fn();
      void Promise.race([p.then(() => void 0, () => void 0), sleep(MAX_HOLD_MS)]).then(() => {
        lastSendAt = Date.now();
        chainPending = Math.max(0, chainPending - 1);
        release();
      });
      return p;
    } catch (e) {
      chainPending = Math.max(0, chainPending - 1);
      release();
      throw e;
    }
  })();
}

// server/whatsapp/zapiHttp.ts
function zapiBasePathFor(creds) {
  return `https://api.z-api.io/instances/${creds.instance}/token/${creds.token}`;
}
function zapiHeadersFor(creds, json = false) {
  const headers = {};
  if (creds.clientToken) headers["Client-Token"] = creds.clientToken;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}
async function zapiFetchWith(creds, path, init = {}) {
  const url = `${zapiBasePathFor(creds)}/${path.replace(/^\//, "")}`;
  const headers = { ...zapiHeadersFor(creds, !!init.body), ...init.headers || {} };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25e3);
  try {
    const r = await fetch(url, { ...init, headers, signal: ac.signal });
    const text = await r.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { ok: r.ok, status: r.status, data, text };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e?.message || "network" }, text: e?.message || "" };
  } finally {
    clearTimeout(timer);
  }
}
function credsFromInstance(row) {
  const envCreds = getZapiMobileEnvCreds();
  const explicitEnv = hasExplicitZapiMobileEnv() || hasExplicitZapiWebEnv();
  const dbClient = String(row.zapi_client_token || "").trim();
  if (explicitEnv && envCreds) {
    return {
      instance: envCreds.instanceId,
      token: envCreds.token,
      clientToken: envCreds.clientToken || dbClient,
      type: getZapiEnvInstanceType()
    };
  }
  if (!row.zapi_instance_id || !row.zapi_token) {
    if (!envCreds) return null;
    return {
      instance: envCreds.instanceId,
      token: envCreds.token,
      clientToken: envCreds.clientToken || dbClient,
      type: getZapiEnvInstanceType()
    };
  }
  return {
    instance: row.zapi_instance_id,
    token: row.zapi_token,
    clientToken: envCreds?.clientToken || dbClient,
    type: row.instance_type === "mobile" ? "mobile" : "web"
  };
}
function officialPhoneParts(row) {
  let ddi = String(row.official_ddi || "55").replace(/\D/g, "") || "55";
  if (ddi === "055") ddi = "55";
  let digits = String(row.official_phone || "").replace(/\D/g, "");
  while (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith(ddi) && digits.length > 11) {
    digits = digits.slice(ddi.length);
  }
  const phone = digits;
  const full = phone.startsWith(ddi) ? phone : `${ddi}${phone}`;
  return { ddi, phone, full };
}

// server/whatsapp/zapiExtensionToken.ts
async function fetchZapiExtensionToken(creds) {
  const { ok, data, text } = await zapiFetchWith(creds, "extension-token", { method: "GET" });
  if (!ok) {
    return { token: null, expiresAt: null, error: data?.error || text || "Falha ao gerar token de extens\xE3o" };
  }
  const token = String(data?.token || "").trim() || null;
  const expiresAt = data?.expiresAt != null ? Number(data.expiresAt) : null;
  if (!token) {
    return { token: null, expiresAt: null, error: "Z-API n\xE3o retornou c\xF3digo de extens\xE3o" };
  }
  return { token, expiresAt };
}

// server/zapiGuard.ts
var OFFICIAL_BOT_PHONE = "5511926839456";
var OFFICIAL_BOT_PHONE_DISPLAY = "(11) 92683-9456";
var CACHE_TTL_MS2 = 5 * 60 * 1e3;
var cachedPhone = null;
var cachedAt = 0;
var onlyDigits = (v) => String(v ?? "").replace(/\D/g, "");
async function getExpectedOfficialPhone() {
  const row = await getDefaultWhatsappInstance();
  return row ? expectedOfficialPhone(row) : OFFICIAL_BOT_PHONE;
}
async function getConnectedBotPhone(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedPhone !== null && now - cachedAt < CACHE_TTL_MS2) return cachedPhone;
  const provider = await getDefaultWhatsappProvider(true);
  if (provider) {
    const phone2 = await provider.getConnectedPhone();
    if (phone2) {
      cachedPhone = phone2;
      cachedAt = now;
      return phone2;
    }
  }
  const row = await getDefaultWhatsappInstance(true);
  const creds = row ? credsFromInstance(row) : null;
  if (!creds) return null;
  const { ok, data } = await zapiFetchWith(creds, "device", { method: "GET" });
  if (!ok || !data) return null;
  const phone = onlyDigits(data.phone || data?.device?.phone || data?.wid || "");
  if (!phone) return null;
  cachedPhone = phone;
  cachedAt = now;
  return phone;
}
async function assertOfficialBotNumber() {
  const expected = await getExpectedOfficialPhone();
  let phone = await getConnectedBotPhone();
  if (!phone) phone = await getConnectedBotPhone(true);
  if (!phone) {
    console.warn(`[Z-API Guarda] BLOQUEADO: n\xE3o foi poss\xEDvel confirmar o n\xFAmero conectado.`);
    return {
      ok: false,
      phone: null,
      error: `N\xE3o foi poss\xEDvel confirmar que o bot est\xE1 no n\xFAmero oficial ${OFFICIAL_BOT_PHONE_DISPLAY} (WhatsApp desconectado ou indispon\xEDvel). Envio bloqueado por seguran\xE7a.`
    };
  }
  if (phone !== expected && phone !== OFFICIAL_BOT_PHONE) {
    console.error(`[Z-API Guarda] BLOQUEADO: conectado em ${phone}, oficial ${expected}.`);
    return {
      ok: false,
      phone,
      error: `Bot conectado em um n\xFAmero N\xC3O autorizado (${phone}). O bot s\xF3 pode operar no n\xFAmero oficial ${OFFICIAL_BOT_PHONE_DISPLAY}.`
    };
  }
  return { ok: true, phone };
}
function invalidateBotPhoneCache() {
  cachedPhone = null;
  cachedAt = 0;
}

// lib/whatsappMobileDiagnosis.ts
function isZapiSessionConnected(data, instanceType) {
  if (data?.connected !== true) return false;
  if (instanceType === "mobile") return true;
  return data.smartphoneConnected !== false;
}

// server/whatsapp/providers/zapi.ts
var ZapiWhatsappProvider = class {
  providerId = "zapi";
  instance;
  constructor(instance) {
    this.instance = instance;
  }
  creds() {
    const c = credsFromInstance(this.instance);
    if (!c) throw new Error("Credenciais Z-API incompletas na inst\xE2ncia");
    return c;
  }
  async getStatus() {
    const { ok, data } = await zapiFetchWith(this.creds(), "status", { method: "GET" });
    if (!ok && !data) return { connected: false, error: "Falha ao consultar status" };
    return {
      connected: isZapiSessionConnected(data, this.creds().type),
      smartphoneConnected: data?.smartphoneConnected,
      session: data?.session,
      error: data?.error,
      raw: data
    };
  }
  async getConnectedPhone() {
    const { ok, data } = await zapiFetchWith(this.creds(), "device", { method: "GET" });
    if (!ok || !data) return null;
    return String(data.phone || data?.device?.phone || data?.wid || "").replace(/\D/g, "") || null;
  }
  async testConnection() {
    const expected = expectedOfficialPhone(this.instance);
    const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
    let apiReachable = false;
    let status = { connected: false };
    let connectedPhone = null;
    try {
      status = await this.getStatus();
      apiReachable = true;
      connectedPhone = status.connected ? await this.getConnectedPhone() : null;
    } catch (e) {
      status = { connected: false, error: e?.message || "Erro de rede" };
    }
    const phoneMatchesOfficial = connectedPhone === expected;
    const ok = apiReachable && status.connected === true && phoneMatchesOfficial;
    let message = "";
    if (!apiReachable) message = "Z-API n\xE3o respondeu.";
    else if (!status.connected) message = `Desconectado${status.error ? `: ${status.error}` : ""}.`;
    else if (!phoneMatchesOfficial) {
      message = `Conectado em ${connectedPhone}, esperado ${expected}.`;
    } else {
      message = `Conectado no n\xFAmero oficial (${expected}).`;
    }
    await saveConnectionHealth(this.instance.id, {
      connected: !!status.connected,
      connectedPhone,
      phoneMatchesOfficial,
      error: ok ? null : message,
      statusRaw: status.raw
    });
    return {
      ok,
      instanceId: this.instance.id,
      slug: this.instance.slug,
      provider: "zapi",
      apiReachable,
      connected: !!status.connected,
      connectedPhone,
      expectedPhone: expected,
      phoneMatchesOfficial,
      message,
      status,
      checkedAt
    };
  }
  async sendText(params) {
    const creds = this.creds();
    const queueMeta = { queueWaitMs: 0, queueDepth: 0 };
    const label = params.queueLabel || "send-text";
    const r = await throttleZapiSend(label, () => fetch(`${zapiBasePathFor(creds)}/send-text`, {
      method: "POST",
      headers: { ...zapiHeadersFor(creds, true) },
      body: JSON.stringify({ phone: params.phone, message: params.message })
    }), queueMeta);
    const text = await r.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return {
      ok: r.ok,
      httpStatus: r.status,
      data,
      error: r.ok ? void 0 : String(data?.error || text),
      queueWaitMs: queueMeta.queueWaitMs,
      queueDepth: queueMeta.queueDepth
    };
  }
  async sendImage(params) {
    const creds = this.creds();
    const queueMeta = { queueWaitMs: 0, queueDepth: 0 };
    const label = params.queueLabel || "send-image";
    const r = await throttleZapiSend(label, () => fetch(`${zapiBasePathFor(creds)}/send-image`, {
      method: "POST",
      headers: { ...zapiHeadersFor(creds, true) },
      body: JSON.stringify({
        phone: params.phone,
        image: params.imageBase64.trim(),
        caption: params.caption,
        viewOnce: false
      })
    }), queueMeta);
    const text = await r.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return {
      ok: r.ok,
      httpStatus: r.status,
      data,
      error: r.ok ? void 0 : String(data?.error || text),
      queueWaitMs: queueMeta.queueWaitMs,
      queueDepth: queueMeta.queueDepth
    };
  }
  async getQrCode() {
    const { ok, data, text } = await zapiFetchWith(this.creds(), "qr-code/image", { method: "GET" });
    if (!ok) return { qrBase64: null, error: data?.error || text };
    const value = data?.value || data?.qrcode;
    if (typeof value === "string" && value.length > 20) {
      return { qrBase64: value.startsWith("data:") ? value : `data:image/png;base64,${value}` };
    }
    return { qrBase64: null, error: "QR indispon\xEDvel" };
  }
  async getPhoneLinkCode() {
    const { full } = officialPhoneParts(this.instance);
    const { ok, data, text } = await zapiFetchWith(this.creds(), `phone-code/${full}`, { method: "GET" });
    if (!ok) return { code: null, error: data?.error || text };
    return { code: String(data?.value || "").trim() || null };
  }
  async getExtensionToken() {
    return fetchZapiExtensionToken(this.creds());
  }
  async mobileRegistrationAvailable() {
    const { ddi, phone } = officialPhoneParts(this.instance);
    const { ok, data, text } = await zapiFetchWith(this.creds(), "mobile/registration-available", {
      method: "POST",
      body: JSON.stringify({ ddi, phone })
    });
    return { ok, data, error: ok ? void 0 : data?.error || text };
  }
  async mobileRequestCode(method = "wa_old") {
    const { ddi, phone } = officialPhoneParts(this.instance);
    const { ok, data, text } = await zapiFetchWith(this.creds(), "mobile/request-registration-code", {
      method: "POST",
      body: JSON.stringify({ ddi, phone, method })
    });
    return { ok, data, error: ok ? void 0 : data?.error || text, method };
  }
  async mobileConfirmCode(code) {
    const { ok, data, text } = await zapiFetchWith(this.creds(), "mobile/confirm-registration-code", {
      method: "POST",
      body: JSON.stringify({ code: String(code).trim() })
    });
    if (ok && data?.success) invalidateBotPhoneCache();
    return { ok, data, error: ok ? void 0 : data?.error || text };
  }
  async mobileConfirmSecurityCode(pin) {
    const { ok, data, text } = await zapiFetchWith(this.creds(), "mobile/confirm-pin-code", {
      method: "POST",
      body: JSON.stringify({ code: String(pin).trim() })
    });
    if (ok && data?.success) invalidateBotPhoneCache();
    return { ok, data, error: ok ? void 0 : data?.error || text };
  }
  async bootstrapConnection(force = false) {
    const type = this.creds().type;
    const status = await this.getStatus();
    if (status.connected) {
      const phone = await this.getConnectedPhone();
      invalidateBotPhoneCache();
      const expected = fullOfficialPhone(this.instance);
      return {
        phase: "connected",
        message: phone === expected ? `Conectado no n\xFAmero oficial.` : `Conectado em ${phone} (esperado ${expected}).`,
        status,
        phone,
        instanceType: type
      };
    }
    if (!force) {
      return {
        phase: type === "mobile" ? "needs_code" : "needs_qr",
        message: type === "mobile" ? "Desconectado \u2014 use Iniciar conex\xE3o no painel." : "Desconectado \u2014 escaneie o QR Code.",
        status,
        instanceType: type
      };
    }
    if (type === "mobile") {
      const reg = await this.mobileRegistrationAvailable();
      if (!reg.ok || reg.data?.available === false) {
        return { phase: "error", message: reg.data?.blocked ? "N\xFAmero bloqueado." : reg.error || "Indispon\xEDvel", status, registration: reg.data, instanceType: type };
      }
      const preferWaOld = reg.data?.waOldEligible === true;
      const req = await this.mobileRequestCode(preferWaOld ? "wa_old" : "sms");
      if (!req.ok || req.data?.success === false) {
        return { phase: "error", message: req.error || "Falha ao solicitar c\xF3digo.", status, requestCode: req.data, instanceType: type };
      }
      return {
        phase: "needs_code",
        message: preferWaOld ? "Confirme o pop-up no WhatsApp e informe o c\xF3digo se pedido." : "C\xF3digo SMS enviado \u2014 informe abaixo.",
        status,
        registration: reg.data,
        requestCode: req.data,
        instanceType: type
      };
    }
    const [qr, link] = await Promise.all([this.getQrCode(), this.getPhoneLinkCode()]);
    if (qr.qrBase64) {
      await saveConnectionHealth(this.instance.id, {
        connected: false,
        connectedPhone: null,
        phoneMatchesOfficial: false,
        error: null,
        qrBase64: qr.qrBase64
      });
    }
    return {
      phase: qr.qrBase64 ? "needs_qr" : "needs_code",
      message: qr.qrBase64 ? "Escaneie o QR Code." : qr.error || "QR indispon\xEDvel",
      status,
      qrBase64: qr.qrBase64,
      phoneLinkCode: link.code,
      instanceType: type
    };
  }
};

// server/whatsapp/providerRegistry.ts
function createWhatsappProvider(instance) {
  switch (instance.provider) {
    case "meta":
      return new MetaWhatsappProvider(instance);
    case "mock":
      return new MockWhatsappProvider(instance);
    case "zapi":
    default:
      return new ZapiWhatsappProvider(instance);
  }
}
async function getDefaultWhatsappProvider(force = false) {
  const row = await getDefaultWhatsappInstance(force);
  if (!row || !instanceConfigured(row)) return null;
  return createWhatsappProvider(row);
}
async function whatsappProviderSendText(phone, message, queueLabel) {
  const provider = await getDefaultWhatsappProvider(true);
  if (!provider) throw new Error("Nenhuma inst\xE2ncia WhatsApp configurada no banco.");
  return provider.sendText({ phone, message, queueLabel });
}

// server/zapiClient.ts
async function resolveCreds() {
  const row = await getDefaultWhatsappInstance();
  if (row) {
    const c = credsFromInstance(row);
    if (c) return c;
  }
  const envCreds = getZapiMobileEnvCreds();
  if (!envCreds) return null;
  return {
    instance: envCreds.instanceId,
    token: envCreds.token,
    clientToken: envCreds.clientToken,
    type: getZapiEnvInstanceType()
  };
}
async function isZapiConfigured() {
  return !!await resolveCreds();
}

// server/zapiConnectionState.ts
var state = {
  generation: 1,
  lastReconnectedAt: null,
  lastDisconnectedAt: null
};
function getConnectionGeneration() {
  return state.generation;
}
function getMsSinceReconnect() {
  if (!state.lastReconnectedAt) return null;
  const t = new Date(state.lastReconnectedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Date.now() - t);
}

// server/whatsappTelemetry.ts
function getSb() {
  return createSupabaseAdminClient();
}
function truncateJson(value, maxLen = 4e3) {
  if (value == null) return null;
  try {
    const s = JSON.stringify(value);
    if (s.length <= maxLen) return value;
    return { _truncated: true, preview: s.slice(0, maxLen) };
  } catch {
    return { _raw: String(value).slice(0, maxLen) };
  }
}
function logWhatsappOutbound(input) {
  const sb2 = getSb();
  if (!sb2) return;
  const generation = input.connectionGeneration ?? getConnectionGeneration();
  const msSince = input.msSinceReconnect !== void 0 ? input.msSinceReconnect : getMsSinceReconnect();
  void (async () => {
    try {
      await sb2.from("whatsapp_outbound_log").insert([{
        queue_label: input.queueLabel,
        endpoint: input.endpoint,
        destination_type: input.destinationType,
        client_name: input.clientName || null,
        group_id: input.groupId || null,
        mission_id: input.missionId || null,
        queue_wait_ms: Math.max(0, Math.round(input.queueWaitMs || 0)),
        queue_depth: Math.max(0, Math.round(input.queueDepth || 0)),
        connection_generation: generation,
        ms_since_reconnect: msSince != null ? Math.round(msSince) : null,
        retry_count: Math.max(0, Math.round(input.retryCount || 0)),
        http_status: input.httpStatus ?? null,
        success: input.success,
        skipped: input.skipped ?? false,
        skip_reason: input.skipReason || null,
        zapi_response: truncateJson(input.zapiResponse),
        error_message: input.errorMessage || null,
        triggered_by_user_id: input.triggeredByUserId || null
      }]);
    } catch (e) {
      console.warn("[WhatsApp Telemetria] Falha ao gravar outbound:", e?.message || e);
    }
  })();
}

// lib/passwordReset.ts
function urlDoSistema() {
  const base = process.env.SYSTEM_URL || `https://${process.env.REPLIT_DOMAINS?.split(",")[0] || "sistema.grupotmseg.com.br"}`;
  return base.replace(/\/$/, "");
}
function clienteAdmin() {
  return createSupabaseAdminClient();
}
async function portalDoCliente(sb2, clientId) {
  let consulta = await sb2.from("clients").select("id, name, trading_name, portal_ativo, portal_slug").eq("id", clientId).maybeSingle();
  if (consulta.error && /portal_/i.test(String(consulta.error.message || ""))) {
    consulta = await sb2.from("clients").select("id, name, trading_name").eq("id", clientId).maybeSingle();
  }
  if (consulta.error || !consulta.data) return null;
  return portalDaFicha(consulta.data);
}
async function exigirTrocaNoProximoAcesso(sb2, userId) {
  const { error } = await sb2.from("system_users").update({ force_password_change: true }).eq("id", userId);
  if (error) throw new Error(error.message || "N\xE3o foi poss\xEDvel exigir a troca de senha.");
}
async function handlePasswordResetRequest(body) {
  const dados = body || {};
  const userId = String(dados.userId || "").trim();
  const senderName = typeof dados.senderName === "string" ? dados.senderName : void 0;
  const canal = dados.canal === "whatsapp" ? "whatsapp" : dados.canal === "texto" ? "texto" : "email";
  if (!userId) return { status: 400, body: { error: "userId obrigat\xF3rio" } };
  if (canal === "texto") {
    const sb2 = clienteAdmin();
    if (!sb2) return { status: 503, body: { error: "Servidor de usu\xE1rios indispon\xEDvel." } };
    return redefinirComTextoDeCriacao(sb2, userId);
  }
  if (canal === "whatsapp") {
    const telefone = normalizarTelefoneWhatsapp(dados.telefone);
    if (!telefone) {
      return { status: 400, body: { error: "Informe o WhatsApp com DDD para enviar a nova senha." } };
    }
    return redefinirPorWhatsapp(userId, telefone);
  }
  return redefinirPorEmail(userId, senderName);
}
async function redefinirComTextoDeCriacao(sb2, userId) {
  const { data: userData, error: userErr } = await sb2.from("system_users").select("id, name, email, user_type, client_id, permissions").eq("id", userId).single();
  if (userErr || !userData?.email) return { status: 404, body: { error: "Usu\xE1rio n\xE3o encontrado" } };
  const portal = userData.user_type === "client" && userData.client_id ? await portalDoCliente(sb2, userData.client_id) : null;
  const soPortal = usuarioSoPortal(userData.permissions);
  let acessoId = null;
  if (portal) {
    const acesso = await lerAcessoPortal(sb2, {
      tabela: portal.tabelas.usuarios,
      email: String(userData.email),
      clientId: userData.client_id
    });
    if (!acesso.ok) return { status: 500, body: { error: acesso.error } };
    acessoId = acesso.id;
    if (soPortal && acessoId == null) {
      return {
        status: 409,
        body: { error: "O acesso ao portal deste e-mail n\xE3o foi encontrado. Salve o usu\xE1rio com Acesso ao portal e tente de novo." }
      };
    }
  }
  const senha = gerarSenhaTemporaria();
  if (portal && acessoId != null) {
    const aplicado = await aplicarSenhaNoPortal(sb2, {
      tabela: portal.tabelas.usuarios,
      email: String(userData.email),
      clientId: userData.client_id,
      senha,
      trocarSenha: true
    });
    if (!aplicado.ok || !aplicado.atualizado) {
      return {
        status: 500,
        body: {
          error: aplicado.ok ? "O acesso do portal n\xE3o foi encontrado para gravar a senha. A senha atual foi mantida." : `A senha do portal n\xE3o foi gravada. ${aplicado.error}`
        }
      };
    }
  }
  try {
    await gravarSenhaNoServidor(sb2, String(userData.id), senha, { force_password_change: true });
    await exigirTrocaNoProximoAcesso(sb2, String(userData.id));
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message : "Falha ao gravar a senha";
    console.error("[PasswordReset] texto de cria\xE7\xE3o", texto);
    return {
      status: 500,
      body: {
        error: portal && acessoId != null ? "A senha do portal foi gravada, mas o cadastro do sistema n\xE3o. Clique de novo em Redefinir senha." : "A senha n\xE3o foi gravada. Tente de novo."
      }
    };
  }
  return {
    status: 200,
    body: {
      success: true,
      senha,
      message: "Senha nova gerada. Copie a mensagem e envie ao usu\xE1rio.",
      ...portal && acessoId != null ? { portal: true, rotulo: portal.rotulo, caminho: portal.caminho } : { portal: false }
    }
  };
}
async function redefinirPorEmail(userId, senderName) {
  const sb2 = clienteAdmin();
  if (!sb2) return { status: 503, body: { error: "Servidor de usu\xE1rios indispon\xEDvel." } };
  const { data: userData, error: userErr } = await sb2.from("system_users").select("id, name, email, user_type, client_id").eq("id", userId).single();
  if (userErr || !userData?.email) return { status: 404, body: { error: "Usu\xE1rio n\xE3o encontrado" } };
  const token = import_crypto2.default.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
  const { error: updateErr } = await sb2.from("system_users").update({
    password_reset_token: token,
    password_reset_expires: expiresAt,
    force_password_change: true
  }).eq("id", userId);
  if (updateErr) throw new Error(updateErr.message || "N\xE3o foi poss\xEDvel gravar o link de redefini\xE7\xE3o.");
  let portalLink;
  if (userData.user_type === "client" && userData.client_id) {
    const portal = await portalDoCliente(sb2, userData.client_id);
    if (portal) portalLink = `${urlDoSistema()}${portal.caminho}`;
  }
  const resetLink = `${urlDoSistema()}/reset-password?token=${token}`;
  const envio = await sendPasswordResetEmail(userData.email, userData.name, resetLink, senderName, portalLink);
  if (!envio.ok) {
    return { status: 502, body: { error: envio.erro || "Falha ao enviar e-mail" } };
  }
  return { status: 200, body: { success: true, message: "E-mail de redefini\xE7\xE3o enviado!" } };
}
async function redefinirPorWhatsapp(userId, telefone) {
  const sb2 = clienteAdmin();
  if (!sb2) return { status: 503, body: { error: "Servidor de usu\xE1rios indispon\xEDvel." } };
  const { data: userData, error: userErr } = await sb2.from("system_users").select("id, name, email, user_type, client_id, permissions").eq("id", userId).single();
  if (userErr || !userData?.email) return { status: 404, body: { error: "Usu\xE1rio n\xE3o encontrado" } };
  if (userData.user_type !== "client") {
    return { status: 400, body: { error: "A redefini\xE7\xE3o por WhatsApp vale para usu\xE1rio de cliente." } };
  }
  const portal = userData.client_id ? await portalDoCliente(sb2, userData.client_id) : null;
  const soPortal = usuarioSoPortal(userData.permissions);
  let acessoId = null;
  if (portal) {
    const acesso = await lerAcessoPortal(sb2, {
      tabela: portal.tabelas.usuarios,
      email: String(userData.email),
      clientId: userData.client_id
    });
    if (!acesso.ok) return { status: 500, body: { error: acesso.error } };
    acessoId = acesso.id;
    if (soPortal && acessoId == null) {
      return {
        status: 409,
        body: { error: "O acesso ao portal deste e-mail n\xE3o foi encontrado. Salve o usu\xE1rio com Acesso ao portal e tente de novo." }
      };
    }
  }
  if (!await isZapiConfigured()) {
    return { status: 503, body: { error: "WhatsApp n\xE3o configurado. A senha atual foi mantida." } };
  }
  const guarda = await assertOfficialBotNumber();
  if (!guarda.ok) {
    logWhatsappOutbound({
      queueLabel: "senha-cliente",
      endpoint: "send-text",
      destinationType: "individual",
      groupId: telefone,
      success: false,
      skipped: true,
      skipReason: "n\xFAmero n\xE3o oficial",
      errorMessage: guarda.error || "WhatsApp indispon\xEDvel"
    });
    return {
      status: 503,
      body: { error: guarda.error || "WhatsApp desconectado. A senha atual foi mantida. Reconecte o bot e tente de novo." }
    };
  }
  const senha = gerarSenhaTemporaria();
  const link = portal ? `${urlDoSistema()}${portal.caminho}` : urlDoSistema();
  const mensagem = mensagemNovaSenhaWhatsapp({
    nome: String(userData.name || "usu\xE1rio"),
    email: String(userData.email),
    senha,
    link
  });
  let envio;
  try {
    envio = await whatsappProviderSendText(telefone, mensagem, "senha-cliente");
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message : "Falha ao enviar WhatsApp";
    console.error("[PasswordReset] WhatsApp", texto);
    return { status: 502, body: { error: "O WhatsApp n\xE3o enviou a mensagem. A senha atual foi mantida." } };
  }
  logWhatsappOutbound({
    queueLabel: "senha-cliente",
    endpoint: "send-text",
    destinationType: "individual",
    groupId: telefone,
    queueWaitMs: envio.queueWaitMs,
    queueDepth: envio.queueDepth,
    httpStatus: envio.httpStatus,
    success: envio.ok,
    errorMessage: envio.ok ? null : envio.error || "Falha no envio"
  });
  if (!envio.ok) {
    return { status: 502, body: { error: "O WhatsApp n\xE3o enviou a mensagem. A senha atual foi mantida. Reconecte o bot e tente de novo." } };
  }
  if (portal && acessoId != null) {
    const aplicado = await aplicarSenhaNoPortal(sb2, {
      tabela: portal.tabelas.usuarios,
      email: String(userData.email),
      clientId: userData.client_id,
      senha,
      trocarSenha: true
    });
    if (!aplicado.ok || !aplicado.atualizado) {
      return {
        status: 500,
        body: { error: aplicado.ok ? "A mensagem foi enviada, mas o acesso do portal n\xE3o foi encontrado para gravar a senha." : `A mensagem foi enviada, mas a senha do portal n\xE3o foi gravada. ${aplicado.error}` }
      };
    }
  }
  try {
    await gravarSenhaNoServidor(sb2, String(userData.id), senha, { force_password_change: true });
    await exigirTrocaNoProximoAcesso(sb2, String(userData.id));
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message : "Falha ao gravar a senha";
    console.error("[PasswordReset] grava\xE7\xE3o depois do WhatsApp", texto);
    return { status: 500, body: { error: "A mensagem foi enviada, mas a senha n\xE3o ficou gravada no cadastro. Envie de novo." } };
  }
  return {
    status: 200,
    body: {
      success: true,
      message: portal && acessoId != null ? "Nova senha enviada no WhatsApp. No pr\xF3ximo acesso ao portal a troca \xE9 obrigat\xF3ria." : "Nova senha enviada no WhatsApp. No pr\xF3ximo acesso a troca \xE9 obrigat\xF3ria."
    }
  };
}
async function handlePasswordResetValidate(body) {
  const token = String(body?.token || "");
  if (!token) return { status: 400, body: { error: "Token obrigat\xF3rio" } };
  const sb2 = clienteAdmin();
  if (!sb2) return { status: 503, body: { error: "Servidor de usu\xE1rios indispon\xEDvel." } };
  const { data, error } = await sb2.from("system_users").select("id, name, email, password_reset_expires").eq("password_reset_token", token).single();
  if (error || !data) return { status: 404, body: { error: "Token inv\xE1lido ou expirado" } };
  if (new Date(data.password_reset_expires) < /* @__PURE__ */ new Date()) {
    return { status: 410, body: { error: "Token expirado" } };
  }
  return { status: 200, body: { valid: true, userName: data.name, userEmail: data.email } };
}
async function handlePasswordResetConfirm(body) {
  const token = String(body?.token || "");
  const newPassword = String(body?.newPassword || "");
  if (!token || !newPassword) {
    return { status: 400, body: { error: "Token e nova senha s\xE3o obrigat\xF3rios" } };
  }
  if (newPassword.length < 8) {
    return { status: 400, body: { error: "A senha deve ter no m\xEDnimo 8 caracteres" } };
  }
  const sb2 = clienteAdmin();
  if (!sb2) return { status: 503, body: { error: "Servidor de usu\xE1rios indispon\xEDvel." } };
  const { data, error } = await sb2.from("system_users").select("id, name, email, user_type, client_id, permissions, password_reset_expires").eq("password_reset_token", token).single();
  if (error || !data) return { status: 404, body: { error: "Token inv\xE1lido ou expirado" } };
  if (new Date(data.password_reset_expires) < /* @__PURE__ */ new Date()) {
    return { status: 410, body: { error: "Token expirado" } };
  }
  if (data.user_type === "client" && data.client_id) {
    const portal = await portalDoCliente(sb2, data.client_id);
    if (portal) {
      const aplicado = await aplicarSenhaNoPortal(sb2, {
        tabela: portal.tabelas.usuarios,
        email: String(data.email || ""),
        clientId: data.client_id,
        senha: newPassword,
        trocarSenha: false
      });
      if (!aplicado.ok) return { status: 500, body: { error: aplicado.error } };
      if (usuarioSoPortal(data.permissions) && !aplicado.atualizado) {
        return {
          status: 409,
          body: { error: "O acesso ao portal deste e-mail n\xE3o foi encontrado. A senha n\xE3o foi alterada." }
        };
      }
    }
  }
  await gravarSenhaNoServidor(sb2, String(data.id), newPassword, {
    password_reset_token: null,
    password_reset_expires: null,
    force_password_change: false
  });
  return { status: 200, body: { success: true, message: "Senha alterada com sucesso!" } };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handlePasswordResetConfirm,
  handlePasswordResetRequest,
  handlePasswordResetValidate,
  redefinirComTextoDeCriacao
});
