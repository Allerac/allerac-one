import type { FederationClient } from '@/federation/federation-client';
import { FederationError } from '@/federation/errors';

const MAX_QUESTION_CHARS = 4_000;

/** Chat tools backed by the shared FederationClient. */
export function buildFederationTools(client: FederationClient, userId: string) {
  const ctx = { initiatedByUserId: userId };

  async function listPeerAgents(args: { peer?: string }) {
    const peers = await client.listActivePeers();
    const selected = args.peer
      ? peers.filter(peer => peer.unitName.toLowerCase() === args.peer!.trim().toLowerCase())
      : peers;
    if (args.peer && selected.length === 0) {
      return { error: `No paired Unit named "${args.peer}".`, pairedUnits: peers.map(peer => peer.unitName) };
    }
    const units = [];
    for (const peer of selected) {
      if (!peer.capabilities.includes('federation.agents.list')) {
        units.push({ unit: peer.unitName, agents: [], note: 'This Unit did not grant agent listing.' });
        continue;
      }
      try {
        const { agents, unit } = await client.listAgentsWithUnit(peer.id, ctx);
        units.push({
          unit: peer.unitName,
          displayName: unit?.displayName ?? peer.displayName ?? peer.unitName,
          role: unit?.role ?? null,
          description: unit?.description ?? null,
          tags: unit?.tags ?? [],
          canAsk: peer.capabilities.includes('federation.agents.ask'),
          agents,
        });
      } catch (error) {
        units.push({ unit: peer.unitName, agents: [], error: describe(error) });
      }
    }
    return { units };
  }

  async function askPeerAgent(args: { peer?: string; agent?: string; question?: string }) {
    if (!args.peer || !args.agent || !args.question?.trim()) {
      return { error: 'peer, agent and question are required.' };
    }
    if (args.question.length > MAX_QUESTION_CHARS) {
      return { error: `Question is too long (max ${MAX_QUESTION_CHARS} characters).` };
    }
    const peer = await client.findActivePeer(args.peer);
    if (!peer) {
      const peers = await client.listActivePeers();
      return { error: `No paired Unit named "${args.peer}".`, pairedUnits: peers.map(item => item.unitName) };
    }
    try {
      const result = await client.askAgent(peer.id, args.agent, args.question.trim(), ctx);
      return { unit: peer.unitName, agent: args.agent, answer: result.answer, truncated: result.truncated };
    } catch (error) {
      return { unit: peer.unitName, agent: args.agent, error: describe(error) };
    }
  }

  return { listPeerAgents, askPeerAgent };
}

function describe(error: unknown): string {
  if (error instanceof FederationError) return error.message;
  return 'The request to the paired Unit failed.';
}
