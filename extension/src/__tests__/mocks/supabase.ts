import { vi } from "vitest"

function createQueryBuilder() {
  const builder: any = {
    _response: { data: null, error: null },

    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(function (this: any) {
      return Promise.resolve(this._response)
    }),
    maybeSingle: vi.fn(function (this: any) {
      return Promise.resolve(this._response)
    }),
    then: function (this: any, resolve: Function, reject?: Function) {
      return Promise.resolve(this._response).then(resolve, reject)
    }
  }

  return builder
}

export function createMockSupabaseClient() {
  const queryBuilders = new Map<string, ReturnType<typeof createQueryBuilder>>()

  function getBuilder(table: string) {
    if (!queryBuilders.has(table)) {
      queryBuilders.set(table, createQueryBuilder())
    }
    return queryBuilders.get(table)!
  }

  const mockClient = {
    from: vi.fn((table: string) => getBuilder(table)),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null
      }),
      setSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({
        data: { url: null },
        error: null
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } }
      }),
      refreshSession: vi.fn().mockResolvedValue({ error: null })
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null })
    },

    __setTableResponse(table: string, data: any, error: any = null) {
      const builder = getBuilder(table)
      builder._response = { data, error }
    },

    __reset() {
      queryBuilders.clear()
      vi.mocked(mockClient.from).mockClear()
      mockClient.from.mockImplementation((table: string) => getBuilder(table))
      mockClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      })
    }
  }

  return mockClient
}

export const mockSupabase = createMockSupabaseClient()
