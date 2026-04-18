/* ===== SEO/GEO Backlog – Data + Handlers ===== */

const SEO_TOPICS = [
  {id:1,topic:"Social Media Automation Tools",type:"Landing",api:"LP API (solutions)",markets:["US","DE"],loc:"EN → DE",signal:"SV 1.3k, CPC $8.42, KD 37"},
  {id:2,topic:"Social Media Scheduler",type:"Landing",api:"LP API (solutions)",markets:["US","UK"],loc:"EN first",signal:"SV 3.6k, CPC $7.95"},
  {id:3,topic:"Social Media Management Software",type:"Landing",api:"LP API (solutions)",markets:["US"],loc:"EN first",signal:"SV 2.9k, CPC $8.73, KD 59"},
  {id:4,topic:"Social Media Management Tools",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"SV 9.9k, CPC $9.21, KD 90"},
  {id:5,topic:"Social Media Posting Tool",type:"Landing",api:"LP API (solutions)",markets:["US"],loc:"EN first",signal:"CPC $10.90, KD 71"},
  {id:6,topic:"Social Media Publishing Tool",type:"Landing",api:"LP API (solutions)",markets:["US"],loc:"EN first",signal:"CPC $9.71, KD 44"},
  {id:7,topic:"Social Media Calendar",type:"Landing",api:"LP API (solutions)",markets:["US","DE"],loc:"EN → DE",signal:"SV 4.4k, CPC $7.05"},
  {id:8,topic:"Social Media Calendar Template",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"SV 2.4k, CPC $5.35, KD 54"},
  {id:9,topic:"Content Calendar Software",type:"Landing",api:"LP API (solutions)",markets:["US"],loc:"EN first",signal:"CPC $11.91, KD 37"},
  {id:10,topic:"Content Calendar Template",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"SV 3.6k, CPC $5.09, KD 64"},
  {id:11,topic:"Social Media Analytics Tools",type:"Landing",api:"LP API (solutions)",markets:["US","UK"],loc:"EN first",signal:"SV 3.6k, CPC $11.04, KD 54"},
  {id:12,topic:"Social Media Analytics Software",type:"Landing",api:"LP API (solutions)",markets:["US"],loc:"EN first",signal:"CPC $19.58, KD 48"},
  {id:13,topic:"Social Media Competitor Analysis Tools",type:"Landing",api:"LP API (solutions)",markets:["US"],loc:"EN first",signal:"CPC $31.25, KD 20"},
  {id:14,topic:"Social Media Reporting Tool",type:"Landing",api:"LP API (solutions)",markets:["US"],loc:"EN first",signal:"CPC $22.80, KD 43"},
  {id:15,topic:"White Label Social Media Reports",type:"Landing",api:"LP API (solutions)",markets:["US"],loc:"EN first",signal:"Low SV, product proof"},
  {id:16,topic:"Social Media Approval Workflow",type:"Landing",api:"LP API (workflows)",markets:["US"],loc:"EN first",signal:"Low SV, KD 0, B2B"},
  {id:17,topic:"Social Media Collaboration Tool",type:"Landing",api:"LP API (solutions)",markets:["US"],loc:"EN first",signal:"CPC $8.21, KD 0"},
  {id:18,topic:"Social Media Workflow Tool",type:"Landing",api:"LP API (workflows)",markets:["US"],loc:"EN first",signal:"KD 0, proof page"},
  {id:19,topic:"Social Media Tools For Small Business",type:"Blog",api:"LP API (solutions)",markets:["US"],loc:"EN first",signal:"CPC $6.86, KD 39"},
  {id:20,topic:"Social Media Tools For Agencies",type:"Blog",api:"LP API (solutions)",markets:["US"],loc:"EN first",signal:"CPC $12.38, KD 29"},
  {id:21,topic:"Best Time To Post On Instagram",type:"Landing",api:"LP API (best-time-to-post)",markets:["US","ES"],loc:"EN → ES",signal:"SV 60.5k, CPC $1.07, KD 27"},
  {id:22,topic:"Best Day To Post On Instagram",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"SV 14.8k, KD 31"},
  {id:23,topic:"Instagram Posting Schedule",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"CPC $4.42, KD 30"},
  {id:24,topic:"Best Time To Post On TikTok",type:"Landing",api:"LP API (best-time-to-post)",markets:["US","UK"],loc:"EN first",signal:"SV 60.5k, CPC $1.36, KD 44"},
  {id:25,topic:"TikTok Posting Schedule",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"CPC $4.48, KD 33"},
  {id:26,topic:"Best Time To Post On Facebook",type:"Landing",api:"LP API (best-time-to-post)",markets:["US"],loc:"EN first",signal:"SV 6.6k, CPC $1.13, KD 24"},
  {id:27,topic:"Best Time To Post On LinkedIn",type:"Landing",api:"LP API (best-time-to-post)",markets:["US"],loc:"EN first",signal:"SV 5.4k, CPC $1.93, KD 45"},
  {id:28,topic:"Best Time To Post On YouTube",type:"Landing",api:"LP API (best-time-to-post)",markets:["US"],loc:"EN first",signal:"SV 3.6k, KD 42"},
  {id:29,topic:"Best Time To Post On Pinterest",type:"Landing",api:"LP API (best-time-to-post)",markets:["US"],loc:"EN first",signal:"KD 17, CPC $1.66"},
  {id:30,topic:"Best Time To Post On Threads",type:"Landing",api:"LP API (best-time-to-post)",markets:["US"],loc:"EN first",signal:"KD 23"},
  {id:31,topic:"Cross-Platform Posting Schedule",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"SV 1.6k, CPC $6.48, KD 75"},
  {id:32,topic:"Social Media Content Calendar Template",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"SV 1.3k, CPC $5.66, KD 53"},
  {id:33,topic:"Instagram Video Downloader",type:"Tool",api:"Tool content (code)",markets:["US","DE","FR","ES","BR"],loc:"EN → DE FR ES BR",signal:"US SV 201k, DE 49.5k, ES 246k, BR 1.22M"},
  {id:34,topic:"Instagram Reels Downloader",type:"Tool",api:"Tool content (code)",markets:["US","DE","ES"],loc:"EN → DE ES",signal:"US SV 74k, KD 46"},
  {id:35,topic:"Facebook Video Downloader",type:"Tool",api:"Tool content (code)",markets:["DE","FR","US","BR"],loc:"EN → DE FR BR",signal:"US SV 135k, DE 60.5k, FR 40.5k"},
  {id:36,topic:"LinkedIn Video Downloader",type:"Tool",api:"Tool content (code)",markets:["US","DE","FR","ES"],loc:"EN → DE FR ES",signal:"US SV 2.4k"},
  {id:37,topic:"Threads Video Downloader",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"Early rankings US/NL/AU"},
  {id:38,topic:"TikTok Video Downloader",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"Existing tool cluster"},
  {id:39,topic:"YouTube Shorts Downloader",type:"Tool",api:"Tool content (code)",markets:["US","FR"],loc:"EN → FR",signal:"FR ranking signal"},
  {id:40,topic:"YouTube Video Downloader",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"Schema issue noted"},
  {id:41,topic:"Instagram Caption Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 8.1k, KD 62"},
  {id:42,topic:"TikTok Caption Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 720, CPC $2.95, KD 27"},
  {id:43,topic:"AI Caption Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 6.6k, KD 72"},
  {id:44,topic:"Social Media Post Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 1k, CPC $4.34, KD 44"},
  {id:45,topic:"LinkedIn Post Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 880, CPC $3.10, KD 35"},
  {id:46,topic:"Facebook Post Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 1.3k, CPC $2.13, KD 39"},
  {id:47,topic:"Instagram Hashtag Generator",type:"Tool",api:"Tool content (code)",markets:["US","DE"],loc:"EN → DE",signal:"SV 2.4k, KD 71"},
  {id:48,topic:"TikTok Hashtag Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 2.9k, KD 45"},
  {id:49,topic:"Hashtag Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 9.9k, KD 66"},
  {id:50,topic:"YouTube Tag Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 5.4k, KD 43"},
  {id:51,topic:"YouTube Title Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 2.9k, KD 39"},
  {id:52,topic:"YouTube Description Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 2.9k, KD 49"},
  {id:53,topic:"TikTok Script Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"CPC $2.47, KD 25"},
  {id:54,topic:"Video Script Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"CPC $1.36, KD 61"},
  {id:55,topic:"Hook Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 1.3k, KD 39"},
  {id:56,topic:"Instagram Bio Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 2.9k, KD 25"},
  {id:57,topic:"Username Generator",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"SV 90.5k, KD 47"},
  {id:58,topic:"Instagram Grid Maker",type:"Tool",api:"Tool content (code)",markets:["US","DE"],loc:"EN → DE",signal:"SV 2.9k, CPC $1.29, KD 28"},
  {id:59,topic:"Instagram Carousel Maker",type:"Tool",api:"Tool content (code)",markets:["US"],loc:"EN first",signal:"Validate before build"},
  {id:60,topic:"Social Media Content Ideas",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"SV 880, CPC $1.97, KD 13"},
  {id:61,topic:"Buffer Alternative",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"CPC $6.44, KD 32"},
  {id:62,topic:"Hootsuite Alternative",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"SV 390, CPC $6.29, KD 31"},
  {id:63,topic:"Later Alternative",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"CPC $6.55, KD 13"},
  {id:64,topic:"Metricool Alternative",type:"Compare",api:"LP API (compare)",markets:["US","ES","DE"],loc:"EN → ES DE",signal:"CPC $6.54, KD 20"},
  {id:65,topic:"Sprout Social Alternative",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"SV 210, CPC $19.74, KD 27"},
  {id:66,topic:"Publer Alternative",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"KD 0, CPC $3.95"},
  {id:67,topic:"SocialBee Alternative",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"KD 0, CPC $4.58"},
  {id:68,topic:"Loomly Alternative",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"KD 6, CPC $8.79"},
  {id:69,topic:"Planoly Alternative",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"KD 8, CPC $4.35"},
  {id:70,topic:"Sendible Alternative",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"CPC $14.56, KD 0"},
  {id:71,topic:"Agorapulse Alternative",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"CPC $14.12, KD 0"},
  {id:72,topic:"Best Buffer Alternatives",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"KD 0"},
  {id:73,topic:"Best Hootsuite Alternatives",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"KD 33"},
  {id:74,topic:"Best Later Alternatives",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"KD 0"},
  {id:75,topic:"Buffer vs Hootsuite",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"SV 720, CPC $4.76, KD 41"},
  {id:76,topic:"Buffer vs Later",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"SV 210, CPC $4.11, KD 14"},
  {id:77,topic:"Hootsuite vs Later",type:"Compare",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"CPC $7.33, KD 16"},
  {id:78,topic:"Metricool vs Hootsuite",type:"Compare",api:"LP API (compare)",markets:["US","ES"],loc:"EN → ES",signal:"CPC $5.99, KD 8"},
  {id:79,topic:"Best Social Media Tools For Small Business",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"CPC $10.18, KD 58"},
  {id:80,topic:"Best Social Media Tools For Agencies",type:"Blog",api:"Blog API",markets:["US"],loc:"EN first",signal:"Low SV, agency intent"},
  {id:81,topic:"Best Scheduler For Creators & Small Teams",type:"GEO",api:"Blog API",markets:["US"],loc:"EN first",signal:"Prompt-driven GEO"},
  {id:82,topic:"Social Media Automation With n8n / Make",type:"GEO",api:"LP API (workflows)",markets:["US","DE"],loc:"EN → DE",signal:"Prompt-driven GEO"},
  {id:83,topic:"Best Time To Post Testing Method",type:"GEO",api:"Blog API",markets:["US"],loc:"EN first",signal:"Prompt-driven GEO"},
  {id:84,topic:"Free Social Media Tools For Creators",type:"GEO",api:"Blog API",markets:["US"],loc:"EN first",signal:"Prompt-driven hub"},
  {id:85,topic:"Best Alternative Hub (Buffer/Hootsuite/Later)",type:"GEO",api:"LP API (compare)",markets:["US"],loc:"EN first",signal:"Prompt-driven"},
  {id:86,topic:"Social Media Tool Buying Criteria",type:"GEO",api:"Blog API",markets:["US"],loc:"EN first",signal:"AI citations page"},
  {id:87,topic:"AI Social Media Workflow Criteria",type:"GEO",api:"Blog API",markets:["US"],loc:"EN first",signal:"AI citations page"},
  {id:88,topic:"Social Media Approval Software With AI",type:"GEO",api:"LP API (workflows)",markets:["US"],loc:"EN first",signal:"Low KD + product proof"},
  {id:89,topic:"What To Automate In Social Media",type:"GEO",api:"Blog API",markets:["US"],loc:"EN first",signal:"Prompt-driven education"},
  {id:90,topic:"How To Choose A Social Media Management Tool",type:"GEO",api:"Blog API",markets:["US"],loc:"EN first",signal:"Buying guide"},
  {id:91,topic:"DE Instagram Video Download",type:"Localized",api:"Tool content (code)",markets:["DE"],loc:"Native DE",signal:"SV 60.5k, KD 29-30"},
  {id:92,topic:"DE Facebook Video Download",type:"Localized",api:"Tool content (code)",markets:["DE"],loc:"Native DE",signal:"SV 60.5k, KD 28"},
  {id:93,topic:"DE Social Media Automatisierung",type:"Localized",api:"LP API (solutions)",markets:["DE"],loc:"Native DE",signal:"SV 140, CPC $3.26, KD 13"},
  {id:94,topic:"DE Social Media Kalender",type:"Localized",api:"LP API (solutions)",markets:["DE"],loc:"Native DE",signal:"SV 260, KD 22"},
  {id:95,topic:"FR Télécharger Vidéo Instagram",type:"Localized",api:"Tool content (code)",markets:["FR"],loc:"Native FR",signal:"SV 60.5k, CPC $1.16, KD 44"},
  {id:96,topic:"FR Télécharger Vidéo Facebook",type:"Localized",api:"Tool content (code)",markets:["FR"],loc:"Native FR",signal:"SV 40.5k, KD 24"},
  {id:97,topic:"FR Programmer Publication Instagram",type:"Localized",api:"LP API (solutions)",markets:["FR"],loc:"Native FR",signal:"SV 880, KD 25"},
  {id:98,topic:"ES Mejor Hora Para Publicar En Instagram",type:"Localized",api:"LP API (best-time-to-post)",markets:["ES"],loc:"Native ES",signal:"SV 2.9k, KD 15"},
  {id:99,topic:"ES Descargar Video Instagram",type:"Localized",api:"Tool content (code)",markets:["ES"],loc:"Native ES",signal:"SV 246k, KD 75"},
  {id:100,topic:"BR Baixar Video Instagram",type:"Localized",api:"Tool content (code)",markets:["BR"],loc:"Native PT-BR",signal:"SV 1.22M, KD 44"}
];

/* Status persistence (localStorage) */
const SEO_STATUS_KEY = 'tareno_seo_backlog_status_v1';

function seoGetStatus() {
  try { return JSON.parse(localStorage.getItem(SEO_STATUS_KEY) || '{}'); } catch { return {}; }
}

function seoSetStatus(id, val) {
  const s = seoGetStatus();
  s[id] = val;
  localStorage.setItem(SEO_STATUS_KEY, JSON.stringify(s));
  seoUpdateStats();
}

function seoResetStatus() {
  if (!confirm('Alle Status zurücksetzen?')) return;
  localStorage.removeItem(SEO_STATUS_KEY);
  loadCurrentView();
}

/* Type → colour */
function seoTypeClass(type) {
  const m = {Landing:'text-purple-300 bg-purple-500/15 border-purple-500/25',Tool:'text-blue-300 bg-blue-500/15 border-blue-500/25',Blog:'text-amber-300 bg-amber-500/15 border-amber-500/25',GEO:'text-cyan-300 bg-cyan-500/15 border-cyan-500/25',Compare:'text-rose-300 bg-rose-500/15 border-rose-500/25',Localized:'text-emerald-300 bg-emerald-500/15 border-emerald-500/25'};
  for (const [k,v] of Object.entries(m)) if (type.includes(k)) return v;
  return 'text-zinc-300 bg-zinc-500/15 border-zinc-500/25';
}

/* Market flag badge */
function seoMktBadge(m) {
  const flags = {US:'🇺🇸',DE:'🇩🇪',FR:'🇫🇷',ES:'🇪🇸',UK:'🇬🇧',BR:'🇧🇷'};
  return `<span class="inline-block text-[10px] px-1 py-0.5 rounded bg-white/5 border border-white/8">${flags[m]||''} ${m}</span>`;
}

/* API badge */
function seoApiBadge(api) {
  const short = api.replace('LP API ','LP ').replace('Blog API','Blog').replace('Tool content (code)','Tool code');
  const cls = api.includes('solutions') ? 'text-purple-300 bg-purple-500/10' : api.includes('compare') ? 'text-rose-300 bg-rose-500/10' : api.includes('workflows') ? 'text-orange-300 bg-orange-500/10' : api.includes('best-time') ? 'text-teal-300 bg-teal-500/10' : api.includes('Blog') ? 'text-amber-300 bg-amber-500/10' : 'text-blue-300 bg-blue-500/10';
  return `<span class="text-[9px] font-mono px-1.5 py-0.5 rounded border border-white/10 ${cls}">${short}</span>`;
}

/* Status pill & dropdown */
function seoStatusPill(id, val) {
  const opts = {open:'⬜ Open',in_progress:'🔵 In Progress',done:'✅ Done',skip:'⏭ Skip'};
  const cls = {open:'text-amber-300',in_progress:'text-blue-300',done:'text-emerald-300',skip:'text-zinc-400'};
  return `<select onchange="seoSetStatus(${id},this.value)" class="text-[10px] font-bold bg-black/40 border border-white/10 rounded-lg px-2 py-1 focus:outline-none ${cls[val]||cls.open}" style="width:110px">
    ${Object.entries(opts).map(([k,v])=>`<option value="${k}" ${k===val?'selected':''}>${v}</option>`).join('')}
  </select>`;
}

/* Render all rows */
function seoRenderRows(data) {
  const statuses = seoGetStatus();
  const tbody = document.getElementById('seo-table-body');
  if (!tbody) return;
  tbody.innerHTML = data.map(t => {
    const st = statuses[t.id] || 'open';
    const rowCls = st==='done' ? 'opacity-50' : st==='skip' ? 'opacity-30' : '';
    return `<tr class="border-b border-white/5 hover:bg-white/3 transition-colors seo-row ${rowCls}" data-id="${t.id}" data-type="${t.type}" data-api="${t.api}" data-markets="${t.markets.join(',')}" data-status="${st}" data-topic="${t.topic.toLowerCase()}">
      <td class="py-2.5 pl-4 pr-2 text-text-muted font-mono text-[10px]">${t.id}</td>
      <td class="py-2.5 pr-3 font-semibold text-white leading-snug max-w-[220px]">${t.topic}<br><span class="text-[9px] text-text-muted font-normal">${t.signal}</span></td>
      <td class="py-2.5 pr-2"><span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${seoTypeClass(t.type)}">${t.type}</span></td>
      <td class="py-2.5 pr-2">${seoApiBadge(t.api)}</td>
      <td class="py-2.5 pr-2"><div class="flex flex-wrap gap-1">${t.markets.map(seoMktBadge).join('')}</div></td>
      <td class="py-2.5 pr-2 text-[10px] text-text-secondary max-w-[130px]">${t.loc}</td>
      <td class="py-2.5 pr-2 text-[9px] text-text-muted max-w-[160px] leading-relaxed">${t.signal}</td>
      <td class="py-2.5 pr-3">${seoStatusPill(t.id, st)}</td>
    </tr>`;
  }).join('');
  seoUpdateStats();
}

/* Filtering */
function seoApplyFilters() {
  const type   = (document.getElementById('seo-f-type')?.value||'').toLowerCase();
  const api    = (document.getElementById('seo-f-api')?.value||'').toLowerCase();
  const market = (document.getElementById('seo-f-market')?.value||'').toLowerCase();
  const status = (document.getElementById('seo-f-status')?.value||'').toLowerCase();
  const search = (document.getElementById('seo-f-search')?.value||'').toLowerCase();
  let visible = 0;
  document.querySelectorAll('.seo-row').forEach(row => {
    const ok =
      (!type   || row.dataset.type.toLowerCase().includes(type)) &&
      (!api    || row.dataset.api.toLowerCase().includes(api)) &&
      (!market || row.dataset.markets.toLowerCase().includes(market)) &&
      (!status || row.dataset.status === status) &&
      (!search || row.dataset.topic.includes(search) || row.querySelector('td:nth-child(2)').textContent.toLowerCase().includes(search));
    row.style.display = ok ? '' : 'none';
    if (ok) visible++;
  });
  const cnt = document.getElementById('seo-filter-count');
  if (cnt) cnt.textContent = `${visible} sichtbar`;
}

/* Stats bar */
function seoUpdateStats() {
  const rows = document.querySelectorAll('.seo-row');
  const counts = {open:0,in_progress:0,done:0,skip:0};
  rows.forEach(r => { const s = r.dataset.status||'open'; counts[s]=(counts[s]||0)+1; });
  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('seo-stat-open', counts.open);
  set('seo-stat-progress', counts.in_progress);
  set('seo-stat-done', counts.done);
  set('seo-stat-skip', counts.skip);
}

/* CSV download */
function seoDownloadCSV() {
  const statuses = seoGetStatus();
  const header = ['#','Topic','Type','API','Markets','Localization','Signal','Status'];
  const rows = SEO_TOPICS.map(t => [t.id, `"${t.topic}"`, t.type, `"${t.api}"`, t.markets.join(' '), `"${t.loc}"`, `"${t.signal}"`, statuses[t.id]||'open']);
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = 'tareno_seo_geo_backlog.csv';
  a.click();
}

/* JSON download */
function seoDownloadJSON() {
  const statuses = seoGetStatus();
  const data = SEO_TOPICS.map(t => ({...t, status: statuses[t.id]||'open'}));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
  a.download = 'tareno_seo_geo_backlog.json';
  a.click();
}

/* Auto-init when tab renders */
document.addEventListener('seo-backlog-ready', () => {
  seoRenderRows(SEO_TOPICS);
});
