import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Pinta uma geometria inteira com uma cor por vértice.
 *
 * Usar cor de vértice em vez de um material por cor permite fundir todas as
 * peças de um chunk numa única geometria com um único material — 1 draw call
 * por chunk em vez de um por peça.
 *
 * `THREE.Color` já converte de sRGB para o espaço linear de trabalho, que é
 * exatamente o que o atributo `color` espera.
 */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const count = geo.attributes.position!.count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    data[i * 3] = c.r;
    data[i * 3 + 1] = c.g;
    data[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geo;
}

/** Caixa já posicionada e pintada, pronta para ser fundida. */
export function box(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  color: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  return paint(geo, color);
}

/**
 * Céu em gradiente vertical, gerado em canvas — evita carregar textura de disco.
 *
 * Devolve a textura junto de um `redesenhar`, em vez de uma textura pronta:
 * durante a transição entre temas as cores mudam a cada frame, e criar uma
 * `CanvasTexture` nova a cada vez geraria churn de GPU. Aqui o canvas e a
 * textura são os mesmos do começo ao fim; só o conteúdo é reescrito.
 */
export interface CeuDetalhe {
  /** Nome do tema — chave do cache da camada pré-renderizada. */
  nome: string;
  /**
   * Disco celeste, posicionado em **azimute e elevação**, não em pixel.
   *
   * A conversão para UV não é óbvia e errá-la enterra o astro: o three.js
   * amostra o fundo equirretangular com
   * `u = atan2(dir.z, dir.x)/2π + 0.5` e `v = asin(dir.y)/π + 0.5`. Como a
   * câmera do jogo olha para −Z, o "à frente" cai em **u = 0,25** — não em
   * 0,5, que é o palpite natural e coloca o astro atrás do jogador.
   *
   * **Faixa útil de elevação: 0° a ~25°.** A câmera aponta ~10° para baixo
   * (de `CAMERA_POS` para `CAMERA_LOOK`) e o meio-FOV vertical vai a 35,5° com
   * o bônus de velocidade, então o topo do frustum fica em ~25°. Um astro
   * acima disso existe na textura e nunca é visto — foi o segundo jeito de
   * enterrar o sol depois de acertar o azimute.
   */
  astro?: { azimute: number; elevacao: number; raio: number; cor: number; halo: number; haloCor: number };
  /** Quantidade de estrelas espalhadas acima do horizonte. */
  estrelas?: number;
}

/** Azimute em voltas (0 = à frente da câmera) para a coordenada U da textura. */
function azimuteParaU(voltas: number): number {
  return (0.25 + voltas) % 1;
}

/** Elevação em graus para a coordenada Y do canvas (0 = topo da imagem). */
function elevacaoParaY(graus: number): number {
  const v = Math.asin(Math.sin((graus * Math.PI) / 180)) / Math.PI + 0.5;
  return 1 - v; // o canvas cresce para baixo; a textura, para cima
}

export function makeSkyGradient(top: number, horizon: number): {
  texture: THREE.Texture;
  redesenhar: (top: number, horizon: number, a?: CeuDetalhe, b?: CeuDetalhe, t?: number) => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  /**
   * Camadas de detalhe pré-renderizadas, uma por tema.
   *
   * O céu é repintado a cada frame durante a transição entre ambientes.
   * Desenhar centenas de estrelas nesse laço jogaria fora todo o cuidado que o
   * resto do projeto tem com alocação — então cada camada é pintada **uma
   * vez** no seu próprio canvas, e a transição só compõe as duas com alfa.
   */
  const camadas = new Map<string, HTMLCanvasElement>();

  function camadaDe(d: CeuDetalhe): HTMLCanvasElement {
    const pronta = camadas.get(d.nome);
    if (pronta) return pronta;

    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const cx = c.getContext('2d')!;

    if (d.estrelas) {
      const horizonte = elevacaoParaY(0);
      for (let i = 0; i < d.estrelas; i++) {
        // Só acima do horizonte: estrela abaixo dele seria engolida pela névoa
        // e pelos prédios de qualquer jeito.
        const x = Math.random() * c.width;
        const y = Math.random() * c.height * horizonte;
        const brilho = 0.45 + Math.random() * 0.55;
        cx.fillStyle = `rgba(255,255,255,${brilho.toFixed(2)})`;
        // Perto do horizonte a estrela some na névoa; concentrar tamanho no
        // alto é o que faz o céu parecer profundo em vez de chapado.
        const r = Math.random() < 0.82 ? 1.3 : 2.2;
        cx.fillRect(x, y, r, r);
      }
    }

    if (d.astro) {
      const { azimute, elevacao, raio, cor, halo, haloCor } = d.astro;
      const x = azimuteParaU(azimute) * c.width;
      const y = elevacaoParaY(elevacao) * c.height;
      if (halo > 0) {
        const g = cx.createRadialGradient(x, y, 0, x, y, raio * halo);
        g.addColorStop(0, hexA(haloCor, 0.55));
        g.addColorStop(0.45, hexA(haloCor, 0.16));
        g.addColorStop(1, hexA(haloCor, 0));
        cx.fillStyle = g;
        cx.fillRect(x - raio * halo, y - raio * halo, raio * halo * 2, raio * halo * 2);
      }
      cx.fillStyle = hex(cor);
      cx.beginPath();
      cx.arc(x, y, raio, 0, Math.PI * 2);
      cx.fill();
    }

    camadas.set(d.nome, c);
    return c;
  }

  function redesenhar(
    corTopo: number, corHorizonte: number, a?: CeuDetalhe, b?: CeuDetalhe, t = 0,
  ): void {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0.0, hex(corTopo));
    grad.addColorStop(0.55, mix(corTopo, corHorizonte, 0.45));
    grad.addColorStop(0.85, hex(corHorizonte));
    grad.addColorStop(1.0, hex(corHorizonte));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (a) {
      ctx.globalAlpha = 1 - t;
      ctx.drawImage(camadaDe(a), 0, 0);
    }
    if (b && b !== a && t > 0) {
      ctx.globalAlpha = t;
      ctx.drawImage(camadaDe(b), 0, 0);
    }
    ctx.globalAlpha = 1;

    texture.needsUpdate = true;
  }

  redesenhar(top, horizon);
  return { texture, redesenhar };
}

/**
 * As quatro silhuetas do cenário lateral.
 *
 * Até aqui todo prédio era o mesmo cubo esticado — uma torre, uma rocha e um
 * galpão eram literalmente a mesma peça. Quatro formas resolvem a leitura do
 * skyline sem sair do instanciamento: cada uma vira uma `InstancedMesh`, e o
 * tema decide com que peso sorteia cada uma.
 *
 * Todas nascem com **base em y = 0 e 1×1 na planta**, para que a escala por
 * instância continue significando largura/altura/profundidade direto. E todas
 * saem de `BoxGeometry`, que já traz UV por face — é dela que as janelas
 * dependem.
 */
export function makeBuildingShapes(): THREE.BufferGeometry[] {
  const naBase = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };

  // 1. bloco simples — o que existia
  const bloco = naBase(1, 1, 1, 0, 0.5, 0);

  // 2. recuo no topo: corpo até 78% e um volume menor acima
  const recuo = mergeGeometries([
    naBase(1, 0.78, 1, 0, 0.39, 0),
    naBase(0.62, 0.22, 0.62, 0, 0.89, 0),
  ], false)!;

  // 3. torre com antena — a que dá pontas altas ao skyline
  const torre = mergeGeometries([
    naBase(1, 0.92, 1, 0, 0.46, 0),
    naBase(0.34, 0.06, 0.34, 0, 0.95, 0),
    naBase(0.05, 0.12, 0.05, 0, 1.04, 0),
  ], false)!;

  // 4. platibanda: laje mais larga que o corpo, coroando o topo
  const platibanda = mergeGeometries([
    naBase(1, 0.9, 1, 0, 0.45, 0),
    naBase(1.12, 0.1, 1.12, 0, 0.95, 0),
  ], false)!;

  return [bloco, recuo, torre, platibanda];
}

/**
 * Carro parado de cenário, já em metros reais — diferente dos prédios
 * (3 a 30 unidades, por isso normalizados a um cubo 1×1×1 e escalados por
 * instância), o carro tem tamanho quase fixo, então a geometria nasce direto
 * no tamanho final e a instância só reposiciona.
 *
 * A cor por instância de uma `InstancedMesh` **multiplica** a cor por vértice
 * já assada na geometria — não a substitui. É o mesmo mecanismo dos prédios,
 * mas aqui rende mais: lataria e cabine em branco (1×instância = a cor da
 * instância aparece pura) e rodas/parachoques em cinza quase preto
 * (1×instância continua escuro, qualquer que seja a cor sorteada) — um único
 * material serve tanto a carroceria colorida por tema quanto os detalhes que
 * nunca devem colorir.
 */
export function makeCarShape(): THREE.BufferGeometry {
  const detalhe = 0x14161c; // quase preto: multiplicado por qualquer cor, continua escuro
  const partes = [
    // corpo — branco, para a cor da instância aparecer pura
    box(1.75, 0.62, 4.1, 0, 0.62, 0, 0xffffff),
    // cabine, recuada para a metade traseira
    box(1.5, 0.5, 2.0, 0, 1.18, -0.35, 0xffffff),
    box(1.8, 0.22, 0.28, 0, 0.34, 1.95, detalhe),
    box(1.8, 0.22, 0.28, 0, 0.34, -1.95, detalhe),
  ];
  // quatro rodas, uma em cada canto
  for (const x of [-0.78, 0.78]) {
    for (const z of [-1.3, 1.3]) {
      partes.push(box(0.4, 0.62, 0.62, x, 0.31, z, detalhe));
    }
  }
  return mergeGeometries(partes, false)!;
}

/**
 * Grade de janelas para usar como `emissiveMap` dos prédios.
 *
 * É o maior salto de qualidade percebida desta fase e não custa nenhum draw
 * call: o brilho vem do mapa emissivo do material que já existia, e o bloom —
 * que na noite tem limiar baixo — transforma as janelas acesas em pontos de
 * luz de verdade.
 *
 * Textura pequena de propósito: a esta distância a janela é um ponto, e um
 * atlas grande só gastaria memória de GPU.
 *
 * **Limitação assumida:** o UV é por geometria e a escala é por instância,
 * então a janela estica junto com o prédio. Sem shader customizado não há como
 * variar UV por instância — e o efeito colateral lê como "prédio de outro
 * tipo", não como defeito.
 */
export function makeWindowTexture(colunas = 6, linhas = 12, acesas = 0.55): THREE.Texture {
  const cel = 16;
  const canvas = document.createElement('canvas');
  canvas.width = colunas * cel;
  canvas.height = linhas * cel;
  const ctx = canvas.getContext('2d')!;

  // Fundo preto = emissivo zero: a parede não brilha, só a janela.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const margem = cel * 0.28;
  const larg = cel - margem * 2;
  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < colunas; c++) {
      if (Math.random() > acesas) continue;
      // Brilho variado evita a grade perfeita que denuncia textura gerada.
      const v = Math.round(150 + Math.random() * 105);
      ctx.fillStyle = `rgb(${v},${Math.round(v * 0.93)},${Math.round(v * 0.78)})`;
      ctx.fillRect(c * cel + margem, l * cel + margem, larg, larg * 0.8);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Sombra do jogador como decalque radial.
 * Um shadow map real custaria um passe de render inteiro para uma sombra que,
 * nesta câmera, aparece como uma mancha sob os pés.
 */
export function makeBlobShadowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;

  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hex(v: number): string {
  return '#' + v.toString(16).padStart(6, '0');
}

function hexA(v: number, alpha: number): string {
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

function mix(a: number, b: number, t: number): string {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return '#' + ca.lerp(cb, t).getHexString();
}
