# Volvo Cars Content Agents

A library of AI agents that turn a content brief into a title tag, meta description and page content in valid W3C HTML. One set of rules, used by every tool.

## How it works

```
shared/            Rules every agent follows (brand voice, SEO, HTML standards)
agents/            One AGENT.md per job. This is the single source of truth.
briefs/            Content briefs (YAML). One file per page.
outputs/<slug>/    title.txt, meta.txt, content.html
scripts/           Automated checks
.github/prompts/   Copilot wrappers      (/title-tag, /meta-description, /page-content, /review)
.gemini/commands/  Gemini CLI wrappers   (/volvo:title, /volvo:meta, /volvo:content, /volvo:review)
.claude/agents/    Claude Code subagents
AGENTS.md          Generic instructions for any agent that reads AGENTS.md
```

The wrappers contain no rules of their own. They point at `agents/` and `shared/`, so you change a rule once and every tool picks it up.

## Workflow

1. Copy `briefs/_template.yaml` to `briefs/<slug>.yaml` and fill it in.
2. Create a branch: `content/<slug>`.
3. Run the agents in your tool of choice:
   - Copilot (VS Code): open the brief, run `/title-tag`, `/meta-description`, `/page-content`, then `/review`.
   - Gemini CLI: `/volvo:title briefs/<slug>.yaml` and so on.
   - Claude Code: "Use volvo-page-content on briefs/<slug>.yaml".
4. Commit `outputs/<slug>/` and open a pull request.
5. The `validate` workflow checks lengths, heading order, alt text and runs the W3C Nu HTML Checker. It must pass before merge.

## Run with the Copilot coding agent

Custom Copilot agents live in `.github/agents/`. The main one is `volvo-content`, which runs all four steps, runs `npm test` and opens a PR.

1. Commit a brief to `briefs/`.
2. New issue > *Content request*, put the brief path in.
3. Assign the issue to Copilot and pick **volvo-content** from the agent dropdown. Or comment `@copilot use the volvo-content agent on this`.
4. Review the PR. Comment `@copilot` with changes.

`.github/workflows/copilot-setup-steps.yml` installs Node and Java so the agent can run the W3C checker.

## Run the agents in GitHub Actions

The `generate` workflow runs title, meta, content and reviewer agents, fixes any HTML that fails the W3C checker (up to 2 rounds), then opens a pull request.

**One time setup**
1. Settings > Actions > General > Workflow permissions: tick *Allow GitHub Actions to create and approve pull requests*.
2. Choose a provider:
   - `github` (default): GitHub Models, uses the built in token, no API key needed.
   - `copilot`: GitHub Copilot CLI, uses a Copilot licence. Add secret `COPILOT_PAT` (fine grained PAT with the *Copilot Requests* permission, from a user with a Copilot seat).
   - `gemini`: add secret `GEMINI_API_KEY`.
   - `claude`: add secret `ANTHROPIC_API_KEY`.
3. Optional: set repo variables `PROVIDER` and `MODEL` to change the defaults.

**Running it**
- Automatic: commit a new or changed brief to `main`.
- By hand: Actions > generate > Run workflow. Pick briefs and provider, or leave briefs blank to run every brief with no outputs yet.

Each run writes `outputs/<slug>/review.md` with the title and meta options, fix rounds, TODOs and the review checklist.

PRs opened by the workflow do not trigger the `validate` workflow (a GitHub rule for the built in token). The same checks run inside `generate` and show in its log. To get `validate` on the PR too, close and reopen the PR, or swap the token for a GitHub App token.

Test the pipeline without any API: `PROVIDER=mock npm run generate briefs/example-ex30.yaml`

## Run checks locally

```
npm install
npm run check     # lengths, structure, builds full HTML pages into outputs/.build
npm run w3c       # W3C Nu HTML Checker (needs Java 11+)
npm run lint      # html-validate, including accessibility rules
```

## Changing the rules

- Brand voice: `shared/volvo-voice.md` (replace the placeholder sections with the official Volvo Cars guidelines)
- SEO limits: `shared/seo-rules.md` and the numbers at the top of `scripts/check.mjs`
- HTML: `shared/html-standards.md` and `.htmlvalidate.json`

Tag a release (`v1.1.0` etc.) whenever agent rules change, and note it in `CHANGELOG.md`, so you can trace which rule version produced which page.

## Data note

Keep this repo private. Only put brief content in it that Volvo is happy to share with the AI tools you use.
