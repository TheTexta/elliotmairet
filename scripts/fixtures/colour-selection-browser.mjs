// Serialized into the isolated browser bundle, never executed by Node.
export function runColourSelectionTests(require) {
  const React = require("react");
  const { createRoot } = require("react-dom/client");
  const { flushSync } = require("react-dom");
  const root = createRoot(document.getElementById("root"));
  const other = createRoot(document.getElementById("other"));
  const palette = ["#111111", "#ffffff"];
  const dark = { hex: palette[0], lightness: 0.1, axisA: 0, axisB: 0, featureSpace: "oklab" };
  const light = { ...dark, hex: palette[1], lightness: 0.9 };
  const photo = (filename, colours = [dark, light]) => ({
    filename, width: 300, height: 200, year: "2026", imageUrl: "/synthetic.jpg", palette: colours,
  });
  const catalogue = (sourceColours = [dark, light]) => [
    photo("first.jpg", sourceColours), photo("independent.jpg"), photo("next.jpg"),
    ...Array.from({ length: 80 }, (_, index) => photo("dark-" + index + ".jpg", [dark])),
    ...Array.from({ length: 80 }, (_, index) => photo("light-" + index + ".jpg", [light])),
  ];
  let Selection, requests;
  const unexpectedFetches = [];
  window.fetch = (url, options) => {
    if (url !== "/api/gallery/palettes") {
      unexpectedFetches.push(String(url));
      return Promise.reject(Error("Unexpected fixture fetch"));
    }
    return new Promise((resolve, reject) => requests.push({ resolve, reject, options }));
  };
  const observers = [];
  window.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(predicate, message) {
    for (let index = 0; index < 150; index++) {
      if (predicate()) return;
      await wait(10);
    }
    throw Error(message);
  }
  const node = (selector, id = "root") => document.querySelector("#" + id + " " + selector);
  const hero = (id = "root") => node("figure button", id);
  const swatch = (index, id = "root") => node("nav", id).querySelectorAll("button")[index];
  const retry = (id = "root") => node("button[aria-disabled]", id);
  const feedback = (id = "root") => node("[role=status]", id)?.textContent;
  const matches = (id = "root") => JSON.parse(node("[data-matches]", id)?.dataset.matches || "[]");
  const hasColourMatches = colour => matches().some(name => name.startsWith(colour + "-")) &&
    !matches().some(name => name.startsWith((colour === "dark" ? "light" : "dark") + "-"));
  const click = element => flushSync(() => element.click());
  function reset() {
    flushSync(() => { root.render(null); other.render(null); });
    Selection = require.freshSelection();
    requests = [];
  }
  function mount(filename = "first.jpg", target = root, colours = palette) {
    flushSync(() => target.render(React.createElement(Selection, {
      key: filename, currentFilename: filename, palette: colours,
    }, React.createElement("img", {
      alt: "server photograph child", width: 600, height: 400,
      style: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
      src: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#ddd"/><path d="M0 400 250 100 600 400" fill="#666"/></svg>'),
    }))));
  }
  const resolve = (index, data = catalogue()) => requests[index].resolve(Response.json(data));
  const ready = async (id = "root") => {
    await wait(0); // Let updates scheduled by passive effects leave the old DOM.
    await until(() => node("[aria-busy=false]", id) && !retry(id), "Gallery did not settle");
  };
  const failed = (id = "root") => until(() => retry(id) && retry(id).getAttribute("aria-disabled") === "false", "Failure did not expose Retry");
  const checks = [];
  function check(value, message) { if (!value) throw Error(message); checks.push(message); }

  // Used by the owning runner for real keyboard input, responsive checks and
  // screenshots after the asynchronous scheduling suite completes.
  window.colourFixture = {
    requests: () => requests.length,
    resolve: () => resolve(requests.length - 1),
    async preview(state) {
      reset(); mount();
      if (state === "loading") return;
      if (state === "empty") { resolve(0, [photo("first.jpg")]); await ready(); return; }
      if (state === "stale") {
        click(swatch(0)); resolve(0, catalogue([dark])); await ready();
        click(swatch(1)); await failed(); return;
      }
      requests[0].reject(Error("synthetic offline"));
      await failed();
    },
    unexpectedFetches,
  };

  (async () => {
    reset(); mount();
    check(hero().disabled, "Hero starts disabled");
    check(node("img").alt === "server photograph child", "Server photograph survives initial loading");
    check(feedback() === "Finding similar photographs…", "Slow initial fetch exposes polite pending feedback");
    check(node("[role=status]").getAttribute("aria-atomic") === "true" && !node("[role=alert]"), "Feedback uses one atomic polite status, not duplicate alerts");
    click(swatch(0));
    check(!hero().disabled, "Swatches and hero remain usable during loading");
    check(swatch(0).getAttribute("aria-pressed") === "true", "Swatch reflects sole selected hex");
    mount("independent.jpg", other);
    check(hero("other").disabled, "Independent selection owner stays unfiltered");
    check(requests.length === 1, "Pending catalogue deduplicates across mounted owners");
    check(!requests[0].options?.signal, "Individual cancellation does not own the shared fetch signal");
    resolve(0); await ready(); await ready("other");
    check(hasColourMatches("dark"), "Real matcher uses selected swatch");
    check(matches().length === 36, "Initial results retain 36-item pagination");
    const observer = observers.find(value => !value.disconnected);
    check(observer.options.rootMargin === "1000px 0px", "Pagination retains 1000px observer threshold");
    flushSync(() => observer.callback([{ isIntersecting: true }]));
    check(matches().length === 72, "Observer reveals next 36 results");
    click(hero()); await ready();
    check(hero().disabled && swatch(0).getAttribute("aria-pressed") === "false", "Hero resets selection and pressed state together");
    check(matches().includes("independent.jpg"), "Reset restores full-palette matching");
    click(swatch(0)); await wait(10); click(swatch(1)); await ready();
    check(hasColourMatches("light"), "Cancelled fade cannot overwrite latest selection");
    click(swatch(0)); await wait(10); mount("next.jpg"); await ready();
    check(hero().disabled, "Keyed navigation resets hero before stale fade completes");
    check(!matches().includes("next.jpg") && matches().includes("first.jpg"), "Unmount cancels previous photograph fade");
    check(requests.length === 1, "Navigation reuses validated successful catalogue");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    check(Number(swatch(0).dataset.motionDuration) === (reduced ? 0 : 0.36), "Swatches preserve reduced-motion duration");
    check(getComputedStyle(node("[aria-busy]")).transitionProperty === (reduced ? "none" : "opacity"), "Gallery preserves reduced-motion CSS");

    for (const [label, failRequest] of [
      ["HTTP 500", request => request.resolve(new Response("", { status: 500 }))],
      ["rejected fetch", request => request.reject(Error("offline"))],
      ["invalid JSON", request => request.resolve(new Response("{", { headers: { "Content-Type": "application/json" } }))],
      ["malformed 2xx", request => request.resolve(Response.json([{ ...photo("first.jpg"), palette: [{ hex: "#111111" }] }]))],
      ["invalid matching result", request => request.resolve(Response.json(catalogue([dark])))],
    ]) {
      reset(); mount(); click(swatch(1));
      failRequest(requests[0]); await failed();
      check(feedback() === "Similar photographs could not be loaded.", label + " exposes useful failure");
      check(swatch(1).getAttribute("aria-pressed") === "true", label + " preserves selected swatch");
      const button = retry();
      button.focus(); click(button); click(button);
      check(button.getAttribute("aria-disabled") === "true" && button.textContent === "Trying again…", label + " retry exposes disabled pending control");
      check(document.activeElement === button, label + " retry retains keyboard focus");
      check(requests.length === 2, label + " repeated Retry starts exactly one fresh request");
      resolve(1); await ready();
      check(hasColourMatches("light"), label + " explicit Retry recovers through real matcher");
      check(swatch(1).getAttribute("aria-pressed") === "true", label + " recovery does not replace selected swatch");
    }

    reset(); mount(); click(swatch(0));
    resolve(0, catalogue([dark])); await ready();
    const previous = JSON.stringify(matches());
    click(swatch(1)); await failed();
    check(JSON.stringify(matches()) === previous, "Matching failure keeps usable grid and pagination");
    check(feedback().includes("could not be updated") && feedback().includes("Previous results are still shown"), "Changed-selection failure explicitly identifies stale results");
    check(swatch(1).getAttribute("aria-pressed") === "true", "Stale grid does not reset selection");
    click(retry());
    check(feedback().includes("Previous results are still shown") && JSON.stringify(matches()) === previous, "Retry keeps previous grid and announces its stale condition");
    resolve(1); await ready();
    check(hasColourMatches("light"), "Retry refreshes settled valid but stale catalogue after null match");
    check(requests.length === 2 && requests[1].options.cache === "no-cache", "Recovery revalidates browser cache with one fresh GET");

    reset(); mount(); click(swatch(0)); resolve(0, catalogue([dark])); await ready();
    const beforeFailedRetry = JSON.stringify(matches());
    click(swatch(1)); await failed(); click(retry());
    requests[1].reject(Error("refresh offline")); await failed();
    check(JSON.stringify(matches()) === beforeFailedRetry && feedback().includes("Previous results"), "Failed refresh keeps previous grid with explicit stale feedback");
    check(swatch(1).getAttribute("aria-pressed") === "true", "Failed refresh keeps selected swatch");
    click(retry()); resolve(2); await ready();
    check(hasColourMatches("light") && requests.length === 3, "A second explicit Retry recovers retained results with one additional request");

    reset(); mount(); mount("independent.jpg", other);
    requests[0].reject(Error("offline")); await failed(); await failed("other");
    click(retry()); click(retry("other"));
    check(requests.length === 2, "Concurrent mounted retries deduplicate in-flight recovery generation");
    flushSync(() => root.render(null));
    resolve(1); await ready("other");
    check(matches("other").length > 0, "Unmounting one consumer cannot cancel another consumer recovery");

    reset(); mount(); mount("independent.jpg", other);
    requests[0].reject(Error("offline")); await failed(); await failed("other");
    click(retry()); resolve(1); await ready();
    click(retry("other")); await ready("other");
    check(requests.length === 2, "Late concurrent Retry reuses newer settled recovery rather than refetching");

    reset(); mount(); requests[0].reject(Error("offline")); await failed();
    click(retry()); click(swatch(1)); resolve(1); await ready();
    check(hasColourMatches("light") && !feedback(), "Swatch change during retry cannot restore stale results or errors");
    reset(); mount(); requests[0].reject(Error("offline")); await failed();
    click(retry()); mount("next.jpg"); resolve(1); await ready();
    check(!matches().includes("next.jpg") && matches().includes("first.jpg") && !feedback(), "Navigation during retry keeps latest photograph results");
    for (const success of [false, true]) {
      reset(); mount(); requests[0].reject(Error("offline")); await failed();
      click(retry()); mount("no-palette.jpg", root, []);
      if (success) resolve(1); else requests[1].reject(Error("late failure"));
      await wait(130);
      check(!node("[role=status]") && !node("[data-matches]") && node("img"), "Late retry " + (success ? "success" : "failure") + " cannot restore unmounted gallery");
    }

    reset(); mount(); resolve(0, [photo("first.jpg")]); await ready();
    check(feedback() === "No similar photographs found." && !retry(), "Successful empty matches differ from failure");
    check(node("nav button") && node("img"), "Empty result keeps photograph and swatches usable");
    check(unexpectedFetches.length === 0, "Fixture makes no unexpected fetch calls");
    window.testResults = { passed: checks.length, checks };
  })().catch(error => {
    window.testResults = { failed: error.message, checks };
  }).finally(() => {
    document.getElementById("results").textContent = JSON.stringify(window.testResults, null, 2);
  });
}
