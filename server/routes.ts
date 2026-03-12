import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { Resend } from "resend";
import webpush from "web-push";
import { calculateMissionFinancials } from "../lib/financialUtils";
import fs from "fs";
import path from "path";

const resend = new Resend(process.env.RESEND_API_KEY);

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:contato@grupotmseg.com.br', VAPID_PUBLIC, VAPID_PRIVATE);
}

const pushSubscriptions = new Map<string, any>();
const verificationCodes = new Map<string, { code: string; expiresAt: number; email: string }>();

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now(), uptime: process.uptime() });
  });

  app.get('/sw.js', (_req: Request, res: Response) => {
    const swPath = path.resolve(process.cwd(), 'client', 'public', 'sw.js');
    if (fs.existsSync(swPath)) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(swPath);
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

  app.post('/api/push/subscribe', (req: Request, res: Response) => {
    try {
      const { subscription, userId } = req.body;
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Subscription inválida' });
      }
      const key = userId || subscription.endpoint;
      pushSubscriptions.set(key, subscription);
      console.log(`[Push] Subscription registrada: ${key.substring(0, 30)}... (total: ${pushSubscriptions.size})`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/push/unsubscribe', (req: Request, res: Response) => {
    try {
      const { userId, endpoint } = req.body;
      const key = userId || endpoint;
      pushSubscriptions.delete(key);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/push/send', async (req: Request, res: Response) => {
    try {
      const { title, body, tag } = req.body;
      if (!title) return res.status(400).json({ error: 'Título obrigatório' });

      const payload = JSON.stringify({ title, body: body || '', tag: tag || 'tmseg', icon: '/favicon.png' });
      const results: any[] = [];
      const failed: string[] = [];

      for (const [key, sub] of pushSubscriptions.entries()) {
        try {
          await webpush.sendNotification(sub, payload);
          results.push({ key: key.substring(0, 20), status: 'ok' });
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            pushSubscriptions.delete(key);
            failed.push(key.substring(0, 20));
          } else {
            results.push({ key: key.substring(0, 20), status: 'error', msg: err.message });
          }
        }
      }

      res.json({ sent: results.length, failed: failed.length, total: pushSubscriptions.size });
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

  // Supabase Realtime listener for push notifications
  const supabaseForPush = createClient(
    'https://ajhmmjuewdsukecaimik.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk'
  );

  supabaseForPush
    .channel('server-push-missions')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'missions'
    }, async (payload: any) => {
      const mission = payload.new;
      if (!mission || pushSubscriptions.size === 0) return;

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

      const pushPayload = JSON.stringify({ title, body, tag: `mission-${osId}`, icon: '/favicon.png' });

      for (const [key, sub] of pushSubscriptions.entries()) {
        try {
          await webpush.sendNotification(sub, pushPayload);
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            pushSubscriptions.delete(key);
          }
        }
      }
      console.log(`[Push] Notificação enviada para ${pushSubscriptions.size} dispositivos: OS ${osId}`);
    })
    .subscribe();

  app.post("/api/gemini/generate", async (req: Request, res: Response) => {
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

  app.post("/api/chat", async (req: Request, res: Response) => {
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

  const SUPABASE_URL = 'https://ajhmmjuewdsukecaimik.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
      const DB_CAPACITY_GB = Number(process.env.DB_CAPACITY_GB || 0.5);

      const tables = ['missions', 'clients', 'providers', 'vehicles', 'system_users',
        'financial_transactions', 'commercial_proposals', 'client_price_tables',
        'provider_cost_tables', 'system_logs', 'financial_accounts', 'financial_categories'];

      let totalRows = 0;
      const tableStats: any[] = [];

      for (const table of tables) {
        try {
          const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
          if (!error && count !== null) {
            totalRows += count;
            tableStats.push({ table, rows: count });
          }
        } catch {}
      }

      let used_bytes = 0;
      let dbSizeSource = 'estimate';

      try {
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('get_db_usage_bytes');
        if (!rpcErr && rpcData) {
          used_bytes = Number(rpcData);
          dbSizeSource = 'rpc';
        }
      } catch {}

      if (used_bytes === 0) {
        const avgRowBytes = 800;
        used_bytes = totalRows * avgRowBytes;
        dbSizeSource = 'estimate';
      }

      const limit_bytes = Math.round(DB_CAPACITY_GB * 1024 * 1024 * 1024);
      const percent_used = limit_bytes > 0 ? used_bytes / limit_bytes : null;

      res.json({
        used_bytes,
        limit_bytes,
        percent_used,
        used_mb: +(used_bytes / 1024 / 1024).toFixed(2),
        used_gb: +(used_bytes / 1024 / 1024 / 1024).toFixed(3),
        limit_gb: DB_CAPACITY_GB,
        total_rows: totalRows,
        tables: tableStats.sort((a, b) => b.rows - a.rows),
        source: dbSizeSource,
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/platform/costs", async (_req: Request, res: Response) => {
    try {
      let overrides: Record<string, number> = {};
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 1 });
        try {
          await pool.query(`CREATE TABLE IF NOT EXISTS platform_cost_overrides (
            key TEXT PRIMARY KEY,
            value NUMERIC DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
          )`);
          const { rows } = await pool.query('SELECT key, value FROM platform_cost_overrides');
          rows.forEach((r: any) => { overrides[r.key] = Number(r.value) || 0; });
        } catch (e) { console.error('Erro ao ler overrides:', e); }
        finally { await pool.end(); }
      }

      const BRL_RATE = overrides['usd_to_brl'] || Number(process.env.USD_TO_BRL || 5.80);

      const replitPlan = process.env.REPLIT_PLAN || 'Hacker';
      const replitPlanCosts: Record<string, { usd: number, label: string }> = {
        'Free': { usd: 0, label: 'Free' },
        'Starter': { usd: 9, label: 'Starter ($9/mês)' },
        'Hacker': { usd: 7, label: 'Hacker ($7/mês)' },
        'Pro': { usd: 20, label: 'Pro ($20/mês)' },
        'Teams': { usd: 25, label: 'Teams ($25/mês)' },
      };
      const replitBase = replitPlanCosts[replitPlan] || replitPlanCosts['Hacker'];

      const supabasePlan = process.env.SUPABASE_PLAN || 'Free';
      const supabasePlanCosts: Record<string, { usd: number, label: string }> = {
        'Free': { usd: 0, label: 'Free Tier' },
        'Pro': { usd: 25, label: 'Pro ($25/mês)' },
        'Team': { usd: 599, label: 'Team ($599/mês)' },
      };
      const supabaseBase = supabasePlanCosts[supabasePlan] || supabasePlanCosts['Free'];

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

      const DB_CAPACITY_GB = Number(process.env.DB_CAPACITY_GB || 0.5);
      let dbUsedMb = 0;
      try {
        const { data: capData } = await supabaseAdmin.from('missions').select('*', { count: 'exact', head: true });
        const missionsCount = (capData as any)?.length || 0;
        dbUsedMb = missionsCount * 0.001;
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
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL não configurada' });
      const { overrides } = req.body;
      if (!overrides || typeof overrides !== 'object') return res.status(400).json({ error: 'overrides inválidos' });

      const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 1 });
      try {
        await pool.query(`CREATE TABLE IF NOT EXISTS platform_cost_overrides (
          key TEXT PRIMARY KEY,
          value NUMERIC DEFAULT 0,
          updated_at TIMESTAMP DEFAULT NOW()
        )`);
        for (const [key, value] of Object.entries(overrides)) {
          const numVal = Number(value) || 0;
          await pool.query(
            `INSERT INTO platform_cost_overrides (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
            [key, numVal]
          );
        }
        res.json({ success: true, saved: Object.keys(overrides).length });
      } finally {
        await pool.end();
      }
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

          const newRevenue = parseFloat((financials.client.total - financials.tollValue).toFixed(2));
          const newCost = parseFloat((financials.provider.total - financials.tollValue).toFixed(2));

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
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) { res.json({ ok: false, error: "No DATABASE_URL" }); return; }
      const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS client_registries (
          id SERIAL PRIMARY KEY,
          client_id TEXT NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(client_id, type, name)
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS client_mission_notes (
          id SERIAL PRIMARY KEY,
          mission_id TEXT NOT NULL UNIQUE,
          client_id TEXT NOT NULL,
          motivo TEXT DEFAULT '',
          contrato TEXT DEFAULT '',
          operacao TEXT DEFAULT '',
          tsp TEXT DEFAULT '',
          responsavel TEXT DEFAULT '',
          obs TEXT DEFAULT '',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await pool.query(`ALTER TABLE client_mission_notes ADD COLUMN IF NOT EXISTS responsavel TEXT DEFAULT ''`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS operational_report TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS provider_start_km DOUBLE PRECISION`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS provider_end_km DOUBLE PRECISION`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS provider_start_time TIMESTAMPTZ`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS provider_end_time TIMESTAMPTZ`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS provider_ops_edited BOOLEAN DEFAULT FALSE`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS revenue_edit_reason TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS cost_edit_reason TEXT`).catch(() => {});
      await pool.end();
      console.log("Client registries tables created/verified.");
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Error creating client registries tables:", e.message);
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

          const results = {
              mission_history: `${historyDeleted} registros removidos`,
              mission_logs: `${logsDeleted} registros removidos`,
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

  app.post("/api/admin/cleanup-history", async (_req: Request, res: Response) => {
      try {
          const results = await runHistoryCleanup();
          res.json({ ok: true, ...results });
      } catch (e: any) {
          res.json({ ok: false, error: e.message });
      }
  });

  app.get("/api/admin/cleanup-preview", async (_req: Request, res: Response) => {
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
        { name: 'cost_edit_reason', type: 'text' }
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

      // Use direct SQL via the Supabase management/SQL endpoint
      const sqlStatements = columns.map(c => `ALTER TABLE missions ADD COLUMN IF NOT EXISTS ${c.name} ${c.type}`).join('; ');
      
      // Try via pg connection to Supabase directly
      const supabasePgUrl = `postgresql://postgres.ajhmmjuewdsukecaimik:${process.env.SUPABASE_DB_PASSWORD || ''}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;
      try {
        const pool = new pg.Pool({ connectionString: supabasePgUrl, ssl: { rejectUnauthorized: false } });
        for (const col of columns) {
          await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`).catch(() => {});
        }
        await pool.end();
        res.json({ ok: true, method: 'pg_direct', columns: columns.map(c => c.name) });
      } catch (pgErr: any) {
        res.json({ ok: false, error: pgErr.message, hint: 'Set SUPABASE_DB_PASSWORD secret or run ALTER TABLE manually in Supabase SQL Editor' });
      }
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

  const ensureReportsTable = async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return;
    const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 2 });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS operational_reports (
        id SERIAL PRIMARY KEY,
        mission_id TEXT NOT NULL UNIQUE,
        report_html TEXT NOT NULL DEFAULT '',
        acionado_por TEXT DEFAULT '',
        descritivo TEXT DEFAULT '',
        whatsapp_raw TEXT DEFAULT '',
        photos JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.end();
  };
  ensureReportsTable().catch(e => console.warn('Erro ao criar tabela operational_reports:', e.message));

  app.get("/api/missions/:id/operational-report", async (req: Request, res: Response) => {
    let pool;
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) { res.json({ operational_report: null }); return; }
      pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 2 });
      const result = await pool.query('SELECT * FROM operational_reports WHERE mission_id = $1', [req.params.id]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
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
    } finally {
      if (pool) await pool.end();
    }
  });

  app.patch("/api/missions/:id/operational-report", async (req: Request, res: Response) => {
    let pool;
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) { res.status(500).json({ ok: false, error: 'No DATABASE_URL' }); return; }
      pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 2 });
      const { operational_report, acionado_por, descritivo, whatsapp_raw, photos } = req.body;
      await pool.query(`
        INSERT INTO operational_reports (mission_id, report_html, acionado_por, descritivo, whatsapp_raw, photos, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (mission_id)
        DO UPDATE SET report_html = $2, acionado_por = $3, descritivo = $4, whatsapp_raw = $5, photos = $6, updated_at = NOW()
      `, [req.params.id, operational_report || '', acionado_por || '', descritivo || '', whatsapp_raw || '', JSON.stringify(photos || [])]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    } finally {
      if (pool) await pool.end();
    }
  });

  const getDbPool = () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("No DATABASE_URL");
    return new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 3 });
  };

  app.get("/api/client-registries/:clientId/:type", async (req: Request, res: Response) => {
    let pool;
    try {
      const { clientId, type } = req.params;
      pool = getDbPool();
      const result = await pool.query('SELECT * FROM client_registries WHERE client_id = $1 AND type = $2 ORDER BY name', [clientId, type]);
      res.json(result.rows);
    } catch (e: any) {
      res.json([]);
    } finally { pool?.end().catch(() => {}); }
  });

  app.post("/api/client-registries", async (req: Request, res: Response) => {
    let pool;
    try {
      const { client_id, type, name } = req.body;
      if (!client_id || !type || !name) return res.status(400).json({ error: "Campos obrigatórios" });
      pool = getDbPool();
      const result = await pool.query(
        'INSERT INTO client_registries (client_id, type, name) VALUES ($1, $2, $3) ON CONFLICT (client_id, type, name) DO NOTHING RETURNING *',
        [client_id, type, name.trim()]
      );
      res.json(result.rows[0] || { client_id, type, name: name.trim() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.delete("/api/client-registries/:id", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      await pool.query('DELETE FROM client_registries WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.get("/api/client-mission-notes/:missionId", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      const result = await pool.query('SELECT * FROM client_mission_notes WHERE mission_id = $1', [req.params.missionId]);
      res.json(result.rows[0] || null);
    } catch (e: any) {
      res.json(null);
    } finally { pool?.end().catch(() => {}); }
  });

  app.post("/api/client-mission-notes", async (req: Request, res: Response) => {
    let pool;
    try {
      const { mission_id, client_id, motivo, contrato, operacao, tsp, responsavel, obs } = req.body;
      if (!mission_id || !client_id) return res.status(400).json({ error: "Campos obrigatórios" });
      pool = getDbPool();
      const result = await pool.query(
        `INSERT INTO client_mission_notes (mission_id, client_id, motivo, contrato, operacao, tsp, responsavel, obs, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (mission_id) DO UPDATE SET motivo=$3, contrato=$4, operacao=$5, tsp=$6, responsavel=$7, obs=$8, updated_at=NOW()
         RETURNING *`,
        [mission_id, client_id, motivo || '', contrato || '', operacao || '', tsp || '', responsavel || '', obs || '']
      );
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.post("/api/investment/init", async (_req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS account_balance_snapshots (
          id SERIAL PRIMARY KEY,
          account_id TEXT NOT NULL,
          balance NUMERIC(15,2) NOT NULL DEFAULT 0,
          notes TEXT DEFAULT '',
          created_by TEXT DEFAULT '',
          recorded_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_abs_account ON account_balance_snapshots(account_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_abs_recorded ON account_balance_snapshots(recorded_at)`);
      res.json({ ok: true });
    } catch (e: any) {
      res.json({ ok: true, note: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.get("/api/investment/snapshots/:accountId", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      const { accountId } = req.params;
      const days = parseInt(req.query.days as string) || 365;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const result = await pool.query(
        'SELECT * FROM account_balance_snapshots WHERE account_id = $1 AND recorded_at >= $2 ORDER BY recorded_at ASC',
        [accountId, since]
      );
      res.json(result.rows);
    } catch (e: any) {
      res.json([]);
    } finally { pool?.end().catch(() => {}); }
  });

  app.get("/api/investment/snapshots-all", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      const days = parseInt(req.query.days as string) || 365;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const result = await pool.query(
        'SELECT * FROM account_balance_snapshots WHERE recorded_at >= $1 ORDER BY recorded_at ASC',
        [since]
      );
      res.json(result.rows);
    } catch (e: any) {
      res.json([]);
    } finally { pool?.end().catch(() => {}); }
  });

  app.post("/api/investment/snapshots", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      const { account_id, balance, notes, created_by } = req.body;
      const result = await pool.query(
        'INSERT INTO account_balance_snapshots (account_id, balance, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [account_id, balance, notes || '', created_by || '']
      );
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.delete("/api/investment/snapshots/:id", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      await pool.query('DELETE FROM account_balance_snapshots WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.get("/api/client-mission-notes/bulk/:clientId", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      const result = await pool.query('SELECT * FROM client_mission_notes WHERE client_id = $1', [req.params.clientId]);
      res.json(result.rows);
    } catch (e: any) {
      res.json([]);
    } finally { pool?.end().catch(() => {}); }
  });

  app.post("/api/email/send-verification", async (req: Request, res: Response) => {
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

      const { error } = await resend.emails.send({
        from: "TMSEG Sistema <onboarding@resend.dev>",
        to: [email],
        subject: "🔐 Código de Verificação - Grupo TMSEG",
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 500px; margin: 0 auto; background: #0f172a; border-radius: 16px; overflow: hidden; border: 1px solid #1e293b;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 32px 24px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 2px;">GRUPO TMSEG</h1>
              <p style="color: #fca5a5; margin: 4px 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 3px;">Verificação de Segurança</p>
            </div>
            <div style="padding: 32px 24px; text-align: center;">
              <p style="color: #94a3b8; font-size: 14px; margin: 0 0 8px;">Olá <strong style="color: white;">${userName || 'Usuário'}</strong>,</p>
              <p style="color: #64748b; font-size: 13px; margin: 0 0 24px;">Use o código abaixo para confirmar a criação da sua conta:</p>
              <div style="background: #1e293b; border: 2px solid #dc2626; border-radius: 12px; padding: 20px; display: inline-block; min-width: 200px;">
                <span style="font-size: 36px; font-weight: 900; color: #dc2626; letter-spacing: 12px; font-family: 'Courier New', monospace;">${code}</span>
              </div>
              <p style="color: #475569; font-size: 11px; margin: 20px 0 0;">Este código expira em <strong style="color: #f59e0b;">10 minutos</strong>.</p>
              <p style="color: #334155; font-size: 10px; margin: 16px 0 0;">Se você não solicitou este código, ignore este e-mail.</p>
            </div>
            <div style="background: #020617; padding: 16px 24px; text-align: center; border-top: 1px solid #1e293b;">
              <p style="color: #334155; font-size: 9px; margin: 0; text-transform: uppercase; letter-spacing: 2px;">Intermediadora de Escolta Armada e Segurança Patrimonial</p>
            </div>
          </div>
        `
      });

      if (error) {
        console.error("Resend error:", error);
        return res.json({ sessionId, message: "E-mail não pôde ser enviado (domínio não verificado no Resend). Use o código exibido na tela.", fallbackCode: code });
      }

      res.json({ sessionId, message: "Código enviado com sucesso" });
    } catch (e: any) {
      console.error("Email verification error:", e);
      res.status(500).json({ error: e.message || "Erro interno ao enviar e-mail" });
    }
  });

  app.post("/api/email/verify-code", async (req: Request, res: Response) => {
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

  app.post("/api/billing/recalculate-all", async (req: Request, res: Response) => {
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

  app.post('/api/toll/calculate', async (req: Request, res: Response) => {
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

  return httpServer;
}
