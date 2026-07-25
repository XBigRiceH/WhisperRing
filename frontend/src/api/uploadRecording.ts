import { File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { API_BASE_URL } from '../config';
import type { RecordingResponse } from './types';

/**
 * Upload a raw ring recording (`.bin`, length-prefixed Speex) to the backend's
 * `POST /recordings` multipart endpoint.
 *
 * React Native's `Blob` cannot be built from an in-memory `Uint8Array`, so the
 * bytes are first written to a throwaway file in the cache directory and that
 * `File` (which implements `Blob`) is streamed as the multipart part. The temp
 * file is always removed afterwards. `expo/fetch` is used instead of global
 * fetch because it can stream a `File` body without loading it into a JS Blob.
 */
export async function uploadRecordingBin(
  bytes: Uint8Array,
  filename: string,
  token: string | null,
): Promise<RecordingResponse> {
  const file = new File(Paths.cache, filename);
  try {
    // Overwrite any stale temp file, then persist the raw bytes to disk.
    file.create({ overwrite: true });
    file.write(bytes);

    const form = new FormData();
    // Backend field name is "file"; the File carries its own name/type.
    form.append('file', file as unknown as Blob);

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(API_BASE_URL + '/recordings', {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${text}`);
    }
    return (await res.json()) as RecordingResponse;
  } finally {
    if (file.exists) file.delete();
  }
}
