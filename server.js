// Static file server + JSON file-backed data API for linkslog.
// Data lives in ./data/rounds.json and ./data/courses.json (no database, no deps).
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT     = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const ROUNDS_FILE  = path.join(DATA_DIR, 'rounds.json');
const COURSES_FILE = path.join(DATA_DIR, 'courses.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(ROUNDS_FILE))  fs.writeFileSync(ROUNDS_FILE, '[]');
if (!fs.existsSync(COURSES_FILE)) fs.writeFileSync(COURSES_FILE, JSON.stringify({ customCourses: [], courseOverrides: {} }));

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return null; }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handleApi(req, res, file) {
  if (req.method === 'GET') {
    return sendJson(res, 200, readJson(file));
  }
  if (req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        sendJson(res, 200, { ok: true });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
      }
    });
    return;
  }
  sendJson(res, 405, { error: 'Method not allowed' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/rounds')  return handleApi(req, res, ROUNDS_FILE);
  if (url.pathname === '/api/courses') return handleApi(req, res, COURSES_FILE);

  let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

const PORT = process.env.PORT || 3333;
server.listen(PORT, () => console.log(`linkslog server running at http://localhost:${PORT}`));
