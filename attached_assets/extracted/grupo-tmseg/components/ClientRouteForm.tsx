
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Navigation, MapPin, Building2, Ruler, Loader2, Plus, Trash2, Map as MapIcon, DollarSign, AlertTriangle, Calculator, Info, Check, ExternalLink, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Client, ClientPriceTable, QuoteItem } from '../types';
import { useLoadScript, Autocomplete, GoogleMap, DirectionsRenderer } from '@react-google-maps/api';
import { googleMapsLoadConfig } from '../lib/maps';
import { calculateDistance } from '../lib/utils';
import { useNotification } from '../lib/NotificationContext';

declare const google: any;

interface Props {
  onSuccess: (newRouteId?: string) => void;
  id?: string | null;
}

const INPUT_WITH_ICON = "w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-sm transition-all text-gray-700 font-medium placeholder-gray-400 uppercase";
const SELECT_CLASS = `${INPUT_WITH_ICON} appearance-none bg-[url('https://api.iconify.design/lucide/chevron-down.svg?color=%239ca3af')] bg-[length:1.25em] bg-no-repeat bg-[position:right_1rem_center]`;
const LABEL_CLASS = "text-xs font-bold text-gray-600 uppercase mb-1.5 block";

const BRAZIL_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO", "BR"
];

const REGIONS: Record<string, string[]> = {
    'NORTE': ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
    'NORDESTE': ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
    'CENTRO-OESTE': ['DF', 'GO', 'MT', 'MS'],
    'SUDESTE': ['ES', 'MG', 'RJ', 'SP'],
    'SUL': ['PR', 'RS', 'SC']
};

const extractUFFromAddress = (address: string): string | null => {
    if (!address) return null;
    const upper = address.toUpperCase();
    for (const uf of BRAZIL_STATES) {
        const regex = new RegExp(`[\\s\\-,\\/]${uf}([\\s\\-,\\/]|$|\\.)`);
        if (regex.test(upper)) return uf;
    }
    return null;
};

const getRegionByUF = (uf: string): string => {
    if (!uf) return '';
    for (const [region, ufs] of Object.entries(REGIONS)) {
        if (ufs.includes(uf.toUpperCase())) return region;
    }
    return '';
};

const ClientRouteForm: React.FC<Props> = ({ onSuccess, id }) => {
  const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);
  
  const { showNotification } = useNotification();

  const [formData, setFormData] = useState({
    name: '', client: '', origin: '', destination: '', distance: '', code: '', price: ''
  });

  const [autoName, setAutoName] = useState(true);
  const [coords, setCoords] = useState<{ origin: { lat: number; lng: number } | null; destination: { lat: number; lng: number } | null; waypoints: { lat: number; lng: number }[]; }>({ origin: null, destination: null, waypoints: [] });
  const [waypoints, setWaypoints] = useState<string[]>([]);
  const [directionsResponse, setDirectionsResponse] = useState<any>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const originRef = useRef<any>(null);
  const destRef = useRef<any>(null);
  const waypointRefs = useRef<any[]>([]);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user.role === 'Administrador' || user.role === 'Diretoria' || user.permissions?.includes('*')) setIsAdmin(true);
    }
    async function loadData() {
        const { data: clientsData } = await supabase.from('clients').select('*').eq('status', 'Ativo');
        if (clientsData) setClients(clientsData as any);
        if (id) {
            const { data } = await supabase.from('client_routes').select('*').eq('id', id).single();
            if (data) {
                setFormData({ name: data.name, client: data.client, origin: data.origin, destination: data.destination, distance: data.distance, code: data.code || '000', price: data.toll_cost ? data.toll_cost.toFixed(2) : '' });
                setAutoName(false);
            }
        } else {
            const { count } = await supabase.from('client_routes').select('*', { count: 'exact', head: true });
            setFormData(prev => ({ ...prev, code: ((count || 0) + 1).toString().padStart(3, '0') }));
            setAutoName(true);
        }
    }
    loadData();
  }, [id]);

  const addWaypoint = () => { setWaypoints([...waypoints, '']); setCoords(prev => ({ ...prev, waypoints: [...prev.waypoints, { lat: 0, lng: 0 }] })); };
  const removeWaypoint = (index: number) => { const newWaypoints = [...waypoints]; newWaypoints.splice(index, 1); setWaypoints(newWaypoints); const newWpCoords = [...coords.waypoints]; newWpCoords.splice(index, 1); setCoords(prev => ({ ...prev, waypoints: newWpCoords })); };

  const handlePlaceSelect = (type: 'origin' | 'destination' | 'waypoint', index?: number) => {
      let place: any;
      if (type === 'origin') {
          place = originRef.current?.getPlace();
          if (place?.geometry) { const loc = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() }; setFormData(prev => ({ ...prev, origin: place.formatted_address || '' })); setCoords(prev => ({ ...prev, origin: loc })); }
      } else if (type === 'destination') {
          place = destRef.current?.getPlace();
          if (place?.geometry) { const loc = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() }; setFormData(prev => ({ ...prev, destination: place.formatted_address || '' })); setCoords(prev => ({ ...prev, destination: loc })); }
      } else if (type === 'waypoint' && typeof index === 'number') {
          place = waypointRefs.current[index]?.getPlace();
          if (place?.geometry) {
              const loc = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
              const newWaypoints = [...waypoints]; newWaypoints[index] = place.formatted_address || ''; setWaypoints(newWaypoints);
              const newWpCoords = [...coords.waypoints]; newWpCoords[index] = loc; setCoords(prev => ({ ...prev, waypoints: newWpCoords }));
          }
      }
  };

  const calculateRouteAndName = async () => {
    if (!formData.origin || !formData.destination || !isLoaded) return;
    setIsCalculating(true);
    try {
        const directionsService = new google.maps.DirectionsService();
        const waypointsData = waypoints.filter(wp => wp.trim() !== '').map(wp => ({ location: wp, stopover: true }));
        const result = await directionsService.route({ origin: formData.origin, destination: formData.destination, waypoints: waypointsData, travelMode: google.maps.TravelMode.DRIVING });
        if (result.status === 'OK') {
            setDirectionsResponse(result);
            let totalDistMeters = 0; result.routes[0].legs.forEach((leg: any) => { totalDistMeters += leg.distance?.value || 0; });
            const totalDistKm = (totalDistMeters / 1000).toFixed(1);
            setFormData(prev => ({ ...prev, distance: totalDistKm }));
            if (autoName) {
                const originText = formData.origin.split(',')[1]?.trim() || formData.origin.split(',')[0];
                const destText = formData.destination.split(',')[1]?.trim() || formData.destination.split(',')[0];
                const uf = extractUFFromAddress(formData.origin);
                const reg = uf ? getRegionByUF(uf) : '';
                const routeName = `${reg ? reg + ' - ' : ''}${originText} x ${destText}${waypoints.length > 0 ? ' (+'+waypoints.length+' PARADAS)' : ''} (${formData.code})`;
                setFormData(prev => ({ ...prev, name: routeName.toUpperCase() }));
            }
        }
    } catch (error: any) { console.error("Erro rota:", error); } finally { setIsCalculating(false); }
  };

  useEffect(() => { if (formData.origin && formData.destination && formData.client && isLoaded) { const timer = setTimeout(() => calculateRouteAndName(), 800); return () => clearTimeout(timer); } }, [formData.origin, formData.destination, formData.client, waypoints, isLoaded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setIsSaving(true);
    try {
        const payload = { code: formData.code, name: formData.name, client: formData.client, origin: formData.origin, destination: waypoints.length > 0 ? `${formData.destination} (Via: ${waypoints.join(' -> ')})` : formData.destination, distance: formData.distance, toll_cost: parseFloat(formData.price) || 0 };
        if (id) await supabase.from('client_routes').update(payload).eq('id', id); else await supabase.from('client_routes').insert([payload]);
        showNotification('Sucesso', 'Rota salva!', 'success'); onSuccess();
    } catch (err: any) { showNotification('Erro', err.message, 'error'); } finally { setIsSaving(false); }
  };

  if (loadError) return (
    <div className="p-10 bg-red-50 text-red-700 rounded-[2rem] border border-red-200 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95">
        <AlertTriangle className="mb-4 text-red-600" size={48} />
        <h3 className="text-xl font-black uppercase tracking-tight">Erro na Chave de Mapa (Google Cloud)</h3>
        <p className="text-sm mt-2 max-w-md font-medium text-red-800">
            A chave de API informada para o projeto <strong>Sistema TMSEGo</strong> foi recusada pelo Google.
        </p>
        
        <div className="mt-8 bg-white p-5 rounded-2xl border border-red-100 shadow-sm text-left w-full max-w-md">
            <div className="flex items-center gap-2 text-red-700 font-black text-[10px] uppercase mb-2">
                <ShieldCheck size={14}/> Diagnóstico TMSEG
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
                Este erro ocorre quando o projeto Google Cloud não tem um <strong>Cartão de Crédito</strong> vinculado ou se o domínio do site não está na lista de referenciadores permitidos da chave API.
            </p>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <a 
                href="https://console.cloud.google.com/billing" 
                target="_blank" 
                rel="noreferrer"
                className="px-8 py-3 bg-red-700 text-white rounded-xl font-black text-xs uppercase shadow-xl hover:bg-red-800 transition-all flex items-center gap-2"
            >
                <ExternalLink size={16}/> Verificar Faturamento
            </a>
            <button 
                onClick={() => onSuccess()} 
                className="px-8 py-3 bg-white text-red-700 border border-red-200 rounded-xl font-black text-xs uppercase shadow-sm hover:bg-red-50 transition-all"
            >
                Fechar Formulário
            </button>
        </div>
    </div>
  );

  if (!isLoaded) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-red-600" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300 pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><button onClick={() => onSuccess()} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><ArrowLeft size={20} /></button><h2 className="text-xl font-bold text-gray-900">{id ? 'Editar Rota' : 'Nova Rota'}</h2></div>
        <div className="bg-gray-100 px-3 py-1 rounded text-xs font-bold text-gray-500 uppercase">CÓDIGO: {formData.code}</div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
             <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100"><Navigation size={18} className="text-blue-700" /><h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Configuração de Trajeto</h3></div>
             <div><label className={LABEL_CLASS}>1. Cliente</label><select required className={SELECT_CLASS} value={formData.client} onChange={e => setFormData(prev => ({ ...prev, client: e.target.value }))}><option value="">Selecione...</option>{clients.map(c => <option key={c.id} value={c.name}>{c.trading_name || c.name}</option>)}</select></div>
             <div className="space-y-4">
                 <div className="relative"><label className={LABEL_CLASS}>2. Origem</label><Autocomplete onLoad={ref => originRef.current = ref} onPlaceChanged={() => handlePlaceSelect('origin')}><input type="text" required className={`${INPUT_WITH_ICON} border-blue-200`} placeholder="Endereço de saída..." value={formData.origin} onChange={e => setFormData({...formData, origin: e.target.value})} /></Autocomplete><MapPin size={18} className="absolute left-4 bottom-3.5 text-blue-600 pointer-events-none" /></div>
                 {waypoints.map((wp, index) => (
                     <div key={index} className="relative pl-8 animate-fade-in"><div className="absolute left-2 top-8 w-0.5 h-full bg-gray-300 -translate-y-1/2"></div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Parada {index + 1}</label><div className="flex gap-2"><div className="relative flex-1"><Autocomplete onLoad={ref => waypointRefs.current[index] = ref} onPlaceChanged={() => handlePlaceSelect('waypoint', index)}><input type="text" className={`${INPUT_WITH_ICON} border-gray-200`} placeholder="Endereço..." value={wp} onChange={e => { const nw = [...waypoints]; nw[index] = e.target.value; setWaypoints(nw); }} /></Autocomplete><MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-500 pointer-events-none" /></div><button type="button" onClick={() => removeWaypoint(index)} className="p-3 text-gray-400 hover:text-red-600 border border-gray-200 rounded-lg"><Trash2 size={18} /></button></div></div>
                 ))}
                 <button type="button" onClick={addWaypoint} className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-800 ml-1"><Plus size={14} /> ADICIONAR PARADA (+)</button>
                 <div className="relative pt-2"><label className={LABEL_CLASS}>3. Destino Final</label><Autocomplete onLoad={ref => destRef.current = ref} onPlaceChanged={() => handlePlaceSelect('destination')}><input type="text" required className={`${INPUT_WITH_ICON} border-red-200`} placeholder="Endereço de chegada..." value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} /></Autocomplete><MapPin size={18} className="absolute left-4 bottom-3.5 text-red-600 pointer-events-none" /></div>
             </div>
             <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                 <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-gray-500 uppercase">Distância Total</span>{isCalculating && <Loader2 size={14} className="animate-spin text-red-600" />}</div>
                 <div className="flex items-center gap-2 text-2xl font-bold text-gray-900"><Ruler size={24} className="text-gray-400" />{formData.distance || '0.0'} <span className="text-sm text-gray-500 mt-2">KM</span></div>
                 <div className="mt-4 pt-3 border-t border-gray-200"><div className="flex justify-between items-center mb-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Nome da Rota</label><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="hidden" checked={autoName} onChange={(e) => setAutoName(e.target.checked)}/><div className={`w-3 h-3 border rounded flex items-center justify-center ${autoName ? 'bg-blue-600' : 'bg-white'}`}>{autoName && <Check size={8} className="text-white"/>}</div><span className="text-[10px] font-bold uppercase text-blue-600">Automático</span></label></div><input type="text" className={`w-full p-2 text-xs font-mono font-bold border rounded outline-none uppercase ${autoName ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-800'}`} value={formData.name} onChange={(e) => !autoName && setFormData(prev => ({ ...prev, name: e.target.value.toUpperCase() }))} readOnly={autoName} /></div>
             </div>
             {isAdmin && (<div className="p-4 rounded-lg border bg-green-50 border-green-200"><div className="flex justify-between items-center mb-2"><span className="text-xs font-bold uppercase flex items-center gap-1 text-green-800"><DollarSign size={14}/> Valor da Cobrança</span></div><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-green-700">R$</span><input type="number" step="0.01" className="w-full pl-10 pr-4 py-3 bg-white border border-green-300 rounded-lg text-lg font-bold" placeholder="0.00" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} /></div></div>)}
             <div className="pt-2 flex justify-end gap-3"><button type="button" onClick={() => onSuccess()} className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 uppercase">Cancelar</button><button type="submit" disabled={isSaving || !formData.name} className="flex items-center gap-2 px-6 py-2.5 bg-black text-white rounded-lg text-sm font-bold uppercase disabled:opacity-50">{isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar Rota</button></div>
          </form>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm h-[400px] relative overflow-hidden">
              <GoogleMap mapContainerStyle={{ width: '100%', height: '100%', borderRadius: '0.75rem' }} center={{ lat: -23.55052, lng: -46.633309 }} zoom={10} options={{ disableDefaultUI: true, zoomControl: true }}>{directionsResponse && (<DirectionsRenderer directions={directionsResponse} />)}</GoogleMap>
          </div>
      </div>
    </div>
  );
};

export default ClientRouteForm;
