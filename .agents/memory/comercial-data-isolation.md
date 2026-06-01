---
name: Comercial profile data isolation
description: How the COMERCIAL user role is scoped to only its own records across list components; pitfalls when adding new lists.
---

# Comercial profile data isolation

There is NO RLS in this project. Data isolation for the `comercial` profile is enforced 100% in the frontend via Supabase query filters. A comercial user must only see what they created.

## Identity / guard
- Ownership of a record = `created_by === user.name` (the NAME string is stored, not the id). Legacy rows have `created_by = null` and are therefore invisible to comercial users (intended).
- The guard for "owner-scoped comercial" is always: `role === 'comercial' && !permissions.includes('*')`. Never gate on role alone — a `*` permission must bypass scoping.
- Comercial also keeps visibility of clients linked via `client_view:<id>` permissions (vinculados), so client/mission/quote scoping uses `created_by.eq.<name>` OR `id.in.(<client_view ids>)`. This OR is intentional, not a leak.

## Two users sharing a first name
- Two staff records share the same first name: one is a Diretoria (director, full access), the other is a comercial user (must be scoped).
- Any director-identity check done by matching a name substring MUST use the fuller/more-specific substring (first + last name), never the bare first name, or the comercial user is wrongly elevated. This applies to financial visibility AND the billing approval-stage routing.

## Pitfalls when adding a new list component
- **First-load race:** if `isCommercial` is a `useState` set inside the same effect that also calls the fetch, the first fetch reads the stale `false` and returns ALL rows. Either derive the guard from the local user object inside the fetch, or gate the query with React Query `enabled: !!currentUser` + put the flag in the `queryKey`.
- **Filter at the query, not in JS.** With no RLS, fetching everything then filtering in JS still ships other users' rows over the network. Push `.eq`/`.in` into the Supabase query.
- **Empty-allowed-list sentinel:** for a TEXT column (e.g. `provider` name) use `.in('provider', names.length ? names : ['__NONE__'])`. Do NOT use a string sentinel on a numeric/uuid id column — it throws a type error; instead early-return an empty result when the allowed-id list is empty.
- Sub-resource lists relate to owners by different keys: vehicles/agents by `provider` NAME; client_vehicles/client_routes via the `clients` join `created_by`; system_users by `client_id`/`provider_id` (resolve the comercial's own client/provider ids first).
