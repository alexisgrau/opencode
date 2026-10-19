import { Extension } from "../sdk"
import en from "./i18n/en"

// Plan panel (OpenCode Custom): shows the project's plan.json, kept by the `plan` tool of the opencode-strata `plan`
// plugin, in a side tab that follows the file live.
export default Extension.define({
  id: "plan",
  i18n: {
    en,
    fr: () => import("./i18n/fr"),
  },
})
