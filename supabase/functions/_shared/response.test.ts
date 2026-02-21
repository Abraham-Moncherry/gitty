import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { jsonResponse, errorResponse } from "./response.ts"

Deno.test("jsonResponse", async (t) => {
  await t.step("returns 200 by default", async () => {
    const res = jsonResponse({ ok: true })
    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body, { ok: true })
  })

  await t.step("accepts custom status code", async () => {
    const res = jsonResponse({ created: true }, 201)
    assertEquals(res.status, 201)
  })

  await t.step("includes CORS headers", () => {
    const res = jsonResponse({})
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
    assertEquals(res.headers.get("Content-Type"), "application/json")
  })
})

Deno.test("errorResponse", async (t) => {
  await t.step("wraps message in error object", async () => {
    const res = errorResponse("Not found", 404)
    assertEquals(res.status, 404)
    const body = await res.json()
    assertEquals(body, { error: "Not found" })
  })

  await t.step("includes CORS headers", () => {
    const res = errorResponse("fail", 500)
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
  })
})
