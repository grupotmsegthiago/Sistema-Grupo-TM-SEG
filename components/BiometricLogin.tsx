
import React, { useState, useRef, useEffect } from 'react';
import { generateContent } from '../lib/gemini';
import { Camera, MapPin, Loader2, ShieldCheck, AlertTriangle, X, Smartphone, UserCheck, Eye, Sun, Wind } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
    user: any;
    onVerified: () => void;
    onCancel: () => void;
}

const BiometricLogin: React.FC<Props> = ({ user, onVerified, onCancel }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
    const [error, setError] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        startCamera();
        getGeolocation();
    }, []);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err) { setError('Câmera frontal necessária para acesso.'); }
    };

    const getGeolocation = () => {
        navigator.geolocation.getCurrentPosition(
            (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => setError('GPS obrigatório para este perfil.')
        );
    };

    const handleVerify = async () => {
        if (!location || !videoRef.current || !canvasRef.current) return;
        setIsProcessing(true);
        setError('');

        try {
            const context = canvasRef.current.getContext('2d');
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context?.drawImage(videoRef.current, 0, 0);
            const photoBase64 = canvasRef.current.toDataURL('image/jpeg').split(',')[1];

            const prompt = `Analise esta foto de autenticação. 
            Regras Críticas:
            1. Existe um rosto humano claro?
            2. A pessoa está usando ÓCULOS (escuros ou grau)? Rejeite se sim.
            3. A pessoa está usando BONÉ ou CHAPÉU? Rejeite se sim.
            Responda apenas "VALID" se passar ou o motivo do erro (ERR_GLASSES, ERR_HAT, ERR_FACE).`;

            const resultText = await generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: photoBase64 } }, { text: prompt }] }
            });

            const result = resultText.trim().toUpperCase();

            if (result === 'VALID') {
                // Atualiza avatar se for primeiro acesso
                if (!user.avatar_url) {
                    await supabase.from('system_users').update({ avatar_url: `data:image/jpeg;base64,${photoBase64}` }).eq('id', user.id);
                }
                onVerified();
            } else {
                if (result.includes('GLASSES')) throw new Error('Remova os óculos para validação.');
                if (result.includes('HAT')) throw new Error('Remova o boné/chapéu para validação.');
                throw new Error('Rosto não identificado corretamente.');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center p-6 text-white font-sans">
            <div className="w-full max-w-sm space-y-8">
                <div className="text-center">
                    <ShieldCheck size={48} className="text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-black uppercase tracking-widest">Biometria Facial</h2>
                    <p className="text-xs text-gray-500 mt-2">Posicione seu rosto sem óculos ou boné</p>
                </div>

                <div className="relative aspect-[3/4] bg-gray-900 rounded-[2rem] border-4 border-white/10 overflow-hidden shadow-2xl">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute inset-0 border-[30px] border-black/20 flex items-center justify-center">
                        <div className="w-64 h-80 border-2 border-red-500/30 rounded-full animate-pulse"></div>
                    </div>
                    {isProcessing && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center">
                            <Loader2 size={48} className="animate-spin text-red-600 mb-4" />
                            <span className="text-xs font-black uppercase">Verificando...</span>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                   <div className="space-y-1 opacity-60"><Eye size={20} className="mx-auto"/><span className="text-[8px] font-bold">SEM ÓCULOS</span></div>
                   <div className="space-y-1 opacity-60"><Wind size={20} className="mx-auto"/><span className="text-[8px] font-bold">SEM BONÉ</span></div>
                   <div className="space-y-1 opacity-60"><Sun size={20} className="mx-auto"/><span className="text-[8px] font-bold">BOA LUZ</span></div>
                </div>

                {error && <div className="bg-red-500/20 border border-red-500/50 p-4 rounded-xl text-xs text-red-200 flex items-center gap-2"><AlertTriangle size={16}/> {error}</div>}

                <div className="flex gap-4">
                    <button onClick={onCancel} className="flex-1 py-4 border border-white/10 rounded-2xl font-bold text-xs uppercase">Cancelar</button>
                    <button onClick={handleVerify} disabled={isProcessing || !location} className="flex-[2] py-4 bg-red-700 text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 disabled:opacity-50">Confirmar Identidade</button>
                </div>
            </div>
        </div>
    );
};

export default BiometricLogin;
