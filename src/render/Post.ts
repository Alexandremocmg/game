import * as THREE from 'three';
import {
  BloomEffect, BrightnessContrastEffect, EffectComposer, EffectPass, RenderPass, VignetteEffect,
} from 'postprocessing';

/** FPS abaixo disso, sustentado, desliga o pós-processamento pro resto da sessão. */
const LOW_FPS_THRESHOLD = 48;
const LOW_FPS_SUSTAIN = 3;

/**
 * Bloom + vignette + color grade num único EffectPass — mais barato em
 * mobile que passes separados, já que compõe tudo num shader combinado.
 *
 * Se degrada sozinho: se o FPS ficar abaixo do limiar por tempo suficiente
 * (aparelho fraco, muitos objetos em tela), desliga o composer e o jogo volta
 * a usar `renderer.render()` puro pelo resto da sessão.
 */
export class Post {
  private readonly composer: EffectComposer;
  private lowFpsTime = 0;
  enabled = true;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.composer.addPass(new RenderPass(scene, camera));

    const bloom = new BloomEffect({
      luminanceThreshold: 0.7,
      luminanceSmoothing: 0.3,
      intensity: 0.65,
      mipmapBlur: true,
      radius: 0.8,
    });
    const vignette = new VignetteEffect({ darkness: 0.5, offset: 0.3 });
    // leve empurrão quente: bate com o fog laranja/pôr-do-sol do Stage.
    const grade = new BrightnessContrastEffect({ brightness: 0.015, contrast: 0.06 });

    this.composer.addPass(new EffectPass(camera, bloom, vignette, grade));
  }

  resize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  /** Chamado a cada frame com o FPS suavizado do Loop. */
  probe(fps: number, dt: number): void {
    if (!this.enabled) return;
    if (fps < LOW_FPS_THRESHOLD) {
      this.lowFpsTime += dt;
      if (this.lowFpsTime > LOW_FPS_SUSTAIN) this.enabled = false;
    } else {
      this.lowFpsTime = 0;
    }
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
