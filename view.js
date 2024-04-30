import * as I from '@wordpress/interactivity';
import { printDOM } from './dom-utils.js';
import { printHtmlApiTree } from './print-htmlapi-tree.js';

/** @type {typeof import('@wordpress/api-fetch').default} */
const apiFetch = window.wp.apiFetch;

const NS = 'html-api-debugger';

/** @type {HTMLIFrameElement} */
let RENDERED_IFRAME;

var { state, handleChange } = I.store( NS, {
	state: {
		html: document.getElementById( 'input_html' ).value,
		DOM: {
			renderingMode: '',
			title: '',
		},
	},
	run() {
		RENDERED_IFRAME = document.getElementById( 'rendered_iframe' );
		handleChange();
	},
	onRenderedIframeLoad( e ) {
		const doc = e.target.contentWindow.document;
		state.DOM.renderingMode = doc.compatMode;
		state.DOM.title = doc.title || '[document has no title]';

		printDOM( document.getElementById( 'dom_tree' ), doc );
	},
	handleChange: function* ( e ) {
		const val = e?.target.value ?? state.html;

		state.html = val;

		const u = new URL( document.location.href );
		u.searchParams.set( 'html', val );
		history.replaceState( null, '', u );

		const resp = yield apiFetch( {
			path: `${ NS }/v1/htmlapi`,
			method: 'POST',
			data: { html: val },
		} );

		if ( resp.error ) {
			document.getElementById( 'html_api_result_holder' ).innerHTML = '';
			state.htmlapiError = resp.error;
			state.htmlapiResult = null;
			return;
		}

		state.htmlapiError = null;
		state.htmlapiResult = JSON.stringify( resp.result, undefined, 2 );
		printHtmlApiTree(
			resp.result,
			document.getElementById( 'html_api_result_holder' )
		);
	},
	watch() {
		RENDERED_IFRAME.contentWindow.document.open();
		RENDERED_IFRAME.contentWindow.document.write(
			'<!DOCTYPE html>\n<html>\n<body>' + state.html
		);
		RENDERED_IFRAME.contentWindow.document.close();
	},
} );
