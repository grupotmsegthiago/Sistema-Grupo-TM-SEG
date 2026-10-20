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
