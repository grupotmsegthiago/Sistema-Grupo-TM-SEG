/** true quando rodando em função serverless da Vercel (sem processo longo). */
export const isVercel = !!process.env.VERCEL;

/** true em dev local / Replit — workers com setInterval e Realtime persistente. */
export const isLongRunningHost = !isVercel;
