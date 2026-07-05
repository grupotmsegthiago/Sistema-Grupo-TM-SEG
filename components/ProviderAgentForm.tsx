
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Save, User, Briefcase, ShieldCheck, CreditCard, Loader2, Plus, Trash2, Phone, FileText, Calendar, Wallet, AlertTriangle, RefreshCcw } from 'lucide-react';
import { ProviderData, Agent } from '../types';

interface Props {
  onBack: () => void;
  id?: string | null;
  initialProvider?: string; 
  onSuccess?: () => void;
}

const INPUT_CLASS = "w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-sm transition-all text-gray-700 font-medium placeholder-gray-400";
const SELECT_CLASS = `${INPUT_CLASS} appearance-none bg-[url('https://api.iconify.design/lucide/chevron-down.svg?color=%239ca3af')] bg-[length:1.25em] bg-no-repeat bg-[position:right_1rem_center]`;
const LABEL_CLASS = "text-xs font-bold text-gray-600 uppercase mb-1.5 block";

const initialAgentState: Partial<Agent> = {
  name: '',
  cpf: '',
  rg: '',
  cnh: '',
  cnh_validity: '',
  cnv: '',
  cnv_validity: '',
  phone: '',
  role: 'Vigilante',
  status: 'Ativo',
  orgao_emissor: '',
  cnh_categoria: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cep: '',
  admissao: '',
};

const ProviderAgentForm: React.FC<Props> = ({ onBack, id, initialProvider, onSuccess }) => {
  const [agents, setAgents] = useState<Partial<Agent>[]>([initialAgentState]);
  const [provider, setProvider] = useState(initialProvider || '');
  const [errors, setErrors] = useState<{[key: number]: string}>({});
  
  const [providerList, setProviderList] = useState<ProviderData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
        setIsLoading(true);
        try {
            // ALTERAÇÃO: neq 'Bloqueado' para permitir 'Ativo' e 'Alvará Vencido'
            const { data: provData } = await supabase.from('providers').select('id, name').neq('status', 'Bloqueado').order('name', { ascending: true });
            if(provData) setProviderList(provData as any);
            
            if(id) {
                const { data: agentData } = await supabase.from('agents').select('*').eq('id', id).single();
                if(agentData) {
                    setAgents([agentData as Agent]);
                    setProvider(agentData.provider);
                }
            } else if (initialProvider) {
                setProvider(initialProvider);
            }
        } catch(e) { console.error(e); }
        finally { setIsLoading(false) }
    }
    loadData();
  }, [id, initialProvider]);

  const checkDuplicateCpf = async (index: number, cpf: string) => {
      if (!cpf || cpf.length < 11 || cpf.startsWith('ISENTO')) return;
      try {
          let query = supabase.from('agents').select('id, name, provider').eq('cpf', cpf);
          if (id) query = query.neq('id', id);
          
          const { data } = await query.maybeSingle();
          if (data) {
              setErrors(prev => ({ ...prev, [index]: `CPF já cadastrado: ${data.name} (${data.provider})` }));
          } else {
              setErrors(prev => {
                  const newErrors = { ...prev };
                  delete newErrors[index];
                  return newErrors;
              });
          }
      } catch (e) { console.error(e); }
  };

  const handleAgentChange = (index: number, field: keyof Agent, value: string) => {
    if (field === 'status' && agents[index]?.status === 'Bloqueado / Ação Trabalhista' && value !== 'Bloqueado / Ação Trabalhista') {
        const storedUser = localStorage.getItem('userData');
        let role = '';
        if (storedUser) { try { role = (JSON.parse(storedUser).role || '').toLowerCase(); } catch(e) {} }
        if (role !== 'diretoria') {
            alert('⛔ ACESSO NEGADO\n\nSomente a DIRETORIA pode alterar o status de agentes com Ação Trabalhista.');
            return;
        }
        const pwd = prompt('🔐 AUTENTICAÇÃO DA DIRETORIA\n\nDigite a senha para desbloquear este agente:');
        if (pwd !== 'DIR2025TM') {
            alert('❌ Senha incorreta. Acesso negado.');
            return;
        }
        alert('✅ Agente desbloqueado com sucesso pela Diretoria.');
    }
    const updatedAgents = [...agents];
    updatedAgents[index] = { ...updatedAgents[index], [field]: value };
    setAgents(updatedAgents);
    
    if (field === 'cpf') {
        setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[index];
            return newErrors;
        });
    }
  };

  const addAgentForm = () => {
    setAgents([...agents, initialAgentState]);
  };

  const removeAgentForm = (index: number) => {
    if (agents.length > 1) {
      setAgents(agents.filter((_, i) => i !== index));
      setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[index];
          return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (Object.keys(errors).length > 0) {
        alert("Existem conflitos de CPF duplicado. Corrija antes de salvar.");
        return;
    }

    setIsSaving(true);
    try {
        const currentProvider = provider;
        if (!currentProvider) {
            throw new Error("Por favor, selecione um fornecedor.");
        }

        const exemptKeywords = ['CTS', 'DOMAIN', 'ATIVA', 'TM SEGURANÇA', 'TM SEGURANCA', 'TM SEGURANCA CONSULTORIA', 'ATIVA SERVICOS'];
        const isExempt = exemptKeywords.some(p => currentProvider.toUpperCase().includes(p));

        const payloads = agents.map((agent, index) => {
            const idx = index + 1;
            if (!agent.name || agent.name.trim() === '') throw new Error(`Agente ${idx}: O campo NOME é obrigatório.`);
            
            let finalCpf = agent.cpf;
            let finalCnh = agent.cnh;
            let finalCnhVal = agent.cnh_validity;
            let finalCnv = agent.cnv;
            let finalCnvVal = agent.cnv_validity;
            let finalPhone = agent.phone;

            if (isExempt) {
                if (!finalCpf) {
                    const uniqueSuffix = Date.now().toString().slice(-6) + Math.floor(Math.random() * 100).toString();
                    finalCpf = `ISENTO-${uniqueSuffix}`; 
                }
                if (!finalCnh) finalCnh = 'ISENTO';
                if (!finalCnhVal) finalCnhVal = '2099-12-31';
                if (!finalCnv) finalCnv = 'ISENTO';
                if (!finalCnvVal) finalCnvVal = '2099-12-31';
                if (!finalPhone) finalPhone = '0000000000';
            } else {
                if (!agent.cpf || agent.cpf.trim() === '') throw new Error(`Agente ${idx}: O campo CPF é obrigatório.`);
                if (!agent.cnh || agent.cnh.trim() === '') throw new Error(`Agente ${idx}: O campo CNH é obrigatório.`);
                if (!agent.cnh_validity || agent.cnh_validity.trim() === '') throw new Error(`Agente ${idx}: O campo VALIDADE DA CNH é obrigatório.`);
                if (!agent.cnv || agent.cnv.trim() === '') throw new Error(`Agente ${idx}: O campo CNV é obrigatório.`);
                if (!agent.cnv_validity || agent.cnv_validity.trim() === '') throw new Error(`Agente ${idx}: O campo VENCIMENTO DA CNV é obrigatório.`);
                if (!agent.phone || agent.phone.trim() === '') throw new Error(`Agente ${idx}: O campo TELEFONE CELULAR é obrigatório.`);
            }

            return {
                name: agent.name.trim(),
                cpf: finalCpf,
                rg: agent.rg || null,
                cnh: finalCnh,
                cnh_validity: finalCnhVal,
                cnv: finalCnv,
                cnv_validity: finalCnvVal,
                phone: finalPhone,
                role: agent.role || 'Vigilante',
                status: agent.status || 'Ativo',
                provider: currentProvider,
                orgao_emissor: (agent as any).orgao_emissor || null,
                cnh_categoria: (agent as any).cnh_categoria || null,
                rua: (agent as any).rua || null,
                numero: (agent as any).numero || null,
                complemento: (agent as any).complemento || null,
                bairro: (agent as any).bairro || null,
                cidade: (agent as any).cidade || null,
                uf: (agent as any).uf || null,
                cep: (agent as any).cep || null,
                admissao: (agent as any).admissao || null,
            };
        });

        if (id) {
            const { error } = await supabase.from('agents').update(payloads[0]).eq('id', id);
            if (error) throw error;
            alert('Agente atualizado com sucesso!');
        } else {
            const { error } = await supabase.from('agents').insert(payloads);
            if (error) throw error;
            alert(`${payloads.length} agente(s) salvo(s) com sucesso!`);
        }
        
        if (onSuccess) onSuccess(); else onBack();

    } catch (error: any) {
        console.error("Save Agent Error:", error);
        let msg = typeof error === 'string' ? error : error?.message || JSON.stringify(error);
        if (msg.includes('duplicate key value')) msg = "CPF já cadastrado no sistema.";
        alert(`Erro ao salvar: ${msg}`);
    } finally {
        setIsSaving(false);
    }
  };
  
  if(isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-red-600"/></div>

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300 h-full flex flex-col max-h-[calc(100vh-120px)]">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-bold text-gray-900">{id ? 'Editar Agente' : 'Novo Agente / Motorista'}</h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden flex-1">
         {/* HEADER FIXO DO FORM */}
         <div className="p-6 border-b border-gray-100 bg-gray-50/50 shrink-0">
            <div className="flex items-center gap-2 mb-4">
               <ShieldCheck size={18} className="text-indigo-700" />
               <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Cadastro de Agente Armado</h3>
            </div>
            
            {/* Opção de Mudar Fornecedor - Agora visível sempre */}
            <div className={`p-4 rounded-lg border shadow-sm transition-all ${id ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
               <div className="flex justify-between items-center mb-2">
                   <label className={LABEL_CLASS}>Fornecedor (Empresa Vinculada)</label>
                   {id && (
                       <span className="text-[10px] font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded flex items-center gap-1 uppercase">
                           <RefreshCcw size={10} /> Alterar Fornecedor Ativo
                       </span>
                   )}
               </div>
               <div className="relative">
                  <select 
                    required 
                    className={`${SELECT_CLASS} ${id ? 'border-amber-300 focus:ring-amber-500/20 focus:border-amber-500' : ''}`} 
                    value={provider} 
                    onChange={e => setProvider(e.target.value)}
                    >
                     <option value="">Selecione o Fornecedor...</option>
                     {providerList.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                  <Briefcase size={18} className={`absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none ${id ? 'text-amber-500' : 'text-gray-400'}`} />
               </div>
               {id && (
                   <p className="text-[9px] text-amber-700 font-bold uppercase mt-2 flex items-center gap-1">
                       <AlertTriangle size={12}/> Atenção: Mudar o fornecedor afetará os filtros e relatórios de custo deste agente.
                   </p>
               )}
            </div>
         </div>

         {/* ÁREA COM ROLAGEM DOS AGENTES */}
         <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
            <style>{`
                .scrollbar-thin::-webkit-scrollbar { width: 6px; }
                .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
                .scrollbar-thin::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
                .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
            `}</style>
            
            {agents.map((agent, index) => (
                <div key={index} className={`space-y-6 relative ${index > 0 ? 'pt-8 mt-8 border-t-2 border-dashed border-gray-200' : ''}`}>
                    {agents.length > 1 && (
                      <div className="absolute -top-4 right-0 flex items-center gap-2 bg-white px-2">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">AGENTE {index + 1}</span>
                        <button type="button" onClick={() => removeAgentForm(index)} className="p-1.5 bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition-colors shadow-sm">
                            <Trash2 size={14}/>
                        </button>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                           <label className={LABEL_CLASS}>1. Nome Completo <span className="text-red-500">*</span></label>
                           <div className="relative">
                              <input type="text" required className={INPUT_CLASS} placeholder="Nome do Agente" value={agent.name} onChange={e => handleAgentChange(index, 'name', e.target.value)} />
                              <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                           </div>
                        </div>

                        <div>
                           <label className={LABEL_CLASS}>2. CPF</label>
                           <div className="relative">
                              <input 
                                type="text" 
                                className={`w-full pl-12 pr-4 py-3 bg-white border rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-sm transition-all text-gray-700 font-medium placeholder-gray-400 ${errors[index] ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                placeholder="000.000.000-00" 
                                value={agent.cpf} 
                                onChange={e => handleAgentChange(index, 'cpf', e.target.value)}
                                onBlur={() => checkDuplicateCpf(index, agent.cpf || '')}
                              />
                              <CreditCard size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                           </div>
                           {errors[index] && (
                                <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1 animate-pulse">
                                    <AlertTriangle size={10} /> {errors[index]}
                                </p>
                           )}
                        </div>

                        <div>
                            <label className={LABEL_CLASS}>3. RG (Opcional)</label>
                            <div className="relative">
                                <input type="text" className={INPUT_CLASS} placeholder="00.000.000-0" value={agent.rg} onChange={e => handleAgentChange(index, 'rg', e.target.value)} />
                                <Wallet size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>

                        <div>
                            <label className={LABEL_CLASS}>4. CNH</label>
                            <div className="relative">
                                <input type="text" className={INPUT_CLASS} placeholder="Nº da Habilitação" value={agent.cnh} onChange={e => handleAgentChange(index, 'cnh', e.target.value)} />
                                <CreditCard size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>

                        <div>
                            <label className={LABEL_CLASS}>5. Validade da CNH</label>
                            <div className="relative">
                                <input type="date" className={INPUT_CLASS} value={agent.cnh_validity} onChange={e => handleAgentChange(index, 'cnh_validity', e.target.value)} />
                                <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>

                        <div>
                            <label className={LABEL_CLASS}>6. CNV</label>
                            <div className="relative">
                                <input type="text" className={INPUT_CLASS} placeholder="Nº da Carteira de Vigilante" value={agent.cnv} onChange={e => handleAgentChange(index, 'cnv', e.target.value)} />
                                <FileText size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>

                        <div>
                            <label className={LABEL_CLASS}>7. Vencimento da CNV</label>
                            <div className="relative">
                                <input type="date" className={INPUT_CLASS} value={agent.cnv_validity} onChange={e => handleAgentChange(index, 'cnv_validity', e.target.value)} />
                                <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>

                        <div>
                            <label className={LABEL_CLASS}>8. Telefone Celular</label>
                            <div className="relative">
                                <input type="text" className={INPUT_CLASS} placeholder="(00) 00000-0000" value={agent.phone} onChange={e => handleAgentChange(index, 'phone', e.target.value)} />
                                <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>

                        {/* ─── DADOS COMPLEMENTARES (vindos do intake do fornecedor) ─── */}
                        <div className="md:col-span-2 pt-2 mt-2 border-t border-dashed border-gray-200">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Dados complementares</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <label className={LABEL_CLASS}>Órgão Emissor / UF (RG)</label>
                              <div className="relative">
                                <input type="text" className={INPUT_CLASS} placeholder="SSP/SP" value={(agent as any).orgao_emissor || ''} onChange={e => handleAgentChange(index, 'orgao_emissor' as any, e.target.value.toUpperCase())} />
                                <FileText size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                              </div>
                            </div>
                            <div>
                              <label className={LABEL_CLASS}>Categoria CNH</label>
                              <div className="relative">
                                <select className={SELECT_CLASS} value={(agent as any).cnh_categoria || ''} onChange={e => handleAgentChange(index, 'cnh_categoria' as any, e.target.value)}>
                                  <option value="">—</option>
                                  {['A','B','AB','C','AC','D','AD','E','AE'].map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <CreditCard size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                              </div>
                            </div>
                            <div>
                              <label className={LABEL_CLASS}>Admissão</label>
                              <div className="relative">
                                <input type="date" className={INPUT_CLASS} value={(agent as any).admissao || ''} onChange={e => handleAgentChange(index, 'admissao' as any, e.target.value)} />
                                <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                              </div>
                            </div>
                            <div className="md:col-span-1" />
                            <div className="md:col-span-2">
                              <label className={LABEL_CLASS}>Rua</label>
                              <div className="relative">
                                <input type="text" className={INPUT_CLASS} placeholder="Rua / Avenida" value={(agent as any).rua || ''} onChange={e => handleAgentChange(index, 'rua' as any, e.target.value)} />
                                <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                              </div>
                            </div>
                            <div>
                              <label className={LABEL_CLASS}>Número</label>
                              <input type="text" className={INPUT_CLASS.replace('pl-12', 'pl-4')} placeholder="000" value={(agent as any).numero || ''} onChange={e => handleAgentChange(index, 'numero' as any, e.target.value)} />
                            </div>
                            <div>
                              <label className={LABEL_CLASS}>Complemento</label>
                              <input type="text" className={INPUT_CLASS.replace('pl-12', 'pl-4')} placeholder="Apto / Bloco" value={(agent as any).complemento || ''} onChange={e => handleAgentChange(index, 'complemento' as any, e.target.value)} />
                            </div>
                            <div>
                              <label className={LABEL_CLASS}>Bairro</label>
                              <input type="text" className={INPUT_CLASS.replace('pl-12', 'pl-4')} value={(agent as any).bairro || ''} onChange={e => handleAgentChange(index, 'bairro' as any, e.target.value)} />
                            </div>
                            <div>
                              <label className={LABEL_CLASS}>Cidade</label>
                              <input type="text" className={INPUT_CLASS.replace('pl-12', 'pl-4')} value={(agent as any).cidade || ''} onChange={e => handleAgentChange(index, 'cidade' as any, e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={LABEL_CLASS}>UF</label>
                                <select className={SELECT_CLASS.replace('pl-12', 'pl-4')} value={(agent as any).uf || ''} onChange={e => handleAgentChange(index, 'uf' as any, e.target.value)}>
                                  <option value="">—</option>
                                  {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className={LABEL_CLASS}>CEP</label>
                                <input type="text" className={INPUT_CLASS.replace('pl-12', 'pl-4')} placeholder="00000-000" value={(agent as any).cep || ''} onChange={e => handleAgentChange(index, 'cep' as any, e.target.value)} />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-gray-100 md:col-span-2 pt-4 mt-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className={LABEL_CLASS}>Função</label>
                                <div className="relative">
                                    <select required className={SELECT_CLASS} value={agent.role} onChange={e => handleAgentChange(index, 'role', e.target.value)}>
                                        <option value="Vigilante">Vigilante</option>
                                        <option value="Motorista">Motorista</option>
                                        <option value="Líder de Escolta">Líder de Escolta</option>
                                        <option value="Coordenador">Coordenador</option>
                                    </select>
                                    <ShieldCheck size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                </div>
                            </div>
                            <div>
                                <label className={LABEL_CLASS}>Status Operacional</label>
                                <div className="relative">
                                    <select required className={SELECT_CLASS} value={agent.status} onChange={e => handleAgentChange(index, 'status', e.target.value)}>
                                        <option value="Ativo">Ativo</option>
                                        <option value="Inativo">Inativo (Bloqueado)</option>
                                        <option value="Bloqueado / Ação Trabalhista">⛔ Bloqueado / Ação Trabalhista</option>
                                        <option value="Férias">Em Férias</option>
                                    </select>
                                    <div className={`absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full pointer-events-none ${agent.status === 'Ativo' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
            
            {!id && (
                <div className="pt-4 pb-4">
                    <button 
                      type="button" 
                      onClick={addAgentForm}
                      className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-gray-300 rounded-xl text-sm font-black text-gray-400 hover:bg-gray-50 hover:border-gray-400 hover:text-gray-600 transition-all uppercase tracking-widest group"
                    >
                        <Plus size={20} className="group-hover:scale-125 transition-transform" />
                        ADICIONAR OUTRO AGENTE
                    </button>
                </div>
            )}
         </div>

         {/* FOOTER FIXO DO FORM */}
         <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 shrink-0">
             <button type="button" onClick={onBack} disabled={isSaving} className="px-6 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-600 uppercase hover:bg-gray-100 transition-colors">Cancelar</button>
             <button type="submit" disabled={isSaving || Object.keys(errors).length > 0} className="flex items-center gap-2 px-8 py-2.5 bg-black text-white rounded-lg text-sm font-bold hover:bg-gray-800 uppercase transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18} />}
                {isSaving ? 'Salvando...' : 'Salvar Agente(s)'}
             </button>
         </div>
      </form>
    </div>
  );
};

export default ProviderAgentForm;
