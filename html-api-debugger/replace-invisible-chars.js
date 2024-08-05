/**
 * @param {string} s
 * @return {string}
 */
export function replaceInvisible(s) {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: These are exactly the characters we're looking for 🤪
	return s.replace(/[\x00-\x1F\x7F]/gu, (c) => {
		const codePoint = /** @type {number} */ (c.codePointAt(0));
		switch (codePoint) {
			// U+007F DELETE -> U+2421 SYMBOL FOR DELETE
			case 0x7f:
				return '\u{2421}';

			// Include a newline with newline replacement
			case 0x0a:
				return '\u{240A}\n';
		}

		// There's a nice Control Pictures Block at 0x2400 offset for the matched range
		return String.fromCodePoint(codePoint + 0x2400);
	});
}
