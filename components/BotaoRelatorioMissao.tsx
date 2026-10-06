import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { formatDateBR } from '../lib/dateUtils';
import { lerCapaRelatorio } from '../lib/osActionPlan/salvarPlanoAcao';

interface BotaoRelatorioMissaoProps {
  missionId: string;
  onClick: () => void;
  className: string;
  testId: string;
}

const BotaoRelatorioMissao: React.FC<BotaoRelatorioMissaoProps> = ({ missionId, onClick, className, testId }) => {
  const [texto, setTexto] = useState('Relatório ainda não gerado → Gerar');

  useEffect(() => {
    let ativo = true;
    void lerCapaRelatorio(missionId).then((capa) => {
      if (!ativo) return;
      if (!capa.existe) {
        setTexto('Relatório ainda não gerado → Gerar');
        return;
      }
      const data = capa.quando ? formatDateBR(capa.quando) : '';
      setTexto(`Relatório v${capa.versao}${data ? ` — ${data}` : ''} → Visualizar PDF | Gerar nova versão`);
    });
    return () => { ativo = false; };
  }, [missionId]);

  return (
    <button type="button" onClick={onClick} className={className} data-testid={testId}>
      <FileText size={16} className="shrink-0" />
      <span>{texto}</span>
    </button>
  );
};

export default BotaoRelatorioMissao;
