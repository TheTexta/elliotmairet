export type SimilarityCandidate = {
  difference: number;
};

export function selectSimilarMatches<T extends SimilarityCandidate>(
  candidates: readonly T[],
  baselineThreshold: number,
  minimumMatches = 5,
) {
  const rankedCandidates = [...candidates].sort(
    (first, second) => first.difference - second.difference,
  );
  const baselineMatches = rankedCandidates.filter(
    ({ difference }) => difference <= baselineThreshold,
  );

  if (baselineMatches.length >= minimumMatches) {
    return { matches: baselineMatches, threshold: baselineThreshold };
  }

  const matches = rankedCandidates.slice(0, minimumMatches);
  const threshold = matches.at(-1)?.difference ?? baselineThreshold;

  return {
    matches,
    threshold: Math.max(baselineThreshold, threshold),
  };
}