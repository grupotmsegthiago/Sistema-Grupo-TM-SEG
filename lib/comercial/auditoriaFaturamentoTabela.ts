/**
 * A origem e o destino da cotação saem da tabela do cliente (operação no formato CIDADE X CIDADE).
 * O e-mail de auditoria não leva valor em reais.
 */

export type RotaDaTabela = {
  origem: string;
  destino: string;
};

export function semValorMonetario(texto: string): string {
  return String(texto || '')
    .replace(/R\$\s*[\d.]+(?:,\d{1,2})?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const REGIAO = String.raw`SUDESTE|SUL|NORTE|NORDESTE|CENTRO-OESTE|CENTRO OESTE`;

/** "SUDESTE - SÃO PAULO X CANOAS" → origem SÃO PAULO, destino CANOAS. */
export function rotaDaTabelaOperacao(operationType?: string | null): RotaDaTabela | null {
  const raw = semValorMonetario(String(operationType || '')).replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const partes = raw.split(/\s+X\s+/i).map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return null;
  const origem = partes[0].replace(new RegExp(`^(?:${REGIAO})\\s*-\\s*`, 'i'), '').trim();
  const destino = partes.slice(1).join(' X ').replace(new RegExp(`\\s*-\\s*(?:${REGIAO})$`, 'i'), '').trim();
  if (!origem || !destino) return null;
  return { origem, destino };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function montarEmailAuditoriaFaturamento(input: {
  cliente: string;
  tabela: string;
  origem: string;
  destino: string;
  comercial?: string | null;
}): { subject: string; html: string } {
  const cliente = escapeHtml(semValorMonetario(input.cliente) || 'o cliente');
  const tabela = escapeHtml(semValorMonetario(input.tabela) || 'a tabela do cliente');
  const origem = escapeHtml(semValorMonetario(input.origem) || '—');
  const destino = escapeHtml(semValorMonetario(input.destino) || '—');
  const comercial = escapeHtml(semValorMonetario(input.comercial || '') || 'Olá');
  const subject = `Auditoria de faturamento — ${semValorMonetario(input.cliente) || 'tabela da rota'}`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;font-size:14px;line-height:1.5;">
    <p>${comercial},</p>
    <p>A cotação de <strong>${cliente}</strong> foi auditada. A origem e o destino precisam sair da tabela de preços do cliente, no formato <strong>CIDADE X CIDADE</strong>.</p>
    <p>Modelo desta rota, para repetir do jeito certo:</p>
    <div style="margin:0 0 16px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;">
      <p style="margin:0 0 8px;">Tabela: <strong>${tabela}</strong></p>
      <p style="margin:0 0 8px;">Origem: <strong>${origem}</strong></p>
      <p style="margin:0;">Destino: <strong>${destino}</strong></p>
    </div>
    <p>Na próxima cotação, escolha essa tabela. A origem e o destino são preenchidos por ela. Não digite um endereço que não esteja na tabela.</p>
  </div>`;
  return { subject, html };
}
