/** Compara nome do login com cadastro RH (ex.: "Daniel Pinto" ↔ "DANIEL LUIZ LIMA PINTO"). */
export function namesLikelyMatch(employeeName: string, userName: string): boolean {
  const e = String(employeeName || '').trim().toLowerCase();
  const u = String(userName || '').trim().toLowerCase();
  if (!e || !u) return false;
  if (e === u || e.includes(u) || u.includes(e)) return true;

  const eTokens = e.split(/\s+/).filter(Boolean);
  const uTokens = u.split(/\s+/).filter((t) => t.length > 1);
  if (uTokens.length === 0) {
    const first = u.split(/\s+/)[0];
    return !!first && eTokens.includes(first);
  }
  return uTokens.every((t) => eTokens.includes(t));
}
