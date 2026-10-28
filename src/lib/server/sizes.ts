// Sizes: free-text "item: size" pairs per person. Not a spoiler, so everyone
// sees them; the person (or whoever is acting as them) changes them.

export const MAX_SIZES_ITEM = 60;
export const MAX_SIZES_SIZE = 100;

/** Values that mean "remove this size" when updating by text. */
const REMOVE = new Set(['', '-', 'none', 'remove', 'delete']);

export interface SizeChange {
	item: string;
	/** null removes the size. */
	size: string | null;
}

/**
 * Reads "item: size" pairs, one per line ("shoes: 9", "hat: remove").
 * Lines without a colon are ignored.
 */
export function parseSizeLines(text: string): SizeChange[] {
	return text
		.split(/\r?\n/)
		.map((line) => {
			const colon = line.indexOf(':');
			if (colon < 0) return null;
			let item = line.slice(0, colon).replace(/\s+/g, ' ').trim().slice(0, MAX_SIZES_ITEM);
			// Texts are often all lower case: "shoes" is saved as "Shoes".
			item = item.charAt(0).toUpperCase() + item.slice(1);
			const size = line
				.slice(colon + 1)
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, MAX_SIZES_SIZE);
			if (!item) return null;
			return { item, size: REMOVE.has(size.toLowerCase()) ? null : size };
		})
		.filter((change) => change !== null);
}

export function canEditSizes(actingId: string, personId: string): boolean {
	return actingId === personId;
}
