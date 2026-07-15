// @ts-expect-error TypeScript does not resolve browser URL query strings.
import * as CanonicalUrlLive from './canonical-url.mjs?ver=3.0';
// @ts-expect-error TypeScript does not resolve browser URL query strings.
import * as BytePreviewLive from './byte-preview.mjs?ver=3.0';
// @ts-expect-error TypeScript does not resolve browser URL query strings.
import * as ByteTransportLive from './byte-transport.mjs?ver=3.0';
// @ts-expect-error TypeScript does not resolve browser URL query strings.
import * as ResponseTransportLive from './response-transport.mjs?ver=3.0';

const { canonicalUrlPath, parseCanonicalUrl, serializeCanonicalUrl } =
	/** @type {typeof import('./canonical-url.mjs')} */ ( CanonicalUrlLive );
const { splitByteSpan } = /** @type {typeof import('./byte-preview.mjs')} */ (
	BytePreviewLive
);
const {
	decodeUtf8,
	encodeBase64url,
	encodeUtf8,
	isValidUtf8,
	projectUtf8,
} = /** @type {typeof import('./byte-transport.mjs')} */ ( ByteTransportLive );
const { decodeHtmlApiResponse } =
	/** @type {typeof import('./response-transport.mjs')} */ (
		ResponseTransportLive
	);

/**
 * Byte-authoritative controller for the debugger runtime.
 */
export class ByteRuntimeController {
	/** @type {(body: {html64: string, context64: string, selector: string}) => Promise<unknown>} */
	#request;
	/** @type {(url: URL) => void} */
	#replaceUrl;
	/** @type {(message: string) => boolean} */
	#confirmConversion;
	/** @type {boolean} */
	#supportsFragments;
	/** @type {URL} */
	#url;
	/** @type {Uint8Array} */
	#htmlBytes;
	/** @type {Uint8Array} */
	#contextBytes;
	/** @type {string} */
	#selector;
	/** @type {string} */
	#opts;
	/** @type {string|null} */
	#urlError;
	/** @type {ReturnType<typeof decodeHtmlApiResponse>|null} */
	#decodedResponse;
	/** @type {number} */
	#requestGeneration;
	/** @type {boolean} */
	#isProcessing;

	/**
	 * @param {{url: URL, supports: {create_fragment_advanced: boolean}, request: (body: {html64: string, context64: string, selector: string}) => Promise<unknown>, replaceUrl: (url: URL) => void, confirmConversion: (message: string) => boolean}} options Injected runtime boundaries.
	 */
	constructor( options ) {
		this.#request = options.request;
		this.#replaceUrl = options.replaceUrl;
		this.#confirmConversion = options.confirmConversion;
		this.#supportsFragments = Boolean(
			options.supports.create_fragment_advanced,
		);
		this.#url = new URL( options.url.href );
		this.#htmlBytes = new Uint8Array();
		this.#contextBytes = new Uint8Array();
		this.#selector = '';
		this.#opts = '';
		this.#urlError = null;
		this.#decodedResponse = null;
		this.#requestGeneration = 0;
		this.#isProcessing = false;

		try {
			const parsed = parseCanonicalUrl( this.#url );
			this.#htmlBytes = parsed.htmlBytes.slice();
			this.#contextBytes = parsed.contextBytes.slice();
			this.#selector = parsed.selector;
			this.#opts = parsed.opts;
			if ( parsed.needsCanonicalization ) {
				this.#rewriteUrl();
			}
		} catch ( error ) {
			this.#urlError =
				error instanceof Error ? error.message : 'Invalid canonical URL.';
		}
	}

	get urlError() {
		return this.#urlError;
	}

	get selector() {
		return this.#selector;
	}

	get opts() {
		return this.#opts;
	}

	get htmlBytes() {
		return this.#htmlBytes.slice();
	}

	get contextBytes() {
		return this.#contextBytes.slice();
	}

	get isProcessing() {
		return this.#isProcessing;
	}

	get rawResponse() {
		return this.#decodedResponse?.raw ?? null;
	}

	get projectedResponse() {
		return this.#decodedResponse?.projected ?? null;
	}

	get normalizedBytes() {
		return this.#decodedResponse?.normalizedBytes?.slice() ?? null;
	}

	/** Start initial processing. */
	async start() {
		return this.process();
	}

	/**
	 * Process the current exact source snapshot.
	 *
	 * Only the newest generation may install a response or surface a failure.
	 */
	async process() {
		if ( this.#urlError !== null ) {
			return null;
		}

		const generation = ++this.#requestGeneration;
		this.#decodedResponse = null;
		this.#isProcessing = true;
		const body = {
			html64: encodeBase64url( this.#htmlBytes ),
			context64: encodeBase64url( this.#contextBytes ),
			selector: this.#selector,
		};

		try {
			const raw = await this.#request( body );
			if ( generation !== this.#requestGeneration ) {
				return null;
			}
			const decoded = decodeHtmlApiResponse( raw );
			if ( generation !== this.#requestGeneration ) {
				return null;
			}
			this.#decodedResponse = decoded;
			return decoded;
		} catch ( error ) {
			if ( generation !== this.#requestGeneration ) {
				return null;
			}
			throw error;
		} finally {
			if ( generation === this.#requestGeneration ) {
				this.#isProcessing = false;
			}
		}
	}

	/**
	 * Replace source bytes with an intentional Unicode edit and process them.
	 *
	 * @param {'html'|'context'} kind Source kind.
	 * @param {string} text Unicode editor value.
	 */
	editSource( kind, text ) {
		const previous = this.#getSourceBytes( kind ).slice();
		this.#setSourceBytes( kind, encodeUtf8( text ) );
		try {
			this.#rewriteUrl();
		} catch ( error ) {
			this.#setSourceBytes( kind, previous );
			throw error;
		}
		return this.process();
	}

	/**
	 * Request editable text, explicitly converting malformed bytes when approved.
	 *
	 * @param {'html'|'context'} kind Source kind.
	 * @returns {Promise<string|null>} Editable text, or null when conversion is cancelled.
	 */
	requestTextEditing( kind ) {
		const bytes = this.#getSourceBytes( kind );
		if ( isValidUtf8( bytes ) ) {
			return Promise.resolve( decodeUtf8( bytes ) );
		}

		if (
			! this.#confirmConversion(
				'Editing this malformed UTF-8 will replace invalid bytes and change the source.',
			)
		) {
			return Promise.resolve( null );
		}

		const text = projectUtf8( bytes );
		this.#setSourceBytes( kind, encodeUtf8( text ) );
		try {
			this.#rewriteUrl();
		} catch ( error ) {
			this.#setSourceBytes( kind, bytes );
			throw error;
		}
		return this.process().then( ( result ) => ( result === null ? null : text ) );
	}

	/** @param {string} selector */
	setSelector( selector ) {
		const previous = this.#selector;
		this.#selector = selector;
		try {
			this.#rewriteUrl();
		} catch ( error ) {
			this.#selector = previous;
			throw error;
		}
		return this.process();
	}

	/** @param {string} opts */
	setOpts( opts ) {
		const previous = this.#opts;
		this.#opts = opts;
		try {
			this.#rewriteUrl();
		} catch ( error ) {
			this.#opts = previous;
			throw error;
		}
	}

	/**
	 * Get exact processed bytes for the final or one playback state.
	 *
	 * @param {number|null} [playbackIndex=null] Zero-based playback index.
	 */
	getProcessedBytes( playbackIndex = null ) {
		if ( this.#decodedResponse === null ) {
			if ( playbackIndex !== null ) {
				throw new RangeError( 'Playback is not available.' );
			}
			return this.#htmlBytes.slice();
		}
		if ( playbackIndex === null ) {
			return this.#decodedResponse.htmlBytes.slice();
		}
		if (
			! Number.isInteger( playbackIndex ) ||
			playbackIndex < 0 ||
			playbackIndex >= this.#decodedResponse.playbackBytes.length
		) {
			throw new RangeError( 'Playback index is out of range.' );
		}
		const playbackBytes = this.#decodedResponse.playbackBytes[ playbackIndex ];
		if ( playbackBytes === undefined ) {
			throw new RangeError( 'Playback index is out of range.' );
		}
		return playbackBytes.slice();
	}

	/**
	 * Plan exact document navigation and optional native fragment projection.
	 *
	 * @param {number|null} [playbackIndex=null] Playback index.
	 */
	getPreviewPlan( playbackIndex = null ) {
		const processed = this.getProcessedBytes( playbackIndex );
		if ( this.#supportsFragments && this.#contextBytes.length > 0 ) {
			return {
				documentBytes: this.#contextBytes.slice(),
				fragment: {
					bytes: processed.slice(),
					text: projectUtf8( processed ),
					lossy: ! isValidUtf8( processed ),
				},
			};
		}
		return {
			documentBytes: processed.slice(),
			fragment: null,
		};
	}

	/**
	 * Split the current exact processed bytes at a byte span.
	 *
	 * @param {number} start Byte offset.
	 * @param {number} length Byte length.
	 * @param {number|null} [playbackIndex=null] Playback index.
	 */
	splitProcessedSpan( start, length, playbackIndex = null ) {
		return splitByteSpan(
			this.getProcessedBytes( playbackIndex ),
			start,
			length,
		);
	}

	/** @param {string|null} [resolvedOpts=null] Optional resolved share options. */
	getCanonicalUrl( resolvedOpts = null ) {
		return serializeCanonicalUrl( this.#url, {
			htmlBytes: this.#htmlBytes,
			contextBytes: this.#contextBytes,
			selector: this.#selector,
			opts: resolvedOpts ?? this.#opts,
		} );
	}

	/**
	 * Build a WordPress Playground link containing the canonical admin path.
	 *
	 * @param {URL} playgroundBase Playground base URL.
	 * @param {string} resolvedOpts Resolved view options.
	 * @param {string|null} [wpVersion=null] Optional WordPress version.
	 */
	getPlaygroundUrl( playgroundBase, resolvedOpts, wpVersion = null ) {
		const playground = new URL( playgroundBase.href );
		playground.searchParams.set(
			'url',
			canonicalUrlPath( this.getCanonicalUrl( resolvedOpts ) ),
		);
		if ( wpVersion !== null ) {
			playground.searchParams.set( 'wp', wpVersion );
		}
		return playground;
	}

	/** @param {number} [threshold=8192] Advisory character threshold. */
	isUrlUnusuallyLong( threshold = 8192 ) {
		if ( ! Number.isInteger( threshold ) || threshold <= 0 ) {
			throw new RangeError( 'URL threshold must be a positive integer.' );
		}
		return this.getCanonicalUrl().href.length > threshold;
	}

	/** @param {'html'|'context'} kind */
	#getSourceBytes( kind ) {
		if ( kind === 'html' ) {
			return this.#htmlBytes;
		}
		if ( kind === 'context' ) {
			return this.#contextBytes;
		}
		throw new TypeError( 'Unknown source kind.' );
	}

	/** @param {'html'|'context'} kind @param {Uint8Array} bytes */
	#setSourceBytes( kind, bytes ) {
		if ( kind === 'html' ) {
			this.#htmlBytes = bytes.slice();
			return;
		}
		if ( kind === 'context' ) {
			this.#contextBytes = bytes.slice();
			return;
		}
		throw new TypeError( 'Unknown source kind.' );
	}

	#rewriteUrl() {
		const nextUrl = this.getCanonicalUrl();
		this.#replaceUrl( new URL( nextUrl.href ) );
		this.#url = nextUrl;
	}
}
