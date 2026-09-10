# Proofstack

A GitHub portfolio manager built with Next.js 15, React 19, Supabase, Gemini, and Upstash Redis. Connect GitHub, synchronize repository metadata, generate README summaries, and ask questions using your indexed README context.

## Features and scope

- GitHub OAuth through Supabase Auth, with tenant-isolated projects, tasks, milestones, and embeddings.
- Manual repository sync with pagination and cached GitHub responses. Signed webhooks update metadata for repositories already present in the database; they do not import new repositories or automatically regenerate summaries.
- README summaries and technology extraction using `gemini-3.5-flash`, falling back to `gemini-3.1-flash-lite`. Chat uses the same model pair through `@google/genai`.
- `gemini-embedding-2` embeddings explicitly requested at 768 dimensions and stored in pgvector. Invalid, nonfinite, zero, or incorrectly sized vectors are rejected rather than silently truncated. Retrieval uses cosine distance.
- One current README embedding per project, keyed by `(project_id, source)` with source `readme`. Summary extraction uses the first 15,000 README characters; embedding uses the first 8,000. Failed AI extraction preserves existing summary and technologies.
- README-based chat retrieves up to five matching documents belonging to the authenticated user. Project-scoped requests filter before ranking through an additive project-specific RPC; the original portfolio-wide RPC remains compatible. It does not browse source files, execute code, or retrieve task/milestone state. A code-map helper exists, but no code-map upload/indexing workflow is exposed.
- Searchable and sortable dashboard, task/milestone tracking, locally bundled Devicons, and keyboard-accessible controls.

## Requirements

- Node.js 22 LTS and npm, with the committed lockfile.
- Supabase with GitHub OAuth enabled and the `vector` extension available.
- A Gemini API key with access to the model IDs above.
- An Upstash Redis REST database for cache isolation, rate limits, and processing leases.
- A GitHub OAuth app configured in Supabase. GitHub provider tokens are captured during the callback and encrypted at rest for later syncs. Private repositories require appropriate GitHub permissions.

## Installation

```bash
npm ci
cp .env.local.example .env.local
```

Set every variable in `.env.local.example` before running the server:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe Supabase anonymous/publishable client key |
| `NEXT_PUBLIC_APP_URL` | Canonical application origin; HTTPS in production, without credentials, path, query, or fragment |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged key used by the signed webhook |
| `GITHUB_WEBHOOK_SECRET` | Shared webhook HMAC secret; mandatory |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Server-only canonical base64 encoding of 32 random bytes used for AES-256-GCM |
| `CRON_SECRET` | Server-only random bearer secret of at least 32 characters for maintenance requests |
| `GEMINI_API_KEY` | Server-only Gemini credential |
| `UPSTASH_REDIS_REST_URL` | HTTPS Redis REST origin |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only Redis credential |

Never prefix privileged keys with `NEXT_PUBLIC_`. Public variables are bundled at build time. Use distinct service resources for production and development. Generate `GITHUB_TOKEN_ENCRYPTION_KEY` with a cryptographically secure 32-byte generator, encode it as canonical base64, and keep it stable for the lifetime of stored credentials; rotating it requires reauthentication or a controlled re-encryption process. Redis keys include the application environment (`VERCEL_ENV`, falling back to `NODE_ENV`), the user identity, and, for GitHub caches, a SHA-256 digest of the complete authorization context. Raw access tokens and token fragments are never used as keys.

### Database setup and upgrades

For a clean database, apply `supabase/setup.sql`, then `supabase/functions.sql`, using a reviewed database deployment process. These define the RLS policies required by the application.

For an existing installation, review and apply `supabase/migrations/20260906000000_production_hardening.sql` and `supabase/migrations/20260909000000_github_credentials.sql` before deploying the corresponding application changes. Back up the database and test restoration first. Test the hardening migration against a local or staging copy, including a second run to confirm idempotency. Pause writes during that upgrade: it takes exclusive table locks and builds an HNSW index non-concurrently.

The hardening migration widens GitHub repository IDs to bigint, replaces the inner-product vector index with a cosine index, adds lookup indexes, hardens function search paths, and introduces embedding-source uniqueness. The credentials migration adds a service-role-only table containing authenticated ciphertext; browser roles have no table grants or RLS policies, and deleting the Auth user cascades to the credential. The `(project_id, source)` unique index also covers lookups by `project_id`. Existing embeddings are preserved: the latest recognized legacy README becomes current, previous versions become historical sources excluded from retrieval, and other legacy rows receive unique legacy sources. Ambiguous mappings abort the transaction for operator review rather than deleting data.

Restore from a verified backup if an upgrade cannot be completed safely. Do not run the clean-install schema over an existing database. Do not roll back the application to a duplicate-inserting processor while retaining the new schema without reviewing compatibility.

### GitHub webhook setup

Configure a repository webhook with:

- Payload URL: the application origin followed by `/api/webhooks/github`.
- Content type: `application/json`.
- Secret: the same nonempty `GITHUB_WEBHOOK_SECRET` configured on the server.
- Events: pushes and repository events. Signed GitHub `ping` deliveries are acknowledged.

The handler verifies HMAC SHA-256 over the original request bytes with a timing-safe comparison. Missing/invalid signatures return 401; malformed payloads and unsupported events return 400; configuration/database failures return sanitized 500 responses. All matching existing portfolio entries for a repository are updated, including entries belonging to different users. The service-role key is confined to server-side code. API routes are never redirected to the login page by middleware.

## Limits and failure behavior

- Repository sync uses pages of 100, with at most 50 page requests. A full final page produces an explicit error before database writes rather than silently truncating the list; up to 4,999 results can be confirmed complete within this bound.
- Validated repository metadata is upserted in batches of at most 100. A failed batch returns a non-success response with `syncedCount` for confirmed earlier batches. Transport failures can leave the final batch's commit status uncertain; retrying the upsert is safe.
- Webhook bodies are capped at 2 MiB, GitHub repository responses at 2 MiB per page, and READMEs at 1 MiB, including cached README values. Oversized webhook deliveries return 400; oversized provider responses return sanitized 503 errors. GitHub requests time out after 15 seconds, with a 60-second repository traversal budget. Redis requests time out after 15 seconds; Gemini calls after 60 seconds, using explicit model fallback rather than SDK retries.
- Repository lists are cached for one hour and READMEs for 24 hours. Webhook metadata updates do not invalidate these caches. Cache isolation separates both users and tokens, including anonymous README requests.
- Per-user atomic limits: chat 20 requests per 60 seconds, sync 5 per 300 seconds, processing 10 per 300 seconds. HTTP 429 includes `Retry-After`; unavailable Redis fails closed with 503.
- Request bodies are streamed with caps of 64 KiB for chat and 1 KiB for sync/processing. Sync accepts no body. Invalid JSON, oversized bodies, invalid UUIDs, and malformed chat input return 400. Chat accepts 1 to 40 user/assistant messages, at most 8,000 characters per message and 32,000 total, ending with a user message.
- Project-specific APIs check ownership in addition to RLS. Server authentication uses `getUser()` before any provider-token session lookup. The OAuth callback encrypts GitHub tokens with AES-256-GCM and user-bound authenticated data before service-role storage; refreshed sessions retrieve the ciphertext server-side. Production callback redirects use the configured application origin and ignore forwarded hosts; only safe local `next` paths are accepted.
- Processing uses a 300-second user/project Redis lease, with owner-checked renewal and release. Concurrent requests return 409. The lease is practical exclusion, not database fencing against arbitrarily stalled writes.
- Summary updates and embedding upserts are separate database operations. Database failures are reported, but a failed embedding write may follow a successful summary update. Reprocessing repairs the current embedding without duplicates.
- README and retrieved context are untrusted model inputs, separated from system instructions. This reduces prompt-injection risk but does not make generated output authoritative.

## Runtime reliability

Environment validation runs during server initialization and fails startup with variable names only, never secret values. Next sets `NODE_ENV` automatically. Aggregate runtime-secret validation is skipped during production builds; never set `NEXT_PHASE=phase-production-build` on a running deployment. Public values and the configured Supabase CSP origin are build-time settings, so rebuild when they change. OAuth callbacks use `NEXT_PUBLIC_APP_URL` in development as well as production.

`GET /api/health` returns uncached `{ "status": "ok" }` without authentication or provider calls. It is a liveness signal, not evidence that Supabase, GitHub, Gemini, or Redis is available.

Responses include `nosniff`, a strict-origin referrer policy, denied framing, and a Content Security Policy restricted to local assets, GitHub avatars, and the configured Supabase origin. Inline scripts/styles remain allowed for compatibility with Next.js; this is weaker than a nonce-based CSP. Production does not allow `unsafe-eval`.

## Development and verification

```bash
npm run dev
npm test
npm run test:watch
npm run lint
npx tsc --noEmit
npm run build
npm audit
```

Tests cover request boundaries, signatures, authentication and redirects, cache isolation, pagination, rate limits, processing leases/idempotency, and Gemini fallback/embedding behavior. External providers are simulated; these tests do not prove live provider availability or deployed RLS behavior. Migration tests are static checks, not a PostgreSQL execution test.

Next.js and `eslint-config-next` are pinned to stable 15.5.24. Audit findings must be reviewed before deployment; a stable framework pin is not a claim that every transitive dependency is vulnerability-free.

## License

MIT
