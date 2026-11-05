import React, { useState } from 'react';
import { Loader2, ShieldCheck, Upload, X } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { supabase } from '../lib/supabase';
import type { PartnerProspect } from '../lib/partnerProspects/types';
import { formatarCnpj } from '../lib/partnerProspects/cnpj';
import { useNotification } from '../lib/NotificationContext';

interface Props {
  prospect: PartnerProspect;
  onClose: () => void;
  onDone: (providerId: string) => void;
}

const PartnerHomologation: React.FC<Props> = ({ prospect, onClose, onDone }) => {
  const { showNotification } = useNotification();
  const [alvaraValidity, setAlvaraValidity] = useState(prospect.alvara_validity || '');
  const [pfNumber, setPfNumber] = useState(prospect.pf_authorization_number || '');
  const [documentUrl, setDocumentUrl] = useState(prospect.document_url || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const safe = (prospect.cnpj || 'temp').replace(/\D/g, '');
      const path = `permits/prospect_${safe}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('documents').upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from('documents').getPublicUrl(path);
      setDocumentUrl(data.publicUrl);
      showNotification('Sucesso', 'Documento anexado.', 'success');
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha no upload', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleHomologar = async () => {
    setSaving(true);
    try {
      const res = await authFetch('/api/partner-prospects/homologar', {
        method: 'POST',
        body: JSON.stringify({
          prospectId: prospect.id,
          alvaraValidity: alvaraValidity || null,
          pfAuthorizationNumber: pfNumber || null,
          documentUrl: documentUrl || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Falha na homologação');
      }
      showNotification(
        'Homologado',
        'Fornecedor criado como Bloqueado. Preencha a tabela de custo no cadastro oficial.',
        'success',
      );
      onDone(String(data.providerId || ''));
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao homologar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-800">Ficha de homologação</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {prospect.company_name} · {formatarCnpj(prospect.cnpj)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3">
            Ao homologar, o sistema cria o fornecedor com status <strong>Bloqueado</strong>.
            Ele não entra na Nova OS até a liberação. A tabela de custo continua no cadastro de fornecedor — não é gravada aqui.
          </p>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nº Portaria / Autorização PF</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={pfNumber}
              onChange={(e) => setPfNumber(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Validade do alvará (AAAA-MM-DD)</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={alvaraValidity}
              onChange={(e) => setAlvaraValidity(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Documento (PDF/imagem)</label>
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Anexar
              <input
                type="file"
                className="hidden"
                accept=".pdf,image/*"
                onChange={(e) => handleUpload(e.target.files?.[0] || null)}
              />
            </label>
            {documentUrl ? (
              <a href={documentUrl} target="_blank" rel="noreferrer" className="block mt-2 text-xs text-red-700 underline truncate">
                {documentUrl}
              </a>
            ) : null}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-lg">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleHomologar}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Homologar (Bloqueado)
          </button>
        </div>
      </div>
    </div>
  );
};

export default PartnerHomologation;
