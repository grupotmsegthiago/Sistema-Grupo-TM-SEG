import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, MonitorSmartphone } from 'lucide-react';
import { consultarAplicativo, guardarTokenDesktop, type StatusAplicativo } from '../lib/whatsappDesktop/clienteLocal';

const WhatsAppDesktopIntegracao: React.FC = () => {
  const [codigo, setCodigo] = useState('');
  const [status, setStatus] = useState<StatusAplicativo | null>(null);
  const [aviso, setAviso] = useState('');

  const atualizar = async () => {
    const lido = await consultarAplicativo();
    setStatus(lido);
  };

  useEffect(() => { void atualizar(); }, []);

  const parear = async () => {
    const token = codigo.trim();
    if (token.length < 20) {
      setAviso('Cole o código mostrado no instalador deste computador.');
      return;
    }
    guardarTokenDesktop(token);
    const lido = await consultarAplicativo(token);
    setStatus(lido);
    setAviso(lido.pareado ? 'Computador conectado.' : (lido.motivo || 'Não foi possível confirmar o aplicativo.'));
  };

  const conectado = !!status?.conectado && !!status?.pareado;

  return (
    <section className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4" data-testid="painel-whatsapp-desktop">
      <div className="flex items-start gap-3">
        <img src="/logo.png" alt="Grupo TM SEG" className="w-12 h-12 rounded-lg bg-gray-900 object-contain p-1" />
        <div>
          <h3 className="text-lg font-black text-gray-900">Integração WhatsApp Desktop</h3>
          <p className="text-sm text-gray-500">O aplicativo usa o WhatsApp já aberto neste computador. A mensagem só sai depois da autorização na tela Solicitação.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href="/downloads/TMSEG-WhatsApp-Setup.exe" className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-xs font-black uppercase text-white" data-testid="button-instalar-tmseg">
          <Download size={14} /> Instalar aplicativo TM SEG
        </a>
        <p className="w-full text-[11px] text-gray-500">O executável assinado ainda não está neste pacote. Sem certificado, use o assistente local. O código do instalador fica em desktop/whatsapp-desktop.</p>
        <a href="http://127.0.0.1:47321/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-xs font-black uppercase text-gray-700">
          Abrir assistente neste computador
        </a>
        <span className={`inline-flex items-center gap-1 text-xs font-bold ${conectado ? 'text-green-700' : 'text-amber-700'}`}>
          {conectado ? <CheckCircle2 size={14} /> : <MonitorSmartphone size={14} />}
          {conectado ? 'Computador conectado' : 'Computador sem conexão'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[240px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Código do instalador"
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value)}
          data-testid="input-codigo-whatsapp-desktop"
        />
        <button type="button" onClick={() => void parear()} className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-black uppercase text-white">Vincular este computador</button>
        <button type="button" onClick={() => void atualizar()} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-black uppercase text-gray-600">Testar</button>
      </div>
      {aviso && <p className="text-xs font-bold text-gray-600">{aviso}</p>}
      {status?.motivo && !conectado && <p className="text-xs text-amber-700">{status.motivo}</p>}
    </section>
  );
};

export default WhatsAppDesktopIntegracao;
