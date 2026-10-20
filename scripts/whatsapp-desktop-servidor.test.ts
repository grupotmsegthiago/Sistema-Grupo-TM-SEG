import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'tmseg-wa-'));
process.env.TMSEG_WA_HOME = casa;

const { criarServidor, driverSimulado } = await import('../desktop/whatsapp-desktop/servidor.ts');

test('o aplicativo local autentica, envia em sequência e não duplica', async () => {
  const servidor = criarServidor(driverSimulado({
    titulo: 'GRUPO HOMOLOGACAO',
    candidatos: ['GRUPO HOMOLOGACAO'],
  }));
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
  const endereco = servidor.address();
  if (!endereco || typeof endereco === 'string') throw new Error('porta');
  const base = `http://127.0.0.1:${endereco.port}`;
  const codigo = await fetch(`${base}/pair/code`).then((r) => r.json()) as { codigo: string };
  assert.match(codigo.codigo, /^[a-f0-9]{20,}$/);
  const semToken = await fetch(`${base}/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(semToken.status, 401);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${codigo.codigo}`, Origin: 'https://sistema.grupotmseg.com.br' };
  const lote = {
    commands: [
      { id: 'c1', groupName: 'GRUPO HOMOLOGACAO', text: 'um' },
      { id: 'c2', groupName: 'GRUPO ERRADO', text: 'dois' },
      { id: 'c3', groupName: 'GRUPO HOMOLOGACAO', text: 'tres' },
    ],
  };
  const primeira = await fetch(`${base}/commands`, { method: 'POST', headers, body: JSON.stringify(lote) }).then((r) => r.json()) as { resultados: Array<{ id: string; estado: string }> };
  assert.equal(primeira.resultados[0].estado, 'comando_executado');
  assert.equal(primeira.resultados[1].estado, 'destinatario_nao_validado');
  assert.equal(primeira.resultados[2].estado, 'comando_executado');
  const segunda = await fetch(`${base}/commands`, { method: 'POST', headers, body: JSON.stringify({ commands: [lote.commands[0]] }) }).then((r) => r.json()) as { resultados: Array<{ id: string; estado: string }> };
  assert.equal(segunda.resultados[0].estado, 'comando_executado');
  servidor.closeAllConnections();
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});

test('o teste de homologação só envia com o chat aberto e não repete', async () => {
  let envios = 0;
  const servidor = criarServidor(async () => {
    envios += 1;
    return { id: '', estado: 'comando_executado' };
  }, async () => ({
    titulo: 'GRUPO TM SEG - ADM',
    candidatos: ['GRUPO TM SEG - ADM'],
    autenticado: true,
    aberto: true,
  }));
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
  const endereco = servidor.address();
  if (!endereco || typeof endereco === 'string') throw new Error('porta');
  const base = `http://127.0.0.1:${endereco.port}`;
  const codigo = await fetch(`${base}/pair/code`).then((r) => r.json()) as { codigo: string };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${codigo.codigo}`, Origin: 'https://sistema.grupotmseg.com.br' };
  const recusado = await fetch(`${base}/homologacao`, { method: 'POST', headers, body: JSON.stringify({ autorizar: false }) }).then((r) => r.json()) as { ok: boolean };
  assert.equal(recusado.ok, false);
  assert.equal(envios, 0);
  const enviado = await fetch(`${base}/homologacao`, { method: 'POST', headers, body: JSON.stringify({ autorizar: true }) }).then((r) => r.json()) as { ok: boolean; entrega: null };
  assert.equal(enviado.ok, true);
  assert.equal(enviado.entrega, null);
  assert.equal(envios, 1);
  const repetido = await fetch(`${base}/homologacao`, { method: 'POST', headers, body: JSON.stringify({ autorizar: true }) }).then((r) => r.json()) as { ok: boolean };
  assert.equal(repetido.ok, false);
  assert.equal(envios, 1);
  servidor.closeAllConnections();
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});

test('o computador preparado é reconhecido sem repetir instalação, QR ou teste', async () => {
  let envios = 0;
  const servidor = criarServidor(async () => {
    envios += 1;
    return { id: '', estado: 'comando_executado' };
  }, async () => ({ titulo: 'GRUPO TM SEG - ADM', candidatos: ['GRUPO TM SEG - ADM'], autenticado: true, aberto: true }));
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
  const endereco = servidor.address();
  if (!endereco || typeof endereco === 'string') throw new Error('porta');
  const base = `http://127.0.0.1:${endereco.port}`;
  const antes = await fetch(`${base}/identificar`).then((r) => r.json()) as { preparado: boolean; codigo?: string; repetirInstalacao: boolean };
  assert.equal(antes.preparado, false);
  assert.equal(antes.repetirInstalacao, true);
  assert.equal(antes.codigo, undefined);
  const bloqueado = await fetch(`${base}/identificar`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(bloqueado.status, 403);
  const preparo = await fetch(`${base}/dispositivo/preparar`, { method: 'POST', headers: { Origin: 'https://sistema.grupotmseg.com.br' } }).then((r) => r.json()) as { preparado: boolean; codigo: string; repetirTeste: boolean; repetirQr: boolean };
  assert.equal(preparo.preparado, true);
  assert.equal(preparo.repetirTeste, false);
  assert.equal(preparo.repetirQr, false);
  assert.match(preparo.codigo, /^[a-f0-9]{20,}$/);
  const deNovo = await fetch(`${base}/identificar`, { headers: { Origin: 'https://sistema.grupotmseg.com.br' } }).then((r) => r.json()) as { identificado: boolean; codigo: string };
  assert.equal(deNovo.identificado, true);
  assert.equal(deNovo.codigo, preparo.codigo);
  const headers = { Authorization: `Bearer ${preparo.codigo}`, Origin: 'https://sistema.grupotmseg.com.br' };
  const solto = await fetch(`${base}/unlink`, { method: 'POST', headers }).then((r) => r.json()) as { ok: boolean };
  assert.equal(solto.ok, true);
  const aposSoltar = await fetch(`${base}/identificar`).then((r) => r.json()) as { vinculado: boolean; codigo?: string; repetirInstalacao: boolean };
  assert.equal(aposSoltar.vinculado, false);
  assert.equal(aposSoltar.repetirInstalacao, false);
  assert.equal(aposSoltar.codigo, undefined);
  const religado = await fetch(`${base}/dispositivo/vincular`, { method: 'POST' }).then((r) => r.json()) as { ok: boolean; codigo: string; repetirTeste: boolean };
  assert.equal(religado.ok, true);
  assert.equal(religado.codigo, preparo.codigo);
  assert.equal(religado.repetirTeste, false);
  assert.equal(envios, 0);
  servidor.closeAllConnections();
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});
