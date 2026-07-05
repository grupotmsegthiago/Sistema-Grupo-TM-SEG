/** Modelos oficiais suportados pela API Google Gemini (2025/2026). */
export const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';
export const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
export const GEMINI_PRO_MODEL = 'gemini-2.5-pro';

/** Modelos legados/inválidos → equivalente atual. */
const LEGACY_MODEL_MAP: Record<string, string> = {
  'gemini-3-flash-preview': GEMINI_TEXT_MODEL,
  'gemini-1.5-flash': GEMINI_TEXT_MODEL,
  'gemini-1.5-flash-latest': GEMINI_TEXT_MODEL,
  'gemini-1.5-flash-8b': GEMINI_TEXT_MODEL,
  'gemini-1.5-pro': GEMINI_PRO_MODEL,
  'gemini-1.5-pro-latest': GEMINI_PRO_MODEL,
  'gemini-2.0-flash-exp': GEMINI_TEXT_MODEL,
  'gemini-3-pro-image-preview': GEMINI_IMAGE_MODEL,
};

export const GEMINI_FALLBACK_MODELS = [
  GEMINI_TEXT_MODEL,
  'gemini-2.0-flash',
  GEMINI_PRO_MODEL,
] as const;

export function resolveGeminiModel(
  model?: string | null,
  kind: 'text' | 'image' = 'text',
): string {
  const fallback = kind === 'image' ? GEMINI_IMAGE_MODEL : GEMINI_TEXT_MODEL;
  if (!model || !String(model).trim()) return fallback;
  const normalized = String(model).trim();
  return LEGACY_MODEL_MAP[normalized] || normalized;
}

export function isRetriableGeminiModelError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('not found') ||
    msg.includes('404') ||
    msg.includes('invalid model') ||
    msg.includes('is not supported') ||
    msg.includes('model') && msg.includes('unavailable')
  );
}
