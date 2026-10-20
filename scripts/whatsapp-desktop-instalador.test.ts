import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { argumentosWinget, COMPONENTES_INSTALADOR, resumoInstalacao } from '../lib/whatsappDesktop/componentesInstalador.ts';

test('o instalador pede Node.js, Python e WhatsApp pelo winget', () => {
  const ids = COMPONENTES_INSTALADOR.map((item) => item.id);
  assert.deepEqual(ids, ['node', 'python', 'whatsapp']);
  assert.equal(COMPONENTES_INSTALADOR.find((item) => item.id === 'python')?.pacote, 'Python.Python.3.12');
  assert.equal(COMPONENTES_INSTALADOR.find((item) => item.id === 'whatsapp')?.pacote, 'WhatsApp.WhatsApp');
  const args = argumentosWinget('Python.Python.3.12');
  assert.deepEqual(args.slice(0, 4), ['install', '--id', 'Python.Python.3.12', '-e']);
  assert.ok(args.includes('--disable-interactivity'));
  assert.equal(resumoInstalacao({ node: true, python: false, whatsapp: false }), 'Faltam: Python, WhatsApp. Avance para instalar e configurar.');
  assert.match(resumoInstalacao({ node: true, python: true, whatsapp: true }), /já estão neste computador/);
});

test('o assistente instala ao avançar e o atalho instala o Node.js se faltar', () => {
  const html = fs.readFileSync('desktop/whatsapp-desktop/assistente.html', 'utf8');
  const vbs = fs.readFileSync('desktop/whatsapp-desktop/Abrir instalador.vbs', 'utf8');
  assert.match(html, /\/install\/componente/);
  assert.match(html, /Instalando /);
  assert.match(html, /Node\.js, Python e WhatsApp/);
  assert.doesNotMatch(html, /Python não é instalado/);
  assert.match(vbs, /winget install --id OpenJS\.NodeJS\.LTS/);
  assert.doesNotMatch(vbs, /não instala Python/);
  assert.match(vbs, /pastaScript & "\\conector\.mjs"/);
});

test('o zip baixado traz o atalho, o conector e a logo na mesma pasta', () => {
  const lista = execFileSync('unzip', ['-Z1', 'public/instalador-grupo-tmseg.zip'], { encoding: 'utf8' });
  for (const nome of ['Abrir instalador.vbs', 'conector.mjs', 'assistente.html', 'driver.ps1', 'logo.png']) {
    assert.ok(lista.split(/\r?\n/).includes(nome), nome);
  }
  const servidor = fs.readFileSync('desktop/whatsapp-desktop/servidor.ts', 'utf8');
  assert.match(servidor, /path\.join\(raiz, 'logo\.png'\)/);
});
