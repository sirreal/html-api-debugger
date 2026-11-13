import { printHtmlApiTree } from '@html-api-debugger/print-html-tree';

const form = /** @type {HTMLFormElement} */ (
	document.getElementById( 'xmlrpc-form' )
);
const endpoint = /** @type {HTMLInputElement} */ (
	document.getElementById( 'xmlrpc-endpoint' )
);
const body = /** @type {HTMLTextAreaElement} */ (
	document.getElementById( 'xmlrpc-request' )
);
const status = /** @type {HTMLPreElement} */ (
	document.getElementById( 'xmlrpc-status' )
);
const tree = /** @type {HTMLUListElement} */ (
	document.getElementById( 'xmlrpc-response' )
);
const error = /** @type {HTMLPreElement} */ (
	document.getElementById( 'xmlrpc-error' )
);
const link = /** @type {HTMLAnchorElement} */ (
	document.getElementById( 'xmlrpc-response-link' )
);

function updateURL() {
	const u = new URL( document.location.href );
	u.searchParams.set( 'request', body.value );
	if ( endpoint.value !== endpoint.dataset[ 'default' ] ) {
		u.searchParams.set( 'endpoint', endpoint.value );
	} else {
		u.searchParams.delete( 'endpoint' );
	}
	history.replaceState( null, '', u );
}
body.addEventListener( 'input', updateURL );
endpoint.addEventListener( 'input', updateURL );
// WordPress replaces the URL with its canonical URL, which esc_url() strips of newlines.
updateURL();

/**
 * Remove whitespace-only text nodes from elements that have element children.
 *
 * @param {Document} doc
 */
function removeWhitespaceText( doc ) {
	const walker = doc.createTreeWalker( doc, NodeFilter.SHOW_TEXT );
	/** @type {Text[]} */
	const remove = [];
	while ( walker.nextNode() ) {
		const text = /** @type {Text} */ ( walker.currentNode );
		if (
			/^[ \t\r\n]*$/.test( text.data ) &&
			text.parentElement?.firstElementChild
		) {
			remove.push( text );
		}
	}
	for ( const text of remove ) {
		text.remove();
	}
}

/**
 * Print the tree of an XML string, or its parse error with the error location.
 *
 * Chromium reports "line L at column C", counting columns in code points
 * from 1, and keeps the nodes parsed before the error, which are printed too.
 * The location pattern also matches Firefox's "Line Number L, Column C".
 *
 * @param {string} text
 * @param {HTMLUListElement} ul
 * @param {HTMLPreElement} errorPre
 * @return {boolean} Whether the XML is well-formed.
 */
function showXml( text, ul, errorPre ) {
	const doc = new DOMParser().parseFromString( text, 'application/xml' );
	const parserError = doc.querySelector( 'parsererror' );
	if ( parserError ) {
		const message = (
			parserError.querySelector( 'div' )?.textContent ??
			parserError.textContent ??
			''
		).trim();
		let excerpt = '';
		const location = /line (?:number )?(\d+),? (?:at )?column (\d+)/i.exec(
			message,
		);
		if ( location ) {
			const line = text.split( /\r\n?|\n/ )[ Number( location[ 1 ] ) - 1 ];
			if ( line !== undefined ) {
				const caret = Array.from( line )
					.slice( 0, Number( location[ 2 ] ) - 1 )
					.map( ( c ) => ( c === '\t' ? '\t' : ' ' ) )
					.join( '' );
				excerpt = `\n\n${ line }\n${ caret }^`;
			}
		}
		errorPre.textContent = message + excerpt;
		errorPre.hidden = false;
		parserError.remove();
	} else {
		errorPre.hidden = true;
	}
	removeWhitespaceText( doc );
	printHtmlApiTree( doc, ul );
	return ! parserError;
}

const requestTree = /** @type {HTMLUListElement} */ (
	document.getElementById( 'xmlrpc-request-tree' )
);
const requestError = /** @type {HTMLPreElement} */ (
	document.getElementById( 'xmlrpc-request-error' )
);
const showRequest = () => showXml( body.value, requestTree, requestError );
body.addEventListener( 'input', showRequest );
showRequest();

body.addEventListener( 'keydown', ( event ) => {
	if ( event.key === 'Enter' && ( event.metaKey || event.ctrlKey ) ) {
		event.preventDefault();
		form.requestSubmit();
	}
} );

form.addEventListener( 'submit', async ( event ) => {
	event.preventDefault();
	status.textContent = 'Sending…';
	tree.replaceChildren();
	error.hidden = true;
	link.hidden = true;

	let res;
	try {
		res = await fetch( endpoint.value, {
			method: 'POST',
			headers: { 'Content-Type': 'text/xml' },
			body: body.value,
			credentials: 'omit',
		} );
	} catch ( e ) {
		status.textContent = String( e );
		return;
	}

	const headers = Array.from(
		res.headers,
		( [ name, value ] ) => `${ name }: ${ value }`,
	);
	status.textContent = [
		`${ res.status } ${ res.statusText }`,
		...headers,
	].join( '\n' );

	const blob = new Blob( [ await res.arrayBuffer() ], { type: 'text/xml' } );
	if ( link.href ) {
		URL.revokeObjectURL( link.href );
	}
	link.href = URL.createObjectURL( blob );
	link.hidden = false;

	const text = await blob.text();
	if ( ! showXml( text, tree, error ) ) {
		error.textContent += `\n\n${ text }`;
	}
} );
