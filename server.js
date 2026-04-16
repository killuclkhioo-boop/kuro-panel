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

// --- API ---
app.get('/system-stats', (req, res) => {
    const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
    const usedMem = ((os.totalmem() - os.freemem()) / 1024 / 1024).toFixed(0);
    const cpuLoad = (os.loadavg()[0] * 10).toFixed(1);
    res.json({
        status: runningProcess ? 'ONLINE' : 'OFFLINE',
        cpu: runningProcess ? (cpuLoad > 100 ? 100 : cpuLoad) : 0,
        ramUsed: runningProcess ? usedMem : 0,
        ramTotal: totalMem
    });
});

app.get('/read-file/:name', (req, res) => {
    const p = path.join(__dirname, 'bots', req.params.name);
    if (fs.existsSync(p)) res.send(fs.readFileSync(p, 'utf8'));
    else res.status(404).send('Not Found');
});

app.post('/save-file', (req, res) => {
    const p = path.join(__dirname, 'bots', req.body.name);
    fs.writeFileSync(p, req.body.content);
    setTimeout(() => res.json({ success: true }), 1000);
});

app.post('/create-file', (req, res) => {
    const p = path.join(__dirname, 'bots', req.body.name);
    if (!fs.existsSync(p)) fs.writeFileSync(p, '// New File Created');
    res.redirect('/files');
});

app.post('/run', (req, res) => {
    if (runningProcess) return res.redirect('/console');
    const botPath = path.join(__dirname, 'bots', config.mainFile);
    if (fs.existsSync(botPath)) {
        consoleLogs = [`[SYSTEM] Booting system...`];
        runningProcess = spawn('node', [botPath]);
        runningProcess.stdout.on('data', (d) => consoleLogs.push(`<span class="text-purple-400">${d}</span>`));
        runningProcess.stderr.on('data', (d) => consoleLogs.push(`<span class="text-yellow-400">[ERR] ${d}</span>`));
        runningProcess.on('close', () => { runningProcess = null; });
    }
    res.redirect('/console');
});

app.post('/stop', (req, res) => {
    if (runningProcess) { runningProcess.kill(); runningProcess = null; consoleLogs.push(`<span class="text-red-400">[SYSTEM] Shutdown successful.</span>`); }
    res.redirect('/console');
});

// --- ROUTES ---
app.get('/', (req, res) => res.redirect('/console'));

app.get('/get-logs', (req, res) => res.send(consoleLogs.join('<br>')));

// --- UI LAYOUT ---
const layout = (content, active) => `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KURO ULTRA AMETHYST</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600&display=swap');
        body { background: radial-gradient(circle at top right, #1a1025, #0a0a0c); color: #d8b4fe; font-family: 'Fira Code', monospace; overflow: hidden; }
        .glass { background: rgba(20, 15, 30, 0.7); backdrop-filter: blur(15px); border: 1px solid rgba(168, 85, 247, 0.2); }
        #sidebar { transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); left: -280px; width: 280px; }
        #sidebar.open { left: 0; box-shadow: 20px 0 50px rgba(0,0,0,0.5); }
        .nav-item { transition: 0.3s; border-radius: 12px; }
        .nav-item:hover { background: rgba(168, 85, 247, 0.15); color: #f3e8ff; }
        .nav-active { background: linear-gradient(45deg, #7e22ce, #a855f7) !important; color: white !important; box-shadow: 0 4px 15px rgba(168, 85, 247, 0.4); }
        #loader { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:100; align-items:center; justify-content:center; flex-direction:column; gap:15px; }
        .purple-glow { box-shadow: 0 0 20px rgba(168, 85, 247, 0.3); }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #581c87; border-radius: 10px; }
    </style>
</head>
<body class="flex h-screen w-screen overflow-hidden">
    <div id="loader">
        <div class="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-xs font-bold tracking-tighter text-purple-300">PROCESSING DATA...</p>
    </div>

    <div id="sidebar" class="fixed top-0 bottom-0 z-[60] glass flex flex-col p-6">
        <div class="flex justify-between items-center mb-10">
            <h1 class="text-xl font-black text-purple-400 italic">KURO<span class="text-white">ULTRA</span></h1>
            <button onclick="toggleMenu()" class="text-purple-300 hover:text-white"><i class="fas fa-times"></i></button>
        </div>
        <nav class="space-y-3">
            <a href="/console" class="nav-item flex items-center p-4 text-sm ${active==='console'?'nav-active':''}"><i class="fas fa-terminal mr-4 w-5"></i> CONSOLE</a>
            <a href="/files" class="nav-item flex items-center p-4 text-sm ${active==='files'?'nav-active':''}"><i class="fas fa-file-code mr-4 w-5"></i> FILE MANAGER</a>
            <a href="/startup" class="nav-item flex items-center p-4 text-sm ${active==='startup'?'nav-active':''}"><i class="fas fa-bolt mr-4 w-5"></i> STARTUP SETTINGS</a>
        </nav>
        <div class="mt-auto p-4 glass rounded-2xl text-[10px] text-purple-400">
            <p>KURO SYSTEM v4.5</p>
            <p>STATUS: <span id="side-status" class="text-white">CHECKING...</span></p>
        </div>
    </div>

    <div class="flex-1 flex flex-col">
        <header class="p-4 flex items-center justify-between px-8 border-b border-purple-900/30">
            <div class="flex items-center gap-6">
                <button onclick="toggleMenu()" class="text-2xl text-purple-400 hover:scale-110 transition"><i class="fas fa-bars"></i></button>
                <div class="hidden md:flex flex-col">
                    <span id="header-status" class="text-[10px] font-bold text-red-500">OFFLINE</span>
                    <span class="text-[8px] text-purple-500 uppercase tracking-widest">System Monitor</span>
                </div>
            </div>
            <div class="flex gap-8">
                <div class="text-center"><p class="text-[9px] text-purple-500">CPU</p><p id="v-cpu" class="text-xs font-bold text-purple-200">0%</p></div>
                <div class="text-center"><p class="text-[9px] text-purple-500">RAM</p><p id="v-ram" class="text-xs font-bold text-purple-200">0MB</p></div>
            </div>
        </header>

        <main class="flex-1 overflow-hidden p-4 md:p-8">${content}</main>
    </div>

    <script>
        let sidebar = document.getElementById('sidebar');
        function toggleMenu() { sidebar.classList.toggle('open'); }

        function updateStats() {
            fetch('/system-stats').then(r => r.json()).then(data => {
                document.getElementById('header-status').innerText = data.status;
                document.getElementById('header-status').className = data.status === 'ONLINE' ? 'text-[10px] font-bold text-green-400' : 'text-[10px] font-bold text-red-500';
                document.getElementById('side-status').innerText = data.status;
                document.getElementById('v-cpu').innerText = data.cpu + '%';
                document.getElementById('v-ram').innerText = data.ramUsed + 'MB';

                if(window.myChart) {
                    window.myChart.data.datasets[0].data.push(data.cpu);
                    window.myChart.data.datasets[0].data.shift();
                    window.myChart.update('none');
                }

                const b1 = document.getElementById('bRun'), b2 = document.getElementById('bStop');
                if(b1 && b2) {
                    if(data.status === 'ONLINE') { b1.disabled = true; b1.style.opacity = 0.3; b2.disabled = false; b2.style.opacity = 1; }
                    else { b1.disabled = false; b1.style.opacity = 1; b2.disabled = true; b2.style.opacity = 0.3; }
                }
            });
        }
        setInterval(updateStats, 2000);
    </script>
</body>
</html>
`;

// --- PAGES ---
app.get('/console', (req, res) => {
    const html = `
    <div class="h-full flex flex-col gap-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="md:col-span-2 glass rounded-3xl p-6 h-40 relative overflow-hidden">
                <canvas id="statChart" class="w-full h-full"></canvas>
            </div>
            <div class="flex flex-col gap-3">
                <form action="/run" method="POST" class="flex-1"><button id="bRun" class="w-full h-full bg-purple-600 hover:bg-purple-500 rounded-2xl font-bold text-xs tracking-widest shadow-lg shadow-purple-900/30 transition active:scale-95">START SYSTEM</button></form>
                <form action="/stop" method="POST" class="flex-1"><button id="bStop" class="w-full h-full glass border-red-900/30 text-red-400 hover:bg-red-900/20 rounded-2xl font-bold text-xs">STOP</button></form>
            </div>
        </div>
        <div class="flex-1 glass rounded-[40px] p-8 relative flex flex-col bg-black/40">
            <div id="logs" class="flex-1 custom-scroll overflow-y-auto text-[11px] font-medium leading-relaxed"></div>
        </div>
    </div>
    <script>
        const ctx = document.getElementById('statChart').getContext('2d');
        window.myChart = new Chart(ctx, {
            type: 'line',
            data: { labels: Array(20).fill(''), datasets: [{ data: Array(20).fill(0), borderColor: '#a855f7', tension: 0.4, fill: true, backgroundColor: 'rgba(168,85,247,0.1)', borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { display: false, max: 100 }, x: { display: false } }, plugins: { legend: { display: false } }, elements: { point: { radius: 0 } } }
        });
        setInterval(() => {
            fetch('/get-logs').then(r => r.text()).then(t => {
                const l = document.getElementById('logs');
                l.innerHTML = t;
                l.scrollTop = l.scrollHeight;
            });
        }, 1500);
    </script>`;
    res.send(layout(html, 'console'));
});

app.get('/files', (req, res) => {
    const files = fs.readdirSync('./bots');
    const html = `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 h-full">
        <div class="glass rounded-3xl p-6 flex flex-col gap-4">
            <p class="text-[10px] font-bold text-purple-500">FILES & ACTIONS</p>
            <form action="/create-file" method="POST" class="space-y-2">
                <input type="text" name="name" placeholder="newfile.js" class="w-full bg-black/40 p-3 rounded-xl border border-purple-900/30 text-xs">
                <button class="w-full bg-purple-900/40 py-2 rounded-xl text-[10px] font-bold hover:bg-purple-900/60">+ CREATE FILE</button>
            </form>
            <form action="/upload" method="POST" enctype="multipart/form-data" class="border-t border-purple-900/30 pt-4">
                <input type="file" name="botFile" class="text-[9px] mb-2">
                <button class="w-full bg-white text-black py-2 rounded-xl text-[10px] font-bold">UPLOAD FILE</button>
            </form>
            <div class="flex-1 custom-scroll overflow-y-auto space-y-2 mt-4">
                ${files.map(f => `<div class="flex justify-between items-center p-3 hover:bg-purple-900/20 rounded-xl group transition cursor-pointer" onclick="edit('${f}')"><span class="text-[11px]"><i class="far fa-file-code mr-2 text-purple-500"></i>${f}</span><a href="/delete/${f}" class="text-purple-900 group-hover:text-red-500"><i class="fas fa-trash-alt text-[10px]"></i></a></div>`).join('')}
            </div>
        </div>
        <div class="md:col-span-3 glass rounded-[40px] flex flex-col overflow-hidden">
            <div class="p-6 border-b border-purple-900/30 flex justify-between items-center bg-black/20">
                <span id="fName" class="text-xs font-bold text-purple-400">SELECT FILE TO EDIT</span>
                <button id="sv" onclick="save()" class="hidden bg-purple-600 text-white px-8 py-2 rounded-full text-[10px] font-bold shadow-lg shadow-purple-900/40">SAVE FILE</button>
            </div>
            <textarea id="ed" class="flex-1 bg-transparent p-8 text-sm outline-none font-medium text-purple-200 leading-relaxed resize-none custom-scroll" spellcheck="false"></textarea>
        </div>
    </div>
    <script>
        let current = '';
        function edit(n) {
            current = n;
            document.getElementById('fName').innerText = 'EDITING: ' + n;
            document.getElementById('sv').classList.remove('hidden');
            fetch('/read-file/' + n).then(r => r.text()).then(d => document.getElementById('ed').value = d);
        }
        function save() {
            document.getElementById('loader').style.display = 'flex';
            fetch('/save-file', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name: current, content: document.getElementById('ed').value })
            }).then(() => {
                document.getElementById('loader').style.display = 'none';
                alert('SAVE SUCCESS!');
            });
        }
    </script>`;
    res.send(layout(html, 'files'));
});

app.get('/startup', (req, res) => {
    const html = `
    <div class="max-w-2xl mx-auto glass rounded-[50px] p-12 mt-10 purple-glow">
        <h2 class="text-xl font-bold mb-10 flex items-center gap-4"><i class="fas fa-cog text-purple-500"></i> SYSTEM CONFIG</h2>
        <form action="/save-startup" method="POST" class="space-y-8">
            <div class="space-y-2">
                <label class="text-[10px] font-bold text-purple-500 ml-2 uppercase tracking-widest">Main Application File</label>
                <input type="text" name="mainFile" value="${config.mainFile}" class="w-full bg-black/50 border border-purple-900/30 p-4 rounded-2xl outline-none focus:border-purple-500 transition shadow-inner">
            </div>
            <div class="space-y-2">
                <label class="text-[10px] font-bold text-purple-500 ml-2 uppercase tracking-widest">Global Libraries</label>
                <textarea name="modules" rows="4" class="w-full bg-black/50 border border-purple-900/30 p-4 rounded-2xl outline-none focus:border-purple-500 text-xs">${config.modules}</textarea>
            </div>
            <button class="w-full bg-purple-600 py-5 rounded-3xl font-bold shadow-xl shadow-purple-900/30 transition-transform active:scale-95">APPLY CHANGES</button>
        </form>
    </div>`;
    res.send(layout(html, 'startup'));
});

// อัปโหลด/ลบ/บันทึกตั้งค่า
app.post('/upload', upload.single('botFile'), (req, res) => res.redirect('/files'));
app.get('/delete/:name', (req, res) => {
    const p = path.join(__dirname, 'bots', req.params.name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    res.redirect('/files');
});
app.post('/save-startup', (req, res) => {
    config.mainFile = req.body.mainFile; config.modules = req.body.modules;
    fs.writeFileSync('config.json', JSON.stringify(config));
    res.redirect('/startup');
});

app.listen(port, () => console.log('ULTRA AMETHYST ONLINE'));
