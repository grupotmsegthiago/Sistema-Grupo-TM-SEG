# Grupo TMSEG

Manages all operational aspects of a Brazilian security escort company, including missions, fleet, clients, finance, and AI-powered automation.

## Run & Operate

-   **Run Dev Server:** `npm run dev`
-   **Build:** `npm run build`
-   **Typecheck:** `npm run typecheck`
-   **Generate Drizzle Kit Migrations:** `npm run db:generate`
-   **Push DB Schema:** `npm run db:push` (Requires `DATABASE_URL` environment variable)

**Required Environment Variables:**
-   `DATABASE_URL`: Supabase PostgreSQL connection string.
-   `SUPABASE_URL`: Supabase project URL.
-   `SUPABASE_ANON_KEY`: Supabase public anon key.
-   `VITE_ZAPI_TOKEN`, `VITE_ZAPI_CLIENT_TOKEN`: Z-API (WhatsApp) credentials (frontend-proxied).
-   `ASAAS_API_KEY`: Asaas API key for TM GESTÃO.
-   `ASAAS_API_KEY_TMSECURITY`: Asaas API key for TM SECURITY.
-   `PLUGNOTAS_ENV`: `sandbox` or `production`.
-   `PLUGNOTAS_API_TOKEN_SANDBOX`, `PLUGNOTAS_API_TOKEN`: PlugNotas API tokens.
-   `DATAJUD_API_KEY`: DataJud integration API key.
-   `GOOGLE_GEMINI_API_KEY`: For AI features.
-   `VITE_GOOGLE_MAPS_API_KEY`: Google Maps Platform API key.
-   `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_HOST`, `EMAIL_PORT`: Nodemailer (Office 365) SMTP credentials.
-   `REPLIT_DEPLOYMENT_ID`: Replit deployment identifier for cache busting.
-   `VITE_APP_VERSION`: Application version for PWA updates.

## Stack

-   **Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS
-   **Backend:** Node.js, Express 5, `tsx`
-   **ORM:** Drizzle ORM (for schema management, direct Supabase JS client for operations)
-   **Database:** Supabase (PostgreSQL)
-   **State Management:** React Query v5
-   **Build Tool:** Vite

## Where things live

-   `/src/`: Frontend source code.
-   `/server/`: Backend source code.
-   `/db/`: Drizzle ORM database schema definition.
    -   `db/schema.ts`: Database schema source-of-truth.
-   `/lib/`: Shared utility functions and hooks.
    -   `lib/financialUtils.ts`: Single source of truth for financial calculations.
    -   `lib/queryClient.ts`: React Query client configuration.
    -   `lib/RealtimeProvider.tsx`: Global real-time synchronization.
-   `/components/`: Reusable React components.
-   `App.tsx`: Main application entry point and routing.
-   `index.tsx`: Frontend bootstrapping.
-   `server/routes.ts`: Backend API routes and middleware.

## Architecture decisions

-   **Supabase Exclusive Access:** All database interactions, both frontend and backend, exclusively use the Supabase JS client (`@supabase/supabase-js`). Direct `pg` driver connections are forbidden.
-   **Real-time Global Sync:** A single Supabase Realtime channel (`global-realtime-sync`) subscribes to changes across 23 tables, invalidating React Query caches and dispatching custom `window` events.
-   **Backend AI Proxying:** All AI calls are proxied through server routes to protect API keys and integrate with Replit AI Integrations (Google Gemini).
-   **Immutable Financial Snapshots:** Upon billing approval, a frozen snapshot of all financial values is stored directly on the mission record (`snapshot_data`) to ensure immutability and prevent discrepancies from future price table changes.
-   **Client/Provider Table Selection Logic:** Provider table selection prioritizes a score-based matching algorithm over "lowest cost" optimization, with manual overrides taking precedence. Strict franchise rules are applied for specific clients.
-   **Motor de cálculo automático de fornecedor (Task #55):** Quando um fornecedor tem uma linha mestre em `provider_cost_tables` com `operation_type = '__AUTO_MASTER__'`, `lib/financialUtils.ts` desvia para o motor em `lib/providerAutoPricing.ts` e ignora as tabelas manuais desse fornecedor para novos cálculos de custo. Faixas de 100→3000 km (corte em 51), franquia de horas = `ceil(km_faixa / 40)`, Regra de Ouro do tempo (`max(scheduled_time, start_time)`). Escopo: somente `cost_value`; não toca receita do cliente nem pedágio.

## Product

-   **Mission Management:** Full lifecycle management of security escort missions.
-   **Client & Provider Management:** Comprehensive client and subcontractor data.
-   **Financial Management:** Transaction tracking, account balances, and category management.
-   **Billing & Invoicing:** Automated billing, invoice generation, and AI-powered auditing.
-   **AI Features:** Chatbot, image generation, operational auditing, spreadsheet comparison, and intelligent report generation.
-   **Reporting:** Operational and financial dashboards with interactive filtering.
-   **User & Access Control:** Role-based access control with custom authentication.
-   **Jurídico Integration:** DataJud/CNJ API integration for legal process consultation.
-   **Real-time Updates:** Live synchronization across the application for mission statuses and data changes.
-   **Geographic Positioning:** Server-side reverse geocoding with Nominatim/Photon fallback and caching.
-   **Contract Management:** Client contract CRUD with PDF generation.
-   **Equipment Management:** Standalone module for tracking company assets.

## User preferences

Preferred communication style: Simple, everyday language.

## Gotchas

-   **Database is the Single Source of Truth for Financials:** The frontend **NEVER** calculates financial totals independently. All financial displays (Spreadsheet Comparer, Financial Summary, reports) must show `revenue_value + toll_value` as recorded in the database. Editing in the Financial Modal and saving makes that value canonical. Do not reintroduce frontend-based calculations, as this causes cent discrepancies and caching errors.
-   **Communication Systems (In-app, Push, WhatsApp, Email):** Avoid external URLs for notification sounds, always deduplicate in-app notifications, rely on `supabase-js` for Realtime reconnects, persist push subscriptions in DB, proxy WhatsApp API calls through backend, and use array format for BCC emails.
-   **PWA / Version Updates:** Always bump `APP_VERSION` in `constants.ts` for critical logic changes. `sw.js` must be network-only. Do not use `Date.now()` for `sw.js` stamps; use a stable `REPLIT_DEPLOYMENT_ID` and `APP_VERSION`. Do not force `window.location.reload()` on `controllerchange` events.
-   **Tailwind `group-hover`:** Do not use `group-hover` alone for expanding content on touch devices (iOS). Combine with `isOpen` prop for mobile compatibility.
-   **Authentication Token Security:** Frontend must never directly access `WHATSAPP_API_CONFIG` URLs; always route through authenticated backend proxies to protect API tokens.

## Pointers

-   **Supabase Docs:** [https://supabase.com/docs](https://supabase.com/docs)
-   **React Query Docs:** [https://tanstack.com/query/latest](https://tanstack.com/query/latest)
-   **Tailwind CSS Docs:** [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
-   **Drizzle ORM Docs:** [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
-   **Replit AI Integrations:** Refer to Replit's documentation on integrating Google Gemini.
-   **Asaas API Docs:** [https://docs.asaas.com/](https://docs.asaas.com/)
-   **PlugNotas API Docs:** [https://documenter.getpostman.com/view/1744927/UVsMzsWc](https://documenter.getpostman.com/view/1744927/UVsMzsWc)
-   **Nodemailer Docs:** [https://nodemailer.com/](https://nodemailer.com/)
-   **Nominatim Usage Policy:** [https://operations.osmfoundation.org/policies/nominatim/](https://operations.osmfoundation.org/policies/nominatim/)