import React, { useEffect, useState } from 'react';
import { authFetch } from '../lib/authFetch';
import type { NotificacaoDiretoria } from '../lib/reaprovacaoFinanceira/tipos';

function quando(iso: string | null | undefined): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function dinheiro(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ReaprovacaoDiretoriaLista() {
  const [itens, setItens] = useState<NotificacaoDiretoria[]>([]);
  const [erro, setErro] = useState('');
  const [nota, setNota] = useState<Record<string, string>>({});

  const carregar = async () => {
    const res = await authFetch('/api/reaprovacao-financeira?op=lista');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      setErro(data.erro || 'Não foi possível carregar as reaprovações.');
      return;
    }
    setErro('');
    setItens(Array.isArray(data.itens) ? data.itens : []);
  };

  useEffect(() => {
    void carregar().catch(() => setErro('Não foi possível carregar as reaprovações.'));
  }, []);

  const agir = async (id: string, acao: 'LIDO' | 'QUESTIONAR' | 'ENCERRAR') => {
    const observacao = nota[id] || '';
    const res = await authFetch('/api/reaprovacao-financeira?op=acao', {
      method: 'POST',
      body: JSON.stringify({ op: 'acao', id, acao, observacao }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      setErro(data.erro || 'A ação não foi registrada.');
      return;
    }
    setErro('');
    await carregar();
  };

  const abrir = async (reaprovacaoId: string, lado: 'antes' | 'depois') => {
    const res = await authFetch(`/api/reaprovacao-financeira?op=captura&id=${encodeURIComponent(reaprovacaoId)}&lado=${lado}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      setErro(data.erro || 'A evidência não abriu.');
      return;
    }
    window.open(data.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm" data-testid="lista-reaprovacao-diretoria">
      <h2 className="text-sm font-black text-gray-900">Reaprovações para a Diretoria</h2>
      <p className="text-[11px] text-gray-500 mt-1">Lido, questionar e encerrar ficam no histórico. Nenhuma dessas ações aprova a OS.</p>
      {erro && <p className="mt-2 text-[11px] font-bold text-red-700">{erro}</p>}
      <div className="mt-3 space-y-3">
        {itens.length === 0 && !erro && <p className="text-[11px] text-gray-500">Nenhuma reaprovação pendente de leitura.</p>}
        {itens.map((item) => (
          <article key={item.id} className="border border-gray-100 rounded-xl p-3" data-testid={`reaprovacao-diretoria-${item.id}`}>
            <p className="text-xs font-black text-gray-900">OS {item.resumo.osNumero} · {item.situacao}</p>
            <p className="text-[11px] text-gray-700 mt-1">Incluiu: {item.resumo.incluidoPor || '—'}</p>
            <p className="text-[11px] text-gray-700">Aprovou originalmente: {item.resumo.aprovadoOriginalmentePor || '—'} em {quando(item.resumo.aprovadoOriginalmenteEm)}</p>
            <p className="text-[11px] text-gray-700">Alterou e reaprovou: {item.resumo.alteradoPor} / {item.resumo.reaprovadoPor} em {quando(item.resumo.reaprovadoEm)}</p>
            <p className="text-[11px] text-gray-700">Justificativa: {item.resumo.justificativa}</p>
            <ul className="mt-1">
              {item.resumo.campos.map((campo) => (
                <li key={campo.campo} className="text-[11px] text-gray-800">
                  {campo.campo === 'revenue_value' ? 'Receita' : 'Custo'}: {dinheiro(campo.antes)} → {dinheiro(campo.depois)}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-gray-500 mt-1">Preservados: {item.resumo.preservados.join(', ')}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button type="button" className="text-[10px] font-black uppercase text-blue-800" onClick={() => { void abrir(item.reaprovacaoId, 'antes'); }}>Captura antes</button>
              <button type="button" className="text-[10px] font-black uppercase text-blue-800" onClick={() => { void abrir(item.reaprovacaoId, 'depois'); }}>Captura depois</button>
              <button type="button" className="text-[10px] font-black uppercase" data-testid={`reaprovacao-lido-${item.id}`} onClick={() => { void agir(item.id, 'LIDO'); }}>Lido</button>
              <button type="button" className="text-[10px] font-black uppercase" data-testid={`reaprovacao-questionar-${item.id}`} onClick={() => { void agir(item.id, 'QUESTIONAR'); }}>Questionar</button>
              <button type="button" className="text-[10px] font-black uppercase" data-testid={`reaprovacao-encerrar-${item.id}`} onClick={() => { void agir(item.id, 'ENCERRAR'); }}>Encerrar</button>
            </div>
            <textarea
              value={nota[item.id] || ''}
              onChange={(e) => setNota((atual) => ({ ...atual, [item.id]: e.target.value }))}
              placeholder="Pergunta, se for questionar"
              className="mt-2 w-full border border-gray-200 rounded-lg px-2 py-1 text-[11px]"
            />
            {item.historico.length > 0 && (
              <ul className="mt-2 space-y-1">
                {item.historico.map((linha, indice) => (
                  <li key={`${linha.em}-${indice}`} className="text-[10px] text-gray-600">
                    {linha.acao} · {linha.por} · {quando(linha.em)}{linha.observacao ? ` · ${linha.observacao}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
