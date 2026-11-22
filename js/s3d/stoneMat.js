// stoneMat.js — cilalı taş malzemesi + dünya uzayında "silme" (wipe) geçişi.
// Polished stone material whose texture changes with a cinematic world-space wipe:
// the new stone sweeps across every stone surface, with a thin warm light seam at the front.
// Target: three r160 (WebGL2), iOS Safari 16+, mid-range Android.
import * as THREE from 'three';

const CACHE_KEY = 'stoneWipe2';
const DEFAULT_FROM = -3.2;
const DEFAULT_TO = 3.2;

// Shared 1x1 white placeholder for uNext (never sampled while uWipeActive = 0).
let _white = null;
function whiteTex() {
  if (!_white) {
    _white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    _white.colorSpace = THREE.SRGBColorSpace;
    _white.needsUpdate = true;
  }
  return _white;
}

// ---------------------------------------------------------------- GLSL chunks

const VERT_DECL = /* glsl */`
uniform mat3 uNextTransform;
varying vec3 vStoneWorld;
varying vec2 vNextUv;
`;

// After project_vertex: same batching/instancing order as project_vertex / worldpos_vertex.
// 'uv' is always declared as an attribute in the r160 vertex prefix; MAP_UV follows map.channel.
const VERT_MAIN = /* glsl */`
{
	vec4 stoneWorldPos = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		stoneWorldPos = batchingMatrix * stoneWorldPos;
	#endif
	#ifdef USE_INSTANCING
		stoneWorldPos = instanceMatrix * stoneWorldPos;
	#endif
	vStoneWorld = ( modelMatrix * stoneWorldPos ).xyz;
	#ifdef USE_MAP
		vNextUv = ( uNextTransform * vec3( MAP_UV, 1.0 ) ).xy;
	#else
		vNextUv = ( uNextTransform * vec3( uv, 1.0 ) ).xy;
	#endif
}
`;

const FRAG_DECL = /* glsl */`
uniform sampler2D uNext;
uniform float uWipe;
uniform float uWipeActive;
uniform vec3 uSeam;
uniform float uSeamWidth;
uniform float uSeamGain;
uniform float uGlow;
uniform vec3 uGlowColor;
uniform float uEdge;
uniform vec3 uAxis;
varying vec3 vStoneWorld;
varying vec2 vNextUv;
`;

// Wipe coordinate, shared by the map and seam code (declared at main() scope).
const FRAG_WIPE_COORD = /* glsl */`
	// guarded: zero axis -> no NaN; uEdge = 0 -> no undefined smoothstep(a, a, x)
	float stoneWipeC = dot( vStoneWorld, uAxis / max( length( uAxis ), 1e-6 ) );
	float stoneWipeE = max( uEdge, 1e-4 );
	float stoneWipeT = smoothstep( uWipe - stoneWipeE, uWipe + stoneWipeE, stoneWipeC );
`;

// Replacement for the sample line inside r160 map_fragment (keeps the video decode + diffuseColor *=).
const MAP_SAMPLE_LINE = 'vec4 sampledDiffuseColor = texture2D( map, vMapUv );';
const MAP_SAMPLE_WIPE = /* glsl */`vec4 sampledDiffuseColor;
	if ( uWipeActive > 0.5 ) {
		// c < uWipe (behind the front) -> NEW stone; ahead of it -> current map.
		sampledDiffuseColor = mix( texture2D( uNext, vNextUv ), texture2D( map, vMapUv ), stoneWipeT );
	} else {
		sampledDiffuseColor = texture2D( map, vMapUv );
	}`;

// Fallback if the r160 chunk text ever differs (same semantics, no video decode).
const MAP_FALLBACK = /* glsl */`
#ifdef USE_MAP
	${MAP_SAMPLE_WIPE}
	diffuseColor *= sampledDiffuseColor;
#endif
`;

// No map yet: wipe from the flat material color to the new stone.
const MAP_NOMAP = /* glsl */`
#ifndef USE_MAP
	if ( uWipeActive > 0.5 ) {
		diffuseColor *= mix( texture2D( uNext, vNextUv ), vec4( 1.0 ), stoneWipeT );
	}
#endif
`;

const FRAG_SEAM = /* glsl */`
	{
		float stoneSeam = uWipeActive * ( 1.0 - smoothstep( 0.0, max( uSeamWidth, 1e-4 ), abs( stoneWipeC - uWipe ) ) ) * 1.6 * uSeamGain;
		totalEmissiveRadiance += uSeam * stoneSeam;
		// arkadan aydınlatmalı (LED'li) mermer: taşın kendi rengi içten parlar, açık damarlar daha çok ışık geçirir
		totalEmissiveRadiance += uGlowColor * ( uGlow * diffuseColor.rgb );
	}
`;

function buildMapFragment() {
  const src = THREE.ShaderChunk && THREE.ShaderChunk.map_fragment;
  let chunk;
  if (typeof src === 'string' && src.indexOf(MAP_SAMPLE_LINE) !== -1) {
    chunk = src.replace(MAP_SAMPLE_LINE, () => MAP_SAMPLE_WIPE); // fn form: no '$' pattern expansion
  } else {
    chunk = MAP_FALLBACK;
  }
  return FRAG_WIPE_COORD + chunk + MAP_NOMAP;
}

function inject(source, token, replacement, label) {
  if (source.indexOf(token) === -1) {
    console.warn('[stoneMat] shader token not found:', token, '(' + label + ')');
    return source;
  }
  return source.replace(token, () => replacement);
}

// Non-enumerable so Material.copy/clone/toJSON (JSON.stringify(userData)) do not try to
// serialize textures, light-state arrays and shadow maps held in these uniform objects.
function hideProp(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: false });
}

// ---------------------------------------------------------------- wipe state

let _active = null; // { items:[{material,next,u}], to, raf, resolve, onUpdate }

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function resetWipe(u, to) {
  if (!u) return;
  if (typeof to === 'number') u.uWipe.value = to;
  u.uWipeActive.value = 0;
  u.uSeamGain.value = 1;
  u.uNext.value = whiteTex(); // drop reference to the incoming texture
}

function assignMap(material, tex) {
  const had = !!material.map;
  material.map = tex || null;
  if (had !== !!material.map) material.needsUpdate = true; // recompile only when USE_MAP flips
}

function finalizeItem(it, to) {
  assignMap(it.material, it.next);
  resetWipe(it.u, to);
}

function finishActive() {
  if (!_active) return;
  const a = _active;
  _active = null;
  if (a.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(a.raf);
  for (let i = 0; i < a.items.length; i++) finalizeItem(a.items[i], a.to);
  if (a.onUpdate) { try { a.onUpdate(1); } catch (e) { /* ignore */ } }
  a.resolve();
}

function dropFromActive(material) {
  if (!_active) return;
  _active.items = _active.items.filter((it) => it.material !== material);
}

function toAxis(axis) {
  if (!axis) return null;
  const v = new THREE.Vector3();
  if (axis.isVector3) v.copy(axis);
  else if (Array.isArray(axis)) v.set(+axis[0] || 0, +axis[1] || 0, +axis[2] || 0);
  else if (typeof axis === 'object') v.set(+axis.x || 0, +axis.y || 0, +axis.z || 0);
  else return null;
  if (v.lengthSq() < 1e-12) return null;
  return v.normalize();
}

// ---------------------------------------------------------------- public API

/**
 * createStoneMaterial({ map, roughness, clearcoat, clearcoatRoughness, envMapIntensity, ...extra })
 * -> THREE.MeshPhysicalMaterial with wipe uniforms in material.userData.u
 * (and material.userData.wipe = shader.uniforms after first compile).
 */
export function createStoneMaterial({
  map = null,
  roughness = 0.14,
  clearcoat = 1,
  clearcoatRoughness = 0.06,
  envMapIntensity = 1.1,
  ...extra
} = {}) {
  const material = new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0xffffff,
    metalness: 0,
    map,
    roughness,
    clearcoat,
    clearcoatRoughness,
    envMapIntensity,
  }, extra));

  // Pre-created uniforms: callers may tweak these before the first compile.
  const u = {
    uNext: { value: whiteTex() },
    uNextTransform: { value: new THREE.Matrix3() },
    uWipe: { value: DEFAULT_FROM },
    uWipeActive: { value: 0 },
    uSeam: { value: new THREE.Color(1.0, 0.82, 0.55) }, // linear
    uSeamWidth: { value: 0.12 },
    uSeamGain: { value: 1 },
    uGlow: { value: 0 },
    uGlowColor: { value: new THREE.Color(1.0, 0.78, 0.5) }, // linear, sıcak LED
    uEdge: { value: 0.05 },
    uAxis: { value: new THREE.Vector3(1.0, 0.0, 0.35).normalize() },
  };
  hideProp(material.userData, 'u', u);
  hideProp(material.userData, 'wipe', null);

  const mapFragment = buildMapFragment();

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);

    let vs = shader.vertexShader;
    vs = inject(vs, '#include <common>', '#include <common>\n' + VERT_DECL, 'vertex decl');
    vs = inject(vs, '#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN, 'vertex main');
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = inject(fs, '#include <common>', '#include <common>\n' + FRAG_DECL, 'fragment decl');
    fs = inject(fs, '#include <map_fragment>', mapFragment, 'map');
    fs = inject(fs, '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_SEAM, 'seam');
    shader.fragmentShader = fs;

    material.userData.wipe = shader.uniforms;
  };
  material.customProgramCacheKey = () => CACHE_KEY;

  material.addEventListener('dispose', () => {
    dropFromActive(material);
    u.uNext.value = whiteTex();
  });

  return material;
}

/**
 * setStoneMap(material, texture) -> void
 * Instantly sets material.map (texture's repeat/offset/center must already be set).
 * Recompiles only if map presence changes. Cancels any wipe on this material.
 */
export function setStoneMap(material, texture) {
  if (!material) return;
  dropFromActive(material);
  assignMap(material, texture);
  const u = material.userData && material.userData.u;
  resetWipe(u);
}

/**
 * wipeStones(entries, { duration = 1.2, from = -3.2, to = 3.2, axis, onUpdate } = {}) -> Promise<void>
 * entries: [{ material, next }]. Sweeps `next` over each material along `axis` (world space).
 * A running wipe is completed instantly before a new one starts.
 */
export function wipeStones(entries, { duration = 1.2, from = DEFAULT_FROM, to = DEFAULT_TO, axis, onUpdate } = {}) {
  finishActive();

  const list = Array.isArray(entries) ? entries.filter((e) => e && e.material) : [];
  if (!list.length) return Promise.resolve();

  const f = Number.isFinite(from) ? from : DEFAULT_FROM;
  const t = Number.isFinite(to) ? to : DEFAULT_TO;
  const dirAxis = toAxis(axis);
  const ms = Math.max(0, (Number.isFinite(duration) ? duration : 1.2) * 1000);
  const canAnimate = ms > 0 && typeof requestAnimationFrame === 'function' && !prefersReducedMotion();

  const items = [];
  for (let i = 0; i < list.length; i++) {
    const { material, next } = list[i];
    const u = material.userData && material.userData.u;
    if (!canAnimate || !u || !next) {
      // instant swap (reduced motion, non-stone material, or clearing the map)
      dropFromActive(material);
      finalizeItem({ material, next: next || null, u }, t);
      continue;
    }
    // Same as the built-in mapTransform path (refreshTransformUniform).
    if (next.matrixAutoUpdate !== false) next.updateMatrix();
    u.uNext.value = next;
    u.uNextTransform.value.copy(next.matrix);
    if (dirAxis) u.uAxis.value.copy(dirAxis);
    u.uWipe.value = f;
    u.uSeamGain.value = 0;
    u.uWipeActive.value = 1;
    items.push({ material, next, u });
  }

  if (!items.length) {
    if (typeof onUpdate === 'function') { try { onUpdate(1); } catch (e) { /* ignore */ } }
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const a = {
      items,
      to: t,
      raf: 0,
      resolve,
      onUpdate: typeof onUpdate === 'function' ? onUpdate : null,
    };
    _active = a;
    // Clock starts on the first frame, so main-thread work right after the call
    // (decode/crop/initTexture) cannot make the front jump into the middle of the kitchen.
    let t0 = -1;

    const step = () => {
      if (_active !== a) return;
      if (t0 < 0) t0 = now();
      const p = Math.min(1, (now() - t0) / ms);
      const w = f + (t - f) * easeInOutCubic(p);
      // seam fades in/out at the ends so it never pops on/off mid-surface
      const gain = Math.max(0, Math.min(1, p / 0.06, (1 - p) / 0.12));
      for (let i = 0; i < a.items.length; i++) {
        const uu = a.items[i].u;
        uu.uWipe.value = w;
        uu.uSeamGain.value = gain;
      }
      if (p >= 1) {
        finishActive();
        return;
      }
      if (a.onUpdate) { try { a.onUpdate(p); } catch (e) { /* ignore */ } }
      if (_active !== a) return; // onUpdate started a new wipe / finished this one
      a.raf = requestAnimationFrame(step);
    };
    a.raf = requestAnimationFrame(step);
  });
}
