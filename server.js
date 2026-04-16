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
        status: runningProcess ? 'ACTIVE' : 'IDLE',
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
    setTimeout(() => res.json({ success: true }), 1200);
});

app.post('/run', (req, res) => {
    if (runningProcess) return res.redirect('/');
    const botPath = path.join(__dirname, 'bots', config.mainFile);
    if (fs.existsSync(botPath)) {
        consoleLogs = [`[SYSTEM] Starting Engine...`];
        runningProcess = spawn('node', [botPath]);
        runningProcess.stdout.on('data', (d) => consoleLogs.push(`${d}`));
        runningProcess.stderr.on('data', (d) => consoleLogs.push(`[ERR] ${d}`));
        runningProcess.on('close', () => { runningProcess = null; });
    }
    res.redirect('/');
});

app.post('/stop', (req, res) => {
    if (runningProcess) { runningProcess.kill(); runningProcess = null; consoleLogs.push(`[SYSTEM] Engine Stopped.`); }
    res.redirect('/');
});

app.post('/save-startup', (req, res) => {
    config.mainFile = req.body.mainFile;
    config.modules = req.body.modules;
    fs.writeFileSync('config.json', JSON.stringify(config));
    if (req.body.installNow === 'true' && config.modules) {
        const mods = config.modules.split(',').map(m => m.trim()).join(' ');
        exec(`npm install ${mods}`, (err) => {
            if (!err) consoleLogs.push(`[NPM] Installed: ${mods}`);
        });
    }
    res.redirect('/startup');
});

app.get('/get-logs', (req, res) => res.send(consoleLogs.join('<br>')));

// --- UI LAYOUT ---
const layout = (content, active) => `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KURO CRYSTAL</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        body { 
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); 
            min-height: 100vh; color: #4a5568; font-family: 'Segoe UI', sans-serif;
        }
        .glass { 
            background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(15px); 
            border: 1px solid rgba(255,255,255,0.4); box-shadow: 0 8px 32px rgba(0,0,0,0.05);
        }
        .btn-start { background: linear-gradient(to right, #6dd5ed, #2193b0); color: white; }
        .btn-stop { background: linear-gradient(to right, #ff9a9e, #fecfef); color: #8a4b4b; }
        .btn-disabled { opacity: 0.3; cursor: not-allowed; pointer-events: none; }
        #loading { display:none; position:fixed; inset:0; background:rgba(255,255,255,0.6); z-index:99; align-items:center; justify-content:center; }
        #toast { visibility:hidden; position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#fff; color:#48bb78; padding:12px 24px; border-radius:50px; box-shadow:0 4px 15px rgba(0,0,0,0.1); font-weight:bold; z-index:100; border: 1px solid #c6f6d5; }
        #toast.show { visibility:visible; animation: pop 0.4s ease-out; }
        @keyframes pop { from { bottom: 0; opacity: 0; } to { bottom: 30px; opacity: 1; } }
        .sidebar-item.active { background: white; color: #3182ce; box-shadow: 0 4px 10px rgba(0,0,0,0.03); }
        .log-area::-webkit-scrollbar { width: 4px; }
        .log-area::-webkit-scrollbar-thumb { background: #cbd5e0; border-radius: 10px; }
    </style>
</head>
<body class="flex flex-col md:flex-row">
    <div id="loading" class="flex flex-col gap-3">
        <div class="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-xs font-bold text-blue-600">กำลังบันทึก...</p>
    </div>
    <div id="toast">✨ Save Success!</div>

    <div class="w-full md:w-72 p-6 flex flex-col gap-6">
        <div class="glass rounded-3xl p-6 text-center">
            <h1 class="text-xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent italic">KURO CRYSTAL</h1>
        </div>
        <nav class="glass rounded-3xl p-4 flex md:flex-col gap-2 overflow-x-auto">
            <a href="/" class="sidebar-item flex-1 p-3 rounded-2xl text-center text-sm font-semibold transition ${active==='home'?'active':''}"><i class="fas fa-home md:mr-2"></i><span class="hidden md:inline">Dashboard</span></a>
            <a href="/files" class="sidebar-item flex-1 p-3 rounded-2xl text-center text-sm font-semibold transition ${active==='files'?'active':''}"><i class="fas fa-pen-nib md:mr-2"></i><span class="hidden md:inline">Editor</span></a>
            <a href="/startup" class="sidebar-item flex-1 p-3 rounded-2xl text-center text-sm font-semibold transition ${active==='startup'?'active':''}"><i class="fas fa-cog md:mr-2"></i><span class="hidden md:inline">Setup</span></a>
        </nav>
    </div>

    <div class="flex-1 p-6 flex flex-col gap-6">
        <header class="glass rounded-3xl p-4 px-8 flex justify-between items-center">
            <div class="flex items-center gap-4 text-xs font-bold">
                <span id="dot" class="w-2 h-2 rounded-full bg-red-400"></span>
                <span id="lblStatus" class="text-slate-400 uppercase tracking-tighter">IDLE</span>
            </div>
            <div class="flex gap-6 text-[10px] font-bold">
                <div class="text-center"><p class="text-slate-400">CPU</p><p id="vCpu" class="text-blue-500">0%</p></div>
                <div class="text-center"><p class="text-slate-400">RAM</p><p id="vRam" class="text-indigo-500">0MB</p></div>
            </div>
        </header>
        <main class="flex-1">${content}</main>
    </div>

    <script>
        let myChart;
        function updateStats() {
            fetch('/system-stats').then(r => r.json()).then(data => {
                document.getElementById('lblStatus').innerText = data.status;
                document.getElementById('dot').className = data.status === 'ACTIVE' ? 'w-2 h-2 rounded-full bg-green-400 animate-pulse' : 'w-2 h-2 rounded-full bg-red-400';
                document.getElementById('vCpu').innerText = data.cpu + '%';
                document.getElementById('vRam').innerText = data.ramUsed + ' MB';
                
                if(myChart) {
                    myChart.data.datasets[0].data.push(data.cpu);
                    myChart.data.datasets[0].data.shift();
                    myChart.update('none');
                }

                const s = document.getElementById('bStart'), st = document.getElementById('bStop');
                if(s && st) {
                    if(data.status === 'ACTIVE') { s.classList.add('btn-disabled'); st.classList.remove('btn-disabled'); }
                    else { s.classList.remove('btn-disabled'); st.classList.add('btn-disabled'); }
                }
            });
        }
        setInterval(updateStats, 2000);
        
        function initChart() {
            const ctx = document.getElementById('chart')?.getContext('2d');
            if(!ctx) return;
            myChart = new Chart(ctx, {
                type: 'line',
                data: { labels: Array(20).fill(''), datasets: [{ data: Array(20).fill(0), borderColor: '#60a5fa', tension: 0.4, fill: true, backgroundColor: 'rgba(96,165,250,0.1)', borderWidth: 3 }] },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { display: false, max: 100 }, x: { display: false } }, plugins: { legend: { display: false } }, elements: { point: { radius: 0 } } }
            });
        }
        initChart();
    </script>
</body>
</html>
`;

// --- PAGES ---
app.get('/', (req, res) => {
    const html = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 h-full flex flex-col">
        <div class="space-y-6 flex flex-col">
            <div class="glass rounded-3xl p-6 flex-1 min-h-[150px] relative">
                <span class="text-[10px] font-bold text-slate-400 absolute top-4 left-6 italic">REAL-TIME PERFORMANCE</span>
                <canvas id="chart"></canvas>
            </div>
            <div class="flex gap-4">
                <form action="/run" method="POST" class="flex-1"><button id="bStart" class="btn-start w-full py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 text-xs">START SYSTEM</button></form>
                <form action="/stop" method="POST" class="flex-1"><button id="bStop" class="btn-stop w-full py-4 rounded-2xl font-bold text-xs shadow-lg shadow-pink-100">STOP</button></form>
            </div>
        </div>
        <div class="glass rounded-3xl p-6 flex-1 flex flex-col bg-white/40">
            <span class="text-[10px] font-bold text-slate-400 mb-4 uppercase tracking-widest">Console Output</span>
            <div id="logs" class="flex-1 log-area overflow-y-auto text-xs font-medium text-slate-600 leading-relaxed"></div>
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

app.get('/files', (req, res) => {
    const files = fs.readdirSync('./bots');
    const html = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
        <div class="glass rounded-3xl p-4 overflow-y-auto max-h-[70vh]">
            <p class="text-[10px] font-bold text-slate-400 p-3">MY STORAGE</p>
            ${files.map(f => `<button onclick="edit('${f}')" class="w-full text-left p-4 hover:bg-white rounded-2xl text-xs flex justify-between items-center transition"><span><i class="far fa-file-alt mr-2 text-indigo-400"></i>${f}</span><i class="fas fa-chevron-right text-slate-300"></i></button>`).join('')}
        </div>
        <div class="md:col-span-2 glass rounded-3xl flex flex-col overflow-hidden">
            <div class="p-4 border-b border-white flex justify-between items-center">
                <span id="fName" class="text-xs font-bold text-blue-500 italic">Select a file</span>
                <button id="sv" onclick="save()" class="hidden bg-blue-500 text-white px-6 py-2 rounded-xl text-[10px] font-bold shadow-md">SAVE</button>
            </div>
            <textarea id="ed" class="flex-1 bg-transparent p-6 text-sm outline-none font-medium text-slate-700 leading-relaxed resize-none" spellcheck="false" placeholder="Your code here..."></textarea>
        </div>
    </div>
    <script>
        let cur = '';
        function edit(n) {
            cur = n;
            document.getElementById('fName').innerText = 'Editing: ' + n;
            document.getElementById('sv').classList.remove('hidden');
            fetch('/read-file/' + n).then(r => r.text()).then(d => document.getElementById('ed').value = d);
        }
        function save() {
            document.getElementById('loading').style.display = 'flex';
            fetch('/save-file', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name: cur, content: document.getElementById('ed').value })
            }).then(() => {
                document.getElementById('loading').style.display = 'none';
                const t = document.getElementById('toast');
                t.className = 'show';
                setTimeout(() => t.className = '', 5000);
            });
        }
    </script>`;
    res.send(layout(html, 'files'));
});

app.get('/startup', (req, res) => {
    const html = `
    <div class="max-w-xl mx-auto glass rounded-[40px] p-10 mt-10">
        <h2 class="text-lg font-bold text-slate-700 mb-8 flex items-center"><i class="fas fa-magic mr-3 text-blue-400"></i> Setup Panel</h2>
        <form action="/save-startup" method="POST" class="space-y-6">
            <div>
                <label class="text-[10px] font-bold text-slate-400 ml-2">MAIN FILE</label>
                <input type="text" name="mainFile" value="${config.mainFile}" class="w-full bg-white/50 border-white p-4 rounded-2xl outline-none focus:ring-2 ring-blue-100 text-sm mt-1">
            </div>
            <div>
                <label class="text-[10px] font-bold text-slate-400 ml-2">NPM LIBRARIES (Comma Separated)</label>
                <textarea name="modules" rows="3" class="w-full bg-white/50 border-white p-4 rounded-2xl outline-none text-sm mt-1">${config.modules}</textarea>
                <div class="flex items-center gap-2 mt-3 p-2">
                    <input type="checkbox" name="installNow" value="true" class="w-4 h-4 rounded text-blue-500">
                    <label class="text-[10px] font-bold text-blue-500 uppercase">Install everything on save</label>
                </div>
            </div>
            <button class="w-full btn-start py-4 rounded-2xl font-bold shadow-xl shadow-blue-200 transition-transform active:scale-95">SAVE CONFIGURATION</button>
        </form>
    </div>`;
    res.send(layout(html, 'startup'));
});

app.listen(port, () => console.log('CRYSTAL UI READY'));
