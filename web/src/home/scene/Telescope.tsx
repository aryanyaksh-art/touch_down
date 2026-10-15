import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Quaternion, Vector3 } from 'three'
import { TELESCOPE, tubeCentre } from '../timeline'
import { stage } from '../stage'

// A Newtonian reflector on a German equatorial mount, the instrument a person actually looks through: a 130 mm f/5 tube with a dew
// shield, a rack-and-pinion focuser with a 1.25 inch eyepiece, a finder scope in two rings, a counterweight shaft with two weights,
// and an aluminium tripod with leg locks and an accessory tray. Modelled from primitives in metres, ground contact at the origin.
// The eye lens sits where `eyeLensLocal()` in the timeline says, because the camera flies into it.

const Y = new Vector3(0, 1, 0)
const quatTo = (dir: Vector3) => new Quaternion().setFromUnitVectors(Y, dir.clone().normalize())

type Kind = 'alu' | 'black' | 'steel' | 'tube' | 'glass' | 'inner' | 'rubber' | 'brass'

function Mat({ kind }: { kind: Kind }) {
  switch (kind) {
    case 'alu':
      return <meshStandardMaterial color="#b4b8be" metalness={1} roughness={0.32} envMapIntensity={1.15} />
    case 'steel':
      return <meshStandardMaterial color="#8c9097" metalness={1} roughness={0.26} envMapIntensity={1.2} />
    case 'black':
      return <meshStandardMaterial color="#111216" metalness={0.6} roughness={0.42} envMapIntensity={1} />
    case 'rubber':
      return <meshStandardMaterial color="#09090b" metalness={0} roughness={0.85} envMapIntensity={0.4} />
    case 'brass':
      return <meshStandardMaterial color="#8f7f5c" metalness={1} roughness={0.35} envMapIntensity={1} />
    case 'tube':
      return <meshPhysicalMaterial color="#d3d6db" metalness={0.1} roughness={0.38} clearcoat={0.55} clearcoatRoughness={0.3} envMapIntensity={1.05} />
    case 'inner':
      return <meshStandardMaterial color="#040405" metalness={0} roughness={0.95} side={2} />
    case 'glass':
      return <meshPhysicalMaterial color="#04060a" metalness={0.25} roughness={0.03} clearcoat={1} clearcoatRoughness={0.02} envMapIntensity={1.8} />
  }
}

/** a cylinder of length `len` centred on `p` and pointing along `axis` */
function Cyl({ p, axis, r, r2, len, kind, seg = 28, open = false }: { p: Vector3; axis: Vector3; r: number; r2?: number; len: number; kind: Kind; seg?: number; open?: boolean }) {
  const q = useMemo(() => quatTo(axis), [axis])
  return (
    <mesh position={p} quaternion={q}>
      <cylinderGeometry args={[r2 ?? r, r, len, seg, 1, open]} />
      <Mat kind={kind} />
    </mesh>
  )
}
function Ring({ p, axis, r, tube, kind }: { p: Vector3; axis: Vector3; r: number; tube: number; kind: Kind }) {
  // a torus lies in the XY plane with its axis along Z; turn Z onto `axis`
  const q = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), axis.clone().normalize()), [axis])
  return (
    <mesh position={p} quaternion={q}>
      <torusGeometry args={[r, tube, 14, 56]} />
      <Mat kind={kind} />
    </mesh>
  )
}
function Rod({ a, b, r, kind, seg = 14 }: { a: Vector3; b: Vector3; r: number; kind: Kind; seg?: number }) {
  const d = useMemo(() => b.clone().sub(a), [a, b])
  const mid = useMemo(() => a.clone().add(b).multiplyScalar(0.5), [a, b])
  return <Cyl p={mid} axis={d} r={r} len={d.length()} kind={kind} seg={seg} />
}

export default function Telescope() {
  const root = useRef<Group>(null)

  const m = useMemo(() => {
    const rt = TELESCOPE.tubeRadius
    const L = TELESCOPE.tubeLength
    const a = new Vector3(0, Math.sin(TELESCOPE.elevation), -Math.cos(TELESCOPE.elevation)) // the tube axis
    const X = new Vector3(1, 0, 0)
    const H = new Vector3(0, TELESCOPE.headY, 0)
    const C = new Vector3(...tubeCentre())
    const up = new Vector3(0, 1, 0).sub(a.clone().multiplyScalar(a.y)).normalize() // perpendicular to the tube, pointing up
    const at = (d: number, s = 0, k = 0) => C.clone().add(a.clone().multiplyScalar(d)).add(X.clone().multiplyScalar(s)).add(up.clone().multiplyScalar(k))
    const ra = new Vector3(0, Math.sin(0.7), -Math.cos(0.7)).normalize()
    const raTop = H.clone().add(new Vector3(0, 0.08, 0)).add(ra.clone().multiplyScalar(0.27))
    const feet = [0, 1, 2].map((i) => {
      const ang = Math.PI / 2 + (i * Math.PI * 2) / 3
      return new Vector3(Math.cos(ang) * 0.7, 0, Math.sin(ang) * 0.7)
    })
    const legTop = [0, 1, 2].map((i) => {
      const ang = Math.PI / 2 + (i * Math.PI * 2) / 3
      return new Vector3(Math.cos(ang) * 0.06, TELESCOPE.headY - 0.07, Math.sin(ang) * 0.06)
    })
    const shaft = new Vector3(0, -0.6, 0.8).normalize()
    return { rt, L, a, X, H, C, up, at, ra, raTop, feet, legTop, shaft }
  }, [])

  useFrame(() => {
    const r = root.current
    if (!r) return
    r.visible = stage.p.world === 'outside'
    r.rotation.y = stage.p.telescopeYaw
  })

  const { rt, L, a, X, H, C, up, at, ra, raTop, feet, legTop, shaft } = m
  const decAxis = X
  const fz = L / 2 - 0.12 // the focuser's position along the tube
  const F = at(fz, rt)

  return (
    <group ref={root}>
      {/* ---- tripod: three tapered legs, leg locks, rubber feet and an accessory tray */}
      {feet.map((f, i) => {
        const dir = f.clone().sub(legTop[i])
        const lock = legTop[i].clone().add(dir.clone().multiplyScalar(0.46))
        const foot = f.clone().add(new Vector3(0, 0.018, 0))
        return (
          <group key={i}>
            <Rod a={legTop[i]} b={f.clone().add(new Vector3(0, 0.03, 0))} r={0.021} kind="alu" />
            <Cyl p={lock} axis={dir} r={0.03} len={0.07} kind="black" />
            <Cyl p={foot} axis={new Vector3(0, 1, 0)} r={0.034} r2={0.028} len={0.04} kind="rubber" />
            <Rod a={legTop[i].clone().lerp(f, 0.55)} b={new Vector3(0, 0.46, 0)} r={0.007} kind="steel" seg={8} />
          </group>
        )
      })}
      <mesh position={[0, 0.46, 0]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[0.27, 0.27, 0.014, 3]} />
        <Mat kind="black" />
      </mesh>

      {/* ---- the mount head: pier, right ascension housing, declination housing, setting circle, clutch knobs */}
      <Cyl p={H.clone().add(new Vector3(0, -0.015, 0))} axis={Y} r={0.092} r2={0.078} len={0.1} kind="black" />
      <Cyl p={H.clone().add(new Vector3(0, 0.075, 0)).add(ra.clone().multiplyScalar(0.12))} axis={ra} r={0.062} len={0.3} kind="black" />
      <Cyl p={H.clone().add(new Vector3(0, 0.075, 0)).add(ra.clone().multiplyScalar(-0.03))} axis={ra} r={0.07} len={0.022} kind="black" />
      <Cyl p={raTop} axis={decAxis} r={0.052} len={0.26} kind="black" />
      <Cyl p={raTop.clone().add(new Vector3(0.14, 0, 0))} axis={decAxis} r={0.058} len={0.014} kind="alu" />
      <Cyl p={raTop.clone().add(new Vector3(-0.135, 0, 0))} axis={decAxis} r={0.034} len={0.025} kind="steel" />
      <Cyl p={H.clone().add(new Vector3(0.075, 0.07, 0.02))} axis={X} r={0.016} len={0.05} kind="steel" />
      <Cyl p={raTop.clone().add(new Vector3(0, 0.07, 0.02))} axis={Y} r={0.014} len={0.04} kind="steel" />

      {/* ---- counterweight shaft, two knurled weights, end cap and safety bolt */}
      <Rod a={raTop.clone()} b={raTop.clone().add(shaft.clone().multiplyScalar(0.66))} r={0.0125} kind="steel" />
      {[0.27, 0.375].map((d) => {
        const p = raTop.clone().add(shaft.clone().multiplyScalar(d))
        return (
          <group key={d}>
            <Cyl p={p} axis={shaft} r={0.064} len={0.085} kind="steel" seg={36} />
            <Ring p={p.clone().add(shaft.clone().multiplyScalar(0.0425))} axis={shaft} r={0.064} tube={0.004} kind="alu" />
            <Ring p={p.clone().add(shaft.clone().multiplyScalar(-0.0425))} axis={shaft} r={0.064} tube={0.004} kind="alu" />
          </group>
        )
      })}
      <Cyl p={raTop.clone().add(shaft.clone().multiplyScalar(0.67))} axis={shaft} r={0.022} len={0.014} kind="black" />

      {/* ---- saddle plate and the two tube rings with their clamps */}
      <mesh position={C.clone().add(new Vector3(0, -0.145, 0))} quaternion={quatTo(a)}>
        <boxGeometry args={[0.075, 0.5, 0.014]} />
        <Mat kind="alu" />
      </mesh>
      {[-0.2, 0.2].map((o) => {
        const p = at(o)
        return (
          <group key={o}>
            <Ring p={p} axis={a} r={rt + 0.008} tube={0.0105} kind="black" />
            <Cyl p={p.clone().add(up.clone().multiplyScalar(rt + 0.02)).add(X.clone().multiplyScalar(0.0))} axis={X} r={0.011} len={0.045} kind="steel" seg={14} />
            <Cyl p={p.clone().add(up.clone().multiplyScalar(rt + 0.02)).add(X.clone().multiplyScalar(0.03))} axis={X} r={0.017} len={0.012} kind="black" seg={18} />
          </group>
        )
      })}

      {/* ---- the optical tube: satin white shell, black inside, dew shield, front lip, rear cell with collimation screws, spider */}
      <group position={C} quaternion={quatTo(a)}>
        <mesh>
          <cylinderGeometry args={[rt, rt, L, 72, 1, true]} />
          <Mat kind="tube" />
        </mesh>
        <mesh>
          <cylinderGeometry args={[rt - 0.004, rt - 0.004, L, 48, 1, true]} />
          <Mat kind="inner" />
        </mesh>
        {/* dew shield: a slightly wider sleeve that slides over the front */}
        <mesh position={[0, L / 2 + 0.07, 0]}>
          <cylinderGeometry args={[rt + 0.01, rt + 0.01, 0.2, 72, 1, true]} />
          <Mat kind="tube" />
        </mesh>
        <mesh position={[0, L / 2 + 0.07, 0]}>
          <cylinderGeometry args={[rt + 0.006, rt + 0.006, 0.2, 48, 1, true]} />
          <Mat kind="inner" />
        </mesh>
        <mesh position={[0, L / 2 + 0.17, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[rt + 0.0105, 0.0065, 12, 72]} />
          <Mat kind="black" />
        </mesh>
        <mesh position={[0, L / 2 - 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[rt + 0.0105, 0.004, 10, 72]} />
          <Mat kind="black" />
        </mesh>
        {/* a black band round the tube and a thin accent band */}
        <mesh position={[0, -L / 2 + 0.17, 0]}>
          <cylinderGeometry args={[rt + 0.0015, rt + 0.0015, 0.05, 72, 1, true]} />
          <Mat kind="black" />
        </mesh>
        {/* rear cell */}
        <mesh position={[0, -L / 2 - 0.035, 0]}>
          <cylinderGeometry args={[rt + 0.014, rt + 0.014, 0.075, 56]} />
          <Mat kind="black" />
        </mesh>
        <mesh position={[0, -L / 2 - 0.078, 0]}>
          <cylinderGeometry args={[rt - 0.01, rt + 0.006, 0.014, 56]} />
          <Mat kind="black" />
        </mesh>
        {[0, 1, 2].map((i) => {
          const ang = (i * Math.PI * 2) / 3 + Math.PI / 6
          return (
            <group key={i} position={[Math.cos(ang) * 0.095, -L / 2 - 0.1, Math.sin(ang) * 0.095]}>
              <mesh>
                <cylinderGeometry args={[0.013, 0.013, 0.028, 14]} />
                <Mat kind="alu" />
              </mesh>
              <mesh position={[0, -0.02, 0]}>
                <cylinderGeometry args={[0.006, 0.006, 0.016, 8]} />
                <Mat kind="steel" />
              </mesh>
            </group>
          )
        })}
        {/* the secondary mirror and its four-vane spider, seen when looking down the open end */}
        <mesh position={[0, L / 2 - 0.09, 0]} rotation={[0.0, 0, 0.0]}>
          <cylinderGeometry args={[0.032, 0.032, 0.012, 28]} />
          <Mat kind="glass" />
        </mesh>
        {[0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((rz) => (
          <mesh key={rz} position={[0, L / 2 - 0.09, 0]} rotation={[0, rz, 0]}>
            <boxGeometry args={[(rt - 0.004) * 2, 0.0025, 0.0035]} />
            <Mat kind="black" />
          </mesh>
        ))}
      </group>

      {/* ---- focuser and eyepiece (the eyepiece axis is +X) */}
      <Cyl p={F.clone().add(X.clone().multiplyScalar(0.012))} axis={X} r={0.058} len={0.03} kind="black" />
      <Cyl p={F.clone().add(X.clone().multiplyScalar(0.05))} axis={X} r={0.044} len={0.05} kind="black" />
      <Cyl p={F.clone().add(X.clone().multiplyScalar(0.098))} axis={X} r={0.0355} len={0.05} kind="alu" />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl p={F.clone().add(X.clone().multiplyScalar(0.05)).add(a.clone().multiplyScalar(0.062 * s))} axis={a} r={0.011} len={0.026} kind="steel" seg={16} />
          <Cyl p={F.clone().add(X.clone().multiplyScalar(0.05)).add(a.clone().multiplyScalar(0.085 * s))} axis={a} r={0.02} len={0.016} kind="black" seg={24} />
        </group>
      ))}
      <Cyl p={F.clone().add(X.clone().multiplyScalar(0.062)).add(up.clone().multiplyScalar(0.05))} axis={up} r={0.012} len={0.024} kind="steel" seg={14} />
      <Cyl p={F.clone().add(X.clone().multiplyScalar(0.062)).add(up.clone().multiplyScalar(0.068))} axis={up} r={0.018} len={0.012} kind="black" seg={18} />
      <Cyl p={F.clone().add(X.clone().multiplyScalar(0.13))} axis={X} r={0.0318} len={0.07} kind="steel" />
      <Cyl p={F.clone().add(X.clone().multiplyScalar(0.152))} axis={X} r={0.0275} len={0.085} kind="black" />
      <Ring p={F.clone().add(X.clone().multiplyScalar(0.135))} axis={X} r={0.0305} tube={0.0032} kind="alu" />
      <Ring p={F.clone().add(X.clone().multiplyScalar(0.18))} axis={X} r={0.0275} tube={0.0025} kind="alu" />
      <Cyl p={F.clone().add(X.clone().multiplyScalar(0.188))} axis={X} r={0.0305} len={0.02} kind="rubber" />
      <mesh position={[F.x + 0.1985, F.y, F.z]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.0178, 40]} />
        <Mat kind="glass" />
      </mesh>
      <Ring p={F.clone().add(X.clone().multiplyScalar(0.1975))} axis={X} r={0.0182} tube={0.0021} kind="steel" />

      {/* ---- the finder scope, in two rings on short stems, with a dew cap and a small eyepiece */}
      {(() => {
        const fc = at(0.3, 0, rt + 0.085)
        const fl = 0.22
        return (
          <group>
            <Cyl p={fc} axis={a} r={0.025} len={fl} kind="black" />
            <Cyl p={fc.clone().add(a.clone().multiplyScalar(fl / 2 + 0.018))} axis={a} r={0.029} len={0.04} kind="black" open />
            <Cyl p={fc.clone().sub(a.clone().multiplyScalar(fl / 2 + 0.014))} axis={a} r={0.013} len={0.03} kind="steel" />
            {[-0.07, 0.07].map((o) => (
              <group key={o}>
                <Ring p={fc.clone().add(a.clone().multiplyScalar(o))} axis={a} r={0.03} tube={0.0055} kind="black" />
                <Rod a={fc.clone().add(a.clone().multiplyScalar(o)).sub(up.clone().multiplyScalar(0.028))} b={at(0.3 + o, 0, rt + 0.004)} r={0.0085} kind="alu" seg={10} />
              </group>
            ))}
          </group>
        )
      })()}
    </group>
  )
}
