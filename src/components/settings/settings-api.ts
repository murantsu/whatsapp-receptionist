import { isApiError } from '@/lib/api-client';

/**
 * Adattatore fra `apiFetch` e le schermate di configurazione.
 *
 * `apiFetch` lancia `ApiError` con messaggi in inglese pensati per chi sviluppa
 * («Business hours cannot overlap»): qui diventano un esito esplicito con un
 * testo mostrabile. `useApiForm` fa la stessa traduzione ma solo per i form in
 * POST, mentre queste route usano PUT, PATCH e DELETE.
 */
export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

/**
 * Messaggi utente per i codici d'errore dell'API.
 *
 * I testi coincidono con quelli di `useApiForm` (lì non sono esportati): la
 * stessa condizione deve leggersi allo stesso modo in tutta l'app.
 */
const MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  rate_limited: 'Too many attempts. Please try again in a few minutes.',
  bad_request: 'Some information is invalid. Check the fields and try again.',
  unauthorized: 'Your session is invalid. Please sign in again.',
  forbidden: 'You do not have permission to complete this operation.',
  not_found: 'The item was not found. It may have been changed in another session.',
  conflict: 'An item with this information already exists.',
  network_error: 'The request failed. Check your connection and try again.',
  invalid_response: 'The server returned an unexpected response. Reload the page.',
  upstream_error: 'The service is temporarily unavailable. Please try again shortly.',
};

/** Esegue una chiamata di `api-client` restituendo l'esito invece di lanciarlo. */
export async function runRequest<T>(
  action: () => Promise<T>,
  fallbackMessage: string,
): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await action() };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, fallbackMessage) };
  }
}

export function toUserMessage(error: unknown, fallbackMessage: string): string {
  if (!isApiError(error)) {
    return fallbackMessage;
  }

  return MESSAGE_BY_CODE[error.code] ?? fallbackMessage;
}
