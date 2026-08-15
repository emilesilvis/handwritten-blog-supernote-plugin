import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {APIError, pair, uploadNotebook} from './src/api';
import {
  createIdentity,
  identityForPath,
  knownIdentities as loadKnownIdentities,
  NotebookIdentity,
  rebindIdentity,
} from './src/identity';
import {
  currentNotebook,
  cleanupRenderedPages,
  NotebookContext,
  renderNotebook,
} from './src/notebook';

type Stage =
  | 'pairing'
  | 'ready'
  | 'checking'
  | 'choose_identity'
  | 'rendering'
  | 'uploading'
  | 'done'
  | 'error';

let sessionBearer: string | null = null;
let sessionUploadUrl: string | null = null;

function App(): React.JSX.Element {
  const [stage, setStage] = useState<Stage>(
    sessionBearer ? 'ready' : 'pairing',
  );
  const [pairingCode, setPairingCode] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState('');
  const [pendingNotebook, setPendingNotebook] =
    useState<NotebookContext | null>(null);
  const [identityChoices, setIdentityChoices] = useState<NotebookIdentity[]>(
    [],
  );

  async function handlePair(): Promise<void> {
    setStage('checking');
    setMessage('Pairing securely…');
    try {
      const result = await pair(pairingCode);
      sessionBearer = result.bearer;
      sessionUploadUrl = result.upload_url;
      setPairingCode('');
      setMessage('Connected for this plugin session.');
      setStage('ready');
    } catch (error) {
      showError(error);
    }
  }

  async function handleSend(): Promise<void> {
    setStage('checking');
    setMessage('Saving and checking the open NOTE…');
    try {
      const notebook = await currentNotebook();
      const identity = await identityForPath(
        notebook.pluginDirectory,
        notebook.path,
      );
      if (identity) {
        await send(notebook, identity);
      } else {
        const identities = await loadKnownIdentities(notebook.pluginDirectory);
        if (identities.length > 0) {
          setIdentityChoices(identities);
          setPendingNotebook(notebook);
          setStage('choose_identity');
          return;
        }
        await send(
          notebook,
          await createIdentity(
            notebook.pluginDirectory,
            notebook.path,
            notebook.displayName,
          ),
        );
      }
    } catch (error) {
      showError(error);
    }
  }

  async function send(
    notebook: NotebookContext,
    identity: NotebookIdentity,
  ): Promise<void> {
    if (!sessionBearer || !sessionUploadUrl) {
      setStage('pairing');
      setMessage('Generate a new pairing code on handwritten.blog.');
      return;
    }

    try {
      setStage('rendering');
      const rendered = await renderNotebook(notebook, (page, total) => {
        setProgress(`Rendering page ${page} of ${total}…`);
      });
      setStage('uploading');
      setProgress(`Uploading ${rendered.pages.length} rendered pages…`);

      let result;
      try {
        result = await uploadNotebook(
          sessionUploadUrl,
          sessionBearer,
          {
            source_id: identity.sourceId,
            display_name: notebook.displayName,
            revision_digest: rendered.revisionDigest,
            pages: rendered.pages.map(page => ({
              position: page.position,
              filename: page.filename,
              sha256: page.sha256,
            })),
          },
          rendered.pages,
        );
      } finally {
        await cleanupRenderedPages(rendered.pages);
      }

      setMessage(successMessage(result.status));
      setProgress('');
      setStage('done');
    } catch (error) {
      showError(error);
    }
  }

  async function selectExisting(identity: NotebookIdentity): Promise<void> {
    if (!pendingNotebook) {
      return;
    }
    const notebook = pendingNotebook;
    setPendingNotebook(null);
    setStage('checking');
    try {
      await send(
        notebook,
        await rebindIdentity(
          notebook.pluginDirectory,
          identity,
          notebook.path,
          notebook.displayName,
        ),
      );
    } catch (error) {
      showError(error);
    }
  }

  async function selectNew(): Promise<void> {
    if (!pendingNotebook) {
      return;
    }
    const notebook = pendingNotebook;
    setPendingNotebook(null);
    setStage('checking');
    try {
      await send(
        notebook,
        await createIdentity(
          notebook.pluginDirectory,
          notebook.path,
          notebook.displayName,
        ),
      );
    } catch (error) {
      showError(error);
    }
  }

  function showError(error: unknown): void {
    if (error instanceof APIError && error.status === 401) {
      sessionBearer = null;
      sessionUploadUrl = null;
    }
    setProgress('');
    setMessage(
      error instanceof Error ? error.message : 'The send did not finish.',
    );
    setStage('error');
  }

  const busy = ['checking', 'rendering', 'uploading'].includes(stage);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f4e8" />
      <Pressable
        accessibilityLabel="Close plugin"
        style={styles.closeButton}
        onPress={() => PluginManager.closePluginView()}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>HANDWRITTEN.BLOG</Text>
        <Text style={styles.title}>Send this NOTE</Text>
        <Text style={styles.explanation}>
          The plugin saves the open note, renders its ordered pages on this
          tablet, and sends only those PNGs. Your .note file and Supernote
          account stay here.
        </Text>

        {stage === 'pairing' && (
          <View style={styles.panel}>
            <Text style={styles.label}>One-time pairing code</Text>
            <TextInput
              accessibilityLabel="Pairing code"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={9}
              onChangeText={value => setPairingCode(value.toUpperCase())}
              placeholder="ABCD-EFGH"
              style={styles.codeInput}
              value={pairingCode}
            />
            <PrimaryButton
              disabled={pairingCode.replace(/[^A-Z0-9]/g, '').length !== 8}
              label="Pair plugin"
              onPress={handlePair}
            />
          </View>
        )}

        {stage === 'choose_identity' && pendingNotebook && (
          <View style={styles.panel}>
            <Text style={styles.heading}>Was this NOTE renamed?</Text>
            <Text style={styles.explanation}>
              Choose its previous name to keep updating the same draft, or mark
              it as a new notebook.
            </Text>
            {identityChoices.map(identity => (
              <SecondaryButton
                key={identity.sourceId}
                label={`Previously “${identity.displayName}”`}
                onPress={() => {
                  selectExisting(identity).catch(showError);
                }}
              />
            ))}
            <SecondaryButton
              label="This is a new notebook"
              onPress={() => {
                selectNew().catch(showError);
              }}
            />
          </View>
        )}

        {busy && (
          <View style={styles.statusPanel} accessibilityLiveRegion="polite">
            <ActivityIndicator color="#1f4b45" size="large" />
            <Text style={styles.statusText}>{progress || message}</Text>
          </View>
        )}

        {stage === 'ready' && (
          <View style={styles.panel}>
            <Text style={styles.successText}>{message}</Text>
            <PrimaryButton label="Send to private draft" onPress={handleSend} />
          </View>
        )}

        {stage === 'done' && (
          <View style={styles.panel} accessibilityLiveRegion="polite">
            <Text style={styles.successText}>{message}</Text>
            <PrimaryButton label="Send again" onPress={handleSend} />
          </View>
        )}

        {stage === 'error' && (
          <View
            style={[styles.panel, styles.errorPanel]}
            accessibilityLiveRegion="assertive">
            <Text style={styles.errorText}>{message}</Text>
            <PrimaryButton
              label={sessionBearer ? 'Try again' : 'Enter a new code'}
              onPress={() => setStage(sessionBearer ? 'ready' : 'pairing')}
            />
          </View>
        )}

        <Text style={styles.footnote}>
          Private device spike · Nothing is published automatically
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabledButton]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function successMessage(status: string): string {
  switch (status) {
    case 'unchanged':
      return 'Already up to date. No duplicate draft or pages were created.';
    case 'update_available':
      return 'Update received. The published post stayed unchanged for review.';
    default:
      return 'Upload accepted. The private draft is being prepared.';
  }
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#f8f4e8'},
  content: {padding: 32, paddingTop: 72, minHeight: '100%'},
  closeButton: {
    position: 'absolute',
    right: 20,
    top: 14,
    padding: 12,
    zIndex: 2,
  },
  closeText: {fontSize: 32, lineHeight: 32, color: '#1d2523'},
  eyebrow: {
    fontSize: 14,
    letterSpacing: 2,
    color: '#56706a',
    fontWeight: '700',
  },
  title: {
    fontSize: 38,
    lineHeight: 44,
    color: '#162c28',
    fontWeight: '700',
    marginTop: 8,
  },
  heading: {fontSize: 22, color: '#162c28', fontWeight: '700', marginBottom: 8},
  explanation: {fontSize: 18, lineHeight: 27, color: '#3f514d', marginTop: 14},
  panel: {
    marginTop: 28,
    padding: 24,
    borderWidth: 2,
    borderColor: '#9cac9f',
    borderRadius: 12,
    backgroundColor: '#fffdf5',
  },
  statusPanel: {marginTop: 28, padding: 32, alignItems: 'center'},
  statusText: {
    fontSize: 18,
    lineHeight: 26,
    color: '#263d38',
    marginTop: 18,
    textAlign: 'center',
  },
  label: {fontSize: 16, color: '#263d38', fontWeight: '600', marginBottom: 8},
  codeInput: {
    fontSize: 30,
    letterSpacing: 4,
    textAlign: 'center',
    color: '#162c28',
    borderWidth: 2,
    borderColor: '#667d77',
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  primaryButton: {
    marginTop: 18,
    paddingVertical: 17,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#1f4b45',
    alignItems: 'center',
  },
  disabledButton: {opacity: 0.35},
  primaryButtonText: {fontSize: 18, color: '#ffffff', fontWeight: '700'},
  secondaryButton: {
    marginTop: 12,
    padding: 15,
    borderWidth: 2,
    borderColor: '#52736b',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: {fontSize: 17, color: '#1f4b45', fontWeight: '600'},
  successText: {
    fontSize: 18,
    lineHeight: 27,
    color: '#1f4b45',
    fontWeight: '600',
  },
  errorPanel: {borderColor: '#8d332d', backgroundColor: '#fff7f3'},
  errorText: {
    fontSize: 18,
    lineHeight: 27,
    color: '#7c2924',
    fontWeight: '600',
  },
  footnote: {
    fontSize: 14,
    lineHeight: 21,
    color: '#687772',
    marginTop: 28,
    textAlign: 'center',
  },
});

export default App;
