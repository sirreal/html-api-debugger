/**
 * @param {string} s
 * @return {string}
 */
export function replaceInvisible(s) {
	return s.replace(/[\x00-\x1f\x7f}]/gu, (c) => {
		const charCode = c.charCodeAt(0);
		switch (charCode) {
			// U+007F DELETE -> U+2421 SYMBOL FOR DELETE
			case 0x7f:
				return '\u{2421}';

			// Include a newline with newline replacement
			case 0x0a:
				return '\u{240A}\n';
		}

		// There's a nice Control Pictures Block at 0x2400 offset for the matched range
		return String.fromCharCode(charCode + 0x2400);
	});
}
