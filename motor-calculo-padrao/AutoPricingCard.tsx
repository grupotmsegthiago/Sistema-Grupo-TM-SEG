// ============================================================================
// AutoPricingCard — Card "Configuração de Cálculo Padrão" (UI do motor)
// ----------------------------------------------------------------------------
// Componente React autocontido e CONTROLADO POR PROPS. Não fala com banco de
// dados nem com logs diretamente: você passa callbacks (onSave, onDisable,
// onMaterializeBands) e pluga a persistência do SEU projeto.
//
// Dependências:
//   - React
//   - TailwindCSS (classes utilitárias usadas no markup)
//   - lucide-react (ícones) — opcional, troque por seus próprios se quiser
//   - ./providerAutoPricing  (a engine pura deste mesmo pacote)
//
// Exemplo de uso:
//   <AutoPricingCard
//     enabled={provider.auto_calc_enabled}
//     canEdit={isDiretoria}
//     initialConfig={{
//       baseActivationValue: provider.auto_base_value,
//       baseKmAllowance: provider.auto_base_km,
//       baseHourAllowance: provider.auto_base_hr,
//       extraKmValue: provider.auto_extra_km,
//       extraHourValue: provider.auto_extra_hr,
//       region: provider.auto_region,
//     }}
//     manualTables={costTables}                // p/ "Sugerir a partir das tabelas atuais"
//     onSave={async (cfg) => { /* grava no seu banco */ }}
//     onDisable={async () => { /* auto_calc_enabled = false */ }}
//     onMaterializeBands={async (bands, cfg) => { /* opcional: cria tabelas */ }}
//     notify={(title, msg, type) => toast(title, msg, type)}
//   />
// ============================================================================

import { useMemo, useState } from 'react';
import { TrendingUp, Save, Loader2, Lock, AlertTriangle } from 'lucide-react';
import {
    generateAutoBands,
    suggestAutoMasterFromManualTables,
    type ProviderAutoMasterConfig,
    type ProviderAutoBand,
    type ManualCostRow,
} from './providerAutoPricing';

export interface AutoPricingCardProps {
    enabled: boolean;
    canEdit?: boolean;
    initialConfig?: Partial<ProviderAutoMasterConfig>;
    manualTables?: ManualCostRow[];
    onSave: (config: ProviderAutoMasterConfig) => void | Promise<void>;
    onDisable: () => void | Promise<void>;
    onMaterializeBands?: (bands: ProviderAutoBand[], config: ProviderAutoMasterConfig) => void | Promise<void>;
    notify?: (title: string, message: string, type: 'success' | 'warning' | 'error') => void;
}

const LABEL_CLASS = 'block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1';

const REGIONS = ['SUDESTE', 'SUL', 'CENTRO-OESTE', 'NORDESTE', 'NORTE'];
const UFS: [string, string][] = [
    ['SP', 'São Paulo'], ['RJ', 'Rio de Janeiro'], ['MG', 'Minas Gerais'], ['ES', 'Espírito Santo'],
    ['PR', 'Paraná'], ['SC', 'Santa Catarina'], ['RS', 'Rio Grande do Sul'], ['DF', 'Distrito Federal'],
    ['GO', 'Goiás'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['BA', 'Bahia'],
    ['PE', 'Pernambuco'], ['CE', 'Ceará'], ['RN', 'Rio Grande do Norte'], ['PB', 'Paraíba'],
    ['AL', 'Alagoas'], ['SE', 'Sergipe'], ['PI', 'Piauí'], ['MA', 'Maranhão'], ['AM', 'Amazonas'],
    ['PA', 'Pará'], ['AC', 'Acre'], ['RO', 'Rondônia'], ['RR', 'Roraima'], ['AP', 'Amapá'], ['TO', 'Tocantins'],
];

export default function AutoPricingCard({
    enabled,
    canEdit = true,
    initialConfig,
    manualTables,
    onSave,
    onDisable,
    onMaterializeBands,
    notify,
}: AutoPricingCardProps) {
    const [autoMasterEnabled, setAutoMasterEnabled] = useState(enabled);
    const [form, setForm] = useState({
        baseActivationValue: initialConfig?.baseActivationValue != null ? String(initialConfig.baseActivationValue) : '',
        baseKmAllowance: initialConfig?.baseKmAllowance != null ? String(initialConfig.baseKmAllowance) : '100',
        baseHourAllowance: initialConfig?.baseHourAllowance != null ? String(initialConfig.baseHourAllowance) : '3',
        extraKmValue: initialConfig?.extraKmValue != null ? String(initialConfig.extraKmValue) : '',
        extraHourValue: initialConfig?.extraHourValue != null ? String(initialConfig.extraHourValue) : '',
        region: initialConfig?.region ? String(initialConfig.region) : '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isMaterializing, setIsMaterializing] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [suggestionInfo, setSuggestionInfo] = useState<string | null>(null);

    const toast = (title: string, msg: string, type: 'success' | 'warning' | 'error') =>
        notify ? notify(title, msg, type) : undefined;

    const config = useMemo<ProviderAutoMasterConfig>(() => ({
        baseActivationValue: parseFloat(form.baseActivationValue) || 0,
        baseKmAllowance: parseFloat(form.baseKmAllowance) || 0,
        baseHourAllowance: parseFloat(form.baseHourAllowance) || 0,
        extraKmValue: parseFloat(form.extraKmValue) || 0,
        extraHourValue: parseFloat(form.extraHourValue) || 0,
        region: (form.region || '').toUpperCase().trim() || null,
    }), [form]);

    const previewBands = useMemo(() => {
        if (config.baseActivationValue <= 0 || config.baseKmAllowance <= 0) return [];
        return generateAutoBands(config);
    }, [config]);

    const handleSuggest = () => {
        if (!canEdit) { toast('Sem permissão', 'Você não pode configurar o motor automático.', 'error'); return; }
        const suggestion = suggestAutoMasterFromManualTables(manualTables);
        if (!suggestion) { toast('Sem dados', 'Não há tabelas manuais para gerar uma sugestão.', 'warning'); return; }
        const { config: c, sampleCount } = suggestion;
        setForm(prev => ({
            ...prev,
            baseActivationValue: c.baseActivationValue ? String(c.baseActivationValue) : '',
            baseKmAllowance: c.baseKmAllowance ? String(c.baseKmAllowance) : '100',
            baseHourAllowance: c.baseHourAllowance ? String(c.baseHourAllowance) : '3',
            extraKmValue: c.extraKmValue ? String(c.extraKmValue) : '',
            extraHourValue: c.extraHourValue ? String(c.extraHourValue) : '',
        }));
        setSuggestionInfo(`Sugestão calculada pela mediana de ${sampleCount} tabela(s) manual(is). Revise antes de salvar.`);
        toast('Sugestão pronta', `Valores pré-preenchidos pela mediana de ${sampleCount} tabela(s). Revise e ajuste.`, 'success');
    };

    const handleSave = async () => {
        if (!canEdit) { toast('Sem permissão', 'Você não pode configurar o motor automático.', 'error'); return; }
        if (config.baseActivationValue <= 0 || config.baseKmAllowance <= 0 || config.baseHourAllowance <= 0
            || config.extraKmValue < 0 || config.extraHourValue < 0) {
            toast('Atenção', 'Preencha as 5 variáveis mestre com valores positivos.', 'warning');
            return;
        }
        setIsSaving(true);
        try {
            await onSave(config);
            setAutoMasterEnabled(true);
            setSuggestionInfo(null);
            toast('Sucesso', 'Configuração mestre salva. Motor automático ativo.', 'success');
        } catch (err: any) {
            toast('Erro', 'Falha ao salvar: ' + (err?.message || 'erro desconhecido'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDisable = async () => {
        if (!canEdit) { toast('Sem permissão', 'Você não pode alterar.', 'error'); return; }
        try {
            await onDisable();
            setAutoMasterEnabled(false);
            toast('Sucesso', 'Motor automático desligado.', 'success');
        } catch (err: any) {
            toast('Erro', 'Falha ao desligar: ' + (err?.message || 'erro desconhecido'), 'error');
        }
    };

    const handleMaterialize = async () => {
        if (!onMaterializeBands) return;
        if (!canEdit) { toast('Sem permissão', 'Você não pode gerar tabelas.', 'error'); return; }
        if (previewBands.length === 0) { toast('Atenção', 'Configure as variáveis mestre primeiro.', 'warning'); return; }
        setIsMaterializing(true);
        try {
            await onMaterializeBands(previewBands, config);
            toast('Sucesso', `${previewBands.length} faixas geradas como tabelas.`, 'success');
        } catch (err: any) {
            toast('Erro', 'Falha ao gerar tabelas: ' + (err?.message || 'erro desconhecido'), 'error');
        } finally {
            setIsMaterializing(false);
        }
    };

    return (
        <div className={`rounded-2xl border-2 p-5 ${autoMasterEnabled ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-white' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${autoMasterEnabled ? 'bg-emerald-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                        <TrendingUp size={18} />
                    </div>
                    <div>
                        <h4 className="font-black text-sm uppercase tracking-wide text-gray-800">Configuração de Cálculo Padrão</h4>
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
                            {autoMasterEnabled ? 'Motor ativo — tabelas manuais serão ignoradas' : 'Defina 5 variáveis e ative o cálculo automático por faixa'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {autoMasterEnabled && (
                        <span className="text-[10px] font-black px-2 py-1 rounded-full bg-emerald-600 text-white uppercase tracking-widest">Ativo</span>
                    )}
                    {autoMasterEnabled && canEdit && (
                        <button type="button" onClick={handleDisable} className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Desligar</button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                    <label className={LABEL_CLASS}>Valor Base (Acionamento)</label>
                    <input type="number" step="0.01" disabled={!canEdit} value={form.baseActivationValue} onChange={e => setForm({ ...form, baseActivationValue: e.target.value })} className="w-full p-2 border rounded text-xs font-bold text-emerald-700 bg-white" placeholder="480.00" />
                </div>
                <div>
                    <label className={LABEL_CLASS}>KM Franquia Base</label>
                    <input type="number" disabled={!canEdit} value={form.baseKmAllowance} onChange={e => setForm({ ...form, baseKmAllowance: e.target.value })} className="w-full p-2 border rounded text-xs font-bold bg-white" placeholder="100" />
                </div>
                <div>
                    <label className={LABEL_CLASS}>Horas Franquia Base</label>
                    <input type="number" disabled={!canEdit} value={form.baseHourAllowance} onChange={e => setForm({ ...form, baseHourAllowance: e.target.value })} className="w-full p-2 border rounded text-xs font-bold bg-white" placeholder="3" />
                </div>
                <div>
                    <label className={LABEL_CLASS}>Valor KM Extra</label>
                    <input type="number" step="0.01" disabled={!canEdit} value={form.extraKmValue} onChange={e => setForm({ ...form, extraKmValue: e.target.value })} className="w-full p-2 border rounded text-xs font-bold bg-white" placeholder="4.80" />
                </div>
                <div>
                    <label className={LABEL_CLASS}>Valor Hora Extra</label>
                    <input type="number" step="0.01" disabled={!canEdit} value={form.extraHourValue} onChange={e => setForm({ ...form, extraHourValue: e.target.value })} className="w-full p-2 border rounded text-xs font-bold bg-white" placeholder="110.00" />
                </div>
                <div>
                    <label className={LABEL_CLASS} title="Filtro do motor: Região (SUDESTE...) OU Estado (SP...). Vazio = todas.">Filtro (Região/Estado)</label>
                    <select disabled={!canEdit} value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} className="w-full p-2 border rounded text-xs font-bold bg-white">
                        <option value="">TODAS (sem filtro)</option>
                        <optgroup label="Por Região">
                            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </optgroup>
                        <optgroup label="Por Estado (UF)">
                            {UFS.map(([uf, nome]) => <option key={uf} value={uf}>{uf} — {nome}</option>)}
                        </optgroup>
                    </select>
                </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-200">
                <div className="flex items-center gap-3 flex-wrap">
                    <button type="button" onClick={() => setShowPreview(v => !v)} disabled={previewBands.length === 0} className="text-[11px] font-black uppercase tracking-widest text-indigo-700 hover:underline disabled:opacity-40 flex items-center gap-1">
                        {showPreview ? 'Ocultar' : 'Ver'} faixas geradas ({previewBands.length})
                    </button>
                    {manualTables && (
                        <button type="button" onClick={handleSuggest} disabled={!canEdit || (manualTables?.length ?? 0) === 0} className="text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5" title="Pré-preenche os 5 campos com a mediana das tabelas manuais cadastradas">
                            <TrendingUp size={12} /> Sugerir a partir das tabelas atuais
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {autoMasterEnabled && onMaterializeBands && (
                        <button type="button" onClick={handleMaterialize} disabled={!canEdit || isMaterializing || previewBands.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                            {isMaterializing ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar Faixas como Tabelas
                        </button>
                    )}
                    <button type="button" onClick={handleSave} disabled={!canEdit || isSaving} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {autoMasterEnabled ? 'Atualizar' : 'Ativar Motor'}
                    </button>
                </div>
            </div>

            {suggestionInfo && (
                <p className="text-[10px] font-bold text-indigo-700 mt-2 flex items-center gap-1">
                    <TrendingUp size={10} /> {suggestionInfo}
                </p>
            )}

            {!canEdit && (
                <p className="text-[10px] font-bold text-amber-700 mt-2 flex items-center gap-1"><Lock size={10} /> Você não tem permissão para editar.</p>
            )}

            {showPreview && previewBands.length > 0 && (
                <div className="mt-4 max-h-64 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                    <table className="w-full text-[10px]">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr className="text-left font-black uppercase tracking-widest text-gray-500">
                                <th className="p-2">Faixa (km)</th>
                                <th className="p-2">Horas Franquia</th>
                                <th className="p-2">Base</th>
                                <th className="p-2">+KM</th>
                                <th className="p-2">+Hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            {previewBands.map(b => (
                                <tr key={b.kmFaixa} className="border-t border-gray-100 font-mono">
                                    <td className="p-2 font-black text-gray-800">{b.kmFaixa}</td>
                                    <td className="p-2">{b.franquiaHoras}h</td>
                                    <td className="p-2 text-emerald-700 font-black">R$ {b.valorBase.toFixed(2)}</td>
                                    <td className="p-2">R$ {config.extraKmValue.toFixed(2)}</td>
                                    <td className="p-2">R$ {config.extraHourValue.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {autoMasterEnabled && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 font-bold">
                    <AlertTriangle size={12} className="inline mr-1" /> Motor automático ATIVO. As tabelas manuais ficam preservadas, mas serão ignoradas no cálculo de novas OS.
                </div>
            )}
        </div>
    );
}
