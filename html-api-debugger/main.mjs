import {
	printHtmlApiTree,
	printHtmlApiTreeText,
} from '@html-api-debugger/print-html-tree';
import { replaceInvisible } from '@html-api-debugger/replace-invisible-chars';
import * as I from '@wordpress/interactivity';

// @ts-expect-error TypeScript does not resolve browser URL query strings.
import * as BytePreviewLive from './byte-preview.mjs?ver=3.0';
// @ts-expect-error TypeScript does not resolve browser URL query strings.
import * as ByteTransportLive from './byte-transport.mjs?ver=3.0';
// @ts-expect-error TypeScript does not resolve browser URL query strings.
import * as RuntimeControllerLive from './runtime-controller.mjs?ver=3.0';
// @ts-expect-error TypeScript does not resolve browser URL query strings.
import * as RuntimeWiringLive from './runtime-wiring.mjs?ver=3.0';
// @ts-expect-error TypeScript does not resolve browser URL query strings.
import * as UiTransactionsLive from './ui-transactions.mjs?ver=3.0';

const { ByteDocumentPreview, resolveFragmentTarget } =
	/** @type {typeof import('./byte-preview.mjs')} */ ( BytePreviewLive );
const { decodeUtf8, formatByteRows, isValidUtf8, projectUtf8 } =
	/** @type {typeof import('./byte-transport.mjs')} */ ( ByteTransportLive );
const { ByteRuntimeController } =
	/** @type {typeof import('./runtime-controller.mjs')} */ (
		RuntimeControllerLive
	);
const {
	BytePreviewCoordinator,
	ByteRequestBoundary,
	DisposedRuntimeBoundaryError,
	SupersededRuntimeOperationError,
} = /** @type {typeof import('./runtime-wiring.mjs')} */ ( RuntimeWiringLive );
const { beginUiOperation, settleUiConversion } =
	/** @type {typeof import('./ui-transactions.mjs')} */ ( UiTransactionsLive );

const NS = 'html-api-debugger';
const DEFAULT_HTML5_BODY_CONTEXT = '<!DOCTYPE html><body>';
const PLAYGROUND_BASE = new URL(
	'https://playground.wordpress.net/?plugin=html-api-debugger',
);

const RENDERED_IFRAME = /** @type {HTMLIFrameElement} */ (
	document.getElementById( 'rendered_iframe' )
);

const cfg = /** @type {{restEndpoint: string, nonce: string, supports: {create_fragment_advanced: boolean, selectors: boolean}}} */ (
	I.getConfig( NS )
);

const requestBoundary = new ByteRequestBoundary( {
	endpoint: cfg.restEndpoint,
	nonce: cfg.nonce,
	fetch: window.fetch.bind( window ),
	AbortController,
} );

const controller = new ByteRuntimeController( {
	url: new URL( document.location.href ),
	supports: cfg.supports,
	request: ( body ) => requestBoundary.request( body ),
	replaceUrl: ( url ) => history.replaceState( null, '', url ),
	confirmConversion: ( message ) => window.confirm( message ),
} );

/** @typedef {'showClosers'|'showInvisible'|'showVirtual'} BooleanConfigurationOption */
/** @typedef {'html'|'context'} SourceKind */

const BOOLEAN_CONFIGURATION_OPTIONS = /** @type {const} */ ( [
	[ 'C', 'c', 'showClosers' ],
	[ 'I', 'i', 'showInvisible' ],
	[ 'V', 'v', 'showVirtual' ],
] );
const booleanConfigurationOverrides = getInitialBooleanConfigurationOverrides();

/** @type {Element|null} */
let CONTEXT_ELEMENT = null;
/** @type {MutationObserver|null} */
let mutationObserver = null;
/** @type {InstanceType<typeof BytePreviewCoordinator>} */
let previewCoordinator;

const initialHtmlValid = isValidUtf8( controller.htmlBytes );
const initialContextValid = isValidUtf8( controller.contextBytes );
const storedHoverInfo = localStorage.getItem( `${ NS }-hoverInfo` );

const createStore = /** @type {any} */ ( I.store );
const store = createStore( NS, {
	state: {
		revision: 0,
		urlError: controller.urlError,
		transportError: null,
		previewError: null,
		urlUnusuallyLong: false,
		fragmentProjectionLossy: false,
		contextUnsupported: ! cfg.supports.create_fragment_advanced,
		processing: false,
		htmlView: initialHtmlValid ? 'text' : 'bytes',
		contextView: initialContextValid ? 'text' : 'bytes',
		processedView: initialHtmlValid ? 'text' : 'bytes',
		normalizedView: 'text',
		playbackPoint: null,
		previewCorePrNumber: null,
		previewGutenbergPrNumber: null,
		selector: controller.selector,
		selectorErrorMessage: null,
		showClosers: getInitialBooleanConfigurationValue( 'showClosers' ),
		showInvisible: getInitialBooleanConfigurationValue( 'showInvisible' ),
		showVirtual: getInitialBooleanConfigurationValue( 'showVirtual' ),
		hoverInfo:
			storedHoverInfo === 'insertionMode' ? 'insertionMode' : 'breadcrumbs',
		hasMutatedDom: false,
		DOM: {
			renderingMode: '',
			documentTitle: '',
			doctypeName: '',
			doctypeSystemId: '',
			doctypePublicId: '',
			contextNode: '',
		},
		htmlapiResponse: {
			supports: cfg.supports,
			html: '',
			error: null,
			result: null,
			normalizedHtml: null,
		},

		get htmlText() {
			void store.state.revision;
			return sourceText( 'html' );
		},
		get contextText() {
			void store.state.revision;
			return sourceText( 'context' );
		},
		get htmlByteRows() {
			void store.state.revision;
			return byteRowsText( controller.htmlBytes );
		},
		get contextByteRows() {
			void store.state.revision;
			return byteRowsText( controller.contextBytes );
		},
		get htmlTextHidden() {
			return store.state.htmlView !== 'text';
		},
		get htmlBytesHidden() {
			return store.state.htmlView !== 'bytes';
		},
		get contextTextHidden() {
			return store.state.contextView !== 'text';
		},
		get contextBytesHidden() {
			return store.state.contextView !== 'bytes';
		},
		get htmlConversionHidden() {
			void store.state.revision;
			return isValidUtf8( controller.htmlBytes );
		},
		get contextConversionHidden() {
			void store.state.revision;
			return isValidUtf8( controller.contextBytes );
		},
		get processedText() {
			void store.state.revision;
			return displayBytes( currentProcessedBytes() );
		},
		get processedByteRows() {
			void store.state.revision;
			return byteRowsText( currentProcessedBytes() );
		},
		get processedTextHidden() {
			return store.state.processedView !== 'text';
		},
		get processedBytesHidden() {
			return store.state.processedView !== 'bytes';
		},
		get normalizedText() {
			void store.state.revision;
			const bytes = controller.normalizedBytes;
			return bytes === null ? '' : displayBytes( bytes );
		},
		get normalizedByteRows() {
			void store.state.revision;
			const bytes = controller.normalizedBytes;
			return bytes === null ? '' : byteRowsText( bytes );
		},
		get normalizedTextHidden() {
			return store.state.normalizedView !== 'text';
		},
		get normalizedBytesHidden() {
			return store.state.normalizedView !== 'bytes';
		},
		get normalizedUnavailable() {
			void store.state.revision;
			return controller.normalizedBytes === null;
		},
		get options() {
			return {
				showClosers: store.state.showClosers,
				showInvisible: store.state.showInvisible,
				showVirtual: store.state.showVirtual,
				hoverInfo: store.state.hoverInfo,
				selector: cfg.supports.selectors ? store.state.selector : '',
			};
		},
		get treeWarnings() {
			return store.state.htmlapiResponse.result?.warnings ?? [];
		},
		get playbackTree() {
			if ( store.state.playbackPoint === null ) {
				return undefined;
			}
			return store.state.htmlapiResponse.result?.playback?.[
				store.state.playbackPoint
			]?.[ 1 ];
		},
		get playbackLength() {
			return store.state.htmlapiResponse.result?.playback?.length ?? 0;
		},
		get hoverBreadcrumbs() {
			return store.state.hoverInfo === 'breadcrumbs';
		},
		get hoverInsertion() {
			return store.state.hoverInfo === 'insertionMode';
		},
		get htmlApiDocumentTitle() {
			return displayOptionalString(
				store.state.htmlapiResponse.result?.documentTitle,
			);
		},
		get htmlApiDoctypeName() {
			return displayOptionalString(
				store.state.htmlapiResponse.result?.doctypeName,
			);
		},
		get htmlApiDoctypePublicId() {
			return displayOptionalString(
				store.state.htmlapiResponse.result?.doctypePublicId,
			);
		},
		get htmlApiDoctypeSystemId() {
			return displayOptionalString(
				store.state.htmlapiResponse.result?.doctypeSystemId,
			);
		},
		get formattedRawResponse() {
			void store.state.revision;
			return controller.rawResponse === null
				? ''
				: JSON.stringify( controller.rawResponse, undefined, 2 );
		},
		get previewCoreLink() {
			const number = store.state.previewCorePrNumber;
			return number === null
				? null
				: {
						href: `https://github.com/WordPress/wordpress-develop/pull/${ number }`,
						text: `wordpress-develop #${ number }`,
					};
		},
		get previewGutenbergLink() {
			const number = store.state.previewGutenbergPrNumber;
			return number === null
				? null
				: {
						href: `https://github.com/WordPress/gutenberg/pull/${ number }`,
						text: `Gutenberg #${ number }`,
					};
		},
	},

	actions: {
		showHtmlText() {
			if ( isValidUtf8( controller.htmlBytes ) ) {
				store.state.htmlView = 'text';
			}
		},
		showHtmlBytes() {
			store.state.htmlView = 'bytes';
		},
		showContextText() {
			if ( isValidUtf8( controller.contextBytes ) ) {
				store.state.contextView = 'text';
			}
		},
		showContextBytes() {
			store.state.contextView = 'bytes';
		},
		showProcessedText() {
			if ( isValidUtf8( currentProcessedBytes() ) ) {
				store.state.processedView = 'text';
			}
		},
		showProcessedBytes() {
			store.state.processedView = 'bytes';
		},
		showNormalizedText() {
			const bytes = controller.normalizedBytes;
			if ( bytes !== null && isValidUtf8( bytes ) ) {
				store.state.normalizedView = 'text';
			}
		},
		showNormalizedBytes() {
			store.state.normalizedView = 'bytes';
		},
		enableHtmlTextEditing: function* () {
			yield convertSourceToText( 'html' );
		},
		enableContextTextEditing: function* () {
			yield convertSourceToText( 'context' );
		},
		/** @param {InputEvent} event */
		handleInput: function* ( event ) {
			const text = /** @type {HTMLTextAreaElement} */ ( event.target ).value;
			const started = beginUiOperation(
				() => controller.editSource( 'html', text ),
				() => {
					store.state.playbackPoint = null;
					store.state.processedView = 'text';
					touchState();
					renderPreview();
				},
				reportControllerError,
			);
			if ( ! started.started ) {
				return;
			}
			yield settleControllerOperation( started.value );
		},
		/** @param {InputEvent} event */
		handleContextHtmlInput: function* ( event ) {
			const text = /** @type {HTMLTextAreaElement} */ ( event.target ).value;
			const started = beginUiOperation(
				() => controller.editSource( 'context', text ),
				() => {
					store.state.playbackPoint = null;
					touchState();
					renderPreview();
				},
				reportControllerError,
			);
			if ( ! started.started ) {
				return;
			}
			yield settleControllerOperation( started.value );
		},
		handleDefaultBodyContextClick: function* () {
			const started = beginUiOperation(
				() =>
					controller.editSource( 'context', DEFAULT_HTML5_BODY_CONTEXT ),
				() => {
					store.state.contextView = 'text';
					store.state.playbackPoint = null;
					touchState();
					renderPreview();
				},
				reportControllerError,
			);
			if ( ! started.started ) {
				return;
			}
			yield settleControllerOperation( started.value );
		},
		/** @param {InputEvent} event */
		handleSelectorChange: function* ( event ) {
			const selector = /** @type {HTMLTextAreaElement} */ ( event.target ).value;
			if ( selector !== '' ) {
				try {
					document.createDocumentFragment().querySelector( selector );
				} catch ( error ) {
					if ( error instanceof DOMException && error.name === 'SyntaxError' ) {
						store.state.selectorErrorMessage = error.message;
						return;
					}
					throw error;
				}
			}
			const started = beginUiOperation(
				() => controller.setSelector( selector ),
				() => {
					store.state.selector = controller.selector;
					store.state.selectorErrorMessage = null;
					touchState();
				},
				( error ) => {
					store.state.selector = controller.selector;
					reportControllerError( error );
				},
			);
			if ( ! started.started ) {
				return;
			}
			yield settleControllerOperation( started.value );
		},
		handleShowInvisibleClick: getToggleHandler( 'showInvisible' ),
		handleShowClosersClick: getToggleHandler( 'showClosers' ),
		handleShowVirtualClick: getToggleHandler( 'showVirtual' ),
		/** @param {Event} event */
		hoverInfoChange( event ) {
			const value = /** @type {HTMLSelectElement} */ ( event.target ).value;
			store.state.hoverInfo =
				value === 'insertionMode' ? 'insertionMode' : 'breadcrumbs';
			localStorage.setItem( `${ NS }-hoverInfo`, store.state.hoverInfo );
		},
		clearSpan,
		handleSpanOver,
		/** @param {InputEvent} event */
		handlePlaybackChange( event ) {
			const value = /** @type {HTMLInputElement} */ ( event.target )
				.valueAsNumber;
			store.state.playbackPoint = value - 1;
			setResultViewDefault();
			touchState();
			renderHtmlApiOutput();
			renderPreview();
		},
		/** @param {MouseEvent} event */
		handleCopyTreeClick: function* ( event ) {
			const useDomTree =
				/** @type {HTMLButtonElement} */ ( event.target ).name === 'tree__dom';
			const tree = useDomTree
				? CONTEXT_ELEMENT ?? RENDERED_IFRAME.contentWindow?.document
				: store.state.playbackTree ??
					store.state.htmlapiResponse.result?.tree;
			try {
				yield navigator.clipboard.writeText(
					printHtmlApiTreeText( tree, store.state.options ),
				);
			} catch {
				window.alert( 'Copy failed, make sure the browser window is focused.' );
			}
		},
		handleCopyClick: function* () {
			const select = /** @type {HTMLSelectElement} */ (
				document.getElementById( 'htmlapi-wp-version' )
			);
			const url = controller.getPlaygroundUrl(
				PLAYGROUND_BASE,
				getResolvedHtmlOptions(),
				select.value,
			);
			yield copyUrl( url );
		},
		/** @param {InputEvent} event */
		handleCopyCorePrInput( event ) {
			store.state.previewCorePrNumber = positiveInputNumber( event );
		},
		/** @param {InputEvent} event */
		handleCopyGutenbergPrInput( event ) {
			store.state.previewGutenbergPrNumber = positiveInputNumber( event );
		},
		handleCopyPrClick: function* () {
			const url = controller.getPlaygroundUrl(
				PLAYGROUND_BASE,
				getResolvedHtmlOptions(),
			);
			if ( store.state.previewCorePrNumber !== null ) {
				url.searchParams.set(
					'core-pr',
					String( store.state.previewCorePrNumber ),
				);
			}
			if ( store.state.previewGutenbergPrNumber !== null ) {
				url.searchParams.set(
					'gutenberg-pr',
					String( store.state.previewGutenbergPrNumber ),
				);
			}
			yield copyUrl( url );
		},
	},

	callbacks: {
		run: function* () {
			mutationObserver = new MutationObserver( () => {
				store.state.hasMutatedDom = true;
				const document = RENDERED_IFRAME.contentWindow?.document;
				if ( document !== undefined ) {
					redrawDomTree( document, CONTEXT_ELEMENT );
				}
			} );
			touchState();
			renderPreview();
			if ( controller.urlError === null ) {
				yield settleControllerOperation( controller.start() );
			}
		},
		watch() {
			renderHtmlApiOutput();
			redrawCurrentDomTree();
		},
	},
} );

const documentPreview = new ByteDocumentPreview( RENDERED_IFRAME );
previewCoordinator = new BytePreviewCoordinator( {
	preview: documentPreview,
	iframe: RENDERED_IFRAME,
	resolveFragmentTarget: ( document ) =>
		resolveFragmentTarget(
			document,
			projectUtf8( controller.contextBytes ),
		),
	onCurrentDocument( details ) {
		CONTEXT_ELEMENT = details.contextElement;
		store.state.fragmentProjectionLossy = details.fragmentLossy;
		store.state.hasMutatedDom = false;
		updateDomInfo( details.document, details.contextElement );
		redrawDomTree( details.document, details.contextElement );
		observeDocument( details.document );
		touchState();
	},
	restoreCurrentDocument( details ) {
		CONTEXT_ELEMENT = null;
		store.state.fragmentProjectionLossy = false;
		store.state.hasMutatedDom = false;
		updateDomInfo( details.document, null );
		redrawDomTree( details.document, null );
		observeDocument( details.document );
		touchState();
	},
	disconnectObserver() {
		mutationObserver?.disconnect();
	},
	pagehideTarget: window,
} );

window.addEventListener( 'pagehide', () => requestBoundary.dispose(), {
	once: true,
} );

/** @param {SourceKind} kind */
function sourceBytes( kind ) {
	return kind === 'html' ? controller.htmlBytes : controller.contextBytes;
}

/** @param {SourceKind} kind */
function sourceText( kind ) {
	const bytes = sourceBytes( kind );
	return isValidUtf8( bytes ) ? decodeUtf8( bytes ) : projectUtf8( bytes );
}

/** @param {Uint8Array} bytes */
function displayBytes( bytes ) {
	const text = projectUtf8( bytes );
	return store.state.showInvisible ? replaceInvisible( text ) : text;
}

/** @param {unknown} value */
function displayOptionalString( value ) {
	if ( typeof value !== 'string' ) {
		return value ?? null;
	}
	return store.state.showInvisible ? replaceInvisible( value ) : value;
}

/** @param {Uint8Array} bytes */
function byteRowsText( bytes ) {
	const rows = formatByteRows( bytes );
	if ( rows.length === 0 ) {
		return '(empty)';
	}
	return rows
		.map(
			( row ) =>
				`${ row.offset.toString( 16 ).toUpperCase().padStart( 8, '0' ) }  ${ row.hex.padEnd( 47 ) }  |${ row.gutter }|`,
		)
		.join( '\n' );
}

function currentProcessedBytes() {
	return controller.getProcessedBytes( store.state.playbackPoint );
}

function touchState() {
	store.state.revision += 1;
	store.state.urlUnusuallyLong =
		controller.urlError === null && controller.isUrlUnusuallyLong( 8192 );
}

/** @param {Promise<unknown>} operation */
async function settleControllerOperation( operation ) {
	if ( controller.isProcessing ) {
		beginPendingResponse();
	}
	try {
		const result = await operation;
		if ( result !== null ) {
			applyControllerResponse();
		}
	} catch ( error ) {
		if (
			error instanceof SupersededRuntimeOperationError ||
			error instanceof DisposedRuntimeBoundaryError
		) {
			return;
		}
		store.state.transportError = describeError( error );
	} finally {
		store.state.processing = controller.isProcessing;
		touchState();
		renderHtmlApiOutput();
		renderPreview();
	}
}

/** @param {unknown} error */
function reportControllerError( error ) {
	store.state.transportError = describeError( error );
	store.state.processing = controller.isProcessing;
	touchState();
	renderHtmlApiOutput();
	renderPreview();
}

function applyControllerResponse() {
	const projected = controller.projectedResponse;
	if ( projected === null ) {
		return;
	}
	store.state.htmlapiResponse = projected;
	store.state.playbackPoint = null;
	setResultViewDefault();
	const normalized = controller.normalizedBytes;
	store.state.normalizedView =
		normalized === null || isValidUtf8( normalized ) ? 'text' : 'bytes';
}

function beginPendingResponse() {
	store.state.playbackPoint = null;
	store.state.htmlapiResponse = {
		supports: cfg.supports,
		html: '',
		error: null,
		result: null,
		normalizedHtml: null,
	};
	store.state.transportError = null;
	store.state.processing = true;
	touchState();
	renderHtmlApiOutput();
}

function setResultViewDefault() {
	store.state.processedView = isValidUtf8( currentProcessedBytes() )
		? 'text'
		: 'bytes';
}

/** @param {SourceKind} kind */
async function convertSourceToText( kind ) {
	store.state.transportError = null;
	try {
		const wasMalformed = ! isValidUtf8( sourceBytes( kind ) );
		const operation = controller.requestTextEditing( kind );
		const conversionStarted =
			wasMalformed && isValidUtf8( sourceBytes( kind ) );
		if ( conversionStarted ) {
			store.state[ `${ kind }View` ] = 'text';
			beginPendingResponse();
			touchState();
			renderPreview();
		}
		const applied = await settleUiConversion( operation, () => {
			store.state[ `${ kind }View` ] = 'text';
			store.state.playbackPoint = null;
			applyControllerResponse();
		} );
		if ( ! applied ) {
			return;
		}
	} catch ( error ) {
		store.state.transportError = describeError( error );
	} finally {
		store.state.processing = controller.isProcessing;
		touchState();
		renderHtmlApiOutput();
		renderPreview();
	}
}

function renderPreview() {
	if ( controller.urlError !== null ) {
		return;
	}
	try {
		const started = previewCoordinator.render(
			controller.getPreviewPlan( store.state.playbackPoint ),
		);
		if ( started ) {
			store.state.previewError = null;
			store.state.fragmentProjectionLossy = false;
		}
	} catch ( error ) {
		store.state.previewError = describeError( error );
	}
}

function renderHtmlApiOutput() {
	const processed = document.getElementById( 'processed-html' );
	if ( processed !== null ) {
		processed.classList.remove( 'has-highlighted-span' );
		processed.textContent = store.state.processedText;
	}

	const tree =
		store.state.playbackTree ?? store.state.htmlapiResponse.result?.tree;
	const holder = document.getElementById( 'html_api_result_holder' );
	if ( holder !== null ) {
		if ( tree ) {
			printHtmlApiTree(
				tree,
				/** @type {HTMLUListElement} */ ( holder ),
				store.state.options,
			);
		} else {
			holder.replaceChildren();
		}
	}
}

function clearSpan() {
	const element = document.getElementById( 'processed-html' );
	if ( element === null ) {
		return;
	}
	element.classList.remove( 'has-highlighted-span' );
	element.textContent = store.state.processedText;
}

/** @param {MouseEvent} event */
function handleSpanOver( event ) {
	const target = /** @type {HTMLElement} */ ( event.target );
	const spanElement = target.hasAttribute( 'data-span-start' )
		? target
		: target.closest( '[data-span-start]' );
	if ( ! ( spanElement instanceof HTMLElement ) ) {
		return;
	}
	const start = Number( spanElement.dataset[ 'spanStart' ] );
	const length = Number( spanElement.dataset[ 'spanLength' ] );
	let split;
	try {
		split = controller.splitProcessedSpan(
			start,
			length,
			store.state.playbackPoint,
		);
	} catch ( error ) {
		store.state.previewError = describeError( error );
		return;
	}

	const nodes = [ split.before, split.current, split.after ].map( ( bytes ) =>
		document.createTextNode( displayBytes( bytes ) ),
	);
	const before = /** @type {Text} */ ( nodes[ 0 ] );
	const current = /** @type {Text} */ ( nodes[ 1 ] );
	const after = /** @type {Text} */ ( nodes[ 2 ] );
	const highlight = document.createElement( 'span' );
	highlight.className = 'highlight-span';
	highlight.append( current );
	const element = document.getElementById( 'processed-html' );
	if ( element !== null ) {
		element.classList.add( 'has-highlighted-span' );
		element.replaceChildren( before, highlight, after );
	}
}

/** @param {Document} document @param {Element|null} contextElement */
function updateDomInfo( document, contextElement ) {
	store.state.DOM.documentTitle = document.title;
	store.state.DOM.renderingMode = document.compatMode;
	store.state.DOM.doctypeName = document.doctype?.name ?? '';
	store.state.DOM.doctypeSystemId = document.doctype?.systemId ?? '';
	store.state.DOM.doctypePublicId = document.doctype?.publicId ?? '';
	store.state.DOM.contextNode = contextElement?.nodeName ?? '';
}

/** @param {Document} document @param {Element|null} contextElement */
function redrawDomTree( document, contextElement ) {
	const holder = globalThis.document.getElementById( 'dom_tree' );
	if ( holder === null ) {
		return;
	}
	printHtmlApiTree(
		contextElement ?? document,
		/** @type {HTMLUListElement} */ ( holder ),
		store.state.options,
	);
}

function redrawCurrentDomTree() {
	const document = RENDERED_IFRAME.contentWindow?.document;
	if ( document !== undefined ) {
		redrawDomTree( document, CONTEXT_ELEMENT );
	}
}

/** @param {Document} document */
function observeDocument( document ) {
	if ( mutationObserver === null ) {
		return;
	}
	mutationObserver.observe( document, {
		subtree: true,
		childList: true,
		attributes: true,
		characterData: true,
	} );
	for ( const template of document.getElementsByTagNameNS(
		'http://www.w3.org/1999/xhtml',
		'template',
	) ) {
		mutationObserver.observe( /** @type {HTMLTemplateElement} */ ( template ).content, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: true,
		} );
	}
}

/** @param {unknown} error */
function describeError( error ) {
	if ( error instanceof Response ) {
		return `REST request failed with HTTP ${ error.status }.`;
	}
	return error instanceof Error ? error.message : String( error );
}

/** @param {URL} url */
async function copyUrl( url ) {
	try {
		await navigator.clipboard.writeText( url.href );
	} catch {
		window.alert( 'Copy failed, make sure the browser window is focused.' );
	}
}

/** @param {Event} event */
function positiveInputNumber( event ) {
	const value = /** @type {HTMLInputElement} */ ( event.target ).valueAsNumber;
	return Number.isFinite( value ) && value > 0 ? value : null;
}

/** @param {BooleanConfigurationOption} option */
function getInitialBooleanConfigurationValue( option ) {
	const override = booleanConfigurationOverrides[ option ];
	return override ?? Boolean( localStorage.getItem( `${ NS }-${ option }` ) );
}

/** @returns {Record<BooleanConfigurationOption, boolean|null>} */
function getInitialBooleanConfigurationOverrides() {
	const overrides = /** @type {Record<BooleanConfigurationOption, boolean|null>} */ ( {
		showClosers: null,
		showInvisible: null,
		showVirtual: null,
	} );
	for ( const value of controller.opts ) {
		for ( const [ enabled, disabled, option ] of BOOLEAN_CONFIGURATION_OPTIONS ) {
			if ( value === enabled ) {
				overrides[ option ] = true;
			} else if ( value === disabled ) {
				overrides[ option ] = false;
			}
		}
	}
	return overrides;
}

/** @param {(option: BooleanConfigurationOption) => boolean|null} getValue */
function buildHtmlOptions( getValue ) {
	let options = '';
	for ( const [ enabled, disabled, option ] of BOOLEAN_CONFIGURATION_OPTIONS ) {
		const value = getValue( option );
		if ( value === true ) {
			options += enabled;
		} else if ( value === false ) {
			options += disabled;
		}
	}
	return options;
}

function getExplicitHtmlOptions() {
	return buildHtmlOptions( ( option ) => booleanConfigurationOverrides[ option ] );
}

function getResolvedHtmlOptions() {
	return buildHtmlOptions( ( option ) => Boolean( store.state[ option ] ) );
}

/** @param {BooleanConfigurationOption} stateKey */
function getToggleHandler( stateKey ) {
	/** @param {Event} event */
	return ( event ) => {
		const checked = /** @type {HTMLInputElement} */ ( event.target ).checked;
		const previousOverride = booleanConfigurationOverrides[ stateKey ];
		beginUiOperation(
			() => {
				booleanConfigurationOverrides[ stateKey ] = checked;
				try {
					controller.setOpts( getExplicitHtmlOptions() );
				} catch ( error ) {
					booleanConfigurationOverrides[ stateKey ] = previousOverride;
					throw error;
				}
			},
			() => {
				store.state[ stateKey ] = checked;
				if ( checked ) {
					localStorage.setItem( `${ NS }-${ stateKey }`, '1' );
				} else {
					localStorage.removeItem( `${ NS }-${ stateKey }` );
				}
				touchState();
			},
			reportControllerError,
		);
	};
}
