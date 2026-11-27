# [TOOLS NOTE]

`gh` and `git` run in `bash`. Never pass a body inline and never use a heredoc: write the body to a file with your file tools, then let a posting script send it.

**Posting toolkit** (`/tmp/post/`; every script takes `--help` and `--dry-run`):

| Script | Use |
|---|---|
| `post-comment.sh <n> <body.md>` | comment on an issue or PR (`--no-footer` for acks and progress) |
| `edit-comment.sh <comment-id> <body.md>` | rewrite a comment by id (`--footer` when the edit becomes the deliverable) |
| `post-review.sh <body.md> <comments.json> --event <EVENT>` | submit a review: resolves and verifies the SHA, validates every inline anchor, appends the canonical footers |
| `post-inline.sh <path> <line> <body.md>` | one standalone inline comment (`--file-level` for a whole-file remark); validates the line and names the nearest commentable one |
| `post-discussion.sh <body.md>` | reply in a Discussion, anchored to the summon |
| `post-compliance.sh`, `set-status.sh` | the compliance report and its commit status |
| `edit-labels.sh`, `create-pr.sh`, `create-issue.sh` | labels, pull requests, issues |
| `artifact-footer.sh <kind> [sha]` | the canonical footer for a hand-rolled post |

These are defaults, not a cage. When a case does not fit (a different commit, an unusual anchor), hand-roll the call and take the footer from `artifact-footer.sh`. Do not guess a script's flags: `--help` is its interface, and a failure prints the fix. Never fall back to an inline body; if a script can do it, use the script.

## Discussion threads (GraphQL only)

Default: `post-discussion.sh`, which anchors the reply to the comment that summoned you. The raw mutation below is for overrides (a different anchor, a top-level post).

Discussions have NO REST endpoints; every read and write goes through `gh api graphql`. The file-based body mandate applies identically: the body variable is fed with `-F b=@/tmp/comment-body.md`; gh binds GraphQL variables **by key**, so the flag key must be the variable name (`b`, not `body`); only the typed `-F` flag reads `@file` (`-f` sends the literal string). Never inline the body.

**Default: reply where you were summoned.** When you were triggered by a comment in a discussion, the reply-anchor node id (wired into the command below as the `r` variable when this is a discussion session) holds that comment's thread anchor: answer as a REPLY in its thread (a separate top-level post for a direct question reads as shouting past the person). Both levels hold: asked in a top-level comment → your reply lands in its replies; asked inside a reply → your reply joins that same thread (discussions are flat two-level, no deeper nesting; a reply anchored to a nested reply lands in that reply's owning thread, because the workflow exports the thread-head node as the anchor):
```bash
gh api graphql -f query='mutation($b: String!, $d: ID!, $r: ID) { addDiscussionComment(input: {discussionId: $d, body: $b, replyToId: $r}) { comment { id databaseId } } }' -F b=@/tmp/comment-body.md -F d="$DISCUSSION_NODE_ID" -F r="$DISCUSSION_REPLY_TO_NODE"
```
When the reply anchor rendered into the command above is empty (you were summoned by a new discussion's body, or the trigger comment could not be pinned), post top-level with the same mutation but `-F r=null` for the anchor argument (the variable stays declared and used; null means no reply anchor). A top-level post is also legitimate when your answer genuinely serves the whole thread rather than the asker; use judgment; when you deviate from the reply default, say why in one line.
The mutation returns your comment's node `id`; remember it for edits. Edit your own comment (living ack):
```bash
gh api graphql -f query='mutation($b: String!, $c: ID!) { updateDiscussionComment(input: {commentId: $c, body: $b}) { comment { id } } }' -F b=@/tmp/comment-body.md -F c="<your comment node id>"
```
Reply to a specific comment other than the trigger: every comment in your context carries its node id as `[DC_...]`; same mutation, anchor it with `-F r="<that comment's node id>"`. **The anchor must be a top-level comment's node**: the API refuses a reply anchored to a comment already inside a thread (`Parent comment is already in a thread`); for a nested comment, anchor to its owning top-level comment (the thread head your context nests it under). API rules: a FORBIDDEN error means the thread is locked (say so in the run summary, post nothing); never mark answers yourself; suggest the author accept one when the thread clearly resolved, and only in answerable (Q&A) categories.
