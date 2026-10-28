/** Regras de site e logotipo no cadastro do cliente. Não grava banco e não altera coluna. */

export const LIMITE_LOGO_BYTES = 2 * 1024 * 1024;

export type ArquivoLogo = {
  name: string;
  type: string;
  size: number;
};

function extensaoLogo(nome: string): 'png' | 'svg' | null {
  const texto = nome.toLowerCase().trim();
  if (texto.endsWith('.png')) return 'png';
  if (texto.endsWith('.svg')) return 'svg';
  return null;
}

function mimeLogo(tipo: string): string {
  return String(tipo || '').toLowerCase().split(';')[0].trim();
}

/**
 * Aceita PNG ou SVG de até 2 MB.
 * Tipo vazio ou octet-stream passa só com a extensão certa: o Windows manda SVG assim.
 * JPEG, WebP e arquivo grande não passam.
 */
export function validarArquivoLogo(arquivo: ArquivoLogo): string | null {
  const ext = extensaoLogo(arquivo.name || '');
  if (!ext) return 'Envie apenas PNG ou SVG, de até 2 MB.';
  const tipo = mimeLogo(arquivo.type);
  const mimeLivre = tipo === '' || tipo === 'application/octet-stream';
  const pngOk = ext === 'png' && (tipo === 'image/png' || mimeLivre);
  const svgOk = ext === 'svg' && (tipo === 'image/svg+xml' || mimeLivre);
  if (!pngOk && !svgOk) return 'Envie apenas PNG ou SVG, de até 2 MB.';
  if (!Number.isFinite(arquivo.size) || arquivo.size <= 0) return 'O arquivo do logotipo está vazio.';
  if (arquivo.size > LIMITE_LOGO_BYTES) return 'O logotipo passa de 2 MB.';
  return null;
}

export function contentTypeLogo(arquivo: ArquivoLogo): string {
  const tipo = mimeLogo(arquivo.type);
  if (tipo === 'image/png' || tipo === 'image/svg+xml') return tipo;
  return extensaoLogo(arquivo.name) === 'svg' ? 'image/svg+xml' : 'image/png';
}

/** Site com protocolo. Texto solto e javascript: não passam. */
export function validarWebsiteCliente(valor: unknown): string | null {
  const texto = String(valor ?? '').trim();
  if (!texto) return 'Informe o site do cliente, com http:// ou https://.';
  try {
    const url = new URL(texto);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'O site precisa começar com http:// ou https://.';
    }
    if (!url.hostname) return 'Informe o site do cliente, com http:// ou https://.';
    return null;
  } catch {
    return 'O site precisa começar com http:// ou https://.';
  }
}

/**
 * Só o comercial externo. Diretoria e os demais salvam cliente antigo sem site ou logo.
 * O arquivo ainda não enviado conta: o upload espera o id do cliente novo.
 */
export function pendenciaMarcaComercial(input: {
  website: unknown;
  logoUrl: unknown;
  temArquivo: boolean;
}): string | null {
  const site = validarWebsiteCliente(input.website);
  if (site) return site;
  if (!String(input.logoUrl ?? '').trim() && !input.temArquivo) {
    return 'Envie o logotipo em PNG ou SVG, de até 2 MB.';
  }
  return null;
}
