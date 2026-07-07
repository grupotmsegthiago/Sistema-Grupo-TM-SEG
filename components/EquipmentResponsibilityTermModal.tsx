import { formatDateBR } from '../lib/dateUtils';
import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, Camera, PenLine, Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import SignaturePad from './SignaturePad';
import { generateContent } from '../lib/gemini';
import { supabase } from '../lib/supabase';
import type { EquipmentRecord, EquipmentResponsibilityTerm } from '../lib/equipmentRecovery';
import { buildMaterialDescription } from '../lib/equipmentRecovery';

interface Props {
  equipment: EquipmentRecord;
  getTypeLabel: (t: string) => string;
  defaultCompany?: string;
  onClose: () => void;
  onSigned: (term: EquipmentResponsibilityTerm) => Promise<void>;
}

type Step = 'preview' | 'face' | 'signature' | 'done';

const DEFAULT_COMPANY = 'TM SEGURANÇA LTDA';

const EquipmentResponsibilityTermModal: React.FC<Props> = ({
  equipment,
  getTypeLabel,
  defaultCompany = DEFAULT_COMPANY,
  onClose,
  onSigned,
}) => {
  const [step, setStep] = useState<Step>('preview');
  const [collaboratorName, setCollaboratorName] = useState(equipment.assigned_to_name || '');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState(defaultCompany);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [locationCity, setLocationCity] = useState('São Paulo');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [facePhotoData, setFacePhotoData] = useState<string | null>(null);
  const [facePhotoUrl, setFacePhotoUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const materialDescription = buildMaterialDescription(equipment, getTypeLabel);
  const currentUser = JSON.parse(localStorage.getItem('userData') || '{}');

  useEffect(() => {
    if (!equipment.assigned_to) return;
    (async () => {
      try {
        const { data: rhEmp } = await supabase
          .from('rh_employees')
          .select('full_name, rh_positions(name)')
          .ilike('full_name', equipment.assigned_to_name)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();
        if (rhEmp) {
          if (!collaboratorName) setCollaboratorName(rhEmp.full_name);
          const pos = (rhEmp as { rh_positions?: { name?: string } }).rh_positions?.name;
          if (pos) setRole(pos);
        }
      } catch {
        /* opcional */
      }
    })();
  }, [equipment.assigned_to, equipment.assigned_to_name]);

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
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
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

      const prompt = `Analise esta foto para termo de responsabilidade de patrimônio.
Regras:
1. Existe um rosto humano visível e nítido?
2. A pessoa está usando óculos escuros ou boné? Rejeite se sim.
Responda apenas "VALID" ou ERR_FACE, ERR_GLASSES, ERR_HAT.`;

      const resultText = await generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: photoBase64 } },
            { text: prompt },
          ],
        },
      });

      const result = resultText.trim().toUpperCase();
      if (result !== 'VALID') {
        if (result.includes('GLASSES')) throw new Error('Remova os óculos para a validação facial.');
        if (result.includes('HAT')) throw new Error('Remova boné ou chapéu para a validação facial.');
        throw new Error('Rosto não identificado. Posicione-se em frente à câmera com boa iluminação.');
      }

      const path = `equipment-terms/${equipment.id}/face-${Date.now()}.jpg`;
      const blob = await (await fetch(`data:image/jpeg;base64,${photoBase64}`)).blob();
      const { error: upErr } = await supabase.storage.from('mission-evidence').upload(path, blob, {
        upsert: true,
        contentType: 'image/jpeg',
      });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(path);
      setFacePhotoData(photoBase64);
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
    if (!collaboratorName.trim()) {
      setError('Informe o nome do colaborador.');
      return;
    }
    setIsProcessing(true);
    setError('');
    try {
      const sigPath = `equipment-terms/${equipment.id}/signature-${Date.now()}.png`;
      const sigBlob = await (await fetch(signatureData)).blob();
      const { error: sigErr } = await supabase.storage.from('mission-evidence').upload(sigPath, sigBlob, {
        upsert: true,
        contentType: 'image/png',
      });
      if (sigErr) throw sigErr;
      const { data: sigUrl } = supabase.storage.from('mission-evidence').getPublicUrl(sigPath);

      const term: EquipmentResponsibilityTerm = {
        signed_at: new Date().toISOString(),
        collaborator_name: collaboratorName.trim(),
        role: role.trim() || '—',
        company: company.trim() || DEFAULT_COMPANY,
        material_description: materialDescription,
        receipt_date: receiptDate,
        location_city: locationCity.trim() || 'São Paulo',
        face_photo_url: facePhotoUrl || (facePhotoData ? `data:image/jpeg;base64,${facePhotoData}` : ''),
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

  const receiptDateFormatted = receiptDate ? formatDateBR(receiptDate) : '//__';
  const todayFormatted = formatDateBR(new Date().toISOString());

  return (
    <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4" data-testid="equipment-term-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-slate-700" />
            <h2 className="text-sm font-black uppercase text-slate-800">Termo de Responsabilidade — {equipment.patrimony_id}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" data-testid="button-close-term-modal">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {step === 'preview' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Colaborador</label>
                  <input
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={collaboratorName}
                    onChange={(e) => setCollaboratorName(e.target.value)}
                    data-testid="input-term-collaborator"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Função</label>
                  <input
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Cargo do colaborador"
                    data-testid="input-term-role"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Empresa</label>
                  <input
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    data-testid="input-term-company"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Data do recebimento</label>
                  <input
                    type="date"
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    data-testid="input-term-receipt-date"
                  />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 leading-relaxed space-y-3">
                <p>
                  <strong>Colaborador:</strong> {collaboratorName || '_____________'}
                  <br />
                  <strong>Função:</strong> {role || '_______________'}
                  <br />
                  <strong>Empresa:</strong> {company}
                </p>
                <p>
                  Declaro ter recebido o material abaixo relacionado em perfeitas condições de uso, destinado exclusivamente à utilização no exercício de minhas funções, pelas quais me comprometo a:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-[13px]">
                  <li>Mantê-lo e conservá-lo em bom estado;</li>
                  <li>Devolvê-lo, sob recibo, ao Departamento Administrativo da Empresa quando for solicitado, por qualquer que seja o motivo do mesmo ou por troca;</li>
                  <li>Indenizar ou repor quando de extravio, má conservação ou não cumprimento do acima estabelecido, pelo que desde já caso isso venha a ocorrer, autorizo o débito em folha de pagamento e/ou rescisão.</li>
                </ul>
                <p className="font-bold uppercase text-xs text-slate-600">Material recebido:</p>
                <p className="font-mono text-xs bg-white border border-slate-200 rounded-lg p-2">{materialDescription}</p>
                <p>
                  Perfeitamente esclarecido e sem dúvida alguma sobre o exposto acima, firmo o presente <strong>TERMO DE RESPONSABILIDADE</strong>.
                </p>
                <p className="text-xs text-slate-500">
                  Data do recebimento: {receiptDateFormatted}
                  <br />
                  {locationCity}, {todayFormatted}.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Cidade (rodapé)</label>
                <input
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={locationCity}
                  onChange={(e) => setLocationCity(e.target.value)}
                />
              </div>
            </>
          )}

          {step === 'face' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-600" />
                Reconhecimento facial — posicione o rosto sem óculos ou boné
              </p>
              <div className="relative aspect-[4/3] max-w-sm mx-auto bg-slate-900 rounded-2xl overflow-hidden border-4 border-slate-200">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                <canvas ref={canvasRef} className="hidden" />
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="animate-spin text-white" size={32} />
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'signature' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 flex items-center gap-2">
                <PenLine size={14} /> Assine abaixo com o mouse ou o dedo
              </p>
              <SignaturePad onChange={setSignatureData} />
              {facePhotoUrl && (
                <div className="flex items-center gap-2 text-[10px] text-emerald-700 font-bold uppercase">
                  <CheckCircle2 size={12} /> Reconhecimento facial validado
                </div>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
              <p className="font-black text-slate-800 uppercase text-sm">Termo assinado e anexado</p>
              <p className="text-xs text-slate-500">O documento ficou vinculado ao patrimônio {equipment.patrimony_id}.</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          {step === 'preview' && (
            <>
              <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-600 rounded-lg hover:bg-gray-100">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setStep('face')}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-black uppercase rounded-lg hover:bg-slate-900 flex items-center gap-2"
                data-testid="button-term-start-face"
              >
                <Camera size={14} /> Próximo: Reconhecimento facial
              </button>
            </>
          )}
          {step === 'face' && (
            <>
              <button type="button" onClick={() => setStep('preview')} className="px-4 py-2 text-xs font-bold text-gray-600 rounded-lg hover:bg-gray-100">
                Voltar
              </button>
              <button
                type="button"
                onClick={captureAndVerifyFace}
                disabled={isProcessing}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-black uppercase rounded-lg hover:bg-slate-900 disabled:opacity-50"
                data-testid="button-term-capture-face"
              >
                {isProcessing ? 'Validando...' : 'Capturar e validar rosto'}
              </button>
            </>
          )}
          {step === 'signature' && (
            <>
              <button type="button" onClick={() => setStep('face')} className="px-4 py-2 text-xs font-bold text-gray-600 rounded-lg hover:bg-gray-100">
                Voltar
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={isProcessing || !signatureData}
                className="px-4 py-2 bg-emerald-700 text-white text-xs font-black uppercase rounded-lg hover:bg-emerald-800 disabled:opacity-50"
                data-testid="button-term-finalize"
              >
                {isProcessing ? 'Salvando...' : 'Finalizar e anexar termo'}
              </button>
            </>
          )}
          {step === 'done' && (
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-800 text-white text-xs font-black uppercase rounded-lg">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EquipmentResponsibilityTermModal;
