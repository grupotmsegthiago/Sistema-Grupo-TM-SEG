/**
 * Deslocamento cobrável da OS (cliente / fornecedor).
 *
 * Mesma regra do Relatório de OS / canônico:
 * - Se já há R$ em displacement_value(_provider), usa o persistido.
 * - Senão, com dhl_deslocamento_km > 0, deriva km × taxa (fallback DHL por UF no cliente).
 *
 * Usar em boletim, Contas a Receber/Pagar e verificação de fornecedor para
 * não “perder” o DESL que o relatório já mostra a partir do KM autorizado.
 */
import { resolveDisplacementFromAuthorizedKm } from '../financialUtils';

export type MissionDisplacementSource = {
  dhl_deslocamento_km?: number | null;
  displacement_value?: number | null;
  displacement_value_provider?: number | null;
  origin?: string | null;
  is_same_os?: boolean | null;
};

export function resolveMissionDisplacement(
  m: MissionDisplacementSource | null | undefined,
  rates?: {
    clientUnitPriceKm?: number | null;
    providerUnitPriceKm?: number | null;
  },
): { client: number; provider: number; km: number } {
  if (!m) return { client: 0, provider: 0, km: 0 };
  const r = resolveDisplacementFromAuthorizedKm({
    dhlDeslocamentoKm: m.dhl_deslocamento_km,
    displacementValue: m.displacement_value,
    displacementValueProvider: m.displacement_value_provider,
    clientUnitPriceKm: rates?.clientUnitPriceKm,
    providerUnitPriceKm: rates?.providerUnitPriceKm,
    origin: m.origin,
    isSameOs: !!m.is_same_os,
  });
  return { client: r.client, provider: r.provider, km: r.km };
}
