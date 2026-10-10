import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowCounterClockwise, ArrowRight } from '@phosphor-icons/react'
import './story.css'

// A scroll-through explainer: how a probe spots hazards on an asteroid, then three landings in flat vector.
// Every animation plays once when it arrives (and again from the replay button). Motion is CSS keyframes on
// transform, opacity, stroke and fill only, so it stays smooth while the page is busy. Reduced motion shows the final frame.

const INK = '#f2efe8'
const DIM = '#9aa0c0'
const HOT = '#ff5a36'
const BLUE = '#9db4ff'
const AMBER = '#ffc98a'
const FAR = '#1d2247'
const ROCK = '#3a4275'
const ROCK_DARK = '#262c55'

function Anim({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [go, setGo] = useState(false)
  const [run, setRun] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setGo(true)
          io.disconnect()
        }
      },
      { threshold: 0.55 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div className="anim" ref={ref}>
      <svg key={run} viewBox="0 0 800 450" className={go ? 'beat-svg go' : 'beat-svg'} role="img" aria-label={label}>
        {children}
      </svg>
      <button type="button" className="anim-replay" aria-label={`Replay: ${label}`} onClick={() => { setRun((r) => r + 1); setGo(true) }}>
        <ArrowCounterClockwise size={16} />
      </button>
    </div>
  )
}

function Ground() {
  return <path d="M0,450 V352 Q200,338 400,347 T800,340 V450 Z" fill={FAR} />
}

/** The probe, flat vector. Origin is the centre of its body; the sampler head is 36 units below. */
function Probe({ flames, scale = 1 }: { flames?: boolean; scale?: number }) {
  return (
    <g transform={`scale(${scale})`}>
      {flames && (
        <g className="a flame-on" opacity={0}>
          <path className="a flicker" d="M-12,12 L-8,36 L-4,12 Z" fill={AMBER} />
          <path className="a flicker" style={{ animationDelay: '0.05s' }} d="M4,12 L8,36 L12,12 Z" fill={AMBER} />
        </g>
      )}
      <rect x={-50} y={-5} width={32} height={10} fill="#5560a8" />
      <rect x={18} y={-5} width={32} height={10} fill="#5560a8" />
      <rect x={-14} y={-16} width={28} height={28} rx={4} fill={INK} />
      <rect x={-14} y={-16} width={28} height={8} rx={3} fill="#dfe6ff" />
      <rect x={-2} y={-28} width={4} height={12} fill={DIM} />
      <circle cx={0} cy={-30} r={3} fill={AMBER} />
      <rect x={-2} y={12} width={4} height={18} fill={DIM} />
      <rect x={-10} y={29} width={20} height={7} rx={3} fill={AMBER} />
    </g>
  )
}

function Boulder({ x, w, h, fill = ROCK }: { x: number; w: number; h: number; fill?: string }) {
  return <path d={`M${x - w / 2},354 L${x - w / 4},${346 - h} L${x + w / 4},${346 - h * 0.8} L${x + w / 2},354 Z`} fill={fill} />
}

/* ---------- the four chapters ---------- */

function LookDown() {
  return (
    <Anim label="A probe descends over rocky ground and its camera takes a picture">
      <Ground />
      <Boulder x={250} w={70} h={34} />
      <Boulder x={365} w={46} h={24} fill={ROCK_DARK} />
      <Boulder x={150} w={40} h={18} fill={ROCK_DARK} />
      <polygon className="a fade" style={{ animationDelay: '1.5s', animationDuration: '0.6s' }} points="300,150 215,348 385,348" fill={BLUE} opacity={0.16} />
      <line className="a fade" style={{ animationDelay: '1.7s', animationDuration: '0.5s' }} x1={215} y1={348} x2={385} y2={348} stroke={BLUE} strokeWidth={3} />
      <g transform="translate(300 118)">
        <g className="a drop" style={{ animationDuration: '1.8s' }}>
          <Probe scale={0.9} />
        </g>
      </g>
      <g className="a slide-in" style={{ animationDelay: '2.5s', animationDuration: '0.7s' }}>
        <rect x={520} y={70} width={230} height={168} rx={6} fill="#14183a" stroke={INK} strokeWidth={2} />
        <path d="M522,200 Q600,186 650,196 T748,190 V236 H522 Z" fill={FAR} />
        <path d="M560,208 l12,-22 l26,-4 l10,26 z" fill={ROCK} />
        <path d="M680,204 l8,-14 l16,-2 l6,16 z" fill={ROCK_DARK} />
        <rect className="a flash" style={{ animationDelay: '2.5s' }} x={520} y={70} width={230} height={168} rx={6} fill={INK} opacity={0} />
      </g>
    </Anim>
  )
}

const SHADOW = '#04050f'
function ShadowBoulders() {
  const items = [
    { x: 215, w: 66, h: 38 },
    { x: 365, w: 50, h: 26 },
    { x: 520, w: 78, h: 46 },
    { x: 668, w: 44, h: 22 },
  ]
  return (
    <Anim label="Low sunlight makes each boulder throw a long shadow, then each boulder is outlined">
      <Ground />
      <g className="a pop" style={{ animationDuration: '0.8s' }}>
        <circle cx={80} cy={96} r={24} fill={AMBER} />
      </g>
      {items.map((b, i) => (
        <g key={b.x}>
          <path
            className="a grow-x"
            style={{ animationDelay: `${0.7 + i * 0.28}s`, animationDuration: '0.9s' }}
            d={`M${b.x + b.w / 2},348 L${b.x + b.w / 2 + b.h * 2.6},348 L${b.x + b.w / 2 + b.h * 2.6 - 10},357 L${b.x + b.w / 2 - 6},357 Z`}
            fill={SHADOW}
            opacity={0.85}
          />
          <Boulder x={b.x} w={b.w} h={b.h} />
          <path
            className="a draw"
            style={{ animationDelay: `${2.6 + i * 0.25}s`, animationDuration: '0.7s' }}
            pathLength={1}
            d={`M${b.x - b.w / 2 - 6},356 L${b.x - b.w / 4 - 3},${346 - b.h - 8} L${b.x + b.w / 4 + 3},${346 - b.h * 0.8 - 8} L${b.x + b.w / 2 + 6},356 Z`}
            fill="none"
            stroke={HOT}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        </g>
      ))}
    </Anim>
  )
}

const COLS = 10
const ROWS = 5
const PITCH_X = 64
const PITCH_Y = 50
const GX = 80
const GY = 62
const HAZARDS = new Set(['1,0', '2,0', '6,1', '7,1', '7,2', '3,3', '4,3', '8,4', '0,4', '5,2', '9,1', '2,2'])
const cellCenter = (c: number, r: number) => ({ x: GX + c * PITCH_X + 29, y: GY + r * PITCH_Y + 22 })

function Grid() {
  const cells: ReactNode[] = []
  let n = 0
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const hot = HAZARDS.has(`${c},${r}`)
      const i = n++
      cells.push(
        <rect
          key={`${c},${r}`}
          className={hot ? 'a cell-in cell-hot' : 'a cell-in'}
          style={{ ['--in-delay' as string]: `${(c + r) * 0.05}s`, ['--hot-delay' as string]: `${1.6 + (i % 7) * 0.14}s` }}
          x={GX + c * PITCH_X}
          y={GY + r * PITCH_Y}
          width={58}
          height={44}
          rx={4}
          fill={hot ? HOT : ROCK_DARK}
        />,
      )
    }
  }
  return <>{cells}</>
}

function HazardMap() {
  return (
    <Anim label="The ground is flattened into a map and the cells with boulders or steep slopes turn red">
      <Grid />
    </Anim>
  )
}

function PickSpot() {
  const target = cellCenter(4, 1)
  const a = cellCenter(1, 0)
  const b = cellCenter(7, 2)
  return (
    <Anim label="A target ring hops over hazard cells and settles on the safest cell, then the probe drifts over it">
      <Grid />
      <g transform={`translate(${target.x} ${target.y})`}>
        <g
          className="a hop"
          style={{
            ['--ax' as string]: `${a.x - target.x}px`,
            ['--ay' as string]: `${a.y - target.y}px`,
            ['--bx' as string]: `${b.x - target.x}px`,
            ['--by' as string]: `${b.y - target.y}px`,
          }}
        >
          <circle r={30} fill="none" stroke={INK} strokeWidth={3} />
          <circle r={4} fill={INK} />
        </g>
      </g>
      <g transform={`translate(${target.x} 340)`}>
        <g className="a glide-in" style={{ animationDelay: '3.4s', animationDuration: '1.1s' }}>
          <Probe scale={0.8} />
        </g>
      </g>
    </Anim>
  )
}

/* ---------- the three landings ---------- */

function FiveMetreMarker() {
  return (
    <g>
      <line x1={230} y1={262} x2={570} y2={262} stroke={DIM} strokeWidth={1.5} strokeDasharray="6 6" />
      <text x={580} y={266} fill={DIM} fontSize={13} fontFamily="'Space Mono', monospace">5 m</text>
    </g>
  )
}

function SceneClean() {
  return (
    <Anim label="A probe descends, checks the ground at 5 metres, and touches down on safe ground">
      <Ground />
      <Boulder x={170} w={60} h={28} fill={ROCK_DARK} />
      <Boulder x={640} w={74} h={34} fill={ROCK_DARK} />
      <FiveMetreMarker />
      <ellipse className="a fade" style={{ animationDelay: '2.4s', animationDuration: '0.5s' }} cx={400} cy={349} rx={40} ry={6} fill="none" stroke={BLUE} strokeWidth={2.5} />
      <g transform="translate(400 310)">
        <g className="a drop" style={{ animationDuration: '4.4s' }}>
          <Probe />
        </g>
      </g>
      {[-22, 0, 22].map((dx, i) => (
        <circle key={dx} className="a puff" style={{ animationDelay: '4.3s', ['--dx' as string]: `${dx}px`, animationDuration: `${1.1 + i * 0.1}s` }} cx={400} cy={346} r={9} fill={DIM} opacity={0} />
      ))}
    </Anim>
  )
}

function SceneBackAway() {
  return (
    <Anim label="A boulder sits where the probe would touch, so at 5 metres it fires its thrusters and backs away">
      <Ground />
      <Boulder x={150} w={50} h={22} fill={ROCK_DARK} />
      <Boulder x={400} w={104} h={56} />
      <FiveMetreMarker />
      <ellipse className="a ring-hot" style={{ animationDelay: '2.9s', animationDuration: '0.35s' }} cx={400} cy={349} rx={46} ry={7} fill="none" stroke={HOT} strokeWidth={3} />
      <g transform="translate(400 250)" style={{ ['--flame' as string]: '3.3s' }}>
        <g className="a back-away">
          <Probe flames />
        </g>
      </g>
    </Anim>
  )
}

function SceneOldMap() {
  const cells: ReactNode[] = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const hot = (c === 0 && r === 1) || (c === 4 && r === 0)
      const missed = c === 2 && r === 1
      cells.push(
        <rect
          key={`${c},${r}`}
          className={missed ? 'a cell-hot' : undefined}
          style={missed ? { animationDelay: '6.9s', animationDuration: '0.4s' } : undefined}
          x={590 + c * 36}
          y={26 + r * 28}
          width={30}
          height={22}
          rx={3}
          fill={hot || missed ? HOT : ROCK_DARK}
        />,
      )
    }
  }
  return (
    <Anim label="The ground map is missing a small rock, so the probe lands on it. Replayed with live detection, the rock is outlined and the probe backs away">
      <Ground />
      <Boulder x={150} w={50} h={22} fill={ROCK_DARK} />
      <path className="a rock-flash" style={{ animationDelay: '2.9s', animationDuration: '0.9s' }} d="M376,352 l8,-22 l16,-4 l14,14 l-2,12 z" fill={ROCK} />
      <FiveMetreMarker />
      {cells}
      <rect x={586} y={22} width={186} height={90} rx={4} fill="none" stroke={DIM} strokeWidth={1} />
      <path
        className="a draw"
        style={{ animationDelay: '6.2s', animationDuration: '0.6s' }}
        pathLength={1}
        d="M366,356 L366,318 L434,318 L434,356 Z"
        fill="none"
        stroke={BLUE}
        strokeWidth={3}
      />
      <circle className="a burst" style={{ animationDelay: '2.9s', animationDuration: '0.8s' }} cx={400} cy={346} r={20} fill="none" stroke={HOT} strokeWidth={3} opacity={0} />
      <g transform="translate(400 310)" style={{ ['--flame' as string]: '7.6s' }}>
        <g className="a old-map">
          <Probe flames />
        </g>
      </g>
    </Anim>
  )
}

/* ---------- layout ---------- */

interface BeatProps {
  id?: string
  line: string
  anim: ReactNode
}

function Chapter({ id, line, anim }: BeatProps) {
  return (
    <section className="beat chapter" id={id}>
      <h2>{line}</h2>
      {anim}
    </section>
  )
}

function Scene({ id, title, line, anim, example, onOpen }: { id?: string; title: string; line: string; anim: ReactNode; example: number | null; onOpen: (seed: number) => void }) {
  return (
    <section className="beat beat-scene" id={id}>
      <div className="scene-head">
        <h2>{title}</h2>
        <p className="dim">{line}</p>
        {example !== null && (
          <button type="button" className="ghost" onClick={() => onOpen(example)}>
            See a real one <ArrowRight size={14} />
          </button>
        )}
      </div>
      {anim}
    </section>
  )
}

export default function Story({ examples, onOpen }: { examples: { clean: number | null; back: number | null; old: number | null }; onOpen: (seed: number) => void }) {
  return (
    <div className="story">
      <Chapter id="story" line="The probe looks straight down with a camera." anim={<LookDown />} />
      <Chapter line="Low sun makes every boulder throw a long shadow." anim={<ShadowBoulders />} />
      <Chapter line="Rocks and steep slopes get marked on a map." anim={<HazardMap />} />
      <Chapter line="It picks the safest spot and flies there." anim={<PickSpot />} />
      <Scene id="scenes" title="A clean touchdown" line="Safe ground below, so it touches down." anim={<SceneClean />} example={examples.clean} onOpen={onOpen} />
      <Scene title="Backing away for a reason" line="A boulder sits where it would land, so it backs away." anim={<SceneBackAway />} example={examples.back} onOpen={onOpen} />
      <Scene title="When the map is out of date" line="The map missed a small rock. Live detection would not." anim={<SceneOldMap />} example={examples.old} onOpen={onOpen} />
    </div>
  )
}
