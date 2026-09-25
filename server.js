// Allotment and Gardening AllManiac — server
// Serves the static site and a small JSON API backed by Turso (a hosted,
// SQLite-compatible database). Also emails michalpresz@gmail.com whenever
// a new post or comment is created — and holds new posts/comments as
// "pending" until a moderator approves them.

const express = require('express')
const path = require('path')
const fs = require('fs')
const { createClient } = require('@libsql/client')
const nodemailer = require('nodemailer')

console.log('Starting server. Script directory (__dirname):', __dirname)

// --- Turso (hosted, SQLite-compatible database) ---
// Required environment variables — see TURSO_SETUP.md:
//   TURSO_DATABASE_URL
//   TURSO_AUTH_TOKEN
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN

if(!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN){
  console.error('FATAL: TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN are not set.')
  console.error('Locally: run ". .\\set-env.ps1" in this terminal window first, then re-run "node server.js".')
  console.error('On Vercel/Netlify: set them in the platform\'s Environment Variables settings.')
  if(require.main === module){
    process.exit(1)
  }
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
})

// --- Email notifications (SMTP via Gmail app password) ---
// Optional environment variables:
//   GMAIL_USER, GMAIL_APP_PASSWORD, NOTIFY_EMAIL (defaults to michalpresz@gmail.com)
const GMAIL_USER = process.env.GMAIL_USER
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'michalpresz@gmail.com'

let mailTransporter = null
if(GMAIL_USER && GMAIL_APP_PASSWORD){
  mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
  })
  console.log('Email notifications: enabled (sending to', NOTIFY_EMAIL + ')')
} else {
  console.warn('Email notifications: disabled (GMAIL_USER / GMAIL_APP_PASSWORD not set)')
}

function sendNotificationEmail(subject, text){
  if(!mailTransporter) return
  mailTransporter.sendMail({ from: GMAIL_USER, to: NOTIFY_EMAIL, subject, text })
    .catch(err => console.error('Failed to send notification email:', err.message))
}

// --- Moderator auth ---
// Required to use the moderation endpoints. Set this in your environment
// (locally via set-env.ps1, on Netlify/Vercel via their env var settings).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
if(!ADMIN_PASSWORD){
  console.warn('Moderation: disabled (ADMIN_PASSWORD not set) — pending posts/comments cannot be approved until this is set.')
}

function checkAdminPassword(password){
  return Boolean(ADMIN_PASSWORD) && typeof password === 'string' && password === ADMIN_PASSWORD
}

// --- Database setup ---
// initDb() is idempotent (CREATE TABLE IF NOT EXISTS / column-exists checks),
// so it's safe to run it lazily on the first incoming request rather than
// only at startup. This matters for serverless platforms (like
// Vercel/Netlify), where there is no long-lived "startup" moment — each
// cold start needs this to run once before handling its first request.
let dbReady = false
let dbReadyPromise = null

function ensureDbReady(){
  if(dbReady) return Promise.resolve()
  if(!dbReadyPromise){
    dbReadyPromise = initDb().then(() => { dbReady = true })
  }
  return dbReadyPromise
}

async function initDb(){
  await db.batch([
    `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image TEXT,
      date TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
    )`,
    `CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    )`,
    `CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY,
      total INTEGER NOT NULL DEFAULT 0
    )`
  ], 'write')

  // Migration: if posts/comments tables already existed (from before the
  // moderation feature), they won't have a `status` column yet. Add it,
  // defaulting existing rows to 'approved' so already-published content
  // doesn't disappear. This is safe to run every startup — the error for
  // "column already exists" is caught and ignored.
  const migrations = [
    "ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'",
    "ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'"
  ]
  for(const sql of migrations){
    try{
      await db.execute(sql)
    }catch(e){
      if(!/duplicate column name/i.test(e.message)) throw e
    }
  }

  const existingVisitsRow = await db.execute('SELECT total FROM visits WHERE id = 1')
  if(existingVisitsRow.rows.length === 0){
    await db.execute('INSERT INTO visits (id, total) VALUES (1, 0)')
  }
}

// --- Express app ---
const app = express()
const PORT = process.env.PORT || 8000
const PUBLIC_DIR = __dirname

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if(req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json({limit: '12mb'}))
app.use(express.urlencoded({extended:true}))

app.use(async (req, res, next) => {
  try{
    await ensureDbReady()
    next()
  }catch(e){
    console.error('Database initialization failed:', e.message)
    res.status(500).json({error: 'Database initialization failed'})
  }
})

// ---------- Public API ----------

// List posts WITHOUT the (potentially huge, base64) image data — the image
// data alone can blow past Netlify Functions' 6MB response cap once there
// are a handful of posts with photos. Each post instead gets a boolean
// `has_image` flag, and the browser fetches the actual image bytes from
// /api/posts/:id/image only when it needs to render one.
// Only approved posts are returned here — pending posts stay invisible to
// the public until a moderator approves them.
app.get('/api/posts', async (req, res)=>{
  try{
    const result = await db.execute(
      `SELECT id, title, content, date, likes,
              CASE WHEN image IS NOT NULL THEN 1 ELSE 0 END AS has_image
       FROM posts WHERE status = 'approved' ORDER BY date ASC`
    )
    res.json(result.rows)
  }catch(e){
    console.error('GET /api/posts failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// Serves a single post's image as actual binary bytes (not JSON/base64),
// so the browser can just point an <img src="..."> at this URL directly.
app.get('/api/posts/:id/image', async (req, res)=>{
  const id = Number(req.params.id)
  try{
    const row = await db.execute({ sql: 'SELECT image FROM posts WHERE id = ?', args: [id] })
    const dataUrl = row.rows[0]?.image
    if(!dataUrl) return res.status(404).end()
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
    if(!match) return res.status(500).end()
    const [, mime, base64] = match
    res.set('Content-Type', mime)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    res.send(Buffer.from(base64, 'base64'))
  }catch(e){
    console.error('GET /api/posts/:id/image failed:', e.message)
    res.status(500).end()
  }
})

app.get('/api/visits', async (req, res)=>{
  try{
    await db.execute('UPDATE visits SET total = total + 1 WHERE id = 1')
    const row = await db.execute('SELECT total FROM visits WHERE id = 1')
    res.json({visits: Number(row.rows[0]?.total) || 0})
  }catch(e){
    console.error('GET /api/visits failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// New posts save as 'pending' — invisible to the public until approved.
// The notification email fires immediately, before any approval happens.
app.post('/api/posts', async (req, res)=>{
  const {title, content, image} = req.body
  const date = new Date().toISOString()
  try{
    const info = await db.execute({
      sql: "INSERT INTO posts (title, content, image, date, likes, status) VALUES (?, ?, ?, ?, 0, 'pending')",
      args: [title || '', content || '', image || null, date]
    })
    const row = await db.execute({ sql: 'SELECT * FROM posts WHERE id = ?', args: [Number(info.lastInsertRowid)] })
    const post = row.rows[0]
    sendNotificationEmail(
      `New post awaiting approval: ${post.title}`,
      `A new post was submitted and is awaiting your approval.\n\nTitle: ${post.title}\n\n${post.content}\n\nSubmitted: ${post.date}`
    )
    res.json(post)
  }catch(e){
    console.error('POST /api/posts failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// Returns a single post WITH its full image data — used by the client to
// fetch the current image when opening a post for editing.
app.get('/api/posts/:id', async (req, res)=>{
  const id = Number(req.params.id)
  try{
    const row = await db.execute({ sql: 'SELECT * FROM posts WHERE id = ?', args: [id] })
    if(row.rows.length === 0) return res.status(404).json({error: 'Post not found'})
    res.json(row.rows[0])
  }catch(e){
    console.error('GET /api/posts/:id failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

app.put('/api/posts/:id', async (req, res)=>{
  const id = Number(req.params.id)
  const {title, content, image} = req.body
  try{
    const existing = await db.execute({ sql: 'SELECT id FROM posts WHERE id = ?', args: [id] })
    if(existing.rows.length === 0) return res.status(404).json({error: 'Post not found'})
    const date = new Date().toISOString()
    await db.execute({
      sql: 'UPDATE posts SET title = ?, content = ?, image = ?, date = ? WHERE id = ?',
      args: [title || '', content || '', image || null, date, id]
    })
    const row = await db.execute({ sql: 'SELECT * FROM posts WHERE id = ?', args: [id] })
    res.json(row.rows[0])
  }catch(e){
    console.error('PUT /api/posts/:id failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

app.delete('/api/posts/:id', async (req,res)=>{
  const id = Number(req.params.id)
  try{
    const existing = await db.execute({ sql: 'SELECT id FROM posts WHERE id = ?', args: [id] })
    if(existing.rows.length === 0) return res.status(404).json({error: 'Post not found'})
    await db.batch([
      { sql: 'DELETE FROM posts WHERE id = ?', args: [id] },
      { sql: 'DELETE FROM comments WHERE post_id = ?', args: [id] }
    ], 'write')
    res.json({success:true})
  }catch(e){
    console.error('DELETE /api/posts/:id failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

app.post('/api/import', async (req, res)=>{
  const data = req.body
  if(!Array.isArray(data)) return res.status(400).json({error:'Expected array'})
  try{
    await db.execute('DELETE FROM comments')
    await db.execute('DELETE FROM posts')
    for(const p of data){
      await db.execute({
        sql: "INSERT INTO posts (title, content, image, date, likes, status) VALUES (?, ?, ?, ?, ?, 'approved')",
        args: [p.title || '', p.content || '', p.image || null, p.date || new Date().toISOString(), p.likes || 0]
      })
    }
    res.json({success:true})
  }catch(e){
    console.error('POST /api/import failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

app.post('/api/posts/:id/like', async (req, res)=>{
  const id = Number(req.params.id)
  try{
    const existing = await db.execute({ sql: 'SELECT id FROM posts WHERE id = ?', args: [id] })
    if(existing.rows.length === 0) return res.status(404).json({error: 'Post not found'})
    await db.execute({ sql: 'UPDATE posts SET likes = likes + 1 WHERE id = ?', args: [id] })
    const row = await db.execute({ sql: 'SELECT likes FROM posts WHERE id = ?', args: [id] })
    res.json({likes: Number(row.rows[0].likes)})
  }catch(e){
    console.error('POST /api/posts/:id/like failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// Only approved comments are public.
app.get('/api/posts/:id/comments', async (req, res)=>{
  const postId = Number(req.params.id)
  try{
    const result = await db.execute({
      sql: "SELECT * FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY date ASC",
      args: [postId]
    })
    res.json(result.rows)
  }catch(e){
    console.error('GET /api/posts/:id/comments failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// New comments save as 'pending'. Notification email fires immediately,
// before any approval happens.
app.post('/api/posts/:id/comments', async (req, res)=>{
  const postId = Number(req.params.id)
  try{
    const postRow = await db.execute({ sql: 'SELECT * FROM posts WHERE id = ?', args: [postId] })
    if(postRow.rows.length === 0) return res.status(404).json({error: 'Post not found'})
    const post = postRow.rows[0]
    const author = String(req.body.author || '').trim()
    const content = String(req.body.content || '').trim()
    if(!author || !content) return res.status(400).json({error: 'Author and content are required'})
    const date = new Date().toISOString()
    const info = await db.execute({
      sql: "INSERT INTO comments (post_id, author, content, date, status) VALUES (?, ?, ?, ?, 'pending')",
      args: [postId, author, content, date]
    })
    const row = await db.execute({ sql: 'SELECT * FROM comments WHERE id = ?', args: [Number(info.lastInsertRowid)] })
    const comment = row.rows[0]
    sendNotificationEmail(
      `New comment awaiting approval on "${post.title}"`,
      `${author} commented on "${post.title}" and it's awaiting your approval:\n\n${content}\n\nSubmitted: ${comment.date}`
    )
    res.json(comment)
  }catch(e){
    console.error('POST /api/posts/:id/comments failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// ---------- Moderation (admin) API ----------
// All of these require the correct ADMIN_PASSWORD, sent per-request (not a
// persistent login session) — kept intentionally simple to match the rest
// of this app.

app.get('/api/admin/pending', async (req, res)=>{
  if(!checkAdminPassword(req.query.password)) return res.status(401).json({error: 'Incorrect password'})
  try{
    const posts = await db.execute("SELECT id, title, content, date FROM posts WHERE status = 'pending' ORDER BY date ASC")
    const comments = await db.execute(`
      SELECT comments.id, comments.post_id, comments.author, comments.content, comments.date, posts.title AS post_title
      FROM comments JOIN posts ON posts.id = comments.post_id
      WHERE comments.status = 'pending' ORDER BY comments.date ASC
    `)
    res.json({posts: posts.rows, comments: comments.rows})
  }catch(e){
    console.error('GET /api/admin/pending failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

app.post('/api/admin/posts/:id/approve', async (req, res)=>{
  if(!checkAdminPassword(req.body.password)) return res.status(401).json({error: 'Incorrect password'})
  const id = Number(req.params.id)
  try{
    await db.execute({ sql: "UPDATE posts SET status = 'approved' WHERE id = ?", args: [id] })
    res.json({success: true})
  }catch(e){
    console.error('POST /api/admin/posts/:id/approve failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

app.post('/api/admin/posts/:id/reject', async (req, res)=>{
  if(!checkAdminPassword(req.body.password)) return res.status(401).json({error: 'Incorrect password'})
  const id = Number(req.params.id)
  try{
    await db.batch([
      { sql: 'DELETE FROM posts WHERE id = ?', args: [id] },
      { sql: 'DELETE FROM comments WHERE post_id = ?', args: [id] }
    ], 'write')
    res.json({success: true})
  }catch(e){
    console.error('POST /api/admin/posts/:id/reject failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

app.post('/api/admin/comments/:id/approve', async (req, res)=>{
  if(!checkAdminPassword(req.body.password)) return res.status(401).json({error: 'Incorrect password'})
  const id = Number(req.params.id)
  try{
    await db.execute({ sql: "UPDATE comments SET status = 'approved' WHERE id = ?", args: [id] })
    res.json({success: true})
  }catch(e){
    console.error('POST /api/admin/comments/:id/approve failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

app.post('/api/admin/comments/:id/reject', async (req, res)=>{
  if(!checkAdminPassword(req.body.password)) return res.status(401).json({error: 'Incorrect password'})
  const id = Number(req.params.id)
  try{
    await db.execute({ sql: 'DELETE FROM comments WHERE id = ?', args: [id] })
    res.json({success: true})
  }catch(e){
    console.error('POST /api/admin/comments/:id/reject failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// ---------- Static site ----------

app.use(express.static(PUBLIC_DIR))

// Explicit fallback for "/" in case static index resolution ever fails —
// this guarantees index.html is served for the root path as long as the
// file physically exists next to server.js.
app.get('/', (req, res)=>{
  const indexPath = path.join(PUBLIC_DIR, 'index.html')
  if(fs.existsSync(indexPath)){
    res.sendFile(indexPath)
  } else {
    res.status(500).send(`index.html not found in ${PUBLIC_DIR}. Make sure it is in the same folder as server.js.`)
  }
})

// ---------- Startup ----------
// When run directly (`node server.js`), start a normal always-on server.
// When imported as a module (e.g. by a Netlify/Vercel serverless function),
// just export the Express app — the platform handles invoking it per-request
// instead.
if(require.main === module){
  initDb()
    .then(() => {
      dbReady = true
      app.listen(PORT, ()=>{
        console.log(`Server listening on http://localhost:${PORT}/`)
      })
    })
    .catch(err => {
      console.error('Failed to initialize the database:', err.message)
      process.exitCode = 1
    })
}

module.exports = app
