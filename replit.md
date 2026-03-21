# Grupo TMSEG - Sistema de Gestão Operacional

## Overview

Grupo TMSEG is a comprehensive operational management system designed for a Brazilian security escort company. Its primary purpose is to streamline and manage all facets of the business, including escort missions, fleet vehicles, clients, subcontractors, financial operations, billing, contracts, and advanced AI-powered functionalities. The system aims to enhance operational efficiency, improve financial oversight, and provide intelligent automation for tasks like reporting, auditing, and communication. Key capabilities include full mission lifecycle management, detailed client and provider management, a robust financial module, automated billing with AI auditing, and various AI features for enhanced decision-making and task automation. The business vision is to become the leading operational management solution in the security escort sector, leveraging AI for unparalleled efficiency and financial control.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18, TypeScript, and Vite 5, utilizing Tailwind CSS for styling. UI aesthetics, including layout, colors, and button positioning, are frozen and should not be modified. Custom CSS classes and JS-based `--vh` CSS variables ensure iOS/Safari compatibility.

### Backend Architecture
The backend is built with Node.js and Express 5, using `tsx` for TypeScript execution. It integrates with Drizzle ORM for PostgreSQL. All AI calls are proxied through server routes, utilizing Replit AI Integrations for Google Gemini.

### Data Storage
The primary database is Supabase (PostgreSQL), with the Supabase JS client used directly from the frontend for CRUD operations. The backend also uses Drizzle ORM for PostgreSQL. Key tables include `missions`, `clients`, `providers`, `vehicles`, `system_users`, `financial_transactions`, `commercial_proposals`, `operational_reports`, `financial_invoices`, and `system_logs`.

### Authentication & Authorization
Authentication is custom, using a `system_users` table in Supabase, with user session data stored in `localStorage`. The system implements role-based access control with roles like `Administrador`, `Diretoria`, `Avançado`, and `Comercial`. Email verification with a 6-digit code is required for user creation.

### Key Modules & Features
The system encompasses modules for **Missions**, **Clients**, **Providers**, **Financial Management**, and **Billing**, with advanced **AI Features** for chatbot, image generation, auditing, and analysis. **Reports** provide operational and financial dashboards. **System Admin** handles user, profile, and permission management.

**Specific Features:**
-   **AI-Powered Spreadsheet Comparison Module:** Analyzes pasted spreadsheet data against system values, highlighting divergences and recommending corrections.
-   **CEVA + Jundiaí Price Table Intelligence:** Automatically adjusts price table selection for the CEVA client based on distance and location.
-   **Mission Reporting:** Generates detailed, AI-powered operational reports with client-specific views and PDF export.
-   **Toll Calculation:** Manual entry with persistence, defaulting to R$ 0,00 if no saved value exists.
-   **Franchise Financial Calculation:** Implements strict franchise rules for extra KM and hours, with tolerance-based auditing and prioritizing user-saved values. Critical rule: `isFixedDistanceClientRule` / `isFixedDistanceProviderRule` must ONLY activate for truly fixed-distance tables. Tables with "ATÉ", "ATE" + any non-word character + digit, or "FAIXA" are FRANCHISE tables and must NEVER be treated as fixed distance. Detection uses `/\bATE\W*\d/i` regex to catch ALL unicode variants (´ ' ` ′ ˊ ʼ etc.).
-   **Provider Lowest Cost Selection:** After initial table matching by region/distance, the system calculates the total cost (base + extra km + extra hour) for ALL candidate provider tables and automatically selects the one with the lowest total cost. This ensures optimal provider payment — e.g., a 100km table + extras may be cheaper than a 200km table base. Manual table overrides bypass this optimization. The detection log shows the comparison (e.g., "Menor Custo: ATÉ 100KM (R$634) vs ATÉ 200KM (R$800)").
-   **Billing Approval Flow with Data Snapshot:** A three-stage approval process (Auditor → Financeiro → Diretoria). Barbara (Financeiro) can approve independently of Daniel (Auditor), skipping the auditor stage. When Barbara or Thiago (Diretoria) approves, the system creates a **Data Snapshot** — a frozen copy of all financial values (route, activation fee, franchise KM/hours, extras, tolls, total) saved to `snapshot_data` (JSONB), `snapshot_approved_by`, and `snapshot_approved_at` columns on the missions table (with fallback to `BillingSnapshot` in system_logs). The billing report uses snapshot data directly without recalculation, ensuring immutability. A lock icon and "Dados Congelados" banner indicate frozen missions. Regular operators cannot edit frozen data — only Financeiro or Diretoria can modify after snapshot.
-   **Operational Data Division:** MissionFinancialModal divides operational data into "Dados Cliente" and "Dados Fornecedor", with provider data initially copying client data and becoming independently editable.
-   **Mandatory Reason for Value Changes:** Manual changes to final client revenue or provider payment values require a justification, recorded in `revenue_edit_reason` and `cost_edit_reason` in the `missions` table.
-   **Automated Status Transitions & Email Notifications:** Automated status updates based on data entry (e.g., provider selection, vehicle/agent assignment) triggering client confirmation emails.
-   **Parent Mission Linking (`OS Mãe`):** Allows linking related missions for traceability, indicated by a "MÃE" badge on MissionCards.
-   **Odometer Anomaly Validation:** System flags and warns about significant discrepancies between `kmRodado` and planned distance, suppressing auto-calculation.
-   **Client Portal & Restricted View:** Clients can create mission requests, and the system restricts their view to relevant information, hiding internal data.
-   **Dashboard Click-to-Filter:** PowerBI-style interactive filtering on all dashboard charts.
-   **Third-Party Financial Closing Workflow:** A 6-step manual financial closing process (Payables, Receivables, Invoicing, Reconciliation, Control Report, Finalization) with dedicated tables for invoices.
-   **Vendor Billing Verification Control (`Controle OS Fornecedor`):** Module for verifying provider payments, with fields for OS number, invoice, and payment date, including `verified_by` and `verified_at` tracking.
-   **Automated Quarterly Data Cleanup:** Server-side cleanup of old `mission_history` and `mission_logs` entries every 90 days in batches.

## External Dependencies

### Third-Party Services
-   **Supabase:** Primary PostgreSQL database, storage (for `mission-evidence` bucket), and real-time services (for push notifications and client solicitation toasts).
-   **Google Gemini AI:** Powers all AI-driven features (chatbot, image generation, auditing, analysis, spreadsheet comparison).
-   **Google Maps Platform:** Provides mapping, routing, distance calculation, and geocoding functionalities.
-   **WDAPI:** Used for Brazilian vehicle plate lookup.
-   **Rotas Brasil API / calcularpedagio.com.br:** External APIs for toll cost calculation.
-   **Z-API (WhatsApp):** Integrates WhatsApp messaging capabilities.
-   **Resend API:** Used for sending email verification codes.
-   **Nodemailer (Office 365 SMTP):** Automated email system for mission notifications and welcome emails, with strict commercial confidentiality.
-   **Asaas Payment Gateway:** Multi-company support — two Asaas accounts configured: **TM GESTÃO** (CNPJ 60.485.843/0001-57, env: `ASAAS_API_KEY`) and **TM SECURITY** (CNPJ 60.508.931/0001-27, env: `ASAAS_API_KEY_TMSECURITY`). The `issuer_company` field on the `clients` table determines which Asaas account is used for charges. The `asaasService.ts` `resolveApiKey(company)` function maps company names to the correct API key.

### Deployment
-   **Vercel:** Used for frontend deployment.