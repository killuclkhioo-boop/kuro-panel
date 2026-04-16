const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;

// ตั้งค่าที่เก็บไฟล์บอท
if (!fs.existsSync('./bots')) fs.mkdirSync('./bots');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let runningProcess = null;
let consoleLogs = [];
let config = { mainFile: '' };

// โหลดการตั้งค่าเดิม
if (fs.existsSync('config.json')) {
    config = JSON.parse(fs.readFileSync('config.json'));
}

// ระบบจัดการไฟล์
const storage = multer.diskStorage({
    destination: './bots',
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// --- ROUTES ---

// หน้าแรก (Dashboard)
app.get('/', (req, res) => {
    // ล้าง Console ทุกครั้งที่เข้าหน้าเว็บตามคำขอ
    consoleLogs = [`[SYSTEM] Console Cleared - ${new Date().toLocaleTimeString()}`];
    
    const files = fs.readdirSync('./bots');
    res.send(renderHTML(files));
});

// สั่งรันบอท
app.post('/run', (req, res) => {
    if (runningProcess) runningProcess.kill();
    const botPath = path.join(__dirname, 'bots', config.mainFile);

    if (fs.existsSync(botPath)) {
        consoleLogs.push(`[START] Running ${config.mainFile}...`);
        runningProcess = spawn('node', [botPath]);

        runningProcess.stdout.on('data', (data) => consoleLogs.push(`${data}`));
        runningProcess.stderr.on('data', (data) => consoleLogs.push(`[ERROR] ${data}`));
        runningProcess.on('close', (code) => consoleLogs.push(`[STOP] Bot exited with code ${code}`));
    } else {
        consoleLogs.push(`[ERROR] File ${config.mainFile} not found!`);
    }
    res.redirect('/');
});

// สั่งหยุดบอท
app.post('/stop', (req, res) => {
    if (runningProcess) {
        runningProcess.kill();
        consoleLogs.push(`[SYSTEM] Bot Stopped by Admin`);
    }
    res.redirect('/');
});

// บันทึกการตั้งค่าไฟล์หลัก
app.post('/set-main', (req, res) => {
    config.mainFile = req.body.mainFile;
    fs.writeFileSync('config.json', JSON.stringify(config));
    res.redirect('/');
});

// อัปโหลดไฟล์
app.post('/upload', upload.single('botFile'), (req, res) => {
    res.redirect('/');
});

// ลบไฟล์
app.get('/delete/:name', (req, res) => {
    const filePath = path.join(__dirname, 'bots', req.params.name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.redirect('/');
});

// ติดตั้งโมดูลผ่านหน้าเว็บ
app.post('/install-module', (req, res) => {
    const moduleName = req.body.moduleName;
    if (moduleName) {
        consoleLogs.push(`[SYSTEM] Installing ${moduleName}... Please wait.`);
        exec(`npm install ${moduleName}`, (err, stdout, stderr) => {
            if (err) consoleLogs.push(`[ERR] ${err.message}`);
            else {
                consoleLogs.push(`[SUCCESS] ${moduleName} Installed!`);
                consoleLogs.push(stdout);
            }
        });
    }
    res.redirect('/');
});

// ดึง Log ไปโชว์ (AJAX)
app.get('/get-logs', (req, res) => {
    res.send(consoleLogs.join('<br>'));
});

// --- UI DESIGN ---
function renderHTML(files) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>KURO HOSTING PRO</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono&display=swap" rel="stylesheet">
        <style> body { font-family: 'JetBrains Mono', monospace; } </style>
    </head>
    <body class="bg-black text-white p-5">
        <div class="max-w-4xl mx-auto">
            <h1 class="text-3xl font-bold text-blue-500 mb-6 underline">🌑 KURO HOSTING PRO</h1>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="bg-zinc-900 p-5 rounded-lg border border-zinc-800">
                    <h2 class="text-xl mb-4 font-bold text-zinc-400 border-b border-zinc-700 pb-2">📂 FILE MANAGER</h2>
                    <form action="/upload" method="POST" enctype="multipart/form-data" class="mb-4">
                        <input type="file" name="botFile" class="text-xs">
                        <button class="bg-blue-600 px-3 py-1 rounded text-xs mt-2">UPLOAD</button>
                    </form>
                    <ul class="text-sm space-y-2">
                        ${files.map(f => `
                            <li class="flex justify-between items-center bg-black p-2 rounded">
                                <span>${f}</span>
                                <a href="/delete/${f}" class="text-red-500 hover:underline">Delete</a>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <div class="bg-zinc-900 p-5 rounded-lg border border-zinc-800">
                    <h2 class="text-xl mb-4 font-bold text-zinc-400 border-b border-zinc-700 pb-2">⚙️ STARTUP & NPM</h2>
                    <form action="/set-main" method="POST" class="mb-4">
                        <label class="block text-xs mb-1">Main File:</label>
                        <input type="text" name="mainFile" value="${config.mainFile}" placeholder="index.js" class="bg-black w-full p-2 rounded border border-zinc-700">
                        <button class="bg-green-600 w-full mt-2 py-2 rounded font-bold">SAVE CONFIG</button>
                    </form>

                    <form action="/install-module" method="POST" class="mt-6 border-t border-zinc-700 pt-4">
                        <label class="block text-xs mb-1">Install Module:</label>
                        <input type="text" name="moduleName" placeholder="discord.js" class="bg-black w-full p-2 rounded border border-zinc-700">
                        <button class="bg-zinc-100 text-black w-full mt-2 py-1 rounded font-bold text-sm">INSTALL MODULE</button>
                    </form>
                </div>
            </div>

            <div class="mt-6 bg-black border border-zinc-700 rounded-lg overflow-hidden">
                <div class="bg-zinc-800 px-4 py-2 flex justify-between items-center">
                    <span class="text-xs font-bold">CONSOLE LOGS</span>
                    <div class="flex gap-2">
                        <form action="/run" method="POST"><button class="bg-green-600 px-4 py-1 rounded text-xs">RUN</button></form>
                        <form action="/stop" method="POST"><button class="bg-red-600 px-4 py-1 rounded text-xs">STOP</button></form>
                    </div>
                </div>
                <div id="logs" class="p-4 h-64 overflow-y-auto text-xs text-green-400 leading-relaxed">
                    Waiting for logs...
                </div>
            </div>
        </div>

        <script>
            setInterval(() => {
                fetch('/get-logs').then(r => r.text()).then(t => {
                    const logDiv = document.getElementById('logs');
                    logDiv.innerHTML = t;
                    logDiv.scrollTop = logDiv.scrollHeight;
                });
            }, 2000);
        </script>
    </body>
    </html>
    `;
}

app.listen(port, () => {
    console.log(`KURO PRO is running on port ${port}`);
});
