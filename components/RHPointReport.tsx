
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { Search, Download, Calendar, User, FileText, Loader2, MapPin, CheckCircle2, ShieldCheck, Printer } from 'lucide-react';

const RHPointReport: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [users, setUsers] = useState<any[]>([]);
    const [selectedUser, setSelectedUser] = useState('ALL');

    useEffect(() => {
        fetchUsers();
        fetchLogs();
    }, [startDate, endDate, selectedUser]);

    useRealtimeRefresh('time_clock', () => fetchLogs());

    const fetchUsers = async () => {
        const { data } = await supabase.from('system_users').select('id, name').order('name');
        if (data) setUsers(data);
    };

    const fetchLogs = async () => {
        setLoading(true);
        let query = supabase.from('time_clock').select('*').gte('timestamp', `${startDate}T00:00:00`).lte('timestamp', `${endDate}T23:59:59`);
        if (selectedUser !== 'ALL') query = query.eq('user_id', selectedUser);
        
        const { data } = await query.order('timestamp', { ascending: false });
        if (data) setLogs(data);
        setLoading(false);
    };

    const exportCSV = () => {
        const headers = ["Data", "Usuario", "Tipo", "Latitude", "Longitude", "Validado"];
        const rows = logs.map(l => [
            new Date(l.timestamp).toLocaleString(),
            l.user_name,
            l.type,
            l.latitude,
            l.longitude,
            l.ai_verification ? 'SIM' : 'NAO'
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `ponto_rh_${startDate}.csv`);
        document.body.appendChild(link);
        link.click();
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 no-print">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3"><FileText className="text-red-700"/> Relatório de Ponto</h2>
                    <p className="text-xs text-gray-500 mt-1 uppercase font-bold tracking-widest">Auditoria e Conferência RH</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={exportCSV} className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-xs font-bold uppercase flex items-center gap-2 border border-indigo-100 hover:bg-indigo-100 transition-all"><Download size={16}/> CSV</button>
                    <button onClick={() => window.print()} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-lg"><Printer size={16}/> PDF</button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4 no-print">
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Colaborador</label>
                    <select className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold uppercase" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
                        <option value="ALL">TODOS</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Início</label>
                    <input type="date" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fim</label>
                    <input type="date" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Data/Hora</th>
                                <th className="px-6 py-4">Usuário</th>
                                <th className="px-6 py-4 text-center">Tipo</th>
                                <th className="px-6 py-4">GPS (Local)</th>
                                <th className="px-6 py-4 text-center">Biometria</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {loading ? (
                                <tr><td colSpan={5} className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-red-600" /></td></tr>
                            ) : logs.map(l => (
                                <tr key={l.id} className="hover:bg-gray-50 transition-all text-xs font-medium">
                                    <td className="px-6 py-4 font-mono text-gray-500">{new Date(l.timestamp).toLocaleString()}</td>
                                    <td className="px-6 py-4 font-black uppercase text-gray-900">{l.user_name}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase border ${l.type === 'IN' ? 'bg-green-50 text-green-700 border-green-200' : l.type === 'OUT' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                                            {l.type === 'IN' ? 'Entrada' : l.type === 'OUT' ? 'Saída' : 'Almoço'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <a href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`} target="_blank" className="text-blue-600 flex items-center gap-1 hover:underline font-bold uppercase text-[10px]"><MapPin size={12}/> Mapa</a>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button onClick={() => window.open(l.photo_url)} className="p-1 hover:scale-110 transition-transform"><img src={l.photo_url} className="w-8 h-8 rounded object-cover border" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default RHPointReport;
