import React, { useEffect, useState } from 'react';
import { cabecalhosCeva, sairDoPortalCeva } from '../../lib/cevaPortal/sessaoCliente';
import { classeStatusSistema } from '../../lib/cevaPortal/status';
import type { MissaoAoVivo } from '../../lib/cevaPortal/aoVivo';

function hora(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Conferencia() {
  return <span className="inline-flex rounded-md bg-yellow-300 px-1.5 py-0.5 text-[10px] font-black text-red-700">Aguardando Conferência</span>;
}

function Valor({ texto }: { texto: string }) {
  if (!texto) return <Conferencia />;
  return <span className="font-semibold text-slate-800">{texto}</span>;
}

function Campo({ rotulo, texto }: { rotulo: string; texto: string }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <div className="mt-0.5 truncate text-sm"><Valor texto={texto} /></div>
    </div>
  );
}

function Linha({ ordem, missao }: { ordem: number; missao: MissaoAoVivo }) {
  return (
    <li className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
      <div className="grid grid-cols-[52px_1fr]">
        <div className="flex items-center justify-center bg-[#152c54] text-lg font-black text-white">{ordem}</div>
        <div>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
            <p className="text-base font-black text-[#152c54]">OS {missao.os}</p>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${classeStatusSistema(missao.status)}`}>
              {missao.status}
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Campo rotulo="Serviço" texto={missao.servico || ''} />
            <Campo rotulo="Placa" texto={missao.placa || ''} />
            <Campo rotulo="Motorista" texto={missao.motorista || ''} />
            <Campo rotulo="Início" texto={hora(missao.dataInicio)} />
            <Campo rotulo="Fim" texto={hora(missao.dataFim)} />
            <Campo rotulo="Origem" texto={missao.origem || ''} />
            <Campo rotulo="Destino" texto={missao.destino || ''} />
            <Campo rotulo="Local" texto={missao.local || ''} />
            <Campo rotulo="Km início" texto={missao.kmInicio == null ? '' : missao.kmInicio.toLocaleString('pt-BR')} />
            <Campo rotulo="Km fim" texto={missao.kmFim == null ? '' : missao.kmFim.toLocaleString('pt-BR')} />
            <Campo rotulo="Solicitante" texto={missao.solicitante || ''} />
            <Campo rotulo="Quem autorizou" texto={missao.quemAutorizou || ''} />
            <Campo rotulo="Operação" texto={missao.operacao || ''} />
            <Campo rotulo="TSP" texto={missao.tsp || ''} />
            <Campo rotulo="Atendimento PGR" texto={missao.atendimentoPgr || ''} />
          </div>
          <p className="border-t border-slate-100 px-3 py-2 text-[11px] font-bold text-amber-800">Valores: aguardando validação até a OS ser aprovada no sistema.</p>
        </div>
      </div>
    </li>
  );
}

export const PainelAoVivo: React.FC = () => {
  const [missoes, setMissoes] = useState<MissaoAoVivo[]>([]);
  const [erro, setErro] = useState('');
  const [quando, setQuando] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const response = await fetch('/api/ceva-portal/ao-vivo', { headers: cabecalhosCeva() });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
          sairDoPortalCeva();
          return;
        }
        if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar as missões.');
        if (!ativo) return;
        setMissoes(Array.isArray(data.missoes) ? data.missoes : []);
        setQuando(typeof data.atualizadoEm === 'string' ? data.atualizadoEm : new Date().toISOString());
        setErro('');
      } catch (err) {
        if (ativo) setErro(err instanceof Error ? err.message : 'Falha de comunicação.');
      }
    }
    void carregar();
    const relogio = window.setInterval(() => void carregar(), 15000);
    return () => {
      ativo = false;
      window.clearInterval(relogio);
    };
  }, []);

  const viagem = missoes.filter((missao) => missao.status === 'Em Viagem').length;
  const atualizado = quando ? hora(quando) : '';

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#c45b5b]">Ao vivo</p>
          <h2 className="text-2xl font-black text-[#152c54]">Missões em andamento</h2>
        </div>
        <p className="text-xs font-semibold text-slate-500">{missoes.length.toLocaleString('pt-BR')} no ar · {viagem.toLocaleString('pt-BR')} em viagem · atualizado {atualizado || 'agora'}</p>
      </div>
      {erro && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</p>}
      {!erro && missoes.length === 0 && quando && <p className="rounded-3xl bg-white px-4 py-8 text-center text-sm text-slate-500">Nenhuma missão em andamento neste momento.</p>}
      <ol className="grid gap-3">
        {missoes.map((missao, index) => <Linha key={missao.os} ordem={index + 1} missao={missao} />)}
      </ol>
    </div>
  );
};
