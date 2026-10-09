import type { CommitmentDto } from "@/api/kept-api";
import { formatUsdc } from "@/features/savings/format";

export function commitmentTitle(commitment: CommitmentDto): string {
  if (commitment.definition.code === "WEEKLY_SAVINGS_V1") {
    const amount = commitment.parameters.targetAmountAtomic;
    if (typeof amount === "string") {
      try {
        const formattedAmount =
          formatUsdc(
            BigInt(amount),
          ).replace(
            /\.00$/,
            "",
          );

        return `Add ${formattedAmount} USDC to savings this week`;
      } catch {
        return "Add to savings this week";
      }
    }
    return "Add to savings this week";
  }

  if (commitment.definition.code === "ACTIVITY_COUNT_V1") {
    const target = commitment.parameters.targetCount;
    return `Complete ${typeof target === "number" ? target : "your"} activities`;
  }

  return "Commitment";
}

export function commitmentStatus(state: CommitmentDto["state"]): string {
  switch (state) {
    case "DRAFT":
      return "Ready to start";
    case "ACTIVE":
      return "In progress";
    case "COMPLETED":
      return "Verified";
    case "FAILED":
      return "Not completed";
    case "CANCELLED":
      return "Cancelled";
  }
}
