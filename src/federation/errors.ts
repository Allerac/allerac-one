/** Error with a stable API code and HTTP status, used across federation routes. */
export class FederationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'FederationError';
  }
}

export const federationErrors = {
  invalidUrl: (message = 'Invalid peer URL') => new FederationError('invalid_url', message, 400),
  insecureUrl: () => new FederationError(
    'insecure_url',
    'Peer URL must use https and a public host (set ALLERAC_FEDERATION_ALLOW_INSECURE=true for LAN or development).',
    400,
  ),
  peerUnreachable: (message = 'Peer could not be reached') => new FederationError('peer_unreachable', message, 502),
  peerInvalidResponse: (message = 'Peer returned an invalid response') => new FederationError('peer_invalid_response', message, 502),
  protocolMismatch: (version: string) => new FederationError('protocol_mismatch', `Unsupported federation protocol version: ${version}`, 422),
  peerNotAccepting: () => new FederationError('peer_not_accepting', 'Peer is not accepting pairing requests', 409),
  notAccepting: () => new FederationError('not_found', 'Not found', 404),
  localUrlMissing: () => new FederationError('local_url_missing', 'ALLERAC_PUBLIC_URL must be set to pair with other Units', 409),
  alreadyPaired: () => new FederationError('conflict', 'A pairing with this Unit already exists or is pending', 409),
  selfPairing: () => new FederationError('invalid_url', 'A Unit cannot pair with itself', 400),
  tooManyPending: () => new FederationError('too_many_pending', 'Too many pending pairing requests', 429),
  notFound: () => new FederationError('not_found', 'Peer not found', 404),
  invalidState: (message = 'Peer is not in a state that allows this action') => new FederationError('invalid_state', message, 409),
  expired: () => new FederationError('expired', 'Pairing request expired', 410),
  invalidPairingProof: () => new FederationError('forbidden', 'Pairing could not be verified', 403),
  unknownCapability: (message: string) => new FederationError('validation_error', message, 400),
  capabilityNotGranted: (capability: string) => new FederationError(
    'capability_not_granted', `This Unit was not granted ${capability} by the peer`, 403,
  ),
  peerNotActive: () => new FederationError('peer_not_active', 'Peer is not paired', 409),
  peerAccessDenied: () => new FederationError(
    'peer_access_denied', 'The peer refused the request (the pairing may have been revoked)', 403,
  ),
  agentNotFound: () => new FederationError('not_found', 'Agent not found', 404),
  notPaired: () => new FederationError('forbidden', 'Caller is not a paired Unit', 403),
};
