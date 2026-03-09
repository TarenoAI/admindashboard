# Admin Dashboard - Live Access (Alle Agenten)

- URL (lokal): http://127.0.0.1:3477
- URL (extern): http://31.97.32.40:3477
- Auth: tools/admin-dashboard/dashboard-auth.json

## Pflicht-Workflow
1. Bei Fragen zu Projekten/Tasks/Status zuerst Live-Dashboard prüfen.
2. API-first: `GET/POST http://127.0.0.1:3477/api/*` mit BasicAuth aus `tools/admin-dashboard/dashboard-auth.json`.
3. Projektrechte strikt beachten:
   - `read`: lesen/reporten
   - `write`: ändern, verschieben/löschen, Wissen/Dokumente einpflegen
4. Vor jeder Write-Aktion zuerst `POST /api/projects/capability-check` mit `{ projectId, agentId, action:"write" }`.
5. Falls Dashboard nicht erreichbar: Grund nennen (Auth/Port/Server) + Fallback aus API/Dateien liefern.
6. Keine "keine Informationen"-Antwort ohne vorigen Dashboard-Check.

## API Schnelltests
- `GET /api/projects`
- `POST /api/projects/capability-check` mit `{projectId, agentId, action:"write"}`
- `POST /api/projects/knowledge` mit `{projectId,title,content,kind,actorAgentId}`
- `POST /api/projects/:projectId/pipeline/upload` mit `{actorAgentId, rowId|cpIndex, stepId, content|docPath, status?, language?, title?}`
- `POST /api/projects/:projectId/pipeline/sync-artifacts` mit `{actorAgentId, fromTag?, toTag?, statusOnFound?}` (scannt `projects/blog-artifacts/tagXX/*` und setzt step docs + wordCount)
- `GET /api/projects/:projectId/pipeline/:cpIndex/:stepId/doc` (liefert aufgelösten Dokumentpfad)

## Hinweise für Tareno Blog Publish
- `POST /api/projects/:projectId/pipeline/:cpIndex/publish-now` sendet `FINAL.md + optional NotebookLM Audio + 08_asset_plan.md`.
- Bei `Slug exists` wird automatisch Upsert versucht über `PATCH /api/blog/admin/posts/:slug` (statt hart zu fehlschlagen).

## Wichtige Bereiche
- Alle Agenten
- Organization
- Activity
- Cron Jobs
- Projekte
- Skills & Docs

## Zweck
Alle Agenten arbeiten mit derselben Live-Quelle, damit Task-Status und Verantwortlichkeiten konsistent bleiben.
