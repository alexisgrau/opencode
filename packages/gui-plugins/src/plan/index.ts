import { builtinCatalog } from "@opencode/plugin/gui/builtin"
import { Plugin } from "@opencode/plugin/gui"
import en from "./i18n/en"

// Plan panel (OpenCode Custom): shows the project's plan.json, kept by the `plan` tool of the opencode-strata `plan`
// plugin, in a side tab that follows the file live.
export default Plugin.define({
  i18n: builtinCatalog({
    en,
    fr: () => import("./i18n/fr"),
  }),
})
