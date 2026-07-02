// Popup guiado FOTO → TEXTO para WhatsApp.
//
// LIMITAÇÃO REAL (comprovada em teste): o WhatsApp Web IGNORA a imagem quando
// o clipboard tem texto+imagem no mesmo ClipboardItem — sempre cola só o
// texto, em qualquer ordem. O padrão foto+legenda exige DUAS colagens:
// 1) FOTO sozinha no clipboard (abre a caixa de legenda), 2) TEXTO na legenda.
//
// Este popup OBRIGA o funcionário a seguir o fluxo certo:
//   PASSO 1: botão COPIAR FOTO  → cola a foto no WhatsApp
//   PASSO 2: botão COPIAR TEXTO → cola na legenda e envia
// Após copiar o texto, o popup fecha sozinho. Como cada cópia acontece num
// clique (gesto do usuário), funciona também em Safari/iOS.

let activeOverlay: HTMLDivElement | null = null;

function removePopup() {
    if (activeOverlay) { activeOverlay.remove(); activeOverlay = null; }
}

// NÃO abrir/focar o WhatsApp via window.open: abre uma NOVA aba do WhatsApp Web
// e desconecta a sessão que o funcionário já tem aberta. Alt+Tab real não é
// possível a partir de uma página — o usuário troca de janela manualmente.

/**
 * Abre o popup guiado de cópia FOTO → TEXTO.
 * Retorna true se o popup foi aberto; false se o navegador não suporta
 * copiar imagem (o chamador decide o fallback de texto).
 */
export function showWhatsappCopyPopup(photoBlob: Blob, text: string): boolean {
    if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') return false;

    removePopup();

    const overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'overlay-whatsapp-copy-popup');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.78);backdrop-filter:blur(3px);padding:16px;';

    const card = document.createElement('div');
    card.style.cssText = 'width:100%;max-width:430px;background:#0f172a;border:1px solid rgba(245,158,11,.55);border-radius:20px;padding:26px 24px;box-shadow:0 24px 60px rgba(0,0,0,.6);text-align:center;';

    const title = document.createElement('p');
    title.style.cssText = 'font-size:13px;font-weight:900;letter-spacing:.08em;color:#f59e0b;text-transform:uppercase;margin:0 0 6px;';
    title.textContent = 'Envio para WhatsApp — foto + texto';

    const step = document.createElement('p');
    step.setAttribute('data-testid', 'text-whatsapp-copy-step');
    step.style.cssText = 'font-size:13px;font-weight:700;color:#e2e8f0;line-height:1.5;margin:0 0 18px;';
    step.textContent = 'PASSO 1: copie a FOTO e cole no WhatsApp (Ctrl+V).';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-testid', 'button-whatsapp-copy-step');
    btn.textContent = 'COPIAR FOTO';
    const baseBtnCss = 'width:100%;font-size:14px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;border:none;border-radius:14px;padding:14px 16px;cursor:pointer;transition:filter .15s;';
    btn.style.cssText = baseBtnCss + 'background:#f59e0b;color:#111;';
    btn.onmouseenter = () => { btn.style.filter = 'brightness(1.1)'; };
    btn.onmouseleave = () => { btn.style.filter = ''; };

    const err = document.createElement('p');
    err.style.cssText = 'display:none;font-size:11px;font-weight:700;color:#f87171;margin:12px 0 0;';

    const closeLink = document.createElement('button');
    closeLink.type = 'button';
    closeLink.textContent = 'Fechar sem copiar';
    closeLink.setAttribute('data-testid', 'button-whatsapp-copy-close');
    closeLink.style.cssText = 'display:none;margin-top:12px;background:none;border:none;color:#64748b;font-size:11px;font-weight:700;text-decoration:underline;cursor:pointer;';
    closeLink.onclick = () => removePopup();

    const showError = (msg: string) => {
        err.textContent = msg;
        err.style.display = 'block';
        // Só libera a saída quando algo deu errado — senão o fluxo é obrigatório
        closeLink.style.display = 'inline-block';
    };

    // Animação de progresso "preenchendo o botão" enquanto copia
    const fill = document.createElement('div');
    fill.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(255,255,255,.35);pointer-events:none;transition:width .9s ease;';
    const label = document.createElement('span');
    label.style.cssText = 'position:relative;z-index:1;';
    label.textContent = 'COPIAR FOTO';
    btn.textContent = '';
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(fill);
    btn.appendChild(label);

    // Duração pedida pelo usuário: ~10s de preenchimento para deixar claro que é para esperar
    const PROGRESS_MS = 10000;
    const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));
    const runProgress = async (loadingLabel: string, work: Promise<unknown>) => {
        label.textContent = loadingLabel;
        fill.style.transition = 'none';
        fill.style.width = '0';
        // Força reflow para a transição reiniciar do zero
        void fill.offsetWidth;
        fill.style.transition = `width ${PROGRESS_MS / 1000}s linear`;
        fill.style.width = '100%';
        // Cópia é rápida; segura a animação inteira para completar o botão
        await Promise.all([work, delay(PROGRESS_MS)]);
        fill.style.transition = 'none';
        fill.style.width = '0';
    };

    let stage: 'photo' | 'text' = 'photo';
    btn.onclick = () => {
        void (async () => {
            btn.disabled = true;
            btn.style.cursor = 'wait';
            try {
                if (stage === 'photo') {
                    // FOTO SOZINHA no clipboard: único jeito de o WhatsApp abrir a
                    // pré-visualização da foto com a caixa de legenda.
                    // A escrita começa JÁ no clique (gesto) — a animação corre em paralelo.
                    await runProgress('COPIANDO FOTO...', navigator.clipboard.write([new ClipboardItem({ 'image/png': photoBlob })]));
                    stage = 'text';
                    err.style.display = 'none';
                    step.textContent = 'FOTO copiada ✅ — cole no WhatsApp (Ctrl+V). Depois volte e copie o TEXTO da legenda.';
                    label.textContent = 'COPIAR TEXTO';
                    btn.style.cssText = baseBtnCss + 'background:#10b981;color:#052e22;position:relative;overflow:hidden;';
                } else {
                    await runProgress('COPIANDO TEXTO...', navigator.clipboard.writeText(text));
                    err.style.display = 'none';
                    step.textContent = 'TEXTO copiado ✅ — cole na LEGENDA da foto no WhatsApp e envie.';
                    btn.style.display = 'none';
                    closeLink.style.display = 'none';
                    setTimeout(() => { if (activeOverlay === overlay) removePopup(); }, 1600);
                }
            } catch (e) {
                console.warn('[WhatsappCopyPopup] Falha ao copiar:', e);
                label.textContent = stage === 'photo' ? 'COPIAR FOTO' : 'COPIAR TEXTO';
                showError(stage === 'photo'
                    ? 'Não foi possível copiar a foto neste navegador. Tente de novo ou feche.'
                    : 'Não foi possível copiar o texto. Tente de novo ou feche.');
            } finally {
                btn.disabled = false;
                btn.style.cursor = 'pointer';
            }
        })();
    };

    card.appendChild(title);
    card.appendChild(step);
    card.appendChild(btn);
    card.appendChild(err);
    card.appendChild(closeLink);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    activeOverlay = overlay;
    return true;
}
