
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Mission, MissionStatus, ProviderData, Agent, Vehicle, User as UserType, ClientPriceTable, ClientVehicleDB } from '../types';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { useNotification } from '../lib/NotificationContext';
import { 
  X, Activity, MapPin, Flag, Truck, Plus, Save, 
  Layers, Navigation, History, 
  Calculator, Clock, Trash2, UserCheck, CarFront, DollarSign, AlertCircle, Info, ShieldAlert,
  Loader2, Search, ChevronDown, UserPlus, Package, ShieldCheck, Check, BadgeCheck, Sparkles,
  Milestone, Timer, Calendar, Globe, Briefcase, Zap, TrendingUp, RefreshCw, User, Phone, CheckCircle2
} from 'lucide-react';
import { useLoadScript, Autocomplete, GoogleMap, Marker } from '@react-google-maps/api';
import { googleMapsApiKey, libraries, googleMapsLoadConfig } from '../lib/maps';
import { extractCoordinates, calculateDistance } from '../lib/utils';

// Importação dos formulários para modo modal/cadastro rápido
import ProviderForm from './ProviderForm';
import VehicleForm from './VehicleForm';
import ProviderAgentForm from './ProviderAgentForm';
import ClientVehicleForm from './ClientVehicleForm';
import ClientVehicleList from './ClientVehicleList';

declare const google: any;

const parseNumber = (value: string | number | undefined | null): number => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    let str = String(value).trim().replace(',', '.');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

const LABEL_CLASS = "text-[9px] font-black text-gray-400 uppercase mb-1 block tracking-widest";
const INPUT_CLASS = "w-full p-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all uppercase";
const DROPDOWN_ITEM_CLASS = "w-full flex items-center justify-between p-3 text-[11px] font-bold hover:bg-red-50 border-b border-gray-50 uppercase text-gray-700 transition-colors text-left";

interface UpdateMissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    mission: Mission | null;
    currentUser: UserType | null;
    onSuccess: (reportText?: string) => void;
}

const UpdateMissionModal: React.FC<UpdateMissionModalProps> = ({ isOpen, onClose, mission, currentUser, onSuccess }) => {
    const { isLoaded } = useLoadScript(googleMapsLoadConfig);
    const { showNotification } = useNotification();
    
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    
    // Controle de Relógio em Tempo Real
    const [isEndTimeLocked, setIsEndTimeLocked] = useState(false);

    // Permissões Administrativas
    const canEditRoute = useMemo(() => {
        if (!currentUser) return false;
        const role = (currentUser.role || '').toLowerCase();
        return ['diretoria', 'administrador', 'avançado', 'avancado'].includes(role) || (currentUser.permissions && currentUser.permissions.includes('*'));
    }, [currentUser]);

    // Listas de Dados
    const [providersList, setProvidersList] = useState<ProviderData[]>([]);
    const [vehiclesList, setVehiclesList] = useState<Vehicle[]>([]); 
    const [agentsList, setAgentsList] = useState<Agent[]>([]);
    const [clientTables, setClientTables] = useState<ClientPriceTable[]>([]);
    const [clientVehiclesList, setClientVehiclesList] = useState<ClientVehicleDB[]>([]);
    const [dbPastDrivers, setDbPastDrivers] = useState<{name: string, phone: string}[]>([]);
    const [clientId, setClientId] = useState<number | null>(null);

    // Estados de Busca e Filtro
    const [searchProvider, setSearchTerm] = useState('');
    const [searchVehicle, setSearchVehicle] = useState('');
    const [searchAgent1, setSearchAgent1] = useState('');
    const [searchAgent2, setSearchAgent2] = useState('');
    const [searchCargoVehicle, setSearchCargoVehicle] = useState('');
    const [searchDriver, setSearchDriver] = useState('');
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

    // Modais de Cadastro Rápido
    const [quickModal, setQuickModal] = useState<'provider' | 'vehicle' | 'agent' | 'cargo' | 'browse_cargo' | null>(null);

    // Inteligência de Software
    const [iblWarning, setIblWarning] = useState('');

    const [editData, setEditData] = useState({
        provider: '', vehicleId: '', agent1: '', agent2: '',
        startKm: '', startDate: '', startTime: '', 
        endKm: '', endDate: '', endTime: '',
        manualProgress: 0,
        mapLink: '', description: '', status: MissionStatus.SOLICITED,
        origin: '', destination: '',
        missionType: 'Caracterizada',
        revenueValue: '', costValue: '', tollValue: '',
        isSameOs: false, applyCeva200km: false, applyVtc02h: false,
        totalDistance: 0, currentLocationName: '',
        // Dados da Carga
        driver_name: '', driver_phone: '', gr_espelhamento: '',
        client_vehicle_id: '',
        client_vehicle_plate: '', client_vehicle_model: ''
    });

    const [currentPreviewCoords, setCurrentPreviewCoords] = useState<{ lat: number, lng: number } | null>(null);

    const updateLocRef = useRef<any>(null);
    const originAutocompleteRef = useRef<any>(null);
    const destinationAutocompleteRef = useRef<any>(null);
    const dropdownRef = useRef<HTMLFormElement>(null);

    const operationalStatuses = [
        MissionStatus.SOLICITED, MissionStatus.DOCUMENTATION, MissionStatus.SCHEDULED, 
        MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT, MissionStatus.PENDING, MissionStatus.COMPLETED
    ];

    const restrictedStatuses = [MissionStatus.CANCELLED, MissionStatus.REFUSED];

    const isRequirementActive = useMemo(() => {
        return [
            MissionStatus.ORIGIN, 
            MissionStatus.IN_TRANSIT, 
            MissionStatus.COMPLETED, 
            MissionStatus.CANCELLED, 
            MissionStatus.REFUSED
        ].includes(editData.status as MissionStatus);
    }, [editData.status]);

    const isOccurrenceRequired = isRequirementActive;
    const isGoogleLinkRequired = isRequirementActive;

    // Efeito para Relógio em Tempo Real nos campos de Fim de Viagem
    useEffect(() => {
        if (!isOpen || isEndTimeLocked || (mission && [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(mission.status as MissionStatus) && mission.endTime)) return;

        // VERIFICAÇÃO DE AGENDAMENTO FUTURO
        // Se a data de início estiver no futuro, NÃO ativa o relógio de Tempo Real
        if (editData.startDate && editData.startTime) {
            const start = new Date(`${editData.startDate}T${editData.startTime}`);
            const now = new Date();
            // Adiciona margem de 1 minuto
            if (start > new Date(now.getTime() + 60000)) {
                return;
            }
        }

        const interval = setInterval(() => {
            const now = new Date();
            setEditData(prev => ({
                ...prev,
                endDate: now.toLocaleDateString('en-CA'),
                endTime: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            }));
        }, 1000);

        return () => clearInterval(interval);
    }, [isOpen, isEndTimeLocked, mission, editData.startDate, editData.startTime]);

    // Função auxiliar para validar KM (Apenas Ponto)
    const handleKmInput = (field: 'startKm' | 'endKm', value: string) => {
        let val = value.replace(/,/g, '.'); // Força ponto
        if (!/^[0-9]*\.?[0-9]*$/.test(val)) return; // Bloqueia caracteres não numéricos
        setEditData(prev => ({ ...prev, [field]: val }));
    };

    // Inteligência: Monitorar Cliente IBL e Origem Sorocaba
    useEffect(() => {
        const clientName = (mission?.client || '').toUpperCase();
        const originName = (editData.origin || '').toUpperCase();

        if (clientName.includes('IBL') && originName.includes('SOROCABA')) {
            setIblWarning('ALERTA DE PROTOCOLO: OPERAÇÕES IBL EM SOROCABA SÓ PERMITEM OS FORNECEDORES: CTS OU MACOR.');
        } else {
            setIblWarning('');
        }
    }, [mission, editData.origin]);

    // CÁLCULO DE MEDIÇÃO OPERACIONAL SINCRONIZADO
    const missionTotals = useMemo(() => {
        if (!mission) return { km: '0.0', time: '0h 0m', extraHours: 0, plannedKm: 0 };
        const sKm = parseNumber(editData.startKm);
        const eKm = parseNumber(editData.endKm);
        const traveled = eKm > sKm ? (eKm - sKm) : 0;

        // REGRA LOGITECH (CEVA)
        const isLogitech = (mission.client || "").toUpperCase().includes('CEVA') && 
                           ((mission.destination || "").toUpperCase().includes('LOGITECH') || 
                            (mission as any).operation_type?.toUpperCase().includes('LOGITECH'));

        let plannedKm = mission.totalDistance || 0;
        if (editData.applyCeva200km || isLogitech) plannedKm = 200;
        else if (editData.applyVtc02h) plannedKm = 100;

        let totalHours = 0;
        let timeStr = '0h 0m';
        if (editData.startDate && editData.startTime && editData.endDate && editData.endTime) {
            try {
                const start = new Date(`${editData.startDate}T${editData.startTime}`);
                const end = new Date(`${editData.endDate}T${editData.endTime}`);
                const diffMs = end.getTime() - start.getTime();
                if (diffMs > 0) {
                    totalHours = diffMs / (1000 * 60 * 60);
                    const h = Math.floor(totalHours);
                    const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    timeStr = `${h}h ${m}m`;
                }
            } catch (e) {}
        }

        let extraHours = 0;
        const cTables = [...clientTables].sort((a,b) => a.franchise_km - b.franchise_km);
        const currentTable = cTables.find(t => t.franchise_km >= plannedKm) || cTables[cTables.length - 1];
        
        if (currentTable) {
            extraHours = Math.max(0, totalHours - (currentTable.franchise_hours || 0));
        }

        return { km: traveled.toFixed(1), time: timeStr, extraHours, plannedKm };
    }, [editData, clientTables, mission]);

    const loadMissionData = async () => {
        if (!mission) return;
        setIsLoadingData(true);
        try {
            const { data: m } = await supabase.from('missions').select('*').eq('id', mission.id).single();
            const startDT = m.start_time ? {
                date: new Date(m.start_time).toLocaleDateString('en-CA'),
                time: new Date(m.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            } : { 
                date: new Date().toLocaleDateString('en-CA'), 
                time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
            };

            // Lógica de Data Final Inteligente:
            // Se a missão já tem data final (concluída/cancelada), usa ela.
            // Se não, verifica se a data inicial é Futura. Se for futura, deixa em branco.
            // Se for presente/passada, usa a data atual (Tempo Real).
            const now = new Date();
            const startObj = m.start_time ? new Date(m.start_time) : now;
            const isFutureStart = startObj > new Date(now.getTime() + 60000); // Buffer 1 min

            const endDT = m.end_time ? {
                date: new Date(m.end_time).toLocaleDateString('en-CA'),
                time: new Date(m.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            } : (isFutureStart ? { date: '', time: '' } : { 
                date: new Date().toLocaleDateString('en-CA'), 
                time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
            });

            if ([MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED].includes(m.status as MissionStatus)) {
                setIsEndTimeLocked(true);
            } else {
                setIsEndTimeLocked(false);
            }

            const coords = extractCoordinates(m.map_link || '');
            if (coords) setCurrentPreviewCoords(coords);

            const { data: clientObj } = await supabase.from('clients').select('id').eq('name', m.client).maybeSingle();
            if (clientObj) setClientId(clientObj.id);

            setEditData({
                provider: m.provider || '', vehicleId: m.vehicle_id?.toString() || '',
                agent1: m.agent1 || '', agent2: m.agent2 || '',
                startKm: m.start_km?.toString() || '', startDate: startDT.date, startTime: startDT.time, 
                endKm: m.end_km?.toString() || '', endDate: endDT.date, endTime: endDT.time, 
                manualProgress: m.progress || 0,
                mapLink: m.map_link || '', description: '', status: m.status,
                origin: m.origin || '', destination: m.destination || '',
                missionType: m.mission_type || 'Caracterizada',
                revenueValue: m.revenue_value?.toString() || '',
                costValue: m.cost_value?.toString() || '',
                tollValue: m.toll_value?.toString() || '',
                isSameOs: m.is_same_os || false,
                applyCeva200km: (m.destination || '').includes('200KM'),
                applyVtc02h: (m.destination || '').includes('02H') || (m.destination || '').includes('02 HORAS'),
                totalDistance: m.total_distance || 0, 
                currentLocationName: '',
                driver_name: m.driver_name || '',
                driver_phone: m.driver_phone || '',
                gr_espelhamento: m.gr_espelhamento || '',
                client_vehicle_id: m.client_vehicle?.toString() || '',
                client_vehicle_plate: mission.clientVehicle?.plate || '',
                client_vehicle_model: mission.clientVehicle?.model || ''
            });

            setSearchTerm(m.provider || '');
            setSearchDriver(m.driver_name || '');
            setSearchCargoVehicle(mission.clientVehicle?.plate || '');
            setSearchAgent1(m.agent1 || '');
            setSearchAgent2(m.agent2 || '');

            refreshAuxData(m.client, m.provider, m.vehicle_id?.toString(), clientObj?.id);
        } catch (error) { console.error(error); } finally { setIsLoadingData(false); }
    };

    const refreshAuxData = async (clientName: string, providerName: string, vId?: string, cId?: number) => {
        const [pRes, vRes, aRes, ctRes, cvRes, dRes] = await Promise.all([
            supabase.from('providers').select('*').eq('status', 'Ativo').order('name'),
            supabase.from('vehicles').select('*').eq('status', 'Ativo'),
            supabase.from('agents').select('*').eq('status', 'Ativo').order('name'),
            supabase.from('client_price_tables').select('*').eq('client', clientName),
            cId ? supabase.from('client_vehicles').select('*').eq('client_id', cId).order('plate') : { data: [] },
            supabase.from('missions').select('driver_name, driver_phone').not('driver_name', 'is', null).order('created_at', { ascending: false }).limit(200)
        ]);
        
        if (pRes.data) setProvidersList(pRes.data);
        if (vRes.data) setVehiclesList(vRes.data);
        if (aRes.data) setAgentsList(aRes.data);
        if (ctRes.data) setClientTables(ctRes.data);
        if (cvRes.data) setClientVehiclesList(cvRes.data as any);
        
        if (dRes.data) {
            const unique = Array.from(new Set(dRes.data.map(d => (d.driver_name as string)?.toUpperCase().trim())))
                .map(name => {
                    const found = dRes.data.find(d => (d.driver_name as string)?.toUpperCase().trim() === name);
                    return { name: (name as string) || '', phone: (found?.driver_phone as string) || '' };
                }).filter(d => d.name !== '');
            setDbPastDrivers(unique);
        }

        const currentVId = vId || editData.vehicleId;
        const currentV = vRes.data?.find(v => v.id.toString() === currentVId);
        if (currentV) setSearchVehicle(currentV.plate);
        else setSearchVehicle('');
    };

    const handlePlaceSelect = () => {
        const place = updateLocRef.current?.getPlace();
        if (place && place.geometry) {
            const addr = place.formatted_address || '';
            setEditData(prev => ({ 
                ...prev, currentLocationName: addr.toUpperCase(),
                mapLink: `https://www.google.com/maps?q=${place.geometry.location.lat()},${place.geometry.location.lng()}&z=17`
            }));
            setCurrentPreviewCoords({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
            calculateProgressFromCoords(place.geometry.location.lat(), place.geometry.location.lng());
        }
    };

    const handleOriginSelect = () => {
        const place = originAutocompleteRef.current?.getPlace();
        if (place && place.formatted_address) {
            setEditData(prev => ({ ...prev, origin: place.formatted_address.toUpperCase() }));
        }
    };

    const handleDestinationSelect = () => {
        const place = destinationAutocompleteRef.current?.getPlace();
        if (place && place.formatted_address) {
            setEditData(prev => ({ ...prev, destination: place.formatted_address.toUpperCase() }));
        }
    };

    const calculateProgressFromCoords = async (currentLat: number, currentLng: number) => {
        if (!editData.origin) return;

        try {
            const geocoder = new google.maps.Geocoder();
            const originRes = await geocoder.geocode({ address: editData.origin });
            
            if (originRes.results && originRes.results[0]) {
                const originLoc = originRes.results[0].geometry.location;
                const distStraight = calculateDistance(originLoc.lat(), originLoc.lng(), currentLat, currentLng);
                const distTraveledEst = distStraight * 1.25;
                const totalPlanned = missionTotals.plannedKm || 1;
                const percentage = Math.min(99, Math.round((distTraveledEst / totalPlanned) * 100));
                
                setEditData(prev => ({ ...prev, manualProgress: percentage }));
                showNotification('IA Logística', `Progresso da viagem atualizado: ${percentage}%`, 'info');
            }
        } catch (e) {
            console.error("Falha no cálculo inteligente", e);
        }
    };

    const reverseGeocode = async (lat: number, lng: number) => {
        if (!isLoaded) return;
        const geocoder = new google.maps.Geocoder();
        try {
            const response = await geocoder.geocode({ location: { lat, lng } });
            if (response.results && response.results[0]) {
                const res = response.results[0];
                let street = '', city = '', state = '';
                
                res.address_components.forEach((c: any) => {
                    if (c.types.includes('route')) street = c.long_name;
                    if (c.types.includes('administrative_area_level_2')) city = c.long_name;
                    if (c.types.includes('administrative_area_level_1')) state = c.short_name;
                });
                
                const formatted = `${street ? street + ', ' : ''}${city} - ${state}`.toUpperCase();
                setEditData(prev => ({ ...prev, currentLocationName: formatted }));
            }
        } catch (e) {
            console.error("Geocoding fail", e);
        }
    };

    const handleLocationInputChange = (val: string) => {
        setEditData(prev => ({ ...prev, currentLocationName: val }));
        const coords = extractCoordinates(val);
        if (coords) {
            setCurrentPreviewCoords(coords);
            setEditData(prev => ({ ...prev, mapLink: val }));
            reverseGeocode(coords.lat, coords.lng);
            calculateProgressFromCoords(coords.lat, coords.lng);
            showNotification('GPS Identificado', 'Sincronizando coordenadas e calculando progresso...', 'success');
        }
    };

    useEffect(() => { if (isOpen && mission) loadMissionData(); }, [isOpen, mission]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleUpdateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mission || !currentUser) return;

        const startIso = new Date(`${editData.startDate}T${editData.startTime}`).toISOString();
        
        let endIso = null;
        if (editData.endDate && editData.endTime) {
            endIso = new Date(`${editData.endDate}T${editData.endTime}`).toISOString();
             if (new Date(endIso) < new Date(startIso)) {
                alert("ERRO DE CRONOLOGIA: A data/hora de término não pode ser anterior ao início da missão.\n\nPor favor, verifique se a data final está correta.");
                return;
            }
        }

        if (isGoogleLinkRequired && !editData.mapLink) {
            alert(`ERRO DE PROTOCOLO: Para o status "${editData.status}", é OBRIGATÓRIO fornecer um link válido do Google Maps ou coordenadas GPS antes de salvar.`);
            return;
        }

        if (isOccurrenceRequired && !editData.description.trim()) {
            alert(`ERRO DE PROTOCOLO: Para o status "${editData.status}", o campo OCORRÊNCIA é obrigatório.`);
            return;
        }

        setIsUpdating(true);
        try {
            const finalDescription = editData.description.trim().toUpperCase();
            const finalLocationToSave = editData.currentLocationName ? `${finalDescription} | ${editData.currentLocationName.toUpperCase()}` : finalDescription;
            
            let finalDestination = editData.destination;
            if (editData.applyVtc02h) finalDestination = '02 HORAS DE ACOMPANHAMENTO';
            else if (editData.applyCeva200km) finalDestination = '200KM DE ACOMPANHAMENTO';

            let finalStatus = editData.status as MissionStatus;

            const sKm = parseNumber(editData.startKm);
            const eKm = parseNumber(editData.endKm);
            const hasStart = sKm > 0 && editData.startDate && editData.startTime;
            const hasEnd = eKm > 0 && eKm >= sKm && editData.endDate && editData.endTime;

            const isCurrentPending = finalStatus === MissionStatus.PENDING;
            const isCurrentInFlight = [MissionStatus.IN_TRANSIT, MissionStatus.ORIGIN].includes(finalStatus);

            if ((isCurrentPending || isCurrentInFlight) && hasStart && hasEnd) {
                finalStatus = MissionStatus.COMPLETED;
                showNotification('IA Operacional', 'Detectamos todos os dados necessários. OS concluída automaticamente.', 'success');
            }

            const progressValue = finalStatus === MissionStatus.COMPLETED ? 100 : editData.manualProgress;

            if (editData.agent1 && editData.agent1.trim() !== '' && 
               (finalStatus === MissionStatus.SOLICITED || finalStatus === MissionStatus.DOCUMENTATION)) {
                finalStatus = MissionStatus.SCHEDULED;
            }

            const vehicleCargaId = editData.client_vehicle_id;
            
            const updateData: any = {
                status: finalStatus,
                map_link: editData.mapLink,
                current_location: finalLocationToSave,
                last_update: new Date().toISOString(),
                updated_by: currentUser.name,
                provider: editData.provider,
                vehicle_id: parseInt(editData.vehicleId) || null,
                agent1: editData.agent1,
                agent2: editData.agent2,
                start_km: sKm || null,
                start_time: startIso,
                end_km: eKm || null,
                end_time: endIso,
                is_same_os: editData.isSameOs,
                progress: progressValue,
                driver_name: editData.driver_name.toUpperCase(),
                driver_phone: editData.driver_phone,
                gr_espelhamento: editData.gr_espelhamento,
                client_vehicle: vehicleCargaId ? parseInt(vehicleCargaId) : null,
                origin: editData.origin.toUpperCase(),
                destination: finalDestination.toUpperCase()
            };

            const { error } = await supabase.from('missions').update(updateData).eq('id', mission.id);
            if (error) throw error;
            
            const dateObj = new Date(startIso);
            const dateStr = dateObj.toLocaleDateString('pt-BR');
            const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            const formatFL = (name?: string) => { 
                if (!name || name === '---' || name === '') return 'N/A'; 
                const parts = name.trim().split(' '); 
                return parts.length > 2 ? `${parts[0]} ${parts[parts.length-1]}`.toUpperCase() : name.toUpperCase(); 
            };

            const cityParts = editData.currentLocationName.split('-');
            const cityPart = cityParts.length > 1 ? cityParts[cityParts.length-2].split(',').pop()?.trim() + ' - ' + cityParts[cityParts.length-1].trim() : (editData.currentLocationName || 'S/D');

            const report = `*MONITORAMENTO GRUPO TMSEG*
*OS:* ${mission.id} | *STATUS:* ${finalStatus.toUpperCase()}

🗓 *DATA:* ${dateStr} *HORA:* ${timeStr}
🛡 *OPERAÇÃO:* ${editData.missionType?.toUpperCase() || 'CARACTERIZADA'}
🏢 *CLIENTE:* ${mission.client}

📍 *ORIGEM:* ${editData.origin.toUpperCase()}
🏁 *DESTINO:* ${finalDestination.toUpperCase()}

🚛 *VEÍCULO:* ${editData.client_vehicle_plate || 'N/A'} (${editData.client_vehicle_model || 'N/D'})
👤 *MOTORISTA:* ${formatFL(editData.driver_name)}
📞 *CONTATO:* ${editData.driver_phone || 'N/A'}

🚔 *VIATURA:* ${searchVehicle || 'N/A'}
👮 *AGENTE 01:* ${formatFL(editData.agent1)}
👮 *AGENTE 02:* ${formatFL(editData.agent2)}

📈*PROGRESSO DA MISSÃO:* ${Math.floor(progressValue)}%
📣 *OCORRÊNCIA:* ${finalDescription || 'SEM INFORMAÇÃO'}
🏙️ *LOCALIZAÇÃO:* ${cityPart.toUpperCase()}
🗾 *LINK DO GOOGLE:* ${editData.mapLink || 'N/A'}`;

            try {
                await navigator.clipboard.writeText(report);
                showNotification('Relatório Copiado', 'Monitoramento formatado salvo e copiado.', 'success');
            } catch (err) { console.warn(err); }

            // Broadcast da atualização para outros usuários via Supabase Realtime
            await supabase.channel('mission-updates').send({
                type: 'broadcast',
                event: 'mission_updated',
                payload: {
                    missionId: mission.id,
                    status: finalStatus,
                    updatedBy: currentUser.name,
                    changeType: finalDescription || 'Atualização de Status'
                }
            });

            onSuccess(report);
        } catch (error: any) { alert(error.message); } finally { setIsUpdating(false); }
    };

    const filteredProviders = providersList.filter(p => p.name.toLowerCase().includes(searchProvider.toLowerCase()));
    const filteredVehicles = vehiclesList.filter(v => v.provider === editData.provider && (v.plate.toLowerCase().includes(searchVehicle.toLowerCase()) || (v.model && v.model.toLowerCase().includes(searchVehicle.toLowerCase()))));
    const filteredAgents = agentsList.filter(a => a.provider === editData.provider && a.name.toLowerCase().includes((activeDropdown === 'agent1' ? searchAgent1 : searchAgent2).toLowerCase()));
    const filteredCargoVehicles = clientVehiclesList.filter(v => v.plate.toLowerCase().includes(searchCargoVehicle.toLowerCase()) || (v.model && v.model.toLowerCase().includes(searchCargoVehicle.toLowerCase())));
    const filteredDrivers = dbPastDrivers.filter(d => d.name.toLowerCase().includes(searchDriver.toLowerCase()));

    const handleDriverSelect = (d: {name: string, phone: string}) => {
        setEditData({ ...editData, driver_name: d.name, driver_phone: d.phone });
        setSearchDriver(d.name);
        setActiveDropdown(null);
    };

    if (!isOpen || !mission) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#f8fafc] rounded-[24px] shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto flex flex-col relative border border-gray-100 scrollbar-hide">
            
            {/* MODAIS DE CADASTRO RÁPIDO E BUSCA */}
            {quickModal === 'provider' && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl p-6 relative">
                        <button onClick={() => setQuickModal(null)} className="absolute top-4 right-4 p-2 text-gray-400"><X size={20}/></button>
                        <ProviderForm onBack={() => setQuickModal(null)} onNavigateToVehicles={() => {}} />
                    </div>
                </div>
            )}
            {quickModal === 'vehicle' && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl p-6 relative">
                        <button onClick={() => setQuickModal(null)} className="absolute top-4 right-4 p-2 text-gray-400"><X size={20}/></button>
                        <VehicleForm embedded onBack={() => setQuickModal(null)} initialProvider={editData.provider} onSuccess={() => { setQuickModal(null); refreshAuxData(mission.client, editData.provider, undefined, clientId || undefined); }} />
                    </div>
                </div>
            )}
            {quickModal === 'agent' && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl p-6 relative">
                        <button onClick={() => setQuickModal(null)} className="absolute top-4 right-4 p-2 text-gray-400"><X size={20}/></button>
                        <ProviderAgentForm onBack={() => setQuickModal(null)} initialProvider={editData.provider} onSuccess={() => { setQuickModal(null); refreshAuxData(mission.client, editData.provider, undefined, clientId || undefined); }} />
                    </div>
                </div>
            )}
            {quickModal === 'cargo' && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl p-6 relative shadow-2xl">
                        <button onClick={() => setQuickModal(null)} className="absolute top-4 right-4 p-2 text-gray-400 z-50 hover:bg-gray-100 rounded-full"><X size={20}/></button>
                        <ClientVehicleForm embedded onBack={() => setQuickModal(null)} initialClientId={clientId} onSuccess={(newId) => { setQuickModal(null); refreshAuxData(mission.client, editData.provider, undefined, clientId || undefined); if(newId) setEditData(prev => ({...prev, client_vehicle_id: newId})); }} />
                    </div>
                </div>
            )}
            {quickModal === 'browse_cargo' && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-5xl p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-black uppercase flex items-center gap-2 text-red-600"><Truck size={20}/> Selecionar Veículo do Cliente</h3>
                            <button onClick={() => setQuickModal(null)} className="p-2 hover:bg-gray-100 rounded-full transition-all"><X size={20}/></button>
                        </div>
                        <ClientVehicleList 
                            embedded 
                            clientId={clientId || undefined} 
                            onAddVehicle={() => setQuickModal('cargo')}
                            onEdit={() => {}}
                            onSelect={(v) => {
                                setEditData({
                                    ...editData,
                                    client_vehicle_id: v.id.toString(),
                                    client_vehicle_plate: v.plate,
                                    client_vehicle_model: v.model
                                });
                                setSearchCargoVehicle(v.plate);
                                setQuickModal(null);
                                showNotification('Sucesso', `Veículo ${v.plate} selecionado.`, 'success');
                            }}
                        />
                    </div>
                </div>
            )}

            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-red-600 rounded-xl text-white shadow-lg"><Activity size={20}/></div>
                    <div>
                        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter leading-none">Atualizar Missão</h3>
                        <div className="flex gap-2 mt-1.5 flex-wrap">
                            <span className="text-[10px] font-black text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-widest">{mission.id}</span>
                            <span className="text-[10px] font-black text-slate-800 bg-slate-50 px-2 py-1 rounded border border-slate-200 uppercase tracking-widest">{mission.client}</span>
                            {editData.provider && (
                                <span className="text-[10px] font-black text-slate-800 bg-white px-2 py-1 rounded border border-slate-200 uppercase tracking-widest flex items-center gap-1 shadow-sm">
                                    <Briefcase size={10} className="text-red-500" /> {editData.provider}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button>
            </div>

            {isLoadingData ? (
                <div className="flex justify-center p-20 flex-1"><Loader2 className="animate-spin text-red-600" size={40} /></div>
            ) : (
                <form onSubmit={handleUpdateSubmit} className="p-6 space-y-6 flex-1 overflow-y-auto scrollbar-hide" ref={dropdownRef}>
                    
                    {/* STATUS E REGRAS ESPECIAIS */}
                    <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-center mb-4 px-1">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Fluxo Operacional</h4>
                            <div className="flex gap-3">
                                {(editData.origin.toUpperCase().includes('CEVA') || editData.origin.toUpperCase().includes('LUFT') || (mission.client && mission.client.toUpperCase().includes('CEVA')) || (mission.client && mission.client.toUpperCase().includes('LUFT'))) && (
                                    <label className={`flex items-center gap-2 px-4 py-1.5 rounded-xl border transition-all cursor-pointer ${editData.applyCeva200km ? 'bg-red-600 text-white border-red-600 shadow-lg' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                        <input type="checkbox" className="hidden" checked={editData.applyCeva200km} onChange={e => setEditData({...editData, applyCeva200km: e.target.checked})} />
                                        <BadgeCheck size={12}/> <span className="text-[9px] font-black uppercase tracking-widest">Regra: 200KM</span>
                                    </label>
                                )}
                                {(editData.origin.toUpperCase().includes('VTC') || (mission.client && mission.client.toUpperCase().includes('VTC'))) && (
                                    <label className={`flex items-center gap-2 px-4 py-1.5 rounded-xl border transition-all cursor-pointer ${editData.applyVtc02h ? 'bg-red-600 text-white border-red-600 shadow-lg' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                        <input type="checkbox" className="hidden" checked={editData.applyVtc02h} onChange={e => setEditData({...editData, applyVtc02h: e.target.checked})} />
                                        <Clock size={12}/> <span className="text-[9px] font-black uppercase tracking-widest">Regra: 02H</span>
                                    </label>
                                )}
                                <label className={`flex items-center gap-2 px-4 py-1.5 rounded-xl border transition-all cursor-pointer ${editData.isSameOs ? 'bg-slate-900 text-white border-black shadow-lg' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                    <input type="checkbox" className="hidden" checked={editData.isSameOs} onChange={e => setEditData({...editData, isSameOs: e.target.checked})} />
                                    <Layers size={12}/> <span className="text-[9px] font-black uppercase tracking-widest">Mesma OS</span>
                                </label>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pb-4 border-b border-gray-100">
                            {operationalStatuses.map(s => (
                                <button key={s} type="button" onClick={() => setEditData({...editData, status: s})} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${editData.status === s ? 'bg-red-600 text-white border-red-600 shadow-md scale-105' : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300'}`}>{s}</button>
                            ))}
                        </div>
                        <div className="mt-4 flex flex-wrap items-end gap-6">
                            <div className="flex gap-2">
                                {restrictedStatuses.map(s => (
                                    <button key={s} type="button" onClick={() => setEditData({...editData, status: s})} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${editData.status === s ? 'bg-gray-900 text-white border-black shadow-md' : 'bg-red-50 text-red-400 border-red-100 hover:bg-red-100'}`}>{s}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* DADOS DA EQUIPE */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-6 bg-white border border-gray-200 rounded-[2.5rem] shadow-sm relative">
                        
                        {/* ALERTA INTELIGENTE IBL */}
                        {iblWarning && (
                            <div className="col-span-full bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-2 shadow-lg animate-pulse mb-2">
                                <ShieldAlert size={16} /> {iblWarning}
                            </div>
                        )}

                        <div className="relative">
                            <label className={LABEL_CLASS}>Fornecedor Parceiro</label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <input type="text" className={INPUT_CLASS} placeholder="Filtrar..." value={searchProvider} onChange={e => setSearchTerm(e.target.value)} onFocus={() => setActiveDropdown('provider')} />
                                    <Search size={14} className="absolute right-3 top-3 text-gray-300" />
                                    {activeDropdown === 'provider' && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {filteredProviders.map(p => (
                                                <button key={p.id} type="button" onClick={() => { setEditData({...editData, provider: p.name, vehicleId: '', agent1: '', agent2: ''}); setSearchTerm(p.name); setSearchVehicle(''); setActiveDropdown(null); }} className={DROPDOWN_ITEM_CLASS}>
                                                    <span>{p.name}</span>
                                                    <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button type="button" onClick={() => setQuickModal('provider')} className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition-all shadow-md"><Plus size={18}/></button>
                            </div>
                        </div>

                        <div className="relative">
                            <label className={LABEL_CLASS}>Viatura (Placa)</label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <input type="text" className={INPUT_CLASS} placeholder={editData.provider ? "Placa..." : "Aguardando Fornecedor..."} value={searchVehicle} onChange={e => setSearchVehicle(e.target.value)} onFocus={() => editData.provider && setActiveDropdown('vehicle')} disabled={!editData.provider} />
                                    <CarFront size={14} className="absolute right-3 top-3 text-gray-300" />
                                    {activeDropdown === 'vehicle' && editData.provider && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {filteredVehicles.map(v => (
                                                <button key={v.id} type="button" onClick={() => { setEditData({...editData, vehicleId: v.id.toString()}); setSearchVehicle(v.plate); setActiveDropdown(null); }} className={DROPDOWN_ITEM_CLASS}>
                                                    <span>{v.plate} ({v.model})</span>
                                                    <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button type="button" disabled={!editData.provider} onClick={() => setQuickModal('vehicle')} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all border border-gray-200 disabled:opacity-50"><Plus size={18}/></button>
                            </div>
                        </div>

                        <div className="relative">
                            <label className={LABEL_CLASS}>Agente 1 (Líder)</label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <input type="text" className={INPUT_CLASS} placeholder={editData.provider ? "Nome..." : "Aguardando Fornecedor..."} value={searchAgent1} onChange={e => setSearchAgent1(e.target.value)} onFocus={() => editData.provider && setActiveDropdown('agent1')} disabled={!editData.provider} />
                                    <UserCheck size={14} className="absolute right-3 top-3 text-gray-300" />
                                    {activeDropdown === 'agent1' && editData.provider && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {filteredAgents.map(a => (
                                                <button key={a.id} type="button" onClick={() => { setEditData({...editData, agent1: a.name}); setSearchAgent1(a.name); setActiveDropdown(null); }} className={DROPDOWN_ITEM_CLASS}>
                                                    <span>{a.name}</span>
                                                    <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button type="button" disabled={!editData.provider} onClick={() => setQuickModal('agent')} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all border border-gray-200 disabled:opacity-50"><Plus size={18}/></button>
                            </div>
                        </div>

                        <div className="relative">
                            <label className={LABEL_CLASS}>Agente 2 (Auxiliar)</label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <input type="text" className={INPUT_CLASS} placeholder={editData.provider ? "Nome..." : "Aguardando Fornecedor..."} value={searchAgent2} onChange={e => setSearchAgent2(e.target.value)} onFocus={() => editData.provider && setActiveDropdown('agent2')} disabled={!editData.provider} />
                                    <UserCheck size={14} className="absolute right-3 top-3 text-gray-300" />
                                    {activeDropdown === 'agent2' && editData.provider && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {filteredAgents.map(a => (
                                                <button key={a.id} type="button" onClick={() => { setEditData({...editData, agent2: a.name}); setSearchAgent2(a.name); setActiveDropdown(null); }} className={DROPDOWN_ITEM_CLASS}>
                                                    <span>{a.name}</span>
                                                    <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button type="button" disabled={!editData.provider} onClick={() => setQuickModal('agent')} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all border border-gray-200 disabled:opacity-50"><Plus size={18}/></button>
                            </div>
                        </div>
                    </div>

                    {/* DADOS DA CARGA E MOTORISTA */}
                    <div className="bg-white p-6 rounded-[2.5rem] border border-gray-200 shadow-sm space-y-5">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-gray-50 pb-3"><Package size={14} className="text-red-600"/> Dados da Carga e Condutor</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            <div className="relative">
                                <label className={LABEL_CLASS}>Motorista</label>
                                <div className="relative">
                                    <input type="text" className={INPUT_CLASS} placeholder="Nome do condutor..." value={searchDriver} onChange={e => { setSearchDriver(e.target.value); setEditData({...editData, driver_name: e.target.value}); setActiveDropdown('driver'); }} onFocus={() => setActiveDropdown('driver')} />
                                    <User size={14} className="absolute right-3 top-3 text-gray-300" />
                                    {activeDropdown === 'driver' && filteredDrivers.length > 0 && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto ring-1 ring-black/5">
                                            {filteredDrivers.map((d, i) => (
                                                <button key={i} type="button" onClick={() => handleDriverSelect(d)} className={DROPDOWN_ITEM_CLASS}>
                                                    <span>{d.name}</span>
                                                    <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div><label className={LABEL_CLASS}>Contato Celular</label><input type="text" className={INPUT_CLASS} value={editData.driver_phone} onChange={e => setEditData({...editData, driver_phone: e.target.value})} /></div>
                            
                            <div className="relative">
                                <label className={LABEL_CLASS}>Placa Carga</label>
                                <div className="flex gap-1.5">
                                    <div className="relative flex-1">
                                        <input type="text" className={INPUT_CLASS} placeholder="Placa..." value={searchCargoVehicle} onChange={e => { setSearchCargoVehicle(e.target.value.toUpperCase()); setActiveDropdown('cargo_vehicle'); }} onFocus={() => setActiveDropdown('cargo_vehicle')} />
                                        <button 
                                            type="button" 
                                            onClick={() => setQuickModal('browse_cargo')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-600 transition-all"
                                        >
                                            <Search size={14} />
                                        </button>
                                        {activeDropdown === 'cargo_vehicle' && filteredCargoVehicles.length > 0 && (
                                            <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                                {filteredCargoVehicles.map(v => (
                                                    <button key={v.id} type="button" onClick={() => { 
                                                        setEditData({
                                                            ...editData, 
                                                            client_vehicle_id: v.id.toString(), 
                                                            client_vehicle_plate: v.plate, 
                                                            client_vehicle_model: v.model
                                                        }); 
                                                        setSearchCargoVehicle(v.plate); 
                                                        setActiveDropdown(null); 
                                                    }} className={DROPDOWN_ITEM_CLASS}>
                                                        <span>{v.plate} ({v.model})</span>
                                                        <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button type="button" onClick={() => setQuickModal('cargo')} className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition-all shadow-md"><Plus size={18}/></button>
                                </div>
                            </div>

                            <div><label className={LABEL_CLASS}>Modelo Carga</label><input type="text" className={INPUT_CLASS} value={editData.client_vehicle_model} onChange={e => setEditData({...editData, client_vehicle_model: e.target.value.toUpperCase()})} /></div>
                            <div><label className={LABEL_CLASS}>GR / Espelhamento</label><input type="text" className={`${INPUT_CLASS} border-indigo-200 bg-indigo-50/20`} value={editData.gr_espelhamento} onChange={e => setEditData({...editData, gr_espelhamento: e.target.value.toUpperCase()})} /></div>
                        </div>
                    </div>

                    {/* FICHA DE MEDIÇÃO OPERACIONAL */}
                    <div className="bg-white p-6 rounded-[2.5rem] border border-gray-200 shadow-sm space-y-4">
                        <div className="flex items-center gap-2 border-b border-gray-50 pb-3">
                            <Milestone size={14} className="text-blue-600"/>
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Ficha de Medição Operacional</h4>
                        </div>
                        
                        <div className="space-y-4">
                            {/* LINHA ORIGEM (PONTO A) */}
                            <div className="flex flex-col lg:flex-row items-center gap-6 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 transition-all hover:bg-white hover:shadow-sm">
                                <div className="flex-1 flex items-start gap-3 w-full">
                                    <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600 shrink-0"><MapPin size={16}/></div>
                                    <div className="min-w-0 flex-1">
                                        <span className={LABEL_CLASS}>Origem (Ponto A)</span>
                                        {canEditRoute && isLoaded ? (
                                            <Autocomplete 
                                                onLoad={ref => originAutocompleteRef.current = ref} 
                                                onPlaceChanged={handleOriginSelect}
                                            >
                                                <input 
                                                    type="text" 
                                                    className="w-full bg-transparent border-none p-0 text-xs font-bold text-gray-700 uppercase focus:ring-0" 
                                                    value={editData.origin} 
                                                    onChange={e => setEditData({...editData, origin: e.target.value.toUpperCase()})}
                                                    placeholder="Selecione a Origem..."
                                                />
                                            </Autocomplete>
                                        ) : (
                                            <p className="text-xs font-bold text-gray-700 uppercase truncate" title={mission.origin}>{editData.origin}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-4 w-full lg:w-auto">
                                    <div className="flex-1 lg:w-44">
                                        <label className={LABEL_CLASS}>Data Inicial</label>
                                        <div className="relative">
                                            <input type="date" className={INPUT_CLASS} value={editData.startDate} onChange={e => setEditData({...editData, startDate: e.target.value})} />
                                            <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div className="flex-1 lg:w-28">
                                        <label className={LABEL_CLASS}>Hora Inicial</label>
                                        <div className="relative">
                                            <input type="time" step="1" className={INPUT_CLASS} value={editData.startTime} onChange={e => setEditData({...editData, startTime: e.target.value})} />
                                            <Clock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div className="flex-1 lg:w-36">
                                        <label className={LABEL_CLASS}>KM Inicial</label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                inputMode="decimal"
                                                className={INPUT_CLASS} 
                                                value={editData.startKm} 
                                                onChange={e => handleKmInput('startKm', e.target.value)}
                                                placeholder="0.0"
                                            />
                                            <Navigation size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* LINHA DESTINO (PONTO C) */}
                            <div className="flex flex-col lg:flex-row items-center gap-6 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 transition-all hover:bg-white hover:shadow-sm">
                                <div className="flex-1 flex items-start gap-3 w-full">
                                    <div className="p-2.5 bg-red-50 rounded-xl text-red-600 shrink-0"><Flag size={16}/></div>
                                    <div className="min-w-0 flex-1">
                                        <span className={LABEL_CLASS}>Destino (Ponto C)</span>
                                        {canEditRoute && isLoaded ? (
                                            <Autocomplete 
                                                onLoad={ref => destinationAutocompleteRef.current = ref} 
                                                onPlaceChanged={handleDestinationSelect}
                                            >
                                                <input 
                                                    type="text" 
                                                    className="w-full bg-transparent border-none p-0 text-xs font-bold text-gray-700 uppercase focus:ring-0" 
                                                    value={editData.destination} 
                                                    onChange={e => setEditData({...editData, destination: e.target.value.toUpperCase()})}
                                                    placeholder="Selecione o Destino..."
                                                />
                                            </Autocomplete>
                                        ) : (
                                            <p className="text-xs font-bold text-gray-700 uppercase truncate" title={editData.destination}>
                                                {editData.destination}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-4 w-full lg:w-auto items-end">
                                    <div className="flex-1 lg:w-44">
                                        <label className={LABEL_CLASS}>Data Final</label>
                                        <div className="relative">
                                            <input 
                                                type="date" 
                                                className={`transition-all ${!isEndTimeLocked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'} ${INPUT_CLASS}`} 
                                                value={editData.endDate} 
                                                onChange={e => {
                                                    setEditData({...editData, endDate: e.target.value});
                                                    setIsEndTimeLocked(true);
                                                }} 
                                            />
                                            <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div className="flex-1 lg:w-28 relative">
                                        <label className={LABEL_CLASS}>Hora Final</label>
                                        <div className="relative">
                                            <input 
                                                type="time" 
                                                step="1" 
                                                className={`transition-all ${!isEndTimeLocked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'} ${INPUT_CLASS}`} 
                                                value={editData.endTime} 
                                                onChange={e => {
                                                    setEditData({...editData, endTime: e.target.value});
                                                    setIsEndTimeLocked(true);
                                                }} 
                                            />
                                            <Clock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                        {!isEndTimeLocked && (
                                            <span className="absolute -top-4 right-0 text-[7px] font-black text-indigo-600 animate-pulse uppercase">Tempo Real</span>
                                        )}
                                    </div>
                                    <div className="flex items-center">
                                        <button 
                                            type="button"
                                            onClick={() => setIsEndTimeLocked(!isEndTimeLocked)}
                                            className={`p-2.5 rounded-xl transition-all shadow-sm ${!isEndTimeLocked ? 'bg-indigo-600 text-white animate-pulse' : 'bg-gray-100 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 border border-gray-200'}`}
                                            title={isEndTimeLocked ? "Ativar Horário em Tempo Real" : "Travar Horário Atual"}
                                        >
                                            {isEndTimeLocked ? <RefreshCw size={14} /> : <Zap size={14} fill="currentColor" />}
                                        </button>
                                    </div>
                                    <div className="flex-1 lg:w-36">
                                        <label className={LABEL_CLASS}>KM Final</label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                inputMode="decimal"
                                                className={INPUT_CLASS} 
                                                value={editData.endKm} 
                                                onChange={e => handleKmInput('endKm', e.target.value)}
                                                placeholder="0.0"
                                            />
                                            <Flag size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SOFTWARE ANALYTICS E PROGRESSO INTELIGENTE */}
                    <div className="bg-slate-900 rounded-[2.5rem] p-6 text-white shadow-2xl relative overflow-hidden group border border-slate-800">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500"><Calculator size={100} /></div>
                      <div className="relative z-10 flex flex-col gap-6">
                          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                              <div className="flex items-center gap-3">
                                  <div className="p-3 bg-red-600 rounded-2xl shadow-xl shadow-red-900/40"><DollarSign size={24} /></div>
                                  <div>
                                      <h4 className="text-sm font-black uppercase tracking-tight">Software Analytics</h4>
                                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-0.5">Rendimento Técnico em Tempo Real</p>
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 flex-1 max-w-2xl">
                                  <div className="flex flex-col items-end border-l border-white/10 pl-4">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Dist. Prevista</span>
                                      <span className={`text-base font-black font-mono transition-all duration-300 ${editData.applyCeva200km ? 'text-red-500' : editData.applyVtc02h ? 'text-yellow-500' : 'text-blue-400'}`}>
                                          {missionTotals.plannedKm.toFixed(1)} KM
                                      </span>
                                  </div>
                                  <div className="flex flex-col items-end border-l border-white/10 pl-4">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">KM Executado</span>
                                      <span className="text-base font-black font-mono text-green-400">{missionTotals.km} KM</span>
                                  </div>
                                  <div className="flex flex-col items-end border-l border-white/10 pl-4">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Excedentes</span>
                                      <span className={`text-base font-black font-mono ${missionTotals.extraHours > 0 ? 'text-orange-400 animate-pulse' : 'text-slate-500'}`}>{missionTotals.extraHours.toFixed(2)} H</span>
                                  </div>
                                  <div className="flex flex-col items-end border-l border-white/10 pl-4">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Cronômetro</span>
                                      <span className="text-base font-black font-mono text-white">{missionTotals.time}</span>
                                  </div>
                              </div>
                          </div>

                          <div className="bg-slate-950 p-6 rounded-3xl border border-white/5 space-y-4">
                              <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-2">
                                      <TrendingUp size={16} className="text-red-500" />
                                      <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                          Progresso da Viagem: {editData.manualProgress}%
                                          <span className="bg-red-600/20 text-red-500 px-2 py-0.5 rounded text-[8px] border border-red-500/30 animate-pulse flex items-center gap-1"><Zap size={8}/> CÁLCULO AUTOMÁTICO IA ATIVO</span>
                                      </h4>
                                  </div>
                              </div>
                              <div className="relative w-full h-3 bg-slate-800 rounded-full overflow-hidden shadow-inner border border-white/5">
                                  <div 
                                      className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-1000 shadow-[0_0_15px_rgba(220,38,38,0.3)]" 
                                      style={{ width: `${editData.manualProgress}%` }}
                                  ></div>
                              </div>
                              <div className="flex justify-between text-[8px] font-bold text-slate-600 uppercase tracking-widest">
                                  <span>Ponto A (Saída)</span>
                                  <span>Projeção Inteligente Baseada em GPS</span>
                                  <span>Ponto C (Chegada)</span>
                              </div>
                          </div>
                      </div>
                    </div>

                    {/* POSICIONAMENTO GEOGRÁFICO INTELIGENTE */}
                    <div className="p-5 bg-slate-900 rounded-[2.5rem] text-white space-y-4 shadow-2xl border border-slate-800">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                            <Navigation size={16} className="text-red-500" />
                            <h4 className="text-[10px] font-black uppercase tracking-widest">Posicionamento Geográfico Inteligente</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1.5 block ${isGoogleLinkRequired ? 'text-red-400 animate-pulse underline decoration-2' : 'text-slate-400'}`}>
                                        {isGoogleLinkRequired ? 'LINK GOOGLE MAPS OBRIGATÓRIO *' : 'Localização Atual (Ponto B)'}
                                    </label>
                                    <Autocomplete onLoad={ref => updateLocRef.current = ref} onPlaceChanged={handlePlaceSelect}>
                                        <input type="text" className={`w-full bg-slate-800 border rounded-xl p-3.5 text-xs font-bold outline-none transition-all ${isGoogleLinkRequired && !editData.mapLink ? 'border-red-500/50 ring-2 ring-red-500/10' : 'border-white/10 focus:ring-2 focus:ring-red-500/30'}`} placeholder="Busque a cidade ou cole link do Google Maps..." value={editData.currentLocationName} onChange={e => handleLocationInputChange(e.target.value)} />
                                    </Autocomplete>
                                    {!editData.mapLink && isGoogleLinkRequired && (
                                        <p className="text-[8px] text-red-500 font-black mt-1 uppercase flex items-center gap-1"><ShieldAlert size={10}/> Sistema bloqueado até identificar link de satélite válido</p>
                                    )}
                                    {editData.mapLink && (
                                        <p className="text-[8px] text-green-500 font-black mt-1 uppercase flex items-center gap-1"><Globe size={10}/> Link de GPS validado com sucesso</p>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <label className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1.5 block ${isOccurrenceRequired ? 'text-red-400 animate-pulse' : 'text-slate-400'}`}>Ocorrência / Status *</label>
                                    <textarea className="w-full h-full bg-slate-800 border border-white/10 rounded-2xl p-3.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/30 font-medium transition-all" placeholder="Ex: EM OPERAÇÃO, SEGUE MISSÃO..." value={editData.description} onChange={e => setEditData({...editData, description: e.target.value.toUpperCase()})}></textarea>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 min-h-[350px]">
                                <div className="bg-slate-950 rounded-[2rem] border border-white/5 overflow-hidden flex-1 relative shadow-inner">
                                    {currentPreviewCoords ? (
                                        <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={currentPreviewCoords} zoom={15} options={{ disableDefaultUI: true, styles: [{ elementType: "geometry", stylers: [{ color: "#242f3e" }] }, { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] }] }}>
                                            <Marker position={currentPreviewCoords} />
                                        </GoogleMap>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full opacity-20"><MapPin size={40}/><p className="text-[9px] font-black uppercase mt-2 text-center">Aguardando coordenadas...</p></div>
                                    )}
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><History size={12} className="text-red-500"/> Última informação gravada</p>
                                    <p className="text-[10px] font-bold text-slate-300 mt-1.5 italic truncate">{mission.currentLocation || 'Nenhuma ocorrência anterior'}</p>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                                <div className="min-w-0">
                                    <span className="text-[8px] font-black text-gray-500 uppercase block">Ponto A (Origem)</span>
                                    <span className="text-[9px] font-black text-white truncate block" title={editData.origin}>{editData.origin || '---'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                <div className="min-w-0">
                                    <span className="text-[8px] font-black text-gray-500 uppercase block">Ponto B (Atual)</span>
                                    <span className="text-[9px] font-black text-white truncate block" title={editData.currentLocationName}>{editData.currentLocationName || 'S/D'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <div className="min-w-0">
                                    <span className="text-[8px] font-black text-gray-500 uppercase block">Ponto C (Destino)</span>
                                    <span className="text-[9px] font-black text-white truncate block" title={editData.destination}>{editData.destination || '---'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RODAPÉ DE AÇÕES */}
                    <div className="pt-6 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white pb-4 px-2 shrink-0">
                        <button type="button" onClick={onClose} className="px-8 py-3 border border-gray-200 rounded-xl text-[10px] font-black text-gray-500 uppercase hover:bg-gray-50 transition-all">Cancelar</button>
                        <button type="submit" disabled={isUpdating || (isGoogleLinkRequired && !editData.mapLink)} className={`px-10 py-3 rounded-xl text-[10px] font-black shadow-lg uppercase flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${isGoogleLinkRequired && !editData.mapLink ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-200'}`}>
                            {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                            {isGoogleLinkRequired && !editData.mapLink ? 'Link Google Obrigatório' : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>
            )}
          </div>
        </div>
    );
};

export default UpdateMissionModal;
