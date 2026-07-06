import { BCC_RECIPIENTS, SMTP_FROM, sendMail } from './smtp.js';

function dhlTemplate(content: string, isDhl: boolean = true): string {
  const accent = isDhl ? '#FFCC00' : '#D40511';
  const subColor = isDhl ? '#FFCC00' : '#bbb';
  const topBars = isDhl
    ? `<div class="dhl-bar"></div>\n  <div class="dhl-red-bar"></div>`
    : `<div style="background:#D40511; height:8px;"></div>`;
  const dhlBarStyles = isDhl
    ? `\n  .dhl-bar { background:#FFCC00; height:8px; }\n  .dhl-red-bar { background:#D40511; height:4px; }`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  body { margin:0; padding:0; background:#f4f4f4; font-family:'Segoe UI',Arial,sans-serif; }
  .container { max-width:640px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); }${dhlBarStyles}
  .header { background:#1a1a1a; padding:24px 32px; text-align:center; }
  .header h1 { color:#fff; font-size:22px; margin:0 0 4px; letter-spacing:1px; }
  .header h1 .red { color:#D40511; font-weight:700; }
  .header .sub { color:${subColor}; font-size:11px; margin:0; letter-spacing:2px; text-transform:uppercase; font-weight:700; }
  .body-content { padding:32px; color:#333; line-height:1.65; font-size:14px; }
  .body-content h2 { color:#D40511; font-size:18px; border-bottom:3px solid ${accent}; padding-bottom:8px; margin:0 0 16px; }
  .cta { display:inline-block; background:#D40511; color:#fff !important; padding:14px 26px; border-radius:6px; text-decoration:none; font-weight:700; letter-spacing:0.5px; margin:8px 0; }
  .info-table { width:100%; border-collapse:collapse; margin:14px 0; font-size:13px; }
  .info-table td { padding:8px 12px; border-bottom:1px solid #eee; vertical-align:top; }
  .info-table td:first-child { font-weight:600; width:38%; color:#1a1a1a; }
  .highlight { background:${isDhl ? '#FFFBE6' : '#fbeaec'}; border-left:4px solid ${accent}; padding:12px 16px; margin:14px 0; border-radius:0 4px 4px 0; font-size:13px; }
  .tech-block { background:#fafafa; border:1px solid #eee; border-radius:6px; padding:14px 16px; margin:10px 0; font-size:13px; }
  .tech-title { color:#D40511; font-weight:700; margin:0 0 6px; font-size:14px; }
  .footer { background:#1a1a1a; padding:18px 32px; text-align:center; border-top:4px solid ${accent}; }
  .footer p { color:#999; font-size:11px; margin:3px 0; }
  .footer .company { color:#fff; font-weight:700; }
</style></head>
<body>
<div class="container">
  ${topBars}
  <div class="header">
    <h1>GRUPO <span class="red">TM SEG</span></h1>
    <p class="sub">Intermediação de Escolta Armada</p>
  </div>
  <div class="body-content">${content}</div>
  <div class="footer">
    <p class="company">Grupo TM SEG</p>
    <p>Intermediação de Escolta Armada</p>
    <p style="margin-top:6px; color:#666;">E-mail automático. Dúvidas: operacional@grupotmseg.com.br</p>
  </div>
</div>
</body></html>`;
}

function dhlTechBlocksHtml(): string {
  return `
  <div class="tech-block"><p class="tech-title">OMNILINK</p><p style="margin:0;">DHL SUPPLY CHAIN — CNPJ 00.233.065/0001-87 — IP <strong>131.255.103.146</strong> — Porta <strong>9001</strong>.</p></div>
  <div class="tech-block"><p class="tech-title">SASCAR</p><p style="margin:0;">Portal Sascar → Serviços → <em>Direcionamento de Sinal</em>.</p></div>
  <div class="tech-block"><p class="tech-title">ONIXSAT / JABURSAT</p><p style="margin:0;">Espelhar sinal para <strong>Central Unidocks/DHL — CNPJ 00.233.065/0001-87</strong>.</p></div>
  <div class="tech-block"><p class="tech-title">SIGHRA</p><p style="margin:0;">Enviar e-mail para <strong>suporte@sighra.com.br</strong> com placa + ID do veículo.</p></div>
  <div class="tech-block"><p class="tech-title">AUTOTRAC</p><p style="margin:0;">Supervisor Web → Roteamento → <em>Inserir roteamento express</em>. Companhia: <strong>DHL</strong>.</p></div>`;
}

export async function sendDhlSupplierIntakeEmail(opts: {
  to: string; providerName: string; osNumber: string; seNumber: string;
  origin: string; destination: string; scheduledAt: string; link: string; isDhl?: boolean;
}): Promise<void> {
  const isDhl = opts.isDhl !== false;
  const accent = isDhl ? '#FFCC00' : '#D40511';
  const seRow = isDhl ? `<tr><td>Nº S.E.</td><td><strong>${opts.seNumber}</strong></td></tr>` : '';
  const espelhamentoBloco = isDhl
    ? `<h3 style="color:#1a1a1a; font-size:15px; margin-top:24px; border-bottom:2px solid ${accent}; padding-bottom:6px;">Instruções de Espelhamento — por tecnologia</h3>${dhlTechBlocksHtml()}`
    : `<h3 style="color:#1a1a1a; font-size:15px; margin-top:24px; border-bottom:2px solid ${accent}; padding-bottom:6px;">Espelhamento do sinal</h3><p style="font-size:13px; color:#555;">Realize o espelhamento conforme orientação do Operacional TM Seg.</p>`;
  const html = dhlTemplate(`
    <h2>Solicitação de Escolta — Preencher Dados</h2>
    <p>Olá, <strong>${opts.providerName}</strong>.</p>
    <p>Preencha os dados dos <strong>2 escoltistas e do veículo</strong> pelo link:</p>
    <p style="text-align:center; margin:20px 0;"><a class="cta" href="${opts.link}">Preencher dados da escolta</a></p>
    <table class="info-table">
      <tr><td>OS TM SEG</td><td>${opts.osNumber}</td></tr>${seRow}
      <tr><td>Origem</td><td>${opts.origin}</td></tr>
      <tr><td>Destino</td><td>${opts.destination}</td></tr>
      <tr><td>Início previsto</td><td>${opts.scheduledAt}</td></tr>
    </table>${espelhamentoBloco}
  `, isDhl);
  await sendMail({
    from: SMTP_FROM, to: opts.to, bcc: ['operacional@grupotmseg.com.br'],
    subject: isDhl ? `[TM SEG] Preencher dados de escolta — OS ${opts.osNumber} — S.E. ${opts.seNumber}` : `[TM SEG] Preencher dados de escolta — OS ${opts.osNumber}`,
    html,
  });
}

export async function sendDhlIntakeSubmittedEmail(opts: {
  to: string; providerName: string; osNumber: string; seNumber: string;
  origin: string; destination: string; scheduledAt: string;
  agent1: any; agent2: any; vehicle: any;
  mirrorProofUrl?: string | null; mirrorProofFilename?: string | null; isDhl?: boolean;
}): Promise<void> {
  const isDhl = opts.isDhl !== false;
  const accent = isDhl ? '#FFCC00' : '#D40511';
  const fmt = (v: any) => (v ? String(v) : '—');
  const escoltistaHtml = (label: string, x: any) => {
    const e = x || {};
    return `<h3 style="color:#1a1a1a; font-size:15px; margin-top:20px; border-bottom:2px solid ${accent}; padding-bottom:6px;">${label}</h3>
      <table class="info-table"><tr><td>Nome</td><td>${fmt(e.nome)}</td></tr><tr><td>CPF</td><td>${fmt(e.cpf)}</td></tr><tr><td>Placa/CNH</td><td>${fmt(e.cnh)}</td></tr><tr><td>Celular</td><td>${fmt(e.celular)}</td></tr></table>`;
  };
  const v = opts.vehicle || {};
  const seRow = isDhl ? `<tr><td>Nº S.E. DHL</td><td><strong>${opts.seNumber}</strong></td></tr>` : '';
  const html = dhlTemplate(`
    <h2>OS — Dados Preenchidos pelo Fornecedor</h2>
    <p>O fornecedor <strong>${opts.providerName}</strong> concluiu o preenchimento:</p>
    <table class="info-table">
      <tr><td>OS</td><td>${opts.osNumber}</td></tr>${seRow}
      <tr><td>Trajeto</td><td>${opts.origin} → ${opts.destination}</td></tr>
      <tr><td>Início previsto</td><td>${opts.scheduledAt}</td></tr>
    </table>
    ${escoltistaHtml('Escoltista 1', opts.agent1)}
    ${escoltistaHtml('Escoltista 2', opts.agent2)}
    <h3 style="color:#1a1a1a; font-size:15px; margin-top:20px; border-bottom:2px solid ${accent}; padding-bottom:6px;">Veículo</h3>
    <table class="info-table"><tr><td>Placa</td><td><strong>${fmt(v.placa)}</strong></td></tr><tr><td>Tecnologia</td><td>${fmt(v.tecnologia)}</td></tr></table>
    ${opts.mirrorProofUrl ? `<p><a href="${opts.mirrorProofUrl}" target="_blank" class="cta">Abrir comprovante de espelhamento</a></p>` : '<div class="highlight"><strong>Atenção:</strong> sem comprovante de espelhamento anexado.</div>'}
  `, isDhl);
  await sendMail({
    from: SMTP_FROM, to: opts.to,
    subject: isDhl ? `[DHL] Dados recebidos — OS ${opts.osNumber} — S.E. ${opts.seNumber} — ${opts.providerName}` : `[TM SEG] Dados recebidos — OS ${opts.osNumber} — ${opts.providerName}`,
    html,
  });
}
