import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

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

  return httpServer;
}
