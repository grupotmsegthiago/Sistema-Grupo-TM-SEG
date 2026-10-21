import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Check, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isPerfilDiretoria } from '../lib/diretoriaAccess';
import { formatDateTimeBR } from '../lib/dateUtils';
import {
  ACAO_AVISO_EDICAO,
  ENTIDADE_AVISO_EDICAO,
  avisoContinuaPendente,
  detalhesMarcadosComoLidos,
  lerAvisoEdicao,
  type AvisoEdicaoDiretoria,
} from '../lib/edicaoFinanceiraDiretoria';

function usuarioAtual(): { name?: string; role?: string } {
  try {
    return JSON.parse(localStorage.getItem('userData') || '{}');
  } catch {
    return {};
  }
}

const AvisoEdicaoFinanceiraDiretoria: React.FC = () => {
  const [avisos, setAvisos] = useState<AvisoEdicaoDiretoria[]>([]);
  const [painelAberto, setPainelAberto] = useState(true);
  const [adiados, setAdiados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const usuario = usuarioAtual();
    if (!isPerfilDiretoria(usuario)) {
      setAvisos([]);
      return;
    }
    const { data, error } = await supabase
      .from('system_logs')
      .select('id, details, created_at')
      .eq('entity', ENTIDADE_AVISO_EDICAO)
      .eq('action_type', ACAO_AVISO_EDICAO)
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) {
      setErro('Não foi possível carregar os avisos de edição.');
      return;
    }
    const pendentes = (data || [])
      .map((linha) => lerAvisoEdicao(String(linha.id), linha.details))
      .filter((aviso): aviso is AvisoEdicaoDiretoria => avisoContinuaPendente(aviso));
    setAvisos(pendentes);
    setErro('');
  }, []);

  useEffect(() => {
    void carregar();
    const atualizar = () => { void carregar(); };
    window.addEventListener('tmseg:aviso-edicao-financeira', atualizar);
    return () => window.removeEventListener('tmseg:aviso-edicao-financeira', atualizar);
  }, [carregar]);

  const marcarLida = async (aviso: AvisoEdicaoDiretoria) => {
    const usuario = usuarioAtual();
    const { error } = await supabase
      .from('system_logs')
      .update({ details: detalhesMarcadosComoLidos(aviso, usuario.name || 'Diretoria', new Date().toISOString()) })
      .eq('id', aviso.id);
    if (error) {
      setErro('Não foi possível marcar como lida.');
      return;
    }
    setAvisos((atual) => atual.filter((item) => item.id !== aviso.id));
  };

  const deixarPendente = (id: string) => {
    setAdiados((atual) => {
      const proximo = new Set(atual);
      proximo.add(id);
      return proximo;
    });
  };

  if (!isPerfilDiretoria(usuarioAtual()) || avisos.length === 0) return null;

  const visiveis = avisos.filter((aviso) => !adiados.has(aviso.id));
  if (!painelAberto || visiveis.length === 0) {
    return (
      <button
        type="button"
        onClick={() => { setPainelAberto(true); setAdiados(new Set()); }}
        className="fixed bottom-4 right-4 z-[80] flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white shadow-xl"
        data-testid="button-reabrir-avisos-edicao"
      >
        <Bell size={14} />
        {avisos.length} edição{avisos.length === 1 ? '' : 'ões'} pendente{avisos.length === 1 ? '' : 's'}
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-4 right-4 z-[80] w-[min(100vw-2rem,26rem)] max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
      data-testid="painel-avisos-edicao-financeira"
    >
      <header className="sticky top-0 flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-3">
        <p className="text-xs font-black uppercase text-slate-900">Edições do Financeiro</p>
        <button
          type="button"
          onClick={() => setPainelAberto(false)}
          className="text-[10px] font-black uppercase text-slate-500"
        >
          Deixar pendente
        </button>
      </header>
      {erro && <p className="px-4 pt-3 text-[11px] font-bold text-red-600">{erro}</p>}
      <ul className="space-y-3 p-4">
        {visiveis.map((aviso) => (
          <li key={aviso.id} className="rounded-xl border border-slate-200 p-3" data-testid={`aviso-edicao-${aviso.os}`}>
            <p className="text-sm font-black text-slate-900">OS {aviso.os}</p>
            {aviso.cliente && <p className="text-[11px] text-slate-500">{aviso.cliente}</p>}
            <p className="mt-2 text-[11px] leading-relaxed text-slate-700">
              Editada por <strong>{aviso.quem}</strong>
              {aviso.perfil ? ` (${aviso.perfil})` : ''} em {formatDateTimeBR(aviso.quando)}.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-800">{aviso.texto}</p>
            {aviso.alteracoes.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-slate-600">
                {aviso.alteracoes.map((linha) => <li key={linha}>{linha}</li>)}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void marcarLida(aviso)}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-black uppercase text-white"
                data-testid={`button-lida-${aviso.os}`}
              >
                <Check size={12} /> Marcar como lida
              </button>
              <button
                type="button"
                onClick={() => deixarPendente(aviso.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase text-slate-600"
                data-testid={`button-pendente-${aviso.os}`}
              >
                <Clock size={12} /> Deixar pendente
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default AvisoEdicaoFinanceiraDiretoria;
