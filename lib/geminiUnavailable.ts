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
