// ── Filtro global: envio ao grupo WhatsApp do cliente ─────────────────────
// Política: nos grupos de cliente o bot NÃO conversa — só envia atualização
// de OS (formulário/tabela + foto) quando o operador cola/anexa o print
// (ou, sem print, em mudança de status com foto fallback no frontend).
// Alterações rotineiras sem print e sem mudança de status NÃO disparam envio.
// DHL: com print, ainda passa pelo filtro de marcos/atípicos.
// Respostas conversacionais ficam restritas ao grupo Torres (torresGroupGate).

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

    const statusChanged = opts.finalStatus !== opts.originalStatus;

    // Com print colado: cliente comum sempre envia; DHL só marcos/atípicos/pernoite.
    // (Não exigir mudança de status — monitoramento Em Viagem + print é o caso típico.)
    if (opts.hasExplicitPrint) {
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

    // Sem print: só tenta envio se o status mudou (frontend usa foto fallback TM SEG).
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
