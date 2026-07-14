import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canAccessDiretoriaMenu } from '../lib/diretoriaAccess';
import { getRoleDefaultScreen, DIRECTORIA_COCKPIT_SCREEN } from '../lib/screenNavigation';

describe('diretoriaAccess — menu só Thiago Moreira / Thiago Santos', () => {
  it('libera para Thiago Moreira e Thiago Santos', () => {
    assert.equal(canAccessDiretoriaMenu({ name: 'Thiago Moreira', role: 'Diretoria' }), true);
    assert.equal(canAccessDiretoriaMenu({ name: 'Thiago Santos', role: 'Operador' }), true);
    assert.equal(canAccessDiretoriaMenu({ name: 'THIAGO MOREIRA' }), true);
  });

  it('bloqueia perfil Diretoria/Administrador sem ser os Thiagos', () => {
    assert.equal(canAccessDiretoriaMenu({ name: 'Bárbara Silva', role: 'Administrador' }), false);
    assert.equal(canAccessDiretoriaMenu({ name: 'Daniel Pinto', role: 'Diretoria' }), false);
    assert.equal(canAccessDiretoriaMenu({ name: 'Thiago', role: 'Diretoria' }), false);
    assert.equal(canAccessDiretoriaMenu({ name: '', role: 'Diretoria' }), false);
  });

  it('home padrão do cockpit só para quem tem acesso ao menu', () => {
    const prev = globalThis.localStorage;
    (globalThis as any).localStorage = {
      getItem: () => JSON.stringify({ name: 'Daniel', role: 'Diretoria' }),
    };
    try {
      assert.equal(getRoleDefaultScreen(), null);
    } finally {
      (globalThis as any).localStorage = prev;
    }

    (globalThis as any).localStorage = {
      getItem: () => JSON.stringify({ name: 'Thiago Moreira', role: 'Diretoria' }),
    };
    try {
      assert.equal(getRoleDefaultScreen(), DIRECTORIA_COCKPIT_SCREEN);
    } finally {
      (globalThis as any).localStorage = prev;
    }
  });

  it('menu Diretoria fica acima de Monitoramento no NAV_ITEMS', () => {
    const src = fs.readFileSync('constants.ts', 'utf8');
    const idxDir = src.indexOf("name: 'Diretoria'");
    const idxMon = src.indexOf("name: 'Monitoramento'");
    assert.ok(idxDir > 0 && idxMon > 0);
    assert.ok(idxDir < idxMon, 'Diretoria deve aparecer antes de Monitoramento');
  });

  it('Sidebar e App usam canAccessDiretoriaMenu (não só role)', () => {
    const sidebar = fs.readFileSync('components/Sidebar.tsx', 'utf8');
    const app = fs.readFileSync('App.tsx', 'utf8');
    assert.match(sidebar, /canAccessDiretoriaMenu/);
    assert.match(sidebar, /DIRETORIA_MENU_SCREEN_IDS/);
    assert.doesNotMatch(sidebar, /diretoriaScreens\.has\(itemId\) && \(role === 'diretoria'/);
    assert.match(app, /canAccessDiretoriaMenu/);
    assert.match(app, /case 'diretoria-cockpit'/);
    assert.match(sidebar, /from 'react'/);
    assert.match(app, /from 'react'/);
  });
});
