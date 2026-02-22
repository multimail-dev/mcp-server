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
      const retryAfter = res.headers.get("retry-after") || "unknown";
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
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
  version: "0.1.4",
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
  "Send an email from your MultiMail address. The body is written in markdown and automatically converted to formatted HTML for delivery. If the mailbox uses gated oversight, the response status will be 'pending_approval' — this means the email is queued for human review. Do not retry or resend when you see pending_approval.",
  {
    to: z.array(z.string().email()).describe("Recipient email addresses"),
    subject: z.string().describe("Email subject line"),
    markdown: z.string().describe("Email body in markdown format"),
    cc: z.array(z.string().email()).optional().describe("CC email addresses"),
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
  },
  async ({ to, subject, markdown, cc, mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    const body: Record<string, unknown> = { to, subject, markdown };
    if (cc?.length) body.cc = cc;
    const data = await apiCall("POST", `/v1/mailboxes/${encodeURIComponent(id)}/send`, body);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 3: check_inbox
server.tool(
  "check_inbox",
  "List emails in your inbox. Returns email summaries including id, from, to, subject, status, received_at, and has_attachments. Does NOT include the email body — call read_email with the email ID to get the full message content.",
  {
    status: z.enum(["unread", "read", "archived"]).optional().describe("Filter by email status (default: all)"),
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
  },
  async ({ status, mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    const query = status ? `?status=${status}` : "";
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
  "Reply to an email in its existing thread. Threading headers (In-Reply-To, References) are set automatically. The body is written in markdown. If the mailbox uses gated oversight, the response status will be 'pending_approval' — the reply is queued for human review. Do not retry or resend when you see pending_approval.",
  {
    email_id: z.string().describe("The email ID to reply to"),
    markdown: z.string().describe("Reply body in markdown format"),
    cc: z.array(z.string().email()).optional().describe("CC email addresses"),
    mailbox_id: z.string().optional().describe("Mailbox ID (uses MULTIMAIL_MAILBOX_ID env var if not provided)"),
  },
  async ({ email_id, markdown, cc, mailbox_id }) => {
    const id = getMailboxId(mailbox_id);
    const body: Record<string, unknown> = { markdown };
    if (cc?.length) body.cc = cc;
    const data = await apiCall("POST", `/v1/mailboxes/${encodeURIComponent(id)}/reply/${encodeURIComponent(email_id)}`, body);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 6: search_identity
server.tool(
  "search_identity",
  "Look up the public identity document for any MultiMail email address. Returns the agent's operator, oversight mode, capabilities, and whether the operator is verified. No authentication required. Use this to verify another agent's identity before sending sensitive information.",
  {
    address: z.string().email().describe("The email address to look up (e.g. sandy@multimail.dev)"),
  },
  async ({ address }) => {
    const data = await publicFetch(`/.well-known/agent/${encodeURIComponent(address)}`);
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
