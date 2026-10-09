import type { GoalDto } from "@/api/kept-api";

export type GoalSortOrder = "soonest" | "latest";

export function sortGoalsByTargetDate(
  goals: readonly GoalDto[],
  order: GoalSortOrder,
): GoalDto[] {
  return [...goals].sort((a, b) => {
    // Undated or invalid dates always follow dated goals.
    const aDate = a.targetDate ? Date.parse(a.targetDate) : NaN;
    const bDate = b.targetDate ? Date.parse(b.targetDate) : NaN;
    const aHasDate = Number.isFinite(aDate);
    const bHasDate = Number.isFinite(bDate);
    if (!aHasDate && !bHasDate) return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    if (!aHasDate) return 1;
    if (!bHasDate) return -1;
    return (order === "soonest" ? aDate - bDate : bDate - aDate)
      || a.createdAt.localeCompare(b.createdAt)
      || a.id.localeCompare(b.id);
  });
}
