import {
	printHtmlApiTree,
	printHtmlApiTreeText,
} from '@html-api-debugger/print-html-tree';
import { replaceInvisible } from '@html-api-debugger/replace-invisible-chars';
import * as I from '@wordpress/interactivity';

const NS = 'kses-debugger';

const DEBOUNCE_TIMEOUT = 150;

const cfg = I.getConfig( NS );
let { nonce } = cfg;

/** @type {AbortController|null} */
let inFlightRequestAbortController = null;

/** @type {AbortController|null} */
let debounceInputAbortController = null;

/**
 * @typedef Supports
 * @property {boolean} dual
 * @property {boolean} forceLegacyFilter
 *
 *
 * @typedef BlockTree
 * @property {any|null} tree
 * @property {string|null} error
 *
 *
 * @typedef Recognizers
 * @property {ReadonlyArray<string>} parseBlocks
 * @property {ReadonlyArray<string>|null} blockProcessor
 * @property {boolean} disagree
 * @property {string|null} error
 *
 *
 * @typedef KsesOutput
 * @property {string|null} html
 * @property {string|null} error
 * @property {ReadonlyArray<string>} diagnostics
 * @property {BlockTree} blocks
 * @property {Recognizers} recognizers
 *
 *
 * @typedef KsesResponse
 * @property {Supports} supports
 * @property {string} html
 * @property {string} context
 * @property {ReadonlyArray<string>} notices
 * @property {{blocks: BlockTree, recognizers: Recognizers}} input
 * @property {KsesOutput} legacy
 * @property {KsesOutput} htmlApi
 *
 *
 * @typedef Options
 * @property {boolean} showClosers
 * @property {boolean} showInvisible
 * @property {boolean} showVirtual
 *
 *
 * @typedef {'showClosers'|'showInvisible'|'showVirtual'} BooleanConfigurationOption
 *
 *
 * @typedef State
 * @property {string} html
 * @property {string} ksesContext
 * @property {KsesResponse} ksesResponse
 * @property {boolean} showClosers
 * @property {boolean} showInvisible
 * @property {boolean} showVirtual
 * @property {string|null} requestError
 * @property {string} formattedKsesResponse
 * @property {Options} options
 *
 *
 * @typedef Store
 * @property {()=>void} callAPI
 * @property {(e: InputEvent)=>void} handleInput
 * @property {(e: Event)=>void} handleContextChange
 * @property {(e: Event)=>void} handleShowClosersClick
 * @property {(e: Event)=>void} handleShowInvisibleClick
 * @property {(e: Event)=>void} handleShowVirtualClick
 * @property {(e: Event)=>void} handleCopyTreeClick
 * @property {(pane: string)=>void} printDomTree
 * @property {()=>void} render
 * @property {()=>void} run
 * @property {()=>void} watch
 * @property {()=>void} watchURL
 * @property {State} state
 */

const createStore = /** @type {typeof I.store<Store>} */ ( I.store );

/**
 * One column per implementation, plus the input. The HTML API column is absent
 * from the page when `wp_sanitize_html_kses()` does not exist, so every lookup
 * tolerates a missing element.
 */
const PANES = /** @type {const} */ ( [ 'input', 'legacy', 'html-api' ] );

/** @type {Store} */
const store = createStore( NS, {
	state: {
		showClosers: localStorage.getItem( `${ NS }-showClosers` ) === '1',
		showInvisible: localStorage.getItem( `${ NS }-showInvisible` ) === '1',
		showVirtual: localStorage.getItem( `${ NS }-showVirtual` ) === '1',

		get options() {
			return {
				showClosers: store.state.showClosers,
				showInvisible: store.state.showInvisible,
				showVirtual: store.state.showVirtual,
			};
		},

		get formattedKsesResponse() {
			return JSON.stringify( store.state.ksesResponse, undefined, 2 );
		},
	},

	run() {
		// The HTML parser replaces null bytes, so the server cannot print them
		// into the textarea. Restore them from state.
		if ( store.state.html.includes( '\0' ) ) {
			/** @type {HTMLTextAreaElement} */ (
				document.getElementById( 'kses-input-html' )
			).value = store.state.html;
		}

		for ( const pane of PANES ) {
			document
				.getElementById( `kses-iframe-${ pane }` )
				?.addEventListener( 'load', () => store.printDomTree( pane ), {
					passive: true,
				} );
		}

		store.render();

		// Browsers eat some characters from search params, newlines especially.
		// Clean up the URL.
		store.watchURL();
	},

	watch() {
		store.render();
	},

	render() {
		const options = { ...store.state.options };

		for ( const pane of PANES ) {
			const html = getHtml( pane );

			const pre = document.getElementById( `kses-output-${ pane }` );
			if ( pre ) {
				pre.textContent = forDisplay( html );
			}

			const ul = /** @type {HTMLUListElement|null} */ (
				document.getElementById( `kses-blocks-${ pane }` )
			);
			if ( ul ) {
				printHtmlApiTree( getBlockTree( pane ) ?? { childNodes: [] }, ul, options );
			}

			renderRecognizers( pane );

			const iframe = /** @type {HTMLIFrameElement|null} */ (
				document.getElementById( `kses-iframe-${ pane }` )
			);
			const doc = iframe?.contentWindow?.document;
			if ( doc ) {
				doc.open();
				doc.write( html ?? '' );
				doc.close();
			}

			store.printDomTree( pane );
		}
	},

	/**
	 * Print a pane's DOM tree from its iframe.
	 *
	 * Called after writing the iframe and again on its load event: `write()`
	 * makes the tree available at once, but a load may replace the document.
	 *
	 * @param {string} pane
	 */
	printDomTree( pane ) {
		const ul = /** @type {HTMLUListElement|null} */ (
			document.getElementById( `kses-dom-tree-${ pane }` )
		);
		const iframe = /** @type {HTMLIFrameElement|null} */ (
			document.getElementById( `kses-iframe-${ pane }` )
		);
		const doc = iframe?.contentWindow?.document;
		if ( ul && doc ) {
			printHtmlApiTree( doc, ul, { ...store.state.options } );
		}
	},

	/** @param {InputEvent} e */
	handleInput: function* ( e ) {
		store.state.html = /** @type {HTMLTextAreaElement} */ ( e.target ).value;
		store.watchURL();

		debounceInputAbortController?.abort( 'debounced' );
		debounceInputAbortController = new AbortController();
		try {
			yield new Promise( ( resolve, reject ) => {
				const t = setTimeout( resolve, DEBOUNCE_TIMEOUT );
				debounceInputAbortController?.signal.addEventListener( 'abort', () => {
					clearTimeout( t );
					reject( debounceInputAbortController?.signal.reason );
				} );
			} );
		} catch ( err ) {
			if ( err === 'debounced' ) {
				return;
			}
			throw err;
		}

		yield store.callAPI();
	},

	/** @param {Event} e */
	handleContextChange: function* ( e ) {
		store.state.ksesContext = /** @type {HTMLSelectElement} */ (
			e.target
		).value;
		store.watchURL();
		yield store.callAPI();
	},

	handleShowClosersClick: getToggleHandler( 'showClosers' ),
	handleShowInvisibleClick: getToggleHandler( 'showInvisible' ),
	handleShowVirtualClick: getToggleHandler( 'showVirtual' ),

	/** @param {Event} e */
	handleCopyTreeClick: function* ( e ) {
		const name = /** @type {HTMLButtonElement} */ ( e.target ).name;
		const [ kind, pane ] = name.split( '__' );

		let tree;
		if ( kind === 'dom' ) {
			tree = /** @type {HTMLIFrameElement|null} */ (
				document.getElementById( `kses-iframe-${ pane }` )
			)?.contentWindow?.document;
		} else {
			tree = getBlockTree( pane ?? '' );
		}

		if ( ! tree ) {
			return;
		}

		try {
			yield navigator.clipboard.writeText(
				printHtmlApiTreeText( tree, { ...store.state.options } ),
			);
		} catch {
			alert( 'Copy failed, make sure the browser window is focused.' );
		}
	},

	watchURL() {
		const u = new URL( document.location.href );
		let shouldReplace = false;
		for ( const [ param, value ] of /** @type {const} */ ( [
			[ 'html', store.state.html ],
			[ 'context', store.state.ksesContext ],
		] ) ) {
			if ( value ) {
				if ( u.searchParams.get( param ) !== value ) {
					u.searchParams.set( param, value );
					shouldReplace = true;
				}
			} else if ( u.searchParams.has( param ) ) {
				u.searchParams.delete( param );
				shouldReplace = true;
			}
		}
		if ( shouldReplace ) {
			history.replaceState( null, '', u );
		}
	},

	callAPI: function* () {
		inFlightRequestAbortController?.abort( 'request superseded' );
		inFlightRequestAbortController = new AbortController();

		let data;
		try {
			/** @type {Response} */
			const response = yield fetch( cfg.restEndpoint, {
				method: 'POST',
				body: JSON.stringify( {
					html: store.state.html,
					context: store.state.ksesContext,
				} ),
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': nonce,
				},
				signal: inFlightRequestAbortController.signal,
			} );

			if ( response.headers.has( 'X-WP-Nonce' ) ) {
				nonce = response.headers.get( 'X-WP-Nonce' );
			}
			if ( ! response.ok ) {
				throw response;
			}

			// @ts-expect-error It's fine.
			data = yield response.json();
		} catch ( /** @type {any} */ err ) {
			if ( err === 'request superseded' || err instanceof DOMException ) {
				return;
			}

			if ( err instanceof Response ) {
				// @ts-expect-error It's fine.
				const text = yield err.text();
				store.state.requestError = text;
				return;
			}

			store.state.requestError = String( err );
			return;
		}

		store.state.requestError = null;
		store.state.ksesResponse = data;
	},
} );

/**
 * @param {string|null} html
 * @return {string}
 */
function forDisplay( html ) {
	if ( html === null ) {
		return '';
	}
	return store.state.showInvisible ? replaceInvisible( html ) : html;
}

/**
 * Render a pane's block-recognizer comparison.
 *
 * `parse_blocks()` and `WP_Block_Processor` implement the same block grammar
 * and disagree about where a delimiter may end. When they disagree, a delimiter
 * that the filter declined to touch can still be a block at render time, so the
 * disagreement is called out rather than left to be spotted.
 *
 * @param {string} pane
 */
function renderRecognizers( pane ) {
	const el = document.getElementById( `kses-recognizers-${ pane }` );
	if ( ! el ) {
		return;
	}

	const data = getRecognizers( pane );
	el.textContent = '';
	el.classList.remove( 'kses-debugger__recognizers--disagree' );

	if ( ! data ) {
		return;
	}

	if ( data.error ) {
		const pre = document.createElement( 'pre' );
		pre.className = 'error-holder';
		pre.textContent = data.error;
		el.appendChild( pre );
		return;
	}

	if ( data.disagree ) {
		el.classList.add( 'kses-debugger__recognizers--disagree' );
	}

	/**
	 * @param {string} label
	 * @param {ReadonlyArray<string>|null} blocks
	 */
	const addRow = ( label, blocks ) => {
		const row = document.createElement( 'p' );
		const name = document.createElement( 'code' );
		name.textContent = label;
		row.appendChild( name );
		row.appendChild(
			document.createTextNode(
				blocks === null
					? ': unavailable'
					: blocks.length === 0
						? ': no block'
						: `: ${ blocks.join( ', ' ) }`,
			),
		);
		el.appendChild( row );
	};

	addRow( 'parse_blocks()', data.parseBlocks );
	addRow( 'WP_Block_Processor', data.blockProcessor );

	if ( data.disagree ) {
		const warning = document.createElement( 'p' );
		warning.className = 'kses-debugger__disagree-note';
		warning.textContent =
			'The two recognizers disagree on these bytes. What KSES filtered is not what renders.';
		el.appendChild( warning );
	}
}

/**
 * @param {string} pane
 * @return {Recognizers|null}
 */
function getRecognizers( pane ) {
	switch ( pane ) {
		case 'input':
			return store.state.ksesResponse.input.recognizers;
		case 'legacy':
			return store.state.ksesResponse.legacy.recognizers;
		case 'html-api':
			return store.state.ksesResponse.htmlApi.recognizers;
		default:
			return null;
	}
}

/**
 * The block parser tree a pane displays.
 *
 * @param {string} pane
 * @return {any|null}
 */
function getBlockTree( pane ) {
	switch ( pane ) {
		case 'input':
			return store.state.ksesResponse.input.blocks.tree;
		case 'legacy':
			return store.state.ksesResponse.legacy.blocks.tree;
		case 'html-api':
			return store.state.ksesResponse.htmlApi.blocks.tree;
		default:
			return null;
	}
}

/**
 * The HTML a pane displays, renders and parses.
 *
 * @param {string} pane
 * @return {string|null}
 */
function getHtml( pane ) {
	switch ( pane ) {
		case 'input':
			return store.state.html;
		case 'legacy':
			return store.state.ksesResponse.legacy.html;
		case 'html-api':
			return store.state.ksesResponse.htmlApi.html;
		default:
			return null;
	}
}

/**
 * @param {BooleanConfigurationOption} stateKey
 * @return {(e: Event)=>void}
 */
function getToggleHandler( stateKey ) {
	return ( e ) => {
		const isChecked = /** @type {HTMLInputElement} */ ( e.target ).checked;

		store.state[ stateKey ] = isChecked;
		if ( isChecked ) {
			localStorage.setItem( `${ NS }-${ stateKey }`, '1' );
		} else {
			localStorage.removeItem( `${ NS }-${ stateKey }` );
		}
	};
}
