/**
 * Helpers do SDK de conexão Z-API (modal oficial).
 * Doc: https://developer.z-api.io/partner/sdk-connector
 */

export type ZapiSdkConnector = {
  open: (options: {
    token: string;
    theme?: "light" | "dark" | Record<string, unknown>;
    locale?: string;
    messages?: Record<string, string>;
    methods?: { qr?: boolean; phone?: boolean; migrate?: boolean };
    showQueue?: boolean;
    onSubscribe?: () => void;
    container?: string | HTMLElement;
  }) => Promise<boolean>;
  close: () => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ZAPIConnector?: ZapiSdkConnector;
  }
}

const SDK_SRC = "https://app.z-api.io/sdk.js";
let loadPromise: Promise<ZapiSdkConnector> | null = null;

/** Carrega https://app.z-api.io/sdk.js uma vez e devolve window.ZAPIConnector. */
export function loadZapiSdkConnector(): Promise<ZapiSdkConnector> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("SDK Connector só roda no navegador"));
  }
  if (window.ZAPIConnector) return Promise.resolve(window.ZAPIConnector);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<ZapiSdkConnector>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SDK_SRC}"]`) as HTMLScriptElement | null;
    const finish = () => {
      if (window.ZAPIConnector) resolve(window.ZAPIConnector);
      else reject(new Error("SDK carregou, mas window.ZAPIConnector não está disponível"));
    };
    if (existing) {
      if (window.ZAPIConnector) {
        finish();
        return;
      }
      existing.addEventListener("load", finish);
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar SDK Z-API")));
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onload = finish;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Falha ao carregar https://app.z-api.io/sdk.js"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Abre o modal oficial. Para MOBILE, prioriza fluxo por número
 * (SMS / ligação / WhatsApp pop-up) — o SDK escolhe a tela pelo token.
 */
export async function openZapiSdkConnector(options: {
  token: string;
  instanceType?: "web" | "mobile" | string | null;
}): Promise<boolean> {
  const connector = await loadZapiSdkConnector();
  const isMobile = options.instanceType === "mobile";
  return connector.open({
    token: options.token,
    locale: "pt",
    theme: "light",
    showQueue: true,
    // MOBILE: esconde QR/migração WEB; o SDK mostra o fluxo mSms/mCall/mWhatsapp.
    methods: isMobile
      ? { qr: false, phone: true, migrate: false }
      : { qr: true, phone: true, migrate: true },
  });
}
