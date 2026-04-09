const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });
const multer = require('multer');
const { spawn } = require('child_process');
const cors = require('cors');
const fs = require('fs');
const { parseXDATCARStream } = require('./utils/parser');
const nodemailer = require('nodemailer');
const ffmpeg = require('fluent-ffmpeg');
const JSZip = require('jszip');
const { randomUUID, createHash, createHmac } = require('crypto');
const zlib = require('zlib');
const os = require('os');
const readline = require('readline');
const { PRICING, IP_LIMIT } = require('./config');
const { connectDB, getUser, createUser, updateUser, redeemCode, createVerificationCode, verifyCode, getLastCodeTime, InvitationCode, User } = require('./utils/db');
const { Order } = require('./models');
const { createRuntimeDemoRouter } = require('./src/runtime/http/create-runtime-demo-router');
const { createRuntimeWorkerRunner } = require('./src/runtime/workers/create-runtime-worker-runner');
const { parseModelingIntent } = require('./src/modeling/parse-intent');
const { buildModelingStructure } = require('./src/modeling/build-structure');
const { buildModelingProviderAvailability, normalizeModelingProviderPreferences } = require('./src/modeling/provider-registry');
const { getModelingRuntimeDiagnostics } = require('./src/modeling/health');
const { parseSciencePdfFile } = require('./src/rendering/parse-pdf');
const { parseScienceText } = require('./src/rendering/parse-science');
const { validateRenderingImage } = require('./src/rendering/validate-image');
const { generateRenderingImages } = require('./src/rendering/generate-image');
const { runRetrievalAgentStream } = require('./src/retrieval/agent');

// --- Fail-fast: required environment variables ---
const REQUIRED_ENV = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'TOKEN_SECRET'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missingEnv.join(', ')}`);
    console.error('Please set them in server/.env and restart.');
    process.exit(1);
}

const TOKEN_SECRET = process.env.TOKEN_SECRET;

const app = express();
const PORT = 3000;
const runtimeWorkerRunner = process.env.ENABLE_AGENT_RUNTIME_WORKERS === '1'
    ? createRuntimeWorkerRunner()
    : null;

app.set('trust proxy', 1);

// Connect DB
connectDB();

// Email Transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: parseInt(process.env.SMTP_PORT || '465') === 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Enable CORS for frontend
app.use(cors({
    origin: [
      'https://scivisualizer.com',
      'https://www.scivisualizer.com',
      'https://portal.scivisualizer.com',
      'http://localhost',
      'http://localhost:5173'
    ],
    credentials: true
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

if (process.env.ENABLE_AGENT_RUNTIME_DEMO === '1') {
    app.use('/api/runtime-demo', createRuntimeDemoRouter());
}

const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 500 * 1024 * 1024 } 
});

const volumetricCache = new Map();
const VOLUMETRIC_CACHE_MAX = 5;
const cacheClearRate = new Map();

const clearVolumetricCache = () => {
    volumetricCache.clear();
};

// HMAC-SHA256 token generation and verification
const generateToken = (email) => {
    const payload = Buffer.from(`${email}:${Date.now()}`).toString('base64');
    const sig = createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    return `${payload}.${sig}`;
};

const verifyToken = (userId, token) => {
    if (!userId || !token) return false;
    let raw = String(token).trim();
    if (raw.toLowerCase().startsWith('bearer ')) raw = raw.slice(7).trim();
    try {
        const dotIndex = raw.lastIndexOf('.');
        if (dotIndex === -1) return false;
        const payload = raw.slice(0, dotIndex);
        const sig = raw.slice(dotIndex + 1);
        const expectedSig = createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
        if (sig !== expectedSig) return false;
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        const parts = decoded.split(':');
        if (parts.length < 2) return false;
        const email = parts[0];
        const ts = Number(parts[1]);
        if (email !== userId) return false;
        if (!Number.isFinite(ts)) return false;
        if (Date.now() - ts > 24 * 60 * 60 * 1000) return false;
        return true;
    } catch {
        return false;
    }
};

// Auth middleware for privileged endpoints
const authMiddleware = (req, res, next) => {
    const token = String(req.headers.authorization || '');
    const userId = String(req.body?.userId || '');
    if (!verifyToken(userId, token)) return res.status(401).json({ error: 'Unauthorized' });
    req.userId = userId;
    next();
};

const extractVaspStructureTextFromFile = async (filePath) => {
    const MAX_STRUCTURE_TEXT_BYTES = 20 * 1024 * 1024;
    const lines = [];
    let bytes = 0;

    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let titleRead = false;
    let scaleRead = false;
    let latticeRead = 0;
    let elementsLineRead = false;
    let countsRead = false;
    let totalAtomsCount = null;
    let coordModeRead = false;
    let coordLinesRead = 0;

    try {
        for await (const rawLine of rl) {
            const line = String(rawLine || '').trim();
            if (!line) continue;

            lines.push(line);
            bytes += line.length + 1;
            if (bytes > MAX_STRUCTURE_TEXT_BYTES) {
                throw new Error('Structure section too large for server-side parsing.');
            }

            if (!titleRead) {
                titleRead = true;
                continue;
            }
            if (!scaleRead) {
                scaleRead = true;
                continue;
            }
            if (latticeRead < 3) {
                latticeRead++;
                continue;
            }

            if (!elementsLineRead && !countsRead) {
                const tokens = line.split(/\s+/).filter(Boolean);
                if (tokens.length === 0) continue;
                if (isNaN(Number(tokens[0]))) {
                    elementsLineRead = true;
                    continue;
                }
                const counts = parseLineToNumbers(line);
                totalAtomsCount = counts.reduce((a, b) => a + b, 0);
                if (!Number.isFinite(totalAtomsCount) || totalAtomsCount <= 0) {
                    throw new Error('Invalid atom counts.');
                }
                if (totalAtomsCount > 100000) {
                    throw new Error(`System too large (${totalAtomsCount} atoms). Max allowed is 100,000.`);
                }
                countsRead = true;
                continue;
            }

            if (elementsLineRead && !countsRead) {
                const counts = parseLineToNumbers(line);
                totalAtomsCount = counts.reduce((a, b) => a + b, 0);
                if (!Number.isFinite(totalAtomsCount) || totalAtomsCount <= 0) {
                    throw new Error('Invalid atom counts.');
                }
                if (totalAtomsCount > 100000) {
                    throw new Error(`System too large (${totalAtomsCount} atoms). Max allowed is 100,000.`);
                }
                countsRead = true;
                continue;
            }

            if (countsRead && !coordModeRead) {
                if (line.toLowerCase().startsWith('s')) {
                    continue;
                }
                coordModeRead = true;
                continue;
            }

            if (coordModeRead && typeof totalAtomsCount === 'number') {
                coordLinesRead++;
                if (coordLinesRead >= totalAtomsCount) {
                    break;
                }
            }
        }
    } finally {
        rl.close();
        stream.destroy();
    }

    if (!coordModeRead || typeof totalAtomsCount !== 'number' || coordLinesRead < totalAtomsCount) {
        throw new Error('Failed to extract structure section from file.');
    }

    return lines.join('\n');
};

app.get('/api/health', (req, res) => {
    res.json({ ok: true });
});

// ==========================================
// Modeling Agent Routes
// ==========================================
app.post('/api/modeling/parse-intent', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });
        const providerPreferences = normalizeModelingProviderPreferences(req.body?.providerPreferences);
        const parsed = await parseModelingIntent({ prompt, providerPreferences });

        res.json({ success: true, intent: parsed });
    } catch (err) {
        console.error('Modeling Intent API error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/modeling/providers', async (req, res) => {
    try {
        const diagnostics = await getModelingRuntimeDiagnostics();
        res.json({
            success: true,
            providers: diagnostics.providers,
            engineHealth: diagnostics.engineHealth,
            summary: diagnostics.summary,
            defaultOrder: normalizeModelingProviderPreferences(req.query?.providers),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/compute/parse-intent', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });

        const systemPrompt = `You are a DFT computation expert.
Your task is to convert natural language descriptions into a structured JSON for VASP computation intent.

Return ONLY a valid JSON object. No markdown, no code blocks, no explanation.
Schema:
{
  "engine": "vasp",
  "workflow": "relax|static|dos|band|adsorption|neb",
  "quality": "fast|standard|high",
  "spin_mode": "auto|none|collinear|non-collinear",
  "vdw": boolean,
  "u_correction": boolean,
  "kpoints_mode": "auto|gamma|monkhorst",
  "restart_policy": "custodian|basic"
}

Defaults: workflow=relax, quality=standard, spin_mode=auto, vdw=true, kpoints_mode=auto, restart_policy=custodian.

Input: "${prompt}"`;

        const content = await geminiChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
        ], true);

        let parsed = safeJsonParse(content);
        res.json({ success: true, intent: parsed });
    } catch (err) {
        console.error('Compute Intent API error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/modeling/build', async (req, res) => {
    try {
        const intent = req.body;
        console.log("Modeling request received:", JSON.stringify(intent));
        const result = await buildModelingStructure({ intent });
        res.json(result);
    } catch (err) {
        console.error('Modeling API error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Helper: Get Client IP
const getClientIp = (req) => {
    return req.ip;
};

// --- 🔥 核心修复：后端强制企业端逻辑 ---
const ADMIN_EMAILS = ['2218114919@qq.com', '205954619@qq.com', 'yiteng1881273@163.com'];

const enforceAdminPrivileges = async (user) => {
    if (!user) return user;
    if (ADMIN_EMAILS.includes(user.email)) {
        // Auto-upgrade admin accounts to enterprise
        if (user.tier !== 'enterprise') {
            await updateUser(user.email, { tier: 'enterprise' });
            user.tier = 'enterprise';
        }
    }
    return user;
};

const isEmailLike = (val) => typeof val === 'string' && val.includes('@');

const getUserFlexible = async (userId) => {
    if (!userId) return null;
    if (isEmailLike(userId)) return await getUser(userId);
    const byId = await User.findById(userId);
    if (byId) return byId;
    return await getUser(userId);
};

const updateUserFlexible = async (userId, updates) => {
    if (!userId) return null;
    if (isEmailLike(userId)) return await updateUser(userId, updates);
    const updated = await User.findOneAndUpdate({ _id: userId }, { $set: updates }, { new: true }) ||
        await User.findOneAndUpdate({ id: userId }, { $set: updates }, { new: true });
    if (updated) return updated;
    return await updateUser(userId, updates);
};

// --- 🛠️ 新增：服务器端解析逻辑 (移植自前端修复版) ---
const parseLineToNumbers = (line) => {
    if (!line || !line.trim()) return [];
    // 关键修复：处理 Fortran 粘连数字
    const safeLine = line.replace(/(\d)-/g, '$1 -');
    return safeLine.trim().split(/\s+/)
        .map(s => parseFloat(s))
        .filter(n => !isNaN(n) && isFinite(n));
};

const parseVaspContent = (text) => {
    // 限制处理文本大小，防止内存爆炸 (例如 50MB)
    if (text.length > 50 * 1024 * 1024) {
        throw new Error("File too large for server-side structure parsing.");
    }

    const lines = text.trim().split(/\r?\n/);
    let currentLine = 0;
    const nextLine = () => {
        while (currentLine < lines.length) {
            const line = lines[currentLine++].trim();
            if (line) return line;
        }
        return null;
    };

    const title = nextLine(); // Title
    
    const scaleLine = nextLine();
    if (!scaleLine) throw new Error("Invalid VASP file: Missing scale factor");
    let scale = parseFloat(scaleLine) || 1.0;
    const isVolumeScale = scale < 0;
    if (isVolumeScale) scale = Math.abs(scale);

    const latticeVectors = [];
    for(let i=0; i<3; i++) {
        const line = nextLine();
        if (!line) throw new Error("Invalid VASP file: Missing lattice vectors");
        const raw = parseLineToNumbers(line);
        latticeVectors.push([
            (raw[0]||0) * (isVolumeScale?1:scale),
            (raw[1]||0) * (isVolumeScale?1:scale),
            (raw[2]||0) * (isVolumeScale?1:scale)
        ]);
    }

    const lineA = nextLine();
    if (!lineA) throw new Error("Invalid VASP file: Missing elements/counts line");
    const tokensA = lineA.split(/\s+/).filter(s=>s!=='');
    let elements = [], counts = [];
    
    if (isNaN(Number(tokensA[0]))) {
        // VASP 5: Elements line exists
        elements = tokensA;
        const lineB = nextLine();
        if (!lineB) throw new Error("Invalid VASP file: Missing atom counts");
        counts = parseLineToNumbers(lineB);
    } else {
        // VASP 4: No elements line, only counts
        counts = parseLineToNumbers(lineA);
        elements = counts.map((_,i) => `El${i+1}`);
    }

    // 验证 counts 和 elements 匹配
    if (elements.length !== counts.length) {
        throw new Error("VASP Parse Error: Elements and counts mismatch");
    }

    // 限制原子总数，防止服务器卡死 (例如 100,000 个)
    const totalAtomsCount = counts.reduce((a, b) => a + b, 0);
    if (totalAtomsCount > 100000) {
        throw new Error(`System too large (${totalAtomsCount} atoms). Max allowed is 100,000.`);
    }

    let modeLine = nextLine();
    // Skip Selective dynamics if present
    if (modeLine && modeLine.toLowerCase().startsWith('s')) modeLine = nextLine(); 
    
    if (!modeLine) throw new Error("Invalid VASP file: Missing coordinate mode");
    const isDirect = modeLine.toLowerCase().startsWith('d');

    const atoms = [];
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const count = counts[i];
        for (let j = 0; j < count; j++) {
            const line = nextLine();
            if (!line) break;
            const coords = parseLineToNumbers(line);
            // 补全缺失坐标防止崩溃
            while(coords.length < 3) coords.push(0);
            
            let x, y, z;
            if (isDirect) {
                x = coords[0]*latticeVectors[0][0] + coords[1]*latticeVectors[1][0] + coords[2]*latticeVectors[2][0];
                y = coords[0]*latticeVectors[0][1] + coords[1]*latticeVectors[1][1] + coords[2]*latticeVectors[2][1];
                z = coords[0]*latticeVectors[0][2] + coords[1]*latticeVectors[1][2] + coords[2]*latticeVectors[2][2];
            } else {
                const s = isVolumeScale ? 1.0 : scale;
                x = coords[0]*s; y = coords[1]*s; z = coords[2]*s;
            }
            atoms.push({ element: el, position: {x,y,z} });
        }
    }
    
    return { atoms, latticeVectors, meta: { totalAtomsCount, isDirect, isVolumeScale } };
};

const parseVolumetricContent = (text) => {
    if (!text || !text.trim()) throw new Error('Empty volumetric file');
    const lines = text.trim().split(/\r?\n/);
    let currentLine = 0;

    currentLine += 1;
    currentLine += 1;
    currentLine += 3;

    if (currentLine >= lines.length) throw new Error('Invalid volumetric header');
    let parts = lines[currentLine].trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) throw new Error('Invalid volumetric header');
    if (isNaN(Number(parts[0]))) {
        currentLine++;
        if (currentLine >= lines.length) throw new Error('Invalid atom counts');
        parts = lines[currentLine].trim().split(/\s+/).filter(Boolean);
    }

    const counts = parts.map(Number);
    if (counts.some(isNaN)) throw new Error('Invalid atom counts');
    const totalAtoms = counts.reduce((a, b) => a + b, 0);
    currentLine++;

    if (currentLine < lines.length && lines[currentLine].trim().toLowerCase().startsWith('s')) {
        currentLine++;
    }

    currentLine++;
    currentLine += totalAtoms;

    while (currentLine < lines.length && lines[currentLine].trim() === '') {
        currentLine++;
    }
    if (currentLine >= lines.length) throw new Error('Missing grid dimensions');

    const gridDims = lines[currentLine].trim().split(/\s+/).map(Number);
    if (gridDims.length < 3 || gridDims.some(isNaN)) throw new Error('Invalid grid dimensions');
    const ngx = gridDims[0];
    const ngy = gridDims[1];
    const ngz = gridDims[2];

    const MAX_GRID_SIDE = 512;
    const MAX_TOTAL_POINTS = 20_000_000;
    if (ngx <= 0 || ngy <= 0 || ngz <= 0 || ngx > MAX_GRID_SIDE || ngy > MAX_GRID_SIDE || ngz > MAX_GRID_SIDE) {
        throw new Error(`Invalid grid dimensions: ${ngx}x${ngy}x${ngz}`);
    }
    const totalGridPoints = ngx * ngy * ngz;
    if (totalGridPoints > MAX_TOTAL_POINTS) {
        throw new Error(`Grid too large: ${ngx}x${ngy}x${ngz}`);
    }

    currentLine++;

    const data = new Float32Array(totalGridPoints);
    let idx = 0;
    let min = Infinity;
    let max = -Infinity;

    while (currentLine < lines.length && idx < totalGridPoints) {
        const l = lines[currentLine].trim();
        if (l) {
            const values = l.split(/\s+/);
            for (let i = 0; i < values.length && idx < totalGridPoints; i++) {
                const v = parseFloat(values[i]);
                if (!Number.isFinite(v)) continue;
                data[idx] = v;
                if (v < min) min = v;
                if (v > max) max = v;
                idx++;
            }
        }
        currentLine++;
    }

    return { ngx, ngy, ngz, data, min, max };
};

const downsampleVolumetric = (vol, maxTotalPoints) => {
    const total = vol.ngx * vol.ngy * vol.ngz;
    if (total <= maxTotalPoints) {
        const maxAbs = Math.max(Math.abs(vol.min), Math.abs(vol.max));
        return { ...vol, maxAbs };
    }

    const ratio = Math.cbrt(total / maxTotalPoints);
    const step = Math.max(1, Math.ceil(ratio));

    const ngx2 = Math.ceil(vol.ngx / step);
    const ngy2 = Math.ceil(vol.ngy / step);
    const ngz2 = Math.ceil(vol.ngz / step);

    const data2 = new Float32Array(ngx2 * ngy2 * ngz2);
    let min = Infinity;
    let max = -Infinity;
    let di = 0;

    for (let z = 0; z < ngz2; z++) {
        const srcZ = Math.min(vol.ngz - 1, z * step);
        for (let y = 0; y < ngy2; y++) {
            const srcY = Math.min(vol.ngy - 1, y * step);
            for (let x = 0; x < ngx2; x++) {
                const srcX = Math.min(vol.ngx - 1, x * step);
                const v = vol.data[srcX + srcY * vol.ngx + srcZ * vol.ngx * vol.ngy];
                data2[di++] = v;
                if (v < min) min = v;
                if (v > max) max = v;
            }
        }
    }

    const maxAbs = Math.max(Math.abs(min), Math.abs(max));
    return { ngx: ngx2, ngy: ngy2, ngz: ngz2, data: data2, min, max, maxAbs };
};

const parseVolumetricDownsampleStream = async (filePath, maxTotalPoints) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let phase = 0;
    let currentLine = 0;

    let countsRead = false;
    let totalAtoms = 0;
    let skippedCoords = 0;
    let coordModeSkipped = false;

    let ngx = 0, ngy = 0, ngz = 0;
    let stride = 1;
    let ngx2 = 0, ngy2 = 0, ngz2 = 0;
    let data2 = null;
    let dataIndex = 0;
    let min = Infinity;
    let max = -Infinity;

    const finish = () => {
        rl.close();
        stream.destroy();
    };

    try {
        for await (const rawLine of rl) {
            const line = String(rawLine ?? '');
            const trimmed = line.trim();

            if (phase === 0) {
                currentLine++;
                if (currentLine >= 5) phase = 1;
                continue;
            }

            if (phase === 1) {
                if (!trimmed) continue;
                const parts = trimmed.split(/\s+/).filter(Boolean);
                if (parts.length === 0) continue;
                if (isNaN(Number(parts[0]))) continue;
                const counts = parts.map(Number);
                if (counts.some(isNaN)) continue;
                totalAtoms = counts.reduce((a, b) => a + b, 0);
                countsRead = true;
                phase = 2;
                continue;
            }

            if (phase === 2) {
                if (!trimmed) continue;
                if (trimmed.toLowerCase().startsWith('s')) continue;
                coordModeSkipped = true;
                phase = 3;
                continue;
            }

            if (phase === 3) {
                if (!countsRead || !coordModeSkipped) continue;
                if (!trimmed) continue;
                skippedCoords++;
                if (skippedCoords >= totalAtoms) phase = 4;
                continue;
            }

            if (phase === 4) {
                if (!trimmed) continue;
                const dims = trimmed.split(/\s+/).map(Number);
                if (dims.length < 3 || dims.some(isNaN)) continue;
                ngx = dims[0]; ngy = dims[1]; ngz = dims[2];
                const total = ngx * ngy * ngz;
                if (!Number.isFinite(total) || total <= 0) throw new Error('Invalid grid dimensions');
                const ratio = Math.cbrt(total / maxTotalPoints);
                stride = Math.max(1, Math.ceil(ratio));
                ngx2 = Math.floor((ngx - 1) / stride) + 1;
                ngy2 = Math.floor((ngy - 1) / stride) + 1;
                ngz2 = Math.floor((ngz - 1) / stride) + 1;
                data2 = new Float32Array(ngx2 * ngy2 * ngz2);
                phase = 5;
                continue;
            }

            if (phase === 5) {
                if (dataIndex >= ngx * ngy * ngz) break;
                if (!trimmed) continue;
                const values = trimmed.split(/\s+/);
                for (let i = 0; i < values.length && dataIndex < ngx * ngy * ngz; i++) {
                    const v = parseFloat(values[i]);
                    if (!Number.isFinite(v)) continue;
                    const ix = dataIndex % ngx;
                    const iy = Math.floor(dataIndex / ngx) % ngy;
                    const iz = Math.floor(dataIndex / (ngx * ngy));
                    if (ix % stride === 0 && iy % stride === 0 && iz % stride === 0) {
                        const dx = Math.floor(ix / stride);
                        const dy = Math.floor(iy / stride);
                        const dz = Math.floor(iz / stride);
                        const di = dx + dy * ngx2 + dz * ngx2 * ngy2;
                        data2[di] = v;
                        if (v < min) min = v;
                        if (v > max) max = v;
                    }
                    dataIndex++;
                }
                continue;
            }
        }
    } finally {
        finish();
    }

    if (!data2) throw new Error('Failed to parse volumetric data');
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 0; }
    const maxAbs = Math.max(Math.abs(min), Math.abs(max));
    return { ngx: ngx2, ngy: ngy2, ngz: ngz2, data: data2, min, max, maxAbs };
};

// --- Auth Routes ---
app.post('/api/auth/send-email-code', async (req, res) => {
    const { email } = req.body;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });
    
    const lastTime = await getLastCodeTime(email);
    if (lastTime && Date.now() - new Date(lastTime).getTime() < 60000) {
        return res.status(429).json({ error: 'Please wait 60 seconds before retrying.' });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await createVerificationCode(email, otp);
    
    const mailOptions = {
        from: `"SCI Visualizer" <${process.env.SMTP_USER}>`,
        to: email,
        subject: '[SCI Visualizer] Your Verification Code',
        html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f7f9; padding: 50px 0; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <!-- Header -->
                <div style="background-color: #0A1128; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 1px;">SCI Visualizer</h1>
                </div>
                
                <!-- Body -->
                <div style="padding: 40px; line-height: 1.6;">
                    <p style="font-size: 18px; margin-bottom: 20px;">Hello,</p>
                    <p style="font-size: 16px; color: #666; margin-bottom: 30px;">Your verification code is:</p>
                    
                    <div style="background-color: #f0f4f8; border-radius: 12px; padding: 30px; text-align: center; margin-bottom: 30px;">
                        <span style="font-size: 42px; font-weight: bold; color: #0A1128; letter-spacing: 8px;">${otp}</span>
                    </div>
                    
                    <p style="font-size: 14px; color: #999; margin-bottom: 10px;">It will expire in 5 minutes.</p>
                    <p style="font-size: 14px; color: #999;">If you did not request this, please ignore this email.</p>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                    <p style="font-size: 12px; color: #aaa; margin: 0;">&copy; 2026 SCI Visualizer. All rights reserved.</p>
                </div>
            </div>
        </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return res.json({ success: true, message: 'Code sent.' });
    } catch (error) {
        return res.status(500).json({ error: 'Mail delivery failed', details: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, code } = req.body; 
    const ip = getClientIp(req);
    
    const isValid = await verifyCode(email, code);
    if (!isValid) return res.status(401).json({ error: 'Invalid code' });
    
    let user = await getUser(email); 
    if (!user) user = await createUser(email, ip);
    else {
        if (!user.associated_ips.includes(ip)) {
            if (user.associated_ips.length >= IP_LIMIT) return res.status(403).json({ error: 'Device limit reached.' });
            user.associated_ips.push(ip);
            await updateUser(email, { associated_ips: user.associated_ips });
        }
    }

    if (user.prepaid_img === undefined) await updateUser(email, { prepaid_img: 0 });
    user = await enforceAdminPrivileges(user);
    
    const token = generateToken(email);
    res.json({ success: true, user, token });
});

app.post('/api/auth/redeem', async (req, res) => {
    const { userId, code } = req.body;
    try {
        await redeemCode(code, userId);
        let user = await getUserFlexible(userId);
        user = await enforceAdminPrivileges(user);
        res.json({ success: true, user });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/user/:id', async (req, res) => {
    try {
        const token = String(req.headers.authorization || '');
        const userId = req.params.id;
        if (!verifyToken(userId, token)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        let user = await getUserFlexible(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user = await enforceAdminPrivileges(user);
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/subscribe', authMiddleware, async (req, res) => {
    try {
        const { userId, tier } = req.body;
        let user = await updateUserFlexible(userId, { tier });
        user = await enforceAdminPrivileges(user);
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/pay-batch', authMiddleware, async (req, res) => {
    try {
        const { userId, count, amount } = req.body;
        let user = await getUserFlexible(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        let updatedUser = await updateUserFlexible(userId, { prepaid_img: (user.prepaid_img||0) + count });
        updatedUser = await enforceAdminPrivileges(updatedUser);
        res.json({ success: true, orderId: `ORD-${Date.now()}`, user: updatedUser });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/check-export', authMiddleware, async (req, res) => {
    try {
        const { userId, type } = req.body; 
        let user = await getUserFlexible(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user = await enforceAdminPrivileges(user);
        const result = calculateCost(user, type);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/deduct-export', authMiddleware, async (req, res) => {
    try {
        const { userId, type } = req.body;
        let user = await getUserFlexible(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user = await enforceAdminPrivileges(user);
        const result = calculateCost(user, type);
        
        const updates = {};
        if (result.status === 'prepaid') {
            if (type === 'img') updates.prepaid_img = Math.max(0, (user.prepaid_img || 0) - 1);
        } else if (result.status === 'trial') {
            if (type === 'img') updates.trial_img_left = Math.max(0, user.trial_img_left - 1);
            if (type === 'vid') updates.trial_vid_left = Math.max(0, user.trial_vid_left - 1);
        } else {
            if (type === 'img') updates.used_img = user.used_img + 1;
            if (type === 'vid') updates.used_vid = user.used_vid + 1;
        }
        
        let updatedUser = await updateUserFlexible(userId, updates);
        updatedUser = await enforceAdminPrivileges(updatedUser);
        clearVolumetricCache();
        
        res.json({ success: true, user: updatedUser, cost: result.cost });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Cloud Video Stitching API
app.post('/api/video/stitch', upload.single('framesZip'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No frames zip uploaded' });
    
    const sessionId = randomUUID();
    const tempDir = path.join(os.tmpdir(), `vasp_vid_${sessionId}`);
    const fps = parseInt(req.body.fps) || 30;
    
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        
        const zipBuffer = await fs.promises.readFile(req.file.path);
        const zip = await JSZip.loadAsync(zipBuffer);
        const filePromises = [];
        
        zip.forEach((relativePath, file) => {
            if (!file.dir) {
                const safeName = path.basename(relativePath);
                if (!safeName) return;
                const promise = file.async('nodebuffer').then(buffer => {
                    fs.writeFileSync(path.join(tempDir, safeName), buffer);
                });
                filePromises.push(promise);
            }
        });
        
        await Promise.all(filePromises);
        
        const outputPath = path.join(tempDir, 'output.mp4');
        
        // Use ffmpeg to stitch images
        ffmpeg()
            .input(path.join(tempDir, '%d.jpg'))
            .inputFPS(fps)
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-preset medium',
                '-crf 23'
            ])
            .on('end', () => {
                clearVolumetricCache();
                res.download(outputPath, 'trajectory_export.mp4', (err) => {
                    // Cleanup
                    try {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    } catch (e) {}
                });
            })
            .on('error', (err) => {
                console.error('FFmpeg Error:', err);
                res.status(500).json({ error: 'Video encoding failed' });
                try {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (e) {}
            })
            .save(outputPath);
            
    } catch (err) {
        console.error('Stitch API Error:', err);
        res.status(500).json({ error: err.message });
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {}
    } finally {
        try {
            fs.unlink(req.file.path, () => {});
        } catch (e) {}
    }
});

function calculateCost(user, type) {
    if (user.tier === 'enterprise') return { cost: 0, status: 'quota' };
    if (user.tier === 'academic') return { cost: 0, status: 'quota' };
    if (type === 'img' && user.prepaid_img > 0) return { cost: 0, status: 'prepaid' };
    if (type === 'img' && user.trial_img_left > 0) return { cost: 0, status: 'trial' };
    if (type === 'vid' && user.trial_vid_left > 0) return { cost: 0, status: 'trial' };
    const tierConfig = PRICING[user.tier.toUpperCase()] || PRICING.PERSONAL;
    return { cost: tierConfig.unitPrice[type], status: 'pay' };
}

// =============================================
// 🔑 Admin API - Password Protected
// =============================================
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'CHANGE_THIS_TO_A_COMPLEX_SECRET_123456';

app.post('/api/admin/grant', async (req, res) => {
    try {
        const { secret, email, tier, prepaid_img, prepaid_vid, trial_img_left, trial_vid_left } = req.body;
        
        // Verify admin secret
        if (!secret || secret !== ADMIN_SECRET) {
            return res.status(403).json({ error: 'Forbidden: Invalid admin secret' });
        }
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        let user = await getUser(email);
        if (!user) {
            return res.status(404).json({ error: `User not found: ${email}` });
        }
        
        const updates = {};
        if (tier) updates.tier = tier;
        if (prepaid_img !== undefined) updates.prepaid_img = (user.prepaid_img || 0) + prepaid_img;
        if (prepaid_vid !== undefined) updates.prepaid_vid = (user.prepaid_vid || 0) + prepaid_vid;
        if (trial_img_left !== undefined) updates.trial_img_left = trial_img_left;
        if (trial_vid_left !== undefined) updates.trial_vid_left = trial_vid_left;
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No updates provided. Use tier, prepaid_img, prepaid_vid, trial_img_left, or trial_vid_left.' });
        }
        
        const updatedUser = await updateUser(email, updates);
        console.log(`[Admin] Granted to ${email}:`, updates);
        
        res.json({ 
            success: true, 
            message: `Successfully updated user ${email}`,
            updates,
            user: updatedUser
        });
    } catch (error) {
        console.error('[Admin] Grant error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin: List all users (for checking status)
app.post('/api/admin/users', async (req, res) => {
    try {
        const { secret } = req.body;
        if (!secret || secret !== ADMIN_SECRET) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        
        const allUsers = await User.find({});
        const safeUsers = allUsers.map(u => ({
            email: u.email,
            tier: u.tier,
            prepaid_img: u.prepaid_img || 0,
            prepaid_vid: u.prepaid_vid || 0,
            trial_img_left: u.trial_img_left,
            trial_vid_left: u.trial_vid_left,
            used_img: u.used_img,
            used_vid: u.used_vid,
            createdAt: u.createdAt
        }));
        
        res.json({ success: true, users: safeUsers });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// =============================================
// 💰 支付宝当面付 (Real Payment)
// =============================================
let alipaySdk = null;
try {
    const AlipaySdk = require('alipay-sdk').default;
    if (process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY) {
        alipaySdk = new AlipaySdk({
            appId: process.env.ALIPAY_APP_ID,
            privateKey: process.env.ALIPAY_PRIVATE_KEY,
            alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
            gateway: 'https://openapi.alipay.com/gateway.do',
        });
        console.log('[Payment] Alipay SDK initialized');
    } else {
        console.log('[Payment] Alipay not configured — payment/create will return mock QR');
    }
} catch (e) {
    console.log('[Payment] alipay-sdk not installed — payment/create will return mock QR');
}

// 1. 创建支付订单（前端调用，获取支付链接/二维码）
app.post('/api/payment/create', authMiddleware, async (req, res) => {
    try {
        const { userId, type, tier, count } = req.body;
        const user = await getUserFlexible(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        let amount = 0;
        let subject = '';

        if (type === 'subscription') {
            if (tier === 'enterprise' || tier === 'academic') {
                return res.status(400).json({ error: '该方案请联系销售: 18396102509' });
            }
            const tierConfig = PRICING[tier?.toUpperCase()];
            if (!tierConfig) return res.status(400).json({ error: 'Invalid tier' });
            amount = tierConfig.price;
            subject = `SCI Visualizer ${tierConfig.label}订阅`;
        } else if (type === 'batch') {
            const unitPrice = (PRICING[user.tier?.toUpperCase()] || PRICING.PERSONAL).unitPrice.img;
            amount = (count || 1) * unitPrice;
            subject = `SCI Visualizer ${count} 张图片额度`;
        } else if (type === 'img' || type === 'vid') {
            const costResult = calculateCost(user, type);
            if (costResult.cost === 0) {
                return res.json({ success: true, free: true });
            }
            amount = costResult.cost;
            subject = `SCI Visualizer ${type === 'img' ? '高清图片' : '视频'}导出`;
        } else {
            return res.status(400).json({ error: 'Invalid payment type' });
        }

        if (amount <= 0) {
            return res.json({ success: true, free: true });
        }

        const orderId = `SCI-${Date.now()}-${randomUUID().slice(0, 8)}`;

        await Order.create({
            orderId,
            userId,
            type,
            tier: tier || null,
            count: count || null,
            amount,
            status: 'pending',
            createdAt: new Date()
        });

        // 调用支付宝预下单
        if (alipaySdk) {
            const result = await alipaySdk.exec('alipay.trade.precreate', {
                notify_url: process.env.ALIPAY_NOTIFY_URL,
                bizContent: {
                    out_trade_no: orderId,
                    total_amount: amount.toFixed(2),
                    subject,
                },
            });

            if (result.code === '10000' && result.qrCode) {
                res.json({ success: true, orderId, qrCode: result.qrCode, amount });
            } else {
                console.error('[Payment] Alipay precreate failed:', result);
                res.status(500).json({ error: 'Alipay order creation failed', detail: result.subMsg || result.msg });
            }
        } else {
            // 支付宝未配置时返回 mock 数据（开发用）
            console.log(`[Payment] Mock order created: ${orderId}, amount=¥${amount}`);
            res.json({ success: true, orderId, qrCode: null, amount, mock: true });
        }
    } catch (error) {
        console.error('[Payment] Create order error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2. 支付宝异步回调（支付成功后支付宝主动 POST 通知）
app.post('/api/payment/alipay-notify', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        if (alipaySdk) {
            const isValid = alipaySdk.checkNotifySign(req.body);
            if (!isValid) {
                console.error('[Payment] Invalid notify signature');
                return res.send('fail');
            }
        }

        const { out_trade_no, trade_status } = req.body;
        console.log(`[Payment] Notify: order=${out_trade_no}, status=${trade_status}`);

        if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
            const order = await Order.findOne({ orderId: out_trade_no });
            if (!order || order.status === 'paid') {
                return res.send('success');
            }

            // 根据订单类型发放权益
            if (order.type === 'subscription') {
                await updateUserFlexible(order.userId, { tier: order.tier });
            } else if (order.type === 'batch') {
                const user = await getUserFlexible(order.userId);
                await updateUserFlexible(order.userId, {
                    prepaid_img: (user.prepaid_img || 0) + (order.count || 0)
                });
            }
            // img/vid 单次导出：标记 paid 即可，前端轮询后触发 deduct-export

            await Order.findOneAndUpdate(
                { orderId: out_trade_no },
                { $set: { status: 'paid', paidAt: new Date() } }
            );
            console.log(`[Payment] Order ${out_trade_no} fulfilled`);
        }

        res.send('success');
    } catch (e) {
        console.error('[Payment] Notify error:', e);
        res.send('fail');
    }
});

// 3. 前端轮询支付状态
app.post('/api/payment/check', authMiddleware, async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findOne({ orderId });
        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (order.status === 'paid') {
            let user = await getUserFlexible(order.userId);
            user = await enforceAdminPrivileges(user);
            return res.json({ success: true, paid: true, user });
        }

        res.json({ success: true, paid: false });
    } catch (error) {
        console.error('[Payment] Check error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 4. 管理员手动确认订单（开发调试 / 无支付宝时使用）
app.post('/api/payment/manual-confirm', async (req, res) => {
    try {
        const { secret, orderId } = req.body;
        if (!secret || secret !== ADMIN_SECRET) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const order = await Order.findOne({ orderId });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.status === 'paid') return res.json({ success: true, message: 'Already paid' });

        // 发放权益
        if (order.type === 'subscription') {
            await updateUserFlexible(order.userId, { tier: order.tier });
        } else if (order.type === 'batch') {
            const user = await getUserFlexible(order.userId);
            await updateUserFlexible(order.userId, {
                prepaid_img: (user.prepaid_img || 0) + (order.count || 0)
            });
        }

        await Order.findOneAndUpdate(
            { orderId },
            { $set: { status: 'paid', paidAt: new Date(), manualConfirm: true } }
        );

        let user = await getUserFlexible(order.userId);
        user = await enforceAdminPrivileges(user);
        res.json({ success: true, user });
    } catch (error) {
        console.error('[Payment] Manual confirm error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/clear-cache', (req, res) => {
    try {
        const userId = String(req.body?.userId || '');
        const token = String(req.headers.authorization || req.headers['x-vasp-token'] || '');
        const ip = String((req.headers['x-forwarded-for'] || req.ip || '')).split(',')[0].trim();
        const now = Date.now();
        const last = cacheClearRate.get(ip) || 0;
        if (now - last < 3000) return res.status(429).json({ error: 'Too many requests' });
        cacheClearRate.set(ip, now);

        if (!verifyToken(userId, token)) return res.status(403).json({ error: 'Forbidden' });
        clearVolumetricCache();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- 🚀 新接口：服务器端解析结构文件 ---
app.post('/api/parse-structure', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const structureText = await extractVaspStructureTextFromFile(req.file.path);
        const result = parseVaspContent(structureText);
        
        // 构造前端需要的格式
        const atoms = result.atoms.map((a, idx) => ({
            id: `atom-${idx}`,
            element: a.element,
            position: a.position,
        }));

        res.json({
            success: true,
            data: {
                id: `mol-${Date.now()}`,
                filename: req.file.originalname,
                atoms: atoms,
                latticeVectors: result.latticeVectors,
                meta: { ...result.meta, parsedAtoms: atoms.length }
            }
        });
    } catch (e) {
        console.error("Server parsing error:", e);
        const message = e?.message || "Server failed to parse file";
        res.status(400).json({ error: message });
    } finally {
        fs.unlink(req.file.path, ()=>{});
    }
});

app.post('/api/parse-density', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        if (req.file.size > 120 * 1024 * 1024) {
            return res.status(413).json({ error: 'File too large for server-side volumetric parsing.' });
        }

        const normalizeByCellVolume = !String(req.file.originalname || '').toUpperCase().includes('CHGDIFF');
        const maxTotalPoints = 2_000_000;

        const structureText = await extractVaspStructureTextFromFile(req.file.path);
        const structParsed = parseVaspContent(structureText);
        const atoms = structParsed.atoms.map((a, idx) => ({
            id: `atom-${idx}`,
            element: a.element,
            position: a.position,
        }));

        const content = await fs.promises.readFile(req.file.path, 'utf8');
        const parsed = parseVolumetricContent(content);
        const downsampled = downsampleVolumetric(parsed, maxTotalPoints);

        const rawBuffer = Buffer.from(downsampled.data.buffer, downsampled.data.byteOffset, downsampled.data.byteLength);
        const gz = zlib.gzipSync(rawBuffer);

        res.json({
            success: true,
            data: {
                structure: {
                    id: `mol-${Date.now()}`,
                    filename: req.file.originalname,
                    atoms,
                    latticeVectors: structParsed.latticeVectors,
                    meta: { ...structParsed.meta, parsedAtoms: atoms.length }
                },
                volumetric: {
                    ngx: downsampled.ngx,
                    ngy: downsampled.ngy,
                    ngz: downsampled.ngz,
                    min: downsampled.min,
                    max: downsampled.max,
                    maxAbs: downsampled.maxAbs,
                    normalizeByCellVolume,
                    encoding: 'gzip-base64-f32',
                    dataB64: gz.toString('base64')
                }
            }
        });
    } catch (e) {
        const message = e?.message || 'Server failed to parse density file';
        res.status(400).json({ error: message });
    } finally {
        fs.unlink(req.file.path, ()=>{});
    }
});

app.post('/api/parse-volumetric', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        if (req.file.size > 500 * 1024 * 1024) {
            return res.status(413).json({ error: 'File too large for server-side volumetric parsing.' });
        }
        const normalizeByCellVolume = !String(req.file.originalname || '').toUpperCase().includes('CHGDIFF');
        const maxTotalPoints = 2_000_000;
        const accept = String(req.headers.accept || '');

        const preferStream = req.file.size > 80 * 1024 * 1024;
        let cacheKey = null;
        let cached = null;
        let raw = null;

        if (!preferStream) {
            raw = await fs.promises.readFile(req.file.path);
            const hash = createHash('sha256').update(raw).digest('hex');
            cacheKey = `${hash}:${normalizeByCellVolume ? 1 : 0}:${maxTotalPoints}`;
            cached = volumetricCache.get(cacheKey);
        }

        if (cached) {
            if (accept.includes('application/octet-stream')) {
                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Encoding', 'gzip');
                res.setHeader('X-Volumetric-Ngx', String(cached.ngx));
                res.setHeader('X-Volumetric-Ngy', String(cached.ngy));
                res.setHeader('X-Volumetric-Ngz', String(cached.ngz));
                res.setHeader('X-Volumetric-Min', String(cached.min));
                res.setHeader('X-Volumetric-Max', String(cached.max));
                res.setHeader('X-Volumetric-MaxAbs', String(cached.maxAbs));
                res.setHeader('X-Volumetric-NormalizeByCellVolume', cached.normalizeByCellVolume ? '1' : '0');
                res.setHeader('X-Volumetric-Format', 'f32-le');
                res.send(cached.gz);
                return;
            }

            res.json({
                success: true,
                data: {
                    ngx: cached.ngx,
                    ngy: cached.ngy,
                    ngz: cached.ngz,
                    min: cached.min,
                    max: cached.max,
                    maxAbs: cached.maxAbs,
                    normalizeByCellVolume: cached.normalizeByCellVolume,
                    encoding: 'gzip-base64-f32',
                    dataB64: cached.gz.toString('base64')
                }
            });
            return;
        }

        let downsampled = null;
        if (!preferStream && raw) {
            try {
                const content = raw.toString('utf8');
                const parsed = parseVolumetricContent(content);
                downsampled = downsampleVolumetric(parsed, maxTotalPoints);
            } catch (e) {
                downsampled = null;
            }
        }
        if (!downsampled) {
            downsampled = await parseVolumetricDownsampleStream(req.file.path, maxTotalPoints);
        }

        const rawBuffer = Buffer.from(downsampled.data.buffer, downsampled.data.byteOffset, downsampled.data.byteLength);
        const gz = zlib.gzipSync(rawBuffer);

        if (cacheKey) {
            volumetricCache.set(cacheKey, {
                ngx: downsampled.ngx,
                ngy: downsampled.ngy,
                ngz: downsampled.ngz,
                min: downsampled.min,
                max: downsampled.max,
                maxAbs: downsampled.maxAbs,
                normalizeByCellVolume,
                gz
            });
            if (volumetricCache.size > VOLUMETRIC_CACHE_MAX) {
                const firstKey = volumetricCache.keys().next().value;
                if (firstKey) volumetricCache.delete(firstKey);
            }
        }
        if (accept.includes('application/octet-stream')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('X-Volumetric-Ngx', String(downsampled.ngx));
            res.setHeader('X-Volumetric-Ngy', String(downsampled.ngy));
            res.setHeader('X-Volumetric-Ngz', String(downsampled.ngz));
            res.setHeader('X-Volumetric-Min', String(downsampled.min));
            res.setHeader('X-Volumetric-Max', String(downsampled.max));
            res.setHeader('X-Volumetric-MaxAbs', String(downsampled.maxAbs));
            res.setHeader('X-Volumetric-NormalizeByCellVolume', normalizeByCellVolume ? '1' : '0');
            res.setHeader('X-Volumetric-Format', 'f32-le');
            res.send(gz);
            return;
        }

        res.json({
            success: true,
            data: {
                ngx: downsampled.ngx,
                ngy: downsampled.ngy,
                ngz: downsampled.ngz,
                min: downsampled.min,
                max: downsampled.max,
                maxAbs: downsampled.maxAbs,
                normalizeByCellVolume,
                encoding: 'gzip-base64-f32',
                dataB64: gz.toString('base64')
            }
        });
    } catch (e) {
        const message = e?.message || 'Server failed to parse volumetric file';
        res.status(400).json({ error: message });
    } finally {
        fs.unlink(req.file.path, ()=>{});
    }
});

app.post('/api/parse-xdatcar', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = req.file.path;
    try {
        const result = await parseXDATCARStream(filePath);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ error: 'Failed to parse file', details: error.message });
    } finally {
        fs.unlink(filePath, () => {});
    }
});

// TEMP DEPLOY API - Upload dist tar and extract to nginx html dir
const deployUpload = multer({ dest: os.tmpdir() });
app.post('/api/deploy-static', deployUpload.single('dist'), async (req, res) => {
    const secret = req.headers['x-deploy-secret'];
    if (secret !== 'vasp_deploy_2026_secret') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file' });
    try {
        const { execSync } = require('child_process');
        const tarPath = req.file.path;
        // Extract to a temp location
        const extractDir = path.join(os.tmpdir(), 'vasp_dist_new');
        execSync(`rm -rf ${extractDir} && mkdir -p ${extractDir} && tar -xzf ${tarPath} -C ${extractDir}`);
        // Copy dist into the nginx container
        execSync(`docker cp ${extractDir}/dist/. vasp-visualizer-frontend-1:/usr/share/nginx/html/`);
        // Reload nginx
        execSync(`docker exec vasp-visualizer-frontend-1 nginx -s reload`);
        fs.unlink(tarPath, () => {});
        res.json({ ok: true, message: 'Deploy static done' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scientific Cover Agent — AI API Routes
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_BASE_URL   = process.env.GEMINI_BASE_URL   || 'https://api.aipaibox.com/v1';
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY    || '';
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

const { proxyAgent: _proxyAgent } = require('./src/proxy-agent');

const fetchWithTimeout = async (url, init, timeoutMs) => {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.pathname + parsed.search,
            method: init.method || 'GET',
            headers: init.headers || {},
        };
        if (_proxyAgent) options.agent = _proxyAgent;

        const timeoutId = setTimeout(() => {
            req.destroy();
            reject(new Error('Request timeout'));
        }, timeoutMs);

        const req = require('https').request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                clearTimeout(timeoutId);
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 400,
                    status: res.statusCode,
                    text: () => Promise.resolve(data),
                    json: () => Promise.resolve(JSON.parse(data)),
                });
            });
        });

        req.on('error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });

        if (init.body) req.write(init.body);
        req.end();
    });
};

// Helper: OpenAI-compatible chat completion (used for Gemini text model)
async function geminiChat(messages, jsonMode = false) {
    const body = {
        model: GEMINI_TEXT_MODEL,
        messages,
        temperature: 0.2,
    };
    if (jsonMode) {
        body.response_format = { type: 'json_object' };
    }

    let lastError = null;
    const MAX_RETRIES = 3;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const resp = await fetchWithTimeout(`${GEMINI_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GEMINI_API_KEY}`,
                },
                body: JSON.stringify(body),
            }, 120000); // Increased timeout to 120s

            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`Gemini API error ${resp.status}: ${errText}`);
            }

            const data = await resp.json();
            return data.choices?.[0]?.message?.content || '';
            
        } catch (e) {
            console.warn(`Gemini API attempt ${attempt}/${MAX_RETRIES} failed: ${e.message}`);
            lastError = e;
            if (e && (e.name === 'AbortError' || String(e).includes('aborted'))) {
                lastError = new Error('Gemini request timeout');
            }
            // Wait briefly before retry (1s, 2s, etc.)
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, attempt * 1000));
            }
        }
    }
    
    throw lastError || new Error('Gemini API failed after retries');
}

function safeJsonParse(s) {
    try {
        // 先尝试直接解析
        return JSON.parse(s);
    } catch {
        // 增加对特殊控制字符的过滤（gemini-3 有时会返回带特殊不可见字符的字符串）
        const clean = String(s || '')
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // 移除控制字符
            .trim();
            
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                // 递归清理匹配到的内容中的潜在非法字符
                const sanitizedJson = match[0].replace(/\\([^"\\\/bfnrtu])/g, '$1');
                return JSON.parse(sanitizedJson);
            } catch (e) {
                console.error("safeJsonParse match failed:", e.message);
                return null;
            }
        }
        return null;
    }
}

app.post('/api/agent/validate-image', async (req, res) => {
    try {
        const { imageDataUrl, requiredSpecies = [], strictChemistry = false } = req.body || {};
        const parsed = await validateRenderingImage({
            imageDataUrl,
            requiredSpecies,
            strictChemistry,
        });

        return res.json({ success: true, data: parsed });
    } catch (e) {
        const status = String(e.message || '').includes('imageDataUrl must be') ? 400 : 500;
        return res.status(status).json({ success: false, error: e.message });
    }
});

// ── Route 0: POST /api/agent/parse-pdf ───────────────────────────────────────
// Phase 1 (PDF variant): Extract text from PDF, then send to Gemini for entity extraction
app.post('/api/agent/parse-pdf', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
    }
    try {
        const { parsed } = await parseSciencePdfFile({ filePath: req.file.path });

        return res.json({ success: true, data: parsed });
    } catch (err) {
        console.error('[agent/parse-pdf]', err.message);
        const status = String(err.message || '').includes('Could not extract sufficient text from PDF')
            || String(err.message || '').includes('Unsupported pdf-parse module export')
            ? 400
            : 500;
        return res.status(status).json({ success: false, error: err.message });
    } finally {
        if (req.file) require('fs').unlink(req.file.path, () => {});
    }
});

// ── Route 1: POST /api/agent/parse-science ────────────────────────────────────
// Phase 1: Extract scientific entities from abstract/text using Gemini 2.0 Flash
app.post('/api/agent/parse-science', async (req, res) => {
    const { text } = req.body;
    if (!text || String(text).trim().length < 10) {
        return res.status(400).json({ success: false, error: 'Text too short (min 10 chars)' });
    }

    try {
        const parsed = await parseScienceText({ text });
        return res.json({ success: true, data: parsed });
    } catch (err) {
        console.error('[agent/parse-science]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── Route: POST /api/agent/retrieve ───────────────────────────────────────────
// Phase 1: Literature and MP search with SSE stream
app.post('/api/agent/retrieve', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendChunk = (data) => {
        res.write(`data: ${data}\n\n`);
    };

    try {
        await runRetrievalAgentStream(prompt, sendChunk);
    } catch (e) {
        sendChunk(JSON.stringify({ type: 'error', content: e.message }));
    } finally {
        res.end();
    }
});

// ── Route 2: POST /api/agent/generate-image ───────────────────────────────────
// Phase 5: Generate HD images
app.post('/api/agent/generate-image', async (req, res) => {
    const { prompt, numberOfImages = 1, aspectRatio = '9:16', strictNoText = false, strictChemistry = false, requiredSpecies = [], maxAttemptsPerImage = 2 } = req.body;
    if (!prompt || String(prompt).trim().length < 10) {
        return res.status(400).json({ success: false, error: 'Prompt too short' });
    }

    try {
        const images = await generateRenderingImages({
            prompt,
            numberOfImages,
            aspectRatio,
            strictNoText,
            strictChemistry,
            requiredSpecies,
            maxAttemptsPerImage,
        });

        return res.json({ success: true, images });
    } catch (err) {
        console.error('[agent/generate-image]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── Route: POST /api/video/generate ──────────────────────────────────────────
// Generate a single video clip via Seedance 2.0
const { createVideoTask, getVideoTaskStatus } = require('./src/video/seedance');
const { PROMO_SHOTS } = require('./src/video/promo-prompts');

app.post('/api/video/generate', async (req, res) => {
    const { prompt, duration = 8, ratio = '16:9' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    try {
        const result = await createVideoTask({ prompt, duration, ratio });
        res.json({ success: true, ...result });
    } catch (e) {
        console.error('[video/generate]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Route: GET /api/video/status/:taskId ─────────────────────────────────────
app.get('/api/video/status/:taskId', async (req, res) => {
    try {
        const result = await getVideoTaskStatus(req.params.taskId);
        res.json({ success: true, ...result });
    } catch (e) {
        console.error('[video/status]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Route: GET /api/video/promo-shots ────────────────────────────────────────
// Return the predefined promo storyboard shots
app.get('/api/video/promo-shots', (_req, res) => {
    res.json({ shots: PROMO_SHOTS });
});

// ── Route: POST /api/video/generate-promo ────────────────────────────────────
// Generate all promo shots in parallel
app.post('/api/video/generate-promo', async (req, res) => {
    try {
        const results = await Promise.allSettled(
            PROMO_SHOTS.map((shot) =>
                createVideoTask({ prompt: shot.prompt, duration: shot.duration, ratio: '16:9' })
                    .then((r) => ({ shotId: shot.id, ...r }))
            )
        );
        const tasks = results.map((r, i) => ({
            shotId: PROMO_SHOTS[i].id,
            label: PROMO_SHOTS[i].label,
            ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
        }));
        res.json({ success: true, tasks });
    } catch (e) {
        console.error('[video/generate-promo]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (runtimeWorkerRunner) {
        const status = runtimeWorkerRunner.start();
        console.log('[runtime-workers] started', status);
    }
});
