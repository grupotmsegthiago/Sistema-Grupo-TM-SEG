export const AUDIT_SUMMARY_SETTINGS_KEY = 'audit_summary';

export type AuditSummarySettings = {
  aiPromptPrefix: string;
  temperature: number;
  maxOutputTokens: number;
};

export const AUDIT_SUMMARY_DEFAULTS: AuditSummarySettings = {
  aiPromptPrefix:
    'Você é auditor financeiro-operacional da TM SEG. Com base nos dados JSON abaixo, escreva um parágrafo único (máx. 6 frases) em português do Brasil, objetivo, profissional e prático, resumindo a OS para a diretoria. Cite riscos, pendências e pontos de atenção se existirem. Não use markdown.\n\n',
  temperature: 0.3,
  maxOutputTokens: 400,
};

export const sanitizeAuditSummarySettings = (raw: any): AuditSummarySettings => ({
  aiPromptPrefix:
    typeof raw?.aiPromptPrefix === 'string' && raw.aiPromptPrefix.trim()
      ? raw.aiPromptPrefix
      : AUDIT_SUMMARY_DEFAULTS.aiPromptPrefix,
  temperature: Number.isFinite(Number(raw?.temperature))
    ? Math.max(0, Math.min(1, Number(raw.temperature)))
    : AUDIT_SUMMARY_DEFAULTS.temperature,
  maxOutputTokens: Number.isFinite(Number(raw?.maxOutputTokens))
    ? Math.max(100, Math.min(2000, Math.round(Number(raw.maxOutputTokens))))
    : AUDIT_SUMMARY_DEFAULTS.maxOutputTokens,
});
