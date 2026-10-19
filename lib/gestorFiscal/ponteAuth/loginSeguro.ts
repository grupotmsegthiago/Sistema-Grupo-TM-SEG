/**
 * Entrada preparada para a tela atual chamar no futuro.
 * Nesta fase a tela de login não usa este módulo.
 */
import type { PonteIsolada } from './ponte';
import type { RepositorioIsolado } from './repositorioIsolado';

export interface LogEntrada {
  codigo: string;
  usuarioId: string | null;
}

export type ResultadoEntrada =
  | { ok: true; token: string; usuarioId: string; expiraEm: number }
  | { ok: false; codigo: string; motivo: string };

export async function entrarIsolado(
  repositorio: RepositorioIsolado,
  ponte: PonteIsolada,
  email: string,
  senha: string,
  registros: LogEntrada[],
): Promise<ResultadoEntrada> {
  const conferencia = await repositorio.conferir(email, senha);
  if (conferencia.tipo === 'falha') {
    registros.push({ codigo: 'fonte_indisponivel', usuarioId: null });
    return { ok: false, codigo: 'fonte_indisponivel', motivo: 'A fonte confiável não respondeu. O acesso foi negado.' };
  }
  if (conferencia.tipo === 'invalido') {
    registros.push({ codigo: 'credenciais_invalidas', usuarioId: null });
    return { ok: false, codigo: 'credenciais_invalidas', motivo: 'Credenciais não conferem.' };
  }
  if (conferencia.tipo === 'desativado') {
    registros.push({ codigo: 'usuario_desativado', usuarioId: null });
    return { ok: false, codigo: 'usuario_desativado', motivo: 'Usuário desativado. Nenhuma sessão foi aberta.' };
  }
  const sessao = await ponte.abrirSessao(conferencia.usuario.id);
  if (!sessao.ok) {
    registros.push({ codigo: sessao.codigo, usuarioId: conferencia.usuario.id });
    return sessao;
  }
  registros.push({ codigo: 'ok', usuarioId: conferencia.usuario.id });
  return { ok: true, token: sessao.token, usuarioId: conferencia.usuario.id, expiraEm: sessao.expiraEm };
}
