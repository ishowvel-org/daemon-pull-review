import { Context } from "../../types";
import { CodeReviewAppParams, CodeReviewGroundTruthSystemMessage } from "../../types/llm";
import { CODE_REVIEW_GROUND_TRUTHS_SYSTEM_MESSAGE } from "./prompts";
import { createGroundTruthSysMsg } from "./create-system-message";

export async function findGroundTruths(context: Context, params: CodeReviewAppParams): Promise<string[]> {
  const systemMsgObj = CODE_REVIEW_GROUND_TRUTHS_SYSTEM_MESSAGE;
  const { taskSpecification } = params;
  return findCodeReviewTruths(context, { taskSpecification }, systemMsgObj);
}

async function findCodeReviewTruths(context: Context, params: CodeReviewAppParams, systemMsgObj: CodeReviewGroundTruthSystemMessage): Promise<string[]> {
  const {
    adapters: {
      openRouter: { completions },
    },
  } = context;
  const systemMsg = createGroundTruthSysMsg(systemMsgObj);

  const truths = await completions.createGroundTruthCompletion(context, params.taskSpecification, systemMsg);
  return validateGroundTruths(truths, context.logger);
}

function validateGroundTruths(truthsString: string | null, logger: Context["logger"]): string[] {
  let truths;
  if (!truthsString) {
    throw logger.error("Failed to generate ground truths");
  }

  try {
    truths = JSON.parse(truthsString);
  } catch (err) {
    throw logger.error("Failed to parse ground truths", { err });
  }
  if (!Array.isArray(truths)) {
    throw logger.error("Ground truths must be an array");
  }

  if (truths.length > 10) {
    throw logger.error("Ground truths must not exceed 10");
  }

  truths.forEach((truth: string) => {
    if (typeof truth !== "string") {
      throw logger.error("Each ground truth must be a string");
    }
  });

  return truths;
}
