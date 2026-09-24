// PROTOTYPE, THROWAWAY. Lives on branch prototype/ring-widget, never on main.
// Question: does the Ring Widget work on a static host with no server, and how
// should it behave at the ring's ends and when a Member is removed?
//
//   node prototype/ring-widget/ring.mjs                   build + serve 5 fake Members
//   node prototype/ring-widget/ring.mjs --remove kevin-tran   same ring after a removal
//   node prototype/ring-widget/ring.mjs --only obinna-eze     a ring of one
//
// Then open http://localhost:8000/sites/ (fake Member Sites carrying the widget)
// and http://localhost:8000/eagle-ring/ (ring index).
//
// dist/ mimics what Astro would emit with build.format 'file' + trailingSlash 'never'
// under base '/eagle-ring'. serve() mimics GitHub Pages: /x serves x.html, /dir 301s
// to /dir/, anything missing gets 404.html with status 404.

import { mkdirSync, rmSync, writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 8000;
const ORIGIN = `http://localhost:${PORT}`;
const BASE = `${ORIGIN}/eagle-ring`; // production: https://jpierre-7.github.io/eagle-ring
const DIST = join(dirname(fileURLToPath(import.meta.url)), "dist");

// FAKE Members. Sites point at fake Member Sites this script also serves.
const ALL = ["obinna-eze", "kevin-tran", "aaliyah-brooks", "priya-raman", "lupe-garza"].map(slug => ({
  slug,
  name: slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" "),
  site: `${ORIGIN}/sites/${slug}/`,
}));

const args = process.argv.slice(2);
const removed = args.flatMap((a, i) => a === "--remove" ? [args[i + 1]] : []);
const only = args.flatMap((a, i) => a === "--only" ? [args[i + 1]] : []);
const members = ALL
  .filter(m => !removed.includes(m.slug) && (!only.length || only.includes(m.slug)))
  .sort((a, b) => a.slug.localeCompare(b.slug)); // ring order: alphabetical by slug, wraps at the ends

// Neighbours, computed at build time. A ring of one sends prev/next to the Directory.
function neighbours(i) {
  const n = members.length;
  if (n === 1) return { prev: `${BASE}/`, next: `${BASE}/` };
  return { prev: members[(i - 1 + n) % n].site, next: members[(i + 1) % n].site };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const redirectPage = (label, url) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Eagle Ring: ${label}</title>
<meta name="robots" content="noindex"><link rel="canonical" href="${esc(url)}">
<meta http-equiv="refresh" content="0;url=${esc(url)}"></head>
<body><p>Going to the ${label} Site in Eagle Ring: <a href="${esc(url)}">${esc(url)}</a></p></body></html>
`;

// The paste-in snippet: plain links, no script. Each Member pastes it with their own slug.
const snippet = slug => `<nav class="eagle-ring" aria-label="Eagle Ring webring">
  <a href="${BASE}/ring/${slug}/prev">&larr; Previous</a>
  <a href="${BASE}/">Eagle Ring</a>
  <a href="${BASE}/ring/random?from=${slug}">Random</a>
  <a href="${BASE}/ring/${slug}/next">Next &rarr;</a>
</nav>`;

const write = (path, body) => { mkdirSync(dirname(join(DIST, path)), { recursive: true }); writeFileSync(join(DIST, path), body); };

function build() {
  rmSync(DIST, { recursive: true, force: true });
  const ring = members.map(m => ({ slug: m.slug, site: m.site }));

  members.forEach((m, i) => {
    const { prev, next } = neighbours(i);
    write(`eagle-ring/ring/${m.slug}/prev.html`, redirectPage("previous", prev));
    write(`eagle-ring/ring/${m.slug}/next.html`, redirectPage("next", next));
  });

  // Random: the one page that needs JS. Excludes the Member you came from.
  write("eagle-ring/ring/random.html", `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Eagle Ring: random Site</title><meta name="robots" content="noindex"></head>
<body><noscript><p>Random needs JavaScript. <a href="${BASE}/">Browse the Directory</a> instead.</p></noscript>
<script>
const ring = ${JSON.stringify(ring)};
const from = new URLSearchParams(location.search).get("from");
const pool = ring.filter(m => m.slug !== from);
location.replace(pool.length ? pool[Math.floor(Math.random() * pool.length)].site : "${BASE}/");
</script></body></html>
`);

  // 404: a removed Member's stale widget still moves the visitor around the ring,
  // using the removed slug's alphabetical position. Anything else goes to the Directory.
  write("eagle-ring/404.html", `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Eagle Ring: not found</title><meta name="robots" content="noindex"></head>
<body><p>This page isn't in Eagle Ring. <a href="${BASE}/">Go to the Directory</a>.</p>
<script>
const ring = ${JSON.stringify(ring)};
const m = location.pathname.match(/\\/ring\\/([a-z0-9-]+)\\/(prev|next)$/);
if (m && ring.length) {
  let i = ring.findIndex(r => r.slug.localeCompare(m[1]) > 0); // first Member after the removed slug
  if (i === -1) i = 0;
  const target = m[2] === "next" ? ring[i] : ring[(i - 1 + ring.length) % ring.length];
  location.replace(target.site);
}
</script></body></html>
`);

  // Ring index (stands in for the Directory): ring order plus each Member's neighbours.
  write("eagle-ring/index.html", `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Eagle Ring (prototype)</title>
<style>body{font:16px/1.5 system-ui;margin:2rem;max-width:60rem}td,th{padding:.3rem .8rem;text-align:left;border-bottom:1px solid #ddd}code{font-size:.85em}</style></head>
<body><h1>Eagle Ring ring index (prototype)</h1>
<p>${members.length} Members, alphabetical by slug, wrapping at the ends.${removed.length ? ` Removed this build: <code>${removed.join(", ")}</code>.` : ""}</p>
<table><tr><th>#</th><th>Member</th><th>prev goes to</th><th>next goes to</th></tr>
${members.map((m, i) => { const { prev, next } = neighbours(i); return `<tr><td>${i + 1}</td><td><a href="${m.site}">${m.name}</a></td><td><code>${prev.replace(ORIGIN, "")}</code></td><td><code>${next.replace(ORIGIN, "")}</code></td></tr>`; }).join("\n")}
</table><p><a href="${ORIGIN}/sites/">All fake Member Sites</a></p></body></html>
`);

  // Fake Member Sites, including removed ones: their widgets are still pasted in.
  ALL.forEach(m => write(`sites/${m.slug}/index.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${m.name}</title>
<style>body{font:18px/1.5 Georgia,serif;margin:3rem;max-width:40rem}.eagle-ring{margin-top:3rem;display:flex;gap:1rem;flex-wrap:wrap}pre{background:#f4f4f4;padding:1rem;overflow:auto;font-size:13px}</style></head>
<body><h1>${m.name}'s Site</h1>
<p>A fake Member Site.${members.some(x => x.slug === m.slug) ? "" : " <strong>Removed from the ring this build</strong>, but the widget below is still pasted in."}</p>
${snippet(m.slug)}
<h2>What this Member pasted</h2><pre>${esc(snippet(m.slug))}</pre></body></html>
`));
  write("sites/index.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake Member Sites</title></head>
<body style="font:16px system-ui;margin:2rem"><h1>Fake Member Sites</h1><ul>${ALL.map(m => `<li><a href="/sites/${m.slug}/">${m.name}</a>${removed.includes(m.slug) ? " (removed)" : ""}</li>`).join("")}</ul>
<p><a href="/eagle-ring/">Ring index</a></p></body></html>
`);

  console.log(`Ring (${members.length}):`);
  members.forEach((m, i) => { const { prev, next } = neighbours(i); console.log(`  ${m.slug.padEnd(16)} prev -> ${prev.replace(ORIGIN, "").padEnd(26)} next -> ${next.replace(ORIGIN, "")}`); });
  if (removed.length) console.log(`Removed: ${removed.join(", ")} (their widget links fall through to 404.html)`);
}

const TYPES = { ".html": "text/html; charset=utf-8" };
function serve() {
  createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
    const file = join(DIST, path);
    const send = (status, f) => { res.writeHead(status, { "content-type": TYPES[extname(f)] || "text/plain" }); res.end(readFileSync(f)); };
    if (existsSync(file) && statSync(file).isFile()) return send(200, file);
    if (existsSync(file + ".html")) return send(200, file + ".html");
    if (existsSync(join(file, "index.html"))) {
      if (!path.endsWith("/")) { res.writeHead(301, { location: path + "/" }); return res.end(); }
      return send(200, join(file, "index.html"));
    }
    const notFound = join(DIST, "eagle-ring/404.html");
    if (path.startsWith("/eagle-ring/") && existsSync(notFound)) return send(404, notFound);
    res.writeHead(404); res.end("not found");
  }).listen(PORT, () => console.log(`\nServing like GitHub Pages at ${ORIGIN}/sites/ and ${BASE}/`));
}

build();
if (!args.includes("--build-only")) serve();
