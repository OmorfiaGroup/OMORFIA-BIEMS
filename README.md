# Omorfia BIEMS — shared-server build

Same app you already have on GitHub Pages — same map, dashboard, filters,
location profiles, Add/Edit forms — with one change: instead of each
browser keeping its own private copy of the data (in its "local storage"),
every location record now lives on this small server, in `data/db.json`.
Everyone who opens the link reads and writes that same shared file, so an
entry someone else adds or edits shows up for you too.

## How to deploy this (Render, free tier)

1. **Push this folder to your existing GitHub repo** (`OmorfiaGroup/OMORFIA-BIEMS`), the same way you added `index.html` before:
   - Go to your repo → **Add file → Upload files**.
   - Drag in `server.js`, `package.json`, `.gitignore`, and the whole `public` folder (with `index.html` inside it) exactly as they are in this download — keep `public/index.html` nested inside a folder called `public`, don't put it at the top level.
   - Commit.
   - You can leave your existing top-level `index.html` in the repo too (it won't be used once the server is live, but it doesn't hurt anything).

2. **Create a free account at [render.com](https://render.com)** (you can sign up with your GitHub account — one click, no separate password to create).

3. **New → Web Service** → connect your `OMORFIA-BIEMS` repo. Render will detect `package.json` automatically.
   - **Start command:** `node server.js` (already set via `npm start`, Render should pick it up automatically)
   - **Environment variable:** add `APP_PASSWORD` = a password of your choosing (this is the one password everyone — you and your colleague — will type in once to open the app; a simple browser prompt, not a full login system)
   - **Instance type:** the free tier is fine to start.

4. Click **Deploy**. After a minute or two you'll get a live URL like `https://omorfia-biems.onrender.com`. Share that link (and the password) with your colleague — you both now open the *same* link, and anything either of you adds or edits shows up for the other automatically (checked every ~8 seconds, and instantly when you switch back to the tab).

## What you'll see in the app

- A small badge in the bottom-right corner shows connection status: "● Shared with everyone" (green) when synced, "Saving…" while a change is being sent, or a red warning if it can't reach the server (in which case your edit is still saved safely in your own browser and will sync automatically on the next successful save).
- If your colleague adds or changes something while you have the page open, a blue banner appears at the top: "Someone else added or changed data — Reload to see it." Click Reload whenever it's convenient; nothing is lost if you keep working first.

## Important limitations, honestly

- **This is a simple shared save, not a full multi-user system.** There's one shared password for everyone, not individual logins — so the app can't tell you and your colleague apart, or show who changed what. If two of you edit the *same* location at the exact same moment, the second save wins (the first is not merged in) — for everyday use (different people usually adding different leads) this is not an issue in practice.
- **Free-tier hosting caveat:** Render's free tier spins the server down after periods of no traffic (it wakes back up in a few seconds when someone opens the link) and does **not guarantee `data/db.json` survives every restart/redeploy**. Treat this as a working trial for real collaboration, not the permanent home for your only copy of the data — periodically download `data/db.json` from Render's dashboard as a backup, or ask Claude to fetch a copy, the same way you'd back up any other business file.
- The real production version of this (proper database, individual logins, audit trail, admin panel) is exactly what's already scoped in the earlier IT Scoping Brief for BIEMS — this is the smallest possible real fix for "my colleague's edits aren't showing up for me," not a replacement for that plan.

## Making future edits

Keep using the same workflow as before: describe what needs to change,
I'll fix and test `public/index.html` (and `server.js` if needed), then
send you the updated file(s) to re-upload the same way you did the first
time. Render redeploys automatically within a minute or two of a new
commit to your repo.
