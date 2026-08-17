import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import {PluginFileAPI} from 'sn-plugin-lib';
import App from '../App';
import {pair} from '../src/api';

jest.mock('sn-plugin-lib', () => {
  const response = <T,>(result: T) => ({success: true, result, error: null});

  return {
    FileUtils: {
      deleteDir: jest.fn().mockResolvedValue(true),
      deleteFile: jest.fn().mockResolvedValue(true),
      exists: jest.fn().mockResolvedValue(true),
      listFiles: jest.fn().mockResolvedValue([]),
      makeDir: jest.fn().mockResolvedValue(true),
    },
    PluginCommAPI: {
      getCurrentFilePath: jest.fn().mockResolvedValue(
        response('/storage/emulated/0/Note/Morning.note'),
      ),
    },
    PluginDocAPI: {
      getCurrentTotalPages: jest.fn().mockResolvedValue(response(1)),
    },
    PluginFileAPI: {
      generateNotePng: jest.fn().mockResolvedValue(response(true)),
      getNoteTotalPageNum: jest
        .fn()
        .mockRejectedValue(new TypeError('undefined is not a function')),
    },
    PluginManager: {
      closePluginView: jest.fn(),
      getPluginDirPath: jest.fn().mockResolvedValue('/plugin'),
    },
    PluginNoteAPI: {
      saveCurrentNote: jest.fn().mockResolvedValue(response(true)),
    },
  };
});

jest.mock('../src/api', () => {
  const actual = jest.requireActual('../src/api');
  return {
    ...actual,
    pair: jest.fn().mockResolvedValue({
      bearer: 'sn_local_repro',
      upload_url: 'https://example.test/imports',
    }),
    uploadNotebook: jest.fn().mockResolvedValue({
      status: 'accepted',
      source_id: '00000000-0000-4000-8000-000000000000',
      revision_digest: '0'.repeat(64),
      post_id: 1,
    }),
  };
});

function visibleText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .flatMap(node => node.props.children)
    .filter(child => typeof child === 'string')
    .join(' ');
}

test('sends with the current-document page-count fallback', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }) as jest.Mock;

  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });

  await act(async () => {
    renderer.root
      .findByProps({accessibilityLabel: 'Pairing code'})
      .props.onChangeText('ABCD-EFGH');
  });
  await act(async () => {
    await renderer.root
      .findByProps({accessibilityRole: 'button', disabled: false})
      .props.onPress();
  });
  expect(pair).toHaveBeenCalledWith('ABCD-EFGH');

  await act(async () => {
    await renderer.root
      .findByProps({accessibilityRole: 'button', disabled: false})
      .props.onPress();
  });

  expect(visibleText(renderer)).toContain('Upload accepted');
  expect(visibleText(renderer)).not.toContain('undefined is not a function');

  (PluginFileAPI.generateNotePng as jest.Mock).mockRejectedValue(
    'native render failure',
  );
  await act(async () => {
    await renderer.root
      .findByProps({accessibilityRole: 'button', disabled: false})
      .props.onPress();
  });

  const diagnostic = visibleText(renderer);
  expect(diagnostic).toContain('Diagnostic trace');
  expect(diagnostic).toContain('Plugin 0.0.4');
  expect(diagnostic).toContain('STAGE render NOTE');
  expect(diagnostic).toContain('CALL PluginFileAPI.generateNotePng');
  expect(diagnostic).toContain(
    'ERROR PluginFileAPI.generateNotePng: native render failure',
  );
  expect(diagnostic).not.toContain('/storage/emulated/0/Note/Morning.note');
});
