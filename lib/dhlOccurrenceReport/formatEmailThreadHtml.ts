import type { EmailThreadMessage } from './parseEmailThread.js';

function esc(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Formata thread de e-mails no padrão visual do Outlook (referência DHL). */
export function formatEmailThreadHtml(messages: EmailThreadMessage[]): string {
  if (!messages.length) return '';

  const cards = messages
    .map((msg, index) => {
      const subjectBlock = msg.subject
        ? `<p class="email-subject"><strong>${esc(msg.subject)}</strong></p>`
        : '';

      return `
      <article class="email-card">
        <header class="email-card-header">
          <span class="email-index">${index + 1}</span>
          <div class="email-meta">
            <div><span class="lbl">De:</span> ${esc(msg.from)}</div>
            <div><span class="lbl">Para:</span> ${esc(msg.to)}</div>
            ${msg.cc && msg.cc !== '—' ? `<div><span class="lbl">Cc:</span> ${esc(msg.cc)}</div>` : ''}
            <div><span class="lbl">Data:</span> ${esc(msg.date)}</div>
          </div>
        </header>
        ${subjectBlock}
        <div class="email-body">${esc(msg.body).replace(/\n/g, '<br/>')}</div>
      </article>`;
    })
    .join('');

  return `
  <style>
    .email-thread { margin: 12px 0; }
    .email-card {
      border: 1px solid #fca5a5;
      border-left: 4px solid #dc2626;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 12px;
      background: linear-gradient(180deg, #fff 0%, #fef2f2 100%);
      page-break-inside: avoid;
    }
    .email-card-header { display: flex; gap: 10px; margin-bottom: 8px; }
    .email-index {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 22px; height: 22px; border-radius: 999px;
      background: #fee2e2; color: #991b1b; font-size: 9pt; font-weight: 700;
    }
    .email-meta { font-size: 9pt; color: #334155; line-height: 1.45; }
    .email-meta .lbl { font-weight: 700; color: #991b1b; }
    .email-subject { font-size: 9.5pt; color: #111827; margin: 0 0 8px; }
    .email-body { font-size: 9.5pt; color: #1a1a1a; line-height: 1.5; white-space: normal; }
  </style>
  <div class="email-thread">${cards}</div>`;
}
