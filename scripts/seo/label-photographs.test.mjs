import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attemptReserveUsd, buildRequest, csvCell, extractPhotoLinks, maxAttempts,
  model, pilotSize, previewUrl, renderReview, reserveAttempt, selectPilot,
  usageCost, validateDraft,
} from "./label-photographs.mjs";

const draft = {
  title: "Yellow foliage against blue sky",
  description: "An upward view of yellow foliage and dark branches against blue sky.",
  altText: "Yellow leaves and dark branches against blue sky.",
  filenameSuggestion: "yellow-foliage-blue-sky.jpg",
  uncertainties: [],
};
const urls = Array.from({ length: 272 }, (_, index) => `https://elliotmairet.com/gallery/photo-${index}.jpg`);
urls[34] = "https://elliotmairet.com/gallery/R1-03624-0035.JPG";
urls[265] = "https://elliotmairet.com/gallery/IMG_4295%204.jpg";

test("public links are deduplicated without changing encoded filenames or case", () => {
  const links = extractPhotoLinks('<a href="/gallery/R1.JPG"><img></a><a href="/gallery/name%204.jpg"><img></a><a href="/gallery/R1.JPG"></a><a href="https://elsewhere.test/x"></a>');
  assert.deepEqual(links, ["https://elliotmairet.com/gallery/R1.JPG", "https://elliotmairet.com/gallery/name%204.jpg"]);
});

test("pilot is exactly 20 distinct spread-out photos including recent, old and filename cases", () => {
  const selected = selectPilot(urls);
  assert.equal(selected.length, 20);
  assert.equal(new Set(selected.map((photo) => photo.pageUrl)).size, 20);
  for (const index of [0, 1, 2, 3, 34, 265, 270, 271]) assert.ok(selected.some((photo) => photo.pageUrl === urls[index]));
  assert.deepEqual(selected.map((photo) => photo.archivePosition), selected.map((photo) => photo.archivePosition).sort((a, b) => a - b));
  assert.throws(() => selectPilot(urls.slice(0, 19)), /scope review/);
});

test("downloads only bounded public project transforms, never pending or unrelated objects", () => {
  const url = new URL(previewUrl("https://images.dextery.dev/elliotmairet/uploads/photo.jpg?width=5120"));
  assert.equal(url.searchParams.get("width"), "1200");
  assert.equal(url.searchParams.get("format"), "auto");
  for (const unsafe of ["https://evil.test/a.jpg", "https://images.dextery.dev/other/a.jpg", "https://images.dextery.dev/elliotmairet/uploads/%5Fpending/a.jpg"]) {
    assert.throws(() => previewUrl(unsafe));
  }
});

test("structured drafts reject unexpected fields, unsafe paths and markup", () => {
  assert.deepEqual(validateDraft(draft), draft);
  assert.throws(() => validateDraft({ ...draft, execute: "anything" }));
  assert.throws(() => validateDraft({ ...draft, filenameSuggestion: "../original.jpg" }));
  assert.throws(() => validateDraft({ ...draft, altText: "<img src=x>" }));
  assert.throws(() => validateDraft({ ...draft, altText: "x".repeat(181) }));
});

test("API request sends JPEG bytes only with storage off, no tools and bounded tokens", () => {
  const request = buildRequest(Buffer.from("fake test JPEG"));
  assert.equal(request.model, model);
  assert.equal(request.store, false);
  assert.equal(request.max_output_tokens, 1024);
  assert.equal(request.tools, undefined);
  assert.equal(request.input[0].content[1].detail, "high");
  assert.match(request.input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
  assert.equal(request.text.format.strict, true);
  assert.doesNotMatch(JSON.stringify(request), /sourceImageUrl|OPENAI_API_KEY|SUPABASE/);
});

test("budget is reserved before requests, including failures and retries", () => {
  const ledger = { attempts: [] };
  const first = reserveAttempt(ledger, { pageUrl: urls[0] }, attemptReserveUsd);
  assert.equal(first.status, "pending");
  first.status = "http_error";
  assert.throws(() => reserveAttempt(ledger, { pageUrl: urls[1] }, attemptReserveUsd), /budget/);
  reserveAttempt(ledger, { pageUrl: urls[0] }, 5).status = "http_error";
  assert.throws(() => reserveAttempt(ledger, { pageUrl: urls[0] }, 5), /Per-photo/);
  assert.ok(pilotSize * maxAttempts * attemptReserveUsd < 5);
});

test("uncertain requests and total request ceiling prevent blind paid replays", () => {
  const ledger = { attempts: [{ pageUrl: urls[0], status: "uncertain" }] };
  assert.throws(() => reserveAttempt(ledger, { pageUrl: urls[0] }, 5), /reconcile/);
  assert.throws(() => reserveAttempt({ attempts: Array(40).fill({ status: "http_error" }) }, { pageUrl: urls[0] }, 5), /request ceiling/);
});

test("failed earlier-run reservations remain inside the same approved ceiling", () => {
  const ledger = { priorRunReservedUsd: 4.98, attempts: [] };
  assert.throws(() => reserveAttempt(ledger, { pageUrl: urls[0] }, 5), /budget/);
  const earlier = { priorRunReservedUsd: 0.06, attempts: [{ pageUrl: urls[0], status: "http_error", reservedUsd: 0.06 }] };
  assert.throws(() => reserveAttempt(earlier, { pageUrl: urls[1] }, 0.16), /budget/);
});

test("usage estimates count all input conservatively and reject missing usage", () => {
  assert.equal(usageCost({ input_tokens: 1_000_000, output_tokens: 1_000_000 }), 10);
  assert.equal(usageCost({ input_tokens: -1, output_tokens: 10 }), null);
  assert.equal(usageCost(null), null);
});

test("CSV escapes quotes, newlines and spreadsheet formulas", () => {
  assert.equal(csvCell('A "quoted" title'), '"A ""quoted"" title"');
  assert.equal(csvCell("=SUM(A1:A2)"), '"\'=SUM(A1:A2)"');
  assert.equal(csvCell("Two\nlines"), '"Two\nlines"');
});

test("local review escapes generated text and makes approval status explicit", () => {
  const html = renderReview({ model }, [{ fields: { ...draft, title: "<script>bad</script>" }, pageUrl: urls[0], status: "unreviewed", previewFile: "previews/01.jpg" }], { attempts: [] });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /not approved or published/);
  assert.match(html, /default-src 'none'/);
});
