import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { montarCartaErroPedagio } from '../lib/cartaTabelaErrada';
import { useNotification } from '../lib/NotificationContext';
import { supabase } from '../lib/supabase';

export function ReportarErroPedagio({
  missionId,
  lado,
  destinatario,
  autor,
}: {
  missionId: string;
  lado: 'cliente' | 'fornecedor';
  destinatario: string;
  autor: string;
}) {
  const { showNotification } = useNotification();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const ladoNome = lado === 'fornecedor' ? 'do fornecedor' : 'do cliente';

  const enviar = async () => {
    const carta = montarCartaErroPedagio({
      os: missionId,
      lado,
      destinatario,
      autor,
      texto,
    });
    if (!carta) {
      showNotification('Escreva o erro', 'Informe o erro do pedágio para a pessoa corrigir.', 'warning');
      return;
    }
    setEnviando(true);
    const insert = await supabase.from('system_logs').insert([{
      user_name: autor,
      action_type: 'TOLL_ERROR_REPORT',
      entity: 'Mission',
      entity_id: missionId,
      details: JSON.stringify({
        os: missionId,
        lado,
        destinatario,
        autor,
        texto: texto.replace(/\s+/g, ' ').trim(),
      }),
    }]);
    setEnviando(false);
    if (insert.error) {
      showNotification('Carta não enviada', insert.error.message, 'error');
      return;
    }
    setTexto('');
    setAberto(false);
    showNotification('Carta enviada', `${destinatario} recebe o erro e altera o pedágio ${ladoNome}.`, 'success');
  };

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-1 text-[10px] font-black uppercase text-red-800 underline"
        data-testid={`button-report-toll-${lado}`}
      >
        Reportar erro para {destinatario}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2" data-testid={`report-toll-${lado}`}>
      <label className="block text-[10px] font-black uppercase text-red-900">
        Erro no pedágio {ladoNome} para {destinatario}
        <textarea
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          rows={2}
          placeholder="Escreva o erro. Essa pessoa altera o pedágio."
          className="mt-1 w-full rounded-lg border border-red-200 px-2 py-1 text-xs font-medium normal-case text-zinc-900"
          data-testid={`input-report-toll-${lado}`}
        />
      </label>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={() => { void enviar(); }}
          disabled={enviando}
          className="rounded-lg bg-red-700 px-2 py-1 text-[10px] font-black uppercase text-white disabled:opacity-60"
          data-testid={`button-send-report-toll-${lado}`}
        >
          {enviando ? <Loader2 size={11} className="inline animate-spin" /> : null} Enviar carta
        </button>
        <button
          type="button"
          onClick={() => { setAberto(false); setTexto(''); }}
          className="rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-black uppercase text-zinc-600"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
