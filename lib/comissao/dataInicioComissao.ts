/**
 * Comissão só conta a partir do dia de cadastro do comercial no sistema.
 * Antes dessa data o faturamento existe, mas não agrega no funcionário.
 */
import { formatIsoDateFromTimestampBR } from '../dateUtils.js';
import { fetchAllRows } from './sincronizarComissoesFaturas.js';
import type { ComissaoDbClient } from './comissaoCore.js';
import type { LinhaQuadroCliente } from './quadroFaturamentoComissao.js';
import { calcularComissao, roundMoney } from './comissaoCalc.js';

export function isoDiaCadastroComissao(ts?: string | Date | null): string | null {
  const iso = formatIsoDateFromTimestampBR(ts);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/** Preferência: data do usuário no sistema; senão, data do cadastro em comerciais. */
export function dataInicioComissaoDoCadastro(opts: {
  usuarioCreatedAt?: string | Date | null;
  comercialCreatedAt?: string | Date | null;
}): string | null {
  return isoDiaCadastroComissao(opts.usuarioCreatedAt) || isoDiaCadastroComissao(opts.comercialCreatedAt);
}

export function lancamentoAposCadastro(
  dataLancamento: string | null | undefined,
  inicio: string | null | undefined,
): boolean {
  if (!inicio) return true;
  const d = String(dataLancamento || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d >= inicio;
}

export function filtrarLinhasAposCadastro(
  linhas: LinhaQuadroCliente[],
  inicioPorComercial: Map<string, string> | Record<string, string>,
): LinhaQuadroCliente[] {
  const map = inicioPorComercial instanceof Map
    ? inicioPorComercial
    : new Map(Object.entries(inicioPorComercial || {}));
  const out: LinhaQuadroCliente[] = [];
  for (const linha of linhas) {
    const id = String(linha.comercialId || '').trim();
    const inicio = id ? map.get(id) || null : null;
    const detalhes = (linha.detalhes || []).filter((d) => lancamentoAposCadastro(d.date, inicio));
    if (detalhes.length === 0) continue;
    let faturamento = 0;
    let imposto = 0;
    let baseLiquida = 0;
    let comissao = 0;
    for (const d of detalhes) {
      faturamento = roundMoney(faturamento + (Number(d.faturamento) || 0));
      imposto = roundMoney(imposto + (Number(d.imposto) || 0));
      const calc = calcularComissao(Number(d.faturamento) || 0, 16, 3);
      const liquido = Number(d.faturamento) - Number(d.imposto);
      baseLiquida = roundMoney(baseLiquida + (Number.isFinite(liquido) ? liquido : calc.valorBaseLiquida));
      comissao = roundMoney(comissao + (Number(d.valorAPagar) || 0));
    }
    out.push({
      ...linha,
      detalhes,
      faturas: detalhes.length,
      faturamento,
      imposto,
      baseLiquida,
      comissao,
    });
  }
  return out.sort((a, b) => b.faturamento - a.faturamento);
}

export async function carregarIniciosComissao(
  sb: ComissaoDbClient,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const comRes = await fetchAllRows(sb, 'comerciais', 'id, created_at, usuario_id');
  const userIds = [...new Set(
    (comRes.rows || [])
      .map((r) => Number(r.usuario_id))
      .filter((n) => Number.isFinite(n) && n > 0),
  )];
  const userCreated = new Map<number, string>();
  if (userIds.length > 0) {
    const usrRes = await fetchAllRows(sb, 'system_users', 'id, created_at');
    for (const u of usrRes.rows || []) {
      const id = Number(u.id);
      if (!userIds.includes(id)) continue;
      const iso = isoDiaCadastroComissao(u.created_at);
      if (iso) userCreated.set(id, iso);
    }
  }
  for (const c of comRes.rows || []) {
    const id = String(c.id || '').trim();
    if (!id) continue;
    const inicio = dataInicioComissaoDoCadastro({
      usuarioCreatedAt: userCreated.get(Number(c.usuario_id)) || null,
      comercialCreatedAt: c.created_at,
    });
    if (inicio) map.set(id, inicio);
  }
  return map;
}
