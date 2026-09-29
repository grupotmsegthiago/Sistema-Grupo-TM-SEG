import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { authFetch } from '../lib/authFetch';
import { datetimeLocalToIsoBR, formatDateTimeBR, toDatetimeLocalValueBR } from '../lib/dateUtils';
import {
  getVeladaClosureMissing,
  isThiagoVeladaEscalationUser,
  isVeladaClosureOverdue,
  veladaClosureOperatorMatches,
  veladaFinalKmIsValid,
  type VeladaClosureMission,
} from '../lib/veladaClosureAlert';

type Row = VeladaClosureMission & {
  id: string;
  client?: string | null;
  origin?: string | null;
  destination?: string | null;
  start_km?: number | null;
};

type SessionUser = { name?: string; email?: string };

const POLL_MS = 30_000;

function readUser(): SessionUser | null {
  try {
    const raw = JSON.parse(localStorage.getItem('userData') || '{}');
    if (!raw?.name && !raw?.email) return null;
    return raw;
  } catch {
    return null;
  }
}

const VeladaClosureAlert: React.FC = () => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [tollLogged, setTollLogged] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [endKm, setEndKm] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [tollChoice, setTollChoice] = useState<'yes' | 'no' | ''>('');
  const [tollValue, setTollValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [thiagoMinimized, setThiagoMinimized] = useState(false);

  const load = useCallback(async () => {
    const current = readUser();
    setUser(current);
    if (!current) {
      setRows([]);
      return;
    }
    const { data, error: queryError } = await supabase
      .from('missions')
      .select('id, client, provider, origin, destination, status, mission_type, end_km, end_time, start_km, velada_toll_confirmed, velada_closure_operator, velada_closure_opened_at')
      .eq('status', 'Concluída')
      .not('velada_closure_operator', 'is', null)
      .order('velada_closure_opened_at', { ascending: true })
      .limit(80);
    if (queryError || !data) return;
    const list = data as Row[];
    const pendingToll = list.filter((row) => row.velada_toll_confirmed !== true).map((row) => row.id);
    let logged = new Set<string>();
    if (pendingToll.length > 0) {
      const { data: logs } = await supabase
        .from('system_logs')
        .select('entity_id')
        .eq('entity', 'MissionTollConfirmation')
        .in('entity_id', pendingToll);
      logged = new Set((logs || []).map((log: { entity_id?: string }) => String(log.entity_id || '')));
    }
    setTollLogged(logged);
    setRows(list);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const mine = useMemo(() => {
    if (!user?.name) return [];
    return rows.filter((row) => (
      veladaClosureOperatorMatches(row.velada_closure_operator, user.name)
      && getVeladaClosureMissing(row, tollLogged.has(row.id)).length > 0
    ));
  }, [rows, tollLogged, user?.name]);

  const overdueForThiago = useMemo(() => {
    if (!isThiagoVeladaEscalationUser(user)) return [];
    return rows.filter((row) => (
      isVeladaClosureOverdue(row.velada_closure_opened_at)
      && getVeladaClosureMissing(row, tollLogged.has(row.id)).length > 0
    ));
  }, [rows, tollLogged, user]);

  const active = mine.find((row) => row.id === activeId) || mine[0] || null;

  useEffect(() => {
    if (!active) return;
    setEndKm(active.end_km && Number(active.end_km) > 0 ? String(active.end_km) : '');
    setEndLocal(active.end_time ? toDatetimeLocalValueBR(active.end_time) : toDatetimeLocalValueBR(new Date()));
    setTollChoice(active.velada_toll_confirmed || tollLogged.has(active.id) ? 'no' : '');
    setTollValue('');
    setError('');
  }, [active?.id]);

  const submit = async () => {
    if (!active || !user?.name || saving) return;
    const km = Number(String(endKm).replace(',', '.'));
    if (!veladaFinalKmIsValid(km, active.start_km)) {
      setError(Number(active.start_km) > 0
        ? 'O KM final precisa ser maior que zero e não pode ser menor que o KM inicial.'
        : 'Informe o KM final.');
      return;
    }
    const endIso = datetimeLocalToIsoBR(endLocal);
    if (!endIso) {
      setError('Informe a hora final.');
      return;
    }
    const alreadyToll = active.velada_toll_confirmed === true || tollLogged.has(active.id);
    if (!alreadyToll && tollChoice !== 'yes' && tollChoice !== 'no') {
      setError('Confirme se houve pedágio.');
      return;
    }
    const tollAmount = tollChoice === 'yes'
      ? Number(String(tollValue).replace(/\./g, '').replace(',', '.'))
      : 0;
    if (!alreadyToll && tollChoice === 'yes' && !(tollAmount > 0)) {
      setError('Informe o valor do pedágio.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        end_km: km,
        end_time: endIso,
        last_update: new Date().toISOString(),
        updated_by: user.name,
      };
      if (!alreadyToll) {
        payload.toll_value = tollAmount;
        payload.velada_toll_confirmed = true;
      }
      const { error: updateError } = await supabase.from('missions').update(payload).eq('id', active.id);
      if (updateError) throw updateError;
      if (!alreadyToll) {
        const { error: logError } = await supabase.from('system_logs').insert([{
          user_name: user.name,
          action_type: 'TOLL_CONFIRMATION',
          entity: 'MissionTollConfirmation',
          entity_id: active.id,
          details: JSON.stringify({
            user: user.name,
            confirmed_at: new Date().toISOString(),
            has_toll: tollChoice === 'yes',
            value: tollAmount,
            source: 'velada_closure_alert',
          }),
        }]);
        if (logError) throw logError;
      }
      await authFetch(`/api/missions/${active.id}/velada-closure-notify`, { method: 'POST' });
      setActiveId(null);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o fechamento da velada.');
    } finally {
      setSaving(false);
    }
  };

  if (mine.length > 0 && dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className="fixed bottom-4 right-4 z-[230] bg-amber-500 text-amber-950 px-4 py-3 rounded-xl shadow-lg font-black text-xs uppercase flex items-center gap-2"
        data-testid="velada-closure-pending-pill"
      >
        <AlertTriangle size={16} />
        {mine.length} velada{mine.length === 1 ? '' : 's'} pendente{mine.length === 1 ? '' : 's'}
      </button>
    );
  }

  if (mine.length > 0 && active) {
    const missing = getVeladaClosureMissing(active, tollLogged.has(active.id));
    const tollDone = active.velada_toll_confirmed === true || tollLogged.has(active.id);
    return (
      <div className="fixed inset-0 z-[240] bg-black/70 flex items-center justify-center p-4" data-testid="velada-closure-alert">
        <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border-2 border-amber-500 overflow-hidden">
          <div className="bg-amber-500 text-amber-950 px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-black uppercase tracking-wide">Velada pendente</p>
              <p className="text-[11px] font-bold">Falta KM final, hora final e pedágio. Pode fechar agora: ao abrir o sistema o aviso volta até esses dados serem salvos.</p>
            </div>
            <button type="button" onClick={() => setDismissed(true)} className="rounded-lg p-1 hover:bg-amber-400" aria-label="Fechar alerta" data-testid="button-velada-closure-close">
              <X size={18} />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm font-black text-gray-900">{active.id} · {active.client || 'Cliente'}</p>
            <p className="text-xs text-gray-600">{active.provider} · {active.origin} → {active.destination}</p>
            <p className="text-[11px] font-bold text-amber-800 uppercase">Falta: {missing.join(' · ')}</p>
            {mine.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {mine.map((row) => (
                  <button key={row.id} type="button" onClick={() => setActiveId(row.id)} className={`px-2 py-1 rounded text-[10px] font-black uppercase ${row.id === active.id ? 'bg-amber-500 text-amber-950' : 'bg-gray-100 text-gray-600'}`}>
                    {row.id}
                  </button>
                ))}
              </div>
            )}
            <label className="block text-[10px] font-black uppercase text-gray-500">KM final
              <input value={endKm} onChange={(e) => setEndKm(e.target.value)} inputMode="decimal" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold" data-testid="input-velada-end-km" />
            </label>
            <label className="block text-[10px] font-black uppercase text-gray-500">Hora final
              <input type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold" data-testid="input-velada-end-time" />
            </label>
            <div className="text-[10px] font-black uppercase text-gray-500">Pedágio</div>
            {tollDone ? (
              <p className="text-xs font-bold text-emerald-700">Pedágio já confirmado.</p>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => setTollChoice('no')} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase border ${tollChoice === 'no' ? 'bg-slate-900 text-white' : 'bg-white'}`}>Sem pedágio</button>
                <button type="button" onClick={() => setTollChoice('yes')} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase border ${tollChoice === 'yes' ? 'bg-slate-900 text-white' : 'bg-white'}`}>Com pedágio</button>
              </div>
            )}
            {!tollDone && tollChoice === 'yes' && (
              <input value={tollValue} onChange={(e) => setTollValue(e.target.value)} placeholder="Valor do pedágio" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold" data-testid="input-velada-toll" />
            )}
            {error && <p className="text-xs font-bold text-red-600">{error}</p>}
            <button type="button" onClick={() => { void submit(); }} disabled={saving} className="w-full py-3 rounded-xl bg-amber-500 text-amber-950 text-xs font-black uppercase disabled:opacity-60" data-testid="button-velada-closure-save">
              {saving ? 'Salvando...' : 'Concluir dados da velada'}
            </button>
            <button type="button" onClick={() => setDismissed(true)} className="w-full py-2 rounded-xl border border-amber-300 text-amber-900 text-xs font-black uppercase" data-testid="button-velada-closure-dismiss">
              Fechar e deixar pendente
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (overdueForThiago.length === 0) return null;

  if (thiagoMinimized) {
    return (
      <button type="button" onClick={() => setThiagoMinimized(false)} className="fixed bottom-4 right-4 z-[230] bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg font-black text-xs uppercase flex items-center gap-2" data-testid="velada-closure-thiago-pill">
        <AlertTriangle size={16} /> {overdueForThiago.length} velada{overdueForThiago.length === 1 ? '' : 's'} sem fechamento +48h
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[230] bg-red-950/80 flex items-center justify-center p-4" data-testid="velada-closure-thiago-alert">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border-4 border-red-600 overflow-hidden">
        <div className="bg-red-600 text-white px-4 py-3">
          <p className="text-sm font-black uppercase flex items-center gap-2"><AlertTriangle size={18} /> Velada sem fechamento há mais de 48 horas</p>
          <p className="text-[11px] font-bold mt-1">O operador ainda não informou KM final, hora final e pedágio.</p>
        </div>
        <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {overdueForThiago.map((row) => (
            <div key={row.id} className="border border-red-200 bg-red-50 rounded-lg px-3 py-2">
              <p className="text-sm font-black text-red-800">{row.id} · {row.client}</p>
              <p className="text-[11px] text-red-700">{row.velada_closure_operator} · desde {formatDateTimeBR(row.velada_closure_opened_at)}</p>
              <p className="text-[10px] font-black uppercase text-red-600">{getVeladaClosureMissing(row, tollLogged.has(row.id)).join(' · ')}</p>
            </div>
          ))}
        </div>
        <div className="p-4 pt-0">
          <button type="button" onClick={() => setThiagoMinimized(true)} className="w-full py-2 rounded-xl border border-red-300 text-red-700 text-xs font-black uppercase">Minimizar alerta</button>
        </div>
      </div>
    </div>
  );
};

export default VeladaClosureAlert;
