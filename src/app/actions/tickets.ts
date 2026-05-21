'use server';

import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import {
  ticketService,
  CreateTicketInput,
  ListTicketsInput,
  UpdateTicketInput,
} from '@/app/services/tickets/ticket.service';

const authService = new AuthService();

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) throw new Error('Unauthorized');
  const user = await authService.validateSession(sessionToken);
  if (!user) throw new Error('Unauthorized');
  return user;
}

export async function createTicket(input: Omit<CreateTicketInput, 'userId'>) {
  const user = await getAuthenticatedUser();
  return ticketService.create({ ...input, userId: user.id });
}

export async function listTickets(input: Omit<ListTicketsInput, 'userId'> = {}) {
  const user = await getAuthenticatedUser();
  return ticketService.list({ ...input, userId: user.id });
}

export async function getTicket(id: string) {
  const user = await getAuthenticatedUser();
  return ticketService.getById(id, user.id);
}

export async function updateTicket(id: string, input: UpdateTicketInput) {
  const user = await getAuthenticatedUser();
  return ticketService.update(id, user.id, input);
}

export async function getTicketWithEvents(id: string) {
  const user = await getAuthenticatedUser();
  const ticket = await ticketService.getById(id, user.id);
  if (!ticket) throw new Error('Ticket not found');
  const events = await ticketService.getEvents(id);
  return { ticket, events };
}
