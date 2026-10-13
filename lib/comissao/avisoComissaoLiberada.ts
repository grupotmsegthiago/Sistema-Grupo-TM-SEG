/**
 * Texto do aviso ao financeiro quando a comissão passa a LIBERADO_PARA_PAGAMENTO.
 * Sem SMTP: o envio fica no servidor, para não entrar no bundle do browser.
 */

export const EMAIL_FINANCEIRO_COMISSAO = 'financeiro@grupotmseg.com.br';

/** Cliente TORRES pagou: avisa a TORRES para conferir a comissão. A TM SEG não entra nesta lista. */
export const EMAILS_PAGAMENTO_CLIENTE_TORRES = [
  'financeiro@torresseguranca.com.br',
  'adm@torresseguranca.com.br',
  'thiago@grupotmseg.com.br',
] as const;

export type ComissaoLiberadaAviso = {
  id: string;
  cliente: string;
  fatura: string;
  comercial: string;
  valorComissao: number;
  valorFaturamento: number;
  dataRecebimento: string | null;
  empresa: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rotuloEmpresa(empresa: string): string {
  return String(empresa || '').toUpperCase() === 'TORRES' ? 'Torres' : 'TM SEG';
}

function formatarData(iso: string | null): string {
  const raw = String(iso || '').slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatarMoeda(valor: number): string {
  if (!Number.isFinite(valor)) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function linhasParaAvisos(
  rows: unknown,
  nomesComercial: Map<string, string>,
): ComissaoLiberadaAviso[] {
  if (!Array.isArray(rows)) return [];
  const avisos: ComissaoLiberadaAviso[] = [];
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (!id) continue;
    const comercialId = String(row?.comercial_id || '').trim();
    avisos.push({
      id,
      cliente: String(row?.cliente_nome || '').trim() || '—',
      fatura: String(row?.fatura_numero || '').trim() || '—',
      comercial: nomesComercial.get(comercialId) || '—',
      valorComissao: Number(row?.valor_comissao),
      valorFaturamento: Number(row?.valor_faturamento),
      dataRecebimento: row?.data_recebimento_cliente ? String(row.data_recebimento_cliente).slice(0, 10) : null,
      empresa: String(row?.empresa_origem || 'TM_SEG'),
    });
  }
  return avisos;
}

export function emailsDoAvisoComissao(empresa: string): string[] {
  return String(empresa || '').toUpperCase() === 'TORRES'
    ? [...EMAILS_PAGAMENTO_CLIENTE_TORRES]
    : [EMAIL_FINANCEIRO_COMISSAO];
}

export function montarEmailComissaoLiberada(avisos: ComissaoLiberadaAviso[]): {
  to: string[];
  subject: string;
  html: string;
} {
  const lista = avisos.filter((item) => item.id);
  const unico = lista.length === 1 ? lista[0] : null;
  const torres = lista.length > 0 && lista.every((item) => String(item.empresa || '').toUpperCase() === 'TORRES');
  const subject = torres
    ? (unico
      ? `Cliente TORRES pagou — verificar comissão — ${unico.cliente}`
      : `Clientes TORRES pagaram — verificar comissão (${lista.length})`)
    : (unico
      ? `Comissão liberada — ${unico.cliente}`
      : `Comissões liberadas para pagamento (${lista.length})`);

  const blocos = lista.map((item) => {
    const cliente = escapeHtml(item.cliente);
    const comercial = escapeHtml(item.comercial);
    const fatura = escapeHtml(item.fatura);
    const empresa = escapeHtml(rotuloEmpresa(item.empresa));
    return `
      <div style="margin:0 0 16px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;">
        <p style="margin:0 0 8px;">O cliente <strong>${cliente}</strong> pagou a fatura <strong>${fatura}</strong> (${empresa}) em ${formatarData(item.dataRecebimento)}.</p>
        <p style="margin:0 0 8px;">O pagamento da comissão para o comercial <strong>${comercial}</strong> está liberado.</p>
        <p style="margin:0;">Valor da fatura: ${escapeHtml(formatarMoeda(item.valorFaturamento))}<br>Valor da comissão: ${escapeHtml(formatarMoeda(item.valorComissao))}</p>
      </div>`;
  }).join('');

  const intro = torres
    ? 'O cliente TORRES pagou. O pagamento está confirmado. Verifiquem a comissão do comercial.'
    : 'Financeiro, o cliente pagou e a comissão do comercial está liberada para pagamento.';
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;font-size:14px;line-height:1.45;">
    <p style="margin:0 0 12px;">${intro}</p>
    ${blocos}
  </div>`;

  return { to: emailsDoAvisoComissao(torres ? 'TORRES' : 'TM_SEG'), subject, html };
}
