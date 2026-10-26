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
  pdfAnexoAceito,
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

  it('inativa e exclui só para administrador, diretoria ou autor, e recusa cotação já virada em OS', () => {
    assert.equal(decisaoInativar(admin, cotacao).ok, true);
    assert.equal(decisaoExcluir(analista, cotacao).ok, true);
    const alheia = decisaoExcluir({ nome: 'Bia', email: 'bia@cliente.com', perfil: 'analista', portalCliente: 'CEVA' }, cotacao);
    assert.equal(alheia.ok, false);
    if (alheia.ok) return;
    assert.equal(alheia.status, 403);
    const virada = decisaoInativar(admin, { ...cotacao, converted_to_order_id: 'OS-9' });
    assert.equal(virada.ok, false);
    if (virada.ok) return;
    assert.equal(virada.status, 409);
    assert.equal(decisaoExcluir(admin, null).ok, false);
    assert.equal(podeGerirCotacao({ ...admin, perfil: 'Diretoria' }, cotacao), true);
    const log = registroAuditoriaCotacao({ acao: 'cotacao_excluir', ator: admin, cotacao });
    assert.equal(log.action_type, 'cotacao_excluir');
    assert.equal(log.entity, 'quotes');
  });

  it('aceita o PDF da proposta no anexo e monta a carta', () => {
    const pdf = Buffer.from(`%PDF-1.4\n${' '.repeat(80)}\n%%EOF`).toString('base64');
    const aceito = pdfAnexoAceito(`data:application/pdf;base64,${pdf}`);
    assert.equal(aceito.ok, true);
    const texto = Buffer.from('isto não é pdf '.repeat(8)).toString('base64');
    const recusado = pdfAnexoAceito(texto);
    assert.equal(recusado.ok, false);
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
    assert.match(proposta, /page-break-inside: avoid/);
    assert.match(proposta, /pdfBase64DaProposta/);
    assert.match(tela, /enquadrarParaProposta/);
    assert.match(tela, /esperarMapaParado/);
    assert.match(tela, /left: 300/);
    const historico = readFileSync(new URL('../components/ceva/HistoricoCotacoes.tsx', import.meta.url), 'utf8');
    assert.match(historico, /data-proposta-pdf="historico"/);
    assert.match(historico, /printMapa=\{mapaCaptura\}/);
    assert.match(historico, /nomeLinhaVigencia/);
    const pdf = readFileSync(new URL('../components/ceva/abrirPdfCotacao.ts', import.meta.url), 'utf8');
    assert.match(pdf, /paginasDosBlocos/);
    assert.doesNotMatch(pdf, /while \(restante > 0\)/);
    assert.doesNotMatch(pdf, /financialUtils/);
    const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { functions: Record<string, unknown> };
    assert.equal(Object.keys(vercel.functions).length, 50);
  });
});
