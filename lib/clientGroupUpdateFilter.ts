// ── Filtro global: envio ao grupo WhatsApp do cliente ─────────────────────
// O bot só posta no grupo quando o funcionário cola/anexa o print da
// atualização E houve mudança de status (marcos DHL seguem filtro adicional).
// Alterações rotineiras (agentes, viatura, etc.) sem print NÃO disparam envio.

import { shouldSendDhlGroupUpdate } from './dhlGroupUpdateFilter';

export function hasExplicitUpdatePrint(printBlob: Blob | null, printPreview: string): boolean {
    return !!printBlob || (printPreview?.startsWith('data:') ?? false);
}

export function shouldSendClientGroupWhatsApp(opts: {
    finalStatus: string;
    originalStatus: string;
    hasExplicitPrint: boolean;
    isMissionCompletion: boolean;
    isDhl: boolean;
    occurrence: string;
    previousOccurrence: string;
}): boolean {
    if (opts.isMissionCompletion) {
        return opts.hasExplicitPrint;
    }

    if (!opts.hasExplicitPrint) return false;

    const statusChanged = opts.finalStatus !== opts.originalStatus;
    if (!statusChanged) return false;

    if (opts.isDhl) {
        return shouldSendDhlGroupUpdate({
            finalStatus: opts.finalStatus,
            originalStatus: opts.originalStatus,
            occurrence: opts.occurrence,
            previousOccurrence: opts.previousOccurrence,
        });
    }

    return true;
}
