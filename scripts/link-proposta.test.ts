import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AcoesDaLinha } from '../components/ceva/HistoricoCotacoes';
import { lerSnapshot } from '../lib/portalCliente/historicoCotacoes';
import {
  DIAS_LINK_PROPOSTA,
  anexarLinkNoSnapshot,
  caminhoLinkProposta,
  criarLinkPublico,
  dataLinkProposta,
  lerCaminhoLinkProposta,
  linkAindaVale,
} from '../lib/portalCliente/linkProposta';
import { emitirLinkProposta, lerPropostaPublica, type BancoLinkProposta } from '../lib/portalCliente/linkPropostaHttp';

const AGORA = new Date('2026-10-26T15:00:00.000Z');
const TOKEN_A = new Uint8Array(16).fill(1);
const TOKEN_B = new Uint8Array(16).fill(2);

function propostaGravada() {
  return JSON.stringify({
    kind: 'PORTAL_COTACAO',
    duracaoMin: null,
    usouMinimo: false,
    regiao: 'SUDESTE',
    kmFranquia: 100,
    horasFranquia: 3,
    kmExtra: 7.3,
    horaExtra: 180,
    acionamento: 6880.25,
    paradas: [],
    solicitanteEmail: 'segredo@cliente.com',
    acordada: false,
    operacao: 'SUDESTE - VITORIA X SAO PAULO',
    vigencia: '2027',
    numero: 42,
  });
}

function linha(details: string | null = propostaGravada()) {
  return {
    id: 'q-42',
    client_name: 'CEVA LOGISTICS',
    origin: 'Vitória, ES',
    destination: 'São Paulo, SP',
    total_km: 942.5,
    total_hours: 23,
    total_value: 6880.25,
    created_at: '2026-10-26T18:00:00.000Z',
    created_by: 'Ana',
    status: 'Enviada',
    is_active: true,
    converted_to_order_id: null,
    contract_details: details,
  };
}

function banco(inicial = linha()): BancoLinkProposta & { atual: ReturnType<typeof linha> } {
  const atual = inicial;
  return {
    atual,
    async ler(id) {
      return id === atual.id ? atual : null;
    },
    async gravar(_id, contractDetails) {
      atual.contract_details = contractDetails;
      return null;
    },
  };
}

const ator = { nome: 'Ana', email: 'ana@grupotmseg.com.br', perfil: 'operador' };

test('o link dura 10 dias e a página pública não leva o e-mail', async () => {
  assert.equal(DIAS_LINK_PROPOSTA, 10);
  const memoria = banco();
  const emitido = await emitirLinkProposta(memoria, ator, 'q-42', AGORA, TOKEN_A);
  assert.equal(emitido.status, 200);
  if (!('ok' in emitido.corpo)) return;
  assert.equal(emitido.corpo.reutilizado, false);
  assert.equal(emitido.corpo.expiraEm, '2026-11-05T15:00:00.000Z');
  assert.equal(dataLinkProposta(emitido.corpo.expiraEm), '05/11/2026');
  const caminho = lerCaminhoLinkProposta(emitido.corpo.caminho);
  assert.deepEqual(caminho, { id: 'q-42', token: criarLinkPublico(AGORA, TOKEN_A).token });
  const publico = await lerPropostaPublica(memoria, 'q-42', caminho!.token, AGORA);
  assert.equal(publico.status, 200);
  if (!('ok' in publico.corpo)) return;
  assert.equal(publico.corpo.cliente, 'CEVA LOGISTICS');
  assert.equal(publico.corpo.validade, '05/11/2026');
  const proposta = publico.corpo.proposta as { acionamento: number; numero: number };
  assert.equal(proposta.acionamento, 6880.25);
  assert.equal(proposta.numero, 42);
  assert.equal(JSON.stringify(publico.corpo).includes('segredo@cliente.com'), false);
  const salvo = lerSnapshot(memoria.atual.contract_details);
  assert.equal(salvo?.numero, 42);
  assert.equal(salvo?.linkPublico?.token, caminho!.token);
});

test('o mesmo link vale de novo e o vencido é trocado', async () => {
  const memoria = banco();
  const primeiro = await emitirLinkProposta(memoria, ator, 'q-42', AGORA, TOKEN_A);
  const segundo = await emitirLinkProposta(memoria, ator, 'q-42', new Date(AGORA.getTime() + 60_000), TOKEN_B);
  assert.equal(primeiro.status, 200);
  assert.equal(segundo.status, 200);
  if (!('ok' in primeiro.corpo) || !('ok' in segundo.corpo)) return;
  assert.equal(segundo.corpo.caminho, primeiro.corpo.caminho);
  assert.equal(segundo.corpo.reutilizado, true);
  const depois = new Date(AGORA.getTime() + 10 * 24 * 60 * 60 * 1000 + 1000);
  assert.equal(linkAindaVale({ token: criarLinkPublico(AGORA, TOKEN_A).token, expiraEm: primeiro.corpo.expiraEm }, depois), false);
  const renovado = await emitirLinkProposta(memoria, null, 'q-42', depois, TOKEN_B);
  assert.equal(renovado.status, 401);
  const trocado = await emitirLinkProposta(memoria, ator, 'q-42', depois, TOKEN_B);
  assert.equal(trocado.status, 200);
  if (!('ok' in trocado.corpo)) return;
  assert.notEqual(trocado.corpo.caminho, primeiro.corpo.caminho);
  const antigo = await lerPropostaPublica(memoria, 'q-42', lerCaminhoLinkProposta(primeiro.corpo.caminho)!.token, depois);
  assert.equal(antigo.status, 404);
  const novo = await lerPropostaPublica(memoria, 'q-42', lerCaminhoLinkProposta(trocado.corpo.caminho)!.token, depois);
  assert.equal(novo.status, 200);
});

test('texto livre, cotação excluída e token errado não abrem a proposta', async () => {
  const livre = banco(linha('Validade da Proposta: 5 dias.'));
  const recusado = await emitirLinkProposta(livre, ator, 'q-42', AGORA, TOKEN_A);
  assert.equal(recusado.status, 409);
  assert.equal(livre.atual.contract_details, 'Validade da Proposta: 5 dias.');
  assert.equal(anexarLinkNoSnapshot('Validade da Proposta: 5 dias.', criarLinkPublico(AGORA, TOKEN_A)), null);

  const memoria = banco();
  const emitido = await emitirLinkProposta(memoria, ator, 'q-42', AGORA, TOKEN_A);
  if (!('ok' in emitido.corpo)) return;
  const token = lerCaminhoLinkProposta(emitido.corpo.caminho)!.token;
  memoria.atual.status = 'Excluida';
  const excluida = await lerPropostaPublica(memoria, 'q-42', token, AGORA);
  assert.equal(excluida.status, 404);
  memoria.atual.status = 'Enviada';
  const errado = await lerPropostaPublica(memoria, 'q-42', 'a'.repeat(32), AGORA);
  assert.equal(errado.status, 404);
  assert.equal(caminhoLinkProposta('q-42', token), `/proposta/v/q-42/${token}`);
  assert.equal(lerCaminhoLinkProposta('/outra/rota'), null);
});

test('o menu da cotação oferece o link de visualização', () => {
  const html = renderToStaticMarkup(React.createElement(AcoesDaLinha, {
    id: 'q9',
    mostrarDesativar: false,
    mostrarExcluir: false,
    painelAberto: true,
    onLink: () => undefined,
  }));
  assert.match(html, /Link de visualização/);
  assert.match(html, /link-visualizacao-q9/);
  const sem = renderToStaticMarkup(React.createElement(AcoesDaLinha, {
    id: 'q8',
    mostrarDesativar: false,
    mostrarExcluir: false,
    painelAberto: true,
  }));
  assert.doesNotMatch(sem, /Link de visualização/);
});
