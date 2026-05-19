// DHL Supplier Intake — fluxo automatizado para coletar dados de Escoltistas + Veículo
// junto ao fornecedor quando a OS é da DHL SUPPLY CHAIN (BRAZIL) LTDA.
//
// Endpoints expostos:
//   POST /api/dhl/intake/generate           (auth) — cria intake + envia e-mail/WhatsApp
//   GET  /api/dhl/intake/public/:token      (público) — dados da OS + memória do fornecedor
//   POST /api/dhl/intake/public/:token/submit (público) — recebe submissão e notifica operacional@
//
// Memória por fornecedor: tabelas provider_escoltistas e provider_intake_vehicles.
// Instruções de espelhamento (Omnilink, Sascar, Onixsat, Sighra, Autotrac) são
// injetadas no e-mail e na mensagem de WhatsApp de acordo com a tecnologia do veículo.

import type { Express, Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import {
  sendDhlSupplierIntakeEmail,
  sendDhlIntakeSubmittedEmail,
  sendDhlIntakeExpiredEmail,
  sendDhlIntakeReminderProviderEmail,
  sendDhlIntakeReminderOperacionalEmail,
} from './emailService';

const DHL_CLIENT_NAME = 'DHL SUPPLY CHAIN (BRAZIL) LTDA';
const OPERACIONAL_EMAIL = 'operacional@grupotmseg.com.br';

function getSb(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

/** Marca como 'cancelado' todos os intakes pendentes/preenchidos de uma missão.
 *  Usado quando a OS é excluída ou cancelada — invalida o link público para o fornecedor. */
export async function cancelDhlIntakesForMission(missionId: string): Promise<number> {
  if (!missionId) return 0;
  const sb = getSb();
  try {
    const { data, error } = await sb.from('dhl_supplier_intakes')
      .update({ status: 'cancelado' })
      .eq('mission_id', missionId)
      .in('status', ['pendente', 'preenchido'])
      .select('id');
    if (error) {
      console.error('[DHL Intake] cancelDhlIntakesForMission error:', error.message);
      return 0;
    }
    return Array.isArray(data) ? data.length : 0;
  } catch (e: any) {
    console.error('[DHL Intake] cancelDhlIntakesForMission exception:', e?.message);
    return 0;
  }
}

export function isDhlMission(clientName: string | null | undefined): boolean {
  if (!clientName) return false;
  const n = String(clientName).toUpperCase();
  return n.includes('DHL SUPPLY CHAIN') || n.includes('DHL LOGISTICS');
}

/** Cria as tabelas necessárias no Supabase (idempotente). */
export async function runDhlIntakeMigrations(): Promise<void> {
  const sb = getSb();
  try {
    await sb.rpc('exec_sql', { sql: `
      CREATE TABLE IF NOT EXISTS provider_escoltistas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID NOT NULL,
        nome TEXT NOT NULL,
        cpf TEXT NOT NULL,
        rg TEXT,
        orgao_emissor TEXT,
        cnh TEXT,
        cnh_categoria TEXT,
        cnh_vencimento DATE,
        cnv_numero TEXT,
        cnv_validade DATE,
        rua TEXT,
        numero TEXT,
        complemento TEXT,
        bairro TEXT,
        cidade TEXT,
        uf TEXT,
        cep TEXT,
        celular TEXT,
        admissao DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_provider_escoltistas_provider ON provider_escoltistas(provider_id);
      CREATE INDEX IF NOT EXISTS idx_provider_escoltistas_cpf ON provider_escoltistas(cpf);

      CREATE TABLE IF NOT EXISTS provider_intake_vehicles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID NOT NULL,
        placa TEXT NOT NULL,
        renavam TEXT,
        marca TEXT,
        ano TEXT,
        modelo TEXT,
        cor TEXT,
        tecnologia TEXT,
        id_rastreador TEXT,
        comunicacao TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_provider_intake_vehicles_provider ON provider_intake_vehicles(provider_id);
      CREATE INDEX IF NOT EXISTS idx_provider_intake_vehicles_placa ON provider_intake_vehicles(placa);

      CREATE TABLE IF NOT EXISTS dhl_supplier_intakes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token TEXT NOT NULL UNIQUE,
        mission_id TEXT NOT NULL,
        provider_id UUID,
        provider_name TEXT,
        status TEXT NOT NULL DEFAULT 'pendente',
        agent1_id UUID,
        agent2_id UUID,
        vehicle_id UUID,
        agent1_snapshot JSONB,
        agent2_snapshot JSONB,
        vehicle_snapshot JSONB,
        sent_to_email TEXT,
        sent_to_phone TEXT,
        submitted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
      );
      CREATE INDEX IF NOT EXISTS idx_dhl_intakes_mission ON dhl_supplier_intakes(mission_id);
      CREATE INDEX IF NOT EXISTS idx_dhl_intakes_token ON dhl_supplier_intakes(token);

      ALTER TABLE missions ADD COLUMN IF NOT EXISTS dhl_se_number TEXT;
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS dhl_channel_preference TEXT;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS mirror_proof_url TEXT;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS mirror_proof_filename TEXT;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS provider_reminder_sent_at TIMESTAMPTZ;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS operational_alert_sent_at TIMESTAMPTZ;

      -- Histórico de reenvios do link DHL (auditoria: quem reenviou, quando, para onde, status)
      CREATE TABLE IF NOT EXISTS dhl_supplier_intake_resends (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        intake_id UUID NOT NULL,
        mission_id TEXT NOT NULL,
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        sent_by_user_id UUID,
        sent_by_user_name TEXT,
        target_email TEXT,
        target_phone TEXT,
        email_status TEXT,
        email_error TEXT,
        reused_existing_token BOOLEAN DEFAULT FALSE
      );
      CREATE INDEX IF NOT EXISTS idx_dhl_intake_resends_intake ON dhl_supplier_intake_resends(intake_id);
      CREATE INDEX IF NOT EXISTS idx_dhl_intake_resends_mission ON dhl_supplier_intake_resends(mission_id);
      ALTER TABLE dhl_supplier_intake_resends ADD COLUMN IF NOT EXISTS whatsapp_status TEXT;
      ALTER TABLE dhl_supplier_intake_resends ADD COLUMN IF NOT EXISTS whatsapp_error TEXT;

      -- Força o PostgREST a recarregar o cache de schema após ALTER TABLE
      NOTIFY pgrst, 'reload schema';

      -- Trigger: invalida automaticamente os links DHL ao excluir ou cancelar a OS.
      -- Fonte única da verdade (independente do cliente — frontend, API, automações).
      CREATE OR REPLACE FUNCTION cancel_dhl_intakes_on_mission_change() RETURNS TRIGGER AS $func$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          UPDATE dhl_supplier_intakes
            SET status = 'cancelado'
            WHERE mission_id = OLD.id
              AND status IN ('pendente', 'preenchido');
          RETURN OLD;
        ELSIF TG_OP = 'UPDATE' THEN
          IF NEW.status IN ('Cancelada', 'Recusada')
             AND (OLD.status IS DISTINCT FROM NEW.status) THEN
            UPDATE dhl_supplier_intakes
              SET status = 'cancelado'
              WHERE mission_id = NEW.id
                AND status IN ('pendente', 'preenchido');
          END IF;
          RETURN NEW;
        END IF;
        RETURN NULL;
      END;
      $func$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_cancel_dhl_intakes_on_mission_delete ON missions;
      CREATE TRIGGER trg_cancel_dhl_intakes_on_mission_delete
        AFTER DELETE ON missions
        FOR EACH ROW EXECUTE FUNCTION cancel_dhl_intakes_on_mission_change();

      DROP TRIGGER IF EXISTS trg_cancel_dhl_intakes_on_mission_update ON missions;
      CREATE TRIGGER trg_cancel_dhl_intakes_on_mission_update
        AFTER UPDATE OF status ON missions
        FOR EACH ROW EXECUTE FUNCTION cancel_dhl_intakes_on_mission_change();

      NOTIFY pgrst, 'reload schema';
    ` });
    console.log('[Migration] DHL Supplier Intake — tabelas verificadas/criadas.');
  } catch (e: any) {
    console.log('[Migration] DHL Supplier Intake erro:', e.message || 'ok');
  }
}

function getAppUrl(req: Request): string {
  // Prioridade: APP_PUBLIC_URL (estável p/ links externos) → REPLIT_DOMAINS → headers.
  // Evita links efêmeros do ambiente dev quando há um domínio publicado.
  const fromEnv = (process.env.APP_PUBLIC_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const replitDomain = (process.env.REPLIT_DOMAINS || '').split(',')[0].trim();
  if (replitDomain) return `https://${replitDomain}`;
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

function buildWhatsappText(opts: {
  providerName: string;
  osNumber: string;
  origin: string;
  destination: string;
  scheduledAt: string;
  link: string;
  tecnologiasNoVeiculo?: string[];
}): string {
  const tecs = (opts.tecnologiasNoVeiculo || []).filter(Boolean);
  const tecBlock = tecs.length > 0
    ? `\n\n*Instruções de Espelhamento — Tecnologia(s): ${tecs.join(', ')}*\n${tecs.map(t => instrucaoEspelhamentoTexto(t)).join('\n\n')}`
    : `\n\n*Instruções de Espelhamento* serão verificadas conforme a tecnologia informada do veículo.`;

  return `*Grupo TM SEG — Solicitação de Escolta*

Olá, ${opts.providerName}!

Foi gerada uma nova OS pelo Grupo TM SEG. Pedimos que preencha os dados do *Escoltista 1, Escoltista 2 e Veículo* pelo link abaixo:

🔗 ${opts.link}

*Dados da OS:*
• OS: ${opts.osNumber}
• Origem: ${opts.origin}
• Destino: ${opts.destination}
• Início: ${opts.scheduledAt}
${tecBlock}

Após o preenchimento, nossa equipe operacional será notificada automaticamente.

Em caso de dúvida, responda a este WhatsApp.

_Grupo TM SEG — Intermediação de Escolta Armada_`;
}

function instrucaoEspelhamentoTexto(tec: string): string {
  const t = (tec || '').toUpperCase();
  if (t.includes('OMNILINK')) {
    return `• *OMNILINK*: espelhar para DHL SUPPLY CHAIN — CNPJ 00.233.065/0001-87 — IP 131.255.103.146 — Porta 9001. *Obrigatório* anexar a ficha de ativação.`;
  }
  if (t.includes('SASCAR')) {
    return `• *SASCAR*: Portal Sascar > Serviços > Direcionamento de Sinal. No campo "Gerenciadora", inserir conta: *DHL LOGISTICS (BRASIL) LTDA (FILIAL) – RASTREAMENTO*.`;
  }
  if (t.includes('ONIXSAT') || t.includes('JABURSAT')) {
    return `• *ONIXSAT/JABURSAT*: espelhar para *Central Unidocks/DHL CNPJ 00.233.065/0001-87*. Acessar Onixsat > Menu ADM > Espelhamento > Espelhamento de Equipamento — ou ligar (43) 3371-3700.`;
  }
  if (t.includes('SIGHRA')) {
    return `• *SIGHRA*: se possuir o software, usar "Filas do Veículo". Se não tiver, enviar e-mail para suporte@sighra.com.br com placa + ID do veículo + conta *DHL LOGISTICS (BRASIL)*.`;
  }
  if (t.includes('AUTOTRAC')) {
    return `• *AUTOTRAC*: Supervisor Web > clicar com botão direito no veículo > Roteamento > Inserir roteamento express. Companhia: *DHL* (validar companhia). Perfil: *(Perfil Normal) Retorno Completo (sem cópia)*.`;
  }
  return `• *${tec || 'TECNOLOGIA'}*: verificar instrução específica com o Operacional TM Seg.`;
}

function maskPhone(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

// ────────────────────────────────────────────────────────────────────────────
// WORKER PERIÓDICO — marca intakes pendentes vencidos como 'expirado' e
// notifica o operacional (in-app via system_logs + e-mail consolidado).
//
// Roda a cada 15 min. Para evitar avisos repetidos, só notifica os registros
// recém-marcados nesta execução (transição pendente → expirado).
// ────────────────────────────────────────────────────────────────────────────
const DHL_EXPIRY_CHECK_INTERVAL_MS = 15 * 60 * 1000;
let _dhlExpiryWorkerTimer: NodeJS.Timeout | null = null;

async function checkAndNotifyExpiredDhlIntakes(): Promise<void> {
  const sb = getSb();
  const nowIso = new Date().toISOString();

  // Busca intakes pendentes cujo expires_at já passou.
  const { data: vencidos, error: selErr } = await sb.from('dhl_supplier_intakes')
    .select('id, mission_id, provider_name, sent_to_email, sent_to_phone, created_at, expires_at')
    .eq('status', 'pendente')
    .lt('expires_at', nowIso);

  if (selErr) {
    console.error('[DHL Expiry Worker] erro ao listar intakes vencidos:', selErr.message);
    return;
  }
  const lista = Array.isArray(vencidos) ? vencidos : [];
  if (lista.length === 0) return;

  console.log(`[DHL Expiry Worker] ${lista.length} intake(s) pendente(s) vencido(s) detectado(s).`);

  // Marca todos como 'expirado' em um único update (transição atômica).
  const ids = lista.map(i => i.id);
  const { data: updated, error: updErr } = await sb.from('dhl_supplier_intakes')
    .update({ status: 'expirado' })
    .in('id', ids)
    .eq('status', 'pendente') // proteção contra corrida
    .select('id, mission_id, provider_name, sent_to_email, sent_to_phone, created_at, expires_at');

  if (updErr) {
    console.error('[DHL Expiry Worker] erro ao marcar como expirado:', updErr.message);
    return;
  }
  const transitados = Array.isArray(updated) ? updated : [];
  if (transitados.length === 0) return;

  // Hidrata dados da OS para a notificação.
  const missionIds = Array.from(new Set(transitados.map(t => t.mission_id).filter(Boolean)));
  const { data: missions, error: misErr } = await sb.from('missions')
    .select('id, dhl_se_number, origin, destination, start_time')
    .in('id', missionIds);
  if (misErr) {
    console.error('[DHL Expiry Worker] erro ao hidratar dados das OS (notificação seguirá com campos vazios):', misErr.message);
  }
  const missionMap = new Map<string, any>((missions || []).map((m: any) => [m.id, m]));

  const fmtBr = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); } catch { return '—'; }
  };

  const expiredPayload = transitados.map((it: any) => {
    const m = missionMap.get(it.mission_id) || {};
    return {
      osNumber: it.mission_id,
      seNumber: m.dhl_se_number || '—',
      providerName: it.provider_name || '—',
      sentAt: fmtBr(it.created_at),
      sentTo: it.sent_to_email || it.sent_to_phone || '—',
      expiredAt: fmtBr(it.expires_at),
      origin: m.origin || '—',
      destination: m.destination || '—',
      scheduledAt: fmtBr(m.start_time),
    };
  });

  // Notificação in-app (toast em tempo real via canal global-system-broadcast
  // que escuta INSERT em system_logs). Um log por intake para que apareça por OS.
  try {
    const rows = transitados.map((it: any) => ({
      user_name: 'Sistema',
      action_type: 'UPDATE',
      entity: 'Mission',
      entity_id: it.mission_id,
      details: `Link DHL do fornecedor ${it.provider_name || '—'} EXPIROU sem preenchimento (enviado em ${fmtBr(it.created_at)} para ${it.sent_to_email || it.sent_to_phone || '—'}). Gere um novo link no painel da OS.`,
    }));
    const { error: logErr } = await sb.from('system_logs').insert(rows);
    if (logErr) console.error('[DHL Expiry Worker] erro ao inserir system_logs:', logErr.message);
  } catch (e: any) {
    console.error('[DHL Expiry Worker] exceção ao inserir system_logs:', e?.message);
  }

  // E-mail consolidado para o operacional.
  try {
    await sendDhlIntakeExpiredEmail({ to: OPERACIONAL_EMAIL, expired: expiredPayload });
  } catch (e: any) {
    console.error('[DHL Expiry Worker] erro ao enviar e-mail ao operacional:', e?.message);
  }

  console.log(`[DHL Expiry Worker] ${transitados.length} intake(s) marcado(s) como expirado e operacional notificado.`);
}

// ────────────────────────────────────────────────────────────────────────────
// WORKER PERIÓDICO — envia LEMBRETE ao fornecedor e ALERTA ao operacional
// quando:
//   (a) o link DHL está próximo de expirar (≤ DHL_REMINDER_EXPIRY_HOURS) e
//       ainda não foi preenchido; OU
//   (b) o fornecedor abriu o link (first_opened_at preenchido) há
//       ≥ DHL_REMINDER_OPENED_HOURS e não concluiu (abandono).
//
// Para evitar duplicidade, grava reminder_sent_at — porém somente APÓS
// envio bem-sucedido (permite retry no próximo tick em caso de falha).
// ────────────────────────────────────────────────────────────────────────────
// Thresholds parametrizáveis por env (fallback para defaults razoáveis).
const DHL_REMINDER_OPENED_THRESHOLD_HOURS =
  Number(process.env.DHL_REMINDER_OPENED_HOURS || 4);   // abriu mas não concluiu há ≥ N h
const DHL_REMINDER_EXPIRY_WINDOW_HOURS =
  Number(process.env.DHL_REMINDER_EXPIRY_HOURS || 24);  // ou o link expira em ≤ N h

async function checkAndSendDhlIntakeReminders(): Promise<void> {
  const sb = getSb();
  const now = new Date();
  const nowIso = now.toISOString();

  // Busca intakes pendentes ainda não expirados em que pelo menos um dos
  // canais (lembrete ao fornecedor OU alerta ao operacional) ainda não foi
  // enviado. Cada canal é controlado por sua própria flag, permitindo retry
  // independente em caso de falha de um deles.
  const { data: pendentes, error: selErr } = await sb.from('dhl_supplier_intakes')
    .select('id, token, mission_id, provider_id, provider_name, sent_to_email, sent_to_phone, first_opened_at, created_at, expires_at, provider_reminder_sent_at, operational_alert_sent_at')
    .eq('status', 'pendente')
    .or('provider_reminder_sent_at.is.null,operational_alert_sent_at.is.null')
    .gt('expires_at', nowIso);

  if (selErr) {
    console.error('[DHL Reminder Worker] erro ao listar pendentes:', selErr.message);
    return;
  }
  const lista = Array.isArray(pendentes) ? pendentes : [];
  if (lista.length === 0) return;

  // Hidrata dados das OS (para checar start_time e detalhes do envio).
  const missionIds = Array.from(new Set(lista.map(i => i.mission_id).filter(Boolean)));
  const { data: missions } = await sb.from('missions')
    .select('id, dhl_se_number, origin, destination, start_time')
    .in('id', missionIds);
  const missionMap = new Map<string, any>((missions || []).map((m: any) => [m.id, m]));

  // Busca e-mails dos fornecedores que não foram registrados no intake (fallback).
  const providerIds = Array.from(new Set(lista.map(i => i.provider_id).filter(Boolean)));
  let providerMap = new Map<string, any>();
  if (providerIds.length > 0) {
    const { data: provs } = await sb.from('providers')
      .select('id, name, trading_name, email, os_email, phone')
      .in('id', providerIds);
    providerMap = new Map<string, any>((provs || []).map((p: any) => [p.id, p]));
  }

  const fmtBr = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); } catch { return '—'; }
  };

  const elegiveis: Array<{ intake: any; mission: any; provider: any; reason: 'opened_abandoned' | 'expiry_approaching' }> = [];
  for (const it of lista) {
    const m = missionMap.get(it.mission_id) || {};
    const firstOpened = it.first_opened_at ? new Date(it.first_opened_at).getTime() : null;
    const expiresAt = it.expires_at ? new Date(it.expires_at).getTime() : null;
    const hoursSinceOpened = firstOpened ? (now.getTime() - firstOpened) / 36e5 : null;
    const hoursToExpire = expiresAt ? (expiresAt - now.getTime()) / 36e5 : null;

    let reason: 'opened_abandoned' | 'expiry_approaching' | null = null;
    if (hoursToExpire !== null && hoursToExpire > 0 && hoursToExpire <= DHL_REMINDER_EXPIRY_WINDOW_HOURS) {
      // Prioriza o alerta de proximidade de expiração (requisito principal).
      reason = 'expiry_approaching';
    } else if (hoursSinceOpened !== null && hoursSinceOpened >= DHL_REMINDER_OPENED_THRESHOLD_HOURS) {
      reason = 'opened_abandoned';
    }
    if (!reason) continue;

    elegiveis.push({ intake: it, mission: m, provider: providerMap.get(it.provider_id) || {}, reason });
  }

  if (elegiveis.length === 0) return;
  console.log(`[DHL Reminder Worker] ${elegiveis.length} intake(s) elegível(eis) para lembrete.`);

  const baseUrl = (process.env.APP_PUBLIC_URL || '').replace(/\/$/, '')
    || (process.env.REPLIT_DOMAINS ? `https://${(process.env.REPLIT_DOMAINS || '').split(',')[0].trim()}` : '');

  // Por canal: lista de intakes que ainda precisam do envio.
  type Eleg = typeof elegiveis[number];
  const precisaFornecedor: Eleg[] = elegiveis.filter(el => !el.intake.provider_reminder_sent_at);
  const precisaOperacional: Eleg[] = elegiveis.filter(el => !el.intake.operational_alert_sent_at);

  // ── Canal 1: e-mail ao fornecedor (por intake) ────────────────────────
  let marcadosFornecedor = 0;
  for (const el of precisaFornecedor) {
    const { intake, mission, provider, reason } = el;
    const providerEmail = (intake.sent_to_email || (provider.os_email || provider.email || '')).trim();
    const providerName = intake.provider_name || provider.trading_name || provider.name || '—';
    const link = baseUrl ? `${baseUrl}/fornecedor/dhl?token=${intake.token}` : '';

    if (!providerEmail || !link) {
      // Sem destino válido para o fornecedor — não trava o fluxo, mas também
      // NÃO marca como enviado (assim, se o cadastro for corrigido depois,
      // o tick seguinte tentará novamente).
      continue;
    }

    try {
      await sendDhlIntakeReminderProviderEmail({
        to: providerEmail,
        providerName,
        osNumber: intake.mission_id,
        seNumber: mission.dhl_se_number || '—',
        origin: mission.origin || '—',
        destination: mission.destination || '—',
        scheduledAt: fmtBr(mission.start_time),
        expiresAt: fmtBr(intake.expires_at),
        link,
        firstOpenedAt: intake.first_opened_at ? fmtBr(intake.first_opened_at) : null,
        reason,
      });
    } catch (e: any) {
      console.error('[DHL Reminder Worker] erro ao enviar e-mail ao fornecedor (retry no próximo tick):', e?.message);
      continue; // não marca a flag — permite retry
    }

    const { error: markErr } = await sb.from('dhl_supplier_intakes')
      .update({ provider_reminder_sent_at: nowIso, reminder_sent_at: nowIso })
      .eq('id', intake.id)
      .is('provider_reminder_sent_at', null);
    if (markErr) {
      console.error('[DHL Reminder Worker] erro ao marcar provider_reminder_sent_at:', markErr.message);
      continue;
    }
    marcadosFornecedor++;
  }

  // ── Canal 2: e-mail consolidado ao operacional + system_log ───────────
  let marcadosOperacional = 0;
  if (precisaOperacional.length > 0) {
    const payloadForEmail = precisaOperacional.map(el => ({
      osNumber: el.intake.mission_id,
      seNumber: el.mission.dhl_se_number || '—',
      providerName: el.intake.provider_name || el.provider.trading_name || el.provider.name || '—',
      sentTo: el.intake.sent_to_email || el.intake.sent_to_phone || '—',
      sentAt: fmtBr(el.intake.created_at),
      firstOpenedAt: el.intake.first_opened_at ? fmtBr(el.intake.first_opened_at) : null,
      expiresAt: fmtBr(el.intake.expires_at),
      origin: el.mission.origin || '—',
      destination: el.mission.destination || '—',
      scheduledAt: fmtBr(el.mission.start_time),
      reason: el.reason,
    }));

    let operacionalEmailOk = false;
    try {
      await sendDhlIntakeReminderOperacionalEmail({ to: OPERACIONAL_EMAIL, pending: payloadForEmail });
      operacionalEmailOk = true;
    } catch (e: any) {
      console.error('[DHL Reminder Worker] erro ao enviar e-mail ao operacional (retry no próximo tick):', e?.message);
    }

    if (operacionalEmailOk) {
      for (const el of precisaOperacional) {
        const { intake, reason } = el;
        const { error: markErr } = await sb.from('dhl_supplier_intakes')
          .update({ operational_alert_sent_at: nowIso, reminder_sent_at: nowIso })
          .eq('id', intake.id)
          .is('operational_alert_sent_at', null);
        if (markErr) {
          console.error('[DHL Reminder Worker] erro ao marcar operational_alert_sent_at:', markErr.message);
          continue;
        }
        marcadosOperacional++;

        // Notificação in-app (toast) — uma por intake efetivamente alertado.
        try {
          const motivo = reason === 'opened_abandoned'
            ? `abriu o link em ${fmtBr(intake.first_opened_at)} mas não concluiu`
            : `o link DHL expira em até ${DHL_REMINDER_EXPIRY_WINDOW_HOURS}h e ainda não foi preenchido`;
          await sb.from('system_logs').insert([{
            user_name: 'Sistema',
            action_type: 'UPDATE',
            entity: 'Mission',
            entity_id: intake.mission_id,
            details: `Lembrete DHL: fornecedor ${intake.provider_name || '—'} ${motivo}.`,
          }]);
        } catch (e: any) {
          console.error('[DHL Reminder Worker] erro ao inserir system_logs:', e?.message);
        }
      }
    }
  }

  console.log(`[DHL Reminder Worker] fornecedor=${marcadosFornecedor}/${precisaFornecedor.length} | operacional=${marcadosOperacional}/${precisaOperacional.length}.`);
}

export function startDhlIntakeExpiryWorker(): void {
  if (_dhlExpiryWorkerTimer) return;
  // Primeira execução com um pequeno delay para não competir com o boot.
  setTimeout(() => {
    checkAndNotifyExpiredDhlIntakes().catch(e => console.error('[DHL Expiry Worker] tick inicial falhou:', e?.message));
    checkAndSendDhlIntakeReminders().catch(e => console.error('[DHL Reminder Worker] tick inicial falhou:', e?.message));
  }, 30 * 1000);
  _dhlExpiryWorkerTimer = setInterval(() => {
    checkAndNotifyExpiredDhlIntakes().catch(e => console.error('[DHL Expiry Worker] tick falhou:', e?.message));
    checkAndSendDhlIntakeReminders().catch(e => console.error('[DHL Reminder Worker] tick falhou:', e?.message));
  }, DHL_EXPIRY_CHECK_INTERVAL_MS);
  console.log(`[DHL Expiry Worker] iniciado (intervalo ${Math.round(DHL_EXPIRY_CHECK_INTERVAL_MS / 60000)} min).`);
}

type DhlPrincipal = { id: string; name: string | null; email: string | null; role: string };

export function registerDhlIntakeRoutes(
  app: Express,
  requireAuth: any,
  requireRole: any,
  resolveUserRole?: (token: string) => Promise<string | null>,
  resolvePrincipal?: (token: string) => Promise<DhlPrincipal | null>,
): void {
  const getPrincipal = async (req: Request): Promise<DhlPrincipal | null> => {
    if (!resolvePrincipal) return null;
    try {
      const token = (req as any).authToken as string | undefined;
      if (!token) return null;
      return await resolvePrincipal(token);
    } catch { return null; }
  };
  const OPERATIONAL_ROLES = new Set(['administrador', 'diretoria', 'avançado', 'avancado', 'operador']);
  const userCanSeeSnapshots = async (req: Request): Promise<boolean> => {
    if (!resolveUserRole) return false;
    try {
      const token = (req as any).authToken as string | undefined;
      if (!token) return false;
      const role = (await resolveUserRole(token)) || '';
      return OPERATIONAL_ROLES.has(role.toLowerCase());
    } catch {
      return false;
    }
  };
  // ──────────────────────────────────────────────────────────────
  // POST /api/dhl/intake/generate — operador gera link para fornecedor
  // body: { missionId: string }
  // ──────────────────────────────────────────────────────────────
  app.post('/api/dhl/intake/generate', requireAuth, async (req: Request, res: Response) => {
    try {
      const { missionId, channel: rawChannel } = req.body || {};
      if (!missionId) return res.status(400).json({ error: 'missionId é obrigatório' });

      const sb = getSb();
      const { data: mission, error: mErr } = await sb.from('missions').select('*').eq('id', missionId).single();
      if (mErr || !mission) return res.status(404).json({ error: 'Missão não encontrada' });

      if (!isDhlMission(mission.client)) {
        return res.status(400).json({ error: 'OS não é da DHL — fluxo não aplicável' });
      }
      if (!mission.dhl_se_number || String(mission.dhl_se_number).trim() === '') {
        return res.status(400).json({ error: 'Preencha o número da S.E. DHL antes de gerar o link.' });
      }
      if (!mission.provider) {
        return res.status(400).json({ error: 'Selecione um fornecedor na OS antes de gerar o link.' });
      }

      // Resolve fornecedor
      const { data: providerByName } = await sb.from('providers')
        .select('id, name, trading_name, email, os_email, phone, dhl_channel_preference')
        .or(`name.eq.${mission.provider},trading_name.eq.${mission.provider}`)
        .limit(1)
        .maybeSingle();
      const provider = providerByName;
      if (!provider) return res.status(404).json({ error: 'Fornecedor não localizado no cadastro' });

      // Se o operador não escolheu canal explicitamente, usa a preferência do fornecedor.
      const providerPref = provider.dhl_channel_preference;
      const prefValid = providerPref === 'email' || providerPref === 'whatsapp' || providerPref === 'both';
      const channel: 'email' | 'whatsapp' | 'both' =
        rawChannel === 'email' || rawChannel === 'whatsapp' || rawChannel === 'both'
          ? rawChannel
          : (prefValid ? providerPref : 'both');
      const wantsEmail = channel === 'email' || channel === 'both';
      const wantsWhatsapp = channel === 'whatsapp' || channel === 'both';

      const providerEmail = (provider.os_email || provider.email || '').trim();
      const providerPhone = maskPhone(provider.phone);

      // Reaproveita intake pendente da mesma OS+fornecedor (dedup) — evita spam e múltiplos tokens válidos
      let token = '';
      let intake: any = null;
      const { data: existingIntake } = await sb.from('dhl_supplier_intakes')
        .select('*')
        .eq('mission_id', mission.id)
        .eq('provider_id', provider.id)
        .eq('status', 'pendente')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const notExpired = existingIntake && (!existingIntake.expires_at || new Date(existingIntake.expires_at) > new Date());
      if (existingIntake && notExpired) {
        token = existingIntake.token;
        intake = existingIntake;
      } else {
        token = randomUUID().replace(/-/g, '');
        const { data: inserted, error: iErr } = await sb.from('dhl_supplier_intakes').insert([{
          token,
          mission_id: mission.id,
          provider_id: provider.id,
          provider_name: provider.trading_name || provider.name,
          status: 'pendente',
          sent_to_email: providerEmail || null,
          sent_to_phone: providerPhone || null,
        }]).select().single();
        if (iErr) {
          console.error('[DHL Intake] erro ao criar intake:', iErr);
          const code = (iErr as any)?.code || '';
          const msg = String((iErr as any)?.message || '');
          const schemaMissing =
            code === 'PGRST205' || code === '42P01' || code === '42703' ||
            /could not find the table|schema cache|does not exist/i.test(msg);
          if (schemaMissing) {
            return res.status(500).json({
              error: 'O banco ainda não tem as tabelas do fluxo DHL. Abra o Supabase Studio → SQL Editor, cole o conteúdo do arquivo scripts/dhl-migrations.sql e clique em Run. Depois tente gerar o link novamente.',
            });
          }
          return res.status(500).json({ error: 'Erro ao registrar intake: ' + (msg || 'falha desconhecida') });
        }
        intake = inserted;
      }

      const reusedExistingToken = !!(existingIntake && notExpired);
      const baseUrl = getAppUrl(req);
      const link = `${baseUrl}/fornecedor/dhl?token=${token}`;

      const scheduledAt = mission.start_time
        ? new Date(mission.start_time).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : '—';

      // E-mail
      let emailSent = false;
      let emailError: string | null = null;
      let emailSkipped = false;
      if (wantsEmail) {
        if (providerEmail) {
          try {
            await sendDhlSupplierIntakeEmail({
              to: providerEmail,
              providerName: provider.trading_name || provider.name,
              osNumber: mission.id,
              seNumber: mission.dhl_se_number,
              origin: mission.origin || '—',
              destination: mission.destination || '—',
              scheduledAt,
              link,
            });
            emailSent = true;
          } catch (e: any) {
            emailError = e?.message || 'falha no envio do e-mail';
            console.error('[DHL Intake] erro email:', emailError);
          }
        }
      } else {
        emailSkipped = true;
      }

      const whatsappText = buildWhatsappText({
        providerName: provider.trading_name || provider.name,
        osNumber: mission.id,
        origin: mission.origin || '—',
        destination: mission.destination || '—',
        scheduledAt,
        link,
      });

      // ── WhatsApp via Z-API (envio automático sem precisar copiar) ───
      let whatsappSent = false;
      let whatsappError: string | null = null;
      let whatsappSkipped = false;
      if (wantsWhatsapp) {
        const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID || process.env.VITE_ZAPI_INSTANCE_ID || '';
        const ZAPI_TOKEN = process.env.ZAPI_TOKEN || process.env.VITE_ZAPI_TOKEN || '';
        const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || process.env.VITE_ZAPI_CLIENT_TOKEN || '';
        if (!providerPhone) {
          // Sem telefone cadastrado — frontend cai no fallback (copiar / wa.me).
        } else if (!ZAPI_INSTANCE || !ZAPI_TOKEN) {
          whatsappError = 'Z-API não configurada';
        } else {
          // Brasil: garante prefixo 55 quando vier apenas DDD+número (10/11 dígitos).
          const phoneDigits = providerPhone.length <= 11 ? `55${providerPhone}` : providerPhone;
          try {
            const headers: any = { 'Content-Type': 'application/json' };
            if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
            const r = await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ phone: phoneDigits, message: whatsappText }),
            });
            const txt = await r.text();
            if (!r.ok) {
              let detail: any = txt;
              try { detail = JSON.parse(txt); } catch {}
              whatsappError = `Z-API ${r.status}: ${typeof detail === 'string' ? detail : (detail?.error || detail?.message || JSON.stringify(detail))}`;
              console.error('[DHL Intake] erro WhatsApp:', whatsappError);
            } else {
              whatsappSent = true;
            }
          } catch (e: any) {
            whatsappError = e?.message || 'falha no envio do WhatsApp';
            console.error('[DHL Intake] exceção WhatsApp:', whatsappError);
          }
        }
      } else {
        whatsappSkipped = true;
      }

      // ── Registra o reenvio no histórico (auditoria) ─────────────────
      try {
        const principal = await getPrincipal(req);
        const emailStatus = providerEmail
          ? (emailSent ? 'success' : 'failure')
          : 'skipped';
        const whatsappStatus = wantsWhatsapp
          ? (providerPhone ? (whatsappSent ? 'success' : 'failure') : 'skipped')
          : 'skipped';
        const { error: resendErr } = await sb.from('dhl_supplier_intake_resends').insert([{
          intake_id: intake.id,
          mission_id: mission.id,
          sent_by_user_id: principal?.id || null,
          sent_by_user_name: principal?.name || principal?.email || 'Sistema',
          target_email: providerEmail || null,
          target_phone: providerPhone || null,
          email_status: emailStatus,
          email_error: emailError,
          whatsapp_status: whatsappStatus,
          whatsapp_error: whatsappError,
          reused_existing_token: reusedExistingToken,
        }]);
        if (resendErr) {
          console.error('[DHL Intake] erro ao registrar histórico de reenvio:', resendErr.message);
        }
      } catch (e: any) {
        console.error('[DHL Intake] exceção ao registrar histórico de reenvio:', e?.message);
      }

      return res.json({
        ok: true,
        token,
        url: link,
        whatsappText,
        emailSent,
        emailError,
        emailSkipped,
        whatsappSent,
        whatsappError,
        whatsappSkipped,
        channel,
        providerEmail: providerEmail || null,
        providerPhone: providerPhone || null,
      });
    } catch (e: any) {
      console.error('[DHL Intake] generate exception:', e);
      return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // POST /api/dhl/intake/cancel-by-mission — invalida links da OS
  // body: { missionId: string }
  // ──────────────────────────────────────────────────────────────
  app.post('/api/dhl/intake/cancel-by-mission', requireAuth, async (req: Request, res: Response) => {
    try {
      const { missionId } = req.body || {};
      if (!missionId) return res.status(400).json({ error: 'missionId é obrigatório' });
      const cancelled = await cancelDhlIntakesForMission(String(missionId));
      return res.json({ ok: true, cancelled });
    } catch (e: any) {
      console.error('[DHL Intake] cancel-by-mission exception:', e);
      return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // GET /api/dhl/intake/by-mission/:missionId — lista intakes (auth)
  // Mostra no painel da OS os links ativos, preenchidos e cancelados.
  // ──────────────────────────────────────────────────────────────
  app.get('/api/dhl/intake/by-mission/:missionId', requireAuth, async (req: Request, res: Response) => {
    try {
      const { missionId } = req.params;
      if (!missionId) return res.status(400).json({ error: 'missionId é obrigatório' });
      const sb = getSb();
      const canSeeSnapshots = await userCanSeeSnapshots(req);
      const baseCols = 'id, token, provider_id, provider_name, status, sent_to_email, sent_to_phone, submitted_at, created_at, expires_at';
      const sensitiveCols = ', agent1_snapshot, agent2_snapshot, vehicle_snapshot, mirror_proof_url, mirror_proof_filename';
      const { data, error } = await sb.from('dhl_supplier_intakes')
        .select(canSeeSnapshots ? baseCols + sensitiveCols : baseCols)
        .eq('mission_id', missionId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[DHL Intake] by-mission error:', error.message);
        return res.status(500).json({ error: error.message });
      }
      const now = new Date();
      const intakeList = (data || []) as any[];
      const intakeIds = intakeList.map(it => it.id).filter(Boolean);

      // Busca histórico de reenvios para todos os intakes desta OS.
      let resendsByIntake: Map<string, any[]> = new Map();
      if (intakeIds.length > 0) {
        const { data: resends, error: rErr } = await sb.from('dhl_supplier_intake_resends')
          .select('id, intake_id, sent_at, sent_by_user_id, sent_by_user_name, target_email, target_phone, email_status, email_error, whatsapp_status, whatsapp_error, reused_existing_token')
          .in('intake_id', intakeIds)
          .order('sent_at', { ascending: false });
        if (rErr) {
          // Tabela ausente (migração não aplicada): degrade gracioso, segue sem histórico.
          const code = (rErr as any)?.code || '';
          const msg = String((rErr as any)?.message || '');
          if (!(code === 'PGRST205' || code === '42P01' || /could not find the table|schema cache|does not exist/i.test(msg))) {
            console.error('[DHL Intake] by-mission resends error:', msg);
          }
        } else {
          for (const r of (resends || [])) {
            const list = resendsByIntake.get(r.intake_id) || [];
            list.push(r);
            resendsByIntake.set(r.intake_id, list);
          }
        }
      }

      const intakes = intakeList.map((it: any) => {
        const expired = it.expires_at ? new Date(it.expires_at) < now : false;
        const effectiveStatus = it.status === 'pendente' && expired ? 'expirado' : it.status;
        const resends = resendsByIntake.get(it.id) || [];
        return { ...it, expired, effective_status: effectiveStatus, resends };
      });
      return res.json({ ok: true, intakes, canViewSnapshots: canSeeSnapshots });
    } catch (e: any) {
      console.error('[DHL Intake] by-mission exception:', e);
      return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // GET /api/dhl/intake/public/:token — dados para a página pública
  // ──────────────────────────────────────────────────────────────
  app.get('/api/dhl/intake/public/:token', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const sb = getSb();
      const { data: intake } = await sb.from('dhl_supplier_intakes').select('*').eq('token', token).maybeSingle();
      if (!intake) return res.status(404).json({ error: 'Link inválido ou expirado' });
      if (intake.status === 'cancelado') {
        return res.status(410).json({ error: 'Link cancelado — a OS foi excluída ou cancelada. Solicite um novo link ao Operacional TM Seg.' });
      }
      if (intake.expires_at && new Date(intake.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Link expirado' });
      }

      // Registra a primeira abertura do link público (idempotente: só na 1ª vez).
      if (!intake.first_opened_at && intake.status === 'pendente') {
        try {
          await sb.from('dhl_supplier_intakes')
            .update({ first_opened_at: new Date().toISOString() })
            .eq('token', token)
            .is('first_opened_at', null);
        } catch (e: any) {
          console.error('[DHL Intake] erro ao registrar first_opened_at:', e?.message);
        }
      }

      const { data: mission } = await sb.from('missions').select('id, client, provider, origin, destination, start_time, dhl_se_number, status').eq('id', intake.mission_id).maybeSingle();

      const { data: escoltistas } = await sb.from('provider_escoltistas')
        .select('*')
        .eq('provider_id', intake.provider_id)
        .order('nome', { ascending: true });

      const { data: vehicles } = await sb.from('provider_intake_vehicles')
        .select('*')
        .eq('provider_id', intake.provider_id)
        .order('placa', { ascending: true });

      return res.json({
        ok: true,
        intake: {
          token: intake.token,
          status: intake.status,
          submittedAt: intake.submitted_at,
          providerName: intake.provider_name,
        },
        mission: mission || null,
        escoltistas: escoltistas || [],
        vehicles: vehicles || [],
      });
    } catch (e: any) {
      console.error('[DHL Intake] public-get exception:', e);
      return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // POST /api/dhl/intake/public/:token/submit
  // body: { agent1: {...}|{id}, agent2: {...}|{id}, vehicle: {...}|{id} }
  // ──────────────────────────────────────────────────────────────
  app.post('/api/dhl/intake/public/:token/submit', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { agent1, agent2, vehicle, mirrorProof } = req.body || {};
      if (!agent1 || !agent2 || !vehicle) {
        return res.status(400).json({ error: 'Preencha os 3 blocos: Escoltista 1, Escoltista 2 e Veículo.' });
      }
      if (!mirrorProof || !mirrorProof.dataUrl) {
        return res.status(400).json({ error: 'Anexe o print do espelhamento (comprovante de que foi realizado) antes de enviar.' });
      }

      const sb = getSb();
      const { data: intake } = await sb.from('dhl_supplier_intakes').select('*').eq('token', token).maybeSingle();
      if (!intake) return res.status(404).json({ error: 'Link inválido' });
      if (intake.status === 'cancelado') {
        return res.status(410).json({ error: 'Link cancelado — a OS foi excluída ou cancelada. Solicite um novo link ao Operacional TM Seg.' });
      }
      if (intake.expires_at && new Date(intake.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Link expirado' });
      }
      if (intake.status === 'preenchido') {
        // permitido reenviar, mas avisa
      }

      const providerId = intake.provider_id;

      const persistEscoltista = async (a: any, label: string): Promise<{ id: string; snap: any }> => {
        if (a.id) {
          // Anti-IDOR: garante que o registro pertence ao fornecedor do intake
          const { data } = await sb.from('provider_escoltistas')
            .select('*')
            .eq('id', a.id)
            .eq('provider_id', providerId)
            .maybeSingle();
          if (data) return { id: data.id, snap: data };
          throw new Error(`${label}: registro selecionado não pertence ao fornecedor desta OS`);
        }
        // Validação completa de servidor (não confia no front)
        const required: [string, string][] = [
          ['nome', 'Nome'], ['cpf', 'CPF'], ['rg', 'RG'],
          ['cnh', 'CNH'], ['celular', 'Celular'],
          ['rua', 'Rua'], ['numero', 'Número'], ['bairro', 'Bairro'],
          ['cidade', 'Cidade'], ['uf', 'UF'], ['cep', 'CEP'],
        ];
        for (const [k, lbl] of required) {
          const val = a[k] || a[k.replace(/([A-Z])/g, '_$1').toLowerCase()];
          if (!val || String(val).trim() === '') throw new Error(`${label}: ${lbl} é obrigatório`);
        }
        const cpfDigits = String(a.cpf).replace(/\D/g, '');
        if (cpfDigits.length !== 11) throw new Error(`${label}: CPF inválido`);
        const payload: any = {
          provider_id: providerId,
          nome: a.nome,
          cpf: a.cpf,
          rg: a.rg || null,
          orgao_emissor: a.orgaoEmissor || a.orgao_emissor || null,
          cnh: a.cnh || null,
          cnh_categoria: a.cnhCategoria || a.cnh_categoria || null,
          cnh_vencimento: a.cnhVencimento || a.cnh_vencimento || null,
          cnv_numero: a.cnvNumero || a.cnv_numero || null,
          cnv_validade: a.cnvValidade || a.cnv_validade || null,
          rua: a.rua || null,
          numero: a.numero || null,
          complemento: a.complemento || null,
          bairro: a.bairro || null,
          cidade: a.cidade || null,
          uf: a.uf || null,
          cep: a.cep || null,
          celular: a.celular || null,
          admissao: a.admissao || null,
        };
        // Dedup por CPF dentro do fornecedor
        const { data: existing } = await sb.from('provider_escoltistas').select('id').eq('provider_id', providerId).eq('cpf', a.cpf).maybeSingle();
        if (existing) {
          await sb.from('provider_escoltistas').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id);
          const { data: row } = await sb.from('provider_escoltistas').select('*').eq('id', existing.id).single();
          return { id: existing.id, snap: row };
        }
        const { data: ins, error: insErr } = await sb.from('provider_escoltistas').insert([payload]).select().single();
        if (insErr) throw new Error('Erro ao salvar escoltista: ' + insErr.message);
        return { id: ins.id, snap: ins };
      };

      const persistVehicle = async (v: any): Promise<{ id: string; snap: any }> => {
        if (v.id) {
          // Anti-IDOR: garante que o veículo pertence ao fornecedor do intake
          const { data } = await sb.from('provider_intake_vehicles')
            .select('*')
            .eq('id', v.id)
            .eq('provider_id', providerId)
            .maybeSingle();
          if (data) return { id: data.id, snap: data };
          throw new Error('Veículo: registro selecionado não pertence ao fornecedor desta OS');
        }
        const vReq: [string, string][] = [
          ['placa', 'Placa'], ['marca', 'Marca'], ['modelo', 'Modelo'],
          ['tecnologia', 'Tecnologia'],
        ];
        for (const [k, lbl] of vReq) {
          if (!v[k] || String(v[k]).trim() === '') throw new Error(`Veículo: ${lbl} é obrigatório`);
        }
        const payload: any = {
          provider_id: providerId,
          placa: String(v.placa).toUpperCase().replace(/\s/g, ''),
          renavam: v.renavam || null,
          marca: v.marca || null,
          ano: v.ano || null,
          modelo: v.modelo || null,
          cor: v.cor || null,
          tecnologia: v.tecnologia || null,
          id_rastreador: v.idRastreador || v.id_rastreador || null,
          comunicacao: v.comunicacao || null,
        };
        const { data: existing } = await sb.from('provider_intake_vehicles').select('id').eq('provider_id', providerId).eq('placa', payload.placa).maybeSingle();
        if (existing) {
          await sb.from('provider_intake_vehicles').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id);
          const { data: row } = await sb.from('provider_intake_vehicles').select('*').eq('id', existing.id).single();
          return { id: existing.id, snap: row };
        }
        const { data: ins, error: insErr } = await sb.from('provider_intake_vehicles').insert([payload]).select().single();
        if (insErr) throw new Error('Erro ao salvar veículo: ' + insErr.message);
        return { id: ins.id, snap: ins };
      };

      // Impede Escoltista 1 == Escoltista 2 (mesmo registro escolhido ou mesmo CPF digitado)
      if (agent1?.id && agent2?.id && agent1.id === agent2.id) {
        return res.status(400).json({ error: 'Escoltista 1 e Escoltista 2 não podem ser o mesmo registro.' });
      }
      const cpf1 = String(agent1?.cpf || '').replace(/\D/g, '');
      const cpf2 = String(agent2?.cpf || '').replace(/\D/g, '');
      if (!agent1?.id && !agent2?.id && cpf1 && cpf1 === cpf2) {
        return res.status(400).json({ error: 'Escoltista 1 e Escoltista 2 não podem ter o mesmo CPF.' });
      }

      let a1, a2, vh;
      try {
        a1 = await persistEscoltista(agent1, 'Escoltista 1');
        a2 = await persistEscoltista(agent2, 'Escoltista 2');
        vh = await persistVehicle(vehicle);
      } catch (e: any) {
        return res.status(400).json({ error: e?.message || 'Dados inválidos' });
      }
      // Pós-persistência: garante que se um foi novo e outro selecionado, IDs ainda diferem
      if (a1.id === a2.id) {
        return res.status(400).json({ error: 'Escoltista 1 e Escoltista 2 não podem ser o mesmo registro.' });
      }

      // Upload do print do espelhamento → bucket mission-evidence/dhl-mirror-proof/<missionId>/
      let mirrorProofUrl: string | null = null;
      let mirrorProofFilename: string | null = null;
      try {
        const dataUrl: string = String(mirrorProof.dataUrl);
        const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) throw new Error('Print inválido — formato não reconhecido (envie PNG/JPG/PDF).');
        const contentType = m[1];
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > 8 * 1024 * 1024) throw new Error('Print muito grande — limite de 8 MB.');
        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
        if (!allowed.includes(contentType.toLowerCase())) throw new Error('Tipo de arquivo não suportado — envie PNG, JPG, WEBP ou PDF.');
        const extMap: Record<string,string> = { 'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp','application/pdf':'pdf' };
        const ext = extMap[contentType.toLowerCase()] || 'bin';
        const safeOrig = String(mirrorProof.filename || `espelhamento.${ext}`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
        const filePath = `dhl-mirror-proof/${intake.mission_id}/${Date.now()}_${safeOrig}`;
        const { error: upErr } = await sb.storage.from('mission-evidence').upload(filePath, buf, { contentType, upsert: false });
        if (upErr) throw new Error('Falha ao salvar o print: ' + upErr.message);
        const { data: urlData } = sb.storage.from('mission-evidence').getPublicUrl(filePath);
        mirrorProofUrl = urlData?.publicUrl || null;
        mirrorProofFilename = safeOrig;
      } catch (e: any) {
        return res.status(400).json({ error: e?.message || 'Erro ao processar o print do espelhamento.' });
      }

      await sb.from('dhl_supplier_intakes').update({
        status: 'preenchido',
        agent1_id: a1.id,
        agent2_id: a2.id,
        vehicle_id: vh.id,
        agent1_snapshot: a1.snap,
        agent2_snapshot: a2.snap,
        vehicle_snapshot: vh.snap,
        mirror_proof_url: mirrorProofUrl,
        mirror_proof_filename: mirrorProofFilename,
        submitted_at: new Date().toISOString(),
      }).eq('token', token);

      // Notifica operacional
      try {
        const { data: mission } = await sb.from('missions').select('*').eq('id', intake.mission_id).maybeSingle();
        await sendDhlIntakeSubmittedEmail({
          to: OPERACIONAL_EMAIL,
          providerName: intake.provider_name || '—',
          osNumber: intake.mission_id,
          seNumber: mission?.dhl_se_number || '—',
          origin: mission?.origin || '—',
          destination: mission?.destination || '—',
          scheduledAt: mission?.start_time ? new Date(mission.start_time).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—',
          agent1: a1.snap,
          agent2: a2.snap,
          vehicle: vh.snap,
          mirrorProofUrl,
          mirrorProofFilename,
        });
      } catch (e: any) {
        console.error('[DHL Intake] erro ao notificar operacional:', e?.message);
      }

      return res.json({ ok: true, message: 'Dados recebidos com sucesso.' });
    } catch (e: any) {
      console.error('[DHL Intake] submit exception:', e);
      return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
  });
}
