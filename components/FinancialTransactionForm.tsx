import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, Loader2, DollarSign, Calendar, Tag, Wallet, Layers, Plus, ArrowRightLeft, Trash2 } from 'lucide-react';
import { FinancialCategory, TransactionType, FinancialAccount, TransactionStatus, FinancialPaymentMethod } from '../types';
import QuickCategoryModal from './QuickCategoryModal';
import FinancialAccountManager from './FinancialAccountManager';
import { INTERNAL_TRANSFER_NOTE_TAG, isInternalGroupTransfer } from '../lib/financialInternalTransfer';
import { deleteFinancialCategorySafely } from '../lib/financialCategories';
import { logAction } from '../lib/logger';
import { FINANCIAL_PAYMENT_METHODS } from '../lib/financial/paymentMethods';

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

type EntryKind = TransactionType | 'TRANSFER';

const FinancialTransactionForm: React.FC<Props> = ({ onClose, onSuccess, id }) => {
  const [entryKind, setEntryKind] = useState<EntryKind>('EXPENSE');
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(getTodayBR());
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [status, setStatus] = useState<TransactionStatus>('PENDING');
  const [entityType, setEntityType] = useState<'Client' | 'Provider' | 'Other' | 'Personal'>('Other');
  const [entityId, setEntityId] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FinancialPaymentMethod | ''>('');

  const [recurrence, setRecurrence] = useState<'SINGLE' | 'INSTALLMENT' | 'FIXED'>('SINGLE');
  const [recurrenceCount, setRecurrenceCount] = useState<number>(2);

  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [entities, setEntities] = useState<{id: string, name: string}[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  const [showQuickCategory, setShowQuickCategory] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);

  const installmentOptions = Array.from({ length: 47 }, (_, i) => i + 2);
  const isTransfer = entryKind === 'TRANSFER';

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
          setEntryKind(isInternalGroupTransfer(data) ? 'TRANSFER' : data.type);
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

  const findTransferCategory = (txType: TransactionType): FinancialCategory | undefined =>
      categories.find(c => c.type === txType && /transfer|repasse/i.test(c.name || ''))
      || categories.find(c => c.type === txType && c.group === 'NAO_OPERACIONAL')
      || categories.find(c => c.type === txType);

  const tryWithPaymentMethod = async (payload: any) => {
      const { error } = await supabase.from('financial_transactions').insert(payload);
      if (error && error.message?.includes('payment_method')) {
          const cleaned = (Array.isArray(payload) ? payload : [payload]).map(({ payment_method, ...rest }: any) => rest);
          const { error: err2 } = await supabase.from('financial_transactions').insert(cleaned);
          if (err2) throw new Error(err2.message);
      } else if (error) {
          throw new Error(error.message);
      }
  };

  const tryUpdateWithPaymentMethod = async (payload: any, recordId: string) => {
      const { error } = await supabase.from('financial_transactions').update(payload).eq('id', recordId);
      if (error && error.message?.includes('payment_method')) {
          const { payment_method, ...rest } = payload;
          const { error: err2 } = await supabase.from('financial_transactions').update(rest).eq('id', recordId);
          if (err2) throw new Error(err2.message);
      } else if (error) {
          throw new Error(error.message);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      const parsedAmount = parseAmountBR(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
          alert('Por favor, insira um valor válido.');
          return;
      }

      setIsSaving(true);
      try {
          const currentUser = JSON.parse(localStorage.getItem('userData') || '{}').name;

          // Nova transferência entre contas do grupo: cria saída + entrada (não conta como receita).
          if (isTransfer && !id) {
              if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
                  alert('Selecione contas de origem e destino diferentes (empresas do grupo).');
                  setIsSaving(false);
                  return;
              }
              const fromAcc = accounts.find(a => a.id === fromAccountId);
              const toAcc = accounts.find(a => a.id === toAccountId);
              if (!fromAcc || !toAcc) {
                  alert('Contas inválidas.');
                  setIsSaving(false);
                  return;
              }
              const outCat = findTransferCategory('EXPENSE');
              const inCat = findTransferCategory('INCOME');
              const baseDesc = (description || '').trim() || `Transferência interna ${fromAcc.name} → ${toAcc.name}`;
              const transferNotes = `${INTERNAL_TRANSFER_NOTE_TAG} ${notes || ''}`.trim();
              const paymentDate = status === 'PAID' ? dueDate : null;
              const payloads = [
                  {
                      type: 'EXPENSE' as const,
                      description: baseDesc.toUpperCase(),
                      amount: parsedAmount,
                      due_date: dueDate,
                      payment_date: paymentDate,
                      status,
                      category_id: outCat?.id || null,
                      category_name: outCat?.name || 'TRANSFERÊNCIA INTERNA',
                      account_id: fromAcc.id,
                      account_name: fromAcc.name,
                      entity_type: 'Other',
                      entity_id: null,
                      entity_name: toAcc.name,
                      notes: transferNotes,
                      created_by: currentUser,
                      updated_by: currentUser,
                      payment_method: paymentMethod || 'TRANSFERENCIA',
                  },
                  {
                      type: 'INCOME' as const,
                      description: baseDesc.toUpperCase(),
                      amount: parsedAmount,
                      due_date: dueDate,
                      payment_date: paymentDate,
                      status,
                      category_id: inCat?.id || null,
                      category_name: inCat?.name || 'TRANSFERÊNCIA INTERNA',
                      account_id: toAcc.id,
                      account_name: toAcc.name,
                      entity_type: 'Other',
                      entity_id: null,
                      entity_name: fromAcc.name,
                      notes: transferNotes,
                      created_by: currentUser,
                      updated_by: currentUser,
                      payment_method: paymentMethod || 'TRANSFERENCIA',
                  },
              ];
              await tryWithPaymentMethod(payloads);
              onSuccess();
              return;
          }

          const category = categories.find(c => c.id === categoryId);
          const account = accounts.find(a => a.id === accountId);
          const entity = entities.find(en => en.id === entityId);

          let finalEntityName = null;
          if (entityType === 'Client' || entityType === 'Provider') {
              finalEntityName = entity?.name;
          } else if (entityType === 'Personal') {
              finalEntityName = 'Pessoal';
          } else {
              finalEntityName = 'Outros';
          }

          const looksInternal =
              isTransfer
              || isInternalGroupTransfer({
                  description,
                  entity_name: finalEntityName,
                  category_name: category?.name,
                  notes,
                  account_name: account?.name,
              });

          const finalNotes = looksInternal && !String(notes || '').includes(INTERNAL_TRANSFER_NOTE_TAG)
              ? `${INTERNAL_TRANSFER_NOTE_TAG} ${notes || ''}`.trim()
              : notes;

          const basePayload: Record<string, any> = {
              type,
              category_id: categoryId,
              category_name: category?.name,
              account_id: accountId || null,
              account_name: account?.name,
              entity_type: entityType,
              entity_id: entityId || null,
              entity_name: finalEntityName,
              notes: finalNotes,
              updated_by: currentUser,
              status
          };
          if (paymentMethod) {
              basePayload.payment_method = paymentMethod;
          }

          if (id) {
              await tryUpdateWithPaymentMethod({
                  ...basePayload,
                  description,
                  amount: parsedAmount,
                  due_date: dueDate,
                  payment_date: status === 'PAID' ? dueDate : null,
              }, id);
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
              await tryWithPaymentMethod(payloadsToInsert);
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

  const handleDeleteSelectedCategory = async () => {
      const category = categories.find(c => c.id === categoryId);
      if (!category) {
          alert('Selecione a categoria que deseja excluir.');
          return;
      }
      if (!confirm(`Excluir a categoria "${category.name}"?\n\nA exclusão só será permitida se nenhum lançamento estiver usando esta categoria.`)) return;

      setIsDeletingCategory(true);
      try {
          const result = await deleteFinancialCategorySafely(supabase, category.id);
          if (!result.deleted) {
              alert(
                  `Não é possível excluir "${category.name}": ` +
                  `${result.inUseCount} lançamento(s) ainda usam esta categoria.\n\n` +
                  'Altere a categoria desses lançamentos antes de excluir.',
              );
              return;
          }
          await logAction(
              'DELETE',
              'FinancialCategory',
              category.id,
              `Categoria financeira excluída: ${category.name} (${category.type})`,
          );
          setCategories(prev => prev.filter(c => c.id !== category.id));
          setCategoryId('');
      } catch (error: any) {
          alert('Erro ao excluir categoria: ' + (error?.message || 'Erro desconhecido'));
      } finally {
          setIsDeletingCategory(false);
      }
  };

  const selectEntryKind = (kind: EntryKind) => {
      setEntryKind(kind);
      if (kind === 'TRANSFER') {
          setType('EXPENSE');
          setStatus('PAID');
          setPaymentMethod('TRANSFERENCIA');
          setRecurrence('SINGLE');
      } else {
          setType(kind);
      }
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
            <div className="flex bg-gray-100 p-1 rounded-lg gap-0.5">
                <button type="button" onClick={() => selectEntryKind('INCOME')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${entryKind === 'INCOME' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Receita</button>
                <button type="button" onClick={() => selectEntryKind('EXPENSE')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${entryKind === 'EXPENSE' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Despesa</button>
                {!id && (
                    <button type="button" onClick={() => selectEntryKind('TRANSFER')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${entryKind === 'TRANSFER' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`} data-testid="btn-entry-transfer">
                        Transferência
                    </button>
                )}
            </div>
            {isTransfer && !id && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-[11px] text-indigo-800 font-medium leading-relaxed">
                    Movimento entre contas do grupo (TM SEG / TM Security / TM Gestão). Não entra em “Entrou” nem em “Saiu” consolidado — só muda o saldo das contas.
                </div>
            )}
            <div>
                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1"><Tag size={12}/> Descrição</label>
                <input required={!isTransfer} type="text" className="w-full p-2.5 border rounded-lg text-sm font-bold uppercase" placeholder={isTransfer ? 'Opcional — ex: Repasse caixa' : 'Ex: Pagamento Fornecedor'} value={description} onChange={e => setDescription(e.target.value)} />
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
            {isTransfer && !id ? (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Conta origem (sai)</label>
                        <select required className="w-full p-2.5 border rounded-lg text-xs bg-white uppercase font-bold" value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} data-testid="select-transfer-from">
                            <option value="">Selecione...</option>
                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1"><ArrowRightLeft size={12}/> Conta destino (entra)</label>
                        <select required className="w-full p-2.5 border rounded-lg text-xs bg-white uppercase font-bold" value={toAccountId} onChange={e => setToAccountId(e.target.value)} data-testid="select-transfer-to">
                            <option value="">Selecione...</option>
                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>
                    </div>
                </div>
            ) : (
                <>
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
                                <button type="button" onClick={() => setShowQuickCategory(true)} className="p-2 bg-gray-100 text-gray-600 rounded-lg" title="Criar categoria"><Plus size={16} /></button>
                                <button
                                    type="button"
                                    onClick={handleDeleteSelectedCategory}
                                    disabled={!categoryId || isDeletingCategory}
                                    className="p-2 bg-red-50 text-red-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                                    title={categoryId ? 'Excluir categoria selecionada' : 'Selecione uma categoria para excluir'}
                                    data-testid="btn-delete-category"
                                >
                                    {isDeletingCategory ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                </button>
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
                </>
            )}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Status de Liquidação</label>
                    <select
                        className="w-full p-2.5 border rounded-lg text-sm bg-white uppercase font-bold"
                        value={status}
                        onChange={e => setStatus(e.target.value as TransactionStatus)}
                        data-testid="select-transaction-status"
                    >
                        <option value="PENDING">Pendente</option>
                        <option value="SCHEDULED">Agendado</option>
                        <option value="PAID">Pago / Recebido</option>
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1"><Wallet size={12}/> Forma de Pagamento</label>
                    <select className="w-full p-2.5 border rounded-lg text-sm bg-white uppercase font-bold" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as FinancialPaymentMethod | '')} data-testid="select-payment-method">
                        <option value="">Não informado</option>
                        {FINANCIAL_PAYMENT_METHODS.map(method => (
                            <option key={method.value} value={method.value}>{method.label}</option>
                        ))}
                    </select>
                </div>
            </div>
            <button disabled={isSaving} type="submit" className="w-full bg-gray-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg active:scale-95">
                {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
                {id ? 'Salvar Alteração' : isTransfer ? 'Confirmar Transferência' : 'Confirmar Lançamento'}
            </button>
        </form>
    </div>
  );
};

export default FinancialTransactionForm;
