import "./loadEnv";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { isVercel } from "./runtime";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

let appPromise: Promise<Express> | null = null;

export function getApp(): Promise<Express> {
  if (!appPromise) appPromise = buildApp();
  return appPromise;
}

async function buildApp(): Promise<Express> {
  const app = express();
  const httpServer = createServer(app);

  app.use(
    express.json({
      limit: "50mb",
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    next();
  });

  app.disable("etag");

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined;

    const originalResJson = res.json.bind(res);
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson as Record<string, unknown>;
      return originalResJson(bodyJson, ...args);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          const safeBody = { ...capturedJsonResponse };
          if (typeof safeBody.image === 'string' && safeBody.image.length > 200) {
            safeBody.image = `<base64 ${safeBody.image.length} chars>`;
          }
          logLine += ` :: ${JSON.stringify(safeBody)}`;
        }
        log(logLine);
      }
    });

    next();
  });

  await registerRoutes(httpServer, app);

  // A função já existe em api/geocode-address.ts (Vercel). Sem esta rota, o Vite local
  // devolve o arquivo em vez de executar a geocodificação e o mapa da missão fica vazio.
  const { default: geocodeAddress } = await import("../api/geocode-address");
  app.get("/api/geocode-address", (req, res) => {
    void geocodeAddress(req, res);
  });
  app.post("/api/mapa-estatico", async (req, res) => {
    try {
      const { renderizarMapaPng } = await import("../lib/osActionPlan/mapaEstatico");
      const png = await renderizarMapaPng(req.body || {});
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.send(png);
    } catch (erro: any) {
      res.status(500).json({ success: false, error: erro?.message || "mapa indisponível" });
    }
  });
  // A foto pública do armazenamento entra no HTML por aqui. O navegador sozinho
  // deixava a geração presa e a impressão saía com o espaço da imagem em branco.
  app.post("/api/evidencia-imagem", async (req, res) => {
    try {
      const { embutirEvidencias } = await import("../lib/osActionPlan/embutirEvidenciaServidor");
      const imagens = await embutirEvidencias(req.body?.urls);
      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, imagens });
    } catch (erro: any) {
      res.status(500).json({ success: false, error: erro?.message || "foto indisponível", imagens: [] });
    }
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  // Na Vercel o front estático é servido pelo CDN; só monta static em host longo.
  if (!isVercel && process.env.NODE_ENV === "production") {
    serveStatic(app);
  }

  return app;
}
