// Otimizador de imagens para leitura por IA (Gemini Vision).
//
// PROBLEMA: prints/fotos vindos do celular chegam com 2–4 MB e resolução
// gigante (ex.: 3000×4000). Enviar esse base64 cru para a IA deixa a leitura
// LENTA (upload grande + a IA processa mais "tiles" da imagem).
//
// SOLUÇÃO: só para a CÓPIA enviada à IA, reduzimos a maior dimensão para um
// teto (padrão 1600px) e recomprimimos em JPEG de alta qualidade (0.85). Isso
// mantém o texto/números perfeitamente legíveis (hodômetro, tabela, ficha) mas
// corta o tamanho do payload em 80–95%, acelerando muito a resposta.
//
// IMPORTANTE: a foto ORIGINAL (evidência salva no bucket, preview exibido ao
// usuário) NUNCA passa por aqui — a qualidade do arquivo guardado é preservada.
// Este helper é usado apenas no momento de montar o `inlineData` da requisição.
//
// Fail-soft: qualquer falha (canvas indisponível, formato exótico, SSR) cai no
// base64 cru do arquivo original, garantindo que a leitura continue funcionando.

export interface AIImagePayload {
  mimeType: string;
  data: string; // base64 SEM o prefixo "data:...;base64,"
}

export interface OptimizeImageOptions {
  // Maior lado permitido (px). 1600 mantém números/letras nítidos para OCR.
  maxDim?: number;
  // Qualidade do JPEG (0–1). 0.85 é praticamente indistinguível a olho nu.
  quality?: number;
  // Arquivos de imagem menores que isto (bytes) e já dentro do maxDim são
  // enviados sem recompressão (evita perda desnecessária de qualidade).
  skipIfSmallerThan?: number;
}

const DEFAULT_MAX_DIM = 1600;
const DEFAULT_QUALITY = 0.85;
const DEFAULT_SKIP_BYTES = 400 * 1024; // 400 KB

// Calcula as dimensões reduzidas mantendo a proporção. Função pura (testável).
export function computeScaledDimensions(
  width: number,
  height: number,
  maxDim: number,
): { width: number; height: number; scaled: boolean } {
  const w = Number(width);
  const h = Number(height);
  const longest = Math.max(w, h);
  if (!Number.isFinite(longest) || longest <= 0 || !Number.isFinite(maxDim) || maxDim <= 0 || longest <= maxDim) {
    return { width: Math.max(1, Math.round(w) || 1), height: Math.max(1, Math.round(h) || 1), scaled: false };
  }
  const ratio = maxDim / longest;
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
    scaled: true,
  };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler a imagem'));
    reader.readAsDataURL(file);
  });
}

function stripBase64Prefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao decodificar a imagem'));
    img.src = dataUrl;
  });
}

// Recebe um File/Blob de imagem e devolve o payload pronto para o `inlineData`
// da IA, já reduzido/comprimido. Nunca lança: em erro, retorna o base64 cru.
export async function optimizeImageForAI(
  file: File | Blob,
  options: OptimizeImageOptions = {},
): Promise<AIImagePayload> {
  const maxDim = options.maxDim ?? DEFAULT_MAX_DIM;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const skipBytes = options.skipIfSmallerThan ?? DEFAULT_SKIP_BYTES;
  const originalType = (file as File).type || 'image/png';

  const fallback = async (): Promise<AIImagePayload> => ({
    mimeType: originalType,
    data: stripBase64Prefix(await readAsDataUrl(file)),
  });

  // Ambientes sem DOM/canvas (SSR) ou formatos não rasterizáveis: base64 cru.
  const isImage = originalType.startsWith('image/');
  const isRasterizable = isImage && originalType !== 'image/gif';
  if (typeof document === 'undefined' || !isRasterizable) {
    return fallback();
  }

  try {
    const dataUrl = await readAsDataUrl(file);
    const img = await loadImage(dataUrl);
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    const { width, height, scaled } = computeScaledDimensions(naturalW, naturalH, maxDim);

    // Já é pequena e leve: mantém o original (qualidade máxima, sem recomprimir).
    if (!scaled && (file as File).size && (file as File).size <= skipBytes) {
      return { mimeType: originalType, data: stripBase64Prefix(dataUrl) };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback();
    // Fundo branco: evita transparência preta ao converter PNG -> JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const optimized = canvas.toDataURL('image/jpeg', quality);
    const data = stripBase64Prefix(optimized);
    if (!data) return fallback();
    return { mimeType: 'image/jpeg', data };
  } catch {
    return fallback();
  }
}
