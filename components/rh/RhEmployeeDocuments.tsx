import React, { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, ExternalLink, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../lib/NotificationContext';
import { RH_DOC_TYPES, RH_INPUT_CLASS, RH_LABEL_CLASS, RH_SELECT_CLASS } from '../../lib/rh/constants';
import { employeeDocumentsClient } from '../../lib/rh/employeeDocumentsClient';
import type {
  CreateRhEmployeeDocumentInput,
  RhEmployeeDocument,
} from '../../lib/rh/employeeDocumentsApiCore';
import { canEditRh } from '../../lib/rh/permissions';
import { formatDateBR } from '../../lib/dateUtils';

interface Props {
  employeeId: string;
  services?: RhEmployeeDocumentsServices;
  notify?: (title: string, message: string) => void;
}

export interface RhEmployeeDocumentsServices {
  list: (employeeId: string) => Promise<RhEmployeeDocument[]>;
  create: (input: CreateRhEmployeeDocumentInput) => Promise<RhEmployeeDocument>;
  remove: (id: string) => Promise<void>;
  uploadFile: (employeeId: string, file: File) => Promise<string>;
}

export const defaultRhEmployeeDocumentsServices: RhEmployeeDocumentsServices = {
  ...employeeDocumentsClient,
  async uploadFile(employeeId: string, file: File): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `rh/${employeeId}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from('mission-evidence').upload(path, file, {
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });
    if (error) throw error;
    return supabase.storage.from('mission-evidence').getPublicUrl(path).data.publicUrl;
  },
};

const RhEmployeeDocuments: React.FC<Props> = ({
  employeeId,
  services = defaultRhEmployeeDocumentsServices,
  notify,
}) => {
  const { showNotification: contextNotification } = useNotification();
  const showNotification = notify || contextNotification;
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RhEmployeeDocument[]>([]);
  const [docType, setDocType] = useState('Contrato');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const editable = canEditRh();

  const load = async () => {
    try {
      setRows(await services.list(employeeId));
    } catch {
      // Comportamento anterior: falha de listagem resultava em lista vazia.
      setRows([]);
    }
  };

  useEffect(() => { if (employeeId) void load(); }, [employeeId, services]);

  const upload = async (file: File) => {
    if (!editable) return;
    setUploading(true);
    try {
      const fileUrl = await services.uploadFile(employeeId, file);
      await services.create({
        employeeId,
        docType,
        fileName: file.name,
        fileUrl,
        mimeType: file.type,
        notes: notes.trim() || null,
      });
      showNotification('success', 'Arquivo enviado!');
      setNotes('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e: any) {
      showNotification('error', e.message || 'Falha no upload');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Remover este documento?')) return;
    try {
      await services.remove(id);
      showNotification('success', 'Documento removido');
      await load();
    } catch (e: any) {
      showNotification('error', e.message);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold uppercase text-gray-700">Documentos e contratos</h3>

      {editable && (
        <div className="bg-gray-50 rounded-xl border p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className={RH_LABEL_CLASS}>Tipo</label>
            <select className={RH_SELECT_CLASS} value={docType} onChange={(e) => setDocType(e.target.value)}>
              {RH_DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={RH_LABEL_CLASS}>Observação</label>
            <input className={RH_INPUT_CLASS} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-black text-white rounded-lg text-xs font-bold uppercase disabled:opacity-50"
            >
              <Upload size={14} /> {uploading ? 'Enviando...' : 'Enviar arquivo'}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhum documento anexado.</p>
      ) : (
        <div className="divide-y border rounded-xl overflow-hidden bg-white">
          {rows.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
              <FileText size={18} className="text-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{doc.file_name || doc.doc_type}</p>
                <p className="text-[10px] text-gray-400 uppercase">{doc.doc_type} · {formatDateBR(doc.created_at)}</p>
              </div>
              {doc.file_url && (
                <a href={doc.file_url} target="_blank" rel="noreferrer" className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                  <ExternalLink size={16} />
                </a>
              )}
              {editable && (
                <button type="button" onClick={() => remove(doc.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RhEmployeeDocuments;
