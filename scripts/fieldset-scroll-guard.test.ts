import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { aberturaFieldsetComRolagem } = require('./fieldsetScrollGuard.cjs') as {
  aberturaFieldsetComRolagem: (source: string) => string[];
};

const IGNORAR = new Set(['node_modules', 'dist', '.git', 'attached_assets', 'artifacts', 'coverage']);

function arquivosTsx(dir: string, saida: string[] = []): string[] {
  for (const nome of fs.readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue;
    const caminho = path.join(dir, nome);
    const stat = fs.statSync(caminho);
    if (stat.isDirectory()) arquivosTsx(caminho, saida);
    else if (nome.endsWith('.tsx') || nome.endsWith('.jsx')) saida.push(caminho);
  }
  return saida;
}

describe('fieldset não é container de rolagem', () => {
  it('detecta overflow na abertura do fieldset e ignora o div de fora', () => {
    assert.equal(aberturaFieldsetComRolagem('<div className="overflow-y-auto"><fieldset disabled></fieldset></div>').length, 0);
    const ruim = aberturaFieldsetComRolagem('<fieldset disabled className="flex-1 overflow-y-auto">');
    assert.equal(ruim.length, 1);
  });

  it('nenhum tsx/jsx do sistema põe rolagem no fieldset', () => {
    const raiz = process.cwd();
    const achados: string[] = [];
    for (const arquivo of arquivosTsx(raiz)) {
      const tags = aberturaFieldsetComRolagem(fs.readFileSync(arquivo, 'utf8'));
      for (const tag of tags) achados.push(`${path.relative(raiz, arquivo)}: ${tag}`);
    }
    assert.deepEqual(achados, []);
  });
});
