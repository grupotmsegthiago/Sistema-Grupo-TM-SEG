/** Aplica no resultado da API os filtros que a tela já fazia no Supabase. */

type Linha = Record<string, unknown>;

export type PedidoTabela = {
  filtros: Array<{ tipo: 'eq' | 'ilike' | 'in' | 'or'; coluna?: string; valor?: unknown }>;
  ordem: Array<{ coluna: string; crescente: boolean }>;
  faixa: { de: number; ate: number } | null;
  uma: boolean;
  talvez: boolean;
  soContagem: boolean;
};

export function pedidoTabelaVazio(): PedidoTabela {
  return { filtros: [], ordem: [], faixa: null, uma: false, talvez: false, soContagem: false };
}

function texto(valor: unknown): string {
  return String(valor ?? '');
}

function ilike(valor: unknown, padrao: string): boolean {
  const fonte = texto(valor).toLowerCase();
  const corpo = padrao.toLowerCase().replace(/[%_]/g, (marca) => (marca === '%' ? '.*' : '.'));
  try {
    return new RegExp(`^${corpo}$`).test(fonte);
  } catch {
    return false;
  }
}

function partirOu(expressao: string): string[] {
  const partes: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < expressao.length; i += 1) {
    const char = expressao[i];
    if (char === '"') {
      aspas = !aspas;
      atual += char;
      continue;
    }
    if (char === ',' && !aspas) {
      partes.push(atual);
      atual = '';
      continue;
    }
    atual += char;
  }
  if (atual) partes.push(atual);
  return partes;
}

function casaTermo(linha: Linha, termo: string): boolean {
  const limpo = termo.trim();
  const match = limpo.match(/^([a-zA-Z0-9_]+)\.(eq|ilike)\.(.*)$/);
  if (!match) return false;
  const coluna = match[1];
  const op = match[2];
  let valor = match[3] || '';
  if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1).replace(/\\"/g, '"');
  if (op === 'eq') return texto(linha[coluna]) === valor;
  return ilike(linha[coluna], valor);
}

export function aplicarPedidoTabela(linhas: Linha[], pedido: PedidoTabela): { data: Linha[] | Linha | null; count: number | null } {
  let atual = linhas.slice();
  for (const filtro of pedido.filtros) {
    if (filtro.tipo === 'eq' && filtro.coluna) {
      atual = atual.filter((linha) => texto(linha[filtro.coluna!]) === texto(filtro.valor));
    } else if (filtro.tipo === 'ilike' && filtro.coluna) {
      atual = atual.filter((linha) => ilike(linha[filtro.coluna!], texto(filtro.valor)));
    } else if (filtro.tipo === 'in' && filtro.coluna) {
      const valores = new Set((Array.isArray(filtro.valor) ? filtro.valor : []).map(texto));
      atual = atual.filter((linha) => valores.has(texto(linha[filtro.coluna!])));
    } else if (filtro.tipo === 'or') {
      const termos = partirOu(texto(filtro.valor));
      atual = atual.filter((linha) => termos.some((termo) => casaTermo(linha, termo)));
    }
  }
  for (const ordem of pedido.ordem) {
    atual.sort((a, b) => {
      const va = texto(a[ordem.coluna]);
      const vb = texto(b[ordem.coluna]);
      const cmp = va.localeCompare(vb, 'pt-BR', { numeric: true });
      return ordem.crescente ? cmp : -cmp;
    });
  }
  const count = atual.length;
  if (pedido.faixa) atual = atual.slice(pedido.faixa.de, pedido.faixa.ate + 1);
  if (pedido.soContagem) return { data: null, count };
  if (pedido.uma) return { data: atual[0] || null, count };
  return { data: atual, count };
}
