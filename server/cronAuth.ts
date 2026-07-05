import type { Request } from 'express';

/** Valida chamadas de Vercel Cron (Authorization: Bearer CRON_SECRET). */
export function verifyCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('[Cron] CRON_SECRET não configurado — rejeitando chamada.');
    return false;
  }
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}

/** Valida webhook do Supabase (header x-webhook-secret). */
export function verifyWebhookSecret(req: Request): boolean {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[Webhook] SUPABASE_WEBHOOK_SECRET não configurado — rejeitando.');
    return false;
  }
  const header = req.headers['x-webhook-secret'];
  return header === secret;
}
