import React from 'react';
import { MapPin } from 'lucide-react';
import {
  COVERAGE_UFS_BY_REGION,
  setCoverageCity,
  setCoverageCost,
  toggleCoverageUf,
  type ProviderOperatingCoverageRow,
} from '../lib/providerOperatingCoverage';

interface ProviderOperatingCoverageEditorProps {
  hqUf: string;
  hqCity: string;
  value: ProviderOperatingCoverageRow[];
  onChange: (next: ProviderOperatingCoverageRow[]) => void;
}

const ProviderOperatingCoverageEditor: React.FC<ProviderOperatingCoverageEditorProps> = ({
  hqUf,
  hqCity,
  value,
  onChange,
}) => {
  const hq = (hqUf || '').toUpperCase().trim();
  const selected = new Map(value.map((row) => [row.uf, row]));

  return (
    <div className="pt-6 border-t border-gray-100 space-y-4" data-testid="provider-operating-coverage">
      <div className="flex items-center gap-2">
        <MapPin className="text-red-600" size={18} />
        <div>
          <h3 className="font-black text-xs uppercase text-gray-700 tracking-widest">Estados de atuação e filiais</h3>
          <p className="text-[10px] text-gray-400 font-medium normal-case mt-0.5">
            Marque os estados em que o fornecedor trabalha. Ao lado de cada filial (e da sede), informe o valor da ativação 100 km.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {COVERAGE_UFS_BY_REGION.map(({ region, ufs }) => (
          <div key={region}>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">{region}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ufs.map((item) => {
                const row = selected.get(item.uf);
                const checked = Boolean(row) || item.uf === hq;
                const isHq = item.uf === hq;
                const cost = row?.cost100km && row.cost100km > 0 ? String(row.cost100km) : '';
                const city = isHq ? hqCity : (row?.city || '');
                return (
                  <label
                    key={item.uf}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${checked ? 'border-red-200 bg-red-50/40' : 'border-gray-200 bg-white'}`}
                    data-testid={`coverage-uf-${item.uf}`}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      checked={checked}
                      disabled={isHq}
                      onChange={(e) => onChange(toggleCoverageUf(value, item.uf, e.target.checked, hq, hqCity))}
                      aria-label={`Atua em ${item.uf}`}
                    />
                    <span className="w-8 shrink-0 text-xs font-black text-gray-800">{item.uf}</span>
                    <span className="min-w-0 flex-1 text-[11px] font-medium text-gray-600 truncate">
                      {item.name}
                      {isHq ? ' · Sede' : checked ? ' · Filial' : ''}
                    </span>
                    {checked && (
                      <>
                        {!isHq && (
                          <input
                            type="text"
                            className="w-24 shrink-0 px-2 py-1 bg-white border border-gray-300 rounded text-[11px] uppercase font-medium outline-none focus:border-red-500"
                            placeholder="Cidade"
                            value={city}
                            onChange={(e) => onChange(setCoverageCity(value, item.uf, e.target.value))}
                            aria-label={`Cidade da filial ${item.uf}`}
                          />
                        )}
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-24 shrink-0 px-2 py-1 bg-white border border-gray-300 rounded text-[11px] font-bold outline-none focus:border-red-500"
                          placeholder="R$ 100 km"
                          value={cost}
                          onChange={(e) => {
                            const base = value.some((itemRow) => itemRow.uf === item.uf)
                              ? value
                              : toggleCoverageUf(value, item.uf, true, hq, hqCity);
                            onChange(setCoverageCost(base, item.uf, parseFloat(e.target.value)));
                          }}
                          aria-label={`Valor 100 km ${item.uf}`}
                          data-testid={`coverage-cost-${item.uf}`}
                        />
                      </>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProviderOperatingCoverageEditor;
