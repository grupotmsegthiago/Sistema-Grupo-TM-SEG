
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { useNotification } from '../lib/NotificationContext';
import {
  FileText, Plus, Calendar, CheckCircle2, XCircle, Clock, Send,
  Eye, Download, Edit2, Save, Trash2, AlertTriangle, Loader2,
  ShieldCheck, Signature, FileSignature, RefreshCw, Building2,
  User, MapPin, Mail, Fingerprint, Gavel
} from 'lucide-react';
import { jsPDF } from 'jspdf';

interface ContractData {
  id: string;
  client_id: string;
  client_name: string;
  status: 'PENDENTE' | 'ENVIADO' | 'ASSINADO' | 'CANCELADO' | 'VENCIDO';
  contract_date: string;
  valid_from: string;
  valid_until: string;
  signed_at: string;
  signed_by: string;
  witness1: string;
  witness2: string;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  contract_type: 'CLIENTE' | 'FORNECEDOR';
}

interface Props {
  clientId: string;
  clientName: string;
  tradingName: string;
  cnpj: string;
  rgIe: string;
  contactName: string;
  email: string;
  phone: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  PENDENTE: { label: 'Pendente', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
  ENVIADO: { label: 'Enviado', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Send },
  ASSINADO: { label: 'Assinado', color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 },
  CANCELADO: { label: 'Cancelado', color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  VENCIDO: { label: 'Vencido', color: 'bg-gray-50 text-gray-500 border-gray-200', icon: AlertTriangle },
};

const LABEL = "text-[10px] font-black text-gray-500 uppercase mb-1 block tracking-wider";
const INPUT = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all";

const ClientContractTab: React.FC<Props> = ({
  clientId, clientName, tradingName, cnpj, rgIe,
  contactName, email, phone, street, number, complement,
  neighborhood, city, state, zipCode
}) => {
  const { showNotification } = useNotification();
  const [contracts, setContracts] = useState<ContractData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewContract, setPreviewContract] = useState<ContractData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split('T')[0];
  const [formState, setFormState] = useState({
    contract_date: today,
    valid_from: today,
    valid_until: '',
    signed_at: '',
    signed_by: '',
    witness1: '',
    witness2: '',
    notes: '',
    status: 'PENDENTE' as ContractData['status'],
    contract_type: 'CLIENTE' as 'CLIENTE' | 'FORNECEDOR',
  });

  useEffect(() => {
    if (clientId) fetchContracts();
  }, [clientId]);

  const fetchContracts = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('system_logs')
        .select('*')
        .eq('entity', 'ClientContract')
        .eq('entity_id', clientId)
        .order('created_at', { ascending: false });

      if (data) {
        const parsed = data.map(row => {
          try {
            const d = JSON.parse(row.details);
            return { ...d, id: row.id, created_at: row.created_at, created_by: row.user_name };
          } catch { return null; }
        }).filter(Boolean);

        const updated = parsed.map((c: ContractData) => {
          if (c.status === 'ASSINADO' && c.valid_until && new Date(c.valid_until) < new Date()) {
            return { ...c, status: 'VENCIDO' as const };
          }
          return c;
        });
        setContracts(updated);
      }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const resetForm = () => {
    setFormState({
      contract_date: today,
      valid_from: today,
      valid_until: '',
      signed_at: '',
      signed_by: '',
      witness1: '',
      witness2: '',
      notes: '',
      status: 'PENDENTE',
      contract_type: 'CLIENTE',
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (c: ContractData) => {
    setFormState({
      contract_date: c.contract_date || today,
      valid_from: c.valid_from || today,
      valid_until: c.valid_until || '',
      signed_at: c.signed_at || '',
      signed_by: c.signed_by || '',
      witness1: c.witness1 || '',
      witness2: c.witness2 || '',
      notes: c.notes || '',
      status: c.status === 'VENCIDO' ? 'ASSINADO' : c.status,
      contract_type: c.contract_type || 'CLIENTE',
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formState.contract_date) {
      showNotification('Informe a data do contrato.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const storedUser = localStorage.getItem('userData');
      const user = storedUser ? JSON.parse(storedUser) : { name: 'Sistema' };

      const autoSignedAt = formState.status === 'ASSINADO' && !formState.signed_at ? today : formState.signed_at;

      const payload: Partial<ContractData> = {
        client_id: clientId,
        client_name: tradingName || clientName,
        status: formState.status,
        contract_date: formState.contract_date,
        valid_from: formState.valid_from,
        valid_until: formState.valid_until,
        signed_at: autoSignedAt,
        signed_by: formState.signed_by,
        witness1: formState.witness1,
        witness2: formState.witness2,
        notes: formState.notes,
        contract_type: formState.contract_type,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        await supabase.from('system_logs').update({
          details: JSON.stringify(payload),
          action_type: 'UPDATE',
        }).eq('id', editingId);
        showNotification('Contrato atualizado com sucesso!', 'success');
      } else {
        await supabase.from('system_logs').insert([{
          user_name: user.name,
          action_type: 'CREATE',
          entity: 'ClientContract',
          entity_id: clientId,
          details: JSON.stringify(payload),
          created_at: new Date().toISOString(),
        }]);
        showNotification('Contrato registrado com sucesso!', 'success');
      }

      await logAction(editingId ? 'UPDATE' : 'CREATE', 'ClientContractAudit', clientId, `Contrato ${editingId ? 'atualizado' : 'criado'} para ${tradingName || clientName}`);
      resetForm();
      fetchContracts();
    } catch (e) {
      console.error(e);
      showNotification('Erro ao salvar contrato.', 'error');
    } finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este contrato?')) return;
    await supabase.from('system_logs').delete().eq('id', id);
    showNotification('Contrato excluído.', 'success');
    fetchContracts();
  };

  const handleStatusChange = async (contract: ContractData, newStatus: ContractData['status']) => {
    const payload = { ...contract, status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'ASSINADO' && !contract.signed_at) {
      payload.signed_at = new Date().toISOString().split('T')[0];
    }
    delete (payload as any).id;
    delete (payload as any).created_at;
    delete (payload as any).created_by;
    await supabase.from('system_logs').update({
      details: JSON.stringify(payload),
      action_type: 'UPDATE',
    }).eq('id', contract.id);
    showNotification(`Status alterado para ${STATUS_CONFIG[newStatus]?.label || newStatus}`, 'success');
    fetchContracts();
  };

  const buildFullAddress = () => {
    const parts = [street, number ? `n° ${number}` : '', complement, neighborhood, city ? `${city} – ${state}` : state].filter(Boolean);
    return parts.join(', ') + (zipCode ? `, CEP ${zipCode}` : '');
  };

  const formatDateBR = (d: string) => {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  const monthsFull = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const formatDateExtended = (d: string) => {
    if (!d) return 'xx de xxxx de xxxxx';
    const dt = new Date(d + 'T12:00:00');
    return `${dt.getDate()} de ${monthsFull[dt.getMonth()]} de ${dt.getFullYear()}`;
  };

  const generatePDF = (contract: ContractData) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 25;
    const maxWidth = pageWidth - margin * 2;
    const brandRed = [185, 28, 28];
    const brandBlack = [0, 0, 0];
    const brandGray = [100, 100, 100];
    const lightGray = [200, 200, 200];
    let y = 0;
    let pageNum = 1;

    const drawHeader = () => {
      doc.setFillColor(brandRed[0], brandRed[1], brandRed[2]);
      doc.rect(0, 0, pageWidth, 3, 'F');

      doc.setFillColor(brandBlack[0], brandBlack[1], brandBlack[2]);
      doc.rect(0, 3, pageWidth, 32, 'F');

      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(brandRed[0], brandRed[1], brandRed[2]);
      doc.text('TM', margin, 22);
      const tmW = doc.getTextWidth('TM');
      doc.setTextColor(255, 255, 255);
      doc.text('SEG', margin + tmW + 1, 22);

      doc.setDrawColor(brandRed[0], brandRed[1], brandRed[2]);
      doc.setLineWidth(0.8);
      doc.line(margin, 26, margin + 80, 26);

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(200, 200, 200);
      doc.text('SERVIÇOS EM SEGURANÇA', margin, 30);

      doc.setFontSize(7);
      doc.setTextColor(180, 180, 180);
      doc.setFont('helvetica', 'normal');
      doc.text('www.grupotmseg.com.br', pageWidth - margin, 16, { align: 'right' });
      doc.text('+55 11 95456-3755', pageWidth - margin, 21, { align: 'right' });
      doc.text('contato@grupotmseg.com.br', pageWidth - margin, 26, { align: 'right' });
      doc.text('CNPJ: 28.804.378/0001-67', pageWidth - margin, 31, { align: 'right' });

      doc.setFillColor(brandRed[0], brandRed[1], brandRed[2]);
      doc.rect(0, 35, pageWidth, 1.5, 'F');

      y = 45;
    };

    const drawFooter = () => {
      const footerY = pageHeight - 12;
      doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(brandGray[0], brandGray[1], brandGray[2]);
      doc.text('TM SEGURANÇA CONSULTORIA & TECNOLOGIA INTEGRADA LTDA — CNPJ 28.804.378/0001-67', margin, footerY);
      doc.text('Av. Parada Pinto, 745 — Vila Nova Cachoeirinha — São Paulo/SP — CEP 02.611-003', margin, footerY + 4);

      doc.setTextColor(brandRed[0], brandRed[1], brandRed[2]);
      doc.setFont('helvetica', 'bold');
      doc.text('www.grupotmseg.com.br', pageWidth - margin, footerY, { align: 'right' });

      doc.setTextColor(brandGray[0], brandGray[1], brandGray[2]);
      doc.setFont('helvetica', 'normal');
      doc.text(`Página ${pageNum}`, pageWidth - margin, footerY + 4, { align: 'right' });
    };

    const checkPage = (needed: number = 10) => {
      if (y + needed > pageHeight - 20) {
        drawFooter();
        doc.addPage();
        pageNum++;
        drawHeader();
      }
    };

    const addText = (text: string, fontSize: number, style: string = 'normal', align: 'left' | 'center' | 'justify' = 'left', color?: number[]) => {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', style);
      doc.setTextColor(color ? color[0] : 30, color ? color[1] : 30, color ? color[2] : 30);
      const lines = doc.splitTextToSize(text, maxWidth);
      const lineH = fontSize * 0.42;
      const blockH = lines.length * lineH;

      checkPage(blockH + 2);

      if (align === 'center') {
        lines.forEach((line: string) => {
          const w = doc.getTextWidth(line);
          doc.text(line, (pageWidth - w) / 2, y);
          y += lineH;
        });
      } else {
        doc.text(lines, margin, y, { maxWidth, align: 'justify' });
        y += blockH;
      }
    };

    const addSpace = (s: number = 4) => { y += s; };

    drawHeader();

    doc.setFillColor(245, 245, 245);
    doc.roundedRect(margin, y, maxWidth, 12, 2, 2, 'F');
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brandRed[0], brandRed[1], brandRed[2]);
    const titleText = 'CONTRATO DE PRESTAÇÃO DE SERVIÇO';
    const titleW = doc.getTextWidth(titleText);
    doc.text(titleText, (pageWidth - titleW) / 2, y + 8.5);
    y += 18;

    doc.setDrawColor(brandRed[0], brandRed[1], brandRed[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    addSpace(8);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brandRed[0], brandRed[1], brandRed[2]);
    doc.text('CONTRATANTE:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const contratanteText = 'TM SEGURANÇA CONSULTORIA & TECNOLOGIA INTEGRADA LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob nº 28.804.378/0001-67, neste ato representado por THIAGO MOREIRA DOS SANTOS com sede na Avenida Parada Pinto, nº 745, Apt. 24, Bloco D, Vila Nova Cachoeirinha, São Paulo – SP, CEP 02.611-003 e e-mail: thiago@grupotmseg.com.br';
    const cLines = doc.splitTextToSize(contratanteText, maxWidth);
    doc.text(cLines, margin, y + 4.5, { maxWidth, align: 'justify' });
    y += 4.5 + cLines.length * 3.8;
    addSpace(6);

    const cName = (tradingName || clientName).toUpperCase();
    const cAddr = buildFullAddress();
    const cContact = contactName || 'representante legal';

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brandRed[0], brandRed[1], brandRed[2]);
    doc.text('CONTRATADA:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const contratadaText = `${cName}, inscrita no CNPJ nº ${cnpj || 'N/I'}, com sede sito à ${cAddr || 'endereço não informado'}, neste ato representada por seu sócio administrador ${cContact}, inscrito no CPF/MF nº ${rgIe || 'N/I'} e e-mail: ${email || 'N/I'}.`;
    const dLines = doc.splitTextToSize(contratadaText, maxWidth);
    doc.text(dLines, margin, y + 4.5, { maxWidth, align: 'justify' });
    y += 4.5 + dLines.length * 3.8;
    addSpace(6);

    addText('As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços, considerando as disposições do Código Civil Brasileiro, que se regerá pelas cláusulas seguintes e pelas condições de preço, forma e termo de pagamento descritas no presente.', 9, 'italic', 'justify', brandGray);
    addSpace(6);

    const clauses = [
      { title: 'CLÁUSULA PRIMEIRA: DO OBJETO', body: 'O propósito deste contrato é a execução, pela CONTRATADA, dos serviços de Acompanhamento Logístico e Escolta Armada para os trajetos solicitados pela CONTRATANTE, cujos dados serão indicados antes da execução do serviço.' },
      { title: '', body: '§1º: A CONTRATADA prestará os serviços por demanda certa e específica, sempre que requisitada pela CONTRATANTE, ficando à encargo da primeira o aceite ou não quanto ao preço, forma, rota e termo de pagamento proposta pela CONTRATANTE.' },
      { title: '', body: '§2º: A requisição do(s) serviço(s) será feita sempre por escrito, através do e-mail institucional das partes, WhatsApp ou qualquer outro meio de comunicação que possa delimitar as regras do trabalho a ser executado, o tempo de duração e a remuneração.' },
      { title: '', body: '§3º: A CONTRATADA é responsável por planejar, mapear e realizar os serviços solicitados pela CONTRATANTE, garantindo a comunicação das rotas necessárias, em colaboração com outros prestadores de serviços da CONTRATANTE, seguradoras, empresas de monitoramento entre outros.' },
      { title: '', body: '§4º: A CONTRATANTE e a CONTRATADA poderão, a seu exclusivo critério, firmar contratos de igual natureza com terceiros, inexistindo qualquer regime de exclusividade na presente avença.' },
      { title: '', body: '§5º: Quaisquer serviços adicionais só poderão ser cobrados se forem previamente solicitados e aprovados de forma expressa pela CONTRATANTE.' },
      { title: 'CLÁUSULA SEGUNDA: DO RELACIONAMENTO DAS PARTES', body: 'O presente instrumento não gera para nenhuma das partes quaisquer outros direitos e obrigações diversos daqueles aqui expressamente previstos, ficando afastada qualquer relação, ostensiva ou remota, de sociedade ou associação, filiação ou extensão entre as Partes.' },
      { title: '', body: '§1º: O presente Contrato não estabelece qualquer relação de emprego entre a CONTRATANTE e os funcionários, prepostos ou subcontratados da CONTRATADA, sendo a CONTRATADA a única e exclusiva responsável pelo recrutamento, seleção, contratação, administração, gerenciamento e pagamento de seu pessoal.' },
      { title: '', body: '§2º: Em decorrência da atuação profissional entre as partes, qualquer obrigação pecuniária assumida pela CONTRATANTE, decorrente do objeto da prestação de serviço, caberá a CONTRATADA a respectiva indenização.' },
      { title: '', body: '§3º: Ocorrendo a hipótese prevista no item acima, ficará a CONTRATANTE automaticamente autorizada a promover a retenção sem qualquer ônus dos pagamentos eventualmente devidos à CONTRATADA, até o limite do valor reclamado na demanda.' },
      { title: '', body: '§4º: Quaisquer demandas administrativas ou judiciais que mencionem à CONTRATANTE como responsável, caberá a CONTRATADA requerer formalmente a exclusão e/ou a substituição de imediato da primeira.' },
      { title: '', body: '§5º: Em havendo decréscimo financeiro suportado pela CONTRATANTE, incumbirá à CONTRATADA promover a integral restituição dos valores desembolsados, no prazo máximo de 15 (quinze) dias.' },
      { title: 'CLÁUSULA TERCEIRA: DO PREÇO', body: 'Pelo efetivo desempenho das atividades dispostas na cláusula 1ª deste contrato, a CONTRATADA receberá o valor proposto pela CONTRATANTE na proposta enviada, cuja proposta para o serviço será encaminhada em tempo oportuno.' },
      { title: '', body: '§1º: No valor do serviço aceito pela CONTRATADA estarão inclusas todas as despesas úteis e necessárias, de modo a constituir como a única remuneração devida pela CONTRATANTE.' },
      { title: '', body: '§2º: O preço poderá ser reajustado anualmente mediante comum acordo entre as partes, se assim desejar.' },
      { title: '', body: '§3º: A CONTRATANTE reserva-se o direito de suspender o pagamento, caso os serviços sejam executados em desacordo com as cláusulas deste contrato.' },
      { title: 'CLÁUSULA QUARTA: DA DURAÇÃO DO CONTRATO', body: 'O presente Contrato é celebrado por prazo indeterminado, podendo ser resilido por qualquer das partes, a qualquer tempo, mediante notificação prévia por escrito, sem incidência de penalidade, ressalvadas as obrigações já constituídas até a data da efetiva rescisão.' },
      { title: 'CLÁUSULA QUINTA: DAS OBRIGAÇÕES DA CONTRATADA', body: 'Além de outras obrigações legais ou contratuais, são responsabilidades específicas e exclusivas do CONTRATADA:' },
      { title: '', body: '§1º Fornecer todos os equipamentos necessários, incluindo veículos e armamentos, para garantir a execução completa e satisfatória dos Serviços;' },
      { title: '', body: '§2º Executar os serviços previstos neste Contrato utilizando funcionários registrados, profissionais e/ou empresas legalmente CONTRATADAS, devidamente selecionados e capacitados, sem antecedentes criminais, em conformidade com as normas e procedimentos aplicáveis;' },
      { title: '', body: '§3º: Realizar verificações periódicas sobre a manutenção das boas condições, capacidade e qualificação do pessoal envolvido nos Serviços;' },
      { title: '', body: '§4º: Cumprir com as leis, regulamentos e normas que regem os serviços;' },
      { title: '', body: '§5º: Obter, às suas próprias custas, as licenças, alvarás, permissões, autorizações e outros documentos exigidos para a execução do objeto deste Contrato;' },
      { title: '', body: '§6: Fornecer aos seus funcionários os equipamentos de proteção individuais (EPIs) necessários;' },
      { title: '', body: '§7º: Assegurar que seus funcionários estejam portando crachás de identificação e utilizando os EPIs;' },
      { title: '', body: '§8º: Contratar e manter, durante toda a vigência deste Contrato, uma apólice de seguro de garantia judicial em favor da CONTRATANTE e seu cliente final;' },
      { title: '', body: '§9º: Apresentar mensalmente e em conjunto com a Nota Fiscal todos os documentos de registro de seus funcionários e guias comprobatórias de recolhimento dos encargos trabalhistas;' },
      { title: '', body: '§10º: Caso a CONTRATANTE não aceite os serviços entregues pela CONTRATADA, a CONTRATADA obriga-se a refazer, alterar, melhorar, corrigir e/ou completar os serviços, sem quaisquer ônus adicionais;' },
      { title: '', body: '§11º: A CONTRATADA deverá manter pessoa responsável (supervisor) em contato direto com os funcionários que estiverem executando os serviços contratados.' },
      { title: '', body: '§12º: A CONTRATADA deverá manter durante toda a execução do contrato, em compatibilidade com as obrigações por ela assumidas, todas as condições de habilitação e qualificação exigidas.' },
      { title: '', body: '§13º: Manter os equipamentos e veículos em perfeitas condições de uso e com as devidas manutenções em dia.' },
      { title: '', body: '§14º: Providenciar a imediata substituição de qualquer funcionário cujo comportamento seja considerado inadequado pela CONTRATANTE.' },
      { title: '', body: '§15º: Responsabilizar-se por todos os encargos trabalhistas, previdenciários, fiscais e comerciais resultantes da execução do contrato.' },
      { title: 'CLÁUSULA SEXTA: DAS OBRIGAÇÕES DA CONTRATANTE', body: 'São responsabilidades exclusivas da CONTRATANTE:' },
      { title: '', body: '§1º: Fornecer à CONTRATADA as informações pertinentes à CONTRATANTE e que sejam essenciais para o desenvolvimento dos serviços.' },
      { title: '', body: '§2º: Cumprir pontualmente os prazos e as condições de pagamento.' },
      { title: '', body: '§3º: A CONTRATANTE poderá fiscalizar os serviços contratados, diretamente ou por meio de terceiros.' },
      { title: 'CLÁUSULA SÉTIMA: DA RESCISÃO', body: 'Este Contrato poderá ser rescindido de pleno direito, a critério da parte inocente, mediante simples aviso escrito à outra parte:' },
      { title: '', body: '§1º: Descumprimento de quaisquer obrigações e cláusulas deste instrumento;' },
      { title: '', body: '§2º: Em caso de insolvência, dissolução judicial ou extrajudicial, pedido de concordata e decretação de falência;' },
      { title: '', body: '§3º: Suspensão, pelas autoridades competentes, da execução dos fornecimentos;' },
      { title: '', body: '§4º: Decretação de falência, pedido de recuperação judicial ou manifesta situação de insolvência;' },
      { title: '', body: '§5º: No caso de qualquer das partes não observar as cláusulas deste instrumento, ficará sujeito ao pagamento de multa equivalente à 2 (duas) vezes o valor médio das 3 (três) faturas anteriores.' },
      { title: 'CLÁUSULA OITAVA: CONFIDENCIALIDADE', body: 'O CONTRATADO compromete-se, por si, seus sócios e funcionários, a manter a mais estrita confidencialidade em relação as informações relacionadas e sobre as quais tiver acesso em relação à CONTRATANTE. Esta obrigação sobrevive ao término deste Contrato, nos termos do inciso XI, do artigo 195, da Lei n. 9279/96.' },
      { title: 'CLÁUSULA NONA: DA RESPONSABILIDADE CIVIL', body: 'A CONTRATADA é responsável pelos danos causados diretamente à CONTRATANTE ou a terceiros, decorrentes de sua culpa ou dolo na execução dos serviços, não excluindo ou reduzindo essa responsabilidade a fiscalização ou o acompanhamento pela CONTRATANTE.' },
      { title: '', body: '§1º: A CONTRATADA deverá comunicar à CONTRATANTE, por escrito e imediatamente, qualquer ocorrência, acidente ou anormalidade verificada durante a prestação dos serviços, devendo apresentar relatório detalhado do evento no prazo máximo de 24 (vinte e quatro) horas.' },
      { title: '', body: '§2º: A CONTRATADA se responsabiliza integralmente por eventuais danos materiais ou pessoais causados a terceiros durante a execução dos serviços, devendo ressarcir a CONTRATANTE caso esta venha a ser demandada judicialmente em razão de atos praticados pela CONTRATADA ou por seus prepostos.' },
      { title: 'CLÁUSULA DÉCIMA TERCEIRA: DO FORO', body: 'As partes elegem a Comarca de São Paulo – SP, Foro de Santana, como único competente para dirimir dúvidas decorrentes deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.' },
    ];

    clauses.forEach(cl => {
      if (cl.title) {
        addSpace(5);
        checkPage(12);
        doc.setFillColor(245, 245, 245);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const titleLines = doc.splitTextToSize(cl.title, maxWidth - 6);
        const titleBlockH = titleLines.length * 4 + 4;
        doc.roundedRect(margin, y - 1, maxWidth, titleBlockH, 1, 1, 'F');
        doc.setDrawColor(brandRed[0], brandRed[1], brandRed[2]);
        doc.setLineWidth(0.8);
        doc.line(margin, y - 1, margin, y - 1 + titleBlockH);
        doc.setTextColor(brandBlack[0], brandBlack[1], brandBlack[2]);
        doc.text(titleLines, margin + 3, y + 3);
        y += titleBlockH + 3;
      }
      addText(cl.body, 9, 'normal', 'justify');
      addSpace(2);
    });

    addSpace(8);
    checkPage(50);

    doc.setDrawColor(brandRed[0], brandRed[1], brandRed[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    addSpace(6);

    addText(`São Paulo, ${formatDateExtended(contract.valid_from || contract.contract_date)}`, 10, 'italic', 'center', brandGray);
    addSpace(16);

    checkPage(60);

    const sigLeftX = margin;
    const sigRightX = pageWidth / 2 + 8;
    const sigWidth = (pageWidth - margin * 2 - 16) / 2;

    doc.setFillColor(250, 250, 250);
    doc.roundedRect(sigLeftX, y, sigWidth, 35, 2, 2, 'F');
    doc.setDrawColor(brandRed[0], brandRed[1], brandRed[2]);
    doc.setLineWidth(0.5);
    doc.line(sigLeftX, y, sigLeftX + sigWidth, y);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brandRed[0], brandRed[1], brandRed[2]);
    doc.text('CONTRATANTE', sigLeftX + sigWidth / 2, y + 5, { align: 'center' });

    doc.setDrawColor(brandGray[0], brandGray[1], brandGray[2]);
    doc.setLineWidth(0.3);
    doc.line(sigLeftX + 8, y + 22, sigLeftX + sigWidth - 8, y + 22);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brandBlack[0], brandBlack[1], brandBlack[2]);
    const contratanteSigName = 'TM SEGURANÇA CONSULTORIA &';
    const contratanteSigName2 = 'TECNOLOGIA INTEGRADA LTDA';
    doc.text(contratanteSigName, sigLeftX + sigWidth / 2, y + 27, { align: 'center' });
    doc.text(contratanteSigName2, sigLeftX + sigWidth / 2, y + 31, { align: 'center' });

    doc.setFillColor(250, 250, 250);
    doc.roundedRect(sigRightX, y, sigWidth, 35, 2, 2, 'F');
    doc.setDrawColor(brandRed[0], brandRed[1], brandRed[2]);
    doc.setLineWidth(0.5);
    doc.line(sigRightX, y, sigRightX + sigWidth, y);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brandRed[0], brandRed[1], brandRed[2]);
    doc.text('CONTRATADA', sigRightX + sigWidth / 2, y + 5, { align: 'center' });

    doc.setDrawColor(brandGray[0], brandGray[1], brandGray[2]);
    doc.setLineWidth(0.3);
    doc.line(sigRightX + 8, y + 22, sigRightX + sigWidth - 8, y + 22);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brandBlack[0], brandBlack[1], brandBlack[2]);
    const cNameLines = doc.splitTextToSize(cName, sigWidth - 16);
    cNameLines.forEach((line: string, idx: number) => {
      doc.text(line, sigRightX + sigWidth / 2, y + 27 + idx * 4, { align: 'center' });
    });

    y += 42;

    if (contract.witness1 || contract.witness2) {
      checkPage(25);
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(sigLeftX, y, sigWidth, 25, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(brandGray[0], brandGray[1], brandGray[2]);
      doc.text('TESTEMUNHA 1', sigLeftX + sigWidth / 2, y + 5, { align: 'center' });
      doc.setDrawColor(brandGray[0], brandGray[1], brandGray[2]);
      doc.line(sigLeftX + 8, y + 15, sigLeftX + sigWidth - 8, y + 15);
      doc.setTextColor(brandBlack[0], brandBlack[1], brandBlack[2]);
      doc.setFont('helvetica', 'normal');
      doc.text(contract.witness1 || '', sigLeftX + sigWidth / 2, y + 20, { align: 'center' });

      doc.setFillColor(250, 250, 250);
      doc.roundedRect(sigRightX, y, sigWidth, 25, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(brandGray[0], brandGray[1], brandGray[2]);
      doc.text('TESTEMUNHA 2', sigRightX + sigWidth / 2, y + 5, { align: 'center' });
      doc.line(sigRightX + 8, y + 15, sigRightX + sigWidth - 8, y + 15);
      doc.setTextColor(brandBlack[0], brandBlack[1], brandBlack[2]);
      doc.setFont('helvetica', 'normal');
      doc.text(contract.witness2 || '', sigRightX + sigWidth / 2, y + 20, { align: 'center' });
    }

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      pageNum = i;
      drawFooter();
      if (i > 1) {
        doc.setFillColor(brandRed[0], brandRed[1], brandRed[2]);
        doc.rect(0, 0, pageWidth, 3, 'F');
      }
    }

    doc.save(`Contrato_${cName.replace(/[^a-zA-Z0-9]/g, '_')}_${contract.contract_date}.pdf`);
    showNotification('PDF do contrato gerado com sucesso!', 'success');
  };

  const getDaysUntilExpiry = (validUntil: string): number | null => {
    if (!validUntil) return null;
    const diff = new Date(validUntil).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const activeContracts = contracts.filter(c => c.status === 'ASSINADO');
  const pendingContracts = contracts.filter(c => c.status === 'PENDENTE' || c.status === 'ENVIADO');
  const expiredContracts = contracts.filter(c => c.status === 'VENCIDO');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg"><FileText size={18} className="text-gray-600" /></div>
            <div>
              <p className="text-2xl font-black text-gray-900">{contracts.length}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Contratos</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><CheckCircle2 size={18} className="text-green-600" /></div>
            <div>
              <p className="text-2xl font-black text-green-700">{activeContracts.length}</p>
              <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Assinados</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-yellow-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg"><Clock size={18} className="text-yellow-600" /></div>
            <div>
              <p className="text-2xl font-black text-yellow-700">{pendingContracts.length}</p>
              <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">Pendentes</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg"><AlertTriangle size={18} className="text-red-600" /></div>
            <div>
              <p className="text-2xl font-black text-red-700">{expiredContracts.length}</p>
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Vencidos</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSignature size={20} className="text-red-700" />
            <h3 className="font-black text-gray-900 uppercase text-sm tracking-tight">Contratos</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchContracts} className="p-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-500" data-testid="btn-refresh-contracts">
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="px-4 py-2 bg-red-700 text-white rounded-lg text-xs font-bold uppercase hover:bg-red-800 transition-colors flex items-center gap-2"
              data-testid="btn-new-contract"
            >
              <Plus size={14} /> Novo Contrato
            </button>
          </div>
        </div>

        {showForm && (
          <div className="p-6 border-b border-gray-200 bg-gray-50/50 animate-in slide-in-from-top-2 duration-200">
            <h4 className="font-black text-sm text-gray-800 uppercase mb-4 flex items-center gap-2">
              <Gavel size={16} className="text-red-700" />
              {editingId ? 'Editar Contrato' : 'Novo Contrato'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>Tipo de Contrato</label>
                <select value={formState.contract_type} onChange={e => setFormState(p => ({ ...p, contract_type: e.target.value as any }))} className={INPUT} data-testid="select-contract-type">
                  <option value="CLIENTE">Cliente</option>
                  <option value="FORNECEDOR">Fornecedor</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Data do Contrato</label>
                <input type="date" value={formState.contract_date} onChange={e => setFormState(p => ({ ...p, contract_date: e.target.value }))} className={INPUT} data-testid="input-contract-date" />
              </div>
              <div>
                <label className={LABEL}>Status</label>
                <select value={formState.status} onChange={e => setFormState(p => ({ ...p, status: e.target.value as any }))} className={INPUT} data-testid="select-contract-status">
                  <option value="PENDENTE">Pendente</option>
                  <option value="ENVIADO">Enviado</option>
                  <option value="ASSINADO">Assinado</option>
                  <option value="CANCELADO">Cancelado</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Data Início do Contrato</label>
                <input type="date" value={formState.valid_from} onChange={e => setFormState(p => ({ ...p, valid_from: e.target.value }))} className={INPUT} data-testid="input-valid-from" />
                <span className="text-[9px] text-gray-400 mt-0.5 block">Data que constará no PDF (aceita retroativa)</span>
              </div>
              <div>
                <label className={LABEL}>Vigência Fim (opcional)</label>
                <input type="date" value={formState.valid_until} onChange={e => setFormState(p => ({ ...p, valid_until: e.target.value }))} className={INPUT} data-testid="input-valid-until" />
              </div>
              <div>
                <label className={LABEL}>Data da Assinatura</label>
                <input type="date" value={formState.signed_at} onChange={e => setFormState(p => ({ ...p, signed_at: e.target.value }))} className={INPUT} data-testid="input-signed-at" />
              </div>
              <div>
                <label className={LABEL}>Assinado por (Contratada)</label>
                <input type="text" value={formState.signed_by} onChange={e => setFormState(p => ({ ...p, signed_by: e.target.value }))} className={INPUT} placeholder="Nome do representante" data-testid="input-signed-by" />
              </div>
              <div>
                <label className={LABEL}>Testemunha 1</label>
                <input type="text" value={formState.witness1} onChange={e => setFormState(p => ({ ...p, witness1: e.target.value }))} className={INPUT} placeholder="Nome da testemunha 1" data-testid="input-witness1" />
              </div>
              <div>
                <label className={LABEL}>Testemunha 2</label>
                <input type="text" value={formState.witness2} onChange={e => setFormState(p => ({ ...p, witness2: e.target.value }))} className={INPUT} placeholder="Nome da testemunha 2" data-testid="input-witness2" />
              </div>
            </div>
            <div className="mt-4">
              <label className={LABEL}>Observações</label>
              <textarea value={formState.notes} onChange={e => setFormState(p => ({ ...p, notes: e.target.value }))} className={`${INPUT} h-20 resize-none`} placeholder="Observações adicionais..." data-testid="input-contract-notes" />
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={resetForm} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold uppercase hover:bg-gray-200" data-testid="btn-cancel-contract">Cancelar</button>
              <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 bg-red-700 text-white rounded-lg text-xs font-bold uppercase hover:bg-red-800 flex items-center gap-2 disabled:opacity-50" data-testid="btn-save-contract">
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingId ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="p-20 flex justify-center"><Loader2 size={32} className="animate-spin text-red-600" /></div>
        ) : contracts.length === 0 ? (
          <div className="p-20 text-center">
            <FileSignature size={48} className="text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Nenhum contrato registrado para este cliente.</p>
            <p className="text-gray-300 text-xs mt-2">Clique em "Novo Contrato" para criar o primeiro.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {contracts.map(c => {
              const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.PENDENTE;
              const StatusIcon = statusCfg.icon;
              const daysLeft = getDaysUntilExpiry(c.valid_until);
              const isExpiringSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 30;

              return (
                <div key={c.id} className="p-4 hover:bg-gray-50/50 transition-colors" data-testid={`contract-row-${c.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${statusCfg.color}`}>
                          <StatusIcon size={12} /> {statusCfg.label}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-gray-50 border-gray-200 text-gray-500 uppercase">
                          {c.contract_type === 'FORNECEDOR' ? 'Fornecedor' : 'Cliente'}
                        </span>
                        {isExpiringSoon && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-200">
                            <AlertTriangle size={10} /> Vence em {daysLeft} dias
                          </span>
                        )}
                        {c.status === 'VENCIDO' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">
                            <AlertTriangle size={10} /> Contrato Vencido
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-[9px] font-bold text-gray-400 uppercase block">Data Contrato</span>
                          <span className="font-bold text-gray-700">{formatDateBR(c.contract_date)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-gray-400 uppercase block">Vigência</span>
                          <span className="font-bold text-gray-700">
                            {formatDateBR(c.valid_from)} {c.valid_until ? `→ ${formatDateBR(c.valid_until)}` : '→ Indeterminado'}
                          </span>
                        </div>
                        {c.signed_at && (
                          <div>
                            <span className="text-[9px] font-bold text-gray-400 uppercase block">Assinado em</span>
                            <span className="font-bold text-green-700">{formatDateBR(c.signed_at)}</span>
                          </div>
                        )}
                        {c.signed_by && (
                          <div>
                            <span className="text-[9px] font-bold text-gray-400 uppercase block">Assinado por</span>
                            <span className="font-bold text-gray-700">{c.signed_by}</span>
                          </div>
                        )}
                      </div>
                      {c.notes && (
                        <p className="text-xs text-gray-500 mt-2 italic">"{c.notes}"</p>
                      )}
                      <p className="text-[9px] text-gray-300 mt-2">
                        Criado por {c.created_by} em {new Date(c.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => generatePDF(c)}
                        className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Gerar PDF do Contrato"
                        data-testid={`btn-pdf-${c.id}`}
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => handleEdit(c)}
                        className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Editar"
                        data-testid={`btn-edit-contract-${c.id}`}
                      >
                        <Edit2 size={14} />
                      </button>
                      {c.status === 'PENDENTE' && (
                        <button
                          onClick={() => handleStatusChange(c, 'ENVIADO')}
                          className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                          title="Marcar como Enviado"
                          data-testid={`btn-send-${c.id}`}
                        >
                          <Send size={14} />
                        </button>
                      )}
                      {(c.status === 'PENDENTE' || c.status === 'ENVIADO') && (
                        <button
                          onClick={() => handleStatusChange(c, 'ASSINADO')}
                          className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                          title="Marcar como Assinado"
                          data-testid={`btn-sign-${c.id}`}
                        >
                          <ShieldCheck size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        title="Excluir"
                        data-testid={`btn-delete-contract-${c.id}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientContractTab;
