import {recordDiagnosticEvent} from './diagnostics';

const SUPPORT_GUIDANCE =
  'Please report this message with your device model and firmware version.';

export class PluginHostCapabilityError extends Error {
  constructor(readonly capability: string) {
    super(
      `Plugin compatibility error: ${capability} is unavailable. ${SUPPORT_GUIDANCE}`,
    );
    this.name = 'PluginHostCapabilityError';
  }
}

export async function callPluginHost<T>(
  capability: string,
  invoke: () => Promise<T> | T,
): Promise<T> {
  recordDiagnosticEvent('call', capability);
  try {
    const result = await invoke();
    recordDiagnosticEvent('ok', capability);
    return result;
  } catch (error) {
    recordDiagnosticEvent('error', capability, error);
    if (isMissingFunction(error)) {
      throw new PluginHostCapabilityError(capability);
    }
    throw error;
  }
}

export async function callOptionalPluginHost<T>(
  capability: string,
  invoke: () => Promise<T> | T,
): Promise<T | undefined> {
  recordDiagnosticEvent('call', capability);
  try {
    const result = await invoke();
    recordDiagnosticEvent('ok', capability);
    return result;
  } catch (error) {
    recordDiagnosticEvent('error', capability, error);
    if (isMissingFunction(error)) {
      return undefined;
    }
    throw error;
  }
}

function isMissingFunction(error: unknown): boolean {
  if (typeof error === 'string') {
    return /not a function/i.test(error);
  }
  if (error instanceof Error) {
    return /not a function/i.test(error.message);
  }
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return /not a function/i.test(error.message);
  }
  return false;
}
