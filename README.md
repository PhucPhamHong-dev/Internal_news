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

## Deploy (VPS + Domain)
1. Point DNS `A` record của `noibo.anhchiem.org` về IP VPS.
2. Copy `.env.vps.example` thành `.env` và điền giá trị thật.
3. Chạy production stack:
   - `docker compose -f docker-compose.vps.yml up -d --build`
4. Bind nội bộ trên VPS:
   - Frontend: `127.0.0.1:4010`
   - API: `127.0.0.1:4011`
5. Cài nginx site:
   - copy [deploy/nginx/noibo.anhchiem.org.conf](/opt/Internal_news/deploy/nginx/noibo.anhchiem.org.conf) vào `/etc/nginx/sites-available/noibo.anhchiem.org`
   - tạo symlink sang `/etc/nginx/sites-enabled/noibo.anhchiem.org`
   - `sudo nginx -t && sudo systemctl reload nginx`
6. Cấp SSL:
   - `sudo certbot --nginx -d noibo.anhchiem.org`
7. Kiểm tra logs:
   - `docker compose -f docker-compose.vps.yml logs -f web api`

Mô hình deploy:
- `nginx` trên VPS nhận HTTPS và reverse proxy.
- Frontend: `https://noibo.anhchiem.org`
- API: `https://noibo.anhchiem.org/api/*`
- Socket: `https://noibo.anhchiem.org/socket.io/*`
- Port nội bộ tách biệt với app cũ:
  - Web `4010`
  - API `4011`
