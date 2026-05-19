
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Save, MapPin, Flag, FileText, Building2, Ruler, Loader2, Plus, X, Navigation, Calendar, ShieldCheck, DollarSign, Calculator, Briefcase, TrendingUp, TrendingDown, ArrowRight, Check, ChevronDown, Package, Info, Siren, Clock, Tag, Layers, Truck, Search, User, Phone, AlertCircle, AlertTriangle, CheckCircle2, Zap, Shield, ShieldAlert, Paperclip, Image, Trash2, Clipboard, Mail } from 'lucide-react';
import { MissionStatus, Client, ClientRoute, ClientPriceTable, ProviderData, ProviderCostTable, ClientVehicleDB } from '../types';
import { authFetch } from '../lib/authFetch';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { useNotification } from '../lib/NotificationContext';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';
import { googleMapsLoadConfig } from '../lib/maps';

import ClientForm from './ClientForm';
import ProviderForm from './ProviderForm';
import ClientRouteForm from './ClientRouteForm';
import ClientVehicleForm from './ClientVehicleForm';
import { formatProviderName } from '../lib/utils';
import { extractUF, UF_TO_REGION, clientFuzzyFilter } from '../lib/financialUtils';

const INPUT_CLASS = "w-full bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 text-sm h-11 transition-all text-gray-700 pl-12 pr-4";
const LABEL_CLASS = "text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest";
const SELECT_CLASS = "w-full bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 text-sm h-11 transition-all text-gray-700 pl-12 pr-10 appearance-none cursor-pointer";
const DROPDOWN_ITEM_CLASS = "w-full text-left p-3 text-[11px] font-bold hover:bg-red-50 border-b border-gray-50 uppercase text-gray-700 transition-colors flex items-center gap-2";

const CITY_MAP: Record<string, { uf: string, region: string }> = {
    'BRASILIA': { uf: 'DF', region: 'CENTRO-OESTE' },
    'GOIANIA': { uf: 'GO', region: 'CENTRO-OESTE' },
    'APARECIDA DE GOIANIA': { uf: 'GO', region: 'CENTRO-OESTE' },
    'CUIABA': { uf: 'MT', region: 'CENTRO-OESTE' },
    'CAMPO GRANDE': { uf: 'MS', region: 'CENTRO-OESTE' },
    'ANAPOLIS': { uf: 'GO', region: 'CENTRO-OESTE' },
    'SINOP': { uf: 'MT', region: 'CENTRO-OESTE' },
    'RONDONOPOLIS': { uf: 'MT', region: 'CENTRO-OESTE' },
    'JUNDIAI': { uf: 'SP', region: 'SUDESTE' },
    'CAMPINAS': { uf: 'SP', region: 'SUDESTE' },
    'CAJAMAR': { uf: 'SP', region: 'SUDESTE' },
    'SANTOS': { uf: 'SP', region: 'SUDESTE' },
    'GUARULHOS': { uf: 'SP', region: 'SUDESTE' },
    'SAO PAULO': { uf: 'SP', region: 'SUDESTE' },
    'RIO DE JANEIRO': { uf: 'RJ', region: 'SUDESTE' },
    'DUQUE DE CAXIAS': { uf: 'RJ', region: 'SUDESTE' },
    'BETIM': { uf: 'MG', region: 'SUDESTE' },
    'CONTAGEM': { uf: 'MG', region: 'SUDESTE' },
    'PALHOCA': { uf: 'SC', region: 'SUL' },
    'FLORIANOPOLIS': { uf: 'SC', region: 'SUL' },
    'ITAJAI': { uf: 'SC', region: 'SUL' },
    'CURITIBA': { uf: 'PR', region: 'SUL' },
    'PORTO ALEGRE': { uf: 'RS', region: 'SUL' }
};

const normalizeStr = (str: string) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

interface MissionFormProps {
  onBack: () => void;
  onSaveAndContinue: (missionId: string) => void;
  onAddClient: () => void;
}

interface EscoltistaSnapshot {
  nome?: string | null;
  cpf?: string | null;
  rg?: string | null;
  orgao_emissor?: string | null;
  cnh?: string | null;
  cnh_categoria?: string | null;
  cnh_vencimento?: string | null;
  cnv_numero?: string | null;
  cnv_validade?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  celular?: string | null;
  admissao?: string | null;
}

interface VehicleSnapshot {
  placa?: string | null;
  renavam?: string | null;
  marca?: string | null;
  modelo?: string | null;
  ano?: string | null;
  cor?: string | null;
  tecnologia?: string | null;
  id_rastreador?: string | null;
  comunicacao?: string | null;
}

interface DhlIntakeRow {
  id: string;
  token: string;
  provider_name: string | null;
  status: string;
  effective_status: string;
  expired: boolean;
  sent_to_email: string | null;
  sent_to_phone: string | null;
  submitted_at: string | null;
  created_at: string;
  expires_at: string | null;
  agent1_snapshot?: EscoltistaSnapshot | null;
  agent2_snapshot?: EscoltistaSnapshot | null;
  vehicle_snapshot?: VehicleSnapshot | null;
  mirror_proof_url?: string | null;
  mirror_proof_filename?: string | null;
  provider_reminder_count?: number | null;
  provider_whatsapp_reminder_count?: number | null;
  provider_reminder_sent_at?: string | null;
  provider_whatsapp_reminder_sent_at?: string | null;
  auto_reminders_paused_at?: string | null;
  auto_reminders_paused_by?: string | null;
  resends?: any[];
}

interface DhlReminderConfig {
  maxCount: number;
  cycleHours: number;
}

const MissionForm: React.FC<MissionFormProps> = ({ onBack, onSaveAndContinue }) => {
  const { showNotification } = useNotification();
  const [osId, setOsId] = useState("GTM-....");
  const [canViewFinancials, setCanViewFinancials] = useState(false);
  const [canViewIntakeSnapshots, setCanViewIntakeSnapshots] = useState(false);
  
  const now = new Date();
  const defaultDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); 
  const defaultTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  const [formData, setFormData] = useState({
    client: '', provider: '', origin: '', destination: '', totalDistance: '', estimatedTime: '',
    scheduledDate: defaultDate, scheduledTime: defaultTime, missionType: '', 
    revenueValue: '', costValue: '', tollValue: '0', applyCeva200km: false, raioKm: 0, applyVtc02h: false, isSameOs: false, parentMissionId: '',
    clientVehicleId: '', clientVehiclePlate: '', clientVehicleModel: '',
    clientVehicleId2: '', clientVehiclePlate2: '', clientVehicleModel2: '',
    driver_name: '', driver_phone: '', startKm: '',
    driver_name_2: '', driver_phone_2: '',
    reference_number: '',
    dhl_se_number: ''
  });
  const [dhlLinkModal, setDhlLinkModal] = useState<{ open: boolean; missionId: string; url: string; whatsappText: string; phone: string; channel: 'email' | 'whatsapp' | 'both'; emailSent: boolean; providerEmail: string; whatsappSent: boolean; whatsappError: string | null }>({ open: false, missionId: '', url: '', whatsappText: '', phone: '', channel: 'both', emailSent: false, providerEmail: '', whatsappSent: false, whatsappError: null });
  const [dhlChannelPicker, setDhlChannelPicker] = useState<{ open: boolean; preferred: 'email' | 'whatsapp' | 'both'; saveAsDefault: boolean }>({ open: false, preferred: 'both', saveAsDefault: false });
  const [dhlIntakes, setDhlIntakes] = useState<DhlIntakeRow[]>([]);
  const [dhlIntakesLoading, setDhlIntakesLoading] = useState(false);
  const [dhlReminderConfig, setDhlReminderConfig] = useState<DhlReminderConfig>({ maxCount: 3, cycleHours: 12 });
  const [dhlRegenerating, setDhlRegenerating] = useState(false);
  const [dhlReleaseSending, setDhlReleaseSending] = useState(false);
  const [dhlSchemaModal, setDhlSchemaModal] = useState<{ open: boolean; message: string; sql: string; loadingSql: boolean }>({ open: false, message: '', sql: '', loadingSql: false });
  const [dhlEmailModal, setDhlEmailModal] = useState<{ open: boolean; providerId: string | number; providerName: string; email: string; saving: boolean; retryChannel: 'email' | 'whatsapp' | 'both'; retrySaveAsDefault: boolean; retryAfterSave: 'generate' | 'submit'; retryMissionId: string }>({ open: false, providerId: '', providerName: '', email: '', saving: false, retryChannel: 'both', retrySaveAsDefault: false, retryAfterSave: 'generate', retryMissionId: '' });
  const [expandedIntakeId, setExpandedIntakeId] = useState<string | null>(null);
  const [copiedIntakeId, setCopiedIntakeId] = useState<string | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [emailConfirmDialog, setEmailConfirmDialog] = useState<{ clientPayload?: any; providerPayload?: any; onSaveCallback?: () => void } | null>(null);
  const [isSendingConfirmedEmail, setIsSendingConfirmedEmail] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcDetails, setCalcDetails] = useState('');
  const [dbClients, setDbClients] = useState<Client[]>([]);
  const [dbProviders, setDbProviders] = useState<ProviderData[]>([]);
  const [dbClientVehicles, setDbClientVehicles] = useState<ClientVehicleDB[]>([]);
  const [dbPastDrivers, setDbPastDrivers] = useState<{name: string, phone: string}[]>([]);
  const [clientRoutes, setClientRoutes] = useState<ClientRoute[]>([]);
  const [clientPriceTables, setClientPriceTables] = useState<ClientPriceTable[]>([]);
  const [providerCostTables, setProviderCostTables] = useState<ProviderCostTable[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [manualRevenueTableId, setManualRevenueTableId] = useState('');
  const [manualCostTableId, setManualCostTableId] = useState('');
  const [routeSearchTerm, setRouteSearchTerm] = useState('');
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState('');
  const [vehicleSearchTerm2, setVehicleSearchTerm2] = useState('');
  const [driverSearchTerm, setDriverSearchTerm] = useState('');
  const [showSecondVehicle, setShowSecondVehicle] = useState(false);
  
  // Provider Search
  const [providerSearchTerm, setProviderSearchTerm] = useState('');
  
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [parentOsSuggestions, setParentOsSuggestions] = useState<{id: string, client: string, provider: string, origin: string, destination: string, start_time: string, status: string}[]>([]);
  const [parentOsSearch, setParentOsSearch] = useState('');
  const [showParentOsDropdown, setShowParentOsDropdown] = useState(false);

  const [evidenceFiles, setEvidenceFiles] = useState<{ file: File; preview: string }[]>([]);
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inteligência de Software: Restrição IBL/Sorocaba
  const [iblWarning, setIblWarning] = useState('');

  const [isCommercialUser, setIsCommercialUser] = useState(false);
  const [providerPending, setProviderPending] = useState(false);
  const [manualOverrides, setManualOverrides] = useState({ revenue: false, cost: false, toll: false });
  const [operatorConfirmedCalc, setOperatorConfirmedCalc] = useState(false);
  const [isCalculatingToll, setIsCalculatingToll] = useState(false);
  const [tollDetails, setTollDetails] = useState<{ count: number; tolls: any[]; observacoes?: string; confianca?: string; provider?: string } | null>(null);
  const [expandedStep, setExpandedStep] = useState<number>(1);
  const [driverQuestion, setDriverQuestion] = useState<'asking' | 'yes' | 'no' | null>(null);
  const [scheduleMode, setScheduleMode] = useState<'asking' | 'immediate' | 'scheduled' | null>(null);
  const [dhlSeConfirmed, setDhlSeConfirmed] = useState<string>('');

  const { isLoaded: isGoogleLoaded } = useLoadScript(googleMapsLoadConfig);
  const originAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const destinationAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const step3Done = !!(formData.clientVehicleId && (driverQuestion === 'no' || (driverQuestion === 'yes' && formData.driver_name && formData.driver_phone && formData.driver_phone.replace(/\D/g, '').length >= 10)));
  const tollLoaded = !isCalculatingToll && (parseFloat(formData.tollValue) > 0 || manualOverrides.toll || parseFloat(formData.tollValue) === 0);
  const step5Done = !!(formData.origin && formData.destination && selectedRouteId && formData.estimatedTime && manualRevenueTableId && tollLoaded && operatorConfirmedCalc);
  const isScheduledInPast = scheduleMode === 'scheduled' && formData.scheduledDate && formData.scheduledTime && new Date(`${formData.scheduledDate}T${formData.scheduledTime}:00`).getTime() < Date.now();
  const step6Done = step5Done && (scheduleMode === 'immediate' || (scheduleMode === 'scheduled' && !!formData.scheduledDate && !!formData.scheduledTime && !isScheduledInPast));

  const isVtcClient = (formData.client || '').toUpperCase().includes('VTC');
  const isCeslogClient = (formData.client || '').toUpperCase().includes('CESLOG') || (formData.client || '').toUpperCase().includes('CESARI');
  const isDhlClient = (formData.client || '').toUpperCase().includes('DHL');
  const hasSavedOs = /^GTM-\d+/i.test(osId);

  const fetchDhlIntakes = useCallback(async (missionId: string) => {
    if (!missionId || !/^GTM-\d+/i.test(missionId)) return;
    setDhlIntakesLoading(true);
    try {
      const r = await authFetch(`/api/dhl/intake/by-mission/${encodeURIComponent(missionId)}`);
      const j = await r.json();
      if (r.ok && Array.isArray(j.intakes)) setDhlIntakes(j.intakes);
      else setDhlIntakes([]);
      if (r.ok && j?.reminderConfig && typeof j.reminderConfig.maxCount === 'number' && typeof j.reminderConfig.cycleHours === 'number') {
        setDhlReminderConfig({ maxCount: j.reminderConfig.maxCount, cycleHours: j.reminderConfig.cycleHours });
      }
    } catch (e) {
      console.warn('[DHL Intakes] fetch error', e);
      setDhlIntakes([]);
    } finally {
      setDhlIntakesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDhlClient && hasSavedOs) fetchDhlIntakes(osId);
    else setDhlIntakes([]);
  }, [isDhlClient, hasSavedOs, osId, fetchDhlIntakes]);

  const handleRegenerateDhlLink = async (channel: 'email' | 'whatsapp' | 'both' = 'both', opts?: { saveAsDefault?: boolean }) => {
    if (!hasSavedOs) { showNotification('OS não salva', 'Salve a OS antes de gerar o link.', 'warning'); return; }
    const saveAsDefault = !!opts?.saveAsDefault;
    setDhlChannelPicker(prev => ({ ...prev, open: false, saveAsDefault: false }));
    setDhlRegenerating(true);
    try {
      const token = localStorage.getItem('authToken') || '';
      const r = await fetch('/api/dhl/intake/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ missionId: osId, channel, saveAsDefault }),
      });
      const j = await r.json();
      if (r.ok && j.url) {
        setDhlLinkModal({ open: true, missionId: osId, url: j.url, whatsappText: j.whatsappText || '', phone: j.providerPhone || '', channel, emailSent: !!j.emailSent, providerEmail: j.providerEmail || '', whatsappSent: !!j.whatsappSent, whatsappError: j.whatsappError || null });
        const wantsEmail = channel === 'email' || channel === 'both';
        const wantsWhatsapp = channel === 'whatsapp' || channel === 'both';
        const phoneOk = !!(j.providerPhone && String(j.providerPhone).trim());

        if (wantsWhatsapp && j.whatsappSent) {
          const extra = wantsEmail
            ? (j.emailSent ? ` E-mail também enviado para ${j.providerEmail || 'o fornecedor'}.` : (j.emailError ? ` (Falha no e-mail: ${j.emailError})` : ''))
            : '';
          showNotification('WhatsApp enviado', `Mensagem enviada automaticamente ao fornecedor.${extra}`, 'success');
        } else if (wantsWhatsapp && !phoneOk) {
          showNotification('Fornecedor sem telefone', 'Não há telefone cadastrado para o fornecedor. Copie a mensagem ou abra o WhatsApp Web.', 'warning');
        } else if (wantsWhatsapp && j.whatsappError) {
          showNotification('WhatsApp não enviado', `Falha automática: ${j.whatsappError}. Use o botão para enviar pelo WhatsApp Web.`, 'warning');
        } else if (wantsEmail && j.emailSent) {
          showNotification('E-mail enviado', `Link DHL enviado para ${j.providerEmail || 'o fornecedor'}.`, 'success');
        } else if (wantsEmail && j.emailError) {
          showNotification('E-mail não enviado', `Falha ao enviar e-mail: ${j.emailError}.`, 'warning');
        } else if (wantsEmail && !j.providerEmail) {
          showNotification('Fornecedor sem e-mail', 'Não há e-mail cadastrado para o fornecedor.', 'warning');
        }
        if (saveAsDefault && j.preferenceSaved) {
          setDbProviders(prev => prev.map(p => {
            const matches = p.name === formData.provider || p.trading_name === formData.provider;
            return matches ? { ...p, dhl_channel_preference: channel } : p;
          }));
          showNotification('Canal padrão salvo', `Próximos reenvios para este fornecedor usarão "${channel === 'email' ? 'Só e-mail' : channel === 'whatsapp' ? 'Só WhatsApp' : 'Ambos'}" com um clique.`, 'success');
        } else if (saveAsDefault && j.preferenceSaveError) {
          showNotification('Canal padrão não salvo', `O link foi enviado, mas não foi possível salvar o canal padrão: ${j.preferenceSaveError}`, 'warning');
        }
        await fetchDhlIntakes(osId);
      } else {
        const errMsg = j.error || 'erro desconhecido';
        if (j.code === 'PROVIDER_EMAIL_REQUIRED') {
          setDhlEmailModal({
            open: true,
            providerId: j.providerId,
            providerName: j.providerName || formData.provider || 'fornecedor',
            email: '',
            saving: false,
            retryChannel: channel,
            retrySaveAsDefault: saveAsDefault,
            retryAfterSave: 'generate',
            retryMissionId: osId,
          });
        } else if (/banco ainda não tem as tabelas/i.test(errMsg)) {
          openDhlSchemaModal('O banco do Supabase ainda não tem as tabelas do fluxo DHL. Copie o SQL abaixo e cole no Supabase Studio → SQL Editor → Run. Depois tente reenviar o link.');
        } else {
          showNotification('Falha ao gerar novo link', errMsg, 'error');
        }
      }
    } catch (err: any) {
      showNotification('Falha ao gerar novo link', err?.message || 'erro de rede', 'error');
    } finally {
      setDhlRegenerating(false);
    }
  };

  // Salva o e-mail informado pelo operador no cadastro do fornecedor e
  // dispara novamente a geração do link DHL (ou refaz o fluxo pós-save da OS).
  const handleDhlEmailSubmit = async () => {
    const email = (dhlEmailModal.email || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showNotification('E-mail inválido', 'Informe um e-mail válido para o fornecedor.', 'warning');
      return;
    }
    setDhlEmailModal(prev => ({ ...prev, saving: true }));
    try {
      const { error } = await supabase
        .from('providers')
        .update({ os_email: email })
        .eq('id', dhlEmailModal.providerId);
      if (error) throw error;
      // Atualiza estado local para refletir o e-mail recém-cadastrado
      setDbProviders(prev => prev.map(p =>
        String(p.id) === String(dhlEmailModal.providerId) ? { ...p, os_email: email } : p
      ));
      showNotification('E-mail do fornecedor salvo', `${dhlEmailModal.providerName}: ${email}`, 'success');
      const retryChannel = dhlEmailModal.retryChannel;
      const retrySaveAsDefault = dhlEmailModal.retrySaveAsDefault;
      const retryAfterSave = dhlEmailModal.retryAfterSave;
      const retryMissionId = dhlEmailModal.retryMissionId;
      setDhlEmailModal({ open: false, providerId: '', providerName: '', email: '', saving: false, retryChannel: 'both', retrySaveAsDefault: false, retryAfterSave: 'generate', retryMissionId: '' });
      if (retryAfterSave === 'generate') {
        await handleRegenerateDhlLink(retryChannel, { saveAsDefault: retrySaveAsDefault });
      } else {
        // Pós-criação da OS: chama o generate diretamente com o id da OS recém-salva
        await retryDhlGenerateAfterMissionSave(retryMissionId);
      }
    } catch (e: any) {
      showNotification('Falha ao salvar e-mail', e?.message || 'erro desconhecido', 'error');
      setDhlEmailModal(prev => ({ ...prev, saving: false }));
    }
  };

  // Helper usado quando o erro PROVIDER_EMAIL_REQUIRED acontece logo após a
  // criação da OS (no handleSubmit). Refaz só a geração do link, sem recriar a OS.
  const retryDhlGenerateAfterMissionSave = async (missionId: string) => {
    try {
      const token = localStorage.getItem('authToken') || '';
      const r = await fetch('/api/dhl/intake/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ missionId }),
      });
      const j = await r.json();
      if (r.ok && j.url) {
        setDhlLinkModal({ open: true, missionId, url: j.url, whatsappText: j.whatsappText || '', phone: j.providerPhone || '', channel: 'both', emailSent: !!j.emailSent, providerEmail: j.providerEmail || '', whatsappSent: !!j.whatsappSent, whatsappError: j.whatsappError || null });
      } else if (j.code === 'PROVIDER_EMAIL_REQUIRED') {
        // Cobertura defensiva: se o e-mail recém-salvo ainda não refletiu no
        // backend (cache, replicação), reabre o modal para nova tentativa.
        setDhlEmailModal({
          open: true,
          providerId: j.providerId,
          providerName: j.providerName || formData.provider || 'fornecedor',
          email: '',
          saving: false,
          retryChannel: 'both',
          retrySaveAsDefault: false,
          retryAfterSave: 'submit',
          retryMissionId: missionId,
        });
      } else {
        alert('OS salva, mas falhou ao gerar o link DHL: ' + (j.error || 'erro desconhecido'));
      }
    } catch (err: any) {
      alert('OS salva, mas falhou ao gerar o link DHL: ' + (err?.message || 'erro de rede'));
    }
  };

  const openDhlSchemaModal = async (message: string) => {
    setDhlSchemaModal({ open: true, message, sql: '', loadingSql: true });
    try {
      const token = localStorage.getItem('authToken') || '';
      const r = await fetch('/api/dhl/migrations-sql', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      const j = await r.json();
      if (r.ok && j.sql) {
        setDhlSchemaModal(prev => ({ ...prev, sql: j.sql, loadingSql: false }));
      } else {
        setDhlSchemaModal(prev => ({ ...prev, sql: '-- Não foi possível carregar o SQL: ' + (j.error || 'erro') + '\n-- Abra o arquivo scripts/dhl-migrations.sql na raiz do projeto.', loadingSql: false }));
      }
    } catch (err: any) {
      setDhlSchemaModal(prev => ({ ...prev, sql: '-- Erro de rede ao carregar o SQL: ' + (err?.message || 'desconhecido') + '\n-- Abra o arquivo scripts/dhl-migrations.sql na raiz do projeto.', loadingSql: false }));
    }
  };

  // Reenvia o e-mail comunicando que o link está LIBERADO e copia o texto do WhatsApp
  // (mesmo texto que o fornecedor recebe), em um único clique.
  const handleResendEmailAndCopyWhatsapp = async () => {
    if (!hasSavedOs) { showNotification('OS não salva', 'Salve a OS antes de reenviar o link.', 'warning'); return; }
    setDhlReleaseSending(true);
    try {
      const token = localStorage.getItem('authToken') || '';
      const r = await fetch('/api/dhl/intake/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ missionId: osId, channel: 'email' }),
      });
      const j = await r.json();
      if (!r.ok || !j.url) {
        const errMsg = j.error || 'erro desconhecido';
        if (/banco ainda não tem as tabelas/i.test(errMsg)) {
          openDhlSchemaModal('O banco do Supabase ainda não tem as tabelas do fluxo DHL. Copie o SQL abaixo e cole no Supabase Studio → SQL Editor → Run. Depois tente novamente.');
        } else {
          showNotification('Falha ao reenviar', errMsg, 'error');
        }
        return;
      }
      // Copia mensagem WhatsApp avisando que o link está liberado
      const waText = j.whatsappText || `Olá! O link para preenchimento da OS ${osId} está liberado: ${j.url}`;
      try {
        await navigator.clipboard.writeText(waText);
      } catch {
        // ignora falha de clipboard — mensagem ainda fica disponível no modal abaixo
      }
      // Abre o modal já mostrando o status e a mensagem para copiar manualmente se preciso
      setDhlLinkModal({
        open: true,
        missionId: osId,
        url: j.url,
        whatsappText: waText,
        phone: j.providerPhone || '',
        channel: 'both',
        emailSent: !!j.emailSent,
        providerEmail: j.providerEmail || '',
        whatsappSent: false,
        whatsappError: null,
      });
      const emailPart = j.emailSent
        ? `E-mail reenviado para ${j.providerEmail || 'o fornecedor'}.`
        : (j.emailError ? `E-mail não enviado (${j.emailError}).` : 'Fornecedor sem e-mail cadastrado.');
      showNotification('Link liberado', `${emailPart} Mensagem do WhatsApp já copiada — é só colar na conversa.`, 'success');
      await fetchDhlIntakes(osId);
    } catch (err: any) {
      showNotification('Falha ao reenviar', err?.message || 'erro de rede', 'error');
    } finally {
      setDhlReleaseSending(false);
    }
  };

  const [dhlPauseToggling, setDhlPauseToggling] = useState<string | null>(null);
  const handleToggleDhlReminders = async (intakeId: string, pause: boolean) => {
    if (!intakeId) return;
    setDhlPauseToggling(intakeId);
    try {
      const token = localStorage.getItem('authToken') || '';
      const action = pause ? 'pause-reminders' : 'resume-reminders';
      const r = await fetch(`/api/dhl/intake/${encodeURIComponent(intakeId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok) {
        showNotification('Falha', j.error || 'erro desconhecido', 'error');
        return;
      }
      const pausedAt = j.intake?.auto_reminders_paused_at || null;
      const pausedBy = j.intake?.auto_reminders_paused_by || null;
      setDhlIntakes(prev => prev.map(it => it.id === intakeId
        ? { ...it, auto_reminders_paused_at: pausedAt, auto_reminders_paused_by: pausedBy }
        : it));
      showNotification(
        pause ? 'Lembretes pausados' : 'Lembretes retomados',
        pause
          ? 'O sistema não enviará mais lembretes automáticos para este fornecedor nesta OS.'
          : 'O ciclo de lembretes automáticos voltará a rodar normalmente.',
        'success',
      );
    } catch (err: any) {
      showNotification('Falha', err?.message || 'erro de rede', 'error');
    } finally {
      setDhlPauseToggling(null);
    }
  };
  const hasClientRules = isVtcClient || (formData.client || '').toUpperCase().includes('CEVA');

  const dhlSeOk = !isDhlClient || (
    !!formData.dhl_se_number.trim() &&
    dhlSeConfirmed.trim().toUpperCase() === formData.dhl_se_number.trim().toUpperCase()
  );
  const stepComplete = {
    step1: !!formData.missionType,
    step2: !!formData.client && dhlSeOk,
    step3: step3Done,
    step4: !!(formData.provider || providerPending),
    step5: step5Done,
    step6: step6Done,
  };
  const canShowStep2 = stepComplete.step1;
  const canShowStep3 = stepComplete.step2;
  const canShowStep4 = canShowStep3;
  const canShowStep5 = stepComplete.step4;
  const canShowStep6 = stepComplete.step5;

  useEffect(() => {
    if (expandedStep === 1 && stepComplete.step1) setExpandedStep(2);
    else if (expandedStep === 2 && stepComplete.step2) setExpandedStep(3);
    else if (expandedStep === 3 && stepComplete.step3) setExpandedStep(4);
    else if (expandedStep === 4 && stepComplete.step4) setExpandedStep(5);
    else if (expandedStep === 5 && stepComplete.step5) { setScheduleMode('asking'); setExpandedStep(6); }
  }, [stepComplete.step1, stepComplete.step2, stepComplete.step3, stepComplete.step4, stepComplete.step5, manualRevenueTableId]);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            const role = (user.role || "").toLowerCase();
            const allowed = ['diretoria', 'administrador'].includes(role) || (user.permissions && user.permissions.includes('*'));
            setCanViewFinancials(allowed);
            const opAllowed = ['administrador', 'diretoria', 'avançado', 'avancado', 'operador'].includes(role) || (user.permissions && user.permissions.includes('*'));
            setCanViewIntakeSnapshots(opAllowed);
            if (role === 'comercial') {
                setIsCommercialUser(true);
                const clientPerm = (user.permissions || []).find((p: string) => p.startsWith('client_view:'));
                if (clientPerm) {
                    const assignedClient = clientPerm.replace('client_view:', '');
                    setFormData(prev => ({ ...prev, client: assignedClient }));
                }
            }
        } catch (e) { console.error(e); }
    }
    generateId();
    loadBasicData();
    fetchPastDrivers();

    const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setActiveDropdown(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);

    const handlePaste = (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) {
                    const preview = URL.createObjectURL(file);
                    setEvidenceFiles(prev => [...prev, { file, preview }]);
                }
                break;
            }
        }
    };
    document.addEventListener('paste', handlePaste);

    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('paste', handlePaste);
    };
  }, []);

  useEffect(() => {
    if (!formData.isSameOs || !formData.client) { setParentOsSuggestions([]); return; }
    const fetchSuggestions = async () => {
      let query = supabase.from('missions').select('id, client, provider, origin, destination, start_time, status, parent_mission_id')
        .eq('client', formData.client).is('parent_mission_id', null).order('created_at', { ascending: false }).limit(50);
      if (formData.provider) query = query.eq('provider', formData.provider);
      const { data } = await query;
      if (data) setParentOsSuggestions(data);
    };
    fetchSuggestions();
  }, [formData.isSameOs, formData.client, formData.provider]);

  const handleEvidenceFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      Array.from(files).forEach(file => {
          if (file.type.startsWith('image/')) {
              const preview = URL.createObjectURL(file);
              setEvidenceFiles(prev => [...prev, { file, preview }]);
          }
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeEvidence = (index: number) => {
      setEvidenceFiles(prev => {
          URL.revokeObjectURL(prev[index].preview);
          return prev.filter((_, i) => i !== index);
      });
  };

  const uploadEvidences = async (missionId: string) => {
      if (evidenceFiles.length === 0) return;
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      for (let i = 0; i < evidenceFiles.length; i++) {
          const { file } = evidenceFiles[i];
          const ext = file.name.split('.').pop() || 'png';
          const filePath = `${missionId}/${Date.now()}_${i}.${ext}`;
          const { error: uploadError } = await supabase.storage.from('mission-evidence').upload(filePath, file, { contentType: file.type, upsert: false });
          if (uploadError) {
              if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
                  console.error('Bucket mission-evidence não existe. Crie no painel Supabase.');
              } else {
                  console.error('Erro upload evidência:', uploadError.message);
              }
              continue;
          }
          const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(filePath);
          await supabase.from('system_logs').insert({
              entity: 'MissionEvidence',
              entity_id: missionId,
              action_type: 'evidence_upload',
              details: JSON.stringify({
                  fileName: file.name,
                  filePath,
                  publicUrl: urlData?.publicUrl || '',
                  uploadedBy: userData.name || 'Sistema',
                  uploadedAt: new Date().toISOString(),
                  context: 'Criação da OS - Evidência de solicitação do cliente'
              }),
              created_at: new Date().toISOString()
          });
      }
  };

  // Inteligência: Monitorar Cliente IBL e Origem Sorocaba
  useEffect(() => {
      const clientName = (formData.client || '').toUpperCase();
      const originName = (formData.origin || '').toUpperCase();

      if (clientName.includes('IBL') && originName.includes('SOROCABA')) {
          setIblWarning('ALERTA DE PROTOCOLO: OPERAÇÕES IBL EM SOROCABA SÓ PERMITEM OS FORNECEDORES: CTS OU MACOR.');
      } else {
          setIblWarning('');
      }
  }, [formData.client, formData.origin]);

  const loadBasicData = async () => {
    // ALTERAÇÃO: Carregar fornecedores que NÃO ESTEJAM BLOQUEADOS (ao invés de apenas 'Ativo')
    // Isso permite que fornecedores com 'Alvará Vencido' apareçam na lista para seleção
    const [clientsRes, providersRes] = await Promise.all([
         supabase.from('clients').select('id, name, trading_name').eq('status', 'Ativo').order('trading_name', { ascending: true }),
         supabase.from('providers').select('id, name, trading_name, type, dhl_channel_preference').neq('status', 'Bloqueado').order('name', { ascending: true }).then(async (res) => {
           if (res.error && /dhl_channel_preference/i.test(res.error.message)) {
             return await supabase.from('providers').select('id, name, trading_name, type').neq('status', 'Bloqueado').order('name', { ascending: true });
           }
           return res;
         })
    ]);
    if (clientsRes.data) setDbClients(clientsRes.data as any);
    if (providersRes.data) setDbProviders(providersRes.data as any);
  };

  const fetchPastDrivers = async () => {
      try {
          const { data } = await supabase.from('missions').select('driver_name, driver_phone').not('driver_name', 'is', null).order('created_at', { ascending: false }).limit(200);
          if (data) {
              const unique = Array.from(new Set(data.map(d => (d.driver_name as string)?.toUpperCase().trim())))
                .map(name => {
                    const found = data.find(d => (d.driver_name as string)?.toUpperCase().trim() === name);
                    return { name: (name as string) || '', phone: (found?.driver_phone as string) || '' };
                }).filter(d => d.name !== '');
              setDbPastDrivers(unique);
          }
      } catch (e) { console.error(e); }
  };

  const fetchClientVehicles = async (clientName: string) => {
      try {
          const { data: clientObj } = await supabase.from('clients').select('id').eq('name', clientName).maybeSingle();
          if (clientObj) {
              const { data: vehicles } = await supabase.from('client_vehicles').select('*').eq('client_id', clientObj.id).order('plate');
              if (vehicles) setDbClientVehicles(vehicles as any);
          }
      } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (formData.client) {
        const cFilter = clientFuzzyFilter(formData.client);
        const firstWord = (formData.client || '').trim().split(/\s+/)[0];

        supabase.from('client_routes').select('*').or(cFilter).order('name').then(async ({ data, error }) => {
          if (error) console.error('[MissionForm] Erro client_routes:', error.message);
          if (data && data.length > 0) { setClientRoutes(data as any); return; }
          if (firstWord) {
            const { data: fb } = await supabase.from('client_routes').select('*').ilike('client', `%${firstWord}%`).order('name');
            if (fb && fb.length > 0) setClientRoutes(fb as any);
            else setClientRoutes(data || []);
          }
        });

        supabase.from('client_price_tables').select('*').or(cFilter).order('operation_type').then(async ({ data, error }) => {
          if (error) console.error('[MissionForm] Erro client_price_tables:', error.message);
          if (data && data.length > 0) { setClientPriceTables(data as any); return; }
          if (firstWord) {
            const { data: fb } = await supabase.from('client_price_tables').select('*').ilike('client', `%${firstWord}%`).order('operation_type');
            if (fb && fb.length > 0) { console.log(`[MissionForm] price_tables fallback: ${fb.length} tabelas via ilike %${firstWord}%`); setClientPriceTables(fb as any); }
            else setClientPriceTables(data || []);
          }
        });

        fetchClientVehicles(formData.client);
    } else { setClientRoutes([]); setClientPriceTables([]); setDbClientVehicles([]); }
  }, [formData.client]);

  useEffect(() => {
      if (formData.provider) {
          supabase.from('provider_cost_tables').select('*').eq('provider', formData.provider).order('operation_type').then(({ data }) => { if (data) setProviderCostTables(data as any); });
      } else { setProviderCostTables([]); }
  }, [formData.provider]);

  const generateId = async () => {
      const { data } = await supabase.from('missions').select('id').order('created_at', { ascending: false }).limit(300);
      let maxNum = 0;
      if (data) {
          data.forEach(m => {
              const parts = m.id.split('-');
              if (parts.length > 1) {
                  const num = parseInt(parts[1]);
                  if (!isNaN(num) && num > maxNum) maxNum = num;
              }
          });
      }
      const nextNum = maxNum + 1;
      const generated = `GTM-${nextNum.toString().padStart(4, '0')}`;
      setOsId(generated);
      return generated;
  };

  const findBestTable = (tables: any[], dist: number, locationKeywords: string[], clientRuleKeyword?: string, providerName?: string, originAddress?: string, missionType?: string, estimatedHours?: number) => {
      if (!tables || tables.length === 0) return null;
      const normalizedTables = tables.map(t => ({ ...t, normOp: normalizeStr(t.operation_type || '') }));
      const opType = normalizeStr(missionType || '');
      const isVelada = opType.includes('VELADA');
      const isCaracterizada = opType.includes('CARACTERIZADA');

      if (clientRuleKeyword) {
          let ruleMatches = normalizedTables.filter(t => t.normOp.includes(normalizeStr(clientRuleKeyword)));
          if (ruleMatches.length > 1 && (isVelada || isCaracterizada)) {
              const typed = ruleMatches.filter(t => isVelada ? t.normOp.includes('VELADA') : t.normOp.includes('CARACTERIZADA'));
              if (typed.length > 0) ruleMatches = typed;
          }
          if (ruleMatches.length > 0) return { table: ruleMatches[0], reason: `REGRA PRIORITÁRIA: ${clientRuleKeyword}` };
      }

      const providerUpper = normalizeStr(providerName || '');
      const isSpecialProvider = providerUpper.includes('ATIVA') || providerUpper.includes('TM SEG') || providerUpper.includes('TMSEG');

      const originUF = extractUF(originAddress || '') || locationKeywords[1] || '';
      const originRegion = UF_TO_REGION[originUF] || locationKeywords[2] || '';
      const originCity = locationKeywords[0] || '';

      const scored = normalizedTables.map(t => {
          let score = 0;
          let reasons: string[] = [];

          const isArmadoTable = t.normOp.includes('ARMADO') || t.normOp.includes('ARMADOS') || t.normOp.includes('PRONTA RESPOSTA');
          const isFranchiseTable = t.normOp.includes('ATE ') || t.normOp.includes('ATE') || t.normOp.includes('FAIXA');
          const franchiseKm = parseFloat(t.franchise_km) || 0;
          const franchiseHours = parseFloat(t.franchise_hours) || 0;

          if (isVelada) {
              if (isFranchiseTable && !isArmadoTable) { score -= 5000; reasons.push('VELADA NÃO USA FAIXA KM'); }
              if (t.normOp.includes('CARACTERIZADA')) { score -= 5000; reasons.push('TIPO INCOMPATÍVEL'); }
              if (isArmadoTable) {
                  score += 3000;
                  const is02 = t.normOp.includes('02 ARMADO') || t.normOp.includes('02 ARMADOS') || t.normOp.includes('DOIS ARMADO');
                  const is01 = !is02 && (t.normOp.includes('01 ARMADO') || t.normOp.includes('01 AGENTE') || t.normOp.includes('PRONTA RESPOSTA'));
                  if (is02) reasons.push('02 ARMADOS');
                  else if (is01) reasons.push('01 ARMADO');
                  else reasons.push('ARMADO');
              }
              if (t.normOp.includes('VELADA')) { score += 2500; reasons.push('TIPO: VELADA'); }
          }

          if (isCaracterizada) {
              if (isArmadoTable && !isFranchiseTable) { score -= 3000; reasons.push('CARACTERIZADA USA FAIXA KM'); }
              if (t.normOp.includes('VELADA') && !t.normOp.includes('CARACTERIZADA')) { score -= 5000; reasons.push('TIPO INCOMPATÍVEL'); }
              if (t.normOp.includes('CARACTERIZADA')) { score += 2500; reasons.push('TIPO: CARACTERIZADA'); }

              if (isFranchiseTable && franchiseKm > 0 && dist > 0) {
                  if (dist <= franchiseKm) {
                      score += 600;
                      const excess = franchiseKm - dist;
                      score -= Math.min(excess * 0.5, 200);
                      reasons.push(`FRANQUIA ${franchiseKm}KM COBRE ${Math.round(dist)}KM`);
                  } else {
                      score -= 300;
                      reasons.push(`FRANQUIA ${franchiseKm}KM < ${Math.round(dist)}KM (EXCEDE)`);
                  }
              } else if (!isFranchiseTable) {
                  if (franchiseKm > 0 && franchiseKm >= dist) { score += 50; }
                  else if (franchiseKm > 0) { score -= 10; }
              }
          }

          if (!isVelada && !isCaracterizada) {
              if (franchiseKm > 0 && franchiseKm >= dist) { score += 50; }
              else if (franchiseKm > 0) { score -= 10; }
          }

          if (isSpecialProvider) {
              const isNivelBrasil = t.normOp.includes('NIVEL BRASIL') || isArmadoTable;
              if (!isNivelBrasil && !isVelada) { score -= 1000; }
          }

          if (originCity.length > 3 && t.normOp.includes(originCity)) {
              score += 3000;
              reasons.push(`CIDADE: ${originCity}`);
          }

          if (t.normOp.includes('EXCETO')) {
              if (originUF === 'MG' && t.normOp.includes('EXCETO MG')) { score -= 5000; reasons.push('BLOQUEADO (EXCETO MG)'); }
              if (originUF === 'ES' && t.normOp.includes('EXCETO') && t.normOp.includes('ES')) { score -= 5000; reasons.push('BLOQUEADO (EXCETO ES)'); }
          }

          if (originUF && (originUF === 'MG' || originUF === 'ES')) {
              if (t.normOp.includes('MG') && t.normOp.includes('ES') && !t.normOp.includes('EXCETO')) {
                  score += 2000;
                  reasons.push(`UF ESPECÍFICO: ${originUF}`);
              }
          }

          if (originUF && t.normOp.includes(originUF) && !t.normOp.includes('EXCETO')) {
              score += 1500;
              reasons.push(`UF: ${originUF}`);
          }

          if (originRegion && t.normOp.includes(originRegion)) {
              score += 800;
              reasons.push(`REGIÃO: ${originRegion}`);
          }

          if (estimatedHours && estimatedHours > 0 && franchiseHours > 0) {
              if (estimatedHours <= franchiseHours) {
                  score += 100;
                  reasons.push(`HORAS OK (${estimatedHours}h ≤ ${franchiseHours}h)`);
              } else {
                  score -= 50;
                  reasons.push(`HORAS EXCEDE (${estimatedHours}h > ${franchiseHours}h)`);
              }
          }

          const reason = reasons.length > 0 ? reasons[0] : 'GENÉRICO';
          return { ...t, score, reason, allReasons: reasons };
      });

      const valid = scored.filter(t => t.score > -1000).sort((a, b) => b.score - a.score);
      if (valid.length === 0) {
          const fallback = normalizedTables.sort((a, b) => a.franchise_km - b.franchise_km);
          const best = fallback.find(t => t.franchise_km >= dist) || fallback[fallback.length - 1];
          return { table: best, reason: "FAIXA KM (FALLBACK)" };
      }

      const topScore = valid[0].score;
      const bestGroup = valid.filter(t => t.score >= topScore - 20);

      const franchiseGroup = bestGroup.filter(t => t.normOp.includes('ATE ') || t.normOp.includes('ATE') || t.normOp.includes('FAIXA'));
      const pickFrom = franchiseGroup.length > 0 ? franchiseGroup : bestGroup;

      const sortedByKm = pickFrom.sort((a, b) => a.franchise_km - b.franchise_km);
      const exactCover = sortedByKm.find(t => (t.franchise_km || 0) >= dist);
      const bestTable = exactCover || sortedByKm[sortedByKm.length - 1];
      return { table: bestTable, reason: bestTable.reason || "MELHOR MATCH", allReasons: bestTable.allReasons || [] };
  };

  const calculatePricing = useCallback(async (route: ClientRoute, providerOverride?: string, revTableId?: string, cstTableId?: string, flags?: { ceva200km: boolean, vtc02h: boolean, isSameOs: boolean, raioKm?: number }) => {
      if (!formData.client || !route) return;
      setIsCalculating(true);
      let details: string[] = [];
      let revenue = 0;
      let cost = 0;

      const realDist = parseFloat(route.distance) || 0;
      const originUpper = normalizeStr(route.origin);
      const originCity = originUpper.split(',')[0].trim();
      const geoInfo = CITY_MAP[originCity] || { uf: '', region: '' };
      const locationKeywords = [originCity, geoInfo.uf, geoInfo.region];
      const activeProvider = providerOverride !== undefined ? providerOverride : formData.provider;
      const currentFlags = flags || { ceva200km: formData.applyCeva200km, vtc02h: formData.applyVtc02h, isSameOs: formData.isSameOs, raioKm: formData.raioKm };
      const radius = currentFlags.raioKm && currentFlags.raioKm > 0 ? currentFlags.raioKm : (currentFlags.ceva200km ? 200 : 0);

      const isLogitech = (formData.client || '').toUpperCase().includes('CEVA') && (route.name.toUpperCase().includes('LOGITECH') || route.destination.toUpperCase().includes('LOGITECH'));

      let effectiveDist = realDist;
      let forceKeyword: string | undefined = undefined;
      const isSpecialRuleActive = currentFlags.vtc02h || currentFlags.ceva200km || isLogitech;

      if (currentFlags.vtc02h) { effectiveDist = 100; forceKeyword = '100KM'; } 
      else if (radius > 0 || isLogitech) { effectiveDist = isLogitech ? 200 : radius; forceKeyword = isLogitech ? 'LOGITECH' : `${radius}KM`; }

      try {
          const googleDurationMin = (route as any)._googleDurationMin;
          const estHours = isSpecialRuleActive ? (currentFlags.vtc02h ? 2 : isLogitech ? 3 : 4) : (googleDurationMin ? Math.max(1, Math.ceil(googleDurationMin / 60)) : Math.max(2, Math.ceil(realDist / 45)));

          let revTable: any = null;
          if (revTableId) {
              revTable = clientPriceTables.find(t => t.id.toString() === revTableId);
              if (revTable) details.push(`FAT (MANUAL): ${revTable.operation_type}`);
          } else {
              const result = findBestTable(clientPriceTables, effectiveDist, locationKeywords, forceKeyword, undefined, route.origin, formData.missionType, estHours);
              if (result) { revTable = result.table; details.push(`FAT (${result.reason}): ${revTable.operation_type}`); }
          }
          if (revTable) {
              revenue = revTable.activation_fee;
              const revTableName = (revTable.operation_type || '').toUpperCase();
              const isFixedPriceRevTable = revTableName.includes('LOGITECH') || revTableName.includes('200KM') || revTableName.includes('200 KM') || revTableName.includes('100KM') || revTableName.includes('100 KM') || revTableName.includes('300KM') || revTableName.includes('300 KM');
              if (!isSpecialRuleActive && !isFixedPriceRevTable && realDist > revTable.franchise_km) revenue += (realDist - revTable.franchise_km) * (revTable.price_per_extra_km || 0);
              const revFranchiseHours = parseFloat(revTable.franchise_hours) || 0;
              if (revFranchiseHours > 0 && estHours > revFranchiseHours) {
                  revenue += (estHours - revFranchiseHours) * (revTable.price_per_extra_hour || 0);
                  details.push(`+${estHours - revFranchiseHours}h extra faturamento`);
              }
          }

          let cstTable: any = null;
          if (currentFlags.isSameOs) { cost = 0; details.push(`CUSTO: ZERADO (MESMA OS)`); } 
          else {
              if (cstTableId) {
                  cstTable = providerCostTables.find(t => t.id.toString() === cstTableId);
                  if (cstTable) details.push(`CUSTO (MANUAL): ${cstTable.operation_type}`);
              } else if (activeProvider) {
                  let currentCostTables = providerCostTables;
                  if (providerOverride && providerOverride !== formData.provider) {
                      const { data } = await supabase.from('provider_cost_tables').select('*').eq('provider', providerOverride);
                      if (data) currentCostTables = data as any;
                  }
                  const result = findBestTable(currentCostTables, effectiveDist, locationKeywords, forceKeyword, activeProvider, route.origin, formData.missionType, estHours);
                  if (result) { cstTable = result.table; details.push(`CUSTO (${result.reason}): ${cstTable.operation_type}`); }
              }
              if (cstTable) {
                  cost = cstTable.activation_cost;
                  const cstTableName = (cstTable.operation_type || '').toUpperCase();
                  const isFixedPriceCstTable = cstTableName.includes('LOGITECH') || cstTableName.includes('200KM') || cstTableName.includes('200 KM') || cstTableName.includes('100KM') || cstTableName.includes('100 KM') || cstTableName.includes('300KM') || cstTableName.includes('300 KM');
                  if (!isSpecialRuleActive && !isFixedPriceCstTable && realDist > cstTable.franchise_km) cost += (realDist - cstTable.franchise_km) * (cstTable.cost_per_extra_km || 0);
                  const cstFranchiseHours = parseFloat(cstTable.franchise_hours) || 0;
                  if (cstFranchiseHours > 0 && estHours > cstFranchiseHours) {
                      cost += (estHours - cstFranchiseHours) * (cstTable.cost_per_extra_hour || 0);
                      details.push(`+${estHours - cstFranchiseHours}h extra custo`);
                  }
              }
          }

          let finalDestination = route.destination;
          if (currentFlags.vtc02h) finalDestination = '02 HORAS DE ACOMPANHAMENTO';
          else if (radius > 0) {
              const isDhl = (formData.client || '').toUpperCase().includes('DHL');
              finalDestination = isDhl ? `RAIO ${radius} KM — DESTINO A DEFINIR` : `${radius}KM DE ACOMPANHAMENTO`;
          }

          setFormData(prev => ({
              ...prev, provider: activeProvider,
              revenueValue: manualOverrides.revenue ? prev.revenueValue : revenue.toFixed(2),
              costValue: manualOverrides.cost ? prev.costValue : cost.toFixed(2),
              totalDistance: realDist.toString(), origin: route.origin, destination: finalDestination,
              estimatedTime: isSpecialRuleActive ? (currentFlags.vtc02h ? '2 horas' : isLogitech ? '3 horas' : '4 horas') : (googleDurationMin ? (googleDurationMin < 60 ? `${googleDurationMin} min` : `${Math.floor(googleDurationMin / 60)}h${googleDurationMin % 60 > 0 ? `${googleDurationMin % 60}min` : ''}`) : `${Math.max(2, Math.ceil(realDist / 45))} horas`)
          }));
          setCalcDetails(details.join(' | '));
          if (revTable) setManualRevenueTableId(revTable.id.toString());
          if (cstTable) setManualCostTableId(cstTable.id.toString());
      } finally { setIsCalculating(false); }
  }, [formData.client, formData.provider, formData.applyCeva200km, formData.raioKm, formData.applyVtc02h, formData.isSameOs, clientPriceTables, providerCostTables, manualOverrides.revenue, manualOverrides.cost]);

  const calculateTollGemini = async (origin: string, destination: string): Promise<{ value: number; count: number; tolls: any[]; observacoes?: string; confianca?: string; provider?: string } | null> => {
      try {
          const resp = await authFetch('/api/toll/gemini-estimate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ origin, destination }),
          });
          if (!resp.ok) return null;
          const data = await resp.json();
          if (data.success && typeof data.tollValue === 'number') {
              return { value: data.tollValue, count: data.tollCount || 0, tolls: data.tolls || [], observacoes: data.observacoes, confianca: data.confianca, provider: 'gemini-ai' };
          }
          return null;
      } catch (e) {
          console.error('Erro Gemini pedágio:', e);
          return null;
      }
  };

  const calculateTollFromAPI = async (origin: string, destination: string): Promise<{ value: number; count: number; tolls: any[]; apiError?: string; distance?: number; duration?: string; provider?: string; observacoes?: string; confianca?: string } | null> => {
      try {
          setIsCalculatingToll(true);
          const resp = await authFetch('/api/toll/calculate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ origin, destination }),
          });
          if (!resp.ok) return null;
          const data = await resp.json();
          if (data.success && data.tollValue > 0) {
              return { value: data.tollValue, count: data.tollCount, tolls: data.tolls || [], distance: data.distance, duration: data.duration, provider: data.provider };
          }

          const geminiResult = await calculateTollGemini(origin, destination);
          if (geminiResult) return geminiResult;

          if (data.apiError) {
              return { value: 0, count: 0, tolls: [], apiError: data.apiError };
          }
          return null;
      } catch (e) {
          console.error('Erro ao consultar API de pedágio:', e);
          const geminiResult = await calculateTollGemini(origin, destination);
          if (geminiResult) return geminiResult;
          return null;
      } finally {
          setIsCalculatingToll(false);
      }
  };

  const getGoogleMapsDistance = async (origin: string, destination: string): Promise<{ distKm: number; durationMin: number } | null> => {
      if (!isGoogleLoaded || !window.google) return null;
      try {
          const service = new google.maps.DistanceMatrixService();
          const result = await service.getDistanceMatrix({
              origins: [origin],
              destinations: [destination],
              travelMode: google.maps.TravelMode.DRIVING,
              unitSystem: google.maps.UnitSystem.METRIC,
          });
          const el = result.rows?.[0]?.elements?.[0];
          if (el?.status === 'OK') {
              return { distKm: Math.round(el.distance.value / 1000), durationMin: Math.round(el.duration.value / 60) };
          }
      } catch (e) { console.error('Google Maps distance error:', e); }
      return null;
  };

  const handleRouteSelect = async (route: ClientRoute) => {
      setSelectedRouteId(route.id.toString());
      setRouteSearchTerm(route.name);
      setActiveDropdown(null);
      setTollDetails(null);
      setOperatorConfirmedCalc(false);

      const routeDist = parseFloat(route.distance) || 0;
      const gResult = await getGoogleMapsDistance(route.origin, route.destination);
      if (gResult) {
          if (routeDist <= 0 && gResult.distKm > 0) {
              (route as any).distance = gResult.distKm.toString();
          }
          if (gResult.durationMin > 0) {
              (route as any)._googleDurationMin = gResult.durationMin;
          }
      }
      
      let suggestedToll = 0;
      let tollSource = '';

      const clientUpper = (formData.client || '').toUpperCase();
      const originUpper = (route.origin || '').toUpperCase();
      const destUpper = (route.destination || '').toUpperCase();
      const isCevaJundiai200km = clientUpper.includes('CEVA') && originUpper.includes('JUNDIA') && destUpper.includes('200KM');
      if (isCevaJundiai200km) {
          suggestedToll = 35;
          tollSource = 'fixed';
          showNotification('Regra CEVA', 'Pedágio fixo de R$ 35,00 aplicado (CEVA + Jundiaí + 200KM).', 'success');
      } else if (route.toll_cost && route.toll_cost > 0) {
          suggestedToll = route.toll_cost;
          tollSource = 'fixed';
          showNotification('IA Logística', `Pedágio de R$ ${suggestedToll.toFixed(2)} aplicado via cadastro de rota fixa.`, 'success');
      } else {
          try {
              const { data: lastMission } = await supabase
                  .from('missions')
                  .select('toll_value')
                  .eq('client', formData.client)
                  .eq('origin', route.origin)
                  .eq('destination', route.destination)
                  .eq('status', MissionStatus.COMPLETED)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
              
              if (lastMission && lastMission.toll_value && lastMission.toll_value > 0) {
                  suggestedToll = lastMission.toll_value;
                  tollSource = 'history';
                  showNotification('Aprendizado de Máquina', `Sugestão de R$ ${suggestedToll.toFixed(2)} identificada no histórico desta rota.`, 'info');
              }
          } catch (e) { console.error(e); }
      }

      if (!manualOverrides.toll) {
          setFormData(prev => ({ ...prev, tollValue: suggestedToll.toString() }));
      }
      calculatePricing(route);

      if (tollSource !== 'fixed' && !manualOverrides.toll) {
          const apiResult = await calculateTollFromAPI(route.origin, route.destination);
          if (apiResult) {
              if (apiResult.apiError && !apiResult.provider) {
                  showNotification('API Pedágio', apiResult.apiError, 'error');
              } else if (typeof apiResult.value === 'number') {
                  setTollDetails({ count: apiResult.count, tolls: apiResult.tolls, observacoes: apiResult.observacoes, confianca: apiResult.confianca, provider: apiResult.provider });
                  if (apiResult.value === 0) {
                      setFormData(prev => ({ ...prev, tollValue: '0' }));
                      const providerLabel = apiResult.provider === 'gemini-ai' ? 'Gemini IA' : 'API Pedágio';
                      showNotification(providerLabel, 'Rota sem pedágio identificado. Se houver, informe manualmente.', 'info');
                  } else if (tollSource !== 'history' || Math.abs(apiResult.value - suggestedToll) > 1) {
                      setFormData(prev => ({ ...prev, tollValue: apiResult.value.toFixed(2) }));
                      const providerLabel = apiResult.provider === 'gemini-ai' ? 'Gemini IA' : apiResult.provider === 'rotasbrasil' ? 'Rotas Brasil' : 'API Pedágio';
                      const confiancaLabel = apiResult.confianca ? ` (Confiança: ${apiResult.confianca})` : '';
                      showNotification(providerLabel, `R$ ${apiResult.value.toFixed(2)} estimado (${apiResult.count} praça${apiResult.count > 1 ? 's' : ''} - Veículo leve 2 eixos)${confiancaLabel}.`, 'success');
                  }
              }
          }
      } else if (manualOverrides.toll) {
          showNotification('Pedágio Manual', 'Valor de pedágio mantido (editado manualmente). Cálculo automático desativado.', 'info');
      }
  };

  const handleVehicleSelect = (v: ClientVehicleDB) => {
      setFormData(prev => ({ 
          ...prev, 
          clientVehicleId: v.id.toString(), 
          clientVehiclePlate: v.plate, 
          clientVehicleModel: v.model 
      }));
      setVehicleSearchTerm(v.plate);
      setActiveDropdown(null);
  };

  const handleVehicleSelect2 = (v: ClientVehicleDB) => {
      setFormData(prev => ({ 
          ...prev, 
          clientVehicleId2: v.id.toString(), 
          clientVehiclePlate2: v.plate, 
          clientVehicleModel2: v.model 
      }));
      setVehicleSearchTerm2(v.plate);
      setActiveDropdown(null);
  };

  const handleDriverSelect = (d: {name: string, phone: string}) => {
      setFormData(prev => ({ ...prev, driver_name: d.name, driver_phone: d.phone }));
      setDriverSearchTerm(d.name);
      setActiveDropdown(null);
  };

  const handleManualTableChange = (type: 'rev' | 'cst', val: string) => {
      if (type === 'rev') setManualOverrides(prev => ({ ...prev, revenue: false }));
      else setManualOverrides(prev => ({ ...prev, cost: false }));
      const route = clientRoutes.find(r => r.id.toString() === selectedRouteId);
      if (!route) return;
      if (type === 'rev') { setManualRevenueTableId(val); calculatePricing(route, undefined, val, manualCostTableId); } 
      else { setManualCostTableId(val); calculatePricing(route, undefined, manualRevenueTableId, val); }
  };

  const handleProviderSelection = (newProviderName: string) => {
      setProviderSearchTerm(newProviderName);
      
      const route = clientRoutes.find(r => r.id.toString() === selectedRouteId);
      if(route) { 
          calculatePricing(route, newProviderName, manualRevenueTableId, ''); 
      }
      setFormData(prev => ({ ...prev, provider: newProviderName })); 
      setActiveDropdown(null);
  };

  // Função auxiliar para validar KM (Apenas Ponto)
  const handleKmInput = (value: string) => {
      let val = value.replace(/,/g, '.'); // Força ponto
      if (!/^[0-9]*\.?[0-9]*$/.test(val)) return; // Bloqueia caracteres não numéricos
      setFormData(prev => ({ ...prev, startKm: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client || (!formData.origin && !formData.destination)) return alert("Selecione o cliente e informe a origem e destino da rota.");
    const clientUpper = (formData.client || '').toUpperCase();
    if ((clientUpper.includes('CESLOG') || clientUpper.includes('CESARI')) && !formData.reference_number.trim()) return alert("Para clientes CESLOG/CESARI, o Nº da Referência é obrigatório.");
    if (clientUpper.includes('DHL') && !formData.dhl_se_number.trim()) return alert("Para o cliente DHL, o Número da S.E. é obrigatório.");

    const scheduledDateTime = new Date(`${formData.scheduledDate}T${formData.scheduledTime}:00`);
    const now = new Date();
    const toleranceMs = 5 * 60 * 1000;
    if (scheduledDateTime.getTime() < now.getTime() - toleranceMs) {
        return alert("Não é possível agendar uma missão no passado. Ajuste a data e horário para um momento futuro.");
    }

    setIsSaving(true);
    try {
        let attempts = 0, saved = false, finalId = '';
        const nowIso = new Date().toISOString();
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        
        while (attempts < 10 && !saved) {
            finalId = await generateId();
            const scheduledIso = scheduledDateTime.toISOString();
            
            const vehicleId = formData.clientVehicleId;
            
            const valorZeroMotivo = formData.isSameOs ? 'MESMA OS' : ((!parseFloat(formData.costValue)) ? 'AGUARDANDO DEFINIÇÃO' : '');
            const missionPayload: any = {
                id: finalId, client: formData.client, provider: formData.provider || null,
                origin: formData.origin, destination: formData.destination, status: MissionStatus.SOLICITED,
                last_update: nowIso, created_at: nowIso, updated_by: userData.name,
                total_distance: parseFloat(formData.totalDistance), start_time: scheduledIso,
                mission_type: formData.missionType || 'Caracterizada', 
                revenue_value: parseFloat(formData.revenueValue) || 0, cost_value: formData.isSameOs ? 0 : (parseFloat(formData.costValue) || 0),
                toll_value: parseFloat(formData.tollValue) || 0,
                valor_zero_motivo: valorZeroMotivo,
                ...(formData.isSameOs ? { is_same_os: true, parent_mission_id: formData.parentMissionId || null } : {}), current_location: 'Solicitação Criada',
                client_vehicle: vehicleId ? parseInt(vehicleId) : null,
                client_vehicle_2: formData.clientVehicleId2 ? parseInt(formData.clientVehicleId2) : null,
                driver_name: (formData.driver_name || '').toUpperCase(),
                driver_phone: formData.driver_phone,
                driver_name_2: formData.driver_name_2 ? (formData.driver_name_2 || '').toUpperCase() : null,
                driver_phone_2: formData.driver_phone_2 || null,
                start_km: parseFloat(formData.startKm) || null,
                snapshot_data: '', snapshot_approved_by: null, snapshot_approved_at: null,
                reference_number: formData.reference_number || null,
                dhl_se_number: formData.dhl_se_number ? formData.dhl_se_number.trim().toUpperCase() : null
            };
            let { error } = await supabase.from('missions').insert([missionPayload]);
            if (error && error.message?.includes('valor_zero_motivo')) {
                delete missionPayload.valor_zero_motivo;
                const retry = await supabase.from('missions').insert([missionPayload]);
                error = retry.error;
            }
            if (!error) saved = true; else if (error.code === '23505') attempts++; else throw error;
        }
        await uploadEvidences(finalId);

        // ── DHL: gerar link público para o fornecedor e abrir modal ──
        if (clientUpper.includes('DHL')) {
          try {
            const token = localStorage.getItem('authToken') || '';
            const r = await fetch('/api/dhl/intake/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
              credentials: 'include',
              body: JSON.stringify({ missionId: finalId }),
            });
            const j = await r.json();
            if (r.ok && j.url) {
              setDhlLinkModal({ open: true, missionId: finalId, url: j.url, whatsappText: j.whatsappText || '', phone: j.providerPhone || '', channel: 'both', emailSent: !!j.emailSent, providerEmail: j.providerEmail || '', whatsappSent: !!j.whatsappSent, whatsappError: j.whatsappError || null });
            } else {
              const errMsg = j.error || 'erro desconhecido';
              if (j.code === 'PROVIDER_EMAIL_REQUIRED') {
                setDhlEmailModal({
                  open: true,
                  providerId: j.providerId,
                  providerName: j.providerName || formData.provider || 'fornecedor',
                  email: '',
                  saving: false,
                  retryChannel: 'both',
                  retrySaveAsDefault: false,
                  retryAfterSave: 'submit',
                  retryMissionId: finalId,
                });
              } else if (/banco ainda não tem as tabelas/i.test(errMsg)) {
                openDhlSchemaModal('OS salva, mas o banco do Supabase ainda não tem as tabelas do fluxo DHL. Copie o SQL abaixo e cole no Supabase Studio → SQL Editor → Run. Depois tente novamente.');
              } else {
                alert('OS salva, mas falhou ao gerar o link DHL: ' + errMsg);
              }
            }
          } catch (err: any) {
            alert('OS salva, mas falhou ao gerar o link DHL: ' + (err?.message || 'erro de rede'));
          }
        }

        const vehiclePlate = formData.clientVehicleId 
            ? (dbClientVehicles.find(v => v.id.toString() === formData.clientVehicleId)?.plate || '—') 
            : '—';
        const scheduledIso = scheduledDateTime.toISOString();

        const pendingClientPayload = {
            missionId: finalId,
            client: formData.client,
            origin: formData.origin,
            destination: formData.destination,
            start_time: scheduledIso,
            mission_type: formData.missionType,
            vehiclePlate,
            senderName: userData.name || undefined
        };

        const pendingProviderPayload = formData.provider ? {
            missionId: finalId,
            provider: formData.provider,
            vehiclePlate,
            origin: formData.origin,
            destination: formData.destination,
            start_time: scheduledIso,
            mission_type: formData.missionType,
            driver_name: formData.driver_name,
            driver_phone: formData.driver_phone,
            senderName: userData.name || undefined
        } : undefined;

        setEmailConfirmDialog({
            clientPayload: pendingClientPayload,
            providerPayload: pendingProviderPayload,
            onSaveCallback: () => onSaveAndContinue(finalId)
        });
    } catch (e: any) { alert("Erro ao salvar: " + e.message); } finally { setIsSaving(false); }
  };

  const routesFilteredByOrigin = (() => {
      if (!formData.origin) return clientRoutes;
      const parts = formData.origin.split(',').map(p => p.trim());
      const candidates: string[] = [];
      for (const part of parts) {
          const clean = normalizeStr(part).replace(/\d+/g, '').replace(/-/g, ' ').trim();
          if (clean.length >= 3 && !clean.match(/^(SP|RJ|MG|PR|SC|RS|BA|CE|PE|GO|MT|MS|ES|DF|PA|AM|MA|PI|RN|PB|AL|SE|TO|RO|RR|AP|AC|BRASIL|BRAZIL)$/))
              candidates.push(clean);
      }
      if (candidates.length === 0) return clientRoutes;
      const matched = clientRoutes.filter(r => {
          const rOrigin = normalizeStr(r.origin);
          return candidates.some(c => rOrigin.includes(c));
      });
      return matched.length > 0 ? matched : clientRoutes;
  })();

  const filteredRoutes = routesFilteredByOrigin.filter(r => 
      normalizeStr(r.name).includes(normalizeStr(routeSearchTerm)) || 
      normalizeStr(r.origin).includes(normalizeStr(routeSearchTerm)) || 
      normalizeStr(r.destination).includes(normalizeStr(routeSearchTerm))
  );

  const filteredVehicles = dbClientVehicles.filter(v => 
      (v.plate || '').includes(vehicleSearchTerm.toUpperCase())
  );

  const filteredVehicles2 = dbClientVehicles.filter(v => 
      (v.plate || '').includes(vehicleSearchTerm2.toUpperCase()) &&
      v.id.toString() !== formData.clientVehicleId
  );

  const filteredDrivers = dbPastDrivers.filter(d => 
      (d.name || '').includes(driverSearchTerm.toUpperCase())
  );

  const providersByType = dbProviders.filter(p => {
      if (!formData.missionType) return true;
      const pType = ((p as any).type || 'Escolta Caracterizada').toUpperCase();
      if (formData.missionType === 'Velada') return pType.includes('VELADA') || pType.includes('PRONTA RESPOSTA');
      if (formData.missionType === 'Caracterizada') return pType.includes('CARACTERIZADA');
      return true;
  });
  const filteredProviders = providersByType.filter(p => 
     formatProviderName(p.name, p.trading_name).includes(providerSearchTerm.toUpperCase())
  );

  const stepSummaries: Record<number, string> = {
      1: formData.missionType === 'Velada' ? 'Escolta Velada' : formData.missionType === 'Caracterizada' ? 'Escolta Caracterizada' : '',
      2: formData.client ? (dbClients.find(c => c.name === formData.client)?.trading_name || formData.client) : '',
      3: [vehicleSearchTerm, formData.driver_name ? `Mot: ${formData.driver_name}` : (driverQuestion === 'no' ? 'Sem motorista' : '')].filter(Boolean).join(' | ') || '',
      4: formData.provider ? formData.provider : (providerPending ? 'Aguardando informação' : ''),
      5: formData.origin && formData.destination ? `${formData.origin.split(',')[0]} → ${formData.destination.split(',')[0]}${formData.totalDistance ? ` (${formData.totalDistance} KM)` : ''}${manualRevenueTableId ? ' | Tabela ✓' : ''}` : '',
      6: scheduleMode === 'immediate' ? 'Imediata' : scheduleMode === 'scheduled' ? `Agendada: ${formData.scheduledDate} ${formData.scheduledTime}` : '',
  };

  const STEP_HEADER = (num: number, title: string, icon: any, done: boolean, active: boolean) => {
      const isExpanded = expandedStep === num;
      const isCollapsed = done && !isExpanded;
      const summary = stepSummaries[num] || '';

      return (
          <button type="button" onClick={() => setExpandedStep(isExpanded ? 0 : num)} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-300 cursor-pointer group ${isCollapsed ? 'bg-green-50/70 border-green-200 hover:border-green-400' : active && isExpanded ? 'bg-white border-red-400 shadow-md' : done && isExpanded ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 transition-all ${done ? 'bg-green-600 text-white' : active ? 'bg-red-700 text-white' : 'bg-gray-300 text-white'}`}>
                  {done ? <Check size={14} /> : num}
              </div>
              <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                      {icon}
                      <span className={`text-[10px] font-black uppercase tracking-widest ${isCollapsed ? 'text-green-600' : active ? 'text-red-800' : done ? 'text-green-700' : 'text-gray-400'}`}>{title}</span>
                  </div>
                  {isCollapsed && summary && (
                      <p className="text-[10px] font-bold text-green-700/70 truncate mt-0.5 pl-6 uppercase">{summary}</p>
                  )}
              </div>
              <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${isCollapsed ? 'text-green-400 group-hover:text-green-600' : 'text-gray-300 rotate-180'} ${!done && !active ? 'hidden' : ''}`} />
          </button>
      );
  };

  const tableGuidance = (() => {
      if (!manualRevenueTableId || !clientPriceTables.length) return null;
      const selectedTable = clientPriceTables.find(t => t.id.toString() === manualRevenueTableId);
      if (!selectedTable) return null;
      const opName = (selectedTable.operation_type || '').toUpperCase();
      const dist = parseFloat(formData.totalDistance) || 0;
      const tips: string[] = [];
      if (formData.missionType === 'Velada' && opName.includes('CARACTERIZ')) tips.push('A operacao e VELADA mas a tabela selecionada parece ser CARACTERIZADA. Confirme se esta correto.');
      if (formData.missionType === 'Caracterizada' && opName.includes('VELAD')) tips.push('A operacao e CARACTERIZADA mas a tabela selecionada parece ser VELADA. Confirme se esta correto.');
      if (dist > 0 && selectedTable.franchise_km > 0 && dist > selectedTable.franchise_km * 1.5) tips.push(`A distancia real (${dist} KM) excede significativamente a franquia da tabela (${selectedTable.franchise_km} KM). Verifique se ha uma tabela com franquia maior.`);
      if (opName.includes('LOGITECH') && !formData.destination.toUpperCase().includes('LOGITECH')) tips.push('Tabela LOGITECH selecionada, mas o destino nao parece ser Logitech. Confirme.');
      return tips.length > 0 ? tips : null;
  })();

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in">
      {isClientModalOpen && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95"><div className="bg-[#f8fafc] rounded-2xl w-full max-w-5xl p-6 relative shadow-2xl overflow-y-auto max-h-[95vh]"><button onClick={() => setIsClientModalOpen(false)} className="absolute top-6 right-6 p-2 bg-white rounded-full shadow-sm hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all z-10"><X size={20}/></button><ClientForm onBack={() => setIsClientModalOpen(false)} onSave={() => { setIsClientModalOpen(false); loadBasicData(); }} onAddVehicle={() => {}} onEditVehicle={() => {}} onAddRoute={() => {}} onEditRoute={() => {}} onAddQuote={() => {}} onEditQuote={() => {}} /></div></div>)}
      {isProviderModalOpen && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95"><div className="bg-[#f8fafc] rounded-2xl w-full max-w-5xl p-6 relative shadow-2xl overflow-y-auto max-h-[95vh]"><button onClick={() => setIsProviderModalOpen(false)} className="absolute top-6 right-6 p-2 bg-white rounded-full shadow-sm hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all z-10"><X size={20}/></button><ProviderForm onBack={() => setIsProviderModalOpen(false)} onNavigateToVehicles={() => {}} /></div></div>)}
      {isRouteModalOpen && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95"><div className="bg-[#f8fafc] rounded-2xl w-full max-w-5xl p-6 relative shadow-2xl overflow-y-auto max-h-[95vh]"><button onClick={() => setIsRouteModalOpen(false)} className="absolute top-6 right-6 p-2 bg-white rounded-full shadow-sm hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all z-10"><X size={20}/></button><ClientRouteForm onSuccess={(newRouteId) => { setIsRouteModalOpen(false); if (formData.client) { supabase.from('client_routes').select('*').or(clientFuzzyFilter(formData.client)).order('name').then(({ data }) => { if (data) { setClientRoutes(data as any); const newRoute = data.find((r: any) => r.id.toString() === newRouteId); if (newRoute) handleRouteSelect(newRoute); } }); } }} /></div></div>)}
      {isVehicleModalOpen && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95"><div className="bg-[#f8fafc] rounded-2xl w-full max-w-5xl p-6 relative shadow-2xl overflow-y-auto max-h-[95vh]"><button onClick={() => setIsVehicleModalOpen(false)} className="absolute top-6 right-6 p-2 bg-white rounded-full shadow-sm hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all z-10"><X size={20}/></button><ClientVehicleForm embedded onBack={() => setIsVehicleModalOpen(false)} onSuccess={() => { setIsVehicleModalOpen(false); if(formData.client) fetchClientVehicles(formData.client); }} /></div></div>)}

      {emailConfirmDialog && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-blue-600 p-4 flex items-center gap-3">
              <Mail size={24} className="text-white" />
              <h3 className="text-white font-black text-sm uppercase tracking-wider">Confirmação de Envio</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-2">
                {emailConfirmDialog.clientPayload && emailConfirmDialog.providerPayload
                  ? 'Deseja realmente enviar os e-mails ao cliente e ao fornecedor?'
                  : emailConfirmDialog.clientPayload
                    ? 'Você deseja realmente enviar o e-mail ao cliente?'
                    : 'Você deseja realmente enviar o e-mail ao fornecedor?'}
              </p>
              <p className="text-xs text-gray-400 mb-5">
                {emailConfirmDialog.clientPayload && <span className="block mb-1">📧 <strong>Cliente:</strong> {emailConfirmDialog.clientPayload.client}</span>}
                {emailConfirmDialog.providerPayload && <span className="block">📧 <strong>Fornecedor:</strong> {emailConfirmDialog.providerPayload.provider}</span>}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isSendingConfirmedEmail}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  data-testid="button-confirm-send-email-form"
                  onClick={async () => {
                    setIsSendingConfirmedEmail(true);
                    try {
                      if (emailConfirmDialog.providerPayload) {
                        try {
                          const provRes = await authFetch('/api/email/mission-solicited', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(emailConfirmDialog.providerPayload)
                          });
                          const provData = await provRes.json();
                          if (provData.queued) showNotification('E-mail na Fila', provData.message, 'warning');
                          else if (provData.success) showNotification('E-mail Enviado', 'Solicitação enviada ao fornecedor!', 'success');
                        } catch (err) { console.error('[Email] Erro fornecedor:', err); }
                      }
                      if (emailConfirmDialog.clientPayload) {
                        try {
                          const clientRes = await authFetch('/api/email/mission-scheduled', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(emailConfirmDialog.clientPayload)
                          });
                          const clientData = await clientRes.json();
                          if (clientData.queued) showNotification('E-mail na Fila', clientData.message, 'warning');
                          else if (clientData.success) showNotification('E-mail Enviado', 'Confirmação enviada ao cliente!', 'success');
                        } catch (err) { console.error('[Email] Erro cliente:', err); }
                      }
                    } finally {
                      setIsSendingConfirmedEmail(false);
                      const cb = emailConfirmDialog.onSaveCallback;
                      setEmailConfirmDialog(null);
                      if (cb) cb();
                    }
                  }}
                >
                  {isSendingConfirmedEmail ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : 'Sim, Enviar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cb = emailConfirmDialog.onSaveCallback;
                    setEmailConfirmDialog(null);
                    if (cb) cb();
                  }}
                  className="px-5 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs uppercase hover:bg-gray-200 transition-all"
                  data-testid="button-cancel-send-email-form"
                >
                  Não Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm" data-testid="button-back"><ArrowLeft size={20} /></button>
              <div className="flex items-center gap-3">
                  <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Nova Ordem de Serviço</h2>
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-black rounded-md">{osId}</span>
              </div>
          </div>
          <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 cursor-pointer transition-all ${formData.isSameOs ? 'bg-black border-black text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              <input type="checkbox" className="hidden" checked={formData.isSameOs} onChange={e => { const checked = e.target.checked; setFormData(prev => ({ ...prev, isSameOs: checked, parentMissionId: checked ? prev.parentMissionId : '' })); const route = clientRoutes.find(r => r.id.toString() === selectedRouteId); if (route) calculatePricing(route, undefined, manualRevenueTableId, '', { ceva200km: formData.applyCeva200km, vtc02h: checked, isSameOs: checked }); }} />
              <Layers size={14} className={formData.isSameOs ? 'text-white' : 'text-gray-400'} />
              <span className="text-[10px] font-black uppercase tracking-wider">Mesma OS</span>
          </label>
      </div>

      {formData.isSameOs && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 block">Vincular à OS Mãe (Principal)</label>
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black" placeholder="Digite o nº da OS mãe (ex: GTM-1234) ou busque..." value={parentOsSearch || formData.parentMissionId} onChange={e => { setParentOsSearch(e.target.value); setShowParentOsDropdown(true); if (!e.target.value) setFormData(prev => ({...prev, parentMissionId: ''})); }} onFocus={() => setShowParentOsDropdown(true)} data-testid="input-parent-mission-id" />
              </div>
              {formData.parentMissionId && (<button type="button" onClick={() => { setFormData(prev => ({...prev, parentMissionId: ''})); setParentOsSearch(''); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><X size={16}/></button>)}
            </div>
            {formData.parentMissionId && (
              <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                <Layers size={12} className="text-blue-600" />
                <span className="text-[10px] font-black text-blue-700 uppercase">OS Mãe: {formData.parentMissionId}</span>
                {(() => { const p = parentOsSuggestions.find(s => s.id === formData.parentMissionId); return p ? <span className="text-[9px] text-blue-500 ml-1">({p.client} → {p.origin?.split(',')[0]} / {p.destination?.split(',')[0]})</span> : null; })()}
              </div>
            )}
            {showParentOsDropdown && formData.isSameOs && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {parentOsSuggestions.filter(s => { if (!parentOsSearch) return true; const term = parentOsSearch.toLowerCase(); return s.id.toLowerCase().includes(term) || s.client?.toLowerCase().includes(term) || s.provider?.toLowerCase().includes(term); }).map(s => (
                  <button key={s.id} type="button" className={`w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 transition-colors ${formData.parentMissionId === s.id ? 'bg-blue-50' : ''}`} onClick={() => { setFormData(prev => ({...prev, parentMissionId: s.id})); setParentOsSearch(''); setShowParentOsDropdown(false); }} data-testid={`option-parent-${s.id}`}>
                    <div className="flex items-center justify-between"><span className="text-xs font-black text-gray-900">{s.id}</span><span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${s.status === 'Concluída' ? 'bg-green-100 text-green-700' : s.status === 'Em Viagem' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{s.status}</span></div>
                    <div className="text-[9px] text-gray-500 mt-0.5">{s.client} • {s.provider || 'Sem fornecedor'}</div>
                    <div className="text-[9px] text-gray-400">{s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}</div>
                  </button>
                ))}
                {parentOsSuggestions.length === 0 && <div className="px-3 py-4 text-center text-xs text-gray-400">Nenhuma OS encontrada para este cliente</div>}
                {parentOsSearch && !parentOsSuggestions.find(s => s.id === parentOsSearch) && (
                  <button type="button" className="w-full text-left px-3 py-2 hover:bg-blue-50 border-t border-gray-100 text-blue-700" onClick={() => { setFormData(prev => ({...prev, parentMissionId: parentOsSearch.toUpperCase()})); setParentOsSearch(''); setShowParentOsDropdown(false); }}>
                    <div className="flex items-center gap-2"><Plus size={12}/><span className="text-xs font-bold">Usar "{parentOsSearch.toUpperCase()}" como OS Mãe</span></div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
          {[
              { n: 1, t: 'Operação', done: stepComplete.step1 },
              { n: 2, t: 'Cliente', done: stepComplete.step2 },
              { n: 3, t: 'Veículo', done: stepComplete.step3 },
              { n: 4, t: 'Fornecedor', done: stepComplete.step4 },
              { n: 5, t: 'Rota', done: stepComplete.step5 },
              { n: 6, t: 'Agendamento', done: stepComplete.step6 },
          ].map(s => (
              <div key={s.n} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0 transition-all ${s.done ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black ${s.done ? 'bg-green-600 text-white' : 'bg-gray-300 text-white'}`}>{s.done ? <Check size={10}/> : s.n}</div>
                  {s.t}
              </div>
          ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200" ref={dropdownRef}>
          <form onSubmit={handleSubmit} className="divide-y divide-gray-100">

              {/* ETAPA 1 - TIPO DE OPERAÇÃO */}
              <div className="p-4 space-y-3">
                  {STEP_HEADER(1, 'Tipo de Operação', <Siren size={16} className={stepComplete.step1 ? 'text-green-600' : 'text-red-600'} />, stepComplete.step1, true)}
                  {expandedStep === 1 && (
                      <div className="grid grid-cols-2 gap-3 mt-2 animate-in slide-in-from-top-1 duration-200">
                          <button type="button" data-testid="button-tipo-caracterizada" onClick={() => { setFormData(prev => ({...prev, missionType: 'Caracterizada', provider: ''})); setProviderSearchTerm(''); setProviderPending(false); }} className={`p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${formData.missionType === 'Caracterizada' ? 'border-red-600 bg-red-50 shadow-md ring-2 ring-red-200' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                              <Siren size={24} className={formData.missionType === 'Caracterizada' ? 'text-red-600' : 'text-gray-400'} />
                              <div className="text-left">
                                  <p className={`text-sm font-black uppercase ${formData.missionType === 'Caracterizada' ? 'text-red-800' : 'text-gray-600'}`}>Caracterizada</p>
                                  <p className="text-[9px] text-gray-400 font-medium">Viatura identificada</p>
                              </div>
                          </button>
                          <button type="button" data-testid="button-tipo-velada" onClick={() => { setFormData(prev => ({...prev, missionType: 'Velada', provider: ''})); setProviderSearchTerm(''); setProviderPending(false); }} className={`p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${formData.missionType === 'Velada' ? 'border-gray-900 bg-gray-900 shadow-md ring-2 ring-gray-400 text-white' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                              <ShieldCheck size={24} className={formData.missionType === 'Velada' ? 'text-white' : 'text-gray-400'} />
                              <div className="text-left">
                                  <p className={`text-sm font-black uppercase ${formData.missionType === 'Velada' ? 'text-white' : 'text-gray-600'}`}>Velada</p>
                                  <p className={`text-[9px] font-medium ${formData.missionType === 'Velada' ? 'text-gray-300' : 'text-gray-400'}`}>Viatura descaracterizada</p>
                              </div>
                          </button>
                      </div>
                  )}
              </div>

              {/* ETAPA 2 - CLIENTE */}
              {canShowStep2 && (
              <div className="p-4 space-y-3">
                  {STEP_HEADER(2, 'Selecionar Cliente', <Building2 size={16} className={stepComplete.step2 ? 'text-green-600' : 'text-red-600'} />, stepComplete.step2, !stepComplete.step2)}
                  {expandedStep === 2 && (
                  <div className="space-y-4 animate-in slide-in-from-top-1 duration-200">
                  <div className="flex gap-2">
                      <div className="relative flex-1">
                          <select required className={SELECT_CLASS} value={formData.client} disabled={isCommercialUser} data-testid="select-client" onChange={e => {
                              const clientName = e.target.value;
                              const isVTC = (clientName || '').toUpperCase().includes('VTC');
                              setFormData(prev => {
                                  const next = { ...prev, client: clientName, applyVtc02h: isVTC, clientVehicleId: '', clientVehiclePlate: '', clientVehicleModel: '', clientVehicleId2: '', clientVehiclePlate2: '', clientVehicleModel2: '', driver_name: '', driver_phone: '', driver_name_2: '', driver_phone_2: '' };
                                  const route = clientRoutes.find(r => r.id.toString() === selectedRouteId);
                                  if (route) { setTimeout(() => calculatePricing(route, undefined, '', '', { ceva200km: next.applyCeva200km, vtc02h: next.applyVtc02h, isSameOs: next.isSameOs }), 100); }
                                  return next;
                              });
                              setProviderPending(false);
                              if (isVTC) showNotification('Inteligência Comercial', 'Cliente VTC detectado: Verifique a Regra de 02 Horas.', 'info');
                          }}>
                              <option value="">Selecione o cliente...</option>
                              {dbClients.map(c => <option key={c.id} value={c.name}>{c.trading_name || c.name}</option>)}
                          </select>
                          <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                      {!isCommercialUser && <button type="button" onClick={() => setIsClientModalOpen(true)} className="p-3 bg-gray-900 text-white rounded-lg hover:bg-black transition-all shadow-md active:scale-95" data-testid="button-add-client"><Plus size={20} /></button>}
                  </div>
                  {isVtcClient && (
                      <div className={`p-4 rounded-xl border-2 transition-all duration-300 animate-in slide-in-from-top-2 ${!formData.applyVtc02h ? 'bg-red-50 border-red-500 animate-pulse' : 'bg-blue-50 border-blue-600'}`}>
                          <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-lg ${!formData.applyVtc02h ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'}`}>{!formData.applyVtc02h ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}</div>
                                  <div>
                                      <p className={`text-[10px] font-black uppercase tracking-widest ${!formData.applyVtc02h ? 'text-red-700' : 'text-blue-800'}`}>Atenção: Regra 02 Horas</p>
                                      <p className={`text-[9px] font-bold ${!formData.applyVtc02h ? 'text-red-600' : 'text-blue-600'}`}>{!formData.applyVtc02h ? 'ESTA OPÇÃO É OBRIGATÓRIA PARA ACIONAMENTOS VTC' : 'REGRA APLICADA COM SUCESSO'}</p>
                                  </div>
                              </div>
                              <button type="button" onClick={() => { const nextVal = !formData.applyVtc02h; setFormData(prev => ({ ...prev, applyVtc02h: nextVal })); const route = clientRoutes.find(r => r.id.toString() === selectedRouteId); if (route) calculatePricing(route, undefined, manualRevenueTableId, '', { ceva200km: formData.applyCeva200km, vtc02h: nextVal, isSameOs: formData.isSameOs }); }} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase shadow-md transition-all active:scale-95 ${!formData.applyVtc02h ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white'}`}>{!formData.applyVtc02h ? 'ATIVAR AGORA' : 'DESATIVAR'}</button>
                          </div>
                      </div>
                  )}
                  {isCeslogClient && (
                      <div className="p-4 rounded-xl border-2 border-purple-400 bg-purple-50 animate-in slide-in-from-top-2 duration-300">
                          <label className={LABEL_CLASS}><span className="text-red-600">*</span> Nº da Referência (CESLOG/CESARI)</label>
                          <input type="text" required className={INPUT_CLASS} placeholder="Informe o número da referência..." value={formData.reference_number} onChange={e => setFormData(prev => ({ ...prev, reference_number: e.target.value }))} data-testid="input-reference-number" />
                          <p className="text-[9px] text-purple-600 font-bold mt-1">Campo obrigatório para clientes CESLOG e CESARI</p>
                      </div>
                  )}
                  {isDhlClient && (
                      <div className="p-4 rounded-xl border-2 animate-in slide-in-from-top-2 duration-300" style={{ borderColor: '#D40511', background: 'linear-gradient(180deg, #fff8d6 0%, #fffbe6 100%)' }}>
                          <div className="flex items-center gap-2 mb-2">
                              <div style={{ width: 8, height: 24, background: '#FFCC00', borderRadius: 2 }}></div>
                              <div style={{ width: 8, height: 24, background: '#D40511', borderRadius: 2 }}></div>
                              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#7f1d1d' }}>Cliente DHL — Dados Obrigatórios</p>
                          </div>
                          <label className={LABEL_CLASS}><span className="text-red-600">*</span> Número da S.E. (Solicitação de Escolta)</label>
                          <div className="flex gap-2 items-stretch">
                              <input
                                  type="text"
                                  required
                                  className={`${INPUT_CLASS} flex-1`}
                                  placeholder="Ex: SE-123456 / 4912345"
                                  value={formData.dhl_se_number}
                                  onChange={e => {
                                      const v = e.target.value.toUpperCase();
                                      setFormData(prev => ({ ...prev, dhl_se_number: v }));
                                      if (dhlSeConfirmed && dhlSeConfirmed.toUpperCase() !== v) setDhlSeConfirmed('');
                                  }}
                                  data-testid="input-dhl-se-number"
                              />
                              {(() => {
                                  const current = formData.dhl_se_number.trim();
                                  const confirmed = !!current && dhlSeConfirmed.trim().toUpperCase() === current.toUpperCase();
                                  return (
                                      <button
                                          type="button"
                                          disabled={!current || confirmed}
                                          onClick={() => setDhlSeConfirmed(current)}
                                          data-testid="button-confirm-dhl-se"
                                          className={`px-4 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1 ${
                                              confirmed
                                                  ? 'bg-green-600 text-white cursor-default'
                                                  : current
                                                      ? 'bg-red-600 text-white hover:bg-red-700'
                                                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                          }`}
                                      >
                                          {confirmed ? <><Check size={12} /> Confirmado</> : 'Confirmar'}
                                      </button>
                                  );
                              })()}
                          </div>
                          {!dhlSeOk && formData.dhl_se_number.trim() && (
                              <p className="text-[10px] font-black mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-300 text-red-700 uppercase tracking-wider">
                                  Confirme o número da S.E. para liberar as próximas etapas.
                              </p>
                          )}
                          <p className="text-[9px] font-bold mt-1" style={{ color: '#7f1d1d' }}>
                              Após salvar a OS, o sistema gera automaticamente um link público para o fornecedor preencher Escoltistas e Veículo, com e-mail e mensagem para WhatsApp.
                          </p>

                          {hasSavedOs && (
                            <div className="mt-4 pt-4 border-t-2 border-dashed" style={{ borderColor: '#D40511' }} data-testid="panel-dhl-intakes">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#7f1d1d' }}>
                                  Links DHL desta OS {dhlIntakes.length > 0 && <span className="text-gray-500">({dhlIntakes.length})</span>}
                                </p>
                              </div>
                              {dhlIntakesLoading && dhlIntakes.length === 0 ? (
                                <p className="text-[10px] text-gray-500 italic" data-testid="text-dhl-intakes-loading">Carregando...</p>
                              ) : dhlIntakes.length === 0 ? (
                                <div className="flex flex-col items-start gap-2" data-testid="empty-dhl-intakes">
                                  <p className="text-[10px] text-gray-500 italic" data-testid="text-dhl-intakes-empty">
                                    Nenhum link gerado ainda. Clique abaixo para gerar agora e enviar ao fornecedor por e-mail e WhatsApp.
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleRegenerateDhlLink('both')}
                                      disabled={dhlRegenerating || !formData.provider}
                                      title={!formData.provider ? 'Selecione o fornecedor antes de gerar o link' : 'Gera o link, envia e-mail e prepara mensagem de WhatsApp'}
                                      className="px-3 h-9 rounded-lg bg-gray-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 flex items-center gap-1.5 active:scale-95 transition-all"
                                      data-testid="btn-generate-dhl-link-empty"
                                    >
                                      {dhlRegenerating ? <Loader2 size={12} className="animate-spin" /> : null}
                                      {dhlRegenerating ? 'Gerando...' : 'Gerar link agora (E-mail + WhatsApp)'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRegenerateDhlLink('email')}
                                      disabled={dhlRegenerating || !formData.provider}
                                      className="px-3 h-9 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 active:scale-95 transition-all"
                                      data-testid="btn-generate-dhl-link-email"
                                    >
                                      Só e-mail
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRegenerateDhlLink('whatsapp')}
                                      disabled={dhlRegenerating || !formData.provider}
                                      className="px-3 h-9 rounded-lg bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 active:scale-95 transition-all"
                                      data-testid="btn-generate-dhl-link-whatsapp"
                                    >
                                      Só WhatsApp
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {dhlIntakes.map((it) => {
                                    const st = it.effective_status;
                                    const badge = st === 'preenchido'
                                      ? { bg: 'bg-green-100', fg: 'text-green-800', label: 'Preenchido' }
                                      : st === 'cancelado'
                                        ? { bg: 'bg-gray-200', fg: 'text-gray-700', label: 'Cancelado' }
                                        : st === 'expirado'
                                          ? { bg: 'bg-orange-100', fg: 'text-orange-800', label: 'Expirado' }
                                          : { bg: 'bg-yellow-100', fg: 'text-yellow-800', label: 'Pendente' };
                                    const fmt = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
                                    const hasSnapshots = canViewIntakeSnapshots && st === 'preenchido' && (it.agent1_snapshot || it.agent2_snapshot || it.vehicle_snapshot);
                                    const isExpanded = expandedIntakeId === it.id;

                                    const buildSnapshotText = (): string => {
                                      const lines: string[] = [];
                                      lines.push(`OS ${osId} — Dados enviados pelo fornecedor`);
                                      lines.push(`Fornecedor: ${it.provider_name || '—'}`);
                                      lines.push(`Enviado em: ${fmt(it.submitted_at)}`);
                                      lines.push('');
                                      const agentBlock = (label: string, a: EscoltistaSnapshot | null | undefined) => {
                                        if (!a) return;
                                        lines.push(`== ${label} ==`);
                                        if (a.nome) lines.push(`Nome: ${a.nome}`);
                                        if (a.cpf) lines.push(`CPF: ${a.cpf}`);
                                        if (a.rg) lines.push(`RG: ${a.rg}${a.orgao_emissor ? ' / ' + a.orgao_emissor : ''}`);
                                        if (a.cnh) lines.push(`CNH: ${a.cnh}${a.cnh_categoria ? ' (' + a.cnh_categoria + ')' : ''}${a.cnh_vencimento ? ' — venc.: ' + a.cnh_vencimento : ''}`);
                                        if (a.cnv_numero) lines.push(`CNV: ${a.cnv_numero}${a.cnv_validade ? ' — venc.: ' + a.cnv_validade : ''}`);
                                        if (a.celular) lines.push(`Celular: ${a.celular}`);
                                        const end = [a.rua, a.numero, a.complemento, a.bairro, a.cidade, a.uf, a.cep].filter(Boolean).join(', ');
                                        if (end) lines.push(`Endereço: ${end}`);
                                        if (a.admissao) lines.push(`Admissão: ${a.admissao}`);
                                        lines.push('');
                                      };
                                      agentBlock('ESCOLTISTA 1', it.agent1_snapshot);
                                      agentBlock('ESCOLTISTA 2', it.agent2_snapshot);
                                      const v = it.vehicle_snapshot;
                                      if (v) {
                                        lines.push('== VEÍCULO ==');
                                        if (v.placa) lines.push(`Placa: ${v.placa}`);
                                        if (v.renavam) lines.push(`Renavam: ${v.renavam}`);
                                        if (v.marca || v.modelo || v.ano) lines.push(`Marca/Modelo/Ano: ${[v.marca, v.modelo, v.ano].filter(Boolean).join(' / ')}`);
                                        if (v.cor) lines.push(`Cor: ${v.cor}`);
                                        if (v.tecnologia) lines.push(`Tecnologia: ${v.tecnologia}`);
                                        if (v.id_rastreador) lines.push(`ID Rastreador: ${v.id_rastreador}`);
                                        if (v.comunicacao) lines.push(`Comunicação: ${v.comunicacao}`);
                                      }
                                      return lines.join('\n');
                                    };

                                    const handleCopy = async () => {
                                      try {
                                        await navigator.clipboard.writeText(buildSnapshotText());
                                        setCopiedIntakeId(it.id);
                                        setTimeout(() => setCopiedIntakeId((cur) => (cur === it.id ? null : cur)), 1800);
                                      } catch {
                                        showNotification('Não foi possível copiar para a área de transferência', 'error');
                                      }
                                    };

                                    const renderAgent = (label: string, a: EscoltistaSnapshot | null | undefined, testKey: string) => {
                                      if (!a) return (
                                        <div className="bg-gray-50 rounded p-2" data-testid={`block-${testKey}-${it.id}`}>
                                          <p className="font-black uppercase tracking-wider text-gray-500 mb-0.5">{label}</p>
                                          <p className="italic text-gray-400">— não informado —</p>
                                        </div>
                                      );
                                      const end = [a.rua, a.numero, a.complemento, a.bairro, a.cidade, a.uf, a.cep].filter(Boolean).join(', ');
                                      return (
                                        <div className="bg-gray-50 rounded p-2 space-y-0.5" data-testid={`block-${testKey}-${it.id}`}>
                                          <p className="font-black uppercase tracking-wider text-gray-700 mb-0.5">{label}</p>
                                          {a.nome && <p data-testid={`text-${testKey}-nome-${it.id}`}><span className="font-bold">Nome:</span> {a.nome}</p>}
                                          {a.cpf && <p data-testid={`text-${testKey}-cpf-${it.id}`}><span className="font-bold">CPF:</span> {a.cpf}</p>}
                                          {a.rg && <p><span className="font-bold">RG:</span> {a.rg}{a.orgao_emissor ? ` / ${a.orgao_emissor}` : ''}</p>}
                                          {a.cnh && <p><span className="font-bold">CNH:</span> {a.cnh}{a.cnh_categoria ? ` (${a.cnh_categoria})` : ''}{a.cnh_vencimento ? ` — venc.: ${a.cnh_vencimento}` : ''}</p>}
                                          {a.cnv_numero && <p><span className="font-bold">CNV:</span> {a.cnv_numero}{a.cnv_validade ? ` — venc.: ${a.cnv_validade}` : ''}</p>}
                                          {a.celular && <p><span className="font-bold">Celular:</span> {a.celular}</p>}
                                          {end && <p><span className="font-bold">Endereço:</span> {end}</p>}
                                          {a.admissao && <p><span className="font-bold">Admissão:</span> {a.admissao}</p>}
                                        </div>
                                      );
                                    };

                                    const v = it.vehicle_snapshot;
                                    const renderVehicle = () => {
                                      if (!v) return (
                                        <div className="bg-gray-50 rounded p-2" data-testid={`block-vehicle-${it.id}`}>
                                          <p className="font-black uppercase tracking-wider text-gray-500 mb-0.5">Veículo</p>
                                          <p className="italic text-gray-400">— não informado —</p>
                                        </div>
                                      );
                                      return (
                                        <div className="bg-gray-50 rounded p-2 space-y-0.5" data-testid={`block-vehicle-${it.id}`}>
                                          <p className="font-black uppercase tracking-wider text-gray-700 mb-0.5">Veículo</p>
                                          {v.placa && <p data-testid={`text-vehicle-placa-${it.id}`}><span className="font-bold">Placa:</span> {v.placa}</p>}
                                          {v.renavam && <p><span className="font-bold">Renavam:</span> {v.renavam}</p>}
                                          {(v.marca || v.modelo || v.ano) && <p><span className="font-bold">Marca/Modelo/Ano:</span> {[v.marca, v.modelo, v.ano].filter(Boolean).join(' / ')}</p>}
                                          {v.cor && <p><span className="font-bold">Cor:</span> {v.cor}</p>}
                                          {v.tecnologia && <p data-testid={`text-vehicle-tecnologia-${it.id}`}><span className="font-bold">Tecnologia:</span> {v.tecnologia}</p>}
                                          {v.id_rastreador && <p><span className="font-bold">ID Rastreador:</span> {v.id_rastreador}</p>}
                                          {v.comunicacao && <p><span className="font-bold">Comunicação:</span> {v.comunicacao}</p>}
                                        </div>
                                      );
                                    };

                                    const showRowRegen = st === 'cancelado' || st === 'expirado';
                                    const isPaused = !!it.auto_reminders_paused_at;
                                    const canPause = st === 'pendente';
                                    return (
                                      <div key={it.id} className="bg-white border border-gray-200 rounded-lg p-2.5 text-[10px]" data-testid={`row-dhl-intake-${it.id}`}>
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-0.5 ${badge.bg} ${badge.fg} font-black uppercase tracking-wider rounded`} data-testid={`status-dhl-intake-${it.id}`}>{badge.label}</span>
                                            {isPaused && (
                                              <span
                                                className="px-2 py-0.5 bg-amber-100 text-amber-800 font-black uppercase tracking-wider rounded flex items-center gap-1"
                                                title={it.auto_reminders_paused_by ? `Pausado por ${it.auto_reminders_paused_by} em ${fmt(it.auto_reminders_paused_at)}` : `Pausado em ${fmt(it.auto_reminders_paused_at)}`}
                                                data-testid={`status-dhl-intake-paused-${it.id}`}
                                              >
                                                ⏸ Lembretes pausados
                                              </span>
                                            )}
                                            {canPause && (
                                              <button
                                                type="button"
                                                onClick={() => handleToggleDhlReminders(it.id, !isPaused)}
                                                disabled={dhlPauseToggling === it.id}
                                                className={`px-2 py-0.5 rounded font-black uppercase tracking-wider disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1 ${isPaused ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
                                                data-testid={`btn-toggle-dhl-reminders-${it.id}`}
                                                title={isPaused ? 'Retomar lembretes automáticos para este fornecedor' : 'Pausar lembretes automáticos para este fornecedor (use quando estiver em contato direto por outro canal)'}
                                              >
                                                {dhlPauseToggling === it.id
                                                  ? <Loader2 size={10} className="animate-spin" />
                                                  : (isPaused ? '▶ Retomar lembretes' : '⏸ Pausar lembretes')}
                                              </button>
                                            )}
                                            {showRowRegen && (() => {
                                              const prov = dbProviders.find(p => p.name === formData.provider || p.trading_name === formData.provider);
                                              const rawPref = prov?.dhl_channel_preference;
                                              const hasPref = rawPref === 'email' || rawPref === 'whatsapp' || rawPref === 'both';
                                              const preferred: 'email' | 'whatsapp' | 'both' = hasPref ? rawPref : 'both';
                                              const prefLabel = preferred === 'email' ? 'Reenviar por e-mail' : preferred === 'whatsapp' ? 'Reenviar por WhatsApp' : 'Reenviar (e-mail + WhatsApp)';
                                              const prefBg = preferred === 'whatsapp' ? 'bg-green-600 hover:bg-green-700' : preferred === 'both' ? 'bg-gray-900 hover:bg-black' : 'bg-red-600 hover:bg-red-700';
                                              return (
                                                <>
                                                  {hasPref && (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleRegenerateDhlLink(preferred)}
                                                      disabled={dhlRegenerating}
                                                      className={`px-2 py-0.5 rounded ${prefBg} text-white font-black uppercase tracking-wider disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1`}
                                                      data-testid={`btn-resend-dhl-intake-default-${it.id}`}
                                                      title={`Reenviar pelo canal padrão deste fornecedor (${preferred})`}
                                                    >
                                                      {dhlRegenerating ? <Loader2 size={10} className="animate-spin" /> : <Mail size={10} />}
                                                      {dhlRegenerating ? 'Enviando...' : prefLabel}
                                                    </button>
                                                  )}
                                                  <button
                                                    type="button"
                                                    onClick={() => setDhlChannelPicker({ open: true, preferred, saveAsDefault: false })}
                                                    disabled={dhlRegenerating}
                                                    className={`px-2 py-0.5 rounded ${hasPref ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50' : 'bg-red-600 text-white hover:bg-red-700'} font-black uppercase tracking-wider disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1`}
                                                    data-testid={`btn-resend-dhl-intake-${it.id}`}
                                                    title={hasPref ? 'Escolher outro canal apenas para este envio' : 'Gerar novo link e reenviar ao fornecedor'}
                                                  >
                                                    {!hasPref && (dhlRegenerating ? <Loader2 size={10} className="animate-spin" /> : <Mail size={10} />)}
                                                    {hasPref ? 'Outro canal…' : (dhlRegenerating ? 'Enviando...' : 'Gerar novo link')}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={handleResendEmailAndCopyWhatsapp}
                                                    disabled={dhlReleaseSending || dhlRegenerating}
                                                    className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1"
                                                    data-testid={`btn-resend-release-${it.id}`}
                                                    title="Reenvia o e-mail e copia a mensagem do WhatsApp avisando que o link está liberado"
                                                  >
                                                    {dhlReleaseSending ? <Loader2 size={10} className="animate-spin" /> : <Mail size={10} />}
                                                    {dhlReleaseSending ? 'Enviando...' : 'E-mail + copiar WhatsApp'}
                                                  </button>
                                                </>
                                              );
                                            })()}
                                          </div>
                                          <span className="text-gray-500 font-mono" data-testid={`text-dhl-intake-created-${it.id}`}>Criado: {fmt(it.created_at)}</span>
                                        </div>
                                        <p className="font-bold text-gray-800 truncate" data-testid={`text-dhl-intake-provider-${it.id}`}>{it.provider_name || '—'}</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-gray-600">
                                          <span data-testid={`text-dhl-intake-email-${it.id}`}><Mail size={10} className="inline mr-1" />{it.sent_to_email || '—'}</span>
                                          <span data-testid={`text-dhl-intake-phone-${it.id}`}><Phone size={10} className="inline mr-1" />{it.sent_to_phone || '—'}</span>
                                          <span data-testid={`text-dhl-intake-submitted-${it.id}`}>Enviado pelo fornecedor: {fmt(it.submitted_at)}</span>
                                          <span data-testid={`text-dhl-intake-expires-${it.id}`}>Expira: {fmt(it.expires_at)}</span>
                                        </div>
                                        {st === 'pendente' && (() => {
                                          const maxCount = dhlReminderConfig.maxCount;
                                          const cycleHours = dhlReminderConfig.cycleHours;
                                          const renderRow = (
                                            channel: 'email' | 'whatsapp',
                                            label: string,
                                            Icon: any,
                                            count: number,
                                            lastSentAt: string | null | undefined,
                                            hasTarget: boolean,
                                          ) => {
                                            if (!hasTarget && count <= 0) return null;
                                            const remaining = Math.max(0, maxCount - count);
                                            const limitReached = count >= maxCount;
                                            let nextLabel = '';
                                            if (!limitReached) {
                                              if (lastSentAt) {
                                                const due = new Date(lastSentAt).getTime() + cycleHours * 3600 * 1000;
                                                const diffH = (due - Date.now()) / 3600000;
                                                nextLabel = diffH <= 0 ? 'próximo a qualquer momento' : `próximo em ~${Math.max(1, Math.round(diffH))}h`;
                                              } else {
                                                nextLabel = 'próximo a qualquer momento';
                                              }
                                            }
                                            return (
                                              <li
                                                key={channel}
                                                className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${limitReached ? 'text-red-700' : 'text-gray-700'}`}
                                                data-testid={`reminder-${channel}-${it.id}`}
                                              >
                                                <Icon size={10} className="inline" />
                                                <span className="font-bold">{label}:</span>
                                                <span data-testid={`reminder-${channel}-count-${it.id}`}>
                                                  {count} de {maxCount} lembretes automáticos enviados
                                                </span>
                                                {limitReached ? (
                                                  <span
                                                    className="font-black uppercase tracking-wider text-red-700"
                                                    data-testid={`reminder-${channel}-limit-${it.id}`}
                                                  >
                                                    · limite atingido — reenviar manualmente
                                                  </span>
                                                ) : (
                                                  <span className="text-gray-500" data-testid={`reminder-${channel}-next-${it.id}`}>· {nextLabel}; restam {remaining}</span>
                                                )}
                                              </li>
                                            );
                                          };
                                          const emailRow = renderRow('email', 'E-mail', Mail, Number(it.provider_reminder_count) || 0, it.provider_reminder_sent_at, !!it.sent_to_email);
                                          const waRow = renderRow('whatsapp', 'WhatsApp', Phone, Number(it.provider_whatsapp_reminder_count) || 0, it.provider_whatsapp_reminder_sent_at, !!it.sent_to_phone);
                                          if (!emailRow && !waRow) return null;
                                          return (
                                            <div className="mt-2 pt-2 border-t border-gray-100" data-testid={`block-reminders-${it.id}`}>
                                              <p className="text-[10px] font-black uppercase tracking-wider text-gray-600 mb-1">Lembretes automáticos</p>
                                              <ul className="space-y-0.5">
                                                {emailRow}
                                                {waRow}
                                              </ul>
                                            </div>
                                          );
                                        })()}
                                        {Array.isArray(it.resends) && it.resends.length > 0 && (
                                          <div className="mt-2 pt-2 border-t border-gray-100" data-testid={`block-resends-${it.id}`}>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-600 mb-1">
                                              Histórico de reenvios <span className="text-gray-400">({it.resends.length})</span>
                                            </p>
                                            <ul className="space-y-1">
                                              {it.resends.map((rs: any) => {
                                                const emailOk = rs.email_status === 'success';
                                                const emailSkipped = rs.email_status === 'skipped' || !rs.email_status;
                                                const emailFail = rs.email_status === 'failure';
                                                const waOk = rs.whatsapp_status === 'success';
                                                const waSkipped = rs.whatsapp_status === 'skipped' || !rs.whatsapp_status;
                                                const waFail = rs.whatsapp_status === 'failure';
                                                // Estado geral: sucesso se qualquer canal foi entregue; falha se algum tentou e falhou e nenhum teve sucesso.
                                                const anySuccess = emailOk || waOk;
                                                const anyFailure = emailFail || waFail;
                                                const dotCls = anySuccess ? 'bg-green-500' : anyFailure ? 'bg-red-500' : 'bg-gray-400';
                                                const emailLabel = emailOk ? `E-mail ✓ ${rs.target_email || ''}`.trim() : emailFail ? 'E-mail ✗' : null;
                                                // Status de entrega/leitura do WhatsApp (Z-API webhook): ✓ enviado, ✓✓ entregue, ✓✓ azul lido.
                                                const waReadAt = rs.whatsapp_read_at as string | null | undefined;
                                                const waDeliveredAt = rs.whatsapp_delivered_at as string | null | undefined;
                                                let waMarks = '';
                                                let waMarksCls = '';
                                                let waMarksTitle = '';
                                                if (waOk) {
                                                  if (waReadAt) { waMarks = '✓✓'; waMarksCls = 'text-blue-600'; waMarksTitle = `Lido em ${fmt(waReadAt)}`; }
                                                  else if (waDeliveredAt) { waMarks = '✓✓'; waMarksCls = 'text-gray-500'; waMarksTitle = `Entregue em ${fmt(waDeliveredAt)}`; }
                                                  else { waMarks = '✓'; waMarksCls = 'text-gray-500'; waMarksTitle = 'Enviado — aguardando confirmação'; }
                                                }
                                                const waLabel = waOk ? `WhatsApp ✓ ${rs.target_phone || ''}`.trim() : waFail ? 'WhatsApp ✗' : null;
                                                const labels: string[] = [];
                                                if (emailLabel) labels.push(emailLabel);
                                                if (waLabel) labels.push(waLabel);
                                                if (labels.length === 0) {
                                                  // Nada foi tentado (ou tabela antiga sem whatsapp_status): mostra destino bruto.
                                                  labels.push(emailSkipped && waSkipped ? 'Sem envio' : (rs.target_email || rs.target_phone || '—'));
                                                }
                                                return (
                                                  <li key={rs.id} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-gray-700" data-testid={`resend-row-${rs.id}`}>
                                                    <span className={`inline-block w-1.5 h-1.5 rounded-full mt-1 ${dotCls}`} />
                                                    <span className="font-mono text-gray-500" data-testid={`resend-when-${rs.id}`}>{fmt(rs.sent_at)}</span>
                                                    <span className="text-gray-400">·</span>
                                                    <span data-testid={`resend-user-${rs.id}`}>{rs.sent_by_user_name || 'Sistema'}</span>
                                                    <span className="text-gray-400">·</span>
                                                    <span
                                                      className={`font-bold ${anySuccess ? 'text-green-700' : anyFailure ? 'text-red-700' : 'text-gray-500'}`}
                                                      data-testid={`resend-status-${rs.id}`}
                                                    >
                                                      {labels.join(' · ')}
                                                    </span>
                                                    {waMarks && (
                                                      <span
                                                        className={`font-black ${waMarksCls}`}
                                                        title={waMarksTitle}
                                                        data-testid={`resend-wa-marks-${rs.id}`}
                                                      >
                                                        {waMarks}
                                                      </span>
                                                    )}
                                                    {rs.reused_existing_token && (
                                                      <span className="text-gray-500 italic">(mesmo link)</span>
                                                    )}
                                                    {(rs.email_error || rs.whatsapp_error) && (
                                                      <span className="w-full text-red-700 italic pl-3.5" data-testid={`resend-error-${rs.id}`}>
                                                        {[rs.email_error && `E-mail: ${rs.email_error}`, rs.whatsapp_error && `WhatsApp: ${rs.whatsapp_error}`].filter(Boolean).join(' — ')}
                                                      </span>
                                                    )}
                                                  </li>
                                                );
                                              })}
                                            </ul>
                                          </div>
                                        )}
                                        {hasSnapshots && (
                                          <>
                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 gap-2">
                                              <button
                                                type="button"
                                                onClick={() => setExpandedIntakeId(isExpanded ? null : it.id)}
                                                className="text-[10px] font-black uppercase tracking-wider text-red-700 hover:text-red-900 flex items-center gap-1"
                                                data-testid={`btn-toggle-intake-details-${it.id}`}
                                              >
                                                <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                {isExpanded ? 'Ocultar dados do fornecedor' : 'Ver dados preenchidos pelo fornecedor'}
                                              </button>
                                              {isExpanded && (
                                                <button
                                                  type="button"
                                                  onClick={handleCopy}
                                                  className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-black uppercase tracking-wider flex items-center gap-1 text-[10px]"
                                                  data-testid={`btn-copy-intake-${it.id}`}
                                                >
                                                  {copiedIntakeId === it.id ? <><Check size={11} className="text-green-600" /> Copiado</> : <><Clipboard size={11} /> Copiar texto</>}
                                                </button>
                                              )}
                                            </div>
                                            {isExpanded && (
                                              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-gray-700 animate-in slide-in-from-top-1 duration-150" data-testid={`details-intake-${it.id}`}>
                                                {renderAgent('Escoltista 1', it.agent1_snapshot, 'agent1')}
                                                {renderAgent('Escoltista 2', it.agent2_snapshot, 'agent2')}
                                                {renderVehicle()}
                                                {it.mirror_proof_url && (
                                                  <div className="md:col-span-3">
                                                    <a
                                                      href={it.mirror_proof_url}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="inline-flex items-center gap-1 text-red-700 hover:text-red-900 font-black uppercase tracking-wider text-[10px]"
                                                      data-testid={`link-mirror-proof-${it.id}`}
                                                    >
                                                      <Paperclip size={11} /> Print do espelhamento{it.mirror_proof_filename ? ` (${it.mirror_proof_filename})` : ''}
                                                    </a>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                  )}
              </div>
              )}
              </div>
              )}

              {/* ETAPA 3 - VEÍCULO / MOTORISTA / TELEFONE */}
              {canShowStep3 && (
              <div className="p-4 space-y-3">
                  {STEP_HEADER(3, 'Veículo do Cliente / Motorista', <Truck size={16} className={stepComplete.step3 ? 'text-green-600' : 'text-red-600'} />, stepComplete.step3, !stepComplete.step3)}
                  {expandedStep === 3 && (
                  <div className="space-y-4 animate-in slide-in-from-top-1 duration-200">
                  <div className="relative">
                      <label className={LABEL_CLASS}>Veículo de Carga (Placa)</label>
                      <div className="flex gap-1.5">
                          <div className="relative flex-1">
                              <input type="text" className={INPUT_CLASS} placeholder="Buscar veículo..." value={vehicleSearchTerm} onChange={e => { setVehicleSearchTerm(e.target.value.toUpperCase()); setActiveDropdown('vehicle'); }} onFocus={() => formData.client && setActiveDropdown('vehicle')} data-testid="input-vehicle" />
                              <Truck size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              {activeDropdown === 'vehicle' && formData.client && filteredVehicles.length > 0 && (
                                  <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto ring-1 ring-black/5">
                                      {filteredVehicles.map(v => (<button key={v.id} type="button" onClick={() => { handleVehicleSelect(v); setDriverQuestion('asking'); }} className={DROPDOWN_ITEM_CLASS}>{v.plate} ({v.model})</button>))}
                                  </div>
                              )}
                          </div>
                          <button type="button" onClick={() => setIsVehicleModalOpen(true)} className="p-2.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-200 transition-all shadow-sm active:scale-95" data-testid="button-add-vehicle"><Plus size={18} /></button>
                      </div>
                  </div>

                  {formData.clientVehicleId && driverQuestion === 'asking' && (
                      <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl animate-in slide-in-from-top-2 space-y-3">
                          <p className="text-[11px] font-black text-blue-800 uppercase tracking-wider flex items-center gap-2"><User size={14} /> Você já tem o nome e telefone do motorista?</p>
                          <div className="flex gap-3">
                              <button type="button" onClick={() => setDriverQuestion('yes')} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-green-700 transition-all active:scale-95 flex items-center justify-center gap-2" data-testid="button-driver-yes"><Check size={16} /> Sim, preencher</button>
                              <button type="button" onClick={() => setDriverQuestion('no')} className="flex-1 py-3 bg-gray-200 text-gray-600 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-gray-300 transition-all active:scale-95 flex items-center justify-center gap-2" data-testid="button-driver-no"><ArrowRight size={16} /> Não, pular</button>
                          </div>
                      </div>
                  )}

                  {driverQuestion === 'yes' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                          <div className="relative">
                              <label className={LABEL_CLASS}>Motorista</label>
                              <div className="relative">
                                  <input type="text" className={INPUT_CLASS} placeholder="Nome do condutor..." value={driverSearchTerm} onChange={e => { setDriverSearchTerm(e.target.value.toUpperCase()); setFormData({...formData, driver_name: e.target.value}); setActiveDropdown('driver'); }} onFocus={() => setActiveDropdown('driver')} data-testid="input-driver-name" />
                                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                  {activeDropdown === 'driver' && filteredDrivers.length > 0 && (
                                      <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto ring-1 ring-black/5">
                                          {filteredDrivers.map((d, i) => (<button key={i} type="button" onClick={() => handleDriverSelect(d)} className={DROPDOWN_ITEM_CLASS}>{d.name}</button>))}
                                      </div>
                                  )}
                              </div>
                          </div>
                          <div className="relative">
                              <label className={LABEL_CLASS}>Telefone Motorista</label>
                              <div className="relative">
                                  <input type="text" className={INPUT_CLASS} placeholder="(00) 00000-0000" maxLength={15} value={formData.driver_phone} onChange={e => { const digits = e.target.value.replace(/\D/g, '').slice(0, 11); let masked = ''; if (digits.length > 0) { masked = '(' + digits.slice(0, 2); if (digits.length > 2) { masked += ') ' + digits.slice(2, digits.length > 10 ? 7 : 6); if (digits.length > (digits.length > 10 ? 7 : 6)) masked += '-' + digits.slice(digits.length > 10 ? 7 : 6); } } setFormData({...formData, driver_phone: masked}); }} data-testid="input-driver-phone" />
                                  <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              </div>
                          </div>
                      </div>
                  )}

                  {driverQuestion === 'no' && (
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl animate-in fade-in">
                          <ArrowRight size={14} className="text-gray-400" />
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Motorista será informado depois</span>
                          <button type="button" onClick={() => setDriverQuestion('asking')} className="ml-auto text-gray-400 hover:text-blue-600 text-[10px] font-bold uppercase">Alterar</button>
                      </div>
                  )}

                  {!showSecondVehicle && formData.clientVehicleId && (
                      <div className="flex justify-center">
                          <button type="button" onClick={() => setShowSecondVehicle(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-black uppercase tracking-wider hover:bg-blue-100 transition-all active:scale-95" data-testid="button-add-vehicle-2"><Plus size={14} /> Adicionar 2° Veículo</button>
                      </div>
                  )}
                  {showSecondVehicle && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100 relative">
                          <button type="button" onClick={() => { setShowSecondVehicle(false); setFormData(prev => ({ ...prev, clientVehicleId2: '', clientVehiclePlate2: '', clientVehicleModel2: '', driver_name_2: '', driver_phone_2: '' })); setVehicleSearchTerm2(''); }} className="absolute top-2 right-2 p-1 bg-white rounded-full border border-gray-200 text-gray-400 hover:text-red-600 transition-all" data-testid="button-remove-vehicle-2"><X size={14} /></button>
                          <div className="col-span-full"><span className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5"><Truck size={12} /> 2° Veículo de Carga</span></div>
                          <div className="relative">
                              <label className={LABEL_CLASS}>Placa 2° Veículo</label>
                              <div className="flex gap-1.5">
                                  <div className="relative flex-1">
                                      <input type="text" className={INPUT_CLASS} placeholder="Buscar veículo..." value={vehicleSearchTerm2} onChange={e => { setVehicleSearchTerm2(e.target.value.toUpperCase()); setActiveDropdown('vehicle2'); }} onFocus={() => formData.client && setActiveDropdown('vehicle2')} data-testid="input-vehicle-2" />
                                      <Truck size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
                                      {activeDropdown === 'vehicle2' && formData.client && filteredVehicles2.length > 0 && (
                                          <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto ring-1 ring-black/5">
                                              {filteredVehicles2.map(v => (<button key={v.id} type="button" onClick={() => handleVehicleSelect2(v)} className={DROPDOWN_ITEM_CLASS}>{v.plate} ({v.model})</button>))}
                                          </div>
                                      )}
                                  </div>
                                  <button type="button" onClick={() => setIsVehicleModalOpen(true)} className="p-2.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-200 transition-all shadow-sm active:scale-95 disabled:opacity-50"><Plus size={18} /></button>
                              </div>
                          </div>
                          <div className="relative"><label className={LABEL_CLASS}>Motorista 2° Veículo</label><div className="relative"><input type="text" className={INPUT_CLASS} placeholder="Nome do 2° condutor..." value={formData.driver_name_2} onChange={e => setFormData({...formData, driver_name_2: e.target.value.toUpperCase()})} data-testid="input-driver-name-2" /><User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400" /></div></div>
                          <div className="relative"><label className={LABEL_CLASS}>Telefone 2° Motorista</label><div className="relative"><input type="text" className={INPUT_CLASS} placeholder="(00) 00000-0000" maxLength={15} value={formData.driver_phone_2} onChange={e => { const digits = e.target.value.replace(/\D/g, '').slice(0, 11); let masked = ''; if (digits.length > 0) { masked = '(' + digits.slice(0, 2); if (digits.length > 2) { masked += ') ' + digits.slice(2, digits.length > 10 ? 7 : 6); if (digits.length > (digits.length > 10 ? 7 : 6)) masked += '-' + digits.slice(digits.length > 10 ? 7 : 6); } } setFormData({...formData, driver_phone_2: masked}); }} data-testid="input-driver-phone-2" /><Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" /></div></div>
                      </div>
                  )}
              </div>
              )}
              </div>
              )}

              {/* ETAPA 4 - FORNECEDOR */}
              {canShowStep4 && (
              <div className="p-4 space-y-3">
                  {STEP_HEADER(4, 'Fornecedor (Parceiro de Escolta)', <Briefcase size={16} className={stepComplete.step4 ? 'text-green-600' : 'text-red-600'} />, stepComplete.step4, !stepComplete.step4)}
                  {expandedStep === 4 && (
                  <div className="space-y-4 animate-in slide-in-from-top-1 duration-200">

                  {formData.missionType && (
                      <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider ${formData.missionType === 'Velada' ? 'bg-gray-900 text-white' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                          {formData.missionType === 'Velada' ? <ShieldCheck size={14} /> : <Siren size={14} />}
                          Exibindo fornecedores de {formData.missionType === 'Velada' ? 'Escolta Velada / Pronta Resposta' : 'Escolta Caracterizada'}
                          <span className="ml-auto text-[9px] opacity-60">({providersByType.length} disponíveis)</span>
                      </div>
                  )}

                  {iblWarning && (
                      <div className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-2 shadow-lg animate-pulse">
                          <ShieldAlert size={16} /> {iblWarning}
                      </div>
                  )}

                  {isCommercialUser ? (
                      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-500">
                          <Briefcase size={16} className="text-gray-400" />
                          {formData.provider || 'Definido pela equipe operacional'}
                      </div>
                  ) : (
                  <div className="space-y-3">
                      <div className="flex gap-2">
                          <div className="relative flex-1">
                              <input type="text" className={INPUT_CLASS} placeholder="Filtrar Fornecedor..." value={providerSearchTerm} onChange={e => { setProviderSearchTerm(e.target.value); setProviderPending(false); setActiveDropdown('provider'); }} onFocus={() => setActiveDropdown('provider')} data-testid="input-provider" />
                              <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              {activeDropdown === 'provider' && (
                                  <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-96 overflow-y-auto ring-1 ring-black/5">
                                      {filteredProviders.map(p => (
                                          <button key={p.id} type="button" onClick={() => handleProviderSelection(p.name)} className={DROPDOWN_ITEM_CLASS}>
                                              <span className="flex items-center gap-2"><Shield size={14} className="text-red-500" />{formatProviderName(p.name, p.trading_name)}</span>
                                          </button>
                                      ))}
                                      {filteredProviders.length === 0 && <p className="px-4 py-3 text-xs text-gray-400 font-bold">Nenhum fornecedor encontrado</p>}
                                  </div>
                              )}
                          </div>
                          <button type="button" onClick={() => setIsProviderModalOpen(true)} className="p-3 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-all shadow-sm active:scale-95" data-testid="button-add-provider"><Plus size={20} /></button>
                      </div>

                      {!formData.provider && !providerPending && (
                          <button type="button" onClick={() => { setProviderPending(true); showNotification('Fornecedor', 'Prosseguindo sem fornecedor. Você poderá atribuir posteriormente.', 'info'); }} className="w-full py-3 bg-amber-50 text-amber-700 border-2 border-amber-300 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-100 transition-all flex items-center justify-center gap-2 active:scale-[0.98]" data-testid="button-provider-pending">
                              <Clock size={16} />
                              AGUARDANDO INFORMAÇÃO — PULAR ETAPA
                          </button>
                      )}

                      {providerPending && !formData.provider && (
                          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                              <Clock size={14} className="text-amber-600" />
                              <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Fornecedor pendente — será definido depois</span>
                              <button type="button" onClick={() => setProviderPending(false)} className="ml-auto text-amber-500 hover:text-amber-700"><X size={14}/></button>
                          </div>
                      )}
                  </div>
                  )}
              </div>
              )}
              </div>
              )}

              {/* ETAPA 5 - ROTA (ORIGEM x DESTINO) */}
              {canShowStep5 && (
              <div className="p-4 space-y-3">
                  {STEP_HEADER(5, 'Rota (Origem x Destino)', <Navigation size={16} className={stepComplete.step5 ? 'text-green-600' : 'text-red-600'} />, stepComplete.step5, !stepComplete.step5)}
                  {expandedStep === 5 && (
                  <div className="space-y-5 animate-in slide-in-from-top-1 duration-200">

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative">
                          <label className={LABEL_CLASS}>Endereço de Origem (Ponto A) *</label>
                          <div className="relative">
                              {isGoogleLoaded ? (
                                  <Autocomplete
                                      onLoad={ac => { originAutocompleteRef.current = ac; }}
                                      onPlaceChanged={() => {
                                          const place = originAutocompleteRef.current?.getPlace();
                                          if (place?.formatted_address) setFormData(prev => ({...prev, origin: place.formatted_address!.toUpperCase()}));
                                      }}
                                      options={{ componentRestrictions: { country: 'br' } }}
                                  >
                                      <input type="text" className={`${INPUT_CLASS} font-bold uppercase`} placeholder="Digite o endereço de origem..." data-testid="input-origin" />
                                  </Autocomplete>
                              ) : (
                                  <input type="text" className={`${INPUT_CLASS} font-bold uppercase`} placeholder="Ex: Rua das Flores, 100 - São Paulo, SP" value={formData.origin} onChange={e => setFormData(prev => ({...prev, origin: e.target.value}))} data-testid="input-origin" />
                              )}
                              <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-red-500 pointer-events-none z-10" />
                          </div>
                      </div>
                      <div className="relative">
                          <label className={LABEL_CLASS}>Endereço de Destino (Ponto B) *</label>
                          <div className="relative">
                              {isGoogleLoaded ? (
                                  <Autocomplete
                                      onLoad={ac => { destinationAutocompleteRef.current = ac; }}
                                      onPlaceChanged={() => {
                                          const place = destinationAutocompleteRef.current?.getPlace();
                                          if (place?.formatted_address) setFormData(prev => ({...prev, destination: place.formatted_address!.toUpperCase()}));
                                      }}
                                      options={{ componentRestrictions: { country: 'br' } }}
                                  >
                                      <input type="text" className={`${INPUT_CLASS} font-bold uppercase`} placeholder="Digite o endereço de destino..." data-testid="input-destination" />
                                  </Autocomplete>
                              ) : (
                                  <input type="text" className={`${INPUT_CLASS} font-bold uppercase`} placeholder="Ex: Av. Brasil, 500 - Jundiaí, SP" value={formData.destination} onChange={e => setFormData(prev => ({...prev, destination: e.target.value}))} data-testid="input-destination" />
                              )}
                              <Flag size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none z-10" />
                          </div>
                          {isDhlClient && (
                            <div className="mt-2 space-y-1.5">
                              <p className="text-[9px] font-black text-yellow-700 uppercase tracking-wider text-center">
                                {formData.raioKm > 0 ? `Raio ${formData.raioKm} km aplicado — toque para refazer` : 'Não sei o destino — escolha o raio'}
                              </p>
                              <div className="grid grid-cols-3 gap-1.5">
                                {[100, 200, 300].map((km) => (
                                  <button
                                    key={km}
                                    type="button"
                                    data-testid={`button-dhl-raio-${km}`}
                                    onClick={() => {
                                      if (!formData.origin) { alert('Informe primeiro o endereço de origem.'); return; }
                                      const virtualRoute: any = {
                                        id: `dhl-raio-${km}`,
                                        name: `DHL — Raio ${km} km`,
                                        origin: formData.origin,
                                        destination: `RAIO ${km} KM — DESTINO A DEFINIR`,
                                        distance: String(km),
                                        toll_cost: 0,
                                      };
                                      setSelectedRouteId(`dhl-raio-${km}`);
                                      setRouteSearchTerm(`DHL — Raio ${km} km`);
                                      setActiveDropdown(null);
                                      setTollDetails(null);
                                      setOperatorConfirmedCalc(false);
                                      setFormData(prev => ({ ...prev, applyCeva200km: true, raioKm: km, destination: `RAIO ${km} KM — DESTINO A DEFINIR`, tollValue: '0' }));
                                      calculatePricing(virtualRoute, undefined, '', '', { ceva200km: true, vtc02h: false, isSameOs: formData.isSameOs, raioKm: km });
                                    }}
                                    className={`px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-1 ${
                                      formData.raioKm === km
                                        ? 'bg-orange-600 text-white shadow-md'
                                        : 'bg-yellow-50 border border-yellow-400 text-yellow-700 hover:bg-yellow-100'
                                    }`}
                                  >
                                    <TrendingUp size={12} />
                                    {km} KM
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                  </div>

                  {clientRoutes.length > 0 && (
                      <div className="space-y-2">
                          <div className="flex items-center gap-2">
                              <div className="flex-1 h-px bg-gray-200"></div>
                              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-2">ou selecionar rota cadastrada</span>
                              <div className="flex-1 h-px bg-gray-200"></div>
                          </div>
                          <div className="flex gap-2">
                              <div className="relative flex-1">
                                  <input type="text" className={INPUT_CLASS} placeholder="Buscar rota cadastrada (Ex: PERUS)..." value={routeSearchTerm} onChange={e => { setRouteSearchTerm(e.target.value); setActiveDropdown('route'); }} onFocus={() => setActiveDropdown('route')} data-testid="input-route-search" />
                                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                  {activeDropdown === 'route' && filteredRoutes.length > 0 && (
                                      <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto ring-1 ring-black/5">
                                          {filteredRoutes.map(r => (
                                              <div key={r.id} onClick={() => handleRouteSelect(r)} className="p-3 border-b border-gray-50 hover:bg-red-50 cursor-pointer transition-colors group" data-testid={`option-route-${r.id}`}>
                                                  <div className="flex items-center justify-between">
                                                      <p className="font-bold text-xs text-gray-800 uppercase group-hover:text-red-700">{r.name}</p>
                                                      <span className="text-[9px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{r.distance} KM</span>
                                                  </div>
                                                  <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5 flex items-center gap-1">
                                                      <MapPin size={10} className="text-red-400"/> {r.origin.split(',')[0]} <ArrowRight size={10} className="text-gray-300 mx-1"/> <Flag size={10} className="text-blue-400"/> {r.destination.split(',')[0]}
                                                  </p>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>
                              <button type="button" onClick={() => setIsRouteModalOpen(true)} className="p-3 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-all shadow-md active:scale-95" title="Cadastrar nova rota" data-testid="button-add-route"><Plus size={20} /></button>
                          </div>
                          {selectedRouteId && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg animate-in fade-in">
                                  <Check size={14} className="text-green-600" />
                                  <span className="text-[10px] font-black text-green-700 uppercase tracking-wider">Rota selecionada: {routeSearchTerm}</span>
                                  <button type="button" onClick={() => { setSelectedRouteId(''); setRouteSearchTerm(''); setFormData(prev => ({...prev, origin: '', destination: '', totalDistance: '', estimatedTime: ''})); setCalcDetails(''); }} className="ml-auto text-green-500 hover:text-red-500 transition-colors" data-testid="button-clear-route"><X size={14}/></button>
                              </div>
                          )}
                      </div>
                  )}

                  {!clientRoutes.length && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                          <Info size={14} className="text-gray-400 shrink-0" />
                          <span className="text-[10px] font-bold text-gray-500">Nenhuma rota cadastrada para este cliente.</span>
                          <button type="button" onClick={() => setIsRouteModalOpen(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded-lg text-[10px] font-black uppercase hover:bg-red-800 transition-all active:scale-95" data-testid="button-create-first-route"><Plus size={14} /> Nova Rota</button>
                      </div>
                  )}

                  {formData.origin && routesFilteredByOrigin.length < clientRoutes.length && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[9px] font-black text-amber-700 uppercase tracking-wider">
                          <Search size={12} /> Rotas filtradas pela origem: {formData.origin.split(',')[0]} ({routesFilteredByOrigin.length} de {clientRoutes.length})
                      </div>
                  )}

                  {(formData.origin && formData.destination) && (
                      <div className="bg-gray-900 rounded-2xl p-5 text-white relative overflow-hidden group border border-gray-800 shadow-lg">
                          <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">
                                      <MapPin size={12} className="text-red-400 shrink-0" />
                                      <span className="truncate">{formData.origin.split(',')[0]}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                      <Flag size={12} className="text-blue-400 shrink-0" />
                                      <span className="truncate">{formData.destination.split(',')[0]}</span>
                                  </div>
                              </div>
                              <div className="text-center px-4">
                                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Distância</p>
                                  <div className="flex items-baseline gap-1">
                                      <span className="text-3xl font-black">{formData.totalDistance || '-'}</span>
                                      <span className="text-xs font-bold text-gray-500">KM</span>
                                  </div>
                              </div>
                              <div className="text-center px-4 border-l border-gray-700">
                                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Tempo Est.</p>
                                  <div className="flex items-baseline gap-1">
                                      <Clock size={14} className="text-gray-500" />
                                      <span className="text-lg font-black">{formData.estimatedTime || '-'}</span>
                                  </div>
                              </div>
                          </div>
                          {isCalculating && <div className="mt-3 flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin text-red-500"/><span className="text-[9px] text-gray-500 font-bold">Calculando rota...</span></div>}
                          <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:scale-110 transition-transform"><Ruler size={80}/></div>
                      </div>
                  )}

                  {/* PEDÁGIO - STATUS DE CARREGAMENTO */}
                  {selectedRouteId && isCalculatingToll && (
                      <div className="flex items-center gap-3 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl animate-pulse">
                          <Loader2 size={18} className="animate-spin text-amber-600" />
                          <div>
                              <p className="text-[11px] font-black text-amber-800 uppercase">Calculando pedágio...</p>
                              <p className="text-[9px] text-amber-600 font-bold">Aguarde. A OS não pode ser gerada sem o valor do pedágio.</p>
                          </div>
                      </div>
                  )}

                  {selectedRouteId && !isCalculatingToll && parseFloat(formData.tollValue) === 0 && !manualOverrides.toll && (
                      <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-3">
                          <div className="flex items-center gap-2">
                              <AlertTriangle size={16} className="text-amber-600" />
                              <p className="text-[11px] font-black text-amber-800 uppercase">Pedágio: R$ 0,00</p>
                          </div>
                          <p className="text-[9px] text-amber-600 font-bold">Nenhum pedágio identificado nesta rota. Se houver, informe o valor abaixo. Caso contrário, pode prosseguir normalmente.</p>
                          <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-amber-700">R$</span>
                              <input type="number" step="0.01" className="flex-1 px-3 py-2 border-2 border-amber-300 rounded-lg text-sm font-black text-amber-900 bg-white focus:border-amber-500 outline-none" placeholder="0.00" value={formData.tollValue === '0' ? '' : formData.tollValue} onChange={e => { setFormData(prev => ({ ...prev, tollValue: e.target.value || '0' })); setManualOverrides(prev => ({ ...prev, toll: true })); }} data-testid="input-toll-manual" />
                          </div>
                      </div>
                  )}

                  {selectedRouteId && (
                      <div className="space-y-4 pt-2 border-t border-gray-100 mt-4 animate-in slide-in-from-top-2">
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2"><Tag size={12} /> Selecionar Tabelas</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className={LABEL_CLASS}>Tabela de Faturamento (Cliente) {manualRevenueTableId && <span className="text-green-600">✓</span>}</label>
                                  <div className="relative">
                                      <select className={SELECT_CLASS} value={manualRevenueTableId} onChange={e => handleManualTableChange('rev', e.target.value)} data-testid="select-revenue-table-step5">
                                          <option value="">Selecione a tabela...</option>
                                          {clientPriceTables.map(t => (<option key={t.id} value={t.id}>{t.operation_type} ({t.franchise_km || 0}KM / {t.franchise_hours || 0}h)</option>))}
                                      </select>
                                      <Tag size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500 opacity-50 pointer-events-none" />
                                      <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                  </div>
                                  {manualRevenueTableId && (() => { const t = clientPriceTables.find(pt => pt.id.toString() === manualRevenueTableId); return t ? <p className="text-[8px] font-bold text-green-600 mt-1">Franquia: {t.franchise_km}KM / {t.franchise_hours || '—'}h | Extra KM: R${t.price_per_extra_km || 0} | Extra Hora: R${t.price_per_extra_hour || 0}</p> : null; })()}
                              </div>
                              <div>
                                  <label className={LABEL_CLASS}>Tabela de Custo (Fornecedor) {manualCostTableId && <span className="text-red-600">✓</span>}</label>
                                  <div className="relative">
                                      <select className={SELECT_CLASS} value={manualCostTableId} onChange={e => handleManualTableChange('cst', e.target.value)} disabled={!formData.provider || formData.isSameOs} data-testid="select-cost-table-step5">
                                          <option value="">{formData.isSameOs ? 'CUSTO ZERADO (MESMA OS)' : formData.provider ? 'Selecione a tabela...' : providerPending ? 'FORNECEDOR PENDENTE' : 'Selecione o fornecedor primeiro'}</option>
                                          {providerCostTables.map(t => (<option key={t.id} value={t.id}>{t.operation_type} ({t.franchise_km || 0}KM / {t.franchise_hours || 0}h)</option>))}
                                      </select>
                                      <Tag size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-red-500 opacity-50 pointer-events-none" />
                                      <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                  </div>
                                  {manualCostTableId && !formData.isSameOs && (() => { const t = providerCostTables.find(pt => pt.id.toString() === manualCostTableId); return t ? <p className="text-[8px] font-bold text-red-600 mt-1">Franquia: {t.franchise_km}KM / {t.franchise_hours || '—'}h | Extra KM: R${t.cost_per_extra_km || 0} | Extra Hora: R${t.cost_per_extra_hour || 0}</p> : null; })()}
                              </div>
                          </div>

                          {/* RESUMO CLARO PARA CONFIRMAÇÃO DO OPERADOR */}
                          {manualRevenueTableId && tollLoaded && (
                              <div className={`p-4 rounded-xl border-2 space-y-3 ${operatorConfirmedCalc ? 'bg-green-50 border-green-300' : 'bg-blue-50 border-blue-300'}`}>
                                  <div className="flex items-center gap-2">
                                      <AlertCircle size={16} className={operatorConfirmedCalc ? 'text-green-700' : 'text-blue-700'} />
                                      <p className="text-[11px] font-black uppercase text-gray-800">Confira os dados antes de avançar</p>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2 text-[10px] font-bold text-gray-700">
                                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200">
                                          <Ruler size={12} className="text-blue-500 shrink-0" />
                                          <span className="font-black text-gray-900">Distância:</span>
                                          <span>{formData.totalDistance} KM</span>
                                          <span className="text-gray-400">|</span>
                                          <span className="font-black text-gray-900">Tempo:</span>
                                          <span>{formData.estimatedTime}</span>
                                      </div>
                                      {(() => {
                                          const rt = clientPriceTables.find(pt => pt.id.toString() === manualRevenueTableId);
                                          if (!rt) return null;
                                          const dist = parseFloat(formData.totalDistance) || 0;
                                          const cobreKm = rt.franchise_km || 0;
                                          return (
                                              <div className="flex items-start gap-2 px-3 py-2 bg-white rounded-lg border border-green-200">
                                                  <DollarSign size={12} className="text-green-500 shrink-0 mt-0.5" />
                                                  <div>
                                                      <p><span className="font-black text-green-800">Faturamento:</span> {rt.operation_type}</p>
                                                      <p className="text-[9px] text-gray-500">Franquia de {cobreKm}KM {dist > cobreKm ? `— excede em ${(dist - cobreKm).toFixed(0)}KM` : `— cobre os ${dist.toFixed(0)}KM`}</p>
                                                  </div>
                                              </div>
                                          );
                                      })()}
                                      {manualCostTableId && !formData.isSameOs && (() => {
                                          const ct = providerCostTables.find(pt => pt.id.toString() === manualCostTableId);
                                          if (!ct) return null;
                                          const dist = parseFloat(formData.totalDistance) || 0;
                                          const cobreKm = ct.franchise_km || 0;
                                          return (
                                              <div className="flex items-start gap-2 px-3 py-2 bg-white rounded-lg border border-red-200">
                                                  <DollarSign size={12} className="text-red-500 shrink-0 mt-0.5" />
                                                  <div>
                                                      <p><span className="font-black text-red-800">Custo:</span> {ct.operation_type}</p>
                                                      <p className="text-[9px] text-gray-500">Franquia de {cobreKm}KM {dist > cobreKm ? `— excede em ${(dist - cobreKm).toFixed(0)}KM` : `— cobre os ${dist.toFixed(0)}KM`}</p>
                                                  </div>
                                              </div>
                                          );
                                      })()}
                                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200">
                                          <Navigation size={12} className="text-green-500 shrink-0" />
                                          <span className="font-black text-gray-900">Pedágio:</span>
                                          <span>R$ {parseFloat(formData.tollValue || '0').toFixed(2)}</span>
                                          {tollDetails?.provider === 'gemini-ai' && <span className="text-[8px] text-purple-600 font-black">(via IA)</span>}
                                          {manualOverrides.toll && <span className="text-[8px] text-amber-600 font-black">(manual)</span>}
                                      </div>
                                  </div>
                                  {!operatorConfirmedCalc ? (
                                      <button type="button" onClick={() => setOperatorConfirmedCalc(true)} className="w-full py-3 bg-blue-600 text-white rounded-xl text-[11px] font-black uppercase tracking-wider hover:bg-blue-700 transition-all active:scale-[0.98] shadow-lg" data-testid="button-confirm-calc">
                                          <Check size={14} className="inline mr-2" />Li e confirmo que os dados estão corretos
                                      </button>
                                  ) : (
                                      <div className="flex items-center justify-between">
                                          <p className="text-[10px] font-black text-green-700 flex items-center gap-1.5"><CheckCircle2 size={14} /> Confirmado pelo operador</p>
                                          <button type="button" onClick={() => setOperatorConfirmedCalc(false)} className="text-[9px] font-bold text-gray-500 hover:text-red-600 underline">Revisar novamente</button>
                                      </div>
                                  )}
                              </div>
                          )}

                          {!manualRevenueTableId && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[9px] font-black text-amber-700 uppercase">
                                  <Info size={12} /> Selecione ao menos a tabela de faturamento para avançar
                              </div>
                          )}
                      </div>
                  )}
              </div>
              )}
              </div>
              )}

              {/* ETAPA 6 - AGENDAMENTO (IMEDIATA OU AGENDADA) */}
              {canShowStep6 && (
              <div className="p-4 space-y-3">
                  {STEP_HEADER(6, 'Agendamento', <Calendar size={16} className={stepComplete.step6 ? 'text-green-600' : 'text-red-600'} />, stepComplete.step6, !stepComplete.step6)}
                  {expandedStep === 6 && (
                  <div className="space-y-4 animate-in slide-in-from-top-1 duration-200">

                  {scheduleMode === 'asking' && (
                      <div className="p-4 bg-orange-50 border-2 border-orange-200 rounded-xl space-y-3 animate-in slide-in-from-top-2">
                          <p className="text-[11px] font-black text-orange-800 uppercase tracking-wider flex items-center gap-2"><Clock size={14} /> Esta missão é imediata ou agendada?</p>
                          <div className="grid grid-cols-2 gap-3">
                              <button type="button" onClick={() => { const now = new Date(); setFormData(prev => ({ ...prev, scheduledDate: now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), scheduledTime: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) })); setScheduleMode('immediate'); }} className="py-4 bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-red-800 transition-all active:scale-95 flex flex-col items-center gap-2 shadow-md" data-testid="button-schedule-immediate">
                                  <Zap size={20} />
                                  <span>Imediata</span>
                                  <span className="text-[9px] font-medium opacity-70 normal-case">Saída agora</span>
                              </button>
                              <button type="button" onClick={() => setScheduleMode('scheduled')} className="py-4 bg-white text-gray-700 border-2 border-gray-200 rounded-xl font-black text-xs uppercase tracking-wider hover:border-gray-400 transition-all active:scale-95 flex flex-col items-center gap-2" data-testid="button-schedule-later">
                                  <Calendar size={20} className="text-blue-600" />
                                  <span>Agendada</span>
                                  <span className="text-[9px] font-medium text-gray-400 normal-case">Definir data e hora</span>
                              </button>
                          </div>
                      </div>
                  )}

                  {scheduleMode === 'immediate' && (
                      <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl animate-in fade-in">
                          <Zap size={16} className="text-green-600" />
                          <div>
                              <p className="text-[10px] font-black text-green-700 uppercase tracking-wider">Missão Imediata</p>
                              <p className="text-[9px] font-bold text-green-600">Horário definido: {formData.scheduledDate} às {formData.scheduledTime}</p>
                          </div>
                          <button type="button" onClick={() => setScheduleMode('asking')} className="ml-auto text-green-500 hover:text-orange-600 text-[10px] font-bold uppercase">Alterar</button>
                      </div>
                  )}

                  {scheduleMode === 'scheduled' && (
                      <div className="space-y-4 animate-in slide-in-from-top-2">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="relative"><label className={LABEL_CLASS}>Data do Agendamento *</label><div className="relative"><input type="date" required min={new Date().toLocaleDateString('en-CA')} className={INPUT_CLASS} value={formData.scheduledDate} onChange={e => setFormData({...formData, scheduledDate: e.target.value})} data-testid="input-scheduled-date" /><Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" /></div></div>
                              <div className="relative"><label className={LABEL_CLASS}>Horário *</label><div className="relative"><input type="time" required className={INPUT_CLASS} value={formData.scheduledTime} onChange={e => setFormData({...formData, scheduledTime: e.target.value})} data-testid="input-scheduled-time" /><Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" /></div></div>
                          </div>
                          {isScheduledInPast && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                                  <AlertTriangle size={14} className="text-red-500 shrink-0" />
                                  <p className="text-[10px] font-bold text-red-600">Não é possível agendar no passado. Selecione uma data/horário futura.</p>
                              </div>
                          )}
                          <button type="button" onClick={() => setScheduleMode('asking')} className="text-[10px] font-bold text-gray-400 hover:text-orange-600 uppercase">← Voltar para escolher tipo</button>
                      </div>
                  )}

                  {hasClientRules && (scheduleMode === 'immediate' || scheduleMode === 'scheduled') && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                          <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Regras do cliente detectadas:</p>
                          {isVtcClient && (
                              <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-100">
                                  <div className="flex items-center gap-2">
                                      <Clock size={14} className="text-blue-600" />
                                      <span className="text-[11px] font-black text-gray-700 uppercase">Regra 02H VTC</span>
                                  </div>
                                  <div className="flex gap-2">
                                      <button type="button" onClick={() => { setFormData(prev => ({ ...prev, applyVtc02h: true })); const route = clientRoutes.find(r => r.id.toString() === selectedRouteId); if (route) calculatePricing(route, undefined, manualRevenueTableId, '', { ceva200km: formData.applyCeva200km, vtc02h: true, isSameOs: formData.isSameOs }); }} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all active:scale-95 ${formData.applyVtc02h ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`} data-testid="button-vtc-yes">Sim</button>
                                      <button type="button" onClick={() => { setFormData(prev => ({ ...prev, applyVtc02h: false })); const route = clientRoutes.find(r => r.id.toString() === selectedRouteId); if (route) calculatePricing(route, undefined, manualRevenueTableId, '', { ceva200km: formData.applyCeva200km, vtc02h: false, isSameOs: formData.isSameOs }); }} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all active:scale-95 ${!formData.applyVtc02h ? 'bg-gray-900 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`} data-testid="button-vtc-no">Não</button>
                                  </div>
                              </div>
                          )}
                          {(formData.client || '').toUpperCase().includes('CEVA') && (
                              <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-orange-100">
                                  <div className="flex items-center gap-2">
                                      <TrendingUp size={14} className="text-orange-600" />
                                      <span className="text-[11px] font-black text-gray-700 uppercase">Regra 200KM</span>
                                  </div>
                                  <div className="flex gap-2">
                                      <button type="button" onClick={() => { setFormData(prev => ({ ...prev, applyCeva200km: true })); const route = clientRoutes.find(r => r.id.toString() === selectedRouteId); if (route) calculatePricing(route, undefined, manualRevenueTableId, '', { ceva200km: true, vtc02h: formData.applyVtc02h, isSameOs: formData.isSameOs }); }} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all active:scale-95 ${formData.applyCeva200km ? 'bg-orange-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`} data-testid="button-200km-yes">Sim</button>
                                      <button type="button" onClick={() => { setFormData(prev => ({ ...prev, applyCeva200km: false })); const route = clientRoutes.find(r => r.id.toString() === selectedRouteId); if (route) calculatePricing(route, undefined, manualRevenueTableId, '', { ceva200km: false, vtc02h: formData.applyVtc02h, isSameOs: formData.isSameOs }); }} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all active:scale-95 ${!formData.applyCeva200km ? 'bg-gray-900 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`} data-testid="button-200km-no">Não</button>
                                  </div>
                              </div>
                          )}
                      </div>
                  )}

              </div>
              )}
              </div>
              )}

              {/* SEÇÕES FINAIS - FINANCEIRO, EVIDÊNCIAS */}
              {stepComplete.step6 && (
              <div className="p-6 space-y-6">

                  {/* RESUMO INTELIGENTE DA OPERAÇÃO */}
                  {(() => {
                      const dist = parseFloat(formData.totalDistance) || 0;
                      const originCity = normalizeStr((formData.origin || '').split(',')[0].trim());
                      const geoInfo = CITY_MAP[originCity] || { uf: '', region: '' };
                      const uf = extractUF(formData.origin || '') || geoInfo.uf;
                      const region = UF_TO_REGION[uf] || geoInfo.region;
                      const isVelada = formData.missionType === 'Velada';

                      const revTable = clientPriceTables.find(t => t.id.toString() === manualRevenueTableId);
                      const cstTable = providerCostTables.find(t => t.id.toString() === manualCostTableId);
                      const revName = (revTable?.operation_type || '').toUpperCase();
                      const cstName = (cstTable?.operation_type || '').toUpperCase();

                      const warnings: string[] = [];
                      if (isVelada && revName.includes('CARACTERIZ')) warnings.push('Tipo VELADA, mas tabela de faturamento parece ser CARACTERIZADA');
                      if (!isVelada && revName.includes('VELAD')) warnings.push('Tipo CARACTERIZADA, mas tabela de faturamento parece ser VELADA');
                      if (revTable && dist > 0 && revTable.franchise_km > 0 && dist > revTable.franchise_km * 1.5) warnings.push(`KM real (${dist}) excede muito a franquia da tabela FAT (${revTable.franchise_km} KM)`);
                      if (cstTable && dist > 0 && cstTable.franchise_km > 0 && dist > cstTable.franchise_km * 1.5) warnings.push(`KM real (${dist}) excede muito a franquia da tabela CUSTO (${cstTable.franchise_km} KM)`);
                      if (revName.includes('LOGITECH') && !formData.destination.toUpperCase().includes('LOGITECH')) warnings.push('Tabela LOGITECH selecionada, mas destino não é Logitech');

                      return (
                          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
                              <div className="flex items-center gap-2 mb-1">
                                  <div className="p-1.5 bg-red-600 rounded-lg"><Zap size={12} className="text-white" /></div>
                                  <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Resumo da Operação</span>
                                  {warnings.length > 0 && <span className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-lg text-[9px] font-black text-amber-600 uppercase"><AlertTriangle size={10} /> {warnings.length} alerta{warnings.length > 1 ? 's' : ''}</span>}
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div className={`p-3 rounded-xl border ${isVelada ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
                                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Tipo</p>
                                      <p className="text-sm font-black text-gray-800">{isVelada ? 'Velada' : 'Caracterizada'}</p>
                                      <p className="text-[8px] text-gray-400 font-bold mt-1">{isVelada ? '01/02 ARMADOS' : 'Faixa de KM'}</p>
                                  </div>
                                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Distância</p>
                                      <p className="text-sm font-black text-gray-800">{dist > 0 ? `${dist} KM` : '-'}</p>
                                      <p className="text-[8px] text-gray-400 font-bold mt-1">{formData.estimatedTime || '-'}</p>
                                  </div>
                                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Região</p>
                                      <p className="text-sm font-black text-gray-800">{region || '-'}</p>
                                      <p className="text-[8px] text-gray-400 font-bold mt-1">{uf ? `UF: ${uf}` : '-'}</p>
                                  </div>
                                  <div className={`p-3 rounded-xl border ${manualOverrides.toll ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Pedágio {manualOverrides.toll && <span className="text-amber-600">(Manual)</span>}</p>
                                      <div className="flex items-center gap-1">
                                          <span className="text-[10px] font-black text-gray-400">R$</span>
                                          <input type="number" step="0.01" className="bg-transparent outline-none text-sm font-black text-gray-800 w-20" value={formData.tollValue} onChange={e => { setFormData(prev => ({ ...prev, tollValue: e.target.value })); setManualOverrides(prev => ({ ...prev, toll: true })); }} data-testid="input-toll-summary" />
                                      </div>
                                      <p className="text-[8px] text-gray-400 font-bold mt-1">{manualOverrides.toll ? 'Editado pelo usuário' : tollDetails ? (tollDetails.count === 0 ? `Sem pedágio · ${tollDetails.provider === 'gemini-ai' ? 'IA' : 'API'}` : `${tollDetails.count} praça${tollDetails.count > 1 ? 's' : ''} · ${tollDetails.provider === 'gemini-ai' ? 'IA' : 'API'}`) : isCalculatingToll ? 'Calculando...' : 'Via API'}</p>
                                      {tollDetails?.confianca && !manualOverrides.toll && <p className={`text-[7px] font-black uppercase mt-1 ${tollDetails.confianca === 'alta' ? 'text-green-600' : tollDetails.confianca === 'media' ? 'text-yellow-600' : 'text-red-600'}`}>Conf: {tollDetails.confianca}</p>}
                                      {manualOverrides.toll && <button type="button" onClick={() => { setManualOverrides(prev => ({ ...prev, toll: false })); const route = clientRoutes.find(r => r.id.toString() === selectedRouteId); if (route) { setTollDetails(null); calculateTollFromAPI(route.origin, route.destination).then(r => { if (r && typeof r.value === 'number') { setFormData(prev => ({ ...prev, tollValue: r.value.toFixed(2) })); setTollDetails({ count: r.count, tolls: r.tolls, observacoes: r.observacoes, confianca: r.confianca, provider: r.provider }); } }); } }} className="text-[7px] font-bold text-amber-600 hover:text-amber-500 underline mt-1">Recalcular via IA</button>}
                                  </div>
                              </div>

                              {/* DETALHAMENTO PRAÇAS DE PEDÁGIO */}
                              {tollDetails && tollDetails.tolls.length > 0 && (
                                  <div className="pt-3 border-t border-gray-100 space-y-2">
                                      <div className="flex items-center justify-between">
                                          <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                                              <Navigation size={10} />
                                              Praças de Pedágio Identificadas
                                              {tollDetails.provider === 'gemini-ai' && <span className="px-1.5 py-0.5 bg-purple-50 border border-purple-200 rounded text-[7px] text-purple-600">via Gemini IA</span>}
                                          </p>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                          {tollDetails.tolls.map((t: any, i: number) => (
                                              <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                                                  <div className="flex-1 min-w-0">
                                                      <p className="text-[9px] font-bold text-gray-700 truncate">{t.name}</p>
                                                      <p className="text-[7px] text-gray-400 font-bold">{t.road}{t.sentido ? ` · ${t.sentido}` : ''}{t.cobrancaUnica ? ' · Unidirecional' : ''}</p>
                                                  </div>
                                                  <span className="text-[10px] font-black text-green-600 ml-2">R$ {(t.value || 0).toFixed(2)}</span>
                                              </div>
                                          ))}
                                      </div>
                                      {tollDetails.observacoes && (
                                          <p className="text-[8px] text-gray-400 italic px-1">{tollDetails.observacoes}</p>
                                      )}
                                  </div>
                              )}

                              {/* TABELAS SELECIONADAS COM DETALHES */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                                  <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                                      <div className="flex items-center justify-between mb-2">
                                          <p className="text-[8px] font-black text-green-600 uppercase tracking-widest">Tabela Faturamento (Cliente)</p>
                                          <button type="button" onClick={() => setExpandedStep(5)} className="text-[8px] font-bold text-green-600 hover:text-green-500 underline uppercase">Alterar</button>
                                      </div>
                                      {revTable ? (
                                          <>
                                              <p className="text-[11px] font-black text-gray-800 truncate">{revTable.operation_type}</p>
                                              <p className="text-[9px] text-gray-500 font-bold mt-1">{revTable.franchise_km || 0}KM / {revTable.franchise_hours || 0}h</p>
                                          </>
                                      ) : <p className="text-[10px] text-gray-400 font-bold">Não selecionada</p>}
                                  </div>
                                  <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                                      <div className="flex items-center justify-between mb-2">
                                          <p className="text-[8px] font-black text-red-600 uppercase tracking-widest">Tabela Custo (Fornecedor)</p>
                                          <button type="button" onClick={() => setExpandedStep(5)} className="text-[8px] font-bold text-red-600 hover:text-red-500 underline uppercase">Alterar</button>
                                      </div>
                                      {cstTable && !formData.isSameOs ? (
                                          <>
                                              <p className="text-[11px] font-black text-gray-800 truncate">{cstTable.operation_type}</p>
                                              <p className="text-[9px] text-gray-500 font-bold mt-1">{cstTable.franchise_km || 0}KM / {cstTable.franchise_hours || 0}h</p>
                                          </>
                                      ) : <p className="text-[10px] text-gray-400 font-bold">{formData.isSameOs ? 'MESMA OS (Zerado)' : providerPending ? 'Fornecedor pendente' : 'Não selecionada'}</p>}
                                  </div>
                              </div>

                              {/* ALERTAS */}
                              {warnings.length > 0 && (
                                  <div className="space-y-2 pt-3 border-t border-amber-100">
                                      {warnings.map((w, i) => (
                                          <div key={i} className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                                              <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                                              <p className="text-[9px] font-bold text-amber-700">{w}</p>
                                              <button type="button" onClick={() => setExpandedStep(5)} className="ml-auto text-[8px] font-black text-amber-600 hover:text-amber-500 uppercase underline whitespace-nowrap">Corrigir</button>
                                          </div>
                                      ))}
                                  </div>
                              )}

                              {calcDetails && (
                                  <div className="pt-3 border-t border-gray-100 space-y-2">
                                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Critérios da Seleção Inteligente</p>
                                      <div className="flex flex-wrap gap-1.5">
                                          {calcDetails.split(' | ').map((d, i) => (
                                              <span key={i} className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide ${d.includes('FAT') ? 'bg-green-50 text-green-700 border border-green-200' : d.includes('CUSTO') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>{d}</span>
                                          ))}
                                      </div>
                                  </div>
                              )}
                          </div>
                      );
                  })()}


                  <div className="pt-4 border-t border-gray-100 space-y-4">
                      <div>
                          <div className="flex items-center gap-2 mb-3">
                              <Paperclip size={16} className="text-gray-500" />
                              <span className={LABEL_CLASS + " mb-0"}>Evidência da Solicitação (Print / Imagem)</span>
                          </div>
                          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 bg-gray-50/50 hover:border-red-300 hover:bg-red-50/20 transition-all cursor-pointer" onClick={() => fileInputRef.current?.click()} data-testid="evidence-drop-zone">
                              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleEvidenceFileSelect} />
                              <div className="flex flex-col items-center gap-2 text-gray-400">
                                  <div className="flex items-center gap-3"><Image size={20} /><span className="text-xs font-bold uppercase">Clique para selecionar ou use Ctrl+V para colar um print</span><Clipboard size={16} /></div>
                                  <span className="text-[10px] text-gray-300">PNG, JPG — Evidencie que o cliente solicitou esta demanda</span>
                              </div>
                          </div>
                          {evidenceFiles.length > 0 && (
                              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                                  {evidenceFiles.map((ev, idx) => (
                                      <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 shadow-sm cursor-pointer" onClick={() => setExpandedEvidence(ev.preview)} data-testid={`evidence-thumbnail-${idx}`}>
                                          <img src={ev.preview} alt={`Evidência ${idx + 1}`} className="w-full h-32 object-cover" />
                                          <button type="button" onClick={(e) => { e.stopPropagation(); removeEvidence(idx); }} className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" data-testid={`button-remove-evidence-${idx}`}><Trash2 size={12} /></button>
                                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex items-center justify-between"><span className="text-[9px] text-white font-bold">EVIDÊNCIA {idx + 1}</span><span className="text-[8px] text-white/70">Clique para ampliar</span></div>
                                      </div>
                                  ))}
                              </div>
                          )}
                          {expandedEvidence && (
                              <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setExpandedEvidence(null)} data-testid="evidence-fullscreen-modal">
                                  <button type="button" onClick={() => setExpandedEvidence(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-10" data-testid="button-close-evidence"><X size={24} /></button>
                                  <img src={expandedEvidence} alt="Evidência ampliada" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
                              </div>
                          )}
                      </div>
                      <div className="flex justify-end gap-3">
                          <button type="button" onClick={onBack} className="px-8 py-3 bg-white text-gray-500 rounded-xl font-bold uppercase text-xs hover:bg-gray-100 border border-gray-200 transition-all" data-testid="button-cancel">Cancelar</button>
                          <button type="submit" disabled={isSaving} className="px-10 py-3 bg-orange-500 text-black rounded-xl font-black uppercase text-sm shadow-lg hover:bg-orange-600 flex items-center gap-2 transition-all active:scale-95" data-testid="button-submit-os">
                              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Gerar Ordem de Serviço
                          </button>
                      </div>
                  </div>
              </div>
              )}
          </form>
      </div>

      {dhlEmailModal.open && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-dhl-email-required">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div style={{ background: '#FFCC00', height: 6 }}></div>
            <div style={{ background: '#D40511', height: 4 }}></div>
            <div className="p-6">
              <h2 className="text-lg font-black uppercase tracking-wide text-gray-900 mb-1">E-mail do fornecedor obrigatório</h2>
              <p className="text-xs text-gray-700 mb-4 leading-relaxed">
                O fornecedor <span className="font-bold">{dhlEmailModal.providerName}</span> não tem e-mail cadastrado.
                Para enviar o link DHL é obrigatório informar um e-mail agora. Ele ficará salvo
                no cadastro do fornecedor para os próximos envios.
              </p>
              <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block tracking-wider">E-mail do fornecedor</label>
              <input
                type="email"
                autoFocus
                value={dhlEmailModal.email}
                onChange={(e) => setDhlEmailModal(prev => ({ ...prev, email: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter' && !dhlEmailModal.saving) handleDhlEmailSubmit(); }}
                placeholder="fornecedor@empresa.com.br"
                className="w-full border border-gray-300 rounded-lg px-3 h-11 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                disabled={dhlEmailModal.saving}
                data-testid="input-dhl-provider-email"
              />
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setDhlEmailModal(prev => ({ ...prev, open: false }))}
                  disabled={dhlEmailModal.saving}
                  className="px-4 h-11 rounded-lg bg-gray-200 text-gray-800 text-xs font-bold hover:bg-gray-300 disabled:opacity-50"
                  data-testid="btn-cancel-dhl-email"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDhlEmailSubmit}
                  disabled={dhlEmailModal.saving || !dhlEmailModal.email.trim()}
                  className="px-4 h-11 rounded-lg bg-gray-900 text-white text-xs font-black uppercase tracking-wider hover:bg-black disabled:opacity-50"
                  data-testid="btn-save-dhl-email"
                >
                  {dhlEmailModal.saving ? 'Salvando...' : 'Salvar e enviar link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dhlSchemaModal.open && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-dhl-schema-missing">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>
            <div style={{ background: '#FFCC00', height: 6 }}></div>
            <div style={{ background: '#D40511', height: 4 }}></div>
            <div className="p-6 overflow-y-auto">
              <h2 className="text-lg font-black uppercase tracking-wide text-gray-900 mb-2">Aplicar SQL no Supabase</h2>
              <p className="text-xs text-gray-700 mb-4 leading-relaxed" data-testid="text-dhl-schema-message">
                {dhlSchemaModal.message}
              </p>
              <ol className="text-xs text-gray-600 mb-3 list-decimal pl-4 space-y-0.5">
                <li>Clique em <span className="font-bold">Copiar SQL</span> abaixo.</li>
                <li>Abra o <a href="https://supabase.com/dashboard/project/_/sql/new" target="_blank" rel="noreferrer" className="text-blue-600 underline">Supabase Studio → SQL Editor</a>.</li>
                <li>Cole, clique em <span className="font-bold">Run</span> e aguarde concluir.</li>
                <li>Volte aqui e tente gerar/reenviar o link novamente.</li>
              </ol>
              <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block tracking-wider">scripts/dhl-migrations.sql</label>
              <textarea
                readOnly
                value={dhlSchemaModal.loadingSql ? 'Carregando SQL...' : dhlSchemaModal.sql}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-[11px] font-mono text-gray-700 mb-3"
                rows={10}
                data-testid="textarea-dhl-schema-sql"
              />
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  disabled={dhlSchemaModal.loadingSql || !dhlSchemaModal.sql}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(dhlSchemaModal.sql);
                      showNotification('SQL copiado', 'Cole no Supabase Studio → SQL Editor e clique em Run.', 'success');
                    } catch {
                      alert('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente (Ctrl+C).');
                    }
                  }}
                  className="px-4 h-11 rounded-lg bg-gray-900 text-white text-xs font-black uppercase tracking-wider hover:bg-black disabled:opacity-50"
                  data-testid="btn-copy-dhl-schema-sql"
                >
                  Copiar SQL
                </button>
                <button
                  type="button"
                  onClick={() => setDhlSchemaModal({ open: false, message: '', sql: '', loadingSql: false })}
                  className="px-4 h-11 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700"
                  data-testid="btn-close-dhl-schema"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dhlChannelPicker.open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-dhl-channel-picker">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div style={{ background: '#FFCC00', height: 6 }}></div>
            <div style={{ background: '#D40511', height: 4 }}></div>
            <div className="p-6">
              <h2 className="text-lg font-black uppercase tracking-wide text-gray-900 mb-1">Reenviar link DHL</h2>
              <p className="text-xs text-gray-500 mb-4">
                Escolha por onde enviar o novo link ao fornecedor.{' '}
                <span className="text-gray-700 font-bold">A opção destacada é a preferida deste fornecedor</span> — você pode escolher outra apenas para este envio.
              </p>
              <div className="flex flex-col gap-2 mb-4">
                {(() => {
                  const pref = dhlChannelPicker.preferred;
                  const PreferredBadge = () => (
                    <span className="ml-2 px-1.5 py-0.5 bg-white/25 text-[9px] font-black uppercase tracking-wider rounded">Padrão</span>
                  );
                  const ring = (c: 'email' | 'whatsapp' | 'both') =>
                    pref === c ? ' ring-2 ring-offset-2 ring-yellow-400' : ' opacity-90';
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRegenerateDhlLink('email', { saveAsDefault: dhlChannelPicker.saveAsDefault })}
                        disabled={dhlRegenerating}
                        className={`w-full px-4 h-11 rounded-lg bg-red-600 text-white text-xs font-black uppercase tracking-wider hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2${ring('email')}`}
                        data-testid="btn-dhl-channel-email"
                      >
                        <Mail size={14} /> Só e-mail
                        {pref === 'email' && <PreferredBadge />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegenerateDhlLink('whatsapp', { saveAsDefault: dhlChannelPicker.saveAsDefault })}
                        disabled={dhlRegenerating}
                        className={`w-full px-4 h-11 rounded-lg bg-green-600 text-white text-xs font-black uppercase tracking-wider hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2${ring('whatsapp')}`}
                        data-testid="btn-dhl-channel-whatsapp"
                      >
                        Só WhatsApp
                        {pref === 'whatsapp' && <PreferredBadge />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegenerateDhlLink('both', { saveAsDefault: dhlChannelPicker.saveAsDefault })}
                        disabled={dhlRegenerating}
                        className={`w-full px-4 h-11 rounded-lg bg-gray-900 text-white text-xs font-black uppercase tracking-wider hover:bg-black disabled:opacity-50 flex items-center justify-center gap-2${ring('both')}`}
                        data-testid="btn-dhl-channel-both"
                      >
                        Ambos (e-mail + WhatsApp)
                        {pref === 'both' && <PreferredBadge />}
                      </button>
                    </>
                  );
                })()}
              </div>
              <label className="flex items-start gap-2 mb-4 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg cursor-pointer hover:bg-yellow-100 transition-colors" data-testid="label-dhl-save-default">
                <input
                  type="checkbox"
                  checked={dhlChannelPicker.saveAsDefault}
                  onChange={(e) => setDhlChannelPicker(prev => ({ ...prev, saveAsDefault: e.target.checked }))}
                  disabled={dhlRegenerating}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50"
                  data-testid="checkbox-dhl-save-default"
                />
                <span className="text-[11px] text-gray-700 leading-snug">
                  <span className="font-black uppercase tracking-wide text-gray-900">Tornar este o canal padrão deste fornecedor</span>
                  <br />
                  Próximos reenvios para este fornecedor poderão ser feitos com um clique pelo canal escolhido.
                </span>
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setDhlChannelPicker(prev => ({ ...prev, open: false, saveAsDefault: false }))}
                  disabled={dhlRegenerating}
                  className="px-4 h-10 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200 disabled:opacity-50"
                  data-testid="btn-dhl-channel-cancel"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dhlLinkModal.open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-dhl-link">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div style={{ background: '#FFCC00', height: 6 }}></div>
            <div style={{ background: '#D40511', height: 4 }}></div>
            <div className="p-6">
              <h2 className="text-lg font-black uppercase tracking-wide text-gray-900 mb-1">Link do fornecedor gerado</h2>
              <p className="text-xs text-gray-500 mb-4" data-testid="text-dhl-modal-status">
                OS <span className="font-bold text-red-600">{dhlLinkModal.missionId}</span>
                {(() => {
                  const c = dhlLinkModal.channel;
                  const waOk = dhlLinkModal.whatsappSent;
                  const waErr = dhlLinkModal.whatsappError;
                  const phone = (dhlLinkModal.phone || '').trim();
                  const waPart = waOk
                    ? ' — WhatsApp enviado automaticamente ao fornecedor.'
                    : (phone
                        ? (waErr ? ` — WhatsApp não enviado automaticamente (${waErr}). Use o botão abaixo.` : ' — WhatsApp não enviado automaticamente. Use o botão abaixo.')
                        : ' — fornecedor sem telefone cadastrado. Copie a mensagem ou abra o WhatsApp Web.');
                  if (c === 'whatsapp') return waPart;
                  if (c === 'email') return dhlLinkModal.emailSent
                    ? ` — e-mail enviado para ${dhlLinkModal.providerEmail || 'o fornecedor'}.`
                    : ' — e-mail não foi enviado.';
                  const emailPart = dhlLinkModal.emailSent
                    ? ` — e-mail enviado para ${dhlLinkModal.providerEmail || 'o fornecedor'}.`
                    : ' — e-mail não enviado.';
                  return emailPart + waPart;
                })()}
              </p>

              <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block tracking-wider">Link público</label>
              <div className="flex gap-2 mb-4">
                <input readOnly className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-3 h-11 text-xs font-mono text-gray-700" value={dhlLinkModal.url} onClick={(e) => (e.target as HTMLInputElement).select()} data-testid="input-dhl-public-url" />
                <button type="button" onClick={() => { navigator.clipboard.writeText(dhlLinkModal.url); alert('Link copiado'); }} className="px-3 h-11 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-black" data-testid="btn-copy-dhl-url">Copiar</button>
              </div>

              {dhlLinkModal.channel !== 'email' && (
                <>
                  <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block tracking-wider">Mensagem para WhatsApp</label>
                  <textarea readOnly className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-700 mb-3" rows={6} value={dhlLinkModal.whatsappText} onClick={(e) => (e.target as HTMLTextAreaElement).select()} data-testid="textarea-dhl-whatsapp" />
                </>
              )}

              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    setDhlLinkModal({ ...dhlLinkModal, open: false });
                    await handleResendEmailAndCopyWhatsapp();
                  }}
                  disabled={dhlReleaseSending}
                  className="px-4 h-11 rounded-lg bg-blue-600 text-white text-xs font-black uppercase tracking-wider hover:bg-blue-700 disabled:opacity-50"
                  data-testid="btn-resend-email-copy-whatsapp"
                  title="Reenvia o e-mail e copia a mensagem do WhatsApp avisando que o link está liberado"
                >
                  {dhlReleaseSending ? 'Enviando...' : 'Reenviar e-mail + Copiar WhatsApp'}
                </button>
                {dhlLinkModal.channel !== 'email' && (
                  <>
                    <button type="button" onClick={() => { navigator.clipboard.writeText(dhlLinkModal.whatsappText); alert('Mensagem copiada'); }} className="px-4 h-11 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200" data-testid="btn-copy-whatsapp">Copiar mensagem</button>
                    <button
                      type="button"
                      onClick={() => {
                        const phone = (dhlLinkModal.phone || '').replace(/\D/g, '');
                        const url = phone
                          ? `https://wa.me/${phone.length <= 11 ? '55' + phone : phone}?text=${encodeURIComponent(dhlLinkModal.whatsappText)}`
                          : `https://wa.me/?text=${encodeURIComponent(dhlLinkModal.whatsappText)}`;
                        window.open(url, '_blank');
                      }}
                      className="px-4 h-11 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700"
                      data-testid="btn-open-whatsapp"
                    >Abrir no WhatsApp</button>
                  </>
                )}
                <button type="button" onClick={() => setDhlLinkModal({ ...dhlLinkModal, open: false })} className="px-4 h-11 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700" data-testid="btn-close-dhl-modal">Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionForm;
