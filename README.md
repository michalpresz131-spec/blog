# Allotment Mentality

The blog runs locally with the Express API and uses Turso for shared post,
comment, and visit data.

## Publishing

The static page is published on Netlify over HTTPS. Its API runs separately on
AWS Lambda using a Lambda Function URL and continues to use the existing Turso
database. Netlify publishes only the static site files; `aws-config.js`
connects the page to the AWS API. See [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md)
for AWS deployment details.

## Moderation

Visitors can submit posts and comments, but only items with `status = approved`
are shown publicly. Configure `ADMIN_PASSWORD` on the server and review pending
submissions in the blog's moderation panel. For AWS, set this value in the
encrypted Systems Manager parameter described in
[AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md).

Only an authenticated admin can approve or reject submissions, delete posts or
comments, or import posts (which replaces the stored posts and comments).
Moderation data is stored in Turso.

## Netlify

Connect this repository to Netlify and deploy the `main` branch. The
`netlify.toml` configuration builds and publishes only the static UI files.
Keep the AWS Lambda Function URL in `aws-config.js`; the Netlify site uses it
to reach the API.

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
