import {sha256} from 'js-sha256';
import {FileUtils} from 'sn-plugin-lib';
import {callPluginHost} from './pluginHost';

export type NotebookIdentity = {
  sourceId: string;
  displayName: string;
};

const identityPrefix = 'handwritten-blog-identity--';
const pathPrefix = 'handwritten-blog-path--';

export async function identityForPath(
  pluginDirectory: string,
  path: string,
): Promise<NotebookIdentity | undefined> {
  const identities = await knownIdentities(pluginDirectory);
  const entries = await listPluginFiles(pluginDirectory);
  const marker = `${pathPrefix}${sha256(path)}--`;
  const pathEntry = (entries || [])
    .map(basename)
    .find(name => name.startsWith(marker));
  const sourceId = pathEntry?.slice(marker.length);
  return identities.find(identity => identity.sourceId === sourceId);
}

export async function knownIdentities(
  pluginDirectory: string,
): Promise<NotebookIdentity[]> {
  const entries = await listPluginFiles(pluginDirectory);
  return (entries || []).flatMap(entry => {
    const name = basename(entry);
    if (!name.startsWith(identityPrefix)) {
      return [];
    }
    const [sourceId, encodedName] = name
      .slice(identityPrefix.length)
      .split('--', 2);
    if (!sourceId || !encodedName) {
      return [];
    }
    try {
      return [{sourceId, displayName: fromHex(encodedName)}];
    } catch {
      return [];
    }
  });
}

export async function createIdentity(
  pluginDirectory: string,
  path: string,
  displayName: string,
): Promise<NotebookIdentity> {
  const identity = {sourceId: uuid(), displayName};
  await persistIdentity(pluginDirectory, identity, path);
  return identity;
}

export async function rebindIdentity(
  pluginDirectory: string,
  identity: NotebookIdentity,
  path: string,
  displayName: string,
): Promise<NotebookIdentity> {
  const rebound = {...identity, displayName};
  await persistIdentity(pluginDirectory, rebound, path);
  return rebound;
}

async function persistIdentity(
  pluginDirectory: string,
  identity: NotebookIdentity,
  path: string,
): Promise<void> {
  const safeName = Array.from(identity.displayName).slice(0, 80).join('');
  const identityDirectory = `${pluginDirectory}/${identityPrefix}${
    identity.sourceId
  }--${toHex(safeName)}`;
  const pathDirectory = `${pluginDirectory}/${pathPrefix}${sha256(path)}--${
    identity.sourceId
  }`;
  const entries = await listPluginFiles(pluginDirectory);
  const previousIdentityDirectories = (entries || []).filter(entry =>
    basename(entry).startsWith(`${identityPrefix}${identity.sourceId}--`),
  );
  await Promise.all(
    previousIdentityDirectories
      .filter(entry => entry !== identityDirectory)
      .map(entry => FileUtils.deleteDir(entry).catch(() => false)),
  );

  const identitySaved = await ensureDirectory(identityDirectory);
  const pathSaved = await ensureDirectory(pathDirectory);
  if (!identitySaved || !pathSaved) {
    throw new Error(
      'This firmware did not let the plugin save notebook identity safely.',
    );
  }
}

async function ensureDirectory(path: string): Promise<boolean> {
  const exists = await callPluginHost('FileUtils.exists', () =>
    FileUtils.exists(path),
  );
  return (
    exists ||
    callPluginHost('FileUtils.makeDir', () => FileUtils.makeDir(path))
  );
}

async function listPluginFiles(
  pluginDirectory: string,
): Promise<string[] | null | undefined> {
  const entries: unknown = await callPluginHost(
    'FileUtils.listFiles',
    () => FileUtils.listFiles(pluginDirectory),
  );
  if (entries === null || entries === undefined) {
    return entries;
  }
  if (!Array.isArray(entries)) {
    throw new Error(
      'The Supernote file listing returned an unsupported response.',
    );
  }

  // sn-plugin-lib 0.1.43 declares string[], but its Android RTNFileModule
  // resolves {path, type} maps. Accept both shapes at this native boundary.
  return entries.map(entry => {
    if (typeof entry === 'string') {
      return entry;
    }
    if (
      entry &&
      typeof entry === 'object' &&
      'path' in entry &&
      typeof entry.path === 'string'
    ) {
      return entry.path;
    }
    throw new Error('The Supernote file listing returned an unsupported entry.');
  });
}

function basename(path: string): string {
  return path.split('/').pop() || '';
}

function toHex(value: string): string {
  const encoded = encodeURIComponent(value).replace(
    /%([0-9A-F]{2})/g,
    (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return Array.from(encoded)
    .map(character => character.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(value: string): string {
  const encoded =
    value
      .match(/.{2}/g)
      ?.map(hex => `%${hex}`)
      .join('') || '';
  return decodeURIComponent(encoded);
}

function uuid(): string {
  const hex = Array.from({length: 32}, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)];
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(
    12,
    16,
  )}-${value.slice(16, 20)}-${value.slice(20)}`;
}
