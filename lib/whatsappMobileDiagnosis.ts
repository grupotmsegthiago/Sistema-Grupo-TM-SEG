/**
 * Diagnóstico de conexão Z-API — prioriza fluxo MOBILE (wa_old / SMS / voz).
 *
 * Instância MOBILE = aparelho PRINCIPAL. Conecta via:
 * registration-available → request-registration-code (wa_old|sms|voice)
 * → confirm-registration-code → (confirm-pin-code) → device-transfer-confirmed
 */

export type MobileConnectionDiagnosis = {
  instanceType: "web" | "mobile";
  connected: boolean;
  registrationBlocked: boolean;
  hasAppealToken: boolean;
  smsBlocked: boolean;
  phoneCodeAvailable: boolean;
  /** Caminho recomendado mantendo a preferência do cliente (mobile). */
  recommendedPath:
    | "already_connected"
    | "mobile_registration"
    | "wait_retry_mobile"
    | "mobile_unban"
    | "web_phone_code_or_qr";
  summaryPt: string;
  stepsPt: string[];
};

export function buildMobileConnectionDiagnosis(input: {
  instanceType: "web" | "mobile" | string | null | undefined;
  connected: boolean;
  registrationAvailable?: Record<string, unknown> | null;
  requestCodeResult?: Record<string, unknown> | null;
  phoneLinkCode?: string | null;
}): MobileConnectionDiagnosis {
  const instanceType = input.instanceType === "mobile" ? "mobile" : "web";
  const reg = input.registrationAvailable || {};
  const req = input.requestCodeResult || {};
  const registrationBlocked = req.blocked === true || reg.blocked === true;
  const appeal = String(req.appealToken || reg.appealToken || "").trim();
  const hasAppealToken = appeal.length > 10;
  const smsBlocked = Number(reg.smsWaitSeconds) === -1 || Number(req.smsWaitSeconds) === -1;
  const phoneCodeAvailable = !!String(input.phoneLinkCode || "").trim();

  if (input.connected) {
    return {
      instanceType,
      connected: true,
      registrationBlocked: false,
      hasAppealToken: false,
      smsBlocked: false,
      phoneCodeAvailable,
      recommendedPath: "already_connected",
      summaryPt: "Bot conectado.",
      stepsPt: [],
    };
  }

  if (instanceType === "web") {
    return {
      instanceType,
      connected: false,
      registrationBlocked,
      hasAppealToken,
      smsBlocked,
      phoneCodeAvailable,
      recommendedPath: "web_phone_code_or_qr",
      summaryPt: "Instância WEB: use QR ou código de 8 letras em Aparelhos conectados.",
      stepsPt: [
        "Gere o código/QR no sistema.",
        "No WhatsApp Business: Aparelhos conectados → Conectar → Vincular com número (ou QR).",
      ],
    };
  }

  // MOBILE
  if (registrationBlocked && hasAppealToken) {
    return {
      instanceType,
      connected: false,
      registrationBlocked: true,
      hasAppealToken: true,
      smsBlocked,
      phoneCodeAvailable,
      recommendedPath: "mobile_unban",
      summaryPt: "Número bloqueado com appealToken — dá para pedir desbanimento via Z-API e depois repetir SMS/pop-up.",
      stepsPt: [
        "Peça desbanimento no painel/API Z-API (request-unbanning) com o appealToken.",
        "Com o número liberado: deixe o WhatsApp Business aberto no eSIM.",
        "Solicite UMA vez: pop-up (wa_old) ou SMS/ligação.",
        "Se chegar código por SMS/voz, digite em “Confirmar código” no painel.",
      ],
    };
  }

  if (registrationBlocked) {
    return {
      instanceType,
      connected: false,
      registrationBlocked: true,
      hasAppealToken: false,
      smsBlocked,
      phoneCodeAvailable,
      recommendedPath: "wait_retry_mobile",
      summaryPt:
        "WhatsApp bloqueou o envio do código MOBILE agora (blocked sem appealToken). Continuamos no modo MOBILE — não use código de 8 letras. Pare de repetir pedidos; aguarde e tente de novo com o app aberto.",
      stepsPt: [
        "Pare de clicar várias vezes em Pop-up/SMS/health — pedidos em sequência pioram o blocked.",
        "No eSIM: abra o WhatsApp Business e deixe em primeiro plano.",
        "Aguarde 1–6 h (ou até smsWaitSeconds/voiceWaitSeconds voltarem ≥ 0).",
        "Depois peça UMA vez: Pop-up (wa_old) OU SMS OU Ligação.",
        "Se o código chegar por SMS/voz, cole em “Confirmar código” no painel (não em Aparelhos conectados).",
        "Se o pop-up aparecer no app, toque em Conectar/Confirmar na tela.",
        "Se continuar blocked por dias: chamado na Z-API com o número +55 (11) 92683-9456.",
      ],
    };
  }

  return {
    instanceType,
    connected: false,
    registrationBlocked: false,
    hasAppealToken: false,
    smsBlocked,
    phoneCodeAvailable,
    recommendedPath: "mobile_registration",
    summaryPt: "Instância MOBILE pronta: peça pop-up, SMS ou ligação e confirme o código no painel.",
    stepsPt: [
      "Deixe o WhatsApp Business aberto no eSIM.",
      "Clique em Pop-up (wa_old) — confirma o aviso na tela do celular.",
      "Ou SMS/Ligação — quando o código chegar, digite em “Confirmar código”.",
      "Se pedir PIN de 2 etapas, informe no campo PIN.",
      "Atenção: ao concluir, a Z-API vira o aparelho principal (o WhatsApp sai do aparelho físico).",
    ],
  };
}

/** Interpreta erros comuns de desconexão / conflito de sessão. */
export function explainMobileDisconnect(errorText: string | null | undefined): {
  kind: "session_conflict" | "not_connected" | "phone_offline" | "blocked" | "other";
  titlePt: string;
  stepsPt: string[];
} | null {
  const raw = String(errorText || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (/outra inst[aâ]ncia|another instance|efetuou login|restaurou|logged in on another/i.test(raw)) {
    return {
      kind: "session_conflict",
      titlePt: "Conflito de sessão: outra conexão tomou este número.",
      stepsPt: [
        "Feche WhatsApp Web / Desktop e qualquer outra instância Z-API no mesmo número.",
        "No painel Z-API, confirme que só existe UMA instância MOBILE ativa para +55 (11) 92683-9456.",
        "No eSIM: abra o WhatsApp Business e deixe em primeiro plano.",
        "Aqui no sistema: peça UMA vez Pop-up (wa_old) ou Ligação — não use código de 8 letras nem QR de “Aparelhos conectados”.",
        "Se chegar código por SMS/voz, digite em Confirmar código. Pop-up → confirme na tela do celular.",
      ],
    };
  }

  if (/smartphone|celular offline|phone.?offline/i.test(lower)) {
    return {
      kind: "phone_offline",
      titlePt: "Celular/eSIM offline para a Z-API.",
      stepsPt: [
        "Ligue o aparelho do eSIM, conecte à internet e abra o WhatsApp Business.",
        "Depois peça Pop-up (wa_old) ou Ligação UMA vez.",
      ],
    };
  }

  if (/blocked|bloqueou/i.test(lower)) {
    return {
      kind: "blocked",
      titlePt: "WhatsApp bloqueou o envio de código agora.",
      stepsPt: [
        "Pare de repetir cliques (piora o blocked).",
        "Aguarde o cooldown e tente Pop-up ou Ligação UMA vez com o Business aberto.",
      ],
    };
  }

  if (/not connected|desconectado|you are not connected/i.test(lower)) {
    return {
      kind: "not_connected",
      titlePt: "Bot desconectado — reconecte no fluxo MOBILE.",
      stepsPt: [
        "Abra o WhatsApp Business no eSIM.",
        "Peça Pop-up (wa_old) ou Ligação (SMS só se estiver liberado).",
        "Confirme o aviso no celular ou digite o código em Confirmar código.",
      ],
    };
  }

  return {
    kind: "other",
    titlePt: raw.slice(0, 160),
    stepsPt: [
      "Use Pop-up (wa_old) ou Ligação com o WhatsApp Business aberto.",
      "Não use código de 8 letras enquanto a instância for MOBILE.",
    ],
  };
}

/** Escolhe o melhor método mobile conforme waits da registration-available. */
export function pickMobileRegistrationMethod(
  registration: Record<string, unknown> | null | undefined,
  preferred: "wa_old" | "sms" | "voice" = "wa_old",
): { method: "wa_old" | "sms" | "voice"; reason: string; deferredSeconds: number } {
  const reg = registration || {};
  const smsWait = Number(reg.smsWaitSeconds ?? 0);
  const voiceWait = Number(reg.voiceWaitSeconds ?? 0);
  const waOldWait = Number(reg.waOldWaitSeconds ?? 0);
  const waOldEligible = reg.waOldEligible !== false;

  const candidates: Array<{ method: "wa_old" | "sms" | "voice"; wait: number; ok: boolean }> = [
    { method: "wa_old", wait: waOldWait, ok: waOldEligible && waOldWait >= 0 },
    { method: "voice", wait: voiceWait, ok: voiceWait >= 0 },
    { method: "sms", wait: smsWait, ok: smsWait >= 0 },
  ];

  const preferredOk = candidates.find((c) => c.method === preferred && c.ok && c.wait === 0);
  if (preferredOk) {
    return { method: preferredOk.method, reason: `preferido ${preferred} disponível agora`, deferredSeconds: 0 };
  }

  const immediate = candidates.find((c) => c.ok && c.wait === 0);
  if (immediate) {
    return { method: immediate.method, reason: `${immediate.method} disponível agora`, deferredSeconds: 0 };
  }

  const soonest = candidates
    .filter((c) => c.ok && c.wait > 0)
    .sort((a, b) => a.wait - b.wait)[0];
  if (soonest) {
    return {
      method: soonest.method,
      reason: `aguardar ${soonest.wait}s para ${soonest.method}`,
      deferredSeconds: soonest.wait,
    };
  }

  return {
    method: preferred,
    reason: "nenhum canal liberado (smsWaitSeconds=-1 / blocked) — aguarde e tente depois",
    deferredSeconds: Math.max(smsWait < 0 ? 0 : smsWait, voiceWait, waOldWait, 3600),
  };
}
