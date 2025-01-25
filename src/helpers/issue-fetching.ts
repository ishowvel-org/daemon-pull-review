import { Context } from "../types/context";
import { Issue } from "../types/github-types";

export async function fetchIssue(context: Context, issueNum?: number): Promise<Issue | null> {
  const { payload, octokit } = context;

  try {
    const response = await octokit.rest.issues.get({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: issueNum ?? payload.pull_request.number,
    });
    return response.data;
  } catch (error) {
    context.logger.error(`Error fetching issue`, {
      err: error,
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
    });
    return null;
  }
}
