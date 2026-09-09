# Allotment Mentality — Run Server

This project now includes a minimal Express + SQLite backend and a frontend that uses the API.

Run locally with Node:

```powershell
# install dependencies (Node/npm required)
npm install
# start server
npm start
# open http://localhost:8000/
```

Verify the API:

```powershell
Invoke-RestMethod http://localhost:8000/api/posts
```

If you don't have Node installed, I can also provide a Dockerfile and compose file.

Run with Docker (recommended if Node isn't installed):

```bash
docker compose up --build
# open http://localhost:8000/
```

To stop:

```bash
docker compose down
```
