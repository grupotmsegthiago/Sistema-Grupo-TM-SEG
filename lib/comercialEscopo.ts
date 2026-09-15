/**
 * Carteira do comercial: clientes com responsavel_comercial_id = cadastro dele.
 * Fail-closed: sem vínculo de usuário → sem cliente → sem OS/comissão alheia.
 */
export function nomesParaEscopoCliente(
  clients: Array<{ name?: string | null; trading_name?: string | null }>,
): string[] {
  const set = new Set<string>();
  for (const c of clients || []) {
    const nome = String(c.name || '').trim();
    const fantasia = String(c.trading_name || '').trim();
    if (nome) set.add(nome);
    if (fantasia) set.add(fantasia);
  }
  return [...set];
}

export function idUsuarioNumerico(usuarioId: number | string | null | undefined): number | null {
  const n = Number(usuarioId);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type SbLite = {
  from: (table: string) => {
    select: (cols: string) => any;
  };
};

export async function carregarNomesClientesDoComercial(
  sb: SbLite,
  usuarioId: number | string | null | undefined,
): Promise<{ comercialId: string | null; nomes: string[] }> {
  const idNum = idUsuarioNumerico(usuarioId);
  if (!idNum) return { comercialId: null, nomes: [] };
  const { data: comercial, error: comErr } = await sb
    .from('comerciais')
    .select('id')
    .eq('usuario_id', idNum)
    .maybeSingle();
  if (comErr || !comercial?.id) return { comercialId: null, nomes: [] };
  const comercialId = String(comercial.id);
  const { data: clientes, error: cliErr } = await sb
    .from('clients')
    .select('name, trading_name')
    .eq('responsavel_comercial_id', comercialId);
  if (cliErr) return { comercialId, nomes: [] };
  return { comercialId, nomes: nomesParaEscopoCliente(clientes || []) };
}
