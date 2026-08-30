# Gathos Admin

Internal Next.js administration console for managing Gathos platform records. The interface uses
the App Router and a compact, Django Admin/Unfold-inspired design while keeping all data access
behind the existing FastAPI admin authorization checks.

## Managed resources

- Users
- API keys
- Tier defaults
- Security blocklist entries
- Meta deletion requests
- Newsletter subscribers
- Affiliates
- Generations

## Local development

The FastAPI project uses port `3001`, so the admin frontend runs on port `3000`.

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

The protected route-group layout forwards the incoming cookie header to
`GET /api/admin/check`. Access fails closed unless FastAPI returns `isAdmin: true`; there is no
frontend or development bypass.

The Admin login is separate from the landing and dashboard login screens. It offers email and
password only and submits to FastAPI's dedicated `POST /api/admin/login` through the same-origin
BFF. FastAPI verifies the password, current account state, and admin allowlist before issuing a
time-limited `gathos_session` cookie. The Admin then calls `GET /api/admin/check`: approved
administrators continue to the requested Admin page, while signed-in accounts without permission
remain on the login page and are prompted to sign out and use another account.

Browser-side requests use the same-origin endpoint:

```text
/api/backend/<fastapi-path>
```

The catch-all route forwards the method, query string, request body, cookies, response status,
response body, and `Set-Cookie` headers. For example:

```text
GET /api/backend/api/admin/data/users?page=1&page_size=25
    → http://localhost:3001/api/admin/data/users?page=1&page_size=25
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
