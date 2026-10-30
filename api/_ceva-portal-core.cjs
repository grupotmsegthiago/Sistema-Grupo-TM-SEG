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

// lib/missionSnapshot.ts
function snapshotTabelaNaCriacao(input) {
  const snap = {
    origemTabela: ORIGEM_TABELA_CRIACAO,
    clientTableId: String(input.clientTableId)
  };
  const fornecedor = String(input.providerTableId || "").trim();
  if (fornecedor) snap.providerTableId = fornecedor;
  return snap;
}
function carimboRecalculoAutomatico(valor) {
  return String(valor ?? "").trim() === CARIMBO_RECALCULO_AUTOMATICO;
}
function carimboAprovacaoHumana(valor) {
  const texto5 = String(valor ?? "").trim();
  if (!texto5 || carimboRecalculoAutomatico(texto5)) return null;
  return texto5;
}
function textoMotivo(valor) {
  return String(valor ?? "").trim().toLowerCase();
}
function temMotivoRegistrado(texto5) {
  return FRASES_MOTIVO_REGISTRADO.some((frase) => texto5.includes(frase));
}
function classificarAlteracaoPosterior(opts) {
  const receita = textoMotivo(opts.motivoReceita);
  const custo = textoMotivo(opts.motivoCusto);
  if (temMotivoRegistrado(receita) || temMotivoRegistrado(custo)) return "com_motivo";
  const semTexto = !receita && !custo;
  const soRecalculoSistema = [receita, custo].every((texto5) => !texto5 || texto5.includes("recalculado pelo sistema"));
  if (semTexto || soRecalculoSistema) return "sem_motivo";
  return "indeterminada";
}
function textoAlteracaoPosterior(classe) {
  if (classe === "com_motivo") return DIVERGENCIA_ALTERACAO_COM_MOTIVO;
  if (classe === "indeterminada") return DIVERGENCIA_ALTERACAO_INDETERMINADA;
  return DIVERGENCIA_ALTERACAO_REAL;
}
function objetoSnapshot(snapshot) {
  if (snapshot == null) return null;
  if (typeof snapshot === "string") {
    const texto5 = snapshot.trim();
    if (!texto5 || texto5 === "null" || texto5 === "{}" || texto5 === '""') return null;
    try {
      return objetoSnapshot(JSON.parse(texto5));
    } catch {
      return null;
    }
  }
  if (typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  if (Object.keys(snapshot).length === 0) return null;
  return snapshot;
}
function approvedByDoSnapshot(snapshot) {
  return objetoSnapshot(snapshot)?.approved_by ?? null;
}
function origemSnapshotFinanceiro(carimbo, snapshot) {
  if (carimboAprovacaoHumana(carimbo)) return "humana";
  if (carimboRecalculoAutomatico(carimbo)) return "automatica";
  if (String(carimbo ?? "").trim()) return "indeterminada";
  const interno = approvedByDoSnapshot(snapshot);
  if (carimboAprovacaoHumana(interno)) return "humana";
  if (carimboRecalculoAutomatico(interno)) return "automatica";
  return "indeterminada";
}
function estadoDetalhamentoSnapshot(snapshot) {
  const obj = objetoSnapshot(snapshot);
  if (!obj) return "invalido";
  const presentes = CAMPOS_DETALHE_SNAPSHOT.filter((campo) => {
    const valor = obj[campo];
    if (valor == null || valor === "") return false;
    return Number.isFinite(Number(valor));
  });
  if (presentes.length === 0) return "incompleto";
  const algumInformado = presentes.some((campo) => Math.abs(Number(obj[campo])) > 0);
  return algumInformado ? "valido" : "zerado";
}
function devePreservarDetalhamentoRegistrado(opts) {
  const estado = estadoDetalhamentoSnapshot(opts.snapshot);
  if (estado === "invalido") return false;
  const origem = origemSnapshotFinanceiro(opts.carimbo, opts.snapshot);
  if (origem === "humana") return true;
  return opts.billingApproved === true && (origem === "automatica" || origem === "indeterminada");
}
var ORIGEM_TABELA_CRIACAO, CARIMBO_RECALCULO_AUTOMATICO, DIVERGENCIA_DETALHAMENTO_ZERADO, DIVERGENCIA_DETALHAMENTO_INCOMPLETO, DIVERGENCIA_SNAPSHOT_INVALIDO, DIVERGENCIA_ALTERACAO_REAL, DIVERGENCIA_ALTERACAO_COM_MOTIVO, DIVERGENCIA_ALTERACAO_INDETERMINADA, FRASES_MOTIVO_REGISTRADO, CAMPOS_DETALHE_SNAPSHOT;
var init_missionSnapshot = __esm({
  "lib/missionSnapshot.ts"() {
    "use strict";
    ORIGEM_TABELA_CRIACAO = "criacao";
    CARIMBO_RECALCULO_AUTOMATICO = "Sistema (Recalcular e Comparar)";
    DIVERGENCIA_DETALHAMENTO_ZERADO = "Snapshot sem franquia, hora e tarifa gravadas. A tabela atual n\xE3o preencheu esses campos.";
    DIVERGENCIA_DETALHAMENTO_INCOMPLETO = "Snapshot sem o detalhamento de franquia, hora e tarifa. A tabela atual n\xE3o o substituiu.";
    DIVERGENCIA_SNAPSHOT_INVALIDO = "Snapshot ausente ou inv\xE1lido. Franquia, hora e tarifa n\xE3o foram preenchidas pela tabela atual. O total oficial permanece.";
    DIVERGENCIA_ALTERACAO_REAL = "Diverg\xEAncia posterior sem motivo de edi\xE7\xE3o identificado. Franquia, horas e tarifas gravadas foram mantidas. O total oficial permanece.";
    DIVERGENCIA_ALTERACAO_COM_MOTIVO = "Altera\xE7\xE3o posterior com motivo de edi\xE7\xE3o registrado. Franquia, horas e tarifas gravadas foram mantidas. O total oficial permanece.";
    DIVERGENCIA_ALTERACAO_INDETERMINADA = "Altera\xE7\xE3o posterior com origem indeterminada. O texto gravado n\xE3o comprova autoriza\xE7\xE3o. Franquia, horas e tarifas gravadas foram mantidas. O total oficial permanece.";
    FRASES_MOTIVO_REGISTRADO = [
      "salvamento manual confirmado",
      "tabela oficial aplicada",
      "edi\xE7\xE3o manual",
      "edicao manual",
      "ajuste manual",
      "valor zero confirmado"
    ];
    CAMPOS_DETALHE_SNAPSHOT = [
      "franchiseKm",
      "franchiseHours",
      "unitKm",
      "unitHr",
      "activationFee",
      "kmExtraTotal",
      "hrExtraTotal",
      "kmExtraQtd",
      "hrExtraQtd",
      "durationHours"
    ];
  }
});

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

// lib/cevaPortal/portalServidor.ts
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
  const texto5 = String(nome || "").trim().toUpperCase();
  if (!texto5) return null;
  const exato = PORTAIS_CLIENTE.find((portal) => portal.clienteNome.toUpperCase() === texto5);
  if (exato) return exato;
  if (texto5.includes("CEVA")) return PORTAL_CEVA;
  if (texto5.includes("INTERMODAL")) return PORTAL_IBL;
  return null;
}
function tabelaAusenteNoBanco(erro) {
  if (!erro) return false;
  const codigo = String(erro.code || "");
  const mensagem = String(erro.message || "");
  return codigo === "42P01" || codigo === "PGRST205" || /Could not find the table/i.test(mensagem);
}
var PORTAL_CEVA, PORTAL_IBL, TABELAS_PORTAL_GENERICO, PORTAIS_CLIENTE;
var init_portalServidor = __esm({
  "lib/cevaPortal/portalServidor.ts"() {
    "use strict";
    PORTAL_CEVA = {
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
    PORTAL_IBL = {
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
    TABELAS_PORTAL_GENERICO = {
      usuarios: "portal_cliente_usuarios",
      osCampos: "portal_cliente_os_campos",
      catalogo: "portal_cliente_catalogo",
      pgrHistorico: "portal_cliente_pgr_historico",
      solicitacoes: "portal_cliente_solicitacoes"
    };
    PORTAIS_CLIENTE = [PORTAL_CEVA, PORTAL_IBL];
  }
});

// lib/cevaPortal/regrasAcesso.ts
function podeRemoverPessoa(perfil) {
  return perfil === "analista";
}
function senhaPortalVencida(senhaAlteradaEm, agora = /* @__PURE__ */ new Date(), dias = DIAS_TROCA_SENHA_PORTAL) {
  if (!senhaAlteradaEm) return false;
  const quando = new Date(senhaAlteradaEm).getTime();
  if (!Number.isFinite(quando)) return true;
  return agora.getTime() - quando >= dias * 24 * 60 * 60 * 1e3;
}
function deveTrocarSenhaPortal(input) {
  if (input.trocarSenha === true) return true;
  return senhaPortalVencida(input.senhaAlteradaEm, input.agora ?? /* @__PURE__ */ new Date());
}
function permissoesDoPortal(caminho, perfil) {
  const rota = caminho.startsWith("/") ? caminho : `/${caminho}`;
  return [PERMISSAO_SO_PORTAL, `portal:${rota}`, `portal-perfil:${perfil}`];
}
function usuarioSoPortal(perms) {
  return Array.isArray(perms) && perms.includes(PERMISSAO_SO_PORTAL);
}
function caminhoPortalDasPermissoes(perms) {
  if (!Array.isArray(perms)) return null;
  const marca = perms.find((item) => typeof item === "string" && item.startsWith("portal:/"));
  return typeof marca === "string" ? marca.slice("portal:".length) : null;
}
function mensagemAcessoPortal(input) {
  const senha = input.manteveSenha ? "A senha continua a mesma que voc\xEA j\xE1 usa neste portal." : `\u{1F511} *Senha:* ${input.senha || ""}`;
  const aviso = input.manteveSenha ? "A senha precisa ser trocada a cada 30 dias dentro do portal." : "\u26A0\uFE0F No primeiro acesso, voc\xEA dever\xE1 trocar sua senha. Depois, a troca \xE9 obrigat\xF3ria a cada 30 dias.";
  return [
    `\u{1F510} *GRUPO TMSEG \u2014 Acesso ao portal ${input.rotulo}*`,
    "",
    `Ol\xE1 *${input.nome}*,`,
    "",
    "Seu acesso mostra somente as informa\xE7\xF5es deste cliente.",
    "",
    `\u{1F4E7} *Login:* ${input.email}`,
    senha,
    `\u{1F310} *Link:* ${input.link}`,
    "",
    aviso,
    "",
    "_Grupo TMSEG \u2014 Gest\xE3o Operacional_"
  ].join("\n");
}
function decidirPrimeiroAcesso(_input) {
  return {
    ok: false,
    error: "O acesso \xE9 criado no Cadastro de Usu\xE1rios do cliente, com a op\xE7\xE3o Acesso ao portal. A senha chega nessa libera\xE7\xE3o e troca no primeiro acesso."
  };
}
var DIAS_TROCA_SENHA_PORTAL, PERMISSAO_SO_PORTAL;
var init_regrasAcesso = __esm({
  "lib/cevaPortal/regrasAcesso.ts"() {
    "use strict";
    DIAS_TROCA_SENHA_PORTAL = 30;
    PERMISSAO_SO_PORTAL = "portal-only";
  }
});

// lib/cevaPortal/acesso.ts
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
function gerarSenhaTemporaria() {
  const bytes = (0, import_crypto.randomBytes)(12);
  return [...bytes].map((byte) => ALFABETO_SENHA[byte % ALFABETO_SENHA.length]).join("");
}
var import_crypto, ALFABETO_SENHA;
var init_acesso = __esm({
  "lib/cevaPortal/acesso.ts"() {
    "use strict";
    import_crypto = require("crypto");
    init_regrasAcesso();
    ALFABETO_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  }
});

// lib/gestorFiscal/ponteAuth/hashSenha.ts
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
var import_node_crypto, PARAMETROS_SCRYPT_V1;
var init_hashSenha = __esm({
  "lib/gestorFiscal/ponteAuth/hashSenha.ts"() {
    "use strict";
    import_node_crypto = require("node:crypto");
    PARAMETROS_SCRYPT_V1 = { versao: 1, N: 16384, r: 8, p: 1, keylen: 32 };
  }
});

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
  const texto5 = await cliente.from("system_users").update(legado).eq("id", usuarioId);
  if (texto5.error) throw new Error("Falha ao gravar a senha.");
  return "texto";
}
var init_gravarSenha = __esm({
  "lib/sessao/gravarSenha.ts"() {
    "use strict";
    init_hashSenha();
  }
});

// lib/cevaPortal/cadastroSistema.ts
function colunaSenhaAlteradaAusente(error) {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return error.code === "42703" || error.code === "PGRST204" || message.includes("senha_alterada_em");
}
async function vincularCadastroCliente(sb, input) {
  const { data: existente, error: leitura } = await sb.from("system_users").select("id, client_id, user_type, provider_id").ilike("email", input.email).maybeSingle();
  if (leitura) return { ok: false, error: "N\xE3o foi poss\xEDvel consultar o cadastro de usu\xE1rios." };
  const permissoes = permissoesDoPortal(input.caminho, input.perfil);
  const status = input.ativo ? "Ativo" : "Inativo";
  if (existente) {
    const tipo = String(existente.user_type || "");
    if (tipo && tipo !== "client") {
      return { ok: false, error: "Este e-mail j\xE1 pertence a um usu\xE1rio interno. Use outro e-mail no portal." };
    }
    if (existente.provider_id) {
      return { ok: false, error: "Este e-mail j\xE1 pertence a um fornecedor. Use outro e-mail no portal." };
    }
    if (existente.client_id && String(existente.client_id) !== String(input.clientId)) {
      return { ok: false, error: "Este e-mail j\xE1 est\xE1 vinculado a outro cliente." };
    }
    const { error: error2 } = await sb.from("system_users").update({
      name: input.nome,
      client_id: input.clientId,
      user_type: "client",
      status,
      permissions: permissoes,
      force_password_change: false
    }).eq("id", existente.id);
    if (error2) return { ok: false, error: "N\xE3o foi poss\xEDvel atualizar o cadastro de usu\xE1rios." };
    return { ok: true, id: String(existente.id) };
  }
  const payload = {
    name: input.nome,
    email: input.email,
    client_id: input.clientId,
    user_type: "client",
    status,
    force_password_change: false,
    permissions: permissoes
  };
  const { data, error } = await sb.from("system_users").insert(payload).select("id").single();
  if (error || !data?.id) return { ok: false, error: "N\xE3o foi poss\xEDvel criar o usu\xE1rio no cadastro do cliente." };
  if (input.senhaTemporaria) {
    await gravarSenhaNoServidor(sb, String(data.id), input.senhaTemporaria, { force_password_change: false });
  }
  return { ok: true, id: String(data.id) };
}
async function alinharStatusCadastroPortal(sb, email, ativo) {
  const { data } = await sb.from("system_users").select("id, permissions, user_type").ilike("email", email).maybeSingle();
  if (!data || String(data.user_type || "") !== "client" || !usuarioSoPortal(data.permissions)) return;
  await sb.from("system_users").update({ status: ativo ? "Ativo" : "Inativo" }).eq("id", data.id);
}
var init_cadastroSistema = __esm({
  "lib/cevaPortal/cadastroSistema.ts"() {
    "use strict";
    init_acesso();
    init_regrasAcesso();
    init_gravarSenha();
  }
});

// lib/cevaPortal/rules.ts
function dataHoraBrasil(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/);
  if (!match) return null;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const hora = Number(match[4] ?? "0");
  const minuto = Number(match[5] ?? "0");
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return null;
  return `${match[3]}-${match[2]}-${match[1]}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00-03:00`;
}
function parseBrazilDateTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const brasil = dataHoraBrasil(text);
  if (brasil) return brasil;
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
var CEVA_PORTAL_LOGIN_ENABLED;
var init_rules = __esm({
  "lib/cevaPortal/rules.ts"() {
    "use strict";
    CEVA_PORTAL_LOGIN_ENABLED = false;
  }
});

// lib/email/smtp.ts
var smtp_exports = {};
__export(smtp_exports, {
  BCC_RECIPIENTS: () => BCC_RECIPIENTS,
  EMAIL_USER: () => EMAIL_USER,
  SMTP_FROM: () => SMTP_FROM,
  getTransporter: () => getTransporter,
  sendMail: () => sendMail
});
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
var import_nodemailer, EMAIL_USER, SMTP_FROM, BCC_RECIPIENTS, transporter;
var init_smtp = __esm({
  "lib/email/smtp.ts"() {
    "use strict";
    import_nodemailer = __toESM(require("nodemailer"), 1);
    EMAIL_USER = process.env.EMAIL_USER || "adm@grupotmseg.com.br";
    SMTP_FROM = '"Grupo TM SEG" <adm@grupotmseg.com.br>';
    BCC_RECIPIENTS = ["thiago@grupotmseg.com.br", "operacional@grupotmseg.com.br"];
    transporter = null;
  }
});

// lib/sessao/token.ts
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
function abrirSessao(segredo, token, agora = Date.now()) {
  const limpo = String(token || "").replace(/^Bearer\s+/i, "").trim();
  if (!segredo || tokenLegado(limpo) || !limpo.startsWith(PREFIXO)) return null;
  const resto = limpo.slice(PREFIXO.length);
  const ponto = resto.lastIndexOf(".");
  if (ponto <= 0) return null;
  const corpo2 = resto.slice(0, ponto);
  const assinatura = resto.slice(ponto + 1);
  const esperada = assinar(segredo, corpo2);
  const recebida = Buffer.from(assinatura);
  const calculada = Buffer.from(esperada);
  if (recebida.length !== calculada.length || !(0, import_node_crypto3.timingSafeEqual)(recebida, calculada)) return null;
  try {
    const json = JSON.parse(Buffer.from(corpo2, "base64url").toString("utf8"));
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
function usuarioIdDoToken(token, env, agora) {
  return abrirSessao(segredoDaSessao(env), token, agora)?.usuarioId ?? null;
}
var import_node_crypto3, PREFIXO, TTL_SESSAO_MS;
var init_token = __esm({
  "lib/sessao/token.ts"() {
    "use strict";
    import_node_crypto3 = require("node:crypto");
    PREFIXO = "ponte.v1.";
    TTL_SESSAO_MS = 12 * 60 * 60 * 1e3;
  }
});

// lib/portalCliente/slug.ts
function corHex(valor) {
  const texto5 = String(valor || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(texto5) ? texto5.toLowerCase() : null;
}
var init_slug = __esm({
  "lib/portalCliente/slug.ts"() {
    "use strict";
  }
});

// lib/portalCliente/marcaSite.ts
function urlDeSitePublico(bruto) {
  let texto5 = String(bruto || "").trim();
  if (!texto5) return null;
  if (!/^https?:\/\//i.test(texto5)) texto5 = `https://${texto5}`;
  let url;
  try {
    url = new URL(texto5);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || HOST_BLOQUEADO.test(host) || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  return url;
}
function absoluto(base, caminho) {
  const texto5 = String(caminho || "").trim();
  if (!texto5 || texto5.startsWith("data:")) return null;
  try {
    const url = new URL(texto5, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
function meta(html, atributo, nome) {
  const re = new RegExp(`<meta[^>]*${atributo}=["']${nome}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0] || "";
  const content = tag.match(/content=["']([^"']+)["']/i)?.[1] || "";
  return content.trim() || null;
}
function rgb(hex2) {
  const n = Number.parseInt(hex2.slice(1), 16);
  return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 };
}
function luminancia(hex2) {
  const { r, g, b } = rgb(hex2);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function saturacao(hex2) {
  const { r, g, b } = rgb(hex2);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}
function clarear(hex2, quanto) {
  const { r, g, b } = rgb(hex2);
  const subir = (canal) => Math.max(0, Math.min(255, Math.round(canal + (255 - canal) * quanto)));
  return `#${[subir(r), subir(g), subir(b)].map((canal) => canal.toString(16).padStart(2, "0")).join("")}`;
}
function corUtil(hex2) {
  const cor = corHex(hex2);
  if (!cor) return null;
  if (luminancia(cor) > 0.94) return null;
  if (saturacao(cor) < 0.08 && luminancia(cor) > 0.2) return null;
  return cor;
}
function escolherPaleta(cores) {
  const unicas = [];
  for (const item of cores) {
    const cor = corUtil(item);
    if (cor && !unicas.includes(cor)) unicas.push(cor);
  }
  if (unicas.length === 0) return null;
  const marca = [...unicas].sort((a, b) => luminancia(a) - luminancia(b))[0];
  const viva = [...unicas].filter((cor) => cor !== marca).sort((a, b) => saturacao(b) - saturacao(a))[0];
  return { cor: marca, corAcao: viva || (luminancia(marca) < 0.45 ? clarear(marca, 0.35) : marca) };
}
function svgSemFundo(svg) {
  return svg.replace(/<rect\b[^>]*\/?>/gi, (tag) => {
    const fill = tag.match(/\bfill=["']([^"']+)["']/i)?.[1] || "";
    const branco = /^#f{3}(?:f{3})?$|^white$|^#ffffff$/i.test(fill.trim()) || /rgba?\(\s*255\s*,\s*255\s*,\s*255/i.test(fill);
    const tela = /width=["']100%["']/i.test(tag) && /height=["']100%["']/i.test(tag);
    return branco && tela ? "" : tag;
  }).replace(/(<svg\b[^>]*?)\sstyle=["'][^"']*background(?:-color)?:[^"']*["']/i, "$1");
}
function svgSeguro(bruto) {
  const texto5 = String(bruto || "").trim();
  if (!/<svg[\s>]/i.test(texto5) || texto5.length > 2e5) return null;
  const limpo = svgSemFundo(texto5).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "").replace(/\son\w+=["'][^"']*["']/gi, "");
  return /<svg[\s>]/i.test(limpo) ? limpo : null;
}
function ehSvg(endereco) {
  return Boolean(endereco && /\.svg(?:$|\?)/i.test(endereco));
}
function candidatosLogo(html, base) {
  const achados = [];
  for (const tag of html.match(/<(?:link|img)\b[^>]*>/gi) || []) {
    const rel = /rel=["'][^"']*(?:icon|logo|mask-icon)[^"']*["']/i.test(tag);
    const pareceLogo = /logo/i.test(tag);
    if (!rel && !pareceLogo) continue;
    const href = tag.match(/\b(?:href|src)=["']([^"']+)["']/i)?.[1];
    const url = absoluto(base, href);
    if (url && ehSvg(url)) achados.push(url);
  }
  return [...new Set(achados)];
}
function lerMarcaDoHtml(html, base) {
  const tema = corHex(meta(html, "name", "theme-color")) || corHex(meta(html, "name", "msapplication-TileColor"));
  const paleta = escolherPaleta([tema, ...html.match(/#[0-9a-fA-F]{6}\b/g) || []]);
  const logos = candidatosLogo(html, base);
  return {
    logo: logos[0] || null,
    cor: paleta?.cor || null,
    corAcao: paleta?.corAcao || null
  };
}
async function buscarMarcaDoSite(bruto) {
  const url = urlDeSitePublico(bruto);
  if (!url) return { error: "Informe um site p\xFAblico, com endere\xE7o v\xE1lido." };
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 6e3);
  try {
    let atual = url;
    let resposta = null;
    for (let salto = 0; salto < 3; salto += 1) {
      resposta = await fetch(atual, {
        signal: controle.signal,
        redirect: "manual",
        headers: { "User-Agent": "TMSEG-portal-marca", Accept: "text/html" }
      });
      if (resposta.status < 300 || resposta.status >= 400) break;
      const proxima = urlDeSitePublico(resposta.headers.get("location") || "");
      if (!proxima) return { error: "O site redirecionou para um endere\xE7o que n\xE3o pode ser lido." };
      atual = proxima;
    }
    if (!resposta || !resposta.ok) return { error: "O site n\xE3o respondeu a leitura do logotipo." };
    const html = (await resposta.text()).slice(0, 4e5);
    const marca = lerMarcaDoHtml(html, atual);
    if (!marca.logo) return marca;
    const arquivo = await fetch(marca.logo, {
      signal: controle.signal,
      headers: { "User-Agent": "TMSEG-portal-marca", Accept: "image/svg+xml,text/plain" }
    });
    if (!arquivo.ok) return { ...marca, logo: null };
    const svg = svgSeguro(await arquivo.text());
    if (!svg) return { ...marca, logo: null };
    return { ...marca, logo: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
  } catch {
    return { error: "N\xE3o foi poss\xEDvel ler o site. Envie o logotipo e escolha as cores." };
  } finally {
    clearTimeout(timer);
  }
}
var HOST_BLOQUEADO;
var init_marcaSite = __esm({
  "lib/portalCliente/marcaSite.ts"() {
    "use strict";
    init_slug();
    HOST_BLOQUEADO = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.0\.0\.0|metadata\.google|169\.254\.)/i;
  }
});

// lib/portalCliente/marcaSiteHttp.ts
var marcaSiteHttp_exports = {};
__export(marcaSiteHttp_exports, {
  responderMarcaSite: () => responderMarcaSite
});
async function responderMarcaSite(req, res) {
  const userId = usuarioIdDoToken(String(req.headers?.authorization || ""));
  if (!userId) {
    res.status(401).json({ error: "N\xE3o autorizado" });
    return;
  }
  const bruto = typeof req.body === "string" ? (() => {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  })() : req.body || {};
  const url = String(bruto?.url || "");
  const marca = await buscarMarcaDoSite(url);
  if ("error" in marca) {
    res.status(422).json(marca);
    return;
  }
  res.status(200).json(marca);
}
var init_marcaSiteHttp = __esm({
  "lib/portalCliente/marcaSiteHttp.ts"() {
    "use strict";
    init_token();
    init_marcaSite();
  }
});

// lib/portalCliente/acessoInicial.ts
function emailPortalDoSite(site) {
  const url = urlDeSitePublico(site);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  return emailDeAcesso(`portal@${host}`);
}
function senhaInicialDoCnpj(documento) {
  const digitos = String(documento || "").replace(/\D/g, "");
  if (digitos.length !== 14) return null;
  return digitos;
}
var init_acessoInicial = __esm({
  "lib/portalCliente/acessoInicial.ts"() {
    "use strict";
    init_acesso();
    init_marcaSite();
  }
});

// lib/portalCliente/provisionarAdmin.ts
async function criarAdministradorInicial(sb, cliente) {
  if (cliente.portal_ativo !== true) return { ok: false, error: "O portal deste cliente n\xE3o est\xE1 ligado." };
  const email = emailPortalDoSite(cliente.portal_site);
  if (!email) return { ok: false, error: "Informe o site do cliente para criar o e-mail portal@dom\xEDnio." };
  const senha = senhaInicialDoCnpj(cliente.cnpj);
  if (!senha) return { ok: false, error: "O primeiro acesso usa o CNPJ como senha. O documento precisa ter 14 n\xFAmeros." };
  const slug = String(cliente.portal_slug || "").trim();
  if (!slug) return { ok: false, error: "Informe o endere\xE7o da p\xE1gina do portal." };
  const clientId = cliente.id;
  if (clientId == null || clientId === "") return { ok: false, error: "Cliente sem identificador." };
  const leitura = await sb.from("portal_cliente_usuarios").select("id, email, perfil").eq("client_id", clientId).eq("perfil", "administrador").limit(1);
  if (leitura.error) {
    const codigo = String(leitura.error.code || "");
    if (codigo === "42P01" || codigo === "PGRST205" || codigo === "PGRST204") {
      return { ok: false, error: "A tabela de acessos do portal ainda n\xE3o est\xE1 no banco." };
    }
    return { ok: false, error: "N\xE3o foi poss\xEDvel consultar o administrador do portal." };
  }
  const existente = Array.isArray(leitura.data) ? leitura.data[0] : null;
  if (existente?.email) return { ok: true, criado: false, email: String(existente.email) };
  const nome = String(cliente.trading_name || cliente.name || "Administrador").trim().slice(0, 120);
  const novo = {
    client_id: clientId,
    nome,
    email,
    perfil: "administrador",
    status: "ativo",
    trocar_senha: true,
    trocar_email: true,
    senha_hash: hashSenha(senha),
    senha_alterada_em: null
  };
  const gravado = await sb.from("portal_cliente_usuarios").insert(novo).select("id").single();
  if (gravado.error || !gravado.data?.id) {
    if (gravado.error?.code === "23505") return { ok: false, error: "Este e-mail provis\xF3rio j\xE1 est\xE1 em outro acesso." };
    return { ok: false, error: "N\xE3o foi poss\xEDvel criar o administrador do portal." };
  }
  const vinculo = await vincularCadastroCliente(sb, {
    nome,
    email,
    senhaTemporaria: senha,
    clientId,
    caminho: `/${slug}`,
    perfil: "administrador",
    ativo: true
  });
  if (!vinculo.ok) {
    await sb.from("portal_cliente_usuarios").delete().eq("id", gravado.data.id);
    return vinculo;
  }
  return { ok: true, criado: true, email };
}
var init_provisionarAdmin = __esm({
  "lib/portalCliente/provisionarAdmin.ts"() {
    "use strict";
    init_acesso();
    init_cadastroSistema();
    init_acessoInicial();
  }
});

// lib/portalCliente/provisionarHttp.ts
var provisionarHttp_exports = {};
__export(provisionarHttp_exports, {
  responderProvisionar: () => responderProvisionar
});
function corpo(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body || {};
}
async function responderProvisionar(req, res) {
  if (!usuarioIdDoToken(String(req.headers?.authorization || ""))) {
    res.status(401).json({ error: "N\xE3o autorizado" });
    return;
  }
  const clientId = String(corpo(req).clientId || "").trim();
  if (!clientId) {
    res.status(400).json({ error: "Informe o cliente." });
    return;
  }
  const sb = createSupabaseAdminClient();
  if (!sb) {
    res.status(503).json({ error: "Portal indispon\xEDvel." });
    return;
  }
  const { data, error } = await sb.from("clients").select("id, name, trading_name, cnpj, status, portal_ativo, portal_site, portal_slug").eq("id", clientId).maybeSingle();
  if (error || !data) {
    res.status(404).json({ error: "Cliente n\xE3o encontrado." });
    return;
  }
  if (portalPorNomeCliente(data.name)) {
    res.status(200).json({ ok: true, criado: false, fixo: true });
    return;
  }
  if (String(data.status || "") !== "Ativo") {
    res.status(422).json({ error: "O portal inicial s\xF3 nasce com o cliente ativo." });
    return;
  }
  const resultado = await criarAdministradorInicial(sb, data);
  res.status(resultado.ok ? 200 : 422).json(resultado);
}
var init_provisionarHttp = __esm({
  "lib/portalCliente/provisionarHttp.ts"() {
    "use strict";
    init_portalServidor();
    init_token();
    init_supabaseAdmin();
    init_provisionarAdmin();
  }
});

// lib/cevaPortal/camposCliente.ts
var camposCliente_exports = {};
__export(camposCliente_exports, {
  CAMPOS_FILTRO: () => CAMPOS_FILTRO,
  CAMPOS_LISTA_SOLICITACAO: () => CAMPOS_LISTA_SOLICITACAO,
  CAMPOS_NOVOS_SO_ADMIN: () => CAMPOS_NOVOS_SO_ADMIN,
  CAMPO_PGR: () => CAMPO_PGR,
  COLUNA_LISTA_SOLICITACAO: () => COLUNA_LISTA_SOLICITACAO,
  SERVICOS_FIXOS: () => SERVICOS_FIXOS,
  avisoInclusaoAdmin: () => avisoInclusaoAdmin,
  decidirGravacao: () => decidirGravacao,
  decidirNomeCatalogo: () => decidirNomeCatalogo,
  ehCampoFiltro: () => ehCampoFiltro,
  ehCampoLista: () => ehCampoLista,
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
function ehCampoLista(campo) {
  return CAMPOS_LISTA_SOLICITACAO.includes(campo);
}
function decidirNomeCatalogo(valor, catalogo) {
  return decidirGravacao("operacao", valor, catalogo);
}
var CAMPOS_FILTRO, CAMPOS_NOVOS_SO_ADMIN, CAMPO_PGR, SERVICOS_FIXOS, LIMITE_FILTRO, LIMITE_PGR, CAMPOS_LISTA_SOLICITACAO, COLUNA_LISTA_SOLICITACAO;
var init_camposCliente = __esm({
  "lib/cevaPortal/camposCliente.ts"() {
    "use strict";
    CAMPOS_FILTRO = ["solicitante", "quemAutorizou", "servico", "contrato", "operacao", "tsp"];
    CAMPOS_NOVOS_SO_ADMIN = ["operacao", "tsp"];
    CAMPO_PGR = "atendimentoPgr";
    SERVICOS_FIXOS = ["Escolta Caracterizada", "Pronta Resposta"];
    LIMITE_FILTRO = 120;
    LIMITE_PGR = 2e3;
    CAMPOS_LISTA_SOLICITACAO = ["operacao", "quemAutorizou", "contrato", "tsp", "atendimentoPgr"];
    COLUNA_LISTA_SOLICITACAO = {
      operacao: "operacao",
      quemAutorizou: "quem_autorizou",
      contrato: "contrato",
      tsp: "tsp",
      atendimentoPgr: "atendimento_pgr"
    };
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
  const cfg2 = {
    baseActivationValue: Number(provider.auto_base_value) || 0,
    baseKmAllowance: Number(provider.auto_base_km) || 0,
    baseHourAllowance: Number(provider.auto_base_hr) || 0,
    extraKmValue: Number(provider.auto_extra_km) || 0,
    extraHourValue: Number(provider.auto_extra_hr) || 0,
    region: provider.auto_region ? String(provider.auto_region).toUpperCase().trim() : null
  };
  if (cfg2.baseActivationValue <= 0 || cfg2.baseKmAllowance <= 0) return null;
  return cfg2;
}
function synthesizeAutoMasterRow(provider) {
  const cfg2 = extractAutoMasterConfigFromProvider(provider);
  if (!cfg2) return null;
  return {
    id: `__auto_master__:${provider?.id || provider?.name || "unknown"}`,
    provider: provider?.name || "",
    operation_type: AUTO_MASTER_OP_TYPE,
    activation_cost: cfg2.baseActivationValue,
    franchise_km: cfg2.baseKmAllowance,
    franchise_hours: cfg2.baseHourAllowance,
    cost_per_extra_km: cfg2.extraKmValue,
    cost_per_extra_hour: cfg2.extraHourValue,
    cancellation_fee: 0,
    auto_region: cfg2.region || null,
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
  const toDate2 = (v) => {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const sched = toDate2(scheduledTime);
  const start = toDate2(startTime);
  const end = toDate2(endTime);
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
function classificarTarifaKm(valor, excepcional) {
  if (excepcional != null && Number.isFinite(Number(excepcional)) && Number(excepcional) > 0) {
    return { origem: "excepcional", tarifa: Math.round(Number(excepcional) * 100) / 100 };
  }
  if (valor == null || !Number.isFinite(Number(valor))) return { origem: "ausente", tarifa: 0 };
  if (Number(valor) < 0) return { origem: "ausente", tarifa: 0 };
  if (Number(valor) === 0) return { origem: "zero_contratual", tarifa: 0 };
  return { origem: "tabela", tarifa: Math.round(Number(valor) * 100) / 100 };
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
  const clienteInformado = opts.displacementValue != null;
  const fornecedorInformado = opts.displacementValueProvider != null;
  const storedClient = clienteInformado ? Math.max(0, Number(opts.displacementValue) || 0) : 0;
  const storedProvider = fornecedorInformado ? Math.max(0, Number(opts.displacementValueProvider) || 0) : 0;
  const tarifaCliente = classificarTarifaKm(opts.clientUnitPriceKm, opts.tarifaExcepcionalCliente);
  const clientRate = tarifaCliente.tarifa;
  const providerRate = opts.isSameOs ? 0 : Math.max(0, Number(opts.providerUnitPriceKm) || 0);
  const derivedClient = km > 0 && clientRate > 0 ? Math.round(km * clientRate * 100) / 100 : 0;
  const derivedProvider = km > 0 && providerRate > 0 ? Math.round(km * providerRate * 100) / 100 : 0;
  return {
    km,
    clientRate,
    providerRate,
    origemTarifaCliente: tarifaCliente.origem,
    client: clienteInformado ? Math.round(storedClient * 100) / 100 : derivedClient,
    provider: opts.isSameOs ? 0 : fornecedorInformado ? Math.round(storedProvider * 100) / 100 : derivedProvider
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
function isNamedCityRoute(tableOp, cities) {
  if (cities.length < 2) return false;
  const positions = cities.map((city) => ({ city, index: tableOp.indexOf(city) })).filter((hit) => hit.index >= 0).sort((a, b) => a.index - b.index);
  const distinct = [];
  for (const hit of positions) {
    const insideLonger = distinct.some(
      (kept) => hit.index >= kept.index && hit.index + hit.city.length <= kept.index + kept.city.length
    );
    if (!insideLonger) distinct.push(hit);
  }
  if (distinct.length < 2) return false;
  for (let i = 0; i < distinct.length - 1; i++) {
    const start = distinct[i].index + distinct[i].city.length;
    const between = tableOp.slice(start, distinct[i + 1].index);
    if (/\bX\b/.test(between) || /^[\s\-–—]+$/.test(between)) return true;
  }
  return false;
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
    if (isNamedCityRoute(tableOp, citiesInTable)) {
      const originText = `${originCity} ${originAddr}`;
      const onOrigin = citiesInTable.filter((city) => originText.includes(city));
      const onDest = citiesInTable.filter((city) => destCity.includes(city));
      const leftover = citiesInTable.filter((city) => !originText.includes(city) && !destCity.includes(city));
      if (leftover.length > 0 || onOrigin.length === 0 || onDest.length === 0) {
        const missing = leftover[0] || citiesInTable.find((city) => !onDest.includes(city)) || citiesInTable[0];
        return { blocked: true, reason: `BLOQUEIO ROTA (${missing})` };
      }
      return { blocked: false, reason: "", matchedCity: onOrigin[0] };
    }
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
    init_missionSnapshot();
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
        candidateTables = (candidateTables || []).filter(
          (t) => !String(t?.operation_type || "").toUpperCase().includes("__AUTO_MASTER__")
        );
        if (!candidateTables || candidateTables.length === 0) return { table: null, log: "Tabela n\xE3o encontrada" };
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
      clientTablesFiltered = clientTablesFiltered.filter(
        (t) => !String(t.operation_type || "").toUpperCase().includes("__AUTO_MASTER__")
      );
      let isManualOverride = false;
      if (manualTableOverrides?.clientTableId) {
        const wantedId = String(manualTableOverrides.clientTableId);
        const manualTable = clientTables.find((t) => String(t.id) === wantedId);
        if (manualTable && !String(manualTable.operation_type || "").toUpperCase().includes("__AUTO_MASTER__")) {
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
      if (!appliedClientTable) {
        console.warn(`Nenhuma tabela encontrada para o cliente ${missionClientRaw}. A tabela mestre gen\xE9rica n\xE3o \xE9 aplicada.`);
        if (!clientLog || clientLog === "Manual" || clientLog === "Sem tabelas cadastradas") {
          clientLog = "Tabela n\xE3o encontrada";
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
      let effectiveProviderTableId = manualTableOverrides?.providerTableId && !String(manualTableOverrides.providerTableId).startsWith("auto-") && !String(manualTableOverrides.providerTableId).startsWith("__auto_master__") ? manualTableOverrides.providerTableId : void 0;
      if (effectiveProviderTableId) {
        const linhaSalva = providerTables.find((t) => String(t.id) === String(effectiveProviderTableId));
        if (linhaSalva && isAutoMasterRow(linhaSalva)) {
          effectiveProviderTableId = void 0;
        }
      }
      const hasManualProviderOverride = !!effectiveProviderTableId;
      const autoEngineActive = false;
      void autoMasterConfig;
      void autoRegionMatches;
      void hasManualProviderOverride;
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
      if (!appliedProviderTable) {
        console.warn(`Nenhuma tabela de fornecedor encontrada para ${mission.provider || "a OS"}. A tabela mestre gen\xE9rica n\xE3o \xE9 aplicada.`);
        if (!providerLog || providerLog === "Manual") {
          providerLog = "Tabela n\xE3o encontrada";
        }
      }
      const cBase = isRefused ? 0 : manualTableOverrides?.customClientBase !== void 0 ? manualTableOverrides.customClientBase : Math.max(0, (appliedClientTable?.activation_fee || 0) * clientMultiplier);
      const cFranchiseKm = appliedClientTable?.franchise_km || 100;
      const cFranchiseHr = appliedClientTable?.franchise_hours || 3;
      let cExcessKm = Math.max(0, distanceForCalculation - cFranchiseKm);
      let cExcessHr = Math.max(0, durationHours - cFranchiseHr);
      const tarifaKmTabela = classificarTarifaKm(
        manualTableOverrides?.customClientUnitKm !== void 0 ? manualTableOverrides.customClientUnitKm : appliedClientTable?.price_per_extra_km,
        manualTableOverrides?.tarifaExcepcionalKm
      );
      let cUnitPriceKm = tarifaKmTabela.tarifa;
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
          tarifaKmOrigem: tarifaKmTabela.origem,
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

// lib/billing/boletimLineTotal.ts
function resolveBoletimClientLineTotal(input) {
  if (input.wasManuallyEdited) return input.dbTotal;
  const snap = input.snapTotalWithDisp > 0 ? input.snapTotalWithDisp : 0;
  if (snap > 0 && (input.dbTotal <= 0 || Math.abs(input.dbTotal - snap) < 0.01)) {
    return snap;
  }
  if (input.dbTotal > 0) return input.dbTotal;
  return input.componentTotal;
}
var init_boletimLineTotal = __esm({
  "lib/billing/boletimLineTotal.ts"() {
    "use strict";
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
function pedagioSoFaixaLegada(mission, snap) {
  if (snap.tollVal == null) return false;
  const oficial = resolveStoredClientToll(mission.toll_value ?? 0, mission.toll_value_provider, mission.client);
  const congelado = numeroEntregue(snap.tollVal);
  if (centavos(oficial) === centavos(congelado)) return false;
  const bruto = numeroEntregue(mission.toll_value);
  const faixa = billableClientToll(bruto, mission.client);
  return centavos(congelado) === centavos(bruto) && centavos(oficial) === centavos(faixa);
}
function osMudouDepoisDoSnapshot(mission, snap) {
  const receita = numeroEntregue(mission.revenue_value);
  const servicoSnap = numeroOuNulo(snap.revenueServiceOnly);
  const baseSnap = servicoSnap != null ? servicoSnap : Math.max(0, numeroEntregue(snap.totalGeral) - numeroEntregue(snap.tollVal) - Math.max(0, numeroEntregue(snap.displacementVal)));
  if (centavos(receita) !== centavos(baseSnap)) return true;
  const pedagio = resolveStoredClientToll(mission.toll_value ?? 0, mission.toll_value_provider, mission.client);
  if (snap.tollVal != null && centavos(pedagio) !== centavos(numeroEntregue(snap.tollVal)) && !pedagioSoFaixaLegada(mission, snap)) return true;
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
  const estado = estadoDetalhamentoSnapshot(mission.snapshot_data);
  const origem = origemSnapshotFinanceiro(mission.snapshot_approved_by, mission.snapshot_data);
  const preservar = devePreservarDetalhamentoRegistrado({
    billingApproved: mission.billing_approved === true,
    carimbo: mission.snapshot_approved_by,
    snapshot: mission.snapshot_data
  });
  const exibirRegistrado = !!(preservar && snap && (estado === "valido" || estado === "zerado"));
  const base = baseDaLinha(mission, os);
  if (exibirRegistrado && snap) {
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
    const componentes = useBase + useKmEx + useHrEx + useToll + useDisp;
    const totalDoBoletim = resolveBoletimClientLineTotal({
      dbTotal,
      snapTotalWithDisp,
      componentTotal: componentes,
      wasManuallyEdited
    });
    const useTotal = mission.billing_approved === true ? totalDoBoletim : wasManuallyEdited ? dbTotal : snapTotalWithDisp > 0 ? snapTotalWithDisp : componentes;
    const snapFranchiseHours = numeroEntregue(snap.franchiseHours);
    const snapFranchiseKm = numeroEntregue(snap.franchiseKm);
    const snapUnitHr = numeroEntregue(snap.unitHr);
    const snapUnitKm = numeroEntregue(snap.unitKm);
    const snapHrExtraQtd = numeroEntregue(snap.hrExtraQtd);
    const snapKmExtraQtd = numeroEntregue(snap.kmExtraQtd);
    const snapDurationHours = numeroEntregue(snap.durationHours);
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
      local: localOrigemDestino(mission.origin, mission.destination),
      origemSnapshot: origem,
      homologadoPorPessoa: origem === "humana",
      divergenciaDetalhamento: estado === "zerado" ? DIVERGENCIA_DETALHAMENTO_ZERADO : null
    };
    if (osMudouDepoisDoSnapshot(mission, snap)) {
      linha.divergenciaDetalhamento = textoAlteracaoPosterior(classificarAlteracaoPosterior({
        motivoReceita: mission.revenue_edit_reason,
        motivoCusto: mission.cost_edit_reason
      }));
    }
    return fecharLinha(linha, mission);
  }
  if (mission.billing_approved === true || origem === "humana") {
    const tollOficial = resolveStoredClientToll(mission.toll_value || 0, mission.toll_value_provider, mission.client);
    const receitaOficial = numeroEntregue(mission.revenue_value);
    let deslocamentoOficial = 0;
    try {
      const finOficial = calculateMissionFinancials(mission, priceTables, providerTables, clientData, /* @__PURE__ */ new Date());
      deslocamentoOficial = resolveMissionDisplacement(mission, {
        clientUnitPriceKm: finOficial.client.unitPriceKm,
        providerUnitPriceKm: finOficial.provider.unitCostKm
      }).client;
    } catch {
    }
    const kmInicio2 = kmGravado(mission.start_km);
    const kmFim2 = kmGravado(mission.end_km);
    const kmRodado = kmInicio2 != null && kmFim2 != null && kmFim2 >= kmInicio2 ? kmFim2 - kmInicio2 : null;
    const divergencia = estado === "incompleto" ? DIVERGENCIA_DETALHAMENTO_INCOMPLETO : DIVERGENCIA_SNAPSHOT_INVALIDO;
    return fecharLinha({
      ...base,
      franquiaHora: null,
      franquiaKm: null,
      kmInicio: kmInicio2,
      kmFim: kmFim2,
      kmRodado,
      kmExcedente: null,
      hrsTrabalhada: null,
      hrsExcedente: null,
      valorHrsExcedente: null,
      valorKmExcedente: null,
      valorAcionamento: null,
      valorTotal: receitaOficial + tollOficial + deslocamentoOficial,
      pedagio: tollOficial,
      tarifaKm: null,
      tarifaHora: null,
      local: localOrigemDestino(mission.origin, mission.destination),
      origemSnapshot: origem,
      homologadoPorPessoa: false,
      divergenciaDetalhamento: divergencia
    }, mission);
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
    local: localOrigemDestino(mission.origin, mission.destination),
    origemSnapshot: origem,
    homologadoPorPessoa: false,
    divergenciaDetalhamento: null
  }, mission);
}
var UF_VALIDA, LIGACAO;
var init_report = __esm({
  "lib/cevaPortal/report.ts"() {
    "use strict";
    init_financialUtils();
    init_boletimLineTotal();
    init_resolveMissionDisplacement();
    init_clientTollBilling();
    init_missionSnapshot();
    UF_VALIDA = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;
    LIGACAO = /* @__PURE__ */ new Set(["de", "da", "do", "das", "dos", "e"]);
  }
});

// lib/cevaPortal/aoVivo.ts
var aoVivo_exports = {};
__export(aoVivo_exports, {
  STATUS_AO_VIVO: () => STATUS_AO_VIVO,
  montarMissaoAoVivo: () => montarMissaoAoVivo,
  ordenarMissoesAoVivo: () => ordenarMissoesAoVivo,
  segueNoAoVivo: () => segueNoAoVivo
});
function segueNoAoVivo(row) {
  const status = String(row.status || "").trim();
  if (!STATUS_AO_VIVO.includes(status)) return false;
  if (row.billing_approved === true) return false;
  if (status === "Pendente" && String(row.end_time || "").trim()) return false;
  return true;
}
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
async function fetchAllPages(buildQuery, pageSize = 1e3, maxRows = 5e4, options = {}) {
  const all = [];
  const seenKeys = /* @__PURE__ */ new Set();
  let from = 0;
  let exhausted = false;
  let pagesLoaded = 0;
  let expectedRows = null;
  while (all.length < maxRows) {
    const take = Math.min(pageSize, maxRows - all.length);
    const { data, error, count } = await buildQuery(from, take);
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
      const key = options.getRowKey?.(row);
      if (key !== void 0) {
        if (seenKeys.has(key)) {
          throw new SupabasePagingIntegrityError(
            `Registro duplicado entre p\xE1ginas: ${String(key)}.`,
            "DUPLICATE_ROW"
          );
        }
        seenKeys.add(key);
      }
      all.push(row);
    }
    if (expectedRows !== null && all.length > expectedRows) {
      throw new SupabasePagingIntegrityError(
        `Foram carregados ${all.length} registros para uma contagem esperada de ${expectedRows}.`,
        "ROW_COUNT_MISMATCH"
      );
    }
    if (expectedRows !== null && all.length === expectedRows) {
      exhausted = true;
      break;
    }
    if (data.length < take) {
      exhausted = true;
      break;
    }
    from += data.length;
  }
  let truncated = false;
  if (!exhausted && all.length >= maxRows) {
    if (expectedRows !== null) {
      truncated = expectedRows > maxRows;
    } else {
      const { data, error } = await buildQuery(maxRows, 1);
      pagesLoaded += 1;
      if (error) throw error;
      if (data === null) {
        throw new SupabasePagingIntegrityError(
          `P\xE1gina sentinela retornou dados nulos sem erro expl\xEDcito.`,
          "NULL_PAGE"
        );
      }
      truncated = data.length > 0;
    }
  }
  if (!truncated && expectedRows !== null && all.length !== expectedRows) {
    throw new SupabasePagingIntegrityError(
      `A pagina\xE7\xE3o terminou com ${all.length} de ${expectedRows} registros esperados.`,
      "ROW_COUNT_MISMATCH"
    );
  }
  return { rows: all, truncated, pagesLoaded, complete: !truncated, expectedRows };
}
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

// lib/portalCliente/medicao.ts
var medicao_exports = {};
__export(medicao_exports, {
  EMAIL_FINANCEIRO_MEDICAO: () => EMAIL_FINANCEIRO_MEDICAO,
  ITENS_MEDICAO: () => ITENS_MEDICAO,
  itensConferir: () => itensConferir,
  medicaoDaLinha: () => medicaoDaLinha,
  textoEmailConferir: () => textoEmailConferir,
  validarConferir: () => validarConferir
});
function itensConferir(valor) {
  if (!Array.isArray(valor)) return [];
  const permitidos = new Set(ITENS_MEDICAO);
  const escolhidos = valor.map((item) => String(item || "").trim()).filter((item) => permitidos.has(item));
  return [...new Set(escolhidos)];
}
function validarConferir(input) {
  const itens = itensConferir(input.itens);
  const justificativa = String(input.justificativa || "").trim();
  if (itens.length === 0) return { ok: false, erro: "Selecione o que n\xE3o foi aprovado." };
  if (justificativa.length < 8) return { ok: false, erro: "Escreva a justificativa com pelo menos 8 caracteres." };
  return { ok: true, itens, justificativa };
}
function medicaoDaLinha(row) {
  const status = String(row?.status || "");
  if (status !== "aprovado" && status !== "conferir" && status !== "modificado") return null;
  return {
    status,
    itens: itensConferir(row?.itens),
    justificativa: String(row?.justificativa || "").trim() || null,
    modificadoEm: row?.modificado_em ? String(row.modificado_em) : null
  };
}
function textoEmailConferir(input) {
  const linhas = [
    `O cliente pediu para conferir a medi\xE7\xE3o da OS GTM-${input.os}.`,
    `Cliente: ${input.cliente}`,
    `Quem pediu: ${input.autor}`,
    "",
    "N\xE3o aprovou:",
    ...input.itens.map((item) => `- ${item}`),
    "",
    "Justificativa:",
    input.justificativa,
    "",
    "Medi\xE7\xE3o apresentada:",
    ...input.detalhes
  ];
  return linhas.join("\n");
}
var ITENS_MEDICAO, EMAIL_FINANCEIRO_MEDICAO;
var init_medicao = __esm({
  "lib/portalCliente/medicao.ts"() {
    "use strict";
    ITENS_MEDICAO = [
      "Franquia hora",
      "Franquia km",
      "Km rodado",
      "Km excedente",
      "Horas trabalhadas",
      "Horas excedentes",
      "R$ horas excedentes",
      "R$ km excedente",
      "R$ acionamento",
      "Ped\xE1gio",
      "R$ total",
      "Local",
      "Servi\xE7o"
    ];
    EMAIL_FINANCEIRO_MEDICAO = "financeiro@grupotmseg.com.br";
  }
});

// lib/portalCliente/frota.ts
var frota_exports = {};
__export(frota_exports, {
  listarFrotaPortal: () => listarFrotaPortal
});
async function listarFrotaPortal(sb, nomesCliente, clientId) {
  const motoristas = /* @__PURE__ */ new Map();
  const nomes = nomesCliente.map((nome) => nome.trim()).filter(Boolean);
  if (nomes.length > 0) {
    for (let from = 0; from < TETO; from += PAGINA) {
      const { data, error } = await sb.from("missions").select("driver_name, driver_phone").in("client", nomes).not("driver_name", "is", null).order("created_at", { ascending: false }).range(from, from + PAGINA - 1);
      if (error) throw error;
      for (const row of data || []) {
        const nome = String(row.driver_name || "").trim().replace(/\s+/g, " ").toUpperCase();
        const telefone = String(row.driver_phone || "").trim();
        const chave = `${nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "")}|${telefone.replace(/\D/g, "")}`;
        if (!nome || motoristas.has(chave)) continue;
        motoristas.set(chave, { nome, telefone });
      }
      if (!data || data.length < PAGINA) break;
    }
  }
  const veiculos = [];
  const vistos = /* @__PURE__ */ new Set();
  let colunas = "plate, model, brand, status";
  for (let from = 0; from < TETO; from += PAGINA) {
    let consulta = await sb.from("client_vehicles").select(colunas).eq("client_id", clientId).order("plate").range(from, from + PAGINA - 1);
    if (consulta.error && /status/i.test(String(consulta.error.message || "")) && colunas.includes("status")) {
      colunas = "plate, model, brand";
      consulta = await sb.from("client_vehicles").select(colunas).eq("client_id", clientId).order("plate").range(from, from + PAGINA - 1);
    }
    const { data, error } = consulta;
    if (error) throw error;
    for (const row of data || []) {
      if (String(row.status || "").toLowerCase() === "inativo") continue;
      const placa = String(row.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
      if (!placa || vistos.has(placa)) continue;
      vistos.add(placa);
      const modelo = [row.brand, row.model].map((item) => String(item || "").trim()).filter(Boolean).join(" ");
      veiculos.push({ placa, modelo });
    }
    if (!data || data.length < PAGINA) break;
  }
  return {
    motoristas: [...motoristas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    veiculos
  };
}
var PAGINA, TETO;
var init_frota = __esm({
  "lib/portalCliente/frota.ts"() {
    "use strict";
    PAGINA = 1e3;
    TETO = 8e3;
  }
});

// lib/portalCliente/pedido.ts
var pedido_exports = {};
__export(pedido_exports, {
  EMAIL_OPERACIONAL_TMSEG: () => EMAIL_OPERACIONAL_TMSEG,
  PEDIDOS_PORTAL: () => PEDIDOS_PORTAL,
  QUANTIDADE_MAXIMA_OS: () => QUANTIDADE_MAXIMA_OS,
  corpoTrazPreco: () => corpoTrazPreco,
  emailsDaSolicitacao: () => emailsDaSolicitacao,
  quantidadeDoPedido: () => quantidadeDoPedido,
  validarPedidoPortal: () => validarPedidoPortal
});
function diaCivilBrasil(ms) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(ms));
  const pegar = (tipo) => partes.find((parte) => parte.type === tipo)?.value || "";
  return `${pegar("year")}-${pegar("month")}-${pegar("day")}`;
}
function texto3(valor, max) {
  return String(valor ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().replace(/\s+/g, " ").slice(0, max);
}
function opcional(valor, max) {
  const limpo = texto3(valor, max);
  return limpo || null;
}
function emailsDaSolicitacao(operationalEmail) {
  const doCliente = String(operationalEmail || "").split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter((item) => item.includes("@") && item.includes("."));
  return [.../* @__PURE__ */ new Set([EMAIL_OPERACIONAL_TMSEG, ...doCliente])];
}
function corpoTrazPreco(body) {
  if (!body || typeof body !== "object") return false;
  return Object.keys(body).some((chave) => {
    const nome = chave.toLowerCase();
    return CHAVES_PRECO.some((marca) => nome.includes(marca));
  });
}
function quantidadeDoPedido(body) {
  const source = body && typeof body === "object" ? body : {};
  if (source.quantidade == null || source.quantidade === "") return { ok: true, value: 1 };
  const numero4 = Number(source.quantidade);
  if (!Number.isInteger(numero4) || numero4 < 1 || numero4 > QUANTIDADE_MAXIMA_OS) {
    return { ok: false, error: `A quantidade fica entre 1 e ${QUANTIDADE_MAXIMA_OS} OS.` };
  }
  return { ok: true, value: numero4 };
}
function validarPedidoPortal(body, solicitanteSessao, agora = Date.now()) {
  if (corpoTrazPreco(body)) {
    return { ok: false, error: "O pedido n\xE3o aceita pre\xE7o, tarifa ou tabela." };
  }
  const source = body && typeof body === "object" ? body : {};
  const solicitante = texto3(solicitanteSessao, 160);
  if (solicitante.length < 2) return { ok: false, error: "Sess\xE3o sem identifica\xE7\xE3o da pessoa." };
  const dataInicio = parseBrazilDateTime(source.dataInicio);
  if (!dataInicio) return { ok: false, error: "Informe a data e a hora de in\xEDcio." };
  const inicioMs = new Date(dataInicio).getTime();
  const hojeCivil = diaCivilBrasil(agora);
  if (diaCivilBrasil(inicioMs) < hojeCivil) return { ok: false, error: "A data de in\xEDcio tem de ser hoje ou um dia \xE0 frente." };
  if (inicioMs > agora + 90 * 24 * 60 * 60 * 1e3) return { ok: false, error: "A data de in\xEDcio passa de 90 dias." };
  const fimInformado = String(source.dataFim ?? "").trim();
  const dataFim = fimInformado ? parseBrazilDateTime(source.dataFim) : null;
  if (fimInformado && !dataFim) return { ok: false, error: "A data de fim n\xE3o foi entendida." };
  if (dataFim && diaCivilBrasil(new Date(dataFim).getTime()) < hojeCivil) {
    return { ok: false, error: "A data de fim tem de ser hoje ou um dia \xE0 frente." };
  }
  const pedido = PEDIDOS_PORTAL.find((item) => item === texto3(source.pedido, 40));
  if (!pedido) return { ok: false, error: "Informe se \xE9 escolta caracterizada ou escolta velada." };
  const agentesNumero = Number(source.agentes);
  const agentes = pedido === "Escolta Velada" && (agentesNumero === 1 || agentesNumero === 2) ? agentesNumero : null;
  if (pedido === "Escolta Velada" && !agentes) return { ok: false, error: "Na escolta velada, informe um ou dois agentes." };
  const missionType = pedido === "Escolta Caracterizada" ? "Caracterizada" : "Velada";
  const origem = texto3(source.origem, 240);
  const destino = texto3(source.destino, 240);
  if (origem.length < 3 || destino.length < 3) return { ok: false, error: "Informe a cidade de origem e a de destino." };
  const operacao = texto3(source.operacao, 160);
  if (operacao.length < 2) return { ok: false, error: "Informe a opera\xE7\xE3o." };
  const identificacao = texto3(source.identificacao, 80);
  const motorista = texto3(source.motorista, 160);
  if (motorista.length < 2) return { ok: false, error: "Informe o motorista." };
  const placa = normalizePlate(source.placa);
  if (!placa || placa.length < 7) return { ok: false, error: "Informe a placa do ve\xEDculo." };
  const telefone = texto3(source.telefone, 30).replace(/[^\d+()\-\s]/g, "");
  if (telefone.replace(/\D/g, "").length < 8) return { ok: false, error: "Informe o telefone." };
  const nomeVigencia = (valor, prefixo) => {
    const limpo = texto3(valor, 180);
    if (!limpo) return null;
    if (!new RegExp(`^${prefixo}: .+ \\(202[67]-\\)$`).test(limpo)) return null;
    return limpo;
  };
  return {
    ok: true,
    value: {
      dataInicio,
      dataFim,
      pedido,
      agentes,
      servico: agentes ? `${pedido} \u2014 ${agentes} ${agentes === 1 ? "agente" : "agentes"}` : pedido,
      missionType,
      origem: origem.toUpperCase(),
      destino: destino.toUpperCase(),
      operacao: operacao.toUpperCase(),
      identificacao: identificacao.toUpperCase(),
      motorista: motorista.toUpperCase(),
      placa,
      telefone,
      solicitante,
      quemAutorizou: opcional(source.quemAutorizou, 160),
      atendimentoPgr: opcional(source.atendimentoPgr, 300),
      contrato: opcional(source.contrato, 160),
      tsp: opcional(source.tsp, 160),
      franquiaHora: null,
      franquiaKm: null,
      nomeLinhaVigencia: nomeVigencia(source.nomeLinhaVigencia, "Tabela"),
      nomeRotaVigencia: nomeVigencia(source.nomeRotaVigencia, "Rota")
    }
  };
}
var PEDIDOS_PORTAL, EMAIL_OPERACIONAL_TMSEG, CHAVES_PRECO, QUANTIDADE_MAXIMA_OS;
var init_pedido = __esm({
  "lib/portalCliente/pedido.ts"() {
    "use strict";
    init_rules();
    PEDIDOS_PORTAL = ["Escolta Caracterizada", "Escolta Velada"];
    EMAIL_OPERACIONAL_TMSEG = "operacional@grupotmseg.com.br";
    CHAVES_PRECO = ["preco", "pre\xE7o", "valor", "revenue", "tabela", "price", "tarifa", "custo"];
    QUANTIDADE_MAXIMA_OS = 20;
  }
});

// lib/routeDistance.ts
function looksLikeLatLngPair(value) {
  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(String(value || "").trim());
}
function googleMapsKeys() {
  return Array.from(new Set([
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.VITE_GOOGLE_MAPS_API_KEY,
    PUBLIC_GOOGLE_MAPS_KEY
  ].map((key) => String(key || "").trim()).filter(Boolean)));
}
function normalizeRouteAddress(address) {
  const trimmed = String(address || "").trim();
  if (!trimmed) return "";
  if (looksLikeLatLngPair(trimmed)) return trimmed.replace(/\s+/g, "");
  return /,\s*brasil\s*$/i.test(trimmed) ? trimmed : `${trimmed}, Brasil`;
}
async function tryDistanceMatrix(origin, destination, key) {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&units=metric&language=pt-BR&region=br&key=${encodeURIComponent(key)}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const el = data?.rows?.[0]?.elements?.[0];
  if (data?.status === "OK" && el?.status === "OK" && el.distance?.value) {
    return {
      success: true,
      distanceKm: Math.round(el.distance.value / 1e3 * 100) / 100,
      durationMin: el.duration?.value ? Math.round(el.duration.value / 60) : null,
      source: "distance_matrix"
    };
  }
  return null;
}
async function tryDirectionsApi(origin, destination, key) {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&language=pt-BR&region=br&key=${encodeURIComponent(key)}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data?.status !== "OK" || !Array.isArray(data.routes) || !data.routes.length) {
    return null;
  }
  const legs = data.routes[0]?.legs || [];
  const totalMeters = legs.reduce((acc, leg) => acc + (leg?.distance?.value || 0), 0);
  const totalSeconds = legs.reduce((acc, leg) => acc + (leg?.duration?.value || 0), 0);
  if (totalMeters <= 0) return null;
  return {
    success: true,
    distanceKm: Math.round(totalMeters / 1e3 * 100) / 100,
    durationMin: totalSeconds > 0 ? Math.round(totalSeconds / 60) : null,
    source: "directions"
  };
}
async function computeRouteDistanceKm(originRaw, destinationRaw) {
  const origin = normalizeRouteAddress(originRaw);
  const destination = normalizeRouteAddress(destinationRaw);
  if (!origin || !destination) {
    return { success: false, error: "origin e destination s\xE3o obrigat\xF3rios" };
  }
  let lastError = "NO_RESULT";
  for (const key of googleMapsKeys()) {
    try {
      const directions = await tryDirectionsApi(origin, destination, key);
      if (directions?.success) return directions;
    } catch (e) {
      lastError = e?.message || lastError;
    }
    try {
      const matrix = await tryDistanceMatrix(origin, destination, key);
      if (matrix?.success) return matrix;
    } catch (e) {
      lastError = e?.message || lastError;
    }
  }
  return { success: false, error: lastError };
}
var PUBLIC_GOOGLE_MAPS_KEY;
var init_routeDistance = __esm({
  "lib/routeDistance.ts"() {
    "use strict";
    PUBLIC_GOOGLE_MAPS_KEY = "AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k";
  }
});

// lib/rotaAprovadaTabela.ts
function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
function pedacoDeCidade(pedaco) {
  const limpo = pedaco.replace(/\s*-\s*[A-Z]{2}$/, "").trim();
  if (limpo.length <= 3 || limpo.length > 40 || /^\d/.test(limpo) || PREFIXO_LOGRADOURO.test(limpo) || NOME_DE_ESTADO.has(limpo)) return "";
  return limpo;
}
function cidadeNoEndereco(endereco) {
  const texto5 = normalizar(endereco);
  const conhecidas = [...TABLE_SPECIFIC_CITY_KEYWORDS].sort((a, b) => b.length - a.length);
  const achou = conhecidas.find((cidade) => texto5.includes(cidade));
  if (achou) return achou;
  const extraida = normalizar(extractCityFromAddress(endereco || ""));
  if (pedacoDeCidade(extraida)) return extraida;
  const partes = texto5.split(",").map((parte) => parte.trim()).filter(Boolean);
  for (const parte of partes) {
    const cidade = pedacoDeCidade(parte);
    if (!cidade) continue;
    if (cidade === "SERRA" && texto5.includes("TABOAO")) continue;
    return cidade;
  }
  return "";
}
function rotaDaOs(origem, destino) {
  const cidadeOrigem = cidadeNoEndereco(origem);
  if (!cidadeOrigem) return null;
  let cidadeDestino = cidadeNoEndereco(destino);
  if (!cidadeDestino) {
    const ufOrigem = extractUF(origem);
    const ufDestino = extractUF(destino);
    if (ufOrigem && ufDestino && ufOrigem === ufDestino) cidadeDestino = cidadeOrigem;
  }
  if (!cidadeDestino) return null;
  return { origem: cidadeOrigem, destino: cidadeDestino };
}
function enderecoNaCidade(endereco, cidade, uf) {
  const texto5 = normalizar(endereco);
  const alvo = normalizar(cidade);
  if (!alvo) return false;
  const palavra = new RegExp(`(?:^|[^A-Z])${alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^A-Z]|$)`);
  if (!palavra.test(texto5)) return false;
  if (alvo === "SERRA" && texto5.includes("TABOAO")) return false;
  const ufEndereco = extractUF(endereco);
  if (uf && ufEndereco && ufEndereco !== uf) return false;
  return true;
}
function osEstaNaRota(osOrigem, osDestino, origem, destino) {
  const rota = rotaDaOs(origem, destino);
  if (!rota) return false;
  const rotaOs = rotaDaOs(osOrigem, osDestino);
  if (rotaOs && rotaOs.origem === rota.origem && rotaOs.destino === rota.destino) return true;
  return enderecoNaCidade(osOrigem, rota.origem, extractUF(origem)) && enderecoNaCidade(osDestino, rota.destino, extractUF(destino));
}
function quilometragemRegistrada(inicio, fim, total) {
  const start = Number(inicio);
  const end = Number(fim);
  if (Number.isFinite(end) && Number.isFinite(start) && end > start && start > 0) return end - start;
  const distancia = Number(total);
  if (Number.isFinite(distancia) && distancia > 0) return distancia;
  return null;
}
function mesmoCliente(candidato, atual) {
  return clientTableMatchesMission(candidato, atual) || clientTableMatchesMission(atual, candidato);
}
function mesmoFornecedor(candidato, atual) {
  const a = normalizar(candidato);
  const b = normalizar(atual);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
function getTopTabelaId(ordens) {
  const contagem = /* @__PURE__ */ new Map();
  for (const os of ordens) {
    const id = os.tabela_id ? String(os.tabela_id) : "";
    if (!id) continue;
    const criado = os.created_at || "";
    const atual = contagem.get(id) || { total: 0, maisRecente: criado };
    contagem.set(id, {
      total: atual.total + 1,
      maisRecente: criado > atual.maisRecente ? criado : atual.maisRecente
    });
  }
  const ordenado = [...contagem.entries()].sort((a, b) => {
    if (b[1].total !== a[1].total) return b[1].total - a[1].total;
    return new Date(b[1].maisRecente).getTime() - new Date(a[1].maisRecente).getTime();
  });
  return ordenado[0]?.[0] || null;
}
function resolverSugestaoTop1(entrada) {
  const vazio = { tabelaClienteSugeridaId: null, tabelaFornecedorSugeridaId: null };
  const rota = rotaDaOs(entrada.origem, entrada.destino);
  if (!rota) return vazio;
  const amostra = entrada.historico.filter((os) => !!os.clientTableId && mesmoCliente(os.cliente, entrada.cliente) && osEstaNaRota(os.origem, os.destino, entrada.origem, entrada.destino));
  if (!amostra.length) return vazio;
  const linhas = (lista, campo) => lista.map((os) => ({ tabela_id: os[campo], created_at: os.aprovadaEm || "" }));
  const fornecedor = String(entrada.fornecedor || "").trim();
  if (fornecedor) {
    const doPar = amostra.filter((os) => mesmoFornecedor(os.fornecedor || "", fornecedor));
    if (doPar.length) {
      return {
        tabelaClienteSugeridaId: getTopTabelaId(linhas(doPar, "clientTableId")),
        tabelaFornecedorSugeridaId: getTopTabelaId(linhas(doPar, "providerTableId"))
      };
    }
  }
  return {
    tabelaClienteSugeridaId: getTopTabelaId(linhas(amostra, "clientTableId")),
    tabelaFornecedorSugeridaId: null
  };
}
var PREFIXO_LOGRADOURO, NOME_DE_ESTADO;
var init_rotaAprovadaTabela = __esm({
  "lib/rotaAprovadaTabela.ts"() {
    "use strict";
    init_financialUtils();
    PREFIXO_LOGRADOURO = /^(RUA|AV|AVENIDA|ROD|RODOVIA|PASSAGEM|TRAVESSA|TV|ALAMEDA|ESTRADA|EST|PRACA|PCA)\b/;
    NOME_DE_ESTADO = /* @__PURE__ */ new Set([
      "ACRE",
      "ALAGOAS",
      "AMAPA",
      "AMAZONAS",
      "BAHIA",
      "CEARA",
      "DISTRITO FEDERAL",
      "ESPIRITO SANTO",
      "GOIAS",
      "MARANHAO",
      "MATO GROSSO",
      "MATO GROSSO DO SUL",
      "MINAS GERAIS",
      "PARA",
      "PARAIBA",
      "PARANA",
      "PERNAMBUCO",
      "PIAUI",
      "RIO DE JANEIRO",
      "RIO GRANDE DO NORTE",
      "RIO GRANDE DO SUL",
      "RONDONIA",
      "RORAIMA",
      "SANTA CATARINA",
      "SAO PAULO",
      "SERGIPE",
      "TOCANTINS",
      "BRASIL",
      "BRAZIL"
    ]);
  }
});

// lib/billing/tabelaNaCriacao.ts
function tokenDoCliente(cliente) {
  return (String(cliente || "").split(/[\s,.\-/]+/).find((parte) => parte.length >= 6) || "").replace(/[^A-Za-z0-9]/g, "");
}
function lerIds(snapshot) {
  let valor = snapshot;
  if (typeof valor === "string") {
    try {
      valor = JSON.parse(valor);
    } catch {
      valor = null;
    }
  }
  if (!valor || typeof valor !== "object") return { clientTableId: null, providerTableId: null };
  const obj = valor;
  return {
    clientTableId: obj.clientTableId ? String(obj.clientTableId) : null,
    providerTableId: obj.providerTableId ? String(obj.providerTableId) : null
  };
}
function mapearHistorico(data) {
  return data.map((row) => {
    const ids = lerIds(row.snapshot_data);
    return {
      id: String(row.id),
      cliente: String(row.client || ""),
      origem: String(row.origin || ""),
      destino: String(row.destination || ""),
      fornecedor: row.provider,
      clientTableId: ids.clientTableId,
      providerTableId: ids.providerTableId,
      aprovadaEm: row.created_at,
      km: quilometragemRegistrada(row.start_km, row.end_km, row.total_distance)
    };
  });
}
async function receitaDaTabelaNaCriacao(sb, cliente, origem, destino, clientTableId) {
  const token = tokenDoCliente(cliente);
  if (!token || !clientTableId) return null;
  const distancia = await computeRouteDistanceKm(origem, destino);
  const km = distancia.success && Number(distancia.distanceKm) > 0 ? Number(distancia.distanceKm) : 0;
  const { data, error } = await sb.from("client_price_tables").select("*").ilike("client", `%${token}%`).limit(200);
  if (error || !Array.isArray(data) || !data.length) return null;
  const fin = calculateMissionFinancials(
    {
      id: "nova",
      client: cliente,
      origin: origem,
      destination: destino,
      status: "Solicitada",
      totalDistance: km,
      provider: ""
    },
    data,
    [],
    void 0,
    /* @__PURE__ */ new Date(),
    { clientTableId }
  );
  const receita = Math.round((Number(fin?.client?.serviceTotal) || 0) * 100) / 100;
  return { receita, km };
}
function destinoBloqueiaSugestao(destino) {
  const texto5 = String(destino || "").trim();
  if (!texto5) return true;
  return /RAIO\b|A DEFINIR|ACOMPANHAMENTO/i.test(texto5);
}
async function fetchTopTabelasSugestao(sb, clienteId, fornecedorId, rotaOrigem, rotaDestino, signal) {
  if (destinoBloqueiaSugestao(rotaDestino)) return SUGESTAO_VAZIA;
  const rota = rotaDaOs(rotaOrigem, rotaDestino);
  const token = tokenDoCliente(clienteId);
  if (!rota || token.length < 4 || !String(rotaOrigem || "").trim()) return SUGESTAO_VAZIA;
  let consulta = sb.from("missions").select(`${COLUNAS_HISTORICO},billing_approved`).eq("billing_approved", true).ilike("client", `%${token}%`).ilike("origin", `%${rota.origem}%`).ilike("destination", `%${rota.destino}%`).not("snapshot_data", "is", null).order("created_at", { ascending: false }).limit(80);
  if (signal && typeof consulta.abortSignal === "function") consulta = consulta.abortSignal(signal);
  const { data, error } = await consulta;
  if (signal?.aborted) return SUGESTAO_VAZIA;
  if (error || !Array.isArray(data)) return SUGESTAO_VAZIA;
  const historico = mapearHistorico(data.filter((row) => row?.billing_approved === true)).filter((os) => !!os.clientTableId && osEstaNaRota(os.origem, os.destino, rotaOrigem, rotaDestino)).slice(0, 10);
  return resolverSugestaoTop1({
    cliente: clienteId,
    fornecedor: fornecedorId,
    origem: rotaOrigem,
    destino: rotaDestino,
    historico
  });
}
var COLUNAS_HISTORICO, SUGESTAO_VAZIA;
var init_tabelaNaCriacao = __esm({
  "lib/billing/tabelaNaCriacao.ts"() {
    "use strict";
    init_financialUtils();
    init_routeDistance();
    init_rotaAprovadaTabela();
    COLUNAS_HISTORICO = "id,origin,destination,client,provider,snapshot_data,created_at,total_distance,start_km,end_km";
    SUGESTAO_VAZIA = { tabelaClienteSugeridaId: null, tabelaFornecedorSugeridaId: null };
  }
});

// lib/portalCliente/numeroOs.ts
function extrairNumeroGtm(id) {
  const match = /^GTM-(\d+)$/i.exec(String(id || "").trim());
  if (!match) return 0;
  const numero4 = Number(match[1]);
  return Number.isSafeInteger(numero4) && numero4 > 0 ? numero4 : 0;
}
function maiorNumeroGtm(ids) {
  let maximo = 0;
  for (const id of ids) {
    const numero4 = extrairNumeroGtm(id);
    if (numero4 > maximo) maximo = numero4;
  }
  return maximo;
}
function formatarIdGtm(numero4) {
  return `GTM-${String(numero4).padStart(4, "0")}`;
}
function funcaoDeNumeroAusente(error) {
  if (!error) return false;
  const codigo = String(error.code || "");
  const texto5 = String(error.message || "").toLowerCase();
  return codigo === "PGRST202" || codigo === "42883" || texto5.includes("proximo_numero_gtm") || texto5.includes("could not find the function") || texto5.includes("schema cache");
}
async function maiorNumeroNaBase(sb) {
  const pagina = await fetchAllPages(
    async (inicio, tamanho) => sb.from("missions").select("id", { count: "exact" }).like("id", "GTM-%").order("id", { ascending: true }).range(inicio, inicio + tamanho - 1),
    1e3,
    5e4,
    { getRowKey: (linha) => linha.id }
  );
  if (!pagina.complete) {
    throw new Error("A leitura dos n\xFAmeros GTM ficou incompleta. A OS n\xE3o foi numerada.");
  }
  return maiorNumeroGtm(pagina.rows.map((linha) => String(linha.id || "")));
}
async function proximoNumeroGtm(sb) {
  if (typeof sb.rpc === "function") {
    const { data, error } = await sb.rpc("proximo_numero_gtm");
    if (!error) {
      const numero4 = Number(data);
      if (Number.isSafeInteger(numero4) && numero4 > 0) return numero4;
      throw new Error("A sequ\xEAncia GTM devolveu um n\xFAmero inv\xE1lido.");
    }
    if (!funcaoDeNumeroAusente(error)) {
      throw new Error(error.message || "N\xE3o foi poss\xEDvel numerar a OS.");
    }
  }
  return await maiorNumeroNaBase(sb) + 1;
}
var init_numeroOs = __esm({
  "lib/portalCliente/numeroOs.ts"() {
    "use strict";
    init_supabasePaging();
  }
});

// lib/portalCliente/registrarOs.ts
var registrarOs_exports = {};
__export(registrarOs_exports, {
  anexarNomesDaCotacao: () => anexarNomesDaCotacao,
  enviarEmailSolicitacao: () => enviarEmailSolicitacao,
  registrarSolicitacaoPortal: () => registrarSolicitacaoPortal
});
function anexarNomesDaCotacao(snapshot, pedido) {
  if (!snapshot) return null;
  const linha = String(pedido.nomeLinhaVigencia || "").trim();
  const rota = String(pedido.nomeRotaVigencia || "").trim();
  if (!linha && !rota) return snapshot;
  return {
    ...snapshot,
    ...linha ? { nomeTabelaCotacao: linha } : {},
    ...rota ? { nomeRotaCotacao: rota } : {}
  };
}
function escapar2(valor) {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function erroDaGravacao(error) {
  const falha = new Error(error.message || "N\xE3o foi poss\xEDvel abrir a OS.");
  if (error.code) falha.code = error.code;
  if (error.details) falha.details = error.details;
  if (error.hint) falha.hint = error.hint;
  return falha;
}
function payloadOs(id, cliente, pedido, solicitante, vehicleId, agora, comValorZero, extras) {
  const receita = extras && extras.receita > 0 ? extras.receita : null;
  const base = {
    id,
    client: cliente,
    provider: null,
    origin: pedido.origem,
    destination: pedido.destino,
    status: "Solicitada",
    last_update: agora,
    created_at: agora,
    updated_by: solicitante,
    start_time: pedido.dataInicio,
    mission_type: pedido.missionType,
    special_operation_type: pedido.servico,
    revenue_value: receita != null ? receita : comValorZero ? 0 : null,
    cost_value: comValorZero ? 0 : null,
    toll_value: null,
    toll_value_provider: null,
    billing_approved: false,
    snapshot_data: anexarNomesDaCotacao(extras?.snapshot || null, pedido),
    snapshot_approved_by: null,
    snapshot_approved_at: null,
    current_location: LOCAL_PORTAL,
    valor_zero_motivo: "AGUARDANDO DEFINI\xC7\xC3O",
    driver_name: pedido.motorista,
    driver_phone: pedido.telefone,
    reference_number: pedido.identificacao,
    client_vehicle: vehicleId
  };
  if (extras && extras.km > 0) base.total_distance = Math.round(extras.km * 100) / 100;
  return base;
}
async function tabelaEValorIniciais(sb, cliente, pedido) {
  try {
    const escolha = await fetchTopTabelasSugestao(sb, cliente, null, pedido.origem, pedido.destino);
    if (!escolha.tabelaClienteSugeridaId) return null;
    const valor = await receitaDaTabelaNaCriacao(sb, cliente, pedido.origem, pedido.destino, escolha.tabelaClienteSugeridaId);
    return {
      receita: valor?.receita || 0,
      km: valor?.km || 0,
      snapshot: snapshotTabelaNaCriacao({ clientTableId: escolha.tabelaClienteSugeridaId })
    };
  } catch (erro) {
    console.warn("[portal] tabela da cria\xE7\xE3o", erro);
    return null;
  }
}
function semColunaOpcional(payload, mensagem) {
  const texto5 = mensagem.toLowerCase();
  const opcionais = ["special_operation_type", "valor_zero_motivo", "billing_approved", "toll_value_provider", "snapshot_approved_by", "snapshot_approved_at", "snapshot_data"];
  const achou = opcionais.find((coluna) => texto5.includes(coluna));
  if (!achou || !Object.prototype.hasOwnProperty.call(payload, achou)) return null;
  const copia = { ...payload };
  delete copia[achou];
  return copia;
}
async function inserirOs(sb, cliente, pedido, solicitante, vehicleId) {
  const agora = (/* @__PURE__ */ new Date()).toISOString();
  const extras = await tabelaEValorIniciais(sb, cliente, pedido);
  let comValorZero = false;
  let numero4 = await proximoNumeroGtm(sb);
  for (let colisao = 0; colisao < 2; colisao += 1) {
    const id = formatarIdGtm(numero4);
    let payload = payloadOs(id, cliente, pedido, solicitante, vehicleId, agora, comValorZero, extras);
    let resultado = await sb.from("missions").insert([payload]);
    for (let ajuste = 0; ajuste < 6 && resultado.error; ajuste += 1) {
      const mensagem = String(resultado.error.message || "");
      if (/revenue_value|cost_value|not-null|null value/i.test(mensagem) && !comValorZero) {
        comValorZero = true;
        payload = payloadOs(id, cliente, pedido, solicitante, vehicleId, agora, true, extras);
        resultado = await sb.from("missions").insert([payload]);
        continue;
      }
      const reduzido = semColunaOpcional(payload, mensagem);
      if (!reduzido) break;
      payload = reduzido;
      resultado = await sb.from("missions").insert([payload]);
    }
    if (!resultado.error) return id;
    if (resultado.error.code === "23505" && colisao === 0) {
      numero4 = await proximoNumeroGtm(sb);
      continue;
    }
    throw erroDaGravacao(resultado.error);
  }
  throw new Error("N\xE3o foi poss\xEDvel numerar a OS.");
}
async function gravarCampos(sb, portal, missionId, pedido) {
  const linha = {
    mission_id: missionId,
    solicitante: pedido.solicitante,
    quem_autorizou: pedido.quemAutorizou,
    servico: pedido.servico,
    atendimento_pgr: pedido.atendimentoPgr,
    contrato: pedido.contrato,
    operacao: pedido.operacao,
    tsp: pedido.tsp,
    placa: pedido.placa,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (portal.clientId != null) linha.client_id = portal.clientId;
  let resultado = await sb.from(portal.tabelas.osCampos).upsert(linha, { onConflict: "mission_id" });
  if (resultado.error && /placa/i.test(String(resultado.error.message || ""))) {
    delete linha.placa;
    resultado = await sb.from(portal.tabelas.osCampos).upsert(linha, { onConflict: "mission_id" });
  }
  if (resultado.error) {
    console.error(`[${portal.logPrefix}] campos da solicita\xE7\xE3o`, resultado.error.message);
  }
}
async function gravarSolicitacao(sb, portal, missionId, pedido, usuario) {
  const linha = {
    mission_id: missionId,
    data_inicio: pedido.dataInicio,
    data_fim: pedido.dataFim,
    solicitante: pedido.solicitante,
    quem_autorizou: pedido.quemAutorizou,
    servico: pedido.servico,
    atendimento_pgr: pedido.atendimentoPgr,
    contrato: pedido.contrato,
    operacao: pedido.operacao,
    tsp: pedido.tsp,
    placa: pedido.placa,
    motorista: pedido.motorista,
    franquia_hora: pedido.franquiaHora,
    franquia_km: pedido.franquiaKm,
    filled_by_user_id: usuario.id,
    filled_by_name: pedido.solicitante,
    filled_by_email: usuario.email
  };
  if (portal.clientId != null) linha.client_id = portal.clientId;
  let resultado = await sb.from(portal.tabelas.solicitacoes).insert(linha);
  if (resultado.error && /mission_id/i.test(String(resultado.error.message || ""))) {
    delete linha.mission_id;
    resultado = await sb.from(portal.tabelas.solicitacoes).insert(linha);
  }
  if (resultado.error) {
    console.error(`[${portal.logPrefix}] fila da solicita\xE7\xE3o`, resultado.error.message);
  }
}
async function enviarEmailSolicitacao(input) {
  const pedido = input.pedido;
  const linhas = [
    ["OS", input.os],
    ["Cliente", input.cliente],
    ["Servi\xE7o", pedido.servico],
    ["Agentes", pedido.agentes ? String(pedido.agentes) : ""],
    ["Origem", pedido.origem],
    ["Destino", pedido.destino],
    ["Opera\xE7\xE3o", pedido.operacao],
    ["Tabela", pedido.nomeLinhaVigencia || ""],
    ["Rota", pedido.nomeRotaVigencia || ""],
    ["Controle interno da OS", pedido.identificacao],
    ["Motorista", pedido.motorista],
    ["Ve\xEDculo", pedido.placa],
    ["Telefone", pedido.telefone],
    ["Solicitante", pedido.solicitante]
  ].filter((par) => Boolean(par[1]));
  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Segoe UI,Arial,sans-serif;color:#333;line-height:1.5">
    <h2>Solicita\xE7\xE3o de escolta \u2014 ${escapar2(input.os)}</h2>
    <p>O portal do cliente abriu uma OS com status <strong>SOLICITADA</strong>, no mesmo formato da cria\xE7\xE3o interna. O fornecedor ainda n\xE3o foi escolhido. O valor fica somente no sistema e n\xE3o aparece para o cliente.</p>
    <table>${linhas.map(([rotulo, valor]) => `<tr><td style="padding:4px 12px 4px 0"><strong>${escapar2(rotulo)}</strong></td><td>${escapar2(valor)}</td></tr>`).join("")}</table>
    <p>Atenciosamente,<br><strong>Grupo TM SEG</strong></p>
  </body></html>`;
  try {
    await sendMail({
      from: SMTP_FROM,
      to: input.destinatarios,
      subject: `Solicita\xE7\xE3o ${input.os} \u2014 ${input.cliente}`,
      html
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[portal] e-mail da solicita\xE7\xE3o", message);
    return false;
  }
}
async function registrarSolicitacaoPortal(sb, portal, pedido, usuario, operationalEmail, clientId, opcoes) {
  const nomeCliente = String(opcoes?.clienteOficial || portal.clienteNome).trim();
  let vehicleId = null;
  if (clientId != null) {
    const veiculo = await sb.from("client_vehicles").select("id, plate").eq("client_id", clientId).ilike("plate", pedido.placa).maybeSingle();
    if (veiculo.data?.id) vehicleId = Number(veiculo.data.id);
  }
  const os = await inserirOs(sb, nomeCliente, pedido, pedido.solicitante, vehicleId);
  await gravarCampos(sb, portal, os, pedido);
  await gravarSolicitacao(sb, portal, os, pedido, usuario);
  try {
    await sb.from("system_logs").insert([{
      user_name: pedido.solicitante,
      action_type: "CREATE",
      entity: "Mission",
      entity_id: os,
      details: JSON.stringify({
        origem: "portal_cliente",
        client: nomeCliente,
        pedido: pedido.pedido,
        agentes: pedido.agentes,
        identificacao: pedido.identificacao
      })
    }]);
  } catch {
  }
  const emailEnviado = opcoes?.enviarEmail === false ? false : await enviarEmailSolicitacao({
    destinatarios: emailsDaSolicitacao(operationalEmail),
    os,
    cliente: nomeCliente,
    pedido
  });
  return { os, emailEnviado };
}
var LOCAL_PORTAL;
var init_registrarOs = __esm({
  "lib/portalCliente/registrarOs.ts"() {
    "use strict";
    init_smtp();
    init_tabelaNaCriacao();
    init_missionSnapshot();
    init_pedido();
    init_numeroOs();
    LOCAL_PORTAL = "Solicita\xE7\xE3o do portal \u2014 aguardando fornecedor";
  }
});

// lib/portalCliente/erroRegistro.ts
var erroRegistro_exports = {};
__export(erroRegistro_exports, {
  corpoErroSolicitacao: () => corpoErroSolicitacao,
  falhaDeRegistro: () => falhaDeRegistro,
  payloadSanitizado: () => payloadSanitizado,
  registrarFalhaSolicitacao: () => registrarFalhaSolicitacao
});
function falhaDeRegistro(error) {
  if (error && typeof error === "object") {
    const bruto = error;
    return {
      message: String(bruto.message || error),
      code: bruto.code ? String(bruto.code) : void 0,
      details: bruto.details ? String(bruto.details) : void 0,
      hint: bruto.hint ? String(bruto.hint) : void 0
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}
function payloadSanitizado(body) {
  if (!body || typeof body !== "object") return {};
  const origem = body;
  const copia = {};
  for (const chave of ["pedido", "agentes", "dataInicio", "dataFim", "origem", "destino", "operacao", "identificacao", "motorista", "placa", "quemAutorizou", "atendimentoPgr", "contrato", "tsp", "quantidade"]) {
    if (origem[chave] != null) copia[chave] = origem[chave];
  }
  return copia;
}
function registrarFalhaSolicitacao(prefixo, error, body) {
  const falha = falhaDeRegistro(error);
  console.error(
    `[${prefixo}] solicita\xE7\xE3o`,
    falha.message,
    falha.code || "",
    falha.details || "",
    falha.hint || "",
    JSON.stringify(payloadSanitizado(body))
  );
  return falha;
}
function corpoErroSolicitacao(error) {
  const falha = falhaDeRegistro(error);
  const corpo2 = {
    error: "N\xE3o foi poss\xEDvel registrar a solicita\xE7\xE3o."
  };
  const mostra = process.env.NODE_ENV !== "production" || falha.code != null && CODIGOS_DE_CONSTRAINT.has(falha.code);
  if (!mostra) return corpo2;
  corpo2.detalhe = falha.message;
  if (falha.code) corpo2.codigo = falha.code;
  if (falha.details) corpo2.campo = falha.details;
  return corpo2;
}
var CODIGOS_DE_CONSTRAINT;
var init_erroRegistro = __esm({
  "lib/portalCliente/erroRegistro.ts"() {
    "use strict";
    CODIGOS_DE_CONSTRAINT = /* @__PURE__ */ new Set(["23505", "23502", "23503", "23514", "22P02", "42703"]);
  }
});

// lib/precificacao/tabela2027.ts
function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function normalizarNomeCliente(nome) {
  return String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
function clienteContratualDhlOuIbl(clientName) {
  const nome = normalizarNomeCliente(clientName);
  if (!nome) return null;
  if (nome.includes("DHL")) return "DHL";
  if (/\bIBL\b/.test(nome) || nome.includes("INTERMODAL BRASIL")) return "IBL";
  return null;
}
function extrairUf(city, state) {
  const direto = String(state || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (direto.length === 2 && UFS.includes(direto)) return direto;
  const texto5 = `${city || ""} ${state || ""}`.toUpperCase();
  const marcas = texto5.match(/(?:^|[\s,/\-])(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?=$|[\s,/\-.])/g);
  if (!marcas?.length) return null;
  return marcas[marcas.length - 1].replace(/[^A-Z]/g, "");
}
function getRegionFromLocation(city, state, clientName) {
  const contratual = clienteContratualDhlOuIbl(clientName);
  const uf = extrairUf(city, state);
  if (contratual) {
    return {
      clienteContratual: true,
      aplicaPrecificacaoRegional: false,
      region: null,
      uf,
      motivo: contratual === "DHL" ? "cliente_dhl" : "cliente_ibl"
    };
  }
  const region = uf ? UF_PARA_REGIAO[uf] || null : null;
  return {
    clienteContratual: false,
    aplicaPrecificacaoRegional: !!region,
    region,
    uf,
    motivo: region ? "uf" : "uf_ausente"
  };
}
function nomeRegiao(region) {
  return FAIXAS_REGIONAIS.find((faixa) => faixa.region === region)?.nome || "";
}
function nomeLinhaPadrao(versao, faixa) {
  return `TABELA ${versao} - ${faixa.nome}`;
}
function arredondarHorasPeloCorte(horasInteiras, minutos) {
  let horas = Math.floor(Number(horasInteiras) || 0);
  let resto = Math.round(Number(minutos) || 0);
  if (resto >= 60) {
    horas += Math.floor(resto / 60);
    resto = resto % 60;
  }
  if (resto < 0) resto = 0;
  if (resto > CORTE_MINUTOS) return horas + 1;
  return horas;
}
function horasDaQuilometragem(totalKm) {
  const km = Math.max(0, Number(totalKm) || 0);
  const brutas = km / KM_POR_HORA;
  let horasInteiras = Math.floor(brutas);
  let minutos = Math.round((brutas - horasInteiras) * 60);
  if (minutos >= 60) {
    horasInteiras += Math.floor(minutos / 60);
    minutos = minutos % 60;
  }
  return {
    horasInteiras,
    minutos,
    horasFaturadas: arredondarHorasPeloCorte(horasInteiras, minutos)
  };
}
function calculateTripCost(totalKm, regionRate) {
  const km = Math.max(0, Number(totalKm) || 0);
  const taxa = Math.max(0, Number(regionRate) || 0);
  const acionamentoMinimo = roundMoney(FRANQUIA_KM * taxa);
  if (km <= FRANQUIA_KM) {
    return {
      totalKm: km,
      kmFaturado: FRANQUIA_KM,
      horasFaturadas: FRANQUIA_HORAS,
      horasInteiras: FRANQUIA_HORAS,
      minutos: 0,
      valor: acionamentoMinimo,
      acionamentoMinimo,
      usouMinimo: true
    };
  }
  const horas = horasDaQuilometragem(km);
  return {
    totalKm: km,
    kmFaturado: km,
    horasFaturadas: Math.max(FRANQUIA_HORAS, horas.horasFaturadas),
    horasInteiras: horas.horasInteiras,
    minutos: horas.minutos,
    valor: roundMoney(km * taxa),
    acionamentoMinimo,
    usouMinimo: false
  };
}
function colunaRegionalAusente(error) {
  if (!error) return false;
  const mensagem = String(error.message || "");
  return error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST205" || error.code === "42P01" || /schema cache|does not exist|Could not find/i.test(mensagem);
}
function cotacaoConvertida(cotacao) {
  if (!cotacao) return false;
  if (String(cotacao.converted_to_order_id || "").trim()) return true;
  return String(cotacao.status || "").trim().toLowerCase() === "convertida";
}
function cotacaoVencida(cotacao, agora = /* @__PURE__ */ new Date()) {
  if (!cotacao || cotacaoConvertida(cotacao)) return false;
  const criada = cotacao.created_at ? new Date(cotacao.created_at) : null;
  if (!criada || Number.isNaN(criada.getTime())) return false;
  return agora.getTime() - criada.getTime() > PRAZO_COTACAO_MS;
}
function numerosDaCotacaoRegional(input) {
  if (input.acordada) return { aplicar: false, motivo: "acordada" };
  const local = getRegionFromLocation(input.origem, "", input.cliente);
  if (local.clienteContratual) return { aplicar: false, motivo: "contratual" };
  const lida = tarifaKmParaOrigem({
    cliente: input.cliente,
    origem: input.origem,
    versao: input.versao,
    linhas: input.linhas
  });
  const usouLinha = lida.tarifaKm != null && Number.isFinite(lida.tarifaKm) && lida.tarifaKm > 0;
  const fallback = Number(input.tarifaKmFallback);
  const taxa = usouLinha ? lida.tarifaKm : Number.isFinite(fallback) && fallback > 0 ? fallback : null;
  const km = Number(input.km);
  if (taxa == null) return { aplicar: false, motivo: "sem_tarifa" };
  if (!Number.isFinite(km) || km < 0) return { aplicar: false, motivo: "sem_km" };
  const horaLida = usouLinha && lida.horaExtra != null && Number.isFinite(lida.horaExtra) ? lida.horaExtra : null;
  const horaFallback = Number(input.horaExtraFallback);
  const vigenciaUsada = usouLinha ? lida.vigenciaUsada || input.versao : input.vigenciaFallback === "2026" || input.vigenciaFallback === "2027" ? input.vigenciaFallback : input.versao;
  return {
    aplicar: true,
    conta: calculateTripCost(km, taxa),
    tarifaKm: taxa,
    horaExtra: horaLida ?? (Number.isFinite(horaFallback) ? horaFallback : null),
    region: lida.region,
    nome: lida.nome || nomeRegiao(lida.region),
    vigenciaUsada
  };
}
function tarifaKmParaOrigem(input) {
  const vazio = { contratual: false, region: null, nome: "", tarifaKm: null, horaExtra: null, vigenciaUsada: null };
  const local = getRegionFromLocation(input.origem, "", input.cliente);
  if (local.clienteContratual) {
    return { ...vazio, contratual: true };
  }
  if (!local.region) return vazio;
  const faixa = FAIXAS_REGIONAIS.find((item) => item.region === local.region);
  if (!faixa) return { ...vazio, region: local.region };
  const ordem = input.versao === "2026" ? ["2026"] : ["2027", "2026"];
  for (const versao of ordem) {
    const nome = nomeLinhaPadrao(versao, faixa);
    const linha = input.linhas.find((item) => String(item.operation_type || "").trim().toUpperCase() === nome.toUpperCase());
    const km = Number(linha?.price_per_extra_km);
    if (!linha || !Number.isFinite(km) || km <= 0) continue;
    const hora = Number(linha.price_per_extra_hour);
    return {
      contratual: false,
      region: local.region,
      nome,
      tarifaKm: km,
      horaExtra: Number.isFinite(hora) ? hora : null,
      vigenciaUsada: versao
    };
  }
  return { ...vazio, region: local.region, nome: nomeLinhaPadrao(input.versao, faixa) };
}
var FRANQUIA_KM, FRANQUIA_HORAS, KM_POR_HORA, CORTE_MINUTOS, FAIXAS_REGIONAIS, UF_PARA_REGIAO, UFS, PRAZO_COTACAO_DIAS, PRAZO_COTACAO_MS;
var init_tabela2027 = __esm({
  "lib/precificacao/tabela2027.ts"() {
    "use strict";
    FRANQUIA_KM = 100;
    FRANQUIA_HORAS = 3;
    KM_POR_HORA = 40;
    CORTE_MINUTOS = 40;
    FAIXAS_REGIONAIS = [
      { region: "sudeste_sp_rj", nome: "SUDESTE SP/RJ", ufs: ["SP", "RJ"], km2026: 6.5, km2027: 6.9, hora2026: 159 },
      { region: "sudeste_mg_es", nome: "SUDESTE MG/ES", ufs: ["MG", "ES"], km2026: 7, km2027: 7.3, hora2026: 169 },
      { region: "sul", nome: "SUL", ufs: ["PR", "SC", "RS"], km2026: 7.5, km2027: 7.5, hora2026: 179 },
      { region: "centro_oeste", nome: "CENTRO-OESTE", ufs: ["MT", "MS", "GO", "DF"], km2026: 8.5, km2027: 8.5, hora2026: 189 },
      { region: "nordeste", nome: "NORDESTE", ufs: ["BA", "SE", "AL", "PE", "PB", "RN", "CE", "PI", "MA"], km2026: 7.3, km2027: 8.3, hora2026: 169 },
      { region: "norte", nome: "NORTE", ufs: ["AM", "RR", "AP", "PA", "TO", "RO", "AC"], km2026: 9, km2027: 10, hora2026: 210 }
    ];
    UF_PARA_REGIAO = {};
    for (const faixa of FAIXAS_REGIONAIS) {
      for (const uf of faixa.ufs) UF_PARA_REGIAO[uf] = faixa.region;
    }
    UFS = Object.keys(UF_PARA_REGIAO);
    PRAZO_COTACAO_DIAS = 10;
    PRAZO_COTACAO_MS = PRAZO_COTACAO_DIAS * 24 * 60 * 60 * 1e3;
  }
});

// lib/portalCliente/cotacao.ts
function regiaoDaOperacao(operacao) {
  const nome = operacao.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^TABELA 20(?:26|27)\s*-\s*/, "");
  if (nome.startsWith("CENTRO-OESTE") || nome.startsWith("CENTRO OESTE")) return "CENTRO-OESTE";
  if (nome.startsWith("NORDESTE")) return "NORDESTE";
  if (nome.startsWith("SUDESTE")) return "SUDESTE";
  if (nome.startsWith("NORTE")) return "NORTE";
  if (nome.startsWith("SUL")) return "SUL";
  return "OUTRAS";
}
function citarFiltroCliente(valor) {
  return /[(),.:]/.test(valor) ? `"${valor.replace(/"/g, '\\"')}"` : valor;
}
function consultaDoCliente(nome) {
  const limpo = String(nome || "").trim();
  if (!limpo) return "client.eq.";
  const palavras = limpo.split(/\s+/).filter((parte) => !PARADA_NOME.includes(parte.toUpperCase()));
  const curto = palavras.length >= 2 ? `${palavras[0]} ${palavras[1].slice(0, Math.min(6, palavras[1].length))}` : palavras[0] || limpo;
  return `client.eq.${citarFiltroCliente(limpo)},client.ilike.${citarFiltroCliente(`%${curto}%`)}`;
}
function numero(valor) {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function centavos2(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
function tabelaDeLinha(row) {
  const operacao = String(row.operation_type || "").trim();
  if (!operacao) return null;
  return {
    id: String(row.id || operacao),
    operacao,
    regiao: regiaoDaOperacao(operacao),
    acionamento: numero(row.activation_fee),
    franquiaHoras: numero(row.franchise_hours),
    franquiaKm: numero(row.franchise_km),
    kmExtra: numero(row.price_per_extra_km),
    horaExtra: numero(row.price_per_extra_hour)
  };
}
function horasDaRota(kmRota) {
  const percorrido = Math.max(0, kmRota);
  const kmCheio = percorrido > 0 ? Math.ceil(percorrido - 1e-9) : 0;
  const km = Math.max(KM_MINIMO_COTACAO, kmCheio);
  const brutas = km / KM_POR_HORA_COTACAO;
  const horas = Math.max(HORAS_MINIMAS_COTACAO, Math.ceil(brutas - 1e-9));
  return { kmRota: percorrido, km, horas };
}
function cidadeDaRota(endereco) {
  const parte = endereco.split(",")[0]?.split("-")[0] || endereco;
  return parte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9 ]/gi, " ").replace(/\s+/g, " ").trim().toUpperCase();
}
function mesmaRota(operacao, origem, destino) {
  const nome = operacao.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const saida = cidadeDaRota(origem);
  const chegada = cidadeDaRota(destino);
  if (saida.length < 3 || chegada.length < 3) return false;
  return nome.includes(`${saida} X ${chegada}`);
}
function rotaAcordada(lista, regiao, origem, destino) {
  const achados = lista.filter((item) => item.regiao === regiao && mesmaRota(item.operacao, origem, destino) && !/AUTO_MASTER/i.test(item.operacao));
  if (!achados.length) return null;
  return [...achados].sort((a, b) => a.operacao.length - b.operacao.length)[0];
}
function contaVisivelDaCotacao(input) {
  const regional = numerosDaCotacaoRegional(input);
  if (!regional.aplicar) return { aplicar: false };
  return {
    aplicar: true,
    kmRodado: Math.max(0, Number(input.km) || 0),
    kmFaturado: regional.conta.kmFaturado,
    horasFaturadas: regional.conta.horasFaturadas,
    franquiaKm: FRANQUIA_KM,
    franquiaHoras: FRANQUIA_HORAS,
    tarifaKm: regional.tarifaKm,
    horaExtra: regional.horaExtra ?? 0,
    total: regional.conta.valor,
    usouMinimo: regional.conta.usouMinimo,
    regiao: nomeRegiao(regional.region) || regional.nome,
    vigencia: regional.vigenciaUsada
  };
}
function aplicarContaNaProposta(proposta, conta) {
  if (!conta.aplicar || proposta.acordada) return proposta;
  return {
    ...proposta,
    acionamento: conta.total,
    kmFranquia: conta.franquiaKm,
    horasFranquia: conta.franquiaHoras,
    kmExtra: conta.tarifaKm,
    horaExtra: conta.horaExtra,
    kmFaturado: conta.kmFaturado,
    horasContadas: conta.horasFaturadas,
    regiao: conta.regiao || proposta.regiao,
    vigencia: conta.vigencia,
    kmRota: conta.kmRodado
  };
}
function numerosDaTela(proposta) {
  const kmFaturado = proposta.kmFaturado != null && proposta.kmFaturado > 0 ? proposta.kmFaturado : proposta.kmFranquia;
  const horas = proposta.horasContadas != null && proposta.horasContadas > 0 ? proposta.horasContadas : proposta.horasFranquia;
  const pernoite = proposta.pernoite != null && Number.isFinite(proposta.pernoite) && proposta.pernoite > 0 ? proposta.pernoite : null;
  const incluidaDiferente = proposta.kmFaturado != null && proposta.kmFaturado > 0 && proposta.kmFranquia !== proposta.kmFaturado || proposta.horasContadas != null && proposta.horasContadas > 0 && proposta.horasFranquia !== proposta.horasContadas;
  return {
    total: proposta.acionamento,
    kmFaturado,
    horas,
    franquiaKm: proposta.kmFranquia,
    franquiaHoras: proposta.horasFranquia,
    kmExtra: proposta.kmExtra,
    horaExtra: proposta.horaExtra,
    pernoite,
    mostraFranquiaIncluida: incluidaDiferente
  };
}
function propostaDaConta(entrada) {
  const paradas = entrada.paradas.map((item) => item.trim()).filter(Boolean);
  if (entrada.conta.aplicar) {
    return {
      ...aplicarContaNaProposta({
        acordada: false,
        regiao: entrada.regiao,
        origem: entrada.origem,
        destino: entrada.destino,
        paradas,
        acionamento: 0,
        kmFranquia: 0,
        horasFranquia: 0,
        kmExtra: 0,
        horaExtra: 0,
        operacao: `${entrada.regiao} - ${cidadeDaRota(entrada.origem)} X ${cidadeDaRota(entrada.destino)}`
      }, entrada.conta),
      duracaoMin: entrada.duracaoMin ?? null
    };
  }
  const acordada = paradas.length ? null : rotaAcordada(entrada.tabelas, entrada.regiao, entrada.origem, entrada.destino);
  if (acordada) {
    return {
      acordada: true,
      regiao: entrada.regiao,
      origem: entrada.origem,
      destino: entrada.destino,
      paradas,
      acionamento: acordada.acionamento,
      kmFranquia: acordada.franquiaKm,
      horasFranquia: acordada.franquiaHoras,
      kmExtra: acordada.kmExtra,
      horaExtra: acordada.horaExtra,
      operacao: acordada.operacao,
      kmRota: entrada.kmRota,
      duracaoMin: entrada.duracaoMin ?? null
    };
  }
  const base = montarProposta({
    tabelas: entrada.tabelas,
    regiao: entrada.regiao,
    origem: entrada.origem,
    destino: entrada.destino,
    paradas,
    kmRota: entrada.kmRota,
    tabelaRegiao: entrada.tabelaRegiao
  });
  return { ...base, kmRota: entrada.kmRota, duracaoMin: entrada.duracaoMin ?? base.duracaoMin ?? null };
}
function lugarDaProposta(endereco) {
  const parte = String(endereco || "").split(",")[0]?.trim() || "";
  return parte || "\u2014";
}
function rotulosSemAno(origem, destino) {
  const trecho = `${lugarDaProposta(origem)} x ${lugarDaProposta(destino)}`;
  return { tabela: `Tabela: ${trecho}`, rota: `Rota: ${trecho}` };
}
function montarProposta(entrada) {
  const paradas = entrada.paradas.map((item) => item.trim()).filter(Boolean);
  const acordada = paradas.length ? null : rotaAcordada(entrada.tabelas, entrada.regiao, entrada.origem, entrada.destino);
  if (acordada) {
    return {
      acordada: true,
      regiao: entrada.regiao,
      origem: entrada.origem,
      destino: entrada.destino,
      paradas,
      acionamento: acordada.acionamento,
      kmFranquia: acordada.franquiaKm,
      horasFranquia: acordada.franquiaHoras,
      kmExtra: acordada.kmExtra,
      horaExtra: acordada.horaExtra,
      operacao: acordada.operacao
    };
  }
  const conta = calcularCotacaoPortal(entrada.tabelaRegiao, entrada.kmRota);
  return {
    acordada: false,
    regiao: entrada.regiao,
    origem: entrada.origem,
    destino: entrada.destino,
    paradas,
    acionamento: conta.total,
    kmFranquia: conta.km,
    horasFranquia: conta.horas,
    kmExtra: entrada.tabelaRegiao.kmExtra,
    horaExtra: entrada.tabelaRegiao.horaExtra,
    operacao: `${entrada.regiao} - ${cidadeDaRota(entrada.origem)} X ${cidadeDaRota(entrada.destino)}`
  };
}
function calcularCotacaoPortal(tabela, kmRota) {
  const base = horasDaRota(kmRota);
  const kmExtra = Math.max(0, centavos2(base.km - tabela.franquiaKm));
  const horasExtra = Math.max(0, base.horas - tabela.franquiaHoras);
  const valorKm = centavos2(kmExtra * tabela.kmExtra);
  const valorHoras = centavos2(horasExtra * tabela.horaExtra);
  const acionamento = centavos2(tabela.acionamento);
  return {
    kmRota: base.kmRota,
    km: base.km,
    horas: base.horas,
    kmExtra,
    horasExtra,
    valorKm,
    valorHoras,
    acionamento,
    total: centavos2(acionamento + valorKm + valorHoras)
  };
}
function moda(valores) {
  const contagem = /* @__PURE__ */ new Map();
  for (const valor of valores) contagem.set(valor, (contagem.get(valor) || 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}
function valoresDaRegiao(lista) {
  const semMotor = lista.filter((item) => !/AUTO_MASTER/i.test(item.operacao) && item.kmExtra > 0);
  const piso = semMotor.filter((item) => item.franquiaKm === KM_MINIMO_COTACAO && item.franquiaHoras === HORAS_MINIMAS_COTACAO);
  const pool = piso.length ? piso : semMotor;
  if (!pool.length) return null;
  const porKm = /* @__PURE__ */ new Map();
  for (const item of pool) {
    const chave = centavos2(item.kmExtra);
    porKm.set(chave, [...porKm.get(chave) || [], item]);
  }
  const grupo = [...porKm.values()].sort((a, b) => b.length - a.length || a[0].kmExtra - b[0].kmExtra)[0];
  const regiao = grupo[0].regiao;
  return {
    id: regiao,
    operacao: regiao,
    regiao,
    acionamento: moda(grupo.map((item) => item.acionamento)),
    franquiaHoras: HORAS_MINIMAS_COTACAO,
    franquiaKm: KM_MINIMO_COTACAO,
    kmExtra: centavos2(grupo[0].kmExtra),
    horaExtra: moda(grupo.map((item) => item.horaExtra))
  };
}
var KM_MINIMO_COTACAO, HORAS_MINIMAS_COTACAO, KM_POR_HORA_COTACAO, PARADA_NOME;
var init_cotacao = __esm({
  "lib/portalCliente/cotacao.ts"() {
    "use strict";
    init_tabela2027();
    KM_MINIMO_COTACAO = 100;
    HORAS_MINIMAS_COTACAO = 3;
    KM_POR_HORA_COTACAO = 40;
    PARADA_NOME = ["LTDA", "LTDA.", "S.A.", "S.A", "SA", "S/A", "S/A.", "DO", "DE", "DA", "E", "DAS", "DOS"];
  }
});

// lib/portalCliente/trechosProposta.ts
function moeda(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pisoRegional2027(origem, cliente) {
  if (clienteContratualDhlOuIbl(cliente)) return null;
  const local = getRegionFromLocation(origem, "", cliente);
  if (!local.region) return null;
  const faixa = FAIXAS_REGIONAIS.find((item) => item.region === local.region);
  if (!faixa) return null;
  return {
    regiao: nomeRegiao(faixa.region),
    acionamento: roundMoney(FRANQUIA_KM * faixa.km2027),
    kmExtra: faixa.km2027,
    horaExtra: faixa.hora2026
  };
}
function mensagemAbaixoDoPiso(valores, piso) {
  const falhas = [];
  const km = Number(valores.kmExtra);
  const hora = Number(valores.horaExtra);
  const acionamento = Number(valores.acionamento);
  if (Number.isFinite(km) && km > 0 && km + 1e-3 < piso.kmExtra) {
    falhas.push(`km extra abaixo de ${moeda(piso.kmExtra)}`);
  }
  if (Number.isFinite(hora) && hora > 0 && hora + 1e-3 < piso.horaExtra) {
    falhas.push(`hora extra abaixo de ${moeda(piso.horaExtra)}`);
  }
  if (Number.isFinite(acionamento) && acionamento > 0 && acionamento + 0.01 < piso.acionamento) {
    falhas.push(`acionamento abaixo de ${moeda(piso.acionamento)}`);
  }
  if (!falhas.length) return null;
  return `Abaixo do piso 2027 de ${piso.regiao}: ${falhas.join("; ")}. S\xF3 \xE9 poss\xEDvel aumentar.`;
}
function recusarPisoDaProposta(entrada) {
  if (entrada.acordada || entrada.vigencia !== "2027") return null;
  const piso = pisoRegional2027(entrada.origem, entrada.cliente);
  if (!piso) return null;
  return mensagemAbaixoDoPiso(entrada, piso);
}
function excedenteDoTrecho(km, taxa) {
  const conta = calculateTripCost(km, taxa);
  return {
    kmFaturado: conta.kmFaturado,
    horas: conta.horasFaturadas,
    kmExcedente: conta.usouMinimo ? 0 : roundMoney(Math.max(0, conta.kmFaturado - FRANQUIA_KM)),
    horasExcedentes: Math.max(0, conta.horasFaturadas - FRANQUIA_HORAS),
    valor: conta.valor,
    usouMinimo: conta.usouMinimo
  };
}
function somarTrechos(trechos) {
  return trechos.reduce((soma, trecho) => ({
    total: roundMoney(soma.total + trecho.valor),
    km: roundMoney(soma.km + trecho.km),
    kmFaturado: roundMoney(soma.kmFaturado + trecho.kmFaturado),
    horas: soma.horas + trecho.horas,
    kmExcedente: roundMoney(soma.kmExcedente + trecho.kmExcedente),
    horasExcedentes: soma.horasExcedentes + trecho.horasExcedentes
  }), { total: 0, km: 0, kmFaturado: 0, horas: 0, kmExcedente: 0, horasExcedentes: 0 });
}
function textoTrecho(valor, limite) {
  return String(valor || "").trim().slice(0, limite);
}
function conferirTrechosGravados(bruto, cliente, vigencia) {
  if (!Array.isArray(bruto) || bruto.length === 0) return { ok: false, error: "Informe ao menos um trecho." };
  if (bruto.length > LIMITE_TRECHOS_PROPOSTA) return { ok: false, error: `A proposta aceita at\xE9 ${LIMITE_TRECHOS_PROPOSTA} trechos.` };
  const trechos = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") return { ok: false, error: "Trecho inv\xE1lido." };
    const registro = item;
    const origem = textoTrecho(registro.origem, 300);
    const destino = textoTrecho(registro.destino, 300);
    const km = Number(registro.km);
    const kmExtra = Number(registro.kmExtra);
    const horaExtra = Number(registro.horaExtra);
    const valor = Number(registro.valor);
    if (!origem || !destino || !Number.isFinite(km) || km <= 0) return { ok: false, error: "Trecho sem origem, destino ou km." };
    if (!Number.isFinite(kmExtra) || kmExtra <= 0 || !Number.isFinite(horaExtra) || horaExtra <= 0 || !Number.isFinite(valor) || valor <= 0) {
      return { ok: false, error: "Trecho sem acionamento, km extra ou hora extra." };
    }
    if (vigencia === "2027") {
      const piso = pisoRegional2027(origem, cliente);
      const aviso = piso ? mensagemAbaixoDoPiso({ acionamento: valor, kmExtra, horaExtra }, piso) : null;
      if (aviso) return { ok: false, error: aviso };
    }
    const conta = excedenteDoTrecho(km, kmExtra);
    if (valor + 0.02 < conta.valor) return { ok: false, error: "O total do trecho ficou abaixo da tabela vigente." };
    trechos.push({
      origem,
      destino,
      km: roundMoney(km),
      kmFaturado: conta.kmFaturado,
      horas: conta.horas,
      kmExcedente: conta.kmExcedente,
      horasExcedentes: conta.horasExcedentes,
      kmExtra: roundMoney(kmExtra),
      horaExtra: roundMoney(horaExtra),
      valor: roundMoney(valor),
      regiao: textoTrecho(registro.regiao, 80),
      usouMinimo: conta.usouMinimo
    });
  }
  const soma = somarTrechos(trechos);
  return { ok: true, trechos, total: soma.total, km: soma.km, horas: soma.horas };
}
function lerTrechosPersistidos(bruto) {
  const lido = conferirTrechosGravados(bruto, "", "2026");
  if (!lido.ok) return null;
  return lido.trechos;
}
var LIMITE_TRECHOS_PROPOSTA;
var init_trechosProposta = __esm({
  "lib/portalCliente/trechosProposta.ts"() {
    "use strict";
    init_tabela2027();
    LIMITE_TRECHOS_PROPOSTA = 8;
  }
});

// lib/portalCliente/apresentacao.ts
function marcoDeOperacoes(total) {
  if (!Number.isFinite(total) || total < 1e3) return null;
  const mil = Math.floor(total / 1e3);
  if (mil < 1) return null;
  return total === mil * 1e3 ? `${mil} mil` : `${mil} mil+`;
}
function numerosDaProposta(operacoes) {
  if (!operacoes) return NUMEROS_TMSEG;
  return NUMEROS_TMSEG.map((item) => item.rotulo === "Opera\xE7\xF5es realizadas" ? { valor: operacoes, rotulo: item.rotulo } : item);
}
function escaparHtml(valor) {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function linhasDaTabelaEmail(proposta) {
  const tela = numerosDaTela(proposta);
  const minutos = proposta.duracaoMin != null && proposta.duracaoMin > 0 ? Math.round(proposta.duracaoMin) : 0;
  const horasViagem = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const tempo = minutos <= 0 ? "" : horasViagem <= 0 ? `${resto} min` : `${horasViagem}h ${String(resto).padStart(2, "0")}min`;
  const linhas = [
    { rotulo: "Origem", valor: proposta.origem || "\u2014" },
    { rotulo: "Destino", valor: proposta.destino || "\u2014" },
    { rotulo: "Dist\xE2ncia estimada", valor: proposta.kmRota != null && proposta.kmRota > 0 ? `${quantidade(proposta.kmRota)} km` : "\u2014" }
  ];
  if (tempo) linhas.push({ rotulo: "Tempo de viagem", valor: tempo });
  linhas.push(
    { rotulo: "Regi\xE3o", valor: proposta.regiao || "\u2014" },
    { rotulo: "Franquia de km inclu\xEDda", valor: `${quantidade(tela.franquiaKm)} km` },
    { rotulo: "Franquia de horas inclu\xEDda", valor: `${quantidade(tela.franquiaHoras)} h` },
    { rotulo: "Valor do km extra", valor: moeda2(tela.kmExtra) },
    { rotulo: "Valor da hora extra", valor: moeda2(tela.horaExtra) }
  );
  if (proposta.kmFaturado != null && proposta.kmFaturado > 0) {
    linhas.push({ rotulo: "Km faturado", valor: `${quantidade(proposta.kmFaturado)} km` });
  }
  if (proposta.horasContadas != null && proposta.horasContadas > 0) {
    linhas.push({ rotulo: "Horas consideradas", valor: `${quantidade(proposta.horasContadas)} h` });
  }
  if (tela.pernoite != null) linhas.push({ rotulo: "Pernoite", valor: moeda2(tela.pernoite) });
  linhas.push(
    { rotulo: "Valor total da cota\xE7\xE3o", valor: moeda2(tela.total) },
    { rotulo: "Validade da proposta", valor: "10 dias" },
    { rotulo: "Condi\xE7\xF5es de pagamento", valor: CONDICAO_PAGAMENTO },
    { rotulo: "Ped\xE1gio", valor: AVISO_PEDAGIO }
  );
  return linhas;
}
function regiaoLegivel(regiao) {
  const nome = regiao.trim().toLowerCase();
  if (nome === "sudeste") return "Sudeste";
  if (nome === "nordeste") return "Nordeste";
  if (nome === "norte") return "Norte";
  if (nome === "sul") return "Sul";
  if (nome === "centro-oeste") return "Centro-Oeste";
  return regiao.trim();
}
function caminhoDaProposta(proposta) {
  return [proposta.origem, ...proposta.paradas, proposta.destino].filter(Boolean).join(" \u2192 ");
}
function moeda2(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function quantidade(valor) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
function condicoesDaProposta(proposta) {
  return [
    proposta.acordada ? "Esta rota j\xE1 est\xE1 acordada na tabela do cliente." : `Regi\xE3o ${regiaoLegivel(proposta.regiao)}.`,
    `Acionamento: ${moeda2(proposta.acionamento)}.`,
    `A franquia contempla ${quantidade(proposta.kmFranquia)} km e ${quantidade(proposta.horasFranquia)} horas.`,
    `Acima da franquia, o quil\xF4metro extra custa ${moeda2(proposta.kmExtra)} e a hora extra custa ${moeda2(proposta.horaExtra)}.`,
    proposta.kmRota != null && proposta.kmRota > 0 ? `Km da rota: ${quantidade(proposta.kmRota)} km.` : "",
    proposta.duracaoMin != null && proposta.duracaoMin > 0 ? `Tempo: ${Math.round(proposta.duracaoMin)} min.` : "",
    rotulosSemAno(proposta.origem, proposta.destino).tabela,
    rotulosSemAno(proposta.origem, proposta.destino).rota,
    AVISO_PEDAGIO
  ].filter(Boolean);
}
function cartaDaProposta(proposta, operacoes, link) {
  const servicos = SERVICOS_TMSEG.map((item) => `${item.titulo}. ${item.texto}`).join("\n");
  return [
    MARCA_TMSEG.nome,
    "Proposta comercial de escolta",
    MARCA_TMSEG.chamada,
    "",
    MARCA_TMSEG.quem,
    MARCA_TMSEG.missao,
    "",
    "Rota",
    caminhoDaProposta(proposta),
    "",
    ...proposta.trechos && proposta.trechos.length > 1 ? [
      "Trechos",
      ...proposta.trechos.map((trecho, indice) => `${indice + 1}. ${trecho.origem} \u2192 ${trecho.destino}: ${moeda2(trecho.valor)}. Excedente ${quantidade(trecho.kmExcedente)} km e ${quantidade(trecho.horasExcedentes)} h.`),
      `Total dos trechos: ${moeda2(proposta.trechos.reduce((soma, trecho) => soma + trecho.valor, 0))}.`,
      ""
    ] : [],
    ...condicoesDaProposta(proposta),
    "",
    "Servi\xE7os",
    servicos,
    "",
    "N\xFAmeros do site",
    numerosDaProposta(operacoes).map((item) => `${item.valor} ${item.rotulo}`).join("\n"),
    "",
    "Diferenciais",
    DIFERENCIAIS_TMSEG.map((item) => `${item.titulo}. ${item.texto}`).join("\n"),
    "",
    "Empresas que operam com a TM SEG",
    CLIENTES_TMSEG.map((item) => item.nome).join(", "),
    "",
    link ? `Acessar Proposta Comercial: ${link}` : "A proposta completa segue em anexo, com o mapa da rota.",
    "",
    "Acionamento da rota",
    ...linhasDaTabelaEmail(proposta).map((item) => `${item.rotulo}: ${item.valor}`),
    "",
    MARCA_TMSEG.telefone,
    MARCA_TMSEG.endereco,
    MARCA_TMSEG.sitio
  ].join("\n");
}
function htmlDaProposta(proposta, operacoes, link) {
  const linhas = linhasDaTabelaEmail(proposta).map((item) => `<tr><td style="padding:8px 10px;border-bottom:1px solid #e7e1d6;color:#5c564e;">${escaparHtml(item.rotulo)}</td><td style="padding:8px 10px;border-bottom:1px solid #e7e1d6;font-weight:700;color:#161513;">${escaparHtml(item.valor)}</td></tr>`).join("");
  const texto5 = escaparHtml(cartaDaProposta(proposta, operacoes, link)).replace(/\n/g, "<br>");
  const botao = link ? `<p style="margin:20px 0;"><a href="${escaparHtml(link)}" style="display:inline-block;background:#d0121a;color:#ffffff;padding:12px 18px;border-radius:999px;font-weight:700;text-decoration:none;">Acessar Proposta Comercial</a></p>` : "";
  return [
    '<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;background:#f7f5f2;color:#161513;">',
    '<div style="max-width:640px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;">',
    `<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#d0121a;">${escaparHtml(MARCA_TMSEG.nome)}</p>`,
    '<h1 style="margin:0 0 16px;font-size:22px;">Proposta comercial de escolta</h1>',
    botao,
    '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;">',
    linhas,
    "</table>",
    `<div style="margin-top:20px;font-size:14px;line-height:1.5;">${texto5}</div>`,
    "</div></body></html>"
  ].join("");
}
var MARCA_TMSEG, NUMEROS_TMSEG, SERVICOS_TMSEG, DIFERENCIAIS_TMSEG, CLIENTES_TMSEG, AVISO_PEDAGIO, CONDICAO_PAGAMENTO;
var init_apresentacao = __esm({
  "lib/portalCliente/apresentacao.ts"() {
    "use strict";
    init_cotacao();
    init_trechosProposta();
    MARCA_TMSEG = {
      nome: "Grupo TM SEG",
      chamada: "A carga protegida em cada quil\xF4metro.",
      sitio: "www.grupotmseg.com.br",
      telefone: "+55 11 91689-3018",
      endereco: "Av. Parada Pinto, 737, Vila Nova Cachoeirinha, S\xE3o Paulo, SP",
      quem: "O Grupo TM SEG intermedia escolta armada, consultoria de GR, regula\xE7\xE3o e acompanhamento log\xEDstico em todo o territ\xF3rio nacional. A execu\xE7\xE3o em campo fica com empresas homologadas, com alvar\xE1 ativo na Pol\xEDcia Federal.",
      missao: "A miss\xE3o \xE9 ligar o cliente a profissionais e empresas do setor, com efici\xEAncia, confiabilidade e o padr\xE3o de seguran\xE7a da opera\xE7\xE3o."
    };
    NUMEROS_TMSEG = [
      { valor: "500+", rotulo: "Opera\xE7\xF5es realizadas" },
      { valor: "24/7", rotulo: "Atendimento" },
      { valor: "100%", rotulo: "Compromisso" },
      { valor: "50+", rotulo: "Parceiros ativos" }
    ];
    SERVICOS_TMSEG = [
      { titulo: "Fiscal de rota", foto: "/proposta-tmseg/service-fiscal-rota.png", texto: "Monitoramento e inspe\xE7\xE3o cont\xEDnua das rotas de transporte, com conformidade, seguran\xE7a e controle da opera\xE7\xE3o log\xEDstica." },
      { titulo: "Intermedia\xE7\xE3o de escolta armada", foto: "/proposta-tmseg/service-escolta.png", texto: "Intermedia\xE7\xE3o de escolta armada com empresas homologadas e com alvar\xE1 ativo na Pol\xEDcia Federal, para o transporte de cargas." },
      { titulo: "Acompanhamento log\xEDstico", foto: "/proposta-tmseg/service-acompanhamento.png", texto: "Monitoramento da opera\xE7\xE3o, com rastreamento e gest\xE3o do transporte por equipe especializada." },
      { titulo: "Guincho", foto: "/proposta-tmseg/service-guincho.png", texto: "Guincho para situa\xE7\xF5es emergenciais, com remo\xE7\xE3o e transporte de ve\xEDculos e cargas." }
    ];
    DIFERENCIAIS_TMSEG = [
      { titulo: "Compromisso com a seguran\xE7a", texto: "A prioridade \xE9 a prote\xE7\xE3o dos ativos e a tranquilidade da opera\xE7\xE3o, com solu\xE7\xE3o adequada a cada carga." },
      { titulo: "Fiscal de rota personalizado", texto: "Inspe\xE7\xE3o e fiscaliza\xE7\xE3o do trajeto, com acompanhamento de cada etapa do transporte." },
      { titulo: "Caracteriza\xE7\xE3o e rastreamento", texto: "Caracteriza\xE7\xE3o e rastreamento para monitoramento da carga em cada etapa." },
      { titulo: "Escolta especializada", texto: "Intermedia\xE7\xE3o com empresas de escolta armada homologadas e com alvar\xE1 ativo na Pol\xEDcia Federal." }
    ];
    CLIENTES_TMSEG = [
      { nome: "Claro", logo: "/proposta-tmseg/clientes/claro.png" },
      { nome: "HP", logo: "/proposta-tmseg/clientes/hp.png" },
      { nome: "Amazon Transportes", logo: "/proposta-tmseg/clientes/amazon-transportes.png" },
      { nome: "DHL", logo: "/proposta-tmseg/clientes/dhl.png" },
      { nome: "CEVA", logo: "/proposta-tmseg/clientes/ceva.png" },
      { nome: "Kodex", logo: "/proposta-tmseg/clientes/kodex.png" },
      { nome: "Trans Pacheco", logo: "/proposta-tmseg/clientes/transpacheco.png" },
      { nome: "Techtrans", logo: "/proposta-tmseg/clientes/techtrans.png" },
      { nome: "Luft", logo: "/proposta-tmseg/clientes/luft.png" },
      { nome: "IBL", logo: "/proposta-tmseg/clientes/ibl.png" },
      { nome: "Ceslog", logo: "/proposta-tmseg/clientes/ceslog.png" },
      { nome: "Comolatti", logo: "/proposta-tmseg/clientes/comolatti.png" },
      { nome: "Mercado Livre", logo: "/proposta-tmseg/clientes/mercadolivre.png" }
    ];
    AVISO_PEDAGIO = "O custo do ped\xE1gio ser\xE1 cobrado \xE0 parte, conforme o percurso realizado.";
    CONDICAO_PAGAMENTO = "15 dias ap\xF3s o t\xE9rmino da quinzena, com nota fiscal e boleto.";
  }
});

// lib/dateUtils.ts
function dataCivilBR(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function partesBR(d, tipo) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(d);
  return parts.find((p) => p.type === tipo)?.value || "";
}
function toDate(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
var TMSEG_TIMEZONE, TZ, formatDateBR, formatDateTimeBR;
var init_dateUtils = __esm({
  "lib/dateUtils.ts"() {
    "use strict";
    TMSEG_TIMEZONE = "America/Sao_Paulo";
    TZ = TMSEG_TIMEZONE;
    formatDateBR = (date) => {
      if (typeof date === "string") {
        const civil = dataCivilBR(date);
        if (civil) return civil;
      }
      const d = toDate(date);
      if (!d) return "\u2014";
      return `${partesBR(d, "day")}/${partesBR(d, "month")}/${partesBR(d, "year")}`;
    };
    formatDateTimeBR = (date) => {
      if (typeof date === "string") {
        const civil = dataCivilBR(date);
        if (civil) return civil;
      }
      const d = toDate(date);
      if (!d) return "\u2014";
      const hora = partesBR(d, "hour").padStart(2, "0");
      const minuto = partesBR(d, "minute").padStart(2, "0");
      return `${partesBR(d, "day")}/${partesBR(d, "month")}/${partesBR(d, "year")} ${hora}:${minuto}`;
    };
  }
});

// lib/portalCliente/gestaoCotacao.ts
var gestaoCotacao_exports = {};
__export(gestaoCotacao_exports, {
  COPIA_FIXA_COTACAO: () => COPIA_FIXA_COTACAO,
  STATUS_EXCLUIDA: () => STATUS_EXCLUIDA,
  STATUS_INATIVA: () => STATUS_INATIVA,
  autorDaCotacao: () => autorDaCotacao,
  cartaEmailCotacao: () => cartaEmailCotacao,
  clienteDaMesmaCasa: () => clienteDaMesmaCasa,
  cotacaoConvertidaEmOs: () => cotacaoConvertidaEmOs,
  cotacaoExcluida: () => cotacaoExcluida,
  decisaoExcluir: () => decisaoExcluir,
  decisaoInativar: () => decisaoInativar,
  ehDiretoria: () => ehDiretoria,
  emailDestinoValido: () => emailDestinoValido,
  emailsDaCopia: () => emailsDaCopia,
  montarDestinatariosEnvio: () => montarDestinatariosEnvio,
  mostrarDesativarCotacao: () => mostrarDesativarCotacao,
  mostrarExcluirCotacao: () => mostrarExcluirCotacao,
  pdfAnexoAceito: () => pdfAnexoAceito,
  perfilPodeGerirCotacao: () => perfilPodeGerirCotacao,
  podeDesativarCotacao: () => podeDesativarCotacao,
  podeEnviarCotacao: () => podeEnviarCotacao,
  podeExcluirCotacao: () => podeExcluirCotacao,
  podeGerirCotacao: () => podeGerirCotacao,
  registroAuditoriaCotacao: () => registroAuditoriaCotacao,
  textoHoraExtra: () => textoHoraExtra,
  textoTarifaKm: () => textoTarifaKm,
  usuarioInternoCotacao: () => usuarioInternoCotacao
});
function normalizar2(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
function reais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function textoTarifaKm(valor) {
  if (valor == null || !Number.isFinite(valor) || valor <= 0) return "\u2014";
  return `${reais(valor)}/km`;
}
function textoHoraExtra(valor) {
  if (valor == null || !Number.isFinite(valor) || valor <= 0) return "\u2014";
  return `${reais(valor)}/h`;
}
function perfilPodeGerirCotacao(perfil) {
  const nome = normalizar2(perfil);
  return nome === "diretoria" || nome === "administrador" || nome === "admin";
}
function clienteDaMesmaCasa(portal, cotacao) {
  const a = normalizar2(portal);
  const b = normalizar2(cotacao);
  if (!a || !b) return false;
  if (a.includes("ceva") && b.includes("ceva")) return true;
  if ((a.includes("ibl") || a.includes("intermodal")) && (b.includes("ibl") || b.includes("intermodal"))) return true;
  return a === b || a.includes(b) || b.includes(a);
}
function autorDaCotacao(ator, cotacao) {
  if (ator.portalCliente && !clienteDaMesmaCasa(ator.portalCliente, cotacao.client_name)) return false;
  const nome = normalizar2(ator.nome);
  const autor = normalizar2(cotacao.created_by);
  if (nome && autor && nome === autor) return true;
  const email = normalizar2(ator.email);
  const emailAutor = normalizar2(cotacao.solicitanteEmail);
  return Boolean(email && emailAutor && email === emailAutor);
}
function usuarioInternoCotacao(ator) {
  return !String(ator.portalCliente || "").trim();
}
function ehDiretoria(perfil) {
  return normalizar2(perfil) === "diretoria";
}
function podeDesativarCotacao(ator) {
  return usuarioInternoCotacao(ator);
}
function podeExcluirCotacao(ator) {
  return ehDiretoria(ator.perfil);
}
function mostrarDesativarCotacao(ator, cotacao) {
  if (!podeDesativarCotacao(ator)) return false;
  if (cotacaoConvertidaEmOs(cotacao) || cotacaoExcluida(cotacao)) return false;
  if (cotacao.is_active === false || normalizar2(cotacao.status) === "inativa") return false;
  return true;
}
function mostrarExcluirCotacao(ator, cotacao) {
  if (!podeExcluirCotacao(ator)) return false;
  if (cotacaoConvertidaEmOs(cotacao) || cotacaoExcluida(cotacao)) return false;
  return true;
}
function podeGerirCotacao(ator, cotacao) {
  if (perfilPodeGerirCotacao(ator.perfil)) {
    if (ator.portalCliente) return clienteDaMesmaCasa(ator.portalCliente, cotacao.client_name);
    return true;
  }
  return autorDaCotacao(ator, cotacao);
}
function cotacaoConvertidaEmOs(cotacao) {
  return Boolean(String(cotacao.converted_to_order_id || "").trim());
}
function cotacaoExcluida(cotacao) {
  return normalizar2(cotacao.status) === normalizar2(STATUS_EXCLUIDA);
}
function decisaoInativar(ator, cotacao) {
  if (!cotacao?.id) return { ok: false, status: 404, error: "Cota\xE7\xE3o n\xE3o encontrada." };
  if (!podeDesativarCotacao(ator)) return { ok: false, status: 403, error: "Voc\xEA n\xE3o pode desativar esta cota\xE7\xE3o." };
  if (cotacaoConvertidaEmOs(cotacao)) return { ok: false, status: 409, error: "Essa cota\xE7\xE3o j\xE1 virou OS e n\xE3o pode ser inativada." };
  return { ok: true, dados: { is_active: false, status: STATUS_INATIVA } };
}
function decisaoExcluir(ator, cotacao) {
  if (!cotacao?.id) return { ok: false, status: 404, error: "Cota\xE7\xE3o n\xE3o encontrada." };
  if (!podeExcluirCotacao(ator)) return { ok: false, status: 403, error: "S\xF3 a diretoria pode excluir esta cota\xE7\xE3o." };
  if (cotacaoConvertidaEmOs(cotacao)) return { ok: false, status: 409, error: "Essa cota\xE7\xE3o j\xE1 virou OS e n\xE3o pode ser exclu\xEDda." };
  return { ok: true, dados: { is_active: false, status: STATUS_EXCLUIDA } };
}
function emailsDaCopia(bruto) {
  const partes = String(bruto || "").split(/[;,]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (partes.length > 8) return { ok: false, error: "Informe no m\xE1ximo 8 e-mails em c\xF3pia." };
  if (partes.some((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))) return { ok: false, error: "H\xE1 um e-mail de c\xF3pia inv\xE1lido." };
  return { ok: true, lista: partes };
}
function montarDestinatariosEnvio(entrada) {
  const selecionados = String(entrada.selecionados || "").split(/[;,]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (selecionados.length === 0) return { ok: false, error: "Informe um e-mail v\xE1lido." };
  if (selecionados.length > 8) return { ok: false, error: "Informe no m\xE1ximo 8 e-mails." };
  if (selecionados.some((item) => !emailDestinoValido(item))) return { ok: false, error: "H\xE1 um e-mail selecionado inv\xE1lido." };
  const autor = String(entrada.autor || "").trim().toLowerCase();
  const para = selecionados[0];
  const vistos = /* @__PURE__ */ new Set([para]);
  const copias = [];
  for (const email of [...selecionados.slice(1), COPIA_FIXA_COTACAO, autor]) {
    if (!emailDestinoValido(email) || vistos.has(email)) continue;
    vistos.add(email);
    copias.push(email);
  }
  return { ok: true, para, copias };
}
function emailDestinoValido(bruto) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(bruto || "").trim().toLowerCase());
}
function cartaEmailCotacao(entrada) {
  const km = Number(entrada.km);
  const valor = Number(entrada.valor);
  const resumo = [
    "Proposta comercial \u2014 Grupo TM SEG",
    "",
    `Origem: ${String(entrada.origem || "").trim() || "\u2014"}`,
    `Destino: ${String(entrada.destino || "").trim() || "\u2014"}`,
    `Dist\xE2ncia: ${Number.isFinite(km) && km > 0 ? `${km.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km` : "\u2014"}`,
    `Valor total: ${Number.isFinite(valor) ? reais(valor) : "\u2014"}`,
    "",
    "O ped\xE1gio \xE9 cobrado \xE0 parte.",
    "A cota\xE7\xE3o segue em anexo."
  ].join("\n");
  const mensagem = String(entrada.mensagem || "").trim().slice(0, 2e3);
  return mensagem ? `${mensagem}

${resumo}` : resumo;
}
function podeEnviarCotacao(ator, cotacao) {
  if (cotacaoExcluida(cotacao)) return false;
  if (ator.portalCliente) return clienteDaMesmaCasa(ator.portalCliente, cotacao.client_name);
  return true;
}
function pdfAnexoAceito(bruto) {
  const texto5 = String(bruto || "").trim();
  const base64 = (texto5.includes(",") && /^data:/i.test(texto5) ? texto5.slice(texto5.indexOf(",") + 1) : texto5).replace(/\s/g, "");
  if (base64.length < 80 || !/^[A-Za-z0-9+/=]+$/.test(base64)) return { ok: false, error: "O PDF da cota\xE7\xE3o n\xE3o veio no anexo." };
  if (!base64.startsWith("JVBERi")) return { ok: false, error: "O anexo n\xE3o \xE9 um PDF." };
  const bytes = Math.floor(base64.length * 3 / 4);
  if (bytes > 7e6) return { ok: false, error: "O PDF passou do tamanho aceito para o e-mail." };
  return { ok: true, base64 };
}
function registroAuditoriaCotacao(entrada) {
  return {
    user_name: entrada.ator.nome || entrada.ator.email || "Portal",
    action_type: entrada.acao,
    entity: "quotes",
    entity_id: String(entrada.cotacao.id || ""),
    details: JSON.stringify({
      acao: entrada.acao,
      cotacao_id: entrada.cotacao.id || "",
      cliente: entrada.cotacao.client_name || "",
      autor: entrada.ator.nome,
      email: entrada.ator.email
    })
  };
}
var STATUS_INATIVA, STATUS_EXCLUIDA, COPIA_FIXA_COTACAO;
var init_gestaoCotacao = __esm({
  "lib/portalCliente/gestaoCotacao.ts"() {
    "use strict";
    STATUS_INATIVA = "Inativa";
    STATUS_EXCLUIDA = "Excluida";
    COPIA_FIXA_COTACAO = "thiago@grupotmseg.com.br";
  }
});

// lib/portalCliente/rotaCotacao.ts
function lerCoordenada(lugar) {
  if (lugar == null) return null;
  const candidato = lugar;
  const latBruto = candidato.lat;
  const lngBruto = candidato.lng;
  const lat = typeof latBruto === "function" ? Number(latBruto.call(lugar)) : Number(latBruto);
  const lng = typeof lngBruto === "function" ? Number(lngBruto.call(lugar)) : Number(lngBruto);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
function decodificarPolyline(encoded, maximo = 80) {
  const texto5 = String(encoded || "");
  const pontos = [];
  let indice = 0;
  let lat = 0;
  let lng = 0;
  while (indice < texto5.length) {
    let resultado = 0;
    let deslocamento = 0;
    let byte = 0;
    do {
      if (indice >= texto5.length) return resumirPontos(pontos, maximo);
      byte = texto5.charCodeAt(indice) - 63;
      indice += 1;
      resultado |= (byte & 31) << deslocamento;
      deslocamento += 5;
    } while (byte >= 32);
    lat += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
    resultado = 0;
    deslocamento = 0;
    do {
      if (indice >= texto5.length) return resumirPontos(pontos, maximo);
      byte = texto5.charCodeAt(indice) - 63;
      indice += 1;
      resultado |= (byte & 31) << deslocamento;
      deslocamento += 5;
    } while (byte >= 32);
    lng += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
    pontos.push({ lat: lat / 1e5, lng: lng / 1e5 });
    if (pontos.length > 4e3) break;
  }
  return resumirPontos(pontos, maximo);
}
function resumirPontos(pontos, maximo = 80) {
  const validos = pontos.map((ponto) => ponto ? lerCoordenada(ponto) : null).filter((ponto) => ponto != null);
  const teto = Math.max(2, maximo);
  if (validos.length <= teto) return validos;
  const passo = (validos.length - 1) / (teto - 1);
  const saida = [];
  const vistos = /* @__PURE__ */ new Set();
  for (let i = 0; i < teto; i++) {
    const indice = Math.round(i * passo);
    if (vistos.has(indice)) continue;
    vistos.add(indice);
    saida.push(validos[indice]);
  }
  return saida;
}
var init_rotaCotacao = __esm({
  "lib/portalCliente/rotaCotacao.ts"() {
    "use strict";
    init_tabela2027();
  }
});

// lib/portalCliente/historicoCotacoes.ts
var historicoCotacoes_exports = {};
__export(historicoCotacoes_exports, {
  JANELA_HISTORICO_VIGENCIA: () => JANELA_HISTORICO_VIGENCIA,
  KIND_PORTAL_COTACAO: () => KIND_PORTAL_COTACAO,
  TAMANHO_PAGINA_HISTORICO: () => TAMANHO_PAGINA_HISTORICO,
  TEXTO_ACEITE_OS: () => TEXTO_ACEITE_OS,
  TEXTO_HISTORICO_VAZIO: () => TEXTO_HISTORICO_VAZIO,
  dataArquivoCotacao: () => dataArquivoCotacao,
  dataLongaCotacao: () => dataLongaCotacao,
  diasRestantesCotacao: () => diasRestantesCotacao,
  exigeAceiteDoCliente: () => exigeAceiteDoCliente,
  formatarDataHoraCotacao: () => formatarDataHoraCotacao,
  formatarValorCotacao: () => formatarValorCotacao,
  kmTempoFaturadoSalvo: () => kmTempoFaturadoSalvo,
  lerSnapshot: () => lerSnapshot,
  linhaConfereComTela: () => linhaConfereComTela,
  mensagemCompletaCotacao: () => mensagemCompletaCotacao,
  montarSnapshot: () => montarSnapshot,
  nomeAnexoPdf: () => nomeAnexoPdf,
  nomePdfCotacao: () => nomePdfCotacao,
  normalizarLinhaHistorico: () => normalizarLinhaHistorico,
  numeroInformado: () => numeroInformado,
  numeroNoSnapshot: () => numeroNoSnapshot,
  numerosNaPagina: () => numerosNaPagina,
  patchDaTelaNoSnapshot: () => patchDaTelaNoSnapshot,
  pedidoParaRegistro: () => pedidoParaRegistro,
  percursoUtil: () => percursoUtil,
  propostaDoHistorico: () => propostaDoHistorico,
  proximoNumeroCotacao: () => proximoNumeroCotacao,
  reservarNumeroCotacao: () => reservarNumeroCotacao,
  resumirEndereco: () => resumirEndereco,
  rotuloValidade: () => rotuloValidade,
  textoDistanciaTempo: () => textoDistanciaTempo,
  textoKmFaturadoSalvo: () => textoKmFaturadoSalvo,
  textoRegiaoFranquia: () => textoRegiaoFranquia,
  valoresExibidosDaLinha: () => valoresExibidosDaLinha,
  vigenciaDaCotacao: () => vigenciaDaCotacao,
  vigenciaInformada: () => vigenciaInformada
});
function exigeAceiteDoCliente(interno, equipeInterna) {
  return !interno && !equipeInterna;
}
function numero2(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}
function texto4(valor, limite = 240) {
  return String(valor || "").trim().slice(0, limite);
}
function resumirEndereco(endereco, limite = 42) {
  const trecho = String(endereco || "").split(",")[0]?.trim() || "";
  if (!trecho) return "\u2014";
  if (trecho.length <= limite) return trecho;
  return `${trecho.slice(0, Math.max(1, limite - 1)).trimEnd()}\u2026`;
}
function formatarDataHoraCotacao(iso) {
  return formatDateTimeBR(iso);
}
function dataLongaCotacao(iso) {
  if (!iso) return "";
  const texto5 = formatDateBR(iso);
  return texto5 === "\u2014" ? "" : texto5;
}
function limparParteArquivo(valor) {
  const limpo = String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/_+/g, "_");
  return (limpo || "Cliente").slice(0, 60);
}
function dataArquivoCotacao(valor) {
  if (typeof valor === "string" && /^\d{2}-\d{2}-\d{4}$/.test(valor)) return valor;
  const candidata = valor instanceof Date ? valor : valor ? new Date(valor) : /* @__PURE__ */ new Date();
  const data = Number.isNaN(candidata.getTime()) ? /* @__PURE__ */ new Date() : candidata;
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(data);
  const pegar = (tipo) => partes.find((item) => item.type === tipo)?.value || "";
  return `${pegar("day")}-${pegar("month")}-${pegar("year")}`;
}
function nomePdfCotacao(entrada) {
  const numero4 = numeroInformado(entrada.numero);
  const cliente = limparParteArquivo(entrada.cliente);
  const data = dataArquivoCotacao(entrada.data);
  const nome = `Cotacao_${numero4 ? String(numero4) : "sem_numero"}_${cliente}_${data}.pdf`;
  return nome.length <= 180 ? nome : `${nome.slice(0, 176).replace(/_+$/g, "")}.pdf`;
}
function nomeAnexoPdf(pedido, reserva) {
  const nome = String(pedido || "").trim();
  if (/^Cotacao_[A-Za-z0-9_]+_\d{2}-\d{2}-\d{4}\.pdf$/.test(nome) && nome.length <= 180) return nome;
  return nomePdfCotacao({
    cliente: String(reserva.cliente || "Cliente"),
    numero: numeroInformado(reserva.numero),
    data: reserva.data
  });
}
function linhaConfereComTela(linha, tela) {
  const kmTela = Number(tela.km);
  const kmLinha = Number(linha.total_km);
  if (!Number.isFinite(kmTela) || kmTela <= 0 || !Number.isFinite(kmLinha)) return false;
  if (Math.abs(kmLinha - kmTela) >= 1) return false;
  const origemTela = String(tela.origem || "").trim();
  const origemLinha = String(linha.origin || "").trim();
  if (!origemTela || !origemLinha) return false;
  if (origemLinha === origemTela) return true;
  if (resumirEndereco(origemLinha) === resumirEndereco(origemTela) && resumirEndereco(linha.destination) === resumirEndereco(tela.destino)) return true;
  const saidaLinha = cidadeDaRota(origemLinha);
  const saidaTela = cidadeDaRota(origemTela);
  const chegadaLinha = cidadeDaRota(String(linha.destination || ""));
  const chegadaTela = cidadeDaRota(String(tela.destino || ""));
  return saidaLinha.length >= 3 && saidaLinha === saidaTela && chegadaLinha.length >= 3 && chegadaLinha === chegadaTela;
}
function franquiaIncluidaSeparada(valor, padrao, usouMinimo, percorrido) {
  return valor === padrao && !usouMinimo && percorrido > padrao;
}
function kmTempoFaturadoSalvo(linha) {
  const salvo = lerSnapshot(linha.contract_details);
  const kmRota = numero2(linha.total_km);
  const horasLinha = numero2(linha.total_hours);
  const kmSalvo = salvo?.kmFaturado != null && salvo.kmFaturado > 0 ? salvo.kmFaturado : salvo && salvo.kmFranquia > 0 && !franquiaIncluidaSeparada(salvo.kmFranquia, FRANQUIA_KM, salvo.usouMinimo, kmRota) ? salvo.kmFranquia : kmRota;
  const horasSalvas = salvo?.horasContadas != null && salvo.horasContadas > 0 ? salvo.horasContadas : salvo && salvo.horasFranquia > 0 && !franquiaIncluidaSeparada(salvo.horasFranquia, FRANQUIA_HORAS, salvo.usouMinimo, horasLinha) ? salvo.horasFranquia : horasLinha;
  return { km: kmSalvo, horas: horasSalvas > 0 ? horasSalvas : null };
}
function textoKmFaturadoSalvo(km, horas) {
  const kmTexto = `${numero2(km).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  if (horas == null || !Number.isFinite(horas) || horas <= 0) return kmTexto;
  const horasTexto = Number.isInteger(horas) ? `${horas} h` : `${horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  return `${kmTexto} | ${horasTexto}`;
}
function valoresExibidosDaLinha(linha) {
  const salvo = lerSnapshot(linha.contract_details);
  const tempo = kmTempoFaturadoSalvo(linha);
  return {
    regiao: salvo?.regiao || "\u2014",
    tarifaKm: salvo?.kmExtra ?? 0,
    horaExtra: salvo?.horaExtra ?? 0,
    total: Number(linha.total_value) || salvo?.acionamento || 0,
    km: tempo.km,
    horas: tempo.horas
  };
}
function patchDaTelaNoSnapshot(bruto, tela) {
  if (!bruto) return null;
  let dados;
  try {
    dados = JSON.parse(bruto);
  } catch {
    return null;
  }
  if (!dados || dados.kind !== KIND_PORTAL_COTACAO || dados.acordada) return null;
  const igual = String(dados.regiao || "") === tela.regiao && Math.abs(Number(dados.kmExtra) - tela.tarifaKm) < 1e-3 && Math.abs(Number(dados.horaExtra) - tela.horaExtra) < 1e-3 && Math.abs(Number(dados.acionamento) - tela.total) < 0.01;
  if (igual) return null;
  return {
    contract_details: JSON.stringify({
      ...dados,
      regiao: tela.regiao,
      kmExtra: tela.tarifaKm,
      horaExtra: tela.horaExtra,
      acionamento: tela.total,
      duracaoMin: tela.duracaoMin,
      vigencia: tela.vigencia,
      usouMinimo: tela.usouMinimo
    }),
    total_value: tela.total,
    total_hours: tela.horas
  };
}
function numeroInformado(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}
function numeroNoSnapshot(bruto) {
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto);
    return numeroInformado(dados?.numero);
  } catch {
    return null;
  }
}
function numerosNaPagina(linhas) {
  const lista = [];
  for (const linha of linhas) {
    const gravado = numeroNoSnapshot(linha.contract_details == null ? null : String(linha.contract_details));
    if (gravado) lista.push(gravado);
    const id = String(linha.id || "");
    if (/^\d+$/.test(id)) lista.push(Number(id));
  }
  return lista;
}
function proximoNumeroCotacao(usados) {
  let maior = 0;
  for (const item of usados) {
    const n = Number(item);
    if (Number.isInteger(n) && n > maior) maior = n;
  }
  return maior + 1;
}
async function reservarNumeroCotacao(ler) {
  const usados = [];
  const tamanho = 200;
  for (let pagina = 0; pagina < 50; pagina += 1) {
    const inicio = pagina * tamanho;
    const lote = await ler(inicio, inicio + tamanho - 1);
    if (!lote) return null;
    usados.push(...numerosNaPagina(lote.linhas));
    if (lote.linhas.length < tamanho) return proximoNumeroCotacao(usados);
  }
  return null;
}
function diasRestantesCotacao(cotacao, agora = /* @__PURE__ */ new Date()) {
  const criada = cotacao.created_at ? new Date(cotacao.created_at) : null;
  if (!criada || Number.isNaN(criada.getTime())) return 0;
  const restante = criada.getTime() + PRAZO_COTACAO_MS - agora.getTime();
  if (restante <= 0) return cotacaoVencida(cotacao, agora) ? 0 : 1;
  return Math.max(1, Math.ceil(restante / (24 * 60 * 60 * 1e3)));
}
function rotuloValidade(cotacao, agora = /* @__PURE__ */ new Date()) {
  if (cotacaoConvertida(cotacao)) return { tom: "convertida", rotulo: "Convertida em OS" };
  const status = String(cotacao.status || "").trim().toLowerCase();
  if (status === "inativa") return { tom: "inativa", rotulo: "Inativa" };
  if (cotacaoVencida(cotacao, agora) || status === "expirada" || cotacao.is_active === false) {
    return { tom: "expirada", rotulo: "Expirada" };
  }
  const dias = diasRestantesCotacao(cotacao, agora);
  return { tom: "ativa", rotulo: dias === 1 ? "Ativa \xB7 1 dia" : `Ativa \xB7 ${dias} dias` };
}
function textoDistanciaTempo(km, duracaoMin) {
  const kmTexto = `${numero2(km).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  if (duracaoMin == null || !Number.isFinite(duracaoMin) || duracaoMin <= 0) return kmTexto;
  const minutos = Math.round(duracaoMin);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const tempo = horas <= 0 ? `${resto} min` : `${horas}h ${String(resto).padStart(2, "0")}min`;
  return `${kmTexto} | ${tempo}`;
}
function textoRegiaoFranquia(regiao, usouMinimo) {
  const nome = String(regiao || "").trim() || "\u2014";
  return usouMinimo ? `${nome} \xB7 franquia m\xEDnima` : nome;
}
function vigenciaInformada(valor) {
  const marca = String(valor || "").trim();
  if (marca === "2026" || marca === "2027") return marca;
  return null;
}
function vigenciaDaCotacao(cotacao) {
  const bruto = cotacao?.contract_details;
  if (!bruto) return "2026";
  try {
    const dados = JSON.parse(bruto);
    return vigenciaInformada(dados?.vigencia) || vigenciaInformada(dados?.pricing_version) || "2026";
  } catch {
    return "2026";
  }
}
function formatarValorCotacao(valor) {
  return numero2(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function mensagemCompletaCotacao(linha, agora = /* @__PURE__ */ new Date()) {
  const salvo = lerSnapshot(linha.contract_details);
  const numeroLinha = salvo?.numero || (/^\d+$/.test(String(linha.id || "")) ? Number(linha.id) : null);
  const validade = rotuloValidade(linha, agora);
  const km = Number(linha.total_km);
  const faturado = kmTempoFaturadoSalvo(linha);
  const franquiaMinima = salvo ? Boolean(salvo.usouMinimo) : km > 0 && km <= 100;
  const partes = [
    `Cota\xE7\xE3o${numeroLinha ? ` ${numeroLinha}` : ""} \u2014 ${String(linha.client_name || "").trim() || "Cliente"}`,
    `Tabela ${salvo?.vigencia || vigenciaDaCotacao(linha)}`,
    `Data: ${formatarDataHoraCotacao(linha.created_at)}`,
    `Solicitante: ${String(linha.created_by || "").trim() || "\u2014"}`,
    salvo?.solicitanteEmail ? `E-mail: ${salvo.solicitanteEmail}` : "",
    `Origem: ${String(linha.origin || "").trim() || "\u2014"}`,
    `Destino: ${String(linha.destination || "").trim() || "\u2014"}`,
    ...salvo?.trechos && salvo.trechos.length > 1 ? salvo.trechos.map((trecho, indice) => `Trecho ${indice + 1}: ${trecho.origem} \u2192 ${trecho.destino} \xB7 ${formatarValorCotacao(trecho.valor)} \xB7 excedente ${trecho.kmExcedente.toLocaleString("pt-BR")} km / ${trecho.horasExcedentes.toLocaleString("pt-BR")} h`) : [],
    salvo?.paradas?.length ? `Paradas: ${salvo.paradas.join(" | ")}` : "",
    `Dist\xE2ncia / tempo: ${textoKmFaturadoSalvo(faturado.km, faturado.horas)}`,
    `Horas faturadas: ${faturado.horas != null ? faturado.horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "\u2014"}`,
    `Regi\xE3o: ${textoRegiaoFranquia(salvo?.regiao || "\u2014", franquiaMinima)}`,
    salvo && (salvo.kmFranquia > 0 || salvo.horasFranquia > 0) ? `Franquia: ${salvo.kmFranquia.toLocaleString("pt-BR")} km / ${salvo.horasFranquia.toLocaleString("pt-BR")} h` : "",
    `Valor KM: ${textoTarifaKm(salvo?.kmExtra)}`,
    `Hora extra: ${textoHoraExtra(salvo?.horaExtra)}`,
    salvo && salvo.acionamento > 0 ? `Acionamento: ${formatarValorCotacao(salvo.acionamento)}` : "",
    `Valor total: ${formatarValorCotacao(linha.total_value)}`,
    `Status: ${validade.rotulo}`,
    "Ped\xE1gio cobrado \xE0 parte."
  ];
  return partes.filter(Boolean).join("\n");
}
function percursoUtil(bruto) {
  if (!bruto || typeof bruto !== "object") return null;
  const registro = bruto;
  const linha = String(registro.polyline || "").trim();
  const polyline = /^[\x21-\x7E]{8,12000}$/.test(linha) ? linha : "";
  const lista = Array.isArray(registro.pontos) ? registro.pontos : [];
  const pontos = [];
  for (const item of lista) {
    if (pontos.length >= 80) break;
    if (!item || typeof item !== "object") continue;
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    pontos.push({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 });
  }
  const completos = pontos.length >= 2 ? pontos : polyline ? decodificarPolyline(polyline) : [];
  if (!polyline && completos.length < 2) return null;
  return { polyline, pontos: completos.slice(0, 80) };
}
function montarSnapshot(entrada) {
  const pronto = {
    kind: KIND_PORTAL_COTACAO,
    duracaoMin: entrada.duracaoMin != null && Number.isFinite(entrada.duracaoMin) && entrada.duracaoMin > 0 ? Math.round(entrada.duracaoMin) : null,
    usouMinimo: Boolean(entrada.usouMinimo),
    regiao: texto4(entrada.regiao, 80),
    kmFranquia: numero2(entrada.kmFranquia),
    horasFranquia: numero2(entrada.horasFranquia),
    kmExtra: numero2(entrada.kmExtra),
    horaExtra: numero2(entrada.horaExtra),
    acionamento: numero2(entrada.acionamento),
    paradas: (entrada.paradas || []).map((item) => texto4(item, 180)).filter(Boolean).slice(0, 12),
    solicitanteEmail: texto4(entrada.solicitanteEmail, 160),
    acordada: Boolean(entrada.acordada),
    operacao: texto4(entrada.operacao, 180),
    vigencia: entrada.vigencia === "2027" ? "2027" : "2026",
    numero: numeroInformado(entrada.numero),
    ...numero2(entrada.kmFaturado) > 0 ? { kmFaturado: numero2(entrada.kmFaturado) } : {},
    ...numero2(entrada.horasContadas) > 0 ? { horasContadas: numero2(entrada.horasContadas) } : {}
  };
  const percurso = percursoUtil(entrada.percurso);
  if (percurso) pronto.percurso = percurso;
  return pronto;
}
function lerSnapshot(bruto) {
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto);
    if (!dados || dados.kind !== KIND_PORTAL_COTACAO) return null;
    const link = dados.linkPublico;
    const linkPublico = link && typeof link.token === "string" && typeof link.expiraEm === "string" ? { token: link.token, expiraEm: link.expiraEm } : null;
    const aceiteBruto = dados.aceiteCliente;
    const aceiteCliente = aceiteBruto && aceiteBruto.texto === TEXTO_ACEITE_OS && typeof aceiteBruto.em === "string" ? { texto: TEXTO_ACEITE_OS, em: aceiteBruto.em } : null;
    const trechos = lerTrechosPersistidos(dados.trechos);
    return {
      ...montarSnapshot({
        duracaoMin: dados.duracaoMin,
        usouMinimo: dados.usouMinimo,
        regiao: dados.regiao,
        kmFranquia: dados.kmFranquia,
        horasFranquia: dados.horasFranquia,
        kmExtra: dados.kmExtra,
        horaExtra: dados.horaExtra,
        acionamento: dados.acionamento,
        paradas: Array.isArray(dados.paradas) ? dados.paradas : [],
        solicitanteEmail: dados.solicitanteEmail,
        acordada: dados.acordada,
        operacao: dados.operacao,
        vigencia: vigenciaInformada(dados.vigencia),
        numero: numeroInformado(dados.numero),
        kmFaturado: dados.kmFaturado,
        horasContadas: dados.horasContadas,
        percurso: dados.percurso
      }),
      ...trechos && trechos.length > 1 ? { trechos } : {},
      ...linkPublico ? { linkPublico } : {},
      ...aceiteCliente ? { aceiteCliente } : {}
    };
  } catch {
    return null;
  }
}
function propostaDoHistorico(linha) {
  const salvo = lerSnapshot(linha.contract_details);
  const tempo = kmTempoFaturadoSalvo(linha);
  if (salvo) {
    return {
      acordada: salvo.acordada,
      regiao: salvo.regiao,
      origem: linha.origin,
      destino: linha.destination,
      paradas: salvo.paradas,
      acionamento: salvo.acionamento || numero2(linha.total_value),
      kmFranquia: salvo.kmFranquia,
      horasFranquia: salvo.horasFranquia,
      kmFaturado: tempo.km > 0 ? tempo.km : null,
      horasContadas: tempo.horas,
      kmExtra: salvo.kmExtra,
      horaExtra: salvo.horaExtra,
      operacao: salvo.operacao || `${linha.origin} X ${linha.destination}`,
      vigencia: salvo.vigencia,
      kmRota: numero2(linha.total_km),
      duracaoMin: salvo.duracaoMin,
      numero: salvo.numero,
      ...salvo.trechos && salvo.trechos.length > 1 ? { trechos: salvo.trechos } : {}
    };
  }
  return {
    acordada: false,
    regiao: "",
    origem: linha.origin,
    destino: linha.destination,
    paradas: [],
    acionamento: numero2(linha.total_value),
    kmFranquia: numero2(linha.total_km),
    horasFranquia: numero2(linha.total_hours),
    kmExtra: 0,
    horaExtra: 0,
    operacao: `${linha.origin} X ${linha.destination}`,
    vigencia: "2026",
    kmRota: numero2(linha.total_km),
    duracaoMin: null
  };
}
function pedidoParaRegistro(pedido, cliente, solicitante) {
  const origem = texto4(pedido.origem, 300);
  const destino = texto4(pedido.destino, 300);
  const km = numero2(pedido.km);
  const valor = numero2(pedido.valor ?? pedido.acionamento);
  const idCliente = Number(cliente.id);
  const nomeCliente = texto4(cliente.name, 180);
  if (!Number.isFinite(idCliente) || idCliente <= 0 || !nomeCliente) return { ok: false, error: "Cliente da cota\xE7\xE3o n\xE3o encontrado." };
  if (!origem || !destino || km <= 0) return { ok: false, error: "Faltam origem, destino ou a dist\xE2ncia da rota." };
  const nome = texto4(solicitante.name, 160) || texto4(solicitante.email, 160) || "Portal";
  const snapshot = montarSnapshot({
    duracaoMin: pedido.duracaoMin == null || pedido.duracaoMin === "" ? null : numero2(pedido.duracaoMin),
    usouMinimo: Boolean(pedido.usouMinimo),
    regiao: texto4(pedido.regiao, 80),
    kmFranquia: numero2(pedido.kmFranquia),
    horasFranquia: numero2(pedido.horas),
    kmExtra: numero2(pedido.kmExtra),
    horaExtra: numero2(pedido.horaExtra),
    acionamento: numero2(pedido.acionamento ?? pedido.valor),
    paradas: Array.isArray(pedido.paradas) ? pedido.paradas.map((item) => String(item || "")) : [],
    solicitanteEmail: texto4(solicitante.email, 160),
    acordada: Boolean(pedido.acordada),
    operacao: texto4(pedido.operacao, 180),
    vigencia: vigenciaInformada(pedido.vigencia) || "2026",
    numero: numeroInformado(pedido.numero),
    kmFaturado: pedido.kmFaturado,
    horasContadas: pedido.horasContadas,
    percurso: pedido.percurso
  });
  const aceite = pedido.aceiteCliente;
  if (aceite && aceite.texto === TEXTO_ACEITE_OS && typeof aceite.em === "string" && aceite.em.trim()) {
    snapshot.aceiteCliente = { texto: TEXTO_ACEITE_OS, em: aceite.em.trim().slice(0, 40) };
  }
  const linha = {
    client_id: idCliente,
    client_name: nomeCliente,
    origin: origem,
    destination: destino,
    total_km: km,
    total_hours: numero2(pedido.horas),
    total_value: valor,
    status: "Enviada",
    is_active: true,
    quote_source: "ROTA",
    created_by: nome
  };
  if (Array.isArray(pedido.trechos) && pedido.trechos.length > 1) {
    const conferencia = conferirTrechosGravados(pedido.trechos, nomeCliente, snapshot.vigencia);
    if (!conferencia.ok) return conferencia;
    snapshot.trechos = conferencia.trechos;
    snapshot.acionamento = conferencia.total;
    snapshot.kmExtra = conferencia.trechos[0].kmExtra;
    snapshot.horaExtra = conferencia.trechos[0].horaExtra;
    snapshot.usouMinimo = conferencia.trechos.every((trecho) => trecho.usouMinimo);
    linha.origin = conferencia.trechos[0].origem;
    linha.destination = conferencia.trechos[conferencia.trechos.length - 1].destino;
    linha.total_km = conferencia.km;
    linha.total_hours = conferencia.horas;
    linha.total_value = conferencia.total;
  } else {
    const avisoPiso = recusarPisoDaProposta({
      cliente: nomeCliente,
      origem,
      vigencia: snapshot.vigencia,
      acordada: snapshot.acordada,
      acionamento: snapshot.acionamento,
      kmExtra: snapshot.kmExtra,
      horaExtra: snapshot.horaExtra
    });
    if (avisoPiso) return { ok: false, error: avisoPiso };
  }
  linha.contract_details = JSON.stringify(snapshot);
  return { ok: true, snapshot, linha };
}
function normalizarLinhaHistorico(row) {
  return {
    id: String(row.id || ""),
    client_id: row.client_id == null ? null : Number(row.client_id),
    client_name: String(row.client_name || ""),
    origin: String(row.origin || ""),
    destination: String(row.destination || ""),
    total_km: numero2(row.total_km),
    total_hours: numero2(row.total_hours),
    total_value: numero2(row.total_value),
    created_at: row.created_at == null ? null : String(row.created_at),
    created_by: String(row.created_by || ""),
    status: row.status || "Enviada",
    is_active: row.is_active == null ? null : Boolean(row.is_active),
    converted_to_order_id: row.converted_to_order_id == null ? null : String(row.converted_to_order_id),
    contract_details: row.contract_details == null ? null : String(row.contract_details)
  };
}
var TEXTO_HISTORICO_VAZIO, TAMANHO_PAGINA_HISTORICO, JANELA_HISTORICO_VIGENCIA, KIND_PORTAL_COTACAO, TEXTO_ACEITE_OS;
var init_historicoCotacoes = __esm({
  "lib/portalCliente/historicoCotacoes.ts"() {
    "use strict";
    init_dateUtils();
    init_tabela2027();
    init_cotacao();
    init_gestaoCotacao();
    init_rotaCotacao();
    init_trechosProposta();
    TEXTO_HISTORICO_VAZIO = "Nenhuma cota\xE7\xE3o recente deste cliente.";
    TAMANHO_PAGINA_HISTORICO = 10;
    JANELA_HISTORICO_VIGENCIA = 100;
    KIND_PORTAL_COTACAO = "PORTAL_COTACAO";
    TEXTO_ACEITE_OS = "Concordo com as informa\xE7\xF5es acima para utiliza\xE7\xE3o em ordem de servi\xE7o.";
  }
});

// lib/portalCliente/linkProposta.ts
var linkProposta_exports = {};
__export(linkProposta_exports, {
  DIAS_LINK_PROPOSTA: () => DIAS_LINK_PROPOSTA,
  MS_LINK_PROPOSTA: () => MS_LINK_PROPOSTA,
  anexarLinkNoSnapshot: () => anexarLinkNoSnapshot,
  caminhoLinkProposta: () => caminhoLinkProposta,
  criarLinkPublico: () => criarLinkPublico,
  dataLinkProposta: () => dataLinkProposta,
  lerCaminhoLinkProposta: () => lerCaminhoLinkProposta,
  linkAindaVale: () => linkAindaVale,
  tokenDeBytes: () => tokenDeBytes,
  tokensIguais: () => tokensIguais,
  urlDoLinkPublico: () => urlDoLinkPublico,
  vistaPublicaDaProposta: () => vistaPublicaDaProposta
});
function tokenDeBytes(bytes) {
  return Array.from(bytes, (item) => item.toString(16).padStart(2, "0")).join("");
}
function criarLinkPublico(agora, aleatorio) {
  if (aleatorio.length < 16) throw new Error("Token curto.");
  return {
    token: tokenDeBytes(aleatorio),
    expiraEm: new Date(agora.getTime() + MS_LINK_PROPOSTA).toISOString()
  };
}
function linkAindaVale(link, agora) {
  if (!link || !/^[a-f0-9]{32,64}$/.test(link.token)) return false;
  const expira = new Date(link.expiraEm);
  return !Number.isNaN(expira.getTime()) && expira.getTime() > agora.getTime();
}
function tokensIguais(a, b) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function caminhoLinkProposta(id, token) {
  return `/proposta/v/${encodeURIComponent(id)}/${token}`;
}
function urlDoLinkPublico(bruto, origem) {
  const texto5 = String(bruto || "").trim();
  let url;
  try {
    url = new URL(texto5);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!/\/proposta\/v\/[^/]+\/[a-f0-9]{32,64}\/?$/i.test(url.pathname)) return null;
  if (origem) {
    try {
      if (url.host !== new URL(origem).host) return null;
    } catch {
      return null;
    }
  }
  return url.toString();
}
function lerCaminhoLinkProposta(pathname) {
  const achado = String(pathname || "").match(/\/proposta\/v\/([^/]+)\/([a-f0-9]{32,64})\/?$/i);
  if (!achado) return null;
  try {
    return { id: decodeURIComponent(achado[1]), token: achado[2].toLowerCase() };
  } catch {
    return null;
  }
}
function dataLinkProposta(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}
function anexarLinkNoSnapshot(bruto, link) {
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto);
    if (!dados || dados.kind !== KIND_PORTAL_COTACAO) return null;
    return JSON.stringify({ ...dados, linkPublico: { token: link.token, expiraEm: link.expiraEm } });
  } catch {
    return null;
  }
}
function vistaPublicaDaProposta(linha, token, agora) {
  let link = null;
  try {
    const dados = JSON.parse(String(linha.contract_details || ""));
    if (dados?.linkPublico?.token && dados.linkPublico.expiraEm) link = dados.linkPublico;
  } catch {
    link = null;
  }
  if (!link || !tokensIguais(link.token, token.toLowerCase())) {
    return { ok: false, status: 404, error: "Link inv\xE1lido ou vencido." };
  }
  if (!linkAindaVale(link, agora)) return { ok: false, status: 410, error: "Este link venceu. Pe\xE7a um novo." };
  return {
    ok: true,
    cliente: String(linha.client_name || "").trim(),
    expiraEm: link.expiraEm,
    validade: dataLinkProposta(link.expiraEm),
    proposta: propostaDoHistorico(linha)
  };
}
var DIAS_LINK_PROPOSTA, MS_LINK_PROPOSTA;
var init_linkProposta = __esm({
  "lib/portalCliente/linkProposta.ts"() {
    "use strict";
    init_historicoCotacoes();
    DIAS_LINK_PROPOSTA = 10;
    MS_LINK_PROPOSTA = DIAS_LINK_PROPOSTA * 24 * 60 * 60 * 1e3;
  }
});

// lib/portalCliente/cotacaoHttp.ts
var cotacaoHttp_exports = {};
__export(cotacaoHttp_exports, {
  listarHistoricoCotacoes: () => listarHistoricoCotacoes,
  listarTabelasCotacao: () => listarTabelasCotacao,
  montarPropostaDoPedido: () => montarPropostaDoPedido,
  propostaParaEmail: () => propostaParaEmail,
  registrarCotacaoPortal: () => registrarCotacaoPortal,
  rotuloDeOperacoes: () => rotuloDeOperacoes,
  salvarPropostaPortal: () => salvarPropostaPortal,
  textoDaProposta: () => textoDaProposta
});
async function rotuloDeOperacoes(sb) {
  const { count, error } = await sb.from("missions").select("id", { count: "exact", head: true });
  if (error || typeof count !== "number") return null;
  return marcoDeOperacoes(count);
}
async function listarTabelasCotacao(sb, cliente) {
  const nomes = [...new Set(
    [cliente?.name, cliente?.trading_name].map((nome) => String(nome || "").trim()).filter(Boolean)
  )];
  if (!nomes.length) return { status: 503, corpo: { error: "Cliente do portal n\xE3o encontrado." } };
  const { data, error } = await sb.from("client_price_tables").select("id, operation_type, activation_fee, franchise_hours, franchise_km, price_per_extra_km, price_per_extra_hour").or(nomes.map((nome) => consultaDoCliente(nome)).join(","));
  if (error) return { status: 500, corpo: { error: "N\xE3o foi poss\xEDvel ler a tabela do cliente." } };
  const tabelas = (data || []).map((row) => tabelaDeLinha(row)).filter((row) => row != null).sort((a, b) => a.operacao.localeCompare(b.operacao, "pt-BR"));
  const operacoes = await rotuloDeOperacoes(sb);
  return { status: 200, corpo: { tabelas, operacoes } };
}
function numero3(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}
async function tabelasDoCliente(sb, cliente) {
  const lista = await listarTabelasCotacao(sb, cliente);
  if ("error" in lista.corpo) return { error: lista.corpo.error, status: lista.status };
  return lista.corpo.tabelas;
}
function montarPropostaDoPedido(tabelas, pedido, clienteNome = "") {
  const regiao = String(pedido.regiao || "").trim();
  const origem = String(pedido.origem || "").trim();
  const destino = String(pedido.destino || "").trim();
  const paradas = Array.isArray(pedido.paradas) ? pedido.paradas.map((item) => String(item || "")) : [];
  const km = numero3(pedido.km);
  const pedidoPronto = pedido;
  const tarifaInformada = numero3(pedidoPronto.kmExtra);
  const totalInformado = numero3(pedidoPronto.acionamento ?? pedidoPronto.valor);
  if (tarifaInformada > 0 && totalInformado > 0 && regiao && origem && destino && km > 0) {
    return {
      acordada: false,
      regiao,
      origem,
      destino,
      paradas,
      acionamento: totalInformado,
      kmFranquia: numero3(pedidoPronto.kmFranquia) || 100,
      horasFranquia: numero3(pedidoPronto.horas) || 3,
      kmExtra: tarifaInformada,
      horaExtra: numero3(pedidoPronto.horaExtra),
      operacao: String(pedidoPronto.operacao || `${regiao} - ${origem}`).slice(0, 180),
      kmRota: km,
      duracaoMin: numero3(pedidoPronto.duracaoMin) || null,
      vigencia: pedidoPronto.vigencia === "2026" || pedidoPronto.vigencia === "2027" ? pedidoPronto.vigencia : null
    };
  }
  const tabelaRegiao = valoresDaRegiao(tabelas.filter((item) => item.regiao === regiao));
  if (!regiao || !origem || !destino || !tabelaRegiao || km <= 0) return { error: "Faltam regi\xE3o, origem, destino ou a rota." };
  const conta = contaVisivelDaCotacao({
    cliente: clienteNome,
    origem,
    km,
    versao: "2027",
    linhas: tabelas.map((item) => ({
      operation_type: item.operacao,
      price_per_extra_km: item.kmExtra,
      price_per_extra_hour: item.horaExtra
    })),
    tarifaKmFallback: tabelaRegiao.kmExtra,
    horaExtraFallback: tabelaRegiao.horaExtra
  });
  return propostaDaConta({ tabelas, regiao, origem, destino, paradas, kmRota: km, conta, tabelaRegiao });
}
function textoDaProposta(proposta, operacoes) {
  return cartaDaProposta(proposta, operacoes);
}
async function salvarPropostaPortal(sb, cliente, pedido) {
  const tabelas = await tabelasDoCliente(sb, cliente);
  if (!Array.isArray(tabelas)) return { status: tabelas.status, corpo: { error: tabelas.error } };
  const proposta = montarPropostaDoPedido(tabelas, pedido, String(cliente?.name || cliente?.trading_name || ""));
  if ("error" in proposta) return { status: 400, corpo: proposta };
  if (proposta.acordada) return { status: 409, corpo: { error: "Essa rota j\xE1 est\xE1 acordada na tabela do cliente." } };
  const regiao = valoresDaRegiao(tabelas.filter((item) => item.regiao === proposta.regiao));
  const nomeCliente = String(cliente?.name || "").trim();
  const { error } = await sb.from("client_price_tables").insert({
    client: nomeCliente,
    operation_type: proposta.operacao,
    activation_fee: proposta.acionamento,
    franchise_km: proposta.kmFranquia,
    franchise_hours: proposta.horasFranquia,
    price_per_extra_km: regiao?.kmExtra || 0,
    price_per_extra_hour: regiao?.horaExtra || 0
  });
  if (error) return { status: 500, corpo: { error: "N\xE3o foi poss\xEDvel gravar a proposta na tabela do cliente." } };
  return { status: 200, corpo: { ok: true, operacao: proposta.operacao } };
}
async function listarHistoricoCotacoes(sb, cliente, pagina = 0, vigencia) {
  const idCliente = Number(cliente?.id);
  if (!Number.isFinite(idCliente) || idCliente <= 0) return { status: 503, corpo: { error: "Cliente do portal n\xE3o encontrado." } };
  const inicio = Math.max(0, Math.floor(Number(pagina) || 0)) * TAMANHO_PAGINA_HISTORICO;
  const faixa = vigencia === "2026" || vigencia === "2027" ? { de: 0, ate: JANELA_HISTORICO_VIGENCIA - 1 } : { de: inicio, ate: inicio + TAMANHO_PAGINA_HISTORICO - 1 };
  const { data, error } = await sb.from("quotes").select(COLUNAS_HISTORICO2).eq("client_id", idCliente).order("created_at", { ascending: false }).range(faixa.de, faixa.ate);
  if (error) {
    if (colunaRegionalAusente(error)) {
      return { status: 200, corpo: { cotacoes: [], temMais: false, aviso: "O hist\xF3rico de cota\xE7\xF5es ainda n\xE3o est\xE1 dispon\xEDvel neste banco." } };
    }
    return { status: 500, corpo: { error: "N\xE3o foi poss\xEDvel ler o hist\xF3rico de cota\xE7\xF5es." } };
  }
  const lidas = (data || []).map((row) => normalizarLinhaHistorico(row)).filter((linha) => !cotacaoExcluida(linha));
  const linhas = vigencia === "2026" || vigencia === "2027" ? lidas.filter((linha) => vigenciaDaCotacao(linha) === vigencia) : lidas;
  const paginaLinhas = vigencia === "2026" || vigencia === "2027" ? linhas.slice(inicio, inicio + TAMANHO_PAGINA_HISTORICO) : linhas;
  const temMais = vigencia === "2026" || vigencia === "2027" ? linhas.length > inicio + TAMANHO_PAGINA_HISTORICO : linhas.length === TAMANHO_PAGINA_HISTORICO;
  return { status: 200, corpo: { cotacoes: paginaLinhas, temMais } };
}
async function registrarCotacaoPortal(sb, cliente, solicitante, pedido) {
  const numero4 = await reservarNumeroCotacao(async (inicio, fim) => {
    const { data: data2, error: error2 } = await sb.from("quotes").select("id, contract_details").order("created_at", { ascending: true }).range(inicio, fim);
    if (error2) return null;
    return { linhas: Array.isArray(data2) ? data2 : [] };
  });
  const registro = pedidoParaRegistro({ ...pedido, numero: numero4 }, cliente || {}, solicitante);
  if (!registro.ok) return { status: 400, corpo: { error: registro.error } };
  const { data, error } = await sb.from("quotes").insert(registro.linha).select("id, created_at").single();
  if (error) {
    if (colunaRegionalAusente(error)) return { status: 503, corpo: { error: "O hist\xF3rico de cota\xE7\xF5es ainda n\xE3o est\xE1 dispon\xEDvel neste banco." } };
    return { status: 500, corpo: { error: "N\xE3o foi poss\xEDvel gravar a cota\xE7\xE3o no hist\xF3rico." } };
  }
  return { status: 201, corpo: { ok: true, id: String(data?.id || ""), created_at: data?.created_at ? String(data.created_at) : null, numero: numero4 } };
}
async function propostaParaEmail(sb, cliente, pedido) {
  const destinos = montarDestinatariosEnvio({
    selecionados: String(pedido.para || ""),
    autor: String(pedido.autor || "")
  });
  if (!destinos.ok) return { status: 400, corpo: { error: destinos.error } };
  const tabelas = await tabelasDoCliente(sb, cliente);
  if (!Array.isArray(tabelas)) return { status: tabelas.status, corpo: { error: tabelas.error } };
  const proposta = montarPropostaDoPedido(tabelas, pedido, String(cliente?.name || cliente?.trading_name || ""));
  if ("error" in proposta) return { status: 400, corpo: proposta };
  const operacoes = await rotuloDeOperacoes(sb);
  const { urlDoLinkPublico: urlDoLinkPublico2 } = await Promise.resolve().then(() => (init_linkProposta(), linkProposta_exports));
  const link = urlDoLinkPublico2(pedido.link);
  return {
    status: 200,
    corpo: {
      ok: true,
      para: destinos.para,
      copias: destinos.copias,
      assunto: `Proposta Grupo TM SEG \u2014 ${proposta.operacao}`,
      texto: textoDaProposta(proposta, operacoes),
      html: htmlDaProposta(proposta, operacoes, link)
    }
  };
}
var COLUNAS_HISTORICO2;
var init_cotacaoHttp = __esm({
  "lib/portalCliente/cotacaoHttp.ts"() {
    "use strict";
    init_tabela2027();
    init_apresentacao();
    init_cotacao();
    init_historicoCotacoes();
    init_gestaoCotacao();
    COLUNAS_HISTORICO2 = "id, client_id, client_name, origin, destination, total_km, total_hours, total_value, created_at, created_by, status, is_active, converted_to_order_id, contract_details";
  }
});

// lib/portalCliente/fotosMedicao.ts
function urlDeEvidencia(valor) {
  const texto5 = String(valor || "").trim();
  if (!/^https:\/\//i.test(texto5)) return null;
  try {
    const url = new URL(texto5);
    if (!url.pathname.includes("/mission-evidence/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
function lerDetalhe(valor) {
  if (!valor) return {};
  if (typeof valor === "object") return valor;
  try {
    const lido = JSON.parse(String(valor));
    return lido && typeof lido === "object" ? lido : {};
  } catch {
    return {};
  }
}
function fotoOrigemDosLogs(linhas) {
  const ordenadas = [...linhas].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  for (const linha of ordenadas) {
    const detalhe2 = lerDetalhe(linha.details);
    if (detalhe2.source !== "evidence_start_alert") continue;
    const url = urlDeEvidencia(detalhe2.publicUrl);
    if (url) return url;
  }
  return null;
}
function montarFotosEvento(entrada) {
  return [
    { rotulo: "Origem", url: urlDeEvidencia(entrada.origem) },
    { rotulo: "Fim", url: urlDeEvidencia(entrada.fim) },
    { rotulo: "Km inicial", url: urlDeEvidencia(entrada.kmInicial) },
    { rotulo: "Km final", url: urlDeEvidencia(entrada.kmFinal) }
  ];
}
var init_fotosMedicao = __esm({
  "lib/portalCliente/fotosMedicao.ts"() {
    "use strict";
  }
});

// lib/portalCliente/fotosMedicaoHttp.ts
var fotosMedicaoHttp_exports = {};
__export(fotosMedicaoHttp_exports, {
  lerFotosEvento: () => lerFotosEvento
});
async function lerFotosEvento(input) {
  const os = String(input.os || "").replace(/\D/g, "");
  if (!/^\d+$/.test(os)) return { status: 400, corpo: { error: "OS inv\xE1lida." } };
  const nomes = [input.cliente?.name, input.cliente?.trading_name].map((nome) => String(nome || "").trim().toUpperCase()).filter(Boolean);
  if (!nomes.length) return { status: 503, corpo: { error: "Cliente do portal n\xE3o encontrado." } };
  const missionId = `GTM-${os}`;
  const { data: mission, error } = await input.sb.from("missions").select("id, client, end_trip_evidence_url, end_km_evidence_url").eq("id", missionId).maybeSingle();
  if (error) return { status: 500, corpo: { error: "N\xE3o foi poss\xEDvel conferir a OS." } };
  const dono = String(mission?.client || "").trim().toUpperCase();
  if (!mission || !nomes.includes(dono)) return { status: 404, corpo: { error: "OS n\xE3o encontrada neste portal." } };
  let origem = null;
  const logs = await input.sb.from("system_logs").select("details, created_at").eq("entity", "MissionEvidence").eq("entity_id", missionId).eq("action_type", "evidence_upload").order("created_at", { ascending: false }).limit(20);
  if (!logs.error) origem = fotoOrigemDosLogs(logs.data || []);
  return {
    status: 200,
    corpo: {
      fotos: montarFotosEvento({
        origem,
        fim: mission.end_trip_evidence_url,
        kmFinal: mission.end_km_evidence_url
      })
    }
  };
}
var init_fotosMedicaoHttp = __esm({
  "lib/portalCliente/fotosMedicaoHttp.ts"() {
    "use strict";
    init_fotosMedicao();
  }
});

// lib/portalCliente/medicaoAnexo.ts
function anexoMedicao(input) {
  const base64 = String(input.base64 || "").trim();
  if (!base64) return { ok: true, vazio: true };
  const tipo = String(input.tipo || "").trim().toLowerCase();
  const extensao = TIPOS_ANEXO[tipo];
  if (!extensao) return { ok: false, erro: "Anexe PDF ou imagem (PNG, JPG ou WEBP)." };
  const limpo = base64.replace(/^data:[^;]+;base64,/, "");
  let bytes;
  try {
    bytes = Buffer.from(limpo, "base64");
  } catch {
    return { ok: false, erro: "N\xE3o foi poss\xEDvel ler o anexo." };
  }
  if (bytes.length === 0) return { ok: false, erro: "O anexo est\xE1 vazio." };
  if (bytes.length > ANEXO_MEDICAO_MAX_BYTES) return { ok: false, erro: "O anexo passa de 3 MB." };
  const nomeBruto = String(input.nome || `anexo.${extensao}`).replace(/[^\w.\- ]+/g, "").trim() || `anexo.${extensao}`;
  return { ok: true, nome: nomeBruto.slice(0, 120), tipo, bytes };
}
var ANEXO_MEDICAO_MAX_BYTES, TIPOS_ANEXO;
var init_medicaoAnexo = __esm({
  "lib/portalCliente/medicaoAnexo.ts"() {
    "use strict";
    ANEXO_MEDICAO_MAX_BYTES = 3e6;
    TIPOS_ANEXO = {
      "application/pdf": "pdf",
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp"
    };
  }
});

// lib/portalCliente/medicaoHttp.ts
var medicaoHttp_exports = {};
__export(medicaoHttp_exports, {
  detalhesDaMedicao: () => detalhesDaMedicao,
  gravarMedicaoPortal: () => gravarMedicaoPortal
});
function detalhe(rotulo, valor) {
  if (valor == null || valor === "") return `${rotulo}: \u2014`;
  return `${rotulo}: ${valor}`;
}
function detalhesDaMedicao(linha) {
  const item = linha || {};
  return [
    detalhe("Servi\xE7o", item.servico),
    detalhe("Data in\xEDcio", item.dataInicio),
    detalhe("Data fim", item.dataFim),
    detalhe("Local", item.local),
    detalhe("Franquia hora", item.franquiaHora),
    detalhe("Franquia km", item.franquiaKm),
    detalhe("Km in\xEDcio", item.kmInicio),
    detalhe("Km fim", item.kmFim),
    detalhe("Km rodado", item.kmRodado),
    detalhe("Km excedente", item.kmExcedente),
    detalhe("Horas trabalhadas", item.hrsTrabalhada),
    detalhe("Horas excedentes", item.hrsExcedente),
    detalhe("R$ horas excedentes", item.valorHrsExcedente),
    detalhe("R$ km excedente", item.valorKmExcedente),
    detalhe("R$ acionamento", item.valorAcionamento),
    detalhe("Ped\xE1gio", item.pedagio),
    detalhe("Tarifa km", item.tarifaKm),
    detalhe("Tarifa hora", item.tarifaHora),
    detalhe("R$ total", item.valorTotal)
  ];
}
async function gravarMedicaoPortal(input) {
  const os = String(input.os || "").replace(/\D/g, "");
  if (!/^\d+$/.test(os)) return { status: 400, corpo: { error: "OS inv\xE1lida." } };
  const nomeCliente = String(input.cliente?.trading_name || input.cliente?.name || "").trim();
  if (!nomeCliente) return { status: 503, corpo: { error: "Cliente do portal n\xE3o encontrado." } };
  const missionId = `GTM-${os}`;
  const { data: mission, error: missionError } = await input.sb.from("missions").select("id, client, billing_approved").eq("id", missionId).maybeSingle();
  if (missionError) return { status: 500, corpo: { error: "N\xE3o foi poss\xEDvel conferir a OS." } };
  const dono = String(mission?.client || "").trim().toUpperCase();
  const nomes = [input.cliente?.name, input.cliente?.trading_name].map((nome) => String(nome || "").trim().toUpperCase()).filter(Boolean);
  if (!mission || !nomes.includes(dono)) {
    return { status: 404, corpo: { error: "OS n\xE3o encontrada neste portal." } };
  }
  const agora = (/* @__PURE__ */ new Date()).toISOString();
  const acao = String(input.acao || input.body.acao || "").trim();
  if (acao === "reverter") {
    if (input.equipeInterna !== true) {
      return { status: 403, corpo: { error: "S\xF3 o administrador interno pode voltar uma aprova\xE7\xE3o para verificar." } };
    }
    const { data: atual, error: leitura } = await input.sb.from("portal_medicao_cliente").select("status").eq("mission_id", missionId).maybeSingle();
    if (leitura) return { status: 503, corpo: { error: "N\xE3o foi poss\xEDvel ler a aprova\xE7\xE3o." } };
    if (atual?.status !== "aprovado") {
      return { status: 409, corpo: { error: "Esta OS n\xE3o est\xE1 aprovada." } };
    }
    const { error: error2 } = await input.sb.from("portal_medicao_cliente").delete().eq("mission_id", missionId);
    if (error2) return { status: 503, corpo: { error: "N\xE3o foi poss\xEDvel voltar a OS para verificar." } };
    return { status: 200, corpo: { ok: true, os, medicao: null } };
  }
  if (mission.billing_approved !== true) {
    return { status: 409, corpo: { error: "Esta OS est\xE1 aguardando valida\xE7\xE3o. A an\xE1lise fica dispon\xEDvel quando o valor for liberado." } };
  }
  if (acao === "aprovar") {
    if (input.body.deAcordo !== true) {
      return { status: 400, corpo: { error: "Analise a medi\xE7\xE3o e marque De acordo para aprovar." } };
    }
    const { error: error2 } = await input.sb.from("portal_medicao_cliente").upsert({
      mission_id: missionId,
      client_id: input.cliente?.id ?? null,
      status: "aprovado",
      aprovado_em: agora,
      aprovado_por: input.autor
    }, { onConflict: "mission_id" });
    if (error2) return { status: 503, corpo: { error: "N\xE3o foi poss\xEDvel gravar a aprova\xE7\xE3o. A tabela da medi\xE7\xE3o ainda n\xE3o est\xE1 no banco." } };
    const medicao = { status: "aprovado", itens: [], justificativa: null, modificadoEm: null };
    return { status: 200, corpo: { ok: true, os, medicao } };
  }
  if (acao !== "conferir") return { status: 400, corpo: { error: "A\xE7\xE3o inv\xE1lida." } };
  const pedido = validarConferir({ itens: input.body.itens, justificativa: input.body.justificativa });
  if (!pedido.ok) return { status: 400, corpo: { error: pedido.erro } };
  const anexo = anexoMedicao({ nome: input.body.anexoNome, tipo: input.body.anexoTipo, base64: input.body.anexoBase64 });
  if (!anexo.ok) return { status: 400, corpo: { error: anexo.erro } };
  let anexoCaminho = null;
  let anexoNome = null;
  let arquivo = null;
  if (!("vazio" in anexo)) {
    anexoNome = anexo.nome;
    anexoCaminho = `portal-medicao/${missionId}/${Date.now()}-${anexo.nome.replace(/\s+/g, "_")}`;
    const envio = await input.sb.storage.from("mission-evidence").upload(anexoCaminho, anexo.bytes, { contentType: anexo.tipo, upsert: false });
    if (envio?.error) return { status: 500, corpo: { error: "N\xE3o foi poss\xEDvel guardar o anexo." } };
    arquivo = { filename: anexo.nome, content: anexo.bytes, contentType: anexo.tipo };
  }
  const { error } = await input.sb.from("portal_medicao_cliente").upsert({
    mission_id: missionId,
    client_id: input.cliente?.id ?? null,
    status: "conferir",
    itens: pedido.itens,
    justificativa: pedido.justificativa,
    anexo_caminho: anexoCaminho,
    anexo_nome: anexoNome,
    pedido_em: agora,
    pedido_por: input.autor,
    aprovado_em: null,
    aprovado_por: null,
    modificado_em: null
  }, { onConflict: "mission_id" });
  if (error) return { status: 503, corpo: { error: "N\xE3o foi poss\xEDvel gravar a confer\xEAncia. A tabela da medi\xE7\xE3o ainda n\xE3o est\xE1 no banco." } };
  let emailEnviado = false;
  try {
    const texto5 = textoEmailConferir({
      os,
      cliente: nomeCliente,
      autor: input.autor,
      itens: pedido.itens,
      justificativa: pedido.justificativa,
      detalhes: detalhesDaMedicao(input.body.detalhes)
    });
    if (input.enviarEmail) await input.enviarEmail(texto5, arquivo);
    emailEnviado = Boolean(input.enviarEmail);
  } catch {
    emailEnviado = false;
  }
  return {
    status: 200,
    corpo: {
      ok: true,
      os,
      emailEnviado,
      destinatario: EMAIL_FINANCEIRO_MEDICAO,
      medicao: medicaoDaLinha({ status: "conferir", itens: pedido.itens, justificativa: pedido.justificativa, modificado_em: null })
    }
  };
}
var init_medicaoHttp = __esm({
  "lib/portalCliente/medicaoHttp.ts"() {
    "use strict";
    init_medicaoAnexo();
    init_medicao();
  }
});

// lib/cevaPortal/httpHandler.ts
var httpHandler_exports = {};
__export(httpHandler_exports, {
  handleCevaPortalHttp: () => handleCevaPortalHttp,
  handleClientePortalHttp: () => handleClientePortalHttp,
  handleIblPortalHttp: () => handleIblPortalHttp
});
module.exports = __toCommonJS(httpHandler_exports);
var import_node_async_hooks = require("node:async_hooks");
init_missionSnapshot();
init_supabaseAdmin();
init_portalServidor();
init_acesso();
init_regrasAcesso();
init_cadastroSistema();

// lib/gestorFiscal/ponteAuth/formatoSenha.ts
var import_node_crypto2 = require("node:crypto");
init_hashSenha();
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

// lib/cevaPortal/equipeInterna.ts
init_regrasAcesso();
function ehEquipeInterna(usuario) {
  if (!usuario || usuario.id == null || String(usuario.id) === "") return false;
  if (String(usuario.status || "") !== "Ativo") return false;
  if (usuarioSoPortal(usuario.permissions)) return false;
  const tipo = String(usuario.user_type || "").trim().toLowerCase();
  if (tipo === "client" || tipo === "provider") return false;
  if (tipo === "internal") return true;
  return !tipo && !usuario.client_id && !usuario.provider_id;
}
function senhaEquipeConfere(informada, gravada, hash) {
  return conferirSenhaDaFicha(informada, { password: gravada, password_hash: hash }) !== "nao";
}
function tokenDaEquipeInterna(prefixo, userId, agora = Date.now()) {
  return `${prefixo}-interno-${userId}-${agora}`;
}
function origemDoTokenPortal(prefixo, header) {
  const raw = String(header || "").replace(/^Bearer\s+/i, "").trim();
  const seguro = prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const equipe = raw.match(new RegExp(`^${seguro}-interno-(\\d+)-(\\d{10,})$`));
  if (equipe) return { origem: "equipe", id: equipe[1] };
  const portal = raw.match(new RegExp(`^${seguro}-(\\d+)-(\\d{10,})$`));
  if (portal) return { origem: "portal", id: portal[1] };
  return null;
}

// lib/cevaPortal/httpHandler.ts
init_rules();

// lib/cevaPortal/emailAcesso.ts
init_smtp();
function escapar(valor) {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function systemAppUrl(path) {
  const base = process.env.SYSTEM_URL || `https://${process.env.REPLIT_DOMAINS?.split(",")[0] || "sistema.grupotmseg.com.br"}`;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
async function sendCevaPortalAccessEmail(input) {
  const rotulo = input.rotulo || "CEVA";
  const link = systemAppUrl(input.caminho || "/ceva");
  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Segoe UI,Arial,sans-serif;color:#333;line-height:1.6">
    <h2>Acesso ao Controle de Escolta</h2>
    <p>Ol\xE1, <strong>${escapar(input.nome)}</strong>.</p>
    <p>O administrador liberou o seu acesso ao controle de escolta da ${escapar(rotulo)}. Use a senha tempor\xE1ria abaixo, troque-a no primeiro acesso e repita a troca a cada 30 dias. O portal mostra somente este cliente.</p>
    <p><strong>Link:</strong> <a href="${link}">${link}</a><br>
    <strong>E-mail:</strong> ${escapar(input.email)}<br>
    <strong>Senha tempor\xE1ria:</strong> <code>${escapar(input.senhaTemporaria)}</code></p>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  </body></html>`;
  try {
    await sendMail({
      from: SMTP_FROM,
      to: input.email,
      subject: `Acesso ao Controle de Escolta ${rotulo}`,
      html
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Email] Falha no acesso ${rotulo} para ${input.email}:`, message);
    return false;
  }
}

// lib/cevaPortal/httpHandler.ts
var contextoPortal = new import_node_async_hooks.AsyncLocalStorage();
function cfg() {
  return contextoPortal.getStore() ?? PORTAL_CEVA;
}
function comDono(row) {
  if (cfg().clientId == null) return row;
  return { ...row, client_id: cfg().clientId };
}
function conflitoCatalogo() {
  return cfg().clientId != null ? "client_id,campo,valor" : "campo,valor";
}
function tokenDoPortal(userId, now = Date.now()) {
  return `${cfg().tokenPrefix}-${userId}-${now}`;
}
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
    trocarSenha: row.trocarSenha === true,
    trocarEmail: row.trocarEmail === true
  };
}
function sessaoDe(row) {
  const perfil = perfilDeAcesso(row.perfil);
  if (!perfil) return null;
  const trocarEmail = row.trocar_email === true;
  const trocarSenha = trocarEmail || deveTrocarSenhaPortal({
    trocarSenha: row.trocar_senha === true,
    senhaAlteradaEm: row.senha_alterada_em
  });
  const user = usuarioPublico({ ...row, perfil, trocarSenha, trocarEmail });
  return { ...user, perfil, trocarSenha, trocarEmail };
}
async function lerUsuarioPortal(sb, filtro, comSenha) {
  const base = comSenha ? "id, nome, email, senha_hash, perfil, status, trocar_senha" : "id, nome, email, perfil, status, trocar_senha";
  const consulta = (colunas) => {
    let query = sb.from(cfg().tabelas.usuarios).select(colunas);
    if (filtro.id) query = query.eq("id", filtro.id);
    if (filtro.email) query = query.eq("email", filtro.email);
    if (cfg().clientId != null) query = query.eq("client_id", cfg().clientId);
    return query.maybeSingle();
  };
  const completo = await consulta(`${base}, senha_alterada_em, trocar_email`);
  if (!completo.error) return completo;
  if (/trocar_email/i.test(String(completo.error.message || ""))) {
    const semEmail = await consulta(`${base}, senha_alterada_em`);
    if (!colunaSenhaAlteradaAusente(semEmail.error)) return semEmail;
  }
  if (!colunaSenhaAlteradaAusente(completo.error)) return completo;
  return consulta(base);
}
function sessaoAberta() {
  return {
    id: "aberto",
    name: cfg().rotulo,
    email: "sem-login",
    perfil: "administrador",
    trocarSenha: false
  };
}
function sessaoDaEquipe(row) {
  return {
    id: String(row.id),
    name: String(row.name || "").trim() || "Equipe interna",
    email: String(row.email || "").trim().toLowerCase(),
    perfil: "administrador",
    trocarSenha: false,
    equipeInterna: true
  };
}
async function sessaoEquipeInterna(sb, id) {
  const { data, error } = await sb.from("system_users").select("id, name, email, status, client_id, provider_id, user_type, permissions").eq("id", id).maybeSingle();
  if (error || !ehEquipeInterna(data)) return null;
  return sessaoDaEquipe(data);
}
async function portalSession(req) {
  const header = String(req.headers?.authorization || req.headers?.[cfg().headerSessao] || "");
  const token = origemDoTokenPortal(cfg().tokenPrefix, header);
  if (!token) return cfg().exigeLogin ? null : sessaoAberta();
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  if (token.origem === "equipe") {
    const equipe = await sessaoEquipeInterna(sb, token.id);
    if (equipe) return equipe;
    return cfg().exigeLogin ? null : sessaoAberta();
  }
  const { data: user, error } = await lerUsuarioPortal(sb, { id: token.id }, false);
  if (error) return null;
  if (!user || user.status !== "ativo") return cfg().exigeLogin ? null : sessaoAberta();
  return sessaoDe(user);
}
function bloquearPessoasSemLogin(res, session) {
  if (session.id !== "aberto") return false;
  res.status(403).json({ error: "O cadastro de pessoas fica para quando o login for ligado." });
  return true;
}
function exigirUso(res, session) {
  if (!session) {
    res.status(401).json({ error: "Sess\xE3o expirada. Entre novamente." });
    return false;
  }
  if (session.trocarSenha) {
    res.status(403).json({ error: "Troque a senha para continuar. A troca \xE9 obrigat\xF3ria no primeiro acesso e a cada 30 dias.", trocarSenha: true });
    return false;
  }
  return true;
}
async function existeAdministrador(sb) {
  let query = sb.from(cfg().tabelas.usuarios).select("id", { count: "exact", head: true }).eq("perfil", "administrador");
  if (cfg().clientId != null) query = query.eq("client_id", cfg().clientId);
  const { count, error } = await query;
  if (error) throw error;
  return (count || 0) > 0;
}
async function outroAdministradorVivo(sb, id) {
  let query = sb.from(cfg().tabelas.usuarios).select("id", { count: "exact", head: true }).eq("perfil", "administrador").neq("status", "inativo").neq("id", id);
  if (cfg().clientId != null) query = query.eq("client_id", cfg().clientId);
  const { count, error } = await query;
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
  throw new Error(`Tabelas de pre\xE7o da ${cfg().rotulo} incompletas.`);
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
function acessoNegado(error) {
  const row = error;
  return row?.code === "42501" || String(row?.message || "").toLowerCase().includes("permission denied");
}
async function carregarClienteDoPortal(sb) {
  if (cfg().clientId != null) {
    const { data: data2, error: error2 } = await sb.from("clients").select("*").eq("id", cfg().clientId).maybeSingle();
    if (error2) throw error2;
    return data2;
  }
  const busca = String(cfg().clienteBusca || "").trim();
  if (!busca) {
    const { data: data2, error: error2 } = await sb.from("clients").select("*").eq("name", cfg().clienteNome).maybeSingle();
    if (error2) throw error2;
    return data2;
  }
  const { data, error } = await sb.from("clients").select("*").ilike("name", `%${busca}%`).limit(20);
  if (error) throw error;
  const linhas = data || [];
  const oficial = linhas.find((row) => String(row.name || "").trim().toUpperCase() === cfg().clienteNome.toUpperCase());
  if (oficial) return oficial;
  return linhas.length === 1 ? linhas[0] : null;
}
async function loadCamposCliente(sb, missionIds) {
  const map = /* @__PURE__ */ new Map();
  for (const part of chunks(missionIds, 200)) {
    const { data, error } = await sb.from(cfg().tabelas.osCampos).select("*").in("mission_id", part);
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
    tsp: [],
    atendimentoPgr: []
  };
  let queryCatalogo = sb.from(cfg().tabelas.catalogo).select("campo, valor").order("valor");
  if (cfg().clientId != null) queryCatalogo = queryCatalogo.eq("client_id", cfg().clientId);
  const { data, error } = await queryCatalogo;
  if (error) throw error;
  const reverso = {
    solicitante: "solicitante",
    quem_autorizou: "quemAutorizou",
    servico: "servico",
    contrato: "contrato",
    operacao: "operacao",
    tsp: "tsp",
    atendimento_pgr: "atendimentoPgr"
  };
  for (const row of data || []) {
    const campo = reverso[String(row.campo)];
    if (campo) catalogo[campo].push(String(row.valor));
  }
  return catalogo;
}
async function gravarColuna(sb, missionId, campo, valor) {
  const coluna = COLUNA_CAMPO[campo];
  const { data: atual, error: leitura } = await sb.from(cfg().tabelas.osCampos).select("*").eq("mission_id", missionId).maybeSingle();
  if (leitura) throw leitura;
  const payload = comDono({ ...atual || { mission_id: missionId }, [coluna]: valor, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
  delete payload.id;
  const { error } = await sb.from(cfg().tabelas.osCampos).upsert(payload, { onConflict: "mission_id" });
  if (error) throw error;
  return atual;
}
function hydrateSnapshot(mission, logSnapshot) {
  if (!logSnapshot || mission.snapshot_approved_by) return mission;
  if (carimboRecalculoAutomatico(logSnapshot.approved_by)) return mission;
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
function anotarQuery(req, extra) {
  const atual = req?.query;
  if (!atual || typeof atual !== "object") return;
  Object.assign(atual, extra);
}
function resolveOp(req) {
  const fromQuery = String(req.query?.op || "").trim();
  if (fromQuery) return fromQuery;
  const url = String(req.url || "");
  const path = url.split("?")[0];
  const match = path.match(/\/api\/(?:ceva|ibl|cliente)-portal\/([^/]+)(?:\/([^/]+))?/);
  if (!match) return "";
  const head = match[1];
  const tail = match[2];
  if (head === "pessoas" && tail) {
    anotarQuery(req, { id: tail });
    return "pessoas-item";
  }
  if ((head === "pgr" || head === "fotos") && tail) {
    anotarQuery(req, { os: tail });
    return head;
  }
  return head;
}
async function handleClientePortalHttp(req, res) {
  res.setHeader?.("Cache-Control", "no-store");
  const method = String(req.method || "GET").toUpperCase();
  const op = resolveOp(req);
  if (op === "marca-site" && method === "POST") {
    const { responderMarcaSite: responderMarcaSite2 } = await Promise.resolve().then(() => (init_marcaSiteHttp(), marcaSiteHttp_exports));
    await responderMarcaSite2(req, res);
    return;
  }
  if (op === "provisionar" && method === "POST") {
    const { responderProvisionar: responderProvisionar2 } = await Promise.resolve().then(() => (init_provisionarHttp(), provisionarHttp_exports));
    await responderProvisionar2(req, res);
    return;
  }
  const slug = String(req.headers?.["x-portal-slug"] || req.query?.slug || "").trim().toLowerCase();
  if (!slug) {
    res.status(404).json({ error: "Portal n\xE3o encontrado." });
    return;
  }
  const sb = createSupabaseAdminClient();
  if (!sb) {
    res.status(503).json({ error: "Portal indispon\xEDvel." });
    return;
  }
  const consulta = await sb.from("clients").select("id, name, trading_name, status, portal_ativo, portal_slug, portal_logo_url, portal_cor, portal_cor_acao").eq("portal_slug", slug).maybeSingle();
  if (consulta.error) {
    console.error("[portal-cliente] marca", consulta.error.message);
    res.status(503).json({ error: "O cadastro do portal ainda n\xE3o est\xE1 no banco." });
    return;
  }
  const cliente = consulta.data;
  if (!cliente || cliente.portal_ativo !== true || String(cliente.status || "") !== "Ativo") {
    res.status(404).json({ error: "Portal n\xE3o encontrado." });
    return;
  }
  if (op === "marca" && method === "GET") {
    res.status(200).json({
      slug,
      rotulo: String(cliente.trading_name || cliente.name || slug),
      logo: cliente.portal_logo_url || "",
      cor: cliente.portal_cor || "",
      corAcao: cliente.portal_cor_acao || "",
      caminho: `/${slug}`
    });
    return;
  }
  const portal = portalGenerico(cliente);
  if (!portal) {
    res.status(404).json({ error: "Portal n\xE3o encontrado." });
    return;
  }
  return contextoPortal.run(portal, () => executarPortalHttp(req, res));
}
async function handleCevaPortalHttp(req, res) {
  return contextoPortal.run(PORTAL_CEVA, () => executarPortalHttp(req, res));
}
async function handleIblPortalHttp(req, res) {
  return contextoPortal.run(PORTAL_IBL, () => executarPortalHttp(req, res));
}
async function executarPortalHttp(req, res) {
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
        console.error(`[${cfg().logPrefix}] acesso`, error instanceof Error ? error.message : error);
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
      const colunasEquipe = "id, name, email, password, password_hash, status, client_id, provider_id, user_type, permissions";
      let consultaEquipe = await sb.from("system_users").select(colunasEquipe).ilike("email", email).maybeSingle();
      if (consultaEquipe.error && /password_hash/i.test(consultaEquipe.error.message || "")) {
        consultaEquipe = await sb.from("system_users").select("id, name, email, password, status, client_id, provider_id, user_type, permissions").ilike("email", email).maybeSingle();
      }
      const sistema = consultaEquipe.data;
      const erroSistema = consultaEquipe.error;
      if (erroSistema) {
        console.error(`[${cfg().logPrefix}] login equipe`, erroSistema.message || erroSistema);
      } else if (sistema && ehEquipeInterna(sistema) && senhaEquipeConfere(senha, sistema.password, sistema.password_hash)) {
        clearFailures(key);
        const session2 = sessaoDaEquipe(sistema);
        res.status(200).json({ token: tokenDaEquipeInterna(cfg().tokenPrefix, sistema.id), user: session2 });
        return;
      }
      const { data: user, error: erroUsuario } = await lerUsuarioPortal(sb, { email }, true);
      if (erroUsuario) {
        console.error(`[${cfg().logPrefix}] login`, erroUsuario.message || erroUsuario);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel entrar." });
        return;
      }
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
      if (!erroSistema && sistema) {
        const clienteDoLogin = await carregarClienteDoPortal(sb);
        const mesmoCliente2 = Boolean(clienteDoLogin?.id) && String(sistema.client_id || "") === String(clienteDoLogin.id);
        const tipo = String(sistema.user_type || "");
        const internoOuFornecedor = tipo === "internal" || tipo === "provider";
        if (sistema.status !== "Ativo" || internoOuFornecedor || !mesmoCliente2) {
          res.status(403).json({ error: "Este acesso n\xE3o est\xE1 liberado no Cadastro de Usu\xE1rios deste cliente." });
          return;
        }
        if (usuarioSoPortal(sistema.permissions) && caminhoPortalDasPermissoes(sistema.permissions) !== cfg().caminho) {
          res.status(403).json({ error: "Este acesso n\xE3o est\xE1 liberado no Cadastro de Usu\xE1rios deste cliente." });
          return;
        }
      }
      const session = sessaoDe(user);
      if (!session) {
        res.status(401).json({ error: INVALID_LOGIN });
        return;
      }
      clearFailures(key);
      res.status(200).json({ token: tokenDoPortal(user.id), user: session });
      return;
    }
    if (op === "primeiro-acesso" && method === "POST") {
      const key = `${clientIp(req)}|primeiro|${emailDeAcesso(body?.email) || ""}`;
      if (tooManyAttempts(key)) {
        res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
        return;
      }
      const decisao = decidirPrimeiroAcesso();
      res.status(403).json({ error: decisao.error });
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
      if (session.equipeInterna) {
        res.status(403).json({ error: "A senha da equipe interna \xE9 alterada no sistema." });
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
      let leituraUsuario = await sb.from(cfg().tabelas.usuarios).select("id, email, senha_hash, trocar_email").eq("id", session.id).maybeSingle();
      if (leituraUsuario.error && /trocar_email/i.test(String(leituraUsuario.error.message || ""))) {
        leituraUsuario = await sb.from(cfg().tabelas.usuarios).select("id, email, senha_hash").eq("id", session.id).maybeSingle();
      }
      const user = leituraUsuario.data;
      if (!user || !senhaConfere(senhaAtual, user.senha_hash)) {
        res.status(401).json({ error: "A senha atual n\xE3o confere." });
        return;
      }
      const precisaEmail = user.trocar_email === true;
      const emailNovo = precisaEmail ? emailDeAcesso(body?.emailNovo) : null;
      if (precisaEmail && (!emailNovo || emailNovo === String(user.email || "").trim().toLowerCase())) {
        res.status(400).json({ error: "Informe o e-mail definitivo, diferente do e-mail provis\xF3rio." });
        return;
      }
      if (emailNovo) {
        const ocupadoPortal = await sb.from(cfg().tabelas.usuarios).select("id").eq("email", emailNovo).neq("id", session.id).limit(1);
        const ocupadoSistema = await sb.from("system_users").select("id").ilike("email", emailNovo).limit(1);
        if (ocupadoPortal.error || ocupadoSistema.error) {
          res.status(500).json({ error: "N\xE3o foi poss\xEDvel conferir o e-mail." });
          return;
        }
        if ((ocupadoPortal.data || []).length > 0 || (ocupadoSistema.data || []).length > 0) {
          res.status(409).json({ error: "Este e-mail j\xE1 est\xE1 em uso." });
          return;
        }
      }
      const agora = (/* @__PURE__ */ new Date()).toISOString();
      const troca = {
        senha_hash: hashSenha(senhaNova),
        trocar_senha: false,
        trocar_email: false,
        senha_alterada_em: agora,
        atualizado_em: agora
      };
      if (emailNovo) troca.email = emailNovo;
      let { error } = await sb.from(cfg().tabelas.usuarios).update(troca).eq("id", session.id);
      if (error && /trocar_email|senha_alterada_em|schema cache|does not exist|Could not find/i.test(String(error.message || ""))) {
        const semColuna = { ...troca };
        delete semColuna.trocar_email;
        delete semColuna.senha_alterada_em;
        ({ error } = await sb.from(cfg().tabelas.usuarios).update(semColuna).eq("id", session.id));
      }
      if (error) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel trocar a senha." });
        return;
      }
      if (emailNovo) {
        const cliente = await carregarClienteDoPortal(sb);
        let sistema = sb.from("system_users").update({ email: emailNovo, name: session.name }).ilike("email", String(user.email || ""));
        if (cliente?.id != null) sistema = sistema.eq("client_id", cliente.id);
        const gravouSistema = await sistema.eq("user_type", "client");
        if (gravouSistema.error) {
          res.status(500).json({ error: "A senha mudou, mas o e-mail n\xE3o entrou no Cadastro de Usu\xE1rio." });
          return;
        }
      }
      res.status(200).json({ user: { ...session, email: emailNovo || session.email, trocarSenha: false, trocarEmail: false } });
      return;
    }
    if (op === "pessoas" && method === "GET") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (bloquearPessoasSemLogin(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: "O analista n\xE3o cadastra pessoas." });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      let listaPessoas = sb.from(cfg().tabelas.usuarios).select("id, nome, email, perfil, status, trocar_senha");
      if (cfg().clientId != null) listaPessoas = listaPessoas.eq("client_id", cfg().clientId);
      const { data, error } = await listaPessoas.order("nome");
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
      if (bloquearPessoasSemLogin(res, session)) return;
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
      const criador = Number(session.id);
      const novo = comDono({
        nome,
        email,
        perfil,
        status: "ativo",
        trocar_senha: true,
        senha_hash: hashSenha(senhaTemporaria),
        senha_alterada_em: null,
        criado_por: session.equipeInterna || !Number.isInteger(criador) ? null : criador
      });
      let { data, error } = await sb.from(cfg().tabelas.usuarios).insert(novo).select("id, nome, email, perfil, status, trocar_senha").single();
      if (colunaSenhaAlteradaAusente(error)) {
        const { senha_alterada_em: _ignorado, ...semData } = novo;
        ({ data, error } = await sb.from(cfg().tabelas.usuarios).insert(semData).select("id, nome, email, perfil, status, trocar_senha").single());
      }
      if (error?.code === "23505") {
        res.status(409).json({ error: "Este e-mail j\xE1 est\xE1 cadastrado." });
        return;
      }
      if (error || !data) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel liberar o acesso." });
        return;
      }
      const cliente = await carregarClienteDoPortal(sb);
      if (!cliente?.id) {
        await sb.from(cfg().tabelas.usuarios).delete().eq("id", data.id);
        res.status(503).json({ error: `Cliente ${cfg().clienteBusca || cfg().rotulo} n\xE3o encontrado.` });
        return;
      }
      const vinculo = await vincularCadastroCliente(sb, {
        nome,
        email,
        senhaTemporaria,
        clientId: cliente.id,
        caminho: cfg().caminho,
        perfil,
        ativo: true
      });
      if (!vinculo.ok) {
        await sb.from(cfg().tabelas.usuarios).delete().eq("id", data.id);
        res.status(409).json({ error: vinculo.error });
        return;
      }
      const enviou = await sendCevaPortalAccessEmail({ nome, email, senhaTemporaria, rotulo: cfg().rotulo, caminho: cfg().caminho });
      const link = systemAppUrl(cfg().caminho);
      res.status(201).json({
        pessoa: { id: data.id, nome: data.nome, email: data.email, perfil: data.perfil, status: data.status, trocarSenha: true },
        senhaTemporaria,
        emailEnviado: enviou,
        mensagem: mensagemAcessoPortal({ nome, email, senha: senhaTemporaria, rotulo: cfg().rotulo, link, manteveSenha: false })
      });
      return;
    }
    if (op === "pessoas-item" && method === "PATCH") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (bloquearPessoasSemLogin(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: "O analista n\xE3o cadastra pessoas." });
        return;
      }
      const id = Number(req.query?.id || req.params?.id);
      const status = body?.status === "inativo" ? "inativo" : body?.status === "ativo" ? "ativo" : "";
      const querEditar = !status && (body?.nome != null || body?.email != null || body?.perfil != null);
      if (!Number.isInteger(id) || !status && !querEditar) {
        res.status(400).json({ error: "Informe a pessoa e a situa\xE7\xE3o." });
        return;
      }
      if (querEditar) {
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
        const sb2 = createSupabaseAdminClient();
        if (!sb2) {
          res.status(503).json({ error: "Portal indispon\xEDvel." });
          return;
        }
        let leituraPessoa2 = sb2.from(cfg().tabelas.usuarios).select("id, nome, email, perfil, status").eq("id", id);
        if (cfg().clientId != null) leituraPessoa2 = leituraPessoa2.eq("client_id", cfg().clientId);
        const { data: atual2, error: leitura2 } = await leituraPessoa2.maybeSingle();
        if (leitura2) {
          res.status(500).json({ error: "N\xE3o foi poss\xEDvel alterar a pessoa." });
          return;
        }
        if (!atual2) {
          res.status(404).json({ error: "Pessoa n\xE3o encontrada." });
          return;
        }
        const saiDeAdmin = atual2.perfil === "administrador" && atual2.status !== "inativo" && perfil !== "administrador";
        if (saiDeAdmin && !await outroAdministradorVivo(sb2, id)) {
          res.status(409).json({ error: "O portal precisa manter pelo menos um administrador." });
          return;
        }
        let outroEmail = sb2.from(cfg().tabelas.usuarios).select("id").ilike("email", email).neq("id", id);
        if (cfg().clientId != null) outroEmail = outroEmail.eq("client_id", cfg().clientId);
        const duplicado = await outroEmail.maybeSingle();
        if (duplicado.error) {
          res.status(500).json({ error: "N\xE3o foi poss\xEDvel alterar a pessoa." });
          return;
        }
        if (duplicado.data) {
          res.status(409).json({ error: "Este e-mail j\xE1 est\xE1 cadastrado." });
          return;
        }
        const emailAntigo = String(atual2.email || "");
        const ficha = await sb2.from("system_users").select("id, permissions, user_type").ilike("email", emailAntigo).maybeSingle();
        const fichaPortal = ficha.data && String(ficha.data.user_type || "") === "client" && usuarioSoPortal(ficha.data.permissions) ? ficha.data : null;
        if (fichaPortal && email !== emailAntigo) {
          const ocupado = await sb2.from("system_users").select("id").ilike("email", email).neq("id", fichaPortal.id).maybeSingle();
          if (ocupado.data) {
            res.status(409).json({ error: "Este e-mail j\xE1 est\xE1 cadastrado." });
            return;
          }
        }
        let atualizaPessoa2 = sb2.from(cfg().tabelas.usuarios).update({ nome, email, perfil, atualizado_em: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id);
        if (cfg().clientId != null) atualizaPessoa2 = atualizaPessoa2.eq("client_id", cfg().clientId);
        const { data: data2, error: error2 } = await atualizaPessoa2.select("id, nome, email, perfil, status").single();
        if (error2 || !data2) {
          res.status(500).json({ error: "N\xE3o foi poss\xEDvel alterar a pessoa." });
          return;
        }
        if (fichaPortal) {
          const { error: erroFicha } = await sb2.from("system_users").update({
            name: nome,
            email,
            permissions: permissoesDoPortal(cfg().caminho, perfil)
          }).eq("id", fichaPortal.id);
          if (erroFicha) {
            res.status(500).json({ error: "A pessoa mudou no portal, mas o cadastro do sistema n\xE3o acompanhou." });
            return;
          }
        }
        res.status(200).json({ pessoa: data2 });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      let leituraPessoa = sb.from(cfg().tabelas.usuarios).select("id, perfil, status, senha_hash").eq("id", id);
      if (cfg().clientId != null) leituraPessoa = leituraPessoa.eq("client_id", cfg().clientId);
      const { data: atual, error: leitura } = await leituraPessoa.maybeSingle();
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
      let atualizaPessoa = sb.from(cfg().tabelas.usuarios).update({ status: proximo, atualizado_em: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id);
      if (cfg().clientId != null) atualizaPessoa = atualizaPessoa.eq("client_id", cfg().clientId);
      const { data, error } = await atualizaPessoa.select("id, nome, email, perfil, status").single();
      if (error || !data) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel alterar a pessoa." });
        return;
      }
      if (data.email) await alinharStatusCadastroPortal(sb, String(data.email), proximo === "ativo");
      res.status(200).json({ pessoa: data });
      return;
    }
    if (op === "pessoas-item" && method === "DELETE") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (bloquearPessoasSemLogin(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: "O analista n\xE3o cadastra pessoas." });
        return;
      }
      const id = Number(req.query?.id || req.params?.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Informe a pessoa." });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      let leituraPessoa = sb.from(cfg().tabelas.usuarios).select("id, email, perfil").eq("id", id);
      if (cfg().clientId != null) leituraPessoa = leituraPessoa.eq("client_id", cfg().clientId);
      const { data: atual, error: leitura } = await leituraPessoa.maybeSingle();
      if (leitura) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel remover a pessoa." });
        return;
      }
      if (!atual) {
        res.status(404).json({ error: "Pessoa n\xE3o encontrada." });
        return;
      }
      if (!podeRemoverPessoa(atual.perfil)) {
        res.status(403).json({ error: "Administrador n\xE3o remove administrador." });
        return;
      }
      let apaga = sb.from(cfg().tabelas.usuarios).delete().eq("id", id);
      if (cfg().clientId != null) apaga = apaga.eq("client_id", cfg().clientId);
      const { error } = await apaga;
      if (error) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel remover a pessoa." });
        return;
      }
      if (atual.email) await alinharStatusCadastroPortal(sb, String(atual.email), false);
      res.status(200).json({ ok: true });
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
        const { montarMissaoAoVivo: montarMissaoAoVivo2, ordenarMissoesAoVivo: ordenarMissoesAoVivo2, segueNoAoVivo: segueNoAoVivo2, STATUS_AO_VIVO: STATUS_AO_VIVO2 } = await Promise.resolve().then(() => (init_aoVivo(), aoVivo_exports));
        const cliente = await carregarClienteDoPortal(sb);
        if (!cliente?.name) {
          res.status(503).json({ error: `Cliente ${cfg().clienteBusca || cfg().rotulo} n\xE3o encontrado.` });
          return;
        }
        const { data, error } = await sb.from("missions").select("id, status, start_time, end_time, mission_type, driver_name, origin, destination, client_vehicle, start_km, end_km, billing_approved").eq("client", cliente.name).in("status", [...STATUS_AO_VIVO2]).order("start_time", { ascending: false }).limit(500);
        if (error) throw error;
        if ((data || []).length >= 500) {
          res.status(503).json({ error: "A consulta das miss\xF5es em andamento n\xE3o fechou." });
          return;
        }
        const linhas = data || [];
        const plates = await loadPlates(sb, linhas.map((row) => row.client_vehicle));
        let campos = /* @__PURE__ */ new Map();
        try {
          campos = await loadCamposCliente(sb, linhas.map((row) => String(row.id || "")));
        } catch (error2) {
          if (!tabelaAusenteNoBanco(error2) && (cfg().exigeLogin || !acessoNegado(error2))) throw error2;
        }
        const missoes = ordenarMissoesAoVivo2(linhas.flatMap((row) => {
          if (!segueNoAoVivo2(row)) return [];
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
        console.error(`[${cfg().logPrefix}] ao-vivo`, error instanceof Error ? error.message : error);
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
        const clientRow = await carregarClienteDoPortal(sb);
        if (!clientRow?.name) {
          res.status(503).json({ error: `Cliente ${cfg().clienteBusca || cfg().rotulo} n\xE3o encontrado.` });
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
        let campos;
        let catalogo;
        try {
          [campos, catalogo] = await Promise.all([
            loadCamposCliente(sb, missionIds),
            loadCatalogo(sb)
          ]);
        } catch (error) {
          if (!tabelaAusenteNoBanco(error) && (cfg().exigeLogin || !acessoNegado(error))) throw error;
          console.error(`[${cfg().logPrefix}] campos do cliente sem leitura; o boletim segue s\xF3 com as OS`);
          campos = /* @__PURE__ */ new Map();
          catalogo = {
            solicitante: [],
            quemAutorizou: [],
            servico: [],
            contrato: [],
            operacao: [],
            tsp: [],
            atendimentoPgr: []
          };
        }
        const porOs = new Map(missions.map((row) => [numeroOsDoBoletim2(row.id), row]));
        for (const item of items) {
          const salvo = campos.get(`GTM-${item.os}`);
          aplicarCamposCliente(item, salvo, servicoDoSistema2);
          const mission = porOs.get(item.os);
          const linha = item;
          linha.telefone = String(mission?.driver_phone || "").trim() || null;
          linha.identificacao = String(mission?.reference_number || "").trim() || null;
          linha.origem = String(mission?.origin || "").trim() || null;
          linha.destino = String(mission?.destination || "").trim() || null;
          if (!item.placa && salvo?.placa) item.placa = String(salvo.placa);
          if (!item.local && mission?.origin && mission?.destination) {
            item.local = `${mission.origin} x ${mission.destination}`;
          }
        }
        try {
          const { medicaoDaLinha: medicaoDaLinha2 } = await Promise.resolve().then(() => (init_medicao(), medicao_exports));
          const medicoes = /* @__PURE__ */ new Map();
          for (const part of chunks(missionIds, 200)) {
            const { data, error } = await sb.from("portal_medicao_cliente").select("mission_id, status, itens, justificativa, modificado_em").in("mission_id", part);
            if (error) {
              const codigo = String(error.code || "");
              if (codigo === "42P01" || codigo === "PGRST205" || codigo === "PGRST204") break;
              throw error;
            }
            for (const row of data || []) medicoes.set(String(row.mission_id), row);
          }
          for (const item of items) {
            const medicao = medicaoDaLinha2(medicoes.get(`GTM-${item.os}`));
            if (medicao) item.medicao = medicao;
          }
        } catch (error) {
          console.error(`[${cfg().logPrefix}] medicao`, error instanceof Error ? error.message : error);
        }
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
          console.error(`[${cfg().logPrefix}] relatorio incompleto`, error.reason);
          res.status(503).json({ error: "O conjunto de OS do boletim n\xE3o fechou. Nada foi exibido para n\xE3o inventar n\xFAmero." });
          return;
        }
        const message = error instanceof Error ? error.message : error?.message || "falha";
        console.error(`[${cfg().logPrefix}] relatorio`, message);
        res.status(500).json({ error: `N\xE3o foi poss\xEDvel carregar as OS da ${cfg().rotulo}.` });
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
      const { data: mission, error: missionError } = await sb.from("missions").select("id").eq("id", missionId).eq("client", (await carregarClienteDoPortal(sb))?.name || cfg().clienteNome).maybeSingle();
      if (missionError) {
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel conferir a OS." });
        return;
      }
      if (!mission) {
        res.status(404).json({ error: `OS n\xE3o encontrada no boletim da ${cfg().rotulo}.` });
        return;
      }
      try {
        if (campo === "atendimentoPgr") {
          const texto5 = textoPgr2(valor);
          const atual = await gravarColuna(sb, missionId, "atendimentoPgr", texto5 || null);
          const anterior = atual?.atendimento_pgr ?? null;
          if ((anterior || "") !== texto5) {
            const { error: histError } = await sb.from(cfg().tabelas.pgrHistorico).insert(comDono({
              mission_id: missionId,
              valor: texto5,
              valor_anterior: anterior,
              alterado_por: session?.name || `Portal ${cfg().rotulo}`
            }));
            if (histError) throw histError;
          }
          res.status(200).json({ valor: texto5 || null });
          return;
        }
        if (!ehCampoFiltro2(campo)) {
          res.status(400).json({ error: "Campo inv\xE1lido." });
          return;
        }
        let leituraCatalogo = sb.from(cfg().tabelas.catalogo).select("valor").eq("campo", CATALOGO_CAMPO[campo]);
        if (cfg().clientId != null) leituraCatalogo = leituraCatalogo.eq("client_id", cfg().clientId);
        const { data: linhas, error: catError } = await leituraCatalogo;
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
          const { error: novoError } = await sb.from(cfg().tabelas.catalogo).upsert(
            comDono({ campo: CATALOGO_CAMPO[campo], valor: decisao.nome }),
            { onConflict: conflitoCatalogo(), ignoreDuplicates: true }
          );
          if (novoError) throw novoError;
        }
        await gravarColuna(sb, missionId, campo, gravar);
        res.status(200).json({ valor: gravar, filtro: decisao.acao === "confirmar" ? decisao.nome : null });
      } catch (error) {
        const message = error instanceof Error ? error.message : "falha";
        console.error(`[${cfg().logPrefix}] campos`, message);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel salvar o campo." });
      }
      return;
    }
    if (op === "frota" && method === "GET") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      try {
        const cliente = await carregarClienteDoPortal(sb);
        if (!cliente?.id || !cliente?.name) {
          res.status(503).json({ error: `Cliente ${cfg().rotulo} n\xE3o encontrado.` });
          return;
        }
        const nomes = [String(cliente.name).trim()];
        const fantasia = String(cliente.trading_name || "").trim();
        if (fantasia && fantasia !== nomes[0]) nomes.push(fantasia);
        const { listarFrotaPortal: listarFrotaPortal2 } = await Promise.resolve().then(() => (init_frota(), frota_exports));
        const frota = await listarFrotaPortal2(sb, nomes, Number(cliente.id));
        res.status(200).json(frota);
      } catch (error) {
        console.error(`[${cfg().logPrefix}] frota`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel carregar motoristas e ve\xEDculos." });
      }
      return;
    }
    if (op === "catalogo" && method === "GET") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      try {
        const catalogo = await loadCatalogo(sb);
        res.status(200).json({ catalogo });
      } catch (error) {
        console.error(`[${cfg().logPrefix}] catalogo`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel carregar as listas." });
      }
      return;
    }
    if (op === "catalogo" && method === "POST") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const { COLUNA_LISTA_SOLICITACAO: COLUNA_LISTA_SOLICITACAO2, decidirNomeCatalogo: decidirNomeCatalogo2, ehCampoLista: ehCampoLista2 } = await Promise.resolve().then(() => (init_camposCliente(), camposCliente_exports));
      const campo = String(body?.campo || "");
      if (!ehCampoLista2(campo)) {
        res.status(400).json({ error: "Informe a lista: opera\xE7\xE3o, quem autorizou, contrato, TSP ou atendimento PGR." });
        return;
      }
      const confirmarNovo = body?.confirmarNovo === true;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      try {
        const coluna = COLUNA_LISTA_SOLICITACAO2[campo];
        let leituraCatalogo = sb.from(cfg().tabelas.catalogo).select("valor").eq("campo", coluna);
        if (cfg().clientId != null) leituraCatalogo = leituraCatalogo.eq("client_id", cfg().clientId);
        const { data: linhas, error: catError } = await leituraCatalogo;
        if (catError) throw catError;
        const catalogo = (linhas || []).map((row) => String(row.valor));
        const decisao = decidirNomeCatalogo2(String(body?.valor ?? ""), catalogo);
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
          const { error: novoError } = await sb.from(cfg().tabelas.catalogo).upsert(
            comDono({ campo: coluna, valor: nome }),
            { onConflict: conflitoCatalogo(), ignoreDuplicates: true }
          );
          if (novoError) throw novoError;
        }
        res.status(200).json({ valor: nome });
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : String(error);
        console.error(`[${cfg().logPrefix}] catalogo`, mensagem);
        const trava = /check constraint|catalogo_campo_check|23514/i.test(mensagem);
        res.status(trava ? 503 : 500).json({
          error: trava ? "Essa lista ainda n\xE3o est\xE1 liberada no banco. Opera\xE7\xE3o, quem autorizou, contrato e TSP continuam." : "N\xE3o foi poss\xEDvel incluir o nome."
        });
      }
      return;
    }
    if (op === "catalogo" && method === "DELETE") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (session.perfil !== "administrador") {
        res.status(403).json({ error: "S\xF3 o administrador remove um nome da lista." });
        return;
      }
      const { COLUNA_LISTA_SOLICITACAO: COLUNA_LISTA_SOLICITACAO2, decidirNomeCatalogo: decidirNomeCatalogo2, ehCampoLista: ehCampoLista2 } = await Promise.resolve().then(() => (init_camposCliente(), camposCliente_exports));
      const campo = String(body?.campo || "");
      if (!ehCampoLista2(campo)) {
        res.status(400).json({ error: "Informe a lista." });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      try {
        const coluna = COLUNA_LISTA_SOLICITACAO2[campo];
        let leituraCatalogo = sb.from(cfg().tabelas.catalogo).select("valor").eq("campo", coluna);
        if (cfg().clientId != null) leituraCatalogo = leituraCatalogo.eq("client_id", cfg().clientId);
        const { data: linhas, error: catError } = await leituraCatalogo;
        if (catError) throw catError;
        const catalogo = (linhas || []).map((row) => String(row.valor));
        const decisao = decidirNomeCatalogo2(String(body?.valor ?? ""), catalogo);
        const nome = decisao.acao === "aplicar" ? decisao.valor : decisao.acao === "confirmar" ? decisao.nome : "";
        if (!nome || !catalogo.some((item) => item === nome)) {
          res.status(404).json({ error: "Esse nome n\xE3o est\xE1 na lista." });
          return;
        }
        let apagar = sb.from(cfg().tabelas.catalogo).delete().eq("campo", coluna).eq("valor", nome);
        if (cfg().clientId != null) apagar = apagar.eq("client_id", cfg().clientId);
        const { error: delError } = await apagar;
        if (delError) throw delError;
        res.status(200).json({ valor: nome });
      } catch (error) {
        console.error(`[${cfg().logPrefix}] catalogo`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel remover o nome." });
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
        const clientRow = await carregarClienteDoPortal(sb);
        if (!clientRow?.name) {
          res.status(503).json({ error: `Cliente ${cfg().clienteBusca || cfg().rotulo} n\xE3o encontrado.` });
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
            let resposta = items;
            try {
              const { medicaoDaLinha: medicaoDaLinha2 } = await Promise.resolve().then(() => (init_medicao(), medicao_exports));
              const medicoes = /* @__PURE__ */ new Map();
              for (const part of chunks(items.map((item) => `GTM-${item.os}`), 200)) {
                const leitura = await sb.from("portal_medicao_cliente").select("mission_id, status, itens, justificativa, modificado_em").in("mission_id", part);
                if (leitura.error) {
                  const codigo = String(leitura.error.code || "");
                  if (codigo === "42P01" || codigo === "PGRST205" || codigo === "PGRST204") break;
                  throw leitura.error;
                }
                for (const row of leitura.data || []) {
                  const medicao = medicaoDaLinha2(row);
                  if (medicao) medicoes.set(String(row.mission_id), medicao);
                }
              }
              resposta = items.map((item) => ({ ...item, medicao: medicoes.get(`GTM-${item.os}`) || null }));
            } catch (error2) {
              console.error(`[${cfg().logPrefix}] medicao`, error2 instanceof Error ? error2.message : error2);
            }
            res.status(200).json({ atualizadoEm: (/* @__PURE__ */ new Date()).toISOString(), items: resposta });
            return;
          }
        }
        res.status(503).json({ error: `A consulta de status da ${cfg().rotulo} n\xE3o fechou.` });
      } catch (error) {
        console.error(`[${cfg().logPrefix}] status`, error instanceof Error ? error.message : error);
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
      const { data, error } = await sb.from(cfg().tabelas.pgrHistorico).select("valor, valor_anterior, alterado_em, alterado_por").eq("mission_id", `GTM-${os}`).order("alterado_em", { ascending: false }).limit(30);
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
      let lista = sb.from(cfg().tabelas.solicitacoes).select("id, numero, data_inicio, data_fim, solicitante, quem_autorizou, servico, atendimento_pgr, contrato, operacao, tsp, placa, motorista, franquia_hora, franquia_km, filled_by_name, filled_by_email, created_at");
      if (cfg().clientId != null) lista = lista.eq("client_id", cfg().clientId);
      const { data, error } = await lista.order("created_at", { ascending: false }).limit(200);
      if (error) {
        console.error(`[${cfg().logPrefix}] list`, error.message);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel carregar as solicita\xE7\xF5es." });
        return;
      }
      res.status(200).json({ items: (data || []).map(rowToJson) });
      return;
    }
    if (op === "solicitacoes" && method === "POST") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const { quantidadeDoPedido: quantidadeDoPedido2, validarPedidoPortal: validarPedidoPortal2 } = await Promise.resolve().then(() => (init_pedido(), pedido_exports));
      const draft = validarPedidoPortal2(body, session.name);
      if (!draft.ok) {
        res.status(400).json({ error: draft.error });
        return;
      }
      const copias = quantidadeDoPedido2(body);
      if (!copias.ok) {
        res.status(400).json({ error: copias.error });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Portal indispon\xEDvel." });
        return;
      }
      const cliente = await carregarClienteDoPortal(sb);
      if (!cliente?.name) {
        res.status(503).json({ error: `Cliente ${cfg().rotulo} n\xE3o encontrado.` });
        return;
      }
      try {
        const nomeCliente = String(cliente.name || "").trim() || cfg().clienteNome;
        const { enviarEmailSolicitacao: enviarEmailSolicitacao2, registrarSolicitacaoPortal: registrarSolicitacaoPortal2 } = await Promise.resolve().then(() => (init_registrarOs(), registrarOs_exports));
        const { emailsDaSolicitacao: emailsDaSolicitacao2 } = await Promise.resolve().then(() => (init_pedido(), pedido_exports));
        const criadas = [];
        let incompleto = false;
        let ultimaFalha = null;
        for (let copia = 0; copia < copias.value; copia += 1) {
          try {
            const criado = await registrarSolicitacaoPortal2(sb, cfg(), draft.value, {
              id: session.id,
              email: session.email
            }, cliente.operational_email, Number(cliente.id) || null, { enviarEmail: false, clienteOficial: nomeCliente });
            criadas.push(criado.os);
          } catch (error) {
            incompleto = true;
            ultimaFalha = error;
            const { registrarFalhaSolicitacao: registrarFalhaSolicitacao2 } = await Promise.resolve().then(() => (init_erroRegistro(), erroRegistro_exports));
            registrarFalhaSolicitacao2(cfg().logPrefix, error, body);
            break;
          }
        }
        if (criadas.length === 0) {
          const { corpoErroSolicitacao: corpoErroSolicitacao2 } = await Promise.resolve().then(() => (init_erroRegistro(), erroRegistro_exports));
          res.status(500).json(corpoErroSolicitacao2(ultimaFalha));
          return;
        }
        let emailEnviado = false;
        try {
          emailEnviado = await enviarEmailSolicitacao2({
            destinatarios: emailsDaSolicitacao2(cliente.operational_email),
            os: criadas.join(", "),
            cliente: nomeCliente,
            pedido: draft.value
          });
        } catch (error) {
          console.error(`[${cfg().logPrefix}] e-mail da solicita\xE7\xE3o`, error instanceof Error ? error.message : error);
        }
        res.status(201).json({
          os: criadas[0],
          oss: criadas,
          quantidade: criadas.length,
          emailEnviado,
          incompleto,
          status: "Solicitada"
        });
      } catch (error) {
        const { registrarFalhaSolicitacao: registrarFalhaSolicitacao2, corpoErroSolicitacao: corpoErroSolicitacao2 } = await Promise.resolve().then(() => (init_erroRegistro(), erroRegistro_exports));
        registrarFalhaSolicitacao2(cfg().logPrefix, error, body);
        res.status(500).json(corpoErroSolicitacao2(error));
      }
      return;
    }
    if (op === "cotacao" && method === "GET") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Cota\xE7\xE3o indispon\xEDvel." });
        return;
      }
      try {
        const cliente = await carregarClienteDoPortal(sb);
        const { listarTabelasCotacao: listarTabelasCotacao2, listarHistoricoCotacoes: listarHistoricoCotacoes2 } = await Promise.resolve().then(() => (init_cotacaoHttp(), cotacaoHttp_exports));
        if (String(req.query?.lista || "") === "historico") {
          const pagina = Number(req.query?.pagina);
          const vigencia = String(req.query?.vigencia || "");
          const historico = await listarHistoricoCotacoes2(
            sb,
            cliente,
            Number.isFinite(pagina) ? pagina : 0,
            vigencia === "2026" || vigencia === "2027" ? vigencia : null
          );
          res.status(historico.status).json(historico.corpo);
          return;
        }
        const resultado = await listarTabelasCotacao2(sb, cliente);
        res.status(resultado.status).json(resultado.corpo);
      } catch (error) {
        console.error(`[${cfg().logPrefix}] cotacao`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel carregar a cota\xE7\xE3o." });
      }
      return;
    }
    if (op === "cotacao" && method === "POST") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Cota\xE7\xE3o indispon\xEDvel." });
        return;
      }
      try {
        const cliente = await carregarClienteDoPortal(sb);
        const { salvarPropostaPortal: salvarPropostaPortal2, propostaParaEmail: propostaParaEmail2, registrarCotacaoPortal: registrarCotacaoPortal2 } = await Promise.resolve().then(() => (init_cotacaoHttp(), cotacaoHttp_exports));
        if (String(body?.acao || "") === "registrar") {
          const gravado2 = await registrarCotacaoPortal2(sb, cliente, { name: session.name, email: session.email }, body || {});
          res.status(gravado2.status).json(gravado2.corpo);
          return;
        }
        if (String(body?.acao || "") === "email") {
          const { urlDoLinkPublico: urlDoLinkPublico2 } = await Promise.resolve().then(() => (init_linkProposta(), linkProposta_exports));
          const origemLink = String(req.headers?.origin || req.headers?.referer || "");
          const link = urlDoLinkPublico2(body?.link, origemLink || null);
          const preparado = await propostaParaEmail2(sb, cliente, { ...body || {}, autor: session.email, link });
          if (preparado.status !== 200 || !("ok" in preparado.corpo)) {
            res.status(preparado.status).json(preparado.corpo);
            return;
          }
          try {
            const { pdfAnexoAceito: pdfAnexoAceito2 } = await Promise.resolve().then(() => (init_gestaoCotacao(), gestaoCotacao_exports));
            const { nomeAnexoPdf: nomeAnexoPdf2 } = await Promise.resolve().then(() => (init_historicoCotacoes(), historicoCotacoes_exports));
            const anexo = pdfAnexoAceito2(String(body?.pdf || ""));
            if (!anexo.ok && !link) {
              res.status(400).json({ error: anexo.error });
              return;
            }
            const { sendMail: sendMail2, SMTP_FROM: SMTP_FROM2 } = await Promise.resolve().then(() => (init_smtp(), smtp_exports));
            await sendMail2({
              from: SMTP_FROM2,
              to: preparado.corpo.para,
              cc: preparado.corpo.copias.length ? preparado.corpo.copias : void 0,
              subject: preparado.corpo.assunto,
              text: link ? `${preparado.corpo.texto}

Acessar Proposta Comercial: ${link}` : preparado.corpo.texto,
              html: preparado.corpo.html,
              attachments: anexo.ok ? [{
                filename: nomeAnexoPdf2(body?.nomePdf, {
                  origem: String(body?.origem || ""),
                  destino: String(body?.destino || ""),
                  numero: body?.numero,
                  cliente: cliente?.name || cliente?.trading_name || ""
                }),
                content: Buffer.from(anexo.base64, "base64"),
                contentType: "application/pdf"
              }] : void 0
            });
            res.status(200).json({ ok: true, enviado: true, para: preparado.corpo.para, copias: preparado.corpo.copias });
          } catch (error) {
            console.error(`[${cfg().logPrefix}] cotacao email`, error instanceof Error ? error.message : error);
            res.status(200).json({ ok: true, enviado: false, aviso: "O e-mail n\xE3o saiu agora. A proposta continua dispon\xEDvel para o PDF." });
          }
          return;
        }
        const gravado = await salvarPropostaPortal2(sb, cliente, body || {});
        res.status(gravado.status).json(gravado.corpo);
      } catch (error) {
        console.error(`[${cfg().logPrefix}] cotacao`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel concluir a proposta." });
      }
      return;
    }
    if (op === "fotos" && method === "GET") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Fotos indispon\xEDveis." });
        return;
      }
      try {
        const cliente = await carregarClienteDoPortal(sb);
        const { lerFotosEvento: lerFotosEvento2 } = await Promise.resolve().then(() => (init_fotosMedicaoHttp(), fotosMedicaoHttp_exports));
        const endereco = String(req.originalUrl || req.url || "");
        const osNoCaminho = endereco.match(/\/fotos\/(\d+)/);
        const resultado = await lerFotosEvento2({ sb, os: String(req.query?.os || osNoCaminho?.[1] || ""), cliente });
        res.status(resultado.status).json(resultado.corpo);
      } catch (error) {
        console.error(`[${cfg().logPrefix}] fotos`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel carregar as fotos." });
      }
      return;
    }
    if (op === "medicao" && method === "POST") {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: "Medi\xE7\xE3o indispon\xEDvel." });
        return;
      }
      try {
        const cliente = await carregarClienteDoPortal(sb);
        const { gravarMedicaoPortal: gravarMedicaoPortal2 } = await Promise.resolve().then(() => (init_medicaoHttp(), medicaoHttp_exports));
        const { sendMail: sendMail2, SMTP_FROM: SMTP_FROM2 } = await Promise.resolve().then(() => (init_smtp(), smtp_exports));
        const { EMAIL_FINANCEIRO_MEDICAO: EMAIL_FINANCEIRO_MEDICAO2 } = await Promise.resolve().then(() => (init_medicao(), medicao_exports));
        const resultado = await gravarMedicaoPortal2({
          sb,
          os: String(body?.os || ""),
          cliente,
          autor: session.name || session.email,
          acao: String(body?.acao || ""),
          equipeInterna: session.equipeInterna === true,
          body: body || {},
          enviarEmail: async (texto5, anexo) => {
            await sendMail2({
              from: SMTP_FROM2,
              to: EMAIL_FINANCEIRO_MEDICAO2,
              subject: `Conferir medi\xE7\xE3o GTM-${String(body?.os || "").replace(/\D/g, "")} \u2014 ${cliente?.trading_name || cliente?.name || cfg().rotulo}`,
              text: texto5,
              attachments: anexo ? [anexo] : void 0
            });
          }
        });
        res.status(resultado.status).json(resultado.corpo);
      } catch (error) {
        const message = error instanceof Error ? error.message : "falha";
        console.error(`[${cfg().logPrefix}] medicao`, message);
        res.status(500).json({ error: "N\xE3o foi poss\xEDvel gravar a medi\xE7\xE3o." });
      }
      return;
    }
    res.status(404).json({ error: `Rota do portal ${cfg().rotulo} n\xE3o encontrada.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${cfg().logPrefix}]`, message);
    if (!res.headersSent) {
      res.status(500).json({ error: message || `Falha no portal ${cfg().rotulo}.` });
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handleCevaPortalHttp,
  handleClientePortalHttp,
  handleIblPortalHttp
});
