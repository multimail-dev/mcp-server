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

## Tools

| Tool | Description |
|------|-------------|
| `list_mailboxes` | List all mailboxes available to this API key |
| `send_email` | Send an email with a markdown body. Supports `idempotency_key` to prevent duplicates. |
| `check_inbox` | List emails with filters: status, sender, subject, date range, direction, attachments, since_id |
| `read_email` | Get full email content including markdown body, attachments, tags, and delivery timestamps |
| `reply_email` | Reply to an email in its existing thread. Supports `idempotency_key`. |
| `download_attachment` | Download an email attachment as base64 with content type |
| `get_thread` | Get all emails in a conversation thread with participants and metadata |
| `cancel_message` | Cancel a pending email awaiting oversight approval |
| `update_mailbox` | Update mailbox settings (display name, oversight mode, signature, webhooks) |
| `update_account` | Update account settings (org name, oversight email, physical address) |
| `delete_mailbox` | Permanently delete a mailbox (requires admin scope) |
| `resend_confirmation` | Resend the activation email with a new code |
| `activate_account` | Activate an account using the code from the confirmation email |
| `tag_email` | Set, get, or delete key-value tags on emails (persistent agent memory) |
| `add_contact` | Add a contact to your address book with optional tags |
| `search_contacts` | Search address book by name or email |

## How it works

- You write email bodies in **markdown**. MultiMail converts to formatted HTML for delivery.
- Incoming email arrives as **clean markdown**. No HTML parsing or MIME decoding.
- Threading is automatic. Reply to an email and headers are set correctly.
- Sends return `pending_scan` status while the email is scanned for threats. If your mailbox uses gated oversight, the status transitions to `pending_approval` for human review. Do not retry or resend.
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
