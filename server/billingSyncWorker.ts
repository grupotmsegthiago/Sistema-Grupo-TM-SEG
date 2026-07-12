import { syncBillingUsage } from '../services/billingService.js';

/** Cron diário — sincroniza faturas Stripe (Cursor) para billing_usage. */
export async function runBillingSyncTick(): Promise<unknown> {
  return syncBillingUsage();
}
