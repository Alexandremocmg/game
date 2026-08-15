import * as THREE from 'three';
import {
  BloomEffect, BrightnessContrastEffect, EffectComposer, EffectPass,
  HueSaturationEffect, RenderPass, VignetteEffect,
} from 'postprocessing';
import { TEMAS, type Tema } from '../world/themes';

/** FPS abaixo disso, sustentado, desliga o pós-processamento pro resto da sessão. */
const LOW_FPS_THRESHOLD = 48;
const LOW_FPS_SUSTAIN = 3;
/**
 * Carência antes de a sonda começar a julgar o aparelho.
 *
 * Os primeiros segundos são sempre lentos — compilação de shader, upload de
 * textura para a GPU, e a média de FPS do `Loop` partindo de zero. Sem esta
 * carência esse aquecimento era lido como "aparelho fraco" e o
 * pós-processamento se desligava sozinho, em definitivo, mesmo num aparelho
 * rodando a 60fps cravados. O efeito sumia sem ninguém notar.
 */
const WARMUP_TIME = 4;

/**
 * Bloom + vignette + saturação + brilho/contraste num único EffectPass — mais
 * barato em mobile que passes separados, já que compõe tudo num shader
 * combinado.
 *
 * Os parâmetros vêm do tema e são interpolados junto com o céu, então o
 * tratamento de imagem acompanha o ambiente: a noite ganha bloom forte com
 * limiar baixo (é o que acende o neon e as faixas), o deserto ganha bloom
 * fraco com limiar alto (senão a cena clara estoura de branco).
 *
 * Se degrada sozinho: se o FPS ficar abaixo do limiar por tempo suficiente
 * (aparelho fraco, muitos objetos em tela), desliga o composer e o jogo volta
 * a usar `renderer.render()` puro pelo resto da sessão.
 */
export class Post {
  private readonly composer: EffectComposer;
  private readonly bloom: BloomEffect;
  private readonly vignette: VignetteEffect;
  private readonly matiz: HueSaturationEffect;
  private readonly brilho: BrightnessContrastEffect;

  private lowFpsTime = 0;
  private warmup = WARMUP_TIME;
  enabled = true;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const inicial = TEMAS[0]!;

    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new BloomEffect({
      luminanceThreshold: inicial.bloomLimiar,
      luminanceSmoothing: 0.3,
      intensity: inicial.bloomIntensidade,
      mipmapBlur: true,
      radius: 0.8,
    });
    this.vignette = new VignetteEffect({ darkness: inicial.vinheta, offset: 0.3 });
    this.matiz = new HueSaturationEffect({ saturation: inicial.saturacao });
    this.brilho = new BrightnessContrastEffect({
      brightness: inicial.brilho,
      contrast: inicial.contraste,
    });

    this.composer.addPass(
      new EffectPass(camera, this.bloom, this.vignette, this.matiz, this.brilho),
    );
  }

  /**
   * Mistura o tratamento de imagem de dois temas. Espelha `Stage.aplicarTema`
   * e recebe o mesmo `t`, para que grade e ambiente cheguem juntos — um céu
   * já noturno com o bloom ainda do entardecer entregaria a transição.
   *
   * Tudo aqui é escrita de uniform, sem recompilar shader.
   */
  aplicarTema(a: Tema, b: Tema, t: number): void {
    this.bloom.intensity = lerp(a.bloomIntensidade, b.bloomIntensidade, t);
    this.bloom.luminanceMaterial.threshold = lerp(a.bloomLimiar, b.bloomLimiar, t);
    this.vignette.darkness = lerp(a.vinheta, b.vinheta, t);
    this.matiz.saturation = lerp(a.saturacao, b.saturacao, t);
    this.brilho.brightness = lerp(a.brilho, b.brilho, t);
    this.brilho.contrast = lerp(a.contraste, b.contraste, t);
  }

  resize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  /** Chamado a cada frame com o FPS suavizado do Loop. */
  probe(fps: number, dt: number): void {
    if (!this.enabled) return;

    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    // `fps` nasce em 0 e sobe por média móvel; enquanto não houver medida de
    // verdade, não há o que julgar.
    if (fps <= 0) return;

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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
