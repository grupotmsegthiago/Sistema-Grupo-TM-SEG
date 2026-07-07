import { formatDateBR } from '../lib/dateUtils';
import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import SignaturePad from './SignaturePad';
import { generateContent } from '../lib/gemini';
import { supabase } from '../lib/supabase';
import type { EquipmentRecord, EquipmentResponsibilityTerm } from '../lib/equipmentRecovery';
import { buildMaterialDescription } from '../lib/equipmentRecovery';

interface Props {
  equipments: EquipmentRecord[];
  getTypeLabel: (t: string) => string;
  collaboratorName: string;
  role: string;
  emptyDeclaration?: boolean;
  onClose: () => void;
  onSigned: (term: EquipmentResponsibilityTerm) => Promise<void>;
}

type Step = 'preview' | 'face' | 'signature' | 'done';

const DEFAULT_COMPANY = 'TM SEGURANÇA LTDA';

const EquipmentCombinedTermModal: React.FC<Props> = ({
  equipments,
  getTypeLabel,
  collaboratorName,
  role,
  emptyDeclaration = false,
  onClose,
  onSigned,
}) => {
  const [step, setStep] = useState<Step>('preview');
  const [company, setCompany] = useState(DEFAULT_COMPANY);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [locationCity, setLocationCity] = useState('São Paulo');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [facePhotoUrl, setFacePhotoUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentUser = JSON.parse(localStorage.getItem('userData') || '{}');

  const materialLines = emptyDeclaration
    ? ['Nenhum material corporativo em posse do colaborador (home office).']
    : equipments.map((eq, i) => `${i + 1}. ${buildMaterialDescription(eq, getTypeLabel)}`);

  const materialDescription = materialLines.join('\n');

  useEffect(() => {
    if (step !== 'face') return;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setError('Câmera frontal necessária para reconhecimento facial.');
      }
    })();
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [step]);

  const captureAndVerifyFace = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsProcessing(true);
    setError('');
    try {
      const ctx = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      ctx?.drawImage(videoRef.current, 0, 0);
      const photoBase64 = canvasRef.current.toDataURL('image/jpeg', 0.85).split(',')[1];

      const resultText = await generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: photoBase64 } },
            { text: 'Rosto humano visível sem óculos escuros ou boné? Responda VALID ou ERR_FACE.' },
          ],
        },
      });

      if (resultText.trim().toUpperCase() !== 'VALID') {
        throw new Error('Rosto não identificado. Posicione-se em frente à câmera.');
      }

      const path = `patrimonio-self/${currentUser.id}/face-${Date.now()}.jpg`;
      const blob = await (await fetch(`data:image/jpeg;base64,${photoBase64}`)).blob();
      const { error: upErr } = await supabase.storage.from('mission-evidence').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(path);
      setFacePhotoUrl(urlData.publicUrl);
      setStep('signature');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha na validação facial.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalize = async () => {
    if (!signatureData) {
      setError('Assine o termo antes de finalizar.');
      return;
    }
    setIsProcessing(true);
    setError('');
    try {
      const sigPath = `patrimonio-self/${currentUser.id}/signature-${Date.now()}.png`;
      const sigBlob = await (await fetch(signatureData)).blob();
      const { error: sigErr } = await supabase.storage.from('mission-evidence').upload(sigPath, sigBlob, { upsert: true, contentType: 'image/png' });
      if (sigErr) throw sigErr;
      const { data: sigUrl } = supabase.storage.from('mission-evidence').getPublicUrl(sigPath);

      const term: EquipmentResponsibilityTerm = {
        signed_at: new Date().toISOString(),
        collaborator_name: collaboratorName,
        role: role || '—',
        company,
        material_description: materialDescription,
        receipt_date: receiptDate,
        location_city: locationCity,
        face_photo_url: facePhotoUrl || '',
        signature_url: sigUrl.publicUrl,
        signed_by_user_id: currentUser.id,
        signed_by_user_name: currentUser.name,
      };

      await onSigned(term);
      setStep('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar termo.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] bg-black/70 flex items-center justify-center p-4" data-testid="combined-term-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileText size={18} />
            <h2 className="text-sm font-black uppercase">Termo de Responsabilidade — Patrimônio</h2>
          </div>
          {step !== 'done' && (
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3 text-sm text-slate-700">
          {step === 'preview' && (
            <div className="space-y-3 leading-relaxed">
              <p><strong>Colaborador:</strong> {collaboratorName}<br /><strong>Função:</strong> {role}<br /><strong>Empresa:</strong> {company}</p>
              <p>Declaro ter recebido o material abaixo em perfeitas condições, destinado ao exercício das minhas funções em regime de home office, comprometendo-me a mantê-lo, devolvê-lo quando solicitado e indenizar em caso de extravio ou má conservação.</p>
              <p className="font-bold text-xs uppercase text-slate-500">Material recebido:</p>
              <pre className="text-xs bg-slate-50 border rounded-lg p-3 whitespace-pre-wrap font-sans">{materialDescription}</pre>
              <p className="text-xs text-slate-500">São Paulo, {formatDateBR(receiptDate)}.</p>
            </div>
          )}
          {step === 'face' && (
            <div className="space-y-3">
              <p className="text-xs flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-600" /> Reconhecimento facial obrigatório</p>
              <div className="relative aspect-[4/3] max-w-sm mx-auto bg-slate-900 rounded-2xl overflow-hidden">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                <canvas ref={canvasRef} className="hidden" />
              </div>
            </div>
          )}
          {step === 'signature' && (
            <div className="space-y-2">
              <p className="text-xs">Assine com o mouse ou o dedo:</p>
              <SignaturePad onChange={setSignatureData} />
            </div>
          )}
          {step === 'done' && (
            <div className="text-center py-8">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" />
              <p className="font-black uppercase">Termo assinado com sucesso</p>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t flex gap-2 justify-end">
          {step === 'preview' && (
            <button type="button" onClick={() => setStep('face')} className="px-4 py-2 bg-slate-800 text-white text-xs font-black uppercase rounded-lg">Próximo: Reconhecimento facial</button>
          )}
          {step === 'face' && (
            <button type="button" onClick={captureAndVerifyFace} disabled={isProcessing} className="px-4 py-2 bg-slate-800 text-white text-xs font-black uppercase rounded-lg disabled:opacity-50">
              {isProcessing ? 'Validando...' : 'Capturar rosto'}
            </button>
          )}
          {step === 'signature' && (
            <button type="button" onClick={handleFinalize} disabled={isProcessing || !signatureData} className="px-4 py-2 bg-emerald-700 text-white text-xs font-black uppercase rounded-lg disabled:opacity-50">
              {isProcessing ? 'Salvando...' : 'Finalizar termo'}
            </button>
          )}
          {step === 'done' && (
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-800 text-white text-xs font-black uppercase rounded-lg">Concluir</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EquipmentCombinedTermModal;
