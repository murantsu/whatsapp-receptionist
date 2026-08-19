'use client';

import { useCallback, useState, type FormEvent } from 'react';

export type ApiFormStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface ApiFormState {
  readonly status: ApiFormStatus;
  readonly message: string | null;
}

interface ApiErrorEnvelope {
  ok: false;
  error: { code: string; message: string };
}

interface ApiSuccessEnvelope {
  ok: true;
  data: unknown;
}

export interface UseApiFormOptions {
  /** Route API che riceve il POST JSON. */
  readonly endpoint: string;
  /** Messaggio mostrato al successo, quando non si naviga altrove. */
  readonly successMessage: string;
  /** Se valorizzato, al successo naviga qui invece di mostrare il messaggio. */
  readonly redirectTo?: string;
  /**
   * Trasforma i campi del form nel body JSON.
   * Default: ogni campo diventa una stringa omonima.
   */
  readonly buildBody?: (formData: FormData) => unknown;
}

/**
 * Messaggi utente per i codici d'errore dell'API.
 *
 * `jsonHandler` restituisce messaggi pensati per gli sviluppatori e, per gli
 * errori non esposti, il generico "Internal server error": nessuno dei due è
 * adatto a un utente finale.
 */
const MESSAGE_BY_CODE: Record<string, string> = {
  rate_limited: 'Too many attempts. Please try again in a few minutes.',
  bad_request: 'Some information is invalid. Check the fields and try again.',
  validation_error: 'Some information is invalid. Check the fields and try again.',
  unauthorized: 'Your session is invalid. Please sign in again.',
  forbidden: 'You do not have permission to complete this operation.',
  not_found: 'The requested item was not found.',
  conflict: 'An account with this information already exists.',
};

const FALLBACK_MESSAGE =
  'An unexpected error occurred. Try again, and contact pilot support if it continues.';

function defaultBuildBody(formData: FormData): Record<string, string> {
  const body: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      body[key] = value;
    }
  }
  return body;
}

function messageFor(payload: unknown, httpStatus: number): string {
  const envelope = payload as Partial<ApiErrorEnvelope> | null;
  const code = envelope?.error?.code;

  if (code && MESSAGE_BY_CODE[code]) {
    return MESSAGE_BY_CODE[code];
  }

  // Un messaggio esposto dall'API è già stato giudicato mostrabile a monte:
  // `jsonHandler` sostituisce con un generico tutto ciò che non è `expose`.
  const exposed = envelope?.error?.message;
  if (exposed && exposed !== 'Internal server error') {
    return exposed;
  }

  if (httpStatus >= 500) {
    return 'The service is temporarily unavailable. Please try again shortly.';
  }

  return FALLBACK_MESSAGE;
}

/**
 * Invio di un form verso un'API JSON, con stato osservabile.
 *
 * Le route API del progetto accettano esclusivamente JSON (`readJsonBody` fa
 * `JSON.parse` del raw body): un `<form method="POST">` nativo invia
 * `application/x-www-form-urlencoded` e fallisce sempre. Questo hook mantiene
 * il contratto JSON dell'API e restituisce un errore mostrabile all'utente,
 * invece di far navigare il browser sulla risposta grezza dell'API.
 */
export function useApiForm(options: UseApiFormOptions): {
  state: ApiFormState;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
} {
  const [state, setState] = useState<ApiFormState>({ status: 'idle', message: null });

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();

      const form = event.currentTarget;
      const formData = new FormData(form);
      const body = (options.buildBody ?? defaultBuildBody)(formData);

      setState({ status: 'submitting', message: null });

      let response: Response;
      try {
        response = await fetch(options.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        // Fallimento di rete: nessuna risposta, quindi nessun envelope da leggere.
        setState({
          status: 'error',
          message: 'The request failed. Check your connection and try again.',
        });
        return;
      }

      let payload: unknown = null;
      try {
        payload = (await response.json()) as ApiSuccessEnvelope | ApiErrorEnvelope;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        setState({ status: 'error', message: messageFor(payload, response.status) });
        return;
      }

      form.reset();

      if (options.redirectTo !== undefined) {
        window.location.assign(options.redirectTo);
        return;
      }

      setState({ status: 'success', message: options.successMessage });
    },
    [options],
  );

  return { state, onSubmit };
}
