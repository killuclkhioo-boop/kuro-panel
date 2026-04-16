const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

// ตั้งค่าที่เก็บไฟล์
const upload = multer({ dest: 'bots/' });
app.use(express.urlencoded({ extended: true }));

// ข้อมูลสถานะระบบ
let config = { mainFile: 'index.js', nodeVersion: '20.x', modules: [] };
let runningProcess = null;
let consoleLogs = ["[SYSTEM] Welcome to Kuro Hosting Pro"];

// --- เมนูหลัก (Dashboard) ---
app.get('/', (req, res) => {
    const files = fs.readdirSync('./bots');
    res.send(renderHTML(files));
});

// --- ระบบจัดการไฟล์ (Files) ---
app.post('/upload', upload.single('file'), (req, res) => {
    const tempPath = req.file.path;
    const targetPath = path.join(__dirname, "./bots/" + req.file.originalname);
    fs.renameSync(tempPath, targetPath);
    consoleLogs.push(`[FILE] Uploaded: ${req.file.originalname}`);
    res.redirect('/');
});

app.get('/delete/:name', (req, res) => {
    const filePath = path.join(__dirname, "./bots/" + req.params.name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.redirect('/');
});

// --- ระบบตั้งค่า (Startup) ---
app.post('/save-config', (req, res) => {
    config.mainFile = req.body.mainFile;
    config.nodeVersion = req.body.nodeVersion;
    if (req.body.modules) config.modules = req.body.modules.split(',');
    consoleLogs.push(`[CONFIG] Settings saved. Main: ${config.mainFile}`);
    res.redirect('/');
});

// --- ระบบควบคุม (Console) ---
app.get('/run', (req, res) => {
    if (runningProcess) return res.redirect('/');
    
    const filePath = `./bots/${config.mainFile}`;
    if (!fs.existsSync(filePath)) {
        consoleLogs.push(`[ERROR] File ${config.mainFile} not found!`);
        return res.redirect('/');
    }

    consoleLogs.push(`[START] Running ${config.mainFile}...`);
    runningProcess = spawn('node', [filePath]);

    runningProcess.stdout.on('data', (data) => consoleLogs.push(`[LOG] ${data}`));
    runningProcess.stderr.on('data', (data) => consoleLogs.push(`[ERR] ${data}`));
    runningProcess.on('close', () => {
        consoleLogs.push(`[STOP] Process exited.`);
        runningProcess = null;
    });
    res.redirect('/');
});

app.get('/stop', (req, res) => {
    if (runningProcess) {
        runningProcess.kill();
        runningProcess = null;
    }
    res.redirect('/');
});

// --- ฟังก์ชันสร้างหน้าจอ (UI) ---
function renderHTML(files) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>KURO PANEL PRO</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    </head>
    <body class="bg-slate-900 text-slate-200 font-sans p-4 md:p-10">
        <div class="max-w-6xl mx-auto">
            <h1 class="text-3xl font-bold text-blue-400 mb-6 border-b border-slate-700 pb-4">🌑 KURO HOSTING PRO</h1>
            
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
                    <h2 class="text-xl font-semibold mb-4 text-white"><i class="fas fa-folder-open mr-2 text-yellow-500"></i> File Manager</h2>
                    <form action="/upload" method="POST" enctype="multipart/form-data" class="mb-4">
                        <input type="file" name="file" class="text-sm mb-2 block w-full">
                        <button class="bg-blue-600 w-full py-2 rounded font-bold hover:bg-blue-500 transition">UPLOAD</button>
                    </form>
                    <ul class="space-y-2 max-h-40 overflow-y-auto">
                        ${files.map(f => `<li class="flex justify-between text-sm bg-slate-900 p-2 rounded"><span>${f}</span> <a href="/delete/${f}" class="text-red-500">Delete</a></li>`).join('')}
                    </ul>
                </div>

                <div class="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
                    <h2 class="text-xl font-semibold mb-4 text-white"><i class="fas fa-rocket mr-2 text-purple-500"></i> Startup Config</h2>
                    <form action="/save-config" method="POST" class="space-y-3">
                        <div>
                            <label class="text-xs text-slate-400">Node Version</label>
                            <select name="nodeVersion" class="w-full bg-slate-900 p-2 rounded">
                                <option>20.x (Latest)</option>
                                <option>18.x</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-xs text-slate-400">Main File to Run</label>
                            <input type="text" name="mainFile" value="${config.mainFile}" class="w-full bg-slate-900 p-2 rounded">
                        </div>
                        <div>
                            <label class="text-xs text-slate-400">Modules (comma separated)</label>
                            <input type="text" name="modules" placeholder="discord.js,dotenv" class="w-full bg-slate-900 p-2 rounded">
                        </div>
                        <button class="bg-green-600 w-full py-2 rounded font-bold hover:bg-green-500 transition">SAVE SETTINGS</button>
                    </form>
                </div>

                <div class="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700 flex flex-col">
                    <h2 class="text-xl font-semibold mb-4 text-white"><i class="fas fa-terminal mr-2 text-green-500"></i> Console</h2>
                    <div class="bg-black p-3 rounded h-64 overflow-y-auto text-xs font-mono text-green-400 mb-4 flex flex-col-reverse">
                        ${consoleLogs.map(l => `<div>${l}</div>`).reverse().join('')}
                    </div>
                    <div class="flex gap-2">
                        <a href="/run" class="flex-1 bg-green-600 text-center py-2 rounded font-bold hover:bg-green-500">RUN</a>
                        <a href="/stop" class="flex-1 bg-red-600 text-center py-2 rounded font-bold hover:bg-red-500">STOP</a>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

app.listen(port, () => console.log(`Kuro Pro Online!`));
