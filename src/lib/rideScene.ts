// Real-time "rider through a sunset city" scene.
// Framework-agnostic: createRideScene(canvas) -> { setProgress, dispose }.
// Scroll progress (0..1) moves the rider along the route; each portfolio
// section has a landmark placed at its stop.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export type RideSceneOptions = {
  billboards?: { stop: number; title: string; sub?: string; side?: 1 | -1; gantry?: boolean }[];
  quality?: "high" | "low";
};

export type RideScene = {
  setProgress: (p: number) => void;
  setPointer: (x: number, y: number) => void;
  dispose: () => void;
};

const T0 = 0.02;
const T1 = 0.95;
const tOf = (p: number) => T0 + p * (T1 - T0);

// Bridge section of the route (around the "projects" stop)
const BRIDGE_A = 0.565;
const BRIDGE_B = 0.705;
const BRIDGE_H = 4.2;

const UP = new THREE.Vector3(0, 1, 0);

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Deterministic random so the city is the same every visit
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createRideScene(canvas: HTMLCanvasElement, opts: RideSceneOptions = {}): RideScene {
  const quality = opts.quality ?? "high";
  const rand = rng(7);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "high", powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 1.75 : 1.25));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color("#c9826b");
  scene.fog = new THREE.Fog(fogColor, 90, quality === "high" ? 720 : 480);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);

  // ---------------------------------------------------------------- route
  const ctrl: [number, number][] = [
    [0, 60], [0, -40], [12, -140], [-6, -240], [-34, -340], [-22, -440], [18, -540],
    [44, -640], [40, -740], [30, -840], [30, -940], [10, -1040], [-14, -1140],
    [-20, -1240], [-4, -1340], [16, -1440], [24, -1540],
  ];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
  const LEN = curve.getLength();

  const heightAt = (t: number) =>
    BRIDGE_H * smooth(BRIDGE_A - 0.018, BRIDGE_A + 0.006, t) * (1 - smooth(BRIDGE_B - 0.006, BRIDGE_B + 0.018, t));

  const frame = (t: number) => {
    const tc = Math.min(1, Math.max(0, t));
    const pos = curve.getPointAt(tc, new THREE.Vector3());
    const tan = curve.getTangentAt(tc, new THREE.Vector3()).normalize();
    const right = new THREE.Vector3().crossVectors(tan, UP).normalize();
    pos.y += heightAt(tc);
    return { pos, tan, right };
  };

  // ---------------------------------------------------------------- sky
  const sunDir = new THREE.Vector3(0.25, 0.07, -1).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: sunDir }, time: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir; uniform vec3 sunDir; uniform float time;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 zenith = vec3(0.10,0.15,0.30);
        vec3 mid    = vec3(0.70,0.40,0.42);
        vec3 horizon= vec3(1.00,0.62,0.36);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        col = mix(col, zenith, smoothstep(0.15, 0.7, h));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0,0.55,0.25) * pow(s, 6.0) * 0.55;
        col += vec3(1.0,0.80,0.55) * pow(s, 60.0) * 0.8;
        col += vec3(1.0,0.92,0.75) * smoothstep(0.9993, 0.9997, s) * 3.0;
        // clouds
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.6;
          float c = fbm(uv + vec2(time*0.004, 0.0));
          c = smoothstep(0.52, 0.85, c) * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.35, 0.8, h));
          vec3 cloudCol = mix(vec3(0.95,0.55,0.45), vec3(1.0,0.82,0.6), pow(s, 3.0));
          col = mix(col, cloudCol, c * 0.75);
        }
        col = mix(col, vec3(0.36,0.25,0.24), smoothstep(0.0, -0.08, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  // environment reflections from the sky
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
  const envRT = pmrem.fromScene(envScene, 0.02);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.9;

  // ---------------------------------------------------------------- lights
  scene.add(new THREE.HemisphereLight("#9fb4ff", "#5a3a2c", 0.55));
  const sun = new THREE.DirectionalLight("#ffc08a", 2.6);
  sun.position.copy(sunDir).multiplyScalar(-1).multiplyScalar(-200);
  scene.add(sun, sun.target);

  // ---------------------------------------------------------------- textures
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d")!);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = 4;
    return tx;
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

  const windowTex = (seed: number, cols: number, rows: number, wall: string, litP: number) => {
    const r = rng(seed);
    const map = canvasTex(256, 512, (g) => {
      g.fillStyle = wall; g.fillRect(0, 0, 256, 512);
      const cw = 256 / cols, rh = 512 / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const lit = r() < litP;
        g.fillStyle = lit ? `hsl(${32 + r() * 14},90%,${62 + r() * 18}%)` : `rgba(40,55,80,${0.75 + r() * 0.2})`;
        g.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.22, cw * 0.64, rh * 0.56);
      }
    });
    const r2 = rng(seed);
    const emis = canvasTex(256, 512, (g) => {
      g.fillStyle = "#000"; g.fillRect(0, 0, 256, 512);
      const cw = 256 / cols, rh = 512 / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const lit = r2() < litP; r2(); r2();
        if (lit) { g.fillStyle = "#fff"; g.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.22, cw * 0.64, rh * 0.56); }
      }
    });
    return { map, emis };
  };

  // ---------------------------------------------------------------- road + sidewalks
  const ribbon = (t0: number, t1: number, l0: number, l1: number, y: number, segs: number, uScale: number, vLen: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = t0 + (t1 - t0) * (i / segs);
      const f = frame(t);
      const a = f.pos.clone().addScaledVector(f.right, l0); a.y += y;
      const b = f.pos.clone().addScaledVector(f.right, l1); b.y += y;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const v = (t * LEN) / vLen;
      uv.push(0, v, uScale, v);
      if (i < segs) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };

  const SEGS = quality === "high" ? 1400 : 800;
  const road = new THREE.Mesh(ribbon(0, 1, -7, 7, 0.02, SEGS, 1, 14), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.82, metalness: 0.05 }));
  scene.add(road);
  const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9 });
  const walkSegs: [number, number][] = [[0, BRIDGE_A - 0.02], [BRIDGE_B + 0.02, 1]];
  for (const [a, b] of walkSegs) {
    scene.add(new THREE.Mesh(ribbon(a, b, 7, 12, 0.18, SEGS / 2, 2, 5), walkMat));
    scene.add(new THREE.Mesh(ribbon(a, b, -12, -7, 0.18, SEGS / 2, 2, 5), walkMat));
  }
  // bridge deck sides + parapets
  const stoneMat = new THREE.MeshStandardMaterial({ color: "#b58a6a", roughness: 0.85 });
  scene.add(new THREE.Mesh(ribbon(BRIDGE_A - 0.03, BRIDGE_B + 0.03, 7, 8.2, 1.0, 300, 1, 4), stoneMat));
  scene.add(new THREE.Mesh(ribbon(BRIDGE_A - 0.03, BRIDGE_B + 0.03, -8.2, -7, 1.0, 300, 1, 4), stoneMat));

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: "#3a2f2b", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, -800);
  scene.add(ground);

  // water under the bridge
  const mid = frame((BRIDGE_A + BRIDGE_B) / 2);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(520, (BRIDGE_B - BRIDGE_A) * LEN * 0.92, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#3b4a63", roughness: 0.06, metalness: 0.95 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.rotation.z = -Math.atan2(mid.tan.x, -mid.tan.z);
  water.position.set(mid.pos.x, 0.03, mid.pos.z);
  scene.add(water);

  // arches + piers
  {
    const span = 9;
    const n = Math.floor(((BRIDGE_B - BRIDGE_A) * LEN) / span);
    const archGeo = new THREE.TorusGeometry(span / 2 - 0.6, 0.55, 8, 20, Math.PI);
    const pierGeo = new THREE.BoxGeometry(1.4, 1, 14.5);
    const arches = new THREE.InstancedMesh(archGeo, stoneMat, n * 2);
    const piers = new THREE.InstancedMesh(pierGeo, stoneMat, n + 1);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    let ai = 0;
    for (let i = 0; i <= n; i++) {
      const t = BRIDGE_A + (i / n) * (BRIDGE_B - BRIDGE_A);
      const f = frame(t);
      const yaw = Math.atan2(f.tan.x, f.tan.z);
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      const h = f.pos.y;
      m.compose(new THREE.Vector3(f.pos.x, h / 2 - 0.2, f.pos.z), q, new THREE.Vector3(1, Math.max(0.5, h + 0.4), 1));
      piers.setMatrixAt(i, m);
      if (i < n) {
        const fm = frame(t + (0.5 / n) * (BRIDGE_B - BRIDGE_A));
        const yaw2 = Math.atan2(fm.tan.x, fm.tan.z) + Math.PI / 2;
        const qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw2, 0));
        for (const side of [-6.8, 6.8]) {
          const p = fm.pos.clone().addScaledVector(fm.right, side);
          p.y = fm.pos.y - (span / 2 - 0.6) - 0.15;
          if (p.y + span / 2 > 0.5) { m.compose(p, qa, s); arches.setMatrixAt(ai++, m); }
        }
      }
    }
    arches.count = ai;
    scene.add(arches, piers);
  }

  // ---------------------------------------------------------------- buildings
  const inBridge = (t: number) => t > BRIDGE_A - 0.035 && t < BRIDGE_B + 0.035;
  const styles = [
    { tex: windowTex(11, 6, 18, "#6b5348", 0.32), h: [14, 30], w: [14, 24], metal: 0.15, rough: 0.7, color: "#ffffff", rep: 1 },
    { tex: windowTex(23, 8, 30, "#3e4656", 0.26), h: [32, 70], w: [16, 26], metal: 0.55, rough: 0.35, color: "#c9d6ff", rep: 1 },
    { tex: windowTex(37, 10, 44, "#2a3346", 0.22), h: [70, 140], w: [20, 30], metal: 0.85, rough: 0.18, color: "#a9bce0", rep: 1 },
    { tex: windowTex(51, 5, 10, "#a07a5c", 0.4), h: [8, 16], w: [12, 20], metal: 0.05, rough: 0.85, color: "#ffffff", rep: 1 },
  ];
  type Spot = { t: number; side: number; dist: number };
  const spots: Spot[][] = styles.map(() => []);
  const step = quality === "high" ? 0.0042 : 0.007;
  for (let t = 0.0; t < 1.0; t += step) {
    if (inBridge(t)) continue;
    for (const side of [-1, 1]) {
      for (let row = 0; row < (quality === "high" ? 3 : 2); row++) {
        if (rand() < 0.12) continue;
        const dist = 32 + row * 38 + rand() * 12;
        // the "about" boulevard stays low-rise and leafy, downtown is tall
        const downtown = smooth(0.24, 0.32, t) * (1 - smooth(0.52, 0.56, t)) + smooth(0.74, 0.8, t);
        const r = rand();
        let s = 0;
        if (row === 0) s = r < 0.5 ? 3 : r < 0.85 ? 0 : 1;
        else s = r < 0.3 + downtown * 0.4 ? 2 : r < 0.75 ? 1 : 0;
        if (t < 0.24 && s === 2 && row === 0) s = 0;
        spots[s].push({ t: t + (rand() - 0.5) * step * 0.6, side, dist });
      }
    }
  }
  styles.forEach((st, si) => {
    const list = spots[si];
    const mat = new THREE.MeshStandardMaterial({
      map: st.tex.map, emissiveMap: st.tex.emis, emissive: new THREE.Color("#ffb070"), emissiveIntensity: 1.6,
      metalness: st.metal, roughness: st.rough, color: st.color, envMapIntensity: 1.1,
    });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    list.forEach((sp, i) => {
      const f = frame(sp.t);
      const p = f.pos.clone().addScaledVector(f.right, sp.side * sp.dist);
      p.y = -0.05;
      const w = st.w[0] + rand() * (st.w[1] - st.w[0]);
      const h = st.h[0] + rand() * (st.h[1] - st.h[0]);
      q.setFromEuler(new THREE.Euler(0, Math.atan2(f.tan.x, f.tan.z), 0));
      m.compose(p, q, new THREE.Vector3(w, h, w * (0.8 + rand() * 0.5)));
      mesh.setMatrixAt(i, m);
    });
    scene.add(mesh);
  });

  // ---------------------------------------------------------------- lamps + trees
  {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 6, 6); poleGeo.translate(0, 3, 0);
    const armGeo = new THREE.BoxGeometry(1.4, 0.1, 0.1); armGeo.translate(-0.6, 6, 0);
    const bulbGeo = new THREE.SphereGeometry(0.28, 10, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: "#1d1c22", metalness: 0.6, roughness: 0.4 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 1.3), toneMapped: false });
    const items: { p: THREE.Vector3; yaw: number }[] = [];
    const every = 22 / LEN;
    for (let t = 0.004; t < 1; t += every) {
      const f = frame(t);
      const onBridge = t > BRIDGE_A && t < BRIDGE_B;
      for (const side of [-1, 1]) {
        const p = f.pos.clone().addScaledVector(f.right, side * (onBridge ? 7.6 : 8.2));
        p.y = onBridge ? f.pos.y + 1 : 0.18;
        const yaw = Math.atan2(f.tan.x, f.tan.z) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
        items.push({ p, yaw });
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, items.length);
    const arms = new THREE.InstancedMesh(armGeo, poleMat, items.length);
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    items.forEach((it, i) => {
      q.setFromEuler(new THREE.Euler(0, it.yaw, 0));
      m.compose(it.p, q, one); poles.setMatrixAt(i, m); arms.setMatrixAt(i, m);
      const off = new THREE.Vector3(-1.25, 5.85, 0).applyQuaternion(q).add(it.p);
      m.compose(off, q, one); bulbs.setMatrixAt(i, m);
    });
    scene.add(poles, arms, bulbs);

    // trees
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 2.6, 6); trunkGeo.translate(0, 1.3, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1.9, 1); crownGeo.translate(0, 3.9, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#3a2a20", roughness: 1 });
    const crownMat = new THREE.MeshStandardMaterial({ color: "#5b7a3a", roughness: 0.9, flatShading: true });
    const trees: THREE.Matrix4[] = [];
    for (let t = 0.01; t < 1; t += 11 / LEN) {
      if (inBridge(t)) continue;
      const dense = t < 0.27 || (t > 0.42 && t < 0.52) || t > 0.86;
      if (!dense && rand() < 0.75) continue;
      const f = frame(t + 5.5 / LEN);
      for (const side of [-1, 1]) {
        const p = f.pos.clone().addScaledVector(f.right, side * (10.3 + rand() * 0.6)); p.y = 0.18;
        const sc = 0.8 + rand() * 0.5;
        trees.push(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), new THREE.Vector3(sc, sc, sc)));
      }
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, trees.length);
    const tint = new THREE.Color();
    trees.forEach((tm, i) => {
      trunks.setMatrixAt(i, tm); crowns.setMatrixAt(i, tm);
      crowns.setColorAt(i, tint.setHSL(0.18 + rand() * 0.1, 0.45, 0.32 + rand() * 0.1));
    });
    scene.add(trunks, crowns);
  }

  // ---------------------------------------------------------------- landmark tower (education stop)
  {
    const tTower = tOf(0.83) + 0.02;
    const f = frame(tTower);
    const base = f.pos.clone().addScaledVector(f.right, -58); base.y = 0;
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: "#3b3036", metalness: 0.8, roughness: 0.35 });
    const tiers = [[9, 6.5, 40], [6.5, 4, 40], [4, 2, 36], [2, 0.6, 30]] as const;
    let y = 0;
    tiers.forEach(([r0, r1, h], i) => {
      const geo = new THREE.CylinderGeometry(r1, r0, h, 8, 1, false);
      const mesh = new THREE.Mesh(geo, steel); mesh.position.y = y + h / 2; g.add(mesh);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r1 + 0.4, 0.25, 6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.8, 0.9), toneMapped: false }));
      ring.rotation.x = Math.PI / 2; ring.position.y = y + h; g.add(ring);
      y += h + (i === 0 ? 2 : 0);
    });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 1.2, 0.8), toneMapped: false }));
    beacon.position.y = y + 1; g.add(beacon);
    g.position.copy(base);
    scene.add(g);
  }

  // ---------------------------------------------------------------- billboards
  const glowText = (title: string, sub?: string) =>
    canvasTex(1024, 384, (g) => {
      const grd = g.createLinearGradient(0, 0, 1024, 384);
      grd.addColorStop(0, "#120d18"); grd.addColorStop(1, "#24121a");
      g.fillStyle = grd; g.fillRect(0, 0, 1024, 384);
      g.strokeStyle = "#ff9a4d"; g.lineWidth = 10; g.strokeRect(14, 14, 996, 356);
      g.fillStyle = "#fff4e6"; g.textAlign = "center"; g.textBaseline = "middle";
      g.shadowColor = "#ff8a3d"; g.shadowBlur = 28;
      let size = 150;
      g.font = `900 ${size}px Anton, Impact, "Arial Black", sans-serif`;
      while (g.measureText(title).width > 920 && size > 50) { size -= 6; g.font = `900 ${size}px Anton, Impact, "Arial Black", sans-serif`; }
      g.fillText(title, 512, sub ? 160 : 192);
      if (sub) { g.shadowBlur = 10; g.fillStyle = "#ffb27a"; g.font = `600 46px "Space Grotesk", Arial, sans-serif`; g.fillText(sub, 512, 300); }
    });

  const boards: THREE.Object3D[] = [];
  for (const b of opts.billboards ?? []) {
    const t = Math.min(0.985, tOf(b.stop) + 0.026);
    const f = frame(t);
    const grp = new THREE.Group();
    const tex = glowText(b.title, b.sub);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
    const back = new THREE.Mesh(new THREE.BoxGeometry(16.6, 6.6, 0.4), new THREE.MeshStandardMaterial({ color: "#16141a", metalness: 0.6, roughness: 0.5 }));
    back.position.z = -0.25;
    grp.add(face, back);
    const poleMat = new THREE.MeshStandardMaterial({ color: "#222026", metalness: 0.7, roughness: 0.4 });
    if (b.gantry) {
      // spans the road
      for (const x of [-9, 9]) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12, 0.6), poleMat);
        pole.position.set(x, -6 + 0.0, -0.3); grp.add(pole);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(19, 0.6, 0.6), poleMat); beam.position.set(0, -3.3, -0.3); grp.add(beam);
      grp.position.copy(f.pos).addScaledVector(UP, 11.5);
    } else {
      const side = b.side ?? 1;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 12, 8), poleMat);
      pole.position.set(0, -9, -0.3); grp.add(pole);
      grp.position.copy(f.pos).addScaledVector(f.right, side * 17).addScaledVector(UP, 15);
    }
    const lookFrom = frame(t - 0.03).pos; lookFrom.y = grp.position.y;
    grp.lookAt(lookFrom);
    scene.add(grp);
    boards.push(grp);
  }

  // ---------------------------------------------------------------- rider + bike
  const bike = new THREE.Group();
  const lean = new THREE.Group();
  bike.add(lean);
  const paint = new THREE.MeshPhysicalMaterial({ color: "#e4572e", metalness: 0.6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const black = new THREE.MeshStandardMaterial({ color: "#121216", roughness: 0.6, metalness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: "#dcdcdc", roughness: 0.15, metalness: 1 });
  const tire = new THREE.MeshStandardMaterial({ color: "#0b0b0d", roughness: 0.9 });
  const jacket = new THREE.MeshStandardMaterial({ color: "#20232b", roughness: 0.7 });
  const denim = new THREE.MeshStandardMaterial({ color: "#2b3a55", roughness: 0.85 });

  const wheels: THREE.Object3D[] = [];
  const mkWheel = (z: number) => {
    const w = new THREE.Group();
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.12, 12, 28), tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 8, 24), chrome);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 16), chrome); disc.rotation.z = Math.PI / 2;
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), black);
      sp.rotation.x = (i / 5) * Math.PI; w.add(sp);
    }
    t.rotation.y = rim.rotation.y = Math.PI / 2;
    w.add(t, rim, disc);
    w.position.set(0, 0.48, z);
    lean.add(w); wheels.push(w);
  };
  mkWheel(0.78); mkWheel(-0.78);
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; lean.add(m); return m;
  };
  box(0.22, 0.32, 1.1, black, 0, 0.72, 0.0, 0.08);          // frame / engine
  box(0.34, 0.3, 0.42, chrome, 0, 0.6, 0.12);               // engine block
  const tank = box(0.42, 0.26, 0.55, paint, 0, 1.0, 0.28, -0.12);
  tank.scale.set(1, 1, 1);
  box(0.32, 0.1, 0.62, black, 0, 0.98, -0.32, 0.05);        // seat
  box(0.3, 0.12, 0.5, paint, 0, 0.92, -0.75, -0.25);        // tail
  box(0.06, 0.6, 0.06, chrome, 0, 0.82, 0.68, -0.45);       // fork
  box(0.7, 0.05, 0.05, black, 0, 1.18, 0.55);               // handlebar
  box(0.34, 0.28, 0.2, paint, 0, 1.1, 0.72, -0.3);          // fairing
  const headlight = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.5, 4.5), toneMapped: false }));
  headlight.position.set(0, 1.08, 0.83); lean.add(headlight);
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2), toneMapped: false }));
  tail.position.set(0, 0.95, -1.01); tail.rotation.y = Math.PI; lean.add(tail);
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 10), chrome);
  exhaust.rotation.x = Math.PI / 2 - 0.2; exhaust.position.set(0.2, 0.55, -0.5); lean.add(exhaust);

  // rider
  const rider = new THREE.Group(); lean.add(rider);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 12), jacket);
  torso.position.set(0, 1.42, -0.12); torso.rotation.x = 0.5; rider.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), new THREE.MeshPhysicalMaterial({ color: "#0e0e12", metalness: 0.3, roughness: 0.2, clearcoat: 1 }));
  head.position.set(0, 1.83, 0.1); rider.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.172, 20, 12, -0.9, 1.8, 1.1, 0.7), new THREE.MeshStandardMaterial({ color: "#ff9a4d", metalness: 1, roughness: 0.05 }));
  visor.position.copy(head.position); rider.add(visor);
  const limb = (r: number, len: number, mat: THREE.Material, from: THREE.Vector3, to: THREE.Vector3) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
    m.position.copy(from).lerp(to, 0.5);
    m.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize());
    rider.add(m);
  };
  for (const s of [-1, 1]) {
    limb(0.065, 0.42, jacket, new THREE.Vector3(s * 0.2, 1.6, 0.02), new THREE.Vector3(s * 0.3, 1.2, 0.5));     // arm
    limb(0.085, 0.36, denim, new THREE.Vector3(s * 0.13, 1.12, -0.28), new THREE.Vector3(s * 0.22, 0.98, 0.15)); // thigh
    limb(0.075, 0.34, denim, new THREE.Vector3(s * 0.22, 0.98, 0.15), new THREE.Vector3(s * 0.24, 0.5, -0.02)); // shin
  }
  const riderLight = new THREE.PointLight("#ffd8a8", 6, 14, 2);
  riderLight.position.set(0, 1.3, 2.2);
  bike.add(riderLight);
  bike.scale.setScalar(1.35);
  scene.add(bike);

  // ---------------------------------------------------------------- traffic
  type Car = { obj: THREE.Group; t: number; lane: number; speed: number };
  const cars: Car[] = [];
  {
    const palette = ["#d8d4cc", "#2c3e50", "#8e1b1b", "#1d1d22", "#c47f2c", "#4a6b8a"];
    const n = quality === "high" ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2), new THREE.MeshPhysicalMaterial({ color: palette[i % palette.length], metalness: 0.7, roughness: 0.3, clearcoat: 1 }));
      body.position.y = 0.65;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: "#111318", metalness: 0.9, roughness: 0.1 }));
      cab.position.set(0, 1.25, -0.2);
      g.add(body, cab);
      const hl = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.6, 3.8), toneMapped: false });
      const tl = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.25, 0.15), toneMapped: false });
      for (const x of [-0.7, 0.7]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.05), hl); h.position.set(x, 0.75, 2.11); g.add(h);
        const tt = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.05), tl); tt.position.set(x, 0.8, -2.11); g.add(tt);
      }
      scene.add(g);
      const oncoming = i % 3 !== 0;
      cars.push({ obj: g, t: rand(), lane: oncoming ? -3.4 : 3.4, speed: (oncoming ? -1 : 1) * (0.0035 + rand() * 0.0025) });
    }
  }

  // ---------------------------------------------------------------- post
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (quality === "high") {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.6, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ---------------------------------------------------------------- camera rig
  // keyframes over progress p: back, up, side, ahead (look-at distance), fov
  const shots = [
    { p: 0.0, back: 8, up: 1.4, side: -4.6, ahead: 45, lift: 6.5, fov: 46 },
    { p: 0.07, back: 8.5, up: 2.8, side: 2.2, ahead: 14, lift: 1.4, fov: 52 },
    { p: 0.15, back: 7.5, up: 2.2, side: -3.2, ahead: 12, lift: 1.6, fov: 50 },
    { p: 0.32, back: 10, up: 3.8, side: 2.6, ahead: 26, lift: 4.5, fov: 52 },
    { p: 0.49, back: 7.5, up: 2.0, side: -3.0, ahead: 22, lift: 3.5, fov: 54 },
    { p: 0.6, back: 9, up: 2.6, side: 3.5, ahead: 14, lift: 1.6, fov: 50 },
    { p: 0.66, back: 4, up: 0.6, side: -15, ahead: 4, lift: 0.4, fov: 46 },
    { p: 0.74, back: 8.5, up: 2.6, side: 2.4, ahead: 16, lift: 2.0, fov: 52 },
    { p: 0.83, back: 9, up: 3.2, side: 4.5, ahead: 30, lift: 16, fov: 54 },
    { p: 0.93, back: 10, up: 4, side: -2.5, ahead: 22, lift: 3, fov: 52 },
    { p: 1.0, back: 26, up: 22, side: -12, ahead: 50, lift: 4, fov: 50 },
  ];
  const shotAt = (p: number) => {
    let i = 0;
    while (i < shots.length - 2 && p > shots[i + 1].p) i++;
    const a = shots[i], b = shots[i + 1];
    const k = smooth(a.p, b.p, p);
    const L = (x: number, y: number) => x + (y - x) * k;
    return { back: L(a.back, b.back), up: L(a.up, b.up), side: L(a.side, b.side), ahead: L(a.ahead, b.ahead), lift: L(a.lift, b.lift), fov: L(a.fov, b.fov) };
  };

  // ---------------------------------------------------------------- loop
  let target = 0, current = 0, prevT = tOf(0);
  let pointerX = 0, pointerY = 0, px = 0, py = 0;
  let raf = 0, last = performance.now(), time = 0;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let first = true;

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    bloom?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; time += dt;

    current += (target - current) * (1 - Math.exp(-dt * 3.2));
    const t = tOf(current);
    const f = frame(t);
    const vel = (t - prevT) * LEN / Math.max(dt, 1e-3);
    prevT = t;

    // bike placement
    const lane = 3.2;
    const pos = f.pos.clone().addScaledVector(f.right, lane);
    bike.position.copy(pos);
    bike.position.y += Math.sin(time * 18) * 0.004 * (1 + Math.abs(vel) * 0.05);
    const ahead = frame(t + 0.004);
    bike.lookAt(ahead.pos.clone().addScaledVector(ahead.right, lane).setY(bike.position.y + (ahead.pos.y - f.pos.y)));
    const turn = f.tan.clone().cross(ahead.tan).y;
    lean.rotation.z += ((-turn * 900 * Math.min(1, Math.abs(vel) / 20)) - lean.rotation.z) * Math.min(1, dt * 4);
    lean.rotation.z = Math.max(-0.45, Math.min(0.45, lean.rotation.z));
    wheels.forEach((w) => (w.rotation.x += (vel * dt) / 0.48));

    // traffic
    for (const c of cars) {
      c.t = (c.t + c.speed * dt * 0.25 + 1) % 1;
      const cf = frame(c.t);
      c.obj.position.copy(cf.pos).addScaledVector(cf.right, c.lane);
      const dir = c.speed > 0 ? cf.tan : cf.tan.clone().negate();
      c.obj.lookAt(c.obj.position.clone().add(dir));
    }

    // camera
    px += (pointerX - px) * dt * 2; py += (pointerY - py) * dt * 2;
    const s = shotAt(current);
    const portrait = camera.aspect < 1;
    const desired = f.pos.clone().addScaledVector(f.right, lane + s.side * (portrait ? 0.35 : 1) + px * 0.8)
      .addScaledVector(f.tan, -s.back * (portrait ? 1.35 : 1)).addScaledVector(UP, s.up + py * 0.4 + Math.sin(time * 0.6) * 0.06);
    const lookFrame = frame(t + s.ahead / LEN);
    const look = lookFrame.pos.clone().addScaledVector(lookFrame.right, lane * 0.6).addScaledVector(UP, s.lift);
    if (first) { camPos.copy(desired); camLook.copy(look); first = false; }
    const k = 1 - Math.exp(-dt * 5);
    camPos.lerp(desired, k); camLook.lerp(look, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (Math.abs(camera.fov - s.fov) > 0.01) { camera.fov += (s.fov - camera.fov) * k; camera.updateProjectionMatrix(); }

    sun.position.copy(camPos).addScaledVector(sunDir, 300);
    sun.target.position.copy(camPos);
    sky.position.copy(camPos);
    skyMat.uniforms.time.value = time;

    if (composer) composer.render(); else renderer.render(scene, camera);
  };
  tick();

  return {
    setProgress: (p) => { target = Math.min(1, Math.max(0, p)); },
    setPointer: (x, y) => { pointerX = x; pointerY = y; },
    dispose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      envRT.dispose(); pmrem.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((mm) => {
          Object.values(mm).forEach((v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose());
          mm.dispose();
        });
      });
      composer?.dispose();
      renderer.dispose();
    },
  };
}
