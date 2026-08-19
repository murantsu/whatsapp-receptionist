// Test per ReplyOrchestrator: il flow happy path con classifier rule-based,
// fallback su domain reply LLM, gestione errori (context provider e generator)
// e disclosure AI opzionale. Tutto via DI con fake — nessuna chiamata di rete.

import { describe, expect, it, vi } from 'vitest';

import { ReplyOrchestrator, type ReplyOrchestratorInput } from '@/server/ai/reply-orchestrator';
import {
  RuleBasedIntentClassifier,
  type IntentClassification,
  type IntentClassifier,
} from '@/server/ai/intent-router';
import type { DomainReplyGenerator } from '@/server/ai/domain-reply';
import type { AiContextProvider, AiRuntimeContext } from '@/server/ai/context';

// Helper per istanziare un fake AiContextProvider con superficie minima
// (la classe ha campi privati come repository/embeddingClient che non ci servono).
function fakeContextProvider(load: AiContextProvider['load']): AiContextProvider {
  // eslint-disable-next-line no-restricted-syntax -- Test fixture, runtime validation not required
  return { load } as unknown as AiContextProvider;
}

const baseInput: ReplyOrchestratorInput = {
  text: 'Vorrei prenotare domani',
  assistantName: 'Ambrogio',
  aiDisclosureEnabled: true,
  locale: 'it-IT',
};

function fakeClassifier(intent: IntentClassification['intent']): IntentClassifier {
  return {
    classify: vi.fn(async () => ({
      intent,
      confidence: 0.9,
      matchedSignals: ['signal'],
    })),
  };
}

describe('ReplyOrchestrator.createReply (rule-based fallback)', () => {
  it('happy path: returns booking reply with AI disclosure prefix', async () => {
    // Arrange
    const classifier = fakeClassifier('booking_request');
    const orchestrator = new ReplyOrchestrator(classifier);

    // Act
    const plan = await orchestrator.createReply(baseInput);

    // Assert: classification e shouldReply attivi, disclosure presente
    expect(plan.shouldReply).toBe(true);
    expect(plan.classification.intent).toBe('booking_request');
    expect(plan.replyText).toContain('sono Ambrogio');
    expect(plan.replyText).toContain('prenotare');
    expect(plan.metadata).toMatchObject({
      aiEngine: { provider: 'rule_based' },
      aiContext: null,
    });
  });

  it('omits disclosure prefix when aiDisclosureEnabled=false', async () => {
    // Arrange
    const classifier = fakeClassifier('pricing_question');
    const orchestrator = new ReplyOrchestrator(classifier);

    // Act
    const plan = await orchestrator.createReply({ ...baseInput, aiDisclosureEnabled: false });

    // Assert: nessun prefix "Ciao, sono ..."
    expect(plan.replyText).not.toContain('sono Ambrogio');
    expect(plan.replyText).toBeTruthy();
    expect(plan.shouldReply).toBe(true);
  });

  it('passes locale through to the classifier when provided', async () => {
    // Arrange
    const classifier = fakeClassifier('other');
    const orchestrator = new ReplyOrchestrator(classifier);

    // Act
    await orchestrator.createReply({ ...baseInput, locale: 'en-US' });

    // Assert
    expect(classifier.classify).toHaveBeenCalledWith(
      expect.objectContaining({ text: baseInput.text, locale: 'en-US' }),
    );
  });

  it('does not pass locale when undefined (avoids exactOptionalPropertyTypes mismatch)', async () => {
    // Arrange
    const classifier = fakeClassifier('other');
    const orchestrator = new ReplyOrchestrator(classifier);
    const inputNoLocale: ReplyOrchestratorInput = {
      text: 'ciao',
      assistantName: 'Ambrogio',
      aiDisclosureEnabled: false,
    };

    // Act
    await orchestrator.createReply(inputNoLocale);

    // Assert: l'oggetto passato non deve contenere la chiave `locale`.
    expect(classifier.classify).toHaveBeenCalledTimes(1);
    const call = (classifier.classify as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call).toEqual({ text: 'ciao' });
  });
});

describe('ReplyOrchestrator en-US pilot safety', () => {
  it('routes an explicit human request to handoff', async () => {
    const plan = await new ReplyOrchestrator(new RuleBasedIntentClassifier()).createReply({
      ...baseInput,
      text: 'I need to speak with a person',
      locale: 'en-US',
    });

    expect(plan.classification.intent).toBe('human_handoff');
    expect(plan.replyText).toContain('human reply');
  });

  it('does not invent an answer when no verified FAQ exists', async () => {
    const plan = await new ReplyOrchestrator(fakeClassifier('pricing_question')).createReply({
      ...baseInput,
      text: 'How much is a transmission replacement?',
      locale: 'en-US',
    });

    expect(plan.classification.intent).toBe('human_handoff');
    expect(plan.classification.matchedSignals).toContain('unverified_information');
    expect(plan.replyText).toContain('do not have verified shop information');
  });

  it('answers from a verified FAQ snippet when the LLM is unavailable', async () => {
    const context: AiRuntimeContext = {
      conversationMessages: [],
      activePrompt: null,
      knowledgeBase: [
        {
          id: 'kb_hours',
          title: 'Saturday hours',
          content: 'The shop is open Saturdays from 8 AM to noon.',
          category: 'hours',
          score: 0.92,
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      metadata: {
        loaded: true,
        promptKey: 'domain_reply',
        messageCount: 0,
        knowledgeBaseCount: 1,
        knowledgeBaseIds: ['kb_hours'],
        activePromptId: null,
        activePromptVersion: null,
      },
    };
    const orchestrator = new ReplyOrchestrator(
      fakeClassifier('opening_hours_question'),
      null,
      fakeContextProvider(vi.fn(async () => context)),
    );
    const plan = await orchestrator.createReply({
      ...baseInput,
      tenantId: 'tenant_1',
      conversationId: 'conversation_1',
      text: 'Are you open Saturday?',
      locale: 'en-US',
      aiDisclosureEnabled: false,
    });

    expect(plan.classification.intent).toBe('opening_hours_question');
    expect(plan.replyText).toBe('The shop is open Saturdays from 8 AM to noon.');
    expect(plan.metadata).toMatchObject({
      aiEngine: { provider: 'knowledge_base_fallback', knowledgeBaseId: 'kb_hours' },
    });
  });

  it('hands low-confidence classification to a person', async () => {
    const classifier: IntentClassifier = {
      classify: vi.fn(async () => ({
        intent: 'other' as const,
        confidence: 0.3,
        matchedSignals: [],
      })),
    };
    const plan = await new ReplyOrchestrator(classifier).createReply({
      ...baseInput,
      text: 'something unusual',
      locale: 'en-US',
    });

    expect(plan.classification.intent).toBe('human_handoff');
    expect(plan.classification.matchedSignals).toContain('ai_low_confidence');
  });
});

describe('ReplyOrchestrator.createReply (domain reply generator)', () => {
  it('uses domain reply generator output when available', async () => {
    // Arrange
    const classifier = fakeClassifier('booking_request');
    const generator: DomainReplyGenerator = {
      generate: vi.fn(async () => ({
        shouldReply: true,
        replyText: 'Ti propongo martedi alle 10.',
        metadata: { aiEngine: { provider: 'anthropic' } },
      })),
    };
    const orchestrator = new ReplyOrchestrator(classifier, generator);

    // Act
    const plan = await orchestrator.createReply(baseInput);

    // Assert: testo prodotto dal generator, con disclosure
    expect(plan.replyText).toContain('sono Ambrogio');
    expect(plan.replyText).toContain('martedi');
    expect(plan.metadata).toEqual({ aiEngine: { provider: 'anthropic' } });
    expect(generator.generate).toHaveBeenCalledTimes(1);
  });

  it('falls back to rule-based body when domain generator throws', async () => {
    // Arrange
    const classifier = fakeClassifier('cancellation_request');
    const generator: DomainReplyGenerator = {
      generate: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const orchestrator = new ReplyOrchestrator(classifier, generator);

    // Act
    const plan = await orchestrator.createReply(baseInput);

    // Assert: cadiamo sul rule-based body con fallback metadata
    expect(plan.shouldReply).toBe(true);
    expect(plan.replyText).toContain('annullare');
    expect(plan.metadata).toEqual({
      aiEngine: { provider: 'rule_based', fallbackReason: 'domain_reply_failed' },
      aiContext: null,
    });
  });

  it('handles generator returning replyText=null without disclosure injection', async () => {
    // Arrange
    const classifier = fakeClassifier('other');
    const generator: DomainReplyGenerator = {
      generate: vi.fn(async () => ({
        shouldReply: false,
        replyText: null,
        metadata: { reason: 'low_confidence' },
      })),
    };
    const orchestrator = new ReplyOrchestrator(classifier, generator);

    // Act
    const plan = await orchestrator.createReply(baseInput);

    // Assert: nessun disclosure su null
    expect(plan.replyText).toBeNull();
    expect(plan.shouldReply).toBe(false);
  });
});

describe('ReplyOrchestrator.createReply (context provider)', () => {
  it('passes loaded context to domain generator and surfaces context metadata', async () => {
    // Arrange
    const fakeContext: AiRuntimeContext = {
      conversationMessages: [],
      activePrompt: null,
      knowledgeBase: [],
      metadata: {
        loaded: true,
        promptKey: 'domain_reply',
        messageCount: 0,
        knowledgeBaseCount: 0,
        knowledgeBaseIds: [],
        activePromptId: null,
        activePromptVersion: null,
      },
    };
    const provider = fakeContextProvider(vi.fn(async () => fakeContext));
    const generator: DomainReplyGenerator = {
      generate: vi.fn(async () => ({
        shouldReply: true,
        replyText: 'reply',
      })),
    };
    const classifier = fakeClassifier('booking_request');
    const orchestrator = new ReplyOrchestrator(classifier, generator, provider);

    // Act
    await orchestrator.createReply({
      ...baseInput,
      tenantId: 'tenant_1',
      conversationId: 'conv_1',
    });

    // Assert: context provider chiamato con i campi attesi
    expect(provider.load).toHaveBeenCalledWith({
      tenantId: 'tenant_1',
      conversationId: 'conv_1',
      query: baseInput.text,
    });
    // Generator riceve il context
    const generateCall = (generator.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(generateCall).toMatchObject({ context: fakeContext });
  });

  it('skips context loading when tenantId or conversationId is missing', async () => {
    // Arrange: solo tenantId, senza conversationId, il provider NON deve essere chiamato
    const provider = fakeContextProvider(vi.fn());
    const generator: DomainReplyGenerator = {
      generate: vi.fn(async () => ({ shouldReply: true, replyText: 'r' })),
    };
    const classifier = fakeClassifier('other');
    const orchestrator = new ReplyOrchestrator(classifier, generator, provider);

    // Act
    await orchestrator.createReply({ ...baseInput, tenantId: 'tenant_1' });

    // Assert
    expect(provider.load).not.toHaveBeenCalled();
  });

  it('returns fallback context with reason when context provider throws', async () => {
    // Arrange
    const provider = fakeContextProvider(
      vi.fn(async () => {
        throw new Error('rag down');
      }),
    );
    const classifier = fakeClassifier('opening_hours_question');
    const orchestrator = new ReplyOrchestrator(classifier, null, provider);

    // Act
    const plan = await orchestrator.createReply({
      ...baseInput,
      tenantId: 'tenant_1',
      conversationId: 'conv_1',
    });

    // Assert: il rule-based body parte e il metadata contiene il fallbackReason
    expect(plan.shouldReply).toBe(true);
    expect(plan.replyText).toContain('orari');
    const metadata = plan.metadata as { aiContext: { fallbackReason: string } };
    expect(metadata.aiContext.fallbackReason).toBe('context_load_failed');
  });
});
