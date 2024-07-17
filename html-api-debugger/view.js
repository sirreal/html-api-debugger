import * as I from '@wordpress/interactivity';
import { printHtmlApiTree } from './print-htmlapi-tree.js';
import { replaceInvisible } from './replace-invisible-chars.js';

/** @type {typeof import('@wordpress/api-fetch').default} */
// @ts-expect-error
const apiFetch = window.wp.apiFetch;

const NS = 'html-api-debugger';
const DEBOUNCE_TIMEOUT = 150;

/** @type {AbortController|null} */
let inFlightRequestAbortController = null;

/** @type {AbortController|null} */
let debounceInputAbortController = null;

/**
 * @typedef State
 * @property {string} formattedHtmlapiResponse
 * @property {boolean} showClosers
 * @property {boolean} showInvisible
 * @property {boolean} showVirtual
 */

/**
 * @typedef Store
 * @property {State} state
 * @property {()=>void} clearSpan
 * @property {()=>void} render
 */

/** @type {typeof I.store<Store>} */
const store = I.store;

/** @type {Store} */
const { clearSpan, state, render } = store(NS, {
	state: {
		showClosers: Boolean(localStorage.getItem(`${NS}-showClosers`)),
		showInvisible: Boolean(localStorage.getItem(`${NS}-showInvisible`)),
		showVirtual: Boolean(localStorage.getItem(`${NS}-showVirtual`)),

		get formattedHtmlapiResponse() {
			return JSON.stringify(state.htmlapiResponse, undefined, 2);
		},

		get playgroundLink() {
			// We'll embed a path in a URL.
			const searchParams = new URLSearchParams({ page: NS });
			if (state.html) {
				searchParams.set('html', state.html);
			}
			const base = '/wp-admin/admin.php';
			const u = new URL(
				'https://playground.wordpress.net/?plugin=html-api-debugger',
			);
			u.searchParams.set('url', `${base}?${searchParams.toString()}`);
			return u.href;
		},

		get htmlForProcessing() {
			return '<!DOCTYPE html>\n<html>\n<body>' + state.html;
		},

		get hoverSpan() {
			/** @type {string | undefined} */
			const html = state.htmlapiResponse.html;
			if (!html) {
				return '';
			}
			return state.showInvisible ? replaceInvisible(html) : html;
		},

		get hoverSpanSplit() {
			/** @type {string | undefined} */
			const html = state.htmlapiResponse.html;
			if (!html || !state.span) {
				return [];
			}
			const buf = new TextEncoder().encode(html);
			const decoder = new TextDecoder();

			/** @type {{start: number, length: number }} */
			const { start: spanStart, length } = state.span;
			const spanEnd = spanStart + length;
			const split = [
				decoder.decode(buf.slice(0, spanStart)),
				decoder.decode(buf.slice(spanStart, spanEnd)),
				decoder.decode(buf.slice(spanEnd)),
			];

			return state.showInvisible ? split.map(replaceInvisible) : split;
		},
	},
	run() {
		// The HTML parser will replace null bytes from the HTML.
		// Force print them if we have null bytes.
		if (state.html.includes('\0')) {
			/** @type {HTMLTextAreaElement} */ (
				document.getElementById('input_html')
			).value = state.html;
		}

		render();

		// browsers "eat" some characters from search params…
		// newlines seem especially problematic in chrome
		// lets clean up the URL
		const u = new URL(document.location.href);
		if (state.html) {
			u.searchParams.set('html', state.html);
			history.replaceState(null, '', u);
		} else if (u.searchParams.has('html')) {
			u.searchParams.delete('html');
			history.replaceState(null, '', u);
		}
	},
	/** @param {Event} e */
	onRenderedIframeLoad(e) {
		// @ts-expect-error
		const doc = e.target.contentWindow.document;
		state.DOM.renderingMode = doc.compatMode;
		state.DOM.title = doc.title || '[document has no title]';

		printHtmlApiTree(
			doc,
			// @ts-expect-error
			document.getElementById('dom_tree'),
			{
				showClosers: state.showClosers,
				showInvisible: state.showInvisible,
			},
		);
	},
	clearSpan() {
		state.span = null;
	},
	/** @param {InputEvent} e */
	handleChange: function* (e) {
		const val = /** @type {HTMLTextAreaElement} */ (e.target).value;

		state.html = val;

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

		inFlightRequestAbortController?.abort('request superseded');
		inFlightRequestAbortController = new AbortController();
		let resp;
		try {
			resp = yield apiFetch({
				path: `${NS}/v1/htmlapi`,
				method: 'POST',
				data: { html: val },
				signal: inFlightRequestAbortController.signal,
			});
		} catch (err) {
			// We'd like to get this but won't thanks to `apiFetch` hiding the real error.
			if (err instanceof DOMException) {
				return;
			}
			// `apiFetch` actually does something like this.
			if (err && err.code === 'fetch_error' && navigator.onLine) {
				return;
			}
			throw err;
		}

		state.htmlapiResponse = resp;
		clearSpan();

		if (resp.error) {
			/** @type {HTMLUListElement} */ (
				document.getElementById('html_api_result_holder')
			).innerHTML = '';
			return;
		}
	},

	/** @param {Event} e */
	handleCopyClick: function* (e) {
		yield navigator.clipboard.writeText(state.playgroundLink);
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
				state.span = { start, length };
			}
		}
	},

	/** @param {Event} e */
	handleShowInvisibleClick(e) {
		// @ts-expect-error
		if (e.target.checked) {
			state.showInvisible = true;
			localStorage.setItem(`${NS}-showInvisible`, '1');
		} else {
			state.showInvisible = false;
			localStorage.removeItem(`${NS}-showInvisible`);
		}
	},
	/** @param {Event} e */
	handleShowClosersClick(e) {
		// @ts-expect-error
		if (e.target.checked) {
			state.showClosers = true;
			localStorage.setItem(`${NS}-showClosers`, '1');
		} else {
			state.showClosers = false;
			localStorage.removeItem(`${NS}-showClosers`);
		}
	},
	/** @param {Event} e */
	handleShowVirtualClick(e) {
		// @ts-expect-error
		if (e.target.checked) {
			state.showVirtual = true;
			localStorage.setItem(`${NS}-showVirtual`, '1');
		} else {
			state.showVirtual = false;
			localStorage.removeItem(`${NS}-showVirtual`);
		}
	},
	watch() {
		render();
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
				showClosers: state.showClosers,
				showInvisible: state.showInvisible,
				showVirtual: state.showVirtual,
			},
		);
	},

	render() {
		if (state.htmlapiResponse.result?.tree) {
			printHtmlApiTree(
				state.htmlapiResponse.result.tree,
				// @ts-expect-error
				document.getElementById('html_api_result_holder'),
				{
					showClosers: state.showClosers,
					showInvisible: state.showInvisible,
					showVirtual: state.showVirtual,
				},
			);
		}
	},
});
