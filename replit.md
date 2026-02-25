# Grupo TMSEG - Sistema de Gestão Operacional

## Overview

Grupo TMSEG is a comprehensive operational management system for a Brazilian security escort company. It manages escort missions, fleet vehicles, clients, providers (subcontractors), financial operations, billing, contracts, and AI-powered features. The system is a full-stack application with a React frontend and an Express backend, using Supabase as the primary database and authentication layer, Google Maps for routing/geolocation, and Google Gemini AI for intelligent features like chatbots, document analysis, image generation, and billing auditing.

**CRITICAL RULE:** The visual layout, design, colors, button positioning, and all UI aesthetics are frozen and must NOT be modified. Changes should focus exclusively on logic, bug fixes, and new functional features without altering the existing look and feel.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite 5 with `@vitejs/plugin-react`
- **Styling:** Tailwind CSS 3.4 loaded via CDN in `index.html` with additional config in `tailwind.config.js`. There is also a `tailwind.config.ts` for a `client/` directory structure (shadcn/ui new-york style configured in `components.json`), suggesting a migration or dual setup.
- **Icons:** Lucide React
- **Maps:** `@react-google-maps/api` for Google Maps integration (routing, autocomplete, markers)
- **PDF Generation:** jsPDF + html2canvas for generating printable documents and commercial proposals
- **Entry Point:** `index.tsx` renders `App.tsx` which manages all routing/views via state (no client-side router like React Router — navigation is state-driven through a sidebar)
- **Component Organization:** All components live in a flat `components/` directory. The app uses a sidebar + header layout with conditional rendering based on the active view state.
- **State Management:** Local component state with React hooks. User session data stored in `localStorage`. A `NotificationContext` provides app-wide toast notifications.

### Backend Architecture
- **Runtime:** Node.js with Express 5
- **Dev Server:** `npx tsx server/index.ts` — uses tsx for TypeScript execution
- **Server Port:** Vite dev server runs on port 5000, host `0.0.0.0`
- **Database ORM:** Drizzle ORM configured with PostgreSQL (`drizzle.config.ts` points to `shared/schema.ts`). Requires `DATABASE_URL` environment variable.
- **Schema Location:** `shared/schema.ts` (referenced by drizzle config)
- **Migrations:** Output to `./migrations` directory

### Data Storage
- **Primary Database:** Supabase (PostgreSQL). The Supabase client is initialized in `lib/supabase.ts`. All CRUD operations go through the Supabase JS client directly from the frontend.
- **Drizzle ORM:** Configured for PostgreSQL but currently the frontend bypasses it by using Supabase client directly. The Drizzle setup with `shared/schema.ts` is for the Express backend layer.
- **Key Tables:** `missions`, `clients`, `providers`, `vehicles`, `client_vehicles`, `client_routes`, `client_price_tables`, `provider_cost_tables`, `system_users`, `system_logs`, `financial_transactions`, `financial_accounts`, `financial_categories`, `commercial_proposals`, `quotes`, `provider_agents`

### Authentication & Authorization
- **Auth Method:** Custom authentication against a `system_users` table in Supabase (not Supabase Auth). User data is stored in `localStorage` after login.
- **Role-Based Access:** Roles include `Administrador`, `Diretoria`, `Avançado`, `Comercial`, and client-scoped users. Permissions are checked via `user.role` and `user.permissions` array (wildcard `*` for full access).
- **Biometric Login:** Optional biometric verification component using device camera + Gemini AI for face detection, plus geolocation capture.

### Key Modules
1. **Missions** — Full lifecycle management (Solicited → Documentation → Scheduled → Origin → In Transit → Completed/Cancelled/Refused) with status tracking, financial calculations, map visualization, and history logging.
2. **Clients** — Client management with price tables, vehicle fleets, routes, quotes, and commercial proposals. Supports client-type user login with restricted views.
3. **Providers** — Subcontractor management with cost tables, agent registration, and alvará (license) expiration tracking.
4. **Financial** — Complete financial module with accounts, categories (DRE structure), transactions, bank statement import/reconciliation via AI, daily cash movement, and financial reports.
5. **Billing** — Automated billing calculations matching missions to client price tables and provider cost tables, with AI-powered auditing.
6. **AI Features** — Chatbot, image generation, billing auditor, financial auditor, brand identity generator, bank statement analyzer — all powered by Google Gemini API.
7. **Reports** — Operational and financial reporting dashboards.
8. **System Admin** — User management, profile/permission management, system logs, server stats, cost optimization dashboard.

### AI Integration
- **Gemini AI** is provided by Replit AI Integrations — no user API key required
- All AI calls are proxied through server routes (`/api/chat` for chatbot, `/api/gemini/generate` for other AI features)
- Server routes use `AI_INTEGRATIONS_GEMINI_API_KEY` and `AI_INTEGRATIONS_GEMINI_BASE_URL` (auto-configured)
- Frontend components import `generateContent` from `lib/gemini.ts` which calls the server proxy
- AIChatbot calls `/api/chat` directly with SSE streaming

### Supabase Monitor (Server Status Page)
- **Component:** `components/ServerStats.tsx` — Enhanced with full Supabase monitoring panel
- **Backend Routes:** Added to `server/routes.ts`:
  - `GET /api/supabase/status` — REST API ping, Supabase platform incidents, scheduled maintenances
  - `GET /api/supabase/db-metrics` — Row counts and estimated sizes for all project tables
  - `GET /api/supabase/storage-usage` — Storage bucket listing with object counts and sizes
  - `GET /api/supabase/health-check` — Multi-service health check (Database, Auth, Storage, Realtime)
  - `GET /api/supabase/billing-links` — Direct links to Supabase dashboard pages
- **Frontend Tabs:** Overview (service health + incidents), Database (table-level metrics with bars), Storage (bucket usage), Links (billing/usage/logs dashboards)
- **Auto-refresh:** Every 60 seconds alongside existing API diagnostics

### Mission Report (`MissionFullReportModal`)
- `hideProviderInfo` prop: When true (client users), hides provider name, agent details (CPF/RG/CNV), vehicle, tracker from report HTML. Also filters audit entries for provider/agent/vehicle fields.
- Report opens in new browser tab as full HTML page with print/PDF support

### Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required for Drizzle/backend)
- `AI_INTEGRATIONS_GEMINI_API_KEY` / `AI_INTEGRATIONS_GEMINI_BASE_URL` — Auto-configured by Replit AI Integrations
- Supabase credentials are configured in `lib/supabase.ts`

## External Dependencies

### Third-Party Services
- **Supabase** — PostgreSQL database, storage, and real-time subscriptions. Used as the primary data layer accessed directly from the frontend via `@supabase/supabase-js`.
- **Google Gemini AI** (`@google/genai`) — Powers the AI chatbot, image generation, document analysis (OCR for bank statements, price tables), billing auditing, financial auditing, brand generation, and biometric verification.
- **Google Maps Platform** (`@react-google-maps/api`) — Maps display, directions/routing, distance calculation, place autocomplete, geocoding. API key configured in `lib/maps.ts`.
- **WDAPI** (`wdapi2.com.br`) — Brazilian vehicle plate lookup API for auto-filling vehicle data. Token and config in `constants.ts`.
- **Toll Calculator API** (`calcularpedagio.com.br`) — Toll cost calculation for routes. API key in `constants.ts`.
- **Z-API (WhatsApp)** — WhatsApp messaging integration. Instance ID and token in `constants.ts`.

### Key NPM Packages
- `react`, `react-dom` — UI framework
- `@supabase/supabase-js` — Supabase client
- `@google/genai` — Gemini AI SDK
- `@react-google-maps/api` — Google Maps React wrapper
- `lucide-react` — Icon library
- `html2canvas` + `jspdf` — PDF generation
- `express` — Backend server
- `drizzle-zod`, `zod` — Schema validation
- `tsx` — TypeScript execution for the server
- `p-limit`, `p-retry` — Concurrency and retry utilities

### Deployment
- **Vercel** — Configured via `vercel.json` with SPA rewrites and cache headers. The frontend builds with Vite (`vite build`).
- **Dev:** `npm run dev` starts the Express server via tsx which likely also serves the Vite dev server.