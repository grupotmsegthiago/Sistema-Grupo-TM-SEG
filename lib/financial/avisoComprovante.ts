import { extractAsaasReceiptDetails, urlComprovanteHttp } from '../asaasReceiptDetails';

/** Link do comprovante, ou aviso só para o perfil Financeiro quando o pagamento não tem um. */
export function decidirComprovante(input: {
  exige: boolean;
  urls: Array<string | null | undefined>;
  perfilFinanceiro: boolean;
}): { link: string | null; avisarFalta: boolean } {
  const link = input.urls.map((url) => urlComprovanteHttp(url)).find((url): url is string => !!url) || null;
  return {
    link,
    avisarFalta: input.exige && input.perfilFinanceiro && !link,
  };
}

/**
 * O número da fatura precisa aparecer inteiro.
 * "200" não casa com "200.000" nem com "1200".
 */
export function faturaCitadaNoTexto(texto: string | null | undefined, faturaNumero: string | null | undefined): boolean {
  const fatura = String(faturaNumero || '').trim();
  if (fatura.length < 3) return false;
  const escaped = fatura.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^0-9A-Za-z.,])${escaped}(?=$|[^0-9A-Za-z.,])`).test(String(texto || ''));
}

/** Número curto (ex.: 200) não entra na busca de título. O id da TORRES resolve essa fatura. */
export function numeroFaturaParaTitulo(faturaNumero: string | null | undefined): string | null {
  const fatura = String(faturaNumero || '').trim();
  if (fatura.length < 3) return null;
  if (fatura.length < 8 && !fatura.includes('-')) return null;
  return fatura;
}

/** Comprovante Asaas da fatura, se a observação do título citar o número e a URL. */
export function comprovanteAsaasDaFatura(
  notes: string | null | undefined,
  description: string | null | undefined,
  faturaNumero: string | null | undefined,
): string | null {
  const fatura = String(faturaNumero || '').trim();
  if (!faturaCitadaNoTexto(`${description || ''}\n${notes || ''}`, fatura)) return null;
  return urlComprovanteHttp(extractAsaasReceiptDetails(notes)?.receiptUrl);
}

export type FaturaComprovanteGravado = {
  id: string;
  number?: string | null;
  notes?: string | null;
  manual_payment_evidence_url?: string | null;
  asaas_payment_id?: string | null;
  issuer_company?: string | null;
};

export type TituloComprovanteGravado = {
  description?: string | null;
  notes?: string | null;
  doc_comprovante_url?: string | null;
};

export type ComissaoParaComprovante = {
  id: string;
  empresa_origem?: string | null;
  fatura_numero?: string | null;
  fatura_id?: string | null;
  origem_fatura_id?: string | null;
  comprovante_url?: string | null;
};

export type PendenteComprovanteAoVivo = {
  id: string;
  paymentId: string | null;
  company: string | null;
  torresOrigemId: string | null;
};

/** O que já está gravado: anexo manual, URL do Asaas no marcador ou comprovante da comissão. */
export function comprovantesJaGravados(input: {
  comissoes: ComissaoParaComprovante[];
  faturas: FaturaComprovanteGravado[];
  titulos: TituloComprovanteGravado[];
}): { urls: Record<string, string>; pendentes: PendenteComprovanteAoVivo[] } {
  const urls: Record<string, string> = {};
  const pendentes: PendenteComprovanteAoVivo[] = [];
  const faturas = input.faturas || [];
  const titulos = input.titulos || [];

  for (const row of input.comissoes || []) {
    const id = String(row.id || '').trim();
    if (!id) continue;
    const faturaId = String(row.fatura_id || '').trim();
    const numero = String(row.fatura_numero || '').trim();
    const fatura = faturas.find((item) =>
      (faturaId && item.id === faturaId) || (numero && String(item.number || '').trim() === numero),
    ) || null;
    const numeroTitulo = numeroFaturaParaTitulo(numero);
    const titulo = numeroTitulo
      ? titulos.find((item) => {
          const blob = `${item.description || ''}\n${item.notes || ''}`;
          return faturaCitadaNoTexto(blob, numeroTitulo) && !!urlComprovanteHttp(item.doc_comprovante_url);
        })
      : null;
    const link = decidirComprovante({
      exige: false,
      urls: [
        row.comprovante_url,
        fatura?.manual_payment_evidence_url,
        titulo?.doc_comprovante_url,
        fatura ? extractAsaasReceiptDetails(fatura.notes)?.receiptUrl : null,
      ],
      perfilFinanceiro: false,
    }).link;
    if (link) {
      urls[id] = link;
      continue;
    }
    const paymentId = String(fatura?.asaas_payment_id || extractAsaasReceiptDetails(fatura?.notes)?.paymentId || '').trim();
    const torres = String(row.empresa_origem || '').toUpperCase() === 'TORRES'
      ? String(row.origem_fatura_id || '').trim()
      : '';
    pendentes.push({
      id,
      paymentId: /^pay_[A-Za-z0-9]+$/.test(paymentId) ? paymentId : null,
      company: String(fatura?.issuer_company || '').trim() || null,
      torresOrigemId: /^\d+$/.test(torres) ? torres : null,
    });
  }

  return { urls, pendentes };
}
