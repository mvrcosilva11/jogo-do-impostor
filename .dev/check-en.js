// Confere o inglês do banco: node .dev/check-en.js
// Cada palavra do words.js tem de ter tradução em words-en.js (palavra + pista de uma só palavra).
const WORDS = require('../words.js'), EN = require('../words-en.js');
let bad = 0;
WORDS.forEach(w => {
  const e = EN[w.p];
  if (!e) { bad++; console.log('SEM INGLÊS   ' + w.p + '  [' + w.c + ']'); return; }
  if (!e[0] || (w.d && !e[1])) { bad++; console.log('INCOMPLETA   ' + w.p); }
});
Object.keys(EN).forEach(k => { if (!WORDS.some(w => w.p === k)) { bad++; console.log('A MAIS       ' + k); } });
console.log(WORDS.length + ' palavras, ' + bad + ' problemas');
process.exit(bad ? 1 : 0);
