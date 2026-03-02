# Grupo TMSEG - Sistema de Gestão Operacional

## Overview

Grupo TMSEG is a comprehensive operational management system designed for a Brazilian security escort company. Its primary purpose is to streamline and manage all facets of the business, including escort missions, fleet vehicles, clients, subcontractors, financial operations, billing, contracts, and advanced AI-powered functionalities. The system aims to enhance operational efficiency, improve financial oversight, and provide intelligent automation for tasks like reporting, auditing, and communication. Key capabilities include full mission lifecycle management, detailed client and provider management, a robust financial module, automated billing with AI auditing, and various AI features for enhanced decision-making and task automation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18 and TypeScript, using Vite 5 for tooling. Styling is managed with Tailwind CSS. Google Maps is integrated for geolocation and routing. PDF generation uses `jsPDF` and `html2canvas`. Navigation is state-driven via a sidebar, and state management relies on local component state with React hooks, complemented by `localStorage` for user session data and a `NotificationContext` for app-wide alerts. The UI aesthetics, including layout, colors, and button positioning, are frozen and should not be modified.

### Backend Architecture
The backend is built with Node.js and Express 5, using `tsx` for TypeScript execution. It integrates with Drizzle ORM for PostgreSQL. All AI calls are proxied through server routes, utilizing Replit AI Integrations for Google Gemini.

### Data Storage
The primary database is Supabase (PostgreSQL), with the Supabase JS client used directly from the frontend for CRUD operations. The backend also has Drizzle ORM configured for PostgreSQL, referencing a `shared/schema.ts`. Key tables include `missions`, `clients`, `providers`, `vehicles`, `system_users`, `financial_transactions`, and `commercial_proposals`.

### Authentication & Authorization
Authentication is custom, using a `system_users` table in Supabase. User session data is stored in `localStorage`. The system implements role-based access control with roles like `Administrador`, `Diretoria`, `Avançado`, and `Comercial`. Optional biometric login with Gemini AI for face detection and geolocation is available.

### Key Modules
1.  **Missions:** Manages the full lifecycle of escort missions, including status tracking, financial calculations, and map visualization.
2.  **Clients:** Handles client information, price tables, vehicle fleets, and commercial proposals.
3.  **Providers:** Manages subcontractors, their cost tables, agents, and license tracking.
4.  **Financial:** Provides a comprehensive financial module with accounts, categories, transactions, bank statement processing, and reports.
5.  **Billing:** Automates billing calculations, matching missions to client and provider rates, with AI-powered auditing.
6.  **AI Features:** Integrates Google Gemini for a chatbot, image generation, billing/financial auditing, brand identity generation, and bank statement analysis.
7.  **Reports:** Offers operational and financial dashboards.
8.  **System Admin:** Includes user, profile, and permission management, system logs, and server statistics.

### Key Features and Integrations
-   **Investment Dashboard:** Manages investment accounts, tracks balance snapshots, and provides analytical charts (Recharts) with AI analysis capabilities.
-   **Supabase Monitor:** A server status page providing real-time health checks, database metrics, storage usage, and direct links to Supabase dashboards.
-   **Toll Calculation API:** Dynamically calculates toll costs for routes using primary and fallback external APIs, integrating these costs into mission forms.
-   **CEVA + Jundiaí Price Table Intelligence:** Implements specific business logic to automatically adjust price table selection for the CEVA client based on distance and location, preventing overbilling.
-   **Mission Report:** Generates detailed mission reports with configurable visibility for client users, hiding sensitive provider information.
-   **Excel Comparison Module:** Upload Excel spreadsheets to compare OS values (revenue/cost) with the system. Auto-detects OS number, revenue and cost columns. Shows divergences in a table with color-coded status (OK, DIVERGENTE, AJUSTADO, ALTERADO, NÃO ENCONTRADA). Clicking a divergent OS opens `MissionFinancialModal` for correction; after saving, the comparison table auto-recalculates system values and shows "AJUSTADO" (if now matching) or "ALTERADO" (if manually changed but still divergent). KPI cards include "Ajustados" count when applicable. Gemini AI analyzes divergences and suggests corrective actions. Located in `ExecutiveDashboard.tsx`.
-   **Client Portal OS Request:** Client users can create escort requests ("Solicitar Escolta") via `ClientMissionRequest.tsx`. Creates missions with status "Solicitada" and `current_location` tag "Solicitação via Portal". Internal users see a blinking "Solicitações" badge with count of pending client-created requests. Form includes: service type (Escolta Armada = Caracterizada, Pronta Resposta), incident type (Acionamento Normal, Acidente), and immediate timing option. Accidents trigger "🚨 ACIDENTE" in current_location and a separate red flashing ACIDENTE badge for internal users.
-   **Dashboard Click-to-Filter (PowerBI):** `ClientExecutiveDashboard.tsx` supports clicking on chart bars, pie slices, and legend items to filter dashboard data. Active filter shown with indicator bar and "Limpar Filtro" button. Supports filtering by status, operation type, route, vehicle, distance range, weekday, and daily date. Charts use CEVA Logistics brand colors (#9E0032 primary red, #021D49 navy blue). Visual feedback: non-selected pie slices dim to 25% opacity, non-selected bars dim to 20% opacity, charts of a different filter type globally dim to 50% opacity. Legend items of non-selected values dim to 35% opacity with scale animation on active item. All derived data (KPIs, vehicle ranking, route ranking, monthly trend) recalculates from `filtered` dataset. Monthly trend uses `filtered` (not raw `missions`).
-   **Franchise Financial Calculation:** `financialUtils.ts` enforces strict franchise rules: KM_Extra = Max(0, Real_KM - Franchise_KM), Hour_Extra = Max(0, Real_Hours - Franchise_Hours). Special rule: ≤200km AND ≤2h = minimum activation only (no extras). `auditMissionFinancials()` compares stored vs calculated values with R$5 tolerance, flags divergent missions. MissionCard shows "Divergente" amber badge, MissionFinancialModal shows audit alert with "Aplicar Tabela Oficial" button.
-   **Thin Scrollbars:** `.scrollbar-thin` CSS class in `client/index.html` for visible thin scrollbars on notebook/mobile. Main content area uses thin scrollbar instead of hidden.
-   **iOS/Safari Compatibility:** Custom `h-screen-ios` CSS class replaces `h-screen` for full-height containers, using `-webkit-fill-available` and `100dvh` fallbacks. JS-based `--vh` CSS variable for accurate viewport height on iOS. Global error overlay (`#ios-error-overlay`) captures `window.onerror` and `unhandledrejection` to display errors visually on iPhone. Viewport meta includes `viewport-fit=cover` and Apple PWA meta tags. Vite build target set to `safari13`. All external URLs use `https://` (no mixed content). `-webkit-transform` prefixes on animations.
-   **Operational Report (AI):** `MissionOperationalReport.tsx` generates professional operational reports using Gemini AI. Internal editors (Diretoria/Administrador/Avançado) see a form with: "Acionado por", "Descritivo da Operação" (context for AI), WhatsApp conversation paste (auto-generates anonymized timeline), KM Initial/Final photo uploads, local photos with dynamic slots. Client view shows read-only generated report. AI uses "Agente de Campo" terminology (never "Equipe Operacional"), objective/imparcial tone in security analysis. Report sections: Síntese Operacional, Diligência e Constatações, Análise de Segurança, Cronologia Operacional. Data layout separated: Dados da Operação, Dados do Veículo, Agente de Campo, Quilometragem — each in its own section with individual rows. Vectorized TMSEG logo SVG + CEVA logo. PDF export via `html2canvas` + `jsPDF`. **Persistence:** Reports are stored in `operational_reports` table (Replit PostgreSQL, NOT Supabase) with `mission_id UNIQUE` constraint. UPSERT logic prevents duplicates. Server routes: `GET /api/missions/:id/operational-report`, `PATCH /api/missions/:id/operational-report`. Stores: report_html, acionado_por, descritivo, whatsapp_raw, photos (JSONB). Table auto-created on server start.
-   **CEVA Client Branding:** When `isRestrictedClientView` and client is CEVA, the header uses navy (#152c54) background with CEVA logo (mix-blend-lighten for transparency), red (#e81818) accent buttons. Non-CEVA clients use default styling.
-   **Toll Value Provider:** Separate `toll_value_provider` field for provider tolls. All cost calculations (ExecutiveDashboard, MissionCard, BillingControlCenter, MissionTable) use `toll_value_provider` with fallback to `toll_value`. Save logic tries with column first, falls back without if column doesn't exist in DB.
-   **Client Billing on MissionCard:** When `hideProviderInfo` is true (client view), MissionCard computes `financials` and shows "Faturamento Cliente" (revenue value), plus extra hour and extra km breakdowns when applicable. No provider data is exposed. An "Hora Extra Ativa" 3D yellow banner with gradient, shadow, and pulse animation appears at the top of the card when the mission is `IN_TRANSIT` and has exceeded franchise hours, showing the excess hours count.
-   **Client User Permissions:** When a client user creates new users for their company (`UserForm.tsx`, `isClientUser === true`), a checklist of permission modules is available (dashboard, missions, client-users, client-vehicles, client-routes, fin-billing, client-reports, client-mission-request, operational-reports). Selected permissions are saved to the `permissions` array in `system_users`. Default permissions: dashboard and missions.
-   **Memória Evolutiva Provider Validation:** `fetchHistoricalPatterns` in `MissionFinancialModal.tsx` validates that a memorized `providerTableId` belongs to the same provider as the current mission before applying it. This prevents cross-provider table contamination when the same route was previously approved with a different provider. When memory doesn't match the provider, auto-detection from `financialUtils.ts` runs normally.

## External Dependencies

### Third-Party Services
-   **Supabase:** Primary PostgreSQL database, storage, and real-time services.
-   **Google Gemini AI:** Powers all AI-driven features (chatbot, image generation, auditing, analysis).
-   **Google Maps Platform:** Provides mapping, routing, distance calculation, and geocoding functionalities.
-   **WDAPI:** Used for Brazilian vehicle plate lookup to auto-fill vehicle data.
-   **Rotas Brasil API / calcularpedagio.com.br:** External APIs for toll cost calculation.
-   **Z-API (WhatsApp):** Integrates WhatsApp messaging capabilities.

### Email Verification (User Creation)
-   **Resend API:** Used for sending email verification codes during user creation. Flow: fill form → send 6-digit code to email → user confirms code → define strong password → user created. Server routes: `POST /api/email/send-verification`, `POST /api/email/verify-code`. Codes stored in-memory with 10-min expiration. Password requirements: 8+ chars, uppercase, lowercase, number, special character.

### Deployment
-   **Vercel:** Used for frontend deployment, configured with SPA rewrites and cache headers.