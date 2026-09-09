# Allotment Mentality

The blog runs locally with the Express API and uses Supabase for shared moderation when published on GitHub Pages.

## Moderation

Hosted visitors can submit posts, but only posts with `status = approved` are displayed publicly. Review submissions in the Supabase Table Editor:

`https://supabase.com/dashboard/project/bjzeuzhkcfhzalmtnkmz/editor`

Change a row's `status` from `pending` to `approved` to publish it, or `rejected` to keep it hidden. The table and row-level security policies are already configured in the `AllotmentMentality` project.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the site whenever `main` is pushed.

1. Push this repository to GitHub using the `main` branch.
2. In the repository, open **Settings > Pages** and select **GitHub Actions** as the source.
3. Push a change or run **Deploy to GitHub Pages** from the **Actions** tab.

The workflow publishes `index.html`, `app.js`, `style.css`, `posts.json`, and `assets/`. The deployed site automatically falls back to browser storage when the Express API is unavailable.

## Run locally

Run locally with Node:

```powershell
# install dependencies (Node/npm required)
npm install
# start server
npm start
# open http://localhost:8000/
```

Verify the API:

```powershell
Invoke-RestMethod http://localhost:8000/api/posts
```

If you don't have Node installed, the static site can still be previewed by opening `index.html` directly, although browser security settings may prevent loading the seed `posts.json` file. Use the server for full local behavior.

Run with Docker (recommended if Node isn't installed):

```bash
docker compose up --build
# open http://localhost:8000/
```

To stop:

```bash
docker compose down
```
