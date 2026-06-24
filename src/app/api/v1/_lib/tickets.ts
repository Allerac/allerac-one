import type { Ticket, TicketEvent } from '@/app/services/tickets/ticket.service';

export function ticketDto(ticket: Ticket) {
  return {
    id: ticket.id,
    number: ticket.number,
    title: ticket.title,
    description: ticket.description,
    type: ticket.type,
    status: ticket.status,
    priority: {
      level: ticket.priorityLevel,
      score: ticket.priorityScore,
      factors: ticket.priorityFactors,
    },
    createdBy: {
      type: ticket.createdByType,
      runId: ticket.createdByRunId,
    },
    assignedTo: ticket.assignedToType ? { type: ticket.assignedToType } : null,
    resolvedBy: ticket.resolvedByType ? {
      type: ticket.resolvedByType,
      runId: ticket.resolvedByRunId,
    } : null,
    resolutionNotes: ticket.resolutionNotes,
    tags: ticket.tags,
    context: ticket.context,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,
    cancelledAt: ticket.cancelledAt,
  };
}

export function ticketEventDto(event: TicketEvent) {
  return {
    id: event.id,
    ticketId: event.ticketId,
    type: event.eventType,
    actor: {
      type: event.actorType,
      runId: event.actorRunId,
    },
    previousValue: event.previousValue,
    newValue: event.newValue,
    notes: event.notes,
    createdAt: event.createdAt,
  };
}

