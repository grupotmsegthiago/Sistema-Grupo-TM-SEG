import React, { useEffect, useState } from 'react';
import { atualizarAplicativo, consultarAplicativo, desvincularComputador, guardarTokenDesktop, testarHomologacao, type StatusAplicativo } from '../lib/whatsappDesktop/clienteLocal';

const vazio: StatusAplicativo = {
  conectado: false,
  pareado: false,
  pausado: false,
  whatsappAberto: false,
  whatsappAutenticado: null,
};

const WhatsAppDesktopIntegracao: React.FC = () => {
  const [codigo, setCodigo] = useState('');
  const [status, setStatus] = useState<StatusAplicativo>(vazio);
  const [aviso, setAviso] = useState('');

  const atualizar = async () => {
    setStatus(await consultarAplicativo());
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

  const conectar = !!status.conectado && !!status.pareado;
  const whatsapp = status.whatsappAberto
    ? (status.whatsappAutenticado === true ? 'WhatsApp pronto' : 'WhatsApp aberto — autenticação não comprovada')
    : 'WhatsApp pendente';

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-[#0b0d12] text-white shadow-sm" data-testid="painel-whatsapp-desktop">
      <div className="flex items-center gap-4 bg-[radial-gradient(circle_at_left,rgba(196,0,24,.35),transparent_55%)] p-5">
        <img src="/logo.png" alt="Grupo TM SEG" className="h-14 w-auto" />
        <div>
          <h3 className="text-lg font-black tracking-wide">GRUPO TM<span className="text-red-500">SEG</span></h3>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Integração WhatsApp Desktop</p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div className="grid gap-2 text-xs font-bold sm:grid-cols-2">
          <p>{conectar ? 'Computador conectado' : 'Computador desconectado'}</p>
          <p>{whatsapp}</p>
          <p>Versão instalada: {status.versao || '—'}</p>
          <p>Último teste: {status.ultimoTeste?.em ? new Date(status.ultimoTeste.em).toLocaleString('pt-BR') : 'ainda não realizado'}</p>
          <p className="sm:col-span-2">Comunicação: {status.resultadoComunicacao || status.motivo || 'sem resposta do conector'}</p>
          <p className="sm:col-span-2 text-gray-400">Instalação: {status.instalacaoId || '—'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="http://127.0.0.1:47321/" target="_blank" rel="noreferrer" className="rounded-xl bg-red-700 px-4 py-2 text-[11px] font-black uppercase text-white" data-testid="button-instalar-tmseg">Instalar aplicativo TM SEG</a>
          <button type="button" onClick={() => void atualizar()} className="rounded-xl border border-white/15 px-4 py-2 text-[11px] font-black uppercase">Testar conexão</button>
          <button type="button" onClick={() => void atualizarAplicativo().then((r) => { setAviso(r.ok ? 'Aplicativo marcado na versão atual.' : (r.motivo || 'Falha ao atualizar.')); void atualizar(); })} className="rounded-xl border border-white/15 px-4 py-2 text-[11px] font-black uppercase">Atualizar aplicativo</button>
          <button type="button" onClick={() => void desvincularComputador().then(() => { setAviso('Computador desvinculado neste navegador.'); void atualizar(); })} className="rounded-xl border border-white/15 px-4 py-2 text-[11px] font-black uppercase">Desvincular computador</button>
          <button type="button" onClick={() => void testarHomologacao().then((r) => { setAviso(String(r.motivo || (r.ok ? 'Comando de teste executado. Entrega não comprovada.' : 'Teste não enviado.'))); void atualizar(); })} className="rounded-xl bg-white px-4 py-2 text-[11px] font-black uppercase text-gray-900">Autorizar teste único</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm" placeholder="Código do instalador" value={codigo} onChange={(evento) => setCodigo(evento.target.value)} data-testid="input-codigo-whatsapp-desktop" />
          <button type="button" onClick={() => void parear()} className="rounded-xl bg-gray-100 px-4 py-2 text-[11px] font-black uppercase text-gray-900">Vincular este computador</button>
        </div>
        {aviso && <p className="text-xs font-bold text-red-200">{aviso}</p>}
        <p className="text-[11px] text-gray-500">O duplo clique em desktop/whatsapp-desktop/Abrir instalador.vbs abre o assistente. O teste real só segue se o chat for exatamente GRUPO TM SEG - ADM.</p>
      </div>
    </section>
  );
};

export default WhatsAppDesktopIntegracao;
