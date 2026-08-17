import {
  formatDiagnosticTrace,
  PLUGIN_VERSION,
  recordDiagnosticEvent,
  startDiagnosticTrace,
} from '../src/diagnostics';
import {callPluginHost} from '../src/pluginHost';

afterEach(() => {
  jest.restoreAllMocks();
});

test('formats a complete sanitized trace for an on-device error', () => {
  jest.spyOn(Math, 'random').mockReturnValue(0.123456);
  jest
    .spyOn(Date, 'now')
    .mockReturnValueOnce(1_000)
    .mockReturnValueOnce(1_004)
    .mockReturnValueOnce(1_009);

  startDiagnosticTrace('send');
  recordDiagnosticEvent('stage', 'inspect NOTE');
  recordDiagnosticEvent('call', 'PluginCommAPI.getCurrentFilePath');

  const diagnostic = formatDiagnosticTrace({
    name: 'TypeError',
    message:
      'Failed at /storage/emulated/0/Note/Private.note using ABCD-EFGH',
    stack:
      'TypeError: Bearer super-secret\n    at https://handwritten.blog/index.bundle:42',
  });

  expect(diagnostic.message).toContain('TypeError');
  expect(diagnostic.report).toContain(`Plugin ${PLUGIN_VERSION}`);
  expect(diagnostic.report).toContain('Action send');
  expect(diagnostic.report).toContain('STAGE inspect NOTE');
  expect(diagnostic.report).toContain(
    'CALL PluginCommAPI.getCurrentFilePath',
  );
  expect(diagnostic.report).toContain('STACK');
  expect(diagnostic.report).toContain('[device-path]');
  expect(diagnostic.report).toContain('[pairing-code]');
  expect(diagnostic.report).toContain('Bearer [redacted]');
  expect(diagnostic.report).toContain('[url]');
  expect(diagnostic.report).not.toContain('Private.note');
  expect(diagnostic.report).not.toContain('ABCD-EFGH');
  expect(diagnostic.report).not.toContain('super-secret');
});

test('captures string rejections and names missing host capabilities', async () => {
  startDiagnosticTrace('send');

  let caught: unknown;
  try {
    await callPluginHost('PluginFileAPI.getNoteTotalPageNum', () =>
      Promise.reject('undefined is not a function'),
    );
  } catch (error) {
    caught = error;
  }

  const diagnostic = formatDiagnosticTrace(caught);

  expect(diagnostic.message).toMatch(
    /PluginFileAPI\.getNoteTotalPageNum.*unavailable/i,
  );
  expect(diagnostic.report).toContain(
    'CALL PluginFileAPI.getNoteTotalPageNum',
  );
  expect(diagnostic.report).toContain(
    'ERROR PluginFileAPI.getNoteTotalPageNum: undefined is not a function',
  );
});
