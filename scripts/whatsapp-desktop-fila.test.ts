import test from 'node:test';
import assert from 'node:assert/strict';
import { montarLiberacoes } from '../lib/solicitacaoEscolta/regras.ts';
import { buildActivationOffers, rankOffers } from '../lib/providerActivationRanking.ts';
import {
  decidirTesteHomologacao,
  GRUPO_HOMOLOGACAO,
  MENSAGEM_TESTE_HOMOLOGACAO,
  envioAposConfirmacao,
  estadoDoAlvo,
  limparPesquisaEntreEnvios,
  origemPermitida,
  planejarDespacho,
  resumirEnvios,
  validarDestinatario,
  type AlvoDesktop,
} from '../lib/whatsappDesktop/fila.ts';

const inicio = Date.parse('2026-10-21T10:00:00Z');

function alvo(parcial: Partial<AlvoDesktop> & Pick<AlvoDesktop, 'id' | 'ordem'>): AlvoDesktop {
  return {
    status: 'na_fila',
    providerNome: parcial.id,
    liberarEmMs: inicio,
    grupoNome: `Grupo ${parcial.id}`,
    envioStatus: null,
    envioComandoId: null,
    ...parcial,
  };
}

test('imediata libera todos juntos e agendada libera dois agora e o resto de 10 em 10', () => {
  const imediata = montarLiberacoes(4, true, inicio);
  assert.deepEqual(imediata, [inicio, inicio, inicio, inicio]);
  const agendada = montarLiberacoes(4, false, inicio);
  assert.equal(agendada[0], inicio);
  assert.equal(agendada[1], inicio);
  assert.equal(agendada[2] - agendada[1], 10 * 60 * 1000);
  assert.equal(agendada[3] - agendada[2], 10 * 60 * 1000);
});

test('TORRES permanece na frente em São Paulo e o custo ordena o restante', () => {
  const ofertas = buildActivationOffers(
    [
      { name: 'BETA ESCOLTA', city: 'CAMPINAS', state: 'SP', status: 'Ativo' },
      { name: 'TORRES VIGILANCIA PATRIMONIAL LTDA', city: 'SAO PAULO', state: 'SP', status: 'Ativo' },
      { name: 'ALFA ESCOLTA', city: 'SANTOS', state: 'SP', status: 'Ativo' },
    ],
    [
      { provider: 'BETA ESCOLTA', operation_type: '100KM', activation_cost: 80, franchise_km: 100 },
      { provider: 'TORRES VIGILANCIA PATRIMONIAL LTDA', operation_type: '100KM', activation_cost: 200, franchise_km: 100 },
      { provider: 'ALFA ESCOLTA', operation_type: '100KM', activation_cost: 50, franchise_km: 100 },
    ],
  );
  const ordem = rankOffers(ofertas, 'SP').map((item) => item.provider);
  assert.equal(ordem[0], 'TORRES VIGILANCIA PATRIMONIAL LTDA');
  assert.deepEqual(ordem.slice(1), ['ALFA ESCOLTA', 'BETA ESCOLTA']);
});

test('só o nome exato do grupo libera o envio', () => {
  const bloqueado = validarDestinatario({
    esperado: 'ESCOLTA SERRA',
    tituloAberto: 'ESCOLTA GOIANIA',
    candidatos: ['ESCOLTA GOIANIA', 'ESCOLTA SERRA'],
  });
  assert.equal(bloqueado.ok, false);
  const primeiro = validarDestinatario({
    esperado: 'ESCOLTA SERRA',
    tituloAberto: 'ESCOLTA SERRA OFICIAL',
    candidatos: ['ESCOLTA SERRA OFICIAL'],
  });
  assert.equal(primeiro.ok, false);
  const certo = validarDestinatario({
    esperado: 'Escolta Serra',
    tituloAberto: 'ESCOLTA SERRA',
    candidatos: ['outro', 'Escolta Serra'],
  });
  assert.equal(certo.ok, true);
});

test('três grupos limpam a pesquisa entre os envios', () => {
  const passos = limparPesquisaEntreEnvios([
    'pesquisar', 'enviar',
    'pesquisar', 'enviar',
    'pesquisar', 'enviar',
  ]);
  assert.equal(passos.filter((passo) => passo === 'limpar-pesquisa').length, 2);
  assert.equal(passos.at(-1), 'enviar');
});

test('computador desligado deixa pendência e não marca envio', () => {
  const plano = planejarDespacho({
    solicitacaoStatus: 'em_andamento',
    autorizado: true,
    aplicativoConectado: false,
    agoraMs: inicio,
    texto: 'msg',
    alvos: [alvo({ id: 'a', ordem: 0 }), alvo({ id: 'b', ordem: 1, liberarEmMs: inicio + 600000 })],
  });
  assert.deepEqual(plano.enviar, []);
  assert.deepEqual(plano.pendentesSemAplicativo, ['a']);
});

test('retomada não duplica comando já executado', () => {
  const plano = planejarDespacho({
    solicitacaoStatus: 'em_andamento',
    autorizado: true,
    aplicativoConectado: true,
    agoraMs: inicio,
    texto: 'msg',
    alvos: [
      alvo({ id: 'a', ordem: 0, envioStatus: 'comando_executado', envioComandoId: 'a:1' }),
      alvo({ id: 'b', ordem: 1 }),
    ],
  });
  assert.deepEqual(plano.enviar.map((item) => item.alvoId), ['b']);
  assert.deepEqual(plano.pulados, ['a']);
});

test('dois operadores não reenfileiram quem já está enviando', () => {
  const plano = planejarDespacho({
    solicitacaoStatus: 'em_andamento',
    autorizado: true,
    aplicativoConectado: true,
    agoraMs: inicio,
    texto: 'msg',
    alvos: [alvo({ id: 'a', ordem: 0, envioStatus: 'enviando' })],
  });
  assert.deepEqual(plano.enviar, []);
});

test('agendada no instante inicial só coloca os dois primeiros na fila local', () => {
  const liberacoes = montarLiberacoes(3, false, inicio);
  const plano = planejarDespacho({
    solicitacaoStatus: 'em_andamento',
    autorizado: true,
    aplicativoConectado: true,
    agoraMs: inicio,
    texto: 'msg',
    alvos: liberacoes.map((liberarEmMs, ordem) => alvo({ id: String(ordem), ordem, liberarEmMs })),
  });
  assert.deepEqual(plano.enviar.map((item) => item.alvoId), ['0', '1']);
  assert.equal(estadoDoAlvo(alvo({ id: '2', ordem: 2, liberarEmMs: liberacoes[2] }), 'em_andamento', inicio), 'aguardando_horario');
});

test('confirmação cancela pendência e preserva comando já executado', () => {
  assert.equal(envioAposConfirmacao('comando_executado', false), 'comando_executado');
  assert.equal(envioAposConfirmacao(null, false), 'cancelado');
  assert.equal(envioAposConfirmacao(null, true), 'fornecedor_confirmado');
});

test('resumo separa executado, pendência e erro', () => {
  const resumo = resumirEnvios(['comando_executado', 'pronto_para_envio', 'falha_envio', 'destinatario_nao_validado']);
  assert.equal(resumo.executados, 1);
  assert.equal(resumo.pendencias, 1);
  assert.equal(resumo.erros, 2);
});

test('o teste de homologação exige autorização, o grupo exato e não repete', () => {
  const pronto = decidirTesteHomologacao({
    autorizar: true,
    tituloAberto: 'GRUPO TM SEG - ADM',
    candidatos: ['GRUPO TM SEG - ADM'],
    testeJaRegistrado: false,
  });
  assert.equal(pronto.enviar, true);
  assert.equal(pronto.grupo, GRUPO_HOMOLOGACAO);
  assert.match(MENSAGEM_TESTE_HOMOLOGACAO, /ATIVAÇÃO CONCLUÍDA/);
  const semAutorizacao = decidirTesteHomologacao({
    autorizar: false,
    tituloAberto: GRUPO_HOMOLOGACAO,
    candidatos: [GRUPO_HOMOLOGACAO],
    testeJaRegistrado: false,
  });
  assert.equal(semAutorizacao.enviar, false);
  const grupoErrado = decidirTesteHomologacao({
    autorizar: true,
    tituloAberto: 'OUTRO GRUPO',
    candidatos: ['OUTRO GRUPO'],
    testeJaRegistrado: false,
  });
  assert.equal(grupoErrado.enviar, false);
  const repetido = decidirTesteHomologacao({
    autorizar: true,
    tituloAberto: GRUPO_HOMOLOGACAO,
    candidatos: [GRUPO_HOMOLOGACAO],
    testeJaRegistrado: true,
  });
  assert.equal(repetido.enviar, false);
});

test('a API local só aceita a máquina e o sistema oficial', () => {
  assert.equal(origemPermitida('http://127.0.0.1:47321'), true);
  assert.equal(origemPermitida('https://sistema.grupotmseg.com.br'), true);
  assert.equal(origemPermitida('https://evil.example'), false);
  assert.equal(origemPermitida('http://192.168.0.10'), false);
});
