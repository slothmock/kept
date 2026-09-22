export interface LatestRequestGate {
  begin(): number;
  isCurrent(requestId: number): boolean;
}

export function createLatestRequestGate(): LatestRequestGate {
  let latestRequestId = 0;

  return {
    begin() {
      latestRequestId += 1;
      return latestRequestId;
    },

    isCurrent(requestId) {
      return requestId === latestRequestId;
    },
  };
}
