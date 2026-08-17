import {sha256} from 'js-sha256';
import {
  FileUtils,
  PluginCommAPI,
  PluginDocAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import {fileUri, RenderedPage} from './api';
import {
  callOptionalPluginHost,
  callPluginHost,
  PluginHostCapabilityError,
} from './pluginHost';

export const MAX_PAGES = 20;

export type NotebookContext = {
  path: string;
  displayName: string;
  pageCount: number;
  pluginDirectory: string;
  forceSaved: boolean;
};

type APIResponse<T> = {
  success: boolean;
  result?: T | null;
  error?: {message?: string} | null;
};

export async function currentNotebook(): Promise<NotebookContext> {
  const forceSaved = await saveCurrentNotebookIfSupported();

  const pathResult = asResponse<string>(
    await callPluginHost('PluginCommAPI.getCurrentFilePath', () =>
      PluginCommAPI.getCurrentFilePath(),
    ),
  );
  const path = requireResult(pathResult, 'Open a NOTE before sending it.');
  if (!path.toLowerCase().endsWith('.note')) {
    throw new Error('Send is available only while a NOTE is open.');
  }

  const pagesResult = asResponse<number>(
    await pageCountResponse(path),
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

  const pluginDirectory = await callPluginHost(
    'PluginManager.getPluginDirPath',
    () => PluginManager.getPluginDirPath(),
  );
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
    forceSaved,
  };
}

export async function renderNotebook(
  notebook: NotebookContext,
  onProgress: (page: number, total: number) => void,
): Promise<{pages: RenderedPage[]; revisionDigest: string}> {
  const pages: RenderedPage[] = [];
  const outputDirectory = `${notebook.pluginDirectory}/handwritten-blog-render`;
  const outputExists = await callPluginHost('FileUtils.exists', () =>
    FileUtils.exists(outputDirectory),
  );
  const outputCreated =
    outputExists ||
    (await callPluginHost('FileUtils.makeDir', () =>
      FileUtils.makeDir(outputDirectory),
    ));
  if (!outputCreated) {
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
          await callPluginHost('PluginFileAPI.generateNotePng', () =>
            PluginFileAPI.generateNotePng({
              notePath: notebook.path,
              page: index,
              times: 1,
              pngPath: path,
              type: 1,
            }),
          ),
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
  const bytes = new Uint8Array(
    await callPluginHost('Response.arrayBuffer', () =>
      response.arrayBuffer(),
    ),
  );
  if (bytes.length === 0) {
    throw new Error('A rendered page could not be read back for verification.');
  }
  return sha256(bytes);
}

function notebookName(path: string): string {
  const filename = path.split('/').pop() || 'Supernote notebook';
  return filename.replace(/\.note$/i, '') || 'Supernote notebook';
}

async function saveCurrentNotebookIfSupported(): Promise<boolean> {
  const response = await callOptionalPluginHost(
    'PluginNoteAPI.saveCurrentNote',
    () => PluginNoteAPI.saveCurrentNote(),
  );
  if (response === undefined) {
    return false;
  }
  const saved = asResponse<boolean>(response);
  requireResult(saved, 'The open NOTE could not be saved.');
  return true;
}

async function pageCountResponse(
  path: string,
): Promise<Object | null | undefined> {
  try {
    return await callPluginHost('PluginFileAPI.getNoteTotalPageNum', () =>
      PluginFileAPI.getNoteTotalPageNum(path),
    );
  } catch (error) {
    if (
      !(
        error instanceof PluginHostCapabilityError &&
        error.capability === 'PluginFileAPI.getNoteTotalPageNum'
      )
    ) {
      throw error;
    }
  }

  return callPluginHost('PluginDocAPI.getCurrentTotalPages', () =>
    PluginDocAPI.getCurrentTotalPages(),
  );
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
