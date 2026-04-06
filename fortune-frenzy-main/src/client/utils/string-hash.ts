/**
 * Simple deterministic string → number hash.
 * Produces the same 32-bit signed integer for a given input across all clients.
 */
export function stringHash(str: string): number {
	let hash = 0;
	for (let i = 1; i <= str.size(); i++) {
		const byte = string.byte(str, i) as unknown as number;
		hash = (hash * 31 + byte) % 0x7fffffff;
	}
	return hash;
}
