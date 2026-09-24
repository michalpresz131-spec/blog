// Netlify Function entry point. Wraps the exact same Express app defined
// in server.js (same idea as the Vercel index.js entry point) so /api/*
// routes — including the image endpoints — work when deployed on Netlify.
const serverless = require('serverless-http')
const app = require('../../server.js')

exports.handler = serverless(app, {
	// /api/posts request gets internally invoked as
	// /.netlify/functions/api/posts — but server.js's routes are defined
	// as /api/posts (same as when it runs locally or on Vercel), so
	// rewrite the path back to what Express actually expects.
	request: (request) => {
		request.url = request.url.replace(/^\/\.netlify\/functions\/api/, '/api')
	},
	// /api/posts/:id/image sends raw binary bytes (jpeg/png/etc). Without
	// this, Netlify's underlying Lambda runtime can mangle binary
	// responses by treating them as UTF-8 text instead of base64-encoding
	// them.
	binary: ['image/*']
})
