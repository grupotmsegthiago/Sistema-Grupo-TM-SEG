import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMobileConnectionDiagnosis,
  explainMobileDisconnect,
  isZapiSessionConnected,
  pickMobileRegistrationMethod,
  resolveMobileChannelWaits,
} from '../lib/whatsappMobileDiagnosis';

describe('whatsappMobileDiagnosis', () => {
  it('MOBILE + blocked sem appealToken → wait_retry_mobile (não WEB)', () => {
    const d = buildMobileConnectionDiagnosis({
      instanceType: 'mobile',
      connected: false,
      registrationAvailable: { available: true, smsWaitSeconds: -1 },
      requestCodeResult: { success: false, blocked: true },
      phoneLinkCode: 'ABCDEFGH',
    });
    assert.equal(d.recommendedPath, 'wait_retry_mobile');
    assert.equal(d.registrationBlocked, true);
    assert.match(d.summaryPt, /MOBILE/i);
    assert.doesNotMatch(d.summaryPt, /converta para WEB/i);
    assert.equal(d.phoneCodeAvailable, false);
  });

  it('WEB desconectado → phone-code/QR', () => {
    const d = buildMobileConnectionDiagnosis({
      instanceType: 'web',
      connected: false,
      phoneLinkCode: 'ABCDEFGH',
    });
    assert.equal(d.recommendedPath, 'web_phone_code_or_qr');
    assert.equal(d.phoneCodeAvailable, true);
  });

  it('MOBILE sem bloqueio e waits=0 → registro mobile', () => {
    const d = buildMobileConnectionDiagnosis({
      instanceType: 'mobile',
      connected: false,
      registrationAvailable: { available: true, waOldEligible: true, smsWaitSeconds: 0, voiceWaitSeconds: 0, waOldWaitSeconds: 0 },
    });
    assert.equal(d.recommendedPath, 'mobile_registration');
  });

  it('MOBILE available:true com cooldown 300s (sem waOldWait) → wait_retry_mobile', () => {
    const d = buildMobileConnectionDiagnosis({
      instanceType: 'mobile',
      connected: false,
      registrationAvailable: {
        available: true,
        retryAfter: 300,
        smsWaitSeconds: 300,
        voiceWaitSeconds: 300,
      },
    });
    assert.equal(d.recommendedPath, 'wait_retry_mobile');
    assert.ok(d.waitSeconds >= 300);
    assert.match(d.summaryPt, /cooldown|aguarde/i);
  });

  it('resolveMobileChannelWaits herda cooldown quando waOld omitido', () => {
    const w = resolveMobileChannelWaits({
      available: true,
      retryAfter: 300,
      smsWaitSeconds: 300,
      voiceWaitSeconds: 300,
    });
    assert.equal(w.waOld, 300);
    assert.equal(w.soonestReady, 300);
  });

  it('isZapiSessionConnected MOBILE ignora smartphoneConnected', () => {
    assert.equal(isZapiSessionConnected({ connected: true, smartphoneConnected: false }, 'mobile'), true);
    assert.equal(isZapiSessionConnected({ connected: true, smartphoneConnected: false }, 'web'), false);
    assert.equal(isZapiSessionConnected({ connected: false }, 'mobile'), false);
  });

  it('pickMobileRegistrationMethod prefere wa_old imediato', () => {
    const p = pickMobileRegistrationMethod({
      waOldEligible: true,
      waOldWaitSeconds: 0,
      voiceWaitSeconds: 0,
      smsWaitSeconds: -1,
    }, 'wa_old');
    assert.equal(p.method, 'wa_old');
    assert.equal(p.deferredSeconds, 0);
  });

  it('pickMobileRegistrationMethod NÃO assume wa_old livre em cooldown omitido', () => {
    const p = pickMobileRegistrationMethod({
      available: true,
      retryAfter: 300,
      smsWaitSeconds: 300,
      voiceWaitSeconds: 300,
    }, 'wa_old');
    assert.ok(p.deferredSeconds >= 300);
  });

  it('pickMobileRegistrationMethod evita SMS com wait -1', () => {
    const p = pickMobileRegistrationMethod({
      waOldEligible: false,
      waOldWaitSeconds: 0,
      voiceWaitSeconds: 10,
      smsWaitSeconds: -1,
    }, 'sms');
    assert.equal(p.method, 'voice');
    assert.equal(p.deferredSeconds, 10);
  });

  it('explainMobileDisconnect detecta conflito de outra instância', () => {
    const h = explainMobileDisconnect('Outra instância efetuou login neste número celular e restaurou. Desconectou.');
    assert.equal(h?.kind, 'session_conflict');
    assert.match(h!.titlePt, /Conflito/i);
    assert.ok(h!.stepsPt.length >= 3);
  });
});
