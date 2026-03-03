import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { Resend } from "resend";
import { calculateMissionFinancials } from "../lib/financialUtils";

const resend = new Resend(process.env.RESEND_API_KEY);
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
      const BRL_RATE = Number(process.env.USD_TO_BRL || 5.80);

      const replitPlan = process.env.REPLIT_PLAN || 'Hacker';
      const replitPlanCosts: Record<string, { usd: number, label: string }> = {
        'Free': { usd: 0, label: 'Free' },
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

      const replitExtraEgress = Number(process.env.REPLIT_EXTRA_EGRESS_USD || 0);
      const replitExtraCompute = Number(process.env.REPLIT_EXTRA_COMPUTE_USD || 0);
      const replitExtraStorage = Number(process.env.REPLIT_EXTRA_STORAGE_USD || 0);
      const supabaseExtraDb = Number(process.env.SUPABASE_EXTRA_DB_USD || 0);
      const supabaseExtraBandwidth = Number(process.env.SUPABASE_EXTRA_BANDWIDTH_USD || 0);
      const supabaseExtraStorage = Number(process.env.SUPABASE_EXTRA_STORAGE_USD || 0);

      const googleMapsEstimate = Number(process.env.GOOGLE_MAPS_MONTHLY_USD || 0);
      const resendEstimate = Number(process.env.RESEND_MONTHLY_USD || 0);
      const otherCosts = Number(process.env.OTHER_MONTHLY_COSTS_USD || 0);

      const replitTotalUsd = replitBase.usd + replitExtraEgress + replitExtraCompute + replitExtraStorage;
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

  app.post("/api/toll/calculate", async (req: Request, res: Response) => {
    try {
      const { origin, destination } = req.body;
      if (!origin || !destination) {
        return res.status(400).json({ error: "Origem e destino são obrigatórios" });
      }

      const GOOGLE_MAPS_KEY = "AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k";
      const ROTAS_BRASIL_TOKEN = process.env.ROTAS_BRASIL_TOKEN || "";

      const geocode = async (address: string) => {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_KEY}&region=br&language=pt-BR`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.status === "OK" && data.results.length > 0) {
          const loc = data.results[0].geometry.location;
          return { lat: loc.lat, lng: loc.lng };
        }
        return null;
      };

      const [originCoords, destCoords] = await Promise.all([
        geocode(origin),
        geocode(destination),
      ]);

      if (!originCoords || !destCoords) {
        return res.status(400).json({
          error: "Não foi possível geocodificar os endereços",
          details: {
            origin: originCoords ? "OK" : "Falha",
            destination: destCoords ? "OK" : "Falha",
          },
        });
      }

      if (ROTAS_BRASIL_TOKEN) {
        try {
          const pontos = `${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}`;
          const rbUrl = `https://rotasbrasil.com.br/apiRotas/coordenadas/?pontos=${encodeURIComponent(pontos)}&veiculo=auto&eixo=2&paradas=true&token=${ROTAS_BRASIL_TOKEN}`;

          const rbResp = await fetch(rbUrl);
          const rbText = await rbResp.text();
          let rbData: any = null;
          try { rbData = JSON.parse(rbText); } catch { /* ignore */ }

          if (rbData?.rotas && rbData.rotas.length > 0) {
            const rota = rbData.rotas[0];
            const pedagios = (rota.pedagios || []).map((p: any) => ({
              nome: p.praca || "Pedágio",
              cidade: "",
              rodovia: p.rodovia || "",
              concessionaria: p.concessionaria || "",
              km: p.km || "",
              valorDinheiro: p.valor || 0,
              valorTag: p.valor || 0,
              distanciaOrigem: p.distanciaOrigem || 0,
            }));

            return res.json({
              success: true,
              provider: "rotasbrasil",
              tollValue: rota.valorPedagio || 0,
              tollCount: pedagios.length,
              tolls: pedagios,
              distance: rota.distancia || 0,
              duration: rota.duracao || "",
              credits: rota.creditoDisponivel || null,
              origin: { address: origin, coords: originCoords },
              destination: { address: destination, coords: destCoords },
            });
          }

          if (rbData?.error || rbData?.message) {
            console.error("Rotas Brasil API error:", rbData.error || rbData.message);
          }
        } catch (rbErr: any) {
          console.error("Erro ao consultar Rotas Brasil:", rbErr.message);
        }
      }

      const TOLL_API_KEY = "c584cfb5-0c6a-4816-bfdd-3519c5bc5ef7";
      try {
        const tollResp = await fetch("https://www.calcularpedagio.com.br/api/coordenadas/v3", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TOLL_API_KEY}`,
          },
          body: JSON.stringify({
            pontos: [[originCoords.lat, originCoords.lng], [destCoords.lat, destCoords.lng]],
          }),
        });

        const tollText = await tollResp.text();
        let tollData: any = null;
        try { tollData = JSON.parse(tollText); } catch { /* ignore */ }

        if (tollData?.error) {
          return res.json({
            success: false,
            apiError: ROTAS_BRASIL_TOKEN
              ? tollData.error
              : "Token Rotas Brasil não configurado. Configure o secret ROTAS_BRASIL_TOKEN para ativar o cálculo automático de pedágio.",
            tollValue: 0,
            tollCount: 0,
            tolls: [],
            origin: { address: origin, coords: originCoords },
            destination: { address: destination, coords: destCoords },
          });
        }

        if (tollResp.ok && tollData) {
          const totalDinheiro = tollData?.custoTotalPedagiosDinheiro?.auto2eixos ?? 0;
          const pedagios = (tollData?.pedagiosRota || []).map((p: any) => ({
            nome: p.nome || p.concessionaria || "Pedágio",
            cidade: p.cidade || "",
            rodovia: p.rodovia || "",
            valorDinheiro: p.auto2eixos || 0,
            valorTag: p.autoTag2eixos || p.auto2eixos || 0,
          }));

          return res.json({
            success: true,
            provider: "calcularpedagio",
            tollValue: totalDinheiro,
            tollCount: pedagios.length,
            tolls: pedagios,
            origin: { address: origin, coords: originCoords },
            destination: { address: destination, coords: destCoords },
          });
        }
      } catch (cpErr: any) {
        console.error("Erro ao consultar CalcularPedágio:", cpErr.message);
      }

      res.json({
        success: false,
        apiError: ROTAS_BRASIL_TOKEN
          ? "Nenhuma API de pedágio retornou resultado."
          : "Token Rotas Brasil não configurado. Acesse rotasbrasil.com.br, crie uma conta, e adicione o token no secret ROTAS_BRASIL_TOKEN.",
        tollValue: 0,
        tollCount: 0,
        tolls: [],
        origin: { address: origin, coords: originCoords },
        destination: { address: destination, coords: destCoords },
      });
    } catch (e: any) {
      console.error("Erro ao calcular pedágio:", e);
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
      await pool.end();
      console.log("Client registries tables created/verified.");
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Error creating client registries tables:", e.message);
      res.json({ ok: true, note: e.message });
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

  return httpServer;
}
