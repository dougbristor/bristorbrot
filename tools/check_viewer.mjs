// check_viewer.mjs: serve a built viewer pack on a private port, run its window.__viewer.check() headless,
// once as shipped and once per fault (?fault=<name>). Prints one JSON line; build_pack.py judges it.
//   node tools/check_viewer.mjs <pack-folder> <fault,fault,...>
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('check_viewer: playwright not found — run `npm i playwright`'); process.exit(2); }

const root = process.argv[2];
const FAULTS = (process.argv[3] || '').split(',').filter(Boolean);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glsl': 'text/plain' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(root, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;

const launch = { headless: true, args: ['--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'] };
const browser = await chromium.launch({ ...launch, channel: 'chrome' }).catch(() => chromium.launch(launch));
const errors = [];

async function run(query) {
  const page = await browser.newPage({ viewport: { width: 920, height: 600 } });
  page.on('pageerror', e => errors.push(`${query || 'shipped'}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${query || 'shipped'}: ${m.text()}`); });
  await page.goto(base + 'index.html' + query);
  await page.waitForFunction(() => window.__viewer?.ready, null, { timeout: 60000 });
  const result = await page.evaluate(() => window.__viewer.check());
  await page.close();
  return result;
}

try {
  const shipped = await run(''), faults = {};
  for (const f of FAULTS) faults[f] = await run(`?fault=${f}`);
  console.log(JSON.stringify({ shipped, faults, errors }));
} catch (e) {
  console.log(JSON.stringify({ shipped: { ok: false, lines: [String(e.message || e)] }, faults: {}, errors }));
} finally {
  await browser.close();
  server.close();
}
