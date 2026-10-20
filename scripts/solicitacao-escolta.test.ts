import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rankOffers, type ActivationOffer } from '../lib/providerActivationRanking.ts';
import {
  INTERVALO_FILA_MS,
  erroTabelaAusente,
  lerSolicitacao,
  linkGrupoOperador,
  montarLiberacoes,
  podeAbrirWhatsapp,
  statusAposConfirmacao,
  textoSolicitacaoEscolta,
} from '../lib/solicitacaoEscolta/regras.ts';
import { consumirPrefillSolicitacao, gravarPrefillSolicitacao, horarioParaOs } from '../lib/solicitacaoEscolta/prefill.ts';

function oferta(provider: string, cost: number, uf = 'RJ'): ActivationOffer {
  return {
    provider,
    cost,
    city: uf === 'SP' ? 'São Paulo' : 'Rio de Janeiro',
    hqUf: uf,
    marketUf: uf,
    region: 'SUDESTE',
    source: '100KM',
  };
}

test('lê origem Rio de Janeiro, destino e viagem agendada', () => {
  const lida = lerSolicitacao([
    'Solicitação de escolta',
    'Origem: Rio de Janeiro - RJ',
    'Destino: São Paulo - SP',
    'Data: 21/10/2026',
    'Horário: 08:00',
    'Agendada',
  ].join('\n'));
  assert.equal(lida.origem, 'Rio de Janeiro - RJ');
  assert.equal(lida.destino, 'São Paulo - SP');
  assert.equal(lida.uf, 'RJ');
  assert.equal(lida.imediata, false);
  assert.equal(lida.data, '2026-10-21');
  assert.equal(lida.hora, '08:00');
});

test('lê solicitação imediata e não inventa data de agenda', () => {
  const lida = lerSolicitacao('URGENTE\nOrigem: Rio de Janeiro\nDestino: Duque de Caxias\nImediata');
  assert.equal(lida.imediata, true);
  assert.equal(lida.uf, 'RJ');
  assert.equal(lida.destino, 'Duque de Caxias');
});

test('mensagem sem prazo deixa a escolha com o operador', () => {
  const lida = lerSolicitacao('Origem: Santos - SP\nDestino: Campinas');
  assert.equal(lida.imediata, null);
  assert.equal(lida.uf, 'SP');
});

test('fila agendada libera os dois mais baratos e o próximo em 10 minutos', () => {
  const ordem = rankOffers([
    oferta('CARO', 900),
    oferta('BARATO', 100),
    oferta('MEIO', 400),
    oferta('QUARTO', 700),
  ], 'RJ').map((item) => item.provider);
  assert.deepEqual(ordem, ['BARATO', 'MEIO', 'QUARTO', 'CARO']);
  const horarios = montarLiberacoes(ordem.length, false, 1_000);
  assert.deepEqual(horarios, [1_000, 1_000, 1_000 + INTERVALO_FILA_MS, 1_000 + INTERVALO_FILA_MS * 2]);
});

test('fila imediata libera todos no mesmo instante', () => {
  assert.deepEqual(montarLiberacoes(3, true, 50), [50, 50, 50]);
});

test('em São Paulo a TORRES continua na frente da fila', () => {
  const ordem = rankOffers([
    oferta('BARATO', 100, 'SP'),
    oferta('TORRES VIGILANCIA', 900, 'SP'),
    oferta('CARO', 500, 'SP'),
  ], 'SP');
  assert.equal(ordem[0].provider, 'TORRES VIGILANCIA');
  assert.equal(ordem[0].pinned, true);
  const horarios = montarLiberacoes(ordem.length, false, 0);
  assert.equal(horarios[0], 0);
  assert.equal(horarios[1], 0);
  assert.equal(horarios[2], INTERVALO_FILA_MS);
});

test('fornecedor confirmado trava quem ainda não recebeu', () => {
  assert.equal(statusAposConfirmacao(true), 'confirmado');
  assert.equal(statusAposConfirmacao(false), 'bloqueado');
  assert.equal(podeAbrirWhatsapp('na_fila', 0, 1_000, 'em_andamento'), true);
  assert.equal(podeAbrirWhatsapp('na_fila', 5_000, 1_000, 'em_andamento'), false);
  assert.equal(podeAbrirWhatsapp('bloqueado', 0, 1_000, 'em_andamento'), false);
  assert.equal(podeAbrirWhatsapp('na_fila', 0, 1_000, 'confirmada'), false);
});

test('texto vai pronto e só o link do grupo abre o WhatsApp do operador', () => {
  const texto = textoSolicitacaoEscolta({
    origem: 'Rio de Janeiro - RJ',
    destino: 'São Paulo - SP',
    imediata: false,
    data: '2026-10-21',
    hora: '08:00',
  });
  assert.match(texto, /SOLICITAÇÃO DE ESCOLTA/);
  assert.match(texto, /Origem: Rio de Janeiro - RJ/);
  assert.match(texto, /Destino: São Paulo - SP/);
  assert.match(texto, /21\/10\/2026 às 08:00/);
  assert.equal(linkGrupoOperador('https://chat.whatsapp.com/AbCd'), 'https://chat.whatsapp.com/AbCd');
  assert.equal(linkGrupoOperador('120363000000000000-group'), null);
  assert.equal(linkGrupoOperador(''), null);
});

test('OS nasce sem cliente, com fornecedor e horário da solicitação', () => {
  const imediata = horarioParaOs(true, '2026-10-21', '08:00', new Date('2026-10-20T15:04:00Z'));
  assert.match(imediata.scheduledDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(imediata.scheduledTime, /^\d{2}:\d{2}$/);
  const agendada = horarioParaOs(false, '2026-10-21', '08:00');
  assert.equal(agendada.scheduledDate, '2026-10-21');
  assert.equal(agendada.scheduledTime, '08:00');

  const memoria = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (chave: string) => memoria.get(chave) ?? null,
    setItem: (chave: string, valor: string) => memoria.set(chave, valor),
    removeItem: (chave: string) => memoria.delete(chave),
  };
  gravarPrefillSolicitacao({
    solicitacaoId: 'abc',
    provider: 'BARATO',
    origin: 'Rio de Janeiro - RJ',
    destination: 'São Paulo - SP',
    imediata: false,
    scheduledDate: '2026-10-21',
    scheduledTime: '08:00',
  });
  const guardado = JSON.parse(memoria.values().next().value as string);
  assert.equal(guardado.client, undefined);
  const lido = consumirPrefillSolicitacao();
  assert.equal(lido?.provider, 'BARATO');
  assert.equal(lido?.origin, 'Rio de Janeiro - RJ');
  assert.equal(consumirPrefillSolicitacao(), null);
});

test('tabela ausente é reconhecida e o painel não dispara a Z-API', () => {
  assert.equal(erroTabelaAusente({ code: 'PGRST205', message: 'escolta_solicitacoes' }), true);
  assert.equal(erroTabelaAusente(null), false);
  const painel = fs.readFileSync('components/SolicitacaoEscoltaModal.tsx', 'utf8');
  const formulario = fs.readFileSync('components/MissionForm.tsx', 'utf8');
  assert.equal(/send-text|send-group|z-api\.io|from\('missions'\)/.test(painel), false);
  assert.match(painel, /linkGrupoOperador/);
  assert.match(painel, /postgres_changes/);
  assert.match(formulario, /consumirPrefillSolicitacao/);
  assert.match(formulario, /import React/);
});
