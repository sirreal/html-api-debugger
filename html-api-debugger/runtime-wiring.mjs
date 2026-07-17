/** Error raised when runtime work is replaced by a newer operation. */
export class SupersededRuntimeOperationError extends Error {
	constructor() {
		super( 'Runtime operation was superseded.' );
		this.name = 'SupersededRuntimeOperationError';
	}
}

/** Error raised when work is requested after a runtime boundary is disposed. */
export class DisposedRuntimeBoundaryError extends Error {
	constructor() {
		super( 'Runtime boundary is disposed.' );
		this.name = 'DisposedRuntimeBoundaryError';
	}
}

/**
 * Debounce, cancel, and authenticate byte-safe REST requests.
 */
export class ByteRequestBoundary {
	/** @type {string} */
	#endpoint;
	/** @type {string} */
	#nonce;
	/** @type {typeof fetch} */
	#fetch;
	/** @type {typeof AbortController} */
	#AbortController;
	/** @type {(callback: () => void, delay: number) => unknown} */
	#setTimer;
	/** @type {(timer: unknown) => void} */
	#clearTimer;
	/** @type {number} */
	#delay;
	/** @type {number} */
	#generation = 0;
	/** @type {boolean} */
	#disposed = false;
	/** @type {{generation: number, timer: unknown, reject: (reason: unknown) => void}|null} */
	#pending = null;
	/** @type {{generation: number, controller: AbortController}|null} */
	#active = null;

	/**
	 * @param {{endpoint: string, nonce: string, fetch: typeof fetch, AbortController: typeof AbortController, setTimer?: (callback: () => void, delay: number) => unknown, clearTimer?: (timer: unknown) => void, delay?: number}} options Injected request boundaries.
	 */
	constructor( options ) {
		this.#endpoint = options.endpoint;
		this.#nonce = options.nonce;
		this.#fetch = options.fetch;
		this.#AbortController = options.AbortController;
		this.#setTimer =
			options.setTimer ??
			( ( callback, delay ) => globalThis.setTimeout( callback, delay ) );
		this.#clearTimer =
			options.clearTimer ??
			( ( timer ) =>
				globalThis.clearTimeout( /** @type {number} */ ( timer ) ) );
		this.#delay = options.delay ?? 150;

		if ( ! Number.isInteger( this.#delay ) || this.#delay < 0 ) {
			throw new RangeError( 'Request delay must be a non-negative integer.' );
		}
	}

	/**
	 * Schedule the newest byte-safe request.
	 *
	 * @param {{html64: string, context64: string, selector: string}} body JSON-safe request body.
	 * @returns {Promise<unknown>} Parsed successful response.
	 */
	request( body ) {
		if ( this.#disposed ) {
			return Promise.reject( new DisposedRuntimeBoundaryError() );
		}

		const generation = ++this.#generation;
		this.#cancelPending( new SupersededRuntimeOperationError() );
		this.#abortActive( new SupersededRuntimeOperationError() );

		return new Promise( ( resolve, reject ) => {
			const timer = this.#setTimer( () => {
				if (
					this.#disposed ||
					this.#generation !== generation ||
					this.#pending?.generation !== generation
				) {
					reject( new SupersededRuntimeOperationError() );
					return;
				}

				this.#pending = null;
				void this.#perform( generation, body ).then( resolve, reject );
			}, this.#delay );

			this.#pending = { generation, timer, reject };
		} );
	}

	/** Permanently cancel and reject all owned work. */
	dispose() {
		if ( this.#disposed ) {
			return;
		}
		this.#disposed = true;
		++this.#generation;
		const error = new DisposedRuntimeBoundaryError();
		this.#cancelPending( error );
		this.#abortActive( error );
	}

	/**
	 * @param {number} generation Operation generation.
	 * @param {{html64: string, context64: string, selector: string}} body Request body.
	 */
	async #perform( generation, body ) {
		if ( this.#disposed || generation !== this.#generation ) {
			throw new SupersededRuntimeOperationError();
		}

		const controller = new this.#AbortController();
		this.#active = { generation, controller };

		try {
			const response = await this.#fetch( this.#endpoint, {
				method: 'POST',
				body: JSON.stringify( body ),
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': this.#nonce,
				},
				signal: controller.signal,
			} );

			this.#assertCurrent( generation );
			const nextNonce = response.headers.get( 'X-WP-Nonce' );
			if ( nextNonce !== null ) {
				this.#nonce = nextNonce;
			}
			if ( ! response.ok ) {
				throw response;
			}

			const result = await response.json();
			this.#assertCurrent( generation );
			return result;
		} finally {
			if (
				this.#active?.generation === generation &&
				this.#active.controller === controller
			) {
				this.#active = null;
			}
		}
	}

	/** @param {number} generation Operation generation. */
	#assertCurrent( generation ) {
		if ( this.#disposed || generation !== this.#generation ) {
			throw new SupersededRuntimeOperationError();
		}
	}

	/** @param {unknown} reason Rejection reason. */
	#cancelPending( reason ) {
		if ( this.#pending === null ) {
			return;
		}
		const pending = this.#pending;
		this.#pending = null;
		this.#clearTimer( pending.timer );
		pending.reject( reason );
	}

	/** @param {unknown} reason Abort reason. */
	#abortActive( reason ) {
		if ( this.#active === null ) {
			return;
		}
		const active = this.#active;
		this.#active = null;
		active.controller.abort( reason );
	}
}

/**
 * Coordinate exact-byte iframe navigations and fragment initialization.
 */
export class BytePreviewCoordinator {
	/** @type {{load: (bytes: Uint8Array) => string, isCurrent: (url: string) => boolean, dispose: () => void}} */
	#preview;
	/** @type {HTMLIFrameElement} */
	#iframe;
	/** @type {(document: Document) => Element|null} */
	#resolveFragmentTarget;
	/** @type {(details: {document: Document, contextElement: Element|null, fragmentLossy: boolean, url: string}) => void} */
	#onCurrentDocument;
	/** @type {(details: {document: Document, url: string}) => void} */
	#restoreCurrentDocument;
	/** @type {() => void} */
	#disconnectObserver;
	/** @type {{addEventListener: (type: string, listener: EventListener) => void, removeEventListener: (type: string, listener: EventListener) => void}} */
	#pagehideTarget;
	/** @type {{key: string, url: string}|null} */
	#committed = null;
	/** @type {{generation: number, key: string, url: string|null, handler: EventListener, plan: PreviewPlan}|null} */
	#pending = null;
	/** @type {string|null} */
	#ownedUrl = null;
	/** @type {number} */
	#generation = 0;
	/** @type {boolean} */
	#disposed = false;
	/** @type {EventListener} */
	#pagehideHandler;

	/**
	 * @param {{preview: {load: (bytes: Uint8Array) => string, isCurrent: (url: string) => boolean, dispose: () => void}, iframe: HTMLIFrameElement, resolveFragmentTarget: (document: Document) => Element|null, onCurrentDocument: (details: {document: Document, contextElement: Element|null, fragmentLossy: boolean, url: string}) => void, restoreCurrentDocument: (details: {document: Document, url: string}) => void, disconnectObserver: () => void, pagehideTarget: {addEventListener: (type: string, listener: EventListener) => void, removeEventListener: (type: string, listener: EventListener) => void}}} options Injected preview boundaries.
	 */
	constructor( options ) {
		this.#preview = options.preview;
		this.#iframe = options.iframe;
		this.#resolveFragmentTarget = options.resolveFragmentTarget;
		this.#onCurrentDocument = options.onCurrentDocument;
		this.#restoreCurrentDocument = options.restoreCurrentDocument;
		this.#disconnectObserver = options.disconnectObserver;
		this.#pagehideTarget = options.pagehideTarget;
		this.#pagehideHandler = () => this.dispose();
		this.#pagehideTarget.addEventListener(
			'pagehide',
			this.#pagehideHandler,
		);
	}

	/**
	 * Navigate only when the exact byte plan differs from committed and pending work.
	 *
	 * @param {PreviewPlan} plan Exact preview plan.
	 * @returns {boolean} Whether a navigation was started.
	 */
	render( plan ) {
		if ( this.#disposed ) {
			throw new DisposedRuntimeBoundaryError();
		}

		const key = previewPlanKey( plan );
		if ( this.#committed?.key === key || this.#pending?.key === key ) {
			return false;
		}

		this.#disconnectObserver();
		this.#clearPending();

		const generation = ++this.#generation;
		/** @type {EventListener} */
		const handler = () => this.#handleLoad( generation );
		this.#pending = {
			generation,
			key,
			url: null,
			handler,
			plan,
		};
		this.#iframe.addEventListener( 'load', handler );

		try {
			const url = this.#preview.load( plan.documentBytes );
			if ( this.#pending?.generation !== generation ) {
				return true;
			}
			this.#pending.url = url;
			this.#ownedUrl = url;
			// The successful load revoked the URL represented by any prior commit.
			this.#committed = null;
			return true;
		} catch ( error ) {
			if ( this.#pending?.generation === generation ) {
				this.#clearPending();
				this.#restoreCurrent();
			}
			throw error;
		}
	}

	/** Permanently release all listeners and the current object URL. */
	dispose() {
		if ( this.#disposed ) {
			return;
		}
		this.#disposed = true;
		++this.#generation;
		this.#clearPending();
		this.#committed = null;
		this.#disconnectObserver();
		this.#pagehideTarget.removeEventListener(
			'pagehide',
			this.#pagehideHandler,
		);
		this.#preview.dispose();
		this.#ownedUrl = null;
	}

	/** @param {number} generation Pending generation. */
	#handleLoad( generation ) {
		const pending = this.#pending;
		if (
			this.#disposed ||
			pending === null ||
			pending.generation !== generation ||
			pending.url === null
		) {
			return;
		}

		let loadedUrl;
		try {
			loadedUrl = this.#iframe.contentWindow?.location.href;
		} catch {
			this.#failPending( generation );
			return;
		}

		try {
			if (
				! this.#preview.isCurrent( pending.url ) ||
				loadedUrl !== pending.url
			) {
				return;
			}

			this.#iframe.removeEventListener( 'load', pending.handler );
			const document = this.#iframe.contentWindow?.document;
			if ( document === undefined ) {
				throw new Error( 'The preview document is unavailable.' );
			}

			let contextElement = null;
			if ( pending.plan.fragment !== null ) {
				contextElement = this.#resolveFragmentTarget( document );
				if ( contextElement === null ) {
					throw new Error( 'The fragment context is unavailable.' );
				}
				contextElement.innerHTML = pending.plan.fragment.text;
			}

			this.#onCurrentDocument( {
				document,
				contextElement,
				fragmentLossy: pending.plan.fragment?.lossy ?? false,
				url: pending.url,
			} );

			if ( this.#pending?.generation !== generation ) {
				return;
			}
			this.#committed = { key: pending.key, url: pending.url };
			this.#pending = null;
		} catch {
			this.#failPending( generation );
		}
	}

	/** @param {number} generation Failed pending generation. */
	#failPending( generation ) {
		if ( this.#pending?.generation !== generation ) {
			return;
		}
		this.#clearPending();
		this.#committed = null;
		this.#restoreCurrent();
	}

	#clearPending() {
		if ( this.#pending === null ) {
			return;
		}
		this.#iframe.removeEventListener( 'load', this.#pending.handler );
		this.#pending = null;
	}

	#restoreCurrent() {
		if ( this.#ownedUrl === null || ! this.#preview.isCurrent( this.#ownedUrl ) ) {
			return;
		}
		try {
			const document = this.#iframe.contentWindow?.document;
			if ( document !== undefined ) {
				this.#restoreCurrentDocument( {
					document,
					url: this.#ownedUrl,
				} );
			}
		} catch {
			// A failed recovery must not escape an event handler or poison retry state.
		}
	}
}

/**
 * @typedef PreviewPlan
 * @property {Uint8Array} documentBytes
 * @property {{bytes: Uint8Array, text: string, lossy: boolean}|null} fragment
 */

/** @param {PreviewPlan} plan Exact preview plan. */
function previewPlanKey( plan ) {
	if ( ! ( plan.documentBytes instanceof Uint8Array ) ) {
		throw new TypeError( 'Preview document bytes must be a Uint8Array.' );
	}
	let key = `D${ bytesKey( plan.documentBytes ) }`;
	if ( plan.fragment === null ) {
		return `${ key }N`;
	}
	if ( ! ( plan.fragment.bytes instanceof Uint8Array ) ) {
		throw new TypeError( 'Preview fragment bytes must be a Uint8Array.' );
	}
	return `${ key }F${ bytesKey( plan.fragment.bytes ) }`;
}

/** @param {Uint8Array} bytes Exact bytes. */
function bytesKey( bytes ) {
	let key = `${ bytes.length }:`;
	for ( const byte of bytes ) {
		key += byte.toString( 16 ).padStart( 2, '0' );
	}
	return key;
}
