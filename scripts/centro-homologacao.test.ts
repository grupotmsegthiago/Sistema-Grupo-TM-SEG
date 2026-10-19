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
  assert.equal(ITENS_SIMULADOS.filter((item) => item.podeAprovar).length, 17);
});

test('aprovar, rejeitar, pedir documento e desfazer ficam só na simulação', () => {
  let estado = estadoInicial();
  const aprovado = aplicarDecisao(estado, { itemId: 'SIM-SEG-SALARIO', acao: 'aprovar' });
  estado = aprovado.estado;
  assert.equal(aprovado.erro, null);
  assert.equal(estado.decisoes['SIM-SEG-SALARIO'], 'aprovada_simulada');
  assert.equal(calcularCenario(estado).grupo.resultadoCentavos, REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos - 12_711_884);

  const repetido = aplicarDecisao(estado, { itemId: 'SIM-SEG-SALARIO', acao: 'aprovar' });
  assert.match(repetido.erro || '', /duas vezes/);
  assert.equal(calcularCenario(repetido.estado).grupo.resultadoCentavos, calcularCenario(estado).grupo.resultadoCentavos);

  const documento = aplicarDecisao(estado, { itemId: 'SIM-SEG-BONUS', acao: 'pedir_documento' });
  estado = documento.estado;
  assert.equal(estado.decisoes['SIM-SEG-BONUS'], 'documentacao_solicitada');
  assert.equal(calcularCenario(estado).listaAprovadaCentavos, 12_711_884);

  const rejeitado = aplicarDecisao(estado, { itemId: 'SIM-SEG-SALARIO', acao: 'rejeitar' });
  estado = rejeitado.estado;
  assert.equal(estado.decisoes['SIM-SEG-SALARIO'], 'rejeitada_simulada');
  assert.equal(calcularCenario(estado).grupo.resultadoCentavos, REFERENCIA_ETAPA_7.grupo.resultadoPainelCentavos);

  const desfeito = aplicarDecisao(estado, { itemId: 'SIM-SEG-SALARIO', acao: 'reverter' });
  estado = desfeito.estado;
  assert.equal(estado.decisoes['SIM-SEG-SALARIO'], 'pendente');
  assert.equal(estado.historico.length, 4);
  assert.equal(aplicarDecisao(estadoInicial(), { itemId: 'SIM-SEG-SALARIO', acao: 'reverter' }).erro !== null, true);
});

test('o cenário apto completo só fecha com as três parcelas e sem gravar classe A sozinha', () => {
  const completo = calcularCenario(aprovarTudoElegivel(estadoInicial()));
  assert.equal(completo.listaAprovadaCentavos, 33_656_211);
  assert.equal(completo.adicionalAprovadaCentavos, 83_022);
  assert.equal(completo.grupo.despesaReconhecidaCentavos, 17_297);
  assert.equal(completo.grupo.resultadoCentavos, 447_850_905);
  assert.equal(completo.grupo.margem, 41.14);
  assert.equal(completo.aptoCompleto, true);
  assert.equal(empresa(completo, 'TM SEGURANCA').despesaAprovadaSimuladaCentavos, 33_656_211);
  assert.equal(empresa(completo, 'TM GESTAO').despesaAprovadaSimuladaCentavos, 12_643);
  assert.equal(empresa(completo, 'TM SECURITY').despesaAprovadaSimuladaCentavos, 70_379);
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

  const soGestao = aplicarDecisao(estadoInicial(), { itemId: 'SIM-GEST-TARIFAS', acao: 'aprovar' }).estado;
  const parcial = calcularCenario(soGestao);
  assert.equal(empresa(parcial, 'TM GESTAO').despesaAprovadaSimuladaCentavos, 12_643);
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

test('a tela simula as decisões e não as guarda', async () => {
  window.localStorage.clear();
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => { root.render(React.createElement(Centro)); });

  const texto = () => container.textContent || '';
  assert.match(texto(), /SIMULAÇÃO LOCAL/);
  assert.match(texto(), /identificadores SIM-\* são fictícios/);
  assert.match(texto(), /R\$\s*336\.562,11/);
  assert.match(texto(), /R\$\s*830,22/);
  assert.match(texto(), /R\$\s*172,97/);
  assert.match(texto(), /R\$\s*4\.478\.509,05/);
  assert.equal(container.querySelector('[data-persistencia="nenhuma"]') !== null, true);
  assert.match(container.querySelector('[data-testid="status-SIM-SEG-COMISSAO"]')?.textContent || '', /Pendente/);

  const resultadoAntes = container.querySelector('[data-testid="resultado-simulado"]')?.textContent;
  await React.act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid="aprovar-SIM-SEG-COMISSAO"]')?.click();
  });
  assert.match(container.querySelector('[data-testid="status-SIM-SEG-COMISSAO"]')?.textContent || '', /Aprovação simulada/);
  assert.notEqual(container.querySelector('[data-testid="resultado-simulado"]')?.textContent, resultadoAntes);
  assert.match(container.querySelector('[data-testid="historico-simulado"]')?.textContent || '', /SIM-SEG-COMISSAO/);

  await React.act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid="reverter-SIM-SEG-COMISSAO"]')?.click();
  });
  assert.match(container.querySelector('[data-testid="status-SIM-SEG-COMISSAO"]')?.textContent || '', /Pendente/);

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
  assert.match(tela, /import React, \{ useMemo, useState \} from 'react'/);
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
