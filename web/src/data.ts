import { useEffect, useState } from 'react'
import type { IndexEntry, LandingPoint, Replay, Site, Summary } from './types'

const base = import.meta.env.BASE_URL

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${base}data/${path}`)
    if (!r.ok) return null
    return (await r.json()) as T
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
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    Promise.all([
      getJson<Site>('site.json'),
      getJson<IndexEntry[]>('index.json'),
      getJson<Summary>('summary.json'),
      getJson<LandingPoint[]>('landings.json'),
    ]).then(([s, i, su, l]) => {
      setSite(s)
      setIndex(i ?? [])
      setSummary(su)
      setLandings(l ?? [])
      setLoaded(true)
    })
  }, [])
  return { site, index, summary, landings, loaded }
}

export function useReplay(id: string | null) {
  const [replay, setReplay] = useState<Replay | null>(null)
  useEffect(() => {
    setReplay(null)
    if (id) getJson<Replay>(`replays/${id}.json`).then(setReplay)
  }, [id])
  return replay
}
