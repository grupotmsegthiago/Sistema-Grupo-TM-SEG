/** Lê corpo JSON da resposta sem falhar em body vazio (ex.: 405 da Vercel no SPA). */
export async function parseJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(res.ok ? 'Resposta vazia do servidor' : `Erro do servidor (${res.status})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(res.ok ? 'Resposta inválida do servidor' : `Erro do servidor (${res.status})`);
  }
}
