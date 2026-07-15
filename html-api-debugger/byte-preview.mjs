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
