export type FaixaVertical = { inicio: number; fim: number };

/**
 * Junta retângulos que ocupam a mesma faixa vertical.
 * Dois cards lado a lado viram uma faixa só. Um bloco dentro do outro também.
 * Faixas que só se encostam continuam separadas, para a quebra poder cair entre elas.
 */
export function faixasVerticais(retangulos: Array<{ top: number; bottom: number }>): FaixaVertical[] {
  const ordenados = retangulos
    .map((retangulo) => ({ inicio: retangulo.top, fim: retangulo.bottom }))
    .filter((faixa) => faixa.fim > faixa.inicio)
    .sort((a, b) => a.inicio - b.inicio || a.fim - b.fim);
  const faixas: FaixaVertical[] = [];
  for (const faixa of ordenados) {
    const ultima = faixas[faixas.length - 1];
    if (ultima && faixa.inicio < ultima.fim - 0.5) {
      ultima.inicio = Math.min(ultima.inicio, faixa.inicio);
      ultima.fim = Math.max(ultima.fim, faixa.fim);
    } else {
      faixas.push({ inicio: faixa.inicio, fim: faixa.fim });
    }
  }
  return faixas;
}

/**
 * Estende as faixas para cobrir o artigo inteiro.
 * O vão entre dois blocos fica na faixa de cima. O corte não atravessa bloco.
 */
export function faixasCobertas(retangulos: Array<{ top: number; bottom: number }>, alturaTotal: number): FaixaVertical[] {
  const altura = Math.max(0, alturaTotal);
  const base = faixasVerticais(retangulos)
    .map((faixa) => ({
      inicio: Math.max(0, Math.min(faixa.inicio, altura)),
      fim: Math.max(0, Math.min(faixa.fim, altura)),
    }))
    .filter((faixa) => faixa.fim > faixa.inicio + 0.5);
  if (base.length === 0) return altura > 0 ? [{ inicio: 0, fim: altura }] : [];
  const faixas = base.map((faixa) => ({ ...faixa }));
  faixas[0].inicio = 0;
  for (let indice = 0; indice < faixas.length - 1; indice += 1) {
    faixas[indice].fim = faixas[indice + 1].inicio;
  }
  faixas[faixas.length - 1].fim = altura;
  return faixas.filter((faixa) => faixa.fim > faixa.inicio + 0.5);
}

/**
 * Agrupa faixas que cabem juntas na folha.
 * Uma faixa mais alta que a folha fica sozinha; quem desenha a reduz para uma página.
 */
export function gruposNaFolha(faixas: FaixaVertical[], alturaUtilPx: number): number[][] {
  const teto = Math.max(1, alturaUtilPx);
  const grupos: number[][] = [];
  let atual: number[] = [];
  let usado = 0;
  faixas.forEach((faixa, indice) => {
    const alturaFaixa = Math.max(0, faixa.fim - faixa.inicio);
    if (atual.length > 0 && usado + alturaFaixa > teto + 0.5) {
      grupos.push(atual);
      atual = [];
      usado = 0;
    }
    atual.push(indice);
    usado += alturaFaixa;
  });
  if (atual.length > 0) grupos.push(atual);
  return grupos;
}

/**
 * Empilha blocos inteiros na folha A4.
 * Um bloco nunca muda de página no meio: se não cabe no que sobrou, vai para a próxima.
 * Altura maior que a folha já deve ter sido reduzida pelo chamador.
 */
export function paginasDosBlocos(alturasMm: number[], alturaUtilMm: number): number[] {
  const teto = Math.max(1, alturaUtilMm);
  const paginas: number[] = [];
  let usado = 0;
  let pagina = 0;
  for (const bruto of alturasMm) {
    const altura = Math.max(0, bruto);
    if (usado > 0 && usado + altura > teto + 0.05) {
      pagina += 1;
      usado = 0;
    }
    paginas.push(pagina);
    usado += altura;
  }
  return paginas;
}
