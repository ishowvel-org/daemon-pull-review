import { Context } from "../types/context";

/**
 * Create a unique key for an issue based on its URL and optional issue number
 * @param issueUrl - The URL of the issue
 * @param issue - The optional issue number
 * @returns The unique key for the issue
 */
export function createKey(issueUrl: string, logger: Context["logger"], issue?: number) {
  const urlParts = issueUrl.split("/");

  let key;

  if (urlParts.length === 7) {
    const [, , , issueOrg, issueRepo, , issueNumber] = urlParts;
    key = `${issueOrg}/${issueRepo}/${issueNumber}`;
  }

  if (urlParts.length === 5) {
    const [, , issueOrg, issueRepo] = urlParts;
    key = `${issueOrg}/${issueRepo}/${issue}`;
  }

  if (urlParts.length === 8) {
    const [, , , issueOrg, issueRepo, , , issueNumber] = urlParts;
    key = `${issueOrg}/${issueRepo}/${issueNumber || issue}`;
  }

  if (urlParts.length === 3) {
    const [issueOrg, issueRepo, issueNumber] = urlParts;
    key = `${issueOrg}/${issueRepo}/${issueNumber || issue}`;
  }

  if (!key) {
    throw logger.error("Invalid issue URL", {
      issueUrl,
      issueNumber: issue,
    });
  }

  if (key.includes("#")) {
    key = key.split("#")[0];
  }

  return key;
}
