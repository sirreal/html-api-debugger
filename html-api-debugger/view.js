import * as I from '@wordpress/interactivity';
import { printDOM } from './dom-utils.js';
import { printHtmlApiTree } from './print-htmlapi-tree.js';

/** @type {typeof import('@wordpress/api-fetch').default} */
const apiFetch = window.wp.apiFetch;

const NS = 'html-api-debugger';

/** @type {HTMLIFrameElement} */
let RENDERED_IFRAME;

var { state, render } = I.store( NS, {
	state: {
		get formattedHtmlapiResponse() {
			return JSON.stringify( state.htmlapiResponse, undefined, 2 );
		},
	},
	run() {
		RENDERED_IFRAME = document.getElementById( 'rendered_iframe' );
		render();

		// browsers "eat" some characters from search params…
		// newlines seem especially problematic in chrome
		// lets clean up the URL
		const u = new URL( document.location.href );
		if ( state.html ) {
			u.searchParams.set( 'html', state.html );
			history.replaceState( null, '', u );
		} else if ( u.searchParams.has( 'html' ) ) {
			u.searchParams.delete( 'html' );
			history.replaceState( null, '', u );
		}
	},
	onRenderedIframeLoad( e ) {
		const doc = e.target.contentWindow.document;
		state.DOM.renderingMode = doc.compatMode;
		state.DOM.title = doc.title || '[document has no title]';

		printDOM( document.getElementById( 'dom_tree' ), doc );
	},
	handleChange: function* ( e ) {
		const val = e.target.value;

		state.html = val;

		const u = new URL( document.location.href );
		u.searchParams.set( 'html', val );
		history.replaceState( null, '', u );

		const resp = yield apiFetch( {
			path: `${ NS }/v1/htmlapi`,
			method: 'POST',
			data: { html: val },
		} );

		state.htmlapiResponse = resp;

		if ( resp.error ) {
			document.getElementById( 'html_api_result_holder' ).innerHTML = '';
			return;
		}

		printHtmlApiTree(
			resp.result.tree,
			document.getElementById( 'html_api_result_holder' )
		);
	},
	watch() {
		render();
	},
	render() {
		RENDERED_IFRAME.contentWindow.document.open();
		RENDERED_IFRAME.contentWindow.document.write(
			'<!DOCTYPE html>\n<html>\n<body>' + state.html
		);
		RENDERED_IFRAME.contentWindow.document.close();

		if ( state.htmlapiResponse.result?.tree ) {
			printHtmlApiTree(
				state.htmlapiResponse.result.tree,
				document.getElementById( 'html_api_result_holder' )
			);
		}
	},
} );
