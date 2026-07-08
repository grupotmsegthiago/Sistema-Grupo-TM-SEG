import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('popup WhatsApp exibe Clique para Fechar durante carregamento', () => {
  const src = fs.readFileSync('lib/whatsappCopyFlow.ts', 'utf8');
  assert.match(src, /Clique para Fechar/);
  assert.match(src, /button-whatsapp-copy-skip-close/);
  assert.match(src, /skipCloseBtn\.style\.display = 'inline-block'/);
});

test('popup WhatsApp permite pular espera e seguir o fluxo', () => {
  const src = fs.readFileSync('lib/whatsappCopyFlow.ts', 'utf8');
  assert.match(src, /skipCloseBtn\.onclick = \(\) => settle\(resolve\)/);
  assert.doesNotMatch(src, /await Promise\.all\(\[work, delay\(PROGRESS_MS\)\]\)/);
});
