import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SPEED_BASE, SPEED_MAX, SPEED_TAU, TRACK_WIDTH } from '../config';
import { box, paint } from '../render/geometry';

// Integral da curva de velocidade de Game. As divisas valem 10, 20 e 30 s
// de corrida, independentemente da taxa de quadros ou de pausas.
const distanceAt = (seconds: number): number =>
  SPEED_MAX * seconds + (SPEED_MAX - SPEED_BASE) * SPEED_TAU * Math.expm1(-seconds / SPEED_TAU);
const edge = TRACK_WIDTH / 2;
const labels = ['PADARIA DO SOL', 'VILA IPÊ', 'FEIRA DA ESTAÇÃO', 'HORTIFRÚTI', 'VIADUTO', 'AV. DO SOL'];
const themes = [
  { wall: [0xf5bd76, 0xdb8469, 0xe9d9ac], trim: 0x496e6d, canvas: 0xa83f36, planter: 0x799751 },
  { wall: [0xa0bd9c, 0xdbc27a, 0xf2d4a5], trim: 0x546f6e, canvas: 0x287b74, planter: 0x658d50 },
  { wall: [0xc1ad98, 0xe5ac78, 0xbcc2b1], trim: 0x55697a, canvas: 0x8e523f, planter: 0x77915e },
] as const;

type Facade = typeof themes[number];

export class SunsetAvenue {
  private readonly group = new THREE.Group();
  private readonly blocks: THREE.Group[] = [];
  private readonly solids = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly signs: THREE.MeshBasicMaterial;
  private readonly ends = [distanceAt(10), distanceAt(20), distanceAt(30)];
  private readonly bridgeAt = distanceAt(22);

  constructor(scene: THREE.Scene) {
    const map = makeSignAtlas();
    this.signs = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
    themes.forEach((theme, index) => this.buildBlock(theme, index));
    scene.add(this.group);
    this.update(0);
  }

  update(distance: number): void {
    this.group.position.z = distance;
    this.blocks.forEach((block, index) => {
      const start = index === 0 ? -12 : this.ends[index - 1]!;
      block.visible = distance + 150 >= start && distance - 16 <= this.ends[index]!;
    });
  }

  get debug() {
    return { blocks: [...this.ends], bridgeAt: this.bridgeAt, z: this.group.position.z };
  }

  private buildBlock(theme: Facade, index: number): void {
    const group = new THREE.Group();
    const start = index === 0 ? -12 : this.ends[index - 1]!;
    const end = this.ends[index]!;
    const mark = index * 2;

    for (let d = start; d < end; d += 23) {
      const span = Math.min(23, end - d);
      const z = -d - span / 2;
      const parts: THREE.BufferGeometry[] = [];
      const decals: THREE.BufferGeometry[] = [];
      const put = (w: number, h: number, depth: number, x: number, y: number, z: number, color: number) =>
        parts.push(box(w, h, depth, x, y, z, color));

      for (const side of [-1, 1]) {
        put(3.6, .42, span, side * (edge + 2.3), -.09, z, 0xc3aa8b);
        put(.13, .025, span, side * (edge + 1.1), .135, z, 0xead09b);
        for (let offset = 1; offset < span; offset += 2.4) {
          put(3.35, .015, .037, side * (edge + 2.33), .128, -d-offset, 0xa28c76);
        }
        // Os pilares ficam na calçada e têm seu próprio espaço livre.
        if (span < 12 || Math.abs(d + span / 2 - this.bridgeAt) < 18) continue;
        const lamp = side * (edge + 1.3);
        put(.14, 4.25, .14, lamp, 2.17, z + 6.2, 0x414d4d);
        put(1.4, .13, .19, lamp - side * .57, 4.27, z + 6.2, 0x414d4d);
        put(.42, .08, .42, lamp - side * 1.12, 4.18, z + 6.2, 0xffdeb0);

        const storefronts = index === 1 ? 3 : 2;
        for (let shop = 0; shop < storefronts; shop++) {
          const depth = (span - 4) / storefronts;
          const shopZ = -d - 1.7 - (shop + .5) * depth;
          const front = edge + 4.02;
          const x = side * (front + 2.45);
          const variant = Math.abs(Math.floor(d / 23) + shop + side) % 3;
          const height = index === 1 ? 3.15 : 5.6 + variant * .9;

          put(4.9,height,depth-.17,x,height/2-.14,shopZ,theme.wall[variant]!);
          put(5.13,.22,depth+.07,x,height-.07,shopZ,theme.trim);
          put(.15,.52,depth-.3,side*(front-.07),.4,shopZ,theme.trim);
          put(.13,1.65,depth*.62,side*(front-.09),1.29,shopZ,0x304952);
          put(.16,1.45,.85,side*(front-.15),1.08,shopZ+depth*.27,0x71584a);
          put(.20,.15,depth*.67,side*(front-.16),.58,shopZ,0xe5c49a);
          if (height > 4) {
            for (const offset of [-.24,.24]) {
              put(.14,1.14,1.12,side*(front-.06),height-1.55,shopZ+offset*depth,0x4e6570);
              put(.22,.14,1.35,side*(front-.08),height-2.13,shopZ+offset*depth,0xffe0b4);
            }
          }
          if (index !== 2) {
            const length = depth*.78;
            for(let stripe=0;stripe<8;stripe++){
              const awning= new THREE.BoxGeometry(1.5,.115,length/8);
              awning.rotateZ(side*.18);
              awning.translate(side*(front-.7),2.29,shopZ-length/2+(stripe+.5)*length/8);
              parts.push(paint(awning,stripe%2===0?theme.canvas:0xf0d69f));
            }
          }
          if (shop===0) {
            put(.18,.62,3.4,side*(front-.1),3,shopZ,theme.trim);
            decals.push(signPlane(3.25,.53,side*(front-.21),3,shopZ,-side*Math.PI/2,mark+(side===1?1:0)));
          }
        }
        if (index === 1) {
          const trunkX = side * (edge + 2.9);
          put(.85,.4,.85,trunkX,.34,z+6.1,0xae744d);
          put(.18,2.15,.18,trunkX,1.54,z+6.1,0x896347);
          put(1.62,1.25,1.65,trunkX,2.62,z+6.1,theme.planter);
          put(1.1,.73,1.19,trunkX,3.35,z+6.1,0xb0a14d);
        }
      }
      if(d===start){
        const crossing=-d-1.4;
        for(let x=-edge+.53;x<edge-.25;x+=.76){
          put(.39,.016,2.2,x,.039,crossing,0xd9ceb4);
        }
      }
      this.addMesh(group,parts,this.solids);
      this.addMesh(group,decals,this.signs);
    }
    if(index===2)this.buildBridge(group);
    this.blocks.push(group);
    this.group.add(group);
  }

  private addMesh(group: THREE.Group, parts: THREE.BufferGeometry[], material: THREE.Material): void {
    if (!parts.length) return;
    const merged=mergeGeometries(parts,false)!;
    parts.forEach(part=>part.dispose());
    group.add(new THREE.Mesh(merged,material));
  }

  private buildBridge(group: THREE.Group): void {
    const z = -this.bridgeAt;
    const parts: THREE.BufferGeometry[] = [];
    // Vão de 6,2 m: acima da altura do jetpack. Pilares além do meio-fio.
    for (const side of [-1,1]) {
      const x=side*(edge+2.0);
      parts.push(box(1.8,.45,2.05,x,.34,z,0x8e796a));
      parts.push(box(1.18,6.25,1.56,x,3.25,z,0x988e83));
      parts.push(box(1.6,.36,1.98,x,6.02,z,0x736858));
      parts.push(box(.88,.64,.06,x,.95,z+.81,0xd5aa54));
    }
    parts.push(box(32,.85,7.8,0,6.82,z,0xbea98d));
    for(const [width,depth,color] of [[TRACK_WIDTH,12,0x71645e],[TRACK_WIDTH,8.3,0x60564f]] as const){
      parts.push(box(width,.012,depth,0,depth===12?.016:.024,z, color));
    }
    for(const side of [-1,1])for(let mark=-1;mark<=1;mark++){
      parts.push(box(.12,.015,.8,side*(edge-.2),.035,z+mark*2.7,0xdfc76c));
    }
    for (const offset of [-3.51,-1.22,1.22,3.51])
      parts.push(box(32,.26,.38,0,6.34,z+offset,0x776c61));
    for (const side of [-1,1]) {
      parts.push(box(32,.58,.28,0,7.52,z+side*3.83,0x7a8a81));
      parts.push(box(32,.13,.19,0,7.87,z+side*3.83,0xb7c5b1));
    }
    parts.push(box(3.85,.73,.16,0,6.94,z+4,0x30564d));
    this.addMesh(group,parts,this.solids);
    this.addMesh(group,[signPlane(3.7,.65,0,6.94,z+4.09,0,5)],this.signs);
  }
}

function makeSignAtlas(): THREE.CanvasTexture {
  const canvas=document.createElement('canvas');
  canvas.width=512;
  canvas.height=384;
  const ctx=canvas.getContext('2d')!;
  labels.forEach((text,index)=>{
    const y=index*64;
    ctx.fillStyle=index<2?'#663a32':index<4?'#24564f':'#2a4e43';
    ctx.fillRect(0,y,512,64);
    ctx.strokeStyle='#dec79a';
    ctx.lineWidth=2;
    ctx.strokeRect(6,y+5,500,54);
    ctx.font='800 34px sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillStyle='#fff0cf';
    ctx.fillText(text,256,y+33);
  });
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;
  return texture;
}

function signPlane(w: number,h: number,x: number,y: number,z: number,rotation: number, index: number): THREE.BufferGeometry {
  const plane=new THREE.PlaneGeometry(w,h);
  const uv=plane.attributes.uv!;
  for(let i=0;i<uv.count;i++)uv.setXY(i,.006+uv.getX(i)*.988,1-(index+.03+(1-uv.getY(i))*.94)/labels.length);
  plane.rotateY(rotation);
  plane.translate(x,y,z);
  return plane;
}
