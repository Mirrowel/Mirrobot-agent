# Mirrobot Agent

An AI-powered GitHub bot built with [OpenCode](https://opencode.ai) that automates issue analysis, pull request reviews, and documentation generation.

## Features

- **Automated Issue Analysis**: Automatically analyzes new issues, identifies root causes, and suggests solutions.
- **Intelligent PR Reviews**: Provides detailed code reviews with actionable feedback.
- **Documentation Generation**: Creates and maintains comprehensive project documentation.
- **Context-Aware Responses**: Understands full conversation context for accurate assistance.
- **Self-Review Capabilities**: Can review its own code and provide humorous self-assessments.

## How It Works

This repository contains GitHub Actions workflows that trigger the Mirrobot agent to perform various tasks. Each workflow follows a similar pattern:

1. **Event Trigger**: GitHub event (issue opened, PR opened, mention) triggers the workflow
2. **Context Gathering**: The workflow collects comprehensive context including issue/PR content, comments, and cross-references
3. **OpenCode Processing**: The context is sent to OpenCode for AI analysis using configured LLM models
4. **Response Generation**: OpenCode generates appropriate responses based on the analysis
5. **Comment Posting**: The workflow posts the generated response as comments on the issue/PR

### Core Workflows

1. **Issue Analysis** (`issue-comment.yml`): 
   - Triggered when a new issue is opened
   - The agent analyzes the issue and provides an initial assessment
   - Can also be manually triggered for existing issues

2. **PR Review** (`pr-review.yml`): 
   - Triggered when a new pull request is opened
   - The agent performs a comprehensive code review
   - Provides both line-specific comments and a summary review
   - Has special handling for self-reviews with a humorous tone

3. **Bot Reply** (`bot-reply.yml`): 
   - Triggered when the bot is mentioned in any issue or PR comment
   - The agent responds to requests and questions
   - Maintains context of the entire conversation thread

4. **OpenCode Integration** (`opencode.yml`): 
   - Enables manual triggering of the agent through `/oc` or `/opencode` commands
   - Restricted to repository maintainers (owners, members, collaborators)
   - Provides direct access to OpenCode's capabilities

### Workflow Details

#### Issue Analysis (`issue-comment.yml`)
This workflow handles issue analysis when issues are opened or manually triggered. It:
- Collects comprehensive issue context including comments and cross-references
- Uses OpenCode to analyze the issue and suggest solutions
- Posts an initial acknowledgment and a detailed analysis report

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
This workflow performs code reviews on pull requests. It:
- Gathers complete PR context including diffs, comments, and reviews
- Conducts a thorough code review focusing on high-impact issues
- Adapts its tone when reviewing its own code (self-reviews)
- Posts line-specific comments and a comprehensive summary

**Example Review Output:**
```
### Overall Assessment
This PR adds comprehensive documentation addressing issue #1. The structure follows logical progression from overview to detailed instructions.

### Architectural Feedback
The centralized README approach provides a single source of truth for users.

### Key Suggestions
- Consolidate duplicated configuration sections
- Add more technical specifics about workflow internals
- Include rate limiting information for LLM services
```

#### Bot Reply (`bot-reply.yml`)
This workflow enables interactive conversations with the bot. It:
- Responds when mentioned in issue or PR comments
- Maintains full context of the conversation thread
- Can assist with a wide variety of tasks from code questions to workflow explanations

**Example Response Pattern:**
```
@user I'll help analyze this issue. Let me gather the context and provide a detailed assessment.

[Detailed analysis follows...]
```

#### OpenCode Integration (`opencode.yml`)
This workflow provides direct access to OpenCode's capabilities. It:
- Allows maintainers to trigger custom OpenCode prompts
- Provides flexibility for specialized tasks not covered by other workflows
- Requires maintainer permissions for security

## Usage

To interact with the Mirrobot agent:

1. **Mention the bot** in any issue or PR comment: `@mirrobot-agent <your request>`
2. **Trigger manual analysis**:
   - For issues: Use the "Run workflow" button on the "Issue Analysis" action
   - For PRs: Use the "Run workflow" button on the "PR Review" action
3. **Manual OpenCode trigger**: Comment `/oc <your prompt>` or `/opencode <your prompt>` on any issue or PR (maintainers only)

## Installation Guide

### Prerequisites
- A GitHub repository where you want to deploy the bot
- GitHub App credentials (App ID and Private Key)
- Access to an LLM proxy service

### Step-by-Step Setup

1. **Fork or Clone this Repository**
   - Fork this repository to your GitHub account
   - Clone the repository to your local machine

2. **Configure Repository Secrets**
   - Go to your repository Settings → Secrets and variables → Actions
   - Add the following secrets:
     - `BOT_APP_ID`: Your GitHub App ID
     - `BOT_PRIVATE_KEY`: Your GitHub App private key (PEM format)
     - `PROXY_BASE_URL`: Base URL for your LLM proxy service
     - `PROXY_API_KEY`: API key for your LLM proxy service
     - `OPENCODE_MODEL`: Main model identifier (e.g., "gpt-4")
     - `OPENCODE_FAST_MODEL`: Fast model identifier (e.g., "gpt-3.5-turbo")

3. **Activate Workflows**
   - The workflows are automatically activated when you push the code
   - Ensure all workflows have the necessary permissions in Settings → Actions → General

## Configuration

### Repository Secrets
The bot requires the following secrets to be configured in your repository. These should be added to your repository's Settings → Secrets and variables → Actions:

- `BOT_APP_ID`: GitHub App ID (numeric identifier)
- `BOT_PRIVATE_KEY`: GitHub App private key in PEM format
- `PROXY_BASE_URL`: Base URL for your LLM proxy service
- `PROXY_API_KEY`: API key for authenticating with your LLM proxy
- `OPENCODE_MODEL`: Main model identifier (e.g., "gpt-4") 
- `OPENCODE_FAST_MODEL`: Fast model identifier for quick responses (e.g., "gpt-3.5-turbo")

### Workflow Configuration
Each workflow is configured to run automatically based on GitHub events. No additional configuration is required beyond the secrets above. The workflows will automatically detect when they should run based on repository events.

## Troubleshooting

### Common Issues

**Workflow Not Triggering**
- Check that workflows are enabled in your repository settings
- Verify that the triggering events (issue opened, PR opened, mentions) are occurring
- Ensure the bot has the necessary permissions to read and write to the repository

**Authentication Errors**
- Verify your GitHub App credentials are correct
- Check that the private key is in the correct PEM format
- Ensure the GitHub App is installed on the target repository

**LLM Proxy Connection Issues**
- Verify the proxy URL and API key are correct
- Check that your LLM service is operational
- Ensure the proxy service allows requests from GitHub Actions IP ranges

**Self-Review Failures**
- The bot may fail to post comments if reviewing its own code due to API limitations
- If this occurs, a human maintainer should manually review the PR

### Debugging

To debug workflow issues:
1. Check the GitHub Actions logs for detailed error messages
2. Verify all required secrets are properly configured
3. Test with simple issues/PRs first to isolate problems

## Examples and Use Cases

### Issue Analysis Example
When a new issue is opened, the bot automatically analyzes it and provides:
- Root cause identification
- Suggested solutions
- Links to relevant documentation
- Assessment of issue severity and priority

### PR Review Example
When a PR is opened, the bot performs a comprehensive review:
- Line-specific comments for code improvements
- Architectural feedback
- Security considerations
- Performance optimizations
- Special humorous tone when reviewing its own code

### Self-Review Example
The bot has unique capabilities for reviewing its own contributions:
- Self-deprecating humor when critiquing its own code
- Honest assessment of implementation quality
- Suggestions for improving its own work
- Recognition of when it's being "too clever"

## Security Considerations

### Permissions
This bot requires the following GitHub permissions:
- **Contents**: Read & Write (to comment on issues/PRs)
- **Issues**: Read & Write (to analyze and respond to issues)
- **Pull Requests**: Read & Write (to review PRs and post comments)
- **Metadata**: Read-only (to access repository information)

### Data Handling
- The bot processes issue/PR content through external LLM services
- No sensitive data is stored permanently
- All API calls are logged for debugging purposes
- Users should avoid posting secrets or sensitive information in issues/PRs

### Best Practices
- Regularly rotate API keys and credentials
- Monitor bot activity for unusual patterns
- Restrict bot access to only necessary repositories
- Review bot comments for accuracy and appropriateness
- Implement rate limiting for LLM API calls to manage costs and quotas
- Set up monitoring for API usage and response times

### Rate Limiting and API Quotas
The bot relies on external LLM services which may have usage limits:
- **Rate Limits**: Most LLM APIs impose request limits per minute/hour
- **Cost Management**: Monitor usage to avoid unexpected charges
- **Fallback Strategies**: Configure fallback models for high-volume usage
- **Error Handling**: The workflows include retry logic for temporary API failures

## API Documentation

### Command Reference
The bot responds to the following commands:

**Mention-based triggers:**
- `@mirrobot-agent <request>` - General assistance
- `@mirrobot-agent review this` - Request PR review
- `@mirrobot-agent analyze this` - Request issue analysis

**Slash commands (maintainers only):**
- `/oc <prompt>` - Direct OpenCode prompt
- `/opencode <prompt>` - Alternative OpenCode trigger

### Response Patterns
The bot follows specific response patterns:
1. **Acknowledgement**: Initial response indicating it's working on the request
2. **Analysis**: Detailed breakdown of the issue/PR
3. **Recommendations**: Actionable suggestions for next steps
4. **Summary**: Concise overview of findings

### Limitations
- Response time depends on LLM service availability
- Complex analysis may take several minutes
- The bot cannot modify code directly (only comment)
- Self-reviews have special handling to avoid infinite loops

## Development Guide

### Project Structure
```
.github/
├── workflows/
│   ├── issue-comment.yml    # Issue analysis workflow
│   ├── pr-review.yml        # PR review workflow
│   ├── bot-reply.yml        # Bot response workflow
│   └── opencode.yml         # OpenCode integration
└── prompts/
    └── bot-reply.md         # Core bot logic and prompts
```

### Contributing Guidelines

We welcome contributions! Please follow these guidelines:

1. **Fork the Repository**
   - Create a personal fork of the project
   - Clone your fork locally

2. **Create a Feature Branch**
   - `git checkout -b feature/amazing-feature`

3. **Make Your Changes**
   - Follow existing code style and patterns
   - Add tests for new functionality
   - Update documentation as needed

4. **Commit Your Changes**
   - Use descriptive commit messages
   - Reference related issues in commit messages

5. **Push to Your Fork**
   - `git push origin feature/amazing-feature`

6. **Open a Pull Request**
   - Provide a clear description of your changes
   - Reference any related issues
   - Wait for review and feedback

### Testing
- Test workflows in a personal repository first
- Verify all secret configurations work correctly
- Test both issue analysis and PR review functionality

### Code Style
- Follow standard GitHub Actions workflow syntax
- Use descriptive variable and secret names
- Include comments for complex logic
- Maintain consistent formatting

## FAQ

### Q: Why isn't the bot responding to my mentions?
A: Check that:
- The workflow is enabled in your repository
- The bot has the necessary permissions
- Your mention uses the correct format: `@mirrobot-agent`

### Q: Can I customize the bot's behavior?
A: Yes! You can modify the prompt templates in `.github/prompts/bot-reply.md` to change how the bot responds.

### Q: What happens if the bot makes a mistake?
A: The bot is designed to be helpful but not perfect. If it provides incorrect information, you can:
- Correct it in a follow-up comment
- Disable specific workflows if needed
- Open an issue to report the problem

### Q: Is my data safe with this bot?
A: The bot only processes public repository content. It doesn't store sensitive information, but you should avoid posting secrets in issues/PRs regardless.

### Q: Can I use this for private repositories?
A: Yes, the bot works with both public and private repositories, but you'll need to ensure proper GitHub App configuration for private repos.

### Q: How do I report a bug or request a feature?
A: Please open an issue in this repository with a detailed description of the problem or feature request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.