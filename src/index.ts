#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// --- Config ---

const API_KEY = process.env.MULTIMAIL_API_KEY;
const DEFAULT_MAILBOX_ID = process.env.MULTIMAIL_MAILBOX_ID;
const BASE_URL = (process.env.MULTIMAIL_API_URL || "https://api.multimail.dev").replace(/\/$/, "");

if (!API_KEY) {
  console.error("MULTIMAIL_API_KEY environment variable is required.");
  process.exit(1);
}

// --- API Client ---

async function parseResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`API returned non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function apiCall(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await parseResponse(res);

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Invalid API key. Check MULTIMAIL_API_KEY environment variable.");
    }
    if (res.status === 403) {
      throw new Error(`API key lacks required scope for this operation. ${data.error || ""}`);
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      if (data.warmup_stage) {
        throw new Error(`Warmup limit: ${data.daily_sent}/${data.daily_limit} today (${data.warmup_stage}). ${data.hint || ""}`);
      }
      if (String(data.error).includes("quota")) {
        throw new Error("Monthly email quota exceeded. Upgrade your plan for more sends.");
      }
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter || "a few"} seconds.`);
    }
    throw new Error(`API error ${res.status}: ${data.error || JSON.stringify(data)}`);
  }

  return data;
}

async function publicFetch(path: string): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  const data = await parseResponse(res);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

function getMailboxId(argsMailboxId?: string): string {
  const id = argsMailboxId || DEFAULT_MAILBOX_ID;
  if (!id) {
    throw new Error(
      "No mailbox_id provided and MULTIMAIL_MAILBOX_ID is not set. " +
      "Either pass mailbox_id or set the MULTIMAIL_MAILBOX_ID environment variable. " +
      "Use list_mailboxes to discover available mailboxes."
    );
  }
  return id;
}

// --- Server ---

const server = new McpServer({
  name: "multimail",
  version: "0.3.0",
});

// Tool 1: list_mailboxes
server.tool(
  "list_mailboxes",
  "List all mailboxes available to this API key. Returns each mailbox's ID, email address, oversight mode, and display name. Use this to discover your mailbox ID if MULTIMAIL_MAILBOX_ID is not set.",
  {},
  async () => {
    const data = await apiCall("GET", "/v1/mailboxes");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 2: send_email
server.tool(
  "send_email",
  "Send an email from your MultiMail address. The body is written in markdown and automatically converted to formatted HTML for delivery. If the mailbox is in read_only mode, this returns a 403 with upgrade instructions. Returns HTTP 202 with {id, status, thread_id}. The initial status is always 'pending_scan' while the email undergoes threat scanning. For gated oversight mailboxes, it then moves to 'pending_send_approval' awaiting human review. Do not retry or resend when you see pending_scan or pending_send_approval — the email is queued and will be processed.",
  {
    to: z.array(z.string().email()).describe("Recipient email addresses"),
    subject: z.string().describe("Email subject line"),
    markdown: z.string().describe("Email body in markdown format"),
    cc: z.array(z.string().email()).optional().describe("CC email addresses"),
    bcc: z.array(z.string().email()).optional().describe("BCC email addresses"),
    attachments: z.array(z.object({
      name: z.string().describe("Filename"),
      content_base64: z.string().describe("File content as base64"),
      content_type: z.string().describe("MIME type, e.g. application/pdf"),
    })).optional().describe("File attachments (base64-encoded)"),
    idempotency_key: z.string().optional().describe("Unique key to prevent duplicate sends. If the same key is used within 24 hours, the original email is returned instead of sending again."),
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
  },
  async ({ to, subject, markdown, cc, bcc, attachments, idempotency_key, mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    const body: Record<string, unknown> = { to, subject, markdown };
    if (cc?.length) body.cc = cc;
    if (bcc?.length) body.bcc = bcc;
    if (attachments?.length) body.attachments = attachments;
    if (idempotency_key) body.idempotency_key = idempotency_key;
    const data = await apiCall("POST", `/v1/mailboxes/${encodeURIComponent(id)}/send`, body);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 3: check_inbox
server.tool(
  "check_inbox",
  "List emails in your inbox. Returns email summaries including id, from, to, subject, status, received_at, has_attachments, delivered_at, bounced_at, and bounce_type. Does NOT include the email body — call read_email with the email ID to get the full message content. Supports filtering by status, sender, subject, date range, direction, attachments, and incremental polling via since_id.",
  {
    status: z.enum(["unread", "read", "archived", "deleted", "pending_send_approval", "pending_inbound_approval", "rejected", "cancelled", "send_failed"]).optional().describe("Filter by email status (default: all)"),
    sender: z.string().optional().describe("Filter by sender email address (partial match)"),
    subject_contains: z.string().optional().describe("Filter by subject text (partial match)"),
    date_after: z.string().optional().describe("Only emails received after this ISO datetime"),
    date_before: z.string().optional().describe("Only emails received before this ISO datetime"),
    direction: z.enum(["inbound", "outbound"]).optional().describe("Filter by email direction"),
    has_attachments: z.boolean().optional().describe("Filter to emails with/without attachments"),
    since_id: z.string().optional().describe("Only emails with ID greater than this value (for incremental polling)"),
    limit: z.number().int().min(1).max(100).optional().describe("Max results to return (default 20, max 100)"),
    cursor: z.string().optional().describe("Pagination cursor from previous response to fetch next page"),
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
  },
  async ({ status, sender, subject_contains, date_after, date_before, direction, has_attachments, since_id, limit, cursor, mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (sender) params.set("sender", sender);
    if (subject_contains) params.set("subject_contains", subject_contains);
    if (date_after) params.set("date_after", date_after);
    if (date_before) params.set("date_before", date_before);
    if (direction) params.set("direction", direction);
    if (has_attachments !== undefined) params.set("has_attachments", String(has_attachments));
    if (since_id) params.set("since_id", since_id);
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await apiCall("GET", `/v1/mailboxes/${encodeURIComponent(id)}/emails${query}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 4: read_email
server.tool(
  "read_email",
  "Get the full content of a specific email, including the markdown body and attachment metadata. Automatically marks unread emails as read. Use the email ID from check_inbox results.",
  {
    email_id: z.string().describe("The email ID to read"),
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
  },
  async ({ email_id, mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    const data = await apiCall("GET", `/v1/mailboxes/${encodeURIComponent(id)}/emails/${encodeURIComponent(email_id)}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 5: reply_email
server.tool(
  "reply_email",
  "Reply to an email in its existing thread. Threading headers (In-Reply-To, References) are set automatically. The body is written in markdown. Returns HTTP 202 with {id, status}. The initial status is 'pending_scan'. For gated mailboxes, it moves to 'pending_send_approval' for human review. Do not retry or resend when you see pending_scan or pending_send_approval.",
  {
    email_id: z.string().describe("The email ID to reply to"),
    markdown: z.string().describe("Reply body in markdown format"),
    cc: z.array(z.string().email()).optional().describe("CC email addresses"),
    bcc: z.array(z.string().email()).optional().describe("BCC email addresses"),
    attachments: z.array(z.object({
      name: z.string().describe("Filename"),
      content_base64: z.string().describe("File content as base64"),
      content_type: z.string().describe("MIME type, e.g. application/pdf"),
    })).optional().describe("File attachments (base64-encoded)"),
    idempotency_key: z.string().optional().describe("Unique key to prevent duplicate replies. If the same key is used within 24 hours, the original reply is returned instead of sending again."),
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
  },
  async ({ email_id, markdown, cc, bcc, attachments, idempotency_key, mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    const body: Record<string, unknown> = { markdown };
    if (cc?.length) body.cc = cc;
    if (bcc?.length) body.bcc = bcc;
    if (attachments?.length) body.attachments = attachments;
    if (idempotency_key) body.idempotency_key = idempotency_key;
    const data = await apiCall("POST", `/v1/mailboxes/${encodeURIComponent(id)}/reply/${encodeURIComponent(email_id)}`, body);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 6: download_attachment
server.tool(
  "download_attachment",
  "Download an email attachment. Returns the file content as base64-encoded data along with the content type. Use this to read inbound PDFs, images, documents, and other attachments.",
  {
    email_id: z.string().describe("The email ID that has the attachment"),
    filename: z.string().describe("The attachment filename (from read_email attachment list)"),
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
  },
  async ({ email_id, filename, mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    const res = await fetch(`${BASE_URL}/v1/mailboxes/${encodeURIComponent(id)}/emails/${encodeURIComponent(email_id)}/attachments/${encodeURIComponent(filename)}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to download attachment (${res.status}): ${text.slice(0, 200)}`);
    }
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const buffer = await res.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ filename, content_type: contentType, content_base64: base64, size_bytes: buffer.byteLength }, null, 2) }],
    };
  }
);

// Tool 7: get_thread
server.tool(
  "get_thread",
  "Get all emails in a conversation thread, ordered chronologically. Returns participants, message count, last activity timestamp, and whether there's an unanswered inbound email. Use the thread_id from check_inbox or read_email results.",
  {
    thread_id: z.string().describe("The thread ID to retrieve"),
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
  },
  async ({ thread_id, mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    const data = await apiCall("GET", `/v1/mailboxes/${encodeURIComponent(id)}/threads/${encodeURIComponent(thread_id)}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 8: cancel_message
server.tool(
  "cancel_message",
  "Cancel a pending email. Works on emails with status 'pending_scan', 'pending_send_approval', or 'pending_inbound_approval'. Returns 409 if the email has already been sent or approved. Idempotent: cancelling an already-cancelled email returns 200.",
  {
    email_id: z.string().describe("The email ID to cancel"),
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
  },
  async ({ email_id, mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    const data = await apiCall("POST", `/v1/mailboxes/${encodeURIComponent(id)}/emails/${encodeURIComponent(email_id)}/cancel`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 8: update_mailbox
server.tool(
  "update_mailbox",
  "Update settings for a mailbox. All fields are optional — only include fields you want to change. signature_block is plain text (max 200 chars, no HTML) that appears in the email footer to identify the sender. Set signature_block to null to clear it.",
  {
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
    display_name: z.string().optional().describe("Display name for outbound emails"),
    oversight_mode: z.enum(["read_only", "autonomous", "monitored", "gated_send", "gated_all"]).optional().describe("Oversight mode for this mailbox"),
    auto_cc: z.string().email().nullable().optional().describe("Auto-CC address for all outbound emails"),
    auto_bcc: z.string().email().nullable().optional().describe("Auto-BCC address for all outbound emails"),
    forward_inbound: z.boolean().optional().describe("Forward inbound emails to oversight email"),
    webhook_url: z.string().url().nullable().optional().describe("Webhook URL for email events (must be HTTPS)"),
    oversight_webhook_url: z.string().url().nullable().optional().describe("Webhook URL for oversight events (must be HTTPS)"),
    signature_block: z.string().max(200).nullable().optional().describe("Plain text signature block for email footer (max 200 chars, no HTML)"),
  },
  async ({ mailbox_id, ...updates }) => {
    const id = getMailboxId(mailbox_id);
    const data = await apiCall("PATCH", `/v1/mailboxes/${encodeURIComponent(id)}`, updates);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 7: update_account
server.tool(
  "update_account",
  "Update account settings. Use this to change your organization name (appears in email footers when no signature block is set), oversight email address, or physical address for CAN-SPAM compliance. Requires admin scope.",
  {
    name: z.string().optional().describe("Organization/operator name"),
    oversight_email: z.string().email().optional().describe("Email address for oversight notifications"),
    physical_address: z.string().nullable().optional().describe("Physical mailing address (CAN-SPAM)"),
  },
  async (args) => {
    const data = await apiCall("PATCH", "/v1/account", args);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 8: delete_mailbox
server.tool(
  "delete_mailbox",
  "Permanently delete a mailbox. This deactivates the mailbox and all associated email data. The email address cannot be reused after deletion. Requires admin scope on the API key. This action cannot be undone.",
  {
    mailbox_id: z.string().describe("Mailbox ID to delete (use list_mailboxes to find it)"),
  },
  async ({ mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    const data = await apiCall("DELETE", `/v1/mailboxes/${encodeURIComponent(id)}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 9: resend_confirmation (search_identity removed — identity now delivered via signed X-MultiMail-Identity email header)
server.tool(
  "resend_confirmation",
  "Resend the activation email with a new code. Use this if the account is stuck in 'pending_operator_confirmation' status because the original email was lost or filtered. The operator must enter the code at the activation page or via the activate_account tool to activate the account. Rate limited to 1 request per 5 minutes. Only works for unconfirmed accounts.",
  {},
  async () => {
    const data = await apiCall("POST", "/v1/account/resend-confirmation");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 10: activate_account
server.tool(
  "activate_account",
  "Activate a MultiMail account using the activation code from the confirmation email. The operator receives the code via email and can provide it to the agent. Accepts the code with or without dashes (e.g. 'SKP-7D2-4V8' or 'SKP7D24V8'). Rate limited to 5 attempts per hour.",
  {
    code: z.string().describe("The activation code from the confirmation email (e.g. SKP-7D2-4V8)"),
  },
  async ({ code }) => {
    const res = await fetch(`${BASE_URL}/v1/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      throw new Error(`Activation failed: ${data.error || JSON.stringify(data)}`);
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 13: tag_email
server.tool(
  "tag_email",
  "Set, get, or delete tags on an email. Tags are key-value pairs that persist across sessions — use them for priority flags, follow-up dates, extracted data, or any agent metadata. Action 'set' merges tags (existing keys are overwritten), 'get' returns all tags, 'delete' removes a specific tag key.",
  {
    email_id: z.string().describe("The email ID to tag"),
    action: z.enum(["set", "get", "delete"]).describe("Action to perform"),
    tags: z.record(z.string()).optional().describe("Key-value pairs to set (required for 'set' action)"),
    key: z.string().optional().describe("Tag key to delete (required for 'delete' action)"),
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
  },
  async ({ email_id, action, tags, key, mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    if (action === "set") {
      if (!tags || Object.keys(tags).length === 0) throw new Error("tags object required for 'set' action");
      const data = await apiCall("PUT", `/v1/mailboxes/${encodeURIComponent(id)}/emails/${encodeURIComponent(email_id)}/tags`, { tags });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } else if (action === "delete") {
      if (!key) throw new Error("key required for 'delete' action");
      const data = await apiCall("DELETE", `/v1/mailboxes/${encodeURIComponent(id)}/emails/${encodeURIComponent(email_id)}/tags/${encodeURIComponent(key)}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } else {
      const data = await apiCall("GET", `/v1/mailboxes/${encodeURIComponent(id)}/emails/${encodeURIComponent(email_id)}/tags`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  }
);

// Tool 14: add_contact
server.tool(
  "add_contact",
  "Add a contact to your address book. Use this to save frequently used email addresses with names and optional tags for easy lookup later.",
  {
    name: z.string().describe("Contact name"),
    email: z.string().email().describe("Contact email address"),
    tags: z.array(z.string()).optional().describe("Optional tags for categorization (e.g. ['contractor', 'plumber'])"),
  },
  async ({ name, email, tags }) => {
    const data = await apiCall("POST", "/v1/contacts", { name, email, tags });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 15: search_contacts
server.tool(
  "search_contacts",
  "Search your address book by name or email. Returns matching contacts with their tags. Call with no query to list all contacts.",
  {
    query: z.string().optional().describe("Search by name or email (partial match)"),
  },
  async ({ query }) => {
    const q = query ? `?q=${encodeURIComponent(query)}` : "";
    const data = await apiCall("GET", `/v1/contacts${q}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 16: get_account
server.tool(
  "get_account",
  "Get account status, plan, quota used/remaining, sending enabled, and enforcement tier. Use this for self-diagnosis when sends fail or to check remaining quota before a batch operation.",
  {},
  async () => {
    const data = await apiCall("GET", "/v1/account");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 17: create_mailbox
server.tool(
  "create_mailbox",
  "Create a new mailbox. The address_local_part becomes <local>@<tenant>.multimail.dev. Requires admin scope. Returns the new mailbox ID and full address.",
  {
    address_local_part: z.string().describe("Local part of the email address (e.g. 'support' becomes support@tenant.multimail.dev)"),
    display_name: z.string().optional().describe("Display name for outbound emails"),
    oversight_mode: z.enum(["read_only", "autonomous", "monitored", "gated_send", "gated_all"]).optional().describe("Oversight mode (default: gated_send)"),
  },
  async ({ address_local_part, display_name, oversight_mode }) => {
    const body: Record<string, unknown> = { address: address_local_part };
    if (display_name) body.display_name = display_name;
    if (oversight_mode) body.oversight_mode = oversight_mode;
    const data = await apiCall("POST", "/v1/mailboxes", body);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 18: request_upgrade
server.tool(
  "request_upgrade",
  "Request an oversight mode upgrade for a mailbox. This is the trust ladder entry point — sends a request to the human operator for approval. The operator receives an email with a one-time upgrade code. Requires admin scope.",
  {
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
    target_mode: z.enum(["autonomous", "monitored", "gated_send", "gated_all"]).describe("The oversight mode to upgrade to"),
  },
  async ({ mailbox_id, target_mode }) => {
    const id = getMailboxId(mailbox_id);
    const data = await apiCall("POST", `/v1/mailboxes/${encodeURIComponent(id)}/request-upgrade`, { target_mode });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 19: apply_upgrade
server.tool(
  "apply_upgrade",
  "Apply an oversight mode upgrade using the code from the upgrade approval email. The operator provides this code after approving the upgrade request.",
  {
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
    code: z.string().describe("The upgrade code from the approval email"),
  },
  async ({ mailbox_id, code }) => {
    const id = getMailboxId(mailbox_id);
    const data = await apiCall("POST", `/v1/mailboxes/${encodeURIComponent(id)}/upgrade`, { code });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 20: get_usage
server.tool(
  "get_usage",
  "Check quota and usage statistics for the current billing period. Returns emails sent, received, storage used, and plan limits.",
  {
    period: z.enum(["summary", "daily"]).optional().describe("'summary' for current period totals (default), 'daily' for day-by-day breakdown"),
  },
  async ({ period }) => {
    const params = period ? `?period=${period}` : "";
    const data = await apiCall("GET", `/v1/usage${params}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 21: list_pending
server.tool(
  "list_pending",
  "List emails awaiting oversight decision (pending_send_approval or pending_inbound_approval). Requires oversight scope on the API key. Use this to review emails before approving or rejecting them with decide_email.",
  {},
  async () => {
    const data = await apiCall("GET", "/v1/oversight/pending");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 22: decide_email
server.tool(
  "decide_email",
  "Approve or reject a pending email in the oversight queue. Approved outbound emails are sent immediately. Requires oversight scope on the API key.",
  {
    email_id: z.string().describe("The email ID to approve or reject"),
    action: z.enum(["approve", "reject"]).describe("Whether to approve or reject the email"),
    reason: z.string().optional().describe("Optional reason for the decision (logged in audit trail)"),
  },
  async ({ email_id, action, reason }) => {
    const body: Record<string, unknown> = { email_id, action };
    if (reason) body.reason = reason;
    const data = await apiCall("POST", "/v1/oversight/decide", body);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 23: delete_contact
server.tool(
  "delete_contact",
  "Delete a contact from your address book. Use search_contacts to find the contact ID first.",
  {
    contact_id: z.string().describe("The contact ID to delete"),
  },
  async ({ contact_id }) => {
    const data = await apiCall("DELETE", `/v1/contacts/${encodeURIComponent(contact_id)}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 24: check_suppression
server.tool(
  "check_suppression",
  "List suppressed email addresses. Emails to suppressed addresses will bounce. Check this before sending to verify a recipient is deliverable.",
  {
    limit: z.number().int().min(1).max(100).optional().describe("Max results to return (default 20)"),
    cursor: z.string().optional().describe("Pagination cursor from previous response"),
  },
  async ({ limit, cursor }) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await apiCall("GET", `/v1/suppression${query}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 25: remove_suppression
server.tool(
  "remove_suppression",
  "Remove an email address from the suppression list, allowing future emails to be delivered to it. Use check_suppression to see which addresses are suppressed.",
  {
    email_address: z.string().email().describe("The suppressed email address to remove"),
  },
  async ({ email_address }) => {
    const data = await apiCall("DELETE", `/v1/suppression/${encodeURIComponent(email_address)}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 26: list_api_keys
server.tool(
  "list_api_keys",
  "List all API keys for this account. Returns key metadata (ID, name, scopes, created_at) but not the key values. Requires admin scope.",
  {},
  async () => {
    const data = await apiCall("GET", "/v1/api-keys");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 27: create_api_key
server.tool(
  "create_api_key",
  "Create a new API key with specified scopes. The key value is only returned once — store it securely. Requires admin scope.",
  {
    name: z.string().describe("Human-readable name for this key"),
    scopes: z.array(z.string()).describe("Permission scopes (e.g. ['read', 'send', 'admin', 'oversight'])"),
  },
  async ({ name, scopes }) => {
    const data = await apiCall("POST", "/v1/api-keys", { name, scopes });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 28: revoke_api_key
server.tool(
  "revoke_api_key",
  "Revoke an API key, permanently disabling it. Use list_api_keys to find the key ID. Requires admin scope. This action cannot be undone.",
  {
    key_id: z.string().describe("The API key ID to revoke"),
  },
  async ({ key_id }) => {
    const data = await apiCall("DELETE", `/v1/api-keys/${encodeURIComponent(key_id)}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 29: get_audit_log
server.tool(
  "get_audit_log",
  "Get the audit log for this account. Returns a chronological list of actions (sends, oversight decisions, setting changes, key creation, etc.). Requires admin scope.",
  {
    limit: z.number().int().min(1).max(100).optional().describe("Max results to return (default 50)"),
    cursor: z.string().optional().describe("Pagination cursor from previous response"),
  },
  async ({ limit, cursor }) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await apiCall("GET", `/v1/audit-log${query}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 30: delete_account
server.tool(
  "delete_account",
  "Permanently delete this account and ALL associated data (mailboxes, emails, API keys, usage, audit log). The slug is freed for re-registration. Requires admin scope. THIS ACTION CANNOT BE UNDONE.",
  {},
  async () => {
    const data = await apiCall("DELETE", "/v1/account");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
