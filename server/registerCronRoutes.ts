import type { Express, Request, Response } from "express";
import { verifyCronRequest } from "./cronAuth";
import { getScheduledTicks } from "./scheduledRegistry";
import { runRetryCycle } from "./nfRetryWorker";
import { runFinancialReportTick } from "./financialReportWorker";
import { runClientEmailQueueCycle } from "./clientEmailQueueWorker";
import { runDhlWorkerTick } from "./dhlSupplierIntake";
import { runZapiWatchdogTick } from "./zapiWatchdog";
import { runBillingSyncTick } from "./billingSyncWorker";

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
    // NÃO await — migration longa/trava no cron derruba o Express (api/index)
    // e deixa telas em "Carregando…" infinito. Schema via botão ensure-schema / SQL.
    void import("../lib/investimentos/schemaMigrations")
      .then(({ runGestaoInvestimentoMigrations }) =>
        Promise.race([
          runGestaoInvestimentoMigrations(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout 12s")), 12_000)),
        ]),
      )
      .catch((e: any) => console.warn("[Cron] gestao-investimento schema:", e?.message || e));
  });

  cronRoute(app, "/api/cron/nf-retry", () => runRetryCycle());
  cronRoute(app, "/api/cron/email-queue", () => runClientEmailQueueCycle());
  cronRoute(app, "/api/cron/dhl", () => runDhlWorkerTick());
  cronRoute(app, "/api/cron/zapi", () => runZapiWatchdogTick());
  cronRoute(app, "/api/cron/billing-sync", () => runBillingSyncTick());

  cronRoute(app, "/api/cron/maintenance", async () => {
    const { runMaintenanceTick } = await import("./maintenanceJobs");
    return runMaintenanceTick();
  });

  console.log("[Cron] Rotas /api/cron/* registradas (Vercel Cron Jobs).");
}
