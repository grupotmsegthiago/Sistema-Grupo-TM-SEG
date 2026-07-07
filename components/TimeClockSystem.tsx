
import React, { useState, useRef, useEffect } from 'react';
import { generateContent } from '../lib/gemini';
import { Camera, MapPin, Clock, Fingerprint, Loader2, ShieldCheck, AlertTriangle, CheckCircle2, History, Smartphone, Coffee, LogOut, ArrowRight, UserCheck } from 'lucide-react';
import { formatNowTimeBR, formatTimeBR, formatDateBR } from '../lib/dateUtils';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { useNotification } from '../lib/NotificationContext';

type Stage = 'IN' | 'BREAK_START' | 'BREAK_END' | 'OUT';

interface Props {
  gateMode?: boolean;
  forcedStage?: Stage;
  gateTitle?: string;
  onPunchComplete?: () => void;
}

const TimeClockSystem: React.FC<Props> = ({ gateMode = false, forcedStage, gateTitle, onPunchComplete }) => {
    const { showNotification } = useNotification();
    const [isProcessing, setIsProcessing] = useState(false);
    const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [currentStage, setCurrentStage] = useState<Stage>('IN');
    const [currentUser, setCurrentUser] = useState<any>(null);
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const stored = localStorage.getItem('userData');
        if (stored) setCurrentUser(JSON.parse(stored));
        startCamera();
        getGeolocation();
        fetchTodayCycle();
    }, []);

    useEffect(() => {
        if (forcedStage) setCurrentStage(forcedStage);
    }, [forcedStage]);

    useRealtimeRefresh('time_clock', () => fetchTodayCycle());

    // ALERTA DE ALMOÇO (5h e 6h)
    useEffect(() => {
        if (history.length > 0 && currentStage === 'BREAK_START') {
            const entry = history.find(h => h.type === 'IN');
            if (entry) {
                const checkInterval = setInterval(() => {
                    const diffMs = new Date().getTime() - new Date(entry.timestamp).getTime();
                    const diffHrs = diffMs / (1000 * 60 * 60);

                    if (diffHrs >= 5 && diffHrs < 5.02) {
                        showNotification('ALERTA RH', 'Você completou 5 horas de trabalho. Lembre-se de sair para o almoço em breve.', 'warning');
                    }
                    if (diffHrs >= 6 && diffHrs < 6.02) {
                        showNotification('AVISO CRÍTICO', '6 HORAS DE TRABALHO ATINGIDAS. A pausa para almoço é obrigatória agora.', 'error');
                    }
                }, 60000);
                return () => clearInterval(checkInterval);
            }
        }
    }, [history, currentStage]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err) { showNotification('Erro', 'Acesso à câmera negado.', 'error'); }
    };

    const getGeolocation = () => {
        navigator.geolocation.getCurrentPosition((pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }));
    };

    const fetchTodayCycle = async () => {
        const user = JSON.parse(localStorage.getItem('userData') || '{}');
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase.from('time_clock').select('*').eq('user_id', user.id).gte('timestamp', `${today}T00:00:00`).order('timestamp', { ascending: true });
        
        if (data) {
            setHistory(data);
            let stage: Stage = 'IN';
            if (data.length === 0) stage = 'IN';
            else if (!data.some((h) => h.type === 'IN')) stage = 'IN';
            else if (!data.some((h) => h.type === 'BREAK_START')) stage = 'BREAK_START';
            else if (!data.some((h) => h.type === 'BREAK_END')) stage = 'BREAK_END';
            else if (!data.some((h) => h.type === 'OUT')) stage = 'OUT';
            else stage = 'OUT';
            setCurrentStage(forcedStage || stage);
        }
    };

    const handleClockAction = async () => {
        if (!location || !videoRef.current || !canvasRef.current) {
            showNotification('Aguarde', 'Aguardando GPS estável...', 'warning');
            getGeolocation();
            return;
        }

        setIsProcessing(true);
        try {
            const context = canvasRef.current.getContext('2d');
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context?.drawImage(videoRef.current, 0, 0);
            const photoBase64 = canvasRef.current.toDataURL('image/jpeg').split(',')[1];

            const prompt = "Valide se o rosto está claro e se a pessoa está SEM óculos e SEM boné. Responda apenas VALID ou o motivo do erro.";
            const resultText = await generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: photoBase64 } }, { text: prompt }] }
            });

            if (!resultText.toUpperCase().includes('VALID')) {
                throw new Error('Falha na Biometria: Remova óculos/boné e garanta boa luz.');
            }

            const punchType = forcedStage || currentStage;
            const { error } = await supabase.from('time_clock').insert([{
                user_id: currentUser.id,
                user_name: currentUser.name,
                type: punchType,
                timestamp: new Date().toISOString(),
                latitude: location.lat,
                longitude: location.lng,
                photo_url: `data:image/jpeg;base64,${photoBase64}`,
                ai_verification: true,
                metadata: { stage: punchType, device: gateMode ? 'gate' : 'mobile' }
            }]);

            if (error) throw error;

            showNotification('Sucesso', `Registro de ${punchType} efetuado com sucesso!`, 'success');
            await fetchTodayCycle();
            onPunchComplete?.();
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro desconhecido';
            showNotification('Erro', msg, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const stageForButton = forcedStage || currentStage;
    const stageInfo = (() => {
        switch (stageForButton) {
            case 'IN': return { label: 'Entrada de Turno', icon: UserCheck, color: 'bg-green-600' };
            case 'BREAK_START': return { label: 'Saída Almoço', icon: Coffee, color: 'bg-orange-500' };
            case 'BREAK_END': return { label: 'Retorno Almoço', icon: ArrowRight, color: 'bg-blue-600' };
            case 'OUT': return { label: 'Fim de Expediente', icon: LogOut, color: 'bg-red-600' };
        }
    })();
    const alreadyDone = history.some((h) => h.type === stageForButton);

    return (
        <div className={`max-w-4xl mx-auto space-y-6 pb-20 ${gateMode ? 'p-2' : 'p-4'}`}>
            {!gateMode && (
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-700 text-white rounded-2xl shadow-lg animate-pulse"><Fingerprint size={28} /></div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 uppercase">Jornada de Trabalho</h2>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest flex items-center gap-2">
                           <ShieldCheck size={14} className="text-green-600" /> Biometria Facial Ativa (RH v2.0)
                        </p>
                    </div>
                </div>
                <div className="bg-slate-900 px-6 py-2 rounded-xl text-center">
                    <p className="text-[9px] text-gray-500 font-bold uppercase">Hora Local</p>
                    <p className="text-xl font-black text-white font-mono">{formatNowTimeBR()}</p>
                </div>
            </div>
            )}
            {gateMode && gateTitle && (
              <p className="text-center text-xs font-bold text-slate-500 uppercase tracking-widest px-4">{gateTitle}</p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-4">
                    <div className="relative aspect-[4/5] bg-black rounded-[3rem] border-4 border-white shadow-2xl overflow-hidden group">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                        <canvas ref={canvasRef} className="hidden" />
                        
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                            <div className="w-64 h-80 border-2 border-red-500/20 rounded-[100px] relative">
                                <div className="absolute top-0 left-0 w-full h-1 bg-red-500/50 shadow-[0_0_15px_red] animate-scan rounded-full"></div>
                            </div>
                        </div>

                        {isProcessing && (
                            <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center">
                                <Loader2 size={48} className="animate-spin text-red-600 mb-4" />
                                <h3 className="text-white font-black uppercase tracking-widest text-sm">Registrando Batida...</h3>
                            </div>
                        )}

                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full px-8">
                            <button 
                                onClick={handleClockAction}
                                disabled={isProcessing || alreadyDone || (history.some((h) => h.type === 'OUT'))}
                                className={`w-full py-5 rounded-[2rem] ${stageInfo.color} text-white font-black uppercase text-sm shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 border-b-4 border-black/20`}
                            >
                                <stageInfo.icon size={20} /> {alreadyDone ? 'Já registrado' : history.some((h) => h.type === 'OUT') ? 'Jornada Concluída' : `Registrar ${stageInfo.label}`}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-5 flex flex-col gap-4">
                    <div className="bg-white rounded-[2.5rem] border border-gray-200 shadow-sm flex-1 overflow-hidden flex flex-col">
                        <div className="p-5 bg-gray-900 text-white flex justify-between items-center">
                            <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><History size={14} className="text-red-500"/> Ciclo de Hoje</h3>
                            <span className="text-[10px] font-bold text-gray-400">{formatDateBR(new Date())}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
                            {['IN', 'BREAK_START', 'BREAK_END', 'OUT'].map((type, idx) => {
                                const entry = history.find(h => h.type === type);
                                return (
                                    <div key={idx} className={`p-4 rounded-2xl border transition-all ${entry ? 'bg-white border-green-200' : 'bg-gray-100/50 border-gray-200 opacity-50'}`}>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${entry ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                                                    {type === 'IN' ? <UserCheck size={16}/> : type === 'OUT' ? <LogOut size={16}/> : <Coffee size={16}/>}
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase text-gray-400 tracking-tight">
                                                        {type === 'IN' ? 'Entrada' : type === 'OUT' ? 'Saída Turno' : type === 'BREAK_START' ? 'S. Almoço' : 'R. Almoço'}
                                                    </p>
                                                    <p className="text-sm font-black text-gray-900">{entry ? formatTimeBR(entry.timestamp, '--:--') : '--:--'}</p>
                                                </div>
                                            </div>
                                            {entry && <img src={entry.photo_url} className="w-10 h-10 rounded-lg object-cover border-2 border-white shadow-sm" />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                @keyframes scan { 
                    0% { top: 10%; opacity: 0; } 50% { opacity: 1; } 100% { top: 90%; opacity: 0; }
                }
                .animate-scan { animation: scan 3s infinite linear; }
            `}</style>
        </div>
    );
};

export default TimeClockSystem;
