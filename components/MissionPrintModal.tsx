
import React, { useEffect, useState } from 'react';
import { X, Printer, Loader2, ShieldCheck, Download } from 'lucide-react';
import { Mission, Agent, Vehicle } from '../types';
import { supabase } from '../lib/supabase';

interface Props {
  mission: Mission;
  onClose: () => void;
}

const MissionPrintModal: React.FC<Props> = ({ mission, onClose }) => {
  const [agentsDetails, setAgentsDetails] = useState<Agent[]>([]);
  const [vehicleDetails, setVehicleDetails] = useState<Vehicle | null>(null);
  const [evidenceUrls, setEvidenceUrls] = useState<{ url: string; uploadedBy: string; uploadedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const agentNames = [mission.agent1, mission.agent2].filter(Boolean);
        if (agentNames.length > 0) {
          const { data: agentsData } = await supabase
            .from('agents')
            .select('*')
            .in('name', agentNames);
          if (agentsData) setAgentsDetails(agentsData as Agent[]);
        }

        if (mission.vehicleId) {
            let query = supabase.from('vehicles').select('*');
            if (!isNaN(Number(mission.vehicleId))) {
                query = query.eq('id', mission.vehicleId);
            } else {
                query = query.eq('plate', mission.vehicleId);
            }
            const { data: vehicleData } = await query.maybeSingle();
            if (vehicleData) setVehicleDetails(vehicleData as Vehicle);
        }

        const { data: evData } = await supabase.from('system_logs').select('details').eq('entity', 'MissionEvidence').eq('entity_id', mission.id);
        if (evData) {
            const list = evData.map((e: any) => {
                try { const p = JSON.parse(e.details); return { url: p.publicUrl || '', uploadedBy: p.uploadedBy || '', uploadedAt: p.uploadedAt || '' }; } catch { return null; }
            }).filter(Boolean);
            setEvidenceUrls(list);
        }

      } catch (error) {
        console.error("Erro ao carregar detalhes para impressão", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [mission]);

  const handlePrint = () => {
    const originalTitle = document.title;
    
    // Formata o nome do arquivo para o PDF
    const originCity = mission.origin ? mission.origin.split(',')[0].split('-')[0].trim() : 'ORIGEM';
    const destCity = mission.destination ? mission.destination.split(',')[0].split('-')[0].trim() : 'DESTINO';
    
    document.title = `TMSEG - OS ${mission.id} - ${originCity} x ${destCity}`;
    
    window.print();
    
    // Restaura o título original
    setTimeout(() => {
        document.title = originalTitle;
    }, 1000);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatTime = (isoString?: string) => {
      if (!isoString) return '';
      try {
          return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } catch { return ''; }
  };

  const getAgent = (name?: string) => {
      return agentsDetails.find(a => a.name === name);
  };

  const renderAgentRow = (agentName?: string, label?: string, badgeLabel?: string) => {
      if (!agentName) return null;
      const agent = getAgent(agentName);

      return (
        <div className="border border-black mb-2 break-inside-avoid">
            <div className="bg-gradient-to-r from-black to-red-900 text-white border-b border-black px-2 py-1 font-bold text-center text-xs uppercase tracking-wider print:bg-black print:text-white">
                IDENTIFICAÇÃO DO AGENTE : {label || 'ESCOLTA'}
            </div>
            <div className="flex">
                {/* Crachá / Ícone */}
                <div className="w-28 border-r border-black flex flex-col items-center justify-center bg-gray-50 min-h-[90px] p-1">
                    <div className="flex-1 flex flex-col items-center justify-center opacity-90">
                       <ShieldCheck size={48} className="text-black" strokeWidth={1.5} />
                    </div>
                    <div className="w-full bg-black text-white text-[8px] font-black text-center mt-1 uppercase py-0.5">
                        {badgeLabel || 'SEGURANÇA'}
                    </div>
                </div>
                
                {/* Dados do Agente */}
                <div className="flex-1 text-[10px] uppercase">
                    <div className="flex border-b border-black">
                        <div className="w-16 bg-gray-200 px-1 py-0.5 font-bold border-r border-black flex items-center print:bg-gray-200">NOME:</div>
                        <div className="flex-1 px-2 py-0.5 font-bold text-black">{agentName}</div>
                    </div>
                    <div className="flex border-b border-black">
                        <div className="w-16 bg-gray-200 px-1 py-0.5 font-bold border-r border-black print:bg-gray-200">CPF:</div>
                        <div className="flex-1 px-2 py-0.5">{agent?.cpf || '-'}</div>
                    </div>
                    
                    <div className="grid grid-cols-2">
                        <div className="border-r border-black">
                            <div className="flex border-b border-black">
                                <div className="w-16 bg-gray-200 px-1 py-0.5 font-bold border-r border-black print:bg-gray-200">RG:</div>
                                <div className="flex-1 px-2 py-0.5">{agent?.rg || '-'}</div>
                            </div>
                            <div className="flex border-b border-black">
                                <div className="w-16 bg-gray-200 px-1 py-0.5 font-bold border-r border-black print:bg-gray-200">CNH:</div>
                                <div className="flex-1 px-2 py-0.5">{agent?.cnh || '-'}</div>
                            </div>
                            <div className="flex">
                                <div className="w-16 bg-gray-200 px-1 py-0.5 font-bold border-r border-black print:bg-gray-200">CNV:</div>
                                <div className="flex-1 px-2 py-0.5">{agent?.cnv || '-'}</div>
                            </div>
                        </div>
                        
                        <div>
                            <div className="flex border-b border-black">
                                <div className="w-20 bg-gray-200 px-1 py-0.5 font-bold border-r border-black print:bg-gray-200">CONTATO:</div>
                                <div className="flex-1 px-2 py-0.5">{agent?.phone || '-'}</div>
                            </div>
                            <div className="flex border-b border-black">
                                <div className="w-20 bg-gray-200 px-1 py-0.5 font-bold border-r border-black print:bg-gray-200">VAL CNH:</div>
                                <div className="flex-1 px-2 py-0.5">{formatDate(agent?.cnh_validity) || '-'}</div>
                            </div>
                            <div className="flex">
                                <div className="w-20 bg-gray-200 px-1 py-0.5 font-bold border-r border-black print:bg-gray-200">VAL CNV:</div>
                                <div className="flex-1 px-2 py-0.5">{formatDate(agent?.cnv_validity) || '-'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      
      {/* CSS Específico para Impressão Limpa */}
      <style>{`
        @media print {
          @page { margin: 10mm; size: A4; }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden;
          }
          #print-content, #print-content * {
            visibility: visible;
          }
          #print-content {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            margin: 0;
            padding: 10px;
            background: white;
            z-index: 9999;
            box-shadow: none;
            overflow: visible;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Container Principal */}
      <div className="bg-white w-full max-w-[210mm] max-h-[90vh] shadow-2xl overflow-hidden flex flex-col rounded-lg">
        
        {/* Toolbar (Não aparece na impressão) */}
        <div className="bg-gradient-to-r from-red-900 to-black text-white p-4 flex justify-between items-center shadow-md shrink-0 no-print">
            <h2 className="font-bold flex items-center gap-2 uppercase tracking-wider text-sm">
                <Printer size={18} className="text-red-400" /> Visualização de Impressão
            </h2>
            <div className="flex gap-3">
                <button onClick={handlePrint} className="bg-white text-red-900 hover:bg-gray-100 px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-all hover:scale-105 active:scale-95">
                    <Download size={16} /> SALVAR PDF
                </button>
                <button onClick={onClose} className="bg-black/20 hover:bg-black/40 text-white border border-white/20 px-6 py-2 rounded-lg text-sm font-bold transition-all">
                    <X size={16} /> FECHAR
                </button>
            </div>
        </div>

        {/* Conteúdo da Folha (A4 Like) - ID usado pelo CSS de impressão */}
        <div className="overflow-y-auto flex-1 bg-gray-100 p-8 flex justify-center">
            <div id="print-content" className="bg-white w-[210mm] print:w-full min-h-[297mm] print:min-h-0 p-8 print:p-0 shadow-sm print:shadow-none text-black font-sans box-border relative">
                
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 size={32} className="animate-spin text-gray-400" />
                    </div>
                ) : (
                    <div className="border-2 border-black p-1 h-full">
                        
                        {/* CABEÇALHO */}
                        <div className="flex border-b-2 border-black mb-2 pb-2">
                            <div className="w-48 flex items-center justify-center border-r border-gray-300 pr-4">
                                <img src="/logo.png" alt="Logo" className="max-h-16 object-contain" />
                            </div>
                            <div className="flex-1 flex items-center justify-center">
                                <h1 className="text-xl font-black uppercase tracking-widest text-center">
                                    GRUPO TMSEG - GESTÃO DE RISCO<br/>
                                    <span className="text-sm font-normal text-gray-600 tracking-normal">Relatório de Operação de Escolta</span>
                                </h1>
                            </div>
                        </div>

                        {/* DADOS PRINCIPAIS */}
                        <table className="w-full border-collapse border border-black text-[10px] uppercase mb-2">
                            <tbody>
                                <tr>
                                    <td className="border border-black bg-gradient-to-r from-black to-red-900 text-white px-2 py-1 font-bold w-32 tracking-wider print:bg-black print:text-white">FOLHA / OS</td>
                                    <td className="border border-black px-2 py-1 font-bold text-lg">{mission.id}</td>
                                    <td className="border border-black bg-gradient-to-r from-black to-red-900 text-white px-2 py-1 font-bold w-32 tracking-wider print:bg-black print:text-white">OPERAÇÃO</td>
                                    <td className="border border-black px-2 py-1">{mission.mission_type || 'CARACTERIZADA'}</td>
                                </tr>
                                <tr>
                                    <td className="border border-black bg-gradient-to-r from-black to-red-900 text-white px-2 py-1 font-bold tracking-wider print:bg-black print:text-white">ROTA</td>
                                    <td className="border border-black px-2 py-1" colSpan={3}>
                                        {mission.origin} <span className="font-bold mx-2">PARA</span> {mission.destination}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* CLIENTE */}
                        <div className="border border-black mb-2">
                            <div className="bg-gradient-to-r from-black to-red-900 text-white border-b border-black px-2 py-1 font-bold text-center text-xs uppercase tracking-wider print:bg-black print:text-white">
                                EMPRESA CONTRATANTE / CLIENTE
                            </div>
                            <div className="px-2 py-2 text-center font-bold text-xs uppercase">
                                {mission.client}
                            </div>
                        </div>

                        {/* AGENTES (LOOP) */}
                        {renderAgentRow(mission.agent1, 'LÍDER / MOTORISTA', 'AGENTE 01')}
                        {renderAgentRow(mission.agent2, 'ESCOLTA AUXILIAR', 'AGENTE 02')}

                        {/* VIATURA */}
                        <div className="border border-black mb-2 mt-4 break-inside-avoid">
                            <div className="bg-gradient-to-r from-black to-red-900 text-white border-b border-black px-2 py-1 font-bold text-center text-xs uppercase tracking-wider print:bg-black print:text-white">
                                DADOS DA VIATURA E RASTREAMENTO
                            </div>
                            <div className="text-[10px] uppercase">
                                <div className="grid grid-cols-4 border-b border-black text-center font-bold bg-gray-200 print:bg-gray-200">
                                    <div className="py-1 border-r border-black">VIATURA</div>
                                    <div className="py-1 border-r border-black">COR</div>
                                    <div className="py-1 border-r border-black">PLACA</div>
                                    <div className="py-1">RASTREADOR / ID</div>
                                </div>
                                <div className="grid grid-cols-4 text-center font-bold">
                                    <div className="py-1 border-r border-black">{vehicleDetails?.model || '-'}</div>
                                    <div className="py-1 border-r border-black">{vehicleDetails?.color || '-'}</div>
                                    <div className="py-1 border-r border-black">{vehicleDetails?.plate || mission.vehicleId || '-'}</div>
                                    <div className="py-1">{vehicleDetails?.tracker_type || '-'} / {vehicleDetails?.tracker_id || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* CARGA / CLIENTE */}
                        <div className="border border-black mb-2 mt-4 break-inside-avoid">
                            <div className="bg-gradient-to-r from-black to-red-900 text-white border-b border-black px-2 py-1 font-bold text-center text-xs uppercase tracking-wider print:bg-black print:text-white">
                                DADOS DA CARGA / VEÍCULO CLIENTE
                            </div>
                            <table className="w-full text-[10px] uppercase text-left">
                                <tbody>
                                    <tr>
                                        <td className="w-24 bg-gray-200 font-bold px-2 py-1 border-r border-b border-black print:bg-gray-200">MOTORISTA:</td>
                                        <td className="px-2 py-1 border-b border-black">{mission.driver_name || '-'}</td>
                                        <td className="w-24 bg-gray-200 font-bold px-2 py-1 border-r border-b border-l border-black print:bg-gray-200">TELEFONE:</td>
                                        <td className="px-2 py-1 border-b border-black">{mission.driver_phone || '-'}</td>
                                    </tr>
                                    <tr>
                                        <td className="bg-gray-200 font-bold px-2 py-1 border-r border-black print:bg-gray-200">VEÍCULO:</td>
                                        <td className="px-2 py-1">{mission.clientVehicle?.plate} - {mission.clientVehicle?.model}</td>
                                        <td className="bg-gray-200 font-bold px-2 py-1 border-r border-l border-black print:bg-gray-200">GR/DOC:</td>
                                        <td className="px-2 py-1">{mission.gr_espelhamento || '-'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* EXCEDENTES */}
                        {mission.billing_approved && (
                            <div className="border border-black mb-2 mt-4 break-inside-avoid">
                                <div className="bg-gradient-to-r from-black to-red-900 text-white border-b border-black px-2 py-1 font-bold text-center text-xs uppercase tracking-wider print:bg-black print:text-white">
                                    DEMONSTRATIVO DE EXCEDENTES E VARIÁVEIS
                                </div>
                                <table className="w-full text-[10px] uppercase border-collapse">
                                    <thead className="bg-gray-200 text-center font-bold print:bg-gray-200">
                                        <tr>
                                            <th className="border border-black px-2 py-1 w-1/3">ITEM</th>
                                            <th className="border border-black px-2 py-1">VALOR UNITÁRIO</th>
                                            <th className="border border-black px-2 py-1">QUANTIDADE</th>
                                            <th className="border border-black px-2 py-1 text-right">TOTAL</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="border border-black px-2 py-1 font-bold">KM EXCEDENTE</td>
                                            <td className="border border-black px-2 py-1 text-center">-</td>
                                            <td className="border border-black px-2 py-1 text-center font-bold">{mission.endKm && mission.startKm ? (mission.endKm - mission.startKm).toFixed(0) : 0} KM</td>
                                            <td className="border border-black px-2 py-1 text-right">R$ {(mission.revenue_value || 0).toFixed(2)} (Base + Extra)</td>
                                        </tr>
                                        <tr>
                                            <td className="border border-black px-2 py-1 font-bold">HORA EXCEDENTE</td>
                                            <td className="border border-black px-2 py-1 text-center">-</td>
                                            <td className="border border-black px-2 py-1 text-center">-</td>
                                            <td className="border border-black px-2 py-1 text-right">-</td>
                                        </tr>
                                        <tr>
                                            <td className="border border-black px-2 py-1 font-bold">PEDÁGIO / REEMBOLSO</td>
                                            <td className="border border-black px-2 py-1 text-center">COMPROVADO</td>
                                            <td className="border border-black px-2 py-1 text-center">1</td>
                                            <td className="border border-black px-2 py-1 text-right font-bold">R$ {(mission.toll_value || 0).toFixed(2)}</td>
                                        </tr>
                                    </tbody>
                                    <tfoot className="bg-gray-100 font-black">
                                        <tr>
                                            <td colSpan={3} className="border border-black px-2 py-1 text-right">TOTAL GERAL DA MISSÃO:</td>
                                            <td className="border border-black px-2 py-1 text-right">R$ {((mission.revenue_value || 0) + (mission.toll_value || 0)).toFixed(2)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}

                        {/* STATUS */}
                        <div className="border border-black mb-2 mt-4 break-inside-avoid">
                            <div className="bg-gradient-to-r from-black to-red-900 text-white border-b border-black px-2 py-1 font-bold text-center text-xs uppercase tracking-wider print:bg-black print:text-white">
                                ÚLTIMA ATUALIZAÇÃO / OCORRÊNCIA
                            </div>
                            <div className="p-2 text-xs uppercase font-medium min-h-[60px]">
                                {mission.currentLocation || 'Sem ocorrências registradas.'}
                            </div>
                        </div>

                        {/* DADOS DA OPERAÇÃO (CONSOLIDADO) */}
                        <table className="w-full border-collapse border border-black text-[10px] uppercase mb-4">
                            <thead>
                                <tr className="bg-gradient-to-r from-red-800 to-red-600 text-white print:bg-black print:text-white">
                                    <th className="border border-black px-2 py-1 w-10">ICON</th>
                                    <th className="border border-black px-2 py-1 text-left">SITUAÇÃO / ETAPA</th>
                                    <th className="border border-black px-2 py-1 w-32 text-center">DATA/HORA</th>
                                    <th className="border border-black px-2 py-1 w-20 text-center">KM</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-black text-center py-1">📝</td>
                                    <td className="border border-black px-2 py-1 font-bold">DATA DA CRIAÇÃO</td>
                                    <td className="border border-black px-2 py-1 text-center font-mono">
                                        {formatDate(mission.createdAt)} {formatTime(mission.createdAt)}
                                    </td>
                                    <td className="border border-black px-2 py-1 text-center">-</td>
                                </tr>
                                <tr>
                                    <td className="border border-black text-center py-1">📅</td>
                                    <td className="border border-black px-2 py-1 font-bold">DATA DO AGENDAMENTO</td>
                                    <td className="border border-black px-2 py-1 text-center font-mono">
                                        {mission.startTime ? `${formatDate(mission.startTime)} ${formatTime(mission.startTime)}` : '-'}
                                    </td>
                                    <td className="border border-black px-2 py-1 text-center">-</td>
                                </tr>
                                <tr>
                                    <td className="border border-black text-center py-1">📍</td>
                                    <td className="border border-black px-2 py-1 font-bold">DATA DA CHEGADA NA ORIGEM</td>
                                    <td className="border border-black px-2 py-1 text-center font-mono">
                                        {mission.startTime ? `${formatDate(mission.startTime)} ${formatTime(mission.startTime)}` : '-'}
                                    </td>
                                    <td className="border border-black px-2 py-1 text-center">{mission.startKm || '-'}</td>
                                </tr>
                                <tr>
                                    <td className="border border-black text-center py-1">🏁</td>
                                    <td className="border border-black px-2 py-1 font-bold">DATA DE CONCLUÍDO</td>
                                    <td className="border border-black px-2 py-1 text-center font-mono">
                                        {mission.endTime ? `${formatDate(mission.endTime)} ${formatTime(mission.endTime)}` : '-'}
                                    </td>
                                    <td className="border border-black px-2 py-1 text-center">{mission.endKm || '-'}</td>
                                </tr>
                            </tbody>
                        </table>


                        {/* RODAPÉ */}
                        <div className="mt-8 text-center text-[10px] uppercase text-gray-500 font-bold border-t border-gray-300 pt-2">
                            ATENCIOSAMENTE DEPARTAMENTO DE ESCOLTA ARMADA - GRUPO TMSEG
                            <br/>
                            <span className="font-normal normal-case">Documento gerado eletronicamente em {new Date().toLocaleString('pt-BR')}</span>
                        </div>

                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default MissionPrintModal;
