/**
 * Esteira contínua do Radar (play/pause).
 * Caça multimotor (DDG/Bing/Yahoo) → extração Gemini opcional → grava no Radar.
 * CNPJ opcional (Pendente de CNPJ). BrasilAPI só enriquece quando há CNPJ — não bloqueia.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { digitosCnpj, cnpjValido14 } from '../lib/partnerProspects/cnpj';
import { checarDuplicataCnpj } from '../lib/partnerProspects/dedupe';
import {
  proximosAlvos,
  proximoMicroAlvo,
  rotuloMicroAlvo,
  type MicroTarget,
} from '../lib/partnerProspects/geoMatrix';
import { descobrirEmpresasPorAlvo } from '../lib/partnerProspects/discoverWithGemini';
import { validarCnpjBrasilApi } from '../lib/partnerProspects/brasilApiCnpj';
import { escolherEmailPreferencial } from '../lib/partnerProspects/emailFilter';
import {
  buscarMultimotor,
  empresasHeuristicasDosHits,
  montarQueriesMultimotor,
} from '../lib/partnerProspects/multiEngineSearch';
import { extrairEmpresasComGeminiDosHits } from '../lib/partnerProspects/extractFromHits';
import { pareceLixoProspecto, pareceEmpresaSeguranca } from '../lib/partnerProspects/junkFilter';
import {
  classificarEmpresaComGemini,
  enriquecerProspecto,
} from '../lib/partnerProspects/enrichProspect';
import { isGeminiConfigured } from './geminiClient';
import { createSupabaseAdminClient } from './supabaseConfig';

const MAX_ENRICH_POR_TICK = Number(process.env.PARTNER_RADAR_MAX_ENRICH || 3);

export type PartnerRadarRobotResult = {
  ok: boolean;
  enabled: boolean;
  runStatus: 'running' | 'paused' | string;
  mode: 'micro' | 'lote_noturno' | 'idle' | 'skipped';
  ufs: string[];
  activity: string | null;
  inserted: number;
  skipped: number;
  queries: string[];
  errors: string[];
  durationMs: number;
};

const MAX_INSERTS_MICRO = Number(process.env.PARTNER_RADAR_MAX_INSERTS_MICRO || 8);
const MAX_INSERTS_LOTE = Number(process.env.PARTNER_RADAR_MAX_INSERTS || 20);
const PAUSA_MS = Number(process.env.PARTNER_RADAR_PAUSE_MS || 800);
const MIN_INTERVAL_MS = Number(process.env.PARTNER_RADAR_MIN_INTERVAL_MS || 45_000);
const ERROR_BACKOFF_MS = Number(process.env.PARTNER_RADAR_ERROR_BACKOFF_MS || 30_000);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function logRobo(...args: unknown[]) {
  console.log('[Robô]', ...args);
}

function hojeBR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function normalizarNome(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

async function atualizarEstado(sb: SupabaseClient, patch: Record<string, unknown>) {
  await sb.from('partner_radar_robot_state').upsert({
    id: 1,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

type ProspectRow = { id: string; cnpj: string | null; company_name?: string | null; state_uf?: string | null };

function temContactoUtil(emp: {
  email?: string | null;
  phone?: string | null;
  website?: string | null;
}): boolean {
  return !!(emp.email || emp.phone || emp.website);
}

function jaExisteSemCnpj(
  emp: { company_name: string; state_uf?: string | null },
  prospects: ProspectRow[],
): boolean {
  const nome = normalizarNome(emp.company_name);
  if (nome.length < 5) return false;
  const uf = String(emp.state_uf || '').toUpperCase();
  return prospects.some((p) => {
    if (p.cnpj) return false;
    if (uf && p.state_uf && String(p.state_uf).toUpperCase() !== uf) return false;
    return normalizarNome(p.company_name || '') === nome;
  });
}

async function gravarEmpresas(
  sb: SupabaseClient,
  empresas: Array<{
    company_name: string;
    trade_name?: string | null;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    city?: string | null;
    state_uf?: string | null;
    notes?: string | null;
  }>,
  contexto: { uf: string; label: string },
  existentes: {
    providers: { id: string; cnpj: string; name?: string }[];
    prospects: ProspectRow[];
  },
  limite: number,
): Promise<{
  inserted: number;
  skipped: number;
  errors: string[];
  pendenteCnpj: number;
  insertedIds: string[];
}> {
  let inserted = 0;
  let skipped = 0;
  let pendenteCnpj = 0;
  const errors: string[] = [];
  const insertedIds: string[] = [];
  const cnpjsLote = new Set<string>();
  const nomesLote = new Set<string>();

  for (const emp of empresas) {
    if (inserted >= limite) break;

    const nome = String(emp.company_name || '').trim();
    if (nome.length < 3) {
      skipped++;
      continue;
    }

    if (
      pareceLixoProspecto(emp) ||
      (!pareceEmpresaSeguranca(nome, emp.notes) && !emp.cnpj)
    ) {
      skipped++;
      continue;
    }

    // Regra liberal: Nome + (telefone OU e-mail OU site) OU CNPJ válido.
    const temCnpj = !!(emp.cnpj && cnpjValido14(emp.cnpj));
    if (!temCnpj && !temContactoUtil(emp)) {
      skipped++;
      continue;
    }

    const nomeKey = `${normalizarNome(nome)}|${(emp.state_uf || contexto.uf || '').toUpperCase()}`;
    if (nomesLote.has(nomeKey)) {
      skipped++;
      continue;
    }

    let cnpjFinal: string | null = null;
    let razao = nome.toUpperCase();
    let fantasia = (emp.trade_name || '').toString().trim().toUpperCase() || null;
    let email = escolherEmailPreferencial([emp.email], emp.website);
    let phone = emp.phone || null;
    let city = (emp.city || '').toString().trim().toUpperCase() || null;
    let uf = (emp.state_uf || contexto.uf || '').toUpperCase().slice(0, 2) || null;
    const notas: string[] = ['Descoberto por IA Web', emp.notes || null, `Alvo: ${contexto.label}`].filter(
      Boolean,
    ) as string[];

    if (temCnpj) {
      const cnpj = digitosCnpj(emp.cnpj);
      if (cnpjsLote.has(cnpj)) {
        skipped++;
        continue;
      }
      const dup = checarDuplicataCnpj(cnpj, existentes.providers, existentes.prospects as any);
      if (!dup.ok) {
        skipped++;
        continue;
      }

      await sleep(Math.min(PAUSA_MS, 600));
      const validacao = await validarCnpjBrasilApi(cnpj);
      if (validacao.ok) {
        cnpjFinal = validacao.cnpj;
        razao = (validacao.razaoSocial || nome).toUpperCase();
        fantasia = (validacao.nomeFantasia || fantasia || '').toString().trim().toUpperCase() || null;
        email = escolherEmailPreferencial([emp.email, validacao.emailApi], emp.website);
        phone = emp.phone || validacao.telefoneApi || phone;
        city = (validacao.cidade || city || '').toString().trim().toUpperCase() || null;
        uf = validacao.uf || uf;
        notas.push(`CNAE: ${validacao.cnaes.join(',')}`);
        notas.push('BrasilAPI: ok');
      } else {
        // Não descarta: grava CNPJ encontrado na web mesmo se BrasilAPI falhar / CNAE diferente.
        cnpjFinal = cnpj;
        notas.push(`BrasilAPI: ${validacao.motivo} (gravado mesmo assim)`);
        logRobo(`BrasilAPI não bloqueou — gravando ${cnpj}: ${validacao.motivo}`);
      }
      cnpjsLote.add(cnpj);
    } else {
      if (jaExisteSemCnpj({ company_name: nome, state_uf: uf }, existentes.prospects)) {
        skipped++;
        continue;
      }
      notas.push('Pendente de CNPJ');
      pendenteCnpj++;
    }

    const payload = {
      cnpj: cnpjFinal,
      company_name: razao,
      trade_name: fantasia,
      state_uf: uf,
      city,
      email,
      emails: email ? [email] : [],
      phone,
      website: emp.website || null,
      notes: notas.join(' | '),
      source: 'robo_24h',
      status: 'radar',
      pf_status: 'nao_verificado',
      enrichment_status: 'pending',
      created_by: 'ROBO_24H',
      updated_by: 'ROBO_24H',
    };

    const { data: insertedRow, error: insErr } = await sb
      .from('partner_prospects')
      .insert([payload])
      .select('id')
      .single();

    if (insErr) {
      errors.push(`insert:${nome.slice(0, 40)}:${insErr.message}`);
      skipped++;
      continue;
    }

    nomesLote.add(nomeKey);
    existentes.prospects.push({
      id: insertedRow.id,
      cnpj: cnpjFinal,
      company_name: razao,
      state_uf: uf,
    });
    inserted++;
    insertedIds.push(insertedRow.id);

    await sb.from('partner_prospect_events').insert([
      {
        prospect_id: insertedRow.id,
        event_type: cnpjFinal ? 'descoberta_web_ia' : 'descoberta_web_sem_cnpj',
        from_status: null,
        to_status: 'radar',
        note: contexto.label,
        created_by: 'ROBO_24H',
      },
    ]);
  }

  return { inserted, skipped, errors, pendenteCnpj, insertedIds };
}

async function aplicarEnriquecimento(
  sb: SupabaseClient,
  prospectId: string,
  base: {
    company_name: string;
    trade_name?: string | null;
    cnpj?: string | null;
    email?: string | null;
    emails?: string[] | null;
    phone?: string | null;
    website?: string | null;
    instagram?: string | null;
    city?: string | null;
    state_uf?: string | null;
  },
): Promise<void> {
  logRobo(`Enriquecendo ${base.company_name.slice(0, 40)}…`);
  const enr = await enriquecerProspecto(base);
  const patch: Record<string, unknown> = {
    enrichment_status: enr.enrichment_status,
    last_enrichment_at: new Date().toISOString(),
    updated_by: 'ROBO_24H',
    updated_at: new Date().toISOString(),
  };
  if (enr.company_name) patch.company_name = enr.company_name.toUpperCase();
  if (enr.trade_name) patch.trade_name = String(enr.trade_name).toUpperCase();
  if (enr.cnpj) {
    patch.cnpj = enr.cnpj;
    if (enr.cnpjVerified) patch.cnpj_verified_at = new Date().toISOString();
  }
  if (enr.email) patch.email = enr.email;
  if (enr.emails?.length) patch.emails = enr.emails;
  if (enr.phone) patch.phone = enr.phone;
  if (enr.website) patch.website = enr.website;
  if (enr.instagram) patch.instagram = enr.instagram;
  if (enr.address_street) patch.address_street = enr.address_street;
  if (enr.address_number) patch.address_number = enr.address_number;
  if (enr.address_district) patch.address_district = enr.address_district;
  if (enr.address_cep) patch.address_cep = enr.address_cep;
  if (enr.address_full) patch.address_full = enr.address_full;
  if (enr.city) patch.city = String(enr.city).toUpperCase();
  if (enr.state_uf) patch.state_uf = enr.state_uf;
  if (enr.pf_authorization_number) {
    patch.pf_authorization_number = enr.pf_authorization_number;
    patch.pf_status = enr.pf_status || 'regular';
  }
  if (enr.notesExtra?.length) {
    const { data: cur } = await sb.from('partner_prospects').select('notes').eq('id', prospectId).maybeSingle();
    patch.notes = [cur?.notes, ...enr.notesExtra].filter(Boolean).join(' | ');
  }
  await sb.from('partner_prospects').update(patch).eq('id', prospectId);
  logRobo(
    `Enrich ${base.company_name.slice(0, 30)} → ${enr.enrichment_status}` +
      (enr.cnpj ? ` CNPJ ${enr.cnpj}` : '') +
      (enr.emails.length ? ` · ${enr.emails.length} e-mail(s)` : ''),
  );
}

async function reenriquecerIncompletos(sb: SupabaseClient, limite: number): Promise<number> {
  const { data } = await sb
    .from('partner_prospects')
    .select(
      'id, company_name, trade_name, cnpj, email, emails, phone, website, instagram, city, state_uf, enrichment_status',
    )
    .eq('status', 'radar')
    .or('cnpj.is.null,email.is.null,enrichment_status.eq.pending,enrichment_status.eq.partial,enrichment_status.eq.failed')
    .order('last_enrichment_at', { ascending: true, nullsFirst: true })
    .limit(limite);
  let n = 0;
  for (const row of data || []) {
    if (pareceLixoProspecto(row)) {
      await sb
        .from('partner_prospects')
        .update({
          status: 'descartado',
          notes: 'Descartado auto: anti-lixo (re-enrich)',
          updated_by: 'ROBO_24H',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      continue;
    }
    await aplicarEnriquecimento(sb, row.id, row);
    n++;
  }
  return n;
}

async function filtrarCandidatosComIa(
  empresas: Array<{
    company_name: string;
    trade_name?: string | null;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    city?: string | null;
    state_uf?: string | null;
    notes?: string | null;
  }>,
): Promise<typeof empresas> {
  const out: typeof empresas = [];
  for (const emp of empresas) {
    if (pareceLixoProspecto(emp)) {
      logRobo(`Lixo descartado: ${emp.company_name.slice(0, 50)}`);
      continue;
    }
    if (!isGeminiConfigured()) {
      if (pareceEmpresaSeguranca(emp.company_name, emp.notes)) out.push(emp);
      continue;
    }
    const cls = await classificarEmpresaComGemini({
      company_name: emp.company_name,
      website: emp.website,
      snippet: emp.notes,
      city: emp.city,
      uf: emp.state_uf,
    });
    if (cls.ok) out.push(emp);
    else logRobo(`IA rejeitou: ${emp.company_name.slice(0, 40)} (${cls.motivo || ''})`);
  }
  return out;
}

export async function runPartnerRadarContinuousTick(
  sb: SupabaseClient,
  opts?: { force?: boolean },
): Promise<PartnerRadarRobotResult> {
  const started = Date.now();
  const empty = (patch: Partial<PartnerRadarRobotResult>): PartnerRadarRobotResult => ({
    ok: true,
    enabled: true,
    runStatus: 'paused',
    mode: 'idle',
    ufs: [],
    activity: null,
    inserted: 0,
    skipped: 0,
    queries: [],
    errors: [],
    durationMs: Date.now() - started,
    ...patch,
  });

  try {
    const { data: state, error: stateErr } = await sb
      .from('partner_radar_robot_state')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (stateErr) {
      return empty({ ok: false, errors: [stateErr.message] });
    }

    const runStatus = String(state?.run_status || 'paused');
    if (state?.enabled === false || runStatus !== 'running') {
      return empty({
        enabled: state?.enabled !== false,
        runStatus: runStatus === 'running' ? 'paused' : runStatus,
        mode: 'idle',
        activity: state?.current_activity || 'Robô Pausado',
      });
    }

    if (!opts?.force && state?.last_run_at) {
      const elapsed = Date.now() - new Date(state.last_run_at).getTime();
      if (elapsed >= 0 && elapsed < MIN_INTERVAL_MS) {
        return empty({
          runStatus: 'running',
          mode: 'skipped',
          activity: state.current_activity || null,
          ufs: state.last_ufs || [],
        });
      }
    }

    if (!opts?.force && state?.tick_locked_at) {
      const lockAge = Date.now() - new Date(state.tick_locked_at).getTime();
      if (lockAge >= 0 && lockAge < 90_000) {
        return empty({
          runStatus: 'running',
          mode: 'skipped',
          activity: state.current_activity || 'Micro-lote em andamento…',
        });
      }
    }

    const lastIdx = Number(state?.last_uf_index || 0);
    const { alvo, nextIndex, wrapped } = proximoMicroAlvo(lastIdx);
    const label = rotuloMicroAlvo(alvo);
    logRobo(`Buscando em ${label}…`);

    await atualizarEstado(sb, {
      run_status: 'running',
      current_activity: `Buscando agora: ${label}…`,
      last_city: label,
      tick_locked_at: new Date().toISOString(),
      last_error: null,
    });

    const queries = montarQueriesMultimotor(alvo.cidade, alvo.uf, alvo.estado);
    let hitsCount = 0;
    let extracted = 0;
    const errors: string[] = [];
    let empresas: Array<{
      company_name: string;
      trade_name?: string | null;
      cnpj?: string | null;
      email?: string | null;
      phone?: string | null;
      website?: string | null;
      city?: string | null;
      state_uf?: string | null;
      notes?: string | null;
    }> = [];

    try {
      const { hits, enginesOk, enginesFail } = await buscarMultimotor(queries, { maxQueries: 3 });
      hitsCount = hits.length;
      logRobo(
        `${label}: ${hitsCount} sites/resultados · motores ok=[${enginesOk.join(',')}] fail=[${enginesFail.join(',')}]`,
      );
      await atualizarEstado(sb, {
        current_activity: `Buscando agora: ${label}… ${hitsCount} resultados nos motores`,
      });

      const gemini = await extrairEmpresasComGeminiDosHits(hits, {
        cidade: alvo.cidade,
        uf: alvo.uf,
        estado: alvo.estado,
      });
      if (gemini.error) {
        errors.push(gemini.error);
        logRobo(`${label}: Gemini — ${gemini.error}`);
      }
      empresas = gemini.empresas;
      if (!empresas.length) {
        empresas = empresasHeuristicasDosHits(hits, { cidade: alvo.cidade, uf: alvo.uf });
        logRobo(`${label}: heurística gerou ${empresas.length} candidato(s)`);
      } else {
        logRobo(`${label}: Gemini extraiu ${empresas.length} empresa(s)`);
      }
      if (!isGeminiConfigured()) {
        errors.push('gemini_nao_configurado');
      } else {
        empresas = await filtrarCandidatosComIa(empresas);
        logRobo(`${label}: após filtro IA restaram ${empresas.length}`);
      }
      extracted = empresas.length;
    } catch (e: any) {
      const msg = e?.message || 'falha_busca';
      errors.push(`${label}:${msg}`);
      logRobo(`${label}: ERRO ${msg}`);
      await sleep(ERROR_BACKOFF_MS);
    }

    const [provRes, prospRes] = await Promise.all([
      sb.from('providers').select('id, cnpj, name'),
      sb.from('partner_prospects').select('id, cnpj, company_name, state_uf'),
    ]);
    const existentes = {
      providers: (provRes.data || []).map((p: any) => ({
        id: String(p.id),
        cnpj: String(p.cnpj || ''),
        name: p.name as string | undefined,
      })),
      prospects: (prospRes.data || []).map((p: any) => ({
        id: String(p.id),
        cnpj: p.cnpj ? String(p.cnpj) : null,
        company_name: p.company_name,
        state_uf: p.state_uf,
      })),
    };

    const result = await gravarEmpresas(
      sb,
      empresas,
      { uf: alvo.uf, label },
      existentes,
      MAX_INSERTS_MICRO,
    );
    logRobo(
      `${label}: ${extracted} extraídas · ${result.inserted} inseridas · ${result.skipped} ignoradas` +
        (result.pendenteCnpj ? ` · ${result.pendenteCnpj} Pendente de CNPJ` : ''),
    );

    // Deep search nos novos + re-varredura de incompletos.
    let enrichBudget = MAX_ENRICH_POR_TICK;
    for (const id of result.insertedIds.slice(0, enrichBudget)) {
      const { data: row } = await sb
        .from('partner_prospects')
        .select(
          'id, company_name, trade_name, cnpj, email, emails, phone, website, instagram, city, state_uf',
        )
        .eq('id', id)
        .maybeSingle();
      if (row) {
        try {
          await aplicarEnriquecimento(sb, id, row);
          enrichBudget--;
        } catch (e: any) {
          errors.push(`enrich:${e?.message || 'falha'}`);
        }
      }
    }
    if (enrichBudget > 0) {
      try {
        const n = await reenriquecerIncompletos(sb, enrichBudget);
        if (n) logRobo(`Re-enrich: ${n} prospecto(s) incompleto(s)`);
      } catch (e: any) {
        errors.push(`reenrich:${e?.message || 'falha'}`);
      }
    }

    const dia = hojeBR();
    const foundTodayPrev =
      state?.found_today_date === dia ? Number(state?.found_today || 0) : 0;
    const foundToday = foundTodayPrev + result.inserted;
    const cycleCount = Number(state?.cycle_count || 0) + (wrapped ? 1 : 0);
    const activity =
      `Último: ${label} · ${hitsCount} resultados · ${result.inserted} novas` +
      (result.pendenteCnpj ? ` (${result.pendenteCnpj} sem CNPJ)` : '') +
      ` · total hoje ${foundToday}`;

    await atualizarEstado(sb, {
      run_status: 'running',
      last_uf_index: nextIndex,
      last_run_at: new Date().toISOString(),
      last_ufs: [alvo.uf],
      last_city: label,
      last_inserted: result.inserted,
      last_skipped: result.skipped,
      last_error: [...errors, ...result.errors].slice(0, 3).join(' | ') || null,
      last_queries: queries.slice(0, 12),
      current_activity: activity,
      found_today: foundToday,
      found_today_date: dia,
      cycle_count: cycleCount,
      tick_locked_at: null,
    });

    return {
      ok: true,
      enabled: true,
      runStatus: 'running',
      mode: 'micro',
      ufs: [alvo.uf],
      activity,
      inserted: result.inserted,
      skipped: result.skipped,
      queries,
      errors: [...errors, ...result.errors],
      durationMs: Date.now() - started,
    };
  } catch (e: any) {
    const msg = e?.message || 'falha_global';
    logRobo('ERRO global:', msg);
    try {
      await atualizarEstado(sb, {
        last_error: msg,
        current_activity: `Erro — recuperando: ${msg.slice(0, 120)}`,
        tick_locked_at: null,
        last_run_at: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }
    return empty({
      ok: false,
      runStatus: 'running',
      mode: 'micro',
      errors: [msg],
      activity: `Erro: ${msg}`,
    });
  }
}

/** Lote noturno legado — se esteira contínua ligada, faz micro-lote. */
export async function runPartnerRadarRobotTick(
  sb: SupabaseClient,
): Promise<PartnerRadarRobotResult> {
  const { data: state } = await sb
    .from('partner_radar_robot_state')
    .select('run_status, enabled, last_uf_index')
    .eq('id', 1)
    .maybeSingle();
  if (state?.enabled !== false && state?.run_status === 'running') {
    return runPartnerRadarContinuousTick(sb);
  }

  const started = Date.now();
  try {
    const lastIdx = Number(state?.last_uf_index || 0);
    const lote = proximosAlvos(lastIdx, Number(process.env.PARTNER_RADAR_UFS_PER_RUN || 3));
    const ufs = lote.alvos.map((a) => a.uf);
    logRobo(`Ronda noturna: ${ufs.join(', ')}`);
    let inserted = 0;
    let skipped = 0;
    const queries: string[] = [];
    const errors: string[] = [];

    const [provRes, prospRes] = await Promise.all([
      sb.from('providers').select('id, cnpj, name'),
      sb.from('partner_prospects').select('id, cnpj, company_name, state_uf'),
    ]);
    const existentes = {
      providers: (provRes.data || []).map((p: any) => ({
        id: String(p.id),
        cnpj: String(p.cnpj || ''),
        name: p.name as string | undefined,
      })),
      prospects: (prospRes.data || []).map((p: any) => ({
        id: String(p.id),
        cnpj: p.cnpj ? String(p.cnpj) : null,
        company_name: p.company_name,
        state_uf: p.state_uf,
      })),
    };

    for (const alvo of lote.alvos) {
      if (inserted >= MAX_INSERTS_LOTE) break;
      try {
        const qs = montarQueriesMultimotor(alvo.polos[0] || alvo.estado, alvo.uf, alvo.estado);
        const { hits } = await buscarMultimotor(qs, { maxQueries: 2 });
        let empresas = (await extrairEmpresasComGeminiDosHits(hits, {
          cidade: alvo.polos[0] || alvo.estado,
          uf: alvo.uf,
          estado: alvo.estado,
        })).empresas;
        if (!empresas.length) {
          empresas = empresasHeuristicasDosHits(hits, {
            cidade: alvo.polos[0] || alvo.estado,
            uf: alvo.uf,
          });
        }
        // Fallback Gemini grounding antigo se ainda vazio.
        if (!empresas.length) {
          try {
            const d = await descobrirEmpresasPorAlvo(alvo);
            empresas = d.empresas;
            queries.push(...d.queries);
          } catch {
            /* ignore */
          }
        }
        queries.push(...qs);
        const r = await gravarEmpresas(
          sb,
          empresas,
          { uf: alvo.uf, label: alvo.uf },
          existentes,
          MAX_INSERTS_LOTE - inserted,
        );
        inserted += r.inserted;
        skipped += r.skipped;
        errors.push(...r.errors);
      } catch (e: any) {
        errors.push(`${alvo.uf}:${e?.message || 'falha'}`);
      }
      await sleep(PAUSA_MS);
    }

    await atualizarEstado(sb, {
      last_uf_index: lote.nextIndex,
      last_run_at: new Date().toISOString(),
      last_ufs: ufs,
      last_inserted: inserted,
      last_skipped: skipped,
      last_error: errors.slice(0, 5).join(' | ') || null,
      last_queries: queries.slice(0, 20),
      current_activity: `Ronda noturna: ${ufs.join(', ')} (${inserted} novas)`,
    });

    return {
      ok: true,
      enabled: true,
      runStatus: 'paused',
      mode: 'lote_noturno',
      ufs,
      activity: null,
      inserted,
      skipped,
      queries,
      errors,
      durationMs: Date.now() - started,
    };
  } catch (e: any) {
    return {
      ok: false,
      enabled: true,
      runStatus: 'paused',
      mode: 'lote_noturno',
      ufs: [],
      activity: null,
      inserted: 0,
      skipped: 0,
      queries: [],
      errors: [e?.message || 'falha_global'],
      durationMs: Date.now() - started,
    };
  }
}

export async function setPartnerRadarRunStatus(
  sb: SupabaseClient,
  status: 'running' | 'paused',
  byUser?: string,
): Promise<{ ok: boolean; run_status: string }> {
  const activity =
    status === 'running'
      ? 'Robô Rodando 24h — iniciando próximo micro-lote…'
      : 'Robô Pausado';
  const patch: Record<string, unknown> = {
    run_status: status,
    enabled: true,
    current_activity: activity,
    tick_locked_at: null,
  };
  if (status === 'paused') patch.last_error = null;
  await atualizarEstado(sb, patch);
  logRobo(status === 'running' ? 'LIGADO' : 'PAUSADO', byUser || '');
  if (status === 'running') {
    void runPartnerRadarContinuousTick(sb, { force: true }).catch((e) =>
      logRobo('tick após play:', e?.message || e),
    );
  }
  return { ok: true, run_status: status };
}

let continuousTimer: ReturnType<typeof setInterval> | null = null;

export function startPartnerRadarContinuousLoop(): void {
  if (continuousTimer) return;
  continuousTimer = setInterval(() => {
    void (async () => {
      try {
        const sb = createSupabaseAdminClient();
        if (!sb) return;
        await runPartnerRadarContinuousTick(sb);
      } catch (e: any) {
        logRobo('loop contínuo:', e?.message || e);
      }
    })();
  }, Math.max(MIN_INTERVAL_MS, 50_000));
  logRobo('Esteira contínua: timer local ~55s (play/pause via run_status).');
}

export type { MicroTarget };
