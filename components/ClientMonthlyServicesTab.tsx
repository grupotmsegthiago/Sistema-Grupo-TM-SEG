import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Save } from 'lucide-react';
import { formatarDataIso, formatarMoeda, lerValorMonetario } from '../lib/billing/preFaturaMensal';
import {
  alternarServicoAtivo,
  listarServicosDoCliente,
  salvarServicoMensal,
  type ServicoMensalRow,
} from '../lib/billing/preFaturaStore';

const LABEL = 'text-[10px] font-black text-gray-500 uppercase mb-1 block tracking-wider';
const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none';

type FormState = {
  shortName: string;
  description: string;
  postCount: string;
  scheduleType: string;
  workHours: string;
  monthlyAmount: string;
  startDate: string;
  endDate: string;
  active: boolean;
};

const vazio = (): FormState => ({
  shortName: '',
  description: '',
  postCount: '1',
  scheduleType: '',
  workHours: '',
  monthlyAmount: '',
  startDate: '',
  endDate: '',
  active: true,
});

function deLinha(row: ServicoMensalRow): FormState {
  return {
    shortName: row.short_name,
    description: row.description,
    postCount: String(row.post_count),
    scheduleType: row.schedule_type || '',
    workHours: row.work_hours || '',
    monthlyAmount: String(row.monthly_amount),
    startDate: String(row.start_date).slice(0, 10),
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : '',
    active: row.active !== false,
  };
}

const ClientMonthlyServicesTab: React.FC<{ clientId: string; clientName: string }> = ({ clientId, clientName }) => {
  const [linhas, setLinhas] = useState<ServicoMensalRow[]>([]);
  const [form, setForm] = useState<FormState>(vazio);
  const [editId, setEditId] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');

  const recarregar = async () => {
    setCarregando(true);
    setAviso('');
    try {
      setLinhas(await listarServicosDoCliente(clientId));
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível carregar os serviços.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void recarregar();
  }, [clientId]);

  const salvar = async () => {
    setSalvando(true);
    setAviso('');
    try {
      const valor = lerValorMonetario(form.monthlyAmount);
      await salvarServicoMensal(clientId, {
        shortName: form.shortName,
        description: form.description,
        postCount: Number(form.postCount),
        scheduleType: form.scheduleType,
        workHours: form.workHours,
        monthlyAmount: Number.isFinite(valor) ? valor : Number.NaN,
        startDate: form.startDate,
        endDate: form.endDate || null,
        active: form.active,
      }, editId || undefined);
      setForm(vazio());
      setEditId(null);
      setAberto(false);
      await recarregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const situacao = async (row: ServicoMensalRow) => {
    setAviso('');
    try {
      await alternarServicoAtivo(row.id, clientId, !row.active);
      await recarregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível atualizar a situação.');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4" data-testid="aba-servicos-mensais">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-xs uppercase text-gray-700 tracking-widest">Serviços mensais</h3>
          <p className="text-xs text-gray-500 mt-1">
            {clientName}. O valor daqui é o contratual. A pré-fatura de um mês já montado não muda quando este cadastro é editado.
          </p>
        </div>
        <button
          type="button"
          data-testid="button-novo-servico-mensal"
          onClick={() => { setAberto(true); setEditId(null); setForm(vazio()); }}
          className="px-3 py-2 bg-black text-white rounded-lg text-xs font-bold uppercase inline-flex items-center gap-2"
        >
          <Plus size={14} /> Novo serviço
        </button>
      </div>

      {aviso && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-testid="aviso-servico-mensal">{aviso}</p>}

      {aberto && (
        <div className="border border-gray-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block"><span className={LABEL}>Nome curto</span><input className={INPUT} data-testid="input-nome-curto" value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Quantidade de postos</span><input className={INPUT} inputMode="numeric" data-testid="input-postos" value={form.postCount} onChange={(e) => setForm({ ...form, postCount: e.target.value })} /></label>
          <label className="block md:col-span-2"><span className={LABEL}>Descrição da cobrança</span><textarea className={INPUT} rows={3} data-testid="input-descricao-cobranca" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Escala</span><input className={INPUT} value={form.scheduleType} onChange={(e) => setForm({ ...form, scheduleType: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Horário</span><input className={INPUT} placeholder="08:00 às 17:48" value={form.workHours} onChange={(e) => setForm({ ...form, workHours: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Valor mensal</span><input className={INPUT} data-testid="input-valor-mensal" value={form.monthlyAmount} onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Início da vigência</span><input type="date" className={INPUT} data-testid="input-inicio-vigencia" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Fim da vigência</span><input type="date" className={INPUT} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo</label>
          <div className="md:col-span-2 flex gap-2">
            <button type="button" data-testid="button-salvar-servico-mensal" disabled={salvando} onClick={() => void salvar()} className="px-3 py-2 bg-red-700 text-white rounded-lg text-xs font-bold uppercase inline-flex items-center gap-2">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
            </button>
            <button type="button" onClick={() => { setAberto(false); setEditId(null); }} className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold uppercase">Fechar</button>
          </div>
        </div>
      )}

      {carregando ? <p className="text-sm text-gray-500">Carregando serviços…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b">
                <th className="py-2 pr-2">Serviço</th>
                <th className="py-2 pr-2">Postos</th>
                <th className="py-2 pr-2">Vigência</th>
                <th className="py-2 pr-2 text-right">Valor mensal</th>
                <th className="py-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((row) => (
                <tr key={row.id} className="border-b border-gray-100" data-testid={`linha-servico-${row.id}`}>
                  <td className="py-2 pr-2">
                    <div className="font-bold text-gray-800">{row.short_name}</div>
                    <div className="text-xs text-gray-500">{row.description}</div>
                  </td>
                  <td className="py-2 pr-2">{row.post_count}</td>
                  <td className="py-2 pr-2">{formatarDataIso(row.start_date)}{row.end_date ? ` a ${formatarDataIso(row.end_date)}` : ''}</td>
                  <td className="py-2 pr-2 text-right font-mono">R$ {formatarMoeda(Number(row.monthly_amount))}</td>
                  <td className="py-2">
                    <button type="button" className="text-xs font-bold uppercase text-blue-700 mr-3" onClick={() => { setEditId(row.id); setForm(deLinha(row)); setAberto(true); }}>Editar</button>
                    <button type="button" className="text-xs font-bold uppercase text-gray-600" onClick={() => void situacao(row)}>{row.active ? 'Inativar' : 'Ativar'}</button>
                  </td>
                </tr>
              ))}
              {linhas.length === 0 && !aviso && (
                <tr><td colSpan={5} className="py-6 text-center text-xs uppercase text-gray-400">Nenhum serviço mensal neste cliente.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ClientMonthlyServicesTab;
