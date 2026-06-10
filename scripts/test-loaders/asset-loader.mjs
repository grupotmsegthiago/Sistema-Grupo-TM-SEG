// Loader de teste: intercepta imports de assets estáticos (imagens) para que
// componentes React possam ser carregados sob `node --test` / `tsx` sem que o
// bundler do Vite esteja presente. Cada import de imagem vira uma string stub,
// reproduzindo o comportamento do Vite (que devolve a URL do asset).
//
// Registrado junto com o loader do tsx via flags --import. A ordem importa: este
// loader roda primeiro na cadeia e delega tudo que não for imagem para o tsx.

const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp)(\?.*)?$/i;

export async function resolve(specifier, context, nextResolve) {
  if (ASSET_RE.test(specifier)) {
    // Resolve para uma URL própria; o load abaixo curto-circuita a leitura do
    // arquivo, então a imagem nem precisa existir no disco.
    const base = context.parentURL || 'file:///';
    const url = new URL(specifier, base).href;
    return { url, format: 'asset-stub', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (context.format === 'asset-stub' || ASSET_RE.test(url)) {
    return {
      format: 'module',
      source: 'export default "test-asset-stub";',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
