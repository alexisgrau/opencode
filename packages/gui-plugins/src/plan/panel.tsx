import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Option, Schema } from "effect"
import { ScrollView } from "@opencode/ui/scroll-view"
import { createKeyed, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type definition from "./index"
import { active, ACTIVE, count, DONE, updated, type PlanModel, type Task } from "./model"

// Folded and unfolded tasks per project, kept in this window's storage. A missing id takes the default: a parent step
// is unfolded unless done, and a task's details show only while it is in progress.
const storageKey = (directory: string) => `opencode.plan.folds:${directory}`

const Folds = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Boolean))

function loadFolds(directory: string) {
  try {
    return {
      ...Option.getOrElse(
        Schema.decodeUnknownOption(Folds)(localStorage.getItem(storageKey(directory)) ?? "{}"),
        () => ({}),
      ),
    }
  } catch {
    return {}
  }
}

const status = (t: Task) => (t.statut === DONE ? "done" : t.statut === ACTIVE ? "active" : "todo")

const marker = (t: Task) => (t.statut === DONE ? "[x]" : t.statut === ACTIVE ? "[>]" : "[ ]")

const hasDetail = (t: Task) => !!(t.description || t.preuve || t.agents?.length || t.historique.length > 1)

export default function PlanPanel(props: { plan: PlanModel; session: MountedSession }) {
  const ctx = usePlugin<typeof definition>()
  const state = () => props.plan.state(props.session)
  const directory = () => props.session.directory
  // Changed folds per project directory; a project not changed in this window reads its stored folds.
  const [changed, setChanged] = createStore<Record<string, Record<string, boolean>>>({})
  const folds = createMemo(() => changed[directory()] ?? loadFolds(directory()))
  let list: HTMLDivElement | undefined

  const unfolded = (t: Task) => {
    const stored = folds()[t.id]

    if (stored !== undefined) return stored

    return t.sous_etapes.length ? t.statut !== DONE : t.statut === ACTIVE
  }

  const toggle = (t: Task) => {
    const next = { ...folds(), [t.id]: !unfolded(t) }
    setChanged(directory(), next)

    try {
      localStorage.setItem(storageKey(directory()), JSON.stringify(next))
    } catch {}
  }

  const tasks = () => state().plan?.etapes ?? []
  const totals = createMemo(() => count(tasks()))
  const current = createMemo(() => active(tasks()))
  const date = createMemo(() => updated(tasks()))

  // Bring the task in progress into view when it changes.
  createKeyed(
    () => current()[0],
    (id) =>
      queueMicrotask(() =>
        list?.querySelector(`[data-task="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" }),
      ),
  )

  const Row = (rowProps: { task: Task }) => {
    const t = () => rowProps.task
    const openable = () => t().sous_etapes.length > 0 || hasDetail(t())
    const open = () => openable() && unfolded(t())

    const agent = () =>
      t().statut === ACTIVE && !t().sous_etapes.length && t().agents?.length
        ? t().agents![t().agents!.length - 1]
        : undefined

    return (
      <div data-slot="plan-task" data-status={status(t())} data-current={current().includes(t().id) || undefined}>
        <div
          data-slot="plan-row"
          data-task={t().id}
          data-openable={openable() || undefined}
          onClick={() => openable() && toggle(t())}
        >
          <span data-slot="plan-fold">{openable() ? (open() ? "▾" : "▸") : ""}</span>
          <span data-slot="plan-marker">{marker(t())}</span>
          <span data-slot="plan-id">{t().id}</span>
          <span data-slot="plan-title">{t().titre}</span>
          <Show when={agent()}>{(name) => <span data-slot="plan-agent">{name()}</span>}</Show>
        </div>
        <Show when={open() && hasDetail(t())}>
          <div data-slot="plan-detail">
            <Show when={t().description}>
              <div>
                <b>{ctx.t("field.description")} : </b>
                {t().description}
              </div>
            </Show>
            <Show when={t().preuve}>
              <div>
                <b>{ctx.t("field.proof")} : </b>
                {t().preuve}
              </div>
            </Show>
            <Show when={t().agents?.length}>
              <div>
                <b>{ctx.t("field.agents")} : </b>
                {t().agents!.join(", ")}
              </div>
            </Show>
            <Show when={t().historique.length > 1}>
              <div>
                <b>{ctx.t("field.history")} : </b>
                {t()
                  .historique.slice(-3)
                  .map((e) => e.evenement)
                  .join(" → ")}
              </div>
            </Show>
          </div>
        </Show>
        <Show when={open() && t().sous_etapes.length}>
          <div data-slot="plan-children">
            <For each={t().sous_etapes}>{(child) => <Row task={child} />}</For>
          </div>
        </Show>
      </div>
    )
  }

  return (
    <div data-component="plan-panel" class="flex h-full min-h-0 flex-col bg-v2-background-bg-base">
      <Show
        when={state().plan}
        fallback={
          <div class="px-5 py-4 text-13-regular text-v2-text-text-muted">
            <Show when={state().error} fallback={state().loaded ? ctx.t("empty") : ""}>
              {(error) => ctx.t("invalid", { error: error() })}
            </Show>
          </div>
        }
      >
        <div data-slot="plan-header">
          <span data-slot="plan-count">{ctx.t("count", { done: totals()[0], total: totals()[1] })}</span>
          <div data-slot="plan-bar">
            <div style={{ width: `${totals()[1] ? Math.round((100 * totals()[0]) / totals()[1]) : 0}%` }} />
          </div>
          <Show when={date()}>
            {(value) => <span data-slot="plan-count">{ctx.t("updated", { date: value() })}</span>}
          </Show>
        </div>
        <ScrollView class="relative min-h-0 flex-1">
          <div ref={list} data-slot="plan-list">
            <Show when={tasks().length} fallback={<div class="text-v2-text-text-muted">{ctx.t("no.steps")}</div>}>
              <For each={tasks()}>{(t) => <Row task={t} />}</For>
            </Show>
          </div>
        </ScrollView>
      </Show>
    </div>
  )
}
