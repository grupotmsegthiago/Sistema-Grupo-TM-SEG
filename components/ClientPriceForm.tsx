
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Save, DollarSign, Clock, Gauge, Building2, Shield, Loader2, AlertTriangle, MapPin, Lock } from 'lucide-react';
import { Client } from '../types';
import { isDhlSupplyClient, validateDhlTableName } from '../lib/dhlAutoTableSelector';

interface Props {
  onBack: () => void;
  onSuccess?: (newId?: string) => void;
  id?: string | null;
  defaultClient?: string | null;
}

const INPUT_CLASS = "w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-sm transition-all text-gray-700 font-medium placeholder-gray-400 uppercase";
const SELECT_CLASS = `${INPUT_CLASS} appearance-none bg-[url('https://api.iconify.design/lucide/chevron-down.svg?color=%239ca3af')] bg-[length:1.25em] bg-no-repeat bg-[position:right_1rem_center]`;
const LABEL_CLASS = "text-xs font-bold text-gray-600 uppercase mb-1.5 block";

const REGIONS = ['NÍVEL BRASIL', 'NORTE', 'NORDESTE', 'CENTRO-OESTE', 'SUDESTE', 'SUL'];

const parseCurrency = (value: string | number): number => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;
    let clean = value.toString().trim();
    if (clean.includes(',') && clean.includes('.')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
        clean = clean.replace(',', '.');
    }
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
};

const ClientPriceForm: React.FC<Props> = ({ onBack, onSuccess, id, defaultClient }) => {
  const [formData, setFormData] = useState({
    client: !id && defaultClient ? defaultClient : '',
    region: '',
    description: '',
    activation_fee: '',
    franchise_hours: '',
    franchise_km: '',
    price_per_extra_km: '',
    price_per_extra_hour: '',
    price_per_preservation_hour: '',
    cancellation_fee: ''
  });

  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        try { setCurrentUser(JSON.parse(storedUser)); } catch (e) { console.error(e); }
    }

    async function loadData() {
        setIsLoading(true);
        try {
            const { data: clientData } = await supabase.from('clients').select('id, name').eq('status', 'Ativo');
            if(clientData) setClients(clientData as any);

            if(id) {
                const { data: tableData } = await supabase.from('client_price_tables').select('*').eq('id', id).single();
                if(tableData) {
                    let reg = ''; let desc = tableData.operation_type;
                    const parts = tableData.operation_type.split(' - ');
                    if (parts.length > 1 && REGIONS.includes(parts[0])) { reg = parts[0]; desc = parts.slice(1).join(' - '); }
                    setFormData({
                        client: tableData.client, region: reg, description: desc,
                        activation_fee: tableData.activation_fee.toString(),
                        franchise_hours: tableData.franchise_hours.toString(),
                        franchise_km: tableData.franchise_km.toString(),
                        price_per_extra_km: tableData.price_per_extra_km.toString(),
                        price_per_extra_hour: tableData.price_per_extra_hour.toString(),
                        price_per_preservation_hour: (tableData.price_per_preservation_hour ?? 0).toString(),
                        cancellation_fee: (tableData.cancellation_fee ?? 0).toString(),
                    });
                }
            }
        } catch(e) { console.error(e) }
        finally { setIsLoading(false) }
    }
    loadData();
  }, [id]);

  const isFinanceAdmin = currentUser && (
      currentUser.role === 'Diretoria' || 
      currentUser.role === 'Administrador' || 
      (currentUser.role || '').toLowerCase() === 'comercial' ||
      (currentUser.permissions && currentUser.permissions.includes('*')) ||
      ['MICKAEL', 'BARBARA', 'MICHELLE'].some(n => currentUser.name && currentUser.name.toUpperCase().includes(n))
  );

  const getFullOperationType = () => formData.region ? `${formData.region} - ${formData.description}` : formData.description;

  const isDhlClient = isDhlSupplyClient(formData.client);
  const dhlValidation = isDhlClient ? validateDhlTableName(getFullOperationType()) : null;
  const showDhlWarning = isDhlClient && dhlValidation && !dhlValidation.valid && (formData.region || formData.description);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateError || !formData.region) return;
    setIsSaving(true);
    try {
        const payload = {
            client: formData.client,
            operation_type: getFullOperationType().toUpperCase(),
            activation_fee: parseCurrency(formData.activation_fee),
            franchise_hours: parseCurrency(formData.franchise_hours),
            franchise_km: parseCurrency(formData.franchise_km),
            price_per_extra_km: parseCurrency(formData.price_per_extra_km),
            price_per_extra_hour: parseCurrency(formData.price_per_extra_hour),
            price_per_preservation_hour: parseCurrency(formData.price_per_preservation_hour),
            cancellation_fee: parseCurrency(formData.cancellation_fee),
        };
        if (id) {
            const { error } = await supabase.from('client_price_tables').update(payload).eq('id', id);
            if (error) throw new Error('Erro ao salvar tabela de preço: ' + error.message);
            if (onSuccess) onSuccess(id);
            else onBack();
        } else {
            const { data: inserted, error } = await supabase.from('client_price_tables').insert([payload]).select('id');
            if (error) throw new Error('Erro ao criar tabela de preço: ' + error.message);
            const newId = inserted?.[0]?.id?.toString();
            if (onSuccess) onSuccess(newId);
            else onBack();
        }
    } catch(e: any) { alert(e.message) } finally { setIsSaving(false) }
  };

  if(isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-red-600"/></div>

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><ArrowLeft size={20} /></button>
            <h2 className="text-xl font-bold text-gray-900">{id ? 'Editar Tabela' : 'Nova Tabela de Preço'}</h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-8">
         <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100"><Building2 size={18} className="text-red-700" /><h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Identificação do Serviço</h3></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div><label className={LABEL_CLASS}>Cliente</label><select required className={SELECT_CLASS} value={formData.client} onChange={e => setFormData({...formData, client: e.target.value})}><option value="">Selecione o Cliente...</option>{clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                <div><label className={`${LABEL_CLASS} flex items-center gap-1.5`}><MapPin size={14} className="text-red-600" /> Região</label><select required className={SELECT_CLASS} value={formData.region} onChange={e => setFormData({...formData, region: e.target.value})}><option value="">Selecione...</option>{REGIONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                <div><label className={LABEL_CLASS}>Descrição / Operação</label><input required type="text" className={INPUT_CLASS} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value.toUpperCase()})} placeholder="Ex: CARACTERIZADA" /></div>
            </div>
            {showDhlWarning && (
                <div className="mt-4 flex items-start gap-3 p-3 rounded-lg border-2 border-amber-300 bg-amber-50" data-testid="warning-dhl-format">
                    <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900">
                        <p className="font-bold uppercase mb-1">Atenção: nome fora do padrão DHL</p>
                        <p className="mb-1">O motor automático só sugere tabelas DHL no formato <code className="bg-amber-100 px-1 rounded">REGIÃO - {'{REGIÃO}'} - {'{DESC}'} {'{KM}'}KM</code> (ex.: <code className="bg-amber-100 px-1 rounded">REGIÃO - SUDESTE - GRU 100KM</code>).</p>
                        <p className="mb-1"><span className="font-bold">Problema:</span> {dhlValidation?.reason}</p>
                        <p className="font-semibold">Você ainda pode salvar, mas essa tabela <span className="underline">não será sugerida automaticamente</span> em novas missões — só ficará disponível para seleção manual.</p>
                    </div>
                </div>
            )}
         </div>

         <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100"><DollarSign size={18} className="text-green-700" /><h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Custos e Franquias</h3></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div>
                   <label className={LABEL_CLASS}>Valor do Acionamento</label>
                   <div className="relative">
                      <input type="text" required className={`${INPUT_CLASS} ${!isFinanceAdmin ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={formData.activation_fee} onChange={e => setFormData({...formData, activation_fee: e.target.value})} readOnly={!isFinanceAdmin} />
                      {!isFinanceAdmin && <Lock size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />}
                   </div>
               </div>
               <div><label className={LABEL_CLASS}>Franquia Horas</label><input type="text" required className={INPUT_CLASS} value={formData.franchise_hours} onChange={e => setFormData({...formData, franchise_hours: e.target.value})} /></div>
               <div><label className={LABEL_CLASS}>Franquia KM</label><input type="text" required className={INPUT_CLASS} value={formData.franchise_km} onChange={e => setFormData({...formData, franchise_km: e.target.value})} /></div>
            </div>
         </div>

         <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100"><DollarSign size={18} className="text-red-700" /><h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Valores Excedentes</h3></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div>
                   <label className={LABEL_CLASS}>Valor KM Extra</label>
                   <div className="relative">
                      <input type="text" required className={`${INPUT_CLASS} ${!isFinanceAdmin ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={formData.price_per_extra_km} onChange={e => setFormData({...formData, price_per_extra_km: e.target.value})} readOnly={!isFinanceAdmin} />
                      {!isFinanceAdmin && <Lock size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />}
                   </div>
               </div>
               <div>
                   <label className={LABEL_CLASS}>Valor Hora Extra</label>
                   <div className="relative">
                      <input type="text" required className={`${INPUT_CLASS} ${!isFinanceAdmin ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={formData.price_per_extra_hour} onChange={e => setFormData({...formData, price_per_extra_hour: e.target.value})} readOnly={!isFinanceAdmin} />
                      {!isFinanceAdmin && <Lock size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />}
                   </div>
               </div>
               <div>
                   <label className={LABEL_CLASS}>Preservação / Hora</label>
                   <div className="relative">
                      <input type="text" className={`${INPUT_CLASS} ${!isFinanceAdmin ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Ex: 152,25 (opcional)" value={formData.price_per_preservation_hour} onChange={e => setFormData({...formData, price_per_preservation_hour: e.target.value})} readOnly={!isFinanceAdmin} data-testid="input-preservation-hour" />
                      {!isFinanceAdmin && <Lock size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />}
                   </div>
               </div>
               <div>
                   <label className={LABEL_CLASS}>Valor de Cancelamento</label>
                   <div className="relative">
                      <input type="text" className={`${INPUT_CLASS} ${!isFinanceAdmin ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Ex: 350,00 (cobrado se cancelar)" value={formData.cancellation_fee} onChange={e => setFormData({...formData, cancellation_fee: e.target.value})} readOnly={!isFinanceAdmin} data-testid="input-cancellation-fee" />
                      {!isFinanceAdmin && <Lock size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />}
                   </div>
               </div>
            </div>
         </div>

         <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
             <button type="button" onClick={onBack} className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 uppercase">Cancelar</button>
             <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-6 py-2.5 bg-black text-white rounded-lg text-sm font-bold hover:bg-gray-800 uppercase disabled:opacity-50">{isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar Tabela</button>
         </div>
      </form>
    </div>
  );
};

export default ClientPriceForm;
