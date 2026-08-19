import type { Metadata } from 'next';

import {
  KnowledgeDocumentArchiveButton,
  KnowledgeDocumentForm,
} from '@/components/dashboard/KnowledgeDocumentForm';
import { requireSession } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/app-error';
import {
  createKnowledgeBaseDocumentService,
  type KnowledgeBaseDocument,
} from '@/server/knowledge-base/documents';

export const metadata: Metadata = {
  title: 'Knowledge base · Ambrogio.ai',
};

const DOCUMENT_LIMIT = 100;
const EXCERPT_LENGTH = 240;

/** Solo owner e admin possono scrivere: il servizio rifiuta gli altri ruoli. */
const EDITOR_ROLES = new Set(['owner', 'admin']);

type LoadResult =
  | {
      readonly ok: true;
      readonly documents: readonly KnowledgeBaseDocument[];
      readonly canEdit: boolean;
    }
  | { readonly ok: false; readonly message: string };

async function loadKnowledgeBase(): Promise<LoadResult> {
  try {
    const session = await requireSession();
    const service = createKnowledgeBaseDocumentService();
    const documents = await service.listDocuments({
      session,
      filters: { limit: DOCUMENT_LIMIT },
    });

    return { ok: true, documents, canEdit: EDITOR_ROLES.has(session.role) };
  } catch (error: unknown) {
    // I messaggi non `expose` (503, errori Supabase) non sono mostrabili:
    // servirebbe solo a esporre dettagli interni senza aiutare chi legge.
    const message =
      error instanceof AppError && error.expose
        ? error.message
        : 'The knowledge base could not be loaded. Reload the page; if it continues, the data service may be unavailable.';

    return { ok: false, message };
  }
}

export default async function KnowledgePage() {
  const result = await loadKnowledgeBase();

  return (
    <>
      <div className="dashboard-header">
        <div className="stack stack-2">
          <span className="eyebrow">Knowledge Base / FAQ</span>
          <h1>Verified shop information</h1>
          <p className="muted" style={{ maxWidth: '60ch' }}>
            Add only facts the shop has verified. If no matching answer exists, the AI hands the
            conversation to a person instead of guessing.
          </p>
        </div>
      </div>

      {result.ok ? (
        <KnowledgeBaseContent documents={result.documents} canEdit={result.canEdit} />
      ) : (
        <div className="card card-padded" role="alert">
          <div className="stack stack-2">
            <p style={{ fontWeight: 600 }}>Knowledge base unavailable</p>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              {result.message}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function KnowledgeBaseContent({
  documents,
  canEdit,
}: Readonly<{ documents: readonly KnowledgeBaseDocument[]; canEdit: boolean }>) {
  const activeCount = documents.filter((doc) => doc.active).length;
  const notIndexedCount = documents.filter((doc) => doc.active && !doc.hasEmbedding).length;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 'var(--space-6)',
        alignItems: 'start',
      }}
    >
      <section className="stack stack-4" aria-labelledby="knowledge-list-heading">
        <div className="row row-between">
          <h2 id="knowledge-list-heading" style={{ fontSize: 'var(--text-lg)' }}>
            Documents
          </h2>
          {documents.length > 0 ? (
            <span className="muted mono" style={{ fontSize: 'var(--text-xs)' }}>
              {activeCount} active of {documents.length}
            </span>
          ) : null}
        </div>

        {notIndexedCount > 0 ? (
          <div className="card card-padded" role="status">
            <p style={{ fontSize: 'var(--text-sm)' }}>
              <strong>{notIndexedCount}</strong>{' '}
              {notIndexedCount === 1 ? 'active document is' : 'active documents are'} not yet
              vector-indexed. Lexical retrieval remains available.
            </p>
          </div>
        ) : null}

        {documents.length === 0 ? (
          <EmptyKnowledgeBase canEdit={canEdit} />
        ) : (
          <ul className="stack stack-3" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {documents.map((doc) => (
              <li key={doc.id}>
                <KnowledgeDocumentCard document={doc} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        )}

        {documents.length >= DOCUMENT_LIMIT ? (
          <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            Showing the {DOCUMENT_LIMIT} most recently updated documents.
          </p>
        ) : null}
      </section>

      <section className="card card-padded stack stack-4" aria-labelledby="knowledge-form-heading">
        <div className="stack stack-2">
          <h2 id="knowledge-form-heading" style={{ fontSize: 'var(--text-lg)' }}>
            Add an FAQ or document
          </h2>
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            Plain text only. The AI may use exactly what you verify and save here.
          </p>
        </div>

        {canEdit ? (
          <KnowledgeDocumentForm />
        ) : (
          <p className="helper">
            Your role can read the knowledge base. Only owners and admins can change it.
          </p>
        )}
      </section>
    </div>
  );
}

function KnowledgeDocumentCard({
  document: doc,
  canEdit,
}: Readonly<{ document: KnowledgeBaseDocument; canEdit: boolean }>) {
  return (
    <article className="card card-padded stack stack-3">
      <div className="row row-between" style={{ gap: 'var(--space-3)' }}>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>{doc.title}</h3>
          {doc.category !== null ? (
            <span className="badge badge-neutral">{doc.category}</span>
          ) : null}
        </div>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          {!doc.active ? (
            <span className="badge badge-neutral">Archived</span>
          ) : doc.hasEmbedding ? (
            <span className="badge badge-success">Indexed</span>
          ) : (
            <span className="badge badge-warm">Not indexed</span>
          )}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap' }}>
        {toExcerpt(doc.content)}
      </p>

      <div className="row row-between" style={{ gap: 'var(--space-3)' }}>
        <span className="muted mono" style={{ fontSize: 'var(--text-xs)' }}>
          Updated {formatDate(doc.updatedAt)}
        </span>
        {canEdit ? (
          <KnowledgeDocumentArchiveButton
            documentId={doc.id}
            title={doc.title}
            active={doc.active}
          />
        ) : null}
      </div>
    </article>
  );
}

function EmptyKnowledgeBase({ canEdit }: Readonly<{ canEdit: boolean }>) {
  return (
    <div className="card">
      <div className="empty-state">
        <p className="empty-state-title">No verified FAQs yet</p>
        <p className="empty-state-text">
          Until verified information is added, the AI will not guess prices, hours, services, or
          shop policies. It will hand those questions to a person.
        </p>
        <ul
          className="stack stack-2"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 'var(--space-4) 0 0',
            textAlign: 'left',
            maxWidth: '46ch',
            fontSize: 'var(--text-sm)',
          }}
        >
          <li>
            <strong>Services and prices</strong> — only facts the shop has approved.
          </li>
          <li>
            <strong>Cancellation policy</strong> — notice periods, fees, and exceptions.
          </li>
          <li>
            <strong>Shop location</strong> — address, parking, and arrival instructions.
          </li>
          <li>
            <strong>FAQs</strong> — recurring customer questions with verified answers.
          </li>
        </ul>
        {canEdit ? (
          <p className="helper" style={{ marginTop: 'var(--space-4)' }}>
            Start with hours, services, pricing rules, and the cancellation policy.
          </p>
        ) : (
          <p className="helper" style={{ marginTop: 'var(--space-4)' }}>
            Ask a shop administrator to add the first verified FAQ.
          </p>
        )}
      </div>
    </div>
  );
}

function toExcerpt(content: string): string {
  const normalized = content.trim();

  if (normalized.length <= EXCERPT_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/New_York',
});

function formatDate(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 'date unavailable';
  }

  return DATE_FORMATTER.format(parsed);
}
