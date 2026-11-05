export type ProspectEmailVars = {
  companyName: string;
  tradeName?: string | null;
  city?: string | null;
  stateUf?: string | null;
  contactName?: string | null;
  senderName?: string | null;
  /** Link único de parceria (opcional). */
  partnershipLink?: string | null;
  fromEmail?: string | null;
};

export const DEFAULT_PROSPECT_SUBJECT =
  'Apresentação Grupo TM SEG — parceria em escolta armada';

export function montarAssuntoApresentacao(vars: ProspectEmailVars): string {
  const cidadeUf = [vars.city, vars.stateUf].filter(Boolean).join('/').trim();
  if (cidadeUf) return `${DEFAULT_PROSPECT_SUBJECT} — ${cidadeUf}`;
  return DEFAULT_PROSPECT_SUBJECT;
}

export function montarCorpoApresentacao(vars: ProspectEmailVars): { text: string; html: string } {
  const nomeEmpresa = (vars.tradeName || vars.companyName || 'Parceiro').trim();
  const responsavel = (vars.contactName || 'Responsável').trim();
  const cidadeUf = [vars.city, vars.stateUf].filter(Boolean).join('/').trim() || 'sua região';
  const remetente = (vars.senderName || 'Equipe Comercial / Operações — Grupo TM SEG').trim();
  const link =
    (vars.partnershipLink || '').trim() ||
    'https://sistema.grupotmseg.com.br';

  const text = [
    `Prezado(a) ${responsavel},`,
    '',
    `Somos o Grupo TM SEG, empresa especializada em intermediação de escolta armada e segurança em rotas de carga.`,
    '',
    `Identificamos a ${nomeEmpresa} como potencial parceiro operacional em ${cidadeUf} e gostaríamos de apresentar nossa operação, demandas recorrentes e o fluxo de homologação (autorização da Polícia Federal, cobertura e tabela de custo).`,
    '',
    `Link de parceria / portal: ${link}`,
    '',
    'Se houver interesse, responda este e-mail indicando o contato operacional e as regiões de cobertura.',
    '',
    'Atenciosamente,',
    remetente,
    vars.fromEmail ? `Remetente: ${vars.fromEmail}` : '',
    'www.grupotmseg.com.br',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
body{margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}
.header{background:#1a1a1a;padding:28px 32px;text-align:center;color:#fff}
.body-content{padding:32px;color:#333;line-height:1.7;font-size:14px}
.footer{background:#1a1a1a;padding:24px;text-align:center;color:#999;font-size:12px}
</style></head>
<body><div class="container">
<div class="header"><h1>GRUPO TM SEG</h1><p>Segurança &amp; Escolta Armada</p></div>
<div class="body-content">
<p>Prezado(a) <strong>${escapeHtml(responsavel)}</strong>,</p>
<p>Somos o <strong>Grupo TM SEG</strong>, empresa especializada em intermediação de escolta armada e segurança em rotas de carga.</p>
<p>Identificamos a <strong>${escapeHtml(nomeEmpresa)}</strong> como potencial parceiro operacional em <strong>${escapeHtml(cidadeUf)}</strong> e gostaríamos de apresentar nossa operação, demandas recorrentes e o fluxo de homologação (autorização da Polícia Federal, cobertura e tabela de custo).</p>
<p><a href="${escapeHtml(link)}" style="color:#b91c1c;font-weight:700">Acessar portal de parceria</a></p>
<p>Se houver interesse, responda este e-mail indicando o contato operacional e as regiões de cobertura.</p>
<p>Atenciosamente,<br/>${escapeHtml(remetente)}</p>
</div>
<div class="footer"><p>Grupo TM SEG — www.grupotmseg.com.br</p></div>
</div></body></html>`;

  return { text, html };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
