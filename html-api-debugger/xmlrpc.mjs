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

form.addEventListener( 'submit', async ( event ) => {
	event.preventDefault();
	status.textContent = 'Sending…';
	tree.replaceChildren();
	error.hidden = true;

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
	const doc = new DOMParser().parseFromString( text, 'application/xml' );
	const parserError = doc.querySelector( 'parsererror' );
	if ( parserError ) {
		error.textContent = `${ parserError.textContent }\n\n${ text }`;
		error.hidden = false;
		return;
	}
	printHtmlApiTree( doc, tree );
} );
