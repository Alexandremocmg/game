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
  const loadingScreen = document.getElementById('loading-screen');
  const barFill = document.getElementById('loader-bar-fill');
  const percentEl = document.getElementById('loader-percent');

  const assetProgress: Record<string, number> = {};
  const totalAssets = 9; // 4 obstacles + 4 power-ups + 1 player model

  const updateProgress = (id: string, ratio: number) => {
    assetProgress[id] = ratio;
    const sum = Object.values(assetProgress).reduce((a, b) => a + b, 0);
    const overallRatio = Math.min(1, sum / totalAssets);
    const percent = Math.floor(overallRatio * 100);

    if (barFill) barFill.style.width = `${percent}%`;
    if (percentEl) percentEl.textContent = `${percent}%`;
  };

  const obstacleCallbacks = {
    low: (r: number) => updateProgress('obs_low', r),
    gate: (r: number) => updateProgress('obs_gate', r),
    block: (r: number) => updateProgress('obs_block', r),
    train: (r: number) => updateProgress('obs_train', r),
  };

  const powerUpCallbacks = {
    magnet: (r: number) => updateProgress('pu_magnet', r),
    jetpack: (r: number) => updateProgress('pu_jetpack', r),
    multiplier: (r: number) => updateProgress('pu_multiplier', r),
    board: (r: number) => updateProgress('pu_board', r),
  };

  let models: Partial<Record<ObstacleKind, THREE.Object3D>> = {};
  let powerUpModels: Partial<Record<PowerUpKind, THREE.Object3D>> = {};
  let playerModel: { scene: THREE.Group; animations: THREE.AnimationClip[] } | null = null;
  try {
    const results = await Promise.all([
      preloadObstacleModels(obstacleCallbacks),
      preloadPowerUpModels(powerUpCallbacks),
      USE_CHARACTER_MODEL ? loadPlayerModel((r) => updateProgress('player', r)) : Promise.resolve(null),
    ]);
    models = results[0];
    powerUpModels = results[1];
    playerModel = results[2];
  } catch (err) {
    // Sem os modelos, o Spawner cai de volta nas formas de reserva —
    // o jogo continua jogável mesmo se o carregamento falhar.
    console.error('Falha ao carregar modelos 3D, usando geometria de reserva.', err);
  }

  // Completa a barra e esconde a tela de carregamento
  if (barFill) barFill.style.width = '100%';
  if (percentEl) percentEl.textContent = '100%';
  setTimeout(() => {
    loadingScreen?.classList.add('hidden');
  }, 200);

  const canvasEl = canvas as HTMLCanvasElement;
  const game = new Game(canvasEl, models, powerUpModels, playerModel);

  if (import.meta.env.DEV) {
    (window as unknown as { game: Game }).game = game;
  }
}

void boot();
