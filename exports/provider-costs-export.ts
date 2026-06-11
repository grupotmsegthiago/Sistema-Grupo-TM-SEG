import { exportFormattedExcel } from './excel-export-template';

export interface ProviderCostExportProvider {
  name: string;
  trading_name?: string | null;
  cnpj?: string | null;
  state?: string | null;
}

export interface ProviderCostExportTable {
  provider: string;
  operation_type: string;
  activation_cost?: number | null;
  franchise_hours?: number | null;
  franchise_km?: number | null;
  cost_per_extra_km?: number | null;
  cost_per_extra_hour?: number | null;
  cancellation_fee?: number | null;
}

const HEADERS = [
  'FORNECEDOR',
  'CNPJ',
  'UF',
  'TIPO DE OPERAÇÃO',
  'FRANQUIA KM',
  'FRANQUIA HORAS',
  'VALOR DE ACIONAMENTO',
  'CUSTO KM EXTRA',
  'CUSTO HORA EXTRA',
  'TAXA DE CANCELAMENTO',
];

function isAutoMaster(op: string | undefined | null): boolean {
  return (op || '').toUpperCase().includes('__AUTO_MASTER__');
}

function is100KmTable(t: ProviderCostExportTable): boolean {
  if (isAutoMaster(t.operation_type)) return false;
  if (Number(t.franchise_km) === 100) return true;
  return /(^|\D)100\s*KM(\D|$)/i.test(t.operation_type || '');
}

function providerLabel(p: ProviderCostExportProvider): string {
  const name = (p.name || '').trim();
  const trading = (p.trading_name || '').trim();
  if (trading && trading.toUpperCase() !== name.toUpperCase()) {
    return `${name} (${trading})`;
  }
  return name;
}

export async function exportProviderCosts(
  providers: ProviderCostExportProvider[],
  costTables: ProviderCostExportTable[],
): Promise<Blob> {
  const tablesByProvider = new Map<string, ProviderCostExportTable[]>();
  for (const t of costTables.filter(is100KmTable)) {
    const key = (t.provider || '').trim().toUpperCase();
    if (!key) continue;
    const list = tablesByProvider.get(key) || [];
    list.push(t);
    tablesByProvider.set(key, list);
  }

  const sortedProviders = [...providers].sort((a, b) =>
    providerLabel(a).localeCompare(providerLabel(b), 'pt-BR'),
  );

  const rows: (string | number | null | undefined)[][] = [];

  for (const p of sortedProviders) {
    const label = providerLabel(p);
    const cnpj = p.cnpj || '';
    const uf = (p.state || '').toUpperCase();
    const tables = tablesByProvider.get((p.name || '').trim().toUpperCase()) || [];

    if (tables.length === 0) {
      rows.push([label, cnpj, uf, '', '', '', '', '', '', '']);
      continue;
    }

    const sortedTables = [...tables].sort((a, b) => {
      if (isAutoMaster(a.operation_type) !== isAutoMaster(b.operation_type)) {
        return isAutoMaster(a.operation_type) ? -1 : 1;
      }
      return (a.operation_type || '').localeCompare(b.operation_type || '', 'pt-BR');
    });

    for (const t of sortedTables) {
      const opLabel = isAutoMaster(t.operation_type)
        ? 'Motor Automático'
        : (t.operation_type || '');
      rows.push([
        label,
        cnpj,
        uf,
        opLabel,
        Number(t.franchise_km) || 0,
        Number(t.franchise_hours) || 0,
        Number(t.activation_cost) || 0,
        Number(t.cost_per_extra_km) || 0,
        Number(t.cost_per_extra_hour) || 0,
        Number(t.cancellation_fee) || 0,
      ]);
    }
  }

  const now = new Date();
  const stamp = now.toLocaleDateString('pt-BR');
  const fileStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return exportFormattedExcel({
    title: 'RELATÓRIO DE CUSTOS DE FORNECEDORES',
    subtitle: `Gerado em ${stamp} — ${rows.length} linha(s)`,
    headers: HEADERS,
    rows,
    currencyColumns: [6, 7, 8, 9],
    fileName: `custos-fornecedores-${fileStamp}.xlsx`,
    sheetName: 'Custos Fornecedores',
  });
}
