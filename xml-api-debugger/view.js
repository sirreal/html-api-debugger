import * as I from '@wordpress/interactivity';
import { printHtmlApiTree } from '@xml-api-debugger/print-html-tree';
import { replaceInvisible } from '@xml-api-debugger/replace-invisible-chars';

const NS = 'xml-api-debugger';

const DEBOUNCE_TIMEOUT = 150;
const RENDERED_IFRAME = /** @type {HTMLIFrameElement} */ (
	document.getElementById('rendered_iframe')
);

const cfg = I.getConfig(NS);
let { nonce } = cfg;

/** @type {AbortController|null} */
let inFlightRequestAbortController = null;

/** @type {AbortController|null} */
let debounceInputAbortController = null;

/**
 * @typedef DOM
 * @property {string} renderingMode
 * @property {string} title
 *
 *
 * @typedef HTMLAPISpan
 * @property {number} start
 * @property {number} length
 *
 *
 * @typedef Supports
 * @property {boolean} is_virtual
 * @property {boolean} quirks_mode
 * @property {boolean} full_parser
 *
 *
 * @typedef XmlApiResponse
 * @property {any} error
 * @property {Supports} supports
 * @property {{tree: any}|null} result
 * @property {string} xml
 *
 *
 * @typedef State
 * @property {string} formattedXmlapiResponse
 * @property {XmlApiResponse} xmlapiResponse
 * @property {string} playgroundLink
 * @property {string} xml
 * @property {boolean} showClosers
 * @property {boolean} showInvisible
 * @property {boolean} showVirtual
 * @property {boolean} quirksMode
 * @property {boolean} fullParser
 *
 * @property {'breadcrumbs'|'insertionMode'} hoverInfo
 * @property {boolean} hoverBreadcrumbs
 * @property {boolean} hoverInsertion
 *
 * @property {DOM} DOM
 * @property {HTMLAPISpan|null} span
 * @property {string} hoverSpan
 * @property {readonly []|readonly [string,string,string]} hoverSpanSplit
 */

/**
 * @typedef Store
 * @property {State} state
 * @property {()=>void} clearSpan
 * @property {()=>void} render
 * @property {()=>Promise<void>} callAPI
 *
 * @property {()=>void} handleShowInvisibleClick
 * @property {()=>void} handleShowClosersClick
 * @property {()=>void} handleShowVirtualClick
 * @property {()=>Promise<void>} handleQuirksModeClick
 * @property {()=>Promise<void>} handleFullParserClick
 */

/** @type {typeof I.store<Store>} */
const createStore = I.store;

/** @type {Store} */
// @ts-expect-error Server provided state is not included here.
const store = createStore(NS, {
	state: {
		showClosers: Boolean(localStorage.getItem(`${NS}-showClosers`)),
		showInvisible: Boolean(localStorage.getItem(`${NS}-showInvisible`)),
		showVirtual: Boolean(localStorage.getItem(`${NS}-showVirtual`)),
		quirksMode: Boolean(localStorage.getItem(`${NS}-quirksMode`)),
		fullParser: Boolean(localStorage.getItem(`${NS}-fullParser`)),

		hoverInfo: localStorage.getItem(`${NS}-hoverInfo`),

		get formattedXmlapiResponse() {
			return JSON.stringify(store.state.xmlapiResponse, undefined, 2);
		},

		get hoverBreadcrumbs() {
			return store.state.hoverInfo === 'breadcrumbs';
		},

		get hoverInsertion() {
			return store.state.hoverInfo === 'insertionMode';
		},

		//get playgroundLink() {
		//	// We'll embed a path in a URL.
		//	const searchParams = new URLSearchParams({ page: NS });
		//	if (store.state.xml) {
		//		searchParams.set('xml', store.state.xml);
		//	}
		//	const base = '/wp-admin/admin.php';
		//	const u = new URL(
		//		'https://playground.wordpress.net/?plugin=xml-api-debugger&php-extension-bundle=light',
		//	);
		//	u.searchParams.set('url', `${base}?${searchParams.toString()}`);
		//	return u.href;
		//},

		get hoverSpan() {
			/** @type {string | undefined} */
			const xml = store.state.xmlapiResponse.xml;
			if (!xml) {
				return '';
			}
			return store.state.showInvisible ? replaceInvisible(xml) : xml;
		},

		get hoverSpanSplit() {
			/** @type {string | undefined} */
			const xml = store.state.xmlapiResponse.xml;
			if (!xml || !store.state.span) {
				return /** @type {const} */ ([]);
			}
			const buf = new TextEncoder().encode(xml);
			const decoder = new TextDecoder();

			const { start: spanStart, length } = store.state.span;
			const spanEnd = spanStart + length;
			const split = /** @type {const} */ ([
				decoder.decode(buf.slice(0, spanStart)),
				decoder.decode(buf.slice(spanStart, spanEnd)),
				decoder.decode(buf.slice(spanEnd)),
			]);

			return store.state.showInvisible
				? // @ts-expect-error It's fine, really.
					/** @type {typeof split} */ (split.map(replaceInvisible))
				: split;
		},
	},
	run() {
		// The HTML parser will replace null bytes from the XML.
		// Force print them if we have null bytes.
		if (store.state.xml.includes('\0')) {
			/** @type {HTMLTextAreaElement} */ (
				document.getElementById('input_xml')
			).value = store.state.xml;
		}

		store.render();

		// browsers "eat" some characters from search params…
		// newlines seem especially problematic in chrome
		// lets clean up the URL
		const u = new URL(document.location.href);
		if (store.state.xml) {
			u.searchParams.set('xml', store.state.xml);
			history.replaceState(null, '', u);
		} else if (u.searchParams.has('xml')) {
			u.searchParams.delete('xml');
			history.replaceState(null, '', u);
		}
	},

	/** @param {Event} e */
	onRenderedIframeLoad() {
		// @ts-expect-error It better be defined!
		const doc = RENDERED_IFRAME.contentWindow.document;

		store.state.DOM.renderingMode = doc.compatMode;
		store.state.DOM.title = doc.title || '[document has no title]';

		printHtmlApiTree(
			doc,
			// @ts-expect-error
			document.getElementById('dom_tree'),
			{
				showClosers: store.state.showClosers,
				showInvisible: store.state.showInvisible,
				showVirtual: store.state.showVirtual,
				hoverInfo: store.state.hoverInfo,
			},
		);
	},
	clearSpan() {
		store.state.span = null;
	},

	/** @param {InputEvent} e */
	handleChange: function* (e) {
		const val = /** @type {HTMLTextAreaElement} */ (e.target).value;

		store.state.xml = val;

		const u = new URL(document.location.href);
		u.searchParams.set('xml', val);
		history.replaceState(null, '', u);

		debounceInputAbortController?.abort('debounced');
		debounceInputAbortController = new AbortController();
		try {
			yield new Promise((resolve, reject) => {
				const t = setTimeout(resolve, DEBOUNCE_TIMEOUT);
				debounceInputAbortController?.signal.addEventListener('abort', () => {
					clearInterval(t);
					reject(debounceInputAbortController?.signal.reason);
				});
			});
		} catch (e) {
			if (e === 'debounced') {
				return;
			}
			throw e;
		}

		yield store.callAPI();
	},

	handleCopyClick: function* () {
		yield navigator.clipboard.writeText(store.state.playgroundLink);
	},

	/** @param {Event} e */
	handleSpanClick(e) {
		const t = e.target;
		if (t && t instanceof HTMLElement) {
			/** @type {HTMLElement|null} */
			const spanEl = t.closest('[data-span-start]');
			if (spanEl) {
				const start = Number(spanEl.dataset['spanStart']);
				const length = Number(spanEl.dataset['spanLength']);
				store.state.span = { start, length };
			}
		}
	},

	handleShowInvisibleClick: getToggleHandler('showInvisible'),
	handleShowClosersClick: getToggleHandler('showClosers'),
	handleShowVirtualClick: getToggleHandler('showVirtual'),
	handleQuirksModeClick: getToggleHandlerWithRefetch('quirksMode'),
	handleFullParserClick: getToggleHandlerWithRefetch('fullParser'),

	/** @param {Event} e */
	hoverInfoChange: (e) => {
		// @ts-expect-error
		store.state.hoverInfo = e.target.value;
		localStorage.setItem(`${NS}-hoverInfo`, store.state.hoverInfo);
	},

	watch() {
		store.render();
	},

	// @ts-expect-error This will be transformed by the Interactivity API runtime when called through the store.
	/** @returns {Promise<void>} */
	callAPI: function* () {
		inFlightRequestAbortController?.abort('request superseded');
		inFlightRequestAbortController = new AbortController();
		let data;
		try {
			/** @type {Response} */
			const response = yield fetch(cfg.restEndpoint, {
				method: 'POST',
				body: JSON.stringify({
					xml: store.state.xml,
				}),
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': nonce,
				},
				signal: inFlightRequestAbortController.signal,
			});

			if (response.headers.has('X-WP-Nonce')) {
				nonce = response.headers.get('X-WP-Nonce');
			}
			if (!response.ok) {
				throw response;
			}
			data = yield response.json();
		} catch (/** @type {any} */ err) {
			if (err === 'request superseded' || err instanceof DOMException) {
				return;
			}

			store.state.xmlapiResponse.result = null;

			if (err instanceof Response) {
				yield err
					.json()
					.then((j) => {
						let msg = '';
						if (j?.code) {
							msg = j.code;
						}
						if (j?.data?.error) {
							if (msg) {
								msg += ': ';
							}
							msg += `${j.data.error.message} in ${j.data.error.file}:${j.data.error.line}`;
						}
						if (msg) {
							store.state.xmlapiResponse.error = msg;
						} else {
							// Fallback to catch
							throw 'no msg';
						}
					})
					.catch(() =>
						err.text().then((t) => {
							store.state.xmlapiResponse.error = t;
						}),
					)
					.catch(() => {
						store.state.xmlapiResponse.error = 'unknown error';
					});
				return;
			}
			throw err;
		}

		store.state.xmlapiResponse = data;
		store.clearSpan();

		if (data.error) {
			/** @type {HTMLUListElement} */ (
				document.getElementById('xml_api_result_holder')
			).innerHTML = '';
			return;
		}
	},

	watchDom() {
		const doc =
			// @ts-expect-error
			document.getElementById('rendered_iframe').contentWindow.document;
		printHtmlApiTree(
			doc,
			// @ts-expect-error
			document.getElementById('dom_tree'),
			{
				showClosers: store.state.showClosers,
				showInvisible: store.state.showInvisible,
				showVirtual: store.state.showVirtual,
				hoverInfo: store.state.hoverInfo,
			},
		);
	},

	render() {
		// @ts-expect-error This should not be null.
		const iframeDocument = RENDERED_IFRAME.contentWindow.document;
		iframeDocument.open();
		iframeDocument.write(store.state.xml);
		iframeDocument.close();

		if (store.state.xmlapiResponse.result?.tree) {
			printHtmlApiTree(
				store.state.xmlapiResponse.result.tree,
				// @ts-expect-error
				document.getElementById('xml_api_result_holder'),
				{
					showClosers: store.state.showClosers,
					showInvisible: store.state.showInvisible,
					showVirtual: store.state.showVirtual,
					hoverInfo: store.state.hoverInfo,
				},
			);
		}
	},
});

/** @param {keyof State} stateKey */
function getToggleHandler(stateKey) {
	/**
	 * @param {Event} e
	 * @returns {void}
	 */
	return (e) => {
		// @ts-expect-error
		if (e.target.checked) {
			// @ts-expect-error
			store.state[stateKey] = true;
			localStorage.setItem(`${NS}-${stateKey}`, '1');
		} else {
			// @ts-expect-error
			store.state[stateKey] = false;
			localStorage.removeItem(`${NS}-${stateKey}`);
		}
	};
}

/**
 * @param {keyof State} stateKey
 * @return {(e: Event) => Promise<void>}
 */
function getToggleHandlerWithRefetch(stateKey) {
	const f1 = getToggleHandler(stateKey);

	/**
	 * @param {Event} e
	 */
	// @ts-expect-error The iAPI runtime transforms the generator to an async function.
	return function* (e) {
		f1(e);
		yield store.callAPI();
	};
}
