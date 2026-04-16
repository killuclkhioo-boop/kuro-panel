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
let config = { mainFile: '', modules: '', themeColor: '#3b82f6' };

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
        status: runningProcess ? 'RUNNING' : 'OFFLINE',
        cpu: runningProcess ? (cpuLoad > 100 ? 100 : cpuLoad) : 0,
        ramUsed: runningProcess ? usedMem : 0,
        ramTotal: totalMem
    });
});

app.get('/read-file/:name', (req, res) => {
    const p = path.join(__dirname, 'bots', req.params.name);
    if (fs.existsSync(p)) res.send(fs.readFileSync(p, 'utf8'));
    else res.status(404).send('File not found');
});

app.post('/save-file', (req, res) => {
    const p = path.join(__dirname, 'bots', req.body.name);
    fs.writeFileSync(p, req.body.content);
    setTimeout(() => res.json({ success: true }), 1000); // จำลองการโหลด
});

app.post('/run', (req, res) => {
    if (runningProcess) return res.redirect('/');
    const botPath = path.join(__dirname, 'bots', config.mainFile);
    if (fs.existsSync(botPath)) {
        consoleLogs = [`[START] Engine Active...`];
        runningProcess = spawn('node', [botPath]);
        runningProcess.stdout.on('data', (d) => consoleLogs.push(`${d}`));
        runningProcess.stderr.on('data', (d) => consoleLogs.push(`[ERR] ${d}`));
        runningProcess.on('close', () => { runningProcess = null; });
    }
    res.redirect('/');
});

app.post('/stop', (req, res) => {
    if (runningProcess) { runningProcess.kill(); runningProcess = null; consoleLogs.push(`[STOP] System Offline.`); }
    res.redirect('/');
});

app.get('/get-logs', (req, res) => res.send(consoleLogs.join('<br>')));

// --- UI LAYOUT ---
const layout = (content, active) => `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KURO ULTIMATE</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono&display=swap');
        body { background: #050506; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; overflow-x: hidden; }
        .glass { background: rgba(10, 10, 12, 0.9); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.05); }
        .btn-disabled { opacity: 0.2; cursor: not-allowed; pointer-events: none; }
        #loadingOverlay { display: none; background: rgba(0,0,0,0.8); position: fixed; top:0; left:0; width:100%; height:100%; z-index:9999; align-items:center; justify-content:center; }
        #toast { visibility: hidden; min-width: 250px; background-color: #10b981; color: #fff; text-align: center; border-radius: 8px; padding: 16px; position: fixed; z-index: 10000; bottom: 30px; left: 50%; transform: translateX(-50%); font-weight: bold; }
        #toast.show { visibility: visible; animation: fadein 0.5s, fadeout 0.5s 4.5s; }
        @keyframes fadein { from {bottom: 0; opacity: 0;} to {bottom: 30px; opacity: 1;} }
        @keyframes fadeout { from {bottom: 30px; opacity: 1;} to {bottom: 0; opacity: 0;} }
    </style>
</head>
<body class="flex flex-col md:flex-row min-h-screen">
    <div id="loadingOverlay" class="flex flex-col gap-4">
        <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-xs font-bold tracking-widest text-blue-400">SAVING DATA...</p>
    </div>
    <div id="toast">✅ SAVE SUCCESS!</div>

    <div class="w-full md:w-64 glass border-r border-zinc-800 p-6 space-y-8">
        <h1 class="text-xl font-black text-blue-500 tracking-tighter italic">KURO PRO <span class="text-[10px] text-white not-italic">V4</span></h1>
        <nav class="space-y-2">
            <a href="/" class="block p-3 rounded-lg ${active==='home'?'bg-blue-600/10 text-blue-400 border border-blue-500/20':'hover:bg-zinc-900'}"><i class="fas fa-microchip mr-2"></i> Dashboard</a>
            <a href="/files" class="block p-3 rounded-lg ${active==='files'?'bg-blue-600/10 text-blue-400 border border-blue-500/20':'hover:bg-zinc-900'}"><i class="fas fa-file-code mr-2"></i> Editor</a>
        </nav>
    </div>

    <div class="flex-1 flex flex-col h-screen overflow-hidden">
        <header class="p-4 glass border-b border-zinc-800 flex justify-between items-center px-8">
            <div id="statusIndicator" class="flex items-center gap-2">
                <div id="statusDot" class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                <span id="statusLabel" class="text-[10px] font-bold uppercase">OFFLINE</span>
            </div>
            <div class="flex gap-4">
                 <div class="text-right"><p class="text-[8px] text-zinc-500">CPU</p><p id="cpuVal" class="text-xs font-bold text-blue-400">0%</p></div>
                 <div class="text-right"><p class="text-[8px] text-zinc-500">RAM</p><p id="ramVal" class="text-xs font-bold text-purple-400">0MB</p></div>
            </div>
        </header>
        <main class="flex-1 overflow-y-auto p-4 md:p-8">${content}</main>
    </div>

    <script>
        let myChart;
        function initChart() {
            const ctx = document.getElementById('usageChart')?.getContext('2d');
            if(!ctx) return;
            myChart = new Chart(ctx, {
                type: 'line',
                data: { labels: Array(20).fill(''), datasets: [{ label: 'CPU %', data: Array(20).fill(0), borderColor: '#3b82f6', tension: 0.4, fill: true, backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 2 }] },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100, display: false }, x: { display: false } }, plugins: { legend: { display: false } }, elements: { point: { radius: 0 } } }
            });
        }

        function updateStats() {
            fetch('/system-stats').then(r => r.json()).then(data => {
                document.getElementById('statusLabel').innerText = data.status;
                document.getElementById('statusDot').className = data.status === 'RUNNING' ? 'w-2 h-2 rounded-full bg-green-500 animate-pulse' : 'w-2 h-2 rounded-full bg-red-500';
                document.getElementById('cpuVal').innerText = data.cpu + '%';
                document.getElementById('ramVal').innerText = data.ramUsed + 'MB';

                if(myChart) {
                    myChart.data.datasets[0].data.push(data.cpu);
                    myChart.data.datasets[0].data.shift();
                    myChart.update('none');
                }

                const sBtn = document.getElementById('btnStart');
                const stBtn = document.getElementById('btnStop');
                if(sBtn && stBtn) {
                    if(data.status === 'RUNNING') { sBtn.classList.add('btn-disabled'); stBtn.classList.remove('btn-disabled'); }
                    else { sBtn.classList.remove('btn-disabled'); stBtn.classList.add('btn-disabled'); }
                }
            });
        }
        initChart();
        setInterval(updateStats, 2000);

        function showToast() {
            const x = document.getElementById("toast");
            x.className = "show";
            setTimeout(() => { x.className = x.className.replace("show", ""); }, 5000);
        }
    </script>
</body>
</html>
`;

// --- PAGES ---
app.get('/', (req, res) => {
    const html = `
    <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="glass p-6 rounded-2xl h-40 relative">
                <p class="text-[10px] text-zinc-500 font-bold mb-2">LIVE CPU USAGE HISTORY</p>
                <canvas id="usageChart"></canvas>
            </div>
            <div class="flex gap-4 items-end">
                <form action="/run" method="POST" class="flex-1"><button id="btnStart" class="w-full bg-blue-600 hover:bg-blue-500 p-4 rounded-xl font-bold text-xs">START BOT</button></form>
                <form action="/stop" method="POST" class="flex-1"><button id="btnStop" class="w-full bg-zinc-800 p-4 rounded-xl font-bold text-xs border border-zinc-700">STOP</button></form>
            </div>
        </div>
        <div class="glass rounded-2xl p-4 bg-black/40 border-zinc-800">
            <div id="logs" class="h-[50vh] overflow-y-auto text-[11px] text-zinc-400 font-mono leading-relaxed"></div>
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
        <div class="glass p-4 rounded-2xl space-y-2 overflow-y-auto h-[70vh]">
            <p class="text-[10px] text-zinc-500 font-bold p-2">FILE EXPLORER</p>
            ${files.map(f => `<button onclick="editFile('${f}')" class="w-full text-left p-3 hover:bg-zinc-900 rounded-lg text-xs flex justify-between group"><span><i class="far fa-file-code mr-2 text-blue-500"></i>${f}</span><i class="fas fa-chevron-right opacity-0 group-hover:opacity-100"></i></button>`).join('')}
        </div>
        <div class="md:col-span-2 glass rounded-2xl flex flex-col overflow-hidden">
            <div class="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/30">
                <span id="fileNameDisplay" class="text-xs font-bold text-zinc-400">Select a file to edit</span>
                <button id="saveBtn" onclick="saveContent()" class="hidden bg-green-600 px-4 py-1 rounded text-[10px] font-bold">SAVE CHANGES</button>
            </div>
            <textarea id="editor" class="flex-1 bg-transparent p-4 text-sm outline-none font-mono resize-none text-blue-100" spellcheck="false"></textarea>
        </div>
    </div>
    <script>
        let currentFile = '';
        function editFile(name) {
            currentFile = name;
            document.getElementById('fileNameDisplay').innerText = 'Editing: ' + name;
            document.getElementById('saveBtn').classList.remove('hidden');
            fetch('/read-file/' + name).then(r => r.text()).then(data => {
                document.getElementById('editor').value = data;
            });
        }
        function saveContent() {
            document.getElementById('loadingOverlay').style.display = 'flex';
            fetch('/save-file', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name: currentFile, content: document.getElementById('editor').value })
            }).then(() => {
                document.getElementById('loadingOverlay').style.display = 'none';
                showToast();
            });
        }
    </script>`;
    res.send(layout(html, 'files'));
});

app.listen(port, () => console.log('KURO V4 ONLINE'));
