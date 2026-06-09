# MAPA DE ENGENHARIA REVERSA — TMSEGo v3.1.5
## Guia Técnico de Configuração para Replicação Integral
**Gerado em:** 07/04/2026  
**Projeto origem:** Grupo TMSEG — Sistema de Gestão de Escoltas  
**Projeto destino:** Torres (ou qualquer clone)

---

## 1. ARQUITETURA GERAL

```
Stack: React 18 + Vite 5 + Express 5 + Supabase (PostgreSQL)
Linguagem: TypeScript
UI: Tailwind CSS 3 + Lucide Icons + Recharts
IA: Google Gemini 2.5 Flash (via Replit Integration)
Pagamentos: Asaas API v3 (3 empresas)
Mapas: Google Maps API
Deploy: Replit (Express serve React em produção)
PWA: Service Worker + Manifest (mobile-first)
```

### Fluxo de Dados
```
[Browser/PWA] ←→ [Vite Dev Server :5173] ←→ [Express :5000] ←→ [Supabase Cloud]
                                                    ↓
                                            [Asaas API] [Gemini AI] [SMTP] [Z-API WhatsApp]
```

---

## 2. ESTRUTURA DE PASTAS

```
/
├── App.tsx                     ← Componente raiz (roteamento por estado, não por URL)
├── index.tsx                   ← Entry point React
├── index.html                  ← HTML base com Tailwind CDN + iOS fixes
├── constants.ts                ← Versão, menu, configs de API (WDAPI, Toll, WhatsApp)
├── types.ts                    ← Interfaces TypeScript (Mission, Client, Vehicle, etc.)
│
├── components/                 ← 95 componentes React (.tsx)
│   ├── Login.tsx               ← Tela de login (bg Unsplash, bcrypt, biometria)
│   ├── Sidebar.tsx             ← Menu lateral (permissões por perfil)
│   ├── Header.tsx              ← Header (logo dinâmico TMSEG/CEVA)
│   ├── Dashboard.tsx           ← Painel principal (KPIs, gráficos)
│   ├── MissionTable.tsx        ← Central de OS (Realtime Supabase)
│   ├── MissionForm.tsx         ← Formulário de missão
│   ├── MissionFinancialModal.tsx ← Modal financeiro (cálculo, IA, aprovação)
│   ├── ClientBillingReport.tsx ← Boletim de medição por cliente
│   ├── FinancialDashboard.tsx  ← Dashboard financeiro (React Query)
│   ├── AIChatbot.tsx           ← Chat IA Gemini
│   ├── WhatsAppChat.tsx        ← Integração Z-API
│   ├── ... (90+ componentes)
│
├── lib/                        ← Bibliotecas/utilitários frontend
│   ├── supabase.ts             ← Cliente Supabase (VITE_SUPABASE_URL + ANON_KEY)
│   ├── authFetch.ts            ← Fetch autenticado (token tmseg-token-{uid}-{ts})
│   ├── financialUtils.ts       ← Motor de cálculo financeiro (~1050 linhas)
│   ├── gemini.ts               ← Proxy Gemini (generateContent, suggestPriceTable)
│   ├── dateUtils.ts            ← Formatação datas (timezone America/Sao_Paulo)
│   ├── maps.ts                 ← Google Maps (distância, geocoding)
│   ├── logger.ts               ← logAction → system_logs
│   ├── queryClient.ts          ← React Query config (staleTime 30s, gcTime 5min)
│   ├── useSupabaseQuery.ts     ← Hooks React Query para Supabase
│   ├── NotificationContext.tsx ← Context de notificações toast
│   ├── utils.ts                ← Utilitários gerais
│
├── server/                     ← Backend Express
│   ├── index.ts                ← Entry point (Express + JSON 50mb + logging)
│   ├── routes.ts               ← ~3470 linhas — TODAS as rotas API
│   ├── asaasService.ts         ← Serviço Asaas (3 empresas, NF, cobranças)
│   ├── emailService.ts         ← SMTP Nodemailer (adm@grupotmseg.com.br)
│   ├── pdfReportService.ts     ← Geração de PDF (jsPDF)
│   ├── storage.ts              ← Interface IStorage (não usada — Supabase direto)
│   ├── vite.ts                 ← Configuração Vite dev/prod
│   ├── static.ts               ← Serving arquivos estáticos em produção
│   ├── replit_integrations/    ← Gemini AI Integration (auto-gerenciado)
│
├── public/                     ← Assets estáticos
│   ├── logo.png                ← Logo TMSEG (principal)
│   ├── logo_ceva.png           ← Logo CEVA (cliente especial)
│   ├── logo_ceva_new.png       ← Logo CEVA atualizado
│
├── client/public/              ← PWA assets
│   ├── sw.js                   ← Service Worker (tmseg-v7)
│   ├── manifest.json           ← PWA manifest
│   ├── favicon.png, icon-192.png, icon-512.png
│
├── tailwind.config.ts          ← Config Tailwind (cores brand)
├── vite.config.ts              ← Config Vite (aliases @, hmr)
├── tsconfig.json               ← Config TypeScript
├── package.json                ← Dependências
```

---

## 3. ROTAS DA API (server/routes.ts)

### Autenticação & Segurança
| Rota | Método | Proteção | Descrição |
|---|---|---|---|
| `/api/health` | GET | Nenhuma | Health check |
| `/api/password-reset/request` | POST | Nenhuma | Solicitar reset senha |
| `/api/password-reset/validate` | POST | Nenhuma | Validar token reset |
| `/api/password-reset/confirm` | POST | Nenhuma | Confirmar nova senha |

### Email (SMTP)
| Rota | Método | Proteção | Descrição |
|---|---|---|---|
| `/api/email/test` | POST | requireAuth | Testar SMTP |
| `/api/email/test-mission-emails` | POST | requireAuth | Testar emails de missão |
| `/api/email/welcome` | POST | requireAuth | Email de boas-vindas |
| `/api/email/mission-scheduled` | POST | requireAuth + requireRole | Email OS agendada (cliente) |
| `/api/email/mission-solicited` | POST | requireAuth + requireRole | Email OS solicitada (fornecedor) |
| `/api/email/mission-change-client` | POST | requireAuth + requireRole | Email alteração (cliente) |
| `/api/email/mission-change-provider` | POST | requireAuth + requireRole | Email alteração (fornecedor) |
| `/api/email/mirroring-evidence` | POST | requireAuth + requireRole | Email espelhamento |
| `/api/email/mission-resend-client` | POST | requireAuth + requireRole | Reenvio email (cliente) |
| `/api/email/send-verification` | POST | requireAuth | Código verificação |
| `/api/email/verify-code` | POST | requireAuth | Validar código |

### Inteligência Artificial (Gemini)
| Rota | Método | Proteção | Descrição |
|---|---|---|---|
| `/api/gemini/generate` | POST | requireAuth | Geração de conteúdo (stream/sync) |
| `/api/chat` | POST | requireAuth | Chat IA com histórico + imagens |

### Supabase / Banco de Dados
| Rota | Método | Descrição |
|---|---|---|
| `/api/supabase/init-invoices` | POST | Inicializar tabela financial_invoices |
| `/api/supabase/status` | GET | Status do banco |
| `/api/supabase/db-metrics` | GET | Métricas (linhas, tamanho, tabelas) |
| `/api/supabase/storage-usage` | GET | Uso de storage |
| `/api/supabase/billing-links` | GET | Links do painel Supabase |
| `/api/supabase/health-check` | GET | Health check Supabase |
| `/api/db/capacity` | GET | Capacidade do banco |
| `/api/db/vacuum` | POST | Limpeza (vacuum) |
| `/api/client-registries/init` | POST | Inicializar tabelas auxiliares |

### Missões (Core)
| Rota | Método | Descrição |
|---|---|---|
| `/api/missions/force-recalculate-by-os/:osNumber` | POST | Recalcular por OS |
| `/api/missions/:id/force-recalculate` | POST | Recalcular missão individual |
| `/api/missions/scan-divergences` | POST | Scan de divergências financeiras |
| `/api/missions/fix-divergences` | POST | Corrigir divergências |
| `/api/missions/recalculate-all` | POST | Recalcular todas missões |
| `/api/missions/:id/operational-report` | GET/PATCH | Relatório operacional |
| `/api/missions/fix-ceva-logitech-values` | POST | Fix valores CEVA/Logitech |
| `/api/missions/ensure-report-column` | POST | Garantir coluna relatório |

### Vendor Verification
| Rota | Método | Descrição |
|---|---|---|
| `/api/vendor-verification/:missionId` | POST/GET | Verificação OS fornecedor |

### Administração
| Rota | Método | Proteção | Descrição |
|---|---|---|---|
| `/api/admin/cleanup-history` | POST | requireRole(admin, diretoria) | Limpar histórico |
| `/api/admin/cleanup-preview` | GET | requireRole(admin, diretoria) | Preview limpeza |

### Investimentos
| Rota | Método | Descrição |
|---|---|---|
| `/api/investment/init` | POST | Inicializar |
| `/api/investment/snapshots/:accountId` | GET | Snapshots por conta |
| `/api/investment/snapshots-all` | GET | Todos snapshots |
| `/api/investment/snapshots` | POST | Criar snapshot |
| `/api/investment/snapshots/:id` | DELETE | Excluir snapshot |

### Pedágio (Toll)
| Rota | Método | Descrição |
|---|---|---|
| `/api/toll/status` | GET | Status API pedágio |
| `/api/toll/calculate` | POST | Calcular pedágio (RapidAPI) |
| `/api/toll/gemini-estimate` | POST | Estimar pedágio via IA |

### Custos de Plataforma
| Rota | Método | Descrição |
|---|---|---|
| `/api/platform/costs` | GET | Custos estimados |
| `/api/platform/costs/overrides` | POST | Sobrescrever custos |

### Faturamento
| Rota | Método | Proteção | Descrição |
|---|---|---|---|
| `/api/billing/recalculate-all` | POST | requireRole(admin, diretoria, financeiro) | Recalcular faturamento |

### Asaas (Pagamentos)
| Rota | Método | Proteção | Descrição |
|---|---|---|---|
| `/api/asaas/status` | GET | requireRole(admin, diretoria, financeiro) | Status Asaas |
| `/api/asaas/test-nf` | GET | requireRole | Testar emissão NF |
| `/api/asaas/create-charge` | POST | requireRole | Criar cobrança |
| `/api/asaas/payment/:id` | GET | requireRole | Consultar pagamento |

### Push Notifications
| Rota | Método | Descrição |
|---|---|---|
| `/api/push/vapid-key` | GET | Chave pública VAPID |
| `/api/push/subscribe` | POST | Registrar push |
| `/api/push/unsubscribe` | POST | Cancelar push |
| `/api/push/send` | POST | Enviar notificação |
| `/api/push/test` | POST | Testar notificação |

### Registros de Cliente / Notas
| Rota | Método | Descrição |
|---|---|---|
| `/api/client-registries/:clientId/:type` | GET | Listar registros |
| `/api/client-registries` | POST | Criar/atualizar registro |
| `/api/client-registries/:id` | DELETE | Excluir registro |
| `/api/client-mission-notes/:missionId` | GET | Notas da missão |
| `/api/client-mission-notes` | POST | Criar/atualizar nota |
| `/api/client-mission-notes/bulk/:clientId` | GET | Notas bulk |

### Migrações
| Rota | Método | Descrição |
|---|---|---|
| `/api/migrations/provider-ops-columns` | POST | Adicionar colunas provider ops |

---

## 4. ESQUEMA DO BANCO DE DADOS (Supabase)

### 28 Tabelas Identificadas

#### CORE — Operacional
| Tabela | Descrição | Campos-chave |
|---|---|---|
| `missions` | OS / Missões (tabela central) | id, os_number, client, provider, origin, destination, status, mission_type, start_time, end_time, startKm, endKm, totalDistance, toll_value, revenue_value, cost_value, snapshot_data, snapshot_approved_by, verified_by, verified_at, vehicle_id, agents |
| `clients` | Clientes | id, name, trading_name, cnpj, email, operational_email, phone, city, state, status, zip_code, street, number |
| `providers` | Fornecedores | id, name, trading_name, cnpj, email, os_email, phone, status |
| `vehicles` | Viaturas (escolta) | id, plate, model, tracker_type, tracker_id |
| `client_vehicles` | Veículos de carga (cliente) | id, plate, model, client_id |
| `agents` | Agentes de segurança | id, name, cpf, provider_id |
| `client_routes` | Rotas cadastradas | id, client_id, origin, destination, code |

#### FINANCEIRO
| Tabela | Descrição | Campos-chave |
|---|---|---|
| `client_price_tables` | Tabelas de preço (cliente) | id, client, operation_type, activation_fee, franchise_km, franchise_hours, price_per_extra_km, price_per_extra_hour |
| `provider_cost_tables` | Tabelas de custo (fornecedor) | id, provider, operation_type, activation_cost, franchise_km, franchise_hours, cost_per_extra_km, cost_per_extra_hour, cancellation_fee |
| `financial_transactions` | Contas a pagar/receber | id, description, amount, type, category_id, account_id, date, status |
| `financial_accounts` | Contas bancárias | id, name, bank, balance |
| `financial_categories` | Categorias financeiras | id, name, type, parent_id |
| `financial_invoices` | Notas fiscais / faturas | id, asaas_payment_id, nf_image_url, client, amount, status |
| `account_balance_snapshots` | Snapshots de saldo | id, account_id, balance, date |
| `commercial_proposals` / `quotes` | Propostas comerciais | id, client_id, client_name, origin, destination, total_km, total_value |

#### SISTEMA / AUDITORIA
| Tabela | Descrição | Campos-chave |
|---|---|---|
| `system_users` | Usuários do sistema | id, name, email, password_hash, role, profile_id, status, password_reset_token |
| `profiles` | Perfis de acesso (RBAC) | id, name, permissions[], role |
| `system_logs` | Logs de auditoria | id, action_type, entity, entity_id, user_id, user_name, details, created_at |
| `mission_history` | Histórico de alterações OS | id, mission_id, field, old_value, new_value, user, timestamp |
| `mission_logs` | Logs operacionais OS | id, mission_id, message, user, timestamp |
| `api_usage_logs` | Logs de uso de API | id, api, endpoint, cost, timestamp |

#### AUXILIARES
| Tabela | Descrição |
|---|---|
| `operational_reports` | Relatórios operacionais por missão |
| `client_registries` | Registros auxiliares (contatos, docs) |
| `client_mission_notes` | Notas por missão/cliente |
| `vehicle_technologies` | Tecnologias de rastreamento |
| `support_agents` | Agentes de suporte IA |
| `time_clock` | Ponto eletrônico |
| `documents` | Documentos |
| `backup_history` | Histórico de backups |
| `whatsapp_messages` | Mensagens WhatsApp |
| `platform_cost_overrides` | Overrides de custos |

---

## 5. INTEGRAÇÕES EXTERNAS

### 5.1 Asaas (Pagamentos & NF)
- **Arquivo:** `server/asaasService.ts` (435 linhas)
- **Base URL:** `https://api.asaas.com/v3`
- **3 empresas configuradas:**
  - TM GESTÃO (CNPJ 60485843000157) → `ASAAS_API_KEY`
  - TM SEGURANÇA (CNPJ 28804378000167) → `ASAAS_API_KEY_TMSECURITY`
  - TM SECURITY (CNPJ 60508931000127) → `ASAAS_API_KEY_TMSECURITY_60`
- **Funcionalidades:** Criar cobrança, emitir NF, consultar pagamento, webhook
- **Comunicação:** Frontend chama `/api/asaas/*` via `authFetch` → Express proxy → Asaas API

### 5.2 Google Gemini AI
- **Arquivo frontend:** `lib/gemini.ts` (funções generateContent, generateContentStream, suggestPriceTable)
- **Arquivo backend:** `server/replit_integrations/` (auto-gerenciado pela Replit Integration)
- **Modelo:** `gemini-2.5-flash`
- **Uso:** Chat IA, análise de imagens, sugestão de tabelas, estimativa de pedágio
- **Comunicação:** Frontend → `/api/gemini/generate` → Express → Gemini API

### 5.3 Google Maps
- **Arquivo:** `lib/maps.ts`
- **Secret:** `VITE_GOOGLE_MAPS_API_KEY`
- **Uso:** Cálculo de distância/rota, geocoding, mapa de rede de apoio
- **Componente:** `@react-google-maps/api`

### 5.4 SMTP (Email)
- **Arquivo:** `server/emailService.ts`
- **Provider:** Nodemailer
- **From:** `adm@grupotmseg.com.br`
- **Secrets:** `EMAIL_USER`, `EMAIL_PASS` (ou `SMTP_PASSWORD`)
- **Uso:** OS agendada, OS solicitada, espelhamento, alertas

### 5.5 WhatsApp (Z-API)
- **Arquivo:** `components/WhatsAppChat.tsx` + `constants.ts`
- **Secrets:** `VITE_ZAPI_INSTANCE_ID`, `VITE_ZAPI_TOKEN`, `VITE_ZAPI_CLIENT_TOKEN`
- **Uso:** Envio de mensagens e imagens para grupos/contatos

### 5.6 API Placas (ex-WDAPI2) — Consulta de Placas
- **Arquivo:** `constants.ts`
- **Base URL:** `https://apiplacas.com.br/api1.php` (formato query: `?placa={PLACA}&token={TOKEN}`)
- **Secret:** `VITE_WDAPI_TOKEN`
- **Uso:** Consulta de dados de veículo por placa
- **Nota:** Domínio antigo `wdapi2.com.br/consulta/{placa}/{token}` foi descontinuado (passou a redirecionar para HTML, quebrando o JSON). Provedor atrás de Cloudflare; chamada direta do frontend funciona, mas a página pública de intake do fornecedor usa proxy backend (token não pode ser exposto a usuários públicos).

### 5.7 RapidAPI (Pedágio)
- **Arquivo:** `server/routes.ts` (rotas `/api/toll/*`)
- **Host:** `territorial-pedagio-v1.p.rapidapi.com`
- **Secret:** `RAPIDAPI_TOLL_KEY`
- **Uso:** Cálculo de pedágio por rota

---

## 6. DEPENDÊNCIAS CRÍTICAS (package.json)

### Produção
| Pacote | Versão | Uso |
|---|---|---|
| `react` | 18.2.0 | UI Framework |
| `react-dom` | 18.2.0 | DOM rendering |
| `express` | 5.2.1 | Backend HTTP |
| `@supabase/supabase-js` | 2.97.0 | Cliente Supabase |
| `@tanstack/react-query` | 5.96.2 | Cache/estado de dados |
| `@google/genai` | 0.12.0 | Gemini AI SDK |
| `@react-google-maps/api` | 2.20.8 | Google Maps React |
| `lucide-react` | 0.344.0 | Ícones |
| `recharts` | 3.7.0 | Gráficos |
| `xlsx` | 0.18.5 | Import/export Excel |
| `html2canvas` | 1.4.1 | Screenshots/prints |
| `jspdf` | 4.2.0 | Geração de PDF |
| `nodemailer` | 8.0.2 | Envio de emails SMTP |
| `bcryptjs` | 3.0.3 | Hash de senhas |
| `helmet` | 8.1.0 | Segurança HTTP headers |
| `express-rate-limit` | 8.2.2 | Rate limiting |
| `zod` | 4.3.6 | Validação de schemas |
| `web-push` | 3.6.7 | Push notifications |
| `tsx` | 4.21.0 | TypeScript executor (dev server) |
| `nanoid` | 5.1.6 | Geração de IDs únicos |
| `p-limit` | 7.3.0 | Controle de concorrência |
| `p-retry` | 7.1.1 | Retry automático |

### Desenvolvimento
| Pacote | Versão | Uso |
|---|---|---|
| `vite` | 5.4.21 | Build tool |
| `@vitejs/plugin-react` | 4.7.0 | React HMR |
| `typescript` | 5.2.2 | Tipagem |
| `tailwindcss` | 3.4.1 | CSS utilitário |
| `autoprefixer` | 10.4.18 | CSS prefixing |
| `postcss` | 8.4.35 | CSS processing |

---

## 7. VARIÁVEIS DE AMBIENTE (Secrets)

### Obrigatórias
| Nome | Uso | Onde é usada |
|---|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase | `lib/supabase.ts`, `server/routes.ts` |
| `VITE_SUPABASE_ANON_KEY` | Chave anon Supabase | `lib/supabase.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave admin Supabase | `server/routes.ts` (supabaseAdmin) |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API Key | `lib/maps.ts`, `components/SupportMapFinder.tsx` |

### Asaas (Pagamentos)
| Nome | Uso |
|---|---|
| `ASAAS_API_KEY` | TM GESTÃO (CNPJ 60485843000157) |
| `ASAAS_API_KEY_TMSECURITY` | TM SEGURANÇA (CNPJ 28804378000167) |
| `ASAAS_API_KEY_TMSECURITY_60` | TM SECURITY (CNPJ 60508931000127) |

### Email (SMTP)
| Nome | Uso |
|---|---|
| `EMAIL_USER` | Endereço email remetente |
| `EMAIL_PASS` / `SMTP_PASSWORD` | Senha do email |

### APIs Externas
| Nome | Uso |
|---|---|
| `VITE_WDAPI_TOKEN` | API de consulta de placas |
| `RAPIDAPI_TOLL_KEY` | API de cálculo de pedágio |

### WhatsApp (Z-API)
| Nome | Uso |
|---|---|
| `VITE_ZAPI_INSTANCE_ID` | ID da instância Z-API |
| `VITE_ZAPI_TOKEN` | Token Z-API |
| `VITE_ZAPI_CLIENT_TOKEN` | Client token Z-API |

### Gemini AI
| Nome | Uso |
|---|---|
| (via Replit Integration) | `javascript_gemini_ai_integrations` — auto-gerenciado |

---

## 8. CONFIGURAÇÃO DE UI / IDENTIDADE VISUAL

### Arquivos de Logo
| Arquivo | Uso |
|---|---|
| `public/logo.png` | Logo principal (Sidebar, Login, Header) |
| `public/logo_ceva.png` | Logo CEVA (Header dinâmico para cliente CEVA) |
| `public/logo_ceva_new.png` | Logo CEVA atualizado |
| `client/public/favicon.png` | Favicon |
| `client/public/icon-192.png` | PWA icon 192px |
| `client/public/icon-512.png` | PWA icon 512px |
| `client/public/apple-touch-icon.png` | Apple touch icon |

### Cores da Marca (Trocar para Torres)
| Local | Propriedade | Valor TMSEG | Descrição |
|---|---|---|---|
| `index.html` (tailwind.config) | `brand.dark` | `#0a0a0a` | Preto principal |
| `index.html` (tailwind.config) | `brand.red` | `#450a0a` | Vermelho escuro |
| `index.html` (tailwind.config) | `brand.crimson` | `#7f1d1d` | Carmesim |
| `index.html` (body) | `background-color` | `#f3f4f6` | Fundo da página |

### Onde trocar o nome "TMSEG" / "Grupo TMSEG"
| Arquivo | Linha(s) | Texto atual |
|---|---|---|
| `index.html` | 13 | `<title>Grupo TMSEG - Sistema de Gestão</title>` |
| `components/Login.tsx` | 179, 294 | Logo src `/logo.png`, "Grupo TMSEG" |
| `components/Sidebar.tsx` | 214, 224 | Logo src `/logo.png`, "TMSEG" |
| `components/Header.tsx` | 68-69 | Logo dinâmico TMSEG/CEVA |
| `client/public/manifest.json` | — | Nome do PWA |
| `client/public/sw.js` | — | Cache name `tmseg-v7` |
| `constants.ts` | — | APP_VERSION, API configs |
| `server/emailService.ts` | — | Email from `adm@grupotmseg.com.br` |

### Fontes
| Fonte | Uso |
|---|---|
| Plus Jakarta Sans | Fonte principal (body) |
| Montserrat | Headers/títulos |
| Open Sans | Textos secundários |
| Roboto | Elementos técnicos |

---

## 9. AUTENTICAÇÃO & SEGURANÇA

### Fluxo de Login
```
1. Usuário digita email/senha
2. Frontend busca system_users por email
3. bcryptjs.compare(senha, password_hash)
4. Gera token: tmseg-token-{userId}-{timestamp}
5. Salva em localStorage: authToken, userData
6. authFetch inclui header Authorization: Bearer {token}
```

### Middleware Backend
- `requireAuth`: Valida formato do token
- `requireRole(...roles)`: Verifica role do usuário no Supabase (cache 5min)
- `roleCache`: Map com TTL de 5 minutos

### Perfis de Acesso (RBAC)
- `administrador` — Acesso total
- `diretoria` — Acesso financeiro e administrativo
- `financeiro` — Contas, faturas, faturamento
- `avançado` / `avancado` — Operacional avançado
- `operador` — Operacional básico
- `controlador` — Somente leitura financeira
- `comercial` — Propostas e clientes

---

## 10. MOTOR FINANCEIRO (financialUtils.ts — ~1050 linhas)

### Fluxo de Cálculo
```
calculateMissionFinancials(mission, clientTables, providerTables, clientData) →
  1. Extrai distância (endKm - startKm) e duração
  2. selectStrictTable() → Score-based matching de tabelas
  3. Calcula: base + (excessKm × preçoKm) + (excessHour × preçoHora)
  4. Aplica regras hardcoded (CEVA, CESLOG, MACOR, VTC, IBL)
  5. Retorna { client: { revenue }, provider: { cost }, toll, totalGeral }
```

### Score-based Table Matching (selectStrictTable)
| Critério | Score |
|---|---|
| Código de rota exata | +5000 |
| Rota cidade×cidade | +5000 |
| Tipo VELADA/ARMADO | +3000 |
| 02 Agentes | +3000 |
| Tipo CARACTERIZADA | +2500 |
| Cidade origem | +2000 |
| UF MG/ES | +1500 |
| UF genérico | +1200 |
| Região | +800 |
| Faixa KM cobre | +600 |
| EXCETO bloqueio | -5000 |

### Regras Hardcoded por Cliente
- **CEVA Jundiaí** (~42 linhas) — Seleção por distância/origem
- **CESLOG Cubatão×Santos** (~25 linhas) — Rota fixa
- **MACOR** (~8 linhas) — Filtra tabelas por fornecedor
- **VTC** (~5 linhas) — Horas fixas
- **IBL** (~2 linhas) — Flag de identificação

---

## 11. NAVEGAÇÃO (constants.ts — NAV_ITEMS)

```
├── Página Inicial (dashboard)
├── Monitoramento (missions)
├── Rede de Apoio QRF (support-network)
├── Financeiro ▼
│   ├── Dashboard Financeiro
│   ├── Boletim de Medição
│   ├── Movimento Diário
│   ├── Controle de Faturas / NF
│   ├── Contas a Pagar / Receber
│   ├── Relatório Geral (Diretoria)
│   ├── DRE Gerencial
│   ├── Gerenciar Contas (Bancos)
│   ├── Categorias Financeiras
│   └── Controle OS Fornecedor
├── Cliente ▼
│   ├── Cadastro de Cliente
│   ├── Gestão de Contratos
│   ├── Cadastro de Usuário
│   ├── Veículos (Carga)
│   ├── Cadastro de Rotas
│   └── Propostas Comerciais
├── Fornecedor ▼
│   ├── Cadastro de Fornecedor
│   ├── Gestão de Alvarás
│   ├── Cadastro de Usuário
│   ├── Cadastro de Viaturas
│   ├── Cadastro de Agentes
│   └── Tecnologias (Rastreador)
├── Relatórios
└── Configurações ▼
    ├── Backup & Manutenção
    ├── Otimização de Custos
    ├── Equipe Interna
    ├── Patrimônio & Equipamentos
    ├── Perfis de Acesso
    ├── Auditoria & Logs
    └── Status do Servidor
```

---

## 12. GUIA RÁPIDO PARA CLONAR PARA "TORRES"

### Passo 1 — Criar Projeto
1. Criar novo Repl (Node.js)
2. Copiar todos os arquivos exceto `node_modules/`, `dist/`, `.git/`
3. `npm install`

### Passo 2 — Novo Supabase
1. Criar projeto Supabase novo
2. Executar DDL de criação das 28 tabelas (extrair do `database_setup.sql`)
3. Configurar RLS policies
4. Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`

### Passo 3 — Identidade Visual
1. Substituir `public/logo.png` pelo logo Torres
2. Substituir ícones PWA (`client/public/`)
3. Alterar cores em `index.html` (tailwind.config → brand)
4. Buscar e substituir "TMSEG", "Grupo TMSEG", "Grupo TM" em:
   - `index.html` (título)
   - `components/Login.tsx`
   - `components/Sidebar.tsx`
   - `components/Header.tsx`
   - `client/public/manifest.json`
   - `client/public/sw.js`
   - `constants.ts`

### Passo 4 — APIs Externas
1. Configurar novas chaves Asaas (ou remover se não usar)
2. Configurar Google Maps API Key
3. Configurar SMTP (novo email)
4. Configurar Z-API (nova instância WhatsApp)
5. Instalar Integration `javascript_gemini_ai_integrations` no novo Repl

### Passo 5 — Regras de Negócio
1. Revisar `financialUtils.ts` — remover regras CEVA/CESLOG/MACOR/VTC/IBL
2. Adaptar `asaasService.ts` — novas empresas/CNPJs
3. Adaptar `emailService.ts` — novo remetente

### Passo 6 — Publicar
1. Testar localmente com `npm run dev`
2. Publicar via Replit Deploy

---

## 13. MÉTRICAS DO PROJETO

| Métrica | Valor |
|---|---|
| **Componentes React** | 95 |
| **Bibliotecas (dependencies)** | 29 |
| **Rotas API** | ~60+ |
| **Tabelas Supabase** | 28 |
| **Linhas server/routes.ts** | ~3.470 |
| **Linhas financialUtils.ts** | ~1.050 |
| **Integrações externas** | 7 (Supabase, Gemini, Maps, Asaas, SMTP, Z-API, RapidAPI) |
| **Versão atual** | 3.1.5 |
| **Service Worker** | tmseg-v7 |
