#!/usr/bin/env node
'use strict';
/*
 * Omorfia BIEMS -- shared-server build
 * -------------------------------------
 * Zero external dependencies on purpose (Node built-ins only: http, fs,
 * path, crypto). Deployable on any host that can run `node server.js`,
 * with no npm install step.
 *
 * What this stores: NOT the location records themselves -- those still
 * live baked into public/index.html as SEED_DATA, exactly as in the plain
 * GitHub Pages build, and are never written to by this server. What this
 * stores is the single "overlay" object the app already used to keep in
 * each browser's own localStorage: every location a user adds, every edit
 * to an existing one, every Competitor/Document/Lease/etc. row, all the
 * data-entry someone does through the app's own forms. Mirroring that one
 * object to a shared file instead of each browser's local storage is what
 * makes one person's entry show up for everyone else.
 *
 * Storage: a single JSON file (data/db.json: {version, overlay}). Kept in
 * memory and written back to disk (debounced) after every change --
 * intentionally simple for a first real deployment. Swapping this for a
 * real database later means replacing the functions in the STORAGE
 * section below; nothing in the frontend needs to change, since it only
 * ever talks to GET/PUT /api/overlay.
 *
 * Auth: one shared password for the whole app (HTTP Basic Auth), set via
 * the APP_PASSWORD environment variable. Deliberately basic -- real
 * per-user accounts are a later production-hosting decision, not
 * something to improvise here.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8787;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---- STORAGE ---------------------------------------------------------
let db = { version: 0, overlay: {} };

function loadDb(){
  if(fs.existsSync(DB_FILE)){
    try{
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      if(typeof db.version !== 'number') db.version = 0;
      if(!db.overlay || typeof db.overlay !== 'object') db.overlay = {};
      console.log(`[biems] loaded shared overlay from ${DB_FILE} (version ${db.version})`);
      return;
    }catch(e){
      console.error('[biems] could not read data/db.json, starting from an empty shared overlay:', e.message);
    }
  }
  console.log('[biems] no existing data/db.json -- starting with an empty shared overlay (the app\'s own SEED_DATA still provides the base 194 locations; this file only ever holds additions/edits on top of that).');
}

let saveTimer = null;
function saveDb(){
  // Debounced, atomic write (temp file + rename) so a burst of edits
  // doesn't hammer the disk and a crash mid-write can't corrupt db.json.
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 150);
}

function setOverlay(newOverlay){
  db.overlay = newOverlay;
  db.version += 1;
  saveDb();
  return db.version;
}

// ---- AUTH --------------------------------------------------------------
function checkAuth(req){
  if(!APP_PASSWORD) return true; // no password configured -- open (fine for a private trial link)
  const header = req.headers['authorization'] || '';
  if(!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
  const idx = decoded.indexOf(':');
  const pass = idx >= 0 ? decoded.slice(idx + 1) : decoded;
  const a = Buffer.from(pass);
  const b = Buffer.from(APP_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function requireAuth(res){
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Omorfia BIEMS"', 'Content-Type': 'text/plain' });
  res.end('Authentication required.');
}

// ---- STATIC FILE SERVING ------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
function serveStatic(req, res, pathname){
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
  const full = path.join(PUBLIC_DIR, filePath);
  if(!full.startsWith(PUBLIC_DIR)){ res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(full, (err, data) => {
    if(err){ res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found'); return; }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---- API -----------------------------------------------------------------
function readJsonBody(req){
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    const MAX = 16 * 1024 * 1024; // 16 MB -- the whole overlay travels in one PUT (documents/photos can be embedded)
    req.on('data', c => {
      size += c.length;
      if(size > MAX){ reject(new Error('request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try{ resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {}); }
      catch(e){ reject(e); }
    });
    req.on('error', reject);
  });
}
function sendJson(res, status, obj){
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;

  if(!checkAuth(req)){ requireAuth(res); return; }

  if(pathname === '/api/overlay' && req.method === 'GET'){
    sendJson(res, 200, { version: db.version, overlay: db.overlay });
    return;
  }
  if(pathname === '/api/overlay' && req.method === 'PUT'){
    try{
      const body = await readJsonBody(req);
      if(!body || typeof body.overlay !== 'object'){ sendJson(res, 400, {error: 'body must be {overlay: {...}}'}); return; }
      const version = setOverlay(body.overlay);
      sendJson(res, 200, { ok: true, version });
    }catch(e){
      sendJson(res, 400, { error: e.message });
    }
    return;
  }
  if(pathname === '/api/health' && req.method === 'GET'){
    sendJson(res, 200, { ok: true, version: db.version });
    return;
  }

  if(req.method === 'GET') { serveStatic(req, res, pathname); return; }
  res.writeHead(404); res.end('Not found');
});

loadDb();
server.listen(PORT, () => {
  console.log(`[biems] Omorfia BIEMS shared server listening on port ${PORT}`);
  console.log(APP_PASSWORD ? '[biems] Basic Auth is ON (APP_PASSWORD set)' : '[biems] WARNING: no APP_PASSWORD set -- the app is open to anyone with the URL');
});
