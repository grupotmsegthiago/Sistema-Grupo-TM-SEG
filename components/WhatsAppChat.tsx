import { formatTimeBR } from '../lib/dateUtils';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { useNotification } from '../lib/NotificationContext';
import { authFetch } from '../lib/authFetch';
import { Search, Send, Loader2, MessageCircle, User, Phone, CheckCheck, RefreshCw, AlertTriangle, ShieldCheck, Shield, Users } from 'lucide-react';

interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'agent';
    created_at: string;
    status: 'sent' | 'delivered' | 'read';
    phone: string;
}

// Interface Unificada para Contato (Pode ser Agente do Banco ou Grupo da API)
interface ChatContact {
    id: string; // ID do banco ou Phone/ID do Grupo
    name: string;
    phone: string; // Número limpo ou ID do Grupo (@g.us)
    isGroup: boolean;
    isArmed?: boolean; // Apenas para agentes
    type: 'agent' | 'group';
}

const WhatsAppChat: React.FC = () => {
    const [contacts, setContacts] = useState<ChatContact[]>([]);
    const [selectedContact, setSelectedContact] = useState<ChatContact | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [messageInput, setMessageInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [isLoadingContacts, setIsLoadingContacts] = useState(true);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { showNotification } = useNotification();

    // Carregar Contatos (Agentes do Banco + Grupos da API)
    useEffect(() => {
        fetchAllContacts();
    }, []);

    useRealtimeRefresh('whatsapp_messages', () => fetchAllContacts());

    // Carregar Mensagens e Inscrever no Realtime
    useEffect(() => {
        if (!selectedContact) return;

        // Se for grupo, o "phone" é o ID do grupo (ex: 123@g.us). Se for user, limpamos.
        const chatIdentifier = selectedContact.isGroup 
            ? selectedContact.phone 
            : cleanPhoneNumber(selectedContact.phone);

        fetchMessages(chatIdentifier);

        // REALTIME — canal único por chat para evitar colisão entre instâncias
        const channelName = `chat_updates_${chatIdentifier}_${Math.random().toString(36).slice(2, 8)}`;
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'whatsapp_messages',
                    filter: `phone=eq.${chatIdentifier}`
                },
                (payload) => {
                    const newMsg = payload.new as ChatMessage;
                    // Dedup: ignora se a mensagem já está no estado (insert local + realtime echo)
                    setMessages((prev) => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedContact]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, selectedContact]);

    const cleanPhoneNumber = (phone: string) => {
        // Se já tiver formato de grupo ou internacional completo, retorna
        if (phone.includes('@') || phone.startsWith('55')) {
             // Apenas remove caracteres especiais visuais, mas mantem estrutura
             if (phone.endsWith('@g.us')) return phone; // É grupo, não toca
        }

        let clean = phone.replace(/\D/g, '');
        clean = clean.replace(/^0+/, ''); // Remove zero inicial
        
        // Padroniza para 55 + DDD + NUM (Brasil)
        if (clean.length >= 10 && clean.length <= 11) {
            clean = `55${clean}`;
        }
        return clean;
    };

    const fetchAllContacts = async () => {
        setIsLoadingContacts(true);
        const combinedContacts: ChatContact[] = [];

        try {
            // 1. Buscar Agentes do Banco de Dados (Supabase)
            const { data: agentsData } = await supabase
                .from('support_agents')
                .select('*')
                .eq('status', 'Ativo')
                .order('name');
            
            if (agentsData) {
                const mappedAgents: ChatContact[] = agentsData.map((a: any) => ({
                    id: a.id,
                    name: a.name,
                    phone: a.phone,
                    isGroup: false,
                    isArmed: a.is_armed,
                    type: 'agent'
                }));
                combinedContacts.push(...mappedAgents);
            }

            // 2. Buscar Grupos via proxy do backend (não expor credenciais Z-API ao browser)
            try {
                const groupsResponse = await authFetch('/api/whatsapp/groups');
                if (groupsResponse.ok) {
                    const groupsData = await groupsResponse.json();
                    const list = Array.isArray(groupsData) ? groupsData : (groupsData?.groups || []);
                    const mappedGroups: ChatContact[] = list.map((g: any) => ({
                        id: g.id || g.phone,
                        name: g.subject || g.name || 'Grupo Desconhecido',
                        phone: g.id || g.phone,
                        isGroup: true,
                        type: 'group'
                    }));
                    combinedContacts.push(...mappedGroups);
                } else {
                    console.warn('[WhatsApp] Proxy /api/whatsapp/groups indisponível (status', groupsResponse.status, ')');
                }
            } catch (e) {
                console.warn('[WhatsApp] Falha ao consultar grupos via proxy:', e);
            }

        } catch (error) {
            console.error("Erro ao carregar contatos:", error);
        } finally {
            // Ordenar alfabeticamente
            combinedContacts.sort((a, b) => a.name.localeCompare(b.name));
            setContacts(combinedContacts);
            setIsLoadingContacts(false);
        }
    };

    const fetchMessages = async (chatId: string) => {
        setIsLoadingMessages(true);
        try {
            const { data } = await supabase
                .from('whatsapp_messages')
                .select('*')
                .eq('phone', chatId) // chatId pode ser numero ou ID de grupo
                .order('created_at', { ascending: true });
            
            if (data) setMessages(data as any);
            else setMessages([]);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingMessages(false);
        }
    };

    const filteredContacts = contacts.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.phone.includes(searchTerm)
    );

    const handleSendMessage = async () => {
        if (!selectedContact || !messageInput.trim()) return;

        setIsSending(true);
        const textToSend = messageInput;
        setMessageInput(''); // Limpa input rápido para UX

        // Se for grupo, usa o ID direto. Se for user, limpa para 55...
        const targetPhone = selectedContact.isGroup 
            ? selectedContact.phone 
            : cleanPhoneNumber(selectedContact.phone);

        try {
            // 1. Salvar no Banco (Status: Sent)
            const { error: dbError } = await supabase.from('whatsapp_messages').insert([{
                phone: targetPhone,
                text: textToSend,
                sender: 'user',
                status: 'sent'
            }]);

            if (dbError) throw dbError;

            // 2. Enviar via proxy do backend (não expor token Z-API ao browser)
            const response = await authFetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: targetPhone, message: textToSend })
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(errText || `Status ${response.status}`);
            }

        } catch (error: any) {
            console.error("Erro envio:", error);
            showNotification('Falha ao enviar mensagem', error?.message || 'Erro desconhecido', 'error');
            // Restaura input para o usuário não perder o texto
            setMessageInput(textToSend);
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // Info de configuração do webhook (notificação interna em vez de alert nativo)
    const showWebhookInfo = () => {
        showNotification(
            'Configuração de Webhook Z-API',
            'Aponte o webhook on-message-received da Z-API para o endpoint /api/whatsapp/webhook deste sistema. Grupos são suportados automaticamente.',
            'info'
        );
    };

    return (
        <div className="h-[calc(100vh-6rem)] bg-white rounded-xl shadow-sm border border-gray-200 flex overflow-hidden animate-fade-in">
            
            {/* Sidebar Contatos */}
            <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50">
                <div className="p-4 border-b border-gray-200 bg-white">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            <MessageCircle className="text-green-600" /> Central WhatsApp
                        </h2>
                        <button onClick={fetchAllContacts} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                            <RefreshCw size={16} className={isLoadingContacts ? "animate-spin" : ""} />
                        </button>
                    </div>
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Buscar agente ou grupo..." 
                            className="w-full pl-9 pr-3 py-2 bg-gray-100 border border-transparent focus:bg-white focus:border-green-500 rounded-lg text-sm outline-none transition-all"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {filteredContacts.map(contact => (
                        <div 
                            key={contact.id}
                            onClick={() => setSelectedContact(contact)}
                            className={`p-4 flex items-center gap-3 cursor-pointer transition-colors border-b border-gray-100 hover:bg-gray-100 ${selectedContact?.id === contact.id ? 'bg-green-50 border-l-4 border-l-green-500' : ''}`}
                        >
                            {/* ÍCONE DINÂMICO: GRUPO OU AGENTE */}
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${
                                contact.isGroup 
                                    ? 'bg-orange-500' // Cor para Grupos
                                    : contact.isArmed ? 'bg-red-600' : 'bg-blue-600' // Cor para Agentes
                            }`}>
                                {contact.isGroup ? <Users size={18} /> : (contact.isArmed ? <ShieldCheck size={18} /> : <Shield size={18} />)}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline">
                                    <h4 className="font-bold text-sm text-gray-900 truncate">{contact.name}</h4>
                                </div>
                                <p className="text-xs text-gray-500 truncate font-mono">
                                    {contact.isGroup ? 'Grupo WhatsApp' : contact.phone}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-[#efeae2]">
                {selectedContact ? (
                    <>
                        {/* Header Chat */}
                        <div className="p-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between shadow-sm z-10">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${
                                    selectedContact.isGroup ? 'bg-orange-500' : (selectedContact.isArmed ? 'bg-red-600' : 'bg-blue-600')
                                }`}>
                                    {selectedContact.isGroup ? <Users size={20} /> : <User size={20} />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">{selectedContact.name}</h3>
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                        <Phone size={10} /> {selectedContact.isGroup ? 'Grupo' : selectedContact.phone}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={showWebhookInfo}
                                className="text-[10px] text-gray-400 hover:text-gray-600 underline"
                            >
                                Configurar Webhook
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef} style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', backgroundSize: '400px' }}>
                            {isLoadingMessages ? (
                                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" /></div>
                            ) : messages.length === 0 ? (
                                <div className="text-center py-10 opacity-50">
                                    <p className="text-sm bg-white/80 inline-block px-3 py-1 rounded-full shadow-sm">Nenhuma mensagem trocada ainda.</p>
                                </div>
                            ) : (
                                messages.map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] p-2 rounded-lg shadow-sm text-sm relative ${msg.sender === 'user' ? 'bg-[#d9fdd3] text-gray-900 rounded-tr-none' : 'bg-white text-gray-900 rounded-tl-none'}`}>
                                            <p className="whitespace-pre-wrap">{msg.text}</p>
                                            <div className="flex justify-end items-center gap-1 mt-1">
                                                <span className="text-[10px] text-gray-500">
                                                    {formatTimeBR(msg.created_at)}
                                                </span>
                                                {msg.sender === 'user' && (
                                                    <CheckCheck size={14} className={msg.status === 'read' ? 'text-blue-500' : 'text-gray-400'} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="p-3 bg-gray-100 border-t border-gray-200 flex items-center gap-2">
                            <input 
                                type="text" 
                                className="flex-1 p-3 rounded-lg border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none text-sm"
                                placeholder="Digite uma mensagem..."
                                value={messageInput}
                                onChange={e => setMessageInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={isSending}
                            />
                            <button 
                                onClick={handleSendMessage}
                                disabled={isSending || !messageInput.trim()}
                                className="p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center bg-[#f0f2f5]">
                        <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                            <MessageCircle size={64} className="text-gray-400 opacity-50" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-600 mb-2">Central de Mensagens</h3>
                        <p className="text-sm max-w-xs">Selecione um agente ou GRUPO na lista ao lado para iniciar uma conversa.</p>
                        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg max-w-md text-left">
                            <p className="text-xs text-yellow-800 font-bold mb-1 flex items-center gap-2"><AlertTriangle size={14}/> Sincronização de Grupos</p>
                            <p className="text-xs text-yellow-700">Seus grupos do WhatsApp aparecerão automaticamente na lista ao clicar no botão de recarregar (canto superior esquerdo da lista).</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WhatsAppChat;
