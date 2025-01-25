import { Context as PluginContext } from "@ubiquity-os/plugin-sdk";
import { PluginSettings } from "./plugin-input";
import { Env } from "./env";
import { createAdapters } from "../adapters";

export type SupportedEvents = "pull_request.opened" | "pull_request.ready_for_review";

export type Context<TEvents extends SupportedEvents = SupportedEvents> = PluginContext<PluginSettings, Env, null, TEvents> & {
  adapters: ReturnType<typeof createAdapters>;
};
