import {
  RuleBasedIntentClassifier,
  type IntentClassification,
  type IntentClassifier,
} from '@/server/ai/intent-router';
import { env } from '@/lib/env';
import { createAnthropicClientForModel } from '@/server/ai/anthropic-adapter';
import {
  createAiContextProvider,
  emptyAiRuntimeContext,
  type AiContextProvider,
  type AiRuntimeContext,
} from '@/server/ai/context';
import { LlmDomainReplyGenerator, type DomainReplyGenerator } from '@/server/ai/domain-reply';
import { FallbackIntentClassifier, LlmIntentClassifier } from '@/server/ai/llm-intent-classifier';
import { isEnUsLocale } from '@/lib/pilot/auto-repair';

export type ReplyOrchestratorInput = {
  tenantId?: string;
  conversationId?: string;
  text: string;
  assistantName: string;
  aiDisclosureEnabled: boolean;
  locale?: string;
};

export type ReplyPlan = {
  shouldReply: boolean;
  replyText: string | null;
  classification: IntentClassification;
  metadata?: Record<string, unknown>;
};

export class ReplyOrchestrator {
  constructor(
    private readonly classifier: IntentClassifier = new RuleBasedIntentClassifier(),
    private readonly domainReplyGenerator: DomainReplyGenerator | null = null,
    private readonly contextProvider: AiContextProvider | null = null,
  ) {}

  async createReply(input: ReplyOrchestratorInput): Promise<ReplyPlan> {
    let classification = await this.classifier.classify({
      text: input.text,
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
    });
    const context = await this.loadContextSafely(input);
    const enUsSafetyPlan = createEnUsSafetyPlan(input, classification, context);

    if (enUsSafetyPlan) {
      return enUsSafetyPlan;
    }

    const generatedReply = await this.generateDomainReplySafely(input, classification, context);

    if (generatedReply) {
      if (generatedReply.handoffReason) {
        classification = {
          intent: 'human_handoff',
          confidence: Math.max(classification.confidence, 0.9),
          matchedSignals: [...classification.matchedSignals, 'domain_reply_handoff'],
          ...(classification.aiUsage !== undefined ? { aiUsage: classification.aiUsage } : {}),
        };
      }

      return {
        ...generatedReply,
        replyText: generatedReply.replyText
          ? withDisclosure(generatedReply.replyText, {
              assistantName: input.assistantName,
              aiDisclosureEnabled: input.aiDisclosureEnabled,
              locale: input.locale,
            })
          : null,
        classification,
      };
    }

    const groundedFallback = createGroundedKnowledgeFallback(input, classification, context);

    if (groundedFallback) {
      return groundedFallback;
    }

    const body = createReplyBody(classification.intent, input.locale);

    return {
      shouldReply: body !== null,
      replyText:
        body === null
          ? null
          : withDisclosure(body, {
              assistantName: input.assistantName,
              aiDisclosureEnabled: input.aiDisclosureEnabled,
              locale: input.locale,
            }),
      classification,
      metadata: {
        aiEngine: {
          provider: 'rule_based',
        },
        aiContext: context?.metadata ?? null,
      },
    };
  }

  private async generateDomainReplySafely(
    input: ReplyOrchestratorInput,
    classification: IntentClassification,
    context: AiRuntimeContext | null,
  ): Promise<(Omit<ReplyPlan, 'classification'> & { handoffReason?: string | null }) | null> {
    if (!this.domainReplyGenerator) {
      return null;
    }

    try {
      return await this.domainReplyGenerator.generate({
        text: input.text,
        assistantName: input.assistantName,
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        classification,
        ...(context !== null ? { context } : {}),
      });
    } catch {
      const groundedFallback = createGroundedKnowledgeFallback(input, classification, context);

      if (groundedFallback) {
        const { classification: _classification, ...reply } = groundedFallback;
        return {
          ...reply,
          metadata: {
            ...(reply.metadata ?? {}),
            aiEngine: { provider: 'rule_based', fallbackReason: 'domain_reply_failed' },
          },
        };
      }

      return {
        shouldReply: createReplyBody(classification.intent, input.locale) !== null,
        replyText: createReplyBody(classification.intent, input.locale),
        metadata: {
          aiEngine: {
            provider: 'rule_based',
            fallbackReason: 'domain_reply_failed',
          },
          aiContext: context?.metadata ?? null,
        },
      };
    }
  }

  private async loadContextSafely(input: ReplyOrchestratorInput): Promise<AiRuntimeContext | null> {
    if (!this.contextProvider || !input.tenantId || !input.conversationId) {
      return null;
    }

    try {
      return await this.contextProvider.load({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        query: input.text,
      });
    } catch {
      return emptyAiRuntimeContext({
        fallbackReason: 'context_load_failed',
      });
    }
  }
}

function createGroundedKnowledgeFallback(
  input: ReplyOrchestratorInput,
  classification: IntentClassification,
  context: AiRuntimeContext | null,
): ReplyPlan | null {
  if (
    !isEnUsLocale(input.locale) ||
    !context?.knowledgeBase[0] ||
    !['pricing_question', 'opening_hours_question', 'other'].includes(classification.intent)
  ) {
    return null;
  }

  const entry = context.knowledgeBase[0];
  const verifiedContent = entry.content.replace(/\s+/g, ' ').trim().slice(0, 700);

  if (!verifiedContent) {
    return null;
  }

  return {
    shouldReply: true,
    replyText: withDisclosure(verifiedContent, {
      assistantName: input.assistantName,
      aiDisclosureEnabled: input.aiDisclosureEnabled,
      locale: input.locale,
    }),
    classification,
    metadata: {
      aiEngine: { provider: 'knowledge_base_fallback', knowledgeBaseId: entry.id },
      aiContext: context.metadata,
    },
  };
}

export function createReplyOrchestrator(): ReplyOrchestrator {
  const fastClient = createAnthropicClientForModel(env.ANTHROPIC_MODEL_FAST);
  const primaryClient = createAnthropicClientForModel(env.ANTHROPIC_MODEL_PRIMARY);
  const classifier = fastClient
    ? new FallbackIntentClassifier(new LlmIntentClassifier(fastClient))
    : new RuleBasedIntentClassifier();
  const domainReplyGenerator = primaryClient ? new LlmDomainReplyGenerator(primaryClient) : null;

  return new ReplyOrchestrator(
    classifier,
    domainReplyGenerator,
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createAiContextProvider()
      : null,
  );
}

function createReplyBody(intent: IntentClassification['intent'], locale?: string): string | null {
  if (isEnUsLocale(locale)) {
    switch (intent) {
      case 'booking_request':
        return 'I can help schedule your service. Please share the service you need and your preferred day and time.';
      case 'reschedule_request':
        return 'I can help move your appointment. Please share which appointment you mean and the new day and time you prefer.';
      case 'cancellation_request':
        return 'I can help cancel your appointment. Please share the appointment day and time so I can identify it safely.';
      case 'pricing_question':
      case 'opening_hours_question':
        return 'I do not have verified information for that question, so I have sent it to the shop for a human reply.';
      case 'human_handoff':
        return 'I have sent your request to the shop for a human reply.';
      case 'other':
        return 'Thanks for your message. I can help with shop FAQs, appointments, or getting a person involved.';
    }
  }

  switch (intent) {
    case 'booking_request':
      return 'Certo, ti aiuto a prenotare. Indicami servizio, giorno e fascia oraria che preferisci, cosi controllo la disponibilita.';
    case 'reschedule_request':
      return "Certo, posso aiutarti a spostare l'appuntamento. Mandami giorno e orario attuali, poi la nuova fascia che preferisci.";
    case 'cancellation_request':
      return "Va bene, posso aiutarti ad annullare. Mandami nome, giorno e orario dell'appuntamento da cancellare.";
    case 'pricing_question':
      return 'Ti aiuto volentieri. Dimmi quale servizio ti interessa e ti rispondo con prezzo, durata e disponibilita.';
    case 'opening_hours_question':
      return 'Ti aiuto subito. Dimmi per quale giorno vuoi verificare gli orari o se preferisci prenotare direttamente.';
    case 'human_handoff':
      return 'Ho capito. Segno la richiesta per una persona del team e preparo il contesto della conversazione.';
    case 'other':
      return 'Grazie per il messaggio. Dimmi pure se vuoi prenotare, modificare un appuntamento o parlare con il team.';
  }
}

function withDisclosure(
  body: string,
  input: {
    assistantName: string;
    aiDisclosureEnabled: boolean;
    locale?: string | undefined;
  },
): string {
  if (!input.aiDisclosureEnabled) {
    return body;
  }

  return isEnUsLocale(input.locale)
    ? `Hi, I'm ${input.assistantName}, the shop's AI receptionist. ${body}`
    : `Ciao, sono ${input.assistantName}, l'assistente AI dello studio. ${body}`;
}

function createEnUsSafetyPlan(
  input: ReplyOrchestratorInput,
  classification: IntentClassification,
  context: AiRuntimeContext | null,
): ReplyPlan | null {
  if (!isEnUsLocale(input.locale)) {
    return null;
  }

  const greeting = /^(hi|hello|hey|good morning|good afternoon|good evening)[!.\s]*$/i.test(
    input.text.trim(),
  );
  const lacksVerifiedKnowledge = !context || context.knowledgeBase.length === 0;
  const needsVerifiedKnowledge =
    classification.intent === 'pricing_question' ||
    classification.intent === 'opening_hours_question' ||
    classification.intent === 'other';
  const lowConfidence = classification.confidence < 0.6;

  if (greeting) {
    const body = createReplyBody('other', input.locale)!;
    return {
      shouldReply: true,
      replyText: withDisclosure(body, {
        assistantName: input.assistantName,
        aiDisclosureEnabled: input.aiDisclosureEnabled,
        locale: input.locale,
      }),
      classification,
      metadata: { aiEngine: { provider: 'rule_based' }, aiContext: context?.metadata ?? null },
    };
  }

  if (
    classification.intent === 'human_handoff' ||
    lowConfidence ||
    (needsVerifiedKnowledge && lacksVerifiedKnowledge)
  ) {
    const reason =
      classification.intent === 'human_handoff'
        ? 'human_handoff_intent'
        : lowConfidence
          ? 'ai_low_confidence'
          : 'unverified_information';
    const safeClassification: IntentClassification = {
      intent: 'human_handoff',
      confidence: Math.max(classification.confidence, 0.9),
      matchedSignals: [...classification.matchedSignals, reason],
      ...(classification.aiUsage !== undefined ? { aiUsage: classification.aiUsage } : {}),
    };
    const body =
      reason === 'unverified_information'
        ? 'I do not have verified shop information for that question, so I have sent it to the shop for a human reply.'
        : reason === 'ai_low_confidence'
          ? 'I am not confident I understood that correctly, so I have sent it to the shop for a human reply.'
          : createReplyBody('human_handoff', input.locale)!;

    return {
      shouldReply: true,
      replyText: withDisclosure(body, {
        assistantName: input.assistantName,
        aiDisclosureEnabled: input.aiDisclosureEnabled,
        locale: input.locale,
      }),
      classification: safeClassification,
      metadata: {
        aiEngine: { provider: 'rule_based', handoffReason: reason },
        aiContext: context?.metadata ?? null,
      },
    };
  }

  return null;
}
