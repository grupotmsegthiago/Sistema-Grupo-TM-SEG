/** Erro da gravação da solicitação. Constraint volta no JSON. O resto fica no log. */

const CODIGOS_DE_CONSTRAINT = new Set(['23505', '23502', '23503', '23514', '22P02', '42703']);

export type FalhaRegistro = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export function falhaDeRegistro(error: unknown): FalhaRegistro {
  if (error && typeof error === 'object') {
    const bruto = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    return {
      message: String(bruto.message || error),
      code: bruto.code ? String(bruto.code) : undefined,
      details: bruto.details ? String(bruto.details) : undefined,
      hint: bruto.hint ? String(bruto.hint) : undefined,
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

export function payloadSanitizado(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const origem = body as Record<string, unknown>;
  const copia: Record<string, unknown> = {};
  for (const chave of ['pedido', 'agentes', 'dataInicio', 'dataFim', 'origem', 'destino', 'operacao', 'identificacao', 'motorista', 'placa', 'quemAutorizou', 'atendimentoPgr', 'contrato', 'tsp', 'quantidade']) {
    if (origem[chave] != null) copia[chave] = origem[chave];
  }
  return copia;
}

export function registrarFalhaSolicitacao(prefixo: string, error: unknown, body: unknown): FalhaRegistro {
  const falha = falhaDeRegistro(error);
  console.error(
    `[${prefixo}] solicitação`,
    falha.message,
    falha.code || '',
    falha.details || '',
    falha.hint || '',
    JSON.stringify(payloadSanitizado(body)),
  );
  return falha;
}

/** Em produção, só constraint mostra o campo. Fora dela, a mensagem inteira volta. */
export function corpoErroSolicitacao(error: unknown): { error: string; detalhe?: string; codigo?: string; campo?: string } {
  const falha = falhaDeRegistro(error);
  const corpo: { error: string; detalhe?: string; codigo?: string; campo?: string } = {
    error: 'Não foi possível registrar a solicitação.',
  };
  const mostra = process.env.NODE_ENV !== 'production' || (falha.code != null && CODIGOS_DE_CONSTRAINT.has(falha.code));
  if (!mostra) return corpo;
  corpo.detalhe = falha.message;
  if (falha.code) corpo.codigo = falha.code;
  if (falha.details) corpo.campo = falha.details;
  return corpo;
}
