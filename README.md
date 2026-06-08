# @multimail/mcp-server

Your agent doesn't have email yet because nobody trusts it with email yet. MultiMail fixes that. A real email address with a trust ladder from read-only to fully autonomous, cryptographic identity on every message, and per-recipient sending controls.

## Quick start

```json
{
  "mcpServers": {
    "multimail": {
      "type": "url",
      "url": "https://mcp.multimail.dev/mcp"
    }
  }
}
```

Remote server. No install. Authenticates via OAuth on first connect.

Works with Claude.ai, Claude Desktop, Claude Code, Cursor, Windsurf, Copilot (VS Code), ChatGPT Desktop, and any MCP client that supports remote servers.

### Alternative: local stdio server

```json
{
  "mcpServers": {
    "multimail": {
      "command": "npx",
      "args": ["-y", "@multimail/mcp-server"],
      "env": {
        "MULTIMAIL_API_KEY": "mm_live_...",
        "MULTIMAIL_MAILBOX_ID": "01KJ1NHN8J..."
      }
    }
  }
}
```

Get a key at [multimail.dev](https://multimail.dev). Or run without one to create an account interactively.

### Config file locations

| Client | Config file |
|--------|------------|
| Claude Code | `~/.claude/.mcp.json` |
| Claude Desktop | `claude_desktop_config.json` |
| Cursor | `.cursor/mcp.json` in your project |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Copilot (VS Code) | `.vscode/mcp.json` in your project |
| OpenCode | `mcp.json` in your project |
| ChatGPT Desktop | Settings > MCP Servers |

## Trust ladder

Every mailbox has an oversight mode. Start restrictive, graduate as the agent earns trust.

| Mode | Behavior |
|------|----------|
| `read_only` | Agent reads email. All sends blocked. |
| `gated_all` | Every action requires human approval. |
| `gated_send` | Outbound held for approval. Inbound immediate. **(default)** |
| `monitored` | Agent sends freely. Copies go to oversight address. |
| `autonomous` | Full send/receive. No gates. |

Agents request upgrades via the API. The operator approves with a one-time code. Downgrades need no approval. The agent can always restrict itself.

The gated approval flow is [formally verified in Lean 4](https://multimail.dev/verified). No email reaches delivery without passing through operator approval, for every possible code path.

## Per-recipient allowlist

In `gated_send` mode, allowlisted recipients bypass the approval queue. Add exact addresses (`vendor@example.com`) or domain wildcards (`*@example.com`). Every addition requires operator email approval. The agent cannot self-approve allowlist changes.

The practical middle ground: routine correspondence with known contacts goes immediately, new recipients still require oversight.

## Cryptographic identity

Every outbound email carries a signed `X-MultiMail-Identity` header (ECDSA P-256). The payload includes operator name, oversight mode, capabilities, and verification status. Recipients verify against the public key at `GET /.well-known/multimail-signing-key`.

A separate `X-MultiMail-Reputation` header links to privacy-preserving reputation data: bounce rates, complaint rates, account age. No raw addresses exposed.

Without verified identity, recipients cannot distinguish your agent from a spammer. With it, they can verify the operator, the oversight level, and the sending history before reading a word.

**Agent DID relay (optional).** If your agent has bound a `did:key` to its MultiMail account, pass an optional `ucan` parameter to `send_email` / `reply_email`. MultiMail relays your agent's self-signed UCAN verbatim in a separate `X-Agent-Identity` header (`did="…"; ucan="…"`) — it does **not** sign or vouch for it; recipient tooling verifies the delegation independently. Inert unless a DID is bound.

## Agent self-registration (auth.md)

Agents can register themselves without a browser. The protocol uses verified-email identity assertion, following the [auth.md](https://github.com/anthropics/auth.md) convention inspired by [WorkOS AuthKit](https://workos.com/docs/authkit):

```
POST /agent/auth -> claim_token + OTP sent to operator email
POST /agent/auth/claim/complete -> API key + tenant_id + granted scopes
```

Discovery follows [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728):
- `GET /.well-known/oauth-protected-resource` (resource metadata)
- `GET /.well-known/oauth-authorization-server` (authorization metadata with `agent_auth` extension)
- `GET /auth.md` (human/agent-readable registration guide)

The `WWW-Authenticate` header on 401 responses points agents to these endpoints automatically. An agent that hits a 401 can follow the link, read the registration protocol, and onboard itself.

## Content scanning

Every outbound email is scanned before delivery. Emails enter `pending_scan` status, then transition to delivery or `pending_send_approval` (in gated modes). Inbound emails go through the same pipeline. Phishing, malware, and prompt injection patterns are flagged before reaching the agent's inbox.

## How it works

- Email bodies are **markdown** in, formatted HTML out. Inbound HTML arrives as clean markdown (15x fewer tokens than raw MIME).
- Threading is automatic. Reply to an email and headers are set correctly.
- Sends return `pending_scan` while scanned. Gated mailboxes then transition to `pending_send_approval` for human review. Do not retry.
- Every outbound email carries a cryptographically signed [`X-MultiMail-Identity`](https://multimail.dev/#identity) header.
- Reputation data via `X-MultiMail-Reputation` header: bounce rates, complaint rates, account age. Privacy-preserving, updated daily.

## Tools (50)

| Tool | Description |
|------|-------------|
| **Core email** | |
| `send_email` | Send email as markdown. Supports attachments, `idempotency_key`, scheduled delivery via `send_at`. |
| `check_inbox` | List emails with filters: status, sender, subject, date range, direction, attachments, pagination. |
| `read_email` | Full email content. Trusted metadata and untrusted body returned as separate content blocks. |
| `reply_email` | Reply in-thread. Threading headers set automatically. |
| `get_thread` | All emails in a conversation thread with participants and metadata. |
| `download_attachment` | Download attachment as base64 with content type. |
| `cancel_message` | Cancel a pending or scheduled email. |
| `edit_scheduled_email` | Edit scheduled email before it sends. |
| `wait_for_email` | Block until matching email arrives or timeout (max 120s). |
| `get_tags` | Get all tags on an email. Persistent key-value agent memory across sessions. |
| `set_tags` | Set tags on an email. Merges with existing tags. |
| `delete_tag` | Delete a specific tag key from an email. |
| **Oversight** | |
| `list_pending` | Emails awaiting oversight decision (requires oversight scope). |
| `decide_email` | Approve or reject a pending email (requires oversight scope). |
| `manage_upgrade` | Request or apply oversight mode upgrade (action: request\|apply). |
| **Sending allowlist** | |
| `list_allowlist` | List sending allowlist entries. |
| `add_allowlist_entry` | Add a recipient to the sending allowlist. Operator approval required. |
| `remove_allowlist_entry` | Remove an allowlist entry. |
| **Mailbox management** | |
| `list_mailboxes` | All mailboxes with ID, address, oversight mode, display name. |
| `configure_mailbox` | First-run setup: oversight mode, display name, CC/BCC, scheduling, signature. |
| `update_mailbox` | Update settings (display name, oversight mode, signature, webhooks). |
| `create_mailbox` | Create mailbox (admin scope + operator approval). |
| `delete_mailbox` | Permanently delete a mailbox (admin scope). |
| **Account & billing** | |
| `get_account` | Account status, plan, quota, sending enabled, enforcement tier. |
| `update_account` | Update org name, oversight email, physical address. |
| `delete_account` | Permanently delete account and all data (admin scope). |
| `get_usage` | Quota and usage stats for the billing period. |
| `upgrade_plan` | Upgrade to paid plan (Builder $9/mo, Pro $29/mo, Scale $99/mo). |
| `cancel_subscription` | Cancel paid subscription, revert to starter at period end. |
| `get_billing_portal` | Stripe portal URL for self-service billing. |
| **Signup (no API key needed)** | |
| `request_challenge` | ALTCHA proof-of-work challenge for account creation. |
| `create_account` | Create account with solved PoW challenge. |
| `resend_confirmation` | Resend activation email with new code. |
| `activate_account` | Activate account using confirmation code. |
| `setup_multimail` | Guided onboarding on the public /onboard endpoint. |
| **API keys & audit** | |
| `list_api_keys` | List all API keys (admin scope). |
| `create_api_key` | Create API key with scopes (admin + operator approval). `send`+`oversight` rejected to prevent self-approval. |
| `revoke_api_key` | Revoke an API key (admin scope). |
| `get_audit_log` | Account audit log (admin scope). |
| **Contacts & spam** | |
| `search_contacts` | Search contacts by name or email. |
| `add_contact` | Add a contact. |
| `delete_contact` | Delete a contact. |
| `manage_spam_status` | Report spam or clear spam status (action: report\|clear). |
| `list_spam` | Spam-flagged and quarantined emails. |
| `list_suppression` | List suppressed recipients with pagination. |
| `remove_suppression` | Remove a recipient from the suppression list. |
| **Webhooks** | |
| `create_webhook` | Create webhook for real-time email event notifications. |
| `list_webhooks` | List all webhooks. |
| `delete_webhook` | Delete a webhook. |
| **Meta** | |
| `report_issue` | Report a bug, site problem, or feature request. |

## Example prompts

```text
Find the most recent email from alice@example.com, summarize what she's asking,
then draft a reply saying I'll review this week. Don't send until I approve.
```

```text
Check my inbox and summarize the last 5 unread emails.
For each: sender, subject, time, and whether it needs action today.
```

```text
Review the pending approval queue. For each pending email: who it goes to,
the subject, risk factors, and whether to approve or reject.
```

```text
Show my current sending allowlist. Then add *@acme.com so emails to Acme skip approval.
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MULTIMAIL_API_KEY` | For stdio mode | Your API key (`mm_live_...`). Not needed for remote server (uses OAuth). |
| `MULTIMAIL_MAILBOX_ID` | No | Default mailbox ID. If unset, pass `mailbox_id` per tool or call `list_mailboxes`. |
| `MULTIMAIL_API_URL` | No | API base URL. Defaults to `https://api.multimail.dev`. |

## Also available

- **REST API**: `https://api.multimail.dev` ([OpenAPI spec](https://api.multimail.dev/v1/openapi.json))
- **CLI**: `npx -y @mvanhorn/printing-press install multimail` (every API endpoint as a shell command)
- **SDKs**: [Python](https://github.com/multimail-dev/multimail-python), [Vercel AI SDK](https://github.com/multimail-dev/multimail-ai-sdk), [LangChain](https://github.com/multimail-dev/langchain-multimail), [LlamaIndex](https://github.com/multimail-dev/llamaindex-multimail), [CrewAI](https://github.com/multimail-dev/crewai-multimail), [AutoGen](https://github.com/multimail-dev/multimail-autogen)

## Development

```bash
npm install
npm run dev   # Run with tsx
npm run build # Compile TypeScript
npm start     # Run compiled version
```

## License

MIT

By using MultiMail you agree to the [Terms of Service](https://multimail.dev/terms) and [Acceptable Use Policy](https://multimail.dev/acceptable-use).
