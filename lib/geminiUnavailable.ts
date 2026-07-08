export type GeminiErrorCode =
  | 'KEY_MISSING'
  | 'KEY_INVALID'
  | 'QUOTA'
  | 'BILLING'
  | 'MODEL'
  | 'NETWORK'
  | 'UNKNOWN';

export function classifyGeminiError(error: unknown): { code: GeminiErrorCode; message: string } {
  const message = error instanceof Error ? error.message : String(error || 'Erro desconhecido');
  const msg = message.toLowerCase();

  if (/não configurada|not configured|chave gemini/.test(msg)) {
    return { code: 'KEY_MISSING', message };
  }
  if (/api key not valid|api_key_invalid|invalid.?api.?key|invalid_argument.*api key/.test(msg)) {
    return { code: 'KEY_INVALID', message: 'Chave GEMINI_API_KEY inválida ou revogada no Google AI Studio.' };
  }
  if (/quota|rate.?limit|resource.?exhausted|429/.test(msg)) {
    return { code: 'QUOTA', message: 'Cota ou limite de requisições da API Gemini excedido.' };
  }
  if (/billing|payment|faturamento|enable billing|credit/.test(msg)) {
    return { code: 'BILLING', message: 'Faturamento do Google AI Studio inativo ou sem créditos.' };
  }
  if (/not found|404|invalid model|is not supported|model.*unavailable/.test(msg)) {
    return { code: 'MODEL', message: 'Modelo Gemini indisponível para esta chave/região.' };
  }
  if (/timeout|fetch|network|503|502|504|econnreset|enotfound/.test(msg)) {
    return { code: 'NETWORK', message: 'Falha de rede ao contactar a API Gemini.' };
  }

  return { code: 'UNKNOWN', message };
}

/** Erros de infraestrutura Gemini/API — permite cadastro facial sem bloquear o usuário. */
export function isGeminiUnavailableError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    /timeout|fetch|network|503|502|504|429/.test(msg) ||
    /blocked|generativelanguage|generatecontent/.test(msg) ||
    /permission.?denied|forbidden|403/.test(msg) ||
    /chave gemini|não configurada|not configured|api key/.test(msg) ||
    /quota|rate.?limit|unavailable|internal server/.test(msg) ||
    /não autorizado|unauthorized|401/.test(msg)
  );
}
