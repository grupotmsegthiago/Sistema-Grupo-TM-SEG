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
