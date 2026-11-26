import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

import { createColourSelectionFixture } from "./test-colour-selection-browser.mjs";

let fixture;
let browser;
const blocked = [];
const screenshots = process.env.COLOUR_TEST_SCREENSHOTS;
try {
  fixture = await createColourSelectionFixture();
  browser = await chromium.launch({ timeout: 15_000 });
  console.log(`Colour browser: Chromium ${browser.version()}; fixture ${fixture.url}`);
  if (screenshots) await mkdir(screenshots, { recursive: true });
  for (const reducedMotion of ["reduce", "no-preference"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 }, reducedMotion,
      serviceWorkers: "block", acceptDownloads: false,
    });
    try {
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin === fixture.url && ["/", "/fixture.js", "/fixture.css"].includes(url.pathname)) {
          await route.continue();
        } else {
          blocked.push(route.request().url());
          await route.abort("blockedbyclient");
        }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5_000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(fixture.url, { waitUntil: "load", timeout: 10_000 });
      await page.waitForFunction(() => window.testResults, undefined, { timeout: 30_000 });
      const results = await page.evaluate(() => window.testResults);
      assert.equal(results.failed, undefined, JSON.stringify(results, null, 2));
      assert.ok(results.passed > 0, "Mounted suite must run assertions");
      console.log(`${reducedMotion}: ${results.passed} mounted assertions passed`);

      await page.evaluate(() => window.colourFixture.preview("error"));
      await page.locator("#root nav button").first().focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      const retry = page.locator("#root button[aria-disabled]");
      assert.equal(await retry.evaluate(button => document.activeElement === button), true, "Tab reaches Retry");
      assert.equal(await retry.evaluate(button => getComputedStyle(button).outlineStyle), "solid", "Keyboard focus has visible outline");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Space");
      assert.equal(await retry.getAttribute("aria-disabled"), "true");
      assert.equal(await retry.evaluate(button => document.activeElement === button), true, "Pending Retry retains focus");
      assert.equal(await page.evaluate(() => window.colourFixture.requests()), 2, "Repeated native keyboard Retry is suppressed");
      await page.evaluate(() => window.colourFixture.resolve());
      await page.waitForSelector("#root [aria-busy=false]");
      console.log(`${reducedMotion}: native keyboard Retry, focus and duplicate suppression passed`);

      for (const { width, textPercent } of [
        { width: 320, textPercent: 100 },
        { width: 1280, textPercent: 100 },
        { width: 320, textPercent: 200 },
      ]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(percent => { document.documentElement.style.fontSize = percent + "%"; }, textPercent);
        for (const state of ["loading", "error", "empty", "stale"]) {
          await page.evaluate(state => window.colourFixture.preview(state), state);
          const geometry = await page.evaluate(() => {
            const status = document.querySelector("#root [role=status]");
            const button = document.querySelector("#root button[aria-disabled]");
            const bounds = status.getBoundingClientRect();
            return {
              overflow: document.documentElement.scrollWidth > innerWidth,
              contained: bounds.left >= 0 && bounds.right <= innerWidth,
              fontSize: parseFloat(getComputedStyle(status).fontSize),
              buttonHeight: button?.getBoundingClientRect().height,
              buttonWidth: button?.getBoundingClientRect().width,
              photoPresent: Boolean(document.querySelector("#root figure img")),
              statuses: document.querySelectorAll("#root [role=status]").length,
              unexpected: window.colourFixture.unexpectedFetches,
            };
          });
          assert.equal(geometry.overflow, false, `${state}: no overflow at ${width}px/${textPercent}% text`);
          assert.equal(geometry.contained, true);
          assert.equal(geometry.photoPresent, true);
          assert.equal(geometry.statuses, 1);
          assert.ok(geometry.fontSize >= 14);
          if (state === "error" || state === "stale") {
            assert.ok(geometry.buttonHeight >= 44 && geometry.buttonWidth >= 44, "Retry has a sufficiently sized target");
          }
          assert.deepEqual(geometry.unexpected, []);
          if (screenshots && reducedMotion === "reduce") {
            await page.screenshot({ path: join(screenshots, `${state}-${width}-${textPercent}.png`), fullPage: true });
          }
        }
      }
      assert.deepEqual(errors, [], "No uncaught browser errors");
      assert.deepEqual(blocked, [], "No unexpected runtime network requests (blocked before sending)");
      console.log(`${reducedMotion}: loading/error/empty/stale at 320px, desktop and 200% text passed`);
    } finally {
      await context.close();
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // Cleanup also runs on suite failure, timeout and failed browser launch.
  try { await browser?.close(); } finally { await fixture?.close(); }
}
