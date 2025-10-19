# Mirrobot Agent

An AI-powered GitHub bot built with [OpenCode](https://opencode.ai) that automates issue analysis, pull request reviews, and documentation generation.

## Features

- **Automated Issue Analysis**: Automatically analyzes new issues, identifies root causes, and suggests solutions.
- **Intelligent PR Reviews**: Provides detailed code reviews with actionable feedback.
- **Documentation Generation**: Creates and maintains comprehensive project documentation.
- **Context-Aware Responses**: Understands full conversation context for accurate assistance.

## How It Works

This repository contains GitHub Actions workflows that trigger the Mirrobot agent to perform various tasks:

1. **Issue Analysis** (`issue-comment.yml`): Triggered when a new issue is opened. The agent analyzes the issue and provides an initial assessment.
2. **PR Review** (`pr-review.yml`): Triggered when a new pull request is opened. The agent performs a comprehensive code review.
3. **Bot Reply** (`bot-reply.yml`): Triggered when the bot is mentioned in any issue or PR comment. The agent responds to requests and questions.
4. **OpenCode Integration** (`opencode.yml`): Enables manual triggering of the agent through `/oc` or `/opencode` commands.

## Usage

To interact with the Mirrobot agent:

1. **Mention the bot** in any issue or PR comment: `@mirrobot-agent <your request>`
2. **Trigger manual analysis**:
   - For issues: Use the "Run workflow" button on the "Issue Analysis" action
   - For PRs: Use the "Run workflow" button on the "PR Review" action
3. **Manual OpenCode trigger**: Comment `/oc <your prompt>` or `/opencode <your prompt>` on any issue or PR (maintainers only)

## Configuration

The bot requires the following secrets to be configured in your repository:

- `BOT_APP_ID`: GitHub App ID
- `BOT_PRIVATE_KEY`: GitHub App private key
- `PROXY_BASE_URL`: Base URL for the LLM proxy
- `PROXY_API_KEY`: API key for the LLM proxy
- `OPENCODE_MODEL`: Main model identifier
- `OPENCODE_FAST_MODEL`: Fast model identifier

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.