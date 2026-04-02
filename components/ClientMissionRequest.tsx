import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { MissionStatus } from '../types';
import { MapPin, Calendar, Truck, User, Phone, FileText, X, Send, Loader2, Shield, Zap, AlertTriangle, Clock } from 'lucide-react';

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
        observations: '',
        serviceType: 'Caracterizada' as 'Caracterizada' | 'Pronta Resposta',
        incidentType: 'normal' as 'normal' | 'acidente',
        isImmediate: false
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
        if (!form.origin || !form.destination) {
            alert('Preencha origem e destino.');
            return;
        }
        if (!form.isImmediate && (!form.date || !form.time)) {
            alert('Preencha data e horário ou marque como IMEDIATA.');
            return;
        }
        setSaving(true);
        try {
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            const nowIso = new Date().toISOString();
            const scheduledIso = form.isImmediate ? nowIso : new Date(`${form.date}T${form.time}:00`).toISOString();

            const isAccident = form.incidentType === 'acidente';
            const locationTag = isAccident
                ? `🚨 ACIDENTE - Solicitação via Portal - ${userData.name || 'Cliente'}`
                : `Solicitação via Portal - ${userData.name || 'Cliente'}`;

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
                    mission_type: form.serviceType,
                    revenue_value: 0,
                    cost_value: 0,
                    toll_value: 0,
                    current_location: locationTag,
                    driver_name: form.driverName ? form.driverName.toUpperCase() : null,
                    driver_phone: form.driverPhone || null,
                    client_vehicle: null,
                    observations: form.observations || null,
                    snapshot_data: null, snapshot_approved_by: null, snapshot_approved_at: null
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
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
                    <Field label="Tipo de Serviço" icon={Shield}>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, serviceType: 'Caracterizada' }))}
                                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-xs font-black uppercase border-2 transition-all ${
                                    form.serviceType === 'Caracterizada'
                                        ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                }`}
                                data-testid="button-service-escolta"
                            >
                                <Shield size={14} /> Escolta Armada
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, serviceType: 'Pronta Resposta' }))}
                                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-xs font-black uppercase border-2 transition-all ${
                                    form.serviceType === 'Pronta Resposta'
                                        ? 'bg-purple-700 text-white border-purple-700 shadow-md'
                                        : 'bg-white text-purple-600 border-purple-200 hover:border-purple-400'
                                }`}
                                data-testid="button-service-pronta"
                            >
                                <Zap size={14} /> Pronta Resposta
                            </button>
                        </div>
                    </Field>

                    <Field label="Tipo de Acionamento" icon={AlertTriangle}>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, incidentType: 'normal' }))}
                                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-xs font-black uppercase border-2 transition-all ${
                                    form.incidentType === 'normal'
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                        : 'bg-white text-blue-600 border-blue-200 hover:border-blue-400'
                                }`}
                                data-testid="button-incident-normal"
                            >
                                <Clock size={14} /> Acionamento Normal
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, incidentType: 'acidente', isImmediate: true }))}
                                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-xs font-black uppercase border-2 transition-all ${
                                    form.incidentType === 'acidente'
                                        ? 'bg-red-600 text-white border-red-600 shadow-md animate-pulse'
                                        : 'bg-white text-red-600 border-red-200 hover:border-red-400'
                                }`}
                                data-testid="button-incident-acidente"
                            >
                                <AlertTriangle size={14} /> Acidente
                            </button>
                        </div>
                        {form.incidentType === 'acidente' && (
                            <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                                <AlertTriangle size={14} className="text-red-600 shrink-0" />
                                <span className="text-[10px] font-black text-red-700 uppercase">Prioridade máxima — alerta imediato para equipe interna</span>
                            </div>
                        )}
                    </Field>

                    <Field label="Origem" icon={MapPin}>
                        <input type="text" className={inputClass} placeholder="Ex: São Paulo - SP" value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value }))} data-testid="input-request-origin" />
                    </Field>
                    <Field label="Destino" icon={MapPin}>
                        <input type="text" className={inputClass} placeholder="Ex: Campinas - SP" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} data-testid="input-request-destination" />
                    </Field>

                    <Field label="Horário" icon={Calendar}>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.isImmediate}
                                    onChange={e => setForm(f => ({ ...f, isImmediate: e.target.checked, date: e.target.checked ? '' : f.date, time: e.target.checked ? '' : f.time }))}
                                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                    data-testid="checkbox-immediate"
                                />
                                <span className={`text-xs font-black uppercase ${form.isImmediate ? 'text-red-700' : 'text-gray-500'}`}>
                                    Imediata — usar horário atual
                                </span>
                            </label>
                            {!form.isImmediate && (
                                <div className="grid grid-cols-2 gap-4">
                                    <input type="date" className={inputClass} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} data-testid="input-request-date" />
                                    <input type="time" className={inputClass} value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} data-testid="input-request-time" />
                                </div>
                            )}
                            {form.isImmediate && (
                                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                                    <Zap size={14} className="text-amber-600 shrink-0" />
                                    <span className="text-[10px] font-bold text-amber-700">O horário será registrado como o momento do envio</span>
                                </div>
                            )}
                        </div>
                    </Field>

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
                    <button onClick={handleSubmit} disabled={saving} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-black uppercase transition-all disabled:opacity-50 ${form.incidentType === 'acidente' ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg' : 'bg-red-700 hover:bg-red-800 text-white'}`} data-testid="button-submit-request">
                        {saving ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : <><Send size={14} /> {form.incidentType === 'acidente' ? 'Enviar Urgente' : 'Enviar Solicitação'}</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ClientMissionRequest;
