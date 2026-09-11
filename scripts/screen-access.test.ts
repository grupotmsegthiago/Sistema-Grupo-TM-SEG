import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessScreen,
  hasProfilePermission,
  fallbackScreenForUser,
} from '../lib/screenAccess';

describe('screenAccess — menu só pelo vínculo do perfil', () => {
  it('oculta tela que não está nas permissions', () => {
    const user = { role: 'Operador', permissions: ['dashboard', 'missions'] };
    assert.equal(canAccessScreen(user, 'missions'), true);
    assert.equal(canAccessScreen(user, 'fin-dashboard'), false);
    assert.equal(canAccessScreen(user, 'providers'), false);
    assert.equal(canAccessScreen(user, 'profiles'), false);
    assert.equal(canAccessScreen(user, 'rh-employees'), false);
  });

  it('role Diretoria/Administrador sozinho não libera Configurações nem RH', () => {
    assert.equal(canAccessScreen({ role: 'Diretoria', permissions: [] }, 'profiles'), false);
    assert.equal(canAccessScreen({ role: 'Administrador', permissions: [] }, 'system-settings'), false);
    assert.equal(canAccessScreen({ role: 'Diretoria', permissions: [] }, 'rh-dashboard'), false);
    assert.equal(canAccessScreen({ role: 'Financeiro', permissions: [] }, 'fin-dashboard'), false);
  });

  it('mostra apenas o que foi vinculado no perfil', () => {
    const user = {
      role: 'Financeiro',
      permissions: ['finance-group', 'fin-dashboard', 'fin-billing', 'fin-report'],
    };
    assert.equal(canAccessScreen(user, 'fin-dashboard'), true);
    assert.equal(canAccessScreen(user, 'fin-billing'), true);
    assert.equal(canAccessScreen(user, 'fin-dre'), false);
    assert.equal(canAccessScreen(user, 'finance-group'), true);
  });

  it('Faturamento/Comissões exigem perfil Diretoria e vínculo no perfil', () => {
    assert.equal(
      canAccessScreen({ role: 'Diretoria', permissions: ['diretoria-faturamento'] }, 'diretoria-faturamento'),
      true,
    );
    assert.equal(
      canAccessScreen({ role: 'Diretoria', permissions: [] }, 'diretoria-faturamento'),
      false,
    );
    assert.equal(
      canAccessScreen({ role: 'Administrador', permissions: ['diretoria-faturamento', '*'] }, 'diretoria-faturamento'),
      false,
    );
    assert.equal(
      canAccessScreen({ role: 'Diretoria', permissions: ['comissoes-comerciais'] }, 'comissoes-comerciais'),
      true,
    );
  });

  it('cliente restrito não vê financeiro/fornecedor mesmo com permission indevida', () => {
    const client = {
      role: 'Cliente',
      clientId: 'c1',
      permissions: ['fin-dashboard', 'providers', 'missions'],
    };
    assert.equal(canAccessScreen(client, 'fin-dashboard'), false);
    assert.equal(canAccessScreen(client, 'providers'), false);
    assert.equal(canAccessScreen(client, 'missions'), true);
  });

  it('wildcard * libera telas comuns (não quebra exclusividade dos Thiagos no cockpit)', () => {
    const admin = { name: 'Maria', role: 'Administrador', permissions: ['*'] };
    assert.equal(hasProfilePermission(admin, 'profiles'), true);
    assert.equal(canAccessScreen(admin, 'profiles'), true);
    assert.equal(canAccessScreen(admin, 'diretoria-cockpit'), false);
    assert.equal(
      canAccessScreen({ name: 'Thiago Moreira', role: 'Diretoria', permissions: ['*'] }, 'diretoria-cockpit'),
      true,
    );
  });

  it('fallback escolhe primeira tela liberada', () => {
    assert.equal(fallbackScreenForUser({ role: 'Operador', permissions: ['quotes'] }), 'quotes');
  });
});
