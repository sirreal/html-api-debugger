import * as I from '@wordpress/interactivity';
import { printDOM } from './dom-utils.js';
import { printHtmlApiTree } from './print-htmlapi-tree.js';

/** @type {typeof import('@wordpress/api-fetch').default} */
// @ts-expect-error
const apiFetch = window.wp.apiFetch;

const NS = 'html-api-debugger';
const DEBOUNCE_TIMEOUT = 150;

/** @type {HTMLIFrameElement} */
let RENDERED_IFRAME;

/** @type {AbortController|null} */
let inFlightRequestAbortController = null;

/** @type {AbortController|null} */
let debounceInputAbortController = null;

/**
 * @typedef State
 * @property {string} formattedHtmlapiResponse
 *
 *
 * @typedef Store
 * @property {State} state
 * @property {()=>void} clearSpan
 */

/** @type {typeof I.store<Store>} */
const store = I.store;

const { clearSpan, state, render } = store(NS, {
	state: {
		get formattedHtmlapiResponse() {
			return JSON.stringify(state.htmlapiResponse, undefined, 2);
		},

		get hoverSpan() {
			/** @type {string | undefined} */
			const html = state.htmlapiResponse.result?.html;
			if (!html) {
				return '';
			}
			return html;
		},

		get hoverSpanSplit() {
			/** @type {string | undefined} */
			const html = state.htmlapiResponse.result?.html;
			if (!html || !state.span) {
				return [];
			}
			const buf = new TextEncoder().encode(html);
			const decoder = new TextDecoder();

			/** @type {{start: number, length: number }} */
			const { start: spanStart, length } = state.span;
			const spanEnd = spanStart + length;
			return [
				decoder.decode(buf.slice(0, spanStart)),
				decoder.decode(buf.slice(spanStart, spanEnd)),
				decoder.decode(buf.slice(spanEnd)),
			];
		},
	},
	run() {
		RENDERED_IFRAME = document.getElementById('rendered_iframe');
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

		printDOM(
			// @ts-expect-error
			document.getElementById('dom_tree'),
			doc,
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

		printHtmlApiTree(
			resp.result.tree,
			/** @type {HTMLUListElement} */ (
				document.getElementById('html_api_result_holder')
			),
		);
	},

	/** @param {MouseEvent} e */
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
	handleShowClosersClick(e) {
		// @ts-expect-error
		state.showClosers = e.target.checked;
	},
	watch() {
		render();
	},
	render() {
		RENDERED_IFRAME.contentWindow.document.open();
		RENDERED_IFRAME.contentWindow.document.write(
			'<!DOCTYPE html>\n<html>\n<body>' + state.html,
		);
		RENDERED_IFRAME.contentWindow.document.close();

		if (state.htmlapiResponse.result?.tree) {
			printHtmlApiTree(
				state.htmlapiResponse.result.tree,
				document.getElementById('html_api_result_holder'),
				{ showClosers: state.showClosers },
			);
		}
	},
});
