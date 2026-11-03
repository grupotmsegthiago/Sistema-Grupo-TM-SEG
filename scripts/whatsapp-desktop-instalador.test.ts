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
  const ps1 = fs.readFileSync('desktop/whatsapp-desktop/instalar-node.ps1', 'utf8');
  assert.match(vbs, /instalar-node\.ps1/);
  assert.match(vbs, /ProgramW6432/);
  assert.match(ps1, /winget install --id OpenJS\.NodeJS\.LTS/);
  assert.match(ps1, /nodejs\.org\/dist/);
  assert.doesNotMatch(vbs, /não instala Python/);
  assert.match(vbs, /pastaScript & "\\conector\.mjs"/);
});

function listarZip(arquivo: string): string {
  try {
    return execFileSync('unzip', ['-Z1', arquivo], { encoding: 'utf8' });
  } catch (erro: unknown) {
    if (!(erro instanceof Error) || !('code' in erro) || (erro as NodeJS.ErrnoException).code !== 'ENOENT') throw erro;
    return execFileSync('tar', ['-tf', arquivo], { encoding: 'utf8' });
  }
}

test('o zip baixado traz o atalho, o conector e a logo na mesma pasta', () => {
  const lista = listarZip('public/instalador-grupo-tmseg.zip');
  for (const nome of ['Abrir instalador.vbs', 'instalar-node.ps1', 'conector.mjs', 'assistente.html', 'driver.ps1', 'logo.png']) {
    assert.ok(lista.split(/\r?\n/).includes(nome), nome);
  }
  const servidor = fs.readFileSync('desktop/whatsapp-desktop/servidor.ts', 'utf8');
  assert.match(servidor, /path\.join\(raiz, 'logo\.png'\)/);
});
