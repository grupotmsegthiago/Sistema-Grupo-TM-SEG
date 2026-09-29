import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { shouldCaptureApprovalScreenshot } from '../lib/billing/missionFinancialSavePerf.ts';

describe('Performance Salvar/Aprovar missão', () => {
  it('print de auditoria só na aprovação (Salvar não captura)', () => {
    assert.equal(shouldCaptureApprovalScreenshot(false), false);
    assert.equal(shouldCaptureApprovalScreenshot(true), true);
  });

  it('MissionFinancialModal: UPDATE da OS antes do print; Salvar não chama captura', () => {
    const source = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const handleStart = source.indexOf('const handleUpdate = async');
    const handleEnd = source.indexOf('const filteredProviderTables', handleStart);
    assert.ok(handleStart > 0 && handleEnd > handleStart, 'bloco handleUpdate encontrado');
    const block = source.slice(handleStart, handleEnd);

    // Não pode haver captura bloqueando ANTES do update de missions
    const updateIdx = block.indexOf("supabase.from('missions').update(fullPayload)");
    const screenshotIdx = block.indexOf('captureModalScreenshotAfterSave');
    assert.ok(updateIdx > 0, 'UPDATE missions presente');
    assert.ok(screenshotIdx > 0, 'captura pós-save presente');
    assert.ok(updateIdx < screenshotIdx, 'UPDATE deve vir antes do print');

    assert.match(block, /shouldCaptureApprovalScreenshot\(approve\)/);
    assert.doesNotMatch(block, /await captureModalScreenshot\(/);
  });

  it('UpdateMissionModal: envio WhatsApp ao grupo não prende o spinner do save', () => {
    const source = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    // Fire-and-forget explícito nos dois pontos de envio ao grupo
    assert.match(source, /void \(async \(\) => \{\s*const groupPhoto = await resolveGroupWhatsAppPhoto/);
    assert.match(source, /void sendUpdateToClientGroup\(mission\.client/);
    // Checagem de e-mail cliente/fornecedor em paralelo
    assert.match(source, /const \[byNameRes, byTradingRes, byIlikeRes\] = await Promise\.all\(/);
  });
});
