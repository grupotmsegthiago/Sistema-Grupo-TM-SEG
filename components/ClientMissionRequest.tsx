import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { MissionStatus } from '../types';
import { MapPin, Calendar, Truck, User, Phone, FileText, X, Send, Loader2 } from 'lucide-react';

interface Props {
    clientName: string;
    onClose: () => void;
    onSuccess: () => void;
}

const ClientMissionRequest: React.FC<Props> = ({ clientName, onClose, onSuccess }) => {
    const [form, setForm] = useState({
        origin: '',
        destination: '',
        date: '',
        time: '',
        plate: '',
        driverName: '',
        driverPhone: '',
        observations: ''
    });
    const [saving, setSaving] = useState(false);

    const generateId = async () => {
        const { data } = await supabase.from('missions').select('id').order('created_at', { ascending: false }).limit(300);
        let maxNum = 0;
        if (data) {
            data.forEach((m: any) => {
                const parts = m.id.split('-');
                if (parts.length > 1) {
                    const num = parseInt(parts[1]);
                    if (!isNaN(num) && num > maxNum) maxNum = num;
                }
            });
        }
        return `GTM-${(maxNum + 1).toString().padStart(4, '0')}`;
    };

    const handleSubmit = async () => {
        if (!form.origin || !form.destination || !form.date || !form.time) {
            alert('Preencha origem, destino, data e horário.');
            return;
        }
        setSaving(true);
        try {
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            const nowIso = new Date().toISOString();
            const scheduledIso = new Date(`${form.date}T${form.time}:00`).toISOString();

            let attempts = 0, saved = false;
            while (attempts < 10 && !saved) {
                const finalId = await generateId();
                const { error } = await supabase.from('missions').insert([{
                    id: finalId,
                    client: clientName,
                    provider: null,
                    origin: form.origin,
                    destination: form.destination,
                    status: MissionStatus.SOLICITED,
                    last_update: nowIso,
                    created_at: nowIso,
                    updated_by: userData.name || 'Cliente',
                    start_time: scheduledIso,
                    mission_type: 'Caracterizada',
                    revenue_value: 0,
                    cost_value: 0,
                    toll_value: 0,
                    current_location: `Solicitação via Portal - ${userData.name || 'Cliente'}`,
                    driver_name: form.driverName ? form.driverName.toUpperCase() : null,
                    driver_phone: form.driverPhone || null,
                    client_vehicle: null,
                    observations: form.observations || null
                }]);
                if (!error) {
                    saved = true;
                } else if (error.code === '23505') {
                    attempts++;
                } else {
                    throw error;
                }
            }
            if (!saved) throw new Error('Não foi possível gerar ID único.');
            onSuccess();
            onClose();
        } catch (e: any) {
            alert('Erro ao criar solicitação: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const Field = ({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) => (
        <div>
            <label className="flex items-center gap-1.5 text-[11px] font-black text-gray-600 uppercase tracking-wider mb-1.5">
                <Icon size={12} className="text-red-600" /> {label}
            </label>
            {children}
        </div>
    );

    const inputClass = "w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-client-request">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-700 text-white rounded-lg"><Send size={16} /></div>
                        <div>
                            <h2 className="text-sm font-black text-gray-900 uppercase">Nova Solicitação</h2>
                            <p className="text-[10px] font-bold text-gray-400">{clientName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors" data-testid="button-close-request"><X size={18} /></button>
                </div>

                <div className="p-5 space-y-4">
                    <Field label="Origem" icon={MapPin}>
                        <input type="text" className={inputClass} placeholder="Ex: São Paulo - SP" value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value }))} data-testid="input-request-origin" />
                    </Field>
                    <Field label="Destino" icon={MapPin}>
                        <input type="text" className={inputClass} placeholder="Ex: Campinas - SP" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} data-testid="input-request-destination" />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Data" icon={Calendar}>
                            <input type="date" className={inputClass} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} data-testid="input-request-date" />
                        </Field>
                        <Field label="Horário" icon={Calendar}>
                            <input type="time" className={inputClass} value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} data-testid="input-request-time" />
                        </Field>
                    </div>
                    <Field label="Placa do Veículo" icon={Truck}>
                        <input type="text" className={inputClass} placeholder="ABC-1234" value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} data-testid="input-request-plate" />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Motorista" icon={User}>
                            <input type="text" className={inputClass} placeholder="Nome do motorista" value={form.driverName} onChange={e => setForm(f => ({ ...f, driverName: e.target.value }))} data-testid="input-request-driver" />
                        </Field>
                        <Field label="Telefone" icon={Phone}>
                            <input type="tel" className={inputClass} placeholder="(11) 99999-9999" value={form.driverPhone} onChange={e => setForm(f => ({ ...f, driverPhone: e.target.value }))} data-testid="input-request-phone" />
                        </Field>
                    </div>
                    <Field label="Observações" icon={FileText}>
                        <textarea className={`${inputClass} resize-none`} rows={3} placeholder="Informações adicionais..." value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} data-testid="input-request-observations" />
                    </Field>
                </div>

                <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100 transition-all" data-testid="button-cancel-request">Cancelar</button>
                    <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-red-700 text-white rounded-lg text-xs font-black uppercase hover:bg-red-800 transition-all disabled:opacity-50" data-testid="button-submit-request">
                        {saving ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : <><Send size={14} /> Enviar Solicitação</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ClientMissionRequest;
