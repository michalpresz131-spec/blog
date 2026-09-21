// Step 1 of 2: reads your local blog.db and writes its contents to a plain
// JSON file (blog-export.json). No network calls happen here — this step
// only touches the local file.
//
//   node dump-blog-db-to-json.js

const path = require('path')
const fs = require('fs')
const { DatabaseSync } = require('node:sqlite')

const localDb = new DatabaseSync(path.join(__dirname, 'blog.db'))

const posts = localDb.prepare('SELECT * FROM posts ORDER BY date ASC').all()
const comments = localDb.prepare('SELECT * FROM comments ORDER BY date ASC').all()

let visits = 0
try{
  const row = localDb.prepare('SELECT total FROM visits WHERE id = 1').get()
  if(row) visits = Number(row.total) || 0
}catch(e){
  // no visits table — fine, defaults to 0
}

localDb.close()

const exportPath = path.join(__dirname, 'blog-export.json')
fs.writeFileSync(exportPath, JSON.stringify({ posts, comments, visits }, null, 2))

console.log(`Wrote ${posts.length} post(s), ${comments.length} comment(s), visits=${visits} to blog-export.json`)
console.log('Next: node push-json-to-turso.js')
