import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

describe('dados protegidos no servidor local', () => {
  it('o Express publica a mesma rota da Vercel', () => {
    const rotas = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(rotas, /app\.post\('\/api\/dados-protegidos'/);
    assert.match(rotas, /dadosProtegidosHandler/);
    assert.match(fs.readFileSync('api/dados-protegidos.ts', 'utf8'), /atenderDadosProtegidos/);
  });
});
