import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import webpush from "web-push";
import { calculateMissionFinancials } from "../lib/financialUtils";
import fs from "fs";
import path from "path";
import pg from "pg";
import { sendMissionEmailToClient, sendMissionEmailToProvider, sendMissionResendToClient, sendMirroringEvidenceEmail, sendMissionChangeNotificationToClient, sendMissionChangeNotificationToProvider, sendWelcomeEmail, sendTestEmail, sendVerificationCodeEmail, sendPasswordResetEmail, sendBillingEmail, sendLegalReportEmail, sendPendingInfoReport, sendApprovalPendingReport, sendCancelledMissingInfoEmail, sendDailyMissingInfoReport, sendStuckNfsReport } from "./emailService";
import { findOrCreateCustomer, createPayment, getPayment, getPaymentPixQrCode, getPaymentBankSlip, listPayments, deletePayment, mapAsaasStatus, isAsaasConfigured, getAsaasCompanies, scheduleInvoice, listMunicipalServices, getInvoiceByPayment, getAllBalances } from "./asaasService";

const resend = new Resend(process.env.RESEND_API_KEY);

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:contato@grupotmseg.com.br', VAPID_PUBLIC, VAPID_PRIVATE);
}

// Helpers de persistência de push subscriptions (Supabase) — em memória apenas como cache best-effort
const pushSubsCache = new Map<string, any>();

async function pushSubsLoadAll(): Promise<Array<{ key: string; subscription: any }>> {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    if (!url || !key) return Array.from(pushSubsCache.entries()).map(([k, v]) => ({ key: k, subscription: v }));
    const sb = createClient(url, key);
    const { data, error } = await sb.from('push_subscriptions').select('user_key, subscription');
    if (error || !data) return Array.from(pushSubsCache.entries()).map(([k, v]) => ({ key: k, subscription: v }));
    pushSubsCache.clear();
    for (const row of data) pushSubsCache.set(row.user_key, row.subscription);
    return data.map((r: any) => ({ key: r.user_key, subscription: r.subscription }));
  } catch {
    return Array.from(pushSubsCache.entries()).map(([k, v]) => ({ key: k, subscription: v }));
  }
}

async function pushSubsUpsert(userKey: string, subscription: any): Promise<void> {
  pushSubsCache.set(userKey, subscription);
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    if (!url || !key) return;
    const sb = createClient(url, key);
    await sb.from('push_subscriptions').upsert({
      user_key: userKey,
      subscription,
      endpoint: subscription?.endpoint || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_key' });
  } catch (e: any) {
    console.warn('[Push] Falha ao persistir subscription:', e?.message);
  }
}

async function pushSubsDelete(userKey: string): Promise<void> {
  pushSubsCache.delete(userKey);
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    if (!url || !key) return;
    const sb = createClient(url, key);
    await sb.from('push_subscriptions').delete().eq('user_key', userKey);
  } catch (e: any) {
    console.warn('[Push] Falha ao remover subscription:', e?.message);
  }
}

const verificationCodes = new Map<string, { code: string; expiresAt: number; email: string }>();

// Configuração Z-API server-side (não exposta ao frontend)
const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID || process.env.VITE_ZAPI_INSTANCE_ID || '';
const ZAPI_TOKEN = process.env.ZAPI_TOKEN || process.env.VITE_ZAPI_TOKEN || '';
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || process.env.VITE_ZAPI_CLIENT_TOKEN || '';
const zapiBase = () => `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

function requireAuth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '') || req.headers['x-auth-token'] as string;

  if (!token) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  (req as any).authToken = token;
  next();
}

const roleCache = new Map<string, { role: string; expiresAt: number }>();
const ROLE_CACHE_TTL = 5 * 60 * 1000;

function extractUserIdFromToken(token: string): string | null {
  const match = token.match(/(?:tmseg-token|impersonation-token)-([a-f0-9-]+)-\d+/);
  return match ? match[1] : null;
}

type ResolvedPrincipal = { id: string; name: string | null; email: string | null; role: string };
const principalCache = new Map<string, { principal: ResolvedPrincipal; expiresAt: number }>();

async function resolvePrincipal(token: string): Promise<ResolvedPrincipal | null> {
  const cached = principalCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.principal;

  const userId = extractUserIdFromToken(token);
  if (!userId) return null;

  try {
    const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    const sb = createClient(sbUrl, sbKey);
    const { data } = await sb.from('system_users').select('id, name, email, status, profiles:profile_id ( name )').eq('id', userId).single();
    if (!data || data.status !== 'Ativo') return null;
    const principal: ResolvedPrincipal = {
      id: data.id,
      name: (data as any).name || null,
      email: (data as any).email || null,
      role: ((data.profiles as any)?.name || '').toLowerCase(),
    };
    principalCache.set(token, { principal, expiresAt: Date.now() + ROLE_CACHE_TTL });
    // Mantém roleCache em sync para compatibilidade com código legado.
    roleCache.set(token, { role: principal.role, expiresAt: Date.now() + ROLE_CACHE_TTL });
    return principal;
  } catch {
    return null;
  }
}

async function resolveUserRole(token: string): Promise<string | null> {
  const cached = roleCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.role;
  const principal = await resolvePrincipal(token);
  return principal?.role || null;
}

function requireRole(...allowedRoles: string[]) {
  const normalized = allowedRoles.map(r => r.toLowerCase());
  return async (req: Request, res: Response, next: Function) => {
    const token = (req as any).authToken;
    if (!token) return res.status(401).json({ error: 'Não autorizado' });

    const principal = await resolvePrincipal(token);
    if (!principal) return res.status(403).json({ error: 'Permissão negada — usuário inativo ou não encontrado' });

    if (normalized.includes(principal.role) || normalized.includes('*')) {
      (req as any).userRole = principal.role;
      // Popula req.user/req.auth para auditoria (preferências, ações administrativas).
      (req as any).user = principal;
      (req as any).auth = principal;
      return next();
    }

    return res.status(403).json({ error: `Permissão negada — requer: ${allowedRoles.join(', ')}` });
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  console.log('[Migration] Colunas já existem no Supabase — nenhuma migração local necessária.');

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now(), uptime: process.uptime() });
  });

  app.post('/api/recalculate-all', requireAuth, requireRole('diretoria', 'administrador', 'ceo', 'financeiro'), async (req: Request, res: Response) => {
    try {
      const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      const sb = createClient(sbUrl, sbKey);

      let allMissions: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await sb.from('missions')
          .select('*')
          .eq('billing_approved', false)
          .gt('revenue_value', 0)
          .not('status', 'in', '("Cancelada","Recusada")')
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        allMissions = allMissions.concat(data);
        if (data.length < 1000) break;
        from += 1000;
      }

      const { data: clientTablesRaw } = await sb.from('client_price_tables').select('*');
      const { data: providerTablesRaw } = await sb.from('provider_cost_tables').select('*');
      const { data: clientsRaw } = await sb.from('clients').select('*');

      const clientTables = (clientTablesRaw || []).map((t: any) => ({
        id: String(t.id), client: t.client, operation_type: t.operation_type,
        activation_fee: t.activation_fee || t.activation_price || 0,
        franchise_hours: t.franchise_hours || t.hour_franchise || 0,
        franchise_km: t.franchise_km || t.km_franchise || 0,
        price_per_extra_km: t.price_per_extra_km || t.extra_km_price || 0,
        price_per_extra_hour: t.price_per_extra_hour || t.extra_hour_price || 0,
      }));
      const providerTables = (providerTablesRaw || []).map((t: any) => ({
        id: String(t.id), provider: t.provider, operation_type: t.operation_type,
        activation_cost: t.activation_cost || t.activation_price || 0,
        franchise_hours: t.franchise_hours || t.hour_franchise || 0,
        franchise_km: t.franchise_km || t.km_franchise || 0,
        cost_per_extra_km: t.cost_per_extra_km || t.extra_km_price || 0,
        cost_per_extra_hour: t.cost_per_extra_hour || t.extra_hour_price || 0,
        cancellation_fee: t.cancellation_fee || 0,
      }));

      const r2 = (v: number) => Math.round(v * 100) / 100;
      let updated = 0, skipped = 0, errors = 0;
      const details: any[] = [];

      for (const m of allMissions) {
        try {
          const clientMatch = (clientsRaw || []).find((c: any) => c.name === m.client || c.trading_name === m.client);
          const fd = calculateMissionFinancials(m, clientTables, providerTables, clientMatch);

          if (!fd || fd.client.serviceTotal <= 0) { skipped++; continue; }

          const calcRev = r2(fd.client.serviceTotal);
          const calcCost = r2(m.is_same_os ? 0 : fd.provider.serviceTotal);
          const savedRev = r2(m.revenue_value || 0);
          const savedCost = r2(m.cost_value || 0);
          const revDiff = Math.abs(calcRev - savedRev);
          const costDiff = Math.abs(calcCost - savedCost);

          const calcToll = r2(fd.tollValue || 0);
          const oldToll = r2(m.toll_value || 0);
          const tollDiff = Math.abs(calcToll - oldToll);

          if (revDiff > 1 || costDiff > 1 || tollDiff > 0.5) {
            const tollProv = m.is_same_os ? 0 : calcToll;
            await sb.from('missions').update({
              revenue_value: calcRev,
              cost_value: calcCost,
              toll_value: calcToll,
              toll_value_provider: r2(tollProv),
              last_update: new Date().toISOString()
            }).eq('id', m.id);
            updated++;
            details.push({ id: m.id, client: m.client, oldRev: savedRev, newRev: calcRev, oldCost: savedCost, newCost: calcCost, oldToll: oldToll, newToll: calcToll, revDiff: r2(revDiff), costDiff: r2(costDiff) });
          } else {
            skipped++;
          }
        } catch (e: any) {
          errors++;
        }
      }

      await sb.from('system_logs').insert([{
        user_name: (req as any).userName || 'Sistema',
        action_type: 'BULK_RECALCULATE',
        entity: 'Mission',
        entity_id: 'ALL',
        details: JSON.stringify({ total: allMissions.length, updated, skipped, errors, timestamp: new Date().toISOString() })
      }]);

      res.json({ success: true, total: allMissions.length, updated, skipped, errors, details: details.slice(0, 50) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/missions/:id/cancel-missing-info-email', requireAuth, async (req: Request, res: Response) => {
    try {
      const missionId = req.params.id;
      const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      const sb = createClient(sbUrl, sbKey);

      const { data: mission } = await sb.from('missions').select('*').eq('id', missionId).single();
      if (!mission) return res.status(404).json({ error: 'Missão não encontrada' });

      const missingFields: string[] = [];
      const endKm = Number(mission.end_km) || 0;
      const startKm = Number(mission.start_km) || 0;
      const endTime = mission.end_time || mission.endTime || '';
      const startTime = mission.start_time || mission.startTime || '';

      if (!endKm || endKm <= 0) missingFields.push('KM Final não informado');
      if (!endTime) missingFields.push('Hora Final não informada');
      if (!startKm || startKm <= 0) missingFields.push('KM Inicial não informado');
      if (!startTime) missingFields.push('Hora Inicial não informada');
      if (!mission.agent1 || mission.agent1 === '---' || mission.agent1 === 'N/A') missingFields.push('Agente 1 não informado');
      if (!mission.provider || mission.provider === '---') missingFields.push('Fornecedor não informado');

      if (missingFields.length === 0) {
        return res.json({ success: true, sent: false, reason: 'Todos os dados cruciais estão preenchidos' });
      }

      const recipients = 'barbara@grupotmseg.com.br, michelle@grupotmseg.com.br, thiago@grupotmseg.com.br, daniel@grupotmseg.com.br';
      const sent = await sendCancelledMissingInfoEmail(recipients, mission, missingFields);

      res.json({ success: true, sent, missingFields });
    } catch (e: any) {
      console.error('[Cancel Email]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/missions/:id/loss-alert-email', requireAuth, async (req: Request, res: Response) => {
    try {
      const { missionId, client, provider, origin, destination, revenueTotal, costTotal, toll, tollProvider, resultado, userName } = req.body;

      const LOSS_ALERT_EMAILS = 'barbara@grupotmseg.com.br, thiago@grupotmseg.com.br';
      const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const r2 = (v: number) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><style>
  body { margin:0; padding:0; background:#f4f4f4; font-family: 'Segoe UI', Arial, sans-serif; }
  .container { max-width:600px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); }
  .header { background:#1a1a1a; padding:28px 32px; text-align:center; }
  .header h1 { color:#fff; font-size:22px; margin:0 0 4px; }
  .header .accent { color:#c0392b; font-weight:700; }
  .body-content { padding:32px; color:#333; line-height:1.7; font-size:14px; }
  .info-table { width:100%; border-collapse:collapse; margin:16px 0; }
  .info-table td { padding:10px 14px; border-bottom:1px solid #eee; }
  .info-table td:first-child { font-weight:600; color:#1a1a1a; width:40%; }
  .loss-box { background:#fdf2f2; border:2px solid #c0392b; padding:16px 20px; margin:16px 0; border-radius:8px; text-align:center; }
  .loss-box .amount { font-size:28px; font-weight:800; color:#c0392b; }
  .footer { background:#1a1a1a; padding:20px; text-align:center; border-top:3px solid #c0392b; }
  .footer p { color:#999; font-size:12px; margin:4px 0; }
</style></head><body>
<div class="container">
  <div class="header"><h1>GRUPO <span class="accent">TM SEG</span></h1></div>
  <div class="body-content">
    <h2 style="color:#c0392b;">⚠️ ALERTA: OS com Prejuízo Detectado</h2>
    <p>A OS abaixo foi salva com <strong>resultado negativo</strong> e precisa de análise.</p>
    <div class="loss-box">
      <p style="margin:0 0 4px; font-size:13px; color:#666;">RESULTADO OPERACIONAL</p>
      <div class="amount">-R$ ${r2(Math.abs(resultado))}</div>
    </div>
    <table class="info-table">
      <tr><td>OS</td><td><strong>${missionId}</strong></td></tr>
      <tr><td>Cliente</td><td>${client || '—'}</td></tr>
      <tr><td>Fornecedor</td><td>${provider || '—'}</td></tr>
      <tr><td>Origem</td><td>${origin || '—'}</td></tr>
      <tr><td>Destino</td><td>${destination || '—'}</td></tr>
      <tr><td>Receita (Serviço)</td><td>R$ ${r2(revenueTotal)}</td></tr>
      <tr><td>Custo Fornecedor</td><td>R$ ${r2(costTotal)}</td></tr>
      <tr><td>Pedágio Cliente</td><td>R$ ${r2(toll)}</td></tr>
      <tr><td>Pedágio Fornecedor</td><td>R$ ${r2(tollProvider)}</td></tr>
      <tr><td>Salvo por</td><td><strong>${userName || '—'}</strong></td></tr>
      <tr><td>Data/Hora</td><td>${now}</td></tr>
    </table>
    <p style="font-size:12px; color:#999; margin-top:24px;">Este alerta é gerado automaticamente pelo sistema TMSEGo.</p>
  </div>
  <div class="footer"><p>Grupo TM SEG — Sistema TMSEGo</p></div>
</div></body></html>`;

      const { transporter } = await import('./emailService');
      const SMTP_FROM = `"Grupo TM SEG" <adm@grupotmseg.com.br>`;
      await transporter.sendMail({
        from: SMTP_FROM,
        to: LOSS_ALERT_EMAILS,
        subject: `⚠️ PREJUÍZO: OS ${missionId} — Resultado -R$ ${r2(Math.abs(resultado))}`,
        html,
      });
      console.log(`[Loss Alert] Email enviado → ${LOSS_ALERT_EMAILS} | OS: ${missionId} | Prejuízo: -R$ ${r2(Math.abs(resultado))}`);
      res.json({ success: true, sent: true });
    } catch (e: any) {
      console.error('[Loss Alert]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/unify-client-names', requireAuth, requireRole('diretoria', 'administrador'), async (req: Request, res: Response) => {
    try {
      const { correctName, variations, dryRun = true } = req.body;
      if (!correctName || !variations || !Array.isArray(variations) || variations.length === 0) {
        return res.status(400).json({ error: 'correctName (string) e variations (string[]) são obrigatórios' });
      }

      const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      const sb = createClient(sbUrl, sbKey);

      const tables = [
        { table: 'missions', column: 'client' },
        { table: 'client_price_tables', column: 'client' },
        { table: 'client_routes', column: 'client' },
      ];

      const report: any[] = [];
      let totalUpdated = 0;

      for (const variation of variations) {
        const trimmed = variation.trim();
        if (trimmed === correctName) continue;

        for (const { table, column } of tables) {
          const { data: matches, error: countErr } = await sb
            .from(table)
            .select('id', { count: 'exact' })
            .ilike(column, trimmed);

          const count = matches?.length || 0;
          if (count === 0) continue;

          if (!dryRun) {
            const { error: updateErr } = await sb
              .from(table)
              .update({ [column]: correctName, last_update: new Date().toISOString() })
              .ilike(column, trimmed);

            if (updateErr) {
              report.push({ table, variation: trimmed, count, status: 'ERRO', error: updateErr.message });
              continue;
            }
          }

          report.push({ table, variation: trimmed, count, status: dryRun ? 'SIMULAÇÃO' : 'ATUALIZADO' });
          totalUpdated += count;
        }
      }

      if (!dryRun) {
        await sb.from('audit_logs').insert([{
          user_id: (req as any).user?.id || 'system',
          action_type: 'UNIFY_CLIENT_NAMES',
          entity: 'Client',
          entity_id: correctName,
          details: JSON.stringify({ correctName, variations, totalUpdated, report, timestamp: new Date().toISOString() })
        }]);
      }

      res.json({
        success: true,
        dryRun,
        correctName,
        totalUpdated,
        report,
        message: dryRun
          ? `Simulação: ${totalUpdated} registros seriam atualizados. Envie dryRun: false para executar.`
          : `Unificação concluída: ${totalUpdated} registros atualizados para "${correctName}".`
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/sw.js', (_req: Request, res: Response) => {
    const swPath = path.resolve(process.cwd(), 'client', 'public', 'sw.js');
    if (fs.existsSync(swPath)) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Service-Worker-Allowed', '/');
      // no-store garante que o navegador SEMPRE pede o sw.js novo, e o
      // timestamp injetado abaixo garante que os BYTES do arquivo mudam a
      // cada deploy/restart — disparando o ciclo de update do Service Worker.
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const original = fs.readFileSync(swPath, 'utf-8');
      const stamp = `// build: ${process.env.REPLIT_DEPLOYMENT_ID || ''}-${Date.now()}\n`;
      res.send(stamp + original);
    } else {
      res.status(404).send('Not found');
    }
  });

  app.get('/manifest.json', (_req: Request, res: Response) => {
    const manifestPath = path.resolve(process.cwd(), 'client', 'public', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      res.setHeader('Content-Type', 'application/manifest+json');
      res.sendFile(manifestPath);
    } else {
      res.status(404).send('Not found');
    }
  });

  app.get('/api/push/vapid-key', (_req: Request, res: Response) => {
    res.json({ publicKey: VAPID_PUBLIC });
  });

  app.post('/api/push/subscribe', async (req: Request, res: Response) => {
    try {
      const { subscription, userId } = req.body;
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Subscription inválida' });
      }
      const key = String(userId || subscription.endpoint);
      await pushSubsUpsert(key, subscription);
      console.log(`[Push] Subscription registrada: ${key.substring(0, 30)}... (cache: ${pushSubsCache.size})`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/push/unsubscribe', async (req: Request, res: Response) => {
    try {
      const { userId, endpoint } = req.body;
      const key = String(userId || endpoint || '');
      if (key) await pushSubsDelete(key);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/push/send', requireAuth, async (req: Request, res: Response) => {
    try {
      const { title, body, tag } = req.body;
      if (!title) return res.status(400).json({ error: 'Título obrigatório' });

      const payload = JSON.stringify({ title, body: body || '', tag: tag || 'tmseg', icon: '/favicon.png' });
      const subs = await pushSubsLoadAll();
      const results: any[] = [];
      const failed: string[] = [];

      for (const { key, subscription } of subs) {
        try {
          await webpush.sendNotification(subscription, payload);
          results.push({ key: key.substring(0, 20), status: 'ok' });
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await pushSubsDelete(key);
            failed.push(key.substring(0, 20));
          } else {
            results.push({ key: key.substring(0, 20), status: 'error', msg: err.message });
          }
        }
      }

      res.json({ sent: results.length, failed: failed.length, total: subs.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ───────────── WhatsApp (Z-API) — proxy para não expor credenciais ao browser ─────────────
  app.get('/api/whatsapp/groups', requireAuth, async (_req: Request, res: Response) => {
    try {
      if (!ZAPI_INSTANCE || !ZAPI_TOKEN) return res.status(503).json({ error: 'Z-API não configurada' });
      const headers: any = { 'Content-Type': 'application/json' };
      if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
      const r = await fetch(`${zapiBase()}/groups`, { method: 'GET', headers });
      const text = await r.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!r.ok) return res.status(r.status).json({ error: 'Falha Z-API', detail: data });
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/whatsapp/send', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!ZAPI_INSTANCE || !ZAPI_TOKEN) return res.status(503).json({ error: 'Z-API não configurada' });
      const { phone, message } = req.body || {};
      if (!phone || !message) return res.status(400).json({ error: 'phone e message são obrigatórios' });
      const headers: any = { 'Content-Type': 'application/json' };
      if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
      const r = await fetch(`${zapiBase()}/send-text`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone, message }),
      });
      const text = await r.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!r.ok) return res.status(r.status).json({ error: 'Falha Z-API', detail: data });
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/push/test', async (req: Request, res: Response) => {
    try {
      const { subscription } = req.body;
      if (!subscription) return res.status(400).json({ error: 'Subscription obrigatória' });

      const payload = JSON.stringify({
        title: 'OS - Criada Nº TESTE-001 - Cliente: EXEMPLO LTDA',
        body: 'Origem: São Paulo - SP → Destino: Campinas - SP\nFornecedor: ATIVA SEGURANÇA',
        tag: `test-${Date.now()}`,
        icon: '/favicon.png'
      });

      await webpush.sendNotification(subscription, payload);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message, statusCode: e.statusCode });
    }
  });

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  );

  (async () => {
    const realtimeTables = [
      'missions', 'clients', 'providers', 'vehicles', 'agents', 'profiles',
      'client_price_tables', 'client_routes', 'client_vehicles', 'provider_cost_tables',
      'financial_transactions', 'financial_accounts', 'financial_categories', 'financial_invoices',
      'quotes', 'commercial_proposals', 'support_agents', 'time_clock',
      'vehicle_technologies', 'system_users', 'whatsapp_messages', 'system_logs', 'mission_logs'
    ];
    try {
      const tableList = realtimeTables.map(t => `public.${t}`).join(', ');
      await supabase.rpc('exec_sql', { sql: `ALTER PUBLICATION supabase_realtime ADD TABLE ${tableList};` });
      console.log('[Realtime] Publicação habilitada para', realtimeTables.length, 'tabelas');
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('already member') || msg.includes('already exists')) {
        console.log('[Realtime] Tabelas já estão na publicação supabase_realtime');
      } else {
        console.warn('[Realtime] Publicação não configurada (pode requerer permissão admin):', msg.substring(0, 120));
      }
    }
  })();

  async function findClientEmail(clientName: string): Promise<{ email: string; data: any }> {
    const { data: byName } = await supabase.from('clients').select('operational_email, email, trading_name, name, status').eq('name', clientName);
    let clientData = byName?.find(c => c.status === 'Ativo') || byName?.[0] || null;
    if (!clientData) {
      const { data: byTrading } = await supabase.from('clients').select('operational_email, email, trading_name, name, status').eq('trading_name', clientName);
      clientData = byTrading?.find(c => c.status === 'Ativo') || byTrading?.[0] || null;
    }
    if (!clientData) {
      const { data: byIlike } = await supabase.from('clients').select('operational_email, email, trading_name, name, status').ilike('trading_name', clientName);
      clientData = byIlike?.find(c => c.status === 'Ativo') || byIlike?.[0] || null;
    }
    const email = clientData?.operational_email?.trim() || clientData?.email?.trim() || '';
    return { email, data: clientData };
  }

  async function findProviderEmail(providerName: string): Promise<{ email: string; data: any }> {
    const { data: byName } = await supabase.from('providers').select('os_email, email, trading_name, name, status').eq('name', providerName);
    let provData = byName?.find(p => p.status === 'Ativo') || byName?.[0] || null;
    if (!provData) {
      const { data: byTrading } = await supabase.from('providers').select('os_email, email, trading_name, name, status').eq('trading_name', providerName);
      provData = byTrading?.find(p => p.status === 'Ativo') || byTrading?.[0] || null;
    }
    if (!provData) {
      const { data: byIlike } = await supabase.from('providers').select('os_email, email, trading_name, name, status').ilike('trading_name', providerName);
      provData = byIlike?.find(p => p.status === 'Ativo') || byIlike?.[0] || null;
    }
    const email = provData?.os_email?.trim() || provData?.email?.trim() || '';
    return { email, data: provData };
  }

  // Supabase Realtime listener for push notifications
  const supabaseForPush = supabase;

  supabaseForPush
    .channel('server-push-missions')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'missions'
    }, async (payload: any) => {
      const mission = payload.new;
      if (!mission) return;

      const osId = mission.id || 'N/A';
      const client = mission.client || 'N/A';
      const origin = mission.origin || 'N/A';
      const destination = mission.destination || 'N/A';
      const provider = mission.provider || 'N/A';
      const isAccident = (mission.current_location || '').includes('ACIDENTE');

      const title = isAccident
        ? `🚨 ACIDENTE - OS Nº ${osId} - ${client}`
        : `OS - Criada Nº ${osId} - Cliente: ${client}`;
      const body = `Origem: ${origin} → Destino: ${destination}\nFornecedor: ${provider}`;

      const subs = await pushSubsLoadAll();
      if (subs.length > 0) {
        const pushPayload = JSON.stringify({ title, body, tag: `mission-${osId}`, icon: '/favicon.png' });
        for (const { key, subscription } of subs) {
          try {
            await webpush.sendNotification(subscription, pushPayload);
          } catch (err: any) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              await pushSubsDelete(key);
            }
          }
        }
        console.log(`[Push] Notificação enviada para ${subs.length} dispositivos: OS ${osId}`);
      }

    })
    .subscribe();

  // ── Email API Endpoints ──
  app.post("/api/email/test", requireAuth, async (req: Request, res: Response) => {
    try {
      const { to } = req.body;
      if (!to) return res.status(400).json({ error: 'Campo "to" obrigatório' });
      const success = await sendTestEmail(to);
      res.json({ success, message: success ? 'E-mail de teste enviado!' : 'Falha ao enviar e-mail' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/test-mission-emails", requireAuth, async (req: Request, res: Response) => {
    try {
      const { to } = req.body;
      if (!to) return res.status(400).json({ error: 'Campo "to" obrigatório' });

      const fakeMission = {
        id: 'GTM-2026-0001',
        client: 'CEVA Logística',
        provider: 'MACOR Segurança',
        origin: 'São Paulo, SP — CD Guarulhos',
        destination: 'Campinas, SP — CD Hortolândia',
        start_time: new Date().toISOString(),
        mission_type: 'Escolta Caracterizada',
        driver_name: 'José Carlos da Silva',
        driver_phone: '(11) 99999-8888',
        client_vehicle: 3,
        revenue_value: 1850.00,
        cost_value: 1200.00,
      };

      const clientResult = await sendMissionEmailToClient(fakeMission, to, 'ABC-1D23');
      const clientOk = typeof clientResult === 'object' ? clientResult.success : clientResult;
      const providerOk = await sendMissionEmailToProvider(fakeMission, to, 'ABC-1D23');

      res.json({
        clientEmail: { success: clientOk, message: clientOk ? 'E-mail CLIENTE enviado!' : 'Falha no e-mail do cliente' },
        providerEmail: { success: providerOk, message: providerOk ? 'E-mail FORNECEDOR enviado!' : 'Falha no e-mail do fornecedor' },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/welcome", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, email, password, userType, profileName, verificationCode } = req.body;
      if (!name || !email || !password) return res.status(400).json({ error: 'Campos name, email e password são obrigatórios' });
      const systemUrl = process.env.SYSTEM_URL || `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'app.grupotmseg.com.br'}`;
      const success = await sendWelcomeEmail({ name, email, password, userType: userType || 'internal', profileName }, systemUrl, verificationCode);
      res.json({ success, message: success ? 'E-mail de boas-vindas enviado!' : 'Falha ao enviar e-mail' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/password-reset/request", async (req: Request, res: Response) => {
    try {
      const { userId, senderName } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

      const { data: userData, error: userErr } = await supabase.from('system_users').select('id, name, email').eq('id', userId).single();
      if (userErr || !userData) return res.status(404).json({ error: 'Usuário não encontrado' });

      const crypto = await import('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { error: updateErr } = await supabase.from('system_users').update({
        password_reset_token: token,
        password_reset_expires: expiresAt,
        force_password_change: true
      }).eq('id', userId);
      if (updateErr) throw updateErr;

      const { data: verifyData } = await supabase.from('system_users').select('password_reset_token').eq('id', userId).single();
      console.log(`[PasswordReset] Token gravado para user ${userId}: ${verifyData?.password_reset_token ? 'SIM' : 'NÃO'}`);

      const systemUrl = process.env.SYSTEM_URL || `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'app.grupotmseg.com.br'}`;
      const resetLink = `${systemUrl}/reset-password?token=${token}`;

      const success = await sendPasswordResetEmail(userData.email, userData.name, resetLink, senderName);
      res.json({ success, message: success ? 'E-mail de redefinição enviado!' : 'Falha ao enviar e-mail' });
    } catch (err: any) {
      console.error('[PasswordReset] Erro:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/password-reset/validate", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: 'Token obrigatório' });

      const { data, error } = await supabase.from('system_users').select('id, name, email, password_reset_expires').eq('password_reset_token', token).single();
      if (error || !data) return res.status(404).json({ error: 'Token inválido ou expirado' });

      if (new Date(data.password_reset_expires) < new Date()) {
        return res.status(410).json({ error: 'Token expirado' });
      }

      res.json({ valid: true, userName: data.name, userEmail: data.email });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/password-reset/confirm", async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
      if (newPassword.length < 6) return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });

      const { data, error } = await supabase.from('system_users').select('id, name, password_reset_expires').eq('password_reset_token', token).single();
      if (error || !data) return res.status(404).json({ error: 'Token inválido ou expirado' });

      if (new Date(data.password_reset_expires) < new Date()) {
        return res.status(410).json({ error: 'Token expirado' });
      }

      const { error: updateErr } = await supabase.from('system_users').update({
        password: newPassword,
        password_reset_token: null,
        password_reset_expires: null,
        force_password_change: false
      }).eq('id', data.id);
      if (updateErr) throw updateErr;

      res.json({ success: true, message: 'Senha alterada com sucesso!' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mission-scheduled", requireAuth, requireRole('administrador', 'diretoria', 'avançado', 'avancado', 'operador'), async (req: Request, res: Response) => {
    try {
      const { missionId, client, origin, destination, start_time, mission_type, vehiclePlate, senderName } = req.body;
      if (!missionId || !client) return res.status(400).json({ error: 'Campos missionId e client obrigatórios' });

      const { data: missionCheck } = await supabase.from('missions').select('*').eq('id', missionId).single();
      if (!missionCheck) return res.status(404).json({ error: 'Missão não encontrada' });

      const missionData = {
        id: missionId,
        client: missionCheck.client || client || '',
        provider: missionCheck.provider || '',
        origin: origin || missionCheck.origin || '',
        destination: destination || missionCheck.destination || '',
        start_time: start_time || missionCheck.start_time || '',
        mission_type: mission_type || missionCheck.mission_type || 'Caracterizada',
      };

      let clientVehicleLabel = '';
      if (missionCheck.client_vehicle_id) {
        const { data: cv } = await supabase.from('client_vehicles').select('plate, model').eq('id', missionCheck.client_vehicle_id).single();
        if (cv?.plate) clientVehicleLabel = cv.model ? `${cv.plate} / ${cv.model}` : cv.plate;
      }
      if (!clientVehicleLabel && vehiclePlate && vehiclePlate !== '—') {
        clientVehicleLabel = vehiclePlate;
      }
      if (!clientVehicleLabel) {
        const fallbackVal = missionCheck.client_vehicle || '';
        if (fallbackVal && !isNaN(Number(fallbackVal))) {
          const { data: cvFallback } = await supabase.from('client_vehicles').select('plate, model').eq('id', Number(fallbackVal)).single();
          if (cvFallback?.plate) clientVehicleLabel = cvFallback.model ? `${cvFallback.plate} / ${cvFallback.model}` : cvFallback.plate;
        } else if (fallbackVal) {
          clientVehicleLabel = fallbackVal;
        }
      }

      const grEspelhamento = missionCheck.gr_espelhamento || '';
      let trackerInfo = '';
      if (missionCheck.vehicle_id) {
        const { data: veh } = await supabase.from('vehicles').select('tracker_type, tracker_id').eq('id', missionCheck.vehicle_id).single();
        if (veh && (veh.tracker_type || veh.tracker_id)) {
          trackerInfo = `${veh.tracker_type || '-'} / ID: ${veh.tracker_id || '-'}`;
        }
      }

      const driverName = missionCheck.driver_name || '';
      const driverPhone = missionCheck.driver_phone || '';

      const agent1 = missionCheck.agent1 || '';
      const agent2 = missionCheck.agent2 || '';

      let escortVehiclePlate = '';
      if (missionCheck.vehicle_id) {
        const { data: escVeh } = await supabase.from('vehicles').select('plate, model').eq('id', missionCheck.vehicle_id).single();
        if (escVeh?.plate) escortVehiclePlate = escVeh.model ? `${escVeh.plate} / ${escVeh.model}` : escVeh.plate;
      }

      const missingFields: string[] = [];
      if (!agent1) missingFields.push('Agente 01');
      if (!agent2) missingFields.push('Agente 02');
      if (!escortVehiclePlate) missingFields.push('Placa da viatura de escolta');
      if (!clientVehicleLabel || clientVehicleLabel === '—' || clientVehicleLabel === '') missingFields.push('Placa do veículo do cliente');
      if (!driverName) missingFields.push('Nome do motorista');
      if (!driverPhone) missingFields.push('Telefone do motorista');
      if (!missionData.origin) missingFields.push('Origem');
      if (!missionData.destination) missingFields.push('Destino');

      if (missingFields.length > 0) {
        await supabase.from('missions').update({ email_pending_client: true }).eq('id', missionId);
        console.log(`[Email Fila] Missão ${missionId} → Cliente pendente (faltam: ${missingFields.join(', ')})`);
        return res.json({ success: true, queued: true, message: `📋 E-mail do CLIENTE na fila — faltam: ${missingFields.join(', ')}` });
      }

      await supabase.from('missions').update({ email_pending_client: false }).eq('id', missionId);

      const { email: clientEmail } = await findClientEmail(missionData.client);
      
      const enrichedMission = { ...missionData, agent1, agent2, escort_vehicle_plate: escortVehiclePlate, driver_name: driverName, driver_phone: driverPhone };

      if (!clientEmail) {
        const fallback = 'operacional@grupotmseg.com.br';
        const alertMission = { ...enrichedMission, _noEmailAlert: true, _alertEntity: 'Cliente', _alertName: missionData.client };
        const result = await sendMissionEmailToClient(alertMission, fallback, clientVehicleLabel, grEspelhamento, trackerInfo, senderName);
        const success = typeof result === 'object' ? result.success : result;
        return res.json({ success, message: success ? `⚠️ Cliente "${missionData.client}" sem e-mail — notificação enviada para operacional.` : 'Falha ao enviar' });
      }

      const result = await sendMissionEmailToClient(enrichedMission, clientEmail, clientVehicleLabel, grEspelhamento, trackerInfo, senderName);
      const success = typeof result === 'object' ? result.success : result;
      if (success && typeof result === 'object' && result.messageId) {
        await supabase.from('missions').update({ email_message_id: result.messageId }).eq('id', missionId);
        console.log(`[Email] Message-ID salvo para missão ${missionId}: ${result.messageId}`);
      }
      res.json({ success, message: success ? 'E-mail de agendamento enviado ao cliente!' : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mission-scheduled:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mission-solicited", requireAuth, requireRole('administrador', 'diretoria', 'avançado', 'avancado', 'operador'), async (req: Request, res: Response) => {
    try {
      const { missionId, provider, vehiclePlate, origin, destination, start_time, mission_type, driver_name, driver_phone, senderName } = req.body;
      if (!missionId || !provider) return res.status(400).json({ error: 'Campos missionId e provider obrigatórios' });

      const { data: missionCheck } = await supabase.from('missions').select('*').eq('id', missionId).single();
      if (!missionCheck) return res.status(404).json({ error: 'Missão não encontrada' });

      const missionData = {
        id: missionId,
        client: missionCheck.client || '',
        provider: missionCheck.provider || provider || '',
        origin: origin || missionCheck.origin || '',
        destination: destination || missionCheck.destination || '',
        start_time: start_time || missionCheck.start_time || '',
        mission_type: mission_type || missionCheck.mission_type || 'Caracterizada',
        driver_name: driver_name || missionCheck.driver_name || '',
        driver_phone: driver_phone || missionCheck.driver_phone || '',
      };

      let cargoVehicleLabel = vehiclePlate || '';
      if (missionCheck.vehicle_id) {
        const { data: veh } = await supabase.from('vehicles').select('plate, model').eq('id', missionCheck.vehicle_id).single();
        if (veh) cargoVehicleLabel = veh.model ? `${veh.plate} / ${veh.model}` : veh.plate;
      }
      if (!cargoVehicleLabel) cargoVehicleLabel = missionCheck.client_vehicle || '';

      const missingFields: string[] = [];
      if (!cargoVehicleLabel || cargoVehicleLabel === '—' || cargoVehicleLabel === '') missingFields.push('Placa do veículo/carga');
      if (!missionData.driver_name) missingFields.push('Nome do motorista');
      if (!missionData.driver_phone) missingFields.push('Telefone do motorista');
      if (!missionData.origin) missingFields.push('Origem');
      if (!missionData.destination) missingFields.push('Destino');

      if (missingFields.length > 0) {
        await supabase.from('missions').update({ email_pending_provider: true }).eq('id', missionId);
        console.log(`[Email Fila] Missão ${missionId} → Fornecedor pendente (faltam: ${missingFields.join(', ')})`);
        return res.json({ success: true, queued: true, message: `📋 E-mail do FORNECEDOR na fila — faltam: ${missingFields.join(', ')}` });
      }

      await supabase.from('missions').update({ email_pending_provider: false }).eq('id', missionId);

      const { email: provEmail } = await findProviderEmail(missionData.provider);
      
      if (!provEmail) {
        const fallback = 'operacional@grupotmseg.com.br';
        const alertMission = { ...missionData, _noEmailAlert: true, _alertEntity: 'Fornecedor', _alertName: missionData.provider };
        const success = await sendMissionEmailToProvider(alertMission, fallback, cargoVehicleLabel, senderName);
        return res.json({ success, message: success ? `⚠️ Fornecedor "${missionData.provider}" sem e-mail — notificação enviada para operacional.` : 'Falha ao enviar' });
      }

      const success = await sendMissionEmailToProvider(missionData, provEmail, cargoVehicleLabel, senderName);
      res.json({ success, message: success ? 'E-mail de solicitação enviado ao fornecedor!' : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mission-solicited:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mission-change-client", requireAuth, requireRole('administrador', 'diretoria', 'avançado', 'avancado', 'operador'), async (req: Request, res: Response) => {
    try {
      const { missionId, client, origin, destination, start_time, mission_type, vehiclePlate, changes, senderName } = req.body;
      if (!missionId || !client || !changes?.length) return res.status(400).json({ error: 'Dados obrigatórios ausentes' });

      const providerBlockedFields = ['fornecedor', 'provider', 'prestador'];
      const safeChanges = (changes as any[]).filter((c: any) => !providerBlockedFields.includes((c.field || '').toLowerCase()));
      if (safeChanges.length === 0) return res.json({ success: true, message: 'Sem alterações relevantes para o cliente' });

      const { email: clientEmail } = await findClientEmail(client);
      if (!clientEmail) return res.json({ success: false, message: 'Cliente sem e-mail cadastrado' });

      const missionData = { id: missionId, client, origin: origin || '', destination: destination || '', start_time: start_time || '', mission_type: mission_type || 'Caracterizada', provider: '', driver_name: '', driver_phone: '' };
      const success = await sendMissionChangeNotificationToClient(missionData, clientEmail, vehiclePlate || '', safeChanges, senderName);
      res.json({ success, message: success ? 'E-mail de alteração enviado ao cliente!' : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mission-change-client:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mission-change-provider", requireAuth, requireRole('administrador', 'diretoria', 'avançado', 'avancado', 'operador'), async (req: Request, res: Response) => {
    try {
      const { missionId, provider, origin, destination, start_time, mission_type, vehiclePlate, changes, senderName } = req.body;
      if (!missionId || !provider || !changes?.length) return res.status(400).json({ error: 'Dados obrigatórios ausentes' });

      const { email: provEmail } = await findProviderEmail(provider);
      if (!provEmail) return res.json({ success: false, message: 'Fornecedor sem e-mail cadastrado' });

      const { data: missionCheck } = await supabase.from('missions').select('client').eq('id', missionId).single();
      const missionData = { id: missionId, client: missionCheck?.client || '', provider, origin: origin || '', destination: destination || '', start_time: start_time || '', mission_type: mission_type || 'Caracterizada', driver_name: '', driver_phone: '' };
      const success = await sendMissionChangeNotificationToProvider(missionData, provEmail, vehiclePlate || '', changes, senderName);
      res.json({ success, message: success ? 'E-mail de alteração enviado ao fornecedor!' : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mission-change-provider:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mirroring-evidence", requireAuth, requireRole('administrador', 'diretoria', 'avançado', 'avancado', 'operador'), async (req: Request, res: Response) => {
    try {
      const { missionId, client, imageUrl, vehiclePlate, origin, destination, start_time, mission_type, senderName } = req.body;
      if (!missionId || !client || !imageUrl) return res.status(400).json({ error: 'Dados obrigatórios ausentes' });

      const { email: clientEmail } = await findClientEmail(client);

      let clientVehicleLabel = '';
      const { data: missionRow } = await supabase.from('missions').select('client_vehicle_id, client_vehicle, vehicle_id, gr_espelhamento, email_message_id').eq('id', missionId).single();
      if (missionRow?.client_vehicle_id) {
        const { data: cv } = await supabase.from('client_vehicles').select('plate, model').eq('id', missionRow.client_vehicle_id).single();
        if (cv?.plate) clientVehicleLabel = cv.model ? `${cv.plate} / ${cv.model}` : cv.plate;
      }
      if (!clientVehicleLabel && vehiclePlate && vehiclePlate !== '—') {
        clientVehicleLabel = vehiclePlate;
      }
      if (!clientVehicleLabel) {
        const fallbackVal = missionRow?.client_vehicle || '';
        if (fallbackVal && !isNaN(Number(fallbackVal))) {
          const { data: cvFb } = await supabase.from('client_vehicles').select('plate, model').eq('id', Number(fallbackVal)).single();
          if (cvFb?.plate) clientVehicleLabel = cvFb.model ? `${cvFb.plate} / ${cvFb.model}` : cvFb.plate;
        } else if (fallbackVal) {
          clientVehicleLabel = fallbackVal;
        }
      }

      const grEspelhamento = missionRow?.gr_espelhamento || '';
      let trackerInfo = '';
      if (missionRow?.vehicle_id) {
        const { data: veh } = await supabase.from('vehicles').select('tracker_type, tracker_id').eq('id', missionRow.vehicle_id).single();
        if (veh && (veh.tracker_type || veh.tracker_id)) {
          trackerInfo = `${veh.tracker_type || '-'} / ID: ${veh.tracker_id || '-'}`;
        }
      }

      const missionData: any = { id: missionId, client, origin: origin || '', destination: destination || '', start_time: start_time || '', mission_type: mission_type || 'Caracterizada' };
      const threadMessageId = missionRow?.email_message_id || '';

      const targetEmail = clientEmail || 'operacional@grupotmseg.com.br';
      if (!clientEmail) {
        missionData._noEmailAlert = true;
        missionData._alertEntity = 'Cliente';
        missionData._alertName = client;
      }
      const success = await sendMirroringEvidenceEmail(missionData, targetEmail, clientVehicleLabel, imageUrl, grEspelhamento, trackerInfo, threadMessageId, senderName);
      res.json({ success, message: success ? (clientEmail ? 'E-mail de evidência de espelhamento enviado ao cliente!' : `⚠️ Cliente "${client}" sem e-mail — notificação enviada para operacional.`) : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mirroring-evidence:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mission-resend-client", requireAuth, requireRole('administrador', 'diretoria', 'avançado', 'avancado', 'operador'), async (req: Request, res: Response) => {
    try {
      const { missionId, senderName } = req.body;
      if (!missionId) return res.status(400).json({ error: 'ID da missão obrigatório' });

      const { data: missionRow } = await supabase.from('missions').select('*').eq('id', missionId).single();
      if (!missionRow) return res.status(404).json({ error: 'Missão não encontrada' });

      const { email: clientEmail } = await findClientEmail(missionRow.client);

      let clientVehicleLabel = '';
      if (missionRow.client_vehicle_id) {
        const { data: cv } = await supabase.from('client_vehicles').select('plate, model').eq('id', missionRow.client_vehicle_id).single();
        if (cv?.plate) clientVehicleLabel = cv.model ? `${cv.plate} / ${cv.model}` : cv.plate;
      }
      if (!clientVehicleLabel) {
        const fallbackVal = missionRow.client_vehicle || '';
        if (fallbackVal && !isNaN(Number(fallbackVal))) {
          const { data: cvFallback } = await supabase.from('client_vehicles').select('plate, model').eq('id', Number(fallbackVal)).single();
          if (cvFallback?.plate) clientVehicleLabel = cvFallback.model ? `${cvFallback.plate} / ${cvFallback.model}` : cvFallback.plate;
        } else if (fallbackVal) {
          clientVehicleLabel = fallbackVal;
        }
      }
      if (!clientVehicleLabel) clientVehicleLabel = '—';

      const grEspelhamento = missionRow.gr_espelhamento || '';
      let trackerInfo = '';
      if (missionRow.vehicle_id) {
        const { data: veh } = await supabase.from('vehicles').select('tracker_type, tracker_id').eq('id', missionRow.vehicle_id).single();
        if (veh && (veh.tracker_type || veh.tracker_id)) {
          trackerInfo = `${veh.tracker_type || '-'} / ID: ${veh.tracker_id || '-'}`;
        }
      }

      const missionData: any = {
        id: missionRow.id,
        client: missionRow.client,
        provider: missionRow.provider || '',
        origin: missionRow.origin || '',
        destination: missionRow.destination || '',
        start_time: missionRow.start_time || '',
        mission_type: missionRow.mission_type || 'Caracterizada',
        driver_name: missionRow.driver_name || '',
        driver_phone: missionRow.driver_phone || ''
      };

      const mirroringUrl = missionRow.mirroring_evidence_url || '';
      const threadMessageId = missionRow.email_message_id || '';
      const targetEmail = clientEmail || 'operacional@grupotmseg.com.br';
      if (!clientEmail) {
        missionData._noEmailAlert = true;
        missionData._alertEntity = 'Cliente';
        missionData._alertName = missionRow.client;
      }
      const success = await sendMissionResendToClient(missionData, targetEmail, clientVehicleLabel, mirroringUrl || undefined, grEspelhamento, trackerInfo, threadMessageId, senderName);
      res.json({ success, message: success ? (clientEmail ? `E-mail enviado para ${clientEmail}${mirroringUrl ? ' (com evidência de espelhamento)' : ''}` : `⚠️ Cliente "${missionRow.client}" sem e-mail — notificação enviada para operacional.`) : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mission-resend-client:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/gemini/generate", requireAuth, async (req: Request, res: Response) => {
    try {
      const { contents, config, stream } = req.body;
      const model = req.body.model || "gemini-2.5-flash";
      const finalConfig = { ...config, maxOutputTokens: config?.maxOutputTokens || 8192 };

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const streamResult = await ai.models.generateContentStream({
          model,
          contents,
          config: finalConfig
        });

        for await (const chunk of streamResult) {
          const text = chunk.text || "";
          if (text) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } else {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: finalConfig
        });
        res.json({ text: response.text || "" });
      }
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: error.message || "Erro interno" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: error.message || "Erro interno do servidor" });
      }
    }
  });

  app.post("/api/chat", requireAuth, async (req: Request, res: Response) => {
    try {
      const { message, history, image } = req.body;
      const systemInstruction = "Você é o assistente oficial de logística e segurança do Grupo TMSEG. Responda de forma profissional e técnica.";

      if (image) {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: {
            parts: [
              { inlineData: { mimeType: image.mimeType, data: image.data } },
              { text: message || "Analise esta imagem sob a ótica de segurança logística." }
            ]
          },
          config: { systemInstruction, maxOutputTokens: 8192 }
        });
        res.json({ text: response.text || "Não foi possível analisar a imagem." });
      } else {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const chatHistory = (history || []).map((m: any) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.text }]
        }));

        const stream = await ai.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents: [...chatHistory, { role: "user", parts: [{ text: message }] }],
          config: { systemInstruction, maxOutputTokens: 8192 }
        });

        for await (const chunk of stream) {
          const text = chunk.text || "";
          if (text) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error("Chat API Error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: error.message || "Erro interno" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: error.message || "Erro interno do servidor" });
      }
    }
  });

  // Lidos exclusivamente do ambiente — não use fallback hardcoded.
  // Se faltarem, os endpoints que dependem dessas constantes responderão erro
  // (preferível a expor chaves no código).
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const supabaseAdmin = supabase;

  const { error: colCheck } = await supabaseAdmin.from('missions').select('billing_release').limit(1);
  if (colCheck && colCheck.message.includes('does not exist')) {
    console.log('[Migration] ⚠️  Coluna billing_release NÃO existe na tabela missions.');
    console.log('[Migration] Execute no Supabase SQL Editor:');
    console.log("[Migration] ALTER TABLE missions ADD COLUMN IF NOT EXISTS valor_zero_motivo TEXT DEFAULT '';");
    console.log("[Migration] ALTER TABLE missions ADD COLUMN IF NOT EXISTS reference_number TEXT DEFAULT '';");
    console.log("[Migration] ALTER TABLE missions ADD COLUMN IF NOT EXISTS billing_release TEXT DEFAULT '';");
    console.log("[Migration] NOTIFY pgrst, 'reload schema';");

    app.post('/api/migration/add-mission-columns', async (_req: Request, res: Response) => {
      res.json({
        message: 'Execute o seguinte SQL no Supabase SQL Editor:',
        sql: [
          "ALTER TABLE missions ADD COLUMN IF NOT EXISTS valor_zero_motivo TEXT DEFAULT '';",
          "ALTER TABLE missions ADD COLUMN IF NOT EXISTS reference_number TEXT DEFAULT '';",
          "ALTER TABLE missions ADD COLUMN IF NOT EXISTS billing_release TEXT DEFAULT '';",
          "NOTIFY pgrst, 'reload schema';"
        ]
      });
    });
  } else {
    console.log('[Migration] Colunas valor_zero_motivo, reference_number, billing_release verificadas/OK.');
  }

  try {
    await supabaseAdmin.rpc('exec_sql', { sql: `
      CREATE TABLE IF NOT EXISTS monitored_processes (
        id SERIAL PRIMARY KEY,
        numero_processo TEXT NOT NULL UNIQUE,
        tribunal TEXT NOT NULL,
        apelido TEXT DEFAULT '',
        ativo BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_checked_at TIMESTAMPTZ,
        last_movimentacao TEXT DEFAULT ''
      );
    `});
    console.log('[Migration] Tabela monitored_processes verificada/criada.');
  } catch (e: any) {
    console.log('[Migration] monitored_processes:', e.message || 'ok');
  }

  // Push subscriptions persistidas (antes ficavam só em memória → perdidas a cada deploy)
  try {
    await supabaseAdmin.rpc('exec_sql', { sql: `
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        user_key TEXT PRIMARY KEY,
        subscription JSONB NOT NULL,
        endpoint TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `});
    console.log('[Migration] Tabela push_subscriptions verificada/criada.');
  } catch (e: any) {
    console.log('[Migration] push_subscriptions:', e.message || 'ok');
  }

  // ── Migration PlugNotas: colunas multi-provider em financial_invoices ──
  try {
    await supabaseAdmin.rpc('exec_sql', { sql: `
      ALTER TABLE financial_invoices ADD COLUMN IF NOT EXISTS nf_provider TEXT DEFAULT 'ASAAS';
      ALTER TABLE financial_invoices ADD COLUMN IF NOT EXISTS plugnotas_invoice_id TEXT;
      ALTER TABLE financial_invoices ADD COLUMN IF NOT EXISTS plugnotas_protocol TEXT;
      -- Backfill provider-aware:
      --  * Linhas com plugnotas_invoice_id → 'PLUGNOTAS' (corrige rollouts
      --    parciais e dados de teste anteriores que ficaram sem provider).
      --  * Demais linhas sem provider → 'ASAAS' (default).
      -- Também corrige o caso em que nf_provider veio 'ASAAS' por engano
      -- mas existe plugnotas_invoice_id (consistência de classificação).
      UPDATE financial_invoices SET nf_provider = 'PLUGNOTAS'
        WHERE plugnotas_invoice_id IS NOT NULL
          AND (nf_provider IS NULL OR upper(nf_provider) <> 'PLUGNOTAS');
      UPDATE financial_invoices SET nf_provider = 'ASAAS' WHERE nf_provider IS NULL;
    `});
    console.log('[Migration] Colunas PlugNotas (nf_provider, plugnotas_invoice_id, plugnotas_protocol) verificadas/criadas.');
  } catch (e: any) {
    console.log('[Migration] PlugNotas columns:', e.message || 'ok');
  }

  app.post("/api/supabase/init-invoices", async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseAdmin.from('financial_invoices').select('id', { count: 'exact', head: true });

      const newCols = ['nf_image_url', 'boleto_image_url', 'provider', 'issuer_company', 'boleto_due_date', 'asaas_payment_id', 'asaas_status', 'asaas_invoice_url', 'asaas_bankslip_url', 'asaas_pix_payload', 'asaas_barcode', 'nf_status', 'nf_number'];

      if (error && error.code === '42P01') {
        const createSql = `
          CREATE TABLE IF NOT EXISTS public.financial_invoices (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client TEXT NOT NULL,
            number TEXT NOT NULL,
            amount DOUBLE PRECISION NOT NULL DEFAULT 0,
            date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'EMITIDA',
            notes TEXT DEFAULT '',
            created_by TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            nf_image_url TEXT,
            boleto_image_url TEXT,
            provider TEXT,
            issuer_company TEXT,
            boleto_due_date TEXT
          );
          ALTER TABLE public.financial_invoices ENABLE ROW LEVEL SECURITY;
          CREATE POLICY IF NOT EXISTS "Allow all for financial_invoices" ON public.financial_invoices FOR ALL USING (true) WITH CHECK (true);
        `;
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ query: createSql })
        });
        if (!resp.ok) {
          res.json({ ok: false, note: 'Table does not exist. Please create it via Supabase SQL editor.', sql: createSql });
          return;
        }
      } else {
        let needsMigration = false;
        try {
          const { error: checkErr } = await supabaseAdmin.from('financial_invoices').select('nf_image_url').limit(1);
          if (checkErr && checkErr.code === '42703') needsMigration = true;
        } catch { needsMigration = true; }

        if (needsMigration) {
          const migSql = newCols.map(c => `ALTER TABLE public.financial_invoices ADD COLUMN IF NOT EXISTS ${c} TEXT;`).join('\n');
          res.json({ ok: true, migration_needed: true, sql: migSql, hint: 'Execute this SQL in Supabase SQL Editor to add the new columns' });
          return;
        }
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get("/api/supabase/status", async (_req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      const { error: pingError } = await supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true });
      const latencyMs = Date.now() - startTime;

      let incidents: any[] = [];
      try {
        const statusRes = await fetch("https://status.supabase.com/api/v2/incidents.json");
        const statusData = await statusRes.json() as any;
        incidents = (statusData?.incidents || []).slice(0, 5);
      } catch { }

      let scheduledMaintenances: any[] = [];
      try {
        const maintRes = await fetch("https://status.supabase.com/api/v2/scheduled-maintenances.json");
        const maintData = await maintRes.json() as any;
        scheduledMaintenances = (maintData?.scheduled_maintenances || []).slice(0, 3);
      } catch { }

      res.json({
        rest_ok: !pingError,
        latency_ms: latencyMs,
        incidents,
        scheduled_maintenances: scheduledMaintenances,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/supabase/db-metrics", async (_req: Request, res: Response) => {
    try {
      const tables = [
        'missions', 'clients', 'providers', 'vehicles', 'client_vehicles',
        'client_routes', 'client_price_tables', 'provider_cost_tables',
        'system_users', 'system_logs', 'financial_transactions',
        'financial_accounts', 'financial_categories', 'commercial_proposals',
        'quotes', 'provider_agents', 'agents', 'mission_logs', 'mission_history',
        'profiles', 'contracts'
      ];

      const results: { table: string; count: number; estimatedSizeKb: number }[] = [];

      const counts = await Promise.allSettled(
        tables.map(async (table) => {
          const startTime = Date.now();
          const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
          const elapsed = Date.now() - startTime;
          if (error) return { table, count: 0, estimatedSizeKb: 0, latency: elapsed, error: error.message };
          const rowCount = count || 0;
          const avgRowSizeKb = ['system_logs', 'mission_logs', 'mission_history'].includes(table) ? 2 : 
                               ['missions', 'commercial_proposals'].includes(table) ? 4 : 1;
          return { table, count: rowCount, estimatedSizeKb: rowCount * avgRowSizeKb, latency: elapsed };
        })
      );

      const tableMetrics = counts.map((result, i) => {
        if (result.status === 'fulfilled') return result.value;
        return { table: tables[i], count: 0, estimatedSizeKb: 0, error: 'Inacessível' };
      });

      const totalRows = tableMetrics.reduce((sum: number, t: any) => sum + (t.count || 0), 0);
      const totalEstimatedKb = tableMetrics.reduce((sum: number, t: any) => sum + (t.estimatedSizeKb || 0), 0);

      res.json({
        tables: tableMetrics,
        total_rows: totalRows,
        total_estimated_size_mb: parseFloat((totalEstimatedKb / 1024).toFixed(2)),
        quota_mb: 500,
        usage_percent: parseFloat((totalEstimatedKb / 1024 / 500 * 100).toFixed(2)),
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/supabase/storage-usage", async (_req: Request, res: Response) => {
    try {
      const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets();
      if (bucketsError) throw bucketsError;

      const bucketStats: any[] = [];
      for (const bucket of (buckets || [])) {
        try {
          const { data: files, error: filesError } = await supabaseAdmin.storage.from(bucket.name).list('', { limit: 1000 });
          if (!filesError && files) {
            const totalBytes = files.reduce((sum, f: any) => sum + ((f.metadata as any)?.size || 0), 0);
            bucketStats.push({
              bucket_id: bucket.name,
              objects: files.length,
              size_bytes: totalBytes,
              size_mb: parseFloat((totalBytes / 1024 / 1024).toFixed(2)),
              public: bucket.public,
            });
          } else {
            bucketStats.push({ bucket_id: bucket.name, objects: 0, size_bytes: 0, size_mb: 0, public: bucket.public, error: filesError?.message });
          }
        } catch {
          bucketStats.push({ bucket_id: bucket.name, objects: 0, size_bytes: 0, size_mb: 0, public: bucket.public });
        }
      }

      const totalStorageMb = bucketStats.reduce((sum, b) => sum + b.size_mb, 0);

      res.json({
        buckets: bucketStats,
        total_storage_mb: parseFloat(totalStorageMb.toFixed(2)),
        storage_quota_mb: 1024,
        usage_percent: parseFloat((totalStorageMb / 1024 * 100).toFixed(2)),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/db/capacity", async (_req: Request, res: Response) => {
    try {
      const DB_CAPACITY_GB = Number(process.env.DB_CAPACITY_GB || 8);

      let used_bytes = 0;
      let dbSizeSource = 'estimate';
      let dbSizePretty = '';
      let topTables: any[] = [];
      let totalRows = 0;
      const tableStats: any[] = [];

      {
        const tables = ['missions', 'clients', 'providers', 'vehicles', 'system_users',
          'financial_transactions', 'commercial_proposals', 'client_price_tables',
          'provider_cost_tables', 'system_logs', 'financial_accounts', 'financial_categories',
          'client_registries', 'client_mission_notes', 'operational_reports',
          'account_balance_snapshots', 'platform_cost_overrides'];

        for (const table of tables) {
          try {
            const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
            if (!error && count !== null) {
              totalRows += count;
              const avgRowSizeBytes = ['system_logs', 'mission_logs', 'mission_history'].includes(table) ? 2048 :
                                       ['missions', 'commercial_proposals', 'operational_reports'].includes(table) ? 4096 : 800;
              tableStats.push({ table, rows: count, total_bytes: count * avgRowSizeBytes, total_size: `${(count * avgRowSizeBytes / 1024).toFixed(0)} kB`, dead_rows: 0 });
            }
          } catch {}
        }
        used_bytes = totalRows * 800;
        dbSizeSource = 'estimate';
        topTables = tableStats.sort((a, b) => b.total_bytes - a.total_bytes);
      }

      const limit_bytes = Math.round(DB_CAPACITY_GB * 1024 * 1024 * 1024);
      const percent_used = limit_bytes > 0 ? used_bytes / limit_bytes : null;
      const totalDeadRows = topTables.reduce((s, t) => s + (t.dead_rows || 0), 0);

      res.json({
        used_bytes,
        limit_bytes,
        percent_used,
        used_mb: +(used_bytes / 1024 / 1024).toFixed(2),
        used_gb: +(used_bytes / 1024 / 1024 / 1024).toFixed(3),
        limit_gb: DB_CAPACITY_GB,
        size_pretty: dbSizePretty || `${(used_bytes / 1024 / 1024).toFixed(2)} MB`,
        total_rows: totalRows,
        total_dead_rows: totalDeadRows,
        tables: topTables,
        source: dbSizeSource,
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/db/vacuum", async (req: Request, res: Response) => {
    try {
      const { tables } = req.body;
      const allowedTables = ['missions', 'system_logs', 'mission_logs', 'mission_history',
        'financial_transactions', 'clients', 'providers', 'vehicles', 'client_price_tables',
        'provider_cost_tables', 'client_routes', 'agents', 'provider_agents', 'profiles',
        'commercial_proposals', 'quotes', 'contracts', 'financial_accounts', 'financial_categories'];

      const targetTables = (tables && Array.isArray(tables) && tables.length > 0)
        ? tables.filter((t: string) => allowedTables.includes(t))
        : ['missions', 'system_logs', 'mission_logs', 'financial_transactions'];

      const results: any[] = [];
      for (const table of targetTables) {
        try {
          const { count } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
          results.push({ table, status: 'ok', rows: count || 0, dead_rows_before: 0, note: 'count-only' });
        } catch (e: any) {
          results.push({ table, status: 'error', error: e.message });
        }
      }

      res.json({ 
        success: true, 
        method: 'supabase-api', 
        message: 'Use o painel do Supabase para executar VACUUM. Contagens de registros foram atualizadas.',
        results, 
        timestamp: new Date().toISOString() 
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/platform/costs", async (_req: Request, res: Response) => {
    try {
      let overrides: Record<string, number> = {};
      try {
        const { data: rows } = await supabaseAdmin.from('platform_cost_overrides').select('key, value');
        if (rows) rows.forEach((r: any) => { overrides[r.key] = Number(r.value) || 0; });
      } catch (e) { console.error('Erro ao ler overrides:', e); }

      const BRL_RATE = overrides['usd_to_brl'] || Number(process.env.USD_TO_BRL || 5.80);

      const replitPlan = process.env.REPLIT_PLAN || 'Core';
      const replitPlanCosts: Record<string, { usd: number, label: string }> = {
        'Free': { usd: 0, label: 'Free' },
        'Starter': { usd: 9, label: 'Starter ($9/mês)' },
        'Hacker': { usd: 7, label: 'Hacker ($7/mês)' },
        'Core': { usd: 25, label: 'Core ($25/mês)' },
        'Pro': { usd: 20, label: 'Pro ($20/mês)' },
        'Teams': { usd: 25, label: 'Teams ($25/mês)' },
      };
      const replitBase = replitPlanCosts[replitPlan] || replitPlanCosts['Core'];

      const supabasePlan = process.env.SUPABASE_PLAN || 'Pro';
      const supabasePlanCosts: Record<string, { usd: number, label: string }> = {
        'Free': { usd: 0, label: 'Free Tier' },
        'Pro': { usd: 25, label: 'Pro ($25/mês)' },
        'Team': { usd: 599, label: 'Team ($599/mês)' },
      };
      const supabaseBase = supabasePlanCosts[supabasePlan] || supabasePlanCosts['Pro'];

      const replitExtraEgress = overrides['replit_egress'] ?? Number(process.env.REPLIT_EXTRA_EGRESS_USD || 0);
      const replitExtraCompute = overrides['replit_compute'] ?? Number(process.env.REPLIT_EXTRA_COMPUTE_USD || 0);
      const replitExtraStorage = overrides['replit_storage'] ?? Number(process.env.REPLIT_EXTRA_STORAGE_USD || 0);
      const replitExtraAlwaysOn = overrides['replit_always_on'] ?? 0;
      const replitExtraOther = overrides['replit_other'] ?? 0;
      const supabaseExtraDb = overrides['supabase_db'] ?? Number(process.env.SUPABASE_EXTRA_DB_USD || 0);
      const supabaseExtraBandwidth = overrides['supabase_bandwidth'] ?? Number(process.env.SUPABASE_EXTRA_BANDWIDTH_USD || 0);
      const supabaseExtraStorage = overrides['supabase_storage'] ?? Number(process.env.SUPABASE_EXTRA_STORAGE_USD || 0);

      const googleMapsEstimate = overrides['google_maps'] ?? Number(process.env.GOOGLE_MAPS_MONTHLY_USD || 0);
      const resendEstimate = overrides['resend'] ?? Number(process.env.RESEND_MONTHLY_USD || 0);
      const otherCosts = overrides['other_apis'] ?? Number(process.env.OTHER_MONTHLY_COSTS_USD || 0);

      const replitTotalUsd = replitBase.usd + replitExtraEgress + replitExtraCompute + replitExtraStorage + replitExtraAlwaysOn + replitExtraOther;
      const supabaseTotalUsd = supabaseBase.usd + supabaseExtraDb + supabaseExtraBandwidth + supabaseExtraStorage;
      const apiTotalUsd = googleMapsEstimate + resendEstimate + otherCosts;
      const grandTotalUsd = replitTotalUsd + supabaseTotalUsd + apiTotalUsd;

      const toR = (v: number) => +(v * BRL_RATE).toFixed(2);

      const DB_CAPACITY_GB = Number(process.env.DB_CAPACITY_GB || 8);
      let dbUsedMb = 0;
      try {
        const capResp = await fetch(`http://localhost:${process.env.PORT || 5000}/api/db/capacity`);
        if (capResp.ok) {
          const capData = await capResp.json();
          dbUsedMb = capData.used_mb || 0;
        }
      } catch {}

      const savingTips = [];

      if (supabasePlan === 'Free') {
        savingTips.push({
          area: 'Supabase',
          tip: 'Limpe registros antigos de system_logs periodicamente para economizar espaço no banco Free Tier (500MB).',
          impact: 'Médio',
          action: 'DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL \'90 days\''
        });
        savingTips.push({
          area: 'Supabase',
          tip: 'Comprima imagens antes de fazer upload no Storage para reduzir os 1GB gratuitos.',
          impact: 'Baixo',
          action: 'Use ferramentas como TinyPNG ou compressão no frontend antes do upload.'
        });
      }

      savingTips.push({
        area: 'Replit',
        tip: 'Configure o Repl para hibernar após inatividade. O Always-On consome créditos mesmo sem tráfego.',
        impact: 'Alto',
        action: 'Desative Always-On se o sistema não precisa estar 24/7 disponível.'
      });

      savingTips.push({
        area: 'Google Maps',
        tip: 'Cache rotas calculadas localmente. Cada chamada de Directions API custa ~$0.005-$0.01.',
        impact: 'Alto',
        action: 'Salve totalDistance e estimatedTime na missão ao calcular a rota pela primeira vez.'
      });

      savingTips.push({
        area: 'Gemini AI',
        tip: 'As chamadas AI via Replit Integrations são gratuitas. Aproveite para chatbot, auditoria e análises.',
        impact: 'Info',
        action: 'Continue usando o Gemini via Replit AI Integrations (sem custo adicional).'
      });

      savingTips.push({
        area: 'Supabase',
        tip: 'Adicione índices nas colunas mais consultadas (client, status, created_at) para reduzir tempo de query.',
        impact: 'Médio',
        action: 'CREATE INDEX idx_missions_client ON missions(client); CREATE INDEX idx_missions_status ON missions(status);'
      });

      savingTips.push({
        area: 'Replit',
        tip: 'Use variáveis de ambiente ao invés de hardcode para trocar de plano sem alterar código.',
        impact: 'Baixo',
        action: 'Defina REPLIT_PLAN, SUPABASE_PLAN, DB_CAPACITY_GB no painel de Secrets.'
      });

      savingTips.push({
        area: 'Geral',
        tip: 'Monitore o consumo mensal de bandwidth do Supabase. O Free Tier tem 2GB/mês de transferência.',
        impact: 'Médio',
        action: 'Verifique o dashboard do Supabase em Usage > Bandwidth mensalmente.'
      });

      res.json({
        currency_rate: BRL_RATE,
        replit: {
          plan: replitBase.label,
          base_usd: replitBase.usd,
          base_brl: toR(replitBase.usd),
          extras: {
            egress: { usd: replitExtraEgress, brl: toR(replitExtraEgress) },
            compute: { usd: replitExtraCompute, brl: toR(replitExtraCompute) },
            storage: { usd: replitExtraStorage, brl: toR(replitExtraStorage) },
            always_on: { usd: replitExtraAlwaysOn, brl: toR(replitExtraAlwaysOn) },
            other: { usd: replitExtraOther, brl: toR(replitExtraOther) },
          },
          total_usd: replitTotalUsd,
          total_brl: toR(replitTotalUsd),
        },
        supabase: {
          plan: supabaseBase.label,
          base_usd: supabaseBase.usd,
          base_brl: toR(supabaseBase.usd),
          extras: {
            db: { usd: supabaseExtraDb, brl: toR(supabaseExtraDb) },
            bandwidth: { usd: supabaseExtraBandwidth, brl: toR(supabaseExtraBandwidth) },
            storage: { usd: supabaseExtraStorage, brl: toR(supabaseExtraStorage) },
          },
          total_usd: supabaseTotalUsd,
          total_brl: toR(supabaseTotalUsd),
          db_capacity_gb: DB_CAPACITY_GB,
        },
        apis: {
          google_maps: { usd: googleMapsEstimate, brl: toR(googleMapsEstimate) },
          resend: { usd: resendEstimate, brl: toR(resendEstimate) },
          other: { usd: otherCosts, brl: toR(otherCosts) },
          total_usd: apiTotalUsd,
          total_brl: toR(apiTotalUsd),
        },
        total_usd: grandTotalUsd,
        total_brl: toR(grandTotalUsd),
        saving_tips: savingTips,
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/platform/costs/overrides", async (req: Request, res: Response) => {
    try {
      const { overrides } = req.body;
      if (!overrides || typeof overrides !== 'object') return res.status(400).json({ error: 'overrides inválidos' });

      for (const [key, value] of Object.entries(overrides)) {
        const numVal = Number(value) || 0;
        await supabaseAdmin.from('platform_cost_overrides').upsert({
          key,
          value: numVal,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      }
      res.json({ success: true, saved: Object.keys(overrides).length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/supabase/billing-links", (_req: Request, res: Response) => {
    const projectRef = 'ajhmmjuewdsukecaimik';
    res.json({
      billing: "https://supabase.com/dashboard/org/_/billing",
      usage: "https://supabase.com/dashboard/org/_/usage",
      database: `https://supabase.com/dashboard/project/${projectRef}/database/tables`,
      storage: `https://supabase.com/dashboard/project/${projectRef}/storage/buckets`,
      logs: `https://supabase.com/dashboard/project/${projectRef}/logs/explorer`,
      settings: `https://supabase.com/dashboard/project/${projectRef}/settings/general`,
      api_docs: `https://supabase.com/dashboard/project/${projectRef}/api`,
    });
  });

  app.get("/api/supabase/health-check", async (_req: Request, res: Response) => {
    try {
      const checks: any = {};

      const dbStart = Date.now();
      const { error: dbErr } = await supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true });
      checks.database = { ok: !dbErr, latency_ms: Date.now() - dbStart, error: dbErr?.message || null };

      const authStart = Date.now();
      try {
        const authRes = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
          headers: { apikey: SUPABASE_ANON_KEY },
        });
        checks.auth = { ok: authRes.ok, latency_ms: Date.now() - authStart };
      } catch (e: any) {
        checks.auth = { ok: false, latency_ms: Date.now() - authStart, error: e.message };
      }

      const storageStart = Date.now();
      const { error: storageErr } = await supabaseAdmin.storage.listBuckets();
      checks.storage = { ok: !storageErr, latency_ms: Date.now() - storageStart, error: storageErr?.message || null };

      const realtimeStart = Date.now();
      try {
        const rtRes = await fetch(`${SUPABASE_URL}/realtime/v1/api/tenants`, {
          headers: { apikey: SUPABASE_ANON_KEY },
        });
        checks.realtime = { ok: rtRes.status !== 500, latency_ms: Date.now() - realtimeStart };
      } catch (e: any) {
        checks.realtime = { ok: false, latency_ms: Date.now() - realtimeStart, error: e.message };
      }

      const allOk = Object.values(checks).every((c: any) => c.ok);

      res.json({
        overall: allOk ? 'healthy' : 'degraded',
        checks,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/missions/force-recalculate-by-os/:osNumber", async (req: Request, res: Response) => {
    try {
      const osNumber = req.params.osNumber;
      const missionId = osNumber.startsWith('GTM-') ? osNumber : `GTM-${osNumber}`;
      
      const { data: checkMission } = await supabaseAdmin.from('missions').select('id').eq('id', missionId).single();
      if (!checkMission) return res.status(404).json({ error: `OS ${osNumber} (ID: ${missionId}) não encontrada` });
      const url = `${req.protocol}://${req.get('host')}/api/missions/${missionId}/force-recalculate`;
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const result = await response.json();
      return res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/missions/:id/billing-override", async (req: Request, res: Response) => {
    try {
      const missionId = req.params.id;
      const { revenue_value, billing_verified_by, billing_approved, revenue_edit_reason, toll_value } = req.body || {};

      if (typeof revenue_value !== 'number' || !isFinite(revenue_value) || revenue_value < 0) {
        return res.status(400).json({ error: 'revenue_value inválido' });
      }
      if (!billing_verified_by || typeof billing_verified_by !== 'string') {
        return res.status(400).json({ error: 'billing_verified_by é obrigatório' });
      }

      const { data: mission, error: mErr } = await supabaseAdmin.from('missions').select('id, toll_value, snapshot_data').eq('id', missionId).single();
      if (mErr || !mission) return res.status(404).json({ error: 'Missão não encontrada' });

      const updatePayload: any = {
        revenue_value: Math.round(revenue_value * 100) / 100,
        billing_verified_by,
        billing_approved: billing_approved === true,
        last_update: new Date().toISOString(),
      };
      if (typeof revenue_edit_reason === 'string' && revenue_edit_reason.trim()) {
        updatePayload.revenue_edit_reason = revenue_edit_reason.trim().slice(0, 500);
      }
      if (typeof toll_value === 'number' && isFinite(toll_value) && toll_value >= 0) {
        updatePayload.toll_value = Math.round(toll_value * 100) / 100;
      }

      const { data, error } = await supabaseAdmin.from('missions').update(updatePayload).eq('id', missionId).select('id, revenue_value, toll_value, billing_verified_by, billing_approved').maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'Nenhuma linha atualizada' });

      try {
        await supabaseAdmin.from('system_logs').insert([{
          user_name: billing_verified_by,
          action_type: 'billing_override',
          entity: 'Mission',
          entity_id: missionId,
          details: JSON.stringify({ revenue_value: updatePayload.revenue_value, reason: updatePayload.revenue_edit_reason || null, source: 'planilha_compare' })
        }]);
      } catch (logErr) { /* log opcional */ }

      return res.json({ success: true, mission: data });
    } catch (err: any) {
      console.error('[billing-override] erro', err);
      return res.status(500).json({ error: err?.message || 'Erro interno' });
    }
  });

  app.post("/api/missions/:id/force-recalculate", async (req: Request, res: Response) => {
    try {
      const missionId = req.params.id;

      const { data: mission, error: mErr } = await supabaseAdmin.from('missions').select('*').eq('id', missionId).single();
      if (mErr || !mission) return res.status(404).json({ error: 'Missão não encontrada' });

      await supabaseAdmin.from('system_logs').delete().eq('entity', 'BillingAdjustment').eq('entity_id', missionId);

      const { data: clientTables } = await supabaseAdmin.from('client_price_tables').select('*');
      const { data: providerTables } = await supabaseAdmin.from('provider_cost_tables').select('*');
      const { data: clients } = await supabaseAdmin.from('clients').select('*');

      const missionClientTrimmed = (mission.client || '').trim().toUpperCase();
      const clientData = (clients || []).find((c: any) => (c.name || '').trim().toUpperCase() === missionClientTrimmed);
      const { calculateMissionFinancials } = await import('../lib/financialUtils');

      const missionObj = {
        ...mission,
        startKm: mission.start_km,
        endKm: mission.end_km,
        startTime: mission.start_time,
        endTime: mission.end_time,
        agentCount: mission.agent_count || 1,
        is_same_os: mission.is_same_os || false,
      };

      const result = calculateMissionFinancials(missionObj, clientTables || [], providerTables || [], clientData);

      if (result && result.client && result.provider) {
        const newRevenue = result.client.serviceTotal || 0;
        const newCost = mission.is_same_os ? 0 : (result.provider.serviceTotal || 0);

        await supabaseAdmin.from('missions').update({
          revenue_value: newRevenue,
          cost_value: newCost,
          toll_value: result.tollValue || mission.toll_value || 0,
          billing_verified_by: null,
          snapshot_approved_by: null,
        }).eq('id', missionId);

        return res.json({
          success: true,
          mission_id: missionId,
          os_number: mission.os_number,
          old: { revenue: mission.revenue_value, cost: mission.cost_value },
          new: { revenue: newRevenue, cost: newCost },
          details: {
            provider_excess_km: result.provider.excessKm,
            provider_unit_cost_km: result.provider.unitCostKm,
            provider_extra_km_val: result.provider.extraKmVal,
            provider_base: result.provider.base,
            provider_total: result.provider.total,
            client_total: result.client.total,
            distance: result.realTraveledKm,
          }
        });
      }

      res.status(400).json({ error: 'Não foi possível calcular financeiro' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/billing/recalculate-client", async (req: Request, res: Response) => {
    try {
      const { clientName, startDate, endDate } = req.body;
      if (!clientName) return res.status(400).json({ error: 'clientName obrigatório' });

      const rangeStart = startDate ? `${startDate}T03:00:00.000Z` : undefined;
      const rangeEnd = endDate ? new Date(new Date(`${endDate}T03:00:00.000Z`).getTime() + 86400000 - 1).toISOString() : undefined;

      const escapedName = clientName.replace(/[%_\\]/g, '\\$&');
      let query = supabaseAdmin.from('missions').select('*').ilike('client', `%${escapedName}%`).neq('status', 'Recusada');
      if (rangeStart) query = query.gte('start_time', rangeStart);
      if (rangeEnd) query = query.lte('start_time', rangeEnd);
      const { data: missions, error: mErr } = await query;
      if (mErr) throw mErr;

      const [{ data: clientTables }, { data: providerTables }, { data: clients }] = await Promise.all([
        supabaseAdmin.from('client_price_tables').select('*'),
        supabaseAdmin.from('provider_cost_tables').select('*'),
        supabaseAdmin.from('clients').select('*'),
      ]);

      const { calculateMissionFinancials } = await import('../lib/financialUtils');
      const now = new Date();
      let updated = 0, skipped = 0, errCount = 0;
      const changes: any[] = [];

      for (const raw of (missions || [])) {
        try {
          if (raw.billing_approved) {
            skipped++;
            continue;
          }

          await supabaseAdmin.from('system_logs').delete().eq('entity', 'BillingAdjustment').eq('entity_id', raw.id);

          const missionClientTrimmed = (raw.client || '').trim().toUpperCase();
          const clientData = (clients || []).find((c: any) => (c.name || '').trim().toUpperCase() === missionClientTrimmed) || null;

          const m = { ...raw, startKm: raw.start_km, endKm: raw.end_km, startTime: raw.start_time, endTime: raw.end_time, agentCount: raw.agent_count || 1, is_same_os: raw.is_same_os || false };
          const calc = calculateMissionFinancials(m, clientTables || [], providerTables || [], clientData, now);
          if (!calc) { skipped++; continue; }

          const newRevenue = calc.client.serviceTotal || 0;
          const newCost = raw.is_same_os ? 0 : (calc.provider.serviceTotal || 0);
          const newToll = calc.tollValue || raw.toll_value || 0;
          const oldRevenue = raw.revenue_value || 0;
          const oldCost = raw.cost_value || 0;
          const clientServiceOnly = calc.client.serviceTotal || 0;

          const snapData = {
            activationFee: calc.client.base || 0,
            kmExtraTotal: calc.client.extraKmVal || 0,
            hrExtraTotal: calc.client.extraHrVal || 0,
            kmExtraQtd: calc.client.excessKm || 0,
            hrExtraQtd: calc.client.excessHours || 0,
            tollVal: newToll,
            franchiseKm: calc.client.franchiseKm || 0,
            franchiseHours: calc.client.franchiseHours || 0,
            unitKm: calc.client.unitPriceKm || 0,
            unitHr: calc.client.unitPriceHour || 0,
            kmTotal: raw.end_km && raw.start_km ? (raw.end_km - raw.start_km) : (raw.total_distance || 0),
            durationHours: calc.durationHours || 0,
            revenueServiceOnly: clientServiceOnly,
            costServiceOnly: calc.provider.serviceTotal || 0,
            totalGeral: clientServiceOnly + newToll,
            clientTableId: calc.client.tableId || null,
            providerTableId: calc.provider.tableId || null,
            tableName: calc.client.tableName || '',
            route: (() => {
              const co = (raw.origin || '').split(',')[0].split('-')[0].trim();
              const cd = (raw.destination || '').split(',')[0].split('-')[0].trim();
              return co && cd ? `${co} X ${cd}` : co || cd || raw.region || '-';
            })(),
            approved_by: 'Sistema (Recalcular e Comparar)',
            approved_at: new Date().toISOString(),
            tollProvider: calc.tollValue || 0,
            systemCalculatedRevenue: newRevenue,
            systemCalculatedCost: newCost,
          };

          await supabaseAdmin.from('missions').update({
            revenue_value: newRevenue,
            cost_value: newCost,
            toll_value: newToll,
            snapshot_data: snapData,
            snapshot_approved_by: 'Sistema (Recalcular e Comparar)',
            snapshot_approved_at: new Date().toISOString(),
          }).eq('id', raw.id);

          await supabaseAdmin.from('system_logs').insert({
            entity: 'BillingSnapshot',
            entity_id: raw.id,
            action_type: 'snapshot_save',
            details: JSON.stringify(snapData),
            created_by: 'Sistema (Recalcular e Comparar)',
          });

          if (Math.abs(newRevenue - oldRevenue) > 0.01 || Math.abs(newCost - oldCost) > 0.01) {
            changes.push({ id: raw.id, oldRev: oldRevenue, newRev: newRevenue, oldCost: oldCost, newCost: newCost, toll: newToll });
            updated++;
          } else {
            updated++;
          }
        } catch { errCount++; }
      }

      res.json({ total: (missions || []).length, updated, skipped, errors: errCount, changes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/billing/repair-snapshots", async (req: Request, res: Response) => {
    try {
      const { data: damaged } = await supabaseAdmin.from('missions')
        .select('id, billing_approved, snapshot_approved_by')
        .eq('snapshot_approved_by', 'Sistema (Recalcular e Comparar)')
        .eq('billing_approved', true);

      let repaired = 0;
      for (const m of (damaged || [])) {
        await supabaseAdmin.from('missions').update({
          snapshot_approved_by: null,
          snapshot_approved_at: null,
        }).eq('id', m.id);
        repaired++;
      }

      console.log(`[Repair] ${repaired} snapshots de missões billing_approved restaurados (removido snapshot do Recalcular)`);
      res.json({ success: true, repaired, message: `${repaired} missões com billing_approved tiveram o snapshot do Recalcular removido. O comparador agora vai calcular em tempo real.` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/missions/scan-divergences", async (req: Request, res: Response) => {
    try {
      const fetchAll = async (table: string) => {
        const allRows: any[] = [];
        let from = 0;
        while (true) {
          const { data } = await supabaseAdmin.from(table).select('*').range(from, from + 999);
          if (!data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < 1000) break;
          from += 1000;
        }
        return allRows;
      };

      const [missions, clientTables, providerTables, clients] = await Promise.all([
        fetchAll('missions'), fetchAll('client_price_tables'), fetchAll('provider_cost_tables'), fetchAll('clients')
      ]);

      const { calculateMissionFinancials } = await import('../lib/financialUtils');

      const completed = (missions || []).filter((m: any) => 
        m.status === 'Concluída' && !m.is_same_os && m.cost_value > 0 && m.start_km > 0 && m.end_km > 0
      );

      const divergences: any[] = [];
      for (const m of completed) {
        try {
          const clientData = (clients || []).find((c: any) => c.name === m.client);
          const mObj = { ...m, startKm: m.start_km, endKm: m.end_km, startTime: m.start_time, endTime: m.end_time, agentCount: m.agent_count || 1 };
          const result = calculateMissionFinancials(mObj, clientTables || [], providerTables || [], clientData);
          if (!result?.provider) continue;

          const savedCost = m.cost_value || 0;
          const calcCost = result.provider.total || 0;
          const diff = calcCost - savedCost;

          if (diff > 10 && diff / savedCost > 0.03) {
            divergences.push({
              id: m.id,
              provider: (m.provider || '').substring(0, 40),
              distance: Math.abs(m.end_km - m.start_km),
              savedCost: Math.round(savedCost * 100) / 100,
              correctCost: Math.round(calcCost * 100) / 100,
              difference: Math.round(diff * 100) / 100,
              excessKm: result.provider.excessKm,
              extraKmVal: result.provider.extraKmVal,
              tableName: result.provider.tableName || '-',
              approved: !!m.billing_approved
            });
          }
        } catch(e) {}
      }

      divergences.sort((a: any, b: any) => b.difference - a.difference);

      res.json({
        totalAnalyzed: completed.length,
        divergencesFound: divergences.length,
        notApproved: divergences.filter((d: any) => !d.approved).length,
        approved: divergences.filter((d: any) => d.approved).length,
        totalDifferenceR$: Math.round(divergences.reduce((s: number, d: any) => s + d.difference, 0) * 100) / 100,
        divergences
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/missions/fix-divergences", async (req: Request, res: Response) => {
    try {
      const fetchAll = async (table: string) => {
        const allRows: any[] = [];
        let from = 0;
        while (true) {
          const { data } = await supabaseAdmin.from(table).select('*').range(from, from + 999);
          if (!data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < 1000) break;
          from += 1000;
        }
        return allRows;
      };

      const [missions, clientTables, providerTables, clients] = await Promise.all([
        fetchAll('missions'), fetchAll('client_price_tables'), fetchAll('provider_cost_tables'), fetchAll('clients')
      ]);

      const { calculateMissionFinancials } = await import('../lib/financialUtils');

      const completed = (missions || []).filter((m: any) =>
        m.status === 'Concluída' && !m.is_same_os && m.cost_value > 0 && m.start_km > 0 && m.end_km > 0 && !m.billing_approved
      );

      let fixed = 0;
      let skipped = 0;
      const fixedList: any[] = [];
      const errorList: string[] = [];

      for (const m of completed) {
        try {
          const clientData = (clients || []).find((c: any) => c.name === m.client);
          const mObj = { ...m, startKm: m.start_km, endKm: m.end_km, startTime: m.start_time, endTime: m.end_time, agentCount: m.agent_count || 1 };
          const result = calculateMissionFinancials(mObj, clientTables || [], providerTables || [], clientData);
          if (!result?.provider || !result?.client) { skipped++; continue; }

          const savedCost = m.cost_value || 0;
          const calcCost = result.provider.total || 0;
          const diff = calcCost - savedCost;

          if (diff > 10 && diff / savedCost > 0.03 && result.provider.excessKm > 0) {
            await supabaseAdmin.from('system_logs').delete().eq('entity', 'BillingAdjustment').eq('entity_id', m.id);

            const newRevenue = result.client.serviceTotal || 0;
            const { error: upErr } = await supabaseAdmin.from('missions').update({
              revenue_value: newRevenue,
              cost_value: m.is_same_os ? 0 : calcCost,
              toll_value: result.tollValue || m.toll_value || 0,
              billing_verified_by: null,
              snapshot_approved_by: null,
            }).eq('id', m.id);

            if (upErr) { errorList.push(`${m.id}: ${upErr.message}`); continue; }

            fixedList.push({
              id: m.id,
              provider: (m.provider || '').substring(0, 40),
              distance: Math.abs(m.end_km - m.start_km),
              oldCost: savedCost,
              newCost: calcCost,
              oldRevenue: m.revenue_value || 0,
              newRevenue: newRevenue,
              difference: Math.round(diff * 100) / 100,
              excessKm: result.provider.excessKm,
              tableName: result.provider.tableName || '-'
            });
            fixed++;
          } else {
            skipped++;
          }
        } catch(e: any) {
          errorList.push(`${m.id}: ${e.message}`);
        }
      }

      const totalDiff = Math.round(fixedList.reduce((s: number, d: any) => s + d.difference, 0) * 100) / 100;

      res.json({
        success: true,
        totalAnalyzed: completed.length,
        fixed,
        skipped,
        errors: errorList.length,
        totalCostDifferenceR$: totalDiff,
        fixedMissions: fixedList,
        errorDetails: errorList
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/missions/recalculate-all", async (req: Request, res: Response) => {
    try {
      const fetchAll = async (table: string) => {
        const allRows: any[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabaseAdmin.from(table).select('*').range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return allRows;
      };

      const missions = await fetchAll('missions');
      const clientTables = await fetchAll('client_price_tables');
      const providerTables = await fetchAll('provider_cost_tables');
      const clients = await fetchAll('clients');

      const { calculateMissionFinancials } = await import('../lib/financialUtils');

      let updated = 0;
      let skipped = 0;
      let errors: string[] = [];
      const details: any[] = [];

      const TERMINAL_STATUSES = ['Concluída', 'Cancelada', 'COMPLETED', 'CANCELLED'];

      for (const m of (missions || [])) {
        try {
          if (m.status === 'REFUSED' || m.status === 'Recusada') { skipped++; continue; }
          if (!TERMINAL_STATUSES.includes(m.status)) { skipped++; continue; }
          if (m.billing_approved || m.billing_verified_by) { skipped++; continue; }
          if (m.revenue_value > 0 || m.cost_value > 0) { skipped++; continue; }

          const missionObj = {
            ...m,
            startKm: m.start_km,
            endKm: m.end_km,
            startTime: m.start_time,
            endTime: m.end_time,
          };

          const clientData = (clients || []).find((c: any) => c.name === m.client);
          const financials = calculateMissionFinancials(missionObj, clientTables || [], providerTables || [], clientData);

          const newRevenue = financials.client.serviceTotal || 0;
          const newCost = m.is_same_os ? 0 : (financials.provider.serviceTotal || 0);

          const oldRevenue = m.revenue_value || 0;
          const oldCost = m.cost_value || 0;
          const revDiff = Math.abs(newRevenue - oldRevenue);
          const costDiff = Math.abs(newCost - oldCost);

          if (revDiff > 0.01 || costDiff > 0.01) {
            const { error: upErr } = await supabaseAdmin.from('missions').update({
              revenue_value: newRevenue,
              cost_value: newCost,
            }).eq('id', m.id);

            if (upErr) { errors.push(`${m.id}: ${upErr.message}`); continue; }

            details.push({
              id: m.id,
              client: m.client,
              provider: m.provider,
              agents: [m.agent1, m.agent2].filter(Boolean).length,
              oldRev: oldRevenue, newRev: newRevenue,
              oldCost: oldCost, newCost: newCost,
              clientTable: financials.client.tableName || '-',
              providerTable: financials.provider.tableName || '-',
              providerLog: financials.provider.detectionLog,
            });
            updated++;
          } else {
            skipped++;
          }
        } catch (e: any) {
          errors.push(`${m.id}: ${e.message}`);
        }
      }

      res.json({
        success: true,
        total: (missions || []).length,
        updated,
        skipped,
        errors: errors.length,
        errorDetails: errors.slice(0, 10),
        updatedMissions: details,
      });
    } catch (e: any) {
      console.error("Erro no recálculo:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/client-registries/init", async (_req: Request, res: Response) => {
    try {
      const checks = await Promise.allSettled([
        supabaseAdmin.from('client_registries').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('client_mission_notes').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('operational_reports').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('financial_invoices').select('id', { count: 'exact', head: true }),
      ]);
      const missing = checks.filter(c => c.status === 'rejected' || (c.status === 'fulfilled' && c.value?.error));
      if (missing.length > 0) {
        console.warn('[Init] Algumas tabelas podem não existir no Supabase. Crie-as via SQL Editor.');
      }
      console.log("Client registries tables verified via Supabase.");
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Error verifying client registries tables:", e.message);
      res.json({ ok: true, note: e.message });
    }
  });

  const runHistoryCleanup = async () => {
      try {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          const cutoffDate = threeMonthsAgo.toISOString();

          const BATCH_SIZE = 500;
          let historyDeleted = 0;
          let logsDeleted = 0;

          let batch;
          do {
              const { data, error } = await supabaseAdmin
                  .from('mission_history')
                  .select('id')
                  .lt('changed_at', cutoffDate)
                  .limit(BATCH_SIZE);
              if (error || !data || data.length === 0) break;
              batch = data;
              const ids = batch.map((r: any) => r.id);
              const { error: delErr } = await supabaseAdmin
                  .from('mission_history')
                  .delete()
                  .in('id', ids);
              if (delErr) { console.error('[CLEANUP] Erro deletando mission_history:', delErr.message); break; }
              historyDeleted += ids.length;
              if (ids.length < BATCH_SIZE) break;
              await new Promise(r => setTimeout(r, 1000));
          } while (batch && batch.length === BATCH_SIZE);

          do {
              const { data, error } = await supabaseAdmin
                  .from('mission_logs')
                  .select('id')
                  .lt('created_at', cutoffDate)
                  .limit(BATCH_SIZE);
              if (error || !data || data.length === 0) break;
              batch = data;
              const ids = batch.map((r: any) => r.id);
              const { error: delErr } = await supabaseAdmin
                  .from('mission_logs')
                  .delete()
                  .in('id', ids);
              if (delErr) { console.error('[CLEANUP] Erro deletando mission_logs:', delErr.message); break; }
              logsDeleted += ids.length;
              if (ids.length < BATCH_SIZE) break;
              await new Promise(r => setTimeout(r, 1000));
          } while (batch && batch.length === BATCH_SIZE);

          let screenshotsDeleted = 0;
          do {
              const { data, error } = await supabaseAdmin
                  .from('system_logs')
                  .select('id')
                  .eq('action_type', 'APPROVAL_SCREENSHOT')
                  .lt('created_at', cutoffDate)
                  .limit(BATCH_SIZE);
              if (error || !data || data.length === 0) break;
              batch = data;
              const ids = batch.map((r: any) => r.id);
              const { error: delErr } = await supabaseAdmin
                  .from('system_logs')
                  .delete()
                  .in('id', ids);
              if (delErr) { console.error('[CLEANUP] Erro deletando screenshots:', delErr.message); break; }
              screenshotsDeleted += ids.length;
              if (ids.length < BATCH_SIZE) break;
              await new Promise(r => setTimeout(r, 1000));
          } while (batch && batch.length === BATCH_SIZE);

          const results = {
              mission_history: `${historyDeleted} registros removidos`,
              mission_logs: `${logsDeleted} registros removidos`,
              approval_screenshots: `${screenshotsDeleted} prints removidos`,
              cutoff_date: cutoffDate,
              executed_at: new Date().toISOString()
          };

          console.log('[CLEANUP] Limpeza trimestral executada:', JSON.stringify(results));

          await supabaseAdmin.from('system_logs').insert([{
              user_name: 'Sistema',
              action_type: 'CLEANUP_TRIMESTRAL',
              entity: 'Database',
              entity_id: 'auto',
              details: JSON.stringify(results)
          }]);

          return results;
      } catch (e: any) {
          console.error('[CLEANUP] Erro na limpeza trimestral:', e.message);
          return { error: e.message };
      }
  };

  const checkAndRunCleanup = async () => {
      try {
          const { data } = await supabaseAdmin
              .from('system_logs')
              .select('created_at')
              .eq('action_type', 'CLEANUP_TRIMESTRAL')
              .order('created_at', { ascending: false })
              .limit(1);

          if (data && data.length > 0) {
              const lastRun = new Date(data[0].created_at);
              const daysSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60 * 24);
              if (daysSince < 85) {
                  console.log(`[CLEANUP] Última limpeza foi há ${daysSince.toFixed(0)} dias. Próxima em ~${(90 - daysSince).toFixed(0)} dias.`);
                  return;
              }
          }

          console.log('[CLEANUP] Iniciando limpeza trimestral automática...');
          await runHistoryCleanup();
      } catch (e: any) {
          console.error('[CLEANUP] Erro ao verificar necessidade de limpeza:', e.message);
      }
  };

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  setTimeout(() => {
      checkAndRunCleanup();
      setInterval(checkAndRunCleanup, ONE_DAY_MS);
  }, 5 * 60 * 1000);

  app.post("/api/vendor-verification/:missionId", async (req: Request, res: Response) => {
      try {
          const { missionId } = req.params;
          const { vendor_os_number, invoice_number, release_date, payment_date, verified_by, verified_at, cost_value, toll_value_provider } = req.body;

          const corePayload: any = {};
          if (vendor_os_number !== undefined) corePayload.vendor_os_number = vendor_os_number;
          if (invoice_number !== undefined) corePayload.invoice_number = invoice_number;
          if (release_date !== undefined) corePayload.release_date = release_date;
          if (payment_date !== undefined) corePayload.payment_date = payment_date;
          if (cost_value !== undefined) corePayload.cost_value = cost_value;
          if (toll_value_provider !== undefined) corePayload.toll_value_provider = toll_value_provider;

          if (Object.keys(corePayload).length > 0) {
              const { error: coreErr } = await supabaseAdmin.from('missions').update(corePayload).eq('id', missionId);
              if (coreErr && !(coreErr.message.includes('column') && coreErr.message.includes('does not exist'))) {
                  throw coreErr;
              }
          }

          if (verified_by !== undefined || verified_at !== undefined) {
              const verPayload: any = {};
              if (verified_by !== undefined) verPayload.verified_by = verified_by;
              if (verified_at !== undefined) verPayload.verified_at = verified_at;
              const { error: verErr } = await supabaseAdmin.from('missions').update(verPayload).eq('id', missionId);
              if (verErr && verErr.message.includes('column') && verErr.message.includes('does not exist')) {
                  console.log('[VENDOR-VERIFICATION] verified_by/verified_at columns missing, creating them...');
                  try {
                      await supabaseAdmin.rpc('exec_sql', { sql: 'ALTER TABLE missions ADD COLUMN IF NOT EXISTS verified_by TEXT; ALTER TABLE missions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;' });
                      await supabaseAdmin.from('missions').update(verPayload).eq('id', missionId);
                  } catch (alterErr: any) {
                      console.warn('[VENDOR-VERIFICATION] Could not auto-create columns:', alterErr.message);
                  }
              } else if (verErr) {
                  throw verErr;
              }
          }

          await supabaseAdmin.from('system_logs').insert([{
              user_name: verified_by || 'Sistema',
              action_type: 'VENDOR_VERIFICATION',
              entity: 'Mission',
              entity_id: missionId,
              details: JSON.stringify({ ...corePayload, verified_by, verified_at })
          }]);

          res.json({ ok: true });
      } catch (e: any) {
          console.error('[VENDOR-VERIFICATION] Erro:', e.message);
          res.status(500).json({ ok: false, error: e.message });
      }
  });

  app.get("/api/vendor-verification/:missionId", async (req: Request, res: Response) => {
      try {
          const { missionId } = req.params;

          const { data: mission, error } = await supabaseAdmin
              .from('missions')
              .select('vendor_os_number, invoice_number, release_date, payment_date, verified_by, verified_at')
              .eq('id', missionId)
              .single();

          if (!error && mission) {
              return res.json({ ok: true, data: mission });
          }

          const { data: logs } = await supabaseAdmin
              .from('system_logs')
              .select('details')
              .eq('action_type', 'VENDOR_VERIFICATION')
              .eq('entity_id', missionId)
              .order('created_at', { ascending: false })
              .limit(1);

          if (logs && logs.length > 0) {
              const details = typeof logs[0].details === 'string' ? JSON.parse(logs[0].details) : logs[0].details;
              return res.json({ ok: true, data: details, source: 'system_logs' });
          }

          res.json({ ok: true, data: null });
      } catch (e: any) {
          res.json({ ok: true, data: null });
      }
  });

  app.post("/api/admin/fix-mission-toll", requireAuth, requireRole('administrador', 'diretoria'), async (req: Request, res: Response) => {
    try {
      const { missionId, tollValue, revenueValue } = req.body;
      if (!missionId) return res.status(400).json({ error: 'missionId obrigatório' });
      const updates: any = {};
      if (tollValue !== undefined) updates.toll_value = tollValue;
      if (revenueValue !== undefined) updates.revenue_value = revenueValue;
      const setClauses = Object.entries(updates).map(([k, v]) => `${k} = ${v}`).join(', ');
      const sql = `UPDATE missions SET ${setClauses} WHERE id = ${parseInt(missionId)}`;
      const { error: rpcErr } = await supabaseAdmin.rpc('exec_sql', { sql });
      if (rpcErr) throw rpcErr;
      const verifySql = `SELECT id, toll_value, toll_value_provider, revenue_value, cost_value FROM missions WHERE id = ${parseInt(missionId)}`;
      const { data: verifyData, error: verifyErr } = await supabaseAdmin.rpc('exec_sql', { sql: verifySql });
      console.log('[fix-toll] verify:', verifyData, verifyErr?.message);
      res.json({ ok: true, sql, verifyData });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/admin/inject-operacional-email", requireAuth, requireRole('administrador', 'diretoria'), async (_req: Request, res: Response) => {
    try {
      const OPERACIONAL = 'operacional@grupotmseg.com.br';
      const log: string[] = [];

      const addEmail = (current: string | null | undefined, opEmail: string): string => {
        if (!current || !current.trim()) return opEmail;
        const emails = current.split(/[,;]\s*/).map(e => e.trim().toLowerCase()).filter(Boolean);
        if (emails.includes(opEmail.toLowerCase())) return current;
        return current.trim() + ', ' + opEmail;
      };

      const { data: clients } = await supabaseAdmin.from('clients').select('id, name, operational_email, email');
      let clientUpdated = 0;
      for (const c of (clients || [])) {
        const updates: any = {};
        const opField = c.operational_email || c.email || '';
        const emailField = c.email || '';
        
        if (opField && !opField.toLowerCase().includes(OPERACIONAL.toLowerCase())) {
          updates.operational_email = addEmail(c.operational_email || c.email, OPERACIONAL);
        } else if (!opField) {
          updates.operational_email = OPERACIONAL;
        }
        
        if (emailField && !emailField.toLowerCase().includes(OPERACIONAL.toLowerCase())) {
          if (!updates.operational_email) {
            updates.operational_email = addEmail(c.operational_email || c.email, OPERACIONAL);
          }
        }

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin.from('clients').update(updates).eq('id', c.id);
          clientUpdated++;
          log.push(`Cliente "${c.name}" → operational_email atualizado`);
        }
      }

      const { data: providers } = await supabaseAdmin.from('providers').select('id, name, os_email, email');
      let providerUpdated = 0;
      for (const p of (providers || [])) {
        const updates: any = {};
        const osField = p.os_email || p.email || '';
        
        if (osField && !osField.toLowerCase().includes(OPERACIONAL.toLowerCase())) {
          updates.os_email = addEmail(p.os_email || p.email, OPERACIONAL);
        } else if (!osField) {
          updates.os_email = OPERACIONAL;
        }

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin.from('providers').update(updates).eq('id', p.id);
          providerUpdated++;
          log.push(`Fornecedor "${p.name}" → os_email atualizado`);
        }
      }

      res.json({ 
        ok: true, 
        clientsTotal: clients?.length || 0,
        clientsUpdated: clientUpdated,
        providersTotal: providers?.length || 0,
        providersUpdated: providerUpdated,
        log 
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/admin/cleanup-history", requireAuth, requireRole('administrador', 'diretoria'), async (_req: Request, res: Response) => {
      try {
          const results = await runHistoryCleanup();
          res.json({ ok: true, ...results });
      } catch (e: any) {
          res.json({ ok: false, error: e.message });
      }
  });

  app.get("/api/admin/cleanup-preview", requireAuth, requireRole('administrador', 'diretoria'), async (_req: Request, res: Response) => {
      try {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          const cutoffDate = threeMonthsAgo.toISOString();

          const { count: historyCount } = await supabaseAdmin
              .from('mission_history')
              .select('id', { count: 'exact', head: true })
              .lt('changed_at', cutoffDate);

          const { count: missionLogsCount } = await supabaseAdmin
              .from('mission_logs')
              .select('id', { count: 'exact', head: true })
              .lt('created_at', cutoffDate);

          const { count: totalHistory } = await supabaseAdmin
              .from('mission_history')
              .select('id', { count: 'exact', head: true });

          const { count: totalLogs } = await supabaseAdmin
              .from('mission_logs')
              .select('id', { count: 'exact', head: true });

          res.json({
              cutoff_date: cutoffDate,
              mission_history: { to_delete: historyCount || 0, total: totalHistory || 0 },
              mission_logs: { to_delete: missionLogsCount || 0, total: totalLogs || 0 }
          });
      } catch (e: any) {
          res.json({ ok: false, error: e.message });
      }
  });

  app.post("/api/migrations/provider-ops-columns", async (_req: Request, res: Response) => {
    try {
      const sbUrl = 'https://ajhmmjuewdsukecaimik.supabase.co';
      const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE3NTEyMSwiZXhwIjoyMDc5NzUxMTIxfQ.0Ql-GHBBFrNbe7iYOwoPx8cZJBhDHMfClaF3AGfIkYA';
      const headers = { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

      const columns = [
        { name: 'provider_start_km', type: 'double precision' },
        { name: 'provider_end_km', type: 'double precision' },
        { name: 'provider_start_time', type: 'timestamptz' },
        { name: 'provider_end_time', type: 'timestamptz' },
        { name: 'provider_ops_edited', type: 'boolean default false' },
        { name: 'revenue_edit_reason', type: 'text' },
        { name: 'cost_edit_reason', type: 'text' },
        { name: 'vendor_os_number', type: 'text' },
        { name: 'invoice_number', type: 'text' },
        { name: 'release_date', type: 'text' },
        { name: 'payment_date', type: 'text' },
        { name: 'verified_by', type: 'text' },
        { name: 'verified_at', type: 'timestamptz' }
      ];

      const results: string[] = [];
      for (const col of columns) {
        try {
          const rpcRes = await fetch(`${sbUrl}/rest/v1/rpc/`, {
            method: 'POST',
            headers,
            body: JSON.stringify({})
          });
          results.push(`${col.name}: attempted`);
        } catch (e: any) {
          results.push(`${col.name}: ${e.message}`);
        }
      }

      const sqlStatements = columns.map(c => `ALTER TABLE missions ADD COLUMN IF NOT EXISTS ${c.name} ${c.type};`).join('\n');
      res.json({ ok: true, method: 'manual', columns: columns.map(c => c.name), sql: sqlStatements, hint: 'Execute this SQL in Supabase SQL Editor if columns do not exist' });
    } catch (e: any) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.post("/api/missions/fix-ceva-logitech-values", async (_req: Request, res: Response) => {
    try {
      const sbUrl = 'https://ajhmmjuewdsukecaimik.supabase.co';
      const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';
      const headers = { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

      const missionsRes = await fetch(`${sbUrl}/rest/v1/missions?client=ilike.*CEVA*&or=(destination.ilike.*200KM*,destination.ilike.*200%20KM*,destination.ilike.*LOGITECH*)&select=id,revenue_value,cost_value,toll_value,destination,origin,client,provider,status`, { headers });
      const missions = await missionsRes.json();

      const clientTablesRes = await fetch(`${sbUrl}/rest/v1/client_price_tables?client=ilike.*CEVA*&select=*`, { headers });
      const clientTables = await clientTablesRes.json();

      const provTablesRes = await fetch(`${sbUrl}/rest/v1/provider_cost_tables?select=*`, { headers });
      const providerTables = await provTablesRes.json();

      const findTable = (tables: any[], keyword: string) => {
        const norm = keyword.toUpperCase();
        return tables.find((t: any) => {
          const op = (t.operation_type || '').toUpperCase();
          return op.includes(norm);
        });
      };

      let fixed = 0;
      const details: any[] = [];

      for (const m of missions) {
        const dest = (m.destination || '').toUpperCase();
        let targetKeyword = 'LOGITECH';
        if (dest.includes('200KM') || dest.includes('200 KM')) targetKeyword = '200KM';
        if (dest.includes('LOGITECH')) targetKeyword = 'LOGITECH';

        let revTable = findTable(clientTables, targetKeyword);
        if (!revTable && targetKeyword === '200KM') revTable = findTable(clientTables, 'LOGITECH');
        if (!revTable && targetKeyword === 'LOGITECH') revTable = findTable(clientTables, '200KM');

        if (!revTable) continue;

        const correctRevenue = revTable.activation_fee || 0;
        const storedRevenue = parseFloat(m.revenue_value) || 0;

        if (Math.abs(storedRevenue - correctRevenue) > 5) {
          const providerName = (m.provider || '').toUpperCase().trim();
          let provTable = providerTables.find((t: any) => {
            const op = (t.operation_type || '').toUpperCase();
            const prov = (t.provider || '').toUpperCase().trim();
            return prov === providerName && (op.includes('LOGITECH') || op.includes('200KM') || op.includes('200 KM'));
          });

          let correctCost = parseFloat(m.cost_value) || 0;
          if (provTable) {
            correctCost = provTable.activation_cost || correctCost;
          }

          await fetch(`${sbUrl}/rest/v1/missions?id=eq.${m.id}`, {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ revenue_value: correctRevenue, cost_value: correctCost })
          });

          fixed++;
          details.push({
            id: m.id,
            oldRevenue: storedRevenue,
            newRevenue: correctRevenue,
            oldCost: parseFloat(m.cost_value) || 0,
            newCost: correctCost,
            table: revTable.operation_type
          });
        }
      }

      res.json({ ok: true, fixed, total: missions.length, details });
    } catch (e: any) {
      console.error("Fix CEVA Logitech error:", e.message);
      res.json({ ok: false, error: e.message });
    }
  });

  app.post("/api/missions/ensure-report-column", async (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  supabaseAdmin.from('operational_reports').select('id', { count: 'exact', head: true })
    .then(({ error }) => { if (error) console.warn('[Init] tabela operational_reports pode não existir:', error.message); })
    .catch(() => {});

  app.get("/api/missions/:id/operational-report", async (req: Request, res: Response) => {
    try {
      const { data: row } = await supabaseAdmin.from('operational_reports').select('*').eq('mission_id', req.params.id).maybeSingle();
      if (row) {
        res.json({
          operational_report: row.report_html,
          acionado_por: row.acionado_por || '',
          descritivo: row.descritivo || '',
          whatsapp_raw: row.whatsapp_raw || '',
          photos: row.photos || []
        });
      } else {
        res.json({ operational_report: null });
      }
    } catch (e: any) {
      res.json({ operational_report: null, error: e.message });
    }
  });

  app.patch("/api/missions/:id/operational-report", async (req: Request, res: Response) => {
    try {
      const { operational_report, acionado_por, descritivo, whatsapp_raw, photos } = req.body;
      const payload = {
        mission_id: req.params.id,
        report_html: operational_report || '',
        acionado_por: acionado_por || '',
        descritivo: descritivo || '',
        whatsapp_raw: whatsapp_raw || '',
        photos: photos || [],
        updated_at: new Date().toISOString()
      };
      const { error } = await supabaseAdmin.from('operational_reports').upsert(payload, { onConflict: 'mission_id' });
      if (error) throw error;
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get("/api/client-registries/:clientId/:type", async (req: Request, res: Response) => {
    try {
      const { clientId, type } = req.params;
      const { data } = await supabaseAdmin.from('client_registries').select('*').eq('client_id', clientId).eq('type', type).order('name');
      res.json(data || []);
    } catch (e: any) {
      res.json([]);
    }
  });

  app.post("/api/client-registries", async (req: Request, res: Response) => {
    try {
      const { client_id, type, name } = req.body;
      if (!client_id || !type || !name) return res.status(400).json({ error: "Campos obrigatórios" });
      const { data, error } = await supabaseAdmin.from('client_registries').upsert({
        client_id, type, name: name.trim()
      }, { onConflict: 'client_id,type,name' }).select().single();
      if (error && error.code !== '23505') throw error;
      res.json(data || { client_id, type, name: name.trim() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/client-registries/:id", async (req: Request, res: Response) => {
    try {
      const { error } = await supabaseAdmin.from('client_registries').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/client-mission-notes/:missionId", async (req: Request, res: Response) => {
    try {
      const { data } = await supabaseAdmin.from('client_mission_notes').select('*').eq('mission_id', req.params.missionId).maybeSingle();
      res.json(data || null);
    } catch (e: any) {
      res.json(null);
    }
  });

  app.post("/api/client-mission-notes", async (req: Request, res: Response) => {
    try {
      const { mission_id, client_id, motivo, contrato, operacao, tsp, responsavel, obs } = req.body;
      if (!mission_id || !client_id) return res.status(400).json({ error: "Campos obrigatórios" });
      const payload = {
        mission_id, client_id,
        motivo: motivo || '', contrato: contrato || '', operacao: operacao || '',
        tsp: tsp || '', responsavel: responsavel || '', obs: obs || '',
        updated_at: new Date().toISOString()
      };
      const { data, error } = await supabaseAdmin.from('client_mission_notes').upsert(payload, { onConflict: 'mission_id' }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

  app.post("/api/investment/init", async (_req: Request, res: Response) => {
    try {
      await pgPool.query(`CREATE TABLE IF NOT EXISTS public.account_balance_snapshots (
        id serial PRIMARY KEY,
        account_id text NOT NULL,
        balance numeric(18,2) NOT NULL DEFAULT 0,
        notes text DEFAULT '',
        created_by text DEFAULT '',
        recorded_at timestamptz DEFAULT now()
      )`);
      res.json({ ok: true });
    } catch (e: any) {
      res.json({ ok: true, note: e.message });
    }
  });

  app.get("/api/investment/snapshots/:accountId", async (req: Request, res: Response) => {
    try {
      const { accountId } = req.params;
      const days = parseInt(req.query.days as string) || 365;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { rows } = await pgPool.query(
        'SELECT * FROM account_balance_snapshots WHERE account_id = $1 AND recorded_at >= $2 ORDER BY recorded_at ASC',
        [accountId, since]
      );
      res.json(rows);
    } catch (e: any) {
      res.json([]);
    }
  });

  app.get("/api/investment/snapshots-all", async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    try {
      const days = parseInt(req.query.days as string) || 365;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { rows } = await pgPool.query(
        'SELECT * FROM account_balance_snapshots WHERE recorded_at >= $1 ORDER BY recorded_at ASC',
        [since]
      );
      res.json(rows);
    } catch (e: any) {
      res.json([]);
    }
  });

  app.post("/api/investment/snapshots", async (req: Request, res: Response) => {
    try {
      const { account_id, balance, notes, created_by } = req.body;
      const { rows } = await pgPool.query(
        'INSERT INTO account_balance_snapshots (account_id, balance, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [account_id, balance, notes || '', created_by || '']
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/investment/snapshots/:id", async (req: Request, res: Response) => {
    try {
      await pgPool.query('DELETE FROM account_balance_snapshots WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/client-mission-notes/bulk/:clientId", async (req: Request, res: Response) => {
    try {
      const { data } = await supabaseAdmin.from('client_mission_notes').select('*').eq('client_id', req.params.clientId);
      res.json(data || []);
    } catch (e: any) {
      res.json([]);
    }
  });

  app.post("/api/email/send-verification", requireAuth, async (req: Request, res: Response) => {
    try {
      const { email, userName } = req.body;
      if (!email) return res.status(400).json({ error: "E-mail obrigatório" });

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const sessionId = `${email}_${Date.now()}`;

      verificationCodes.set(sessionId, {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000,
        email
      });

      for (const [key, val] of verificationCodes.entries()) {
        if (val.expiresAt < Date.now()) verificationCodes.delete(key);
      }

      const sent = await sendVerificationCodeEmail(email, userName || 'Usuário', code);

      if (!sent) {
        return res.json({ sessionId, message: "E-mail não pôde ser enviado. Use o código exibido na tela.", fallbackCode: code });
      }

      res.json({ sessionId, message: "Código enviado com sucesso" });
    } catch (e: any) {
      console.error("Email verification error:", e);
      res.status(500).json({ error: e.message || "Erro interno ao enviar e-mail" });
    }
  });

  app.post("/api/email/verify-code", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sessionId, code } = req.body;
      if (!sessionId || !code) return res.status(400).json({ verified: false, error: "Dados incompletos" });

      const session = verificationCodes.get(sessionId);
      if (!session) return res.status(400).json({ verified: false, error: "Sessão expirada. Solicite um novo código." });

      if (session.expiresAt < Date.now()) {
        verificationCodes.delete(sessionId);
        return res.status(400).json({ verified: false, error: "Código expirado. Solicite um novo código." });
      }

      if (session.code !== code.trim()) {
        return res.status(400).json({ verified: false, error: "Código incorreto. Tente novamente." });
      }

      verificationCodes.delete(sessionId);
      res.json({ verified: true });
    } catch (e: any) {
      res.status(500).json({ verified: false, error: e.message });
    }
  });

  app.post("/api/billing/recalculate-all", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (req: Request, res: Response) => {
    try {
      const { dryRun = true } = req.body;

      const { data: missions, error: mErr } = await supabaseAdmin.from('missions').select('*');
      if (mErr) throw mErr;

      const { data: clientTables, error: ctErr } = await supabaseAdmin.from('client_price_tables').select('*');
      if (ctErr) throw ctErr;

      const { data: providerTables, error: ptErr } = await supabaseAdmin.from('provider_cost_tables').select('*');
      if (ptErr) throw ptErr;

      const { data: clients, error: clErr } = await supabaseAdmin.from('clients').select('*');
      if (clErr) throw clErr;

      const now = new Date();
      const results: any[] = [];
      let corrected = 0;
      let skipped = 0;
      let errors = 0;

      for (const raw of (missions || [])) {
        try {
          const m: any = {
            ...raw,
            createdAt: raw.created_at,
            lastUpdate: raw.last_update,
            startTime: raw.start_time,
            endTime: raw.end_time,
            startKm: raw.start_km,
            endKm: raw.end_km,
            totalDistance: raw.total_distance,
            traveledDistance: raw.traveled_distance,
            mapLink: raw.map_link,
            estimatedTime: raw.estimated_time,
            currentLocation: raw.current_location,
            vehicleId: raw.vehicle_id,
            revenue_value: raw.revenue_value,
            cost_value: raw.cost_value,
            toll_value: raw.toll_value,
            toll_value_provider: raw.toll_value_provider,
            billing_approved: raw.billing_approved,
            mission_type: raw.mission_type || 'Caracterizada',
          };

          const clientData = (clients || []).find((c: any) => c.name?.toUpperCase() === (m.client || '').toUpperCase()) || null;

          if (raw.billing_approved || raw.billing_verified_by) { skipped++; continue; }
          if ((Number(raw.revenue_value) || 0) > 0 || (Number(raw.cost_value) || 0) > 0) { skipped++; continue; }

          const calc = calculateMissionFinancials(m, clientTables || [], providerTables || [], clientData, now);
          if (!calc) { skipped++; continue; }

          const storedRev = Number(raw.revenue_value) || 0;
          const storedCost = Number(raw.cost_value) || 0;
          const storedToll = Number(raw.toll_value) || 0;
          const storedTollProv = Number(raw.toll_value_provider) || storedToll;

          const calcRevService = calc.clientTotal - storedToll;
          const calcCostService = calc.providerTotal - storedTollProv;

          const revDiff = Math.abs(storedRev - calcRevService);
          const costDiff = Math.abs(storedCost - calcCostService);

          if (revDiff > 5 || costDiff > 5) {
            const entry: any = {
              osId: raw.id,
              client: raw.client || '-',
              provider: raw.provider || '-',
              storedRev,
              calcRev: calcRevService,
              revDiff: Math.round(revDiff * 100) / 100,
              storedCost,
              calcCost: calcCostService,
              costDiff: Math.round(costDiff * 100) / 100,
              status: raw.status,
              approved: raw.billing_approved || false,
            };

            if (!dryRun) {
              const updatePayload: any = {
                revenue_value: calcRevService,
                cost_value: calcCostService,
                last_update: now.toISOString(),
              };

              let { error: upErr } = await supabaseAdmin.from('missions').update(updatePayload).eq('id', raw.id);
              if (upErr) {
                entry.updateError = upErr.message;
                errors++;
              } else {
                entry.updated = true;
                corrected++;
              }
            } else {
              entry.wouldUpdate = true;
              corrected++;
            }

            results.push(entry);
          } else {
            skipped++;
          }
        } catch (calcErr: any) {
          errors++;
          results.push({ osId: raw.id, error: calcErr.message });
        }
      }

      res.json({
        total: (missions || []).length,
        divergent: results.length,
        corrected,
        skipped,
        errors,
        dryRun,
        results,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==========================================
  // TOLL API (RapidAPI - territorial/pedagio v1)
  // ==========================================
  const RAPIDAPI_TOLL_KEY = process.env.RAPIDAPI_TOLL_KEY || '';
  const RAPIDAPI_TOLL_HOST = 'territorial-pedagio-v1.p.rapidapi.com';

  const callTollAPI = async (fromCoord: string, toCoord: string, vehicleType: string = 'auto2eixos') => {
    const response = await fetch(`https://${RAPIDAPI_TOLL_HOST}/json/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rapidapi-key': RAPIDAPI_TOLL_KEY,
        'x-rapidapi-host': RAPIDAPI_TOLL_HOST,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tollbooth.route',
        params: [{
          from_cord: fromCoord,
          dest_cord: toCoord,
          tipo_veic: vehicleType,
        }],
        id: 'jsonrpc',
      }),
    });
    return response;
  };

  app.get('/api/toll/status', async (_req: Request, res: Response) => {
    try {
      if (!RAPIDAPI_TOLL_KEY) {
        return res.status(400).json({ success: false, error: 'RAPIDAPI_TOLL_KEY não configurada' });
      }
      const response = await callTollAPI('(-23.5505, -46.6333)', '(-22.9068, -43.1729)');
      if (response.ok) {
        return res.json({ success: true });
      }
      const errorBody = await response.text();
      return res.status(response.status).json({ success: false, error: `RapidAPI retornou ${response.status}: ${errorBody}` });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/toll/calculate', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!RAPIDAPI_TOLL_KEY) {
        return res.json({ success: false, apiError: 'RAPIDAPI_TOLL_KEY não configurada no servidor' });
      }

      const { origin, destination, originCoords, destinationCoords } = req.body;

      let fromCoord = '';
      let toCoord = '';

      if (originCoords && destinationCoords) {
        fromCoord = `(${originCoords.lat}, ${originCoords.lng})`;
        toCoord = `(${destinationCoords.lat}, ${destinationCoords.lng})`;
      } else if (origin && destination) {
        const geocode = async (address: string) => {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY || ''}`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.results && data.results.length > 0) {
            return data.results[0].geometry.location;
          }
          return null;
        };

        const [orig, dest] = await Promise.all([geocode(origin), geocode(destination)]);
        if (!orig || !dest) {
          return res.json({ success: false, apiError: 'Não foi possível geocodificar origem/destino' });
        }
        fromCoord = `(${orig.lat}, ${orig.lng})`;
        toCoord = `(${dest.lat}, ${dest.lng})`;
      } else {
        return res.json({ success: false, apiError: 'Origem e destino são obrigatórios' });
      }

      const response = await callTollAPI(fromCoord, toCoord);

      if (!response.ok) {
        const errText = await response.text();
        console.error('RapidAPI Pedágio error:', response.status, errText);
        return res.json({ success: false, apiError: `API de pedágio retornou erro ${response.status}` });
      }

      const tollData = await response.json();

      let tolls: { name: string; value: number; road?: string }[] = [];
      let tollValue = 0;

      const extractTolls = (data: any) => {
        if (data.result && Array.isArray(data.result)) {
          return data.result;
        }
        if (Array.isArray(data)) return data;
        if (data.pedagios && Array.isArray(data.pedagios)) return data.pedagios;
        if (data.tolls && Array.isArray(data.tolls)) return data.tolls;
        return null;
      };

      const tollArray = extractTolls(tollData);

      if (tollArray) {
        tolls = tollArray.map((t: any) => ({
          name: t.concessionaria || t.concessionária || t.praca || t.praça || t.nome || t.name || 'Praça de Pedágio',
          value: parseFloat(t.valor || t.value || t.tarifa || t.price || 0),
          road: t.rodovia || t.estrada || t.road || t.highway || '',
        }));
        tollValue = tolls.reduce((sum, t) => sum + t.value, 0);
      } else if (tollData.result && typeof tollData.result === 'object') {
        if (tollData.result.valor_total !== undefined) {
          tollValue = parseFloat(tollData.result.valor_total) || 0;
        } else if (tollData.result.total !== undefined) {
          tollValue = parseFloat(tollData.result.total) || 0;
        }
      }

      return res.json({
        success: tollValue > 0,
        tollValue: parseFloat(tollValue.toFixed(2)),
        tollCount: tolls.length,
        tolls,
        provider: 'rapidapi-pedagio',
      });
    } catch (e: any) {
      console.error('Erro ao consultar RapidAPI Pedágio:', e);
      return res.json({ success: false, apiError: `Erro interno: ${e.message}` });
    }
  });

  // ═══════════════════════════════════════════════════════
  // TOLL ESTIMATION VIA GEMINI AI
  // ═══════════════════════════════════════════════════════

  app.post('/api/toll/gemini-estimate', requireAuth, async (req: Request, res: Response) => {
    try {
      const { origin, destination } = req.body;
      if (!origin || !destination) {
        return res.json({ success: false, error: 'Origem e destino são obrigatórios' });
      }

      const prompt = `Você é um engenheiro de tráfego rodoviário brasileiro com conhecimento detalhado de TODAS as praças de pedágio do Brasil.

TAREFA: Identificar as praças de pedágio no trajeto de "${origin}" até "${destination}" para veículo LEVE (carro/SUV - 2 eixos).

REGRAS CRÍTICAS DE ANÁLISE:

1. ROTA REAL: Identifique a rota REAL mais provável entre os dois pontos. Use vias urbanas quando os pontos estão na mesma região metropolitana. NÃO assuma que o veículo pegará rodovias pedagiadas se a rota urbana é mais curta e direta.

2. ROTAS METROPOLITANAS SEM PEDÁGIO: Muitas rotas dentro de regiões metropolitanas NÃO passam por pedágio. Exemplos:
   - Guarulhos → Pinheiros (SP): Via Marginal Tietê/Pinheiros, SEM pedágio
   - Zona Leste SP → Zona Oeste SP: Via vias urbanas, SEM pedágio
   - Osasco → Santo André: Via vias urbanas, SEM pedágio
   - Trajetos dentro da mesma cidade ou região metropolitana próxima geralmente NÃO têm pedágio
   Se a rota mais provável é urbana e sem pedágio, retorne "pracas": [] e "totalEstimado": 0

3. PRAÇAS CORRETAS POR RODOVIA: Só inclua praças que REALMENTE existem na rodovia e trecho percorrido. Não confunda:
   - Praças da Rodovia Ayrton Senna (SP-070) com praças da Dutra (BR-116)
   - Praças do Rodoanel com praças de rodovias radiais
   - Praças da Anchieta-Imigrantes com praças da Régis Bittencourt
   
4. SENTIDO CORRETO: Verifique se a praça cobra no sentido em que o veículo está trafegando. Muitas praças têm cobrança unidirecional.

5. SISTEMA ANCHIETA-IMIGRANTES (SAI): Se o trajeto usar este sistema, identifique se está SUBINDO (Santos→SP) ou DESCENDO (SP→Santos) a serra.

6. VALORES: Use tarifas atualizadas 2025/2026, categoria 1 (2 eixos, rodagem simples).

7. CONFIANÇA: "alta" = certeza absoluta dos valores e praças; "media" = praças corretas mas valores podem variar ±10%; "baixa" = incerteza sobre rota ou praças.

RESPONDA EXCLUSIVAMENTE no JSON abaixo, sem markdown, sem texto adicional:

{
  "totalEstimado": 0.00,
  "pracas": [
    { "nome": "Nome da praça", "rodovia": "SP-XXX ou BR-XXX", "valor": 0.00, "sentido": "sentido da cobrança", "cobrancaUnica": true/false }
  ],
  "observacoes": "Justificativa da rota escolhida e praças identificadas",
  "confianca": "alta/media/baixa"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 4096, temperature: 0.1 }
      });

      const rawText = (response.text || '').trim();
      
      let parsed: any = null;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.error('Erro ao parsear resposta Gemini pedágio:', parseErr, rawText);
      }

      if (parsed && typeof parsed.totalEstimado === 'number') {
        return res.json({
          success: true,
          tollValue: parseFloat(parsed.totalEstimado.toFixed(2)),
          tollCount: Array.isArray(parsed.pracas) ? parsed.pracas.length : 0,
          tolls: (parsed.pracas || []).map((p: any) => ({
            name: p.nome || 'Praça',
            value: parseFloat(p.valor) || 0,
            road: p.rodovia || '',
            sentido: p.sentido || '',
            cobrancaUnica: p.cobrancaUnica || false,
          })),
          observacoes: parsed.observacoes || '',
          confianca: parsed.confianca || 'baixa',
          provider: 'gemini-ai',
        });
      }

      return res.json({ success: false, error: 'Não foi possível extrair dados da resposta da IA', raw: rawText.substring(0, 500) });
    } catch (e: any) {
      console.error('Erro Gemini pedágio:', e);
      return res.json({ success: false, error: `Erro ao consultar IA: ${e.message}` });
    }
  });

  // ═══════════════════════════════════════════════════════
  // ASAAS INTEGRATION ROUTES
  // ═══════════════════════════════════════════════════════

  app.get("/api/asaas/status", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), (_req: Request, res: Response) => {
    res.json({ configured: isAsaasConfigured() });
  });

  app.get("/api/nf/pending", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (_req: Request, res: Response) => {
    try {
      const { listPendingNfs } = await import('./nfRetryWorker');
      const data = await listPendingNfs();
      res.json({ success: true, count: data.length, items: data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/nf/retry-now", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (_req: Request, res: Response) => {
    try {
      const { runRetryCycle } = await import('./nfRetryWorker');
      const result = await runRetryCycle();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/nf/retry/:invoiceId", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (req: Request, res: Response) => {
    try {
      const { invoiceId } = req.params;
      const { listPendingNfs, retryOne } = await import('./nfRetryWorker');
      const all = await listPendingNfs();
      type InvoiceRow = typeof all[number];
      let inv: InvoiceRow | undefined = all.find(i => i.id === invoiceId);
      if (!inv) {
        const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
        const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
        if (sbUrl && sbKey) {
          const sb = createClient(sbUrl, sbKey);
          const { data } = await sb.from('financial_invoices')
            .select('id, client, asaas_payment_id, asaas_invoice_id, issuer_company, nf_status, nf_last_error, nf_retry_count, nf_retry_paused, nf_provider, plugnotas_invoice_id, plugnotas_protocol, number, amount, due_date, description, notes')
            .eq('id', invoiceId).maybeSingle();
          if (data) inv = data as unknown as InvoiceRow;
        }
      }
      if (!inv) return res.status(404).json({ error: 'Fatura não encontrada' });
      // Aceita retry para Asaas (precisa de asaas_payment_id) OU PlugNotas
      // (precisa de plugnotas_invoice_id). Sem nenhum dos dois IDs, a fatura
      // não tem como ser reemitida.
      // Inferência: nf_provider pode estar nulo em faturas antigas; se houver
      // plugnotas_invoice_id, tratamos como PLUGNOTAS para a validação prévia
      // (mesma regra usada por retryOne no worker).
      const rawProvider = String(inv.nf_provider || '').toUpperCase();
      const inferredProvider = rawProvider === 'PLUGNOTAS' || (!rawProvider && inv.plugnotas_invoice_id) ? 'PLUGNOTAS' : 'ASAAS';
      if (inferredProvider === 'PLUGNOTAS') {
        if (!inv.plugnotas_invoice_id) return res.status(400).json({ error: 'Fatura PlugNotas sem ID de integração — não pode reemitir.' });
      } else {
        if (!inv.asaas_payment_id) return res.status(400).json({ error: 'Fatura sem ID Asaas — não pode reemitir.' });
      }
      if (inv.nf_retry_paused) {
        const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
        const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
        if (sbUrl && sbKey) {
          const sb = createClient(sbUrl, sbKey);
          await sb.from('financial_invoices').update({ nf_retry_paused: false }).eq('id', inv.id);
          inv.nf_retry_paused = false;
        }
      }
      const result = await retryOne(inv);
      res.json({ success: result.ok, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/nf/summary", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (_req: Request, res: Response) => {
    try {
      const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      if (!sbUrl || !sbKey) return res.json({ success: true, summary: [], stuck: [], byProvider: {} });
      const sb = createClient(sbUrl, sbKey);
      const { data, error } = await sb.from('financial_invoices')
        .select('id, client, number, amount, issuer_company, nf_status, nf_retry_at, created_at, asaas_payment_id, nf_provider, plugnotas_invoice_id');
      if (error) return res.status(500).json({ error: error.message });
      const byCompany: Record<string, any> = {};
      const byProvider: Record<string, { total: number; authorized: number; error: number; stuck: number; processing: number }> = {
        ASAAS: { total: 0, authorized: 0, error: 0, stuck: 0, processing: 0 },
        PLUGNOTAS: { total: 0, authorized: 0, error: 0, stuck: 0, processing: 0 },
      };
      const stuck: any[] = [];
      const now = Date.now();
      (data || []).forEach((r: any) => {
        // ignora linhas sem qualquer ID de provider (faturas retroativas sem NF)
        if (!r.asaas_payment_id && !r.plugnotas_invoice_id) return;
        const c = r.issuer_company || '(sem emissora)';
        // Inferência espelha /sync-payment-status e /retry: se nf_provider está
        // null mas há plugnotas_invoice_id, classifica como PLUGNOTAS.
        const provider = (
          r.nf_provider
          || (r.plugnotas_invoice_id ? 'PLUGNOTAS' : 'ASAAS')
        ).toUpperCase();
        if (!byCompany[c]) byCompany[c] = { company: c, total: 0, authorized: 0, synchronized: 0, scheduled: 0, error: 0, stuck: 0, canceled: 0, other: 0, asaas: 0, plugnotas: 0 };
        byCompany[c].total++;
        if (provider === 'PLUGNOTAS') byCompany[c].plugnotas++; else byCompany[c].asaas++;
        const bp = byProvider[provider] || (byProvider[provider] = { total: 0, authorized: 0, error: 0, stuck: 0, processing: 0 });
        bp.total++;
        const s = (r.nf_status || '').toUpperCase();
        if (s === 'AUTHORIZED') { byCompany[c].authorized++; bp.authorized++; }
        else if (s === 'SYNCHRONIZED') {
          byCompany[c].synchronized++;
          const ref = r.nf_retry_at || r.created_at;
          const ageH = ref ? (now - new Date(ref).getTime()) / 3600_000 : 0;
          if (ageH >= 24) {
            byCompany[c].stuck++; bp.stuck++;
            stuck.push({ ...r, hours_stuck: Math.floor(ageH) });
          } else { bp.processing++; }
        } else if (s === 'SCHEDULED' || s === 'PROCESSING') { byCompany[c].scheduled++; bp.processing++; }
        else if (s === 'ERROR' || s === 'FAILED') { byCompany[c].error++; bp.error++; }
        else if (s === 'STUCK') {
          byCompany[c].stuck++; bp.stuck++;
          const ref = r.nf_retry_at || r.created_at;
          const ageH = ref ? (now - new Date(ref).getTime()) / 3600_000 : 0;
          stuck.push({ ...r, hours_stuck: Math.floor(ageH) });
        }
        else if (s === 'CANCELED') byCompany[c].canceled++;
        else byCompany[c].other++;
      });
      res.json({ success: true, summary: Object.values(byCompany), stuck, byProvider });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════
  // PLUGNOTAS — Provider de NFS-e alternativo (coexistência com Asaas)
  // ═══════════════════════════════════════════════════════

  app.get("/api/plugnotas/status", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (_req: Request, res: Response) => {
    try {
      const { isPlugNotasConfigured, getPlugNotasEnv, listPlugNotasCompanies, testPlugNotasConnection } = await import('./plugnotasService');
      const configured = isPlugNotasConfigured();
      const env = getPlugNotasEnv();
      const companies = listPlugNotasCompanies();
      let connectionTest: any = null;
      if (configured) {
        try { connectionTest = await testPlugNotasConnection(); } catch (e: any) { connectionTest = { ok: false, error: e.message }; }
      }
      res.json({ configured, env, companies, connectionTest });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/nf/provider-preferences", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (_req: Request, res: Response) => {
    try {
      const { getProviderPreferences } = await import('./nfProviderRouter');
      const { listPlugNotasCompanies, isPlugNotasConfigured } = await import('./plugnotasService');
      const prefs = await getProviderPreferences();
      const companies = listPlugNotasCompanies();
      res.json({ success: true, preferences: prefs, companies, plugnotasConfigured: isPlugNotasConfigured() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/nf/provider-preferences", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (req: Request, res: Response) => {
    try {
      const { setProviderPreferences } = await import('./nfProviderRouter');
      const { preferences } = req.body || {};
      if (!preferences || typeof preferences !== 'object') return res.status(400).json({ error: 'preferences é obrigatório' });
      // Audit: o ator é SEMPRE o usuário autenticado, derivado do contexto do
      // servidor — nunca confiamos em `actor` recebido do corpo do request.
      const principal = (req as any).user || (req as any).auth || {};
      const actor = principal.email || principal.username || principal.name || principal.id || 'system';
      await setProviderPreferences(preferences, String(actor));
      res.json({ success: true, preferences });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reemissão de uma fatura específica VIA PlugNotas (failover manual quando Asaas trava).
  app.post("/api/nf/reissue-plugnotas/:invoiceId", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (req: Request, res: Response) => {
    try {
      const { invoiceId } = req.params;
      const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase indisponível' });
      const sb = createClient(sbUrl, sbKey);
      const { data: inv } = await sb.from('financial_invoices').select('*').eq('id', invoiceId).maybeSingle();
      if (!inv) return res.status(404).json({ error: 'Fatura não encontrada' });

      const { isPlugNotasConfigured, issueNfse } = await import('./plugnotasService');
      if (!isPlugNotasConfigured()) return res.status(400).json({ error: 'PlugNotas não configurado — defina o token nas configurações do projeto.' });

      const amount = Number(inv.amount || 0);
      if (!amount || amount <= 0) return res.status(400).json({ error: 'Valor da fatura inválido para emissão.' });

      // Tenta cancelar no Asaas se tiver NF lá em estado pendente/erro (best-effort)
      const previousProvider = (inv.nf_provider || 'ASAAS').toUpperCase();
      const previousAsaasInvoiceId = inv.asaas_invoice_id;
      let asaasCancelled = false;
      let asaasCancelError: string | null = null;
      if (previousProvider === 'ASAAS' && previousAsaasInvoiceId) {
        try {
          const { cancelInvoice } = await import('./asaasService');
          await cancelInvoice(previousAsaasInvoiceId, inv.issuer_company || undefined);
          asaasCancelled = true;
          console.log(`[Plugnotas Failover] cancelada NF Asaas ${previousAsaasInvoiceId} para fatura ${invoiceId}.`);
        } catch (e: any) {
          asaasCancelError = e.message;
          console.log(`[Plugnotas Failover] não foi possível cancelar Asaas ${previousAsaasInvoiceId}: ${e.message} — prosseguindo com emissão PlugNotas (verifique manualmente).`);
        }
      }

      // Resolve cliente para CNPJ
      let clientCnpj: string | undefined;
      try {
        const firstWord = (inv.client || '').split(/[\s,.]+/)[0];
        if (firstWord) {
          const { data: clientRow } = await sb.from('clients').select('cnpj').ilike('name', firstWord + '%').limit(1).maybeSingle();
          if (clientRow?.cnpj) clientCnpj = String(clientRow.cnpj).replace(/\D/g, '');
        }
      } catch {}

      // Preserva a descrição original da fatura na reemissão (sanitização cabe ao
      // próprio plugnotasService.issueNfse via sanitizeDescription).
      const originalDescription: string | undefined = (inv.notes || inv.description || (inv as any).service_description || '').trim() || undefined;

      let issued: any;
      try {
        issued = await issueNfse({
          invoiceId,
          amount,
          company: inv.issuer_company || undefined,
          clientName: inv.client,
          clientCnpj,
          serviceDescription: originalDescription,
          externalReference: inv.number || invoiceId,
        });
      } catch (e: any) {
        return res.status(500).json({ error: `Falha ao emitir no PlugNotas: ${e.message}` });
      }

      const now = new Date().toISOString();
      const { data: row } = await sb.from('financial_invoices').select('nf_history').eq('id', invoiceId).maybeSingle();
      const existing = Array.isArray((row as any)?.nf_history) ? (row as any).nf_history : [];
      const newHistoryEntry = {
        ts: now,
        action: 'provider-failover',
        status: issued.status || 'PROCESSING',
        message: `Failover Asaas → PlugNotas. ${asaasCancelled ? 'NF Asaas cancelada antes.' : asaasCancelError ? `Asaas não cancelou: ${asaasCancelError}.` : 'Sem NF Asaas anterior para cancelar.'} Novo idIntegracao=${issued.idIntegracao}.`,
      };
      const updateData: any = {
        nf_provider: 'PLUGNOTAS',
        plugnotas_invoice_id: issued.plugnotasId || issued.idIntegracao,
        plugnotas_protocol: issued.protocol || null,
        nf_status: issued.status || 'PROCESSING',
        nf_last_error: null,
        nf_retry_paused: false,
        nf_retry_count: 0,
        nf_retry_at: now,
        nf_history: [...existing, newHistoryEntry].slice(-50),
        // Limpa artefatos da NF Asaas anterior para evitar que a UI mostre
        // PDF/número desatualizados até o webhook/polling do PlugNotas chegar.
        nf_image_url: null,
        nf_number: null,
        asaas_invoice_id: null,
      };
      await sb.from('financial_invoices').update(updateData).eq('id', invoiceId);
      console.log(`[Plugnotas Failover] fatura ${invoiceId} agora em PlugNotas (id=${issued.plugnotasId || issued.idIntegracao}).`);
      res.json({ success: true, plugnotasId: issued.plugnotasId, idIntegracao: issued.idIntegracao, status: issued.status, asaasCancelled, asaasCancelError });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Webhook PlugNotas — recebe eventos assíncronos de emissão/autorização/cancelamento.
  // Autenticação por shared-secret (env PLUGNOTAS_WEBHOOK_SECRET). Aceita o token via:
  //  - header `x-plugnotas-secret` ou `x-webhook-secret`
  //  - query string `?token=...`
  //  - header padrão `Authorization: Bearer <secret>`
  // SECURE-BY-DEFAULT: se PLUGNOTAS_WEBHOOK_SECRET NÃO estiver configurado, o endpoint
  // responde 503 e nega TODAS as requisições. É obrigatório definir o secret antes
  // de habilitar o webhook no painel PlugNotas, mesmo em sandbox.
  app.post("/api/plugnotas/webhook", async (req: Request, res: Response) => {
    try {
      const expected = (process.env.PLUGNOTAS_WEBHOOK_SECRET || '').trim();
      if (!expected) {
        // Secure-by-default: sem secret configurado, o endpoint não aceita ninguém.
        // Defina PLUGNOTAS_WEBHOOK_SECRET (qualquer string forte) e configure-o
        // como token na URL do webhook do PlugNotas (?token=...).
        console.log('[PlugNotas Webhook] 503 — PLUGNOTAS_WEBHOOK_SECRET não configurado. Endpoint desativado até o secret ser definido.');
        return res.status(503).json({ error: 'webhook-not-configured' });
      }
      const provided = String(
        req.headers['x-plugnotas-secret'] ||
        req.headers['x-webhook-secret'] ||
        req.query.token ||
        (req.headers.authorization || '').toString().replace(/^Bearer\s+/i, '') ||
        ''
      ).trim();
      if (!provided || provided !== expected) {
        console.log('[PlugNotas Webhook] 401 — secret ausente/incorreto.');
        return res.status(401).json({ error: 'unauthorized' });
      }
      const body = req.body || {};
      console.log('[PlugNotas Webhook] payload recebido:', JSON.stringify(body).substring(0, 500));
      const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      if (!sbUrl || !sbKey) return res.json({ ok: true, ignored: 'no-supabase' });
      const sb = createClient(sbUrl, sbKey);

      const items: any[] = Array.isArray(body) ? body : Array.isArray(body?.documents) ? body.documents : [body];
      const { mapPlugNotasStatusToNf, extractPlugNotasError, getNfsePdfUrl: plugGetPdfUrlWh } = await import('./plugnotasService');

      let updated = 0;
      for (const item of items) {
        const idIntegracao: string | null = item?.idIntegracao || item?.referencia || null;
        const plugId: string | null = item?.id || item?._id || null;
        if (!idIntegracao && !plugId) continue;

        let inv: any = null;
        if (plugId) {
          const { data } = await sb.from('financial_invoices').select('*').eq('plugnotas_invoice_id', plugId).maybeSingle();
          inv = data;
        }
        // Correlação por idIntegracao: tanto o caso onde salvamos o próprio
        // idIntegracao em plugnotas_invoice_id (fallback quando emissão não
        // devolveu plugId) quanto o decoding do UUID embutido no formato
        // "inv-<uuid>-<ts>".
        if (!inv && idIntegracao) {
          const { data } = await sb.from('financial_invoices').select('*').eq('plugnotas_invoice_id', idIntegracao).maybeSingle();
          inv = data;
        }
        if (!inv && idIntegracao) {
          const m = idIntegracao.match(/^inv-([0-9a-f-]+)-/i);
          if (m) {
            const { data } = await sb.from('financial_invoices').select('*').eq('id', m[1]).maybeSingle();
            inv = data;
          }
        }
        if (!inv) {
          console.log(`[PlugNotas Webhook] sem fatura correspondente: idIntegracao=${idIntegracao} plugId=${plugId}`);
          continue;
        }

        const status = mapPlugNotasStatusToNf(item?.status || item?.situacao);
        // Fallback PDF: se o webhook não trouxe linkPdf mas temos um plugId real,
        // monta a URL canônica.
        const pdfUrl: string | null = item?.linkPdf || item?.pdfUrl || (status === 'AUTHORIZED' && plugId ? await plugGetPdfUrlWh(plugId) : null);
        const errorMsg = status === 'ERROR' ? extractPlugNotasError(item) : null;

        // IMPORTANTE: webhook é o caminho passivo (PlugNotas → nós). NÃO atualiza
        // nf_retry_at aqui — esse campo é a "âncora de idade" usada pelo
        // nfRetryWorker para escalonar (>6h cancel/reissue, >24h STUCK). Resetá-lo
        // a cada evento de webhook (que pode chegar continuamente enquanto a
        // Prefeitura ainda processa) faria a fatura nunca atingir os limites
        // de escalonamento. nf_retry_at é reservado para tentativas reais
        // (retryOne / scheduleInvoice via roteador).
        const patch: any = {
          nf_provider: 'PLUGNOTAS',
          nf_status: status,
        };
        if (plugId) patch.plugnotas_invoice_id = plugId;
        if (item?.numero || item?.number) patch.nf_number = String(item.numero || item.number);
        if (pdfUrl) patch.nf_image_url = pdfUrl;
        if (item?.protocoloPrefeitura?.numero || item?.protocolo) patch.plugnotas_protocol = item.protocoloPrefeitura?.numero || item.protocolo;
        if (status === 'AUTHORIZED') {
          patch.nf_last_error = null;
          patch.nf_retry_paused = false;
        } else if (errorMsg) {
          patch.nf_last_error = errorMsg.substring(0, 500);
        }

        const { data: row } = await sb.from('financial_invoices').select('nf_history').eq('id', inv.id).maybeSingle();
        const existing = Array.isArray((row as any)?.nf_history) ? (row as any).nf_history : [];
        const action = status === 'AUTHORIZED' ? 'authorized'
          : status === 'CANCELED' ? 'cancel-and-reschedule'
          : status === 'ERROR' ? 'schedule-failed'
          : 'scheduled';
        const entry = {
          ts: new Date().toISOString(),
          action,
          status,
          message: `Webhook PlugNotas: ${status}${errorMsg ? ` — ${errorMsg}` : ''}`.substring(0, 500),
        };
        patch.nf_history = [...existing, entry].slice(-50);

        await sb.from('financial_invoices').update(patch).eq('id', inv.id);
        updated++;
      }
      console.log(`[PlugNotas Webhook] processado — ${updated} fatura(s) atualizada(s).`);
      res.json({ ok: true, updated });
    } catch (err: any) {
      console.log('[PlugNotas Webhook] erro:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/asaas/balances", requireAuth, requireRole('administrador', 'diretoria', 'financeiro', 'ceo'), async (_req: Request, res: Response) => {
    try {
      const balances = await getAllBalances();
      res.json({ success: true, balances });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/asaas/test-nf", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (req: Request, res: Response) => {
    try {
      const company = (req.query.company as string) || undefined;
      const companies = getAsaasCompanies();
      const results: any[] = [];
      const testCompanies = company ? [company] : companies.filter(c => c.configured).map(c => c.name);
      for (const comp of testCompanies) {
        const step: any = { company: comp, steps: {} };
        try {
          step.steps.apiKey = { ok: true, detail: 'API Key configurada' };
        } catch (e: any) { step.steps.apiKey = { ok: false, detail: e.message }; }
        try {
          const accountRes = await fetch('https://api.asaas.com/v3/myAccount', {
            headers: { 'Content-Type': 'application/json', 'access_token': getAsaasCompanies().find(c => c.name === comp)?.apiKey || '' },
          });
          const accountData = await accountRes.json();
          step.steps.account = {
            ok: accountRes.ok,
            walletId: accountData.walletId || accountData.id || '-',
            name: accountData.name || accountData.tradingName || '-',
            cpfCnpj: accountData.cpfCnpj || '-',
            email: accountData.email || '-',
          };
        } catch (e: any) { step.steps.account = { ok: false, detail: e.message }; }
        try {
          const services = await listMunicipalServices(comp);
          step.steps.municipalServices = {
            ok: services.length > 0,
            count: services.length,
            services: services.map((s: any) => ({
              id: s.id,
              code: s.code || s.municipalServiceCode || '-',
              description: (s.description || s.name || '-').substring(0, 120),
            })),
          };
        } catch (e: any) { step.steps.municipalServices = { ok: false, detail: e.message }; }
        try {
          const testCustomer = await findOrCreateCustomer({ name: 'TESTE DIAGNÓSTICO', cpfCnpj: '00000000000', company: comp });
          step.steps.customerApi = { ok: false, detail: 'CPF teste não deveria criar — API aceitou CPF inválido' };
        } catch (e: any) {
          step.steps.customerApi = { ok: true, detail: 'API de clientes respondendo (rejeitou CPF inválido corretamente)' };
        }
        results.push(step);
      }
      res.json({ success: true, timestamp: new Date().toISOString(), results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/asaas/create-charge", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (req: Request, res: Response) => {
    // Helper local: decide provider de NF (ASAAS|PLUGNOTAS) por empresa emissora e
    // emite via PlugNotas quando preferido. Mantém Asaas como gateway de cobrança
    // SEMPRE — só a NFS-e muda. Retorna shape compatível com Asaas.scheduleInvoice
    // + campos extra (provider, plugnotasInvoiceId, plugnotasProtocol).
    const issueNfWithRouter = async (params: {
      paymentId: string;
      issuerCompany?: string;
      descText: string;
      externalRef: string;
      clientCnpj: string;
      clientName?: string;
      clientEmail?: string;
      amount: number;
    }): Promise<{ provider: 'ASAAS' | 'PLUGNOTAS'; invoice: any }> => {
      const router = await import('./nfProviderRouter');
      const provider = await router.resolveProvider({ company: params.issuerCompany });
      if (provider === 'PLUGNOTAS') {
        // IMPORTANTE: Quando a empresa está configurada para PLUGNOTAS, NUNCA caímos
        // silenciosamente para Asaas. Risco fiscal: se o PlugNotas aceitou a NF mas a
        // resposta falhou (timeout/rede), um fallback geraria uma segunda NF no Asaas
        // (duplicidade). Erros são marcados com `provider='PLUGNOTAS'` e propagados
        // para o handler externo retornar 502 ao operador (fail-fast).
        const { isPlugNotasConfigured, issueNfse } = await import('./plugnotasService');
        if (!isPlugNotasConfigured()) {
          const err: any = new Error(
            `PlugNotas não configurado para empresa ${params.issuerCompany}. ` +
            `Defina PLUGNOTAS_API_TOKEN_SANDBOX/PROD ou altere a preferência da empresa para ASAAS.`
          );
          err.provider = 'PLUGNOTAS';
          err.code = 'PLUGNOTAS_NOT_CONFIGURED';
          throw err;
        }
        let issued: any;
        try {
          issued = await issueNfse({
            invoiceId: params.externalRef,
            amount: params.amount,
            company: params.issuerCompany,
            clientCnpj: params.clientCnpj,
            clientName: params.clientName || 'Cliente',
            clientEmail: params.clientEmail,
            serviceDescription: params.descText,
            externalReference: params.externalRef,
          });
        } catch (plugErr: any) {
          const err: any = new Error(
            `Falha ao emitir NF via PlugNotas para ${params.paymentId}: ${plugErr?.message || 'erro desconhecido'}`
          );
          err.provider = 'PLUGNOTAS';
          err.code = 'PLUGNOTAS_ISSUE_FAILED';
          err.cause = plugErr;
          throw err;
        }
        const idForLookup = issued.plugnotasId || issued.idIntegracao;
        console.log(`[NF Router] NF emitida via PLUGNOTAS para ${params.paymentId}: ${idForLookup}`);
        return {
          provider: 'PLUGNOTAS',
          invoice: {
            id: idForLookup,
            status: issued.status || 'PROCESSING',
            number: null,
            pdfUrl: null,
            provider: 'PLUGNOTAS',
            plugnotasInvoiceId: idForLookup,
            plugnotasProtocol: issued.protocol || null,
          },
        };
      }
      // Caminho padrão (provider === 'ASAAS'): Asaas
      const invoiceData = await scheduleInvoice({
        paymentId: params.paymentId,
        serviceDescription: params.descText,
        observations: `${params.descText} | Ref. ${params.externalRef}`,
        externalReference: params.externalRef,
        company: params.issuerCompany,
        clientCnpj: params.clientCnpj,
        clientName: params.clientName,
      });
      return {
        provider: 'ASAAS',
        invoice: invoiceData ? { ...invoiceData, provider: 'ASAAS' } : null,
      };
    };

    try {
      const { clientName, clientCpfCnpj, clientEmail, value, dueDate, description, invoiceNumber, issuerCompany, charges } = req.body;

      const lookupCnpj = clientCpfCnpj || (charges?.[0]?.cpfCnpj) || '';
      const cleanLookup = String(lookupCnpj).replace(/\D/g, '');
      let clientAddress: any = {};
      if (cleanLookup) {
        const { data: clientData } = await supabase.from('clients').select('zip_code, street, number, complement, neighborhood, city, state, phone').or(`cnpj.ilike.%${cleanLookup}%`).limit(1).single();
        if (clientData) {
          clientAddress = {
            postalCode: clientData.zip_code || undefined,
            address: clientData.street || undefined,
            addressNumber: clientData.number || undefined,
            complement: clientData.complement || undefined,
            province: clientData.neighborhood || undefined,
            city: clientData.city || undefined,
            state: clientData.state || undefined,
          };
          if (!clientData.zip_code) console.log(`[Asaas] AVISO: Cliente CNPJ ${cleanLookup} sem CEP cadastrado — boleto pode falhar`);
        } else {
          console.log(`[Asaas] AVISO: Nenhum cliente encontrado no banco para CNPJ ${cleanLookup} — endereço não será enviado ao Asaas`);
        }
      }

      if (charges && Array.isArray(charges) && charges.length > 0) {
        if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
          return res.status(400).json({ error: 'Vencimento inválido' });
        }
        const validCharges = charges.filter((c: any) => {
          const cleanCnpj = String(c.cpfCnpj || '').replace(/\D/g, '');
          const val = parseFloat(c.value);
          return cleanCnpj.length >= 11 && !isNaN(val) && val > 0;
        });
        if (validCharges.length === 0) {
          return res.status(400).json({ error: 'Nenhuma subconta válida encontrada. Verifique CNPJ e valores.' });
        }

        const results: any[] = [];
        for (let i = 0; i < validCharges.length; i++) {
          const charge = validCharges[i];
          const cleanCnpj = String(charge.cpfCnpj).replace(/\D/g, '');

          let chargeAddress = clientAddress;
          if (cleanCnpj !== cleanLookup) {
            const { data: chargeClient } = await supabase.from('clients').select('zip_code, street, number, complement, neighborhood, city, state, phone').or(`cnpj.ilike.%${cleanCnpj}%`).limit(1).single();
            if (chargeClient) {
              chargeAddress = {
                postalCode: chargeClient.zip_code || undefined,
                address: chargeClient.street || undefined,
                addressNumber: chargeClient.number || undefined,
                complement: chargeClient.complement || undefined,
                province: chargeClient.neighborhood || undefined,
                city: chargeClient.city || undefined,
                state: chargeClient.state || undefined,
              };
            }
          }

          const customer = await findOrCreateCustomer({
            name: charge.name || clientName || 'Cliente',
            cpfCnpj: cleanCnpj,
            email: charge.email || clientEmail || undefined,
            company: issuerCompany,
            ...chargeAddress,
          });

          const externalRef = invoiceNumber ? `NF-${invoiceNumber}-S${i + 1}-${cleanCnpj.slice(-4)}` : `TMSEG-${Date.now()}-S${i + 1}-${cleanCnpj.slice(-4)}`;
          const descText = description || `Ref. aos Serviços de Intermediação de Escolta Armada`;

          const payment = await createPayment({
            customerId: customer.id,
            value: parseFloat(charge.value),
            dueDate,
            description: descText,
            externalReference: externalRef,
            billingType: 'UNDEFINED',
            company: issuerCompany,
          });

          let pixData = null;
          let bankSlipData = null;
          let invoiceData = null;
          try { pixData = await getPaymentPixQrCode(payment.id, issuerCompany); } catch (_) {}
          try { bankSlipData = await getPaymentBankSlip(payment.id, issuerCompany); } catch (_) {}
          try {
            const routed = await issueNfWithRouter({
              paymentId: payment.id,
              issuerCompany,
              descText,
              externalRef,
              clientCnpj: cleanCnpj,
              clientName: charge.name || clientName,
              clientEmail: charge.email || clientEmail || undefined,
              amount: parseFloat(charge.value),
            });
            invoiceData = routed.invoice;
            console.log(`[NF] NF emitida via ${routed.provider} para cobrança ${payment.id}: ${invoiceData?.id || 'OK'} | Status: ${invoiceData?.status || '-'} | Desc: ${descText}`);

            if (routed.provider === 'ASAAS' && invoiceData?.id && !invoiceData?.pdfUrl) {
              for (let attempt = 0; attempt < 5; attempt++) {
                await new Promise(r => setTimeout(r, 3000));
                try {
                  const nfCheck = await getInvoiceByPayment(payment.id, issuerCompany);
                  const nfList = nfCheck?.data || (Array.isArray(nfCheck) ? nfCheck : []);
                  const authorized = nfList.find((n: any) => n.status === 'AUTHORIZED') || nfList.find((n: any) => n.pdfUrl) || nfList[0];
                  if (authorized?.pdfUrl) {
                    invoiceData.pdfUrl = authorized.pdfUrl;
                    invoiceData.status = authorized.status;
                    invoiceData.number = authorized.number || invoiceData.number;
                    console.log(`[Asaas] NF PDF disponível após ${attempt + 1} tentativa(s): ${authorized.pdfUrl}`);
                    break;
                  }
                } catch {}
              }
            }
          } catch (nfErr: any) {
            // PlugNotas é fail-fast: se a empresa está configurada para PLUGNOTAS e a
            // emissão falhou, anexamos o erro ao chargeResult e ABORTAMOS o loop —
            // mas devolvemos no payload as cobranças JÁ CRIADAS no Asaas anteriormente
            // (status 207-like via flag `partialFailure`) para que o frontend possa
            // reconciliar localmente em vez de criar cobranças órfãs.
            if (nfErr?.provider === 'PLUGNOTAS') {
              console.error(`[NF Router] Falha PLUGNOTAS no split (${payment.id}, charge ${i + 1}): ${nfErr.message}`);
              const failedResult: any = {
                payment: {
                  id: payment.id, status: payment.status, statusBr: mapAsaasStatus(payment.status),
                  value: payment.value, dueDate: payment.dueDate,
                  invoiceUrl: payment.invoiceUrl || null, bankSlipUrl: payment.bankSlipUrl || null,
                  externalReference: externalRef,
                },
                customer: { id: customer.id, name: customer.name, cpfCnpj: cleanCnpj },
                invoice: null,
                nfError: { provider: 'PLUGNOTAS', code: nfErr.code || 'PLUGNOTAS_ISSUE_FAILED', message: nfErr.message },
                emailSent: false,
              };
              results.push(failedResult);
              return res.status(207).json({
                success: false,
                split: true,
                partialFailure: true,
                charges: results,
                totalValue: results.reduce((s, r) => s + (r.payment?.value || 0), 0),
                error: `Cobranças Asaas criadas até a posição ${i + 1}, mas a NF PlugNotas falhou. Cobrança ${i + 1} ficou SEM NF — ajuste a configuração ou a preferência da empresa e use "Reemitir via PlugNotas" para concluir.`,
                failedAtIndex: i,
              });
            }
            console.log(`[Asaas] AVISO: Não foi possível agendar NF para ${payment.id}: ${nfErr.message}`);
          }

          console.log(`[Asaas] Cobrança split criada: ${payment.id} | ${charge.name || clientName} | CNPJ: ${cleanCnpj} | R$ ${charge.value} | Venc: ${dueDate}`);

          const chargeResult: any = {
            payment: {
              id: payment.id, status: payment.status, statusBr: mapAsaasStatus(payment.status),
              value: payment.value, dueDate: payment.dueDate,
              invoiceUrl: payment.invoiceUrl || null, bankSlipUrl: payment.bankSlipUrl || null,
              externalReference: externalRef,
            },
            pix: pixData ? { qrCodeBase64: pixData.encodedImage, copyPaste: pixData.payload } : null,
            bankSlip: bankSlipData ? { barCode: bankSlipData.barCode, digitableLine: bankSlipData.identificationField, nossoNumero: bankSlipData.nossoNumero } : null,
            customer: { id: customer.id, name: customer.name, cpfCnpj: cleanCnpj },
            invoice: invoiceData ? {
              id: invoiceData.id,
              status: invoiceData.status,
              number: invoiceData.number || null,
              pdfUrl: invoiceData.pdfUrl || null,
              provider: invoiceData.provider || 'ASAAS',
              plugnotasInvoiceId: invoiceData.plugnotasInvoiceId || null,
              plugnotasProtocol: invoiceData.plugnotasProtocol || null,
            } : null,
          };
          results.push(chargeResult);

          const recipientEmail = charge.email || clientEmail;
          const splitHasBoleto = !!(payment.bankSlipUrl || bankSlipData);
          const splitHasNf = !!(invoiceData?.pdfUrl);
          if (recipientEmail && splitHasBoleto && splitHasNf) {
            try {
              await sendBillingEmail({
                clientName: charge.name || clientName || 'Cliente',
                clientCnpj: cleanCnpj,
                clientEmail: recipientEmail,
                invoiceNumber: invoiceNumber || undefined,
                issuerCompany: issuerCompany || 'Grupo TM SEG',
                value: parseFloat(charge.value),
                dueDate,
                description: descText,
                paymentId: payment.id,
                boletoUrl: payment.bankSlipUrl || undefined,
                pixPayload: pixData?.payload || undefined,
                pixQrCodeBase64: pixData?.encodedImage || undefined,
                boletoBarcode: bankSlipData?.barCode || undefined,
                boletoDigitableLine: bankSlipData?.identificationField || undefined,
                nfPdfUrl: invoiceData?.pdfUrl || undefined,
                nfNumber: invoiceData?.number || undefined,
              });
              chargeResult.emailSent = true;
              chargeResult.nfIncludedInEmail = true;
            } catch (emailErr: any) {
              console.log(`[Asaas] AVISO: Email de cobrança não enviado para ${recipientEmail}: ${emailErr.message}`);
              chargeResult.emailSent = false;
            }
          } else {
            chargeResult.emailSent = false;
            chargeResult.emailPendingReason = !splitHasBoleto ? 'Boleto não disponível' : 'NF não disponível';
            console.log(`[Asaas] Email split NÃO enviado para ${recipientEmail || 'N/A'} — boleto=${splitHasBoleto}, NF=${splitHasNf}`);
          }
        }
        return res.json({ success: true, split: true, charges: results, totalValue: results.reduce((s, r) => s + r.payment.value, 0) });
      }

      if (!clientCpfCnpj || !value || !dueDate) {
        return res.status(400).json({ error: 'CNPJ do cliente, valor e vencimento são obrigatórios' });
      }

      const customer = await findOrCreateCustomer({
        name: clientName || 'Cliente',
        cpfCnpj: clientCpfCnpj,
        email: clientEmail || undefined,
        company: issuerCompany,
        ...clientAddress,
      });

      const externalRef = invoiceNumber ? `NF-${invoiceNumber}` : `TMSEG-${Date.now()}`;
      const descText = description || `Ref. aos Serviços de Intermediação de Escolta Armada`;

      const payment = await createPayment({
        customerId: customer.id,
        value: parseFloat(value),
        dueDate,
        description: descText,
        externalReference: externalRef,
        billingType: 'UNDEFINED',
        company: issuerCompany,
      });

      let pixData = null;
      let bankSlipData = null;
      let invoiceData = null;
      let nfErrorPayload: { provider: string; code: string; message: string } | null = null;
      try { pixData = await getPaymentPixQrCode(payment.id, issuerCompany); } catch (e) { console.log('[Asaas] PIX QR não disponível para esta cobrança'); }
      try { bankSlipData = await getPaymentBankSlip(payment.id, issuerCompany); } catch (e) { console.log('[Asaas] Boleto não disponível para esta cobrança'); }
      try {
        const routed = await issueNfWithRouter({
          paymentId: payment.id,
          issuerCompany,
          descText,
          externalRef,
          clientCnpj: clientCpfCnpj,
          clientName: clientName,
          clientEmail: clientEmail || undefined,
          amount: parseFloat(value),
        });
        invoiceData = routed.invoice;
        console.log(`[NF] NF emitida via ${routed.provider} para cobrança ${payment.id}: ${invoiceData?.id || 'OK'} | Status: ${invoiceData?.status || '-'} | Desc: ${descText}`);

        if (routed.provider === 'ASAAS' && invoiceData?.id && !invoiceData?.pdfUrl) {
          for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise(r => setTimeout(r, 3000));
            try {
              const nfCheck = await getInvoiceByPayment(payment.id, issuerCompany);
              const nfList = nfCheck?.data || (Array.isArray(nfCheck) ? nfCheck : []);
              const authorized = nfList.find((n: any) => n.status === 'AUTHORIZED') || nfList.find((n: any) => n.pdfUrl) || nfList[0];
              if (authorized?.pdfUrl) {
                invoiceData.pdfUrl = authorized.pdfUrl;
                invoiceData.status = authorized.status;
                invoiceData.number = authorized.number || invoiceData.number;
                console.log(`[Asaas] NF PDF disponível após ${attempt + 1} tentativa(s): ${authorized.pdfUrl}`);
                break;
              }
            } catch {}
          }
        }
      } catch (nfErr: any) {
        // PlugNotas é fail-fast (sem fallback Asaas), MAS a cobrança Asaas já foi
        // criada antes deste passo. Para NÃO gerar cobrança órfã, devolvemos o
        // payload do payment + nfError. Frontend persiste localmente e mostra
        // aviso para o operador usar "Reemitir via PlugNotas".
        if (nfErr?.provider === 'PLUGNOTAS') {
          console.error(`[NF Router] Falha PLUGNOTAS na cobrança ${payment.id}: ${nfErr.message}`);
          nfErrorPayload = { provider: 'PLUGNOTAS', code: nfErr.code || 'PLUGNOTAS_ISSUE_FAILED', message: nfErr.message };
        } else {
          console.log(`[Asaas] AVISO: Não foi possível agendar NF para ${payment.id}: ${nfErr.message}`);
        }
      }

      console.log(`[Asaas] Cobrança criada: ${payment.id} | ${clientName} | R$ ${value} | Venc: ${dueDate}`);

      const hasBoleto = !!(payment.bankSlipUrl || bankSlipData);
      const hasNf = !!(invoiceData?.pdfUrl);
      let emailSent = false;
      if (clientEmail && hasBoleto && hasNf) {
        try {
          await sendBillingEmail({
            clientName: clientName || 'Cliente',
            clientCnpj: clientCpfCnpj,
            clientEmail,
            invoiceNumber: invoiceNumber || undefined,
            issuerCompany: issuerCompany || 'Grupo TM SEG',
            value: parseFloat(value),
            dueDate,
            description: descText,
            paymentId: payment.id,
            boletoUrl: payment.bankSlipUrl || undefined,
            pixPayload: pixData?.payload || undefined,
            pixQrCodeBase64: pixData?.encodedImage || undefined,
            boletoBarcode: bankSlipData?.barCode || undefined,
            boletoDigitableLine: bankSlipData?.identificationField || undefined,
            nfPdfUrl: invoiceData?.pdfUrl || undefined,
            nfNumber: invoiceData?.number || undefined,
          });
          emailSent = true;
        } catch (emailErr: any) {
          console.log(`[Asaas] AVISO: Email de cobrança não enviado para ${clientEmail}: ${emailErr.message}`);
        }
      } else if (clientEmail) {
        console.log(`[Asaas] Email NÃO enviado — aguardando: boleto=${hasBoleto}, NF=${hasNf}. Envio manual necessário após sincronização.`);
      }

      res.status(nfErrorPayload ? 207 : 200).json({
        success: !nfErrorPayload,
        nfPending: !!nfErrorPayload,
        nfError: nfErrorPayload || undefined,
        emailSent,
        emailPendingReason: !emailSent && clientEmail ? (!hasBoleto ? 'Boleto não disponível ainda' : !hasNf ? 'NF não disponível ainda' : '') : undefined,
        payment: {
          id: payment.id,
          status: payment.status,
          statusBr: mapAsaasStatus(payment.status),
          value: payment.value,
          dueDate: payment.dueDate,
          invoiceUrl: payment.invoiceUrl || null,
          bankSlipUrl: payment.bankSlipUrl || null,
          externalReference: externalRef,
        },
        pix: pixData ? {
          qrCodeBase64: pixData.encodedImage,
          copyPaste: pixData.payload,
          expirationDate: pixData.expirationDate,
        } : null,
        bankSlip: bankSlipData ? {
          barCode: bankSlipData.barCode,
          digitableLine: bankSlipData.identificationField,
          nossoNumero: bankSlipData.nossoNumero,
        } : null,
        customer: { id: customer.id, name: customer.name },
        invoice: invoiceData ? {
          id: invoiceData.id,
          status: invoiceData.status,
          number: invoiceData.number || null,
          pdfUrl: invoiceData.pdfUrl || null,
          provider: invoiceData.provider || 'ASAAS',
          plugnotasInvoiceId: invoiceData.plugnotasInvoiceId || null,
          plugnotasProtocol: invoiceData.plugnotasProtocol || null,
        } : null,
      });
    } catch (err: any) {
      console.error('[Asaas] Erro ao criar cobrança:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/asaas/send-billing-email", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (req: Request, res: Response) => {
    try {
      const { paymentId, clientName, clientCnpj, clientEmail, value, dueDate, description, invoiceNumber, issuerCompany } = req.body;
      if (!paymentId || !clientEmail || !value || !dueDate) {
        return res.status(400).json({ error: 'paymentId, clientEmail, value e dueDate são obrigatórios' });
      }

      const company = issuerCompany || undefined;
      let pixData = null, bankSlipData = null, invoiceData: any = null;

      try { pixData = await getPaymentPixQrCode(paymentId, company); } catch (_) {}
      try { bankSlipData = await getPaymentBankSlip(paymentId, company); } catch (_) {}

      // Provider-aware: primeiro tenta resolver a NF a partir da fatura no banco
      // (que conhece nf_provider, nf_image_url, nf_number e plugnotas_invoice_id).
      // Só consulta a API do Asaas se a fatura local indicar provider ASAAS ou
      // não tiver dados suficientes (compatibilidade com cobranças antigas).
      let dbInvoiceRow: any = null;
      try {
        const { data: rows } = await supabaseAdmin
          .from('financial_invoices')
          .select('nf_provider, nf_image_url, nf_number, nf_status, plugnotas_invoice_id, asaas_invoice_id')
          .eq('asaas_payment_id', paymentId)
          .order('created_at', { ascending: false })
          .limit(1);
        dbInvoiceRow = rows && rows[0] ? rows[0] : null;
      } catch (_) { /* fallback abaixo */ }

      const dbProvider = (dbInvoiceRow?.nf_provider || '').toUpperCase();
      if (dbProvider === 'PLUGNOTAS' && dbInvoiceRow?.nf_image_url) {
        invoiceData = {
          id: dbInvoiceRow.plugnotas_invoice_id || null,
          status: dbInvoiceRow.nf_status || 'AUTHORIZED',
          number: dbInvoiceRow.nf_number || null,
          pdfUrl: dbInvoiceRow.nf_image_url,
          provider: 'PLUGNOTAS',
        };
      } else {
        try {
          const invoicesResp = await getInvoiceByPayment(paymentId, company);
          if (invoicesResp?.data?.length > 0) {
            invoiceData = invoicesResp.data[0];
          }
        } catch (_) {}
        // Se a fatura local diz PLUGNOTAS mas ainda não tem PDF, expõe explicitamente
        // para o operador em vez de buscar (e nunca encontrar) no Asaas.
        if (!invoiceData && dbProvider === 'PLUGNOTAS') {
          invoiceData = {
            id: dbInvoiceRow.plugnotas_invoice_id || null,
            status: dbInvoiceRow.nf_status || 'PROCESSING',
            number: dbInvoiceRow.nf_number || null,
            pdfUrl: dbInvoiceRow.nf_image_url || null,
            provider: 'PLUGNOTAS',
          };
        }
      }

      let payment: any = null;
      try { payment = await getPayment(paymentId, company); } catch (_) {}

      const hasBoleto = !!(payment?.bankSlipUrl || bankSlipData);
      const hasNf = !!(invoiceData?.pdfUrl);
      const forceParam = req.body.force === true;

      if (!hasBoleto && !forceParam) {
        return res.status(400).json({ error: 'Boleto ainda não disponível. Sincronize o status primeiro.', hasBoleto: false, hasNf });
      }
      if (!hasNf && !forceParam) {
        return res.status(400).json({ error: 'Nota Fiscal ainda não disponível. Sincronize o status primeiro.', hasBoleto, hasNf: false });
      }

      const result = await sendBillingEmail({
        clientName: clientName || 'Cliente',
        clientCnpj: clientCnpj || '',
        clientEmail,
        invoiceNumber: invoiceNumber || undefined,
        issuerCompany: issuerCompany || 'Grupo TM SEG',
        value: parseFloat(value),
        dueDate,
        description: description || undefined,
        paymentId,
        boletoUrl: payment?.bankSlipUrl || undefined,
        pixPayload: pixData?.payload || undefined,
        pixQrCodeBase64: pixData?.encodedImage || undefined,
        boletoBarcode: bankSlipData?.barCode || undefined,
        boletoDigitableLine: bankSlipData?.identificationField || undefined,
        nfPdfUrl: invoiceData?.pdfUrl || undefined,
        nfNumber: invoiceData?.number || undefined,
      });

      res.json({ success: result.success, messageId: result.messageId || null, nfIncluded: hasNf, boletoIncluded: hasBoleto, pixIncluded: !!pixData });
    } catch (err: any) {
      console.error('[Email] Erro ao enviar email de cobrança:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/asaas/payment/:id", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (req: Request, res: Response) => {
    try {
      const company = req.query.company as string || undefined;
      const payment = await getPayment(req.params.id, company);
      let pixData = null;
      let bankSlipData = null;
      if (payment.status === 'PENDING' || payment.status === 'OVERDUE') {
        try { pixData = await getPaymentPixQrCode(payment.id, company); } catch (_) {}
        try { bankSlipData = await getPaymentBankSlip(payment.id, company); } catch (_) {}
      }
      res.json({
        payment: { ...payment, statusBr: mapAsaasStatus(payment.status) },
        pix: pixData ? { qrCodeBase64: pixData.encodedImage, copyPaste: pixData.payload } : null,
        bankSlip: bankSlipData ? { barCode: bankSlipData.barCode, digitableLine: bankSlipData.identificationField } : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/asaas/payments", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (req: Request, res: Response) => {
    try {
      const { status, externalReference, offset, limit, company } = req.query;
      const result = await listPayments({
        status: status as string || undefined,
        externalReference: externalReference as string || undefined,
        offset: parseInt(offset as string) || 0,
        limit: parseInt(limit as string) || 50,
        company: company as string || undefined,
      });
      const payments = result.data.map(p => ({ ...p, statusBr: mapAsaasStatus(p.status) }));
      res.json({ payments, totalCount: result.totalCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  let nfColsMigrated = false;
  app.post("/api/asaas/sync-payment-status", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (req: Request, res: Response) => {
    try {
      if (!nfColsMigrated) {
        try {
          await supabaseAdmin.rpc('exec_sql', { sql: 'ALTER TABLE financial_invoices ADD COLUMN IF NOT EXISTS nf_status TEXT; ALTER TABLE financial_invoices ADD COLUMN IF NOT EXISTS nf_number TEXT;' });
          nfColsMigrated = true;
        } catch {}
      }
      const { paymentId, invoiceId, company } = req.body;
      if (!paymentId) return res.status(400).json({ error: 'paymentId obrigatório' });

      const payment = await getPayment(paymentId, company);
      const statusBr = mapAsaasStatus(payment.status);
      const isPaid = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(payment.status);

      // Se a fatura está vinculada a NF emitida pelo PlugNotas, NÃO sobrescreve
      // dados de NF com a consulta Asaas (poderia trocar URL/status PDF correto
      // do PlugNotas por dados antigos/cancelados da NF Asaas anterior). Em vez
      // disso, reaproveita os campos locais (nf_image_url/nf_status/nf_number)
      // para preencher a resposta — assim o frontend não vê falso "NF pendente"
      // quando o PDF PlugNotas já está autorizado e gravado no banco.
      let nfPdfUrl: string | null = null;
      let nfStatus: string | null = null;
      let nfNumber: string | null = null;
      let skipNfSync = false;
      if (invoiceId) {
        try {
          type InvProvCheck = {
            nf_provider: string | null;
            nf_image_url: string | null;
            nf_status: string | null;
            nf_number: string | null;
            plugnotas_invoice_id: string | null;
          };
          const { data } = await supabase
            .from('financial_invoices')
            .select('nf_provider, nf_image_url, nf_status, nf_number, plugnotas_invoice_id')
            .eq('id', invoiceId)
            .maybeSingle();
          const invProvCheck = data as InvProvCheck | null;
          const rawProv = String(invProvCheck?.nf_provider || '').toUpperCase();
          // Inferência consistente: provider é PLUGNOTAS quando explícito OU
          // quando há plugnotas_invoice_id (faturas legadas sem nf_provider).
          const isPlug = rawProv === 'PLUGNOTAS' || (!rawProv && !!invProvCheck?.plugnotas_invoice_id);
          if (isPlug) {
            skipNfSync = true;
            // Reaproveita o que já está no banco, em vez de devolver tudo nulo.
            nfPdfUrl = invProvCheck?.nf_image_url || null;
            nfStatus = invProvCheck?.nf_status || null;
            nfNumber = invProvCheck?.nf_number || null;
            console.log(`[Asaas Sync] fatura ${invoiceId} usa PlugNotas — usa NF local (status=${nfStatus || 'N/A'}, pdf=${nfPdfUrl ? 'sim' : 'não'}).`);
          }
        } catch {}
      }
      if (!skipNfSync) {
        try {
          const invoicesResp = await getInvoiceByPayment(paymentId, company);
          const invoicesList = invoicesResp?.data || (Array.isArray(invoicesResp) ? invoicesResp : []);
          const nfData = invoicesList.find((i: any) => i.status === 'AUTHORIZED') || invoicesList.find((i: any) => i.status === 'SCHEDULED') || invoicesList[0];
          if (nfData?.pdfUrl) nfPdfUrl = nfData.pdfUrl;
          if (nfData?.status) nfStatus = nfData.status;
          if (nfData?.number) nfNumber = String(nfData.number);
          console.log(`[Asaas Sync] NF para payment ${paymentId}: status=${nfStatus || 'N/A'}, number=${nfNumber || 'N/A'}, pdfUrl=${nfPdfUrl || 'N/A'}`);
        } catch (nfErr: any) {
          console.log(`[Asaas Sync] Erro ao buscar NF do payment ${paymentId}: ${nfErr.message}`);
        }
      }

      let pixData = null;
      let bankSlipData = null;
      if (!isPaid) {
        try { pixData = await getPaymentPixQrCode(paymentId, company); } catch {}
        try { bankSlipData = await getPaymentBankSlip(paymentId, company); } catch {}
      }

      if (invoiceId) {
        const { data: inv } = await supabase.from('financial_invoices').select('id, asaas_payment_id').eq('id', invoiceId).single();
        if (!inv || (inv.asaas_payment_id && inv.asaas_payment_id !== paymentId)) {
          return res.status(400).json({ error: 'Invoice não vinculada a este paymentId' });
        }
        const newStatus = isPaid ? 'PAGA' : payment.status === 'OVERDUE' ? 'VENCIDA' : 'EMITIDA';
        const updateData: any = {
          status: newStatus,
          asaas_status: payment.status,
        };
        if (nfPdfUrl) updateData.nf_image_url = nfPdfUrl;
        if (nfStatus) updateData.nf_status = nfStatus;
        if (nfNumber) updateData.nf_number = nfNumber;
        if (payment.invoiceUrl) updateData.asaas_invoice_url = payment.invoiceUrl;
        if (payment.bankSlipUrl) updateData.asaas_bankslip_url = payment.bankSlipUrl;
        if (pixData?.payload) updateData.asaas_pix_payload = pixData.payload;
        if (bankSlipData?.identificationField) updateData.asaas_barcode = bankSlipData.identificationField;
        await supabase.from('financial_invoices').update(updateData).eq('id', invoiceId);

        if (isPaid) {
          const { data: inv } = await supabase.from('financial_invoices').select('number, client').eq('id', invoiceId).single();
          if (inv?.number) {
            await supabase.from('financial_transactions')
              .update({ status: 'PAID', paid_date: new Date().toISOString().split('T')[0] })
              .ilike('description', `%${inv.number}%`)
              .eq('status', 'PENDING');
            console.log(`[Asaas] Baixa automática: NF ${inv.number} — ${inv.client}`);
          }
        }
      }

      const hasBoleto = !!(payment.bankSlipUrl || bankSlipData);
      const hasNf = !!nfPdfUrl;

      res.json({
        status: payment.status, statusBr, isPaid, value: payment.value,
        nfPdfUrl: nfPdfUrl || null, nfStatus: nfStatus || null, nfNumber: nfNumber || null,
        hasBoleto, hasNf,
        bankSlipUrl: payment.bankSlipUrl || null,
        boletoBarcode: bankSlipData?.identificationField || null,
        pixPayload: pixData?.payload || null,
        emailReady: hasBoleto && hasNf,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/asaas/payment/:id", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (req: Request, res: Response) => {
    try {
      const company = req.query.company as string || undefined;
      await deletePayment(req.params.id, company);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Webhook do Asaas para baixa automática
  app.post("/api/asaas/webhook", async (req: Request, res: Response) => {
    try {
      const { event, payment } = req.body;
      console.log(`[Asaas Webhook] Evento: ${event} | Payment: ${payment?.id}`);

      if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event) && payment?.externalReference) {
        const nfNumber = payment.externalReference.replace('NF-', '').replace('TMSEG-', '');
        const { data: invoices } = await supabase.from('financial_invoices')
          .select('id, number, client')
          .or(`number.eq.${nfNumber},asaas_payment_id.eq.${payment.id}`);

        if (invoices && invoices.length > 0) {
          for (const inv of invoices) {
            await supabase.from('financial_invoices').update({
              status: 'PAGA',
              asaas_status: 'RECEIVED',
            }).eq('id', inv.id);

            await supabase.from('financial_transactions')
              .update({ status: 'PAID', paid_date: new Date().toISOString().split('T')[0] })
              .ilike('description', `%${inv.number}%`)
              .eq('status', 'PENDING');

            console.log(`[Asaas Webhook] Baixa automática: NF ${inv.number} — ${inv.client}`);
          }
        }
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error('[Asaas Webhook] Erro:', err.message);
      res.json({ received: true, error: err.message });
    }
  });

  const geocodeMemCache: Record<string, { data: any; ts: number }> = {};
  const geocodeInflight: Record<string, Promise<any>> = {};
  const GEOCODE_CACHE_TTL = 3600000;
  const GEOCODE_MAX_CACHE = 500;
  let lastNominatimCall = 0;
  const NOMINATIM_MIN_INTERVAL = 1100;
  let nominatimQueue: Array<{ resolve: (v: any) => void; lat: number; lng: number }> = [];
  let nominatimProcessing = false;

  const stateAbbrevMap: Record<string, string> = {
    'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
    'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES', 'goiás': 'GO',
    'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
    'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR', 'pernambuco': 'PE', 'piauí': 'PI',
    'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
    'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'são paulo': 'SP',
    'sergipe': 'SE', 'tocantins': 'TO'
  };

  const formatNominatimAddress = (a: any) => {
    const street = a.road || '';
    const number = a.house_number || '';
    const neighborhood = a.suburb || a.neighbourhood || '';
    const city = a.city || a.town || a.municipality || '';
    const rawState = (a.state || '').trim().toLowerCase();
    const state = stateAbbrevMap[rawState] || (rawState.length === 2 ? rawState.toUpperCase() : rawState.substring(0, 2).toUpperCase());
    const parts = [
      street ? (number ? `${street}, ${number}` : street) : '',
      neighborhood,
      city ? (state ? `${city}/${state}` : city) : state
    ].filter(Boolean);
    return { formatted: parts.join(' - ').toUpperCase().trim(), street, number, neighborhood, city, state };
  };

  const callNominatimThrottled = (lat: number, lng: number): Promise<any> => {
    return new Promise((resolve) => {
      nominatimQueue.push({ resolve, lat, lng });
      processNominatimQueue();
    });
  };

  const callPhotonFallback = async (lat: number, lng: number): Promise<any> => {
    try {
      const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'TMSEGo/1.0' } });
      const data = await resp.json();
      if (data && data.features && data.features.length > 0) {
        const props = data.features[0].properties;
        const street = props.name || props.street || '';
        const number = props.housenumber || '';
        const neighborhood = props.district || props.locality || '';
        const city = props.city || props.town || '';
        const rawState = (props.state || '').trim().toLowerCase();
        const state = stateAbbrevMap[rawState] || (rawState.length === 2 ? rawState.toUpperCase() : rawState.substring(0, 2).toUpperCase());
        const parts = [
          street ? (number ? `${street}, ${number}` : street) : '',
          neighborhood,
          city ? (state ? `${city}/${state}` : city) : state
        ].filter(Boolean);
        const formatted = parts.join(' - ').toUpperCase().trim();
        if (formatted) {
          console.log(`[GEOCODE] Photon: (${lat}, ${lng}) → "${formatted}"`);
          return { address: { road: street, house_number: number, suburb: neighborhood, city, state: props.state || '' }, display_name: formatted, _source: 'photon', _formatted: formatted, _components: { street, number, neighborhood, city, state } };
        }
      }
    } catch (e: any) {
      console.warn(`[GEOCODE] Photon falhou: ${e.message}`);
    }
    return null;
  };

  const processNominatimQueue = async () => {
    if (nominatimProcessing || nominatimQueue.length === 0) return;
    nominatimProcessing = true;
    while (nominatimQueue.length > 0) {
      const item = nominatimQueue.shift()!;
      const now = Date.now();
      const waitTime = Math.max(0, NOMINATIM_MIN_INTERVAL - (now - lastNominatimCall));
      if (waitTime > 0) await new Promise(r => setTimeout(r, waitTime));
      lastNominatimCall = Date.now();
      try {
        const nUrl = `https://nominatim.openstreetmap.org/reverse?lat=${item.lat}&lon=${item.lng}&format=json&addressdetails=1&accept-language=pt-BR`;
        const nResp = await fetch(nUrl, { headers: { 'User-Agent': 'TMSEGo/1.0 (contato@grupotmseg.com.br)' } });
        if (nResp.status === 429) {
          console.warn(`[GEOCODE] Nominatim 429 rate limit para (${item.lat}, ${item.lng}), tentando Photon...`);
          const fallbackResult = await callPhotonFallback(item.lat, item.lng);
          item.resolve(fallbackResult);
          continue;
        }
        const text = await nResp.text();
        try {
          const nData = JSON.parse(text);
          item.resolve(nData);
        } catch {
          console.warn(`[GEOCODE] Nominatim resposta inválida para (${item.lat}, ${item.lng}), tentando Photon...`);
          const fallbackResult = await callPhotonFallback(item.lat, item.lng);
          item.resolve(fallbackResult);
        }
      } catch (e: any) {
        console.warn(`[GEOCODE] Nominatim erro de rede: ${e.message}, tentando Photon...`);
        const fallbackResult = await callPhotonFallback(item.lat, item.lng);
        item.resolve(fallbackResult);
      }
    }
    nominatimProcessing = false;
  };

  app.get('/api/reverse-geocode', requireAuth, async (req: Request, res: Response) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ success: false, error: 'lat e lng são obrigatórios' });
      }

      const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      const cached = geocodeMemCache[cacheKey];
      if (cached && (Date.now() - cached.ts) < GEOCODE_CACHE_TTL) {
        return res.json(cached.data);
      }

      if (geocodeInflight[cacheKey]) {
        const inflightResult = await geocodeInflight[cacheKey];
        return res.json(inflightResult || { success: false, error: 'Nenhum resultado encontrado' });
      }

      const resolveGeocode = async (): Promise<any> => {
        const nData = await callNominatimThrottled(lat, lng);
        if (nData) {
          if (nData._source && nData._formatted) {
            const result = {
              success: true,
              address: nData._formatted,
              fullAddress: nData.display_name || nData._formatted,
              components: nData._components
            };
            const cacheKeys = Object.keys(geocodeMemCache);
            if (cacheKeys.length >= GEOCODE_MAX_CACHE) {
              const oldest = cacheKeys.sort((a, b) => geocodeMemCache[a].ts - geocodeMemCache[b].ts).slice(0, 50);
              oldest.forEach(k => delete geocodeMemCache[k]);
            }
            geocodeMemCache[cacheKey] = { data: result, ts: Date.now() };
            return result;
          }
          if (nData.address) {
            const { formatted, street, number, neighborhood, city, state } = formatNominatimAddress(nData.address);
            if (formatted) {
              console.log(`[GEOCODE] Nominatim: (${lat}, ${lng}) → "${formatted}"`);
              const result = {
                success: true,
                address: formatted,
                fullAddress: nData.display_name || '',
                components: { street, number, neighborhood, city, state }
              };
              geocodeMemCache[cacheKey] = { data: result, ts: Date.now() };
              return result;
            }
          }
        }
        return null;
      };

      geocodeInflight[cacheKey] = resolveGeocode();
      const finalResult = await geocodeInflight[cacheKey];
      delete geocodeInflight[cacheKey];

      return res.json(finalResult || { success: false, error: 'Nenhum resultado encontrado' });
    } catch (err: any) {
      console.error('[GEOCODE] Erro:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/admin/recalculate-batch', requireAuth, requireRole('administrador', 'diretoria'), async (req: Request, res: Response) => {
    try {
      const { missionIds, dryRun = true } = req.body;
      if (!missionIds || !Array.isArray(missionIds) || missionIds.length === 0) {
        return res.status(400).json({ error: 'missionIds array required' });
      }

      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      const sb = createClient(supabaseUrl, supabaseKey);

      const { data: clientTables } = await sb.from('client_price_tables').select('*');
      const { data: providerTables } = await sb.from('provider_cost_tables').select('*');
      const { data: clients } = await sb.from('clients').select('*');

      const results: any[] = [];
      let totalOldRevenue = 0, totalNewRevenue = 0;
      let totalOldCost = 0, totalNewCost = 0;
      let updated = 0, errors = 0;

      for (const mId of missionIds) {
        try {
          const { data: mData, error: mErr } = await sb.from('missions').select('*').eq('id', mId).single();
          if (mErr || !mData) { results.push({ id: mId, error: 'Not found' }); errors++; continue; }

          const clientName = mData.client || '';
          const clientData = (clients || []).find((c: any) => 
            c.name === clientName || c.trading_name === clientName || 
            (c.name || '').toUpperCase() === clientName.toUpperCase() ||
            (c.trading_name || '').toUpperCase() === clientName.toUpperCase()
          );

          const mission: any = {
            id: mData.id,
            client: mData.client,
            provider: mData.provider,
            origin: mData.origin,
            destination: mData.destination,
            status: mData.status,
            startKm: mData.start_km,
            endKm: mData.end_km,
            startTime: mData.start_time,
            endTime: mData.end_time,
            createdAt: mData.created_at,
            totalDistance: mData.total_distance,
            agent1: mData.agent1,
            agent2: mData.agent2,
            mission_type: mData.mission_type,
            is_same_os: mData.is_same_os,
            parent_mission_id: mData.parent_mission_id,
            toll_value: mData.toll_value,
            toll_value_provider: mData.toll_value_provider,
            revenue_value: mData.revenue_value,
            cost_value: mData.cost_value,
            billing_approved: mData.billing_approved,
            provider_ops_edited: mData.provider_ops_edited,
            provider_start_km: mData.provider_start_km,
            provider_end_km: mData.provider_end_km,
            provider_start_time: mData.provider_start_time,
            provider_end_time: mData.provider_end_time,
          };

          const calc = calculateMissionFinancials(
            mission,
            (clientTables || []) as any,
            (providerTables || []) as any,
            clientData as any
          );

          const r2 = (v: number) => Math.round(v * 100) / 100;
          const newRevenue = r2(calc.client.serviceTotal);
          const newCost = mission.is_same_os ? 0 : r2(calc.provider.serviceTotal);
          const oldRevenue = mData.revenue_value || 0;
          const oldCost = mData.cost_value || 0;

          totalOldRevenue += oldRevenue;
          totalNewRevenue += newRevenue;
          totalOldCost += oldCost;
          totalNewCost += newCost;

          const entry: any = {
            id: mId,
            client: mData.client,
            provider: mData.provider,
            oldRevenue, newRevenue, diffRevenue: r2(newRevenue - oldRevenue),
            oldCost, newCost, diffCost: r2(newCost - oldCost),
            clientTable: calc.client.tableName || 'N/A',
            providerTable: calc.provider.tableName || 'N/A',
            km: calc.realTraveledKm,
            hours: calc.durationHours,
          };

          if (!dryRun) {
            const { error: upErr } = await sb.from('missions').update({
              revenue_value: newRevenue,
              cost_value: newCost,
              last_update: new Date().toISOString()
            }).eq('id', mId);
            
            if (upErr) { entry.updateError = upErr.message; errors++; }
            else { updated++; }

            await sb.from('system_logs').insert([{
              user_name: 'SISTEMA (Recálculo em Massa)',
              action_type: 'BATCH_RECALCULATE',
              entity: 'Mission',
              entity_id: mId,
              details: JSON.stringify({
                oldRevenue, newRevenue, oldCost, newCost,
                clientTable: calc.client.tableId,
                providerTable: calc.provider.tableId
              })
            }]);
          }

          results.push(entry);
        } catch (e: any) {
          results.push({ id: mId, error: e.message });
          errors++;
        }
      }

      return res.json({
        mode: dryRun ? 'DRY_RUN (simulação)' : 'EXECUTED',
        total: missionIds.length,
        updated,
        errors,
        summary: {
          oldTotalRevenue: Math.round(totalOldRevenue * 100) / 100,
          newTotalRevenue: Math.round(totalNewRevenue * 100) / 100,
          diffRevenue: Math.round((totalNewRevenue - totalOldRevenue) * 100) / 100,
          oldTotalCost: Math.round(totalOldCost * 100) / 100,
          newTotalCost: Math.round(totalNewCost * 100) / 100,
          diffCost: Math.round((totalNewCost - totalOldCost) * 100) / 100,
        },
        results
      });
    } catch (err: any) {
      console.error('[BATCH RECALCULATE] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/restore-batch', requireAuth, requireRole('administrador', 'diretoria'), async (req: Request, res: Response) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'items array required [{id, revenue, cost}]' });
      }
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      const results: any[] = [];
      let restored = 0;
      for (const item of items) {
        const updateResp = await fetch(`${supabaseUrl}/rest/v1/missions?id=eq.${item.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            revenue_value: Math.round(item.revenue * 100) / 100,
            cost_value: Math.round(item.cost * 100) / 100
          })
        });
        if (updateResp.ok) {
          restored++;
          results.push({ id: item.id, status: 'restored' });
        } else {
          results.push({ id: item.id, status: 'error', error: await updateResp.text() });
        }
      }
      return res.json({ total: items.length, restored, results });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  const DATAJUD_API_KEY = process.env.DATAJUD_API_KEY || '';
  const DATAJUD_TRIBUNAIS: Record<string, string> = {
    'TJSP': 'api_publica_tjsp', 'TJRJ': 'api_publica_tjrj', 'TJMG': 'api_publica_tjmg',
    'TJRS': 'api_publica_tjrs', 'TJPR': 'api_publica_tjpr', 'TJSC': 'api_publica_tjsc',
    'TJBA': 'api_publica_tjba', 'TJPE': 'api_publica_tjpe', 'TJCE': 'api_publica_tjce',
    'TJGO': 'api_publica_tjgo', 'TJPA': 'api_publica_tjpa', 'TJMA': 'api_publica_tjma',
    'TJMT': 'api_publica_tjmt', 'TJMS': 'api_publica_tjms', 'TJES': 'api_publica_tjes',
    'TJAL': 'api_publica_tjal', 'TJRN': 'api_publica_tjrn', 'TJPB': 'api_publica_tjpb',
    'TJSE': 'api_publica_tjse', 'TJPI': 'api_publica_tjpi', 'TJRO': 'api_publica_tjro',
    'TJAC': 'api_publica_tjac', 'TJAM': 'api_publica_tjam', 'TJAP': 'api_publica_tjap',
    'TJRR': 'api_publica_tjrr', 'TJTO': 'api_publica_tjto', 'TJDFT': 'api_publica_tjdft',
    'TRF1': 'api_publica_trf1', 'TRF2': 'api_publica_trf2', 'TRF3': 'api_publica_trf3',
    'TRF4': 'api_publica_trf4', 'TRF5': 'api_publica_trf5', 'TRF6': 'api_publica_trf6',
    'TRT1': 'api_publica_trt1', 'TRT2': 'api_publica_trt2', 'TRT3': 'api_publica_trt3',
    'TRT4': 'api_publica_trt4', 'TRT5': 'api_publica_trt5', 'TRT6': 'api_publica_trt6',
    'TRT7': 'api_publica_trt7', 'TRT8': 'api_publica_trt8', 'TRT9': 'api_publica_trt9',
    'TRT10': 'api_publica_trt10', 'TRT11': 'api_publica_trt11', 'TRT12': 'api_publica_trt12',
    'TRT13': 'api_publica_trt13', 'TRT14': 'api_publica_trt14', 'TRT15': 'api_publica_trt15',
    'TRT16': 'api_publica_trt16', 'TRT17': 'api_publica_trt17', 'TRT18': 'api_publica_trt18',
    'TRT19': 'api_publica_trt19', 'TRT20': 'api_publica_trt20', 'TRT21': 'api_publica_trt21',
    'TRT22': 'api_publica_trt22', 'TRT23': 'api_publica_trt23', 'TRT24': 'api_publica_trt24',
    'STF': 'api_publica_stf', 'STJ': 'api_publica_stj', 'TST': 'api_publica_tst',
  };

  app.get("/api/datajud/tribunais", (_req: Request, res: Response) => {
    res.json({ tribunais: Object.keys(DATAJUD_TRIBUNAIS) });
  });

  app.get("/api/monitored-processes", requireAuth, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabase.from('monitored_processes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/monitored-processes", requireAuth, requireRole('administrador', 'diretoria', 'avançado', 'avancado'), async (req: Request, res: Response) => {
    try {
      const { numero_processo, tribunal, apelido } = req.body;
      if (!numero_processo || !tribunal) return res.status(400).json({ error: 'Número do processo e tribunal são obrigatórios.' });
      const { data, error } = await supabase.from('monitored_processes').insert({ numero_processo, tribunal, apelido: apelido || '' }).select().single();
      if (error) throw error;
      console.log(`[Jurídico] Processo monitorado adicionado: ${numero_processo} (${tribunal})`);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/monitored-processes/:id", requireAuth, requireRole('administrador', 'diretoria'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { error } = await supabase.from('monitored_processes').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/datajud/consulta", requireAuth, async (req: Request, res: Response) => {
    try {
      const { tribunal, numeroProcesso, query: searchQuery } = req.body;
      if (!tribunal || !DATAJUD_TRIBUNAIS[tribunal]) {
        return res.status(400).json({ error: 'Tribunal inválido ou não informado.' });
      }
      if (!numeroProcesso && !searchQuery) {
        return res.status(400).json({ error: 'Informe o número do processo ou termo de busca.' });
      }
      if (!DATAJUD_API_KEY) {
        return res.status(500).json({ error: 'API Key do DataJud não configurada no servidor.' });
      }

      const endpoint = DATAJUD_TRIBUNAIS[tribunal];
      const url = `https://api-publica.datajud.cnj.jus.br/${endpoint}/_search`;

      let body: any;
      if (numeroProcesso) {
        body = { query: { match: { numeroProcesso: numeroProcesso.replace(/[.\-\/]/g, '').replace(/(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})/, '$1-$2.$3.$4.$5.$6') } }, size: 10 };
      } else {
        body = { query: { multi_match: { query: searchQuery, fields: ['*'], operator: 'and' } }, size: 10 };
      }

      console.log(`[DataJud] Consultando ${tribunal}: ${JSON.stringify(body.query).slice(0, 200)}`);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `APIKey ${DATAJUD_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('[DataJud] Erro:', resp.status, errText.slice(0, 500));
        return res.status(resp.status).json({ error: `Erro na API do DataJud: ${resp.status}`, details: errText });
      }

      const data = await resp.json();
      const hits = data.hits?.hits || [];
      console.log(`[DataJud] ${tribunal}: ${hits.length} resultados (total: ${data.hits?.total?.value || 0})`);

      if (hits.length > 0) {
        const firstSource = hits[0]._source || {};
        const fieldKeys = Object.keys(firstSource);
        console.log(`[DataJud] Campos disponíveis: ${fieldKeys.join(', ')}`);
      }

      const results = hits.map((h: any) => {
        const s = h._source || {};
        return {
          id: h._id,
          numeroProcesso: s.numeroProcesso,
          classe: s.classe?.nome || s.classeProcessual || '',
          assuntos: (s.assuntos || []).map((a: any) => a.nome || a).filter(Boolean),
          tribunal: s.tribunal || tribunal,
          grau: s.grau || '',
          orgaoJulgador: s.orgaoJulgador?.nome || '',
          dataAjuizamento: s.dataAjuizamento || '',
          dataUltimaAtualizacao: s.dataHoraUltimaAtualizacao || '',
          nivelSigilo: s.nivelSigilo || 0,
          formato: s.formato?.nome || '',
          sistema: s.sistema?.nome || '',
          movimentos: (s.movimentos || []).slice(0, 20).map((m: any) => ({
            nome: m.nome || m.complementosTabelados?.map((c: any) => c.nome || c.descricao).join(', ') || '',
            data: m.dataHora || '',
            complemento: m.complementosTabelados?.map((c: any) => `${c.nome || ''}: ${c.descricao || ''}`).join(' | ') || ''
          })),
        };
      });

      res.json({ total: data.hits?.total?.value || results.length, results });
    } catch (err: any) {
      console.error('[DataJud] Exception:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  const LEGAL_EMAIL_TO = 'thiago@grupotmseg.com.br';

  async function runDailyLegalSearch(): Promise<{ total: number; processos: any[] }> {
    if (!DATAJUD_API_KEY) {
      console.error('[Jurídico Diário] DATAJUD_API_KEY não configurada');
      return { total: 0, processos: [] };
    }

    const { data: monitored } = await supabase.from('monitored_processes').select('*').eq('ativo', true);
    if (!monitored || monitored.length === 0) {
      console.log('[Jurídico Diário] Nenhum processo monitorado cadastrado.');
      return { total: 0, processos: [] };
    }

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`[Jurídico Diário] Consultando ${monitored.length} processos monitorados — ${now}`);

    const allProcessos: any[] = [];
    let errors = 0;

    for (const proc of monitored) {
      const endpoint = DATAJUD_TRIBUNAIS[proc.tribunal];
      if (!endpoint) { errors++; continue; }

      try {
        const url = `https://api-publica.datajud.cnj.jus.br/${endpoint}/_search`;
        const numFormatado = proc.numero_processo.replace(/[.\-\/]/g, '').replace(/(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})/, '$1-$2.$3.$4.$5.$6');
        const body = { query: { match: { numeroProcesso: numFormatado } }, size: 5 };

        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `APIKey ${DATAJUD_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!resp.ok) { errors++; continue; }

        const data = await resp.json();
        const hits = data.hits?.hits || [];

        for (const h of hits) {
          const s = h._source || {};
          const resultado = {
            id: h._id,
            numeroProcesso: s.numeroProcesso || proc.numero_processo,
            classe: s.classe?.nome || s.classeProcessual || '',
            assuntos: (s.assuntos || []).map((a: any) => a.nome || a).filter(Boolean),
            tribunal: s.tribunal || proc.tribunal,
            grau: s.grau || '',
            orgaoJulgador: s.orgaoJulgador?.nome || '',
            dataAjuizamento: s.dataAjuizamento || '',
            dataUltimaAtualizacao: s.dataHoraUltimaAtualizacao || '',
            apelido: proc.apelido || '',
            movimentos: (s.movimentos || []).slice(0, 20).map((m: any) => ({
              nome: m.nome || m.complementosTabelados?.map((c: any) => c.nome || c.descricao).join(', ') || '',
              data: m.dataHora || '',
              complemento: m.complementosTabelados?.map((c: any) => `${c.nome || ''}: ${c.descricao || ''}`).join(' | ') || '',
            })),
          };
          allProcessos.push(resultado);

          const lastMov = (s.movimentos || [])[0];
          const lastMovStr = lastMov ? `${lastMov.dataHora || ''} - ${lastMov.nome || ''}` : '';
          await supabase.from('monitored_processes').update({
            last_checked_at: new Date().toISOString(),
            last_movimentacao: lastMovStr,
          }).eq('id', proc.id);
        }

        await new Promise(r => setTimeout(r, 300));
      } catch (err: any) {
        errors++;
        console.error(`[Jurídico Diário] Erro ao consultar ${proc.numero_processo}:`, err.message);
      }
    }

    console.log(`[Jurídico Diário] Busca concluída: ${allProcessos.length} processos encontrados, ${errors} erros`);
    return { total: allProcessos.length, processos: allProcessos };
  }

  async function executeDailyLegalReport() {
    try {
      const { processos } = await runDailyLegalSearch();
      const searchDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const sent = await sendLegalReportEmail(LEGAL_EMAIL_TO, processos, searchDate);
      if (sent) {
        console.log(`[Jurídico Diário] Relatório enviado com sucesso para ${LEGAL_EMAIL_TO}`);
      } else {
        console.error(`[Jurídico Diário] Falha ao enviar relatório para ${LEGAL_EMAIL_TO}`);
      }
    } catch (err: any) {
      console.error(`[Jurídico Diário] Erro fatal:`, err.message);
    }
  }

  function scheduleDailyLegalReport() {
    const checkInterval = () => {
      const now = new Date();
      const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const hour = brasiliaTime.getHours();
      const minute = brasiliaTime.getMinutes();

      if (hour === 7 && minute === 0) {
        executeDailyLegalReport();
      }
    };

    setInterval(checkInterval, 60 * 1000);
    console.log('[Jurídico Diário] Agendamento ativo — relatório será enviado todos os dias às 07:00 (Brasília) para ' + LEGAL_EMAIL_TO);
  }

  scheduleDailyLegalReport();

  app.post("/api/datajud/relatorio-diario", requireAuth, requireRole('administrador', 'diretoria'), async (_req: Request, res: Response) => {
    try {
      const { processos, total } = await runDailyLegalSearch();
      const searchDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const sent = await sendLegalReportEmail(LEGAL_EMAIL_TO, processos, searchDate);
      res.json({ success: sent, total, emailTo: LEGAL_EMAIL_TO, date: searchDate });
    } catch (err: any) {
      console.error('[Jurídico Diário] Erro manual:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  const PENDING_REPORT_EMAIL = 'michelle@grupotmseg.com.br';

  async function findCompletedMissionsWithPendingInfo(): Promise<any[]> {
    const allMissions: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('missions')
        .select('id, client, provider, origin, destination, start_time, end_time, start_km, end_km, driver_name, client_vehicle, agent1, created_at, status')
        .in('status', ['Concluída', 'Concluida', 'Aprovada'])
        .range(from, from + pageSize - 1);
      if (error) { console.error('[Pendências] Erro ao buscar missions:', error.message); break; }
      if (!data || data.length === 0) break;
      allMissions.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    return allMissions.filter((m: any) => {
      const missing: boolean =
        (!m.start_km && m.start_km !== 0) ||
        (!m.end_km && m.end_km !== 0) ||
        !m.start_time ||
        !m.end_time ||
        !m.origin ||
        !m.destination ||
        !m.driver_name ||
        !m.client_vehicle ||
        !m.agent1;
      return missing;
    });
  }

  async function executeDailyPendingReport() {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`[Pendências Diário] Iniciando busca — ${now}`);
    try {
      const pendingMissions = await findCompletedMissionsWithPendingInfo();
      console.log(`[Pendências Diário] ${pendingMissions.length} OS concluídas com pendências encontradas`);

      const reportDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      if (pendingMissions.length > 0) {
        const sent = await sendPendingInfoReport(PENDING_REPORT_EMAIL, pendingMissions, reportDate);
        if (sent) {
          console.log(`[Pendências Diário] Relatório enviado com sucesso para ${PENDING_REPORT_EMAIL}`);
        } else {
          console.error(`[Pendências Diário] Falha ao enviar relatório para ${PENDING_REPORT_EMAIL}`);
        }
      } else {
        console.log(`[Pendências Diário] Nenhuma OS com pendências — email não enviado.`);
      }
    } catch (err: any) {
      console.error(`[Pendências Diário] Erro fatal:`, err.message);
    }
  }

  function scheduleDailyPendingReport() {
    const checkInterval = () => {
      const now = new Date();
      const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const hour = brasiliaTime.getHours();
      const minute = brasiliaTime.getMinutes();

      if (hour === 7 && minute === 30) {
        executeDailyPendingReport();
      }
    };

    setInterval(checkInterval, 60 * 1000);
    console.log(`[Pendências Diário] Agendamento ativo — relatório será enviado todos os dias às 07:30 (Brasília) para ${PENDING_REPORT_EMAIL}`);
  }

  scheduleDailyPendingReport();

  app.post("/api/relatorio-pendencias", requireAuth, requireRole('administrador', 'diretoria'), async (_req: Request, res: Response) => {
    try {
      const pendingMissions = await findCompletedMissionsWithPendingInfo();
      const reportDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const sent = await sendPendingInfoReport(PENDING_REPORT_EMAIL, pendingMissions, reportDate);
      res.json({ success: sent, total: pendingMissions.length, emailTo: PENDING_REPORT_EMAIL, date: reportDate });
    } catch (err: any) {
      console.error('[Pendências] Erro manual:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  const APPROVAL_REPORT_EMAIL = 'daniel@grupotmseg.com.br';

  async function findMissionsPendingApproval(): Promise<any[]> {
    const allMissions: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('missions')
        .select('id, client, provider, origin, destination, start_time, end_time, created_at, status')
        .in('status', ['Concluída', 'Concluida'])
        .range(from, from + pageSize - 1);
      if (error) { console.error('[Aprovações] Erro ao buscar missions:', error.message); break; }
      if (!data || data.length === 0) break;
      allMissions.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allMissions;
  }

  async function executeDailyApprovalReport() {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`[Aprovações Diário] Iniciando busca — ${now}`);
    try {
      const pendingApproval = await findMissionsPendingApproval();
      console.log(`[Aprovações Diário] ${pendingApproval.length} OS pendentes de aprovação`);

      const reportDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      if (pendingApproval.length > 0) {
        const sent = await sendApprovalPendingReport(APPROVAL_REPORT_EMAIL, pendingApproval, reportDate);
        if (sent) {
          console.log(`[Aprovações Diário] Relatório enviado para ${APPROVAL_REPORT_EMAIL}`);
        } else {
          console.error(`[Aprovações Diário] Falha ao enviar para ${APPROVAL_REPORT_EMAIL}`);
        }
      } else {
        console.log(`[Aprovações Diário] Nenhuma OS pendente — email não enviado.`);
      }
    } catch (err: any) {
      console.error(`[Aprovações Diário] Erro fatal:`, err.message);
    }
  }

  function scheduleDailyApprovalReport() {
    const checkInterval = () => {
      const now = new Date();
      const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const hour = brasiliaTime.getHours();
      const minute = brasiliaTime.getMinutes();

      if (hour === 7 && minute === 30) {
        executeDailyApprovalReport();
      }
    };

    setInterval(checkInterval, 60 * 1000);
    console.log(`[Aprovações Diário] Agendamento ativo — relatório será enviado todos os dias às 07:30 (Brasília) para ${APPROVAL_REPORT_EMAIL}`);
  }

  scheduleDailyApprovalReport();

  app.post("/api/relatorio-aprovacoes", requireAuth, requireRole('administrador', 'diretoria'), async (_req: Request, res: Response) => {
    try {
      const pendingApproval = await findMissionsPendingApproval();
      const reportDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const sent = await sendApprovalPendingReport(APPROVAL_REPORT_EMAIL, pendingApproval, reportDate);
      res.json({ success: sent, total: pendingApproval.length, emailTo: APPROVAL_REPORT_EMAIL, date: reportDate });
    } catch (err: any) {
      console.error('[Aprovações] Erro manual:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  const MISSING_INFO_REPORT_EMAILS = 'barbara@grupotmseg.com.br, michelle@grupotmseg.com.br, thiago@grupotmseg.com.br, daniel@grupotmseg.com.br';

  async function findAllMissionsWithMissingInfo(): Promise<any[]> {
    const allMissions: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('missions')
        .select('id, client, provider, origin, destination, start_time, end_time, start_km, end_km, driver_name, client_vehicle, agent1, created_at, scheduled_date, status')
        .not('status', 'in', '("Cancelada","Recusada")')
        .range(from, from + pageSize - 1);
      if (error) { console.error('[Dados Faltantes] Erro ao buscar missions:', error.message); break; }
      if (!data || data.length === 0) break;
      allMissions.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    return allMissions.filter((m: any) => {
      const missing =
        (!m.start_km && m.start_km !== 0) ||
        (!m.end_km && m.end_km !== 0) ||
        !m.start_time ||
        !m.end_time ||
        !m.agent1 || m.agent1 === '---' || m.agent1 === 'N/A' ||
        !m.provider || m.provider === '---' ||
        !m.origin ||
        !m.destination ||
        !m.driver_name ||
        !m.client_vehicle;
      return missing;
    });
  }

  async function executeDailyMissingInfoReport() {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`[Dados Faltantes Diário] Iniciando busca — ${now}`);
    try {
      const missions = await findAllMissionsWithMissingInfo();
      console.log(`[Dados Faltantes Diário] ${missions.length} OS com dados faltantes encontradas`);

      const reportDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      if (missions.length > 0) {
        const sent = await sendDailyMissingInfoReport(MISSING_INFO_REPORT_EMAILS, missions, reportDate);
        if (sent) {
          console.log(`[Dados Faltantes Diário] Relatório enviado para ${MISSING_INFO_REPORT_EMAILS}`);
        } else {
          console.error(`[Dados Faltantes Diário] Falha ao enviar relatório`);
        }
      } else {
        console.log(`[Dados Faltantes Diário] Nenhuma OS com dados faltantes — email não enviado.`);
      }
    } catch (err: any) {
      console.error(`[Dados Faltantes Diário] Erro fatal:`, err.message);
    }
  }

  function scheduleDailyMissingInfoReport() {
    const checkInterval = () => {
      const now = new Date();
      const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const hour = brasiliaTime.getHours();
      const minute = brasiliaTime.getMinutes();

      if (hour === 8 && minute === 0) {
        executeDailyMissingInfoReport();
      }
    };

    setInterval(checkInterval, 60 * 1000);
    console.log(`[Dados Faltantes Diário] Agendamento ativo — relatório será enviado todos os dias às 08:00 (Brasília) para ${MISSING_INFO_REPORT_EMAILS}`);
  }

  scheduleDailyMissingInfoReport();

  app.post("/api/relatorio-dados-faltantes", requireAuth, requireRole('administrador', 'diretoria'), async (_req: Request, res: Response) => {
    try {
      const missions = await findAllMissionsWithMissingInfo();
      const reportDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const sent = await sendDailyMissingInfoReport(MISSING_INFO_REPORT_EMAILS, missions, reportDate);
      res.json({ success: sent, total: missions.length, emailTo: MISSING_INFO_REPORT_EMAILS, date: reportDate });
    } catch (err: any) {
      console.error('[Dados Faltantes] Erro manual:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════
  // NF Travadas — relatório diário às 09:00
  // ═══════════════════════════════════════════════════════
  const STUCK_NF_REPORT_EMAILS = 'thiago@grupotmseg.com.br, michelle@grupotmseg.com.br, daniel@grupotmseg.com.br';

  async function executeDailyStuckNfReport() {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`[NF Travadas Diário] Iniciando varredura — ${now}`);
    try {
      const { listStuckNfs } = await import('./nfRetryWorker');
      const items = await listStuckNfs();
      console.log(`[NF Travadas Diário] ${items.length} NF(s) travadas encontradas`);
      if (items.length > 0) {
        const reportDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const sent = await sendStuckNfsReport(STUCK_NF_REPORT_EMAILS, items, reportDate);
        if (sent) console.log(`[NF Travadas Diário] Relatório enviado para ${STUCK_NF_REPORT_EMAILS}`);
      } else {
        console.log(`[NF Travadas Diário] Sem NFs travadas — email não enviado.`);
      }
    } catch (err: any) {
      console.error(`[NF Travadas Diário] Erro fatal:`, err.message);
    }
  }

  function scheduleDailyStuckNfReport() {
    const checkInterval = () => {
      const now = new Date();
      const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      if (brasiliaTime.getHours() === 9 && brasiliaTime.getMinutes() === 0) {
        executeDailyStuckNfReport();
      }
    };
    setInterval(checkInterval, 60 * 1000);
    console.log(`[NF Travadas Diário] Agendamento ativo — relatório será enviado todos os dias às 09:00 (Brasília) para ${STUCK_NF_REPORT_EMAILS}`);
  }

  scheduleDailyStuckNfReport();

  app.post("/api/relatorio-nfs-travadas", requireAuth, requireRole('administrador', 'diretoria', 'financeiro'), async (_req: Request, res: Response) => {
    try {
      const { listStuckNfs } = await import('./nfRetryWorker');
      const items = await listStuckNfs();
      const reportDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const sent = items.length > 0 ? await sendStuckNfsReport(STUCK_NF_REPORT_EMAILS, items, reportDate) : false;
      res.json({ success: sent, total: items.length, emailTo: STUCK_NF_REPORT_EMAILS, date: reportDate });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
