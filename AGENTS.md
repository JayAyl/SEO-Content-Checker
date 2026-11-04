# Instructions for AI agents in this repo

This repo produces SEO content for volvocars.com from content briefs.

Before writing anything, read:
- shared/volvo-voice.md
- shared/seo-rules.md
- shared/html-standards.md

Then follow the agent file for the task:
- Title tag: agents/title-tag/AGENT.md
- Meta description: agents/meta-description/AGENT.md
- Page content: agents/page-content/AGENT.md
- Quality review: agents/reviewer/AGENT.md

Inputs live in briefs/<slug>.yaml. Write outputs to outputs/<slug>/.
Never invent facts, prices, ranges, specs or safety claims. If the brief does not supply a fact, leave a TODO comment instead.
