// ─── Fila de envios Z-API com intervalo mínimo (anti-spam / anti-ban) ───────
//
// Boas práticas da Z-API (developer.z-api.io/tips/best-practices): evitar
// disparos contínuos e rápidos — espaçar as mensagens reduz o risco de o
// WhatsApp classificar o número como automação/spam.
//
// Todos os envios do bot (send-text / send-image, individual ou grupo) passam
// por esta fila única: as mensagens saem em ordem, com um intervalo mínimo
// entre uma e outra. A PRIMEIRA mensagem sai na hora (sem atraso); só quando
// há envios em sequência é que o espaçamento entra.
//
// Intervalo configurável por env ZAPI_SEND_MIN_INTERVAL_MS (padrão 20s).

const DEFAULT_MIN_INTERVAL_MS = 20_000;

function minIntervalMs(): number {
  const raw = Number(process.env.ZAPI_SEND_MIN_INTERVAL_MS || '');
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_MIN_INTERVAL_MS;
}

// Teto de espera da fila por envio: se uma requisição de rede "pendurar",
// a fila libera o próximo envio depois deste tempo (a requisição original
// continua correndo e o chamador recebe o resultado dela normalmente).
const MAX_HOLD_MS = 45_000;

let lastSendAt = 0;
let chain: Promise<void> = Promise.resolve();
let chainPending = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export type ZapiQueueMeta = { queueWaitMs: number; queueDepth: number };

/**
 * Enfileira um envio Z-API garantindo o intervalo mínimo desde o envio
 * anterior. Retorna o resultado (ou o erro) da função original.
 * Passe `meta` para registrar tempo de fila e profundidade na entrada.
 */
export function throttleZapiSend<T>(
  label: string,
  fn: () => Promise<T>,
  meta?: ZapiQueueMeta,
): Promise<T> {
  const depthAtEntry = chainPending;
  chainPending += 1;
  if (meta) meta.queueDepth = depthAtEntry;

  const prev = chain;
  let release!: () => void;
  chain = new Promise<void>(r => (release = r));
  return (async () => {
    try {
      await prev;
      const wait = lastSendAt + minIntervalMs() - Date.now();
      const queueWaitMs = wait > 0 ? wait : 0;
      if (meta) meta.queueWaitMs = queueWaitMs;
      if (wait > 0) {
        console.log(`[Z-API Fila] Aguardando ${(wait / 1000).toFixed(1)}s (fila=${depthAtEntry}) antes de enviar (${label}).`);
        await sleep(wait);
      }
      const p = fn();
      void Promise.race([p.then(() => undefined, () => undefined), sleep(MAX_HOLD_MS)]).then(() => {
        lastSendAt = Date.now();
        chainPending = Math.max(0, chainPending - 1);
        release();
      });
      return p;
    } catch (e) {
      chainPending = Math.max(0, chainPending - 1);
      release();
      throw e;
    }
  })();
}
