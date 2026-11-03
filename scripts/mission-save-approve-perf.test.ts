import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { shouldCaptureApprovalScreenshot } from '../lib/billing/missionFinancialSavePerf.ts';

describe('Performance Salvar/Aprovar missão', () => {
  it('aprovação não captura print de tela', () => {
    assert.equal(shouldCaptureApprovalScreenshot(false), false);
    assert.equal(shouldCaptureApprovalScreenshot(true), false);
  });

  it('MissionFinancialModal: UPDATE da OS sem html2canvas nem print', () => {
    const source = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const handleStart = source.indexOf('const handleUpdate = async');
    const handleEnd = source.indexOf('const filteredProviderTables', handleStart);
    assert.ok(handleStart > 0 && handleEnd > handleStart, 'bloco handleUpdate encontrado');
    const block = source.slice(handleStart, handleEnd);

    assert.ok(block.indexOf("supabase.from('missions').update(fullPayload)") > 0, 'UPDATE missions presente');
    assert.equal(source.indexOf('captureModalScreenshotAfterSave'), -1);
    assert.doesNotMatch(source, /import html2canvas/);
    assert.doesNotMatch(source, /action_type:\s*'APPROVAL_SCREENSHOT'/);
    assert.match(source, /neq\('action_type', 'APPROVAL_SCREENSHOT'\)/);
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
