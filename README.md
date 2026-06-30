# 🕵️ Jogo do Impostor

Jogo de festa para um só telemóvel, passado de mão em mão. Todos recebem uma palavra secreta — exceto o(s) impostor(es), que só recebem uma dica subtil. Conversem, desconfiem e descubram quem está a fingir.

## Como jogar

1. **Iniciar jogo** e inserir os nomes dos jogadores (mínimo 3, sem limite).
2. Escolher o número de impostores:
   - **Escolher** — até 1/3 dos jogadores (mínimo 1).
   - **Aleatório** — sorteado entre 1 e todos os jogadores.
3. Cada jogador, à vez, **pressiona e mantém o dedo** no card para ver a sua palavra (ou que é o impostor + dica). Ao largar, esconde. Passa o telemóvel ao próximo.
4. A app diz **quem começa**. Cada um diz uma palavra relacionada; debatam e votem.
5. **Revelar impostor(es)** no fim. Jogar de novo.

## Categorias de palavras

Animais, Profissões, Plantas, Comida, Lugares, Objetos, Celebridades, Personalidades Portuguesas, Música, Filmes & Séries, Youtubers PT e Brainrot.

Para acrescentar palavras, edita [`words.js`](words.js) — cada linha é `{ p: "palavra", d: "dica subtil", c: "categoria" }`.

## Stack

HTML, CSS e JavaScript puro. Sem build, sem dependências. Alojado no GitHub e publicado via Netlify.
