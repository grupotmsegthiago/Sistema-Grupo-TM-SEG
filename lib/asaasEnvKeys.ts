/** Lê a primeira variável de ambiente não vazia (ordem = prioridade). */
export function readFirstEnv(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

/** Asaas — TM Segurança (Consultoria). Preferir `TMSEGURANCA` na Vercel. */
export function getAsaasApiKeyTmSeguranca(): string {
  return readFirstEnv(
    'TMSEGURANCA',
    'TMSEGURANÇA',
    'ASAAS_API_KEY_TMSECURITY',
    'ASAAS_API_KEY_TM_SEGURANCA',
  );
}

/** Asaas — TM Security (Gestão Corporativa — CNPJ distinto). */
export function getAsaasApiKeyTmSecurity(): string {
  return readFirstEnv(
    'ASAAS_API_KEY_TMSECURITY_60',
    'ASAAS_API_KEY_TM_SECURITY',
  );
}
