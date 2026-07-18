let currentNonce: string | undefined;

export function setCspNonce(nonce: string | undefined) {
  currentNonce = nonce;
}

export function getCspNonce(): string | undefined {
  return currentNonce;
}
