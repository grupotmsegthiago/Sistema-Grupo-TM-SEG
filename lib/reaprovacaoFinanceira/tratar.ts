/**
 * Entrada HTTP sem Express. A senha chega separada e não volta na resposta.
 */
import { executarAcaoDiretoria, executarEdicaoTotal, executarReaprovacao } from './executar';
import type { ArmazenamentoCaptura, RepositorioReaprovacao } from './executar';
import { papelDiretoria, separarSenha } from './regras';
import type { NotificacaoDiretoria, OsReaprovacao, UsuarioReaprovacao } from './tipos';

type Repo = RepositorioReaprovacao & {
  buscarPorId: (id: string) => Promise<{ ok: true; evento: { capturaAntesPath: string | null; capturaDepoisPath: string | null } | null } | { ok: false; erro: string }>;
  listarNotificacoes: () => Promise<{ ok: true; itens: NotificacaoDiretoria[] } | { ok: false; erro: string }>;
  buscarNotificacao: (id: string) => Promise<{ ok: true; notificacao: NotificacaoDiretoria | null } | { ok: false; erro: string }>;
  salvarNotificacao: (notificacao: NotificacaoDiretoria) => Promise<{ ok: true } | { ok: false; erro: string }>;
};

type Storage = ArmazenamentoCaptura & {
  urlAssinada: (path: string) => Promise<{ ok: true; url: string } | { ok: false; erro: string }>;
};

export type PedidoHttp = {
  principal: UsuarioReaprovacao | null;
  method: string;
  op: string;
  corpo: unknown;
  buscaOs: (id: string) => Promise<{ ok: true; os: OsReaprovacao | null } | { ok: false; erro: string }>;
  senhaConfere: (usuarioId: string, senha: string) => Promise<boolean>;
  repo: Repo;
  storage: Storage;
};

function semSenha(body: Record<string, unknown>, senha: string): Record<string, unknown> {
  const copia = { ...body };
  delete copia.senha;
  delete copia.capturaAntes;
  delete copia.capturaDepois;
  if (senha) {
    for (const [chave, valor] of Object.entries(copia)) {
      if (typeof valor === 'string' && valor.includes(senha)) delete copia[chave];
    }
  }
  return copia;
}

export async function tratarReaprovacaoHttp(pedido: PedidoHttp): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!pedido.principal?.id) {
    return { status: 401, body: { ok: false, erro: 'Não autorizado', percentual: 0 } };
  }
  const op = String(pedido.op || '').trim().toLowerCase();
  const method = String(pedido.method || '').toUpperCase();

  if (op === 'lista' && method === 'GET') {
    if (!papelDiretoria(pedido.principal)) {
      return { status: 403, body: { ok: false, erro: 'Somente a Diretoria vê estas notificações.', aprovacaoFinanceiraAlterada: false } };
    }
    const lista = await pedido.repo.listarNotificacoes();
    if (!lista.ok) return { status: 500, body: { ok: false, erro: lista.erro, aprovacaoFinanceiraAlterada: false } };
    return { status: 200, body: { ok: true, itens: lista.itens, aprovacaoFinanceiraAlterada: false } };
  }

  if (op === 'captura' && method === 'GET') {
    if (!papelDiretoria(pedido.principal)) {
      return { status: 403, body: { ok: false, erro: 'Somente a Diretoria abre a evidência.', aprovacaoFinanceiraAlterada: false } };
    }
    const corpo = pedido.corpo && typeof pedido.corpo === 'object' ? pedido.corpo as Record<string, unknown> : {};
    const id = String(corpo.id || '').trim();
    const lado = String(corpo.lado || '').trim();
    const achou = await pedido.repo.buscarPorId(id);
    if (!achou.ok) return { status: 500, body: { ok: false, erro: achou.erro } };
    const path = lado === 'antes' ? achou.evento?.capturaAntesPath : lado === 'depois' ? achou.evento?.capturaDepoisPath : '';
    if (!path) return { status: 404, body: { ok: false, erro: 'A evidência não está disponível.' } };
    const url = await pedido.storage.urlAssinada(path);
    if (!url.ok) return { status: 500, body: { ok: false, erro: url.erro } };
    return { status: 200, body: { ok: true, url: url.url, aprovacaoFinanceiraAlterada: false } };
  }

  if (op === 'acao' && method === 'POST') {
    const { resto } = separarSenha(pedido.corpo);
    const achou = await pedido.repo.buscarNotificacao(String(resto.id || '').trim());
    if (!achou.ok) return { status: 500, body: { ok: false, erro: achou.erro, aprovacaoFinanceiraAlterada: false } };
    const acao = await executarAcaoDiretoria(
      pedido.principal,
      achou.notificacao,
      resto.acao,
      resto.observacao,
      (notificacao) => pedido.repo.salvarNotificacao(notificacao),
    );
    return { status: acao.http, body: semSenha(acao.body, '') };
  }

  if (op === 'edicao-total' && method === 'POST') {
    const { senha, resto } = separarSenha(pedido.corpo);
    const missionId = String(resto.missionId || resto.id || '').trim();
    const osRes = await pedido.buscaOs(missionId);
    if (!osRes.ok) {
      return { status: 500, body: { ok: false, erro: osRes.erro, percentual: 0 } };
    }
    if (!osRes.os) return { status: 404, body: { ok: false, erro: 'OS não encontrada.', percentual: 0 } };
    const resultado = await executarEdicaoTotal({
      usuario: pedido.principal,
      os: osRes.os,
      tentativaId: String(resto.tentativaId || ''),
      justificativa: resto.justificativa,
      senha,
      capturaAntes: resto.capturaAntes,
      capturaDepois: resto.capturaDepois,
      campos: resto.campos,
      cliente: osRes.os.client || null,
    }, {
      senhaConfere: (informada) => pedido.senhaConfere(String(pedido.principal?.id || ''), informada),
      repo: pedido.repo,
      storage: pedido.storage,
    });
    const body = semSenha({
      ok: resultado.ok,
      erro: resultado.erro,
      percentual: resultado.percentual,
      etapas: resultado.etapas,
      status: resultado.status,
      repetida: resultado.repetida === true,
      resumo: resultado.resumo || null,
      aprovacaoFinanceiraAlterada: false,
    }, senha);
    return { status: resultado.http, body };
  }

  if (op !== 'reaprovar' || method !== 'POST') {
    return { status: 400, body: { ok: false, erro: 'Operação inválida.', percentual: 0 } };
  }

  const { senha, resto } = separarSenha(pedido.corpo);
  const missionId = String(resto.missionId || resto.id || '').trim();
  const osRes = await pedido.buscaOs(missionId);
  if (!osRes.ok) {
    return { status: 500, body: { ok: false, erro: osRes.erro, percentual: 0 } };
  }
  if (!osRes.os) return { status: 404, body: { ok: false, erro: 'OS não encontrada.', percentual: 0 } };

  const resultado = await executarReaprovacao({
    usuario: pedido.principal,
    os: osRes.os,
    tentativaId: String(resto.tentativaId || ''),
    justificativa: resto.justificativa,
    senha,
    capturaAntes: resto.capturaAntes,
    capturaDepois: resto.capturaDepois,
    ...(Object.prototype.hasOwnProperty.call(resto, 'revenue_value') ? { revenue_value: resto.revenue_value } : {}),
    ...(Object.prototype.hasOwnProperty.call(resto, 'cost_value') ? { cost_value: resto.cost_value } : {}),
  }, {
    senhaConfere: (informada) => pedido.senhaConfere(String(pedido.principal?.id || ''), informada),
    repo: pedido.repo,
    storage: pedido.storage,
  });

  const body = semSenha({
    ok: resultado.ok,
    erro: resultado.erro,
    percentual: resultado.percentual,
    etapas: resultado.etapas,
    status: resultado.status,
    repetida: resultado.repetida === true,
    resumo: resultado.resumo || null,
    aprovacaoFinanceiraAlterada: false,
  }, senha);
  return { status: resultado.http, body };
}
