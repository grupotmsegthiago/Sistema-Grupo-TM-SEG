import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MARCA_CEVA, MARCA_IBL } from '../lib/portalEscolta/marca';
import { CABECALHOS_CONTROLE, recortarColunasControle } from '../lib/cevaPortal/exportarControle';
import { PORTAL_CEVA, PORTAL_IBL } from '../lib/cevaPortal/portalServidor';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('portal IBL usa a Intermodal Brasil e não mistura tabela com a CEVA', () => {
  assert.equal(PORTAL_IBL.clienteNome, 'INTERMODAL BRASIL LOGISTICA S.A.');
  assert.equal(PORTAL_IBL.clienteBusca, 'INTERMODAL');
  assert.equal(PORTAL_IBL.caminho, '/ibl');
  assert.equal(PORTAL_IBL.tokenPrefix, 'ibl-portal');
  assert.equal(PORTAL_CEVA.clienteNome, 'CEVA LOGISTICS LTDA');
  assert.notEqual(PORTAL_IBL.tabelas.usuarios, PORTAL_CEVA.tabelas.usuarios);
  assert.equal(PORTAL_IBL.tabelas.usuarios, 'ibl_portal_usuarios');
  assert.equal(MARCA_IBL.api, '/api/ibl-portal');
  assert.equal(MARCA_IBL.css['--portal-acao'], '#F7941E');
  assert.equal(MARCA_IBL.css['--portal-marca'], '#111111');
  assert.equal(MARCA_IBL.logo, '/logo_ibl_portal.png');
  assert.equal(MARCA_IBL.exigeLogin, true);
  assert.equal(PORTAL_IBL.exigeLogin, true);
  assert.equal(PORTAL_CEVA.exigeLogin, true);
  assert.deepEqual([...MARCA_IBL.colunasOcultas], ['Solicitante', 'Quem autorizou', 'Atendimento PGR', 'Operação', 'TSP']);
  assert.deepEqual([...MARCA_CEVA.colunasOcultas], []);
  const recorte = recortarColunasControle([CABECALHOS_CONTROLE.map((_, indice) => String(indice))], MARCA_IBL.colunasOcultas);
  assert.equal(recorte.cabecalhos.includes('Solicitante'), false);
  assert.equal(recorte.cabecalhos.includes('TSP'), false);
  assert.equal(recorte.cabecalhos.includes('Serviço'), true);
  assert.equal(recorte.linhas[0].length, recorte.cabecalhos.length);
  assert.equal(recorte.cabecalhos.length, CABECALHOS_CONTROLE.length - MARCA_IBL.colunasOcultas.length);
});

test('vercel encaminha o portal IBL sem aumentar o limite de functions', () => {
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const sources = (vercel.rewrites || []).map((r: { source: string; destination: string }) => r);
  const ibl = sources.filter((r: { source: string }) => r.source.includes('ibl-portal'));
  assert.ok(ibl.length >= 10, `esperava rewrites ibl-portal, veio ${ibl.length}`);
  for (const rule of ibl) {
    assert.match(rule.destination, /\/api\/ibl-portal/, rule.source);
  }
  const catchIdx = sources.findIndex((r: { destination: string }) => r.destination === '/api/index');
  const firstIbl = sources.findIndex((r: { source: string }) => r.source.includes('ibl-portal'));
  assert.ok(firstIbl > -1 && firstIbl < catchIdx, 'rewrites ibl ficam antes do catch-all');
  assert.equal(Object.keys(vercel.functions || {}).length, 50, 'não pode passar de 50 functions');
  assert.equal('api/ibl-portal.ts' in (vercel.functions || {}), false);
});

test('handler da IBL reusa o bundle leve e a rota /ibl fica fora do login interno', () => {
  const api = readFileSync(join(root, 'api/ibl-portal.ts'), 'utf8');
  const http = readFileSync(join(root, 'lib/cevaPortal/httpHandler.ts'), 'utf8');
  const app = readFileSync(join(root, 'App.tsx'), 'utf8');
  assert.match(api, /_ceva-portal-core\.cjs/);
  assert.match(api, /handleIblPortalHttp/);
  assert.doesNotMatch(api, /from ['"]express['"]/);
  assert.match(http, /export async function handleIblPortalHttp/);
  assert.match(http, /export async function handleCevaPortalHttp/);
  assert.match(http, /PORTAL_IBL/);
  assert.match(http, /cfg\(\)\.clienteNome/);
  assert.match(app, /normalizedPath === '\/ibl'/);
  assert.match(app, /<IblPortal/);
});
