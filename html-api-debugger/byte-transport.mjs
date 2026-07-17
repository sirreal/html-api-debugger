const BASE64URL_ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const BYTE_ENVELOPE_KEY = '__bytesBase64url';

/**
 * Encode bytes as canonical unpadded base64url.
 *
 * @param {Uint8Array} bytes Bytes to encode.
 * @returns {string} Canonical base64url.
 */
export function encodeBase64url( bytes ) {
	if ( ! ( bytes instanceof Uint8Array ) ) {
		throw new TypeError( 'Expected a Uint8Array.' );
	}

	let encoded = '';
	for ( let offset = 0; offset < bytes.length; offset += 3 ) {
		const first = /** @type {number} */ ( bytes[ offset ] );
		const second = bytes[ offset + 1 ];
		const third = bytes[ offset + 2 ];

		encoded += BASE64URL_ALPHABET[ first >> 2 ];
		encoded += BASE64URL_ALPHABET[
			( ( first & 0x03 ) << 4 ) | ( ( second ?? 0 ) >> 4 )
		];
		if ( second !== undefined ) {
			encoded += BASE64URL_ALPHABET[
				( ( second & 0x0f ) << 2 ) | ( ( third ?? 0 ) >> 6 )
			];
		}
		if ( third !== undefined ) {
			encoded += BASE64URL_ALPHABET[ third & 0x3f ];
		}
	}

	return encoded;
}

/**
 * Decode canonical unpadded base64url.
 *
 * @param {string} encoded Canonical base64url.
 * @returns {Uint8Array} Decoded bytes.
 */
export function decodeBase64url( encoded ) {
	if (
		typeof encoded !== 'string' ||
		! /^[A-Za-z0-9_-]*$/u.test( encoded ) ||
		encoded.length % 4 === 1
	) {
		throw new TypeError( 'Expected canonical unpadded base64url.' );
	}

	const bytes = new Uint8Array( Math.floor( ( encoded.length * 6 ) / 8 ) );
	let byteOffset = 0;
	for ( let offset = 0; offset < encoded.length; offset += 4 ) {
		const first = decodeBase64urlCharacter( encoded.charCodeAt( offset ) );
		const second = decodeBase64urlCharacter( encoded.charCodeAt( offset + 1 ) );
		const third =
			offset + 2 < encoded.length
				? decodeBase64urlCharacter( encoded.charCodeAt( offset + 2 ) )
				: 0;
		const fourth =
			offset + 3 < encoded.length
				? decodeBase64urlCharacter( encoded.charCodeAt( offset + 3 ) )
				: 0;

		bytes[ byteOffset++ ] = ( first << 2 ) | ( second >> 4 );
		if ( offset + 2 < encoded.length ) {
			bytes[ byteOffset++ ] = ( second << 4 ) | ( third >> 2 );
		}
		if ( offset + 3 < encoded.length ) {
			bytes[ byteOffset++ ] = ( third << 6 ) | fourth;
		}
	}

	if ( encodeBase64url( bytes ) !== encoded ) {
		throw new TypeError( 'Expected canonical unpadded base64url.' );
	}

	return bytes;
}

/**
 * Encode Unicode text as UTF-8 bytes.
 *
 * @param {string} text Unicode text.
 * @returns {Uint8Array} UTF-8 bytes.
 */
export function encodeUtf8( text ) {
	return new TextEncoder().encode( text );
}

/**
 * Decode valid UTF-8 without consuming a leading byte-order mark.
 *
 * @param {Uint8Array} bytes UTF-8 bytes.
 * @returns {string} Unicode text.
 */
export function decodeUtf8( bytes ) {
	return new TextDecoder( 'utf-8', {
		fatal: true,
		ignoreBOM: true,
	} ).decode( bytes );
}

/**
 * Project arbitrary bytes to Unicode without consuming a leading byte-order mark.
 *
 * Invalid UTF-8 is replaced by the Encoding Standard's replacement algorithm.
 *
 * @param {Uint8Array} bytes Arbitrary bytes.
 * @returns {string} A potentially lossy Unicode projection.
 */
export function projectUtf8( bytes ) {
	return new TextDecoder( 'utf-8', { ignoreBOM: true } ).decode( bytes );
}

/**
 * Determine whether a complete byte sequence is valid UTF-8.
 *
 * @param {Uint8Array} bytes Bytes to validate.
 * @returns {boolean} Whether the bytes are valid UTF-8.
 */
export function isValidUtf8( bytes ) {
	try {
		decodeUtf8( bytes );
		return true;
	} catch {
		return false;
	}
}

/**
 * Determine whether a value is an exact byte envelope.
 *
 * @param {unknown} value Value to inspect.
 * @returns {value is {__bytesBase64url: string}} Whether the value is an envelope.
 */
export function isByteEnvelope( value ) {
	if ( ! isPlainObject( value ) ) {
		return false;
	}

	const keys = Object.keys( value );
	return (
		keys.length === 1 &&
		keys[ 0 ] === BYTE_ENVELOPE_KEY &&
		typeof value[ BYTE_ENVELOPE_KEY ] === 'string'
	);
}

/**
 * Create a Unicode projection of a byte-enveloped REST response.
 *
 * The source response is not mutated. Bare strings and malformed reserved
 * markers are rejected so a server cannot silently violate the wire contract.
 *
 * @param {unknown} value Byte-enveloped JSON value.
 * @returns {unknown} Deep Unicode projection.
 */
export function projectResponseStrings( value ) {
	if ( typeof value === 'string' ) {
		throw new TypeError( 'Response strings must use byte envelopes.' );
	}

	if ( value === null || typeof value === 'boolean' ) {
		return value;
	}

	if ( typeof value === 'number' ) {
		if ( ! Number.isFinite( value ) ) {
			throw new TypeError( 'Expected a JSON value.' );
		}
		return value;
	}

	if ( Array.isArray( value ) ) {
		return value.map( projectResponseStrings );
	}

	if ( ! isPlainObject( value ) ) {
		throw new TypeError( 'Expected a JSON value.' );
	}

	if ( Object.prototype.hasOwnProperty.call( value, BYTE_ENVELOPE_KEY ) ) {
		if ( ! isByteEnvelope( value ) ) {
			throw new TypeError( 'Malformed byte envelope.' );
		}
		return projectUtf8( decodeBase64url( value[ BYTE_ENVELOPE_KEY ] ) );
	}

	/** @type {Record<string, unknown>} */
	const projected = {};
	for ( const [ key, item ] of Object.entries( value ) ) {
		Object.defineProperty( projected, key, {
			value: projectResponseStrings( item ),
			enumerable: true,
			configurable: true,
			writable: true,
		} );
	}
	return projected;
}

/**
 * Format bytes as fixed-width hexadecimal inspection rows.
 *
 * @param {Uint8Array} bytes Bytes to format.
 * @param {number} [rowWidth=16] Bytes per row.
 * @returns {Array<{offset: number, hex: string, gutter: string}>} Byte rows.
 */
export function formatByteRows( bytes, rowWidth = 16 ) {
	if ( ! ( bytes instanceof Uint8Array ) ) {
		throw new TypeError( 'Expected a Uint8Array.' );
	}
	if ( ! Number.isFinite( rowWidth ) || ! Number.isInteger( rowWidth ) || rowWidth <= 0 ) {
		throw new RangeError( 'Row width must be a positive integer.' );
	}

	const rows = [];
	for ( let offset = 0; offset < bytes.length; offset += rowWidth ) {
		const row = bytes.subarray( offset, offset + rowWidth );
		rows.push( {
			offset,
			hex: Array.from( row, ( byte ) =>
				byte.toString( 16 ).toUpperCase().padStart( 2, '0' ),
			).join( ' ' ),
			gutter: Array.from( row, ( byte ) =>
				byte >= 0x20 && byte <= 0x7e
					? String.fromCharCode( byte )
					: '\ufffd',
			).join( '' ),
		} );
	}
	return rows;
}

/**
 * Decode one base64url alphabet character.
 *
 * The public decoder validates the complete alphabet before calling this.
 *
 * @param {number} character ASCII character code.
 * @returns {number} Six-bit value.
 */
function decodeBase64urlCharacter( character ) {
	if ( character >= 0x41 && character <= 0x5a ) {
		return character - 0x41;
	}
	if ( character >= 0x61 && character <= 0x7a ) {
		return character - 0x61 + 26;
	}
	if ( character >= 0x30 && character <= 0x39 ) {
		return character - 0x30 + 52;
	}
	return character === 0x2d ? 62 : 63;
}

/**
 * Determine whether a value has a JSON-object-compatible prototype.
 *
 * @param {unknown} value Value to inspect.
 * @returns {value is Record<string, unknown>} Whether the value is a plain object.
 */
function isPlainObject( value ) {
	if ( value === null || typeof value !== 'object' || Array.isArray( value ) ) {
		return false;
	}
	const prototype = Object.getPrototypeOf( value );
	return prototype === Object.prototype || prototype === null;
}
