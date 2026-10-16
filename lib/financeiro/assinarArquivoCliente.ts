/** Pede ao servidor um link curto. Não guarda a URL pública como atalho. */
import { extrairArquivoProtegido } from './arquivoSeguro';

const cache = new Map<string, { url: string; expira: number }>();

export async function assinarArquivo(url: string | null | undefined): Promise<string | null> {
  const bruto = String(url || '').trim();
  if (!bruto) return null;
  if (!extrairArquivoProtegido(bruto)) return bruto;
  const guardado = cache.get(bruto);
  if (guardado && guardado.expira > Date.now() + 15_000) return guardado.url;
  const token = window.localStorage.getItem('authToken') || '';
  const sessao = window.localStorage.getItem('authSessao') || '';
  const resposta = await fetch('/api/financeiro/arquivo/assinar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
      'x-tmseg-sessao': sessao,
    },
    body: JSON.stringify({ urls: [bruto] }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  const assinada = corpo?.urls?.[0]?.assinada;
  if (!resposta.ok || typeof assinada !== 'string' || !assinada) return null;
  const expira = Number(corpo.urls[0].expira) || Date.now() + 60_000;
  cache.set(bruto, { url: assinada, expira });
  return assinada;
}
