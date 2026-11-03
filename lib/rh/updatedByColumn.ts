type ErroColuna = { code?: string; message?: string } | null | undefined;

/** PostgREST recusa a linha inteira quando updated_by não existe na tabela. */
export function erroColunaUpdatedByAusente(error: ErroColuna): boolean {
  if (!error) return false;
  const msg = `${error.code || ''} ${error.message || ''}`;
  return /updated_by/i.test(msg) && /(42703|PGRST204|schema cache|does not exist|Could not find)/i.test(msg);
}

export function semUpdatedBy<T extends Record<string, unknown>>(payload: T): Omit<T, 'updated_by'> {
  const { updated_by: _ignorado, ...resto } = payload;
  return resto;
}
