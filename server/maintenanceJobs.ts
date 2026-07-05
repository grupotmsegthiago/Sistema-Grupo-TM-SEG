/** Ticks de limpeza e alertas — registrados por routes.ts em host longo; invocados via cron na Vercel. */
const maintenanceTicks: Array<() => Promise<void>> = [];

export function registerMaintenanceTick(fn: () => Promise<void>): void {
  maintenanceTicks.push(fn);
}

export async function runMaintenanceTick(): Promise<{ jobs: number }> {
  for (const fn of maintenanceTicks) {
    await fn();
  }
  return { jobs: maintenanceTicks.length };
}
