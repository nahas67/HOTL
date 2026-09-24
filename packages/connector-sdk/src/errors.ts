export type ConnectorErrorCode =
  | 'INVALID_CONFIGURATION' | 'INVALID_REQUEST' | 'UNSAFE_DESTINATION'
  | 'AUTHENTICATION_FAILED' | 'AUTHORIZATION_FAILED' | 'RATE_LIMITED'
  | 'TIMEOUT' | 'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_REJECTED'
  | 'INVALID_RESPONSE' | 'RESPONSE_TOO_LARGE' | 'CAPABILITY_UNAVAILABLE'
  | 'INVALID_WEBHOOK' | 'RESOURCE_NOT_FOUND' | 'API_VERSION_MISMATCH';

const messages: Record<ConnectorErrorCode, string> = {
  INVALID_CONFIGURATION: 'The connector configuration is invalid.',
  INVALID_REQUEST: 'The connector request is invalid.',
  UNSAFE_DESTINATION: 'The connector destination is not an approved public HTTPS host.',
  AUTHENTICATION_FAILED: 'The provider rejected the credentials. Reconnect this integration.',
  AUTHORIZATION_FAILED: 'The provider denied access. Check the installed permissions.',
  RATE_LIMITED: 'The provider rate limit was reached. Retry later.',
  TIMEOUT: 'The provider request timed out.',
  UPSTREAM_UNAVAILABLE: 'The provider is temporarily unavailable.',
  UPSTREAM_REJECTED: 'The provider rejected the request.',
  INVALID_RESPONSE: 'The provider returned an unsupported response.',
  RESPONSE_TOO_LARGE: 'The provider response exceeded the allowed size.',
  CAPABILITY_UNAVAILABLE: 'This connector does not implement the requested capability.',
  INVALID_WEBHOOK: 'The webhook signature is invalid.',
  RESOURCE_NOT_FOUND: 'The requested provider resource was not found.',
  API_VERSION_MISMATCH: 'The provider served a different API version. Update the connector before syncing.',
};
/** Never includes provider response text, request URLs, headers, or error causes. */
export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  constructor(code: ConnectorErrorCode, options: { status?: number; retryable?: boolean } = {}) {
    super(messages[code]);
    this.name = 'ConnectorError';
    this.code = code;
    this.retryable = options.retryable ?? ['RATE_LIMITED', 'TIMEOUT', 'UPSTREAM_UNAVAILABLE'].includes(code);
    this.status = options.status;
  }
  toJSON() { return { code: this.code, message: this.message, retryable: this.retryable, status: this.status }; }
}
export function normalizeConnectorError(error: unknown): ConnectorError {
  return error instanceof ConnectorError ? error : new ConnectorError('UPSTREAM_UNAVAILABLE');
}
