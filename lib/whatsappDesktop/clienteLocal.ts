import { ORIGEM_LOCAL, origemPermitida } from './fila';

export const CHAVE_TOKEN_DESKTOP = 'tmseg.whatsappDesktop.token';

export interface StatusAplicativo {
  conectado: boolean;
  pareado: boolean;
  pausado: boolean;
  whatsappAberto: boolean;
  motivo?: string;
}

export function lerTokenDesktop(): string {
  try {
    return localStorage.getItem(CHAVE_TOKEN_DESKTOP) || '';
  } catch {
    return '';
  }
}

export function guardarTokenDesktop(token: string): void {
  localStorage.setItem(CHAVE_TOKEN_DESKTOP, token);
}

export async function consultarAplicativo(token = lerTokenDesktop()): Promise<StatusAplicativo> {
  if (!origemPermitida(ORIGEM_LOCAL)) {
    return { conectado: false, pareado: false, pausado: false, whatsappAberto: false, motivo: 'Endereço local inválido.' };
  }
  try {
    const resposta = await fetch(`${ORIGEM_LOCAL}/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resposta.ok) {
      return { conectado: true, pareado: false, pausado: false, whatsappAberto: false, motivo: 'O aplicativo pediu pareamento.' };
    }
    const corpo = await resposta.json() as Partial<StatusAplicativo>;
    return {
      conectado: true,
      pareado: !!corpo.pareado,
      pausado: !!corpo.pausado,
      whatsappAberto: !!corpo.whatsappAberto,
    };
  } catch {
    return { conectado: false, pareado: false, pausado: false, whatsappAberto: false, motivo: 'Computador sem o aplicativo TM SEG.' };
  }
}

export async function enviarComandosLocais(comandos: Array<{ id: string; groupName: string; text: string }>, token = lerTokenDesktop()): Promise<{
  ok: boolean;
  resultados: Array<{ id: string; estado: 'comando_executado' | 'falha_envio' | 'destinatario_nao_validado'; motivo?: string }>;
  motivo?: string;
}> {
  if (!token) return { ok: false, resultados: [], motivo: 'Este navegador ainda não está pareado com o aplicativo.' };
  try {
    const resposta = await fetch(`${ORIGEM_LOCAL}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ commands: comandos }),
    });
    const corpo = await resposta.json() as { resultados?: Array<{ id: string; estado: 'comando_executado' | 'falha_envio' | 'destinatario_nao_validado'; motivo?: string }>; motivo?: string };
    if (!resposta.ok) return { ok: false, resultados: [], motivo: corpo.motivo || 'O aplicativo recusou o lote.' };
    return { ok: true, resultados: corpo.resultados || [] };
  } catch {
    return { ok: false, resultados: [], motivo: 'O aplicativo local não respondeu. Nada foi marcado como enviado.' };
  }
}
