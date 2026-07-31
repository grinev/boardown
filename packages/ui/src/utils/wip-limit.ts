// The one sentence every unavailable control uses to explain itself: the status
// dropdown, the release dropdown and the dimmed drop targets all say the same
// thing, so the rule reads as one rule.
export const wipLimitHint = (count: number, limit: number): string =>
  `WIP limit reached — ${count} of ${limit} tasks are already in progress.`;
