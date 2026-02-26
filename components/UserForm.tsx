
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, UserCog, Building2, Shield, Info, Loader2, Key, RefreshCw, Eye, EyeOff, Copy, Briefcase, AlertTriangle, CheckSquare, Square, Mail, ShieldCheck, Clock, CheckCircle2, XCircle } from 'lucide-react';
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

const PASSWORD_RULES = {
  minLength: 8,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/
};

const validatePasswordStrength = (password: string) => {
  return {
    minLength: password.length >= PASSWORD_RULES.minLength,
    hasUppercase: PASSWORD_RULES.hasUppercase.test(password),
    hasLowercase: PASSWORD_RULES.hasLowercase.test(password),
    hasNumber: PASSWORD_RULES.hasNumber.test(password),
    hasSpecial: PASSWORD_RULES.hasSpecial.test(password),
    isStrong: password.length >= PASSWORD_RULES.minLength &&
              PASSWORD_RULES.hasUppercase.test(password) &&
              PASSWORD_RULES.hasLowercase.test(password) &&
              PASSWORD_RULES.hasNumber.test(password) &&
              PASSWORD_RULES.hasSpecial.test(password)
  };
};

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

  const [verificationStep, setVerificationStep] = useState<'form' | 'code' | 'password'>('form');
  const [verificationSessionId, setVerificationSessionId] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeSentTo, setCodeSentTo] = useState('');
  const [countdown, setCountdown] = useState(0);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [fallbackCode, setFallbackCode] = useState('');

  useEffect(() => {
    fetchAuxData();
    if (id) loadUser();
    else generateRandomPassword();
  }, [id]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const fetchAuxData = async () => {
    try {
        const [profRes, cliRes, provRes] = await Promise.all([
            supabase.from('profiles').select('*').order('name'),
            supabase.from('clients').select('id, name').eq('status', 'Ativo').order('name'),
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

  const handleSendVerificationCode = async () => {
    if (!formData.email || !formData.email.includes('@')) {
      showNotification('Erro', 'Informe um e-mail válido.', 'error');
      return;
    }
    if (emailError) return;
    if (!formData.name) {
      showNotification('Erro', 'Preencha o nome do usuário.', 'error');
      return;
    }
    if (userType === 'client' && !formData.clientId) return showNotification('Erro', 'Selecione o Cliente vinculado.', 'error');
    if (userType === 'provider' && !formData.providerId) return showNotification('Erro', 'Selecione o Fornecedor vinculado.', 'error');
    if (!formData.profileId) return showNotification('Erro', 'Selecione o Perfil de Acesso.', 'error');

    setIsSendingCode(true);
    setCodeError('');
    try {
      const res = await fetch('/api/email/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, userName: formData.name })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar código');

      setVerificationSessionId(data.sessionId);
      setCodeSentTo(formData.email);
      setVerificationStep('code');
      setCountdown(600);

      if (data.fallbackCode) {
        setFallbackCode(data.fallbackCode);
        showNotification('Código Gerado', 'E-mail não pôde ser enviado. O código está exibido na tela.', 'info');
      } else {
        setFallbackCode('');
        showNotification('Código Enviado', `Um código de 6 dígitos foi enviado para ${formData.email}`, 'success');
      }
    } catch (e: any) {
      showNotification('Erro', e.message || 'Falha ao enviar código de verificação.', 'error');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) {
      setCodeError('Digite o código de 6 dígitos');
      return;
    }
    setIsVerifying(true);
    setCodeError('');
    try {
      const res = await fetch('/api/email/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: verificationSessionId, code: verificationCode })
      });
      const data = await res.json();
      if (!res.ok || !data.verified) throw new Error(data.error || 'Código inválido');

      setVerificationStep('password');
      showNotification('Verificado', 'E-mail confirmado! Agora defina a senha segura.', 'success');
    } catch (e: any) {
      setCodeError(e.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (countdown > 540) return;
    setIsSendingCode(true);
    try {
      const res = await fetch('/api/email/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, userName: formData.name })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVerificationSessionId(data.sessionId);
      setVerificationCode('');
      setCodeError('');
      setCountdown(600);
      if (data.fallbackCode) {
        setFallbackCode(data.fallbackCode);
        showNotification('Código Gerado', 'Novo código gerado e exibido na tela.', 'info');
      } else {
        setFallbackCode('');
        showNotification('Reenviado', 'Novo código enviado.', 'success');
      }
    } catch (e: any) {
      showNotification('Erro', e.message, 'error');
    } finally {
      setIsSendingCode(false);
    }
  };

  const passwordStrength = validatePasswordStrength(newPassword);

  const handleCreateWithPassword = async () => {
    if (!passwordStrength.isStrong) {
      showNotification('Erro', 'A senha não atende todos os requisitos de segurança.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showNotification('Erro', 'As senhas não coincidem.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        password: newPassword,
        profile_id: formData.profileId || null,
        client_id: userType === 'client' ? formData.clientId : null,
        provider_id: userType === 'provider' ? formData.providerId : null,
        user_type: userType,
        status: formData.status,
        force_password_change: false,
        email_verified: true
      };

      const { data, error } = await supabase.from('system_users').insert([payload]).select();
      if (error) throw error;
      if (data && data[0]) {
        await logAction('CREATE', 'User', data[0].id, `Novo usuário (e-mail verificado): ${payload.name}`);
      }
      showNotification('Sucesso', 'Usuário criado com sucesso! E-mail verificado e senha segura definida.', 'success');
      onBack();
    } catch (e: any) {
      showNotification('Erro', e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
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
              client_id: userType === 'client' ? formData.clientId : null,
              provider_id: userType === 'provider' ? formData.providerId : null,
              user_type: userType,
              status: formData.status,
              force_password_change: false
          };

          await supabase.from('system_users').update(payload).eq('id', id);
          await logAction('UPDATE', 'User', id!, `Usuário atualizado: ${payload.name}`);
          showNotification('Sucesso', 'Usuário atualizado.', 'success');
          onBack();
      } catch (e: any) {
          showNotification('Erro', e.message, 'error');
      } finally {
          setIsSaving(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (id) {
      return handleSubmitEdit(e);
    }
    handleSendVerificationCode();
  };

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-red-600"/></div>;

  if (!id && verificationStep === 'code') {
    return (
      <div className="max-w-md mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
        <div className="flex items-center gap-3">
          <button onClick={() => setVerificationStep('form')} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-bold text-gray-900">Verificação de E-mail</h2>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail size={28} className="text-red-600" />
            </div>
            <h3 className="font-bold text-lg text-gray-900" data-testid="text-verification-title">Confirme seu E-mail</h3>
            {fallbackCode ? (
              <>
                <p className="text-sm text-gray-500 mt-2">O e-mail não pôde ser enviado. Informe o código abaixo ao novo usuário:</p>
                <div className="mt-3 bg-red-50 border-2 border-red-200 rounded-xl p-4">
                  <span className="text-2xl font-mono font-black text-red-600 tracking-[12px]" data-testid="text-fallback-code">{fallbackCode}</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">Quando o domínio for verificado no Resend, os códigos serão enviados por e-mail automaticamente.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 mt-2">Enviamos um código de 6 dígitos para:</p>
                <p className="text-sm font-bold text-red-600 mt-1" data-testid="text-email-sent-to">{codeSentTo}</p>
              </>
            )}
          </div>

          <div>
            <label className={LABEL_CLASS}>Código de Verificação</label>
            <input
              type="text"
              maxLength={6}
              className="w-full text-center text-3xl font-mono font-black tracking-[16px] py-4 bg-gray-50 border-2 border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-all"
              placeholder="000000"
              value={verificationCode}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setVerificationCode(val);
                setCodeError('');
              }}
              autoFocus
              data-testid="input-verification-code"
            />
            {codeError && <p className="text-[11px] text-red-600 font-bold mt-2 flex items-center justify-center gap-1"><XCircle size={12}/> {codeError}</p>}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {countdown > 0 ? `Expira em ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}` : 'Código expirado'}
            </span>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={isSendingCode || countdown > 540}
              className="text-red-600 font-bold hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
              data-testid="button-resend-code"
            >
              {isSendingCode ? <Loader2 size={12} className="animate-spin" /> : 'Reenviar'}
            </button>
          </div>

          <button
            onClick={handleVerifyCode}
            disabled={isVerifying || verificationCode.length !== 6}
            className="w-full flex items-center justify-center gap-2 px-8 py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 uppercase transition-all shadow-md disabled:opacity-50"
            data-testid="button-verify-code"
          >
            {isVerifying ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            Verificar Código
          </button>
        </div>
      </div>
    );
  }

  if (!id && verificationStep === 'password') {
    return (
      <div className="max-w-md mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-bold text-gray-900">Definir Senha Segura</h2>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={28} className="text-green-600" />
            </div>
            <h3 className="font-bold text-lg text-gray-900" data-testid="text-password-step-title">E-mail Verificado!</h3>
            <p className="text-sm text-gray-500 mt-2">Agora defina uma senha segura para <strong className="text-gray-900">{formData.name}</strong></p>
          </div>

          <div className="space-y-4">
            <div>
              <label className={LABEL_CLASS}>Nova Senha</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  className={`${INPUT_CLASS} pr-12 font-mono`}
                  placeholder="Digite a senha segura..."
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  data-testid="input-new-password"
                />
                <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Confirmar Senha</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  className={`${INPUT_CLASS} font-mono ${confirmPassword && confirmPassword !== newPassword ? 'border-red-500 bg-red-50' : ''}`}
                  placeholder="Repita a senha..."
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  data-testid="input-confirm-password"
                />
                <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1"><XCircle size={10}/> As senhas não coincidem</p>
              )}
            </div>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Requisitos de Segurança</p>
              <div className="space-y-1.5">
                {[
                  { ok: passwordStrength.minLength, label: 'Mínimo 8 caracteres' },
                  { ok: passwordStrength.hasUppercase, label: 'Letra maiúscula (A-Z)' },
                  { ok: passwordStrength.hasLowercase, label: 'Letra minúscula (a-z)' },
                  { ok: passwordStrength.hasNumber, label: 'Número (0-9)' },
                  { ok: passwordStrength.hasSpecial, label: 'Caractere especial (!@#$%...)' },
                ].map((rule, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs font-bold ${rule.ok ? 'text-green-600' : 'text-gray-400'}`}>
                    {rule.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {rule.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleCreateWithPassword}
            disabled={isSaving || !passwordStrength.isStrong || newPassword !== confirmPassword}
            className="w-full flex items-center justify-center gap-2 px-8 py-3 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 uppercase transition-all shadow-md disabled:opacity-50"
            data-testid="button-create-user-final"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Criar Usuário
          </button>
        </div>
      </div>
    );
  }

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
                    <input type="text" required className={INPUT_CLASS} placeholder="Nome do usuário" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} data-testid="input-user-name" />
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
                        data-testid="input-user-email"
                    />
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  {emailError && <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle size={10}/> {emailError}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label className={LABEL_CLASS}>Perfil de Acesso</label>
                      <div className="relative">
                        <select required className={SELECT_CLASS} value={formData.profileId} onChange={e => setFormData({...formData, profileId: e.target.value})} data-testid="select-profile">
                            <option value="">Selecione...</option>
                            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <Shield size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                  </div>
                  <div>
                      <label className={LABEL_CLASS}>Status da Conta</label>
                      <div className="relative">
                        <select className={SELECT_CLASS} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} data-testid="select-status">
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
                          <select required className={`${SELECT_CLASS} bg-white`} value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})} data-testid="select-client">
                              <option value="">Selecione a empresa...</option>
                              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none" />
                      </div>
                      <p className="text-[10px] text-blue-700 mt-2 flex items-center gap-1"><Info size={12}/> Este usuário verá apenas dados deste cliente.</p>
                  </div>
              )}

              {userType === 'provider' && (
                  <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 animate-in fade-in">
                      <label className={LABEL_CLASS}>Fornecedor Vinculado</label>
                      <div className="relative">
                          <select required className={`${SELECT_CLASS} bg-white`} value={formData.providerId} onChange={e => setFormData({...formData, providerId: e.target.value})} data-testid="select-provider">
                              <option value="">Selecione o fornecedor...</option>
                              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <Briefcase size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-600 pointer-events-none" />
                      </div>
                      <p className="text-[10px] text-orange-700 mt-2 flex items-center gap-1"><Info size={12}/> Este usuário terá acesso limitado ao painel do fornecedor.</p>
                  </div>
              )}

              {id && (
                <div className="pt-4 border-t border-gray-100">
                    <div className="flex justify-between items-end mb-2">
                        <label className={LABEL_CLASS}>Senha de Acesso</label>
                        <button type="button" onClick={generateRandomPassword} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 uppercase">
                            <RefreshCw size={10} /> Gerar Nova
                        </button>
                    </div>
                    <div className="relative">
                        <input 
                          type={showPassword ? "text" : "password"} 
                          required 
                          className={`${INPUT_CLASS} pr-12 font-mono tracking-wider`}
                          placeholder="••••••••" 
                          value={formData.password} 
                          onChange={e => setFormData({...formData, password: e.target.value})}
                          data-testid="input-password"
                        />
                        <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                    {generatedPass && (
                        <div className="mt-2 bg-gray-100 p-2 rounded flex justify-between items-center text-xs">
                            <span className="font-mono">{generatedPass}</span>
                            <button type="button" onClick={() => navigator.clipboard.writeText(generatedPass)} className="text-gray-500 hover:text-gray-800"><Copy size={14}/></button>
                        </div>
                    )}
                </div>
              )}

              {!id && (
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <ShieldCheck size={16} />
                    <p className="text-xs font-bold">Ao clicar em "Criar Usuário", um código de verificação será enviado ao e-mail informado. Após a confirmação, será solicitada a criação de uma senha segura.</p>
                  </div>
                </div>
              )}
          </div>

          <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={onBack} disabled={isSaving} className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 uppercase hover:bg-gray-50 transition-colors" data-testid="button-cancel">Cancelar</button>
              <button type="submit" disabled={isSaving || isSendingCode || !!emailError} className="flex items-center gap-2 px-8 py-2.5 bg-black text-white rounded-lg text-sm font-bold hover:bg-gray-800 uppercase transition-all shadow-md disabled:opacity-50" data-testid="button-submit-user">
                  {(isSaving || isSendingCode) ? <Loader2 size={18} className="animate-spin" /> : id ? <Save size={18} /> : <Mail size={18} />} 
                  {id ? 'Salvar Alterações' : 'Criar Usuário'}
              </button>
          </div>
      </form>
    </div>
  );
};

export default UserForm;
