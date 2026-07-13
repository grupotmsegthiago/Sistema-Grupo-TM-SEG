/**
 * Diagnóstico de conexão Z-API — mobile vs web.
 *
 * Instância MOBILE = aparelho PRINCIPAL (Z-API no lugar do celular).
 * Conecta só via registro: SMS / voz / wa_old → confirm-registration-code.
 *
 * phone-code (8 letras) + QR = fluxo WEB (aparelho SECUNDÁRIO / “Aparelhos conectados”).
 * Gerar phone-code em instância MOBILE bloqueada engana o operador: o código “não conecta”.
 */

export type MobileConnectionDiagnosis = {
  instanceType: "web" | "mobile";
  connected: boolean;
  registrationBlocked: boolean;
  hasAppealToken: boolean;
  smsBlocked: boolean;
  phoneCodeAvailable: boolean;
  /** Caminho que realmente pode conectar neste momento */
  recommendedPath: "already_connected" | "mobile_registration" | "web_phone_code_or_qr" | "convert_to_web" | "zapi_support";
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
      summaryPt: "Instância WEB: use QR ou código de 8 letras em Aparelhos conectados (celular continua como principal).",
      stepsPt: [
        "Gere o código/QR no sistema.",
        "No WhatsApp Business do eSIM: Aparelhos conectados → Conectar → Vincular com número (ou escanear QR).",
        "Cole o código de 8 letras antes de expirar.",
      ],
    };
  }

  // MOBILE
  if (registrationBlocked && !hasAppealToken) {
    return {
      instanceType,
      connected: false,
      registrationBlocked: true,
      hasAppealToken: false,
      smsBlocked,
      phoneCodeAvailable,
      recommendedPath: "convert_to_web",
      summaryPt:
        "WhatsApp bloqueou o registro MOBILE (blocked sem appealToken). O código de 8 letras NÃO conecta instância MOBILE — ele é só para WEB. Por isso o bot não conecta.",
      stepsPt: [
        "No painel Z-API: troque esta instância para WEB (ou crie uma WEB) e atualize ZAPI_INSTANCE_TYPE=web / instance_type no sistema.",
        "Depois use QR ou código de vinculação (Aparelhos conectados) — o celular permanece como principal.",
        "Alternativa frágil: deslogar o WhatsApp do eSIM e tentar SMS/ligação de novo (pode continuar blocked).",
        "Se precisar manter MOBILE: abra chamado na Z-API — sem appealToken a API não desbloqueia.",
      ],
    };
  }

  if (registrationBlocked && hasAppealToken) {
    return {
      instanceType,
      connected: false,
      registrationBlocked: true,
      hasAppealToken: true,
      smsBlocked,
      phoneCodeAvailable,
      recommendedPath: "zapi_support",
      summaryPt: "Número bloqueado com appealToken — dá para pedir desbanimento via Z-API (request-unbanning).",
      stepsPt: [
        "Use o endpoint/painel Z-API de desbanimento com o appealToken.",
        "Após liberar, rode registration-available → request-registration-code (SMS/voz/wa_old).",
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
    summaryPt: "Instância MOBILE: o bot vira o aparelho PRINCIPAL. Use pop-up/SMS/ligação — não use código de 8 letras de ‘Aparelhos conectados’.",
    stepsPt: [
      "Deixe o WhatsApp Business aberto no eSIM.",
      "Peça pop-up (wa_old) ou SMS/ligação no sistema.",
      "Confirme no celular; se pedir PIN de 2 etapas, informe no painel.",
      "Atenção: ao conectar MOBILE, o WhatsApp sai do aparelho físico.",
    ],
  };
}
