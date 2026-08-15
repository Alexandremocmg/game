import type * as THREE from 'three';
import { USE_CHARACTER_MODEL } from './config';
import { loadPlayerModel, preloadObstacleModels, preloadPowerUpModels } from './core/Assets';
import { Game } from './core/Game';
import type { ObstacleKind } from './world/obstacleSpecs';
import type { PowerUpKind } from './world/powerUpSpecs';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('canvas #game não encontrado');
}

async function boot(): Promise<void> {
  let models: Partial<Record<ObstacleKind, THREE.Object3D>> = {};
  let powerUpModels: Partial<Record<PowerUpKind, THREE.Object3D>> = {};
  let playerModel: { scene: THREE.Group; animations: THREE.AnimationClip[] } | null = null;
  try {
    const results = await Promise.all([
      preloadObstacleModels(),
      preloadPowerUpModels(),
      USE_CHARACTER_MODEL ? loadPlayerModel() : Promise.resolve(null),
    ]);
    models = results[0];
    powerUpModels = results[1];
    playerModel = results[2];
  } catch (err) {
    // Sem os modelos, o Spawner cai de volta nas formas de reserva —
    // o jogo continua jogável mesmo se o carregamento falhar.
    console.error('Falha ao carregar modelos 3D, usando geometria de reserva.', err);
  }

  const canvasEl = canvas as HTMLCanvasElement;
  const game = new Game(canvasEl, models, powerUpModels, playerModel);

  if (import.meta.env.DEV) {
    (window as unknown as { game: Game }).game = game;
  }
}

void boot();
