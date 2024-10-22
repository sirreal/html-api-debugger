import { printHtmlApiTree } from '@html-api-debugger/print-html-tree';
import { replaceInvisible } from '@html-api-debugger/replace-invisible-chars';
import * as I from '@wordpress/interactivity';

const NS = 'html-api-debugger';

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

/** @type {MutationObserver|null} */
let mutationObserver = null;

/**
 * @typedef DOM
 * @property {string|undefined} renderingMode
 * @property {string|undefined} doctypeName
 * @property {string|undefined} doctypeSystemId
 * @property {string|undefined} doctypePublicId
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
 * @property {boolean} normalize
 *
 *
 * @typedef HtmlApiResponse
 * @property {any} error
 * @property {Supports} supports
 * @property {{tree: any, compatMode:string, doctypeName:string, doctypePublicId:string, doctypeSystemId:string }|null} result
 * @property {string|null} normalizedHtml
 * @property {string} html
 *
 *
 * @typedef State
 * @property {string|null} htmlApiDoctypeName
 * @property {string|null} htmlApiDoctypePublicId
 * @property {string|null} htmlApiDoctypeSystemId
 * @property {string|null} normalizedHtml
 * @property {string} htmlPreambleForProcessing
 * @property {string} formattedHtmlapiResponse
 * @property {HtmlApiResponse} htmlapiResponse
 * @property {URL} playgroundLink
 * @property {string} html
 * @property {string} htmlForProcessing
 * @property {boolean} showClosers
 * @property {boolean} showInvisible
 * @property {boolean} showVirtual
 * @property {boolean} quirksMode
 * @property {boolean} fullParser
 * @property {number} previewPrNumber
 * @property {boolean} checkingForPRPlaygroundLink
 *
 * @property {'breadcrumbs'|'insertionMode'} hoverInfo
 * @property {boolean} hoverBreadcrumbs
 * @property {boolean} hoverInsertion
 *
 * @property {DOM} DOM
 * @property {boolean} hasMutatedDom
 * @property {HTMLAPISpan|false} span
 * @property {string} hoverSpan
 * @property {(span:HTMLAPISpan) => readonly [string,string,string]} hoverSpanSplit
 */

/**
 * @typedef Store
 * @property {State} state
 * @property {()=>void} clearSpan
 * @property {()=>void} render
 * @property {()=>Promise<void>} callAPI
 *
 * @property {()=>void} handleInput
 *
 * @property {()=>void} handleShowInvisibleClick
 * @property {()=>void} handleShowClosersClick
 * @property {()=>void} handleShowVirtualClick
 * @property {()=>Promise<void>} handleQuirksModeClick
 * @property {()=>Promise<void>} handleFullParserClick
 *
 * @property {()=>void} handleCopyClick
 * @property {()=>void} handleCopyPrInput
 * @property {()=>void} handleCopyPrClick
 *
 * @property {()=>void} onRenderedIframeLoad
 */

const createStore = /** @type {typeof I.store<Store>} */ (I.store);

/** @type {Store} */
const store = createStore(NS, {
	// @ts-expect-error Server provided state is not included here.
	state: {
		showClosers: Boolean(localStorage.getItem(`${NS}-showClosers`)),
		showInvisible: Boolean(localStorage.getItem(`${NS}-showInvisible`)),
		showVirtual: Boolean(localStorage.getItem(`${NS}-showVirtual`)),
		quirksMode: Boolean(localStorage.getItem(`${NS}-quirksMode`)),
		fullParser: Boolean(localStorage.getItem(`${NS}-fullParser`)),

		hoverInfo: /** @type {typeof store.state.hoverInfo} */ (
			localStorage.getItem(`${NS}-hoverInfo`)
		),

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
			if (
				!store.state.htmlapiResponse.supports.normalize ||
				!store.state.htmlapiResponse.normalizedHtml
			) {
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
			const base = '/wp-admin/admin.php';
			const u = new URL(
				'https://playground.wordpress.net/?plugin=html-api-debugger',
			);
			u.searchParams.set('url', `${base}?${searchParams.toString()}`);
			return u;
		},

		get htmlPreambleForProcessing() {
			if (store.state.fullParser) {
				return '';
			}
			const doctype = `<!DOCTYPE${
				store.state.htmlapiResponse.supports.quirks_mode &&
				store.state.quirksMode
					? ''
					: ' html'
			}>`;
			return `${doctype}<html><body>`;
		},

		get htmlForProcessing() {
			return store.state.htmlPreambleForProcessing + store.state.html;
		},

		get hoverSpan() {
			/** @type {string | undefined} */
			const html = store.state.htmlapiResponse.html;
			if (!html) {
				return '';
			}
			return store.state.showInvisible ? replaceInvisible(html) : html;
		},

		/** @param {HTMLAPISpan} span */
		hoverSpanSplit(span) {
			/** @type {string | undefined} */
			const html = store.state.htmlapiResponse.html;
			if (!html) {
				return /** @type {const} */ (['', '', '']);
			}
			const buf = new TextEncoder().encode(html);
			const decoder = new TextDecoder();

			const { start: spanStart, length } = span;
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

	handleSpanClear() {
		const el = /** @type {HTMLElement} */ (
			document.getElementById('processed-html')
		);
		el.classList.remove('has-highlighted-span');
		el.textContent = store.state.hoverSpan;
	},

	/** @param {MouseEvent} e */
	handleSpanOver(e) {
		const t = /** @type {HTMLElement} */ (e.target);
		const { spanStart, spanLength } = t.dataset;
		if (!t || !spanStart || !spanLength) {
			return;
		}

		// @ts-expect-error 3-tuple to 3-tuple
		const [before, current, after] = /** @type {readonly [Text,Text,Text]} */ (
			store.state
				.hoverSpanSplit({
					start: Number(spanStart),
					length: Number(spanLength),
				})
				.map((text) => document.createTextNode(text))
		);
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
		// The HTML parser will replace null bytes from the HTML.
		// Force print them if we have null bytes.
		if (store.state.html.includes('\0')) {
			/** @type {HTMLTextAreaElement} */ (
				document.getElementById('input_html')
			).value = store.state.html;
		}

		store.render();

		// browsers "eat" some characters from search params…
		// newlines seem especially problematic in chrome
		// lets clean up the URL
		const u = new URL(document.location.href);
		if (store.state.html) {
			u.searchParams.set('html', store.state.html);
			history.replaceState(null, '', u);
		} else if (u.searchParams.has('html')) {
			u.searchParams.delete('html');
			history.replaceState(null, '', u);
		}

		mutationObserver = new MutationObserver(() => {
			store.state.hasMutatedDom = true;
			store.onRenderedIframeLoad();
		});
	},

	onRenderedIframeLoad() {
		// @ts-expect-error It better be defined!
		const doc = RENDERED_IFRAME.contentWindow.document;

		store.state.DOM.renderingMode = doc.compatMode;
		store.state.DOM.doctypeName = doc.doctype?.name;
		store.state.DOM.doctypeSystemId = doc.doctype?.systemId;
		store.state.DOM.doctypePublicId = doc.doctype?.publicId;

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
					html: store.state.html,
					quirksMode: store.state.quirksMode,
					fullParser: store.state.fullParser,
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
		store.clearSpan();

		if (data.error) {
			/** @type {HTMLUListElement} */ (
				document.getElementById('html_api_result_holder')
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

		mutationObserver?.disconnect();
		store.state.hasMutatedDom = false;

		iframeDocument.open();
		iframeDocument.write(store.state.htmlForProcessing);
		iframeDocument.close();

		if (store.state.htmlapiResponse.result?.tree) {
			printHtmlApiTree(
				store.state.htmlapiResponse.result.tree,
				// @ts-expect-error
				document.getElementById('html_api_result_holder'),
				{
					showClosers: store.state.showClosers,
					showInvisible: store.state.showInvisible,
					showVirtual: store.state.showVirtual,
					hoverInfo: store.state.hoverInfo,
				},
			);
		}
	},

	/** @param {InputEvent} e */
	handleCopyPrInput(e) {
		const val = /** @type {HTMLInputElement} */ (e.target).valueAsNumber;
		if (Number.isFinite(val) && val > 0) {
			store.state.previewPrNumber = val;
			return;
		}
		store.state.previewPrNumber = val;
	},

	handleCopyPrClick: function* () {
		const prNumber = store.state.previewPrNumber;
		const playgroundLink = new URL(store.state.playgroundLink);
		if (!prNumber) {
			alert('Please enter a PR number.');
			return;
		}
		const url = new URL(
			'https://playground.wordpress.net/plugin-proxy.php?org=WordPress&repo=wordpress-develop&workflow=Test%20Build%20Processes',
		);
		url.searchParams.set('artifact', `wordpress-build-${prNumber}`);
		url.searchParams.set('pr', prNumber.toString(10));

		try {
			playgroundLink.searchParams.set('wp', url.href);
			yield navigator.clipboard.writeText(playgroundLink.href);
		} catch {
			alert('Copy failed, make sure the browser window is focused.');
		}
	},

	handleCheckPrClick: function* () {
		if (store.state.checkingForPRPlaygroundLink) {
			return;
		}

		const prNumber = store.state.previewPrNumber;
		if (!prNumber) {
			alert('Please enter a PR number.');
			return;
		}

		try {
			store.state.checkingForPRPlaygroundLink = true;

			const url = new URL(
				'https://playground.wordpress.net/plugin-proxy.php?org=WordPress&repo=wordpress-develop&workflow=Test%20Build%20Processes',
			);
			url.searchParams.set('artifact', `wordpress-build-${prNumber}`);
			url.searchParams.set('pr', prNumber.toString(10));
			url.searchParams.set('verify_only', 'true');
			/** @type {Response} */
			const response = yield fetch(url.href, {
				method: 'GET',
			});
			if (!response.ok) {
				alert('The PR number is not valid or has not been built yet.');
				return;
			}
			alert('The PR number looks good!');
		} finally {
			store.state.checkingForPRPlaygroundLink = false;
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
