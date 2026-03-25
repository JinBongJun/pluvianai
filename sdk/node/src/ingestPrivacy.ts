/**
 * Ingest payload sanitization (parity with sdk/python/pluvianai/__init__.py).
 */

export function deepJsonCopy(obj: unknown): Record<string, unknown> | unknown[] {
  try {
    return JSON.parse(JSON.stringify(obj)) as Record<string, unknown> | unknown[];
  } catch {
    return { _pluvianai_unserializable: true };
  }
}

export function resolveLogFlag(
  param: boolean | undefined,
  envSpecific: string | undefined,
  envGlobal: string | undefined,
  defaultValue: boolean
): boolean {
  if (param !== undefined) return param;
  if (envSpecific !== undefined && String(envSpecific).trim() !== '') {
    const v = String(envSpecific).trim().toLowerCase();
    return !['0', 'false', 'no', 'off'].includes(v);
  }
  if (envGlobal !== undefined && String(envGlobal).trim() !== '') {
    const v = String(envGlobal).trim().toLowerCase();
    return !['0', 'false', 'no', 'off'].includes(v);
  }
  return defaultValue;
}

function stripRequestMessageBodies(rd: Record<string, unknown>): Record<string, unknown> {
  const out = deepJsonCopy(rd) as Record<string, unknown>;
  const msgs = out.messages;
  if (Array.isArray(msgs)) {
    out.messages = msgs.map((m: unknown) => {
      if (m && typeof m === 'object') {
        const row = { ...(m as Record<string, unknown>) };
        const content = row.content;
        const clen = content != null ? String(content).length : 0;
        row.content = '[omitted]';
        row._pluvianai_content_length = clen;
        return row;
      }
      return m;
    });
    out._pluvianai_message_bodies_omitted = true;
  }
  return out;
}

function stripResponseMessageBodies(rs: Record<string, unknown>): Record<string, unknown> {
  const out = deepJsonCopy(rs) as Record<string, unknown>;
  const ch = out.choices;
  if (Array.isArray(ch)) {
    out.choices = ch.map((c: unknown) => {
      if (c && typeof c === 'object') {
        const row = { ...(c as Record<string, unknown>) };
        const msg = row.message;
        if (msg && typeof msg === 'object') {
          const m = { ...(msg as Record<string, unknown>) };
          const clen = m.content != null ? String(m.content).length : 0;
          m.content = '[omitted]';
          m._pluvianai_content_length = clen;
          row.message = m;
        }
        return row;
      }
      return c;
    });
    out._pluvianai_response_bodies_omitted = true;
  }
  return out;
}

function stripToolEventPayloads(events: unknown[]): unknown[] {
  return events.map(ev => {
    if (!ev || typeof ev !== 'object') return ev;
    const e = { ...(ev as Record<string, unknown>) };
    if ('input' in e) {
      e.input = '[omitted]';
      e._pluvianai_input_omitted = true;
    }
    if ('output' in e) {
      e.output = '[omitted]';
      e._pluvianai_output_omitted = true;
    }
    return e;
  });
}

function truncateIfNeeded(obj: Record<string, unknown>, maxBytes: number, label: string): Record<string, unknown> {
  let s: string;
  try {
    s = JSON.stringify(obj);
  } catch {
    return obj;
  }
  const b = Buffer.byteLength(s, 'utf8');
  if (b <= maxBytes) return obj;
  return {
    _pluvianai_truncated: true,
    _pluvianai_approx_bytes: b,
    _pluvianai_max_bytes: maxBytes,
    _pluvianai_label: label,
    model: obj.model,
  };
}

export interface IngestPrivacyOptions {
  logRequestBodies: boolean;
  logResponseBodies: boolean;
  logToolEventPayloads: boolean;
  maxRequestBodyBytes: number;
  maxResponseBodyBytes: number;
}

export function sanitizeForIngest(
  requestData: Record<string, unknown> | null | undefined,
  responseData: Record<string, unknown> | null | undefined,
  toolEvents: unknown[] | undefined,
  opts: IngestPrivacyOptions
): {
  request_data: Record<string, unknown>;
  response_data: Record<string, unknown>;
  tool_events: unknown[] | undefined;
} {
  let rd = (deepJsonCopy(requestData ?? {}) as Record<string, unknown>) || {};
  let rs = (deepJsonCopy(responseData ?? {}) as Record<string, unknown>) || {};

  if (!opts.logRequestBodies) {
    rd = stripRequestMessageBodies(rd);
  }
  if (!opts.logResponseBodies) {
    rs = stripResponseMessageBodies(rs);
  }

  let teOut: unknown[] | undefined = undefined;
  if (toolEvents !== undefined && toolEvents !== null) {
    teOut = deepJsonCopy(toolEvents) as unknown[];
    if (!opts.logToolEventPayloads) {
      teOut = stripToolEventPayloads(teOut);
    }
  }

  rd = truncateIfNeeded(rd, opts.maxRequestBodyBytes, 'request_data');
  rs = truncateIfNeeded(rs, opts.maxResponseBodyBytes, 'response_data');

  return { request_data: rd, response_data: rs, tool_events: teOut };
}
