/** Peças ilustrativas da proposta. Não calcula preço e não manda endereço para a IA. */

import { logoConhecido, slugVisual } from './frotaVisual';

const MARCAS = new Set(['ceva', 'dhl', 'ibl']);

export const ETAPAS_PROPOSTA_PREMIUM = [
  'Preparando sua proposta comercial...',
  'Consultando informações da operação...',
  'Montando apresentação personalizada...',
  'Finalizando proposta...',
] as const;

/** Teto para a tela não ficar girando. A geração para e a proposta abre com as imagens já publicadas. */
export const TEMPO_CENA_MS = 45_000;

export const LIMITE_MENSAL_PADRAO_USD = 25;

/** Estimativa quando a API não devolve o uso. Não é o valor da cotação. */
export const CUSTO_ESTIMADO_USD = {
  openaiPaisagem: 0.08,
  openaiCartao: 0.05,
  gemini: 0.04,
} as const;

export const PECAS_PREMIUM = ['capa', 'central', 'fiscal', 'escolta', 'acompanhamento', 'guincho'] as const;
export type PecaPremium = (typeof PECAS_PREMIUM)[number];
export type ImagensPremium = Record<PecaPremium, string | null>;

export type CenaOficial = {
  slug: string;
  veiculo: string;
  recorte: string;
  logo: string | null;
};

const SEM_TEXTO = 'Não desenhe texto, letra, número, logotipo, placa, mapa legível, preço, pessoa identificável nem marca comercial.';

/** Fotos já publicadas no site. A capa é o caminhão oficial, sem imagem desenhada. */
const ARQUIVO_REAL: Record<PecaPremium, string | null> = {
  capa: null,
  central: '/proposta-tmseg/about-team-original.webp',
  fiscal: '/proposta-tmseg/service-fiscal-rota.png',
  escolta: '/proposta-tmseg/service-escolta.png',
  acompanhamento: '/proposta-tmseg/service-acompanhamento.png',
  guincho: '/proposta-tmseg/service-guincho.png',
};

/** O nome sugerido na impressão. O navegador grava esse título como PDF. */
export function nomeArquivoPdfProposta(id: string | null | undefined, cliente: string | null | undefined): string {
  const numero = String(id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'sem-id';
  const nome = String(cliente || 'Cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'Cliente';
  return `Proposta_${numero}_${nome}.pdf`;
}

/** Arquivo já publicado. Marca desconhecida fica na carreta neutra, sem logotipo inventado. */
export function cenaOficial(cliente: string): CenaOficial {
  const slug = slugVisual(cliente);
  const base = MARCAS.has(slug) ? slug : 'generico';
  return {
    slug,
    veiculo: `/caminhoes/3d/${base}-veiculo.webp`,
    recorte: `/caminhoes/3d/${base}-recorte.webp`,
    logo: logoConhecido(cliente),
  };
}

/** A capa. A imagem de referência aprovada não entra no pedido: ela tem texto e logotipo. */
export function pedidoCenaIlustrativa(): string {
  return pedidoDaPeca('capa');
}

/** Cada peça é um cenário. O navegador coloca os dados comerciais por cima. */
export function pedidoDaPeca(peca: PecaPremium): string {
  const cena: Record<PecaPremium, string> = {
    capa: 'Foto cinematográfica horizontal de uma rodovia à noite, depois da chuva. Um caminhão carreta branco, com baú liso e vazio, e um SUV escuro sem marca seguindo atrás, com uma luz âmbar no teto. Clima preto e vermelho, luzes da cidade ao fundo, acabamento premium.',
    central: 'Foto cinematográfica de uma central operacional moderna e escura, com vários monitores mostrando apenas brilhos abstratos. Luz vermelha suave, ambiente tecnológico, uma silhueta de costas sem rosto reconhecível.',
    fiscal: 'Cena cinematográfica noturna, em ângulo baixo, de um SUV escuro sem marca seguindo de perto um caminhão baú branco numa rodovia molhada. Faróis na névoa e reflexo vermelho no asfalto deixam clara a inspeção do trajeto. Sem pessoa visível.',
    escolta: 'Cena cinematográfica, de cima e de perto, de dois SUVs escuros sem marca e com luz âmbar no teto escoltando um caminhão baú branco numa rodovia à noite. A formação de acompanhamento fica evidente, com chuva recente e horizonte vermelho. Sem arma, sem pessoa e sem placa.',
    acompanhamento: 'Cena cinematográfica ampla de uma sala de monitoramento escura, com vários monitores mostrando só trilhas luminosas. Uma silhueta de costas, sem rosto, acompanha a operação. Luz vermelha, nada legível na tela.',
    guincho: 'Cena cinematográfica de um guincho prancha moderno, sem marca, rebocando um veículo numa rodovia molhada à noite. A remoção fica clara, com luz âmbar e reflexo vermelho. A traseira fica lisa, sem placa e sem caracteres.',
  };
  return `${cena[peca]} ${SEM_TEXTO}`;
}

export function chaveDaCena(cliente: string): string {
  return slugVisual(cliente || 'generico');
}

export function arquivoDaPeca(_cliente: string, peca: PecaPremium): string | null {
  return ARQUIVO_REAL[peca];
}

/** 481 minutos aparecem como 8h01min. O número guardado na cotação não muda. */
export function textoDuracaoViagem(minutos: number | null | undefined): string | null {
  if (minutos == null || !Number.isFinite(minutos) || minutos <= 0) return null;
  const total = Math.round(minutos);
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas <= 0) return `${resto}min`;
  return `${horas}h${String(resto).padStart(2, '0')}min`;
}

export function pecasPublicadas(cliente: string): ImagensPremium {
  return {
    capa: arquivoDaPeca(cliente, 'capa'),
    central: arquivoDaPeca(cliente, 'central'),
    fiscal: arquivoDaPeca(cliente, 'fiscal'),
    escolta: arquivoDaPeca(cliente, 'escolta'),
    acompanhamento: arquivoDaPeca(cliente, 'acompanhamento'),
    guincho: arquivoDaPeca(cliente, 'guincho'),
  };
}

/** 6152 vira "6.152+". Consulta vazia não vira número institucional. */
export function rotuloDeContagem(total: number | null | undefined): string | null {
  if (total == null || !Number.isFinite(total) || total < 0) return null;
  const inteiro = Math.floor(total);
  const texto = inteiro.toLocaleString('pt-BR');
  return inteiro > 0 ? `${texto}+` : texto;
}

export function podeGerarImagem(gastoUsd: number, proximoUsd: number, limiteUsd: number): boolean {
  if (!Number.isFinite(limiteUsd) || limiteUsd <= 0) return false;
  if (!Number.isFinite(gastoUsd) || gastoUsd < 0) return false;
  if (!Number.isFinite(proximoUsd) || proximoUsd < 0) return false;
  return gastoUsd + proximoUsd <= limiteUsd + 0.0001;
}

/** Aceita só imagem gerada aqui ou arquivo já publicado da frota e da proposta. */
export function heroUtil(bruto: unknown): string | null {
  const texto = typeof bruto === 'string' ? bruto.trim() : '';
  if (texto.startsWith('data:image/png') || texto.startsWith('data:image/jpeg') || texto.startsWith('data:image/webp')) {
    return texto.length <= 2_500_000 ? texto : null;
  }
  if (/^\/(caminhoes|propostas-premium)\/[a-z0-9./_-]+$/.test(texto) && !texto.includes('..')) return texto;
  return null;
}

export function imagensSeguras(bruto: unknown): ImagensPremium {
  const fonte = bruto && typeof bruto === 'object' ? bruto as Record<string, unknown> : {};
  return {
    capa: heroUtil(fonte.capa),
    central: heroUtil(fonte.central),
    fiscal: heroUtil(fonte.fiscal),
    escolta: heroUtil(fonte.escolta),
    acompanhamento: heroUtil(fonte.acompanhamento),
    guincho: heroUtil(fonte.guincho),
  };
}
