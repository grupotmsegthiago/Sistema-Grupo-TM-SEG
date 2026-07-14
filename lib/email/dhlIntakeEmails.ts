import { SMTP_FROM, sendMail } from './smtp.js';

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

export type DhlIntakeSubmittedEmailOpts = {
  providerName: string; osNumber: string; seNumber: string;
  origin: string; destination: string; scheduledAt: string;
  agent1: any; agent2: any; vehicle: any;
  mirrorProofUrl?: string | null; mirrorProofFilename?: string | null; isDhl?: boolean;
};

/** HTML completo do e-mail de dados recebidos (escoltistas + veículo + espelhamento). */
export function buildDhlIntakeSubmittedEmailHtml(opts: DhlIntakeSubmittedEmailOpts): string {
  const isDhl = opts.isDhl !== false;
  const accent = isDhl ? '#FFCC00' : '#D40511';
  const fmt = (v: any) => {
    if (v === null || v === undefined) return '—';
    const s = String(v).trim();
    return s ? s : '—';
  };
  const pick = (obj: any, ...keys: string[]) => {
    const e = obj || {};
    for (const k of keys) {
      if (e[k] !== null && e[k] !== undefined && String(e[k]).trim() !== '') return e[k];
    }
    return '';
  };
  const escoltistaHtml = (label: string, x: any) => {
    const e = x || {};
    const rows: Array<[string, any]> = [
      ['Nome', pick(e, 'nome', 'name')],
      ['CPF', pick(e, 'cpf')],
      ['RG', pick(e, 'rg')],
      ['Órgão emissor / UF', pick(e, 'orgao_emissor', 'orgaoEmissor')],
      ['CNH', pick(e, 'cnh')],
      ['Categoria CNH', pick(e, 'cnh_categoria', 'cnhCategoria')],
      ['Vencimento CNH', pick(e, 'cnh_vencimento', 'cnhVencimento', 'cnh_validity')],
      ['CNV Número', pick(e, 'cnv_numero', 'cnvNumero', 'cnv')],
      ['Validade CNV', pick(e, 'cnv_validade', 'cnvValidade', 'cnv_validity')],
      ['Rua', pick(e, 'rua')],
      ['Número', pick(e, 'numero')],
      ['Complemento', pick(e, 'complemento')],
      ['Bairro', pick(e, 'bairro')],
      ['Cidade', pick(e, 'cidade')],
      ['UF', pick(e, 'uf')],
      ['CEP', pick(e, 'cep')],
      ['Celular', pick(e, 'celular', 'phone')],
      ['Admissão', pick(e, 'admissao')],
    ];
    const trs = rows.map(([k, v]) => `<tr><td>${k}</td><td>${fmt(v)}</td></tr>`).join('');
    return `<h3 style="color:#1a1a1a; font-size:15px; margin-top:20px; border-bottom:2px solid ${accent}; padding-bottom:6px;">${label}</h3>
      <table class="info-table">${trs}</table>`;
  };
  const v = opts.vehicle || {};
  const veicRows: Array<[string, any]> = [
    ['Placa', pick(v, 'placa', 'plate')],
    ['Renavam', pick(v, 'renavam')],
    ['Marca', pick(v, 'marca', 'brand')],
    ['Modelo', pick(v, 'modelo', 'model')],
    ['Ano', pick(v, 'ano', 'year')],
    ['Cor', pick(v, 'cor', 'color')],
    ['Tecnologia', pick(v, 'tecnologia', 'tracker_type')],
    ['ID Rastreador', pick(v, 'id_rastreador', 'idRastreador', 'tracker_id')],
    ['Comunicação', pick(v, 'comunicacao')],
  ];
  const veicTrs = veicRows
    .map(([k, val], i) => {
      const strong = i === 0 || k === 'Tecnologia';
      return `<tr><td>${k}</td><td>${strong ? `<strong>${fmt(val)}</strong>` : fmt(val)}</td></tr>`;
    })
    .join('');
  const seRow = isDhl ? `<tr><td>Nº S.E. DHL</td><td><strong>${opts.seNumber}</strong></td></tr>` : '';
  return dhlTemplate(`
    <h2>OS — Dados Preenchidos pelo Fornecedor</h2>
    <p>O fornecedor <strong>${opts.providerName}</strong> concluiu o preenchimento dos dados da escolta:</p>
    <table class="info-table">
      <tr><td>OS</td><td>${opts.osNumber}</td></tr>${seRow}
      <tr><td>Trajeto</td><td>${opts.origin} → ${opts.destination}</td></tr>
      <tr><td>Início previsto</td><td>${opts.scheduledAt}</td></tr>
    </table>
    ${escoltistaHtml('Escoltista 1', opts.agent1)}
    ${escoltistaHtml('Escoltista 2', opts.agent2)}
    <h3 style="color:#1a1a1a; font-size:15px; margin-top:20px; border-bottom:2px solid ${accent}; padding-bottom:6px;">Veículo</h3>
    <table class="info-table">${veicTrs}</table>
    ${opts.mirrorProofUrl
      ? `<h3 style="color:#1a1a1a; font-size:15px; margin-top:20px; border-bottom:2px solid ${accent}; padding-bottom:6px;">Comprovante de Espelhamento</h3>
         <p style="margin:8px 0;">O fornecedor anexou o print confirmando que o espelhamento foi realizado.</p>
         <p><a href="${opts.mirrorProofUrl}" target="_blank" class="cta">Abrir comprovante${opts.mirrorProofFilename ? ' — ' + opts.mirrorProofFilename : ''}</a></p>`
      : '<div class="highlight"><strong>Atenção:</strong> o fornecedor não anexou comprovante do espelhamento.</div>'}
    <div class="highlight" style="margin-top:20px;">
      <strong>Próximo passo:</strong> conferir os dados acima e o comprovante de espelhamento.
    </div>
  `, isDhl);
}

export async function sendDhlIntakeSubmittedEmail(opts: {
  to: string; providerName: string; osNumber: string; seNumber: string;
  origin: string; destination: string; scheduledAt: string;
  agent1: any; agent2: any; vehicle: any;
  mirrorProofUrl?: string | null; mirrorProofFilename?: string | null; isDhl?: boolean;
}): Promise<void> {
  const isDhl = opts.isDhl !== false;
  const html = buildDhlIntakeSubmittedEmailHtml(opts);
  await sendMail({
    from: SMTP_FROM, to: opts.to,
    subject: isDhl ? `[DHL] Dados recebidos — OS ${opts.osNumber} — S.E. ${opts.seNumber} — ${opts.providerName}` : `[TM SEG] Dados recebidos — OS ${opts.osNumber} — ${opts.providerName}`,
    html,
  });
}
