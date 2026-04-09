// src/lib/ai-pricing.ts
//
// Cenové konstanty pro Claude Sonnet 4. Volající si cenu počítá
// přes computeCostUsd() — log přetrvá i když se ceník v budoucnu
// změní (cena je vždycky "at time of request").

export const CLAUDE_SONNET_4 = {
  model: "claude-sonnet-4-20250514",
  inputPerMillion: 3,
  outputPerMillion: 15,
} as const;

export function computeCostUsd(
  inputTokens: number,
  outputTokens: number
): number {
  const { inputPerMillion, outputPerMillion } = CLAUDE_SONNET_4;
  return (
    (inputTokens / 1_000_000) * inputPerMillion +
    (outputTokens / 1_000_000) * outputPerMillion
  );
}

// Statické odhady zobrazené u tlačítek. Překalibrovat manuálně
// po ~100 reálných záznamech v ai_usage_logs.
export const AI_ACTION_ESTIMATES = {
  analyze: 0.02, // ~2000 in + 800 out ≈ $0.018
  metaAnalyze: 0.08, // ~5000 in + 4000 out ≈ $0.075
} as const;

export type AiAction = keyof typeof AI_ACTION_ESTIMATES;
