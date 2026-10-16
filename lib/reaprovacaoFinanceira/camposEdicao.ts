/**
 * Campos que a Edição Total pode gravar.
 * Identificador, log, histórico, snapshot e aprovação ficam de fora.
 * Tabela e franquia entram só no evento e em parametros_edicao_total.
 */
import { centavos } from './regras';
import type { CampoAuditado, OsReaprovacao } from './tipos';

export const COLUNAS_EDICAO_TOTAL = [
  'revenue_value',
  'cost_value',
  'toll_value',
  'toll_value_provider',
  'displacement_value',
  'displacement_value_provider',
  'start_km',
  'end_km',
  'provider_start_km',
  'provider_end_km',
  'total_distance',
  'traveled_distance',
] as const;

export const TEXTOS_EDICAO_TOTAL = [
  'start_time',
  'end_time',
  'provider_start_time',
  'provider_end_time',
  'estimated_time',
] as const;

export const BOOLEANOS_EDICAO_TOTAL = ['provider_ops_edited'] as const;

/** Não atualizam a OS nem o snapshot. Ficam no evento e nos parâmetros da edição. */
export const CAMPOS_SO_AUDITORIA = [
  'tabela_cliente',
  'tabela_fornecedor',
  'franquia_km',
  'franquia_horas',
  'km_excedente',
  'horas_excedentes',
] as const;

const NUMERICOS = new Set<string>([...COLUNAS_EDICAO_TOTAL, 'franquia_km', 'franquia_horas', 'km_excedente', 'horas_excedentes']);
const TEXTOS = new Set<string>([...TEXTOS_EDICAO_TOTAL, 'tabela_cliente', 'tabela_fornecedor']);
const BOOLEANOS = new Set<string>(BOOLEANOS_EDICAO_TOTAL);
const AUDITORIA = new Set<string>(CAMPOS_SO_AUDITORIA);
const PERMITIDOS = new Set<string>([...NUMERICOS, ...TEXTOS, ...BOOLEANOS]);

const ROTULOS: Record<string, string> = {
  revenue_value: 'Receita do serviço',
  cost_value: 'Custo do serviço',
  toll_value: 'Pedágio do cliente',
  toll_value_provider: 'Pedágio do fornecedor',
  displacement_value: 'Deslocamento do cliente',
  displacement_value_provider: 'Deslocamento do fornecedor',
  start_km: 'KM inicial do cliente',
  end_km: 'KM final do cliente',
  provider_start_km: 'KM inicial do fornecedor',
  provider_end_km: 'KM final do fornecedor',
  total_distance: 'Distância total',
  traveled_distance: 'Distância percorrida',
  start_time: 'Hora inicial do cliente',
  end_time: 'Hora final do cliente',
  provider_start_time: 'Hora inicial do fornecedor',
  provider_end_time: 'Hora final do fornecedor',
  estimated_time: 'Tempo estimado',
  provider_ops_edited: 'Dados operacionais do fornecedor',
  tabela_cliente: 'Tabela do cliente',
  tabela_fornecedor: 'Tabela do fornecedor',
  franquia_km: 'Franquia de quilômetros',
  franquia_horas: 'Franquia de horas',
  km_excedente: 'Quilômetros excedentes',
  horas_excedentes: 'Horas excedentes',
};

const DINHEIRO = new Set([
  'revenue_value',
  'cost_value',
  'toll_value',
  'toll_value_provider',
  'displacement_value',
  'displacement_value_provider',
]);

export function campoEdicaoPermitido(campo: string): boolean {
  return PERMITIDOS.has(campo);
}

export function campoSoAuditoria(campo: string): boolean {
  return AUDITORIA.has(campo);
}

export function rotuloCampo(campo: string): string {
  return ROTULOS[campo] || campo;
}

export function textoValorCampo(campo: string, valor: number | string): string {
  if (typeof valor === 'string') return valor || '—';
  if (DINHEIRO.has(campo)) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (BOOLEANOS.has(campo)) return valor ? 'sim' : 'não';
  return Number.isInteger(valor) ? String(valor) : valor.toLocaleString('pt-BR');
}

export function compararNumero(campo: string, antes: unknown, depois: unknown): CampoAuditado | null {
  if (!NUMERICOS.has(campo)) return null;
  const de = centavos(antes ?? 0);
  const para = centavos(depois ?? 0);
  if (de == null || para == null || de === para) return null;
  return { campo, antes: de / 100, depois: para / 100 };
}

export function compararTexto(campo: string, antes: unknown, depois: unknown): CampoAuditado | null {
  if (!TEXTOS.has(campo)) return null;
  const de = String(antes ?? '').trim();
  const para = String(depois ?? '').trim();
  if (de === para) return null;
  return { campo, antes: de, depois: para };
}

export function compararBooleano(campo: string, antes: unknown, depois: unknown): CampoAuditado | null {
  if (!BOOLEANOS.has(campo)) return null;
  const de = antes === true;
  const para = depois === true;
  if (de === para) return null;
  return { campo, antes: de ? 'sim' : 'não', depois: para ? 'sim' : 'não' };
}

export function juntarDiferencas(itens: Array<CampoAuditado | null | undefined>): CampoAuditado[] {
  const vistos = new Set<string>();
  const saida: CampoAuditado[] = [];
  for (const item of itens) {
    if (!item || vistos.has(item.campo)) continue;
    if (!campoEdicaoPermitido(item.campo)) continue;
    vistos.add(item.campo);
    saida.push(item);
  }
  return saida;
}

export function validarCamposEdicao(campos: unknown): { ok: true; campos: CampoAuditado[] } | { ok: false; erro: string } {
  if (!Array.isArray(campos) || campos.length === 0) {
    return { ok: false, erro: 'Nenhuma alteração para salvar.' };
  }
  if (campos.length > 40) {
    return { ok: false, erro: 'A lista de alterações excede o limite. Nada foi salvo.' };
  }
  const saida: CampoAuditado[] = [];
  for (const item of campos) {
    if (!item || typeof item !== 'object') {
      return { ok: false, erro: 'A lista de alterações é inválida. Nada foi salvo.' };
    }
    const campo = String((item as { campo?: unknown }).campo || '').trim();
    if (!campoEdicaoPermitido(campo)) {
      return { ok: false, erro: 'Há campo que a edição total não pode gravar. Nada foi salvo.' };
    }
    const antes = (item as { antes?: unknown }).antes;
    const depois = (item as { depois?: unknown }).depois;
    if (NUMERICOS.has(campo)) {
      const de = centavos(antes);
      const para = centavos(depois);
      if (de == null || para == null) {
        return { ok: false, erro: 'Há valor numérico inválido. Nada foi salvo.' };
      }
      if (de === para) continue;
      saida.push({ campo, antes: de / 100, depois: para / 100 });
      continue;
    }
    const de = String(antes ?? '').trim();
    const para = String(depois ?? '').trim();
    if (de.length > 500 || para.length > 500) {
      return { ok: false, erro: 'Há texto longo demais. Nada foi salvo.' };
    }
    if (de === para) continue;
    saida.push({ campo, antes: de, depois: para });
  }
  if (saida.length === 0) return { ok: false, erro: 'Nenhuma alteração para salvar.' };
  return { ok: true, campos: saida };
}

function parametroAtual(os: OsReaprovacao, campo: string): string | number | boolean | null {
  const mapa = os.parametros_edicao_total;
  if (!mapa || !Object.prototype.hasOwnProperty.call(mapa, campo)) return null;
  return mapa[campo] ?? null;
}

export function valorConfere(os: OsReaprovacao, campo: CampoAuditado): boolean {
  if (campoSoAuditoria(campo.campo)) {
    const guardado = parametroAtual(os, campo.campo);
    if (guardado == null || guardado === '') return true;
    if (NUMERICOS.has(campo.campo)) return centavos(guardado) === centavos(campo.antes);
    return String(guardado).trim() === String(campo.antes).trim();
  }
  if (NUMERICOS.has(campo.campo)) {
    const atual = (os as unknown as Record<string, unknown>)[campo.campo];
    return centavos(atual ?? 0) === centavos(campo.antes);
  }
  if (BOOLEANOS.has(campo.campo)) {
    const atual = (os as unknown as Record<string, unknown>)[campo.campo] === true ? 'sim' : 'não';
    return atual === String(campo.antes);
  }
  const atual = String((os as unknown as Record<string, unknown>)[campo.campo] ?? '').trim();
  return atual === String(campo.antes).trim();
}

export function aplicarCamposNaOs(os: OsReaprovacao, campos: CampoAuditado[], carimbo: string): OsReaprovacao {
  const proxima: OsReaprovacao = {
    ...os,
    snapshot_data: os.snapshot_data,
    parametros_edicao_total: { ...(os.parametros_edicao_total || {}) },
  };
  for (const campo of campos) {
    if (campoSoAuditoria(campo.campo)) {
      proxima.parametros_edicao_total = {
        ...(proxima.parametros_edicao_total || {}),
        [campo.campo]: campo.depois,
      };
      continue;
    }
    if (NUMERICOS.has(campo.campo)) {
      (proxima as unknown as Record<string, unknown>)[campo.campo] = Number(campo.depois);
      continue;
    }
    if (BOOLEANOS.has(campo.campo)) {
      (proxima as unknown as Record<string, unknown>)[campo.campo] = campo.depois === 'sim';
      continue;
    }
    (proxima as unknown as Record<string, unknown>)[campo.campo] = String(campo.depois);
  }
  if (campos.some((campo) => campo.campo === 'revenue_value')) proxima.revenue_edit_reason = carimbo;
  if (campos.some((campo) => campo.campo === 'cost_value')) proxima.cost_edit_reason = carimbo;
  return proxima;
}
