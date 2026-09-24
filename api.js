// Netlify Function entry point. Wraps the exact same Express app defined
// in server.js (same idea as the Vercel index.js entry point) so /api/*
// routes — including the image endpoints — work when deployed on Netlify.
const serverless = require('serverless-http')
const app = require('../../server.js')

// /api/posts/:id/image sends raw binary bytes (jpeg/png/etc). Without this,
// Netlify's underlying Lambda runtime can mangle binary responses by
// treating them as UTF-8 text instead of base64-encoding them.
exports.handler = serverless(app, {
	binary: ['image/*']
})
