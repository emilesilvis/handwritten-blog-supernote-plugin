import {sha256} from 'js-sha256';
import {
  FileUtils,
  PluginCommAPI,
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
  });
  expect(
    (PluginNoteAPI.saveCurrentNote as jest.Mock).mock.invocationCallOrder[0],
  ).toBeLessThan(
    (PluginCommAPI.getCurrentFilePath as jest.Mock).mock.invocationCallOrder[0],
  );
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
