import { createMemo, lazy, onCleanup, Suspense } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import {
  Command,
  MenuItem,
  Panel,
  Style,
  type MenuItem as MenuItemType,
  type PanelTab,
  type Plugin,
} from "@opencode/plugin/gui"
import { onIdle } from "@opencode/plugin/gui/builtin"
import type definition from "./index"
import { count, createPlanModel } from "./model"
import css from "./plan.css?inline"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const PlanPanel = lazy(() => import("./panel"))
  onCleanup(onIdle(() => void PlanPanel.preload()))
  ctx.add(Style, css)

  const plan = createPlanModel(ctx)
  const sessions = ctx.sessions
  const mounted = createMemo(() => !!sessions.current())

  // One tab object for every session; its label reads the routed session from its state.
  const tab: PanelTab = {
    id: "main",
    get title() {
      return ctx.t("tab.title")
    },
    label: (state) => {
      const totals = () => {
        const tasks = plan.state(state.session).plan?.etapes

        return tasks ? count(tasks) : undefined
      }

      return (
        <div class="flex min-w-0 items-center gap-1.5">
          <Icon name="checklist" size="small" />
          <span class="truncate">{ctx.t("tab.title")}</span>
          {totals() && (
            <span class="text-v2-text-text-muted">
              {totals()![0]}/{totals()![1]}
            </span>
          )}
        </div>
      )
    },
  }

  ctx.add(Panel, {
    id: "main",
    region: "side",
    list: (input) => (input.open.includes("main") ? [tab] : []),
    render: (props) => (
      <Suspense>
        <PlanPanel plan={plan} session={props.session} />
      </Suspense>
    ),
  })

  // The + menu before the side tabs.
  ctx.add(MenuItem, (): MenuItemType | undefined => {
    const session = sessions.current()

    if (!session) return undefined

    return {
      menu: "session.panel",
      id: "open",
      title: ctx.t("menu.open"),
      icon: "checklist",
      order: 30,
      run: () => plan.open(session),
    }
  })

  ctx.add(
    Command,
    (): Command => ({
      id: "open",
      title: ctx.t("command.title"),
      description: ctx.t("command.description"),
      group: ctx.t("tab.title"),
      section: "session",
      slash: { name: "open-plan" },
      enabled: mounted(),
      run: () => {
        const session = sessions.current()

        if (session) plan.open(session)
      },
    }),
  )
}

export default setup
