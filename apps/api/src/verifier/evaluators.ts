import type {
  ActivityEvidenceSource,
  VerificationDecision,
  VerifiableCommitment,
  WeeklySavingsEvidenceSource,
} from "./types.js";

function requireAtomicAmount(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${field} must be positive atomic units`);
  }
  return BigInt(value);
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive safe integer`);
  }
  return value;
}

export async function evaluateWeeklySavings(
  commitment: VerifiableCommitment,
  source: WeeklySavingsEvidenceSource,
): Promise<VerificationDecision> {
  const targetAmountAtomic = requireAtomicAmount(
    commitment.parameters.targetAmountAtomic,
    "targetAmountAtomic",
  );
  const actualAmountAtomic = await source.totalDepositedAtomic({
    userId: commitment.userId,
    startAt: commitment.epochStart,
    endAt: commitment.epochEnd,
  });

  return actualAmountAtomic >= targetAmountAtomic
    ? {
        outcome: "COMPLETED",
        evidence: {
          targetAmountAtomic: targetAmountAtomic.toString(),
          actualAmountAtomic: actualAmountAtomic.toString(),
        },
      }
    : {
        outcome: "FAILED",
        evidence: {
          targetAmountAtomic: targetAmountAtomic.toString(),
          actualAmountAtomic: actualAmountAtomic.toString(),
        },
      };
}

export async function evaluateActivityCount(
  commitment: VerifiableCommitment,
  source: ActivityEvidenceSource,
): Promise<VerificationDecision> {
  const targetCount = requirePositiveInteger(commitment.parameters.targetCount, "targetCount");
  const actualCount = await source.countActivities({
    userId: commitment.userId,
    startAt: commitment.epochStart,
    endAt: commitment.epochEnd,
  });

  if (!Number.isSafeInteger(actualCount) || actualCount < 0) {
    throw new Error("Activity evidence source returned an invalid count");
  }

  return actualCount >= targetCount
    ? {
        outcome: "COMPLETED",
        evidence: { targetCount, actualCount },
      }
    : {
        outcome: "FAILED",
        evidence: { targetCount, actualCount },
      };
}
