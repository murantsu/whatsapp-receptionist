/* eslint-disable no-restricted-syntax -- Test fixtures: il fake mock del booking
service viene castato a `AppointmentBookingService` solo per soddisfare la
firma del costruttore. La validazione runtime non aggiungerebbe valore in test. */
import { describe, expect, it } from 'vitest';

import { AppError } from '@/lib/errors/app-error';
import {
  BookingBridgeService,
  type BookingBridgeRepository,
  type BookingServiceOption,
  type ConversationBookingState,
  type CustomerAppointmentForBridge,
} from '@/server/ai/booking-bridge';
import type {
  AppointmentBookingService,
  BookingSlot,
  CancelAppointmentInput,
  ChangeAppointmentResult,
  CreateAppointmentInput,
  CreateAppointmentResult,
  RescheduleAppointmentInput,
} from '@/server/appointments/booking';

const occurredAt = new Date('2026-04-27T07:00:00.000Z');

describe('BookingBridgeService', () => {
  it('proposes real booking slots for a matched service', async () => {
    const repository = new FakeBookingBridgeRepository([
      {
        id: 'service_1',
        name: 'Prima visita',
        durationMinutes: 30,
        priceCents: 7000,
      },
    ]);
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Vorrei prenotare una prima visita',
    });

    expect(reply).toMatchObject({
      handled: true,
      metadata: {
        bookingBridge: {
          action: 'slots_proposed',
          serviceId: 'service_1',
        },
      },
    });
    expect(reply.replyText).toContain('Ho trovato questi slot');
    expect(reply.replyText).toContain('confermo 1');
    expect(savedSlots(repository)).toHaveLength(3);
    expect(booking.availabilityCalls[0]).toMatchObject({
      tenantId: 'tenant_1',
      serviceId: 'service_1',
      maxSlots: 3,
    });
  });

  it('uses extracted date and time preferences when proposing slots', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    const booking = new FakeAppointmentBookingService();
    booking.slots = [
      slot('2026-04-28T09:00:00.000Z', '2026-04-28T09:30:00.000Z'),
      slot('2026-04-28T14:00:00.000Z', '2026-04-28T14:30:00.000Z'),
      slot('2026-04-28T16:00:00.000Z', '2026-04-28T16:30:00.000Z'),
      slot('2026-04-28T19:00:00.000Z', '2026-04-28T19:30:00.000Z'),
    ];
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Vorrei prenotare prima visita domani pomeriggio',
    });

    expect(booking.availabilityCalls[0]).toMatchObject({
      from: new Date('2026-04-28T13:00:00.000Z'),
      to: new Date('2026-04-28T18:00:00.000Z'),
      maxSlots: 20,
    });
    expect(savedSlots(repository).map((item) => item.start)).toEqual([
      '2026-04-28T14:00:00.000Z',
      '2026-04-28T16:00:00.000Z',
    ]);
    expect(reply.metadata).toMatchObject({
      bookingBridge: {
        request: {
          datePreference: {
            label: 'domani',
          },
          timePreference: {
            dayPart: 'afternoon',
          },
        },
      },
    });
  });

  it('asks which service when the request is ambiguous', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
      serviceOption('service_2', 'Igiene dentale'),
    ]);
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Vorrei prenotare',
    });

    expect(reply.replyText).toContain('Quale servizio ti interessa?');
    expect(reply.replyText).toContain('Prima visita');
    expect(reply.replyText).toContain('Igiene dentale');
    expect(booking.availabilityCalls).toHaveLength(0);
  });

  it('confirms a previously proposed slot and clears conversation state', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    repository.savedState = stateWithSlots();
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Confermo 2',
    });

    expect(reply).toMatchObject({
      handled: true,
      metadata: {
        bookingBridge: {
          action: 'appointment_created',
          appointmentId: 'appointment_1',
        },
      },
    });
    expect(booking.createCalls[0]).toMatchObject({
      tenantId: 'tenant_1',
      serviceId: 'service_1',
      conversationId: 'conversation_1',
      customerIdentifier: '393331112233',
      customerPhone: '393331112233',
      scheduledAt: new Date('2026-04-28T10:00:00.000Z'),
      requireCalendarSync: false,
      sendConfirmation: true,
    });
    expect(repository.cleared).toBe(true);
    expect(reply.replyText).toContain('Perfetto, ho prenotato');
  });

  it('expires stale proposed slots before booking', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    repository.savedState = {
      ...stateWithSlots(),
      expiresAt: '2026-04-27T06:00:00.000Z',
    };
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Confermo 1',
    });

    expect(reply.metadata).toMatchObject({
      bookingBridge: {
        action: 'slot_state_expired',
      },
    });
    expect(booking.createCalls).toHaveLength(0);
    expect(repository.cleared).toBe(true);
  });

  it('asks for a target date before rescheduling a single appointment', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    repository.appointments = [customerAppointment()];
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Vorrei spostare il mio appuntamento',
      intent: 'reschedule_request',
    });

    expect(reply).toMatchObject({
      handled: true,
      metadata: {
        bookingBridge: {
          action: 'reschedule_date_requested',
          appointmentId: 'appointment_1',
        },
      },
    });
    expect(reply.replyText).toContain('Per quale giorno');
    expect(repository.savedState).toMatchObject({
      status: 'reschedule_date_requested',
    });
  });

  it('proposes reschedule slots and confirms the selected new slot', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    repository.savedState = {
      status: 'reschedule_date_requested',
      appointment: pendingAppointment(),
      proposedAt: '2026-04-27T07:00:00.000Z',
      expiresAt: '2026-04-27T07:30:00.000Z',
    };
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const slotsReply = await service.createBookingReply({
      ...baseInput(),
      text: 'domani mattina',
      intent: 'booking_request',
    });

    expect(slotsReply).toMatchObject({
      metadata: {
        bookingBridge: {
          action: 'reschedule_slots_proposed',
          appointmentId: 'appointment_1',
        },
      },
    });
    expect(booking.availabilityCalls[0]).toMatchObject({
      tenantId: 'tenant_1',
      serviceId: 'service_1',
      excludeAppointmentId: 'appointment_1',
      durationMinutes: 30,
      maxSlots: 20,
    });
    expect(repository.savedState).toMatchObject({
      status: 'reschedule_slots_proposed',
    });

    const confirmReply = await service.createBookingReply({
      ...baseInput(),
      text: 'confermo 2',
      intent: 'other',
    });

    expect(confirmReply).toMatchObject({
      metadata: {
        bookingBridge: {
          action: 'appointment_rescheduled',
          appointmentId: 'appointment_1',
        },
      },
    });
    expect(booking.rescheduleCalls[0]).toMatchObject({
      tenantId: 'tenant_1',
      appointmentId: 'appointment_1',
      scheduledAt: new Date('2026-04-28T10:00:00.000Z'),
      requireCalendarSync: false,
      sendConfirmation: true,
    });
    expect(repository.cleared).toBe(true);
  });

  it('cancels a single future appointment for the WhatsApp number', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    repository.appointments = [customerAppointment()];
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Vorrei annullare il mio appuntamento',
      intent: 'cancellation_request',
    });

    expect(reply).toMatchObject({
      metadata: {
        bookingBridge: {
          action: 'appointment_cancelled',
          appointmentId: 'appointment_1',
        },
      },
    });
    expect(booking.cancelCalls[0]).toMatchObject({
      tenantId: 'tenant_1',
      appointmentId: 'appointment_1',
      requireCalendarSync: false,
      sendCancellation: true,
    });
  });

  it('uses natural appointment hints to cancel the matching time', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    repository.appointments = [
      customerAppointment({ appointmentId: 'appointment_1' }),
      customerAppointment({
        appointmentId: 'appointment_2',
        scheduledAt: new Date('2026-04-28T15:00:00.000Z'),
      }),
    ];
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Annulla quello delle 15',
      intent: 'cancellation_request',
    });

    expect(reply.metadata).toMatchObject({
      bookingBridge: {
        action: 'appointment_cancelled',
        appointmentId: 'appointment_2',
      },
    });
    expect(booking.cancelCalls[0]).toMatchObject({
      appointmentId: 'appointment_2',
    });
  });

  it('uses natural appointment hints to cancel the matching customer name', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    repository.appointments = [
      customerAppointment({
        appointmentId: 'appointment_1',
        customerName: 'Luca',
      }),
      customerAppointment({
        appointmentId: 'appointment_2',
        customerName: 'Mario',
        scheduledAt: new Date('2026-04-29T09:00:00.000Z'),
      }),
    ];
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Annulla la visita di Mario',
      intent: 'cancellation_request',
    });

    expect(reply.metadata).toMatchObject({
      bookingBridge: {
        action: 'appointment_cancelled',
        appointmentId: 'appointment_2',
      },
    });
    expect(booking.cancelCalls[0]).toMatchObject({
      appointmentId: 'appointment_2',
    });
  });

  it('uses source-date hints for reschedule lookup before asking the target date', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    repository.appointments = [
      customerAppointment({
        appointmentId: 'appointment_1',
        scheduledAt: new Date('2026-04-28T09:00:00.000Z'),
      }),
      customerAppointment({
        appointmentId: 'appointment_2',
        scheduledAt: new Date('2026-04-29T09:00:00.000Z'),
      }),
    ];
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Vorrei spostare quello di domani',
      intent: 'reschedule_request',
    });

    expect(reply.metadata).toMatchObject({
      bookingBridge: {
        action: 'reschedule_date_requested',
        appointmentId: 'appointment_1',
      },
    });
    expect(reply.replyText).toContain('Per quale giorno');
    expect(booking.availabilityCalls).toHaveLength(0);
    expect(repository.savedState).toMatchObject({
      status: 'reschedule_date_requested',
      appointment: {
        appointmentId: 'appointment_1',
      },
    });
  });

  it('keeps source customer and target date separate during reschedule', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    repository.appointments = [
      customerAppointment({
        appointmentId: 'appointment_1',
        customerName: 'Luca',
      }),
      customerAppointment({
        appointmentId: 'appointment_2',
        customerName: 'Mario',
      }),
    ];
    const booking = new FakeAppointmentBookingService();
    booking.slots = [
      slot('2026-05-01T09:00:00.000Z', '2026-05-01T09:30:00.000Z'),
      slot('2026-05-01T10:00:00.000Z', '2026-05-01T10:30:00.000Z'),
    ];
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Sposta la visita di Mario a venerdi mattina',
      intent: 'reschedule_request',
    });

    expect(reply.metadata).toMatchObject({
      bookingBridge: {
        action: 'reschedule_slots_proposed',
        appointmentId: 'appointment_2',
        request: {
          datePreference: {
            label: 'venerdi',
          },
          timePreference: {
            dayPart: 'morning',
          },
        },
      },
    });
    expect(booking.availabilityCalls[0]).toMatchObject({
      tenantId: 'tenant_1',
      serviceId: 'service_1',
      excludeAppointmentId: 'appointment_2',
      from: new Date('2026-05-01T08:00:00.000Z'),
      to: new Date('2026-05-01T13:00:00.000Z'),
    });
    expect(repository.savedState).toMatchObject({
      status: 'reschedule_slots_proposed',
      appointment: {
        appointmentId: 'appointment_2',
      },
    });
  });

  it('keeps source date and target date separate during reschedule', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    repository.appointments = [
      customerAppointment({
        appointmentId: 'appointment_1',
        scheduledAt: new Date('2026-04-28T09:00:00.000Z'),
      }),
      customerAppointment({
        appointmentId: 'appointment_2',
        scheduledAt: new Date('2026-04-29T09:00:00.000Z'),
      }),
    ];
    const booking = new FakeAppointmentBookingService();
    booking.slots = [
      slot('2026-05-01T09:00:00.000Z', '2026-05-01T09:30:00.000Z'),
      slot('2026-05-01T10:00:00.000Z', '2026-05-01T10:30:00.000Z'),
    ];
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      text: 'Sposta quello di domani a venerdi mattina',
      intent: 'reschedule_request',
    });

    expect(reply.metadata).toMatchObject({
      bookingBridge: {
        action: 'reschedule_slots_proposed',
        appointmentId: 'appointment_1',
        request: {
          datePreference: {
            label: 'venerdi',
          },
          timePreference: {
            dayPart: 'morning',
          },
        },
      },
    });
    expect(booking.availabilityCalls[0]).toMatchObject({
      excludeAppointmentId: 'appointment_1',
      from: new Date('2026-05-01T08:00:00.000Z'),
      to: new Date('2026-05-01T13:00:00.000Z'),
    });
    expect(repository.savedState).toMatchObject({
      status: 'reschedule_slots_proposed',
      appointment: {
        appointmentId: 'appointment_1',
      },
    });
  });

  it('asks which appointment to cancel when multiple future appointments match', async () => {
    const repository = new FakeBookingBridgeRepository([
      serviceOption('service_1', 'Prima visita'),
    ]);
    repository.appointments = [
      customerAppointment({ appointmentId: 'appointment_1' }),
      customerAppointment({
        appointmentId: 'appointment_2',
        scheduledAt: new Date('2026-04-29T09:00:00.000Z'),
      }),
    ];
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const selectionReply = await service.createBookingReply({
      ...baseInput(),
      text: 'Annulla appuntamento',
      intent: 'cancellation_request',
    });

    expect(selectionReply.replyText).toContain('Quale vuoi annullare?');
    expect(repository.savedState).toMatchObject({
      status: 'cancellation_selection',
    });

    const confirmReply = await service.createBookingReply({
      ...baseInput(),
      text: 'annulla 2',
      intent: 'other',
    });

    expect(confirmReply.metadata).toMatchObject({
      bookingBridge: {
        action: 'appointment_cancelled',
        appointmentId: 'appointment_2',
      },
    });
    expect(booking.cancelCalls[0]).toMatchObject({
      appointmentId: 'appointment_2',
    });
  });

  it('confirms an en-US booking only after Google Calendar sync succeeds', async () => {
    const repository = new FakeBookingBridgeRepository([serviceOption('service_1', 'Oil change')]);
    repository.savedState = {
      ...stateWithSlots(),
      serviceName: 'Oil change',
      request: {
        serviceQuery: 'oil change',
        datePreference: null,
        timePreference: { dayPart: 'any', startHour: null, endHour: null },
        urgency: 'normal',
        customerName: 'Alex Smith',
        customerPhone: '5551234567',
        vehicleMake: 'Toyota',
        vehicleModel: 'Camry',
        vehicleYear: 2020,
        problemSymptoms: 'The car is shaking.',
        confidence: 0.95,
        signals: [],
      },
    };
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      locale: 'en-US',
      customerIdentifier: '15551234567',
      text: 'confirm 1',
    });

    expect(reply.replyText).toContain('is confirmed');
    expect(reply.handoffReason).toBeUndefined();
    expect(booking.createCalls[0]).toMatchObject({
      requireCalendarSync: true,
      sendConfirmation: false,
      customerName: 'Alex Smith',
      customerPhone: '5551234567',
    });
    expect(booking.createCalls[0]?.notes).toContain('Vehicle: 2020 Toyota Camry');
  });

  it('keeps collected auto repair details and does not ask for them again', async () => {
    const repository = new FakeBookingBridgeRepository([serviceOption('service_1', 'Oil change')]);
    const booking = new FakeAppointmentBookingService();
    booking.slots = [slot('2026-04-28T14:00:00.000Z', '2026-04-28T14:30:00.000Z')];
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const first = await service.createBookingReply({
      ...baseInput(),
      locale: 'en-US',
      text: 'My name is Alex Smith and I have a 2020 Toyota Camry',
    });

    expect(first.replyText).not.toContain('your name');
    expect(first.replyText).not.toContain('vehicle year');
    expect(first.metadata).toMatchObject({
      bookingBridge: {
        missingFields: ['requested_service_or_symptoms', 'preferred_date', 'preferred_time'],
      },
    });

    const second = await service.createBookingReply({
      ...baseInput(),
      locale: 'en-US',
      text: 'I need an oil change tomorrow afternoon',
    });

    expect(second.metadata).toMatchObject({
      bookingBridge: { action: 'slots_proposed', serviceId: 'service_1' },
    });
    expect(second.replyText).toContain('I found these times');
  });

  it('accepts make, model, and year in separate follow-up messages', async () => {
    const repository = new FakeBookingBridgeRepository([serviceOption('service_1', 'Oil change')]);
    const booking = new FakeAppointmentBookingService();
    booking.slots = [slot('2026-04-28T14:00:00.000Z', '2026-04-28T14:30:00.000Z')];
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );
    const send = (text: string) =>
      service.createBookingReply({ ...baseInput(), locale: 'en-US', text });

    const first = await send('My name is Alex Smith. I need an oil change tomorrow afternoon.');
    expect(first.replyText).toContain('vehicle year, make, and model');

    const make = await send('Toyota');
    expect(make.replyText).toContain('missing vehicle model and year');
    expect(make.replyText).not.toContain('your name');

    const model = await send('Camry');
    expect(model.replyText).toContain('missing vehicle year');

    const year = await send('2020');
    expect(year.metadata).toMatchObject({
      bookingBridge: { action: 'slots_proposed', serviceId: 'service_1' },
    });
    expect(year.metadata).toMatchObject({
      bookingBridge: {
        request: { vehicleMake: 'Toyota', vehicleModel: 'Camry', vehicleYear: 2020 },
      },
    });
  });

  it('lets an explicit human request override a pending booking intake', async () => {
    const repository = new FakeBookingBridgeRepository([serviceOption('service_1', 'Oil change')]);
    repository.savedState = {
      status: 'auto_repair_intake',
      request: {},
      proposedAt: occurredAt.toISOString(),
      expiresAt: new Date(occurredAt.getTime() + 30 * 60_000).toISOString(),
    };
    const service = new BookingBridgeService(
      repository,
      new FakeAppointmentBookingService() as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      locale: 'en-US',
      text: 'I want to speak with a person',
      intent: 'human_handoff',
    });

    expect(reply).toEqual({ handled: false, replyText: null, metadata: {} });
    expect(repository.savedState?.status).toBe('auto_repair_intake');
  });

  it.each(['failed', 'not_configured'] as const)(
    'does not confirm an en-US booking when Calendar is %s',
    async (calendarSyncStatus) => {
      const repository = new FakeBookingBridgeRepository([
        serviceOption('service_1', 'Oil change'),
      ]);
      repository.savedState = { ...stateWithSlots(), serviceName: 'Oil change' };
      const booking = new FakeAppointmentBookingService();
      booking.calendarSyncStatus = calendarSyncStatus;
      const service = new BookingBridgeService(
        repository,
        booking as unknown as AppointmentBookingService,
      );

      const reply = await service.createBookingReply({
        ...baseInput(),
        locale: 'en-US',
        text: 'confirm 1',
      });

      expect(reply.handoffReason).toBe('calendar_sync_failed');
      expect(reply.replyText).toContain('it is not confirmed yet');
      expect(reply.replyText).not.toMatch(/appointment is confirmed for/i);
      expect(repository.cleared).toBe(true);
    },
  );

  it.each(['Google Calendar authentication failed', 'Google Calendar request timed out'])(
    'hands “%s” to a person',
    async (message) => {
      const repository = new FakeBookingBridgeRepository([
        serviceOption('service_1', 'Oil change'),
      ]);
      repository.savedState = { ...stateWithSlots(), serviceName: 'Oil change' };
      const booking = new FakeAppointmentBookingService();
      booking.createError = new AppError('upstream_error', message);
      const service = new BookingBridgeService(
        repository,
        booking as unknown as AppointmentBookingService,
      );

      const reply = await service.createBookingReply({
        ...baseInput(),
        locale: 'en-US',
        text: 'confirm 1',
      });

      expect(reply.handoffReason).toBe('calendar_sync_failed');
      expect(reply.replyText).toContain('not confirmed yet');
    },
  );

  it('does not confirm an en-US slot that became unavailable', async () => {
    const repository = new FakeBookingBridgeRepository([serviceOption('service_1', 'Oil change')]);
    repository.savedState = { ...stateWithSlots(), serviceName: 'Oil change' };
    const booking = new FakeAppointmentBookingService();
    booking.createError = new AppError('conflict', 'Requested appointment slot is unavailable');
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      locale: 'en-US',
      text: 'confirm 1',
    });

    expect(reply.metadata).toMatchObject({ bookingBridge: { action: 'slot_conflict' } });
    expect(reply.replyText).toContain('no longer available');
    expect(reply.replyText).not.toContain('is confirmed');
  });

  it('reschedules the requested en-US appointment and requires Calendar sync', async () => {
    const repository = new FakeBookingBridgeRepository([serviceOption('service_1', 'Oil change')]);
    repository.appointments = [customerAppointment({ serviceName: 'Oil change' })];
    const booking = new FakeAppointmentBookingService();
    booking.slots = [slot('2026-05-01T11:00:00.000Z', '2026-05-01T11:30:00.000Z')];
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const proposal = await service.createBookingReply({
      ...baseInput(),
      locale: 'en-US',
      text: 'move my appointment to Friday at 11 AM',
      intent: 'reschedule_request',
    });
    expect(proposal.metadata).toMatchObject({
      bookingBridge: { action: 'reschedule_slots_proposed' },
    });

    const confirmation = await service.createBookingReply({
      ...baseInput(),
      locale: 'en-US',
      text: 'confirm 1',
      intent: 'other',
    });
    expect(confirmation.replyText).toContain('is confirmed');
    expect(booking.rescheduleCalls[0]).toMatchObject({
      requireCalendarSync: true,
      sendConfirmation: false,
    });
  });

  it('cancels the matching en-US appointment in Google Calendar', async () => {
    const repository = new FakeBookingBridgeRepository([serviceOption('service_1', 'Oil change')]);
    repository.appointments = [customerAppointment({ serviceName: 'Oil change' })];
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      locale: 'en-US',
      text: 'cancel my appointment tomorrow',
      intent: 'cancellation_request',
    });

    expect(reply.replyText).toContain('cancelled in Google Calendar');
    expect(booking.cancelCalls[0]).toMatchObject({
      requireCalendarSync: true,
      sendCancellation: false,
    });
  });

  it('asks for clarification instead of guessing 03/04', async () => {
    const repository = new FakeBookingBridgeRepository([serviceOption('service_1', 'Oil change')]);
    const booking = new FakeAppointmentBookingService();
    const service = new BookingBridgeService(
      repository,
      booking as unknown as AppointmentBookingService,
    );

    const reply = await service.createBookingReply({
      ...baseInput(),
      locale: 'en-US',
      text: 'Book an oil change on 03/04',
    });

    expect(reply.replyText).toContain('numeric date is ambiguous');
    expect(booking.availabilityCalls).toHaveLength(0);
  });
});

class FakeBookingBridgeRepository implements BookingBridgeRepository {
  savedState: ConversationBookingState | null = null;
  cleared = false;
  appointments: CustomerAppointmentForBridge[] = [];

  constructor(private readonly services: BookingServiceOption[]) {}

  async getTenantTimezone(): Promise<string> {
    return 'UTC';
  }

  async listActiveServices(): Promise<BookingServiceOption[]> {
    return this.services;
  }

  async getConversationBookingState(): Promise<ConversationBookingState | null> {
    return this.savedState;
  }

  async saveConversationBookingState(input: { state: ConversationBookingState }): Promise<void> {
    this.savedState = input.state;
    this.cleared = false;
  }

  async clearConversationBookingState(): Promise<void> {
    this.savedState = null;
    this.cleared = true;
  }

  async listCustomerAppointments(): Promise<CustomerAppointmentForBridge[]> {
    return this.appointments;
  }
}

class FakeAppointmentBookingService {
  availabilityCalls: Array<{
    tenantId: string;
    serviceId: string;
    from?: Date;
    to?: Date;
    maxSlots?: number;
    durationMinutes?: number;
    excludeAppointmentId?: string;
  }> = [];
  createCalls: CreateAppointmentInput[] = [];
  rescheduleCalls: RescheduleAppointmentInput[] = [];
  cancelCalls: CancelAppointmentInput[] = [];
  calendarSyncStatus: 'synced' | 'failed' | 'not_configured' = 'synced';
  createError: Error | null = null;
  slots: BookingSlot[] = [
    slot('2026-04-28T09:00:00.000Z', '2026-04-28T09:30:00.000Z'),
    slot('2026-04-28T10:00:00.000Z', '2026-04-28T10:30:00.000Z'),
    slot('2026-04-28T11:00:00.000Z', '2026-04-28T11:30:00.000Z'),
  ];

  async getAvailableSlots(input: {
    tenantId: string;
    serviceId: string;
    from?: Date;
    to?: Date;
    maxSlots?: number;
    durationMinutes?: number;
    excludeAppointmentId?: string;
  }): Promise<BookingSlot[]> {
    this.availabilityCalls.push(input);

    return this.slots;
  }

  async createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
    this.createCalls.push(input);
    if (this.createError) throw this.createError;
    const scheduledAt = input.scheduledAt.toISOString();
    return {
      appointmentId: 'appointment_1',
      scheduledAt,
      endsAt: new Date(input.scheduledAt.getTime() + 30 * 60_000).toISOString(),
      durationMinutes: 30,
      calendarSyncStatus: this.calendarSyncStatus,
      calendarEventId: this.calendarSyncStatus === 'synced' ? 'event_1' : null,
      calendarEventHtmlLink: null,
      confirmationQueued: false,
      confirmationErrorCode: null,
    };
  }

  async rescheduleAppointment(input: RescheduleAppointmentInput): Promise<ChangeAppointmentResult> {
    this.rescheduleCalls.push(input);
    return changeResult(
      input.appointmentId,
      input.scheduledAt,
      'confirmed',
      this.calendarSyncStatus,
    );
  }

  async cancelAppointment(input: CancelAppointmentInput): Promise<ChangeAppointmentResult> {
    this.cancelCalls.push(input);
    return changeResult(
      input.appointmentId,
      new Date('2026-04-28T09:00:00.000Z'),
      'cancelled',
      this.calendarSyncStatus,
    );
  }
}

function changeResult(
  appointmentId: string,
  scheduledAt: Date,
  status: 'confirmed' | 'cancelled',
  calendarSyncStatus: 'synced' | 'failed' | 'not_configured',
): ChangeAppointmentResult {
  return {
    appointmentId,
    scheduledAt: scheduledAt.toISOString(),
    endsAt: new Date(scheduledAt.getTime() + 30 * 60_000).toISOString(),
    durationMinutes: 30,
    status,
    calendarSyncStatus,
    calendarEventId: calendarSyncStatus === 'synced' ? 'event_1' : null,
    calendarEventHtmlLink: null,
    notificationQueued: false,
    notificationErrorCode: null,
  };
}

function baseInput() {
  return {
    tenantId: 'tenant_1',
    conversationId: 'conversation_1',
    customerIdentifier: '393331112233',
    customerName: null,
    text: 'Vorrei prenotare',
    occurredAt,
  };
}

function serviceOption(id: string, name: string): BookingServiceOption {
  return {
    id,
    name,
    durationMinutes: 30,
    priceCents: null,
  };
}

function stateWithSlots(): Extract<ConversationBookingState, { status: 'slots_proposed' }> {
  return {
    status: 'slots_proposed',
    serviceId: 'service_1',
    serviceName: 'Prima visita',
    proposedAt: '2026-04-27T07:00:00.000Z',
    expiresAt: '2026-04-27T07:30:00.000Z',
    slots: [
      toPendingSlot(slot('2026-04-28T09:00:00.000Z', '2026-04-28T09:30:00.000Z')),
      toPendingSlot(slot('2026-04-28T10:00:00.000Z', '2026-04-28T10:30:00.000Z')),
      toPendingSlot(slot('2026-04-28T11:00:00.000Z', '2026-04-28T11:30:00.000Z')),
    ],
  };
}

function slot(start: string, end: string): BookingSlot {
  return {
    tenantId: 'tenant_1',
    serviceId: 'service_1',
    serviceName: 'Prima visita',
    start,
    end,
    durationMinutes: 30,
    timezone: 'UTC',
  };
}

function toPendingSlot(slotInput: BookingSlot) {
  return {
    serviceId: slotInput.serviceId,
    serviceName: slotInput.serviceName,
    start: slotInput.start,
    end: slotInput.end,
    durationMinutes: slotInput.durationMinutes,
    timezone: slotInput.timezone,
  };
}

function customerAppointment(
  overrides: Partial<CustomerAppointmentForBridge> = {},
): CustomerAppointmentForBridge {
  return {
    appointmentId: 'appointment_1',
    serviceId: 'service_1',
    serviceName: 'Prima visita',
    customerName: 'Mario Rossi',
    scheduledAt: new Date('2026-04-28T09:00:00.000Z'),
    durationMinutes: 30,
    ...overrides,
  };
}

function pendingAppointment() {
  return {
    appointmentId: 'appointment_1',
    serviceId: 'service_1',
    serviceName: 'Prima visita',
    customerName: 'Mario Rossi',
    scheduledAt: '2026-04-28T09:00:00.000Z',
    durationMinutes: 30,
    timezone: 'UTC',
  };
}

function savedSlots(repository: FakeBookingBridgeRepository) {
  return repository.savedState?.status === 'slots_proposed' ? repository.savedState.slots : [];
}
