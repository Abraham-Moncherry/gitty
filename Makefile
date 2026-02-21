# Gitty — Development Makefile
# Usage: make setup    (first time)
#        make dev      (daily driver — starts everything)
#        make test     (run all tests)

.PHONY: setup dev stop ext-dev ext-build ext-test db-start db-stop db-reset \
        db-status db-studio fn-serve fn-deploy test logs help

# ─── First-time setup ────────────────────────────────────────────────────────

setup: ## Install deps + start Supabase + apply migrations
	@echo "==> Installing extension dependencies..."
	cd extension && bun install
	@echo "==> Starting Supabase (DB + Auth + Edge Functions)..."
	supabase start
	@echo ""
	@echo "==> Done! Run 'make dev' to start developing."
	@echo "    Supabase Studio: http://localhost:54323"
	@echo ""

# ─── Daily dev ────────────────────────────────────────────────────────────────

dev: ## Start Supabase + extension dev server + edge functions
	@echo "==> Starting Supabase..."
	@supabase start 2>/dev/null || true
	@echo "==> Starting edge functions + extension in parallel..."
	@trap 'kill 0' EXIT; \
		supabase functions serve --env-file supabase/.env & \
		(cd extension && bun run dev) & \
		wait

stop: ## Stop all services
	@echo "==> Stopping Supabase..."
	supabase stop
	@echo "==> Done."

# ─── Extension ────────────────────────────────────────────────────────────────

ext-dev: ## Start extension dev server only
	cd extension && bun run dev

ext-build: ## Production build of extension
	cd extension && bun run build

ext-test: ## Run extension unit tests (Vitest)
	cd extension && bun run test

ext-test-watch: ## Run extension tests in watch mode
	cd extension && bun run test:watch

ext-test-coverage: ## Run extension tests with coverage
	cd extension && bun run test:coverage

# ─── Database ─────────────────────────────────────────────────────────────────

db-start: ## Start local Supabase stack
	supabase start

db-stop: ## Stop local Supabase stack
	supabase stop

db-reset: ## Reset DB: drop all tables and re-run migrations
	supabase db reset

db-status: ## Show Supabase service URLs and status
	supabase status

db-studio: ## Open Supabase Studio in browser
	@echo "Opening http://localhost:54323..."
	@open http://localhost:54323

db-migrate: ## Create a new migration file (usage: make db-migrate name=add_foo)
	supabase migration new $(name)

# ─── Edge Functions ───────────────────────────────────────────────────────────

fn-serve: ## Serve edge functions locally (hot reload)
	supabase functions serve --env-file supabase/.env

fn-deploy: ## Deploy all edge functions to Supabase (production)
	supabase functions deploy sync-commits
	supabase functions deploy backfill-history
	supabase functions deploy calculate-leaderboard

# ─── Testing ──────────────────────────────────────────────────────────────────

test: ext-test ## Run all tests
	@echo ""
	@echo "==> All tests passed."

# ─── Utilities ────────────────────────────────────────────────────────────────

logs: ## Tail Supabase edge function logs
	supabase functions logs --scroll

clean: ## Remove build artifacts
	rm -rf extension/build extension/.plasmo extension/coverage

# ─── Manual testing helpers ───────────────────────────────────────────────────

sync: ## Manually trigger sync-commits (needs JWT)
	@echo "Usage: make sync JWT=<your-jwt>"
	@test -n "$(JWT)" || (echo "Error: pass JWT=<token>" && exit 1)
	curl -s -X POST http://localhost:54321/functions/v1/sync-commits \
		-H "Authorization: Bearer $(JWT)" \
		-H "Content-Type: application/json" | python3 -m json.tool

backfill: ## Manually trigger backfill-history (needs JWT)
	@echo "Usage: make backfill JWT=<your-jwt>"
	@test -n "$(JWT)" || (echo "Error: pass JWT=<token>" && exit 1)
	curl -s -X POST http://localhost:54321/functions/v1/backfill-history \
		-H "Authorization: Bearer $(JWT)" \
		-H "Content-Type: application/json" | python3 -m json.tool

# ─── Help ─────────────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
