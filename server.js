// Allotment and Gardening AllManiac — server
// Serves the static site and a small JSON API backed by Turso (a hosted,
// SQLite-compatible database). Also emails michalpresz@gmail.com whenever
// a new post or comment is created.

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
  console.error('Run ". .\\set-env.ps1" in this terminal window first, then re-run "node server.js".')
  process.exit(1)
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

// --- Database setup ---
async function initDb(){
  await db.batch([
    `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image TEXT,
      date TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      date TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY,
      total INTEGER NOT NULL DEFAULT 0
    )`
  ], 'write')

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

// ---------- API ----------

app.get('/api/posts', async (req, res)=>{
  try{
    const result = await db.execute('SELECT * FROM posts ORDER BY date ASC')
    res.json(result.rows)
  }catch(e){
    console.error('GET /api/posts failed:', e.message)
    res.status(500).json({error: 'Database error'})
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

app.post('/api/posts', async (req, res)=>{
  const {title, content, image} = req.body
  const date = new Date().toISOString()
  try{
    const info = await db.execute({
      sql: 'INSERT INTO posts (title, content, image, date, likes) VALUES (?, ?, ?, ?, 0)',
      args: [title || '', content || '', image || null, date]
    })
    const row = await db.execute({ sql: 'SELECT * FROM posts WHERE id = ?', args: [Number(info.lastInsertRowid)] })
    const post = row.rows[0]
    sendNotificationEmail(
      `New post on Allotment and Gardening AllManiac: ${post.title}`,
      `A new post was published.\n\nTitle: ${post.title}\n\n${post.content}\n\nPosted: ${post.date}`
    )
    res.json(post)
  }catch(e){
    console.error('POST /api/posts failed:', e.message)
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
        sql: 'INSERT INTO posts (title, content, image, date, likes) VALUES (?, ?, ?, ?, ?)',
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

app.get('/api/posts/:id/comments', async (req, res)=>{
  const postId = Number(req.params.id)
  try{
    const result = await db.execute({ sql: 'SELECT * FROM comments WHERE post_id = ? ORDER BY date ASC', args: [postId] })
    res.json(result.rows)
  }catch(e){
    console.error('GET /api/posts/:id/comments failed:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

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
      sql: 'INSERT INTO comments (post_id, author, content, date) VALUES (?, ?, ?, ?)',
      args: [postId, author, content, date]
    })
    const row = await db.execute({ sql: 'SELECT * FROM comments WHERE id = ?', args: [Number(info.lastInsertRowid)] })
    const comment = row.rows[0]
    sendNotificationEmail(
      `New comment on "${post.title}"`,
      `${author} commented on "${post.title}":\n\n${content}\n\nPosted: ${comment.date}`
    )
    res.json(comment)
  }catch(e){
    console.error('POST /api/posts/:id/comments failed:', e.message)
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

initDb()
  .then(() => {
    app.listen(PORT, ()=>{
      console.log(`Server listening on http://localhost:${PORT}/`)
    })
  })
  .catch(err => {
    console.error('Failed to initialize the database:', err.message)
    process.exitCode = 1
  })
