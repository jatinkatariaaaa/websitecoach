// 3D Studio — renders the glass / chrome images used on the website.
//
// Every asset is rendered twice (over a black and over a white backdrop) and
// the two frames are "difference-matted" into one PNG/WebP with real alpha,
// so glass stays see-through on any background.
//
// Open /studio/ while `node tools/server.js` is running. Click an asset to
// preview, or "Render all & save" to write files into website/assets/3d/.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const V2 = THREE.Vector2;
const V3 = THREE.Vector3;
const C = (hex) => new THREE.Color(hex);
const qs = new URLSearchParams(location.search);
const SS = Number(qs.get('ss') || 2); // supersampling factor

const statusEl = document.getElementById('status');
const gridEl = document.getElementById('grid');
const barEl = document.getElementById('bar');
const status = (t) => { statusEl.textContent = t; console.log('[studio]', t); };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ---------------------------------------------------------------------------
// Studio lighting: a neutral gradient dome with white soft boxes.
// ---------------------------------------------------------------------------
let ENV_SCENE = null;
function buildEnvironment() {
  const env = new THREE.Scene();
  const R = 50;
  const dome = new THREE.SphereGeometry(R, 64, 32);
  const top = C(0x000000).setRGB(0.52, 0.53, 0.55);
  const mid = C(0x000000).setRGB(0.055, 0.056, 0.06);
  const bot = C(0x000000).setRGB(0.009, 0.009, 0.01);
  const pos = dome.attributes.position;
  const cols = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / R;
    const c = y > 0 ? mid.clone().lerp(top, Math.pow(y, 0.9)) : mid.clone().lerp(bot, Math.pow(-y, 0.5));
    cols.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  const panel = (w, h, color, intensity, x, y, z) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: C(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(16, 3, 0xffffff, 6, 0, 18, 4); // overhead strip
  panel(4, 16, 0xffffff, 5, -20, 3, 7); // left tall softbox
  panel(3, 14, 0xffffff, 3.0, 20, 2, -5); // right strip
  panel(12, 5, 0xdfe6ee, 2.0, -7, 1, -20); // back cool panel
  panel(7, 2.4, 0xffffff, 4, 12, 7, 16); // front-right kicker
  panel(24, 7, 0x2a2c2f, 1.0, 0, -16, 0); // floor bounce
  ENV_SCENE = env;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const MAT = {
  glass(tint = 0xe6eaee, o = {}) {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.6, ior: 1.5,
      attenuationColor: C(tint), attenuationDistance: 0.9, specularIntensity: 1, specularColor: C(0xffffff),
      clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3, dispersion: 0.25, ...o,
    });
  },
  chrome(o = {}) {
    return new THREE.MeshPhysicalMaterial({ color: 0xf2f3f5, metalness: 1, roughness: 0.08, envMapIntensity: 1.35, ...o });
  },
  gunmetal(o = {}) {
    return new THREE.MeshPhysicalMaterial({ color: 0x8e939a, metalness: 1, roughness: 0.2, envMapIntensity: 1.2, ...o });
  },
  silver(o = {}) {
    return new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1, envMapIntensity: 1.55, ...o });
  },
  pearl(o = {}) {
    return new THREE.MeshPhysicalMaterial({
      color: 0xf3f4f6, metalness: 0.05, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.06,
      envMapIntensity: 1.0, emissive: C(0xffffff), emissiveIntensity: 0.05, ...o,
    });
  },
  dark(o = {}) {
    return new THREE.MeshPhysicalMaterial({
      color: 0x111214, metalness: 0.3, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1, ...o,
    });
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let FONT = null;
async function loadFont() {
  if (FONT) return FONT;
  status('Converting font for 3D text…');
  const json = await new TTFLoader().loadAsync('/fonts/segoeuib.ttf');
  FONT = new Font(json);
  return FONT;
}
function textGeo(str, size, depth, bevel = true) {
  const g = new TextGeometry(str, {
    font: FONT, size, depth, curveSegments: 12,
    bevelEnabled: bevel, bevelThickness: depth * 0.4, bevelSize: size * 0.022, bevelSegments: 4,
  });
  g.center();
  return g;
}
const lathe = (pts, seg = 128) => new THREE.LatheGeometry(pts.map(([x, y]) => new V2(Math.max(x, 0.0001), y)), seg);
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Faceted gem: rings of vertices with alternating angular offsets, zipped
// together into triangles so every facet catches light differently.
function gemGeometry() {
  const rings = [
    { y: 0.36, r: 0, n: 1, off: 0 },
    { y: 0.36, r: 0.55, n: 8, off: 0 },
    { y: 0.26, r: 0.76, n: 8, off: Math.PI / 8 },
    { y: 0.13, r: 0.93, n: 16, off: Math.PI / 16 },
    { y: 0.06, r: 1.0, n: 16, off: 0 },
    { y: -0.03, r: 1.0, n: 16, off: 0 },
    { y: -0.2, r: 0.86, n: 16, off: Math.PI / 16 },
    { y: -0.5, r: 0.5, n: 8, off: Math.PI / 8 },
    { y: -0.92, r: 0, n: 1, off: 0 },
  ];
  const pts = rings.map((R) => Array.from({ length: R.n }, (_, j) => {
    const a = R.off + (j * Math.PI * 2) / R.n;
    return new V3(Math.cos(a) * R.r, R.y, Math.sin(a) * R.r);
  }));
  const pos = [];
  const tri = (a, b, c) => {
    const n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
    const cen = new V3().add(a).add(b).add(c).divideScalar(3);
    if (n.dot(cen) < 0) [b, c] = [c, b];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  for (let k = 0; k < rings.length - 1; k++) {
    const A = pts[k], B = pts[k + 1], Ra = rings[k], Rb = rings[k + 1];
    if (A.length === 1) { B.forEach((b, j) => tri(A[0], b, B[(j + 1) % B.length])); continue; }
    if (B.length === 1) { A.forEach((a, i) => tri(a, A[(i + 1) % A.length], B[0])); continue; }
    const angA = (i) => Ra.off + (i * Math.PI * 2) / Ra.n;
    const angB = (j) => Rb.off + (j * Math.PI * 2) / Rb.n;
    let i = 0, j = 0;
    while (i < A.length || j < B.length) {
      const a = A[i % A.length], b = B[j % B.length];
      if (j >= B.length || (i < A.length && angA(i + 1) <= angB(j + 1))) { tri(a, A[(i + 1) % A.length], b); i++; }
      else { tri(a, B[(j + 1) % B.length], b); j++; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// High-contrast "jewellery box" lighting used only by the diamond.
function sparkleEnvironment() {
  const s = new THREE.Scene();
  // grey gradient dome so no facet ever goes pitch black
  const R = 40;
  const dome = new THREE.SphereGeometry(R, 48, 24);
  const cols = [];
  const p = dome.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / R;
    const v = 0.05 + 0.32 * Math.max(0, y) + 0.06 * Math.max(0, -y);
    cols.push(v * 0.92, v, v * 0.97);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  s.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const rnd = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  for (let k = 0; k < 140; k++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
    const dir = new V3(Math.sqrt(1 - u * u) * Math.cos(th), u, Math.sqrt(1 - u * u) * Math.sin(th));
    const col = k % 9 === 0 ? 0xfff1d6 : k % 6 === 0 ? 0xd6e4ff : 0xffffff;
    const size = 2 + rnd() * 6;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * (0.3 + rnd())),
      new THREE.MeshBasicMaterial({ color: C(col).multiplyScalar(0.6 + rnd() * 4), side: THREE.DoubleSide }));
    m.position.copy(dir.multiplyScalar(30));
    m.lookAt(0, 0, 0);
    s.add(m);
  }
  return s;
}

// Thin strip lights on a dark dome: flat glass reflects them as crisp lines
// instead of big white areas (keeps the stacked plates from blowing out).
let STRIP_ENV = null;
function stripEnvironment() {
  if (STRIP_ENV) return STRIP_ENV;
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ color: C(0x000000).setRGB(0.014, 0.014, 0.016), side: THREE.BackSide })));
  const strip = (len, wid, color, k, pos, rotZ) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wid, len), new THREE.MeshBasicMaterial({ color: C(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    m.rotateZ(rotZ);
    s.add(m);
  };
  strip(40, 0.9, 0xffffff, 3.2, [0, 22, 6], 0);
  strip(40, 0.6, 0xffffff, 2.4, [-22, 4, 8], 0.2);
  strip(40, 0.5, 0xffffff, 2.0, [20, -2, 10], -0.3);
  strip(40, 0.7, 0xffffff, 2.4, [18, 8, -10], 0.5);
  strip(40, 0.7, 0xdde6f0, 2.2, [-14, -6, -18], -0.4);
  strip(40, 0.4, 0xffffff, 1.6, [6, -20, 4], 1.2);
  strip(40, 0.5, 0xe8eef5, 1.8, [-6, 10, 22], 0.9);
  const pmrem = new THREE.PMREMGenerator(renderer);
  STRIP_ENV = pmrem.fromScene(s, 0.012).texture;
  pmrem.dispose();
  return STRIP_ENV;
}

// Swooping arc of elliptical glass plates (the hero sculpture).
// mode 'additive'  : faint tinted bodies + additive reflections (layers stack up)
// mode 'glass'     : physically based transmissive plates
function glassPlates({ mode = 'additive', N = 34, shine = 0.75 } = {}) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = THREE.MathUtils.degToRad(-40 + (160 * i) / 12);
    pts.push(new V3(-1.1 + Math.cos(a) * 3.5, -1.1 + Math.sin(a) * 3.5, Math.sin(a * 1.5) * 1.2));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const cool = C(0xaab3bd), white = C(0xf4f6f8);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const s = 0.5 + 0.8 * Math.pow(Math.sin(Math.PI * (0.05 + 0.9 * t)), 0.75);
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, 1.35 * s, 0.8 * s, 0, Math.PI * 2, false);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.03, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.045, bevelSegments: 6, curveSegments: 120,
    });
    geo.center();
    const tint = cool.clone().lerp(white, smooth(0.3, 1, t));
    const holder = new THREE.Group();
    if (mode === 'glass') {
      holder.add(new THREE.Mesh(geo, MAT.glass(tint.getHex(), { thickness: 0.15, attenuationDistance: 0.5, dispersion: 0.8, envMapIntensity: 1.5 })));
    } else {
      const env = stripEnvironment();
      holder.add(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
        color: tint, metalness: 0, roughness: 0.2, transparent: true, opacity: 0.14,
        depthWrite: false, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.6,
        emissive: tint, emissiveIntensity: 0.06,
      })));
      holder.add(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
        color: 0x000000, metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.03, envMap: env,
        specularIntensity: 1, specularColor: tint.clone().lerp(C(0xffffff), 0.6), envMapIntensity: shine,
        iridescence: 0.3, iridescenceIOR: 1.35, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      })));
    }
    holder.position.copy(curve.getPointAt(t));
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), curve.getTangentAt(t));
    const tw = new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), t * Math.PI * 1.15 + 0.25);
    holder.quaternion.copy(q).multiply(tw);
    g.add(holder);
  }
  g.rotation.set(0.28, -0.55, -0.12);
  return g;
}

// Dark page-coloured backdrop with a soft silver glow behind the sculpture (for opaque renders).
function heroBackdrop(cx, cy) {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1280;
  const x = cv.getContext('2d');
  x.fillStyle = '#070707';
  x.fillRect(0, 0, cv.width, cv.height);
  const glow = (gx, gy, r, stops) => {
    const gr = x.createRadialGradient(gx, gy, 0, gx, gy, r);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    x.fillStyle = gr;
    x.fillRect(0, 0, cv.width, cv.height);
  };
  glow(cx * cv.width, cy * cv.height, cv.width * 0.42, [[0, 'rgba(118,124,134,0.42)'], [0.45, 'rgba(52,55,60,0.3)'], [1, 'rgba(7,7,7,0)']]);
  glow((cx + 0.12) * cv.width, (cy - 0.3) * cv.height, cv.width * 0.25, [[0, 'rgba(255,255,255,0.07)'], [1, 'rgba(255,255,255,0)']]);
  // fade every edge back to the page colour so the image blends seamlessly
  const edge = (x0, y0, x1, y1) => {
    const gr = x.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(7,7,7,1)');
    gr.addColorStop(1, 'rgba(7,7,7,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, cv.width, cv.height);
  };
  edge(0, 0, 0, cv.height * 0.14);
  edge(0, cv.height, 0, cv.height * 0.84);
  edge(cv.width, 0, cv.width * 0.9, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function miniCandle(bull, h = 0.36) {
  const c = new THREE.Group();
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(0.17, h, 0.17, 4, 0.035),
    bull ? MAT.pearl({ roughness: 0.16 })
      : MAT.glass(0x50565e, { thickness: 0.3, attenuationDistance: 0.35 })
  );
  c.add(body);
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, h + 0.26, 16), MAT.chrome());
  c.add(wick);
  return c;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
const ASSETS = {
  helix: {
    label: 'Hero glass helix', w: 1400, h: 1400, fov: 28, cam: [0.2, 0.1, 15], async build() {
      const g = new THREE.Group();
      // A swooping arc: rings fan open on the outside of the curve, bunch up inside.
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const a = THREE.MathUtils.degToRad(-35 + (150 * i) / 12);
        pts.push(new V3(-1.2 + Math.cos(a) * 3.4, -1.0 + Math.sin(a) * 3.4, Math.sin(a * 1.6) * 1.1));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const N = 30;
      const cool = C(0xaab3bd), white = C(0xf4f6f8);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const s = 0.55 + 0.75 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * t)), 0.8);
        const shape = new THREE.Shape();
        shape.absellipse(0, 0, 1.3 * s, 0.78 * s, 0, Math.PI * 2, false);
        const hole = new THREE.Path();
        hole.absellipse(0, 0, 1.16 * s, 0.64 * s, 0, Math.PI * 2, true);
        shape.holes.push(hole);
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: 0.02, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 96,
        });
        geo.center();
        const tint = cool.clone().lerp(white, smooth(0.35, 1, t));
        const mesh = new THREE.Mesh(geo, MAT.glass(tint.getHex(), { thickness: 0.18, attenuationDistance: 0.6, dispersion: 0.6 }));
        mesh.position.copy(curve.getPointAt(t));
        const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), curve.getTangentAt(t));
        const tw = new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), t * Math.PI * 1.1 + 0.3);
        mesh.quaternion.copy(q).multiply(tw);
        g.add(mesh);
      }
      g.rotation.set(0.25, -0.5, -0.1);
      return g;
    },
  },

  coins: {
    label: 'Currency coins', w: 1300, h: 1100, fov: 30, cam: [0, 2.0, 10.5], look: [0, 0.25, 0], async build() {
      await loadFont();
      const g = new THREE.Group();
      const coinGeo = lathe([
        [0, -0.075], [0.8, -0.075], [0.84, -0.1], [0.86, -0.115], [0.97, -0.115], [1, -0.095],
        [1, 0.095], [0.97, 0.115], [0.86, 0.115], [0.84, 0.1], [0.8, 0.075], [0, 0.075],
      ], 160);
      const coin = (sym, mat) => {
        const c = new THREE.Group();
        c.add(new THREE.Mesh(coinGeo, mat));
        if (sym) {
          const s = new THREE.Mesh(textGeo(sym, 0.95, 0.05), mat);
          s.rotation.x = -Math.PI / 2;
          s.position.y = 0.1;
          c.add(s);
        }
        return c;
      };
      // a short stack
      for (let i = 0; i < 4; i++) {
        const c = coin(i === 3 ? '$' : null, i % 2 ? MAT.gunmetal() : MAT.chrome());
        c.position.set(-1.75 + i * 0.03, -1.35 + i * 0.235, 0.3 - i * 0.02);
        c.rotation.y = i * 0.5;
        g.add(c);
      }
      const add = (sym, mat, p, r, s = 1) => {
        const c = coin(sym, mat);
        c.position.set(...p); c.rotation.set(...r); c.scale.setScalar(s); g.add(c);
      };
      add('₹', MAT.chrome(), [0.15, 0.55, 0.8], [1.2, 0.0, -0.22], 1.2);
      add('€', MAT.silver(), [2.05, -0.35, -0.3], [0.95, 0.35, 0.5]);
      add('£', MAT.gunmetal(), [-1.25, 1.75, -1.3], [1.3, 0.2, -0.65], 0.85);
      add('¥', MAT.chrome(), [1.75, 1.95, -1.9], [1.05, -0.3, 0.4], 0.7);
      return g;
    },
  },

  candles: {
    label: 'Glass candlesticks', w: 1400, h: 1150, fov: 28, cam: [2.6, 1.6, 10], look: [0, 0.1, 0], async build() {
      const g = new THREE.Group();
      const data = [
        [0.2, 1.0, 1.3, -0.1], [1.0, 1.75, 2.0, 0.85], [1.75, 1.2, 1.95, 1.0], [1.2, 2.15, 2.4, 1.05],
        [2.15, 3.0, 3.25, 1.95], [3.0, 2.6, 3.15, 2.35], [2.6, 3.75, 4.05, 2.45],
      ];
      const sp = 0.8, w = 0.5;
      data.forEach(([o, c, h, l], i) => {
        const bull = c > o;
        const x = (i - (data.length - 1) / 2) * sp;
        const body = new THREE.Mesh(
          new RoundedBoxGeometry(w, Math.abs(c - o), w, 6, 0.08),
          bull ? MAT.pearl({ roughness: 0.14 })
            : MAT.glass(0x4a5058, { thickness: 0.7, attenuationDistance: 0.55 })
        );
        body.position.set(x, (o + c) / 2, 0);
        g.add(body);
        const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h - l, 24), MAT.chrome());
        wick.position.set(x, (h + l) / 2, 0);
        g.add(wick);
      });
      g.rotation.set(0.04, -0.42, 0);
      g.position.y = -1.95;
      return g;
    },
  },

  shield: {
    label: 'Risk shield', w: 1100, h: 1200, fov: 28, cam: [0, 0.2, 9.5], async build() {
      const g = new THREE.Group();
      const s = new THREE.Shape();
      s.moveTo(0, 1.3);
      s.bezierCurveTo(0.42, 1.08, 0.82, 1.02, 1.08, 1.04);
      s.lineTo(1.08, 0.18);
      s.bezierCurveTo(1.08, -0.6, 0.55, -1.08, 0, -1.34);
      s.bezierCurveTo(-0.55, -1.08, -1.08, -0.6, -1.08, 0.18);
      s.lineTo(-1.08, 1.04);
      s.bezierCurveTo(-0.82, 1.02, -0.42, 1.08, 0, 1.3);
      const glassGeo = new THREE.ExtrudeGeometry(s, {
        depth: 0.3, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.1, bevelSegments: 8, curveSegments: 48,
      });
      glassGeo.center();
      g.add(new THREE.Mesh(glassGeo, MAT.glass(0xe6eaee, { thickness: 1.0, attenuationDistance: 1.3 })));

      const pts = s.getPoints(80);
      const rim = new THREE.Shape(pts.map((p) => p.clone().multiplyScalar(1.13)));
      rim.holes.push(new THREE.Path(pts.map((p) => p.clone().multiplyScalar(1.02)).reverse()));
      const rimGeo = new THREE.ExtrudeGeometry(rim, {
        depth: 0.46, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 4, curveSegments: 48,
      });
      rimGeo.center();
      g.add(new THREE.Mesh(rimGeo, MAT.chrome()));

      const ck = new THREE.Shape();
      ck.moveTo(-0.52, 0.06); ck.lineTo(-0.16, -0.32); ck.lineTo(0.56, 0.46);
      ck.lineTo(0.42, 0.6); ck.lineTo(-0.16, -0.03); ck.lineTo(-0.38, 0.2); ck.closePath();
      const ckGeo = new THREE.ExtrudeGeometry(ck, {
        depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.045, bevelSegments: 5,
      });
      ckGeo.center();
      const check = new THREE.Mesh(ckGeo, MAT.pearl());
      check.position.set(0, 0.05, 0.36);
      g.add(check);
      g.rotation.set(0.06, -0.42, 0.02);
      return g;
    },
  },

  diamond: {
    label: '1-on-1 diamond', w: 1100, h: 1000, fov: 24, cam: [0, 2.2, 7.2], look: [0, -0.15, 0], async build() {
      const g = new THREE.Group();
      const sparkle = sparkleEnvironment();
      // core: sharp refraction of the sparkle lights -> brilliance
      const rt = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType });
      new THREE.CubeCamera(0.1, 200, rt).update(renderer, sparkle);
      rt.texture.mapping = THREE.CubeRefractionMapping;
      const core = new THREE.Mesh(gemGeometry(), new THREE.MeshBasicMaterial({ envMap: rt.texture, refractionRatio: 0.41, color: 0xf8f9fb }));
      core.scale.setScalar(0.965);
      g.add(core);
      // shell: reflections + dispersion
      const pmrem = new THREE.PMREMGenerator(renderer);
      const sparkleTex = pmrem.fromScene(sparkle, 0.004).texture;
      pmrem.dispose();
      g.add(new THREE.Mesh(gemGeometry(), MAT.glass(0xf6f7f9, {
        envMap: sparkleTex, envMapIntensity: 2.2, ior: 2.4, dispersion: 2.5, thickness: 1.4,
        attenuationDistance: 8, roughness: 0, clearcoat: 0, flatShading: true,
      })));
      g.rotation.set(0.12, 0.2, -0.16);
      g.scale.setScalar(1.25);
      return g;
    },
  },

  globe: {
    label: 'Forex globe', w: 1150, h: 1100, fov: 28, cam: [0, 0.8, 9.6], async build() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 96, 64), MAT.glass(0xe6eaee, { thickness: 2.4, attenuationDistance: 4.5 })));
      // four glowing "session" nodes on the surface: Sydney, Tokyo, London, New York
      for (const [lat, lon] of [[-0.6, 2.6], [0.62, 2.0], [0.9, -0.1], [0.71, -1.29]]) {
        const n = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 12), MAT.pearl({ emissiveIntensity: 0.9 }));
        n.position.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)).multiplyScalar(1.24);
        g.add(n);
      }
      const wire = MAT.chrome({ roughness: 0.14 });
      for (const lat of [-0.66, -0.34, 0, 0.34, 0.66]) {
        const r = 1.206 * Math.cos(Math.asin(lat));
        const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.011, 12, 180), wire);
        t.rotation.x = Math.PI / 2;
        t.position.y = 1.206 * lat;
        g.add(t);
      }
      for (let k = 0; k < 6; k++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(1.206, 0.011, 12, 180), wire);
        t.rotation.y = (k * Math.PI) / 6;
        g.add(t);
      }
      const orbit = new THREE.Group();
      orbit.add(new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.045, 24, 220), MAT.chrome()));
      for (let k = 0; k < 4; k++) {
        const a = k * (Math.PI / 2) + 0.6;
        const b = new THREE.Mesh(new THREE.SphereGeometry(k === 0 ? 0.13 : 0.085, 32, 16), k === 0 ? MAT.silver() : MAT.chrome());
        b.position.set(Math.cos(a) * 1.78, Math.sin(a) * 1.78, 0);
        orbit.add(b);
      }
      orbit.rotation.set(Math.PI / 2 - 0.42, 0.28, 0);
      g.add(orbit);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.018, 16, 220), MAT.silver());
      ring2.rotation.set(Math.PI / 2 + 0.55, -0.35, 0);
      g.add(ring2);
      g.rotation.z = 0.18;
      return g;
    },
  },

  king: {
    label: 'Strategy chess king', w: 900, h: 1300, fov: 26, cam: [0, 1.7, 10], look: [0, 1.1, 0], async build() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(lathe([
        [0, 0], [0.72, 0], [0.74, 0.04], [0.74, 0.1], [0.67, 0.14], [0.69, 0.2], [0.6, 0.26], [0.46, 0.31],
        [0.36, 0.43], [0.3, 0.6], [0.26, 0.95], [0.245, 1.24], [0.4, 1.29], [0.42, 1.35], [0.3, 1.41],
        [0.31, 1.5], [0.43, 1.77], [0.47, 1.83], [0.45, 1.9], [0.3, 1.96], [0, 1.97],
      ], 128), MAT.glass(0xe6eaee, { thickness: 1.3, attenuationDistance: 1.4 }));
      g.add(body);
      const v = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.5, 0.14, 4, 0.045), MAT.silver());
      v.position.y = 2.2;
      const h = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.13, 0.14, 4, 0.045), MAT.silver());
      h.position.y = 2.26;
      g.add(v, h);
      const base = new THREE.Mesh(lathe([[0, -0.12], [1.05, -0.12], [1.1, -0.08], [1.1, -0.02], [1.04, 0], [0, 0]], 128), MAT.chrome({ roughness: 0.12 }));
      g.add(base);
      g.rotation.y = 0.5;
      return g;
    },
  },

  target: {
    label: 'Phase target', w: 1200, h: 1100, fov: 28, cam: [0, 0.4, 10.5], async build() {
      const g = new THREE.Group();
      const board = new THREE.Group();
      const rings = [[1.6, 1.24, 'chrome'], [1.24, 0.9, 'glass'], [0.9, 0.56, 'chrome'], [0.56, 0.24, 'glass']];
      rings.forEach(([ro, ri, type], i) => {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, ro, 0, Math.PI * 2, false);
        const hole = new THREE.Path();
        hole.absarc(0, 0, ri, 0, Math.PI * 2, true);
        shape.holes.push(hole);
        const d = 0.18 + i * 0.05;
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: d, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 4, curveSegments: 160,
        });
        geo.translate(0, 0, -d / 2);
        board.add(new THREE.Mesh(geo, type === 'chrome' ? MAT.chrome() : MAT.glass(0xe6eaee, { thickness: 0.35 })));
      });
      const bull = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.42, 64), MAT.pearl());
      bull.rotation.x = Math.PI / 2;
      board.add(bull);
      board.rotation.set(-0.08, 0.5, 0);
      g.add(board);

      const arrow = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 2.7, 24), MAT.chrome());
      shaft.position.y = 1.35;
      arrow.add(shaft);
      const fin = new THREE.Shape();
      fin.moveTo(0, 0); fin.lineTo(0.3, 0.12); fin.lineTo(0.3, 0.62); fin.lineTo(0, 0.5); fin.closePath();
      const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
      for (let k = 0; k < 3; k++) {
        const f = new THREE.Mesh(finGeo, MAT.pearl());
        const holder = new THREE.Group();
        holder.add(f);
        f.position.set(0.03, 0, 0);
        holder.rotation.y = (k * Math.PI * 2) / 3;
        holder.position.y = 2.05;
        arrow.add(holder);
      }
      const nock = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 24), MAT.silver());
      nock.position.y = 2.72;
      arrow.add(nock);
      const dir = new V3(0.62, 0.42, 0.66).normalize();
      arrow.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
      arrow.position.set(0, 0, 0.12);
      g.add(arrow);
      g.position.set(-0.35, -0.35, 0);
      return g;
    },
  },

  card: {
    label: 'Funded account card', w: 1300, h: 1050, fov: 28, cam: [0, 0.4, 10], async build() {
      await loadFont();
      const g = new THREE.Group();
      const rr = roundedRect(3.4, 2.14, 0.2);
      const geo = new THREE.ExtrudeGeometry(rr, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 24 });
      geo.center();
      const back = new THREE.Mesh(geo, MAT.gunmetal({ roughness: 0.28 }));
      back.position.set(0.55, 0.42, -0.55);
      back.rotation.z = 0.08;
      g.add(back);
      const front = new THREE.Group();
      front.add(new THREE.Mesh(geo, MAT.glass(0x3c4148, { roughness: 0.16, thickness: 0.12, attenuationDistance: 0.25 })));
      const chip = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.38, 0.05, 3, 0.06), MAT.silver({ roughness: 0.22 }));
      chip.position.set(-1.12, 0.3, 0.06);
      front.add(chip);
      const label = (str, size, x, y, mat, depth = 0.02) => {
        const tg = textGeo(str, size, depth, false);
        tg.computeBoundingBox();
        const m = new THREE.Mesh(tg, mat);
        const bw = tg.boundingBox.max.x - tg.boundingBox.min.x;
        m.position.set(x + bw / 2, y, 0.05);
        front.add(m);
      };
      label('FUNDED TRADER', 0.13, -1.45, 0.82, MAT.chrome({ roughness: 0.04 }));
      label('$100,000', 0.34, -1.45, -0.42, MAT.chrome({ roughness: 0.04, color: 0xffffff }), 0.03);
      label('PHASE 1 + PHASE 2 PASSED', 0.1, -1.45, -0.8, MAT.silver());
      g.add(front);
      g.rotation.set(-0.28, -0.42, 0.1);
      return g;
    },
  },

  hourglass: {
    label: 'Killzone hourglass', w: 900, h: 1300, fov: 26, cam: [0, 0.5, 10], async build() {
      const g = new THREE.Group();
      const H = 1.1;
      const rAt = (y) => {
        const a = Math.abs(y) / H;
        let r = 0.065 + 0.63 * Math.sin((Math.PI / 2) * smooth(0, 0.72, a));
        r *= 1 - 0.22 * smooth(0.84, 1, a);
        return r;
      };
      const glassPts = [[0, -H]];
      for (let i = 0; i <= 120; i++) { const y = -H + (2 * H * i) / 120; glassPts.push([rAt(y), y]); }
      glassPts.push([0, H]);
      g.add(new THREE.Mesh(lathe(glassPts, 128), MAT.glass(0xe6eaee, { thickness: 0.2, attenuationDistance: 1.5 })));

      const sandMat = MAT.pearl({ side: THREE.DoubleSide, roughness: 0.5, clearcoat: 0.2 });
      const bottom = [[0, -H + 0.035]];
      for (let i = 0; i <= 30; i++) { const y = -H + 0.035 + (0.38 * i) / 30; bottom.push([rAt(y) * 0.93, y]); }
      bottom.push([0, -0.42]);
      g.add(new THREE.Mesh(lathe(bottom, 96), sandMat));
      const top = [[0, 0.07]];
      for (let i = 0; i <= 30; i++) { const y = 0.07 + (0.52 * i) / 30; top.push([rAt(y) * 0.92, y]); }
      top.push([0, 0.59]);
      g.add(new THREE.Mesh(lathe(top, 96), sandMat));
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.5, 12), sandMat);
      stream.position.y = -0.18;
      g.add(stream);

      for (const y of [H + 0.07, -H - 0.07]) {
        const cap = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.14, 1.7, 4, 0.05), MAT.chrome());
        cap.position.y = y;
        g.add(cap);
      }
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.2, 24), MAT.gunmetal());
        p.position.set(Math.cos(a) * 0.74, 0, Math.sin(a) * 0.74);
        g.add(p);
      }
      g.rotation.set(0.05, 0.3, 0.06);
      return g;
    },
  },

  cap: {
    label: 'Graduation cap', w: 1250, h: 1050, fov: 28, cam: [0, 2.6, 9.5], look: [0, 0.05, 0], async build() {
      const g = new THREE.Group();
      const board = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.09, 2.6, 4, 0.035), MAT.glass(0xe6eaee, { thickness: 0.25, roughness: 0.05 }));
      board.rotation.y = Math.PI / 4;
      board.position.y = 0.42;
      g.add(board);
      g.add(new THREE.Mesh(lathe([[0, -0.38], [0.8, -0.38], [0.85, -0.33], [0.9, 0.05], [0.92, 0.37], [0, 0.37]], 128), MAT.dark()));
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 16), MAT.silver());
      btn.position.y = 0.5;
      g.add(btn);
      const cord = new THREE.CatmullRomCurve3([
        new V3(0, 0.5, 0), new V3(0.7, 0.49, 0.05), new V3(1.5, 0.47, 0.06), new V3(1.82, 0.4, 0.06),
        new V3(1.9, 0.0, 0.08), new V3(1.92, -0.35, 0.1),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(cord, 96, 0.024, 12), MAT.pearl()));
      const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 0.55, 32), MAT.pearl());
      tassel.position.set(1.92, -0.62, 0.1);
      g.add(tassel);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 24, 12), MAT.silver());
      knot.position.set(1.92, -0.34, 0.1);
      g.add(knot);
      g.rotation.set(0.05, -0.35, 0.05);
      return g;
    },
  },

  magnet: {
    label: 'Liquidity magnet', w: 1200, h: 1250, fov: 28, cam: [0, 0.2, 10.5], async build() {
      const g = new THREE.Group();
      const R = 0.95, r = 0.34;
      const m = new THREE.Group();
      m.add(new THREE.Mesh(new THREE.TorusGeometry(R, r, 48, 128, Math.PI), MAT.chrome()));
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.9, 64), MAT.chrome());
        leg.position.set(sx * R, -0.45, 0);
        const tip = new THREE.Mesh(new RoundedBoxGeometry(r * 2.02, 0.44, r * 2.02, 4, 0.06), MAT.pearl());
        tip.position.set(sx * R, -1.12, 0);
        m.add(leg, tip);
      }
      m.rotation.set(0.12, -0.45, 0.22);
      m.position.y = 0.75;
      g.add(m);
      const minis = [
        [-0.75, -1.55, 0.4, 0.35, true], [0.3, -1.75, 0.15, -0.3, false], [1.15, -1.45, -0.1, 0.5, true],
        [-0.15, -2.35, 0.5, 0.15, true], [0.95, -2.25, 0.35, -0.25, false], [-1.15, -2.3, 0.05, 0.6, false],
      ];
      for (const [x, y, z, rz, bull] of minis) {
        const c = miniCandle(bull, bull ? 0.38 : 0.3);
        c.position.set(x, y, z);
        c.rotation.set(0.2, 0.3, rz);
        g.add(c);
      }
      return g;
    },
  },

  heroA: {
    label: 'Hero (additive plates)', w: 2400, h: 1500, ss: 1.6, fov: 28, cam: [0, 0, 15.5], opaque: true, glow: [0.7, 0.48], async build() {
      const g = glassPlates({ mode: 'additive', shine: 1.35, N: 38 });
      g.scale.setScalar(0.88);
      g.position.set(2.3, -0.05, 0);
      return g;
    },
  },

  heroB: {
    label: 'Hero (glass plates)', w: 2400, h: 1500, ss: 1.6, fov: 28, cam: [0, 0, 15.5], opaque: true, glow: [0.7, 0.48], async build() {
      const g = glassPlates({ mode: 'glass', N: 30 });
      g.position.set(2.5, -0.15, 0);
      return g;
    },
  },

  helix2: {
    label: 'Hero glass plates', w: 1500, h: 1500, fov: 28, cam: [0.2, 0.1, 15.5], async build() {
      const g = new THREE.Group();
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const a = THREE.MathUtils.degToRad(-40 + (160 * i) / 12);
        pts.push(new V3(-1.1 + Math.cos(a) * 3.5, -1.1 + Math.sin(a) * 3.5, Math.sin(a * 1.5) * 1.2));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const N = 34;
      const cool = C(0xaab3bd), white = C(0xf4f6f8);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const s = 0.5 + 0.8 * Math.pow(Math.sin(Math.PI * (0.05 + 0.9 * t)), 0.75);
        const shape = new THREE.Shape();
        shape.absellipse(0, 0, 1.35 * s, 0.8 * s, 0, Math.PI * 2, false);
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: 0.03, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.045, bevelSegments: 6, curveSegments: 120,
        });
        geo.center();
        const tint = cool.clone().lerp(white, smooth(0.3, 1, t));
        // faint tinted body (alpha-blended) + pure reflections (additive)
        const body = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
          color: tint, metalness: 0, roughness: 0.2, transparent: true, opacity: 0.13,
          depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.5,
        }));
        const shine = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
          color: 0x000000, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
          specularIntensity: 1, specularColor: tint.clone().lerp(C(0xffffff), 0.6), envMapIntensity: 0.75,
          iridescence: 0.3, iridescenceIOR: 1.35, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
        }));
        const holder = new THREE.Group();
        holder.add(body, shine);
        holder.position.copy(curve.getPointAt(t));
        const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), curve.getTangentAt(t));
        const tw = new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), t * Math.PI * 1.15 + 0.25);
        holder.quaternion.copy(q).multiply(tw);
        g.add(holder);
      }
      g.rotation.set(0.28, -0.55, -0.12);
      return g;
    },
  },

  oneone: {
    label: '1:1 glass text', w: 1300, h: 900, fov: 26, cam: [0, 0.3, 10], matte: 0.15, async build() {
      await loadFont();
      const g = new THREE.Group();
      const geo = new TextGeometry('1:1', {
        font: FONT, size: 1.7, depth: 0.55, curveSegments: 16,
        bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.06, bevelSegments: 8,
      });
      geo.center();
      g.add(new THREE.Mesh(geo, MAT.silver({ roughness: 0.12 })));
      g.rotation.set(-0.12, -0.38, 0.04);
      return g;
    },
  },

  play: {
    label: 'Online play tile', w: 1150, h: 1050, fov: 26, cam: [0, 0.6, 9.5], async build() {
      const g = new THREE.Group();
      const tileGeo = new THREE.ExtrudeGeometry(roundedRect(2.6, 1.9, 0.36), {
        depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 8, curveSegments: 32,
      });
      tileGeo.center();
      g.add(new THREE.Mesh(tileGeo, MAT.glass(0xe6eaee, { thickness: 0.6, attenuationDistance: 1.6 })));
      const tri = new THREE.Shape();
      const r = 0.42;
      tri.moveTo(-r * 0.6, -r); tri.lineTo(r * 0.95, 0); tri.lineTo(-r * 0.6, r); tri.closePath();
      const triGeo = new THREE.ExtrudeGeometry(tri, {
        depth: 0.14, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 6,
      });
      triGeo.center();
      const play = new THREE.Mesh(triGeo, MAT.pearl());
      play.position.z = 0.32;
      g.add(play);
      const bar = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.07, 0.07, 3, 0.03), MAT.chrome());
      bar.position.set(0, -0.68, 0.2);
      const prog = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.09, 0.09, 3, 0.04), MAT.silver());
      prog.position.set(-0.375, -0.68, 0.22);
      g.add(bar, prog);
      g.rotation.set(-0.18, -0.42, 0.05);
      return g;
    },
  },

  certificate: {
    label: 'Certificate', w: 1400, h: 1100, fov: 26, cam: [0, 0.2, 10], async build() {
      await loadFont();
      const g = new THREE.Group();
      // paper artwork drawn on a canvas
      const cv = document.createElement('canvas');
      cv.width = 2200; cv.height = 1560;
      const x = cv.getContext('2d');
      x.fillStyle = '#f7f6f2';
      x.fillRect(0, 0, cv.width, cv.height);
      const vig = x.createRadialGradient(1100, 700, 300, 1100, 780, 1400);
      vig.addColorStop(0, 'rgba(255,255,255,0.5)');
      vig.addColorStop(1, 'rgba(0,0,0,0.07)');
      x.fillStyle = vig;
      x.fillRect(0, 0, cv.width, cv.height);
      x.strokeStyle = '#17181b';
      x.lineWidth = 12; x.strokeRect(64, 64, cv.width - 128, cv.height - 128);
      x.lineWidth = 3; x.strokeRect(100, 100, cv.width - 200, cv.height - 200);
      for (const [cx, cy] of [[100, 100], [cv.width - 100, 100], [100, cv.height - 100], [cv.width - 100, cv.height - 100]]) {
        x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4); x.fillStyle = '#17181b'; x.fillRect(-16, -16, 32, 32); x.restore();
      }
      const text = (str, font, y, color = '#131417', spacing = '0px', xPos = 1100) => {
        x.font = font; x.fillStyle = color; x.letterSpacing = spacing; x.textAlign = 'center'; x.fillText(str, xPos, y);
      };
      text('SMART MONEY INSTITUTE', '600 50px "Segoe UI", sans-serif', 250, '#131417', '22px');
      text('Certificate', '700 156px Georgia, serif', 470);
      text('OF COMPLETION', '500 44px "Segoe UI", sans-serif', 560, '#3a3d42', '18px');
      text('This is to certify that', 'italic 46px Georgia, serif', 700, '#55595f');
      text('Your Name', '104px "Segoe Script", "Brush Script MT", cursive', 845);
      x.fillStyle = '#17181b'; x.fillRect(640, 880, 920, 3);
      text('has successfully completed the', 'italic 44px Georgia, serif', 975, '#55595f');
      text('Forex, Price Action & Smart Money Concepts Program', '600 58px Georgia, serif', 1068);
      x.fillRect(330, 1300, 470, 3); x.fillRect(1400, 1300, 470, 3);
      text('Mentor', '70px "Segoe Script", cursive', 1272, '#2a2c30', '0px', 565);
      text('HEAD MENTOR', '600 30px "Segoe UI", sans-serif', 1352, '#55595f', '8px', 565);
      text('2026', '600 44px Georgia, serif', 1270, '#2a2c30', '4px', 1635);
      text('DATE OF ISSUE', '600 30px "Segoe UI", sans-serif', 1352, '#55595f', '8px', 1635);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;

      const PW = 3.2, PH = (3.2 * cv.height) / cv.width;
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshPhysicalMaterial({
        map: tex, emissiveMap: tex, emissive: C(0xffffff), emissiveIntensity: 0.6, roughness: 0.7, metalness: 0,
      }));
      paper.position.z = 0.051;
      g.add(paper);
      const board = new THREE.Mesh(new RoundedBoxGeometry(PW + 0.06, PH + 0.06, 0.08, 3, 0.02), MAT.dark({ roughness: 0.5 }));
      g.add(board);
      // glossy black frame with a thin chrome lip
      const outer = roundedRect(PW + 0.42, PH + 0.42, 0.08);
      outer.holes.push(new THREE.Path(roundedRect(PW + 0.02, PH + 0.02, 0.02).getPoints(16).reverse()));
      const frameGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 5, curveSegments: 12 });
      frameGeo.center();
      const frame = new THREE.Mesh(frameGeo, MAT.dark({ color: 0x0c0d0f, roughness: 0.16 }));
      frame.position.z = 0.07;
      g.add(frame);
      const lip = roundedRect(PW + 0.1, PH + 0.1, 0.03);
      lip.holes.push(new THREE.Path(roundedRect(PW + 0.02, PH + 0.02, 0.02).getPoints(16).reverse()));
      const lipGeo = new THREE.ExtrudeGeometry(lip, { depth: 0.02, bevelEnabled: false });
      lipGeo.center();
      const lipMesh = new THREE.Mesh(lipGeo, MAT.silver());
      lipMesh.position.z = 0.1;
      g.add(lipMesh);
      // silver seal with black ribbons
      const seal = new THREE.Group();
      for (const s of [-1, 1]) {
        const rib = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.5, 0.012, 2, 0.005), MAT.dark({ roughness: 0.45 }));
        rib.position.set(s * 0.09, -0.2, -0.01);
        rib.rotation.z = s * 0.28;
        seal.add(rib);
      }
      const disc = new THREE.Mesh(lathe([[0, -0.03], [0.29, -0.03], [0.31, -0.01], [0.31, 0.01], [0.29, 0.03], [0, 0.03]], 96), MAT.silver({ roughness: 0.16 }));
      disc.rotation.x = Math.PI / 2;
      seal.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.012, 12, 96), MAT.chrome());
      ring.position.z = 0.032;
      seal.add(ring);
      const mono = new THREE.Mesh(textGeo('SMI', 0.13, 0.02, false), MAT.chrome({ roughness: 0.05 }));
      mono.position.z = 0.04;
      seal.add(mono);
      seal.position.set(0, -PH / 2 + 0.36, 0.12);
      g.add(seal);
      g.rotation.set(-0.1, -0.38, 0.03);
      return g;
    },
  },
};

// ---------------------------------------------------------------------------
// Rendering, matting, export
// ---------------------------------------------------------------------------
let ENV = null;

async function shoot(name, { save = false } = {}) {
  const a = ASSETS[name];
  const W = a.w, H = a.h;
  const ss = a.ss || SS;
  renderer.setSize(Math.round(W * ss), Math.round(H * ss), false);

  const scene = new THREE.Scene();
  scene.environment = ENV;
  const backdropMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false, color: 0x000000 });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), backdropMat));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-4, 6, 5);
  const rim = new THREE.DirectionalLight(0xe8eeff, 1.1);
  rim.position.set(5, 2, -4);
  scene.add(key, rim);

  const camera = new THREE.PerspectiveCamera(a.fov || 30, W / H, 0.1, 1000);
  camera.position.set(...(a.cam || [0, 0, 10]));
  camera.lookAt(...(a.look || [0, 0, 0]));
  scene.add(await a.build());

  if (a.opaque) {
    // Single render over a camera-locked gradient plane; no matting.
    const dist = 40;
    const ph = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist * 1.02;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(ph * camera.aspect, ph),
      new THREE.MeshBasicMaterial({ map: heroBackdrop(a.glow[0], a.glow[1]), toneMapped: false })
    );
    plane.position.set(0, 0, -dist);
    camera.add(plane);
    scene.add(camera);
    renderer.render(scene, camera);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(renderer.domElement, 0, 0, W, H);
    const webp = await new Promise((r) => cv.toBlob(r, 'image/webp', 0.86));
    addFigure(name, URL.createObjectURL(webp), `${W}×${H} · webp ${(webp.size / 1024).toFixed(0)} KB (opaque)`);
    if (save) {
      const jpg = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
      await fetch(`/save?name=${name}.webp`, { method: 'POST', body: webp });
      await fetch(`/save?name=${name}.jpg`, { method: 'POST', body: jpg });
    }
    scene.traverse((obj) => { if (obj.geometry) obj.geometry.dispose(); });
    return { w: W, h: H, kb: webp.size / 1024 };
  }

  const grab = (hex) => {
    backdropMat.color.set(hex);
    renderer.render(scene, camera);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(renderer.domElement, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H);
  };
  const B = grab(0x000000).data;
  const Wt = grab(0xffffff).data;

  // Difference matting: alpha from (white - black), colour recovered from the white frame.
  // matte = 0 keeps the full glass tint (min channel); higher values trade tint for transparency.
  const k = a.matte || 0;
  const out = new ImageData(W, H);
  const o = out.data;
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let i = 0, p = 0; i < B.length; i += 4, p++) {
    const dr = Wt[i] - B[i], dg = Wt[i + 1] - B[i + 1], db = Wt[i + 2] - B[i + 2];
    const dmin = Math.min(dr, dg, db);
    const d = Math.max(0, dmin + k * ((dr + dg + db) / 3 - dmin));
    const al = 255 - d;
    if (al <= 2) continue;
    const af = al / 255;
    o[i] = Math.min(255, (Wt[i] - d) / af);
    o[i + 1] = Math.min(255, (Wt[i + 1] - d) / af);
    o[i + 2] = Math.min(255, (Wt[i + 2] - d) / af);
    o[i + 3] = al;
    if (al > 8) {
      const x = p % W, y = (p / W) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  // trim to content (+ padding)
  const pad = Math.round(Math.max(W, H) * 0.02);
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const full = document.createElement('canvas');
  full.width = W; full.height = H;
  full.getContext('2d').putImageData(out, 0, 0);
  const cut = document.createElement('canvas');
  cut.width = cw; cut.height = ch;
  cut.getContext('2d').drawImage(full, minX, minY, cw, ch, 0, 0, cw, ch);

  const webp = await new Promise((r) => cut.toBlob(r, 'image/webp', 0.9));
  const url = URL.createObjectURL(webp);
  addFigure(name, url, `${cw}×${ch} · webp ${(webp.size / 1024).toFixed(0)} KB`);
  if (save) {
    const png = await new Promise((r) => cut.toBlob(r, 'image/png'));
    await fetch(`/save?name=${name}.webp`, { method: 'POST', body: webp });
    await fetch(`/save?name=${name}.png`, { method: 'POST', body: png });
  }
  scene.traverse((obj) => { if (obj.geometry) obj.geometry.dispose(); });
  return { w: cw, h: ch, kb: webp.size / 1024 };
}

function addFigure(name, url, meta) {
  let fig = document.getElementById(`fig-${name}`);
  if (!fig) {
    fig = document.createElement('figure');
    fig.id = `fig-${name}`;
    fig.innerHTML = '<img alt=""><figcaption></figcaption>';
    gridEl.appendChild(fig);
  }
  fig.querySelector('img').src = url;
  fig.querySelector('figcaption').textContent = `${name} — ${meta}`;
}

async function renderList(names, save) {
  window.__studioDone = false;
  const results = {};
  for (const n of names) {
    status(`Rendering ${n}…`);
    await new Promise((r) => setTimeout(r, 30));
    try {
      results[n] = await shoot(n, { save });
    } catch (e) {
      console.error(e);
      results[n] = { error: String(e) };
    }
  }
  status(`Done: ${names.join(', ')}${save ? ' (saved)' : ''}`);
  window.__studioResults = results;
  window.__studioDone = true;
  return results;
}
window.renderList = renderList;

async function init() {
  ENV = buildEnvironment();
  for (const [n, a] of Object.entries(ASSETS)) {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.onclick = () => renderList([n], false);
    barEl.appendChild(b);
  }
  const all = document.createElement('button');
  all.className = 'primary';
  all.textContent = 'Render all & save';
  all.onclick = () => renderList(Object.keys(ASSETS), true);
  barEl.appendChild(all);
  status('Ready.');
  const only = qs.get('only');
  if (qs.has('auto')) renderList(only ? only.split(',') : Object.keys(ASSETS), qs.get('auto') === 'save');
}
init();
