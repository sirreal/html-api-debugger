import {
	printHtmlApiTree,
	printHtmlApiTreeText,
} from '@html-api-debugger/print-html-tree';
import { replaceInvisible } from '@html-api-debugger/replace-invisible-chars';
import * as I from '@wordpress/interactivity';

const NS = 'html-api-debugger';

const DEBOUNCE_TIMEOUT = 150;
const RENDERED_IFRAME = /** @type {HTMLIFrameElement} */ (
	document.getElementById('rendered_iframe')
);

/** @type {Element|null} */
let CONTEXT_ELEMENT = null;

const cfg = I.getConfig(NS);
let { nonce } = cfg;

/** @type {AbortController|null} */
let inFlightRequestAbortController = null;

/** @type {AbortController|null} */
let debounceInputAbortController = null;

/** @type {MutationObserver|null} */
let mutationObserver = null;

/**
 * @typedef Link
 * @property {string} href
 * @property {string} text
 *
 *
 * @typedef DOM
 * @property {string|undefined} renderingMode
 * @property {string|undefined} documentTitle
 * @property {string|undefined} doctypeName
 * @property {string|undefined} doctypeSystemId
 * @property {string|undefined} doctypePublicId
 * @property {string|undefined} contextNode
 *
 *
 * @typedef HTMLAPISpan
 * @property {number} start
 * @property {number} length
 *
 *
 * @typedef Supports
 * @property {boolean} create_fragment_advanced
 *
 *
 * @typedef HtmlApiResponse
 * @property {any} error
 * @property {Supports} supports
 * @property {{tree: any, compatMode: string, documentTitle: string|null, doctypeName: string|null, doctypePublicId: string|null, doctypeSystemId: string|null, playback: ReadonlyArray<[string,any]> }|null} result
 * @property {string|null} normalizedHtml
 * @property {string} html
 *
 *
 * @typedef Options
 * @property {boolean} showClosers
 * @property {boolean} showInvisible
 * @property {boolean} showVirtual
 * @property {'breadcrumbs'|'insertionMode'} hoverInfo
 *
 *
 * @typedef  State
 * @property {string|null} selector
 * @property {string|null} selectorErrorMessage
 * @property {boolean} showClosers
 * @property {boolean} showInvisible
 * @property {boolean} showVirtual
 * @property {'breadcrumbs'|'insertionMode'} hoverInfo
 * @property {any|undefined} playbackTree
 * @property {string|undefined} playbackHTML
 * @property {number|null} playbackPoint
 * @property {number|null} playbackLength
 * @property {string|null} htmlApiDocumentTitle
 * @property {string|null} htmlApiDoctypeName
 * @property {string|null} htmlApiDoctypePublicId
 * @property {string|null} htmlApiDoctypeSystemId
 * @property {string|null} normalizedHtml
 * @property {string} formattedHtmlapiResponse
 * @property {HtmlApiResponse} htmlapiResponse
 * @property {URL} playgroundLink
 * @property {string} html
 * @property {string} contextHTML
 * @property {string|null} contextHTMLForUse
 * @property {number|null} previewCorePrNumber
 * @property {number|null} previewGutenbergPrNumber
 * @property {Link|null} previewCoreLink
 * @property {Link|null} previewGutenbergLink
 * @property {boolean} checkingForPRPlaygroundLink
 * @property {boolean} hoverBreadcrumbs
 * @property {boolean} hoverInsertion
 * @property {DOM} DOM
 * @property {boolean} hasMutatedDom
 * @property {HTMLAPISpan|false} span
 * @property {string} htmlForDisplay
 * @property {Options} options
 *
 *
 * @typedef Store
 * @property {()=>void} callAPI
 * @property {()=>void} clearSpan
 * @property {()=>void} handleContextHtmlInput
 * @property {()=>void} handleCopyClick
 * @property {()=>void} handleCopyPrClick
 * @property {()=>void} handleCopyPrInput
 * @property {()=>void} handleInput
 * @property {()=>void} handleShowClosersClick
 * @property {()=>void} handleShowInvisibleClick
 * @property {()=>void} handleShowVirtualClick
 * @property {()=>void} onRenderedIframeLoad
 * @property {()=>void} redrawDOMTreeFromIframe
 * @property {()=>void} render
 * @property {()=>void} watch
 * @property {()=>void} watchURL
 * @property {State} state
 */

const createStore = /** @type {typeof I.store<Store>} */ (I.store);

/** @type {Store} */
const store = createStore(NS, {
	// @ts-expect-error Server provided state is not included here.
	state: {
		showClosers: Boolean(localStorage.getItem(`${NS}-showClosers`)),
		showInvisible: Boolean(localStorage.getItem(`${NS}-showInvisible`)),
		showVirtual: Boolean(localStorage.getItem(`${NS}-showVirtual`)),

		playbackPoint: null,
		previewCorePrNumber: null,
		previewGutenbergPrNumber: null,

		get options() {
			return {
				showClosers: store.state.showClosers,
				showInvisible: store.state.showInvisible,
				showVirtual: store.state.showVirtual,
				hoverInfo: store.state.hoverInfo,
				selector: store.state.selector,
			};
		},

		get playbackTree() {
			if (store.state.playbackPoint === null) {
				return undefined;
			}
			return store.state.htmlapiResponse.result?.playback?.[
				store.state.playbackPoint
			]?.[1];
		},

		get playbackHTML() {
			if (store.state.playbackPoint === null) {
				return undefined;
			}
			return store.state.htmlapiResponse.result?.playback?.[
				store.state.playbackPoint
			]?.[0];
		},

		get playbackLength() {
			return store.state.htmlapiResponse.result?.playback?.length;
		},

		get contextHTMLForUse() {
			return store.state.htmlapiResponse.supports.create_fragment_advanced
				? store.state.contextHTML.trim() || null
				: null;
		},

		/** @type {Link|null} */
		get previewCoreLink() {
			if (!store.state.previewCorePrNumber) {
				return null;
			}
			return {
				href: `https://github.com/WordPress/wordpress-develop/pull/${store.state.previewCorePrNumber}`,
				text: `wordpress-develop #${store.state.previewCorePrNumber}`,
			};
		},

		/** @type {Link|null} */
		get previewGutenbergLink() {
			if (!store.state.previewGutenbergPrNumber) {
				return null;
			}
			return {
				href: `https://github.com/WordPress/gutenberg/pull/${store.state.previewGutenbergPrNumber}`,
				text: `Gutenberg #${store.state.previewGutenbergPrNumber}`,
			};
		},

		hoverInfo: /** @type {typeof store.state.hoverInfo} */ (
			localStorage.getItem(`${NS}-hoverInfo`)
		),

		get htmlApiDocumentTitle() {
			return store.state.showInvisible
				? store.state.htmlapiResponse.result?.documentTitle &&
						replaceInvisible(store.state.htmlapiResponse.result.documentTitle)
				: store.state.htmlapiResponse.result?.documentTitle;
		},

		get htmlApiDoctypeName() {
			return store.state.showInvisible
				? store.state.htmlapiResponse.result?.doctypeName &&
						replaceInvisible(store.state.htmlapiResponse.result.doctypeName)
				: store.state.htmlapiResponse.result?.doctypeName;
		},

		get htmlApiDoctypePublicId() {
			return store.state.showInvisible
				? store.state.htmlapiResponse.result?.doctypePublicId &&
						replaceInvisible(store.state.htmlapiResponse.result.doctypePublicId)
				: store.state.htmlapiResponse.result?.doctypePublicId;
		},
		get htmlApiDoctypeSystemId() {
			return store.state.showInvisible
				? store.state.htmlapiResponse.result?.doctypeSystemId &&
						replaceInvisible(store.state.htmlapiResponse.result.doctypeSystemId)
				: store.state.htmlapiResponse.result?.doctypeSystemId;
		},

		get normalizedHtml() {
			if (!store.state.htmlapiResponse.normalizedHtml) {
				return '';
			}
			return store.state.showInvisible
				? replaceInvisible(store.state.htmlapiResponse.normalizedHtml)
				: store.state.htmlapiResponse.normalizedHtml;
		},

		get formattedHtmlapiResponse() {
			return JSON.stringify(store.state.htmlapiResponse, undefined, 2);
		},

		get hoverBreadcrumbs() {
			return store.state.hoverInfo === 'breadcrumbs';
		},

		get hoverInsertion() {
			return store.state.hoverInfo === 'insertionMode';
		},

		get playgroundLink() {
			// We'll embed a path in a URL.
			const searchParams = new URLSearchParams({ page: NS });
			if (store.state.html) {
				searchParams.set('html', store.state.html);
			}
			if (store.state.contextHTMLForUse) {
				searchParams.set('contextHTML', store.state.contextHTMLForUse);
			}
			const base = '/wp-admin/admin.php';
			const u = new URL(
				'https://playground.wordpress.net/?plugin=html-api-debugger',
			);
			u.searchParams.set('url', `${base}?${searchParams.toString()}`);
			return u;
		},

		get htmlForDisplay() {
			/** @type {string | undefined} */
			const html = store.state.playbackHTML ?? store.state.htmlapiResponse.html;
			if (!html) {
				return '';
			}
			return store.state.showInvisible ? replaceInvisible(html) : html;
		},
	},

	clearSpan() {
		const el = /** @type {HTMLElement} */ (
			document.getElementById('processed-html')
		);
		el.classList.remove('has-highlighted-span');
		el.textContent = store.state.htmlForDisplay;
	},

	/** @param {MouseEvent} e */
	handleSpanOver(e) {
		const target = /** @type {HTMLElement} */ (e.target);

		const html = store.state.playbackHTML ?? store.state.htmlapiResponse.html;
		if (!html) {
			return;
		}

		/** @type {HTMLElement|null} */
		const spanElement = target.dataset['spanStart']
			? target
			: target.closest('[data-span-start]');

		if (!spanElement) {
			return;
		}

		const { spanStart: spanStartVal, spanLength: spanLengthVal } =
			spanElement.dataset;
		if (!spanStartVal || !spanLengthVal) {
			return;
		}
		const spanStart = Number(spanStartVal);
		const spanLength = Number(spanLengthVal);

		const buf = new TextEncoder().encode(html);
		const decoder = new TextDecoder();

		const spanEnd = spanStart + spanLength;
		/** @type {readonly [Text,Text,Text]} */
		// @ts-expect-error trust me!
		const [before, current, after] = /** @type {const} */ ([
			decoder.decode(buf.slice(0, spanStart)),
			decoder.decode(buf.slice(spanStart, spanEnd)),
			decoder.decode(buf.slice(spanEnd)),
		]).map((text) => {
			const t = store.state.showInvisible ? replaceInvisible(text) : text;
			return document.createTextNode(t);
		});

		const highlightCurrent = document.createElement('span');
		highlightCurrent.className = 'highlight-span';
		highlightCurrent.appendChild(current);

		const el = /** @type {HTMLElement} */ (
			document.getElementById('processed-html')
		);
		el.classList.add('has-highlighted-span');
		el.replaceChildren(before, highlightCurrent, after);
	},

	run() {
		RENDERED_IFRAME.addEventListener('load', store.onRenderedIframeLoad, {
			passive: true,
		});

		// The HTML parser will replace null bytes from the HTML.
		// Force print them if we have null bytes.
		if (store.state.html.includes('\0')) {
			/** @type {HTMLTextAreaElement} */ (
				document.getElementById('input_html')
			).value = store.state.html;
		}

		store.render();

		// browsers "eat" some characters from search params…
		// newlines seem especially problematic in chrome.
		// Let's clean up the URL
		store.watchURL();

		mutationObserver = new MutationObserver(() => {
			store.state.hasMutatedDom = true;
			store.redrawDOMTreeFromIframe();
		});
	},

	onRenderedIframeLoad() {
		store.redrawDOMTreeFromIframe();

		// @ts-expect-error It better be defined!
		const doc = RENDERED_IFRAME.contentWindow.document;

		mutationObserver?.observe(doc, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: true,
		});
		Array.prototype.forEach.call(
			doc.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'template'),
			/** @param {HTMLTemplateElement} template */
			(template) => {
				mutationObserver?.observe(template.content, {
					subtree: true,
					childList: true,
					attributes: true,
					characterData: true,
				});
			},
		);
	},

	redrawDOMTreeFromIframe() {
		// @ts-expect-error It better be defined!
		const doc = RENDERED_IFRAME.contentWindow.document;

		store.state.DOM.documentTitle = doc.title;
		store.state.DOM.renderingMode = doc.compatMode;
		store.state.DOM.doctypeName = doc.doctype?.name;
		store.state.DOM.doctypeSystemId = doc.doctype?.systemId;
		store.state.DOM.doctypePublicId = doc.doctype?.publicId;

		/** @type {Element|null} */
		let contextElement = null;
		if (store.state.contextHTMLForUse) {
			const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
			while (walker.nextNode()) {
				// @ts-expect-error It's an Element!
				contextElement = walker.currentNode;
			}
			if (contextElement) {
				store.state.DOM.contextNode = contextElement.nodeName;
				contextElement.innerHTML = store.state.playbackHTML ?? store.state.html;
				CONTEXT_ELEMENT = contextElement;
			}
		}

		printHtmlApiTree(
			contextElement ?? doc,
			// @ts-expect-error
			document.getElementById('dom_tree'),
			store.state.options,
		);
	},

	/** @param {InputEvent} e */
	handleInput: function* (e) {
		const val = /** @type {HTMLTextAreaElement} */ (e.target).value;

		store.state.html = val;

		const u = new URL(document.location.href);
		u.searchParams.set('html', val);
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
		const url = new URL(store.state.playgroundLink);

		// @ts-expect-error This better exist.
		const wpVersion = document.getElementById('htmlapi-wp-version').value;
		url.searchParams.set('wp', wpVersion);

		try {
			yield navigator.clipboard.writeText(url.href);
		} catch {
			alert('Copy failed, make sure the browser window is focused.');
		}
	},

	handleShowInvisibleClick: getToggleHandler('showInvisible'),
	handleShowClosersClick: getToggleHandler('showClosers'),
	handleShowVirtualClick: getToggleHandler('showVirtual'),

	/** @param {Event} e */
	hoverInfoChange: (e) => {
		// @ts-expect-error
		store.state.hoverInfo = e.target.value;
		localStorage.setItem(`${NS}-hoverInfo`, store.state.hoverInfo);
	},

	watch() {
		store.render();
	},

	watchURL() {
		const u = new URL(document.location.href);
		let shouldReplace = false;
		for (const [param, prop] of /** @type {const} */ ([
			['html', 'html'],
			['contextHTML', 'contextHTMLForUse'],
		])) {
			if (store.state[prop]) {
				u.searchParams.set(param, store.state[prop]);
				shouldReplace = true;
			} else if (u.searchParams.has(param)) {
				u.searchParams.delete(param);
				shouldReplace = true;
			}
		}
		if (shouldReplace) {
			history.replaceState(null, '', u);
		}
	},

	callAPI: function* () {
		inFlightRequestAbortController?.abort('request superseded');
		inFlightRequestAbortController = new AbortController();
		let data;
		try {
			/** @type {Response} */
			const response = yield fetch(cfg.restEndpoint, {
				method: 'POST',
				body: JSON.stringify({
					html: store.state.html,
					contextHTML: store.state.contextHTMLForUse,
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

			// @ts-expect-error It's fine.
			data = yield response.json();
		} catch (/** @type {any} */ err) {
			if (err === 'request superseded' || err instanceof DOMException) {
				return;
			}

			store.state.htmlapiResponse.result = null;

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
							store.state.htmlapiResponse.error = msg;
						} else {
							// Fallback to catch
							throw 'no msg';
						}
					})
					.catch(() =>
						err.text().then((t) => {
							store.state.htmlapiResponse.error = t;
						}),
					)
					.catch(() => {
						store.state.htmlapiResponse.error = 'unknown error';
					});
				return;
			}
			throw err;
		}

		store.state.htmlapiResponse = data;
		store.state.playbackPoint = null;
		store.clearSpan();

		if (data.error) {
			/** @type {HTMLUListElement} */ (
				document.getElementById('html_api_result_holder')
			).innerHTML = '';
		}
	},

	render() {
		// @ts-expect-error This should not be null.
		const iframeDocument = RENDERED_IFRAME.contentWindow.document;
		mutationObserver?.disconnect();

		store.state.hasMutatedDom = false;

		const html =
			store.state.contextHTMLForUse ??
			store.state.playbackHTML ??
			store.state.html;

		CONTEXT_ELEMENT = null;
		iframeDocument.open();
		iframeDocument.write(html);
		iframeDocument.close();

		const tree =
			store.state.playbackTree ?? store.state.htmlapiResponse.result?.tree;

		const processedHtmlEl = /** @type {HTMLElement} */ (
			document.getElementById('processed-html')
		);
		processedHtmlEl.classList.remove('has-highlighted-span');
		processedHtmlEl.textContent = store.state.htmlForDisplay;

		if (tree) {
			printHtmlApiTree(
				tree,
				// @ts-expect-error
				document.getElementById('html_api_result_holder'),
				store.state.options,
			);
		}
	},

	/** @param {InputEvent} e */
	handleContextHtmlInput: function* (e) {
		store.state.contextHTML = /** @type {HTMLInputElement} */ (e.target).value;
		yield store.callAPI();
	},

	/** @param {InputEvent} e */
	handleCopyCorePrInput(e) {
		const val = /** @type {HTMLInputElement} */ (e.target).valueAsNumber;
		if (Number.isFinite(val) && val > 0) {
			store.state.previewCorePrNumber = val;
			return;
		}
		store.state.previewCorePrNumber = null;
	},

	/** @param {InputEvent} e */
	handleCopyGutenbergPrInput(e) {
		const val = /** @type {HTMLInputElement} */ (e.target).valueAsNumber;
		if (Number.isFinite(val) && val > 0) {
			store.state.previewGutenbergPrNumber = val;
			return;
		}
		store.state.previewGutenbergPrNumber = null;
	},

	handleCopyPrClick: function* () {
		const corePrNumber = store.state.previewCorePrNumber;
		const gbPrNumber = store.state.previewGutenbergPrNumber;

		const playgroundLink = new URL(store.state.playgroundLink);
		if (corePrNumber) {
			playgroundLink.searchParams.set('core-pr', String(corePrNumber));
		}
		if (gbPrNumber) {
			playgroundLink.searchParams.set('gutenberg-pr', String(gbPrNumber));
		}

		try {
			yield navigator.clipboard.writeText(playgroundLink.href);
		} catch {
			alert('Copy failed, make sure the browser window is focused.');
		}
	},

	/**
	 * @param {Event} e
	 */
	handleCopyTreeClick: function* (e) {
		const useDomTree =
			/** @type {HTMLButtonElement} */ (e.target).name === 'tree__dom';

		let tree;
		if (useDomTree) {
			tree =
				CONTEXT_ELEMENT ||
				// @ts-expect-error It's an Element!
				RENDERED_IFRAME.contentWindow.document;
		} else {
			tree =
				store.state.playbackTree ?? store.state.htmlapiResponse.result?.tree;
		}

		const textualTree = printHtmlApiTreeText(tree, store.state.options);

		try {
			yield navigator.clipboard.writeText(textualTree);
		} catch {
			alert('Copy failed, make sure the browser window is focused.');
		}
	},

	/** @param {InputEvent} e */
	handlePlaybackChange(e) {
		const val = /** @type {HTMLInputElement} */ (e.target).valueAsNumber;
		store.state.playbackPoint = val - 1;
	},

	/** @param {InputEvent} e */
	handleSelectorChange(e) {
		const val = /** @type {HTMLInputElement} */ (e.target).value.trim() || null;
		if (val) {
			try {
				// Test whether the selector is valid before setting it so it isn't applied.
				document.createDocumentFragment().querySelector(val);
				store.state.selector = val;
				store.state.selectorErrorMessage = null;
				return;
			} catch (/** @type {unknown} */ e) {
				if (e instanceof DOMException && e.name === 'SyntaxError') {
					let msg = e.message;

					/*
					 * The error message includes methods about our test.
					 * Chrome:
					 * > Failed to execute 'querySelector' on 'DocumentFragment': 'foo >' is not a valid selector.
					 * Firefox:
					 * > DocumentFragment.querySelector: 'foo >' is not a valid selector
					 * Safari:
					 * > 'foo >' is not a valid selector.
					 *
					 * Try to strip the irrelevant parts.
					 */
					let idx = msg.indexOf(val);
					if (idx > 0) {
						if (msg[idx - 1] === '"' || msg[idx - 1] === "'") {
							idx -= 1;
						}
						msg = msg.slice(idx);
					}

					store.state.selectorErrorMessage = msg;
				} else {
					throw e;
				}
			}
		}
		store.state.selector = null;
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
