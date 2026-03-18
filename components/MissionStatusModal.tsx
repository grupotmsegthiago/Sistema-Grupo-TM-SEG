
import React, { useState, useEffect, useMemo } from 'react';
import { Mission, MissionLog, MissionStatus } from '../types';
import { useLoadScript, GoogleMap, DirectionsRenderer, Marker } from '@react-google-maps/api';
import { googleMapsLoadConfig } from '../lib/maps';
import { extractCoordinates } from '../lib/utils';
// Added AlertTriangle to the imports below
import { X, MapPin, Flag, Truck, User, Phone, Briefcase, Car, Shield, BarChart3, Navigation, ExternalLink, Edit, Package, Loader2, Target, CheckCircle2, Activity, AlertTriangle } from 'lucide-react';

declare const google: any;

const mapContainerStyle = { width: '100%', height: '100%' };
const mapOptions = { 
  disableDefaultUI: true, 
  zoomControl: true, 
  mapTypeControl: false, 
  streetViewControl: false,
  styles: [
    { elementType: "geometry", stylers: [{ color: "#ebe3cd" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#fdfcf8" }] }
  ]
};

// Fix: Defined the missing Props interface
interface Props {
  isOpen: boolean;
  onClose: () => void;
  mission: Mission | null;
  logs: MissionLog[];
  onOpenVehicleModal?: () => void;
  onOpenAgentModal?: () => void;
  refreshTrigger?: any;
  onUpdate?: () => void;
  hideProviderInfo?: boolean;
}

const MissionStatusModal: React.FC<Props> = ({ 
  isOpen, onClose, mission, logs, onOpenVehicleModal, onOpenAgentModal, refreshTrigger, onUpdate, hideProviderInfo = false
}) => {
  const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);
  
  const [directionsResponse, setDirectionsResponse] = useState<any>(null);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: -14.235, lng: -51.9253 }); 
  const [isClientUser, setIsClientUser] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            if (user.clientId || (user.permissions && user.permissions.some((p: string) => p.startsWith('client_view:')))) {
                setIsClientUser(true);
            }
        } catch (e) { console.error(e); }
    }

    if (isOpen && mission) {
      if (isLoaded) {
          const coords = extractCoordinates(mission.mapLink || '');
          setCurrentPosition(coords);

          try {
              const directionsService = new google.maps.DirectionsService();
              directionsService.route(
                { 
                  origin: mission.origin, 
                  destination: mission.destination, 
                  travelMode: google.maps.TravelMode.DRIVING 
                },
                (result: any, status: any) => {
                  if (status === google.maps.DirectionsStatus.OK) {
                    setDirectionsResponse(result);
                    if (coords) {
                        setMapCenter(coords);
                    } else if (result?.routes[0]?.legs[0]?.start_location) {
                         const startLoc = result.routes[0].legs[0].start_location;
                         setMapCenter({ lat: startLoc.lat(), lng: startLoc.lng() });
                    }
                  }
                }
              );
          } catch (error) { console.error(error); }
      }
    }
  }, [isOpen, isLoaded, mission, refreshTrigger]);

  const locationParsed = useMemo(() => {
    if (!mission?.currentLocation) return { fullAddress: 'AGUARDANDO ATUALIZAÇÃO', status: '' };
    const raw = mission.currentLocation;
    if (raw.includes('Solicitação Criada') || raw.includes('AUTO CARGA BLOQUEADO')) {
        return { fullAddress: 'AGUARDANDO INÍCIO', status: '' };
    }

    const parts = raw.split('|').map(p => p.trim());
    let status = parts.length > 1 ? parts[0] : '';
    let fullAddr = parts.length > 1 ? parts[1] : parts[0];

    return { 
        fullAddress: fullAddr.toUpperCase().replace(/^,\s*/, ''), 
        status: status.toUpperCase() 
    };
  }, [mission?.currentLocation]);

  if (!isOpen || !mission) return null;

  const ALL_STATUSES = [MissionStatus.SOLICITED, MissionStatus.DOCUMENTATION, MissionStatus.SCHEDULED, MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT, MissionStatus.COMPLETED];
  const currentStatusIndex = ALL_STATUSES.indexOf(mission.status);
  const progress = mission.progress || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in p-4">
      <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[95vh] border border-gray-700/50 overflow-hidden">
        <header className="bg-gray-800 text-white p-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-red-600 rounded-xl shadow-lg shadow-red-900/20"><BarChart3 size={24} className="text-white" /></div>
            <div>
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold">Status da Missão</h2>
                    <div className="bg-white/10 px-2 py-0.5 rounded border border-white/10 text-[10px] font-black uppercase tracking-widest">{mission.id}</div>
                    <div className="flex items-center gap-1.5 bg-green-500/20 text-green-400 px-3 py-1 rounded-full border border-green-500/30 text-xs font-black">
                        <Target size={12}/> {progress}% CONCLUÍDO
                    </div>
                </div>
                {mission.special_operation_type === 'LOGITECH' && (
                    <div className="mt-1 flex items-center gap-2 text-[9px] text-blue-400 font-bold uppercase tracking-widest">
                        <Package size={10} /> Operação Especial Logitech
                    </div>
                )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors"><X size={24} /></button>
        </header>

        <div className="flex-1 p-4 grid grid-cols-12 gap-4 overflow-hidden">
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Etapas da Missão</span>
                    <div className="w-1/2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-600 transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    {ALL_STATUSES.map((status, index) => (
                        <React.Fragment key={status}>
                            <div className="flex flex-col items-center text-center relative group">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shadow-sm ${index < currentStatusIndex ? 'bg-green-600 border-green-700 text-white' : index === currentStatusIndex ? 'bg-blue-600 border-blue-700 text-white ring-4 ring-blue-500/20 animate-pulse' : 'bg-gray-50 border-gray-200 text-gray-300'}`}>
                                    {index < currentStatusIndex ? <CheckCircle2 size={16} /> : index + 1}
                                </div>
                                <p className={`text-[9px] font-black mt-2 uppercase tracking-tighter w-16 leading-tight ${index <= currentStatusIndex ? 'text-gray-900' : 'text-gray-300'}`}>{status}</p>
                            </div>
                            {index < ALL_STATUSES.length - 1 && (<div className={`flex-1 h-0.5 mx-1 rounded-full ${index < currentStatusIndex ? 'bg-green-600' : 'bg-gray-100'}`}></div>)}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            <div className="bg-white flex-1 rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-1 relative min-h-[350px]">
              {isLoaded ? (
                <GoogleMap 
                    mapContainerStyle={mapContainerStyle} 
                    center={mapCenter} 
                    zoom={10} 
                    options={mapOptions}
                >
                    {directionsResponse && (
                        <DirectionsRenderer 
                            directions={directionsResponse} 
                            options={{
                                suppressMarkers: true,
                                polylineOptions: {
                                    strokeColor: '#b91c1c',
                                    strokeOpacity: 0.8,
                                    strokeWeight: 6
                                }
                            }} 
                        />
                    )}
                    
                    {directionsResponse?.routes[0]?.legs[0]?.start_location && (
                        <Marker 
                            position={directionsResponse.routes[0].legs[0].start_location}
                            label={{ text: "A", color: "white", fontWeight: "bold" }}
                            title="Ponto A (Origem)"
                            icon={{
                                url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
                            }}
                        />
                    )}

                    {currentPosition && (
                        <Marker 
                            position={currentPosition} 
                            label={{ text: "B", color: "white", fontWeight: "bold" }}
                            title="Ponto B (Localização Atual)"
                            icon={{
                                url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                                scaledSize: new google.maps.Size(42, 42)
                            }}
                            zIndex={1000}
                        />
                    )}

                    {directionsResponse?.routes[0]?.legs[0]?.end_location && (
                        <Marker 
                            position={directionsResponse.routes[0].legs[0].end_location}
                            label={{ text: "C", color: "white", fontWeight: "bold" }}
                            title="Ponto C (Destino)"
                            icon={{
                                url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
                            }}
                        />
                    )}
                </GoogleMap>
              ) : (
                <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-400 gap-3">
                    {loadError ? (
                        <div className="text-center p-4">
                            <AlertTriangle size={32} className="text-red-500 mx-auto mb-2" />
                            <p className="text-xs font-bold uppercase text-red-600">Erro ao carregar Google Maps</p>
                        </div>
                    ) : (
                        <>
                            <Loader2 size={32} className="animate-spin" />
                            <p className="text-xs font-black uppercase tracking-widest">Iniciando Geoprocessamento...</p>
                        </>
                    )}
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 overflow-y-auto pr-2 scrollbar-thin">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5"><Navigation size={60} /></div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-5">Trajeto Operacional</h4>
                <div className="space-y-4 relative pl-2">
                    <div className="absolute left-[9px] top-[14px] bottom-[14px] w-0.5 border-l-2 border-dashed border-gray-200 z-0"></div>
                    
                    <div className="relative flex items-start gap-4 z-10">
                        <div className="w-4 h-4 rounded-full bg-green-600 shadow-md flex items-center justify-center ring-4 ring-white shrink-0 mt-1">
                            <MapPin size={8} className="text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Ponto A (Origem)</span>
                            <span className="text-[11px] font-bold text-gray-900 uppercase leading-tight block" title={mission.origin}>{mission.origin || '---'}</span>
                        </div>
                    </div>

                    <div className="relative flex items-start gap-4 z-10">
                        <div className="w-4 h-4 rounded-full bg-blue-600 shadow-md flex items-center justify-center ring-4 ring-white shrink-0 mt-1">
                            <Navigation size={8} className="text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Ponto B (Local Atual)</span>
                            <span className="text-[11px] font-black text-blue-700 uppercase leading-tight block" title={locationParsed.fullAddress}>
                                {locationParsed.fullAddress}
                            </span>
                            {locationParsed.status && (
                                <span className="inline-block mt-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                                    {locationParsed.status}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="relative flex items-start gap-4 z-10">
                        <div className="w-4 h-4 rounded-full bg-red-600 shadow-md flex items-center justify-center ring-4 ring-white shrink-0 mt-1">
                            <Flag size={8} className="text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Ponto C (Destino)</span>
                            <span className="text-[11px] font-bold text-gray-900 uppercase leading-tight block" title={mission.destination}>{mission.destination?.toUpperCase() || '---'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group/vehicle">
                <div className="flex justify-between items-center mb-3">
                    <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Veículo e Motorista</h4>
                    {onOpenVehicleModal && !isClientUser && (
                        <button onClick={onOpenVehicleModal} className="text-blue-600 hover:bg-blue-50 p-1 rounded transition-all opacity-0 group-hover/vehicle:opacity-100">
                            <Edit size={14} />
                        </button>
                    )}
                </div>
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-50 rounded-lg text-blue-600 border border-gray-100"><Truck size={16}/></div>
                        <div className="min-w-0">
                            <span className="text-[11px] font-black text-gray-900 uppercase block">{mission.clientVehicle?.plate || 'PLACA N/A'}</span>
                            <span className="text-[10px] text-gray-500 font-bold uppercase truncate block mt-1">{mission.clientVehicle?.model || 'MODELO N/D'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-50 rounded-lg text-green-600 border border-gray-100"><User size={16}/></div>
                        <div className="min-w-0">
                            <span className="text-[11px] font-bold text-gray-800 uppercase block truncate">{mission.driver_name || 'Não informado'}</span>
                            <div className="flex items-center gap-1 mt-0.5">
                                <Phone size={10} className="text-gray-400"/>
                                <span className="text-[10px] text-gray-500 font-mono">{mission.driver_phone || 'S/D'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group/agent">
                <div className="flex justify-between items-center mb-3">
                    <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Equipe de Escolta</h4>
                    {onOpenAgentModal && !isClientUser && (
                        <button onClick={onOpenAgentModal} className="text-blue-600 hover:bg-blue-50 p-1 rounded transition-all opacity-0 group-hover/agent:opacity-100">
                            <Edit size={14} />
                        </button>
                    )}
                </div>
                <div className="space-y-3">
                    {!hideProviderInfo && (
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 border border-indigo-100"><Briefcase size={16}/></div>
                        <span className="text-[11px] font-black text-gray-900 uppercase truncate">{mission.provider || 'N/A'}</span>
                    </div>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-600 border border-slate-100"><Car size={16}/></div>
                        <span className="text-[11px] font-mono font-black text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{mission.vehicleId || 'S/V'}</span>
                    </div>
                    <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg text-blue-600 border border-blue-100"><Shield size={16}/></div>
                            <span className="text-[11px] font-bold text-gray-700 uppercase">{mission.agent1 || 'AGENTE 01'}</span>
                        </div>
                        {mission.agent2 && mission.agent2 !== '---' && (
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 rounded-lg text-blue-600 border border-blue-100"><Shield size={16}/></div>
                                <span className="text-[11px] font-bold text-gray-700 uppercase">{mission.agent2}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex-1 flex flex-col min-h-0">
                <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-4">Histórico de Eventos</h4>
                <ul className="space-y-5 overflow-y-auto pr-2 scrollbar-thin flex-1">
                    {logs.length > 0 ? logs.map((log, idx) => (
                        <li key={log.id} className="flex gap-4 relative">
                            {idx < logs.length - 1 && <div className="absolute left-4 top-8 bottom-[-20px] w-px bg-gray-100"></div>}
                            <div className="flex flex-col items-center shrink-0">
                                <div className="bg-gray-100 p-2 rounded-full text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <Navigation size={14}/>
                                </div>
                            </div>
                            <div className="flex-1 pb-1">
                                <div className="flex justify-between items-baseline mb-1">
                                    <p className="text-[11px] font-black text-gray-800 uppercase leading-none">{log.updated_by}</p>
                                    <p className="text-[9px] text-gray-400 font-mono font-bold">{new Date(log.created_at).toLocaleString('pt-BR')}</p>
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed">{log.description}</p>
                                {log.map_link && (
                                    <a href={log.map_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase mt-2 bg-blue-50 px-2 py-1 rounded transition-colors border border-blue-100">
                                        <ExternalLink size={12}/> Ver no Mapa
                                    </a>
                                )}
                            </div>
                        </li>
                    )) : (
                        <li className="flex flex-col items-center justify-center py-10 text-center opacity-30">
                            <Activity size={32} className="mb-2"/>
                            <p className="text-[10px] font-black uppercase tracking-widest leading-tight">Sem eventos registrados<br/>para esta missão.</p>
                        </li>
                    )}
                </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissionStatusModal;
