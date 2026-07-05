
import React, { useState, useRef, useEffect } from 'react';
import { X, Save, Loader2, MapPin, Shield, Phone, User, Navigation, DollarSign, Trash2, Plus, Banknote, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Autocomplete } from '@react-google-maps/api';
import { SupportAgent } from '../types';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  initialData?: SupportAgent | null;
}

interface ServiceCity {
    name: string;
    lat: number;
    lng: number;
}

const INPUT_CLASS = "w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-sm transition-all";
const LABEL_CLASS = "text-xs font-bold text-gray-500 uppercase mb-1 block";

const SupportAgentFormModal: React.FC<Props> = ({ onClose, onSuccess, initialData }) => {
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    phone: '',
    base_address: '',
    latitude: 0,
    longitude: 0,
    is_armed: false,
    is_24h: false,
    service_cities: '', // String format for DB (display only)
    status: 'Ativo',
    cost_value: ''
  });

  // Lista de Cidades (Agora com coordenadas)
  const [cityInput, setCityInput] = useState('');
  const [citiesList, setCitiesList] = useState<ServiceCity[]>([]);
  
  // Estado temporário para validar se a cidade veio do Google Maps
  const [tempCitySelection, setTempCitySelection] = useState<ServiceCity | null>(null);
  
  const [pixKey, setPixKey] = useState('');
  const [pixType, setPixType] = useState('CPF/CNPJ');

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [canViewFinancial, setCanViewFinancial] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [showDirectoriaAuth, setShowDirectoriaAuth] = useState(false);
  const [directoriaPassword, setDirectoriaPassword] = useState('');
  
  const [phoneError, setPhoneError] = useState('');
  const [checkingPhone, setCheckingPhone] = useState(false);

  const addressRef = useRef<any>(null);
  const cityRef = useRef<any>(null);

  useEffect(() => {
      // 1. Load User Permissions
      const storedUser = localStorage.getItem('userData');
      if (storedUser) {
          try {
              const user = JSON.parse(storedUser);
              const role = (user.role || '').toLowerCase();
              setUserRole(role);
              if (['diretoria', 'administrador'].includes(role) || user.permissions?.includes('*')) {
                  setCanViewFinancial(true);
              }
          } catch (e) { console.error(e); }
      }

      // 2. Load Initial Data (Editing Mode)
      if (initialData) {
          setFormData({
              name: initialData.name || '',
              cpf: initialData.cpf || '',
              phone: initialData.phone || '',
              base_address: initialData.base_address || '',
              latitude: initialData.latitude || 0,
              longitude: initialData.longitude || 0,
              is_armed: initialData.is_armed || false,
              is_24h: initialData.is_24h || false,
              service_cities: initialData.service_cities || '',
              status: initialData.status || 'Ativo',
              cost_value: initialData.cost_value ? initialData.cost_value.toString() : ''
          });

          // Recuperar cidades da string (apenas nomes, pois não temos coords antigas)
          if (initialData.service_cities) {
              const list = initialData.service_cities.split(',').map(s => s.trim()).filter(s => s !== '');
              setCitiesList(list.map(name => ({ name, lat: 0, lng: 0 })));
          }

          // Carrega PIX
          if (initialData.pix_key) {
              if (initialData.pix_key.includes(':')) {
                  const [t, k] = initialData.pix_key.split(':').map(s => s.trim());
                  setPixType(t);
                  setPixKey(k);
              } else {
                  setPixKey(initialData.pix_key);
              }
          }
      }
  }, [initialData]);

  // Sincroniza a string de exibição com a lista
  useEffect(() => {
      setFormData(prev => ({
          ...prev,
          service_cities: citiesList.map(c => c.name).join(', ')
      }));
  }, [citiesList]);

  // Google Maps: Endereço Base
  const handlePlaceSelect = () => {
      const place = addressRef.current?.getPlace();
      if (place && place.geometry) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          const address = place.formatted_address || '';
          
          setFormData(prev => ({
              ...prev,
              base_address: address,
              latitude: lat,
              longitude: lng
          }));
      }
  };

  // Google Maps: Cidade de Atendimento (SELEÇÃO)
  const handleCitySelect = () => {
      const place = cityRef.current?.getPlace();
      if (place && place.geometry) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          
          // Preferimos o nome curto da cidade, mas usamos formatted se falhar
          let cityName = '';
          if (place.address_components) {
             const cityComponent = place.address_components.find((c: any) => c.types.includes('administrative_area_level_2') || c.types.includes('locality'));
             const stateComponent = place.address_components.find((c: any) => c.types.includes('administrative_area_level_1'));
             
             if (cityComponent) {
                 cityName = cityComponent.short_name;
                 if (stateComponent) cityName += ` - ${stateComponent.short_name}`;
             }
          }
          
          if (!cityName) cityName = place.name || place.formatted_address;

          setCityInput(cityName); // Mostra o nome bonito no input
          setTempCitySelection({ name: cityName, lat, lng }); // Guarda para validação
      }
  };

  // Botão Adicionar Cidade (COM VALIDAÇÃO RÍGIDA)
  const handleAddCityToList = () => {
      if (!cityInput.trim()) return;

      // Validação: Só aceita se tiver vindo do Google Maps (lat/lng válidos no temp)
      if (!tempCitySelection || tempCitySelection.name !== cityInput) {
          alert("ERRO DE VALIDAÇÃO:\n\nVocê digitou um texto livre. Por favor, selecione uma cidade válida na lista do Google Maps para vincular as coordenadas corretamente.");
          setCityInput(''); // Limpa para forçar digitação correta
          setTempCitySelection(null);
          return;
      }

      // Verificar duplicidade na lista local
      if (citiesList.some(c => c.name === tempCitySelection.name)) {
          alert("Esta cidade já foi adicionada.");
          setCityInput('');
          setTempCitySelection(null);
          return;
      }

      setCitiesList(prev => [...prev, tempCitySelection]);
      setCityInput('');
      setTempCitySelection(null);
  };

  const handleRemoveCity = (cityName: string) => {
      setCitiesList(prev => prev.filter(c => c.name !== cityName));
  };

  // --- VALIDAÇÃO DE TELEFONE ---
  const checkPhoneDuplicate = async () => {
      const phone = formData.phone.trim();
      if (!phone || phone.length < 8) return;

      setCheckingPhone(true);
      setPhoneError('');

      try {
          let query = supabase.from('support_agents').select('id, name').eq('phone', phone);
          
          if (initialData?.id) {
              query = query.neq('id', initialData.id); // Exclui o próprio se for edição
          }

          const { data } = await query.maybeSingle();

          if (data) {
              setPhoneError(`Este telefone já está cadastrado para: ${data.name}`);
          }
      } catch (e) {
          console.error('Erro ao verificar telefone:', e);
      } finally {
          setCheckingPhone(false);
      }
  };

  // --- LOGICA DE COLISÃO E AGENTE VIRTUAL ---
  const applyOffset = (lat: number, lng: number) => {
      const R = 6371; // Earth radius in km
      const d = 1; // 1 km distance
      const brng = Math.random() * 2 * Math.PI; 
      const latRad = lat * (Math.PI / 180);
      const lngRad = lng * (Math.PI / 180);
      const newLatRad = Math.asin(Math.sin(latRad) * Math.cos(d / R) + Math.cos(latRad) * Math.sin(d / R) * Math.cos(brng));
      const newLngRad = lngRad + Math.atan2(Math.sin(brng) * Math.sin(d / R) * Math.cos(latRad), Math.cos(d / R) - Math.sin(latRad) * Math.sin(newLatRad));
      return { lat: newLatRad * (180 / Math.PI), lng: newLngRad * (180 / Math.PI) };
  };

  const checkCollision = async (lat: number, lng: number) => {
      const range = 0.001; 
      const { data } = await supabase.from('support_agents').select('id').gt('latitude', lat - range).lt('latitude', lat + range).gt('longitude', lng - range).lt('longitude', lng + range).limit(1);
      return data && data.length > 0;
  };

  const handleDelete = async () => {
      if (!initialData) return;
      if (!confirm(`TEM CERTEZA? Inativar o agente ${initialData.name}?\n\nO registro será mantido no banco de dados mas ficará com status BLOQUEADO.`)) return;
      setIsDeleting(true);
      try {
          const { error } = await supabase.from('support_agents').update({ status: 'Bloqueado' }).eq('id', initialData.id);
          if (error) throw error;
          try { await supabase.from('support_agents').update({ status: 'Bloqueado' }).eq('parent_agent_id', initialData.id); } catch(ignore) {}
          alert('Agente bloqueado com sucesso. O registro permanece no banco de dados.');
          onSuccess();
          onClose();
      } catch (e: any) {
          alert("Erro ao bloquear: " + e.message);
      } finally {
          setIsDeleting(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (phoneError) {
          alert("Corrija o erro de telefone antes de salvar.");
          return;
      }

      if (!formData.latitude || !formData.longitude) {
          alert("Erro de Localização: Selecione um endereço válido na lista do Google Maps para capturar as coordenadas.");
          return;
      }

      if (initialData?.status === 'Bloqueado / Ação Trabalhista' && formData.status !== 'Bloqueado / Ação Trabalhista' && userRole !== 'diretoria') {
          alert('⛔ ACESSO NEGADO\n\nSomente a DIRETORIA pode alterar o status de agentes com Ação Trabalhista.');
          return;
      }

      setIsSaving(true);

      try {
          const mainPayload: any = {
              name: formData.name.toUpperCase(),
              cpf: formData.cpf || null, 
              phone: formData.phone,
              base_address: formData.base_address,
              latitude: formData.latitude,
              longitude: formData.longitude,
              is_armed: formData.is_armed,
              is_24h: formData.is_24h,
              service_cities: formData.service_cities.toUpperCase(),
              status: formData.status,
              // Only update cost if allowed
              ...(canViewFinancial ? { cost_value: formData.cost_value ? parseFloat(formData.cost_value) : null } : {}),
              pix_key: pixKey ? `${pixType}: ${pixKey}` : null,
          };

          let mainAgentId = initialData?.id;

          if (initialData) {
              const { error } = await supabase.from('support_agents').update(mainPayload).eq('id', initialData.id);
              if (error) throw error;
          } else {
              const { data, error } = await supabase.from('support_agents').insert([mainPayload]).select();
              if (error) throw error;
              if (data && data.length > 0) {
                  mainAgentId = data[0].id;
              }
          }

          if (mainAgentId && citiesList.length > 0) {
              if (initialData) {
                  try { await supabase.from('support_agents').delete().eq('parent_agent_id', mainAgentId); } catch (e) {}
              }

              const virtualAgentsBase = [];
              for (const city of citiesList) {
                  if (!city.lat || !city.lng) continue;
                  let finalLat = city.lat;
                  let finalLng = city.lng;
                  const hasCollision = await checkCollision(city.lat, city.lng);
                  if (hasCollision) {
                      const offset = applyOffset(city.lat, city.lng);
                      finalLat = offset.lat;
                      finalLng = offset.lng;
                  }
                  virtualAgentsBase.push({
                      name: `${formData.name} (BASE: ${city.name.toUpperCase()})`.toUpperCase(),
                      cpf: null,
                      phone: formData.phone,
                      base_address: city.name,
                      latitude: finalLat,
                      longitude: finalLng,
                      is_armed: formData.is_armed,
                      is_24h: formData.is_24h,
                      service_cities: "VIRTUAL POINT",
                      status: formData.status,
                  });
              }

              if (virtualAgentsBase.length > 0) {
                  const payloadFull = virtualAgentsBase.map(a => ({
                      ...a,
                      is_virtual: true,
                      parent_agent_id: mainAgentId
                  }));
                  try {
                      const { error: vError } = await supabase.from('support_agents').insert(payloadFull);
                      if (vError) throw vError;
                  } catch (virtualError: any) {
                      if (virtualError.message?.includes('is_virtual') || virtualError.message?.includes('parent_agent_id') || virtualError.message?.includes('column')) {
                          console.warn("Colunas de virtualização ausentes. Usando fallback.");
                          await supabase.from('support_agents').insert(virtualAgentsBase);
                      }
                  }
              }
          }
          
          alert(initialData ? 'Dados atualizados com sucesso!' : 'Agente cadastrado com sucesso!');
          onSuccess();
          onClose();

      } catch (err: any) {
          console.error(err);
          let msg = err.message;
          if (msg.includes('cost_value')) msg = "Erro: Coluna de custo não existe no banco. Contate o administrador.";
          alert('Erro ao salvar: ' + msg);
      } finally {
          setIsSaving(false);
      }
  };

  return (<>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Navigation className="text-red-600" /> {initialData ? 'Editar Agente' : 'Novo Agente de Apoio (QRF)'}
                </h3>
                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1 overflow-y-auto">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className={LABEL_CLASS}>Nome Completo</label>
                        <div className="relative">
                            <input 
                                type="text" required className={INPUT_CLASS} 
                                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                                placeholder="Nome do Agente / Parceiro"
                            />
                            <User size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                    </div>

                    <div>
                        <label className={LABEL_CLASS}>CPF (Opcional)</label>
                        <input 
                            type="text" 
                            className={INPUT_CLASS} 
                            value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})}
                            placeholder="000.000.000-00"
                        />
                    </div>

                    <div>
                        <label className={LABEL_CLASS}>Telefone / WhatsApp</label>
                        <div className="relative">
                            <input 
                                type="text" required 
                                className={`${INPUT_CLASS} ${phoneError ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : ''}`}
                                value={formData.phone} 
                                onChange={e => {
                                    setFormData({...formData, phone: e.target.value});
                                    if (phoneError) setPhoneError('');
                                }}
                                onBlur={checkPhoneDuplicate}
                                placeholder="(00) 00000-0000"
                            />
                            {checkingPhone ? (
                                <Loader2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
                            ) : (
                                <Phone size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            )}
                        </div>
                        {phoneError && (
                            <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1 animate-pulse">
                                <AlertTriangle size={10} /> {phoneError}
                            </p>
                        )}
                    </div>

                    <div className="md:col-span-2">
                        <label className={LABEL_CLASS}>Endereço de Base (Geolocalização)</label>
                        <div className="relative">
                            <Autocomplete onLoad={ref => addressRef.current = ref} onPlaceChanged={handlePlaceSelect}>
                                <input 
                                    type="text" required className={INPUT_CLASS} 
                                    placeholder="Digite o endereço e selecione na lista..."
                                    defaultValue={formData.base_address}
                                />
                            </Autocomplete>
                            <MapPin size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 pointer-events-none" />
                        </div>
                        {formData.latitude !== 0 && (
                            <p className="text-[10px] text-green-600 font-bold mt-1 ml-1 flex items-center gap-1">
                                <MapPin size={10} /> Coordenadas capturadas!
                            </p>
                        )}
                    </div>

                    <div className="md:col-span-2 bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <label className={LABEL_CLASS}>Cidades de Atendimento (Pontos Virtuais)</label>
                        <p className="text-[10px] text-blue-700 mb-2">
                            Ao adicionar cidades, o sistema cria <strong>Agentes Virtuais</strong> nestes locais. 
                            <br/><strong>Atenção:</strong> Você deve selecionar a cidade na lista do Google Maps.
                        </p>
                        
                        <div className="flex gap-2 mb-2 relative">
                            <div className="flex-1 relative">
                                <Autocomplete onLoad={ref => cityRef.current = ref} onPlaceChanged={handleCitySelect}>
                                    <input 
                                        type="text" 
                                        className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                                        placeholder="Digite e selecione a cidade..."
                                        value={cityInput}
                                        onChange={e => {
                                            setCityInput(e.target.value);
                                            // Se o usuário digita, invalidamos a seleção anterior do Maps para forçar nova seleção
                                            setTempCitySelection(null); 
                                        }}
                                    />
                                </Autocomplete>
                            </div>
                            <button 
                                type="button"
                                onClick={handleAddCityToList}
                                className={`px-3 rounded-lg text-white transition-colors flex items-center ${!tempCitySelection && cityInput ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                                title={!tempCitySelection && cityInput ? "Selecione uma opção da lista do Google Maps" : "Adicionar Cidade"}
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                        
                        {/* LISTA VISUAL DE CIDADES (TAGS) */}
                        <div className="flex flex-wrap gap-2">
                            {citiesList.length > 0 ? citiesList.map((city, idx) => (
                                <div key={idx} className="bg-white border border-blue-200 text-blue-800 px-2 py-1 rounded text-xs font-bold flex items-center gap-2 shadow-sm">
                                    {city.name}
                                    <button 
                                        type="button" 
                                        onClick={() => handleRemoveCity(city.name)}
                                        className="text-gray-400 hover:text-red-600 ml-1"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )) : (
                                <span className="text-xs text-blue-400 italic">Nenhuma cidade adicional. O agente aparecerá apenas no endereço base.</span>
                            )}
                        </div>
                    </div>

                    {/* DADOS BANCÁRIOS (PIX) */}
                    <div className="md:col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                        <label className="text-xs font-bold text-gray-600 uppercase flex items-center gap-2">
                            <Banknote size={14} className="text-green-600"/> Dados para Pagamento (PIX)
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-1">
                                <select 
                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:border-green-500 outline-none"
                                    value={pixType}
                                    onChange={e => setPixType(e.target.value)}
                                >
                                    <option value="CPF/CNPJ">CPF/CNPJ</option>
                                    <option value="CELULAR">Celular</option>
                                    <option value="EMAIL">E-mail</option>
                                    <option value="ALEATORIA">Chave Aleatória</option>
                                </select>
                            </div>
                            <div className="col-span-2">
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:border-green-500 outline-none font-medium"
                                    placeholder="Chave PIX"
                                    value={pixKey}
                                    onChange={e => setPixKey(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className={LABEL_CLASS}>Status</label>
                        {initialData?.status === 'Bloqueado / Ação Trabalhista' && formData.status === 'Bloqueado / Ação Trabalhista' ? (
                            <div>
                                <div className="animate-blocked-flash-3d text-white px-4 py-3 rounded-lg flex items-center justify-between">
                                    <span className="text-[11px] font-black uppercase drop-shadow-lg">⛔ BLOQUEADO / AÇÃO TRABALHISTA</span>
                                    {userRole === 'diretoria' && (
                                        <button type="button" onClick={() => setShowDirectoriaAuth(true)} className="bg-white/20 hover:bg-white/30 text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-md transition-all backdrop-blur-sm border border-white/30">DESBLOQUEAR</button>
                                    )}
                                </div>
                                {userRole !== 'diretoria' && <p className="text-[9px] text-red-500 font-bold mt-1 uppercase">Somente a DIRETORIA pode alterar este status.</p>}
                            </div>
                        ) : (
                            <select 
                                className={INPUT_CLASS}
                                value={formData.status}
                                onChange={e => setFormData({...formData, status: e.target.value as any})}
                            >
                                <option value="Ativo">Ativo</option>
                                <option value="Pendente">Pendente</option>
                                <option value="Bloqueado">Bloqueado</option>
                                <option value="Bloqueado / Ação Trabalhista">Bloqueado / Ação Trabalhista</option>
                            </select>
                        )}
                    </div>

                    {canViewFinancial && (
                        <div>
                            <label className={LABEL_CLASS}>Custo / Valor Cobrado (R$)</label>
                            <div className="relative">
                                <input 
                                    type="number" step="0.01" 
                                    className={`${INPUT_CLASS} text-red-700 font-bold`}
                                    value={formData.cost_value} 
                                    onChange={e => setFormData({...formData, cost_value: e.target.value})}
                                    placeholder="0.00"
                                />
                                <DollarSign size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 pointer-events-none" />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">* Visível apenas para Diretoria/Adm</p>
                        </div>
                    )}
                </div>

                <div className="flex gap-4 pt-2">
                    <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${formData.is_armed ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                        <input 
                            type="checkbox" 
                            className="hidden"
                            checked={formData.is_armed}
                            onChange={e => setFormData({...formData, is_armed: e.target.checked})}
                        />
                        <Shield size={18} /> Agente Armado
                    </label>

                    <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${formData.is_24h ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                        <input 
                            type="checkbox" 
                            className="hidden"
                            checked={formData.is_24h}
                            onChange={e => setFormData({...formData, is_24h: e.target.checked})}
                        />
                        Atende 24h
                    </label>
                </div>

            </form>

            <div className="p-6 border-t border-gray-100 flex justify-between gap-3 bg-gray-50 rounded-b-2xl">
                {initialData ? (
                    <button 
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="px-4 py-2.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                        {isDeleting ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16} />}
                        Excluir
                    </button>
                ) : <div></div>}

                <div className="flex gap-3">
                    <button 
                        onClick={onClose}
                        className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={isSaving || !!phoneError}
                        className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {initialData ? 'Salvar Alterações' : 'Cadastrar Agente'}
                    </button>
                </div>
            </div>
        </div>
    </div>

    {showDirectoriaAuth && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]" onClick={() => { setShowDirectoriaAuth(false); setDirectoriaPassword(''); }}>
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-[420px] max-w-[95vw]" onClick={e => e.stopPropagation()}>
                <div className="animate-blocked-flash-3d text-white px-4 py-3 rounded-xl mb-6 text-center">
                    <span className="text-[13px] font-black uppercase drop-shadow-lg">⛔ DESBLOQUEIO POR AÇÃO TRABALHISTA</span>
                </div>
                <p className="text-sm text-gray-700 font-medium mb-4 text-center">
                    Para liberar este agente, confirme a <strong>senha da Diretoria</strong>.
                </p>
                <input 
                    type="password" 
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-center text-lg font-bold tracking-widest focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none mb-4"
                    placeholder="••••••••"
                    value={directoriaPassword}
                    onChange={e => setDirectoriaPassword(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            if (directoriaPassword === 'DIR2025TM') {
                                setFormData({...formData, status: 'Ativo'});
                                setShowDirectoriaAuth(false);
                                setDirectoriaPassword('');
                                alert('✅ Agente desbloqueado com sucesso pela Diretoria.\n\nO status foi alterado para ATIVO. Salve para confirmar.');
                            } else {
                                alert('❌ Senha incorreta. Acesso negado.');
                                setDirectoriaPassword('');
                            }
                        }
                    }}
                    autoFocus
                />
                <div className="flex gap-3">
                    <button type="button" onClick={() => { setShowDirectoriaAuth(false); setDirectoriaPassword(''); }} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
                    <button type="button" onClick={() => {
                        if (directoriaPassword === 'DIR2025TM') {
                            setFormData({...formData, status: 'Ativo'});
                            setShowDirectoriaAuth(false);
                            setDirectoriaPassword('');
                            alert('✅ Agente desbloqueado com sucesso pela Diretoria.\n\nO status foi alterado para ATIVO. Salve para confirmar.');
                        } else {
                            alert('❌ Senha incorreta. Acesso negado.');
                            setDirectoriaPassword('');
                        }
                    }} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-black uppercase shadow-lg transition-all">Confirmar</button>
                </div>
            </div>
        </div>
    )}
  </>);
};

export default SupportAgentFormModal;
