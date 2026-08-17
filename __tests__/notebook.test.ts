import {sha256} from 'js-sha256';
import {
  FileUtils,
  PluginCommAPI,
  PluginDocAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import {
  cleanupRenderedPages,
  currentNotebook,
  renderNotebook,
} from '../src/notebook';

jest.mock('sn-plugin-lib', () => ({
  FileUtils: {
    deleteFile: jest.fn(),
    exists: jest.fn(),
    makeDir: jest.fn(),
  },
  PluginCommAPI: {getCurrentFilePath: jest.fn()},
  PluginDocAPI: {getCurrentTotalPages: jest.fn()},
  PluginFileAPI: {
    generateNotePng: jest.fn(),
    getNoteTotalPageNum: jest.fn(),
  },
  PluginManager: {getPluginDirPath: jest.fn()},
  PluginNoteAPI: {saveCurrentNote: jest.fn()},
}));

const response = <T>(result: T) => ({success: true, result, error: null});

beforeEach(() => {
  jest.resetAllMocks();
  (PluginNoteAPI.saveCurrentNote as jest.Mock).mockResolvedValue(
    response(true),
  );
  (PluginCommAPI.getCurrentFilePath as jest.Mock).mockResolvedValue(
    response('/storage/emulated/0/Note/Morning.note'),
  );
  (PluginFileAPI.getNoteTotalPageNum as jest.Mock).mockResolvedValue(
    response(2),
  );
  (PluginDocAPI.getCurrentTotalPages as jest.Mock).mockResolvedValue(
    response(2),
  );
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue('/plugin');
  (FileUtils.exists as jest.Mock).mockResolvedValue(false);
  (FileUtils.makeDir as jest.Mock).mockResolvedValue(true);
  (FileUtils.deleteFile as jest.Mock).mockResolvedValue(true);
  (PluginFileAPI.generateNotePng as jest.Mock).mockResolvedValue(
    response(true),
  );
});

test('saves the open NOTE before reading its path and page count', async () => {
  const notebook = await currentNotebook();

  expect(notebook).toEqual({
    path: '/storage/emulated/0/Note/Morning.note',
    displayName: 'Morning',
    pageCount: 2,
    pluginDirectory: '/plugin',
    forceSaved: true,
  });
  expect(
    (PluginNoteAPI.saveCurrentNote as jest.Mock).mock.invocationCallOrder[0],
  ).toBeLessThan(
    (PluginCommAPI.getCurrentFilePath as jest.Mock).mock.invocationCallOrder[0],
  );
  expect(PluginDocAPI.getCurrentTotalPages).not.toHaveBeenCalled();
});

test('uses the persisted NOTE when this PluginHost cannot force-save it', async () => {
  (PluginNoteAPI.saveCurrentNote as jest.Mock).mockRejectedValue(
    new TypeError('undefined is not a function'),
  );

  const notebook = await currentNotebook();

  expect(notebook).toEqual({
    path: '/storage/emulated/0/Note/Morning.note',
    displayName: 'Morning',
    pageCount: 2,
    pluginDirectory: '/plugin',
    forceSaved: false,
  });
  expect(PluginCommAPI.getCurrentFilePath).toHaveBeenCalledTimes(1);
});

test('recognizes a missing save bridge reported outside the Error realm', async () => {
  (PluginNoteAPI.saveCurrentNote as jest.Mock).mockRejectedValue({
    message: 'undefined is not a function',
  });

  const notebook = await currentNotebook();

  expect(notebook.forceSaved).toBe(false);
  expect(PluginCommAPI.getCurrentFilePath).toHaveBeenCalledTimes(1);
});

test('uses the current-document page count when the path-based bridge is unavailable', async () => {
  (PluginFileAPI.getNoteTotalPageNum as jest.Mock).mockRejectedValue(
    new TypeError('undefined is not a function'),
  );

  const notebook = await currentNotebook();

  expect(notebook.pageCount).toBe(2);
  expect(PluginDocAPI.getCurrentTotalPages).toHaveBeenCalledTimes(1);
});

test('names the unavailable page-count bridge instead of exposing a raw runtime error', async () => {
  (PluginFileAPI.getNoteTotalPageNum as jest.Mock).mockRejectedValue(
    new TypeError('undefined is not a function'),
  );
  (PluginDocAPI.getCurrentTotalPages as jest.Mock).mockRejectedValue(
    new TypeError('undefined is not a function'),
  );

  await expect(currentNotebook()).rejects.toThrow(
    /PluginDocAPI\.getCurrentTotalPages.*device model.*firmware/i,
  );
});

test('does not hide a real path-based page-count failure behind the fallback', async () => {
  (PluginFileAPI.getNoteTotalPageNum as jest.Mock).mockResolvedValue({
    success: false,
    error: {message: 'The NOTE index is unavailable.'},
  });

  await expect(currentNotebook()).rejects.toThrow(
    'The NOTE index is unavailable.',
  );
  expect(PluginDocAPI.getCurrentTotalPages).not.toHaveBeenCalled();
});

test('names an unavailable current-path bridge', async () => {
  (PluginCommAPI.getCurrentFilePath as jest.Mock).mockRejectedValue(
    new TypeError('undefined is not a function'),
  );

  await expect(currentNotebook()).rejects.toThrow(
    /PluginCommAPI\.getCurrentFilePath.*device model.*firmware/i,
  );
});

test('names an unavailable plugin-directory bridge', async () => {
  (PluginManager.getPluginDirPath as jest.Mock).mockRejectedValue(
    new TypeError('undefined is not a function'),
  );

  await expect(currentNotebook()).rejects.toThrow(
    /PluginManager\.getPluginDirPath.*device model.*firmware/i,
  );
});

test('stops when an available save function reports a real failure', async () => {
  (PluginNoteAPI.saveCurrentNote as jest.Mock).mockResolvedValue({
    success: false,
    error: {message: 'The NOTE is busy.'},
  });

  await expect(currentNotebook()).rejects.toThrow('The NOTE is busy.');
  expect(PluginCommAPI.getCurrentFilePath).not.toHaveBeenCalled();
});

test('renders zero-based pages, hashes their bytes, and builds the ordered revision', async () => {
  const bytes = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({arrayBuffer: async () => bytes[0].buffer})
    .mockResolvedValueOnce({
      arrayBuffer: async () => bytes[1].buffer,
    }) as jest.Mock;
  const progress: string[] = [];

  const rendered = await renderNotebook(
    {
      path: '/notes/Morning.note',
      displayName: 'Morning',
      pageCount: 2,
      pluginDirectory: '/plugin',
      forceSaved: true,
    },
    (page, total) => progress.push(`${page}/${total}`),
  );

  expect(PluginFileAPI.generateNotePng).toHaveBeenNthCalledWith(1, {
    notePath: '/notes/Morning.note',
    page: 0,
    times: 1,
    pngPath: '/plugin/handwritten-blog-render/page-0001.png',
    type: 1,
  });
  expect(PluginFileAPI.generateNotePng).toHaveBeenNthCalledWith(2, {
    notePath: '/notes/Morning.note',
    page: 1,
    times: 1,
    pngPath: '/plugin/handwritten-blog-render/page-0002.png',
    type: 1,
  });
  expect(progress).toEqual(['1/2', '2/2']);
  expect(rendered.pages.map(page => page.sha256)).toEqual(
    bytes.map(page => sha256(page)),
  );
  expect(rendered.revisionDigest).toBe(
    sha256(rendered.pages.map(page => page.sha256).join('')),
  );

  await cleanupRenderedPages(rendered.pages);
  expect(FileUtils.deleteFile).toHaveBeenCalledTimes(2);
});

test('names a runtime without rendered-file byte readback', async () => {
  global.fetch = jest.fn().mockResolvedValue({}) as jest.Mock;

  await expect(
    renderNotebook(
      {
        path: '/notes/Morning.note',
        displayName: 'Morning',
        pageCount: 1,
        pluginDirectory: '/plugin',
        forceSaved: true,
      },
      jest.fn(),
    ),
  ).rejects.toThrow(/Response\.arrayBuffer.*device model.*firmware/i);
});

test('names an unavailable NOTE renderer bridge', async () => {
  (PluginFileAPI.generateNotePng as jest.Mock).mockRejectedValue(
    new TypeError('undefined is not a function'),
  );

  await expect(
    renderNotebook(
      {
        path: '/notes/Morning.note',
        displayName: 'Morning',
        pageCount: 1,
        pluginDirectory: '/plugin',
        forceSaved: true,
      },
      jest.fn(),
    ),
  ).rejects.toThrow(/PluginFileAPI\.generateNotePng.*device model.*firmware/i);
});
