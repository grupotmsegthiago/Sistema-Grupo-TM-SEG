import React, { useMemo, useState } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import GcPageHeader from './shared/GcPageHeader';
import { useGcData } from '../../../lib/gestores/comercial/useGcData';
import { getGcUser } from '../../../lib/gestores/comercial/access';
import { supabase } from '../../../lib/supabase';
import { logGcAudit } from '../../../lib/gestores/comercial/audit';

const GcAgenda: React.FC = () => {
  const { agenda, refresh, opportunities } = useGcData();
  const user = getGcUser();
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState('media');
  const [itemType, setItemType] = useState('contato');
  const [msg, setMsg] = useState('');

  const grouped = useMemo(() => {
    const now = Date.now();
    const overdue = agenda.filter((a) => a.status !== 'concluido' && a.status !== 'concluído' && new Date(a.due_at).getTime() < now);
    const upcoming = agenda.filter((a) => a.status !== 'concluido' && a.status !== 'concluído' && new Date(a.due_at).getTime() >= now);
    const done = agenda.filter((a) => a.status === 'concluido' || a.status === 'concluído');
    return { overdue, upcoming, done };
  }, [agenda]);

  const createItem = async () => {
    setMsg('');
    if (!title.trim() || !dueAt) {
      setMsg('Título e data/hora são obrigatórios.');
      return;
    }
    const payload = {
      title: title.trim(),
      client_name: clientName.trim() || null,
      responsible_name: user.name || null,
      item_type: itemType,
      due_at: new Date(dueAt).toISOString(),
      priority,
      status: 'pendente',
      created_by: user.name || null,
    };
    const { data, error } = await supabase.from('gc_agenda_items').insert([payload]).select('id').single();
    if (error) {
      setMsg(error.message.includes('does not exist')
        ? 'Execute a migration do Gestor Comercial no Supabase.'
        : error.message);
      return;
    }
    await logGcAudit({ entity: 'gc_agenda_items', entityId: data.id, actionType: 'CREATE', newValue: payload });
    setTitle('');
    setClientName('');
    setDueAt('');
    setMsg('Compromisso criado. Cobrança automática por e-mail/notificação via cron.');
    await refresh();
  };

  const markDone = async (id: string) => {
    await supabase.from('gc_agenda_items').update({
      status: 'concluido',
      updated_by: user.name || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    await logGcAudit({ entity: 'gc_agenda_items', entityId: id, actionType: 'UPDATE', newValue: { status: 'concluido' } });
    await refresh();
  };

  const Section = ({ title: t, items, tone }: { title: string; items: typeof agenda; tone: string }) => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <h2 className={`font-black text-xs uppercase mb-3 ${tone}`}>{t} ({items.length})</h2>
      <div className="space-y-2">
        {items.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-3 border border-slate-100 rounded-xl p-3">
            <div>
              <p className="font-bold text-sm">{a.title}</p>
              <p className="text-xs text-slate-500">{a.client_name || '—'} · {a.item_type} · {a.priority}</p>
              <p className="text-xs text-slate-700 mt-1">{new Date(a.due_at).toLocaleString('pt-BR')}</p>
            </div>
            {a.status !== 'concluido' && a.status !== 'concluído' && (
              <button type="button" onClick={() => void markDone(a.id)} className="text-xs font-bold text-emerald-700">
                Concluir
              </button>
            )}
          </div>
        ))}
        {!items.length && <p className="text-xs text-slate-400">Nenhum item</p>}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <GcPageHeader
        title="Agenda Inteligente"
        subtitle="Próximo contato, retorno e prioridade — cobrança automática ao vencer"
        icon={CalendarClock}
      />

      <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-6 grid grid-cols-1 md:grid-cols-6 gap-2">
        <input className="border rounded-xl px-3 py-2 text-sm md:col-span-2" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="border rounded-xl px-3 py-2 text-sm" placeholder="Cliente" value={clientName} onChange={(e) => setClientName(e.target.value)} />
        <input className="border rounded-xl px-3 py-2 text-sm" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        <select className="border rounded-xl px-3 py-2 text-sm" value={itemType} onChange={(e) => setItemType(e.target.value)}>
          <option value="contato">Contato</option>
          <option value="visita">Visita</option>
          <option value="proposta">Proposta</option>
          <option value="retorno">Retorno</option>
        </select>
        <button type="button" onClick={() => void createItem()} className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-900 text-amber-300 font-bold text-sm">
          <Plus size={16} /> Criar
        </button>
        <select className="border rounded-xl px-3 py-2 text-sm md:col-span-2" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="baixa">Prioridade baixa</option>
          <option value="media">Prioridade média</option>
          <option value="alta">Prioridade alta</option>
          <option value="critica">Prioridade crítica</option>
        </select>
        {opportunities[0] && (
          <p className="md:col-span-4 text-xs text-slate-500 self-center">
            Dica: vincule retornos às {opportunities.length} oportunidades do pipeline.
          </p>
        )}
        {msg && <p className="md:col-span-6 text-sm">{msg}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section title="Atrasados" items={grouped.overdue} tone="text-rose-700" />
        <Section title="Próximos" items={grouped.upcoming} tone="text-slate-800" />
        <Section title="Concluídos" items={grouped.done.slice(0, 20)} tone="text-emerald-700" />
      </div>
    </div>
  );
};

export default GcAgenda;
