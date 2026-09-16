const express = require('express')
const path = require('path')
const fs = require('fs')

const DATA_FILE = path.join(__dirname, 'posts.json')
const VISITS_FILE = path.join(__dirname, 'visits.json')
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bjzeuzhkcfhzalmtnkmz.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_J7P-kMweBzUUJplE_ZgFQA_nIhvIcKD'
let posts = []
let nextId = 1
let visitCount = 0

async function getSupabaseVisitTotal(){
  try{
    const listRes = await fetch(`${SUPABASE_URL}/rest/v1/site_visits?select=id,total_visits&order=id.asc&limit=1`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    })
    if(!listRes.ok) throw new Error('Supabase fetch failed')
    const rows = await listRes.json()
    if(!Array.isArray(rows) || rows.length === 0){
      const createRes = await fetch(`${SUPABASE_URL}/rest/v1/site_visits`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ total_visits: 1 })
      })
      if(!createRes.ok) throw new Error('Supabase create failed')
      const created = await createRes.json()
      const total = Number(Array.isArray(created) ? created[0]?.total_visits : created?.total_visits || 1)
      return total
    }

    const row = rows[0]
    const nextTotal = Number(row.total_visits || 0) + 1
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/site_visits?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ total_visits: nextTotal })
    })
    if(!patchRes.ok) throw new Error('Supabase patch failed')
    return nextTotal
  }catch(e){
    console.warn('Supabase visits unavailable, falling back to local counter:', e.message)
    return null
  }
}

// Load posts from file
function loadPosts(){
  try{
    if(fs.existsSync(DATA_FILE)){
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
      posts = data
      nextId = Math.max(...posts.map(p=>p.id), 0) + 1
    }
  }catch(e){
    console.error('Error loading posts:', e.message)
    posts = []
    nextId = 1
  }
}

// Save posts to file
function savePosts(){
  try{
    fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2))
  }catch(e){
    console.error('Error saving posts:', e.message)
  }
}

function loadVisits(){
  try{
    if(fs.existsSync(VISITS_FILE)){
      const data = JSON.parse(fs.readFileSync(VISITS_FILE, 'utf8'))
      visitCount = Number(data.visits) || 0
    }
  }catch(e){
    console.error('Error loading visits:', e.message)
    visitCount = 0
  }
}

function saveVisits(){
  try{
    fs.writeFileSync(VISITS_FILE, JSON.stringify({visits: visitCount}, null, 2))
  }catch(e){
    console.error('Error saving visits:', e.message)
  }
}

loadPosts()
loadVisits()

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
  res.json(posts.sort((a,b) => new Date(a.date) - new Date(b.date)))
})

// Visit counter
app.get('/api/visits', async (req, res)=>{
  const hostedTotal = await getSupabaseVisitTotal()
  if(hostedTotal !== null){
    return res.json({visits: hostedTotal})
  }

  visitCount += 1
  saveVisits()
  return res.json({visits: visitCount})
})

// create post
app.post('/api/posts', (req, res)=>{
  const {title, content, image} = req.body
  const post = {
    id: nextId++,
    title: title || '',
    content: content || '',
    image: image || null,
    date: new Date().toISOString(),
    likes: 0
  }
  posts.push(post)
  savePosts()
  res.json(post)
})

// update post
app.put('/api/posts/:id', (req, res)=>{
  const id = Number(req.params.id)
  const {title, content, image} = req.body
  const post = posts.find(p => p.id === id)
  if(!post) return res.status(404).json({error: 'Post not found'})
  post.title = title || ''
  post.content = content || ''
  post.image = image || null
  post.date = new Date().toISOString()
  savePosts()
  res.json(post)
})

// delete post
app.delete('/api/posts/:id', (req,res)=>{
  const id = Number(req.params.id)
  const index = posts.findIndex(p => p.id === id)
  if(index === -1) return res.status(404).json({error: 'Post not found'})
  posts.splice(index, 1)
  savePosts()
  res.json({success:true})
})

// import (replace all posts)
app.post('/api/import', (req, res)=>{
  const data = req.body
  if(!Array.isArray(data)) return res.status(400).json({error:'Expected array'})
  posts = []
  nextId = 1
  for(const p of data){
    posts.push({
      id: nextId++,
      title: p.title || '',
      content: p.content || '',
      image: p.image || null,
      date: p.date || new Date().toISOString(),
      likes: p.likes || 0
    })
  }
  savePosts()
  res.json({success:true})
})

// like/unlike post
app.post('/api/posts/:id/like', (req, res)=>{
  const id = Number(req.params.id)
  const post = posts.find(p => p.id === id)
  if(!post) return res.status(404).json({error: 'Post not found'})
  post.likes = (post.likes || 0) + 1
  savePosts()
  res.json({likes: post.likes})
})

// serve static files
app.use(express.static(path.join(__dirname)))

app.listen(PORT, ()=>{
  console.log(`Server listening on http://localhost:${PORT}/`)
})
