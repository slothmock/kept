export const COMMITMENT_OPTIONS = {
  WEEKLY_SAVINGS_V1: {
    available: true,
    title: "Save weekly",
    description: "Commit to adding an amount to this goal each week.",
  },
  ACTIVITY_COUNT_V1: {
    available: false,
    availabilityLabel: "Coming soon",
    title: "Stay active",
    description: "Activity commitments will be available after provider verification is connected.",
  },
} as const;
