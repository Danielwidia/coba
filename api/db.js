import fs from 'fs';
import path from 'path';

// In serverless (Vercel), runtime filesystem is read-only except /tmp.
const DATA_FILE = process.env.DATA_FILE || path.join('/tmp', 'database.json');

function ensureDataDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const text = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    console.error('readDB error:', err);
    return null;
  }
}

function writeDB(data) {
  try {
    ensureDataDir(DATA_FILE);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('writeDB error:', err);
    return false;
  }
}

function getDefaultDB() {
  return {
    subjects: ["Pendidikan Agama", "Bahasa Indonesia", "Matematika", "IPA", "IPS", "Bahasa Inggris", "Seni Budaya", "Informatika", "PJOK", "Bahasa Jawa", "Mandarin"],
    rombels: ["VII", "VIII", "IX"],
    questions: [],
    students: [{ id: "ADM", password: "admin321", name: "Administrator", role: "admin" }],
    results: []
  };
}

export default function handler(req, res) {
  if (req.method === 'GET') {
    const db = readDB();
    if (db) {
      return res.status(200).json(db);
    }
    const defaultDb = getDefaultDB();
    writeDB(defaultDb);
    return res.status(200).json(defaultDb);
  }

  if (req.method === 'POST') {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid payload format' });
    }
    const success = writeDB(payload);
    if (success) {
      return res.status(200).json({ ok: true });
    }
    return res.status(500).json({ error: 'Failed to save data' });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).send('Method Not Allowed');
}
