import { CODE_REVIEW_GROUND_TRUTHS_SYSTEM_MESSAGE } from "../handlers/ground-truths/prompts";

export type CodeReviewAppParams = {
  taskSpecification: string;
};

export type CodeReviewGroundTruthSystemMessage = typeof CODE_REVIEW_GROUND_TRUTHS_SYSTEM_MESSAGE;

export type TokenLimits = {
  modelMaxTokenLimit: number;
  maxCompletionTokens: number;
  runningTokenCount: number;
  tokensRemaining: number;
};
