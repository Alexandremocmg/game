import { LANE_X } from '../config';
import type { Player } from './Player';
import type { Spawner } from '../world/Spawner';
import type { ObstacleSpec } from '../world/obstacleSpecs';
import { OBSTACLE_SPECS } from '../world/obstacleSpecs';

/**
 * Teste de colisão AABB entre o jogador e os obstáculos ativos.
 *
 * Cada `ObstacleSpec` já declara sua própria faixa vertical, então esta
 * função não conhece regras específicas por tipo — "pular passa por baixo do
 * pórtico" e "rolar passa por baixo do bloco baixo" emergem só da geometria
 * das caixas, sem `if` por tipo de obstáculo. O teste por X já cobre a
 * transição entre pistas, então não há checagem separada de "mesma pista".
 */
export function checkCollision(player: Player, spawner: Spawner): boolean {
  if (player.invulnerable) return false; // voo do jetpack ou i-frames pós-prancha

  const range = 8; // só testa o que está próximo o bastante para importar
  for (const obstacle of spawner.nearbyObstacles(range)) {
    const spec: ObstacleSpec = OBSTACLE_SPECS[obstacle.kind];
    const laneX = LANE_X[obstacle.lane]!;

    const overlapsX = Math.abs(player.x - laneX) < player.hitHalfWidth + spec.halfWidth;
    if (!overlapsX) continue;

    const overlapsZ = Math.abs(obstacle.z) < player.hitHalfDepth + spec.halfDepth;
    if (!overlapsZ) continue;

    const overlapsY = player.hitY0 < spec.y1 && player.hitY1 > spec.y0;
    if (!overlapsY) continue;

    return true;
  }
  return false;
}

/** Janela de Z em torno do jogador considerada "passagem" para fins de quase-acerto. */
const NEAR_MISS_Z = 1.3;
/** Folga vertical/horizontal máxima para contar como "raspou por pouco". */
const NEAR_MISS_MARGIN = 0.5;

/**
 * Detecta uma passagem raspada — mesma pista, obstáculo cruzando a posição
 * do jogador agora, mas desviado com folga pequena em Y (pulo/rolamento no
 * tempo certo, por pouco). Dispara no máximo uma vez por obstáculo, marcado
 * em `nearMissDone` pelo próprio Spawner — só existe para alimentar o
 * tremor de câmera, não afeta a colisão real.
 */
export function checkNearMiss(player: Player, spawner: Spawner): boolean {
  for (const obstacle of spawner.nearbyObstacles(NEAR_MISS_Z)) {
    if (obstacle.nearMissDone) continue;

    const spec: ObstacleSpec = OBSTACLE_SPECS[obstacle.kind];
    const laneX = LANE_X[obstacle.lane]!;
    const overlapsX = Math.abs(player.x - laneX) < player.hitHalfWidth + spec.halfWidth;
    if (!overlapsX) continue;

    const gapBelow = spec.y0 - player.hitY1;
    const gapAbove = player.hitY0 - spec.y1;
    const closeCall = (gapBelow > 0 && gapBelow < NEAR_MISS_MARGIN)
      || (gapAbove > 0 && gapAbove < NEAR_MISS_MARGIN);

    obstacle.nearMissDone = true;
    if (closeCall) return true;
  }
  return false;
}
