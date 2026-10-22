import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { fotoOrigemDosLogs, montarFotosEvento, urlDeEvidencia } from '../lib/portalCliente/fotosMedicao';
import { lerFotosEvento } from '../lib/portalCliente/fotosMedicaoHttp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fim = 'https://ajhmmjuewdsukecaimik.supabase.co/storage/v1/object/public/mission-evidence/fim-viagem/GTM-10/1.jpg';
const kmFinal = 'https://ajhmmjuewdsukecaimik.supabase.co/storage/v1/object/public/mission-evidence/odometer/GTM-10/2.jpg';
const origem = 'https://ajhmmjuewdsukecaimik.supabase.co/storage/v1/object/public/mission-evidence/GTM-10/inicio.jpg';

function banco(mission: Record<string, unknown> | null, logs: Array<Record<string, unknown>>) {
  return {
    from(tabela: string) {
      if (tabela === 'missions') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: mission, error: null }),
        };
      }
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit: async () => ({ data: logs, error: null }),
      };
    },
  };
}

test('só aceita endereço https do bucket de evidência', () => {
  assert.equal(urlDeEvidencia(fim), fim);
  assert.equal(urlDeEvidencia('http://exemplo/mission-evidence/a.jpg'), null);
  assert.equal(urlDeEvidencia('https://exemplo/outra-pasta/a.jpg'), null);
});

test('a evidência da solicitação não vira foto da origem', () => {
  const url = fotoOrigemDosLogs([
    { created_at: '2026-10-14T00:12:25.892Z', details: JSON.stringify({ publicUrl: origem, context: 'Criação da OS - Evidência de solicitação do cliente' }) },
    { created_at: '2026-10-14T12:00:00.000Z', details: JSON.stringify({ publicUrl: origem, source: 'evidence_start_alert' }) },
  ]);
  assert.equal(url, origem);
  assert.equal(fotoOrigemDosLogs([
    { details: JSON.stringify({ publicUrl: origem, context: 'Criação da OS - Evidência de solicitação do cliente' }) },
  ]), null);
});

test('a OS do portal devolve fim e km final e deixa origem e km inicial vazios quando não há foto', async () => {
  const cheio = await lerFotosEvento({
    sb: banco({ id: 'GTM-10', client: 'CEVA', end_trip_evidence_url: fim, end_km_evidence_url: kmFinal }, [
      { created_at: '2026-10-14T12:00:00.000Z', details: JSON.stringify({ publicUrl: origem, source: 'evidence_start_alert' }) },
    ]),
    os: '10',
    cliente: { name: 'CEVA' },
  });
  assert.equal(cheio.status, 200);
  assert.deepEqual(cheio.corpo.fotos, montarFotosEvento({ origem, fim, kmFinal }));
  assert.equal(cheio.corpo.fotos?.[2].url, null);

  const vazio = await lerFotosEvento({
    sb: banco({ id: 'GTM-10', client: 'CEVA', end_trip_evidence_url: fim, end_km_evidence_url: kmFinal }, []),
    os: '10',
    cliente: { name: 'CEVA' },
  });
  assert.equal(vazio.corpo.fotos?.[0].url, null);
  assert.equal(vazio.corpo.fotos?.[1].url, fim);
  assert.equal(vazio.corpo.fotos?.[3].url, kmFinal);

  const outra = await lerFotosEvento({
    sb: banco({ id: 'GTM-10', client: 'OUTRO', end_trip_evidence_url: fim, end_km_evidence_url: kmFinal }, []),
    os: '10',
    cliente: { name: 'CEVA' },
  });
  assert.equal(outra.status, 404);
});

test('as fotos reaproveitam as funções dos portais', () => {
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  assert.equal(Object.keys(vercel.functions || {}).length, 50);
  const sources = vercel.rewrites as { source: string; destination: string }[];
  for (const source of ['/api/ceva-portal/fotos/:os', '/api/ibl-portal/fotos/:os', '/api/cliente-portal/fotos/:os']) {
    const regra = sources.find((item) => item.source === source);
    assert.ok(regra);
    assert.match(regra.destination, /op=fotos/);
  }
});
