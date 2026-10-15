import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, ShaderMaterial, Vector3 } from 'three'
import { RADIANT } from '../timeline'
import { stage } from '../stage'

// A constant meteor shower. Every meteor is a screen-aligned ribbon whose head and tail are two points on a great circle that leaves
// the radiant; everything (where, when, how fast) is decided on the GPU from a per-instance seed and a cycle number, so the sky never
// runs out of meteors and costs one draw call. The shower thickens a little as the camera pushes in (uRate) and bursts now and then.

const VERT = /* glsl */ `
attribute vec2 aCorner;
attribute float aPhase, aPeriod, aLife, aThresh, aSeedA, aSeedB, aTint, aSpeed, aLen;
uniform float uTime, uRate, uBurst, uAspect, uWidth;
uniform vec3 uRadiant;
varying float vAlpha;
varying float vTint;
varying float vSide;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void hide() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; vTint = 0.0; vSide = 0.0; }
void main() {
  float tt = uTime + aPhase * aPeriod;
  float cyc = floor(tt / aPeriod);
  float age = tt - cyc * aPeriod;
  float k = age / aLife;
  float on = step(aThresh, uRate * (1.0 + 2.2 * uBurst));
  if (k > 1.0 || on < 0.5) { hide(); return; }
  float s1 = hash(cyc * 7.31 + aSeedA * 31.7);
  float s2 = hash(cyc * 3.17 + aSeedB * 17.3);
  float s3 = hash(cyc * 5.77 + aSeedA * 11.9);
  vec3 R = normalize(uRadiant);
  vec3 up = abs(R.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(up, R));
  vec3 e2 = cross(R, e1);
  float ang = s1 * 6.2831853;
  vec3 b = cos(ang) * e1 + sin(ang) * e2;
  float phi0 = radians(5.0 + s2 * 50.0);
  float speed = aSpeed * (0.8 + 0.6 * s3);
  float lenA = aLen * (0.7 + 0.9 * s3);
  float head = phi0 + speed * age;
  float tail = max(phi0, head - lenA);
  vec3 ph = cos(head) * R + sin(head) * b;
  vec3 pt = cos(tail) * R + sin(tail) * b;
  vec4 ch = projectionMatrix * viewMatrix * vec4(ph * 900.0, 1.0);
  vec4 ct = projectionMatrix * viewMatrix * vec4(pt * 900.0, 1.0);
  if (ph.y < 0.05 || pt.y < 0.02 || ch.w <= 0.0 || ct.w <= 0.0) { hide(); return; }
  vec2 nh = ch.xy / ch.w;
  vec2 nt = ct.xy / ct.w;
  vec2 d = nh - nt;
  d.x *= uAspect;
  float L = length(d);
  vec2 dir = L > 1e-5 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  n.x /= uAspect;
  float along = aCorner.x;
  vec2 pos = mix(nt, nh, along) + n * aCorner.y * uWidth * mix(0.3, 1.0, along);
  float depth = mix(ct.z / ct.w, ch.z / ch.w, along);
  gl_Position = vec4(pos, depth, 1.0);
  float fadeIn = smoothstep(0.0, 0.07, k);
  float fadeOut = 1.0 - smoothstep(0.5, 1.0, k);
  vAlpha = pow(along, 1.6) * fadeIn * fadeOut * (0.5 + 0.5 * s2);
  vTint = aTint;
  vSide = aCorner.y;
}
`

const FRAG = /* glsl */ `
varying float vAlpha;
varying float vTint;
varying float vSide;
void main() {
  float edge = 1.0 - vSide * vSide;
  vec3 warm = vec3(1.0, 0.95, 0.86);
  vec3 cool = vec3(0.74, 0.86, 1.0);
  gl_FragColor = vec4(mix(warm, cool, vTint) * 2.4, vAlpha * edge);
}
`

export default function Meteors({ count }: { count: number }) {
  const { geometry, material } = useMemo(() => {
    const g = new InstancedBufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(12), 3))
    g.setAttribute('aCorner', new BufferAttribute(new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), 2))
    g.setIndex([0, 1, 2, 2, 1, 3])
    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    const mk = (f: () => number) => new InstancedBufferAttribute(Float32Array.from({ length: count }, f), 1)
    g.setAttribute('aPhase', mk(() => Math.random()))
    g.setAttribute('aPeriod', mk(() => rnd(9, 24)))
    g.setAttribute('aLife', mk(() => rnd(0.55, 1.25)))
    g.setAttribute('aThresh', mk(() => Math.random()))
    g.setAttribute('aSeedA', mk(() => Math.random() * 100))
    g.setAttribute('aSeedB', mk(() => Math.random() * 100))
    g.setAttribute('aTint', mk(() => (Math.random() < 0.3 ? rnd(0.5, 1) : rnd(0, 0.25))))
    g.setAttribute('aSpeed', mk(() => rnd(0.28, 0.6)))
    g.setAttribute('aLen', mk(() => rnd(0.07, 0.22)))
    g.instanceCount = count
    const m = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uRate: { value: 0.25 },
        uBurst: { value: 0 },
        uAspect: { value: 1.6 },
        uWidth: { value: 0.003 },
        uRadiant: { value: new Vector3(...RADIANT) },
      },
    })
    return { geometry: g, material: m }
  }, [count])

  const nextBurst = useRef(6)
  useFrame(({ clock, size }) => {
    const t = clock.elapsedTime
    const p = stage.p
    if (t > nextBurst.current + 1.8) nextBurst.current = t + 8 + Math.random() * 9
    const into = t - nextBurst.current
    const burst = into > 0 && into < 1.8 ? Math.sin((into / 1.8) * Math.PI) : 0
    const u = material.uniforms
    u.uTime.value = t
    u.uRate.value = p.meteorsOn ? p.meteorRate : 0
    u.uBurst.value = burst
    u.uAspect.value = size.width / size.height
    u.uWidth.value = (1.7 * 2) / size.height + 0.0008 * p.meteorRate
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-5} />
}
