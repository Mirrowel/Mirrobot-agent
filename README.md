# Mirrobot Agent

An AI-powered GitHub bot built with [OpenCode](https://opencode.ai) that automates issue analysis, pull request reviews, and documentation generation.

## Table of Contents
- [Mirrobot Agent](#mirrobot-agent)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [How It Works](#how-it-works)
  - [Core Workflows](#core-workflows)
    - [Workflow Details](#workflow-details)
      - [Issue Analysis (`issue-comment.yml`)](#issue-analysis-issue-commentyml)
      - [PR Review (`pr-review.yml`)](#pr-review-pr-reviewyml)
  - [Usage](#usage)
  - [Installation Guide](#installation-guide)
    - [Prerequisites](#prerequisites)
    - [Step-by-Step Setup](#step-by-step-setup)
  - [Configuration](#configuration)
    - [Required Secrets](#required-secrets)
    - [Optional Secrets](#optional-secrets)
  - [Reusable Bot Setup Action](#reusable-bot-setup-action)
    - [Features](#features-1)
    - [Usage in Workflows](#usage-in-workflows)
    - [Outputs](#outputs)
  - [API Documentation](#api-documentation)
    - [Command Reference](#command-reference)
    - [Response Patterns](#response-patterns)
    - [Limitations](#limitations)
  - [Development Guide](#development-guide)
    - [Project Structure](#project-structure)
    - [Contributing Guidelines](#contributing-guidelines)
    - [Testing](#testing)
    - [Code Style](#code-style)
  - [Troubleshooting](#troubleshooting)
    - [Common Issues](#common-issues)
    - [Debugging](#debugging)
  - [Security Considerations](#security-considerations)
    - [Permissions](#permissions)
    - [Data Handling](#data-handling)
    - [Best Practices](#best-practices)
    - [Rate Limiting and API Quotas](#rate-limiting-and-api-quotas)
  - [FAQ](#faq)
  - [License](#license)

## Features

-   **Automated Issue Analysis**: Automatically analyzes new issues, identifies root causes, and suggests solutions.
-   **Intelligent PR Reviews**: Provides detailed code reviews with actionable feedback.
-   **Documentation Generation**: Creates and maintains comprehensive project documentation.
-   **Context-Aware Responses**: Understands full conversation context for accurate assistance.
-   **Self-Review Capabilities**: Can review its own code and provide humorous self-assessments.

## How It Works

This repository contains GitHub Actions workflows that trigger the Mirrobot agent to perform various tasks. Each workflow follows a similar pattern:

1.  **Event Trigger**: A GitHub event (e.g., issue opened, PR opened, mention) triggers the workflow.
2.  **Bot Setup**: A reusable composite action handles common setup tasks, including token generation, git configuration, dependency installation, and model override handling.
3.  **Context Gathering**: The workflow collects comprehensive context, including issue/PR content, comments, and cross-references.
4.  **OpenCode Processing**: The context is sent to OpenCode for AI analysis using configured LLM models.
5.  **Response Generation**: OpenCode generates appropriate responses based on the analysis.
6.  **Comment Posting**: The workflow posts the generated response as comments on the issue or PR.

## Core Workflows

| Workflow                      | File                                                              | Trigger                                                                 | Description                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Issue Analysis**            | [`issue-comment.yml`](.github/workflows/issue-comment.yml)        | `issues: [opened]`, `workflow_dispatch`                                 | Analyzes new issues, provides an initial assessment, and can be manually triggered for existing issues.                                  |
| **PR Review**                 | [`pr-review.yml`](.github/workflows/pr-review.yml)                | `pull_request_target: [opened, synchronize, ready_for_review]`, `issue_comment`                                  | Performs code reviews. Always runs for new PRs and those marked "ready for review". Also runs on updates or via comment command for PRs. |
| **Bot Reply**                 | [`bot-reply.yml`](.github/workflows/bot-reply.yml)                | `issue_comment: [created]` (if bot is mentioned)                        | Responds to requests and questions when the bot is mentioned in any issue or PR comment, maintaining full conversation context.         |
| **OpenCode Integration(Legacy)**      | [`opencode.yml`](.github/workflows/opencode.yml)                  | `issue_comment: [created]` (if `/oc` or `/opencode` is used)            | Enables manual triggering of the agent with custom prompts, restricted to repository maintainers.                                        |

### Workflow Details

#### Issue Analysis (`issue-comment.yml`)
This workflow handles issue analysis when issues are opened or manually triggered. It:
- Collects comprehensive issue context including comments and cross-references.
- Uses OpenCode to analyze the issue and suggest solutions.
- Posts an initial acknowledgment and a detailed analysis report.

**Example Analysis Output:**
```
### Issue Assessment
Based on my analysis, this issue appears to be a documentation gap. The user is requesting clearer installation instructions.

### Root Cause
The current README.md lacks step-by-step setup guidance for new users.

### Suggested Solution
1. Add detailed installation section with prerequisites
2. Include troubleshooting guidance for common setup issues
3. Provide configuration examples for different environments
```

#### PR Review (`pr-review.yml`)
This workflow performs intelligent code reviews using a three-phase process to deliver high-quality, bundled feedback.

**Bundled Review Process**
The agent submits a single, comprehensive review per PR instead of multiple individual comments. This keeps the PR timeline clean and easy to follow. The process consists of three phases:

1.  **Collect**: The agent performs a full analysis of the PR diff, generating all potential findings internally.
2.  **Curate**: It then filters the findings based on a **"HIGH-SIGNAL, LOW-NOISE"** philosophy, selecting only the most critical, high-impact, and valuable comments. Trivial style suggestions and duplicate points are discarded.
3.  **Submit**: The curated line comments are bundled with a high-level summary and submitted as a single, formal GitHub Review. The review is submitted with the appropriate status (`APPROVE`, `REQUEST_CHANGES`, or `COMMENT`) based on the severity of the findings.

**Example Review Summary:**
```
### Overall Assessment
This PR introduces a new authentication flow that is well-structured and follows best practices. I've included a few minor suggestions for improving error handling.

### Key Suggestions
- **`src/auth.js:45`**: Consider adding a `try-catch` block here to handle potential token validation errors gracefully.
- **`src/routes.js:112`**: This route should have an authorization middleware to protect it.
```

**Workflow Triggers and Conditions**
The PR review workflow is triggered by the following events and conditions:
- **Direct PR Events**: Runs automatically when a pull request is `opened` (and not a draft) or marked as `ready_for_review`.
- **Manual Dispatch**: Can be triggered manually via the GitHub Actions UI using the `workflow_dispatch` event, requiring a PR number as input.
- **Monitored Updates**: When a PR has the `Agent Monitored` label, the workflow runs on every `synchronize` event (i.e., when new commits are pushed).
- **Comment Command**: A review can be manually requested on a PR by commenting `/mirrobot-review` or `/mirrobot_review`.

**Rich Context Gathering**
To provide accurate and insightful reviews, the agent gathers extensive context from the pull request, including:
- **Full PR Metadata**: Title, body, author, branches, and statistics.
- **Filtered Discussion**: Fetches all comments and reviews, but intelligently filters out outdated comments and dismissed or purely informational reviews to reduce noise.
- **Linked Issues**: Retrieves the title and body of any issues linked for closure in the PR.
- **Cross-References**: Finds mentions of the PR in other issues or pull requests.
- **Complete Diff**: The full `diff` of the pull request is included in the context to power the code analysis.

**Other Features:**
- **Concurrency Controls**: Prevents duplicate review runs on the same PR.
- - **Smart Triggers**: Automatically reviews new and "ready for review" PRs. For PRs with the `Agent Monitored` label, it also runs on updates. Or when triggered by a `/mirrobot-review` command.
- **Incremental Reviews**: For follow-up reviews, the agent generates a diff between the last reviewed commit and the current PR head. If the old commit is not found (e.g., after a rebase), it falls back to a full review.
- **Review State Tracking**: Remembers the last reviewed commit SHA to avoid redundant analysis.

## Usage

To interact with the Mirrobot agent, use one of the following methods:

-   **Mention the bot** in any issue or PR comment:
    ```
    @mirrobot-agent <your request>
    ```

-   **Trigger manual analysis**:
    -   For issues: Use the "Run workflow" button on the "Issue Analysis" action.
    -   For PRs: Use the "Run workflow" button on the "PR Review" action.

-   **Use slash commands** in a comment:
    -   `/mirrobot-review` or `/mirrobot_review`: Manually trigger a review for a PR.

## Installation Guide

### Prerequisites

-   A GitHub repository where you want to deploy the bot.
-   GitHub App credentials (App ID and Private Key).
-   Access to an LLM proxy service.

### Step-by-Step Setup

1.  **Fork or Clone this Repository**:
    -   Fork this repository to your GitHub account.
    -   Clone the forked repository to your local machine.

2.  **Configure Repository Secrets**:
    -   Navigate to your repository's `Settings` → `Secrets and variables` → `Actions`.
    -   Add the secrets listed in the [Configuration](#configuration) section below.

3.  **Activate Workflows**:
    -   The workflows are automatically activated when you push the code to your repository.
    -   Ensure all workflows have the necessary permissions in `Settings` → `Actions` → `General`.

## Configuration

The bot requires the following secrets to be configured in your repository.

### Required Secrets

| Secret                | Description                                                               |
| --------------------- | ------------------------------------------------------------------------- |
| `BOT_APP_ID`          | Your GitHub App ID.                                                       |
| `BOT_PRIVATE_KEY`     | Your GitHub App private key in PEM format.                                |
| `OPENCODE_API_KEY`    | The default API key to be used if none is provided in the config.       |
| `OPENCODE_MODEL`      | The main model identifier (e.g., "opencode/big-pickle").                        |
| `OPENCODE_FAST_MODEL` | The fast model for quick responses an lesser tasks (e.g., "openai/gpt-3.5-turbo").        |

### Optional Secrets

| Secret                  | Description                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CUSTOM_PROVIDERS_JSON` | A single-line JSON string to define custom LLM providers, such as proxied services or self-hosted models. This enables the agent to connect to any compatible LLM API. |

**Example `CUSTOM_PROVIDERS_JSON`:**

To use a custom provider, create a `custom_providers.json` file:
```json
{
  "my-proxy": {
    "label": "My Custom Proxy",
    "options": {
      "apiKey": "your-secret-proxy-key",
      "baseURL": "https://my.proxy.com/v1"
    },
    "models": {
      "llama3-70b": {
        "label": "Llama 3 70B (via Proxy)"
      }
    }
  }
}
```
Then, use the `minify_json_secret.py` script to convert it into a single-line string for the GitHub secret:
```bash
python minify_json_secret.py custom_providers.json
```
The output can be pasted into the `CUSTOM_PROVIDERS_JSON` secret. You can then set `OPENCODE_MODEL` to `my-proxy/llama3-70b` in your secrets to use this model.

## Reusable Bot Setup Action

The reusable bot setup action (`.github/actions/bot-setup/action.yml`) is a composite action that centralizes all common setup tasks across workflows. This approach eliminates code duplication and ensures consistent behavior.

### Features

-   **Generates Dynamic Provider Configuration**: Creates the `opencode.json` file at runtime to enable integration with any standard or custom LLM provider.
-   **Manages GitHub App Authentication**: Generates a GitHub App token for API access.
-   **Configures Git Identity**: Sets up the bot's user name and email for git operations.
-   **Installs Dependencies**: Installs Python dependencies and the OpenCode CLI.

### Usage in Workflows

```yaml
- name: Bot Setup
  id: setup
  uses: ./.github/actions/bot-setup
  with:
    bot-app-id: ${{ secrets.BOT_APP_ID }}
    bot-private-key: ${{ secrets.BOT_PRIVATE_KEY }}
    opencode-api-key: ${{ secrets.OPENCODE_API_KEY }}
    opencode-model: ${{ secrets.OPENCODE_MODEL }}
    opencode-fast-model: ${{ secrets.OPENCODE_FAST_MODEL }}
    custom-providers-json: ${{ secrets.CUSTOM_PROVIDERS_JSON }}
```

### Outputs

-   `token`: The generated GitHub App token for API access.

## API Documentation

### Command Reference

The bot responds to the following commands:

**Mention-based triggers:**
- `@mirrobot-agent <request>` - General assistance
- `@mirrobot-agent review this` - Request a PR review
- `@mirrobot-agent analyze this` - Request an issue analysis

**Slash commands:**
- `/mirrobot-review` or `/mirrobot_review` - Manually trigger a review for a PR.

### Response Patterns

The bot follows specific response patterns:
1.  **Acknowledgement**: An initial response indicating it's working on the request.
2.  **Analysis**: A detailed breakdown of the issue or PR.
3.  **Recommendations**: Actionable suggestions for next steps.
4.  **Summary**: A concise overview of its findings.

### Limitations

-   Response time depends on LLM service availability.
-   Complex analysis may take several minutes.
-   The bot cannot modify code directly (it can only post comments).
-   Self-reviews have special handling to avoid infinite loops.

## Development Guide

### Project Structure

```
.github/
├── actions/
│   └── bot-setup/
│       └── action.yml       # Reusable bot setup action
├── workflows/
│   ├── issue-comment.yml    # Issue analysis workflow
│   ├── pr-review.yml        # Enhanced PR review workflow
│   ├── bot-reply.yml        # Bot response workflow
│   └── opencode.yml         # OpenCode integration
└── prompts/
    ├── bot-reply.md         # Core bot logic and prompts
    └── pr-review.md         # PR review specific prompts
```

### Contributing Guidelines

We welcome contributions! Please follow these guidelines:

1.  **Fork the Repository** and clone it locally.
2.  **Create a Feature Branch** (`git checkout -b feature/amazing-feature`).
3.  **Make Your Changes**, following existing code style and patterns.
4.  **Commit Your Changes** with descriptive commit messages.
5.  **Push to Your Fork** (`git push origin feature/amazing-feature`).
6.  **Open a Pull Request** with a clear description of your changes.

### Testing
- Test workflows in a personal repository first.
- Verify all secret configurations work correctly.
- Test both issue analysis and PR review functionality.

### Code Style
- Follow standard GitHub Actions workflow syntax.
- Use descriptive variable and secret names.
- Include comments for complex logic.
- Maintain consistent formatting.

## Troubleshooting

### Common Issues

-   **Workflow Not Triggering**: Check that workflows are enabled in your repository settings and that the bot has the necessary permissions.
-   **Authentication Errors**: Verify your GitHub App credentials and that the app is installed on the target repository.
-   **LLM Proxy Connection Issues**: Verify the proxy URL and API key and ensure your LLM service is operational.
-   **Self-Review Failures**: The bot may fail to post comments if reviewing its own code due to API limitations. A human maintainer should manually review the PR if this occurs.

### Debugging

To debug workflow issues:
1. Check the GitHub Actions logs for detailed error messages.
2. Verify all required secrets are properly configured.
3. Test with simple issues/PRs first to isolate problems.

## Security Considerations

### Permissions

This bot requires the following GitHub permissions:
-   **Contents**: `Read & Write`
-   **Issues**: `Read & Write`
-   **Pull Requests**: `Read & Write`
-   **Metadata**: `Read-only`

### Data Handling

-   The bot processes issue/PR content through external LLM services.
-   No sensitive data is stored permanently.
-   Users should avoid posting secrets or sensitive information in issues/PRs.

### Best Practices
- Regularly rotate API keys and credentials.
- Monitor bot activity for unusual patterns.
- Restrict bot access to only necessary repositories.
- Review bot comments for accuracy and appropriateness.
- Implement rate limiting for LLM API calls to manage costs and quotas.
- Set up monitoring for API usage and response times.

### Rate Limiting and API Quotas
The bot relies on external LLM services which may have usage limits:
- **Rate Limits**: Most LLM APIs impose request limits per minute/hour.
- **Cost Management**: Monitor usage to avoid unexpected charges.
- **Fallback Strategies**: Configure fallback models for high-volume usage.
- **Error Handling**: The workflows include retry logic for temporary API failures.

## FAQ

**Q: Why isn't the bot responding to my mentions?**
**A:** Check that the workflow is enabled, the bot has the necessary permissions, and your mention uses the correct format (`@mirrobot-agent`).

**Q: Can I customize the bot's behavior?**
**A:** Yes! You can modify the prompt templates in `.github/prompts/` to change how the bot responds.

**Q: What happens if the bot makes a mistake?**
**A:** The bot is designed to be helpful but not perfect. If it provides incorrect information, you can correct it in a follow-up comment or open an issue to report the problem.

**Q: Can I use this for private repositories?**
**A:** Yes, the bot works with both public and private repositories, but you'll need to ensure proper GitHub App configuration for private repos.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.