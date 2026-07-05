import "./loadEnv";
import { createServer } from "http";
import { getApp, log } from "./createApp";
import { cleanupRealtimeListeners } from "./routes";
import { startNfRetryWorker } from "./nfRetryWorker";
import { startFinancialReportWorker } from "./financialReportWorker";
import { startDhlIntakeExpiryWorker } from "./dhlSupplierIntake";
import { startClientEmailQueueWorker } from "./clientEmailQueueWorker";
import { startZapiWatchdog } from "./zapiWatchdog";
import { isLongRunningHost } from "./runtime";

(async () => {
  const app = await getApp();
  const httpServer = createServer(app);

  if (!isLongRunningHost) {
    log("Modo Vercel — workers via Cron Jobs; servidor HTTP local não iniciado.");
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    } catch {
      console.warn("Vite not available, falling back to static serving");
      const { serveStatic } = await import("./static");
      serveStatic(app);
    }
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const onListen = () => {
    log(`serving on port ${port}`);
    try { startNfRetryWorker(); } catch (e: any) { log(`NF retry worker falhou ao iniciar: ${e.message}`); }
    try { startFinancialReportWorker(); } catch (e: any) { log(`Financial report worker falhou ao iniciar: ${e.message}`); }
    try { startDhlIntakeExpiryWorker(); } catch (e: any) { log(`DHL intake expiry worker falhou ao iniciar: ${e.message}`); }
    try { startClientEmailQueueWorker(); } catch (e: any) { log(`Client email queue worker falhou ao iniciar: ${e.message}`); }
    try { startZapiWatchdog(); } catch (e: any) { log(`Z-API vigia falhou ao iniciar: ${e.message}`); }
  };

  if (process.platform === "win32") {
    httpServer.listen(port, "0.0.0.0", onListen);
  } else {
    httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, onListen);
  }

  const shutdown = (signal: string) => {
    log(`${signal} — encerrando listeners Realtime...`);
    cleanupRealtimeListeners();
    httpServer.close(() => {
      log("Servidor HTTP encerrado");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
})();
