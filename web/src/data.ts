import { useEffect, useState } from 'react'
import type { IndexEntry, LandingPoint, Replay, Site, Summary } from './types'

const base = import.meta.env.BASE_URL

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${base}data/${path}`)
    if (!r.ok) return null
    const json = (await r.json()) as T
    if (import.meta.env.DEV) {
      // break-ui worst-case data, dev server only (see lib/worstCase.ts); removed from the production bundle
      const { applyFixture, currentFixture } = await import('./lib/worstCase')
      const fx = currentFixture()
      if (fx) return applyFixture(path, json, fx) as T
    }
    return json
  } catch {
    return null
  }
}

export function dataUrl(path: string): string {
  return `${base}data/${path}`
}

export function useStatic() {
  const [site, setSite] = useState<Site | null>(null)
  const [index, setIndex] = useState<IndexEntry[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [landings, setLandings] = useState<LandingPoint[]>([])
  const [pictures, setPictures] = useState<Set<number>>(new Set())
  const [pictureDetector, setPictureDetector] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    Promise.all([
      getJson<Site>('site.json'),
      getJson<IndexEntry[]>('index.json'),
      getJson<Summary>('summary.json'),
      getJson<LandingPoint[]>('landings.json'),
      getJson<{ seeds: number[]; detector: boolean }>('pictures.json'),
    ]).then(([s, i, su, l, pic]) => {
      setPictures(new Set(pic?.seeds ?? []))
      setPictureDetector(!!pic?.detector)
      setSite(s)
      setIndex(i ?? [])
      setSummary(su)
      setLandings(l ?? [])
      setLoaded(true)
    })
  }, [])
  return { site, index, summary, landings, pictures, pictureDetector, loaded }
}

export function useReplay(id: string | null) {
  const [replay, setReplay] = useState<Replay | null>(null)
  useEffect(() => {
    setReplay(null)
    if (id) getJson<Replay>(`replays/${id}.json`).then(setReplay)
  }, [id])
  return replay
}
