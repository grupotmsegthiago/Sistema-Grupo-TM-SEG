import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';
import { googleMapsApiKey, libraries, googleMapsLoadConfig } from '../lib/maps';
import { ShieldCheck, User, Phone, MapPin, Loader2, CheckCircle2, Navigation, Lock, AlertTriangle, FileCheck, Map, Globe, Plus, X, Wallet, Banknote } from 'lucide-react';

const PublicAgentRegistration: React.FC = () => {
  const { isLoaded } = useLoadScript(googleMapsLoadConfig);

  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    phone: '',
    base_address: '',
    latitude: 0,
    longitude: 0,
    is_armed: false,
    is_24h: false,
    service_cities: '',
    pix_key: '',
    pix_type: 'CPF/CNPJ'
  });

  // Estado para gerenciar as cidades visualmente antes de salvar
  const [cityInput, setCityInput] = useState('');
  const [citiesList, setCitiesList] = useState<string[]>([]);
  
  // Estado para validar se a cidade veio do Google Maps
  const [tempCitySelection, setTempCitySelection] = useState<string | null>(null);

  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [blocked, setBlocked] = useState(false);
  
  // Validação de Telefone
  const [phoneError, setPhoneError] = useState('');
  const [checkingPhone, setCheckingPhone] = useState(false);

  const addressRef = useRef<any>(null);
  const cityRef = useRef<any>(null);

  // Verificação de Limite Diário (1 por dia por navegador)
  useEffect(() => {
      const lastRegDate = localStorage.getItem('tmseg_last_reg_date');
      const today = new Date().toDateString();

      if (lastRegDate === today) {
          setBlocked(true);
      }
  }, []);

  // Sincroniza a lista de cidades com o formData sempre que ela mudar
  useEffect(() => {
      setFormData(prev => ({
          ...prev,
          service_cities: citiesList.join(', ')
      }));
  }, [citiesList]);

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
          const finalName = cityName.toUpperCase();

          setCityInput(finalName); // Mostra o nome bonito no input
          setTempCitySelection(finalName); // Guarda para validação
      }
  };

  // MÁSCARA DE TELEFONE E VALIDAÇÃO
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value.replace(/\D/g, ""); // Remove tudo que não é dígito
      
      // Limita a 11 dígitos
      if (value.length > 11) value = value.slice(0, 11);

      // Aplica Máscara (XX) XXXXX-XXXX
      if (value.length > 10) {
          value = value.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
      } else if (value.length > 5) {
          value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
      } else if (value.length > 2) {
          value = value.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
      } else if (value.length > 0) {
          value = value.replace(/^(\d*)/, "($1");
      }

      setFormData({ ...formData, phone: value });
      if (phoneError) setPhoneError('');
  };

  const checkPhoneDuplicate = async () => {
      // Extrai apenas os números para comparação
      const rawPhone = formData.phone.replace(/\D/g, '');
      
      // Só verifica se tiver comprimento mínimo válido (10 ou 11 dígitos)
      if (rawPhone.length < 10 || rawPhone.length > 11) {
          setPhoneError('Número incompleto ou inválido.');
          return;
      }

      setCheckingPhone(true);
      setPhoneError('');

      try {
          // Busca ampla pelos últimos 8 dígitos para evitar problemas de formatação no banco
          const last8 = rawPhone.slice(-8);
          
          const { data: candidates } = await supabase
              .from('support_agents')
              .select('name, phone')
              .ilike('phone', `%${last8}%`); // Busca que contenha o final do número

          if (candidates && candidates.length > 0) {
              // Verificação ESTRITA no Javascript
              // Compara os dígitos do input com os dígitos do banco
              const exists = candidates.some(agent => {
                  const dbRaw = (agent.phone || '').replace(/\D/g, '');
                  return dbRaw === rawPhone;
              });

              if (exists) {
                  setPhoneError(`Número já cadastrado no sistema.`);
              }
          }
      } catch (e) {
          console.error('Erro verificação telefone', e);
      } finally {
          setCheckingPhone(false);
      }
  };

  const handleAddCity = (e?: React.MouseEvent) => {
      e?.preventDefault();
      if (!cityInput.trim()) return;
      
      // Validação Rígida: Só aceita se tiver vindo do Google Maps
      if (!tempCitySelection || tempCitySelection !== cityInput.toUpperCase()) {
          alert("ERRO DE VALIDAÇÃO: Cidade inválida.\n\nPor favor, digite o nome da cidade e CLIQUE na opção que aparece na lista do Google Maps para validar a localização.");
          setCityInput('');
          setTempCitySelection(null);
          return;
      }
      
      const city = cityInput.trim().toUpperCase();
      if (!citiesList.includes(city)) {
          setCitiesList([...citiesList, city]);
      }
      setCityInput('');
      setTempCitySelection(null);
  };

  const handleRemoveCity = (cityToRemove: string) => {
      setCitiesList(citiesList.filter(c => c !== cityToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (blocked) {
          alert("Por questões de segurança, permitimos apenas um cadastro por dia neste dispositivo.");
          return;
      }

      if (phoneError) {
          alert("Corrija o erro no campo de telefone antes de enviar.");
          return;
      }

      if (!lgpdConsent) {
          alert("É necessário aceitar os termos da LGPD para prosseguir.");
          return;
      }

      if (!formData.latitude || !formData.longitude || formData.latitude === 0 || formData.longitude === 0) {
          alert("ERRO DE LOCALIZAÇÃO: Por favor, selecione seu 'Endereço Base' clicando na lista do Google Maps. Precisamos das coordenadas GPS exatas.");
          return;
      }

      const cleanPhone = formData.phone.replace(/\D/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 11) {
          alert("Por favor, insira um número de telefone válido (Com DDD). Ex: (11) 99999-9999");
          return;
      }

      if (citiesList.length === 0) {
          alert("Por favor, adicione pelo menos uma cidade de atendimento usando a busca do Google Maps.");
          return;
      }

      setIsSaving(true);

      try {
          // 2. Inserir Registro com Status PENDENTE
          const payload: any = {
              name: formData.name.toUpperCase(),
              cpf: formData.cpf,
              phone: formData.phone, // Salva formatado ou limpo, conforme preferência. O verificador trata ambos.
              base_address: formData.base_address,
              latitude: formData.latitude,
              longitude: formData.longitude,
              is_armed: formData.is_armed,
              is_24h: formData.is_24h,
              service_cities: formData.service_cities.toUpperCase(),
              status: 'Pendente' // IMPORTANTE: Entra como pendente
          };

          if (formData.pix_key) {
              payload.pix_key = `${formData.pix_type}: ${formData.pix_key}`;
          }

          const { error } = await supabase.from('support_agents').insert([payload]);

          if (error) {
              if (error.message.includes('duplicate key') || error.code === '23505') {
                  alert("Este número de celular já está cadastrado.");
                  setPhoneError("Telefone duplicado.");
                  return;
              }
              // Se o erro for de coluna inexistente, tenta salvar sem o PIX
              if (error.message.includes('pix_key')) {
                  delete payload.pix_key;
                  const { error: retryError } = await supabase.from('support_agents').insert([payload]);
                  if (retryError) throw retryError;
              } else {
                  throw error;
              }
          }

          // 3. Bloquear novas tentativas hoje
          localStorage.setItem('tmseg_last_reg_date', new Date().toDateString());
          
          setSuccess(true);

      } catch (err: any) {
          console.error(err);
          alert('Erro ao realizar cadastro: ' + err.message);
      } finally {
          setIsSaving(false);
      }
  };

  if (!isLoaded) return <div className="h-screen flex items-center justify-center text-gray-500 bg-gray-50"><Loader2 className="animate-spin mr-2"/> Carregando sistema...</div>;

  if (success) {
      return (
          <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-200 flex items-center justify-center p-4">
              <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-md w-full text-center border border-gray-100 animate-fade-in relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-green-600"></div>
                  
                  <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                      <CheckCircle2 size={48} className="text-green-600" />
                  </div>
                  
                  <h1 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Solicitação Enviada!</h1>
                  <p className="text-gray-500 mb-8 text-sm leading-relaxed px-4">
                      Seus dados foram recebidos com segurança.
                      <br/>
                      <span className="font-bold text-gray-800">Seu cadastro está em análise.</span>
                      <br/>
                      Assim que aprovado por nossa equipe operacional, você será notificado e integrado à rede de apoio.
                  </p>
                  
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-500 mb-6 flex flex-col gap-2">
                      <div className="flex justify-between border-b border-gray-200 pb-2">
                          <span>Status Atual:</span>
                          <span className="font-bold text-orange-600 flex items-center gap-1"><Loader2 size={10} className="animate-spin"/> PENDENTE DE APROVAÇÃO</span>
                      </div>
                      <div className="flex justify-between pt-1">
                          <span>Protocolo:</span>
                          <span className="font-mono text-gray-800">REQ-{Date.now().toString().slice(-6)}</span>
                      </div>
                  </div>

                  <button onClick={() => window.location.reload()} className="text-gray-400 hover:text-gray-600 text-xs font-medium transition-colors">
                      Voltar à tela inicial
                  </button>
              </div>
          </div>
      );
  }

  if (blocked) {
      return (
          <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
              <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center border-t-4 border-orange-500">
                  <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle size={32} className="text-orange-600" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Solicitação Já Enviada</h2>
                  <p className="text-gray-600 text-sm">
                      Identificamos um cadastro recente realizado através deste dispositivo hoje. 
                      Por segurança, aguarde a análise do envio anterior.
                  </p>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans">
        
        {/* Banner Superior */}
        <div className="bg-black text-white pb-24 pt-12 px-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-red-900/40 to-transparent pointer-events-none"></div>
            <div className="absolute top-0 right-0 p-10 opacity-10">
                <Globe size={200} />
            </div>

            <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8 relative z-10">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/10">
                            <ShieldCheck size={28} className="text-red-500" />
                        </div>
                        <span className="font-black text-2xl tracking-[0.2em]">GRUPO TMSEG</span>
                    </div>
                    <h1 className="text-4xl font-bold mb-3 tracking-tight">Rede de Apoio Operacional</h1>
                    <p className="text-gray-400 text-sm max-w-lg leading-relaxed">
                        Faça parte da nossa força de pronta resposta (QRF). 
                        Conectamos agentes qualificados a operações de risco em todo o Brasil.
                    </p>
                </div>
                <div className="hidden md:block">
                    <div className="flex items-center gap-3 bg-white/5 px-5 py-3 rounded-full backdrop-blur-md border border-white/10">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-bold tracking-wide text-gray-300">CADASTRO OFICIAL</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Form Container (Sobreposto) */}
        <div className="flex-1 px-4 pb-12 -mt-16 relative z-20">
            <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col md:flex-row">
                
                {/* Lado Esquerdo (Info Visual) */}
                <div className="hidden md:flex md:w-1/3 bg-gray-50 p-10 flex-col justify-between border-r border-gray-100">
                    <div className="space-y-8">
                        <h3 className="font-bold text-gray-900 uppercase text-xs tracking-widest border-b border-gray-200 pb-4">Benefícios da Rede</h3>
                        
                        <div className="flex gap-4 group">
                            <div className="p-3 bg-white border border-gray-200 text-red-600 rounded-xl h-fit shadow-sm group-hover:scale-110 transition-transform"><Navigation size={20} /></div>
                            <div>
                                <h4 className="font-bold text-sm text-gray-900">Geolocalização</h4>
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed">Acionamos o agente mais próximo da ocorrência via sistema inteligente.</p>
                            </div>
                        </div>

                        <div className="flex gap-4 group">
                            <div className="p-3 bg-white border border-gray-200 text-blue-600 rounded-xl h-fit shadow-sm group-hover:scale-110 transition-transform"><ShieldCheck size={20} /></div>
                            <div>
                                <h4 className="font-bold text-sm text-gray-900">Oportunidades</h4>
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed">Acesso a missões de escolta, pronta resposta e vigilância patrimonial.</p>
                            </div>
                        </div>

                        <div className="flex gap-4 group">
                            <div className="p-3 bg-white border border-gray-200 text-green-600 rounded-xl h-fit shadow-sm group-hover:scale-110 transition-transform"><Map size={20} /></div>
                            <div>
                                <h4 className="font-bold text-sm text-gray-900">Nacional</h4>
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed">Atuação em todo território nacional com suporte da nossa central.</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-[10px] text-gray-400 text-center mt-10 border-t border-gray-200 pt-4">
                        &copy; {new Date().getFullYear()} Grupo TMSEG - Security Intelligence
                    </div>
                </div>

                {/* Lado Direito (Formulário) */}
                <div className="flex-1 p-8 md:p-10">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        
                        <div className="space-y-5">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <div className="w-1 h-6 bg-red-600 rounded-full"></div> Seus Dados
                            </h3>
                            
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 block">Nome Completo</label>
                                <input 
                                    type="text" required 
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-500/10 transition-all outline-none font-medium"
                                    placeholder="Digite seu nome completo"
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 block">CPF (Opcional)</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-500/10 transition-all outline-none font-medium"
                                        placeholder="000.000.000-00"
                                        value={formData.cpf}
                                        onChange={e => setFormData({...formData, cpf: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 block">Celular / WhatsApp <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <input 
                                            type="text" required 
                                            className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-sm focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-500/10 transition-all outline-none font-medium ${phoneError ? 'border-red-500' : 'border-gray-200'}`}
                                            placeholder="(DDD) 90000-0000"
                                            value={formData.phone}
                                            onChange={handlePhoneChange}
                                            onBlur={checkPhoneDuplicate}
                                            maxLength={15}
                                        />
                                        {checkingPhone && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400"/>}
                                    </div>
                                    {phoneError && (
                                        <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1 animate-pulse">
                                            <AlertTriangle size={10} /> {phoneError}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* DADOS BANCÁRIOS (PIX) */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                                <label className="text-xs font-bold text-gray-600 uppercase flex items-center gap-2">
                                    <Banknote size={14} className="text-green-600"/> Dados para Pagamento (PIX)
                                </label>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-1">
                                        <select 
                                            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:border-green-500 outline-none"
                                            value={formData.pix_type}
                                            onChange={e => setFormData({...formData, pix_type: e.target.value})}
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
                                            value={formData.pix_key}
                                            onChange={e => setFormData({...formData, pix_key: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-5 pt-6 border-t border-gray-100">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <div className="w-1 h-6 bg-red-600 rounded-full"></div> Localização & Operacional
                            </h3>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 block">Endereço Base (Onde você fica)</label>
                                <div className="relative">
                                    <Autocomplete onLoad={ref => addressRef.current = ref} onPlaceChanged={handlePlaceSelect}>
                                        <input 
                                            type="text" required 
                                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-500/10 transition-all outline-none font-medium"
                                            placeholder="Digite seu endereço e selecione na lista..."
                                            value={formData.base_address}
                                            onChange={(e) => {
                                                // Reset lat/lng when user types manually to force selection
                                                setFormData(prev => ({
                                                    ...prev, 
                                                    base_address: e.target.value,
                                                    latitude: 0, 
                                                    longitude: 0 
                                                }));
                                            }}
                                        />
                                    </Autocomplete>
                                    <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                </div>
                                {formData.latitude !== 0 && (
                                    <p className="text-[10px] text-green-600 font-bold mt-1.5 ml-1 flex items-center gap-1 animate-fade-in">
                                        <CheckCircle2 size={10} /> Coordenadas GPS confirmadas
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 block">Cidades de Atendimento (Adicione quantas quiser)</label>
                                <div className="flex gap-2 mb-2 relative">
                                    <div className="flex-1 relative">
                                        <Autocomplete onLoad={ref => cityRef.current = ref} onPlaceChanged={handleCitySelect}>
                                            <input 
                                                type="text"
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-500/10 transition-all outline-none font-medium"
                                                placeholder="Digite e selecione a cidade na lista..."
                                                value={cityInput}
                                                onChange={e => {
                                                    setCityInput(e.target.value);
                                                    setTempCitySelection(null); // Invalidar seleção anterior
                                                }}
                                            />
                                        </Autocomplete>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={handleAddCity}
                                        disabled={!tempCitySelection || cityInput.toUpperCase() !== tempCitySelection}
                                        className={`px-4 rounded-xl transition-colors shadow-sm ${(!tempCitySelection || cityInput.toUpperCase() !== tempCitySelection) ? 'bg-gray-300 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-800'}`}
                                        title={!tempCitySelection ? "Selecione uma opção da lista do Google Maps para validar" : "Adicionar Cidade"}
                                    >
                                        <Plus size={24} />
                                    </button>
                                </div>
                                
                                {/* LISTA VISUAL DE CIDADES (TAGS) */}
                                {citiesList.length > 0 ? (
                                    <div className="flex flex-wrap gap-2 animate-fade-in">
                                        {citiesList.map((city, idx) => (
                                            <div key={idx} className="bg-red-50 border border-red-100 text-red-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm">
                                                <MapPin size={10} /> {city}
                                                <button 
                                                    type="button" 
                                                    onClick={() => handleRemoveCity(city)}
                                                    className="text-red-400 hover:text-red-700 ml-1"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-gray-400 italic">Nenhuma cidade adicional. Use a busca do Google acima para incluir áreas de cobertura.</p>
                                )}
                            </div>

                            <div className="flex gap-4 pt-2">
                                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${formData.is_armed ? 'bg-red-50 border-red-500 text-red-700 font-bold' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-300'}`}>
                                    <input 
                                        type="checkbox" 
                                        className="hidden"
                                        checked={formData.is_armed}
                                        onChange={e => setFormData({...formData, is_armed: e.target.checked})}
                                    />
                                    <ShieldCheck size={18} /> Sou Armado
                                </label>

                                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${formData.is_24h ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-300'}`}>
                                    <input 
                                        type="checkbox" 
                                        className="hidden"
                                        checked={formData.is_24h}
                                        onChange={e => setFormData({...formData, is_24h: e.target.checked})}
                                    />
                                    Disponível 24h
                                </label>
                            </div>
                        </div>

                        {/* LGPD SECTION */}
                        <div className="pt-4 border-t border-gray-100">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <div className="relative flex items-center">
                                        <input 
                                            type="checkbox" 
                                            className="w-5 h-5 border-gray-300 rounded text-red-600 focus:ring-red-500 mt-0.5 accent-red-600"
                                            checked={lgpdConsent}
                                            onChange={e => setLgpdConsent(e.target.checked)}
                                        />
                                    </div>
                                    <div className="text-xs text-gray-500 leading-relaxed">
                                        <span className="font-bold text-gray-800 block mb-1 flex items-center gap-1"><FileCheck size={14}/> Termo de Responsabilidade</span>
                                        Declaro que as informações são verdadeiras e autorizo o Grupo TMSEG a armazená-las para fins de cadastro operacional e acionamento em missões, conforme a LGPD. Entendo que o cadastro passará por análise.
                                    </div>
                                </label>
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={isSaving || !lgpdConsent || !!phoneError}
                            className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.01]"
                        >
                            {isSaving ? <Loader2 size={24} className="animate-spin" /> : 'ENVIAR CADASTRO PARA ANÁLISE'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>
  );
};

export default PublicAgentRegistration;