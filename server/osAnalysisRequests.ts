import type { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createSupabaseAdminClient } from './supabaseConfig';
import { sendSystemAlertEmail } from './emailService';
import { OS_ANALYSIS_RECIPIENT_EMAILS } from '../lib/osAnalysisAccess';

const SYSTEM_URL = (process.env.SYSTEM_URL || 'https://sistema.grupotmseg.com.br').replace(/\/$/, '');

function buildAuditLink(missionId: string): string {
  return `${SYSTEM_URL}/?page=missions&openMission=${encodeURIComponent(missionId)}`;
}

let schemaReady = false;

export async function ensureOsAnalysisSchema(): Promise<void> {
  if (schemaReady) return;
  const sb = createSupabaseAdminClient();
  if (!sb) return;
  const sqlPath = path.join(process.cwd(), 'migrations', '2026_07_29_os_analysis_requests.sql');
  if (!fs.existsSync(sqlPath)) return;
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql.split(';').map((s) => s.trim()).filter((s) => s && !s.startsWith('--'));
  for (const statement of statements) {
    try {
      await sb.rpc('exec_sql', { sql: statement + ';' });
    } catch {
      // idempotente
    }
  }
  schemaReady = true;
}

async function resolveUserFromToken(req: Request): Promise<{ name: string; role: string } | null> {
  if ((req as any).user?.name) {
    return {
      name: String((req as any).user.name),
      role: String((req as any).user.role || '').toLowerCase(),
    };
  }
  const token = String((req as any).authToken || req.headers['authorization']?.toString().replace(/^Bearer\s+/i, '') || '').trim();
  if (!token) return null;
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  const userId = match?.[1];
  if (!userId) return null;
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  const { data } = await sb
    .from('system_users')
    .select('name, profiles:profile_id ( name )')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: String((data as any).name || 'Sistema'),
    role: String((data as any).profiles?.name || '').toLowerCase(),
  };
}

function isDiretoriaUser(name: string, role: string): boolean {
  const n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (n.includes('thiago moreira') || n.includes('thiago santos')) return true;
  return role === 'diretoria';
}

export function registerOsAnalysisRoutes(app: Express, requireAuth: any): void {
  app.post('/api/missions/:id/request-analysis', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolveUserFromToken(req);
      if (!user || !isDiretoriaUser(user.name, user.role)) {
        return res.status(403).json({ error: 'Somente Diretoria pode pedir análise de OS.' });
      }
      await ensureOsAnalysisSchema();
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(500).json({ error: 'Supabase admin indisponível' });

      const missionId = String(req.params.id || '').trim();
      const note = String(req.body?.note || req.body?.observation || '').trim();
      if (!missionId || !note) {
        return res.status(400).json({ error: 'Informe a OS e a observação.' });
      }

      const source = String(req.body?.source || 'audit');
      const revenueBefore = Number(req.body?.revenueBefore ?? 0) || 0;
      const costBefore = Number(req.body?.costBefore ?? 0) || 0;
      const resultBefore = Number(req.body?.resultBefore ?? (revenueBefore - costBefore)) || 0;
      const clientName = req.body?.client || null;
      const providerName = req.body?.provider || null;
      const requestedBy = user.name;

      const { data, error } = await sb
        .from('os_analysis_requests')
        .insert([{
          mission_id: missionId,
          client_name: clientName,
          provider_name: providerName,
          requested_by: requestedBy,
          request_note: note,
          source,
          status: 'pending',
          revenue_before: revenueBefore,
          cost_before: costBefore,
          result_before: resultBefore,
        }])
        .select('*')
        .single();

      if (error) {
        return res.status(500).json({
          error: error.message.includes('does not exist')
            ? 'Tabela os_analysis_requests não existe. Execute a migration no Supabase.'
            : error.message,
        });
      }

      const link = buildAuditLink(missionId);
      const html = `
        <p><strong>${requestedBy}</strong> pediu para analisar essa OS.</p>
        <p style="margin:16px 0;padding:12px 16px;background:#fff7ed;border-left:4px solid #d97706;border-radius:6px;">
          <strong>Observação:</strong><br/>${note.replace(/</g, '&lt;').replace(/\n/g, '<br/>')}
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">OS</td><td style="padding:8px;border-bottom:1px solid #eee;"><strong>${missionId}</strong></td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">Cliente</td><td style="padding:8px;border-bottom:1px solid #eee;">${clientName || '—'}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">Fornecedor</td><td style="padding:8px;border-bottom:1px solid #eee;">${providerName || '—'}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">Resultado atual</td><td style="padding:8px;border-bottom:1px solid #eee;">R$ ${resultBefore.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>
        </table>
        <p style="text-align:center;margin:24px 0;">
          <a href="${link}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">
            Abrir Auditoria da OS
          </a>
        </p>
        <p style="font-size:12px;color:#666;">Ao ajustar, informe o <strong>motivo</strong> — a Diretoria verá o delta de valores na tela de Pendências de OS.</p>
      `;

      // Resolve e-mails no banco se existirem (fallback para defaults)
      let recipients = [...OS_ANALYSIS_RECIPIENT_EMAILS];
      try {
        const { data: users } = await sb
          .from('system_users')
          .select('name, email')
          .or('name.ilike.%barbara%,name.ilike.%giovanna%');
        const found = (users || [])
          .map((u: any) => String(u.email || '').trim().toLowerCase())
          .filter((e: string) => e.includes('@'));
        if (found.length) recipients = [...new Set([...found, ...OS_ANALYSIS_RECIPIENT_EMAILS])];
      } catch {
        // mantém defaults
      }

      const sent = await sendSystemAlertEmail(
        recipients,
        `Thiago pediu para analisar essa OS — ${missionId}`,
        html,
      );

      res.json({ ok: true, request: data, emailSent: sent, link });
    } catch (e: any) {
      console.error('[OS Analysis] request failed:', e?.message);
      res.status(500).json({ error: e?.message || 'Falha ao pedir análise' });
    }
  });

  app.get('/api/missions/analysis-requests', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolveUserFromToken(req);
      if (!user || !isDiretoriaUser(user.name, user.role)) {
        return res.status(403).json({ error: 'Somente Diretoria.' });
      }
      await ensureOsAnalysisSchema();
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(500).json({ error: 'Supabase admin indisponível' });

      const status = String(req.query.status || '').trim();
      let q = sb.from('os_analysis_requests').select('*').order('created_at', { ascending: false }).limit(300);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true, items: data || [] });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Falha ao listar' });
    }
  });

  app.get('/api/missions/:id/analysis-requests/open', requireAuth, async (req: Request, res: Response) => {
    try {
      await ensureOsAnalysisSchema();
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(500).json({ error: 'Supabase admin indisponível' });
      const missionId = String(req.params.id || '').trim();
      const { data, error } = await sb
        .from('os_analysis_requests')
        .select('*')
        .eq('mission_id', missionId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true, request: data || null });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Falha' });
    }
  });

  app.post('/api/missions/:id/analysis-response', requireAuth, async (req: Request, res: Response) => {
    try {
      await ensureOsAnalysisSchema();
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(500).json({ error: 'Supabase admin indisponível' });

      const missionId = String(req.params.id || '').trim();
      const reason = String(req.body?.reason || '').trim();
      if (!missionId || !reason) {
        return res.status(400).json({ error: 'Informe o motivo do ajuste.' });
      }

      const user = await resolveUserFromToken(req);
      const adjustedBy = user?.name || 'Usuário';
      const revenueAfter = Number(req.body?.revenueAfter ?? 0) || 0;
      const costAfter = Number(req.body?.costAfter ?? 0) || 0;
      const resultAfter = Number(req.body?.resultAfter ?? (revenueAfter - costAfter)) || 0;
      const changesSummary = String(req.body?.changesSummary || '').trim();
      const requestId = req.body?.requestId ? String(req.body.requestId) : null;

      let pending = null as any;
      if (requestId) {
        const { data } = await sb.from('os_analysis_requests').select('*').eq('id', requestId).maybeSingle();
        pending = data;
      } else {
        const { data } = await sb
          .from('os_analysis_requests')
          .select('*')
          .eq('mission_id', missionId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        pending = data;
      }

      if (!pending) {
        return res.json({ ok: true, skipped: true, reason: 'Nenhum pedido pendente para esta OS.' });
      }

      const resultDelta = Math.round((resultAfter - Number(pending.result_before || 0)) * 100) / 100;
      const { data, error } = await sb
        .from('os_analysis_requests')
        .update({
          status: 'adjusted',
          adjusted_by: adjustedBy,
          adjusted_at: new Date().toISOString(),
          adjustment_reason: reason,
          revenue_after: revenueAfter,
          cost_after: costAfter,
          result_after: resultAfter,
          result_delta: resultDelta,
          changes_summary: changesSummary || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pending.id)
        .select('*')
        .single();

      if (error) return res.status(500).json({ error: error.message });

      // Notifica Diretoria que o ajuste foi feito
      const impact =
        resultDelta > 0.01 ? 'RESULTADO POSITIVO (melhorou)' :
        resultDelta < -0.01 ? 'RESULTADO NEGATIVO (piorou)' :
        'RESULTADO ESTÁVEL';
      await sendSystemAlertEmail(
        ['thiago@grupotmseg.com.br'],
        `OS ${missionId} ajustada — ${impact}`,
        `<p><strong>${adjustedBy}</strong> respondeu ao pedido de análise da OS <strong>${missionId}</strong>.</p>
         <p><strong>Motivo:</strong> ${reason.replace(/</g, '&lt;')}</p>
         <p>Antes: R$ ${Number(pending.result_before).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} → Depois: R$ ${resultAfter.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Δ R$ ${resultDelta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</p>
         <p>${impact}</p>
         <p><a href="${SYSTEM_URL}/?page=os-analysis-pending">Abrir Pendências de OS</a></p>`,
      );

      res.json({ ok: true, request: data });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Falha ao registrar resposta' });
    }
  });

  app.post('/api/missions/analysis-requests/:id/review', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolveUserFromToken(req);
      if (!user || !isDiretoriaUser(user.name, user.role)) return res.status(403).json({ error: 'Somente Diretoria.' });
      await ensureOsAnalysisSchema();
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(500).json({ error: 'Supabase admin indisponível' });
      const name = user.name;
      const { data, error } = await sb
        .from('os_analysis_requests')
        .update({
          status: 'reviewed',
          reviewed_by: name,
          reviewed_at: new Date().toISOString(),
          review_notes: String(req.body?.notes || '').trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id)
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true, request: data });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Falha' });
    }
  });
}
