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
    assert.match(modal, /\/api\/os-analysis\?op=open/);
    assert.match(modal, /\/api\/os-analysis\?op=respond/);
    assert.match(losses, /RequestOsAnalysisModal/);
    assert.match(missing, /RequestOsAnalysisModal/);
    assert.match(app, /os-analysis-pending/);
    assert.match(sidebar, /canRequestOsAnalysis/);
    const requestModal = fs.readFileSync('components/RequestOsAnalysisModal.tsx', 'utf8');
    assert.match(requestModal, /\/api\/os-analysis\?op=request/);
    assert.match(requestModal, /from 'react'/);
    assert.match(requestModal, /list-os-analysis-recipients/);
    assert.match(requestModal, /recipients/);
    assert.match(fs.readFileSync('components/OsAnalysisPendingPage.tsx', 'utf8'), /\/api\/os-analysis\?/);
    assert.match(fs.readFileSync('components/OsAnalysisPendingPage.tsx', 'utf8'), /from 'react'/);
    assert.match(fs.readFileSync('api/os-analysis.ts', 'utf8'), /op === 'request'/);
    assert.match(fs.readFileSync('api/os-analysis.ts', 'utf8'), /op === 'inbox'/);
    assert.match(fs.readFileSync('api/os-analysis.ts', 'utf8'), /op === 'claim'/);
    assert.match(fs.readFileSync('vercel.json', 'utf8'), /api\/os-analysis/);
    assert.match(app, /OsAnalysisDiretoriaModal/);
    assert.match(fs.readFileSync('components/OsAnalysisDiretoriaModal.tsx', 'utf8'), /Um recado da Diretoria/);
    assert.match(fs.readFileSync('components/OsAnalysisDiretoriaModal.tsx', 'utf8'), /from 'react'/);
    assert.match(fs.readFileSync('migrations/2026_07_29_os_analysis_recipients_claim.sql', 'utf8'), /recipient_ids/);
  });
});
