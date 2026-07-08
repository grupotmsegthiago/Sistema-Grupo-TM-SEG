import React, { useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNotification } from '../lib/NotificationContext';
import { FinancialDocStatus, FinancialTransaction } from '../types';

type DocKey = 'boleto' | 'nf' | 'comprovante';

const DOC_KEYS: DocKey[] = ['boleto', 'nf', 'comprovante'];

const DOC_META: Record<DocKey, { short: string; title: string; urlKey: keyof FinancialTransaction; statusKey: keyof FinancialTransaction }> = {
  boleto: { short: '1-BOL', title: 'Boleto ou Medição', urlKey: 'doc_boleto_url', statusKey: 'doc_boleto_status' },
  nf: { short: '2-NF', title: 'Nota Fiscal', urlKey: 'doc_nf_url', statusKey: 'doc_nf_status' },
  comprovante: { short: '3-COMP', title: 'Comprovante de pagamento', urlKey: 'doc_comprovante_url', statusKey: 'doc_comprovante_status' },
};

const STATUS_UI: Record<FinancialDocStatus, { bg: string; text: string; border: string; symbol: string }> = {
  empty: { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300', symbol: '—' },
  pending: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-400', symbol: '?' },
  ok: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-400', symbol: '✓' },
  issue: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-400', symbol: '!' },
};

const STATUS_CYCLE: FinancialDocStatus[] = ['empty', 'pending', 'issue'];

function resolveDocStatus(url: string | null | undefined, status: FinancialDocStatus | null | undefined): FinancialDocStatus {
  if (url && status !== 'pending' && status !== 'issue') return 'ok';
  return (status as FinancialDocStatus) || 'empty';
}

interface Props {
  transaction: FinancialTransaction;
  onUpdate: (id: string, patch: Partial<FinancialTransaction>) => void;
}

const FinancialDocConferencia: React.FC<Props> = ({ transaction, onUpdate }) => {
  const { showNotification } = useNotification();
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeDoc, setActiveDoc] = useState<DocKey | null>(null);
  const [uploading, setUploading] = useState<DocKey | null>(null);
  const [menuDoc, setMenuDoc] = useState<DocKey | null>(null);

  const getDocValues = (key: DocKey) => {
    const meta = DOC_META[key];
    const url = (transaction[meta.urlKey] as string | null | undefined) || null;
    const rawStatus = transaction[meta.statusKey] as FinancialDocStatus | null | undefined;
    const status = resolveDocStatus(url, rawStatus);
    return { url, status, meta };
  };

  const persist = async (key: DocKey, patch: Record<string, string | null>) => {
    const { error } = await supabase.from('financial_transactions').update(patch).eq('id', transaction.id);
    if (error) {
      if (error.code === '42703') {
        showNotification('Erro', 'Colunas de conferência não existem. Execute scripts/financial-doc-conferencia.sql no Supabase.', 'error');
      } else {
        showNotification('Erro', 'Falha ao salvar conferência: ' + error.message, 'error');
      }
      throw error;
    }
    onUpdate(transaction.id, patch as Partial<FinancialTransaction>);
  };

  const handleStatusChange = async (key: DocKey, next: FinancialDocStatus) => {
    const { meta, url } = getDocValues(key);
    const patch: Record<string, string | null> = { [meta.statusKey]: next };
    if (next === 'empty') patch[meta.urlKey] = null;
    else if (next === 'ok' && !url) patch[meta.statusKey] = url ? 'ok' : 'pending';
    try {
      await persist(key, patch);
      setMenuDoc(null);
    } catch { /* notificação já exibida */ }
  };

  const handleUpload = async (key: DocKey, file: File) => {
    setUploading(key);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `financial/${transaction.id}/${key}_${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('mission-evidence').upload(path, file, {
        upsert: true,
        contentType: file.type || 'application/octet-stream',
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('mission-evidence').getPublicUrl(path);
      const meta = DOC_META[key];
      await persist(key, { [meta.urlKey]: pub.publicUrl, [meta.statusKey]: 'ok' });
      showNotification('Sucesso', `${meta.title} anexado.`, 'success');
    } catch (e: any) {
      if (!e?.code) showNotification('Erro', e?.message || 'Falha no upload', 'error');
    } finally {
      setUploading(null);
      setActiveDoc(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleButtonClick = (key: DocKey) => {
    const { url } = getDocValues(key);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    setActiveDoc(key);
    fileRef.current?.click();
  };

  const cycleStatus = async (key: DocKey) => {
    const { status } = getDocValues(key);
    const idx = STATUS_CYCLE.indexOf(status === 'ok' ? 'empty' : status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    await handleStatusChange(key, next);
  };

  return (
    <div className="flex items-center justify-center gap-1">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && activeDoc) void handleUpload(activeDoc, file);
        }}
      />
      {DOC_KEYS.map((key) => {
        const { url, status, meta } = getDocValues(key);
        const ui = STATUS_UI[status];
        const busy = uploading === key;
        return (
          <div key={key} className="relative">
            <button
              type="button"
              title={`${meta.title}${url ? ' — clique para abrir' : ' — clique para anexar'}. Clique direito para status.`}
              onClick={() => handleButtonClick(key)}
              onContextMenu={(e) => { e.preventDefault(); setMenuDoc(menuDoc === key ? null : key); }}
              className={`min-w-[52px] px-1 py-1 rounded border text-[8px] font-black uppercase leading-tight transition-all hover:opacity-90 ${ui.bg} ${ui.text} ${ui.border}`}
              data-testid={`doc-${key}-${transaction.id}`}
            >
              {busy ? (
                <Loader2 size={12} className="animate-spin mx-auto" />
              ) : (
                <>
                  <span className="block">{meta.short}</span>
                  <span className="block text-[10px]">{ui.symbol}</span>
                </>
              )}
            </button>
            {menuDoc === key && (
              <div className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px] text-left">
                {url && (
                  <button type="button" className="w-full px-3 py-1.5 text-[10px] font-bold text-left hover:bg-gray-50 flex items-center gap-1" onClick={() => { window.open(url, '_blank'); setMenuDoc(null); }}>
                    <ExternalLink size={10} /> Abrir anexo
                  </button>
                )}
                <button type="button" className="w-full px-3 py-1.5 text-[10px] font-bold text-left hover:bg-gray-50" onClick={() => { setMenuDoc(null); setActiveDoc(key); fileRef.current?.click(); }}>
                  {url ? 'Substituir arquivo' : 'Anexar arquivo'}
                </button>
                <button type="button" className="w-full px-3 py-1.5 text-[10px] font-bold text-left hover:bg-amber-50 text-amber-800" onClick={() => handleStatusChange(key, 'pending')}>Marcar pendente (?)</button>
                <button type="button" className="w-full px-3 py-1.5 text-[10px] font-bold text-left hover:bg-red-50 text-red-800" onClick={() => handleStatusChange(key, 'issue')}>Marcar problema (!)</button>
                <button type="button" className="w-full px-3 py-1.5 text-[10px] font-bold text-left hover:bg-gray-50 text-gray-600" onClick={() => handleStatusChange(key, 'empty')}>Limpar</button>
                <button type="button" className="w-full px-3 py-1.5 text-[10px] font-bold text-left hover:bg-gray-50 text-gray-400 border-t" onClick={() => void cycleStatus(key)}>Alternar status</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default FinancialDocConferencia;
