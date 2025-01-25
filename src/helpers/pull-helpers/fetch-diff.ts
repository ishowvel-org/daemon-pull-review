import { Context } from "../../types/context";
import { TokenLimits } from "../../types/llm";
import { processPullRequestDiff } from "./pull-request-parsing";

export async function fetchPullRequestDiff(context: Context, org: string, repo: string, issue: number, tokenLimits: TokenLimits) {
  const { octokit } = context;
  let diff: string;

  try {
    const diffResponse = await octokit.rest.pulls.get({
      owner: org,
      repo,
      pull_number: issue,
      mediaType: { format: "diff" },
    });

    diff = diffResponse.data as unknown as string;
  } catch (e) {
    context.logger.error(`Error fetching pull request data`, { owner: org, repo, issue, err: String(e) });
    return { diff: null };
  }

  return await processPullRequestDiff(diff, tokenLimits, context);
}
