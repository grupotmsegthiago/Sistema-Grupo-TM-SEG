
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, Loader2, DollarSign, Calendar, Tag, User, AlignLeft, Landmark, Wallet, Repeat, Layers, Clock, Plus } from 'lucide-react';
import { FinancialCategory, TransactionType, FinancialAccount } from '../types';
import QuickCategoryModal from './QuickCategoryModal';
import FinancialAccountManager from './FinancialAccountManager';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  id?: string | null;
}

const getTodayBR = (): string => {
    const now = new Date();
    const brStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    const brDate = new Date(brStr);
    return `${brDate.getFullYear()}-${String(brDate.getMonth() + 1).padStart(2, '0')}-${String(brDate.getDate()).padStart(2, '0')}`;
};

const FinancialTransactionForm: React.FC<Props> = ({ onClose, onSuccess, id }) => {
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(getTodayBR());
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState(''); 
  const [status, setStatus] = useState<'PENDING' | 'PAID'>('PENDING');
  const [entityType, setEntityType] = useState<'Client' | 'Provider' | 'Other' | 'Personal'>('Other');
  const [entityId, setEntityId] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'BOLETO' | 'TRANSFERENCIA' | ''>('');

  const [recurrence, setRecurrence] = useState<'SINGLE' | 'INSTALLMENT' | 'FIXED'>('SINGLE');
  const [recurrenceCount, setRecurrenceCount] = useState<number>(2);

  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [entities, setEntities] = useState<{id: string, name: string}[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [showQuickCategory, setShowQuickCategory] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);

  const installmentOptions = Array.from({ length: 47 }, (_, i) => i + 2);

  useEffect(() => {
    fetchAuxData();
    if (id) loadTransaction();
  }, [id]);

  useEffect(() => {
      fetchEntities();
  }, [entityType]);

  const fetchAuxData = async () => {
      const [cats, accs] = await Promise.all([
          supabase.from('financial_categories').select('*').order('name'),
          supabase.from('financial_accounts').select('*').order('name')
      ]);
      if (cats.data) setCategories(cats.data as FinancialCategory[]);
      if (accs.data) setAccounts(accs.data as FinancialAccount[]);
  };

  const fetchEntities = async () => {
      if (entityType === 'Other' || entityType === 'Personal') {
          setEntities([]);
          return;
      }
      const table = entityType === 'Client' ? 'clients' : 'providers';
      const { data } = await supabase.from(table).select('id, name').order('name');
      if (data) setEntities(data.map((e: any) => ({ id: e.id.toString(), name: e.name })));
  };

  const loadTransaction = async () => {
      if (!id) return;
      const { data } = await supabase.from('financial_transactions').select('*').eq('id', id).single();
      if (data) {
          setType(data.type);
          setDescription(data.description);
          setAmount(data.amount.toString());
          setDueDate(data.due_date.split('T')[0]);
          setCategoryId(data.category_id);
          setAccountId(data.account_id || '');
          setStatus(data.status);
          setEntityType(data.entity_type || 'Other');
          setEntityId(data.entity_id || '');
          setNotes(data.notes || '');
          setPaymentMethod(data.payment_method || '');
          setRecurrence('SINGLE');
      }
  };

  const parseAmountBR = (val: string): number => {
      if (!val) return 0;
      const cleaned = val.trim();
      const hasComma = cleaned.includes(',');
      const hasDot = cleaned.includes('.');
      if (hasComma && hasDot) {
          const lastComma = cleaned.lastIndexOf(',');
          const lastDot = cleaned.lastIndexOf('.');
          if (lastComma > lastDot) {
              return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
          } else {
              return parseFloat(cleaned.replace(/,/g, ''));
          }
      } else if (hasComma) {
          return parseFloat(cleaned.replace(',', '.'));
      }
      return parseFloat(cleaned);
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      const parsedAmount = parseAmountBR(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
          alert("Por favor, insira um valor válido.");
          return;
      }

      setIsSaving(true);
      try {
          const category = categories.find(c => c.id === categoryId);
          const account = accounts.find(a => a.id === accountId);
          const entity = entities.find(en => en.id === entityId);
          const currentUser = JSON.parse(localStorage.getItem('userData') || '{}').name;

          let finalEntityName = null;
          if (entityType === 'Client' || entityType === 'Provider') {
              finalEntityName = entity?.name;
          } else if (entityType === 'Personal') {
              finalEntityName = 'Pessoal';
          } else {
              finalEntityName = 'Outros';
          }

          // Ajuste de data: se o status for PAID, o payment_date deve ser IGUAL ao due_date para não haver discrepância
          // a menos que o usuário utilize a conciliação bancária depois.
          const basePayload = {
              type,
              category_id: categoryId,
              category_name: category?.name,
              account_id: accountId || null,
              account_name: account?.name,
              entity_type: entityType,
              entity_id: entityId || null,
              entity_name: finalEntityName,
              notes,
              payment_method: paymentMethod || null,
              updated_by: currentUser,
              status
          };

          if (id) {
              const { error } = await supabase.from('financial_transactions').update({
                  ...basePayload,
                  description,
                  amount: parsedAmount,
                  due_date: dueDate,
                  payment_date: status === 'PAID' ? dueDate : null,
              }).eq('id', id);
              if (error) throw new Error(error.message || 'Erro ao atualizar lançamento');
          } else {
              const payloadsToInsert = [];
              const totalItems = recurrence !== 'SINGLE' ? recurrenceCount : 1;
              const baseDate = new Date(dueDate + 'T12:00:00');

              for (let i = 0; i < totalItems; i++) {
                  const itemDate = new Date(baseDate);
                  itemDate.setMonth(baseDate.getMonth() + i);
                  const itemDateStr = itemDate.toISOString().split('T')[0];
                  
                  let finalDesc = description;
                  if (recurrence === 'INSTALLMENT' && totalItems > 1) {
                      finalDesc = `${description} (${i + 1}/${totalItems})`;
                  }

                  const currentStatus = (i === 0) ? status : 'PENDING';

                  payloadsToInsert.push({
                      ...basePayload,
                      created_by: currentUser,
                      description: finalDesc,
                      amount: parsedAmount, 
                      due_date: itemDateStr,
                      status: currentStatus,
                      payment_date: currentStatus === 'PAID' ? itemDateStr : null
                  });
              }
              const { error } = await supabase.from('financial_transactions').insert(payloadsToInsert);
              if (error) throw new Error(error.message || 'Erro ao criar lançamento');
          }
          onSuccess();
      } catch (e: any) {
          console.error(e);
          alert('Erro ao salvar: ' + (e.message || 'Erro desconhecido'));
      } finally {
          setIsSaving(false);
      }
  };

  const handleCategoryCreated = (newCat: FinancialCategory) => {
      setCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(newCat.id);
  };

  const filteredCategories = categories.filter(c => c.type === type);

  return (
    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in scale-95 duration-200 relative">
        {showQuickCategory && (
            <QuickCategoryModal 
                onClose={() => setShowQuickCategory(false)}
                initialType={type}
                onSuccess={handleCategoryCreated}
            />
        )}
        {showAccountManager && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[80vh] overflow-y-auto">
                    <FinancialAccountManager onClose={() => { setShowAccountManager(false); fetchAuxData(); }} />
                </div>
            </div>
        )}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-bold text-gray-800 uppercase text-xs tracking-widest">{id ? 'Editar Lançamento' : 'Novo Lançamento'}</h3>
            <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex bg-gray-100 p-1 rounded-lg">
                <button type="button" onClick={() => setType('INCOME')} className={`flex-1 py-2 text-xs font-bold uppercase rounded-md transition-all ${type === 'INCOME' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Receita</button>
                <button type="button" onClick={() => setType('EXPENSE')} className={`flex-1 py-2 text-xs font-bold uppercase rounded-md transition-all ${type === 'EXPENSE' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Despesa</button>
            </div>
            <div>
                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1"><Tag size={12}/> Descrição</label>
                <input required type="text" className="w-full p-2.5 border rounded-lg text-sm font-bold uppercase" placeholder="Ex: Pagamento Fornecedor" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1"><DollarSign size={12}/> Valor</label>
                    <input required type="number" step="0.01" className="w-full p-2.5 border rounded-lg text-sm font-mono font-bold text-indigo-700" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1"><Calendar size={12}/> Data</label>
                    <input required type="date" className="w-full p-2.5 border rounded-lg text-sm font-bold" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
            </div>
            {!id && (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="flex flex-wrap items-center gap-4 mb-2">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 uppercase">
                            <input type="radio" name="recurrence" checked={recurrence === 'SINGLE'} onChange={() => setRecurrence('SINGLE')} className="text-blue-600" />
                            Único
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-blue-700 uppercase">
                            <input type="radio" name="recurrence" checked={recurrence === 'INSTALLMENT'} onChange={() => setRecurrence('INSTALLMENT')} className="text-blue-600" />
                            Parcelado
                        </label>
                    </div>
                    {recurrence !== 'SINGLE' && (
                        <div className="flex items-center gap-2 animate-in slide-in-from-top-2">
                            <Layers size={16} className="text-blue-500" />
                            <span className="text-xs font-bold text-gray-600">Parcelas:</span>
                            <select className="p-1 border border-blue-300 rounded text-sm bg-white font-bold" value={recurrenceCount} onChange={(e) => setRecurrenceCount(parseInt(e.target.value))}>
                                {installmentOptions.map(n => <option key={n} value={n}>{n}x</option>)}
                            </select>
                        </div>
                    )}
                </div>
            )}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Categoria</label>
                    <div className="flex gap-2">
                        <select required className="w-full p-2.5 border rounded-lg text-xs bg-white uppercase font-bold" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                            <option value="">Selecione...</option>
                            {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button type="button" onClick={() => setShowQuickCategory(true)} className="p-2 bg-gray-100 text-gray-600 rounded-lg"><Plus size={16} /></button>
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Conta Bancária</label>
                    <div className="flex gap-2">
                        <select className="w-full p-2.5 border rounded-lg text-xs bg-white uppercase font-bold" value={accountId} onChange={e => setAccountId(e.target.value)}>
                            <option value="">Opcional</option>
                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>
                        <button type="button" onClick={() => setShowAccountManager(true)} className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Plus size={16} /></button>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Status de Liquidação</label>
                    <select className="w-full p-2.5 border rounded-lg text-sm bg-white uppercase font-bold" value={status} onChange={e => setStatus(e.target.value as any)}>
                        <option value="PENDING">Aguardando (Agendado)</option>
                        <option value="PAID">Liquidado (Pago/Recebido)</option>
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1"><Wallet size={12}/> Forma de Pagamento</label>
                    <select className="w-full p-2.5 border rounded-lg text-sm bg-white uppercase font-bold" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)} data-testid="select-payment-method">
                        <option value="">Não informado</option>
                        <option value="PIX">PIX</option>
                        <option value="BOLETO">Boleto</option>
                        <option value="TRANSFERENCIA">Transferência</option>
                    </select>
                </div>
            </div>
            <button disabled={isSaving} type="submit" className="w-full bg-gray-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg active:scale-95">
                {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
                {id ? 'Salvar Alteração' : 'Confirmar Lançamento'}
            </button>
        </form>
    </div>
  );
};

export default FinancialTransactionForm;
