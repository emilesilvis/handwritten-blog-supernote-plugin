import {FileUtils} from 'sn-plugin-lib';
import {
  createIdentity,
  identityForPath,
  knownIdentities,
  rebindIdentity,
} from '../src/identity';

jest.mock('sn-plugin-lib', () => ({
  FileUtils: {
    deleteDir: jest.fn(),
    exists: jest.fn(),
    listFiles: jest.fn(),
    makeDir: jest.fn(),
  },
}));

let directories: string[];

beforeEach(() => {
  directories = [];
  jest.resetAllMocks();
  (FileUtils.listFiles as jest.Mock).mockImplementation(async () => [
    ...directories,
  ]);
  (FileUtils.exists as jest.Mock).mockImplementation(async path =>
    directories.includes(path),
  );
  (FileUtils.makeDir as jest.Mock).mockImplementation(async path => {
    directories.push(path);
    return true;
  });
  (FileUtils.deleteDir as jest.Mock).mockImplementation(async path => {
    directories = directories.filter(entry => entry !== path);
    return true;
  });
});

test('persists stable source identity in plugin-private directory markers', async () => {
  const identity = await createIdentity(
    '/plugin',
    '/notes/Morning.note',
    'Morning notes',
  );

  expect(identity.sourceId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(await identityForPath('/plugin', '/notes/Morning.note')).toEqual(
    identity,
  );
  expect(await knownIdentities('/plugin')).toEqual([identity]);
});

test('an explicit rename rebind keeps the same source id', async () => {
  const identity = await createIdentity('/plugin', '/notes/Old.note', 'Old');
  const rebound = await rebindIdentity(
    '/plugin',
    identity,
    '/notes/New.note',
    'New',
  );

  expect(rebound.sourceId).toBe(identity.sourceId);
  expect(await identityForPath('/plugin', '/notes/New.note')).toEqual(rebound);
  expect(await knownIdentities('/plugin')).toEqual([rebound]);
});

test('names an unavailable plugin-directory listing bridge', async () => {
  (FileUtils.listFiles as jest.Mock).mockRejectedValue(
    new TypeError('undefined is not a function'),
  );

  await expect(knownIdentities('/plugin')).rejects.toThrow(
    /FileUtils\.listFiles.*device model.*firmware/i,
  );
});

test('reads the object entries returned by the native Android file module', async () => {
  (FileUtils.listFiles as jest.Mock).mockResolvedValue([
    {
      path: '/plugin/handwritten-blog-identity--source-1--4d6f726e696e67',
      type: 0,
    },
  ]);

  await expect(knownIdentities('/plugin')).resolves.toEqual([
    {sourceId: 'source-1', displayName: 'Morning'},
  ]);
});

test.each([
  {filePath: '/plugin/handwritten-blog-identity--source-1--4d6f726e696e67'},
  {fullPath: '/plugin/handwritten-blog-identity--source-1--4d6f726e696e67'},
  {absolutePath: '/plugin/handwritten-blog-identity--source-1--4d6f726e696e67'},
  {name: 'handwritten-blog-identity--source-1--4d6f726e696e67'},
  {fileName: 'handwritten-blog-identity--source-1--4d6f726e696e67'},
  {displayName: 'handwritten-blog-identity--source-1--4d6f726e696e67'},
])('reads compatibility entry shape %j', async entry => {
  (FileUtils.listFiles as jest.Mock).mockResolvedValue([entry]);

  await expect(knownIdentities('/plugin')).resolves.toEqual([
    {sourceId: 'source-1', displayName: 'Morning'},
  ]);
});

test.each(['files', 'list', 'items'])('reads a list wrapped in %s', async key => {
  (FileUtils.listFiles as jest.Mock).mockResolvedValue({
    [key]: [
      {
        path: '/plugin/handwritten-blog-identity--source-1--4d6f726e696e67',
      },
    ],
  });

  await expect(knownIdentities('/plugin')).resolves.toEqual([
    {sourceId: 'source-1', displayName: 'Morning'},
  ]);
});

test('rejects an unknown wrapped response instead of hiding it as an empty list', async () => {
  (FileUtils.listFiles as jest.Mock).mockResolvedValue({entries: []});

  await expect(knownIdentities('/plugin')).rejects.toThrow(
    /unsupported response/i,
  );
});
