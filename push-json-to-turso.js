// Step 2 of 2: pushes blog-export.json (written by dump-blog-db-to-json.js)
// up to your Turso database. This script never touches node:sqlite or any
// local database file — it only reads JSON and talks to Turso over the
// network, to avoid the two experimental Node features interfering with
// each other in the same process.
//
//   $env:TURSO_DATABASE_URL="libsql://..."
//   $env:TURSO_AUTH_TOKEN="ey..."
//   node dump-blog-db-to-json.js
//   node push-json-to-turso.js

const path = require('path')
const fs = require('fs')
const { createClient } = require('@libsql/client')

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN

if(!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN){
  console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first — see TURSO_SETUP.md.')
  process.exit(1)
}

console.log('Using TURSO_DATABASE_URL:', TURSO_DATABASE_URL)
console.log('Using TURSO_AUTH_TOKEN (first 12 chars):', TURSO_AUTH_TOKEN.slice(0, 12) + '...', `(length ${TURSO_AUTH_TOKEN.length})`)

async function main(){
  const exportPath = path.join(__dirname, 'blog-export.json')
  if(!fs.existsSync(exportPath)){
    console.error('blog-export.json not found. Run this first: node dump-blog-db-to-json.js')
    process.exit(1)
  }
  const { posts, comments, visits } = JSON.parse(fs.readFileSync(exportPath, 'utf8'))
  console.log(`Read from blog-export.json: ${posts.length} post(s), ${comments.length} comment(s), visits=${visits}.`)

  const turso = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN })

  console.log('Setting up tables on Turso (if not already present)...')
  await turso.batch([
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

  console.log('Clearing any existing posts/comments on Turso...')
  await turso.execute('DELETE FROM comments')
  await turso.execute('DELETE FROM posts')

  const oldIdToNewId = new Map()
  for(const p of posts){
    const info = await turso.execute({
      sql: 'INSERT INTO posts (title, content, image, date, likes) VALUES (?, ?, ?, ?, ?)',
      args: [p.title || '', p.content || '', p.image || null, p.date, p.likes || 0]
    })
    oldIdToNewId.set(p.id, Number(info.lastInsertRowid))
  }
  console.log(`Inserted ${posts.length} post(s) into Turso.`)

  let insertedComments = 0
  for(const c of comments){
    const newPostId = oldIdToNewId.get(c.post_id)
    if(newPostId === undefined) continue
    await turso.execute({
      sql: 'INSERT INTO comments (post_id, author, content, date) VALUES (?, ?, ?, ?)',
      args: [newPostId, c.author || '', c.content || '', c.date]
    })
    insertedComments++
  }
  console.log(`Inserted ${insertedComments} comment(s) into Turso.`)

  const existingVisits = await turso.execute('SELECT total FROM visits WHERE id = 1')
  if(existingVisits.rows.length === 0){
    await turso.execute({ sql: 'INSERT INTO visits (id, total) VALUES (1, ?)', args: [visits] })
  } else {
    await turso.execute({ sql: 'UPDATE visits SET total = ? WHERE id = 1', args: [visits] })
  }
  console.log(`Set visit count to ${visits} on Turso.`)

  console.log('Done. You can now run: node server.js')
}

main().catch(err => {
  console.error('Push to Turso failed:', err.message)
  if(err.cause) console.error('Cause:', err.cause)
  if(err.code) console.error('Code:', err.code)
  console.error(err)
  process.exitCode = 1
})
