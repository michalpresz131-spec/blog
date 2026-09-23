// Vercel serverless entry point. Reuses the exact same Express app defined
// in server.js — nothing is duplicated, so local dev and Vercel always run
// identical route logic.
module.exports = require('../server.js')
