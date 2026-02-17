# Makefile for consequent-postgres
# PostgreSQL event sourcing adapter

# Variables
DOCKER_CONTAINER_NAME = consequent-postgres-test
POSTGRES_VERSION = 16
POSTGRES_USER = consequent
POSTGRES_PASSWORD = pgadmin
POSTGRES_DB = consequent
POSTGRES_PORT = 5431
CONNECTION_STRING = postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:$(POSTGRES_PORT)/$(POSTGRES_DB)

# Colors for help output
CYAN = \033[0;36m
GREEN = \033[0;32m
YELLOW = \033[0;33m
RESET = \033[0m

.PHONY: help
help: ## Show this help message
	@echo "$(CYAN)consequent-postgres - Available Commands$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Docker PostgreSQL:$(RESET)"
	@echo "  Connection: $(CONNECTION_STRING)"
	@echo "  Container:  $(DOCKER_CONTAINER_NAME)"
	@echo ""

.PHONY: install
install: ## Install all dependencies
	@echo "$(CYAN)Installing dependencies...$(RESET)"
	npm install

.PHONY: clean
clean: ## Remove build artifacts and cache files
	@echo "$(CYAN)Cleaning build artifacts...$(RESET)"
	rm -rf dist/
	rm -rf dist-test/
	rm -rf coverage/
	rm -rf .vitest/
	rm -rf node_modules/.cache/
	find . -name "*.tsbuildinfo" -delete
	@echo "$(GREEN)✓ Clean complete$(RESET)"

.PHONY: build
build: ## Build TypeScript to JavaScript
	@echo "$(CYAN)Building TypeScript...$(RESET)"
	npm run build
	@echo "$(GREEN)✓ Build complete$(RESET)"

.PHONY: build-watch
build-watch: ## Build TypeScript in watch mode
	@echo "$(CYAN)Building TypeScript in watch mode...$(RESET)"
	npm run build:watch

.PHONY: typecheck
typecheck: ## Run TypeScript type checking without emitting files
	@echo "$(CYAN)Type checking...$(RESET)"
	npm run typecheck
	@echo "$(GREEN)✓ Type check complete$(RESET)"

.PHONY: lint
lint: ## Run ESLint on source and test files
	@echo "$(CYAN)Linting code...$(RESET)"
	npm run lint
	@echo "$(GREEN)✓ Lint complete$(RESET)"

.PHONY: lint-fix
lint-fix: ## Run ESLint and auto-fix issues
	@echo "$(CYAN)Linting and fixing code...$(RESET)"
	npm run lint:fix
	@echo "$(GREEN)✓ Lint fix complete$(RESET)"

.PHONY: test
test: db-ready ## Run tests (requires PostgreSQL)
	@echo "$(CYAN)Running tests...$(RESET)"
	npm test
	@echo "$(GREEN)✓ Tests complete$(RESET)"

.PHONY: test-watch
test-watch: db-ready ## Run tests in watch mode
	@echo "$(CYAN)Running tests in watch mode...$(RESET)"
	npm run test:watch

.PHONY: test-coverage
test-coverage: db-ready ## Run tests with coverage report
	@echo "$(CYAN)Running tests with coverage...$(RESET)"
	npm run test:coverage
	@echo "$(GREEN)✓ Coverage report generated$(RESET)"
	@echo "$(YELLOW)Open coverage/index.html to view the report$(RESET)"

.PHONY: db-start
db-start: ## Start PostgreSQL Docker container
	@echo "$(CYAN)Starting PostgreSQL container...$(RESET)"
	@if [ "$$(docker ps -aq -f name=$(DOCKER_CONTAINER_NAME))" ]; then \
		if [ "$$(docker ps -q -f name=$(DOCKER_CONTAINER_NAME))" ]; then \
			echo "$(YELLOW)PostgreSQL container already running$(RESET)"; \
		else \
			docker start $(DOCKER_CONTAINER_NAME); \
			echo "$(GREEN)✓ PostgreSQL container started$(RESET)"; \
		fi \
	else \
		docker run -d \
			--name $(DOCKER_CONTAINER_NAME) \
			-e POSTGRES_USER=$(POSTGRES_USER) \
			-e POSTGRES_PASSWORD=$(POSTGRES_PASSWORD) \
			-e POSTGRES_DB=$(POSTGRES_DB) \
			-p $(POSTGRES_PORT):5432 \
			postgres:$(POSTGRES_VERSION); \
		echo "$(GREEN)✓ PostgreSQL container created and started$(RESET)"; \
		sleep 3; \
	fi

.PHONY: db-stop
db-stop: ## Stop PostgreSQL Docker container
	@echo "$(CYAN)Stopping PostgreSQL container...$(RESET)"
	@if [ "$$(docker ps -q -f name=$(DOCKER_CONTAINER_NAME))" ]; then \
		docker stop $(DOCKER_CONTAINER_NAME); \
		echo "$(GREEN)✓ PostgreSQL container stopped$(RESET)"; \
	else \
		echo "$(YELLOW)PostgreSQL container is not running$(RESET)"; \
	fi

.PHONY: db-restart
db-restart: db-stop db-start ## Restart PostgreSQL Docker container
	@echo "$(GREEN)✓ PostgreSQL container restarted$(RESET)"

.PHONY: db-remove
db-remove: db-stop ## Remove PostgreSQL Docker container
	@echo "$(CYAN)Removing PostgreSQL container...$(RESET)"
	@if [ "$$(docker ps -aq -f name=$(DOCKER_CONTAINER_NAME))" ]; then \
		docker rm $(DOCKER_CONTAINER_NAME); \
		echo "$(GREEN)✓ PostgreSQL container removed$(RESET)"; \
	else \
		echo "$(YELLOW)PostgreSQL container does not exist$(RESET)"; \
	fi

.PHONY: db-logs
db-logs: ## Show PostgreSQL container logs
	@echo "$(CYAN)PostgreSQL logs (Ctrl+C to exit):$(RESET)"
	docker logs -f $(DOCKER_CONTAINER_NAME)

.PHONY: db-shell
db-shell: ## Open PostgreSQL shell (psql)
	@echo "$(CYAN)Opening PostgreSQL shell...$(RESET)"
	@docker exec -it $(DOCKER_CONTAINER_NAME) \
		psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

.PHONY: db-ready
db-ready: db-start ## Wait for PostgreSQL to be ready
	@echo "$(CYAN)Waiting for PostgreSQL to be ready...$(RESET)"
	@timeout=30; \
	counter=0; \
	until docker exec $(DOCKER_CONTAINER_NAME) pg_isready -U $(POSTGRES_USER) > /dev/null 2>&1; do \
		if [ $$counter -ge $$timeout ]; then \
			echo "$(YELLOW)⚠ PostgreSQL did not become ready in time$(RESET)"; \
			exit 1; \
		fi; \
		counter=$$((counter + 1)); \
		sleep 1; \
	done; \
	echo "$(GREEN)✓ PostgreSQL is ready$(RESET)"

.PHONY: db-reset
db-reset: db-remove db-start db-ready ## Reset PostgreSQL (remove and recreate)
	@echo "$(GREEN)✓ PostgreSQL reset complete$(RESET)"

.PHONY: db-info
db-info: ## Show PostgreSQL connection information
	@echo "$(CYAN)PostgreSQL Connection Information:$(RESET)"
	@echo "  Host:       localhost"
	@echo "  Port:       $(POSTGRES_PORT)"
	@echo "  Database:   $(POSTGRES_DB)"
	@echo "  User:       $(POSTGRES_USER)"
	@echo "  Password:   $(POSTGRES_PASSWORD)"
	@echo ""
	@echo "  Connection String:"
	@echo "  $(CONNECTION_STRING)"
	@echo ""
	@echo "  Container:  $(DOCKER_CONTAINER_NAME)"
	@if [ "$$(docker ps -q -f name=$(DOCKER_CONTAINER_NAME))" ]; then \
		echo "  Status:     $(GREEN)Running$(RESET)"; \
	else \
		echo "  Status:     $(YELLOW)Not running$(RESET)"; \
	fi

.PHONY: ci
ci: clean install typecheck lint build test-coverage ## Run full CI pipeline
	@echo "$(GREEN)✓ CI pipeline complete$(RESET)"

.PHONY: dev
dev: db-start install build ## Setup development environment
	@echo "$(GREEN)✓ Development environment ready$(RESET)"
	@echo "$(YELLOW)Run 'make test-watch' to start testing$(RESET)"

.PHONY: publish-check
publish-check: clean build ## Check what will be published
	@echo "$(CYAN)Checking package contents...$(RESET)"
	npm pack --dry-run
	@echo ""
	@echo "$(YELLOW)Files that will be published:$(RESET)"
	@npm pack --dry-run 2>&1 | grep -E '^\s+[0-9]' || true

.PHONY: all
all: clean install typecheck lint build test-coverage ## Build and test everything
	@echo "$(GREEN)✓ All tasks complete$(RESET)"

# Default target
.DEFAULT_GOAL := help
