import { ORIGEM_LOCAL, origemPermitida } from './fila';

export const CHAVE_TOKEN_DESKTOP = 'tmseg.whatsappDesktop.token';
export const CHAVE_DISPOSITIVO_DESKTOP = 'tmseg.whatsappDesktop.dispositivo';

export interface MemoriaDispositivo {
  identificado: boolean;
  preparado: boolean;
  vinculado: boolean;
  repetirInstalacao: boolean;
  repetirQr: boolean;
  repetirTeste: boolean;
  precisaReautenticar: boolean;
  instalacaoId?: string | null;
  versao?: string | null;
  codigo?: string;
  motivo?: string;
}

export interface StatusAplicativo {
  conectado: boolean;
  pareado: boolean;
  pausado: boolean;
  whatsappAberto: boolean;
  whatsappAutenticado: boolean | null;
  versao?: string;
  instalacaoId?: string;
  ultimoTeste?: { em?: string; estado?: string; motivo?: string; entrega?: null; registrado?: boolean } | null;
  resultadoComunicacao?: string;
  motivo?: string;
  identificado?: boolean;
  preparado?: boolean;
  vinculado?: boolean;
  repetirInstalacao?: boolean;
  repetirQr?: boolean;
  repetirTeste?: boolean;
  precisaReautenticar?: boolean;
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

export function esquecerTokenDesktop(): void {
  localStorage.removeItem(CHAVE_TOKEN_DESKTOP);
}

export function lerMemoriaDispositivo(): MemoriaDispositivo | null {
  try {
    const bruto = localStorage.getItem(CHAVE_DISPOSITIVO_DESKTOP);
    return bruto ? JSON.parse(bruto) as MemoriaDispositivo : null;
  } catch {
    return null;
  }
}

export function guardarMemoriaDispositivo(memoria: MemoriaDispositivo): void {
  const copia = { ...memoria };
  delete copia.codigo;
  localStorage.setItem(CHAVE_DISPOSITIVO_DESKTOP, JSON.stringify(copia));
}

export async function identificarComputador(): Promise<MemoriaDispositivo> {
  const vazio: MemoriaDispositivo = {
    identificado: false,
    preparado: false,
    vinculado: false,
    repetirInstalacao: true,
    repetirQr: true,
    repetirTeste: true,
    precisaReautenticar: false,
  };
  try {
    const resposta = await fetch(`${ORIGEM_LOCAL}/identificar`);
    const corpo = await resposta.json() as MemoriaDispositivo;
    if (!resposta.ok) return { ...vazio, motivo: corpo.motivo || 'O conector recusou a identificação.' };
    if (corpo.codigo) guardarTokenDesktop(corpo.codigo);
    guardarMemoriaDispositivo(corpo);
    return corpo;
  } catch {
    return lerMemoriaDispositivo() || { ...vazio, motivo: 'Computador sem o aplicativo TM SEG.' };
  }
}

export function revincularComputador(): Promise<{ ok: boolean; motivo?: string; codigo?: string }> {
  return fetch(`${ORIGEM_LOCAL}/dispositivo/vincular`, { method: 'POST' })
    .then(async (resposta) => {
      const corpo = await resposta.json() as { ok?: boolean; motivo?: string; codigo?: string };
      if (corpo.codigo) guardarTokenDesktop(corpo.codigo);
      if (corpo.ok) guardarMemoriaDispositivo({ ...(lerMemoriaDispositivo() || { identificado: true, preparado: true, repetirInstalacao: false, repetirQr: false, repetirTeste: false, precisaReautenticar: false }), vinculado: true, identificado: true });
      return { ok: !!corpo.ok, motivo: corpo.motivo, codigo: corpo.codigo };
    })
    .catch(() => ({ ok: false, motivo: 'O aplicativo local não respondeu.' }));
}

async function postAutenticado(caminho: string, corpo?: unknown): Promise<{ ok: boolean; motivo?: string; [chave: string]: unknown }> {
  const token = lerTokenDesktop();
  if (!token) return { ok: false, motivo: 'Este navegador ainda não está pareado.' };
  try {
    const resposta = await fetch(`${ORIGEM_LOCAL}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const json = await resposta.json() as { ok?: boolean; motivo?: string };
    return { ...json, ok: resposta.ok && json.ok !== false };
  } catch {
    return { ok: false, motivo: 'O aplicativo local não respondeu.' };
  }
}

export function desvincularComputador(): Promise<{ ok: boolean; motivo?: string }> {
  return postAutenticado('/unlink', {}).then((resultado) => {
    esquecerTokenDesktop();
    const memoria = lerMemoriaDispositivo();
    if (memoria) guardarMemoriaDispositivo({ ...memoria, vinculado: false, identificado: false });
    return resultado;
  });
}

export function atualizarAplicativo(): Promise<{ ok: boolean; motivo?: string }> {
  return postAutenticado('/update', {});
}

export function testarHomologacao(): Promise<{ ok: boolean; motivo?: string }> {
  return postAutenticado('/homologacao', { autorizar: true });
}

export async function consultarAplicativo(token = lerTokenDesktop()): Promise<StatusAplicativo> {
  if (!origemPermitida(ORIGEM_LOCAL)) {
    return { conectado: false, pareado: false, pausado: false, whatsappAberto: false, whatsappAutenticado: null, motivo: 'Endereço local inválido.' };
  }
  try {
    const resposta = await fetch(`${ORIGEM_LOCAL}/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resposta.ok) {
      return { conectado: true, pareado: false, pausado: false, whatsappAberto: false, whatsappAutenticado: null, motivo: 'O aplicativo pediu pareamento.' };
    }
    const corpo = await resposta.json() as Partial<StatusAplicativo>;
    return {
      conectado: true,
      pareado: !!corpo.pareado,
      pausado: !!corpo.pausado,
      whatsappAberto: !!corpo.whatsappAberto,
      whatsappAutenticado: corpo.whatsappAutenticado ?? null,
      versao: corpo.versao,
      instalacaoId: corpo.instalacaoId,
      ultimoTeste: corpo.ultimoTeste || null,
      resultadoComunicacao: corpo.resultadoComunicacao,
      identificado: corpo.identificado,
      preparado: corpo.preparado,
      vinculado: corpo.vinculado,
      repetirInstalacao: corpo.repetirInstalacao,
      repetirQr: corpo.repetirQr,
      repetirTeste: corpo.repetirTeste,
      precisaReautenticar: corpo.precisaReautenticar,
    };
  } catch {
    return { conectado: false, pareado: false, pausado: false, whatsappAberto: false, whatsappAutenticado: null, motivo: 'Computador sem o aplicativo TM SEG.' };
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
