# Setting up Turso (no CLI needed)

Turso's command-line tool needs WSL on Windows, so we'll do this entirely
through their web dashboard instead — no terminal installs required for
this part.

## 1. Create an account and a database

## 2. Get your connection URL and auth token

On the database's page in the dashboard, look for a **Quickstart** or
**Connect** tab/section. It should show:

- A **Database URL**, looking like `libsql://allotment-blog-yourname.turso.io`
- A button to **Create Token** (or **Generate Token**) — click it to get an
  auth token, a long string starting with `ey...`

Copy both — you'll need them as environment variables. Treat the auth
token like a password (don't commit it to a public GitHub repo, don't paste
it into a public chat).

eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODk5OTI5ODYsImlkIjoiMDFhMGMzZTQtMjIwMS03NDk2LTkxZWQtOTk0ODZlZGFmMjYyIiwia2lkIjoiYzhod2poMmxabzVJNHlSODQ2QjFvLTAzcUxLRTNtY1hQakkwTHpoSDZRQSIsInJpZCI6Ijk2OGNjOGY2LTE3NTItNDhkYS1hZTFlLTkwMzBiYTY3MGViMSJ9.xrkp5ZTamgLRpL9LG5DLJ1PTXhJJCpW2d1yLUQMD57bER4lYRGpx3jte9lqNOtPd4drfryg6-FXW45uYareiDw

## libsql://allotment-blog-michalpresz131-spec.aws-eu-west-1.turso.io

## 3. Set them as environment variables

**Locally**, in the same PowerShell window you run the server from:

```powershell
$env:TURSO_DATABASE_URL="libsql://allotment-blog-michalpresz131-spec.aws-eu-west-1.turso.io"
$env:TURSO_AUTH_TOKEN="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODk5OTI5ODYsImlkIjoiMDFhMGMzZTQtMjIwMS03NDk2LTkxZWQtOTk0ODZlZGFmMjYyIiwia2lkIjoiYzhod2poMmxabzVJNHlSODQ2QjFvLTAzcUxLRTNtY1hQakkwTHpoSDZRQSIsInJpZCI6Ijk2OGNjOGY2LTE3NTItNDhkYS1hZTFlLTkwMzBiYTY3MGViMSJ9.xrkp5ZTamgLRpL9LG5DLJ1PTXhJJCpW2d1yLUQMD57bER4lYRGpx3jte9lqNOtPd4drfryg6-FXW45uYareiDw"

**On Render** (once you deploy there), add them in the service's
**Environment** tab alongside `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and
`NOTIFY_EMAIL` — same two names, same values.

Since your data will now live on Turso's servers rather than on Render's
local disk, **the free-tier persistence problem goes away entirely** —
nothing about a Render restart affects your data anymore.

## 4. Install the new dependency

```powershell
npm install @libsql/client
```

```

This is the JavaScript client `server.js` uses to talk to Turso. It has
prebuilt binaries for Windows, so this should install without needing any
compiler tools.
gjhy zwun przx nksz
NOTIFY_EMAIL        = "michalpresz131@gmail.com"
GMAIL_USER          = "michalpresz131@gmail.com"
```
