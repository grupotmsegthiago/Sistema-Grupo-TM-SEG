
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Mission, MissionStatus, ProviderData, Agent, Vehicle, User as UserType, ClientPriceTable, ClientVehicleDB } from '../types';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { useNotification } from '../lib/NotificationContext';
import { 
  X, Activity, MapPin, Flag, Truck, Plus, Save, 
  Layers, Navigation, History, 
  Calculator, Clock, Trash2, UserCheck, CarFront, DollarSign, AlertCircle, Info, ShieldAlert, AlertTriangle,
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

    const isCompletedMission = mission?.status === MissionStatus.COMPLETED;
    const isBillingApproved = !!mission?.billing_approved;
    const canRevertStatus = useMemo(() => {
        if (!currentUser) return false;
        const role = (currentUser.role || '').toLowerCase();
        return ['diretoria', 'administrador', 'avançado', 'avancado'].includes(role) || (currentUser.permissions && currentUser.permissions.includes('*'));
    }, [currentUser]);

    // Listas de Dados
    const [providersList, setProvidersList] = useState<ProviderData[]>([]);
    const [vehiclesList, setVehiclesList] = useState<Vehicle[]>([]); 
    const [agentsList, setAgentsList] = useState<Agent[]>([]);
    const [allAgentsList, setAllAgentsList] = useState<Agent[]>([]);
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

    const [quickModal, setQuickModal] = useState<'provider' | 'vehicle' | 'agent' | 'cargo' | 'browse_cargo' | null>(null);

    const [emailMissingAlert, setEmailMissingAlert] = useState<{ type: 'client' | 'provider'; name: string; entityId: string } | null>(null);
    const [quickEmailInput, setQuickEmailInput] = useState('');
    const [isSavingQuickEmail, setIsSavingQuickEmail] = useState(false);

    const [iblWarning, setIblWarning] = useState('');
    const [originalStatus, setOriginalStatus] = useState('');

    const [editData, setEditData] = useState({
        provider: '', vehicleId: '', agent1: '', agent2: '',
        startKm: '', startDate: '', startTime: '', 
        endKm: '', endDate: '', endTime: '',
        manualProgress: 0,
        mapLink: '', description: '', status: MissionStatus.SOLICITED,
        origin: '', destination: '',
        missionType: 'Caracterizada',
        revenueValue: '', costValue: '', tollValue: '',
        isSameOs: false, applyCeva200km: false, applyVtc02h: false, parentMissionId: '',
        totalDistance: 0, currentLocationName: '',
        // Dados da Carga
        driver_name: '', driver_phone: '', gr_espelhamento: '',
        client_vehicle_id: '',
        client_vehicle_plate: '', client_vehicle_model: ''
    });

    const [currentPreviewCoords, setCurrentPreviewCoords] = useState<{ lat: number, lng: number } | null>(null);

    const [parentOsSuggestions, setParentOsSuggestions] = useState<{id: string, client: string, provider: string, origin: string, destination: string, status: string}[]>([]);
    const [parentOsSearch, setParentOsSearch] = useState('');
    const [showParentOsDropdown, setShowParentOsDropdown] = useState(false);

    const updateLocRef = useRef<any>(null);
    const originAutocompleteRef = useRef<any>(null);
    const destinationAutocompleteRef = useRef<any>(null);
    const dropdownRef = useRef<HTMLFormElement>(null);

    const operationalStatuses = [
        MissionStatus.SOLICITED, MissionStatus.DOCUMENTATION, MissionStatus.SCHEDULED, 
        MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT, MissionStatus.COMPLETED
    ];

    const restrictedStatuses = [MissionStatus.CANCELLED, MissionStatus.REFUSED];

    const isRequirementActive = useMemo(() => {
        return [
            MissionStatus.ORIGIN, 
            MissionStatus.IN_TRANSIT, 
            MissionStatus.COMPLETED
        ].includes(editData.status as MissionStatus);
    }, [editData.status]);

    const isOccurrenceRequired = isRequirementActive || editData.status === MissionStatus.REFUSED;
    const isGoogleLinkRequired = isRequirementActive;

    // Efeito para Relógio em Tempo Real nos campos de Fim de Viagem
    useEffect(() => {
        if (!isOpen || isEndTimeLocked || (mission && [MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED, MissionStatus.PENDING].includes(mission.status as MissionStatus) && mission.endTime)) return;

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
        if (!mission) return { km: '0.0', time: '0h 0m', extraHours: 0, plannedKm: 0, traveled: 0 };
        const sKm = parseNumber(editData.startKm);
        const eKm = parseNumber(editData.endKm);
        const traveled = eKm > sKm ? (eKm - sKm) : 0;

        // REGRA LOGITECH (CEVA)
        const isLogitech = (mission.client || "").toUpperCase().includes('CEVA') && 
                           ((mission.destination || "").toUpperCase().includes('LOGITECH') || 
                            (mission as any).operation_type?.toUpperCase().includes('LOGITECH'));

        let plannedKm = mission.totalDistance || 0;
        if (plannedKm > 10000) plannedKm = plannedKm / 1000;
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
            const isFixedHoursRule = editData.applyVtc02h || 
                (currentTable.operation_type || '').toUpperCase().includes('02H') ||
                (currentTable.operation_type || '').toUpperCase().includes('02 HORAS');
            const isFixedDistRule = editData.applyCeva200km || isLogitech ||
                (currentTable.operation_type || '').toUpperCase().includes('200KM') ||
                (currentTable.operation_type || '').toUpperCase().includes('100KM');
            
            if (isFixedHoursRule) {
                totalHours = Math.min(totalHours, currentTable.franchise_hours || 3);
            }
            extraHours = Math.max(0, totalHours - (currentTable.franchise_hours || 0));
        }

        return { km: traveled.toFixed(1), time: timeStr, extraHours, plannedKm, traveled };
    }, [editData, clientTables, mission]);

    React.useEffect(() => {
        const isAnomaly = missionTotals.plannedKm > 0 && missionTotals.traveled > 0 && missionTotals.traveled > missionTotals.plannedKm * 5;
        if (isAnomaly) return;

        if (missionTotals.traveled > 0 && missionTotals.plannedKm > 0) {
            const pct = Math.round((missionTotals.traveled / missionTotals.plannedKm) * 100);
            if (pct !== editData.manualProgress) {
                setEditData(prev => ({ ...prev, manualProgress: pct }));
            }
        } else if (missionTotals.plannedKm > 0 && missionTotals.traveled === 0) {
            if (editData.manualProgress !== 0) {
                setEditData(prev => ({ ...prev, manualProgress: 0 }));
            }
        }
    }, [missionTotals.traveled, missionTotals.plannedKm]);

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

            if ([MissionStatus.COMPLETED, MissionStatus.CANCELLED, MissionStatus.REFUSED, MissionStatus.PENDING].includes(m.status as MissionStatus)) {
                setIsEndTimeLocked(true);
            } else {
                setIsEndTimeLocked(false);
            }

            const coords = extractCoordinates(m.map_link || '');
            if (coords) setCurrentPreviewCoords(coords);

            const { data: clientObj } = await supabase.from('clients').select('id').eq('name', m.client).maybeSingle();
            if (clientObj) setClientId(clientObj.id);

            setOriginalStatus(m.status);
            setEditData({
                provider: m.provider || '', vehicleId: m.vehicle_id?.toString() || '',
                agent1: m.agent1 || '', agent2: m.agent2 || '',
                startKm: m.start_km?.toString() || '', startDate: startDT.date, startTime: startDT.time, 
                endKm: m.end_km?.toString() || '', endDate: endDT.date, endTime: endDT.time, 
                manualProgress: m.progress || 0,
                mapLink: (() => {
                    const raw = m.map_link || '';
                    if (!raw) return '';
                    const c = extractCoordinates(raw);
                    return c ? `https://www.google.com/maps?q=${c.lat},${c.lng}&z=17&hl=pt-BR` : raw;
                })(), description: '', status: m.status,
                origin: m.origin || '', destination: m.destination || '',
                missionType: m.mission_type || 'Caracterizada',
                revenueValue: m.revenue_value?.toString() || '',
                costValue: m.cost_value?.toString() || '',
                tollValue: m.toll_value?.toString() || '',
                isSameOs: m.is_same_os || false, parentMissionId: m.parent_mission_id || '',
                applyCeva200km: (m.destination || '').includes('200KM'),
                applyVtc02h: ((m.destination || '').includes('02H') || (m.destination || '').includes('02 HORAS')) && (m.client || '').toUpperCase().includes('VTC'),
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
        const [pRes, vRes, aRes, allARes, ctRes, cvRes, dRes] = await Promise.all([
            supabase.from('providers').select('*').eq('status', 'Ativo').order('name'),
            supabase.from('vehicles').select('*').eq('status', 'Ativo'),
            supabase.from('agents').select('*').eq('status', 'Ativo').order('name'),
            supabase.from('agents').select('*').order('name'),
            supabase.from('client_price_tables').select('*').eq('client', clientName),
            cId ? supabase.from('client_vehicles').select('*').eq('client_id', cId).order('plate') : { data: [] },
            supabase.from('missions').select('driver_name, driver_phone').not('driver_name', 'is', null).order('created_at', { ascending: false }).limit(200)
        ]);
        
        if (pRes.data) setProvidersList(pRes.data);
        if (vRes.data) setVehiclesList(vRes.data);
        if (aRes.data) setAgentsList(aRes.data);
        if (allARes.data) setAllAgentsList(allARes.data);
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
        if (!missionTotals.plannedKm || missionTotals.plannedKm <= 0) return;

        try {
            const geocoder = new google.maps.Geocoder();
            const originRes = await geocoder.geocode({ address: editData.origin });
            
            if (originRes.results && originRes.results[0]) {
                const originLoc = originRes.results[0].geometry.location;
                const distStraight = calculateDistance(originLoc.lat(), originLoc.lng(), currentLat, currentLng);
                const distTraveledEst = distStraight * 1.25;
                const totalPlanned = missionTotals.plannedKm;
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
            const standardLink = `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=17&hl=pt-BR`;
            setCurrentPreviewCoords(coords);
            setEditData(prev => ({ ...prev, mapLink: standardLink }));
            reverseGeocode(coords.lat, coords.lng);
            calculateProgressFromCoords(coords.lat, coords.lng);
            showNotification('GPS Identificado', 'Link convertido para formato padrão e coordenadas sincronizadas.', 'success');
        }
    };

    useEffect(() => { if (isOpen && mission) loadMissionData(); }, [isOpen, mission]);

    useEffect(() => {
        if (!editData.isSameOs || !mission?.client) { setParentOsSuggestions([]); return; }
        const fetchParentSuggestions = async () => {
            let query = supabase.from('missions').select('id, client, provider, origin, destination, status, parent_mission_id')
                .eq('client', mission.client).neq('id', mission.id).is('parent_mission_id', null).order('created_at', { ascending: false }).limit(50);
            if (editData.provider) query = query.eq('provider', editData.provider);
            const { data } = await query;
            if (data) setParentOsSuggestions(data);
        };
        fetchParentSuggestions();
    }, [editData.isSameOs, mission?.client, editData.provider, mission?.id]);

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

        if (isCompletedMission && isBillingApproved) {
            showNotification('Bloqueado', 'Esta OS já foi aprovada pela Diretoria. Nenhuma alteração de status é permitida.', 'error');
            return;
        }

        if (isCompletedMission && editData.status !== MissionStatus.COMPLETED && !canRevertStatus) {
            showNotification('Sem Permissão', 'Apenas perfis Avançado, Administrador ou Diretoria podem reverter uma OS concluída.', 'error');
            return;
        }

        if (isCompletedMission && canRevertStatus && editData.status !== MissionStatus.COMPLETED && editData.status !== MissionStatus.IN_TRANSIT) {
            showNotification('Status Inválido', 'Uma OS concluída só pode ser revertida para "Em Viagem".', 'error');
            return;
        }

        let startIso = new Date(`${editData.startDate}T${editData.startTime}`).toISOString();

        const isTransitionToInTransit = editData.status === MissionStatus.IN_TRANSIT && 
            [MissionStatus.ORIGIN, MissionStatus.SCHEDULED, MissionStatus.DOCUMENTATION, MissionStatus.SOLICITED].includes(originalStatus as MissionStatus);
        
        if (isTransitionToInTransit) {
            const now = new Date();
            const scheduledStart = new Date(`${editData.startDate}T${editData.startTime}`);
            if (now < scheduledStart) {
                startIso = now.toISOString();
                const newDate = now.toLocaleDateString('en-CA');
                const newTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                setEditData(prev => ({ ...prev, startDate: newDate, startTime: newTime }));
            }
        }
        
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

        const checkBlockedAgent = (agentName: string, fieldLabel: string) => {
            if (!agentName || agentName.trim() === '') return false;
            const nameUpper = agentName.trim().toUpperCase();
            const found = allAgentsList.find(a => a.name.toUpperCase() === nameUpper);
            if (found && found.status !== 'Ativo') {
                const isAcaoTrabalhista = found.status === 'Bloqueado / Ação Trabalhista';
                const extraMsg = isAcaoTrabalhista ? '\n\n⚠️ ATENÇÃO: Este agente possui AÇÃO TRABALHISTA ativa. Qualquer escalação pode gerar implicações jurídicas para a empresa.' : '';
                alert(`⛔ BLOQUEIO DE SEGURANÇA\n\nO agente "${found.name}" está com status "${found.status}" e NÃO pode ser escalado para nenhuma operação.\n\nCampo: ${fieldLabel}${extraMsg}\n\nRemova este agente ou selecione outro com status ATIVO.`);
                return true;
            }
            return false;
        };

        if (checkBlockedAgent(editData.agent1, 'Agente 1 (Líder)')) return;
        if (checkBlockedAgent(editData.agent2, 'Agente 2 (Auxiliar)')) return;

        if (mission?.client) {
            const { data: cliCheck } = await supabase.from('clients').select('id, email, operational_email').eq('name', mission.client).single();
            if (cliCheck && !cliCheck.operational_email && !cliCheck.email) {
                setEmailMissingAlert({ type: 'client', name: mission.client, entityId: cliCheck.id });
                setQuickEmailInput('');
                return;
            }
        }
        if (editData.provider) {
            const { data: provCheck } = await supabase.from('providers').select('id, email, os_email').eq('name', editData.provider).single();
            if (provCheck && !provCheck.os_email && !provCheck.email) {
                setEmailMissingAlert({ type: 'provider', name: editData.provider, entityId: provCheck.id });
                setQuickEmailInput('');
                return;
            }
        }

        setIsUpdating(true);
        try {
            const finalDescription = editData.description.trim().toUpperCase();
            const finalLocationToSave = editData.currentLocationName ? `${finalDescription} | ${editData.currentLocationName.toUpperCase()}` : finalDescription;
            
            let finalDestination = editData.destination;
            const isVtcClient = (mission.client || '').toUpperCase().includes('VTC');
            if (editData.applyVtc02h && isVtcClient) finalDestination = '02 HORAS DE ACOMPANHAMENTO';
            else if (editData.applyCeva200km) finalDestination = '200KM DE ACOMPANHAMENTO';

            let finalStatus = editData.status as MissionStatus;

            const sKm = parseNumber(editData.startKm);
            const eKm = parseNumber(editData.endKm);
            const hasStart = sKm > 0 && editData.startDate && editData.startTime;
            const hasEnd = eKm > 0 && eKm >= sKm && editData.endDate && editData.endTime;

            const isCurrentPending = finalStatus === MissionStatus.PENDING;
            const isCurrentInFlight = [MissionStatus.IN_TRANSIT, MissionStatus.ORIGIN].includes(finalStatus);
            const isExplicitRevert = isCompletedMission && canRevertStatus && finalStatus === MissionStatus.IN_TRANSIT;

            if ((isCurrentPending || isCurrentInFlight) && hasStart && hasEnd && !isExplicitRevert) {
                finalStatus = MissionStatus.COMPLETED;
                showNotification('IA Operacional', 'Detectamos todos os dados necessários. OS concluída automaticamente.', 'success');
            }

            if (finalStatus === MissionStatus.COMPLETED && (!hasStart || !hasEnd)) {
                finalStatus = MissionStatus.PENDING;
                const missing = [];
                if (!editData.startDate || !editData.startTime) missing.push('Hora Inicial');
                if (!editData.endDate || !editData.endTime) missing.push('Hora Final');
                if (sKm <= 0) missing.push('KM Inicial');
                if (eKm <= 0 || eKm < sKm) missing.push('KM Final');
                showNotification('Status Pendente', `Faltam dados obrigatórios: ${missing.join(', ')}. A OS ficará como PENDENTE até o preenchimento completo.`, 'warning');
            }

            const plannedDist = missionTotals.plannedKm || 0;
            const kmRodado = eKm > sKm ? (eKm - sKm) : 0;
            const occurrenceText = (finalLocationToSave || '').toUpperCase();
            const isAtDestination = occurrenceText.includes('DESTINO') ||
                occurrenceText.includes('ENTREGUE') ||
                occurrenceText.includes('PONTO C') ||
                occurrenceText.includes('DESCARREGADO') ||
                occurrenceText.includes('FINALIZADO') ||
                occurrenceText.includes('CONCLUÍ');

            const isOdometerAnomaly = plannedDist > 0 && kmRodado > 0 && kmRodado > plannedDist * 5;
            if (isOdometerAnomaly && !isAtDestination && finalStatus !== MissionStatus.COMPLETED) {
                showNotification('Erro de Hodômetro', `KM rodado (${kmRodado.toFixed(1)}) é ${(kmRodado / plannedDist).toFixed(1)}x maior que a distância prevista (${plannedDist.toFixed(1)} KM). Verifique os valores de KM Inicial e Final.`, 'warning');
            }

            let progressValue: number;
            if (finalStatus === MissionStatus.COMPLETED || isAtDestination) {
                progressValue = 100;
            } else if (isOdometerAnomaly) {
                progressValue = editData.manualProgress;
            } else if (kmRodado > 0 && plannedDist > 0) {
                progressValue = Math.min(100, Math.round((kmRodado / plannedDist) * 100));
            } else if (plannedDist <= 0) {
                progressValue = 0;
            } else {
                progressValue = editData.manualProgress;
            }

            if (editData.provider && editData.provider.trim() !== '' && 
               finalStatus === MissionStatus.SOLICITED) {
                finalStatus = MissionStatus.DOCUMENTATION;
            }

            if (editData.provider && editData.vehicleId && editData.agent1 && editData.agent1.trim() !== '' && 
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
                is_same_os: editData.isSameOs, parent_mission_id: editData.parentMissionId || null,
                progress: progressValue,
                driver_name: editData.driver_name.toUpperCase(),
                driver_phone: editData.driver_phone,
                gr_espelhamento: editData.gr_espelhamento,
                client_vehicle: vehicleCargaId ? parseInt(vehicleCargaId) : null,
                origin: editData.origin.toUpperCase(),
                destination: finalDestination.toUpperCase()
            };

            const { error, data: updatedRow } = await supabase.from('missions').update(updateData).eq('id', mission.id).select('id, last_update').single();
            if (error) throw error;
            if (!updatedRow) throw new Error('Falha na persistência: registro não retornado após UPDATE');

            const isRevertFromCompleted = isCompletedMission && finalStatus === MissionStatus.IN_TRANSIT;
            
            await supabase.from('system_logs').insert([{
                user_name: currentUser.name || 'Usuário',
                action_type: isRevertFromCompleted ? 'MISSION_STATUS_REVERT' : 'MISSION_UPDATE',
                entity: 'Mission',
                entity_id: mission.id,
                details: JSON.stringify({
                    status: finalStatus,
                    previous_status: mission.status,
                    ...(isRevertFromCompleted && { revert_reason: 'Reversão autorizada de Concluída para Em Viagem', reverted_by_role: currentUser.role }),
                    provider: editData.provider,
                    agent1: editData.agent1,
                    agent2: editData.agent2,
                    start_km: sKm || null,
                    end_km: eKm || null,
                    origin: editData.origin,
                    destination: editData.destination
                })
            }]);
            
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

            const vehiclePlateForEmail = searchVehicle || editData.client_vehicle_plate || '—';

            if (finalStatus === MissionStatus.SCHEDULED && originalStatus !== MissionStatus.SCHEDULED) {
                try {
                    await fetch('/api/email/mission-scheduled', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            missionId: mission.id,
                            client: mission.client,
                            origin: editData.origin,
                            destination: finalDestination,
                            start_time: startIso,
                            mission_type: editData.missionType,
                            vehiclePlate: vehiclePlateForEmail
                        })
                    });
                } catch (emailErr) {
                    console.error('[Email] Erro ao enviar confirmação ao cliente:', emailErr);
                }
            }

            const providerChanged = editData.provider && editData.provider.trim() !== '' &&
                (originalStatus === MissionStatus.SOLICITED || !mission.provider || mission.provider !== editData.provider);
            if (providerChanged && (finalStatus === MissionStatus.DOCUMENTATION || finalStatus === MissionStatus.SOLICITED)) {
                try {
                    await fetch('/api/email/mission-solicited', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            missionId: mission.id,
                            provider: editData.provider,
                            vehiclePlate: vehiclePlateForEmail,
                            origin: editData.origin,
                            destination: finalDestination,
                            start_time: startIso,
                            mission_type: editData.missionType,
                            driver_name: editData.driver_name,
                            driver_phone: editData.driver_phone
                        })
                    });
                } catch (emailErr) {
                    console.error('[Email] Erro ao enviar solicitação ao fornecedor:', emailErr);
                }
            }

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
    const filteredAgents = allAgentsList.filter(a => a.provider === editData.provider && a.name.toLowerCase().includes((activeDropdown === 'agent1' ? searchAgent1 : searchAgent2).toLowerCase()));

    const getBlockedAgentWarning = (agentName: string) => {
        if (!agentName || agentName.trim() === '') return null;
        const nameUpper = agentName.trim().toUpperCase();
        const found = allAgentsList.find(a => a.name.toUpperCase() === nameUpper);
        if (found && found.status !== 'Ativo') return found;
        return null;
    };
    const blockedAgent1 = getBlockedAgentWarning(editData.agent1);
    const blockedAgent2 = getBlockedAgentWarning(editData.agent2);
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
          <div className="bg-[#f8fafc] rounded-[24px] shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto flex flex-col relative border border-gray-100 scrollbar-thin">
            
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

            {emailMissingAlert && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="bg-red-600 p-4 flex items-center gap-3">
                            <AlertCircle size={24} className="text-white" />
                            <h3 className="text-white font-black text-sm uppercase tracking-wider">Atenção Operador</h3>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-gray-700 mb-4">
                                O <strong>{emailMissingAlert.type === 'client' ? 'Cliente' : 'Fornecedor'}</strong>{' '}
                                <span className="font-black text-red-700">{emailMissingAlert.name}</span>{' '}
                                não possui e-mail de notificação cadastrado.
                            </p>
                            <p className="text-xs text-gray-500 mb-4">Insira o(s) e-mail(s) agora para continuar (separe múltiplos com vírgula):</p>
                            <div className="relative mb-4">
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-gray-50 border-2 border-red-200 rounded-xl outline-none focus:border-red-500 text-sm font-medium"
                                    placeholder={emailMissingAlert.type === 'client' ? 'op1@cliente.com.br, op2@cliente.com.br' : 'os1@fornecedor.com.br, os2@fornecedor.com.br'}
                                    value={quickEmailInput}
                                    onChange={e => setQuickEmailInput(e.target.value.toLowerCase())}
                                    data-testid="input-quick-email"
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={isSavingQuickEmail || !quickEmailInput || !quickEmailInput.includes('@')}
                                    className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    data-testid="button-save-quick-email"
                                    onClick={async () => {
                                        setIsSavingQuickEmail(true);
                                        try {
                                            const table = emailMissingAlert.type === 'client' ? 'clients' : 'providers';
                                            const field = emailMissingAlert.type === 'client' ? 'operational_email' : 'os_email';
                                            await supabase.from(table).update({ [field]: quickEmailInput, email: quickEmailInput }).eq('id', emailMissingAlert.entityId);
                                            showNotification('Sucesso', `E-mail ${quickEmailInput} salvo com sucesso!`, 'success');
                                            setEmailMissingAlert(null);
                                            setQuickEmailInput('');
                                        } catch (err: any) {
                                            alert('Erro ao salvar e-mail: ' + err.message);
                                        } finally {
                                            setIsSavingQuickEmail(false);
                                        }
                                    }}
                                >
                                    {isSavingQuickEmail ? 'Salvando...' : 'Salvar E-mail e Continuar'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setEmailMissingAlert(null); setQuickEmailInput(''); }}
                                    className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs uppercase hover:bg-gray-200 transition-all"
                                    data-testid="button-cancel-quick-email"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
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
                <form onSubmit={handleUpdateSubmit} className="p-6 space-y-6 flex-1 overflow-y-auto scrollbar-thin" ref={dropdownRef}>
                    
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
                                    <input type="checkbox" className="hidden" checked={editData.isSameOs} onChange={e => setEditData({...editData, isSameOs: e.target.checked, parentMissionId: e.target.checked ? editData.parentMissionId : ''})} />
                                    <Layers size={12}/> <span className="text-[9px] font-black uppercase tracking-widest">Mesma OS</span>
                                </label>
                            </div>
                        </div>
                        {editData.isSameOs && (
                            <div className="px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 mb-3">
                                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 block">Vincular à OS Mãe (Principal)</label>
                                <div className="relative">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input type="text" className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black"
                                                placeholder="Digite o nº da OS mãe (ex: GTM-1234)..."
                                                value={parentOsSearch || editData.parentMissionId}
                                                onChange={e => { setParentOsSearch(e.target.value); setShowParentOsDropdown(true); if (!e.target.value) setEditData(prev => ({...prev, parentMissionId: ''})); }}
                                                onFocus={() => setShowParentOsDropdown(true)}
                                                data-testid="input-parent-mission-update"
                                            />
                                        </div>
                                        {editData.parentMissionId && (
                                            <button type="button" onClick={() => { setEditData(prev => ({...prev, parentMissionId: ''})); setParentOsSearch(''); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><X size={16}/></button>
                                        )}
                                    </div>
                                    {editData.parentMissionId && (
                                        <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                                            <Layers size={12} className="text-blue-600" />
                                            <span className="text-[10px] font-black text-blue-700 uppercase">OS Mãe: {editData.parentMissionId}</span>
                                        </div>
                                    )}
                                    {showParentOsDropdown && (
                                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                            {parentOsSuggestions.filter(s => {
                                                if (!parentOsSearch) return true;
                                                const term = parentOsSearch.toLowerCase();
                                                return s.id.toLowerCase().includes(term) || s.client?.toLowerCase().includes(term) || s.provider?.toLowerCase().includes(term);
                                            }).map(s => (
                                                <button key={s.id} type="button" className={`w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 ${editData.parentMissionId === s.id ? 'bg-blue-50' : ''}`}
                                                    onClick={() => { setEditData(prev => ({...prev, parentMissionId: s.id})); setParentOsSearch(''); setShowParentOsDropdown(false); }}
                                                    data-testid={`option-parent-update-${s.id}`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-black text-gray-900">{s.id}</span>
                                                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${s.status === 'Concluída' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
                                                    </div>
                                                    <div className="text-[9px] text-gray-500 mt-0.5">{s.provider || 'Sem fornecedor'} • {s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}</div>
                                                </button>
                                            ))}
                                            {parentOsSearch && !parentOsSuggestions.find(s => s.id === parentOsSearch.toUpperCase()) && (
                                                <button type="button" className="w-full text-left px-3 py-2 hover:bg-blue-50 border-t border-gray-100 text-blue-700"
                                                    onClick={() => { setEditData(prev => ({...prev, parentMissionId: parentOsSearch.toUpperCase()})); setParentOsSearch(''); setShowParentOsDropdown(false); }}
                                                >
                                                    <div className="flex items-center gap-2"><Plus size={12}/><span className="text-xs font-bold">Usar "{parentOsSearch.toUpperCase()}" como OS Mãe</span></div>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {isCompletedMission && isBillingApproved && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl mb-3" data-testid="billing-approved-lock">
                                <ShieldCheck size={16} className="text-blue-600" />
                                <span className="text-[10px] font-black text-blue-700 uppercase">OS aprovada pela Diretoria — status bloqueado</span>
                            </div>
                        )}
                        {isCompletedMission && !isBillingApproved && canRevertStatus && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl mb-3" data-testid="revert-status-info">
                                <AlertTriangle size={16} className="text-amber-600" />
                                <span className="text-[10px] font-black text-amber-700 uppercase">OS Concluída — você pode reverter para Em Viagem</span>
                            </div>
                        )}
                        {isCompletedMission && !isBillingApproved && !canRevertStatus && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl mb-3" data-testid="no-revert-permission">
                                <ShieldAlert size={16} className="text-gray-500" />
                                <span className="text-[10px] font-black text-gray-500 uppercase">OS Concluída — seu perfil não permite alterar o status</span>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2 pb-4 border-b border-gray-100">
                            {operationalStatuses.map(s => {
                                const isDisabled = isCompletedMission && isBillingApproved ? true
                                    : isCompletedMission && !canRevertStatus ? true
                                    : isCompletedMission && canRevertStatus && s !== MissionStatus.IN_TRANSIT && s !== MissionStatus.COMPLETED ? true
                                    : false;
                                return (
                                    <button key={s} type="button" onClick={() => !isDisabled && setEditData({...editData, status: s})} disabled={isDisabled} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${editData.status === s ? 'bg-red-600 text-white border-red-600 shadow-md scale-105' : isDisabled ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed opacity-50' : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300'}`}>{s}</button>
                                );
                            })}
                        </div>
                        <div className="mt-4 flex flex-wrap items-end gap-6">
                            <div className="flex gap-2">
                                {restrictedStatuses.map(s => {
                                    const isDisabled = isCompletedMission && (isBillingApproved || !canRevertStatus);
                                    return (
                                        <button key={s} type="button" onClick={() => !isDisabled && setEditData({...editData, status: s})} disabled={isDisabled} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${editData.status === s ? 'bg-gray-900 text-white border-black shadow-md' : isDisabled ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed opacity-50' : 'bg-red-50 text-red-400 border-red-100 hover:bg-red-100'}`}>{s}</button>
                                    );
                                })}
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
                                                <button key={p.id} type="button" onClick={() => { 
                                                    const newStatus = (editData.status === MissionStatus.SOLICITED) ? MissionStatus.DOCUMENTATION : editData.status;
                                                    setEditData({...editData, provider: p.name, vehicleId: '', agent1: '', agent2: '', status: newStatus}); 
                                                    setSearchTerm(p.name); setSearchVehicle(''); setActiveDropdown(null); 
                                                }} className={DROPDOWN_ITEM_CLASS}>
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
                                    <input type="text" className={`${INPUT_CLASS} ${blockedAgent1 ? '!border-red-500 !bg-red-50 !text-red-700' : ''}`} placeholder={editData.provider ? "Nome..." : "Aguardando Fornecedor..."} value={searchAgent1} onChange={e => setSearchAgent1(e.target.value)} onFocus={() => editData.provider && setActiveDropdown('agent1')} disabled={!editData.provider} />
                                    {blockedAgent1 ? <ShieldAlert size={14} className="absolute right-3 top-3 text-red-500" /> : <UserCheck size={14} className="absolute right-3 top-3 text-gray-300" />}
                                    {activeDropdown === 'agent1' && editData.provider && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {filteredAgents.map(a => {
                                                const isBlocked = a.status !== 'Ativo';
                                                const isAcaoTrab = a.status === 'Bloqueado / Ação Trabalhista';
                                                return (
                                                    <button key={a.id} type="button" disabled={isBlocked} onClick={() => { if (!isBlocked) { setEditData({...editData, agent1: a.name}); setSearchAgent1(a.name); setActiveDropdown(null); }}} className={`${DROPDOWN_ITEM_CLASS} ${isBlocked ? '!opacity-100 !cursor-not-allowed !bg-red-50' : ''}`}>
                                                        <div className="flex flex-col items-start">
                                                            <span className={isBlocked ? 'text-red-400 line-through' : ''}>{a.name}</span>
                                                            {isAcaoTrab && <span className="text-[8px] font-black text-red-600 uppercase animate-pulse">⛔ AÇÃO TRABALHISTA — BLOQUEADO</span>}
                                                            {isBlocked && !isAcaoTrab && <span className="text-[8px] font-bold text-red-400 uppercase">BLOQUEADO</span>}
                                                        </div>
                                                        {isBlocked ? <span className="bg-red-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><ShieldAlert size={10} /> BLOQUEADO</span> : <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <button type="button" disabled={!editData.provider} onClick={() => setQuickModal('agent')} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all border border-gray-200 disabled:opacity-50"><Plus size={18}/></button>
                            </div>
                            {blockedAgent1 && (
                                <div className={`mt-1.5 flex items-center gap-1.5 px-3 py-2 rounded-lg ${blockedAgent1.status === 'Bloqueado / Ação Trabalhista' ? 'animate-blocked-flash-3d text-white' : 'bg-red-100 border border-red-300'}`}>
                                    <ShieldAlert size={12} className={`flex-shrink-0 ${blockedAgent1.status === 'Bloqueado / Ação Trabalhista' ? 'text-white' : 'text-red-600'}`} />
                                    <span className={`text-[10px] font-black uppercase ${blockedAgent1.status === 'Bloqueado / Ação Trabalhista' ? 'text-white drop-shadow-lg' : 'text-red-700'}`}>⛔ AGENTE BLOQUEADO — Status: {blockedAgent1.status}. Não é permitido escalar este agente.</span>
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <label className={LABEL_CLASS}>Agente 2 (Auxiliar)</label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <input type="text" className={`${INPUT_CLASS} ${blockedAgent2 ? '!border-red-500 !bg-red-50 !text-red-700' : ''}`} placeholder={editData.provider ? "Nome..." : "Aguardando Fornecedor..."} value={searchAgent2} onChange={e => setSearchAgent2(e.target.value)} onFocus={() => editData.provider && setActiveDropdown('agent2')} disabled={!editData.provider} />
                                    {blockedAgent2 ? <ShieldAlert size={14} className="absolute right-3 top-3 text-red-500" /> : <UserCheck size={14} className="absolute right-3 top-3 text-gray-300" />}
                                    {activeDropdown === 'agent2' && editData.provider && (
                                        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                            {filteredAgents.map(a => {
                                                const isBlocked = a.status !== 'Ativo';
                                                const isAcaoTrab = a.status === 'Bloqueado / Ação Trabalhista';
                                                return (
                                                    <button key={a.id} type="button" disabled={isBlocked} onClick={() => { if (!isBlocked) { setEditData({...editData, agent2: a.name}); setSearchAgent2(a.name); setActiveDropdown(null); }}} className={`${DROPDOWN_ITEM_CLASS} ${isBlocked ? '!opacity-100 !cursor-not-allowed !bg-red-50' : ''}`}>
                                                        <div className="flex flex-col items-start">
                                                            <span className={isBlocked ? 'text-red-400 line-through' : ''}>{a.name}</span>
                                                            {isAcaoTrab && <span className="text-[8px] font-black text-red-600 uppercase animate-pulse">⛔ AÇÃO TRABALHISTA — BLOQUEADO</span>}
                                                            {isBlocked && !isAcaoTrab && <span className="text-[8px] font-bold text-red-400 uppercase">BLOQUEADO</span>}
                                                        </div>
                                                        {isBlocked ? <span className="bg-red-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><ShieldAlert size={10} /> BLOQUEADO</span> : <span className="bg-green-600 text-white px-2 py-1 rounded-[6px] text-[8px] font-black flex items-center gap-1 shadow-sm"><Check size={10} /> SELECIONAR</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <button type="button" disabled={!editData.provider} onClick={() => setQuickModal('agent')} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all border border-gray-200 disabled:opacity-50"><Plus size={18}/></button>
                            </div>
                            {blockedAgent2 && (
                                <div className={`mt-1.5 flex items-center gap-1.5 px-3 py-2 rounded-lg ${blockedAgent2.status === 'Bloqueado / Ação Trabalhista' ? 'animate-blocked-flash-3d text-white' : 'bg-red-100 border border-red-300'}`}>
                                    <ShieldAlert size={12} className={`flex-shrink-0 ${blockedAgent2.status === 'Bloqueado / Ação Trabalhista' ? 'text-white' : 'text-red-600'}`} />
                                    <span className={`text-[10px] font-black uppercase ${blockedAgent2.status === 'Bloqueado / Ação Trabalhista' ? 'text-white drop-shadow-lg' : 'text-red-700'}`}>⛔ AGENTE BLOQUEADO — Status: {blockedAgent2.status}. Não é permitido escalar este agente.</span>
                                </div>
                            )}
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
                                          {missionTotals.traveled > 0 && missionTotals.plannedKm > 0 && (
                                              <span className="bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded text-[8px] border border-emerald-500/30 font-mono">
                                                  {missionTotals.traveled.toFixed(1)} / {missionTotals.plannedKm.toFixed(1)} KM
                                              </span>
                                          )}
                                          {missionTotals.plannedKm > 0 && missionTotals.traveled > 0 && missionTotals.traveled > missionTotals.plannedKm * 5 && editData.status !== MissionStatus.COMPLETED ? (
                                              <span className="bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded text-[8px] border border-amber-500/30 animate-pulse flex items-center gap-1"><AlertTriangle size={8}/> HODÔMETRO INCONSISTENTE ({(missionTotals.traveled / missionTotals.plannedKm).toFixed(1)}x)</span>
                                          ) : (
                                              <span className="bg-red-600/20 text-red-500 px-2 py-0.5 rounded text-[8px] border border-red-500/30 animate-pulse flex items-center gap-1"><Zap size={8}/> CÁLCULO AUTOMÁTICO</span>
                                          )}
                                      </h4>
                                  </div>
                              </div>
                              <div className="relative w-full h-3 bg-slate-800 rounded-full overflow-hidden shadow-inner border border-white/5">
                                  <div 
                                      className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-1000 shadow-[0_0_15px_rgba(220,38,38,0.3)]" 
                                      style={{ width: `${Math.min(100, editData.manualProgress)}%` }}
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
