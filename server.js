const express = require('express')
const path = require('path')
const { createClient } = require('@libsql/client')
const nodemailer = require('nodemailer')

// --- Turso (hosted, SQLite-compatible database) ---
// Set these as environment variables — see TURSO_SETUP.md
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN

if(!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN){
  console.error('Missing TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN environment variables. See TURSO_SETUP.md.')
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
})

// --- Email notifications (SMTP via Gmail app password) ---
// Set these as environment variables before starting the server, e.g.:
//   GMAIL_USER=youraccount@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   (a 16-char Gmail "App Password", NOT your normal password)
//   NOTIFY_EMAIL=michalpresz@gmail.com        (optional, defaults to michalpresz@gmail.com)
const GMAIL_USER = process.env.GMAIL_USER
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'michalpresz@gmail.com'

let mailTransporter = null
if(GMAIL_USER && GMAIL_APP_PASSWORD){
  mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
  })
} else {
  console.warn('Email notifications disabled: set GMAIL_USER and GMAIL_APP_PASSWORD environment variables to enable them.')
}

function sendNotificationEmail(subject, text){
  if(!mailTransporter) return
  mailTransporter.sendMail({
    from: GMAIL_USER,
    to: NOTIFY_EMAIL,
    subject,
    text
  }).catch(err => {
    console.error('Failed to send notification email:', err.message)
  })
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
    await db.execute({ sql: 'INSERT INTO visits (id, total) VALUES (1, 0)' })
  }
}

const app = express()
const { clerkMiddleware } = require("@clerk/express");
app.use(clerkMiddleware());
const PORT = process.env.PORT || 8000

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if(req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json({limit: '12mb'}))
app.use(express.urlencoded({extended:true}))

// API: list posts (ascending by date)
app.get('/api/posts', async (req, res)=>{
  try{
    const result = await db.execute('SELECT * FROM posts ORDER BY date ASC')
    res.json(result.rows)
  }catch(e){
    console.error('Failed to load posts:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// Visit counter
app.get('/api/visits', async (req, res)=>{
  try{
    await db.execute('UPDATE visits SET total = total + 1 WHERE id = 1')
    const row = await db.execute('SELECT total FROM visits WHERE id = 1')
    res.json({visits: Number(row.rows[0]?.total) || 0})
  }catch(e){
    console.error('Failed to update visits:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// create post
app.post('/api/posts', async (req, res)=>{
  const {title, content, image} = req.body
  const date = new Date().toISOString()
  try{
    const info = await db.execute({
      sql: 'INSERT INTO posts (title, content, image, date, likes) VALUES (?, ?, ?, ?, 0)',
      args: [title || '', content || '', image || null, date]
    })
    const row = await db.execute({
      sql: 'SELECT * FROM posts WHERE id = ?',
      args: [Number(info.lastInsertRowid)]
    })
    const post = row.rows[0]
    sendNotificationEmail(
      `New post on Allotment and Gardening AllManiac: ${post.title}`,
      `A new post was published.\n\nTitle: ${post.title}\n\n${post.content}\n\nPosted: ${post.date}`
    )
    res.json(post)
  }catch(e){
    console.error('Failed to create post:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// update post
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
    console.error('Failed to update post:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// delete post
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
    console.error('Failed to delete post:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// import (replace all posts)
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
    console.error('Failed to import posts:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// like/unlike post
app.post('/api/posts/:id/like', async (req, res)=>{
  const id = Number(req.params.id)
  try{
    const existing = await db.execute({ sql: 'SELECT id FROM posts WHERE id = ?', args: [id] })
    if(existing.rows.length === 0) return res.status(404).json({error: 'Post not found'})
    await db.execute({ sql: 'UPDATE posts SET likes = likes + 1 WHERE id = ?', args: [id] })
    const row = await db.execute({ sql: 'SELECT likes FROM posts WHERE id = ?', args: [id] })
    res.json({likes: Number(row.rows[0].likes)})
  }catch(e){
    console.error('Failed to like post:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// list comments for a post
app.get('/api/posts/:id/comments', async (req, res)=>{
  const postId = Number(req.params.id)
  try{
    const result = await db.execute({
      sql: 'SELECT * FROM comments WHERE post_id = ? ORDER BY date ASC',
      args: [postId]
    })
    res.json(result.rows)
  }catch(e){
    console.error('Failed to load comments:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// create a comment on a post
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
    const row = await db.execute({
      sql: 'SELECT * FROM comments WHERE id = ?',
      args: [Number(info.lastInsertRowid)]
    })
    const comment = row.rows[0]
    sendNotificationEmail(
      `New comment on "${post.title}"`,
      `${author} commented on "${post.title}":\n\n${content}\n\nPosted: ${comment.date}`
    )
    res.json(comment)
  }catch(e){
    console.error('Failed to create comment:', e.message)
    res.status(500).json({error: 'Database error'})
  }
})

// serve static files
app.use(express.static(path.join(__dirname)))

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
