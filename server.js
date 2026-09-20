const express = require('express')
const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const nodemailer = require('nodemailer')

const DB_FILE = path.join(__dirname, 'blog.db')

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
const db = new DatabaseSync(DB_FILE)

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image TEXT,
    date TEXT NOT NULL,
    likes INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total INTEGER NOT NULL DEFAULT 0
  );
`)

const visitsRow = db.prepare('SELECT total FROM visits WHERE id = 1').get()
if(!visitsRow){
  db.prepare('INSERT INTO visits (id, total) VALUES (1, 0)').run()
}

const app = express()
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
app.get('/api/posts', (req, res)=>{
  const posts = db.prepare('SELECT * FROM posts ORDER BY date ASC').all()
  res.json(posts)
})

// Visit counter
app.get('/api/visits', (req, res)=>{
  db.prepare('UPDATE visits SET total = total + 1 WHERE id = 1').run()
  const row = db.prepare('SELECT total FROM visits WHERE id = 1').get()
  res.json({visits: row.total})
})

// create post
app.post('/api/posts', (req, res)=>{
  const {title, content, image} = req.body
  const date = new Date().toISOString()
  const info = db.prepare(
    'INSERT INTO posts (title, content, image, date, likes) VALUES (?, ?, ?, ?, 0)'
  ).run(title || '', content || '', image || null, date)
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid)
  sendNotificationEmail(
    `New post on Allotment and Gardening AllManiac: ${post.title}`,
    `A new post was published.\n\nTitle: ${post.title}\n\n${post.content}\n\nPosted: ${post.date}`
  )
  res.json(post)
})

// update post
app.put('/api/posts/:id', (req, res)=>{
  const id = Number(req.params.id)
  const {title, content, image} = req.body
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(id)
  if(!existing) return res.status(404).json({error: 'Post not found'})
  const date = new Date().toISOString()
  db.prepare('UPDATE posts SET title = ?, content = ?, image = ?, date = ? WHERE id = ?')
    .run(title || '', content || '', image || null, date, id)
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id)
  res.json(post)
})

// delete post
app.delete('/api/posts/:id', (req,res)=>{
  const id = Number(req.params.id)
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(id)
  if(!existing) return res.status(404).json({error: 'Post not found'})
  db.prepare('DELETE FROM posts WHERE id = ?').run(id)
  db.prepare('DELETE FROM comments WHERE post_id = ?').run(id)
  res.json({success:true})
})

// import (replace all posts)
app.post('/api/import', (req, res)=>{
  const data = req.body
  if(!Array.isArray(data)) return res.status(400).json({error:'Expected array'})
  db.exec('DELETE FROM posts')
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'posts'")
  const insert = db.prepare(
    'INSERT INTO posts (title, content, image, date, likes) VALUES (?, ?, ?, ?, ?)'
  )
  for(const p of data){
    insert.run(
      p.title || '',
      p.content || '',
      p.image || null,
      p.date || new Date().toISOString(),
      p.likes || 0
    )
  }
  res.json({success:true})
})

// like/unlike post
app.post('/api/posts/:id/like', (req, res)=>{
  const id = Number(req.params.id)
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(id)
  if(!existing) return res.status(404).json({error: 'Post not found'})
  db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(id)
  const post = db.prepare('SELECT likes FROM posts WHERE id = ?').get(id)
  res.json({likes: post.likes})
})

// list comments for a post
app.get('/api/posts/:id/comments', (req, res)=>{
  const postId = Number(req.params.id)
  const list = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY date ASC').all(postId)
  res.json(list)
})

// create a comment on a post
app.post('/api/posts/:id/comments', (req, res)=>{
  const postId = Number(req.params.id)
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId)
  if(!post) return res.status(404).json({error: 'Post not found'})
  const author = String(req.body.author || '').trim()
  const content = String(req.body.content || '').trim()
  if(!author || !content) return res.status(400).json({error: 'Author and content are required'})
  const date = new Date().toISOString()
  const info = db.prepare(
    'INSERT INTO comments (post_id, author, content, date) VALUES (?, ?, ?, ?)'
  ).run(postId, author, content, date)
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid)
  sendNotificationEmail(
    `New comment on "${post.title}"`,
    `${author} commented on "${post.title}":\n\n${content}\n\nPosted: ${comment.date}`
  )
  res.json(comment)
})

// serve static files
app.use(express.static(path.join(__dirname)))

app.listen(PORT, ()=>{
  console.log(`Server listening on http://localhost:${PORT}/`)
})
