import { encode } from "gpt-tokenizer";
import { TokenLimits } from "../../types/llm";
import { EncodeOptions } from "gpt-tokenizer/esm/GptEncoding";
import { Context } from "../../types";
import { getExcludedFiles } from "../excluded-files";
import { minimatch } from "minimatch";

async function filterAndSortDiffs(diff: string, excludedPatterns: string[]): Promise<{ filename: string; tokenCount: number; diffContent: string }[]> {
  const perFileDiffs = parsePerFileDiffs(diff).filter((file) => excludedPatterns.every((pattern) => !minimatch(file.filename, pattern)));

  const accurateFileDiffStats = await Promise.all(
    perFileDiffs.map(async (file) => {
      const tokenCountArray = await encodeAsync(file.diffContent, { disallowedSpecial: new Set() });
      return { filename: file.filename, tokenCount: tokenCountArray.length, diffContent: file.diffContent };
    })
  );

  // Sort files by token count in ascending order
  return accurateFileDiffStats.sort((a, b) => a.tokenCount - b.tokenCount);
}

function selectIncludedFiles(
  files: { filename: string; tokenCount: number; diffContent: string }[],
  tokenLimits: TokenLimits,
  logger: Context["logger"]
): typeof files {
  const includedFiles = [];
  for (const file of files) {
    if (tokenLimits.runningTokenCount + file.tokenCount > tokenLimits.tokensRemaining) {
      logger.info(`Skipping ${file.filename} to stay within token limits.`);
      continue;
    }
    includedFiles.push(file);
    tokenLimits.runningTokenCount += file.tokenCount;
    tokenLimits.tokensRemaining -= file.tokenCount;
  }

  return includedFiles;
}

export async function processPullRequestDiff(diff: string, tokenLimits: TokenLimits, context: Context) {
  const excludedFilePatterns = await getExcludedFiles(context);
  const sortedDiffs = await filterAndSortDiffs(diff, excludedFilePatterns);

  const includedFiles = selectIncludedFiles(sortedDiffs, tokenLimits, context.logger);

  if (includedFiles.length === 0) {
    context.logger.error(`Cannot include any files from diff without exceeding token limits.`);
    return { diff: null };
  }

  // Build and return the final diff
  const currentDiff = includedFiles.map((file) => file.diffContent).join("\n");
  return { diff: currentDiff };
}

// Helper to speed up tokenization
export async function encodeAsync(text: string, options?: EncodeOptions): Promise<number[]> {
  return new Promise((resolve) => {
    const result = encode(text, options);
    resolve(result);
  });
}

// Helper to parse a diff into per-file diffs
export function parsePerFileDiffs(diff: string): { filename: string; diffContent: string }[] {
  // Split the diff string into chunks for each file
  const fileDiffs = diff.split(/^diff --git /gm).filter((chunk) => chunk.trim() !== "");

  return fileDiffs.map((chunk) => {
    // Extract the filename and content from each chunk
    const lines = chunk.split("\n");
    const firstLine = lines.shift()?.trim() || "";
    const [filename] = firstLine.split(" ").map((part) => part.replace(/^a\//, ""));

    return {
      filename,
      diffContent: `diff --git ${firstLine}\n${lines.join("\n").trim()}`,
    };
  });
}
