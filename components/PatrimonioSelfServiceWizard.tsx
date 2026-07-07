import React, { useState, useMemo } from 'react';
import { Package, Camera, ChevronRight, ChevronLeft, Loader2, CheckCircle2, Laptop, Smartphone, CreditCard, Monitor, Box } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { authFetch } from '../lib/authFetch';
import {
  PATRIMONIO_CHECKLIST,
  type PatrimonioDeclaredItemDraft,
  type PatrimonioChecklistItem,
} from '../lib/patrimonioSelfServiceTypes';
import type { EquipmentRecord, EquipmentResponsibilityTerm } from '../lib/equipmentRecovery';
import EquipmentCombinedTermModal from './EquipmentCombinedTermModal';

const ICONS: Record<string, React.ReactNode> = {
  notebook: <Laptop size={20} />,
  chip: <CreditCard size={20} />,
  celular: <Smartphone size={20} />,
  tablet: <Smartphone size={20} />,
  desktop: <Monitor size={20} />,
  monitor: <Monitor size={20} />,
  outro: <Box size={20} />,
};

interface Props {
  userId: string;
  userName: string;
  userRole?: string;
  initialEquipments?: EquipmentRecord[];
  onComplete: () => void;
}

type WizardStep = 'intro' | 'checklist' | 'details' | 'review' | 'contract';

const getTypeLabel = (t: string) => PATRIMONIO_CHECKLIST.find((c) => c.type === t)?.label || t;

const PatrimonioSelfServiceWizard: React.FC<Props> = ({
  userId,
  userName,
  userRole = '',
  initialEquipments = [],
  onComplete,
}) => {
  const [step, setStep] = useState<WizardStep>(initialEquipments.length ? 'contract' : 'intro');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, PatrimonioDeclaredItemDraft>>({});
  const [detailIndex, setDetailIndex] = useState(0);
  const [savedEquipments, setSavedEquipments] = useState<EquipmentRecord[]>(initialEquipments);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [showContract, setShowContract] = useState(initialEquipments.length > 0);
  const [emptyMode, setEmptyMode] = useState(false);

  const selectedList = useMemo(
    () => PATRIMONIO_CHECKLIST.filter((c) => selectedTypes.has(c.type)),
    [selectedTypes],
  );

  const currentChecklist = selectedList[detailIndex];

  const toggleType = (type: string, has: boolean) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (has) {
        next.add(type);
        if (!drafts[type]) {
          setDrafts((d) => ({
            ...d,
            [type]: { type, photo_urls: [], brand: '', model: '', serial_number: '', chip_line: '', notes: '' },
          }));
        }
      } else {
        next.delete(type);
      }
      return next;
    });
  };

  const uploadPhoto = async (file: File, type: string, slotKey: string) => {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `patrimonio-self/${userId}/${type}-${slotKey}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('mission-evidence').upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('mission-evidence').getPublicUrl(path);
    setDrafts((d) => {
      const prev = d[type] || { type, photo_urls: [], photo_map: {} };
      const photo_map = { ...(prev.photo_map || {}), [slotKey]: data.publicUrl };
      return {
        ...d,
        [type]: {
          ...prev,
          type,
          photo_map,
          photo_urls: Object.values(photo_map),
        },
      };
    });
  };

  const updateDraftField = (type: string, field: string, value: string) => {
    setDrafts((d) => ({ ...d, [type]: { ...d[type], type, [field]: value, photo_urls: d[type]?.photo_urls || [] } }));
  };

  const validateCurrentDetail = (item: PatrimonioChecklistItem): boolean => {
    const d = drafts[item.type];
    const map = d?.photo_map || {};
    for (const slot of item.photos) {
      if (!map[slot.key]) {
        setError(`Envie a foto: ${slot.label}`);
        return false;
      }
    }
    if (item.fields.includes('chip_line') && !d.chip_line?.trim()) {
      setError('Informe o número da linha.');
      return false;
    }
    if (item.fields.includes('serial_number') && item.type !== 'chip' && !d.serial_number?.trim() && !d.brand?.trim()) {
      setError('Informe marca ou número de série.');
      return false;
    }
    setError('');
    return true;
  };

  const submitDeclaration = async () => {
    setIsSaving(true);
    setError('');
    try {
      const items = selectedList.map((c) => drafts[c.type]).filter(Boolean);
      const resp = await authFetch('/api/patrimonio/my/declare', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Falha ao salvar');
      setSavedEquipments(data.equipments || []);
      setShowContract(true);
      setStep('contract');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar declaração');
    } finally {
      setIsSaving(false);
    }
  };

  const handleContractSigned = async (term: EquipmentResponsibilityTerm) => {
    const resp = await authFetch('/api/patrimonio/my/sign-contract', {
      method: 'POST',
      body: JSON.stringify({
        term,
        equipment_ids: savedEquipments.map((e) => e.id),
        empty_declaration: emptyMode,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Falha ao registrar termo');
    setShowContract(false);
    onComplete();
  };

  const renderDetailForm = (item: PatrimonioChecklistItem) => {
    const d = drafts[item.type] || { type: item.type, photo_urls: [] };
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-slate-800">
          {ICONS[item.type]}
          <h3 className="font-black uppercase text-sm">{item.label}</h3>
          <span className="text-[10px] text-slate-400 ml-auto">{detailIndex + 1} / {selectedList.length}</span>
        </div>
        {item.fields.includes('brand') && (
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Marca" value={d.brand || ''} onChange={(e) => updateDraftField(item.type, 'brand', e.target.value)} />
        )}
        {item.fields.includes('model') && (
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Modelo" value={d.model || ''} onChange={(e) => updateDraftField(item.type, 'model', e.target.value)} />
        )}
        {item.fields.includes('serial_number') && (
          <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="Número de série / IMEI" value={d.serial_number || ''} onChange={(e) => updateDraftField(item.type, 'serial_number', e.target.value)} />
        )}
        {item.fields.includes('chip_line') && (
          <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="Número da linha (ex: 11 99999-9999)" value={d.chip_line || ''} onChange={(e) => updateDraftField(item.type, 'chip_line', e.target.value)} />
        )}
        {item.fields.includes('notes') && (
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Descrição do item" value={d.notes || ''} onChange={(e) => updateDraftField(item.type, 'notes', e.target.value)} />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {item.photos.map((slot, idx) => (
            <label key={slot.key} className="border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-slate-50">
              <Camera size={24} className="text-slate-400" />
              <span className="text-[10px] font-bold text-center text-slate-600">{slot.label}</span>
              {d.photo_urls[idx] && <img src={(d.photo_map || {})[slot.key] || d.photo_urls[idx]} alt="" className="w-full h-24 object-cover rounded-lg" />}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, item.type, slot.key).catch((err) => setError(String(err))); }} />
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[9998] bg-slate-950/95 flex items-center justify-center p-3 sm:p-6 overflow-y-auto" data-testid="patrimonio-self-wizard">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-4">
        <div className="px-5 py-4 border-b bg-slate-800 text-white rounded-t-2xl flex items-center gap-2">
          <Package size={20} />
          <div>
            <h1 className="text-sm font-black uppercase">Patrimônio Home Office</h1>
            <p className="text-[10px] text-slate-300">Olá, {userName.split(' ')[0]} — declare o que você possui</p>
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {step === 'intro' && (
            <div className="space-y-3 text-sm text-slate-700">
              <p>Por trabalharmos em <strong>home office</strong>, precisamos registrar o patrimônio da empresa que está com você.</p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>Marque o que você possui (notebook, chip, celular…)</li>
                <li>Tire as fotos solicitadas de cada item</li>
                <li>Assine o termo de responsabilidade ao final</li>
              </ul>
              <p className="text-amber-700 text-xs font-bold bg-amber-50 border border-amber-200 rounded-lg p-2">Este passo é obrigatório até concluir a assinatura do termo.</p>
            </div>
          )}

          {step === 'checklist' && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase">O que você possui em casa?</p>
              {PATRIMONIO_CHECKLIST.map((item) => (
                <div key={item.type} className="flex items-center justify-between border rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    {ICONS[item.type]} {item.label}
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => toggleType(item.type, true)} className={`px-2 py-1 text-[10px] font-black rounded-lg ${selectedTypes.has(item.type) ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>SIM</button>
                    <button type="button" onClick={() => toggleType(item.type, false)} className={`px-2 py-1 text-[10px] font-black rounded-lg ${!selectedTypes.has(item.type) ? 'bg-slate-700 text-white' : 'bg-slate-100'}`}>NÃO</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 'details' && currentChecklist && renderDetailForm(currentChecklist)}

          {step === 'review' && (
            <div className="space-y-2 text-sm">
              <p className="font-bold">Revise antes de enviar:</p>
              {selectedList.length === 0 ? (
                <p className="text-slate-600">Nenhum equipamento declarado.</p>
              ) : (
                selectedList.map((c) => (
                  <div key={c.type} className="border rounded-lg p-2 text-xs">
                    <strong>{c.label}</strong>
                    <p className="text-slate-500">{drafts[c.type]?.brand} {drafts[c.type]?.model} {drafts[c.type]?.chip_line} {drafts[c.type]?.serial_number}</p>
                    <p className="text-slate-400">{drafts[c.type]?.photo_urls?.length || 0} foto(s)</p>
                  </div>
                ))
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t flex gap-2">
          {step === 'intro' && (
            <button type="button" onClick={() => setStep('checklist')} className="flex-1 py-3 bg-slate-800 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-1">
              Começar <ChevronRight size={14} />
            </button>
          )}
          {step === 'checklist' && (
            <>
              <button type="button" onClick={() => setStep('intro')} className="px-4 py-3 bg-slate-100 rounded-xl"><ChevronLeft size={16} /></button>
              <button
                type="button"
                onClick={() => {
                  if (selectedList.length === 0) {
                    setEmptyMode(true);
                    setShowContract(true);
                    setStep('contract');
                  } else {
                    setDetailIndex(0);
                    setStep('details');
                  }
                }}
                className="flex-1 py-3 bg-slate-800 text-white text-xs font-black uppercase rounded-xl"
              >
                Continuar
              </button>
            </>
          )}
          {step === 'details' && currentChecklist && (
            <>
              <button type="button" onClick={() => { if (detailIndex > 0) setDetailIndex((i) => i - 1); else setStep('checklist'); }} className="px-4 py-3 bg-slate-100 rounded-xl"><ChevronLeft size={16} /></button>
              <button
                type="button"
                onClick={() => {
                  if (!validateCurrentDetail(currentChecklist)) return;
                  if (detailIndex < selectedList.length - 1) setDetailIndex((i) => i + 1);
                  else setStep('review');
                }}
                className="flex-1 py-3 bg-slate-800 text-white text-xs font-black uppercase rounded-xl"
              >
                {detailIndex < selectedList.length - 1 ? 'Próximo item' : 'Revisar'}
              </button>
            </>
          )}
          {step === 'review' && (
            <>
              <button type="button" onClick={() => { setDetailIndex(selectedList.length - 1); setStep('details'); }} className="px-4 py-3 bg-slate-100 rounded-xl"><ChevronLeft size={16} /></button>
              <button type="button" onClick={submitDeclaration} disabled={isSaving} className="flex-1 py-3 bg-emerald-700 text-white text-xs font-black uppercase rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {isSaving ? 'Salvando...' : 'Gerar patrimônio e assinar termo'}
              </button>
            </>
          )}
        </div>
      </div>

      {showContract && (
        <EquipmentCombinedTermModal
          equipments={savedEquipments}
          getTypeLabel={getTypeLabel}
          collaboratorName={userName}
          role={userRole}
          emptyDeclaration={emptyMode}
          onClose={() => setShowContract(false)}
          onSigned={handleContractSigned}
        />
      )}
    </div>
  );
};

export default PatrimonioSelfServiceWizard;
