import type { Express, Request, Response } from "express";
import { verifyCronRequest } from "./cronAuth";
import { getScheduledTicks } from "./scheduledRegistry";
import { runRetryCycle } from "./nfRetryWorker";
import { runFinancialReportTick } from "./financialReportWorker";
import { runClientEmailQueueCycle } from "./clientEmailQueueWorker";
import { runDhlWorkerTick } from "./dhlSupplierIntake";
import { runZapiWatchdogTick } from "./zapiWatchdog";

type CronJob = () => Promise<unknown>;

function cronRoute(app: Express, path: string, job: CronJob) {
  app.get(path, async (req: Request, res: Response) => {
    if (!verifyCronRequest(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const result = await job();
      res.json({ ok: true, result: result ?? null });
    } catch (e: any) {
      console.error(`[Cron] ${path} falhou:`, e?.message || e);
      res.status(500).json({ error: e?.message || "Cron failed" });
    }
  });
}

export function registerCronRoutes(app: Express): void {
  cronRoute(app, "/api/cron/minute", async () => {
    runFinancialReportTick();
    for (const tick of getScheduledTicks()) {
      await tick();
    }
  });

  cronRoute(app, "/api/cron/nf-retry", () => runRetryCycle());
  cronRoute(app, "/api/cron/email-queue", () => runClientEmailQueueCycle());
  cronRoute(app, "/api/cron/dhl", () => runDhlWorkerTick());
  cronRoute(app, "/api/cron/zapi", () => runZapiWatchdogTick());

  cronRoute(app, "/api/cron/maintenance", async () => {
    const { runMaintenanceTick } = await import("./maintenanceJobs");
    return runMaintenanceTick();
  });

  console.log("[Cron] Rotas /api/cron/* registradas (Vercel Cron Jobs).");
}
