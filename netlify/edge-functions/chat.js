const buildSystem = (dateStr) =>
  "Ti je Dija Shqiptare, një asistent i dobishëm, i qartë dhe i sinqertë, si ChatGPT. Sot është " + dateStr + " (viti aktual është " + dateStr.slice(-4) + "). Njohuritë e tua të brendshme mbarojnë rreth vitit 2024, por bota ka vazhduar: mos thuaj kurrë se viti aktual është 2024 dhe mos thuaj se ngjarjet pas 2024 nuk kanë ndodhur. Nëse në bisedë ka rezultate kërkimi nga interneti, bazoju në to (ato janë më të reja se njohuritë e tua), jepi përparësi dhe përmend lidhjet. Nëse nuk ke rezultate dhe pyetja kërkon të dhëna të reja (lajme, çmime, rezultate, kush mban një post tani, versione të fundit), thuaj sinqerisht se mund të mos jesh i përditësuar dhe këshillo mënyrën Google. Përgjigju gjithmonë në gjuhën që përdor personi (si parazgjedhje shqip). Përdor formatim Markdown kur ndihmon (tituj të shkurtër, lista, tabela, blloqe kodi). Përgjigju SHUMË shkurt: maksimumi 2-4 fjali, pa hyrje dhe pa përsëritje, vetëm thelbi. Jep përgjigje më të gjatë vetëm nëse personi e kërkon qartë (p.sh. shpjego në detaje, shkruaj një ese) ose kur duhet kod. Jep përgjigje të drejtpërdrejta dhe të sakta. Mos shpik burime ose lidhje. Nëse të pyesin kush e ka krijuar këtë faqe, thuaj se Dija Shqiptare është krijuar nga Drilon Avdyli.";

const MONTHS = ["janar","shkurt","mars","prill","maj","qershor","korrik","gusht","shtator","tetor","nëntor","dhjetor"];
const dateAL = () => {
  const d = new Date();
  return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
};

// Kërkim automatik në Google kur pyetja duket e varur nga koha (kërkon GOOGLE_API_KEY dhe GOOGLE_CX)
const NEEDS_FRESH = /\b(20(2[4-9]|3\d)|sot|tani|aktual\w*|fundit|i ri|e re|të rinj|lajm\w*|çmim\w*|kurs\w*|rezultat\w*|ndeshj\w*|zgjedhj\w*|kryeminist\w*|president\w*|latest|today|current\w*|news|price|score|who is|version|released?)\b/i;
async function webContext(query) {
  const key = Netlify.env.get("GOOGLE_API_KEY"), cx = Netlify.env.get("GOOGLE_CX");
  if (!key || !cx) return "";
  const always = (Netlify.env.get("DIJA_AUTO_SEARCH") || "").toLowerCase() === "always";
  if (!always && !NEEDS_FRESH.test(query)) return "";
  try {
    const r = await fetch("https://www.googleapis.com/customsearch/v1?" + new URLSearchParams({ key, cx, q: query.slice(0, 200), num: "5" }));
    if (!r.ok) return "";
    const d = await r.json();
    const items = (d.items || []).map((i, n) => (n + 1) + ". " + i.title + " - " + (i.snippet || "") + " (" + i.link + ")");
    return items.length ? "\n\nRezultate të freskëta nga Google (përdori si burim kryesor):\n" + items.join("\n") : "";
  } catch (e) { return ""; }
}

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async (request) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  const MODEL = Netlify.env.get("GROQ_MODEL") || "openai/gpt-oss-120b";
  const key = Netlify.env.get("GROQ_API_KEY");
  if (!key) return json({ error: "Missing GROQ_API_KEY" }, 500);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  let messages = Array.isArray(body.messages) ? body.messages : [];
  messages = messages
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content.slice(0, 6000) }));
  // Groq numëron hyrjen + max_tokens kundrejt kufirit në minutë, ndaj mbaj historinë të shkurtër
  const HIST_CHARS = 5000;
  let used = 0, keep = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    used += messages[i].content.length;
    if (used > HIST_CHARS && keep.length) break;
    keep.unshift(messages[i]);
  }
  messages = keep;
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
    return json({ error: "Invalid messages" }, 400);
  }

  const lastUser = messages[messages.length - 1].content;
  const extra = await webContext(lastUser);
  const SYSTEM = buildSystem(dateAL()) + extra;

  const MAXTOK = parseInt(Netlify.env.get("GROQ_MAX_TOKENS") || "1000", 10);
  const call = () => fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAXTOK,
      stream: true,
      ...(MODEL.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [{ role: "system", content: SYSTEM }, ...messages]
    })
  });
  let upstream = await call();
  // Groq kufizon tokenet në minutë: nëse kërkon pritje të shkurtër, prit dhe provo përsëri (deri 4 herë)
  for (let n = 0; n < 4 && upstream.status === 429; n++) {
    let wait = 3000;
    try {
      const j = await upstream.clone().json();
      const m = ((j.error && j.error.message) || "").match(/try again in ([\d.]+)(ms|s)/i);
      if (m) wait = (m[2].toLowerCase() === "ms" ? parseFloat(m[1]) : parseFloat(m[1]) * 1000) + 800;
    } catch (e) {}
    if (wait > 12000) break;
    await new Promise(r => setTimeout(r, wait));
    upstream = await call();
  }

  if (!upstream.ok) {
    let detail = "";
    try { const j = await upstream.json(); detail = (j.error && j.error.message) || ""; } catch (e) {}
    return json({ error: "Upstream error", status: upstream.status, detail }, upstream.status === 429 ? 429 : 502);
  }

  // Convert Groq (OpenAI-style) stream into the event format the page already understands
  const enc = new TextEncoder(), dec = new TextDecoder();
  let buf = "";
  const out = (obj) => enc.encode("data: " + JSON.stringify(obj) + "\n\n");
  const converter = new TransformStream({
    transform(chunk, controller) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const ln of lines) {
        if (!ln.startsWith("data:")) continue;
        const data = ln.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
        const ch = ev.choices && ev.choices[0];
        if (!ch) continue;
        const t = ch.delta && ch.delta.content;
        if (t) controller.enqueue(out({ type: "content_block_delta", delta: { type: "text_delta", text: t } }));
        if (ch.finish_reason === "length") controller.enqueue(out({ type: "message_delta", delta: { stop_reason: "max_tokens" } }));
      }
    }
  });

  return new Response(upstream.body.pipeThrough(converter), {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" }
  });
};

export const config = { path: "/api/chat" };
