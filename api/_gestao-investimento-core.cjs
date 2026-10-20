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

// lib/investimentos/gestaoInvestimentoApi.ts
var gestaoInvestimentoApi_exports = {};
__export(gestaoInvestimentoApi_exports, {
  assertDiretoria: () => assertDiretoria,
  handleGestaoInvestimentoOp: () => handleGestaoInvestimentoOp,
  resolvePrincipal: () => resolvePrincipal
});
module.exports = __toCommonJS(gestaoInvestimentoApi_exports);
var import_crypto = require("crypto");

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

// lib/diretoriaAccess.ts
function normalizePersonName(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function canAccessDiretoriaMenu(user) {
  const n = normalizePersonName(String(user?.name || ""));
  if (!n) return false;
  return n.includes("thiago moreira") || n.includes("thiago santos");
}

// lib/osAnalysis/apiAuth.ts
var import_supabase_js2 = require("@supabase/supabase-js");
function extractUserIdFromToken(token) {
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
}
function headerValue(req, name) {
  const raw = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] || "").trim();
  return String(raw || "").trim();
}
function extractAuthToken(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  const raw = Array.isArray(auth) ? auth[0] : auth;
  const fromHeader = String(raw || "").replace(/^Bearer\s+/i, "").trim();
  if (fromHeader) return fromHeader;
  return headerValue(req, "x-auth-token");
}

// lib/investimentos/types.ts
var PROFILE_INCOMPLETE_MESSAGE = "Perfil incompleto. N\xE3o \xE9 poss\xEDvel emitir recomenda\xE7\xE3o personalizada com seguran\xE7a.";
var TARGET_RETURN_DISCLAIMER = "A meta de 1,5% a 2% ao m\xEAs (~19,6%\u201326,8% ao ano compostos) \xE9 objetivo agressivo de retorno, condicionado ao risco aceito. Rentabilidade passada ou projetada n\xE3o \xE9 garantia de resultado futuro. A IA n\xE3o compra, vende, resgata nem transfere recursos.";

// lib/investimentos/profileValidation.ts
var REQUIRED_PROFILE_FIELDS = [
  { key: "person_type", label: "Pessoa f\xEDsica ou jur\xEDdica", validate: (p) => p.person_type === "PF" || p.person_type === "PJ" },
  { key: "capital_available", label: "Capital dispon\xEDvel", validate: (p) => p.capital_available != null && p.capital_available > 0 },
  { key: "emergency_reserve", label: "Reserva de emerg\xEAncia", validate: (p) => p.emergency_reserve != null && p.emergency_reserve >= 0 },
  { key: "max_per_investment", label: "Valor m\xE1ximo por investimento", validate: (p) => p.max_per_investment != null && p.max_per_investment > 0 },
  { key: "horizon_months", label: "Horizonte de investimento", validate: (p) => p.horizon_months != null && p.horizon_months > 0 },
  { key: "liquidity_need", label: "Necessidade de liquidez", validate: (p) => !!p.liquidity_need },
  { key: "max_loss_pct", label: "Percentual m\xE1ximo de perda toler\xE1vel", validate: (p) => p.max_loss_pct != null && p.max_loss_pct >= 0 },
  { key: "risk_profile", label: "Perfil de risco", validate: (p) => !!p.risk_profile },
  { key: "exp_equity", label: "Experi\xEAncia com renda vari\xE1vel", validate: (p) => typeof p.exp_equity === "boolean" },
  { key: "exp_private_credit", label: "Experi\xEAncia com cr\xE9dito privado", validate: (p) => typeof p.exp_private_credit === "boolean" },
  { key: "exp_fii", label: "Experi\xEAncia com fundos imobili\xE1rios", validate: (p) => typeof p.exp_fii === "boolean" },
  { key: "exp_crypto", label: "Experi\xEAncia com criptomoedas", validate: (p) => typeof p.exp_crypto === "boolean" },
  { key: "needs_monthly_income", label: "Necessidade de renda mensal", validate: (p) => typeof p.needs_monthly_income === "boolean" },
  { key: "investor_category", label: "Categoria do investidor", validate: (p) => !!p.investor_category }
];
function evaluateProfileCompleteness(profile) {
  if (!profile) {
    return {
      complete: false,
      missing: REQUIRED_PROFILE_FIELDS.map((f) => f.label),
      message: PROFILE_INCOMPLETE_MESSAGE
    };
  }
  const missing = REQUIRED_PROFILE_FIELDS.filter((f) => !f.validate(profile)).map((f) => f.label);
  if (profile.needs_monthly_income === true) {
    if (profile.monthly_income_amount == null || profile.monthly_income_amount < 0) {
      missing.push("Valor da renda mensal necess\xE1ria");
    }
  }
  if (profile.allows_crypto === true && typeof profile.exp_crypto !== "boolean") {
    missing.push("Experi\xEAncia com criptomoedas (obrigat\xF3ria se cripto autorizada)");
  }
  const unique = [...new Set(missing)];
  return {
    complete: unique.length === 0,
    missing: unique,
    message: unique.length === 0 ? null : PROFILE_INCOMPLETE_MESSAGE
  };
}
function createDraftInvestorProfile(partial) {
  return {
    person_type: null,
    capital_available: 1e5,
    emergency_reserve: null,
    max_per_investment: null,
    horizon_months: null,
    liquidity_need: null,
    max_loss_pct: null,
    risk_profile: null,
    exp_equity: null,
    exp_private_credit: null,
    exp_fii: null,
    exp_crypto: null,
    needs_monthly_income: null,
    monthly_income_amount: null,
    restricted_sectors: "",
    restricted_institutions: "",
    investor_category: null,
    allows_crypto: false,
    allows_international: false,
    monthly_target_pct_min: 1.5,
    monthly_target_pct_max: 2,
    broker_default: "XP",
    trading_sleeve_pct: 20,
    notes: "",
    ...partial
  };
}

// lib/investimentos/fundacaoSql.ts
var GESTAO_INVESTIMENTO_FUNDACAO_SQL = `-- ============================================================================
-- Gest\xE3o Investimento \u2014 Fase 2 (funda\xE7\xE3o)
-- Perfil do investidor, carteira manual, watchlist, limites, fontes e auditoria.
--
-- N\xC3O aplicar em produ\xE7\xE3o sem autoriza\xE7\xE3o expl\xEDcita.
-- Como aplicar (ap\xF3s OK): Supabase Studio \u2192 SQL Editor \u2192 RUN
--   ou: node scripts/apply-gestao-investimento-migration.mjs (quando existir)
--
-- A IA N\xC3O est\xE1 autorizada a comprar, vender, resgatar ou transferir.
-- Meta 1,5%\u20132% a.m. \xE9 objetivo agressivo (~19,6%\u201326,8% a.a. compostos), n\xE3o garantia.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Perfil do investidor (bloqueia recomenda\xE7\xF5es personalizadas se incompleto)
CREATE TABLE IF NOT EXISTS public.investor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  person_type TEXT CHECK (person_type IN ('PF', 'PJ')),
  capital_available NUMERIC(18,2),
  emergency_reserve NUMERIC(18,2),
  max_per_investment NUMERIC(18,2),
  horizon_months INTEGER,
  liquidity_need TEXT CHECK (liquidity_need IN ('D0', 'D1', 'D30', 'D90', 'ILLIQUID_OK')),
  max_loss_pct NUMERIC(8,4),
  risk_profile TEXT CHECK (risk_profile IN ('conservador', 'moderado', 'arrojado', 'agressivo')),
  exp_equity BOOLEAN,
  exp_private_credit BOOLEAN,
  exp_fii BOOLEAN,
  exp_crypto BOOLEAN,
  needs_monthly_income BOOLEAN,
  monthly_income_amount NUMERIC(18,2),
  restricted_sectors TEXT DEFAULT '',
  restricted_institutions TEXT DEFAULT '',
  investor_category TEXT CHECK (investor_category IN ('geral', 'qualificado', 'profissional')),
  allows_crypto BOOLEAN DEFAULT FALSE,
  allows_international BOOLEAN DEFAULT FALSE,
  monthly_target_pct_min NUMERIC(8,4) DEFAULT 1.5,
  monthly_target_pct_max NUMERIC(8,4) DEFAULT 2.0,
  broker_default TEXT DEFAULT 'XP',
  notes TEXT DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  data_reference_at TIMESTAMPTZ,
  analysis_model TEXT,
  prompt_version TEXT,
  integrity_hash TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_investor_profiles_owner
  ON public.investor_profiles (owner_user_id);

-- Portf\xF3lio l\xF3gico (um por dono na Fase 2)
CREATE TABLE IF NOT EXISTS public.investment_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Carteira XP',
  base_currency TEXT NOT NULL DEFAULT 'BRL',
  broker TEXT DEFAULT 'XP',
  monitored_capital NUMERIC(18,2) DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id)
);

-- Posi\xE7\xF5es manuais (XP etc.)
CREATE TABLE IF NOT EXISTS public.investment_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  portfolio_id UUID REFERENCES public.investment_portfolios(id) ON DELETE SET NULL,
  instrument_name TEXT NOT NULL,
  instrument_code TEXT DEFAULT '',
  instrument_type TEXT NOT NULL DEFAULT 'outros',
  quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  avg_price NUMERIC(18,6) NOT NULL DEFAULT 0,
  current_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  entry_date DATE,
  broker TEXT DEFAULT 'XP',
  taxation_notes TEXT DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'BRL',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  data_reference_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_positions_owner_active
  ON public.investment_positions (owner_user_id, is_active);

-- Watchlist
CREATE TABLE IF NOT EXISTS public.investment_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  instrument_name TEXT NOT NULL,
  instrument_code TEXT DEFAULT '',
  instrument_type TEXT NOT NULL DEFAULT 'outros',
  notes TEXT DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'observar'
    CHECK (status IN ('observar', 'candidato', 'evitar')),
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_watchlists_owner
  ON public.investment_watchlists (owner_user_id);

-- Limites de diversifica\xE7\xE3o / risco
CREATE TABLE IF NOT EXISTS public.investment_risk_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  max_pct_per_asset NUMERIC(8,4) DEFAULT 20,
  max_pct_per_issuer NUMERIC(8,4) DEFAULT 25,
  max_pct_per_institution NUMERIC(8,4) DEFAULT 40,
  max_pct_per_class NUMERIC(8,4) DEFAULT 40,
  max_pct_illiquid NUMERIC(8,4) DEFAULT 15,
  max_pct_private_credit NUMERIC(8,4) DEFAULT 20,
  max_pct_fx NUMERIC(8,4) DEFAULT 10,
  max_pct_crypto NUMERIC(8,4) DEFAULT 0,
  min_cash_pct NUMERIC(8,4) DEFAULT 5,
  emergency_reserve_untouchable BOOLEAN DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id)
);

-- Fontes de dados (cadastro \u2014 coleta vem nas fases seguintes)
CREATE TABLE IF NOT EXISTS public.investment_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  url TEXT DEFAULT '',
  reliability TEXT NOT NULL DEFAULT 'media'
    CHECK (reliability IN ('alta', 'media', 'baixa', 'oficial')),
  license_notes TEXT DEFAULT '',
  last_collected_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.investment_data_sources (code, name, url, reliability, license_notes)
VALUES
  ('tesouro', 'Tesouro Direto', 'https://www.tesourodireto.com.br', 'oficial', 'Fonte oficial'),
  ('bcb', 'Banco Central do Brasil', 'https://www.bcb.gov.br', 'oficial', 'Fonte oficial'),
  ('cvm', 'CVM', 'https://www.gov.br/cvm', 'oficial', 'Fonte oficial'),
  ('anbima', 'ANBIMA', 'https://www.anbima.com.br', 'oficial', 'Fonte oficial'),
  ('b3', 'B3', 'https://www.b3.com.br', 'oficial', 'Fonte oficial'),
  ('ibge', 'IBGE', 'https://www.ibge.gov.br', 'oficial', 'Fonte oficial'),
  ('manual_xp', 'Lan\xE7amento manual XP', '', 'media', 'Posi\xE7\xF5es informadas pelo investidor')
ON CONFLICT (code) DO NOTHING;

-- Auditoria imut\xE1vel (append-only na pr\xE1tica da aplica\xE7\xE3o)
CREATE TABLE IF NOT EXISTS public.investment_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  payload JSONB DEFAULT '{}'::jsonb,
  integrity_hash TEXT,
  source TEXT DEFAULT 'app',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_audit_log_owner_created
  ON public.investment_audit_log (owner_user_id, created_at DESC);

-- RLS: m\xF3dulo restrito \u2014 service role (API) bypassa, anon sem acesso amplo.
ALTER TABLE public.investor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_risk_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_audit_log ENABLE ROW LEVEL SECURITY;

-- Leitura autenticada apenas das fontes (n\xE3o sens\xEDvel)
DROP POLICY IF EXISTS "Authenticated read investment_data_sources" ON public.investment_data_sources;
CREATE POLICY "Authenticated read investment_data_sources"
  ON public.investment_data_sources
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.investor_profiles IS
  'Perfil do investidor \u2014 Gest\xE3o Investimento. Sem perfil completo n\xE3o h\xE1 recomenda\xE7\xE3o personalizada.';
COMMENT ON TABLE public.investment_positions IS
  'Posi\xE7\xF5es manuais (ex.: XP). Sem execu\xE7\xE3o autom\xE1tica de ordens.';
COMMENT ON TABLE public.investment_audit_log IS
  'Auditoria de an\xE1lises, altera\xE7\xF5es de perfil/carteira e decis\xF5es humanas.';

-- Recarrega cache do PostgREST (Supabase)
NOTIFY pgrst, 'reload schema';
`;

// lib/investimentos/mesaSql.ts
var GESTAO_INVESTIMENTO_MESA_SQL = `
-- Sleeve de trading + marca\xE7\xE3o manual de pre\xE7o (sem API de corretora)
ALTER TABLE public.investor_profiles
  ADD COLUMN IF NOT EXISTS trading_sleeve_pct NUMERIC(8,4) DEFAULT 20;

ALTER TABLE public.investment_positions
  ADD COLUMN IF NOT EXISTS sleeve TEXT DEFAULT 'investimento';

ALTER TABLE public.investment_positions
  ADD COLUMN IF NOT EXISTS last_mark_price NUMERIC(18,6);

ALTER TABLE public.investment_positions
  ADD COLUMN IF NOT EXISTS last_mark_at TIMESTAMPTZ;

ALTER TABLE public.investment_positions
  ADD COLUMN IF NOT EXISTS target_sell_pct NUMERIC(8,4) DEFAULT 3;

ALTER TABLE public.investment_positions
  ADD COLUMN IF NOT EXISTS stop_loss_pct NUMERIC(8,4) DEFAULT 2;

-- Hist\xF3rico de opera\xE7\xF5es semi-manuais (voc\xEA compra/vende no banco; o sistema registra)
CREATE TABLE IF NOT EXISTS public.investment_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  position_id UUID REFERENCES public.investment_positions(id) ON DELETE SET NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  instrument_name TEXT NOT NULL,
  instrument_code TEXT DEFAULT '',
  instrument_type TEXT NOT NULL DEFAULT 'acao',
  sleeve TEXT NOT NULL DEFAULT 'trading',
  quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  price NUMERIC(18,6) NOT NULL DEFAULT 0,
  amount_brl NUMERIC(18,2) NOT NULL DEFAULT 0,
  broker TEXT DEFAULT 'XP',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proof_note TEXT DEFAULT '',
  proof_image TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  rotated_buy_code TEXT DEFAULT '',
  rotated_buy_name TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_trades_owner_at
  ON public.investment_trades (owner_user_id, executed_at DESC);

ALTER TABLE public.investment_trades ENABLE ROW LEVEL SECURITY;
`;

// lib/investimentos/schemaMigrations.ts
var REQUIRED_TABLES = [
  "investor_profiles",
  "investment_portfolios",
  "investment_positions",
  "investment_watchlists",
  "investment_risk_limits",
  "investment_data_sources",
  "investment_audit_log"
];
async function applySqlBundle(client, sql) {
  const statements = splitStatements(sql);
  const errors = [];
  for (const statement of statements) {
    try {
      const rpcResult = await Promise.race([
        client.rpc("exec_sql", { sql: `${statement};` }),
        new Promise(
          (resolve) => setTimeout(() => resolve({ error: { message: "exec_sql timeout 8s" } }), 8e3)
        )
      ]);
      const error = rpcResult?.error;
      if (error) {
        const msg = String(error.message || error);
        if (!/already exists|duplicate|already exists/i.test(msg)) {
          errors.push(msg.slice(0, 180));
        }
      }
    } catch (e) {
      const msg = String(e?.message || e);
      if (!/already exists|duplicate/i.test(msg)) {
        errors.push(msg.slice(0, 180));
      }
    }
  }
  return errors;
}
function stripSqlLineComments(sql) {
  return sql.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("--")) return "";
    const inSingle = false;
    const idx = line.indexOf("--");
    if (idx >= 0 && !inSingle) return line.slice(0, idx);
    return line;
  }).join("\n");
}
function splitStatements(sql) {
  return stripSqlLineComments(sql).split(";").map((block) => block.replace(/\s+/g, " ").trim()).filter(Boolean);
}
async function isGestaoInvestimentoSchemaReady() {
  const client = createSupabaseAdminClient();
  if (!client) return false;
  const { error } = await client.from("investment_data_sources").select("code").limit(1);
  return !error;
}
async function runGestaoInvestimentoMigrations() {
  const client = createSupabaseAdminClient();
  if (!client) {
    return { ok: false, message: "Supabase admin indispon\xEDvel", applied: false };
  }
  const ready = await isGestaoInvestimentoSchemaReady();
  const errors = [];
  let applied = false;
  if (!ready) {
    errors.push(...await applySqlBundle(client, GESTAO_INVESTIMENTO_FUNDACAO_SQL));
    applied = true;
    await new Promise((r) => setTimeout(r, 800));
  }
  const mesaErrors = await applySqlBundle(client, GESTAO_INVESTIMENTO_MESA_SQL);
  if (mesaErrors.length) errors.push(...mesaErrors);
  else if (ready) applied = true;
  for (const table of REQUIRED_TABLES) {
    let lastErr = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      const { error } = await client.from(table).select("*").limit(1);
      if (!error) {
        lastErr = "";
        break;
      }
      lastErr = error.message;
      if (!/schema cache|Could not find the table/i.test(error.message)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (lastErr) {
      return {
        ok: false,
        message: `Tabela ${table} inacess\xEDvel ap\xF3s migration: ${lastErr}${errors.length ? ` | ${errors[0]}` : ""}`,
        applied
      };
    }
  }
  if (errors.length) {
    console.warn("[GestaoInvestimento] Migration avisos:", errors.join(" | "));
  }
  console.log("[GestaoInvestimento] Schema funda\xE7\xE3o + mesa aplicado/verificado.");
  return { ok: true, message: ready ? "Schema Gest\xE3o Investimento OK (mesa verificada)" : "Schema Gest\xE3o Investimento OK", applied };
}

// lib/investimentos/targetReturn.ts
function monthlyPctToAnnualCompoundPct(monthlyPct) {
  const r = monthlyPct / 100;
  return (Math.pow(1 + r, 12) - 1) * 100;
}
function describeMonthlyTargetBand(monthlyMinPct = 1.5, monthlyMaxPct = 2) {
  const min = Number(monthlyMinPct);
  const max = Number(monthlyMaxPct);
  return {
    monthlyMinPct: min,
    monthlyMaxPct: max,
    annualMinPct: round4(monthlyPctToAnnualCompoundPct(min)),
    annualMaxPct: round4(monthlyPctToAnnualCompoundPct(max)),
    disclaimer: TARGET_RETURN_DISCLAIMER
  };
}
function buildProvision30dEstimate(capitalBase, monthlyMinPct = 1.5, monthlyMaxPct = 2) {
  const capital = Math.max(0, Number(capitalBase) || 0);
  const min = Number(monthlyMinPct);
  const max = Number(monthlyMaxPct);
  const mid = (min + max) / 2;
  const pessimisticPct = round4(min * 0.3);
  const basePct = round4(mid);
  const optimisticPct = round4(max);
  return {
    capitalBase: capital,
    days: 30,
    pessimisticBrl: round2(capital * (pessimisticPct / 100)),
    baseBrl: round2(capital * (basePct / 100)),
    optimisticBrl: round2(capital * (optimisticPct / 100)),
    pessimisticPct,
    basePct,
    optimisticPct,
    kind: "cenario_objetivo",
    disclaimer: "Provis\xE3o de 30 dias em cen\xE1rios-objetivo com base na meta cadastrada. N\xE3o constitui garantia, promessa nem proje\xE7\xE3o de mercado. Rentabilidade pode ser zero ou negativa."
  };
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}

// lib/investimentos/marketRates.ts
var FALLBACK = {
  selicPct: null,
  cdiPct: null,
  ipcaPct: null,
  fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
  source: "fallback"
};
var cache = null;
var TTL_MS = 15 * 60 * 1e3;
async function fetchMacroRates() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6e3);
    const res = await fetch("https://brasilapi.com.br/api/taxas/v1", { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`taxas HTTP ${res.status}`);
    const rows = await res.json();
    const find = (name) => {
      const hit = rows.find((r) => String(r.nome || "").toLowerCase() === name);
      const v = Number(hit?.valor);
      return Number.isFinite(v) ? v : null;
    };
    const data = {
      selicPct: find("selic"),
      cdiPct: find("cdi"),
      ipcaPct: find("ipca"),
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: "brasilapi"
    };
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return FALLBACK;
  }
}
function formatPct(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return `${v.toFixed(digits)}%`;
}

// lib/investimentos/performanceProjection.ts
var HORIZONS = [
  { key: "d30", days: 30, label: "30d" },
  { key: "d60", days: 60, label: "60d" },
  { key: "d90", days: 90, label: "90d" },
  { key: "m6", days: 182, label: "6m" },
  { key: "y1", days: 365, label: "1a" }
];
function round22(n) {
  return Math.round(n * 100) / 100;
}
function compoundValue(principal, annualPct, days) {
  if (!(principal > 0) || !Number.isFinite(annualPct) || days <= 0) return principal;
  const factor = Math.pow(1 + annualPct / 100, days / 365);
  return round22(principal * factor);
}
function periodReturnPct(principal, future) {
  if (!(principal > 0)) return 0;
  return round22((future - principal) / principal * 100);
}
function buildHorizons(amountBrl, annualBasePct, annualBearPct, annualBullPct) {
  return HORIZONS.map((h) => {
    const valueBrl = compoundValue(amountBrl, annualBasePct, h.days);
    const row = {
      key: h.key,
      days: h.days,
      label: h.label,
      valueBrl,
      profitBrl: round22(valueBrl - amountBrl),
      returnPct: periodReturnPct(amountBrl, valueBrl)
    };
    if (annualBearPct != null && annualBullPct != null) {
      const bear = compoundValue(amountBrl, annualBearPct, h.days);
      const bull = compoundValue(amountBrl, annualBullPct, h.days);
      row.bearValueBrl = bear;
      row.bullValueBrl = bull;
      row.bearReturnPct = periodReturnPct(amountBrl, bear);
      row.bullReturnPct = periodReturnPct(amountBrl, bull);
    }
    return row;
  });
}
function buildAssetPerformanceOutlook(amountBrl, product, rates) {
  const asOf = rates?.fetchedAt || (/* @__PURE__ */ new Date()).toISOString();
  const selic = rates?.selicPct ?? 14;
  const cdi = rates?.cdiPct ?? selic - 0.1;
  const ipca = rates?.ipcaPct ?? 4.5;
  const type = String(product.instrumentType || "").toLowerCase();
  const ticker = String(product.ticker || "");
  const subtype = String(product.subtype || "");
  if (type === "tesouro" && /Selic|LFT/i.test(`${ticker} ${subtype}`)) {
    const annualBasePct = selic;
    return {
      kind: "rf_rate",
      annualBasePct,
      rateLabel: `Selic ${formatPct(selic)} a.a.`,
      horizons: buildHorizons(amountBrl, annualBasePct),
      disclaimer: "Cen\xE1rio-objetivo se a Selic se mantiver pr\xF3xima da atual. N\xE3o \xE9 garantia.",
      asOf
    };
  }
  if (type === "tesouro" && /IPCA|NTN-B/i.test(`${ticker} ${subtype}`)) {
    const realCoupon = 6.5;
    const annualBasePct = ipca + realCoupon;
    const annualBearPct = ipca + 4.5;
    const annualBullPct = ipca + 8;
    return {
      kind: "rf_ipca",
      annualBasePct: round22(annualBasePct),
      annualBearPct: round22(annualBearPct),
      annualBullPct: round22(annualBullPct),
      rateLabel: `IPCA ${formatPct(ipca)} + ~${realCoupon.toFixed(1)}% a.a. (cen\xE1rio)`,
      horizons: buildHorizons(amountBrl, annualBasePct, annualBearPct, annualBullPct),
      disclaimer: "Cen\xE1rio IPCA+ taxa real ilustrativa. Pre\xE7o marca a mercado antes do vencimento \u2014 pode oscilar. N\xE3o \xE9 garantia.",
      asOf
    };
  }
  if (type === "cdb" || type === "lci") {
    const annualBasePct = type === "lci" ? cdi * 0.92 : cdi;
    return {
      kind: "rf_rate",
      annualBasePct: round22(annualBasePct),
      rateLabel: type === "lci" ? `~92% CDI (${formatPct(cdi)}) \u2014 proxy isento` : `CDI ${formatPct(cdi)} a.a.`,
      horizons: buildHorizons(amountBrl, annualBasePct),
      disclaimer: "Cen\xE1rio se o % do CDI ofertado se mantiver. Compare a taxa real do banco no dia. N\xE3o \xE9 garantia.",
      asOf
    };
  }
  if (type === "debenture") {
    const annualBasePct = cdi + 1.5;
    const annualBearPct = cdi - 2;
    const annualBullPct = cdi + 3;
    return {
      kind: "rv_scenario",
      annualBasePct: round22(annualBasePct),
      annualBearPct: round22(annualBearPct),
      annualBullPct: round22(annualBullPct),
      rateLabel: `CDI ${formatPct(cdi)} + spread (cen\xE1rio)`,
      horizons: buildHorizons(amountBrl, annualBasePct, annualBearPct, annualBullPct),
      disclaimer: "Cr\xE9dito privado: retorno e risco de cr\xE9dito. Cen\xE1rio ilustrativo, n\xE3o garantia.",
      asOf
    };
  }
  if (type === "fii") {
    const isPapel = /papel|CRI/i.test(subtype);
    const annualBasePct = isPapel ? 11 : 9;
    const annualBearPct = isPapel ? -6 : -10;
    const annualBullPct = isPapel ? 16 : 15;
    return {
      kind: "rv_scenario",
      annualBasePct,
      annualBearPct,
      annualBullPct,
      rateLabel: isPapel ? "FII papel \u2014 renda + marca\xE7\xE3o (cen\xE1rio)" : "FII tijolo \u2014 renda + marca\xE7\xE3o (cen\xE1rio)",
      horizons: buildHorizons(amountBrl, annualBasePct, annualBearPct, annualBullPct),
      disclaimer: "FII combina distribui\xE7\xE3o e pre\xE7o da cota. Faixas bear/base/bull \u2014 n\xE3o \xE9 garantia.",
      asOf
    };
  }
  if (type === "etf" && /HASH|CRIPTO|CRYPTO/i.test(ticker)) {
    return {
      kind: "rv_scenario",
      annualBasePct: 15,
      annualBearPct: -40,
      annualBullPct: 50,
      rateLabel: "ETF cripto \u2014 alta volatilidade (cen\xE1rio)",
      horizons: buildHorizons(amountBrl, 15, -40, 50),
      disclaimer: "Cripto \xE9 especulativo. Faixas amplas \u2014 n\xE3o \xE9 garantia.",
      asOf
    };
  }
  if (type === "etf") {
    const intl = /IVVB|S&P|exterior|EUA/i.test(`${ticker} ${subtype}`);
    const annualBasePct = intl ? 10 : 9;
    const annualBearPct = intl ? -18 : -15;
    const annualBullPct = intl ? 22 : 20;
    return {
      kind: "rv_scenario",
      annualBasePct,
      annualBearPct,
      annualBullPct,
      rateLabel: intl ? "ETF exterior \u2014 cen\xE1rio" : "ETF Ibovespa \u2014 cen\xE1rio",
      horizons: buildHorizons(amountBrl, annualBasePct, annualBearPct, annualBullPct),
      disclaimer: "Renda vari\xE1vel: cen\xE1rios ilustrativos bear/base/bull. N\xE3o \xE9 garantia de retorno.",
      asOf
    };
  }
  if (type === "acao") {
    return {
      kind: "rv_scenario",
      annualBasePct: 10,
      annualBearPct: -25,
      annualBullPct: 28,
      rateLabel: "A\xE7\xE3o individual \u2014 cen\xE1rio",
      horizons: buildHorizons(amountBrl, 10, -25, 28),
      disclaimer: "A\xE7\xE3o isolada oscila mais que o \xEDndice. Faixas bear/base/bull \u2014 n\xE3o \xE9 garantia.",
      asOf
    };
  }
  return {
    kind: "rf_rate",
    annualBasePct: cdi,
    rateLabel: `Proxy CDI ${formatPct(cdi)} a.a.`,
    horizons: buildHorizons(amountBrl, cdi),
    disclaimer: "Cen\xE1rio-objetivo ilustrativo. N\xE3o \xE9 garantia.",
    asOf
  };
}
function buildPortfolioPerformanceOutlook(lines) {
  const usable = (lines || []).filter(
    (l) => l.amountBrl > 0 && l.performanceOutlook?.horizons?.length
  );
  if (!usable.length) return null;
  const principalBrl = round22(usable.reduce((s, l) => s + l.amountBrl, 0));
  if (!(principalBrl > 0)) return null;
  const blendedAnnualBasePct = round22(
    usable.reduce((s, l) => s + l.amountBrl * l.performanceOutlook.annualBasePct, 0) / principalBrl
  );
  const asOf = usable.map((l) => l.performanceOutlook.asOf).sort().at(-1) || (/* @__PURE__ */ new Date()).toISOString();
  const hasRange = usable.some(
    (l) => l.performanceOutlook.horizons.some((h) => h.bearValueBrl != null || h.bullValueBrl != null)
  );
  const horizons = HORIZONS.map((meta) => {
    let valueBrl = 0;
    let bearValueBrl = 0;
    let bullValueBrl = 0;
    for (const line of usable) {
      const h = line.performanceOutlook.horizons.find((x) => x.key === meta.key);
      const base = h?.valueBrl ?? line.amountBrl;
      valueBrl += base;
      bearValueBrl += h?.bearValueBrl ?? base;
      bullValueBrl += h?.bullValueBrl ?? base;
    }
    valueBrl = round22(valueBrl);
    const row = {
      key: meta.key,
      days: meta.days,
      label: meta.label,
      valueBrl,
      profitBrl: round22(valueBrl - principalBrl),
      returnPct: periodReturnPct(principalBrl, valueBrl)
    };
    if (hasRange) {
      bearValueBrl = round22(bearValueBrl);
      bullValueBrl = round22(bullValueBrl);
      row.bearValueBrl = bearValueBrl;
      row.bullValueBrl = bullValueBrl;
      row.bearReturnPct = periodReturnPct(principalBrl, bearValueBrl);
      row.bullReturnPct = periodReturnPct(principalBrl, bullValueBrl);
    }
    return row;
  });
  return {
    principalBrl,
    blendedAnnualBasePct,
    rateLabel: `Carteira \xB7 retorno misturado ~${blendedAnnualBasePct.toFixed(1)}% a.a.`,
    horizons,
    disclaimer: "Total da carteira sugerida (soma das linhas). Cen\xE1rio-objetivo \u2014 n\xE3o \xE9 garantia de retorno.",
    asOf,
    lineCount: usable.length
  };
}

// lib/investimentos/allocationEngine.ts
var ALLOWED_INSTITUTIONS = ["Nubank", "XP", "Ita\xFA", "BTG"];
var DISCLAIMER = "Parecer de aloca\xE7\xE3o do consultor TM SEG com base no seu perfil e nas taxas p\xFAblicas (Selic/CDI/IPCA). N\xE3o \xE9 ordem de compra/venda. A IA n\xE3o executa, n\xE3o transfere e n\xE3o garante retorno. Voc\xEA confirma e aplica na corretora.";
var INSTITUTION_PREFERENCE = {
  tesouro: ["Nubank", "XP", "Ita\xFA", "BTG"],
  cdb: ["Nubank", "Ita\xFA", "XP", "BTG"],
  lci: ["Ita\xFA", "XP", "BTG"],
  fii: ["XP", "BTG", "Ita\xFA"],
  acao: ["XP", "BTG", "Ita\xFA", "Nubank"],
  etf: ["XP", "BTG", "Ita\xFA"],
  debenture: ["XP", "BTG", "Ita\xFA"]
};
function categorizeInstrument(instrumentType, ticker = "", subtype = "") {
  switch (instrumentType) {
    case "tesouro":
      return { kind: "Tesouro", label: "T\xEDtulo p\xFAblico (Governo Federal)" };
    case "cdb":
    case "lci":
      return { kind: "RF", label: "Renda Fixa banc\xE1ria" };
    case "debenture":
      return { kind: "RF", label: "Cr\xE9dito Privado (RF)" };
    case "fii":
      if (/papel/i.test(subtype)) return { kind: "FII", label: "Fundo Imobili\xE1rio \u2014 papel (CRI)" };
      if (/tijolo/i.test(subtype)) return { kind: "FII", label: "Fundo Imobili\xE1rio \u2014 tijolo" };
      return { kind: "FII", label: "Fundo Imobili\xE1rio (FII)" };
    case "acao":
      return { kind: "A\xE7\xE3o", label: "Renda Vari\xE1vel \u2014 a\xE7\xE3o (B3)" };
    case "etf":
      if (/HASH|CRIPTO|CRYPTO/i.test(ticker)) return { kind: "ETF", label: "ETF de Cripto (B3)" };
      if (/IVVB|S&P|exterior|eua/i.test(`${ticker} ${subtype}`)) {
        return { kind: "ETF", label: "ETF exterior (B3)" };
      }
      return { kind: "ETF", label: "ETF \u2014 fundo de \xEDndice (B3)" };
    default:
      return { kind: "Ativo", label: "Ativo" };
  }
}
function parseRestrictedInstitutions(raw) {
  const set = /* @__PURE__ */ new Set();
  for (const part of String(raw || "").split(/[,;/|]+/)) {
    const t = part.trim().toLowerCase();
    if (!t) continue;
    set.add(t);
    if (t.includes("itau") || t.includes("ita\xFA")) set.add("ita\xFA");
  }
  return set;
}
function normalizeInstitutionName(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (!t) return null;
  if (t === "xp" || t.includes("xp investimentos")) return "XP";
  if (t.includes("nubank") || t === "nu") return "Nubank";
  if (t.includes("ita\xFA") || t.includes("itau")) return "Ita\xFA";
  if (t.includes("btg") || t.includes("pactual")) return "BTG";
  return null;
}
function pickInstitution(instrumentType, profile) {
  const restricted = parseRestrictedInstitutions(profile?.restricted_institutions);
  const preferredDefault = normalizeInstitutionName(profile?.broker_default);
  const base = INSTITUTION_PREFERENCE[instrumentType] || [...ALLOWED_INSTITUTIONS];
  const ordered = [];
  if (preferredDefault) ordered.push(preferredDefault);
  for (const inst of base) if (!ordered.includes(inst)) ordered.push(inst);
  for (const inst of ALLOWED_INSTITUTIONS) if (!ordered.includes(inst)) ordered.push(inst);
  const available = ordered.filter((inst) => !restricted.has(inst.toLowerCase()));
  return available[0] || "XP";
}
function buildSearchHint(institution, ticker, instrumentType) {
  const q = ticker;
  switch (institution) {
    case "Nubank":
      if (instrumentType === "tesouro") return `Nubank \u2192 Investimentos \u2192 Tesouro Direto \u2192 busque \u201CTesouro Selic\u201D (n\xE3o o ano)`;
      if (instrumentType === "cdb") return `Nubank \u2192 Caixinhas / RDB liquidez di\xE1ria`;
      return `Nubank \u2192 Investimentos / NuInvest \u2192 \u201C${q}\u201D`;
    case "Ita\xFA":
      if (instrumentType === "tesouro" || instrumentType === "cdb" || instrumentType === "lci") {
        return `Ita\xFA \u2192 Investimentos \u2192 Renda Fixa / Tesouro Direto \u2192 \u201C${q}\u201D`;
      }
      return `Ita\xFA Corretora \u2192 Home Broker \u2192 \u201C${q}\u201D`;
    case "BTG":
      return `BTG \u2192 Investimentos / Trading \u2192 busque \u201C${q}\u201D`;
    case "XP":
    default:
      if (instrumentType === "tesouro") {
        return `XP \u2192 Investir \u2192 Tesouro Direto \u2192 busque \u201CTesouro Selic\u201D ou \u201CLFT\u201D`;
      }
      return `XP \u2192 busca \u2192 \u201C${q}\u201D`;
  }
}
var CLASS_LABELS = {
  emergencia: "Reserva de emerg\xEAncia",
  caixa: "Caixa / liquidez",
  renda_fix_pos: "Renda fixa p\xF3s-fixada",
  renda_fix_ipca: "Renda fixa atrelada \xE0 infla\xE7\xE3o",
  fii: "Fundos imobili\xE1rios",
  acoes_etf: "A\xE7\xF5es / ETF Brasil",
  internacional: "Exterior (ETF/BDR)",
  credito_privado: "Cr\xE9dito privado",
  cripto: "Cripto"
};
var TESOURO_SELIC_HOW = {
  XP: [
    "Abra a XP \u2192 menu Investir \u2192 Tesouro Direto",
    "Na busca digite \u201CTesouro Selic\u201D ou \u201CLFT\u201D (n\xE3o force o ano 2029 \u2014 a prateleira muda)",
    "Prefira o vencimento Selic mais longo dispon\xEDvel (ex.: 2031) se quiser spread um pouco maior",
    "Confira taxa (Selic + \xE1gio/des\xE1gio), aplique o valor e confirme \u2014 a IA n\xE3o envia a ordem"
  ],
  Nubank: [
    "App Nubank \u2192 Investimentos \u2192 Tesouro Direto",
    "Busque \u201CTesouro Selic\u201D (\xE0s vezes aparece como LFT)",
    "Escolha o t\xEDtulo Selic listado no dia e aplique o valor da reserva"
  ],
  Ita\u00FA: [
    "App Ita\xFA \u2192 Investimentos \u2192 Tesouro Direto",
    "Busque \u201CTesouro Selic\u201D / LFT e selecione o vencimento dispon\xEDvel",
    "Aplique o valor e confirme no app"
  ],
  BTG: [
    "BTG \u2192 Investimentos \u2192 Renda Fixa / Tesouro Direto",
    "Busque \u201CTesouro Selic\u201D ou \u201CLFT\u201D",
    "Selecione o vencimento l\xEDquido do dia e confirme a aplica\xE7\xE3o"
  ]
};
var XP_CATALOG = {
  emergencia: [
    {
      ticker: "Tesouro Selic",
      xpName: "Tesouro Selic (LFT) \u2014 t\xEDtulo p\xFAblico p\xF3s-Selic",
      instrumentType: "tesouro",
      liquidity: "D+1",
      rationale: "Reserva de emerg\xEAncia no Governo Federal, liquidez di\xE1ria.",
      issuer: "Tesouro Nacional (Governo Federal)",
      subtype: "LFT \u2014 p\xF3s-fixado \xE0 Selic",
      assetNature: "T\xEDtulo p\xFAblico federal \xB7 n\xE3o \xE9 a\xE7\xE3o nem fundo",
      searchAliases: ["Tesouro Selic", "LFT", "Tesouro Direto", "Selic"],
      thesis: "Colch\xE3o de liquidez: prioridade \xE9 seguran\xE7a e resgate, n\xE3o maximizar retorno.",
      signal: "RESERVA",
      howToBuyByInstitution: TESOURO_SELIC_HOW
    }
  ],
  caixa: [
    {
      ticker: "Tesouro Selic",
      xpName: "Tesouro Selic (LFT) \u2014 caixa t\xE1tico",
      instrumentType: "tesouro",
      liquidity: "D+1",
      rationale: "Caixa t\xE1tico no Tesouro Direto.",
      issuer: "Tesouro Nacional (Governo Federal)",
      subtype: "LFT \u2014 p\xF3s-fixado \xE0 Selic",
      assetNature: "T\xEDtulo p\xFAblico federal \xB7 n\xE3o \xE9 a\xE7\xE3o nem fundo",
      searchAliases: ["Tesouro Selic", "LFT", "Tesouro Direto"],
      thesis: "Parcela l\xEDquida do capital invest\xEDvel enquanto espera oportunidades.",
      signal: "MANTER",
      howToBuyByInstitution: TESOURO_SELIC_HOW
    }
  ],
  renda_fix_pos: [
    {
      ticker: "CDB liquidez di\xE1ria",
      xpName: "CDB / RDB liquidez di\xE1ria (banco s\xF3lido)",
      instrumentType: "cdb",
      liquidity: "D+0",
      rationale: "Renda fixa p\xF3s-CDI com resgate r\xE1pido; escolha emissor AAA/FGC.",
      weight: 2,
      issuer: "Banco emissor (coberta pelo FGC at\xE9 o limite)",
      subtype: "CDB/RDB p\xF3s-CDI",
      assetNature: "Renda fixa banc\xE1ria",
      searchAliases: ["CDB liquidez di\xE1ria", "CDB", "RDB", "Caixinhas"],
      thesis: "Complemento l\xEDquido ao Tesouro; compare % do CDI e liquidez.",
      signal: "COMPRAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 Renda Fixa \u2192 CDB", "Filtre liquidez di\xE1ria + banco s\xF3lido", "Aplique o valor sugerido"],
        Nubank: ["Nubank \u2192 Caixinhas / RDB", "Escolha liquidez imediata", "Aplique o valor sugerido"],
        Ita\u00FA: ["Ita\xFA \u2192 Investimentos \u2192 CDB", "Liquidez di\xE1ria / curto prazo", "Confirme a aplica\xE7\xE3o"],
        BTG: ["BTG \u2192 Renda Fixa \u2192 CDB", "Liquidez di\xE1ria", "Confirme a aplica\xE7\xE3o"]
      }
    },
    {
      ticker: "LCI",
      xpName: "LCI isenta de IR (prazo ~90\u2013180 dias)",
      instrumentType: "lci",
      liquidity: "No vencimento",
      rationale: "Complemento isento para PF.",
      weight: 1,
      issuer: "Banco emissor (FGC)",
      subtype: "LCI \u2014 isenta de IR para PF",
      assetNature: "Renda fixa banc\xE1ria isenta",
      searchAliases: ["LCI", "LCI liquidez", "Letras de Cr\xE9dito Imobili\xE1rio"],
      thesis: "Use s\xF3 o excedente que pode ficar at\xE9 o vencimento.",
      signal: "AVERBAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 Renda Fixa \u2192 LCI", "Compare % CDI e prazo", "Aplique s\xF3 o que n\xE3o precisa antes do vencimento"],
        Ita\u00FA: ["Ita\xFA \u2192 Investimentos \u2192 LCI", "Confira prazo e taxa", "Confirme"],
        BTG: ["BTG \u2192 Renda Fixa \u2192 LCI", "Confira prazo e taxa", "Confirme"]
      }
    }
  ],
  renda_fix_ipca: [
    {
      ticker: "Tesouro IPCA+",
      xpName: "Tesouro IPCA+ (NTN-B Principal) \u2014 horizonte m\xE9dio",
      instrumentType: "tesouro",
      liquidity: "Marca\xE7\xE3o a mercado",
      rationale: "Prote\xE7\xE3o real contra infla\xE7\xE3o no Governo Federal.",
      issuer: "Tesouro Nacional (Governo Federal)",
      subtype: "NTN-B Principal \u2014 IPCA + taxa",
      assetNature: "T\xEDtulo p\xFAblico federal indexado \xE0 infla\xE7\xE3o",
      searchAliases: ["Tesouro IPCA+", "NTN-B", "Tesouro IPCA", "2035", "2032"],
      thesis: "Trava juro real; pre\xE7o oscila se a taxa de mercado subir \u2014 horizonte m\xE9dio/longo.",
      signal: "COMPRAR",
      howToBuyByInstitution: {
        XP: [
          "XP \u2192 Tesouro Direto \u2192 busque \u201CTesouro IPCA+\u201D (n\xE3o s\xF3 o ano)",
          "Escolha vencimento m\xE9dio (ex.: 2032\u20132040) alinhado ao seu horizonte",
          "Confira taxa IPCA+ do dia e aplique"
        ],
        Nubank: ["Nubank \u2192 Tesouro Direto \u2192 \u201CIPCA+\u201D", "Escolha vencimento e confirme"],
        Ita\u00FA: ["Ita\xFA \u2192 Tesouro Direto \u2192 \u201CIPCA+\u201D", "Escolha vencimento e confirme"],
        BTG: ["BTG \u2192 Tesouro Direto \u2192 \u201CIPCA+\u201D", "Escolha vencimento e confirme"]
      }
    }
  ],
  fii: [
    {
      ticker: "HGLG11",
      xpName: "HGLG11 \u2014 CSHG Log\xEDstica",
      instrumentType: "fii",
      liquidity: "D+2 Bolsa",
      rationale: "FII de log\xEDstica (tijolo).",
      weight: 1,
      issuer: "CSHG (gestora) \xB7 cotas na B3",
      subtype: "FII tijolo \u2014 galp\xF5es/log\xEDstica",
      assetNature: "Fundo imobili\xE1rio de tijolo (im\xF3veis)",
      searchAliases: ["HGLG11", "CSHG Log\xEDstica"],
      thesis: "Exposi\xE7\xE3o a galp\xF5es; renda via aluguel. N\xE3o \xE9 papel de CRI.",
      signal: "COMPRAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 busca \u201CHGLG11\u201D", "Mercado \xE0 vista (Bolsa)", "Ordem limitada perto do \xFAltimo pre\xE7o"],
        BTG: ["BTG \u2192 \u201CHGLG11\u201D", "Home broker \u2192 compra"],
        Ita\u00FA: ["Ita\xFA Corretora \u2192 \u201CHGLG11\u201D", "Compra \xE0 vista"]
      }
    },
    {
      ticker: "XPLG11",
      xpName: "XPLG11 \u2014 XP Log",
      instrumentType: "fii",
      liquidity: "D+2 Bolsa",
      rationale: "FII de galp\xF5es (tijolo).",
      weight: 1,
      issuer: "XP Asset \xB7 cotas na B3",
      subtype: "FII tijolo \u2014 log\xEDstica",
      assetNature: "Fundo imobili\xE1rio de tijolo (im\xF3veis)",
      searchAliases: ["XPLG11", "XP Log"],
      thesis: "Diversifica tijolo log\xEDstico junto com HGLG11.",
      signal: "COMPRAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 \u201CXPLG11\u201D", "Compra \xE0 vista"],
        BTG: ["BTG \u2192 \u201CXPLG11\u201D", "Compra \xE0 vista"],
        Ita\u00FA: ["Ita\xFA Corretora \u2192 \u201CXPLG11\u201D", "Compra \xE0 vista"]
      }
    },
    {
      ticker: "MXRF11",
      xpName: "MXRF11 \u2014 Maxi Renda",
      instrumentType: "fii",
      liquidity: "D+2 Bolsa",
      rationale: "FII de papel (CRI), distribui\xE7\xE3o frequente.",
      weight: 1,
      issuer: "Maxi Renda \xB7 cotas na B3",
      subtype: "FII papel \u2014 CRI / receb\xEDveis",
      assetNature: "Fundo imobili\xE1rio de papel (cr\xE9dito imobili\xE1rio)",
      searchAliases: ["MXRF11", "Maxi Renda"],
      thesis: "Renda via CRI \u2014 perfil diferente do tijolo; use como complemento, n\xE3o como \xFAnico FII.",
      signal: "AVERBAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 \u201CMXRF11\u201D", "Compra \xE0 vista"],
        BTG: ["BTG \u2192 \u201CMXRF11\u201D", "Compra \xE0 vista"],
        Ita\u00FA: ["Ita\xFA Corretora \u2192 \u201CMXRF11\u201D", "Compra \xE0 vista"]
      }
    }
  ],
  acoes_etf: [
    {
      ticker: "BOVA11",
      xpName: "BOVA11 \u2014 iShares Ibovespa",
      instrumentType: "etf",
      liquidity: "D+2 Bolsa",
      rationale: "ETF do Ibovespa.",
      weight: 2,
      issuer: "BlackRock iShares \xB7 cotas na B3",
      subtype: "ETF de a\xE7\xF5es Brasil (\xEDndice)",
      assetNature: "ETF \u2014 fundo de \xEDndice (n\xE3o \xE9 a\xE7\xE3o isolada)",
      searchAliases: ["BOVA11", "Ibovespa", "iShares"],
      thesis: "N\xFAcleo de RV Brasil: uma ordem cobre o \xEDndice. Prefira acumular em quedas do \xEDndice.",
      signal: "COMPRAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 \u201CBOVA11\u201D", "Ordem limitada (evite mercado a qualquer pre\xE7o em hor\xE1rio turbulento)"],
        BTG: ["BTG \u2192 \u201CBOVA11\u201D", "Compra limitada"],
        Ita\u00FA: ["Ita\xFA Corretora \u2192 \u201CBOVA11\u201D", "Compra limitada"]
      }
    },
    {
      ticker: "PETR4",
      xpName: "PETR4 \u2014 Petrobras PN",
      instrumentType: "acao",
      liquidity: "D+2 Bolsa",
      rationale: "Blue chip l\xEDquida.",
      weight: 1,
      issuer: "Petrobras \xB7 a\xE7\xE3o PN na B3",
      subtype: "A\xE7\xE3o ordinaria preferencial (PN)",
      assetNature: "Renda vari\xE1vel \u2014 a\xE7\xE3o individual",
      searchAliases: ["PETR4", "Petrobras"],
      thesis: "Sat\xE9lite de commodities/energia; tamanho da posi\xE7\xE3o deve respeitar seu teto por ativo.",
      signal: "COMPRAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 \u201CPETR4\u201D", "Ordem limitada", "N\xE3o concentre acima do teto do perfil"],
        BTG: ["BTG \u2192 \u201CPETR4\u201D", "Ordem limitada"],
        Ita\u00FA: ["Ita\xFA \u2192 \u201CPETR4\u201D", "Ordem limitada"],
        Nubank: ["NuInvest \u2192 \u201CPETR4\u201D", "Ordem limitada"]
      }
    },
    {
      ticker: "VALE3",
      xpName: "VALE3 \u2014 Vale ON",
      instrumentType: "acao",
      liquidity: "D+2 Bolsa",
      rationale: "Blue chip minera\xE7\xE3o.",
      weight: 1,
      issuer: "Vale \xB7 a\xE7\xE3o ON na B3",
      subtype: "A\xE7\xE3o ordin\xE1ria (ON)",
      assetNature: "Renda vari\xE1vel \u2014 a\xE7\xE3o individual",
      searchAliases: ["VALE3", "Vale"],
      thesis: "Exposi\xE7\xE3o a min\xE9rio; complementar a BOVA11, n\xE3o substituir o \xEDndice.",
      signal: "COMPRAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 \u201CVALE3\u201D", "Ordem limitada"],
        BTG: ["BTG \u2192 \u201CVALE3\u201D", "Ordem limitada"],
        Ita\u00FA: ["Ita\xFA \u2192 \u201CVALE3\u201D", "Ordem limitada"],
        Nubank: ["NuInvest \u2192 \u201CVALE3\u201D", "Ordem limitada"]
      }
    },
    {
      ticker: "ITUB4",
      xpName: "ITUB4 \u2014 Ita\xFA Unibanco PN",
      instrumentType: "acao",
      liquidity: "D+2 Bolsa",
      rationale: "Banco blue chip.",
      weight: 1,
      issuer: "Ita\xFA Unibanco \xB7 a\xE7\xE3o PN na B3",
      subtype: "A\xE7\xE3o preferencial (PN)",
      assetNature: "Renda vari\xE1vel \u2014 a\xE7\xE3o individual",
      searchAliases: ["ITUB4", "Ita\xFA"],
      thesis: "Setor financeiro l\xEDquido; use como sat\xE9lite do n\xFAcleo BOVA11.",
      signal: "COMPRAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 \u201CITUB4\u201D", "Ordem limitada"],
        BTG: ["BTG \u2192 \u201CITUB4\u201D", "Ordem limitada"],
        Ita\u00FA: ["Ita\xFA \u2192 \u201CITUB4\u201D", "Ordem limitada"],
        Nubank: ["NuInvest \u2192 \u201CITUB4\u201D", "Ordem limitada"]
      }
    }
  ],
  internacional: [
    {
      ticker: "IVVB11",
      xpName: "IVVB11 \u2014 iShares S&P 500",
      instrumentType: "etf",
      liquidity: "D+2 Bolsa",
      rationale: "ETF do S&P 500 na B3.",
      issuer: "BlackRock iShares \xB7 cotas na B3",
      subtype: "ETF exterior (S&P 500)",
      assetNature: "ETF de a\xE7\xF5es EUA negociado no Brasil",
      searchAliases: ["IVVB11", "S&P 500", "iShares"],
      thesis: "Diversifica\xE7\xE3o cambial/geogr\xE1fica sem conta l\xE1 fora.",
      signal: "COMPRAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 \u201CIVVB11\u201D", "Compra \xE0 vista na B3"],
        BTG: ["BTG \u2192 \u201CIVVB11\u201D", "Compra \xE0 vista"],
        Ita\u00FA: ["Ita\xFA \u2192 \u201CIVVB11\u201D", "Compra \xE0 vista"]
      }
    }
  ],
  credito_privado: [
    {
      ticker: "Deb\xEAnture incentivada",
      xpName: "Deb\xEAnture incentivada (isenta) \u2014 rating alto",
      instrumentType: "debenture",
      liquidity: "Baixa / secund\xE1rio",
      rationale: "Cr\xE9dito privado isento; escolha rating elevado.",
      issuer: "Empresa emissora (sem FGC)",
      subtype: "Deb\xEAnture incentivada (infra)",
      assetNature: "Cr\xE9dito privado \u2014 n\xE3o \xE9 t\xEDtulo do governo",
      searchAliases: ["Deb\xEAnture incentivada", "Deb\xEAnture", "Incentivada"],
      thesis: "S\xF3 ap\xF3s reserva e RF soberana/banc\xE1ria; leia rating e duration.",
      signal: "AVERBAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 Renda Fixa \u2192 Deb\xEAntures", "Filtre incentivada + rating alto", "Leia o prospecto antes"],
        BTG: ["BTG \u2192 Deb\xEAntures", "Rating alto / incentivada"],
        Ita\u00FA: ["Ita\xFA \u2192 Deb\xEAntures", "Rating alto / incentivada"]
      }
    }
  ],
  cripto: [
    {
      ticker: "HASH11",
      xpName: "HASH11 \u2014 Hashdex Nasdaq Crypto Index",
      instrumentType: "etf",
      liquidity: "D+2 Bolsa",
      rationale: "ETF de cripto na B3.",
      issuer: "Hashdex \xB7 cotas na B3",
      subtype: "ETF de criptoativos",
      assetNature: "ETF de cripto \u2014 alta volatilidade",
      searchAliases: ["HASH11", "Hashdex", "Cripto"],
      thesis: "Sat\xE9lite especulativo; tamanho pequeno. A IA n\xE3o compra sozinha.",
      signal: "AVERBAR",
      howToBuyByInstitution: {
        XP: ["XP \u2192 \u201CHASH11\u201D", "S\xF3 com % pequena do capital"],
        BTG: ["BTG \u2192 \u201CHASH11\u201D", "Posi\xE7\xE3o t\xE1tica"]
      }
    }
  ]
};
function baseWeights(risk) {
  switch (risk) {
    case "conservador":
      return { caixa: 25, renda_fix_pos: 45, renda_fix_ipca: 20, fii: 5, acoes_etf: 5 };
    case "moderado":
      return { caixa: 15, renda_fix_pos: 30, renda_fix_ipca: 20, fii: 15, acoes_etf: 15, internacional: 5 };
    case "arrojado":
      return { caixa: 10, renda_fix_pos: 15, renda_fix_ipca: 15, fii: 15, acoes_etf: 30, internacional: 10, credito_privado: 5 };
    case "agressivo":
      return { caixa: 5, renda_fix_pos: 10, renda_fix_ipca: 10, fii: 10, acoes_etf: 40, internacional: 15, credito_privado: 5, cripto: 5 };
    default:
      return { caixa: 20, renda_fix_pos: 35, renda_fix_ipca: 20, fii: 10, acoes_etf: 15 };
  }
}
function normalize(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  for (const [k, v] of Object.entries(weights)) {
    if (v > 0) out[k] = v / sum * 100;
  }
  return out;
}
function round23(n) {
  return Math.round(n * 100) / 100;
}
function marketContextFor(p, rates) {
  const selic = formatPct(rates?.selicPct ?? null);
  const cdi = formatPct(rates?.cdiPct ?? null);
  const ipca = formatPct(rates?.ipcaPct ?? null);
  if (p.instrumentType === "tesouro" && /Selic|LFT/i.test(p.subtype + p.ticker)) {
    return `Selic meta ${selic} a.a. \xB7 CDI ${cdi} \xB7 o t\xEDtulo acompanha a Selic (l\xEDquido D+1)`;
  }
  if (p.instrumentType === "tesouro" && /IPCA|NTN-B/i.test(p.subtype + p.ticker)) {
    return `IPCA 12m ${ipca} \xB7 Selic ${selic} \u2014 juro real = taxa do t\xEDtulo \u2212 infla\xE7\xE3o esperada`;
  }
  if (p.instrumentType === "cdb" || p.instrumentType === "lci") {
    return `CDI ${cdi} a.a. \u2014 compare o % do CDI ofertado pelo banco`;
  }
  if (p.instrumentType === "fii" || p.instrumentType === "acao" || p.instrumentType === "etf") {
    return `Contexto: Selic ${selic} / CDI ${cdi}. Em RV use ordem limitada; sem pre\xE7o-alvo autom\xE1tico nesta vers\xE3o.`;
  }
  return `Selic ${selic} \xB7 CDI ${cdi} \xB7 IPCA ${ipca}`;
}
function signalNoteFor(p, amountBrl) {
  const money = amountBrl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  switch (p.signal) {
    case "RESERVA":
      return `Sinal: RESERVA \u2014 aplicar ${money} e n\xE3o mexer salvo emerg\xEAncia real.`;
    case "COMPRAR":
      return `Sinal: COMPRAR \u2014 montar posi\xE7\xE3o de ${money} (ordem limitada em Bolsa; RF a mercado na corretora).`;
    case "AVERBAR":
      return `Sinal: AVERBAR \u2014 entrar com ${money} de forma parcelada se o ativo oscilar.`;
    case "REDUZIR":
      return `Sinal: REDUZIR \u2014 avaliar venda parcial se estiver acima do alvo da carteira.`;
    case "MANTER":
    default:
      return `Sinal: MANTER \u2014 manter liquidez; reaplique s\xF3 o excedente.`;
  }
}
function expandClassToLines(classKey, classAmount, capital, maxPer, warnings, profile, rates) {
  const products = XP_CATALOG[classKey];
  if (!products?.length || classAmount <= 0) return [];
  const classLabel = CLASS_LABELS[classKey] || classKey;
  const totalW = products.reduce((s, p) => s + (p.weight ?? 1), 0) || 1;
  let selected = products;
  if (classAmount <= maxPer && products.length > 1 && classAmount < 8e3) {
    selected = [products[0]];
  }
  const selW = selected.reduce((s, p) => s + (p.weight ?? 1), 0) || totalW;
  const raw = selected.map((p) => {
    const share = (p.weight ?? 1) / selW;
    return { p, amount: round23(classAmount * share) };
  });
  const sum = raw.reduce((s, r) => s + r.amount, 0);
  const drift = round23(classAmount - sum);
  if (raw.length > 0 && Math.abs(drift) >= 0.01) {
    raw[0].amount = round23(raw[0].amount + drift);
  }
  const lines = [];
  for (const { p, amount } of raw) {
    if (amount <= 0) continue;
    if (amount > maxPer) {
      warnings.push(
        `${p.ticker}: sugest\xE3o ${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} acima do teto por ativo (${maxPer.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Parcele.`
      );
    }
    const institution = pickInstitution(p.instrumentType, profile);
    const cat = categorizeInstrument(p.instrumentType, p.ticker, p.subtype);
    const howToBuy = p.howToBuyByInstitution[institution] || p.howToBuyByInstitution.XP || [`Busque \u201C${p.ticker}\u201D em ${institution} e aplique o valor.`];
    const searchHint = buildSearchHint(institution, p.searchAliases[0] || p.ticker, p.instrumentType);
    const pctOfTotal = capital > 0 ? amount / capital * 100 : 0;
    lines.push({
      classKey,
      classLabel,
      ticker: p.ticker,
      xpName: p.xpName,
      instrumentHint: p.xpName,
      instrumentType: p.instrumentType,
      categoryKind: cat.kind,
      categoryLabel: cat.label,
      assetNature: p.assetNature,
      issuer: p.issuer,
      subtype: p.subtype,
      institution,
      searchHint,
      searchAliases: p.searchAliases,
      howToBuy,
      thesis: p.thesis,
      signal: p.signal,
      signalNote: signalNoteFor(p, amount),
      marketContext: marketContextFor(p, rates),
      pct: round23(pctOfTotal),
      amountBrl: amount,
      rationale: p.rationale,
      liquidity: p.liquidity,
      performanceOutlook: buildAssetPerformanceOutlook(
        amount,
        { instrumentType: p.instrumentType, ticker: p.ticker, subtype: p.subtype },
        rates
      )
    });
  }
  return lines;
}
function buildAllocationScenario(profile, positions = [], rates) {
  if (!profile?.risk_profile || profile.capital_available == null || profile.capital_available <= 0) {
    return null;
  }
  const capital = Number(profile.capital_available);
  const emergency = Math.max(0, Number(profile.emergency_reserve || 0));
  const emergencyHeld = Math.min(emergency, capital);
  const investable = Math.max(0, capital - emergencyHeld);
  const maxPer = profile.max_per_investment != null && profile.max_per_investment > 0 ? Number(profile.max_per_investment) : investable;
  let weights = baseWeights(profile.risk_profile);
  if (profile.liquidity_need === "D0" || profile.liquidity_need === "D1") {
    weights.caixa = (weights.caixa || 0) + 10;
    weights.acoes_etf = Math.max(0, (weights.acoes_etf || 0) - 5);
    weights.internacional = Math.max(0, (weights.internacional || 0) - 3);
  }
  if (profile.exp_fii === false) {
    weights.caixa = (weights.caixa || 0) + (weights.fii || 0);
    delete weights.fii;
  }
  if (profile.exp_equity === false) {
    weights.renda_fix_pos = (weights.renda_fix_pos || 0) + (weights.acoes_etf || 0);
    delete weights.acoes_etf;
  }
  if (profile.exp_private_credit === false) {
    weights.renda_fix_pos = (weights.renda_fix_pos || 0) + (weights.credito_privado || 0);
    delete weights.credito_privado;
  }
  if (!profile.allows_crypto || profile.exp_crypto === false) {
    delete weights.cripto;
  }
  if (!profile.allows_international) {
    weights.acoes_etf = (weights.acoes_etf || 0) + (weights.internacional || 0);
    delete weights.internacional;
  }
  if (profile.needs_monthly_income) {
    weights.fii = (weights.fii || 0) + 8;
    weights.renda_fix_pos = (weights.renda_fix_pos || 0) + 5;
    weights.acoes_etf = Math.max(0, (weights.acoes_etf || 0) - 8);
  }
  if (profile.max_loss_pct != null && profile.max_loss_pct < 10) {
    const cut = Math.min(weights.acoes_etf || 0, 10);
    weights.acoes_etf = (weights.acoes_etf || 0) - cut;
    weights.renda_fix_pos = (weights.renda_fix_pos || 0) + cut;
  }
  weights = normalize(weights);
  const warnings = [];
  const lines = [];
  if (emergencyHeld > 0) {
    lines.push(...expandClassToLines("emergencia", emergencyHeld, capital, maxPer, warnings, profile, rates));
  }
  for (const [key, pct] of Object.entries(weights)) {
    if (pct <= 0 || investable <= 0) continue;
    const classAmount = round23(investable * pct / 100);
    lines.push(...expandClassToLines(key, classAmount, capital, maxPer, warnings, profile, rates));
  }
  const investedSum = lines.filter((l) => l.classKey !== "emergencia").reduce((s, l) => s + l.amountBrl, 0);
  const drift = round23(investable - investedSum);
  if (Math.abs(drift) >= 0.01) {
    const idx = lines.findIndex((l) => l.classKey !== "emergencia");
    if (idx >= 0) {
      const next = round23(lines[idx].amountBrl + drift);
      lines[idx] = {
        ...lines[idx],
        amountBrl: next,
        pct: capital > 0 ? round23(next / capital * 100) : lines[idx].pct,
        signalNote: signalNoteFor(
          {
            ...XP_CATALOG[lines[idx].classKey]?.[0],
            ticker: lines[idx].ticker,
            signal: lines[idx].signal
          },
          next
        ),
        performanceOutlook: buildAssetPerformanceOutlook(
          next,
          {
            instrumentType: lines[idx].instrumentType,
            ticker: lines[idx].ticker,
            subtype: lines[idx].subtype
          },
          rates
        )
      };
    }
  }
  if (positions.length === 0) {
    warnings.push("Carteira sem posi\xE7\xF5es registradas \u2014 execute na corretora e depois lance os saldos reais na aba Carteira.");
  } else {
    warnings.push("H\xE1 posi\xE7\xF5es cadastradas: use os sinais para rebalancear; a IA n\xE3o envia ordem.");
  }
  warnings.push("Ordens autom\xE1ticas de compra/venda est\xE3o desligadas por seguran\xE7a \u2014 o consultor orienta; voc\xEA confirma.");
  const riskLabel = profile.risk_profile === "conservador" ? "Conservador" : profile.risk_profile === "moderado" ? "Moderado" : profile.risk_profile === "arrojado" ? "Arrojado" : profile.risk_profile === "agressivo" ? "Agressivo" : "Indefinido";
  const ordered = [
    ...lines.filter((l) => l.classKey === "emergencia"),
    ...lines.filter((l) => l.classKey !== "emergencia").sort((a, b) => b.amountBrl - a.amountBrl)
  ];
  const topActions = ordered.slice(0, 10).map((l, i) => ({
    rank: i + 1,
    title: l.signal === "RESERVA" ? `Reservar em ${l.ticker}` : l.signal === "REDUZIR" ? `Reduzir ${l.ticker}` : `Comprar ${l.ticker}`,
    amountBrl: l.amountBrl,
    pct: l.pct,
    detail: `${l.categoryLabel} \xB7 ${l.institution} \xB7 ${l.searchHint}`,
    ticker: l.ticker,
    xpName: l.xpName,
    categoryKind: l.categoryKind,
    categoryLabel: l.categoryLabel,
    assetNature: l.assetNature,
    issuer: l.issuer,
    subtype: l.subtype,
    institution: l.institution,
    searchHint: l.searchHint,
    searchAliases: l.searchAliases,
    howToBuy: l.howToBuy,
    thesis: l.thesis,
    signal: l.signal,
    signalNote: l.signalNote,
    marketContext: l.marketContext,
    liquidity: l.liquidity,
    performanceOutlook: l.performanceOutlook
  }));
  const selic = formatPct(rates?.selicPct ?? null);
  const cdi = formatPct(rates?.cdiPct ?? null);
  const ipca = formatPct(rates?.ipcaPct ?? null);
  const portfolioOutlook = buildPortfolioPerformanceOutlook(ordered);
  const consultantBrief = `Leitura de consultor (${riskLabel}): Selic ${selic}, CDI ${cdi}, IPCA 12m ${ipca}. Primeiro trave a reserva no Tesouro Selic (Governo). Depois monte o n\xFAcleo (ETF/a\xE7\xF5es ou RF conforme o perfil) e sat\xE9lites (FII tijolo/papel, exterior). Em Bolsa use ordem limitada. H\xE1 proje\xE7\xE3o do total da carteira e de cada linha (30d\u21921a, cen\xE1rio-objetivo). A IA n\xE3o executa ordens.`;
  return {
    id: `scenario_${profile.risk_profile}_v6`,
    name: `Parecer ${riskLabel}`,
    tagline: `Consultor TM SEG \xB7 R$ ${capital.toLocaleString("pt-BR")} \xB7 Selic ${selic} \xB7 retorno total 30d\u21921a \xB7 onde aplicar`,
    riskLabel,
    investableCapital: round23(investable),
    emergencyHeld: round23(emergencyHeld),
    macro: {
      selicPct: rates?.selicPct ?? null,
      cdiPct: rates?.cdiPct ?? null,
      ipcaPct: rates?.ipcaPct ?? null,
      fetchedAt: rates?.fetchedAt || (/* @__PURE__ */ new Date()).toISOString(),
      source: rates?.source || "fallback"
    },
    consultantBrief,
    lines: ordered,
    topActions,
    portfolioOutlook,
    warnings,
    disclaimer: DISCLAIMER,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "rules_v6"
  };
}
function isScenarioStale(scenario) {
  if (!scenario) return true;
  if (scenario.source !== "rules_v6") return true;
  const a = scenario.topActions?.[0];
  if (!a?.categoryKind || a.categoryKind === "Ativo") return true;
  if (!a.howToBuy?.length || !a.assetNature) return true;
  if (!a.performanceOutlook?.horizons?.length) return true;
  if (!scenario.portfolioOutlook?.horizons?.length) return true;
  return false;
}

// lib/investimentos/tradingDesk.ts
var TRADING_TYPES = /* @__PURE__ */ new Set(["acao", "etf", "bdr", "fii", "fiagro"]);
var DEFAULT_BUY_POOL = [
  { ticker: "BOVA11", name: "BOVA11 \u2014 iShares Ibovespa", type: "etf" },
  { ticker: "IVVB11", name: "IVVB11 \u2014 iShares S&P 500", type: "etf" },
  { ticker: "PETR4", name: "PETR4 \u2014 Petrobras PN", type: "acao" },
  { ticker: "VALE3", name: "VALE3 \u2014 Vale ON", type: "acao" },
  { ticker: "ITUB4", name: "ITUB4 \u2014 Ita\xFA Unibanco PN", type: "acao" },
  { ticker: "HGLG11", name: "HGLG11 \u2014 CSHG Log\xEDstica (FII tijolo)", type: "fii" },
  { ticker: "XPLG11", name: "XPLG11 \u2014 XP Log (FII tijolo)", type: "fii" },
  { ticker: "MXRF11", name: "MXRF11 \u2014 Maxi Renda (FII papel)", type: "fii" }
];
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function positionSleeve(p) {
  const raw = String(p.sleeve || "").toLowerCase();
  if (raw === "trading") return "trading";
  if (raw === "investimento") return "investimento";
  return TRADING_TYPES.has(String(p.instrument_type || "").toLowerCase()) ? "trading" : "investimento";
}
function markPrice(p) {
  const m = num(p.last_mark_price, NaN);
  if (Number.isFinite(m) && m > 0) return m;
  const avg = num(p.avg_price, NaN);
  if (Number.isFinite(avg) && avg > 0) return avg;
  const qty = num(p.quantity, 0);
  const val = num(p.current_value, 0);
  if (qty > 0 && val > 0) return val / qty;
  return null;
}
function marketValue(p) {
  const qty = num(p.quantity, 0);
  const px = markPrice(p);
  if (qty > 0 && px != null) return qty * px;
  return num(p.current_value, 0);
}
function pnlPct(p) {
  const avg = num(p.avg_price, NaN);
  const px = markPrice(p);
  if (!Number.isFinite(avg) || avg <= 0 || px == null) return null;
  return (px - avg) / avg * 100;
}
function heldCodes(positions) {
  const s = /* @__PURE__ */ new Set();
  for (const p of positions) {
    const c = String(p.instrument_code || p.instrument_name || "").trim().toUpperCase();
    if (c) s.add(c);
  }
  return s;
}
function buyPool(watchlist, held) {
  const out = [];
  for (const w of watchlist) {
    if (w.status === "evitar") continue;
    const ticker = String(w.instrument_code || w.instrument_name || "").trim().toUpperCase();
    if (!ticker || held.has(ticker)) continue;
    out.push({
      ticker,
      name: w.instrument_name || ticker,
      type: w.instrument_type || "acao",
      reason: w.status === "candidato" ? "Na sua watchlist como candidato" : "Na sua watchlist"
    });
  }
  for (const d of DEFAULT_BUY_POOL) {
    if (held.has(d.ticker)) continue;
    if (out.some((x) => x.ticker === d.ticker)) continue;
    out.push({ ...d, reason: "Candidato do consultor para sleeve de trading" });
  }
  return out;
}
function buildTradingDesk(profile, positions = [], watchlist = []) {
  const capitalTotal = Math.max(0, num(profile?.capital_available, 0));
  const tradingSleevePct = Math.min(100, Math.max(0, num(profile?.trading_sleeve_pct, 20)));
  const investSleevePct = 100 - tradingSleevePct;
  const tradingBudget = capitalTotal * tradingSleevePct / 100;
  const investBudget = capitalTotal - tradingBudget;
  const active = positions.filter((p) => p.is_active !== false);
  let tradingMarketValue = 0;
  let investMarketValue = 0;
  let lastMarkAt = null;
  for (const p of active) {
    const sleeve = positionSleeve(p);
    const mv = marketValue(p);
    if (sleeve === "trading") tradingMarketValue += mv;
    else investMarketValue += mv;
    const at = p.last_mark_at ? String(p.last_mark_at) : null;
    if (at && (!lastMarkAt || at > lastMarkAt)) lastMarkAt = at;
  }
  const held = heldCodes(active);
  const pool = buyPool(watchlist, held);
  let buyIdx = 0;
  const nextBuy = () => {
    if (!pool.length) return null;
    const b = pool[buyIdx % pool.length];
    buyIdx += 1;
    return b;
  };
  const sellAlerts = [];
  const holdNotes = [];
  for (const p of active.filter((x) => positionSleeve(x) === "trading")) {
    const ticker = String(p.instrument_code || p.instrument_name || "").trim().toUpperCase() || "ATIVO";
    const pnl = pnlPct(p);
    const target = num(p.target_sell_pct, 3);
    const stop = num(p.stop_loss_pct, 2);
    const qty = num(p.quantity, 0);
    const px = markPrice(p);
    const mv = marketValue(p);
    const markAt = p.last_mark_at ? String(p.last_mark_at) : null;
    let side = "MANTER";
    let reason = "Sem gatilho ainda \u2014 atualize a cota\xE7\xE3o do banco e acompanhe.";
    if (pnl != null && pnl >= target) {
      side = "VENDER";
      reason = `Alvo de realiza\xE7\xE3o: +${pnl.toFixed(2)}% (meta +${target}%). Realize no banco e registre a venda.`;
    } else if (pnl != null && pnl <= -Math.abs(stop)) {
      side = "VENDER";
      reason = `Stop de prote\xE7\xE3o: ${pnl.toFixed(2)}% (limite -${Math.abs(stop)}%). Avalie sa\xEDda no banco.`;
    } else if (px == null) {
      reason = "Sem pre\xE7o marcado \u2014 abra o banco, veja a cota\xE7\xE3o e lance aqui (\xFAltima atualiza\xE7\xE3o).";
    } else if (pnl != null) {
      reason = `P&L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% vs pre\xE7o m\xE9dio. Meta venda +${target}% / stop -${Math.abs(stop)}%.`;
    }
    const rotate = side === "VENDER" ? nextBuy() : null;
    const alert = {
      id: `pos-${p.id || ticker}`,
      side,
      rank: 0,
      ticker,
      name: p.instrument_name || ticker,
      instrumentType: p.instrument_type || "acao",
      sleeve: "trading",
      broker: p.broker || "XP",
      refPrice: px,
      lastMarkAt: markAt,
      quantity: qty,
      amountBrl: mv,
      pnlPct: pnl,
      reason,
      rotateBuy: rotate ? { ticker: rotate.ticker, name: rotate.name, reason: `Ao vender ${ticker}, estude comprar: ${rotate.reason}` } : null,
      positionId: p.id || null
    };
    if (side === "VENDER") sellAlerts.push(alert);
    else holdNotes.push(alert);
  }
  const buyAlerts = [];
  const buysNeeded = Math.max(sellAlerts.length, tradingMarketValue < tradingBudget * 0.85 ? 3 : 2);
  for (let i = 0; i < buysNeeded; i++) {
    const b = nextBuy();
    if (!b) break;
    const suggested = Math.max(500, Math.min(tradingBudget * 0.15, (tradingBudget - tradingMarketValue) / Math.max(1, buysNeeded)));
    buyAlerts.push({
      id: `buy-${b.ticker}`,
      side: "COMPRAR",
      rank: 0,
      ticker: b.ticker,
      name: b.name,
      instrumentType: b.type,
      sleeve: "trading",
      broker: profile?.broker_default || "XP",
      refPrice: null,
      lastMarkAt: null,
      quantity: 0,
      amountBrl: Math.round(suggested * 100) / 100,
      pnlPct: null,
      reason: b.reason + " \u2014 veja o pre\xE7o no banco e registre a compra aqui.",
      rotateBuy: null,
      positionId: null
    });
  }
  const merged = [
    ...sellAlerts.sort((a, b) => (b.pnlPct ?? -999) - (a.pnlPct ?? -999)),
    ...buyAlerts,
    ...holdNotes.sort((a, b) => (b.pnlPct ?? -999) - (a.pnlPct ?? -999))
  ];
  const top10 = merged.slice(0, 10).map((a, i) => ({ ...a, rank: i + 1 }));
  return {
    tradingSleevePct,
    investSleevePct,
    capitalTotal,
    tradingBudget: Math.round(tradingBudget * 100) / 100,
    investBudget: Math.round(investBudget * 100) / 100,
    tradingMarketValue: Math.round(tradingMarketValue * 100) / 100,
    investMarketValue: Math.round(investMarketValue * 100) / 100,
    lastMarkAt,
    markSource: "manual_banco",
    note: "Modo semi-manual: voc\xEA compra/vende no banco. Aqui entram alertas, registro da opera\xE7\xE3o e a pr\xF3xima oportunidade de compra quando houver venda. Cota\xE7\xE3o = \xFAltima marca\xE7\xE3o que voc\xEA lan\xE7ou (com data/hora).",
    alerts: merged,
    top10
  };
}

// lib/investimentos/dashboardCache.ts
var GESTAO_CACHE_TTL_MS = 30 * 60 * 1e3;
var CACHE_KEY_PREFIX = "gestao_investimento_cache_v6_";
var OWNERS_KEY = "gestao_investimento_cache_owners_v6";
function cacheKey(ownerUserId) {
  return `${CACHE_KEY_PREFIX}${ownerUserId}`;
}
function isMissingTableError(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  return code === "42P01" || /does not exist|schema cache|Could not find the table/i.test(msg);
}
function buildBriefing(profile, positions, watchlist, completeness, portfolioValue) {
  const byType = /* @__PURE__ */ new Map();
  for (const p of positions) {
    const t = String(p.instrument_type || "outros");
    byType.set(t, (byType.get(t) || 0) + Number(p.current_value || 0));
  }
  const allocationByType = [...byType.entries()].map(([type, value]) => ({
    type,
    value,
    pct: portfolioValue > 0 ? value / portfolioValue * 100 : 0
  })).sort((a, b) => b.value - a.value);
  const topPositions = [...positions].sort((a, b) => Number(b.current_value || 0) - Number(a.current_value || 0)).slice(0, 5).map((p) => ({
    name: String(p.instrument_name || ""),
    type: String(p.instrument_type || "outros"),
    value: Number(p.current_value || 0),
    broker: String(p.broker || "XP")
  }));
  const gaps = [];
  if (!completeness.complete) {
    gaps.push(...completeness.missing.slice(0, 6));
  }
  if (positions.length === 0) {
    gaps.push(
      completeness.complete ? "Ainda sem posi\xE7\xF5es na carteira XP \u2014 execute o cen\xE1rio na corretora e registre depois" : "Nenhuma posi\xE7\xE3o XP cadastrada na carteira"
    );
  }
  if (watchlist.length === 0 && !completeness.complete) {
    gaps.push("Watchlist vazia \u2014 sem candidatos em observa\xE7\xE3o");
  }
  const maxPct = allocationByType[0]?.pct ?? 0;
  if (maxPct >= 60) {
    gaps.push(`Concentra\xE7\xE3o alta em ${allocationByType[0].type} (${maxPct.toFixed(0)}%)`);
  }
  const scenario = completeness.complete ? buildAllocationScenario(profile, positions, null) : null;
  const nextActions = [];
  if (!completeness.complete) {
    nextActions.push("Completar perfil do investidor (bloqueia recomenda\xE7\xF5es)");
  } else if (scenario?.topActions?.length) {
    nextActions.push(
      ...scenario.topActions.slice(0, 4).map(
        (a) => `${a.rank}. ${a.signal || "COMPRAR"} ${a.ticker || a.title}: ${a.amountBrl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} \u2014 ${a.categoryKind} \xB7 ${a.institution}`
      )
    );
    nextActions.push("Siga o passo a passo na institui\xE7\xE3o \u2014 a IA n\xE3o envia ordem");
  }
  if (positions.length === 0 && completeness.complete) {
    nextActions.push("Depois de aplicar, registre as posi\xE7\xF5es reais na aba Carteira");
  } else if (positions.length > 0) {
    nextActions.push("Revisar valores atuais se houve aporte/resgate");
  }
  if (profile?.emergency_reserve != null && Number(profile.emergency_reserve) <= 0) {
    nextActions.push("Definir reserva de emerg\xEAncia > 0");
  }
  const tradingDesk = completeness.complete ? buildTradingDesk(profile, positions, watchlist) : null;
  return {
    allocationByType,
    topPositions,
    gaps,
    nextActions: nextActions.slice(0, 6),
    positionsCount: positions.length,
    watchlistCount: watchlist.length,
    profileComplete: completeness.complete,
    scenario,
    tradingDesk
  };
}
async function buildBriefingWithRates(profile, positions, watchlist, completeness, portfolioValue) {
  const base = buildBriefing(profile, positions, watchlist, completeness, portfolioValue);
  if (!completeness.complete || !profile) return base;
  const rates = await fetchMacroRates();
  const scenario = buildAllocationScenario(profile, positions, rates);
  if (!scenario) return base;
  const tradingDesk = buildTradingDesk(profile, positions, watchlist);
  return {
    ...base,
    scenario,
    tradingDesk,
    nextActions: [
      ...tradingDesk.top10.slice(0, 3).map(
        (a) => `${a.rank}. ${a.side} ${a.ticker}: ${a.reason.slice(0, 80)}`
      ),
      ...scenario.topActions.slice(0, 2).map(
        (a) => `${a.signal} ${a.ticker}: ${a.amountBrl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} \u2014 ${a.institution}`
      ),
      "Siga o passo a passo na institui\xE7\xE3o \u2014 a IA n\xE3o envia ordem"
    ].slice(0, 6)
  };
}
async function reviveStaleScenario(snap) {
  if (!snap.canRecommend || !snap.profile) return snap;
  if (!isScenarioStale(snap.briefing?.scenario)) return snap;
  const rates = await fetchMacroRates();
  const scenario = buildAllocationScenario(snap.profile, snap.positions || [], rates);
  if (!scenario) return snap;
  const tradingDesk = buildTradingDesk(snap.profile, snap.positions || [], snap.watchlist || []);
  return {
    ...snap,
    briefing: {
      ...snap.briefing,
      scenario,
      tradingDesk,
      nextActions: [
        ...tradingDesk.top10.slice(0, 3).map((a) => `${a.rank}. ${a.side} ${a.ticker}`),
        ...scenario.topActions.slice(0, 2).map(
          (a) => `${a.signal} ${a.ticker}: ${a.amountBrl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} \u2014 ${a.institution}`
        ),
        "Siga o passo a passo na institui\xE7\xE3o \u2014 a IA n\xE3o envia ordem"
      ].slice(0, 6)
    },
    fromCache: false
  };
}
async function buildDashboardSnapshot(ownerUserId) {
  const sb = createSupabaseAdminClient();
  if (!sb) return { ok: false, error: "Supabase admin indispon\xEDvel" };
  const [{ data: profile, error: pErr }, { data: positions, error: posErr }, { data: watchlist }, { data: limits }, { data: sources }] = await Promise.all([
    sb.from("investor_profiles").select("*").eq("owner_user_id", ownerUserId).maybeSingle(),
    sb.from("investment_positions").select("*").eq("owner_user_id", ownerUserId).eq("is_active", true).order("created_at", { ascending: false }),
    sb.from("investment_watchlists").select("*").eq("owner_user_id", ownerUserId).order("priority", { ascending: true }),
    sb.from("investment_risk_limits").select("*").eq("owner_user_id", ownerUserId).maybeSingle(),
    sb.from("investment_data_sources").select("code, name, url, reliability, is_active, last_collected_at").eq("is_active", true)
  ]);
  if (pErr && isMissingTableError(pErr)) {
    return { ok: false, error: "schema_missing", schema_missing: true };
  }
  if (pErr) return { ok: false, error: pErr.message };
  if (posErr && !isMissingTableError(posErr)) return { ok: false, error: posErr.message };
  const draft = profile ? { ...createDraftInvestorProfile(), ...profile } : createDraftInvestorProfile();
  const completeness = evaluateProfileCompleteness(profile ? profile : null);
  const targetBand = describeMonthlyTargetBand(
    Number(draft.monthly_target_pct_min ?? 1.5),
    Number(draft.monthly_target_pct_max ?? 2)
  );
  const positionsList = positions || [];
  const portfolioValue = positionsList.reduce((s, p) => s + Number(p.current_value || 0), 0);
  const capitalBase = Number(draft.capital_available || portfolioValue || 1e5);
  const provision30d = buildProvision30dEstimate(capitalBase, targetBand.monthlyMinPct, targetBand.monthlyMaxPct);
  const briefing = await buildBriefingWithRates(
    profile ? profile : null,
    positionsList,
    watchlist || [],
    completeness,
    portfolioValue
  );
  const refreshedAt = (/* @__PURE__ */ new Date()).toISOString();
  const nextRefreshAt = new Date(Date.now() + GESTAO_CACHE_TTL_MS).toISOString();
  return {
    ok: true,
    schemaReady: true,
    fromCache: false,
    refreshedAt,
    nextRefreshAt,
    cacheAgeSec: 0,
    profile: profile || null,
    draftDefaults: createDraftInvestorProfile(),
    completeness,
    canRecommend: completeness.complete,
    positions: positionsList,
    watchlist: watchlist || [],
    riskLimits: limits || null,
    dataSources: sources || [],
    portfolioValue,
    capitalBase,
    targetBand,
    provision30d,
    recommendationsBlockedReason: completeness.complete ? null : completeness.message,
    automation: {
      canTrade: false,
      note: "A IA n\xE3o est\xE1 autorizada a comprar, vender, resgatar, transferir ou movimentar dinheiro automaticamente."
    },
    briefing
  };
}
async function readCachedSnapshot(ownerUserId) {
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from("system_settings").select("value").eq("key", cacheKey(ownerUserId)).maybeSingle();
    if (error || !data?.value) return null;
    const raw = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    if (!raw || raw.ok !== true || !raw.refreshedAt) return null;
    const age = Date.now() - new Date(raw.refreshedAt).getTime();
    if (!Number.isFinite(age) || age < 0) return null;
    if (age > GESTAO_CACHE_TTL_MS + 5 * 60 * 1e3) return null;
    return {
      ...raw,
      fromCache: true,
      cacheAgeSec: Math.round(age / 1e3),
      nextRefreshAt: raw.nextRefreshAt || new Date(new Date(raw.refreshedAt).getTime() + GESTAO_CACHE_TTL_MS).toISOString()
    };
  } catch {
    return null;
  }
}
async function writeCachedSnapshot(ownerUserId, snapshot) {
  const sb = createSupabaseAdminClient();
  if (!sb) return;
  const toStore = {
    ...snapshot,
    fromCache: true,
    ownerUserId
  };
  await sb.from("system_settings").upsert(
    [{ key: cacheKey(ownerUserId), value: toStore, updated_at: (/* @__PURE__ */ new Date()).toISOString() }],
    { onConflict: "key" }
  );
  try {
    const { data } = await sb.from("system_settings").select("value").eq("key", OWNERS_KEY).maybeSingle();
    let owners = [];
    if (data?.value) {
      const raw = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      owners = Array.isArray(raw?.owners) ? raw.owners.map(String) : [];
    }
    if (!owners.includes(ownerUserId)) {
      owners.push(ownerUserId);
      await sb.from("system_settings").upsert(
        [{ key: OWNERS_KEY, value: { owners }, updated_at: (/* @__PURE__ */ new Date()).toISOString() }],
        { onConflict: "key" }
      );
    }
  } catch {
  }
}
async function listCacheOwnerIds() {
  const sb = createSupabaseAdminClient();
  if (!sb) return [];
  const ids = /* @__PURE__ */ new Set();
  try {
    const { data } = await sb.from("system_settings").select("value").eq("key", OWNERS_KEY).maybeSingle();
    if (data?.value) {
      const raw = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      for (const id of raw?.owners || []) ids.add(String(id));
    }
  } catch {
  }
  try {
    const { data } = await sb.from("investor_profiles").select("owner_user_id").limit(50);
    for (const row of data || []) {
      if (row?.owner_user_id) ids.add(String(row.owner_user_id));
    }
  } catch {
  }
  return [...ids];
}
async function refreshOwnerCache(ownerUserId) {
  const snap = await buildDashboardSnapshot(ownerUserId);
  if (!snap.ok) return { ok: false, error: snap.error };
  await writeCachedSnapshot(ownerUserId, snap);
  return { ok: true, refreshedAt: snap.refreshedAt };
}
async function refreshAllOwnerCaches() {
  const owners = await listCacheOwnerIds();
  if (owners.length === 0) {
    return { ok: true, refreshed: 0, errors: [] };
  }
  const errors = [];
  let refreshed = 0;
  for (const id of owners) {
    const r = await refreshOwnerCache(id);
    if (r.ok) refreshed++;
    else if (r.error) errors.push(`${id}: ${r.error}`);
  }
  return { ok: errors.length === 0, refreshed, errors };
}

// lib/investimentos/gestaoInvestimentoApi.ts
function headerValue2(req, name) {
  const raw = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] || "").trim();
  return String(raw || "").trim();
}
function parseBody(body) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" ? body : {};
}
async function resolvePrincipal(req) {
  const headerId = headerValue2(req, "x-tmseg-user-id");
  const headerName = headerValue2(req, "x-tmseg-user-name");
  const headerRole = headerValue2(req, "x-tmseg-role");
  if (headerId && headerName) {
    return {
      id: headerId,
      name: headerName,
      role: headerRole.toLowerCase(),
      email: null
    };
  }
  const token = extractAuthToken(req);
  const userId = extractUserIdFromToken(token);
  if (!userId) return null;
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  const { data } = await sb.from("system_users").select("id, name, email, status, profiles:profile_id ( name )").eq("id", userId).maybeSingle();
  if (!data || data.status !== "Ativo") return null;
  return {
    id: String(data.id),
    name: String(data.name || ""),
    role: String(data.profiles?.name || "").toLowerCase(),
    email: data.email || null
  };
}
function assertDiretoria(user) {
  if (!user) return { status: 401, body: { ok: false, error: "N\xE3o autorizado" } };
  if (!canAccessDiretoriaMenu(user)) {
    return { status: 403, body: { ok: false, error: "Acesso restrito \xE0 Diretoria (Gest\xE3o Investimento)." } };
  }
  return null;
}
function isMissingTableError2(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  return code === "42P01" || /does not exist|schema cache|Could not find the table/i.test(msg);
}
async function writeAudit(ownerUserId, actor, action, entityType, entityId, summary, payload = {}) {
  const sb = createSupabaseAdminClient();
  if (!sb) return;
  const integrity_hash = (0, import_crypto.createHash)("sha256").update(JSON.stringify({ action, entityType, entityId, summary, payload, at: Date.now() })).digest("hex").slice(0, 32);
  await sb.from("investment_audit_log").insert({
    owner_user_id: ownerUserId,
    actor_user_id: actor.id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    summary,
    payload,
    integrity_hash,
    source: "app"
  });
}
function mapProfileRow(body) {
  const num2 = (v) => v === "" || v == null ? null : Number(v);
  const bool = (v) => v === null || v === void 0 || v === "" ? null : Boolean(v);
  return {
    person_type: body.person_type ?? null,
    capital_available: num2(body.capital_available),
    emergency_reserve: num2(body.emergency_reserve),
    max_per_investment: num2(body.max_per_investment),
    horizon_months: body.horizon_months == null || body.horizon_months === "" ? null : Number(body.horizon_months),
    liquidity_need: body.liquidity_need ?? null,
    max_loss_pct: num2(body.max_loss_pct),
    risk_profile: body.risk_profile ?? null,
    exp_equity: bool(body.exp_equity),
    exp_private_credit: bool(body.exp_private_credit),
    exp_fii: bool(body.exp_fii),
    exp_crypto: bool(body.exp_crypto),
    needs_monthly_income: bool(body.needs_monthly_income),
    monthly_income_amount: num2(body.monthly_income_amount),
    restricted_sectors: String(body.restricted_sectors || ""),
    restricted_institutions: String(body.restricted_institutions || ""),
    investor_category: body.investor_category ?? null,
    allows_crypto: Boolean(body.allows_crypto),
    allows_international: Boolean(body.allows_international),
    monthly_target_pct_min: Number(body.monthly_target_pct_min ?? 1.5),
    monthly_target_pct_max: Number(body.monthly_target_pct_max ?? 2),
    broker_default: String(body.broker_default || "XP"),
    trading_sleeve_pct: Number(body.trading_sleeve_pct ?? 20),
    notes: String(body.notes || "")
  };
}
async function handleGestaoInvestimentoOp(op, req) {
  const method = String(req.method || "GET").toUpperCase();
  const body = parseBody(req.body);
  const q = req.query || {};
  if (op === "health") {
    try {
      const schemaReady = await Promise.race([
        isGestaoInvestimentoSchemaReady(),
        new Promise((resolve) => setTimeout(() => resolve(false), 8e3))
      ]);
      return { status: 200, body: { ok: true, schemaReady, module: "gestao-investimento", via: "light" } };
    } catch (e) {
      return { status: 500, body: { ok: false, schemaReady: false, error: e?.message || "Falha" } };
    }
  }
  if (op === "ensure-schema") {
    if (method !== "POST" && method !== "GET") {
      return { status: 405, body: { ok: false, error: "method_not_allowed" } };
    }
    const cronSecret = String(process.env.CRON_SECRET || "").trim();
    const auth = headerValue2(req, "authorization");
    const isCron = Boolean(cronSecret && auth === `Bearer ${cronSecret}`);
    if (!isCron) {
      if (method === "GET") {
        return { status: 401, body: { ok: false, error: "N\xE3o autorizado" } };
      }
      const user2 = await resolvePrincipal(req);
      const denied2 = assertDiretoria(user2);
      if (denied2) return denied2;
    }
    try {
      const result = await Promise.race([
        runGestaoInvestimentoMigrations(),
        new Promise(
          (resolve) => setTimeout(() => resolve({ ok: false, message: "Timeout ao aplicar schema (45s)", applied: false }), 45e3)
        )
      ]);
      return { status: result.ok ? 200 : 500, body: { ok: result.ok, ...result } };
    } catch (e) {
      return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
    }
  }
  if (op === "refresh-cache") {
    if (method !== "GET" && method !== "POST") {
      return { status: 405, body: { ok: false, error: "method_not_allowed" } };
    }
    const cronSecret = String(process.env.CRON_SECRET || "").trim();
    const auth = headerValue2(req, "authorization");
    const isCron = Boolean(cronSecret && auth === `Bearer ${cronSecret}`);
    if (isCron || method === "GET") {
      if (!isCron) return { status: 401, body: { ok: false, error: "N\xE3o autorizado" } };
      try {
        if (!await isGestaoInvestimentoSchemaReady()) {
          await runGestaoInvestimentoMigrations();
        }
        const result = await Promise.race([
          refreshAllOwnerCaches(),
          new Promise(
            (resolve) => setTimeout(() => resolve({ ok: false, refreshed: 0, errors: ["timeout 50s"] }), 5e4)
          )
        ]);
        return { status: result.ok || result.refreshed > 0 ? 200 : 500, body: { ok: true, ...result, via: "cron" } };
      } catch (e) {
        return { status: 500, body: { ok: false, error: e?.message || "Falha no refresh-cache" } };
      }
    }
    const user2 = await resolvePrincipal(req);
    const denied2 = assertDiretoria(user2);
    if (denied2) return denied2;
    const r = await refreshOwnerCache(user2.id);
    return { status: r.ok ? 200 : 500, body: { ok: r.ok, ...r, via: "manual" } };
  }
  const user = await resolvePrincipal(req);
  const denied = assertDiretoria(user);
  if (denied) return denied;
  const principal = user;
  if (op === "summary") {
    if (method !== "GET") return { status: 405, body: { ok: false, error: "method_not_allowed" } };
    const forceLive = String(q.fresh || q.live || "") === "1";
    try {
      if (!forceLive) {
        const cached = await readCachedSnapshot(principal.id);
        if (cached) {
          const revived = await reviveStaleScenario(cached);
          if (revived !== cached) {
            void writeCachedSnapshot(principal.id, revived).catch(() => {
            });
          }
          return { status: 200, body: { ...revived, via: revived.fromCache ? "cache" : "cache_revived", schemaReady: true } };
        }
      }
      const ready = await Promise.race([
        isGestaoInvestimentoSchemaReady(),
        new Promise((resolve) => setTimeout(() => resolve(false), 6e3))
      ]);
      if (!ready) {
        return {
          status: 503,
          body: {
            ok: false,
            error: "schema_missing",
            message: "Migration da Gest\xE3o Investimento ainda n\xE3o aplicada. Use \u201CAplicar schema no Supabase\u201D ou rode o SQL em migrations/2026_08_04_gestao_investimento_fundacao.sql"
          }
        };
      }
      const snap = await buildDashboardSnapshot(principal.id);
      if (!snap.ok) {
        if (snap.schema_missing) {
          return {
            status: 503,
            body: { ok: false, error: "schema_missing", message: "Migration da Gest\xE3o Investimento ainda n\xE3o aplicada." }
          };
        }
        return { status: 500, body: { ok: false, error: snap.error } };
      }
      void writeCachedSnapshot(principal.id, snap).catch(() => {
      });
      return { status: 200, body: { ...snap, via: "live", fromCache: false } };
    } catch (e) {
      if (isMissingTableError2(e)) {
        return { status: 503, body: { ok: false, error: "schema_missing", message: "Migration ainda n\xE3o aplicada." } };
      }
      return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
    }
  }
  if (op === "profile") {
    if (method !== "PUT" && method !== "POST") return { status: 405, body: { ok: false, error: "method_not_allowed" } };
    try {
      const sb = createSupabaseAdminClient();
      if (!sb) return { status: 503, body: { ok: false, error: "Supabase admin indispon\xEDvel" } };
      const mapped = mapProfileRow(body || {});
      const row = {
        owner_user_id: principal.id,
        ...mapped,
        updated_by: principal.name,
        created_by: principal.name,
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        source: "manual",
        data_reference_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const { data: existing } = await sb.from("investor_profiles").select("id, version").eq("owner_user_id", principal.id).maybeSingle();
      let saved;
      if (existing?.id) {
        const { data, error } = await sb.from("investor_profiles").update({ ...row, version: Number(existing.version || 1) + 1, created_by: void 0 }).eq("id", existing.id).select("*").single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await sb.from("investor_profiles").insert({ ...row, version: 1 }).select("*").single();
        if (error) throw error;
        saved = data;
      }
      await sb.from("investment_portfolios").upsert(
        {
          owner_user_id: principal.id,
          name: "Carteira XP",
          broker: String(mapped.broker_default || "XP"),
          monitored_capital: Number(mapped.capital_available || 0),
          updated_by: principal.name,
          created_by: principal.name,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        },
        { onConflict: "owner_user_id" }
      );
      await sb.from("investment_risk_limits").upsert(
        {
          owner_user_id: principal.id,
          max_pct_crypto: mapped.allows_crypto ? 5 : 0,
          updated_by: principal.name,
          created_by: principal.name,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        },
        { onConflict: "owner_user_id" }
      );
      const completeness = evaluateProfileCompleteness(saved);
      await writeAudit(principal.id, principal, "profile_upsert", "investor_profiles", saved.id, "Perfil do investidor salvo", {
        complete: completeness.complete,
        missing: completeness.missing
      });
      void refreshOwnerCache(principal.id).catch(() => {
      });
      return { status: 200, body: { ok: true, profile: saved, completeness } };
    } catch (e) {
      if (isMissingTableError2(e)) return { status: 503, body: { ok: false, error: "schema_missing", message: "Migration ainda n\xE3o aplicada." } };
      return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
    }
  }
  if (op === "positions") {
    const sb = createSupabaseAdminClient();
    if (!sb) return { status: 503, body: { ok: false, error: "Supabase admin indispon\xEDvel" } };
    const id = String(q.id || body.id || "").trim();
    if (method === "GET") {
      try {
        const { data, error } = await sb.from("investment_positions").select("*").eq("owner_user_id", principal.id).eq("is_active", true).order("created_at", { ascending: false });
        if (error) throw error;
        return { status: 200, body: { ok: true, positions: data || [] } };
      } catch (e) {
        if (isMissingTableError2(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
        return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
      }
    }
    if (method === "POST") {
      try {
        const instrument_name = String(body.instrument_name || "").trim();
        if (!instrument_name) return { status: 400, body: { ok: false, error: "Nome do ativo \xE9 obrigat\xF3rio" } };
        const qty = Number(body.quantity || 0);
        const avg = Number(body.avg_price || 0);
        const mark = body.last_mark_price != null && body.last_mark_price !== "" ? Number(body.last_mark_price) : avg;
        const row = {
          owner_user_id: principal.id,
          instrument_name,
          instrument_code: String(body.instrument_code || ""),
          instrument_type: String(body.instrument_type || "outros"),
          quantity: qty,
          avg_price: avg,
          current_value: Number(body.current_value || (qty > 0 && mark > 0 ? qty * mark : 0)),
          entry_date: body.entry_date || null,
          broker: String(body.broker || "XP"),
          taxation_notes: String(body.taxation_notes || ""),
          currency: String(body.currency || "BRL"),
          sleeve: String(body.sleeve || "trading") === "investimento" ? "investimento" : "trading",
          last_mark_price: mark > 0 ? mark : null,
          last_mark_at: mark > 0 ? (/* @__PURE__ */ new Date()).toISOString() : null,
          target_sell_pct: Number(body.target_sell_pct ?? 3),
          stop_loss_pct: Number(body.stop_loss_pct ?? 2),
          is_active: true,
          source: "manual",
          created_by: principal.name,
          updated_by: principal.name,
          data_reference_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        const { data, error } = await sb.from("investment_positions").insert(row).select("*").single();
        if (error) throw error;
        await writeAudit(principal.id, principal, "position_create", "investment_positions", data.id, `Posi\xE7\xE3o criada: ${instrument_name}`, {
          current_value: row.current_value,
          broker: row.broker
        });
        void refreshOwnerCache(principal.id).catch(() => {
        });
        return { status: 201, body: { ok: true, position: data } };
      } catch (e) {
        if (isMissingTableError2(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
        return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
      }
    }
    if (method === "DELETE") {
      if (!id) return { status: 400, body: { ok: false, error: "Informe id" } };
      try {
        const { error } = await sb.from("investment_positions").update({ is_active: false, updated_by: principal.name, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("owner_user_id", principal.id);
        if (error) throw error;
        await writeAudit(principal.id, principal, "position_deactivate", "investment_positions", id, "Posi\xE7\xE3o desativada");
        void refreshOwnerCache(principal.id).catch(() => {
        });
        return { status: 200, body: { ok: true } };
      } catch (e) {
        if (isMissingTableError2(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
        return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
      }
    }
    return { status: 405, body: { ok: false, error: "method_not_allowed" } };
  }
  if (op === "watchlist") {
    const sb = createSupabaseAdminClient();
    if (!sb) return { status: 503, body: { ok: false, error: "Supabase admin indispon\xEDvel" } };
    const id = String(q.id || body.id || "").trim();
    if (method === "POST") {
      try {
        const instrument_name = String(body.instrument_name || "").trim();
        if (!instrument_name) return { status: 400, body: { ok: false, error: "Nome do ativo \xE9 obrigat\xF3rio" } };
        const row = {
          owner_user_id: principal.id,
          instrument_name,
          instrument_code: String(body.instrument_code || ""),
          instrument_type: String(body.instrument_type || "outros"),
          notes: String(body.notes || ""),
          priority: Number(body.priority || 3),
          status: body.status || "observar",
          source: "manual",
          created_by: principal.name,
          updated_by: principal.name
        };
        const { data, error } = await sb.from("investment_watchlists").insert(row).select("*").single();
        if (error) throw error;
        await writeAudit(principal.id, principal, "watchlist_create", "investment_watchlists", data.id, `Watchlist: ${instrument_name}`);
        void refreshOwnerCache(principal.id).catch(() => {
        });
        return { status: 201, body: { ok: true, item: data } };
      } catch (e) {
        if (isMissingTableError2(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
        return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
      }
    }
    if (method === "DELETE") {
      if (!id) return { status: 400, body: { ok: false, error: "Informe id" } };
      try {
        const { error } = await sb.from("investment_watchlists").delete().eq("id", id).eq("owner_user_id", principal.id);
        if (error) throw error;
        await writeAudit(principal.id, principal, "watchlist_delete", "investment_watchlists", id, "Item removido da watchlist");
        void refreshOwnerCache(principal.id).catch(() => {
        });
        return { status: 200, body: { ok: true } };
      } catch (e) {
        if (isMissingTableError2(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
        return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
      }
    }
    return { status: 405, body: { ok: false, error: "method_not_allowed" } };
  }
  if (op === "mark") {
    if (method !== "POST" && method !== "PUT") return { status: 405, body: { ok: false, error: "method_not_allowed" } };
    const sb = createSupabaseAdminClient();
    if (!sb) return { status: 503, body: { ok: false, error: "Supabase admin indispon\xEDvel" } };
    const id = String(body.id || q.id || "").trim();
    const price = Number(body.price ?? body.last_mark_price);
    if (!id) return { status: 400, body: { ok: false, error: "Informe id da posi\xE7\xE3o" } };
    if (!Number.isFinite(price) || price <= 0) return { status: 400, body: { ok: false, error: "Informe pre\xE7o v\xE1lido do banco" } };
    try {
      const { data: pos, error: pErr } = await sb.from("investment_positions").select("*").eq("id", id).eq("owner_user_id", principal.id).maybeSingle();
      if (pErr) throw pErr;
      if (!pos) return { status: 404, body: { ok: false, error: "Posi\xE7\xE3o n\xE3o encontrada" } };
      const qty = Number(pos.quantity || 0);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const { data, error } = await sb.from("investment_positions").update({
        last_mark_price: price,
        last_mark_at: now,
        current_value: qty > 0 ? Math.round(qty * price * 100) / 100 : Number(pos.current_value || 0),
        updated_by: principal.name,
        updated_at: now,
        data_reference_at: now
      }).eq("id", id).eq("owner_user_id", principal.id).select("*").single();
      if (error) throw error;
      await writeAudit(principal.id, principal, "position_mark", "investment_positions", id, `Cota\xE7\xE3o manual ${pos.instrument_code || pos.instrument_name}: ${price}`, {
        price,
        at: now
      });
      void refreshOwnerCache(principal.id).catch(() => {
      });
      return { status: 200, body: { ok: true, position: data } };
    } catch (e) {
      if (isMissingTableError2(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
      return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
    }
  }
  if (op === "trade") {
    if (method === "GET") {
      const sb2 = createSupabaseAdminClient();
      if (!sb2) return { status: 503, body: { ok: false, error: "Supabase admin indispon\xEDvel" } };
      try {
        const limit = Math.min(100, Math.max(1, Number(q.limit || 30)));
        const { data, error } = await sb2.from("investment_trades").select("*").eq("owner_user_id", principal.id).order("executed_at", { ascending: false }).limit(limit);
        if (error) throw error;
        return { status: 200, body: { ok: true, trades: data || [] } };
      } catch (e) {
        if (isMissingTableError2(e)) return { status: 503, body: { ok: false, error: "schema_missing", message: "Rode ensure-schema (mesa de trading)." } };
        return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
      }
    }
    if (method !== "POST") return { status: 405, body: { ok: false, error: "method_not_allowed" } };
    const sb = createSupabaseAdminClient();
    if (!sb) return { status: 503, body: { ok: false, error: "Supabase admin indispon\xEDvel" } };
    const side = String(body.side || "").toLowerCase() === "sell" ? "sell" : String(body.side || "").toLowerCase() === "buy" ? "buy" : "";
    if (!side) return { status: 400, body: { ok: false, error: "side deve ser buy ou sell" } };
    const instrument_name = String(body.instrument_name || "").trim();
    const instrument_code = String(body.instrument_code || "").trim();
    const quantity = Number(body.quantity || 0);
    const price = Number(body.price || 0);
    if (!instrument_name && !instrument_code) return { status: 400, body: { ok: false, error: "Informe o ativo" } };
    if (!(quantity > 0) || !(price > 0)) return { status: 400, body: { ok: false, error: "Quantidade e pre\xE7o do banco s\xE3o obrigat\xF3rios" } };
    try {
      const amount = Math.round(quantity * price * 100) / 100;
      const broker = String(body.broker || "XP");
      const sleeve = String(body.sleeve || "trading") === "investimento" ? "investimento" : "trading";
      const proof_note = String(body.proof_note || "").slice(0, 2e3);
      const proof_image = String(body.proof_image || "").slice(0, 35e4);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const [{ data: positions }, { data: watchlist }, { data: profile }] = await Promise.all([
        sb.from("investment_positions").select("*").eq("owner_user_id", principal.id).eq("is_active", true),
        sb.from("investment_watchlists").select("*").eq("owner_user_id", principal.id),
        sb.from("investor_profiles").select("*").eq("owner_user_id", principal.id).maybeSingle()
      ]);
      const desk = buildTradingDesk(
        profile ? { ...createDraftInvestorProfile(), ...profile } : createDraftInvestorProfile(),
        positions || [],
        watchlist || []
      );
      const rotate = side === "sell" ? desk.top10.find((a) => a.side === "COMPRAR") || desk.alerts.find((a) => a.side === "COMPRAR") : null;
      let positionId = String(body.position_id || "").trim() || null;
      if (side === "buy") {
        const code = (instrument_code || instrument_name).toUpperCase();
        const existing = (positions || []).find(
          (p) => String(p.instrument_code || "").toUpperCase() === code || String(p.instrument_name || "").toUpperCase() === code
        );
        if (existing) {
          const newQty = Number(existing.quantity || 0) + quantity;
          const oldCost = Number(existing.quantity || 0) * Number(existing.avg_price || 0);
          const newAvg = newQty > 0 ? (oldCost + amount) / newQty : price;
          const { data: upd, error: uErr } = await sb.from("investment_positions").update({
            quantity: newQty,
            avg_price: newAvg,
            current_value: Math.round(newQty * price * 100) / 100,
            last_mark_price: price,
            last_mark_at: now,
            sleeve,
            broker,
            updated_by: principal.name,
            updated_at: now,
            data_reference_at: now
          }).eq("id", existing.id).eq("owner_user_id", principal.id).select("id").single();
          if (uErr) throw uErr;
          positionId = upd.id;
        } else {
          const { data: created, error: cErr } = await sb.from("investment_positions").insert({
            owner_user_id: principal.id,
            instrument_name: instrument_name || instrument_code,
            instrument_code: instrument_code || instrument_name,
            instrument_type: String(body.instrument_type || "acao"),
            quantity,
            avg_price: price,
            current_value: amount,
            entry_date: (body.executed_at || now).slice(0, 10),
            broker,
            sleeve,
            last_mark_price: price,
            last_mark_at: now,
            target_sell_pct: Number(body.target_sell_pct ?? 3),
            stop_loss_pct: Number(body.stop_loss_pct ?? 2),
            is_active: true,
            source: "manual",
            created_by: principal.name,
            updated_by: principal.name,
            data_reference_at: now
          }).select("id").single();
          if (cErr) throw cErr;
          positionId = created.id;
        }
      } else if (side === "sell" && positionId) {
        const { data: pos, error: pErr } = await sb.from("investment_positions").select("*").eq("id", positionId).eq("owner_user_id", principal.id).maybeSingle();
        if (pErr) throw pErr;
        if (pos) {
          const left = Math.max(0, Number(pos.quantity || 0) - quantity);
          await sb.from("investment_positions").update({
            quantity: left,
            current_value: Math.round(left * price * 100) / 100,
            last_mark_price: price,
            last_mark_at: now,
            is_active: left > 1e-7,
            updated_by: principal.name,
            updated_at: now,
            data_reference_at: now
          }).eq("id", positionId).eq("owner_user_id", principal.id);
        }
      }
      const tradeRow = {
        owner_user_id: principal.id,
        position_id: positionId,
        side,
        instrument_name: instrument_name || instrument_code,
        instrument_code: instrument_code || instrument_name,
        instrument_type: String(body.instrument_type || "acao"),
        sleeve,
        quantity,
        price,
        amount_brl: amount,
        broker,
        executed_at: body.executed_at || now,
        proof_note,
        proof_image,
        notes: String(body.notes || ""),
        rotated_buy_code: rotate?.ticker || "",
        rotated_buy_name: rotate?.name || "",
        source: "manual",
        created_by: principal.name
      };
      const { data: trade, error: tErr } = await sb.from("investment_trades").insert(tradeRow).select("*").single();
      if (tErr) throw tErr;
      await writeAudit(
        principal.id,
        principal,
        side === "buy" ? "trade_buy" : "trade_sell",
        "investment_trades",
        trade.id,
        `${side === "buy" ? "Compra" : "Venda"} registrada: ${tradeRow.instrument_code} @ ${price}`,
        {
          quantity,
          price,
          amount,
          rotated_buy: rotate?.ticker || null
        }
      );
      void refreshOwnerCache(principal.id).catch(() => {
      });
      return {
        status: 201,
        body: {
          ok: true,
          trade,
          rotateBuy: rotate ? { ticker: rotate.ticker, name: rotate.name, reason: rotate.reason, amountBrl: rotate.amountBrl } : null,
          message: side === "sell" && rotate ? `Venda registrada. Pr\xF3xima compra sugerida: ${rotate.ticker} \u2014 ${rotate.name}` : "Opera\xE7\xE3o registrada. Cota\xE7\xE3o/posi\xE7\xE3o atualizadas."
        }
      };
    } catch (e) {
      if (isMissingTableError2(e)) {
        return { status: 503, body: { ok: false, error: "schema_missing", message: "Rode \u201CAplicar schema\u201D para liberar a mesa de trading." } };
      }
      return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
    }
  }
  if (op === "audit") {
    if (method !== "GET") return { status: 405, body: { ok: false, error: "method_not_allowed" } };
    try {
      const sb = createSupabaseAdminClient();
      if (!sb) return { status: 503, body: { ok: false, error: "Supabase admin indispon\xEDvel" } };
      const limit = Math.min(100, Math.max(1, Number(q.limit || 50)));
      const { data, error } = await sb.from("investment_audit_log").select("id, action, entity_type, entity_id, summary, created_at, actor_user_id, integrity_hash").eq("owner_user_id", principal.id).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return { status: 200, body: { ok: true, items: data || [] } };
    } catch (e) {
      if (isMissingTableError2(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
      return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
    }
  }
  if (op === "risk-limits") {
    if (method !== "PUT" && method !== "POST") return { status: 405, body: { ok: false, error: "method_not_allowed" } };
    try {
      const sb = createSupabaseAdminClient();
      if (!sb) return { status: 503, body: { ok: false, error: "Supabase admin indispon\xEDvel" } };
      const row = {
        owner_user_id: principal.id,
        max_pct_per_asset: Number(body.max_pct_per_asset ?? 20),
        max_pct_per_issuer: Number(body.max_pct_per_issuer ?? 25),
        max_pct_per_institution: Number(body.max_pct_per_institution ?? 40),
        max_pct_per_class: Number(body.max_pct_per_class ?? 40),
        max_pct_illiquid: Number(body.max_pct_illiquid ?? 15),
        max_pct_private_credit: Number(body.max_pct_private_credit ?? 20),
        max_pct_fx: Number(body.max_pct_fx ?? 10),
        max_pct_crypto: Number(body.max_pct_crypto ?? 0),
        min_cash_pct: Number(body.min_cash_pct ?? 5),
        emergency_reserve_untouchable: body.emergency_reserve_untouchable !== false,
        updated_by: principal.name,
        created_by: principal.name,
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        source: "manual"
      };
      const { data, error } = await sb.from("investment_risk_limits").upsert(row, { onConflict: "owner_user_id" }).select("*").single();
      if (error) throw error;
      await writeAudit(principal.id, principal, "risk_limits_upsert", "investment_risk_limits", data.id, "Limites de risco atualizados");
      return { status: 200, body: { ok: true, riskLimits: data } };
    } catch (e) {
      if (isMissingTableError2(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
      return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
    }
  }
  return {
    status: 400,
    body: { ok: false, error: "Informe op=health|summary|ensure-schema|refresh-cache|profile|positions|watchlist|audit|risk-limits" }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  assertDiretoria,
  handleGestaoInvestimentoOp,
  resolvePrincipal
});
