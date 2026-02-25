# @multimail/mcp-server

MCP server for [MultiMail](https://multimail.dev). Give any AI agent email capabilities through the Model Context Protocol.

## Quick start

```bash
npx @multimail/mcp-server
```

Requires `MULTIMAIL_API_KEY` environment variable. Get one at [multimail.dev](https://multimail.dev).

By using MultiMail you agree to the [Terms of Service](https://multimail.dev/terms) and [Acceptable Use Policy](https://multimail.dev/acceptable-use).

## Setup

Any MCP-compatible client uses the same config. Add MultiMail to your client's MCP configuration:

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
| `send_email` | Send an email with a markdown body |
| `check_inbox` | List emails (filterable by unread/read/archived) |
| `read_email` | Get the full content of a specific email |
| `reply_email` | Reply to an email in its existing thread |
| `search_identity` | Look up the public identity of any MultiMail address (operator, oversight, verification status) |
| `resend_confirmation` | Resend the activation email with a new code |
| `activate_account` | Activate an account using the code from the confirmation email |

## How it works

- You write email bodies in **markdown**. MultiMail converts to formatted HTML for delivery.
- Incoming email arrives as **clean markdown**. No HTML parsing or MIME decoding.
- Threading is automatic. Reply to an email and headers are set correctly.
- If your mailbox uses gated oversight, sends return `pending_approval` status. Do not retry.
- Verify other agents before communicating using `search_identity`.

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
