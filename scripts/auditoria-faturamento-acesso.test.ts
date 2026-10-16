import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { podeAcessarAuditoriaFaturamento } from '../lib/auditoriaFaturamentoAccess';
import { tratarReaprovacaoHttp } from '../lib/reaprovacaoFinanceira/tratar';
import type { OsReaprovacao } from '../lib/reaprovacaoFinanceira/tipos';

const os: OsReaprovacao = {
  id: 'GTM-9001',
  status: 'Concluída',
  billing_approved: true,
  revenue_value: 100,
  cost_value: 80,
  negative_margin_locked: false,
  faturaPaga: false,
};

const repo = {
  async buscarTentativa() { throw new Error('não deveria consultar'); },
  async buscarPorId() { throw new Error('não deveria consultar'); },
  async listarNotificacoes() { throw new Error('não deveria consultar'); },
  async buscarNotificacao() { throw new Error('não deveria consultar'); },
  async salvarNotificacao() { throw new Error('não deveria gravar'); },
  async confirmar() { throw new Error('não deveria gravar'); },
  async confirmarEdicao() { throw new Error('não deveria gravar'); },
};
const storage = {
  async guardar() { throw new Error('não deveria gravar'); },
  async urlAssinada() { throw new Error('não deveria abrir'); },
};

function pedido(op: 'reaprovar' | 'edicao-total', principal: { id: string; name: string; role: string; permissions?: string[] }) {
  return tratarReaprovacaoHttp({
    principal,
    method: 'POST',
    op,
    corpo: {
      missionId: os.id,
      tentativaId: '11111111-1111-4111-8111-111111111111',
      justificativa: 'Tentativa direta sem autorização',
      senha: 'senha-que-nao-pode-passar',
      capturaAntes: 'jpeg',
      capturaDepois: 'jpeg',
      revenue_value: 150,
      cost_value: 90,
      campos: [{ campo: 'revenue_value', antes: 100, depois: 150 }],
    },
    buscaOs: async () => ({ ok: true, os }),
    senhaConfere: async () => true,
    repo: repo as never,
    storage: storage as never,
  });
}

describe('auditoria de faturamento — quem entra', () => {
  it('Diretoria, Controller, Giovanna, ANA.FERNANDES e Bárbara entram; os demais não', () => {
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'Thiago Moreira', role: 'Diretoria' }), true);
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'Giovanna Marsili', role: 'Financeiro' }), true);
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'ANA.FERNANDES', role: 'Financeiro' }), true);
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'Bárbara Sgarlata', role: 'Financeiro' }), true);
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'Controller', role: 'Controller' }), true);
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'Administrador', role: 'Administrador' }), false);
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'Giovanna Marsili', role: 'Administrador', permissions: ['*'] }), false);
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'Thiago Moreira', role: 'Administrador', permissions: ['*'] }), false);
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'Avançado', role: 'Avançado', permissions: ['*'] }), false);
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'Operador', role: 'Operador' }), false);
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'Outro Financeiro', role: 'Financeiro' }), false);
    assert.equal(podeAcessarAuditoriaFaturamento({ name: 'Plinio', role: 'Operador' }), false);
    assert.equal(podeAcessarAuditoriaFaturamento(null), false);
  });
});

describe('auditoria de faturamento — API direta', () => {
  const bloqueados = [
    { id: 'adm', name: 'Administrador', role: 'Administrador', permissions: ['*'] },
    { id: 'av', name: 'Avançado', role: 'Avançado' },
    { id: 'op', name: 'Operador', role: 'Operador' },
  ];

  for (const principal of bloqueados) {
    for (const op of ['reaprovar', 'edicao-total'] as const) {
      it(`${principal.role} recebe 403 em ${op} e nada é gravado`, async () => {
        const resposta = await pedido(op, principal);
        assert.equal(resposta.status, 403);
        assert.equal(resposta.body.ok, false);
        assert.equal(resposta.body.percentual, 0);
        assert.equal(JSON.stringify(resposta.body).includes('senha-que-nao-pode-passar'), false);
        assert.equal(JSON.stringify(resposta.body).includes('150'), false);
      });
    }
  }

  it('Controller vê a auditoria, mas reaprovação e edição total continuam 403', async () => {
    const principal = { id: 'ct', name: 'Controller', role: 'Controller' };
    const reaprovar = await pedido('reaprovar', principal);
    const edicao = await pedido('edicao-total', principal);
    assert.equal(reaprovar.status, 403);
    assert.equal(edicao.status, 403);
    assert.equal(reaprovar.body.percentual, 0);
    assert.equal(edicao.body.percentual, 0);
  });

  it('as rotas de leitura, recálculo e gravação da auditoria exigem o guardião', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    const protegidas = [
      '/api/missions/:id/financial-history", requireAuth, requireAuditoriaFaturamento',
      '/api/missions/:id/billing-override", requireAuth, requireAuditoriaFaturamento',
      '/api/missions/:id/force-recalculate", requireAuth, requireAuditoriaFaturamento',
      '/api/missions/force-recalculate-by-os/:osNumber", requireAuth, requireAuditoriaFaturamento',
      '/api/missions/scan-divergences", requireAuth, requireAuditoriaFaturamento',
      '/api/missions/fix-divergences", requireAuth, requireAuditoriaFaturamento',
      '/api/missions/recalculate-all", requireAuth, requireAuditoriaFaturamento',
    ];
    for (const trecho of protegidas) assert.match(routes, new RegExp(trecho.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(routes, /function requireAuditoriaFaturamento/);
    assert.match(routes, /status\(403\)\.json\(\{ error: 'Sem acesso à auditoria de faturamento\.' \}\)/);
  });

  it('a tela, o atalho e a URL direta ficam fechados no código', () => {
    const modal = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const app = fs.readFileSync('App.tsx', 'utf8');
    const tabela = fs.readFileSync('components/MissionTable.tsx', 'utf8');
    assert.match(modal, /data-testid="auditoria-faturamento-bloqueada"/);
    assert.match(app, /Sem acesso à auditoria de faturamento\./);
    assert.match(tabela, /openMission/);
    assert.match(tabela, /podeAcessarAuditoriaFaturamento\(currentUser\)/);
    const sql = fs.readFileSync('migrations/propostas/2026_10_16_edicao_total_financeira.sql', 'utf8');
    assert.match(sql, /NÃO aplicar em produção sem autorização/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.editar_os_total_financeira/);
    assert.match(sql, /service_role/);
    assert.match(sql, /A função NÃO autoriza pelo perfil/);
  });
});
