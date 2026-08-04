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
    const value = cleanEnv(candidate);
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
    notes: "",
    ...partial
  };
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

-- Fontes de dados (cadastro; coleta vem nas fases seguintes)
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

-- RLS: m\xF3dulo restrito \u2014 service role (API) bypassa; anon sem acesso amplo.
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
function splitStatements(sql) {
  return sql.split(";").map(
    (block) => block.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").trim()
  ).filter(Boolean);
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
  if (await isGestaoInvestimentoSchemaReady()) {
    return { ok: true, message: "Schema Gest\xE3o Investimento j\xE1 pronto", applied: false };
  }
  const statements = splitStatements(GESTAO_INVESTIMENTO_FUNDACAO_SQL);
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
        if (!/already exists|duplicate/i.test(msg)) {
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
  for (const table of REQUIRED_TABLES) {
    const { error } = await client.from(table).select("*").limit(1);
    if (error) {
      return {
        ok: false,
        message: `Tabela ${table} inacess\xEDvel ap\xF3s migration: ${error.message}${errors.length ? ` | ${errors[0]}` : ""}`,
        applied: true
      };
    }
  }
  if (errors.length) {
    console.warn("[GestaoInvestimento] Migration avisos:", errors.join(" | "));
  }
  console.log("[GestaoInvestimento] Schema funda\xE7\xE3o aplicado/verificado.");
  return { ok: true, message: "Schema Gest\xE3o Investimento OK", applied: true };
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
function isMissingTableError(err) {
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
  const num = (v) => v === "" || v == null ? null : Number(v);
  const bool = (v) => v === null || v === void 0 || v === "" ? null : Boolean(v);
  return {
    person_type: body.person_type ?? null,
    capital_available: num(body.capital_available),
    emergency_reserve: num(body.emergency_reserve),
    max_per_investment: num(body.max_per_investment),
    horizon_months: body.horizon_months == null || body.horizon_months === "" ? null : Number(body.horizon_months),
    liquidity_need: body.liquidity_need ?? null,
    max_loss_pct: num(body.max_loss_pct),
    risk_profile: body.risk_profile ?? null,
    exp_equity: bool(body.exp_equity),
    exp_private_credit: bool(body.exp_private_credit),
    exp_fii: bool(body.exp_fii),
    exp_crypto: bool(body.exp_crypto),
    needs_monthly_income: bool(body.needs_monthly_income),
    monthly_income_amount: num(body.monthly_income_amount),
    restricted_sectors: String(body.restricted_sectors || ""),
    restricted_institutions: String(body.restricted_institutions || ""),
    investor_category: body.investor_category ?? null,
    allows_crypto: Boolean(body.allows_crypto),
    allows_international: Boolean(body.allows_international),
    monthly_target_pct_min: Number(body.monthly_target_pct_min ?? 1.5),
    monthly_target_pct_max: Number(body.monthly_target_pct_max ?? 2),
    broker_default: String(body.broker_default || "XP"),
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
  const user = await resolvePrincipal(req);
  const denied = assertDiretoria(user);
  if (denied) return denied;
  const principal = user;
  if (op === "summary") {
    if (method !== "GET") return { status: 405, body: { ok: false, error: "method_not_allowed" } };
    try {
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
      const sb = createSupabaseAdminClient();
      if (!sb) return { status: 503, body: { ok: false, error: "Supabase admin indispon\xEDvel" } };
      const [{ data: profile, error: pErr }, { data: positions, error: posErr }, { data: watchlist }, { data: limits }, { data: sources }] = await Promise.all([
        sb.from("investor_profiles").select("*").eq("owner_user_id", principal.id).maybeSingle(),
        sb.from("investment_positions").select("*").eq("owner_user_id", principal.id).eq("is_active", true).order("created_at", { ascending: false }),
        sb.from("investment_watchlists").select("*").eq("owner_user_id", principal.id).order("priority", { ascending: true }),
        sb.from("investment_risk_limits").select("*").eq("owner_user_id", principal.id).maybeSingle(),
        sb.from("investment_data_sources").select("code, name, url, reliability, is_active, last_collected_at").eq("is_active", true)
      ]);
      if (pErr && isMissingTableError(pErr)) {
        return {
          status: 503,
          body: {
            ok: false,
            error: "schema_missing",
            message: "Migration da Gest\xE3o Investimento ainda n\xE3o aplicada."
          }
        };
      }
      if (pErr) return { status: 500, body: { ok: false, error: pErr.message } };
      if (posErr && !isMissingTableError(posErr)) return { status: 500, body: { ok: false, error: posErr.message } };
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
      return {
        status: 200,
        body: {
          ok: true,
          schemaReady: true,
          via: "light",
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
          }
        }
      };
    } catch (e) {
      if (isMissingTableError(e)) {
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
      return { status: 200, body: { ok: true, profile: saved, completeness } };
    } catch (e) {
      if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: "schema_missing", message: "Migration ainda n\xE3o aplicada." } };
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
        if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
        return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
      }
    }
    if (method === "POST") {
      try {
        const instrument_name = String(body.instrument_name || "").trim();
        if (!instrument_name) return { status: 400, body: { ok: false, error: "Nome do ativo \xE9 obrigat\xF3rio" } };
        const row = {
          owner_user_id: principal.id,
          instrument_name,
          instrument_code: String(body.instrument_code || ""),
          instrument_type: String(body.instrument_type || "outros"),
          quantity: Number(body.quantity || 0),
          avg_price: Number(body.avg_price || 0),
          current_value: Number(body.current_value || 0),
          entry_date: body.entry_date || null,
          broker: String(body.broker || "XP"),
          taxation_notes: String(body.taxation_notes || ""),
          currency: String(body.currency || "BRL"),
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
        return { status: 201, body: { ok: true, position: data } };
      } catch (e) {
        if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
        return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
      }
    }
    if (method === "DELETE") {
      if (!id) return { status: 400, body: { ok: false, error: "Informe id" } };
      try {
        const { error } = await sb.from("investment_positions").update({ is_active: false, updated_by: principal.name, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("owner_user_id", principal.id);
        if (error) throw error;
        await writeAudit(principal.id, principal, "position_deactivate", "investment_positions", id, "Posi\xE7\xE3o desativada");
        return { status: 200, body: { ok: true } };
      } catch (e) {
        if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
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
        return { status: 201, body: { ok: true, item: data } };
      } catch (e) {
        if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
        return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
      }
    }
    if (method === "DELETE") {
      if (!id) return { status: 400, body: { ok: false, error: "Informe id" } };
      try {
        const { error } = await sb.from("investment_watchlists").delete().eq("id", id).eq("owner_user_id", principal.id);
        if (error) throw error;
        await writeAudit(principal.id, principal, "watchlist_delete", "investment_watchlists", id, "Item removido da watchlist");
        return { status: 200, body: { ok: true } };
      } catch (e) {
        if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
        return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
      }
    }
    return { status: 405, body: { ok: false, error: "method_not_allowed" } };
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
      if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
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
      if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: "schema_missing" } };
      return { status: 500, body: { ok: false, error: e?.message || "Falha" } };
    }
  }
  return {
    status: 400,
    body: { ok: false, error: "Informe op=health|summary|ensure-schema|profile|positions|watchlist|audit|risk-limits" }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  assertDiretoria,
  handleGestaoInvestimentoOp,
  resolvePrincipal
});
