import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Camera,
  PenLine,
  Loader2,
  Fingerprint,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import SignaturePad from './SignaturePad';
import { useNotification } from '../lib/NotificationContext';
import { formatNowTimeBR } from '../lib/dateUtils';
import {
  TIME_CLOCK_STAGE_LABELS,
  TIME_CLOCK_STAGE_ORDER,
  getNextTimeClockStage,
  getTimeClockEntryForStage,
} from '../lib/timeclock/stages';
import type { TimeClockEntry, TimeClockStage, TimeClockUserContext } from '../lib/timeclock/types';
import {
  enrichUserWithCltData,
  isCltUser,
  saveEmployeeDigitalSignature,
} from '../lib/timeclock/cltEmployee';
import {
  fetchTodayTimeClockEntries,
  registerTimeClockPunch,
} from '../lib/timeclock/registerPunch';

type Step = 'face' | 'signature' | 'processing';

interface Props {
  open: boolean;
  onClose: () => void;
  onRegistered?: () => void;
}

const TimeClockModal: React.FC<Props> = ({ open, onClose, onRegistered }) => {
  const { showNotification } = useNotification();
  const [step, setStep] = useState<Step>('face');
  const [user, setUser] = useState<TimeClockUserContext | null>(null);
  const [history, setHistory] = useState<TimeClockEntry[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [signatureDraft, setSignatureDraft] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const nextStage = getNextTimeClockStage(history);
  const journeyDone = nextStage === 'DONE';
  const currentStage = journeyDone ? 'OUT' : nextStage;

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const loadContext = async () => {
    try {
      const raw = JSON.parse(localStorage.getItem('userData') || '{}') as TimeClockUserContext;
      const enriched = await enrichUserWithCltData(raw);
      setUser(enriched);
      localStorage.setItem('userData', JSON.stringify(enriched));

      if (!isCltUser(enriched)) {
        setError('Seu usuário não está cadastrado como CLT no RH.');
        return;
      }

      const entries = await fetchTodayTimeClockEntries(enriched.id);
      setHistory(entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar dados do ponto.');
    }
  };

  useEffect(() => {
    if (!open) return;
    setStep('face');
    setError('');
    setSignatureDraft(null);
    setPhotoBase64(null);
    void loadContext();
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocation(null),
      { enableHighAccuracy: true, timeout: 15000 }
    );
    return () => stopCamera();
  }, [open]);

  useEffect(() => {
    if (!open || step !== 'face') {
      stopCamera();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setError('Permita o acesso à câmera frontal para bater o ponto.');
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, step]);

  const captureSelfie = async (): Promise<string> => {
    if (!videoRef.current || !canvasRef.current) {
      throw new Error('Câmera indisponível.');
    }
    const ctx = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx?.drawImage(videoRef.current, 0, 0);
    return canvasRef.current.toDataURL('image/jpeg', 0.85).split(',')[1];
  };

  const handleFaceContinue = async () => {
    if (!location) {
      setError('Aguardando localização GPS. Verifique se o GPS está ativo.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const captured = await captureSelfie();
      setPhotoBase64(captured);
      setStep('signature');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao capturar selfie.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (signatureUrl: string) => {
    if (!user || !location || journeyDone || currentStage === 'DONE' || !photoBase64) return;
    setLoading(true);
    setStep('processing');
    setError('');
    try {
      await registerTimeClockPunch({
        user,
        stage: currentStage as TimeClockStage,
        photoBase64,
        signatureUrl,
        latitude: location.lat,
        longitude: location.lng,
      });

      if (!user.digitalSignatureUrl && user.employeeId && signatureDraft) {
        const savedUrl = await saveEmployeeDigitalSignature(user.employeeId, signatureDraft);
        const updated = { ...user, digitalSignatureUrl: savedUrl };
        setUser(updated);
        localStorage.setItem('userData', JSON.stringify(updated));
      }

      showNotification('Ponto registrado', `${TIME_CLOCK_STAGE_LABELS[currentStage as TimeClockStage]} registrada.`, 'success');
      onRegistered?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao registrar ponto.';
      setError(msg);
      setStep('signature');
      showNotification('Erro no ponto', msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUseSavedSignature = async () => {
    if (!user?.digitalSignatureUrl) return;
    await handleRegister(user.digitalSignatureUrl);
  };

  const handleUseNewSignature = async () => {
    if (!signatureDraft) {
      setError('Desenhe sua assinatura ou use a assinatura salva.');
      return;
    }
    await handleRegister(signatureDraft);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg max-h-[95vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-200">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-700 text-white rounded-xl">
              <Fingerprint size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase text-gray-900">Bater ponto</h3>
              <p className="text-[10px] text-gray-500 font-bold">{formatNowTimeBR()}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {TIME_CLOCK_STAGE_ORDER.map((stage) => {
              const entry = getTimeClockEntryForStage(history, stage);
              const isNext = nextStage === stage;
              return (
                <div
                  key={stage}
                  className={`p-3 rounded-xl border text-[10px] font-black uppercase ${
                    entry
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : isNext
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <p>{TIME_CLOCK_STAGE_LABELS[stage]}</p>
                  <p className="text-sm font-mono mt-1">{entry ? new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</p>
                </div>
              );
            })}
          </div>

          {journeyDone ? (
            <div className="text-center py-8">
              <CheckCircle2 size={40} className="mx-auto text-green-600 mb-3" />
              <p className="font-black uppercase text-sm text-gray-800">Jornada de hoje concluída</p>
            </div>
          ) : step === 'face' ? (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-600">
                Próxima batida: <span className="text-red-700">{TIME_CLOCK_STAGE_LABELS[currentStage as TimeClockStage]}</span>
              </p>
              <div className="relative aspect-[3/4] bg-black rounded-2xl overflow-hidden">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <button
                type="button"
                disabled={loading || !location}
                onClick={() => void handleFaceContinue()}
                className="w-full py-4 rounded-2xl bg-red-700 text-white font-black uppercase text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
                Capturar selfie e continuar
              </button>
            </div>
          ) : step === 'signature' ? (
            <div className="space-y-4">
              <p className="text-xs font-bold text-gray-600 flex items-center gap-2">
                <PenLine size={14} /> Confirme com assinatura digital
              </p>

              {user?.digitalSignatureUrl ? (
                <div className="space-y-3">
                  <div className="border rounded-xl p-3 bg-gray-50">
                    <img src={user.digitalSignatureUrl} alt="Assinatura salva" className="h-20 mx-auto object-contain" />
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleUseSavedSignature()}
                    className="w-full py-4 rounded-2xl bg-slate-900 text-white font-black uppercase text-sm"
                  >
                    Assinar digitalmente
                  </button>
                  <details className="text-xs">
                    <summary className="font-bold text-gray-500 cursor-pointer">Atualizar assinatura</summary>
                    <div className="mt-3">
                      <SignaturePad onChange={setSignatureDraft} height={140} />
                      <button
                        type="button"
                        disabled={loading || !signatureDraft}
                        onClick={() => void handleUseNewSignature()}
                        className="mt-3 w-full py-3 rounded-xl bg-red-700 text-white font-black uppercase text-xs disabled:opacity-50"
                      >
                        Registrar com nova assinatura
                      </button>
                    </div>
                  </details>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] text-gray-500 font-medium">
                    Primeiro acesso: cadastre sua assinatura. Nas próximas batidas, basta clicar em &quot;Assinar digitalmente&quot;.
                  </p>
                  <SignaturePad onChange={setSignatureDraft} height={160} />
                  <button
                    type="button"
                    disabled={loading || !signatureDraft}
                    onClick={() => void handleUseNewSignature()}
                    className="w-full py-4 rounded-2xl bg-red-700 text-white font-black uppercase text-sm disabled:opacity-50"
                  >
                    Salvar assinatura e registrar ponto
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-10 text-center">
              <Loader2 size={36} className="animate-spin mx-auto text-red-600 mb-3" />
              <p className="text-sm font-black uppercase text-gray-700">Registrando batida...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimeClockModal;
