/**
 * Migração gradual de senha. Nasce desligada.
 * Não lê cadastro de produção e não devolve senha nem hash.
 * O texto puro só sai depois que o hash novo confere.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { gerarHashVersionado, identificarFormatoHash, verificarSenhaArmazenada } from './hashSenha';

/** Liberação de código. Ambiente e teste não viram esta constante. */
export const MIGRACAO_SENHA_LIBERADA = false;

export type OrigemSenha = 'funcionario' | 'portal_interno' | 'portal_cliente';

export interface RegistroSenha {
  id: string;
  status: 'Ativo' | 'Inativo';
  origem: OrigemSenha;
  texto: string | null;
  hash: string | null;
  geracao: number;
  sessaoLegada: string | null;
}

export interface RepositorioSenha {
  ler(id: string): Promise<RegistroSenha | null>;
  gravarHash(id: string, hash: string, geracao: number): Promise<'ok' | 'conflito' | 'falha'>;
  apagarTexto(id: string, geracao: number): Promise<'ok' | 'falha' | 'conflito'>;
}

export interface ResultadoMigracao {
  ok: boolean;
  codigo: string;
  migracao: 'nao_aplicada' | 'nao_necessaria' | 'concluida' | 'adiada' | 'texto_pendente' | 'preservada';
  sessao: string | null;
}

export interface LogMigracao {
  codigo: string;
  usuarioId: string | null;
}

export interface EmissorSessao {
  emitir(usuarioId: string): Promise<string>;
}

function recusar(codigo: string, migracao: ResultadoMigracao['migracao'] = 'nao_aplicada'): ResultadoMigracao {
  return { ok: false, codigo, migracao, sessao: null };
}

function textoConfere(informada: string, gravada: string): boolean {
  const digitada = Buffer.from(informada);
  const armazenada = Buffer.from(gravada);
  if (digitada.length !== armazenada.length) return false;
  return timingSafeEqual(digitada, armazenada);
}

export function respostaPublica(resultado: ResultadoMigracao): { ok: boolean; codigo: string; migracao: string } {
  return { ok: resultado.ok, codigo: resultado.codigo, migracao: resultado.migracao };
}

export async function autenticarEMigrar(
  repositorio: RepositorioSenha,
  entrada: { usuarioId: string; senha: string },
  opcoes: { testeLocal?: boolean; emissor?: EmissorSessao; logs?: LogMigracao[] } = {},
): Promise<ResultadoMigracao> {
  if (!MIGRACAO_SENHA_LIBERADA && !opcoes.testeLocal) {
    return recusar('migracao_desligada');
  }
  const senha = String(entrada.senha ?? '').trim();
  const anotar = (codigo: string, usuarioId: string | null) => {
    opcoes.logs?.push({ codigo, usuarioId });
  };
  if (!senha) {
    anotar('credenciais_invalidas', null);
    return recusar('credenciais_invalidas');
  }
  let registro: RegistroSenha | null;
  try {
    registro = await repositorio.ler(entrada.usuarioId);
  } catch {
    anotar('fonte_indisponivel', null);
    return recusar('fonte_indisponivel');
  }
  if (!registro) {
    anotar('credenciais_invalidas', null);
    return recusar('credenciais_invalidas');
  }
  if (registro.status !== 'Ativo') {
    anotar('usuario_desativado', null);
    return recusar('usuario_desativado');
  }
  const formatoTexto = identificarFormatoHash(registro.texto);
  if (!registro.hash && formatoTexto === 'outro') {
    anotar('formato_nao_reconhecido', registro.id);
    return recusar('formato_nao_reconhecido');
  }
  const confere = registro.hash
    ? verificarSenhaArmazenada(senha, registro.hash)
    : registro.texto != null && formatoTexto !== 'outro' && textoConfere(senha, registro.texto);
  if (!confere) {
    anotar('credenciais_invalidas', null);
    return recusar('credenciais_invalidas');
  }
  let sessao: string | null = null;
  try {
    sessao = opcoes.emissor ? await opcoes.emissor.emitir(registro.id) : `mig-${randomBytes(8).toString('hex')}`;
  } catch {
    anotar('fonte_indisponivel', registro.id);
    return recusar('fonte_indisponivel');
  }
  if (registro.origem === 'portal_cliente') {
    anotar('ok', registro.id);
    return { ok: true, codigo: 'ok', migracao: 'preservada', sessao };
  }
  if (registro.hash && !registro.texto) {
    anotar('ok', registro.id);
    return { ok: true, codigo: 'ok', migracao: 'nao_necessaria', sessao };
  }
  try {
    if (!registro.hash) {
      const gravou = await repositorio.gravarHash(registro.id, gerarHashVersionado(senha), registro.geracao);
      if (gravou === 'falha') {
        anotar('ok', registro.id);
        return { ok: true, codigo: 'ok', migracao: 'adiada', sessao };
      }
      if (gravou === 'conflito') {
        const atual = await repositorio.ler(registro.id);
        if (!atual?.hash || !verificarSenhaArmazenada(senha, atual.hash)) {
          anotar('ok', registro.id);
          return { ok: true, codigo: 'ok', migracao: 'adiada', sessao };
        }
      }
    }
    const confirmado = await repositorio.ler(registro.id);
    if (!confirmado?.hash || !verificarSenhaArmazenada(senha, confirmado.hash)) {
      anotar('ok', registro.id);
      return { ok: true, codigo: 'ok', migracao: 'adiada', sessao };
    }
    if (!confirmado.texto) {
      anotar('ok', registro.id);
      return { ok: true, codigo: 'ok', migracao: 'nao_necessaria', sessao };
    }
    const apagou = await repositorio.apagarTexto(confirmado.id, confirmado.geracao);
    anotar('ok', registro.id);
    if (apagou !== 'ok') return { ok: true, codigo: 'ok', migracao: 'texto_pendente', sessao };
    return { ok: true, codigo: 'ok', migracao: 'concluida', sessao };
  } catch {
    anotar('ok', registro.id);
    return { ok: true, codigo: 'ok', migracao: 'adiada', sessao };
  }
}
