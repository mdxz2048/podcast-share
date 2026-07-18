---
name: podcast-share-framework
description: "Use when: scanning podcast-share architecture, locating frontend/backend code paths, understanding admin connector ZIP upload, source binding, user login visibility, and RSS generation flows."
---

# Podcast Share Code Framework

## When to Use
- You need a quick map of this monorepo before changing features.
- You need to modify admin flows: Connector ZIP upload, Connector enable/disable, Source creation/binding.
- You need to modify user flows: login, visible program list, RSS feed creation and private RSS output.

## Stack and Layout
- Monorepo: `pnpm workspace` + `turbo`
- Frontend: Next.js App Router (`apps/web`)
- Backend: Fastify + PostgreSQL (`apps/api`)
- Job/runner components: `apps/worker`, `apps/runner`
- Shared packages: `packages/*`

Key entry points:
- API bootstrap: `apps/api/src/app.ts`
- Web app root layout: `apps/web/app/layout.tsx`
- Auth context injection: `apps/api/src/plugins/auth.ts`

## Framework Map (What to open first)
1. **API route registration**
   - `apps/api/src/app.ts`
2. **Admin connector/source domain**
   - `apps/api/src/routes/admin-connectors.ts`
   - `apps/api/src/routes/admin-sources.ts`
   - `apps/web/app/admin/connectors/page.tsx`
   - `apps/web/app/admin/connectors/upload/page.tsx`
   - `apps/web/app/admin/sources/page.tsx`
3. **User program visibility + RSS domain**
   - `apps/api/src/routes/programs.ts`
   - `apps/api/src/services/program-visibility.ts`
   - `apps/api/src/routes/rss.ts`
   - `apps/web/app/programs/page.tsx`
   - `apps/web/app/my/rss/page.tsx`

## Core Business Flow

### A. Admin: upload ZIP -> Connector -> bind Source
1. Upload ZIP from admin web page (`/admin/connectors/upload`).
2. API validates ZIP/manifest and stores package (`POST /admin/connectors/upload`).
3. Admin approves connector version (`POST /admin/connectors/:connectorId/approve`).
4. Admin creates Source with `connectorVersionId` (`POST /admin/sources`), which binds Source to connector version.
5. Source can then be enabled/run/scheduled from admin sources page.

### B. User: login -> see allowed programs -> create RSS
1. User logs in via `/auth/login` and gets `ph_session`.
2. User program list (`GET /programs`) is filtered by visibility rules:
   - `all_registered_users`
   - `audience_groups`
   - `specific_users`
3. User creates feed via `POST /me/rss-feeds` with selected program IDs.
4. Private RSS is served by `GET /rss/private/:token.xml`, and media by `GET/HEAD /rss/private/:token/episodes/:episodeId/media`.
5. RSS/media responses re-check visibility, so permission updates take effect immediately.

## Change Checklist (before editing)
1. Identify whether change belongs to **admin connector/source** or **user visibility/rss** flow.
2. Update both API route and corresponding web page if behavior is user-facing.
3. If visibility logic changes, keep `programs.ts`, `program-visibility.ts`, and RSS queries consistent.
4. Run existing checks after edits:
   - `pnpm --filter @podcast-hub/api test`
   - `pnpm -r typecheck`
