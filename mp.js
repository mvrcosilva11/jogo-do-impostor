/* mp.js — o modo online (v2). Liga os ecrãs ao online.js.
   Fluxo: sala de espera → (compor pista → revelar uma a uma) ×2 → votar → resultado.
   Pista = escrever ou foto/gif do telemóvel. Cada telemóvel vê tudo na sua língua: a palavra e a pista
   vêm do banco em inglês (words-en.js) e as pistas escritas pelos outros são traduzidas automaticamente.
   Reutiliza do app.js: showScreen, $, $$, escapeHtml, L, wordBank, weightedImpostorCount, loc, locHint, withEN, withStudio, state. */
(function () {
  "use strict";

  var conn = null, isHost = false, secret = Online.rid(16);
  var pub = null, priv = null, clues = {};
  var mySettings = { impMode: "manual", impCount: 1, category: "all" };
  var NAME_KEY = "impostor.name";

  function el(id) { return document.getElementById(id); }
  function status(msg) { var s = el("mp-status"); if (s) s.textContent = msg || ""; }
  var sig = {};
  function changed(k, v) { if (sig[k] === v) return false; sig[k] = v; return true; }
  function resetSig() { sig = {}; }
  function showScreenIf(id) { var s = el(id); if (s && !s.classList.contains("on")) showScreen(id); }
  function impWordMp(n) { return n === 1 ? L("impostor", "impostor") : L("impostores", "impostors"); }

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
  function myName() { return (el("mp-name").value || L("Jogador", "Player")).trim().slice(0, 20); }
  function cbs() {
    return {
      secret: secret, name: myName(),
      onUpdate: function (p, mine, c) { pub = p; priv = mine; clues = c || clues; render(); },
      onNet: function (on) { var d = el("net-dot"); if (d) d.classList.toggle("on", on); },
      onFail: function (why) { fail(why); }
    };
  }
  function fail(why) {
    var msg = {
      noroom: L("Não encontrei essa sala. Confirma o código.", "I couldn't find that room. Check the code."),
      closed: L("A sala foi fechada.", "The room was closed."),
      full: L("Essa sala já começou a jogar.", "That room has already started."),
      nojoin: L("Não deu para entrar. Tenta outra vez.", "Couldn't join. Try again."),
      offline: L("Sem ligação ao servidor. Verifica a internet.", "No connection to the server. Check your internet.")
    };
    if (conn) { try { conn.close(); } catch (e) {} conn = null; }
    status(msg[why] || L("Erro de ligação.", "Connection error.")); showScreen("screen-online", true);
  }
  function needName() {
    if (el("mp-name").value.trim()) { try { localStorage.setItem(NAME_KEY, el("mp-name").value.trim()); } catch (e) {} return true; }
    status(L("Escreve o teu nome primeiro.", "Write your name first.")); el("mp-name").focus(); return false;
  }
  function create() {
    if (!needName()) return;
    isHost = true; status(L("A criar a sala…", "Creating the room…")); resetSig();
    withStudio(function () {
      conn = new Online.Host(cbs());
      conn.open(function (err) { if (err) { fail("offline"); return; } status(""); showScreen("screen-lobby"); });
    });
  }
  function join() {
    var code = Online.normCode(el("mp-code").value);
    if (!needName()) return;
    if (code.length !== 4) { status(L("O código tem 4 letras.", "The code has 4 letters.")); el("mp-code").focus(); return; }
    isHost = false; status(L("A entrar…", "Joining…")); resetSig();
    var o = cbs(); o.room = code; conn = new Online.Guest(o); conn.open(); showScreen("screen-lobby");
  }
  function leaveNow() {
    if (conn) { try { conn.close(true); } catch (e) {} conn = null; }
    pub = priv = null; clues = {}; resetSig(); showScreen("screen-online", true); status("");
  }
  function leave() {
    if (!conn) { leaveNow(); return; }
    JM.alert({
      title: isHost ? L("Fechar a sala?", "Close the room?") : L("Sair da sala?", "Leave the room?"),
      text: isHost ? L("O jogo acaba para toda a gente.", "The game ends for everyone.") : L("Podes voltar a entrar com o mesmo código.", "You can rejoin with the same code."),
      actions: [{ t: L("Ficar", "Stay") }, { t: isHost ? L("Fechar", "Close") : L("Sair", "Leave"), cls: "danger", fn: leaveNow }]
    });
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
    var lsig = JM.lang() + "|" + (pub.room || "") + "|" + pub.players.map(function (p) { return p.n + (p.id === pub.host ? "*" : ""); }).join(",") + "|" + isHost + "|" + mySettings.impMode + mySettings.impCount + "|" + maxImpMp(n);
    if (!changed("lobby", lsig)) return;
    var code = pub.room || "----";
    el("lobby-code").innerHTML = code.split("").map(function (c) { return "<span>" + escapeHtml(c) + "</span>"; }).join("");
    el("lobby-code").setAttribute("aria-label", L("Código da sala: ", "Room code: ") + code.split("").join(" "));
    el("lobby-count").textContent = n;
    el("lobby-players").innerHTML = pub.players.map(function (p) {
      var me = priv && p.id === priv.pid;
      return '<div class="row"><span class="tile-ic">' + JM.icon(p.id === pub.host ? "crown" : "person") + '</span><div class="row-b"><span class="row-x row-t">' + escapeHtml(p.n) + "</span>" +
        (p.id === pub.host ? '<span class="badge">' + L("anfitrião", "host") + "</span>" : "") + (me && p.id !== pub.host ? '<span class="badge">' + L("tu", "you") + "</span>" : "") + "</div></div>";
    }).join("");
    el("lobby-host").hidden = !isHost;
    el("btn-lobby-start").hidden = !isHost;
    el("lobby-wait").textContent = isHost ? (n < 3 ? L("Faltam " + (3 - n) + " para começar (mínimo 3).", (3 - n) + " more to start (at least 3).") : L("Mantém esta página aberta: é o teu telemóvel que dá as cartas.", "Keep this page open: your phone deals the cards."))
      : L("À espera que o anfitrião comece…", "Waiting for the host to start…");
    if (isHost) {
      if (mySettings.impCount > maxImpMp(n)) mySettings.impCount = maxImpMp(n);
      document.querySelectorAll("#lobby-host [data-mpmode]").forEach(function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-mpmode") === mySettings.impMode)); });
      el("mp-manual-box").hidden = mySettings.impMode !== "manual";
      el("mp-imp-count").textContent = mySettings.impCount;
      el("mp-imp-word").textContent = impWordMp(mySettings.impCount);
      el("mp-imp-note").textContent = L("Máximo " + maxImpMp(n) + " com " + n + " jogadores", "Up to " + maxImpMp(n) + " with " + n + " players");
      el("mp-imp-minus").disabled = mySettings.impCount <= 1;
      el("mp-imp-plus").disabled = mySettings.impCount >= maxImpMp(n);
      el("btn-lobby-start").disabled = n < 3;
    }
  }

  // ── a carta do papel (partilhada) ──
  function renderRoleCard() {
    var me = myPlayer();
    var roleSig = JM.lang() + "|" + (priv ? (priv.gid + "|" + priv.role + "|" + (priv.word || "") + "|" + (priv.hint || "")) : "none");
    if (!changed("role", roleSig)) return;
    el("mp-myname").textContent = me ? me.n : "";
    var back = el("mp-back");
    if (priv && priv.role === "impostor") {
      back.className = "card-face card-back is-impostor";
      var h = priv.hint && priv.hint.trim() ? locHint(priv.hint) : "";
      back.innerHTML = '<div class="role-label">' + L("A tua palavra", "Your word") + '</div><div class="the-word">' + L("Impostor", "Impostor") + '</div><div class="the-hint">' +
        (h ? L("Pista: ", "Clue: ") + escapeHtml(h) : L("Sem pista. Desenrasca-te.", "No clue. Wing it.")) + "</div>";
    } else if (priv && priv.role === "word") {
      back.className = "card-face card-back is-word";
      back.innerHTML = '<div class="role-label">' + L("A tua palavra", "Your word") + '</div><div class="the-word">' + escapeHtml(loc(priv.word || "", "").p) + "</div>";
    } else {
      back.className = "card-face card-back is-word";
      back.innerHTML = '<div class="the-hint">' + L("A carregar…", "Loading…") + "</div>";
    }
    el("mp-card").classList.remove("flipped");
  }

  // ── fase: compor a pista ──
  function renderClue() {
    showScreenIf("screen-mp-round");
    el("mp-round-head").textContent = L("Ronda ", "Round ") + pub.round + L(" de ", " of ") + pub.maxRounds;
    renderRoleCard();
    var me = myPlayer(), subd = me && me.sub, cnt = pub.players.filter(function (p) { return p.sub; }).length;
    var sg = JM.lang() + "|" + pub.round + "|" + (subd ? "S" + cnt + "|" + isHost : "C");
    if (!changed("clue-foot", sg)) return;
    var foot = el("mp-round-foot");
    if (subd) {
      foot.innerHTML = '<div class="sent"><p class="done">' + JM.icon("check") + L("Pista enviada", "Clue sent") + '</p><p class="fine center">' +
        L(cnt + " de " + pub.players.length + " já enviaram.", cnt + " of " + pub.players.length + " have sent theirs.") + "</p>" +
        (isHost ? '<div class="btns" style="margin-top:14px"><button type="button" class="btn lg block" data-act="force-reveal">' + L("Avançar já", "Move on now") + "</button></div>"
          : '<p class="fine center">' + L("À espera dos outros…", "Waiting for the others…") + "</p>") + "</div>";
      bindHostFoot();
    } else {
      foot.innerHTML = composerHTML(); bindComposer();
    }
  }

  function composerHTML() {
    return '<div class="composer">' +
      '<div class="seg lg" role="group"><button type="button" data-tab="text" aria-pressed="true">' + L("Escrever", "Write") + '</button><button type="button" data-tab="photo" aria-pressed="false">' + L("Foto ou gif", "Photo or gif") + "</button></div>" +
      '<div data-panel="text"><input id="comp-text" class="field" placeholder="' + L("A tua pista…", "Your clue…") + '" maxlength="40" autocomplete="off" enterkeyhint="send" />' +
      '<button type="button" class="btn fill lg block" id="comp-send-text">' + L("Enviar a pista", "Send the clue") + "</button></div>" +
      '<div data-panel="photo" hidden><label class="btn fill lg block file-btn">' + JM.icon("photo") + "<span>" + L("Escolher do telemóvel", "Choose from the phone") + '</span><input type="file" id="comp-file" accept="image/*" /></label>' +
      '<p class="fine">' + L("Uma foto, ou um gif ou meme que tenhas guardado.", "A photo, or a gif or meme you have saved.") + "</p></div>" +
      "</div>";
  }

  function bindComposer() {
    $$("#mp-round-foot [data-tab]").forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute("data-tab");
        $$("#mp-round-foot [data-tab]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        $$("#mp-round-foot [data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== t; });
        JM.play("select");
      };
    });
    var send = function () {
      var v = (el("comp-text").value || "").trim();
      if (!v) { el("comp-text").focus(); return; }
      JM.play("whoosh");
      conn.submitClue({ ty: "t", v: v, l: JM.lang() });     // l: a língua de quem escreveu (para a traduzirem bem)
    };
    el("comp-send-text").onclick = send;
    el("comp-text").onkeydown = function (e) { if (e.key === "Enter") send(); };
    var file = el("comp-file");
    file.onchange = function () {
      var f = file.files && file.files[0]; if (!f) return;
      el("mp-round-foot").innerHTML = '<div class="sent"><div class="spin"></div><p class="fine center">' + L("A enviar…", "Sending…") + "</p></div>";
      if (f.type === "image/gif" && f.size < 900000) {     // gif pequeno: envia tal e qual (preserva a animação)
        var fr = new FileReader();
        fr.onload = function (e) { conn.submitClue({ ty: "i", v: e.target.result }); };
        fr.onerror = function () { resetSig(); renderClue(); };
        fr.readAsDataURL(f);
      } else {                                              // foto (ou gif grande): comprime para caber no envio
        compress(f, function (url) { if (url) conn.submitClue({ ty: "i", v: url }); else { resetSig(); renderClue(); } });
      }
    };
  }

  // ── fase: revelar as pistas uma a uma ──
  function renderReveal() {
    showScreenIf("screen-mp-reveal");
    var rv = pub.reveal || {}; var id = rv.id;
    var p = null; for (var i = 0; i < pub.players.length; i++) if (pub.players[i].id === id) p = pub.players[i];
    var cl = clueOf(rv.round, id);
    var tr = cl && cl.ty === "t" ? JM.tx(cl.v, JM.lang(), function () { sig.reveal = null; renderReveal(); }, cl.l === "pt" || cl.l === "en" ? cl.l : undefined) : null;
    var rsig = JM.lang() + "|" + pub.round + "|" + rv.idx + "|" + id + "|" + (cl ? cl.ty + cl.v.slice(0, 24) : "none") + "|" + (tr ? tr.text : "") + "|" + isHost;
    if (!changed("reveal", rsig)) return;
    el("mp-reveal-prog").textContent = L("Ronda ", "Round ") + rv.round + " · " + L("pista ", "clue ") + (rv.idx + 1) + L(" de ", " of ") + rv.total;
    el("mp-reveal-name").textContent = p ? p.n : "";
    var box = el("mp-reveal-clue"); box.innerHTML = "";
    if (!cl) { box.innerHTML = '<div class="spin"></div>'; }
    else if (cl.ty === "i" && okImg(cl.v)) { var im = new Image(); im.className = "clue-img"; im.src = cl.v; im.alt = ""; box.appendChild(im); }
    else if (cl.ty === "t") {
      var d = document.createElement("div"); d.className = "clue-text"; d.textContent = tr.text;
      if (tr.changed) { var mk = document.createElement("span"); mk.className = "tr-mark"; mk.innerHTML = JM.icon("translate") + " " + escapeHtml(L("Traduzido de «", "Translated from “") + cl.v + L("»", "”")); d.appendChild(mk); }
      box.appendChild(d);
    }
    else { box.innerHTML = '<p class="fine">' + L("Pista inválida", "Invalid clue") + "</p>"; }
    var last = rv.idx + 1 >= rv.total, lastRound = pub.round >= pub.maxRounds;
    el("mp-reveal-foot").innerHTML = isHost
      ? '<button type="button" class="btn fill lg block" data-act="next">' + (last ? (lastRound ? L("Ir a votos", "Go to the vote") : L("Ronda seguinte", "Next round")) : L("Próxima pista", "Next clue")) + "</button>"
      : '<p class="wait">' + L("O anfitrião avança.", "The host moves things on.") + "</p>";
    bindHostFoot();
  }

  // ── fase: votação ──
  function renderVote() {
    showScreenIf("screen-mp-vote");
    var me = myPlayer(), voted = me && me.voted, cnt = pub.players.filter(function (p) { return p.voted; }).length;
    var vsig = JM.lang() + "|" + (voted ? "V" + cnt : "v") + "|" + isHost + "|" + pub.players.map(function (p) { return p.id; }).join(",");
    if (!changed("vote", vsig)) return;
    el("mp-vote-head").textContent = voted ? L("Voto registado", "Vote counted") : L("Quem é o impostor?", "Who's the impostor?");
    el("mp-vote-list").innerHTML = voted ? '<div class="row solo"><span class="row-t">' + L(cnt + " de " + pub.players.length + " já votaram.", cnt + " of " + pub.players.length + " have voted.") + "</span></div>"
      : pub.players.filter(function (p) { return !(priv && p.id === priv.pid); }).map(function (p) {
        return '<button type="button" class="row big" data-vote="' + escapeHtml(p.id) + '"><span class="tile-ic lg">' + JM.icon("person") + '</span><div class="row-b"><span class="row-x row-t">' + escapeHtml(p.n) + "</span>" + JM.icon("chevron-right", "chev") + "</div></button>";
      }).join("");
    el("mp-vote-list").querySelectorAll("[data-vote]").forEach(function (b) { b.onclick = function () { JM.play("select"); conn.vote(b.getAttribute("data-vote")); }; });
    el("mp-vote-foot").innerHTML = isHost ? '<button type="button" class="btn lg block" data-act="force-vote">' + L("Fechar a votação", "Close the vote") + "</button>" : "";
    bindHostFoot();
  }

  // ── fase: resultado ──
  function renderResult() {
    showScreenIf("screen-mp-result");
    var r = pub.result || {};
    if (!changed("result", JM.lang() + "|" + pub.gid + "|" + JSON.stringify(r) + "|" + isHost)) return;
    var caught = (r.top || []).some(function (nm) { return (r.imps || []).indexOf(nm) >= 0; });
    el("mp-verdict").textContent = caught ? L("Apanharam o impostor!", "You caught the impostor!") : L("O impostor escapou!", "The impostor got away!");
    JM.play(caught ? "win" : "lose");
    if (r.allImp || !r.word) { el("mp-result-label").textContent = L("Não havia palavra", "There was no word"); el("mp-result-word").textContent = L("Eram todos impostores!", "Everyone was an impostor!"); }
    else { el("mp-result-label").textContent = L("A palavra era", "The word was"); el("mp-result-word").textContent = loc(r.word, "").p; }
    el("mp-imps-label").textContent = (r.imps || []).length === 1 ? L("O impostor", "The impostor") : L("Os impostores", "The impostors");
    el("mp-impostor-names").innerHTML = (r.imps || []).map(function (nm) { return '<div class="imp">' + JM.icon("mask") + escapeHtml(nm) + "</div>"; }).join("");
    el("mp-vote-result").textContent = L("Mais votado: ", "Most votes: ") + ((r.top || []).join(", ") || "—");
    el("mp-result-foot").innerHTML = isHost
      ? '<div class="btns"><button type="button" class="btn fill lg block" data-act="again">' + L("Jogar outra vez", "Play again") + '</button><button type="button" class="btn lg block" data-act="lobby">' + L("Voltar à sala", "Back to the room") + "</button></div>"
      : '<p class="wait">' + L("À espera do anfitrião…", "Waiting for the host…") + "</p>";
    bindHostFoot();
  }

  // ── controlos do anfitrião ──
  function bindHostFoot() {
    $$("[data-act]").forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-act");
        JM.play("tap");
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
    JM.play("drum");
    conn.startGame({ word: allImp ? null : pickOnlineWord(), allImp: allImp, impCount: impCount, allHints: allImp ? distinctHints() : null });
  }

  // ── a carta: pressionar e manter para ver o papel ──
  function bindCard() {
    var card = el("mp-card"), front = el("mp-front");
    var show = function (e) { e.preventDefault(); if (!card.classList.contains("flipped")) JM.play("flip"); card.classList.add("flipped"); };
    var hide = function () { card.classList.remove("flipped"); };
    front.addEventListener("pointerdown", show);
    card.addEventListener("pointerup", hide);
    card.addEventListener("pointerleave", hide);
    card.addEventListener("pointercancel", hide);
    card.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  // ── partilhar a sala ──
  function shareRoom() {
    var code = pub && pub.room; if (!code) return;
    var url = location.origin + location.pathname + "?sala=" + code;
    var title = L("Jogo do Impostor", "The Impostor Game");
    if (navigator.share) { navigator.share({ title: title, text: L("Entra na minha sala: ", "Join my room: ") + code, url: url }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { JM.toast(L("Link copiado", "Link copied")); }, function () { JM.toast(url); });
    else JM.toast(url);
  }

  function setup() {
    try { el("mp-name").value = localStorage.getItem(NAME_KEY) || ""; } catch (e) {}
    el("btn-online").addEventListener("click", function () { status(""); JM.play("tap"); showScreen("screen-online"); });
    el("btn-create").addEventListener("click", create);
    el("btn-join").addEventListener("click", join);
    el("mp-code").addEventListener("input", function (e) { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4); });
    el("mp-code").addEventListener("keydown", function (e) { if (e.key === "Enter") join(); });
    el("btn-lobby-leave").addEventListener("click", leave);
    el("btn-mp-leave").addEventListener("click", leave);
    $$("[data-mpleave]").forEach(function (b) { b.addEventListener("click", leave); });
    el("btn-lobby-start").addEventListener("click", hostStart);

    $$("#lobby-host [data-mpmode]").forEach(function (b) {
      b.addEventListener("click", function () { mySettings.impMode = b.getAttribute("data-mpmode"); JM.play("select"); resetSig(); renderLobby(); });
    });
    el("mp-imp-minus").addEventListener("click", function () { if (mySettings.impCount > 1) { mySettings.impCount--; renderLobby(); } });
    el("mp-imp-plus").addEventListener("click", function () {
      var n = conn && conn.G ? conn.G.players.length : 3;
      if (mySettings.impCount < maxImpMp(n)) { mySettings.impCount++; renderLobby(); }
    });

    bindCard();
    el("btn-share").addEventListener("click", shareRoom);
    window.addEventListener("jm:lang", function () { withEN(function () { resetSig(); render(); }); });

    var room = new URLSearchParams(location.search).get("sala");
    if (room) { room = Online.normCode(room); if (room.length === 4) { el("mp-code").value = room; showScreen("screen-online"); setTimeout(function () { el(el("mp-name").value ? "btn-join" : "mp-name").focus(); }, 80); } }

    document.addEventListener("visibilitychange", function () { if (!document.hidden && conn) conn.check(); });
    window.addEventListener("pagehide", function () { if (conn) { try { conn.close(true); } catch (e) {} } });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
