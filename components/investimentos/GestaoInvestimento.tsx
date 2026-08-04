import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Briefcase, Loader2, Plus, RefreshCw, Shield, Trash2, TrendingUp, Wallet,
} from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import {
  PROFILE_INCOMPLETE_MESSAGE,
  TARGET_RETURN_DISCLAIMER,
  createDraftInvestorProfile,
  type InvestorProfile,
  type InvestmentPosition,
  type InvestmentWatchlistItem,
  type ProfileCompleteness,
  type Provision30dEstimate,
  type MonthlyTargetAnnualized,
} from '../../lib/investimentos';

type SummaryResponse = {
  ok: boolean;
  schemaReady?: boolean;
  error?: string;
  message?: string;
  profile: InvestorProfile | null;
  draftDefaults?: InvestorProfile;
  completeness: ProfileCompleteness;
  canRecommend: boolean;
  positions: InvestmentPosition[];
  watchlist: InvestmentWatchlistItem[];
  portfolioValue: number;
  capitalBase: number;
  targetBand: MonthlyTargetAnnualized;
  provision30d: Provision30dEstimate;
  recommendationsBlockedReason: string | null;
  automation: { canTrade: boolean; note: string };
};

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const INSTRUMENT_TYPES = [
  'tesouro', 'cdb', 'lci_lca', 'debenture', 'fundo_rf', 'fundo_mm', 'fundo_acoes',
  'fii', 'fiagro', 'etf', 'acao', 'bdr', 'internacional', 'ouro', 'cripto', 'outros',
];

const GestaoInvestimento: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [profileForm, setProfileForm] = useState<InvestorProfile>(() => createDraftInvestorProfile());
  const [tab, setTab] = useState<'resumo' | 'perfil' | 'carteira' | 'watchlist' | 'auditoria'>('resumo');
  const [posForm, setPosForm] = useState({
    instrument_name: '',
    instrument_code: '',
    instrument_type: 'cdb',
    quantity: '1',
    avg_price: '',
    current_value: '100000',
    entry_date: new Date().toISOString().slice(0, 10),
    broker: 'XP',
    taxation_notes: '',
  });
  const [watchForm, setWatchForm] = useState({
    instrument_name: '',
    instrument_code: '',
    instrument_type: 'tesouro',
    notes: '',
    status: 'observar' as const,
  });
  const [audit, setAudit] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/gestao-investimento/summary');
      const json = await res.json();
      if (res.status === 503 && (json.error === 'schema_missing' || json.message)) {
        setSchemaMissing(true);
        setSummary(null);
        setError(json.message || 'Migration ainda não aplicada no Supabase.');
        return;
      }
      if (!res.ok || !json.ok) {
        throw new Error(json.error || json.message || 'Falha ao carregar');
      }
      setSchemaMissing(false);
      setSummary(json);
      setProfileForm(createDraftInvestorProfile({ ...(json.draftDefaults || {}), ...(json.profile || {}) }));
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar Gestão Investimento');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const res = await authFetch('/api/gestao-investimento/audit?limit=40');
      const json = await res.json();
      if (json.ok) setAudit(json.items || []);
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === 'auditoria') void loadAudit();
  }, [tab, loadAudit]);

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/gestao-investimento/profile', {
        method: 'PUT',
        body: JSON.stringify(profileForm),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || json.message || 'Falha ao salvar perfil');
      await load();
      setTab('resumo');
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar perfil');
    } finally {
      setSaving(false);
    }
  };

  const addPosition = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/gestao-investimento/positions', {
        method: 'POST',
        body: JSON.stringify({
          ...posForm,
          quantity: Number(posForm.quantity || 0),
          avg_price: Number(posForm.avg_price || 0),
          current_value: Number(posForm.current_value || 0),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Falha ao incluir posição');
      setPosForm((p) => ({ ...p, instrument_name: '', instrument_code: '', avg_price: '', current_value: '' }));
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao incluir posição');
    } finally {
      setSaving(false);
    }
  };

  const removePosition = async (id: string) => {
    if (!confirm('Desativar esta posição?')) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/gestao-investimento/positions/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Falha');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao remover');
    } finally {
      setSaving(false);
    }
  };

  const addWatch = async () => {
    setSaving(true);
    try {
      const res = await authFetch('/api/gestao-investimento/watchlist', {
        method: 'POST',
        body: JSON.stringify(watchForm),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Falha');
      setWatchForm({ instrument_name: '', instrument_code: '', instrument_type: 'tesouro', notes: '', status: 'observar' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha na watchlist');
    } finally {
      setSaving(false);
    }
  };

  const removeWatch = async (id: string) => {
    setSaving(true);
    try {
      await authFetch(`/api/gestao-investimento/watchlist/${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof InvestorProfile>(key: K, value: InvestorProfile[K]) => {
    setProfileForm((p) => ({ ...p, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-8 text-gray-500" data-testid="gestao-investimento-loading">
        <Loader2 className="animate-spin text-red-700" /> Carregando Gestão Investimento…
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16 bg-gray-50/50 p-2 rounded-2xl animate-fade-in" data-testid="gestao-investimento">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <div className="p-2 bg-red-700 text-white rounded-xl shadow-lg shadow-red-200"><Briefcase size={18} /></div>
            Gestão Investimento
          </h1>
          <p className="text-sm text-gray-500 mt-1 ml-12">
            Gestor Financeiro Sênior · Fase 2 (fundação) · XP · sem execução automática
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 bg-red-700 hover:bg-red-800 text-white text-sm font-bold px-4 py-2 rounded-xl"
          data-testid="gestao-investimento-refresh"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[11px] text-amber-900 font-medium" data-testid="gestao-investimento-disclaimer">
        {TARGET_RETURN_DISCLAIMER}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800 text-sm" data-testid="gestao-investimento-error">
          {error}
          {schemaMissing && (
            <p className="mt-2 text-xs font-bold">
              Aplique a migration <code>migrations/2026_08_04_gestao_investimento_fundacao.sql</code> no Supabase (somente com sua autorização) e recarregue.
            </p>
          )}
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="gestao-investimento-kpis">
            <Kpi label="Patrimônio posições" value={fmtBRL(summary.portfolioValue)} icon={<Wallet size={14} />} />
            <Kpi label="Capital monitorado" value={fmtBRL(summary.capitalBase)} icon={<Shield size={14} />} />
            <Kpi
              label="Meta mensal (objetivo)"
              value={`${summary.targetBand.monthlyMinPct}% – ${summary.targetBand.monthlyMaxPct}%`}
              sub={`~${summary.targetBand.annualMinPct.toFixed(1)}%–${summary.targetBand.annualMaxPct.toFixed(1)}% a.a. compostos`}
              icon={<TrendingUp size={14} />}
            />
            <Kpi
              label="Provisão 30 dias (cenário base)"
              value={fmtBRL(summary.provision30d.baseBrl)}
              sub={`Pess. ${fmtBRL(summary.provision30d.pessimisticBrl)} · Otim. ${fmtBRL(summary.provision30d.optimisticBrl)}`}
              icon={<AlertTriangle size={14} />}
            />
          </div>
          <p className="text-[10px] text-gray-500 font-medium px-1">{summary.provision30d.disclaimer}</p>

          {!summary.canRecommend && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4" data-testid="gestao-investimento-perfil-bloqueio">
              <p className="text-sm font-black text-rose-800">{PROFILE_INCOMPLETE_MESSAGE}</p>
              <p className="text-xs text-rose-700 mt-1">
                Complete o perfil para liberar as cinco recomendações personalizadas (Fase 3).
              </p>
              {summary.completeness.missing.length > 0 && (
                <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1 text-[11px] text-rose-700 list-disc pl-5">
                  {summary.completeness.missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setTab('perfil')}
                className="mt-3 text-xs font-black text-white bg-rose-700 hover:bg-rose-800 px-3 py-2 rounded-lg"
              >
                Completar perfil
              </button>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-1 bg-white border border-gray-200 rounded-xl p-1" data-testid="gestao-investimento-tabs">
        {([
          ['resumo', 'Resumo'],
          ['perfil', 'Perfil'],
          ['carteira', 'Carteira XP'],
          ['watchlist', 'Watchlist'],
          ['auditoria', 'Auditoria'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-2 text-xs font-bold rounded-lg ${tab === id ? 'bg-red-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'resumo' && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Estado do módulo">
            <ul className="text-xs text-gray-700 space-y-2">
              <li><b>Recomendações:</b> {summary.canRecommend ? 'Perfil completo — motor (Fase 3) ainda não ativo' : 'Bloqueadas'}</li>
              <li><b>Corretora padrão:</b> {profileForm.broker_default || 'XP'}</li>
              <li><b>Posições ativas:</b> {summary.positions.length}</li>
              <li><b>Watchlist:</b> {summary.watchlist.length}</li>
              <li><b>Automação de ordens:</b> desligada</li>
            </ul>
            <p className="text-[10px] text-gray-500 mt-3">{summary.automation.note}</p>
          </Card>
          <Card title="Próximas fases">
            <ol className="text-xs text-gray-700 space-y-1 list-decimal pl-4">
              <li>Motor quantitativo e ranking das 5 oportunidades</li>
              <li>Monitoramento contínuo + alertas por e-mail</li>
              <li>Comparador X→Y e diário do gestor completo</li>
            </ol>
          </Card>
        </div>
      )}

      {tab === 'perfil' && (
        <Card title="Perfil do investidor" subtitle="Obrigatório antes de qualquer recomendação personalizada">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Select label="Pessoa" value={profileForm.person_type || ''} onChange={(v) => setField('person_type', (v || null) as any)} options={[['PF', 'Pessoa física'], ['PJ', 'Pessoa jurídica']]} />
            <Num label="Capital disponível (R$)" value={profileForm.capital_available} onChange={(v) => setField('capital_available', v)} />
            <Num label="Reserva de emergência (R$)" value={profileForm.emergency_reserve} onChange={(v) => setField('emergency_reserve', v)} />
            <Num label="Máx. por investimento (R$)" value={profileForm.max_per_investment} onChange={(v) => setField('max_per_investment', v)} />
            <Num label="Horizonte (meses)" value={profileForm.horizon_months} onChange={(v) => setField('horizon_months', v)} int />
            <Select label="Liquidez" value={profileForm.liquidity_need || ''} onChange={(v) => setField('liquidity_need', (v || null) as any)} options={[['D0', 'D+0'], ['D1', 'D+1'], ['D30', 'Até 30 dias'], ['D90', 'Até 90 dias'], ['ILLIQUID_OK', 'Aceito iliquidez']]} />
            <Num label="Perda máx. tolerável (%)" value={profileForm.max_loss_pct} onChange={(v) => setField('max_loss_pct', v)} />
            <Select label="Perfil de risco" value={profileForm.risk_profile || ''} onChange={(v) => setField('risk_profile', (v || null) as any)} options={[['conservador', 'Conservador'], ['moderado', 'Moderado'], ['arrojado', 'Arrojado'], ['agressivo', 'Agressivo']]} />
            <Select label="Categoria CVM" value={profileForm.investor_category || ''} onChange={(v) => setField('investor_category', (v || null) as any)} options={[['geral', 'Geral'], ['qualificado', 'Qualificado'], ['profissional', 'Profissional']]} />
            <Select label="Experiência renda variável" value={boolStr(profileForm.exp_equity)} onChange={(v) => setField('exp_equity', parseBool(v))} options={BOOL_OPTS} />
            <Select label="Experiência crédito privado" value={boolStr(profileForm.exp_private_credit)} onChange={(v) => setField('exp_private_credit', parseBool(v))} options={BOOL_OPTS} />
            <Select label="Experiência FII" value={boolStr(profileForm.exp_fii)} onChange={(v) => setField('exp_fii', parseBool(v))} options={BOOL_OPTS} />
            <Select label="Experiência cripto" value={boolStr(profileForm.exp_crypto)} onChange={(v) => setField('exp_crypto', parseBool(v))} options={BOOL_OPTS} />
            <Select label="Precisa renda mensal?" value={boolStr(profileForm.needs_monthly_income)} onChange={(v) => setField('needs_monthly_income', parseBool(v))} options={BOOL_OPTS} />
            <Num label="Renda mensal necessária (R$)" value={profileForm.monthly_income_amount} onChange={(v) => setField('monthly_income_amount', v)} />
            <Num label="Meta mensal mín. (%)" value={profileForm.monthly_target_pct_min} onChange={(v) => setField('monthly_target_pct_min', v ?? 1.5)} />
            <Num label="Meta mensal máx. (%)" value={profileForm.monthly_target_pct_max} onChange={(v) => setField('monthly_target_pct_max', v ?? 2.0)} />
            <Text label="Corretora padrão" value={profileForm.broker_default} onChange={(v) => setField('broker_default', v)} />
            <Select label="Autoriza cripto?" value={profileForm.allows_crypto ? '1' : '0'} onChange={(v) => setField('allows_crypto', v === '1')} options={[['0', 'Não'], ['1', 'Sim']]} />
            <Select label="Autoriza exterior?" value={profileForm.allows_international ? '1' : '0'} onChange={(v) => setField('allows_international', v === '1')} options={[['0', 'Não'], ['1', 'Sim']]} />
            <Text label="Restrições de setores" value={profileForm.restricted_sectors} onChange={(v) => setField('restricted_sectors', v)} />
            <Text label="Restrições de instituições" value={profileForm.restricted_institutions} onChange={(v) => setField('restricted_institutions', v)} />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveProfile()}
            className="mt-4 inline-flex items-center gap-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl"
            data-testid="gestao-investimento-save-profile"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Salvar perfil
          </button>
        </Card>
      )}

      {tab === 'carteira' && summary && (
        <div className="space-y-4">
          <Card title="Nova posição (manual — XP)" subtitle="Informe o que está na corretora. Sem ordem automática.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Text label="Nome do ativo" value={posForm.instrument_name} onChange={(v) => setPosForm((p) => ({ ...p, instrument_name: v }))} />
              <Text label="Código" value={posForm.instrument_code} onChange={(v) => setPosForm((p) => ({ ...p, instrument_code: v }))} />
              <Select label="Tipo" value={posForm.instrument_type} onChange={(v) => setPosForm((p) => ({ ...p, instrument_type: v }))} options={INSTRUMENT_TYPES.map((t) => [t, t])} />
              <Text label="Quantidade" value={posForm.quantity} onChange={(v) => setPosForm((p) => ({ ...p, quantity: v }))} />
              <Text label="Preço médio" value={posForm.avg_price} onChange={(v) => setPosForm((p) => ({ ...p, avg_price: v }))} />
              <Text label="Valor atual (R$)" value={posForm.current_value} onChange={(v) => setPosForm((p) => ({ ...p, current_value: v }))} />
              <Text label="Data de entrada" value={posForm.entry_date} onChange={(v) => setPosForm((p) => ({ ...p, entry_date: v }))} />
              <Text label="Corretora" value={posForm.broker} onChange={(v) => setPosForm((p) => ({ ...p, broker: v }))} />
              <Text label="Tributação / notas" value={posForm.taxation_notes} onChange={(v) => setPosForm((p) => ({ ...p, taxation_notes: v }))} />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void addPosition()}
              className="mt-3 inline-flex items-center gap-2 bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-lg"
              data-testid="gestao-investimento-add-position"
            >
              <Plus size={14} /> Incluir posição
            </button>
          </Card>
          <Card title="Posições ativas">
            {summary.positions.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma posição cadastrada. Sugestão inicial: registrar o capital de R$ 100.000 na XP.</p>
            ) : (
              <ul className="space-y-2">
                {summary.positions.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs">
                    <div>
                      <p className="font-black text-gray-900">{p.instrument_name} <span className="text-gray-400 font-bold">· {p.instrument_type}</span></p>
                      <p className="text-gray-500">{p.broker} · qtd {p.quantity} · {fmtBRL(Number(p.current_value))}</p>
                    </div>
                    <button type="button" onClick={() => p.id && void removePosition(p.id)} className="text-rose-700 p-1" title="Desativar">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'watchlist' && summary && (
        <div className="space-y-4">
          <Card title="Watchlist" subtitle="Ativos em observação (sem recomendação automática na Fase 2)">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Text label="Nome" value={watchForm.instrument_name} onChange={(v) => setWatchForm((p) => ({ ...p, instrument_name: v }))} />
              <Text label="Código" value={watchForm.instrument_code} onChange={(v) => setWatchForm((p) => ({ ...p, instrument_code: v }))} />
              <Select label="Tipo" value={watchForm.instrument_type} onChange={(v) => setWatchForm((p) => ({ ...p, instrument_type: v }))} options={INSTRUMENT_TYPES.map((t) => [t, t])} />
              <Text label="Notas" value={watchForm.notes} onChange={(v) => setWatchForm((p) => ({ ...p, notes: v }))} />
            </div>
            <button type="button" disabled={saving} onClick={() => void addWatch()} className="mt-3 inline-flex items-center gap-2 bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-lg">
              <Plus size={14} /> Adicionar
            </button>
          </Card>
          <Card title="Itens">
            {summary.watchlist.length === 0 ? (
              <p className="text-sm text-gray-500">Watchlist vazia.</p>
            ) : (
              <ul className="space-y-2">
                {summary.watchlist.map((w) => (
                  <li key={w.id} className="flex justify-between items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs">
                    <span className="font-bold text-gray-800">{w.instrument_name} · {w.status}</span>
                    <button type="button" onClick={() => w.id && void removeWatch(w.id)} className="text-rose-700"><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'auditoria' && (
        <Card title="Diário / auditoria" subtitle="Alterações de perfil, carteira e watchlist">
          {audit.length === 0 ? (
            <p className="text-sm text-gray-500">Sem eventos ainda.</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {audit.map((a) => (
                <li key={a.id} className="text-[11px] border border-gray-100 rounded-lg px-3 py-2 bg-white">
                  <p className="font-black text-gray-800">{a.action} · {a.entity_type}</p>
                  <p className="text-gray-600">{a.summary}</p>
                  <p className="text-gray-400">{a.created_at ? new Date(a.created_at).toLocaleString('pt-BR') : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
};

const BOOL_OPTS: [string, string][] = [['', '—'], ['1', 'Sim'], ['0', 'Não']];
const boolStr = (v: boolean | null | undefined) => (v === true ? '1' : v === false ? '0' : '');
const parseBool = (v: string): boolean | null => (v === '1' ? true : v === '0' ? false : null);

const Kpi: React.FC<{ label: string; value: string; sub?: string; icon?: React.ReactNode }> = ({ label, value, sub, icon }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-black flex items-center gap-1">{icon}{label}</p>
    <p className="text-sm font-black text-gray-900 mt-1 font-mono">{value}</p>
    {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
  </div>
);

const Card: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
    <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">{title}</h3>
    {subtitle && <p className="text-[11px] text-gray-500 mt-0.5 mb-3">{subtitle}</p>}
    {!subtitle && <div className="mb-3" />}
    {children}
  </div>
);

const Text: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wide">
    {label}
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800"
    />
  </label>
);

const Num: React.FC<{ label: string; value: number | null | undefined; onChange: (v: number | null) => void; int?: boolean }> = ({
  label, value, onChange, int,
}) => (
  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wide">
    {label}
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return onChange(null);
        onChange(int ? parseInt(raw, 10) : Number(raw));
      }}
      className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800"
    />
  </label>
);

const Select: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: [string, string][] }> = ({
  label, value, onChange, options,
}) => (
  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wide">
    {label}
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800"
    >
      {options[0]?.[0] !== '' && <option value="">—</option>}
      {options.map(([v, l]) => <option key={`${v}-${l}`} value={v}>{l}</option>)}
    </select>
  </label>
);

export default GestaoInvestimento;
