
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Monitor, Plus, Search, Trash2, Save, Loader2, Camera, X, ArrowLeft, Edit3, User, Package, ChevronDown, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';

interface EquipmentRecord {
  id: string;
  type: 'notebook' | 'desktop' | 'celular' | 'tablet' | 'outro';
  brand: string;
  model: string;
  serial_number: string;
  patrimony_id: string;
  photo_urls: string[];
  notes: string;
  assigned_to: string;
  assigned_to_name: string;
  created_at: string;
  history: { user_id: string; user_name: string; date: string; action: string }[];
}

const EQUIPMENT_TYPES: { value: EquipmentRecord['type']; label: string }[] = [
  { value: 'notebook', label: 'Notebook' },
  { value: 'desktop', label: 'Desktop / PC' },
  { value: 'celular', label: 'Celular' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'outro', label: 'Outro' },
];

const INPUT_CLASS = "w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition-all";
const SELECT_CLASS = "w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition-all appearance-none";
const LABEL_CLASS = "text-[10px] font-bold text-gray-500 uppercase mb-1 block";

const EquipmentManager: React.FC = () => {
  const { showNotification } = useNotification();
  const [equipments, setEquipments] = useState<EquipmentRecord[]>([]);
  const [internalUsers, setInternalUsers] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EquipmentRecord | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const masterRowIdRef = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [eqRes, usersRes] = await Promise.all([
        supabase.from('system_logs').select('id, details').eq('entity', 'EquipmentRegistry').eq('entity_id', 'master').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('system_users').select('id, name').eq('user_type', 'internal').eq('status', 'Ativo').order('name')
      ]);

      if (eqRes.data?.details) {
        try {
          const parsed = JSON.parse(eqRes.data.details);
          if (parsed && Array.isArray(parsed.equipments)) {
            setEquipments(parsed.equipments);
            masterRowIdRef.current = eqRes.data.id;
          }
        } catch (parseErr) {
          console.error('Erro ao interpretar dados de equipamentos:', parseErr);
          setEquipments([]);
        }
      }

      if (usersRes.data) {
        setInternalUsers(usersRes.data.map((u: any) => ({ id: String(u.id), name: u.name })));
      }
    } catch (e) {
      console.error('Erro ao carregar equipamentos:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveAll = async (updatedList: EquipmentRecord[]) => {
    setIsSaving(true);
    try {
      const payload = JSON.stringify({ equipments: updatedList });

      if (masterRowIdRef.current) {
        const { error } = await supabase.from('system_logs')
          .update({ details: payload })
          .eq('id', masterRowIdRef.current);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from('system_logs').insert([{
          user_name: 'Sistema',
          action_type: 'CREATE',
          entity: 'EquipmentRegistry',
          entity_id: 'master',
          details: payload
        }]).select('id').maybeSingle();
        if (error) throw error;
        if (inserted) masterRowIdRef.current = inserted.id;
      }
      setEquipments(updatedList);
      showNotification('Sucesso', 'Equipamentos salvos com sucesso!', 'success');
    } catch (e: any) {
      showNotification('Erro', 'Falha ao salvar: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const generatePatrimonyId = () => {
    let maxNum = 0;
    equipments.forEach(eq => {
      const match = eq.patrimony_id.match(/PAT-(\d+)/i);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });
    return `PAT-${String(maxNum + 1).padStart(4, '0')}`;
  };

  const handleAddNew = () => {
    const newEq: EquipmentRecord = {
      id: crypto.randomUUID(),
      type: 'notebook',
      brand: '',
      model: '',
      serial_number: '',
      patrimony_id: generatePatrimonyId(),
      photo_urls: [],
      notes: '',
      assigned_to: '',
      assigned_to_name: '',
      created_at: new Date().toISOString(),
      history: []
    };
    setEditData(newEq);
    setEditingId('new');
    setShowForm(true);
  };

  const handleEdit = (eq: EquipmentRecord) => {
    setEditData({ ...eq });
    setEditingId(eq.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!editData) return;
    if (!editData.brand.trim() || !editData.model.trim()) {
      showNotification('Campos obrigatórios', 'Preencha pelo menos Marca e Modelo.', 'error');
      return;
    }

    const currentUser = JSON.parse(localStorage.getItem('userData') || '{}');
    let updatedList: EquipmentRecord[];

    if (editingId === 'new') {
      const entry = { ...editData };
      if (entry.assigned_to) {
        entry.history = [{ user_id: entry.assigned_to, user_name: entry.assigned_to_name, date: new Date().toISOString(), action: 'Atribuído' }];
      }
      updatedList = [...equipments, entry];
    } else {
      updatedList = equipments.map(eq => {
        if (eq.id !== editData.id) return eq;
        const prev = eq;
        const updated = { ...editData };
        if (prev.assigned_to !== updated.assigned_to) {
          const historyEntry = {
            user_id: updated.assigned_to || '',
            user_name: updated.assigned_to ? updated.assigned_to_name : 'Sem atribuição',
            date: new Date().toISOString(),
            action: updated.assigned_to ? `Transferido para ${updated.assigned_to_name}` : `Removido de ${prev.assigned_to_name}`
          };
          updated.history = [...(prev.history || []), historyEntry];
        }
        return updated;
      });
    }

    await saveAll(updatedList);
    setShowForm(false);
    setEditData(null);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este equipamento?')) return;
    const updatedList = equipments.filter(eq => eq.id !== id);
    await saveAll(updatedList);
  };

  const handlePhotoUpload = async (file: File) => {
    if (!editData) return;
    setUploadingPhoto(editData.id);
    try {
      const ext = file.name.split('.').pop();
      const path = `equipment/${editData.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('mission-evidence').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(path);
      setEditData(prev => prev ? { ...prev, photo_urls: [...prev.photo_urls, urlData.publicUrl] } : prev);
    } catch (e: any) {
      showNotification('Erro', 'Erro ao enviar foto: ' + e.message, 'error');
    } finally {
      setUploadingPhoto(null);
    }
  };

  const removePhoto = (index: number) => {
    setEditData(prev => prev ? { ...prev, photo_urls: prev.photo_urls.filter((_, i) => i !== index) } : prev);
  };

  const handleAssignChange = (userId: string) => {
    if (!editData) return;
    const user = internalUsers.find(u => u.id === userId);
    setEditData({ ...editData, assigned_to: userId, assigned_to_name: user?.name || '' });
  };

  const filtered = equipments.filter(eq => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return eq.patrimony_id.toLowerCase().includes(term) ||
           eq.brand.toLowerCase().includes(term) ||
           eq.model.toLowerCase().includes(term) ||
           eq.serial_number.toLowerCase().includes(term) ||
           eq.assigned_to_name.toLowerCase().includes(term) ||
           EQUIPMENT_TYPES.find(t => t.value === eq.type)?.label.toLowerCase().includes(term);
  });

  if (showForm && editData) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { setShowForm(false); setEditData(null); setEditingId(null); }} className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors" data-testid="button-back-equipment">
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <Package size={20} className="text-slate-700" />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              {editingId === 'new' ? 'Novo Equipamento' : `Editar ${editData.patrimony_id}`}
            </h2>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Tipo</label>
              <select className={SELECT_CLASS} value={editData.type} onChange={e => setEditData({ ...editData, type: e.target.value as any })} data-testid="select-eq-type">
                {EQUIPMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Nº Patrimônio</label>
              <input className={`${INPUT_CLASS} bg-slate-50 font-mono font-bold`} value={editData.patrimony_id} readOnly data-testid="input-eq-patrimony" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Marca *</label>
              <input className={INPUT_CLASS} placeholder="Dell, Lenovo, Samsung..." value={editData.brand} onChange={e => setEditData({ ...editData, brand: e.target.value })} data-testid="input-eq-brand" />
            </div>
            <div>
              <label className={LABEL_CLASS}>Modelo *</label>
              <input className={INPUT_CLASS} placeholder="Inspiron 15, Galaxy A54..." value={editData.model} onChange={e => setEditData({ ...editData, model: e.target.value })} data-testid="input-eq-model" />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Nº de Série</label>
            <input className={INPUT_CLASS} placeholder="SN-XXXXX" value={editData.serial_number} onChange={e => setEditData({ ...editData, serial_number: e.target.value })} data-testid="input-eq-serial" />
          </div>

          <div>
            <label className={LABEL_CLASS}>Atribuído a (Funcionário)</label>
            <div className="relative">
              <select className={SELECT_CLASS} value={editData.assigned_to} onChange={e => handleAssignChange(e.target.value)} data-testid="select-eq-assigned">
                <option value="">— Sem atribuição —</option>
                {internalUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Observações</label>
            <textarea className={`${INPUT_CLASS} min-h-[60px] resize-none`} placeholder="Detalhes adicionais..." value={editData.notes} onChange={e => setEditData({ ...editData, notes: e.target.value })} data-testid="input-eq-notes" />
          </div>

          <div>
            <label className={LABEL_CLASS}>Fotos ({editData.photo_urls.length})</label>
            <div className="flex flex-wrap items-center gap-2">
              {editData.photo_urls.map((url, pIdx) => (
                <div key={pIdx} className="relative group">
                  <img src={url} alt={`Foto ${pIdx + 1}`} className="w-20 h-20 object-cover rounded-lg border border-slate-200 cursor-pointer" onClick={() => setPhotoPreview(url)} data-testid={`img-eq-photo-${pIdx}`} />
                  <button type="button" onClick={() => removePhoto(pIdx)} className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={10} />
                  </button>
                </div>
              ))}
              <label className="w-20 h-20 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors" data-testid="button-eq-upload-photo">
                {uploadingPhoto ? <Loader2 size={16} className="animate-spin text-slate-400" /> : <><Plus size={16} className="text-slate-400" /><span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Foto</span></>}
                <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handlePhotoUpload(e.target.files[0]); }} />
              </label>
            </div>
          </div>

          {editData.history && editData.history.length > 0 && (
            <div>
              <label className={LABEL_CLASS}>Histórico de Movimentação</label>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-1.5 max-h-40 overflow-y-auto">
                {editData.history.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-400 font-mono shrink-0">{new Date(h.date).toLocaleDateString('pt-BR')} {new Date(h.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="font-bold text-slate-700">{h.action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={isSaving} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-xl text-xs font-black uppercase hover:bg-slate-900 transition-colors disabled:opacity-50" data-testid="button-save-equipment">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isSaving ? 'Salvando...' : 'Salvar Equipamento'}
            </button>
            <button onClick={() => { setShowForm(false); setEditData(null); setEditingId(null); }} className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold uppercase hover:bg-gray-200 transition-colors" data-testid="button-cancel-equipment">
              Cancelar
            </button>
          </div>
        </div>

        {photoPreview && (
          <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" onClick={() => setPhotoPreview(null)}>
            <img src={photoPreview} alt="Preview" className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-800 rounded-xl text-white shadow-lg">
            <Package size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none">Patrimônio & Equipamentos</h1>
            <p className="text-[10px] text-slate-500 font-bold mt-0.5">{equipments.length} equipamento{equipments.length !== 1 ? 's' : ''} cadastrado{equipments.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={handleAddNew} className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-black uppercase hover:bg-slate-900 transition-colors shadow-lg" data-testid="button-new-equipment">
          <Plus size={14} /> Novo Equipamento
        </button>
      </div>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Buscar por patrimônio, marca, modelo, série, funcionário..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            data-testid="input-search-equipment"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Monitor size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-400">{searchTerm ? 'Nenhum equipamento encontrado' : 'Nenhum equipamento cadastrado'}</p>
          {!searchTerm && <p className="text-xs text-slate-400 mt-1">Clique em "Novo Equipamento" para começar</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(eq => (
            <div key={eq.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow group" data-testid={`equipment-card-${eq.patrimony_id}`}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-100 rounded-lg">
                    <Monitor size={14} className="text-slate-600" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-800 font-mono block leading-none">{eq.patrimony_id}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">{EQUIPMENT_TYPES.find(t => t.value === eq.type)?.label}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(eq)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" data-testid={`button-edit-eq-${eq.patrimony_id}`}>
                    <Edit3 size={12} />
                  </button>
                  <button onClick={() => handleDelete(eq.id)} className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors" data-testid={`button-delete-eq-${eq.patrimony_id}`}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-gray-400 uppercase w-12 shrink-0">Marca</span>
                  <span className="text-xs font-bold text-gray-700 truncate">{eq.brand || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-gray-400 uppercase w-12 shrink-0">Modelo</span>
                  <span className="text-xs font-bold text-gray-700 truncate">{eq.model || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-gray-400 uppercase w-12 shrink-0">Série</span>
                  <span className="text-xs font-mono text-gray-600 truncate">{eq.serial_number || '—'}</span>
                </div>
              </div>

              {eq.photo_urls?.length > 0 && (
                <div className="flex gap-1 mb-3 overflow-x-auto">
                  {eq.photo_urls.slice(0, 4).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-10 h-10 object-cover rounded border border-slate-200 cursor-pointer shrink-0" onClick={() => setPhotoPreview(url)} />
                  ))}
                  {eq.photo_urls.length > 4 && <span className="w-10 h-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-500 shrink-0">+{eq.photo_urls.length - 4}</span>}
                </div>
              )}

              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase ${eq.assigned_to ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                <User size={10} />
                {eq.assigned_to ? eq.assigned_to_name : 'Sem atribuição'}
              </div>
            </div>
          ))}
        </div>
      )}

      {photoPreview && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" onClick={() => setPhotoPreview(null)}>
          <img src={photoPreview} alt="Preview" className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
};

export default EquipmentManager;
