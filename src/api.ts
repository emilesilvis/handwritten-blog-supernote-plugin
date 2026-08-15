export const API_BASE_URL = 'https://handwritten.blog/api/supernote/v1';

export type ImportStatus = 'accepted' | 'unchanged' | 'update_available';

export type PairingResponse = {
  bearer: string;
  upload_url: string;
};

export type ImportResponse = {
  status: ImportStatus;
  source_id: string;
  revision_digest: string;
  post_id: number | null;
};

export type RenderedPage = {
  position: number;
  filename: string;
  path: string;
  sha256: string;
};

type ErrorPayload = {
  code?: string;
  message?: string;
};

export class APIError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function pair(code: string): Promise<PairingResponse> {
  const response = await fetch(`${API_BASE_URL}/pairings`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({code}),
  });
  return parseResponse<PairingResponse>(response);
}

export async function uploadNotebook(
  uploadUrl: string,
  bearer: string,
  manifest: object,
  pages: RenderedPage[],
): Promise<ImportResponse> {
  const body = new FormData();
  body.append('manifest', JSON.stringify(manifest));
  pages.forEach(page => {
    body.append('pages[]', {
      uri: fileUri(page.path),
      type: 'image/png',
      name: page.filename,
    } as unknown as Blob);
  });

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {Authorization: `Bearer ${bearer}`},
    body,
  });
  return parseResponse<ImportResponse>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: (T & ErrorPayload) | ErrorPayload = {};
  try {
    payload = await response.json();
  } catch {
    // The status-specific message below remains actionable without a body.
  }

  if (response.ok) {
    return payload as T;
  }

  const fallback = errorMessage(response.status);
  throw new APIError(
    payload.message || fallback,
    response.status,
    payload.code,
  );
}

function errorMessage(status: number): string {
  switch (status) {
    case 401:
      return 'This connection expired or was revoked. Generate a new pairing code on handwritten.blog.';
    case 413:
      return 'This notebook is too large to send. Try a smaller notebook.';
    case 429:
      return 'Too many sends are in progress. Wait a minute and try again.';
    default:
      return status >= 500
        ? 'handwritten.blog could not accept the notebook. Your NOTE is safe; try again later.'
        : 'The notebook was rejected. Check the page set and try again.';
  }
}

export function fileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}
