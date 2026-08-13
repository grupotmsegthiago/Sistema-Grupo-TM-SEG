
import React, { useState, useEffect } from 'react';
import { X, Printer, Download, ShieldCheck, MapPin, Flag, Navigation, Clock, DollarSign, Calendar, Fingerprint, Building2, Loader2, FileDown, CircleDot } from 'lucide-react';
import { Quote } from '../types';
import { supabase } from '../lib/supabase';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface Props {
  quote: Quote;
  onClose: () => void;
  waypoints?: string[];
}

const QuotePrintModal: React.FC<Props> = ({ quote, onClose, waypoints = [] }) => {
  const [clientCnpj, setClientCnpj] = useState<string>('');
  const [clientTradingName, setClientTradingName] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [associatedTable, setAssociatedTable] = useState<any>(null);

  const extractDetail = (keys: string[]) => {
      if (!quote.contract_details) return null;
      const lines = quote.contract_details.split('\n');
      
      for (const key of keys) {
          // Busca mais flexível (ignora case e espaços extras)
          const line = lines.find(l => l.toUpperCase().includes(key.toUpperCase()));
          if (line) {
              const parts = line.split(':');
              if (parts.length > 1) {
                  return parts[1].trim();
              }
              // Tenta pegar o valor se não tiver dois pontos, mas tiver R$
              if (line.includes('R$')) {
                  const valueMatch = line.match(/R\$\s*[\d.,]+/);
                  if (valueMatch) return valueMatch[0];
              }
          }
      }
      return null;
  };

  useEffect(() => {
    const fetchClientData = async () => {
      try {
        // Busca CNPJ e Nome Fantasia
        let cnpj = '';
        let tradingName = '';

        if (quote.client_id && quote.client_id !== 0) {
          const { data } = await supabase.from('clients').select('cnpj, trading_name').eq('id', quote.client_id).maybeSingle();
          if (data) {
              cnpj = data.cnpj;
              tradingName = data.trading_name;
          }
        } else {
            const { data } = await supabase.from('clients').select('cnpj, trading_name').eq('name', quote.client_name).maybeSingle();
            if (data) {
                cnpj = data.cnpj;
                tradingName = data.trading_name;
            }
        }
        setClientCnpj(cnpj);
        setClientTradingName(tradingName);

        // Busca Tabela Associada (Fallback para valores)
        if (quote.contract_details) {
            const tableName = extractDetail(['Base Contratual', 'Tabela', 'Tabela Base']);
            if (tableName) {
                // Tenta encontrar a tabela pelo nome extraído
                const { data: tables } = await supabase.from('client_price_tables')
                    .select('*')
                    .eq('client', quote.client_name);
                
                if (tables) {
                    // Match aproximado
                    const match = tables.find(t => 
                        t.operation_type.toUpperCase().includes(tableName.toUpperCase().trim()) || 
                        tableName.toUpperCase().includes(t.operation_type.toUpperCase())
                    );
                    if (match) setAssociatedTable(match);
                }
            }
        }
      } catch (err) {
        console.error("Erro ao buscar dados complementares:", err);
      }
    };

    fetchClientData();
  }, [quote]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    
    try {
        const element = document.getElementById('print-area');
        if (!element) return;

        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`SIMULACAO_TMSEG_${(clientTradingName || quote.client_name).replace(/\s+/g, '_').toUpperCase()}.pdf`);
    } catch (error) {
        console.error("Erro ao exportar PDF:", error);
        alert("Ocorreu um erro ao gerar o arquivo PDF.");
    } finally {
        setIsExporting(false);
    }
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getExtraKmValue = () => {
    // 1. Tenta extrair do texto do contrato (Calculadora) com NOVAS VARIAÇÕES
    const fromText = extractDetail([
        'KM Extra Aplicado', 
        'KM Excedente', 
        'Valor KM Extra', 
        'KM Extra', 
        'KM EXC.', 
        'KM EXC', 
        'Valor KM',
        'Simulação de KM'
    ]);
    if (fromText) return fromText;

    // 2. Tenta extrair dos itens (Formulário Manual)
    if (quote.items && quote.items.length > 0) {
        const maxVal = Math.max(...quote.items.map(i => i.price_km_extra || 0));
        if (maxVal > 0) return formatCurrency(maxVal);
    }

    // 3. Fallback: Tenta pegar da tabela associada encontrada
    if (associatedTable && associatedTable.price_per_extra_km !== undefined) {
        return formatCurrency(associatedTable.price_per_extra_km);
    }

    return 'Sob Consulta';
  };

  const getExtraHourValue = () => {
    // 1. Tenta extrair do texto do contrato (Calculadora)
    const fromText = extractDetail([
        'Hora Extra Aplicada', 
        'Hora Excedente', 
        'Valor Hora Extra', 
        'Hora Extra',
        'HR Extra',
        'HR EXC.',
        'HR EXC',
        'Simulação Hora Extra'
    ]);
    if (fromText) return fromText;

    // 2. Tenta extrair dos itens (Formulário Manual)
    if (quote.items && quote.items.length > 0) {
        const maxVal = Math.max(...quote.items.map(i => i.price_hour_extra || 0));
        if (maxVal > 0) return formatCurrency(maxVal);
    }

    // 3. Fallback: Tenta pegar da tabela associada encontrada
    if (associatedTable && associatedTable.price_per_extra_hour !== undefined) {
        return formatCurrency(associatedTable.price_per_extra_hour);
    }

    return 'Sob Consulta';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <style>{`
        @media print {
          @page { margin: 10mm; size: portrait; }
          body * { visibility: hidden; }
          #modal-wrapper, #modal-wrapper * { visibility: visible; }
          #modal-wrapper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          #print-area {
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 20px !important;
            margin: 0 auto !important;
            border: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div id="modal-wrapper" className="bg-slate-800 w-full max-w-4xl max-h-[95vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col border border-white/10 my-auto">
        
        <div className="p-6 flex justify-between items-center border-b border-white/5 bg-slate-950 no-print">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-red-600 rounded-xl text-white shadow-lg">
                <FileDown size={22} />
            </div>
            <div>
                <h3 className="text-white font-black uppercase tracking-tight text-lg">Gerador de Arquivo</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Documento Final da Simulação</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button 
                onClick={handleExportPDF} 
                disabled={isExporting}
                className="bg-red-600 text-white hover:bg-red-700 px-6 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-xl transition-all active:scale-95 disabled:opacity-50"
            >
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} BAIXAR ARQUIVO PDF
            </button>
            <button onClick={handlePrint} className="bg-white text-slate-900 hover:bg-gray-100 px-6 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-xl transition-all">
                <Printer size={16} /> IMPRIMIR
            </button>
            <button onClick={onClose} className="p-2.5 hover:bg-white/10 text-white rounded-full transition-colors"><X size={24}/></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-700/30 p-10 flex justify-center scrollbar-thin">
            <div id="print-area" className="bg-white w-[210mm] min-h-[297mm] p-12 shadow-2xl text-slate-900 font-sans border-t-[12px] border-red-700 flex flex-col">
                
                <div className="flex justify-between items-start mb-12 border-b border-gray-100 pb-8">
                    <div className="space-y-4 max-w-[60%]">
                        <img src="/logo.png" alt="TMSEG" className="h-16 object-contain" />
                        <div className="mt-2">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Destinatário:</p>
                            <h2 className="text-lg font-black text-slate-900 uppercase leading-tight">
                                {clientTradingName || quote.client_name}
                            </h2>
                            <div className="flex items-center gap-1.5 text-slate-600 font-bold text-xs mt-1 uppercase">
                                <Fingerprint size={12} className="text-red-600" /> 
                                CNPJ: {clientCnpj || '...'}
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <h1 className="text-2xl font-black uppercase tracking-tighter text-slate-900 leading-tight">SIMULAÇÃO DE SERVIÇO -<br/><span className="text-red-700">Intermediação</span></h1>
                        <div className="flex items-center justify-end gap-2 text-gray-400 font-bold text-[10px] mt-4 uppercase">
                            <Calendar size={12}/> São Paulo, {new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                    <div className="space-y-4">
                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-2">Itinerário Analisado</h4>
                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0 mt-1"><MapPin size={14}/></div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase">Ponto de Origem</p>
                                    <p className="text-xs font-bold text-slate-800 uppercase">{quote.origin}</p>
                                </div>
                            </div>
                            {waypoints.filter(w => w.trim()).map((wp, idx) => (
                                <div key={idx} className="flex items-start gap-3">
                                    <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg shrink-0 mt-1"><CircleDot size={14}/></div>
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase">Parada {idx + 1}</p>
                                        <p className="text-xs font-bold text-slate-800 uppercase">{wp}</p>
                                    </div>
                                </div>
                            ))}
                            <div className="flex items-start gap-3">
                                <div className="p-1.5 bg-red-50 text-red-600 rounded-lg shrink-0 mt-1"><Flag size={14}/></div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase">Ponto de Chegada</p>
                                    <p className="text-xs font-bold text-slate-800 uppercase">{quote.destination}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-3xl p-6 text-white relative overflow-hidden flex flex-col justify-center items-center text-center">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Navigation size={60}/></div>
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Extensão da Rota</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black font-mono">{quote.total_km.toFixed(1)}</span>
                            <span className="text-sm font-bold text-gray-500">KM</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1">
                    <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-2 mb-6">Detalhamento Financeiro</h4>
                    
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-slate-50 text-slate-500 font-black text-[10px] uppercase">
                                <tr>
                                    <th className="p-4">Item</th>
                                    <th className="p-4 text-center">Referência / Franquia</th>
                                    <th className="p-4 text-center">KM Extra (R$/km)</th>
                                    <th className="p-4 text-center">Hora Extra (R$/h)</th>
                                    <th className="p-4 text-right">Valor Líquido</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                <tr>
                                    <td className="p-4">
                                        <p className="font-bold text-slate-800 uppercase text-[11px]">Serviço de Intermediação de Escolta Armada</p>
                                        <p className="text-[10px] text-gray-400 font-medium">Acionamento Logístico com Franquia Operacional</p>
                                    </td>
                                    <td className="p-4 text-center text-xs font-bold text-slate-500 uppercase">
                                        {extractDetail(['Base Contratual', 'Tabela', 'Tabela Base']) || 'Tabela Referencial'}<br/>
                                        <span className="text-[9px] font-black text-indigo-600">FRANQUIA: {quote.total_hours}h</span>
                                    </td>
                                    <td className="p-4 text-center text-xs font-bold text-slate-700 font-mono">{getExtraKmValue()}</td>
                                    <td className="p-4 text-center text-xs font-bold text-slate-700 font-mono">{getExtraHourValue()}</td>
                                    <td className="p-4 text-right font-black text-slate-900 text-lg">
                                        {formatCurrency(quote.total_value)}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="p-4">
                                        <p className="font-bold text-slate-800 uppercase">Pedágios e Custos de Passagem</p>
                                        <p className="text-[10px] text-gray-400 font-medium">Lançamento por reembolso (valor real)</p>
                                    </td>
                                    <td className="p-4 text-center text-xs font-bold text-slate-500">-</td>
                                    <td className="p-4 text-center text-xs text-slate-400">-</td>
                                    <td className="p-4 text-center text-xs text-slate-400">-</td>
                                    <td className="p-4 text-right font-black text-amber-600 text-xs uppercase tracking-widest">
                                        À PARTE
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-8 grid grid-cols-2 gap-6">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div className="flex items-center gap-2 mb-2">
                                <DollarSign size={14} className="text-red-600" />
                                <span className="text-[10px] font-black text-slate-500 uppercase">KM Excedente</span>
                            </div>
                            <p className="text-sm font-black text-slate-900 font-mono">{getExtraKmValue()}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div className="flex items-center gap-2 mb-2">
                                <Clock size={14} className="text-blue-600" />
                                <span className="text-[10px] font-black text-slate-500 uppercase">Hora Excedente</span>
                            </div>
                            <p className="text-sm font-black text-slate-900 font-mono">{getExtraHourValue()}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-10 border-t border-gray-100">
                    <div className="flex justify-between items-end">
                        <div className="space-y-2">
                            <h5 className="text-[10px] font-black text-slate-900 uppercase flex items-center gap-2">
                                <ShieldCheck size={14} className="text-green-600"/> Termos de Atendimento
                            </h5>
                            <ul className="text-[9px] text-gray-500 font-medium space-y-1">
                                <li>• Simulação baseada nas tabelas contratuais vigentes.</li>
                                <li>• Validade da cotação: 05 dias úteis.</li>
                                <li>• Impostos incidentes de acordo com a legislação fiscal.</li>
                            </ul>
                        </div>
                        <div className="text-center w-48">
                            <div className="h-px bg-slate-900 mb-2"></div>
                            <p className="text-[10px] font-black text-slate-900 uppercase">Gestão Comercial</p>
                            <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Grupo TMSEG</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default QuotePrintModal;
