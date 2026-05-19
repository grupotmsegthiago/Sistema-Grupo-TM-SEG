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
import fs from 'fs';
import path from 'path';
import {
  sendDhlSupplierIntakeEmail,
  sendDhlIntakeSubmittedEmail,
  sendDhlIntakeExpiredEmail,
  sendDhlIntakeReminderProviderEmail,
  sendDhlIntakeReminderOperacionalEmail,
  sendDhlIntakeOperationalFollowupEmail,
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
        provider_id TEXT NOT NULL,
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
        provider_id TEXT NOT NULL,
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
        provider_id TEXT,
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
      ALTER TABLE providers ADD COLUMN IF NOT EXISTS dhl_solicitation_email TEXT;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS mirror_proof_url TEXT;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS mirror_proof_filename TEXT;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS provider_reminder_sent_at TIMESTAMPTZ;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS provider_whatsapp_reminder_sent_at TIMESTAMPTZ;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS operational_alert_sent_at TIMESTAMPTZ;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS provider_reminder_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS provider_whatsapp_reminder_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS operational_followup_sent_at TIMESTAMPTZ;
      -- Interruptor manual por OS: quando preenchido, o worker de lembretes
      -- automáticos ignora este intake (o operacional está em contato direto
      -- com o fornecedor por outro canal). Auditoria de quem pausou também é gravada.
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS auto_reminders_paused_at TIMESTAMPTZ;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS auto_reminders_paused_by TEXT;
      -- Contador de aberturas do link pelo fornecedor + última abertura.
      -- Permite ao operacional saber quantas vezes o fornecedor já entrou no link.
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;
      -- Flags de progresso parcial do cadastro feitas pelo fornecedor
      -- (cada bloco é marcado conforme o fornecedor avança no formulário público).
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS progress_agent1 BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS progress_agent2 BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS progress_vehicle BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE dhl_supplier_intakes ADD COLUMN IF NOT EXISTS progress_mirror BOOLEAN NOT NULL DEFAULT FALSE;
      -- RPC atômica para registrar abertura do link (evita lost-update em
      -- read-modify-write concorrente). Faz tudo em UMA query: incrementa
      -- open_count, atualiza last_opened_at e preenche first_opened_at só
      -- na primeira vez.
      CREATE OR REPLACE FUNCTION public.dhl_intake_register_open(p_token TEXT)
      RETURNS void
      LANGUAGE sql
      AS $func$
        UPDATE public.dhl_supplier_intakes
           SET open_count = COALESCE(open_count, 0) + 1,
               last_opened_at = NOW(),
               first_opened_at = COALESCE(first_opened_at, NOW())
         WHERE token = p_token;
      $func$;
      -- Compatibilidade: providers.id deste sistema é numérico, então provider_id
      -- precisa aceitar qualquer string. Converte de UUID para TEXT se preciso.
      ALTER TABLE dhl_supplier_intakes ALTER COLUMN provider_id TYPE TEXT USING provider_id::TEXT;
      ALTER TABLE provider_escoltistas ALTER COLUMN provider_id TYPE TEXT USING provider_id::TEXT;
      ALTER TABLE provider_intake_vehicles ALTER COLUMN provider_id TYPE TEXT USING provider_id::TEXT;

      -- Espelhamento do intake para o cadastro principal de agentes.
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS orgao_emissor TEXT;
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS cnh_categoria TEXT;
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS rua TEXT;
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS numero TEXT;
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS complemento TEXT;
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS bairro TEXT;
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS cidade TEXT;
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS uf TEXT;
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS cep TEXT;
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS admissao DATE;
      -- Desabilita RLS — estas tabelas só são acessadas via API autenticada
      -- do backend (nunca diretamente pelo cliente). Sem isso, INSERTs falham
      -- com "new row violates row-level security policy".
      ALTER TABLE dhl_supplier_intakes DISABLE ROW LEVEL SECURITY;
      ALTER TABLE provider_escoltistas DISABLE ROW LEVEL SECURITY;
      ALTER TABLE provider_intake_vehicles DISABLE ROW LEVEL SECURITY;
      -- Backfill: intakes pré-existentes que já receberam um lembrete (flag preenchida)
      -- contam como 1 envio, evitando que o ciclo recém-criado dispare um lembrete
      -- "extra" no período de transição.
      UPDATE dhl_supplier_intakes
        SET provider_reminder_count = 1
        WHERE provider_reminder_sent_at IS NOT NULL
          AND provider_reminder_count = 0;
      UPDATE dhl_supplier_intakes
        SET provider_whatsapp_reminder_count = 1
        WHERE provider_whatsapp_reminder_sent_at IS NOT NULL
          AND provider_whatsapp_reminder_count = 0;

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
      ALTER TABLE dhl_supplier_intake_resends ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;
      ALTER TABLE dhl_supplier_intake_resends ADD COLUMN IF NOT EXISTS whatsapp_delivered_at TIMESTAMPTZ;
      ALTER TABLE dhl_supplier_intake_resends ADD COLUMN IF NOT EXISTS whatsapp_read_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_dhl_intake_resends_wa_msgid ON dhl_supplier_intake_resends(whatsapp_message_id);

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

// Envia uma mensagem de texto via Z-API. Retorna { ok, error }.
// Centraliza a chamada para reaproveitar no fluxo de geração inicial e no
// worker de lembretes automáticos.
async function sendZapiTextMessage(phoneDigits: string, message: string): Promise<{ ok: boolean; error: string | null; messageId: string | null }> {
  const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID || process.env.VITE_ZAPI_INSTANCE_ID || '';
  const ZAPI_TOKEN = process.env.ZAPI_TOKEN || process.env.VITE_ZAPI_TOKEN || '';
  const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || process.env.VITE_ZAPI_CLIENT_TOKEN || '';
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) {
    return { ok: false, error: 'Z-API não configurada', messageId: null };
  }
  const digits = String(phoneDigits || '').replace(/\D/g, '');
  if (!digits) return { ok: false, error: 'telefone vazio', messageId: null };
  // Brasil: garante prefixo 55 quando vier apenas DDD+número (10/11 dígitos).
  const phone = digits.length <= 11 ? `55${digits}` : digits;
  try {
    const headers: any = { 'Content-Type': 'application/json' };
    if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
    const r = await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, message }),
    });
    const txt = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(txt); } catch {}
    if (!r.ok) {
      const detail = parsed ?? txt;
      const err = `Z-API ${r.status}: ${typeof detail === 'string' ? detail : (detail?.error || detail?.message || JSON.stringify(detail))}`;
      return { ok: false, error: err, messageId: null };
    }
    let messageId: string | null = null;
    if (parsed && typeof parsed === 'object') {
      const mid = parsed.messageId || parsed.id || parsed.zaapId || null;
      messageId = mid ? String(mid) : null;
    }
    return { ok: true, error: null, messageId };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'falha no envio do WhatsApp', messageId: null };
  }
}

function buildReminderWhatsappText(opts: {
  providerName: string;
  osNumber: string;
  seNumber: string;
  origin: string;
  destination: string;
  scheduledAt: string;
  expiresAt: string;
  link: string;
  reason: 'opened_abandoned' | 'expiry_approaching';
  firstOpenedAt?: string | null;
}): string {
  const motivo = opts.reason === 'opened_abandoned'
    ? `Identificamos que o link foi aberto${opts.firstOpenedAt ? ` em ${opts.firstOpenedAt}` : ''}, mas ainda *não foi concluído*.`
    : `O link de cadastro está prestes a *expirar* em ${opts.expiresAt} e ainda não foi preenchido.`;
  return `*Grupo TM SEG — Lembrete: cadastro DHL pendente*

Olá, ${opts.providerName}!

${motivo}

Por favor, finalize o preenchimento dos dados de *Escoltista 1, Escoltista 2 e Veículo* pelo link abaixo o quanto antes:

🔗 ${opts.link}

*Dados da OS:*
• OS: ${opts.osNumber}
• S.E. DHL: ${opts.seNumber}
• Origem: ${opts.origin}
• Destino: ${opts.destination}
• Início: ${opts.scheduledAt}
• Validade do link: ${opts.expiresAt}

Em caso de dúvida, responda a este WhatsApp.

_Grupo TM SEG — Intermediação de Escolta Armada_`;
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
// Lê env numérico, retornando o fallback quando o valor é vazio, NaN ou <= 0.
// Evita que um typo no env desabilite silenciosamente o envio de lembretes.
function readPositiveEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(`[DHL Reminder Worker] env ${name}=${raw} inválido — usando fallback ${fallback}.`);
    return fallback;
  }
  return n;
}
const DHL_REMINDER_OPENED_THRESHOLD_HOURS = readPositiveEnv('DHL_REMINDER_OPENED_HOURS', 4);   // abriu mas não concluiu há ≥ N h
const DHL_REMINDER_EXPIRY_WINDOW_HOURS    = readPositiveEnv('DHL_REMINDER_EXPIRY_HOURS', 24); // ou o link expira em ≤ N h
// Ciclos de reenvio: a cada N horas, até no máximo M lembretes por canal.
// Permite reenviar lembretes ao fornecedor inerte sem deixar o link expirar em silêncio.
const DHL_REMINDER_CYCLE_HOURS = readPositiveEnv('DHL_REMINDER_CYCLE_HOURS', 12);             // intervalo mínimo entre lembretes
const DHL_REMINDER_MAX_COUNT   = readPositiveEnv('DHL_REMINDER_MAX_COUNT', 3);                // limite máximo de lembretes por canal
// Após o lembrete ao fornecedor, se passarem ≥ N h sem preenchimento,
// dispara um alerta de acompanhamento (follow-up) ao operacional para
// que ele faça contato manual antes do link expirar.
const DHL_OPERATIONAL_FOLLOWUP_THRESHOLD_HOURS = readPositiveEnv('DHL_OPERATIONAL_FOLLOWUP_HOURS', 6);

async function checkAndSendDhlIntakeReminders(): Promise<void> {
  const sb = getSb();
  const now = new Date();
  const nowIso = now.toISOString();

  // Busca intakes pendentes ainda não expirados em que pelo menos um dos
  // canais (lembrete ao fornecedor OU alerta ao operacional) ainda não foi
  // enviado. Cada canal é controlado por sua própria flag, permitindo retry
  // independente em caso de falha de um deles.
  // Em vez de filtrar por "flag não preenchida", consideramos elegível qualquer
  // intake pendente cujo link ainda não expirou — a decisão de reenviar (canal
  // por canal) é tomada adiante usando contador + último envio + ciclo mínimo.
  const { data: pendentes, error: selErr } = await sb.from('dhl_supplier_intakes')
    .select('id, token, mission_id, provider_id, provider_name, sent_to_email, sent_to_phone, first_opened_at, created_at, expires_at, provider_reminder_sent_at, provider_whatsapp_reminder_sent_at, operational_alert_sent_at, provider_reminder_count, provider_whatsapp_reminder_count, reminder_sent_at, auto_reminders_paused_at')
    .eq('status', 'pendente')
    .gt('expires_at', nowIso)
    // Interruptor manual: o operacional pode pausar os lembretes automáticos
    // de uma OS específica (ex.: está em contato direto com o fornecedor por
    // outro canal). Quando preenchido, o worker ignora este intake.
    .is('auto_reminders_paused_at', null);

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
      .select('id, name, trading_name, email, os_email, dhl_solicitation_email, phone')
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

  // Por canal: lista de intakes que ainda precisam do envio. Cada canal
  // (e-mail e WhatsApp ao fornecedor) tem sua própria flag para permitir
  // retry independente: se o e-mail já saiu mas o WhatsApp falhou, o
  // próximo tick reenvia apenas o WhatsApp.
  type Eleg = typeof elegiveis[number];
  // Para cada canal de lembrete ao fornecedor, só envia se:
  //   (1) ainda não atingiu DHL_REMINDER_MAX_COUNT lembretes naquele canal; E
  //   (2) ou nunca foi enviado, ou já passaram >= DHL_REMINDER_CYCLE_HOURS
  //       desde o último envio (provider_*_reminder_sent_at registra o último).
  const cicloOk = (lastIso: string | null | undefined): boolean => {
    if (!lastIso) return true;
    const last = new Date(lastIso).getTime();
    if (!isFinite(last)) return true;
    const horas = (now.getTime() - last) / 36e5;
    return horas >= DHL_REMINDER_CYCLE_HOURS;
  };
  const precisaFornecedorEmail: Eleg[] = elegiveis.filter(el =>
    (Number(el.intake.provider_reminder_count) || 0) < DHL_REMINDER_MAX_COUNT
    && cicloOk(el.intake.provider_reminder_sent_at),
  );
  const precisaFornecedorWhatsapp: Eleg[] = elegiveis.filter(el =>
    (Number(el.intake.provider_whatsapp_reminder_count) || 0) < DHL_REMINDER_MAX_COUNT
    && cicloOk(el.intake.provider_whatsapp_reminder_sent_at),
  );
  // O alerta ao operacional permanece one-shot — evita inundar a caixa do
  // operacional cada vez que o fornecedor é reenviado.
  const precisaOperacional: Eleg[] = elegiveis.filter(el => !el.intake.operational_alert_sent_at);

  const resolveDestinos = (el: Eleg) => {
    const { intake, provider } = el;
    return {
      email: (intake.sent_to_email || (provider.dhl_solicitation_email || provider.os_email || provider.email || '')).trim(),
      phone: maskPhone(intake.sent_to_phone || provider.phone || ''),
      name: intake.provider_name || provider.trading_name || provider.name || '—',
      link: baseUrl ? `${baseUrl}/fornecedor/dhl?token=${intake.token}` : '',
    };
  };

  const auditarLembrete = async (
    el: Eleg,
    targetEmail: string | null,
    targetPhone: string | null,
    emailStatus: 'success' | 'failure' | 'skipped',
    emailError: string | null,
    whatsappStatus: 'success' | 'failure' | 'skipped',
    whatsappError: string | null,
  ) => {
    try {
      const { error: resendErr } = await sb.from('dhl_supplier_intake_resends').insert([{
        intake_id: el.intake.id,
        mission_id: el.intake.mission_id,
        sent_by_user_id: null,
        sent_by_user_name: `Sistema (lembrete: ${el.reason}; ciclo ${DHL_REMINDER_CYCLE_HOURS}h)`,
        target_email: targetEmail || null,
        target_phone: targetPhone || null,
        email_status: emailStatus,
        email_error: emailError,
        whatsapp_status: whatsappStatus,
        whatsapp_error: whatsappError,
        reused_existing_token: true,
      }]);
      if (resendErr) {
        console.error('[DHL Reminder Worker] erro ao registrar histórico de lembrete:', resendErr.message);
      }
    } catch (e: any) {
      console.error('[DHL Reminder Worker] exceção ao registrar histórico de lembrete:', e?.message);
    }
  };

  // ── Canal 1a: lembrete por e-mail ─────────────────────────────────────
  let marcadosEmail = 0;
  for (const el of precisaFornecedorEmail) {
    const { intake, mission, reason } = el;
    const { email: providerEmail, name: providerName, link } = resolveDestinos(el);
    if (!providerEmail || !link) continue; // sem destino — retry no próximo tick

    let emailStatus: 'success' | 'failure' = 'failure';
    let emailError: string | null = null;
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
      emailStatus = 'success';
    } catch (e: any) {
      emailError = e?.message || 'falha no envio do e-mail';
      console.error('[DHL Reminder Worker] erro ao enviar e-mail ao fornecedor:', emailError);
    }

    await auditarLembrete(el, providerEmail, null, emailStatus, emailError, 'skipped', null);

    if (emailStatus !== 'success') continue; // mantém retry

    const novoCount = (Number(intake.provider_reminder_count) || 0) + 1;
    const { error: markErr } = await sb.from('dhl_supplier_intakes')
      .update({
        provider_reminder_sent_at: nowIso,
        provider_reminder_count: novoCount,
        reminder_sent_at: nowIso,
      })
      .eq('id', intake.id);
    if (markErr) {
      console.error('[DHL Reminder Worker] erro ao marcar provider_reminder_sent_at:', markErr.message);
      continue;
    }
    marcadosEmail++;
  }

  // ── Canal 1b: lembrete por WhatsApp (Z-API) ───────────────────────────
  let marcadosWhatsapp = 0;
  for (const el of precisaFornecedorWhatsapp) {
    const { intake, mission, reason } = el;
    const { phone: providerPhone, name: providerName, link } = resolveDestinos(el);
    if (!providerPhone || !link) continue; // sem telefone — retry no próximo tick

    const text = buildReminderWhatsappText({
      providerName,
      osNumber: intake.mission_id,
      seNumber: mission.dhl_se_number || '—',
      origin: mission.origin || '—',
      destination: mission.destination || '—',
      scheduledAt: fmtBr(mission.start_time),
      expiresAt: fmtBr(intake.expires_at),
      link,
      reason,
      firstOpenedAt: intake.first_opened_at ? fmtBr(intake.first_opened_at) : null,
    });
    const r = await sendZapiTextMessage(providerPhone, text);
    const whatsappStatus: 'success' | 'failure' = r.ok ? 'success' : 'failure';
    const whatsappError: string | null = r.error;
    if (!r.ok) {
      console.error('[DHL Reminder Worker] erro ao enviar WhatsApp ao fornecedor:', whatsappError);
    }

    await auditarLembrete(el, null, providerPhone, 'skipped', null, whatsappStatus, whatsappError);

    if (whatsappStatus !== 'success') continue; // mantém retry

    const novoCount = (Number(intake.provider_whatsapp_reminder_count) || 0) + 1;
    const { error: markErr } = await sb.from('dhl_supplier_intakes')
      .update({
        provider_whatsapp_reminder_sent_at: nowIso,
        provider_whatsapp_reminder_count: novoCount,
        reminder_sent_at: nowIso,
      })
      .eq('id', intake.id);
    if (markErr) {
      console.error('[DHL Reminder Worker] erro ao marcar provider_whatsapp_reminder_sent_at:', markErr.message);
      continue;
    }
    marcadosWhatsapp++;
  }
  const marcadosFornecedor = marcadosEmail + marcadosWhatsapp;
  const precisaFornecedor = { length: precisaFornecedorEmail.length + precisaFornecedorWhatsapp.length };

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

// ────────────────────────────────────────────────────────────────────────────
// WORKER PERIÓDICO — FOLLOW-UP do operacional.
// Após o lembrete ao fornecedor (provider_reminder_sent_at OU
// provider_whatsapp_reminder_sent_at), se passarem
// ≥ DHL_OPERATIONAL_FOLLOWUP_THRESHOLD_HOURS sem preenchimento, dispara um
// e-mail consolidado + system_log para o operacional, listando os intakes
// parados — para que ele faça contato manual antes do link expirar.
// Idempotente via flag dedicada operational_followup_sent_at.
// ────────────────────────────────────────────────────────────────────────────
type DhlIntakeRow = {
  id: string;
  mission_id: string;
  provider_id: string | null;
  provider_name: string | null;
  sent_to_email: string | null;
  sent_to_phone: string | null;
  first_opened_at: string | null;
  created_at: string;
  expires_at: string;
  provider_reminder_sent_at: string | null;
  provider_whatsapp_reminder_sent_at: string | null;
  operational_followup_sent_at: string | null;
};

type DhlMissionRow = {
  id: string;
  dhl_se_number: string | null;
  origin: string | null;
  destination: string | null;
  start_time: string | null;
};

async function checkAndSendDhlOperationalFollowups(): Promise<void> {
  const sb = getSb();
  const now = new Date();
  const nowIso = now.toISOString();
  const thresholdMs = DHL_OPERATIONAL_FOLLOWUP_THRESHOLD_HOURS * 36e5;

  // Candidatos: pendentes, ainda não expirados, com lembrete já enviado
  // (e-mail ou WhatsApp) e sem follow-up ainda.
  const { data: pendentes, error: selErr } = await sb.from('dhl_supplier_intakes')
    .select('id, mission_id, provider_id, provider_name, sent_to_email, sent_to_phone, first_opened_at, created_at, expires_at, provider_reminder_sent_at, provider_whatsapp_reminder_sent_at, operational_followup_sent_at')
    .eq('status', 'pendente')
    .is('operational_followup_sent_at', null)
    .or('provider_reminder_sent_at.not.is.null,provider_whatsapp_reminder_sent_at.not.is.null')
    .gt('expires_at', nowIso);

  if (selErr) {
    console.error('[DHL Followup Worker] erro ao listar pendentes:', selErr.message);
    return;
  }
  const lista = (Array.isArray(pendentes) ? pendentes : []) as DhlIntakeRow[];
  if (lista.length === 0) return;

  // Helper: timestamp do primeiro lembrete enviado (e-mail ou WhatsApp).
  const firstReminderTs = (it: DhlIntakeRow): number | null => {
    const candidates: number[] = [];
    if (it.provider_reminder_sent_at) candidates.push(new Date(it.provider_reminder_sent_at).getTime());
    if (it.provider_whatsapp_reminder_sent_at) candidates.push(new Date(it.provider_whatsapp_reminder_sent_at).getTime());
    return candidates.length ? Math.min(...candidates) : null;
  };

  // Filtra os que já atingiram o threshold desde o primeiro lembrete.
  const elegiveis = lista.filter(it => {
    const ts = firstReminderTs(it);
    return ts !== null && (now.getTime() - ts) >= thresholdMs;
  });
  if (elegiveis.length === 0) return;

  console.log(`[DHL Followup Worker] ${elegiveis.length} candidato(s) ao follow-up.`);

  // Claim atômico: marca operational_followup_sent_at ANTES de enviar o
  // e-mail consolidado. O `.is('operational_followup_sent_at', null)` evita
  // que outra instância (ou execução concorrente) pegue os mesmos registros.
  // Apenas os IDs efetivamente reivindicados serão notificados.
  const candidateIds = elegiveis.map(e => e.id);
  const { data: claimed, error: claimErr } = await sb.from('dhl_supplier_intakes')
    .update({ operational_followup_sent_at: nowIso })
    .in('id', candidateIds)
    .is('operational_followup_sent_at', null)
    .select('id');
  if (claimErr) {
    console.error('[DHL Followup Worker] erro ao reivindicar intakes:', claimErr.message);
    return;
  }
  const claimedIds = new Set((claimed || []).map((r: { id: string }) => r.id));
  const claimedIntakes = elegiveis.filter(e => claimedIds.has(e.id));
  if (claimedIntakes.length === 0) return;

  // Hidrata dados das OS apenas para os reivindicados.
  const missionIds = Array.from(new Set(claimedIntakes.map(i => i.mission_id).filter(Boolean)));
  const { data: missions } = await sb.from('missions')
    .select('id, dhl_se_number, origin, destination, start_time')
    .in('id', missionIds);
  const missionMap = new Map<string, DhlMissionRow>(((missions || []) as DhlMissionRow[]).map(m => [m.id, m]));

  const fmtBr = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); } catch { return '—'; }
  };

  const payload = claimedIntakes.map(it => {
    const m = missionMap.get(it.mission_id) || ({} as Partial<DhlMissionRow>);
    const reminderTs = firstReminderTs(it) as number; // garantido pelo filtro
    const hoursSinceReminder = Math.round((now.getTime() - reminderTs) / 36e5);
    return {
      osNumber: it.mission_id,
      seNumber: m.dhl_se_number || '—',
      providerName: it.provider_name || '—',
      sentTo: it.sent_to_email || it.sent_to_phone || '—',
      reminderSentAt: fmtBr(new Date(reminderTs).toISOString()),
      hoursSinceReminder,
      firstOpenedAt: it.first_opened_at ? fmtBr(it.first_opened_at) : null,
      expiresAt: fmtBr(it.expires_at),
      origin: m.origin || '—',
      destination: m.destination || '—',
      scheduledAt: fmtBr(m.start_time),
    };
  });

  let emailOk = false;
  try {
    await sendDhlIntakeOperationalFollowupEmail({
      to: OPERACIONAL_EMAIL,
      thresholdHours: DHL_OPERATIONAL_FOLLOWUP_THRESHOLD_HOURS,
      pending: payload,
    });
    emailOk = true;
  } catch (e: any) {
    console.error('[DHL Followup Worker] erro ao enviar e-mail ao operacional:', e?.message);
  }

  if (!emailOk) {
    // Rollback do claim para permitir retry no próximo tick.
    const { error: rollbackErr } = await sb.from('dhl_supplier_intakes')
      .update({ operational_followup_sent_at: null })
      .in('id', Array.from(claimedIds));
    if (rollbackErr) {
      console.error('[DHL Followup Worker] erro ao reverter claim:', rollbackErr.message);
    }
    return;
  }

  // Notificação in-app (toast em tempo real) — uma por intake reivindicado.
  for (const it of claimedIntakes) {
    try {
      await sb.from('system_logs').insert([{
        user_name: 'Sistema',
        action_type: 'UPDATE',
        entity: 'Mission',
        entity_id: it.mission_id,
        details: `Follow-up DHL: fornecedor ${it.provider_name || '—'} continua SEM preencher o link após o lembrete (há ≥${DHL_OPERATIONAL_FOLLOWUP_THRESHOLD_HOURS}h). Faça contato manual antes do link expirar.`,
      }]);
    } catch (e: any) {
      console.error('[DHL Followup Worker] erro ao inserir system_logs:', e?.message);
    }
  }

  console.log(`[DHL Followup Worker] follow-up enviado para ${claimedIntakes.length}/${elegiveis.length} intake(s) (claimed).`);
}

export function startDhlIntakeExpiryWorker(): void {
  if (_dhlExpiryWorkerTimer) return;
  // Primeira execução com um pequeno delay para não competir com o boot.
  setTimeout(() => {
    checkAndNotifyExpiredDhlIntakes().catch(e => console.error('[DHL Expiry Worker] tick inicial falhou:', e?.message));
    checkAndSendDhlIntakeReminders().catch(e => console.error('[DHL Reminder Worker] tick inicial falhou:', e?.message));
    checkAndSendDhlOperationalFollowups().catch(e => console.error('[DHL Followup Worker] tick inicial falhou:', e?.message));
  }, 30 * 1000);
  _dhlExpiryWorkerTimer = setInterval(() => {
    checkAndNotifyExpiredDhlIntakes().catch(e => console.error('[DHL Expiry Worker] tick falhou:', e?.message));
    checkAndSendDhlIntakeReminders().catch(e => console.error('[DHL Reminder Worker] tick falhou:', e?.message));
    checkAndSendDhlOperationalFollowups().catch(e => console.error('[DHL Followup Worker] tick falhou:', e?.message));
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
  // POST /api/zapi/webhook/message-status — webhook público da Z-API
  // Recebe callbacks de entrega/leitura e atualiza o histórico de reenvios
  // (dhl_supplier_intake_resends.whatsapp_delivered_at / whatsapp_read_at).
  //
  // Z-API envia eventos do tipo DeliveryCallback / ReadReceiptCallback
  // (também aceitamos MessageStatusCallback) com `status` em
  // SENT/RECEIVED/READ/PLAYED e `ids` (array) ou `messageId`.
  // Configure no painel Z-API: URL pública /api/zapi/webhook/message-status
  // ──────────────────────────────────────────────────────────────
  app.post('/api/zapi/webhook/message-status', async (req: Request, res: Response) => {
    try {
      // Verificação opcional de autenticidade. Configure ZAPI_WEBHOOK_SECRET e
      // adicione o mesmo valor no painel Z-API (header customizado ou ?token=).
      // Se a env não estiver setada, o webhook segue aberto (compatibilidade).
      const expectedSecret = (process.env.ZAPI_WEBHOOK_SECRET || '').trim();
      if (expectedSecret) {
        const provided =
          (req.headers['x-zapi-secret'] as string) ||
          (req.headers['x-webhook-secret'] as string) ||
          (req.query.token as string) || '';
        if (provided !== expectedSecret) {
          return res.status(401).json({ ok: false, error: 'invalid webhook secret' });
        }
      }
      const body: any = req.body || {};
      // Aceita lote (algumas instâncias enviam array no topo) ou objeto único.
      const events: any[] = Array.isArray(body) ? body : [body];
      const sb = getSb();
      let updated = 0;

      for (const ev of events) {
        if (!ev || typeof ev !== 'object') continue;
        const status = String(ev.status || ev.messageStatus || ev.type || '').toUpperCase();
        const ids: string[] = [];
        if (Array.isArray(ev.ids)) ids.push(...ev.ids.map((x: any) => String(x)));
        if (ev.messageId) ids.push(String(ev.messageId));
        if (ev.id) ids.push(String(ev.id));
        if (ev.zaapId) ids.push(String(ev.zaapId));
        const uniqIds = Array.from(new Set(ids.filter(Boolean)));
        if (uniqIds.length === 0) continue;

        const momentMs = typeof ev.momment === 'number' ? ev.momment
                       : typeof ev.moment === 'number' ? ev.moment
                       : typeof ev.timestamp === 'number' ? ev.timestamp
                       : Date.now();
        const whenIso = new Date(momentMs > 1e12 ? momentMs : momentMs * 1000).toISOString();

        // IMPORTANTE: NÃO sobrescrevemos whatsapp_status — esse campo guarda
        // o resultado do ENVIO ('success'|'failure'|'skipped') e é consumido
        // pela UI. Entrega/leitura ficam em colunas dedicadas.
        const patch: any = {};
        if (status.includes('READ') || status === 'PLAYED') {
          patch.whatsapp_read_at = whenIso;
          patch.whatsapp_delivered_at = whenIso;
        } else if (status.includes('RECEIVED') || status.includes('DELIVERED') || status === 'SENT' || status.includes('DELIVERY')) {
          patch.whatsapp_delivered_at = whenIso;
        } else {
          continue;
        }

        const { data: rows, error } = await sb.from('dhl_supplier_intake_resends')
          .update(patch)
          .in('whatsapp_message_id', uniqIds)
          .select('id');
        if (error) {
          console.error('[Z-API Webhook] update error:', error.message);
          continue;
        }
        updated += Array.isArray(rows) ? rows.length : 0;
      }

      return res.json({ ok: true, updated });
    } catch (e: any) {
      console.error('[Z-API Webhook] exception:', e?.message);
      // Sempre responde 200 para evitar reenvios em loop pela Z-API.
      return res.json({ ok: false, error: e?.message || 'erro interno' });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // GET /api/dhl/migrations-sql — devolve o conteúdo de scripts/dhl-migrations.sql
  // para o operador copiar e colar no Supabase Studio quando o exec_sql não existe.
  // ──────────────────────────────────────────────────────────────
  app.get('/api/dhl/migrations-sql', requireAuth, async (_req: Request, res: Response) => {
    try {
      const p = path.join(process.cwd(), 'scripts', 'dhl-migrations.sql');
      const sql = fs.readFileSync(p, 'utf8');
      res.json({ sql, bytes: sql.length });
    } catch (err: any) {
      res.status(500).json({ error: 'Não foi possível ler dhl-migrations.sql: ' + (err?.message || 'erro') });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // POST /api/dhl/intake/generate — operador gera link para fornecedor
  // body: { missionId: string }
  // ──────────────────────────────────────────────────────────────
  app.post('/api/dhl/intake/generate', requireAuth, async (req: Request, res: Response) => {
    try {
      const { missionId, channel: rawChannel, saveAsDefault: rawSaveAsDefault } = req.body || {};
      if (!missionId) return res.status(400).json({ error: 'missionId é obrigatório' });
      const saveAsDefault = rawSaveAsDefault === true;

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
        .select('id, name, trading_name, email, os_email, dhl_solicitation_email, phone, dhl_channel_preference')
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

      const providerEmail = (provider.dhl_solicitation_email || provider.os_email || provider.email || '').trim();
      const providerPhone = maskPhone(provider.phone);

      // Regra de negócio: se o canal escolhido envolve e-mail e o fornecedor
      // não tem e-mail cadastrado, devolve erro específico para o frontend
      // abrir um modal pedindo o e-mail e salvar no cadastro do fornecedor
      // antes de prosseguir.
      if (wantsEmail && !providerEmail) {
        return res.status(400).json({
          error: 'Fornecedor sem e-mail cadastrado',
          code: 'PROVIDER_EMAIL_REQUIRED',
          providerId: provider.id,
          providerName: provider.trading_name || provider.name,
        });
      }

      // Se o operador pediu para salvar como padrão, persiste a preferência ANTES de
      // disparar e-mail/WhatsApp — assim, mesmo se algum envio falhar, o canal padrão
      // já fica gravado e o botão "Reenviar pelo padrão" passa a aparecer.
      let preferenceSaved = false;
      let preferenceSaveError: string | null = null;
      if (saveAsDefault) {
        try {
          const { error: prefErr } = await sb
            .from('providers')
            .update({ dhl_channel_preference: channel })
            .eq('id', provider.id);
          if (prefErr) {
            preferenceSaveError = prefErr.message || 'falha ao salvar preferência';
            console.error('[DHL Intake] erro ao salvar dhl_channel_preference:', prefErr);
          } else {
            preferenceSaved = true;
          }
        } catch (e: any) {
          preferenceSaveError = e?.message || 'falha ao salvar preferência';
          console.error('[DHL Intake] exceção ao salvar dhl_channel_preference:', e);
        }
      }

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
        // Se o intake estava com lembretes automáticos pausados, reativá-los ao
        // regenerar o link — o operacional optou por enviar de novo, então os
        // lembretes voltam a contar normalmente (conforme requisito da tarefa).
        if (existingIntake.auto_reminders_paused_at) {
          try {
            await sb.from('dhl_supplier_intakes')
              .update({ auto_reminders_paused_at: null, auto_reminders_paused_by: null })
              .eq('id', existingIntake.id);
            intake = { ...existingIntake, auto_reminders_paused_at: null, auto_reminders_paused_by: null };
          } catch (e: any) {
            console.error('[DHL Intake] erro ao retomar lembretes ao regenerar link:', e?.message);
          }
        }
      } else {
        token = randomUUID().replace(/-/g, '');
        const { data: inserted, error: iErr } = await sb.from('dhl_supplier_intakes').insert([{
          token,
          mission_id: mission.id,
          provider_id: provider.id != null ? String(provider.id) : null,
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
      // Reaproveita o helper sendZapiTextMessage usado pelo worker de
      // lembretes para garantir comportamento idêntico de envio/erro.
      let whatsappSent = false;
      let whatsappError: string | null = null;
      let whatsappSkipped = false;
      let whatsappMessageId: string | null = null;
      if (wantsWhatsapp) {
        if (!providerPhone) {
          // Sem telefone cadastrado — frontend cai no fallback (copiar / wa.me).
        } else {
          const r = await sendZapiTextMessage(providerPhone, whatsappText);
          if (r.ok) {
            whatsappSent = true;
            whatsappMessageId = r.messageId;
          } else {
            whatsappError = r.error;
            console.error('[DHL Intake] erro WhatsApp:', whatsappError);
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
          whatsapp_message_id: whatsappMessageId,
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
        preferenceSaved,
        preferenceSaveError,
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
  // POST /api/dhl/intake/:id/pause-reminders — pausa o worker para este intake
  // POST /api/dhl/intake/:id/resume-reminders — retoma o worker para este intake
  // ──────────────────────────────────────────────────────────────
  const togglePausedReminders = async (req: Request, res: Response, pause: boolean) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });
      const sb = getSb();
      const { data: existing, error: selErr } = await sb.from('dhl_supplier_intakes')
        .select('id, status, auto_reminders_paused_at')
        .eq('id', id)
        .maybeSingle();
      if (selErr) return res.status(500).json({ error: selErr.message });
      if (!existing) return res.status(404).json({ error: 'Intake não encontrado' });
      if (pause && existing.status !== 'pendente') {
        return res.status(400).json({ error: 'Apenas intakes pendentes podem ter os lembretes pausados.' });
      }

      const principal = await getPrincipal(req);
      const actor = principal?.name || principal?.email || 'Sistema';
      const patch: any = pause
        ? { auto_reminders_paused_at: new Date().toISOString(), auto_reminders_paused_by: actor }
        : { auto_reminders_paused_at: null, auto_reminders_paused_by: null };
      const { data: updated, error: upErr } = await sb.from('dhl_supplier_intakes')
        .update(patch)
        .eq('id', id)
        .select('id, auto_reminders_paused_at, auto_reminders_paused_by')
        .maybeSingle();
      if (upErr) return res.status(500).json({ error: upErr.message });

      // Auditoria leve via system_logs (aparece no feed em tempo real).
      try {
        await sb.from('system_logs').insert([{
          user_name: actor,
          action_type: 'UPDATE',
          entity: 'DhlIntake',
          entity_id: id,
          details: pause
            ? 'Lembretes automáticos do link DHL PAUSADOS manualmente.'
            : 'Lembretes automáticos do link DHL RETOMADOS manualmente.',
        }]);
      } catch (e: any) {
        console.error('[DHL Intake] log pause/resume falhou:', e?.message);
      }

      return res.json({ ok: true, intake: updated });
    } catch (e: any) {
      console.error('[DHL Intake] pause/resume exception:', e);
      return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
  };
  app.post('/api/dhl/intake/:id/pause-reminders', requireAuth, (req, res) => togglePausedReminders(req, res, true));
  app.post('/api/dhl/intake/:id/resume-reminders', requireAuth, (req, res) => togglePausedReminders(req, res, false));

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
      const baseCols = 'id, token, provider_id, provider_name, status, sent_to_email, sent_to_phone, submitted_at, created_at, expires_at, provider_reminder_count, provider_whatsapp_reminder_count, provider_reminder_sent_at, provider_whatsapp_reminder_sent_at, auto_reminders_paused_at, auto_reminders_paused_by, first_opened_at, last_opened_at, open_count, progress_agent1, progress_agent2, progress_vehicle, progress_mirror';
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
          .select('id, intake_id, sent_at, sent_by_user_id, sent_by_user_name, target_email, target_phone, email_status, email_error, whatsapp_status, whatsapp_error, whatsapp_message_id, whatsapp_delivered_at, whatsapp_read_at, reused_existing_token')
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
      return res.json({
        ok: true,
        intakes,
        canViewSnapshots: canSeeSnapshots,
        reminderConfig: {
          maxCount: DHL_REMINDER_MAX_COUNT,
          cycleHours: DHL_REMINDER_CYCLE_HOURS,
        },
      });
    } catch (e: any) {
      console.error('[DHL Intake] by-mission exception:', e);
      return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Helpers compartilhados entre /progress (parcial) e /submit (final)
  // ──────────────────────────────────────────────────────────────

  // Coerência do bloco CNH por agente: se algum campo de CNH foi preenchido,
  // exige TODOS os três (número, categoria, vencimento).
  const checkCnhBlockCoherence = (a: any, label: string): string | null => {
    const get = (k: string) => {
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const v = a?.[k] ?? a?.[camel];
      return v === undefined || v === null ? '' : String(v).trim();
    };
    const num = get('cnh');
    const cat = get('cnh_categoria');
    const val = get('cnh_vencimento');
    if (!num && !cat && !val) return null;
    if (!num) return `${label}: informe o número da CNH.`;
    if (!val) return `${label}: informe o Vencimento da CNH.`;
    if (!cat) return `${label}: informe a Categoria da CNH.`;
    return null;
  };

  // Persiste o escoltista em provider_escoltistas (upsert por CPF) e espelha
  // no cadastro principal `agents` (insert se não existe; patch "fill empty
  // only" se existe). Faz validação MÍNIMA — quem chama (handler) decide o
  // nível de exigência restante.
  const persistEscoltistaCore = async (
    sb: any,
    providerId: string,
    providerName: string | null,
    a: any,
    label: string,
  ): Promise<{ id: string; snap: any }> => {
    // Anti-IDOR: se veio com id, valida ownership
    let existingById: any = null;
    if (a.id) {
      const { data } = await sb.from('provider_escoltistas')
        .select('*')
        .eq('id', a.id)
        .eq('provider_id', providerId)
        .maybeSingle();
      if (!data) throw new Error(`${label}: registro selecionado não pertence ao fornecedor desta OS`);
      existingById = data;
    }

    // Coerência do bloco CNH (vale em qualquer fluxo)
    const cnhErr = checkCnhBlockCoherence(a, label);
    if (cnhErr) throw new Error(cnhErr);

    // Mínimo absoluto: nome e CPF válido (necessários para upsert por CPF)
    const nome = String(a.nome || '').trim();
    if (!nome) throw new Error(`${label}: Nome é obrigatório`);
    const cpfDigits = String(a.cpf || '').replace(/\D/g, '');
    if (cpfDigits.length !== 11) throw new Error(`${label}: CPF inválido`);

    const payload: any = {
      provider_id: providerId,
      nome,
      // Persiste CPF normalizado (somente dígitos) para evitar duplicidade
      // por formatação. Lookups abaixo também usam dígitos.
      cpf: cpfDigits,
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

    // Lookup por dígitos do CPF (formato canônico). Como fallback, também
    // checa o formato mascarado para detectar registros legados criados antes
    // da normalização.
    const cpfMasked = String(a.cpf || '');
    let existingByCpf: any = null;
    if (!existingById) {
      const byDigits = await sb.from('provider_escoltistas').select('*').eq('provider_id', providerId).eq('cpf', cpfDigits).maybeSingle();
      existingByCpf = byDigits.data || null;
      if (!existingByCpf && cpfMasked && cpfMasked !== cpfDigits) {
        const byMasked = await sb.from('provider_escoltistas').select('*').eq('provider_id', providerId).eq('cpf', cpfMasked).maybeSingle();
        existingByCpf = byMasked.data || null;
      }
    }
    const existing = existingById || existingByCpf;
    let resultId: string;
    let resultSnap: any;
    if (existing) {
      // "fill empty only": não sobrescreve dados já refinados pelo operacional.
      const patch: any = {};
      for (const k of Object.keys(payload)) {
        const cur = (existing as any)[k];
        const incoming = (payload as any)[k];
        if ((cur === null || cur === undefined || String(cur).trim() === '') && incoming) {
          patch[k] = incoming;
        }
      }
      if (Object.keys(patch).length > 0) {
        patch.updated_at = new Date().toISOString();
        await sb.from('provider_escoltistas').update(patch).eq('id', existing.id);
      }
      const { data: row } = await sb.from('provider_escoltistas').select('*').eq('id', existing.id).single();
      resultId = existing.id;
      resultSnap = row;
    } else {
      const { data: ins, error: insErr } = await sb.from('provider_escoltistas').insert([payload]).select().single();
      if (insErr) throw new Error('Erro ao salvar escoltista: ' + insErr.message);
      resultId = ins.id;
      resultSnap = ins;
    }

    // Espelhamento na tabela principal `agents` — best-effort (não bloqueia).
    try {
      const cols = 'id, name, cpf, rg, cnh, cnh_validity, cnv, cnv_validity, phone, provider, orgao_emissor, cnh_categoria, rua, numero, complemento, bairro, cidade, uf, cep, admissao';
      // Procura por CPF digits e, em fallback, pelo formato mascarado (legado).
      let agentRow: any = (await sb.from('agents').select(cols).eq('cpf', cpfDigits).maybeSingle()).data || null;
      if (!agentRow && cpfMasked && cpfMasked !== cpfDigits) {
        agentRow = (await sb.from('agents').select(cols).eq('cpf', cpfMasked).maybeSingle()).data || null;
      }

      const agentPayload: any = {
        name: payload.nome,
        cpf: payload.cpf,
        rg: payload.rg,
        cnh: payload.cnh,
        cnh_validity: payload.cnh_vencimento,
        cnv: payload.cnv_numero,
        cnv_validity: payload.cnv_validade,
        phone: payload.celular,
        orgao_emissor: payload.orgao_emissor,
        cnh_categoria: payload.cnh_categoria,
        rua: payload.rua,
        numero: payload.numero,
        complemento: payload.complemento,
        bairro: payload.bairro,
        cidade: payload.cidade,
        uf: payload.uf,
        cep: payload.cep,
        admissao: payload.admissao,
      };

      if (agentRow) {
        const patch: any = {};
        for (const k of Object.keys(agentPayload)) {
          const cur = (agentRow as any)[k];
          if ((cur === null || cur === undefined || String(cur).trim() === '') && agentPayload[k]) {
            patch[k] = agentPayload[k];
          }
        }
        if (Object.keys(patch).length > 0) {
          const { error: updErr } = await sb.from('agents').update(patch).eq('id', agentRow.id);
          if (updErr) console.error('[DHL Intake] falha ao espelhar em agents (update):', updErr.message);
        }
      } else {
        const insAgent: any = {
          ...agentPayload,
          provider: providerName || null,
          role: 'Vigilante',
          status: 'Ativo',
        };
        const { error: insAgentErr } = await sb.from('agents').insert([insAgent]);
        if (insAgentErr) console.error('[DHL Intake] falha ao espelhar em agents (insert):', insAgentErr.message);
      }
    } catch (mirrorErr: any) {
      console.error('[DHL Intake] exceção ao espelhar em agents:', mirrorErr?.message);
    }

    return { id: resultId, snap: resultSnap };
  };

  // Persiste o veículo em provider_intake_vehicles (upsert por placa do
  // fornecedor). Validação mínima: placa não vazia. Quem chama exige o resto.
  const persistVehicleCore = async (sb: any, providerId: string, v: any): Promise<{ id: string; snap: any }> => {
    if (v.id) {
      const { data } = await sb.from('provider_intake_vehicles')
        .select('*')
        .eq('id', v.id)
        .eq('provider_id', providerId)
        .maybeSingle();
      if (data) return { id: data.id, snap: data };
      throw new Error('Veículo: registro selecionado não pertence ao fornecedor desta OS');
    }
    const placa = String(v.placa || '').toUpperCase().replace(/\s/g, '');
    if (!placa) throw new Error('Veículo: Placa é obrigatória');
    const payload: any = {
      provider_id: providerId,
      placa,
      renavam: v.renavam || null,
      marca: v.marca || null,
      ano: v.ano || null,
      modelo: v.modelo || null,
      cor: v.cor || null,
      tecnologia: v.tecnologia || null,
      id_rastreador: v.idRastreador || v.id_rastreador || null,
      comunicacao: v.comunicacao || null,
    };
    const { data: existing } = await sb.from('provider_intake_vehicles').select('id').eq('provider_id', providerId).eq('placa', placa).maybeSingle();
    if (existing) {
      await sb.from('provider_intake_vehicles').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id);
      const { data: row } = await sb.from('provider_intake_vehicles').select('*').eq('id', existing.id).single();
      return { id: existing.id, snap: row };
    }
    const { data: ins, error: insErr } = await sb.from('provider_intake_vehicles').insert([payload]).select().single();
    if (insErr) throw new Error('Erro ao salvar veículo: ' + insErr.message);
    return { id: ins.id, snap: ins };
  };

  // ──────────────────────────────────────────────────────────────
  // GET /api/dhl/intake/public/:token/lookup-placa/:placa
  // Consulta WDAPI2 com o token do servidor (não expõe a chave ao cliente).
  // Aceita apenas chamadas vinculadas a um intake válido (não cancelado e
  // não expirado), evitando uso anônimo.
  // ──────────────────────────────────────────────────────────────
  // Rate limit em memória do proxy de placa — janela curta por token e por IP
  // para conter abuso (a WDAPI2 é paga). Limpa entradas antigas a cada chamada.
  const placaLookupHits = new Map<string, number[]>();
  const PLACA_LOOKUP_WINDOW_MS = 60_000;
  const PLACA_LOOKUP_MAX_PER_KEY = 12;
  const hitRateLimit = (key: string): boolean => {
    const now = Date.now();
    const arr = (placaLookupHits.get(key) || []).filter((t) => now - t < PLACA_LOOKUP_WINDOW_MS);
    arr.push(now);
    placaLookupHits.set(key, arr);
    // GC simples (evita crescimento ilimitado do Map)
    if (placaLookupHits.size > 500) {
      for (const [k, v] of placaLookupHits) {
        if (!v.length || now - v[v.length - 1] > PLACA_LOOKUP_WINDOW_MS) placaLookupHits.delete(k);
      }
    }
    return arr.length > PLACA_LOOKUP_MAX_PER_KEY;
  };
  app.get('/api/dhl/intake/public/:token/lookup-placa/:placa', async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || '');
      const placaRaw = String(req.params.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (placaRaw.length !== 7) return res.status(400).json({ error: 'Placa deve conter 7 caracteres.' });
      const ip = (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
      if (hitRateLimit(`tok:${token}`) || hitRateLimit(`ip:${ip}`)) {
        return res.status(429).json({ error: 'Muitas consultas em sequência — aguarde alguns segundos.' });
      }
      const sb = getSb();
      const { data: intake } = await sb.from('dhl_supplier_intakes')
        .select('status, expires_at')
        .eq('token', token)
        .maybeSingle();
      if (!intake) return res.status(404).json({ error: 'Link inválido' });
      if (intake.status === 'cancelado') return res.status(410).json({ error: 'Link cancelado' });
      if (intake.status === 'preenchido') return res.status(410).json({ error: 'Intake já finalizado.' });
      if (intake.expires_at && new Date(intake.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Link expirado' });
      }
      const wdToken = process.env.VITE_WDAPI_TOKEN || process.env.WDAPI_TOKEN || '';
      if (!wdToken) return res.status(503).json({ error: 'Consulta de placa indisponível no momento.' });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(`https://wdapi2.com.br/consulta/${placaRaw}/${wdToken}`, { signal: ctrl.signal as any });
        clearTimeout(timer);
        if (!r.ok) {
          if (r.status === 404) return res.status(404).json({ error: 'Placa não encontrada.' });
          return res.status(502).json({ error: 'Falha ao consultar placa.' });
        }
        const j: any = await r.json();
        // WDAPI2 retorna chaves como MARCA, MODELO, ano, anoModelo, cor, etc.
        const marca = String(j?.MARCA || j?.marca || '').trim();
        const modelo = String(j?.MODELO || j?.modelo || '').trim();
        const ano = String(j?.ano || j?.anoModelo || j?.ANO || j?.anoFabricacao || '').trim();
        const cor = String(j?.cor || j?.COR || '').trim();
        return res.json({ ok: true, marca, modelo, ano, cor });
      } catch (fetchErr: any) {
        clearTimeout(timer);
        if (fetchErr?.name === 'AbortError') return res.status(504).json({ error: 'Tempo esgotado ao consultar placa.' });
        return res.status(502).json({ error: 'Falha de conexão ao consultar placa.' });
      }
    } catch (e: any) {
      console.error('[DHL Intake] lookup-placa exception:', e);
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

      // Registra a abertura do link de forma ATÔMICA via RPC para evitar
      // lost-update em acessos concorrentes (read-modify-write em JS perderia
      // contagem). A função SQL incrementa open_count, atualiza last_opened_at
      // e preenche first_opened_at apenas na 1ª vez — tudo em uma única query.
      try {
        await sb.rpc('dhl_intake_register_open', { p_token: token });
      } catch (e: any) {
        console.error('[DHL Intake] erro ao registrar abertura do link:', e?.message);
      }

      const { data: mission } = await sb.from('missions').select('id, client, provider, origin, destination, start_time, dhl_se_number, status').eq('id', intake.mission_id).maybeSingle();

      const { data: escoltistasProv } = await sb.from('provider_escoltistas')
        .select('*')
        .eq('provider_id', intake.provider_id)
        .order('nome', { ascending: true });

      // Também busca agentes cadastrados na tabela principal `agents` vinculados
      // a este fornecedor (por nome), para que o lookup por CPF na página pública
      // encontre escoltistas já cadastrados no sistema TM Seg mesmo que ainda não
      // tenham passado por nenhum intake. Estes registros vêm SEM id (não
      // pertencem a provider_escoltistas), então no submit serão upserted lá.
      let escoltistasFromAgents: any[] = [];
      if (intake.provider_name) {
        const { data: agentsData } = await sb.from('agents')
          .select('name, cpf, rg, cnh, cnh_validity, cnv, cnv_validity, phone, status, provider, orgao_emissor, cnh_categoria, rua, numero, complemento, bairro, cidade, uf, cep, admissao')
          .eq('provider', intake.provider_name)
          .neq('status', 'Bloqueado / Ação Trabalhista')
          .order('name', { ascending: true });
        escoltistasFromAgents = (agentsData || []).map((a: any) => ({
          id: null,
          nome: a.name || '',
          cpf: a.cpf || '',
          rg: a.rg || '',
          orgao_emissor: a.orgao_emissor || '',
          cnh: a.cnh || '',
          cnh_categoria: a.cnh_categoria || '',
          cnh_vencimento: a.cnh_validity || '',
          cnv_numero: a.cnv || '',
          cnv_validade: a.cnv_validity || '',
          rua: a.rua || '',
          numero: a.numero || '',
          complemento: a.complemento || '',
          bairro: a.bairro || '',
          cidade: a.cidade || '',
          uf: a.uf || '',
          cep: a.cep || '',
          celular: a.phone || '',
          admissao: a.admissao || '',
        }));
      }

      // Dedup por CPF — provider_escoltistas tem prioridade
      const seenCpfs = new Set<string>();
      const escoltistas: any[] = [];
      for (const e of (escoltistasProv || [])) {
        const d = String(e.cpf || '').replace(/\D/g, '');
        if (d) seenCpfs.add(d);
        escoltistas.push(e);
      }
      for (const e of escoltistasFromAgents) {
        const d = String(e.cpf || '').replace(/\D/g, '');
        if (!d || seenCpfs.has(d)) continue;
        seenCpfs.add(d);
        escoltistas.push(e);
      }

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
        // Progresso parcial + snapshots já salvos, para retomar de onde parou
        // se o fornecedor reabrir o link sem ter finalizado.
        progress: {
          agent1: !!intake.progress_agent1,
          agent2: !!intake.progress_agent2,
          vehicle: !!intake.progress_vehicle,
          mirror: !!intake.progress_mirror,
        },
        snapshots: {
          agent1: intake.agent1_snapshot || null,
          agent2: intake.agent2_snapshot || null,
          vehicle: intake.vehicle_snapshot || null,
          mirrorProofUrl: intake.mirror_proof_url || null,
          mirrorProofFilename: intake.mirror_proof_filename || null,
        },
      });
    } catch (e: any) {
      console.error('[DHL Intake] public-get exception:', e);
      return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // POST /api/dhl/intake/public/:token/progress
  // body: {
  //   agent1?: bool, agent2?: bool, vehicle?: bool, mirror?: bool,
  //   agent1Data?: {...}, agent2Data?: {...}, vehicleData?: {...},
  //   mirrorData?: { dataUrl, filename }
  // }
  // Marca o progresso parcial e PERSISTE os dados de cada etapa à medida
  // que o fornecedor avança, espelhando o agente em `agents` e escrevendo
  // o nome em missions.agent1/agent2 para que o modal já apareça preenchido.
  // ──────────────────────────────────────────────────────────────
  app.post('/api/dhl/intake/public/:token/progress', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const body = (req.body || {}) as Record<string, any>;
      const sb = getSb();
      const { data: intake } = await sb.from('dhl_supplier_intakes')
        .select('id, mission_id, provider_id, provider_name, status, expires_at, agent1_snapshot, agent2_snapshot, vehicle_snapshot, mirror_proof_url, mirror_proof_filename, agent1_id, agent2_id, vehicle_id')
        .eq('token', token)
        .maybeSingle();
      if (!intake) return res.status(404).json({ error: 'Link inválido' });
      if (intake.status === 'cancelado') return res.status(410).json({ error: 'Link cancelado' });
      if (intake.status === 'preenchido') return res.json({ ok: true, locked: true });
      if (intake.expires_at && new Date(intake.expires_at) < new Date()) return res.status(410).json({ error: 'Link expirado' });

      const patch: Record<string, any> = {};
      const flagMap: Record<string, string> = {
        agent1: 'progress_agent1',
        agent2: 'progress_agent2',
        vehicle: 'progress_vehicle',
        mirror: 'progress_mirror',
      };
      for (const key of Object.keys(flagMap)) {
        if (body[key] === true) patch[flagMap[key]] = true;
      }

      // Persiste escoltista 1 / 2 — best-effort, falha não bloqueia o avanço
      const persistAgent = async (data: any, label: string, slot: 1 | 2) => {
        try {
          const r = await persistEscoltistaCore(sb, intake.provider_id, intake.provider_name || null, data, label);
          patch[slot === 1 ? 'agent1_id' : 'agent2_id'] = r.id;
          patch[slot === 1 ? 'agent1_snapshot' : 'agent2_snapshot'] = r.snap;
          // Atualiza missions.agent1 / agent2 (texto = nome) para o modal já
          // aparecer pré-preenchido e a chip do timeline ficar consistente.
          if (intake.mission_id && r.snap?.nome) {
            const missionPatch: any = {};
            missionPatch[slot === 1 ? 'agent1' : 'agent2'] = r.snap.nome;
            await sb.from('missions').update(missionPatch).eq('id', intake.mission_id);
          }
          return null;
        } catch (e: any) {
          return e?.message || `Erro ao salvar ${label}`;
        }
      };

      if (body.agent1Data) {
        const err = await persistAgent(body.agent1Data, 'Escoltista 1', 1);
        if (err) return res.status(400).json({ error: err });
      }
      if (body.agent2Data) {
        const err = await persistAgent(body.agent2Data, 'Escoltista 2', 2);
        if (err) return res.status(400).json({ error: err });
      }
      if (body.vehicleData) {
        try {
          const r = await persistVehicleCore(sb, intake.provider_id, body.vehicleData);
          patch.vehicle_id = r.id;
          patch.vehicle_snapshot = r.snap;
        } catch (e: any) {
          return res.status(400).json({ error: e?.message || 'Erro ao salvar veículo' });
        }
      }
      if (body.mirrorData && body.mirrorData.dataUrl) {
        try {
          const dataUrl: string = String(body.mirrorData.dataUrl);
          const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (!m) throw new Error('Print inválido — formato não reconhecido (envie PNG/JPG/PDF).');
          const contentType = m[1];
          const buf = Buffer.from(m[2], 'base64');
          if (buf.length > 8 * 1024 * 1024) throw new Error('Print muito grande — limite de 8 MB.');
          const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
          if (!allowed.includes(contentType.toLowerCase())) throw new Error('Tipo de arquivo não suportado — envie PNG, JPG, WEBP ou PDF.');
          const extMap: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };
          const ext = extMap[contentType.toLowerCase()] || 'bin';
          const safeOrig = String(body.mirrorData.filename || `espelhamento.${ext}`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
          const filePath = `dhl-mirror-proof/${intake.mission_id}/${Date.now()}_${safeOrig}`;
          const { error: upErr } = await sb.storage.from('mission-evidence').upload(filePath, buf, { contentType, upsert: false });
          if (upErr) throw new Error('Falha ao salvar o print: ' + upErr.message);
          const { data: urlData } = sb.storage.from('mission-evidence').getPublicUrl(filePath);
          patch.mirror_proof_url = urlData?.publicUrl || null;
          patch.mirror_proof_filename = safeOrig;
        } catch (e: any) {
          return res.status(400).json({ error: e?.message || 'Erro ao processar o print do espelhamento.' });
        }
      }

      if (Object.keys(patch).length === 0) return res.json({ ok: true, noop: true });
      const { error: upErr } = await sb.from('dhl_supplier_intakes').update(patch).eq('token', token);
      if (upErr) {
        console.error('[DHL Intake] progress update error:', upErr.message);
        return res.status(500).json({ error: upErr.message });
      }
      return res.json({
        ok: true,
        snapshots: {
          agent1: patch.agent1_snapshot ?? intake.agent1_snapshot ?? null,
          agent2: patch.agent2_snapshot ?? intake.agent2_snapshot ?? null,
          vehicle: patch.vehicle_snapshot ?? intake.vehicle_snapshot ?? null,
          mirrorProofUrl: patch.mirror_proof_url ?? intake.mirror_proof_url ?? null,
          mirrorProofFilename: patch.mirror_proof_filename ?? intake.mirror_proof_filename ?? null,
        },
      });
    } catch (e: any) {
      console.error('[DHL Intake] progress exception:', e);
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
      const { agent1, agent2, vehicle, mirrorProof, useExistingMirror } = req.body || {};
      if (!agent1 || !agent2 || !vehicle) {
        return res.status(400).json({ error: 'Preencha os 3 blocos: Escoltista 1, Escoltista 2 e Veículo.' });
      }

      const sb = getSb();
      const { data: intake } = await sb.from('dhl_supplier_intakes').select('*').eq('token', token).maybeSingle();
      if (!intake) return res.status(404).json({ error: 'Link inválido' });

      // Print pode vir agora OU ter sido salvo num /progress anterior.
      // Quando useExistingMirror=true, exigimos que o intake já tenha um mirror_proof_url.
      const hasExistingMirror = !!intake.mirror_proof_url;
      if (!useExistingMirror && (!mirrorProof || !mirrorProof.dataUrl)) {
        return res.status(400).json({ error: 'Anexe o print do espelhamento (comprovante de que foi realizado) antes de enviar.' });
      }
      if (useExistingMirror && !hasExistingMirror) {
        return res.status(400).json({ error: 'Print do espelhamento não localizado nesta sessão — anexe novamente.' });
      }
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

      // Validação estrita do submit final (campos obrigatórios completos).
      // O persistEscoltistaCore só exige nome+CPF; aqui exigimos o restante.
      const validateAgentForSubmit = (a: any, label: string): string | null => {
        const required: [string, string][] = [
          ['nome', 'Nome'], ['cpf', 'CPF'], ['rg', 'RG'], ['orgao_emissor', 'Órgão emis./UF'],
          ['cnv_numero', 'CNV Número'], ['cnv_validade', 'Validade CNV'],
          ['celular', 'Celular'],
          ['rua', 'Rua'], ['numero', 'Número'], ['bairro', 'Bairro'],
          ['cidade', 'Cidade'], ['uf', 'UF'], ['cep', 'CEP'],
          ['admissao', 'Admissão'],
        ];
        const camelOf = (snake: string) => snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const pick = (k: string) => {
          const camel = camelOf(k);
          const v = (a as any)[k] ?? (a as any)[camel];
          return v === undefined || v === null ? '' : String(v).trim();
        };
        for (const [k, lbl] of required) {
          if (!pick(k)) return `${label}: ${lbl} é obrigatório`;
        }
        return null;
      };
      const validateVehicleForSubmit = (v: any): string | null => {
        if (v?.id) return null;
        const vReq: [string, string][] = [
          ['placa', 'Placa'], ['marca', 'Marca'], ['modelo', 'Modelo'],
          ['tecnologia', 'Tecnologia'],
        ];
        for (const [k, lbl] of vReq) {
          if (!v[k] || String(v[k]).trim() === '') return `Veículo: ${lbl} é obrigatório`;
        }
        return null;
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

      // Regra cruzada de CNH: PELO MENOS UM dos escoltistas precisa ter CNH e
      // Vencimento CNH preenchidos. Bloqueia somente quando AMBOS estiverem sem.
      const cnhStr = (a: any, k: string) => {
        const v = a?.[k] ?? a?.[k.replace(/_([a-z])/g, (_: any, c: string) => c.toUpperCase())];
        return v === undefined || v === null ? '' : String(v).trim();
      };
      const a1HasCnh = !!cnhStr(agent1, 'cnh') && !!cnhStr(agent1, 'cnh_vencimento');
      const a2HasCnh = !!cnhStr(agent2, 'cnh') && !!cnhStr(agent2, 'cnh_vencimento');
      if (!a1HasCnh && !a2HasCnh) {
        return res.status(400).json({
          error: 'Pelo menos UM dos escoltistas precisa ter CNH e Vencimento da CNH preenchidos.',
        });
      }
      // Coerência por escoltista: se preencheu qualquer campo do bloco CNH,
      // tem que preencher todos (número, categoria, vencimento).
      const checkCnhBlock = (a: any, label: string): string | null => {
        const num = cnhStr(a, 'cnh');
        const cat = cnhStr(a, 'cnh_categoria');
        const val = cnhStr(a, 'cnh_vencimento');
        if (!num && !cat && !val) return null;
        if (!num) return `${label}: informe o número da CNH.`;
        if (!val) return `${label}: informe o Vencimento da CNH.`;
        if (!cat) return `${label}: informe a Categoria da CNH.`;
        return null;
      };
      const cnhErr = checkCnhBlock(agent1, 'Escoltista 1') || checkCnhBlock(agent2, 'Escoltista 2');
      if (cnhErr) return res.status(400).json({ error: cnhErr });

      // Validação completa dos blocos para o submit FINAL (campos obrigatórios).
      const v1Err = validateAgentForSubmit(agent1, 'Escoltista 1');
      if (v1Err) return res.status(400).json({ error: v1Err });
      const v2Err = validateAgentForSubmit(agent2, 'Escoltista 2');
      if (v2Err) return res.status(400).json({ error: v2Err });
      const vvErr = validateVehicleForSubmit(vehicle);
      if (vvErr) return res.status(400).json({ error: vvErr });

      let a1, a2, vh;
      try {
        a1 = await persistEscoltistaCore(sb, providerId, intake.provider_name || null, agent1, 'Escoltista 1');
        a2 = await persistEscoltistaCore(sb, providerId, intake.provider_name || null, agent2, 'Escoltista 2');
        vh = await persistVehicleCore(sb, providerId, vehicle);
      } catch (e: any) {
        return res.status(400).json({ error: e?.message || 'Dados inválidos' });
      }
      // Espelha o nome dos agentes em missions.agent1/agent2 (mesmo padrão do /progress)
      try {
        if (intake.mission_id) {
          await sb.from('missions').update({
            agent1: a1.snap?.nome || null,
            agent2: a2.snap?.nome || null,
          }).eq('id', intake.mission_id);
        }
      } catch (e: any) {
        console.error('[DHL Intake] falha ao espelhar agent1/agent2 em missions:', e?.message);
      }
      // Pós-persistência: garante que se um foi novo e outro selecionado, IDs ainda diferem
      if (a1.id === a2.id) {
        return res.status(400).json({ error: 'Escoltista 1 e Escoltista 2 não podem ser o mesmo registro.' });
      }

      // Upload do print do espelhamento → bucket mission-evidence/dhl-mirror-proof/<missionId>/
      // Se o fornecedor já enviou o print numa etapa anterior (/progress) e
      // marcou useExistingMirror, reutilizamos o que está salvo no intake.
      let mirrorProofUrl: string | null = null;
      let mirrorProofFilename: string | null = null;
      if (useExistingMirror) {
        mirrorProofUrl = intake.mirror_proof_url || null;
        mirrorProofFilename = intake.mirror_proof_filename || null;
      } else try {
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
