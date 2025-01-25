import { createPullSpecContextBlockSection } from "../helpers/format-spec-and-pull";
import { fetchIssue } from "../helpers/issue-fetching";
import { CodeReviewStatus } from "../types/github-types";
import { findGroundTruths } from "./ground-truths/find-ground-truths";
import { Context } from "../types";
import { CallbackResult } from "../types/proxy";
import { closedByPullRequestsReferences, IssuesClosedByThisPr } from "../helpers/gql-queries";
import { createCodeReviewSysMsg, llmQuery } from "./prompt";
import { encodeAsync } from "../helpers/pull-helpers/pull-request-parsing";
import { TokenLimits } from "../types/llm";

export class PullReviewer {
  readonly context: Context;
  private _oneDay = 24 * 60 * 60 * 1000;

  constructor(context: Context<"pull_request.opened" | "pull_request.ready_for_review">) {
    this.context = context;
  }

  /**
   * Perform initial checks on a pull request to determine if review is needed
   * @returns CallbackResult indicating the status and reason
   */
  async performPullPrecheck(): Promise<CallbackResult> {
    const { logger, payload } = this.context;
    const { pull_request } = payload;

    // Check if PR is in draft mode, closed, or if we can perform a review
    if (pull_request.draft) {
      return { status: 200, reason: logger.info("PR is in draft mode, no action required").logMessage.raw };
    } else if (pull_request.state === "closed") {
      return { status: 200, reason: logger.info("PR is closed, no action required").logMessage.raw };
    } else if (!(await this.canPerformReview())) {
      return { status: 200, reason: logger.info("Cannot perform review at this time").logMessage.raw };
    } else if (pull_request.user.id !== this.context.payload.sender.id) {
      return { status: 200, reason: logger.info("Review wasn't requested by pull author").logMessage.raw };
    } else if (pull_request.author_association === "COLLABORATOR") {
      return { status: 200, reason: logger.info("Review was requested by core team, Skipping").logMessage.raw };
    }

    return await this._handleCodeReview();
  }

  /**
   * Handle the code review process for a pull request
   * @returns CallbackResult indicating the status and reason
   */
  private async _handleCodeReview(): Promise<CallbackResult> {
    const pullReviewData = await this.reviewPull();
    const { reviewComment, confidenceThreshold } = this.validateReviewOutput(pullReviewData.answer);

    if (confidenceThreshold > 0.5) {
      await this.addThumbsUpReaction();
    } else {
      await this.convertPullToDraft();
      await this.removeThumbsUpReaction();
      await this.submitCodeReview(reviewComment, "REQUEST_CHANGES");
    }

    return { status: 200, reason: "Success" };
  }

  async addThumbsUpReaction(): Promise<void> {
    const { logger, payload } = this.context;

    try {
      await this.context.octokit.rest.reactions.createForIssue({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.pull_request.number,
        content: "+1",
      });
      logger.info("Added thumbs up reaction to pull request");
    } catch (error) {
      throw logger.error(`Failed to add thumbs up reaction ${error}`);
    }
  }

  /**
   * Remove thumbs up reaction from the pull request body if it exists
   */
  async removeThumbsUpReaction(): Promise<void> {
    const { logger, payload } = this.context;

    try {
      const reactions = await this.context.octokit.rest.reactions.listForIssue({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.pull_request.number,
      });

      const botReaction = reactions.data.find((reaction) => reaction.content === "+1" && reaction.user?.type === "Bot");

      if (botReaction) {
        await this.context.octokit.rest.reactions.deleteForIssue({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: payload.pull_request.number,
          reaction_id: botReaction.id,
        });
        logger.info("Removed thumbs up reaction from pull request");
      }
    } catch (error) {
      throw logger.error(`Failed to remove thumbs up reaction ${error}`);
    }
  }

  /**
   * Submit a code review for a pull request
   * @param review - The review comment
   * @param status - The review status (APPROVE, REQUEST_CHANGES, COMMENT)
   */
  async submitCodeReview(review: string | undefined, status: CodeReviewStatus): Promise<void> {
    const { logger, payload } = this.context;
    const { number, organization, repository, action, sender } = payload;
    const { owner, name } = repository;

    logger.info(`${organization}/${repository}#${number} - ${action} - ${sender.login} - ${review}`);

    try {
      const response = await this.context.octokit.rest.pulls.createReview({
        owner: owner.login,
        repo: name,
        pull_number: number,
        body: review,
        event: status,
      });
      logger.info(`Code review submitted: ${response.data.html_url}`);
    } catch (er) {
      throw this.context.logger.error("Failed to submit code review", { err: er });
    }
  }

  /**
   * Check if a review can be performed on the pull request
   * @returns boolean indicating if review can be performed
   */
  async canPerformReview(): Promise<boolean> {
    const { logger, payload } = this.context;
    const { number, repository, action } = payload;
    const { owner, name } = repository;

    logger.info(`${repository.owner.login}/${repository.name}#${number} - ${action}`);

    const timeline = await this.context.octokit.paginate(this.context.octokit.rest.issues.listEvents, {
      owner: owner.login,
      repo: name,
      issue_number: number,
      per_page: 100,
    });

    const reviews = timeline.filter((event) => event.event === "reviewed");
    const botReviews = reviews.filter((review) => review.actor.type === "Bot");

    if (!botReviews.length) {
      logger.info("No bot reviews found");
      return true;
    }

    const lastReview = botReviews[botReviews.length - 1];
    const lastReviewDate = new Date(lastReview.created_at);
    const now = new Date();
    const diff = now.getTime() - lastReviewDate.getTime();

    if (diff < this._oneDay) {
      await this.convertPullToDraft();
      throw this.context.logger.error("Only one review per day is allowed");
    }

    logger.info("One review per day check passed");
    return true;
  }

  /**
   * Convert a pull request to draft mode
   * @param shouldConvert - Whether to convert the PR to draft
   * @param params - Parameters including nodeId and octokit instance
   */
  async convertPullToDraft() {
    const toDraft = /* GraphQL */ `mutation {
      convertPullRequestToDraft(input: {pullRequestId: "${this.context.payload.pull_request.node_id}"}) {
        pullRequest {
          id
          number
          isDraft
          title
        }
      }
    }`;

    try {
      await this.context.octokit.graphql(toDraft);
      this.context.logger.info(`Successfully converted pull request to draft mode.`);
    } catch (e) {
      throw this.context.logger.error("Failed to convert pull request to draft mode: ", { e });
    }
  }

  /**
   * Review a pull request using AI completion
   * @returns The completion result from the AI model
   */
  async reviewPull() {
    const {
      env: { UBIQUITY_OS_APP_NAME },
      config: { openRouterAiModel },
      adapters: {
        openRouter: { completions },
      },
    } = this.context;

    const taskNumber = await this.getTaskNumberFromPullRequest(this.context);
    const issue = await fetchIssue(this.context, taskNumber);

    if (!issue) {
      throw this.context.logger.error(`Error fetching issue, Aborting`, {
        owner: this.context.payload.repository.owner.login,
        repo: this.context.payload.repository.name,
        issue_number: taskNumber,
      });
    }

    const taskSpecification = issue.body;
    if (!taskSpecification) throw this.context.logger.error("This task does not contain a specification and this cannot be automatically reviewed");

    const groundTruths = await findGroundTruths(this.context, { taskSpecification });

    const sysPromptTokenCount = (await encodeAsync(createCodeReviewSysMsg(groundTruths, UBIQUITY_OS_APP_NAME, ""))).length;
    const queryTokenCount = (await encodeAsync(llmQuery)).length;

    const tokenLimits: TokenLimits = {
      modelMaxTokenLimit: this.context.adapters.openRouter.completions.getModelMaxTokenLimit(this.context.config.openRouterAiModel),
      maxCompletionTokens: this.context.adapters.openRouter.completions.getModelMaxOutputLimit(this.context.config.openRouterAiModel),
      runningTokenCount: 0,
      tokensRemaining: 0,
    };

    // what we start out with to include files
    tokenLimits.tokensRemaining = tokenLimits.modelMaxTokenLimit - tokenLimits.maxCompletionTokens - sysPromptTokenCount - queryTokenCount;

    const formattedSpecAndPull = await createPullSpecContextBlockSection({
      context: this.context,
      tokenLimits,
      issue,
    });

    return await completions.createCompletion(
      openRouterAiModel,
      formattedSpecAndPull,
      groundTruths,
      UBIQUITY_OS_APP_NAME,
      completions.getModelMaxOutputLimit(openRouterAiModel)
    );
  }

  async checkIfPrClosesIssues(
    octokit: Context["octokit"],
    pr: {
      owner: string;
      repo: string;
      pr_number: number;
    }
  ) {
    const { owner, repo, pr_number } = pr;

    try {
      const result = await octokit.graphql<IssuesClosedByThisPr>(closedByPullRequestsReferences, {
        owner,
        repo,
        pr_number,
      });

      const closingIssues = result.repository.pullRequest.closingIssuesReferences.edges.map((edge) => ({
        number: edge.node.number,
        title: edge.node.title,
        url: edge.node.url,
        body: edge.node.body,
        repository: {
          name: edge.node.name,
          owner: edge.node.owner,
        },
      }));

      if (closingIssues.length > 0) {
        return {
          closesIssues: true,
          issues: closingIssues,
        };
      } else {
        return {
          closesIssues: false,
          issues: [],
        };
      }
    } catch (error) {
      console.error("Error fetching closing issues:", error);
      return {
        closesIssues: false,
        issues: [],
      };
    }
  }
  async getTaskNumberFromPullRequest(context: Context<"pull_request.opened" | "pull_request.ready_for_review">) {
    const {
      payload: { pull_request },
    } = context;
    let issueNumber;

    const { issues: closingIssues } = await this.checkIfPrClosesIssues(context.octokit, {
      owner: pull_request.base.repo.owner.login,
      repo: pull_request.base.repo.name,
      pr_number: pull_request.number,
    });

    if (closingIssues.length === 0) {
      await this.convertPullToDraft();
      throw this.context.logger.error("You need to link an issue before converting the pull request to ready for review.");
    } else if (closingIssues.length > 1) {
      throw this.context.logger.error("Multiple tasks are linked to this pull request. This needs to be investigated to determine the best way to handle it.", {
        closingIssues,
        pull_request,
      });
    } else {
      issueNumber = closingIssues[0].number;
    }

    if (!issueNumber) {
      throw this.context.logger.error("Task number not found", { pull_request });
    }

    return issueNumber;
  }

  validateReviewOutput(reviewString: string) {
    let reviewOutput: { confidenceThreshold: number; reviewComment: string };
    try {
      reviewOutput = JSON.parse(reviewString);
    } catch (err) {
      throw this.context.logger.error("Couldn't parse JSON output; Aborting", { err });
    }
    if (typeof reviewOutput.reviewComment !== "string") {
      throw this.context.logger.error("LLM failed to output review comment successfully");
    }
    const confidenceThreshold = reviewOutput.confidenceThreshold;
    if (Number.isNaN(Number(confidenceThreshold))) {
      throw this.context.logger.error("LLM failed to output a confidence threshold successfully");
    }

    return { confidenceThreshold: Number(reviewOutput.confidenceThreshold), reviewComment: reviewOutput.reviewComment };
  }
}
