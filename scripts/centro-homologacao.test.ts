import assert from 'node:assert/strict';
import fs from 'node:fs';
import { before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import {
  ITENS_SIMULADOS,
  PERSISTENCIA,
  REFERENCIA_ETAPA_7,
  aplicarDecisao,
  aprovarTudoElegivel,
  calcularCenario,
  definirDestino172,
  estadoInicial,
} from '../lib/gestorFiscal/centroHomologacao';
import { AUDITORIA_CLASSE_A, atribuicaoAmbiguida, conciliarLancamentos, type LancamentoAuditado, type LeituraLancamento } from '../lib/gestorFiscal/lancamentosHomologacao';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://app.exemplo.com/gestor-fiscal',
  pretendToBeVisual: true,
});
const { window } = dom;
(globalThis as any).window = window;
(globalThis as any).document = window.document;
Object.getOwnPropertyNames(window).forEach((key) => {
  if (!(key in globalThis)) {
    try { (globalThis as any)[key] = (window as any)[key]; } catch { /* propriedade somente leitura */ }
  }
});
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let Centro: typeof import('../components/gestorFiscal/CentroHomologacao').default;
let Pagina: typeof import('../components/gestorFiscal/GestorFiscalPage').default;

before(async () => {
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  ({ default: Centro } = await import('../components/gestorFiscal/CentroHomologacao'));
  ({ default: Pagina } = await import('../components/gestorFiscal/GestorFiscalPage'));
});

function leituraIgual(item: LancamentoAuditado): LeituraLancamento {
  return {
    id: item.id,
    valorCentavos: item.valorCentavos,
    categoria: item.categoria,
    contaPagadora: item.contaPagadora,
    vencimento: item.vencimento,
    pagamento: item.pagamento,
    documento: item.documento,
    descricaoMascarada: item.descricaoMascarada,
    status: 'PAID',
    cancelado: false,
  };
}

function conciliadosIguais() {
  return conciliarLancamentos(AUDITORIA_CLASSE_A.map(leituraIgual)).itens;
}

function fontesTs(caminhos: string[]): string[] {
  return caminhos.flatMap((caminho) => {
    const stat = fs.statSync(caminho);
    if (stat.isFile()) return [caminho];
    return fs.readdirSync(caminho, { withFileTypes: true }).flatMap((entrada) => {
      const filho = `${caminho}/${entrada.name}`;
      if (entrada.isDirectory()) return entrada.name === 'node_modules' ? [] : fontesTs([filho]);
      return /\.(ts|tsx|js|mjs)$/.test(entrada.name) ? [filho] : [];
    });
  });
}

function empresa(cenario: ReturnType<typeof calcularCenario>, chave: 'TM GESTAO' | 'TM SEGURANCA' | 'TM SECURITY') {
  const linha = cenario.empresas.find((item) => item.empresa === chave);
  if (!linha) throw new Error(chave);
  return linha;
}

test('a lista simulada começa pendente e reproduz as três parcelas da etapa 7', () => {
  const estado = estadoInicial();
  const cenario = calcularCenario(estado);
  const lista = ITENS_SIMULADOS.filter((item) => item.parcela === 'lista_seguranca');
  const adicional = ITENS_SIMULADOS.filter((item) => item.parcela === 'adicional_outras');
  assert.equal(lista.reduce((t, item) => t + item.valorCentavos, 0), REFERENCIA_ETAPA_7.listaSegurancaCentavos);
  assert.equal(adicional.reduce((t, item) => t + item.valorCentavos, 0), REFERENCIA_ETAPA_7.adicionalOutrasCentavos);
  assert.equal(adicional.reduce((t, item) => t + item.valorCentavos, 0), REFERENCIA_ETAPA_7.adicionalGestaoCentavos + REFERENCIA_ETAPA_7.adicionalSecurityCentavos);
  assert.equal(cenario.grupo.resultadoCentavos, REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos);
  assert.equal(cenario.grupo.margem, 44.23);
  assert.equal(cenario.aptoCompleto, false);
  assert.equal(Object.values(estado.decisoes).every((status) => status === 'pendente'), true);
  assert.equal(ITENS_SIMULADOS.filter((item) => item.parcela === 'lista_seguranca' && item.podeAprovar).length, 0);
});

test('aprovar, rejeitar, pedir documento e desfazer ficam só na simulação', () => {
  const salario = conciliadosIguais().find((item) => item.auditoria.blocoId === 'SIM-SEG-SALARIO');
  if (!salario) throw new Error('salario');
  let estado = estadoInicial();
  const bloco = aplicarDecisao(estado, { itemId: 'SIM-SEG-SALARIO', acao: 'aprovar' });
  assert.match(bloco.erro || '', /por lançamento/);
  assert.equal(calcularCenario(bloco.estado).grupo.resultadoCentavos, REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos);

  const aprovado = aplicarDecisao(estado, { itemId: salario.auditoria.id, acao: 'aprovar' }, salario);
  estado = aprovado.estado;
  assert.equal(aprovado.erro, null);
  assert.equal(estado.decisoes[salario.auditoria.id], 'aprovada_simulada');
  assert.equal(calcularCenario(estado, [salario]).grupo.resultadoCentavos, REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos - salario.auditoria.valorCentavos);

  const repetido = aplicarDecisao(estado, { itemId: salario.auditoria.id, acao: 'aprovar' }, salario);
  assert.match(repetido.erro || '', /duas vezes/);
  assert.equal(calcularCenario(repetido.estado, [salario]).grupo.resultadoCentavos, calcularCenario(estado, [salario]).grupo.resultadoCentavos);

  const documento = aplicarDecisao(estado, { itemId: salario.auditoria.id, acao: 'pedir_documento' }, salario);
  estado = documento.estado;
  assert.equal(estado.decisoes[salario.auditoria.id], 'documentacao_solicitada');
  assert.equal(calcularCenario(estado, [salario]).listaAprovadaCentavos, 0);

  const rejeitado = aplicarDecisao(estado, { itemId: salario.auditoria.id, acao: 'rejeitar' }, salario);
  estado = rejeitado.estado;
  assert.equal(estado.decisoes[salario.auditoria.id], 'rejeitada_simulada');
  assert.equal(calcularCenario(estado, [salario]).grupo.resultadoCentavos, REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos);

  const desfeito = aplicarDecisao(estado, { itemId: salario.auditoria.id, acao: 'reverter' }, salario);
  estado = desfeito.estado;
  assert.equal(estado.decisoes[salario.auditoria.id], 'pendente');
  assert.equal(estado.historico.length, 4);
  assert.equal(aplicarDecisao(estadoInicial(), { itemId: salario.auditoria.id, acao: 'reverter' }, salario).erro !== null, true);
});

test('o cenário apto completo só fecha com as três parcelas e sem gravar classe A sozinha', () => {
  const itens = conciliadosIguais();
  const completo = calcularCenario(aprovarTudoElegivel(estadoInicial(), itens), itens);
  assert.equal(REFERENCIA_ETAPA_7.grupo.resultadoAptoCentavos + REFERENCIA_ETAPA_7.atribuicaoPendenteCentavos, REFERENCIA_ETAPA_7.grupo.resultadoElegivelCentavos);
  assert.equal(completo.listaAprovadaCentavos, 33_656_211);
  assert.equal(completo.adicionalAprovadaCentavos, 18_022);
  assert.equal(completo.grupo.despesaReconhecidaCentavos, 17_297);
  assert.equal(completo.grupo.resultadoCentavos, 447_915_905);
  assert.equal(completo.grupo.margem, 41.14);
  assert.equal(completo.aptoCompleto, false);
  assert.equal(completo.elegivelAlcancado, true);
  assert.equal(completo.diferencaParaAptoCentavos, 65_000);
  assert.equal(empresa(completo, 'TM SEGURANCA').despesaAprovadaSimuladaCentavos, 33_656_211);
  assert.equal(empresa(completo, 'TM GESTAO').despesaAprovadaSimuladaCentavos, 12_643);
  assert.equal(empresa(completo, 'TM SECURITY').despesaAprovadaSimuladaCentavos, 5_379);
  assert.equal(empresa(completo, 'TM GESTAO').receitaCentavos, REFERENCIA_ETAPA_7.empresas['TM GESTAO'].receitaCentavos);
  assert.equal(empresa(completo, 'TM SEGURANCA').custoOsCentavos, REFERENCIA_ETAPA_7.empresas['TM SEGURANCA'].custoOsCentavos);
  assert.equal(empresa(completo, 'TM SECURITY').custoOsCentavos, REFERENCIA_ETAPA_7.empresas['TM SECURITY'].custoOsCentavos);
});

test('as empresas não herdam despesa da conta e fornecedor não entra de novo', () => {
  const indefinido = aplicarDecisao(estadoInicial(), { itemId: 'SIM-INDEF-CNPJ', acao: 'aprovar' });
  assert.match(indefinido.erro || '', /conta que pagou não escolhe/);
  assert.equal(ITENS_SIMULADOS.find((item) => item.id === 'SIM-INDEF-CNPJ')?.empresa, 'INDEFINIDA');
  assert.equal(ITENS_SIMULADOS.find((item) => item.id === 'SIM-INDEF-CNPJ')?.contaPagadora, 'TM SEGURANÇA');
  assert.equal(calcularCenario(indefinido.estado).listaAprovadaCentavos, 0);

  const reconhecido = aplicarDecisao(estadoInicial(), { itemId: 'SIM-GEST-RECONHECIDO', acao: 'aprovar' });
  assert.match(reconhecido.erro || '', /duas vezes/);

  for (const id of ['SIM-REF-FORNECEDOR', 'SIM-REF-INVESTIMENTO', 'SIM-REF-TRANSFERENCIA', 'SIM-REF-TRIBUTO', 'SIM-REF-TRIBUTARIA', 'SIM-REF-CONTABIL', 'SIM-SEG-VELADA', 'SIM-SEG-CLASSE-E', 'SIM-SEG-PROVAVEL']) {
    const passo = aplicarDecisao(estadoInicial(), { itemId: id, acao: 'aprovar' });
    assert.equal(passo.erro !== null, true, id);
    const forçado = { ...passo.estado, decisoes: { ...passo.estado.decisoes, [id]: 'aprovada_simulada' as const } };
    const cenario = calcularCenario(forçado);
    assert.equal(cenario.fornecedorNoOperacionalCentavos, 0);
    assert.equal(cenario.naturezaForaNoOperacionalCentavos, 0);
    assert.equal(cenario.grupo.resultadoCentavos, REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos);
  }

  const tarifaGestao = conciliadosIguais().find((item) => item.auditoria.blocoId === 'SIM-GEST-TARIFAS');
  if (!tarifaGestao) throw new Error('tarifa gestao');
  const soGestao = aplicarDecisao(estadoInicial(), { itemId: tarifaGestao.auditoria.id, acao: 'aprovar' }, tarifaGestao).estado;
  const parcial = calcularCenario(soGestao, [tarifaGestao]);
  assert.equal(empresa(parcial, 'TM GESTAO').despesaAprovadaSimuladaCentavos, tarifaGestao.auditoria.valorCentavos);
  assert.equal(empresa(parcial, 'TM SEGURANCA').despesaAprovadaSimuladaCentavos, 0);
  assert.equal(empresa(parcial, 'TM SECURITY').despesaAprovadaSimuladaCentavos, 0);
});

test('as alternativas dos R$ 172,97 mudam só a empresa indicada', () => {
  const base = calcularCenario(estadoInicial());
  const paraSeguranca = calcularCenario(definirDestino172(estadoInicial(), 'B').estado);
  const retirado = calcularCenario(definirDestino172(estadoInicial(), 'C').estado);
  assert.equal(empresa(base, 'TM GESTAO').despesaReconhecidaCentavos, 17_297);
  assert.equal(empresa(paraSeguranca, 'TM GESTAO').despesaReconhecidaCentavos, 0);
  assert.equal(empresa(paraSeguranca, 'TM SEGURANCA').despesaReconhecidaCentavos, 17_297);
  assert.equal(paraSeguranca.grupo.resultadoCentavos, base.grupo.resultadoCentavos);
  assert.equal(retirado.grupo.resultadoCentavos, base.grupo.resultadoCentavos + 17_297);
  assert.equal(retirado.grupo.despesaReconhecidaCentavos, 0);
  assert.equal(calcularCenario(aprovarTudoElegivel(definirDestino172(estadoInicial(), 'B').estado)).aptoCompleto, false);
});

test('a consulta individual fecha 161 lançamentos e bloqueia divergência', () => {
  const fechada = conciliarLancamentos(AUDITORIA_CLASSE_A.map(leituraIgual));
  assert.equal(new Set(AUDITORIA_CLASSE_A.map((item) => item.id)).size, AUDITORIA_CLASSE_A.length);
  assert.equal(fechada.listaConciliada, 161);
  assert.equal(fechada.listaCentavos, 33_656_211);
  assert.equal(fechada.divergentes, 0);
  const amostra = AUDITORIA_CLASSE_A.find((item) => item.parcela === 'lista_seguranca');
  if (!amostra) throw new Error('amostra');
  const trocada = leituraIgual(amostra);
  trocada.valorCentavos += 1;
  const divergente = conciliarLancamentos([
    ...AUDITORIA_CLASSE_A.filter((item) => item.id !== amostra.id).map(leituraIgual),
    trocada,
  ]).itens.find((item) => item.auditoria.id === amostra.id);
  assert.equal(divergente?.podeSimularAprovacao, false);
  assert.match(divergente?.divergencias.join(' ') || '', /valor atual difere/);
  const duplicada = leituraIgual(amostra);
  const comDupla = conciliarLancamentos([duplicada, { ...duplicada }]).itens.find((item) => item.auditoria.id === amostra.id);
  assert.match(comDupla?.divergencias.join(' ') || '', /mais de uma vez/);
  const indefinido = fechada.itens.find((item) => item.auditoria.parcela === 'indefinido');
  assert.equal(indefinido?.podeSimularAprovacao, false);
  const reconhecido = fechada.itens.find((item) => item.auditoria.id === '4189cd33-4f71-4a14-8777-48f95b7d2b41');
  assert.equal(reconhecido?.podeSimularAprovacao, false);
  const fora = conciliarLancamentos([
    ...AUDITORIA_CLASSE_A.map(leituraIgual),
    { ...leituraIgual(amostra), id: 'fora-da-evidencia' },
  ]);
  assert.equal(fora.extras.length, 1);
  assert.equal(fora.listaConciliada, 161);
  assert.equal(fora.listaCentavos, 33_656_211);
  assert.equal(fora.itens.some((item) => item.auditoria.id === 'fora-da-evidencia'), false);
  assert.equal(calcularCenario(aprovarTudoElegivel(estadoInicial(), fora.itens), fora.itens).listaAprovadaCentavos, 33_656_211);
});

test('o lançamento de R$ 650,00 cita duas empresas e não se confunde com o outro', () => {
  const alvo = AUDITORIA_CLASSE_A.find((item) => item.id === 'd35e9740-bc86-4104-8a20-3ff18b7a3a29');
  const outro = AUDITORIA_CLASSE_A.find((item) => item.id === '85e8b2e3-ad0e-4646-b387-9084591fa5c2');
  if (!alvo || !outro) throw new Error('650');
  assert.notEqual(alvo.id, outro.id);
  assert.equal(alvo.valorCentavos, 65_000);
  assert.equal(outro.valorCentavos, 65_000);
  assert.notEqual(alvo.vencimento, outro.vencimento);
  assert.notEqual(alvo.contaPagadora, outro.contaPagadora);
  assert.equal(alvo.contaPagadora, 'TM SECURITY');
  assert.equal(outro.contaPagadora, 'TM SEGURANÇA');
  assert.equal(alvo.empresa, 'INDEFINIDA');
  assert.equal(alvo.podeAprovar, false);
  assert.equal(outro.parcela, 'indefinido');
  assert.equal(atribuicaoAmbiguida([alvo.descricaoMascarada]), true);
  assert.equal(atribuicaoAmbiguida(['TARIFA ITAU DA PROPRIA CONTA']), false);
  assert.equal(atribuicaoAmbiguida(['MENSALIDADE TM SEGURANCA']), false);

  const linha = conciliadosIguais().find((item) => item.auditoria.id === alvo.id);
  if (!linha) throw new Error('linha');
  assert.equal(linha.empresaPendente, true);
  assert.equal(linha.podeSimularAprovacao, false);
  assert.equal(linha.divergencias.length, 0);
  const bloqueado = aplicarDecisao(estadoInicial(), { itemId: alvo.id, acao: 'aprovar' }, linha);
  assert.match(bloqueado.erro || '', /Empresa pendente/);
  assert.equal(calcularCenario(bloqueado.estado, [linha]).grupo.resultadoCentavos, REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos);

  const documento = aplicarDecisao(estadoInicial(), { itemId: alvo.id, acao: 'pedir_documento' }, linha);
  assert.equal(documento.erro, null);
  assert.equal(documento.estado.decisoes[alvo.id], 'documentacao_solicitada');
  assert.equal(calcularCenario(documento.estado, conciliadosIguais()).adicionalAprovadaCentavos, 0);
  assert.equal(calcularCenario(documento.estado, conciliadosIguais()).grupo.resultadoCentavos, REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos);

  const tarifa = AUDITORIA_CLASSE_A.find((item) => item.blocoId === 'SIM-SEC-TARIFAS' && item.podeAprovar);
  if (!tarifa) throw new Error('tarifa');
  const preservada = conciliadosIguais().find((item) => item.auditoria.id === tarifa.id);
  assert.equal(preservada?.empresaPendente, false);
  assert.equal(preservada?.podeSimularAprovacao, true);
  assert.equal(preservada?.auditoria.empresa, 'TM SECURITY');
  const todos = conciliadosIguais();
  assert.equal(todos.filter((item) => item.empresaPendente).length, 3);
  assert.equal(todos.filter((item) => item.auditoria.parcela === 'lista_seguranca' && item.podeSimularAprovacao).length, 161);
  assert.equal(todos.filter((item) => item.auditoria.empresa === 'TM GESTAO' && item.podeSimularAprovacao).reduce((total, item) => total + item.auditoria.valorCentavos, 0), 12_643);
});

test('a tela simula as decisões e não as guarda', async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  const alvo = AUDITORIA_CLASSE_A.find((item) => item.blocoId === 'SIM-SEG-COMISSAO');
  if (!alvo) throw new Error('comissao');
  const consultar = async () => ({
    ...conciliarLancamentos([leituraIgual(alvo)]),
    lidoEm: 'teste',
    origem: 'teste',
  });
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => { root.render(React.createElement(Centro, { consultar })); });
  await React.act(async () => { await Promise.resolve(); });

  const texto = () => container.textContent || '';
  assert.match(texto(), /SIMULAÇÃO LOCAL/);
  assert.match(texto(), /não é homologação real/);
  assert.match(texto(), /R\$\s*336\.562,11/);
  assert.match(texto(), /R\$\s*830,22/);
  assert.match(texto(), /R\$\s*172,97/);
  assert.match(texto(), /R\$\s*4\.478\.509,05/);
  assert.match(texto(), /R\$\s*4\.479\.159,05/);
  assert.match(container.querySelector('[data-testid="referencia-cnpj"]')?.textContent || '', /d35e9740-bc86-4104-8a20-3ff18b7a3a29/);
  assert.match(container.querySelector('[data-testid="referencia-cnpj"]')?.textContent || '', /não está homologado/);
  assert.equal(container.querySelector('[data-persistencia="nenhuma"]') !== null, true);
  assert.match(container.querySelector('[data-testid="status-SIM-SEG-COMISSAO"]')?.textContent || '', /Pendente/);
  assert.equal(container.querySelector<HTMLButtonElement>('[data-testid="aprovar-SIM-SEG-COMISSAO"]')?.disabled, true);

  await React.act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid="abrir-SIM-SEG-COMISSAO"]')?.click();
  });
  assert.match(container.querySelector(`[data-testid="lancamento-${alvo.id}"]`)?.textContent || '', /Classe A/);
  const resultadoAntes = container.querySelector('[data-testid="resultado-simulado"]')?.textContent;
  await React.act(async () => {
    container.querySelector<HTMLButtonElement>(`[data-testid="aprovar-${alvo.id}"]`)?.click();
  });
  assert.match(container.querySelector(`[data-testid="status-${alvo.id}"]`)?.textContent || '', /Aprovação simulada/);
  assert.notEqual(container.querySelector('[data-testid="resultado-simulado"]')?.textContent, resultadoAntes);
  assert.match(container.querySelector('[data-testid="historico-simulado"]')?.textContent || '', new RegExp(alvo.id));

  await React.act(async () => {
    container.querySelector<HTMLButtonElement>(`[data-testid="reverter-${alvo.id}"]`)?.click();
  });
  assert.match(container.querySelector(`[data-testid="status-${alvo.id}"]`)?.textContent || '', /Pendente/);

  await React.act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid="rejeitar-SIM-SEG-BONUS"]')?.click();
  });
  assert.match(container.querySelector('[data-testid="status-SIM-SEG-BONUS"]')?.textContent || '', /Rejeição simulada/);

  await React.act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid="documento-SIM-SEG-VIVO"]')?.click();
  });
  assert.match(container.querySelector('[data-testid="status-SIM-SEG-VIVO"]')?.textContent || '', /Documentação pedida/);

  const aprovarFornecedor = container.querySelector<HTMLButtonElement>('[data-testid="aprovar-SIM-REF-FORNECEDOR"]');
  assert.equal(aprovarFornecedor, null);
  await React.act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid="filtros-homologacao"] button:last-child')?.click();
  });
  assert.equal(container.querySelector<HTMLButtonElement>('[data-testid="aprovar-SIM-REF-FORNECEDOR"]')?.disabled, true);
  assert.match(container.querySelector('[data-testid="item-SIM-REF-FORNECEDOR"]')?.textContent || '', /dupla contagem/);
  assert.match(container.querySelector('[data-testid="status-SIM-REF-FORNECEDOR"]')?.textContent || '', /Pendente/);
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.sessionStorage.length, 0);

  await React.act(async () => { root.unmount(); });
  container.remove();

  const outro = window.document.createElement('div');
  window.document.body.appendChild(outro);
  const raizNova = createRoot(outro);
  await React.act(async () => { raizNova.render(React.createElement(Centro)); });
  assert.match(outro.querySelector('[data-testid="historico-simulado"]')?.textContent || '', /Nenhuma decisão simulada/);
  await React.act(async () => { raizNova.unmount(); });
  outro.remove();
});

test('as sete abas continuam e o centro não entra nelas', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const leitura = renderToStaticMarkup(React.createElement(Pagina, { abaInicial: 'visao' }));
  assert.match(leitura, /Visão Geral Fiscal/);
  assert.match(leitura, /Simples × Lucro Real/);
  assert.match(leitura, /Reajuste de Fornecedores/);
  assert.match(leitura, /Reajuste de Clientes/);
  assert.match(leitura, /Gestão de Notas Fiscais/);
  assert.match(leitura, /Análise Histórica Mensal/);
  assert.match(leitura, /Termômetro de Rentabilidade/);
  assert.equal(leitura.includes('data-testid="centro-homologacao"'), false);
  assert.match(leitura, /Os CNPJs não são somados juntos/);

  const centro = renderToStaticMarkup(React.createElement(Pagina, { abaInicial: 'homologacao' }));
  assert.match(centro, /data-testid="centro-homologacao"/);
  assert.equal(centro.includes('Os CNPJs não são somados juntos'), false);

  const laboratorio = renderToStaticMarkup(React.createElement(Pagina, {
    modoInicial: 'laboratorio',
    abaInicial: 'visao',
    expandido: true,
  }));
  assert.match(laboratorio, /Receita operacional/);
  assert.match(laboratorio, /data-testid="kpi-lucro-estimado"/);
  assert.equal(laboratorio.includes('data-testid="centro-homologacao"'), false);

  const pagina = fs.readFileSync('components/gestorFiscal/GestorFiscalPage.tsx', 'utf8');
  const nucleo = fs.readFileSync('lib/gestorFiscal/centroHomologacao.ts', 'utf8');
  const tela = fs.readFileSync('components/gestorFiscal/CentroHomologacao.tsx', 'utf8');
  const canonico = fs.readFileSync('lib/missionFinancialsCanonical.ts', 'utf8');
  assert.match(pagina, /import React, \{ useEffect, useMemo, useState \} from 'react'/);
  assert.match(tela, /import React, \{ useEffect, useMemo, useState \} from 'react'/);
  const consulta = fs.readFileSync('lib/gestorFiscal/consultaHomologacao.ts', 'utf8');
  const lancamentos = fs.readFileSync('lib/gestorFiscal/lancamentosHomologacao.ts', 'utf8');
  assert.equal(consulta.includes('.insert('), false);
  assert.equal(consulta.includes('.update('), false);
  assert.equal(consulta.includes('.delete('), false);
  assert.equal(consulta.includes('localStorage'), false);
  assert.equal(consulta.includes('sessionStorage'), false);
  assert.equal(lancamentos.includes('localStorage'), false);
  assert.equal(consulta.includes('computeCanonicalRevenueCost'), false);
  assert.equal(consulta.includes('service_orders'), false);
  assert.equal(/erjhxwbutjyylxdthuuz/.test(consulta.replace('erjhxwbutjyylxdthuuz', '')), false);
  const fontes = fontesTs(['api', 'server', 'App.tsx']);
  assert.equal(fontes.some((arquivo) => fs.readFileSync(arquivo, 'utf8').includes('consultaHomologacao')), false);
  assert.equal(nucleo.includes('computeCanonicalRevenueCost'), false);
  assert.equal(tela.includes('computeCanonicalRevenueCost'), false);
  assert.equal(nucleo.includes('supabase'), false);
  assert.equal(tela.includes('supabase'), false);
  assert.equal(nucleo.includes('localStorage'), false);
  assert.equal(tela.includes('localStorage'), false);
  assert.equal(nucleo.includes('.insert('), false);
  assert.equal(nucleo.includes('classificarEmpresa'), false);
  assert.equal(/torres/i.test(nucleo + tela), false);
  assert.equal(PERSISTENCIA, 'nenhuma');
  assert.match(canonico, /export function computeCanonicalRevenueCost/);
});
