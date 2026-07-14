/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { GET as listMessages } from '@/app/api/v1/email/messages/route';
import { GET as getMessage } from '@/app/api/v1/email/message/route';
import { POST as sendEmail } from '@/app/api/v1/email/send/route';
import {
  EmailAccountNotFoundError,
  loadEmailAccountForUser,
} from '@/app/services/email/email-account.service';
import { ImapService } from '@/app/services/email/imap.service';
import { SmtpService } from '@/app/services/email/smtp.service';

var mockListMessages = jest.fn();
var mockGetMessage = jest.fn();
var mockSendEmail = jest.fn();

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentUser: jest.fn(),
    assertDomainAccess: jest.fn(),
  };
});

jest.mock('@/app/services/email/email-account.service', () => {
  class MockEmailAccountNotFoundError extends Error {}
  return {
    EmailAccountNotFoundError: MockEmailAccountNotFoundError,
    loadEmailAccountForUser: jest.fn(),
  };
});

jest.mock('@/app/services/email/imap.service', () => ({
  ImapService: jest.fn().mockImplementation(() => ({
    listMessages: mockListMessages,
    getMessage: mockGetMessage,
  })),
}));

jest.mock('@/app/services/email/smtp.service', () => ({
  SmtpService: jest.fn().mockImplementation(() => ({
    send: mockSendEmail,
  })),
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockLoadEmailAccountForUser = jest.mocked(loadEmailAccountForUser);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const account = {
  id: 'account-id',
  label: 'User',
  email_address: 'user@example.com',
  imap_host: 'imap.example.com',
  imap_port: 993,
  imap_secure: true,
  smtp_host: 'smtp.example.com',
  smtp_port: 465,
  smtp_secure: true,
  username: 'user@example.com',
  password: 'secret',
};

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Control API v1 email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListMessages.mockReset();
    mockGetMessage.mockReset();
    mockSendEmail.mockReset();
    mockRequireCurrentUser.mockResolvedValue(user);
    mockLoadEmailAccountForUser.mockResolvedValue(account);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await listMessages(new Request('http://localhost/api/v1/email/messages?accountId=account-id'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized' } });
  });

  it('lists messages for an owned account', async () => {
    mockListMessages.mockResolvedValueOnce([{ uid: 1, subject: 'Hello' }]);

    const response = await listMessages(new Request('http://localhost/api/v1/email/messages?accountId=account-id&sinceUid=10'));

    expect(response.status).toBe(200);
    expect(mockLoadEmailAccountForUser).toHaveBeenCalledWith('account-id', user.id);
    expect(ImapService).toHaveBeenCalled();
    expect(mockListMessages).toHaveBeenCalledWith(account, 30, 10);
    expect(await response.json()).toEqual({ data: { messages: [{ uid: 1, subject: 'Hello' }] } });
  });

  it('validates list query', async () => {
    const response = await listMessages(new Request('http://localhost/api/v1/email/messages'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('gets a message by uid', async () => {
    mockGetMessage.mockResolvedValueOnce({ uid: 7, subject: 'Hello', bodyText: 'Body' });

    const response = await getMessage(new Request('http://localhost/api/v1/email/message?accountId=account-id&uid=7'));

    expect(response.status).toBe(200);
    expect(mockGetMessage).toHaveBeenCalledWith(account, 7);
    expect(await response.json()).toEqual({ data: { message: { uid: 7, subject: 'Hello', bodyText: 'Body' } } });
  });

  it('returns 404 when message is missing', async () => {
    mockGetMessage.mockResolvedValueOnce(null);

    const response = await getMessage(new Request('http://localhost/api/v1/email/message?accountId=account-id&uid=7'));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('sends email from an owned account', async () => {
    mockSendEmail.mockResolvedValueOnce(undefined);

    const response = await sendEmail(jsonRequest('http://localhost/api/v1/email/send', 'POST', {
      accountId: 'account-id',
      to: 'recipient@example.com',
      subject: 'Hello',
      body: 'Body',
    }));

    expect(response.status).toBe(200);
    expect(SmtpService).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith({
      account,
      to: 'recipient@example.com',
      subject: 'Hello',
      body: 'Body',
    });
    expect(await response.json()).toEqual({ data: { sent: true } });
  });

  it('validates send payload', async () => {
    const response = await sendEmail(jsonRequest('http://localhost/api/v1/email/send', 'POST', { accountId: 'account-id' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 404 when account is missing', async () => {
    mockLoadEmailAccountForUser.mockRejectedValueOnce(new EmailAccountNotFoundError());

    const response = await listMessages(new Request('http://localhost/api/v1/email/messages?accountId=missing'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'not_found', message: 'Email account not found' } });
  });
});
