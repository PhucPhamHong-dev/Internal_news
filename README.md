# Internal Threads Style Bulletin

Monorepo:
- `BE`: NestJS + Prisma + PostgreSQL + Socket.io
- `FE`: Next.js + Tailwind + Socket.io client
- `packages/shared`: Shared types/contracts

## Quick Start
1. Copy `.env.example` to `.env` and fill values.
2. Start PostgreSQL (example via Docker).
3. Install deps: `npm install`
4. Prisma migrate/seed:
   - `npm run prisma:migrate -w @internal/api`
   - `npm run prisma:seed -w @internal/api`
5. Run API + Web:
   - `npm run dev:api`
   - `npm run dev:web`

## Notes
- Auth flow expects Google ID token posted to `/auth/google/callback`.
- First login requires linking a valid `MSNV` from master data.
- Viewer is default role after link, admin role can be bootstrapped by email whitelist env.
