// @ts-expect-error TypeScript does not resolve browser URL query strings.
import * as ByteTransportLive from './byte-transport.mjs?ver=3.3';

const { decodeBase64url, isByteEnvelope, projectResponseStrings } =
	/** @type {typeof import('./byte-transport.mjs')} */ ( ByteTransportLive );

/**
 * Decode a successful byte-enveloped HTML API response.
 *
 * The raw response is retained by identity. Existing tree consumers receive a
 * separate Unicode projection, while block-sized and playback strings remain
 * available as exact bytes.
 *
 * @param {unknown} raw Raw JSON response.
 * @returns {{raw: unknown, projected: Record<string, unknown>, htmlBytes: Uint8Array, normalizedBytes: Uint8Array|null, errorBytes: Uint8Array|null, playbackBytes: Uint8Array[]}} Decoded response views.
 */
export function decodeHtmlApiResponse( raw ) {
	const projected = projectResponseStrings( raw );
	if ( ! isPlainObject( raw ) || ! isPlainObject( projected ) ) {
		throw new TypeError( 'Invalid HTML API response.' );
	}
	const rawHtml = raw[ 'html' ];
	const rawNormalizedHtml = raw[ 'normalizedHtml' ];
	const rawError = raw[ 'error' ];
	const rawSupports = raw[ 'supports' ];
	const rawResult = raw[ 'result' ];
	const projectedHtml = projected[ 'html' ];
	const projectedNormalizedHtml = projected[ 'normalizedHtml' ];
	const projectedError = projected[ 'error' ];
	const projectedSupports = projected[ 'supports' ];
	const projectedResult = projected[ 'result' ];

	if (
		! isByteEnvelope( rawHtml ) ||
		! ( rawNormalizedHtml === null || isByteEnvelope( rawNormalizedHtml ) ) ||
		! ( rawError === null || isByteEnvelope( rawError ) ) ||
		! isPlainObject( rawSupports ) ||
		! ( rawResult === null || isPlainObject( rawResult ) )
	) {
		throw new TypeError( 'Invalid HTML API response.' );
	}

	if (
		typeof projectedHtml !== 'string' ||
		! ( projectedNormalizedHtml === null || typeof projectedNormalizedHtml === 'string' ) ||
		! ( projectedError === null || typeof projectedError === 'string' ) ||
		! isPlainObject( projectedSupports ) ||
		! ( projectedResult === null || isPlainObject( projectedResult ) )
	) {
		throw new TypeError( 'Invalid projected HTML API response.' );
	}

	/** @type {Uint8Array[]} */
	const playbackBytes = [];
	if ( rawResult !== null ) {
		const rawPlayback = rawResult[ 'playback' ];
		if ( ! Array.isArray( rawPlayback ) ) {
			throw new TypeError( 'Invalid HTML API playback response.' );
		}
		for ( const entry of rawPlayback ) {
			if (
				! Array.isArray( entry ) ||
				entry.length !== 2 ||
				! isByteEnvelope( entry[ 0 ] )
			) {
				throw new TypeError( 'Invalid HTML API playback response.' );
			}
			playbackBytes.push( decodeBase64url( entry[ 0 ].__bytesBase64url ) );
		}

		if (
			projectedResult === null ||
			! Array.isArray( projectedResult[ 'playback' ] ) ||
			projectedResult[ 'playback' ].length !== playbackBytes.length
		) {
			throw new TypeError( 'Invalid projected HTML API playback response.' );
		}
		for ( const entry of projectedResult[ 'playback' ] ) {
			if (
				! Array.isArray( entry ) ||
				entry.length !== 2 ||
				typeof entry[ 0 ] !== 'string'
			) {
				throw new TypeError( 'Invalid projected HTML API playback response.' );
			}
		}
	}

	return {
		raw,
		projected,
		htmlBytes: decodeBase64url( rawHtml.__bytesBase64url ),
		normalizedBytes:
			rawNormalizedHtml === null
				? null
				: decodeBase64url( rawNormalizedHtml.__bytesBase64url ),
		errorBytes:
			rawError === null
				? null
				: decodeBase64url( rawError.__bytesBase64url ),
		playbackBytes,
	};
}

/**
 * Determine whether a value is a JSON object.
 *
 * @param {unknown} value Value to inspect.
 * @returns {value is Record<string, unknown>} Whether the value is plain.
 */
function isPlainObject( value ) {
	if ( value === null || typeof value !== 'object' || Array.isArray( value ) ) {
		return false;
	}
	const prototype = Object.getPrototypeOf( value );
	return prototype === Object.prototype || prototype === null;
}
