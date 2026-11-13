/**
 * Print limits (spec 05 design "Print"). The printed Report shows the first findings of each group
 * and says how many more are in the live report; nothing is hidden without saying so.
 */
export const PRINT_FINDINGS_PER_GROUP = 2;

export function printSplit<T>(items: readonly T[]): { shown: T[]; hiddenCount: number } {
  return { shown: items.slice(0, PRINT_FINDINGS_PER_GROUP), hiddenCount: Math.max(0, items.length - PRINT_FINDINGS_PER_GROUP) };
}

export function moreFindingsText(hiddenCount: number): string {
  return hiddenCount === 1 ? '1 more finding in this group is in the live report.' : `${hiddenCount} more findings in this group are in the live report.`;
}
