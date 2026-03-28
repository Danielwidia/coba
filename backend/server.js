const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
const os = require('os');

// Serve static files
// Development: ../frontend (relative to backend)
// Packaged executable: expect a sibling `frontend` folder next to the exe (dist/frontend)
const devFrontendPath = path.join(__dirname, '../frontend');
let frontendPath;
if (process && process.pkg) {
    // running inside a pkg executable
    frontendPath = path.join(process.cwd(), 'frontend');
} else if (fs.existsSync(devFrontendPath)) {
    frontendPath = devFrontendPath;
} else {
    frontendPath = path.join(__dirname, 'frontend');
}

console.log(`🚀 Server starting...`);
console.log(`   Frontend path: ${frontendPath}`);

// Untuk development mode, gunakan static folder
app.use(express.static(frontendPath));

// Untuk mode exe, serve index.html directly dari embedded files
app.get('/', (req, res) => {
    const indexPath = path.join(frontendPath, 'index.html');
    // Try reading file first
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // Send a basic response untuk kompatibilitas with pkg
        try {
            const content = fs.readFileSync(indexPath, 'utf8');
            res.setHeader('Content-Type', 'text/html');
            res.send(content);
        } catch (err) {
            // Last resort - generate minimal page
            res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>EXAM Browser</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
    <p>Loading...</p>
    <p>Static files path: ${frontendPath}</p>
    <p>Error: ${err.message}</p>
</body>
</html>
            `);
        }
    }
});

// API to persist database to a file (simple server-side storage)
app.use(express.json({ limit: '5mb' }));

// In serverless (Vercel/AWS Lambda) public folder is read-only.
// Use /tmp for writable storage in that environment.
const SERVERLESS_DATA_FILE = process.env.DATA_FILE || (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ? path.join('/tmp', 'database.json') : null);
const DATA_FILE = SERVERLESS_DATA_FILE || path.join(frontendPath, 'database.json');

function ensureDataDir(filePath) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    } catch (err) {
        console.warn('Could not create data directory:', err.message);
    }
}

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        return null;
    }
}

function writeDB(obj) {
    try {
        ensureDataDir(DATA_FILE);
        fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('writeDB error:', err);
        return false;
    }
}

app.get('/api/db', (req, res) => {
    const data = readDB();
    if (data) return res.json(data);
    return res.status(404).json({ error: 'no database' });
});

app.post('/api/db', (req, res) => {
    const payload = req.body;
    try {
        writeDB(payload);
        return res.json({ ok: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// helper untuk menjalankan perintah netsh (Windows hosted network)
function runNetsh(args) {
    return new Promise((resolve, reject) => {
        if (process.platform !== 'win32') {
            return reject(new Error('netsh hanya tersedia di Windows'));
        }
        exec(`netsh wlan ${args}`, { windowsHide: true }, (err, stdout, stderr) => {
            if (err) {
                // include stderr text where available
                const msg = stderr || err.message || err.toString();
                // capture common elevation/permission errors
                // detect common permission/elevation errors; Windows may localize messages
                const perfMsg = /access is denied|requires elevation|akses ditolak|memerlukan elevasi/i.test(msg)
                    ? 'PERMISSION' : msg;
                const e = new Error(msg);
                e.code = perfMsg === 'PERMISSION' ? 'ELEVATION' : undefined;
                return reject(e);
            }
            resolve(stdout);
        });
    });
}

// API hotspot virtual (Windows saja)
// helper to send hotspot errors with appropriate status code
function hotspotError(res, err) {
    console.error('hotspot error:', err);
    // treat permission/elevation problems uniformly
    if (err && (err.code === 'ELEVATION' || /PERMISSION/.test(err.code || '') || /access is denied|akses ditolak/i.test(err.message || ''))) {
        return res.status(403).json({ error: 'Perlu dijalankan sebagai administrator' });
    }
    res.status(500).json({ error: err.toString() });
}

app.post('/api/hotspot/start', async (req, res) => {
    const { ssid = 'VirtualHotspot', key = '12345678' } = req.body || {};
    if (process.platform !== 'win32') {
        return res.status(400).json({ error: 'Fiturnya hanya didukung di Windows' });
    }
    try {
        await runNetsh(`set hostednetwork mode=allow ssid="${ssid}" key="${key}"`);
        await runNetsh('start hostednetwork');
        res.json({ ok: true });
    } catch (err) {
        hotspotError(res, err);
    }
});

app.post('/api/hotspot/stop', async (req, res) => {
    if (process.platform !== 'win32') {
        return res.status(400).json({ error: 'Fiturnya hanya didukung di Windows' });
    }
    try {
        await runNetsh('stop hostednetwork');
        res.json({ ok: true });
    } catch (err) {
        hotspotError(res, err);
    }
});

app.get('/api/hotspot/status', async (req, res) => {
    if (process.platform !== 'win32') {
        return res.json({ status: 'unsupported' });
    }
    try {
        const output = await runNetsh('show hostednetwork');
        const active = /Status\s*:\s*Started/i.test(output);
        res.json({ status: active ? 'started' : 'stopped', info: output });
    } catch (err) {
        hotspotError(res, err);
    }
});

// Auto-start Windows virtual hotspot on server startup
async function autoStartHotspot() {
    if (process.platform !== 'win32') {
        console.log('Hotspot auto-start: Not on Windows, skipping.');
        return;
    }
    try {
        const ssid = process.env.HOTSPOT_SSID || 'ExamBrowser';
        const key = process.env.HOTSPOT_KEY || '12345678';
        console.log('Attempting to auto-start Windows hotspot...');
        await runNetsh(`set hostednetwork mode=allow ssid="${ssid}" key="${key}"`);
        await runNetsh('start hostednetwork');
        console.log(`✓ Hotspot aktif: SSID="${ssid}", Password="${key}"`);
    } catch (err) {
        // Log but don't block server startup if hotspot fails (e.g., not admin)
        console.warn('⚠ Gagal auto-start hotspot:', err.message);
        console.warn('  → Jalankan Node sebagai Administrator untuk mengaktifkan hotspot otomatis.');
    }
}

// Port dan host - bisa diubah melalui environment variables
// default ke 0.0.0.0 agar server mendengar di semua
// antarmuka jaringan; ini membuat halaman login bisa
// diakses lewat alamat IP mana pun yang dimiliki mesin.
// Jika Anda benar‑benar ingin membatasi ke satu alamat,
// tetapkan variabel HOST eksplisit (mis. HOST=192.168.1.100).
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Ensure data file exists (create minimal file if missing)
if (!fs.existsSync(DATA_FILE)) {
    ensureDataDir(DATA_FILE); // create /tmp or frontend path if possible
    const defaultDb = {
        subjects: ["Pendidikan Agama", "Bahasa Indonesia", "Matematika", "IPA", "IPS", "Bahasa Inggris", "Seni Budaya", "Informatika", "PJOK", "Bahasa Jawa", "Mandarin"],
        rombels: ["VII", "VIII", "IX"],
        questions: [],
        students: [{ id: "ADM", password: "admin321", name: "Administrator", role: "admin" }],
        results: []
    };
    writeDB(defaultDb);
}

// Listen di HOST. Jika port sudah dipakai, keluar dengan pesan agar pengguna menjalankannya sendiri atau memilih PORT lain
function getLocalIPv4Addresses() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    const results = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // skip over non-IPv4 and internal (i.e. 127.0.0.1)
            if (net.family === 'IPv4' && !net.internal) {
                results.push(net.address);
            }
        }
    }
    return results;
}

// Extra diagnostic: print all network interfaces with details
function logNetworkInterfaces() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    console.log('Network interfaces (detailed):');
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            console.log(`  ${name} - ${net.address} (${net.family}) ${net.internal ? 'internal' : 'external'} ${net.mac ? 'mac:'+net.mac : ''}`);
        }
    }
}

function startServer(port, host) {
    const server = app.listen(port, host, async () => {
        console.log(`Server berjalan di:`);
        console.log(`  - Local:   http://localhost:${port}`);
        console.log(`  - Host:    ${host}:${port}`);
        const ips = getLocalIPv4Addresses();
        if (ips.length) {
            console.log('  - Alamat lain yang dapat dicoba:');
            ips.forEach(ip => console.log(`      http://${ip}:${port}`));
        }
        // show full interfaces to help troubleshooting hotspot IPs
        logNetworkInterfaces();
        console.log(`\nUntuk akses dari perangkat lain, gunakan salah satu alamat di atas.`);
        console.log(`\nAPLIKASI INI DIBUAT OLEH DANIEL WIDIATMOKO (2026)`);

        // Auto-start hotspot setelah server siap
        await autoStartHotspot();
    });

    server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
            console.error(`Port ${port} sudah digunakan. Tutup proses lain atau tetapkan PORT yang tersedia, misalnya PORT=3001 npm start`);
        } else {
            console.error('Gagal memulai server:', err);
        }
        process.exit(1);
    });
}

startServer(parseInt(PORT, 10), HOST, 10);
