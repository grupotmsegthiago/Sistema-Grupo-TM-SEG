// BUILD v048 - 2026-04-07 17:40 BRT
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../lib/authFetch';
import { supabase } from '../lib/supabase';
import { Mission, Client, ClientPriceTable, ProviderCostTable } from '../types';
import { FileText, Search, Printer, Loader2, FileSpreadsheet, BarChart3, Users, Building2, ChevronDown, ChevronRight, List, ExternalLink, Receipt, Camera, Sparkles, X, AlertCircle, CheckCircle2, ScanLine, Image as ImageIcon, DollarSign, Plus, Trash2, GitBranch, Calendar, Lock, Pencil, ArrowRight, ArrowLeftRight, Check, RefreshCw } from 'lucide-react';
import { calculateMissionFinancials, extractCityFromAddress, extractUF, clientFuzzyFilter, clientNameShort, resolveCancelledTime } from '../lib/financialUtils';
import { computeDhlBand } from '../lib/dhlAutoTableSelector';
import MissionFinancialModal from './MissionFinancialModal';

// PostgREST .or() trata ( ) , . : como reservados. Para nomes com parênteses
// (ex: "DHL SUPPLY CHAIN (BRAZIL) LTDA"), o valor precisa vir entre aspas
// duplas, senão a consulta retorna 0 linhas silenciosamente.
function quoteOrValue(v: string): string {
    return /[(),.:]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}
import { generateContent } from '../lib/gemini';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts';

interface ClientBillingReportProps { onNavigate?: (screen: string) => void; onOpenMission?: (missionId: string) => void; }
const ClientBillingReport: React.FC<ClientBillingReportProps> = ({ onNavigate, onOpenMission }) => {
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedMonth, setSelectedMonth] = useState('');
    const [missions, setMissions] = useState<any[]>([]);
    const [editMission, setEditMission] = useState<any | null>(null);
    const [priceTables, setPriceTables] = useState<ClientPriceTable[]>([]);
    const [providerTables, setProviderTables] = useState<ProviderCostTable[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [reportGenerated, setReportGenerated] = useState(false);
    const [allPeriodMissions, setAllPeriodMissions] = useState<any[]>([]);
    const [allClientTables, setAllClientTables] = useState<ClientPriceTable[]>([]);
    const [allProviderTables, setAllProviderTables] = useState<ProviderCostTable[]>([]);
    const [billingAdjustments, setBillingAdjustments] = useState<Record<string, any>>({});
    const [chartsLoading, setChartsLoading] = useState(false);
    const [chartsGenerated, setChartsGenerated] = useState(false);

    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [invoiceForm, setInvoiceForm] = useState({ client: '', number: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '', provider: '', issuer_company: '', boleto_due_date: '' });
    const [invoiceMedicaoEmail, setInvoiceMedicaoEmail] = useState('');
    const [showMedicaoEmailInput, setShowMedicaoEmailInput] = useState(false);
    const [nfFile, setNfFile] = useState<File | null>(null);
    const [boletoFile, setBoletoFile] = useState<File | null>(null);
    const [nfPreview, setNfPreview] = useState('');
    const [boletoPreview, setBoletoPreview] = useState('');
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const [aiStatus, setAiStatus] = useState('');
    const [invoiceSaving, setInvoiceSaving] = useState(false);

    const [asaasLoading, setAsaasLoading] = useState(false);
    const [asaasResult, setAsaasResult] = useState<any>(null);
    const [asaasConfigured, setAsaasConfigured] = useState(false);
    const [asaasDescription, setAsaasDescription] = useState('');
    const [asaasPeriod, setAsaasPeriod] = useState('');
    const [asaasSplitMode, setAsaasSplitMode] = useState(false);
    const [asaasSplitCharges, setAsaasSplitCharges] = useState<{name: string; cpfCnpj: string; email: string; value: string}[]>([]);

    const [showPasteModal, setShowPasteModal] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [pasteResult, setPasteResult] = useState<{ matched: any[]; onlySystem: any[]; onlySheet: any[]; divergences: any[] } | null>(null);
    const [editingDivergence, setEditingDivergence] = useState<{ id: string; missionId: string; field: string; currentValue: number; isCurrency: boolean; sheetValue?: number; sysTotal?: number; sheetTotal?: number } | null>(null);
    const [divEditInput, setDivEditInput] = useState('');
    const [divEditSaving, setDivEditSaving] = useState(false);
    const [divEditError, setDivEditError] = useState('');
    const [boletimFilter, setBoletimFilter] = useState<'todas' | 'aprovadas' | 'pendentes'>('todas');
    const [includeOsInput, setIncludeOsInput] = useState('');
    const [actionBusy, setActionBusy] = useState<string | null>(null);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [recalcResult, setRecalcResult] = useState<{ total: number; updated: number; skipped: number; errors: number } | null>(null);

    useEffect(() => {
        authFetch('/api/asaas/status').then(r => r.json()).then(d => setAsaasConfigured(d.configured)).catch(() => {});
    }, []);

    useEffect(() => {
        if (asaasResult) setAsaasResult(null);
    }, [invoiceForm.amount, invoiceForm.boleto_due_date, invoiceForm.client, invoiceForm.number]);

    useEffect(() => {
        if (showInvoiceModal) {
            const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            if (startDate) {
                const sDate = new Date(startDate + 'T12:00:00');
                const month = monthNames[sDate.getMonth()];
                const year = sDate.getFullYear();
                const sDay = sDate.getDate();
                const eDate = endDate ? new Date(endDate + 'T12:00:00') : sDate;
                const eDay = eDate.getDate();
                const lastDayOfMonth = new Date(year, sDate.getMonth() + 1, 0).getDate();
                if (sDay === 1 && eDay === lastDayOfMonth) {
                    setAsaasPeriod(`Mês Completo de ${month}/${year}`);
                } else if (sDay === 1 && eDay === 15) {
                    setAsaasPeriod(`1ª Quinzena de ${month}/${year}`);
                } else if (sDay === 16) {
                    setAsaasPeriod(`2ª Quinzena de ${month}/${year}`);
                } else {
                    setAsaasPeriod(`${month}/${year}`);
                }
            } else {
                const now = new Date();
                const day = now.getDate();
                const monthLabel = monthNames[now.getMonth()];
                const yearLabel = now.getFullYear();
                const quinzena = day <= 15 ? '1ª Quinzena' : '2ª Quinzena';
                setAsaasPeriod(`${quinzena} de ${monthLabel}/${yearLabel}`);
            }
        }
    }, [showInvoiceModal, startDate, endDate]);

    useEffect(() => {
        const selectedClient = clients.find(c => c.id.toString() === invoiceForm.client);
        const clientNameUpper = `${selectedClient?.name || ''} ${selectedClient?.trading_name || ''}`.toUpperCase();
        let base: string;
        if (clientNameUpper.includes('CEVA')) {
            base = 'Ref. aos Serviços de Intermediação de Agenciamento de Contrato';
        } else if (clientNameUpper.includes('AMAZON')) {
            base = 'Ref. aos Serviços de Rastreamento e Monitoramento de Carga';
        } else {
            base = 'Ref. aos Serviços de Intermediação de Escolta Armada';
        }
        let desc = asaasPeriod ? `${base} - ${asaasPeriod}` : base;
        const libMatch = invoiceForm.notes.match(/LIB\. FATUR\.: ([A-Z0-9]+)/);
        if (libMatch && clientNameUpper.includes('CEVA')) {
            desc += ` — Lib. Fatur.: ${libMatch[1]}`;
        }
        setAsaasDescription(desc);
    }, [asaasPeriod, showInvoiceModal, invoiceForm.client, invoiceForm.notes, clients]);

    const asaasSplitTotal = useMemo(() => {
        return asaasSplitCharges.reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0);
    }, [asaasSplitCharges]);

    const asaasSplitDiff = useMemo(() => {
        const total = parseFloat(invoiceForm.amount) || 0;
        return Math.round((total - asaasSplitTotal) * 100) / 100;
    }, [asaasSplitTotal, invoiceForm.amount]);

    useEffect(() => {
        fetchClients();
        const date = new Date();
        const y = date.getFullYear();
        const m = date.getMonth();
        const firstDay = new Date(y, m, 1).toISOString().split('T')[0];
        const lastDay = new Date(y, m + 1, 0).toISOString().split('T')[0];
        setStartDate(firstDay);
        setEndDate(lastDay);
        setSelectedMonth(`${y}-${(m + 1).toString().padStart(2, '0')}`);
    }, []);

    const handleGenerateRef = React.useRef<() => void>(() => {});
    const reportGeneratedRef = React.useRef(reportGenerated);
    reportGeneratedRef.current = reportGenerated;
    const selectedClientRef = React.useRef(selectedClient);
    selectedClientRef.current = selectedClient;

    useEffect(() => {
        // Debounce para não regerar o boletim várias vezes em rajadas de
        // updates (ex: salvar Modal Financeiro dispara 2-3 UPDATEs seguidos).
        let refreshTimer: ReturnType<typeof setTimeout> | null = null;
        const scheduleRefresh = () => {
            if (!reportGeneratedRef.current || !selectedClientRef.current) return;
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
                refreshTimer = null;
                handleGenerateRef.current();
            }, 350);
        };

        const handleRefresh = () => scheduleRefresh();
        window.addEventListener('refreshMissions', handleRefresh);

        // Qualquer mudança em missions/snapshots/vínculos atualiza o boletim
        // em tempo real. Antes, só um subconjunto de campos disparava
        // refresh — agora capturamos qualquer UPDATE/INSERT/DELETE.
        const channel = supabase.channel('billing-financial-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => scheduleRefresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'client_vehicles' }, () => scheduleRefresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => scheduleRefresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_logs' }, (payload: any) => {
                const ent = payload?.new?.entity || payload?.old?.entity;
                if (ent === 'BillingAdjustment' || ent === 'BillingSnapshot') scheduleRefresh();
            })
            .subscribe();

        return () => {
            if (refreshTimer) clearTimeout(refreshTimer);
            window.removeEventListener('refreshMissions', handleRefresh);
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchClients = async () => {
        const { data } = await supabase.from('clients').select('*').eq('status', 'Ativo').order('name');
        if (data) setClients(data as any);
    };

    const handleSetFortnight = (period: 1 | 2) => {
        const refDate = startDate ? new Date(startDate + 'T12:00:00') : new Date();
        const year = refDate.getFullYear();
        const month = refDate.getMonth();
        const mm = (month + 1).toString().padStart(2, '0');
        if (period === 1) {
            setStartDate(`${year}-${mm}-01`);
            setEndDate(`${year}-${mm}-15`);
        } else {
            const lastDay = new Date(year, month + 1, 0).getDate();
            setStartDate(`${year}-${mm}-16`);
            setEndDate(`${year}-${mm}-${lastDay}`);
        }
    };

    const handleSetWeekSundayToSunday = (offset: 0 | -1) => {
        // Semana de Segunda a Domingo (7 dias). Usa a data ATUAL como referência.
        // offset=0 → semana em curso (segunda desta semana → domingo desta semana)
        // offset=-1 → semana anterior
        const ref = new Date();
        const day = ref.getDay(); // 0=Dom, 1=Seg, ... 6=Sab
        // Distância até a segunda-feira desta semana: Dom=-6, Seg=0, Ter=-1, ..., Sab=-5
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diffToMonday + (offset * 7));
        const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
        const fmt = (d: Date) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        setStartDate(fmt(monday));
        setEndDate(fmt(sunday));
    };

    const handleSetMonth = (value: string) => {
        setSelectedMonth(value);
        if (!value) return;
        const [y, m] = value.split('-').map(Number);
        const first = `${y}-${m.toString().padStart(2, '0')}-01`;
        const last = new Date(y, m, 0).getDate();
        const lastStr = `${y}-${m.toString().padStart(2, '0')}-${last.toString().padStart(2, '0')}`;
        setStartDate(first);
        setEndDate(lastStr);
    };

    const handleGenerate = async () => {
        if (!selectedClient) { alert("Selecione um cliente."); return; }
        setIsLoading(true);
        setReportGenerated(false);
        try {
            const clientObj = clients.find(c => c.id.toString() === selectedClient);
            const clientName = clientObj?.name || '';
            const tradingName = clientObj?.trading_name || '';
            const escapedClientName = clientName.trim().replace(/[%_\\]/g, '\\$&');
            const escapedTradingName = tradingName.trim().replace(/[%_\\]/g, '\\$&');
            const rangeStart = `${startDate}T03:00:00.000Z`;
            const rangeEnd = new Date(new Date(`${endDate}T03:00:00.000Z`).getTime() + 86400000 - 1).toISOString();

            const clientFilters = [`client.ilike.${quoteOrValue('%' + escapedClientName + '%')}`];
            if (escapedTradingName && escapedTradingName !== escapedClientName) {
                clientFilters.push(`client.ilike.${quoteOrValue('%' + escapedTradingName + '%')}`);
            }
            // BUG anterior: usávamos só `length > 2` como filtro de palavras, então
            // pra "ET DO BRASIL LTDA" sobrava ["BRASIL","LTDA"] → padrão
            // `%BRASIL%LTDA%` → casava SANKYU LOGISTICS DO BRASIL LTDA, etc.
            // Agora também tira stop-words (LTDA, S.A., DO, DE, DA, ...) e exige
            // pelo menos 2 palavras significativas com 4+ letras pra montar o
            // filtro genérico, evitando colisões entre clientes.
            const STOP_WORDS = new Set(['LTDA','LTDA.','S.A.','S.A','SA','S/A','S/A.','DO','DE','DA','E','DAS','DOS','BRASIL']);
            const meaningfulParts = escapedClientName
                .split(/\s+/)
                .filter(p => p.length >= 4 && !STOP_WORDS.has(p.toUpperCase()));
            if (meaningfulParts.length >= 2) {
                const coreFilter = meaningfulParts.slice(0, 3).join('%');
                clientFilters.push(`client.ilike.${quoteOrValue('%' + coreFilter + '%')}`);
            }
            const shortName = clientNameShort(clientName);
            if (shortName && shortName.split(/\s+/).every(w => w.length >= 3)) {
                clientFilters.push(`client.ilike.${quoteOrValue('%' + shortName + '%')}`);
            }

            // Regra padrão: filtra por start_time (mês da viagem).
            // Para casos especiais (ex: Cancelada auditada em mês diferente),
            // o usuário pode preencher manualmente `billing_period_override`
            // na auditoria — essa OS será incluída pela data override.
            // Já `exclude_from_billing = true` esconde a OS de TODOS os boletins.
            const { data: missionDataRaw, error } = await supabase
                .from('missions')
                .select('*, company_vehicle:vehicles(*)')
                .or(clientFilters.join(','))
                .neq('status', 'Recusada')
                .not('start_time', 'is', null)
                .gte('start_time', rangeStart)
                .lte('start_time', rangeEnd)
                .order('start_time', { ascending: true });

            if (error) throw error;

            // Busca extra: OS com billing_period_override caindo no período.
            // Se a coluna ainda não existir no banco (migração não rodada),
            // a query falha silenciosamente e o boletim segue normal.
            let overrideExtras: any[] = [];
            try {
                const { data: overrideRaw, error: ovErr } = await supabase
                    .from('missions')
                    .select('*, company_vehicle:vehicles(*)')
                    .or(clientFilters.join(','))
                    .neq('status', 'Recusada')
                    .not('billing_period_override', 'is', null)
                    .gte('billing_period_override', rangeStart)
                    .lte('billing_period_override', rangeEnd);
                if (!ovErr && overrideRaw) overrideExtras = overrideRaw;
            } catch {}

            const baseList: any[] = missionDataRaw || [];
            const seen = new Set(baseList.map(m => m.id));
            const merged = [...baseList, ...overrideExtras.filter(m => !seen.has(m.id))];
            // Aplica exclude_from_billing (se a coluna existir).
            const missionData: any[] = merged
                .filter(m => m.exclude_from_billing !== true)
                .sort((a, b) => new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime());

            const clientVehicleIds = [...new Set((missionData || []).map((m: any) => m.client_vehicle).filter((id: any) => id))];
            let clientVehiclesMap: Record<string, any> = {};
            if (clientVehicleIds.length > 0) {
                const { data: cvData } = await supabase.from('client_vehicles').select('id, plate, model, brand, color').in('id', clientVehicleIds);
                if (cvData) {
                    cvData.forEach((v: any) => { clientVehiclesMap[v.id.toString()] = v; });
                }
            }

            // Regra de OS cancelada: precisamos do momento em que o status virou
            // "Cancelada" (mission_history) para zerar as horas no boletim/planilha.
            const cancelledIds = (missionData || [])
                .filter((m: any) => (m.status || '').toString().toLowerCase().includes('cancel'))
                .map((m: any) => m.id)
                .filter(Boolean);
            const cancelTimeMap: Record<string, string> = {};
            if (cancelledIds.length > 0) {
                try {
                    const { data: histRows } = await supabase
                        .from('mission_history')
                        .select('mission_id, changed_at, new_value')
                        .in('mission_id', cancelledIds)
                        .eq('field_name', 'status')
                        .order('changed_at', { ascending: true });
                    if (histRows) {
                        for (const h of histRows as any[]) {
                            if ((h.new_value || '').toString().toLowerCase().includes('cancel')) {
                                // ordem asc -> mantém o cancelamento mais recente.
                                cancelTimeMap[h.mission_id] = h.changed_at;
                            }
                        }
                    }
                } catch {}
            }

            const enrichedMissions = (missionData || []).map((m: any) => ({
                ...m,
                _clientVehicle: m.client_vehicle ? clientVehiclesMap[m.client_vehicle.toString()] : null,
                _cancelStatusAt: cancelTimeMap[m.id] || null
            }));

            const missionIds = (missionData || []).map((m: any) => m.id).filter(Boolean);

            const [ptRes, pctRes, adjRes, snapRes] = await Promise.all([
                supabase.from('client_price_tables').select('*').or(clientFuzzyFilter(clientName)),
                supabase.from('provider_cost_tables').select('*'),
                missionIds.length > 0
                    ? supabase.from('system_logs').select('entity_id, details').eq('entity', 'BillingAdjustment').in('entity_id', missionIds).order('created_at', { ascending: false }).limit(missionIds.length * 5)
                    : Promise.resolve({ data: [] }),
                missionIds.length > 0
                    ? supabase.from('system_logs').select('entity_id, details').eq('entity', 'BillingSnapshot').in('entity_id', missionIds).order('created_at', { ascending: false }).limit(missionIds.length * 2)
                    : Promise.resolve({ data: [] })
            ]);
            setPriceTables(ptRes.data as ClientPriceTable[] || []);
            setProviderTables(pctRes.data as any || []);

            const adjMap: Record<string, any> = {};
            if (adjRes.data) {
                for (const row of adjRes.data) {
                    if (!adjMap[row.entity_id]) {
                        try { adjMap[row.entity_id] = JSON.parse(row.details); } catch {}
                    }
                }
            }
            setBillingAdjustments(adjMap);

            if (snapRes.data) {
                const snapMap: Record<string, any> = {};
                for (const row of snapRes.data) {
                    if (!snapMap[row.entity_id]) {
                        try { snapMap[row.entity_id] = JSON.parse(row.details); } catch {}
                    }
                }
                const updated = enrichedMissions.map((m: any) => {
                    const snap = snapMap[m.id];
                    if (snap && !m.snapshot_approved_by) {
                        return { ...m, snapshot_data: snap, snapshot_approved_by: snap.approved_by || 'Sistema', snapshot_approved_at: snap.approved_at };
                    }
                    return m;
                });
                setMissions(updated);
            } else {
                setMissions(enrichedMissions);
            }

            setReportGenerated(true);
            setBoletimFilter('todas');
        } catch (err) {
            console.error(err);
            alert("Erro ao gerar relatório.");
        } finally {
            setIsLoading(false);
        }
    };
    handleGenerateRef.current = handleGenerate;

    // Inclui uma OS no boletim do período atual mesmo que start_time seja de
    // outro mês. Marca billing_period_override = data central do período.
    const handleIncludeOs = async () => {
        const raw = includeOsInput.trim().toUpperCase().replace(/\s+/g,'');
        if (!raw) { alert('Digite o número da OS (ex: 4261 ou GTM-4261).'); return; }
        const missionId = raw.startsWith('GTM-') ? raw : `GTM-${raw}`;
        if (!startDate || !endDate) { alert('Defina o período antes de incluir a OS.'); return; }
        setActionBusy(missionId);
        try {
            const { data: existing, error: chkErr } = await supabase
                .from('missions').select('id, client, start_time, exclude_from_billing').eq('id', missionId).maybeSingle();
            if (chkErr) throw chkErr;
            if (!existing) { alert(`OS ${missionId} não encontrada.`); return; }

            // Usa o meio do período como data de override (12h pra evitar fuso)
            const overrideDate = `${startDate}T12:00:00.000Z`;
            const updates: any = { billing_period_override: overrideDate };
            if (existing.exclude_from_billing) updates.exclude_from_billing = false;

            const { error: upErr } = await supabase.from('missions').update(updates).eq('id', missionId);
            if (upErr) {
                if (upErr.message?.includes('billing_period_override') || upErr.message?.includes('does not exist')) {
                    alert('A coluna billing_period_override ainda não existe no banco. Rode o SQL fornecido anteriormente no Supabase SQL Editor e tente de novo.');
                    return;
                }
                throw upErr;
            }
            setIncludeOsInput('');
            await handleGenerate();
            alert(`OS ${missionId} incluída neste período.`);
        } catch (e: any) {
            console.error(e);
            alert('Erro ao incluir OS: ' + (e.message || 'desconhecido'));
        } finally { setActionBusy(null); }
    };

    // Exclui uma OS deste boletim (e de qualquer outro). Marca exclude_from_billing=true.
    const handleExcludeRow = async (shortId: string) => {
        const missionId = shortId.startsWith('GTM-') ? shortId : `GTM-${shortId}`;
        if (!confirm(`Remover a OS ${missionId} deste boletim?\n\nEla não vai mais aparecer em nenhum boletim de medição até você reincluir.`)) return;
        setActionBusy(missionId);
        try {
            const { error: upErr } = await supabase.from('missions').update({ exclude_from_billing: true, billing_period_override: null }).eq('id', missionId);
            if (upErr) {
                if (upErr.message?.includes('exclude_from_billing') || upErr.message?.includes('does not exist')) {
                    alert('A coluna exclude_from_billing ainda não existe no banco. Rode o SQL fornecido anteriormente no Supabase SQL Editor e tente de novo.');
                    return;
                }
                throw upErr;
            }
            await handleGenerate();
        } catch (e: any) {
            console.error(e);
            alert('Erro ao excluir OS: ' + (e.message || 'desconhecido'));
        } finally { setActionBusy(null); }
    };

    const handleRecalculateAndCompare = async () => {
        const clientObj = clients.find(c => c.id.toString() === selectedClient);
        if (!clientObj) return;
        setIsRecalculating(true);
        setRecalcResult(null);
        try {
            const res = await authFetch('/api/billing/recalculate-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientName: clientObj.name, startDate, endDate }),
            });
            const data = await res.json();
            setRecalcResult(data);

            const savedPaste = pasteText;
            setPasteResult(null);
            await handleGenerate();
            if (savedPaste.trim()) {
                setPasteText(savedPaste);
                setPendingRecompare(true);
            }
        } catch (err) {
            console.error('Erro ao recalcular:', err);
            alert('Erro ao recalcular missões.');
        } finally {
            setIsRecalculating(false);
        }
    };

    const handleFetchCharts = async () => {
        if (!startDate || !endDate) { alert("Selecione o período."); return; }
        setChartsLoading(true);
        setChartsGenerated(false);
        try {
            const rangeStart = `${startDate}T03:00:00.000Z`;
            const rangeEnd = new Date(new Date(`${endDate}T03:00:00.000Z`).getTime() + 86400000 - 1).toISOString();
            const { data: missionData, error } = await supabase.from('missions').select('*').neq('status', 'Recusada')
                .not('start_time', 'is', null).gte('start_time', rangeStart).lte('start_time', rangeEnd).order('start_time', { ascending: true });
            if (error) throw error;

            const [ptRes, pctRes] = await Promise.all([
                supabase.from('client_price_tables').select('*'),
                supabase.from('provider_cost_tables').select('*')
            ]);
            setAllClientTables(ptRes.data as ClientPriceTable[] || []);
            setAllProviderTables(pctRes.data as any || []);
            setAllPeriodMissions(missionData || []);
            setChartsGenerated(true);
        } catch (err) {
            console.error(err);
            alert("Erro ao carregar dados dos gráficos.");
        } finally {
            setChartsLoading(false);
        }
    };

    interface MissionDetail { id: string; route: string; revenue: number; cost: number; lucro: number; pct: number; date: string; provider: string; client: string; km: number; isSameOs?: boolean; }
    type ChartItem = { nome: string; valor: number; custo: number; lucro: number; pct: number; count: number; fullName: string; missions: MissionDetail[]; receita?: number; };

    const [expandedClient, setExpandedClient] = useState<string | null>(null);
    const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
    const [sortMode, setSortMode] = useState<'valor' | 'pct'>('valor');
    const [chartTab, setChartTab] = useState<'clientes' | 'fornecedores' | 'geral'>('clientes');
    const handleOpenOS = (missionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (onOpenMission) onOpenMission(missionId);
    };

    const chartComputedData = useMemo(() => {
        if (!chartsGenerated || allPeriodMissions.length === 0) return { clientData: [] as ChartItem[], providerData: [] as ChartItem[] };
        const clientTotals: Record<string, { revenue: number; cost: number; count: number; missions: MissionDetail[] }> = {};
        const providerTotals: Record<string, { cost: number; revenue: number; count: number; missions: MissionDetail[] }> = {};

        allPeriodMissions.forEach(m => {
            const clientName = m.client || 'Sem Cliente';
            const providerName = m.provider || 'Sem Fornecedor';
            const clientObj = clients.find(c => c.name === clientName);
            const displayClient = clientObj?.trading_name || clientName;

            const hasStoredRevenue = m.revenue_value != null && m.revenue_value > 0;
            const hasStoredCost = m.cost_value != null && m.cost_value > 0;

            let revenue: number;
            let cost: number;

            revenue = (m.revenue_value || 0) + Math.max(0, m.toll_value || 0);
            const tollProv = Math.max(0, m.toll_value_provider != null ? m.toll_value_provider : (m.toll_value || 0));
            cost = (m.cost_value || 0) + tollProv;
            const mLucro = revenue - cost;
            const mPct = revenue > 0 ? Math.round((mLucro / revenue) * 100) : 0;

            const cidadeO = extractCityFromAddress(m.origin || '');
            const cidadeD = extractCityFromAddress(m.destination || '');
            const route = cidadeO && cidadeD ? `${cidadeO} → ${cidadeD}` : m.region || '-';

            const detail: MissionDetail = {
                id: m.id || '',
                route,
                revenue: Math.round(revenue * 100) / 100,
                cost: Math.round(cost * 100) / 100,
                lucro: Math.round(mLucro * 100) / 100,
                pct: mPct,
                date: m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-',
                provider: providerName,
                client: displayClient,
                km: m.total_distance || m.traveled_distance || 0,
                isSameOs: !!(m as any).is_same_os,
            };

            if (!clientTotals[displayClient]) clientTotals[displayClient] = { revenue: 0, cost: 0, count: 0, missions: [] };
            clientTotals[displayClient].revenue += revenue;
            clientTotals[displayClient].cost += cost;
            clientTotals[displayClient].count++;
            clientTotals[displayClient].missions.push(detail);

            if (!providerTotals[providerName]) providerTotals[providerName] = { cost: 0, revenue: 0, count: 0, missions: [] };
            providerTotals[providerName].cost += cost;
            providerTotals[providerName].revenue += revenue;
            providerTotals[providerName].count++;
            providerTotals[providerName].missions.push(detail);
        });

        const clientData: ChartItem[] = Object.entries(clientTotals)
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .map(([nome, d]) => {
                const lucro = d.revenue - d.cost;
                const pct = d.revenue > 0 ? Math.round((lucro / d.revenue) * 100) : 0;
                const sortedMissions = d.missions.sort((a, b) => a.lucro - b.lucro);
                return { nome, valor: Math.round(d.revenue * 100) / 100, custo: Math.round(d.cost * 100) / 100, lucro: Math.round(lucro * 100) / 100, pct, count: d.count, fullName: nome, missions: sortedMissions };
            });

        const providerData: ChartItem[] = Object.entries(providerTotals)
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([nome, d]) => {
                const lucro = d.revenue - d.cost;
                const pct = d.revenue > 0 ? Math.round((lucro / d.revenue) * 100) : 0;
                const sortedMissions = d.missions.sort((a, b) => a.lucro - b.lucro);
                return { nome, valor: Math.round(d.cost * 100) / 100, receita: Math.round(d.revenue * 100) / 100, custo: Math.round(d.cost * 100) / 100, lucro: Math.round(lucro * 100) / 100, pct, count: d.count, fullName: nome, missions: sortedMissions };
            });

        const allMissions: MissionDetail[] = [];
        Object.values(clientTotals).forEach(ct => allMissions.push(...ct.missions));

        return { clientData, providerData, allMissions };
    }, [chartsGenerated, allPeriodMissions, clients, allClientTables, allProviderTables]);

    const clientChartData = chartComputedData.clientData;
    const providerChartData = chartComputedData.providerData;
    const allMissionsGeneral = chartComputedData.allMissions || [];

    const CHART_COLORS_CLIENT = ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#1e3a5f', '#0c4a6e', '#0369a1', '#0284c7'];
    const CHART_COLORS_PROVIDER = ['#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5', '#7f1d1d', '#9a3412', '#c2410c', '#ea580c'];

    const ChartTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.[0]) return null;
        const data = payload[0].payload;
        const isProvider = data.receita !== undefined;
        return (
            <div className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-gray-700 min-w-[200px]">
                <p className="font-black text-gray-300 uppercase tracking-wider mb-2 text-[11px] border-b border-gray-700 pb-2">{data.fullName || label}</p>
                {isProvider ? (
                    <>
                        <p className="text-[12px] font-bold text-gray-300">Custo: <span className="text-red-400 font-black">{fmtBRL(data.valor)}</span></p>
                        <p className="text-[12px] font-bold text-gray-300">Receita vinculada: <span className="text-blue-400 font-black">{fmtBRL(data.receita)}</span></p>
                    </>
                ) : (
                    <>
                        <p className="text-[12px] font-bold text-gray-300">Receita: <span className="text-blue-400 font-black">{fmtBRL(data.valor)}</span></p>
                        <p className="text-[12px] font-bold text-gray-300">Custo: <span className="text-red-400 font-black">{fmtBRL(data.custo)}</span></p>
                    </>
                )}
                <div className="mt-2 pt-2 border-t border-gray-700 flex items-center justify-between">
                    <span className="text-[12px] font-bold text-gray-300">Lucro: <span className={`font-black ${data.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtBRL(data.lucro)}</span></span>
                    <span className={`text-[13px] font-black px-2 py-0.5 rounded-md ${data.pct >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{data.pct}%</span>
                </div>
                <p className="text-[10px] text-gray-500 font-bold mt-1.5">{data.count} missões</p>
            </div>
        );
    };

    const handlePrint = () => {
        const printArea = document.getElementById('print-area');
        if (!printArea) return;
        const printWindow = window.open('', '_blank', 'width=1400,height=900');
        if (!printWindow) { window.print(); return; }

        const cloned = printArea.cloneNode(true) as HTMLElement;

        cloned.style.cssText = 'width:100%;padding:0;margin:0;overflow:visible;border:none;box-shadow:none;border-radius:0;position:relative;';
        const scrollDiv = cloned.querySelector('.report-table-scroll') as HTMLElement;
        if (scrollDiv) {
            scrollDiv.style.cssText = 'overflow:visible;max-height:none;max-width:none;width:100%;border:none;border-radius:0;';
        }
        const table = cloned.querySelector('table') as HTMLElement;
        if (table) {
            table.style.cssText = 'table-layout:auto;width:100%;border-collapse:collapse;';
        }
        const colgroup = cloned.querySelector('colgroup');
        if (colgroup) colgroup.remove();

        cloned.querySelectorAll('thead th').forEach((th: any) => {
            const bg = th.style.backgroundColor;
            const fw = th.style.fontWeight;
            const tt = th.style.textTransform;
            const ta = th.style.textAlign;
            th.style.cssText = '';
            if (bg) th.style.backgroundColor = bg;
            if (fw) th.style.fontWeight = fw;
            if (tt) th.style.textTransform = tt;
            if (ta) th.style.textAlign = ta;
        });
        cloned.querySelectorAll('tbody td, tfoot td').forEach((td: any) => {
            const isRoute = td.classList.contains('route-cell');
            const bg = td.style.backgroundColor;
            const fw = td.style.fontWeight;
            const color = td.style.color;
            const ff = td.style.fontFamily;
            td.style.cssText = '';
            if (bg) td.style.backgroundColor = bg;
            if (fw) td.style.fontWeight = fw;
            if (color) td.style.color = color;
            if (ff && ff.includes('monospace')) td.style.fontFamily = 'monospace';
            if (isRoute) td.style.textAlign = 'left';
        });

        const headerEl = cloned.querySelector('.boletim-header') as HTMLElement;
        if (headerEl) headerEl.style.cssText = '';
        const h1El = cloned.querySelector('.boletim-header h1') as HTMLElement;
        if (h1El) h1El.style.cssText = 'font-weight:900;text-transform:uppercase;letter-spacing:1px;';
        const subEl = cloned.querySelector('.subtitle-line') as HTMLElement;
        if (subEl) subEl.style.cssText = 'font-weight:700;text-transform:uppercase;color:#374151;';
        const refEl = cloned.querySelector('.ref-line') as HTMLElement;
        if (refEl) refEl.style.cssText = 'font-weight:600;text-transform:uppercase;color:#6b7280;';

        const signSection = cloned.querySelector('.sign-section') as HTMLElement;
        if (signSection) signSection.style.cssText = '';
        cloned.querySelectorAll('.sign-box').forEach((el: any) => { el.style.cssText = 'text-align:center;'; });
        ['.digital-signature', '.sign-role', '.sign-cargo', '.sign-cnpj', '.sign-system', '.sign-cliente', '.sign-data'].forEach(sel => {
            const el = cloned.querySelector(sel) as HTMLElement;
            if (el) { const tt = el.style.textTransform; const c = el.style.color; el.style.cssText = ''; if (tt) el.style.textTransform = tt; if (c) el.style.color = c; }
        });

        const printCSS = `
            @page { size: A4 landscape; margin: 4mm 5mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            html, body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 7pt; color: #1f2937; }
            #print-content { width: 100%; }
            table { table-layout: auto; width: 100%; border-collapse: collapse; border: 1.5px solid #991b1b; }
            td, th {
                padding: 2px 4px;
                font-size: 7pt;
                border: 0.5px solid #e5c4c4;
                line-height: 1.3;
                white-space: nowrap;
                text-align: center;
                vertical-align: middle;
            }
            td.route-cell {
                white-space: normal;
                word-wrap: break-word;
                overflow-wrap: break-word;
                line-height: 1.25;
                font-size: 7pt;
                text-align: left;
                min-width: 110px;
                max-width: 200px;
                font-weight: 600;
            }
            thead { display: table-header-group; }
            tbody { display: table-row-group; }
            tfoot { display: table-footer-group; }
            tr { page-break-inside: avoid; break-inside: avoid; }
            tbody tr:nth-child(odd) { background-color: #ffffff; }
            tbody tr:nth-child(even) { background-color: #fef2f2; }
            .group-hdr th {
                font-size: 7.5pt;
                padding: 3px 4px;
                font-weight: 900;
                letter-spacing: 0.5px;
                border-bottom: 1.5px solid #7f1d1d;
                border-top: 1.5px solid #7f1d1d;
            }
            .sub-hdr th {
                font-size: 6.5pt;
                padding: 2.5px 3px;
                font-weight: 800;
                border-bottom: 1px solid #b91c1c;
                text-transform: uppercase;
            }
            .boletim-header {
                margin-bottom: 4mm;
                text-align: center;
                padding-bottom: 2mm;
                border-bottom: 1px solid #dc2626;
            }
            .boletim-header h1 { font-size: 14pt; margin: 0; color: #7f1d1d; }
            .subtitle-line { font-size: 9.5pt; margin: 1.5mm 0 0.5mm; color: #991b1b; }
            .ref-line { font-size: 7.5pt; margin: 0; color: #b91c1c; letter-spacing: 0.3px; }
            .watermark-logo { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.04; width: 120mm; height: 120mm; z-index: 0; pointer-events: none; }
            .watermark-logo img { width: 100%; height: 100%; object-fit: contain; }
            .sign-section {
                margin-top: 10mm;
                break-inside: avoid;
                page-break-inside: avoid;
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                padding: 0 10mm;
                border-top: 1px solid #dc2626;
                padding-top: 4mm;
            }
            .sign-box { width: 65mm; text-align: center; }
            .sign-logo { width: 10mm; height: 10mm; }
            .digital-signature { font-size: 14pt; font-family: 'Brush Script MT', 'Segoe Script', 'Dancing Script', cursive; font-weight: 700; color: #7f1d1d; line-height: 1; font-style: italic; letter-spacing: 0.5px; border-bottom: 1.5px solid #b91c1c; padding-bottom: 1px; display: inline-block; }
            .sign-role { font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #7f1d1d; letter-spacing: 0.8px; margin-top: 1mm; }
            .sign-cnpj { font-size: 6.5pt; color: #b91c1c; }
            .sign-system { font-size: 6.5pt; color: #dc2626; letter-spacing: 0.3px; }
            .sign-cliente { font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #7f1d1d; letter-spacing: 0.8px; }
            .sign-data { font-size: 7pt; color: #991b1b; margin-top: 1mm; }
            tfoot tr {
                break-inside: avoid;
                page-break-inside: avoid;
                border-top: 2px solid #7f1d1d;
            }
            tfoot td { font-size: 8pt; font-weight: 900; padding: 3px 5px; }
        `;

        const wrapper = printWindow.document.createElement('div');
        wrapper.id = 'print-content';
        wrapper.appendChild(cloned);

        printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Boletim de Medição</title><link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Inter:wght@400;600;700;800;900&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet"><style>${printCSS}</style></head><body></body></html>`);
        printWindow.document.body.appendChild(wrapper);
        printWindow.document.close();

        setTimeout(() => {
            const pageWidthPx = 1045;
            const tbl = printWindow.document.querySelector('table');
            if (tbl) {
                const naturalWidth = tbl.scrollWidth;
                if (naturalWidth > pageWidthPx) {
                    const scale = pageWidthPx / naturalWidth;
                    const zoomVal = Math.max(scale, 0.45);
                    wrapper.style.zoom = String(zoomVal);
                }
            }
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
                setTimeout(() => { printWindow.close(); }, 2000);
            }, 300);
        }, 600);
    };

    const fmtBRL = (val: number | null | undefined) => {
        const v = val ?? 0;
        return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    const fmtNum = (val: number | null | undefined, dec = 0) => (val ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
    const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '-';
    const fmtDateDisp = (s: string) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
    const fmtHHMM = (h: number) => {
        if (isNaN(h) || h <= 0) return '00:00';
        const hrs = Math.floor(h);
        const mins = Math.round((h - hrs) * 60);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };
    const fmtFranchiseHr = (h: number) => {
        if (!h || h <= 0) return '00:00';
        const hrs = Math.floor(h);
        const mins = Math.round((h - hrs) * 60);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    const parseBRLNumber = (s: string): number => {
        if (!s || s === '-') return 0;
        const clean = s.replace(/[R$\s]/g, '').trim();
        if (!clean) return 0;
        const hasDot = clean.includes('.');
        const hasComma = clean.includes(',');
        if (hasComma && hasDot) {
            if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
            return parseFloat(clean.replace(/,/g, '')) || 0;
        }
        if (hasComma) {
            const afterComma = clean.split(',').pop() || '';
            if (afterComma.length <= 2) return parseFloat(clean.replace(',', '.')) || 0;
            return parseFloat(clean.replace(/,/g, '')) || 0;
        }
        if (hasDot) {
            const afterDot = clean.split('.').pop() || '';
            if (afterDot.length === 3) return parseFloat(clean.replace(/\./g, '')) || 0;
            return parseFloat(clean) || 0;
        }
        return parseFloat(clean) || 0;
    };

    const clientData = clients.find(c => c.id.toString() === selectedClient);
    const displayClientName = clientData ? (clientData.trading_name || clientData.name) : '';
    const isCeslogBilling = (clientData?.name || '').toUpperCase().includes('CESLOG') || (clientData?.name || '').toUpperCase().includes('CESARI') || (clientData?.trading_name || '').toUpperCase().includes('CESLOG') || (clientData?.trading_name || '').toUpperCase().includes('CESARI');
    const isCevaBilling = (clientData?.name || '').toUpperCase().includes('CEVA') || (clientData?.trading_name || '').toUpperCase().includes('CEVA');
    const isDhlBilling = (clientData?.name || '').toUpperCase().includes('DHL') || (clientData?.trading_name || '').toUpperCase().includes('DHL');

    const getPeriodLabel = () => {
        if (!startDate || !endDate) return '';
        const sDate = new Date(startDate + 'T12:00:00');
        const months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
        const month = months[sDate.getMonth()];
        const year = sDate.getFullYear();
        const sDay = sDate.getDate();
        const eDate = new Date(endDate + 'T12:00:00');
        const eDay = eDate.getDate();
        const lastDayOfMonth = new Date(year, sDate.getMonth() + 1, 0).getDate();
        if (sDay === 1 && eDay === lastDayOfMonth) return `GERAL - ${month} /${year} - MÊS COMPLETO`;
        if (sDay === 1 && eDay === 15) return `GERAL - ${month} /${year} - 1ª QUINZENA DE ${month}`;
        if (sDay === 16) return `GERAL - ${month} /${year} - 2ª QUINZENA DE ${month}`;
        return `GERAL - ${month} /${year} - ${fmtDateDisp(startDate)} A ${fmtDateDisp(endDate)}`;
    };

    const hasFrozenMissions = useMemo(() => missions.some(m => m.snapshot_approved_by), [missions]);

    const rowsData = useMemo(() => {
        return missions.map(m => {
            const snap = m.snapshot_data;
            const hasValidSnapshot = !!(m.snapshot_approved_by && snap);

            if (hasValidSnapshot && snap) {
                const useBase = snap.activationFee ?? 0;
                const useKmEx = snap.kmExtraTotal ?? 0;
                const useHrEx = snap.hrExtraTotal ?? 0;
                const useToll = m.toll_value ?? snap.tollVal ?? 0;
                const dbRevenue = m.revenue_value ?? 0;
                const dbTotal = dbRevenue + Math.max(0, m.toll_value || 0);
                const wasManuallyEdited = !!(m.billing_verified_by || m.revenue_edit_reason);
                const snapTotal = snap.totalGeral ?? 0;
                const useTotal = wasManuallyEdited ? dbTotal : (snapTotal > 0 ? snapTotal : (useBase + useKmEx + useHrEx + useToll));

                // FALLBACK p/ snapshots legados: se franquia zerada mas há cálculo possível,
                // busca os dados da tabela real para exibição (totais financeiros permanecem congelados)
                let snapFranchiseHours = snap.franchiseHours ?? 0;
                let snapFranchiseKm = snap.franchiseKm ?? 0;
                let snapUnitHr = snap.unitHr ?? 0;
                let snapUnitKm = snap.unitKm ?? 0;
                let snapHrExtraQtd = snap.hrExtraQtd ?? 0;
                let snapKmExtraQtd = snap.kmExtraQtd ?? 0;
                let snapDurationHours = snap.durationHours ?? 0;

                if (snapFranchiseHours === 0 && snapFranchiseKm === 0 && snapUnitHr === 0 && snapUnitKm === 0) {
                    try {
                        const finFallback = calculateMissionFinancials(m, priceTables, providerTables, clientData, new Date());
                        const tblFallback = priceTables.find(t => t.id.toString() === finFallback.client.tableId);
                        if (tblFallback) {
                            snapFranchiseHours = tblFallback.franchise_hours ?? 0;
                            snapFranchiseKm = tblFallback.franchise_km ?? 0;
                            snapUnitHr = tblFallback.price_per_extra_hour ?? 0;
                            snapUnitKm = tblFallback.price_per_extra_km ?? 0;
                            snapHrExtraQtd = finFallback.client.excessHours ?? 0;
                            snapKmExtraQtd = finFallback.client.excessKm ?? 0;
                            snapDurationHours = finFallback.durationHours ?? 0;
                        }
                    } catch (e) { /* mantém zeros se falhar */ }
                }

                const isCancelledSnap = (m.status || '').toString().toLowerCase().includes('cancel');
                // OS executada e cancelada depois (hora de fim real) mostra KM real; só cancelada antes zera.
                const wasExecutedSnap = isCancelledSnap && !!m.end_time && !!m.start_time && new Date(m.end_time).getTime() > new Date(m.start_time).getTime();
                const cancelledBeforeSnap = isCancelledSnap && !wasExecutedSnap;
                const kmTotalRawSnap = (snap.kmTotal ?? 0) > 0 ? (snap.kmTotal ?? 0)
                    : ((m.start_km > 0 && m.end_km > 0 && m.end_km >= m.start_km) ? (m.end_km - m.start_km) : (m.total_distance || m.traveled_distance || 0));
                const kmTotal = cancelledBeforeSnap ? 0 : kmTotalRawSnap;
                // Sincroniza KM FRAN com a banda DHL do KM real, mesmo em snapshots congelados.
                if (isDhlBilling && kmTotal > 0) {
                    snapFranchiseKm = computeDhlBand(kmTotal);
                }

                const refCidades2 = snap.route || (() => {
                    const co = extractCityFromAddress(m.origin || '');
                    const cd = extractCityFromAddress(m.destination || '');
                    return co && cd ? `${co} X ${cd}` : co || cd || m.region || '-';
                })();

                return {
                    id: (m.id || '').replace('GTM-', ''),
                    route: refCidades2,
                    client: displayClientName,
                    activationFee: useBase,
                    franchiseHours: snapFranchiseHours,
                    franchiseKm: snapFranchiseKm,
                    unitHr: snapUnitHr,
                    unitKm: snapUnitKm,
                    tollLabel: 'À PARTE',
                    status: 'CONCLUÍDO',
                    missionStatus: m.status || 'Concluída',
                    // Mesmo com snapshot congelado, se a OS foi cancelada
                    // (ou voltou para algum status não-aprovado) ela NÃO
                    // pode aparecer como aprovada/verde no boletim.
                    isApproved: !!m.billing_approved,
                    startDate: fmtDate(m.start_time),
                    startTime: fmtTime(m.start_time),
                    viatura: m.company_vehicle?.plate || m.vehicle_id || '-',
                    cargoPlate: m._clientVehicle?.plate || '-',
                    endDate: fmtDate(m.end_time),
                    endTime: fmtTime(m.end_time),
                    kmStart: m.start_km ?? 0,
                    kmEnd: m.end_km ?? 0,
                    kmTotal,
                    timeStart: fmtTime(m.start_time),
                    timeEnd: fmtTime(m.end_time),
                    timeTotal: fmtHHMM(snapDurationHours),
                    kmExtraQtd: snapKmExtraQtd,
                    kmExtraUnit: snapUnitKm,
                    kmExtraTotal: useKmEx,
                    hrExtraQtd: snapHrExtraQtd,
                    hrExtraUnit: snapUnitHr,
                    hrExtraTotal: useHrEx,
                    escoltaVal: useBase,
                    tollVal: useToll,
                    totalGeral: useTotal,
                    franchiseHoursFmt: fmtFranchiseHr(snapFranchiseHours),
                    frozen: true,
                    frozenBy: m.snapshot_approved_by,
                    referenceNumber: m.reference_number || '',
                    seNumber: (m as any).dhl_se_number || '',
                    smNumber: (m as any).dhl_sm_number || '',
                    billingRelease: m.billing_release || '',
                    tipo: ((m.mission_type || '').toString().toUpperCase().includes('VELAD') ? 'PRONTA RESPOSTA' : 'CARACTERIZADA'),
                    providerName: m.provider || '',
                    originFull: m.origin || '',
                    destinationFull: m.destination || '',
                    originUf: extractUF(m.origin || ''),
                    destinationUf: extractUF(m.destination || ''),
                    operationTypeRaw: (m as any).operation_type || '',
                    rawStartTime: m.start_time || '',
                    rawEndTime: m.end_time || ''
                };
            }

            const tollVal = Math.max(0, m.toll_value || 0);
            const savedRevenue = m.revenue_value || 0;
            const hasSavedRevenue = savedRevenue > 0;

            const adj = billingAdjustments[m.id];
            const overrides = adj ? {
                clientTableId: adj.clientTableId || undefined,
                providerTableId: adj.providerTableId || undefined,
                customClientBase: adj.customClientBase ? Number(adj.customClientBase) : undefined,
                customClientUnitKm: adj.customClientKm ? Number(adj.customClientKm) : undefined,
                customClientUnitHour: adj.customClientHour ? Number(adj.customClientHour) : undefined,
                customProviderBase: adj.customProviderBase ? Number(adj.customProviderBase) : undefined,
                customProviderUnitKm: adj.customProviderKm ? Number(adj.customProviderKm) : undefined,
                customProviderUnitHour: adj.customProviderHour ? Number(adj.customProviderHour) : undefined,
            } : undefined;
            const fin = calculateMissionFinancials(m, priceTables, providerTables, clientData, new Date(), overrides);
            const usedTable = priceTables.find(t => t.id.toString() === fin.client.tableId);
            const franchiseHours = usedTable?.franchise_hours ?? 0;
            const activationFee = usedTable?.activation_fee ?? 0;
            const unitKm = usedTable?.price_per_extra_km ?? 0;
            const unitHr = usedTable?.price_per_extra_hour ?? 0;

            // OS Cancelada: KM = 0 (regra do negócio).
            const isCancelled = (m.status || '').toString().toLowerCase().includes('cancel');
            // OS executada e cancelada depois (tem hora de fim real posterior ao
            // início) cobra tempo real normalmente. Apenas o cancelamento ANTES da
            // execução zera as horas (início = fim = momento do cancelamento).
            const wasExecuted = isCancelled && !!m.end_time && !!m.start_time && new Date(m.end_time).getTime() > new Date(m.start_time).getTime();
            const cancelledBefore = isCancelled && !wasExecuted;
            const cancelEffTime = cancelledBefore
                ? resolveCancelledTime(m.start_time, m._cancelStatusAt)
                : null;
            const effStartTime = cancelledBefore ? (cancelEffTime || m.start_time || '') : (m.start_time || '');
            const effEndTime = cancelledBefore ? (cancelEffTime || m.start_time || '') : (m.end_time || '');
            const kmTotalRaw = fin.realTraveledKm > 0 ? fin.realTraveledKm 
                : ((m.start_km > 0 && m.end_km > 0 && m.end_km >= m.start_km) ? (m.end_km - m.start_km) : (m.total_distance || m.traveled_distance || 0));
            const kmTotal = cancelledBefore ? 0 : kmTotalRaw;
            // KM FRAN sincroniza com o KM real da OS (banda DHL = ceil((km-50)/100)*100).
            // Se a tabela aplicada estiver divergente da banda esperada, mostramos a banda
            // correspondente ao KM real — não o franchise da tabela aplicada.
            const tableFranchise = usedTable?.franchise_km ?? 0;
            const franchiseKm = (isDhlBilling && kmTotal > 0)
                ? computeDhlBand(kmTotal)
                : tableFranchise;
            const kmExtraQtd = fin.client.excessKm;
            const kmExtraTotal = fin.client.extraKmVal;
            const hrExtraQtd = fin.client.excessHours;
            const hrExtraTotal = fin.client.extraHrVal;
            const durationHours = fin.durationHours;

            const totalGeral = savedRevenue + tollVal;

            const cargoPlate = m._clientVehicle?.plate || '-';

            const cidadeOrigem = extractCityFromAddress(m.origin || '');
            const cidadeDestino = extractCityFromAddress(m.destination || '');
            const refCidades = cidadeOrigem && cidadeDestino
                ? `${cidadeOrigem} X ${cidadeDestino}`
                : cidadeOrigem || cidadeDestino || m.region || '-';

            return {
                id: (m.id || '').replace('GTM-', ''),
                route: refCidades,
                client: displayClientName,
                activationFee,
                franchiseHours,
                franchiseKm,
                unitHr,
                unitKm,
                tollLabel: 'À PARTE',
                status: 'CONCLUÍDO',
                missionStatus: m.status || 'Concluída',
                isApproved: !!m.billing_approved,
                startDate: fmtDate(effStartTime),
                startTime: fmtTime(effStartTime),
                viatura: m.company_vehicle?.plate || m.vehicle_id || '-',
                cargoPlate: m._clientVehicle?.plate || cargoPlate,
                endDate: fmtDate(effEndTime),
                endTime: fmtTime(effEndTime),
                kmStart: m.start_km ?? 0,
                kmEnd: m.end_km ?? 0,
                kmTotal,
                timeStart: fmtTime(effStartTime),
                timeEnd: fmtTime(effEndTime),
                timeTotal: cancelledBefore ? fmtHHMM(0) : fmtHHMM(durationHours),
                kmExtraQtd,
                kmExtraUnit: unitKm,
                kmExtraTotal,
                hrExtraQtd,
                hrExtraUnit: unitHr,
                hrExtraTotal,
                escoltaVal: activationFee,
                tollVal,
                totalGeral,
                franchiseHoursFmt: fmtFranchiseHr(franchiseHours),
                frozen: false,
                frozenBy: null as string | null,
                referenceNumber: m.reference_number || '',
                seNumber: (m as any).dhl_se_number || '',
                smNumber: (m as any).dhl_sm_number || '',
                billingRelease: m.billing_release || '',
                tipo: ((m.mission_type || '').toString().toUpperCase().includes('VELAD') ? 'PRONTA RESPOSTA' : 'CARACTERIZADA'),
                providerName: m.provider || '',
                originFull: m.origin || '',
                destinationFull: m.destination || '',
                originUf: extractUF(m.origin || ''),
                destinationUf: extractUF(m.destination || ''),
                operationTypeRaw: (m as any).operation_type || '',
                rawStartTime: effStartTime,
                rawEndTime: effEndTime
            };
        });
    }, [missions, priceTables, providerTables, clientData, displayClientName, billingAdjustments]);

    // DHL: diagnóstico de banda — verifica se a tabela aplicada corresponde
    // à faixa de KM real da OS. computeDhlBand(km) define a banda esperada
    // (100 / 200 / 300 / ...). Se r.franchiseKm divergir, gera aviso.
    const dhlBandWarnings = useMemo(() => {
        if (!isDhlBilling) return [] as Array<{ id: string; kmTotal: number; expected: number; actual: number }>;
        const out: Array<{ id: string; kmTotal: number; expected: number; actual: number }> = [];
        for (const r of rowsData) {
            if (!r.isApproved) continue; // só avalia OS aprovadas (não pendentes)
            const km = Number(r.kmTotal) || 0;
            const actual = Number(r.franchiseKm) || 0;
            if (km <= 0 || actual <= 0) continue;
            const expected = computeDhlBand(km);
            if (expected !== actual) {
                out.push({ id: r.id, kmTotal: km, expected, actual });
            }
        }
        return out;
    }, [rowsData, isDhlBilling]);
    const dhlWarningsById = useMemo(() => {
        const m = new Map<string, { expected: number; actual: number; kmTotal: number }>();
        dhlBandWarnings.forEach(w => m.set(w.id, { expected: w.expected, actual: w.actual, kmTotal: w.kmTotal }));
        return m;
    }, [dhlBandWarnings]);

    const grandTotal = useMemo(() => {
        return missions.reduce((s: number, m: any) => {
            const rev = m.revenue_value ?? 0;
            const toll = Math.max(0, m.toll_value || 0);
            return s + rev + toll;
        }, 0);
    }, [missions]);

    const [pendingRecompare, setPendingRecompare] = useState(false);

    const handlePasteCompare = useCallback(() => {
        if (!pasteText.trim() || rowsData.length === 0) return;
        const lines = pasteText.trim().split('\n').map(l => l.split('\t'));
        const sheetRows: any[] = [];
        const skipKw = ['TOTAL', 'BOLETIM', 'GERAL', 'REFERENTE', 'Nº', 'ROTA', 'TABELA', 'ACORDADA', 'INFORMAÇÕES', 'VALOR', 'PEDÁGIO', 'KILOMETRAGEM', 'HORÁRIOS', 'EXCEDENTE', 'VIAGEM'];
        const isHeader = (cols: string[]) => {
            const joined = cols.map(c => (c || '').trim().toUpperCase()).join(' ');
            return joined.includes('ROTA') && (joined.includes('TOTAL') || joined.includes('VALOR') || joined.includes('PEDÁGIO') || joined.includes('PEDAGIO'));
        };
        const extractOsFromVal = (val: string): string | null => {
            if (!val) return null;
            const clean = val.replace(/\D/g, '');
            if (clean.length >= 3 && clean.length <= 6) return clean;
            return null;
        };
        const isMissionStart = (cols: string[]) => {
            const val0 = (cols[0] || '').trim();
            if (extractOsFromVal(val0) && !skipKw.some(kw => val0.toUpperCase().includes(kw))) return true;
            const val1 = (cols[1] || '').trim();
            if (extractOsFromVal(val1) && !skipKw.some(kw => val1.toUpperCase().includes(kw))) return true;
            return false;
        };

        let colMap = { os: 0, franquiaKm: 8, kmTotal: 24, kmExtraRs: 32, hrExtra: 37, valorBase: 38, pedagio: 39, total: 42 };

        for (const cols of lines) {
            if (isHeader(cols)) {
                const upper = cols.map(c => (c || '').trim().toUpperCase());

                upper.forEach((h, i) => {
                    if (h === 'PEDÁGIO' || h === 'PEDAGIO') colMap.pedagio = i;
                    if (h === 'KM TOTAL' || h === 'KM_TOTAL' || h === 'KM RODADO' || h === 'KM PERCORRIDO') colMap.kmTotal = i;
                    if (h === 'KM EXTRA' || h === 'KM_EXTRA' || h === 'EXCEDENTE KM' || h === 'TOTAL KM EXTRA') colMap.kmExtraRs = i;
                    if (h === 'TOTAL' && upper[i-1]?.includes('VALOR')) colMap.hrExtra = i;
                    if (h === 'TOTAL HR EXTRA' || h === 'TOTAL HORA EXTRA' || h === 'TOTAL EXTRA HR' || h === 'TOTAL EXTRA') colMap.hrExtra = i;
                    if (h === 'HR EXTRA' || h === 'HR_EXTRA' || h === 'HORA EXTRA' || h === 'EXCEDENTE HR') {
                        if (!upper.some(u => u === 'TOTAL HR EXTRA' || u === 'TOTAL HORA EXTRA' || u === 'TOTAL EXTRA')) colMap.hrExtra = i;
                    }
                    if (h === 'VALOR' || h === 'VALOR BASE' || h === 'ACIONAMENTO') colMap.valorBase = i;
                    if (h === 'TOTAL CLIENTE' || h === 'TOTAL_CLIENTE' || h === 'TOTAL FINAL') colMap.total = i;
                    if (h === 'FRANQUIA' || h === 'FRANQUIA KM' || h === 'FR. KM') colMap.franquiaKm = i;
                });
                console.log('[ClientBillingReport] Header detectado, colMap final:', JSON.stringify(colMap), 'Headers:', upper.join(' | '));

                break;
            }
        }

        const missionGroups: string[][][] = [];
        let currentGroup: string[][] = [];

        for (const cols of lines) {
            if (isHeader(cols)) continue;
            if (isMissionStart(cols)) {
                if (currentGroup.length > 0) missionGroups.push(currentGroup);
                currentGroup = [cols];
            } else if (currentGroup.length > 0) {
                currentGroup.push(cols);
            }
        }
        if (currentGroup.length > 0) missionGroups.push(currentGroup);

        for (const group of missionGroups) {
            const firstCols = group[0];
            let id = extractOsFromVal((firstCols[colMap.os] || '').trim());
            if (!id) id = extractOsFromVal((firstCols[0] || '').trim());
            if (!id) id = extractOsFromVal((firstCols[1] || '').trim());
            if (!id) {
                console.log('[ClientBillingReport] OS não reconhecida, cols[0]:', (firstCols[0] || '').trim(), 'cols[1]:', (firstCols[1] || '').trim());
                continue;
            }

            let cols: string[];
            if (group.length === 1 && firstCols.length >= 10) {
                cols = firstCols;
            } else {
                const maxCols = Math.max(...group.map(g => g.length));
                cols = new Array(maxCols).fill('');
                for (let col = 0; col < maxCols; col++) {
                    for (const row of group) {
                        const val = (row[col] || '').trim();
                        if (val && !cols[col]) {
                            cols[col] = val;
                        }
                    }
                }
            }

            const route = (cols[1] || '').trim();
            const activationFee = parseBRLNumber(cols[colMap.valorBase] || '');
            const kmTotal = parseBRLNumber(cols[colMap.kmTotal] || '');
            const franquiaKmSheet = parseBRLNumber(cols[colMap.franquiaKm] || '');
            const kmExtraRaw = parseBRLNumber(cols[colMap.kmExtraRs] || '');
            const kmExtraTotal = (kmTotal > 0 && franquiaKmSheet > 0 && kmTotal <= franquiaKmSheet) ? 0 : kmExtraRaw;
            const hrExtraTotal = parseBRLNumber(cols[colMap.hrExtra] || '');
            const tollCol = parseBRLNumber(cols[colMap.pedagio] || '');
            const totalCol = parseBRLNumber(cols[colMap.total] || cols[cols.length - 1] || '');

            if (id === '4233') {
                console.log('[DEBUG OS 4233] totalCols:', cols.length);
                console.log('[DEBUG OS 4233] hrExtra idx:', colMap.hrExtra, 'raw:', cols[colMap.hrExtra], 'parsed:', hrExtraTotal);
                console.log('[DEBUG OS 4233] cols[34..42]:', cols.slice(34, 43).map((c: string, i: number) => `[${34+i}]=${c}`));
                console.log('[DEBUG OS 4233] group rows:', group.length);
            }

            sheetRows.push({ id, route, activationFee, startDate: '', endDate: '', kmTotal, kmExtraTotal, hrExtraTotal, tollCol, totalCol, raw: cols });
        }

        console.log('[ClientBillingReport] Parsing completo:', { totalLinhas: lines.length, gruposMissao: missionGroups.length, osExtraidas: sheetRows.length, osIds: sheetRows.map(r => r.id) });

        const missionDbMap = new window.Map<string, any>();
        missions.forEach((m: any) => {
            const numId = (m.id || '').replace(/\D/g, '');
            const rev = m.revenue_value ?? 0;
            const toll = Math.max(0, m.toll_value || 0);
            const isVerified = !!(m.billing_verified_by || m.billing_approved);
            const hasDbValue = rev > 0 || (rev === 0 && isVerified);
            missionDbMap.set(numId, { rev, toll, dbTotal: hasDbValue ? rev + toll : 0, hasDbValue });
        });

        const systemMap = new window.Map<string, any>();
        rowsData.forEach(r => {
            const numId = r.id.replace(/\D/g, '');
            const db = missionDbMap.get(numId);
            const correctedTotal = (db && db.hasDbValue) ? db.dbTotal : r.totalGeral;
            systemMap.set(numId, { ...r, totalGeral: correctedTotal });
        });
        console.log('[v048] Sistema IDs:', Array.from(systemMap.keys()));
        const sheetMap = new window.Map<string, any>();
        const seenSheetIds = new Set<string>();
        sheetRows.forEach(r => { if (!seenSheetIds.has(r.id)) { seenSheetIds.add(r.id); sheetMap.set(r.id, r); } });
        console.log('[v048] Planilha IDs:', Array.from(sheetMap.keys()));

        const matched: any[] = [];
        const divergences: any[] = [];
        const validated: any[] = [];
        const onlySystem: any[] = [];
        const onlySheet: any[] = [];

        systemMap.forEach((sys, id) => {
            const sheet = sheetMap.get(id);
            if (!sheet) { onlySystem.push(sys); return; }
            matched.push({ id, sys, sheet });

            const totalMatch = Math.abs(sys.totalGeral - sheet.totalCol) <= 5.00;
            if (totalMatch) {
                validated.push({ id, sys, sheet });
                return;
            }

            const fields: { label: string; sysVal: number; sheetVal: number; isCurrency: boolean; isDivergent: boolean }[] = [];
            const diffs: string[] = [];
            const addField = (label: string, sysV: number, sheetV: number, isCurrency: boolean, threshold: number) => {
                const isDivergent = Math.abs(sysV - sheetV) > threshold;
                fields.push({ label, sysVal: sysV, sheetVal: sheetV, isCurrency, isDivergent });
                if (isDivergent) {
                    diffs.push(isCurrency ? `${label}: Sistema R$ ${sysV.toFixed(2)} × Planilha R$ ${sheetV.toFixed(2)}` : `${label}: Sistema ${sysV.toFixed(0)} × Planilha ${sheetV.toFixed(0)}`);
                }
            };
            addField('Valor Base', sys.activationFee, sheet.activationFee, true, 0.02);
            addField('Pedágio', sys.tollVal, sheet.tollCol, true, 0.02);
            addField('KM Total', sys.kmTotal, sheet.kmTotal, false, 1);
            addField('KM Extra R$', sys.kmExtraTotal, sheet.kmExtraTotal, true, 0.02);
            addField('Hr Extra R$', sys.hrExtraTotal, sheet.hrExtraTotal, true, 0.02);
            addField('Total', sys.totalGeral, sheet.totalCol, true, 0.02);
            divergences.push({ id, diffs, fields, sysTot: sys.totalGeral, sheetTot: sheet.totalCol, sys, sheet });
        });
        sheetMap.forEach((sheet, id) => {
            if (!systemMap.has(id)) {
                console.log('[ClientBillingReport] OS da planilha sem match no sistema:', id, '| Coluna B raw:', sheet.raw?.[colMap.os] || '(vazio)');
                onlySheet.push(sheet);
            }
        });

        setPasteResult({ matched, onlySystem, onlySheet, divergences, validated });
    }, [pasteText, rowsData]);

    useEffect(() => {
        if (pendingRecompare && pasteText.trim() && rowsData.length > 0 && !pasteResult) {
            handlePasteCompare();
            setPendingRecompare(false);
        }
    }, [pendingRecompare, rowsData, pasteText, pasteResult, handlePasteCompare]);

    const fmtBRLExcel = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const handleExportExcel = useCallback(async () => {
        if (rowsData.length === 0) return;

        const { exportFormattedExcel } = await import('../exports/excel-export-template');

        const extraColOffset = (isCeslogBilling ? 1 : 0) + (isDhlBilling ? 2 : 0) + (isCevaBilling ? 1 : 0);

        const dataRows = rowsData.map(r => {
            const row: (string | number)[] = [r.id];
            if (isCeslogBilling) row.push(r.referenceNumber || '-');
            if (isDhlBilling) row.push(r.seNumber || '-');
            if (isDhlBilling) row.push(r.smNumber || '-');
            if (isCevaBilling) row.push(r.tipo || '-');
            row.push((r.missionStatus || '-').toUpperCase());
            row.push(
                r.route,
                r.activationFee,
                r.franchiseHoursFmt,
                r.franchiseKm > 0 ? fmtNum(r.franchiseKm) : '-',
                r.unitHr,
                r.unitKm,
                r.startDate,
                r.startTime,
                r.viatura,
                r.cargoPlate,
                r.endDate,
                r.endTime,
                r.kmStart > 0 ? fmtNum(r.kmStart) : '-',
                r.kmEnd > 0 ? fmtNum(r.kmEnd) : '-',
                r.kmTotal > 0 ? fmtNum(r.kmTotal) : '-',
                r.timeStart,
                r.timeEnd,
                r.timeTotal,
                r.kmExtraQtd > 0 ? fmtNum(r.kmExtraQtd) : '-',
                r.kmExtraQtd > 0 ? r.kmExtraUnit : '-',
                r.kmExtraTotal > 0 ? r.kmExtraTotal : 0,
                r.hrExtraQtd > 0 ? fmtHHMM(r.hrExtraQtd) : '-',
                r.hrExtraQtd > 0 ? r.hrExtraUnit : '-',
                r.hrExtraTotal > 0 ? r.hrExtraTotal : 0,
                r.tollVal > 0 ? r.tollVal : 0,
                r.totalGeral
            );
            return row;
        });

        const totalCols = 28 + extraColOffset;
        const totalRowData: (string | number)[] = Array(totalCols).fill('');
        totalRowData[0] = 'TOTAL';
        totalRowData[totalCols - 1] = grandTotal;

        const clientLabel = displayClientName || 'CLIENTE';
        const periodShort = startDate && endDate ? `${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}` : 'PERIODO';

        const headers: string[] = ['Nº'];
        if (isCeslogBilling) headers.push('REFERÊNCIA');
        if (isDhlBilling) headers.push('S.E.');
        if (isDhlBilling) headers.push('SM');
        if (isCevaBilling) headers.push('TIPO');
        headers.push('STATUS');
        headers.push(
            'ROTA', 'VALOR', 'HR FRANQ', 'KM FRANQ', 'HR EXTRA', 'KM EXTRA',
            'DATA INÍCIO', 'HORA INÍCIO', 'VIATURA', 'VEÍC. ESCOLTADO', 'DATA FIM', 'HORA FIM',
            'INICIAL', 'FINAL', 'TOTAL',
            'INICIAL', 'FINAL', 'TOTAL',
            'KM', 'VALOR', 'TOTAL',
            'HORA', 'VALOR', 'TOTAL',
            'PEDÁGIO', 'TOTAL'
        );

        // Larguras agora 100% automáticas (largura mínima = 5, máxima = 28
        // aplicadas pelo template). Mantemos só um piso para a coluna ROTA,
        // que costuma ter texto longo e merece um pouco mais de respiro.
        const colWidths: number[] = [];
        const routeColIdx = 3 + extraColOffset;
        colWidths[routeColIdx] = 22;

        const currBase = [3, 6, 7, 21, 22, 24, 25, 26, 27];
        const currencyColumns = currBase.map(c => c + extraColOffset);

        // Status por linha para colorir vermelho (cancelada) / verde (aprovada/concluída)
        const rowStatus = rowsData.map<'approved' | 'cancelled' | 'pending'>(r => {
            const s = (r.missionStatus || '').toLowerCase();
            if (s.startsWith('cancel')) return 'cancelled';
            if (r.isApproved) return 'approved';
            return 'pending';
        });

        await exportFormattedExcel({
            title: `BOLETIM DE MEDIÇÃO`,
            subtitle: `${getPeriodLabel()} — REFERENTE A INTERMEDIAÇÃO DE SEGURANÇA E MONITORAMENTO DE CARGAS`,
            headerGroups: [
                { label: 'TABELA ACORDADA', span: 8 + extraColOffset },
                { label: 'INFORMAÇÕES DA VIAGEM', span: 6 },
                { label: 'KILOMETRAGEM', span: 3 },
                { label: 'HORÁRIOS', span: 3 },
                { label: 'KM EXCEDENTE', span: 3 },
                { label: 'HORA EXCEDENTE', span: 3 },
                { label: 'VALORES', span: 2 },
            ],
            headers,
            colWidths,
            rows: dataRows,
            rowStatus,
            totalsRow: totalRowData,
            currencyColumns,
            fileName: `Boletim_${clientLabel.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)}_${periodShort}.xlsx`,
            sheetName: 'Boletim',
            companyName: 'GRUPO TM SEG',
            companyCnpj: '28.804.378/0001-67',
            footerLeft: 'DOCUMENTO GERADO ELETRONICAMENTE PELO GRUPO TM SEG',
            footerRight: 'ASSINATURA / CARIMBO CLIENTE',
        });
    }, [rowsData, grandTotal, displayClientName, startDate, endDate, isCeslogBilling, isCevaBilling, isDhlBilling]);

    const handleExportDhlFaturamento = useCallback(async () => {
        if (rowsData.length === 0) return;
        const { exportDhlFaturamento, downloadBlob } = await import('../exports/dhl-faturamento-export');

        const periodoLabel = (() => {
            if (!startDate || !endDate) return getPeriodLabel();
            const [ya, ma, da] = startDate.split('-');
            const [yb, mb, db] = endDate.split('-');
            return `${da}/${ma} A ${db}/${mb}/${(yb || '').slice(2)}`;
        })();

        const fmtDT = (iso: string) => {
            if (!iso) return '';
            const d = new Date(iso);
            const dd = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const hh = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });
            return `${dd} ${hh}`;
        };
        const fmtHMS = (totalH: number) => {
            const sec = Math.max(0, Math.round(totalH * 3600));
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };
        const fmtFrancHr = (h: number) => {
            if (!h || h <= 0) return '';
            return fmtHMS(h);
        };
        const buildDescricao = (r: any): string => {
            const opType = (r.operationTypeRaw || '').toString().toUpperCase();
            if (opType.includes('PRESERV')) return 'PRESERVAÇÃO';
            if (opType.includes('URBAN')) return 'URBANO';
            if (opType.includes('PONTA')) return 'PONTA A PONTA';
            if (r.franchiseKm > 0) return `RAIO-${r.franchiseKm}KM`;
            return opType || '-';
        };

        const rows = rowsData.map(r => {
            const isCancel = (r.missionStatus || '').toLowerCase().startsWith('cancel');
            // OS executada e cancelada depois cobra normalmente; só cancelada antes da execução zera.
            const wasExecutedRow = isCancel && !!r.rawEndTime && !!r.rawStartTime && new Date(r.rawEndTime).getTime() > new Date(r.rawStartTime).getTime();
            const cancelledBeforeRow = isCancel && !wasExecutedRow;
            const startDt = fmtDT(r.rawStartTime);
            const endDt = fmtDT(r.rawEndTime);
            let totalH = 0;
            if (r.rawStartTime && r.rawEndTime) {
                totalH = (new Date(r.rawEndTime).getTime() - new Date(r.rawStartTime).getTime()) / 3600000;
                if (totalH < 0) totalH = 0;
            }
            return {
                ciaEscolta: (r.providerName || '').toUpperCase(),
                periodo: periodoLabel,
                operacao: (displayClientName || 'DHL').toUpperCase(),
                cancelada: isCancel ? 'SIM' : 'NÃO',
                descricao: cancelledBeforeRow ? '' : buildDescricao(r),
                seNumber: r.seNumber || '',
                smNumber: r.smNumber || '',
                osNumber: r.id || '',
                placaViatura: r.viatura && r.viatura !== '-' ? r.viatura : '',
                placaVeiculo: r.cargoPlate && r.cargoPlate !== '-' ? r.cargoPlate : '',
                origem: r.originFull || '',
                ufOrigem: r.originUf || '',
                destino: r.destinationFull || '',
                ufDestino: r.destinationUf || '',
                kmInicio: cancelledBeforeRow ? 0 : (r.kmStart || 0),
                kmFinal: cancelledBeforeRow ? 0 : (r.kmEnd || 0),
                kmTotal: r.kmTotal || 0,
                franquiaKm: r.franchiseKm || 0,
                kmExcedente: r.kmExtraQtd || 0,
                kmDeslocamento: 0,
                horaInicio: startDt,
                horaFinal: endDt,
                horaTotal: totalH > 0 ? fmtHMS(totalH) : '00:00:00',
                franquiaHr: fmtFrancHr(r.franchiseHours || 0),
                horaExcedente: r.hrExtraQtd > 0 ? fmtHMS(r.hrExtraQtd) : '00:00:00',
                vlrHoraExcedenteTab: r.hrExtraUnit || 0,
                vlrKmExcedenteTab: r.kmExtraUnit || 0,
                vlrTotalHoraExcedente: r.hrExtraTotal || 0,
                vlrTotalKmExcedidos: r.kmExtraTotal || 0,
                vlrDeslocamento: 0,
                franquiaTabela: cancelledBeforeRow ? 0 : (r.activationFee || 0),
                pedagio: r.tollVal || 0,
                totalFornecedor: cancelledBeforeRow ? 0 : (r.totalGeral || 0),
            } as any;
        });

        const periodShort = startDate && endDate ? `${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}` : 'PERIODO';
        const fileName = `RELATORIO_DHL_FATURAMENTO_${periodShort}.xlsx`;
        const blob = await exportDhlFaturamento({ periodLabel: periodoLabel, rows, fileName });
        downloadBlob(blob, fileName);
    }, [rowsData, startDate, endDate, displayClientName]);

    // =====================================================================
    // PREENCHIMENTO DE PLANILHA-MODELO DHL POR Nº SE
    // ---------------------------------------------------------------------
    // O usuario sobe uma planilha (virgem) contendo os numeros de SE. Para
    // cada SE, buscamos a OS em TODO o sistema (qualquer data), calculamos os
    // valores com o mesmo motor financeiro e geramos a planilha preenchida no
    // mesmo formato do modelo, porem sem cores e com as formulas do cliente.
    // =====================================================================
    const [fillingSheet, setFillingSheet] = useState(false);

    const handleFillDhlSheet = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xlsb,.xls,.csv';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            setFillingSheet(true);
            try {
                const XLSX = await import('xlsx');
                const buf = await file.arrayBuffer();
                const wbIn = XLSX.read(buf, { type: 'array' });
                const sheet = wbIn.Sheets[wbIn.SheetNames[0]];
                const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });

                // Localiza a coluna do NUMERO da SE. O cabecalho pode nao estar
                // na 1a linha (o relatorio operacional do cliente tem titulo nas
                // linhas 1-4 e cabecalho na linha 5) e a planilha pode ter outras
                // colunas que contem "SE" (ex.: "Tipo SE", "Descricao SE") — por
                // isso aceitamos apenas variantes do NUMERO da SE ("N. da SE",
                // "Nº SE", "Numero SE" etc.).
                const normHdr = (raw: any) => (raw ?? '').toString().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
                const isSeNumberHeader = (raw: any) => {
                    const t = normHdr(raw);
                    if (!t) return false;
                    if (t === 'SE') return true;
                    const hasSe = /\bSE\b/.test(t);
                    const isNumber = /^N\b/.test(t) || /\bNUMERO\b/.test(t) || /\bNUM\b/.test(t) || /\bNRO\b/.test(t);
                    const banned = /(TIPO|DESCRI|EMAIL|ENVIO|CANCEL|OBSERV)/.test(t);
                    return hasSe && isNumber && !banned;
                };
                let seCol = -1;
                let headerRowIdx = -1;
                for (let r = 0; r < Math.min(matrix.length, 20); r++) {
                    const rowArr = matrix[r] || [];
                    for (let c = 0; c < rowArr.length; c++) {
                        if (isSeNumberHeader(rowArr[c])) { seCol = c; headerRowIdx = r; break; }
                    }
                    if (seCol >= 0) break;
                }

                const seSet = new Set<string>();
                const onlyDigits = (v: any) => (v ?? '').toString().replace(/\D/g, '');
                if (seCol >= 0) {
                    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
                        const v = onlyDigits((matrix[r] || [])[seCol]);
                        if (v) seSet.add(v);
                    }
                } else {
                    // Fallback: varre toda a planilha por numeros de 5-7 digitos (formato tipico de SE).
                    for (let r = 0; r < matrix.length; r++) {
                        for (const cell of (matrix[r] || [])) {
                            const v = onlyDigits(cell);
                            if (v.length >= 5 && v.length <= 7) seSet.add(v);
                        }
                    }
                }

                // Captura, por SE, a Situacao (coluna Q da planilha importada) e a
                // Descricao SE (coluna G) para preencher as colunas D e E da saida,
                // e o periodo do relatorio (linha de titulo "Periodo: ...").
                const findImportCol = (re: RegExp, fallback: number) => {
                    if (headerRowIdx < 0) return fallback;
                    const hdr = matrix[headerRowIdx] || [];
                    for (let c = 0; c < hdr.length; c++) { if (re.test(normHdr(hdr[c]))) return c; }
                    return fallback;
                };
                const situacaoCol = findImportCol(/\bSITUAC/, 16);   // coluna Q
                const descricaoCol = findImportCol(/DESCRI.*\bSE\b/, 6); // coluna G
                let periodLabel = '';
                for (let r = 0; r < Math.min(matrix.length, 20); r++) {
                    const txt = ((matrix[r] || [])[0] ?? '').toString();
                    const mm = txt.match(/per[íi]odo:\s*(.+)$/i);
                    if (mm) { periodLabel = mm[1].trim(); break; }
                }
                const seInfo = new Map<string, { situacao: string; descricao: string }>();
                if (seCol >= 0) {
                    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
                        const k = onlyDigits((matrix[r] || [])[seCol]);
                        if (!k || seInfo.has(k)) continue;
                        seInfo.set(k, {
                            situacao: ((matrix[r] || [])[situacaoCol] ?? '').toString().trim(),
                            descricao: ((matrix[r] || [])[descricaoCol] ?? '').toString().trim(),
                        });
                    }
                }

                const seList = Array.from(seSet);
                if (seList.length === 0) {
                    alert('Não encontrei nenhum número de SE na planilha enviada. Verifique se há uma coluna com o título "Nº SE".');
                    return;
                }

                // Busca as OS por dhl_se_number em todo o sistema (qualquer data), em lotes.
                const chunk = <T,>(arr: T[], size: number) => {
                    const out: T[][] = [];
                    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
                    return out;
                };
                let foundMissions: any[] = [];
                for (const batch of chunk(seList, 100)) {
                    const { data, error } = await supabase
                        .from('missions')
                        .select('*, company_vehicle:vehicles(*)')
                        .in('dhl_se_number', batch);
                    if (error) throw error;
                    if (data) foundMissions = foundMissions.concat(data);
                }

                // Regra: OS "Recusada" NÃO entra no boletim. Se uma SE tiver uma OS
                // recusada e outra concluída/cancelada, sobra apenas a não-recusada
                // (prioriza a válida). Se a SE só tiver recusada, ela cai em "não
                // encontrada" e fica em branco para o funcionário tratar. Ex.: SE 179209.
                foundMissions = foundMissions.filter(
                    m => !(m.status || '').toString().toLowerCase().includes('recus')
                );

                // Enriquece com veiculo do cliente.
                const cvIds = [...new Set(foundMissions.map(m => m.client_vehicle).filter(Boolean))];
                const cvMap: Record<string, any> = {};
                if (cvIds.length > 0) {
                    const { data: cvData } = await supabase.from('client_vehicles').select('id, plate, model, brand, color').in('id', cvIds);
                    if (cvData) cvData.forEach((v: any) => { cvMap[v.id.toString()] = v; });
                }
                foundMissions = foundMissions.map(m => ({ ...m, _clientVehicle: m.client_vehicle ? cvMap[m.client_vehicle.toString()] : null }));

                // Regra de OS cancelada: busca o momento em que o status virou
                // "Cancelada" (mission_history) para zerar as horas na planilha.
                const fillCancelledIds = foundMissions
                    .filter(m => (m.status || '').toString().toLowerCase().includes('cancel'))
                    .map(m => m.id)
                    .filter(Boolean);
                const fillCancelTimeMap: Record<string, string> = {};
                if (fillCancelledIds.length > 0) {
                    try {
                        const { data: histRows } = await supabase
                            .from('mission_history')
                            .select('mission_id, changed_at, new_value')
                            .in('mission_id', fillCancelledIds)
                            .eq('field_name', 'status')
                            .order('changed_at', { ascending: true });
                        if (histRows) {
                            for (const h of histRows as any[]) {
                                if ((h.new_value || '').toString().toLowerCase().includes('cancel')) {
                                    fillCancelTimeMap[h.mission_id] = h.changed_at;
                                }
                            }
                        }
                    } catch {}
                }

                // Tabelas de preco/custo do cliente DHL para o motor financeiro.
                const dhlClient = clients.find(c => (c.name || '').toUpperCase().includes('DHL') || (c.trading_name || '').toUpperCase().includes('DHL')) || clientData;
                const dhlClientName = dhlClient ? (dhlClient.name || dhlClient.trading_name || 'DHL') : 'DHL';
                const [ptRes, pctRes] = await Promise.all([
                    supabase.from('client_price_tables').select('*').or(clientFuzzyFilter(dhlClientName)),
                    supabase.from('provider_cost_tables').select('*'),
                ]);
                const fillPriceTables = (ptRes.data || priceTables) as any[];
                const fillProviderTables = (pctRes.data || providerTables) as any[];

                // Indexa por SE. Quando houver MAIS de uma OS para a mesma SE,
                // escolhe de forma deterministica (prioriza nao-cancelada e a
                // de start_time mais recente) e registra a SE duplicada para
                // avisar o usuario — evita preencher silenciosamente com a OS errada.
                const bySe = new Map<string, any>();
                const duplicatedSe = new Set<string>();
                foundMissions.forEach(m => {
                    const k = onlyDigits((m as any).dhl_se_number);
                    if (!k) return;
                    const prev = bySe.get(k);
                    if (!prev) { bySe.set(k, m); return; }
                    duplicatedSe.add(k);
                    const isCancel = (x: any) => (x.status || '').toString().toLowerCase().includes('cancel');
                    const t = (x: any) => new Date(x.start_time || 0).getTime();
                    // Prefere a finalizada; em empate, a mais recente.
                    if ((isCancel(prev) && !isCancel(m)) || (isCancel(prev) === isCancel(m) && t(m) > t(prev))) {
                        bySe.set(k, m);
                    }
                });

                const monthLabel = (iso: string) => {
                    if (!iso) return '';
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) return '';
                    return d.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' }).toUpperCase();
                };
                const buildDescricao = (opType: string, franchiseKm: number): string => {
                    const o = (opType || '').toUpperCase();
                    if (o.includes('PRESERV')) return 'PRESERVAÇÃO';
                    if (o.includes('URBAN')) return 'URBANO';
                    if (o.includes('PONTA')) return 'PONTA A PONTA';
                    if (franchiseKm > 0) return `RAIO-${franchiseKm}KM`;
                    return o || '-';
                };

                const rows: any[] = [];
                const notFound: string[] = [];
                for (const se of seList) {
                    const m = bySe.get(se);
                    if (!m) { notFound.push(se); continue; }
                    const isCancel = (m.status || '').toString().toLowerCase().includes('cancel');
                    // OS executada e cancelada depois cobra tempo real; só cancelada
                    // ANTES da execução zera (início = fim = momento do cancelamento).
                    const wasExecutedFill = isCancel && !!m.end_time && !!m.start_time && new Date(m.end_time).getTime() > new Date(m.start_time).getTime();
                    const cancelledBeforeFill = isCancel && !wasExecutedFill;
                    const cancelEff = cancelledBeforeFill ? resolveCancelledTime(m.start_time, fillCancelTimeMap[m.id]) : null;
                    const rowStart = cancelledBeforeFill ? (cancelEff || m.start_time || '') : (m.start_time || '');
                    const rowEnd = cancelledBeforeFill ? (cancelEff || m.start_time || '') : (m.end_time || '');
                    const fin = calculateMissionFinancials(m as any, fillPriceTables as any, fillProviderTables as any, dhlClient as any, new Date());
                    const usedTable = fillPriceTables.find((t: any) => t.id.toString() === fin.client.tableId);
                    const franchiseHours = usedTable?.franchise_hours ?? 0;
                    const activationFee = usedTable?.activation_fee ?? 0;
                    const unitKm = usedTable?.price_per_extra_km ?? 0;
                    const unitHr = usedTable?.price_per_extra_hour ?? 0;
                    const kmTotalRaw = fin.realTraveledKm > 0 ? fin.realTraveledKm
                        : ((m.start_km > 0 && m.end_km > 0 && m.end_km >= m.start_km) ? (m.end_km - m.start_km) : (m.total_distance || m.traveled_distance || 0));
                    const kmTotal = cancelledBeforeFill ? 0 : kmTotalRaw;
                    const franchiseKm = kmTotal > 0 ? computeDhlBand(kmTotal) : (usedTable?.franchise_km ?? 0);
                    const imp = seInfo.get(se);
                    rows.push({
                        ciaEscolta: 'TM SEG',
                        periodo: periodLabel || monthLabel(m.start_time),
                        operacao: 'DHL',
                        cancelada: (imp?.situacao || (isCancel ? 'CANCELADA' : 'FINALIZADA')).toUpperCase(),
                        descricao: imp?.descricao || (cancelledBeforeFill ? '' : buildDescricao((m as any).operation_type || '', franchiseKm)),
                        seNumber: se,
                        smNumber: (m as any).dhl_sm_number || '',
                        osNumber: (m.id || '').toString().replace('GTM-', ''),
                        placaViatura: (m.company_vehicle?.plate && m.company_vehicle.plate !== '-') ? m.company_vehicle.plate : (m.vehicle_id || ''),
                        placaVeiculo: (m._clientVehicle?.plate && m._clientVehicle.plate !== '-') ? m._clientVehicle.plate : '',
                        origem: m.origin || '',
                        ufOrigem: extractUF(m.origin || ''),
                        destino: m.destination || '',
                        ufDestino: extractUF(m.destination || ''),
                        kmInicio: cancelledBeforeFill ? 0 : (m.start_km || 0),
                        kmFinal: cancelledBeforeFill ? 0 : (m.end_km || 0),
                        franquiaKm: franchiseKm || 0,
                        kmDeslocamento: 0,
                        rawStart: rowStart,
                        rawEnd: rowEnd,
                        franquiaHrDays: franchiseHours > 0 ? franchiseHours / 24 : 0,
                        vlrHoraExcedenteTab: unitHr || 0,
                        vlrKmExcedenteTab: unitKm || 0,
                        franquiaTabela: cancelledBeforeFill ? 0 : (activationFee || 0),
                        pedagio: Math.max(0, m.toll_value || 0),
                    });
                }

                if (rows.length === 0) {
                    alert(`Nenhuma das ${seList.length} SE(s) da planilha foi encontrada no sistema.`);
                    return;
                }

                const { exportDhlFaturamentoFilled, downloadBlob } = await import('../exports/dhl-faturamento-export');
                const blob = await exportDhlFaturamentoFilled({ rows });
                const fileName = `PLANILHA_DHL_PREENCHIDA_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
                downloadBlob(blob, fileName);

                const avisos: string[] = [`Planilha preenchida com ${rows.length} SE(s).`];
                if (notFound.length > 0) {
                    avisos.push(`\n${notFound.length} SE(s) não encontrada(s) no sistema:\n${notFound.join(', ')}`);
                }
                if (duplicatedSe.size > 0) {
                    avisos.push(`\nAtenção: ${duplicatedSe.size} SE(s) com mais de uma OS no sistema (usei a finalizada/mais recente):\n${Array.from(duplicatedSe).join(', ')}`);
                }
                if (notFound.length > 0 || duplicatedSe.size > 0) {
                    alert(avisos.join('\n'));
                }
            } catch (err: any) {
                console.error('[FillDhlSheet] erro:', err);
                alert('Erro ao preencher a planilha: ' + (err?.message || err));
            } finally {
                setFillingSheet(false);
            }
        };
        input.click();
    }, [clients, clientData, priceTables, providerTables]);

    const cellStyle: React.CSSProperties = {
        border: '1px solid #e5c4c4',
        padding: '8px 9px',
        fontSize: '16px',
        fontFamily: "'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        textAlign: 'center',
        whiteSpace: 'nowrap',
        color: '#1f2937',
        lineHeight: '1.35',
        letterSpacing: '0.3px',
        WebkitPrintColorAdjust: 'exact' as any,
        printColorAdjust: 'exact' as any,
    };
    const cellRight: React.CSSProperties = { ...cellStyle, textAlign: 'right' };
    const cellBold: React.CSSProperties = { ...cellStyle, fontWeight: 800, color: '#111827' };
    const cellMono: React.CSSProperties = { ...cellStyle, fontFamily: "'Roboto Mono', 'Courier New', monospace" };
    const cellMonoBold: React.CSSProperties = { ...cellMono, fontWeight: 800, color: '#111827' };
    const headerStyle: React.CSSProperties = {
        ...cellStyle,
        backgroundColor: '#fecaca',
        fontWeight: 900,
        fontSize: '14px',
        textTransform: 'uppercase' as const,
        color: '#7f1d1d',
        padding: '7px 8px',
    };
    const groupHeaderStyle: React.CSSProperties = {
        ...headerStyle,
        backgroundColor: '#b91c1c',
        color: '#ffffff',
        fontSize: '15px',
        letterSpacing: '0.3px',
        padding: '6px 5px',
    };

    const bgKm = '#fff5f5';
    const bgHr = '#fef2f2';
    const bgKmExc = '#fff1f2';
    const bgHrExc = '#ffe4e6';
    const bgVal = '#fce7e7';

    const hdrKm: React.CSSProperties = { ...headerStyle, backgroundColor: '#fca5a5' };
    const hdrHr: React.CSSProperties = { ...headerStyle, backgroundColor: '#fecdd3' };
    const hdrKmExc: React.CSSProperties = { ...headerStyle, backgroundColor: '#fda4af' };
    const hdrHrExc: React.CSSProperties = { ...headerStyle, backgroundColor: '#fb7185' };
    const hdrVal: React.CSSProperties = { ...headerStyle, backgroundColor: '#f87171', color: '#fff' };

    const grpKm: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: '#dc2626' };
    const grpHr: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: '#c53030' };
    const grpKmExc: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: '#b91c1c' };
    const grpHrExc: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: '#991b1b' };
    const grpVal: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: '#7f1d1d' };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => { resolve((reader.result as string).split(',')[1]); };
            reader.onerror = error => reject(error);
        });
    };

    const compressImage = async (file: File, maxWidth = 1200): Promise<{ blob: Blob; base64: string }> => {
        return new Promise((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = Math.min(maxWidth / img.width, 1);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    if (!blob) { reject('Erro ao comprimir'); return; }
                    const reader = new FileReader();
                    reader.onload = () => resolve({ blob, base64: (reader.result as string).split(',')[1] });
                    reader.readAsDataURL(blob);
                }, 'image/jpeg', 0.8);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    };

    const handleNfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setNfFile(file);
        setNfPreview(URL.createObjectURL(file));
    };

    const handleBoletoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBoletoFile(file);
        setBoletoPreview(URL.createObjectURL(file));
    };

    const analyzeDocumentsWithAI = async () => {
        if (!nfFile && !boletoFile) { alert('Anexe pelo menos a foto da NF ou do Boleto.'); return; }
        setAiAnalyzing(true);
        setAiStatus('Preparando documentos para análise...');
        try {
            const parts: any[] = [];
            if (nfFile) {
                setAiStatus('Processando imagem da NF...');
                const nfB64 = nfFile.type === 'application/pdf' ? await fileToBase64(nfFile) : (await compressImage(nfFile)).base64;
                parts.push({ inlineData: { mimeType: nfFile.type || 'image/jpeg', data: nfB64 } });
            }
            if (boletoFile) {
                setAiStatus('Processando imagem do Boleto...');
                const bolB64 = boletoFile.type === 'application/pdf' ? await fileToBase64(boletoFile) : (await compressImage(boletoFile)).base64;
                parts.push({ inlineData: { mimeType: boletoFile.type || 'image/jpeg', data: bolB64 } });
            }

            const clientNames = clients.map(c => c.trading_name || c.name).join(', ');

            parts.push({ text: `Analise os documentos fiscais brasileiros anexados (Nota Fiscal e/ou Boleto Bancário).
Extraia as seguintes informações:

1. "nf_number": Número da Nota Fiscal (ex: "001234", "NF-e 12345"). Se não encontrar, retorne "".
2. "client_name": Nome do CLIENTE / TOMADOR / DESTINATÁRIO da NF. O cliente é quem RECEBE o serviço. Compare com a lista de clientes cadastrados: [${clientNames}]. Se encontrar correspondência, use o nome exato da lista. Se não encontrar, retorne o nome encontrado na NF.
3. "provider_name": Nome do FORNECEDOR / PRESTADOR que emitiu a NF (quem prestou o serviço).
4. "issuer_company": Nome/Razão Social da EMPRESA EMISSORA (a empresa que gerou a Nota Fiscal).
5. "amount": Valor total da NF em número decimal (ex: 15000.50). Se não encontrar, retorne 0.
6. "nf_date": Data de emissão da NF no formato YYYY-MM-DD. Se não encontrar, retorne "".
7. "boleto_due_date": Data de VENCIMENTO do boleto no formato YYYY-MM-DD. Se não encontrar, retorne "".
8. "boleto_amount": Valor do boleto em número decimal. Se não encontrar, use o valor da NF.

Retorne SOMENTE um JSON puro com esses campos. Sem explicações.` });

            setAiStatus('IA analisando documentos...');

            const rawText = await generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            nf_number: { type: "STRING" },
                            client_name: { type: "STRING" },
                            provider_name: { type: "STRING" },
                            issuer_company: { type: "STRING" },
                            amount: { type: "NUMBER" },
                            nf_date: { type: "STRING" },
                            boleto_due_date: { type: "STRING" },
                            boleto_amount: { type: "NUMBER" },
                        },
                        required: ["nf_number", "client_name", "provider_name", "issuer_company", "amount", "nf_date", "boleto_due_date", "boleto_amount"]
                    }
                }
            });

            if (!rawText) throw new Error('IA não retornou dados.');
            const parsed = JSON.parse(rawText);
            setAiStatus('Dados extraídos! Preenchendo formulário...');

            const matchedClient = clients.find(c =>
                (c.trading_name || c.name).toLowerCase().includes(parsed.client_name?.toLowerCase() || '') ||
                (parsed.client_name || '').toLowerCase().includes((c.trading_name || c.name).toLowerCase())
            );

            setInvoiceForm(prev => ({
                ...prev,
                number: parsed.nf_number || prev.number,
                client: matchedClient?.id?.toString() || prev.client,
                amount: parsed.amount ? parsed.amount.toString() : (parsed.boleto_amount ? parsed.boleto_amount.toString() : prev.amount),
                date: parsed.nf_date || prev.date,
                provider: parsed.provider_name || prev.provider,
                issuer_company: parsed.issuer_company || prev.issuer_company,
                boleto_due_date: parsed.boleto_due_date || prev.boleto_due_date,
            }));
            setTimeout(() => setAiStatus(''), 3000);
        } catch (err: any) {
            console.error('[AI Doc Analysis]', err);
            setAiStatus(`Erro na análise: ${err.message}`);
            setTimeout(() => setAiStatus(''), 5000);
        } finally {
            setAiAnalyzing(false);
        }
    };

    const uploadDocImage = async (file: File, prefix: string): Promise<string> => {
        const ts = Date.now();
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `invoices/${prefix}_${ts}.${ext}`;
        let uploadFile: Blob = file;
        if (file.type.startsWith('image/')) {
            const compressed = await compressImage(file);
            uploadFile = compressed.blob;
        }
        const { error } = await supabase.storage.from('mission-evidence').upload(path, uploadFile, { upsert: true });
        if (error) { console.error('[Upload]', error); return ''; }
        const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(path);
        return urlData.publicUrl || '';
    };

    const getQuinzenaRef = (dateStr: string, clientName: string): string => {
        const d = new Date(dateStr + 'T12:00:00');
        const day = d.getDate();
        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const month = monthNames[d.getMonth()];
        const year = d.getFullYear();
        const quinzena = day <= 15 ? 'Primeira' : 'Segunda';
        return `Ref. ${quinzena} Quinzena de ${month}/${year} - ${clientName}`;
    };

    const resetInvoiceForm = () => {
        setInvoiceForm({ client: '', number: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '', provider: '', issuer_company: '', boleto_due_date: '' });
        setNfFile(null);
        setBoletoFile(null);
        setNfPreview('');
        setBoletoPreview('');
        setAsaasSplitMode(false);
        setAsaasSplitCharges([]);
        setAiStatus('');
        setAsaasResult(null);
    };

    const saveMedicaoEmailToClient = async (clientId: string, email: string) => {
        try {
            const clientObj = clients.find(c => c.id.toString() === clientId);
            const existing = (clientObj as any)?.medicao_email || '';
            const emailList = existing ? existing.split(',').map((e: string) => e.trim()).filter(Boolean) : [];
            if (!emailList.includes(email.trim().toLowerCase())) {
                emailList.push(email.trim().toLowerCase());
            }
            const newVal = emailList.join(', ');
            const { error } = await supabase.from('clients').update({ medicao_email: newVal }).eq('id', parseInt(clientId));
            if (error) {
                console.error('Erro ao salvar e-mail medição:', error);
                alert('Erro ao salvar e-mail de medição: ' + error.message);
            }
        } catch (err) {
            console.error('Erro ao salvar e-mail medição:', err);
        }
    };

    const autoSaveInvoiceAfterAsaas = async (asaasData: any, nfNumber: string) => {
        try {
            const clientObj = clients.find(c => c.id.toString() === invoiceForm.client);
            const clientName = clientObj?.name || clientObj?.trading_name || invoiceForm.client;
            const userName = JSON.parse(localStorage.getItem('userData') || '{}').name || 'Sistema';
            const dueDate = invoiceForm.boleto_due_date || invoiceForm.date;
            const quinzenaDesc = getQuinzenaRef(invoiceForm.date, clientName);

            const chargesList = asaasData?.charges;
            if (chargesList && Array.isArray(chargesList) && chargesList.length > 0) {
                let savedCount = 0;
                for (let i = 0; i < chargesList.length; i++) {
                    const ch = chargesList[i];
                    const chPayment = ch.payment;
                    const chNfNumber = chPayment?.id ? `ASAAS-${chPayment.id}` : `TMSEG-${Date.now()}-S${i + 1}`;
                    const chValue = chPayment?.value || 0;
                    const chClientName = ch.customer?.name || clientName;

                    const invoicePayload: any = {
                        client: chClientName,
                        number: chNfNumber,
                        amount: chValue,
                        date: invoiceForm.date,
                        status: 'EMITIDA',
                        notes: `${invoiceForm.notes || ''} | CNPJ: ${ch.customer?.cpfCnpj || '-'}`.trim(),
                        created_by: userName,
                    };
                    if (invoiceForm.provider) invoicePayload.provider = invoiceForm.provider;
                    if (invoiceForm.issuer_company) invoicePayload.issuer_company = invoiceForm.issuer_company;
                    if (invoiceForm.boleto_due_date) invoicePayload.boleto_due_date = invoiceForm.boleto_due_date;
                    if (chPayment) {
                        invoicePayload.asaas_payment_id = chPayment.id;
                        invoicePayload.asaas_status = chPayment.status;
                        invoicePayload.asaas_invoice_url = chPayment.invoiceUrl || '';
                        invoicePayload.asaas_bankslip_url = chPayment.bankSlipUrl || '';
                    }
                    if (ch.pix?.copyPaste) invoicePayload.asaas_pix_payload = ch.pix.copyPaste;
                    if (ch.bankSlip?.digitableLine) invoicePayload.asaas_barcode = ch.bankSlip.digitableLine;
                    if (ch.invoice?.pdfUrl) invoicePayload.nf_image_url = ch.invoice.pdfUrl;
                    if (ch.invoice?.status) invoicePayload.nf_status = ch.invoice.status;
                    if (ch.invoice?.number) invoicePayload.nf_number = String(ch.invoice.number);
                    // Provider attribution: prefer explícito (ch.invoice.provider). Quando
                    // a NF falhou (invoice null + nfError), inferir do nfError.provider para
                    // não classificar erroneamente como ASAAS uma fatura PLUGNOTAS pendente.
                    const chProvider = (
                        ch.invoice?.provider
                        || (ch.nfError?.provider)
                        || 'ASAAS'
                    ).toUpperCase();
                    invoicePayload.nf_provider = chProvider;
                    if (!ch.invoice && ch.nfError) {
                        invoicePayload.nf_status = 'ERROR';
                        invoicePayload.nf_last_error = ch.nfError.message || 'NF pendente — reemissão necessária';
                    }
                    if (chProvider === 'PLUGNOTAS') {
                        if (ch.invoice?.plugnotasInvoiceId) invoicePayload.plugnotas_invoice_id = ch.invoice.plugnotasInvoiceId;
                        if (ch.invoice?.plugnotasProtocol) invoicePayload.plugnotas_protocol = ch.invoice.plugnotasProtocol;
                    }

                    let { error } = await supabase.from('financial_invoices').insert(invoicePayload).select();
                    if (error && error.code === '42703') {
                        const { nf_image_url, boleto_image_url, provider, issuer_company, boleto_due_date, asaas_payment_id, asaas_status, asaas_invoice_url, asaas_bankslip_url, asaas_pix_payload, asaas_barcode, nf_status, nf_number, nf_provider, plugnotas_invoice_id, plugnotas_protocol, ...basicPayload } = invoicePayload;
                        const retry = await supabase.from('financial_invoices').insert(basicPayload).select();
                        error = retry.error;
                    }
                    if (error) {
                        console.error(`[AutoSave Invoice ${i + 1}]`, error);
                        continue;
                    }

                    try {
                        await supabase.from('financial_transactions').insert({
                            description: `NF ${chNfNumber} — ${quinzenaDesc} — ${chClientName}`,
                            amount: chValue,
                            type: 'INCOME',
                            status: 'PENDING',
                            due_date: dueDate,
                            entity_type: 'Client',
                            entity_id: invoiceForm.client,
                            entity_name: chClientName,
                            notes: `Fatura NF ${chNfNumber} | CNPJ: ${ch.customer?.cpfCnpj || '-'} | Emissora: ${invoiceForm.issuer_company || '-'} | ${invoiceForm.notes || ''}`.trim(),
                            created_by: userName,
                        });
                    } catch (e) {
                        console.error(`[Auto Contas a Receber ${i + 1}]`, e);
                    }
                    savedCount++;
                }

                setAiStatus(`${chargesList.length} cobranças Asaas geradas + ${savedCount} faturas salvas + ${savedCount} contas a receber!`);
                setTimeout(() => {
                    setShowInvoiceModal(false);
                    resetInvoiceForm();
                }, 3000);
                return;
            }

            const parsedAmt = parseFloat(invoiceForm.amount);
            const invoicePayload: any = {
                client: clientName,
                number: nfNumber || `TMSEG-${Date.now()}`,
                amount: parsedAmt,
                date: invoiceForm.date,
                status: 'EMITIDA',
                notes: invoiceForm.notes || '',
                created_by: userName,
            };

            if (invoiceForm.provider) invoicePayload.provider = invoiceForm.provider;
            if (invoiceForm.issuer_company) invoicePayload.issuer_company = invoiceForm.issuer_company;
            if (invoiceForm.boleto_due_date) invoicePayload.boleto_due_date = invoiceForm.boleto_due_date;

            const payment = asaasData?.payment;
            if (payment) {
                invoicePayload.asaas_payment_id = payment.id;
                invoicePayload.asaas_status = payment.status;
                invoicePayload.asaas_invoice_url = payment.invoiceUrl || '';
                invoicePayload.asaas_bankslip_url = payment.bankSlipUrl || '';
            }
            if (asaasData?.pix?.copyPaste) invoicePayload.asaas_pix_payload = asaasData.pix.copyPaste;
            if (asaasData?.bankSlip?.digitableLine) invoicePayload.asaas_barcode = asaasData.bankSlip.digitableLine;

            const nfPdf = asaasData?.invoice?.pdfUrl;
            if (nfPdf) invoicePayload.nf_image_url = nfPdf;
            if (asaasData?.invoice?.status) invoicePayload.nf_status = asaasData.invoice.status;
            if (asaasData?.invoice?.number) invoicePayload.nf_number = String(asaasData.invoice.number);
            // Provider attribution: prefer explícito (asaasData.invoice.provider). Quando
            // a NF falhou (invoice null + nfError), inferir do nfError.provider para evitar
            // classificar erroneamente como ASAAS uma fatura PLUGNOTAS pendente.
            const nfProvider = (
                asaasData?.invoice?.provider
                || asaasData?.nfError?.provider
                || 'ASAAS'
            ).toUpperCase();
            invoicePayload.nf_provider = nfProvider;
            if (!asaasData?.invoice && asaasData?.nfError) {
                invoicePayload.nf_status = 'ERROR';
                invoicePayload.nf_last_error = asaasData.nfError.message || 'NF pendente — reemissão necessária';
            }
            if (nfProvider === 'PLUGNOTAS') {
                if (asaasData?.invoice?.plugnotasInvoiceId) invoicePayload.plugnotas_invoice_id = asaasData.invoice.plugnotasInvoiceId;
                if (asaasData?.invoice?.plugnotasProtocol) invoicePayload.plugnotas_protocol = asaasData.invoice.plugnotasProtocol;
            }

            let { error } = await supabase.from('financial_invoices').insert(invoicePayload).select();
            if (error && error.code === '42703') {
                const { nf_image_url, boleto_image_url, provider, issuer_company, boleto_due_date, asaas_payment_id, asaas_status, asaas_invoice_url, asaas_bankslip_url, asaas_pix_payload, asaas_barcode, nf_status, nf_number: _nfn, nf_provider, plugnotas_invoice_id, plugnotas_protocol, ...basicPayload } = invoicePayload;
                const retry = await supabase.from('financial_invoices').insert(basicPayload).select();
                error = retry.error;
            }
            if (error) {
                console.error('[AutoSave Invoice]', error);
                setAiStatus('Cobrança Asaas gerada, mas erro ao salvar fatura: ' + error.message);
                return;
            }

            try {
                await supabase.from('financial_transactions').insert({
                    description: `NF ${nfNumber} — ${quinzenaDesc}`,
                    amount: parsedAmt,
                    type: 'INCOME',
                    status: 'PENDING',
                    due_date: dueDate,
                    entity_type: 'Client',
                    entity_id: invoiceForm.client,
                    entity_name: clientName,
                    notes: `Fatura NF ${nfNumber} | Emissora: ${invoiceForm.issuer_company || '-'} | ${invoiceForm.notes || ''}`.trim(),
                    created_by: userName,
                });
            } catch (e) {
                console.error('[Auto Contas a Receber]', e);
            }

            setAiStatus('Cobrança Asaas gerada + Fatura salva + Contas a Receber criado!');
            setTimeout(() => {
                setShowInvoiceModal(false);
                resetInvoiceForm();
            }, 3000);
        } catch (e: any) {
            console.error('[AutoSave]', e);
            setAiStatus('Cobrança gerada no Asaas, mas erro ao salvar fatura localmente: ' + e.message);
        }
    };

    const handleGenerateAsaasCharge = async () => {
        if (!invoiceForm.amount || !invoiceForm.boleto_due_date) {
            alert('Preencha o Valor e o Vencimento do Boleto antes de gerar a cobrança.');
            return;
        }

        if (!invoiceMedicaoEmail || !invoiceMedicaoEmail.includes('@')) {
            alert('Informe um E-mail Medição válido antes de gerar a cobrança. Este e-mail será salvo no cadastro do cliente.');
            setShowMedicaoEmailInput(true);
            return;
        }

        const clientObj = clients.find(c => c.id.toString() === invoiceForm.client);

        if (showMedicaoEmailInput && invoiceMedicaoEmail) {
            await saveMedicaoEmailToClient(invoiceForm.client, invoiceMedicaoEmail);
            setShowMedicaoEmailInput(false);
        }

        if (asaasSplitMode && asaasSplitCharges.length > 0) {
            const validCharges = asaasSplitCharges.filter(c => c.cpfCnpj && parseFloat(c.value) > 0);
            if (validCharges.length === 0) {
                alert('Adicione pelo menos uma subconta com CNPJ e valor.');
                return;
            }
            if (Math.abs(asaasSplitDiff) > 0.01) {
                alert(`A soma das subcontas (R$ ${asaasSplitTotal.toFixed(2)}) não confere com o total da fatura (R$ ${parseFloat(invoiceForm.amount).toFixed(2)}). Diferença: R$ ${asaasSplitDiff.toFixed(2)}`);
                return;
            }
            setAsaasLoading(true);
            try {
                const res = await authFetch('/api/asaas/create-charge', {
                    method: 'POST',
                    body: JSON.stringify({
                        clientName: clientObj?.trading_name || clientObj?.name || 'Cliente',
                        clientEmail: invoiceMedicaoEmail,
                        dueDate: invoiceForm.boleto_due_date,
                        description: asaasDescription,
                        invoiceNumber: invoiceForm.number,
                        issuerCompany: invoiceForm.issuer_company,
                        charges: validCharges.map(c => ({ name: c.name || clientObj?.trading_name || clientObj?.name || 'Cliente', cpfCnpj: c.cpfCnpj.replace(/\D/g, ''), email: c.email || invoiceMedicaoEmail, value: parseFloat(c.value) })),
                    }),
                });
                const data = await res.json();
                // 207 = partialFailure (PlugNotas falhou no meio do loop, mas
                // cobranças Asaas anteriores foram criadas e devem ser persistidas
                // para evitar cobranças órfãs).
                if (!res.ok && res.status !== 207) throw new Error(data.error || 'Erro ao criar cobranças');
                setAsaasResult(data);
                const firstNf = data.charges?.[0]?.payment?.id ? `ASAAS-${data.charges[0].payment.id}` : '';
                if (firstNf) {
                    setInvoiceForm(prev => ({ ...prev, number: firstNf }));
                }
                if (data.partialFailure) {
                    const failedCharge = data.charges?.[data.failedAtIndex];
                    const errMsg = failedCharge?.nfError?.message || data.error || 'NF PlugNotas falhou';
                    setAiStatus(`⚠️ ${data.charges?.length - 1 || 0} cobrança(s) OK + 1 SEM NF (PlugNotas falhou). Persistindo localmente — use "Reemitir via PlugNotas" depois. Erro: ${errMsg}`);
                    alert(`Atenção: cobranças Asaas foram criadas, mas a NF da cobrança ${data.failedAtIndex + 1} falhou no PlugNotas:\n\n${errMsg}\n\nAs cobranças serão salvas localmente. Use "Reemitir via PlugNotas" na tela de Faturamento depois de corrigir a configuração.`);
                } else {
                    setAiStatus(`${data.charges?.length || 0} cobranças Asaas geradas! Salvando fatura...`);
                }
                await autoSaveInvoiceAfterAsaas(data, firstNf);
            } catch (err: any) {
                alert('Erro ao gerar cobranças no Asaas: ' + err.message);
                setAiStatus('Erro: ' + err.message);
            } finally {
                setAsaasLoading(false);
            }
            return;
        }

        if (!clientObj?.cnpj) {
            alert('O cliente selecionado não possui CNPJ cadastrado. Cadastre o CNPJ no módulo de Clientes.');
            return;
        }

        setAsaasLoading(true);
        try {
            const res = await authFetch('/api/asaas/create-charge', {
                method: 'POST',
                body: JSON.stringify({
                    clientName: clientObj.trading_name || clientObj.name,
                    clientCpfCnpj: clientObj.cnpj.replace(/\D/g, ''),
                    clientEmail: invoiceMedicaoEmail,
                    value: parseFloat(invoiceForm.amount),
                    dueDate: invoiceForm.boleto_due_date,
                    description: asaasDescription,
                    invoiceNumber: invoiceForm.number || `TMSEG-${Date.now()}`,
                    issuerCompany: invoiceForm.issuer_company,
                }),
            });
            const data = await res.json();
            // 207 = NF PlugNotas falhou MAS a cobrança Asaas foi criada. Persistimos
            // a cobrança localmente para evitar pagamento órfão e exibimos aviso para
            // o operador usar "Reemitir via PlugNotas" depois de corrigir a config.
            if (!res.ok && res.status !== 207) throw new Error(data.error || 'Erro ao criar cobrança');
            setAsaasResult(data);
            const nfNum = data.payment?.id ? `ASAAS-${data.payment.id}` : '';
            if (nfNum) {
                setInvoiceForm(prev => ({ ...prev, number: nfNum }));
            }
            if (data.nfPending && data.nfError) {
                setAiStatus(`⚠️ Cobrança Asaas gerada, mas NF PlugNotas falhou: ${data.nfError.message}. Persistindo localmente.`);
                alert(`Atenção: cobrança Asaas foi criada com sucesso, mas a NF PlugNotas falhou:\n\n${data.nfError.message}\n\nA cobrança será salva localmente. Use "Reemitir via PlugNotas" na tela de Faturamento depois de corrigir a configuração.`);
            } else {
                setAiStatus('Cobrança Asaas gerada! Salvando fatura e contas a receber...');
            }

            await autoSaveInvoiceAfterAsaas(data, nfNum);
        } catch (err: any) {
            alert('Erro ao gerar cobrança no Asaas: ' + err.message);
            setAiStatus('Erro: ' + err.message);
        } finally {
            setAsaasLoading(false);
        }
    };

    const buildPeriodRef = (): string => {
        if (!startDate) return '';
        const sDate = new Date(startDate + 'T12:00:00');
        const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const month = monthNames[sDate.getMonth()];
        const year = sDate.getFullYear();
        const sDay = sDate.getDate();
        const eDate = endDate ? new Date(endDate + 'T12:00:00') : sDate;
        const eDay = eDate.getDate();
        const lastDayOfMonth = new Date(year, sDate.getMonth() + 1, 0).getDate();
        if (sDay === 1 && eDay === lastDayOfMonth) return `Mês Completo de ${month}/${year}`;
        if (sDay === 1 && eDay === 15) return `1ª Quinzena de ${month}/${year}`;
        if (sDay === 16) return `2ª Quinzena de ${month}/${year}`;
        return `${month}/${year}`;
    };

    const openInvoiceModal = () => {
        // Bloqueio: não permite gerar fatura se houver OS sem aprovação no período.
        const pendentes = rowsData.filter(r => !r.isApproved);
        if (pendentes.length > 0) {
            const lista = pendentes.slice(0, 10).map(r => `• ${r.id} (${r.missionStatus})`).join('\n');
            const extra = pendentes.length > 10 ? `\n…e mais ${pendentes.length - 10} OS.` : '';
            alert(
                `Não é possível gerar a fatura: existem ${pendentes.length} OS no período ainda sem aprovação.\n\n` +
                `Conclua a auditoria/aprovação dessas OS antes de faturar:\n${lista}${extra}`
            );
            return;
        }
        const clientObj = clients.find(c => c.id.toString() === selectedClient);
        const razaoSocial = clientObj?.name || clientObj?.trading_name || '';
        const tomador = razaoSocial;
        const issuer = (clientObj as any)?.issuer_company || '';
        const periodRef = buildPeriodRef();
        const notesText = `Referente aos serviços de Intermediação de Escolta Armada - Referente ao ${periodRef}`;

        const existingMedicaoEmail = (clientObj as any)?.medicao_email || '';
        const emailList = existingMedicaoEmail ? existingMedicaoEmail.split(',').map((e: string) => e.trim()).filter(Boolean) : [];
        setInvoiceMedicaoEmail(emailList.length > 0 ? emailList[0] : '');
        setShowMedicaoEmailInput(emailList.length === 0);

        setInvoiceForm(prev => ({
            ...prev,
            client: selectedClient,
            amount: reportGenerated && grandTotal > 0 ? grandTotal.toFixed(2) : prev.amount,
            provider: tomador,
            issuer_company: issuer,
            notes: notesText,
            number: '',
        }));
        setAsaasPeriod(periodRef);
        setAsaasSplitMode(false);
        setAsaasSplitCharges([]);
        setShowInvoiceModal(true);
    };

    const handleSaveInvoice = async () => {
        const nfNumber = invoiceForm.number || (asaasResult?.payment?.id ? `ASAAS-${asaasResult.payment.id}` : '');
        if (!invoiceForm.client || !nfNumber || !invoiceForm.amount) { alert('Preencha todos os campos obrigatórios (Cliente, Valor). Gere a cobrança Asaas primeiro para obter o Nº NF.'); return; }
        if (!nfNumber) { alert('Gere a cobrança no Asaas primeiro para obter o número da fatura.'); return; }
        const parsedAmt = parseFloat(invoiceForm.amount);
        if (isNaN(parsedAmt) || parsedAmt <= 0) { alert('Valor inválido.'); return; }
        const clientObj = clients.find(c => c.id.toString() === invoiceForm.client);
        const clientName = clientObj?.trading_name || clientObj?.name || invoiceForm.client;
        const userName = JSON.parse(localStorage.getItem('userData') || '{}').name || 'Sistema';

        setInvoiceSaving(true);
        try {
            let nfImageUrl = '';
            let boletoImageUrl = '';
            if (nfFile) {
                setAiStatus('Salvando imagem da NF...');
                nfImageUrl = await uploadDocImage(nfFile, `nf_${nfNumber}`);
            }
            if (boletoFile) {
                setAiStatus('Salvando imagem do Boleto...');
                boletoImageUrl = await uploadDocImage(boletoFile, `boleto_${nfNumber}`);
            }

            const invoicePayload: any = {
                client: clientName, number: nfNumber,
                amount: parsedAmt, date: invoiceForm.date,
                status: 'EMITIDA', notes: invoiceForm.notes || '',
                created_by: userName,
            };
            if (nfImageUrl) invoicePayload.nf_image_url = nfImageUrl;
            if (boletoImageUrl) invoicePayload.boleto_image_url = boletoImageUrl;
            if (invoiceForm.provider) invoicePayload.provider = invoiceForm.provider;
            if (invoiceForm.issuer_company) invoicePayload.issuer_company = invoiceForm.issuer_company;
            if (invoiceForm.boleto_due_date) invoicePayload.boleto_due_date = invoiceForm.boleto_due_date;
            if (asaasResult?.payment?.invoiceUrl) invoicePayload.nf_image_url = invoicePayload.nf_image_url || asaasResult.payment.invoiceUrl;
            if (asaasResult?.payment?.bankSlipUrl) invoicePayload.boleto_image_url = invoicePayload.boleto_image_url || asaasResult.payment.bankSlipUrl;
            if (asaasResult?.payment) {
                invoicePayload.asaas_payment_id = asaasResult.payment.id;
                invoicePayload.asaas_status = asaasResult.payment.status;
                invoicePayload.asaas_invoice_url = asaasResult.payment.invoiceUrl || '';
                invoicePayload.asaas_bankslip_url = asaasResult.payment.bankSlipUrl || '';
                if (asaasResult.pix?.copyPaste) invoicePayload.asaas_pix_payload = asaasResult.pix.copyPaste;
                if (asaasResult.bankSlip?.digitableLine) invoicePayload.asaas_barcode = asaasResult.bankSlip.digitableLine;
            }

            let { error } = await supabase.from('financial_invoices').insert(invoicePayload).select();
            if (error && error.code === '42703') {
                const { nf_image_url, boleto_image_url, provider, issuer_company, boleto_due_date, asaas_payment_id, asaas_status, asaas_invoice_url, asaas_bankslip_url, asaas_pix_payload, asaas_barcode, ...basicPayload } = invoicePayload;
                const retry = await supabase.from('financial_invoices').insert(basicPayload).select();
                error = retry.error;
            }
            if (error) { alert('Erro ao salvar fatura: ' + (error.message || 'Erro desconhecido')); return; }

            const dueDate = invoiceForm.boleto_due_date || invoiceForm.date;
            const quinzenaDesc = getQuinzenaRef(invoiceForm.date, clientName);
            try {
                await supabase.from('financial_transactions').insert({
                    description: `NF ${nfNumber} — ${quinzenaDesc}`,
                    amount: parsedAmt,
                    type: 'INCOME',
                    status: 'PENDING',
                    due_date: dueDate,
                    entity_type: 'Client',
                    entity_id: invoiceForm.client,
                    entity_name: clientName,
                    notes: `Fatura NF ${nfNumber} | Emissora: ${invoiceForm.issuer_company || '-'} | ${invoiceForm.notes || ''}`.trim(),
                    created_by: userName,
                });
            } catch (e) {
                console.error('[Auto Contas a Receber] Erro:', e);
            }

            alert(`Fatura NF ${nfNumber} emitida com sucesso!\nContas a Receber criado automaticamente.`);
            setShowInvoiceModal(false);
            resetInvoiceForm();
        } catch (e: any) {
            console.error('[Invoice]', e);
            alert('Erro ao salvar: ' + e.message);
        } finally {
            setInvoiceSaving(false);
            setAiStatus('');
        }
    };

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const renderInvoiceModal = () => {
        if (!showInvoiceModal) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
                <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in my-4">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-gray-900 to-gray-800">
                        <div className="flex items-center gap-2">
                            <ScanLine size={18} className="text-red-400"/>
                            <h3 className="font-black text-white uppercase text-xs tracking-widest">Gerar Fatura — Boletim de Medição</h3>
                        </div>
                        <button onClick={() => { setShowInvoiceModal(false); resetInvoiceForm(); }} data-testid="btn-close-invoice-modal"><X size={20} className="text-gray-400 hover:text-white"/></button>
                    </div>
                    <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
                        {aiStatus && (
                            <div className={`text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2 ${aiStatus.includes('Erro') ? 'bg-red-50 text-red-600' : aiStatus.includes('sucesso') ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                {asaasLoading ? <Loader2 size={12} className="animate-spin"/> : aiStatus.includes('Erro') ? <AlertCircle size={12}/> : <CheckCircle2 size={12}/>}
                                {aiStatus}
                            </div>
                        )}

                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <p className="text-[9px] font-black text-red-700 uppercase tracking-widest mb-3">Dados da Fatura (Preenchidos Automaticamente)</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Cliente (Razão Social)</label>
                                    <input type="text" className="w-full p-2.5 border rounded-lg text-sm font-bold uppercase bg-white cursor-not-allowed" readOnly value={clients.find(c => c.id.toString() === invoiceForm.client)?.name || ''} data-testid="display-billing-invoice-client" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Valor Total</label>
                                    <input type="text" className="w-full p-2.5 border rounded-lg text-sm font-mono font-bold bg-white cursor-not-allowed" readOnly value={invoiceForm.amount ? `R$ ${parseFloat(invoiceForm.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''} data-testid="display-billing-invoice-amount" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Empresa Emissora (NF)</label>
                                    <input type="text" className="w-full p-2.5 border rounded-lg text-sm font-bold uppercase bg-white cursor-not-allowed" readOnly value={invoiceForm.issuer_company} data-testid="display-billing-invoice-issuer" />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Tomador do Serviço</label>
                                    <input type="text" className="w-full p-2.5 border rounded-lg text-sm font-bold uppercase bg-white cursor-not-allowed" readOnly value={invoiceForm.provider} data-testid="display-billing-invoice-provider" />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Nº NF (Gerado pelo Asaas)</label>
                                    <input type="text" className="w-full p-2.5 border rounded-lg text-sm font-mono font-bold bg-white cursor-not-allowed" readOnly value={invoiceForm.number || 'Será gerado automaticamente ao criar cobrança'} placeholder="Será gerado automaticamente" data-testid="display-billing-invoice-number" />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                            <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest mb-3 flex items-center gap-1"><Receipt size={10}/> Dados Manuais</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className={`text-[10px] font-black uppercase mb-1 block flex items-center gap-1 ${showMedicaoEmailInput ? 'text-red-500' : 'text-gray-400'}`}>
                                        {showMedicaoEmailInput ? <AlertCircle size={10}/> : null} E-mail Medição *
                                        {showMedicaoEmailInput && <span className="text-[8px] text-red-400 font-bold ml-1">(Obrigatório — será salvo no cadastro do cliente)</span>}
                                    </label>
                                    {showMedicaoEmailInput ? (
                                        <input type="email" className="w-full p-2.5 border-2 border-red-300 rounded-lg text-sm font-bold bg-red-50 focus:ring-2 focus:ring-red-400 lowercase" placeholder="Digite o e-mail de medição do cliente..." value={invoiceMedicaoEmail} onChange={e => setInvoiceMedicaoEmail(e.target.value.toLowerCase())} data-testid="input-billing-medicao-email" />
                                    ) : (
                                        <input type="text" className="w-full p-2.5 border rounded-lg text-sm font-bold bg-white cursor-not-allowed lowercase" readOnly value={invoiceMedicaoEmail} data-testid="display-billing-medicao-email" />
                                    )}
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-orange-500 uppercase mb-1 block flex items-center gap-1"><Calendar size={10}/> Vencimento do Boleto *</label>
                                    <input type="date" className="w-full p-2.5 border-2 border-orange-300 rounded-lg text-sm font-bold bg-orange-50 focus:ring-2 focus:ring-orange-400" value={invoiceForm.boleto_due_date} onChange={e => setInvoiceForm({...invoiceForm, boleto_due_date: e.target.value})} data-testid="input-billing-invoice-boleto-date" />
                                </div>
                                <div className="flex items-end">
                                    <div className="w-full p-2.5 bg-gray-50 rounded-lg border text-[10px] text-gray-400 font-bold">
                                        {invoiceForm.boleto_due_date ? `Contas a Receber: venc. ${new Date(invoiceForm.boleto_due_date + 'T12:00:00').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Defina o vencimento para gerar a cobrança'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {isCevaBilling && (
                            <div className="p-3 rounded-xl border-2 border-teal-400 bg-teal-50">
                                <label className="text-[10px] font-black text-teal-700 uppercase mb-1 block flex items-center gap-1.5"><FileText size={10} /> Liberação de Faturamento (CEVA)</label>
                                <input type="text" className="w-full p-2.5 border-2 border-teal-300 rounded-lg text-sm font-bold bg-white focus:ring-2 focus:ring-teal-400" placeholder="Ex: A001, B002..." value={invoiceForm.notes.match(/LIB\. FATUR\.: ([A-Z0-9]+)/)?.[1] || ''} onChange={e => {
                                    const libVal = e.target.value.toUpperCase();
                                    const currentNotes = invoiceForm.notes.replace(/\s*\|\s*LIB\. FATUR\.: [A-Z0-9]+/, '').replace(/LIB\. FATUR\.: [A-Z0-9]+\s*\|?\s*/, '');
                                    const newNotes = libVal ? `LIB. FATUR.: ${libVal} | ${currentNotes}`.trim() : currentNotes;
                                    setInvoiceForm({...invoiceForm, notes: newNotes});
                                }} data-testid="input-billing-release-nf" />
                                <p className="text-[8px] text-teal-600 font-bold mt-1">Este código aparecerá na referência da NF e no boletim de medição</p>
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Observações (Auto-preenchida)</label>
                            <textarea className="w-full p-2.5 border rounded-lg text-sm bg-gray-50" rows={2} value={invoiceForm.notes} onChange={e => setInvoiceForm({...invoiceForm, notes: e.target.value})} data-testid="input-billing-invoice-notes" />
                        </div>

                        {asaasConfigured && (
                            <div className="border-t border-gray-100 pt-4">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                    <DollarSign size={10} className="text-green-500"/> Cobrança Asaas (Boleto + PIX)
                                </p>
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3 space-y-2">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <p className="text-[8px] font-black text-gray-500 uppercase">Juros: 1% a.m. | Multa: 2%</p>
                                    </div>
                                    {(() => {
                                        const cl = clients.find(c => c.id.toString() === invoiceForm.client);
                                        const nm = `${cl?.name || ''} ${cl?.trading_name || ''}`.toUpperCase();
                                        let cnaeCode = '07930';
                                        let cnaeName = 'Monitoramento e rastreamento a distância de veículos, cargas, pessoas e semoventes';
                                        if (nm.includes('CEVA')) { cnaeCode = '07930'; cnaeName = 'Intermediação / Agenciamento de Contrato'; }
                                        else if (nm.includes('AMAZON')) { cnaeCode = '06298'; cnaeName = 'Rastreamento e Monitoramento de Carga'; }
                                        return (
                                            <div className="bg-green-50 border border-green-200 rounded-lg px-2.5 py-2">
                                                <p className="text-[8px] font-black text-green-700 uppercase mb-0.5">CNAE Fixado Automaticamente</p>
                                                <p className="text-[11px] font-bold text-green-800">CNAE {cnaeCode} — {cnaeName}</p>
                                            </div>
                                        );
                                    })()}
                                    <div>
                                        <label className="text-[8px] font-black text-gray-500 uppercase mb-0.5 block">Período / Referência</label>
                                        <input type="text" readOnly value={asaasPeriod}
                                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] font-medium bg-white cursor-not-allowed"
                                            data-testid="display-asaas-period"/>
                                    </div>
                                    <div>
                                        <label className="text-[8px] font-black text-gray-500 uppercase mb-0.5 block">Descrição da Cobrança / NF</label>
                                        <textarea value={asaasDescription} onChange={e => setAsaasDescription(e.target.value)} rows={2}
                                            className="w-full border border-green-200 rounded-lg px-2 py-1.5 text-[10px] font-medium bg-white resize-none focus:border-green-400 focus:ring-1 focus:ring-green-200"
                                            data-testid="input-asaas-description"/>
                                    </div>
                                </div>

                                <div className="mb-3">
                                    <button type="button" onClick={() => { setAsaasSplitMode(!asaasSplitMode); if (!asaasSplitMode && asaasSplitCharges.length === 0) { const clientObj = clients.find(c => c.id.toString() === invoiceForm.client); setAsaasSplitCharges([{ name: clientObj?.trading_name || clientObj?.name || '', cpfCnpj: clientObj?.cnpj || '', email: '', value: invoiceForm.amount || '' }]); } }}
                                        className={`w-full text-[9px] font-black uppercase tracking-wider py-2 rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${asaasSplitMode ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                        data-testid="btn-asaas-split-toggle">
                                        <GitBranch size={12}/> {asaasSplitMode ? 'Dividir por CNPJ (ativo)' : 'Dividir por CNPJ (subcontas)'}
                                    </button>

                                    {asaasSplitMode && (
                                        <div className="mt-2 space-y-2">
                                            {asaasSplitCharges.map((charge, idx) => (
                                                <div key={idx} className="bg-purple-50 border border-purple-200 rounded-lg p-2 space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[8px] font-black text-purple-600 uppercase">Subconta {idx + 1}</span>
                                                        {asaasSplitCharges.length > 1 && (
                                                            <button type="button" onClick={() => setAsaasSplitCharges(prev => prev.filter((_, i) => i !== idx))}
                                                                className="text-red-400 hover:text-red-600" data-testid={`btn-asaas-split-remove-${idx}`}><Trash2 size={12}/></button>
                                                        )}
                                                    </div>
                                                    <input type="text" placeholder="Nome / Razão Social" value={charge.name} onChange={e => { const u = [...asaasSplitCharges]; u[idx].name = e.target.value; setAsaasSplitCharges(u); }}
                                                        className="w-full border border-purple-200 rounded px-2 py-1 text-[10px] bg-white" data-testid={`input-asaas-split-name-${idx}`}/>
                                                    <input type="text" placeholder="CNPJ (somente números)" value={charge.cpfCnpj} onChange={e => { const u = [...asaasSplitCharges]; u[idx].cpfCnpj = e.target.value; setAsaasSplitCharges(u); }}
                                                        className="w-full border border-purple-200 rounded px-2 py-1 text-[10px] bg-white font-mono" data-testid={`input-asaas-split-cnpj-${idx}`}/>
                                                    <input type="email" placeholder="E-mail (opcional)" value={charge.email} onChange={e => { const u = [...asaasSplitCharges]; u[idx].email = e.target.value; setAsaasSplitCharges(u); }}
                                                        className="w-full border border-purple-200 rounded px-2 py-1 text-[10px] bg-white" data-testid={`input-asaas-split-email-${idx}`}/>
                                                    <input type="number" step="0.01" placeholder="Valor R$" value={charge.value} onChange={e => { const u = [...asaasSplitCharges]; u[idx].value = e.target.value; setAsaasSplitCharges(u); }}
                                                        className="w-full border border-purple-200 rounded px-2 py-1 text-[10px] bg-white font-mono font-bold" data-testid={`input-asaas-split-value-${idx}`}/>
                                                </div>
                                            ))}

                                            <button type="button" onClick={() => setAsaasSplitCharges(prev => [...prev, { name: '', cpfCnpj: '', email: '', value: '' }])}
                                                className="w-full text-[9px] font-black uppercase text-purple-600 hover:text-purple-800 py-1.5 border border-dashed border-purple-300 rounded-lg flex items-center justify-center gap-1"
                                                data-testid="btn-asaas-split-add">
                                                <Plus size={12}/> Adicionar Subconta
                                            </button>

                                            <div className={`rounded-lg p-2 text-[9px] font-black text-center ${Math.abs(asaasSplitDiff) < 0.01 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
                                                data-testid="text-asaas-split-total">
                                                Soma: R$ {asaasSplitTotal.toFixed(2)} / Total NF: R$ {(parseFloat(invoiceForm.amount) || 0).toFixed(2)}
                                                {Math.abs(asaasSplitDiff) >= 0.01 && ` — Diferença: R$ ${asaasSplitDiff.toFixed(2)}`}
                                                {Math.abs(asaasSplitDiff) < 0.01 && ' ✓'}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {!asaasResult ? (
                                    <button
                                        onClick={handleGenerateAsaasCharge}
                                        disabled={asaasLoading || !invoiceForm.amount || !invoiceForm.boleto_due_date || (asaasSplitMode && Math.abs(asaasSplitDiff) >= 0.01)}
                                        className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-black uppercase text-xs tracking-widest py-3 rounded-xl flex items-center justify-center gap-2 hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg disabled:opacity-50"
                                        data-testid="btn-asaas-generate-charge"
                                    >
                                        {asaasLoading ? <Loader2 size={16} className="animate-spin"/> : <Receipt size={16}/>}
                                        {asaasLoading ? 'Gerando cobrança...' : asaasSplitMode ? `Gerar ${asaasSplitCharges.length} Cobranças (Asaas)` : 'Gerar Boleto + PIX (Asaas)'}
                                    </button>
                                ) : asaasResult.split ? (
                                    <div className="space-y-3">
                                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                                            <CheckCircle2 size={16} className="text-green-600 shrink-0"/>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-green-700 uppercase">{asaasResult.charges?.length} Cobranças Geradas</p>
                                                <p className="text-[9px] text-green-600">Total: R$ {asaasResult.totalValue?.toFixed(2)}</p>
                                            </div>
                                        </div>
                                        {asaasResult.charges?.map((ch: any, idx: number) => (
                                            <div key={idx} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black text-gray-700">{ch.customer?.name} — {ch.customer?.cpfCnpj}</span>
                                                    <span className="text-[9px] font-black text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{ch.payment?.statusBr}</span>
                                                </div>
                                                <p className="text-[10px] font-mono font-bold text-gray-900">R$ {ch.payment?.value?.toFixed(2)} — ID: {ch.payment?.id}</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {ch.bankSlip && (
                                                        <div className="bg-orange-50 rounded-lg p-2">
                                                            <p className="text-[8px] font-mono text-orange-800 break-all select-all cursor-text">{ch.bankSlip.digitableLine}</p>
                                                            <button onClick={() => { navigator.clipboard.writeText(ch.bankSlip.digitableLine); alert('Código de barras copiado!'); }}
                                                                className="mt-1 text-[8px] font-black text-orange-600 uppercase">Copiar Barras</button>
                                                        </div>
                                                    )}
                                                    {ch.pix && (
                                                        <div className="bg-indigo-50 rounded-lg p-2">
                                                            {ch.pix.qrCodeBase64 && <img src={`data:image/png;base64,${ch.pix.qrCodeBase64}`} alt="QR" className="w-20 h-20 mx-auto mb-1"/>}
                                                            <button onClick={() => { navigator.clipboard.writeText(ch.pix.copyPaste); alert('PIX copiado!'); }}
                                                                className="text-[8px] font-black text-indigo-600 uppercase w-full text-center">Copiar PIX</button>
                                                        </div>
                                                    )}
                                                </div>
                                                {ch.invoice && (
                                                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-2">
                                                        <FileText size={12} className="text-emerald-600 shrink-0"/>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[8px] font-black text-emerald-700 uppercase">NF Agendada</p>
                                                            <p className="text-[8px] text-emerald-600 font-mono">{ch.invoice.id} — {ch.invoice.status}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex gap-2">
                                                    {ch.payment?.bankSlipUrl && <a href={ch.payment.bankSlipUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-orange-100 text-orange-700 font-black text-[8px] uppercase py-1.5 rounded-lg border border-orange-200">Boleto PDF</a>}
                                                    {ch.payment?.invoiceUrl && <a href={ch.payment.invoiceUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-blue-100 text-blue-700 font-black text-[8px] uppercase py-1.5 rounded-lg border border-blue-200">Fatura</a>}
                                                    {ch.invoice?.pdfUrl && <a href={ch.invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-emerald-100 text-emerald-700 font-black text-[8px] uppercase py-1.5 rounded-lg border border-emerald-200">NF PDF</a>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                                            <CheckCircle2 size={16} className="text-green-600 shrink-0"/>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-green-700 uppercase">Cobrança Gerada</p>
                                                <p className="text-[9px] text-green-600 font-mono truncate">ID: {asaasResult.payment.id}</p>
                                            </div>
                                            <span className="text-[9px] font-black text-green-600 bg-green-100 px-2 py-0.5 rounded-full border border-green-300">{asaasResult.payment.statusBr}</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            {asaasResult.bankSlip && (
                                                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                                                    <p className="text-[9px] font-black text-orange-600 uppercase mb-1.5 flex items-center gap-1"><Receipt size={10}/> Código de Barras</p>
                                                    <p className="text-[8px] font-mono text-orange-800 break-all select-all cursor-text leading-relaxed" data-testid="text-asaas-barcode">{asaasResult.bankSlip.digitableLine}</p>
                                                    <button onClick={() => { navigator.clipboard.writeText(asaasResult.bankSlip.digitableLine); alert('Código de barras copiado!'); }}
                                                        className="mt-2 text-[8px] font-black text-orange-600 hover:text-orange-800 uppercase">Copiar</button>
                                                </div>
                                            )}

                                            {asaasResult.pix && (
                                                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                                                    <p className="text-[9px] font-black text-indigo-600 uppercase mb-1.5 flex items-center gap-1"><ScanLine size={10}/> PIX QR Code</p>
                                                    {asaasResult.pix.qrCodeBase64 && (
                                                        <img src={`data:image/png;base64,${asaasResult.pix.qrCodeBase64}`} alt="QR Code PIX" className="w-24 h-24 mx-auto border-2 border-indigo-200 rounded-lg mb-1.5" data-testid="img-asaas-pix-qr"/>
                                                    )}
                                                    <button onClick={() => { navigator.clipboard.writeText(asaasResult.pix.copyPaste); alert('PIX Copia e Cola copiado!'); }}
                                                        className="text-[8px] font-black text-indigo-600 hover:text-indigo-800 uppercase w-full text-center">Copiar PIX</button>
                                                </div>
                                            )}
                                        </div>

                                        {asaasResult.invoice && (
                                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                                                <FileText size={14} className="text-emerald-600 shrink-0"/>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[9px] font-black text-emerald-700 uppercase">Nota Fiscal Agendada</p>
                                                    <p className="text-[8px] text-emerald-600 font-mono">{asaasResult.invoice.id} — {asaasResult.invoice.status}</p>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            {asaasResult.payment.bankSlipUrl && (
                                                <a href={asaasResult.payment.bankSlipUrl} target="_blank" rel="noopener noreferrer"
                                                    className="flex-1 text-center bg-orange-100 text-orange-700 font-black text-[9px] uppercase py-2 rounded-lg hover:bg-orange-200 transition-colors border border-orange-200"
                                                    data-testid="link-asaas-boleto-pdf">
                                                    Abrir Boleto PDF
                                                </a>
                                            )}
                                            {asaasResult.payment.invoiceUrl && (
                                                <a href={asaasResult.payment.invoiceUrl} target="_blank" rel="noopener noreferrer"
                                                    className="flex-1 text-center bg-blue-100 text-blue-700 font-black text-[9px] uppercase py-2 rounded-lg hover:bg-blue-200 transition-colors border border-blue-200"
                                                    data-testid="link-asaas-invoice">
                                                    Fatura Online
                                                </a>
                                            )}
                                            {asaasResult.invoice?.pdfUrl && (
                                                <a href={asaasResult.invoice.pdfUrl} target="_blank" rel="noopener noreferrer"
                                                    className="flex-1 text-center bg-emerald-100 text-emerald-700 font-black text-[9px] uppercase py-2 rounded-lg hover:bg-emerald-200 transition-colors border border-emerald-200"
                                                    data-testid="link-asaas-nf-pdf">
                                                    NF PDF
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20 relative">
            <style>{`
                /* ====== SCREEN STYLES ====== */
                @media screen {
                    #print-area .report-table-scroll thead tr.group-hdr th {
                        position: sticky;
                        top: 0;
                        z-index: 4;
                    }
                    #print-area .report-table-scroll thead tr.sub-hdr th {
                        position: sticky;
                        top: 30px;
                        z-index: 3;
                    }
                    #print-area .report-table-scroll tbody tr:nth-child(odd) { background-color: #ffffff; }
                    #print-area .report-table-scroll tbody tr:nth-child(even) { background-color: #fef2f2; }
                    #print-area .report-table-scroll tbody tr:hover { background-color: #fee2e2 !important; }
                }

                /* ====== PRINT STYLES ====== */
                @media print {
                    @page {
                        size: A4 landscape;
                        margin: 5mm 6mm;
                    }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }
                    body * { visibility: hidden !important; }
                    #print-area, #print-area * {
                        visibility: visible !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    #print-area {
                        position: absolute;
                        left: 0; top: 0;
                        width: 100% !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        overflow: visible !important;
                        border: none !important;
                        box-shadow: none !important;
                        border-radius: 0 !important;
                    }
                    #print-area .report-table-scroll {
                        overflow: visible !important;
                        max-height: none !important;
                        max-width: none !important;
                        width: 100% !important;
                        border: none !important;
                        border-radius: 0 !important;
                    }
                    #print-area table {
                        table-layout: fixed !important;
                        width: 100% !important;
                        border-collapse: collapse !important;
                    }
                    #print-area colgroup col {
                        min-width: 0 !important;
                        width: auto !important;
                    }
                    #print-area thead {
                        display: table-header-group !important;
                    }
                    #print-area thead th {
                        position: static !important;
                    }
                    #print-area tbody {
                        display: table-row-group !important;
                    }
                    #print-area tfoot {
                        display: table-footer-group !important;
                    }
                    #print-area tr {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    #print-area td, #print-area th {
                        padding: 1.5px 2.5px !important;
                        font-size: 6.5pt !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        border: 0.5px solid #aaa !important;
                        line-height: 1.2 !important;
                        white-space: nowrap !important;
                        max-width: none !important;
                    }
                    #print-area td.route-cell {
                        white-space: normal !important;
                        word-wrap: break-word !important;
                        word-break: break-word !important;
                        overflow-wrap: break-word !important;
                        line-height: 1.15 !important;
                        font-size: 6pt !important;
                        max-width: none !important;
                    }
                    #print-area tbody tr:nth-child(odd) { background-color: #ffffff !important; }
                    #print-area tbody tr:nth-child(even) { background-color: #f3f4f6 !important; }
                    #print-area .group-hdr th {
                        font-size: 7pt !important;
                        padding: 2px 2px !important;
                        font-weight: 900 !important;
                    }
                    #print-area .sub-hdr th {
                        font-size: 6pt !important;
                        padding: 1.5px 2px !important;
                        font-weight: 900 !important;
                    }
                    #print-area .boletim-header { margin-bottom: 2mm !important; }
                    #print-area .boletim-header h1 { font-size: 12pt !important; margin: 0 !important; }
                    #print-area .subtitle-line { font-size: 9pt !important; margin: 1px 0 !important; }
                    #print-area .ref-line { font-size: 7pt !important; margin: 0 !important; }
                    .no-print { display: none !important; }
                    #print-area .watermark-logo {
                        position: fixed !important;
                        top: 50% !important;
                        left: 50% !important;
                        transform: translate(-50%, -50%) !important;
                        opacity: 0.04 !important;
                        width: 120mm !important;
                        height: 120mm !important;
                        z-index: 0 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    #print-area .sign-section {
                        margin-top: 6mm !important;
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                        page-break-before: auto !important;
                    }
                    #print-area .sign-box { font-size: 7pt !important; width: 55mm !important; }
                    #print-area .sign-logo { width: 8mm !important; height: 8mm !important; }
                    #print-area .digital-signature { font-size: 12pt !important; }
                    #print-area .sign-role { font-size: 7pt !important; }
                    #print-area .sign-cargo { font-size: 6pt !important; }
                    #print-area .sign-cnpj { font-size: 5.5pt !important; }
                    #print-area .sign-system { font-size: 5.5pt !important; }
                    #print-area .sign-cliente { font-size: 7pt !important; }
                    #print-area .sign-data { font-size: 5.5pt !important; }
                    #print-area tfoot tr {
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                    }
                    #print-area tfoot td {
                        font-size: 7pt !important;
                        font-weight: 900 !important;
                        padding: 2px 3px !important;
                    }
                }
            `}</style>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 no-print">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                            <FileText className="text-blue-700" /> Boletim de Medição
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Relatório detalhado para conferência e faturamento.</p>
                    </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Cliente</label>
                            <select className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500 bg-white uppercase font-bold" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                                <option value="">Selecione...</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.trading_name || c.name}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs font-bold text-gray-500 uppercase block">Período</label>
                                <div className="flex gap-2 items-center">
                                    <input type="month" className="text-[11px] font-bold uppercase px-2 py-0.5 rounded border border-red-300 bg-red-50 text-red-700 outline-none focus:border-red-500 cursor-pointer" value={selectedMonth} onChange={e => handleSetMonth(e.target.value)} data-testid="input-month-selector" />
                                    <button onClick={() => handleSetFortnight(1)} className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200">1ª Quinzena</button>
                                    <button onClick={() => handleSetFortnight(2)} className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200">2ª Quinzena</button>
                                    <button onClick={() => handleSetWeekSundayToSunday(-1)} className="text-[10px] font-black uppercase text-purple-700 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded border border-purple-200" data-testid="btn-week-prev-mon-sun" title="Semana anterior — Segunda a Domingo (7 dias)">Sem. Ant. (Seg→Dom)</button>
                                    <button onClick={() => handleSetWeekSundayToSunday(0)} className="text-[10px] font-black uppercase text-purple-700 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded border border-purple-200" data-testid="btn-week-cur-mon-sun" title="Semana em curso — Segunda a Domingo (7 dias)">Semana (Seg→Dom)</button>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="input-start-date" />
                                <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white" value={endDate} onChange={e => setEndDate(e.target.value)} data-testid="input-end-date" />
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <button onClick={handleGenerate} disabled={isLoading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2">
                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />} Gerar
                            </button>
                            <button onClick={handleFetchCharts} disabled={chartsLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2" data-testid="button-generate-charts">
                                {chartsLoading ? <Loader2 size={18} className="animate-spin" /> : <BarChart3 size={18} />} Gráficos
                            </button>
                            {reportGenerated && (() => {
                                const pendCount = rowsData.filter(r => !r.isApproved).length;
                                const blocked = pendCount > 0;
                                return (
                                <>
                                    <button
                                        onClick={openInvoiceModal}
                                        disabled={blocked}
                                        title={blocked ? `Há ${pendCount} OS no período sem aprovação. Aprove todas antes de faturar.` : 'Gerar fatura do período'}
                                        className={`px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2 text-white ${blocked ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-700 hover:bg-red-800'}`}
                                        data-testid="btn-generate-invoice"
                                    >
                                        <Receipt size={18} /> Gerar Fatura{blocked ? ` (${pendCount} pendente${pendCount > 1 ? 's' : ''})` : ''}
                                    </button>
                                    <button onClick={() => { setShowPasteModal(true); setPasteText(''); setPasteResult(null); }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2" data-testid="btn-paste-spreadsheet">
                                        <ScanLine size={18} /> Colar Planilha
                                    </button>
                                    <button onClick={handleExportExcel} className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2">
                                        <FileSpreadsheet size={18} /> Excel
                                    </button>
                                    {isDhlBilling && (
                                        <button
                                            onClick={handleExportDhlFaturamento}
                                            className="px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2"
                                            style={{ background: 'linear-gradient(135deg, #D40511 0%, #B30410 100%)', color: '#FFCC00' }}
                                            data-testid="btn-export-dhl-faturamento"
                                            title="Exporta planilha-padrão DHL de faturamento (layout oficial)"
                                        >
                                            <FileSpreadsheet size={18} /> Relatório DHL
                                        </button>
                                    )}
                                    {isDhlBilling && (
                                        <button
                                            onClick={handleFillDhlSheet}
                                            disabled={fillingSheet}
                                            className="px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
                                            style={{ background: 'linear-gradient(135deg, #FFCC00 0%, #E6B800 100%)', color: '#7A0009' }}
                                            data-testid="btn-fill-dhl-sheet"
                                            title="Sobe uma planilha com os números de SE e o sistema preenche todos os dados (busca em todas as OS, qualquer data)"
                                        >
                                            {fillingSheet ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />} {fillingSheet ? 'Preenchendo...' : 'Preencher Planilha (SE)'}
                                        </button>
                                    )}
                                    <button onClick={handlePrint} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2">
                                        <Printer size={18} /> PDF
                                    </button>
                                </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            {chartsGenerated && (clientChartData.length > 0 || providerChartData.length > 0) && (
                <div className="no-print" data-testid="billing-charts-section">
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <button onClick={() => setChartTab('clientes')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${chartTab === 'clientes' ? 'bg-blue-700 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="tab-clientes"><Users size={12} />Clientes</button>
                        <button onClick={() => setChartTab('fornecedores')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${chartTab === 'fornecedores' ? 'bg-red-700 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="tab-fornecedores"><Building2 size={12} />Fornecedores</button>
                        <button onClick={() => setChartTab('geral')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${chartTab === 'geral' ? 'bg-gray-800 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="tab-geral"><List size={12} />Geral</button>
                        <div className="flex-1" />
                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-gray-500 mr-1">Ordenar:</span>
                            <button onClick={() => setSortMode('valor')} className={`text-[9px] font-black px-2 py-1 rounded transition-all ${sortMode === 'valor' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="sort-valor-global">R$ Valor</button>
                            <button onClick={() => setSortMode('pct')} className={`text-[9px] font-black px-2 py-1 rounded transition-all ${sortMode === 'pct' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="sort-pct-global">% Margem</button>
                        </div>
                    </div>

                    {chartTab === 'clientes' && (
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-gray-100">
                            <div className="p-2 bg-blue-700 text-white rounded-lg"><Users size={14} /></div>
                            <div>
                                <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest">Faturamento por Cliente</h4>
                                <p className="text-[10px] text-gray-400 font-bold mt-0.5">{allPeriodMissions.length} missões &middot; Total: {fmtBRL(clientChartData.reduce((s, d) => s + d.valor, 0))}</p>
                            </div>
                        </div>
                        <div className="space-y-1">
                            {clientChartData.map((item, i) => {
                                const maxVal = clientChartData[0]?.valor || 1;
                                const pctWidth = Math.max(3, (item.valor / maxVal) * 100);
                                const isExpanded = expandedClient === item.nome;
                                return (
                                    <div key={i}>
                                        <div className={`cursor-pointer rounded-lg p-2 transition-all hover:bg-gray-50 ${isExpanded ? 'bg-blue-50/50 ring-1 ring-blue-200' : ''}`} onClick={() => setExpandedClient(isExpanded ? null : item.nome)} data-testid={`chart-client-row-${i}`}>
                                            <div className="flex items-center justify-between mb-0.5">
                                                <div className="flex items-center gap-1.5 min-w-0 max-w-[55%]">
                                                    {isExpanded ? <ChevronDown size={12} className="text-blue-600 shrink-0" /> : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
                                                    <span className="text-[12px] font-black text-gray-800 truncate" title={item.fullName}>{item.nome}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-black text-gray-700">{fmtBRL(item.valor)}</span>
                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${item.pct >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{item.pct}%</span>
                                                </div>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-5 relative overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctWidth}%`, backgroundColor: CHART_COLORS_CLIENT[i % CHART_COLORS_CLIENT.length] }} />
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-[9px] text-gray-400 font-bold">{item.count} missões</span>
                                                <span className="text-[9px] text-gray-400 font-bold">Custo: {fmtBRL(item.custo)}</span>
                                                <span className={`text-[9px] font-bold ${item.lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Lucro: {fmtBRL(item.lucro)}</span>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="ml-4 mr-1 mt-1 mb-2 border border-blue-100 rounded-lg overflow-hidden animate-fade-in">
                                                <table className="w-full text-[10px]">
                                                    <thead>
                                                        <tr className="bg-blue-50">
                                                            <th className="text-left px-2 py-1.5 font-black text-blue-800 uppercase">OS</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-blue-800 uppercase">Data</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-blue-800 uppercase">Rota</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-blue-800 uppercase">Fornecedor</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-blue-800 uppercase">KM</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-blue-800 uppercase">Receita</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-blue-800 uppercase">Custo</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-blue-800 uppercase">Lucro</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-blue-800 uppercase">%</th>
                                                            <th className="px-1 py-1.5 w-6"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {[...item.missions].sort((a, b) => sortMode === 'valor' ? a.lucro - b.lucro : a.pct - b.pct).map((m, mi) => (
                                                            <tr key={mi} className={`border-t border-blue-50 ${m.lucro < 0 ? 'bg-red-50' : mi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                                <td className="px-2 py-1 font-black text-gray-800">{m.id.replace('GTM-', '')}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold">{m.date}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[120px]" title={m.route}>{m.route}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[100px]" title={m.provider}>{m.provider}</td>
                                                                <td className="px-2 py-1 text-right text-gray-600 font-bold">{m.km > 0 ? Math.round(m.km) : '-'}</td>
                                                                <td className="px-2 py-1 text-right font-bold text-blue-700">{fmtBRL(m.revenue)}</td>
                                                                <td className="px-2 py-1 text-right font-bold text-red-600">{m.isSameOs && (m.cost || 0) === 0 ? <span className="text-amber-600 text-[9px] font-black uppercase tracking-wider" title="Custo zerado: missão compartilha OS principal (reaproveitamento)">MESMA OS</span> : fmtBRL(m.cost)}</td>
                                                                <td className={`px-2 py-1 text-right font-black ${m.lucro >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{fmtBRL(m.lucro)}</td>
                                                                <td className={`px-2 py-1 text-right font-black ${m.pct >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{m.pct}%</td>
                                                                <td className="px-1 py-1 text-center">
                                                                    <button onClick={(e) => handleOpenOS(m.id, e)} className="p-1.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800 transition-colors border border-emerald-200" title="Abrir conferência"><ExternalLink size={12} /></button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    )}

                    {chartTab === 'fornecedores' && (
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-gray-100">
                            <div className="p-2 bg-red-700 text-white rounded-lg"><Building2 size={14} /></div>
                            <div>
                                <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest">Custo por Fornecedor</h4>
                                <p className="text-[10px] text-gray-400 font-bold mt-0.5">{allPeriodMissions.length} missões &middot; Total: {fmtBRL(providerChartData.reduce((s, d) => s + d.valor, 0))}</p>
                            </div>
                        </div>
                        <div className="space-y-1">
                            {providerChartData.map((item, i) => {
                                const maxVal = providerChartData[0]?.valor || 1;
                                const pctWidth = Math.max(3, (item.valor / maxVal) * 100);
                                const isExpanded = expandedProvider === item.nome;
                                return (
                                    <div key={i}>
                                        <div className={`cursor-pointer rounded-lg p-2 transition-all hover:bg-gray-50 ${isExpanded ? 'bg-red-50/50 ring-1 ring-red-200' : ''}`} onClick={() => setExpandedProvider(isExpanded ? null : item.nome)} data-testid={`chart-provider-row-${i}`}>
                                            <div className="flex items-center justify-between mb-0.5">
                                                <div className="flex items-center gap-1.5 min-w-0 max-w-[55%]">
                                                    {isExpanded ? <ChevronDown size={12} className="text-red-600 shrink-0" /> : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
                                                    <span className="text-[12px] font-black text-gray-800 truncate" title={item.fullName}>{item.nome}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-black text-gray-700">{fmtBRL(item.valor)}</span>
                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${item.pct >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{item.pct}%</span>
                                                </div>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-5 relative overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctWidth}%`, backgroundColor: CHART_COLORS_PROVIDER[i % CHART_COLORS_PROVIDER.length] }} />
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-[9px] text-gray-400 font-bold">{item.count} missões</span>
                                                <span className="text-[9px] text-gray-400 font-bold">Receita: {fmtBRL(item.receita)}</span>
                                                <span className={`text-[9px] font-bold ${item.lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Lucro: {fmtBRL(item.lucro)}</span>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="ml-4 mr-1 mt-1 mb-2 border border-red-100 rounded-lg overflow-hidden animate-fade-in">
                                                <div className="flex items-center gap-1 px-2 py-1.5 bg-red-50/80 border-b border-red-100">
                                                    <span className="text-[9px] font-bold text-red-600 mr-1">Ordenar:</span>
                                                    <button onClick={(e) => { e.stopPropagation(); setSortMode('valor'); }} className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${sortMode === 'valor' ? 'bg-red-600 text-white' : 'bg-white text-red-600 border border-red-200 hover:bg-red-50'}`} data-testid="sort-valor-provider">R$ Valor</button>
                                                    <button onClick={(e) => { e.stopPropagation(); setSortMode('pct'); }} className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${sortMode === 'pct' ? 'bg-red-600 text-white' : 'bg-white text-red-600 border border-red-200 hover:bg-red-50'}`} data-testid="sort-pct-provider">% Margem</button>
                                                </div>
                                                <table className="w-full text-[10px]">
                                                    <thead>
                                                        <tr className="bg-red-50">
                                                            <th className="text-left px-2 py-1.5 font-black text-red-800 uppercase">OS</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-red-800 uppercase">Data</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-red-800 uppercase">Rota</th>
                                                            <th className="text-left px-2 py-1.5 font-black text-red-800 uppercase">Cliente</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-red-800 uppercase">KM</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-red-800 uppercase">Receita</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-red-800 uppercase">Custo</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-red-800 uppercase">Lucro</th>
                                                            <th className="text-right px-2 py-1.5 font-black text-red-800 uppercase">%</th>
                                                            <th className="px-1 py-1.5 w-6"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {[...item.missions].sort((a, b) => sortMode === 'valor' ? a.lucro - b.lucro : a.pct - b.pct).map((m, mi) => (
                                                            <tr key={mi} className={`border-t border-red-50 ${m.lucro < 0 ? 'bg-red-50' : mi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                                <td className="px-2 py-1 font-black text-gray-800">{m.id.replace('GTM-', '')}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold">{m.date}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[120px]" title={m.route}>{m.route}</td>
                                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[100px]" title={m.client}>{m.client}</td>
                                                                <td className="px-2 py-1 text-right text-gray-600 font-bold">{m.km > 0 ? Math.round(m.km) : '-'}</td>
                                                                <td className="px-2 py-1 text-right font-bold text-blue-700">{fmtBRL(m.revenue)}</td>
                                                                <td className="px-2 py-1 text-right font-bold text-red-600">{m.isSameOs && (m.cost || 0) === 0 ? <span className="text-amber-600 text-[9px] font-black uppercase tracking-wider" title="Custo zerado: missão compartilha OS principal (reaproveitamento)">MESMA OS</span> : fmtBRL(m.cost)}</td>
                                                                <td className={`px-2 py-1 text-right font-black ${m.lucro >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{fmtBRL(m.lucro)}</td>
                                                                <td className={`px-2 py-1 text-right font-black ${m.pct >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{m.pct}%</td>
                                                                <td className="px-1 py-1 text-center">
                                                                    <button onClick={(e) => handleOpenOS(m.id, e)} className="p-1.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800 transition-colors border border-emerald-200" title="Abrir conferência"><ExternalLink size={12} /></button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    )}

                    {chartTab === 'geral' && (
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-gray-100">
                            <div className="p-2 bg-gray-800 text-white rounded-lg"><List size={14} /></div>
                            <div className="flex-1">
                                <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest">Todas as OS do Período</h4>
                                <p className="text-[10px] text-gray-400 font-bold mt-0.5">{allMissionsGeneral.length} missões &middot; Receita: {fmtBRL(allMissionsGeneral.reduce((s, m) => s + m.revenue, 0))} &middot; Custo: {fmtBRL(allMissionsGeneral.reduce((s, m) => s + m.cost, 0))} &middot; Lucro: {fmtBRL(allMissionsGeneral.reduce((s, m) => s + m.lucro, 0))}</p>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] font-bold text-gray-500 mr-1">Ordenar:</span>
                                <button onClick={() => setSortMode('valor')} className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${sortMode === 'valor' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="sort-valor-geral">R$ Valor</button>
                                <button onClick={() => setSortMode('pct')} className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${sortMode === 'pct' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`} data-testid="sort-pct-geral">% Margem</button>
                            </div>
                        </div>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <div style={{ maxHeight: '600px', overflowY: 'auto' }} className="scrollbar-thin">
                                <table className="w-full text-[10px]">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-gray-100">
                                            <th className="text-left px-2 py-1.5 font-black text-gray-800 uppercase">OS</th>
                                            <th className="text-left px-2 py-1.5 font-black text-gray-800 uppercase">Data</th>
                                            <th className="text-left px-2 py-1.5 font-black text-gray-800 uppercase">Cliente</th>
                                            <th className="text-left px-2 py-1.5 font-black text-gray-800 uppercase">Fornecedor</th>
                                            <th className="text-left px-2 py-1.5 font-black text-gray-800 uppercase">Rota</th>
                                            <th className="text-right px-2 py-1.5 font-black text-gray-800 uppercase">KM</th>
                                            <th className="text-right px-2 py-1.5 font-black text-gray-800 uppercase">Receita</th>
                                            <th className="text-right px-2 py-1.5 font-black text-gray-800 uppercase">Custo</th>
                                            <th className="text-right px-2 py-1.5 font-black text-gray-800 uppercase">Lucro</th>
                                            <th className="text-right px-2 py-1.5 font-black text-gray-800 uppercase">%</th>
                                            <th className="px-1 py-1.5 w-6"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...allMissionsGeneral].sort((a, b) => sortMode === 'valor' ? a.lucro - b.lucro : a.pct - b.pct).map((m, mi) => (
                                            <tr key={mi} className={`border-t border-gray-100 ${m.lucro < 0 ? 'bg-red-50' : mi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                <td className="px-2 py-1 font-black text-gray-800">{m.id.replace('GTM-', '')}</td>
                                                <td className="px-2 py-1 text-gray-600 font-bold">{m.date}</td>
                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[100px]" title={m.client}>{m.client}</td>
                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[100px]" title={m.provider}>{m.provider}</td>
                                                <td className="px-2 py-1 text-gray-600 font-bold truncate max-w-[120px]" title={m.route}>{m.route}</td>
                                                <td className="px-2 py-1 text-right text-gray-600 font-bold">{m.km > 0 ? Math.round(m.km) : '-'}</td>
                                                <td className="px-2 py-1 text-right font-bold text-blue-700">{fmtBRL(m.revenue)}</td>
                                                <td className="px-2 py-1 text-right font-bold text-red-600">{m.isSameOs && (m.cost || 0) === 0 ? <span className="text-amber-600 text-[9px] font-black uppercase tracking-wider" title="Custo zerado: missão compartilha OS principal (reaproveitamento)">MESMA OS</span> : fmtBRL(m.cost)}</td>
                                                <td className={`px-2 py-1 text-right font-black ${m.lucro >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{fmtBRL(m.lucro)}</td>
                                                <td className={`px-2 py-1 text-right font-black ${m.pct >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>{m.pct}%</td>
                                                <td className="px-1 py-1 text-center">
                                                    <button onClick={(e) => handleOpenOS(m.id, e)} className="p-1.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800 transition-colors border border-emerald-200" title="Abrir conferência" data-testid={`open-os-${m.id}`}><ExternalLink size={12} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    )}
                </div>
            )}

            {reportGenerated && (
                <div id="print-area" className="bg-white p-4 w-full border border-gray-200 rounded-lg" style={{ position: 'relative', overflow: 'hidden' }}>
                    <div className="watermark-logo" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.04, pointerEvents: 'none', zIndex: 0, width: '400px', height: '400px' }}>
                        <img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                    <div style={{ position: 'relative', zIndex: 1 }}>
                    <div className="boletim-header mb-4 text-center" style={{ borderBottom: '2px solid #dc2626', paddingBottom: '8px' }}>
                        <h1 style={{ fontSize: '18px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', margin: 0, color: '#7f1d1d' }}>BOLETIM DE MEDIÇÃO</h1>
                        <p className="subtitle-line" style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: '#991b1b', margin: '4px 0' }}>{getPeriodLabel()}</p>
                        <p className="ref-line" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: '#b91c1c', margin: '2px 0' }}>REFERENTE A INTERMEDIAÇÃO DE SEGURANÇA E MONITORAMENTO DE CARGAS</p>
                        {hasFrozenMissions && (
                            <div data-testid="boletim-frozen-header" style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '4px 12px' }}>
                                <Lock size={12} style={{ color: '#92400e' }} />
                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>Dados Congelados — Documento Mestre para Faturamento</span>
                            </div>
                        )}
                        {isDhlBilling && dhlBandWarnings.length > 0 && (
                            <div data-testid="boletim-dhl-band-warning" className="no-print" style={{ marginTop: '8px', textAlign: 'left', background: '#fff7ed', border: '2px solid #ea580c', borderRadius: '8px', padding: '10px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <AlertCircle size={16} style={{ color: '#c2410c' }} />
                                    <span style={{ fontSize: '12px', fontWeight: 900, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Diagnóstico DHL — {dhlBandWarnings.length} OS com faixa de KM divergente da tabela aplicada
                                    </span>
                                </div>
                                <p style={{ fontSize: '11px', fontWeight: 600, color: '#9a3412', margin: '0 0 6px 0' }}>
                                    A faixa esperada é definida pelo KM total da viagem (ex.: 200 km → tabela 200KM). Ajuste a tabela das OS abaixo no Modal Financeiro — o aviso some automaticamente após a correção.
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {dhlBandWarnings.slice(0, 30).map(w => {
                                        const fullId = w.id.startsWith('GTM-') ? w.id : `GTM-${w.id}`;
                                        const mObj = missions.find(mm => mm.id === fullId);
                                        return (
                                            <button
                                                key={w.id}
                                                type="button"
                                                onClick={() => { if (mObj) setEditMission(mObj); }}
                                                disabled={!mObj}
                                                title={`Clique para abrir a Auditoria de Faturamento — KM real: ${w.kmTotal} | Esperado: ${w.expected}KM | Aplicado: ${w.actual}KM`}
                                                data-testid={`btn-edit-dhl-warning-${w.id}`}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fff', border: '1px solid #ea580c', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: 800, color: '#9a3412', cursor: mObj ? 'pointer' : 'not-allowed', textDecoration: 'underline' }}
                                            >
                                                <Pencil size={9} />
                                                {w.id}
                                                <span style={{ color: '#6b7280', fontWeight: 600 }}>{w.kmTotal}km</span>
                                                <span style={{ color: '#dc2626' }}>{w.actual}KM</span>
                                                <ArrowRight size={9} style={{ color: '#16a34a' }} />
                                                <span style={{ color: '#16a34a' }}>{w.expected}KM</span>
                                            </button>
                                        );
                                    })}
                                    {dhlBandWarnings.length > 30 && (
                                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#9a3412', alignSelf: 'center' }}>+{dhlBandWarnings.length - 30} OS</span>
                                    )}
                                </div>
                            </div>
                        )}
                        {rowsData.length > 0 && (
                            <div data-testid="boletim-pending-header" style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {rowsData.some(r => !r.isApproved) && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fce4e4', border: '1px solid #dc2626', borderRadius: '6px', padding: '4px 12px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 900, color: '#fff', backgroundColor: '#dc2626', borderRadius: '3px', padding: '0 4px' }}>!</span>
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>Linhas piscando = Missões pendentes</span>
                                </div>
                                )}
                                <div style={{ display: 'inline-flex', gap: '3px', background: '#f3f4f6', borderRadius: '6px', padding: '2px', border: '1px solid #d1d5db' }}>
                                    {([['todas', 'Todas'], ['aprovadas', 'Aprovadas'], ['pendentes', 'Pendentes']] as const).map(([val, label]) => (
                                        <button
                                            key={val}
                                            onClick={() => setBoletimFilter(val)}
                                            data-testid={`filter-${val}`}
                                            style={{
                                                fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px',
                                                padding: '3px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                                                backgroundColor: boletimFilter === val ? (val === 'pendentes' ? '#dc2626' : '#111827') : 'transparent',
                                                color: boletimFilter === val ? '#fff' : '#6b7280',
                                            }}
                                        >{label} {val === 'pendentes' ? `(${rowsData.filter(r => !r.isApproved).length})` : val === 'aprovadas' ? `(${rowsData.filter(r => r.isApproved).length})` : `(${rowsData.length})`}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="no-print" style={{ marginBottom: '10px', padding: '10px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }} data-testid="include-os-bar">
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Incluir OS de outro período:</span>
                        <input
                            type="text"
                            value={includeOsInput}
                            onChange={e => setIncludeOsInput(e.target.value)}
                            placeholder="Ex: 4261"
                            data-testid="input-include-os"
                            onKeyDown={e => { if (e.key === 'Enter') handleIncludeOs(); }}
                            style={{ flex: '0 0 160px', padding: '6px 10px', border: '1.5px solid #7dd3fc', borderRadius: '6px', fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', background: '#fff' }}
                        />
                        <button
                            onClick={handleIncludeOs}
                            disabled={!!actionBusy}
                            data-testid="btn-include-os"
                            style={{ padding: '6px 14px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: actionBusy ? 'not-allowed' : 'pointer', opacity: actionBusy ? 0.6 : 1 }}
                        >+ Incluir nesta data</button>
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, fontStyle: 'italic' }}>
                            Útil pra OS que viajou em outro mês mas precisa ser faturada neste período.
                            Pra remover uma OS deste boletim, clique no <span style={{ color: '#dc2626', fontWeight: 900 }}>X</span> ao lado do número.
                        </span>
                    </div>

                    <div className="report-table-scroll" style={{ overflowX: 'auto', maxHeight: '75vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', border: '1.5px solid #b91c1c', borderRadius: '8px' }}>
                        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                            <colgroup>
                                <col style={{ minWidth: '30px', width: '30px' }} />
                                <col style={{ minWidth: '45px' }} />
                                {(isCeslogBilling || isDhlBilling) && <col style={{ minWidth: '70px' }} />}
                                <col style={{ minWidth: '80px' }} />
                                <col style={{ minWidth: '250px' }} />
                                <col style={{ minWidth: '70px' }} />
                                <col style={{ minWidth: '60px' }} />
                                <col style={{ minWidth: '60px' }} />
                                <col style={{ minWidth: '65px' }} />
                                <col style={{ minWidth: '65px' }} />
                                <col style={{ minWidth: '70px' }} />
                                <col style={{ minWidth: '60px' }} />
                                <col style={{ minWidth: '110px' }} />
                                <col style={{ minWidth: '110px' }} />
                                <col style={{ minWidth: '70px' }} />
                                <col style={{ minWidth: '60px' }} />
                                <col style={{ minWidth: '70px' }} />
                                <col style={{ minWidth: '70px' }} />
                                <col style={{ minWidth: '70px' }} />
                                <col style={{ minWidth: '60px' }} />
                                <col style={{ minWidth: '60px' }} />
                                <col style={{ minWidth: '60px' }} />
                                <col style={{ minWidth: '65px' }} />
                                <col style={{ minWidth: '80px' }} />
                                <col style={{ minWidth: '85px' }} />
                                <col style={{ minWidth: '65px' }} />
                                <col style={{ minWidth: '80px' }} />
                                <col style={{ minWidth: '85px' }} />
                                <col style={{ minWidth: '85px' }} />
                                <col style={{ minWidth: '100px' }} />
                            </colgroup>
                            <thead>
                                <tr className="group-hdr">
                                    <th style={groupHeaderStyle} colSpan={9 + (isCeslogBilling ? 1 : 0) + (isDhlBilling ? 2 : 0) + (isCevaBilling ? 1 : 0)}>TABELA ACORDADA</th>
                                    <th style={groupHeaderStyle} colSpan={6}>INFORMAÇÕES DA VIAGEM</th>
                                    <th style={grpKm} colSpan={3}>KILOMETRAGEM</th>
                                    <th style={grpHr} colSpan={3}>HORÁRIOS</th>
                                    <th style={grpKmExc} colSpan={3}>KM EXCEDENTE</th>
                                    <th style={grpHrExc} colSpan={3}>HORA EXCEDENTE</th>
                                    <th style={grpVal} colSpan={2}>VALORES</th>
                                </tr>
                                <tr className="sub-hdr">
                                    <th style={{ ...headerStyle, width: '30px', minWidth: '30px' }}>#</th>
                                    <th style={headerStyle}>Nº</th>
                                    {isCeslogBilling && <th style={{ ...headerStyle, backgroundColor: '#7e22ce', color: '#fff' }}>REFERÊNCIA</th>}
                                    {isDhlBilling && <th style={{ ...headerStyle, backgroundColor: '#D40511', color: '#FFCC00', fontSize: '17px', letterSpacing: '0.5px' }}>S.E.</th>}
                                    {isDhlBilling && <th style={{ ...headerStyle, backgroundColor: '#7f1d1d', color: '#FFCC00', fontSize: '17px', letterSpacing: '0.5px' }}>SM</th>}
                                    {isCevaBilling && <th style={{ ...headerStyle, backgroundColor: '#0f766e', color: '#fff' }}>TIPO</th>}
                                    <th style={headerStyle}>STATUS</th>
                                    <th style={{ ...headerStyle, textAlign: 'left' }}>ROTA</th>
                                    <th style={headerStyle}>VALOR</th>
                                    <th style={headerStyle}>HR FRANQ</th>
                                    <th style={headerStyle}>KM FRANQ</th>
                                    <th style={headerStyle}>HR EXTRA</th>
                                    <th style={headerStyle}>KM EXTRA</th>
                                    <th style={headerStyle}>DATA INÍCIO</th>
                                    <th style={headerStyle}>HORA INI</th>
                                    <th style={headerStyle}>VIATURA</th>
                                    <th style={headerStyle}>VEÍC. ESCOLT.</th>
                                    <th style={headerStyle}>DATA FIM</th>
                                    <th style={headerStyle}>HORA FIM</th>
                                    <th style={hdrKm}>INICIAL</th>
                                    <th style={hdrKm}>FINAL</th>
                                    <th style={hdrKm}>TOTAL</th>
                                    <th style={hdrHr}>INICIAL</th>
                                    <th style={hdrHr}>FINAL</th>
                                    <th style={hdrHr}>TOTAL</th>
                                    <th style={hdrKmExc}>KM</th>
                                    <th style={hdrKmExc}>VALOR</th>
                                    <th style={hdrKmExc}>TOTAL</th>
                                    <th style={hdrHrExc}>HORA</th>
                                    <th style={hdrHrExc}>VALOR</th>
                                    <th style={hdrHrExc}>TOTAL</th>
                                    <th style={hdrVal}>PEDÁGIO</th>
                                    <th style={hdrVal}>TOTAL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const filtered = boletimFilter === 'aprovadas' ? rowsData.filter(r => r.isApproved) : boletimFilter === 'pendentes' ? rowsData.filter(r => !r.isApproved) : rowsData;
                                    return filtered.length === 0 ? (
                                    <tr><td colSpan={29 + (isCeslogBilling ? 1 : 0) + (isDhlBilling ? 2 : 0) + (isCevaBilling ? 1 : 0)} style={{ ...cellStyle, padding: '20px', fontSize: '14px', fontWeight: 700, color: '#9ca3af' }}>{boletimFilter !== 'todas' ? `NENHUMA MISSÃO ${boletimFilter === 'aprovadas' ? 'APROVADA' : 'PENDENTE'} NO PERÍODO.` : 'NENHUMA MISSÃO NO PERÍODO.'}</td></tr>
                                ) : (
                                    filtered.map((r, i) => (
                                        <tr key={i} title={r.frozen ? `Dados Congelados - Aprovado por ${r.frozenBy}` : !r.isApproved ? `Status: ${r.missionStatus} (não aprovada)` : ''} style={(() => {
                                            const s = (r.missionStatus || '').toLowerCase();
                                            if (s.includes('cancel')) return { backgroundColor: '#fee2e2' };
                                            if (r.isApproved || s.includes('conclu')) return { backgroundColor: '#dcfce7' };
                                            return { backgroundColor: '#fce4e4', animation: 'blink-pending 2s ease-in-out infinite' };
                                        })()}>
                                            <td style={{ ...cellStyle, fontSize: '13px', color: '#9ca3af', textAlign: 'center', padding: '2px' }}>{i + 1}</td>
                                            <td style={cellBold}>
                                                <span onClick={(e) => handleOpenOS(`GTM-${r.id}`, e)} data-testid={`boletim-open-os-${r.id}`} style={{ cursor: 'pointer' }}>
                                                    {r.frozen && <Lock size={8} style={{ display: 'inline', marginRight: '2px', color: '#92400e' }} />}
                                                    {!r.isApproved && <span style={{ display: 'inline-block', fontSize: '7px', fontWeight: 900, color: '#fff', backgroundColor: '#dc2626', borderRadius: '3px', padding: '0 3px', marginRight: '2px', verticalAlign: 'middle' }}>{r.missionStatus.toUpperCase()}</span>}
                                                    <span style={{ color: '#1d4ed8', textDecoration: 'underline' }}>{r.id}</span>
                                                </span>
                                                <button
                                                    type="button"
                                                    className="no-print"
                                                    onClick={(e) => { e.stopPropagation(); handleExcludeRow(r.id); }}
                                                    disabled={actionBusy === `GTM-${r.id}`}
                                                    title="Remover esta OS do boletim"
                                                    data-testid={`btn-exclude-os-${r.id}`}
                                                    style={{ marginLeft: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', border: 'none', borderRadius: '3px', background: '#fee2e2', color: '#dc2626', fontSize: '10px', fontWeight: 900, cursor: actionBusy ? 'not-allowed' : 'pointer', verticalAlign: 'middle', lineHeight: 1, padding: 0, opacity: actionBusy === `GTM-${r.id}` ? 0.4 : 1 }}
                                                >×</button>
                                            </td>
                                            {isCeslogBilling && <td style={{ ...cellStyle, fontWeight: 700, color: '#7e22ce', fontSize: '14px' }}>{r.referenceNumber || '-'}</td>}
                                            {isDhlBilling && <td style={{ ...cellStyle, fontWeight: 900, color: '#D40511', fontSize: '20px', backgroundColor: '#fffbe6', letterSpacing: '0.8px', padding: '10px 12px' }} data-testid={`cell-se-${r.id}`}>{r.seNumber || '-'}</td>}
                                            {isDhlBilling && <td style={{ ...cellStyle, fontWeight: 900, color: '#7f1d1d', fontSize: '18px', backgroundColor: '#fff7ed', letterSpacing: '0.8px', padding: '10px 12px' }} data-testid={`cell-sm-${r.id}`}>{r.smNumber || '-'}</td>}
                                            {isCevaBilling && <td style={{ ...cellStyle, fontWeight: 800, color: r.tipo === 'PRONTA RESPOSTA' ? '#9a3412' : '#0f766e', fontSize: '11px', backgroundColor: r.tipo === 'PRONTA RESPOSTA' ? '#fff7ed' : '#f0fdfa', letterSpacing: '0.3px' }} data-testid={`cell-tipo-${r.id}`}>{r.tipo}</td>}
                                            <td style={{ ...cellStyle, fontWeight: 800, fontSize: '13px', textTransform: 'uppercase', color: r.isApproved ? '#065f46' : '#991b1b', backgroundColor: r.isApproved ? '#ecfdf5' : '#fee2e2' }} data-testid={`cell-status-${r.id}`}>{r.missionStatus}</td>
                                            <td className="route-cell" style={{ ...cellStyle, textAlign: 'left', whiteSpace: 'normal', wordWrap: 'break-word', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.3', fontSize: '15px', maxWidth: '340px' }} title={r.route}>{r.route}</td>
                                            <td style={cellStyle}>{fmtBRL(r.activationFee)}</td>
                                            <td style={cellStyle}>{r.franchiseHoursFmt}</td>
                                            <td style={isDhlBilling && dhlWarningsById.has(r.id) ? { ...cellStyle, background: '#fff7ed', color: '#9a3412', fontWeight: 900, border: '1.5px solid #ea580c' } : cellStyle} title={isDhlBilling && dhlWarningsById.has(r.id) ? `Divergente: KM real ${dhlWarningsById.get(r.id)!.kmTotal} → tabela esperada ${dhlWarningsById.get(r.id)!.expected}KM (aplicada ${dhlWarningsById.get(r.id)!.actual}KM)` : undefined}>
                                                {fmtNum(r.franchiseKm)}
                                                {isDhlBilling && dhlWarningsById.has(r.id) && (
                                                    <span className="no-print" style={{ display: 'inline-block', marginLeft: '4px', fontSize: '8px', fontWeight: 900, color: '#fff', backgroundColor: '#ea580c', borderRadius: '3px', padding: '0 3px', verticalAlign: 'middle' }}>!{dhlWarningsById.get(r.id)!.expected}</span>
                                                )}
                                            </td>
                                            <td style={cellStyle}>{fmtBRL(r.unitHr)}</td>
                                            <td style={cellStyle}>{fmtBRL(r.unitKm)}</td>
                                            <td style={cellStyle}>{r.startDate}</td>
                                            <td style={cellStyle}>{r.startTime}</td>
                                            <td style={{ ...cellMono }}>{r.viatura}</td>
                                            <td style={{ ...cellMono }}>{r.cargoPlate}</td>
                                            <td style={cellStyle}>{r.endDate}</td>
                                            <td style={cellStyle}>{r.endTime}</td>
                                            <td style={{ ...cellMono, backgroundColor: bgKm }}>{fmtNum(r.kmStart)}</td>
                                            <td style={{ ...cellMono, backgroundColor: bgKm }}>{fmtNum(r.kmEnd)}</td>
                                            <td style={{ ...cellMonoBold, backgroundColor: bgKm }}>{fmtNum(r.kmTotal)}</td>
                                            <td style={{ ...cellMono, backgroundColor: bgHr }}>{r.timeStart}</td>
                                            <td style={{ ...cellMono, backgroundColor: bgHr }}>{r.timeEnd}</td>
                                            <td style={{ ...cellMonoBold, backgroundColor: bgHr }}>{r.timeTotal}</td>
                                            <td style={{ ...cellMono, backgroundColor: bgKmExc }}>{r.kmExtraQtd > 0 ? fmtNum(r.kmExtraQtd) : '-'}</td>
                                            <td style={{ ...cellMono, backgroundColor: bgKmExc }}>{r.kmExtraQtd > 0 ? fmtBRL(r.kmExtraUnit) : '-'}</td>
                                            <td style={{ ...cellMono, backgroundColor: bgKmExc }}>{r.kmExtraTotal > 0 ? fmtBRL(r.kmExtraTotal) : 'R$ 0,00'}</td>
                                            <td style={{ ...cellMono, backgroundColor: bgHrExc }}>{r.hrExtraQtd > 0 ? fmtHHMM(r.hrExtraQtd) : '-'}</td>
                                            <td style={{ ...cellMono, backgroundColor: bgHrExc }}>{r.hrExtraQtd > 0 ? fmtBRL(r.hrExtraUnit) : '-'}</td>
                                            <td style={{ ...cellMono, backgroundColor: bgHrExc }}>{r.hrExtraTotal > 0 ? fmtBRL(r.hrExtraTotal) : 'R$ 0,00'}</td>
                                            <td style={{ ...cellMono, backgroundColor: bgVal }}>{r.tollVal > 0 ? fmtBRL(r.tollVal) : 'R$ 0,00'}</td>
                                            <td style={{ ...cellMonoBold, backgroundColor: bgVal }}>{fmtBRL(r.totalGeral)}</td>
                                        </tr>
                                    ))
                                );
                                })()}
                            </tbody>
                            {rowsData.length > 0 && (
                                <tfoot>
                                    <tr style={{ backgroundColor: '#7f1d1d', color: '#fff' }}>
                                        <td colSpan={28 + (isCeslogBilling ? 1 : 0) + (isDhlBilling ? 2 : 0) + (isCevaBilling ? 1 : 0)} style={{ ...cellStyle, textAlign: 'right', fontWeight: 900, fontSize: '17px', color: '#fff', border: '1px solid #991b1b', padding: '10px 12px' }}>TOTAL</td>
                                        <td style={{ ...cellStyle, fontWeight: 900, fontSize: '18px', color: '#fff', border: '1px solid #991b1b', padding: '10px 12px' }}>{fmtBRL(grandTotal)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    <div className="sign-section" style={{ marginTop: '32px', display: 'flex', justifyContent: 'space-between', padding: '16px 24px 0', alignItems: 'flex-end', borderTop: '2px solid #dc2626' }}>
                        <div className="sign-box" style={{ textAlign: 'center', width: '280px' }}>
                            <div style={{ borderTop: '1.5px solid #7f1d1d', paddingTop: '4px', marginTop: '34px' }}>
                                <div className="sign-role" style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' as const, color: '#7f1d1d', letterSpacing: '1px' }}>GRUPO TM SEG</div>
                                <div className="sign-cnpj" style={{ fontSize: '10px', fontWeight: 600, color: '#b91c1c', letterSpacing: '0.5px', marginTop: '2px' }}>CNPJ: 28.804.378/0001-67</div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'center', flex: 1, padding: '0 40px' }}>
                            <div className="sign-system" style={{ fontSize: '10px', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Documento gerado eletronicamente pelo GRUPO TM SEG</div>
                        </div>
                        <div className="sign-box" style={{ textAlign: 'center', width: '280px' }}>
                            <div style={{ borderTop: '1.5px solid #7f1d1d', paddingTop: '4px', marginTop: '34px' }}>
                                <div className="sign-cliente" style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' as const, color: '#7f1d1d', letterSpacing: '1px' }}>Assinatura / Carimbo Cliente</div>
                                <div className="sign-data" style={{ fontSize: '10px', fontWeight: 600, color: '#991b1b', marginTop: '2px' }}>Data: ____/____/________</div>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
            )}
            {renderInvoiceModal()}

            {showPasteModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" data-testid="paste-modal-overlay">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="bg-gradient-to-r from-blue-700 to-blue-900 px-6 py-4 flex items-center justify-between">
                            <h3 className="font-black text-white uppercase text-xs tracking-widest flex items-center gap-2"><ScanLine size={16} /> Comparar Planilha do Cliente</h3>
                            <button onClick={() => setShowPasteModal(false)} className="text-white/70 hover:text-white" data-testid="btn-close-paste-modal"><X size={20} /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {!pasteResult ? (
                                <div>
                                    <p className="text-sm text-gray-600 mb-3 font-semibold">Cole abaixo os dados copiados da planilha do cliente (selecione as linhas no Excel e use Ctrl+C, depois Ctrl+V aqui):</p>
                                    <textarea
                                        className="w-full h-48 border-2 border-blue-200 rounded-xl p-3 text-xs font-mono focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                                        placeholder="Selecione as linhas de dados no Excel (sem cabeçalho) e cole aqui com Ctrl+V..."
                                        value={pasteText}
                                        onChange={e => setPasteText(e.target.value)}
                                        data-testid="textarea-paste-spreadsheet"
                                    />
                                    <div className="mt-4 flex gap-3">
                                        <button
                                            onClick={handlePasteCompare}
                                            disabled={!pasteText.trim()}
                                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-widest py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40"
                                            data-testid="btn-compare-spreadsheet"
                                        >
                                            <Search size={16} /> Comparar com Sistema
                                        </button>
                                        <button onClick={() => setShowPasteModal(false)} className="px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs uppercase py-3 rounded-xl">Cancelar</button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div className="grid grid-cols-4 gap-3 mb-3">
                                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                                            <div className="text-2xl font-black text-green-700">{(pasteResult.validated || []).length}</div>
                                            <div className="text-[9px] font-bold text-green-600 uppercase">Validadas</div>
                                        </div>
                                        <div className={`border rounded-xl p-3 text-center ${pasteResult.divergences.length > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                                            <div className={`text-2xl font-black ${pasteResult.divergences.length > 0 ? 'text-red-700' : 'text-green-700'}`}>{pasteResult.divergences.length}</div>
                                            <div className={`text-[9px] font-bold uppercase ${pasteResult.divergences.length > 0 ? 'text-red-600' : 'text-green-600'}`}>Divergências</div>
                                        </div>
                                        <div className={`border rounded-xl p-3 text-center ${pasteResult.onlySystem.length > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                                            <div className={`text-2xl font-black ${pasteResult.onlySystem.length > 0 ? 'text-orange-700' : 'text-green-700'}`}>{pasteResult.onlySystem.length}</div>
                                            <div className={`text-[9px] font-bold uppercase ${pasteResult.onlySystem.length > 0 ? 'text-orange-600' : 'text-green-600'}`}>Só no Sistema</div>
                                        </div>
                                        <div className={`border rounded-xl p-3 text-center ${pasteResult.onlySheet.length > 0 ? 'bg-purple-50 border-purple-200' : 'bg-green-50 border-green-200'}`}>
                                            <div className={`text-2xl font-black ${pasteResult.onlySheet.length > 0 ? 'text-purple-700' : 'text-green-700'}`}>{pasteResult.onlySheet.length}</div>
                                            <div className={`text-[9px] font-bold uppercase ${pasteResult.onlySheet.length > 0 ? 'text-purple-600' : 'text-green-600'}`}>Só na Planilha</div>
                                        </div>
                                    </div>

                                    {(pasteResult.validated || []).length > 0 && (
                                        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-4 flex items-center gap-2">
                                            <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                                            <span className="text-xs text-green-700 font-semibold">{(pasteResult.validated || []).length} missões validadas automaticamente (diferença ≤ R$ 5,00)</span>
                                        </div>
                                    )}

                                    {pasteResult.divergences.length === 0 && pasteResult.onlySystem.length === 0 && pasteResult.onlySheet.length === 0 && (
                                        <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-center mb-4">
                                            <CheckCircle2 size={32} className="mx-auto text-green-600 mb-2" />
                                            <p className="font-black text-green-700 uppercase text-sm">Nenhuma divergência encontrada!</p>
                                            <p className="text-xs text-green-600 mt-1">Todas as {(pasteResult.validated || []).length} OS foram validadas automaticamente.</p>
                                        </div>
                                    )}

                                    {pasteResult.divergences.length > 0 && (
                                        <div className="mb-4">
                                            <h4 className="font-black text-red-700 uppercase text-[10px] tracking-widest mb-3 flex items-center gap-1">
                                                <ArrowLeftRight size={12} /> Divergências Encontradas ({pasteResult.divergences.length})
                                            </h4>
                                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                                                {pasteResult.divergences.map((d: any, i: number) => (
                                                    <div key={i} className="border border-red-200 rounded-xl overflow-hidden" data-testid={`divergence-row-${d.id}`}>
                                                        <div className="bg-gradient-to-r from-gray-900 to-red-900 px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
                                                            <span className="font-black text-white text-xs tracking-wide">OS GTM-{d.id}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="bg-red-500 text-white font-black text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap">
                                                                    {fmtBRL(Math.abs(d.sysTot - d.sheetTot))}
                                                                </span>
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingDivergence({ id: d.id, missionId: `GTM-${d.id}`, field: 'Total', currentValue: d.sysTot, isCurrency: true, sheetValue: d.sheetTot, sysTotal: d.sysTot, sheetTotal: d.sheetTot });
                                                                        setDivEditInput((d.sheetTot ?? 0).toFixed(2).replace('.', ','));
                                                                        setDivEditError('');
                                                                    }}
                                                                    className="bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white font-black text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-md flex items-center gap-1 whitespace-nowrap shadow-sm"
                                                                    data-testid={`btn-accept-sheet-${d.id}`}
                                                                    title={`Gravar ${fmtBRL(d.sheetTot)} como total da OS`}
                                                                >
                                                                    <Check size={11} /> Aceitar {fmtBRL(d.sheetTot)}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <table className="w-full text-[11px]">
                                                            <thead>
                                                                <tr className="bg-gray-100">
                                                                    <th className="text-left px-3 py-1.5 font-black text-gray-600 uppercase text-[9px] tracking-wider w-[30%]">Campo</th>
                                                                    <th className="text-right px-3 py-1.5 font-black text-gray-900 uppercase text-[9px] tracking-wider w-[28%]">Sistema</th>
                                                                    <th className="text-center px-1 py-1.5 w-[6%]"></th>
                                                                    <th className="text-right px-3 py-1.5 font-black text-gray-900 uppercase text-[9px] tracking-wider w-[28%] bg-gray-50">Planilha</th>
                                                                    <th className="text-center px-2 py-1.5 w-[8%]"></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {(d.fields || []).map((f: any, j: number) => {
                                                                    const sysHigher = f.sysVal > f.sheetVal;
                                                                    const isDiff = f.isDivergent !== false && Math.abs(f.sysVal - f.sheetVal) > 0.02;
                                                                    return (
                                                                        <tr key={j} className={j % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                                            <td className={`px-3 py-1.5 font-bold ${isDiff ? 'text-red-700' : 'text-blue-700'}`}>{f.label}</td>
                                                                            <td className={`px-3 py-1.5 text-right font-mono font-bold ${isDiff && sysHigher ? 'text-red-700 bg-red-50' : isDiff ? 'text-gray-700' : 'text-blue-700 bg-blue-50'}`}>
                                                                                {f.isCurrency ? fmtBRL(f.sysVal) : f.sysVal.toLocaleString('pt-BR')}
                                                                            </td>
                                                                            <td className="text-center px-1 py-1.5">
                                                                                {isDiff ? <ArrowRight size={10} className="text-red-400 mx-auto" /> : <Check size={10} className="text-blue-500 mx-auto" />}
                                                                            </td>
                                                                            <td className={`px-3 py-1.5 text-right font-mono font-bold ${isDiff ? 'text-red-700 bg-red-50' : 'text-blue-700 bg-blue-50'}`}>
                                                                                {f.isCurrency ? fmtBRL(f.sheetVal) : f.sheetVal.toLocaleString('pt-BR')}
                                                                            </td>
                                                                            <td className="text-center px-2 py-1.5">
                                                                                {isDiff && (
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setEditingDivergence({ id: d.id, missionId: `GTM-${d.id}`, field: f.label, currentValue: f.sysVal, isCurrency: f.isCurrency, sheetValue: f.sheetVal, sysTotal: d.sysTot, sheetTotal: d.sheetTot });
                                                                                            setDivEditInput((d.sheetTot ?? 0).toFixed(2).replace('.', ','));
                                                                                            setDivEditError('');
                                                                                        }}
                                                                                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                                                                                        title="Editar no sistema"
                                                                                        data-testid={`edit-field-${d.id}-${j}`}
                                                                                    >
                                                                                        <Pencil size={10} />
                                                                                    </button>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {pasteResult.onlySystem.length > 0 && (
                                        <div className="mb-4">
                                            <h4 className="font-black text-gray-700 uppercase text-[10px] tracking-widest mb-2 flex items-center gap-1">
                                                <AlertCircle size={12} className="text-orange-600" /> Só no Sistema ({pasteResult.onlySystem.length})
                                            </h4>
                                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {pasteResult.onlySystem.map((s: any, i: number) => (
                                                        <span key={i} className="bg-gray-900 text-white font-black text-[10px] px-2.5 py-1 rounded-md">GTM-{s.id} <span className="text-gray-400 ml-1">{fmtBRL(s.totalGeral)}</span></span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {pasteResult.onlySheet.length > 0 && (
                                        <div className="mb-4">
                                            <h4 className="font-black text-gray-700 uppercase text-[10px] tracking-widest mb-2 flex items-center gap-1">
                                                <AlertCircle size={12} className="text-red-600" /> Só na Planilha ({pasteResult.onlySheet.length})
                                            </h4>
                                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {pasteResult.onlySheet.map((s: any, i: number) => (
                                                        <span key={i} className="bg-red-700 text-white font-black text-[10px] px-2.5 py-1 rounded-md">OS {s.id} <span className="text-red-300 ml-1">R$ {s.totalCol.toFixed(2)}</span></span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="mb-4 bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-4">
                                        <h4 className="font-black text-gray-400 uppercase text-[9px] tracking-widest mb-3">Resumo Financeiro</h4>
                                        {(() => {
                                            const totalSys = missions.reduce((s: number, m: any) => {
                                                const rev = m.revenue_value ?? 0;
                                                const toll = Math.max(0, m.toll_value || 0);
                                                return s + rev + toll;
                                            }, 0);
                                            const validatedSheet = (pasteResult.validated || []).reduce((s: number, v: any) => s + v.sheet.totalCol, 0);
                                            const divSheet = pasteResult.divergences.reduce((s: number, d: any) => s + d.sheetTot, 0);
                                            const onlySheetTot = pasteResult.onlySheet.reduce((s: number, d: any) => s + (d.totalCol || 0), 0);
                                            const totalSheet = validatedSheet + divSheet + onlySheetTot;
                                            const totalDiff = totalSys - totalSheet;
                                            return (
                                                <div className="grid grid-cols-3 gap-3 text-center">
                                                    <div>
                                                        <div className="text-[8px] font-bold text-gray-500 uppercase mb-1">Total Sistema</div>
                                                        <div className="text-sm font-black text-white">{fmtBRL(totalSys)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[8px] font-bold text-gray-500 uppercase mb-1">Total Planilha</div>
                                                        <div className="text-sm font-black text-white">{fmtBRL(totalSheet)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[8px] font-bold text-gray-500 uppercase mb-1">Diferença</div>
                                                        <div className={`text-sm font-black ${Math.abs(totalDiff) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>{fmtBRL(totalDiff)}</div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {recalcResult && (
                                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 mt-3">
                                            <div className="flex items-center gap-2 text-green-700 font-bold text-xs mb-1">
                                                <CheckCircle2 size={14} /> Recálculo Concluído
                                            </div>
                                            <div className="text-[10px] text-green-600">
                                                {recalcResult.total} missões processadas · {recalcResult.updated} atualizadas · {recalcResult.skipped} sem alteração{recalcResult.errors > 0 ? ` · ${recalcResult.errors} erros` : ''}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-3 mt-4">
                                        <button
                                            onClick={handleRecalculateAndCompare}
                                            disabled={isRecalculating}
                                            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-blue-400 disabled:to-blue-500 text-white font-black uppercase text-xs tracking-widest py-3 rounded-xl flex items-center justify-center gap-2 border border-blue-500"
                                            data-testid="btn-recalculate-compare"
                                        >
                                            {isRecalculating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                            {isRecalculating ? 'Recalculando...' : 'Recalcular e Comparar'}
                                        </button>
                                        <button onClick={() => { setPasteResult(null); setRecalcResult(null); }} className="flex-1 bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-700 hover:to-gray-800 text-white font-black uppercase text-xs tracking-widest py-3 rounded-xl flex items-center justify-center gap-2 border border-gray-700" data-testid="btn-paste-new-compare">
                                            <ScanLine size={16} /> Nova Comparação
                                        </button>
                                        <button onClick={() => setShowPasteModal(false)} className="px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs uppercase py-3 rounded-xl" data-testid="btn-paste-close">Fechar</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {editingDivergence && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={() => { if (!divEditSaving) setEditingDivergence(null); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-gray-900 to-red-900 px-5 py-3 flex items-center justify-between">
                            <div>
                                <div className="text-white font-black text-xs tracking-wide">Aceitar Valor da Planilha</div>
                                <div className="text-red-300 text-[10px] font-bold mt-0.5">OS {editingDivergence.missionId} — Divergência em {editingDivergence.field}</div>
                            </div>
                            <button onClick={() => setEditingDivergence(null)} className="text-white/60 hover:text-white" disabled={divEditSaving}><X size={16} /></button>
                        </div>
                        <div className="p-5">
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                                    <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Total Sistema</div>
                                    <div className="text-base font-black text-gray-800">{fmtBRL(editingDivergence.sysTotal ?? 0)}</div>
                                </div>
                                <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 text-center">
                                    <div className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1">Total Planilha</div>
                                    <div className="text-base font-black text-blue-800">{fmtBRL(editingDivergence.sheetTotal ?? 0)}</div>
                                </div>
                            </div>
                            <div className="mb-4">
                                <label className="block text-[10px] font-black text-gray-700 uppercase tracking-widest mb-1.5">Novo Total Geral (R$)</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={divEditInput}
                                    onChange={(e) => { setDivEditInput(e.target.value); setDivEditError(''); }}
                                    disabled={divEditSaving}
                                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg text-lg font-black text-gray-900 focus:border-blue-500 focus:outline-none font-mono"
                                    placeholder="0,00"
                                    data-testid="input-div-edit-value"
                                />
                                <p className="text-[10px] text-gray-500 mt-1.5">Este valor será gravado como o total cobrado da OS (Receita + Pedágio).</p>
                            </div>
                            {divEditError && (
                                <div className="mb-3 bg-red-50 border border-red-300 rounded-lg p-2 text-[11px] font-bold text-red-700">{divEditError}</div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={async () => {
                                        const newTotal = parseBRLNumber(divEditInput);
                                        if (!isFinite(newTotal) || newTotal < 0) { setDivEditError('Informe um valor válido.'); return; }
                                        const fullId = `GTM-${editingDivergence.id}`;
                                        const m = missions.find((mm: any) => mm.id === fullId);
                                        if (!m) { setDivEditError('Missão não encontrada.'); return; }
                                        setDivEditSaving(true);
                                        setDivEditError('');
                                        try {
                                            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                                            const userName = userData.name || 'Usuário';
                                            const tollVal = Math.max(0, m.toll_value || 0);
                                            const newRevenue = Math.max(0, Math.round((newTotal - tollVal) * 100) / 100);
                                            const reasonStamp = `[${userName} - ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] Ajustado pela conferência da planilha do cliente (Total ${fmtBRL(newTotal)})`;
                                            console.log('[DivergenceEdit] Tentando salvar', { fullId, newTotal, newRevenue, tollVal, userName });
                                            // Usa endpoint backend (com service-role) p/ contornar RLS e snapshots
                                            const resp = await authFetch(`/api/missions/${encodeURIComponent(fullId)}/billing-override`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    revenue_value: newRevenue,
                                                    billing_verified_by: userName,
                                                    billing_approved: true,
                                                    revenue_edit_reason: reasonStamp,
                                                })
                                            });
                                            if (!resp.ok) {
                                                const txt = await resp.text().catch(() => '');
                                                console.error('[DivergenceEdit] Falha backend:', resp.status, txt);
                                                // Fallback direto via supabase client
                                                const { data, error } = await supabase.from('missions').update({
                                                    revenue_value: newRevenue,
                                                    billing_verified_by: userName,
                                                    billing_approved: true,
                                                    revenue_edit_reason: reasonStamp,
                                                    last_update: new Date().toISOString(),
                                                }).eq('id', fullId).select('id, revenue_value, billing_verified_by').maybeSingle();
                                                if (error) {
                                                    console.error('[DivergenceEdit] Erro Supabase:', error);
                                                    setDivEditError(`Erro ao salvar: ${error.message || error.code || 'desconhecido'}. Tente abrir pela Auditoria.`);
                                                    setDivEditSaving(false);
                                                    return;
                                                }
                                                if (!data) {
                                                    setDivEditError('Nenhuma linha foi atualizada (provável bloqueio de permissão da OS). Tente abrir pela Auditoria.');
                                                    setDivEditSaving(false);
                                                    return;
                                                }
                                                console.log('[DivergenceEdit] Salvo via supabase:', data);
                                            } else {
                                                const respData = await resp.json().catch(() => ({}));
                                                console.log('[DivergenceEdit] Salvo via backend:', respData);
                                            }
                                            setMissions(prev => prev.map((mm: any) => mm.id === fullId ? { ...mm, revenue_value: newRevenue, billing_verified_by: userName, billing_approved: true, revenue_edit_reason: reasonStamp } : mm));
                                            setEditingDivergence(null);
                                            setDivEditSaving(false);
                                            setPendingRecompare(true);
                                            setPasteResult(null);
                                        } catch (err: any) {
                                            setDivEditError(err?.message || 'Erro inesperado ao salvar.');
                                            setDivEditSaving(false);
                                        }
                                    }}
                                    disabled={divEditSaving}
                                    className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 text-white font-black uppercase text-[10px] tracking-widest py-2.5 rounded-lg flex items-center justify-center gap-2"
                                    data-testid="btn-save-divergence"
                                >
                                    {divEditSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {divEditSaving ? 'Salvando...' : 'Salvar e Recomparar'}
                                </button>
                                <button
                                    onClick={() => {
                                        const mId = editingDivergence.missionId;
                                        if (onOpenMission) onOpenMission(mId);
                                        setEditingDivergence(null);
                                    }}
                                    disabled={divEditSaving}
                                    className="px-3 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 text-white font-black uppercase text-[10px] tracking-widest py-2.5 rounded-lg flex items-center justify-center gap-1"
                                    data-testid="btn-open-audit-modal"
                                    title="Abrir Auditoria de Faturamento"
                                >
                                    <ExternalLink size={12} /> Auditoria
                                </button>
                                <button onClick={() => setEditingDivergence(null)} disabled={divEditSaving} className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-[10px] uppercase py-2.5 rounded-lg">Cancelar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {editMission && (
                <MissionFinancialModal
                    isOpen={!!editMission}
                    onClose={() => setEditMission(null)}
                    mission={editMission}
                    onUpdate={() => {
                        // O listener realtime já regera o boletim; aqui só
                        // garantimos o fechamento caso o modal não dispare.
                        if (reportGeneratedRef.current && selectedClientRef.current) {
                            handleGenerateRef.current();
                        }
                    }}
                />
            )}
        </div>
    );
};

export default ClientBillingReport;
