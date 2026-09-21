// One-time script: pushes the posts, comments, and visit count already in
// your local blog.db (which you migrated from Supabase earlier) up into
// your new Turso database.
//
// Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to be set (see
// TURSO_SETUP.md) and blog.db to already exist locally with your data in it.
//
//   $env:TURSO_DATABASE_URL="libsql://..."
//   $env:TURSO_AUTH_TOKEN="ey..."
//   node push-local-to-turso.js
//
// Safe to re-run: it clears posts/comments on Turso and re-inserts from
// blog.db each time, rather than duplicating.

const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const { createClient } = require('@libsql/client')

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN

if(!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN){
  console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first — see TURSO_SETUP.md.')
  process.exit(1)
}

async function main(){
  const localDb = new DatabaseSync(path.join(__dirname, 'blog.db'))
  const posts = localDb.prepare('SELECT * FROM posts ORDER BY date ASC').all()
  const comments = localDb.prepare('SELECT * FROM comments ORDER BY date ASC').all()
  let visitsTotal = 0
  try{
    const row = localDb.prepare('SELECT total FROM visits WHERE id = 1').get()
    if(row) visitsTotal = Number(row.total) || 0
  }catch(e){
    // no visits table locally — fine, defaults to 0
  }
  localDb.close()

  console.log(`Read from blog.db: ${posts.length} post(s), ${comments.length} comment(s), visits=${visitsTotal}.`)

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
    await turso.execute({ sql: 'INSERT INTO visits (id, total) VALUES (1, ?)', args: [visitsTotal] })
  } else {
    await turso.execute({ sql: 'UPDATE visits SET total = ? WHERE id = 1', args: [visitsTotal] })
  }
  console.log(`Set visit count to ${visitsTotal} on Turso.`)

  console.log('Done. You can now run: node server.js')
}

main().catch(err => {
  console.error('Push to Turso failed:', err.message)
  process.exitCode = 1
})
