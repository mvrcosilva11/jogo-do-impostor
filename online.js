/* online.js — multiplayer do Jogo do Impostor (telemóvel a telemóvel), v2.
   net.js (MQTT público) é o "fio". O anfitrião corre o jogo e publica o estado
   público (retido, repetido) e o papel privado de cada jogador (retido, por segredo).
   As PISTAS (foto/gif/texto) de cada jogador vão num canal próprio por ronda+jogador.

   Fluxo: lobby → (pista → revelar uma a uma) ×2 rondas → votação → resultado.
   Um só relay (EMQX, até 1MB). Tudo retido e repetido; quem dessincroniza pede sync. */
(function (root) {
  'use strict';

  var Net = root.Net;
  var BROKER = 'wss://broker.emqx.io:8084/mqtt';
  var ROOT = 'imp1/';
  var ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  var BEAT_MS = 2500;
  var MAX_ROUNDS = 2;

  function noop() {}
  function rid(n) {
    var s = '', c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < (n || 10); i++) s += c.charAt(Math.floor(Math.random() * c.length));
    return s;
  }
  function pick(s) { return s.charAt(Math.floor(Math.random() * s.length)); }
  function makeCode() { return pick(ABC) + pick(ABC) + pick(ABC) + pick(ABC); }
  function normCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }
  function parse(s) { if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function topics(code) {
    var b = ROOT + code + '/';
    return {
      state: b + 's', act: b + 'a',
      to: function (sec) { return b + 't/' + sec; },
      clue: function (round, id) { return b + 'c/' + round + '/' + id; },
      cluePrefix: b + 'c/',
      clueWild: b + 'c/+/+'
    };
  }
  function client() { return new Net.Client({ url: BROKER, clientId: 'imp-' + rid(10) }); }

  /* ───────────────────────────── ANFITRIÃO ───────────────────────────── */
  function Host(o) {
    this.role = 'host';
    this.secret = o.secret; this.name = o.name;
    this.onUpdate = o.onUpdate || noop; this.onNet = o.onNet || noop;
    this.net = null; this.T = null; this.G = null;
    this.clues = {}; this.dead = false; this._beat = null; this._probe = null;
  }

  Host.prototype.open = function (cb) {
    var self = this, net = client(), settled = false;
    this.net = net;
    net.onStatus = function (on) { self.onNet(on); if (on && !settled) { settled = true; self._pickCode(0, cb); } };
    net.onMessage = function (t, p) { self._onMsg(t, p); };
    net.connect();
    setTimeout(function () { if (!settled && !self.dead) { settled = true; cb('offline'); self.close(); } }, 9000);
  };

  Host.prototype._pickCode = function (n, cb) {
    var self = this, code = makeCode(), T = topics(code), taken = false;
    this._probe = function (pub) { if (pub && pub.phase !== 'closed' && Date.now() - pub.ts < 3 * 3600e3) taken = true; };
    this._probeTopic = T.state;
    this.net.subscribe(T.state);
    setTimeout(function () {
      if (self.dead) return;
      self.net.unsubscribe(T.state); self._probe = null;
      if (taken && n < 6) { self._pickCode(n + 1, cb); return; }
      self._begin(code); cb(null, code);
    }, 1200);
  };

  Host.prototype._begin = function (code) {
    var self = this;
    this.G = {
      room: code, gid: rid(8), phase: 'lobby', round: 0, maxRounds: MAX_ROUNDS,
      settings: { impMode: 'random', impCount: 1, category: 'all' },
      players: [{ id: rid(8), secret: this.secret, name: this.name, seen: Date.now(), sub: false, voted: false }],
      hostId: null, word: null, impIds: [], allImp: false, hints: {},
      revealOrder: [], revealIdx: 0, votes: {}
    };
    this.G.hostId = this.G.players[0].id;
    this.T = topics(code);
    this.net.subscribe(this.T.act);
    this.net.subscribe(this.T.clueWild);
    this._emit();
    this._beat = setInterval(function () { if (!self.dead) self._emit(); }, BEAT_MS);
  };

  Host.prototype._byId = function (id) { for (var i = 0; i < this.G.players.length; i++) if (this.G.players[i].id === id) return this.G.players[i]; return null; };
  Host.prototype._bySecret = function (s) { for (var i = 0; i < this.G.players.length; i++) if (this.G.players[i].secret === s) return this.G.players[i]; return null; };

  Host.prototype._onMsg = function (topic, payload) {
    if (this._probe && topic === this._probeTopic) { this._probe(parse(payload)); return; }
    if (this.dead || !this.G) return;
    if (topic.indexOf(this.T.cluePrefix) === 0) {        // pista de um jogador: c/<round>/<id>
      var rest = topic.slice(this.T.cluePrefix.length);  // "<round>/<id>"
      if (payload) { this.clues[rest] = payload; this.onUpdate(this._pub(), this._mine(), this.clues); }
      return;
    }
    if (topic !== this.T.act) return;
    var m = parse(payload);
    if (!m || typeof m.s !== 'string' || m.s === this.secret) return;
    var p = this._bySecret(m.s);
    if (m.t === 'join') {
      if (!p) {
        if (this.G.phase !== 'lobby') { this.net.publish(this.T.to(m.s), JSON.stringify({ gid: this.G.gid, out: 'full' }), false); return; }
        p = { id: rid(8), secret: m.s, name: String(m.name || 'Jogador').slice(0, 20), seen: Date.now(), sub: false, voted: false };
        this.G.players.push(p);
      } else { p.name = String(m.name || p.name).slice(0, 20); p.seen = Date.now(); }
      this._emit(); return;
    }
    if (!p) return;
    p.seen = Date.now();
    if (m.t === 'leave') { this.G.players = this.G.players.filter(function (x) { return x.secret !== m.s; }); this._emit(); return; }
    if (m.t === 'clue' && this.G.phase === 'clue' && m.round === this.G.round) { p.sub = true; this._afterClue(); return; }
    if (m.t === 'vote' && this.G.phase === 'vote') { this.G.votes[p.id] = m.suspect; p.voted = true; this._afterVote(); return; }
    if (m.t === 'sync') { this.net.publish(this.T.to(m.s), JSON.stringify(this._priv(p)), true); }
    // 'hi' só atualiza seen
  };

  /* Papel privado (persiste toda a partida). */
  Host.prototype._priv = function (p) {
    var G = this.G;
    if (G.phase === 'lobby' || G.phase === 'ended') return { pid: p.id, gid: G.gid, role: 'lobby' };
    if (G.allImp) return { pid: p.id, gid: G.gid, role: 'impostor', hint: G.hints[p.id] || '' };
    if (G.impIds.indexOf(p.id) >= 0) return { pid: p.id, gid: G.gid, role: 'impostor', hint: G.word ? (G.word.d || '') : '' };
    return { pid: p.id, gid: G.gid, role: 'word', word: G.word ? G.word.p : '' };
  };
  Host.prototype._mine = function () { var p = this._bySecret(this.secret); return p ? this._priv(p) : null; };

  Host.prototype._pub = function () {
    var G = this.G, now = Date.now();
    var players = G.players.map(function (p) { return { id: p.id, n: p.name, sub: !!p.sub, voted: !!p.voted }; });
    var pub = { gid: G.gid, room: G.room, host: G.hostId, phase: G.phase, round: G.round, maxRounds: G.maxRounds, ts: now, players: players };
    if (G.phase === 'reveal') {
      pub.reveal = { round: G.round, idx: G.revealIdx, id: G.revealOrder[G.revealIdx] || '', total: G.revealOrder.length };
    }
    if (G.phase === 'result') {
      var tally = {}, names = {};
      G.players.forEach(function (p) { names[p.id] = p.name; });
      for (var v in G.votes) { var s = G.votes[v]; if (s) tally[s] = (tally[s] || 0) + 1; }
      var arr = Object.keys(tally).map(function (id) { return { n: names[id] || '?', c: tally[id] }; }).sort(function (a, b) { return b.c - a.c; });
      var top = arr.length ? arr.filter(function (x) { return x.c === arr[0].c; }).map(function (x) { return x.n; }) : [];
      pub.result = {
        word: G.allImp ? null : (G.word ? G.word.p : null),
        allImp: !!G.allImp,
        imps: G.players.filter(function (p) { return G.impIds.indexOf(p.id) >= 0; }).map(function (p) { return p.name; }),
        tally: arr, top: top
      };
    }
    return pub;
  };

  Host.prototype._emit = function () {
    if (this.dead) return;
    var self = this;
    this.net.publish(this.T.state, JSON.stringify(this._pub()), true);
    this.G.players.forEach(function (p) { if (p.secret !== self.secret) self.net.publish(self.T.to(p.secret), JSON.stringify(self._priv(p)), true); });
    this.onUpdate(this._pub(), this._mine(), this.clues);
  };

  /* Começa a partida. opts: { word:{p,d}|null, allImp, impCount, allHints:[] } */
  Host.prototype.startGame = function (opts) {
    var G = this.G, n = G.players.length;
    G.gid = rid(8); G.round = 1; G.word = opts.word || null; G.allImp = !!opts.allImp;
    G.hints = {}; G.votes = {}; this.clues = {};
    G.players.forEach(function (p) { p.sub = false; p.voted = false; });
    if (G.allImp) {
      G.impIds = G.players.map(function (p) { return p.id; });
      var hints = shuffle(opts.allHints || []);
      G.players.forEach(function (p, i) { G.hints[p.id] = hints[i % (hints.length || 1)] || ''; });
    } else {
      var count = Math.min(opts.impCount || 1, n - 1);
      G.impIds = shuffle(G.players.map(function (p) { return p.id; })).slice(0, count);
    }
    G.phase = 'clue';
    this._emit();
  };

  Host.prototype._afterClue = function () {
    var all = this.G.players.every(function (p) { return p.sub; });
    if (all) { this.G.revealOrder = shuffle(this.G.players.map(function (p) { return p.id; })); this.G.revealIdx = 0; this.G.phase = 'reveal'; }
    this._emit();
  };
  Host.prototype.nextReveal = function () {
    var G = this.G; if (!G || G.phase !== 'reveal') return;
    G.revealIdx++;
    if (G.revealIdx >= G.revealOrder.length) {
      if (G.round < G.maxRounds) { G.round++; G.players.forEach(function (p) { p.sub = false; }); G.phase = 'clue'; }
      else { G.players.forEach(function (p) { p.voted = false; }); G.votes = {}; G.phase = 'vote'; }
    }
    this._emit();
  };
  Host.prototype._afterVote = function () {
    var all = this.G.players.every(function (p) { return p.voted; });
    if (all) this.G.phase = 'result';
    this._emit();
  };
  Host.prototype.forceReveal = function () { if (this.G && this.G.phase === 'clue') { this.G.players.forEach(function (p) { p.sub = true; }); this._afterClue(); } };
  Host.prototype.forceVote = function () { if (this.G && this.G.phase === 'vote') { this.G.phase = 'result'; this._emit(); } };

  // o próprio anfitrião é jogador
  Host.prototype.submitClue = function (clueObj) {
    var G = this.G, me = this._bySecret(this.secret); if (!G || !me || G.phase !== 'clue') return;
    this.clues[G.round + '/' + me.id] = JSON.stringify(clueObj);
    this.net.publish(this.T.clue(G.round, me.id), JSON.stringify(clueObj), true);
    me.sub = true; this._afterClue();
  };
  Host.prototype.vote = function (suspect) {
    var G = this.G, me = this._bySecret(this.secret); if (!G || !me || G.phase !== 'vote') return;
    G.votes[me.id] = suspect; me.voted = true; this._afterVote();
  };
  Host.prototype.backToLobby = function () {
    if (!this.G) return;
    this.G.phase = 'lobby'; this.G.round = 0; this.G.word = null; this.G.impIds = []; this.G.votes = {};
    this.clues = {}; this.G.players.forEach(function (p) { p.sub = false; p.voted = false; });
    this._emit();
  };
  Host.prototype.setSettings = function (s) { if (this.G) { for (var k in s) this.G.settings[k] = s[k]; } };
  Host.prototype.check = function () { if (this.net) this.net.check(); };
  Host.prototype.close = function () {
    var self = this; this.dead = true; clearInterval(this._beat);
    if (this.net && this.T && this.G) {
      this.net.publish(this.T.state, JSON.stringify({ phase: 'closed', ts: Date.now() }), true);
      this.G.players.forEach(function (p) { self.net.publish(self.T.to(p.secret), '', true); });
    }
    if (this.net) this.net.closeWhenDone(4000);
  };

  /* ───────────────────────────── CONVIDADO ───────────────────────────── */
  function Guest(o) {
    this.role = 'guest';
    this.room = normCode(o.room); this.secret = o.secret; this.name = o.name;
    this.onUpdate = o.onUpdate || noop; this.onNet = o.onNet || noop; this.onFail = o.onFail || noop;
    this.pub = null; this.priv = null; this.clues = {}; this.myId = null;
    this.dead = false; this.net = null; this._t0 = 0; this._lastPub = 0; this._n = 0; this.pending = [];
  }

  Guest.prototype.open = function () {
    var self = this;
    if (this.room.length !== 4) { this.onFail('noroom'); return; }
    this.T = topics(this.room); this._t0 = Date.now();
    var net = client(); this.net = net;
    net.onMessage = function (t, p) { self._onMsg(t, p); };
    net.onStatus = function (on) { self.onNet(on); if (on) self._hello(); };
    net.subscribe(this.T.state);
    net.subscribe(this.T.to(this.secret));
    net.subscribe(this.T.clueWild);
    net.connect();
    this._beat = setInterval(function () { self._tick(); }, BEAT_MS);
  };

  Guest.prototype._send = function (m) { var o = { s: this.secret }, k; for (k in m) o[k] = m[k]; if (this.net) this.net.publish(this.T.act, JSON.stringify(o), false); };
  Guest.prototype._hello = function () { this._send({ t: 'join', name: this.name }); };

  Guest.prototype._onMsg = function (topic, payload) {
    if (this.dead) return;
    if (topic.indexOf(this.T.cluePrefix) === 0) {
      var rest = topic.slice(this.T.cluePrefix.length);
      if (payload) this.clues[rest] = payload; else delete this.clues[rest];
      this._fire(); return;
    }
    var m = parse(payload);
    if (topic === this.T.to(this.secret)) {
      if (m && m.out) { this.onFail(m.out); return; }
      this.priv = m; if (m && m.pid) this.myId = m.pid; this._fire(); return;
    }
    if (topic === this.T.state) {
      if (!m) return;
      if (m.phase === 'closed') { this.onFail('closed'); return; }
      this.pub = m; this._lastPub = Date.now(); this._fire();
    }
  };

  Guest.prototype._fire = function () {
    if (!this.pub) return;
    if (this.priv && this.priv.gid !== this.pub.gid) this._send({ t: 'sync' });
    this.onUpdate(this.pub, this.priv, this.clues);
  };

  Guest.prototype._tick = function () {
    if (this.dead) return;
    var now = Date.now(); this._n++;
    if (!this.pub) { if (now - this._t0 > 10000) this.onFail('noroom'); return; }
    if (!this.priv) { if (now - this._t0 > 20000) this.onFail('nojoin'); this._hello(); return; }
    if (this._n % 2 === 0) this._send({ t: 'hi' });
    if (this.priv.gid !== this.pub.gid) this._send({ t: 'sync' });
    var self = this;
    this.pending.forEach(function (x) { if (now - x.at > 2000 && x.n++ < 30) self._send(x.m); });
  };

  Guest.prototype._resendUntil = function (m, doneFn) {
    var self = this, x = { m: m, n: 0, at: Date.now() };
    this._send(m); this.pending.push(x);
    var iv = setInterval(function () {
      if (self.dead || doneFn()) { self.pending = self.pending.filter(function (y) { return y !== x; }); clearInterval(iv); }
    }, 1500);
  };

  Guest.prototype.submitClue = function (clueObj) {
    if (!this.myId || !this.net || !this.pub) return;
    var round = this.pub.round;
    this.net.publish(this.T.clue(round, this.myId), JSON.stringify(clueObj), true);
    this.clues[round + '/' + this.myId] = JSON.stringify(clueObj);
    var self = this;
    this._resendUntil({ t: 'clue', round: round }, function () {
      var me = self.pub && self.pub.players.filter(function (p) { return p.id === self.myId; })[0];
      return self.pub.round !== round || (me && me.sub);
    });
    this._fire();
  };
  Guest.prototype.vote = function (suspect) {
    if (!this.myId || !this.net) return;
    var self = this;
    this._resendUntil({ t: 'vote', suspect: suspect }, function () {
      var me = self.pub && self.pub.players.filter(function (p) { return p.id === self.myId; })[0];
      return self.pub.phase !== 'vote' || (me && me.voted);
    });
  };

  Guest.prototype.check = function () { if (this.net) this.net.check(); };
  Guest.prototype.close = function (leaving) {
    if (this.dead) return; this.dead = true; clearInterval(this._beat);
    if (this.net && leaving) { this._send({ t: 'leave' }); this.net.closeWhenDone(1500); }
    else if (this.net) this.net.close();
  };

  root.Online = { Host: Host, Guest: Guest, normCode: normCode, rid: rid, ABC: ABC, MAX_ROUNDS: MAX_ROUNDS };
})(typeof self !== 'undefined' ? self : this);
