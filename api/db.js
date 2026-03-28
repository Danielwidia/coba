// api/db.js
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'public', 'database.json');
// Atau sesuaikan ke folder tempat terdeploy

function readDB() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (_) { return null; }
}
function writeDB(obj) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

export default function handler(req, res) {
  if (req.method === 'GET') {
    const data = readDB();
    if (!data) return res.status(404).json({ error: 'no database' });
    return res.status(200).json(data);
  }
  if (req.method === 'POST') {
    try {
      writeDB(req.body);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.setHeader('Allow', ['GET','POST']);
  res.status(405).end('Method Not Allowed');
}