/**
 * Diagnóstico de conexão Z-API — prioriza fluxo MOBILE (wa_old / SMS / voz).
 *
 * Instância MOBILE = aparelho PRINCIPAL. Conecta via:
 * registration-available → request-registration-code (wa_old|sms|voice)
 * → confirm-registration-code → (confirm-pin-code) → device-transfer-confirmed
 *
 * Docs: https://developer.z-api.io/mobile/registration-available
 *       https://developer.z-api.io/mobile/request-code
 *
 * Regra de wait (Z-API):
 * - waitSeconds === 0 → pode solicitar agora
 * - waitSeconds > 0 → cooldown; NÃO solicitar (gera blocked)
 * - waitSeconds === -1 → canal bloqueado
 * - available:true NÃO significa “pode pedir agora” — respeitar waits
 * - Se a API omitir waOldWaitSeconds durante cooldown de SMS/voz/retryAfter,
 *   NÃO assumir pop-up liberado (omitir = herdar cooldown conhecido)
 */

export type MobileConnectionDiagnosis = {
  instanceType: "web" | "mobile";
  connected: boolean;
  registrationBlocked: boolean;
  hasAppealToken: boolean;
  smsBlocked: boolean;
  phoneCodeAvailable: boolean;
  /** Segundos até o próximo pedido seguro (0 = pode tentar). */
  waitSeconds: number;
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

export type MobileChannelWaits = {
  sms: number;
  voice: number;
  waOld: number;
  retryAfter: number;
  waOldEligible: boolean;
  /** Menor wait entre canais elegíveis; Infinity se nenhum. */
  soonestReady: number;
};

/**
 * Status de sessão Z-API.
 * MOBILE: a instância É o aparelho principal — `smartphoneConnected` não se aplica.
 * WEB: celular precisa estar online (`smartphoneConnected !== false`).
 */
export function isZapiSessionConnected(
  data: { connected?: boolean; smartphoneConnected?: boolean } | null | undefined,
  instanceType: "web" | "mobile" | string | null | undefined,
): boolean {
  if (data?.connected !== true) return false;
  if (instanceType === "mobile") return true;
  return data.smartphoneConnected !== false;
}

/** Canal liberado agora? Só wait === 0 (e elegível). -1 ou >0 = não. */
export function isMobileChannelReady(waitSeconds: number, eligible = true): boolean {
  if (!eligible) return false;
  return waitSeconds === 0;
}

/**
 * Normaliza waits da registration-available / request-registration-code.
 * Quando waOldWaitSeconds vem omitido mas há cooldown (retryAfter/sms/voice > 0),
 * herda o cooldown — evita falso “pop-up liberado”.
 */
export function resolveMobileChannelWaits(
  registration: Record<string, unknown> | null | undefined,
): MobileChannelWaits {
  const reg = registration || {};
  const retryAfter = Math.max(0, Number(reg.retryAfter ?? 0) || 0);
  const smsRaw = reg.smsWaitSeconds;
  const voiceRaw = reg.voiceWaitSeconds;
  const waOldRaw = reg.waOldWaitSeconds;
  const hasExplicitWaOld =
    Object.prototype.hasOwnProperty.call(reg, "waOldWaitSeconds")
    || Object.prototype.hasOwnProperty.call(reg, "waOldEligible");

  const sms = smsRaw === undefined || smsRaw === null ? 0 : Number(smsRaw);
  const voice = voiceRaw === undefined || voiceRaw === null ? 0 : Number(voiceRaw);
  let waOld = waOldRaw === undefined || waOldRaw === null ? 0 : Number(waOldRaw);
  const waOldEligible = reg.waOldEligible !== false;

  if (!hasExplicitWaOld) {
    const cooldownSignals = [retryAfter, sms > 0 ? sms : 0, voice > 0 ? voice : 0].filter((n) => n > 0);
    if (cooldownSignals.length > 0) {
      waOld = Math.max(...cooldownSignals);
    }
  }

  const candidates: number[] = [];
  if (waOldEligible && waOld >= 0) candidates.push(waOld);
  if (voice >= 0) candidates.push(voice);
  if (sms >= 0) candidates.push(sms);

  const soonestReady = candidates.length > 0 ? Math.min(...candidates) : Number.POSITIVE_INFINITY;

  return {
    sms: Number.isFinite(sms) ? sms : 0,
    voice: Number.isFinite(voice) ? voice : 0,
    waOld: Number.isFinite(waOld) ? waOld : 0,
    retryAfter,
    waOldEligible,
    soonestReady,
  };
}

function formatWaitPt(seconds: number): string {
  if (seconds <= 0) return "agora";
  if (seconds < 60) return `${seconds}s`;
  const min = Math.ceil(seconds / 60);
  return `~${min} min`;
}

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
  const waits = resolveMobileChannelWaits({ ...reg, ...req });
  const smsBlocked = waits.sms === -1;
  // phone-code só importa para WEB — em MOBILE não conta como caminho
  const phoneCodeAvailable = instanceType === "web" && !!String(input.phoneLinkCode || "").trim();
  const waitSeconds =
    Number.isFinite(waits.soonestReady) && waits.soonestReady > 0
      ? waits.soonestReady
      : Math.max(waits.retryAfter, 0);

  if (input.connected) {
    return {
      instanceType,
      connected: true,
      registrationBlocked: false,
      hasAppealToken: false,
      smsBlocked: false,
      phoneCodeAvailable,
      waitSeconds: 0,
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
      waitSeconds: 0,
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
      phoneCodeAvailable: false,
      waitSeconds,
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
      phoneCodeAvailable: false,
      waitSeconds: Math.max(waitSeconds, 3600),
      recommendedPath: "wait_retry_mobile",
      summaryPt:
        "WhatsApp bloqueou o envio do código MOBILE agora (blocked sem appealToken). Continuamos no modo MOBILE — não use código de 8 letras. Pare de repetir pedidos; aguarde e tente de novo com o app aberto.",
      stepsPt: [
        "Pare de clicar várias vezes em Pop-up/SMS/health — pedidos em sequência pioram o blocked.",
        "No eSIM: abra o WhatsApp Business e deixe em primeiro plano.",
        "Aguarde 1–6 h (ou até smsWaitSeconds/voiceWaitSeconds/waOldWaitSeconds voltarem a 0).",
        "Depois peça UMA vez: Pop-up (wa_old) OU SMS OU Ligação.",
        "Se o código chegar por SMS/voz, cole em “Confirmar código” no painel (não em Aparelhos conectados).",
        "Se o pop-up aparecer no app, toque em Conectar/Confirmar na tela.",
        "Se continuar blocked por dias: chamado na Z-API com o número +55 (11) 92683-9456.",
      ],
    };
  }

  // Cooldown: available:true com waits > 0 — NÃO está liberado para pedir agora
  const anyChannelReady =
    isMobileChannelReady(waits.waOld, waits.waOldEligible)
    || isMobileChannelReady(waits.voice)
    || isMobileChannelReady(waits.sms);

  if (!anyChannelReady && waitSeconds > 0) {
    return {
      instanceType,
      connected: false,
      registrationBlocked: false,
      hasAppealToken: false,
      smsBlocked,
      phoneCodeAvailable: false,
      waitSeconds,
      recommendedPath: "wait_retry_mobile",
      summaryPt: `WhatsApp em cooldown MOBILE — aguarde ${formatWaitPt(waitSeconds)} antes de novo Pop-up/SMS/Ligação (sms=${waits.sms}s, voz=${waits.voice}s, pop-up=${waits.waOld}s). Pedir agora gera blocked.`,
      stepsPt: [
        `Aguarde ${formatWaitPt(waitSeconds)} com o WhatsApp Business aberto no eSIM.`,
        "Não clique em Pop-up/SMS/Ligação durante o cooldown — a Z-API devolve blocked.",
        "Quando o painel mostrar canal liberado (wait = 0), peça UMA vez.",
        "Código SMS/voz → Confirmar código. Pop-up → confirme na tela do celular.",
        "Não use código de 8 letras / Aparelhos conectados (fluxo WEB).",
      ],
    };
  }

  return {
    instanceType,
    connected: false,
    registrationBlocked: false,
    hasAppealToken: false,
    smsBlocked,
    phoneCodeAvailable: false,
    waitSeconds: 0,
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
  const waits = resolveMobileChannelWaits(registration);

  const candidates: Array<{ method: "wa_old" | "sms" | "voice"; wait: number; ok: boolean }> = [
    { method: "wa_old", wait: waits.waOld, ok: waits.waOldEligible && waits.waOld >= 0 },
    { method: "voice", wait: waits.voice, ok: waits.voice >= 0 },
    { method: "sms", wait: waits.sms, ok: waits.sms >= 0 },
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
    deferredSeconds: Math.max(
      waits.sms < 0 ? 0 : waits.sms,
      waits.voice,
      waits.waOld,
      waits.retryAfter,
      3600,
    ),
  };
}
