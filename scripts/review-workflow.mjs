export const meta = {
  name: 'site-acceptance-review',
  description:
    'Review binbinbob.work from six angles (hiring reviewer, a11y, performance, mobile, copy, SEO), then adversarially verify every finding',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
};

const CONTEXT = `
You are reviewing a personal portfolio site that has just been redesigned. Facts you need:

- Repo root: /Users/binbin/Desktop/project/self-page
- Next.js 16, React 19, Tailwind v4, next-intl (zh-TW default + en), \`output: 'export'\` to GitHub Pages.
- Built static HTML is in \`out/\` (e.g. out/zh-TW.html, out/zh-TW/about.html, out/zh-TW/work/<slug>.html).
- Screenshots of the real rendered pages are in \`.shots/*.png\` — READ THEM, they are the ground truth for layout.
- You can re-render at will: \`npm run build && node scripts/shots.mjs .shots\`.
- The homepage is now a "projector surface": a fixed lit screen in a dark room, with a dense
  scrolling composition on it (masthead, figures, projects, experience, path, range, picture wall,
  principles, contact). Source: src/components/deck/*, src/components/ui/*, src/styles/projector.css.
- /about, /work, /work/<slug>, /ai keep the older "drafting paper" document style. That contrast is deliberate.
- The picture wall pairs CC0 public-domain paintings (public/memes/, manifest content/art-plates.ts)
  with original Chinese captions (content/captions.ts), re-paired at random per load.

THE OWNER'S GOAL, which is the yardstick for every judgement:
He is a final-year student in Taiwan, currently a full-stack developer at a small company.
He is applying for BACKEND or FULL-STACK engineer roles at larger Taiwanese companies and wants
around NT$60,000/month. The site must make a hiring reviewer conclude, within about thirty seconds,
that he can independently design, build, secure and operate production systems.

Report findings as a JSON array. Each finding: {severity: 'high'|'medium'|'low', area, file, summary,
why_it_matters, suggested_fix}. Be concrete and cite file paths or screenshot names. Do not invent
problems to fill a quota — an empty array is a valid answer. Do not suggest adding claims that are
not already supported by content/projects.ts, and never suggest inflating a number.
`;

const DIMENSIONS = [
  {
    key: 'hiring',
    prompt: `${CONTEXT}

You are a hiring engineering manager at a mid-to-large Taiwanese software company, screening for a
backend/full-stack engineer. You have opened this site for the first time and will spend thirty
seconds before deciding whether to keep reading.

Look at .shots/home-01-top.png first, then the rest of the home-*.png sequence, then
.shots/about.png, .shots/work.png and .shots/case-borrow.png. Read out/zh-TW.txt or out/zh-TW.html
for the actual copy.

Judge: does the first screen make the case? Is the evidence legible and credible? Does anything
read as junior, as over-claiming, or as decoration that gets in the way of the evidence? Is the
picture wall an asset or a liability for this audience? Would you invite this person to interview,
and what specifically would make you more likely to?`,
  },
  {
    key: 'a11y',
    prompt: `${CONTEXT}

Audit accessibility against WCAG 2.2 AA, which is this project's own stated bar.
Check the built HTML in out/ and the components in src/.

Specifically: heading hierarchy on every page type (the homepage was restructured, verify h1/h2
order and that nothing skips a level); colour contrast of the projector palette
(--ink #15120e, --ink-soft #4b4337, --ink-faint #8d8271 on --screen #f4f0e7, and the dark room
chrome rgba(246,242,234,.55) on #0c0a09) — compute the ratios, do not guess; focus visibility on
the new picture-wall links; alt text quality on the artwork images; whether
prefers-reduced-motion genuinely disables the GSAP work in src/components/deck/ProjectorSurface.tsx
(read the code, it branches on the media query); and whether any content is only reachable by
scrolling a transformed/fixed layer.`,
  },
  {
    key: 'perf',
    prompt: `${CONTEXT}

Audit loading performance for a GitHub Pages static site on a mid-range phone over 4G.
Measure, do not speculate: use \`du -sh\` and \`find\` on out/ and public/, and inspect the built
JS chunks.

Known pressure points to quantify: self-hosted CJK webfonts (public/fonts or .next static — the
project previously carried ~10MB across ~223 woff2 files), the newly added GSAP + Motion bundles,
and public/memes/ (roughly 200 WebP files at ~25KB each). The picture wall renders only nine at a
time with loading="lazy" — verify that in the built HTML.

Report what actually threatens LCP and total transfer on the homepage specifically, with numbers,
ranked by impact. Only suggest fixes that keep the design intact.`,
  },
  {
    key: 'mobile',
    prompt: `${CONTEXT}

Audit the small-screen experience. Read .shots/home-mobile.png, then drive it yourself:
write a short Playwright script (playwright is installed; serve out/ the way scripts/shots.mjs does)
to load the homepage at 390x844 and at 320x568, scroll through the whole page, and screenshot at
several depths. Save into .shots/mobile-*.png and read them back.

Check: does the fixed projector screen behave on a phone (src/styles/projector.css has a
max-width:820px branch that flattens it)? Any horizontal overflow? Are the museum labels on the
picture wall readable at that width? Do tap targets reach 44px? Does the nav overlay still work
after the Nav component was refactored to remount on navigation?`,
  },
  {
    key: 'copy',
    prompt: `${CONTEXT}

Audit the Chinese copy in messages/zh-TW.json, content/site.ts, content/captions.ts and the
homepage section strings, for the single complaint that started this redesign: the site read as
AI-generated.

Hunt for: parallel-clause padding, translationese, abstract noun stacks, sentences that state a
virtue instead of an event, and any claim that is vaguer than the underlying fact in
content/projects.ts. Also judge whether the forty captions in content/captions.ts are actually
funny to a Taiwanese engineer, or whether they read as generic programmer humour — name the weak
ones specifically.

Flag anything that over-claims relative to content/projects.ts. The owner is a student; confident
is fine, inflated is not.`,
  },
  {
    key: 'seo',
    prompt: `${CONTEXT}

Audit technical SEO on the built output in out/. The homepage was completely rewritten and the
/architecture and /deck routes were deleted this session — verify nothing dangles.

Check: sitemap.xml entries against the routes that actually exist; canonical and hreflang
(zh-TW/en/x-default) on every page; JSON-LD validity in src/lib/jsonld.tsx against the new homepage
structure; og:title/description/url/image; that the homepage still exposes real text to a crawler
despite being an animated composition (read out/zh-TW.html, not the screenshots); the h1 situation
on the homepage; and any internal link pointing at a route that no longer exists.`,
  },
];

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          area: { type: 'string' },
          file: { type: 'string' },
          summary: { type: 'string' },
          why_it_matters: { type: 'string' },
          suggested_fix: { type: 'string' },
        },
        required: ['severity', 'area', 'summary', 'suggested_fix'],
      },
    },
  },
  required: ['findings'],
};

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    is_real: { type: 'boolean' },
    reasoning: { type: 'string' },
    corrected_severity: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['is_real', 'reasoning'],
};

const results = await pipeline(
  DIMENSIONS,
  (d) => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
  (review, d) =>
    parallel(
      (review.findings ?? []).slice(0, 6).map((f) => () =>
        agent(
          `${CONTEXT}

Adversarially verify this claimed finding. Open the file, the built HTML or the screenshot and
check it yourself. Compute contrast ratios and file sizes rather than trusting the claim.

CLAIM (${f.severity}, ${f.area}): ${f.summary}
FILE: ${f.file ?? 'unspecified'}
WHY IT SUPPOSEDLY MATTERS: ${f.why_it_matters ?? ''}
PROPOSED FIX: ${f.suggested_fix}

Set is_real=false if it is wrong, already handled elsewhere in the codebase, or is a matter of
taste dressed up as a defect. Correct the severity if it was overstated or understated.`,
          { label: `verify:${d.key}:${(f.area ?? 'x').slice(0, 18)}`, phase: 'Verify', schema: VERDICT_SCHEMA }
        ).then((v) => ({ ...f, dimension: d.key, verdict: v }))
      )
    )
);

const all = results.flat().filter(Boolean);
const confirmed = all.filter((f) => f.verdict?.is_real);
const rank = { high: 0, medium: 1, low: 2 };
confirmed.sort(
  (a, b) =>
    rank[a.verdict?.corrected_severity ?? a.severity] - rank[b.verdict?.corrected_severity ?? b.severity]
);

return {
  checked: all.length,
  confirmed: confirmed.length,
  dismissed: all.length - confirmed.length,
  findings: confirmed,
};
