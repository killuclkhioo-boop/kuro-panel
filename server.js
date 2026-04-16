const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

if (!fs.existsSync('./bots')) fs.mkdirSync('./bots');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let runningProcess = null;
let consoleLogs = [];
let config = { mainFile: '', modules: '' };

if (fs.existsSync('config.json')) {
    config = JSON.parse(fs.readFileSync('config.json'));
}

const storage = multer.diskStorage({
    destination: './bots',
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// --- API สำหรับดึงค่า System Stats ---
app.get('/system-stats', (req, res) => {
    const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
    const freeMem = (os.freemem() / 1024 / 1024).toFixed(0);
    const usedMem = totalMem - freeMem;
    
    // คำนวณ CPU แบบง่าย (Load Average)
    const cpuLoad = (os.loadavg()[0] * 10).toFixed(1); 

    res.json({
        status: runningProcess ? 'RUNNING' : 'OFFLINE',
        cpu: cpuLoad > 100 ? 100 : cpuLoad,
        ramUsed: usedMem,
        ramTotal: totalMem
    });
});

// --- API & LOGIC ---
app.get('/', (req, res, next) => {
    consoleLogs = [`[SYSTEM] Console Cleared - ${new Date().toLocaleTimeString()}`];
    next();
});

app.post('/save-startup', (req, res) => {
    config.mainFile = req.body.mainFile;
    config.modules = req.body.modules;
    fs.writeFileSync('config.json', JSON.stringify(config));
    if (config.modules) {
        const mods = config.modules.split(',').map(m => m.trim()).join(' ');
        consoleLogs.push(`[INSTALLER] Installing: ${mods}`);
        exec(`npm install ${mods}`, (err) => {
            if (err) consoleLogs.push(`[ERR] ${err.message}`);
            else consoleLogs.push(`[SUCCESS] Installed: ${mods}`);
        });
    }
    res.redirect('/startup');
});

app.post('/run', (req, res) => {
    if (runningProcess) runningProcess.kill();
    const botPath = path.join(__dirname, 'bots', config.mainFile);
    if (fs.existsSync(botPath)) {
        consoleLogs.push(`[START] Executing ${config.mainFile}...`);
        runningProcess = spawn('node', [botPath]);
        runningProcess.stdout.on('data', (d) => consoleLogs.push(`${d}`));
        runningProcess.stderr.on('data', (d) => consoleLogs.push(`[ERR] ${d}`));
        runningProcess.on('close', () => { runningProcess = null; });
    }
    res.redirect('/');
});

app.post('/stop', (req, res) => {
    if (runningProcess) { runningProcess.kill(); runningProcess = null; consoleLogs.push(`[STOP] Process Terminated`); }
    res.redirect('/');
});

app.get('/get-logs', (req, res) => res.send(consoleLogs.join('<br>')));

// --- UI COMPONENTS ---
const layout = (content, active) => `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KURO DASHBOARD PRO</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        body { background: #050505; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; }
        .glass { background: rgba(15, 15, 20, 0.9); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.05); }
        .stat-card { background: #0f0f12; border: 1px solid #1f1f23; }
    </style>
</head>
<body class="flex flex-col md:flex-row">
    <div id="sidebar" class="fixed md:relative z-50 w-64 h-screen glass border-r border-zinc-800 -translate-x-full md:translate-x-0 transition-transform">
        <div class="p-6 text-center">
            <h1 class="text-xl font-bold tracking-tighter text-blue-500">KURO HOSTING PRO</h1>
        </div>
        <nav class="mt-4 px-4 space-y-2">
            <a href="/" class="block p-3 rounded-lg ${active==='home'?'bg-blue-600/20 text-blue-400 border border-blue-500/30':'hover:bg-zinc-800'}"><i class="fas fa-terminal mr-2"></i> Console</a>
            <a href="/files" class="block p-3 rounded-lg ${active==='files'?'bg-blue-600/20 text-blue-400 border border-blue-500/30':'hover:bg-zinc-800'}"><i class="fas fa-folder mr-2"></i> Files</a>
            <a href="/startup" class="block p-3 rounded-lg ${active==='startup'?'bg-blue-600/20 text-blue-400 border border-blue-500/30':'hover:bg-zinc-800'}"><i class="fas fa-cog mr-2"></i> Startup</a>
        </nav>
    </div>

    <div class="flex-1 h-screen overflow-y-auto">
        <header class="p-4 glass sticky top-0 flex items-center justify-between border-b border-zinc-800">
            <button onclick="document.getElementById('sidebar').classList.toggle('-translate-x-full')" class="md:hidden text-xl"><i class="fas fa-bars"></i></button>
            <div class="flex gap-4 items-center">
                <div class="flex flex-col">
                    <span class="text-[10px] text-zinc-500">STATUS</span>
                    <span id="stat-text" class="text-xs font-bold">-</span>
                </div>
                <div class="flex flex-col">
                    <span class="text-[10px] text-zinc-500">CPU</span>
                    <span id="cpu-text" class="text-xs font-bold text-blue-400">0%</span>
                </div>
                <div class="flex flex-col">
                    <span class="text-[10px] text-zinc-500">RAM</span>
                    <span id="ram-text" class="text-xs font-bold text-purple-400">0/0 MB</span>
                </div>
            </div>
        </header>
        <main class="p-4">${content}</main>
    </div>

    <script>
        function updateStats() {
            fetch('/system-stats').then(r => r.json()).then(data => {
                document.getElementById('stat-text').innerText = data.status;
                document.getElementById('stat-text').className = data.status === 'RUNNING' ? 'text-xs font-bold text-green-500' : 'text-xs font-bold text-red-500';
                document.getElementById('cpu-text').innerText = data.cpu + '%';
                document.getElementById('ram-text').innerText = data.ramUsed + '/' + data.ramTotal + ' MB';
            });
        }
        setInterval(updateStats, 2000);
    </script>
</body>
</html>
`;

app.get('/', (req, res) => {
    const html = `
    <div class="space-y-4">
        <div class="flex gap-2">
            <form action="/run" method="POST" class="flex-1"><button class="w-full bg-green-600 hover:bg-green-500 py-3 rounded-lg font-bold text-sm shadow-lg shadow-green-900/20">START BOT</button></form>
            <form action="/stop" method="POST" class="flex-1"><button class="w-full bg-red-600 hover:bg-red-500 py-3 rounded-lg font-bold text-sm">STOP</button></form>
        </div>
        <div class="glass rounded-xl p-4 bg-black/50">
            <div id="logs" class="h-[60vh] overflow-y-auto text-[12px] text-zinc-400 font-mono leading-relaxed"></div>
        </div>
    </div>
    <script>
        setInterval(() => {
            fetch('/get-logs').then(r => r.text()).then(t => {
                const l = document.getElementById('logs');
                l.innerHTML = t;
                l.scrollTop = l.scrollHeight;
            });
        }, 1500);
    </script>
    `;
    res.send(layout(html, 'home'));
});

// --- ROUTES สำหรับหน้าอื่นๆ (เหมือนเดิม) ---
app.get('/files', (req, res) => {
    const files = fs.readdirSync('./bots');
    const html = `<div class="glass rounded-xl p-4"><form action="/upload" method="POST" enctype="multipart/form-data" class="mb-4 flex gap-2"><input type="file" name="botFile" class="text-xs"><button class="bg-white text-black px-4 py-1 rounded font-bold">UPLOAD</button></form><div class="space-y-2">${files.map(f => `<div class="flex justify-between p-3 stat-card rounded-lg"><span>${f}</span><a href="/delete/${f}" class="text-red-500"><i class="fas fa-trash"></i></a></div>`).join('')}</div></div>`;
    res.send(layout(html, 'files'));
});

app.get('/startup', (req, res) => {
    const html = `<div class="glass rounded-xl p-6 max-w-xl mx-auto"><h3 class="font-bold mb-4 text-blue-400">Settings & Auto-Install</h3><form action="/save-startup" method="POST" class="space-y-4"><div><label class="text-[10px] text-zinc-500">MAIN FILE</label><input type="text" name="mainFile" value="${config.mainFile}" placeholder="bot.js" class="w-full bg-zinc-900 p-3 rounded-lg border border-zinc-800 mt-1"></div><div><label class="text-[10px] text-zinc-500">MODULES (comma separated)</label><textarea name="modules" rows="3" class="w-full bg-zinc-900 p-3 rounded-lg border border-zinc-800 mt-1">${config.modules}</textarea></div><button class="w-full bg-blue-600 py-3 rounded-lg font-bold">SAVE & INSTALL</button></form></div>`;
    res.send(layout(html, 'startup'));
});

app.post('/upload', upload.single('botFile'), (req, res) => res.redirect('/files'));
app.get('/delete/:name', (req, res) => {
    const p = path.join(__dirname, 'bots', req.params.name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    res.redirect('/files');
});

app.listen(port, () => console.log('KURO PRO ONLINE'));
