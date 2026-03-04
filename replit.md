# Grupo TMSEG - Sistema de Gestão Operacional

## Overview

Grupo TMSEG is a comprehensive operational management system designed for a Brazilian security escort company. Its primary purpose is to streamline and manage all facets of the business, including escort missions, fleet vehicles, clients, subcontractors, financial operations, billing, contracts, and advanced AI-powered functionalities. The system aims to enhance operational efficiency, improve financial oversight, and provide intelligent automation for tasks like reporting, auditing, and communication. Key capabilities include full mission lifecycle management, detailed client and provider management, a robust financial module, automated billing with AI auditing, and various AI features for enhanced decision-making and task automation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18, TypeScript, and Vite 5, utilizing Tailwind CSS for styling. Google Maps is integrated for geolocation and routing. PDF generation uses `jsPDF` and `html2canvas`. State management relies on local component state with React hooks and `localStorage` for user sessions. The UI aesthetics, including layout, colors, and button positioning, are frozen and should not be modified. Custom CSS classes `h-screen-ios` and JS-based `--vh` CSS variable ensure iOS/Safari compatibility.

### Backend Architecture
The backend is built with Node.js and Express 5, using `tsx` for TypeScript execution. It integrates with Drizzle ORM for PostgreSQL. All AI calls are proxied through server routes, utilizing Replit AI Integrations for Google Gemini.

### Data Storage
The primary database is Supabase (PostgreSQL), with the Supabase JS client used directly from the frontend for CRUD operations. The backend also uses Drizzle ORM for PostgreSQL. Key tables include `missions`, `clients`, `providers`, `vehicles`, `system_users`, `financial_transactions`, and `commercial_proposals`. Operational reports are stored in a separate `operational_reports` table within Replit PostgreSQL.

### Authentication & Authorization
Authentication is custom, using a `system_users` table in Supabase, with user session data stored in `localStorage`. The system implements role-based access control with roles like `Administrador`, `Diretoria`, `Avançado`, and `Comercial`. Client users can create new users with specific permission modules. Email verification with a 6-digit code is required for user creation.

### Key Modules & Features
The system encompasses modules for **Missions**, **Clients**, **Providers**, **Financial Management**, and **Billing**, with advanced **AI Features** for chatbot, image generation, auditing, and analysis. **Reports** provide operational and financial dashboards. **System Admin** handles user, profile, and permission management.

**Specific Features:**
-   **Investment Dashboard:** Manages investment accounts with analytics and AI analysis.
-   **Supabase Monitor:** Provides real-time health checks and database metrics.
-   **Toll Calculation:** Dynamically calculates toll costs for routes using external APIs.
-   **CEVA + Jundiaí Price Table Intelligence:** Automatically adjusts price table selection for the CEVA client based on distance and location.
-   **Mission Report:** Generates detailed, AI-powered operational reports with client-specific views and PDF export.
-   **Excel Comparison Module:** Compares uploaded Excel OS values with the system, highlighting divergences and suggesting corrections via AI.
-   **Client Portal OS Request:** Allows client users to create escort requests with specific service and incident types.
-   **Dashboard Click-to-Filter (PowerBI-like):** Enables interactive data filtering on dashboards with visual feedback and brand-specific color schemes for CEVA clients.
-   **Franchise Financial Calculation:** Implements strict franchise rules for extra KM and hours, with tolerance-based auditing and prioritization of user-saved values.
-   **Provider-Specific Sorting & Filtering:** Client and provider lists are sorted alphabetically, and specific business logic filters client tables for providers like MACOR.
-   **3-Step Billing Approval Flow:** Implements a three-stage approval process (Auditor → Financeiro → Diretoria) for mission billing, with detailed logging and progress visualization. Missions with "Pendente" status cannot be approved.
-   **Client Billing Visibility:** Mission cards for clients display "Faturamento Cliente" (revenue) and breakdown of extra hours/KM, without exposing provider data.

## External Dependencies

### Third-Party Services
-   **Supabase:** Primary PostgreSQL database, storage, and real-time services.
-   **Google Gemini AI:** Powers all AI-driven features (chatbot, image generation, auditing, analysis).
-   **Google Maps Platform:** Provides mapping, routing, distance calculation, and geocoding functionalities.
-   **WDAPI:** Used for Brazilian vehicle plate lookup.
-   **Rotas Brasil API / calcularpedagio.com.br:** External APIs for toll cost calculation.
-   **Z-API (WhatsApp):** Integrates WhatsApp messaging capabilities.
-   **Resend API:** Used for sending email verification codes during user creation.

### PWA & Push Notifications
-   **PWA:** The app is configured as a Progressive Web App with `manifest.json` and `sw.js` in `client/public/`. Users can install it on mobile via "Add to Home Screen".
-   **Push Notifications:** Uses Supabase Realtime to listen for new mission INSERTs on the `missions` table. When a new OS is created, a browser push notification is shown via the Service Worker. The `PushNotificationManager` component in `App.tsx` handles this. Requires Supabase Realtime to be enabled for the `missions` table.
-   **Evidence Upload:** Uses `mission-evidence` bucket in Supabase Storage. Evidence logs are stored in `system_logs` table with `entity='MissionEvidence'`. The `created_by` column does NOT exist in `system_logs`.

### Deployment
-   **Vercel:** Used for frontend deployment, configured with SPA rewrites and cache headers.