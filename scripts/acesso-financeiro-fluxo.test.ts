/**
 * Fluxo real das rotas financeiras, com banco em memória.
 * Não usa credencial nem dado de produção.
 */
import assert from 'node:assert/strict';
import express from 'express';
import { describe, it } from 'node:test';
import { registerFinanceiroAcessoRoutes } from '../server/financeiroAcessoRoutes';

type Linha = Record<string, any>;

function bancoFalso() {
  const usuarios: Linha[] = [
    {
      id: '901',
      email: 'diretoria.homolog@example.test',
      password: 'senha-homolog-diretoria',
      status: 'Ativo',
      name: 'Diretoria Homolog',
      permissions: [],
      profiles: { name: 'Diretoria', permissions: [] },
    },
    {
      id: '902',
      email: 'operador.homolog@example.test',
      password: 'senha-homolog-operador',
      status: 'Ativo',
      name: 'Operador Homolog',
      permissions: ['*'],
      profiles: { name: 'Operador', permissions: ['*'] },
    },
  ];
  const sessoes: Linha[] = [];
  const faturas: Linha[] = [{ id: 'FAT-H', valor: 250 }];

  function filtrar(linhas: Linha[], filtros: Array<{ coluna: string; op: string; valor: unknown }>) {
    return linhas.filter((linha) => filtros.every((filtro) => {
      const atual = String(linha[filtro.coluna] ?? '');
      if (filtro.op === 'ilike') return atual.toLowerCase() === String(filtro.valor).toLowerCase();
      return atual === String(filtro.valor);
    }));
  }

  function from(tabela: string) {
    const estado = {
      filtros: [] as Array<{ coluna: string; op: string; valor: unknown }>,
      op: 'select' as 'select' | 'insert',
      payload: null as Linha | null,
      uma: false,
    };
    const api: any = {
      select() { return api; },
      eq(coluna: string, valor: unknown) { estado.filtros.push({ coluna, op: 'eq', valor }); return api; },
      ilike(coluna: string, valor: unknown) { estado.filtros.push({ coluna, op: 'ilike', valor }); return api; },
      insert(payload: Linha) { estado.op = 'insert'; estado.payload = payload; return api; },
      maybeSingle() { estado.uma = true; return api; },
      then(ok?: any, erro?: any) { return Promise.resolve(executar()).then(ok, erro); },
    };
    function executar() {
      if (tabela === 'system_users') {
        const achou = filtrar(usuarios, estado.filtros)[0] || null;
        return { data: achou, error: null };
      }
      if (tabela === 'user_sessions' && estado.op === 'insert' && estado.payload) {
        sessoes.push({ ...estado.payload, revoked_at: null });
        return { data: null, error: null };
      }
      if (tabela === 'user_sessions') {
        const achou = filtrar(sessoes, estado.filtros)[0] || null;
        return { data: achou, error: null };
      }
      if (tabela === 'financial_invoices') {
        return { data: faturas, error: null, count: faturas.length };
      }
      return { data: null, error: { message: 'tabela ausente' } };
    }
    return api;
  }

  return { from, sessoes };
}

async function pedir(app: express.Express, caminho: string, corpo: unknown, headers: Record<string, string> = {}) {
  const servidor = await new Promise<import('node:http').Server>((resolve) => {
    const http = app.listen(0, '127.0.0.1', () => resolve(http));
  });
  const endereco = servidor.address();
  const porta = typeof endereco === 'object' && endereco ? endereco.port : 0;
  try {
    const resposta = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(corpo),
    });
    const json = await resposta.json().catch(() => ({}));
    return { status: resposta.status, json };
  } finally {
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  }
}

describe('fluxo real das rotas financeiras sem produção', () => {
  it('cria, valida, vence e revoga a sessão, e bloqueia o operador na fatura', async () => {
    const banco = bancoFalso();
    const app = express();
    app.use(express.json());
    registerFinanceiroAcessoRoutes(app, (req: any, res: any, next: any) => {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) return res.status(401).json({ erro: 'Não autorizado' });
      req.authToken = token;
      return next();
    }, { admin: () => ({ from: banco.from }) as any });

    const abriu = await pedir(app, '/api/auth/sessao', {
      email: 'diretoria.homolog@example.test',
      senha: 'senha-homolog-diretoria',
    });
    assert.equal(abriu.status, 200);
    assert.equal(typeof abriu.json.sessao, 'string');
    assert.equal(banco.sessoes.length, 1);

    const headers = {
      Authorization: `Bearer ${abriu.json.token}`,
      'x-tmseg-sessao': abriu.json.sessao,
    };
    const leu = await pedir(app, '/api/financeiro/consulta', {
      tabela: 'financial_invoices',
      passos: [{ m: 'select', args: ['id, valor'] }],
    }, headers);
    assert.equal(leu.status, 200);
    assert.equal(leu.json.data[0].valor, 250);

    const semSessao = await pedir(app, '/api/financeiro/consulta', {
      tabela: 'financial_invoices',
      passos: [{ m: 'select', args: ['id'] }],
    }, { Authorization: `Bearer ${abriu.json.token}` });
    assert.equal(semSessao.status, 403);

    banco.sessoes[0].expires_at = new Date(Date.now() - 60_000).toISOString();
    const vencida = await pedir(app, '/api/financeiro/consulta', {
      tabela: 'financial_invoices',
      passos: [{ m: 'select', args: ['id'] }],
    }, headers);
    assert.equal(vencida.status, 403);

    banco.sessoes[0].expires_at = new Date(Date.now() + 86_400_000).toISOString();
    banco.sessoes[0].revoked_at = new Date().toISOString();
    const revogada = await pedir(app, '/api/financeiro/consulta', {
      tabela: 'financial_invoices',
      passos: [{ m: 'select', args: ['id'] }],
    }, headers);
    assert.equal(revogada.status, 403);

    const operador = await pedir(app, '/api/auth/sessao', {
      email: 'operador.homolog@example.test',
      senha: 'senha-homolog-operador',
    });
    assert.equal(operador.status, 200);
    const bloqueado = await pedir(app, '/api/financeiro/consulta', {
      tabela: 'financial_invoices',
      passos: [{ m: 'select', args: ['id, valor'] }],
    }, {
      Authorization: `Bearer ${operador.json.token}`,
      'x-tmseg-sessao': operador.json.sessao,
    });
    assert.equal(bloqueado.status, 403);
    assert.equal(bloqueado.json.data, undefined);
  });
});
