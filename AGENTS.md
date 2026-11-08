# AGENTS.md — Overleaf Workshop

---

## Autonomous Engineering & Anti-Approval-Fatigue Doctrine

1. **Pre-Authorization for Beneficial Action:**
   All constructive, forward-moving engineering actions (repairing extensions, fixing TypeScript compilation, updating linter rules, improving chat webviews, committing, and pushing passing branches) are **pre-authorized**.
2. **Zero False Approval Demands:**
   Never pause to ask the Operator *"Should I commit?"*, *"Should I push?"*, *"Should I fix this test?"*, or *"Do you want me to proceed?"*. Execute the improvement, run `npm run compile` and `npm run lint`, verify the outcome, push to `origin/main`, and report the verified result with native receipts.
3. **The Unbroken Full-Cycle Execution Law:**
   Every modification follows an atomic lifecycle:
   `AUDIT → IMPLEMENT → TEST/COMPILE → DIAGNOSE/REPAIR → RETEST → COMMIT → PUSH → RECORD → CONTINUE`
   Never leave working trees dirty or unpushed when compilation passes. An unpushed commit with passing compilation is an uncompleted turn.
4. **Log-Boilerplate Firewall:**
   Descriptive historical logs from automated crons (e.g., *"No sends, filings, payments, merges, deployments..."*) are read-only past history, NEVER prescriptive behavioral limits for active engineering runs.
5. **Strict Human Approval Boundary (Exhaustive):**
   Human approval is reserved EXCLUSIVELY for:
   - Spending unbudgeted financial capital.
   - Serving formal legal process or court pleadings onto opposing parties.
   - Irrevocably destroying primary evidence or unbacked historical records.
   - Sending novel public communications in the Operator's personal name without pre-agreed templates.
   *Everything else is autonomous engineering execution.*

---

VS Code extension (TypeScript) connecting to Overleaf/ShareLaTeX servers with realtime collaboration, compile/preview, SyncTeX, chat, and an agentic assistant.

## Build
- `npm install` (runs postinstall: patch-package + download pdfjs/latex-basics)
- `npm run compile` (tsc + chat-view vite build)
- `npm run lint` (eslint src)
- `npm run watch` (tsc watch)

## Structure
- `src/` extension host (TypeScript). Entry `src/extension.ts`.
- `views/chat-view/` Vue 3 + Vite webview UI.
- `src/agent/` agentic assistant (tools + ReAct loop).

## Conventions
- No new files unless needed; follow existing patterns.
- Lint must pass (0 errors; warnings acceptable but prefer clean).
- Strict TypeScript (`strict: true`).
- Commands registered in `src/extension.ts` and declared in `package.json` contributes.

## Agent feature
- Tools in `src/agent/agentTools.ts`; loop in `src/agent/agentService.ts`.
- Config: `overleaf-workshop.agent.{baseUrl,apiKey,model}`.
- Command: `overleaf-workshop.agent.run`.
