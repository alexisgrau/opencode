import { onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { createKeyed, type MountedSession, type SetupContext } from "../sdk"
import type definition from "./index"

// plan.json as the opencode-strata `plan` tool writes it (plugins/plan/regles.ts). Only the plugin writes the file;
// the panel reads it and never changes it.
export type Task = {
  id: string
  titre: string
  description?: string
  statut: string
  preuve?: string
  agents?: string[]
  historique: { date: string; evenement: string }[]
  sous_etapes: Task[]
}

export type Plan = { etapes: Task[] }

export const DONE = "fait"
export const ACTIVE = "en cours"

/** What the panel knows of a session's plan.json. */
export type PlanState = {
  /** The first read has finished. */
  loaded: boolean
  /** The parsed plan, undefined when the file is missing or unreadable. */
  plan?: Plan
  /** Why an existing plan.json could not be parsed. */
  error?: string
}

const FILE = "plan.json"
// Reads while a plan exists; a missing file is checked less often.
const PRESENT_MS = 1000
const ABSENT_MS = 3000

function task(raw: Record<string, unknown>): Task {
  return {
    id: String(raw.id ?? ""),
    titre: String(raw.titre ?? ""),
    ...(raw.description ? { description: String(raw.description) } : {}),
    statut: String(raw.statut ?? "à faire"),
    ...(raw.preuve ? { preuve: String(raw.preuve) } : {}),
    ...(Array.isArray(raw.agents) && raw.agents.length ? { agents: raw.agents.map(String) } : {}),
    historique: Array.isArray(raw.historique) ? (raw.historique as Task["historique"]) : [],
    sous_etapes: Array.isArray(raw.sous_etapes) ? (raw.sous_etapes as Record<string, unknown>[]).map(task) : [],
  }
}

export function parsePlan(text: string): Plan {
  const raw = JSON.parse(text) as Record<string, unknown>
  return { etapes: Array.isArray(raw?.etapes) ? (raw.etapes as Record<string, unknown>[]).map(task) : [] }
}

/** Leaf tasks done and in total. */
export function count(tasks: readonly Task[]): [number, number] {
  return tasks.reduce<[number, number]>(
    ([done, total], t) => {
      if (!t.sous_etapes.length) return [done + (t.statut === DONE ? 1 : 0), total + 1]
      const [d, n] = count(t.sous_etapes)
      return [done + d, total + n]
    },
    [0, 0],
  )
}

/** Ids of the leaf tasks in progress, in plan order. */
export function active(tasks: readonly Task[], into: string[] = []): string[] {
  for (const t of tasks) {
    if (!t.sous_etapes.length && t.statut === ACTIVE) into.push(t.id)
    active(t.sous_etapes, into)
  }
  return into
}

/** The latest history date in the plan, the time of its last change. */
export function updated(tasks: readonly Task[]): string | undefined {
  let last: string | undefined
  const walk = (list: readonly Task[]) =>
    list.forEach((t) => {
      t.historique.forEach((e) => {
        if (e.date && (!last || e.date > last)) last = e.date
      })
      walk(t.sous_etapes)
    })
  walk(tasks)
  return last
}

/**
 * Follows the routed session's plan.json: reads it every second while it exists, every few seconds otherwise. The
 * desktop server does not watch workspace files, and the plugin writes the file directly, so reading is the only way
 * to see changes. The first time a session's plan is found, the Plan tab opens once.
 */
export function createPlanModel(ctx: SetupContext<typeof definition>) {
  const [states, setStates] = createStore<Record<string, PlanState>>({})
  const raw = new Map<string, string>()
  const opened = new Set<string>()
  const key = `${ctx.id}:main`

  const read = async (session: MountedSession) => {
    const text = await session.server.client.file
      .read({ path: FILE, location: { directory: session.directory } })
      .then((bytes) => new TextDecoder().decode(bytes))
      .catch(() => undefined)

    if (text === undefined) {
      raw.delete(session.key)
      setStates(session.key, reconcile({ loaded: true }))
      return false
    }

    if (raw.get(session.key) === text) return true
    raw.set(session.key, text)

    try {
      setStates(session.key, reconcile({ loaded: true, plan: parsePlan(text) }))
    } catch (error) {
      setStates(session.key, reconcile({ loaded: true, error: (error as Error).message }))
    }

    if (!opened.has(session.key)) {
      opened.add(session.key)
      if (ctx.layout.state(key, session) === "closed")
        ctx.layout.open(key, session, { tab: "select", background: true })
    }

    return true
  }

  // One read loop per routed session visit; it ends when another session is routed.
  createKeyed(
    () => ctx.sessions.current(),
    (session) => {
      let stopped = false
      let timer: ReturnType<typeof setTimeout> | undefined

      const tick = async () => {
        const present = await read(session)

        if (!stopped) timer = setTimeout(tick, present ? PRESENT_MS : ABSENT_MS)
      }

      void tick()
      onCleanup(() => {
        stopped = true
        clearTimeout(timer)
      })
    },
  )

  return {
    key,
    state: (session: { key: string }): PlanState => states[session.key] ?? { loaded: false },
    open: (session: MountedSession) => ctx.layout.open(key, session, { tab: "select" }),
  }
}

export type PlanModel = ReturnType<typeof createPlanModel>
