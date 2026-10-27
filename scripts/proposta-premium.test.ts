import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ETAPAS_PROPOSTA_PREMIUM,
  TEMPO_CENA_MS,
  cenaOficial,
  chaveDaCena,
  heroUtil,
  nomeArquivoPdfProposta,
  pecasPublicadas,
  pedidoCenaIlustrativa,
  pedidoDaPeca,
  podeGerarImagem,
  rotuloDeContagem,
  textoDuracaoViagem,
} from '../lib/portalCliente/propostaPremium';
import { htmlDaProposta } from '../lib/portalCliente/apresentacao';
import { urlDoLinkPublico } from '../lib/portalCliente/linkProposta';
import { percursoUtil } from '../lib/portalCliente/historicoCotacoes';
import { decodificarPolyline, tituloCidade } from '../lib/portalCliente/rotaCotacao';
import { urlMapaEstatico } from '../lib/portalCliente/frotaVisual';
import { ExperienciaProposta } from '../components/ceva/ExperienciaProposta';
import { folhaDoEspelho } from '../components/ceva/abrirPdfCotacao';
import { dadosConfiaveis, dadosDaProposta } from '../lib/portalCliente/dadosProposta';

describe('proposta premium', () => {
  it('a cena ilustrativa não leva preço, endereço nem logotipo', () => {
    const pedido = pedidoCenaIlustrativa();
    assert.match(pedido, /Não desenhe texto/);
    assert.doesNotMatch(pedido, /R\$|km extra|Guarulhos|Faria Lima|@|acionamento/);
    assert.equal(TEMPO_CENA_MS, 45_000);
    assert.deepEqual([...ETAPAS_PROPOSTA_PREMIUM], [
      'Preparando sua proposta comercial...',
      'Consultando informações da operação...',
      'Montando apresentação personalizada...',
      'Finalizando proposta...',
    ]);
  });

  it('CEVA, DHL e IBL usam a imagem oficial e o restante fica neutro', () => {
    assert.equal(cenaOficial('CEVA LOGISTICS LTDA').veiculo, '/caminhoes/3d/ceva-veiculo.webp');
    assert.equal(cenaOficial('CEVA LOGISTICS LTDA').logo, '/logo_ceva_portal.png');
    assert.equal(cenaOficial('DHL').recorte, '/caminhoes/3d/dhl-recorte.webp');
    assert.equal(cenaOficial('IBL Logística').logo, '/logo_ibl_portal.png');
    assert.equal(cenaOficial('Transportadora Nova').veiculo, '/caminhoes/3d/generico-veiculo.webp');
    assert.equal(cenaOficial('Transportadora Nova').logo, null);
    assert.equal(chaveDaCena('CEVA LOGISTICS'), 'ceva');
    assert.equal(heroUtil('https://evil.example/truck.png'), null);
    assert.equal(heroUtil('/caminhoes/../segredo.png'), null);
    assert.equal(heroUtil('/caminhoes/3d/ceva-veiculo.webp'), '/caminhoes/3d/ceva-veiculo.webp');
    assert.equal(heroUtil('/propostas-premium/capas/ceva.webp'), '/propostas-premium/capas/ceva.webp');
    assert.equal(rotuloDeContagem(6152), '6.152+');
    assert.equal(rotuloDeContagem(0), '0');
    assert.equal(rotuloDeContagem(null), null);
    assert.equal(podeGerarImagem(24.9, 0.08, 25), true);
    assert.equal(podeGerarImagem(25, 0.08, 25), false);
    for (const peca of ['capa', 'central', 'fiscal', 'escolta', 'acompanhamento', 'guincho'] as const) {
      const pedido = pedidoDaPeca(peca);
      assert.match(pedido, /Não desenhe texto/);
      assert.doesNotMatch(pedido, /R\$|Guarulhos|Faria Lima|CEVA|DHL|IBL/);
    }
  });

  it('a proposta premium mostra a rota real e os valores da cotação', () => {
    const html = renderToStaticMarkup(React.createElement(ExperienciaProposta, {
      frase: 'Preparando sua proposta comercial...',
      mostrando: true,
      proposta: {
        acordada: false,
        regiao: 'SUDESTE SP/RJ',
        origem: 'Rodovia Presidente Dutra, 17744 - Cumbica, Guarulhos - SP',
        destino: 'Av. Brigadeiro Faria Lima, 2232 - Jardim Paulistano, São Paulo - SP',
        paradas: [],
        acionamento: 9583.8,
        kmFranquia: 943,
        horasFranquia: 24,
        kmExtra: 6.6,
        horaExtra: 160,
        operacao: 'SUDESTE',
        vigencia: '2027',
        kmRota: 28,
        duracaoMin: 52,
        kmFaturado: 943,
        horasContadas: 24,
      },
      pedido: { regiao: 'SUDESTE', origem: 'Guarulhos', destino: 'São Paulo', paradas: [], km: 28 },
      clienteInterno: 'CEVA LOGISTICS LTDA',
      cena: { mapa: 'data:image/png;base64,iVBORw0KGgo=', carreta: '/caminhoes/3d/ceva-recorte.webp', logo: '/logo_ceva_portal.png', sobreporLogo: true },
      onFechar: () => undefined,
      onSalvarCotacao: async () => true,
    }));
    assert.match(html, /proposta-premium/);
    assert.match(html, /Escolta armada/);
    assert.match(html, /Rodovia Presidente Dutra/);
    assert.match(html, /Faria Lima/);
    assert.match(html, /logo_ceva_portal\.png/);
    assert.match(html, /caminhoes\/3d\/ceva-veiculo\.webp/);
    assert.match(html, /28 km/);
    assert.match(html, /52min/);
    assert.equal(textoDuracaoViagem(481), '8h01min');
    assert.equal(tituloCidade('Avenida Talma Rodrigues Ribeiro, 147 - Nova Zelândia, Serra - ES'), 'Serra, ES');
    assert.equal(tituloCidade('Salvador, BA'), 'Salvador, BA');
    assert.equal(textoDuracaoViagem(52), '52min');
    const pontos = decodificarPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    assert.equal(pontos.length, 3);
    assert.ok(Math.abs(pontos[0].lat - 38.5) < 0.01);
    assert.ok(Math.abs(pontos[2].lng + 126.453) < 0.01);
    const percurso = percursoUtil({ polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', pontos: [{ lat: 38.5, lng: -120.2 }, { lat: 'ruim' }, { lat: 99, lng: 0 }] });
    assert.equal(percurso?.pontos.length, 3);
    const mapa = urlMapaEstatico({ polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', chave: 'teste', traco: 'vermelho' });
    assert.match(mapa || '', /ef4444ff/);
    assert.match(html, /9\.583,80/);
    assert.match(html, /Mapa: Google/);
    assert.match(html, /data-proposta-mapa="1"/);
    assert.match(html, /Salvar cotação/);
    assert.match(html, /Salvar essa proposta em nosso banco de dados/);
    assert.match(html, /Quem acompanha a carga/);
    assert.match(html, /Fiscal de rota/);
    assert.match(html, /Guincho/);
    assert.match(html, /Condições comerciais/);
    assert.match(html, /Empresas que operam com a TM SEG/);
    assert.match(html, /indicador-operacoes/);
    assert.doesNotMatch(html, /gerar-imagem|Gerar imagem/);
    assert.doesNotMatch(html, /500\+|50\+/);
    const portal = readFileSync(new URL('../server/cevaPortal.ts', import.meta.url), 'utf8');
    const visual = readFileSync(new URL('../server/propostaPremiumVisual.ts', import.meta.url), 'utf8');
    assert.match(portal, /\/api\/proposta-escolta\/indicadores/);
    assert.doesNotMatch(visual, /gerarImagemIlustrativa|pedidoDaPeca/);
    assert.doesNotMatch(visual, /kmExtra|acionamento/);
    const tela = readFileSync(new URL('../components/ceva/CotacaoPortal.tsx', import.meta.url), 'utf8');
    const gerar = tela.slice(tela.indexOf('const gerar = () => {'), tela.indexOf('const salvarCotacaoAtual'));
    assert.match(gerar, /pecasPublicadas/);
    assert.match(gerar, /dadosDaProposta/);
    assert.match(gerar, /proposta-escolta\/dados/);
    assert.match(gerar, /setEtapa\('proposta'\)/);
    assert.doesNotMatch(gerar, /proposta-escolta\/premium|TEMPO_CENA_MS|gerarImagem/);
    assert.doesNotMatch(gerar, /gravarNoHistorico/);
    assert.match(tela, /duracaoMin: duracaoSeg != null && duracaoSeg > 0 \? Math\.round\(duracaoSeg \/ 60\) : null/);
    assert.doesNotMatch(tela, /duracaoMin:\s*48/);
    const ia = readFileSync(new URL('../server/propostaImagemIa.ts', import.meta.url), 'utf8');
    const gerarImagem = ia.slice(ia.indexOf('export async function gerarImagemIlustrativa'));
    assert.match(ia, /PROPOSTA_IA_PROVEDOR/);
    assert.match(gerarImagem, /openAISelecionada\(\)/);
    assert.match(gerarImagem, /gerarGemini\(pedido\)/);
    const publica = readFileSync(new URL('../components/ceva/PropostaPublica.tsx', import.meta.url), 'utf8');
    assert.match(publica, /pecasPublicadas/);
    assert.doesNotMatch(publica, /proposta-escolta\/premium|gerarImagemIlustrativa/);
    const leitura = portal.slice(portal.indexOf("app.get('/api/proposta-publica"), portal.indexOf('async function imagemDoMapa'));
    assert.match(leitura, /indicadoresPublicos/);
    assert.match(leitura, /mapaPublicoDaRota/);
    assert.match(leitura, /dadosDaProposta/);
    assert.match(portal, /\/api\/proposta-escolta\/dados/);
    assert.doesNotMatch(portal.slice(portal.indexOf("app.post('/api/proposta-escolta/dados'"), portal.indexOf("app.patch('/api/cotacoes/:id/inativar'")), /gerarImagemIlustrativa|gemini/);
    assert.match(portal, /traco: 'vermelho'/);
    assert.doesNotMatch(leitura, /visualizarCenaPremium|gerarImagemIlustrativa/);
    const demo = readFileSync(new URL('../components/ceva/PropostaPremiumDemo.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(demo, /duracaoMin:\s*\d+/);
    assert.doesNotMatch(demo, /5\.910\+|operacoesRealizadas=/);
    const cartaz = readFileSync(new URL('../components/ceva/PropostaPremium.tsx', import.meta.url), 'utf8');
    assert.match(cartaz, /proposta\.duracaoMin/);
    assert.doesNotMatch(cartaz, /48 min|R\$ 690/);
    const fotos = pecasPublicadas('CEVA LOGISTICS');
    assert.equal(fotos.fiscal, '/proposta-tmseg/service-fiscal-rota.png');
    assert.equal(fotos.escolta, '/proposta-tmseg/service-escolta.png');
    assert.equal(fotos.central, '/proposta-tmseg/about-team-original.webp');
    assert.equal(fotos.capa, null);
    assert.equal(nomeArquivoPdfProposta('52', 'CEVA LOGISTICS LTDA'), 'Proposta_52_CEVA_LOGISTICS_LTDA.pdf');
    const endereco = 'http://127.0.0.1:5000/proposta/v/52/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    assert.equal(urlDoLinkPublico(endereco, 'http://127.0.0.1:5000'), endereco);
    assert.equal(urlDoLinkPublico('https://evil.example/proposta/v/52/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'http://127.0.0.1:5000'), null);
    const carta = htmlDaProposta({
      acordada: false,
      regiao: 'SUDESTE',
      origem: 'Serra, ES',
      destino: 'Rio de Janeiro, RJ',
      paradas: [],
      acionamento: 4121.58,
      kmFranquia: 564.6,
      horasFranquia: 14,
      kmExtra: 7.3,
      horaExtra: 169,
      operacao: 'SUDESTE',
    }, null, endereco);
    assert.match(carta, /Acessar Proposta Comercial/);
    assert.match(carta, /proposta\/v\/52\//);
  });

  it('o link público imprime a mesma tela e não desenha imagem', () => {
    const html = renderToStaticMarkup(React.createElement(ExperienciaProposta, {
      frase: '',
      mostrando: true,
      somenteLeitura: true,
      idCotacao: '52',
      validadeTexto: '05/11/2026',
      proposta: {
        acordada: false,
        regiao: 'SUDESTE',
        origem: 'Serra, ES',
        destino: 'Rio de Janeiro, RJ',
        paradas: [],
        acionamento: 4121.58,
        kmFranquia: 564.6,
        horasFranquia: 14,
        kmExtra: 7.3,
        horaExtra: 169,
        operacao: 'SUDESTE',
        kmRota: 564.6,
        duracaoMin: 481,
      },
      pedido: { regiao: 'SUDESTE', origem: 'Serra, ES', destino: 'Rio de Janeiro, RJ', paradas: [], km: 564.6 },
      clienteInterno: 'CEVA LOGISTICS LTDA',
      pecas: pecasPublicadas('CEVA'),
      onFechar: () => undefined,
    }));
    assert.match(html, /Baixar Proposta em PDF/);
    assert.match(html, /Válida até 05\/11\/2026/);
    assert.match(html, /Este link não abre o restante do sistema/);
    assert.match(html, /print-color-adjust: exact !important/);
    assert.match(html, /proposta-container/);
    assert.match(html, /grade-quatro/);
    assert.match(html, /card-servico/);
    assert.match(html, /repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(html, /max-height: 220px !important/);
    assert.doesNotMatch(html, /size:\s*A4/);
    assert.match(html, /service-fiscal-rota\.png/);
    assert.match(html, /8h01min/);
    assert.match(html, /4\.121,58/);
    assert.doesNotMatch(html, /fiscal-2\.webp|Gerando Imagem|Salvar cotação|Enviar para o e-mail/);
    const dados = dadosDaProposta({
      acordada: false,
      regiao: 'SUDESTE MG/ES',
      origem: 'Serra, ES',
      destino: 'Rio de Janeiro, RJ',
      paradas: [],
      acionamento: 4121.58,
      kmFranquia: 564.6,
      horasFranquia: 14,
      kmExtra: 7.3,
      horaExtra: 169,
      operacao: 'SUDESTE',
      kmRota: 564.6,
      duracaoMin: 481,
    });
    assert.equal(dados.subRegiao, 'SUDESTE MG/ES');
    assert.equal(dados.distanciaKm, 564.6);
    assert.equal(dados.tempoMin, 481);
    assert.equal(dados.total, 4121.58);
    assert.equal(dados.kmFaturado, 564.6);
    assert.equal(dados.franquiaHoras, 14);
    assert.equal(dados.kmExtra, 7.3);
    assert.equal(dados.horaExtra, 169);
    const folha = folhaDoEspelho(1100, 2800);
    assert.ok(folha.alturaPt > folha.larguraPt);
    assert.ok(Math.abs(folha.larguraPt - 825) < 1);
    assert.ok(folha.alturaPt > 2000);
    const espelho = readFileSync(new URL('../components/ceva/abrirPdfCotacao.ts', import.meta.url), 'utf8');
    const funcao = espelho.slice(espelho.indexOf('export async function baixarEspelhoDaProposta'), espelho.indexOf('export async function abrirPdfDaProposta'));
    assert.match(funcao, /FUNDO_ESPELHO/);
    assert.match(espelho.slice(espelho.indexOf('const FUNDO_ESPELHO'), espelho.indexOf('export function folhaDoEspelho')), /#07080d/);
    assert.doesNotMatch(funcao, /#f7f5f2|format: 'a4'/);
    const botao = readFileSync(new URL('../components/ceva/ExperienciaProposta.tsx', import.meta.url), 'utf8');
    const clique = botao.slice(botao.indexOf('const baixarPdf'), botao.indexOf('const garantirLink'));
    assert.match(clique, /baixarEspelhoDaProposta/);
    assert.doesNotMatch(clique, /window\.print/);
    assert.equal(dadosConfiaveis({ ...dados, total: 1 }, {
      acordada: false,
      regiao: 'SUDESTE MG/ES',
      origem: 'Serra, ES',
      destino: 'Rio de Janeiro, RJ',
      paradas: [],
      acionamento: 4121.58,
      kmFranquia: 564.6,
      horasFranquia: 14,
      kmExtra: 7.3,
      horaExtra: 169,
      operacao: 'SUDESTE',
      kmRota: 564.6,
      duracaoMin: 481,
    }).total, 4121.58);
  });
});
