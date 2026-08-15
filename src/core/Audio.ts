const SOUND_URLS = {
  jump: 'audio/jump.ogg',
  roll: 'audio/roll.ogg',
  coin: 'audio/coin.ogg',
  crash: 'audio/crash.ogg',
  powerup: 'audio/powerup.ogg',
} as const;

export type SoundName = keyof typeof SOUND_URLS;

/**
 * Efeitos sonoros via Web Audio API — um AudioBufferSourceNode por toque,
 * permite sobrepor o mesmo som (moedas em sequência rápida) sem cortar o
 * anterior, o que um único elemento `<audio>` reiniciado não permite.
 *
 * O AudioContext nasce suspenso: navegadores bloqueiam autoplay até um gesto
 * do usuário. `unlock()` é chamado no mesmo toque que já inicia o jogo, então
 * na prática o áudio nunca fica perceptivelmente mudo.
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();

  constructor() {
    void this.preload();
  }

  private async preload(): Promise<void> {
    const ctx = this.getOrCreateContext();
    const entries = await Promise.all(
      (Object.keys(SOUND_URLS) as SoundName[]).map(async (name) => {
        const res = await fetch(SOUND_URLS[name]);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        return [name, buffer] as const;
      }),
    );
    for (const [name, buffer] of entries) this.buffers.set(name, buffer);
  }

  private getOrCreateContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Chamar no primeiro gesto do usuário (o mesmo toque que inicia o jogo). */
  unlock(): void {
    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  play(name: SoundName, { volume = 1, rate = 1 }: { volume?: number; rate?: number } = {}): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !buffer || ctx.state !== 'running') return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(this.master!);
    source.start();
  }
}
