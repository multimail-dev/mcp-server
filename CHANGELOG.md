# Changelog

All notable changes to `@multimail/mcp-server` will be documented in this file.

## 0.3.0 — 2026-02-28

### Added
- `get_account` tool — check account status, plan, quota, enforcement tier
- `create_mailbox` tool — create new mailboxes (requires admin scope)
- `request_upgrade` tool — request oversight mode upgrade (trust ladder entry point)
- `apply_upgrade` tool — apply upgrade code from operator approval email
- `get_usage` tool — check quota and usage stats for billing period
- `list_pending` tool — list emails awaiting oversight decision (requires oversight scope)
- `decide_email` tool — approve or reject pending emails (requires oversight scope)
- `delete_contact` tool — delete a contact from address book
- `check_suppression` tool — list suppressed email addresses
- `remove_suppression` tool — remove an address from suppression list
- `list_api_keys` tool — list all API keys (requires admin scope)
- `create_api_key` tool — create API key with scopes (requires admin scope)
- `revoke_api_key` tool — revoke an API key (requires admin scope)
- `get_audit_log` tool — get account audit log (requires admin scope)
- `delete_account` tool — permanently delete account and all data (requires admin scope)
- `send_email` and `reply_email` now accept `attachments` parameter (base64-encoded files)
- `check_inbox` now supports `cursor` pagination parameter
- `check_inbox` status filter expanded to all 9 API-filterable statuses

### Fixed
- `send_email` and `reply_email` descriptions now correctly reference `pending_scan` and `pending_send_approval` (was `pending_approval`)
- `cancel_message` description now mentions `pending_scan` as a valid cancelable status
- 429 error messages now distinguish warmup limits, quota exceeded, and rate limits

### Changed
- Tool count: 16 → 31

## 0.2.1 — 2026-02-27

### Changed
- `send_email` and `reply_email` now return `pending_scan` status — emails are scanned for threats before delivery
- Tool descriptions updated to mention `pending_scan` as a non-retryable status

## 0.2.0 — 2026-02-27

### Added
- `download_attachment` tool — download email attachments as base64 with content type
- `get_thread` tool — retrieve full conversation thread with participants and metadata
- `cancel_message` tool — cancel pending emails awaiting oversight approval
- `tag_email` tool — set, get, or delete key-value tags on emails (agent persistent memory)
- `add_contact` tool — add contacts to address book with optional tags
- `search_contacts` tool — search address book by name or email
- `check_inbox` now supports filtering: `sender`, `subject_contains`, `date_after`, `date_before`, `direction`, `has_attachments`, `since_id`, `limit`
- `send_email` and `reply_email` now accept `idempotency_key` to prevent duplicate sends (24h TTL)
- Reply endpoint now has SHA-256 dedup (60s window), matching send behavior
- API responses now include `delivered_at`, `bounced_at`, `bounce_type`, `approved_at`, `approved_by`
- Thread tracking: send generates thread_id, reply inherits it, inbound looks up parent
- `cancelled` email status for cancelled pending messages
- Email tags (key-value pairs) included in read_email response
- Contacts API with search

### Changed
- Tool count: 10 → 15

## 0.1.13 — 2026-02-27

### Added
- `update_account` tool — change org name, oversight email, physical address (requires admin scope)
- `update_mailbox` tool — change display name, oversight mode, signature block, webhooks, and more
- `delete_mailbox` tool — permanently delete a mailbox (requires admin scope)
- Remote MCP server at `mcp.multimail.dev/mcp` — no install needed, OAuth authentication

### Changed
- Email footer redesigned: multi-line format with human-readable oversight descriptions
- README now shows remote server as recommended Option A

## 0.1.12 — 2026-02-27

### Added
- `delete_mailbox` tool (requires admin scope)

## 0.1.11 — 2026-02-27

### Added
- `update_mailbox` tool — update display name, oversight mode, signature block, webhooks

## 0.1.10 — 2026-02-26

### Added
- `bcc` parameter on `send_email` and `reply_email`

### Removed
- `search_identity` tool — identity is now delivered via signed `X-MultiMail-Identity` email header

## 0.1.9 — 2026-02-26

### Added
- `activate_account` tool — activate account using confirmation code
- Reputation hash via `X-MultiMail-Reputation` email header

## 0.1.7 — 2026-02-25

### Added
- `resend_confirmation` tool — resend operator activation email

## 0.1.6 — 2026-02-25

### Changed
- `read_only` mode documentation — send/reply now return 403 with upgrade instructions

## 0.1.5 — 2026-02-24

### Added
- Initial public release
- Tools: `list_mailboxes`, `send_email`, `check_inbox`, `read_email`, `reply_email`
