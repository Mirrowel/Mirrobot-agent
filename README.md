# Mirrobot Agent

> **Production-ready AI GitHub bot powered by [OpenCode](https://opencode.ai)**
> Automate issue analysis, PR reviews, and intelligent collaboration — completely free for open-source projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Powered by OpenCode](https://img.shields.io/badge/Powered%20by-OpenCode-blue)](https://opencode.ai)
[![GitHub Actions](https://img.shields.io/badge/Runs%20on-GitHub%20Actions-2088FF?logo=github-actions&logoColor=white)](https://github.com/features/actions)

---

## Why Mirrobot Agent?

Mirrobot Agent delivers enterprise-grade AI automation for GitHub — **perfect for open-source projects and small-to-medium teams** — without the cost or complexity of paid alternatives.

### ✨ Key Advantages

| Feature | Mirrobot Agent | Paid Alternatives (Ellipsis, etc.) |
|---------|----------------|-------------------------------------|
| **Cost for Open Source** | **FREE** (GitHub Actions minutes free on public repos) | $10-50+/user/month |
| **Infrastructure Required** | None — runs on GitHub Actions | SaaS only, or self-hosted servers |
| **LLM Provider** | Any provider (OpenAI, Anthropic, self-hosted, proxies) | Locked to specific providers |
| **Model Selection** | Full control (main + fast models, reasoning support) | Limited options |
| **Customization** | Complete (edit prompts, workflows, behavior) | Limited customization |
| **Privacy** | Your infrastructure, your data | Third-party processing |
| **Setup Time** | ~10 minutes | Varies |
| **BYOK (Bring Your Own Key)** | ✅ Full support | ⚠️ Limited or no support |

### 🎯 Perfect For

- **Open-Source Projects**: Leverage free GitHub Actions minutes on public repositories
- **Small-to-Medium Teams**: Private repos get 2,000 free minutes/month — enough for most projects
- **Cost-Conscious Teams**: Only pay for LLM API usage, no per-seat licensing
- **Privacy-First Organizations**: Keep your code and data on your infrastructure
- **Teams Wanting Control**: Full transparency and customization of AI behavior

---

## Table of Contents
- [Features](#features)
- [How It Works](#how-it-works)
- [Quick Start](#quick-start)
- [Core Workflows](#core-workflows)
- [Configuration](#configuration)
- [Advanced Features](#advanced-features)
- [Usage Guide](#usage-guide)
- [API Documentation](#api-documentation)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Development Guide](#development-guide)
- [FAQ](#faq)
- [Credits](#credits)
- [License](#license)

---

## Features

### 🔍 Automated Issue Analysis
Automatically triages and analyzes new issues with intelligent context gathering:
- **Duplicate Detection**: Searches existing issues to identify duplicates
- **Root Cause Analysis**: Explores codebase using git commands (grep, log, blame)
- **Structured Reports**: Posts detailed analysis with validation status, root cause, and next steps
- **Smart Labeling**: Suggests appropriate labels based on issue content

**Example Output:**
```markdown
### Issue Assessment
Based on my analysis, this appears to be a documentation gap. The user is requesting
clearer installation instructions for Windows environments.

### Root Cause
The current README.md lacks platform-specific setup guidance, particularly for Windows users.

### Suggested Solution
1. Add dedicated Windows installation section with prerequisites
2. Include troubleshooting guidance for common PATH issues
3. Provide PowerShell script examples as alternative to bash

### Recommended Labels
`documentation`, `good first issue`
```

### 🧠 Intelligent PR Reviews
Production-ready code reviews with a **HIGH-SIGNAL, LOW-NOISE** philosophy:

- **Three-Phase Bundling**: Collect findings → Curate (filter noise) → Submit single bundled review
- **Incremental Reviews**: Tracks last reviewed commit SHA, only reviews new changes
- **Smart Context Filtering**: Excludes outdated comments, dismissed reviews, and duplicate information
- **Formal GitHub Review States**: Uses APPROVE/REQUEST_CHANGES/COMMENT appropriately
- **Curated Feedback**: Limits to 5-15 most valuable comments (no trivial noise)
- **Self-Review Detection**: Humorous tone when reviewing its own code

**Example Review:**
```markdown
### Overall Assessment
This PR introduces a robust authentication flow with good error handling. I've identified
a few areas for improvement around edge cases and security hardening.

**Review Event**: REQUEST_CHANGES

### Key Findings
- **src/auth.js:45**: Add try-catch block for token validation to handle network failures gracefully
- **src/routes.js:112**: This protected route is missing authorization middleware
- **src/utils/token.js:28**: Consider adding token expiration validation before use
```

### 💬 Context-Aware Bot Replies
Intelligent assistance when mentioned in any issue or PR comment:
- **Full Conversation Context**: Understands complete discussion history
- **Multi-Strategy Responses**: Automatically selects approach (Conversationalist, Investigator, Code Reviewer, Code Contributor, Repository Manager)
- **Code-Aware**: Has access to full PR diff for accurate technical responses
- **Proactive Investigation**: Can explore codebase using git commands

### 🛡️ Production-Ready Reliability
- **Three-Level Error Recovery**: Automatic recovery for predictable errors, graceful degradation
- **Prompt Injection Protection**: Saves prompts from base branch before PR checkout
- **Secret Safety**: Explicit prevention of token/credential exposure
- **Robust Workflow Management**: Prevents modification of workflow files by AI

---

## How It Works

Mirrobot Agent is a **sophisticated GitHub Actions integration framework** built on OpenCode, providing production-ready workflows, prompt engineering, and context orchestration.

### Architecture

```
┌─────────────────┐
│  GitHub Event   │  (Issue opened, PR opened, @mention, etc.)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│          Workflow Orchestration Layer               │
│  • Event detection & routing                        │
│  • Concurrency control                              │
│  • Workflow-specific logic                          │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│          Context Assembly & Filtering               │
│  • Gather PR/issue metadata                         │
│  • Filter outdated/dismissed comments               │
│  • Fetch linked issues & cross-references           │
│  • Generate diffs (full or incremental)             │
│  • Track review state (last reviewed SHA)           │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│          OpenCode (AI Engine)                       │
│  • Processes context with engineered prompts        │
│  • Performs analysis using configured LLM           │
│  • Generates structured responses                   │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│          Response Delivery                          │
│  • Format as GitHub comments/reviews                │
│  • Post using GitHub API                            │
│  • Update review state metadata                     │
└─────────────────────────────────────────────────────┘
```

### What Mirrobot Agent Provides

- **Workflow Framework**: Pre-built GitHub Actions workflows for common bot scenarios
- **Prompt Engineering**: Production-tested prompts for reviews, analysis, and assistance
- **Context Orchestration**: Sophisticated logic for gathering and filtering relevant information
- **State Management**: Tracks review history, filters noise, handles incremental updates
- **GitHub Integration**: Seamless API interactions, error handling, security protections
- **Provider Flexibility**: Dynamic configuration system for any OpenAI-compatible LLM provider

### What OpenCode Provides

- **AI Engine**: Natural language understanding and generation
- **Multi-Provider Support**: Integration with OpenAI, Anthropic, custom providers, and more
- **Tool Execution**: Ability to run bash commands, explore codebases, generate structured outputs

---

## Quick Start

### Prerequisites

1. **GitHub Repository** (public for free Actions minutes, or private with free tier)
2. **GitHub App Credentials** ([Create a GitHub App](https://docs.github.com/en/apps/creating-github-apps))
   - App ID
   - Private Key (PEM format)
   - Permissions: Contents (read), Issues (read/write), Pull Requests (read/write)
3. **LLM API Access** (OpenAI, Anthropic, or any OpenAI-compatible provider)

### Installation (10 Minutes)

1. **Fork or Copy This Repository**
   ```bash
   gh repo fork Mirrowel/Mirrobot-agent
   # or clone and copy .github/ directory to your repo
   ```

2. **Configure Repository Secrets**

   Navigate to: `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

   Add the following secrets:

   | Secret | Description | Example |
   |--------|-------------|---------|
   | `BOT_APP_ID` | Your GitHub App ID | `123456` |
   | `BOT_PRIVATE_KEY` | GitHub App private key (full PEM format) | `-----BEGIN RSA PRIVATE KEY-----\n...` |
   | `OPENCODE_API_KEY` | Your LLM provider API key | `sk-...` |
   | `OPENCODE_MODEL` | Main model identifier | `openai/gpt-4o` or `anthropic/claude-sonnet-4` |
   | `OPENCODE_FAST_MODEL` | Fast model for quick tasks | `openai/gpt-4o-mini` |

3. **Enable Workflows**

   Navigate to: `Actions` tab → Enable workflows if prompted

4. **Test It**

   - Open a new issue → Bot automatically analyzes it
   - Open a PR → Bot automatically reviews it
   - Comment `@mirrobot-agent help` → Bot responds

🎉 **Done!** Your bot is now active.

---

## Core Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| **Issue Analysis** | `issues: [opened]`, manual dispatch | Analyzes new issues, detects duplicates, identifies root causes |
| **PR Review** | `pull_request_target: [opened, ready_for_review]`, `/mirrobot-review` command | Comprehensive bundled code reviews with incremental diff support |
| **Compliance Check** | PR labeled `ready-for-merge`, `ready_for_review` (waits for PR Review first), `/mirrobot-check` command | AI-powered merge readiness verification with file group consistency checks |
| **Status Check Init** | `pull_request: [opened, synchronize, reopened]` | Initializes pending compliance status check on PRs |
| **Bot Reply** | `issue_comment: [created]` (when @mentioned) | Context-aware assistance in issues and PRs |
| **OpenCode (Legacy)** | `/oc` or `/opencode` command | Manual agent triggering (maintainers only) |

### Workflow Details

#### Issue Analysis (`issue-comment.yml`)

**Triggers:**
- Automatically when an issue is opened
- Manually via workflow dispatch

**Process:**
1. Fetches issue metadata, comments, and cross-references
2. Searches repository for potential duplicates
3. Explores codebase using git commands (grep, log, blame)
4. Posts acknowledgment, then detailed analysis report
5. Suggests labels and next steps

**Smart Features:**
- Timeline API integration for cross-references
- Git-based codebase exploration
- Structured markdown output

#### PR Review (`pr-review.yml`)

**Triggers:**
- New PR opened (non-draft)
- PR marked "ready for review"
- PR updated (if labeled `Agent Monitored`)
- Comment command: `/mirrobot-review` or `/mirrobot_review`
- Manual dispatch with PR number

**Process:**
1. **Context Gathering**: Fetches full PR metadata, filters discussions, retrieves linked issues
2. **Diff Generation**: Creates incremental diff (current HEAD vs last reviewed SHA) or full diff
3. **OpenCode Analysis**: Processes with three-phase prompt (Collect → Curate → Submit)
4. **Review Submission**: Posts single bundled GitHub Review with appropriate state
5. **State Tracking**: Saves reviewed SHA for next incremental review

**Advanced Features:**
- **Incremental Reviews**: Only analyzes changes since last review
- **Smart Filtering**: Excludes outdated comments, dismissed reviews, purely informational reviews
- **Bundled Output**: Single GitHub Review (not scattered comments)
- **Concurrency Control**: Prevents duplicate reviews on same PR
- **Diff Truncation**: Limits to 500KB to avoid context overflow
- **Self-Review Detection**: Changes tone when reviewing own code

**Example Triggers:**
```yaml
# Always runs
- PR opened (not draft)
- PR marked ready_for_review

# Conditionally runs
- PR synchronized (if has "Agent Monitored" label)

# Manual triggers
- Comment: /mirrobot-review
- Workflow dispatch with PR number
```

#### Compliance Check (`compliance-check.yml`)

**Purpose:**  
AI-powered compliance agent that verifies PRs are ready for merge by checking file group consistency, documentation updates, and enforcing project-specific merge requirements.

**Triggers:**
- PR labeled with `ready-for-merge` (runs immediately)
- PR marked ready for review (waits for PR Review to complete first)
- Comment command: `/mirrobot-check` or `/mirrobot_check` (runs immediately)
- Manual workflow dispatch with PR number (runs immediately)

**Workflow Dependency:**
- When triggered by `ready_for_review`, automatically waits for PR Review workflow to complete before starting compliance check
- When triggered independently (labels, comments, manual), runs immediately without waiting
- Ensures sequential execution (PR Review → Compliance Check) only when both workflows trigger together
- Prevents race conditions and ensures compliance check has access to fresh review context

**Security Model:**
The compliance check workflow implements a robust security model to prevent prompt injection attacks:
- Uses `pull_request_target` trigger to run workflow from the **base branch** (trusted code)
- Saves prompt file from base branch **BEFORE** checking out PR code
- Prevents malicious PRs from modifying workflow behavior or injecting code into AI prompts
- Isolates untrusted PR code from trusted prompt engineering

**Process (6 Phases):**

1. **Secure Setup**
   - Checkout base branch to access trusted prompt file
   - Initialize bot credentials and OpenCode API access
   - Establish minimal permissions (contents: read, pull-requests: write, statuses: write)

2. **Gather PR Context**
   - Fetch PR metadata: title, author, files changed, labels, reviewers
   - Retrieve previous compliance check results for historical tracking
   - Extract changed files as both space-separated list and JSON array

3. **Security Checkpoint**
   - **CRITICAL**: Save trusted prompt from base branch to `/tmp/` 
   - Checkout PR head for diff generation (now safe, prompt is secured)
   - Generate unified diff of all PR changes (with 500KB truncation limit)

4. **Prepare AI Context**
   - Format file groups configuration into human-readable format
   - Generate report template with placeholders for AI analysis
   - Prepare environment variables for prompt assembly

5. **AI Analysis**
   - Assemble compliance prompt using trusted template from `/tmp/`
   - Execute OpenCode with controlled bash permissions (gh, git, jq, cat only)
   - AI conducts multiple-turn analysis (5-20+ turns expected)
   - Posts findings as PR comment with compliance status

6. **Post-Processing** (Optional)
   - Prepend reviewer mentions if `ENABLE_REVIEWER_MENTIONS` is enabled
   - Verify posted comment contains required footers:
     - Compliance signature: `_Compliance verification by AI agent`
     - Tracking marker: `<!-- compliance-check-id: PR_NUMBER-SHA -->`

**File Groups Configuration:**

The workflow uses a configurable `FILE_GROUPS_JSON` environment variable to define related file groups:

```json
[
  {
    "name": "Workflow Configuration",
    "description": "When code changes affect build process, verify build.yml is updated...",
    "files": [".github/workflows/*.yml"]
  },
  {
    "name": "Documentation",
    "description": "Ensure README reflects code changes...",
    "files": ["README.md", "docs/**/*.md", "CHANGELOG.md"]
  },
  {
    "name": "Dependencies",
    "description": "When manifests change, lockfiles MUST be regenerated...",
    "files": ["package.json", "package-lock.json", "Cargo.toml", "Cargo.lock"]
  }
]
```

**AI Behavior:**
- **Multiple-Turn Analysis**: AI iterates through file groups and issues (one per turn)
- **Detailed Issue Descriptions**: Creates comprehensive findings for future reference
- **Structured Output**: Posts compliance report with status, summary, file group analysis, and next steps
- **Status Checks**: Updates GitHub status check API with compliance results

**Concurrency Control:**
- Prevents concurrent runs for the same PR
- Uses group: `${{ github.workflow }}-${{ github.event.pull_request.number }}`
- Does not cancel in-progress runs (waits for completion)

**Customization:**
- **Toggle Features**: Set `ENABLE_REVIEWER_MENTIONS` to `true`/`false`
- **File Groups**: Modify `FILE_GROUPS_JSON` to match project structure
- **Bash Permissions**: Adjust `OPENCODE_PERMISSION` to control allowed commands

**Example Output:**
```markdown
## 🔍 Compliance Check Results

### Status: ⚠️ ISSUES FOUND

**PR**: #123 - Add new authentication feature
**Author**: @developer
**Commit**: abc123def
**Checked**: 2025-11-21 04:30:00 UTC

---

### 📊 Summary
This PR introduces authentication changes but is missing required documentation updates and workflow configuration changes.

---

### 📁 File Groups Analyzed

**Workflow Configuration**: ⚠️ WARNING
- Build pipeline changes detected in src/auth.js
- .github/workflows/build.yml not updated with new auth flow

**Documentation**: ❌ MISSING
- New authentication feature added
- README.md section on authentication not updated
- CHANGELOG.md missing entry for this feature

**Dependencies**: ✅ PASSED
- No dependency changes in this PR

---

### 🎯 Overall Assessment
This PR requires documentation updates before merge.

### 📝 Next Steps
1. Update README.md authentication section
2. Add build.yml configuration for auth service
3. Document changes in CHANGELOG.md
```

#### Status Check Init (`status-check-init.yml`)

**Purpose:**  
Initializes a pending compliance status check on pull requests to indicate that compliance verification is required before merge.

**Triggers:**
- PR opened
- PR synchronized (new commits pushed)
- PR reopened

**Process:**
1. Sets GitHub status check to **pending** state
2. Uses status context: `compliance-check`
3. Displays message: "Awaiting compliance verification - run /mirrobot-check when ready to merge"

**Integration with Compliance Check:**
- This workflow initializes the status as **pending**
- The `compliance-check.yml` workflow updates the status to **success** or **failure**
- Together, they enforce merge requirements via branch protection rules

**Branch Protection Setup:**
To require compliance checks before merge, configure branch protection:
1. Repository Settings → Branches → Branch protection rules
2. Check "Require status checks to pass before merging"
3. Select `compliance-check` status
4. PRs will be blocked from merge until compliance check passes

**Permissions:**
- Minimal: `statuses: write` only
- Does not require repository contents access
- Runs quickly (< 5 seconds)

#### Bot Reply (`bot-reply.yml`)

**Triggers:**
- Any comment mentioning `@mirrobot-agent` in issues or PRs

**Process:**
1. Detects mention in comment
2. Gathers full conversation context
3. For PRs: checks out code, includes diff
4. OpenCode selects strategy (Conversationalist, Investigator, Code Reviewer, etc.)
5. Posts detailed response

**Multi-Strategy System:**
- **Conversationalist**: Answers questions, provides guidance
- **Investigator**: Explores codebase, searches for information
- **Code Reviewer**: Analyzes code quality, suggests improvements
- **Code Contributor**: Proposes code changes
- **Repository Manager**: Handles labels, issues, project management

---

## Configuration

### Required Secrets

| Secret | Description | Where to Get It |
|--------|-------------|-----------------|
| `BOT_APP_ID` | GitHub App ID | GitHub App settings page |
| `BOT_PRIVATE_KEY` | GitHub App private key | Generated when creating GitHub App (PEM format) |
| `OPENCODE_API_KEY` | LLM provider API key | Your LLM provider (OpenAI, Anthropic, etc.) |
| `OPENCODE_MODEL` | Main model identifier | e.g., `openai/gpt-4o`, `anthropic/claude-sonnet-4` |
| `OPENCODE_FAST_MODEL` | Fast model for quick responses | e.g., `openai/gpt-4o-mini` |

### Optional Secrets

| Secret | Description |
|--------|-------------|
| `CUSTOM_PROVIDERS_JSON` | Single-line JSON defining custom LLM providers (see below) |

### Using Custom Providers

Mirrobot Agent supports **any OpenAI-compatible LLM provider** through custom provider definitions. This enables:
- Self-hosted models (Ollama, vLLM, etc.)
- LLM proxy services
- Regional providers
- Multiple providers with different models

#### Setup Process

1. **Create `custom_providers.json`**

```json
{
  "my-proxy": {
    "npm": "@ai-sdk/openai-compatible",
    "name": "My Custom LLM Proxy",
    "options": {
      "apiKey": "your-secret-api-key",
      "baseURL": "https://api.my-proxy.com/v1",
      "timeout": 300000
    },
    "models": {
      "llama-3-70b": {
        "id": "llama-3-70b-instruct",
        "name": "Llama 3 70B Instruct",
        "limit": {
          "context": 128000,
          "output": 4096
        }
      },
      "deepseek-r1": {
        "id": "deepseek-r1-distill-llama-70b",
        "name": "DeepSeek R1 (Reasoning Model)",
        "reasoning": true,
        "limit": {
          "context": 64000,
          "output": 8192
        }
      }
    }
  },
  "ollama-local": {
    "npm": "@ai-sdk/openai-compatible",
    "name": "Local Ollama",
    "options": {
      "apiKey": "ollama",
      "baseURL": "http://localhost:11434/v1"
    },
    "models": {
      "qwen-coder": {
        "id": "qwen2.5-coder:32b",
        "name": "Qwen 2.5 Coder 32B"
      }
    }
  }
}
```

2. **Minify to Single Line**

Use the provided script:
```bash
python minify_json_secret.py custom_providers.json
```

Copy the output.

3. **Add as GitHub Secret**

Create secret `CUSTOM_PROVIDERS_JSON` with the minified JSON string.

4. **Configure Model Secrets**

Set your model identifiers:
```
OPENCODE_MODEL=my-proxy/llama-3-70b
OPENCODE_FAST_MODEL=my-proxy/deepseek-r1
```

#### Reasoning Model Support

Mirrobot Agent supports reasoning models (DeepSeek R1, GPT-o1, etc.) that use extended thinking:

```json
{
  "my-provider": {
    "models": {
      "reasoning-model": {
        "id": "deepseek-r1",
        "name": "DeepSeek R1",
        "reasoning": true,  // Enables reasoning support
        "limit": {
          "context": 64000,
          "output": 8192
        }
      }
    }
  }
}
```

The bot-setup action can automatically add `reasoning_effort: "high"` for extended thinking (toggle in `.github/actions/bot-setup/action.yml`).

---

## Advanced Features

### Incremental PR Reviews

Mirrobot Agent tracks the last reviewed commit SHA and only reviews new changes on subsequent runs.

**How It Works:**
1. First review: Analyzes full PR diff
2. Saves reviewed SHA in review comment metadata (hidden)
3. Subsequent reviews: Generates diff between last SHA and current HEAD
4. Fallback: If SHA not found (after rebase), falls back to full review

**Benefits:**
- Faster reviews on large PRs
- Reduces redundant feedback
- Lower LLM API costs
- Better user experience (only see feedback on new changes)

### Context Filtering

**Problem**: Raw PR discussions include noise (outdated comments, dismissed reviews, purely informational reviews)

**Solution**: Mirrobot Agent intelligently filters:
- ❌ Outdated inline comments (resolved in later commits)
- ❌ Dismissed reviews (no longer relevant)
- ❌ "COMMENTED" review events (duplicates inline comment data)
- ✅ Active inline comments
- ✅ Approved/Changes Requested reviews
- ✅ Linked issue content
- ✅ Cross-references

**Result**: Cleaner context → More focused AI analysis → Better reviews

### Bundled Reviews

**Traditional Approach**: Many bots post individual comments as they analyze

**Mirrobot Agent Approach**: Three-phase bundling
1. **Collect**: AI analyzes full diff, generates all potential findings internally
2. **Curate**: Filters findings using HIGH-SIGNAL, LOW-NOISE philosophy (5-15 comments max)
3. **Submit**: Posts single GitHub Review with bundled line comments + summary

**Benefits:**
- Clean PR timeline (one review vs dozens of comments)
- Single notification for author
- Easier to digest feedback
- Professional presentation

### Multi-Strategy Bot Replies

When mentioned in a comment, the bot automatically selects the appropriate strategy:

| Strategy | When Used | Capabilities |
|----------|-----------|--------------|
| **Conversationalist** | General questions, discussions | Answer questions, provide guidance |
| **Investigator** | "Find...", "Search...", "Where is..." | Git grep, log, blame, file exploration |
| **Code Reviewer** | "Review this", "Check this code" | Analyzes code quality, suggests improvements |
| **Code Contributor** | "Fix this", "Implement..." | Proposes code changes (commented, not committed) |
| **Repository Manager** | "Label this", "Close this" | Manages issues, labels, project management |

**Example:**
```
@mirrobot-agent Where is the authentication logic implemented?

→ Investigator strategy: Searches codebase using git grep, analyzes results, provides file locations
```

### Self-Review Detection

When reviewing its own PRs, Mirrobot Agent:
- Detects PR author matches bot identity
- Switches to humorous, self-deprecating tone
- Omits "Questions for the Author" section
- Still provides valuable technical feedback

**Example:**
```markdown
### Self-Review Alert 🤖
Well, well, well... reviewing my own code. This feels like grading my own homework.

### Analysis
Despite my algorithmic bias toward my own brilliance, I must admit there are
a few areas that could use improvement...
```

---

## Usage Guide

### Triggering the Bot

#### 1. Automatic Triggers

- **New Issue Opened** → Automatic analysis
- **New PR Opened** (non-draft) → Automatic review
- **PR Marked Ready for Review** → Automatic review, then Compliance check (sequential: review completes first, then compliance runs)
- **PR Updated** (if labeled `Agent Monitored`) → Automatic incremental review
- **PR Opened/Synchronized/Reopened** → Pending compliance status initialized

#### 2. Mention Triggers

Comment in any issue or PR:
```
@mirrobot-agent <your request>
```

**Examples:**
```
@mirrobot-agent Can you explain how the authentication flow works?
@mirrobot-agent Find all occurrences of the deprecated API usage
@mirrobot-agent Review this latest commit
@mirrobot-agent What tests should I add for this feature?
```

#### 3. Slash Commands

In PR comments:
```
/mirrobot-review
```
or
```
/mirrobot_review
```

For compliance checks:
```
/mirrobot-check
```
or
```
/mirrobot_check
```

#### 4. Manual Workflow Dispatch

Navigate to: `Actions` → Select workflow → `Run workflow`

- **Issue Analysis**: Requires issue number
- **PR Review**: Requires PR number

---

## API Documentation

### Bot Commands Reference

| Command | Context | Description |
|---------|---------|-------------|
| `@mirrobot-agent <request>` | Issues, PRs | General assistance, triggers appropriate strategy |
| `@mirrobot-agent review this` | PRs | Requests code review |
| `@mirrobot-agent analyze this` | Issues | Requests issue analysis |
| `@mirrobot-agent find <query>` | Any | Searches codebase using git grep |
| `/mirrobot-review` | PRs | Manually triggers PR review workflow |
| `/mirrobot-check` | PRs | Manually triggers compliance check workflow |
| `/oc <prompt>` | Any (maintainers only) | Custom OpenCode prompt |

### Response Patterns

**Issue Analysis:**
```markdown
### Issue Assessment
<High-level summary>

### Root Cause
<Technical analysis>

### Suggested Solution
<Numbered action items>

### Recommended Labels
<Comma-separated labels>
```

**PR Review:**
```markdown
### Overall Assessment
<Summary of PR quality>

**Review Event**: APPROVE | REQUEST_CHANGES | COMMENT

### Key Findings
<Bulleted list of 5-15 most important comments>

### Questions for the Author
<Clarifying questions about design decisions>
```

**Compliance Check:**
```markdown
## 🔍 Compliance Check Results

### Status: ✅ PASSED | ⚠️ ISSUES FOUND | ❌ FAILED

**PR**: #<number> - <title>
**Author**: @<author>
**Commit**: <sha>
**Checked**: <timestamp>

---

### 📊 Summary
<Brief overview of compliance state>

---

### 📁 File Groups Analyzed
<Analysis for each affected file group>

---

### 🎯 Overall Assessment
<Holistic compliance state with reasoning>

### 📝 Next Steps
<Actionable guidance for achieving compliance>

---
_Compliance verification by AI agent • Re-run with `/mirrobot-check`_
<!-- compliance-check-id: <PR_NUMBER>-<SHA> -->
```

**Bot Reply:**
```markdown
<Acknowledgment of request>

<Detailed analysis or investigation results>

<Actionable recommendations or answers>
```

### Limitations

- **Response Time**: Depends on LLM API latency (typically 10-60 seconds)
- **Complex PRs**: Very large diffs may be truncated (500KB limit)
- **No Direct Code Changes**: Bot posts comments/suggestions only (doesn't commit)
- **API Rate Limits**: Subject to GitHub API and LLM provider limits
- **Self-Review**: May fail to post comments due to GitHub API restrictions (rare)

---

## Troubleshooting

### Common Issues

#### Workflow Not Triggering

**Symptoms**: Bot doesn't respond to new issues/PRs

**Solutions:**
1. Check workflows are enabled: `Settings` → `Actions` → `General` → "Allow all actions"
2. Verify workflow files exist in `.github/workflows/`
3. Check workflow run history in `Actions` tab for errors
4. Ensure GitHub App is installed on the repository

#### Authentication Errors

**Symptoms**: Workflow fails with "Bad credentials" or "Resource not accessible"

**Solutions:**
1. Verify `BOT_APP_ID` and `BOT_PRIVATE_KEY` secrets are correct
2. Check GitHub App permissions (Contents: read, Issues: read/write, PRs: read/write)
3. Ensure GitHub App is installed on the repository (not just organization)
4. Verify private key format includes full PEM headers/footers

#### LLM API Connection Issues

**Symptoms**: "Failed to connect to OpenCode" or "Model not found"

**Solutions:**
1. Verify `OPENCODE_API_KEY` is correct and active
2. Check `OPENCODE_MODEL` format matches provider requirements
3. For custom providers: Validate `CUSTOM_PROVIDERS_JSON` syntax using `test-config.py`
4. Test provider connectivity outside GitHub Actions
5. Check LLM provider status page for outages

#### Bot Mentions Not Working

**Symptoms**: @mentions don't trigger bot-reply workflow

**Solutions:**
1. Verify exact mention format: `@mirrobot-agent` (check your bot name in GitHub App settings)
2. Check `bot-reply.yml` workflow is enabled
3. Review workflow run logs in `Actions` tab
4. Ensure bot has comment permissions

#### Reviews Not Posting

**Symptoms**: Workflow runs successfully but no review appears

**Solutions:**
1. Check workflow logs for API errors
2. Verify PR is not from a fork (use `pull_request_target` trigger)
3. Ensure bot has PR write permissions
4. Check for self-review scenario (bot reviewing its own PR may fail silently)

### Debugging Workflow Issues

1. **Enable Debug Logging**

   Repository Settings → Secrets → Add:
   ```
   ACTIONS_STEP_DEBUG = true
   ACTIONS_RUNNER_DEBUG = true
   ```

2. **Check Workflow Logs**

   Navigate to: `Actions` → Failed workflow run → Expand steps

3. **Test with Simple Cases**

   - Create minimal test issue/PR
   - Use workflow dispatch with known-good inputs
   - Verify secrets one at a time

4. **Validate Configuration**

   Run configuration test:
   ```bash
   python test-config.py
   ```

---

## Security

### Security Features

1. **Prompt Injection Protection**
   - Prompts saved from base branch before PR checkout
   - Prevents malicious PR from modifying bot behavior
   - Isolates untrusted code from prompt engineering

2. **Secret Exposure Prevention**
   - Explicit forbidden command list (env, printenv, etc.)
   - No echoing of tokens or credentials in logs
   - Placeholder substitution in error messages

3. **Workflow Modification Protection**
   - GitHub App permissions: No workflow write access
   - Automatic detection of workflow file changes
   - Three-level error recovery prevents accidental commits

4. **Minimal Permissions**
   - Job-level: `contents: read`, `issues: write`, `pull-requests: write`
   - No `checks: write`, no `workflows: write`
   - GitHub App tokens are short-lived (per-workflow)

5. **Token Scoping**
   - Generated fresh per workflow run
   - Repository-scoped only
   - Automatic expiration

### Best Practices

1. **Rotate Credentials Regularly**
   - Rotate `BOT_PRIVATE_KEY` every 6-12 months
   - Rotate LLM API keys on breach notification

2. **Monitor Bot Activity**
   - Review workflow run history weekly
   - Check for unusual patterns (many failures, unexpected triggers)
   - Monitor LLM API usage for anomalies

3. **Restrict Repository Access**
   - Install GitHub App only on necessary repositories
   - Use repository-level secrets (not organization-level)
   - Review collaborator permissions regularly

4. **Review Bot Comments**
   - Periodically audit bot feedback quality
   - Check for hallucinations or inappropriate suggestions
   - Validate against security best practices

5. **Data Privacy**
   - Understand your LLM provider's data retention policy
   - For sensitive codebases, use self-hosted models
   - Consider geographic data residency requirements

### GitHub Permissions Required

**GitHub App Permissions:**
- **Repository permissions:**
  - Contents: **Read-only**
  - Issues: **Read and write**
  - Pull requests: **Read and write**
  - Metadata: **Read-only** (automatically granted)
- **Subscribe to events:**
  - Issues
  - Issue comment
  - Pull request
  - Pull request review
  - Pull request review comment

### Data Handling

- **Processed Data**: Issue/PR content, comments, diffs sent to configured LLM provider
- **No Persistent Storage**: All data is ephemeral (workflow execution only)
- **GitHub API as Source of Truth**: No separate database or storage layer
- **Privacy**: Use self-hosted models or trusted providers for sensitive projects

---

## Development Guide

### Project Structure

```
.github/
├── actions/
│   └── bot-setup/
│       └── action.yml           # Reusable bot setup composite action
├── workflows/
│   ├── issue-comment.yml        # Issue analysis workflow
│   ├── pr-review.yml            # PR review workflow
│   ├── compliance-check.yml     # Compliance verification workflow (NEW)
│   ├── status-check-init.yml    # Status check initialization workflow (NEW)
│   ├── bot-reply.yml            # Bot mention response workflow
│   └── opencode.yml             # Legacy OpenCode integration
└── prompts/
    ├── issue-comment.md         # Issue analysis prompt template
    ├── pr-review.md             # PR review prompt template (24KB, sophisticated)
    ├── compliance-check.md      # Compliance check prompt template (NEW)
    └── bot-reply.md             # Bot reply prompt template (33KB, multi-strategy)

custom_providers.json            # Example custom provider configuration
minify_json_secret.py            # Script to minify JSON for GitHub secrets
test-config.py                   # Configuration testing utility
README.md                        # This file
LICENSE                          # MIT License
```

### Modifying Prompts

All AI behavior is controlled by markdown prompts in `.github/prompts/`:

1. **Edit Prompt Files**
   ```bash
   # Example: Modify PR review behavior
   vim .github/prompts/pr-review.md
   ```

2. **Test Changes**
   - Create test PR
   - Manually trigger `pr-review` workflow
   - Review bot output

3. **Iterate**
   - Adjust prompt wording, structure, examples
   - Test with various PR types (small, large, bug fix, feature)
   - Validate against edge cases

**Prompt Engineering Tips:**
- Use clear section headers (###) for structured output
- Provide explicit examples of desired output format
- Set behavioral constraints (e.g., "Limit to 5-15 comments")
- Include error handling instructions
- Test with reasoning models (may require different phrasing)

### Modifying Workflows

Workflow files are in `.github/workflows/`:

**Common Modifications:**

1. **Change Triggers**
   ```yaml
   # Example: Add label trigger for issue analysis
   on:
     issues:
       types: [opened, labeled]
   ```

2. **Add Concurrency Controls**
   ```yaml
   concurrency:
     group: pr-review-${{ github.event.pull_request.number }}
     cancel-in-progress: true
   ```

3. **Modify Model Selection**
   ```yaml
   # Use different model for specific workflow
   - name: Bot Setup
     uses: ./.github/actions/bot-setup
     with:
       opencode-model: ${{ secrets.OPENCODE_REASONING_MODEL }}
   ```

4. **Add Custom Context**
   ```yaml
   # Example: Include repository README in context
   - name: Fetch README
     run: |
       README_CONTENT=$(cat README.md)
       echo "README<<EOF" >> $GITHUB_ENV
       echo "$README_CONTENT" >> $GITHUB_ENV
       echo "EOF" >> $GITHUB_ENV
   ```

### Testing Configuration

Use the provided test utility:

```bash
# Test your custom provider configuration
python test-config.py
```

**Test Scenarios:**
1. Standard provider (e.g., `openai/gpt-4o`)
2. Custom provider with model in JSON
3. Custom provider without model (should fail)
4. Mixed (custom main, standard fast)

**Output:**
- Generated `opencode.json` config files
- Pass/fail status for each scenario
- Detailed logs

### Contributing

We welcome contributions! Here's how:

1. **Fork the Repository**
   ```bash
   gh repo fork Mirrowel/Mirrobot-agent
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make Changes**
   - Follow existing code style
   - Test in your own repository first
   - Update documentation as needed

4. **Commit with Clear Messages**
   ```bash
   git commit -m "feat: add support for custom review severity thresholds"
   ```

5. **Push and Open PR**
   ```bash
   git push origin feature/amazing-feature
   gh pr create --title "Add custom review severity thresholds"
   ```

**Contribution Ideas:**
- Additional workflow templates (e.g., dependency review, security scanning)
- Prompt improvements for specific use cases
- Provider-specific optimizations
- Documentation enhancements
- Bug fixes and error handling improvements

---

## FAQ

**Q: Is Mirrobot Agent really free?**
**A:** Yes! For **open-source (public) repositories**, GitHub Actions minutes are completely free, so you only pay for LLM API usage. For private repositories, GitHub provides 2,000 free minutes/month, which is typically sufficient for small-to-medium teams.

**Q: What LLM providers are supported?**
**A:** Any OpenAI-compatible provider, including:
- OpenAI (GPT-4, GPT-4o, GPT-4o-mini)
- Anthropic (Claude Sonnet, Opus, Haiku)
- Self-hosted models (Ollama, vLLM, LM Studio)
- LLM proxies and aggregators
- Regional providers (DeepSeek, Qwen, GLM, etc.)

**Q: Can I customize the bot's behavior?**
**A:** Absolutely! All prompts are in `.github/prompts/` and fully editable. You can modify tone, analysis depth, review criteria, output format, and more.

**Q: How much does it cost to run?**
**A:** Typical costs (assuming 50 PRs/month, 20 issues/month):
- GitHub Actions: **$0** (public repos) or **~$0** (within free tier for private repos)
- LLM API: **$5-20/month** depending on provider and model
- **Total**: **$5-20/month** vs **$500-2,500/month** for paid alternatives (10-50 users)

**Q: Is my code/data secure?**
**A:** Yes. The bot runs on GitHub's infrastructure using your own GitHub App. Code/data is only sent to your configured LLM provider. For maximum security, use self-hosted models or providers with strong privacy guarantees.

**Q: Can the bot commit code?**
**A:** No, by design. The bot posts comments and suggestions only. This prevents accidental or malicious code changes. (You can modify workflows to enable this, but it's not recommended.)

**Q: What if the bot makes a mistake?**
**A:** The bot is an AI assistant, not infallible. Always review its suggestions critically. You can:
- Correct it in a follow-up comment
- Modify prompts to improve future responses
- Report issues to help improve the project

**Q: Can I use this for private repositories?**
**A:** Yes! GitHub provides 2,000 free Actions minutes/month for private repos (on free plan). For more minutes, you can upgrade your GitHub plan or self-host runners.

**Q: How do I change the bot's name/identity?**
**A:** The bot name comes from your GitHub App. Change it in your GitHub App settings. Update workflow files to use the new name in mentions.

**Q: Does it work with GitHub Enterprise?**
**A:** Yes, with GitHub Enterprise Server 3.0+ or GitHub Enterprise Cloud. Ensure your instance supports GitHub Actions and GitHub Apps.

**Q: Can I run multiple bots with different personalities?**
**A:** Yes! Create multiple GitHub Apps with different credentials, configure separate workflows, and use different prompt templates.

**Q: What models work best?**
**A:** Recommendations:
- **Main model**: GPT-4o, Claude Sonnet 4, or DeepSeek R1 (for reasoning)
- **Fast model**: GPT-4o-mini, Claude Haiku 4
- **Budget**: Qwen3-Coder, Llama 3.1 70B (via custom providers)

---

## Credits

### Built On

- **[OpenCode](https://opencode.ai)**: The AI engine powering Mirrobot Agent
- **[GitHub Actions](https://github.com/features/actions)**: Execution platform
- **[GitHub Apps](https://docs.github.com/en/apps)**: Authentication and API access

### What Mirrobot Agent Adds

- **Workflow Orchestration**: Pre-built workflows for issue analysis, PR reviews, and bot replies
- **Prompt Engineering**: Production-tested prompts for high-quality AI responses
- **Context Management**: Sophisticated filtering and state tracking
- **GitHub Integration**: Seamless API interactions, error handling, security protections
- **Provider Flexibility**: Dynamic configuration for any LLM provider

### Acknowledgments

- OpenCode team for the excellent AI agent platform
- GitHub for free Actions minutes on open-source projects
- The open-source community for inspiration and feedback

---

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### Summary

✅ **Free to use** for any purpose (commercial or personal)
✅ **Modify** and customize as needed
✅ **Distribute** original or modified versions
✅ **No warranty** provided (use at your own risk)

---

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/Mirrowel/Mirrobot-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Mirrowel/Mirrobot-agent/discussions)
- **Documentation**: This README + OpenCode docs
- **Contributing**: See [Development Guide](#development-guide)

---

**Made with ❤️ for the open-source community**

Deploy your AI GitHub bot in 10 minutes — zero infrastructure, complete control, completely free.
