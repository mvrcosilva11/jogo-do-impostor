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
               Desligado não deixa rasto: não há interruptor à vista. Liga-se a carregar 3 s no símbolo da casa,
               ou com o endereço /studio (ou ?studio=1). Ligado, aparece nas Definições para se desligar.
   Definições  JM.settings() abre a folha comum (língua, som, Studio Mode); qualquer [data-jm="settings"] a abre.
               JM.settingsExtra = function () { return [{ t: ['Como se joga', 'How to play'], ic: 'question', fn: f }] }
   Ecrãs       JM.screen(id, back) · JM.icons(raiz) desenha <i class="ic" data-ic="nome"> · JM.icon(nome)
   Avisos      JM.toast(texto) · JM.alert({ title, text, actions: [{ t, fn, cls }] }) · JM.sheet(html, { title }) / JM.closeSheet()
   Som         JM.play('tap' | 'select' | 'toggle' | 'good' | 'bad' | 'almost' | 'win' | 'lose' | 'flip' | 'whoosh' | 'drum' | 'fire')
   Fogo        JM.studio(on): fogo pelo ecrã + crepitar ao ligar o Studio Mode
   Sons sintetizados com Web Audio (sem ficheiros). Movimento reduzido: o fogo passa a um brilho curto. */
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
  function paintStudio() {
    if (studioOn()) html.setAttribute('data-studio', '1');
    else html.removeAttribute('data-studio');
  }
  function setStudio(on, quiet) {
    put(STUDIO, on ? '1' : '0');
    paintStudio();
    if (!quiet) studio(on);
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
    var btn = layer.querySelector('.btn:last-child');
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
      '<div class="row"><span class="tile-ic" style="--bg-ic:#FF9F2E;color:#111">' + icon(on ? 'speaker' : 'speaker-off') + '</span><div class="row-b"><span class="row-x row-t">' + L('Som', 'Sound') + '</span>' +
      '<button type="button" class="switch" role="switch" aria-checked="' + on + '" aria-label="' + L('Som', 'Sound') + '" data-jm="sound"></button></div></div>' +
      (st ? '<div class="row"><span class="tile-ic studio">' + icon('flame') + '</span><div class="row-b"><span class="row-x row-t">Studio Mode</span>' +
        '<button type="button" class="switch" role="switch" aria-checked="true" aria-label="Studio Mode" data-jm="studio"></button></div></div>' : '') +
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
      play('toggle');
      var ic = el.closest('.row').querySelector('.tile-ic');
      if (ic) ic.innerHTML = icon(muted() ? 'speaker-off' : 'speaker');
      return;
    }
    if (a === 'studio') { setStudio(false); closeSheet(); toast(L('Studio Mode desligado', 'Studio Mode off')); }
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && layer) closeSheet(); });

  // o caminho de volta à página com todos os joguinhos
  function home() {
    var h = html.getAttribute('data-home') || '../';
    if (/^https?:/.test(h) && /joguinhos-do-marco/.test(location.hostname)) return '/';
    return h;
  }

  /* ───────────────────────── som ───────────────────────── */

  var SOUND = 'jm.sound', ctx = null;
  function muted() { return get(SOUND) === '0'; }
  function ac() {
    if (!ctx) {
      var C = root.AudioContext || root.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(f, at, dur, type, vol, to) {
    var a = ctx, o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  var noiseBuf = null;
  function noise(at, dur, vol, type, freq, to, q) {
    var a = ctx, t = a.currentTime + at;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf;
    s.loop = true;
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(freq || 1200, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q || 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.1, t + Math.min(0.05, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(a.destination);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }
  var SOUNDS = {
    tap: function () { tone(880, 0, 0.05, 'triangle', 0.06); },
    select: function () { tone(620, 0, 0.06, 'sine', 0.09, 760); },
    toggle: function () { tone(520, 0, 0.07, 'triangle', 0.08); tone(780, 0.06, 0.08, 'triangle', 0.08); },
    good: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, i * 0.07, 0.16, 'triangle', 0.11); }); },
    bad: function () { tone(150, 0, 0.28, 'sawtooth', 0.07, 85); noise(0, 0.12, 0.05, 'lowpass', 500); },
    almost: function () { tone(660, 0, 0.08, 'square', 0.05); tone(660, 0.12, 0.12, 'square', 0.05, 520); },
    win: function () {
      [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, i * 0.09, 0.3, 'triangle', 0.1); });
      for (var i = 0; i < 6; i++) tone(1800 + Math.random() * 1600, 0.5 + i * 0.06, 0.12, 'sine', 0.04);
    },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, i * 0.16, 0.3, 'triangle', 0.09); }); },
    flip: function () { noise(0, 0.14, 0.09, 'bandpass', 2400, 700, 1.2); },
    whoosh: function () { noise(0, 0.38, 0.12, 'bandpass', 300, 3200, 0.9); },
    drum: function () { tone(110, 0, 0.35, 'sine', 0.25, 45); noise(0, 0.08, 0.06, 'lowpass', 900); },
    fire: function () {
      noise(0, 0.5, 0.16, 'bandpass', 200, 2600, 0.7);
      noise(0.1, 1.8, 0.12, 'lowpass', 380, 220);
      for (var i = 0; i < 18; i++) noise(0.15 + Math.random() * 1.5, 0.02 + Math.random() * 0.03, 0.18, 'highpass', 2500 + Math.random() * 3000);
      tone(70, 0, 0.6, 'sine', 0.18, 40);
    }
  };
  function play(name) {
    if (muted() || !SOUNDS[name]) return;
    try { if (ac()) SOUNDS[name](); } catch (e) {}
  }

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
    if (on) { fire(); play('fire'); }
    else play('toggle');
  }

  var JM = root.JM = {
    lang: lang, setLang: setLang, L: L, i18n: i18n,
    translate: translate, tx: tx,
    studioOn: studioOn, setStudio: setStudio, door: door, studio: studio, fire: fire,
    icon: icon, icons: icons, screen: screen, toast: toast, alert: alert, sheet: sheet, closeSheet: closeSheet,
    settings: settings, settingsExtra: null, home: home,
    play: play, muted: muted, esc: esc
  };

  function boot() {
    i18n();
    icons();
    doc.querySelectorAll('a[data-jm-home]').forEach(function (a) { a.href = home(); });
    doc.querySelectorAll('[data-jm-door]').forEach(door);
    scrolled();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof self !== 'undefined' ? self : this);
