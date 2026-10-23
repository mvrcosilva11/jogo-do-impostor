// Confere o Studio Mode: node .dev/check-studio.js
// Fora de words-studio.js não pode haver nomes do pessoal do estúdio: nem no banco, nem nos textos do jogo.
const fs = require('fs'), path = require('path');
const NAMES = /\b(Pinto|Rebelo|Nuno|Vitor|Vítor|Freire|Cunha|Ribeiro|Lemos|Diogo|David Santos|Marco da Silva|Alex Lemos)\b/;
// figuras públicas com os mesmos nomes (não são o pessoal)
const PUBLIC = /Marcelo Rebelo de Sousa|Nuno Markl|Diogo Batáguas/g;
let bad = 0;
['words.js', 'words-en.js', 'index.html', 'app.js', 'mp.js', 'online.js', 'style.css'].forEach(f => {
  fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\n').forEach((line, i) => {
    if (NAMES.test(line.replace(PUBLIC, ''))) { bad++; console.log(f + ':' + (i + 1) + '  ' + line.trim().slice(0, 120)); }
  });
});
console.log(bad + ' problemas');
process.exit(bad ? 1 : 0);
