// Netlify Function entry point. Wraps the exact same Express app defined
// in server.js (same idea as the Vercel index.js entry point) so /api/*
// routes — including the image endpoints — work when deployed on Netlify.
const serverless = require('serverless-http')
const app = require('../../server.js')

exports.handler = serverless(app)
