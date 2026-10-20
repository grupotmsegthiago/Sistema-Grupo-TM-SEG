import React, { useEffect, useState } from 'react';
import { atualizarAplicativo, consultarAplicativo, desvincularComputador, guardarTokenDesktop, identificarComputador, lerMemoriaDispositivo, revincularComputador, testarHomologacao, type MemoriaDispositivo, type StatusAplicativo } from '../lib/whatsappDesktop/clienteLocal';

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
  const [memoria, setMemoria] = useState<MemoriaDispositivo | null>(lerMemoriaDispositivo());
  const [aviso, setAviso] = useState('');

  const atualizar = async () => {
    const reconhecido = await identificarComputador();
    setMemoria(reconhecido);
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

  const preparado = !!(memoria?.preparado || status.preparado);
  const identificado = !!(memoria?.identificado || status.identificado);
  const reauth = !!(memoria?.precisaReautenticar || status.precisaReautenticar);
  const conectar = !!status.conectado && !!status.pareado;
  const whatsapp = reauth
    ? 'WhatsApp pendente de autenticação'
    : status.whatsappAberto
      ? (status.whatsappAutenticado === true ? 'WhatsApp pronto' : 'WhatsApp aberto')
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
          <p>{identificado ? 'Computador preparado e reconhecido' : conectar ? 'Computador conectado' : preparado ? 'Computador preparado. Abra o conector para continuar.' : 'Computador desconectado'}</p>
          <p>{whatsapp}</p>
          <p>Versão instalada: {status.versao || '—'}</p>
          <p>Último teste: {status.ultimoTeste?.em ? new Date(status.ultimoTeste.em).toLocaleString('pt-BR') : 'ainda não realizado'}</p>
          <p className="sm:col-span-2">Comunicação: {status.resultadoComunicacao || status.motivo || 'sem resposta do conector'}</p>
          <p className="sm:col-span-2 text-gray-400">Instalação: {status.instalacaoId || '—'}</p>
        </div>
        {reauth && <p className="text-xs font-bold text-red-200">A conta do WhatsApp saiu. Abra o aplicativo oficial e conecte pelo QR Code. A instalação e o teste não serão repetidos.</p>}
        <div className="flex flex-wrap gap-2">
          {!preparado && <a href="http://127.0.0.1:47321/" target="_blank" rel="noreferrer" className="rounded-xl bg-red-700 px-4 py-2 text-[11px] font-black uppercase text-white" data-testid="button-instalar-tmseg">Instalar aplicativo TM SEG</a>}
          <button type="button" onClick={() => void atualizar()} className="rounded-xl border border-white/15 px-4 py-2 text-[11px] font-black uppercase">Testar conexão</button>
          <button type="button" onClick={() => void atualizarAplicativo().then((r) => { setAviso(r.ok ? 'Aplicativo marcado na versão atual.' : (r.motivo || 'Falha ao atualizar.')); void atualizar(); })} className="rounded-xl border border-white/15 px-4 py-2 text-[11px] font-black uppercase">Atualizar aplicativo</button>
          {conectar && <button type="button" onClick={() => void desvincularComputador().then(() => { setAviso('Computador desvinculado. A instalação permanece neste aparelho.'); void atualizar(); })} className="rounded-xl border border-white/15 px-4 py-2 text-[11px] font-black uppercase">Desvincular computador</button>}
          {preparado && memoria?.vinculado === false && <button type="button" onClick={() => void revincularComputador().then((r) => { setAviso(r.ok ? 'Computador reconhecido de novo.' : (r.motivo || 'Não foi possível vincular.')); void atualizar(); })} className="rounded-xl bg-white px-4 py-2 text-[11px] font-black uppercase text-gray-900">Reconhecer de novo</button>}
          {!preparado && <button type="button" onClick={() => void testarHomologacao().then((r) => { setAviso(String(r.motivo || (r.ok ? 'Comando de teste executado. Entrega não comprovada.' : 'Teste não enviado.'))); void atualizar(); })} className="rounded-xl bg-white px-4 py-2 text-[11px] font-black uppercase text-gray-900">Autorizar teste único</button>}
        </div>
        {!preparado && <div className="flex flex-wrap gap-2">
          <input className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm" placeholder="Código do instalador" value={codigo} onChange={(evento) => setCodigo(evento.target.value)} data-testid="input-codigo-whatsapp-desktop" />
          <button type="button" onClick={() => void parear()} className="rounded-xl bg-gray-100 px-4 py-2 text-[11px] font-black uppercase text-gray-900">Vincular este computador</button>
        </div>}
        {aviso && <p className="text-xs font-bold text-red-200">{aviso}</p>}
        <p className="text-[11px] text-gray-500">{preparado ? 'Este navegador guarda o computador preparado. A próxima abertura do TM SEG identifica o dispositivo sem repetir a instalação.' : 'O duplo clique em desktop/whatsapp-desktop/Abrir instalador.vbs abre o assistente. O teste real só segue se o chat for exatamente GRUPO TM SEG - ADM.'}</p>
      </div>
    </section>
  );
};

export default WhatsAppDesktopIntegracao;
