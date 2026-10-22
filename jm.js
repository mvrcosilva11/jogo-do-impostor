/* jm.js — Joguinhos do Marco: the sound and the fire every game shares.
   One file, no dependencies, copied into each game (keep the copies identical: _tools/sync-jm.sh).
     JM.play('tap' | 'select' | 'toggle' | 'good' | 'bad' | 'almost' | 'win' | 'lose' | 'flip' | 'whoosh' | 'drum' | 'fire')
     JM.studio(on, el)   call when Studio Mode changes: on = fire across the screen + crackle
     JM.soundButton(el)  puts the sound on/off button after el (choice kept on the phone: "jm.sound")
   Sounds are synthesised with Web Audio (no files). Reduced motion: the fire becomes a short glow. */
(function (root) {
  'use strict';
  var KEY = 'jm.sound', ctx = null;
  var CALM = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function muted() { try { return localStorage.getItem(KEY) === '0'; } catch (e) { return false; } }

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
      noise(0, 0.5, 0.16, 'bandpass', 200, 2600, 0.7);                  // the whoosh of it catching
      noise(0.1, 1.8, 0.12, 'lowpass', 380, 220);                        // the roar
      for (var i = 0; i < 18; i++) noise(0.15 + Math.random() * 1.5, 0.02 + Math.random() * 0.03, 0.18, 'highpass', 2500 + Math.random() * 3000);   // crackles
      tone(70, 0, 0.6, 'sine', 0.18, 40);
    }
  };

  function play(name) {
    if (muted() || !SOUNDS[name]) return;
    try { if (ac()) SOUNDS[name](); } catch (e) {}
  }

  /* ───────── the fire ───────── */

  var CSS = '' +
    '.jm-fire{position:fixed;inset:auto 0 0 0;height:62vh;z-index:9999;pointer-events:none;overflow:hidden;animation:jm-rise 1.9s cubic-bezier(.2,.8,.3,1) forwards}' +
    '.jm-fire svg{position:absolute;bottom:-6%;transform-origin:50% 100%;animation:jm-flick .22s ease-in-out infinite alternate}' +
    '.jm-ember{position:absolute;bottom:0;width:9px;height:9px;border-radius:50%;background:#FFE23F;border:2px solid #0A0A0A;animation:jm-ember 1.5s ease-out forwards}' +
    '.jm-glow{position:fixed;inset:0;z-index:9998;pointer-events:none;background:radial-gradient(120% 70% at 50% 110%,rgba(255,106,85,.55),rgba(255,154,61,.25) 45%,transparent 70%);animation:jm-glow 1.9s ease forwards}' +
    '@keyframes jm-rise{0%{transform:translateY(100%)}22%{transform:translateY(0)}70%{transform:translateY(4%)}100%{transform:translateY(105%)}}' +
    '@keyframes jm-flick{from{transform:scale(1,1) skewX(-3deg)}to{transform:scale(1.05,1.14) skewX(4deg)}}' +
    '@keyframes jm-ember{from{transform:translate(0,0);opacity:1}to{transform:translate(var(--dx),-70vh);opacity:0}}' +
    '@keyframes jm-glow{0%{opacity:0}20%{opacity:1}100%{opacity:0}}' +
    '.jm-sound{display:inline-grid;place-items:center;width:44px;height:44px;margin-left:6px;border:0;border-radius:50%;background:rgba(0,0,0,.08);color:inherit;cursor:pointer;vertical-align:middle}' +
    '.jm-sound svg{width:20px;height:20px}' +
    '.jm-sound:focus-visible{outline:3px solid currentColor;outline-offset:2px}' +
    '@media (prefers-reduced-motion:reduce){.jm-fire{display:none}}';
  var styled = false;
  function style() {
    if (styled) return;
    styled = true;
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // one illustrated flame: black outline, red outside, orange, yellow core
  function flame(w, delay) {
    var p = 'M50 2C60 24 82 38 82 64C82 86 67 99 50 99C33 99 18 86 18 64C18 46 30 36 34 22C38 34 44 38 46 40C46 26 44 14 50 2Z';
    return '<svg viewBox="0 0 100 100" style="width:' + w + 'px;height:' + (w * 1.35) + 'px;left:calc(' + delay.x + '% - ' + (w / 2) + 'px);animation-delay:-' + delay.d + 's" aria-hidden="true">' +
      '<path d="' + p + '" fill="#FF6A55" stroke="#0A0A0A" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M50 30C56 44 70 52 70 68C70 82 61 92 50 92C39 92 30 82 30 68C30 56 40 50 44 40C46 46 48 48 49 50C49 42 48 36 50 30Z" fill="#FF9A3D" stroke="#0A0A0A" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M50 56C54 64 61 68 61 77C61 85 56 90 50 90C44 90 39 85 39 77C39 70 45 66 50 56Z" fill="#FFE23F" stroke="#0A0A0A" stroke-width="3" stroke-linejoin="round"/></svg>';
  }

  function fire() {
    style();
    var glow = document.createElement('div');
    glow.className = 'jm-glow';
    document.body.appendChild(glow);
    setTimeout(function () { glow.remove(); }, 2000);
    if (CALM) return;
    var box = document.createElement('div'), html = '', n = Math.max(7, Math.round(innerWidth / 55)), i;
    box.className = 'jm-fire';
    for (i = 0; i < n; i++) html += flame(70 + Math.random() * 110, { x: (i + 0.5) * 100 / n + (Math.random() * 6 - 3), d: Math.random() * 0.4 });
    for (i = 0; i < 16; i++) html += '<i class="jm-ember" style="left:' + Math.round(Math.random() * 100) + '%;--dx:' + Math.round(Math.random() * 120 - 60) + 'px;animation-delay:' + (0.2 + Math.random() * 0.7).toFixed(2) + 's"></i>';
    box.innerHTML = html;
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 2000);
    try { if (navigator.vibrate) navigator.vibrate([30, 40, 60]); } catch (e) {}
  }

  function studio(on) {
    if (on) { fire(); play('fire'); }
    else play('toggle');
  }

  /* ───────── sound on/off ───────── */

  var ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  var OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
  function soundButton(after, lang) {
    style();
    var b = document.createElement('button'), en = lang === 'en';
    b.type = 'button';
    b.className = 'jm-sound';
    function paint() {
      var m = muted();
      b.innerHTML = m ? OFF : ON;
      b.setAttribute('aria-pressed', String(!m));
      b.setAttribute('aria-label', en ? 'Sound' : 'Som');
    }
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      try { localStorage.setItem(KEY, muted() ? '1' : '0'); } catch (e) {}
      paint();
      play('toggle');
    });
    paint();
    if (after && after.parentNode) after.parentNode.insertBefore(b, after.nextSibling);
    return b;
  }

  root.JM = { play: play, studio: studio, fire: fire, soundButton: soundButton, muted: muted };
})(typeof self !== 'undefined' ? self : this);
