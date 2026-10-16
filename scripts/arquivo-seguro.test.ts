/**
 * Acesso a arquivo sem produção.
 * O bucket falso não apaga o caminho antigo.
 */
import assert from 'node:assert/strict';
import express from 'express';
import { describe, it } from 'node:test';
import {
  ARQUIVO_TTL_SEGUNDOS,
  assinaturaValida,
  extrairArquivoProtegido,
  podeVerArquivo,
} from '../lib/financeiro/arquivoSeguro';
import { registerFinanceiroAcessoRoutes } from '../server/financeiroAcessoRoutes';

const FOTO = 'https://exemplo.supabase.co/storage/v1/object/public/mission-evidence/odometer/os-antiga.jpg';
const FINANCEIRO = 'https://exemplo.supabase.co/storage/v1/object/public/mission-evidence/financial/extrato.jpg';
const COMISSAO = 'https://exemplo.supabase.co/storage/v1/object/public/comissoes-comprovantes/pasta/recibo.pdf';
const DOCUMENTO = 'https://exemplo.supabase.co/storage/v1/object/public/documents/permits/alvara.pdf';

function banco() {
  const usuarios = [
    { id: '901', email: 'diretoria.homolog@example.test', password: 'senha-homolog-diretoria', status: 'Ativo', name: 'Diretoria Homolog', permissions: [], profiles: { name: 'Diretoria', permissions: [] } },
    { id: '902', email: 'operador.homolog@example.test', password: 'senha-homolog-operador', status: 'Ativo', name: 'Operador Homolog', permissions: ['*'], profiles: { name: 'Operador', permissions: ['*'] } },
    { id: '903', email: 'cliente.homolog@example.test', password: 'senha-homolog-cliente', status: 'Ativo', name: 'Cliente Homolog', permissions: [], profiles: { name: 'Cliente', permissions: [] } },
  ];
  const sessoes: Array<Record<string, unknown>> = [];
  const assinados: Array<{ bucket: string; caminho: string; ttl: number }> = [];

  function filtrar(linhas: Array<Record<string, unknown>>, filtros: Array<{ coluna: string; valor: unknown }>) {
    return linhas.filter((linha) => filtros.every((filtro) => String(linha[filtro.coluna] ?? '') === String(filtro.valor)));
  }

  function from(tabela: string) {
    const filtros: Array<{ coluna: string; valor: unknown }> = [];
    let op = 'select';
    let payload: Record<string, unknown> | null = null;
    const api: any = {
      select() { return api; },
      eq(coluna: string, valor: unknown) { filtros.push({ coluna, valor }); return api; },
      ilike(coluna: string, valor: unknown) { filtros.push({ coluna, valor }); return api; },
      insert(valor: Record<string, unknown>) { op = 'insert'; payload = valor; return api; },
      maybeSingle() { return api; },
      then(ok?: any, erro?: any) { return Promise.resolve(executar()).then(ok, erro); },
    };
    function executar() {
      if (tabela === 'system_users') return { data: filtrar(usuarios as any, filtros)[0] || null, error: null };
      if (tabela === 'user_sessions' && op === 'insert' && payload) {
        sessoes.push({ ...payload, revoked_at: null });
        return { data: null, error: null };
      }
      if (tabela === 'user_sessions') return { data: filtrar(sessoes, filtros)[0] || null, error: null };
      return { data: null, error: { message: 'tabela ausente' } };
    }
    return api;
  }

  return {
    from,
    sessoes,
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(caminho: string, ttl: number) {
            assinados.push({ bucket, caminho, ttl });
            return { data: { signedUrl: `https://exemplo.supabase.co/storage/v1/object/sign/${bucket}/${caminho}?exp=curto` }, error: null };
          },
        };
      },
    },
    assinados,
  };
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

describe('arquivo protegido sem produção', () => {
  it('reconhece o arquivo antigo e separa foto, comprovante e documento', () => {
    const foto = extrairArquivoProtegido(FOTO);
    assert.equal(foto?.bucket, 'mission-evidence');
    assert.equal(foto?.caminho, 'odometer/os-antiga.jpg');
    assert.equal(podeVerArquivo({ role: 'Operador', permissions: ['*'] }, 'mission-evidence', 'odometer/os-antiga.jpg'), true);
    assert.equal(podeVerArquivo({ role: 'Operador', permissions: ['*'] }, 'mission-evidence', 'financial/extrato.jpg'), false);
    assert.equal(podeVerArquivo({ role: 'Operador', permissions: ['*'] }, 'comissoes-comprovantes', 'pasta/recibo.pdf'), false);
    assert.equal(podeVerArquivo({ role: 'Diretoria' }, 'comissoes-comprovantes', 'pasta/recibo.pdf'), true);
    assert.equal(podeVerArquivo({ role: 'Cliente' }, 'mission-evidence', 'odometer/os-antiga.jpg'), false);
    assert.equal(podeVerArquivo({ role: 'Operador' }, 'documents', 'permits/alvara.pdf'), true);
    const agora = 1_000_000;
    assert.equal(assinaturaValida(agora + ARQUIVO_TTL_SEGUNDOS * 1000, agora), true);
    assert.equal(assinaturaValida(agora - 1, agora), false);
    assert.equal(assinaturaValida(agora + 30_000, agora), true);
  });

  it('assina para quem pode e nega sessão vencida, revogada e perfil sem acesso', async () => {
    const dados = banco();
    const app = express();
    app.use(express.json());
    registerFinanceiroAcessoRoutes(app, (req: any, res: any, next: any) => {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) return res.status(401).json({ erro: 'Não autorizado' });
      req.authToken = token;
      return next();
    }, { admin: () => dados as any });

    const diretoria = await pedir(app, '/api/auth/sessao', {
      email: 'diretoria.homolog@example.test',
      senha: 'senha-homolog-diretoria',
    });
    const headers = {
      Authorization: `Bearer ${diretoria.json.token}`,
      'x-tmseg-sessao': diretoria.json.sessao,
    };
    const foto = await pedir(app, '/api/financeiro/arquivo/assinar', { urls: [FOTO] }, headers);
    assert.equal(foto.status, 200);
    assert.match(foto.json.urls[0].assinada, /odometer\/os-antiga\.jpg/);
    assert.equal(dados.assinados[0].ttl, ARQUIVO_TTL_SEGUNDOS);
    assert.equal(dados.assinados[0].caminho, 'odometer/os-antiga.jpg');

    const comprovante = await pedir(app, '/api/financeiro/arquivo/assinar', { urls: [COMISSAO, DOCUMENTO, FINANCEIRO] }, headers);
    assert.equal(comprovante.status, 200);
    assert.equal(comprovante.json.urls.filter((item: { assinada: string | null }) => item.assinada).length, 3);

    const operador = await pedir(app, '/api/auth/sessao', {
      email: 'operador.homolog@example.test',
      senha: 'senha-homolog-operador',
    });
    const opHeaders = {
      Authorization: `Bearer ${operador.json.token}`,
      'x-tmseg-sessao': operador.json.sessao,
    };
    const fotoOp = await pedir(app, '/api/financeiro/arquivo/assinar', { urls: [FOTO] }, opHeaders);
    assert.equal(fotoOp.status, 200);
    const negado = await pedir(app, '/api/financeiro/arquivo/assinar', { urls: [FINANCEIRO, COMISSAO] }, opHeaders);
    assert.equal(negado.status, 403);
    assert.equal(negado.json.urls[0].assinada, null);

    const cliente = await pedir(app, '/api/auth/sessao', {
      email: 'cliente.homolog@example.test',
      senha: 'senha-homolog-cliente',
    });
    const clienteNegado = await pedir(app, '/api/financeiro/arquivo/assinar', { urls: [FOTO] }, {
      Authorization: `Bearer ${cliente.json.token}`,
      'x-tmseg-sessao': cliente.json.sessao,
    });
    assert.equal(clienteNegado.status, 403);

    const semSessao = await pedir(app, '/api/financeiro/arquivo/assinar', { urls: [FOTO] }, {
      Authorization: `Bearer ${diretoria.json.token}`,
    });
    assert.equal(semSessao.status, 401);

    dados.sessoes[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const vencida = await pedir(app, '/api/financeiro/arquivo/assinar', { urls: [FOTO] }, headers);
    assert.equal(vencida.status, 401);
    dados.sessoes[0].expires_at = new Date(Date.now() + 86_400_000).toISOString();
    dados.sessoes[0].revoked_at = new Date().toISOString();
    const revogada = await pedir(app, '/api/financeiro/arquivo/assinar', { urls: [FOTO] }, headers);
    assert.equal(revogada.status, 401);
  });
});
