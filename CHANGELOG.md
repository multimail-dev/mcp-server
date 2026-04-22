# Changelog

All notable changes to `@multimail/mcp-server` will be documented in this file.

## Unreleased

- Add spam review tools: `report_spam`, `not_spam`, and `list_spam`.
- Update setup messaging from 43 to 46 email tools.

## 0.7.0 — 2026-04-21

- Add title and annotations on all tools for directory submission readiness.
- Add security.txt, security policy, and submission assets.

## 0.6.0 — 2026-04-19

- Migrate to @modelcontextprotocol/sdk 1.29.0 (server.tool → server.registerTool, Zod v4 in the Cloudflare worker)
- Migrate Cloudflare agents 0.5 → 0.11.4
- Fix tool-count claim in setup_multimail (40 → 43)
- Unify mailbox_id parameter description across stdio and worker
- No tool API changes

## 0.5.6 — 2026-04-08

### Security

- **Block `send` + `oversight` scope combinations** on API keys. Prevents the self-approval attack where a single key can both compose and approve emails, bypassing the `gated_send` oversight model. Applies to both `POST /v1/api-keys` creation and `PATCH /v1/api-keys/:id` scope updates. ([H4](https://github.com/H179922/MCP-Server/issues/10))
- **Gate oversight scope escalation** behind operator approval. Adding the `oversight` scope to an existing key now requires the admin-action approval flow, closing the escalation path that bypassed the scope combination block.
- **Remove `webhook_url` and `oversight_webhook_url` from `update_mailbox`**. Webhook URLs can only be set via `create_webhook` which requires operator approval. Prevents the silent event exfiltration path. ([C2](https://github.com/H179922/MCP-Server/issues/6))
- **Timing-safe upgrade code verification** — replaced `===` string comparison with `crypto.subtle.timingSafeEqual` in `verifyUpgradeCode`. Eliminates the timing side channel on approval code checks.
- **MCP tool descriptions** updated with prompt injection warnings on `update_mailbox`, `update_account`, `configure_mailbox`, `edit_scheduled_email`, and `get_thread`.

### Related

- Plan: `docs/plans/2026-04-08-001-fix-adversarial-audit-configuration-security-plan.md`
- Audit issues: H179922/MCP-Server#4
- Phases 3-4 (auto_bcc gating, oversight_email confirmation, recipient edit blocking) will follow in a subsequent release.

## 0.5.5 — 2026-04-05

### Added
- `request_challenge` tool — request an ALTCHA proof-of-work challenge for account creation
- `create_account` tool — create a MultiMail account with a solved PoW challenge
- `/onboard` public MCP endpoint on remote worker — agents can sign up without OAuth
- PoW enforcement on `POST /v1/account` — proof-of-work is now required for all signups

### Changed
- stdio MCP server starts without `MULTIMAIL_API_KEY` — registers 4 onboarding tools (request_challenge, create_account, activate_account, resend_confirmation)
- `resend_confirmation` uses direct fetch instead of authenticated API call (works without API key)
- MCP server description updated to reflect trust-ladder positioning

## 0.5.4 — 2026-03-27

### Added
- `ai_disclosure` parameter on `create_mailbox`, `configure_mailbox`, and `update_mailbox` tools — enables EU AI Act Article 50 compliance by including `ai_generated` field in signed identity claims
- `ai_disclosure` field returned in `list_mailboxes` responses
- `X-AI-Generated: true` convenience header on outbound emails from AI-operated mailboxes
- `tamper_evident_ai_generated` Lean 4 theorem proving AI disclosure field is tamper-evident

### Changed
- `X-MultiMail-Identity` signed claim now includes `ai_generated` boolean (first field in sorted canonical JSON)
- Email body signature block includes "This email was sent by an AI agent." when `ai_disclosure` is enabled
- System notification emails explicitly set `ai_generated: false`

## 0.5.3 — 2026-03-20

### Security
- `read_email` now separates trusted metadata from untrusted email body into distinct content blocks, preventing prompt injection via email content
- Tool descriptions for `read_email`, `reply_email`, and `send_email` include warnings that email bodies are untrusted external content
- Webhook creation, API key creation, and mailbox creation now require operator approval via email code (prevents injected agents from creating exfiltration webhooks or escalating privileges)
- Identity header serialization uses sorted-key canonical format (deterministic by construction)

### Added
- `GET /v1/proof-status` endpoint — returns Lean 4 proof verification timestamp from KV

### Changed
- `read_email` response now returns two content blocks: metadata (trusted) and body (untrusted with explicit framing)
- New mailbox creation returns 202 with approval code flow instead of immediate 201

## 0.5.2 — 2026-03-17

### Added
- `download_attachment` now returns presigned URLs for attachments >50KB (1-hour expiry). Small files still return inline base64.
- Presigned URL API endpoint: `GET /v1/mailboxes/:id/emails/:emailId/attachments/:filename/url`

### Fixed
- Email parser now preserves original body in forwarded and replied messages
- Strips `Fwd:` and `Re:` prefixes from inbound email subjects

### Changed
- Removed duplicate `wrangler` from sub-package devDependencies (shared via root)

## 0.5.1 — 2026-03-13

### Added
- `schedule_email` tool — schedule an email for future delivery with a required `send_at` time. Edit or cancel before it sends.
- `configure_mailbox` tool — set up mailbox preferences: oversight mode, display name, CC/BCC defaults, scheduling, signature. Soft-nudge on first use if mailbox is unconfigured.
- `edit_scheduled_email` tool — edit a scheduled email's delivery time, recipients, subject, or body before it sends
- `send_email` now also accepts optional `send_at` (ISO 8601) for scheduled delivery and `gate_timing` (`gate_first` or `schedule_first`) for oversight ordering
- `check_inbox` status filter now includes `scheduled`
- `cancel_message` now works on scheduled emails
- First-run onboarding: soft nudge when mailbox is unconfigured (action still executes, `setup_required` flag is informational)

### Changed
- Tool count: 35 → 38

## 0.4.0 — 2026-03-01

### Added
- `wait_for_email` tool — block until a new email arrives matching optional filters, or timeout. Polls internally using `since_id` every 3 seconds. Supports `timeout_seconds` (5–120, default 30) and optional `filter` with `sender` and `subject_contains`. Returns immediately when mail arrives.
- `create_webhook` tool — create a webhook subscription for real-time email event notifications (message.received, message.sent, message.delivered, message.bounced, message.complained, oversight.pending, oversight.approved, oversight.rejected). Returns signing_secret for payload verification.
- `list_webhooks` tool — list all webhook subscriptions for this account
- `delete_webhook` tool — delete a webhook subscription by ID

### Changed
- Tool count: 31 → 35

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
