import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARQUIVOS_ANALISADOS,
  computeOverallStatus,
  type IntegracaoDiagResult,
} from '../server/integracoesDiagnostics.ts';

test('ARQUIVOS_ANALISADOS cobre integrações principais', () => {
  assert.ok(ARQUIVOS_ANALISADOS.length >= 20);
  const joined = ARQUIVOS_ANALISADOS.join('\n');
  assert.match(joined, /asaasService/);
  assert.match(joined, /plugnotasService/);
  assert.match(joined, /supabaseConfig/);
  assert.match(joined, /geminiClient/);
  assert.match(joined, /emailHealth/);
});

test('computeOverallStatus classifica healthy, degraded e down', () => {
  const allOk: IntegracaoDiagResult[] = [
    { id: 'a', nome: 'A', servico: 'A', status: 'ok', configurado: true },
    { id: 'b', nome: 'B', servico: 'B', status: 'nao_configurado', configurado: false },
  ];
  assert.equal(computeOverallStatus(allOk), 'healthy');

  const degraded: IntegracaoDiagResult[] = [
    { id: 'a', nome: 'A', servico: 'A', status: 'ok', configurado: true },
    { id: 'b', nome: 'B', servico: 'B', status: 'degraded', configurado: true },
  ];
  assert.equal(computeOverallStatus(degraded), 'degraded');

  const down: IntegracaoDiagResult[] = [
    { id: 'a', nome: 'A', servico: 'A', status: 'falhou', configurado: true },
  ];
  assert.equal(computeOverallStatus(down), 'down');
});

test('script CLI existe e referencia diagnosticoIntegracoes', async () => {
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile('scripts/diagnostico-integracoes.ts', 'utf8'),
  );
  assert.match(src, /diagnosticoIntegracoes/);
  assert.match(src, /ARQUIVOS_ANALISADOS/);
  assert.match(src, /read-only/i);
});
