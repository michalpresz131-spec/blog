# Allotment Mentality

The blog runs locally with the Express API and uses Turso for shared post,
comment, and visit data.

## Low-cost publishing

The static page is published on GitHub Pages over HTTPS, and its API runs on
AWS Lambda using a Lambda Function URL. The API continues to use the existing
Turso database. See [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md) for deployment
details.

## Moderation

Visitors can submit posts and comments, but only items with `status = approved`
are shown publicly. Configure `ADMIN_PASSWORD` on the server and review pending
submissions in the blog's moderation panel. For AWS, set this value in the
encrypted Systems Manager parameter described in
[AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md).

Only an authenticated admin can approve or reject submissions, delete posts or
comments, or import posts (which replaces the stored posts and comments).
Moderation data is stored in Turso.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the site whenever `main` is pushed.

1. Push this repository to GitHub using the `main` branch.
2. In the repository, open **Settings > Pages** and select **GitHub Actions** as the source.
3. Push a change or run **Deploy to GitHub Pages** from the **Actions** tab.

The workflow publishes the static UI. The deployed `aws-config.js` points it at
the AWS API; the GitHub Pages build keeps the local default file.

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
