// Cópia para a área de transferência compatível com Safari/iOS.
//
// O Safari só permite escrever na área de transferência DENTRO do gesto do
// usuário (o clique). Quando o texto depende de uma chamada assíncrona (ex.:
// buscar dados no Supabase), chamar `navigator.clipboard.writeText()` DEPOIS de
// um `await` é bloqueado pelo Safari ("NotAllowedError"). A solução suportada é
// entregar uma `Promise<Blob>` ao `ClipboardItem`: a escrita fica atrelada ao
// gesto enquanto os dados são resolvidos em segundo plano.
//
// IMPORTANTE: para o gesto ser preservado, esta função precisa ser CHAMADA de
// forma síncrona dentro do handler do clique (sem `await` antes dela). Passe a
// Promise do texto já iniciada — não use `await` no texto antes de chamar aqui.
export async function copyTextAsync(textOrPromise: string | Promise<string>): Promise<boolean> {
    const textPromise = Promise.resolve(textOrPromise);

    // Caminho preferido (Safari + Chrome 116+): ClipboardItem com Promise.
    try {
        const CI: any = (typeof window !== 'undefined') ? (window as any).ClipboardItem : undefined;
        if (CI && navigator.clipboard && typeof navigator.clipboard.write === 'function') {
            const blobPromise = textPromise.then(t => new Blob([t], { type: 'text/plain' }));
            await navigator.clipboard.write([new CI({ 'text/plain': blobPromise })]);
            return true;
        }
    } catch {
        // cai para o fallback abaixo
    }

    // Fallback: writeText (funciona no Chrome; no Safari só se ainda houver gesto).
    try {
        const text = await textPromise;
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Último recurso: textarea + execCommand (navegadores antigos).
        try {
            const text = await textPromise;
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.top = '0';
            ta.style.left = '0';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch {
            return false;
        }
    }
}
