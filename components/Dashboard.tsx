import React from 'react';
import { Newspaper, ShieldCheck, MapPin } from 'lucide-react';
import OperationalInfoPanel from './OperationalInfoPanel';
import PendingTollConfirmationBanner from './PendingTollConfirmationBanner';
import ManualOverrideLooseBanner from './ManualOverrideLooseBanner';

interface DashboardProps {
    onOpenMission?: (missionId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onOpenMission }) => {
  return (
    <div className="space-y-8 animate-in fade-in pb-20">

        <PendingTollConfirmationBanner onOpenMission={onOpenMission} />

        <ManualOverrideLooseBanner />

        {/* HERO SECTION / BANNER */}
        <div className="bg-gradient-to-r from-gray-900 to-black rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
                <ShieldCheck size={160} />
            </div>
            
            <div className="relative z-10 max-w-2xl">
                <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4 border border-white/10 backdrop-blur-sm">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                    Central de Inteligência
                </div>
                
                <h1 className="text-3xl md:text-4xl font-black mb-4 tracking-tight leading-tight">
                    Portal Operacional TMSEG
                </h1>
                
                <p className="text-gray-400 text-sm md:text-base leading-relaxed mb-6">
                    Acompanhe em tempo real as condições das rodovias, riscos de segurança, cotação cambial e clima nas principais rotas logísticas do país.
                </p>
                
                <div className="flex gap-4 text-xs font-bold text-gray-500">
                    <span className="flex items-center gap-1"><MapPin size={14} className="text-red-500"/> Monitoramento 24h</span>
                    <span className="flex items-center gap-1"><ShieldCheck size={14} className="text-blue-500"/> Segurança Logística</span>
                </div>
            </div>
        </div>

        {/* COMPONENTE PRINCIPAL DE INFORMAÇÕES (BLOG/FEED) */}
        <div>
            <div className="flex items-center gap-3 mb-4 px-2">
                <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-200 text-gray-700">
                    <Newspaper size={20} />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Resumo Executivo & Indicadores</h2>
            </div>
            
            {/* Aqui entra o componente que contém Clima, Dólar e Notícias */}
            <OperationalInfoPanel />
        </div>

        {/* BLOG POSTS SECUNDÁRIOS (ESTÁTICOS PARA EXEMPLO DE VISUAL) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                 <div className="mb-4 overflow-hidden rounded-lg h-40 bg-gray-100 relative">
                     <img 
                        src="https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&q=80&w=600" 
                        alt="Rodovia" 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                     />
                     <div className="absolute top-2 left-2 bg-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase">
                         INFRAESTRUTURA
                     </div>
                 </div>
                 <h3 className="font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                     Balanço das Concessões Rodoviárias 2024
                 </h3>
                 <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-3">
                     O governo federal anunciou novos leilões para trechos críticos no Centro-Oeste e Sudeste, visando melhorar o escoamento da safra e reduzir acidentes.
                 </p>
                 <span className="text-[10px] text-gray-400 uppercase font-bold">Fonte: Ministério dos Transportes</span>
             </div>

             <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                 <div className="mb-4 overflow-hidden rounded-lg h-40 bg-gray-100 relative">
                     <img 
                        src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=600" 
                        alt="Tecnologia" 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                     />
                     <div className="absolute top-2 left-2 bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase">
                         TECNOLOGIA
                     </div>
                 </div>
                 <h3 className="font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                     Novas Tecnologias de Rastreamento Híbrido
                 </h3>
                 <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-3">
                     O uso de iscas de carga com comunicação satelital e RF tem aumentado a taxa de recuperação em 30% nas operações de alto risco.
                 </p>
                 <span className="text-[10px] text-gray-400 uppercase font-bold">Fonte: TechLog News</span>
             </div>
        </div>

    </div>
  );
};

export default Dashboard;