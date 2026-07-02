// Fluxo FOTO → TEXTO para WhatsApp.
//
// LIMITAÇÃO REAL (comprovada em teste): o WhatsApp Web IGNORA a imagem quando
// o clipboard tem texto+imagem no mesmo ClipboardItem — ele sempre cola só o
// texto, independentemente da ordem dos formatos. O padrão foto+legenda do
// WhatsApp exige DUAS colagens: 1) colar a FOTO (abre a caixa de legenda),
// 2) colar o TEXTO na legenda. Como o clipboard só comporta um conteúdo por
// vez, este fluxo copia a FOTO primeiro e troca para o TEXTO automaticamente
// quando o usuário volta o foco para a aba (após colar a foto no WhatsApp),
// com um botão de apoio numa barra flutuante não bloqueante.

let activeBar: HTMLDivElement | null = null;
let cleanupFns: Array<() => void> = [];

function removeBar() {
    cleanupFns.forEach(fn => { try { fn(); } catch {} });
    cleanupFns = [];
    if (activeBar) { activeBar.remove(); activeBar = null; }
}

/**
 * Copia a FOTO para o clipboard e arma a troca automática para o TEXTO.
 * Retorna true se a foto foi copiada e o fluxo foi iniciado.
 * Lança/retorna false em navegadores sem suporte — o chamador decide o fallback.
 */
export async function startWhatsappPhotoTextFlow(photoBlob: Blob, text: string): Promise<boolean> {
    if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') return false;
    // FOTO SOZINHA no clipboard: é o único jeito de o WhatsApp abrir a
    // pré-visualização da foto com a caixa de legenda.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': photoBlob })]);

    removeBar();
    const bar = document.createElement('div');
    bar.setAttribute('data-testid', 'bar-whatsapp-copy-flow');
    bar.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:10px;background:#0f172a;color:#fff;border:1px solid rgba(245,158,11,.55);border-radius:14px;padding:10px 14px;box-shadow:0 10px 30px rgba(0,0,0,.45);max-width:92vw;';

    const span = document.createElement('span');
    span.style.cssText = 'font-size:12px;font-weight:800;letter-spacing:.02em;line-height:1.35;';
    span.textContent = '1) FOTO copiada — cole no WhatsApp (Ctrl+V). 2) Volte aqui: o TEXTO da legenda copia sozinho.';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'COPIAR TEXTO';
    btn.setAttribute('data-testid', 'button-copy-caption-text');
    btn.style.cssText = 'font-size:11px;font-weight:900;background:#f59e0b;color:#111;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;white-space:nowrap;';

    let textCopied = false;
    const copyText = async () => {
        try {
            await navigator.clipboard.writeText(text);
            textCopied = true;
            span.textContent = '✅ TEXTO copiado — volte ao WhatsApp e cole (Ctrl+V) na LEGENDA da foto.';
            btn.style.display = 'none';
            bar.style.background = '#065f46';
            bar.style.border = '1px solid rgba(16,185,129,.8)';
            setTimeout(() => { if (activeBar === bar) removeBar(); }, 20000);
        } catch {
            // Sem foco/permissão: mantém o botão para o clique manual
        }
    };
    btn.onclick = () => { void copyText(); };

    // Troca automática: quando o usuário SAI da aba (vai colar a foto no
    // WhatsApp) e VOLTA, o texto é copiado sozinho. Gatilhos redundantes:
    // focus da janela E visibilitychange (troca de aba no mesmo navegador).
    let leftTab = false;
    const markLeft = () => { leftTab = true; };
    const tryAutoCopy = () => { if (leftTab && !textCopied) void copyText(); };
    const onBlur = () => { markLeft(); };
    const onFocus = () => { tryAutoCopy(); };
    const onVisibility = () => {
        if (document.visibilityState === 'hidden') markLeft();
        else tryAutoCopy();
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    cleanupFns.push(() => {
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisibility);
    });

    bar.appendChild(span);
    bar.appendChild(btn);
    document.body.appendChild(bar);
    activeBar = bar;
    // Autolimpeza de segurança
    setTimeout(() => { if (activeBar === bar) removeBar(); }, 180000);
    return true;
}
