# Contributing to polyg-mcp

## Branching Strategy

```
main (protected) ← Production-ready
  │
  └── develop ← Integration branch
        │
        ├── feature/* ← New features
        ├── fix/* ← Bug fixes
        └── docs/* ← Documentation
```

## PR Workflow

**All changes go through PRs — no direct commits to `main` or `develop`.**

1. Create branch from `develop`: `git checkout -b feature/your-feature`
2. Make changes, ensure tests pass: `pnpm test:coverage` (≥80%)
3. Push and create PR to `develop`
4. After review/approval, squash and merge

## Commit Convention

```
feat(scope): description   # New feature
fix(scope): description    # Bug fix
docs(scope): description   # Documentation
test(scope): description   # Tests
chore(scope): description  # Maintenance
```

## Test Requirements

- Coverage must be ≥80%
- Run `pnpm test:coverage` before PR
