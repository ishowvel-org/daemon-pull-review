# `@ubiquity-os/daemon-pull-review`

This is a high context aware GitHub organization integrated bot that uses the Anthropic Claude 3.5 Sonnet model to provide automated reviews and feeback to Github pull requests.

## Usage

Just convert a pull request to be ready for review and the bot automatically reviews and requests changes if necessary

## How it works

With its huge context window, we are able to feed the entire issue specification and the pull request to the model which we obtain. This allows the model to have a very deep understanding of the current scope and provide highly relevant reviews.

## Installation

`.ubiquity-os.config.yml`:

```yml
plugins:
  - uses:
      - plugin: ubiquity-os-marketplace/daemon-pull-review
        with:
          openRouterAiModel: "" # Optional - defaults to "anthropic/claude-3.5-sonnet"
          openRouterBaseUrl: "" # Optional - defaults to Open Router's API endpoint
          tokenLimit: { context: 200000, output: 4096 } #  # Required if using custom openRouterAiModel. Defaults to Claude 3.5 Sonnet limits
```

Important:
If you specify a custom openRouterAiModel, you must also provide the appropriate tokenLimit configuration for that model. The default token limits are set for Claude 3.5 Sonnet and may not be suitable for other models.

`.dev.vars` (for local testing):

specify the OpenRouterBase URL in the `.ubiquity-os.config.yml` file and set the `OPENROUTER_API_KEY` in the `.dev.vars` file.

```sh
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
UBIQUITY_OS_APP_NAME="UbiquityOS"
```

## Testing

```sh
bun run test
```
