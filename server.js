const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
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

// --- API ---
app.get('/system-stats', (req, res) => {
    const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
    const freeMem = (os.freemem() / 1024 / 1024).toFixed(0);
    const usedMem = totalMem - freeMem;
    res.json({
        status: runningProcess ? 'ONLINE' : 'OFFLINE',
        cpu: (os.loadavg()[0] * 10).toFixed(1),
        ramUsed: usedMem,
        ramTotal: totalMem
    });
});

app.post('/run', (req, res) => {
    if (runningProcess) return res.redirect('/console');
    const botPath = path.join(__dirname, 'bots', config.mainFile);
    if (fs.existsSync(botPath)) {
        consoleLogs = [`[SYSTEM] Starting ${config.mainFile}...`];
        runningProcess = spawn('node', [botPath]);
        runningProcess.stdout.on('data', (d) => consoleLogs.push(`${d}`));
        runningProcess.stderr.on('data', (d) => consoleLogs.push(`[ERROR] ${d}`));
        runningProcess.on('close', () => { runningProcess = null; });
    }
    res.redirect('/console');
});

app.post('/stop', (req, res) => {
    if (runningProcess) { runningProcess.kill(); runningProcess = null; consoleLogs.push(`[SYSTEM] Stopped.`); }
    res.redirect('/console');
});

app.post('/save-startup', (req, res) => {
    config.mainFile = req.body.mainFile;
    config.modules = req.body.modules;
    fs.writeFileSync('config.json', JSON.stringify(config));
    
    // บังคับติดตั้งโมดูลทันที (Fix บัคที่นายเจอ)
    if (config.modules) {
        try {
            consoleLogs.push(`[NPM] Installing: ${config.modules}...`);
            const mods = config.modules.replace(/,/g, ' ');
            execSync(`npm install ${mods}`);
            consoleLogs.push(`[NPM] Success!`);
        } catch (e) { consoleLogs.push(`[NPM ERROR] ${e.message}`); }
    }
    res.redirect('/startup');
});

// --- UI LAYOUT ---
const layout = (content, active) => `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KURO HOST MINIMAL</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        body { background: #f8fafc; color: #334155; font-family: 'Inter', sans-serif; }
        .sidebar { transition: 0.3s; transform: translateX(-100%); }
        .sidebar.open { transform: translateX(0); }
        .glass { background: white; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
        .nav-active { color: #8b5cf6; font-weight: 700; border-right: 4px solid #8b5cf6; }
    </style>
</head>
<body class="flex flex-col h-screen overflow-hidden">
    <header class="p-4 bg-white border-b flex justify-between items-center px-6">
        <button onclick="document.getElementById('side').classList.toggle('open')" class="text-xl text-slate-500"><i class="fas fa-bars"></i></button>
        <h1 class="font-bold text-slate-700 tracking-tight">KURO <span class="text-purple-500">HOST</span></h1>
        <div id="status" class="w-3 h-3 rounded-full bg-slate-300"></div>
    </header>

    <div id="side" class="sidebar fixed inset-y-0 left-0 w-64 bg-white z-50 border-r p-6 space-y-4">
        <div class="flex justify-between items-center mb-8">
            <span class="font-bold text-slate-400 text-sm">MENU</span>
            <button onclick="document.getElementById('side').classList.toggle('open')"><i class="fas fa-times"></i></button>
        </div>
        <a href="/console" class="block p-3 rounded-lg hover:bg-slate-50 ${active==='console'?'nav-active':''}">Dashboard</a>
        <a href="/files" class="block p-3 rounded-lg hover:bg-slate-50 ${active==='files'?'nav-active':''}">File Manager</a>
        <a href="/startup" class="block p-3 rounded-lg hover:bg-slate-50 ${active==='startup'?'nav-active':''}">Startup</a>
    </div>

    <main class="flex-1 overflow-y-auto p-4 md:p-8">${content}</main>

    <script>
        setInterval(() => {
            fetch('/system-stats').then(r => r.json()).then(d => {
                document.getElementById('status').className = d.status === 'ONLINE' ? 'w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]' : 'w-3 h-3 rounded-full bg-slate-300';
            });
        }, 2000);
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.redirect('/console'));

app.get('/console', (req, res) => {
    const html = `
    <div class="max-w-4xl mx-auto space-y-6">
        <div class="grid grid-cols-2 gap-4">
            <form action="/run" method="POST"><button class="w-full bg-purple-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-purple-200">START</button></form>
            <form action="/stop" method="POST"><button class="w-full bg-white border text-slate-600 py-3 rounded-xl font-bold">STOP</button></form>
        </div>
        <div class="glass rounded-2xl p-4 h-[60vh] flex flex-col">
            <div id="logs" class="flex-1 overflow-y-auto text-xs font-mono leading-relaxed text-slate-500"></div>
        </div>
    </div>
    <script>
        setInterval(() => {
            fetch('/get-logs').then(r => r.text()).then(t => {
                const l = document.getElementById('logs');
                l.innerText = t;
                l.scrollTop = l.scrollHeight;
            });
        }, 1500);
    </script>`;
    res.send(layout(html, 'console'));
});

app.get('/files', (req, res) => {
    const files = fs.readdirSync('./bots');
    const html = `
    <div class="max-w-4xl mx-auto glass rounded-2xl overflow-hidden">
        <div class="p-4 border-b bg-slate-50 flex justify-between items-center">
            <span class="font-bold text-sm">Files</span>
            <form action="/upload" method="POST" enctype="multipart/form-data" class="flex gap-2">
                <input type="file" name="botFile" class="text-xs">
                <button class="bg-purple-500 text-white px-3 py-1 rounded text-xs">Upload</button>
            </form>
        </div>
        <div class="divide-y">
            ${files.map(f => `
                <div class="p-4 flex justify-between items-center hover:bg-slate-50">
                    <span class="text-sm text-slate-600">${f}</span>
                    <div class="flex gap-4">
                        <a href="/edit-page/${f}" class="text-blue-500"><i class="fas fa-pencil-alt"></i></a>
                        <a href="/delete/${f}" class="text-red-400"><i class="fas fa-trash"></i></a>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>`;
    res.send(layout(html, 'files'));
});

app.get('/edit-page/:name', (req, res) => {
    const code = fs.readFileSync(path.join(__dirname, 'bots', req.params.name), 'utf8');
    const html = `
    <div class="max-w-5xl mx-auto glass rounded-2xl overflow-hidden h-[80vh] flex flex-col">
        <div class="p-4 border-b flex justify-between items-center">
            <span class="font-bold text-sm">Editing: ${req.params.name}</span>
            <button onclick="saveFile()" class="bg-green-500 text-white px-6 py-1 rounded-full text-xs font-bold">SAVE</button>
        </div>
        <textarea id="editor" class="flex-1 p-6 text-sm font-mono outline-none resize-none bg-slate-900 text-slate-300">${code}</textarea>
    </div>
    <script>
        function saveFile() {
            const content = document.getElementById('editor').value;
            fetch('/save-file', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name: '${req.params.name}', content: content })
            }).then(() => window.location.href = '/files');
        }
    </script>`;
    res.send(layout(html, 'files'));
});

app.post('/save-file', (req, res) => {
    fs.writeFileSync(path.join(__dirname, 'bots', req.body.name), req.body.content);
    res.json({ success: true });
});

app.get('/startup', (req, res) => {
    const html = `
    <div class="max-w-xl mx-auto glass rounded-2xl p-8 space-y-6">
        <h2 class="font-bold">Startup Config</h2>
        <form action="/save-startup" method="POST" class="space-y-4">
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-slate-400">MAIN FILE</label>
                <input type="text" name="mainFile" value="${config.mainFile}" class="w-full border p-3 rounded-xl text-sm outline-none focus:border-purple-500">
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-slate-400">MODULES (EX: discord.js,axios)</label>
                <input type="text" name="modules" value="${config.modules}" class="w-full border p-3 rounded-xl text-sm outline-none focus:border-purple-500">
            </div>
            <button class="w-full bg-purple-600 text-white py-3 rounded-xl font-bold text-sm">SAVE & INSTALL</button>
        </form>
    </div>`;
    res.send(layout(html, 'startup'));
});

app.post('/upload', upload.single('botFile'), (req, res) => res.redirect('/files'));
app.get('/delete/:name', (req, res) => {
    fs.unlinkSync(path.join(__dirname, 'bots', req.params.name));
    res.redirect('/files');
});

app.get('/get-logs', (req, res) => res.send(consoleLogs.join('\n')));

app.listen(port, () => console.log('MINIMAL HOST READY'));ปกปก 
