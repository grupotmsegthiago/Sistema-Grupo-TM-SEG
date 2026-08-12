/** Payloads read-only dos endpoints de migration — sem execução de SQL. */

export const ADD_MISSION_COLUMNS_RESPONSE = {
  message: 'Execute o seguinte SQL no Supabase SQL Editor:',
  sql: [
    "ALTER TABLE missions ADD COLUMN IF NOT EXISTS valor_zero_motivo TEXT DEFAULT '';",
    "ALTER TABLE missions ADD COLUMN IF NOT EXISTS reference_number TEXT DEFAULT '';",
    "ALTER TABLE missions ADD COLUMN IF NOT EXISTS billing_release TEXT DEFAULT '';",
    "NOTIFY pgrst, 'reload schema';",
  ],
} as const;

export const PROVIDER_OPS_COLUMNS = [
  { name: 'provider_start_km', type: 'double precision' },
  { name: 'provider_end_km', type: 'double precision' },
  { name: 'provider_start_time', type: 'timestamptz' },
  { name: 'provider_end_time', type: 'timestamptz' },
  { name: 'provider_ops_edited', type: 'boolean default false' },
  { name: 'revenue_edit_reason', type: 'text' },
  { name: 'cost_edit_reason', type: 'text' },
  { name: 'vendor_os_number', type: 'text' },
  { name: 'invoice_number', type: 'text' },
  { name: 'release_date', type: 'text' },
  { name: 'payment_date', type: 'text' },
  { name: 'verified_by', type: 'text' },
  { name: 'verified_at', type: 'timestamptz' },
] as const;

export function buildProviderOpsColumnsResponse() {
  const sqlStatements = PROVIDER_OPS_COLUMNS
    .map((c) => `ALTER TABLE missions ADD COLUMN IF NOT EXISTS ${c.name} ${c.type};`)
    .join('\n');
  return {
    ok: true,
    method: 'manual' as const,
    columns: PROVIDER_OPS_COLUMNS.map((c) => c.name),
    sql: sqlStatements,
    hint: 'Execute this SQL in Supabase SQL Editor if columns do not exist',
  };
}
