/** A sessão financeira só vale se for deste usuário, não estiver revogada e não tiver vencido. */

export type LinhaSessao = {
  user_id?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
};

export function sessaoConfere(
  linha: LinhaSessao | null | undefined,
  userId: string,
  agora = Date.now(),
): boolean {
  if (!linha || !userId) return false;
  if (String(linha.user_id || '') !== String(userId)) return false;
  if (linha.revoked_at) return false;
  if (!linha.expires_at) return false;
  const expira = new Date(linha.expires_at).getTime();
  if (Number.isNaN(expira) || expira < agora) return false;
  return true;
}
