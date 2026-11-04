// Checks every outputs/<slug>/ folder and builds full HTML pages for W3C validation.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMITS = { titleMin: 30, titleMax: 60, metaMin: 120, metaMax: 155 };
const BRAND_SUFFIX = " | Volvo Cars";
const OUT = "outputs";
const BUILD = join(OUT, ".build");
mkdirSync(BUILD, { recursive: true });

let failures = 0;
const fail = (slug, msg) => { failures++; console.error(`FAIL  ${slug}: ${msg}`); };
const warn = (slug, msg) => console.warn(`WARN  ${slug}: ${msg}`);
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").trim() : null);

const localeFor = (slug) => {
  const brief = read(join("briefs", `${slug}.yaml`)) || "";
  const m = brief.match(/^locale:\s*([\w-]+)/m);
  return m ? m[1] : "en";
};
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

for (const slug of readdirSync(OUT)) {
  const dir = join(OUT, slug);
  if (slug.startsWith(".") || !statSync(dir).isDirectory()) continue;

  const title = read(join(dir, "title.txt"));
  const meta = read(join(dir, "meta.txt"));
  const html = read(join(dir, "content.html"));

  if (!title) fail(slug, "missing title.txt");
  else {
    if (title.length < LIMITS.titleMin || title.length > LIMITS.titleMax)
      fail(slug, `title is ${title.length} chars (allowed ${LIMITS.titleMin} to ${LIMITS.titleMax})`);
    if (!title.endsWith(BRAND_SUFFIX)) fail(slug, `title must end with "${BRAND_SUFFIX}"`);
  }

  if (!meta) fail(slug, "missing meta.txt");
  else {
    if (meta.length < LIMITS.metaMin || meta.length > LIMITS.metaMax)
      fail(slug, `meta is ${meta.length} chars (allowed ${LIMITS.metaMin} to ${LIMITS.metaMax})`);
    if (meta.includes('"')) fail(slug, "meta contains double quotes");
  }

  if (!html) { fail(slug, "missing content.html"); continue; }

  const h1s = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1s !== 1) fail(slug, `expected exactly 1 <h1>, found ${h1s}`);

  const levels = [...html.matchAll(/<h([1-6])[\s>]/gi)].map((m) => +m[1]);
  levels.forEach((lvl, i) => { if (i && lvl > levels[i - 1] + 1) fail(slug, `heading skips from h${levels[i - 1]} to h${lvl}`); });

  if (/<img(?![^>]*\salt=)[^>]*>/i.test(html)) fail(slug, "<img> without alt attribute");
  if (/\sstyle=/i.test(html)) fail(slug, "inline style attribute found");
  if (/<(font|center|b|i)[\s>]/i.test(html)) fail(slug, "presentational tag found (font, center, b, i)");
  if (/<(html|head|body)[\s>]/i.test(html)) fail(slug, "content.html must be a fragment, not a full page");
  if (/>\s*click here\s*</i.test(html)) fail(slug, 'link text "click here" is not allowed');

  const todos = (html.match(/<!--\s*TODO/gi) || []).length;
  if (todos) warn(slug, `${todos} TODO(s) to confirm before publishing`);

  // Wrap the fragment in a minimal valid page so the W3C checker can validate it.
  const page = `<!DOCTYPE html>
<html lang="${localeFor(slug)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || "Untitled")}</title>
<meta name="description" content="${esc(meta || "")}">
</head>
<body>
<main>
${html}
</main>
</body>
</html>
`;
  writeFileSync(join(BUILD, `${slug}.html`), page);
  console.log(`OK    ${slug}: built ${join(BUILD, slug + ".html")}`);
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll checks passed");
