import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRAZO_COTACAO_MS, cotacaoSelecionavel } from '../lib/precificacao/tabela2027';
import { rotuloValidade } from '../lib/portalCliente/historicoCotacoes';
import { listarHistoricoCotacoes } from '../lib/portalCliente/cotacaoHttp';
import {
  cartaEmailCotacao,
  decisaoExcluir,
  decisaoInativar,
  COPIA_FIXA_COTACAO,
  montarDestinatariosEnvio,
  pdfAnexoAceito,
  mostrarDesativarCotacao,
  mostrarExcluirCotacao,
  podeEnviarCotacao,
  podeGerirCotacao,
  registroAuditoriaCotacao,
  textoHoraExtra,
  textoTarifaKm,
} from '../lib/portalCliente/gestaoCotacao';
import { indiceNaRota, rotuloCidadeUf, rotuloMarcaTransito, textoTempoMonitor } from '../lib/portalCliente/rotaCotacao';
import QuoteCalculatorCard from '../components/precificacao/QuoteCalculatorCard';

const AGORA = new Date('2026-10-26T15:00:00.000Z');
const admin = { nome: 'Thiago Moreira', email: 'thiago@grupotmseg.com.br', perfil: 'Administrador' };
const analista = { nome: 'Ana', email: 'ana@cliente.com', perfil: 'analista', portalCliente: 'CEVA' };
const cotacao = {
  id: 'q-1',
  client_name: 'CEVA LOGISTICS LTDA',
  created_by: 'Ana',
  solicitanteEmail: 'ana@cliente.com',
  status: 'Enviada',
  is_active: true,
  origin: 'Salvador, BA',
  destination: 'São Paulo, SP',
  total_km: 1985.3,
  total_value: 19885,
};

describe('gestão da cotação', () => {
  it('mostra a tarifa unitária e trata inativa fora da seleção', () => {
    assert.equal(textoTarifaKm(8.3).replace(/\u00a0/g, ' '), 'R$ 8,30/km');
    assert.equal(textoHoraExtra(207.5).replace(/\u00a0/g, ' '), 'R$ 207,50/h');
    assert.equal(textoTarifaKm(null), '—');
    const inativa = { created_at: AGORA.toISOString(), status: 'Inativa', is_active: false };
    assert.equal(rotuloValidade(inativa, AGORA).rotulo, 'Inativa');
    assert.equal(rotuloValidade(inativa, AGORA).tom, 'inativa');
    assert.equal(cotacaoSelecionavel(inativa, AGORA), false);
    const ativa = { created_at: new Date(AGORA.getTime() - PRAZO_COTACAO_MS).toISOString(), status: 'Enviada', is_active: true };
    assert.equal(cotacaoSelecionavel(ativa, AGORA), true);
  });

  it('desativa para usuário interno e exclui só a diretoria', () => {
    const operacional = { nome: 'Operação', email: 'op@grupotmseg.com.br', perfil: 'Operacional' };
    const diretoria = { ...admin, perfil: 'Diretoria' };
    assert.equal(decisaoInativar(admin, cotacao).ok, true);
    assert.equal(decisaoInativar(operacional, cotacao).ok, true);
    const portal = decisaoInativar(analista, cotacao);
    assert.equal(portal.ok, false);
    if (portal.ok) return;
    assert.equal(portal.status, 403);
    assert.equal(decisaoExcluir(diretoria, cotacao).ok, true);
    const adminExclui = decisaoExcluir(admin, cotacao);
    assert.equal(adminExclui.ok, false);
    if (adminExclui.ok) return;
    assert.equal(adminExclui.status, 403);
    const autorExclui = decisaoExcluir(analista, cotacao);
    assert.equal(autorExclui.ok, false);
    const virada = decisaoInativar(admin, { ...cotacao, converted_to_order_id: 'OS-9' });
    assert.equal(virada.ok, false);
    if (virada.ok) return;
    assert.equal(virada.status, 409);
    assert.equal(decisaoExcluir(admin, null).ok, false);
    assert.equal(mostrarDesativarCotacao(operacional, cotacao), true);
    assert.equal(mostrarDesativarCotacao(analista, cotacao), false);
    assert.equal(mostrarDesativarCotacao(diretoria, { ...cotacao, is_active: false, status: 'Inativa' }), false);
    assert.equal(mostrarExcluirCotacao(diretoria, cotacao), true);
    assert.equal(mostrarExcluirCotacao(admin, cotacao), false);
    assert.equal(podeGerirCotacao(diretoria, cotacao), true);
    const log = registroAuditoriaCotacao({ acao: 'cotacao_excluir', ator: diretoria, cotacao });
    assert.equal(log.action_type, 'cotacao_excluir');
    assert.equal(log.entity, 'quotes');
  });

  it('aceita o PDF da proposta no anexo e monta a carta', () => {
    const pdf = Buffer.from(`%PDF-1.4\n${' '.repeat(80)}\n%%EOF`).toString('base64');
    const aceito = pdfAnexoAceito(`data:application/pdf;base64,${pdf}`);
    assert.equal(aceito.ok, true);
    const comNome = pdfAnexoAceito(`data:application/pdf;filename=generated.pdf;base64,${pdf}`);
    assert.equal(comNome.ok, true);
    if (comNome.ok) assert.equal(comNome.base64.startsWith('JVBERi'), true);
    const texto = Buffer.from('isto não é pdf '.repeat(8)).toString('base64');
    const recusado = pdfAnexoAceito(texto);
    assert.equal(recusado.ok, false);
    const destinos = montarDestinatariosEnvio({
      selecionados: 'cliente@ceva.com, financeiro@ceva.com',
      autor: 'operador@grupotmseg.com.br',
    });
    assert.equal(destinos.ok, true);
    if (destinos.ok) {
      assert.equal(destinos.para, 'cliente@ceva.com');
      assert.deepEqual(destinos.copias, ['financeiro@ceva.com', COPIA_FIXA_COTACAO, 'operador@grupotmseg.com.br']);
    }
    const repetido = montarDestinatariosEnvio({ selecionados: COPIA_FIXA_COTACAO, autor: COPIA_FIXA_COTACAO });
    assert.equal(repetido.ok, true);
    if (repetido.ok) assert.deepEqual(repetido.copias, []);
    const carta = cartaEmailCotacao({ origem: 'Salvador, BA', destino: 'São Paulo, SP', km: 1985.3, valor: 19885 });
    assert.match(carta, /Salvador, BA/);
    assert.match(carta, /pedágio é cobrado à parte/i);
    assert.equal(podeEnviarCotacao(analista, cotacao), true);
    assert.equal(podeEnviarCotacao(analista, { ...cotacao, client_name: 'OUTRA EMPRESA' }), false);
    assert.equal(podeEnviarCotacao(admin, { ...cotacao, status: 'Excluida' }), false);
  });

  it('esconde a cotação excluída da lista e mostra a tarifa no card', async () => {
    const linhas = [
      { id: 'viva', client_id: 7, client_name: 'CEVA', origin: 'A', destination: 'B', total_km: 10, total_hours: 3, total_value: 100, created_at: '2026-10-26T12:00:00Z', created_by: 'Ana', status: 'Enviada', is_active: true, contract_details: null },
      { id: 'fora', client_id: 7, client_name: 'CEVA', origin: 'C', destination: 'D', total_km: 20, total_hours: 3, total_value: 200, created_at: '2026-10-26T11:00:00Z', created_by: 'Ana', status: 'Excluida', is_active: false, contract_details: null },
    ];
    const sb = {
      from() {
        const api = {
          select() { return api; },
          eq() { return api; },
          order() { return api; },
          range() { return Promise.resolve({ data: linhas, error: null }); },
        };
        return api;
      },
    };
    const lista = await listarHistoricoCotacoes(sb, { id: 7, name: 'CEVA' }, 0);
    assert.equal(lista.status, 200);
    if (!('cotacoes' in lista.corpo)) return;
    assert.deepEqual(lista.corpo.cotacoes.map((item) => item.id), ['viva']);
    const html = renderToStaticMarkup(React.createElement(QuoteCalculatorCard, {
      cliente: 'CEVA LOGISTICS',
      origem: 'Salvador, BA',
      destino: 'São Paulo, SP',
      km: '1985.3',
      onOrigem: () => undefined,
      onDestino: () => undefined,
      onKm: () => undefined,
      tarifaKm: 8.3,
      horaExtra: 207.5,
      ocultarCampos: true,
    }));
    assert.match(html, /Tarifa:/);
    assert.match(html, /8,30/);
    const ceva = renderToStaticMarkup(React.createElement(QuoteCalculatorCard, {
      cliente: 'CEVA LOGISTICS LTDA',
      versao: '2027',
      origem: 'Salvador, BA',
      destino: 'São Paulo, SP',
      km: '80',
      onOrigem: () => undefined,
      onDestino: () => undefined,
      onKm: () => undefined,
      tarifaKm: 10,
      horaExtra: 250,
      ocultarCampos: true,
      linhas: [
        { operation_type: 'NORDESTE - ROTA ANTIGA', price_per_extra_km: 10, price_per_extra_hour: 250 },
        { operation_type: 'TABELA 2027 - NORDESTE', price_per_extra_km: 8.3, price_per_extra_hour: 207.5 },
      ],
    }));
    assert.match(ceva, /8,30/);
    assert.match(ceva, /207,50/);
    assert.doesNotMatch(ceva, /250,00/);
    const manual = renderToStaticMarkup(React.createElement(QuoteCalculatorCard, {
      cliente: 'CEVA LOGISTICS LTDA',
      versao: '2026',
      origem: 'Salvador, BA',
      destino: 'São Paulo, SP',
      km: '80',
      onOrigem: () => undefined,
      onDestino: () => undefined,
      onKm: () => undefined,
      tarifaKm: 8.3,
      horaExtra: 207.5,
      ocultarCampos: true,
      linhas: [
        { operation_type: 'TABELA 2026 - NORDESTE', price_per_extra_km: 10, price_per_extra_hour: 250 },
        { operation_type: 'TABELA 2027 - NORDESTE', price_per_extra_km: 8.3, price_per_extra_hour: 207.5 },
      ],
    }));
    assert.match(manual, /10,00/);
    assert.match(manual, /250,00/);
    assert.doesNotMatch(manual, /8,30/);
  });

  it('preenche o painel do mapa com a rota da tela e não cria função nova', () => {
    assert.equal(textoTempoMonitor(1608), '1.608 min (26h 48m)');
    assert.equal(rotuloCidadeUf('Salvador, BA, Brasil'), 'Salvador, BA');
    assert.equal(rotuloCidadeUf('São Paulo, SP'), 'São Paulo, SP');
    assert.equal(indiceNaRota(101, 0.22), 22);
    assert.equal(rotuloMarcaTransito('CEVA LOGISTICS LTDA'), 'CEVA Logistics');
    const portal = readFileSync(new URL('../server/cevaPortal.ts', import.meta.url), 'utf8');
    assert.match(portal, /\/api\/cotacoes\/:id\/inativar/);
    assert.match(portal, /\/api\/cotacoes\/:id\/enviar-email/);
    assert.match(portal, /app\.delete\('\/api\/cotacoes\/:id'/);
    const tela = readFileSync(new URL('../components/ceva/CotacaoPortal.tsx', import.meta.url), 'utf8');
    assert.match(tela, /Informações da Rota/);
    assert.match(tela, /textoComBrasil/);
    assert.match(tela, /avoidFerries/);
    assert.match(tela, /PDF preview/);
    assert.match(tela, /data-mapa-cotacao/);
    assert.match(tela, /printDoMapaVisivel/);
    const proposta = readFileSync(new URL('../components/ceva/ExperienciaProposta.tsx', import.meta.url), 'utf8');
    assert.match(proposta, /printMapa/);
    assert.match(proposta, /Mapa da rota na tela/);
    assert.match(proposta, /data-proposta-bloco/);
    assert.match(proposta, /data-captura-proposta/);
    assert.match(proposta, /page-break-inside: avoid/);
    assert.match(proposta, /pdfBase64DaProposta/);
    assert.match(proposta, /Gerando PDF da proposta, aguarde/);
    assert.match(tela, /Gerando PDF da proposta, aguarde/);
    const historico = readFileSync(new URL('../components/ceva/HistoricoCotacoes.tsx', import.meta.url), 'utf8');
    assert.match(historico, /pdfBase64DaProposta/);
    assert.match(historico, /abrirPdfDaProposta/);
    assert.match(historico, /Gerando PDF da proposta, aguarde/);
    assert.match(tela, /enquadrarParaProposta/);
    assert.match(tela, /esperarMapaParado/);
    assert.match(tela, /left: 300/);
    assert.match(historico, /data-proposta-pdf="historico"/);
    assert.match(historico, /cenaDaProposta\(linhaCaptura\.client_name \|\| clienteNome \|\| '', mapaCaptura\)/);
    assert.match(tela, /data-fora-pdf="painel"/);
    assert.match(historico, /nomeLinhaVigencia/);
    assert.match(historico, /esperarPropostaHistorico/);
    assert.match(historico, /Não foi possível montar o PDF desta cotação/);
    const pdf = readFileSync(new URL('../components/ceva/abrirPdfCotacao.ts', import.meta.url), 'utf8');
    assert.match(pdf, /faixasCobertas/);
    assert.match(pdf, /gruposNaFolha/);
    assert.match(pdf, /data-captura-proposta/);
    assert.match(pdf, /\[data-fora-pdf\]/);
    assert.doesNotMatch(pdf, /while \(restante > 0\)/);
    assert.doesNotMatch(pdf, /financialUtils/);
    assert.match(tela, /data-testid="salvar-cotacao"/);
    assert.match(tela, /data-testid="gerar-proposta"/);
    assert.doesNotMatch(historico, /SeletorVigencia/);
    assert.match(proposta, /salvar-cotacao-proposta/);
    assert.match(proposta, /Salvar essa proposta em nosso banco de dados/);
    const corpoGerar = tela.slice(tela.indexOf('const gerar = () => {'), tela.indexOf('const salvarCotacaoAtual'));
    assert.match(corpoGerar, /setOrigem\(''\)/);
    assert.match(corpoGerar, /setDestino\(''\)/);
    assert.doesNotMatch(corpoGerar, /gravarNoHistorico/);
    const fechar = tela.slice(tela.indexOf('const fecharProposta'), tela.indexOf('const preverPdf'));
    assert.doesNotMatch(fechar, /gravarNoHistorico/);
    const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { functions: Record<string, unknown> };
    assert.equal(Object.keys(vercel.functions).length, 50);
  });
});
