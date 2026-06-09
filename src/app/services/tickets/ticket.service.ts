import pool from '@/app/clients/db';
import { v4 as uuid } from 'uuid';
import { ticketPriorityService, PriorityLevel, PriorityInput } from './priority.service';

export type TicketType   = 'task' | 'bug' | 'improvement' | 'question';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled';

export interface Ticket {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  type: TicketType;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  cancelledAt: Date | null;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  priorityFactors: Record<string, unknown> | null;
  createdByType: 'user' | 'agent';
  createdByRunId: string | null;
  assignedToType: 'user' | 'agent' | null;
  resolvedByType: 'user' | 'agent' | null;
  resolvedByRunId: string | null;
  resolutionNotes: string | null;
  tags: string[];
  context: Record<string, unknown> | null;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  createdAt: Date;
  eventType: string;
  actorType: 'user' | 'agent' | 'system';
  actorRunId: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  notes: string | null;
}

export interface CreateTicketInput {
  userId: string;
  title: string;
  description?: string;
  type?: TicketType;
  explicitUrgency?: PriorityLevel;
  createdByType?: 'user' | 'agent';
  createdByRunId?: string;
  tags?: string[];
  context?: Record<string, unknown>;
}

export interface ListTicketsInput {
  userId: string;
  status?: TicketStatus;
  type?: TicketType;
  priorityLevel?: PriorityLevel;
  limit?: number;
  offset?: number;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  resolutionNotes?: string;
  resolvedByType?: 'user' | 'agent';
  resolvedByRunId?: string;
  assignedToType?: 'user' | 'agent' | null;
  contextPatch?: Record<string, unknown>;
}

function rowToTicket(row: Record<string, unknown>): Ticket {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    description: row.description as string | null,
    type: row.type as TicketType,
    status: row.status as TicketStatus,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    resolvedAt: row.resolved_at as Date | null,
    cancelledAt: row.cancelled_at as Date | null,
    priorityScore: row.priority_score as number,
    priorityLevel: row.priority_level as PriorityLevel,
    priorityFactors: row.priority_factors as Record<string, unknown> | null,
    createdByType: row.created_by_type as 'user' | 'agent',
    createdByRunId: row.created_by_run_id as string | null,
    assignedToType: row.assigned_to_type as 'user' | 'agent' | null,
    resolvedByType: row.resolved_by_type as 'user' | 'agent' | null,
    resolvedByRunId: row.resolved_by_run_id as string | null,
    resolutionNotes: row.resolution_notes as string | null,
    tags: (row.tags as string[]) ?? [],
    context: row.context as Record<string, unknown> | null,
  };
}

function rowToEvent(row: Record<string, unknown>): TicketEvent {
  return {
    id: row.id as string,
    ticketId: row.ticket_id as string,
    createdAt: row.created_at as Date,
    eventType: row.event_type as string,
    actorType: row.actor_type as 'user' | 'agent' | 'system',
    actorRunId: row.actor_run_id as string | null,
    previousValue: row.previous_value as Record<string, unknown> | null,
    newValue: row.new_value as Record<string, unknown> | null,
    notes: row.notes as string | null,
  };
}

export class TicketService {
  async create(input: CreateTicketInput): Promise<Ticket> {
    const id = uuid();
    const now = new Date();
    const type = input.type ?? 'task';
    const createdByType = input.createdByType ?? 'user';

    const priorityInput: PriorityInput = {
      explicitUrgency: input.explicitUrgency ?? null,
      ticketType: type,
      createdAt: now,
      creatorType: createdByType,
      title: input.title,
      description: input.description,
    };

    const priority = ticketPriorityService.compute(priorityInput);

    const result = await pool.query(
      `INSERT INTO tickets (
        id, user_id, title, description, type,
        priority_score, priority_level, priority_factors,
        created_by_type, created_by_run_id,
        tags, context
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        id, input.userId, input.title, input.description ?? null, type,
        priority.score, priority.level, JSON.stringify(priority.factors),
        createdByType, input.createdByRunId ?? null,
        input.tags ?? [], input.context ? JSON.stringify(input.context) : null,
      ]
    );

    const ticket = rowToTicket(result.rows[0]);

    await this._recordEvent(ticket.id, {
      eventType: 'created',
      actorType: createdByType,
      newValue: { title: ticket.title, type: ticket.type, priority: ticket.priorityLevel },
    });

    return ticket;
  }

  async getById(id: string, userId: string): Promise<Ticket | null> {
    const result = await pool.query(
      'SELECT * FROM tickets WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] ? rowToTicket(result.rows[0]) : null;
  }

  async list(input: ListTicketsInput): Promise<Ticket[]> {
    const conditions: string[] = ['user_id = $1'];
    const values: unknown[] = [input.userId];
    let idx = 2;

    if (input.status)        { conditions.push(`status = $${idx++}`);         values.push(input.status); }
    if (input.type)          { conditions.push(`type = $${idx++}`);           values.push(input.type); }
    if (input.priorityLevel) { conditions.push(`priority_level = $${idx++}`); values.push(input.priorityLevel); }

    const where = conditions.join(' AND ');
    const limit  = input.limit  ?? 50;
    const offset = input.offset ?? 0;

    const result = await pool.query(
      `SELECT * FROM tickets WHERE ${where}
       ORDER BY priority_score DESC, created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...values, limit, offset]
    );

    return result.rows.map(rowToTicket);
  }

  async update(id: string, userId: string, input: UpdateTicketInput): Promise<Ticket | null> {
    const ticket = await this.getById(id, userId);
    if (!ticket) return null;

    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let idx = 1;

    const previousStatus = ticket.status;

    if (input.status) {
      sets.push(`status = $${idx++}`); values.push(input.status);
      if (input.status === 'resolved') {
        sets.push('resolved_at = NOW()');
        if (input.resolvedByType) { sets.push(`resolved_by_type = $${idx++}`);  values.push(input.resolvedByType); }
        if (input.resolvedByRunId) { sets.push(`resolved_by_run_id = $${idx++}`); values.push(input.resolvedByRunId); }
        if (input.resolutionNotes) { sets.push(`resolution_notes = $${idx++}`);  values.push(input.resolutionNotes); }
      }
      if (input.status === 'cancelled') {
        sets.push('cancelled_at = NOW()');
      }
    }

    if (input.assignedToType !== undefined) {
      sets.push(`assigned_to_type = $${idx++}`); values.push(input.assignedToType);
    }

    if (input.contextPatch) {
      sets.push(`context = COALESCE(context, '{}'::jsonb) || $${idx++}::jsonb`);
      values.push(JSON.stringify(input.contextPatch));
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE tickets SET ${sets.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) return null;
    const updated = rowToTicket(result.rows[0]);

    if (input.status && input.status !== previousStatus) {
      await this._recordEvent(id, {
        eventType: input.status === 'resolved' ? 'resolved' : 'status_changed',
        actorType: input.resolvedByType ?? 'user',
        actorRunId: input.resolvedByRunId,
        previousValue: { status: previousStatus },
        newValue: { status: input.status },
        notes: input.resolutionNotes,
      });
    }

    return updated;
  }

  async getEvents(ticketId: string, userId: string): Promise<TicketEvent[]> {
    const result = await pool.query(
      `SELECT te.*
       FROM ticket_events te
       INNER JOIN tickets t ON t.id = te.ticket_id
       WHERE te.ticket_id = $1 AND t.user_id = $2
       ORDER BY te.created_at ASC`,
      [ticketId, userId]
    );
    return result.rows.map(rowToEvent);
  }

  private async _recordEvent(
    ticketId: string,
    event: {
      eventType: string;
      actorType: 'user' | 'agent' | 'system';
      actorRunId?: string;
      previousValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
      notes?: string;
    }
  ): Promise<void> {
    await pool.query(
      `INSERT INTO ticket_events
         (id, ticket_id, event_type, actor_type, actor_run_id, previous_value, new_value, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        uuid(), ticketId, event.eventType, event.actorType,
        event.actorRunId ?? null,
        event.previousValue ? JSON.stringify(event.previousValue) : null,
        event.newValue      ? JSON.stringify(event.newValue)      : null,
        event.notes ?? null,
      ]
    );
  }
}

export const ticketService = new TicketService();
