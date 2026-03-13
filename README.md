# @multimail/mcp-server

MCP server for [MultiMail](https://multimail.dev). Give any AI agent email capabilities through the Model Context Protocol.

## Quick start

```bash
npx @multimail/mcp-server
```

Requires `MULTIMAIL_API_KEY` environment variable. Get one at [multimail.dev](https://multimail.dev).

By using MultiMail you agree to the [Terms of Service](https://multimail.dev/terms) and [Acceptable Use Policy](https://multimail.dev/acceptable-use).

## Setup

### Option A: Remote server (recommended)

No install required. Connect directly to our hosted server. Authenticates via OAuth in the browser.

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

Works with Claude.ai, Claude Desktop, Claude Code, and any client that supports remote MCP servers.

### Option B: Local server (stdio)

Run the server locally. API key is passed as an environment variable.

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

### Where to add this

| Client | Config file |
|--------|------------|
| Claude Code | `~/.claude/.mcp.json` |
| Claude Desktop | `claude_desktop_config.json` |
| Cursor | `.cursor/mcp.json` in your project |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Copilot (VS Code) | `.vscode/mcp.json` in your project |
| OpenCode | `mcp.json` in your project |
| ChatGPT Desktop | Settings > MCP Servers |
| Any MCP client | Consult your client's docs for config location |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MULTIMAIL_API_KEY` | Yes | Your MultiMail API key (`mm_live_...`) |
| `MULTIMAIL_MAILBOX_ID` | No | Default mailbox ID. If not set, pass `mailbox_id` to each tool or call `list_mailboxes` first. |
| `MULTIMAIL_API_URL` | No | API base URL. Defaults to `https://api.multimail.dev`. |

## First-run setup

On first use, MultiMail will prompt you to configure your mailbox. You can also run this explicitly using the `configure_mailbox` tool:

- **Oversight mode**: How much human approval is required (`gated_send`, `monitored`, `autonomous`, etc.)
- **Display name**: Sender name shown in emails
- **CC/BCC defaults**: Automatically copy addresses on all outbound emails
- **Scheduling**: Enable/disable scheduled send and set default gate timing
- **Signature**: Email signature block

If you skip this step, MultiMail will remind you on your first tool call.

## Tools

| Tool | Description |
|------|-------------|
| `list_mailboxes` | List all mailboxes available to this API key |
| `configure_mailbox` | Set up mailbox preferences: oversight mode, display name, CC/BCC, scheduling, signature |
| `send_email` | Send an email with a markdown body. Supports attachments, `idempotency_key`, and `send_at` for scheduled delivery. |
| `check_inbox` | List emails with filters: status, sender, subject, date range, direction, attachments, cursor pagination |
| `read_email` | Get full email content including markdown body, attachments, tags, and delivery timestamps |
| `reply_email` | Reply to an email in its existing thread. Supports attachments and `idempotency_key`. |
| `download_attachment` | Download an email attachment as base64 with content type |
| `get_thread` | Get all emails in a conversation thread with participants and metadata |
| `cancel_message` | Cancel a pending or scheduled email |
| `schedule_email` | Schedule an email for future delivery with a required `send_at` time. Edit or cancel before it sends. |
| `edit_scheduled_email` | Edit a scheduled email's delivery time, recipients, subject, or body before it sends |
| `update_mailbox` | Update mailbox settings (display name, oversight mode, signature, webhooks) |
| `update_account` | Update account settings (org name, oversight email, physical address) |
| `delete_mailbox` | Permanently delete a mailbox (requires admin scope) |
| `resend_confirmation` | Resend the activation email with a new code |
| `activate_account` | Activate an account using the code from the confirmation email |
| `tag_email` | Set, get, or delete key-value tags on emails (persistent agent memory) |
| `add_contact` | Add a contact to your address book with optional tags |
| `search_contacts` | Search address book by name or email |
| `get_account` | Get account status, plan, quota, sending enabled, enforcement tier |
| `create_mailbox` | Create a new mailbox (requires admin scope) |
| `request_upgrade` | Request an oversight mode upgrade (trust ladder) |
| `apply_upgrade` | Apply an upgrade code from the operator |
| `get_usage` | Check quota and usage stats for the billing period |
| `list_pending` | List emails awaiting oversight decision (requires oversight scope) |
| `decide_email` | Approve or reject a pending email (requires oversight scope) |
| `delete_contact` | Delete a contact from the address book |
| `check_suppression` | List suppressed email addresses |
| `remove_suppression` | Remove an address from the suppression list |
| `list_api_keys` | List all API keys (requires admin scope) |
| `create_api_key` | Create a new API key with scopes (requires admin scope) |
| `revoke_api_key` | Revoke an API key (requires admin scope) |
| `get_audit_log` | Get account audit log (requires admin scope) |
| `delete_account` | Permanently delete account and all data (requires admin scope) |
| `wait_for_email` | Block until a new email arrives matching filters, or timeout (max 120s) |
| `create_webhook` | Create a webhook subscription for real-time email event notifications |
| `list_webhooks` | List all webhook subscriptions for this account |
| `delete_webhook` | Delete a webhook subscription |

## How it works

- You write email bodies in **markdown**. MultiMail converts to formatted HTML for delivery.
- Incoming email arrives as **clean markdown**. No HTML parsing or MIME decoding.
- Threading is automatic. Reply to an email and headers are set correctly.
- Sends return `pending_scan` status while the email is scanned for threats. If your mailbox uses gated oversight, the status transitions to `pending_send_approval` for human review. Do not retry or resend.
- Verify other agents by checking the `X-MultiMail-Identity` signed header on received emails.

## Development

```bash
npm install
npm run dev   # Run with tsx (no build needed)
npm run build # Compile TypeScript
npm start     # Run compiled version
```

## Testing

```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | MULTIMAIL_API_KEY=mm_live_... node dist/index.js
```

## License

MIT
