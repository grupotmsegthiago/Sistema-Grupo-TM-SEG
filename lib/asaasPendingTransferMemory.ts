/** Cache em memória — compartilhado entre rotas na mesma instância serverless. */

const MEMORY_TTL_MS = 20 * 60 * 1000;

type GlobalPending = Map<string, number>;

function memoryStore(): GlobalPending {
  const g = globalThis as typeof globalThis & { __asaasPendingTransfers?: GlobalPending };
  if (!g.__asaasPendingTransfers) g.__asaasPendingTransfers = new Map();
  return g.__asaasPendingTransfers;
}

function pruneMemory(): void {
  const now = Date.now();
  for (const [id, expiresAt] of memoryStore()) {
    if (expiresAt <= now) memoryStore().delete(id);
  }
}

export function rememberPendingTransferInMemory(transferId: string): void {
  const id = String(transferId || '').trim();
  if (!id) return;
  pruneMemory();
  memoryStore().set(id, Date.now() + MEMORY_TTL_MS);
}

export function isPendingTransferInMemory(transferId: string): boolean {
  const id = String(transferId || '').trim();
  if (!id) return false;
  pruneMemory();
  const expiresAt = memoryStore().get(id);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    memoryStore().delete(id);
    return false;
  }
  return true;
}
