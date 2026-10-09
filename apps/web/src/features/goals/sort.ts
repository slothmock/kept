import type { GoalDto } from "@/api/kept-api";
import type { GoalFundingEntry } from "@/features/goals/funding";

export type GoalSortOrder =
  | "soonest"
  | "latest"
  | "most-saved"
  | "least-saved"
  | "most-progress"
  | "least-progress"
  | "newest"
  | "oldest"
  | "name-asc"
  | "name-desc";

export const GOAL_SORT_OPTIONS: readonly { value: GoalSortOrder; label: string }[] = [
  { value: "soonest", label: "Target date: Soonest" },
  { value: "latest", label: "Target date: Latest" },
  { value: "most-progress", label: "Progress: Highest" },
  { value: "least-progress", label: "Progress: Lowest" },
  { value: "most-saved", label: "Saved: Most" },
  { value: "least-saved", label: "Saved: Least" },
  { value: "newest", label: "Created: Newest" },
  { value: "oldest", label: "Created: Oldest" },
  { value: "name-asc", label: "Name: A–Z" },
  { value: "name-desc", label: "Name: Z–A" },
];

function validDate(value: string | null): number | null {
  if (!value) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function saved(goal: GoalDto, funding?: ReadonlyMap<string, GoalFundingEntry>): bigint {
  return funding?.get(goal.id)?.allocatedAssets ?? 0n;
}

function progressCompare(
  a: GoalDto,
  b: GoalDto,
  funding?: ReadonlyMap<string, GoalFundingEntry>,
): number {
  const aTarget = BigInt(a.targetAmountAtomic);
  const bTarget = BigInt(b.targetAmountAtomic);
  const aSaved = saved(a, funding);
  const bSaved = saved(b, funding);
  // Compare fractions exactly; don't round percentages or convert atomic values to Number.
  const aNumerator = aTarget > 0n ? aSaved : 0n;
  const bNumerator = bTarget > 0n ? bSaved : 0n;
  const aDenominator = aTarget > 0n ? aTarget : 1n;
  const bDenominator = bTarget > 0n ? bTarget : 1n;
  const delta = aNumerator * bDenominator - bNumerator * aDenominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function compareBigints(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortGoals(
  goals: readonly GoalDto[],
  order: GoalSortOrder,
  funding?: ReadonlyMap<string, GoalFundingEntry>,
): GoalDto[] {
  return [...goals].sort((a, b) => {
    let comparison = 0;
    switch (order) {
      case "soonest":
      case "latest": {
        const aDate = validDate(a.targetDate);
        const bDate = validDate(b.targetDate);
        if (aDate === null && bDate !== null) return 1;
        if (bDate === null && aDate !== null) return -1;
        if (aDate !== null && bDate !== null) {
          comparison = order === "soonest" ? aDate - bDate : bDate - aDate;
        }
        break;
      }
      case "most-saved":
      case "least-saved":
        comparison = compareBigints(saved(a, funding), saved(b, funding));
        if (order === "most-saved") comparison = -comparison;
        break;
      case "most-progress":
      case "least-progress":
        comparison = progressCompare(a, b, funding);
        if (order === "most-progress") comparison = -comparison;
        break;
      case "newest":
      case "oldest": {
        const aDate = validDate(a.createdAt);
        const bDate = validDate(b.createdAt);
        comparison = (aDate ?? 0) - (bDate ?? 0);
        if (order === "newest") comparison = -comparison;
        break;
      }
      case "name-asc":
        comparison = a.name.localeCompare(b.name);
        break;
      case "name-desc":
        comparison = b.name.localeCompare(a.name);
        break;
    }
    return comparison || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}

// Preserve previous API for existing callers/tests.
export function sortGoalsByTargetDate(
  goals: readonly GoalDto[],
  order: "soonest" | "latest",
): GoalDto[] {
  return sortGoals(goals, order);
}
