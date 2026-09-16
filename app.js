const DRAFT_KEY = 'simple-blog-draft'
const LOCAL_POSTS_KEY = 'simple-blog-posts'
const LOCAL_COMMENTS_KEY = 'simple-blog-comments'
const MODERATOR_SESSION_KEY = 'simple-blog-comment-admin'
const MODERATOR_PASSWORD = 'allotment-admin'
const SUPABASE_URL = 'https://bjzeuzhkcfhzalmtnkmz.supabase.co'
const SUPABASE_KEY = 'sb_publishable_J7P-kMweBzUUJplE_ZgFQA_nIhvIcKD'
const USE_SUPABASE = window.location.hostname.endsWith('github.io') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
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
			const res = await supabaseRequest('posts?select=id,title,content,date,likes&status=eq.approved&order=date.asc')
			if(!res.ok) throw new Error('Supabase unavailable')
			return await res.json()
		}catch(e){return loadLocalPosts()}
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

function getLocalComments(){
	try{
		const raw = localStorage.getItem(LOCAL_COMMENTS_KEY)
		return raw ? JSON.parse(raw) : []
	}catch(e){return []}
}

function saveLocalComments(comments){
	try{localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(comments))}catch(e){}
}

function normalizeComment(comment){
	return {
		id: Number(comment.id ?? Date.now()),
		post_id: Number(comment.post_id ?? comment.postId ?? 0),
		author: String(comment.author || 'Anonymous'),
		content: String(comment.content || ''),
		date: comment.date || new Date().toISOString(),
		status: comment.status || 'approved'
	}
}

function renderCommentList(comments){
	const list = Array.isArray(comments) ? comments : []
	if(list.length === 0){
		return '<div class="comment-empty">No comments yet.</div>'
	}
	return list.map(comment => `
		<div class="comment-item">
			<div class="comment-head">
				<strong>${escapeHtml(comment.author || 'Anonymous')}</strong>
				<span>${new Date(comment.date).toLocaleString()}</span>
			</div>
			<p>${escapeHtml(comment.content)}</p>
		</div>
	`).join('')
}

async function loadCommentsForPost(postId){
	if(USE_SUPABASE){
		try{
			const res = await supabaseRequest(`comments?select=id,post_id,author,content,date,status&post_id=eq.${postId}&status=eq.approved&order=date.asc`)
			if(!res.ok) throw new Error('Supabase comments unavailable')
			return (await res.json()).map(normalizeComment)
		}catch(e){
			return getLocalComments()
				.filter(c => Number(c.post_id) === Number(postId) && (c.status === 'approved' || !('status' in c)))
				.map(normalizeComment)
		}
	}
	return getLocalComments()
		.filter(c => Number(c.post_id) === Number(postId) && (c.status === 'approved' || !('status' in c)))
		.map(normalizeComment)
}

async function submitComment(postId, author, content){
	const trimmedAuthor = String(author || '').trim()
	const trimmedContent = String(content || '').trim()
	if(!trimmedAuthor || !trimmedContent) return null
	if(USE_SUPABASE){
		try{
			const res = await supabaseRequest('comments', {
				method: 'POST',
				body: JSON.stringify({
					post_id: Number(postId),
					author: trimmedAuthor,
					content: trimmedContent,
					date: new Date().toISOString(),
					status: 'pending'
				})
			})
			if(!res.ok) throw new Error('Supabase rejected the new comment')
			return {message: 'Your comment was submitted for moderation.'}
		}catch(e){
			const comments = getLocalComments()
			comments.push({
				id: Date.now(),
				post_id: Number(postId),
				author: trimmedAuthor,
				content: trimmedContent,
				date: new Date().toISOString(),
				status: 'pending'
			})
			saveLocalComments(comments)
			return {message: 'Comment saved locally. Supabase moderation is currently unavailable.'}
		}
	}
	const comments = getLocalComments()
	comments.push({
		id: Date.now(),
		post_id: Number(postId),
		author: trimmedAuthor,
		content: trimmedContent,
		date: new Date().toISOString(),
		status: 'approved'
	})
	saveLocalComments(comments)
	return {message: 'Comment posted.'}
}

async function loadPendingComments(){
	if(USE_SUPABASE){
		try{
			const res = await supabaseRequest('comments?select=id,post_id,author,content,date,status&status=eq.pending&order=date.asc')
			if(!res.ok) throw new Error('Unable to load moderation queue')
			return (await res.json()).map(normalizeComment)
		}catch(e){
			return getLocalComments().filter(c => c.status === 'pending').map(normalizeComment)
		}
	}
	return getLocalComments().filter(c => c.status === 'pending').map(normalizeComment)
}

async function updateCommentStatus(id, status){
	if(USE_SUPABASE){
		const res = await supabaseRequest(`comments?id=eq.${id}`, {
			method: 'PATCH',
			body: JSON.stringify({status})
		})
		if(!res.ok) throw new Error('Unable to update comment status')
		return true
	}
	const comments = getLocalComments()
	const comment = comments.find(c => Number(c.id) === Number(id))
	if(!comment) return false
	comment.status = status
	saveLocalComments(comments)
	return true
}

function createPostElement(post){
	const el = document.createElement('article')
	el.className = 'post'
	let imageHtml = ''
	if(USE_SUPABASE){
		imageHtml = `<img data-image-id="${post.id}" loading="lazy" decoding="async" alt="" style="display:none;width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin-bottom:12px">`
	} else if(post.image){
		imageHtml = `<img data-loaded="true" src="${escapeHtml(post.image)}" loading="lazy" decoding="async" alt="" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin-bottom:12px">`
	}
	const comments = Array.isArray(post.comments) ? post.comments : []
	el.innerHTML = `
		<button type="button" class="post-title">${escapeHtml(post.title)}</button>
		<div class="meta">${new Date(post.date).toLocaleString()}</div>
		${imageHtml}
		<p>${escapeHtml(post.content)}</p>
		<div class="actions">
			<button data-id="${post.id}" class="btn alt like">👍 ${post.likes || 0}</button>
			<button data-id="${post.id}" class="btn alt view">View</button>
			${USE_SUPABASE ? '' : `<button data-id="${post.id}" class="btn alt edit">Edit</button>
			<button data-id="${post.id}" class="btn alt delete">Delete</button>`}
		</div>
		<div class="comments-panel">
			<div class="comments-title">Comments (${comments.length})</div>
			<div class="comment-list">${renderCommentList(comments)}</div>
			
     <form class="comment-form" data-post-id="${post.id}">
	<label for="comment-author-card-${post.id}" class="sr-only">Your name</label>
	<input id="comment-author-card-${post.id}" name="author" type="text" maxlength="60" placeholder="Your name" autocomplete="name" required>
	<label for="comment-content-card-${post.id}" class="sr-only">Comment</label>
	<textarea id="comment-content-card-${post.id}" name="content" rows="3" placeholder="Write a comment..." autocomplete="off" required></textarea>
	<button type="submit" class="btn alt small-btn">Post comment</button>
       </form>
		</div>
	`
	return el
}

function ensurePostViewer(){
	let viewer = qs('#postViewer')
	if(!viewer){
		viewer = document.createElement('div')
		viewer.id = 'postViewer'
		viewer.className = 'post-viewer hidden'
		viewer.setAttribute('aria-hidden', 'true')
		document.body.appendChild(viewer)
	}
	return viewer
}

function closePostViewer(){
	const viewer = qs('#postViewer')
	if(!viewer) return
	viewer.classList.add('hidden')
	viewer.setAttribute('aria-hidden', 'true')
	viewer.innerHTML = ''
}

function showPostViewer(post){
	const viewer = ensurePostViewer()
	const imageHtml = post.image ? `<img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" class="viewer-image">` : ''
	const comments = Array.isArray(post.comments) ? post.comments : []
	viewer.classList.remove('hidden')
	viewer.setAttribute('aria-hidden', 'false')
	viewer.innerHTML = `
		<div class="post-viewer-backdrop" data-close="true"></div>
		<div class="post-viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="postViewerTitle">
			<button type="button" class="viewer-close" aria-label="Close">×</button>
			<h2 id="postViewerTitle">${escapeHtml(post.title)}</h2>
			<div class="meta">${new Date(post.date).toLocaleString()}</div>
			${imageHtml}
			<p>${escapeHtml(post.content)}</p>
			<div class="viewer-stats">👍 ${post.likes || 0}</div>
			<div class="viewer-comments">
				<div class="comments-title">Comments (${comments.length})</div>
				<div class="comment-list">${renderCommentList(comments)}</div>
				<form class="comment-form" data-post-id="${post.id}">
					<input name="author" type="text" maxlength="60" placeholder="Your name" aria-label="Your name" required>
					<textarea name="content" rows="3" placeholder="Write a comment..." aria-label="Write a comment" required></textarea>
					<button type="submit" class="btn alt small-btn">Post comment</button>
				</form>
			</div>
		</div>
	`
	viewer.querySelector('.viewer-close').addEventListener('click', closePostViewer)
	viewer.querySelector('.post-viewer-backdrop').addEventListener('click', closePostViewer)
	const form = viewer.querySelector('.comment-form')
	if(form){
		form.addEventListener('submit', async (e)=>{
			e.preventDefault()
			const postId = Number(form.dataset.postId)
			const authorField = form.querySelector('[name="author"]')
			const contentField = form.querySelector('[name="content"]')
			if(!postId || !authorField || !contentField) return
			try{
				const result = await submitComment(postId, authorField.value, contentField.value)
				if(result){
					form.reset()
					const posts = await loadPosts()
					const current = posts.find(p => p.id === postId)
					if(current){
						current.comments = await loadCommentsForPost(postId)
						showPostViewer(current)
					}
					alert(result.message)
				}
			}catch(err){
				alert(err.message)
			}
		})
	}
}

async function loadPostImage(img){
	if(!USE_SUPABASE || img.dataset.loaded) return
	img.dataset.loaded = 'true'
	try{
		const res = await supabaseRequest(`posts?id=eq.${img.dataset.imageId}&select=image`)
		if(!res.ok) return
		const data = await res.json()
		if(data[0] && data[0].image){
			img.src = data[0].image
			img.style.display = 'block'
		}
	}catch(e){}
}

function isModeratorLoggedIn(){
	try{
		return localStorage.getItem(MODERATOR_SESSION_KEY) === 'true'
	}catch(e){
		return false
	}
}

function setModeratorLoggedIn(value){
	try{
		localStorage.setItem(MODERATOR_SESSION_KEY, value ? 'true' : 'false')
	}catch(e){}
}

function toggleModeratorLogin(){
	const form = qs('#moderationLoginForm')
	const toggle = qs('#moderationLoginToggle')
	if(!form) return
	const isVisible = form.style.display !== 'none'
	form.style.display = isVisible ? 'none' : 'grid'
	if(toggle){
		toggle.textContent = isVisible ? 'Admin login' : 'Close login'
	}
}

async function renderModerationQueue(){
	const container = qs('#moderationQueue')
	const loginPanel = qs('#moderationLoginForm')
	const loginToggle = qs('#moderationLoginToggle')
	const logoutBtn = qs('#moderationLogout')
	if(!container) return
	const loggedIn = isModeratorLoggedIn()
	if(loginToggle){
		loginToggle.style.display = loggedIn ? 'none' : 'inline-block'
	}
	if(loginPanel){
		loginPanel.style.display = loggedIn ? 'none' : 'grid'
	}
	if(logoutBtn){
		logoutBtn.style.display = loggedIn ? 'inline-block' : 'none'
	}
	if(!loggedIn){
		container.innerHTML = '<p class="comment-empty">Sign in to review pending comments.</p>'
		return
	}
	try{
		const pending = await loadPendingComments()
		if(!pending.length){
			container.innerHTML = '<p class="comment-empty">No pending comments.</p>'
			return
		}
		container.innerHTML = pending.map(comment => `
			<div class="moderation-item" data-comment-id="${comment.id}">
				<div class="moderation-meta">
					<strong>${escapeHtml(comment.author || 'Anonymous')}</strong>
					<span>${new Date(comment.date).toLocaleString()}</span>
				</div>
				<p>${escapeHtml(comment.content)}</p>
				<div class="moderation-actions">
					<button type="button" class="btn approve-comment" data-comment-id="${comment.id}">Approve</button>
					<button type="button" class="btn alt reject-comment" data-comment-id="${comment.id}">Reject</button>
				</div>
			</div>
		`).join('')
	}catch(e){
		container.innerHTML = '<p class="comment-empty">Moderation queue unavailable.</p>'
	}
}

async function render(){
	const postsEl = qs('#posts')
	postsEl.innerHTML = ''
	const posts = await loadPosts()
	if(!posts || posts.length === 0){
		postsEl.innerHTML = '<p class="small">No posts yet — create one above.</p>'
		return
	}
	const withComments = await Promise.all(posts.map(async (post) => {
		post.comments = await loadCommentsForPost(post.id)
		return post
	}))
	withComments.slice().reverse().forEach(p=>postsEl.appendChild(createPostElement(p)))
	if(USE_SUPABASE){
		await Promise.all(Array.from(postsEl.querySelectorAll('[data-image-id]'), loadPostImage))
	}
	await renderModerationQueue()
}

async function addPost(title, content, image){
	if(USE_SUPABASE){
		const res = await supabaseRequest('posts', {
			method: 'POST',
			body: JSON.stringify({
				title,
				content,
				image: image || null,
				date: new Date().toISOString(),
				likes: 0,
				status: 'pending'
			})
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

async function loadVisitCount(){
	const counter = qs('#visitCounter')
	if(!counter) return

	if(USE_SUPABASE){
		try{
			const res = await supabaseRequest('rpc/increment_visits', {method: 'POST'})
			if(!res.ok) throw new Error('Supabase visit counter unavailable')
			const data = await res.json()
			const visits = Number(Array.isArray(data) ? data[0] : data) || 0
			counter.textContent = `Total visits: ${visits.toLocaleString()}`
			return
		}catch(err){
			console.error('Failed to load visit count from Supabase:', err)
		}
	}

	// Local fallback (no backend, e.g. running the plain files without Supabase)
	try{
		const raw = localStorage.getItem('simple-blog-visits')
		const visits = (raw ? Number(raw) || 0 : 0) + 1
		localStorage.setItem('simple-blog-visits', String(visits))
		counter.textContent = `Total visits: ${visits.toLocaleString()}`
	}catch(err){
		counter.textContent = 'Total visits: 0'
		console.error('Failed to load visit count:', err)
	}
}

async function init(){
	await loadVisitCount()
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
		const postEl = el.closest('.post')
		if(postEl && el.closest('.post-title')){
			const image = postEl.querySelector('[data-image-id]')
			const localImage = image || postEl.querySelector('img')
			if(localImage){
				if(localImage.style.display === 'block'){
					localImage.style.display = 'none'
				} else if(USE_SUPABASE && !localImage.dataset.loaded){
					await loadPostImage(localImage)
				} else {
					localImage.style.display = 'block'
				}
			}
		}
		const id = Number(el.dataset.id)
		if(el.classList.contains('delete')){
			if(!isNaN(id)) await deletePost(id)
		} else if(el.classList.contains('view')){
			if(!isNaN(id)){
				const posts = await loadPosts()
				const post = posts.find(x=>x.id === id)
				if(post){
					post.comments = await loadCommentsForPost(post.id)
					showPostViewer(post)
				}
			}
		} else if(el.classList.contains('like')){
			if(!isNaN(id)){
				try{
					if(USE_SUPABASE){
						const posts = await loadPosts()
						const post = posts.find(p=>p.id === id)
						if(!post) return
						const nextLikes = (post.likes || 0) + 1
						const res = await supabaseRequest(`posts?id=eq.${id}`, {
							method: 'PATCH',
							body: JSON.stringify({likes: nextLikes})
						})
						if(res.ok) el.textContent = `👍 ${nextLikes}`
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

	qs('#posts').addEventListener('submit', async (e)=>{
		const form = e.target.closest('.comment-form')
		if(!form) return
		e.preventDefault()
		const postId = Number(form.dataset.postId)
		const author = form.querySelector('[name="author"]')
		const content = form.querySelector('[name="content"]')
		if(!postId || !author || !content) return
		try{
			const result = await submitComment(postId, author.value, content.value)
			if(result){
				form.reset()
				await render()
				alert(result.message)
			}
		}catch(err){
			alert(err.message)
		}
	})

	const moderationQueue = qs('#moderationQueue')
	if(moderationQueue){
		moderationQueue.addEventListener('click', async (e)=>{
			const btn = e.target.closest('button')
			if(!btn) return
			const commentId = Number(btn.dataset.commentId)
			if(!commentId) return
			const nextStatus = btn.classList.contains('approve-comment') ? 'approved' : 'rejected'
			try{
				const ok = await updateCommentStatus(commentId, nextStatus)
				if(ok){
					await render()
					alert(`Comment ${nextStatus}.`)
				}
			}catch(err){
				alert(err.message)
			}
		})
	}

	const moderationLoginToggle = qs('#moderationLoginToggle')
	if(moderationLoginToggle){
		moderationLoginToggle.addEventListener('click', toggleModeratorLogin)
		moderationLoginToggle.textContent = 'Admin login'
	}

	const moderationLoginForm = qs('#moderationLoginForm')
	if(moderationLoginForm){
		moderationLoginForm.addEventListener('submit', async (e)=>{
			e.preventDefault()
			const input = qs('#moderationPassword')
			if(!input) return
			if(input.value === MODERATOR_PASSWORD){
				setModeratorLoggedIn(true)
				moderationLoginForm.style.display = 'none'
				await render()
				alert('Moderator access enabled.')
				input.value = ''
				return
			}
			alert('Incorrect moderator password.')
			input.value = ''
		})
	}

	const moderationLogout = qs('#moderationLogout')
	if(moderationLogout){
		moderationLogout.addEventListener('click', () => {
			setModeratorLoggedIn(false)
			renderModerationQueue()
		})
	}

	const current = await loadPosts()
	if(!current || current.length === 0){
		if(USE_SUPABASE) await render()
		else await addPost('Welcome','This is your first post. Edit or delete it, or create new posts using the form above.')
	} else {
		await render()
	}
}

document.addEventListener('DOMContentLoaded', init)
