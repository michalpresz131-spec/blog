# Deploying to Render (free tier)

## Reminder of the trade-off you accepted

Render's free web services **do not** get a persistent disk. Whenever the
service spins down from inactivity, gets redeployed, or Render moves it to
a different machine, the filesystem resets — meaning `blog.db` goes back to
empty (or to whatever was last committed to your repo, see the tip at the
bottom). If that becomes a problem later, moving to the $7/mo Starter plan
with a small persistent disk attached is the fix — nothing else about the
app needs to change for that upgrade.

## 1. Get the project into a Git repository

Render deploys from GitHub (or GitLab/Bitbucket). If your `blog` folder
isn't already a git repo:

```powershell
cd C:\Users\mikol\blog
git init
git add .
git commit -m "Initial commit"
```

Then create a new empty repository on https://github.com/new (don't
initialize it with a README), and push:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

You'll need Git installed (`git --version` to check) and to be logged into
GitHub in your browser or via `git` credentials when it prompts.

**Before committing**, make a `.gitignore` so you don't accidentally push
huge/unnecessary files:

```
node_modules/
```

(Whether to also ignore `blog.db` is up to you — see the tip at the very
end of this guide.)

## 2. Create the Render service

1. Go to https://dashboard.render.com and sign up / log in (GitHub login is
   easiest since you're already pushing there).
2. Click **New +** → **Web Service**.
3. Connect your GitHub account if prompted, then select the repository you
   just pushed.
4. Fill in:
   - **Name**: anything, e.g. `allotment-blog`
   - **Region**: closest to you
   - **Branch**: `main`
   - **Root Directory**: leave blank (unless your files are in a subfolder)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start` (this runs `node server.js`, matching
     your `package.json`)
   - **Instance Type**: `Free`
5. Don't click "Create Web Service" yet — first add the environment
   variables below.

## 3. Add environment variables

Still on the create-service screen (or afterward, in the service's
**Environment** tab), add:

| Key | Value |
|---|---|
| `GMAIL_USER` | `michalpresz131@gmail.com` |
| `GMAIL_APP_PASSWORD` | your 16-character Gmail App Password |
| `NOTIFY_EMAIL` | `michalpresz@gmail.com` |

Don't set `PORT` — Render sets that automatically, and `server.js` already
reads `process.env.PORT`.

## 4. Deploy

Click **Create Web Service**. Render will install dependencies, run
`node server.js`, and give you a URL like:

```
https://allotment-blog.onrender.com
```

The first request after any idle period takes up to about a minute to wake
back up (Render's free-tier cold start) — that's normal, not an error.

## 5. Confirm it's working

Open the Render URL. If the home page loads but shows no posts, check the
**Logs** tab in the Render dashboard for errors — that's the equivalent of
watching your local terminal output.

## Tip: keeping your migrated data as the "reset baseline"

Since free-tier restarts wipe `blog.db` back to whatever's in the deployed
files, you can make restarts less painful by **committing your already-
migrated `blog.db`** (the one with your 17 posts and 13 comments) into the
git repo before pushing:

```powershell
git add blog.db
git commit -m "Include migrated data as reset baseline"
git push
```

That way, when the free tier resets the filesystem, it resets *to your
migrated content* rather than to nothing — new posts/comments added after
that will still get wiped on the next reset, but you won't lose the
Supabase-migrated backlog every time.
