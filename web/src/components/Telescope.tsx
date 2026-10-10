// A flat vector telescope on a hill, aimed at a crescent moon. Solid fills only.
// Scene coordinates: 1600 x 900. The eyepiece opening sits at EYE, and the scroll zoom flies into it.
export const VB_W = 1600
export const VB_H = 900
export const EYE = { x: 430, y: 610 }
export const TUBE_ANGLE = -32 // degrees, tube points up and to the right
// The bright blue lens in the eyecap. The scroll zoom flies straight into this point and never slides.
const eyeRad = (TUBE_ANGLE * Math.PI) / 180
export const FOCUS = { x: EYE.x + 15 * Math.cos(eyeRad), y: EYE.y + 15 * Math.sin(eyeRad) }

const C = {
  tube: '#3a4275',
  light: '#5560a8',
  dark: '#262c55',
  mount: '#1d2247',
  ground: '#06081a',
  ink: '#f2efe8',
  amber: '#ffc98a',
  sky: '#0a0d1f',
}

export function TelescopeScene() {
  return (
    <>
      {/* crescent moon */}
      <circle cx={1450} cy={130} r={46} fill={C.ink} />
      <circle cx={1472} cy={118} r={42} fill={C.sky} />
      <circle cx={1296} cy={236} r={3} fill={C.amber} />
      <circle cx={1104} cy={84} r={2.2} fill={C.ink} />
      {/* tripod and pier */}
      <g stroke={C.mount} strokeWidth={15} strokeLinecap="round">
        <line x1={884} y1={582} x2={690} y2={866} />
        <line x1={884} y1={582} x2={1076} y2={866} />
        <line x1={884} y1={582} x2={890} y2={884} />
      </g>
      <rect x={873} y={368} width={22} height={214} fill={C.mount} />
      <rect x={852} y={560} width={64} height={34} rx={5} fill={C.dark} />
      {/* hill */}
      <path d="M0,900 L0,806 Q290,752 560,812 T1110,796 T1600,774 L1600,900 Z" fill={C.ground} />
    </>
  )
}

/** The tube, drawn along +x with the eyepiece opening at the local origin. Rotated by the caller. */
export function TelescopeTube() {
  return (
    <g>
      {/* mount cradle */}
      <rect x={470} y={34} width={96} height={22} rx={4} fill={C.mount} />
      {/* finder scope */}
      <rect x={300} y={-86} width={340} height={22} rx={4} fill={C.tube} />
      <rect x={360} y={-66} width={12} height={30} fill={C.dark} />
      <rect x={570} y={-66} width={12} height={30} fill={C.dark} />
      <rect x={640} y={-90} width={16} height={30} rx={3} fill={C.amber} />
      {/* eyepiece and focuser */}
      <rect x={0} y={-19} width={30} height={38} rx={5} fill={C.light} />
      <rect x={30} y={-13} width={56} height={26} fill={C.dark} />
      <rect x={76} y={-27} width={74} height={54} rx={5} fill={C.tube} />
      {/* main tube */}
      <rect x={150} y={-38} width={850} height={76} fill={C.tube} />
      <rect x={150} y={-38} width={850} height={13} fill={C.light} />
      <rect x={150} y={26} width={850} height={12} fill={C.dark} />
      <rect x={420} y={-38} width={9} height={76} fill={C.ink} opacity={0.85} />
      <rect x={720} y={-38} width={9} height={76} fill={C.ink} opacity={0.85} />
      {/* dew shield and rim */}
      <rect x={1000} y={-47} width={150} height={94} fill={C.dark} />
      <rect x={1000} y={-47} width={150} height={13} fill={C.tube} />
      <rect x={1150} y={-47} width={11} height={94} fill={C.amber} />
      {/* the blue lens, where the zoom ends up */}
      <circle cx={15} cy={0} r={11} fill="#8da2ff" />
    </g>
  )
}
