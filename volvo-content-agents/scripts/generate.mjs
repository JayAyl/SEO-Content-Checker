// Runs the agent pipeline for one or more briefs:
// title -> meta -> content (with automatic fix loop) -> review.
// Usage: node scripts/generate.mjs briefs/a.yaml [briefs/b.yaml ...]
// Env:   PROVIDER = github | copilot | gemini | claude | mock   (default: github)
//        MODEL    = optional model override
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PROVIDER = process.env.PROVIDER || "github";
const MAX_FIX_ROUNDS = 2;
const DEFAULT_MODELS = { github: "openai/gpt-4.1", copilot: "", gemini: "gemini-2.5-pro", claude: "claude-sonnet-5-5", mock: "mock" };
const MODEL = process.env.MODEL || DEFAULT_MODELS[PROVIDER];

const read = (p) => readFileSync(p, "utf8");
const shared = ["volvo-voice", "seo-rules", "html-standards"].map((f) => read(`shared/${f}.md`)).join("\n\n");

const PIPELINE_NOTE = `
You are running inside an automated GitHub Actions pipeline.
Ignore any instruction about writing files or showing things in chat.
Return ONLY a JSON object in the exact shape requested. No markdown fences, no extra text.`;

function systemFor(agent) {
  return `${read(`agents/${agent}/AGENT.md`)}\n\n# Rules\n${shared}\n${PIPELINE_NOTE}`;
}

// ---------- providers ----------
async function callModel(system, user) {
  if (PROVIDER === "mock") return mock(system);
  if (PROVIDER === "copilot") return parse(copilotCli(system, user), "copilot");
  let res, text;
  if (PROVIDER === "github") {
    res = await fetch("https://models.github.ai/inference/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    const j = await res.json();
    text = j.choices?.[0]?.message?.content;
  } else if (PROVIDER === "gemini") {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    const j = await res.json();
    text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("");
  } else if (PROVIDER === "claude") {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, messages: [{ role: "user", content: user }] }),
    });
    const j = await res.json();
    text = j.content?.filter((b) => b.type === "text").map((b) => b.text).join("");
  } else throw new Error(`Unknown PROVIDER "${PROVIDER}"`);

  if (!res.ok || !text) throw new Error(`${PROVIDER} API error ${res.status}: ${JSON.stringify(text ?? "").slice(0, 500)}`);
  return parse(text, PROVIDER);
}

function parse(text, source) {
  const clean = text.replace(/^```(json)?\s*|\s*```$/g, "").trim();
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  try { return JSON.parse(clean.slice(start, end + 1)); }
  catch { throw new Error(`${source} did not return valid JSON: ${clean.slice(0, 300)}`); }
}

// GitHub Copilot CLI in programmatic mode. No tools allowed: it only answers the prompt.
// Needs COPILOT_GITHUB_TOKEN (a PAT with the "Copilot Requests" permission from a user with a Copilot licence).
function copilotCli(system, user) {
  const args = ["-p", `${system}\n\n---\n\n${user}`, "-s", "--no-ask-user"];
  if (MODEL) args.push("--model", MODEL);
  const r = spawnSync("copilot", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, env: process.env });
  if (r.error) throw new Error(`copilot CLI not found or failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`copilot CLI exited ${r.status}: ${(r.stderr || r.stdout).slice(0, 500)}`);
  return r.stdout;
}

// Offline dry run so the pipeline can be tested without API keys.
function mock(system) {
  if (system.includes("Title tag writer")) return { options: [], chosen: "Volvo EX30 Electric SUV | Volvo Cars", reason: "mock" };
  if (system.includes("Meta description writer")) return { options: [], chosen: "Discover the Volvo EX30, a small electric SUV made for city life and built with recycled materials. Book a test drive at your nearest retailer." };
  if (system.includes("Page content writer")) return { html: "<h1>Volvo EX30 electric SUV</h1>\n<p>Mock content.</p>", word_count: 3, todos: [] };
  return { summary: "Mock review", checks: [{ check: "All", result: "Pass", note: "mock" }], fixes: [] };
}

// ---------- checks ----------
function runChecks(slug) {
  const r = spawnSync("node", ["scripts/check.mjs"], { encoding: "utf8" });
  const errors = (r.stderr || "").split("\n").filter((l) => l.startsWith(`FAIL  ${slug}:`)).map((l) => l.replace(`FAIL  ${slug}: `, ""));
  const jar = "node_modules/vnu-jar/build/dist/vnu.jar";
  const page = join("outputs", ".build", `${slug}.html`);
  if (existsSync(jar) && existsSync(page)) {
    const v = spawnSync("java", ["-jar", jar, "--Werror", "--format", "text", page], { encoding: "utf8" });
    if (v.status !== 0) errors.push(...(v.stderr || "").split("\n").filter((l) => /^(Error|Warning):/.test(l)).map((l) => `W3C ${l}`));
  }
  return errors;
}

// ---------- pipeline ----------
async function runBrief(briefPath) {
  const brief = read(briefPath);
  const slug = (brief.match(/^slug:\s*([\w-]+)/m) || [])[1];
  if (!slug) throw new Error(`${briefPath}: missing slug`);
  const dir = join("outputs", slug);
  mkdirSync(dir, { recursive: true });
  const log = [`# Agent run: ${slug}`, `Provider: ${PROVIDER} (${MODEL || "default model"})`, ""];
  console.log(`\n=== ${slug} (${PROVIDER} / ${MODEL || "default model"}) ===`);

  const title = await callModel(systemFor("title-tag"),
    `Brief:\n${brief}\n\nReturn {"options":[{"title":"","chars":0}],"chosen":"","reason":""}`);
  writeFileSync(join(dir, "title.txt"), title.chosen.trim() + "\n");
  log.push("## Title options", ...(title.options || []).map((o) => `- ${o.title} (${o.title?.length} chars)`), `Chosen: **${title.chosen}**. ${title.reason || ""}`, "");

  const meta = await callModel(systemFor("meta-description"),
    `Brief:\n${brief}\n\nChosen title: ${title.chosen}\n\nReturn {"options":[{"meta":"","chars":0}],"chosen":""}`);
  writeFileSync(join(dir, "meta.txt"), meta.chosen.trim() + "\n");
  log.push("## Meta options", ...(meta.options || []).map((o) => `- ${o.meta} (${o.meta?.length} chars)`), `Chosen: **${meta.chosen}**`, "");

  let content = await callModel(systemFor("page-content"),
    `Brief:\n${brief}\n\nReturn {"outline":[""],"html":"","word_count":0,"todos":[""]}`);
  writeFileSync(join(dir, "content.html"), content.html.trim() + "\n");

  for (let round = 1; round <= MAX_FIX_ROUNDS; round++) {
    const errors = runChecks(slug);
    if (!errors.length) break;
    console.log(`Fix round ${round}: ${errors.length} issue(s)`);
    log.push(`## Fix round ${round}`, ...errors.map((e) => `- ${e}`), "");
    content = await callModel(systemFor("page-content"),
      `Brief:\n${brief}\n\nCurrent HTML:\n${content.html}\n\nThese automated checks failed:\n${errors.join("\n")}\n\nFix every issue without changing the meaning. Return {"html":"","word_count":0,"todos":[""]}`);
    writeFileSync(join(dir, "content.html"), content.html.trim() + "\n");
  }
  const remaining = runChecks(slug);
  log.push("## Content", `Word count: ${content.word_count ?? "n/a"}`, `TODOs: ${(content.todos || []).filter(Boolean).join("; ") || "none"}`,
    `Automated checks: ${remaining.length ? "FAILING\n" + remaining.map((e) => `- ${e}`).join("\n") : "passing"}`, "");

  const review = await callModel(systemFor("reviewer"),
    `Brief:\n${brief}\n\nTitle: ${title.chosen}\nMeta: ${meta.chosen}\nHTML:\n${content.html}\n\nReturn {"summary":"","checks":[{"check":"","result":"Pass|Fail","note":""}],"fixes":[""]}`);
  log.push("## Review", review.summary || "", "", "| Check | Result | Note |", "|---|---|---|",
    ...(review.checks || []).map((c) => `| ${c.check} | ${c.result} | ${c.note} |`), "",
    "### Fixes", ...(review.fixes || []).filter(Boolean).map((f) => `- ${f}`));
  writeFileSync(join(dir, "review.md"), log.join("\n") + "\n");

  return remaining.length === 0;
}

const briefs = process.argv.slice(2).filter((p) => !p.endsWith("_template.yaml"));
if (!briefs.length) { console.log("No briefs to process."); process.exit(0); }

let allPassed = true;
for (const b of briefs) {
  try { if (!(await runBrief(b))) allPassed = false; }
  catch (e) { console.error(`ERROR ${b}: ${e.message}`); allPassed = false; }
}
writeFileSync("outputs/.run-status", allPassed ? "passing" : "needs attention");
console.log(`\nDone: ${allPassed ? "all checks passing" : "some briefs need attention, see review.md"}`);
