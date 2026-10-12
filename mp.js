/* mp.js — interface do multiplayer (v2). Liga os ecrãs ao online.js.
   Fluxo: lobby → (compor pista → revelar uma a uma) ×2 → votar → resultado.
   Pista = Escrever / Foto (upload) / Gif (Tenor). Reutiliza do app.js:
   showScreen, $, $$, escapeHtml, WORDS, isTrend, wordBank, weightedImpostorCount, state. */
(function () {
  "use strict";

  // Cola aqui a tua API key do Tenor (Google) para ligar a pesquisa de gifs.
  var TENOR_KEY = "";

  var conn = null, isHost = false, secret = Online.rid(16);
  var pub = null, priv = null, clues = {};
  var mySettings = { impMode: "manual", impCount: 1, category: "all" };

  function el(id) { return document.getElementById(id); }
  function status(msg) { var s = el("mp-status"); if (s) s.textContent = msg || ""; }
  var sig = {};
  function changed(k, v) { if (sig[k] === v) return false; sig[k] = v; return true; }
  function resetSig() { sig = {}; }
  function showScreenIf(id) { var s = el(id); if (s && !s.classList.contains("active")) showScreen(id); }

  // ── gifs do estúdio (só com Studio Mode) ──
  var GIFKEYS = { alex: 1, freire: 1, marco: 1, nuno: 1, pinto: 1, rebelo: 1, santos: 1, vitor: 1 };
  function norm(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }
  function nameHasGif(name) { return norm(name).split(/\s+/).some(function (w) { return GIFKEYS[w]; }); }
  function studioOn() { return typeof state !== "undefined" && state.studio; }
  function gifNames() {
    var bank = typeof WORDS !== "undefined" ? WORDS : [];
    return bank.filter(function (w) { return w.c === "Amigos" && nameHasGif(w.p); }).map(function (w) { return w.p; });
  }
  function renderGif(holder, name) {
    if (!holder) return;
    holder.innerHTML = ""; holder.style.display = "none";
    if (!name || !studioOn()) return;
    var cands = norm(name).split(/\s+/).filter(Boolean).concat([norm(name).replace(/\s+/g, "")]);
    var i = 0;
    (function tryNext() {
      if (i >= cands.length) return;
      var key = cands[i++], img = new Image();
      img.className = "starter-gif-img"; img.alt = "";
      img.onload = function () { holder.innerHTML = ""; holder.appendChild(img); holder.style.display = "block"; };
      img.onerror = tryNext;
      img.src = "gifs/" + encodeURIComponent(key) + ".gif";
    })();
  }
  function paintStudioAttr() { try { document.body.setAttribute("data-studio", studioOn() ? "1" : "0"); } catch (e) {} }
  function openGifModal() {
    var box = el("gif-names-list"); if (!box) return;
    var names = gifNames();
    box.innerHTML = names.length
      ? names.map(function (nm) { return '<span class="gif-name-chip">' + escapeHtml(nm) + "</span>"; }).join("")
      : '<p class="muted">Sem nomes com gif.</p>';
    el("gif-modal").hidden = false;
  }

  // ── palavra / pistas (anfitrião) ──
  function pickOnlineWord() {
    var pool = wordBank(), w = pool[Math.floor(Math.random() * pool.length)], d = w.d;
    if (w.r && w.r.length) d = w.r[Math.floor(Math.random() * w.r.length)];
    return { p: w.p, d: d || "" };
  }
  function distinctHints() {
    var seen = {}, out = [];
    wordBank().forEach(function (w) { if (w.d && w.d.trim() && !seen[w.d]) { seen[w.d] = 1; out.push(w.d); } });
    return out;
  }
  function maxImpMp(n) { return Math.max(1, Math.floor(n / 3)); }

  // ── compressão de foto ──
  function compress(file, cb) {
    var img = new Image();
    img.onload = function () {
      var max = 1000, w = img.width, h = img.height;
      if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
      else if (h > max) { w = Math.round(w * max / h); h = max; }
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      var q = 0.6, url = c.toDataURL("image/jpeg", q);
      while (url.length > 700000 && q > 0.3) { q -= 0.1; url = c.toDataURL("image/jpeg", q); }
      cb(url);
    };
    img.onerror = function () { cb(null); };
    var fr = new FileReader(); fr.onload = function (e) { img.src = e.target.result; }; fr.readAsDataURL(file);
  }

  // ── pesquisa de gifs (Tenor) ──
  function tenorSearch(q, cb) {
    if (!TENOR_KEY) { cb(null, "nokey"); return; }
    var url = "https://tenor.googleapis.com/v2/search?q=" + encodeURIComponent(q) +
      "&key=" + TENOR_KEY + "&client_key=jogo_impostor&limit=16&media_filter=tinygif,gif&contentfilter=medium";
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var list = (j.results || []).map(function (g) {
        var mf = g.media_formats || {};
        var small = (mf.tinygif && mf.tinygif.url) || (mf.gif && mf.gif.url);
        return small ? { preview: small, url: small } : null;
      }).filter(Boolean);
      cb(list);
    }).catch(function () { cb(null, "err"); });
  }

  // ── validação de pista-imagem ──
  function okImg(v) { return typeof v === "string" && (/^data:image\/(png|jpe?g|gif|webp);base64,/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v)); }
  function clueOf(round, id) {
    var raw = clues[round + "/" + id]; if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function myPlayer() {
    if (!pub) return null;
    var id = priv && priv.pid;
    for (var i = 0; i < pub.players.length; i++) if (pub.players[i].id === id) return pub.players[i];
    return null;
  }

  // ── ligação ──
  function cbs() {
    return {
      secret: secret, name: (el("mp-name").value || "Jogador").trim().slice(0, 20),
      onUpdate: function (p, mine, c) { pub = p; priv = mine; clues = c || clues; render(); },
      onNet: function (on) { var d = el("net-dot"); if (d) d.classList.toggle("on", on); },
      onFail: function (why) { fail(why); }
    };
  }
  function fail(why) {
    var msg = { noroom: "Sala não encontrada.", closed: "A sala foi fechada.", full: "A sala já começou.", nojoin: "Não foi possível entrar.", offline: "Sem ligação ao servidor." };
    if (conn) { try { conn.close(); } catch (e) {} conn = null; }
    status(msg[why] || "Erro de ligação."); showScreen("screen-online");
  }
  function create() {
    if (!el("mp-name").value.trim()) { status("Escreve o teu nome primeiro."); el("mp-name").focus(); return; }
    isHost = true; status("A criar sala…"); resetSig();
    conn = new Online.Host(cbs());
    conn.open(function (err) { if (err) { fail("offline"); return; } status(""); showScreen("screen-lobby"); });
  }
  function join() {
    var code = Online.normCode(el("mp-code").value);
    if (!el("mp-name").value.trim()) { status("Escreve o teu nome primeiro."); el("mp-name").focus(); return; }
    if (code.length !== 4) { status("O código tem 4 letras."); return; }
    isHost = false; status("A entrar…"); resetSig();
    var o = cbs(); o.room = code; conn = new Online.Guest(o); conn.open(); showScreen("screen-lobby");
  }
  function leave() {
    if (conn) { try { conn.close(true); } catch (e) {} conn = null; }
    pub = priv = null; clues = {}; resetSig(); showScreen("screen-online"); status("");
  }

  // ── router ──
  function render() {
    if (!pub) return;
    var ph = pub.phase;
    if (ph === "lobby") renderLobby();
    else if (ph === "clue") renderClue();
    else if (ph === "reveal") renderReveal();
    else if (ph === "vote") renderVote();
    else if (ph === "result") renderResult();
  }

  function renderLobby() {
    showScreenIf("screen-lobby");
    var n = pub.players.length;
    var lsig = (pub.room || "") + "|" + pub.players.map(function (p) { return p.n + (p.id === pub.host ? "*" : ""); }).join(",") + "|" + isHost + "|" + mySettings.impCount + "|" + maxImpMp(n);
    if (!changed("lobby", lsig)) return;
    el("lobby-code").textContent = pub.room || "----";
    el("lobby-count").textContent = n + (n === 1 ? " jogador" : " jogadores");
    var box = el("lobby-players"); box.innerHTML = "";
    pub.players.forEach(function (p) { var d = document.createElement("div"); d.className = "mp-player"; d.textContent = p.n + (p.id === pub.host ? " 👑" : ""); box.appendChild(d); });
    el("lobby-host").style.display = isHost ? "block" : "none";
    el("btn-lobby-start").style.display = isHost ? "flex" : "none";
    el("lobby-wait").style.display = isHost ? "none" : "block";
    if (isHost) {
      el("mp-imp-max").textContent = maxImpMp(n);
      if (mySettings.impCount > maxImpMp(n)) mySettings.impCount = maxImpMp(n);
      el("mp-imp-count").textContent = mySettings.impCount;
      el("btn-lobby-start").disabled = n < 3;
    }
  }

  // ── card do papel (partilhado) ──
  function renderRoleCard() {
    var me = myPlayer();
    var roleSig = priv ? (priv.gid + "|" + priv.role + "|" + (priv.word || "") + "|" + (priv.hint || "")) : "none";
    if (!changed("role", roleSig)) return;
    el("mp-myname").textContent = me ? me.n : "—";
    var back = el("mp-back");
    if (priv && priv.role === "impostor") {
      back.className = "card-face card-back is-impostor";
      var h = priv.hint && priv.hint.trim();
      back.innerHTML = '<div class="role-label">A tua palavra</div><div class="the-word">Impostor</div><div class="the-hint">🤫 ' + (h ? "Pista: " + escapeHtml(priv.hint) : "Sem pista — desenrasca-te! 😅") + "</div>";
    } else if (priv && priv.role === "word") {
      back.className = "card-face card-back is-word";
      back.innerHTML = '<div class="role-label">A tua palavra</div><div class="the-word">' + escapeHtml(priv.word || "—") + "</div>";
    } else {
      back.className = "card-face card-back is-word";
      back.innerHTML = '<div class="the-hint">A carregar…</div>';
    }
    el("mp-card").classList.remove("flipped");
  }

  // ── fase: compor pista ──
  function renderClue() {
    showScreenIf("screen-mp-round");
    el("mp-round-head").textContent = "RONDA " + pub.round + " / " + pub.maxRounds + " · A TUA PISTA";
    renderRoleCard();
    var me = myPlayer(), subd = me && me.sub, cnt = pub.players.filter(function (p) { return p.sub; }).length;
    var sg = pub.round + "|" + (subd ? "S" + cnt + "|" + isHost : "C");
    if (!changed("clue-foot", sg)) return;
    var foot = el("mp-round-foot");
    if (subd) {
      var s = '<div class="play-foot"><p class="muted">Pista enviada ✓</p><p class="hint-text">' + cnt + " / " + pub.players.length + " enviaram.</p>";
      if (isHost) s += '<button class="btn btn-dark btn-big" data-act="force-reveal">Avançar já →</button>';
      else s += '<p class="hint-text">À espera dos outros…</p>';
      foot.innerHTML = s + "</div>"; bindHostFoot();
    } else {
      foot.innerHTML = composerHTML(); bindComposer();
    }
  }

  function composerHTML() {
    return '<div class="composer">' +
      '<div class="comp-tabs">' +
        '<button class="comp-tab active" data-tab="text">✍️ Escrever</button>' +
        '<button class="comp-tab" data-tab="photo">📷 Foto</button>' +
        '<button class="comp-tab" data-tab="gif">🔍 Gif</button>' +
      '</div>' +
      '<div class="comp-panel" data-panel="text">' +
        '<input id="comp-text" class="write-box" placeholder="escreve a tua pista…" maxlength="40" autocomplete="off" />' +
        '<button class="btn btn-pink btn-big" id="comp-send-text">Enviar pista</button>' +
      '</div>' +
      '<div class="comp-panel hidden" data-panel="photo">' +
        '<label class="btn btn-pink btn-big" for="comp-file">📷 Escolher foto</label>' +
        '<input type="file" id="comp-file" accept="image/*" hidden />' +
      '</div>' +
      '<div class="comp-panel hidden" data-panel="gif">' +
        '<div class="gif-search"><input id="comp-gif-q" class="write-box" placeholder="procurar gif…" autocomplete="off" /><button class="btn btn-dark" id="comp-gif-go">🔍</button></div>' +
        '<div class="gif-results" id="comp-gif-results"></div>' +
      '</div>' +
    "</div>";
  }

  function bindComposer() {
    $$("#mp-round-foot .comp-tab").forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute("data-tab");
        $$("#mp-round-foot .comp-tab").forEach(function (x) { x.classList.toggle("active", x === b); });
        $$("#mp-round-foot .comp-panel").forEach(function (p) { p.classList.toggle("hidden", p.getAttribute("data-panel") !== t); });
      };
    });
    var sendText = el("comp-send-text");
    if (sendText) sendText.onclick = function () {
      var v = (el("comp-text").value || "").trim();
      if (!v) { el("comp-text").focus(); return; }
      conn.submitClue({ ty: "t", v: v });
    };
    var file = el("comp-file");
    if (file) file.onchange = function () {
      var f = file.files && file.files[0]; if (!f) return;
      el("mp-round-foot").innerHTML = '<div class="play-foot"><p class="muted">A enviar foto…</p></div>';
      compress(f, function (url) { if (url) conn.submitClue({ ty: "i", v: url }); else renderClue(); });
    };
    var go = el("comp-gif-go");
    if (go) go.onclick = runGifSearch;
    var q = el("comp-gif-q");
    if (q) q.onkeydown = function (e) { if (e.key === "Enter") runGifSearch(); };
  }

  function runGifSearch() {
    var q = (el("comp-gif-q").value || "").trim(), res = el("comp-gif-results");
    if (!q) return;
    res.innerHTML = '<p class="hint-text">A procurar…</p>';
    tenorSearch(q, function (list, errc) {
      if (errc === "nokey") { res.innerHTML = '<p class="hint-text">Pesquisa de gifs ainda não configurada (falta a chave Tenor). Usa Escrever ou Foto.</p>'; return; }
      if (!list || !list.length) { res.innerHTML = '<p class="hint-text">Sem resultados.</p>'; return; }
      res.innerHTML = "";
      list.forEach(function (g) {
        var im = new Image(); im.className = "gif-pick"; im.src = g.preview; im.alt = "";
        im.onclick = function () { conn.submitClue({ ty: "i", v: g.url }); };
        res.appendChild(im);
      });
    });
  }

  // ── fase: revelar uma a uma ──
  function renderReveal() {
    showScreenIf("screen-mp-reveal");
    var rv = pub.reveal || {}; var id = rv.id;
    var p = null; for (var i = 0; i < pub.players.length; i++) if (pub.players[i].id === id) p = pub.players[i];
    var cl = clueOf(rv.round, id);
    var rsig = pub.round + "|" + rv.idx + "|" + id + "|" + (cl ? cl.ty + cl.v.slice(0, 24) : "none") + "|" + isHost;
    if (!changed("reveal", rsig)) return;
    el("mp-reveal-prog").textContent = "RONDA " + rv.round + " / " + pub.maxRounds + " · PISTA " + (rv.idx + 1) + " / " + rv.total;
    el("mp-reveal-name").textContent = p ? p.n : "—";
    var box = el("mp-reveal-clue"); box.innerHTML = "";
    if (!cl) { box.innerHTML = '<p class="hint-text">a receber a pista…</p>'; }
    else if (cl.ty === "i" && okImg(cl.v)) { var im = new Image(); im.className = "clue-img"; im.src = cl.v; im.alt = ""; box.appendChild(im); }
    else if (cl.ty === "t") { var d = document.createElement("div"); d.className = "clue-text"; d.textContent = cl.v; box.appendChild(d); }
    else { box.innerHTML = '<p class="hint-text">pista inválida</p>'; }
    var foot = el("mp-reveal-foot");
    var last = rv.idx + 1 >= rv.total, lastRound = pub.round >= pub.maxRounds;
    foot.innerHTML = isHost
      ? '<button class="btn btn-dark btn-big" data-act="next">' + (last ? (lastRound ? "Ir a votos →" : "Ronda seguinte →") : "Próxima pista →") + "</button>"
      : '<p class="hint-text">O anfitrião avança.</p>';
    bindHostFoot();
  }

  // ── fase: votação ──
  function renderVote() {
    showScreenIf("screen-mp-vote");
    var me = myPlayer(), voted = me && me.voted, cnt = pub.players.filter(function (p) { return p.voted; }).length;
    var vsig = (voted ? "V" + cnt : "v") + "|" + isHost + "|" + pub.players.map(function (p) { return p.id; }).join(",");
    if (!changed("vote", vsig)) return;
    var box = el("mp-vote-list"); box.innerHTML = "";
    if (!voted) {
      pub.players.forEach(function (p) {
        if (priv && p.id === priv.pid) return; // não votas em ti
        var b = document.createElement("button"); b.className = "btn btn-ghost vote-btn"; b.textContent = p.n;
        b.onclick = function () { conn.vote(p.id); };
        box.appendChild(b);
      });
    }
    el("mp-vote-head").textContent = voted ? "Voto registado ✓" : "Quem é o impostor?";
    var foot = el("mp-vote-foot");
    var s = voted ? '<p class="hint-text">' + cnt + " / " + pub.players.length + " votaram.</p>" : "";
    if (isHost) s += '<button class="btn btn-dark btn-big" data-act="force-vote">Fechar votação →</button>';
    foot.innerHTML = s; bindHostFoot();
  }

  // ── fase: resultado ──
  function renderResult() {
    showScreenIf("screen-mp-result");
    var r = pub.result || {};
    if (!changed("result", pub.gid + "|" + JSON.stringify(r) + "|" + isHost)) return;
    if (r.allImp || !r.word) { el("mp-result-label").textContent = "Não havia palavra:"; el("mp-result-word").textContent = "Eram todos impostores! 🤯"; }
    else { el("mp-result-label").textContent = "A palavra era:"; el("mp-result-word").textContent = r.word; }
    var box = el("mp-impostor-names"); box.innerHTML = "";
    (r.imps || []).forEach(function (nm) { var d = document.createElement("div"); d.className = "imp"; d.textContent = "🕵️ " + nm; box.appendChild(d); });
    // veredicto da votação
    var caught = (r.top || []).some(function (nm) { return (r.imps || []).indexOf(nm) >= 0; });
    var vd = el("mp-vote-result");
    var topStr = (r.top || []).join(", ") || "—";
    vd.innerHTML = '<p class="muted top-gap">Mais votado: <b>' + escapeHtml(topStr) + "</b></p>" +
      '<p class="verdict">' + (caught ? "Apanharam o impostor! 🎉" : "O impostor escapou! 🤫") + "</p>";
    el("mp-result-foot").innerHTML = isHost
      ? '<button class="btn btn-dark btn-big" data-act="again">Jogar novamente</button><button class="btn btn-ghost btn-big" data-act="lobby">Voltar à sala</button>'
      : '<p class="hint-text">À espera do anfitrião…</p>';
    bindHostFoot();
  }

  // ── controlos do anfitrião ──
  function bindHostFoot() {
    $$("#mp-round-foot [data-act], #mp-reveal-foot [data-act], #mp-vote-foot [data-act], #mp-result-foot [data-act]").forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-act");
        if (a === "force-reveal") conn.forceReveal();
        else if (a === "next") conn.nextReveal();
        else if (a === "force-vote") conn.forceVote();
        else if (a === "again") hostStart();
        else if (a === "lobby") conn.backToLobby();
      };
    });
  }

  function hostStart() {
    if (!isHost || !conn.G) return;
    var n = conn.G.players.length; if (n < 3) return;
    conn.setSettings(mySettings);
    var allImp = false, impCount = 1;
    if (mySettings.impMode === "random") { var k = weightedImpostorCount(n); if (k >= n) allImp = true; else impCount = k; }
    else impCount = Math.min(mySettings.impCount, maxImpMp(n));
    resetSig();
    conn.startGame({ word: allImp ? null : pickOnlineWord(), allImp: allImp, impCount: impCount, allHints: allImp ? distinctHints() : null });
  }

  // ── card: pressionar e manter para ver o papel ──
  function bindCard() {
    var card = el("mp-card"), front = el("mp-front");
    var show = function (e) { e.preventDefault(); card.classList.add("flipped"); };
    var hide = function () { card.classList.remove("flipped"); };
    front.addEventListener("pointerdown", show);
    card.addEventListener("pointerup", hide);
    card.addEventListener("pointerleave", hide);
    card.addEventListener("pointercancel", hide);
    card.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  // ── partilhar sala ──
  function flashShare(msg) { var b = el("btn-share"); if (!b) return; var t = b.getAttribute("data-label") || b.textContent; b.setAttribute("data-label", t); b.textContent = msg; setTimeout(function () { b.textContent = t; }, 1600); }
  function shareRoom() {
    var code = pub && pub.room; if (!code) return;
    var url = location.origin + location.pathname + "?sala=" + code;
    if (navigator.share) { navigator.share({ title: "Jogo do Impostor", text: "Entra na minha sala: " + code, url: url }).catch(function () {}); return; }
    if (navigator.clipboard) { navigator.clipboard.writeText(url).then(function () { flashShare("Link copiado ✓"); }, function () { window.prompt("Copia o link:", url); }); }
    else window.prompt("Copia o link:", url);
  }

  function setup() {
    el("btn-online").addEventListener("click", function () { status(""); showScreen("screen-online"); });
    el("btn-create").addEventListener("click", create);
    el("btn-join").addEventListener("click", join);
    el("mp-code").addEventListener("input", function (e) { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4); });
    el("btn-lobby-leave").addEventListener("click", leave);
    el("btn-mp-leave").addEventListener("click", leave);
    el("btn-lobby-start").addEventListener("click", hostStart);

    $$("#lobby-host [data-mpmode]").forEach(function (b) {
      b.addEventListener("click", function () {
        mySettings.impMode = b.getAttribute("data-mpmode");
        $$("#lobby-host [data-mpmode]").forEach(function (x) { x.classList.toggle("active", x === b); });
        el("mp-manual-box").classList.toggle("hidden", mySettings.impMode !== "manual");
        el("mp-random-box").classList.toggle("hidden", mySettings.impMode !== "random");
      });
    });
    el("mp-imp-minus").addEventListener("click", function () { if (mySettings.impCount > 1) { mySettings.impCount--; renderLobby(); } });
    el("mp-imp-plus").addEventListener("click", function () {
      var n = conn && conn.G ? conn.G.players.length : 3;
      if (mySettings.impCount < maxImpMp(n)) { mySettings.impCount++; renderLobby(); }
    });

    bindCard();
    el("btn-share").addEventListener("click", shareRoom);
    $$("[data-gifinfo]").forEach(function (b) { b.addEventListener("click", openGifModal); });
    el("gif-modal-close").addEventListener("click", function () { el("gif-modal").hidden = true; });
    el("gif-modal").addEventListener("click", function (e) { if (e.target === el("gif-modal")) el("gif-modal").hidden = true; });

    paintStudioAttr();
    var st = el("studio-toggle");
    if (st) { st.addEventListener("click", function () { setTimeout(paintStudioAttr, 0); }); st.addEventListener("keydown", function () { setTimeout(paintStudioAttr, 0); }); }

    var room = new URLSearchParams(location.search).get("sala");
    if (room) { room = Online.normCode(room); if (room.length === 4) { el("mp-code").value = room; showScreen("screen-online"); setTimeout(function () { el("mp-name").focus(); }, 80); } }

    document.addEventListener("visibilitychange", function () { if (!document.hidden && conn) conn.check(); });
    window.addEventListener("pagehide", function () { if (conn) { try { conn.close(true); } catch (e) {} } });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
