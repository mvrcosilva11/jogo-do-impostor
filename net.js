/* net.js — cliente MQTT mínimo (3.1.1 sobre WebSocket), sem dependências.
   Serve de "fio" entre os telemóveis: o site é estático e as jogadas passam
   por um relay público. Publica/subscreve em QoS 0 e religa sozinho.

   Os relays públicos deitam fora mensagens enviadas em rajada, por isso os
   envios saem espaçados (GAP_MS) e quem usa isto tem de aguentar perdas. */
(function (root) {
  'use strict';

  // Relays públicos (WebSocket seguro). A 1.ª letra do código da sala diz qual usar.
  var BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
  ];

  var GAP_MS = 150;

  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function concat(parts) {
    var len = 0, i;
    for (i = 0; i < parts.length; i++) len += parts[i].length;
    var out = new Uint8Array(len), off = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length; }
    return out;
  }
  function u16(n) { return new Uint8Array([(n >> 8) & 255, n & 255]); }
  function str(s) { var b = enc.encode(s); return concat([u16(b.length), b]); }
  function varLen(n) {
    var out = [];
    do {
      var b = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) b |= 128;
      out.push(b);
    } while (n > 0);
    return new Uint8Array(out);
  }
  function packet(head, body) {
    return concat([new Uint8Array([head]), varLen(body.length), body]);
  }
  function noop() {}

  function Client(opts) {
    this.url = opts.url;
    this.clientId = opts.clientId;
    this.onMessage = opts.onMessage || noop;   // (topic, payload, retained)
    this.onStatus = opts.onStatus || noop;     // (online)
    this.subs = {};
    this.queue = [];
    this.ws = null;
    this.online = false;
    this.closed = false;
    this.buf = new Uint8Array(0);
    this.pid = 1;
    this.retry = 0;
    this.lastRx = 0;
    this.lastPing = 0;
    this.lastPub = 0;
    this._pump = null;
    this._tick = null;
    this._reconn = null;
    this._connT = null;
  }

  Client.prototype.connect = function () {
    var self = this;
    this.closed = false;
    this._open();
    if (!this._tick) this._tick = setInterval(function () { self._beat(); }, 4000);
  };

  Client.prototype._open = function () {
    var self = this, ws;
    clearTimeout(this._reconn);
    this.buf = new Uint8Array(0);
    try {
      ws = new WebSocket(this.url, 'mqtt');
    } catch (e) {
      this._retryLater();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = function () {
      if (self.ws !== ws) return;
      var vh = concat([str('MQTT'), new Uint8Array([4, 0x02]), u16(30)]);
      self._raw(packet(0x10, concat([vh, str(self.clientId)])));
    };
    ws.onmessage = function (ev) {
      if (self.ws !== ws) return;
      self._feed(new Uint8Array(ev.data));
    };
    ws.onclose = function () {
      if (self.ws !== ws) return;
      self._drop();
    };
    ws.onerror = noop;
    // sem CONNACK a tempo → tenta de novo
    clearTimeout(this._connT);
    this._connT = setTimeout(function () {
      if (self.ws === ws && !self.online) self._drop();
    }, 8000);
  };

  Client.prototype._raw = function (bytes) {
    try {
      this.ws.send(bytes);
      return true;
    } catch (e) {
      return false;
    }
  };

  Client.prototype._feed = function (chunk) {
    this.lastRx = Date.now();
    var buf = this.buf.length ? concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (buf.length < 2) break;
      var len = 0, mult = 1, i = 1, b, complete = false;
      while (i < buf.length && i < 5) {
        b = buf[i++];
        len += (b & 127) * mult;
        mult *= 128;
        if (!(b & 128)) { complete = true; break; }
      }
      if (!complete || buf.length < i + len) break;
      this._handle(buf[0] >> 4, buf[0] & 15, buf.subarray(i, i + len));
      buf = buf.subarray(i + len);
    }
    this.buf = buf.length ? buf.slice() : new Uint8Array(0);
  };

  Client.prototype._handle = function (type, flags, body) {
    if (type === 2) {                      // CONNACK
      clearTimeout(this._connT);
      if (body[1] !== 0) { this._drop(); return; }
      this.online = true;
      this.retry = 0;
      for (var t in this.subs) this._sub(t);
      this._drain();
      this.onStatus(true);
    } else if (type === 3) {               // PUBLISH
      var tlen = (body[0] << 8) | body[1];
      var topic = dec.decode(body.subarray(2, 2 + tlen));
      var off = 2 + tlen;
      var qos = (flags >> 1) & 3;
      if (qos) {
        if (qos === 1) this._raw(packet(0x40, body.subarray(off, off + 2)));
        off += 2;
      }
      this.onMessage(topic, dec.decode(body.subarray(off)), !!(flags & 1));
    }
    // SUBACK, UNSUBACK e PINGRESP só contam como sinal de vida (lastRx)
  };

  Client.prototype._sub = function (topic) {
    this.pid = (this.pid % 65535) + 1;
    this._raw(packet(0x82, concat([u16(this.pid), str(topic), new Uint8Array([0])])));
  };

  Client.prototype.subscribe = function (topic) {
    this.subs[topic] = true;
    if (this.online) this._sub(topic);
  };

  Client.prototype.unsubscribe = function (topic) {
    delete this.subs[topic];
    if (!this.online) return;
    this.pid = (this.pid % 65535) + 1;
    this._raw(packet(0xA2, concat([u16(this.pid), str(topic)])));
  };

  /* Põe na fila de saída. Um retido novo substitui o que ainda lá estiver do mesmo tópico. */
  Client.prototype.publish = function (topic, payload, retain) {
    var q = this.queue, i;
    if (retain) {
      for (i = 0; i < q.length; i++) {
        if (q[i][2] && q[i][0] === topic) { q[i][1] = payload; this._drain(); return; }
      }
    }
    q.push([topic, payload, !!retain]);
    if (q.length > 150) q.shift();
    this._drain();
  };

  Client.prototype._drain = function () {
    var self = this;
    if (this._pump || !this.online || !this.queue.length) return;
    var wait = GAP_MS - (Date.now() - this.lastPub);
    if (wait <= 0) {
      var m = this.queue[0];
      if (!this._raw(packet(0x30 | (m[2] ? 1 : 0), concat([str(m[0]), enc.encode(m[1])])))) return;
      this.queue.shift();
      this.lastPub = Date.now();
      if (!this.queue.length) { if (this._whenIdle) this._whenIdle(); return; }
      wait = GAP_MS;
    }
    this._pump = setTimeout(function () { self._pump = null; self._drain(); }, wait);
  };

  Client.prototype._beat = function () {
    if (this.closed || !this.online) return;
    var now = Date.now();
    if (now - this.lastRx > 30000) { this._drop(); return; }
    if (now - this.lastPing > 12000) {
      this.lastPing = now;
      this._raw(new Uint8Array([0xC0, 0]));
    }
  };

  /* Chamar quando a página volta a ficar visível: o iOS mata o socket em 2.º plano. */
  Client.prototype.check = function () {
    var self = this;
    if (this.closed) return;
    if (!this.online) {
      this.retry = 0;
      if (!this.ws || this.ws.readyState > 1) this._open();
      return;
    }
    var mark = this.lastRx;
    this._raw(new Uint8Array([0xC0, 0]));
    setTimeout(function () {
      if (!self.closed && self.online && self.lastRx === mark) self._drop();
    }, 5000);
  };

  Client.prototype._drop = function () {
    var ws = this.ws, was = this.online;
    this.ws = null;
    this.online = false;
    clearTimeout(this._connT);
    clearTimeout(this._pump);
    this._pump = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try { ws.close(); } catch (e) {}
    }
    if (was) this.onStatus(false);
    if (!this.closed) this._retryLater();
  };

  Client.prototype._retryLater = function () {
    var self = this;
    var wait = Math.min(5000, 400 * Math.pow(2, this.retry++));
    clearTimeout(this._reconn);
    this._reconn = setTimeout(function () { if (!self.closed) self._open(); }, wait);
  };

  /* Fecha depois de a fila de saída esvaziar (ou ao fim de maxMs). */
  Client.prototype.closeWhenDone = function (maxMs) {
    var self = this, done = false;
    function end() { if (!done) { done = true; self.close(); } }
    if (!this.online || !this.queue.length) { setTimeout(end, 250); return; }
    this._whenIdle = function () { setTimeout(end, 250); };
    setTimeout(end, maxMs || 4000);
  };

  Client.prototype.close = function () {
    this.closed = true;
    clearInterval(this._tick);
    this._tick = null;
    clearTimeout(this._reconn);
    clearTimeout(this._connT);
    clearTimeout(this._pump);
    this._pump = null;
    if (this.ws && this.online) this._raw(new Uint8Array([0xE0, 0]));
    var ws = this.ws;
    this.ws = null;
    this.online = false;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try { ws.close(); } catch (e) {}
    }
  };

  var Net = { Client: Client, BROKERS: BROKERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Net;
  else root.Net = Net;
})(typeof self !== 'undefined' ? self : this);
