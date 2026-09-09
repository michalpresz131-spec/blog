const DRAFT_KEY = 'simple-blog-draft'
const LOCAL_POSTS_KEY = 'simple-blog-posts'
const SUPABASE_URL = 'https://bjzeuzhkcfhzalmtnkmz.supabase.co'
const SUPABASE_KEY = 'sb_publishable_E7nowgc62eOjnyE86yuJbw_XSxfN03m'
const USE_SUPABASE = window.location.hostname.endsWith('github.io')
let apiAvailable = null

function qs(sel){return document.querySelector(sel)}

async function supabaseRequest(path, options = {}){
	return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
		...options,
		headers: {
			apikey: SUPABASE_KEY,
			Authorization: `Bearer ${SUPABASE_KEY}`,
			'Content-Type': 'application/json',
			Prefer: 'return=representation',
			...(options.headers || {})
		}
	})
}

async function loadPosts(){
	if(USE_SUPABASE){
		try{
			const res = await supabaseRequest('posts?select=id,title,content,image,date,likes&status=eq.approved&order=date.asc')
			if(!res.ok) throw new Error('Supabase unavailable')
			return await res.json()
		}catch(e){return []}
	}
	if(apiAvailable === false){
		return loadLocalPosts()
	}
	try{
		const res = await fetch('/api/posts')
		if(!res.ok) throw new Error('API unavailable')
		apiAvailable = true
		return await res.json()
	}catch(e){
		apiAvailable = false
		return loadLocalPosts()
	}
}

async function loadLocalPosts(){
	try{
		const stored = localStorage.getItem(LOCAL_POSTS_KEY)
		if(stored) return JSON.parse(stored)
		const res = await fetch('posts.json')
		if(!res.ok) return []
		const posts = await res.json()
		localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts))
		return posts
	}catch(e){return []}
}

function saveLocalPosts(posts){
	try{localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts))}catch(e){}
}

function escapeHtml(str){
	return String(str)
		.replace(/&/g,'&amp;')
		.replace(/</g,'&lt;')
		.replace(/>/g,'&gt;')
		.replace(/"/g,'&quot;')
		.replace(/'/g,'&#39;')
}

function createPostElement(post){
	const el = document.createElement('article')
	el.className = 'post'
	let imageHtml = ''
	if(post.image){
		imageHtml = `<img src="${post.image}" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin-bottom:12px">`
	}
	el.innerHTML = `
		<h3>${escapeHtml(post.title)}</h3>
		<div class="meta">${new Date(post.date).toLocaleString()}</div>
		${imageHtml}
		<p>${escapeHtml(post.content)}</p>
		<div class="actions">
			<button data-id="${post.id}" class="btn alt like">👍 ${post.likes || 0}</button>
			${USE_SUPABASE ? '' : `<button data-id="${post.id}" class="btn alt edit">Edit</button>
			<button data-id="${post.id}" class="btn alt delete">Delete</button>`}
		</div>
	`
	return el
}

async function render(){
	const postsEl = qs('#posts')
	postsEl.innerHTML = ''
	const posts = await loadPosts()
	if(!posts || posts.length === 0){
		postsEl.innerHTML = '<p class="small">No posts yet — create one above.</p>'
		return
	}
	posts.slice().reverse().forEach(p=>postsEl.appendChild(createPostElement(p)))
}

async function addPost(title, content, image){
	if(USE_SUPABASE){
		const res = await supabaseRequest('rpc/submit_post', {
			method: 'POST',
			body: JSON.stringify({p_title: title, p_content: content, p_image: image || null})
		})
		if(!res.ok) throw new Error('Unable to submit post')
		await render()
		return
	}
	if(apiAvailable === false){
		const posts = await loadLocalPosts()
		posts.push({id: Date.now(), title, content, image: image || null, date: new Date().toISOString(), likes: 0})
		saveLocalPosts(posts)
		await render()
		return
	}
	await fetch('/api/posts', {
		method: 'POST',
		headers: {'Content-Type':'application/json'},
		body: JSON.stringify({title, content, image, likes: 0})
	})
	await render()
}

async function updatePost(id, title, content, image){
	if(USE_SUPABASE) return
	if(apiAvailable === false){
		const posts = await loadLocalPosts()
		const post = posts.find(p=>p.id === id)
		if(post) Object.assign(post, {title, content, image: image || null, date: new Date().toISOString()})
		saveLocalPosts(posts)
		await render()
		return
	}
	await fetch(`/api/posts/${id}`, {
		method: 'PUT',
		headers: {'Content-Type':'application/json'},
		body: JSON.stringify({title, content, image})
	})
	await render()
}

async function deletePost(id){
	if(USE_SUPABASE) return
	if(apiAvailable === false){
		const posts = await loadLocalPosts()
		saveLocalPosts(posts.filter(p=>p.id !== id))
		await render()
		return
	}
	await fetch(`/api/posts/${id}`, {method:'DELETE'})
	await render()
}

async function exportPosts(){
	const posts = await loadPosts()
	const blob = new Blob([JSON.stringify(posts, null, 2)], {type:'application/json'})
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = 'posts.json'
	document.body.appendChild(a)
	a.click()
	a.remove()
	URL.revokeObjectURL(url)
}

function importPostsFile(file){
	const reader = new FileReader()
	reader.onload = async ()=>{
		try{
			const data = JSON.parse(reader.result)
			if(!Array.isArray(data)) throw new Error('Invalid format')
			const ok = data.every(p=>p && typeof p.title === 'string' && typeof p.content === 'string')
			if(!ok) throw new Error('Invalid entries')
			if(USE_SUPABASE){
				const res = await supabaseRequest('posts', {
					method: 'POST',
					body: JSON.stringify(data.map(p=>({
						title: p.title,
						content: p.content,
						image: p.image || null,
						date: p.date || new Date().toISOString(),
						likes: p.likes || 0,
						status: 'pending'
					})))
				})
				if(!res.ok) throw new Error('Unable to import posts')
				await render()
				return
			}
			if(apiAvailable === false){
				saveLocalPosts(data)
				await render()
				return
			}
			await fetch('/api/import', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)})
			await render()
		}catch(err){
			alert('Failed to import posts: '+err.message)
		}
	}
	reader.readAsText(file)
}

function saveDraft(title, content, image){
	try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({title, content, image: image || null})) }catch(e){}
}

function loadDraft(){
	try{
		const raw = localStorage.getItem(DRAFT_KEY)
		return raw ? JSON.parse(raw) : null
	}catch(e){return null}
}

function clearDraft(){
	try{ localStorage.removeItem(DRAFT_KEY) }catch(e){}
}

function setEditingUI(isEditing, publishBtn, cancelBtn){
	if(isEditing){
		publishBtn.textContent = 'Save'
		cancelBtn.style.display = 'inline-block'
	} else {
		publishBtn.textContent = 'Publish'
		cancelBtn.style.display = 'none'
	}
}

async function init(){
	const form = qs('#postForm')
	const title = qs('#title')
	const content = qs('#content')
	const clearBtn = qs('#clearBtn')
	const cancelBtn = qs('#cancelBtn')
	const publishBtn = qs('#publishBtn')
	const exportBtn = qs('#exportBtn')
	const importInput = qs('#importInput')
	const imageInput = qs('#imageInput')
	const imagePreview = qs('#imagePreview')

	let editingId = null
	let currentImage = null

	// restore draft if present
	const draft = loadDraft()
	if(draft){
		title.value = draft.title || ''
		content.value = draft.content || ''
		if(draft.image){
			currentImage = draft.image
			imagePreview.innerHTML = `<img src="${draft.image}" style="max-height:200px;border-radius:8px"><button type="button" style="margin-left:8px;padding:6px 12px" onclick="document.querySelector('#imageInput').value='';document.querySelector('#imagePreview').innerHTML='';window.currentImage=null">Remove</button>`
		}
	}

	// autosave draft on input
	let draftTimer = null
	function scheduleSave(){
		if(draftTimer) clearTimeout(draftTimer)
		draftTimer = setTimeout(()=>saveDraft(title.value, content.value, currentImage), 250)
	}
	title.addEventListener('input', scheduleSave)
	content.addEventListener('input', scheduleSave)

	imageInput.addEventListener('change', (e)=>{
		const file = e.target.files && e.target.files[0]
		if(file){
			const reader = new FileReader()
			reader.onload = (evt)=>{
				currentImage = evt.target.result
				imagePreview.innerHTML = `<img src="${currentImage}" style="max-height:200px;border-radius:8px"><button type="button" style="margin-left:8px;padding:6px 12px" class="removeImage">Remove</button>`
				qs('.removeImage').addEventListener('click', ()=>{
					currentImage = null
					imageInput.value = ''
					imagePreview.innerHTML = ''
					scheduleSave()
				})
				scheduleSave()
			}
			reader.readAsDataURL(file)
		}
	})

	form.addEventListener('submit', async (e)=>{
		e.preventDefault()
		if(!title.value.trim() || !content.value.trim()) return
		if(editingId !== null){
			await updatePost(editingId, title.value.trim(), content.value.trim(), currentImage)
			editingId = null
			setEditingUI(false, publishBtn, cancelBtn)
		} else {
			await addPost(title.value.trim(), content.value.trim(), currentImage)
			if(USE_SUPABASE) alert('Your post was submitted for moderation.')
		}
		form.reset()
		imageInput.value = ''
		imagePreview.innerHTML = ''
		currentImage = null
		clearDraft()
	})

	clearBtn.addEventListener('click', ()=>{
		form.reset()
		imageInput.value = ''
		imagePreview.innerHTML = ''
		currentImage = null
		editingId = null
		setEditingUI(false, publishBtn, cancelBtn)
		clearDraft()
	})

	// Source - https://stackoverflow.com/q/73888164
// Posted by Ableez
// Retrieved 2026-02-13, License - CC BY-SA 4.0

        function liked(heart){
            heart.classList.toggle("liked");
            if (heart.liked) {
                click ++;
            } else {
                click --;
            }
            document.getElementById('clicks').innerHTML = click;
        } 
// Source - https://stackoverflow.com/q/73888164
// Posted by Ableez
// Retrieved 2026-02-13, License - CC BY-SA 4.0

        function liked(heart){
            heart.classList.toggle("liked");
            if (heart.liked) {
                click ++;
            } else {
                click --;
            }
            document.getElementById('clicks').innerHTML = click;
        } 
        function liked(heart){
            heart.classList.toggle("liked");
            if (heart.liked) {
                click ++;
            } else {
                click --;
            }
            document.getElementById('clicks').innerHTML = click;
        } 
	cancelBtn.addEventListener('click', ()=>{
		// cancel editing or clear draft
		if(editingId !== null){
			editingId = null
			form.reset()
			imageInput.value = ''
			imagePreview.innerHTML = ''
			currentImage = null
			setEditingUI(false, publishBtn, cancelBtn)
			clearDraft()
		} else {
			form.reset()
			imageInput.value = ''
			imagePreview.innerHTML = ''
			currentImage = null
			clearDraft()
		}
	})

	exportBtn.addEventListener('click', exportPosts)

	importInput.addEventListener('change', (e)=>{
		const f = e.target.files && e.target.files[0]
		if(f) importPostsFile(f)
		e.target.value = ''
	})

	qs('#posts').addEventListener('click', async (e)=>{
		const el = e.target
		const id = Number(el.dataset.id)
		if(el.classList.contains('delete')){
			if(!isNaN(id)) await deletePost(id)
		} else if(el.classList.contains('like')){
			if(!isNaN(id)){
				try{
					if(USE_SUPABASE){
						const posts = await loadPosts()
						const post = posts.find(p=>p.id === id)
						if(!post) return
						const res = await supabaseRequest('rpc/like_post', {
							method: 'POST',
							body: JSON.stringify({p_id: id})
						})
						if(res.ok) el.textContent = `👍 ${(post.likes || 0) + 1}`
						return
					}
					if(apiAvailable === false){
						const posts = await loadLocalPosts()
						const post = posts.find(p=>p.id === id)
						if(post){
							post.likes = (post.likes || 0) + 1
							saveLocalPosts(posts)
							el.textContent = `👍 ${post.likes}`
						}
						return
					}
					const res = await fetch(`/api/posts/${id}/like`, {method: 'POST'})
					if(res.ok){
						const data = await res.json()
						el.textContent = `👍 ${data.likes}`
					}
				}catch(e){
					console.error('Failed to like post:', e.message)
				}
			}
		} else if(el.classList.contains('edit')){
			const posts = await loadPosts()
			const p = posts.find(x=>x.id === id)
			if(p){
				title.value = p.title
				content.value = p.content
				currentImage = p.image || null
				if(currentImage){
					imagePreview.innerHTML = `<img src="${currentImage}" style="max-height:200px;border-radius:8px"><button type="button" style="margin-left:8px;padding:6px 12px" class="removeImage">Remove</button>`
					qs('.removeImage').addEventListener('click', ()=>{
						currentImage = null
						imageInput.value = ''
						imagePreview.innerHTML = ''
					})
				} else {
					imageInput.value = ''
					imagePreview.innerHTML = ''
				}
				editingId = id
				setEditingUI(true, publishBtn, cancelBtn)
				clearDraft()
				window.scrollTo({top:0,behavior:'smooth'})
			}
		}
	})

	const current = await loadPosts()
	if(!current || current.length === 0){
		if(USE_SUPABASE) await render()
		else await addPost('Welcome','This is your first post. Edit or delete it, or create new posts using the form above.')
	} else {
		await render()
	}
}

document.addEventListener('DOMContentLoaded', init)
