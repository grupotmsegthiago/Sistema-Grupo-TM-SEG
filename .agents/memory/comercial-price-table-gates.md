---
name: Comercial price/cost table registration gates
description: Which gates control whether the comercial role can register client price tables and provider cost tables.
---

Enabling the `comercial` role to register pricing tables requires touching gates in DIFFERENT places for client vs provider — the two are not symmetric.

- **Client price tables** (`client_price_tables`): the form's value inputs (activation fee, extra km/hour, preservation, cancellation) are `readOnly={!isFinanceAdmin}` in the client price form. `isFinanceAdmin` there is a role allowlist; comercial must be in it or the user opens the form but cannot type any price (fields are also `required`, so submit is impossible). This form historically used capitalized role strings (`'Diretoria'`); add comercial with a case-insensitive check.
- **Provider cost tables** (`provider_cost_tables`): the provider form's costs tab already allows comercial (its own `isFinanceAdmin` includes `comercial`). The real upstream block was the provider LIST: the edit (pencil) button that opens the provider form was gated to admin-only. Comercial needs that edit button to reach the costs tab for existing providers. Keep the block/unblock-provider (status toggle) admin-only — only the edit/open action should open up.

**Why:** tables are inserted directly via supabase-js (no RLS, no backend insert route), so all gating is frontend; "can't register" almost always means a hidden/disabled UI gate, not a 403.

**How to apply:** comercial visibility/isolation stays intact — provider list still filters by `created_by` for comercial, so they only edit their own providers. Don't grant delete/admin. Role string casing is inconsistent across files (some lowercase, some capitalized like `'Comercial'`); always compare case-insensitively. Comercial also needs the relevant Sidebar permission IDs provisioned per-user to even see the screens — that's config, not code.
