/** Opções de serviço municipal (lista LC 116) usadas no Gerar Fatura / NF Asaas. */

export type MunicipalServiceOption = {
  id: string;
  /** Código do serviço municipal (campo Asaas municipalServiceCode). */
  code: string;
  /** Nome completo enviado ao Asaas. */
  name: string;
  /** Rótulo curto na UI. */
  label: string;
  /** Base da descrição da cobrança/NF. */
  descriptionBase: string;
};

export const MUNICIPAL_SERVICE_OPTIONS: readonly MunicipalServiceOption[] = [
  {
    id: 'escolta',
    code: '07930',
    name: '07930 - Monitoramento e rastreamento a distância de veículos, cargas, pessoas e semoventes',
    label: '07930 — Monitoramento / Escolta',
    descriptionBase: 'Ref. aos Serviços de Intermediação de Escolta Armada',
  },
  {
    id: 'rastreamento',
    code: '06298',
    name: '06298 - Rastreamento e Monitoramento de Carga',
    label: '06298 — Rastreamento e Monitoramento de Carga',
    descriptionBase: 'Ref. aos Serviços de Rastreamento e Monitoramento de Carga',
  },
  {
    id: 'intermediacao',
    code: '07930',
    // Nome alinhado à NFS-e manual SP (ex.: Amazon NF 265) — item LC 116 / código municipal 07930.
    name: '07930 - Agenciamento, corretagem ou intermediação de bens móveis ou imóveis, não abrangidos em outros itens',
    label: '07930 — Intermediação / Agenciamento',
    descriptionBase: 'Ref. aos Serviços de Intermediação de Agenciamento de Contrato',
  },
] as const;

export function findMunicipalServiceOption(idOrCode: string): MunicipalServiceOption {
  const key = String(idOrCode || '').trim().toLowerCase();
  const byId = MUNICIPAL_SERVICE_OPTIONS.find((o) => o.id === key);
  if (byId) return byId;
  const byCode = MUNICIPAL_SERVICE_OPTIONS.find((o) => o.code === key.replace(/\D/g, ''));
  return byCode || MUNICIPAL_SERVICE_OPTIONS[0];
}

/** Sugestão automática por nome do cliente (pode ser alterada no modal). */
export function defaultMunicipalServiceForClient(
  name?: string | null,
  tradingName?: string | null,
): MunicipalServiceOption {
  const nm = `${name || ''} ${tradingName || ''}`.toUpperCase();
  // Amazon: NFS-e manual SP usa 07930 (agenciamento/intermediação), não 06298.
  if (nm.includes('AMAZON')) return findMunicipalServiceOption('intermediacao');
  if (nm.includes('CEVA')) return findMunicipalServiceOption('intermediacao');
  return findMunicipalServiceOption('escolta');
}
