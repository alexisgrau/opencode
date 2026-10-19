// OpenCode Custom: the browser's storage on disk, shared by every conversation of the desktop's own server, like the
// windows of one browser profile. Cookies, logins and site data survive conversation switches and restarts. A remote
// server keeps a private in-memory partition per attachment, as upstream.
//
// Everything lives in this file so that upstream changes to pane.ts and network.ts meet only their call sites:
// - pane.ts: `browserPartition` names the partition, `guardFiles` installs the file:// guard;
// - network.ts: `directNetwork` replaces the server tunnel for the shared partition.
import { session, type WebContents } from "electron"
import { fileURLWithin } from "./policy"

export const SHARED_PARTITION = "persist:opencode-browser"

/** The partition of a new attachment: the shared one for the desktop's own server, else upstream's private one. */
export function browserPartition(server: { readonly sameMachine: boolean }, upstream: string) {
  return server.sameMachine ? SHARED_PARTITION : upstream
}

/**
 * Navigation guards cover documents; subresources (img, script, fetch) also must not read file: URLs outside the
 * roots. A private partition belongs to one attachment, which checks its own roots, as upstream. The shared partition
 * has one listener for every conversation (a new one replaces the last), which checks the roots of the conversation
 * whose page made the request; a request no page owns reads no file.
 */
export function guardFiles(input: {
  readonly partition: string
  readonly binding: string
  readonly handles: ReadonlyMap<string, { readonly pages: ReadonlyMap<number, { readonly contents: WebContents }> }>
  readonly roots: (binding: string) => ReadonlyArray<string>
}) {
  const shared = input.partition === SHARED_PARTITION

  const owner = (webContentsId: number | undefined) => {
    if (webContentsId === undefined) return undefined

    for (const [binding, handle] of input.handles)
      for (const page of handle.pages.values()) {
        try {
          if (!page.contents.isDestroyed() && page.contents.id === webContentsId) return binding
        } catch {}
      }

    return undefined
  }

  session.fromPartition(input.partition).webRequest.onBeforeRequest({ urls: ["file://*/*"] }, (details, callback) => {
    const binding = shared ? owner(details.webContentsId) : input.binding

    callback({ cancel: binding === undefined || !fileURLWithin(details.url, input.roots(binding)) })
  })
}

/**
 * The network of an attachment on the shared partition. The desktop's own server runs on this machine, so pages
 * connect directly instead of through its tunnel, and the attachment leaves the partition's proxy and connections
 * alone: other conversations use them too.
 */
export function directNetwork(partition: string) {
  const storage = session.fromPartition(partition)

  return {
    attach(_contents: WebContents) {
      return () => {}
    },
    /** Fetches a page icon as the page loaded it; undefined for anything but a small image, or after 5 seconds. */
    icon: async (url: string): Promise<{ mime: string; data: Buffer } | undefined> => {
      try {
        const response = await storage.fetch(url, { signal: AbortSignal.timeout(5_000) })
        const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? ""

        if (response.status !== 200 || !mime.startsWith("image/")) return undefined
        const data = Buffer.from(await response.arrayBuffer())

        return data.length > MAX_ICON_BYTES ? undefined : { mime, data }
      } catch {
        return undefined
      }
    },
  }
}

/** As network.ts: sites list a favicon of a few kilobytes. */
const MAX_ICON_BYTES = 256 * 1024
