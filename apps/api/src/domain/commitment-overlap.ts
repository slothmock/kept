/** Adjacent half-open commitment epochs do not overlap. */
export function hasOverlappingRewardEpoch(input:{
  commitmentId:string;
  goalId:string;
  definitionCode:string;
  epochStart:Date;
  epochEnd:Date;
  existing:readonly {
    id:string;savingsGoalId:string;definitionCode:string;
    state:string;epochStart:Date;epochEnd:Date;
  }[];
}):boolean {
  if(!Number.isFinite(input.epochStart.getTime()) ||
     !Number.isFinite(input.epochEnd.getTime()) ||
     input.epochEnd<=input.epochStart) throw new Error("Invalid commitment epoch");
  return input.existing.some(other=>
    other.id!==input.commitmentId
    && other.savingsGoalId===input.goalId
    && other.definitionCode===input.definitionCode
    && (other.state==="ACTIVE" || other.state==="COMPLETED")
    && other.epochStart<input.epochEnd
    && input.epochStart<other.epochEnd
  );
}
