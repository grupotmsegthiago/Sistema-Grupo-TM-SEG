import { ehTabelaProtegida } from './tabelas';

function urlDe(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function tabelaDe(url: string): string | null {
  try {
    const partes = new URL(url).pathname.split('/').filter(Boolean);
    if (partes.length < 3 || partes[0] !== 'rest' || partes[1] !== 'v1') return null;
    return ehTabelaProtegida(partes[2]) ? partes[2] : null;
  } catch {
    return null;
  }
}

function cabecalhosDe(init?: RequestInit): Record<string, string> {
  const saida: Record<string, string> = {};
  const origem = new Headers(init?.headers);
  origem.forEach((valor, nome) => {
    const chave = nome.toLowerCase();
    if (chave === 'apikey' || chave === 'authorization') return;
    saida[chave] = valor;
  });
  return saida;
}

/** Troca a chamada anônima das dez tabelas por uma rota autenticada. No servidor, não intercepta. */
export function fetchDasTabelasProtegidas(original: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof window === 'undefined') return original(input, init);
    const url = urlDe(input);
    if (!tabelaDe(url)) return original(input, init);
    const token = window.localStorage.getItem('authToken') || '';
    const metodo = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let body: string | null = null;
    if (typeof init?.body === 'string') body = init.body;
    const resposta = await original('/api/dados-protegidos', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        method: metodo,
        url,
        headers: cabecalhosDe(init),
        body,
      }),
    });
    const pacote = await resposta.json() as { status?: number; body?: string; contentType?: string; contentRange?: string | null };
    const headers = new Headers();
    headers.set('content-type', pacote.contentType || 'application/json');
    if (pacote.contentRange) headers.set('content-range', pacote.contentRange);
    return new Response(pacote.body ?? '', { status: pacote.status || resposta.status, headers });
  };
}
