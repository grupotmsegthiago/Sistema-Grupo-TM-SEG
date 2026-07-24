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
    // Igual à NFS-e manual SP Amazon (NF 265): descrição do código sem prefixar "07930 -".
    name: 'Agenciamento, corretagem ou intermediação de bens móveis ou imóveis, não abrangidos em outros itens',
    label: '07930 — Intermediação / Agenciamento',
    // Discriminação dos serviços da mesma NF manual.
    descriptionBase: 'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS',
  },
] as const;

export function findMunicipalServiceOption(idOrCode: string): MunicipalServiceOption {
  const key = String(idOrCode || '').trim().toLowerCase();
  const byId = MUNICIPAL_SERVICE_OPTIONS.find((o) => o.id === key);
  if (byId) return byId;
  const byCode = MUNICIPAL_SERVICE_OPTIONS.find((o) => o.code === key.replace(/\D/g, ''));
  return byCode || MUNICIPAL_SERVICE_OPTIONS[0];
}

export function isAmazonBillingClient(
  name?: string | null,
  tradingName?: string | null,
): boolean {
  return `${name || ''} ${tradingName || ''}`.toUpperCase().includes('AMAZON');
}

/** Regra fixa Amazon (NFS-e manual SP nº 265): 07930 agenciamento. */
export function amazonMunicipalServiceOption(): MunicipalServiceOption {
  return findMunicipalServiceOption('intermediacao');
}

/** Payload para gravar em `clients.nf_*` (Amazon e reuso na UI). */
export function amazonClientNfFields(): {
  nf_municipal_service_code: string;
  nf_municipal_service_name: string;
  nf_service_description: string;
} {
  const opt = amazonMunicipalServiceOption();
  return {
    nf_municipal_service_code: opt.code,
    nf_municipal_service_name: opt.name,
    nf_service_description: opt.descriptionBase,
  };
}

export type ClientMunicipalNfFields = {
  name?: string | null;
  trading_name?: string | null;
  nf_municipal_service_code?: string | null;
  nf_municipal_service_name?: string | null;
  nf_service_description?: string | null;
};

/**
 * Resolve serviço municipal do cliente.
 * Amazon: sempre intermediação 07930 (cadastro + default de nome).
 * Demais: usa `nf_*` do cadastro quando completo; senão heurística por nome.
 */
export function resolveMunicipalServiceForClient(
  client?: ClientMunicipalNfFields | null,
): MunicipalServiceOption {
  if (isAmazonBillingClient(client?.name, client?.trading_name)) {
    return amazonMunicipalServiceOption();
  }

  const code = String(client?.nf_municipal_service_code || '').replace(/\D/g, '');
  const storedName = String(client?.nf_municipal_service_name || '').trim();
  if (code && storedName) {
    if (/agenciamento|intermedia/i.test(storedName)) {
      return findMunicipalServiceOption('intermediacao');
    }
    const exact = MUNICIPAL_SERVICE_OPTIONS.find(
      (o) => o.code === code && (o.name === storedName || storedName.includes(o.name) || o.name.includes(storedName)),
    );
    if (exact) return exact;
    const desc = String(client?.nf_service_description || '').trim();
    return {
      id: `client-${code}`,
      code,
      name: storedName,
      label: `${code} — ${storedName.replace(/^\d+\s*[-—]\s*/, '').slice(0, 48)}`,
      descriptionBase: desc || `Ref. aos Serviços — ${storedName}`,
    };
  }

  return defaultMunicipalServiceForClient(client?.name, client?.trading_name);
}

/** Sugestão automática por nome do cliente (pode ser alterada no modal). */
export function defaultMunicipalServiceForClient(
  name?: string | null,
  tradingName?: string | null,
): MunicipalServiceOption {
  const nm = `${name || ''} ${tradingName || ''}`.toUpperCase();
  // Amazon: NFS-e manual SP usa 07930 (agenciamento/intermediação), não 06298.
  if (nm.includes('AMAZON')) return amazonMunicipalServiceOption();
  if (nm.includes('CEVA')) return findMunicipalServiceOption('intermediacao');
  return findMunicipalServiceOption('escolta');
}
