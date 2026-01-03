import http from 'http';
import https from 'https';
import url from 'url';
import fs from 'fs';

// Changed port to 5001 to avoid conflict with AirPlay Receiver (port 5000) on macOS
const PORT = 5001; 
const TARGET_HOST = 'smartoptions.trendlyne.com';

// Internal ID Map for the backend API endpoint
const ID_MAP = {
    'NIFTY': '1887',       // Correct NIFTY 50 ID
    'BANKNIFTY': '1889',   // Correct Bank Nifty ID (Usually)
    'FINNIFTY': '20374'
};

// --- CLI Argument Parsing ---
const args = process.argv.slice(2);
const isCliMode = args.length > 0;

if (isCliMode) {
    runCli(args);
} else {
    runServer();
}

// --- Server Logic ---
function runServer() {
    const server = http.createServer(async (req, res) => {
        // Handle CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        console.log(`[Server] Request: ${req.method} ${req.url}`);

        // --- CUSTOM API ENDPOINT FOR OTHER APPS ---
        if (req.url.startsWith('/api/option-chain')) {
            await handleApiRequest(req, res);
            return;
        }

        // --- PROXY LOGIC ---
        if (req.url.startsWith('/phoenix/api')) {
            try {
                const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
                proxyRequest(req, res, parsedUrl.pathname + parsedUrl.search);
            } catch (err) {
                console.error("[Proxy] URL Parse Error:", err);
                res.writeHead(400);
                res.end("Bad Request");
            }
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Endpoint not found. Use /api/option-chain?symbol=NIFTY or /phoenix/api/...' }));
        }
    });

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n=== NSE Option Chain Proxy & API ===`);
        console.log(`Frontend Proxy: http://localhost:${PORT}/phoenix/api`);
        console.log(`External API:   http://localhost:${PORT}/api/option-chain?symbol=NIFTY`);
        console.log(`Running on Port ${PORT}`);
        console.log(`====================================\n`);
    });
    
    server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            console.error(`\n[FATAL ERROR] Port ${PORT} is already in use.`);
            console.error(`If on macOS, Port 5000 is often used by AirPlay Receiver. We moved to 5001.`);
            console.error(`Check if another instance of 'node service.js' is running.\n`);
            process.exit(1);
        } else {
            console.error('[Fatal] Server error:', e);
        }
    });
}

// Handler for the composite API endpoint
async function handleApiRequest(req, res) {
    try {
        const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
        const symbol = parsedUrl.searchParams.get('symbol') || 'NIFTY';
        
        // 1. Get ID
        let stockId = ID_MAP[symbol.toUpperCase()];
        if (!stockId) {
            // Simplified fallback for custom endpoint: try known defaults or error
             res.writeHead(400, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify({ error: `Unknown symbol: ${symbol}` }));
             return;
        }

        // 2. Get Expiry using correct endpoint
        const expiryUrl = `https://${TARGET_HOST}/phoenix/api/search-contract-expiry-dates/?stock_pk=${stockId}`;
        const expiryData = await fetchJson(expiryUrl);
        const dates = expiryData?.body?.data?.all_exp_list || [];
        
        if (dates.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No expiry dates found' }));
            return;
        }
        
        const expiryDate = dates[0]; // Nearest

        // 3. Get Data
        // Use current time or end of day
        const now = new Date();
        let hours = now.getHours();
        let minutes = now.getMinutes();
        if (hours > 15 || (hours === 15 && minutes >= 30)) { hours = 15; minutes = 30; }
        if (hours < 9 || (hours === 9 && minutes < 15)) { hours = 15; minutes = 30; }
        
        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        const dataUrl = `https://${TARGET_HOST}/phoenix/api/live-oi-data/?stockId=${stockId}&expDateList=${expiryDate}&minTime=09:15&maxTime=${timeStr}&format=json`;
        const data = await fetchJson(dataUrl);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            symbol,
            stockId,
            expiryDate,
            timestamp: timeStr,
            data: data
        }));

    } catch (e) {
        console.error("[API Endpoint Error]", e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
    }
}

function proxyRequest(clientReq, clientRes, targetPath) {
    const options = {
        hostname: TARGET_HOST,
        port: 443,
        path: targetPath,
        method: clientReq.method,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json',
            'Host': TARGET_HOST
        }
    };

    const proxyReq = https.request(options, (proxyRes) => {
        const headers = { ...proxyRes.headers };
        headers['access-control-allow-origin'] = '*';
        
        clientRes.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(clientRes);
    });

    proxyReq.on('error', (e) => {
        console.error(`[Proxy Error] Upstream request failed: ${e.message}`);
        if (!clientRes.headersSent) {
            clientRes.writeHead(502, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({ error: 'Proxy Error', details: e.message }));
        }
    });

    clientReq.on('aborted', () => { proxyReq.abort(); });
    clientReq.pipe(proxyReq);
}

// --- CLI Logic ---
async function runCli(args) {
    console.log("Running in CLI Mode...");
    const symbolArg = args.find(a => a.startsWith('--symbol='));
    const symbol = symbolArg ? symbolArg.split('=')[1] : 'NIFTY';
    
    console.log(`Fetching data for ${symbol}...`);
    
    try {
        const stockId = ID_MAP[symbol.toUpperCase()]; 
        if (!stockId) throw new Error(`Stock ID not found for ${symbol}`);
        
        console.log(`Found Stock ID: ${stockId}`);
        
        const expiryData = await fetchJson(`https://${TARGET_HOST}/phoenix/api/search-contract-expiry-dates/?stock_pk=${stockId}`);
        const expiry = expiryData?.body?.data?.all_exp_list?.[0];
        
        if (!expiry) throw new Error("No expiry found");
        console.log(`Using Expiry: ${expiry}`);
        
        const timestamp = "15:30"; // End of day
        const dataUrl = `https://${TARGET_HOST}/phoenix/api/live-oi-data/?stockId=${stockId}&expDateList=${expiry}&minTime=09:15&maxTime=${timestamp}&format=json`;
        
        const data = await fetchJson(dataUrl);
        const fileName = `${symbol}_${expiry}_${Date.now()}.json`;
        fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
        
        console.log(`[Success] Data saved to ${fileName}`);
    } catch (e) {
        console.error("[Error]", e.message);
    }
}

function fetchJson(urlStr) {
    return new Promise((resolve, reject) => {
        https.get(urlStr, {
            headers: { 'User-Agent': 'Node.js CLI' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
            });
        }).on('error', reject);
    });
}
