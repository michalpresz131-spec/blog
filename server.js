const express = require('express')
const path = require('path')
const fs = require('fs')

const DATA_FILE = path.join(__dirname, 'posts.json')
let posts = []
let nextId = 1

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

loadPosts()

const app = express()
const PORT = process.env.PORT || 8000

app.use(express.json({limit: '12mb'}))
app.use(express.urlencoded({extended:true}))

// API: list posts (ascending by date)
app.get('/api/posts', (req, res)=>{
  res.json(posts.sort((a,b) => new Date(a.date) - new Date(b.date)))
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
