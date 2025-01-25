import { RestEndpointMethodTypes } from "@octokit/rest";

export type Issue = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];
export type CodeReviewStatus = RestEndpointMethodTypes["pulls"]["createReview"]["parameters"]["event"];
