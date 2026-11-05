import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proximosAlvos,
  montarQueriesBusca,
  GEO_MATRIX,
  listaMicroAlvos,
  proximoMicroAlvo,
  rotuloMicroAlvo,
  montarQueriesMicro,
} from '../lib/partnerProspects/geoMatrix.ts';
import {
  cnaesDaFicha,
  temCnaeEscoltaOuSeguranca,
  situacaoAtiva,
  validarCnpjBrasilApi,
} from '../lib/partnerProspects/brasilApiCnpj.ts';
import { escolherEmailPreferencial } from '../lib/partnerProspects/emailFilter.ts';
import { extrairJsonArray } from '../lib/partnerProspects/discoverWithGemini.ts';
import {
  empresasHeuristicasDosHits,
  parseDuckDuckGo,
  montarQueriesMultimotor,
  decodeHtml,
  desembrulharUrl,
  siteDeUrl,
  limparNomeEmpresa,
} from '../lib/partnerProspects/multiEngineSearch.ts';
import { pareceLixoProspecto, pareceEmpresaSeguranca } from '../lib/partnerProspects/junkFilter.ts';
import {
  uniqEmails,
  parseGeminiEnrichJson,
  limparNomeDuplicado,
  extrairEnderecoBr,
  extrairDoHtml,
  fetchText,
} from '../lib/partnerProspects/enrichProspect.ts';

test('matriz cobre 27 UFs (26 + DF)', () => {
  assert.equal(GEO_MATRIX.length, 27);
  assert.ok(GEO_MATRIX.some((g) => g.uf === 'MG'));
  assert.ok(GEO_MATRIX.some((g) => g.uf === 'DF'));
});

test('rotação de UFs é circular e avança o cursor', () => {
  const a = proximosAlvos(0, 3);
  assert.deepEqual(a.alvos.map((x) => x.uf), ['AC', 'AL', 'AP']);
  assert.equal(a.nextIndex, 3);
  const b = proximosAlvos(25, 3);
  assert.equal(b.alvos.length, 3);
  assert.equal(b.alvos[0].uf, GEO_MATRIX[25].uf);
  assert.equal(b.nextIndex, (25 + 3) % 27);
});

test('queries de busca incluem estado e polo', () => {
  const q = montarQueriesBusca(
    { uf: 'MG', estado: 'Minas Gerais', polos: ['Belo Horizonte', 'Uberlândia'] },
    2,
  );
  assert.ok(q.some((s) => /Minas Gerais/i.test(s)));
  assert.ok(q.some((s) => /Belo Horizonte/i.test(s)));
  assert.ok(q.some((s) => /escolta armada/i.test(s)));
});

test('micro-alvos: lista de cidades e ciclo circular', () => {
  const lista = listaMicroAlvos();
  assert.ok(lista.length >= 27);
  assert.ok(lista.some((m) => m.cidade === 'Belo Horizonte' && m.uf === 'MG'));
  const a = proximoMicroAlvo(0);
  assert.equal(a.alvo.uf, lista[0].uf);
  assert.equal(a.nextIndex, 1);
  assert.equal(a.wrapped, false);
  const fim = proximoMicroAlvo(lista.length - 1);
  assert.equal(fim.nextIndex, 0);
  assert.equal(fim.wrapped, true);
  assert.equal(rotuloMicroAlvo({ uf: 'PR', estado: 'Paraná', cidade: 'Curitiba' }), 'Curitiba/PR');
  const qm = montarQueriesMicro({ uf: 'PR', estado: 'Paraná', cidade: 'Curitiba' });
  assert.ok(qm.every((s) => /Curitiba/i.test(s)));
});

test('CNAE escolta/segurança e situação ATIVA', () => {
  const cnaes = cnaesDaFicha({
    cnpj: '1',
    cnae_fiscal: 8012700,
    cnaes_secundarios: [{ codigo: 8011900 }],
  });
  assert.deepEqual(cnaes.sort(), ['8011900', '8012700']);
  assert.equal(temCnaeEscoltaOuSeguranca(cnaes), true);
  assert.equal(temCnaeEscoltaOuSeguranca(['6201501']), false);
  assert.equal(situacaoAtiva('ATIVA'), true);
  assert.equal(situacaoAtiva('BAIXADA'), false);
});

test('BrasilAPI mock: ATIVA + CNAE ok', async () => {
  const fetchMock = async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        cnpj: '12345678000190',
        razao_social: 'SEGURANCA XYZ LTDA',
        nome_fantasia: 'XYZ',
        descricao_situacao_cadastral: 'ATIVA',
        uf: 'SP',
        municipio: 'SANTOS',
        cnae_fiscal: 8012700,
        email: 'contato@xyzseg.com.br',
        ddd_telefone_1: '13999999999',
      }),
    }) as any;
  const r = await validarCnpjBrasilApi('12.345.678/0001-90', fetchMock as any);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.cnpj, '12345678000190');
    assert.equal(r.uf, 'SP');
  }
});

test('BrasilAPI mock: CNAE fora do escopo', async () => {
  const fetchMock = async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        cnpj: '12345678000190',
        razao_social: 'PADARIA',
        descricao_situacao_cadastral: 'ATIVA',
        cnae_fiscal: 5611201,
      }),
    }) as any;
  const r = await validarCnpjBrasilApi('12345678000190', fetchMock as any);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, 'cnae_fora_do_escopo');
});

test('e-mail preferencial: domínio do site vence webmail', () => {
  const e = escolherEmailPreferencial(
    ['contador@gmail.com', 'ops@escoltamg.com.br'],
    'https://www.escoltamg.com.br',
  );
  assert.equal(e, 'ops@escoltamg.com.br');
});

test('extrai JSON de resposta Gemini com fence', () => {
  const text = 'Aqui vai:\n```json\n[{"company_name":"ABC SEG","cnpj":"12.345.678/0001-90","email":"a@abc.com"}]\n```';
  const rows = extrairJsonArray(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].company_name, 'ABC SEG');
  assert.equal(rows[0].cnpj, '12345678000190');
});

test('queries multimotor e heurística sem CNPJ', () => {
  const qs = montarQueriesMultimotor('Curitiba', 'PR', 'Paraná');
  assert.ok(qs.some((q) => /Curitiba/i.test(q) && /escolta/i.test(q)));
  const hits = [
    {
      title: 'Fortaleza Escolta Armada - Segurança',
      url: 'https://fortalezaescolta.com.br/contato',
      snippet: 'Empresa de escolta armada em Curitiba',
      engine: 'duckduckgo' as const,
    },
    {
      title: 'As melhores 5 empresas de vigilância',
      url: 'https://blog.exemplo.com/lista',
      snippet: 'escolta armada',
      engine: 'bing' as const,
    },
  ];
  const empresas = empresasHeuristicasDosHits(hits, { cidade: 'Curitiba', uf: 'PR' });
  assert.equal(empresas.length, 1);
  assert.equal(empresas[0].cnpj, null);
  assert.match(empresas[0].notes, /Pendente de CNPJ/);
  assert.ok(empresas[0].website);
});

test('decode HTML e unwrap de URL de motor', () => {
  assert.equal(decodeHtml('VIGIL&#226;NCIA'), 'VIGILâNCIA');
  assert.equal(decodeHtml('VIGIL&#226;NCIA').toUpperCase(), 'VIGILÂNCIA');
  const ddg = desembrulharUrl(
    'https://duckduckgo.com/l/?uddg=' + encodeURIComponent('https://macor.com.br/escolta'),
  );
  assert.equal(ddg, 'https://macor.com.br/escolta');
  assert.equal(siteDeUrl(ddg), 'https://macor.com.br');
  const limpo = limparNomeEmpresa(
    'GRUPO MAP HTTPS://GRUPOMAP.COM.BR › ESCOLTA',
  );
  assert.match(limpo.name, /GRUPO MAP/i);
  assert.ok(limpo.websiteFromTitle?.includes('grupomap.com.br'));
});

test('parse DuckDuckGo HTML básico', () => {
  const html = `
    <a class="result__a" href="https://exemplo-escolta.com.br">Empresa Escolta XYZ</a>
    <a class="result__snippet">Escolta armada em Santos</a>
  `;
  const hits = parseDuckDuckGo(html);
  assert.ok(hits.length >= 1);
  assert.match(hits[0].title, /Escolta XYZ/i);
});

test('anti-lixo descarta dicionário e prefeitura', () => {
  assert.equal(pareceLixoProspecto({ company_name: 'Dicionário Online de Português' }), true);
  assert.equal(pareceLixoProspecto({ company_name: 'Prefeitura de Valinhos - Vigilância Sanitária' }), true);
  assert.equal(
    pareceLixoProspecto({ company_name: 'Vortex Segurança', website: 'https://vortexseguranca.com.br' }),
    false,
  );
  assert.equal(pareceEmpresaSeguranca('Vortex Segurança — escolta armada'), true);
});

test('enrich: uniq emails e parse JSON Gemini', () => {
  assert.deepEqual(uniqEmails(['A@X.com', 'a@x.com', 'ops@y.com.br', 'bad']), ['a@x.com', 'ops@y.com.br']);
  const p = parseGeminiEnrichJson(
    '```json\n{"company_name":"ABC SEG","cnpj":"12.345.678/0001-90","emails":["ops@abc.com"],"instagram":"https://instagram.com/abcseg"}\n```',
  );
  assert.equal(p.company_name, 'ABC SEG');
  assert.equal(p.cnpj, '12345678000190');
  assert.ok(p.emails?.includes('ops@abc.com'));
});

test('enrich: limpa nome duplicado e endereço BR do rodapé', () => {
  assert.equal(limparNomeDuplicado('MASTER VIGILÂNCIA MASTER VIGILÂNCIA'), 'MASTER VIGILÂNCIA');
  const end = extrairEnderecoBr(
    'Rua Desembargador Hugo Simas, 1653 - Vista Alegre - Curitiba/PR - CEP: 80820-102',
  );
  assert.equal(end.city, 'CURITIBA');
  assert.equal(end.state_uf, 'PR');
  assert.equal(end.cep, '80820102');
  assert.match(String(end.address_street), /Hugo Simas/i);
});

test('enrich: extrai telefone e-mail Instagram do HTML footer', () => {
  const html = `
  <footer>
    <a href="mailto:atendimento@mastervigilancia.com.br">e-mail</a>
    <a href="https://instagram.com/mastervigilanciaespecializada">ig</a>
    <p>(41) 3264-6633</p>
    <p>Rua Desembargador Hugo Simas, 1653 - Vista Alegre - Curitiba/PR - CEP: 80820-102</p>
  </footer>`;
  const s = extrairDoHtml(html);
  assert.ok(s.emails.includes('atendimento@mastervigilancia.com.br'));
  assert.ok(s.phones.some((p) => p.includes('3264-6633')));
  assert.equal(s.instagram, 'https://instagram.com/mastervigilanciaespecializada');
  assert.equal(s.city, 'CURITIBA');
  assert.equal(s.state_uf, 'PR');
});

test('enrich: fetch Master Vigilância aceita HTML (não 406)', async () => {
  const html = await fetchText('https://www.mastervigilancia.com.br');
  assert.ok(html.length > 1000, 'html curto ou bloqueado');
  assert.match(html, /3264-6633/);
  assert.match(html, /atendimento@mastervigilancia\.com\.br/i);
});
