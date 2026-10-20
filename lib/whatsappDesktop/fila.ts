/**
 * Fila do WhatsApp Desktop para a solicitação de escolta.
 * A liberação continua nas regras do PR 350. Este módulo só decide
 * o que o computador pode executar depois da autorização do operador.
 */
import { podeAbrirWhatsapp, type AlvoFila } from '../solicitacaoEscolta/regras';

export const PORTA_LOCAL = 47321;
export const ORIGEM_LOCAL = `http://127.0.0.1:${PORTA_LOCAL}`;

export const ESTADOS_ENVIO = [
  'aguardando_horario',
  'pronto_para_envio',
  'enviando',
  'comando_executado',
  'falha_envio',
  'destinatario_nao_validado',
  'cancelado',
  'fornecedor_confirmado',
] as const;

export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number];

export const ROTULO_ESTADO: Record<EstadoEnvio, string> = {
  aguardando_horario: 'Aguardando horário',
  pronto_para_envio: 'Pronto para envio',
  enviando: 'Enviando',
  comando_executado: 'Comando executado no WhatsApp',
  falha_envio: 'Falha de envio',
  destinatario_nao_validado: 'Destinatário não validado',
  cancelado: 'Cancelado',
  fornecedor_confirmado: 'Fornecedor confirmado',
};

const JA_ENCERRADOS = new Set<EstadoEnvio>([
  'comando_executado',
  'cancelado',
  'fornecedor_confirmado',
  'destinatario_nao_validado',
]);

export function dobrar(valor: string | null | undefined): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export interface AlvoDesktop {
  id: string;
  status: AlvoFila['status'];
  ordem: number;
  providerNome: string;
  liberarEmMs: number;
  grupoNome: string | null;
  envioStatus: string | null;
  envioComandoId: string | null;
}

export function estadoDoAlvo(
  alvo: AlvoDesktop,
  solicitacaoStatus: string,
  agoraMs: number,
): EstadoEnvio {
  if (alvo.status === 'confirmado' || alvo.envioStatus === 'fornecedor_confirmado') return 'fornecedor_confirmado';
  if (alvo.envioStatus === 'comando_executado') return 'comando_executado';
  if (alvo.envioStatus === 'destinatario_nao_validado') return 'destinatario_nao_validado';
  if (alvo.envioStatus === 'falha_envio') return 'falha_envio';
  if (alvo.envioStatus === 'enviando') return 'enviando';
  if (alvo.status === 'bloqueado' || alvo.envioStatus === 'cancelado' || solicitacaoStatus === 'cancelada') return 'cancelado';
  if (solicitacaoStatus === 'confirmada') return 'cancelado';
  if (!podeAbrirWhatsapp(alvo.status, alvo.liberarEmMs, agoraMs, solicitacaoStatus)) return 'aguardando_horario';
  return 'pronto_para_envio';
}

/** O primeiro resultado da pesquisa não prova quem é o grupo. */
export function validarDestinatario(entrada: {
  esperado: string;
  tituloAberto: string;
  candidatos: string[];
}): { ok: true; nome: string } | { ok: false; motivo: string } {
  const esperado = dobrar(entrada.esperado);
  if (!esperado) return { ok: false, motivo: 'Grupo sem nome exato cadastrado.' };
  const exatos = entrada.candidatos.map(dobrar).filter((nome) => nome === esperado);
  if (exatos.length !== 1) {
    return {
      ok: false,
      motivo: exatos.length === 0
        ? 'Nenhum resultado da pesquisa corresponde ao nome exato do grupo.'
        : 'Mais de um resultado tem o mesmo nome. O envio foi bloqueado.',
    };
  }
  const titulo = dobrar(entrada.tituloAberto);
  if (titulo !== esperado) {
    return { ok: false, motivo: 'O chat aberto não é o grupo associado. O envio foi bloqueado.' };
  }
  return { ok: true, nome: esperado };
}

export function idComando(alvoId: string, liberarEmMs: number): string {
  return `${alvoId}:${liberarEmMs}`;
}

export interface PlanoEnvio {
  alvoId: string;
  comandoId: string;
  grupoNome: string;
  texto: string;
}

export function planejarDespacho(entrada: {
  solicitacaoStatus: string;
  autorizado: boolean;
  aplicativoConectado: boolean;
  agoraMs: number;
  texto: string;
  alvos: AlvoDesktop[];
}): {
  enviar: PlanoEnvio[];
  pendentesSemAplicativo: string[];
  pulados: string[];
} {
  const enviar: PlanoEnvio[] = [];
  const pendentesSemAplicativo: string[] = [];
  const pulados: string[] = [];
  if (!entrada.autorizado || entrada.solicitacaoStatus !== 'em_andamento') {
    return { enviar, pendentesSemAplicativo, pulados };
  }
  for (const alvo of entrada.alvos) {
    const estado = estadoDoAlvo(alvo, entrada.solicitacaoStatus, entrada.agoraMs);
    if (JA_ENCERRADOS.has(estado) || estado === 'enviando' || estado === 'falha_envio') {
      pulados.push(alvo.id);
      continue;
    }
    if (estado !== 'pronto_para_envio') continue;
    if (!dobrar(alvo.grupoNome)) {
      pulados.push(alvo.id);
      continue;
    }
    if (!entrada.aplicativoConectado) {
      pendentesSemAplicativo.push(alvo.id);
      continue;
    }
    enviar.push({
      alvoId: alvo.id,
      comandoId: alvo.envioComandoId || idComando(alvo.id, alvo.liberarEmMs),
      grupoNome: String(alvo.grupoNome).trim(),
      texto: entrada.texto,
    });
  }
  return { enviar, pendentesSemAplicativo, pulados };
}

/** Confirmação trava pendências. Mensagem já comandada não vira "cancelada". */
export function envioAposConfirmacao(envioStatus: string | null, ehOConfirmado: boolean): EstadoEnvio | null {
  if (ehOConfirmado) return 'fornecedor_confirmado';
  if (envioStatus === 'comando_executado') return 'comando_executado';
  if (envioStatus === 'enviando') return 'enviando';
  return 'cancelado';
}

export function resumirEnvios(estados: EstadoEnvio[]): {
  selecionados: number;
  executados: number;
  pendencias: number;
  erros: number;
} {
  return {
    selecionados: estados.length,
    executados: estados.filter((estado) => estado === 'comando_executado').length,
    pendencias: estados.filter((estado) => estado === 'aguardando_horario' || estado === 'pronto_para_envio' || estado === 'enviando').length,
    erros: estados.filter((estado) => estado === 'falha_envio' || estado === 'destinatario_nao_validado').length,
  };
}

export function origemPermitida(origem: string | null | undefined): boolean {
  if (!origem) return false;
  try {
    const url = new URL(origem);
    if (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')) return true;
    if (url.protocol !== 'https:') return false;
    return url.hostname === 'sistema.grupotmseg.com.br'
      || url.hostname === 'sistema-grupo-tm-seg.vercel.app'
      || url.hostname.endsWith('.vercel.app') && url.hostname.startsWith('sistema-grupo-tm-seg');
  } catch {
    return false;
  }
}

export function limparPesquisaEntreEnvios(passos: string[]): string[] {
  const saida: string[] = [];
  for (let i = 0; i < passos.length; i++) {
    saida.push(passos[i]);
    const enviou = passos[i] === 'enviar';
    const proximo = passos[i + 1];
    if (enviou && proximo === 'pesquisar') saida.push('limpar-pesquisa');
  }
  return saida;
}
