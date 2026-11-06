/* jm.js — Joguinhos do Marco: o que todos os joguinhos partilham.
   Um ficheiro, sem dependências, copiado para cada jogo (manter as cópias iguais: _tools/sync-jm.sh).

   Língua      JM.lang() 'pt' | 'en' · JM.setLang(l) · JM.L(pt, en) · JM.i18n(raiz)
               (no HTML: <b data-en="Players">Jogadores</b>, data-en-ph para o placeholder, data-en-aria para o aria-label)
               A escolha é do telemóvel ("jm.lang"); sem escolha, segue a língua do telemóvel. ?lang=en no link também a define.
   Tradução    JM.translate(texto, para, de) → Promise({ text, from }) · JM.tx(texto, para, quandoChegar, de) → { text, done, changed }
               Para o que os jogadores escrevem (cartas em branco, pistas, palavras): tradução automática, guardada.
               "de" é a língua de quem escreveu (o mais seguro: a deteção engana-se em palavras soltas, como "Mar");
               sem ela, só se traduz se o texto for detetado na outra língua do jogo.
   Studio Mode JM.studioOn() · JM.setStudio(on) · JM.door(el)
               O interruptor está no início de cada joguinho e da página inicial (<div data-jm-studio-row>, o jm.js
               desenha-o) e nas Definições; também o /studio (ou ?studio=1) e 3 s em cima do símbolo da casa.
               Ligado, o fundo de tudo passa a fogo animado (partículas, brasas e as chamas da casa), com som.
               O que é do pessoal continua em ficheiros à parte, só descarregados com ele ligado.
   Definições  JM.settings() abre a folha comum (língua, som, Studio Mode); qualquer [data-jm="settings"] a abre.
               JM.settingsExtra = function () { return [{ t: ['Como se joga', 'How to play'], ic: 'question', fn: f }] }
   Ecrãs       JM.screen(id, back) · JM.icons(raiz) desenha <i class="ic" data-ic="nome"> · JM.icon(nome)
   Avisos      JM.toast(texto) · JM.alert({ title, text, actions: [{ t, fn, cls }] }) · JM.sheet(html, { title }) / JM.closeSheet()
   Som         Os joguinhos não têm sons (pedido do Marco): JM.play(nome) existe mas não faz nada. A única coisa que se ouve
               é a música do Impostor, que usa JM.muted(); um jogo com música põe JM.hasMusic = true e aparece "Música" nas Definições.
   Fogo        JM.studio(on): só o efeito (som + chamas), sem mudar a escolha (ex.: a regra de uma sala do Cartas)
   Ranking     JM.rank: uma conta para todos os joguinhos, um Elo por joguinho e um geral (ver a secção "o ranking").
   Movimento reduzido: o fogo passa a um brilho curto. */
(function (root) {
  'use strict';
  var doc = root.document, html = doc.documentElement;
  var qs = new URLSearchParams(location.search);
  var CALM = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function emit(name, detail) { try { root.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {} }
  function dropParams(names) {      // lido uma vez, sai do endereço: recarregar não volta a impor a escolha do link
    try {
      var u = new URL(location.href), had = false;
      names.forEach(function (n) { if (u.searchParams.has(n)) { u.searchParams.delete(n); had = true; } });
      if (had) history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }
  function legacy(key, field) { try { var o = JSON.parse(localStorage.getItem(key)); return o ? o[field] : undefined; } catch (e) { return undefined; } }

  /* ───────────────────────── língua ───────────────────────── */

  var LANG = 'jm.lang';
  if (qs.get('lang') === 'en' || qs.get('lang') === 'pt') put(LANG, qs.get('lang'));
  if (!get(LANG) && legacy('ccm.me', 'lang') === 'en') put(LANG, 'en');      // a escolha antiga do Cartas
  function lang() {
    var l = get(LANG);
    if (l === 'en' || l === 'pt') return l;
    return /^pt/i.test(navigator.language || 'pt') ? 'pt' : 'en';
  }
  function L(pt, en) { return lang() === 'en' ? en : pt; }

  function i18n(scope) {
    var en = lang() === 'en';
    html.lang = en ? 'en' : 'pt-PT';
    (scope || doc).querySelectorAll('[data-en]').forEach(function (el) {
      if (!el.hasAttribute('data-pt')) el.setAttribute('data-pt', el.innerHTML);
      var v = en ? el.getAttribute('data-en') : el.getAttribute('data-pt');
      if (el.innerHTML !== v) el.innerHTML = v;
    });
    [['ph', 'placeholder'], ['aria', 'aria-label'], ['title', 'title']].forEach(function (a) {
      (scope || doc).querySelectorAll('[data-en-' + a[0] + ']').forEach(function (el) {
        if (!el.hasAttribute('data-pt-' + a[0])) el.setAttribute('data-pt-' + a[0], el.getAttribute(a[1]) || '');
        el.setAttribute(a[1], el.getAttribute((en ? 'data-en-' : 'data-pt-') + a[0]));
      });
    });
    icons(scope);
    tips(scope);
  }
  function setLang(l) {
    l = l === 'en' ? 'en' : 'pt';
    if (l === lang() && get(LANG)) return;
    put(LANG, l);
    i18n();
    emit('jm:lang', l);
  }

  /* ───────────────────────── tradução automática ─────────────────────────
     Para o texto que os jogadores escrevem. A língua de origem é detetada; se já estiver na língua
     pedida, fica como está. Guarda as traduções no telemóvel (as últimas 400). */

  var TR = 'jm.tr', trMem = null, trWait = {};
  function trStore() {
    if (!trMem) { try { trMem = JSON.parse(localStorage.getItem(TR)) || {}; } catch (e) { trMem = {}; } }
    return trMem;
  }
  function trSave(key, val) {
    var m = trStore(), keys = Object.keys(m);
    m[key] = val;
    if (keys.length > 420) keys.slice(0, keys.length - 400).forEach(function (k) { delete m[k]; });
    try { localStorage.setItem(TR, JSON.stringify(m)); } catch (e) {}
  }
  function timed(url, ms) {
    var ctl = root.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 7000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function other(l) { return l === 'en' ? 'pt' : 'en'; }
  function viaGoogle(text, to, sl) {
    return timed('https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=' + sl + '&tl=' + to + '&q=' + encodeURIComponent(text)).then(function (j) {
      var out = (j && j[0] || []).map(function (s) { return s && s[0] || ''; }).join('');
      if (!out) throw new Error('empty');
      return { text: out, from: sl !== 'auto' ? sl : String(j[2] || '').slice(0, 2) };
    });
  }
  function viaMyMemory(text, to, from) {
    return timed('https://api.mymemory.translated.net/get?langpair=' + from + '|' + to + '&q=' + encodeURIComponent(text)).then(function (j) {
      var out = j && j.responseData && j.responseData.translatedText;
      if (!out || Number(j.responseStatus) !== 200) throw new Error('mymemory');
      return { text: out, from: from };
    });
  }
  function trKey(text, to, from) { return to + '|' + (from === 'pt' || from === 'en' ? from : '?') + '|' + String(text || '').trim(); }
  function translate(text, to, from) {
    text = String(text || '').trim();
    to = to === 'en' ? 'en' : 'pt';
    if (!text || from === to) return Promise.resolve({ text: text, from: to });
    var known = from === 'pt' || from === 'en';
    var key = trKey(text, to, from), hit = trStore()[key];
    if (hit) return Promise.resolve(hit);
    if (trWait[key]) return trWait[key];
    var p = viaGoogle(text, to, known ? from : 'auto').catch(function () { return viaMyMemory(text, to, known ? from : other(to)); }).then(function (r) {
      // sem saber quem escreveu, só se traduz o que foi detetado na outra língua do jogo
      var res = { text: !known && r.from !== other(to) ? text : r.text, from: r.from };
      trSave(key, res);
      delete trWait[key];
      return res;
    }, function () { delete trWait[key]; return null; });
    trWait[key] = p;
    return p;
  }
  // Para desenhar já: devolve o que houver (a tradução guardada ou o original) e chama quandoChegar se faltar.
  function tx(text, to, later, from) {
    to = to === 'en' ? 'en' : 'pt';
    if (from === to) return { text: text, done: true, changed: false };
    var hit = trStore()[trKey(text, to, from)];
    if (hit) return { text: hit.text, done: true, changed: hit.text !== String(text).trim() };
    translate(text, to, from).then(function (r) { if (r && later) later(r); });
    return { text: text, done: false, changed: false };
  }

  /* ───────────────────────── Studio Mode ───────────────────────── */

  var STUDIO = 'jm.studio';
  if (qs.get('studio') === '1' || qs.get('studio') === '0') put(STUDIO, qs.get('studio'));
  if (get(STUDIO) === null && (get('impostor.studio') === '1' || legacy('ccm.me', 'studio') === true)) put(STUDIO, '1');    // as escolhas antigas
  dropParams(['studio', 'lang']);
  function studioOn() { return get(STUDIO) === '1'; }
  // as cores: com o Studio Mode, o escuro do fogo (jm.css) e a barra do Safari na mesma cor
  function paintStudio() {
    var on = studioOn();
    if (on) html.setAttribute('data-studio', '1');
    else html.removeAttribute('data-studio');
    doc.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      if (!m.hasAttribute('data-orig')) m.setAttribute('data-orig', m.getAttribute('content'));
      m.setAttribute('content', on ? '#170503' : m.getAttribute('data-orig'));
    });
  }
  // todos os interruptores do Studio Mode à vista ficam com o mesmo estado
  function studioRows() {
    var on = studioOn();
    doc.querySelectorAll('[data-jm-studio-row]').forEach(function (box) {
      var short = box.getAttribute('data-jm-studio-row') === 'compact';
      box.innerHTML = '<div class="group studio-row"><div class="row big" data-jm="studio-toggle"><span class="tile-ic lg studio">' + icon('flame') + '</span>' +
        '<div class="row-b"><span class="row-x"><span class="row-t">Studio Mode</span>' + (short ? '' : '<span class="row-s">' +
        (on ? L('Ligado: o pessoal do estúdio está em jogo.', 'On: the studio crew is in the game.') : L('Os nomes e as piadas cá de casa. Com fogo.', 'The house names and inside jokes. With fire.')) +
        '</span>') + '</span><button type="button" class="switch" role="switch" aria-checked="' + on + '" aria-label="Studio Mode" data-jm="studio-toggle"></button></div></div></div>';
    });
    doc.querySelectorAll('.switch[data-jm="studio-toggle"]').forEach(function (b) { b.setAttribute('aria-checked', String(on)); });
  }
  // Ligar: o ecrã encolhe, a explosão (as cores mudam aqui) e o fundo a arder. Desligar: o fogo apaga-se e as cores voltam.
  var studioT = null;
  function setStudio(on, quiet) {
    put(STUDIO, on ? '1' : '0');
    studioRows();
    clearTimeout(studioT);
    html.classList.remove('jm-charge');
    if (quiet || CALM) {
      paintStudio();
      fireBg(on, false);
    } else if (on) {
      html.classList.add('jm-charge');
      studioT = setTimeout(function () {
        html.classList.remove('jm-charge');
        paintStudio();
        fireBg(true, true);
        fire();
        html.classList.add('jm-boom');
        setTimeout(function () { html.classList.remove('jm-boom'); }, 600);
      }, 560);
    } else {
      fireBg(false, true);
      studioT = setTimeout(paintStudio, 650);
    }
    emit('jm:studio', !!on);
  }
  paintStudio();

  // A porta escondida: carregar 3 s em cima do símbolo da casa liga (ou desliga) o Studio Mode.
  function door(el) {
    if (!el || el._door) return;
    el._door = true;
    var t = null, fired = false;
    function stop() { clearTimeout(t); t = null; }
    el.addEventListener('pointerdown', function () {
      fired = false;
      stop();
      t = setTimeout(function () {
        fired = true;
        setStudio(!studioOn());
        toast(studioOn() ? 'Studio Mode' : L('Studio Mode desligado', 'Studio Mode off'));
      }, 3000);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (e) { el.addEventListener(e, stop); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('click', function (e) { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
    el.style.webkitTouchCallout = 'none';
    el.style.webkitUserSelect = 'none';
  }

  /* ───────────────────────── ícones (traço de 2, cantos redondos) ───────────────────────── */

  var P = {
    'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
    'chevron-right': '<path d="M9 5l7 7-7 7"/>',
    'chevron-down': '<path d="M5 9l7 7 7-7"/>',
    'xmark': '<path d="M6 6l12 12M18 6L6 18"/>',
    'ellipsis': '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
    'gear': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    'speaker': '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    'speaker-off': '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'minus': '<path d="M5 12h14"/>',
    'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'share': '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    'person': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    'people': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.8 2.9-6 6.5-6s6.5 2.2 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.3c1.9.8 3 2.6 3 5.7"/>',
    'phone': '<rect x="6.5" y="2.5" width="11" height="19" rx="3"/><path d="M10.5 18.5h3"/>',
    'phones': '<rect x="2.5" y="5" width="9" height="15" rx="2.5"/><rect x="12.5" y="3" width="9" height="15" rx="2.5"/>',
    'online': '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1.2" fill="currentColor"/><path d="M1.5 9a15 15 0 0 1 21 0"/>',
    'pencil': '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    'question': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.3-2.5 4"/><circle cx="12" cy="17.2" r="1" fill="currentColor"/>',
    'play': '<path d="M7 4.8v14.4a1 1 0 0 0 1.5.9l11.3-7.2a1 1 0 0 0 0-1.7L8.5 3.9A1 1 0 0 0 7 4.8z" fill="currentColor" stroke="none"/>',
    'shuffle': '<path d="M3 7h3.5c2 0 3 .8 4.2 2.6l2.6 4.8c1 1.8 2.2 2.6 4.2 2.6H21M17.5 13.5L21 17l-3.5 3.5M3 17h3.5c1.4 0 2.3-.4 3.1-1.3M13.4 8.3c.8-.9 1.7-1.3 3.1-1.3H21M17.5 3.5L21 7l-3.5 3.5"/>',
    'refresh': '<path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.5"/><path d="M20 3.5v5h-5"/>',
    'flame': '<path d="M12 2.5c1 3.5 5.5 5.6 5.5 10.6A5.5 5.5 0 0 1 12 21.5a5.5 5.5 0 0 1-5.5-5.4c0-2.7 1.4-4 2.2-6 .6 1.3 1.3 2 2.2 2.3C10.6 9 10.8 5.6 12 2.5z"/>',
    'eye': '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'hand': '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11M12 10.5V4a1.5 1.5 0 0 1 3 0v7M15 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 6h-.6a6 6 0 0 1-4.6-2.2L3 15.3a1.6 1.6 0 0 1 2.4-2.1L9 16V8.5a1.5 1.5 0 0 0-3 0"/>',
    'crown': '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    'timer': '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5"/>',
    'trophy': '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8M9.5 18h5"/>',
    'cards': '<rect x="3" y="5" width="11" height="15" rx="2" transform="rotate(-8 8.5 12.5)"/><rect x="10" y="4" width="11" height="15" rx="2"/>',
    'grid': '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    'sparkles': '<path d="M11 3l1.8 4.7L17.5 9.5l-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z"/><path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
    'door': '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21H14"/><path d="M10 12h11M17.5 8.5L21 12l-3.5 3.5"/>',
    'photo': '<rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 8.5"/>',
    'send': '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'star': '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    'list': '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
    'dice': '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
    'trash': '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.8" r="1" fill="currentColor"/>',
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'link': '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    'mask': '<path d="M3 9.5C3 7 5 6 7 6c2 0 3 1.2 5 1.2S15 6 17 6c2 0 4 1 4 3.5 0 4-2.6 7-5.2 7-1.8 0-2.6-1.8-3.8-1.8S10 16.5 8.2 16.5C5.6 16.5 3 13.5 3 9.5z"/><path d="M7 10.5c.6-.6 1.8-.6 2.4 0M14.6 10.5c.6-.6 1.8-.6 2.4 0"/>',
    'face': '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.1" fill="currentColor"/><circle cx="15" cy="10" r="1.1" fill="currentColor"/><path d="M8.5 14.5c2 2 5 2 7 0"/>',
    'lock': '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    'home': '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/>',
    'translate': '<path d="M3 5h10M8 3v2M5 5c.6 3.6 3 6.4 6.5 8M11 5c-.8 3.7-3.4 6.8-7.5 8.5"/><path d="M13 21l4-10 4 10M14.5 17.5h5"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  }
  function icons(scope) {
    (scope || doc).querySelectorAll('i.ic[data-ic]').forEach(function (el) {
      var n = el.getAttribute('data-ic');
      if (el._ic !== n) { el._ic = n; el.innerHTML = icon(n); el.setAttribute('aria-hidden', 'true'); }
    });
  }

  /* ───────────────────────── ecrãs, barra, avisos ───────────────────────── */

  function screen(id, back) {
    var cur = doc.querySelector('.screen.on'), next = doc.getElementById(id);
    if (!next || cur === next) return;
    if (cur) cur.classList.remove('on', 'back');
    next.classList.toggle('back', !!back);
    next.classList.add('on');
    root.scrollTo(0, 0);
    scrolled();
  }
  function scrolled() { html.classList.toggle('scrolled', (root.scrollY || 0) > 4); }
  root.addEventListener('scroll', scrolled, { passive: true });

  var toastT = null;
  function toast(msg) {
    var el = doc.getElementById('toast');
    if (!el) { el = doc.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); doc.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove('on'); }, 2400);
  }

  var layer = null, onClose = null, lastFocus = null;
  function closeSheet() {
    if (!layer) return;
    var l = layer, f = onClose;
    layer = onClose = null;
    l.remove();
    if (f) f();
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  function sheet(content, opts) {
    opts = opts || {};
    closeSheet();
    lastFocus = doc.activeElement;
    layer = doc.createElement('div');
    layer.className = 'sheet-layer';
    layer.innerHTML = '<button type="button" class="scrim" data-jm="close" aria-label="' + L('Fechar', 'Close') + '"></button>' +
      '<div class="sheet" role="dialog" aria-modal="true"' + (opts.title ? ' aria-label="' + esc(opts.title) + '"' : '') + '><span class="grab" aria-hidden="true"></span>' +
      (opts.title != null ? '<div class="sheet-h"><span class="sp"></span><h2>' + esc(opts.title) + '</h2><button type="button" class="nb icon" data-jm="close" aria-label="' + L('Fechar', 'Close') + '">' + icon('xmark', '') + '</button></div>' : '') +
      '<div class="sheet-c">' + content + '</div></div>';
    doc.body.appendChild(layer);
    onClose = opts.onClose || null;
    icons(layer);
    var first = layer.querySelector('.sheet [data-jm="close"], .sheet button, .sheet input');
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) {} }
    return layer.querySelector('.sheet');
  }
  function alert(o) {
    closeSheet();
    lastFocus = doc.activeElement;
    layer = doc.createElement('div');
    layer.className = 'alert-layer';
    var acts = o.actions || [{ t: L('OK', 'OK'), cls: 'fill' }];
    layer.innerHTML = '<button type="button" class="scrim" data-jm="close" aria-label="' + L('Fechar', 'Close') + '"></button>' +
      '<div class="alert" role="alertdialog" aria-labelledby="jm-alert-t"><h2 id="jm-alert-t">' + esc(o.title) + '</h2>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
      '<div class="btns' + (acts.length === 2 ? ' two' : '') + '">' + acts.map(function (a, i) {
        return '<button type="button" class="btn ' + (a.cls || '') + '" data-jm-a="' + i + '">' + esc(a.t) + '</button>';
      }).join('') + '</div></div>';
    doc.body.appendChild(layer);
    layer.addEventListener('click', function (e) {
      var b = e.target.closest('[data-jm-a]');
      if (!b) return;
      var a = acts[Number(b.getAttribute('data-jm-a'))];
      closeSheet();
      if (a && a.fn) a.fn();
    });
    // o foco começa no botão que não estraga nada (o primeiro que não é "danger")
    var btns = layer.querySelectorAll('[data-jm-a]'), safe = btns.length - 1;
    for (var k = 0; k < acts.length; k++) if (!/danger/.test(acts[k].cls || '')) { safe = k; break; }
    if (acts.some(function (a) { return /danger/.test(a.cls || ''); }) === false) safe = btns.length - 1;
    var btn = btns[safe];
    if (btn) { try { btn.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ───────────────────────── definições ───────────────────────── */

  function settings() {
    var en = lang() === 'en', on = !muted(), st = studioOn();
    var extra = typeof JM.settingsExtra === 'function' ? JM.settingsExtra() || [] : [];
    var h = '<div class="list"><div class="group">' +
      '<div class="row"><span class="tile-ic" style="--bg-ic:#5AB4FF;color:#111">' + icon('globe') + '</span><div class="row-b"><span class="row-x row-t">' + L('Língua', 'Language') + '</span>' +
      '<div class="seg" role="group" aria-label="' + L('Língua', 'Language') + '" style="min-width:170px"><button type="button" data-jm="lang" data-v="pt" aria-pressed="' + !en + '" lang="pt-PT">Português</button>' +
      '<button type="button" data-jm="lang" data-v="en" aria-pressed="' + en + '" lang="en">English</button></div></div></div>' +
      (JM.hasMusic ? '<div class="row"><span class="tile-ic" style="--bg-ic:#FF9F2E;color:#111">' + icon(on ? 'speaker' : 'speaker-off') + '</span><div class="row-b"><span class="row-x row-t">' + L('Música', 'Music') + '</span>' +
      '<button type="button" class="switch" role="switch" aria-checked="' + on + '" aria-label="' + L('Música', 'Music') + '" data-jm="sound"></button></div></div>' : '') +
      '<div class="row"><span class="tile-ic studio">' + icon('flame') + '</span><div class="row-b"><span class="row-x row-t">Studio Mode</span>' +
        '<button type="button" class="switch" role="switch" aria-checked="' + st + '" aria-label="Studio Mode" data-jm="studio-toggle"></button></div></div>' +
      '</div><p class="list-f">' + L('A língua muda tudo: os textos, as cartas e o que os outros escrevem, traduzido automaticamente.',
        'Language changes everything: the texts, the cards and what other players write, translated automatically.') + '</p></div>';
    if (extra.length) {
      h += '<div class="list"><div class="group">' + extra.map(function (x, i) {
        return '<button type="button" class="row" data-jm-x="' + i + '"><span class="tile-ic">' + icon(x.ic || 'info') + '</span><div class="row-b"><span class="row-x row-t">' + esc(L(x.t[0], x.t[1])) + '</span>' + icon('chevron-right', 'chev') + '</div></button>';
      }).join('') + '</div></div>';
    }
    h += '<p class="fine" style="text-align:center">Joguinhos do Marco</p>';
    var s = sheet(h, { title: L('Definições', 'Settings') });
    s.addEventListener('click', function (e) {
      var x = e.target.closest('[data-jm-x]');
      if (x) { var f = extra[Number(x.getAttribute('data-jm-x'))]; closeSheet(); if (f && f.fn) f.fn(); }
    });
  }

  doc.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-jm]') : null;
    if (!el) return;
    var a = el.getAttribute('data-jm');
    if (a === 'close') { closeSheet(); return; }
    if (a === 'settings') { play('tap'); settings(); return; }
    if (a === 'lang') {
      setLang(el.getAttribute('data-v'));
      play('select');
      if (layer && layer.querySelector('[data-jm="lang"]')) settings();
      return;
    }
    if (a === 'sound') {
      put(SOUND, muted() ? '1' : '0');
      el.setAttribute('aria-checked', String(!muted()));
      var ic = el.closest('.row').querySelector('.tile-ic');
      if (ic) ic.innerHTML = icon(muted() ? 'speaker-off' : 'speaker');
      emit('jm:sound', !muted());
      return;
    }
    if (a === 'studio-toggle') { e.preventDefault(); setStudio(!studioOn()); }
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && layer) { closeSheet(); return; }
    // dentro de uma folha ou de um alerta, o Tab anda só lá dentro
    if (e.key !== 'Tab') return;
    var open = doc.querySelectorAll('.alert-layer, .sheet-layer:not([hidden])'), top = open[open.length - 1];
    if (!top) return;
    var f = Array.prototype.filter.call(top.querySelectorAll('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])'), function (el) { return !el.disabled && el.offsetParent !== null && !el.classList.contains('scrim'); });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (!top.contains(doc.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // os botões só com ícone mostram o nome ao passar o rato e com o teclado (data-tip = o aria-label)
  function tips(scope) {
    (scope || doc).querySelectorAll('.nb.icon[aria-label]').forEach(function (b) { b.setAttribute('data-tip', b.getAttribute('aria-label')); });
  }

  // o caminho de volta à página com todos os joguinhos
  function home() {
    var h = html.getAttribute('data-home') || '../';
    if (/^https?:/.test(h) && /joguinhos-do-marco/.test(location.hostname)) return '/';
    return h;
  }

  /* ───────────────────────── som ─────────────────────────
     Sem sons nos joguinhos. Fica a escolha da música ("jm.sound"), que só o Impostor usa. */

  var SOUND = 'jm.sound';
  function muted() { return get(SOUND) === '0'; }
  function play() {}

  /* ───────────────────────── o fogo do Studio Mode ───────────────────────── */

  var CSS = '' +
    '.jm-fire{position:fixed;inset:auto 0 0 0;height:62vh;z-index:9999;pointer-events:none;overflow:hidden;animation:jm-rise 1.9s cubic-bezier(.2,.8,.3,1) forwards}' +
    '.jm-fire svg{position:absolute;bottom:-6%;transform-origin:50% 100%;animation:jm-flick .22s ease-in-out infinite alternate}' +
    '.jm-ember{position:absolute;bottom:0;width:9px;height:9px;border-radius:50%;background:#FFD60A;border:2px solid #111;animation:jm-ember 1.5s ease-out forwards}' +
    '.jm-glow{position:fixed;inset:0;z-index:9998;pointer-events:none;background:radial-gradient(120% 70% at 50% 110%,rgba(255,79,94,.55),rgba(255,159,46,.25) 45%,transparent 70%);animation:jm-glow 1.9s ease forwards}' +
    '@keyframes jm-rise{0%{transform:translateY(100%)}22%{transform:translateY(0)}70%{transform:translateY(4%)}100%{transform:translateY(105%)}}' +
    '@keyframes jm-flick{from{transform:scale(1,1) skewX(-3deg)}to{transform:scale(1.05,1.14) skewX(4deg)}}' +
    '@keyframes jm-ember{from{transform:translate(0,0);opacity:1}to{transform:translate(var(--dx),-70vh);opacity:0}}' +
    '@keyframes jm-glow{0%{opacity:0}20%{opacity:1}100%{opacity:0}}' +
    '@media (prefers-reduced-motion:reduce){.jm-fire{display:none}}';
  var styled = false;
  function style() {
    if (styled) return;
    styled = true;
    var s = doc.createElement('style');
    s.textContent = CSS;
    doc.head.appendChild(s);
  }
  function flame(w, at) {
    var p = 'M50 2C60 24 82 38 82 64C82 86 67 99 50 99C33 99 18 86 18 64C18 46 30 36 34 22C38 34 44 38 46 40C46 26 44 14 50 2Z';
    return '<svg viewBox="0 0 100 100" style="width:' + w + 'px;height:' + (w * 1.35) + 'px;left:calc(' + at.x + '% - ' + (w / 2) + 'px);animation-delay:-' + at.d + 's" aria-hidden="true">' +
      '<path d="' + p + '" fill="#FF4F5E" stroke="#111" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M50 30C56 44 70 52 70 68C70 82 61 92 50 92C39 92 30 82 30 68C30 56 40 50 44 40C46 46 48 48 49 50C49 42 48 36 50 30Z" fill="#FF9F2E" stroke="#111" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M50 56C54 64 61 68 61 77C61 85 56 90 50 90C44 90 39 85 39 77C39 70 45 66 50 56Z" fill="#FFD60A" stroke="#111" stroke-width="3" stroke-linejoin="round"/></svg>';
  }
  function fire() {
    style();
    var glow = doc.createElement('div');
    glow.className = 'jm-glow';
    doc.body.appendChild(glow);
    setTimeout(function () { glow.remove(); }, 2000);
    if (CALM) return;
    var box = doc.createElement('div'), h = '', n = Math.max(7, Math.round(innerWidth / 55)), i;
    box.className = 'jm-fire';
    for (i = 0; i < n; i++) h += flame(70 + Math.random() * 110, { x: (i + 0.5) * 100 / n + (Math.random() * 6 - 3), d: Math.random() * 0.4 });
    for (i = 0; i < 16; i++) h += '<i class="jm-ember" style="left:' + Math.round(Math.random() * 100) + '%;--dx:' + Math.round(Math.random() * 120 - 60) + 'px;animation-delay:' + (0.2 + Math.random() * 0.7).toFixed(2) + 's"></i>';
    box.innerHTML = h;
    doc.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 2000);
    try { if (navigator.vibrate) navigator.vibrate([30, 40, 60]); } catch (e) {}
  }
  function studio(on) {
    if (on && !CALM) fire();
  }

  /* ── o fundo de fogo: um gradiente de brasa, partículas de fogo e brasas num canvas, e as chamas da casa em baixo ── */
  var FB = null;
  function fireBg(on, animate) {
    if (on) startBg(animate);
    else stopBg(animate);
  }
  function startBg(animate) {
    if (FB) return;
    var el = doc.createElement('div'), n = Math.max(6, Math.round(innerWidth / 62)), fl = '', i;
    el.className = 'jm-firebg';
    el.setAttribute('aria-hidden', 'true');
    for (i = 0; i < n; i++) {
      fl += flame(56 + Math.random() * 84, { x: (i + 0.5) * 100 / n + (Math.random() * 8 - 4), d: Math.random() * 0.6 })
        .replace('animation-delay', '--d:' + (0.32 + Math.random() * 0.4).toFixed(2) + 's;animation-delay');
    }
    el.innerHTML = '<canvas></canvas><div class="jm-flames">' + fl + '</div>';
    doc.body.insertBefore(el, doc.body.firstChild);
    FB = { el: el, raf: 0, parts: [], dying: false, smoke: 0 };
    if (!animate) el.classList.add('now');
    void el.offsetWidth;
    el.classList.add('on');
    if (!CALM) burn(FB);
  }
  function stopBg(animate) {
    if (!FB) return;
    var F = FB;
    FB = null;
    function end() { cancelAnimationFrame(F.raf); if (F.resize) root.removeEventListener('resize', F.resize); F.el.remove(); }
    if (!animate || CALM) { end(); return; }
    F.dying = true;
    F.smoke = 16;
    F.el.classList.add('out');
    setTimeout(end, 1500);
  }
  function sprite(rgb, soft) {
    var c = doc.createElement('canvas'), g = c.getContext('2d'), gr;
    c.width = c.height = 64;
    gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + rgb + ',1)');
    gr.addColorStop(soft ? 0.6 : 0.4, 'rgba(' + rgb + ',' + (soft ? 0.35 : 0.45) + ')');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  }
  function burn(F) {
    var cv = F.el.querySelector('canvas'), cx = cv.getContext('2d'), S = 0.5, W = 0, H = 0, last = 0;
    var SPR = [sprite('255,236,150'), sprite('255,150,50'), sprite('235,60,35')], SMOKE = sprite('70,60,58', true);
    F.resize = function () { W = cv.width = Math.ceil(innerWidth * S); H = cv.height = Math.ceil(innerHeight * S); };
    F.resize();
    root.addEventListener('resize', F.resize);
    function frame(t) {
      F.raf = requestAnimationFrame(frame);
      if (doc.hidden || t - last < 32) return;               // ~30 imagens por segundo chegam e poupam a bateria
      last = t;
      var P = F.parts, k, p, q, r;
      if (!F.dying) {
        for (k = Math.max(3, Math.round(W / 45)); k > 0; k--) P.push({ x: Math.random() * W, y: H + 6, vx: (Math.random() - 0.5) * 0.5, vy: -(1 + Math.random() * 1.6), r: 10 + Math.random() * 16, t: 0, m: 40 + Math.random() * 40 });
        if (Math.random() < 0.55) P.push({ x: Math.random() * W, y: H, vx: (Math.random() - 0.5) * 0.6, vy: -(1.4 + Math.random() * 1.6), r: 0.9 + Math.random() * 1.2, t: 0, m: 90 + Math.random() * 120, e: 1, ph: Math.random() * 6 });
      } else if (F.smoke-- > 0) {
        for (k = 0; k < 3; k++) P.push({ x: Math.random() * W, y: H * (0.75 + Math.random() * 0.3), vx: (Math.random() - 0.5) * 0.4, vy: -(0.4 + Math.random() * 0.6), r: 20 + Math.random() * 26, t: 0, m: 50 + Math.random() * 30, s: 1 });
      }
      cx.globalCompositeOperation = 'source-over';
      cx.globalAlpha = 1;
      cx.clearRect(0, 0, W, H);
      for (k = P.length - 1; k >= 0; k--) {
        p = P[k];
        p.t++;
        q = p.t / p.m;
        if (q >= 1 || p.y < -30) { P.splice(k, 1); continue; }
        p.x += p.vx + (p.e ? Math.sin(p.t / 9 + p.ph) * 0.35 : 0);
        p.y += p.vy;
        if (p.s) {                                           // fumo, ao apagar
          cx.globalCompositeOperation = 'source-over';
          cx.globalAlpha = 0.4 * (1 - q);
          r = p.r * (1 + q);
          cx.drawImage(SMOKE, p.x - r, p.y - r, r * 2, r * 2);
          continue;
        }
        cx.globalCompositeOperation = 'lighter';
        if (p.e) {                                           // brasa
          cx.globalAlpha = 1 - q;
          r = p.r * 3;
          cx.drawImage(SPR[0], p.x - r, p.y - r, r * 2, r * 2);
          continue;
        }
        r = p.r * (1 - q * 0.55);                            // fogo: amarelo, laranja, vermelho
        cx.globalAlpha = 0.55 * (1 - q);
        cx.drawImage(SPR[q < 0.3 ? 0 : q < 0.65 ? 1 : 2], p.x - r, p.y - r, r * 2, r * 2);
      }
    }
    F.raf = requestAnimationFrame(frame);
  }

  /* ───────────────────────── o ranking ─────────────────────────
     Uma conta para todos os joguinhos (a mesma do Angry Men, guardada em "am.account"), um Elo por joguinho e um geral.
     O servidor é o do site dos Joguinhos (/api/, netlify/functions/jm-api.mjs); os jogos que vivem noutros sites
     falam com ele pelo endereço completo. Sem servidor (sem net, no computador de testes) joga-se na mesma, sem contar.
       <div class="list" data-jm-rank-row="impostor"></div>   a linha "Ranking" no início de cada joguinho (o jm.js desenha-a)
       JM.rank.open(jogo) · JM.rank.account(depois) · JM.rank.name() · JM.rank.note() (a frase para as salas online)
       JM.rank.start(jogo, id) · JM.rank.end(jogo, id, [[1.º lugar], [2.º], …]) · JM.rank.puzzle(id, ganhou, erros, grupos) */
  var RK_API = (/^(joguinhos-do-marco\.netlify\.app|localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : 'https://joguinhos-do-marco.netlify.app') + '/api/';
  var RK_ACC = 'am.account', RK_ME = 'jm.rank';
  var RK_TIERS = [0, 850, 900, 950, 1000, 1050, 1100, 1150, 1200, 1275, 1350, 1425, 1500, 1600, 1700, 1850], RK_PLACE = 5;
  var RK_GAMES = ['all', 'impostor', 'cartas', 'conexoes', 'quem', 'angry'];
  var RK_SHORT = { all: ['Geral', 'Overall'], impostor: ['Impostor', 'Impostor'], cartas: ['Cartas', 'Cards'], conexoes: ['Connections', 'Connections'], quem: ['Quem é Quem', "Who's Who"], angry: ['Angry Men', 'Angry Men'] };
  var RK_NAMES = [['Novato I', 'Rookie I'], ['Novato II', 'Rookie II'], ['Novato III', 'Rookie III'],
    ['Amador I', 'Amateur I'], ['Amador II', 'Amateur II'], ['Amador III', 'Amateur III'],
    ['Craque I', 'Ace I'], ['Craque II', 'Ace II'], ['Craque III', 'Ace III'],
    ['Mestre I', 'Master I'], ['Mestre II', 'Master II'], ['Mestre III', 'Master III'],
    ['Grão-Mestre', 'Grandmaster'], ['Campeão', 'Champion'], ['Fenómeno', 'Phenom'], ['Lenda dos Joguinhos', 'Joguinhos Legend']];
  // o Angry Men tem os seus nomes (os de sempre)
  var RK_ANGRY = [['Ferro-Velho I', 'Scrap I'], ['Ferro-Velho II', 'Scrap II'], ['Ferro-Velho III', 'Scrap III'],
    ['Tijolo I', 'Brick I'], ['Tijolo II', 'Brick II'], ['Tijolo III', 'Brick III'],
    ['Betão I', 'Concrete I'], ['Betão II', 'Concrete II'], ['Betão III', 'Concrete III'],
    ['Aço I', 'Steel I'], ['Aço II', 'Steel II'], ['Aço III', 'Steel III'],
    ['Demolidor', 'Wrecker'], ['Demolidor de Elite', 'Elite Wrecker'], ['Mestre da Fisga', 'Sling Master'], ['Lenda da Demolição', 'Demolition Legend']];
  var RK_COL = [['#D49A6A', '#8A5236', '#5A3220'], ['#E8806A', '#B03E2C', '#6E2216'], ['#C7CFD6', '#7D8893', '#4A535C'],
    ['#8EC0F2', '#3B6DAE', '#1E3E6E'], ['#FFD27A', '#D98A1C', '#8A520A'], ['#FFE9A0', '#E8AE20', '#8F6608'], ['#D6A6F0', '#8E44AD', '#4E1E66'], ['#FF9A9F', '#D62B3A', '#7A0F1A']];
  var RK_HOW = {
    all: ['Todas as partidas a contar, de todos os joguinhos, mexem neste Elo. É a tabela de quem joga melhor a tudo.', 'Every ranked game, in every game, moves this Elo. It’s the table of who plays best at everything.'],
    impostor: ['Cada um no seu telemóvel, cada partida entre contas conta: se apanham o impostor, sobe quem o apanhou; se ele escapa, sobe o impostor.', 'Each on their phone, every game between accounts counts: catch the impostor and the catchers go up; if they get away, the impostor does.'],
    cartas: ['Cada jogo jogado até ao fim conta: ficas à frente de quem fez menos pontos e atrás de quem fez mais.', 'Every game played to the end counts: you finish ahead of whoever scored less and behind whoever scored more.'],
    conexoes: ['Cada ronda conta uma vez por conta: resolver com poucos erros sobe, perder desce. Cada ronda tem o seu Elo, por isso as que custam a muita gente valem mais.', 'Each round counts once per account: solving with few mistakes goes up, losing goes down. Each round has its own Elo, so the ones many people miss are worth more.'],
    quem: ['Cada um no seu telemóvel, com os dois ligados: quem adivinha primeiro a pessoa do outro sobe.', 'Each on their phone, with both linked: whoever guesses the other one’s person first goes up.'],
    angry: ['Online, cada jogo entre duas contas conta: do Ferro-Velho à Lenda da Demolição.', 'Online, every game between two accounts counts: from Scrap to Demolition Legend.']
  };
  var RK_ERR = {
    name: ['O nome tem de ter 3 a 16 letras ou números (pode ter _ . -).', 'The name needs 3 to 16 letters or numbers (_ . - allowed).'],
    taken: ['Esse nome já tem dono. Escolhe outro.', 'That name is taken. Pick another one.'],
    pass: ['A palavra-passe tem de ter pelo menos 6 caracteres.', 'The password needs at least 6 characters.'],
    wrong: ['Nome ou palavra-passe errados.', 'Wrong name or password.'],
    slow: ['Demasiadas tentativas. Espera um bocadinho e tenta outra vez.', 'Too many tries. Wait a little and try again.'],
    net: ['Sem ligação ao servidor do ranking. Vê se tens internet.', 'No connection to the ranking server. Check your internet.']
  };

  function rkTier(elo, games) {
    if (!(games >= RK_PLACE)) return -1;
    var t = 0;
    for (var i = 0; i < RK_TIERS.length; i++) if (elo >= RK_TIERS[i]) t = i;
    return t;
  }
  function rkTierName(t, g) { return t < 0 ? L('Em calibração', 'Placement') : L.apply(null, (g === 'angry' ? RK_ANGRY : RK_NAMES)[t]); }
  function rkGame(g) { return L.apply(null, RK_SHORT[g] || RK_SHORT.all); }
  // o emblema: um escudo da cor do escalão; dentro, 1 a 3 divisas (I–III) ou o símbolo dos escalões de cima
  function rkBadge(t, px, g) {
    px = px || 28;
    var k = t < 0 ? -1 : t < 12 ? Math.floor(t / 3) : 4 + (t - 12), c = k < 0 ? ['#E5E5EA', '#A1A1AA', '#6B6B73'] : RK_COL[k];
    var id = 'jr' + Math.random().toString(36).slice(2, 8), inner = '';
    if (t < 0) inner = '<text x="16" y="21.5" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" font-family="ui-rounded,system-ui,sans-serif">?</text>';
    else if (t < 12) {
      for (var j = 0; j <= t % 3; j++) { var y = 19.5 - j * 4.6 + (t % 3) * 2.3; inner += '<path d="M9.5 ' + (y + 2.6) + 'L16 ' + (y - 1.2) + 'L22.5 ' + (y + 2.6) + '" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'; }
    } else if (g === 'angry' && t < 15) inner = [
      // os do Angry Men: a bola de demolição, a estrela e a fisga
      '<path d="M16 7v6" stroke="#fff" stroke-width="1.8" stroke-dasharray="1.6 1.2"/><circle cx="16" cy="18.5" r="5.2" fill="#fff"/><circle cx="14.4" cy="17" r="1.4" fill="' + c[1] + '" opacity=".5"/>',
      '<path d="M16 9.2l2 4.3 4.6.5-3.4 3.1 1 4.6L16 19.4l-4.2 2.3 1-4.6-3.4-3.1 4.6-.5z" fill="#fff"/>',
      '<path d="M11 9.5c0 4 2.2 6 5 6.6M21 9.5c0 4-2.2 6-5 6.6M16 16v7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M11 9.5h10" stroke="#fff" stroke-width="1.2" opacity=".7"/>'][t - 12];
    // os dos outros joguinhos: a estrela, a taça e a estrela com brilho
    else if (t === 12) inner = '<path d="M16 9.2l2 4.3 4.6.5-3.4 3.1 1 4.6L16 19.4l-4.2 2.3 1-4.6-3.4-3.1 4.6-.5z" fill="#fff"/>';
    else if (t === 13) inner = '<path d="M11.5 9h9v3.6a4.5 4.5 0 0 1-9 0z" fill="#fff"/><path d="M11.5 10.2H9.6v.9a2.6 2.6 0 0 0 2.4 2.6M20.5 10.2h1.9v.9a2.6 2.6 0 0 1-2.4 2.6" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M14.8 16.8h2.4v3h-2.4z" fill="#fff"/><rect x="12.2" y="19.6" width="7.6" height="2.2" rx="1.1" fill="#fff"/>';
    else if (t === 14) inner = '<path d="M16 8.5l2.2 5 5.3.4-4 3.5 1.2 5.2L16 19.9l-4.7 2.7 1.2-5.2-4-3.5 5.3-.4z" fill="#fff"/><circle cx="16" cy="16.6" r="1.6" fill="' + c[1] + '"/>';
    else inner = '<path d="M9.5 20.5l-1-9 4.2 3.6L16 9l3.3 6.1 4.2-3.6-1 9z" fill="#fff"/><rect x="9.5" y="21.6" width="13" height="2" rx="1" fill="#fff"/>';
    return '<svg class="jr-b" width="' + px + '" height="' + px + '" viewBox="0 0 32 32" role="img" aria-label="' + esc(rkTierName(t, g)) + '">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs>' +
      '<path d="M16 2.5l11 4v8.6c0 7-4.6 11.8-11 14.4C9.6 26.9 5 22.1 5 15.1V6.5z" fill="url(#' + id + ')" stroke="' + c[2] + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M16 4.6l9 3.3v2.4C21 9 11 9 7 10.3V7.9z" fill="#fff" opacity=".28"/>' + inner + '</svg>';
  }

  function rkAcc() { try { var a = JSON.parse(get(RK_ACC)); return a && a.token && a.name ? a : null; } catch (e) { return null; } }
  function rkMe() {
    var a = rkAcc();
    if (!a) return null;
    try { var m = JSON.parse(get(RK_ME)); return m && m.name === a.name ? m : null; } catch (e) { return null; }
  }
  function rkReq(method, action, body) {
    var opt = { method: method, headers: { 'content-type': 'application/json' } };
    if (method === 'POST') opt.body = JSON.stringify(body || {});
    var url = RK_API + action + (method === 'GET' && body ? '?' + new URLSearchParams(body).toString() : '');
    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 404 && !d.error) return { ok: false, status: 0, data: {} };     // sem servidor: cai na página de erro
        return { ok: r.ok, status: r.status, data: d };
      });
    }).catch(function () { return { ok: false, status: 0, data: {} }; });
  }
  function rkLogout() { put(RK_ACC, null); put(RK_ME, null); rkRows(); emit('jm:account', null); }
  var rkBusy = null;
  function rkRefresh(force) {
    var a = rkAcc(), m = rkMe();
    if (!a) return Promise.resolve(null);
    if (!force && m && Date.now() - (m.at || 0) < 60000) return Promise.resolve(m);
    if (rkBusy) return rkBusy;
    rkBusy = rkReq('POST', 'me', { token: a.token }).then(function (r) {
      rkBusy = null;
      if (r.status === 401) { rkLogout(); return null; }
      if (!r.ok) return m;
      var me = { name: r.data.name, games: r.data.games, at: Date.now() };
      put(RK_ME, JSON.stringify(me));
      rkRows();
      return me;
    });
    return rkBusy;
  }
  function rkCard(g) { var m = rkMe(); return m && m.games && m.games[g] ? m.games[g] : null; }

  // a linha "Ranking" no início de cada joguinho e da página inicial
  function rkRows() {
    var a = rkAcc();
    doc.querySelectorAll('[data-jm-rank-row]').forEach(function (box) {
      var g = box.getAttribute('data-jm-rank-row') || 'all', c = rkCard(g), sub, ic;
      if (a && c) {
        var t = rkTier(c.elo, c.games);
        ic = rkBadge(t, 40, g);
        sub = a.name + ' · ' + (t < 0 ? rkTierName(t, g) + ' · ' + c.games + '/' + RK_PLACE + L(' partidas', ' games') : rkTierName(t, g) + ' · ' + c.elo + ' Elo' + (c.pos ? ' · ' + c.pos + 'º' : ''));
      } else if (a) {
        ic = icon('trophy');
        sub = a.name + ' · ' + L('a carregar…', 'loading…');
      } else {
        ic = icon('trophy');
        sub = g === 'all' ? L('Todos os joguinhos numa só tabela. Cria conta para entrares.', 'Every game in one table. Create an account to get in.')
          : g === 'conexoes' ? L('Cria conta e cada ronda conta para o ranking.', 'Create an account and every round counts.')
          : L('Cria conta e as partidas online contam para o ranking.', 'Create an account and online games count.');
      }
      box.innerHTML = '<div class="group"><button type="button" class="row big" data-jm="rank" data-g="' + g + '"><span class="tile-ic lg jr-ic">' + ic + '</span>' +
        '<div class="row-b"><span class="row-x"><span class="row-t">' + (g === 'all' ? L('Ranking geral', 'Overall ranking') : 'Ranking') + '</span><span class="row-s">' + esc(sub) + '</span></span>' + icon('chevron-right', 'chev') + '</div></button></div>';
    });
  }

  // a folha do ranking: os joguinhos em cima, o teu lugar, a tabela e os escalões
  function rkOpen(g) {
    g = RK_GAMES.indexOf(g) >= 0 ? g : 'all';
    var s = sheet('<div class="jr"><div class="chips jr-tabs" role="group" aria-label="' + L('Joguinho', 'Game') + '">' + RK_GAMES.map(function (k) {
      return '<button type="button" class="chip" data-jr-g="' + k + '" aria-pressed="' + (k === g) + '">' + esc(rkGame(k)) + '</button>';
    }).join('') + '</div><div class="jr-me" id="jr-me"></div><div class="jr-list" id="jr-list"></div><div class="jr-how" id="jr-how"></div><div class="jr-foot" id="jr-foot"></div></div>', { title: 'Ranking' });
    var cur = g, seq = 0;
    function paint() {
      var a = rkAcc(), c = rkCard(cur), me = s.querySelector('#jr-me');
      if (!a) {
        me.className = 'jr-me cta';
        me.innerHTML = '<p>' + esc(L('Cria uma conta (ou entra na tua) para apareceres aqui. Depois não tens de fazer nada: as partidas contam sozinhas.', 'Create an account (or sign in) to show up here. Then there’s nothing to do: games count by themselves.')) + '</p>' +
          '<button type="button" class="btn fill block" data-jr="acc">' + L('Criar conta ou entrar', 'Create an account or sign in') + '</button>';
      } else {
        c = c || { elo: 1000, games: 0, w: 0, l: 0, d: 0, peak: 1000, pos: null, of: 0 };
        var t = rkTier(c.elo, c.games), nx = t >= 0 && t + 1 < RK_TIERS.length ? RK_TIERS[t + 1] : null, base = t < 0 ? 0 : RK_TIERS[t];
        var prog = t < 0 ? c.games / RK_PLACE : nx ? (c.elo - base) / (nx - base) : 1;
        me.className = 'jr-me';
        me.innerHTML = rkBadge(t, 60, cur) + '<div class="jr-mx"><b class="jr-n">' + esc(a.name) + '</b><span class="jr-t">' + esc(rkTierName(t, cur)) + (t >= 0 ? ' · ' + c.elo + ' Elo' : '') + '</span>' +
          '<span class="jr-bar" role="img" aria-label="' + Math.round(Math.max(0, Math.min(1, prog)) * 100) + '%"><i style="width:' + Math.round(Math.max(0, Math.min(1, prog)) * 100) + '%"></i></span></div>' +
          '<p class="jr-s">' + esc(t < 0 ? L('Faltam ' + (RK_PLACE - c.games) + (RK_PLACE - c.games === 1 ? ' partida' : ' partidas') + ' para teres escalão.', (RK_PLACE - c.games) + ' more ' + (RK_PLACE - c.games === 1 ? 'game' : 'games') + ' until you get a rank.')
            : nx ? L('Faltam ' + (nx - c.elo) + ' pontos para ' + rkTierName(t + 1, cur) + '.', (nx - c.elo) + ' points to ' + rkTierName(t + 1, cur) + '.') : L('Estás no topo.', 'You’re at the top.')) + '</p>' +
          '<dl class="jr-st"><div><dt>' + L('Lugar', 'Place') + '</dt><dd>' + (c.pos ? c.pos + 'º' : '—') + '</dd></div><div><dt>' + L('Partidas', 'Games') + '</dt><dd>' + c.games + '</dd></div>' +
          '<div><dt>' + L('Vitórias', 'Wins') + '</dt><dd>' + c.w + '</dd></div><div><dt>' + L('Melhor', 'Best') + '</dt><dd>' + c.peak + '</dd></div></dl>';
      }
      s.querySelector('#jr-how').innerHTML = '<details><summary>' + L('Como funciona e os escalões', 'How it works and the ranks') + icon('chevron-down', 'chev') + '</summary>' +
        '<p>' + esc(L.apply(null, RK_HOW[cur])) + ' ' + esc(L('Toda a gente começa nos 1000 e as primeiras 5 partidas são de calibração. Ganhar a quem está acima vale mais do que ganhar a quem está abaixo.', 'Everyone starts at 1000 and the first 5 games are placement. Beating someone above you is worth more than beating someone below.')) + '</p>' +
        '<ol class="jr-ladder">' + RK_TIERS.map(function (e, t) { return '<li>' + rkBadge(t, 30, cur) + '<span class="jr-ln">' + esc(rkTierName(t, cur)) + '</span><span class="jr-le">' + (t ? e + '+' : '<' + RK_TIERS[1]) + '</span></li>'; }).join('') + '</ol></details>';
      s.querySelector('#jr-foot').innerHTML = a ? '<button type="button" class="btn block" data-jr="out">' + L('Sair da conta ', 'Sign out of ') + esc(a.name) + '</button>' : '';
      board();
    }
    function board() {
      var box = s.querySelector('#jr-list'), mine = (rkAcc() || {}).name, n = ++seq, k = cur;
      box.innerHTML = '<p class="jr-wait"><span class="spin" aria-hidden="true"></span>' + L('A carregar o ranking…', 'Loading the ranking…') + '</p>';
      rkReq('GET', 'board', { game: k }).then(function (r) {
        if (n !== seq || !doc.body.contains(s)) return;
        if (!r.ok) { box.innerHTML = '<p class="jr-wait">' + L('Sem ligação ao servidor do ranking. Tenta mais logo.', 'No connection to the ranking server. Try again later.') + '</p>'; return; }
        var P = r.data.players || [];
        if (!P.length) { box.innerHTML = '<p class="jr-wait">' + esc(k === 'conexoes' ? L('Ainda ninguém jogou com conta. Sê o primeiro!', 'Nobody has played with an account yet. Be the first!') : L('Ainda ninguém jogou a contar. Sê o primeiro!', 'Nobody has played a ranked game yet. Be the first!')) + '</p>'; return; }
        var pos = 0;
        box.innerHTML = '<ol class="jr-ol">' + P.slice(0, 100).map(function (p) {
          var placed = p.tier >= 0;
          if (placed) pos++;
          var sub = k === 'all' && p.by ? '<span class="jr-dots" aria-label="' + Object.keys(p.by).map(rkGame).join(', ') + '">' + RK_GAMES.slice(1).filter(function (x) { return p.by[x]; }).map(function (x) { return '<i style="--c:var(--c-' + x + ')"></i>'; }).join('') + '</span>' + esc(rkTierName(p.tier, k)) : esc(rkTierName(p.tier, k));
          return '<li class="jr-row' + (mine && p.name.toLowerCase() === mine.toLowerCase() ? ' me' : '') + '"><span class="jr-p">' + (placed ? pos : '–') + '</span>' + rkBadge(p.tier, 30, k) +
            '<span class="jr-x"><span class="jr-rn">' + esc(p.name) + '</span><span class="jr-rt">' + sub + '</span></span>' +
            '<span class="jr-e"><b>' + (placed ? p.elo : '—') + '</b><small>' + p.w + L('V', 'W') + ' · ' + p.l + L('D', 'L') + '</small></span></li>';
        }).join('') + '</ol>';
      });
    }
    s.addEventListener('click', function (e) {
      var b = e.target.closest('[data-jr-g]');
      if (b) {
        cur = b.getAttribute('data-jr-g');
        s.querySelectorAll('[data-jr-g]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        paint();
        return;
      }
      var x = e.target.closest('[data-jr]');
      if (!x) return;
      if (x.getAttribute('data-jr') === 'acc') rkAccount(function () { rkOpen(cur); });
      else alert({ title: L('Sair da conta?', 'Sign out?'), text: L('Para voltar a entrar neste telemóvel precisas da palavra-passe.', 'To sign back in on this phone you’ll need the password.'),
        actions: [{ t: L('Ficar', 'Stay') }, { t: L('Sair', 'Sign out'), cls: 'danger', fn: function () { rkLogout(); toast(L('Saíste da conta.', 'Signed out.')); } }] });
    });
    paint();
    if (rkAcc()) rkRefresh(true).then(function () { if (doc.body.contains(s)) paint(); });
  }

  // criar conta ou entrar (o nome é para sempre)
  function rkAccount(then) {
    var reg = true;
    var s = sheet('<form class="jr-acc" novalidate>' +
      '<div class="seg" role="group" aria-label="' + L('Conta', 'Account') + '"><button type="button" data-k="register" aria-pressed="true">' + L('Criar conta', 'Create account') + '</button><button type="button" data-k="login" aria-pressed="false">' + L('Já tenho conta', 'I have one') + '</button></div>' +
      '<label class="jr-l" for="jr-name">' + L('Nome', 'Name') + '</label>' +
      '<input class="field" id="jr-name" name="username" autocomplete="username" maxlength="16" autocapitalize="off" autocorrect="off" spellcheck="false" required>' +
      '<p class="jr-hint" id="jr-hint"></p>' +
      '<label class="jr-l" for="jr-pass">' + L('Palavra-passe', 'Password') + '</label>' +
      '<input class="field" id="jr-pass" name="password" type="password" maxlength="72" required>' +
      '<p class="field-err" id="jr-warn" role="alert"></p>' +
      '<button type="submit" class="btn fill lg block" id="jr-go"></button>' +
      '<p class="list-f">' + esc(L('É a mesma conta em todos os joguinhos (e a do Angry Men). Guardamos só o nome, a palavra-passe cifrada e os resultados das partidas a contar. O nome e o Elo aparecem no ranking, que é público.', 'It’s the same account in every game (and in Angry Men). We only keep the name, the encrypted password and the results of ranked games. The name and the Elo show on the ranking, which is public.')) + '</p>' +
      '</form>', { title: L('A tua conta', 'Your account') });
    var form = s.querySelector('form');
    function mode(k) {
      reg = k === 'register';
      form.querySelectorAll('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === k)); });
      form.querySelector('#jr-go').textContent = reg ? L('Criar conta', 'Create account') : L('Entrar', 'Sign in');
      form.querySelector('#jr-hint').textContent = reg ? L('3 a 16 letras ou números. É o teu nome no ranking e não se pode mudar.', '3 to 16 letters or numbers. It’s your name on the ranking and can’t be changed.') : '';
      form.querySelector('#jr-hint').hidden = !reg;
      form.querySelector('#jr-pass').setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
      form.querySelector('#jr-warn').textContent = '';
    }
    mode('register');
    form.querySelectorAll('.seg button').forEach(function (b) { b.addEventListener('click', function () { mode(b.getAttribute('data-k')); }); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.querySelector('#jr-name').value.trim(), pass = form.querySelector('#jr-pass').value, go = form.querySelector('#jr-go'), warn = form.querySelector('#jr-warn');
      var bad = reg && !/^[\p{L}\p{N}_.-]{3,16}$/u.test(name) ? 'name' : reg && pass.length < 6 ? 'pass' : !name || !pass ? 'wrong' : null;
      if (bad) { warn.textContent = L.apply(null, RK_ERR[bad]); return; }
      go.disabled = true;
      warn.textContent = '';
      rkReq('POST', reg ? 'register' : 'login', { name: name, pass: pass }).then(function (r) {
        go.disabled = false;
        if (r.ok && r.data.token) {
          put(RK_ACC, JSON.stringify({ name: r.data.me.name, token: r.data.token, me: r.data.me }));
          put(RK_ME, null);
          closeSheet();
          toast(reg ? L('Conta criada. Bem-vindo, ', 'Account created. Welcome, ') + r.data.me.name + '!' : L('Olá outra vez, ', 'Welcome back, ') + r.data.me.name + '!');
          rkRows();
          emit('jm:account', r.data.me.name);
          rkRefresh(true);
          if (then) then();
          return;
        }
        var k = r.status === 0 ? 'net' : (r.data && RK_ERR[r.data.error] ? r.data.error : 'net');
        warn.textContent = L.apply(null, RK_ERR[k]);
      });
    });
    setTimeout(function () { try { form.querySelector('#jr-name').focus(); } catch (e) {} }, 300);
  }

  // a frase das salas online: conta ou não conta para o ranking
  function rkNote() {
    var a = rkAcc();
    return '<p class="jr-note">' + icon('trophy') + '<span>' + (a ? L('Conta para o ranking de <b>' + esc(a.name) + '</b>, contra quem também tiver conta.', 'Counts for <b>' + esc(a.name) + '</b>’s ranking, against anyone else with an account.')
      : L('Sem conta, esta partida não conta para o ranking. ', 'Without an account, this game won’t count for the ranking. ') + '<button type="button" class="jr-link" data-jm="rank-acc">' + L('Criar conta ou entrar', 'Create an account or sign in') + '</button>') + '</span></p>';
  }
  // o fim de uma partida a contar: diz quanto subiu ou desceu
  function rkSay(g, o) {
    if (!o) return;
    if (o.status === 'done') {
      var d = o.delta, t = rkTier(o.elo, 99);
      toast(L('Ranking: ', 'Ranking: ') + (d >= 0 ? '+' : '−') + Math.abs(d) + ' · ' + o.elo + ' Elo' + (o.tier >= 0 ? ' · ' + rkTierName(o.tier, g) : ''));
      rkRefresh(true);
      emit('jm:rank', { game: g, outcome: o, tier: t });
    } else if (o.status === 'void') toast(L('Esta partida não contou: os telemóveis não disseram o mesmo.', 'This game didn’t count: the phones didn’t agree.'));
  }
  function rkStart(g, id) {
    var a = rkAcc();
    return a ? rkReq('POST', 'play/start', { token: a.token, game: g, id: id }) : Promise.resolve(null);
  }
  function rkEnd(g, id, order) {
    var a = rkAcc();
    if (!a) return Promise.resolve(null);
    return rkReq('POST', 'play/end', { token: a.token, game: g, id: id, order: order }).then(function (r) {
      if (!r.ok) return null;
      if (r.data.status !== 'pending') { rkSay(g, r.data); return r.data; }
      // à espera dos outros telemóveis: pergunta outra vez durante um minuto
      return new Promise(function (res) {
        var n = 0;
        (function again() {
          setTimeout(function () {
            rkReq('POST', 'play/status', { token: a.token, game: g, id: id }).then(function (q) {
              if (q.ok && q.data.status !== 'pending') { rkSay(g, q.data); res(q.data); return; }
              if (++n < 12) again(); else res(r.data);
            });
          }, 5000);
        })();
      });
    });
  }
  function rkPuzzle(id, won, mistakes, found) {
    var a = rkAcc();
    if (!a) return Promise.resolve(null);
    return rkReq('POST', 'puzzle', { token: a.token, id: id, won: !!won, mistakes: mistakes || 0, found: found || 0 }).then(function (r) {
      if (r.ok) rkSay('conexoes', r.data);
      return r.ok ? r.data : null;
    });
  }
  doc.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-jm="rank"], [data-jm="rank-acc"]') : null;
    if (!el) return;
    if (el.getAttribute('data-jm') === 'rank') rkOpen(el.getAttribute('data-g') || 'all');
    else rkAccount(null);
  });
  var rank = {
    open: rkOpen, account: rkAccount, rows: rkRows, refresh: rkRefresh, note: rkNote,
    name: function () { var a = rkAcc(); return a ? a.name : null; },
    start: rkStart, end: rkEnd, puzzle: rkPuzzle, say: rkSay,
    tier: rkTier, tierName: rkTierName, badge: rkBadge, logout: rkLogout
  };

  var JM = root.JM = {
    lang: lang, setLang: setLang, L: L, i18n: i18n,
    translate: translate, tx: tx,
    studioOn: studioOn, setStudio: setStudio, door: door, studio: studio, fire: fire,
    icon: icon, icons: icons, tips: tips, screen: screen, toast: toast, alert: alert, sheet: sheet, closeSheet: closeSheet,
    settings: settings, settingsExtra: null, home: home,
    play: play, muted: muted, esc: esc, rank: rank
  };

  function boot() {
    i18n();
    icons();
    tips();
    studioRows();
    if (studioOn()) fireBg(true, false);
    root.addEventListener('jm:lang', studioRows);
    rkRows();
    root.addEventListener('jm:lang', rkRows);
    if (rkAcc()) rkRefresh(false);
    doc.querySelectorAll('a[data-jm-home]').forEach(function (a) { a.href = home(); });
    doc.querySelectorAll('[data-jm-door]').forEach(door);
    scrolled();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof self !== 'undefined' ? self : this);
