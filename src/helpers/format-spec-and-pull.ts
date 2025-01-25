import { Context } from "../types/context";
import { TokenLimits } from "../types/llm";
import { createKey } from "../handlers/key";
import { fetchIssue } from "./issue-fetching";
import { Issue } from "../types/github-types";
import { fetchPullRequestDiff } from "./pull-helpers/fetch-diff";
import { encodeAsync } from "./pull-helpers/pull-request-parsing";
export async function createPullSpecContextBlockSection({
  context,
  tokenLimits,
  issue,
}: {
  context: Context<"pull_request.ready_for_review" | "pull_request.opened">;
  tokenLimits: TokenLimits;
  issue: Issue;
}): Promise<string> {
  const key = createKey(issue.html_url, context.logger);
  const [org, repo, issueNum] = key.split("/");

  const issueNumber = parseInt(issueNum);
  if (!issueNumber || isNaN(issueNumber)) {
    throw context.logger.error("Issue number is not valid");
  }

  // specification or pull request body
  const specOrBody = (await fetchIssue(context, issueNumber))?.body || "No specification or body available";

  const specHeader = "Current Task Specification";
  const specBlock = [createHeader(specHeader, key), createSpecOrBody(specOrBody), createFooter(specHeader, key)];
  const block = [specBlock.join("\n")];

  // Build the block with the diff in it's own section
  const localContextWithoutDiff = [block.join("\n"), createHeader(`Pull Request Diff`, key), createFooter(`Pull Request Diff`, key)].join("\n");

  const tokenCount = (await encodeAsync(localContextWithoutDiff)).length;
  tokenLimits.runningTokenCount += tokenCount;
  tokenLimits.tokensRemaining -= tokenCount;

  // Fetch our diff if we have one; this excludes the largest of files to keep within token limits
  const { diff } = await fetchPullRequestDiff(context, org, repo, context.payload.pull_request.number, tokenLimits);
  if (!diff) {
    throw context.logger.error("Error fetching the pull difference, aborting");
  }
  const localContextWithDiff = [block.join("\n"), createHeader(`Pull Request Diff`, key), diff, createFooter(`Pull Request Diff`, key)];
  return localContextWithDiff.join("\n");
}

function createHeader(content: string, repoString: string) {
  return `=== ${content} === ${repoString} ===\n`;
}

function createFooter(content: string, repoString: string) {
  return `=== End ${content} === ${repoString} ===\n`;
}

function createSpecOrBody(specOrBody: string) {
  return `${specOrBody}\n`;
}
