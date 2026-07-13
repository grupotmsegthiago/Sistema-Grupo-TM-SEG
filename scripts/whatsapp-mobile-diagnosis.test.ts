import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMobileConnectionDiagnosis } from '../lib/whatsappMobileDiagnosis';

describe('whatsappMobileDiagnosis', () => {
  it('MOBILE + blocked sem appealToken → recomenda converter para WEB', () => {
    const d = buildMobileConnectionDiagnosis({
      instanceType: 'mobile',
      connected: false,
      registrationAvailable: { available: true, smsWaitSeconds: -1 },
      requestCodeResult: { success: false, blocked: true },
      phoneLinkCode: 'ABCDEFGH',
    });
    assert.equal(d.recommendedPath, 'convert_to_web');
    assert.equal(d.registrationBlocked, true);
    assert.match(d.summaryPt, /NÃO conecta/i);
  });

  it('WEB desconectado → phone-code/QR', () => {
    const d = buildMobileConnectionDiagnosis({
      instanceType: 'web',
      connected: false,
      phoneLinkCode: 'ABCDEFGH',
    });
    assert.equal(d.recommendedPath, 'web_phone_code_or_qr');
  });

  it('MOBILE sem bloqueio → registro mobile', () => {
    const d = buildMobileConnectionDiagnosis({
      instanceType: 'mobile',
      connected: false,
      registrationAvailable: { available: true, waOldEligible: true },
      requestCodeResult: { success: true },
    });
    assert.equal(d.recommendedPath, 'mobile_registration');
  });
});
