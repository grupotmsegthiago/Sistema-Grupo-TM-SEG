/**
 * Grava o vínculo auditável Fatura ↔ OS em financial_invoice_missions.
 * Fail-soft: falha de tabela/rede NÃO interrompe emissão de fatura/NF/Asaas.
 */

export type InvoiceMissionLinkClient = {
  from: (table: string) => any;
};

export function collectApprovedMissionIdsFromBulletin(
  missions: Array<{ id?: string | number | null; billing_approved?: boolean | null }> | null | undefined,
): string[] {
  const ids = (missions || [])
    .filter((m) => m?.billing_approved === true && m?.id != null && String(m.id).trim())
    .map((m) => String(m.id).trim());
  return [...new Set(ids)];
}

export function parseMissionIdsFromBody(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))];
}

export async function vincularMissionsAFatura(
  sb: InvoiceMissionLinkClient,
  invoiceId: string | null | undefined,
  missionIds: string[] | null | undefined,
): Promise<{ ok: boolean; linked: number; skipped?: boolean; error?: string }> {
  const faturaId = String(invoiceId || '').trim();
  const ids = [...new Set((missionIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!faturaId || ids.length === 0) {
    return { ok: true, linked: 0, skipped: true };
  }

  try {
    const rows = ids.map((mission_id) => ({
      invoice_id: faturaId,
      mission_id,
    }));
    const { error } = await sb
      .from('financial_invoice_missions')
      .upsert(rows, { onConflict: 'invoice_id,mission_id', ignoreDuplicates: true });
    if (error) {
      const missing = error.code === '42P01' || error.code === '42703' || /does not exist/i.test(error.message || '');
      if (missing) {
        console.warn('[invoice-os] tabela financial_invoice_missions ausente — vínculo não gravado');
        return { ok: false, linked: 0, skipped: true, error: error.message };
      }
      console.warn('[invoice-os] falha ao vincular OS à fatura:', error.message);
      return { ok: false, linked: 0, error: error.message };
    }
    return { ok: true, linked: ids.length };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[invoice-os] vincularMissionsAFatura:', message);
    return { ok: false, linked: 0, error: message };
  }
}
