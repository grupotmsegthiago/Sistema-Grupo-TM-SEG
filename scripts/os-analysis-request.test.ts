import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canRequestOsAnalysis, buildOsAuditDeepLink } from '../lib/osAnalysisAccess';

describe('Pedido de análise de OS', () => {
  it('somente Diretoria / Thiagos podem pedir', () => {
    assert.equal(canRequestOsAnalysis({ name: 'Thiago Moreira', role: 'Operador' }), true);
    assert.equal(canRequestOsAnalysis({ name: 'Thiago Santos' }), true);
    assert.equal(canRequestOsAnalysis({ name: 'Bárbara', role: 'Diretoria' }), true);
    assert.equal(canRequestOsAnalysis({ name: 'Bárbara Sgarlata', role: 'Administrador' }), false);
    assert.equal(canRequestOsAnalysis({ name: 'Giovanna', role: 'Administrador' }), false);
    assert.equal(canRequestOsAnalysis({ name: 'João', role: 'comercial' }), false);
  });

  it('deep link abre auditoria via openMission', () => {
    const link = buildOsAuditDeepLink('GTM-6215');
    assert.match(link, /page=missions/);
    assert.match(link, /openMission=GTM-6215/);
  });

  it('UI e rotas integradas', () => {
    const modal = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const losses = fs.readFileSync('components/LossesDialog.tsx', 'utf8');
    const missing = fs.readFileSync('components/MissingTableDialog.tsx', 'utf8');
    const app = fs.readFileSync('App.tsx', 'utf8');
    const sidebar = fs.readFileSync('components/Sidebar.tsx', 'utf8');
    assert.match(modal, /button-request-os-analysis/);
    assert.match(modal, /from 'react'/);
    assert.match(losses, /RequestOsAnalysisModal/);
    assert.match(missing, /RequestOsAnalysisModal/);
    assert.match(app, /os-analysis-pending/);
    assert.match(sidebar, /canRequestOsAnalysis/);
    assert.match(fs.readFileSync('components/RequestOsAnalysisModal.tsx', 'utf8'), /from 'react'/);
    assert.match(fs.readFileSync('components/OsAnalysisPendingPage.tsx', 'utf8'), /from 'react'/);
  });
});
