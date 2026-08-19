'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FormFeedback } from '@/components/forms/FormFeedback';
import { useApiForm } from '@/components/forms/useApiForm';

const KNOWLEDGE_BASE_ENDPOINT = '/api/knowledge-base';

/**
 * Form di inserimento di un documento in knowledge base.
 *
 * L'elenco è renderizzato da un Server Component: dopo un inserimento riuscito
 * serve `router.refresh()`, altrimenti la pagina resta ferma sui dati del
 * render precedente e il documento appena creato sembra non essere stato
 * salvato. `useApiForm` non espone una callback di successo, quindi la
 * transizione di stato viene osservata qui.
 */
export function KnowledgeDocumentForm() {
  const router = useRouter();
  const { state, onSubmit } = useApiForm({
    endpoint: KNOWLEDGE_BASE_ENDPOINT,
    locale: 'en-US',
    successMessage:
      'Saved. The AI can use this verified information for matching customer questions.',
    buildBody: (formData) => {
      const category = String(formData.get('category') ?? '').trim();

      return {
        title: String(formData.get('title') ?? ''),
        content: String(formData.get('content') ?? ''),
        category: category.length > 0 ? category : null,
      };
    },
  });

  const isSubmitting = state.status === 'submitting';

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
    }
  }, [state.status, router]);

  return (
    <form onSubmit={onSubmit} className="stack stack-4" noValidate>
      <FormFeedback state={state} id="knowledge-document-form-feedback" />

      <div className="field">
        <label htmlFor="knowledge-title" className="label">
          Title
        </label>
        <input
          id="knowledge-title"
          name="title"
          type="text"
          required
          minLength={1}
          maxLength={160}
          placeholder="Cancellation policy"
          className="input"
          disabled={isSubmitting}
        />
      </div>

      <div className="field">
        <label htmlFor="knowledge-category" className="label">
          Category <span className="muted">(optional)</span>
        </label>
        <input
          id="knowledge-category"
          name="category"
          type="text"
          maxLength={80}
          placeholder="FAQ, Hours, Pricing, Services…"
          className="input"
          disabled={isSubmitting}
        />
        <p className="helper">Use a clear category so the shop team can find it later.</p>
      </div>

      <div className="field">
        <label htmlFor="knowledge-content" className="label">
          Verified answer
        </label>
        <textarea
          id="knowledge-content"
          name="content"
          required
          minLength={1}
          maxLength={30000}
          rows={8}
          placeholder={
            'Write the exact facts the AI may share.\n\nExample: Oil-change appointments take about 45 minutes. Final pricing depends on the vehicle and oil requirements; a team member confirms the price.'
          }
          className="textarea"
          disabled={isSubmitting}
        />
        <p className="helper">
          Maximum 30,000 characters. One topic per document works best for safe retrieval.
        </p>
      </div>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Add document'}
        </button>
      </div>
    </form>
  );
}

type ActionStatus = 'idle' | 'confirming' | 'pending' | 'error';

/**
 * Attivazione / disattivazione di un documento.
 *
 * L'API non cancella mai la riga: `DELETE /api/knowledge-base/[id]` imposta
 * `active = false`, e `PATCH` con `{ active: true }` la rimette in circolo. Il
 * copy dice quindi "archivia", non "elimina", perché è ciò che accade davvero.
 */
export function KnowledgeDocumentArchiveButton({
  documentId,
  title,
  active,
}: Readonly<{ documentId: string; title: string; active: boolean }>) {
  const router = useRouter();
  const [status, setStatus] = useState<ActionStatus>('idle');

  async function submitChange(): Promise<void> {
    setStatus('pending');

    try {
      const response = active
        ? await fetch(`${KNOWLEDGE_BASE_ENDPOINT}/${documentId}`, { method: 'DELETE' })
        : await fetch(`${KNOWLEDGE_BASE_ENDPOINT}/${documentId}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ active: true }),
          });

      if (!response.ok) {
        setStatus('error');
        return;
      }
    } catch {
      setStatus('error');
      return;
    }

    setStatus('idle');
    router.refresh();
  }

  if (!active) {
    return (
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        {status === 'error' ? (
          <span role="alert" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
            The operation failed. Try again.
          </span>
        ) : null}
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={status === 'pending'}
          onClick={() => void submitChange()}
        >
          {status === 'pending' ? 'Restoring…' : 'Restore'}
          <span className="sr-only"> document {title}</span>
        </button>
      </div>
    );
  }

  if (status === 'confirming') {
    return (
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
          The AI will stop using this document. Continue?
        </span>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => void submitChange()}
        >
          Archive
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStatus('idle')}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="row" style={{ gap: 'var(--space-2)' }}>
      {status === 'error' ? (
        <span role="alert" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
          Archiving failed. Try again.
        </span>
      ) : null}
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        disabled={status === 'pending'}
        onClick={() => setStatus('confirming')}
      >
        {status === 'pending' ? 'Archiving…' : 'Archive'}
        <span className="sr-only"> document {title}</span>
      </button>
    </div>
  );
}
