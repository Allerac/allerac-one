'use server';

import { requireCurrentUser } from '@/app/lib/auth-session';
import {
  ticketService,
  CreateTicketInput,
  ListTicketsInput,
  UpdateTicketInput,
} from '@/app/services/tickets/ticket.service';

export async function createTicket(input: Omit<CreateTicketInput, 'userId'>) {
  const user = await requireCurrentUser();
  return ticketService.create({ ...input, userId: user.id });
}

export async function listTickets(input: Omit<ListTicketsInput, 'userId'> = {}) {
  const user = await requireCurrentUser();
  return ticketService.list({ ...input, userId: user.id });
}

export async function getTicket(id: string) {
  const user = await requireCurrentUser();
  return ticketService.getById(id, user.id);
}

export async function updateTicket(id: string, input: UpdateTicketInput) {
  const user = await requireCurrentUser();
  return ticketService.update(id, user.id, input);
}

export async function getTicketWithEvents(id: string) {
  const user = await requireCurrentUser();
  const ticket = await ticketService.getById(id, user.id);
  if (!ticket) throw new Error('Ticket not found');
  const events = await ticketService.getEvents(id, user.id);
  return { ticket, events };
}

export async function deleteTicket(id: string) {
  const user = await requireCurrentUser();
  return ticketService.delete(id, user.id);
}
