import type { ObstacleKind } from './obstacleSpecs';

export interface Placement {
  kind: ObstacleKind;
  lane: number;
  /** Distância a partir da borda próxima do padrão, crescendo para longe. */
  z: number;
}

export interface CoinRun {
  lane: number;
  z: number;
  count: number;
  step?: number;
  /** Arco por cima de um obstáculo de pulo — recompensa quem pula na hora certa. */
  arc?: boolean;
}

export interface Pattern {
  length: number;
  /** 0 = introdutório, 1 = intermediário, 2 = difícil. */
  tier: number;
  obstacles: Placement[];
  coins: CoinRun[];
}

/**
 * Regras de autoria — o que garante que todo padrão é vencível:
 *
 * 1. `block` e `train` nunca ocupam as três pistas na mesma faixa de Z.
 * 2. Linhas que exigem ação (pular ou rolar) nas três pistas ficam a pelo
 *    menos 24 unidades uma da outra. Na velocidade máxima (34 u/s) um pulo
 *    cobre ~21 unidades de chão; espaçamento menor criaria uma morte
 *    impossível de evitar.
 * 3. `low` e `gate` nunca aparecem na mesma pista e no mesmo Z — seria pedir
 *    pular e rolar ao mesmo tempo.
 *
 * O teste automatizado em `patterns.test.ts` verifica as três regras.
 */
export const PATTERNS: Pattern[] = [
  // ------------------------------------------------------------ tier 0
  {
    length: 48, tier: 0,
    obstacles: [{ kind: 'block', lane: 0, z: 14 }, { kind: 'block', lane: 2, z: 38 }],
    coins: [{ lane: 1, z: 10, count: 8 }, { lane: 0, z: 36, count: 5 }],
  },
  {
    length: 48, tier: 0,
    obstacles: [{ kind: 'low', lane: 0, z: 16 }, { kind: 'low', lane: 1, z: 16 }, { kind: 'low', lane: 2, z: 16 }],
    coins: [{ lane: 1, z: 12, count: 7, arc: true }],
  },
  {
    length: 48, tier: 0,
    obstacles: [{ kind: 'block', lane: 1, z: 18 }],
    coins: [{ lane: 0, z: 14, count: 6 }, { lane: 2, z: 36, count: 6 }],
  },
  {
    length: 48, tier: 0,
    obstacles: [{ kind: 'gate', lane: 0, z: 20 }, { kind: 'gate', lane: 1, z: 20 }, { kind: 'gate', lane: 2, z: 20 }],
    coins: [{ lane: 1, z: 30, count: 8 }],
  },

  // ------------------------------------------------------------ tier 1
  {
    length: 48, tier: 1,
    obstacles: [
      { kind: 'block', lane: 0, z: 12 }, { kind: 'block', lane: 1, z: 12 },
      { kind: 'low', lane: 2, z: 38 },
    ],
    coins: [{ lane: 2, z: 8, count: 6 }, { lane: 2, z: 34, count: 5, arc: true }],
  },
  {
    length: 56, tier: 1,
    obstacles: [{ kind: 'train', lane: 0, z: 20 }, { kind: 'block', lane: 2, z: 46 }],
    coins: [{ lane: 1, z: 12, count: 10 }],
  },
  {
    length: 48, tier: 1,
    obstacles: [
      { kind: 'low', lane: 0, z: 14 }, { kind: 'low', lane: 1, z: 14 }, { kind: 'low', lane: 2, z: 14 },
      { kind: 'gate', lane: 0, z: 40 }, { kind: 'gate', lane: 1, z: 40 }, { kind: 'gate', lane: 2, z: 40 },
    ],
    coins: [{ lane: 1, z: 10, count: 7, arc: true }],
  },
  {
    length: 48, tier: 1,
    obstacles: [
      { kind: 'block', lane: 1, z: 14 }, { kind: 'block', lane: 2, z: 14 },
      { kind: 'block', lane: 0, z: 38 },
    ],
    coins: [{ lane: 0, z: 10, count: 6 }, { lane: 2, z: 36, count: 6 }],
  },

  // ------------------------------------------------------------ tier 2
  {
    length: 64, tier: 2,
    obstacles: [
      { kind: 'train', lane: 1, z: 22 },
      { kind: 'low', lane: 0, z: 50 }, { kind: 'low', lane: 1, z: 50 }, { kind: 'low', lane: 2, z: 50 },
    ],
    coins: [{ lane: 0, z: 14, count: 8 }, { lane: 0, z: 46, count: 5, arc: true }],
  },
  {
    length: 64, tier: 2,
    obstacles: [
      { kind: 'train', lane: 0, z: 20 }, { kind: 'train', lane: 2, z: 20 },
      { kind: 'gate', lane: 0, z: 48 }, { kind: 'gate', lane: 1, z: 48 }, { kind: 'gate', lane: 2, z: 48 },
    ],
    coins: [{ lane: 1, z: 12, count: 12 }],
  },
  {
    length: 56, tier: 2,
    obstacles: [
      { kind: 'block', lane: 0, z: 12 }, { kind: 'low', lane: 1, z: 12 }, { kind: 'block', lane: 2, z: 12 },
      { kind: 'block', lane: 1, z: 40 }, { kind: 'block', lane: 2, z: 40 },
    ],
    coins: [{ lane: 1, z: 8, count: 6, arc: true }, { lane: 0, z: 38, count: 6 }],
  },
  {
    length: 56, tier: 2,
    obstacles: [
      { kind: 'gate', lane: 0, z: 14 }, { kind: 'block', lane: 1, z: 14 }, { kind: 'gate', lane: 2, z: 14 },
      { kind: 'low', lane: 0, z: 42 }, { kind: 'low', lane: 1, z: 42 }, { kind: 'low', lane: 2, z: 42 },
    ],
    coins: [{ lane: 0, z: 38, count: 5, arc: true }],
  },
];

/** Distância em metros a partir da qual cada tier entra no sorteio. */
export const TIER_UNLOCK = [0, 420, 1100] as const;

export function pickPattern(distance: number, rand: () => number): Pattern {
  let maxTier = 0;
  for (let t = TIER_UNLOCK.length - 1; t >= 0; t--) {
    if (distance >= TIER_UNLOCK[t]!) { maxTier = t; break; }
  }
  const pool = PATTERNS.filter((p) => p.tier <= maxTier);
  return pool[Math.floor(rand() * pool.length)]!;
}
