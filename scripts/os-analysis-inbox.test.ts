import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Recado da Diretoria — inbox e claim', () => {
  it('serviço filtra inbox e claim libera demais', () => {
    const src = fs.readFileSync('lib/osAnalysis/osAnalysisService.ts', 'utf8');
    assert.match(src, /listInboxForUser/);
    assert.match(src, /claimOsAnalysis/);
    assert.match(src, /recipient_ids/);
    assert.match(src, /claimed_by_id/);
    assert.match(src, /Selecione ao menos um destinatário/);
  });

  it('modal bloqueante montado no App', () => {
    assert.match(fs.readFileSync('App.tsx', 'utf8'), /OsAnalysisDiretoriaModal/);
    const modal = fs.readFileSync('components/OsAnalysisDiretoriaModal.tsx', 'utf8');
    assert.match(modal, /button-open-diretoria-message/);
    assert.match(modal, /button-claim-diretoria-message/);
    assert.match(modal, /banner-os-analysis-diretoria/);
    assert.match(modal, /op=inbox/);
    assert.match(modal, /op=claim/);
    assert.match(modal, /O que precisa ser feito/);
  });
});
