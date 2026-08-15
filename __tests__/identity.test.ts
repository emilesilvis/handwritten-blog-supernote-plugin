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
