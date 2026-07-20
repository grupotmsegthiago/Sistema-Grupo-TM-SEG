import { formatDateBR, formatTimeBR, formatNowDateTimeBR } from '../lib/dateUtils';

import React, { useEffect, useState } from 'react';
import { X, Printer, Loader2, ShieldCheck, Download } from 'lucide-react';
import { Mission, Agent, Vehicle } from '../types';
import { supabase } from '../lib/supabase';
import { findAgentByName, sanitizeAgentField } from '../lib/agents/agentNameMatch';
import { fetchAgentsByNames } from '../lib/agents/fetchAgentsByNames';

interface Props {
  mission: Mission;
  onClose: () => void;
}

const MissionPrintModal: React.FC<Props> = ({ mission, onClose }) => {
  const [agentsDetails, setAgentsDetails] = useState<Agent[]>([]);
  const [vehicleDetails, setVehicleDetails] = useState<Vehicle | null>(null);
  const [clientVehicleInfo, setClientVehicleInfo] = useState<{ plate: string; model: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const agentNames = [mission.agent1, mission.agent2].filter(Boolean);
        if (agentNames.length > 0) {
          const agentsData = await fetchAgentsByNames(supabase, agentNames);
          setAgentsDetails(agentsData as Agent[]);
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

        const cvId = (mission as any).client_vehicle || (mission as any).clientVehicle;
        if (cvId) {
            const { data: cvData } = await supabase.from('client_vehicles').select('plate, model').eq('id', cvId).maybeSingle();
            if (cvData) setClientVehicleInfo({ plate: cvData.plate || '', model: cvData.model || '' });
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
    const originCity = mission.origin ? mission.origin.split(',')[0].split('-')[0].trim() : 'ORIGEM';
    const destCity = mission.destination ? mission.destination.split(',')[0].split('-')[0].trim() : 'DESTINO';
    document.title = `TMSEG - OS ${mission.id} - ${originCity} x ${destCity}`;
    window.print();
    setTimeout(() => { document.title = originalTitle; }, 1000);
  };

  const formatDate = (dateString?: string) => dateString ? formatDateBR(dateString) : '';

  const formatTime = (isoString?: string) => isoString ? formatTimeBR(isoString, '') : '';

  const getAgent = (name?: string) => findAgentByName(agentsDetails, name);

  const clientVehicleLabel = (() => {
    if (clientVehicleInfo?.plate) {
      return clientVehicleInfo.model
        ? `${clientVehicleInfo.plate} - ${clientVehicleInfo.model}`
        : clientVehicleInfo.plate;
    }
    if ((mission as any).clientVehicle?.plate) {
      return `${(mission as any).clientVehicle.plate}${(mission as any).clientVehicle.model ? ' - ' + (mission as any).clientVehicle.model : ''}`;
    }
    return '-';
  })();

  const renderAgentBlock = (agentName?: string, label?: string, badgeLabel?: string) => {
      if (!agentName) return null;
      const agent = getAgent(agentName);

      return (
        <div className="print-section">
            <div className="section-header">{`IDENTIFICAÇÃO DO AGENTE : ${label || 'ESCOLTA'}`}</div>
            <div className="agent-grid">
                <div className="agent-badge">
                   <ShieldCheck size={40} className="text-black" strokeWidth={1.5} />
                   <div className="badge-label">{badgeLabel || 'SEGURANÇA'}</div>
                </div>
                <div className="agent-data">
                    <div className="agent-row">
                        <span className="agent-label">NOME:</span>
                        <span className="agent-value font-bold">{agentName}</span>
                    </div>
                    <div className="agent-row">
                        <span className="agent-label">CPF:</span>
                        <span className="agent-value">{sanitizeAgentField(agent?.cpf) || '-'}</span>
                    </div>
                    <div className="agent-two-col">
                        <div className="agent-col-left">
                            <div className="agent-row"><span className="agent-label">RG:</span><span className="agent-value">{sanitizeAgentField(agent?.rg) || '-'}</span></div>
                            <div className="agent-row"><span className="agent-label">CNH:</span><span className="agent-value">{sanitizeAgentField(agent?.cnh) || '-'}</span></div>
                            <div className="agent-row last"><span className="agent-label">CNV:</span><span className="agent-value">{sanitizeAgentField(agent?.cnv) || 'ISENTO'}</span></div>
                        </div>
                        <div className="agent-col-right">
                            <div className="agent-row"><span className="agent-label-r">CONTATO:</span><span className="agent-value">{sanitizeAgentField(agent?.phone) || '-'}</span></div>
                            <div className="agent-row"><span className="agent-label-r">VAL CNH:</span><span className="agent-value">{formatDate(agent?.cnh_validity) || '-'}</span></div>
                            <div className="agent-row last"><span className="agent-label-r">VAL CNV:</span><span className="agent-value">{formatDate(agent?.cnv_validity) || '-'}</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      
      <style>{`
        @media print {
          @page { size: A4; margin: 5mm; }
          html, body { height: 100% !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body * { visibility: hidden !important; }
          #print-content, #print-content * { visibility: visible !important; }
          #print-content { position: fixed !important; left: 0 !important; top: 0 !important; width: 100% !important; height: auto !important; margin: 0 !important; padding: 5mm !important; background: white !important; z-index: 99999 !important; box-shadow: none !important; overflow: visible !important; }
          .no-print { display: none !important; }
        }

        #print-content .print-section { border: 1px solid #000; margin-bottom: 4px; }
        #print-content .section-header { background: linear-gradient(to right, #000, #7f1d1d); color: #fff; font-size: 9px; font-weight: 700; text-align: center; padding: 3px 6px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #000; }
        @media print { #print-content .section-header { background: #000 !important; color: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
        
        #print-content .agent-grid { display: flex; }
        #print-content .agent-badge { width: 80px; border-right: 1px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f9fafb; padding: 4px; min-height: 76px; }
        #print-content .badge-label { width: 100%; background: #000; color: #fff; font-size: 7px; font-weight: 900; text-align: center; margin-top: 2px; padding: 1px 0; text-transform: uppercase; }
        #print-content .agent-data { flex: 1; font-size: 9px; text-transform: uppercase; }
        #print-content .agent-row { display: flex; border-bottom: 1px solid #000; }
        #print-content .agent-row.last { border-bottom: none; }
        #print-content .agent-label { width: 50px; background: #e5e7eb; padding: 2px 4px; font-weight: 700; border-right: 1px solid #000; flex-shrink: 0; }
        #print-content .agent-label-r { width: 60px; background: #e5e7eb; padding: 2px 4px; font-weight: 700; border-right: 1px solid #000; flex-shrink: 0; }
        #print-content .agent-value { padding: 2px 6px; flex: 1; }
        #print-content .agent-two-col { display: grid; grid-template-columns: 1fr 1fr; }
        #print-content .agent-col-left { border-right: 1px solid #000; }
        @media print { #print-content .agent-label, #print-content .agent-label-r { background: #e5e7eb !important; -webkit-print-color-adjust: exact !important; } }

        #print-content .data-table { width: 100%; border-collapse: collapse; font-size: 9px; text-transform: uppercase; margin-bottom: 4px; }
        #print-content .data-table td, #print-content .data-table th { border: 1px solid #000; padding: 2px 6px; }
        #print-content .data-table .label-cell { background: linear-gradient(to right, #000, #7f1d1d); color: #fff; font-weight: 700; width: 90px; letter-spacing: 0.03em; font-size: 9px; }
        @media print { #print-content .data-table .label-cell { background: #000 !important; color: #fff !important; -webkit-print-color-adjust: exact !important; } }

        #print-content .vehicle-grid { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; font-size: 9px; text-transform: uppercase; }
        #print-content .vehicle-grid .vg-header { background: #e5e7eb; font-weight: 700; padding: 2px 4px; border-bottom: 1px solid #000; border-right: 1px solid #000; }
        #print-content .vehicle-grid .vg-header:last-child { border-right: none; }
        #print-content .vehicle-grid .vg-cell { padding: 3px 4px; font-weight: 700; border-right: 1px solid #000; }
        #print-content .vehicle-grid .vg-cell:last-child { border-right: none; }
        @media print { #print-content .vehicle-grid .vg-header { background: #e5e7eb !important; -webkit-print-color-adjust: exact !important; } }

        #print-content .cargo-table { width: 100%; font-size: 9px; text-transform: uppercase; }
        #print-content .cargo-table td { padding: 2px 6px; }
        #print-content .cargo-label { width: 70px; background: #e5e7eb; font-weight: 700; border-right: 1px solid #000; border-bottom: 1px solid #000; }
        #print-content .cargo-val { border-bottom: 1px solid #000; }
        #print-content .cargo-label-last { width: 70px; background: #e5e7eb; font-weight: 700; border-right: 1px solid #000; }
        @media print { #print-content .cargo-label, #print-content .cargo-label-last { background: #e5e7eb !important; -webkit-print-color-adjust: exact !important; } }

        #print-content .timeline-table { width: 100%; border-collapse: collapse; font-size: 9px; text-transform: uppercase; margin-bottom: 4px; }
        #print-content .timeline-table th { border: 1px solid #000; padding: 2px 6px; background: linear-gradient(to right, #991b1b, #dc2626); color: #fff; font-weight: 700; }
        #print-content .timeline-table td { border: 1px solid #000; padding: 2px 6px; }
        @media print { #print-content .timeline-table th { background: #000 !important; color: #fff !important; -webkit-print-color-adjust: exact !important; } }
      `}</style>

      <div className="bg-white w-full max-w-[210mm] max-h-[90vh] shadow-2xl overflow-hidden flex flex-col rounded-lg">
        
        <div className="bg-gradient-to-r from-red-900 to-black text-white p-4 flex justify-between items-center shadow-md shrink-0 no-print">
            <h2 className="font-bold flex items-center gap-2 uppercase tracking-wider text-sm">
                <Printer size={18} className="text-red-400" /> Visualização de Impressão
            </h2>
            <div className="flex gap-3">
                <button onClick={handlePrint} className="bg-white text-red-900 hover:bg-gray-100 px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-all hover:scale-105 active:scale-95" data-testid="button-save-pdf">
                    <Download size={16} /> SALVAR PDF
                </button>
                <button onClick={onClose} className="bg-black/20 hover:bg-black/40 text-white border border-white/20 px-6 py-2 rounded-lg text-sm font-bold transition-all" data-testid="button-close-print">
                    <X size={16} /> FECHAR
                </button>
            </div>
        </div>

        <div className="overflow-y-auto flex-1 bg-gray-100 p-8 flex justify-center">
            <div id="print-content" className="bg-white w-[210mm] print:w-full min-h-[297mm] print:min-h-0 p-6 print:p-0 shadow-sm print:shadow-none text-black font-sans box-border relative" style={{ fontSize: '9px' }}>
                
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 size={32} className="animate-spin text-gray-400" />
                    </div>
                ) : (
                    <div style={{ border: '2px solid #000', padding: '3px' }}>
                        
                        {/* CABEÇALHO */}
                        <div style={{ display: 'flex', borderBottom: '2px solid #000', marginBottom: '4px', paddingBottom: '4px' }}>
                            <div style={{ width: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #ccc', paddingRight: '8px' }}>
                                <img src="/logo.png" alt="Logo" style={{ maxHeight: '50px', objectFit: 'contain' }} />
                            </div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px' }}>GRUPO TMSEG - GESTÃO DE RISCO</div>
                                    <div style={{ fontSize: '10px', color: '#666', fontWeight: 400, marginTop: '2px', textTransform: 'uppercase' }}>Relatório de Operação de Escolta</div>
                                </div>
                            </div>
                        </div>

                        {/* DADOS PRINCIPAIS */}
                        <table className="data-table">
                            <tbody>
                                <tr>
                                    <td className="label-cell">FOLHA / OS</td>
                                    <td style={{ fontWeight: 700, fontSize: '12px' }}>{mission.id}</td>
                                    <td className="label-cell">OPERAÇÃO</td>
                                    <td>{mission.mission_type || 'CARACTERIZADA'}</td>
                                </tr>
                                <tr>
                                    <td className="label-cell">ROTA</td>
                                    <td colSpan={3} style={{ lineHeight: '1.3' }}>
                                        {mission.origin} <span style={{ fontWeight: 700, margin: '0 4px' }}>PARA</span> {mission.destination}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* CLIENTE */}
                        <div className="print-section">
                            <div className="section-header">EMPRESA CONTRATANTE / CLIENTE</div>
                            <div style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' }}>
                                {mission.client}
                            </div>
                        </div>

                        {/* AGENTES */}
                        {renderAgentBlock(mission.agent1, 'LÍDER / MOTORISTA', 'AGENTE 01')}
                        {renderAgentBlock(mission.agent2, 'ESCOLTA AUXILIAR', 'AGENTE 02')}

                        {/* VIATURA */}
                        <div className="print-section" style={{ marginTop: '4px' }}>
                            <div className="section-header">DADOS DA VIATURA E RASTREAMENTO</div>
                            <div className="vehicle-grid">
                                <div className="vg-header">VIATURA</div>
                                <div className="vg-header">COR</div>
                                <div className="vg-header">PLACA</div>
                                <div className="vg-header" style={{ borderRight: 'none' }}>RASTREADOR / ID</div>
                                <div className="vg-cell">{vehicleDetails?.model || '-'}</div>
                                <div className="vg-cell">{vehicleDetails?.color || '-'}</div>
                                <div className="vg-cell">{vehicleDetails?.plate || '-'}</div>
                                <div className="vg-cell" style={{ borderRight: 'none' }}>{vehicleDetails?.tracker_type || '-'} / {vehicleDetails?.tracker_id || '-'}</div>
                            </div>
                        </div>

                        {/* CARGA / VEÍCULO CLIENTE */}
                        <div className="print-section" style={{ marginTop: '4px' }}>
                            <div className="section-header">DADOS DA CARGA / VEÍCULO CLIENTE</div>
                            <table className="cargo-table">
                                <tbody>
                                    <tr>
                                        <td className="cargo-label">MOTORISTA:</td>
                                        <td className="cargo-val">{mission.driver_name || '-'}</td>
                                        <td className="cargo-label" style={{ borderLeft: '1px solid #000' }}>TELEFONE:</td>
                                        <td className="cargo-val">{mission.driver_phone || '-'}</td>
                                    </tr>
                                    <tr>
                                        <td className="cargo-label-last">VEÍCULO:</td>
                                        <td>{clientVehicleLabel}</td>
                                        <td className="cargo-label-last" style={{ borderLeft: '1px solid #000' }}>GR/DOC:</td>
                                        <td>{mission.gr_espelhamento || '-'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* OCORRÊNCIA */}
                        <div className="print-section" style={{ marginTop: '4px' }}>
                            <div className="section-header">ÚLTIMA ATUALIZAÇÃO / OCORRÊNCIA</div>
                            <div style={{ padding: '4px 8px', fontSize: '9px', textTransform: 'uppercase', fontWeight: 500, minHeight: '30px' }}>
                                {mission.currentLocation || 'Sem ocorrências registradas.'}
                            </div>
                        </div>

                        {/* TIMELINE */}
                        <table className="timeline-table" style={{ marginTop: '4px' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '30px' }}>ICON</th>
                                    <th style={{ textAlign: 'left' }}>SITUAÇÃO / ETAPA</th>
                                    <th style={{ width: '120px', textAlign: 'center' }}>DATA/HORA</th>
                                    <th style={{ width: '60px', textAlign: 'center' }}>KM</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ textAlign: 'center' }}>📝</td>
                                    <td style={{ fontWeight: 700 }}>DATA DA CRIAÇÃO</td>
                                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{formatDate(mission.createdAt)} {formatTime(mission.createdAt)}</td>
                                    <td style={{ textAlign: 'center' }}>-</td>
                                </tr>
                                <tr>
                                    <td style={{ textAlign: 'center' }}>📅</td>
                                    <td style={{ fontWeight: 700 }}>DATA DO AGENDAMENTO</td>
                                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{mission.startTime ? `${formatDate(mission.startTime)} ${formatTime(mission.startTime)}` : '-'}</td>
                                    <td style={{ textAlign: 'center' }}>-</td>
                                </tr>
                                <tr>
                                    <td style={{ textAlign: 'center' }}>📍</td>
                                    <td style={{ fontWeight: 700 }}>DATA DA CHEGADA NA ORIGEM</td>
                                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{mission.startTime ? `${formatDate(mission.startTime)} ${formatTime(mission.startTime)}` : '-'}</td>
                                    <td style={{ textAlign: 'center' }}>{mission.startKm || '-'}</td>
                                </tr>
                                <tr>
                                    <td style={{ textAlign: 'center' }}>🏁</td>
                                    <td style={{ fontWeight: 700 }}>DATA DE CONCLUÍDO</td>
                                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{mission.endTime ? `${formatDate(mission.endTime)} ${formatTime(mission.endTime)}` : '-'}</td>
                                    <td style={{ textAlign: 'center' }}>{mission.endKm || '-'}</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* RODAPÉ */}
                        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '9px', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700, borderTop: '1px solid #d1d5db', paddingTop: '6px' }}>
                            ATENCIOSAMENTE DEPARTAMENTO DE ESCOLTA ARMADA - GRUPO TMSEG
                            <br/>
                            <span style={{ fontWeight: 400, textTransform: 'none' }}>Documento gerado eletronicamente em {formatNowDateTimeBR()}</span>
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
