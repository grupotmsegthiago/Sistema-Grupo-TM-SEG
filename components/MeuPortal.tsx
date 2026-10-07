import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Clock, FileText, GraduationCap, Megaphone, Receipt, Shield, User,
  type LucideIcon,
} from 'lucide-react';
import { canAccessScreen } from '../lib/screenAccess';
import { useNotification } from '../lib/NotificationContext';
import { supabase } from '../lib/supabase';
import { fetchEmployeeForUser } from '../lib/timeclock/cltEmployee';
import { TIME_CLOCK_STAGE_LABELS } from '../lib/timeclock/stages';
import type { TimeClockStage } from '../lib/timeclock/types';
import { MODULOS, MODULOS_OPERADOR } from '../lib/training/operadorAcademy';
import { modulosDaSessao } from '../lib/training/trainingStore';
import { noticiaDoLog, atualizacoesVisiveis, usuarioVeItem, ACAO_NEWS, ACAO_NEWS_VIEW, type Noticia } from '../lib/tmsegNews';
import {
  ACAO_PORTAL_PEDIDO,
  documentoProfissional,
  pendenciasDoPortal,
  rotuloPontoHoje,
  slotsDaEscala,
  textoBancoHoras,
  textoLidoEm,
  textoProximaEscala,
  TIPOS_PEDIDO,
  type TipoPedido,
} from '../lib/meuPortal';

type ModuloId = 'ponto' | 'escala' | 'holerites' | 'documentos' | 'profissional' | 'pedidos' | 'comunicados' | 'dados';

type Funcionario = {
  id: string;
  full_name?: string | null;
  matricula?: string | null;
  status?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  street?: string | null;
  address_number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  cnh_expiry?: string | null;
  shift_type?: string | null;
  position_id?: string | null;
  department_id?: string | null;
};

type Doc = {
  id: string;
  doc_type?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  expiry_date?: string | null;
};

type Exame = {
  id: string;
  exam_type?: string | null;
  exam_date?: string | null;
  expiry_date?: string | null;
  result?: string | null;
  document_url?: string | null;
};

type Holerite = { id: string; reference_month?: string | null; file_url?: string | null };
type Banco = { bank_name?: string | null; agency?: string | null; account_number?: string | null; pix_key?: string | null };
type Emergencia = { id: string; full_name?: string | null; relationship?: string | null; phone?: string | null };
type Pedido = { id: string; tipo: string; texto: string; quando: string; anexoUrl?: string };
type Batida = { type: TimeClockStage; timestamp: string };

const MODULOS_PORTAL: { id: ModuloId; titulo: string; texto: string; icon: LucideIcon }[] = [
  { id: 'ponto', titulo: 'Meu Ponto', texto: 'Espelho, entradas, saídas, atrasos, extras e pedido de correção.', icon: Clock },
  { id: 'escala', titulo: 'Minha Escala', texto: 'Dias trabalhados, folgas, horários e a escala lançada no RH.', icon: CalendarDays },
  { id: 'holerites', titulo: 'Meus Holerites', texto: 'Histórico por competência, visualização e download do PDF.', icon: Receipt },
  { id: 'documentos', titulo: 'Meus Documentos', texto: 'Pessoais, contrato, certificados e o que o RH disponibilizou.', icon: FileText },
  { id: 'profissional', titulo: 'Documentação Profissional', texto: 'CNV, formação, reciclagem, ASO e validades.', icon: Shield },
  { id: 'pedidos', titulo: 'Minhas Solicitações', texto: 'Correção de ponto, atestado, declaração e alteração cadastral.', icon: FileText },
  { id: 'comunicados', titulo: 'Comunicados', texto: 'O que a diretoria publicou, com a hora em que você leu.', icon: Megaphone },
  { id: 'dados', titulo: 'Meus Dados', texto: 'Telefone, endereço, e-mail, PIX e contato de emergência.', icon: User },
];

function usuarioAtual() {
  try {
    return JSON.parse(localStorage.getItem('userData') || '{}');
  } catch {
    return {};
  }
}

function diaSp(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function horaSp(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
}

function pedidoDoLog(row: { id?: string; details?: string; created_at?: string }): Pedido | null {
  try {
    const detalhe = JSON.parse(String(row.details || '{}'));
    const texto = String(detalhe.texto || '').trim();
    if (!texto) return null;
    return {
      id: String(row.id || ''),
      tipo: String(detalhe.tipo || 'Outro'),
      texto,
      quando: row.created_at ? new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
      anexoUrl: String(detalhe.anexoUrl || '') || undefined,
    };
  } catch {
    return null;
  }
}

export default function MeuPortal() {
  const { showNotification } = useNotification();
  const usuario = useMemo(() => usuarioAtual(), []);
  const [modulo, setModulo] = useState<ModuloId>('ponto');
  const [carregando, setCarregando] = useState(true);
  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
  const [cargo, setCargo] = useState('');
  const [setor, setSetor] = useState('');
  const [batidas, setBatidas] = useState<Batida[]>([]);
  const [horasExtras, setHorasExtras] = useState<number | null>(null);
  const [escalaJson, setEscalaJson] = useState<unknown>(null);
  const [escalaNome, setEscalaNome] = useState('');
  const [documentos, setDocumentos] = useState<Doc[]>([]);
  const [exames, setExames] = useState<Exame[]>([]);
  const [holerites, setHolerites] = useState<Holerite[]>([]);
  const [banco, setBanco] = useState<Banco | null>(null);
  const [emergencia, setEmergencia] = useState<Emergencia | null>(null);
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [lidos, setLidos] = useState<Record<string, string>>({});
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [tipoPedido, setTipoPedido] = useState<TipoPedido>('Correção de ponto');
  const [textoPedido, setTextoPedido] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
    const userId = String(usuario.id || '');
    const nome = String(usuario.name || '');
    const posts = await supabase
      .from('system_logs')
      .select('id, entity_id, user_name, details, created_at')
      .eq('action_type', ACAO_NEWS)
      .order('created_at', { ascending: false })
      .limit(30);
    const publicadas = (posts.data || []).map((row) => noticiaDoLog(row)).filter((item): item is Noticia => !!item && usuarioVeItem(usuario, item.telas));
    const idsPublicados = new Set(publicadas.map((item) => item.id));
    const sistema = atualizacoesVisiveis(usuario).filter((item) => !idsPublicados.has(item.id));
    setNoticias([...sistema, ...publicadas]);
    const idsVista = [...(posts.data || []).map((row) => String(row.entity_id || row.id || '')), ...sistema.map((item) => item.id)].filter(Boolean);
    const views = idsVista.length
      ? await supabase.from('system_logs').select('entity_id, user_name, created_at').eq('action_type', ACAO_NEWS_VIEW).in('entity_id', idsVista).limit(1000)
      : { data: [] };
    const meusPedidos = userId
      ? await supabase.from('system_logs').select('id, details, created_at').eq('action_type', ACAO_PORTAL_PEDIDO).eq('entity_id', userId).order('created_at', { ascending: false }).limit(20)
      : { data: [] };
    const leitura: Record<string, string> = {};
    const linhasVista = (views.data || []) as { entity_id?: string; user_name?: string; created_at?: string }[];
    for (const row of linhasVista) {
      if (String(row.user_name || '').trim().toLowerCase() !== nome.trim().toLowerCase()) continue;
      const id = String(row.entity_id || '');
      if (id && !leitura[id]) leitura[id] = String(row.created_at || '');
    }
    setLidos(leitura);
    setPedidos((meusPedidos.data || []).map((row) => pedidoDoLog(row)).filter((item): item is Pedido => !!item));

    const vinculo = userId ? await fetchEmployeeForUser({ id: userId, email: usuario.email, name: nome }) : null;
    if (!vinculo?.id) {
      setFuncionario(null);
      return;
    }
    const ficha = await supabase.from('rh_employees').select('id, full_name, matricula, status, phone, whatsapp, email, street, address_number, neighborhood, city, state, zip_code, cnh_expiry, shift_type, position_id, department_id').eq('id', vinculo.id).maybeSingle();
    const emp = (ficha.data || null) as Funcionario | null;
    setFuncionario(emp);
    const employeeId = emp?.id || vinculo.id;
    const [cargoRow, setorRow, docs, exams, slips, banks, contacts, salary, schedule, ponto] = await Promise.all([
      emp?.position_id ? supabase.from('rh_positions').select('name').eq('id', emp.position_id).maybeSingle() : Promise.resolve({ data: null }),
      emp?.department_id ? supabase.from('rh_departments').select('name').eq('id', emp.department_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('rh_employee_documents').select('id, doc_type, file_name, file_url, expiry_date').eq('employee_id', employeeId).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('rh_medical_exams').select('id, exam_type, exam_date, expiry_date, result, document_url').eq('employee_id', employeeId).is('deleted_at', null).order('exam_date', { ascending: false }),
      supabase.from('rh_payslips').select('id, reference_month, file_url').eq('employee_id', employeeId).order('reference_month', { ascending: false }),
      supabase.from('rh_employee_bank_accounts').select('bank_name, agency, account_number, pix_key').eq('employee_id', employeeId).is('deleted_at', null).limit(1),
      supabase.from('rh_employee_emergency_contacts').select('id, full_name, relationship, phone').eq('employee_id', employeeId).is('deleted_at', null).limit(1),
      supabase.from('rh_salary_configs').select('overtime_hours').eq('employee_id', employeeId).order('created_at', { ascending: false }).limit(1),
      supabase.from('rh_work_schedules').select('name, schedule_json').eq('employee_id', employeeId).eq('active', true).is('deleted_at', null).limit(1),
      userId ? supabase.from('time_clock').select('type, timestamp').eq('user_id', userId).order('timestamp', { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
    ]);
    setCargo(String(cargoRow.data?.name || ''));
    setSetor(String(setorRow.data?.name || ''));
    setDocumentos((docs.data || []) as Doc[]);
    setExames((exams.data || []) as Exame[]);
    setHolerites((slips.data || []) as Holerite[]);
    setBanco((banks.data || [])[0] || null);
    setEmergencia((contacts.data || [])[0] || null);
    const horas = Number((salary.data || [])[0]?.overtime_hours);
    setHorasExtras(Number.isFinite(horas) ? horas : null);
    setEscalaNome(String((schedule.data || [])[0]?.name || ''));
    setEscalaJson((schedule.data || [])[0]?.schedule_json || null);
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    setBatidas(((ponto.data || []) as { type?: string; timestamp?: string }[])
      .filter((item) => item.type && item.timestamp && diaSp(item.timestamp) === hoje)
      .map((item) => ({ type: item.type as TimeClockStage, timestamp: String(item.timestamp) }))
      .reverse());
    } finally {
      setCarregando(false);
    }
  }, [usuario.email, usuario.id, usuario.name]);

  useEffect(() => { void carregar(); }, [carregar]);

  const primeiro = String(funcionario?.full_name || usuario.name || 'colaborador').trim().split(' ')[0] || 'colaborador';
  const concluidos = modulosDaSessao(usuario);
  const obrigatorios = MODULOS_OPERADOR as readonly string[];
  const faltando = MODULOS.filter((item) => obrigatorios.includes(item.id) && !concluidos.includes(item.id)).map((item) => item.titulo);
  const naoLidos = noticias.filter((item) => !lidos[item.id]).length;
  const pendencias = pendenciasDoPortal({
    documentos,
    exames,
    cnhExpiry: funcionario?.cnh_expiry,
    modulosFaltando: faltando,
    comunicadosNaoLidos: naoLidos,
  });
  const ponto = rotuloPontoHoje(batidas);
  const endereco = [funcionario?.street, funcionario?.address_number, funcionario?.neighborhood, funcionario?.city, funcionario?.state].filter(Boolean).join(', ');
  const profissionais = documentos.filter((doc) => documentoProfissional(doc));
  const slots = slotsDaEscala(escalaJson);
  const papel = [cargo || setor || String(usuario.role || 'Colaborador'), funcionario?.matricula ? `Matrícula ${funcionario.matricula}` : '', funcionario?.status || 'Ativo'].filter(Boolean).join(' • ');

  const abrirTela = (tela: string) => {
    if (!canAccessScreen(usuario, tela)) {
      showNotification('Meu Portal', 'Seu acesso ainda não abre esta tela. O que já está no seu cadastro continua aqui.', 'info');
      return;
    }
    window.dispatchEvent(new CustomEvent('tmseg:navigate', { detail: tela }));
  };

  const pedir = async () => {
    const texto = textoPedido.replace(/\s+/g, ' ').trim();
    if (texto.length < 5 || !usuario.id) {
      showNotification('Solicitação', 'Escreva o que o RH precisa resolver.', 'warning');
      return;
    }
    setEnviando(true);
    const insert = await supabase.from('system_logs').insert([{
      user_name: String(usuario.name || primeiro),
      action_type: ACAO_PORTAL_PEDIDO,
      entity: 'Portal',
      entity_id: String(usuario.id),
      details: JSON.stringify({ tipo: tipoPedido, texto, employeeId: funcionario?.id || null }),
    }]);
    setEnviando(false);
    if (insert.error) {
      showNotification('Solicitação', insert.error.message, 'warning');
      return;
    }
    setTextoPedido('');
    showNotification('Enviado', 'O RH vê este pedido na trilha do sistema.', 'success');
    void carregar();
  };

  const abrirComunicado = (noticia: Noticia) => {
    const eu = String(usuario.name || '').trim();
    if (!lidos[noticia.id] && eu) {
      void supabase.from('system_logs').insert([{
        user_name: eu,
        action_type: ACAO_NEWS_VIEW,
        entity: 'News',
        entity_id: noticia.id,
        details: JSON.stringify({ nome: eu }),
      }]);
    }
    setLidos((atual) => ({ ...atual, [noticia.id]: atual[noticia.id] || new Date().toISOString() }));
  };

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const diasMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const calendario = Array.from({ length: diasMes }, (_, index) => {
    const dia = index + 1;
    const data = new Date(agora.getFullYear(), agora.getMonth(), dia);
    const slot = slots.find((item) => item.weekday === data.getDay());
    return { dia, folga: slot ? slot.folga : null, inicio: slot?.inicio || '' };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6" data-testid="meu-portal">
      <section className="rounded-2xl bg-gray-950 p-5 text-white shadow-xl">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">Portal do Funcionário</p>
        <h1 className="mt-1 text-2xl font-black">Olá, {primeiro}</h1>
        <p className="mt-1 text-sm text-gray-300">{papel}</p>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { titulo: 'Ponto de hoje', valor: ponto.texto, ok: ponto.ok },
          { titulo: 'Banco de horas', valor: textoBancoHoras(horasExtras), ok: horasExtras != null && Number(horasExtras) > 0 },
          { titulo: 'Próxima escala', valor: textoProximaEscala(escalaJson, funcionario?.shift_type), ok: true },
          { titulo: 'Pendências', valor: String(pendencias.length), ok: pendencias.length === 0 },
        ].map((item) => (
          <div key={item.titulo} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase text-gray-400">{item.titulo}</p>
            <p className={`mt-2 text-lg font-black ${item.ok ? 'text-emerald-700' : 'text-red-700'}`}>
              {item.titulo === 'Pendências' && pendencias.length > 0 ? `🔴 ${item.valor}` : item.titulo === 'Ponto de hoje' ? `${item.ok ? '🟢' : '🔴'} ${item.valor}` : item.valor}
            </p>
          </div>
        ))}
      </section>

      {pendencias.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4" data-testid="meu-portal-pendencias">
          <p className="text-sm font-black text-red-800">🔴 {pendencias.length} {pendencias.length === 1 ? 'pendência precisa' : 'pendências precisam'} da sua atenção</p>
          <ul className="mt-2 space-y-1">
            {pendencias.map((item) => <li key={item.id} className="text-sm text-red-900">{item.texto}</li>)}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MODULOS_PORTAL.map((item) => {
          const Icon = item.icon;
          const ativo = modulo === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setModulo(item.id)}
              className={`rounded-2xl border p-4 text-left shadow-sm ${ativo ? 'border-red-700 bg-red-50' : 'border-gray-200 bg-white'}`}
              data-testid={`meu-portal-modulo-${item.id}`}
            >
              <Icon size={18} className="text-red-700" />
              <p className="mt-2 text-sm font-black text-gray-900">{item.titulo}</p>
              <p className="mt-1 text-xs text-gray-500">{item.texto}</p>
            </button>
          );
        })}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {carregando && <p className="text-sm text-gray-500">Carregando o seu cadastro...</p>}

        {!carregando && modulo === 'ponto' && (
          <div className="space-y-3">
            <h2 className="text-base font-black">Meu Ponto</h2>
            {batidas.length === 0 && <p className="text-sm text-gray-500">Nenhuma batida hoje.</p>}
            {batidas.map((item) => (
              <p key={`${item.type}-${item.timestamp}`} className="text-sm text-gray-800">
                {TIME_CLOCK_STAGE_LABELS[item.type as TimeClockStage] || item.type} · {horaSp(item.timestamp)}
              </p>
            ))}
            <p className="text-xs text-gray-500">O espelho completo, atrasos e horas extras ficam na Folha de Ponto. O saldo de banco de horas ainda não existe como lançamento próprio: aqui aparece a hora extra do salário, quando o RH preencheu.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => abrirTela('rh-timeclock')} className="rounded-xl bg-gray-950 px-3 py-2 text-[11px] font-black uppercase text-white">Abrir folha de ponto</button>
              <button type="button" onClick={() => { setTipoPedido('Correção de ponto'); setModulo('pedidos'); }} className="rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-black uppercase text-gray-700">Pedir correção</button>
            </div>
          </div>
        )}

        {!carregando && modulo === 'escala' && (
          <div className="space-y-3">
            <h2 className="text-base font-black">Minha Escala</h2>
            <p className="text-sm text-gray-600">{escalaNome || textoProximaEscala(escalaJson, funcionario?.shift_type)}</p>
            {slots.length === 0 && <p className="text-sm text-gray-500">O RH ainda não lançou os dias e horários em rh_work_schedules. O turno do cadastro continua valendo.</p>}
            {slots.length > 0 && (
              <div className="grid grid-cols-7 gap-1">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((letra, index) => <p key={`${letra}-${index}`} className="text-center text-[10px] font-black text-gray-400">{letra}</p>)}
                {Array.from({ length: inicioMes.getDay() }).map((_, index) => <span key={`vazio-${index}`} />)}
                {calendario.map((dia) => (
                  <div key={dia.dia} className={`rounded-lg px-1 py-2 text-center text-xs ${dia.folga === true ? 'bg-gray-100 text-gray-400' : dia.folga === false ? 'bg-emerald-50 font-bold text-emerald-800' : 'text-gray-700'}`}>
                    <p>{dia.dia}</p>
                    {dia.inicio && <p className="text-[9px]">{dia.inicio}</p>}
                    {dia.folga === true && <p className="text-[9px]">Folga</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!carregando && modulo === 'holerites' && (
          <div className="space-y-2">
            <h2 className="text-base font-black">Meus Holerites</h2>
            {holerites.length === 0 && <p className="text-sm text-gray-500">Nenhum PDF lançado em rh_payslips.</p>}
            {holerites.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2">
                <p className="text-sm font-bold">{item.reference_month || 'Competência'}</p>
                {item.file_url
                  ? <a href={item.file_url} target="_blank" rel="noreferrer" className="text-xs font-black uppercase text-red-700">Baixar PDF</a>
                  : <span className="text-xs text-gray-400">Sem arquivo</span>}
              </div>
            ))}
          </div>
        )}

        {!carregando && modulo === 'documentos' && (
          <div className="space-y-2">
            <h2 className="text-base font-black">Meus Documentos</h2>
            {documentos.length === 0 && <p className="text-sm text-gray-500">O RH ainda não anexou documento neste cadastro.</p>}
            {documentos.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2">
                <div>
                  <p className="text-sm font-bold">{doc.doc_type || 'Documento'}</p>
                  <p className="text-xs text-gray-500">{doc.file_name || ''} {doc.expiry_date ? `· validade ${doc.expiry_date}` : ''}</p>
                </div>
                {doc.file_url && <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-xs font-black uppercase text-red-700">Abrir</a>}
              </div>
            ))}
          </div>
        )}

        {!carregando && modulo === 'profissional' && (
          <div className="space-y-3">
            <h2 className="text-base font-black">Documentação Profissional</h2>
            {funcionario?.cnh_expiry && <p className="text-sm">CNH válida até {funcionario.cnh_expiry}</p>}
            {profissionais.length === 0 && exames.length === 0 && <p className="text-sm text-gray-500">CNV, formação, reciclagem e ASO aparecem aqui quando o RH lança o documento ou o exame.</p>}
            {profissionais.map((doc) => (
              <p key={doc.id} className="text-sm">{doc.doc_type} {doc.expiry_date ? `· validade ${doc.expiry_date}` : ''} {doc.file_url && <a href={doc.file_url} target="_blank" rel="noreferrer" className="font-black text-red-700">Abrir</a>}</p>
            ))}
            {exames.map((exame) => (
              <p key={exame.id} className="text-sm">{exame.exam_type || 'ASO'} {exame.expiry_date ? `· validade ${exame.expiry_date}` : ''} {exame.result ? `· ${exame.result}` : ''} {exame.document_url && <a href={exame.document_url} target="_blank" rel="noreferrer" className="font-black text-red-700">Abrir</a>}</p>
            ))}
          </div>
        )}

        {!carregando && modulo === 'pedidos' && (
          <div className="space-y-3">
            <h2 className="text-base font-black">Minhas Solicitações</h2>
            <select value={tipoPedido} onChange={(event) => setTipoPedido(event.target.value as TipoPedido)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              {TIPOS_PEDIDO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
            </select>
            <textarea value={textoPedido} onChange={(event) => setTextoPedido(event.target.value)} rows={3} placeholder="O que precisa ser ajustado" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            <button type="button" disabled={enviando} onClick={() => { void pedir(); }} className="rounded-xl bg-gray-950 px-3 py-2 text-[11px] font-black uppercase text-white disabled:opacity-60">Enviar ao RH</button>
            {pedidos.map((pedido) => (
              <article key={pedido.id} className="rounded-xl border border-gray-100 p-3">
                <p className="text-[10px] font-black uppercase text-gray-400">{pedido.tipo} {pedido.quando ? `· ${pedido.quando}` : ''}</p>
                <p className="mt-1 text-sm text-gray-800">{pedido.texto}</p>
              </article>
            ))}
          </div>
        )}

        {!carregando && modulo === 'comunicados' && (
          <div className="space-y-3">
            <h2 className="text-base font-black">Comunicados</h2>
            {noticias.length === 0 && <p className="text-sm text-gray-500">Nenhum comunicado da diretoria.</p>}
            {noticias.map((noticia) => (
              <article key={noticia.id} className="rounded-xl border border-gray-100 p-3">
                <p className="text-sm font-black">{noticia.titulo}</p>
                <p className="mt-1 text-sm text-gray-700">{noticia.texto}</p>
                {noticia.anexoUrl && <a href={noticia.anexoUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-black uppercase text-red-700">{noticia.anexoNome || 'Abrir anexo'}</a>}
                <p className="mt-2 text-[11px] font-bold text-gray-500">{lidos[noticia.id] ? textoLidoEm(lidos[noticia.id]) : 'Ainda não lido'}</p>
                {!lidos[noticia.id] && <button type="button" onClick={() => abrirComunicado(noticia)} className="mt-1 text-[11px] font-black uppercase text-gray-700 underline">Marcar como lido</button>}
              </article>
            ))}
          </div>
        )}

        {!carregando && modulo === 'dados' && (
          <div className="space-y-2 text-sm text-gray-800">
            <h2 className="text-base font-black">Meus Dados</h2>
            {!funcionario && <p className="text-gray-500">Seu login ainda não está vinculado a um cadastro do RH. O ponto liga pelo e-mail quando os dois coincidem.</p>}
            <p>Telefone: {funcionario?.phone || funcionario?.whatsapp || '—'}</p>
            <p>E-mail: {funcionario?.email || usuario.email || '—'}</p>
            <p>Endereço: {endereco || '—'}</p>
            <p>Banco: {banco?.bank_name || '—'} {banco?.agency ? `· ag ${banco.agency}` : ''} {banco?.account_number ? `· cc ${banco.account_number}` : ''}</p>
            <p>PIX: {banco?.pix_key || '—'}</p>
            <p>Emergência: {emergencia ? `${emergencia.full_name || ''} ${emergencia.relationship ? `(${emergencia.relationship})` : ''} ${emergencia.phone || ''}` : '—'}</p>
            <button type="button" onClick={() => { setTipoPedido('Alteração cadastral'); setModulo('pedidos'); }} className="rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-black uppercase text-gray-700">Pedir alteração</button>
          </div>
        )}

        {!carregando && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-gray-500"><GraduationCap size={14} /> Treinamento</p>
            <div className="flex flex-wrap gap-2">
              {MODULOS.filter((item) => item.trilha === 'operador').map((item) => {
                const viu = concluidos.includes(item.id);
                return (
                  <button key={item.id} type="button" onClick={() => abrirTela('treinamento')} className={`rounded-full px-3 py-1 text-[11px] font-bold ${viu ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                    {viu ? 'Assistiu' : 'Não assistiu'} · {item.titulo}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
