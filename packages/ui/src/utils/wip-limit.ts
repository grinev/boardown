// The one sentence every unavailable control uses to explain itself: the status
// dropdown, the release dropdown and the dimmed drop targets all say the same
// thing, so the rule reads as one rule.
export const wipLimitHint = (count: number, limit: number, columnLabel: string): string =>
  `WIP limit reached — ${columnLabel} already holds ${count} of ${limit} tasks.`;
