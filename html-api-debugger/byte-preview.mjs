/**
 * Own exact-byte iframe document URLs.
 */
export class ByteDocumentPreview {
	/**
	 * @param {{src: string}} iframe Iframe-like navigation target.
	 * @param {{createObjectURL: (blob: Blob) => string, revokeObjectURL: (url: string) => void}} [urlApi=URL] Object URL API.
	 * @param {typeof Blob} [BlobConstructor=Blob] Blob constructor.
	 */
	constructor( iframe, urlApi = URL, BlobConstructor = Blob ) {
		this.iframe = iframe;
		this.urlApi = urlApi;
		this.BlobConstructor = BlobConstructor;
		/** @type {string|null} */
		this.currentUrl = null;
	}

	/**
	 * Navigate to a new UTF-8 HTML document made from exact bytes.
	 *
	 * @param {Uint8Array} bytes Exact document bytes.
	 * @returns {string} New object URL.
	 */
	load( bytes ) {
		if ( ! ( bytes instanceof Uint8Array ) ) {
			throw new TypeError( 'Expected a Uint8Array.' );
		}

		const buffer = new ArrayBuffer( bytes.byteLength );
		new Uint8Array( buffer ).set( bytes );
		const blob = new this.BlobConstructor( [ buffer ], {
			type: 'text/html;charset=utf-8',
		} );
		const nextUrl = this.urlApi.createObjectURL( blob );

		try {
			this.iframe.src = nextUrl;
		} catch ( error ) {
			this.urlApi.revokeObjectURL( nextUrl );
			throw error;
		}

		const supersededUrl = this.currentUrl;
		this.currentUrl = nextUrl;
		if ( supersededUrl !== null ) {
			this.urlApi.revokeObjectURL( supersededUrl );
		}

		return nextUrl;
	}

	/**
	 * Determine whether a load event belongs to the current document.
	 *
	 * @param {string} url Loaded URL.
	 * @returns {boolean} Whether the URL is current.
	 */
	isCurrent( url ) {
		return this.currentUrl !== null && url === this.currentUrl;
	}

	/** Revoke the final owned URL. Safe to call repeatedly. */
	dispose() {
		if ( this.currentUrl === null ) {
			return;
		}
		const finalUrl = this.currentUrl;
		this.currentUrl = null;
		this.urlApi.revokeObjectURL( finalUrl );
	}
}

/**
 * Split bytes at an HTML API byte span.
 *
 * @param {Uint8Array} bytes Exact source bytes.
 * @param {number} start Byte offset.
 * @param {number} length Byte length.
 * @returns {{before: Uint8Array, current: Uint8Array, after: Uint8Array}} Byte slices.
 */
export function splitByteSpan( bytes, start, length ) {
	if ( ! ( bytes instanceof Uint8Array ) ) {
		throw new TypeError( 'Expected a Uint8Array.' );
	}
	if (
		! Number.isFinite( start ) ||
		! Number.isInteger( start ) ||
		! Number.isFinite( length ) ||
		! Number.isInteger( length )
	) {
		throw new TypeError( 'Byte span offsets must be finite integers.' );
	}
	if ( start < 0 || length < 0 || start > bytes.length - length ) {
		throw new RangeError( 'Byte span falls outside the source bytes.' );
	}

	const end = start + length;
	return {
		before: bytes.subarray( 0, start ),
		current: bytes.subarray( start, end ),
		after: bytes.subarray( end ),
	};
}

/**
 * Resolve the element whose native `innerHTML` setter parses a fragment.
 *
 * The parsed context document usually exposes its authored final element via
 * the tree. Empty HEAD, BODY, and HTML contexts need the original authored
 * context projection to distinguish the browser-created empty elements.
 *
 * @param {Document} document Parsed exact-byte context document.
 * @param {string} contextText Safe Unicode projection of the context bytes.
 * @returns {Element} Native fragment parsing context.
 */
export function resolveFragmentTarget( document, contextText ) {
	if ( typeof contextText !== 'string' ) {
		throw new TypeError( 'Fragment context text must be a string.' );
	}

	const authored = findAuthoredDocumentRoots( contextText );
	const body = document.body;
	const head = document.head;
	if ( body?.localName === 'frameset' ) {
		return lastElementDescendant( body );
	}
	if ( body !== null && ( authored.body || body.hasChildNodes() ) ) {
		return lastElementDescendant( body );
	}
	if ( head !== null && ( authored.head || head.hasChildNodes() ) ) {
		return lastElementDescendant( head );
	}
	return document.documentElement;
}

const ASCII_WHITESPACE = new Set( [ '\t', '\n', '\f', '\r', ' ' ] );
const RAW_TEXT_ELEMENTS = new Set( [
	'iframe',
	'noembed',
	'noframes',
	'noscript',
	'style',
	'xmp',
] );
const RCDATA_ELEMENTS = new Set( [ 'textarea', 'title' ] );

/** @param {string} character */
function isAsciiAlpha( character ) {
	return /^[A-Za-z]$/u.test( character );
}

/** @param {string} character */
function isTagDelimiter( character ) {
	return character === '>' || character === '/' || ASCII_WHITESPACE.has( character );
}

/**
 * Read a start or end tag through its closing angle bracket.
 *
 * @param {string} source Source text.
 * @param {number} position Position immediately after `<` or `</`.
 * @returns {{name: string, end: number}|null} Token boundary, if complete.
 */
function readTag( source, position ) {
	if ( ! isAsciiAlpha( source[ position ] ?? '' ) ) {
		return null;
	}

	const nameStart = position;
	while (
		position < source.length &&
		! isTagDelimiter( source.charAt( position ) )
	) {
		++position;
	}
	const name = source.slice( nameStart, position ).toLowerCase();
	let state = 'before-attribute-name';
	while ( position < source.length ) {
		const character = source.charAt( position );
		switch ( state ) {
			case 'before-attribute-name':
				if ( ASCII_WHITESPACE.has( character ) ) {
					++position;
				} else if ( character === '/' ) {
					state = 'self-closing';
					++position;
				} else if ( character === '>' ) {
					return { name, end: position + 1 };
				} else if ( character === '=' ) {
					state = 'attribute-name';
					++position;
				} else {
					state = 'attribute-name';
				}
				break;
			case 'attribute-name':
				if ( ASCII_WHITESPACE.has( character ) ) {
					state = 'after-attribute-name';
					++position;
				} else if ( character === '/' ) {
					state = 'self-closing';
					++position;
				} else if ( character === '=' ) {
					state = 'before-attribute-value';
					++position;
				} else if ( character === '>' ) {
					return { name, end: position + 1 };
				} else {
					++position;
				}
				break;
			case 'after-attribute-name':
				if ( ASCII_WHITESPACE.has( character ) ) {
					++position;
				} else if ( character === '/' ) {
					state = 'self-closing';
					++position;
				} else if ( character === '=' ) {
					state = 'before-attribute-value';
					++position;
				} else if ( character === '>' ) {
					return { name, end: position + 1 };
				} else {
					state = 'attribute-name';
				}
				break;
			case 'before-attribute-value':
				if ( ASCII_WHITESPACE.has( character ) ) {
					++position;
				} else if ( character === '"' ) {
					state = 'double-quoted-attribute-value';
					++position;
				} else if ( character === "'" ) {
					state = 'single-quoted-attribute-value';
					++position;
				} else if ( character === '>' ) {
					return { name, end: position + 1 };
				} else {
					state = 'unquoted-attribute-value';
				}
				break;
			case 'double-quoted-attribute-value':
				if ( character === '"' ) {
					state = 'after-quoted-attribute-value';
				}
				++position;
				break;
			case 'single-quoted-attribute-value':
				if ( character === "'" ) {
					state = 'after-quoted-attribute-value';
				}
				++position;
				break;
			case 'unquoted-attribute-value':
				if ( ASCII_WHITESPACE.has( character ) ) {
					state = 'before-attribute-name';
					++position;
				} else if ( character === '>' ) {
					return { name, end: position + 1 };
				} else {
					++position;
				}
				break;
			case 'after-quoted-attribute-value':
				if ( ASCII_WHITESPACE.has( character ) ) {
					state = 'before-attribute-name';
					++position;
				} else if ( character === '/' ) {
					state = 'self-closing';
					++position;
				} else if ( character === '>' ) {
					return { name, end: position + 1 };
				} else {
					state = 'before-attribute-name';
				}
				break;
			case 'self-closing':
				if ( character === '>' ) {
					return { name, end: position + 1 };
				}
				state = 'before-attribute-name';
				break;
		}
	}
	return null;
}

/** @param {string} source @param {number} position */
function consumeBogusComment( source, position ) {
	const end = source.indexOf( '>', position );
	return end === -1 ? source.length : end + 1;
}

/**
 * Consume an HTML comment using the tokenizer's abrupt and nested end states.
 *
 * @param {string} source Source text.
 * @param {number} position Position immediately after `<!--`.
 */
function consumeComment( source, position ) {
	let state = 'start';
	while ( position < source.length ) {
		const character = source.charAt( position );
		switch ( state ) {
			case 'start':
				if ( character === '-' ) {
					state = 'start-dash';
					++position;
				} else if ( character === '>' ) {
					return position + 1;
				} else {
					state = 'comment';
				}
				break;
			case 'start-dash':
				if ( character === '-' ) {
					state = 'end';
					++position;
				} else if ( character === '>' ) {
					return position + 1;
				} else {
					state = 'comment';
				}
				break;
			case 'comment':
				if ( character === '<' ) {
					state = 'less-than';
				} else if ( character === '-' ) {
					state = 'end-dash';
				}
				++position;
				break;
			case 'less-than':
				if ( character === '!' ) {
					state = 'less-than-bang';
					++position;
				} else if ( character === '<' ) {
					++position;
				} else {
					state = 'comment';
				}
				break;
			case 'less-than-bang':
				if ( character === '-' ) {
					state = 'less-than-bang-dash';
					++position;
				} else {
					state = 'comment';
				}
				break;
			case 'less-than-bang-dash':
				if ( character === '-' ) {
					state = 'less-than-bang-dash-dash';
					++position;
				} else {
					state = 'end-dash';
				}
				break;
			case 'less-than-bang-dash-dash':
				state = 'end';
				break;
			case 'end-dash':
				if ( character === '-' ) {
					state = 'end';
					++position;
				} else {
					state = 'comment';
				}
				break;
			case 'end':
				if ( character === '>' ) {
					return position + 1;
				}
				if ( character === '!' ) {
					state = 'end-bang';
					++position;
				} else if ( character === '-' ) {
					++position;
				} else {
					state = 'comment';
				}
				break;
			case 'end-bang':
				if ( character === '>' ) {
					return position + 1;
				}
				if ( character === '-' ) {
					state = 'end-dash';
					++position;
				} else {
					state = 'comment';
				}
				break;
		}
	}
	return source.length;
}

/**
 * Consume a DOCTYPE without treating quoted identifiers as markup.
 *
 * @param {string} source Source text.
 * @param {number} position Position immediately after `DOCTYPE`.
 */
function consumeDoctype( source, position ) {
	let state = 'before-name';
	while ( position < source.length ) {
		const character = source.charAt( position );
		if ( state === 'public-double' || state === 'system-double' ) {
			if ( character === '"' ) {
				state = state === 'public-double' ? 'after-public' : 'after-system';
			} else if ( character === '>' ) {
				return position + 1;
			}
			++position;
			continue;
		}
		if ( state === 'public-single' || state === 'system-single' ) {
			if ( character === "'" ) {
				state = state === 'public-single' ? 'after-public' : 'after-system';
			} else if ( character === '>' ) {
				return position + 1;
			}
			++position;
			continue;
		}
		if ( state === 'bogus' ) {
			return consumeBogusComment( source, position );
		}
		if ( character === '>' ) {
			return position + 1;
		}

		switch ( state ) {
			case 'before-name':
				if ( ASCII_WHITESPACE.has( character ) ) {
					++position;
				} else {
					state = 'name';
				}
				break;
			case 'name':
				if ( ASCII_WHITESPACE.has( character ) ) {
					state = 'after-name';
				}
				++position;
				break;
			case 'after-name': {
				if ( ASCII_WHITESPACE.has( character ) ) {
					++position;
					break;
				}
				const keyword = source.slice( position, position + 6 ).toLowerCase();
				if ( keyword === 'public' ) {
					position += 6;
					state = 'after-public-keyword';
				} else if ( keyword === 'system' ) {
					position += 6;
					state = 'after-system-keyword';
				} else {
					state = 'bogus';
				}
				break;
			}
			case 'after-public-keyword':
			case 'before-public':
				if ( ASCII_WHITESPACE.has( character ) ) {
					state = 'before-public';
					++position;
				} else if ( character === '"' ) {
					state = 'public-double';
					++position;
				} else if ( character === "'" ) {
					state = 'public-single';
					++position;
				} else {
					state = 'bogus';
				}
				break;
			case 'after-public':
			case 'between-identifiers':
				if ( ASCII_WHITESPACE.has( character ) ) {
					state = 'between-identifiers';
					++position;
				} else if ( character === '"' ) {
					state = 'system-double';
					++position;
				} else if ( character === "'" ) {
					state = 'system-single';
					++position;
				} else {
					state = 'bogus';
				}
				break;
			case 'after-system-keyword':
			case 'before-system':
				if ( ASCII_WHITESPACE.has( character ) ) {
					state = 'before-system';
					++position;
				} else if ( character === '"' ) {
					state = 'system-double';
					++position;
				} else if ( character === "'" ) {
					state = 'system-single';
					++position;
				} else {
					state = 'bogus';
				}
				break;
			case 'after-system':
				if ( ASCII_WHITESPACE.has( character ) ) {
					++position;
				} else {
					state = 'bogus';
				}
				break;
		}
	}
	return source.length;
}

/** @param {string} source @param {number} position @param {string} name */
function consumeRawText( source, position, name ) {
	while ( position < source.length ) {
		const opening = source.indexOf( '</', position );
		if ( opening === -1 ) {
			return source.length;
		}
		const nameStart = opening + 2;
		const nameEnd = nameStart + name.length;
		const appropriatePrefix =
			source.slice( nameStart, nameEnd ).toLowerCase() === name &&
			( nameEnd === source.length || isTagDelimiter( source.charAt( nameEnd ) ) );
		const token = readTag( source, nameStart );
		if ( token !== null && token.name === name ) {
			return token.end;
		}
		if ( token === null && appropriatePrefix ) {
			return source.length;
		}
		position = opening + 2;
	}
	return source.length;
}

/**
 * Consume SCRIPT using the escaped and double-escaped tokenizer states.
 *
 * @param {string} source Source text.
 * @param {number} position Position after the SCRIPT start tag.
 */
function consumeScriptData( source, position ) {
	let state = 'data';
	let temporary = '';
	while ( position < source.length ) {
		const character = source.charAt( position );
		switch ( state ) {
			case 'data':
				if ( character === '<' ) {
					state = 'less-than';
				}
				++position;
				break;
			case 'less-than':
				if ( character === '/' ) {
					temporary = '';
					state = 'end-tag-open';
					++position;
				} else if ( character === '!' ) {
					state = 'escape-start';
					++position;
				} else {
					state = 'data';
				}
				break;
			case 'end-tag-open':
				if ( isAsciiAlpha( character ) ) {
					temporary = character.toLowerCase();
					state = 'end-tag-name';
					++position;
				} else {
					state = 'data';
				}
				break;
			case 'end-tag-name':
				if ( isAsciiAlpha( character ) ) {
					temporary += character.toLowerCase();
					++position;
				} else if ( temporary === 'script' && isTagDelimiter( character ) ) {
					const token = readTag( source, position - temporary.length );
					return token?.end ?? source.length;
				} else {
					state = 'data';
				}
				break;
			case 'escape-start':
				if ( character === '-' ) {
					state = 'escape-start-dash';
					++position;
				} else {
					state = 'data';
				}
				break;
			case 'escape-start-dash':
				if ( character === '-' ) {
					state = 'escaped-dash-dash';
					++position;
				} else {
					state = 'data';
				}
				break;
			case 'escaped':
				if ( character === '-' ) {
					state = 'escaped-dash';
				} else if ( character === '<' ) {
					state = 'escaped-less-than';
				}
				++position;
				break;
			case 'escaped-dash':
				if ( character === '-' ) {
					state = 'escaped-dash-dash';
					++position;
				} else if ( character === '<' ) {
					state = 'escaped-less-than';
					++position;
				} else {
					state = 'escaped';
					++position;
				}
				break;
			case 'escaped-dash-dash':
				if ( character === '<' ) {
					state = 'escaped-less-than';
				} else if ( character === '>' ) {
					state = 'data';
				} else if ( character !== '-' ) {
					state = 'escaped';
				}
				++position;
				break;
			case 'escaped-less-than':
				if ( character === '/' ) {
					temporary = '';
					state = 'escaped-end-tag-open';
					++position;
				} else if ( isAsciiAlpha( character ) ) {
					temporary = character.toLowerCase();
					state = 'double-escape-start';
					++position;
				} else {
					state = 'escaped';
				}
				break;
			case 'escaped-end-tag-open':
				if ( isAsciiAlpha( character ) ) {
					temporary = character.toLowerCase();
					state = 'escaped-end-tag-name';
					++position;
				} else {
					state = 'escaped';
				}
				break;
			case 'escaped-end-tag-name':
				if ( isAsciiAlpha( character ) ) {
					temporary += character.toLowerCase();
					++position;
				} else if ( temporary === 'script' && isTagDelimiter( character ) ) {
					const token = readTag( source, position - temporary.length );
					return token?.end ?? source.length;
				} else {
					state = 'escaped';
				}
				break;
			case 'double-escape-start':
				if ( isAsciiAlpha( character ) ) {
					temporary += character.toLowerCase();
					++position;
				} else if ( isTagDelimiter( character ) ) {
					state = temporary === 'script' ? 'double-escaped' : 'escaped';
					++position;
				} else {
					state = 'escaped';
				}
				break;
			case 'double-escaped':
				if ( character === '-' ) {
					state = 'double-escaped-dash';
				} else if ( character === '<' ) {
					state = 'double-escaped-less-than';
				}
				++position;
				break;
			case 'double-escaped-dash':
				if ( character === '-' ) {
					state = 'double-escaped-dash-dash';
				} else if ( character === '<' ) {
					state = 'double-escaped-less-than';
				} else {
					state = 'double-escaped';
				}
				++position;
				break;
			case 'double-escaped-dash-dash':
				if ( character === '<' ) {
					state = 'double-escaped-less-than';
				} else if ( character === '>' ) {
					state = 'data';
				} else if ( character !== '-' ) {
					state = 'double-escaped';
				}
				++position;
				break;
			case 'double-escaped-less-than':
				if ( character === '/' ) {
					temporary = '';
					state = 'double-escape-end';
					++position;
				} else {
					state = 'double-escaped';
				}
				break;
			case 'double-escape-end':
				if ( isAsciiAlpha( character ) ) {
					temporary += character.toLowerCase();
					++position;
				} else if ( isTagDelimiter( character ) ) {
					state = temporary === 'script' ? 'escaped' : 'double-escaped';
					++position;
				} else {
					state = 'double-escaped';
				}
				break;
		}
	}
	return source.length;
}

/** @param {string} source */
function findAuthoredDocumentRoots( source ) {
	let position = 0;
	let templateDepth = 0;
	let body = false;
	let head = false;
	while ( position < source.length ) {
		const opening = source.indexOf( '<', position );
		if ( opening === -1 ) {
			break;
		}
		position = opening;
		if ( source.startsWith( '<!--', position ) ) {
			position = consumeComment( source, position + 4 );
			continue;
		}
		if ( source.slice( position + 2, position + 9 ).toLowerCase() === 'doctype' ) {
			position = consumeDoctype( source, position + 9 );
			continue;
		}
		if ( source.startsWith( '<!', position ) || source.startsWith( '<?', position ) ) {
			position = consumeBogusComment( source, position + 2 );
			continue;
		}

		const closing = source.startsWith( '</', position );
		const token = readTag( source, position + ( closing ? 2 : 1 ) );
		if ( token === null ) {
			++position;
			continue;
		}
		position = token.end;
		if ( closing ) {
			if ( token.name === 'template' && templateDepth > 0 ) {
				--templateDepth;
			}
			continue;
		}

		if ( templateDepth === 0 ) {
			body ||= token.name === 'body';
			head ||= token.name === 'head';
		}
		if ( token.name === 'template' ) {
			++templateDepth;
		} else if ( token.name === 'script' ) {
			position = consumeScriptData( source, position );
		} else if ( RAW_TEXT_ELEMENTS.has( token.name ) || RCDATA_ELEMENTS.has( token.name ) ) {
			position = consumeRawText( source, position, token.name );
		} else if ( token.name === 'plaintext' ) {
			break;
		}
	}
	return { body, head };
}

/** @param {Element} element */
function lastElementDescendant( element ) {
	let last = element;
	const templateElement = /** @type {Element & {content?: DocumentFragment}} */ (
		element
	);
	const children =
		element.localName === 'template' && templateElement.content !== undefined
			? templateElement.content.children
			: element.children;
	for ( const child of children ) {
		last = lastElementDescendant( child );
	}
	return last;
}
