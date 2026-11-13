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
const iframe = /** @type {HTMLIFrameElement} */ (
	document.getElementById( 'xmlrpc-response' )
);

/** @type {string|null} */
let blobUrl = null;

form.addEventListener( 'submit', async ( event ) => {
	event.preventDefault();
	status.textContent = 'Sending…';

	let res;
	try {
		res = await fetch( endpoint.value, {
			method: 'POST',
			headers: { 'Content-Type': 'text/xml' },
			body: body.value,
			credentials: 'omit',
		} );
	} catch ( error ) {
		status.textContent = String( error );
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

	if ( blobUrl ) {
		URL.revokeObjectURL( blobUrl );
	}
	blobUrl = URL.createObjectURL(
		new Blob( [ await res.arrayBuffer() ], { type: 'text/xml' } ),
	);
	iframe.src = blobUrl;
} );
