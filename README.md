# Gathos Admin

Internal Next.js administration console for managing Gathos platform records. The interface uses
the App Router and a compact, Django Admin/Unfold-inspired design while keeping all data access
behind the existing FastAPI admin authorization checks.

## Managed resources

- Users
- API keys
- Security blocklist entries
- Meta deletion requests
- Newsletter subscribers
- Affiliates
- Generations
- GPUs and ML services (including collector configuration and credentials)

## GPU and service registry

Open **GPUs & Services** in the sidebar (`/gpus`). **Add GPU** registers a server,
its required collector and one or more image, image-to-image, TTS, video or music
services. Open a GPU to edit endpoints and credentials or use **Add service** to
attach another product to the same GPU. Existing services are retained on edits.
Draining stops new work while allowing an active execution to finish.

Credentials are submitted through the authenticated admin BFF and encrypted by
the backend; saved secrets are never read back into the form. Create requests
use idempotency keys, and updates use the GPU revision to prevent overwriting
concurrent edits. Failed, ambiguous saves retain their original request for retry
while the form remains open. Reload the saved record to resolve conflicting edits.

The backend requires migrations `0013` and `0014`, its registry encryption key,
and approved GPU hosts/IP ranges before registration. Configure its proxy webhook
to publish changes automatically. See the [backend setup guide](../backend/docs/compute-registry.md)
and [proxy setup guide](../KokoLearn-RedisProxy/docs/compute-registry.md).
GPU inventory status is desired configuration and reservation state; use
**GPU health** for the existing scheduler health view.

## Local development

The FastAPI project uses port `8000`, so the admin frontend runs on port `3000`.

1. Copy `.env.example` to `.env.local` and adjust the backend origin if needed.
2. Install dependencies with `npm install`.
3. Start FastAPI from `backend/` on `http://localhost:8000`.
4. Run `npm run dev` from this directory.
5. Open `http://localhost:3000`.

The production session cookie is scoped to `.gathos.com`, allowing the main application and
`admin.gathos.com` to share the signed `gathos_session` cookie. Local cookies are host-only.

## Environment variables

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `BACKEND_URL` | Server only | FastAPI origin used by server rendering and the BFF. |

Production values should resemble:

```dotenv
BACKEND_URL=https://backend.gathos.com
```

## Authentication and API flow

The protected route-group layout rejects missing sessions locally. When server-only
`SESSION_SECRET` matches FastAPI, it also verifies signatures and expiry locally.
Valid sessions still forward the session cookie to
`GET /api/admin/check`. Access fails closed unless FastAPI returns `isAdmin: true`; there is no
frontend or development bypass.

The Admin login is separate from the landing and dashboard login screens. It offers email and
password only and submits to FastAPI's dedicated `POST /api/admin/login` through the same-origin
BFF. FastAPI verifies the password, current account state, and admin role before issuing a
time-limited `gathos_session` cookie. The browser then navigates directly to the requested Admin page, where the layout
checks current permission. Login no longer makes a duplicate browser-side check.
Admin permissions are never cached.

Browser-side requests use the same-origin endpoint:

```text
/api/backend/<fastapi-path>
```

The catch-all route forwards the method, query string, request body, cookies, response status,
response body, and `Set-Cookie` headers. For example:

```text
GET /api/backend/api/admin/resources/users?page=1&page_size=25
    → http://localhost:8000/api/admin/resources/users?page=1&page_size=25
```

For safety, the BFF exposes only `/api/admin/*` and `/api/auth/logout`. FastAPI remains the source
of truth for session-cookie creation, administrator permission, and logout.

## Customizing list columns

Each managed resource declares a Django-style `listDisplay` array in `lib/resources.ts`. Reorder,
add, or remove descriptors in that array to change the columns without editing the generic table
component. A descriptor names the physical database field used for sorting and may optionally use
a nested value returned by FastAPI for display:

```ts
listDisplay: [
  { name: "name", label: "Name", sortable: true },
  {
    name: "user_id",
    label: "User",
    display: {
      primaryPath: "user.name",
      secondaryPath: "user.email",
      fallbackPaths: ["user.email", "user_id"],
    },
  },
]
```

Related labels are intentionally not sortable: sorting `user_id` would order UUIDs while the
screen appears to show names. Add an explicit related-name sort to FastAPI before enabling it.

## Customizing record pages

List rows open dedicated record pages instead of overlay drawers:

```text
/<resource>/<record-id>       read-only record view
/<resource>/<record-id>/edit  configurable change form
```

The `fields` array in `lib/resources.ts` is the Django-style editable field list used by create and
change forms. Reorder, add, or remove entries there to customize a resource form. An optional
`detailDisplay` string array controls the preferred order on the read-only page; any other safe
fields returned by FastAPI follow it. Detail field names are deduplicated automatically when they
also appear in `listDisplay` or `fields`.

## Commands

```bash
npm run dev        # Next.js development server on port 3000
npm run build      # Production build
npm run start      # Serve the production build on port 3000
npm run lint       # ESLint with Next.js Core Web Vitals rules
npm run typecheck  # TypeScript without emitting files
```

## Catalog management

Products, product routes, plans, and plan limits are managed through the catalog
sections and `/api/admin/catalog/*`. Apply backend migration
`0006_live_plan_management` before deploying these controls.

Editing an active plan or its allowance updates the existing plan in place and
affects every user assigned to it. Zero blocks the measured usage; an absent
rule imposes no limit for that metric and window. Used rules retain their metric,
window, and scope to preserve usage accounting; add a separate rule to change
those semantics.

For an individual exception, create a plan with a unique code and Public disabled,
configure its products and limits, then select it in the user's Plan field.
Existing provider subscriptions can retain their billing when assigned a private
plan; granting paid access without a subscription requires the comped setting.

`SESSION_SECRET` is optional for rollout: unset deployments retain backend verification.
Keep it server-only; configuring it gives this server signing capability as well as verification.

GPU health at `/gpu-health` now reads registered GPUs and their collectors through
admin-only backend endpoints. The inventory includes every product and refreshes
every 15 seconds while visible. Selecting a GPU shows system/device measurements,
configuration and reservation state. Collector telemetry is distinct from model
readiness; unreachable, stale and mismatched collectors are explicitly labeled.
Hardware UUIDs select one device; without a UUID the page labels device data as
covering the whole collector host. Collector URLs and credentials stay server-side.

History is fetched on demand from each collector's existing seven-day SQLite
retention. The selected range is fixed while paging; charts show the actual loaded
sample timestamps, with gaps for missing readings. Pages contain 100 samples,
oldest first, and **Load next 100 samples** retrieves more. History is not copied
into Supabase. Deploy the matching backend monitoring endpoints with this admin
version; no database migration or Redis Proxy changes are needed.
