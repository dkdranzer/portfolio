// "Ride through the city, take the boat, rise above the clouds."
// Framework-agnostic: createRideScene(canvas, opts) -> { setProgress, setPointer, dispose }.
//
// Progress (0..1) is split into legs:
//   0.00 – 0.50  motorbike: Paris-style canal → city boulevard → billboard plaza → skill panels → dock
//   0.50 – 0.745 speedboat across the bay past floating project billboards, under a suspension bridge
//   0.745 – 0.92 camera climbs a glass tower above the clouds (education cards float there)
//   0.92 – 1.00  sunset above the clouds (contact)

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export type RideSceneOptions = {
  quality?: "high" | "low";
  billboards?: { stop: number; title: string; sub?: string; side?: 1 | -1; gantry?: boolean }[];
  skillPanels?: { stop: number; title: string; items: string[] }[];
  plaza?: { stop: number; screens: { title: string; sub?: string; big?: boolean }[] };
  projects?: { stop: number; title: string; kind: string; blurb: string; tags: string[] }[];
  eduCards?: { title: string; sub: string }[];
};

export type RideScene = {
  setProgress: (p: number) => void;
  setPointer: (x: number, y: number) => void;
  dispose: () => void;
};

export const LEG = { roadEnd: 0.5, boatEnd: 0.745, climbEnd: 0.92 } as const;

const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
function smooth(e0: number, e1: number, x: number) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** road parameter (0..1 along the street) for a progress value in the bike leg */
export const roadT = (p: number) => 0.02 + clamp01(p / LEG.roadEnd) * 0.96;
/** boat parameter (0..1 across the bay) */
export const boatS = (p: number) => clamp01((p - LEG.roadEnd) / (LEG.boatEnd - LEG.roadEnd));

export function createRideScene(canvas: HTMLCanvasElement, opts: RideSceneOptions = {}): RideScene {
  const quality = opts.quality ?? "high";
  const hi = quality === "high";
  const rand = rng(7);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: hi, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, hi ? 1.75 : 1.25));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const fog = new THREE.Fog(new THREE.Color("#c9826b"), 90, hi ? 760 : 520);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4200);

  // ================================================================ routes
  const road = new THREE.CatmullRomCurve3(
    ([[0, 60], [0, -40], [10, -140], [-8, -240], [-30, -340], [-20, -440], [14, -540], [34, -640], [30, -740], [18, -840], [10, -930], [6, -1004]] as const)
      .map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false, "centripetal",
  );
  const ROAD_LEN = road.getLength();
  const frame = (curve: THREE.Curve<THREE.Vector3>, t: number) => {
    const tc = clamp01(t);
    const pos = curve.getPointAt(tc, new THREE.Vector3());
    const tan = curve.getTangentAt(tc, new THREE.Vector3()).normalize();
    const right = new THREE.Vector3().crossVectors(tan, UP).normalize();
    return { pos, tan, right };
  };
  const rf = (t: number) => frame(road, t);

  const DOCK = rf(1).pos.clone();
  const PIER_END = DOCK.clone().add(new THREE.Vector3(0, 0, -34));
  const water = new THREE.CatmullRomCurve3(
    [PIER_END.clone().add(new THREE.Vector3(5, 0, -4)), new THREE.Vector3(-30, 0, -1200), new THREE.Vector3(-55, 0, -1420), new THREE.Vector3(10, 0, -1650),
      new THREE.Vector3(40, 0, -1880), new THREE.Vector3(5, 0, -2120), new THREE.Vector3(-8, 0, -2300), new THREE.Vector3(0, 0, -2392)],
    false, "centripetal",
  );
  const WATER_LEN = water.getLength();
  const wf = (s: number) => frame(water, s);
  const SHORE_NEAR = -1012, SHORE_FAR = -2402;
  const TOWER = new THREE.Vector3(0, 0, -2470);
  const TOWER_H = 170;

  // ================================================================ sky (three palettes blended over the journey)
  const pal = {
    golden: { z: [0.10, 0.15, 0.30], m: [0.70, 0.40, 0.42], h: [1.0, 0.62, 0.36], g: [1.0, 0.55, 0.25], c: [0.95, 0.55, 0.45], sun: [0.25, 0.07, -1], fog: [0.79, 0.51, 0.42], light: [1.0, 0.75, 0.54], li: 2.6 },
    day: { z: [0.14, 0.36, 0.78], m: [0.42, 0.64, 0.92], h: [0.82, 0.89, 0.96], g: [1.0, 0.95, 0.85], c: [1.0, 1.0, 1.0], sun: [0.35, 0.6, -0.72], fog: [0.70, 0.80, 0.92], light: [1.0, 0.97, 0.9], li: 3.0 },
    sunset: { z: [0.13, 0.10, 0.30], m: [0.88, 0.36, 0.32], h: [1.0, 0.56, 0.24], g: [1.0, 0.5, 0.2], c: [1.0, 0.6, 0.45], sun: [0.0, 0.035, -1], fog: [0.85, 0.45, 0.35], light: [1.0, 0.6, 0.38], li: 2.4 },
  };
  type Pal = typeof pal.golden;
  const skyU = {
    sunDir: { value: new THREE.Vector3() }, time: { value: 0 },
    cZ: { value: new THREE.Color() }, cM: { value: new THREE.Color() }, cH: { value: new THREE.Color() }, cG: { value: new THREE.Color() }, cC: { value: new THREE.Color() },
  };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir; uniform vec3 sunDir, cZ, cM, cH, cG, cC; uniform float time;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(cH, cM, smoothstep(0.0, 0.2, h));
        col = mix(col, cZ, smoothstep(0.15, 0.75, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += cG * pow(s, 6.0) * 0.5 + cG * pow(s, 60.0) * 0.7;
        col += vec3(1.0,0.95,0.85) * smoothstep(0.9993, 0.9997, s) * 3.0;
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.6;
          float c = fbm(uv + vec2(time*0.004, 0.0));
          c = smoothstep(0.5, 0.85, c) * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.35, 0.85, h));
          col = mix(col, mix(cC, cG, pow(s, 3.0)*0.5), c * 0.75);
        }
        col = mix(col, cH * 0.55, smoothstep(0.0, -0.1, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3200, 48, 24), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight("#9fb4ff", "#5a3a2c", 0.6);
  const sun = new THREE.DirectionalLight("#ffc08a", 2.6);
  scene.add(hemi, sun, sun.target);

  const mixPal = (a: Pal, b: Pal, k: number) => {
    const L = (x: number[], y: number[]) => x.map((v, i) => v + (y[i] - v) * k);
    return { z: L(a.z, b.z), m: L(a.m, b.m), h: L(a.h, b.h), g: L(a.g, b.g), c: L(a.c, b.c), sun: L(a.sun, b.sun), fog: L(a.fog, b.fog), light: L(a.light, b.light), li: a.li + (b.li - a.li) * k };
  };
  const palAt = (p: number) => {
    if (p < 0.42) return mixPal(pal.golden, pal.day, smooth(0.3, 0.44, p));
    return mixPal(pal.day, pal.sunset, smooth(0.86, 0.97, p));
  };
  const applyPal = (P: ReturnType<typeof mixPal>) => {
    skyU.cZ.value.setRGB(P.z[0], P.z[1], P.z[2]); skyU.cM.value.setRGB(P.m[0], P.m[1], P.m[2]);
    skyU.cH.value.setRGB(P.h[0], P.h[1], P.h[2]); skyU.cG.value.setRGB(P.g[0], P.g[1], P.g[2]);
    skyU.cC.value.setRGB(P.c[0], P.c[1], P.c[2]);
    skyU.sunDir.value.set(P.sun[0], P.sun[1], P.sun[2]).normalize();
    fog.color.setRGB(P.fog[0], P.fog[1], P.fog[2]);
    sun.color.setRGB(P.light[0], P.light[1], P.light[2]); sun.intensity = P.li;
  };

  // reflections from the sky — rebuilt when the palette shifts
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
  let envRT: THREE.WebGLRenderTarget | null = null;
  let envKey = -1;
  const refreshEnv = (p: number) => {
    const key = Math.round(palKey(p) * 8);
    if (key === envKey) return;
    envKey = key;
    envRT?.dispose();
    envRT = pmrem.fromScene(envScene, 0.02);
    scene.environment = envRT.texture;
  };
  const palKey = (p: number) => smooth(0.3, 0.44, p) + smooth(0.86, 0.97, p);
  applyPal(palAt(0));
  refreshEnv(0);
  scene.environmentIntensity = 0.9;

  // ================================================================ textures
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d")!);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    return tx;
  };
  const wrapText = (g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 6) => {
    const words = text.split(" "); let line = ""; let n = 0;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines - 1) break; }
      else line = test;
    }
    g.fillText(line, x, y);
  };

  const roadTex = canvasTex(256, 256, (g) => {
    g.fillStyle = "#2b2a2e"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    g.fillStyle = "#d9d2c0"; g.fillRect(8, 0, 5, 256); g.fillRect(243, 0, 5, 256);
    g.fillStyle = "#e8b54a"; g.fillRect(124, 0, 4, 140); g.fillRect(130, 0, 4, 140);
  });
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  const walkTex = canvasTex(128, 128, (g) => {
    g.fillStyle = "#8f8279"; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#6d625b"; g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); }
  });
  walkTex.wrapS = walkTex.wrapT = THREE.RepeatWrapping;

  // water normal map from layered noise
  const waterNormal = (() => {
    const S = 256, hgt = new Float32Array(S * S);
    const r = rng(99);
    const grid = (n: number) => { const a = new Float32Array((n + 1) * (n + 1)); for (let i = 0; i < a.length; i++) a[i] = r(); for (let i = 0; i <= n; i++) { a[i * (n + 1) + n] = a[i * (n + 1)]; a[n * (n + 1) + i] = a[i]; } return a; };
    for (const [n, amp] of [[8, 1], [16, 0.5], [32, 0.25], [64, 0.12]] as const) {
      const gr = grid(n);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const fx = (x / S) * n, fy = (y / S) * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const v = (gr[iy * (n + 1) + ix] * (1 - sx) + gr[iy * (n + 1) + ix + 1] * sx) * (1 - sy) + (gr[(iy + 1) * (n + 1) + ix] * (1 - sx) + gr[(iy + 1) * (n + 1) + ix + 1] * sx) * sy;
        hgt[y * S + x] += v * amp;
      }
    }
    const c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d")!; const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hL = hgt[y * S + ((x - 1 + S) % S)], hR = hgt[y * S + ((x + 1) % S)], hD = hgt[((y - 1 + S) % S) * S + x], hU = hgt[((y + 1) % S) * S + x];
      const n = new THREE.Vector3((hL - hR) * 2.2, (hD - hU) * 2.2, 1).normalize();
      const i = (y * S + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const waterMat = new THREE.MeshStandardMaterial({ color: "#2f5f86", roughness: 0.12, metalness: 0.85, normalMap: waterNormal, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.2 });
  waterNormal.repeat.set(60, 30);

  const windowTex = (seed: number, cols: number, rows: number, wall: string, litP: number) => {
    const r = rng(seed), r2 = rng(seed);
    const cell = (g: CanvasRenderingContext2D, rr: () => number, emissive: boolean) => {
      const cw = 256 / cols, rh = 512 / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const lit = rr() < litP; const a = rr(), b = rr();
        if (emissive) { if (lit) { g.fillStyle = "#fff"; g.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.22, cw * 0.64, rh * 0.56); } }
        else { g.fillStyle = lit ? `hsl(${32 + a * 14},90%,${62 + b * 18}%)` : `rgba(40,55,80,${0.75 + a * 0.2})`; g.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.22, cw * 0.64, rh * 0.56); }
      }
    };
    return {
      map: canvasTex(256, 512, (g) => { g.fillStyle = wall; g.fillRect(0, 0, 256, 512); cell(g, r, false); }),
      emis: canvasTex(256, 512, (g) => { g.fillStyle = "#000"; g.fillRect(0, 0, 256, 512); cell(g, r2, true); }),
    };
  };
  const glowTitle = (title: string, sub?: string, accent = "#ff9a4d") =>
    canvasTex(1024, 384, (g) => {
      const grd = g.createLinearGradient(0, 0, 1024, 384); grd.addColorStop(0, "#120d18"); grd.addColorStop(1, "#24121a");
      g.fillStyle = grd; g.fillRect(0, 0, 1024, 384);
      g.strokeStyle = accent; g.lineWidth = 10; g.strokeRect(14, 14, 996, 356);
      g.fillStyle = "#fff4e6"; g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = accent; g.shadowBlur = 28;
      let size = 150; const font = (s: number) => `900 ${s}px Anton, Impact, "Arial Black", sans-serif`;
      g.font = font(size); while (g.measureText(title).width > 920 && size > 50) { size -= 6; g.font = font(size); }
      g.fillText(title, 512, sub ? 160 : 192);
      if (sub) { g.shadowBlur = 10; g.fillStyle = "#ffb27a"; g.font = `600 46px "Space Grotesk", Arial, sans-serif`; g.fillText(sub, 512, 300); }
    });
  const softTex = (inner: string) => canvasTex(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, inner); grd.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  });

  // ================================================================ ground, road, sidewalks, canal, water, shores
  const ribbon = (curve: THREE.Curve<THREE.Vector3>, len: number, t0: number, t1: number, l0: number, l1: number, y: number, segs: number, uScale: number, vLen: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = t0 + (t1 - t0) * (i / segs);
      const f = frame(curve, t);
      const a = f.pos.clone().addScaledVector(f.right, l0); a.y += y;
      const b = f.pos.clone().addScaledVector(f.right, l1); b.y += y;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const v = (t * len) / vLen; uv.push(0, v, uScale, v);
      if (i < segs) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  };
  const SEGS = hi ? 1300 : 700;
  scene.add(new THREE.Mesh(ribbon(road, ROAD_LEN, 0, 1, -7, 7, 0.02, SEGS, 1, 14), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.82, metalness: 0.05 })));
  const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9 });
  scene.add(new THREE.Mesh(ribbon(road, ROAD_LEN, 0, 1, 7, 12, 0.18, SEGS / 2, 2, 5), walkMat));
  scene.add(new THREE.Mesh(ribbon(road, ROAD_LEN, 0, 1, -12, -7, 0.18, SEGS / 2, 2, 5), walkMat));
  const stoneMat = new THREE.MeshStandardMaterial({ color: "#b58a6a", roughness: 0.85 });
  // Paris-style canal on the left at the start
  const CANAL_END = 0.14;
  const canalMat = new THREE.MeshStandardMaterial({ color: "#3f7fa6", roughness: 0.1, metalness: 0.55, normalMap: waterNormal, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 1.4 });
  scene.add(new THREE.Mesh(ribbon(road, ROAD_LEN, 0, CANAL_END, -30, -13, 0.04, 200, 1, 30), canalMat));
  scene.add(new THREE.Mesh(ribbon(road, ROAD_LEN, 0, CANAL_END, -13, -12, 0.35, 200, 1, 4), stoneMat));
  scene.add(new THREE.Mesh(ribbon(road, ROAD_LEN, 0, CANAL_END, -31, -30, 0.35, 200, 1, 4), stoneMat));

  const groundMat = new THREE.MeshStandardMaterial({ color: "#3a2f2b", roughness: 1 });
  const nearGround = new THREE.Mesh(new THREE.PlaneGeometry(3400, 700 - SHORE_NEAR), groundMat);
  nearGround.rotation.x = -Math.PI / 2; nearGround.position.set(0, -0.06, (700 + SHORE_NEAR) / 2);
  const farGround = new THREE.Mesh(new THREE.PlaneGeometry(3400, 1400), groundMat);
  farGround.rotation.x = -Math.PI / 2; farGround.position.set(0, -0.06, SHORE_FAR - 700);
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(3400, SHORE_NEAR - SHORE_FAR + 4), waterMat);
  bay.rotation.x = -Math.PI / 2; bay.position.set(0, 0.02, (SHORE_NEAR + SHORE_FAR) / 2);
  scene.add(nearGround, farGround, bay);
  for (const z of [SHORE_NEAR, SHORE_FAR]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3400, 2.2, 3), new THREE.MeshStandardMaterial({ color: "#6f6a66", roughness: 0.9 }));
    wall.position.set(0, -0.5, z); scene.add(wall);
  }
  // pier at the end of the road
  {
    const wood = new THREE.MeshStandardMaterial({ color: "#6b4b33", roughness: 0.9 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 40), wood);
    deck.position.set(DOCK.x, 0.45, DOCK.z - 18); scene.add(deck);
    for (let k = 0; k < 8; k++) for (const s of [-5.5, 5.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3.2, 8), wood);
      post.position.set(DOCK.x + s, -0.6, DOCK.z - 2 - k * 5); scene.add(post);
    }
  }

  // ================================================================ buildings
  const towerSpot = (() => { const f = rf(0.2); return f.pos.clone().addScaledVector(f.right, -66).setY(0); })();
  const wheelSpot = (() => { const f = rf(0.11); return f.pos.clone().addScaledVector(f.right, 64).setY(0); })();
  const clear = (p: THREE.Vector3) => p.distanceTo(towerSpot) > 34 && p.distanceTo(wheelSpot) > 26;
  const zoneDowntown = (t: number) => smooth(0.2, 0.3, t);
  const styles = [
    { tex: windowTex(11, 6, 18, "#6b5348", 0.32), h: [14, 30], w: [14, 24], metal: 0.15, rough: 0.7, color: "#ffffff" },
    { tex: windowTex(23, 8, 30, "#3e4656", 0.26), h: [32, 70], w: [16, 26], metal: 0.55, rough: 0.35, color: "#c9d6ff" },
    { tex: windowTex(37, 10, 44, "#2a3346", 0.22), h: [70, 150], w: [20, 30], metal: 0.85, rough: 0.16, color: "#a9bce0" },
    { tex: windowTex(51, 5, 10, "#a07a5c", 0.4), h: [10, 18], w: [12, 20], metal: 0.05, rough: 0.85, color: "#ffffff" },
  ];
  type Spot = { p: THREE.Vector3; yaw: number; w: number; d: number; h: number };
  const spots: Spot[][] = styles.map(() => []);
  const pick = (s: number) => {
    const st = styles[s];
    return { w: st.w[0] + rand() * (st.w[1] - st.w[0]), h: st.h[0] + rand() * (st.h[1] - st.h[0]) };
  };
  const step = hi ? 0.0045 : 0.0075;
  for (let t = 0; t < 0.965; t += step) {
    for (const side of [-1, 1]) {
      const canal = side < 0 && t < CANAL_END + 0.01;
      for (let row = 0; row < (hi ? 3 : 2); row++) {
        if (rand() < 0.12) continue;
        const dist = (canal ? 50 : 32) + row * 38 + rand() * 12;
        const dt = zoneDowntown(t);
        const r = rand();
        let s: number;
        if (t < 0.18) s = r < 0.6 ? 3 : 0;  // Paris: low, warm
        else if (row === 0) s = r < 0.45 ? 3 : r < 0.8 ? 0 : 1;
        else s = r < 0.25 + dt * 0.45 ? 2 : r < 0.75 ? 1 : 0;
        const f = rf(t + (rand() - 0.5) * step * 0.6);
        const p = f.pos.clone().addScaledVector(f.right, side * dist); p.y = -0.05;
        if (!clear(p)) continue;
        const { w, h } = pick(s);
        spots[s].push({ p, yaw: Math.atan2(f.tan.x, f.tan.z), w, d: w * (0.8 + rand() * 0.5), h });
      }
    }
  }
  // far-shore skyline
  for (let k = 0; k < (hi ? 160 : 90); k++) {
    const x = (rand() - 0.5) * 900, z = SHORE_FAR - 30 - rand() * 600;
    if (Math.hypot(x - TOWER.x, z - TOWER.z) < 45) continue;
    const s = rand() < 0.55 ? 2 : 1, { w, h } = pick(s);
    spots[s].push({ p: new THREE.Vector3(x, -0.05, z), yaw: 0, w, d: w, h: h * (1 - Math.abs(x) / 900) });
  }
  // near-shore skyline beside the bay
  for (let k = 0; k < (hi ? 70 : 40); k++) {
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * (90 + rand() * 500), z = SHORE_NEAR + 20 + rand() * 120;
    const s = rand() < 0.5 ? 2 : 1, { w, h } = pick(s);
    spots[s].push({ p: new THREE.Vector3(x, -0.05, z), yaw: 0, w, d: w, h });
  }
  styles.forEach((st, si) => {
    const list = spots[si];
    const mat = new THREE.MeshStandardMaterial({ map: st.tex.map, emissiveMap: st.tex.emis, emissive: new THREE.Color("#ffb070"), emissiveIntensity: 1.3, metalness: st.metal, roughness: st.rough, color: st.color, envMapIntensity: 1.1 });
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    list.forEach((sp, i) => { q.setFromEuler(new THREE.Euler(0, sp.yaw, 0)); m.compose(sp.p, q, new THREE.Vector3(sp.w, sp.h, sp.d)); mesh.setMatrixAt(i, m); });
    scene.add(mesh);
  });

  // ================================================================ landmarks at the start: lattice tower + Ferris wheel
  const landmarkGroup = new THREE.Group();
  scene.add(landmarkGroup);
  {
    const bronze = new THREE.MeshStandardMaterial({ color: "#4a3a2e", metalness: 0.7, roughness: 0.45 });
    const lattice = new THREE.MeshBasicMaterial({ color: "#2a1e18", wireframe: true, transparent: true, opacity: 0.6 });
    const base = towerSpot.clone();
    const tower = new THREE.Group();
    const legGeo = new THREE.CylinderGeometry(1.2, 3.2, 46, 4, 6);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const leg = new THREE.Mesh(legGeo, bronze);
      leg.position.set(sx * 8, 21, sz * 8); leg.rotation.set(-sz * 0.3, 0, sx * 0.3); tower.add(leg);
      const lw = new THREE.Mesh(legGeo, lattice); lw.position.copy(leg.position); lw.rotation.copy(leg.rotation); lw.scale.setScalar(1.15); tower.add(lw);
    }
    const plat1 = new THREE.Mesh(new THREE.BoxGeometry(19, 1.6, 19), bronze); plat1.position.y = 40; tower.add(plat1);
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 6.5, 44, 4, 8), bronze); mid.position.y = 63; mid.rotation.y = Math.PI / 4; tower.add(mid);
    const midW = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 7.2, 44, 4, 10), lattice); midW.position.copy(mid.position); midW.rotation.copy(mid.rotation); tower.add(midW);
    const plat2 = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 8), bronze); plat2.position.y = 85; tower.add(plat2);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.3, 30, 4, 6), bronze); top.position.y = 100; top.rotation.y = Math.PI / 4; tower.add(top);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 8, 6), bronze); spire.position.y = 119; tower.add(spire);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3, 1.5), toneMapped: false })); beacon.position.y = 123; tower.add(beacon);
    tower.position.copy(base);
    landmarkGroup.add(tower);
  }
  const wheel = new THREE.Group();
  {
    const steel = new THREE.MeshStandardMaterial({ color: "#d9d4cc", metalness: 0.6, roughness: 0.35 });
    const f = rf(0.11); const base = wheelSpot.clone();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(15, 0.35, 8, 64), steel);
    const rim2 = rim.clone(); rim2.position.z = 2.5; rim.position.z = -2.5;
    wheel.add(rim, rim2);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, 15, 0.15), steel);
      spoke.position.set(Math.cos(a) * 7.5, Math.sin(a) * 7.5, 0); spoke.rotation.z = a - Math.PI / 2; wheel.add(spoke);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 2.4), new THREE.MeshStandardMaterial({ color: k % 2 ? "#e4572e" : "#f2c14e", emissive: new THREE.Color(k % 2 ? "#e4572e" : "#f2c14e"), emissiveIntensity: 0.4 }));
      cab.position.set(Math.cos(a) * 15, Math.sin(a) * 15 - 1.3, 0); cab.userData.a = a; wheel.add(cab);
    }
    const holder = new THREE.Group();
    holder.position.copy(base).add(new THREE.Vector3(0, 18, 0));
    holder.lookAt(f.pos.clone().setY(18));
    holder.rotateY(Math.PI / 2);
    holder.add(wheel);
    for (const sz of [-3.5, 3.5]) for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 20, 0.6), steel);
      leg.position.set(sx * 5, -9, sz); leg.rotation.z = sx * 0.28; holder.add(leg);
    }
    landmarkGroup.add(holder);
  }

  // ================================================================ lamps, trees, pedestrians
  const lampPoints: { p: THREE.Vector3; yaw: number }[] = [];
  for (let t = 0.004; t < 0.97; t += 22 / ROAD_LEN) {
    const f = rf(t);
    for (const side of [-1, 1]) {
      const p = f.pos.clone().addScaledVector(f.right, side * 8.2); p.y = 0.18;
      lampPoints.push({ p, yaw: Math.atan2(f.tan.x, f.tan.z) + (side > 0 ? Math.PI / 2 : -Math.PI / 2) });
    }
  }
  {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 6, 6); poleGeo.translate(0, 3, 0);
    const armGeo = new THREE.BoxGeometry(1.4, 0.1, 0.1); armGeo.translate(-0.6, 6, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: "#1d1c22", metalness: 0.6, roughness: 0.4 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 1.3), toneMapped: false });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPoints.length);
    const arms = new THREE.InstancedMesh(armGeo, poleMat, lampPoints.length);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8), bulbMat, lampPoints.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    lampPoints.forEach((it, i) => {
      q.setFromEuler(new THREE.Euler(0, it.yaw, 0)); m.compose(it.p, q, one); poles.setMatrixAt(i, m); arms.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(-1.25, 5.85, 0).applyQuaternion(q).add(it.p), q, one); bulbs.setMatrixAt(i, m);
    });
    scene.add(poles, arms, bulbs);

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 2.6, 6); trunkGeo.translate(0, 1.3, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1.9, 1); crownGeo.translate(0, 3.9, 0);
    const trees: THREE.Matrix4[] = [];
    for (let t = 0.01; t < 0.96; t += 11 / ROAD_LEN) {
      const dense = t < 0.2 || (t > 0.4 && t < 0.5) || t > 0.86;
      if (!dense && rand() < 0.7) continue;
      const f = rf(t + 5.5 / ROAD_LEN);
      for (const side of [-1, 1]) {
        if (side < 0 && t < CANAL_END) { // trees along the canal quay
          const p = f.pos.clone().addScaledVector(f.right, -11.2); p.y = 0.18;
          trees.push(new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
          continue;
        }
        const p = f.pos.clone().addScaledVector(f.right, side * (10.3 + rand() * 0.6)); p.y = 0.18;
        const sc = 0.8 + rand() * 0.5;
        trees.push(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), new THREE.Vector3(sc, sc, sc)));
      }
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: "#3a2a20", roughness: 1 }), trees.length);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: "#5b7a3a", roughness: 0.9, flatShading: true }), trees.length);
    const tint = new THREE.Color();
    trees.forEach((tm, i) => { trunks.setMatrixAt(i, tm); crowns.setMatrixAt(i, tm); crowns.setColorAt(i, tint.setHSL(0.18 + rand() * 0.1, 0.45, 0.32 + rand() * 0.1)); });
    scene.add(trunks, crowns);
  }
  // pedestrians walking on the sidewalks
  const PEOPLE = hi ? 140 : 70;
  const peopleData = Array.from({ length: PEOPLE }, () => ({ t: 0.02 + rand() * 0.93, side: rand() < 0.5 ? -1 : 1, off: 8.8 + rand() * 2.6, speed: (rand() < 0.5 ? -1 : 1) * (0.9 + rand() * 0.6), ph: rand() * 6 }));
  const peopleMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), PEOPLE);
  {
    const tint = new THREE.Color();
    for (let i = 0; i < PEOPLE; i++) peopleMesh.setColorAt(i, tint.setHSL(rand(), 0.35, 0.25 + rand() * 0.35));
    peopleMesh.frustumCulled = false;
    scene.add(peopleMesh);
  }

  // ================================================================ billboards along the road
  const placeFacing = (obj: THREE.Object3D, t: number) => {
    const from = rf(t - 0.03).pos; from.y = obj.position.y; obj.lookAt(from);
  };
  const poleMat = new THREE.MeshStandardMaterial({ color: "#222026", metalness: 0.7, roughness: 0.4 });
  for (const b of opts.billboards ?? []) {
    const t = Math.min(0.95, roadT(b.stop) + 0.03);
    const f = rf(t);
    const grp = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: glowTitle(b.title, b.sub), toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
    const back = new THREE.Mesh(new THREE.BoxGeometry(16.6, 6.6, 0.4), new THREE.MeshStandardMaterial({ color: "#16141a", metalness: 0.6, roughness: 0.5 }));
    back.position.z = -0.25; grp.add(face, back);
    if (b.gantry) {
      for (const x of [-9, 9]) { const pole = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12, 0.6), poleMat); pole.position.set(x, -6, -0.3); grp.add(pole); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(19, 0.6, 0.6), poleMat); beam.position.set(0, -3.3, -0.3); grp.add(beam);
      grp.position.copy(f.pos).addScaledVector(UP, 11.5);
    } else {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 12, 8), poleMat); pole.position.set(0, -9, -0.3); grp.add(pole);
      grp.position.copy(f.pos).addScaledVector(f.right, (b.side ?? 1) * 17).addScaledVector(UP, 15);
    }
    placeFacing(grp, t);
    scene.add(grp);
  }

  // ================================================================ billboard plaza (experience)
  const screenTex = (title: string, sub: string | undefined, hue: number, big: boolean) =>
    canvasTex(big ? 1024 : 768, big ? 640 : 480, (g) => {
      const W = big ? 1024 : 768, H = big ? 640 : 480;
      const grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, `hsl(${hue},80%,${big ? 18 : 30}%)`); grd.addColorStop(1, `hsl(${(hue + 40) % 360},85%,${big ? 8 : 14}%)`);
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) { g.fillStyle = `hsla(${hue + i * 7},90%,60%,0.05)`; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 30 + Math.random() * 120, 0, 7); g.fill(); }
      g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "top";
      if (big) {
        g.fillStyle = `hsl(${hue},100%,70%)`; g.font = `700 34px "Space Grotesk", Arial, sans-serif`; g.fillText("EXPERIENCE", 60, 56);
        g.fillStyle = "#fff"; g.font = `900 110px Anton, Impact, sans-serif`; wrapText(g, title.toUpperCase(), 60, 120, 900, 118, 3);
        if (sub) { g.font = `500 40px "Space Grotesk", Arial, sans-serif`; g.fillStyle = "rgba(255,255,255,0.85)"; wrapText(g, sub, 60, 480, 900, 50, 3); }
      } else {
        g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = `hsl(${hue},100%,60%)`; g.shadowBlur = 30;
        let s = 120; g.font = `900 ${s}px Anton, Impact, sans-serif`; while (g.measureText(title).width > 680 && s > 40) { s -= 6; g.font = `900 ${s}px Anton, Impact, sans-serif`; }
        g.fillText(title.toUpperCase(), W / 2, sub ? H / 2 - 30 : H / 2);
        if (sub) { g.shadowBlur = 0; g.font = `600 34px "Space Grotesk", Arial, sans-serif`; g.fillStyle = "rgba(255,255,255,0.85)"; g.fillText(sub, W / 2, H / 2 + 70); }
      }
    });
  if (opts.plaza) {
    const t0 = roadT(opts.plaza.stop);
    const screens = opts.plaza.screens;
    let bigIdx = 0, smallIdx = 0;
    screens.forEach((s, k) => {
      const big = !!s.big;
      const side = big ? (bigIdx++ % 2 === 0 ? 1 : -1) : (smallIdx++ % 2 === 0 ? -1 : 1);
      const n = big ? bigIdx - 1 : smallIdx - 1;
      const t = t0 + (big ? 0.012 + n * 0.006 : -0.004 + n * 0.0055);
      const f = rf(t);
      const w = big ? 22 : 13, h = big ? 13.75 : 8.1;
      const y = big ? 16 : 9 + (k % 3) * 10.5;
      const grp = new THREE.Group();
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: screenTex(s.title, s.sub, (k * 67 + 190) % 360, big), toneMapped: false, color: new THREE.Color(1.35, 1.35, 1.35) }));
      const frameBox = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, h + 0.8, 0.6), poleMat); frameBox.position.z = -0.35;
      grp.add(face, frameBox);
      grp.position.copy(f.pos).addScaledVector(f.right, side * (big ? 23 : 22)).addScaledVector(UP, y);
      // angle the screen towards the approaching rider
      const target = rf(t - 0.02).pos; target.y = y;
      grp.lookAt(target);
      scene.add(grp);
    });
  }

  // ================================================================ floating skill panels (holographic)
  const panelTex = (title: string, items: string[]) => canvasTex(512, 820, (g) => {
    g.fillStyle = "rgba(8,26,52,0.62)"; g.fillRect(0, 0, 512, 820);
    g.strokeStyle = "rgba(120,220,255,0.9)"; g.lineWidth = 4; g.strokeRect(6, 6, 500, 808);
    g.fillStyle = "rgba(120,220,255,0.18)"; g.fillRect(6, 6, 500, 110);
    g.fillStyle = "#8fe8ff"; g.font = `600 24px "Space Grotesk", Arial, sans-serif`; g.fillText("SKILLS", 34, 50);
    g.fillStyle = "#ffffff"; g.font = `900 52px Anton, Impact, sans-serif`; g.fillText(title.toUpperCase(), 34, 100);
    g.font = `500 34px "Space Grotesk", Arial, sans-serif`;
    items.slice(0, 13).forEach((it, i) => {
      g.fillStyle = "rgba(120,220,255,0.9)"; g.fillRect(34, 162 + i * 50, 10, 10);
      g.fillStyle = "#eaf8ff"; g.fillText(it, 58, 176 + i * 50);
    });
  });
  const floaters: THREE.Object3D[] = [];
  (opts.skillPanels ?? []).forEach((sp, k) => {
    const t = roadT(sp.stop) + 0.01 + k * 0.011;
    const f = rf(t);
    const mat = new THREE.MeshBasicMaterial({ map: panelTex(sp.title, sp.items), transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false, color: new THREE.Color(1.3, 1.3, 1.3) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 9), mat);
    const side = k % 2 === 0 ? 1 : -1;
    mesh.position.copy(f.pos).addScaledVector(f.right, side * 9.5).addScaledVector(UP, 6.2);
    const target = rf(t - 0.025).pos; target.y = 6.2;
    mesh.lookAt(target);
    mesh.rotateY(-side * 0.25);
    mesh.userData.base = mesh.position.y; mesh.userData.ph = k;
    floaters.push(mesh);
    scene.add(mesh);
  });

  // ================================================================ rider + bike
  const bike = new THREE.Group();
  const lean = new THREE.Group(); bike.add(lean);
  const paint = new THREE.MeshPhysicalMaterial({ color: "#e4572e", metalness: 0.6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const black = new THREE.MeshStandardMaterial({ color: "#121216", roughness: 0.6, metalness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: "#dcdcdc", roughness: 0.15, metalness: 1 });
  const tire = new THREE.MeshStandardMaterial({ color: "#0b0b0d", roughness: 0.9 });
  const jacket = new THREE.MeshStandardMaterial({ color: "#20232b", roughness: 0.7 });
  const denim = new THREE.MeshStandardMaterial({ color: "#2b3a55", roughness: 0.85 });
  const helmetMat = new THREE.MeshPhysicalMaterial({ color: "#0e0e12", metalness: 0.3, roughness: 0.2, clearcoat: 1 });
  const visorMat = new THREE.MeshStandardMaterial({ color: "#ff9a4d", metalness: 1, roughness: 0.05 });
  const wheels: THREE.Object3D[] = [];
  const mkWheel = (z: number) => {
    const w = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.12, 12, 28), tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 8, 24), chrome);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 16), chrome); disc.rotation.z = Math.PI / 2;
    for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), black); sp.rotation.x = (i / 5) * Math.PI; w.add(sp); }
    tr.rotation.y = rim.rotation.y = Math.PI / 2;
    w.add(tr, rim, disc); w.position.set(0, 0.48, z); lean.add(w); wheels.push(w);
  };
  mkWheel(0.78); mkWheel(-0.78);
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; parent.add(m); return m;
  };
  box(lean, 0.22, 0.32, 1.1, black, 0, 0.72, 0.0, 0.08);
  box(lean, 0.34, 0.3, 0.42, chrome, 0, 0.6, 0.12);
  box(lean, 0.42, 0.26, 0.55, paint, 0, 1.0, 0.28, -0.12);
  box(lean, 0.32, 0.1, 0.62, black, 0, 0.98, -0.32, 0.05);
  box(lean, 0.3, 0.12, 0.5, paint, 0, 0.92, -0.75, -0.25);
  box(lean, 0.06, 0.6, 0.06, chrome, 0, 0.82, 0.68, -0.45);
  box(lean, 0.7, 0.05, 0.05, black, 0, 1.18, 0.55);
  box(lean, 0.34, 0.28, 0.2, paint, 0, 1.1, 0.72, -0.3);
  const headlight = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.5, 4.5), toneMapped: false }));
  headlight.position.set(0, 1.08, 0.83); lean.add(headlight);
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 10), chrome);
  exhaust.rotation.x = Math.PI / 2 - 0.2; exhaust.position.set(0.2, 0.55, -0.5); lean.add(exhaust);
  const mkRider = (seated: boolean) => {
    const r = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 12), jacket);
    torso.position.set(0, 1.42, -0.12); torso.rotation.x = seated ? 0.15 : 0.5; r.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), helmetMat); head.position.set(0, 1.83, seated ? -0.02 : 0.1); r.add(head);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.172, 20, 12, -0.9, 1.8, 1.1, 0.7), visorMat); visor.position.copy(head.position); r.add(visor);
    const limb = (rad: number, len: number, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 4, 8), mat);
      m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); r.add(m);
    };
    for (const s of [-1, 1]) {
      limb(0.065, 0.42, jacket, new THREE.Vector3(s * 0.2, 1.6, 0.02), new THREE.Vector3(s * 0.3, 1.2, 0.5));
      limb(0.085, 0.36, denim, new THREE.Vector3(s * 0.13, 1.12, -0.28), new THREE.Vector3(s * 0.22, 0.98, 0.15));
      limb(0.075, 0.34, denim, new THREE.Vector3(s * 0.22, 0.98, 0.15), new THREE.Vector3(s * 0.24, 0.5, -0.02));
    }
    return r;
  };
  const bikeRider = mkRider(false);
  lean.add(bikeRider);
  const riderLight = new THREE.PointLight("#ffd8a8", 6, 14, 2); riderLight.position.set(0, 1.3, 2.2); bike.add(riderLight);
  bike.scale.setScalar(1.35);
  scene.add(bike);

  // ================================================================ speedboat
  const boat = new THREE.Group();
  const boatBody = new THREE.Group(); boat.add(boatBody);
  {
    const shape = new THREE.Shape();
    shape.moveTo(0, 3.2); shape.quadraticCurveTo(1.25, 1.8, 1.25, -0.4); shape.lineTo(1.15, -2.4); shape.lineTo(-1.15, -2.4); shape.lineTo(-1.25, -0.4); shape.quadraticCurveTo(-1.25, 1.8, 0, 3.2);
    const ext = (depth: number) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 }); g.rotateX(Math.PI / 2); return g; };
    const red = new THREE.MeshPhysicalMaterial({ color: "#c8261e", roughness: 0.3, clearcoat: 1 });
    const white = new THREE.MeshPhysicalMaterial({ color: "#f3f1ec", roughness: 0.3, clearcoat: 1 });
    const woodDeck = new THREE.MeshStandardMaterial({ color: "#8a5a35", roughness: 0.6 });
    const lower = new THREE.Mesh(ext(0.55), red); lower.position.y = 0.45; boatBody.add(lower);
    const upper = new THREE.Mesh(ext(0.35), white); upper.position.y = 0.85; boatBody.add(upper);
    const deck = new THREE.Mesh(new THREE.ShapeGeometry(shape), woodDeck); deck.rotation.x = -Math.PI / 2; deck.position.y = 0.87; deck.scale.setScalar(0.92); boatBody.add(deck);
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.6), new THREE.MeshPhysicalMaterial({ color: "#9fd8ff", transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.2 }));
    shield.position.set(0, 1.2, 0.9); shield.rotation.x = -0.5; boatBody.add(shield);
    for (const x of [-0.5, 0.5]) box(boatBody, 0.7, 0.5, 0.7, new THREE.MeshStandardMaterial({ color: "#3fb6c9", roughness: 0.6 }), x, 1.05, -0.4);
    const seatedRider = mkRider(true); seatedRider.position.set(0.5, -0.35, -0.4); seatedRider.scale.setScalar(0.95); seatedRider.name = "boatRider"; boatBody.add(seatedRider);
  }
  const wakeMat = new THREE.MeshBasicMaterial({
    map: canvasTex(256, 512, (g) => {
      g.clearRect(0, 0, 256, 512);
      for (let i = 0; i < 1400; i++) {
        const y = Math.random() * 512, spread = 20 + (y / 512) * 110;
        const edge = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) * spread * (0.8 + Math.random() * 0.25) : (Math.random() - 0.5) * spread * 0.6;
        g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.4 * (1 - y / 600)})`;
        g.beginPath(); g.arc(128 + edge, y, 1 + Math.random() * 3, 0, 7); g.fill();
      }
    }),
    transparent: true, depthWrite: false, opacity: 0,
  });
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(8, 24), wakeMat);
  wake.rotation.x = -Math.PI / 2; wake.position.set(0, 0.06, -14);
  boat.add(wake);
  boat.scale.setScalar(1.3);
  scene.add(boat);

  // ================================================================ project barges with billboard screens
  const projectTex = (k: number, pr: NonNullable<RideSceneOptions["projects"]>[number]) => canvasTex(1024, 720, (g) => {
    g.fillStyle = "#0d1016"; g.fillRect(0, 0, 1024, 720);
    g.fillStyle = "#e8ff6a"; g.fillRect(0, 0, 1024, 8);
    g.fillStyle = "rgba(255,255,255,0.55)"; g.font = `500 26px "Space Grotesk", Arial, sans-serif`;
    g.fillText(`PROJECT ${String(k + 1).padStart(2, "0")}`, 56, 70); g.textAlign = "right"; g.fillText(pr.kind.toUpperCase(), 968, 70); g.textAlign = "left";
    g.fillStyle = "#ffffff"; g.font = `900 92px Anton, Impact, sans-serif`; wrapText(g, pr.title.toUpperCase(), 56, 180, 912, 96, 2);
    g.fillStyle = "rgba(255,255,255,0.82)"; g.font = `400 34px "Space Grotesk", Arial, sans-serif`; wrapText(g, pr.blurb, 56, 400, 912, 46, 4);
    let x = 56;
    g.font = `600 26px "Space Grotesk", Arial, sans-serif`;
    for (const tag of pr.tags) {
      const w = g.measureText(tag).width + 40;
      g.strokeStyle = "#e8ff6a"; g.lineWidth = 2; g.beginPath(); g.roundRect(x, 610, w, 52, 26); g.stroke();
      g.fillStyle = "#e8ff6a"; g.fillText(tag, x + 20, 645); x += w + 14;
    }
  });
  const barges: THREE.Group[] = [];
  (opts.projects ?? []).forEach((pr, k) => {
    const s = clamp01(boatS(pr.stop) + 0.05);
    const f = wf(s);
    const side = k % 2 === 0 ? 1 : -1;
    const grp = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(18, 2, 8), new THREE.MeshStandardMaterial({ color: "#8c2f1e", roughness: 0.7 }));
    hull.position.y = 0.6; grp.add(hull);
    for (let i = 0; i < 7; i++) {
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 8, 16), tire);
      tyre.position.set(-7.5 + i * 2.5, 0.8, 4.1); grp.add(tyre);
    }
    const steel = new THREE.MeshStandardMaterial({ color: "#3a3d44", metalness: 0.8, roughness: 0.35 });
    for (const x of [-7.2, 7.2]) for (const z of [-1.5, 1.5]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.35, 17, 0.35), steel); col.position.set(x, 9.6, z); grp.add(col); }
    for (let y = 3; y <= 17; y += 3.5) { const beam = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.25, 0.25), steel); beam.position.set(0, y, -1.5); grp.add(beam); }
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 9.56), new THREE.MeshBasicMaterial({ map: projectTex(k, pr), toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) }));
    screen.position.set(0, 10.4, 1.7); grp.add(screen);
    const spot = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.4, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6), toneMapped: false }));
    spot.position.set(0, 15.5, 1.9); grp.add(spot);
    grp.position.copy(f.pos).addScaledVector(f.right, side * 22);
    const look = wf(Math.max(0, s - 0.06)).pos; look.y = 0;
    grp.lookAt(look);
    grp.userData.base = 0; grp.userData.ph = k;
    barges.push(grp);
    scene.add(grp);
  });

  // ================================================================ bay extras: suspension bridge, lighthouse, sailboats
  {
    const s = 0.9; const f = wf(s);
    const across = f.right.clone();
    const mid = f.pos.clone();
    const steel = new THREE.MeshStandardMaterial({ color: "#8a7a6a", metalness: 0.5, roughness: 0.5 });
    const deckLen = 900;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(deckLen, 2, 14), steel);
    deck.position.copy(mid).setY(22);
    deck.rotation.y = Math.atan2(-across.z, across.x);
    scene.add(deck);
    const cableMat = new THREE.LineBasicMaterial({ color: "#d9cbb8" });
    const towerX = [-70, 70];
    for (const tx of towerX) {
      const base = mid.clone().addScaledVector(across, tx);
      for (const off of [-6, 6]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 64, 3), steel);
        leg.position.copy(base).addScaledVector(f.tan, off).setY(32);
        scene.add(leg);
      }
      const arch = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 15), steel);
      arch.position.copy(base).setY(56); arch.rotation.y = deck.rotation.y; scene.add(arch);
    }
    for (const off of [-6, 6]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 80; i++) {
        const x = -220 + (i / 80) * 440;
        const ax = Math.abs(x);
        const y = ax <= 70 ? 62 - 38 * (1 - (x / 70) ** 2) : 62 - (ax - 70) * 0.28;
        pts.push(mid.clone().addScaledVector(across, x).addScaledVector(f.tan, off).setY(Math.max(23, y)));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
      const hangers: THREE.Vector3[] = [];
      for (let i = 2; i < 80; i += 2) { hangers.push(pts[i], pts[i].clone().setY(23)); }
      scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hangers), cableMat));
    }
    // lighthouse on a small island
    const island = new THREE.Mesh(new THREE.CylinderGeometry(16, 20, 3, 24), new THREE.MeshStandardMaterial({ color: "#6d6250", roughness: 1 }));
    island.position.set(-230, 0.2, -1560); scene.add(island);
    const lh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 26, 16), new THREE.MeshStandardMaterial({ color: "#f2efe8" }));
    lh.position.set(-230, 14, -1560); scene.add(lh);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 4, 16), new THREE.MeshStandardMaterial({ color: "#c8261e" }));
    band.position.set(-230, 12, -1560); scene.add(band);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5, 3), toneMapped: false }));
    lamp.position.set(-230, 28.5, -1560); lamp.name = "lighthouseLamp"; scene.add(lamp);
  }
  const sailboats: THREE.Group[] = [];
  for (let k = 0; k < (hi ? 10 : 6); k++) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 6), new THREE.MeshStandardMaterial({ color: "#f3f1ec" }));
    hull.position.y = 0.4; g.add(hull);
    const sailShape = new THREE.Shape(); sailShape.moveTo(0, 0); sailShape.lineTo(0, 9); sailShape.lineTo(3.6, 0); sailShape.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshStandardMaterial({ color: "#fffaf0", side: THREE.DoubleSide }));
    sail.position.set(0, 1, -1); sail.rotation.y = Math.PI / 2; g.add(sail);
    const side = rand() < 0.5 ? -1 : 1;
    g.position.set(side * (80 + rand() * 300), 0, SHORE_NEAR - 120 - rand() * 1100);
    g.rotation.y = rand() * 6;
    g.userData.ph = rand() * 6;
    sailboats.push(g); scene.add(g);
  }

  // ================================================================ the glass tower, clouds, education cards
  const towerGroup = new THREE.Group();
  towerGroup.position.copy(TOWER);
  scene.add(towerGroup);
  {
    const st = styles[2];
    const mat = new THREE.MeshStandardMaterial({ map: st.tex.map, emissiveMap: st.tex.emis, emissive: new THREE.Color("#ffd0a0"), emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.12, color: "#b9cdf2", envMapIntensity: 1.3 });
    st.tex.map.wrapT = THREE.RepeatWrapping;
    const body = new THREE.Mesh(new THREE.BoxGeometry(26, TOWER_H, 26), mat); body.position.y = TOWER_H / 2; towerGroup.add(body);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(18, 14, 18), mat); crown.position.y = TOWER_H + 7; towerGroup.add(crown);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.9, 30, 8), chrome); mast.position.y = TOWER_H + 29; towerGroup.add(mast);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 1, 0.8), toneMapped: false })); tip.position.y = TOWER_H + 45; towerGroup.add(tip);
  }
  const CLOUD_Y = 100;
  const cloudTex = canvasTex(256, 256, (g) => {
    for (let i = 0; i < 26; i++) {
      const x = 50 + Math.random() * 156, y = 90 + Math.random() * 90, r = 30 + Math.random() * 55;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(255,255,255,0.55)"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  const cloudMats: THREE.SpriteMaterial[] = [];
  for (let k = 0; k < (hi ? 170 : 90); k++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0, color: new THREE.Color(1, 1, 1) });
    cloudMats.push(m);
    const sp = new THREE.Sprite(m);
    const a = rand() * Math.PI * 2, r = 30 + Math.pow(rand(), 0.7) * 900;
    sp.position.set(TOWER.x + Math.cos(a) * r, CLOUD_Y + (rand() - 0.5) * 16, TOWER.z + Math.sin(a) * r);
    const sc = 60 + rand() * 120; sp.scale.set(sc, sc * 0.55, 1);
    scene.add(sp);
  }
  const eduTex = (title: string, sub: string) => canvasTex(768, 420, (g) => {
    g.fillStyle = "rgba(255,255,255,0.86)"; g.beginPath(); g.roundRect(0, 0, 768, 420, 36); g.fill();
    g.fillStyle = "#e4572e"; g.font = `600 30px "Space Grotesk", Arial, sans-serif`; g.fillText("EDUCATION", 48, 80);
    g.fillStyle = "#1a1114"; g.font = `900 72px Anton, Impact, sans-serif`; wrapText(g, title.toUpperCase(), 48, 170, 680, 78, 2);
    g.fillStyle = "#4a3a3a"; g.font = `500 34px "Space Grotesk", Arial, sans-serif`; wrapText(g, sub, 48, 330, 680, 42, 2);
  });
  const eduCards: THREE.Mesh[] = [];
  (opts.eduCards ?? []).forEach((c, k, all) => {
    const m = new THREE.MeshBasicMaterial({ map: eduTex(c.title, c.sub), transparent: true, toneMapped: false, side: THREE.DoubleSide, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.65), m);
    const a = -0.56 + (k - (all.length - 1) / 2) * 0.62;
    mesh.position.set(TOWER.x + Math.cos(a) * 25, 126 + k * 6, TOWER.z - Math.sin(a) * 25);
    mesh.lookAt(TOWER.x + Math.cos(a) * 120, mesh.position.y, TOWER.z - Math.sin(a) * 120);
    mesh.userData.base = mesh.position.y; mesh.userData.ph = k;
    eduCards.push(mesh); scene.add(mesh);
  });

  // ================================================================ traffic
  type Car = { obj: THREE.Group; t: number; lane: number; speed: number };
  const cars: Car[] = [];
  {
    const palette = ["#d8d4cc", "#2c3e50", "#8e1b1b", "#1d1d22", "#f2c14e", "#4a6b8a", "#f2c14e"];
    for (let i = 0; i < (hi ? 30 : 16); i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2), new THREE.MeshPhysicalMaterial({ color: palette[i % palette.length], metalness: 0.7, roughness: 0.3, clearcoat: 1 }));
      body.position.y = 0.65;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: "#111318", metalness: 0.9, roughness: 0.1 }));
      cab.position.set(0, 1.25, -0.2); g.add(body, cab);
      const hl = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.6, 3.8), toneMapped: false });
      const tl = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.25, 0.15), toneMapped: false });
      for (const x of [-0.7, 0.7]) { box(g, 0.35, 0.14, 0.05, hl, x, 0.75, 2.11); box(g, 0.35, 0.14, 0.05, tl, x, 0.8, -2.11); }
      scene.add(g);
      const oncoming = i % 3 !== 0;
      cars.push({ obj: g, t: 0.03 + rand() * 0.9, lane: oncoming ? -3.4 : 3.4, speed: (oncoming ? -1 : 1) * (0.0035 + rand() * 0.0025) });
    }
  }

  // ================================================================ post
  let composer: EffectComposer | null = null, bloom: UnrealBloomPass | null = null;
  if (hi) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.6, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ================================================================ camera shots
  type Shot = { u: number; back: number; up: number; side: number; ahead: number; lift: number; fov: number };
  const roadShots: Shot[] = [
    { u: 0.0, back: 8, up: 2.2, side: -7.5, ahead: 45, lift: 6, fov: 50 },
    { u: 0.22, back: 8.5, up: 2.6, side: 2.2, ahead: 14, lift: 1.6, fov: 52 },
    { u: 0.48, back: 11, up: 3.4, side: 0, ahead: 30, lift: 10, fov: 58 },
    { u: 0.74, back: 7.5, up: 2.2, side: -3.4, ahead: 16, lift: 4, fov: 54 },
    { u: 0.9, back: 14, up: 10, side: 0, ahead: 50, lift: 0, fov: 54 },
    { u: 1.0, back: 46, up: 64, side: 0, ahead: 170, lift: 0, fov: 56 },
  ];
  const boatShots: Shot[] = [
    { u: 0.0, back: 46, up: 64, side: 0, ahead: 170, lift: 0, fov: 56 },
    { u: 0.1, back: 15, up: 4.5, side: 3, ahead: 40, lift: 3, fov: 54 },
    { u: 0.5, back: 14, up: 4, side: -3, ahead: 40, lift: 4, fov: 54 },
    { u: 0.8, back: 15, up: 4.2, side: 3, ahead: 40, lift: 6, fov: 54 },
    { u: 0.9, back: 13, up: 2.5, side: 0, ahead: 45, lift: 22, fov: 58 },
    { u: 1.0, back: 18, up: 6, side: 0, ahead: 70, lift: 60, fov: 60 },
  ];
  const shotAt = (shots: Shot[], u: number) => {
    let i = 0; while (i < shots.length - 2 && u > shots[i + 1].u) i++;
    const a = shots[i], b = shots[i + 1], k = smooth(a.u, b.u, u);
    const L = (x: number, y: number) => x + (y - x) * k;
    return { back: L(a.back, b.back), up: L(a.up, b.up), side: L(a.side, b.side), ahead: L(a.ahead, b.ahead), lift: L(a.lift, b.lift), fov: L(a.fov, b.fov) };
  };
  const chase = (f: { pos: THREE.Vector3; tan: THREE.Vector3; right: THREE.Vector3 }, curve: THREE.Curve<THREE.Vector3>, len: number, t: number, lane: number, s: ReturnType<typeof shotAt>, portrait: boolean, px: number) => {
    const pos = f.pos.clone().addScaledVector(f.right, lane + s.side * (portrait ? 0.35 : 1) + px * 0.8).addScaledVector(f.tan, -s.back * (portrait ? 1.35 : 1)).addScaledVector(UP, s.up);
    const ta = t + s.ahead / len;
    const lf = frame(curve, ta);
    const look = lf.pos.clone().addScaledVector(lf.right, lane * 0.6).addScaledVector(UP, s.lift);
    if (ta > 1) look.addScaledVector(lf.tan, (ta - 1) * len);
    return { pos, look, fov: s.fov };
  };

  // ================================================================ loop
  let target = 0, current = 0, prevRoad = roadT(0), prevBoat = 0;
  let pointerX = 0, pointerY = 0, px = 0, py = 0;
  let raf = 0, last = performance.now(), time = 0, lastLeg = -1;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let first = true, envTimer = 0;

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false); composer?.setSize(w, h); bloom?.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);
  const boatRider = boat.getObjectByName("boatRider")!;
  const lighthouseLamp = scene.getObjectByName("lighthouseLamp") as THREE.Mesh;

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; time += dt;
    const snap = (window as unknown as { __rideSnap?: boolean }).__rideSnap === true;
    current = snap ? target : current + (target - current) * (1 - Math.exp(-dt * 3.2));
    const p = current;
    const portrait = camera.aspect < 1;
    px += (pointerX - px) * dt * 2; py += (pointerY - py) * dt * 2;

    // palette + environment
    applyPal(palAt(p));
    skyU.time.value = time;
    envTimer += dt;
    if (envTimer > 0.4) { envTimer = 0; refreshEnv(p); }
    const overWater = smooth(0.46, 0.54, p);
    fog.far = (hi ? 760 : 520) + overWater * 1500;
    fog.near = 90 + overWater * 200;
    waterNormal.offset.set(time * 0.012, time * 0.02);

    // ---------------- bike
    const t = roadT(p);
    const f = rf(t);
    const vel = (t - prevRoad) * ROAD_LEN / Math.max(dt, 1e-3); prevRoad = t;
    const lane = 3.2;
    bike.position.copy(f.pos).addScaledVector(f.right, lane);
    bike.position.y += Math.sin(time * 18) * 0.004 * (1 + Math.abs(vel) * 0.05);
    const ah = rf(t + 0.004);
    bike.lookAt(ah.pos.clone().addScaledVector(ah.right, lane).setY(bike.position.y));
    const turn = f.tan.clone().cross(ah.tan).y;
    lean.rotation.z += ((-turn * 900 * Math.min(1, Math.abs(vel) / 20)) - lean.rotation.z) * Math.min(1, dt * 4);
    lean.rotation.z = Math.max(-0.45, Math.min(0.45, lean.rotation.z));
    wheels.forEach((w) => (w.rotation.x += (vel * dt) / 0.48));
    const onBoat = p > LEG.roadEnd;
    bikeRider.visible = !onBoat;
    riderLight.visible = !onBoat;

    // ---------------- boat
    const s = boatS(p);
    const bf = wf(s);
    const bvel = (s - prevBoat) * WATER_LEN / Math.max(dt, 1e-3); prevBoat = s;
    boat.position.copy(bf.pos); boat.position.y = 0.05 + Math.sin(time * 2.1) * 0.08;
    const ba = wf(s + 0.003);
    boat.lookAt(ba.pos.clone().setY(boat.position.y));
    boatBody.rotation.x = -Math.min(0.12, Math.abs(bvel) * 0.004) + Math.sin(time * 1.7) * 0.02;
    boatBody.rotation.z = Math.sin(time * 1.3) * 0.03;
    wakeMat.opacity = Math.min(0.9, Math.abs(bvel) * 0.05);
    boatRider.visible = onBoat;

    // ---------------- ambient animation
    wheel.rotation.z += dt * 0.08;
    wheel.children.forEach((c) => { if (c.userData.a !== undefined) c.rotation.z = -wheel.rotation.z; });
    for (const c of cars) {
      c.t = (c.t + c.speed * dt * 0.25 + 1) % 1;
      if (c.t > 0.965) c.t = c.speed > 0 ? 0.03 : 0.96;
      const cf = rf(c.t);
      c.obj.position.copy(cf.pos).addScaledVector(cf.right, c.lane);
      c.obj.lookAt(c.obj.position.clone().add(c.speed > 0 ? cf.tan : cf.tan.clone().negate()));
    }
    {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      peopleData.forEach((pd, i) => {
        pd.t += (pd.speed * dt) / ROAD_LEN;
        if (pd.t < 0.02) pd.t = 0.95; if (pd.t > 0.95) pd.t = 0.02;
        const pf = rf(pd.t);
        const pos = pf.pos.clone().addScaledVector(pf.right, pd.side * pd.off); pos.y = 0.18 + 0.78 + Math.abs(Math.sin(time * 6 + pd.ph)) * 0.06;
        q.setFromEuler(new THREE.Euler(0, Math.atan2(pf.tan.x, pf.tan.z) + (pd.speed > 0 ? 0 : Math.PI), Math.sin(time * 6 + pd.ph) * 0.05));
        m.compose(pos, q, new THREE.Vector3(1, 1, 1)); peopleMesh.setMatrixAt(i, m);
      });
      peopleMesh.instanceMatrix.needsUpdate = true;
    }
    floaters.forEach((o) => (o.position.y = o.userData.base + Math.sin(time * 1.1 + o.userData.ph) * 0.25));
    barges.forEach((b) => { b.position.y = Math.sin(time * 1.2 + b.userData.ph) * 0.15; b.rotation.z = Math.sin(time + b.userData.ph) * 0.01; });
    sailboats.forEach((b) => { b.position.y = Math.sin(time * 1.4 + b.userData.ph) * 0.12; b.rotation.z = Math.sin(time * 0.9 + b.userData.ph) * 0.05; });
    (lighthouseLamp.material as THREE.MeshBasicMaterial).color.setScalar(2 + 4 * Math.max(0, Math.sin(time * 2)));

    const sky01 = smooth(0.72, 0.8, p);
    cloudMats.forEach((m) => (m.opacity = 0.25 + 0.65 * sky01));
    eduCards.forEach((c) => {
      (c.material as THREE.MeshBasicMaterial).opacity = smooth(0.8, 0.86, p);
      c.position.y = c.userData.base + Math.sin(time * 0.9 + c.userData.ph) * 0.6;
    });

    // ---------------- camera
    let leg = 0, pos: THREE.Vector3, look: THREE.Vector3, fov: number;
    if (p <= LEG.roadEnd) {
      const sh = shotAt(roadShots, p / LEG.roadEnd);
      ({ pos, look, fov } = chase(f, road, ROAD_LEN, t, lane, sh, portrait, px));
    } else if (p <= LEG.boatEnd) {
      leg = 1;
      const sh = shotAt(boatShots, s);
      ({ pos, look, fov } = chase(bf, water, WATER_LEN, s, 0, sh, portrait, px));
    } else {
      leg = 2;
      const u = smooth(LEG.boatEnd, LEG.climbEnd, p);
      const a = -Math.PI * 0.5 + 0.35 + u * 1.25;
      const R = (portrait ? 62 : 48) - u * 4;
      const h = 8 + (1 - (1 - u) * (1 - u)) * (TOWER_H - 2);
      pos = new THREE.Vector3(TOWER.x + Math.cos(a) * R, h, TOWER.z - Math.sin(a) * R);
      look = new THREE.Vector3(TOWER.x, h + 6 + u * 6, TOWER.z);
      fov = 58;
      // final: above the clouds, turn towards the sunset
      const fin = smooth(LEG.climbEnd - 0.02, 1, p);
      if (fin > 0) {
        const endPos = new THREE.Vector3(TOWER.x + 30, TOWER_H + 30, TOWER.z + 70);
        const endLook = new THREE.Vector3(TOWER.x - 40, TOWER_H + 10, TOWER.z - 600);
        pos.lerp(endPos, fin); look.lerp(endLook, fin); fov = 58 - fin * 6;
      }
    }
    pos.y += py * 1.2;
    if (first || leg !== lastLeg && Math.abs(leg - lastLeg) >= 1 && (leg === 2 || lastLeg === 2)) {
      camPos.copy(pos); camLook.copy(look); first = false; // hidden by the white flash
    }
    lastLeg = leg;
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    camPos.lerp(pos, k); camLook.lerp(look, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix(); }

    const sd = skyU.sunDir.value;
    sun.position.copy(camPos).addScaledVector(sd, 300); sun.target.position.copy(camPos);
    sky.position.copy(camPos);

    if (composer) composer.render(); else renderer.render(scene, camera);
  };
  tick();

  return {
    setProgress: (v) => { target = clamp01(v); },
    setPointer: (x, y) => { pointerX = x; pointerY = y; },
    dispose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      envRT?.dispose(); pmrem.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((mm) => {
          Object.values(mm).forEach((v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose());
          mm.dispose();
        });
      });
      composer?.dispose(); renderer.dispose();
    },
  };
}
