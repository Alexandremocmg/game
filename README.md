# Corrida Sem Fim

Endless runner 3D para navegador, feito para celular. Three.js + TypeScript + Vite.

🎮 **Jogo Online (Demo Publicada):** [https://alexandremocmg.github.io/game/](https://alexandremocmg.github.io/game/)  
📦 **Repositório GitHub:** [https://github.com/Alexandremocmg/game](https://github.com/Alexandremocmg/game)

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. Adicione `?debug` para o HUD com FPS, draw calls e triângulos.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | valida assets → checa tipos → compila |
| `npm run preview` | serve o `dist` já compilado |
| `npm run validate:assets` | confere a integridade dos GLB e OGG |
| `npm run fix:glb` | conserta GLB com cabeçalho de chunk corrompido (`--dry` simula) |

## Deploy e Publicação

- **URL Pública:** [https://alexandremocmg.github.io/game/](https://alexandremocmg.github.io/game/)
- **Repositório GitHub:** [https://github.com/Alexandremocmg/game](https://github.com/Alexandremocmg/game)
- **CI/CD:** deploy automático via **GitHub Actions** (`.github/workflows/deploy.yml`). A cada
  push na `main`, a Action valida os assets, compila com o Vite e publica no GitHub Pages.

O `vite.config.ts` usa `base: './'` — caminhos relativos são obrigatórios porque o Pages
serve o jogo a partir do subdiretório `/game/`, e caminhos absolutos quebrariam.

Depois de um deploy pode levar um ou dois minutos até propagar; um 404 nesse intervalo é
normal.


## Como jogar

Deslize para os lados para trocar de pista, para cima para pular, para baixo para rolar.
No desktop, as setas do teclado.

## Arquitetura

```
src/
  config.ts          TODAS as constantes de tuning — nenhum número mágico espalhado
  core/
    Game.ts          máquina de estados (menu | jogando | morto) e orquestração
    Loop.ts          passo fixo de 60Hz com acumulador + render interpolado
    Input.ts         swipe e teclado, com buffer de perdão
    Assets.ts        carga dos GLB (Draco)
    Audio.ts         efeitos via Web Audio API
  world/
    Track.ts         trilha infinita por reciclagem de chunks
    Scenery.ts       prédios laterais em InstancedMesh
    Spawner.ts       obstáculos, moedas e power-ups, tudo em pool
    patterns.ts      padrões autorais de obstáculo, por faixa de dificuldade
    obstacleSpecs.ts caixas de colisão e geometria de reserva
    powerUpSpecs.ts  duração e modelo de cada power-up
  player/
    Player.ts        física, estados e animação do personagem
    Collision.ts     AABB com margem de perdão
  render/
    Stage.ts         cena, câmera, luzes, fog
    Post.ts          bloom, vignette e color grade, com degradação automática
  ui/Hud.ts          HUD em DOM sobre o canvas
```

### Decisões que sustentam o resto

- **Passo fixo de 60Hz.** Sem ele o jogo fica mensuravelmente mais difícil num aparelho de
  120Hz. A simulação anda em fatias fixas; o render interpola.
- **O jogador não se move em Z.** O mundo vem até ele. Evita perda de precisão de float numa
  corrida longa e simplifica o culling.
- **Pooling total.** Chunks, obstáculos, moedas e power-ups saem de pools pré-alocados.
  Coleta de lixo em celular causa engasgo visível.
- **Pontuação desacoplada da distância.** `distance` dirige só velocidade e dificuldade;
  a pontuação é acumulador próprio, para o multiplicador não distorcer a curva do jogo.
- **Perdão de input.** Buffer de ~120ms e hitbox menor que o visual. É a maior parte da
  razão pela qual o jogo parece justo em vez de injusto.

## Páginas auxiliares

- `/animacoes.html` — inspeção das animações do personagem, isolada do jogo. Serve para
  aprovar clipes antes de integrar. Aceita `?m=` (modelo) e `?giro=` (rotação em graus).

## Verificação

O jogo expõe um handle de debug em `window.game` (só em dev):

```js
game.debugAutoplay(300, 12345)   // bot reativo: 300s numa seed, devolve se morreu
game.debugState                  // estado completo: fps, draws, triângulos, power-ups
game.debugApplyPowerUp('magnet') // ativa um efeito sem depender de pickup no mundo
```

A checagem padrão antes de dar algo por pronto é rodar 20 seeds × 5 min pelo `debugAutoplay`
e confirmar **zero mortes** — se o bot morre, há morte injusta ou obstáculo impossível.

Orçamento de render: ≤ 80 draw calls e ≤ 60k triângulos.

### Integridade dos assets

`npm run validate:assets` percorre a estrutura de cada GLB (assinatura, versão, tamanho
declarado, chunks, JSON parseável) e a assinatura dos OGG. Roda automaticamente no `build`
e como passo próprio na Action.

Ele existe por um motivo concreto: os 9 GLB já foram corrompidos por um localizar-e-substituir
global que alcançou os binários. **O jogo não quebrou — degradou em silêncio**, caindo para a
geometria de reserva (personagem virou cápsula, obstáculos viraram caixas), e foi ao ar assim.
Falha silenciosa é a pior de todas; agora ela derruba o build.

Ao medir a pose de um personagem animado, **não use `Box3.setFromObject`** — num `SkinnedMesh`
ele devolve a bind pose, não a pose animada. Detalhes em
[docs/pipeline-personagem.md](docs/pipeline-personagem.md).

## Documentação

- [docs/pipeline-personagem.md](docs/pipeline-personagem.md) — como o personagem sai do
  Mixamo e chega ao jogo, e as armadilhas de `SkinnedMesh`, root motion e orientação.
- [docs/incidentes.md](docs/incidentes.md) — falhas que já aconteceram, causa raiz e o que
  as impede de voltar.
- [CREDITS.md](CREDITS.md) — atribuições obrigatórias dos assets (CC-BY).

## Escopo

Implementado: core loop, obstáculos e padrões por dificuldade, moedas, power-ups (ímã,
jetpack, multiplicador, prancha), pós-processamento, áudio, personagem animado.

Fora: loja e economia, missões diárias, personagens destraváveis, ranking online,
empacotamento em APK.

## Propriedade intelectual

Mecânica de jogo não é protegida por direito autoral, mas nome, personagens e identidade
visual de jogos existentes são. Este projeto usa skin original.
