export const PLUGIN_VERSION = '0.0.5';

export type DiagnosticEventKind = 'stage' | 'call' | 'ok' | 'error';

type DiagnosticEvent = {
  elapsedMs: number;
  kind: DiagnosticEventKind;
  name: string;
  detail?: string;
};

type DiagnosticTrace = {
  id: string;
  action: string;
  startedAt: number;
  events: DiagnosticEvent[];
};

type ErrorDetails = {
  name: string;
  message: string;
  stack?: string;
};

const MAX_EVENTS = 100;
const MAX_STACK_LENGTH = 6_000;
let activeTrace: DiagnosticTrace | undefined;

export function startDiagnosticTrace(action: string): void {
  const startedAt = Date.now();
  activeTrace = {
    id: traceId(startedAt),
    action: sanitize(action),
    startedAt,
    events: [],
  };
}

export function recordDiagnosticEvent(
  kind: DiagnosticEventKind,
  name: string,
  error?: unknown,
): void {
  if (!activeTrace || activeTrace.events.length >= MAX_EVENTS) {
    return;
  }

  const detail = error === undefined ? undefined : errorDetails(error).message;
  activeTrace.events.push({
    elapsedMs: Math.max(0, Date.now() - activeTrace.startedAt),
    kind,
    name: sanitize(name),
    detail: detail ? sanitize(detail) : undefined,
  });
}

export function formatDiagnosticTrace(error: unknown): {
  message: string;
  report: string;
} {
  const details = errorDetails(error);
  const trace = activeTrace || {
    id: 'NO-TRACE',
    action: 'unknown',
    startedAt: 0,
    events: [],
  };
  const message =
    details.name && details.name !== 'Error'
      ? `${details.name}: ${details.message}`
      : details.message;
  const lines = [
    `Trace ${trace.id}`,
    `Plugin ${PLUGIN_VERSION}`,
    `Action ${trace.action}`,
  ];

  trace.events.forEach((event, index) => {
    const detail = event.detail ? `: ${event.detail}` : '';
    lines.push(
      `${leftPad(String(index + 1), 2, '0')} +${leftPad(
        String(event.elapsedMs),
        4,
        '0',
      )}ms ${event.kind.toUpperCase()} ${event.name}${detail}`,
    );
  });
  lines.push(`THROWN ${sanitize(details.name)}: ${sanitize(details.message)}`);

  if (details.stack) {
    lines.push('STACK');
    lines.push(limitStack(sanitize(details.stack)));
  }

  return {message: sanitize(message), report: lines.join('\n')};
}

function errorDetails(error: unknown): ErrorDetails {
  if (typeof error === 'string') {
    return {name: 'Thrown string', message: error};
  }

  if (error && typeof error === 'object') {
    return {
      name: safeStringProperty(error, 'name') || 'Thrown object',
      message:
        safeStringProperty(error, 'message') || safeString(error, 'Unknown error'),
      stack: safeStringProperty(error, 'stack') || undefined,
    };
  }

  return {
    name: `Thrown ${typeof error}`,
    message: safeString(error, 'Unknown error'),
  };
}

function safeStringProperty(value: object, property: string): string {
  try {
    const candidate = (value as Record<string, unknown>)[property];
    return typeof candidate === 'string' ? candidate : '';
  } catch {
    return '';
  }
}

function safeString(value: unknown, fallback: string): string {
  try {
    const converted = String(value);
    return converted && converted !== '[object Object]' ? converted : fallback;
  } catch {
    return fallback;
  }
}

function sanitize(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(?:file:\/\/)?\/storage\/[^\s)\]}]+/gi, '[device-path]')
    .replace(/https?:\/\/[^\s)\]}]+/gi, '[url]')
    .replace(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, '[pairing-code]')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '[id]',
    );
}

function limitStack(stack: string): string {
  if (stack.length <= MAX_STACK_LENGTH) {
    return stack;
  }
  return `${stack.slice(0, MAX_STACK_LENGTH)}\n[stack truncated]`;
}

function traceId(timestamp: number): string {
  const timePart = timestamp.toString(36).toUpperCase().slice(-4);
  const randomPart = Math.floor(Math.random() * 1_679_616)
    .toString(36)
    .toUpperCase();
  return `${leftPad(timePart, 4, '0')}-${leftPad(randomPart, 4, '0')}`;
}

function leftPad(value: string, length: number, fill: string): string {
  let result = value;
  while (result.length < length) {
    result = `${fill}${result}`;
  }
  return result;
}
