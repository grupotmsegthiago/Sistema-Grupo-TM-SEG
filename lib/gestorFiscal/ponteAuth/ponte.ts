/**
 * Protótipo isolado. Não há rota HTTP e a entrada de produção fica desligada.
 */
import { LIVRO_FICTICIO } from './fixtures';
import { ponteAuthHabilitada } from './flag';
import { SessoesMemoria } from './sessao';
import { empresasVisiveis, pode, portal } from './autorizacao';
import type { LogPonte, PedidoConsulta, ResultadoConsulta, UsuarioConfiavel } from './tipos';

const LIMITE_MAXIMO = 20;
const TTL_MS = 12 * 60 * 60 * 1000;

export interface FonteConfiavel {
  ler(usuarioId: string): Promise<UsuarioConfiavel | null>;
}

export interface PonteIsolada {
  abrirSessao(usuarioId: string): Promise<{ ok: true; token: string; expiraEm: number } | { ok: false; codigo: string; motivo: string }>;
  revogar(token: string): boolean;
  consultar(token: string, pedido: PedidoConsulta): Promise<ResultadoConsulta>;
  logs(): readonly LogPonte[];
}

export function criarPonteIsolada(
  fonte: FonteConfiavel,
  opcoes: { agora?: () => number; sessoes?: SessoesMemoria } = {},
): PonteIsolada {
  const agora = opcoes.agora ?? (() => Date.now());
  const sessoes = opcoes.sessoes ?? new SessoesMemoria();
  const registros: LogPonte[] = [];

  const falha = (codigo: string, motivo: string, acao: PedidoConsulta['acao'] | null, usuarioId: string | null): ResultadoConsulta => {
    registros.push({ codigo, acao, usuarioId });
    return { ok: false, codigo, motivo, linhas: [] };
  };

  return {
    async abrirSessao(usuarioId) {
      let usuario: UsuarioConfiavel | null;
      try {
        usuario = await fonte.ler(usuarioId);
      } catch {
        return { ok: false, codigo: 'fonte_indisponivel', motivo: 'A fonte confiável não respondeu. Nenhuma sessão foi aberta.' };
      }
      if (!usuario) return { ok: false, codigo: 'sessao_invalida', motivo: 'Usuário não encontrado na fonte confiável.' };
      if (usuario.status !== 'Ativo') return { ok: false, codigo: 'usuario_desativado', motivo: 'Usuário desativado. Nenhuma sessão foi aberta.' };
      const emitida = sessoes.emitir(usuario.id, agora(), TTL_MS);
      return { ok: true, token: emitida.token, expiraEm: emitida.expiraEm };
    },
    revogar(token) {
      return sessoes.revogar(token);
    },
    async consultar(token, pedido) {
      if (!token || token.startsWith('tmseg-token-') || token.startsWith('impersonation-token-')) {
        return falha('sessao_invalida', 'O token local não prova a sessão.', pedido.acao, null);
      }
      const sessao = sessoes.localizar(token);
      if (!sessao) return falha('sessao_invalida', 'Sessão não reconhecida.', pedido.acao, null);
      if (sessao.revogada) return falha('sessao_revogada', 'Sessão revogada.', pedido.acao, sessao.usuarioId);
      if (agora() >= sessao.expiraEm) return falha('sessao_expirada', 'Sessão expirada.', pedido.acao, sessao.usuarioId);
      if (!Number.isInteger(pedido.limite) || pedido.limite < 1 || pedido.limite > LIMITE_MAXIMO) {
        return falha('limite_consulta', 'O limite da consulta está fora do permitido.', pedido.acao, sessao.usuarioId);
      }
      let usuario: UsuarioConfiavel | null;
      try {
        usuario = await fonte.ler(sessao.usuarioId);
      } catch {
        return falha('fonte_indisponivel', 'A fonte confiável não respondeu. A consulta foi recusada.', pedido.acao, sessao.usuarioId);
      }
      if (!usuario || usuario.status !== 'Ativo') {
        return falha('usuario_desativado', 'Usuário desativado. A permissão foi relida no servidor.', pedido.acao, sessao.usuarioId);
      }
      if (!pode(usuario, pedido.acao)) {
        return falha('sem_permissao', 'A ficha do servidor não autoriza esta consulta.', pedido.acao, usuario.id);
      }
      if (portal(usuario)) {
        if (pedido.clienteInformado && pedido.clienteInformado !== usuario.clienteId) {
          return falha('cliente_alheio', 'O portal não escolhe outro cliente.', pedido.acao, usuario.id);
        }
        const linhas = LIVRO_FICTICIO
          .filter((linha) => linha.clienteId === usuario.clienteId)
          .slice(0, pedido.limite)
          .map((linha) => ({ ...linha, financeiroCentavos: 0 }));
        registros.push({ codigo: 'ok', acao: pedido.acao, usuarioId: usuario.id });
        return { ok: true, codigo: 'ok', motivo: '', linhas };
      }
      const empresas = empresasVisiveis(usuario, pedido.empresaInformada);
      if (!empresas) {
        return falha('empresa_nao_autorizada', 'A empresa informada não está na ficha do servidor.', pedido.acao, usuario.id);
      }
      const linhas = LIVRO_FICTICIO
        .filter((linha) => empresas.includes(linha.empresaId))
        .slice(0, pedido.limite);
      const ocultarValor = pedido.acao === 'ler_os'
        || pedido.acao === 'ler_painel'
        || pedido.acao === 'ler_clientes'
        || pedido.acao === 'ler_fornecedores';
      const visiveis = ocultarValor
        ? linhas.map((linha) => ({ ...linha, financeiroCentavos: 0 }))
        : linhas;
      registros.push({ codigo: 'ok', acao: pedido.acao, usuarioId: usuario.id });
      return { ok: true, codigo: 'ok', motivo: '', linhas: visiveis };
    },
    logs() {
      return registros.map((item) => ({ ...item }));
    },
  };
}

export function atenderProducao(env?: Record<string, string | undefined>): ResultadoConsulta {
  if (!ponteAuthHabilitada(env)) {
    return {
      ok: false,
      codigo: 'ponte_desligada',
      motivo: 'A ponte de autenticação está desligada. Nenhuma consulta foi feita.',
      linhas: [],
    };
  }
  return {
    ok: false,
    codigo: 'sem_adaptador',
    motivo: 'Mesmo com a flag, esta fase não consulta produção.',
    linhas: [],
  };
}
