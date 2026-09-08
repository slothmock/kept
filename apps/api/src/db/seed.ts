import { randomUUID } from "node:crypto";

import { COMMITMENT_DEFINITIONS } from "@kept/commitment-catalogue";

import type { JsonValue } from "../domain/commitments/index.js";
import type { KeptDatabase } from "./client.js";
import { commitmentDefinitions } from "./schema.js";

const proofAdapterKeys = {
  ACTIVITY_COUNT_V1: "activity-count-v1",
  STUDY_SESSIONS_SOCIAL_V1: null,
  WEEKLY_SAVINGS_V1: null,
} as const;

export async function seedCommitmentCatalogue(db: KeptDatabase): Promise<void> {
  const now = new Date();

  await db
    .insert(commitmentDefinitions)
    .values(
      COMMITMENT_DEFINITIONS.map((definition) => ({
        id: randomUUID(),
        code: definition.code,
        version: definition.version,
        verificationClass: definition.verificationClass,
        parameterSchema: definition.parameterSchema as unknown as Record<string, JsonValue>,
        verificationConfig: null,
        proofAdapterKey: proofAdapterKeys[definition.code],
        rewardWeightMax: null,
        privacyPolicy: null,
        active: true,
        createdAt: now,
      })),
    )
    .onConflictDoNothing({
      target: [commitmentDefinitions.code, commitmentDefinitions.version],
    });
}
