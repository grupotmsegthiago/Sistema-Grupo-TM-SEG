
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, UserCog, Building2, Shield, Info, Loader2, Key, RefreshCw, Eye, EyeOff, Copy, Briefcase, AlertTriangle, CheckSquare, Square, Mail, LayoutDashboard, MapPin, Truck, Route, Users, FileText, BarChart3, Bell, FileBarChart, CheckCircle2, MessageCircle, X, Monitor, Smartphone, Plus, Trash2, Camera, Image as ImageIcon, Wifi } from 'lucide-react';
import { Client, AccessProfile, ProviderData } from '../types';
import { authFetch } from '../lib/authFetch';
import { parseJsonResponse } from '../lib/parseJsonResponse';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { useNotification } from '../lib/NotificationContext';

interface EquipmentItem {
  id: string;
  type: 'notebook' | 'desktop' | 'celular' | 'tablet' | 'outro';
  brand: string;
  model: string;
  serial_number: string;
  patrimony_id: string;
  photo_url?: string;
  photo_urls: string[];
  notes: string;
}

interface ChipItem {
  id: string;
  phone_number: string;
  operator: string;
  iccid: string;
  plan: string;
  notes: string;
}

const EQUIPMENT_TYPES: { value: EquipmentItem['type']; label: string }[] = [
  { value: 'notebook', label: 'Notebook' },
  { value: 'desktop', label: 'Desktop / PC' },
  { value: 'celular', label: 'Celular' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'outro', label: 'Outro' },
];

const OPERATORS = ['Vivo', 'Claro', 'TIM', 'Oi', 'Outra'];

const CLIENT_PERMISSION_OPTIONS = [
    { id: 'dashboard', label: 'Página Inicial (Dashboard)', description: 'Visão geral com indicadores e gráficos', icon: LayoutDashboard, default: true },
    { id: 'missions', label: 'Monitoramento de Escoltas', description: 'Acompanhar escoltas em tempo real', icon: MapPin, default: true },
    { id: 'client-users', label: 'Gestão de Usuários', description: 'Criar e gerenciar outros usuários da empresa', icon: Users, default: false },
    { id: 'client-vehicles', label: 'Veículos (Carga)', description: 'Visualizar e cadastrar veículos de carga', icon: Truck, default: false },
    { id: 'client-routes', label: 'Rotas Cadastradas', description: 'Visualizar e gerenciar rotas', icon: Route, default: false },
    { id: 'fin-billing', label: 'Boletim de Medição', description: 'Acessar boletins de medição e faturamento', icon: FileText, default: false },
    { id: 'client-reports', label: 'Relatórios Executivos', description: 'Dashboards e relatórios da operação', icon: BarChart3, default: false },
    { id: 'client-mission-request', label: 'Solicitar Escolta', description: 'Criar novas solicitações de escolta', icon: Bell, default: false },
    { id: 'operational-reports', label: 'Relatórios Operacionais', description: 'Visualizar relatórios detalhados das missões', icon: FileBarChart, default: false },
];

interface UserFormProps {
  onBack: () => void;
  userType: 'internal' | 'client' | 'provider';
  id?: string | null;
}

const INPUT_CLASS = "w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-sm transition-all font-medium text-gray-700";
const SELECT_CLASS = `${INPUT_CLASS} appearance-none bg-[url('https://api.iconify.design/lucide/chevron-down.svg?color=%239ca3af')] bg-[length:1.25em] bg-no-repeat bg-[position:right_1rem_center]`;
const LABEL_CLASS = "text-xs font-bold text-gray-500 uppercase mb-1.5 block tracking-wider";

const UserForm: React.FC<UserFormProps> = ({ onBack, userType, id }) => {
  const { showNotification } = useNotification();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    profileId: '',
    clientId: '',
    providerId: '',
    status: 'Ativo'
  });

  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [providers, setProviders] = useState<ProviderData[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [generatedPass, setGeneratedPass] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; email: string; password: string; type: string } | null>(null);
  const [credentialsCopied, setCredentialsCopied] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    CLIENT_PERMISSION_OPTIONS.filter(p => p.default).map(p => p.id)
  );
  const [equipments, setEquipments] = useState<EquipmentItem[]>([]);
  const [chips, setChips] = useState<ChipItem[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [linkedEquipments, setLinkedEquipments] = useState<{ patrimony_id: string; type: string; brand: string; model: string; serial_number: string; photo_urls?: string[] }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; }
  })();
  const currentUserClientId = currentUser.clientId || currentUser.client_id || '';
  const isClientUser = !!currentUserClientId;

  const loadEquipmentData = async (userId: string) => {
    try {
      const { data } = await supabase.from('system_logs')
        .select('details')
        .eq('entity', 'UserEquipment')
        .eq('entity_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.details) {
        const parsed = JSON.parse(data.details);
        if (parsed.equipments) {
          setEquipments(parsed.equipments.map((eq: any) => ({
            ...eq,
            photo_urls: eq.photo_urls || (eq.photo_url ? [eq.photo_url] : []),
          })));
        }
        if (parsed.chips) setChips(parsed.chips);
      }
    } catch (e) { console.error('Erro ao carregar equipamentos:', e); }
  };

  const loadLinkedEquipments = async (userId: string) => {
    try {
      const { data: fromTable } = await supabase
        .from('patrimonio_equipments')
        .select('patrimony_id, type, brand, model, serial_number, photo_urls, assigned_to')
        .eq('assigned_to', userId)
        .is('deleted_at', null);
      if (fromTable?.length) {
        setLinkedEquipments(fromTable.map((eq: any) => ({
          ...eq,
          photo_urls: eq.photo_urls || [],
        })));
        return;
      }
      const { data } = await supabase.from('system_logs')
        .select('details').eq('entity', 'EquipmentRegistry').eq('entity_id', 'master')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data?.details) {
        const parsed = JSON.parse(data.details);
        if (parsed?.equipments && Array.isArray(parsed.equipments)) {
          const linked = parsed.equipments.filter((eq: any) => String(eq.assigned_to) === String(userId));
          setLinkedEquipments(linked);
        }
      }
    } catch (e) { console.error('Erro ao carregar equipamentos vinculados:', e); }
  };

  const saveEquipmentData = async (userId: string) => {
    try {
      const payload = JSON.stringify({ equipments: [], chips });
      const { data: existing } = await supabase.from('system_logs')
        .select('id')
        .eq('entity', 'UserEquipment')
        .eq('entity_id', userId)
        .limit(1)
        .maybeSingle();
      if (existing) {
        await supabase.from('system_logs').update({
          details: payload,
          user_name: currentUser?.name || 'Sistema',
          action_type: 'UPDATE'
        }).eq('id', existing.id);
      } else {
        await supabase.from('system_logs').insert({
          entity: 'UserEquipment',
          entity_id: userId,
          action_type: 'CREATE',
          user_name: currentUser?.name || 'Sistema',
          details: payload
        });
      }
    } catch (e) { console.error('Erro ao salvar equipamentos:', e); }
  };

  useEffect(() => {
    fetchAuxData();
    if (id) {
      loadUser();
      loadEquipmentData(id);
      loadLinkedEquipments(id);
    } else {
      generateRandomPassword();
      if (isClientUser && userType === 'client') {
        setFormData(prev => ({ ...prev, clientId: currentUserClientId }));
      }
    }
  }, [id]);

  const fetchAuxData = async () => {
    try {
        const clientQuery = isClientUser
            ? supabase.from('clients').select('id, name').eq('id', currentUserClientId)
            : supabase.from('clients').select('id, name').eq('status', 'Ativo').order('name');

        const [profRes, cliRes, provRes] = await Promise.all([
            supabase.from('profiles').select('*').order('name'),
            clientQuery,
            supabase.from('providers').select('id, name').eq('status', 'Ativo').order('name')
        ]);

        if (profRes.data) setProfiles(profRes.data);
        if (cliRes.data) setClients(cliRes.data as any);
        if (provRes.data) setProviders(provRes.data as any);
    } catch (e) {
        console.error(e);
    } finally {
        if (!id) setIsLoading(false);
    }
  };

  const loadUser = async () => {
      try {
          const { data, error } = await supabase.from('system_users').select('*').eq('id', id).single();
          if (error) throw error;
          if (data) {
              setFormData({
                  name: data.name,
                  email: data.email,
                  password: data.password,
                  profileId: data.profile_id || '',
                  clientId: data.client_id || '',
                  providerId: data.provider_id || '',
                  status: data.status
              });
              if (data.permissions && Array.isArray(data.permissions) && data.permissions.length > 0) {
                  setSelectedPermissions(data.permissions);
              }
          }
      } catch (e) {
          console.error(e);
          showNotification('Erro', 'Erro ao carregar usuário.', 'error');
      } finally {
          setIsLoading(false);
      }
  };

  const generateRandomPassword = () => {
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
      let pass = "";
      for (let i = 0; i < 10; i++) {
          pass += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      setGeneratedPass(pass);
      setFormData(prev => ({ ...prev, password: pass }));
  };

  const checkEmail = async (val: string) => {
      if (!val.includes('@')) return;
      try {
          let query = supabase.from('system_users').select('id, name').ilike('email', val);
          if (id) query = query.neq('id', id);
          
          const { data } = await query.maybeSingle();
          if (data) setEmailError(`Email já em uso por: ${data.name}`);
          else setEmailError('');
      } catch (e) { console.error(e); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (emailError) return;
      if (!formData.name || !formData.email || !formData.password) {
          showNotification('Erro', 'Preencha todos os campos obrigatórios.', 'error');
          return;
      }
      
      if (userType === 'client' && !formData.clientId) return showNotification('Erro', 'Selecione o Cliente vinculado.', 'error');
      if (userType === 'provider' && !formData.providerId) return showNotification('Erro', 'Selecione o Fornecedor vinculado.', 'error');

      setIsSaving(true);
      try {
          const payload: any = {
              name: formData.name,
              email: formData.email,
              password: formData.password,
              profile_id: formData.profileId || null,
              client_id: userType === 'client' ? (isClientUser ? currentUserClientId : formData.clientId) : null,
              provider_id: userType === 'provider' ? formData.providerId : null,
              user_type: userType,
              status: formData.status,
              force_password_change: !id
          };
          if (userType === 'client' && isClientUser) {
              payload.permissions = selectedPermissions;
          }
          if (id) {
              const { error: updErr } = await supabase.from('system_users').update(payload).eq('id', id);
              if (updErr) throw new Error('Erro ao salvar usuário: ' + updErr.message);
              if (userType === 'internal') await saveEquipmentData(id);
              await logAction('UPDATE', 'User', id, `Usuário atualizado: ${payload.name}`);
              showNotification('Sucesso', 'Usuário atualizado.', 'success');
          } else {
              const { data, error } = await supabase.from('system_users').insert([payload]).select();
              if (error) throw error;
              if (data && data[0]) {
                  await logAction('CREATE', 'User', data[0].id, `Novo usuário: ${payload.name}`);
                  if (userType === 'internal' && (equipments.length > 0 || chips.length > 0)) {
                    await saveEquipmentData(data[0].id);
                  }
              }
              showNotification('Sucesso', 'Usuário criado com sucesso.', 'success');
              setCreatedCredentials({
                  name: payload.name,
                  email: payload.email,
                  password: payload.password,
                  type: userType === 'client' ? 'Cliente' : userType === 'provider' ? 'Fornecedor' : 'Interno'
              });
              setCredentialsCopied(false);

              try {
                  const verCode = Math.floor(100000 + Math.random() * 900000).toString();
                  await authFetch('/api/email/welcome', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          name: payload.name,
                          email: payload.email,
                          password: payload.password,
                          userType: userType,
                          profileName: profiles.find(p => p.id === selectedProfileId)?.name || '',
                          verificationCode: verCode,
                      }),
                  });
              } catch (emailErr) {
                  console.error('[Email] Erro ao enviar boas-vindas:', emailErr);
              }
              return;
          }
          onBack();
      } catch (e: any) {
          showNotification('Erro', e.message, 'error');
      } finally {
          setIsSaving(false);
      }
  };

  const addEquipment = async () => {
    let maxNum = 0;
    equipments.forEach(eq => {
      const match = eq.patrimony_id.match(/PAT-(\d+)/i);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });

    try {
      const { data: allLogs } = await supabase.from('system_logs')
        .select('details')
        .eq('entity', 'UserEquipment')
        .order('created_at', { ascending: false })
        .limit(500);
      if (allLogs) {
        allLogs.forEach(log => {
          try {
            const parsed = JSON.parse(log.details);
            (parsed.equipments || []).forEach((eq: any) => {
              const match = (eq.patrimony_id || '').match(/PAT-(\d+)/i);
              if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
            });
          } catch {}
        });
      }
    } catch {}

    const newPatrimony = `PAT-${String(maxNum + 1).padStart(4, '0')}`;
    setEquipments(prev => [...prev, {
      id: crypto.randomUUID(),
      type: 'notebook',
      brand: '',
      model: '',
      serial_number: '',
      patrimony_id: newPatrimony,
      photo_urls: [],
      notes: ''
    }]);
  };

  const updateEquipment = (eqId: string, field: keyof EquipmentItem, value: any) => {
    setEquipments(prev => prev.map(e => e.id === eqId ? { ...e, [field]: value } : e));
  };

  const removeEquipment = (eqId: string) => {
    if (!confirm('Remover este equipamento?')) return;
    setEquipments(prev => prev.filter(e => e.id !== eqId));
  };

  const handlePhotoUpload = async (eqId: string, file: File) => {
    setUploadingPhoto(eqId);
    try {
      const ext = file.name.split('.').pop();
      const path = `equipment/${eqId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('mission-evidence').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(path);
      const eq = equipments.find(e => e.id === eqId);
      const currentPhotos = eq?.photo_urls || [];
      updateEquipment(eqId, 'photo_urls', [...currentPhotos, urlData.publicUrl]);
    } catch (e: any) {
      showNotification('Erro', 'Erro ao enviar foto: ' + e.message, 'error');
    } finally {
      setUploadingPhoto(null);
    }
  };

  const removePhoto = (eqId: string, photoIndex: number) => {
    const eq = equipments.find(e => e.id === eqId);
    if (!eq) return;
    updateEquipment(eqId, 'photo_urls', eq.photo_urls.filter((_: string, i: number) => i !== photoIndex));
  };

  const addChip = () => {
    setChips(prev => [...prev, {
      id: crypto.randomUUID(),
      phone_number: '',
      operator: '',
      iccid: '',
      plan: '',
      notes: ''
    }]);
  };

  const updateChip = (chipId: string, field: keyof ChipItem, value: string) => {
    setChips(prev => prev.map(c => c.id === chipId ? { ...c, [field]: value } : c));
  };

  const removeChip = (chipId: string) => {
    if (!confirm('Remover este chip?')) return;
    setChips(prev => prev.filter(c => c.id !== chipId));
  };

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-red-600"/></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-bold text-gray-900">{id ? 'Editar Usuário' : 'Novo Usuário'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
          <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100">
              <UserCog size={20} className="text-red-700" />
              <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Credenciais de Acesso</h3>
          </div>

          <div className="space-y-4">
              <div>
                  <label className={LABEL_CLASS}>Nome Completo</label>
                  <div className="relative">
                    <input type="text" required className={INPUT_CLASS} placeholder="Nome do usuário" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    <UserCog size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
              </div>

              <div>
                  <label className={LABEL_CLASS}>E-mail (Login)</label>
                  <div className="relative">
                    <input 
                        type="email" required 
                        className={`${INPUT_CLASS} ${emailError ? 'border-red-500 bg-red-50 text-red-900' : ''}`}
                        placeholder="usuario@empresa.com.br" 
                        value={formData.email} 
                        onChange={e => {
                            setFormData({...formData, email: e.target.value});
                            setEmailError('');
                        }}
                        onBlur={(e) => checkEmail(e.target.value)}
                    />
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  {emailError && <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle size={10}/> {emailError}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label className={LABEL_CLASS}>Perfil de Acesso</label>
                      <div className="relative">
                        <select required className={SELECT_CLASS} value={formData.profileId} onChange={e => setFormData({...formData, profileId: e.target.value})}>
                            <option value="">Selecione...</option>
                            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <Shield size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                  </div>
                  <div>
                      <label className={LABEL_CLASS}>Status da Conta</label>
                      <div className="relative">
                        <select className={SELECT_CLASS} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                            <option value="Ativo">ATIVO</option>
                            <option value="Inativo">BLOQUEADO</option>
                        </select>
                        <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${formData.status === 'Ativo' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      </div>
                  </div>
              </div>

              {userType === 'client' && (
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 animate-in fade-in">
                      <label className={LABEL_CLASS}>Cliente Vinculado</label>
                      <div className="relative">
                          {isClientUser ? (
                              <>
                                  <div className={`${INPUT_CLASS} bg-gray-100 cursor-not-allowed flex items-center`}>
                                      <span className="text-gray-700 font-medium">{clients.find(c => c.id === currentUserClientId)?.name || 'Carregando...'}</span>
                                  </div>
                                  <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none" />
                              </>
                          ) : (
                              <>
                                  <select required className={`${SELECT_CLASS} bg-white`} value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})}>
                                      <option value="">Selecione a empresa...</option>
                                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                  <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none" />
                              </>
                          )}
                      </div>
                      <p className="text-[10px] text-blue-700 mt-2 flex items-center gap-1"><Info size={12}/> {isClientUser ? 'Novo usuário será vinculado automaticamente à sua empresa.' : 'Este usuário verá apenas dados deste cliente.'}</p>
                  </div>
              )}

              {userType === 'client' && isClientUser && (
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 animate-in fade-in">
                      <div className="flex items-center justify-between mb-3">
                          <label className={LABEL_CLASS}>Permissões de Acesso</label>
                          <div className="flex gap-2">
                              <button type="button" onClick={() => setSelectedPermissions(CLIENT_PERMISSION_OPTIONS.map(p => p.id))} className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider" data-testid="button-select-all-perms">Marcar Todos</button>
                              <span className="text-gray-300">|</span>
                              <button type="button" onClick={() => setSelectedPermissions(CLIENT_PERMISSION_OPTIONS.filter(p => p.default).map(p => p.id))} className="text-[9px] font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider" data-testid="button-reset-perms">Padrão</button>
                          </div>
                      </div>
                      <div className="space-y-1.5">
                          {CLIENT_PERMISSION_OPTIONS.map(perm => {
                              const Icon = perm.icon;
                              const isChecked = selectedPermissions.includes(perm.id);
                              return (
                                  <button
                                      key={perm.id}
                                      type="button"
                                      onClick={() => setSelectedPermissions(prev => isChecked ? prev.filter(p => p !== perm.id) : [...prev, perm.id])}
                                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${isChecked ? 'bg-white border-indigo-300 shadow-sm' : 'bg-indigo-50/50 border-transparent hover:bg-white hover:border-gray-200'}`}
                                      data-testid={`toggle-perm-${perm.id}`}
                                  >
                                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-transparent'}`}>
                                          {isChecked ? <CheckSquare size={14} /> : <Square size={14} />}
                                      </div>
                                      <Icon size={16} className={isChecked ? 'text-indigo-600' : 'text-gray-400'} />
                                      <div className="flex-1 min-w-0">
                                          <p className={`text-xs font-bold ${isChecked ? 'text-gray-800' : 'text-gray-500'}`}>{perm.label}</p>
                                          <p className="text-[9px] text-gray-400 truncate">{perm.description}</p>
                                      </div>
                                      {perm.default && <span className="text-[8px] font-bold text-indigo-400 uppercase bg-indigo-100 px-1.5 py-0.5 rounded shrink-0">Padrão</span>}
                                  </button>
                              );
                          })}
                      </div>
                      <p className="text-[10px] text-indigo-600 mt-3 flex items-center gap-1"><Shield size={12}/> {selectedPermissions.length} de {CLIENT_PERMISSION_OPTIONS.length} módulos selecionados</p>
                  </div>
              )}

              {userType === 'provider' && (
                  <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 animate-in fade-in">
                      <label className={LABEL_CLASS}>Fornecedor Vinculado</label>
                      <div className="relative">
                          <select required className={`${SELECT_CLASS} bg-white`} value={formData.providerId} onChange={e => setFormData({...formData, providerId: e.target.value})}>
                              <option value="">Selecione o fornecedor...</option>
                              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <Briefcase size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-600 pointer-events-none" />
                      </div>
                      <p className="text-[10px] text-orange-700 mt-2 flex items-center gap-1"><Info size={12}/> Este usuário terá acesso limitado ao painel do fornecedor.</p>
                  </div>
              )}

              {userType === 'internal' && (
                <div className="space-y-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 animate-in fade-in">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Monitor size={18} className="text-slate-700" />
                        <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Patrimônio Vinculado</h4>
                        <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{linkedEquipments.length}</span>
                      </div>
                      <span className="text-[9px] font-medium text-slate-400 italic">Gerenciar em Configurações → Patrimônio & Equipamentos</span>
                    </div>

                    {linkedEquipments.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">Nenhum equipamento vinculado a este funcionário</p>
                    ) : (
                      <div className="space-y-2">
                        {linkedEquipments.map((eq, idx) => (
                          <div key={idx} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3" data-testid={`linked-equipment-${idx}`}>
                            {eq.photo_urls && eq.photo_urls.length > 0 ? (
                              <img src={eq.photo_urls[0]} alt="" className="w-10 h-10 object-cover rounded border border-slate-200 shrink-0 cursor-pointer" onClick={() => setPhotoPreview(eq.photo_urls![0])} />
                            ) : (
                              <div className="w-10 h-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center shrink-0"><Monitor size={14} className="text-slate-400" /></div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800 font-mono">{eq.patrimony_id}</span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">{eq.type}</span>
                              </div>
                              <div className="text-[11px] text-slate-600 truncate">{eq.brand} {eq.model}{eq.serial_number ? ` · SN: ${eq.serial_number}` : ''}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 animate-in fade-in">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Smartphone size={18} className="text-emerald-700" />
                        <h4 className="font-bold text-xs text-emerald-800 uppercase tracking-wider">Chips / Linhas</h4>
                        <span className="text-[9px] font-bold bg-emerald-200 text-emerald-600 px-1.5 py-0.5 rounded">{chips.length}</span>
                      </div>
                      <button type="button" onClick={addChip} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-emerald-800 transition-colors" data-testid="button-add-chip">
                        <Plus size={12} /> Adicionar
                      </button>
                    </div>

                    {chips.length === 0 && (
                      <p className="text-xs text-emerald-400 text-center py-4">Nenhum chip cadastrado</p>
                    )}

                    <div className="space-y-4">
                      {chips.map((chip, idx) => (
                        <div key={chip.id} className="bg-white rounded-lg border border-emerald-200 p-4 space-y-3" data-testid={`chip-card-${idx}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase">Chip #{idx + 1}</span>
                            <button type="button" onClick={() => removeChip(chip.id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded" data-testid={`button-remove-chip-${idx}`}>
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Número da Linha</label>
                              <div className="relative">
                                <input className={INPUT_CLASS} placeholder="(11) 99999-9999" value={chip.phone_number} onChange={e => updateChip(chip.id, 'phone_number', e.target.value)} data-testid={`input-chip-phone-${idx}`} />
                                <Smartphone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Operadora</label>
                              <select className={SELECT_CLASS} value={chip.operator} onChange={e => updateChip(chip.id, 'operator', e.target.value)} data-testid={`select-chip-operator-${idx}`}>
                                <option value="">Selecione...</option>
                                {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">ICCID do Chip</label>
                              <div className="relative">
                                <input className={INPUT_CLASS} placeholder="8955..." value={chip.iccid} onChange={e => updateChip(chip.id, 'iccid', e.target.value)} data-testid={`input-chip-iccid-${idx}`} />
                                <Wifi size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Plano</label>
                              <input className={INPUT_CLASS} placeholder="15GB, Controle..." value={chip.plan} onChange={e => updateChip(chip.id, 'plan', e.target.value)} data-testid={`input-chip-plan-${idx}`} />
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Observações</label>
                            <input className={INPUT_CLASS} placeholder="Detalhes adicionais..." value={chip.notes} onChange={e => updateChip(chip.id, 'notes', e.target.value)} data-testid={`input-chip-notes-${idx}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-gray-100">
                  <div className="flex justify-between items-end mb-2">
                      <label className={LABEL_CLASS}>Senha de Acesso</label>
                      {!id && (
                          <button type="button" onClick={generateRandomPassword} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 uppercase">
                              <RefreshCw size={10} /> Gerar Nova
                          </button>
                      )}
                  </div>
                  <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required 
                        className={`${INPUT_CLASS} pr-12 font-mono tracking-wider`}
                        placeholder="••••••••" 
                        value={formData.password} 
                        onChange={e => setFormData({...formData, password: e.target.value})}
                      />
                      <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                  </div>
                  {generatedPass && !id && (
                      <div className="mt-2 bg-gray-100 p-2 rounded flex justify-between items-center text-xs">
                          <span className="font-mono">{generatedPass}</span>
                          <button type="button" onClick={() => navigator.clipboard.writeText(generatedPass)} className="text-gray-500 hover:text-gray-800"><Copy size={14}/></button>
                      </div>
                  )}
                  {id && formData.email && (
                      <button
                        type="button"
                        disabled={isSendingReset}
                        onClick={async () => {
                          if (!confirm(`Enviar e-mail de redefinição de senha para ${formData.email}?`)) return;
                          setIsSendingReset(true);
                          try {
                            const senderName = currentUser?.name || 'Administrador';
                            const res = await authFetch('/api/password-reset/request', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: id, senderName })
                            });
                            const data = await parseJsonResponse(res);
                            if (res.ok && data.success) {
                              showNotification('success', 'E-mail de redefinição enviado com sucesso!');
                            } else {
                              showNotification('error', data.error || 'Falha ao enviar e-mail');
                            }
                          } catch (err: any) {
                            showNotification('error', 'Erro ao enviar e-mail: ' + err.message);
                          } finally {
                            setIsSendingReset(false);
                          }
                        }}
                        className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors uppercase tracking-wider disabled:opacity-50"
                        data-testid="button-send-password-reset"
                      >
                        {isSendingReset ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                        Enviar nova senha por e-mail
                      </button>
                  )}
              </div>
          </div>

          <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={onBack} disabled={isSaving} className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 uppercase hover:bg-gray-50 transition-colors">Cancelar</button>
              <button type="submit" disabled={isSaving || !!emailError} className="flex items-center gap-2 px-8 py-2.5 bg-black text-white rounded-lg text-sm font-bold hover:bg-gray-800 uppercase transition-all shadow-md disabled:opacity-50">
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 
                  {id ? 'Salvar Alterações' : 'Criar Usuário'}
              </button>
          </div>
      </form>

      {createdCredentials && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-credentials">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95">
                  <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 p-6 text-white">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-white/20 rounded-xl"><CheckCircle2 size={24} /></div>
                          <div>
                              <h3 className="text-lg font-black uppercase tracking-tight">Usuário Criado com Sucesso</h3>
                              <p className="text-emerald-100 text-xs font-medium mt-0.5">Copie as credenciais abaixo para enviar ao usuário</p>
                          </div>
                      </div>
                  </div>
                  <div className="p-6 space-y-4">
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider"><UserCog size={14} /> Dados do Acesso</div>
                          <div className="space-y-2">
                              <div className="flex justify-between items-center"><span className="text-xs font-bold text-gray-500">Nome:</span><span className="text-sm font-black text-gray-900">{createdCredentials.name}</span></div>
                              <div className="flex justify-between items-center"><span className="text-xs font-bold text-gray-500">E-mail:</span><span className="text-sm font-bold text-gray-900 font-mono">{createdCredentials.email}</span></div>
                              <div className="flex justify-between items-center"><span className="text-xs font-bold text-gray-500">Senha:</span><span className="text-sm font-black text-gray-900 font-mono tracking-wider">{createdCredentials.password}</span></div>
                              <div className="flex justify-between items-center"><span className="text-xs font-bold text-gray-500">Tipo:</span><span className="text-sm font-bold text-gray-900">{createdCredentials.type}</span></div>
                          </div>
                      </div>

                      <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 flex items-start gap-2">
                          <AlertTriangle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                          <p className="text-[11px] font-medium text-amber-800">No primeiro acesso, o sistema solicitará a troca de senha por segurança.</p>
                      </div>

                      <div className="bg-gray-900 rounded-xl p-4 text-white font-mono text-xs leading-relaxed whitespace-pre-wrap select-all" data-testid="text-credentials-message">
{`🔐 *GRUPO TMSEG — Acesso ao Sistema*

Olá *${createdCredentials.name}*,

Seu acesso ao sistema foi criado com sucesso.

📧 *Login:* ${createdCredentials.email}
🔑 *Senha:* ${createdCredentials.password}
🌐 *Link:* ${window.location.origin}

⚠️ No primeiro acesso, você deverá trocar sua senha por segurança.

Em caso de dúvidas, entre em contato com o suporte.

_Grupo TMSEG — Gestão Operacional_`}
                      </div>

                      <div className="flex gap-3">
                          <button
                              data-testid="button-copy-credentials"
                              onClick={() => {
                                  const msg = `🔐 *GRUPO TMSEG — Acesso ao Sistema*\n\nOlá *${createdCredentials.name}*,\n\nSeu acesso ao sistema foi criado com sucesso.\n\n📧 *Login:* ${createdCredentials.email}\n🔑 *Senha:* ${createdCredentials.password}\n🌐 *Link:* ${window.location.origin}\n\n⚠️ No primeiro acesso, você deverá trocar sua senha por segurança.\n\nEm caso de dúvidas, entre em contato com o suporte.\n\n_Grupo TMSEG — Gestão Operacional_`;
                                  navigator.clipboard.writeText(msg);
                                  setCredentialsCopied(true);
                                  setTimeout(() => setCredentialsCopied(false), 3000);
                              }}
                              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black uppercase transition-all ${credentialsCopied ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                          >
                              {credentialsCopied ? <><CheckCircle2 size={16} /> Copiado!</> : <><Copy size={16} /> Copiar Mensagem</>}
                          </button>
                          <button
                              data-testid="button-close-credentials"
                              onClick={() => { setCreatedCredentials(null); onBack(); }}
                              className="px-6 py-3 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 uppercase hover:bg-gray-50 transition-all"
                          >
                              Fechar
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {photoPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setPhotoPreview(null)} data-testid="modal-photo-preview">
          <div className="relative max-w-3xl max-h-[80vh]">
            <img src={photoPreview} alt="Foto do equipamento" className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
            <button onClick={() => setPhotoPreview(null)} className="absolute -top-3 -right-3 p-1.5 bg-white rounded-full shadow-lg text-gray-600 hover:text-gray-900">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserForm;
