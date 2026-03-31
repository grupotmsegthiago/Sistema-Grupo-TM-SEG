# Código Completo — Ferramenta de Auditoria de Faturamento TMSEGo

---

## 1. TIPO AuditResult (lib/financialUtils.ts)

```typescript
export interface AuditResult {
    missionId: string;
    client: string;
    storedRevenue: number;
    calculatedRevenue: number;
    storedCost: number;
    calculatedCost: number;
    revenueDiff: number;
    costDiff: number;
    isInconsistent: boolean;
    reason: string;
}
```

---

## 2. FUNÇÃO auditMissionFinancials (lib/financialUtils.ts)

```typescript
export const auditMissionFinancials = (
    mission: Mission,
    clientTables: ClientPriceTable[],
    providerTables: ProviderCostTable[],
    clientData?: Client,
    tolerance: number = 5
): AuditResult => {
    const fin = calculateMissionFinancials(mission, clientTables, providerTables, clientData);
    
    const storedRevenue = safeNumber(mission.revenue_value) + safeNumber(mission.toll_value);
    const storedCost = safeNumber(mission.cost_value) + safeNumber(mission.toll_value_provider != null ? mission.toll_value_provider : mission.toll_value);
    const calculatedRevenue = fin.client.total;
    const calculatedCost = fin.provider.total;
    
    const revenueDiff = Math.abs(storedRevenue - calculatedRevenue);
    const costDiff = Math.abs(storedCost - calculatedCost);
    
    const hasStoredValues = storedRevenue > 0 || storedCost > 0;
    const userVerified = !!(mission as any).billing_verified_by;
    const isInconsistent = hasStoredValues && !userVerified && (revenueDiff > tolerance || costDiff > tolerance);
    
    let reason = '';
    if (isInconsistent) {
        const reasons: string[] = [];
        if (revenueDiff > tolerance) reasons.push(`Receita: salvo R$${storedRevenue.toFixed(2)} vs tabela R$${calculatedRevenue.toFixed(2)} (dif: R$${revenueDiff.toFixed(2)})`);
        if (costDiff > tolerance) reasons.push(`Custo: salvo R$${storedCost.toFixed(2)} vs tabela R$${calculatedCost.toFixed(2)} (dif: R$${costDiff.toFixed(2)})`);
        reason = reasons.join(' | ');
    }
    
    return {
        missionId: mission.id || '',
        client: mission.client || '',
        storedRevenue,
        calculatedRevenue,
        storedCost,
        calculatedCost,
        revenueDiff,
        costDiff,
        isInconsistent,
        reason
    };
};
```

---

## 3. ESTADOS de Auditoria no Modal (MissionFinancialModal.tsx)

```typescript
const [systemCalculatedCost, setSystemCalculatedCost] = useState<number | null>(null);
const [systemCalculatedRevenue, setSystemCalculatedRevenue] = useState<number | null>(null);
const [controllerSavedCost, setControllerSavedCost] = useState<number | null>(null);
const [controllerSavedRevenue, setControllerSavedRevenue] = useState<number | null>(null);
const [controllerSaveInfo, setControllerSaveInfo] = useState<{user: string; date: string} | null>(null);
```

---

## 4. CARREGAMENTO dos dados de auditoria (loadData no MissionFinancialModal.tsx)

```typescript
// Dentro do bloco que carrega adjustmentRes (BillingAdjustment):
if (details.systemCalculatedCost != null) setSystemCalculatedCost(details.systemCalculatedCost);
if (details.systemCalculatedRevenue != null) setSystemCalculatedRevenue(details.systemCalculatedRevenue);
if (details.costTotal != null) setControllerSavedCost(details.costTotal);
if (details.revenueTotal != null) setControllerSavedRevenue(details.revenueTotal);

const savedDate = new Date(adj.created_at);
const dateStr = savedDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' ' + savedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
setSavedByInfo(`${adj.user_name} (${dateStr})`);
setControllerSaveInfo({ user: adj.user_name, date: dateStr });
```

---

## 5. SALVAMENTO com valor do sistema (handleSave no MissionFinancialModal.tsx)

```typescript
const sysCalcCost = financialData ? (financialData.provider.base + financialData.provider.extraKmVal + financialData.provider.extraHrVal + tollProv) : null;
const sysCalcRevenue = financialData ? financialData.client.total : null;
const adjustmentDetails = JSON.stringify({
    clientTableId: manualClientTableId || null,
    providerTableId: manualProviderTableId || null,
    customClientBase: customClientBase || null,
    customClientKm: customClientKm || null,
    customClientHour: customClientHour || null,
    customProviderBase: customProviderBase || null,
    customProviderKm: customProviderKm || null,
    customProviderHour: customProviderHour || null,
    iblEnabled: iblEnabled,
    revenueTotal: revTotal,
    costTotal: costTotal,
    tollValue: toll,
    tollProviderValue: tollProv,
    systemCalculatedCost: sysCalcCost,
    systemCalculatedRevenue: sysCalcRevenue
});
```

---

## 6. COMPONENTE VISUAL — Auditoria de Custo (Sistema vs Controller)

```tsx
{(() => {
    const currentCalcCost = financialData.provider.base + financialData.provider.extraKmVal + financialData.provider.extraHrVal + parseNumber(tollProviderInput);
    const currentSavedCost = parseNumber(costInput);
    const sysRef = systemCalculatedCost ?? currentCalcCost;
    const controllerRef = controllerSavedCost ?? currentSavedCost;
    const hasDivergence = Math.abs(sysRef - controllerRef) > 1 && controllerSavedCost != null;
    const diffValue = controllerRef - sysRef;
    const diffPercent = sysRef > 0 ? ((diffValue / sysRef) * 100) : 0;
    const isOvercharge = diffValue > 0;
    if (!hasDivergence) return null;
    return (
        <div data-testid="audit-cost-comparison" className={`mb-2 p-3 rounded-xl border-2 ${isOvercharge ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
            <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${isOvercharge ? 'bg-red-100' : 'bg-green-100'}`}>
                    <Scale size={14} className={isOvercharge ? 'text-red-700' : 'text-green-700'} />
                </div>
                <span className={`text-[9px] font-black uppercase tracking-wider ${isOvercharge ? 'text-red-800' : 'text-green-800'}`}>
                    Auditoria de Custo — {isOvercharge ? 'Valor acima do calculado' : 'Valor abaixo do calculado'}
                </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[9px]">
                <div className="bg-white/80 rounded-lg p-2 border border-gray-200">
                    <p className="font-bold text-gray-500 uppercase mb-0.5">Sistema calculou</p>
                    <p className="font-black text-gray-900 text-sm">{formatCurrency(sysRef)}</p>
                    <p className="text-gray-400 text-[8px]">Cálculo automático (tabela)</p>
                </div>
                <div className={`rounded-lg p-2 border ${isOvercharge ? 'bg-red-100/80 border-red-200' : 'bg-green-100/80 border-green-200'}`}>
                    <p className={`font-bold uppercase mb-0.5 ${isOvercharge ? 'text-red-600' : 'text-green-600'}`}>Controller salvou</p>
                    <p className={`font-black text-sm ${isOvercharge ? 'text-red-900' : 'text-green-900'}`}>{formatCurrency(controllerRef)}</p>
                    {controllerSaveInfo && <p className={`text-[8px] ${isOvercharge ? 'text-red-400' : 'text-green-400'}`}>{controllerSaveInfo.user} — {controllerSaveInfo.date}</p>}
                </div>
            </div>
            <div className={`mt-2 flex items-center justify-center gap-2 py-1.5 rounded-lg ${isOvercharge ? 'bg-red-200/60' : 'bg-green-200/60'}`}>
                <span className={`text-xs font-black ${isOvercharge ? 'text-red-800' : 'text-green-800'}`}>
                    Diferença: {isOvercharge ? '+' : ''}{formatCurrency(diffValue)} ({isOvercharge ? '+' : ''}{diffPercent.toFixed(1)}%)
                </span>
            </div>
            <p className={`text-[8px] mt-1.5 font-bold ${isOvercharge ? 'text-red-500' : 'text-green-500'}`}>
                {isOvercharge 
                    ? '⚠ Valor salvo é MAIOR que o cálculo do sistema. Verificar se houve erro do fornecedor (cobrança indevida) ou ajuste justificado pelo controller.'
                    : '✓ Valor salvo é MENOR que o cálculo do sistema. O controller aplicou um desconto/correção.'}
            </p>
        </div>
    );
})()}
```

---

## 7. COMPONENTE VISUAL — Alerta de Franquia Inconsistente

```tsx
{(() => {
    const audit = auditMissionFinancials(mission, clientTables, providerTables, clientData);
    if (!audit.isInconsistent) return null;
    return (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 shadow-md" data-testid="audit-alert-franchise">
            <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 rounded-lg shrink-0"><AlertTriangle size={20} className="text-amber-700" /></div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-amber-800 uppercase tracking-wider mb-1">Cálculo Fora da Regra de Franquia</p>
                    <p className="text-[10px] text-amber-700 font-bold leading-relaxed">{audit.reason}</p>
                    <div className="flex items-center gap-3 mt-3">
                        <div className="flex items-center gap-2 text-[10px]">
                            <span className="font-bold text-gray-500">Salvo:</span>
                            <span className="font-black text-red-700">{formatCurrency(audit.storedRevenue)}</span>
                        </div>
                        <span className="text-gray-300">→</span>
                        <div className="flex items-center gap-2 text-[10px]">
                            <span className="font-bold text-gray-500">Tabela Oficial:</span>
                            <span className="font-black text-green-700">{formatCurrency(audit.calculatedRevenue)}</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => {
                        if (financialData) {
                            const toll = financialData.tollValue;
                            setUseSavedValues(false);
                            setRevenueInput((financialData.client.total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            setCostInput((financialData.provider.total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            setTollInput(toll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            setTollProviderInput(toll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            showNotification('Tabela Aplicada', 'Valores ajustados conforme tabela oficial de franquia.', 'success');
                        }
                    }}
                    className="shrink-0 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[9px] font-black hover:bg-amber-700 transition-colors shadow-sm"
                >
                    Corrigir
                </button>
            </div>
        </div>
    );
})()}
```

---

## 8. CAPTURA DE SCREENSHOT (captureModalScreenshot)

```typescript
const captureModalScreenshot = async (stageName: string, userName: string): Promise<string | null> => {
    if (!mission) return null;
    const contentEl = modalContentRef.current;
    if (!contentEl) {
      console.warn('[Screenshot] modalContentRef não encontrado');
      return null;
    }
    try {
      setIsCapturing(true);
      await new Promise(r => setTimeout(r, 300));

      const originalScrollTop = contentEl.scrollTop;
      const originalOverflow = contentEl.style.overflow;
      const originalMaxH = contentEl.style.maxHeight;
      const originalH = contentEl.style.height;

      contentEl.scrollTop = 0;
      contentEl.style.overflow = 'visible';
      contentEl.style.maxHeight = 'none';
      contentEl.style.height = 'auto';

      await new Promise(r => setTimeout(r, 100));
      
      const canvas = await html2canvas(contentEl, {
        scale: 0.75,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f9fafb',
        logging: false,
        windowWidth: contentEl.scrollWidth,
        windowHeight: contentEl.scrollHeight,
        ignoreElements: (el) => el.getAttribute('data-html2canvas-ignore') === 'true'
      });

      contentEl.style.overflow = originalOverflow;
      contentEl.style.maxHeight = originalMaxH;
      contentEl.style.height = originalH;
      contentEl.scrollTop = originalScrollTop;

      const maxWidth = 600;
      const maxHeight = 4000;
      let finalW = canvas.width;
      let finalH = canvas.height;
      if (finalW > maxWidth) {
        const r = maxWidth / finalW;
        finalW = maxWidth;
        finalH = Math.round(canvas.height * r);
      }
      if (finalH > maxHeight) {
        finalH = maxHeight;
      }
      
      const resizedCanvas = document.createElement('canvas');
      resizedCanvas.width = finalW;
      resizedCanvas.height = finalH;
      const ctx = resizedCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, 0, finalW, finalH);
      }
      
      let base64 = resizedCanvas.toDataURL('image/jpeg', 0.45);

      const sizeKB = Math.round(base64.length * 0.75 / 1024);
      if (sizeKB > 800) {
        base64 = resizedCanvas.toDataURL('image/jpeg', 0.25);
      }
      
      const finalSizeKB = Math.round(base64.length * 0.75 / 1024);
      if (finalSizeKB > 2000) {
        console.warn(`[Screenshot] Imagem muito grande (${finalSizeKB}KB), salvando metadados sem print`);
        await supabase.from('system_logs').insert([{
          user_name: userName,
          action_type: 'APPROVAL_SCREENSHOT',
          entity: 'BillingApproval',
          entity_id: mission.id,
          details: JSON.stringify({
            stage: stageName,
            user: userName,
            date: new Date().toISOString(),
            missionId: mission.id,
            screenshot: null,
            error: `Imagem excedeu limite de tamanho (${finalSizeKB}KB)`
          })
        }]);
        return null;
      }

      const { error: insertError } = await supabase.from('system_logs').insert([{
        user_name: userName,
        action_type: 'APPROVAL_SCREENSHOT',
        entity: 'BillingApproval',
        entity_id: mission.id,
        details: JSON.stringify({
          stage: stageName,
          user: userName,
          date: new Date().toISOString(),
          missionId: mission.id,
          screenshot: base64,
          sizeKB: finalSizeKB
        })
      }]);
      
      if (insertError) {
        console.error('[Screenshot] Erro ao salvar no banco:', insertError);
        showNotification('Atenção', `Print de aprovação não foi salvo: ${insertError.message}`, 'error');
        return null;
      }
      
      console.log(`[Screenshot] Captura salva com sucesso (${finalSizeKB}KB) - ${stageName}`);
      return base64;
    } catch (e: any) {
      console.error('[Screenshot] Erro ao capturar:', e);
      showNotification('Atenção', 'Não foi possível capturar o print de aprovação. Os dados financeiros foram salvos normalmente.', 'error');
      try {
        await supabase.from('system_logs').insert([{
          user_name: userName,
          action_type: 'APPROVAL_SCREENSHOT',
          entity: 'BillingApproval',
          entity_id: mission.id,
          details: JSON.stringify({
            stage: stageName,
            user: userName,
            date: new Date().toISOString(),
            missionId: mission.id,
            screenshot: null,
            error: e?.message || 'Falha na captura'
          })
        }]);
      } catch {}
      return null;
    } finally {
      setIsCapturing(false);
    }
  };
```

---

## 9. COMPONENTE VISUAL — OS Vinculadas (Mãe/Filha)

```tsx
{linkedMissions.length > 0 && (() => {
    const isCurrentParent = !mission.is_same_os && !mission.parent_mission_id && linkedMissions.some(lm => lm.is_same_os);
    const isCurrentChild = mission.is_same_os && !!mission.parent_mission_id;
    const children = linkedMissions.filter(lm => lm.is_same_os && lm.id !== mission.parent_mission_id);
    const parentMission = mission.parent_mission_id ? linkedMissions.find(lm => lm.id === mission.parent_mission_id) : null;
    const totalGroupRevenue = (isCurrentParent ? safeNumber(mission.revenue_value) : 0) + linkedMissions.reduce((s, lm) => s + safeNumber(lm.revenue_value), 0);
    const totalGroupCost = (isCurrentParent ? safeNumber(mission.cost_value) : 0);
    return (
    <div data-testid="linked-missions-section" className={`rounded-xl p-4 shadow-sm border-2 ${isCurrentParent ? 'bg-amber-50/80 border-amber-400' : 'bg-indigo-50 border-indigo-200'}`}>
        {isCurrentParent && (
            <div className="flex items-center gap-2 mb-3 bg-amber-600 text-white px-3 py-2 rounded-lg">
                <Layers size={16} />
                <span className="text-xs font-black uppercase tracking-wider">ESTA OS É A OS MÃE</span>
                <span className="text-[9px] bg-amber-800 px-2 py-0.5 rounded-full ml-auto font-bold">{children.length} filha{children.length !== 1 ? 's' : ''} vinculada{children.length !== 1 ? 's' : ''}</span>
            </div>
        )}
        {isCurrentChild && parentMission && (
            <div className="flex items-center gap-2 mb-3 bg-blue-600 text-white px-3 py-2 rounded-lg">
                <Link2 size={16} />
                <span className="text-xs font-black uppercase tracking-wider">ESTA OS É FILHA (MESMA OS)</span>
                <span className="text-[9px] bg-blue-800 px-2 py-0.5 rounded-full ml-auto font-bold">MÃE: {parentMission.id}</span>
            </div>
        )}
        {!isCurrentParent && !isCurrentChild && (
            <div className="flex items-center gap-2 mb-3">
                <div className="bg-indigo-600 p-1.5 rounded-lg"><Layers size={14} className="text-white" /></div>
                <p className="font-black text-indigo-900 text-xs uppercase tracking-wider">
                    OS Vinculadas ({linkedMissions.length})
                </p>
            </div>
        )}
        <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {linkedMissions.map((lm) => {
                const isParent = lm.id === mission.parent_mission_id;
                const lmCost = lm.is_same_os ? 0 : safeNumber(lm.cost_value);
                const lmRevenue = safeNumber(lm.revenue_value);
                const lmMargin = lmRevenue - lmCost;
                return (
                <div key={lm.id} data-testid={`linked-mission-${lm.id}`} className={`p-2.5 rounded-lg border text-xs ${isParent ? 'bg-amber-50 border-amber-300' : lm.is_same_os ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-black text-gray-800 shrink-0">{lm.id}</span>
                            {isParent && <span className="text-[8px] font-black bg-amber-600 text-white px-1.5 py-0.5 rounded uppercase shrink-0">MÃE</span>}
                            {lm.is_same_os && !isParent && <span className="text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase shrink-0">MESMA OS</span>}
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${lm.status === 'Concluída' ? 'bg-green-100 text-green-700' : lm.status === 'Cancelada' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{lm.status}</span>
                        </div>
                        <span className="text-gray-400 text-[9px] shrink-0">{lm.start_time ? new Date(lm.start_time).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit', timeZone: 'America/Sao_Paulo'}) : '--:--'}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                        <span className="text-gray-500 truncate text-[10px]" title={`${lm.origin} → ${lm.destination}`}>
                            {(lm.origin || '').split(',')[0]} → {(lm.destination || '').split(',')[0]}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                                <span className="text-[8px] text-gray-400 block">Receita</span>
                                <span className="text-green-700 font-bold">{formatCurrency(lmRevenue)}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-[8px] text-gray-400 block">Custo</span>
                                <span className={`font-bold ${lm.is_same_os ? 'text-gray-400' : 'text-red-600'}`}>{lm.is_same_os ? 'R$ 0,00' : formatCurrency(lmCost)}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-[8px] text-gray-400 block">Margem</span>
                                <span className={`font-bold ${lmMargin >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(lmMargin)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                );
            })}
        </div>
        {isCurrentParent && children.length > 0 && (
            <div className="mt-3 pt-3 border-t-2 border-amber-300">
                <div className="flex items-center justify-between text-[10px]">
                    <span className="font-black text-amber-800 uppercase">Consolidado do Grupo (Mãe + {children.length} filha{children.length !== 1 ? 's' : ''})</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                    <div className="bg-green-100 rounded-lg p-2 text-center">
                        <p className="text-[8px] font-bold text-green-600 uppercase">Receita Total</p>
                        <p className="text-sm font-black text-green-800">{formatCurrency(totalGroupRevenue)}</p>
                    </div>
                    <div className="bg-red-100 rounded-lg p-2 text-center">
                        <p className="text-[8px] font-bold text-red-600 uppercase">Custo (só mãe)</p>
                        <p className="text-sm font-black text-red-800">{formatCurrency(totalGroupCost)}</p>
                    </div>
                    <div className={`rounded-lg p-2 text-center ${(totalGroupRevenue - totalGroupCost) >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                        <p className={`text-[8px] font-bold uppercase ${(totalGroupRevenue - totalGroupCost) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Margem Grupo</p>
                        <p className={`text-sm font-black ${(totalGroupRevenue - totalGroupCost) >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>{formatCurrency(totalGroupRevenue - totalGroupCost)}</p>
                    </div>
                </div>
            </div>
        )}
    </div>
    );
})()}
```

---

## 10. VISUALIZAÇÃO DO PRINT (Preview + Download)

```tsx
{screenshotPreview && (
    <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4" onClick={() => setScreenshotPreview(null)}>
        <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-lg">Print da Aprovação</h3>
                <div className="flex gap-2">
                    <a href={screenshotPreview} download={`print_${mission.id}_${Date.now()}.jpg`} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors" data-testid="btn-download-screenshot">
                        <Camera size={14} /> Baixar Print
                    </a>
                    <button onClick={() => setScreenshotPreview(null)} className="p-2 rounded-full hover:bg-gray-100"><X size={20} /></button>
                </div>
            </div>
            <img src={screenshotPreview} alt="Print da aprovação" className="w-full rounded-xl border border-gray-300 shadow-lg" />
        </div>
    </div>
)}
```

---

## 11. HISTÓRICO DE APROVAÇÕES COM BOTÃO "VER PRINT"

```tsx
{approvalLog.length > 0 && (
    <div className="mx-4 mb-4 p-3 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl border border-emerald-200">
        <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2">Histórico de Aprovações</p>
        <div className="flex flex-wrap gap-2">
            {approvalLog.map((log, i) => (
                <div key={i} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-emerald-200 shadow-sm" data-testid={`approval-log-${i}`}>
                    <CheckCircle2 size={12} className={log.stage === 'auditor' ? 'text-amber-500' : log.stage === 'financeiro' ? 'text-blue-500' : log.stage === 'controller' ? 'text-purple-500' : 'text-emerald-600'} />
                    <div>
                        <span className="text-[10px] font-black text-gray-800">
                            {log.stage === 'auditor' ? 'Auditor' : log.stage === 'financeiro' ? 'Financeiro' : log.stage === 'diretoria' ? 'Diretoria' : log.stage === 'controller' ? 'Controller' : log.stage}
                        </span>
                        <span className="text-[9px] text-gray-500 ml-1">({log.user})</span>
                        <p className="text-[8px] text-gray-400 font-mono">{new Date(log.date).toLocaleString('pt-BR')}</p>
                    </div>
                    <button
                        onClick={async () => {
                            const { data } = await supabase.from('system_logs')
                                .select('details')
                                .eq('entity', 'BillingApproval')
                                .eq('entity_id', mission.id)
                                .eq('action_type', 'APPROVAL_SCREENSHOT')
                                .order('created_at', { ascending: false });
                            if (data) {
                                const match = data.find(d => {
                                    try { const p = JSON.parse(d.details); return p.stage === log.stage; } catch { return false; }
                                });
                                if (match) {
                                    try { setScreenshotPreview(JSON.parse(match.details).screenshot); } catch {}
                                } else {
                                    showNotification('Sem Print', 'Nenhum print de tela encontrado para esta aprovação.', 'error');
                                }
                            }
                        }}
                        className="p-1 rounded-md hover:bg-emerald-100 transition-colors ml-1"
                        title="Ver print da aprovação"
                        data-testid={`btn-view-screenshot-${log.stage}`}
                    >
                        <Camera size={12} className="text-emerald-600" />
                    </button>
                </div>
            ))}
        </div>
        {/* Barra de progresso de aprovação */}
        <div className="flex gap-1.5 mt-2">
            <div className={`h-1.5 flex-1 rounded-full ${currentApprovalStatus.hasAuditor ? 'bg-amber-400' : 'bg-gray-200'}`} title="Auditor" />
            <div className={`h-1.5 flex-1 rounded-full ${currentApprovalStatus.hasFinanceiro ? 'bg-blue-400' : 'bg-gray-200'}`} title="Financeiro" />
            <div className={`h-1.5 flex-1 rounded-full ${currentApprovalStatus.hasDiretoria ? 'bg-emerald-500' : 'bg-gray-200'}`} title="Diretoria" />
        </div>
    </div>
)}
```

---

## 12. REGRA DE SELEÇÃO DE TABELA 200KM (lib/financialUtils.ts)

```typescript
// Após a seleção automática de tabela do fornecedor, forçar downgrade para 100km se KM ≤ 200
if (!manualTableOverrides?.providerTableId && appliedProviderTable && filteredProviderTables.length > 1) {
    const appliedOp = normalize(appliedProviderTable.operation_type || '');
    const appliedIs200 = appliedOp.includes('200KM') || appliedOp.includes('200 KM') || appliedOp.includes('ATE 200') || (appliedProviderTable.franchise_km >= 200);
    if (appliedIs200 && providerDistReference <= 200) {
        const table100Fallback = filteredProviderTables.find(t => {
            const op = normalize(t.operation_type || '');
            const tFr = t.franchise_km || 0;
            return tFr >= 100 && tFr < 200 && (op.includes('100KM') || op.includes('100 KM') || op.includes('ATE 100') || tFr === 100);
        });
        if (table100Fallback) {
            appliedProviderTable = table100Fallback;
            providerLog = `KM ≤200 → Tabela 100KM (${table100Fallback.operation_type})`;
        }
    }
}

// Na comparação de menor custo, excluir tabelas 200km quando KM ≤ 200
const regionCandidates = filteredProviderTables.filter(t => {
    const op = normalize(t.operation_type || '');
    // ... outros filtros ...
    const tIs200Table = op.includes('200KM') || op.includes('200 KM') || op.includes('ATE 200') || (t.franchise_km || 0) >= 200;
    if (tIs200Table && providerDistReference <= 200) return false;
    return true;
});
```

---

## TABELAS DO BANCO UTILIZADAS

| Tabela | Uso |
|--------|-----|
| `system_logs` | Armazena screenshots, ajustes, padrões de billing, logs de aprovação |
| `missions` | Dados financeiros das OS (revenue_value, cost_value, toll_value, verified_by, etc.) |
| `client_price_tables` | Tabelas de preço do cliente |
| `provider_cost_tables` | Tabelas de custo do fornecedor |

## FLUXO COMPLETO DA AUDITORIA

1. **Abertura do Modal** → Carrega dados salvos vs calculados
2. **Detecção de Inconsistência** → `auditMissionFinancials` compara salvo vs tabela
3. **Comparação Sistema vs Controller** → Box visual vermelho/verde com diferença em R$ e %
4. **OS Vinculadas** → Identifica se é Mãe ou Filha, mostra consolidado financeiro
5. **Salvamento** → Grava `systemCalculatedCost` + `costTotal` no log para auditoria futura
6. **Screenshot** → Captura print completo (com scroll) da modal ao salvar/aprovar
7. **Histórico** → Botão câmera em cada aprovação para visualizar o print arquivado
