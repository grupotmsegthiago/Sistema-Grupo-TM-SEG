/**
 * Injeta barra Editar/Excluir na pré-visualização do Plano de Ação DHL (somente UI).
 * O HTML “limpo” fica em previewHtml; use inject só no srcDoc do iframe.
 */

export const DHL_PREVIEW_MESSAGE_SOURCE = 'dhl-report-preview';

export type DhlPreviewEditorMessage =
  | { source: typeof DHL_PREVIEW_MESSAGE_SOURCE; action: 'edit'; id: string; html: string; tagName: string }
  | { source: typeof DHL_PREVIEW_MESSAGE_SOURCE; action: 'delete'; id: string; tagName: string };

const PREVIEW_MARKER = 'data-dhl-preview-editor-injected';

/** Converte HTML interno do bloco para texto editável no textarea. */
export function editableInnerToPlainText(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/** Converte texto do textarea de volta para HTML interno do bloco. */
export function plainTextToEditableInner(text: string, tagName: string): string {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  const tag = tagName.toLowerCase();
  if (tag === 'tr') {
    // Linha de tabela: preserva células separadas por tab ou pipe
    const parts = trimmed.split(/\t|\|/).map((p) => p.trim());
    if (parts.length > 1) {
      return parts.map((p) => `<td>${escapeHtml(p)}</td>`).join('');
    }
    return `<td>${escapeHtml(trimmed)}</td>`;
  }
  if (tag === 'td' || tag === 'li') {
    return escapeHtml(trimmed);
  }
  if (tag === 'div' && trimmed.includes('\n')) {
    return escapeHtml(trimmed).replace(/\n/g, '<br/>');
  }
  return escapeHtml(trimmed).replace(/\n/g, '<br/>');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Rótulo amigável para o bloco na UI de edição manual. */
export function labelForEditableId(id: string): string {
  const map: Record<string, string> = {
    'facts-summary': '3. Descrição dos fatos (resumo)',
    'sec-1-objetivo': '1. Objetivo do documento',
    'sec-4-1-sintese': '4.1 Síntese executiva',
    'sec-4-2-parceiro': '4.2 Versão do parceiro',
    'sec-4-3-causa-raiz': '4.3 Causa raiz',
    cronograma: '6.3 Cronograma consolidado',
    'sec-7-referencia': '7. Referência histórica',
  };
  if (map[id]) return map[id];
  const row = id.match(/^row-(c\d+|ac-\d+|ap-\d+)$/i);
  if (row) return `Linha ${row[1].toUpperCase()}`;
  if (id.startsWith('5w2h-')) return `5W2H — ${id.replace('5w2h-', '')}`;
  if (id.startsWith('5pq-')) return `5 Porquês — nível ${id.replace('5pq-', '')}`;
  if (id.startsWith('ac-')) return `Ação corretiva ${id.toUpperCase()}`;
  if (id.startsWith('commit-')) return `Compromisso TM SEG ${id.replace('commit-', '')}`;
  if (id.startsWith('contencao-')) return `Contenção ${id.replace('contencao-', '').toUpperCase()}`;
  return id;
}

const PREVIEW_STYLES = `
<style id="dhl-preview-editor-styles">
  @media print {
    .dhl-edit-toolbar, .dhl-edit-wrap::before, td.dhl-edit-actions { display: none !important; }
    .dhl-edit-wrap { outline: none !important; }
  }
  .dhl-edit-wrap {
    position: relative;
    outline: 1px dashed rgba(153, 27, 27, 0.35);
    outline-offset: 2px;
    border-radius: 4px;
    margin: 2px 0;
  }
  .dhl-edit-wrap:hover { outline-color: rgba(153, 27, 27, 0.65); }
  tr.dhl-edit-wrap { display: table-row; }
  td.dhl-edit-wrap, th.dhl-edit-wrap { display: table-cell; }
  td.dhl-edit-actions {
    width: 72px;
    white-space: nowrap;
    vertical-align: middle;
    text-align: center;
    background: #f8fafc !important;
    border-left: 1px dashed #cbd5e1 !important;
  }
  td.dhl-edit-actions button {
    display: block;
    width: 100%;
    margin: 2px 0;
    font: 600 8px/1 system-ui, sans-serif;
    padding: 3px 4px;
    border-radius: 4px;
    border: 1px solid #cbd5e1;
    cursor: pointer;
    background: #fff;
    color: #0d3b66;
  }
  td.dhl-edit-actions button[data-act="delete"] {
    color: #991b1b;
    border-color: #fecaca;
    background: #fef2f2;
  }
  .dhl-edit-toolbar {
    position: absolute;
    top: -2px;
    right: 0;
    z-index: 50;
    display: flex;
    gap: 4px;
    transform: translateY(-100%);
    padding-bottom: 2px;
  }
  tr.dhl-edit-wrap .dhl-edit-toolbar,
  td.dhl-edit-wrap .dhl-edit-toolbar {
    top: 2px;
    right: 2px;
    transform: none;
    padding-bottom: 0;
  }
  .dhl-edit-toolbar button {
    font: 600 9px/1 system-ui, sans-serif;
    padding: 3px 7px;
    border-radius: 4px;
    border: 1px solid #cbd5e1;
    cursor: pointer;
    background: #fff;
    color: #0d3b66;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  }
  .dhl-edit-toolbar button[data-act="delete"] {
    color: #991b1b;
    border-color: #fecaca;
    background: #fef2f2;
  }
  .dhl-edit-toolbar button:hover { filter: brightness(0.97); }
</style>`;

const PREVIEW_SCRIPT = `
<script id="dhl-preview-editor-script">
(function () {
  var SOURCE = ${JSON.stringify(DHL_PREVIEW_MESSAGE_SOURCE)};
  function post(payload) {
    try { window.parent.postMessage(Object.assign({ source: SOURCE }, payload), '*'); } catch (e) {}
  }
  function innerWithoutChrome(el) {
    if (el.tagName === 'TR') {
      return Array.prototype.map.call(
        el.querySelectorAll('td:not(.dhl-edit-actions)'),
        function (td) { return td.outerHTML; }
      ).join('');
    }
    var clone = el.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('.dhl-edit-toolbar, .dhl-edit-actions'), function (n) {
      n.parentNode.removeChild(n);
    });
    return clone.innerHTML.trim();
  }
  function attachRowActions(tr) {
    if (!tr || tr.getAttribute('data-dhl-edit-ui') === '1') return;
    tr.setAttribute('data-dhl-edit-ui', '1');
    tr.classList.add('dhl-edit-wrap');
    var td = document.createElement('td');
    td.className = 'dhl-edit-actions';
    td.setAttribute('data-dhl-toolbar', '1');
    var btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.setAttribute('data-act', 'edit');
    btnEdit.textContent = 'Editar';
    var btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.setAttribute('data-act', 'delete');
    btnDel.textContent = 'Excluir';
    td.appendChild(btnEdit);
    td.appendChild(btnDel);
    tr.appendChild(td);
    btnEdit.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      post({
        action: 'edit',
        id: tr.getAttribute('data-dhl-editable') || '',
        html: innerWithoutChrome(tr),
        tagName: 'TR',
      });
    });
    btnDel.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var id = tr.getAttribute('data-dhl-editable') || '';
      if (!id) return;
      post({ action: 'delete', id: id, tagName: 'TR' });
    });
  }
  function attachInline(el) {
    if (!el || el.getAttribute('data-dhl-edit-ui') === '1') return;
    el.setAttribute('data-dhl-edit-ui', '1');
    el.classList.add('dhl-edit-wrap');
    var bar = document.createElement('div');
    bar.className = 'dhl-edit-toolbar';
    bar.setAttribute('data-dhl-toolbar', '1');
    var btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.setAttribute('data-act', 'edit');
    btnEdit.textContent = 'Editar';
    var btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.setAttribute('data-act', 'delete');
    btnDel.textContent = 'Excluir';
    bar.appendChild(btnEdit);
    bar.appendChild(btnDel);
    el.insertBefore(bar, el.firstChild);
    btnEdit.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      post({
        action: 'edit',
        id: el.getAttribute('data-dhl-editable') || '',
        html: innerWithoutChrome(el),
        tagName: el.tagName,
      });
    });
    btnDel.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var id = el.getAttribute('data-dhl-editable') || '';
      if (!id) return;
      post({ action: 'delete', id: id, tagName: el.tagName });
    });
  }
  document.querySelectorAll('[data-dhl-editable]').forEach(function (el) {
    if (el.tagName === 'TR') attachRowActions(el);
    else attachInline(el);
  });
})();
</script>`;

/** Injeta CSS/JS de edição manual na pré-visualização (não usar ao salvar/imprimir PDF). */
export function injectDhlPreviewEditControls(html: string): string {
  if (!html?.trim()) return html;
  if (html.includes(PREVIEW_MARKER)) return html;

  let out = html;
  if (out.includes('</head>')) {
    out = out.replace('</head>', `${PREVIEW_STYLES}\n</head>`);
  } else {
    out = PREVIEW_STYLES + out;
  }

  const injection = `\n<!-- ${PREVIEW_MARKER} -->\n${PREVIEW_SCRIPT}\n`;
  if (out.includes('</body>')) {
    out = out.replace('</body>', `${injection}</body>`);
  } else {
    out += injection;
  }
  return out;
}

/** Remove artefatos do editor da pré-visualização (caso tenham sido salvos por engano). */
export function stripDhlPreviewEditControls(html: string): string {
  if (!html) return html;
  return html
    .replace(/<style id="dhl-preview-editor-styles">[\s\S]*?<\/style>/i, '')
    .replace(/<!-- data-dhl-preview-editor-injected -->[\s\S]*?<script id="dhl-preview-editor-script">[\s\S]*?<\/script>/i, '')
    .replace(/\sdata-dhl-edit-ui="1"/gi, '')
    .replace(/\sclass="([^"]*\s)?dhl-edit-wrap(\s[^"]*)?"/gi, (m, a, b) => {
      const rest = `${a || ''}${b || ''}`.trim();
      return rest ? ` class="${rest}"` : '';
    });
}

export function isDhlPreviewEditorMessage(data: unknown): data is DhlPreviewEditorMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return (
    msg.source === DHL_PREVIEW_MESSAGE_SOURCE &&
    (msg.action === 'edit' || msg.action === 'delete') &&
    typeof msg.id === 'string' &&
    !!msg.id.trim()
  );
}
