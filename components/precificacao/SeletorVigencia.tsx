import React from 'react';
import type { VersaoTabelaRegional } from '../../lib/precificacao/tabela2027';

const ANOS: VersaoTabelaRegional[] = ['2026', '2027'];

export function SeletorVigencia(props: {
  versao: VersaoTabelaRegional;
  onChange: (versao: VersaoTabelaRegional) => void;
  testId?: string;
}) {
  return (
    <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1" role="group" aria-label="Vigência da tabela" data-testid={props.testId || 'seletor-vigencia'}>
      {ANOS.map((ano) => {
        const ativo = props.versao === ano;
        return (
          <button
            key={ano}
            type="button"
            aria-pressed={ativo}
            onClick={() => props.onChange(ano)}
            data-testid={`vigencia-${ano}`}
            className={`h-8 rounded-lg px-3 text-[11px] font-black uppercase ${ativo ? 'bg-[#10284f] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Tabela {ano}
          </button>
        );
      })}
    </div>
  );
}
