import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executarAcaoDiretoria, executarReaprovacao } from '../lib/reaprovacaoFinanceira/executar';
import { classificarErroGravacao } from '../lib/reaprovacaoFinanceira/gravacao';
import {
  anexarAcaoDiretoria,
  camposAlterados,
  etapasVazias,
  montarPatchValores,
  patchSeguro,
  percentualEtapas,
  percentualExibido,
  podeReaprovar,
  separarSenha,
} from '../lib/reaprovacaoFinanceira/regras';
import { tratarReaprovacaoHttp } from '../lib/reaprovacaoFinanceira/tratar';
import type { EtapasReaprovacao, EventoReaprovacao, NotificacaoDiretoria, OsReaprovacao } from '../lib/reaprovacaoFinanceira/tipos';

const SENHA = 'segredo-unico-reaprovacao';
const TENTATIVA = '11111111-1111-4111-8111-111111111111';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const giovanna = { id: 'g1', name: 'Giovanna Marsili', role: 'Financeiro' };
const ana = { id: 'a1', name: 'ANA.FERNANDES', role: 'Financeiro' };

function osBase(extra: Partial<OsReaprovacao> = {}): OsReaprovacao {
  return {
    id: 'GTM-9001',
    created_by: 'Operador Silva',
    status: 'Concluída',
    billing_approved: true,
    billing_verified_by: 'Giovanna Marsili',
    snapshot_approved_by: 'Giovanna Marsili',
    snapshot_approved_at: '2026-10-01T12:00:00.000Z',
    snapshot_data: { franchiseKm: 40, franchiseHours: 4, tollVal: 12, revenueServiceOnly: 100 },
    negative_margin_locked: false,
    faturaPaga: false,
    revenue_value: 100,
    cost_value: 80,
    revenue_edit_reason: 'motivo antigo',
    cost_edit_reason: null,
    toll_value: 12,
    toll_value_provider: 11,
    ...extra,
  };
}

function memoria(opcoes?: {
  falhaSalvar?: boolean;
  falhaAplicar?: boolean;
  falhaAviso?: boolean;
  falhaReversao?: boolean;
  falhaStorage?: boolean;
}) {
  const eventos = new Map<string, EventoReaprovacao>();
  const avisos: NotificacaoDiretoria[] = [];
  const valores = { revenue_value: 100, cost_value: 80, revenue_edit_reason: 'motivo antigo' as string | null, cost_edit_reason: null as string | null, toll_value: 12 };
  const patches: Record<string, unknown>[] = [];
  let aplicacoes = 0;
  let uploads = 0;
  let senhas = 0;
  const repo = {
    async buscarTentativa(tentativaId: string) {
      return { ok: true as const, evento: eventos.get(tentativaId) || null };
    },
    async buscarPorId(id: string) {
      return { ok: true as const, evento: [...eventos.values()].find((item) => item.id === id) || null };
    },
    async salvarEvento(evento: EventoReaprovacao) {
      if (opcoes?.falhaSalvar && !eventos.has(evento.tentativaId)) return { ok: false as const, erro: 'insert fail' };
      eventos.set(evento.tentativaId, { ...evento });
      return { ok: true as const, evento: { ...evento } };
    },
    async aplicarValores(_id: string, patch: Record<string, unknown>) {
      aplicacoes += 1;
      patches.push(patch);
      if (opcoes?.falhaAplicar && aplicacoes === 1) return { ok: false as const, erro: 'update fail' };
      if (opcoes?.falhaReversao && aplicacoes > 1) return { ok: false as const, erro: 'revert fail' };
      Object.assign(valores, patch);
      return { ok: true as const };
    },
    async criarNotificacao(evento: EventoReaprovacao) {
      if (opcoes?.falhaAviso) return { ok: false as const, erro: 'aviso fail' };
      const notificacao: NotificacaoDiretoria = {
        id: `aviso-${avisos.length + 1}`,
        reaprovacaoId: evento.id,
        situacao: 'pendente',
        historico: [],
        resumo: {
          osNumero: evento.osNumero,
          incluidoPor: evento.incluidoPor,
          aprovadoOriginalmentePor: evento.aprovadoOriginalmentePor,
          aprovadoOriginalmenteEm: evento.aprovadoOriginalmenteEm,
          alteradoPor: evento.alteradoPor,
          reaprovadoPor: evento.reaprovadoPor,
          reaprovadoEm: evento.reaprovadoEm,
          justificativa: evento.justificativa,
          campos: evento.campos,
          capturaAntesPath: evento.capturaAntesPath,
          capturaDepoisPath: evento.capturaDepoisPath,
          preservados: ['snapshot original', 'pedágio', 'franquia', 'comissão'],
          aprovacaoFinanceiraAlterada: false,
        },
      };
      avisos.push(notificacao);
      return { ok: true as const, notificacao };
    },
    async listarNotificacoes() {
      return { ok: true as const, itens: avisos };
    },
    async buscarNotificacao(id: string) {
      return { ok: true as const, notificacao: avisos.find((item) => item.id === id) || null };
    },
    async salvarNotificacao(notificacao: NotificacaoDiretoria) {
      const indice = avisos.findIndex((item) => item.id === notificacao.id);
      if (indice < 0) return { ok: false as const, erro: 'ausente' };
      avisos[indice] = notificacao;
      return { ok: true as const };
    },
  };
  const storage = {
    async guardar(path: string) {
      uploads += 1;
      if (opcoes?.falhaStorage) return { ok: false as const, erro: 'Bucket not found' };
      return { ok: true as const, path };
    },
    async urlAssinada(path: string) {
      return { ok: true as const, url: `https://storage.local/${path}` };
    },
  };
  return {
    repo,
    storage,
    valores,
    patches,
    avisos,
    eventos,
    contagem: () => ({ aplicacoes, uploads, senhas, avisos: avisos.length }),
    contarSenha: () => { senhas += 1; },
  };
}

function pedido(os: OsReaprovacao, usuario = giovanna, extra: Record<string, unknown> = {}) {
  return {
    usuario,
    os,
    tentativaId: TENTATIVA,
    justificativa: 'Correção do valor conferido na OS',
    senha: SENHA,
    capturaAntes: JPEG,
    capturaDepois: JPEG,
    revenue_value: 150,
    cost_value: 80,
    agora: '2026-10-16T15:00:00.000Z',
    ...extra,
  };
}

async function executar(os: OsReaprovacao, mem = memoria(), usuario = giovanna, extra: Record<string, unknown> = {}) {
  const resultado = await executarReaprovacao(pedido(os, usuario, extra), {
    senhaConfere: async (senha) => {
      mem.contarSenha();
      return senha === SENHA;
    },
    repo: mem.repo,
    storage: mem.storage,
  });
  return { resultado, mem };
}

describe('quem pode reaprovar', () => {
  it('Giovanna e ANA.FERNANDES reaprovam OS concluída e aprovada', () => {
    assert.equal(podeReaprovar(giovanna, osBase()).permitido, true);
    assert.equal(podeReaprovar(ana, osBase()).permitido, true);
  });

  it('operador de orçamentos, diretoria, controller e nome solto sem perfil financeiro não reaprovam', () => {
    const os = osBase();
    assert.equal(podeReaprovar({ name: 'Operador', role: 'Operador' }, os).permitido, false);
    assert.equal(podeReaprovar({ name: 'Thiago Moreira', role: 'Diretoria' }, os).permitido, false);
    assert.equal(podeReaprovar({ name: 'Plinio', role: 'Controller' }, os).permitido, false);
    assert.equal(podeReaprovar({ name: 'Ana', role: 'Operador' }, os).permitido, false);
    assert.equal(podeReaprovar({ name: 'Lilian Raquel Viana', role: 'Operador' }, os).permitido, false);
  });

  it('não abre faturada, paga, encerrada, prejuízo ou consulta incompleta', () => {
    assert.equal(podeReaprovar(giovanna, osBase({ invoice_number: 'NF-1' })).permitido, false);
    assert.equal(podeReaprovar(ana, osBase({ faturaPaga: true })).permitido, false);
    assert.equal(podeReaprovar(giovanna, osBase({ status: 'Encerrada' })).permitido, false);
    assert.equal(podeReaprovar(giovanna, osBase({ status: 'Cancelada' })).permitido, false);
    assert.equal(podeReaprovar(giovanna, osBase({ status: 'Faturada' })).permitido, false);
    assert.equal(podeReaprovar(giovanna, osBase({ negative_margin_locked: true })).permitido, false);
    assert.equal(podeReaprovar(ana, osBase({ consultaTravaIncompleta: true })).permitido, false);
    assert.match(podeReaprovar(giovanna, osBase({ faturaPaga: true })).motivo, /não desbloqueia/i);
  });
});

describe('reaprovação com senha, evidência e aviso', () => {
  it('senha incorreta e justificativa ausente não gravam nem guardam imagem', async () => {
    const semJustificativa = await executar(osBase(), memoria(), giovanna, { justificativa: '   ' });
    assert.equal(semJustificativa.resultado.ok, false);
    assert.equal(semJustificativa.resultado.percentual < 100, true);
    assert.equal(semJustificativa.mem.contagem().senhas, 0);
    assert.equal(semJustificativa.mem.contagem().uploads, 0);

    const senhaErrada = await executar(osBase(), memoria(), ana, { senha: 'errada' });
    assert.equal(senhaErrada.resultado.ok, false);
    assert.match(senhaErrada.resultado.erro || '', /Senha incorreta/);
    assert.equal(senhaErrada.mem.contagem().uploads, 0);
    assert.equal(senhaErrada.mem.contagem().aplicacoes, 0);
    assert.equal(JSON.stringify(senhaErrada.resultado).includes('errada'), false);
  });

  it('falha no armazenamento não grava a OS', async () => {
    const { resultado, mem } = await executar(osBase(), memoria({ falhaStorage: true }));
    assert.equal(resultado.ok, false);
    assert.match(resultado.erro || '', /armazenamento/i);
    assert.equal(resultado.percentual < 100, true);
    assert.equal(mem.contagem().aplicacoes, 0);
    assert.equal(mem.eventos.size, 0);
    assert.equal(mem.valores.revenue_value, 100);
  });

  it('falha no banco não altera o valor', async () => {
    const { resultado, mem } = await executar(osBase(), memoria({ falhaSalvar: true }));
    assert.equal(resultado.ok, false);
    assert.match(resultado.erro || '', /banco/i);
    assert.equal(mem.contagem().aplicacoes, 0);
    assert.equal(mem.valores.revenue_value, 100);
    assert.equal(mem.valores.toll_value, 12);
  });

  it('falha ao aplicar o valor não conclui', async () => {
    const { resultado, mem } = await executar(osBase(), memoria({ falhaAplicar: true }));
    assert.equal(resultado.status, 'falha');
    assert.equal(resultado.percentual < 100, true);
    assert.equal(mem.valores.revenue_value, 100);
  });

  it('falha no aviso devolve o valor anterior', async () => {
    const { resultado, mem } = await executar(osBase(), memoria({ falhaAviso: true }));
    assert.equal(resultado.ok, false);
    assert.match(resultado.erro || '', /Diretoria/);
    assert.equal(mem.valores.revenue_value, 100);
    assert.equal(mem.valores.revenue_edit_reason, 'motivo antigo');
    assert.equal(mem.contagem().avisos, 0);
    assert.equal([...mem.eventos.values()][0]?.valoresAplicados, false);
  });

  it('falha ao reverter fica inconsistente e abaixo de 100%', async () => {
    const { resultado, mem } = await executar(osBase(), memoria({ falhaAviso: true, falhaReversao: true }));
    assert.equal(resultado.status, 'inconsistente');
    assert.equal(resultado.ok, false);
    assert.equal(resultado.percentual < 100, true);
    assert.equal(mem.valores.revenue_value, 150);
  });

  it('conclui uma vez, preserva snapshot, pedágio e aprovação original, e não repete', async () => {
    const os = osBase();
    const snapshot = os.snapshot_data;
    const mem = memoria();
    const primeira = await executar(os, mem, ana);
    assert.equal(primeira.resultado.ok, true);
    assert.equal(primeira.resultado.percentual, 100);
    assert.equal(primeira.resultado.status, 'concluida');
    assert.equal(os.snapshot_data, snapshot);
    assert.equal(os.snapshot_approved_by, 'Giovanna Marsili');
    assert.equal(os.billing_approved, true);
    assert.equal(mem.valores.revenue_value, 150);
    assert.equal(mem.valores.toll_value, 12);
    assert.equal(mem.valores.cost_value, 80);
    const patch = mem.patches[0];
    for (const chave of ['snapshot_data', 'snapshot_approved_by', 'toll_value', 'toll_value_provider', 'billing_approved', 'franchise_km', 'comissao']) {
      assert.equal(Object.prototype.hasOwnProperty.call(patch, chave), false);
    }
    const resumo = primeira.resultado.resumo;
    assert.equal(resumo?.osNumero, 'GTM-9001');
    assert.equal(resumo?.incluidoPor, 'Operador Silva');
    assert.equal(resumo?.aprovadoOriginalmentePor, 'Giovanna Marsili');
    assert.equal(resumo?.alteradoPor, 'ANA.FERNANDES');
    assert.equal(resumo?.reaprovadoPor, 'ANA.FERNANDES');
    assert.equal(resumo?.justificativa, 'Correção do valor conferido na OS');
    assert.equal(resumo?.campos[0]?.antes, 100);
    assert.equal(resumo?.campos[0]?.depois, 150);
    assert.match(resumo?.capturaAntesPath || '', /antes\.jpg$/);
    assert.match(resumo?.capturaDepoisPath || '', /depois\.jpg$/);
    assert.equal(resumo?.aprovacaoFinanceiraAlterada, false);
    assert.equal(JSON.stringify(primeira.resultado).includes(SENHA), false);
    assert.equal(JSON.stringify(primeira.resultado).includes(JPEG), false);

    const marcas = mem.contagem();
    const segunda = await executar(os, mem, ana, { capturaAntes: '', capturaDepois: '', revenue_value: 999 });
    assert.equal(segunda.resultado.ok, true);
    assert.equal(segunda.resultado.repetida, true);
    assert.equal(segunda.resultado.percentual, 100);
    assert.equal(mem.contagem().aplicacoes, marcas.aplicacoes);
    assert.equal(mem.contagem().avisos, marcas.avisos);
    assert.equal(mem.valores.revenue_value, 150);
  });
});

describe('diretoria lê, questiona e encerra sem aprovar', () => {
  it('as três ações acumulam histórico e não mexem na aprovação', async () => {
    const base: NotificacaoDiretoria = {
      id: 'aviso-1',
      reaprovacaoId: 'evt-1',
      situacao: 'pendente',
      historico: [],
      resumo: {
        osNumero: 'GTM-9001',
        incluidoPor: 'Operador Silva',
        aprovadoOriginalmentePor: 'Giovanna Marsili',
        aprovadoOriginalmenteEm: '2026-10-01T12:00:00.000Z',
        alteradoPor: 'ANA.FERNANDES',
        reaprovadoPor: 'ANA.FERNANDES',
        reaprovadoEm: '2026-10-16T15:00:00.000Z',
        justificativa: 'Correção do valor conferido na OS',
        campos: [{ campo: 'revenue_value', antes: 100, depois: 150 }],
        capturaAntesPath: 'GTM-9001/antes.jpg',
        capturaDepoisPath: 'GTM-9001/depois.jpg',
        preservados: ['snapshot original', 'pedágio', 'franquia', 'comissão'],
        aprovacaoFinanceiraAlterada: false,
      },
    };
    const diretoria = { id: 'd1', name: 'Thiago Moreira', role: 'Diretoria' };
    let atual: NotificacaoDiretoria | null = base;
    for (const acao of ['LIDO', 'QUESTIONAR', 'ENCERRAR'] as const) {
      const salvo = await executarAcaoDiretoria(
        diretoria,
        atual,
        acao,
        acao === 'QUESTIONAR' ? 'Por que a receita mudou?' : '',
        async (notificacao) => {
          atual = notificacao;
          return { ok: true };
        },
        '2026-10-16T16:00:00.000Z',
      );
      assert.equal(salvo.http, 200);
      assert.equal(salvo.body.aprovacaoFinanceiraAlterada, false);
      assert.equal(JSON.stringify(salvo.body).includes('billing_approved'), false);
    }
    assert.equal(atual?.historico.length, 3);
    assert.deepEqual(atual?.historico.map((item) => item.acao), ['LIDO', 'QUESTIONAR', 'ENCERRAR']);
    assert.equal(atual?.situacao, 'encerrado');
    assert.equal(atual?.resumo.aprovacaoFinanceiraAlterada, false);

    const semPergunta = anexarAcaoDiretoria(base, 'QUESTIONAR', 'Thiago Moreira', '2026-10-16T16:00:00.000Z', 'curta');
    assert.equal(semPergunta.ok, false);
    assert.equal(base.historico.length, 0);

    const financeiro = await executarAcaoDiretoria(giovanna, base, 'LIDO', '', async () => ({ ok: true }));
    assert.equal(financeiro.http, 403);
  });
});

describe('progresso e proteção dos campos', () => {
  it('100% só com as oito etapas e a conclusão confirmada', () => {
    const etapas = etapasVazias();
    assert.equal(percentualEtapas(etapas), 0);
    const chaves = Object.keys(etapas) as (keyof EtapasReaprovacao)[];
    chaves.forEach((chave, indice) => {
      etapas[chave] = true;
      const percentual = percentualEtapas(etapas);
      if (indice < chaves.length - 1) assert.equal(percentual < 100, true);
    });
    assert.equal(percentualEtapas(etapas), 100);
    assert.equal(percentualExibido(100, false), 99);
    assert.equal(percentualExibido(100, true), 100);
    assert.equal(percentualExibido(62, false), 62);
  });

  it('o patch da correção não leva snapshot, pedágio, franquia nem comissão', () => {
    const patch = montarPatchValores(
      camposAlterados({ revenue_value: 100, cost_value: 80 }, { revenue_value: 150, cost_value: 70 }),
      'Correção do valor conferido na OS',
      'Giovanna Marsili',
      '2026-10-16T15:00:00.000Z',
    );
    assert.deepEqual(Object.keys(patch).sort(), ['cost_edit_reason', 'cost_value', 'last_update', 'revenue_edit_reason', 'revenue_value']);
    assert.equal(patchSeguro({ ...patch, toll_value: 9, snapshot_data: { franchiseKm: 1 } }).ok, false);
    assert.equal(patchSeguro({ comissao: 10 }).ok, false);
  });

  it('tabela ausente impede a conclusão e a senha sai do corpo', () => {
    assert.match(classificarErroGravacao({ code: '42P01', message: 'relation does not exist' }) || '', /não foi implantada/);
    assert.match(classificarErroGravacao({ message: 'Bucket not found' }) || '', /armazenamento privado/);
    const separado = separarSenha({ senha: SENHA, justificativa: 'Correção do valor conferido na OS', missionId: 'GTM-9001' });
    assert.equal(separado.senha, SENHA);
    assert.equal('senha' in separado.resto, false);
    assert.equal(JSON.stringify(separado.resto).includes(SENHA), false);
  });
});

describe('HTTP', () => {
  it('resposta não devolve a senha e perfil sem permissão não lista nem reaprova', async () => {
    const mem = memoria();
    const os = osBase();
    const ok = await tratarReaprovacaoHttp({
      principal: ana,
      method: 'POST',
      op: 'reaprovar',
      corpo: { ...pedido(os), senha: SENHA, missionId: os.id },
      buscaOs: async () => ({ ok: true, os }),
      senhaConfere: async (_id, senha) => senha === SENHA,
      repo: mem.repo,
      storage: mem.storage,
    });
    assert.equal(ok.status, 200);
    assert.equal(JSON.stringify(ok.body).includes(SENHA), false);
    assert.equal(JSON.stringify(ok.body).includes(JPEG), false);

    const lista = await tratarReaprovacaoHttp({
      principal: { id: 'op', name: 'Operador', role: 'Operador' },
      method: 'GET',
      op: 'lista',
      corpo: {},
      buscaOs: async () => ({ ok: true, os: null }),
      senhaConfere: async () => false,
      repo: mem.repo,
      storage: mem.storage,
    });
    assert.equal(lista.status, 403);

    const negado = await tratarReaprovacaoHttp({
      principal: { id: 'op', name: 'Operador', role: 'Operador' },
      method: 'POST',
      op: 'reaprovar',
      corpo: { ...pedido(os), senha: SENHA, missionId: os.id },
      buscaOs: async () => ({ ok: true, os }),
      senhaConfere: async () => true,
      repo: mem.repo,
      storage: mem.storage,
    });
    assert.equal(negado.status, 403);
    assert.equal(negado.body.percentual, 0);
  });
});

describe('arquivos do fluxo', () => {
  it('a rota apaga a senha e o modal ganhou Reaprovar sem perder a trava antiga', () => {
    const rota = fs.readFileSync('server/reaprovacaoFinanceiraRoutes.ts', 'utf8');
    assert.match(rota, /delete req\.body\.senha/);
    assert.match(rota, /console\.error\('\[reaprovacao\] falha inesperada'\)/);
    assert.doesNotMatch(rota, /console\.(log|error|warn)\([^)]*senha/i);
    const modal = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(modal, /button-reaprovar|ReaprovacaoFinanceiraPainel/);
    assert.match(modal, /A correção de receita ou custo entra em Reaprovar/);
    assert.match(modal, /action_type: `\$\{stage\}_reapproval`/);
    assert.match(modal, /requiresPostApprovalNote && !providerSaveObservation\.ok/);
    const painel = fs.readFileSync('components/ReaprovacaoFinanceiraPainel.tsx', 'utf8');
    assert.match(painel, /data-testid="button-reaprovar"/);
    assert.match(painel, /type="password"/);
    assert.doesNotMatch(painel, /console\.(log|error|warn)/);
    const diretoria = fs.readFileSync('components/ReaprovacaoDiretoriaLista.tsx', 'utf8');
    assert.match(diretoria, /LIDO/);
    assert.match(diretoria, /QUESTIONAR/);
    assert.match(diretoria, /ENCERRAR/);
  });
});
