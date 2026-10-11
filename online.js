/* online.js — modo multiplayer do Jogo do Impostor (telemóvel a telemóvel).
   Usa o net.js (MQTT público) como "fio" entre os telemóveis. O anfitrião corre
   o jogo e publica: o estado público (retido, repetido) e o papel privado de cada
   jogador (retido, por segredo). Os convidados enviam jogadas e recebem o seu papel.
   As fotos (modo fotos) vão num canal próprio, uma por jogador (retida).

   Um só relay (EMQX, até 1 MB por mensagem) para aguentar as fotos.
   A rede perde mensagens: tudo é retido e repetido, e quem fica dessincronizado pede sync. */
(function (root) {
  'use strict';

  var Net = root.Net;
  var BROKER = 'wss://broker.emqx.io:8084/mqtt';
  var ROOT = 'imp1/';
  var ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sem I nem O
  var BEAT_MS = 2500;
  var HOST_DOWN_MS = 9000;

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
      photo: function (id) { return b + 'p/' + id; },
      photoWild: b + 'p/+'
    };
  }
  function client() { return new Net.Client({ url: BROKER, clientId: 'imp-' + rid(10) }); }

  /* ───────────────────────────── ANFITRIÃO ───────────────────────────── */
  function Host(o) {
    this.role = 'host';
    this.secret = o.secret;
    this.name = o.name;
    this.onUpdate = o.onUpdate || noop;   // (pub, mineRole, photos)
    this.onNet = o.onNet || noop;
    this.net = null; this.T = null; this.G = null;
    this.photos = {}; this.dead = false; this._beat = null; this._probe = null;
  }

  Host.prototype.open = function (cb) {
    var self = this, net = client(), settled = false;
    this.net = net;
    net.onStatus = function (on) {
      self.onNet(on);
      if (on && !settled) { settled = true; self._pickCode(0, cb); }
    };
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
      self.net.unsubscribe(T.state);
      self._probe = null;
      if (taken && n < 6) { self._pickCode(n + 1, cb); return; }
      self._begin(code);
      cb(null, code);
    }, 1200);
  };

  Host.prototype._begin = function (code) {
    var self = this;
    this.G = {
      room: code, gid: rid(8), phase: 'lobby', round: 0,
      settings: { impMode: 'random', impCount: 1, photoMode: false, category: 'all' },
      players: [{ id: rid(8), secret: this.secret, name: this.name, seen: Date.now(), ph: false }],
      hostId: null, word: null, impIds: [], allImp: false, starterId: null, hints: {}
    };
    this.G.hostId = this.G.players[0].id;
    this.T = topics(code);
    this.net.subscribe(this.T.act);
    this.net.subscribe(this.T.photoWild);
    this._emit();
    this._beat = setInterval(function () { if (!self.dead) self._emit(); }, BEAT_MS);
  };

  Host.prototype._byId = function (id) { for (var i = 0; i < this.G.players.length; i++) if (this.G.players[i].id === id) return this.G.players[i]; return null; };
  Host.prototype._bySecret = function (s) { for (var i = 0; i < this.G.players.length; i++) if (this.G.players[i].secret === s) return this.G.players[i]; return null; };

  Host.prototype._onMsg = function (topic, payload) {
    if (this._probe && topic === this._probeTopic) { this._probe(parse(payload)); return; }
    if (this.dead || !this.G) return;
    if (topic.indexOf(this.T.photo('')) === 0) {           // foto de um jogador
      var pid = topic.slice(this.T.photo('').length);
      if (payload) { this.photos[pid] = payload; this.onUpdate(this._pub(), this._mine(), this.photos); }
      return;
    }
    if (topic !== this.T.act) return;
    var m = parse(payload);
    if (!m || typeof m.s !== 'string' || m.s === this.secret) return;
    var p = this._bySecret(m.s);
    if (m.t === 'join') {
      if (!p) {
        if (this.G.phase !== 'lobby') { this.net.publish(this.T.to(m.s), JSON.stringify({ gid: this.G.gid, out: 'full' }), false); return; }
        p = { id: rid(8), secret: m.s, name: String(m.name || 'Jogador').slice(0, 20), seen: Date.now(), ph: false };
        this.G.players.push(p);
      } else { p.name = String(m.name || p.name).slice(0, 20); p.seen = Date.now(); }
      this._emit(); return;
    }
    if (!p) return;
    p.seen = Date.now();
    if (m.t === 'leave') { this.G.players = this.G.players.filter(function (x) { return x.secret !== m.s; }); this._emit(); return; }
    if (m.t === 'photo') { p.ph = true; this._emit(); return; }
    if (m.t === 'sync') { this.net.publish(this.T.to(m.s), JSON.stringify(this._priv(p)), true); }
    // 'hi' só atualiza seen
  };

  /* Papel privado de um jogador. */
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
    var players = G.players.map(function (p) { return { id: p.id, n: p.name, ph: !!p.ph }; });
    var pub = { gid: G.gid, room: G.room, host: G.hostId, phase: G.phase, round: G.round, ts: now, photoMode: !!G.settings.photoMode, players: players };
    if (G.starterId) { var s = this._byId(G.starterId); pub.starter = s ? s.name : ''; }
    if (G.phase === 'result') {
      pub.result = {
        word: G.allImp ? null : (G.word ? G.word.p : null),
        allImp: !!G.allImp,
        imps: G.players.filter(function (p) { return G.impIds.indexOf(p.id) >= 0; }).map(function (p) { return p.name; })
      };
    }
    return pub;
  };

  Host.prototype._emit = function () {
    if (this.dead) return;
    var self = this, G = this.G;
    this.net.publish(this.T.state, JSON.stringify(this._pub()), true);
    G.players.forEach(function (p) { if (p.secret !== self.secret) self.net.publish(self.T.to(p.secret), JSON.stringify(self._priv(p)), true); });
    this.onUpdate(this._pub(), this._mine(), this.photos);
  };

  /* Começa uma ronda. opts: { word:{p,d}|null, allImp:bool, impCount, allHints:[..] } */
  Host.prototype.startRound = function (opts) {
    var G = this.G, n = G.players.length;
    G.gid = rid(8); G.round++; G.word = opts.word || null; G.allImp = !!opts.allImp;
    G.hints = {}; this.photos = {}; G.players.forEach(function (p) { p.ph = false; });
    if (G.allImp) {
      G.impIds = G.players.map(function (p) { return p.id; });
      var hints = shuffle(opts.allHints || []);
      G.players.forEach(function (p, i) { G.hints[p.id] = hints[i % (hints.length || 1)] || ''; });
      G.starterId = G.players[Math.floor(Math.random() * n)].id;
    } else {
      var count = Math.min(opts.impCount || 1, n - 1);
      var ids = shuffle(G.players.map(function (p) { return p.id; })).slice(0, count);
      G.impIds = ids;
      G.starterId = G.players[Math.floor(Math.random() * n)].id;
    }
    G.phase = G.settings.photoMode ? 'photos' : 'play';
    this._emit();
  };

  Host.prototype.toGallery = function () { if (this.G) { this.G.phase = 'gallery'; this._emit(); } };
  Host.prototype.reveal = function () { if (this.G) { this.G.phase = 'result'; this._emit(); } };
  Host.prototype.backToLobby = function () { if (this.G) { this.G.phase = 'lobby'; this.G.word = null; this.G.impIds = []; this.G.starterId = null; this.photos = {}; this.G.players.forEach(function (p) { p.ph = false; }); this._emit(); } };
  Host.prototype.setSettings = function (s) { if (this.G) { for (var k in s) this.G.settings[k] = s[k]; this._emit(); } };
  Host.prototype.uploadPhoto = function (dataUrl) {
    var me = this._bySecret(this.secret); if (!me) return;
    this.photos[me.id] = dataUrl; me.ph = true;
    this.net.publish(this.T.photo(me.id), dataUrl, true);
    this._emit();
  };
  Host.prototype.check = function () { if (this.net) this.net.check(); };
  Host.prototype.close = function () {
    var self = this; this.dead = true; clearInterval(this._beat);
    if (this.net && this.T && this.G) {
      this.net.publish(this.T.state, JSON.stringify({ phase: 'closed', ts: Date.now() }), true);
      this.G.players.forEach(function (p) { self.net.publish(self.T.to(p.secret), '', true); self.net.publish(self.T.photo(p.id), '', true); });
    }
    if (this.net) this.net.closeWhenDone(4000);
  };

  /* ───────────────────────────── CONVIDADO ───────────────────────────── */
  function Guest(o) {
    this.role = 'guest';
    this.room = normCode(o.room); this.secret = o.secret; this.name = o.name;
    this.onUpdate = o.onUpdate || noop; this.onNet = o.onNet || noop; this.onFail = o.onFail || noop;
    this.pub = null; this.priv = null; this.photos = {}; this.myId = null;
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
    net.subscribe(this.T.photoWild);
    net.connect();
    this._beat = setInterval(function () { self._tick(); }, BEAT_MS);
  };

  Guest.prototype._send = function (m) { var o = { s: this.secret }, k; for (k in m) o[k] = m[k]; if (this.net) this.net.publish(this.T.act, JSON.stringify(o), false); };
  Guest.prototype._hello = function () { this._send({ t: 'join', name: this.name }); };

  Guest.prototype._onMsg = function (topic, payload) {
    if (this.dead) return;
    if (topic.indexOf(this.T.photo('')) === 0) {
      var pid = topic.slice(this.T.photo('').length);
      if (payload) this.photos[pid] = payload; else delete this.photos[pid];
      this._fire(); return;
    }
    var m = parse(payload), now = Date.now();
    if (topic === this.T.to(this.secret)) {
      if (m && m.out) { this.onFail(m.out); return; }   // 'full'
      this.priv = m; if (m && m.pid) this.myId = m.pid; this._fire(); return;
    }
    if (topic === this.T.state) {
      if (!m) return;
      if (m.phase === 'closed') { this.onFail('closed'); return; }
      this.pub = m; this._lastPub = now; this._fire();
    }
  };

  Guest.prototype._fire = function () {
    if (!this.pub) return;
    // papel desatualizado face à ronda atual → pede sync
    if (this.priv && this.pub && this.priv.gid !== this.pub.gid) this._send({ t: 'sync' });
    this.onUpdate(this.pub, this.priv, this.photos);
  };

  Guest.prototype._tick = function () {
    if (this.dead) return;
    var now = Date.now();
    this._n++;
    if (!this.pub) { if (now - this._t0 > 10000) this.onFail('noroom'); return; }
    if (!this.priv) { if (now - this._t0 > 20000) this.onFail('nojoin'); this._hello(); return; }
    if (this._n % 2 === 0) this._send({ t: 'hi' });
    if (this.priv.gid !== this.pub.gid) this._send({ t: 'sync' });
    var self = this;
    this.pending.forEach(function (x) { if (now - x.at > 2000 && x.n++ < 30) self._send(x.m); });
  };

  Guest.prototype.uploadPhoto = function (dataUrl) {
    if (!this.myId || !this.net) return;
    this.net.publish(this.T.photo(this.myId), dataUrl, true);
    this.photos[this.myId] = dataUrl;
    var self = this, x = { m: { t: 'photo', id: this.myId }, n: 0, at: Date.now() };
    this._send(x.m); this.pending.push(x);
    // deixa de repetir quando o estado mostrar a foto registada
    var iv = setInterval(function () {
      var me = self.pub && self.pub.players.filter(function (p) { return p.id === self.myId; })[0];
      if (self.dead || (me && me.ph)) { self.pending = self.pending.filter(function (y) { return y !== x; }); clearInterval(iv); }
    }, 1500);
    this._fire();
  };

  Guest.prototype.check = function () { if (this.net) this.net.check(); };
  Guest.prototype.close = function (leaving) {
    if (this.dead) return; this.dead = true; clearInterval(this._beat);
    if (this.net && leaving) { this._send({ t: 'leave' }); this.net.closeWhenDone(1500); }
    else if (this.net) this.net.close();
  };

  root.Online = { Host: Host, Guest: Guest, normCode: normCode, rid: rid, ABC: ABC };
})(typeof self !== 'undefined' ? self : this);
