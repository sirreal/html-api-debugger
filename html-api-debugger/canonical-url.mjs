import {
	decodeBase64url,
	decodeUtf8,
	encodeBase64url,
} from './byte-transport.mjs';

const CANONICAL_PARAMETERS = /** @type {const} */ ( [
	'format',
	'html64',
	'context64',
	'selector',
	'opts',
] );

const LEGACY_PARAMETERS = /** @type {const} */ ( [
	'html',
	'contextHTML',
	'html-opts',
] );

const ALL_TRANSPORT_PARAMETERS = [
	...CANONICAL_PARAMETERS,
	...LEGACY_PARAMETERS,
];

/** Error raised when a URL does not use the canonical transport grammar. */
export class CanonicalUrlError extends Error {
	constructor( message = 'The URL is not a canonical v1 HTML API Debugger URL.' ) {
		super( message );
		this.name = 'CanonicalUrlError';
	}
}

/**
 * @typedef CanonicalUrlState
 * @property {Uint8Array} htmlBytes
 * @property {Uint8Array} contextBytes
 * @property {string} selector
 * @property {string} opts
 * @property {boolean} needsCanonicalization
 */

/**
 * Parse a canonical debugger URL without accepting normalized aliases.
 *
 * @param {URL} url URL to parse.
 * @returns {CanonicalUrlState} Exact byte and Unicode state.
 */
export function parseCanonicalUrl( url ) {
	assertUrl( url );

	const hasTransportParameter = ALL_TRANSPORT_PARAMETERS.some( ( name ) =>
		url.searchParams.has( name ),
	);
	if ( ! hasTransportParameter ) {
		return {
			htmlBytes: new Uint8Array(),
			contextBytes: new Uint8Array(),
			selector: '',
			opts: '',
			needsCanonicalization: true,
		};
	}

	if ( LEGACY_PARAMETERS.some( ( name ) => url.searchParams.has( name ) ) ) {
		throw new CanonicalUrlError( 'The legacy URL was not migrated.' );
	}

	const raw = getCanonicalRawValues( url );
	if ( raw.format !== 'v1' ) {
		throw new CanonicalUrlError( 'Unknown or missing URL format.' );
	}
	if ( ! /^[A-Za-z0-9_-]*$/u.test( raw.html64 ) ) {
		throw new CanonicalUrlError();
	}
	if ( ! /^[A-Za-z0-9_-]*$/u.test( raw.context64 ) ) {
		throw new CanonicalUrlError();
	}
	if ( ! /^[Cc]?[Ii]?[Vv]?$/u.test( raw.opts ) ) {
		throw new CanonicalUrlError( 'Invalid URL options.' );
	}

	const selector = decodeCanonicalSelector( raw.selector );
	if ( encodeFormValue( selector ) !== raw.selector ) {
		throw new CanonicalUrlError( 'Selector is not canonically encoded.' );
	}

	try {
		return {
			htmlBytes: decodeBase64url( raw.html64 ),
			contextBytes: decodeBase64url( raw.context64 ),
			selector,
			opts: raw.opts,
			needsCanonicalization: false,
		};
	} catch {
		throw new CanonicalUrlError( 'Invalid canonical byte field.' );
	}
}

/**
 * Serialize exact state into the one canonical v1 URL spelling.
 *
 * @param {URL} url Base URL whose unrelated parameters are preserved.
 * @param {{htmlBytes: Uint8Array, contextBytes: Uint8Array, selector: string, opts: string}} state Exact state.
 * @returns {URL} Canonical URL clone.
 */
export function serializeCanonicalUrl( url, state ) {
	assertUrl( url );
	assertWellFormedUnicode( state.selector );
	if ( ! /^[Cc]?[Ii]?[Vv]?$/u.test( state.opts ) ) {
		throw new CanonicalUrlError( 'Invalid URL options.' );
	}

	const canonical = new URL( url.href );
	for ( const name of ALL_TRANSPORT_PARAMETERS ) {
		canonical.searchParams.delete( name );
	}
	canonical.searchParams.append( 'format', 'v1' );
	canonical.searchParams.append( 'html64', encodeBase64url( state.htmlBytes ) );
	canonical.searchParams.append(
		'context64',
		encodeBase64url( state.contextBytes ),
	);
	canonical.searchParams.append( 'selector', state.selector );
	canonical.searchParams.append( 'opts', state.opts );

	return canonical;
}

/**
 * Return the canonical path used inside a WordPress Playground URL.
 *
 * @param {URL} url Canonical admin URL.
 * @returns {string} Path and query without an origin or fragment.
 */
export function canonicalUrlPath( url ) {
	assertUrl( url );
	return `${ url.pathname }${ url.search }`;
}

/**
 * Extract exact raw values for all required canonical parameters.
 *
 * Decoded-name counts are compared with literal-name counts so encoded aliases
 * such as `ht%6Dl64` cannot hide behind URLSearchParams normalization.
 *
 * @param {URL} url URL to inspect.
 * @returns {Record<(typeof CANONICAL_PARAMETERS)[number], string>} Raw values.
 */
function getCanonicalRawValues( url ) {
	const pairs = url.search.length === 0 ? [] : url.search.slice( 1 ).split( '&' );
	/** @type {Partial<Record<(typeof CANONICAL_PARAMETERS)[number], string>>} */
	const values = {};

	for ( const name of CANONICAL_PARAMETERS ) {
		const prefix = `${ name }=`;
		const literalValues = pairs
			.filter( ( pair ) => pair === name || pair.startsWith( prefix ) )
			.map( ( pair ) => ( pair.startsWith( prefix ) ? pair.slice( prefix.length ) : null ) );

		const literalValue = literalValues[ 0 ];
		if (
			url.searchParams.getAll( name ).length !== literalValues.length ||
			literalValues.length !== 1 ||
			literalValue === null ||
			literalValue === undefined
		) {
			throw new CanonicalUrlError( `Missing, duplicate, or aliased ${ name } parameter.` );
		}
		values[ name ] = literalValue;
	}

	return /** @type {Record<(typeof CANONICAL_PARAMETERS)[number], string>} */ (
		values
	);
}

/**
 * Strictly form-decode a raw selector value as UTF-8.
 *
 * @param {string} raw Raw application/x-www-form-urlencoded value.
 * @returns {string} Unicode selector.
 */
function decodeCanonicalSelector( raw ) {
	const bytes = [];
	for ( let offset = 0; offset < raw.length; ++offset ) {
		const character = raw.charCodeAt( offset );
		if ( character === 0x2b ) {
			bytes.push( 0x20 );
			continue;
		}
		if ( character === 0x25 ) {
			if ( offset + 2 >= raw.length ) {
				throw new CanonicalUrlError( 'Selector contains malformed percent encoding.' );
			}
			const high = hexValue( raw.charCodeAt( offset + 1 ) );
			const low = hexValue( raw.charCodeAt( offset + 2 ) );
			if ( high < 0 || low < 0 ) {
				throw new CanonicalUrlError( 'Selector contains malformed percent encoding.' );
			}
			bytes.push( ( high << 4 ) | low );
			offset += 2;
			continue;
		}
		if ( character > 0x7f ) {
			throw new CanonicalUrlError( 'Selector is not canonically encoded.' );
		}
		bytes.push( character );
	}

	try {
		const selector = decodeUtf8( Uint8Array.from( bytes ) );
		assertWellFormedUnicode( selector );
		return selector;
	} catch ( error ) {
		if ( error instanceof CanonicalUrlError ) {
			throw error;
		}
		throw new CanonicalUrlError( 'Selector is not valid UTF-8.' );
	}
}

/**
 * Serialize one selector value using the browser's canonical form encoding.
 *
 * @param {string} selector Unicode selector.
 * @returns {string} Raw form value.
 */
function encodeFormValue( selector ) {
	const params = new URLSearchParams();
	params.set( 'selector', selector );
	return params.toString().slice( 'selector='.length );
}

/**
 * Reject lone UTF-16 surrogates before browser APIs can replace them.
 *
 * @param {string} value Unicode scalar string.
 */
function assertWellFormedUnicode( value ) {
	if ( typeof value !== 'string' ) {
		throw new CanonicalUrlError( 'Selector must be Unicode text.' );
	}
	for ( let offset = 0; offset < value.length; ++offset ) {
		const unit = value.charCodeAt( offset );
		if ( unit >= 0xd800 && unit <= 0xdbff ) {
			const next = value.charCodeAt( offset + 1 );
			if ( ! Number.isInteger( next ) || next < 0xdc00 || next > 0xdfff ) {
				throw new CanonicalUrlError( 'Selector contains a lone surrogate.' );
			}
			++offset;
		} else if ( unit >= 0xdc00 && unit <= 0xdfff ) {
			throw new CanonicalUrlError( 'Selector contains a lone surrogate.' );
		}
	}
}

/**
 * Decode one ASCII hexadecimal digit.
 *
 * @param {number} character Character code.
 * @returns {number} Value from 0 to 15, or -1.
 */
function hexValue( character ) {
	if ( character >= 0x30 && character <= 0x39 ) {
		return character - 0x30;
	}
	if ( character >= 0x41 && character <= 0x46 ) {
		return character - 0x41 + 10;
	}
	if ( character >= 0x61 && character <= 0x66 ) {
		return character - 0x61 + 10;
	}
	return -1;
}

/** @param {unknown} value */
function assertUrl( value ) {
	if ( ! ( value instanceof URL ) ) {
		throw new TypeError( 'Expected a URL.' );
	}
}
