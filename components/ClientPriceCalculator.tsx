
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MapPin, Flag, Calculator, Loader2, DollarSign, Info, Navigation, Ruler, Save, Clock, Printer, AlertTriangle, FileDown, RefreshCw, Plus, CheckCircle2, Zap, TrendingUp, RotateCcw } from 'lucide-react';
import { ClientPriceTable, Quote } from '../types';
import { useLoadScript, Autocomplete, GoogleMap, DirectionsRenderer } from '@react-google-maps/api';
import { googleMapsLoadConfig } from '../lib/maps';
import { extractUF, UF_TO_REGION, extractCityFromAddress } from '../lib/financialUtils';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import QuotePrintModal from './QuotePrintModal';

declare const google: any;

const LABEL_CLASS = "text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-[0.3em]";

interface Props {
    clientName: string;
    clientId: string;
    priceTables: ClientPriceTable[];
}

const mapContainerStyle = {
    width: '100%',
    height: '100%',
    minHeight: '400px',
    borderRadius: '1.5rem'
};

const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Helper para formatar input enquanto digita
const formatCurrencyInput = (value: string) => {
    let v = value.replace(/\D/g, '');
    v = (parseInt(v) / 100).toFixed(2) + '';
    v = v.replace(".", ",");
    v = v.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    return v === 'NaN' ? '' : `R$ ${v}`;
};

// Helper para limpar input para número
const parseCurrencyInput = (value: string) => {
    if (!value) return 0;
    return parseFloat(value.replace(/[^0-9,-]+/g, "").replace(",", "."));
};

const ClientPriceCalculator: React.FC<Props> = ({ clientName, clientId, priceTables }) => {
    const { showNotification } = useNotification();
    
    const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);

    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [distance, setDistance] = useState(0);
    const [durationHours, setDurationHours] = useState(0);
    const [validityDays, setValidityDays] = useState('5');
    const [isCalculating, setIsCalculating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingToTable, setIsSavingToTable] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    
    const [calculation, setCalculation] = useState<any>(null);
    
    // Inputs manuais formatados
    const [manualKmRate, setManualKmRate] = useState<string>('');
    const [manualHourRate, setManualHourRate] = useState<string>('');
    
    const [directionsResponse, setDirectionsResponse] = useState<any>(null);

    const originAutocompleteRef = useRef<any>(null);
    const destAutocompleteRef = useRef<any>(null);

    const currentTotal = useMemo(() => {
        if (!calculation) return 0;
        
        const kmRate = manualKmRate ? parseCurrencyInput(manualKmRate) : calculation.pricePerExtraKm;
        const franchiseKm = calculation.franchiseKm || 0;
        const basePrice = calculation.base || 0;

        // CÁLCULO CORRIGIDO: Base + (KM Excedente * Valor KM Extra)
        const excessKm = Math.max(0, distance - franchiseKm);
        
        return basePrice + (excessKm * kmRate);
    }, [calculation, manualKmRate, distance]);

    const calculateRoute = async (originAddr?: string, destAddr?: string) => {
        const start = originAddr || origin;
        const end = destAddr || destination;

        if (!start || !end || !isLoaded) return;
        
        setIsCalculating(true);
        try {
            const directionsService = new google.maps.DirectionsService();
            const result = await directionsService.route({
                origin: start,
                destination: end,
                travelMode: google.maps.TravelMode.DRIVING,
            });

            if (result.status === 'OK') {
                setDirectionsResponse(result);
                const route = result.routes[0].legs[0];
                const km = route.distance.value / 1000;
                const hours = route.duration.value / 3600;
                
                setDistance(km);
                setDurationHours(hours);

                // --- LÓGICA DE CÁLCULO DE HORAS (KM / 40) ---
                // Pega o KM total, divide por 40 e pega o número real (floor)
                // Ex: 12:30 (12.5) -> 12h
                const calculatedFranchiseHours = Math.floor(km / 40);
                const suggestedHours = Math.max(1, calculatedFranchiseHours); // Garante pelo menos 1h

                const startUf = extractUF(start);
                const destUf = extractUF(end);
                const region = UF_TO_REGION[startUf] || 'NÍVEL BRASIL';

                // Extração inteligente de cidades
                const originCity = extractCityFromAddress(start).toUpperCase();
                const destCity = extractCityFromAddress(end).toUpperCase();

                // LÓGICA DE BUSCA INTELIGENTE DE TABELA (REGIONAL)
                // Pontua as tabelas baseado na coincidência de termos (UF, Região, Cidades)
                const scoredTables = priceTables.map(t => {
                    let score = 0;
                    const opName = t.operation_type.toUpperCase();
                    
                    // Match Exato de Rota (Ex: SP X RJ)
                    if ((opName.includes(startUf) && opName.includes(destUf)) || (opName.includes(originCity) && opName.includes(destCity))) {
                        score += 10;
                    }
                    // Match de Região (Ex: SUDESTE)
                    if (opName.includes(region) || opName.includes(startUf)) {
                        score += 5;
                    }
                    // Penalidade leve se a franquia for muito menor que a distância (tabela errada)
                    if (t.franchise_km < km * 0.5) score -= 2;

                    return { table: t, score };
                }).sort((a, b) => {
                    // Ordena por Score (maior primeiro) e depois por Franquia (mais próxima da distância)
                    if (a.score !== b.score) return b.score - a.score;
                    return a.table.franchise_km - b.table.franchise_km;
                });

                // Tenta pegar a melhor tabela pontuada que cubra a distância ou a maior disponível
                let bestMatch = scoredTables.find(s => s.table.franchise_km >= km && s.score > 0);
                
                // Se não achou match perfeito, pega a com maior score independente da franquia (ajuste de extra)
                if (!bestMatch) bestMatch = scoredTables[0];
                
                // Fallback para lógica antiga se nenhum score for relevante
                if (!bestMatch || bestMatch.score <= 0) {
                     const sorted = [...priceTables].sort((a, b) => a.franchise_km - b.franchise_km);
                     const fallback = sorted.find(t => t.franchise_km >= km) || sorted[sorted.length - 1];
                     if (fallback) bestMatch = { table: fallback, score: 0 };
                }

                if (bestMatch && bestMatch.table) {
                    const table = bestMatch.table;
                    
                    // NOME SUGERIDO: (REGIÃO) - ORIGEM X DESTINO
                    const suggestedName = `${region} - ${originCity} X ${destCity}`.toUpperCase();

                    setCalculation({
                        base: table.activation_fee,
                        franchiseKm: table.franchise_km,
                        tableName: table.operation_type, // Nome original da tabela encontrada
                        suggestedName: suggestedName, // Nome sugerido para nova rota (FORMATO NOVO)
                        franchiseHours: suggestedHours, // Usa o cálculo KM/40
                        pricePerExtraKm: table.price_per_extra_km,
                        pricePerExtraHour: table.price_per_extra_hour
                    });
                    
                    // Preenche os inputs editáveis
                    setManualKmRate(formatCurrencyInput(table.price_per_extra_km.toFixed(2)));
                    setManualHourRate(formatCurrencyInput(table.price_per_extra_hour.toFixed(2)));
                    
                    if (bestMatch.score > 5) {
                        showNotification('Inteligência Comercial', `Tabela regional identificada: ${table.operation_type}`, 'success');
                    }
                } else {
                    showNotification('Aviso', 'Nenhuma tabela compatível encontrada. Usando valores zerados.', 'warning');
                    
                    const suggestedName = `${region} - ${originCity} X ${destCity}`.toUpperCase();

                    setCalculation({
                        base: 0, 
                        franchiseKm: Math.ceil(km), 
                        tableName: 'PERSONALIZADO', 
                        suggestedName: suggestedName,
                        franchiseHours: suggestedHours, 
                        pricePerExtraKm: 0, 
                        pricePerExtraHour: 0
                    });
                }
            }
        } catch (error) {
            console.error("Erro Google Maps Service:", error);
            showNotification('Erro de Mapa', 'Não foi possível traçar a rota.', 'error');
        } finally {
            setIsCalculating(false);
        }
    };

    const handlePlaceSelect = (type: 'origin' | 'destination') => {
        const autocomplete = type === 'origin' ? originAutocompleteRef.current : destAutocompleteRef.current;
        const place = autocomplete?.getPlace();
        
        if (place && place.formatted_address) {
            const addr = place.formatted_address;
            if (type === 'origin') {
                setOrigin(addr);
                if (destination) calculateRoute(addr, destination);
            } else {
                setDestination(addr);
                if (origin) calculateRoute(origin, addr);
            }
        }
    };

    const handleSaveQuotation = async () => {
        if (!calculation) return;
        setIsSaving(true);
        try {
            const user = JSON.parse(localStorage.getItem('userData') || '{}');
            const kmRate = parseCurrencyInput(manualKmRate);
            const hrRate = parseCurrencyInput(manualHourRate);
            
            const { error } = await supabase.from('quotes').insert([{
                client_id: parseInt(clientId),
                client_name: clientName,
                origin: origin,
                destination: destination,
                total_km: parseFloat(distance.toFixed(1)),
                total_hours: calculation.franchiseHours,
                total_value: currentTotal,
                status: 'Rascunho',
                created_by: user.name || 'SISTEMA',
                contract_details: `Simulação Comercial.\nValidade: ${validityDays} dias.\nBase Contratual: ${calculation.suggestedName || calculation.tableName}\nKM Extra Aplicado: ${formatCurrency(kmRate)}\nHora Extra Aplicada: ${formatCurrency(hrRate)}`
            }]);
            if (error) throw error;
            showNotification('Sucesso', 'Cotação arquivada!', 'success');
        } catch (error) {
            showNotification('Erro', 'Falha ao salvar.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddToPriceTable = async () => {
        if (!calculation || !origin || !destination) return;
        
        const kmRate = parseCurrencyInput(manualKmRate);
        const hrRate = parseCurrencyInput(manualHourRate);

        // GARANTIR O FORMATO: REGIAO - ORIGEM X DESTINO
        const startUf = extractUF(origin);
        const region = UF_TO_REGION[startUf] || 'NÍVEL BRASIL';
        const originCity = extractCityFromAddress(origin).toUpperCase();
        const destCity = extractCityFromAddress(destination).toUpperCase();
        const finalName = `${region} - ${originCity} X ${destCity}`.toUpperCase();

        const confirmMsg = `Deseja incluir esta rota fixa na tabela de preços do cliente?\n\nNome: ${finalName}\nValor Base: R$ ${currentTotal.toFixed(2)}\nFranquia: ${calculation.franchiseHours} Horas (KM/40)\nKM Extra: ${formatCurrency(kmRate)}\nHora Extra: ${formatCurrency(hrRate)}`;
        if (!confirm(confirmMsg)) return;

        setIsSavingToTable(true);
        try {
            const payload = {
                client: clientName,
                operation_type: finalName,
                activation_fee: currentTotal,
                franchise_hours: calculation.franchiseHours,
                franchise_km: parseFloat(distance.toFixed(1)),
                price_per_extra_km: kmRate,
                price_per_extra_hour: hrRate
            };

            const { error } = await supabase.from('client_price_tables').insert([payload]);
            if (error) throw error;

            showNotification('Tabela Atualizada', 'Rota fixa adicionada ao tarifário.', 'success');
        } catch (error: any) {
            alert("Erro: " + error.message);
        } finally {
            setIsSavingToTable(false);
        }
    };

    const handleManualRateChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
        // Remove caracteres não numéricos para formatar
        const rawValue = value.replace(/\D/g, '');
        if (rawValue === '') {
            setter('');
            return;
        }
        // Formata como moeda
        const formatted = formatCurrencyInput(rawValue);
        setter(formatted);
    };

    return (
        <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-3xl border border-slate-800 relative overflow-hidden group mb-8">
            <div className="absolute top-0 right-0 p-8 opacity-5"><Calculator size={200} strokeWidth={0.5} /></div>
            
            {showPrintModal && calculation && (
                <QuotePrintModal 
                    quote={{
                        id: 'SIMULAÇÃO', client_id: parseInt(clientId), client_name: clientName,
                        origin, destination, total_km: distance, total_hours: calculation.franchiseHours,
                        total_value: currentTotal, status: 'Rascunho', created_at: '', created_by: '',
                        contract_details: `Simulação de KM: ${manualKmRate}\nSimulação Hora Extra: ${manualHourRate}\nValidade da Proposta: ${validityDays} dias.`
                    }} 
                    onClose={() => setShowPrintModal(false)} 
                />
            )}

            <div className="relative z-10">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-600 rounded-2xl shadow-xl shadow-red-900/40">
                            <Calculator size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tighter">Simulador Estratégico de Rotas</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em] mt-1">Cálculo Dinâmico e Projeção de Faturamento</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {calculation && (
                            <>
                                <button onClick={handleAddToPriceTable} disabled={isSavingToTable} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase flex items-center gap-2 hover:bg-emerald-700 shadow-lg transition-all active:scale-95">
                                    {isSavingToTable ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Adicionar à Tabela
                                </button>
                                <button onClick={handleSaveQuotation} disabled={isSaving} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase flex items-center gap-2 hover:bg-indigo-700 shadow-lg transition-all active:scale-95">
                                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar Cotação
                                </button>
                                <button onClick={() => setShowPrintModal(true)} className="bg-white text-slate-900 px-6 py-3 rounded-2xl text-xs font-black uppercase flex items-center gap-2 hover:bg-slate-100 transition-all shadow-xl active:scale-95">
                                    <FileDown size={18} /> Exportar Proposta
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-4 space-y-6">
                        <div className="space-y-4">
                            <div className="relative">
                                <label className={LABEL_CLASS}>Saída (Origem)</label>
                                {isLoaded ? (
                                    <Autocomplete onLoad={ref => originAutocompleteRef.current = ref} onPlaceChanged={() => handlePlaceSelect('origin')}>
                                        <input type="text" className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-4 text-sm outline-none focus:ring-2 focus:ring-red-500/40 transition-all pl-12 text-white font-bold" placeholder="Digite o local de saída..." value={origin} onChange={e => setOrigin(e.target.value)} />
                                    </Autocomplete>
                                ) : <div className="h-14 bg-slate-800 rounded-2xl animate-pulse"></div>}
                                <MapPin size={20} className="absolute left-4 top-11 text-blue-500" />
                            </div>

                            <div className="relative">
                                <label className={LABEL_CLASS}>Chegada (Destino)</label>
                                {isLoaded ? (
                                    <Autocomplete onLoad={ref => destAutocompleteRef.current = ref} onPlaceChanged={() => handlePlaceSelect('destination')}>
                                        <input type="text" className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-4 text-sm outline-none focus:ring-2 focus:ring-red-500/40 transition-all pl-12 text-white font-bold" placeholder="Digite o destino final..." value={destination} onChange={e => setDestination(e.target.value)} />
                                    </Autocomplete>
                                ) : <div className="h-14 bg-slate-800 rounded-2xl animate-pulse"></div>}
                                <Flag size={20} className="absolute left-4 top-11 text-red-500" />
                            </div>
                        </div>

                        {calculation && (
                            <div className="bg-slate-950/60 rounded-3xl p-6 border border-slate-800 animate-in slide-in-from-bottom-4 space-y-6 shadow-2xl">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Distância Real</p>
                                        <p className="text-base font-black text-white font-mono">{distance.toFixed(1)} KM</p>
                                    </div>
                                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Franquia Horas</p>
                                        <p className="text-base font-black text-white font-mono">{calculation.franchiseHours} H</p>
                                        <p className="text-[7px] text-slate-600 mt-1 uppercase">Cálculo: KM / 40</p>
                                    </div>
                                </div>

                                {/* EDITÁVEIS - VALOR KM E HORA */}
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="p-4 bg-indigo-600/10 border border-indigo-500/30 rounded-2xl">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                                <TrendingUp size={14} className="text-emerald-400" />
                                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Valor do KM Extra (Editável)</span>
                                            </div>
                                            <button 
                                                onClick={() => setManualKmRate(formatCurrencyInput(calculation.pricePerExtraKm.toFixed(2)))}
                                                className="text-[9px] font-black text-indigo-400 hover:text-indigo-300 flex items-center gap-1 uppercase"
                                                title="Resetar para o valor do contrato"
                                            >
                                                <RotateCcw size={10} /> Reset
                                            </button>
                                        </div>
                                        <input 
                                            type="text" 
                                            className="w-full bg-slate-900 border border-emerald-500/50 rounded-xl py-2 px-3 text-lg font-black text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-mono"
                                            value={manualKmRate}
                                            onChange={e => handleManualRateChange(setManualKmRate, e.target.value)}
                                            placeholder="R$ 0,00"
                                        />
                                    </div>

                                    <div className="p-4 bg-blue-600/10 border border-blue-500/30 rounded-2xl">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                                <Clock size={14} className="text-blue-400" />
                                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Valor Hora Extra (Editável)</span>
                                            </div>
                                            <button 
                                                onClick={() => setManualHourRate(formatCurrencyInput(calculation.pricePerExtraHour.toFixed(2)))}
                                                className="text-[9px] font-black text-blue-400 hover:text-blue-300 flex items-center gap-1 uppercase"
                                                title="Resetar para o valor do contrato"
                                            >
                                                <RotateCcw size={10} /> Reset
                                            </button>
                                        </div>
                                        <input 
                                            type="text" 
                                            className="w-full bg-slate-900 border border-blue-500/50 rounded-xl py-2 px-3 text-lg font-black text-blue-400 outline-none focus:ring-2 focus:ring-blue-500/40 transition-all font-mono"
                                            value={manualHourRate}
                                            onChange={e => handleManualRateChange(setManualHourRate, e.target.value)}
                                            placeholder="R$ 0,00"
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-800">
                                    <div className="flex justify-between items-baseline mb-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Total Projetado</span>
                                        <span className="text-[8px] font-bold text-slate-600 uppercase">Faturamento Simulado</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-4xl font-black text-green-400 font-mono tracking-tighter">
                                            {formatCurrency(currentTotal)}
                                        </span>
                                        <p className="text-[9px] text-slate-500 font-medium leading-relaxed italic">
                                            * Cálculo: Base {formatCurrency(calculation.base)} + ({Math.max(0, distance - calculation.franchiseKm).toFixed(1)} KM Excedente x {formatCurrency(manualKmRate ? parseCurrencyInput(manualKmRate) : calculation.pricePerExtraKm)})
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {!calculation && origin && destination && (
                             <div className="p-6 bg-indigo-950/20 border border-indigo-500/30 rounded-3xl flex flex-col items-center text-center gap-3 animate-pulse">
                                 <RefreshCw size={32} className="text-indigo-400 animate-spin duration-[3000ms]" />
                                 <p className="text-xs text-indigo-100 font-black uppercase tracking-widest">Processando Rota e Tarifas...</p>
                                 <button onClick={() => calculateRoute()} className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase">Forçar Recálculo</button>
                             </div>
                        )}
                    </div>

                    <div className="lg:col-span-8 bg-slate-950/60 rounded-[32px] border border-slate-800 p-2 shadow-inner min-h-[500px] relative">
                        {!isLoaded ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-700">
                                <Loader2 size={40} className="animate-spin" />
                            </div>
                        ) : !directionsResponse ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-700 text-center p-8 opacity-40">
                                <div className="p-10 bg-slate-900 rounded-full border border-slate-800 mb-6">
                                    <Navigation size={80} strokeWidth={1} />
                                </div>
                                <h4 className="text-lg font-black uppercase tracking-widest text-slate-500">Mapeamento de Trajeto</h4>
                                <p className="text-xs uppercase font-bold mt-2">Defina os pontos de controle para visualização cartográfica</p>
                            </div>
                        ) : (
                            <GoogleMap
                                mapContainerStyle={mapContainerStyle}
                                center={{ lat: -23.55, lng: -46.63 }}
                                zoom={10}
                                options={{
                                    disableDefaultUI: true,
                                    zoomControl: true,
                                    styles: [
                                        { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
                                        { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
                                        { featureType: "water", elementType: "geometry", stylers: [{ color: "#000" }] },
                                        { featureType: "poi", stylers: [{ visibility: "off" }] }
                                    ]
                                }}
                            >
                                <DirectionsRenderer 
                                    directions={directionsResponse}
                                    options={{
                                        polylineOptions: { strokeColor: "#dc2626", strokeWeight: 5, strokeOpacity: 0.8 },
                                    }}
                                />
                            </GoogleMap>
                        )}
                        
                        {calculation && (
                            <div className="absolute top-6 left-6 z-20">
                                <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 p-4 rounded-2xl shadow-2xl min-w-[200px]">
                                    <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Tabela Referência</h5>
                                    <p className="text-xs font-black text-indigo-400 uppercase mb-3 leading-tight">{calculation.tableName}</p>
                                    
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-700/50 pt-3">
                                        <div>
                                            <p className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">KM Extra</p>
                                            <p className="text-xs font-black text-white font-mono">{formatCurrency(calculation.pricePerExtraKm)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">Hora Extra</p>
                                            <p className="text-xs font-black text-white font-mono">{formatCurrency(calculation.pricePerExtraHour)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientPriceCalculator;
