import {sha256} from 'js-sha256';
import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import {fileUri, RenderedPage} from './api';

export const MAX_PAGES = 20;

export type NotebookContext = {
  path: string;
  displayName: string;
  pageCount: number;
  pluginDirectory: string;
};

type APIResponse<T> = {
  success: boolean;
  result?: T | null;
  error?: {message?: string} | null;
};

export async function currentNotebook(): Promise<NotebookContext> {
  const saved = asResponse<boolean>(await PluginNoteAPI.saveCurrentNote());
  requireResult(saved, 'The open NOTE could not be saved.');

  const pathResult = asResponse<string>(
    await PluginCommAPI.getCurrentFilePath(),
  );
  const path = requireResult(pathResult, 'Open a NOTE before sending it.');
  if (!path.toLowerCase().endsWith('.note')) {
    throw new Error('Send is available only while a NOTE is open.');
  }

  const pagesResult = asResponse<number>(
    await PluginFileAPI.getNoteTotalPageNum(path),
  );
  const pageCount = requireResult(
    pagesResult,
    'The NOTE page count could not be read.',
  );
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('This NOTE does not contain a readable page.');
  }
  if (pageCount > MAX_PAGES) {
    throw new Error(`This pilot accepts at most ${MAX_PAGES} pages.`);
  }

  const pluginDirectory = await PluginManager.getPluginDirPath();
  if (!pluginDirectory) {
    throw new Error(
      'The plugin storage directory is unavailable on this firmware.',
    );
  }

  return {
    path,
    displayName: notebookName(path),
    pageCount,
    pluginDirectory,
  };
}

export async function renderNotebook(
  notebook: NotebookContext,
  onProgress: (page: number, total: number) => void,
): Promise<{pages: RenderedPage[]; revisionDigest: string}> {
  const pages: RenderedPage[] = [];
  const outputDirectory = `${notebook.pluginDirectory}/handwritten-blog-render`;
  if (
    !(await FileUtils.exists(outputDirectory)) &&
    !(await FileUtils.makeDir(outputDirectory))
  ) {
    throw new Error(
      'The plugin could not prepare its private render directory.',
    );
  }

  try {
    for (let index = 0; index < notebook.pageCount; index += 1) {
      const position = index + 1;
      const filename = `page-${String(position).padStart(4, '0')}.png`;
      const path = `${outputDirectory}/${filename}`;
      onProgress(position, notebook.pageCount);

      try {
        const generated = asResponse<boolean>(
          await PluginFileAPI.generateNotePng({
            notePath: notebook.path,
            page: index,
            times: 1,
            pngPath: path,
            type: 1,
          }),
        );
        requireResult(generated, `Page ${position} could not be rendered.`);

        pages.push({
          position,
          filename,
          path,
          sha256: await fileDigest(path),
        });
      } catch (error) {
        // A failed render or read-back can still leave a partial PNG behind.
        await FileUtils.deleteFile(path).catch(() => false);
        throw error;
      }
    }
  } catch (error) {
    await cleanupRenderedPages(pages);
    throw error;
  }

  return {
    pages,
    revisionDigest: sha256(pages.map(page => page.sha256).join('')),
  };
}

export async function cleanupRenderedPages(
  pages: RenderedPage[],
): Promise<void> {
  await Promise.all(
    pages.map(page => FileUtils.deleteFile(page.path).catch(() => false)),
  );
}

async function fileDigest(path: string): Promise<string> {
  const response = await fetch(fileUri(path));
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('A rendered page could not be read back for verification.');
  }
  return sha256(bytes);
}

function notebookName(path: string): string {
  const filename = path.split('/').pop() || 'Supernote notebook';
  return filename.replace(/\.note$/i, '') || 'Supernote notebook';
}

function requireResult<T>(response: APIResponse<T>, fallback: string): T {
  if (
    !response.success ||
    response.result === undefined ||
    response.result === null
  ) {
    throw new Error(response.error?.message || fallback);
  }
  return response.result;
}

function asResponse<T>(value: Object | null | undefined): APIResponse<T> {
  if (!value || typeof value !== 'object') {
    return {
      success: false,
      error: {message: 'The Supernote plugin API returned no response.'},
    };
  }
  return value as APIResponse<T>;
}
