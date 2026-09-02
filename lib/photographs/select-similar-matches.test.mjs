import assert from "node:assert/strict";
import { test } from "node:test";

import { selectSimilarMatches } from "./select-similar-matches.ts";

function candidates(differences) {
  return differences.map((difference, index) => ({ difference, index }));
}

for (const vectorSize of [1, 5]) {
  test(`${vectorSize}D preserves every match within the baseline threshold`, () => {
    const result = selectSimilarMatches(
      candidates([25, 5, 20, 10, 18, 15, 12, 30]),
      20,
    );

    assert.deepEqual(
      result.matches.map(({ difference }) => difference),
      [5, 10, 12, 15, 18, 20],
    );
    assert.equal(result.threshold, 20);
  });

  test(`${vectorSize}D appends the nearest fallback to reach five`, () => {
    const result = selectSimilarMatches(
      candidates([24, 8, 22, 16, 4, 12, 28]),
      20,
    );

    assert.deepEqual(
      result.matches.map(({ difference }) => difference),
      [4, 8, 12, 16, 22],
    );
    assert.equal(result.threshold, 22);
  });
}

test("returns the five nearest candidates when none meet the baseline", () => {
  const result = selectSimilarMatches(
    candidates([70, 30, 60, 40, 80, 50]),
    20,
  );

  assert.deepEqual(
    result.matches.map(({ difference }) => difference),
    [30, 40, 50, 60, 70],
  );
  assert.equal(result.threshold, 70);
});

test("returns every available candidate when fewer than five are eligible", () => {
  const result = selectSimilarMatches(candidates([35, 5, 25]), 20);

  assert.deepEqual(
    result.matches.map(({ difference }) => difference),
    [5, 25, 35],
  );
  assert.equal(result.threshold, 35);
});

test("does not mutate the candidate order", () => {
  const input = candidates([30, 10, 20]);

  selectSimilarMatches(input, 20);

  assert.deepEqual(
    input.map(({ difference }) => difference),
    [30, 10, 20],
  );
});

test("keeps the baseline threshold for an empty candidate set", () => {
  assert.deepEqual(selectSimilarMatches([], 20), {
    matches: [],
    threshold: 20,
  });
});