import { ticketService } from '@/app/services/tickets/ticket.service';
export { TICKETS_TOOL_DEFINITIONS } from './tickets.tool.definitions';

export function buildTicketsTools(userId: string) {
  return {
    list_tickets: async (args: { status?: string; type?: string; limit?: number }) => {
      const tickets = await ticketService.list({
        userId,
        status: args.status as any,
        type: args.type as any,
        limit: args.limit ?? 20,
      });
      return {
        tickets: tickets.map(t => ({
          ticket_id: t.id,
          title: t.title,
          description: t.description,
          type: t.type,
          status: t.status,
          priority: t.priorityLevel,
          priority_score: t.priorityScore,
          created_at: t.createdAt,
        })),
        total: tickets.length,
      };
    },

    create_ticket: async (args: { title: string; description?: string; type: string; explicit_urgency?: string }) => {
      const ticket = await ticketService.create({
        userId,
        title: args.title,
        description: args.description,
        type: args.type as any,
        explicitUrgency: args.explicit_urgency as any,
      });
      return {
        success: true,
        ticket_id: ticket.id,
        title: ticket.title,
        type: ticket.type,
        status: ticket.status,
        priority: ticket.priorityLevel,
      };
    },

    update_ticket_status: async (args: { ticket_id: string; status: string; resolution_notes?: string }) => {
      const updated = await ticketService.update(args.ticket_id, userId, {
        status: args.status as any,
        resolvedByType: args.status === 'resolved' ? 'user' : undefined,
        resolutionNotes: args.resolution_notes,
      });
      if (!updated) return { success: false, error: 'Ticket not found' };
      return {
        success: true,
        ticket_id: updated.id,
        title: updated.title,
        status: updated.status,
      };
    },

    get_ticket: async (args: { ticket_id: string }) => {
      const ticket = await ticketService.getById(args.ticket_id, userId);
      if (!ticket) return { error: 'Ticket not found' };
      const events = await ticketService.getEvents(args.ticket_id);
      return {
        ticket_id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        type: ticket.type,
        status: ticket.status,
        priority: ticket.priorityLevel,
        priority_score: ticket.priorityScore,
        created_at: ticket.createdAt,
        events: events.map(e => ({
          event_type: e.eventType,
          actor: e.actorType,
          notes: e.notes,
          created_at: e.createdAt,
        })),
      };
    },
  };
}
