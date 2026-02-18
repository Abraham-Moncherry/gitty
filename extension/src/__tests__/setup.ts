import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

afterEach(() => {
  cleanup()
})

// ── Chrome API mocks ─────────────────────────────────────────

const storageMock: Record<string, unknown> = {}

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        if (typeof keys === "string") {
          return { [keys]: storageMock[keys] ?? undefined }
        }
        const result: Record<string, unknown> = {}
        for (const key of keys) {
          result[key] = storageMock[key] ?? undefined
        }
        return result
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(storageMock, items)
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const keyArr = typeof keys === "string" ? [keys] : keys
        for (const key of keyArr) {
          delete storageMock[key]
        }
      }),
      clear: vi.fn(async () => {
        Object.keys(storageMock).forEach((k) => delete storageMock[k])
      })
    }
  },
  identity: {
    getRedirectURL: vi.fn(() => "https://test.chromiumapp.org/"),
    launchWebAuthFlow: vi.fn()
  },
  alarms: {
    create: vi.fn(),
    onAlarm: { addListener: vi.fn() }
  },
  notifications: {
    create: vi.fn()
  },
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`)
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn()
  }
} as unknown as typeof chrome

export function resetChromeStorage() {
  Object.keys(storageMock).forEach((k) => delete storageMock[k])
  ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockClear()
  ;(chrome.storage.local.set as ReturnType<typeof vi.fn>).mockClear()
  ;(chrome.storage.local.remove as ReturnType<typeof vi.fn>).mockClear()
}
