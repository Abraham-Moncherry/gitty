import { describe, it, expect, vi } from "vitest"

const { mockCreateClient } = vi.hoisted(() => {
  const mockCreateClient = vi.fn().mockReturnValue({
    auth: {},
    from: vi.fn(),
    functions: {}
  })
  return { mockCreateClient }
})

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient
}))

// Import triggers module execution, which calls createClient
import "~lib/supabase"

describe("supabase client", () => {
  it("should create a Supabase client with correct URL and anon key", () => {
    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://test-project.supabase.co",
      "test-anon-key",
      expect.any(Object)
    )
  })

  it("should have autoRefreshToken enabled", () => {
    const options = mockCreateClient.mock.calls[0][2]
    expect(options.auth.autoRefreshToken).toBe(true)
  })

  it("should have persistSession enabled", () => {
    const options = mockCreateClient.mock.calls[0][2]
    expect(options.auth.persistSession).toBe(true)
  })

  it("should have detectSessionInUrl disabled", () => {
    const options = mockCreateClient.mock.calls[0][2]
    expect(options.auth.detectSessionInUrl).toBe(false)
  })

  it("should use a custom storage adapter", () => {
    const options = mockCreateClient.mock.calls[0][2]
    expect(options.auth.storage).toBeDefined()
    expect(typeof options.auth.storage.getItem).toBe("function")
    expect(typeof options.auth.storage.setItem).toBe("function")
    expect(typeof options.auth.storage.removeItem).toBe("function")
  })

  describe("chromeStorageAdapter", () => {
    it("getItem should read from chrome.storage.local", async () => {
      const adapter = mockCreateClient.mock.calls[0][2].auth.storage
      await adapter.getItem("test-key")
      expect(chrome.storage.local.get).toHaveBeenCalledWith("test-key")
    })

    it("getItem should return null when key does not exist", async () => {
      const adapter = mockCreateClient.mock.calls[0][2].auth.storage
      const result = await adapter.getItem("nonexistent")
      expect(result).toBeNull()
    })

    it("setItem should write to chrome.storage.local", async () => {
      const adapter = mockCreateClient.mock.calls[0][2].auth.storage
      await adapter.setItem("key", "value")
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ key: "value" })
    })

    it("removeItem should remove from chrome.storage.local", async () => {
      const adapter = mockCreateClient.mock.calls[0][2].auth.storage
      await adapter.removeItem("key")
      expect(chrome.storage.local.remove).toHaveBeenCalledWith("key")
    })
  })
})
