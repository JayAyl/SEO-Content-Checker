# HTML standards (W3C and WCAG 2.2 AA)

Output is an HTML fragment that sits inside the page template's `<main>`. It must pass the W3C Nu HTML Checker with zero errors and zero warnings.

- HTML5 semantic elements only: `section`, `article`, `h1` to `h6`, `p`, `ul`, `ol`, `li`, `dl`, `table`, `figure`, `figcaption`, `a`, `strong`, `em`.
- Exactly one `h1`. Headings in order, never skip a level (h2 then h4 is not allowed).
- Every `section` starts with a heading.
- Every `img` has an `alt` attribute. Decorative images use `alt=""`.
- Tables have `caption`, `thead` and `th` with `scope`.
- No inline styles, no `style` attributes, no `font`, `b`, `i`, `center`, no `div` soup.
- Lowercase tags and attributes, double quoted attribute values, all elements closed properly.
- Links: descriptive text, relative paths for volvocars.com URLs, external links get `rel="noopener"` when using `target="_blank"`.
- Escape `&` as `&amp;` in text and URLs.
- No scripts, no iframes, no empty elements.
- FAQ blocks use `section` with `h2` "Frequently asked questions" and `h3` per question.
