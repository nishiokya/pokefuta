export interface LatestGenerationGuard {
  begin(): number;
  current(): number;
  isCurrent(generation: number): boolean;
}

export function createLatestGenerationGuard(): LatestGenerationGuard {
  let currentGeneration = 0;

  return {
    begin() {
      currentGeneration += 1;
      return currentGeneration;
    },
    current() {
      return currentGeneration;
    },
    isCurrent(generation: number) {
      return generation === currentGeneration;
    },
  };
}
