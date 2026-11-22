#!/usr/bin/env node
/**
 * Sosyal medya tanıtım kareleri ve kısa video.
 *
 * Uygulamanın arayüzü burada yeniden ÇİZİLMEZ: kareler `docs/screenshots/`
 * altındaki gerçek ekran görüntülerini kullanır. Taklit edilen bir arayüz,
 * uygulama değiştikçe sessizce yalan söylemeye başlar (sitenin kart
 * düzeneğinde bir kez yaşandı, bkz. ../../alaturkavakitler/brand/social).
 *
 * Çizim headless Chromium'da yapılır; yazı tipi siteyle aynıdır
 * (Inter Tight). Çıktılar `brand/out/` altına düşer:
 *
 *   masaustu-1-1080x1350.jpg   Instagram gönderisi (4:5)
 *   masaustu-2-1080x1920.jpg   Instagram story
 *   masaustu-tanitim.mp4       ~12 sn, 1080×1350
 *
 *   node brand/tanitim.mjs
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SHOTS = join(ROOT, 'docs', 'screenshots')
const OUT = join(HERE, 'out')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── Metinler ──
   Üç deponun bütün tanıtım yazıları TEK dosyada duruyor
   (`alaturkavakitler/brand/social/metinler.txt`); orada düzeltilen bir
   cümle için burayı açmak gerekmiyor. Yol ortamdan verilebilir, çünkü
   depolar yan yana olmayabilir:

     METINLER=/yol/metinler.txt node brand/tanitim.mjs

   Dosya bulunamazsa aşağıdaki yedek metinlerle basılır ve uyarılır. */
function readMetin(file) {
  const out = {}
  let key = null
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const head = line.match(/^\[([^\]]+)\]$/)
    if (head) { key = head[1].includes('/') ? head[1] : null; if (key) out[key] = {}; continue }
    const eq = line.indexOf('=')
    if (eq === -1 || !key) continue
    out[key][line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}

const METIN_FILE = process.env.METINLER
  ?? join(ROOT, '..', 'alaturkavakitler', 'brand', 'social', 'metinler.txt')
const METIN = existsSync(METIN_FILE) ? readMetin(METIN_FILE) : {}
if (!Object.keys(METIN).length) console.warn('! metinler.txt okunamadı:', METIN_FILE)

/** Dosyadaki yazıyı alır, yoksa yedeği bırakır. */
const txt = (key, def) => {
  const m = METIN[key]
  if (!m) return def
  return {
    ...def,
    eyebrow: m.ustbaslik ?? def.eyebrow,
    title: [m.baslik1 ?? def.title[0], m.baslik2 ?? def.title[1]],
    deck: m.aciklama ?? def.deck,
  }
}

/* ── Kareler ──
   Metin kuralı için bkz. `metinler.txt` yanındaki `METIN.md`. */
const CARDS = [
  txt('masaustu/kart1', {
    file: 'masaustu-1-1080x1350.jpg', w: 1080, h: 1350,
    shot: 'clock.png',
    eyebrow: 'Linux masaüstü uygulaması',
    title: ['Masaüstünüzde de', 'aynı saat'],
    deck: 'Tarayıcı açmadan vakte bakarsınız. Uygulama GTK4 ile yazıldı, sisteminizin temasına uyar.',
    accent: '#0491fb', grad: '#0a3f70',
  }),
  txt('masaustu/kart2', {
    file: 'masaustu-2-1080x1920.jpg', w: 1080, h: 1920,
    shot: 'times.png',
    eyebrow: 'Linux masaüstü uygulaması',
    title: ['Vakit girmeden', 'bildirim alırsınız'],
    deck: 'Hatırlatma sistem bildirimi olarak gelir. İnternet kesilse de o günün vakitleri yerinde durur.',
    accent: '#ff8c33', grad: '#7a3a10',
  }),
]

/* Videonun sahneleri: yalnızca ekran görüntüleri.
   Önce her sahnenin altında bir cümle vardı; kaldırıldı, çünkü on üç
   saniyede beş ayrı cümle okunmuyor ve kartlarda zaten aynı şeyler
   yazıyor. Kalan tek yazı alttaki künye. */
const FILM = ['clock.png', 'times.png', 'calendar-hijri.png', 'clock-light.png', 'settings.png']
const FILM_ALT = METIN['masaustu/film']?.alt ?? 'Alaturka Vakitler · Linux masaüstü uygulaması'
const FILM_W = 1080
const FILM_H = 1350
const SCENE_MS = 2600
const FPS = 30

/* ── Küçük sunucu: yazı tipi ve görüntüler aynı kökenden gelsin ── */
const PORT = 8471
const TYPES = { '.png': 'image/png', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8' }
let pageHtml = ''
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/card.html') {
    res.writeHead(200, { 'content-type': TYPES['.html'] })
    res.end(pageHtml)
    return
  }
  const base = url.pathname.startsWith('/fonts/') ? HERE : SHOTS
  const p = join(base, url.pathname.replace('/fonts/', ''))
  if (!existsSync(p)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': TYPES[p.slice(p.lastIndexOf('.'))] ?? 'application/octet-stream' })
  createReadStream(p).pipe(res)
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${PORT}`

/* ── Chromium ── */
const CDP_PORT = 9417
const PROFILE = join(tmpdir(), `dt-shots-${process.pid}`)
await rm(PROFILE, { recursive: true, force: true })
const BIN = ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser']
  .find((b) => existsSync(b))
if (!BIN) { console.error('Chromium bulunamadı.'); process.exit(1) }
const chrome = spawn(BIN, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
  '--hide-scrollbars', '--no-first-run', `--user-data-dir=${PROFILE}`,
  '--force-color-profile=srgb', '--disable-lcd-text', 'about:blank',
], { stdio: 'ignore' })

async function firstPage() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
      const p = list.find((t) => t.type === 'page')
      if (p) return p
    } catch { /* henüz açılmadı */ }
    await sleep(250)
  }
  throw new Error('Chromium bağlantısı kurulamadı')
}
const page = await firstPage()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let msgId = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res) => {
  const id = ++msgId
  pending.set(id, res)
  ws.send(JSON.stringify({ id, method, params }))
})
await send('Page.enable')
await mkdir(OUT, { recursive: true })

const viewport = (w, h) =>
  send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })

const evaluate = (expr) => send('Runtime.evaluate', { expression: expr, awaitPromise: true })

async function capture(file, format = 'jpeg') {
  const r = await send('Page.captureScreenshot', { format, quality: 92, captureBeyondViewport: false })
  await writeFile(join(OUT, file), Buffer.from(r.result.data, 'base64'))
}

/* ── Kart şablonu ──
   Tipografi siteyle aynı dilde: dar bir üst etiket, iki satırlık başlık
   (ikinci satır aksan renginde), altında tek paragraf. Ekran görüntüsü
   yuvarlatılmış bir pencere gibi durur; altındaki gölge onu zeminden
   ayırır, çerçeve çizilmez.

   Görüntü kutusunda `min-height: 0` şart: flex öğesi varsayılan olarak
   içeriğinden küçülmüyor ve kare ekran görüntüsü kutuyu taşırıp alttaki
   künye satırını kadrajın dışına itiyordu (ölçüldü). Görüntünün boyu da
   `max-height` ile sınırlanır. */
function html(c, uri) {
  /* Punto metne uyar, metin puntoya değil: başlık ya da açıklama
     uzadığında kademe kademe küçülür. Kademeli, çünkü sürekli bir oran
     küçük farklarda kartları birbirinden ayırıyor. */
  const longest = Math.max(...c.title.map((x) => x.length))
  const titleK = longest <= 14 ? 1 : longest <= 20 ? 0.84 : longest <= 27 ? 0.68 : 0.56
  const deckK = c.deck.length <= 90 ? 1 : c.deck.length <= 140 ? 0.9 : c.deck.length <= 190 ? 0.82 : 0.74
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
@font-face{font-family:'Inter Tight';font-weight:200 700;font-display:block;
  src:url('/fonts/inter-tight-latin.woff2') format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,
    U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}
@font-face{font-family:'Inter Tight';font-weight:200 700;font-display:block;
  src:url('/fonts/inter-tight-latin-ext.woff2') format('woff2');
  unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,
    U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,
    U+2113,U+2C60-2C7F,U+A720-A7FF;}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${c.w}px;height:${c.h}px}
body{
  font-family:'Inter Tight',sans-serif;color:#fff;
  background:radial-gradient(130% 90% at 50% 0%, ${c.grad} 0%, #0b0b0d 62%);
  display:flex;flex-direction:column;justify-content:space-between;
  padding:${Math.round(c.w * 0.08)}px;
}
.eyebrow{font-size:${Math.round(c.w * 0.0195)}px;font-weight:500;letter-spacing:.2em;
  text-transform:uppercase;color:${c.accent};}
h1{font-size:${Math.round(c.w * (c.h > 1500 ? 0.098 : 0.086) * titleK)}px;font-weight:600;
  line-height:1.03;letter-spacing:-.035em;margin-top:${Math.round(c.w * 0.03)}px;}
h1 em{font-style:normal;color:${c.accent};display:block}
p{font-size:${Math.round(c.w * 0.0285 * deckK)}px;font-weight:300;line-height:1.5;
  color:rgba(255,255,255,.72);max-width:${Math.round(c.w * 0.82)}px;
  margin-top:${Math.round(c.w * 0.028)}px;}
.shotwrap{display:flex;justify-content:center;align-items:center;flex:1;
  min-height:0;margin:${Math.round(c.w * 0.05)}px 0;}
img{width:${Math.round(c.w * (c.h > 1500 ? 0.86 : 0.76))}px;max-width:100%;max-height:100%;height:auto;
  object-fit:contain;border-radius:${Math.round(c.w * 0.022)}px;
  box-shadow:0 ${Math.round(c.w * 0.035)}px ${Math.round(c.w * 0.09)}px rgba(0,0,0,.6);}
footer{display:flex;align-items:baseline;gap:.6em;
  font-size:${Math.round(c.w * 0.024)}px;font-weight:400;color:rgba(255,255,255,.55)}
footer b{font-weight:600;color:#fff}
</style></head><body>
<div>
  <div class="eyebrow">${c.eyebrow}</div>
  <h1>${c.title[0]}<em>${c.title[1]}</em></h1>
  <p>${c.deck}</p>
</div>
<div class="shotwrap"><img src="${uri}" alt=""></div>
<footer><b>Alaturka Vakitler</b> alaturkavakitler.com</footer>
</body></html>`
}

/* ── Kareler ── */
for (const c of CARDS) {
  pageHtml = html(c, `/${c.shot}`)
  await viewport(c.w, c.h)
  await send('Page.navigate', { url: `${BASE}/card.html?v=${Date.now()}` })
  await sleep(900)
  await evaluate('document.fonts.ready')
  await sleep(250)
  await capture(c.file)
  console.log('✓', c.file)
}

/* ── Video ──
   Sahneler tek bir belgede duruyor ve kare başına `window.__film(t)` ile
   sürülüyor: ffmpeg'e hazır kareler verilince geçiş süzgecine gerek
   kalmıyor ve süre tam oturuyor (bir kez `zoompan` ile denendi, girdi
   karesi başına kare çarpıp 19 saniyelik film 9 dakika çıktı). */
const TOTAL = FILM.length * SCENE_MS
pageHtml = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
@font-face{font-family:'Inter Tight';font-weight:200 700;font-display:block;
  src:url('/fonts/inter-tight-latin.woff2') format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,
    U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}
@font-face{font-family:'Inter Tight';font-weight:200 700;font-display:block;
  src:url('/fonts/inter-tight-latin-ext.woff2') format('woff2');
  unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,
    U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,
    U+2113,U+2C60-2C7F,U+A720-A7FF;}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${FILM_W}px;height:${FILM_H}px;overflow:hidden}
body{font-family:'Inter Tight',sans-serif;color:#fff;
  background:radial-gradient(130% 90% at 50% 0%,#0a3f70 0%,#0b0b0d 62%);}
.scene{position:absolute;inset:0;display:flex;flex-direction:column;
  justify-content:center;align-items:center;gap:52px;opacity:0;padding:86px}
.scene img{width:760px;border-radius:24px;box-shadow:0 38px 96px rgba(0,0,0,.6)}
.scene span{font-size:33px;font-weight:300;line-height:1.45;text-align:center;
  color:rgba(255,255,255,.82)}
footer{position:absolute;left:0;right:0;bottom:46px;text-align:center;
  font-size:25px;color:rgba(255,255,255,.5)}
footer b{font-weight:600;color:#fff}
</style></head><body>
${FILM.map((shot, i) => `<div class="scene" id="s${i}"><img src="/${shot}" alt=""></div>`).join('')}
<footer>${FILM_ALT}</footer>
<script>
const N=${FILM.length}, D=${SCENE_MS}, FADE=420
window.__film=(t)=>{
  for(let i=0;i<N;i++){
    const el=document.getElementById('s'+i)
    const a=i*D, local=t-a
    let o=0, y=0
    if(local>-FADE && local<D+FADE){
      // Giriş ve çıkış aynı süreyi paylaşır; sahneler birbirinin üstünde
      // erir, aralarında siyah bir boşluk kalmaz.
      o = local<FADE ? Math.max(0,local/FADE) : (local>D-FADE ? Math.max(0,(D-local)/FADE) : 1)
      y = (1-Math.min(1,Math.max(0,local/D)))*14 - 7
    }
    el.style.opacity=o
    el.style.transform='translateY('+y.toFixed(2)+'px)'
  }
}
window.__film(0)
</script></body></html>`

await viewport(FILM_W, FILM_H)
await send('Page.navigate', { url: `${BASE}/card.html?v=${Date.now()}` })
await sleep(1000)
await evaluate('document.fonts.ready')

const FRAMES = join(tmpdir(), `dt-film-${process.pid}`)
await mkdir(FRAMES, { recursive: true })
const frameCount = Math.round((TOTAL / 1000) * FPS)
for (let i = 0; i < frameCount; i++) {
  await evaluate(`window.__film(${Math.round((i / FPS) * 1000)})`)
  const r = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(FRAMES, String(i).padStart(5, '0') + '.png'), Buffer.from(r.result.data, 'base64'))
}
console.log(`· ${frameCount} kare alındı`)

await new Promise((res, rej) => {
  const ff = spawn('ffmpeg', [
    '-y', '-framerate', String(FPS), '-i', join(FRAMES, '%05d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow',
    join(OUT, 'masaustu-tanitim.mp4'),
  ], { stdio: 'ignore' })
  ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c))))
})
console.log('✓ masaustu-tanitim.mp4')

await rm(FRAMES, { recursive: true, force: true })
ws.close()
chrome.kill()
server.close()
// Chromium profilini hemen silmek yarışa giriyor (tarayıcı hâlâ
// yazarken `ENOTEMPTY`); kapanması beklenir, olmazsa geçici dizin
// sistemde kalır — hata vermeye değmez.
await sleep(600)
await rm(PROFILE, { recursive: true, force: true }).catch(() => {})
console.log('→', OUT)
