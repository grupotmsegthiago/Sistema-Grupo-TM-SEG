import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOsActionPlanHtml, montarRelatoOs, perfilClienteOs } from '../lib/osActionPlan/buildOsActionPlanHtml';
import { interpretarLinhasPlano, textoEhRelatorioColado } from '../lib/osActionPlan/montarPlanos';
import { montarRelatorioOcorrencia, selecionarFotos } from '../lib/osActionPlan/montarRelatorio';
import { montarPromptContexto, separarRespostaIa } from '../lib/osActionPlan/redigirContexto';
import type { OsActionPlanInput } from '../lib/osActionPlan/types';

function base(parcial: Partial<OsActionPlanInput> = {}): OsActionPlanInput {
  return {
    missionId: 'GTM-100',
    clientName: 'TRANSPORTES EXEMPLO LTDA',
    cadastro: {
      razao: 'TRANSPORTES EXEMPLO LTDA',
      fantasia: 'EXEMPLO',
      cnpj: '00.000.000/0001-00',
      cidade: 'Cajamar',
      uf: 'SP',
      contato: 'Operação',
      telefone: '11999990000',
    },
    status: 'Em Viagem',
    tipo: 'Caracterizada',
    operacaoEspecial: null,
    fornecedor: 'FORNECEDOR TESTE',
    origem: 'Cajamar - SP',
    destino: 'Rio de Janeiro - RJ',
    placaCarga: 'ABC1D23',
    modeloCarga: 'Truck',
    placaViatura: 'XYZ9A87',
    modeloViatura: 'Spin',
    motorista: 'Condutor Teste',
    equipe: ['Agente Um', 'Agente Dois'],
    grEspelhamento: 'GR-1',
    seNumber: null,
    smNumber: null,
    referenceNumber: null,
    horarioProgramado: '2026-10-02T08:00:00.000Z',
    horarioFim: null,
    kmInicial: '100 km',
    kmFinal: null,
    criadoEm: '2026-10-01T12:00:00.000Z',
    atrasoMinutosOrigem: 12,
    linhaDoTempo: [{ quando: '2026-10-02T08:12:00.000Z', status: 'Origem', por: 'Operador' }],
    ocorrencias: [],
    fotos: [],
    atualizacoes: [],
    historicoCliente: [],
    contaCliente: { estado: 'NÃO CARREGADO', total: null, caracterizada: null, velada: null, desde: null },
    tratativaTexto: null,
    narrativaIa: null,
    tratativaIa: null,
    fotosTratativa: [],
    horaInicialFornecedor: null,
    horaFinalFornecedor: null,
    kmInicialFornecedor: null,
    kmFinalFornecedor: null,
    geradoEm: '2026-10-02T15:00:00.000Z',
    ...parcial,
  };
}

describe('plano de ação por OS', () => {
  it('identifica o perfil pelo nome do cliente', () => {
    assert.equal(perfilClienteOs('DHL SUPPLY CHAIN'), 'dhl');
    assert.equal(perfilClienteOs('CEVA LOGISTICS'), 'ceva');
    assert.equal(perfilClienteOs('CESARI'), 'ceslog');
    assert.equal(perfilClienteOs('VTC LOG'), 'vtc');
    assert.equal(perfilClienteOs('TRANSPORTES EXEMPLO'), 'geral');
  });

  it('monta o relato com os fatos desta OS e sem texto pronto da DHL', () => {
    const html = buildOsActionPlanHtml(base());
    assert.match(html, /GTM-100/);
    assert.match(html, /TRANSPORTES EXEMPLO LTDA/);
    assert.match(html, /Cajamar - SP/);
    assert.match(html, /ABC1D23/);
    assert.match(html, /Agente Um/);
    assert.match(html, /Agente Dois/);
    assert.doesNotMatch(html, /PA-GTM-100/);
    assert.doesNotMatch(html, /KM final do fornecedor/i);
    assert.doesNotMatch(html, /KM inicial do fornecedor/i);
    assert.match(html, /Objetivo do documento/);
    assert.match(html, /Resumo dos fatos e conclusão/);
    assert.match(html, /O presente relatório tem por objetivo/);
    assert.match(html, /Preliminarmente/);
    assert.match(html, /não determina, por si só/);
    assert.doesNotMatch(html, /O que: escolta/);
    assert.match(html, /Hodômetro inicial/);
    assert.match(html, /Plano de Melhoria/);
    assert.match(html, /Pendências para conclusão/);
    assert.match(html, /data-secao="encerramento"/);
    assert.match(html, /text-transform: lowercase/);
    assert.doesNotMatch(html, /Fonte no sistema/);
    assert.doesNotMatch(html, /O hodômetro registrado é/);
    assert.match(html, /text-transform: uppercase/);
    assert.match(html, /12 minuto\(s\)/);
    assert.match(html, /Não há ocorrência formal lançada nesta OS/);
    assert.match(html, /Plano de Ação e Justificativa de Ocorrência/);
    assert.match(html, /class="visto">VISTO/);
    assert.doesNotMatch(html, /FOXCONN/);
    assert.doesNotMatch(html, /comunicação com a DHL/);
    assert.doesNotMatch(html, /R\$/);
  });

  it('mostra a S.E. quando a OS é DHL e não substitui o documento oficial', () => {
    const html = buildOsActionPlanHtml(base({
      clientName: 'DHL SUPPLY CHAIN',
      seNumber: 'SE-183013',
      cadastro: null,
    }));
    assert.match(html, /SE-183013/);
    assert.match(html, /botão próprio/);
    assert.doesNotMatch(html, /padrão de qualidade exigido pela operação DHL/);
  });

  it('mostra a referência quando a OS é CESLOG', () => {
    const html = buildOsActionPlanHtml(base({
      clientName: 'CESLOG',
      referenceNumber: 'REF-77',
    }));
    assert.match(html, /REF-77/);
    assert.match(html, /CESLOG\/CESARI/);
  });

  it('mostra a timeline em uma linha, a descrição da IA e o gráfico da conta', () => {
    const html = buildOsActionPlanHtml(base({
      atualizacoes: [{ quando: '2026-10-02T09:00:00.000Z', texto: 'EQUIPE NO PÁTIO', por: 'Plantão', fotoUrl: null }],
      narrativaIa: 'A equipe chegou ao pátio no horário acompanhado pela central.',
      tratativaIa: 'A TM SEG segue tratando o assunto com o fornecedor, em regime de 24 horas.',
      contaCliente: { estado: 'ENCONTRADO', total: 20, caracterizada: 14, velada: 6, desde: '2024-03-12T10:00:00.000Z' },
      fotosTratativa: [{ legenda: 'WhatsApp', url: 'data:image/png;base64,aaa' }],
    }));
    assert.doesNotMatch(html, /EQUIPE NO PÁTIO/);
    assert.match(html, /Cronologia da ocorrência/);
    assert.match(html, /A equipe chegou ao pátio/);
    assert.match(html, /regime de 24 horas/);
    assert.match(html, /Total de missões/);
    assert.match(html, /Caracterizada/);
    assert.match(html, /Velada/);
    assert.match(html, />20</);
    assert.doesNotMatch(html, /Histórico recente deste cliente/);
    assert.doesNotMatch(html, /cliente avisou no grupo/);
    assert.doesNotMatch(html, /R\$/);
  });

  it('o prompt da IA pede para não inventar fato', () => {
    const prompt = montarPromptContexto('OS GTM-100', 'print do grupo');
    assert.match(prompt, /Não invente/);
    assert.match(prompt, /print do grupo/);
    assert.match(prompt, /GTM-100/);
    assert.match(prompt, /A definir após validação/);
    assert.match(prompt, /DESCRICAO:/);
    assert.match(prompt, /concordância/);
    assert.doesNotMatch(prompt, /FOXCONN/);
    const partes = separarRespostaIa('DESCRICAO:\nRelato curto.\n\nTRATATIVA:\nSeguimos tratando.');
    assert.equal(partes.descricao, 'Relato curto.');
    assert.equal(partes.tratativa, 'Seguimos tratando.');
  });

  it('não marca conclusão sem comprovante e apura atualização sem ocorrência formal', () => {
    const resolvida = buildOsActionPlanHtml(base({
      ocorrencias: [{ quando: '2026-10-02T10:00:00.000Z', texto: 'Pátio liberado', autor: 'Plantão', resolvida: true }],
    }));
    assert.match(resolvida, />Concluída</);
    assert.match(resolvida, /Resolução registrada na OS/);

    const soAtualizacao = buildOsActionPlanHtml(base({
      atualizacoes: [{ quando: '2026-10-02T09:00:00.000Z', texto: 'EQUIPE PARADA NO PÁTIO', por: 'Plantão', fotoUrl: null }],
      ocorrencias: [],
    }));
    assert.doesNotMatch(soAtualizacao, /Apurar a atualização registrada/);
    assert.doesNotMatch(soAtualizacao, /EQUIPE PARADA NO PÁTIO/);
    assert.match(soAtualizacao, /A apuração segue pendente de confirmação/);
    assert.doesNotMatch(soAtualizacao, />Concluída</);

    const ajustada = interpretarLinhasPlano(
      'Encerrar o caso | Central | 02/10/2026 | Concluída | Print inexistente',
      'os gtm-100 atraso no pátio',
      false,
    );
    assert.equal(ajustada[0].status, 'Proposta');
    assert.equal(ajustada[0].prazo, 'A definir após validação');
    assert.match(ajustada[0].evidencia, /não há comprovante de conclusão/);
  });

  it('lista a ocorrência escrita na OS', () => {
    const frases = montarRelatoOs(base());
    assert.ok(frases.some((f) => f.includes('GTM-100')));
    const html = buildOsActionPlanHtml(base({
      ocorrencias: [{ quando: '2026-10-02T10:00:00.000Z', texto: 'Atraso no pátio', autor: 'Plantão', resolvida: false }],
    }));
    assert.match(html, /Atraso no pátio/);
    assert.match(html, />Proposta</);
    assert.match(html, /A definir após validação/);
    assert.match(html, /Evidência de conclusão/);
    assert.doesNotMatch(html, />Concluída</);

    const relatorioAntigo = `PLANO DE AÇÃO E JUSTIFICATIVA\nDocumento GTM-100\nHistórico da conta\n${'texto copiado '.repeat(40)}`;
    assert.equal(textoEhRelatorioColado(relatorioAntigo), true);
    const copiado = buildOsActionPlanHtml(base({
      atualizacoes: [
        { quando: '2026-10-02T09:00:00.000Z', texto: 'Segue sem novidades', por: 'Plantão', fotoUrl: null },
        { quando: '2026-10-02T09:10:00.000Z', texto: 'Equipe na origem', por: 'Plantão', fotoUrl: null },
        { quando: '2026-10-02T09:20:00.000Z', texto: relatorioAntigo, por: 'Plantão', fotoUrl: null },
      ],
      tratativaTexto: relatorioAntigo,
    }));
    assert.doesNotMatch(copiado, /Apurar a atualização registrada/);
    assert.doesNotMatch(copiado, /texto copiado texto copiado/);
    assert.doesNotMatch(copiado, /Segue sem novidades/);
    assert.match(copiado, /não foi copiado para as células/);
    const rel = montarRelatorioOcorrencia(base({
      planoAcaoIa: `${relatorioAntigo}\nValidar algo | Central | prazo | Proposta | Pendente de confirmação`,
      narrativaIa: relatorioAntigo,
    }));
    assert.ok(rel.planoAcao.every((l) => l.acao.length < 180));
    assert.equal(rel.planoAcao.some((l) => /texto copiado|plano de ação/i.test(l.acao)), false);
    assert.doesNotMatch(rel.resumo, /texto copiado/);
    assert.notEqual(rel.objetivo, rel.resumo);
    const trechoAcao = copiado.split('data-secao="plano-acao"')[1]?.split('data-secao="plano-melhoria"')[0] || '';
    assert.doesNotMatch(trechoAcao, /texto copiado/);
    assert.doesNotMatch(trechoAcao, /Resumo da ocorrência/);
  });

  it('mostra no máximo seis fotos, com a primeira e a última, no mesmo quadrado', () => {
    const fotos = Array.from({ length: 8 }, (_, i) => ({
      legenda: `Tela ${i}`,
      url: `https://exemplo.test/foto-${i}.jpg`,
      quando: `2026-10-0${i + 1}T12:00:00.000Z`,
      local: `Local ${i}`,
    }));
    const escolhidas = selecionarFotos(fotos, 6);
    assert.equal(escolhidas.length, 6);
    assert.equal(escolhidas[0].legenda, 'Tela 0');
    assert.equal(escolhidas[5].legenda, 'Tela 7');
    const html = buildOsActionPlanHtml(base({ fotos }));
    assert.match(html, /fotos-pagina/);
    assert.match(html, /class="quadro"/);
    assert.match(html, /Tela 0/);
    assert.match(html, /Tela 7/);
    assert.match(html, /Local 0/);
    assert.match(html, /Local 7/);
    assert.equal(html.match(/class="quadro"/g)?.length, 6);
    assert.doesNotMatch(html, /Tela 2/);
  });

  it('não altera o gerador nem o acesso do plano DHL', () => {
    const handler = readFileSync(new URL('../api/dhl/occurrence-report.ts', import.meta.url), 'utf8');
    const htmlDhl = readFileSync(new URL('../lib/dhlOccurrenceReport/buildFullReportHtml.ts', import.meta.url), 'utf8');
    const acesso = readFileSync(new URL('../lib/services/dhlOccurrenceReportAccess.ts', import.meta.url), 'utf8');
    const modal = readFileSync(new URL('../components/UpdateMissionModal.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(handler, /osActionPlan/);
    assert.match(htmlDhl, /Operação FOXCONN \/ Apple — DHL Supply Chain/);
    assert.match(acesso, /diretoria/);
    assert.match(modal, /button-open-dhl-occurrence-report/);
    assert.match(modal, /Gerar Plano de Ação DHL \(PDF\)/);
  });
});
