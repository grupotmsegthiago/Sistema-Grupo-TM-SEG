import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { anexoMedicao } from '../lib/portalCliente/medicaoAnexo';
import { gravarMedicaoPortal } from '../lib/portalCliente/medicaoHttp';
import { EMAIL_FINANCEIRO_MEDICAO, textoEmailConferir, validarConferir } from '../lib/portalCliente/medicao';
import { aplicarStatusOs } from '../lib/cevaPortal/status';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function banco(mission: { id: string; client: string; billing_approved?: boolean } | null, medicao: { status?: string } | null = null) {
  const gravado: Record<string, unknown>[] = [];
  const apagado: string[] = [];
  const missions = {
    select() { return missions; },
    eq() { return missions; },
    maybeSingle: async () => ({ data: mission, error: null }),
  };
  const tabela = {
    select() { return tabela; },
    eq() { return tabela; },
    maybeSingle: async () => ({ data: medicao, error: null }),
    upsert: async (row: Record<string, unknown>) => {
      gravado.push(row);
      return { error: null };
    },
    delete() {
      return { eq: async (_coluna: string, valor: string) => { apagado.push(valor); return { error: null }; } };
    },
  };
  return {
    gravado,
    apagado,
    sb: {
      from(nome: string) { return nome === 'missions' ? missions : tabela; },
      storage: { from() { return { upload: async () => ({ error: null }) }; } },
    },
  };
}

test('conferir exige item e justificativa', () => {
  assert.equal(validarConferir({ itens: [], justificativa: 'texto longo' }).ok, false);
  assert.equal(validarConferir({ itens: ['Pedágio'], justificativa: 'curta' }).ok, false);
  const pedido = validarConferir({ itens: ['Pedágio', 'Inventado'], justificativa: 'O pedágio não confere.' });
  assert.equal(pedido.ok, true);
  if (pedido.ok) assert.deepEqual(pedido.itens, ['Pedágio']);
});

test('anexo aceita pdf curto e recusa tipo solto', () => {
  const pdf = anexoMedicao({ nome: 'nota.pdf', tipo: 'application/pdf', base64: Buffer.from('pdf').toString('base64') });
  assert.equal(pdf.ok, true);
  assert.equal(anexoMedicao({ tipo: 'text/plain', base64: Buffer.from('x').toString('base64') }).ok, false);
  assert.equal(anexoMedicao({}).ok, true);
});

test('aprovar grava verde e conferir monta o e-mail do financeiro', async () => {
  const cliente = { id: 1, name: 'CEVA LOGISTICS LTDA', trading_name: 'CEVA' };
  const semTermo = banco({ id: 'GTM-10', client: 'CEVA LOGISTICS LTDA', billing_approved: true });
  const recusa = await gravarMedicaoPortal({
    sb: semTermo.sb,
    os: '10',
    cliente,
    autor: 'Cliente',
    acao: 'aprovar',
    body: {},
  });
  assert.equal(recusa.status, 400);
  assert.equal(semTermo.gravado.length, 0);

  const aprovar = banco({ id: 'GTM-10', client: 'CEVA LOGISTICS LTDA', billing_approved: true });
  const resposta = await gravarMedicaoPortal({
    sb: aprovar.sb,
    os: '10',
    cliente,
    autor: 'Cliente',
    acao: 'aprovar',
    body: { deAcordo: true },
  });
  assert.equal(resposta.status, 200);
  assert.equal(aprovar.gravado[0].status, 'aprovado');

  const outro = await gravarMedicaoPortal({
    sb: banco({ id: 'GTM-10', client: 'OUTRO', billing_approved: true }).sb,
    os: '10',
    cliente,
    autor: 'Cliente',
    acao: 'aprovar',
    body: {},
  });
  assert.equal(outro.status, 404);

  let texto = '';
  const bloqueada = await gravarMedicaoPortal({
    sb: banco({ id: 'GTM-10', client: 'CEVA LOGISTICS LTDA', billing_approved: false }).sb,
    os: '10',
    cliente,
    autor: 'Cliente',
    acao: 'aprovar',
    body: {},
  });
  assert.equal(bloqueada.status, 409);

  const conferir = banco({ id: 'GTM-10', client: 'CEVA LOGISTICS LTDA', billing_approved: true });
  const pedido = await gravarMedicaoPortal({
    sb: conferir.sb,
    os: 'GTM-10',
    cliente,
    autor: 'Maria',
    acao: 'conferir',
    body: { itens: ['R$ total'], justificativa: 'O total está acima do combinado.', detalhes: { valorTotal: 'R$ 10,00' } },
    enviarEmail: async (mensagem) => { texto = mensagem; },
  });
  assert.equal(pedido.status, 200);
  assert.equal(pedido.corpo.emailEnviado, true);
  assert.equal(pedido.corpo.destinatario, EMAIL_FINANCEIRO_MEDICAO);
  assert.match(texto, /R\$ total/);
  assert.match(texto, /Maria/);
  assert.equal(conferir.gravado[0].status, 'conferir');
});

test('administrador interno volta a aprovação para verificar', async () => {
  const cliente = { id: 1, name: 'CEVA LOGISTICS LTDA', trading_name: 'CEVA' };
  const base = { os: '10', cliente, autor: 'Thiago', acao: 'reverter', body: {} };
  const negado = banco({ id: 'GTM-10', client: 'CEVA LOGISTICS LTDA', billing_approved: true }, { status: 'aprovado' });
  const semPermissao = await gravarMedicaoPortal({ ...base, sb: negado.sb, equipeInterna: false });
  assert.equal(semPermissao.status, 403);
  assert.equal(negado.apagado.length, 0);

  const livre = banco({ id: 'GTM-10', client: 'CEVA LOGISTICS LTDA', billing_approved: false }, { status: 'aprovado' });
  const voltou = await gravarMedicaoPortal({ ...base, sb: livre.sb, equipeInterna: true });
  assert.equal(voltou.status, 200);
  assert.equal(voltou.corpo.medicao, null);
  assert.deepEqual(livre.apagado, ['GTM-10']);

  const solta = banco({ id: 'GTM-10', client: 'CEVA LOGISTICS LTDA', billing_approved: true }, { status: 'conferir' });
  const ainda = await gravarMedicaoPortal({ ...base, sb: solta.sb, equipeInterna: true });
  assert.equal(ainda.status, 409);
});

test('e-mail da conferência leva a OS e o que foi recusado', () => {
  const texto = textoEmailConferir({
    os: '8766',
    cliente: 'CEVA',
    autor: 'João',
    itens: ['Pedágio'],
    justificativa: 'Sem comprovante.',
    detalhes: ['Pedágio: R$ 40,00'],
  });
  assert.match(texto, /GTM-8766/);
  assert.match(texto, /Pedágio/);
  assert.match(texto, /Sem comprovante/);
});

test('a lista acompanha a modificação sem apagar a medição quando o status não a traz', () => {
  const atual = [{ os: '1', status: 'Concluída', medicao: { status: 'conferir' } }];
  const igual = aplicarStatusOs(atual, [{ os: '1', status: 'Concluída' }]);
  assert.equal(igual, atual);
  const mudou = aplicarStatusOs(atual, [{ os: '1', status: 'Concluída', medicao: { status: 'modificado' } }]);
  assert.equal(mudou[0].medicao?.status, 'modificado');
});

test('medição dos três portais reaproveita a função que já existe', () => {
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  assert.equal(Object.keys(vercel.functions || {}).length, 50);
  const sources = vercel.rewrites as { source: string; destination: string }[];
  for (const source of ['/api/ceva-portal/medicao', '/api/ibl-portal/medicao', '/api/cliente-portal/medicao']) {
    const regra = sources.find((item) => item.source === source);
    assert.ok(regra);
    assert.match(regra.destination, /op=medicao/);
    assert.doesNotMatch(regra.destination, /\/api\/medicao/);
  }
  const sql = readFileSync(join(root, 'migrations/2026_10_22_portal_medicao_cliente.sql'), 'utf8');
  assert.match(sql, /EXCEPTION WHEN OTHERS/);
  assert.match(sql, /status = 'conferir'/);
});
