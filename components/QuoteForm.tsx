
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Printer, MapPin, Calculator, Plus, Trash2, Loader2, Clock, Gauge, CheckCircle2, ScrollText, Info, Save, Database, AlertTriangle, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Client, ClientPriceTable, QuoteItem } from '../types';
import { logAction } from '../lib/logger';
import { clientFuzzyFilter } from '../lib/financialUtils';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';
import { libraries, googleMapsApiKey, googleMapsLoadConfig } from '../lib/maps';
import { useNotification } from '../lib/NotificationContext';
import { calculateDistance } from '../lib/utils';

declare const google: any;

interface Props {
  onBack: () => void;
  id?: string | null;
}

const INPUT_CLASS = "w-full px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500/20 focus:border-red-500 text-sm transition-all";
const LABEL_CLASS = "text-xs font-bold text-gray-500 uppercase mb-1 block";

const BRAZIL_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO", "BR"
];

const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const QuoteForm: React.FC<Props> = ({ onBack, id }) => {
  const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);

  const { showNotification } = useNotification();
  const [clients, setClients] = useState<Client[]>([]);
  const [tables, setTables] = useState<ClientPriceTable[]>([]);
  const [formData, setFormData] = useState({ clientId: '', clientName: '', tableId: '', origin: '', destination: '', activeUf: '', totalKm: '', totalHours: '', contractDetails: '', items: [] as QuoteItem[] });
  const [coords, setCoords] = useState<{ origin: {lat:number, lng:number} | null, dest: {lat:number, lng:number} | null }>({ origin: null, dest: null });
  const [totalValue, setTotalValue] = useState(0);
  const [appliedRate, setAppliedRate] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [isSavingTable, setIsSavingTable] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const initialUpdatedAtRef = useRef<string | null>(null);

  const originRef = useRef<any>(null);
  const destRef = useRef<any>(null);

  useEffect(() => { 
      const storedUser = localStorage.getItem('userData');
      if (storedUser) {
          try { setCurrentUser(JSON.parse(storedUser)); } catch (e) { console.error(e); }
      }
      loadInitialData(); 
  }, [id]);

  useEffect(() => {
    if (formData.clientId) {
        supabase.from('client_price_tables').select('*').or(clientFuzzyFilter(formData.clientName)).then(({ data }) => {
            if (data) setTables((data as ClientPriceTable[]).filter(t => t.operation_type.toUpperCase().includes('CARACTERIZADA') || t.operation_type.toUpperCase().includes('VELADA')));
        });
    } else setTables([]);
  }, [formData.clientId, formData.clientName]);

  useEffect(() => { calculateTotal(); }, [formData.items, formData.totalKm, formData.totalHours, formData.tableId, formData.activeUf]);

  useEffect(() => { if (isLoaded && formData.origin && formData.destination) { const timer = setTimeout(() => calculateRoute(), 1500); return () => clearTimeout(timer); } }, [formData.origin, formData.destination, isLoaded]);

  const loadInitialData = async () => {
      setIsLoading(true);
      try {
          const { data: clientsData } = await supabase.from('clients').select('*').eq('status', 'Ativo').order('name');
          if (clientsData) setClients(clientsData as any);
          if (id) {
              const { data: quote } = await supabase.from('quotes').select('*').eq('id', id).single();
              if (quote) {
                  initialUpdatedAtRef.current = (quote as { updated_at?: string | null }).updated_at ?? null;
                  const extractedUf = quote.origin.includes('-') ? quote.origin.split('-')[1].trim().split(',')[0].trim() : '';
                  setFormData({ clientId: quote.client_id.toString(), clientName: quote.client_name, tableId: '', origin: quote.origin, destination: quote.destination, activeUf: extractedUf.length === 2 ? extractedUf : '', totalKm: quote.total_km.toString(), totalHours: quote.total_hours.toString(), contractDetails: quote.contract_details || '', items: quote.items || [] });
              }
          }
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const isFinanceAdmin = currentUser && (
      currentUser.role === 'Diretoria' || 
      currentUser.role === 'Administrador' || 
      (currentUser.permissions && currentUser.permissions.includes('*')) ||
      ['MICKAEL', 'BARBARA', 'MICHELLE'].some(n => currentUser.name && currentUser.name.toUpperCase().includes(n))
  );

  const calculateRoute = async () => {
      if (!formData.origin || !formData.destination) return;
      setIsCalculatingRoute(true);
      try {
          const directionsService = new google.maps.DirectionsService();
          const result = await directionsService.route({ origin: formData.origin, destination: formData.destination, travelMode: google.maps.TravelMode.DRIVING });
          if (result.status === 'OK') {
              const leg = result.routes[0].legs[0];
              if (leg && leg.distance) {
                  const km = (leg.distance.value / 1000).toFixed(1);
                  setFormData(prev => ({ ...prev, totalKm: km, totalHours: (parseFloat(km) / 40).toFixed(1) }));
              }
          }
      } catch (error: any) {
          if (coords.origin && coords.dest) {
              const distKm = calculateDistance(coords.origin.lat, coords.origin.lng, coords.dest.lat, coords.dest.lng);
              const roadKm = (distKm * 1.3).toFixed(1);
              setFormData(prev => ({ ...prev, totalKm: roadKm, totalHours: (parseFloat(roadKm) / 40).toFixed(1) }));
              showNotification('Estimativa', 'Usando distância aproximada.', 'warning');
          }
      } finally { setIsCalculatingRoute(false); }
  };

  const handlePlaceSelect = (type: 'origin' | 'destination') => {
      let place = type === 'origin' ? originRef.current?.getPlace() : destRef.current?.getPlace();
      if (place) {
          const addr = place.formatted_address || place.name || '';
          if (place.geometry?.location) {
              const loc = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
              setCoords(prev => type === 'origin' ? { ...prev, origin: loc } : { ...prev, dest: loc });
          }
          if (type === 'origin') {
              let uf = ''; if (place.address_components) { const s = place.address_components.find((c: any) => c.types.includes('administrative_area_level_1')); if (s) uf = s.short_name; }
              setFormData(prev => ({ ...prev, origin: addr, activeUf: uf, items: uf && !prev.items.some(i => i.uf === uf) ? [...prev.items, { uf, price_km: 0, price_hour_extra: 0, price_km_extra: 0 }] : prev.items }));
          } else setFormData(prev => ({ ...prev, destination: addr }));
      }
  };

  const handleTableSelect = (val: string) => {
    setFormData(prev => ({ ...prev, tableId: val }));
  };

  const handleAddItem = () => setFormData(prev => ({ ...prev, items: [...prev.items, { uf: 'SP', price_km: 0, price_hour_extra: 0, price_km_extra: 0 }] }));
  const handleRemoveItem = (idx: number) => { const ni = [...formData.items]; ni.splice(idx, 1); setFormData(prev => ({ ...prev, items: ni })); };
  const handleItemChange = (idx: number, field: keyof QuoteItem, val: any) => { const ni = [...formData.items]; ni[idx] = { ...ni[idx], [field]: val }; setFormData(prev => ({ ...prev, items: ni })); };

  const calculateTotal = () => {
      const km = parseFloat(formData.totalKm) || 0; let calc = 0; let rate = 0;
      if (formData.items.length > 0) {
          let item = formData.items.find(i => i.uf === formData.activeUf) || formData.items.find(i => i.uf === 'BR') || formData.items[0];
          if (item) { rate = parseFloat(item.price_km as any) || 0; calc = km * rate; }
          const table = tables.find(t => t.id.toString() === formData.tableId); if (table) calc += table.activation_fee || 0;
      }
      setTotalValue(calc); setAppliedRate(rate);
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (formData.items.length === 0) { showNotification('Atenção', 'Adicione uma região.', 'warning'); return; }
      setIsSaving(true);
      try {
          const payload = { client_id: parseInt(formData.clientId), client_name: formData.clientName, origin: formData.origin, destination: formData.destination, total_km: parseFloat(formData.totalKm) || 0, total_hours: parseFloat(formData.totalHours) || 0, total_value: totalValue, status: 'Rascunho', items: formData.items, contract_details: formData.contractDetails, created_by: JSON.parse(localStorage.getItem('userData') || '{}').name };
          if (id) {
              const fetchRes = await supabase.from('quotes').select('updated_at').eq('id', id).single();
              if (fetchRes.error) { showNotification('Erro', 'Falha ao validar cotação: ' + fetchRes.error.message, 'error'); setIsSaving(false); return; }
              const current = fetchRes.data as { updated_at: string | null } | null;
              if (current?.updated_at && initialUpdatedAtRef.current && current.updated_at !== initialUpdatedAtRef.current) {
                  showNotification('Conflito', 'Esta cotação foi alterada por outro usuário. Recarregue.', 'error');
                  setIsSaving(false);
                  return;
              }
              const { error: updErr } = await supabase.from('quotes').update(payload).eq('id', id);
              if (updErr) { showNotification('Erro', 'Erro ao salvar cotação: ' + updErr.message, 'error'); setIsSaving(false); return; }
              initialUpdatedAtRef.current = new Date().toISOString();
          } else {
              const { data, error: insErr } = await supabase.from('quotes').insert([payload]).select();
              if (insErr) { showNotification('Erro', 'Erro ao criar cotação: ' + insErr.message, 'error'); setIsSaving(false); return; }
              if (data && data[0]) await logAction('CREATE', 'Quote', data[0].id, `Nova cotação: ${formData.clientName}`);
          }
          onBack();
      } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erro desconhecido';
          showNotification('Erro', 'Erro ao salvar: ' + msg, 'error');
      } finally { setIsSaving(false); }
  };

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-green-600"/></div>;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center justify-between mb-6 no-print">
        <div className="flex items-center gap-3"><button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><ArrowLeft size={20} /></button><h2 className="text-xl font-bold text-gray-900">{id ? 'Editar Cotação' : 'Nova Cotação'}</h2></div>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-600"><Printer size={16} /> Imprimir</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-fit no-print">
              {loadError && (
                  <div className="mb-6 p-6 bg-red-50 border border-red-200 rounded-[1.5rem] flex items-start gap-4 text-red-700 animate-in zoom-in-95">
                      <AlertTriangle className="shrink-0 mt-1" size={24} />
                      <div>
                        <p className="font-black text-xs uppercase tracking-tight">Falha na API Google (InvalidKeyMapError)</p>
                        <p className="text-xs font-medium mt-1 leading-relaxed">
                            A chave de API configurada para o <strong>Sistema TMSEGo</strong> foi recusada. Verifique o status de faturamento no console do Google ou as restrições de domínio.
                        </p>
                        <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-[10px] font-black text-red-600 bg-white px-3 py-1 rounded-lg border border-red-100 shadow-sm hover:bg-red-50 transition-all uppercase">
                            <ExternalLink size={12}/> Gerenciar Console
                        </a>
                      </div>
                  </div>
              )}
              <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100"><Calculator size={20} className="text-red-700" /><h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Calculadora</h3></div>
              <form id="quoteForm" onSubmit={handleSubmit} className="space-y-5">
                  <div><label className={LABEL_CLASS}>Cliente</label><select required className={INPUT_CLASS} value={formData.clientId} onChange={e => { const c = clients.find(cl => cl.id.toString() === e.target.value); setFormData(prev => ({ ...prev, clientId: e.target.value, clientName: c?.name || '' })); }}><option value="">Selecione...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><label className={LABEL_CLASS}>Tabela Base</label><select className={INPUT_CLASS} value={formData.tableId} onChange={e => handleTableSelect(e.target.value)} disabled={!formData.clientId}><option value="">Selecione...</option>{tables.map(t => (<option key={t.id} value={t.id}>{t.operation_type}</option>))}</select></div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <label className="text-xs font-bold uppercase flex items-center gap-1 text-gray-600 mb-3"><MapPin size={12} /> Custos por UF</label>
                      <div className="space-y-2">
                          {formData.items.map((item, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center"><div className="col-span-2"><select className="w-full p-1.5 border rounded text-xs" value={item.uf} onChange={e => handleItemChange(idx, 'uf', e.target.value)}>{BRAZIL_STATES.map(uf => <option key={uf}>{uf}</option>)}</select></div><div className="col-span-4"><input type="number" step="0.01" className="w-full p-1.5 border rounded text-xs" placeholder="R$/KM" value={item.price_km} onChange={e => handleItemChange(idx, 'price_km', e.target.value)} /></div><div className="col-span-4 flex gap-1"><input type="number" step="0.01" className={`w-full p-1.5 border rounded text-xs ${!isFinanceAdmin ? 'bg-gray-100' : ''}`} placeholder="HR+" value={item.price_hour_extra} onChange={e => handleItemChange(idx, 'price_hour_extra', e.target.value)} readOnly={!isFinanceAdmin} /><input type="number" step="0.01" className={`w-full p-1.5 border rounded text-xs ${!isFinanceAdmin ? 'bg-gray-100' : ''}`} placeholder="KM+" value={item.price_km_extra} onChange={e => handleItemChange(idx, 'price_km_extra', e.target.value)} readOnly={!isFinanceAdmin} /></div><div className="col-span-2 flex justify-end"><button type="button" onClick={() => handleRemoveItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></div></div>
                          ))}
                          <button type="button" onClick={handleAddItem} className="bg-gray-800 text-white p-1.5 rounded-lg w-full text-xs font-bold">+ ADICIONAR UF</button>
                      </div>
                  </div>
                  <div><label className={LABEL_CLASS}>Origem</label><div className="relative">{isLoaded ? (<Autocomplete onLoad={ref => originRef.current = ref} onPlaceChanged={() => handlePlaceSelect('origin')}><input type="text" className={INPUT_CLASS} placeholder="Cidade de origem..." value={formData.origin} onChange={e => setFormData({...formData, origin: e.target.value})} /></Autocomplete>) : (<input type="text" className={INPUT_CLASS} placeholder="Chave de API necessária..." disabled />)}<MapPin size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 pointer-events-none" /></div></div>
                  <div><label className={LABEL_CLASS}>Destino</label><div className="relative">{isLoaded ? (<Autocomplete onLoad={ref => destRef.current = ref} onPlaceChanged={() => handlePlaceSelect('destination')}><input type="text" className={INPUT_CLASS} placeholder="Cidade de destino..." value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} /></Autocomplete>) : (<input type="text" className={INPUT_CLASS} placeholder="Chave de API necessária..." disabled />)}<MapPin size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-600 pointer-events-none" /></div></div>
                  <div className="grid grid-cols-2 gap-4"><div><label className={LABEL_CLASS}>KM Total</label><input type="number" className={INPUT_CLASS} value={formData.totalKm} onChange={e => setFormData({...formData, totalKm: e.target.value})} /></div><div><label className={LABEL_CLASS}>Horas</label><input type="number" className={INPUT_CLASS} value={formData.totalHours} onChange={e => setFormData({...formData, totalHours: e.target.value})} /></div></div>
                  <div><label className={LABEL_CLASS}>Escopo / Notas</label><textarea className={`${INPUT_CLASS} h-24`} value={formData.contractDetails} onChange={e => setFormData({...formData, contractDetails: e.target.value})} /><ScrollText size={18} className="absolute right-3 top-3 text-gray-400 pointer-events-none" /></div>
              </form>
          </div>
          <div className="lg:col-span-5 space-y-6">
              <div id="quote-preview" className="bg-white rounded-lg shadow-lg border-t-4 border-red-700 p-8 min-h-[500px] flex flex-col">
                  <div className="flex justify-between items-start mb-8"><div><h1 className="text-2xl font-black uppercase tracking-tighter">Cotação</h1><p className="text-xs text-gray-500">Serviços de Segurança</p></div><p className="text-sm font-bold">{new Date().toLocaleDateString()}</p></div>
                  <div className="mb-8"><p className="text-[10px] text-gray-400 font-bold uppercase">Cliente</p><h2 className="text-lg font-bold uppercase">{formData.clientName || '...'}</h2></div>
                  {totalValue > 0 && (<div className="border-t-2 border-gray-900 pt-4 mt-auto"><div className="flex justify-between items-end"><div><span className="text-sm font-bold uppercase">Total Estimado</span><p className="text-[10px] text-green-600 font-bold">Base: {formatCurrency(appliedRate)}/km</p></div><span className="text-3xl font-black">{formatCurrency(totalValue)}</span></div></div>)}
              </div>
              <button type="submit" form="quoteForm" disabled={isSaving} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-3 no-print disabled:opacity-50">{isSaving ? <Loader2 className="animate-spin" /> : <Save />} Salvar</button>
          </div>
      </div>
    </div>
  );
};

export default QuoteForm;
