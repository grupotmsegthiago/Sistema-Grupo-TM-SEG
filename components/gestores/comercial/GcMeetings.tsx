import React, { useEffect, useState } from 'react';
import { Mic, Plus, Sparkles } from 'lucide-react';
import GcPageHeader from './shared/GcPageHeader';
import { getGcUser } from '../../../lib/gestores/comercial/access';
import { supabase } from '../../../lib/supabase';
import { logGcAudit } from '../../../lib/gestores/comercial/audit';
import { summarizeMeetingWithAi } from '../../../lib/gestores/comercial/insights';
import type { GcMeeting } from '../../../lib/gestores/comercial/types';

const GcMeetings: React.FC = () => {
  const user = getGcUser();
  const [items, setItems] = useState<GcMeeting[]>([]);
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from('gc_meetings')
      .select('*')
      .is('deleted_at', null)
      .order('meeting_at', { ascending: false })
      .limit(100);
    if (!error) setItems((data || []) as GcMeeting[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg('');
    if (!title.trim() || !notes.trim()) {
      setMsg('Título e notas são obrigatórios.');
      setBusy(false);
      return;
    }
    const ai = await summarizeMeetingWithAi(notes);
    const payload = {
      title: title.trim(),
      client_name: clientName.trim() || null,
      meeting_at: new Date().toISOString(),
      notes_text: notes,
      ai_summary: ai.summary,
      ai_decisions: ai.decisions,
      ai_tasks: ai.tasks,
      negotiation_score: ai.score,
      created_by: user.name || null,
    };
    const { data, error } = await supabase.from('gc_meetings').insert([payload]).select('id').single();
    if (error) {
      setMsg(error.message.includes('does not exist')
        ? 'Execute a migration do Gestor Comercial no Supabase.'
        : error.message);
      setBusy(false);
      return;
    }
    await logGcAudit({ entity: 'gc_meetings', entityId: data.id, actionType: 'CREATE', newValue: payload });

    // Gera follow-ups automáticos a partir das tarefas da IA
    for (const task of ai.tasks.slice(0, 5)) {
      await supabase.from('gc_agenda_items').insert([{
        title: task,
        client_name: clientName.trim() || null,
        responsible_name: user.name || null,
        item_type: 'retorno',
        due_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        priority: 'media',
        status: 'pendente',
        created_by: user.name || null,
        notes: `Gerado da reunião ${title.trim()}`,
      }]);
    }

    setTitle('');
    setClientName('');
    setNotes('');
    setMsg('Reunião salva, resumida pela IA e follow-ups criados na agenda.');
    await load();
    setBusy(false);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <GcPageHeader
        title="Registro de Reuniões"
        subtitle="Texto, resumo IA, decisões, tarefas e follow-up automático no CRM"
        icon={Mic}
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 mb-6">
        <input className="w-full border rounded-xl px-3 py-2" placeholder="Título da reunião" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="w-full border rounded-xl px-3 py-2" placeholder="Cliente" value={clientName} onChange={(e) => setClientName(e.target.value)} />
        <textarea
          className="w-full border rounded-xl px-3 py-2 min-h-[140px]"
          placeholder="Notas / ata / transcrição…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-amber-300 font-bold text-sm disabled:opacity-60"
        >
          {busy ? <Sparkles size={16} /> : <Plus size={16} />}
          {busy ? 'Processando IA…' : 'Salvar e analisar com IA'}
        </button>
        {msg && <p className="text-sm text-slate-600">{msg}</p>}
      </div>

      <div className="space-y-3">
        {items.map((m) => (
          <article key={m.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900">{m.title}</h3>
                <p className="text-xs text-slate-500">{m.client_name || '—'} · {new Date(m.meeting_at).toLocaleString('pt-BR')}</p>
              </div>
              <span className="text-xs font-black text-amber-700">Score {m.negotiation_score ?? '—'}</span>
            </div>
            {m.ai_summary && <p className="text-sm text-slate-700 mt-2">{m.ai_summary}</p>}
            {!!m.ai_decisions?.length && (
              <div className="mt-2">
                <p className="text-[10px] font-bold uppercase text-slate-400">Decisões</p>
                <ul className="text-xs text-slate-700 list-disc ml-4">
                  {m.ai_decisions.map((d) => <li key={d}>{d}</li>)}
                </ul>
              </div>
            )}
            {!!m.ai_tasks?.length && (
              <div className="mt-2">
                <p className="text-[10px] font-bold uppercase text-slate-400">Tarefas</p>
                <ul className="text-xs text-slate-700 list-disc ml-4">
                  {m.ai_tasks.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
};

export default GcMeetings;
