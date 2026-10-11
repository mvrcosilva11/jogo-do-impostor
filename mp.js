/* mp.js — interface do modo multiplayer. Liga os ecrãs online ao online.js.
   Reutiliza do app.js: showScreen, $, $$, escapeHtml, WORDS, isTrend,
   weightedImpostorCount, shuffle. */
(function () {
  "use strict";
  var conn = null;          // Online.Host ou Online.Guest
  var isHost = false;
  var secret = Online.rid(16);
  var pub = null, priv = null, photos = {};
  var mySettings = { impMode: "manual", impCount: 1, photoMode: false, category: "all" };

  function el(id) { return document.getElementById(id); }
  function status(msg) { var s = el("mp-status"); if (s) s.textContent = msg || ""; }

  // Guarda de re-render: só reconstrói o DOM quando o conteúdo muda. Evita que a
  // batida de 2,5 s feche o card que estás a segurar ou troque botões a meio.
  var sig = {};
  function changed(key, val) { if (sig[key] === val) return false; sig[key] = val; return true; }
  function resetSig() { sig = {}; }

  // ── escolha de palavra (anfitrião) ──
  // wordBank() (global, do app.js) devolve as palavras em jogo: sem atualidade e,
  // com o Studio Mode desligado, sem a categoria "Amigos". O online respeita isso.
  function pickOnlineWord() {
    var pool = wordBank();
    var w = pool[Math.floor(Math.random() * pool.length)];
    var d = w.d;
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
      while (url.length > 800000 && q > 0.3) { q -= 0.1; url = c.toDataURL("image/jpeg", q); }
      cb(url);
    };
    img.onerror = function () { cb(null); };
    var fr = new FileReader();
    fr.onload = function (e) { img.src = e.target.result; };
    fr.readAsDataURL(file);
  }

  // ── ligação ──
  function cbs() {
    return {
      secret: secret,
      name: (el("mp-name").value || "Jogador").trim().slice(0, 20),
      onUpdate: function (p, mine, ph) { pub = p; priv = mine; photos = ph || photos; render(); },
      onNet: function (on) { var d = el("net-dot"); if (d) d.classList.toggle("on", on); },
      onFail: function (why) { fail(why); }
    };
  }
  function fail(why) {
    var msg = { noroom: "Sala não encontrada.", closed: "A sala foi fechada.", full: "A sala já começou.", nojoin: "Não foi possível entrar.", offline: "Sem ligação ao servidor." };
    if (conn) { try { conn.close(); } catch (e) {} conn = null; }
    status(msg[why] || "Erro de ligação.");
    showScreen("screen-online");
  }
  function create() {
    if (!el("mp-name").value.trim()) { status("Escreve o teu nome primeiro."); el("mp-name").focus(); return; }
    isHost = true; status("A criar sala…"); resetSig();
    conn = new Online.Host(cbs());
    conn.open(function (err, code) {
      if (err) { fail("offline"); return; }
      status(""); showScreen("screen-lobby");
    });
  }
  function join() {
    var code = Online.normCode(el("mp-code").value);
    if (!el("mp-name").value.trim()) { status("Escreve o teu nome primeiro."); el("mp-name").focus(); return; }
    if (code.length !== 4) { status("O código tem 4 letras."); return; }
    isHost = false; status("A entrar…"); resetSig();
    var o = cbs(); o.room = code;
    conn = new Online.Guest(o);
    conn.open();
    showScreen("screen-lobby");
  }
  function leave() {
    if (conn) { try { conn.close(true); } catch (e) {} conn = null; }
    pub = priv = null; photos = {}; resetSig();
    showScreen("screen-online"); status("");
  }

  // ── render por fase ──
  function render() {
    if (!pub) return;
    var ph = pub.phase;
    if (ph === "lobby") renderLobby();
    else if (ph === "play" || ph === "photos") renderRound();
    else if (ph === "gallery") renderGallery();
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
    pub.players.forEach(function (p) {
      var d = document.createElement("div"); d.className = "mp-player";
      d.textContent = p.n + (p.id === pub.host ? " 👑" : "");
      box.appendChild(d);
    });
    // só o anfitrião vê as opções e o botão começar
    el("lobby-host").style.display = isHost ? "block" : "none";
    el("btn-lobby-start").style.display = isHost ? "flex" : "none";
    el("lobby-wait").style.display = isHost ? "none" : "block";
    if (isHost) {
      el("mp-imp-max").textContent = maxImpMp(n);
      if (mySettings.impCount > maxImpMp(n)) { mySettings.impCount = maxImpMp(n); }
      el("mp-imp-count").textContent = mySettings.impCount;
      el("btn-lobby-start").disabled = n < 3;
    }
  }

  function renderRound() {
    showScreenIf("screen-mp-round");
    var me = myPlayer();
    // verso (papel): só reconstrói quando o papel muda — assim o card não fecha
    // sozinho a cada batida enquanto o seguras.
    var roleSig = priv ? (priv.gid + "|" + priv.role + "|" + (priv.word || "") + "|" + (priv.hint || "")) : "none";
    if (changed("round-role", roleSig)) {
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
      el("mp-card").classList.remove("flipped");  // reset só em ronda nova
    }
    // rodapé: reconstrói só quando muda a fase / quem começa / fotos enviadas
    var meph = me && me.ph ? 1 : 0;
    var done = pub.players.filter(function (p) { return p.ph; }).length;
    var footSig = pub.phase + "|" + (pub.starter || "") + "|" + isHost + "|" + meph + "|" + done + "/" + pub.players.length;
    if (changed("round-foot", footSig)) {
      var foot = el("mp-round-foot");
      if (pub.phase === "photos") { foot.innerHTML = photoFoot(); bindPhoto(); }
      else { foot.innerHTML = playFoot(); }
      bindHostFoot();
    }
  }

  function playFoot() {
    var s = '<div class="play-foot"><p class="muted">Começa a dizer a palavra:</p><div class="starter">' + escapeHtml(pub.starter || "—") + "</div>";
    s += '<p class="hint-text">Cada um diz uma palavra relacionada. Debatam e votem no impostor.</p>';
    if (isHost) s += '<button class="btn btn-pink btn-big" data-act="reveal">Revelar impostor(es)</button>';
    else s += '<p class="hint-text">O anfitrião revela quando terminarem.</p>';
    return s + "</div>";
  }

  function photoFoot() {
    var me = myPlayer(), sent = me && me.ph;
    var s = '<div class="play-foot">';
    if (!sent) {
      s += '<p class="muted">Envia uma foto como pista:</p>';
      s += '<label class="btn btn-pink btn-big" for="mp-photo-input">📸 Escolher foto</label>';
      s += '<input type="file" id="mp-photo-input" accept="image/*" hidden />';
    } else {
      var have = pub.players.filter(function (p) { return p.ph; }).length;
      s += '<p class="muted">Foto enviada ✓</p><p class="hint-text">' + have + " / " + pub.players.length + " enviaram.</p>";
    }
    if (isHost) {
      var all = pub.players.every(function (p) { return p.ph; });
      s += '<button class="btn btn-dark btn-big" data-act="gallery"' + (all ? "" : " disabled") + ">Ver fotos" + (all ? "" : " (à espera)") + "</button>";
    } else if (sent) {
      s += '<p class="hint-text">À espera que o anfitrião mostre as fotos.</p>';
    }
    return s + "</div>";
  }

  function renderGallery() {
    showScreenIf("screen-mp-gallery");
    var gsig = pub.players.map(function (p) { return p.id + (photos[p.id] ? "1" : "0"); }).join(",") + "|" + isHost;
    if (!changed("gallery", gsig)) return;
    var g = el("mp-gallery"); g.innerHTML = "";
    pub.players.forEach(function (p) {
      var cell = document.createElement("div"); cell.className = "gcell";
      var src = photos[p.id];
      var ok = src && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(src);
      cell.innerHTML = (ok ? '<img src="' + src + '" alt="">' : '<div class="gph">a enviar…</div>') + '<span class="gname">' + escapeHtml(p.n) + "</span>";
      g.appendChild(cell);
    });
    var foot = el("mp-gallery-foot");
    foot.innerHTML = isHost
      ? '<button class="btn btn-pink btn-big" data-act="reveal">Revelar impostor(es)</button>'
      : '<p class="hint-text">Debatam e votem. O anfitrião revela no fim.</p>';
    bindHostFoot();
  }

  function renderResult() {
    showScreenIf("screen-mp-result");
    var r = pub.result || {};
    if (!changed("result", pub.gid + "|" + JSON.stringify(r) + "|" + isHost)) return;
    if (r.allImp || !r.word) {
      el("mp-result-label").textContent = "Não havia palavra:";
      el("mp-result-word").textContent = "Eram todos impostores! 🤯";
    } else {
      el("mp-result-label").textContent = "A palavra era:";
      el("mp-result-word").textContent = r.word;
    }
    var box = el("mp-impostor-names"); box.innerHTML = "";
    (r.imps || []).forEach(function (nm) {
      var d = document.createElement("div"); d.className = "imp"; d.textContent = "🕵️ " + nm; box.appendChild(d);
    });
    el("mp-result-foot").innerHTML = isHost
      ? '<button class="btn btn-dark btn-big" data-act="again">Jogar novamente</button><button class="btn btn-ghost btn-big" data-act="lobby">Voltar à sala</button>'
      : '<p class="hint-text">À espera do anfitrião para a próxima ronda…</p>';
    bindHostFoot();
  }

  // ── helpers ──
  function myPlayer() {
    if (!pub) return null;
    var id = priv && priv.pid;
    for (var i = 0; i < pub.players.length; i++) if (pub.players[i].id === id) return pub.players[i];
    return null;
  }
  // evita re-mostrar (e perder foco/estado) se já estamos no ecrã certo
  function showScreenIf(id) { var s = el(id); if (!s.classList.contains("active")) showScreen(id); }

  function hostStart() {
    if (!isHost || !conn.G) return;
    var n = conn.G.players.length;
    if (n < 3) { return; }
    conn.setSettings(mySettings);
    var allImp = false, impCount = 1;
    if (mySettings.impMode === "random") {
      var k = weightedImpostorCount(n);
      if (k >= n) allImp = true; else impCount = k;
    } else {
      impCount = Math.min(mySettings.impCount, maxImpMp(n));
    }
    conn.startRound({
      word: allImp ? null : pickOnlineWord(),
      allImp: allImp, impCount: impCount,
      allHints: allImp ? distinctHints() : null
    });
  }

  function bindHostFoot() {
    $$("#mp-round-foot [data-act], #mp-gallery-foot [data-act], #mp-result-foot [data-act]").forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-act");
        if (a === "reveal") conn.reveal();
        else if (a === "gallery") conn.toGallery();
        else if (a === "again") hostStart();
        else if (a === "lobby") conn.backToLobby();
      };
    });
  }

  function bindPhoto() {
    var inp = el("mp-photo-input");
    if (!inp) return;
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      status("");
      var foot = el("mp-round-foot"); foot.innerHTML = '<div class="play-foot"><p class="muted">A enviar foto…</p></div>';
      compress(f, function (url) {
        if (!url) { renderRound(); return; }
        conn.uploadPhoto(url);
      });
    };
  }

  // ── card: pressionar e manter para revelar ──
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

  // ── setup ──
  function setup() {
    el("btn-online").addEventListener("click", function () { status(""); showScreen("screen-online"); });
    el("btn-create").addEventListener("click", create);
    el("btn-join").addEventListener("click", join);
    el("mp-code").addEventListener("input", function (e) { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4); });
    el("btn-lobby-leave").addEventListener("click", leave);
    el("btn-mp-leave").addEventListener("click", leave);
    el("btn-lobby-start").addEventListener("click", hostStart);

    // opções do anfitrião no lobby
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
    el("mp-photo-toggle").addEventListener("click", function () {
      mySettings.photoMode = !mySettings.photoMode;
      el("mp-photo-toggle").classList.toggle("on", mySettings.photoMode);
    });

    bindCard();

    // iOS mata o socket em 2.º plano → religa ao voltar
    document.addEventListener("visibilitychange", function () { if (!document.hidden && conn) conn.check(); });
    window.addEventListener("pagehide", function () { if (conn) { try { conn.close(true); } catch (e) {} } });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
