/** Espera as imagens do relatório antes de abrir o PDF. A prévia e a impressão usam o mesmo HTML. */

type ImagemRelatorio = {
  complete: boolean;
  naturalWidth: number;
  addEventListener: (evento: string, fn: () => void, opcoes?: { once?: boolean }) => void;
};

export async function aguardarImagensDoRelatorio(
  doc: { images: ArrayLike<ImagemRelatorio>; fonts?: { ready: Promise<unknown> } },
  limiteMs = 8000,
): Promise<{ ok: boolean; aviso: string }> {
  const imagens = Array.from(doc.images || []);
  const esperaImagens = Promise.all(imagens.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const fim = () => resolve();
      img.addEventListener('load', fim, { once: true });
      img.addEventListener('error', fim, { once: true });
    });
  }));
  const fontes = doc.fonts?.ready ?? Promise.resolve();
  await Promise.race([
    Promise.all([esperaImagens, fontes]),
    new Promise((resolve) => setTimeout(resolve, limiteMs)),
  ]);
  const faltando = imagens.filter((img) => !img.complete || img.naturalWidth <= 0).length;
  if (faltando > 0) {
    return {
      ok: false,
      aviso: `${faltando} imagem(ns) ainda não carregaram. O PDF não foi gerado para não sair sem foto, mapa ou logo.`,
    };
  }
  return { ok: true, aviso: '' };
}
