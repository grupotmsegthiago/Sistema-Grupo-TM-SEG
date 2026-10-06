import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOsActionPlanHtml, montarRelatoOs, perfilClienteOs } from '../lib/osActionPlan/buildOsActionPlanHtml';
import { interpretarLinhasPlano, textoEhRelatorioColado } from '../lib/osActionPlan/montarPlanos';
import { montarRelatorioOcorrencia, selecionarFotos } from '../lib/osActionPlan/montarRelatorio';
import { montarPromptContexto, separarRespostaIa } from '../lib/osActionPlan/redigirContexto';
import { extrairProblemaDoHtml, planoSalvoCompativel } from '../lib/osActionPlan/salvarPlanoAcao';
import { analisarOcorrencia } from '../lib/osActionPlan/analisarOcorrencia';
import { montarCroqui } from '../lib/osActionPlan/montarCroqui';
import { AVISO_MAPA_PONTOS, agruparPontos, inventarioMissao, montarAtualizacoes, resolverPosicoes, selecionarAtualizacoes } from '../lib/osActionPlan/diarioOperacional';
import { aguardarImagensDoRelatorio } from '../lib/osActionPlan/prontoParaPdf';
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
    assert.match(prompt, /OBJETIVO e da DESCRICAO/);
    assert.match(prompt, /Não transforme KM/);
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
    const trechoPlano = resolvida.split('data-secao="plano-acao"')[1]?.split('data-secao="plano-melhoria"')[0] || '';
    assert.match(trechoPlano, /Não repetem o que o sistema já lançou/);
    assert.match(trechoPlano, /atraso|Central de Monitoramento/);
    assert.doesNotMatch(trechoPlano, />Concluída</);
    assert.doesNotMatch(resolvida, /Resolução registrada na OS/);

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
    assert.match(ajustada[0].evidencia, /não comprova a conclusão/);
  });

  it('lista a ocorrência escrita na OS', () => {
    const frases = montarRelatoOs(base());
    assert.ok(frases.some((f) => f.includes('GTM-100')));
    const html = buildOsActionPlanHtml(base({
      ocorrencias: [{ quando: '2026-10-02T10:00:00.000Z', texto: 'Atraso no pátio', autor: 'Plantão', resolvida: false }],
    }));
    assert.match(html, /Atraso no pátio/);
    assert.match(html, />Proposta</);
    assert.match(html, /até 5 dias úteis/);
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

describe('análise automática do plano de ação', () => {
  const culpa = /o agente errou|o motorista causou|a central falhou/i;

  function htmlDe(parcial: Partial<OsActionPlanInput>) {
    return buildOsActionPlanHtml(base(parcial));
  }

  it('perda de contato gera identificação, central, retomada e auditoria', () => {
    const html = htmlDe({
      atrasoMinutosOrigem: null,
      ocorrencias: [{ quando: '2026-10-02T11:00:00.000Z', texto: 'Perda de contato visual com o caminhão à frente.', autor: 'Equipe', resolvida: false }],
    });
    assert.match(html, /Reconfirmar a placa/);
    assert.match(html, /Central de Monitoramento/);
    assert.match(html, /retomar a escolta/i);
    assert.match(html, /Auditar as operações seguintes/);
    assert.match(html, /Confirmar placa, modelo e motorista/);
    assert.match(html, /perdeu contato visual = perdeu a identificação positiva/);
    assert.match(html, /Não medido/);
    assert.match(html, />AC-01</);
    assert.doesNotMatch(html, /Cada linha é uma medida curta/);
    assert.doesNotMatch(html, /Confirmar o motivo da parada registrada/);
    assert.match(html, /Visto eletrônico/);
    assert.match(html, /não está aprovada para o cliente/);
    assert.equal(planoSalvoCompativel(html), true);
    assert.equal(planoSalvoCompativel('<section data-secao="resumo">AC-1 A definir após validação</section>'), false);
    assert.equal(extrairProblemaDoHtml('<div data-campo="ocorrencia-apurada"><p>Perda no pedágio com veículo semelhante.</p><p>Este texto define o objeto da análise. Não é, por si só, fato comprovado.</p></div>'), 'Perda no pedágio com veículo semelhante.');
    assert.equal(extrairProblemaDoHtml('<section>AC-1 A definir após validação</section>'), '');
    assert.doesNotMatch(html, /acompanhou outro caminhão/i);
    assert.doesNotMatch(html, culpa);
    assert.doesNotMatch(html, />Concluída</);
  });

  it('veículo incorreto gera identificação positiva sem acusar pessoa', () => {
    const html = htmlDe({
      atrasoMinutosOrigem: null,
      ocorrencias: [{ quando: '2026-10-02T11:00:00.000Z', texto: 'Acompanhamento de veículo incorreto na saída.', autor: 'Central', resolvida: false }],
    });
    assert.match(html, /identificação positiva/i);
    assert.match(html, /divergência de veículo relatada/);
    assert.match(html, /Zero nos próximos 90 dias/);
    assert.match(html, /alerta quando uma ocorrência/);
    assert.equal(html.includes('100% da equipe treinada'), false);
    assert.doesNotMatch(html, culpa);
  });

  it('atraso na origem confirmado pelos horários mantém o motivo em apuração', () => {
    const rel = montarRelatorioOcorrencia(base({ atrasoMinutosOrigem: 40, ocorrencias: [], atualizacoes: [] }));
    assert.equal(rel.analise.causa.includes('Causa confirmada do atraso'), true);
    assert.match(rel.analise.causa, /permanece em apuração/);
    assert.match(rel.planoAcao.map((l) => l.acao).join(' '), /horário programado/);
    assert.equal(rel.indicadores.every((i) => i.resultado === 'Não medido'), true);
  });

  it('desvio de rota não trata posição escrita como GPS', () => {
    const html = htmlDe({
      atrasoMinutosOrigem: null,
      ocorrencias: [{ quando: '2026-10-02T11:00:00.000Z', texto: 'Desvio de rota no trecho final.', autor: 'Equipe', resolvida: false }],
    });
    assert.match(html, /rota cadastrada/);
    assert.match(html, /não foi tratada como GPS|Posição escrita não é GPS|não é GPS/i);
    assert.doesNotMatch(html, /latitude|longitude/i);
  });

  it('ausência de evidência não cria imagem nem conclui a causa', () => {
    const html = htmlDe({
      atrasoMinutosOrigem: null,
      fotos: [],
      ocorrencias: [{ quando: '2026-10-02T11:00:00.000Z', texto: 'Sem print da saída do pátio.', autor: 'Central', resolvida: false }],
    });
    assert.match(html, /ausência/);
    assert.match(html, /Não foi possível determinar a causa raiz/);
    assert.doesNotMatch(html, /data:image/);
  });

  it('falha de comunicação não inventa o contato', () => {
    const html = htmlDe({
      atrasoMinutosOrigem: null,
      ocorrencias: [{ quando: '2026-10-02T11:00:00.000Z', texto: 'A central não foi avisada do fato.', autor: 'Equipe', resolvida: false }],
    });
    assert.match(html, /ausência/);
    assert.match(html, /Central/);
    assert.doesNotMatch(html, /ligação realizada|contato telefônico às/i);
  });

  it('ocorrência sem causa confirmada não promove o relato', () => {
    const rel = montarRelatorioOcorrencia(base({
      atrasoMinutosOrigem: null,
      ocorrencias: [{ quando: '2026-10-02T11:00:00.000Z', texto: 'Suspeita operacional ainda sem detalhe objetivo.', autor: 'Equipe', resolvida: false }],
    }));
    assert.match(rel.analise.causa, /Não foi possível determinar a causa raiz/);
    assert.equal(rel.analise.causa.includes('Causa confirmada'), false);
    assert.doesNotMatch(rel.planoAcao.map((l) => l.acao).join(' '), culpa);
  });

  it('informações divergentes ficam lado a lado', () => {
    const rel = montarRelatorioOcorrencia(base({
      atrasoMinutosOrigem: 35,
      atualizacoes: [{ quando: '2026-10-02T09:00:00.000Z', texto: 'CHEGADA SEM ATRASO, NO HORARIO', por: 'Plantão', fotoUrl: null }],
    }));
    assert.equal(rel.analise.divergencias.some((t) => /atraso/.test(t) && /Nenhuma versão foi escolhida/.test(t)), true);
  });

  it('missão sem ocorrência relevante não inventa problema', () => {
    const rel = montarRelatorioOcorrencia(base({
      atrasoMinutosOrigem: null,
      kmInicial: null,
      kmFinal: null,
      ocorrencias: [],
      atualizacoes: [{ quando: '2026-10-02T09:00:00.000Z', texto: 'Segue sem novidades', por: 'Plantão', fotoUrl: null }],
      fotos: [],
    }));
    assert.deepEqual(analisarOcorrencia(base({
      atrasoMinutosOrigem: null,
      kmInicial: null,
      kmFinal: null,
      ocorrencias: [],
      atualizacoes: [{ quando: '2026-10-02T09:00:00.000Z', texto: 'Segue sem novidades', por: 'Plantão', fotoUrl: null }],
      fotos: [],
    })).categorias, []);
    assert.match(rel.planoAcao[0].acao, /não identificaram ocorrência relevante/);
    assert.equal(rel.procedimento, null);
    assert.doesNotMatch(rel.encerramento, /Confirmar placa/);
    assert.equal(rel.indicadores[0].resultado, 'Não medido');
  });

  it('com poucos dados não inventa causa, GPS, horário de ligação nem evidência', () => {
    const rel = montarRelatorioOcorrencia(base({
      atrasoMinutosOrigem: null,
      horarioProgramado: null,
      kmInicial: null,
      kmFinal: null,
      placaCarga: null,
      placaViatura: null,
      motorista: null,
      equipe: [],
      ocorrencias: [],
      atualizacoes: [],
      fotos: [],
      linhaDoTempo: [],
    }));
    const tudo = JSON.stringify(rel);
    assert.match(rel.analise.causa, /Não foi possível determinar a causa raiz/);
    assert.doesNotMatch(tudo, /latitude|longitude|ligação realizada|velocidade de \d|o agente errou/i);
    assert.match(tudo, /não identificad/i);
    assert.equal(rel.planoAcao.every((l) => l.status === 'Proposta'), true);
  });

  it('descanso declarado não vira plano corretivo de parada', () => {
    const analise = analisarOcorrencia(base({
      atrasoMinutosOrigem: null,
      atualizacoes: [{ quando: '2026-10-02T12:00:00.000Z', texto: 'Parada para RF do condutor.', por: 'Equipe', fotoUrl: null }],
    }));
    assert.equal(analise.categorias.includes('parada'), false);
    assert.match(analise.itens.map((i) => i.descricao).join(' '), /descanso/);
  });

  it('a OS GTM-8335 entra só como dado de teste, sem regra fixa no código', () => {
    const fonte = readFileSync(new URL('../lib/osActionPlan/analisarOcorrencia.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(fonte, /GTM-8335/);
    const html = htmlDe({
      missionId: 'GTM-8335',
      atrasoMinutosOrigem: null,
      ocorrencias: [{
        quando: '2026-10-02T11:00:00.000Z',
        texto: 'Perda de contato depois do acompanhamento de veículo incorreto.',
        autor: 'Central',
        resolvida: false,
      }],
    });
    assert.match(html, /GTM-8335/);
    assert.match(html, /identificação positiva/i);
    assert.match(html, /perda de acompanhamento|perda de contato/i);
    assert.match(html, /Central de Monitoramento/);
    assert.match(html, /retomar a escolta/i);
    assert.match(html, /Auditar/);
    assert.match(html, /data-tipo="relato"/);
    assert.match(html, /data-fonte="mission_history"|data-fonte="mission_occurrences"|data-fonte="missions"/);
  });

  it('o contexto informado manda no foco e não promove velocidade nem descanso a problema', () => {
    const problema = 'Durante a passagem pelo pedágio, a equipe perdeu a identificação visual do veículo escoltado, confundiu-o com outro caminhão semelhante e prosseguiu temporariamente acompanhando o veículo incorreto até conferir a placa.';
    const entrada = base({
      missionId: 'GTM-8335',
      clientName: 'CEVA LOGISTICS',
      atrasoMinutosOrigem: null,
      problemaPrincipal: problema,
      relatoComplementar: 'Segundo a equipe, havia veículos semelhantes na praça.',
      evidenciasApuracao: [{
        tipo: 'WhatsApp',
        descricao: 'Mensagem: perdemos contato com o caminhão no pedágio.',
        origem: 'Grupo da escolta',
        quando: null,
        principal: true,
        url: null,
      }],
      atualizacoes: [
        { quando: '2026-10-02T09:49:00.000Z', texto: 'Motorista em alta velocidade, saiu a frente da escolta, equipe tentando contato.', por: 'Equipe', fotoUrl: null },
        { quando: '2026-10-02T10:10:00.000Z', texto: 'Repasse de localização do veículo.', por: 'Central', fotoUrl: null },
        { quando: '2026-10-02T11:39:00.000Z', texto: 'Reinício da viagem.', por: 'Equipe', fotoUrl: null },
        { quando: '2026-10-02T12:00:00.000Z', texto: 'Parada para RF do condutor.', por: 'Equipe', fotoUrl: null },
        { quando: '2026-10-02T08:00:00.000Z', texto: 'Segue sem novidades', por: 'Plantão', fotoUrl: null },
      ],
    });
    const analise = analisarOcorrencia(entrada);
    assert.equal(analise.categorias.includes('parada'), false);
    assert.doesNotMatch(analise.causaTexto, /velocidade/i);
    assert.equal(analise.itens.some((i) => i.tipo === 'fato_confirmado' && /pedágio|caminhão semelhante|veículo incorreto/i.test(i.descricao)), false);
    assert.match(analise.itens.map((i) => `${i.tipo} ${i.descricao}`).join('\n'), /relato[\s\S]*Evidência marcada como principal/);
    const html = buildOsActionPlanHtml({ ...entrada, geradoEm: '2026-10-05T12:00:00.000Z' });
    assert.match(html, /Relatório de Ocorrência e Plano de Ação/);
    assert.match(html, /pedágio/i);
    assert.match(html, /identificação positiva/i);
    assert.match(html, /Reconfirmar a placa/);
    assert.match(html, />AC-01</);
    assert.match(html, />MP-01</);
    assert.match(html, />MP-03</);
    assert.doesNotMatch(html, />MP-04</);
    assert.doesNotMatch(html, /alta velocidade|velocidade elevada/i);
    assert.doesNotMatch(html, /Parada para RF|parada para descanso/i);
    assert.doesNotMatch(html, /não está aprovada|Visto eletrônico|convertida em coordenada|lidas só como contexto|hipótese foi promovida|perdeu contato visual =|alerta quando|Não é, por si só, fato comprovado/i);
    assert.doesNotMatch(html, /data-secao="evidencias"|Histórico da OS:/);
    assert.doesNotMatch(html, /fato_confirmado[\s\S]{0,80}pedágio/i);
  });

  it('croqui de pedágio não inventa placa nem horário', () => {
    const problema = 'Durante a passagem pelo pedágio, a equipe perdeu a identificação visual do veículo escoltado e acompanhou temporariamente um veículo semelhante até conferir a placa.';
    const entrada = base({
      missionId: 'GTM-8335',
      placaCarga: null,
      atrasoMinutosOrigem: null,
      problemaPrincipal: problema,
      atualizacoes: [
        { quando: '2026-10-02T09:49:00.000Z', texto: 'Equipe sem contato, veículo à frente.', por: 'Equipe', fotoUrl: null },
        { quando: '2026-10-02T10:10:00.000Z', texto: 'Repasse de localização do veículo.', por: 'Central', fotoUrl: null },
      ],
    });
    const croqui = montarCroqui(entrada);
    assert.ok(croqui);
    assert.equal(croqui?.tipo, 'pedagio');
    assert.ok((croqui?.etapas.length || 0) >= 3 && (croqui?.etapas.length || 0) <= 6);
    assert.equal(croqui?.etapas.find((e) => e.id === 'pedagio')?.quando, null);
    assert.doesNotMatch(JSON.stringify(croqui), /ABC1D23|XYZ9F87|06:30|06:40|06:50/);
    assert.match(croqui?.etapas.map((e) => e.legenda).join(' ') || '', /Segundo o contexto informado/);
    const semAprovacao = buildOsActionPlanHtml(entrada);
    assert.doesNotMatch(semAprovacao, /data-secao="croqui"/);
    const html = buildOsActionPlanHtml({ ...entrada, croqui: croqui ? { ...croqui, aprovado: true } : null });
    assert.match(html, /data-secao="croqui"/);
    assert.match(html, /CROQUI ILUSTRATIVO/);
    assert.match(html, /Não representa escala/);
    assert.match(html, /Veículo da OS/);
    assert.match(html, /Veículo semelhante/);
    assert.doesNotMatch(html, /ABC1D23|XYZ9F87|06:40/);
    assert.match(html, /Barreira identificada/);
    assert.match(html, /Ocorrência apurada/);
    assert.doesNotMatch(html, /data-secao="evidencias"|Histórico da OS:|>E01</);
    assert.match(html, />Pendente</);
    assert.doesNotMatch(html, /equipe de escolta errou|foi culpada|foi negligente/i);
  });

  it('perda de contato, desvio, parada e acesso geram o croqui do caso', () => {
    assert.equal(montarCroqui(base({ problemaPrincipal: 'Durante o trajeto a equipe perdeu o acompanhamento do veículo escoltado e depois retomou.' }))?.tipo, 'perda_contato');
    const desvio = montarCroqui(base({ problemaPrincipal: 'Houve desvio de rota fora do itinerário cadastrado nesta operação.' }));
    assert.equal(desvio?.tipo, 'desvio_rota');
    assert.doesNotMatch(JSON.stringify(desvio), /latitude|longitude/i);
    assert.equal(montarCroqui(base({ problemaPrincipal: 'Houve parada não explicada no percurso durante o deslocamento.' }))?.tipo, 'parada');
    assert.equal(montarCroqui(base({ problemaPrincipal: 'Na portaria, o acesso do veículo foi interrompido para conferência.' }))?.tipo, 'acesso');
  });

  it('sem sequência suficiente o relatório segue sem croqui', () => {
    const entrada = base({ problemaPrincipal: 'Há um apontamento genérico nesta operação, sem local e sem sequência.' });
    assert.equal(montarCroqui(entrada), null);
    const html = buildOsActionPlanHtml(entrada);
    assert.doesNotMatch(html, /data-secao="croqui"/);
    assert.match(html, /Ocorrência apurada/);
  });

  it('o PDF do cliente não transfere a falha ao fornecedor', () => {
    const html = buildOsActionPlanHtml(base({
      problemaPrincipal: 'Durante o trajeto a equipe perdeu o acompanhamento do veículo escoltado.',
      fornecedor: 'EMPRESA PARCEIRA XYZ',
      tratativaTexto: 'A EMPRESA PARCEIRA XYZ errou. O fornecedor perdeu o veículo. O terceirizado confundiu o caminhão. A TM SEG foi culpada pelo ocorrido.',
    }));
    assert.doesNotMatch(html, /EMPRESA PARCEIRA XYZ/);
    assert.doesNotMatch(html, /fornecedor perdeu|terceirizado confundiu|foi culpada|erro do fornecedor/i);
    assert.match(html, /equipe de escolta/);
    assert.match(html, /Barreira identificada/);
  });
});

describe('relatório operacional da missão', () => {
  const foto = 'https://exemplo.supabase.co/storage/v1/object/public/mission-evidence/os/foto-1.jpg';
  const foto2 = 'https://exemplo.supabase.co/storage/v1/object/public/mission-evidence/os/foto-2.jpg';

  function atualizacoesDeExemplo(qtd = 3) {
    return Array.from({ length: qtd }, (_, i) => ({
      quando: `2026-10-02T${String(8 + (i % 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
      texto: i === 1
        ? 'EM VIAGEM | Rod. Régis Bittencourt, Registro-SP | veículo seguindo'
        : `Atualização operacional ${i + 1} na rodovia`,
      por: 'Operador',
      fotoUrl: i === 0 ? foto : null,
      fotos: i === 0 ? [foto, foto2] : [],
      linkMapa: i === 2 ? 'https://www.google.com/maps?q=texto-invalido' : `https://www.google.com/maps?q=-23.${10 + i},-46.${90 + i}`,
    }));
  }

  it('gera o relatório padrão com identificação, mapa e diário, sem plano de ação', () => {
    const html = buildOsActionPlanHtml(base({
      modalidade: 'padrao',
      status: 'Concluída',
      horarioFim: '2026-10-02T18:00:00.000Z',
      origem: 'Diadema/SP',
      destino: 'São José dos Pinhais/PR',
      atualizacoes: atualizacoesDeExemplo(6),
    }));
    assert.match(html, /Relatório Operacional da Missão/);
    assert.match(html, /Diadema\/SP/);
    assert.match(html, /São José dos Pinhais\/PR/);
    assert.match(html, /ATUALIZAÇÃO 01/);
    assert.match(html, /ATUALIZAÇÃO 06/);
    assert.match(html, new RegExp(foto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, /Abrir foto/);
    assert.match(html, /Sem registro fotográfico nesta atualização/);
    assert.doesNotMatch(html, /Posição não registrada|sem posição|Sem coordenada de origem|Não há posição válida|polyline/i);
    assert.match(html, new RegExp(AVISO_MAPA_PONTOS.slice(0, 40)));
    assert.match(html, /class="header"/);
    assert.match(html, /\.cartao\s*\{[^}]*width:\s*100%/);
    assert.doesNotMatch(html, /grid-template-columns:\s*44px 1fr/);
    assert.doesNotMatch(html, /data-secao="croqui"|AC-01|Plano de Ação Corretiva|maps\.googleapis|staticmap|GOOGLE_MAPS|exatamente o trajeto|Trajeto registrado pela telemetria/i);
    assert.equal(planoSalvoCompativel(html), true);
  });

  it('a foto embutida aparece no quadro e o link abre o arquivo original', () => {
    const html = buildOsActionPlanHtml(base({
      modalidade: 'padrao',
      atualizacoes: atualizacoesDeExemplo(1),
      fotoEmbutida: { [foto]: 'data:image/jpeg;base64,QUJD' },
    }));
    assert.match(html, /src="data:image\/jpeg;base64,QUJD"/);
    assert.match(html, new RegExp(`href="${foto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(html, /Abrir foto/);
  });

  it('não corta atualização quando a missão tem muitas', () => {
    const html = buildOsActionPlanHtml(base({
      modalidade: 'padrao',
      atualizacoes: atualizacoesDeExemplo(30),
    }));
    assert.match(html, /ATUALIZAÇÃO 30/);
    assert.equal((html.match(/data-atualizacao="/g) || []).length, 30);
  });

  it('no relatório com ocorrência o quadro pode ficar só no que conversa com o problema', () => {
    const entrada = base({
      modalidade: 'ocorrencia',
      escopoAtualizacoes: 'relevantes',
      problemaPrincipal: 'Durante o pedágio a equipe perdeu a identificação visual do caminhão escoltado.',
      atualizacoes: [
        { quando: '2026-10-02T08:00:00.000Z', texto: 'EM VIAGEM | posto de descanso', por: 'A', fotoUrl: null },
        { quando: '2026-10-02T09:00:00.000Z', texto: 'Equipe informa perda visual no pedágio e retomada pela placa', por: 'B', fotoUrl: null, linkMapa: 'https://www.google.com/maps?q=-23.5,-46.6' },
      ],
    });
    const escolha = selecionarAtualizacoes(entrada);
    assert.equal(escolha.lista.length, 1);
    assert.equal(escolha.lista[0].numero, 2);
    const html = buildOsActionPlanHtml(entrada);
    assert.match(html, /ATUALIZAÇÃO 02/);
    assert.match(html, /AC-01/);
    assert.match(html, /histórico interno tem 2 atualizações/);
    assert.doesNotMatch(html, /maps\.googleapis/);
  });

  it('a análise escrita pela IA entra no documento e a foto com posição não sai do quadro', () => {
    const fotoFim = 'https://exemplo.supabase.co/storage/v1/object/public/mission-evidence/os/foto-fim.jpg';
    const entrada = base({
      modalidade: 'ocorrencia',
      escopoAtualizacoes: 'relevantes',
      problemaPrincipal: 'Durante o pedágio a equipe perdeu a identificação visual do veículo escoltado.',
      narrativaIa: 'Durante o pedágio a equipe perdeu a identificação visual do veículo escoltado e retomou o acompanhamento depois de conferir a placa.\n\nOs registros mostram a saída, o repasse de posição e a entrega.',
      origemCoord: { lat: -23.6, lng: -46.5 },
      destinoCoord: { lat: -25.5, lng: -49.1 },
      atualizacoes: [
        { quando: '2026-10-02T08:00:00.000Z', texto: 'INICIO | Av. Fagundes, Diadema', por: 'A', fotoUrl: fotoFim, fotos: [fotoFim], lat: -23.6, lng: -46.5 },
        { quando: '2026-10-02T09:00:00.000Z', texto: 'Equipe informa perda visual no pedágio', por: 'B', fotoUrl: null, lat: -24.2, lng: -47.1 },
      ],
    });
    const html = buildOsActionPlanHtml(entrada);
    assert.match(html, /data-campo="analise"/);
    assert.match(html, /retomou o acompanhamento/);
    assert.match(html, /foto-fim.jpg/);
    assert.match(html, /data-secao="mapa-missao"/);
    assert.match(html, /ATUALIZAÇÃO 01/);
    assert.match(html, /ATUALIZAÇÃO 02/);
    assert.match(html, />AC-01</);
    assert.doesNotMatch(html, /data-secao="evidencias"|Histórico da OS:|Não há posição válida|Trajeto realizado/);
    const comRua = buildOsActionPlanHtml({
      ...entrada,
      mapaImagem: 'data:image/png;base64,AAAA',
      atualizacoes: entrada.atualizacoes?.map((item, i) => i === 0 ? { ...item, miniMapaImagem: 'data:image/png;base64,BBBB' } : item),
    });
    assert.match(comRua, /class="mapa-rua"/);
    assert.match(comRua, /Endereço:/);
    assert.match(comRua, /Data\/hora:/);
  });

  it('não copia o relatório interno para o cliente e resume sem atribuir culpa', () => {
    const interno = `Relatório de ocorrência operacional OS GTM-8335. CNPJ 34.349.116/0001-52. Segundo relato atribuído a Carlos Serra, a equipe seguiu temporariamente outro caminhão. Telemetria a 24 km/h. Uso restrito MR360. ${'texto interno '.repeat(40)}`;
    const html = buildOsActionPlanHtml(base({
      modalidade: 'ocorrencia',
      problemaPrincipal: 'Durante o pedágio a equipe perdeu a identificação visual do veículo escoltado.',
      relatoComplementar: interno,
      narrativaIa: interno,
    }));
    assert.match(html, /data-campo="analise"/);
    assert.match(html, /identificação visual/);
    assert.match(html, /não atribui culpa/);
    assert.doesNotMatch(html, /Carlos Serra|CNPJ|km\/h|Uso restrito|outro caminhão|texto interno texto interno/i);
  });

  it('mostra o histórico inteiro quando nada se relaciona ao problema', () => {
    const entrada = base({
      modalidade: 'ocorrencia',
      escopoAtualizacoes: 'relevantes',
      problemaPrincipal: 'Houve um fato específico que não aparece nas atualizações escritas da OS.',
      atualizacoes: atualizacoesDeExemplo(2),
    });
    const escolha = selecionarAtualizacoes(entrada);
    assert.equal(escolha.lista.length, 2);
    assert.match(String(escolha.nota), /Nenhuma atualização foi classificada/);
  });

  it('monta o diário pelos logs da missão e não inventa coordenada de link inválido', () => {
    const itens = montarAtualizacoes({
      logs: [
        { created_at: '2026-10-02T10:00:00.000Z', updated_by: 'Ana', description: 'Segue viagem', map_link: 'https://www.google.com/maps?q=-23.2,-46.8' },
        { created_at: '2026-10-02T11:00:00.000Z', updated_by: 'Ana', description: 'Sem ponto', map_link: 'https://maps.exemplo/sem-coord' },
      ],
      historico: [],
      fotos: [],
    });
    assert.equal(itens.length, 2);
    assert.equal(itens[0].lat, -23.2);
    assert.equal(itens[1].lat, null);
    const vazio = montarAtualizacoes({
      logs: [],
      historico: [{ field_name: 'current_location', new_value: 'NO PÁTIO', changed_at: '2026-10-02T07:00:00.000Z', changed_by: 'Plantão' }],
      fotos: [],
    });
    assert.equal(vazio.length, 1);
    assert.match(vazio[0].texto, /NO PÁTIO/);
  });

  it('lista o que foi encontrado antes de gerar', () => {
    const itens = inventarioMissao(base({
      status: 'Concluída',
      atualizacoes: atualizacoesDeExemplo(3),
      consultaDiario: 'CONSULTA INCOMPLETA',
    }));
    assert.ok(itens.some((item) => item.texto.includes('3 atualizações') && item.ok));
    assert.ok(itens.some((item) => /sem posição/.test(item.texto) && !item.ok));
    assert.ok(itens.some((item) => /universo completo/.test(item.texto) && !item.ok));
    assert.ok(itens.some((item) => item.texto === 'Missão concluída'));
  });

  it('a cronologia com foco ocupa a largura do card e não a coluna de 44px', () => {
    const html = buildOsActionPlanHtml(base({
      modalidade: 'ocorrencia',
      problemaPrincipal: 'Durante o pedágio a equipe perdeu a identificação visual do veículo escoltado.',
      linhaDoTempo: [{ quando: '2026-10-02T08:12:00.000Z', status: 'Em Viagem', por: 'Operador' }],
      ocorrencias: [{ quando: '2026-10-02T09:00:00.000Z', texto: 'Perda de identificação visual no pedágio.', autor: 'Central', resolvida: false }],
    }));
    assert.match(html, /<article class="cartao"><div class="quem">/);
    assert.match(html, /class="trilha"/);
    assert.doesNotMatch(html, /grid-template-columns:\s*44px 1fr/);
    assert.match(html, /\.cartao\s*\{[^}]*width:\s*100%/);
    assert.match(html, /class="header"/);
    assert.match(html, /class="faixa"/);
  });

  it('resolve coordenada do link antes do endereço e agrupa o mesmo ponto', async () => {
    let consultas = 0;
    const resultado = await resolverPosicoes({
      atualizacoes: [
        { quando: '2026-10-02T08:00:00.000Z', texto: 'INICIO | Av. Fagundes de Oliveira, 1580, Diadema - SP', por: 'Central', fotoUrl: null },
        { quando: '2026-10-02T09:00:00.000Z', texto: 'SEGUE | Rod. Régis Bittencourt, Registro - SP', por: 'Central', fotoUrl: null, linkMapa: 'https://www.google.com/maps?q=-24.5,-47.8' },
        { quando: '2026-10-02T10:00:00.000Z', texto: 'REINICIO | Rod. Régis Bittencourt, Registro - SP', por: 'Central', fotoUrl: null, linkMapa: 'https://www.google.com/maps?q=-24.5,-47.8' },
      ],
      origem: 'Av. Fagundes de Oliveira, 1580, Diadema - SP',
      destino: 'São José dos Pinhais - PR',
      linkAtualMissao: 'https://www.google.com/maps?q=-25.49,-49.15',
      geocodificar: async (endereco) => {
        consultas += 1;
        if (/FAGUNDES/.test(endereco)) return { lat: -23.7, lng: -46.6 };
        if (/SÃO JOSÉ|SAO JOSE/.test(endereco)) return { lat: -25.53, lng: -49.2 };
        return null;
      },
    });
    assert.equal(resultado.atualizacoes[1].lat, -24.5);
    assert.equal(resultado.atualizacoes[0].lat, -23.7);
    assert.equal(resultado.origemCoord?.lat, -23.7);
    assert.equal(resultado.destinoCoord?.lat, -25.53);
    assert.ok(consultas <= 3);
    const grupos = agruparPontos([
      { lat: -24.5, lng: -47.8, rotulo: '2' },
      { lat: -24.5, lng: -47.8, rotulo: '3' },
    ]);
    assert.equal(grupos.length, 1);
    assert.equal(grupos[0].rotulo, '2·3');
    const html = buildOsActionPlanHtml(base({
      modalidade: 'padrao',
      origemCoord: resultado.origemCoord,
      destinoCoord: resultado.destinoCoord,
      atualizacoes: resultado.atualizacoes,
      diagnosticoMapa: resultado.diagnostico,
    }));
    assert.match(html, /Origem — Cajamar - SP|Origem —/);
    assert.match(html, />A·1<|>A</);
    assert.match(html, />B</);
    assert.match(html, /class="mini-mapa/);
    assert.match(html, /Atualização 01/);
    assert.match(html, /Data\/hora:/);
    assert.match(html, /Endereço:/);
    assert.doesNotMatch(html, /polyline|Não há posição válida|sem posição|data-secao="evidencias"|Histórico da OS:/i);
  });

  it('não abre o PDF enquanto uma imagem do relatório não carregou', async () => {
    const carregada = { complete: true, naturalWidth: 120, addEventListener: () => undefined };
    const quebrada = { complete: true, naturalWidth: 0, addEventListener: () => undefined };
    const ok = await aguardarImagensDoRelatorio({ images: [carregada], fonts: { ready: Promise.resolve() } });
    const falha = await aguardarImagensDoRelatorio({ images: [carregada, quebrada], fonts: { ready: Promise.resolve() } });
    assert.equal(ok.ok, true);
    assert.equal(falha.ok, false);
    assert.match(falha.aviso, /1 imagem/);
  });
});

