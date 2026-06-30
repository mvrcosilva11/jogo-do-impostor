// Palavras de ATUALIDADE — geradas a partir do que está em tendência agora.
// Fonte: artigos mais vistos da Wikipédia PT (API de pageviews da Wikimedia) +
// descrição curta da Wikidata para criar a pista. Tudo client-side, com CORS aberto.
// Funciona offline através de cache (localStorage) e cai no banco fixo se falhar.
(function () {
  "use strict";

  const CAT = "Atualidade 🔥";
  const LS_KEY = "impostor_trending_v2";
  const MAX_WORDS = 30;

  const pad = (n) => String(n).padStart(2, "0");
  function dateParts(daysAgo) {
    const d = new Date(Date.now() - daysAgo * 86400000);
    return {
      y: d.getUTCFullYear(),
      m: pad(d.getUTCMonth() + 1),
      d: pad(d.getUTCDate()),
      key: d.toISOString().slice(0, 10),
    };
  }

  // Títulos a descartar (namespaces, listas, datas, páginas internas)
  const BAD = [/:/, /^\d/, /^Lista[ _]/i, /desambiguação/i, /Página[ _]principal/i, /Wikip[ée]dia/i, /Especial/i];
  const cleanTitle = (t) => t.replace(/_/g, " ").trim();

  function isGoodTitle(raw) {
    if (BAD.some((r) => r.test(raw))) return false;
    const t = cleanTitle(raw);
    if (t.length > 30) return false;
    if (t.split(" ").length > 4) return false;
    return true;
  }

  // Deriva uma pista OBLÍQUA (uma palavra) a partir da descrição curta da Wikidata.
  // Em vez da categoria óbvia (1ª palavra: "futebolista", "cantor"), prefere a ÚLTIMA
  // palavra significativa — normalmente a origem/nacionalidade ("português", "brasileiro"),
  // que é uma pista bem mais subtil.
  const STOP = new Set(["de","da","do","das","dos","e","o","a","os","as","um","uma","no","na",
    "the","of","and","in","del","la","el"]);
  function pistaFrom(desc, title) {
    if (!desc) return "";
    if (/desambigua|página da wiki/i.test(desc)) return ""; // páginas meta → sem boa pista
    const tlow = title.toLowerCase();
    const words = desc.trim().split(/\s+/)
      .map((p) => p.replace(/[^\p{L}\d]/gu, ""))
      .filter((p) => p.length >= 3 && !STOP.has(p.toLowerCase()));
    // candidatas que não aparecem no próprio título
    const cand = words.filter((p) => !tlow.includes(p.toLowerCase()));
    const list = cand.length ? cand : words;
    const w = list.length ? list[list.length - 1] : ""; // última = origem/nacionalidade
    if (w.length < 3) return "";
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }

  // Top de artigos mais vistos (tenta os últimos dias até ter dados).
  async function fetchTop() {
    for (let ago = 1; ago <= 3; ago++) {
      const { y, m, d } = dateParts(ago);
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/pt.wikipedia/all-access/${y}/${m}/${d}`;
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        const arts = (j.items && j.items[0] && j.items[0].articles) || [];
        if (arts.length) return arts;
      } catch (e) { /* tenta o dia anterior */ }
    }
    return [];
  }

  // Descrições curtas (Wikidata) em lote, via Action API com CORS (origin=*).
  async function fetchDescriptions(titles) {
    const out = {};
    for (let i = 0; i < titles.length; i += 50) {
      const batch = titles.slice(i, i + 50);
      const url = "https://pt.wikipedia.org/w/api.php?action=query&format=json&origin=*"
        + "&prop=description&titles=" + encodeURIComponent(batch.join("|"));
      try {
        const r = await fetch(url);
        const j = await r.json();
        const pages = (j.query && j.query.pages) || {};
        Object.values(pages).forEach((p) => { if (p.title) out[p.title] = p.description || ""; });
      } catch (e) { /* ignora lote falhado */ }
    }
    return out;
  }

  async function build() {
    const arts = await fetchTop();
    const titles = arts.map((a) => a.article).filter(isGoodTitle).slice(0, 60).map(cleanTitle);
    if (!titles.length) return [];
    const descs = await fetchDescriptions(titles);

    const words = [];
    const seen = new Set((window.WORDS || []).map((w) => w.p.toLowerCase()));
    for (const p of titles) {
      if (seen.has(p.toLowerCase())) continue;
      const d = pistaFrom(descs[p] || "", p);
      if (!d) continue; // sem boa pista → salta (mantém qualidade)
      words.push({ p, d, c: CAT });
      seen.add(p.toLowerCase());
      if (words.length >= MAX_WORDS) break;
    }
    return words;
  }

  // API pública. force=true ignora a cache do dia.
  window.loadTrendingWords = async function (force) {
    const today = dateParts(0).key;
    if (!force) {
      try {
        const c = JSON.parse(localStorage.getItem(LS_KEY) || "null");
        if (c && c.date === today && Array.isArray(c.words) && c.words.length) return c.words;
      } catch (e) {}
    }
    const words = await build();
    if (words.length) {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ date: today, words })); } catch (e) {}
    }
    return words;
  };
})();
