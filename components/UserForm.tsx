
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, UserCog, Building2, Shield, Info, Loader2, Key, RefreshCw, Eye, EyeOff, Copy, Briefcase, AlertTriangle, CheckSquare, Square, Mail } from 'lucide-react';
import { Client, AccessProfile, ProviderData } from '../types';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { useNotification } from '../lib/NotificationContext';

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

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; }
  })();
  const currentUserClientId = currentUser.clientId || currentUser.client_id || '';
  const isClientUser = !!currentUserClientId;

  useEffect(() => {
    fetchAuxData();
    if (id) loadUser();
    else {
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
          const payload = {
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

          if (id) {
              await supabase.from('system_users').update(payload).eq('id', id);
              await logAction('UPDATE', 'User', id, `Usuário atualizado: ${payload.name}`);
              showNotification('Sucesso', 'Usuário atualizado.', 'success');
          } else {
              const { data, error } = await supabase.from('system_users').insert([payload]).select();
              if (error) throw error;
              if (data && data[0]) {
                  await logAction('CREATE', 'User', data[0].id, `Novo usuário: ${payload.name}`);
              }
              showNotification('Sucesso', 'Usuário criado com sucesso.', 'success');
          }
          onBack();
      } catch (e: any) {
          showNotification('Erro', e.message, 'error');
      } finally {
          setIsSaving(false);
      }
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
    </div>
  );
};

export default UserForm;
