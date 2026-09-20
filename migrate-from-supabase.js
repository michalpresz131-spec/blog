// One-time migration: pulls approved posts, approved comments, and the
// visit count from Supabase into your new SQLite database (blog.db).
//
// Run this ONCE, with server.js NOT running at the same time (so nothing
// else has blog.db open), then start server.js normally afterward:
//
//   node migrate-from-supabase.js
//   node server.js
//
// Safe to re-run: it clears and re-inserts posts/comments each time rather
// than duplicating them, so if something looks wrong you can just fix it
// and run it again.

const path = require('path')
const { DatabaseSync } = require('node:sqlite')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bjzeuzhkcfhzalmtnkmz.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_J7P-kMweBzUUJplE_ZgFQA_nIhvIcKD'

const DB_FILE = path.join(__dirname, 'blog.db')

async function supabaseGet(pathAndQuery){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  })
  if(!res.ok){
    const body = await res.text().catch(() => '')
    throw new Error(`Supabase request failed (${res.status}): ${pathAndQuery}${body ? `\n${body}` : ''}`)
  }
  return res.json()
}

async function main(){
  console.log('Connecting to Supabase...')

  const posts = await supabaseGet(
    'posts?select=id,title,content,date,likes&status=eq.approved&order=date.asc'
  )
  console.log(`Found ${posts.length} approved post(s). Fetching images one at a time (this can take a bit)...`)

  for(const p of posts){
    try{
      const rows = await supabaseGet(`posts?id=eq.${p.id}&select=image`)
      p.image = Array.isArray(rows) && rows.length > 0 ? rows[0].image : null
    }catch(e){
      console.warn(`Could not fetch image for post ${p.id} (continuing without it):`, e.message)
      p.image = null
    }
  }

  const comments = await supabaseGet(
    'comments?select=post_id,author,content,date&status=eq.approved&order=date.asc'
  )
  console.log(`Found ${comments.length} approved comment(s).`)

  let visitsTotal = null
  try{
    const visitsRows = await supabaseGet('site_stats?select=visits&order=id.asc&limit=1')
    if(Array.isArray(visitsRows) && visitsRows.length > 0){
      visitsTotal = Number(visitsRows[0].visits) || 0
      console.log(`Found visit count: ${visitsTotal}.`)
    }
  }catch(e){
    console.warn('Could not read visit count (skipping):', e.message)
  }

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
  const existingVisitsRow = db.prepare('SELECT total FROM visits WHERE id = 1').get()
  if(!existingVisitsRow){
    db.prepare('INSERT INTO visits (id, total) VALUES (1, 0)').run()
  }

  console.log('Clearing any existing posts/comments in blog.db...')
  db.exec('DELETE FROM comments')
  db.exec('DELETE FROM posts')
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('posts','comments')")

  const insertPost = db.prepare(
    'INSERT INTO posts (title, content, image, date, likes) VALUES (?, ?, ?, ?, ?)'
  )
  const insertComment = db.prepare(
    'INSERT INTO comments (post_id, author, content, date) VALUES (?, ?, ?, ?)'
  )

  // Map old Supabase post ids -> new local SQLite post ids, so comments
  // attach to the right post even though ids get reassigned locally.
  const oldIdToNewId = new Map()

  for(const p of posts){
    const info = insertPost.run(
      p.title || '',
      p.content || '',
      p.image || null,
      p.date || new Date().toISOString(),
      p.likes || 0
    )
    oldIdToNewId.set(p.id, info.lastInsertRowid)
  }
  console.log(`Inserted ${posts.length} post(s) into blog.db.`)

  let insertedComments = 0
  let skippedComments = 0
  for(const c of comments){
    const newPostId = oldIdToNewId.get(c.post_id)
    if(newPostId === undefined){
      // Comment belonged to a post that wasn't approved / no longer exists
      skippedComments++
      continue
    }
    insertComment.run(newPostId, c.author || '', c.content || '', c.date || new Date().toISOString())
    insertedComments++
  }
  console.log(`Inserted ${insertedComments} comment(s) into blog.db.`)
  if(skippedComments > 0){
    console.log(`Skipped ${skippedComments} comment(s) whose post wasn't in the approved set.`)
  }

  if(visitsTotal !== null){
    db.prepare('UPDATE visits SET total = ? WHERE id = 1').run(visitsTotal)
    console.log(`Set visit count to ${visitsTotal}.`)
  }

  db.close()
  console.log('Done. You can now run: node server.js')
}

main().catch(err => {
  console.error('Migration failed:', err.message)
  process.exitCode = 1
})
