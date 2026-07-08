import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, ShieldCheck, AlertTriangle, X } from 'lucide-react';
import {
  uploadEmployeeFacePhoto,
  validateFaceAgainstRegistered,
  validateFaceForRegistration,
} from '../lib/timeclock/faceAuth';
import type { TimeClockUserContext } from '../lib/timeclock/types';

type Mode = 'register' | 'verify';

interface Props {
  user: TimeClockUserContext;
  mode: Mode;
  onSuccess: (updatedUser: TimeClockUserContext) => void;
  onCancel?: () => void;
}

/** Cadastro ou validação facial unificada (login + ponto). */
const FaceAuthGate: React.FC<Props> = ({ user, mode, onSuccess, onCancel }) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setError('Câmera frontal necessária para acesso.');
      }
    };
    void start();
    return () => stopCamera();
  }, []);

  const capture = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const ctx = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx?.drawImage(videoRef.current, 0, 0);
    return canvasRef.current.toDataURL('image/jpeg', 0.9).split(',')[1] || null;
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const b64 = capture();
      if (!b64) throw new Error('Falha ao capturar selfie.');

      if (mode === 'register') {
        if (!user.employeeId) throw new Error('Funcionário RH não vinculado ao login.');
        await validateFaceForRegistration(b64);
        const url = await uploadEmployeeFacePhoto(user.employeeId, b64);
        const updated = { ...user, facePhotoUrl: url, faceRegisteredAt: new Date().toISOString() };
        localStorage.setItem('userData', JSON.stringify(updated));
        onSuccess(updated);
      } else {
        if (!user.facePhotoUrl) throw new Error('Cadastro facial não encontrado.');
        await validateFaceAgainstRegistered(user.facePhotoUrl, b64);
        onSuccess(user);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na validação facial.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black uppercase text-white tracking-wider">
            {mode === 'register' ? 'Cadastro facial obrigatório' : 'Validação facial'}
          </h2>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-slate-400 hover:text-white">
              <X size={18} />
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {mode === 'register'
            ? 'Cadastre seu rosto uma única vez. Será usado no login e nas batidas de ponto.'
            : 'Confirme sua identidade para acessar o sistema.'}
        </p>
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black mb-4">
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover scale-x-[-1]" />
        </div>
        <canvas ref={canvasRef} className="hidden" />
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-950/50 border border-red-500/30 p-3 text-xs text-red-300">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleSubmit()}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-black uppercase text-white disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera size={16} />}
          {mode === 'register' ? 'Cadastrar rosto' : 'Validar e entrar'}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-slate-500">
          <ShieldCheck size={12} /> Sem óculos escuros ou boné
        </p>
      </div>
    </div>
  );
};

export default FaceAuthGate;
