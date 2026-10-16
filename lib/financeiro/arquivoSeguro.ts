/**
 * Arquivo de evidência, documento ou comprovante.
 * A URL antiga continua identificando o arquivo. Quem abre precisa de sessão e perfil.
 * Um link já emitido vale até expirar. Fechar o bucket não apaga o arquivo nem revoga esse link.
 */
import { ehClientePortal, type PrincipalFinanceiro } from './acessoCampos';
import { podeLerConsultaFinanceira } from './consultaFinanceira';

export const BUCKETS_PROTEGIDOS = ['mission-evidence', 'documents', 'comissoes-comprovantes'] as const;

export const ARQUIVO_TTL_SEGUNDOS = 120;

export function extrairArquivoProtegido(url: string | null | undefined): { bucket: string; caminho: string } | null {
  const texto = String(url || '').trim();
  if (!texto) return null;
  for (const bucket of BUCKETS_PROTEGIDOS) {
    const marca = `/${bucket}/`;
    const indice = texto.indexOf(marca);
    if (indice < 0) continue;
    const caminho = decodeURIComponent(texto.slice(indice + marca.length).split('?')[0] || '');
    if (!caminho || caminho.includes('..') || caminho.includes('\\')) return null;
    return { bucket, caminho };
  }
  return null;
}

export function podeVerArquivo(
  user: PrincipalFinanceiro | null | undefined,
  bucket: string,
  caminho: string,
): boolean {
  if (!user || ehClientePortal(user)) return false;
  if (!(BUCKETS_PROTEGIDOS as readonly string[]).includes(bucket)) return false;
  if (bucket === 'comissoes-comprovantes' || caminho.startsWith('comissoes/')) {
    return podeLerConsultaFinanceira(user, 'comissoes');
  }
  const pasta = caminho.split('/')[0] || '';
  if (pasta === 'financial' || pasta === 'invoice-manual-payment') {
    return podeLerConsultaFinanceira(user, 'financial_invoices');
  }
  return true;
}

export function assinaturaValida(expiraEm: number, agora: number): boolean {
  return Number.isFinite(expiraEm) && expiraEm > agora;
}
