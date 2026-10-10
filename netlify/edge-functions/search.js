const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async (request) => {
  const key = Netlify.env.get("GOOGLE_API_KEY");
  const cx = Netlify.env.get("GOOGLE_CX");
  const q = (new URL(request.url).searchParams.get("q") || "").slice(0, 300);
  if (!key || !cx) return json({ error: "Google search not configured" }, 501);
  if (!q) return json({ error: "Missing q" }, 400);

  const url = "https://www.googleapis.com/customsearch/v1?" + new URLSearchParams({ key, cx, q, num: "6", hl: "sq" });
  const r = await fetch(url);
  if (!r.ok) return json({ error: "Google error" }, 502);
  const d = await r.json();
  const items = (d.items || []).map(i => ({ title: i.title, link: i.link, displayLink: i.displayLink, snippet: i.snippet }));
  return json({ items }, 200);
};

export const config = { path: "/api/search" };
