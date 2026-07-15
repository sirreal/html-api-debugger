import assert from 'node:assert/strict';

import {
	decodeBase64url,
	encodeBase64url,
} from '../html-api-debugger/byte-transport.mjs';
import { ByteRuntimeController } from '../html-api-debugger/runtime-controller.mjs';

const admin = 'https://example.test/wp-admin/admin.php?page=html-api-debugger';

/** @param {Uint8Array} bytes */
const envelope = ( bytes ) => ( { __bytesBase64url: encodeBase64url( bytes ) } );
/** @param {string} text */
const textEnvelope = ( text ) => envelope( new TextEncoder().encode( text ) );

/**
 * @param {{html64: string, context64: string, selector: string}} body
 * @param {string} [label='current']
 */
function responseFor( body, label = 'current' ) {
	const html = decodeBase64url( body.html64 );
	return {
		supports: { create_fragment_advanced: true, selectors: true },
		html: envelope( html ),
		error: null,
		normalizedHtml: envelope( html ),
		result: {
			tree: {
				nodeType: 9,
				nodeName: textEnvelope( label ),
				childNodes: [],
			},
			playback: [
				[ envelope( html ), { childNodes: [] } ],
				[ envelope( Uint8Array.of( 0xc3, 0xbf, 0xff, 0x41 ) ), { childNodes: [] } ],
			],
			warnings: [],
		},
	};
}

const bareRequests = [];
const replacedUrls = [];
const bareController = new ByteRuntimeController( {
	url: new URL( admin ),
	supports: { create_fragment_advanced: true },
	request: async ( body ) => {
		bareRequests.push( body );
		return responseFor( body );
	},
	replaceUrl: ( url ) => replacedUrls.push( url ),
	confirmConversion: () => false,
} );
assert.equal( replacedUrls.length, 1 );
assert.equal( replacedUrls[0].searchParams.get( 'format' ), 'v1' );
await bareController.start();
assert.equal( bareRequests.length, 1 );
assert.deepEqual( bareRequests[0], { html64: '', context64: '', selector: '' } );

for ( const suffix of [
	'&format=v2&html64=&context64=&selector=&opts=',
	'&format=v1&html64=Zg==&context64=&selector=&opts=',
	'&html=%FF',
] ) {
	let requests = 0;
	const invalid = new ByteRuntimeController( {
		url: new URL( `${ admin }${ suffix }` ),
		supports: { create_fragment_advanced: true },
		request: async () => {
			++requests;
			return null;
		},
		replaceUrl: () => {},
		confirmConversion: () => false,
	} );
	assert.equal( typeof invalid.urlError, 'string' );
	await invalid.start();
	assert.equal( requests, 0 );
}

const acceptanceBytes = Uint8Array.from(
	Buffer.from( '3c696672616d653e41ff423c2f696672616d653e', 'hex' ),
);
const acceptanceUrl = new URL(
	`${ admin }&format=v1&html64=${ encodeBase64url( acceptanceBytes ) }&context64=&selector=&opts=`,
);
const acceptanceBodies = [];
const acceptanceController = new ByteRuntimeController( {
	url: acceptanceUrl,
	supports: { create_fragment_advanced: true },
	request: async ( body ) => {
		acceptanceBodies.push( body );
		return responseFor( body );
	},
	replaceUrl: () => {},
	confirmConversion: () => false,
} );
await acceptanceController.start();
assert.deepEqual(
	decodeBase64url( acceptanceBodies[0].html64 ),
	acceptanceBytes,
);
assert.deepEqual( acceptanceController.getProcessedBytes(), acceptanceBytes );
assert.ok( acceptanceController.rawResponse.html.__bytesBase64url );

const returnedHtml = acceptanceController.htmlBytes;
returnedHtml[0] = 0;
assert.deepEqual( acceptanceController.htmlBytes, acceptanceBytes );
const returnedProcessed = acceptanceController.getProcessedBytes();
returnedProcessed[0] = 0;
assert.deepEqual( acceptanceController.getProcessedBytes(), acceptanceBytes );
assert.equal( '_htmlBytes' in acceptanceController, false );
assert.equal( '_contextBytes' in acceptanceController, false );
assert.equal( '_decodedResponse' in acceptanceController, false );

let allowConversion = false;
const conversionRequests = [];
const conversionUrls = [];
const conversionController = new ByteRuntimeController( {
	url: new URL(
		`${ admin }&format=v1&html64=_w&context64=&selector=&opts=`,
	),
	supports: { create_fragment_advanced: true },
	request: async ( body ) => {
		conversionRequests.push( body );
		return responseFor( body );
	},
	replaceUrl: ( url ) => conversionUrls.push( url ),
	confirmConversion: () => allowConversion,
} );
await conversionController.start();
assert.equal( await conversionController.requestTextEditing( 'html' ), null );
assert.deepEqual( conversionController.htmlBytes, Uint8Array.of( 0xff ) );
assert.equal( conversionRequests.length, 1 );
allowConversion = true;
assert.equal( await conversionController.requestTextEditing( 'html' ), '\ufffd' );
assert.deepEqual(
	conversionController.htmlBytes,
	Uint8Array.of( 0xef, 0xbf, 0xbd ),
);
assert.equal( conversionRequests.at( -1 ).html64, '77-9' );
assert.equal( conversionUrls.at( -1 ).searchParams.get( 'html64' ), '77-9' );

await conversionController.editSource( 'html', 'ÿ' );
assert.equal( conversionRequests.at( -1 ).html64, 'w78' );
await conversionController.editSource( 'context', " \n" );
assert.deepEqual(
	decodeBase64url( conversionRequests.at( -1 ).context64 ),
	new TextEncoder().encode( " \n" ),
);
await conversionController.setSelector( '.x' );
assert.equal( conversionRequests.at( -1 ).selector, '.x' );
const requestsBeforeOpts = conversionRequests.length;
conversionController.setOpts( 'CiV' );
assert.equal( conversionRequests.length, requestsBeforeOpts );
assert.equal( conversionController.getCanonicalUrl().searchParams.get( 'opts' ), 'CiV' );

const fragmentBytes = Uint8Array.of( 0x41, 0xff, 0x42 );
const contextBytes = new TextEncoder().encode( '<!DOCTYPE html><body>' );
const fragmentUrl = new URL(
	`${ admin }&format=v1&html64=${ encodeBase64url( fragmentBytes ) }&context64=${ encodeBase64url( contextBytes ) }&selector=&opts=`,
);
const supported = new ByteRuntimeController( {
	url: fragmentUrl,
	supports: { create_fragment_advanced: true },
	request: async ( body ) => responseFor( body ),
	replaceUrl: () => {},
	confirmConversion: () => false,
} );
const supportedPlan = supported.getPreviewPlan();
assert.deepEqual( supportedPlan.documentBytes, contextBytes );
assert.deepEqual( supportedPlan.fragment.bytes, fragmentBytes );
assert.equal( supportedPlan.fragment.text, 'A\ufffdB' );
assert.equal( supportedPlan.fragment.lossy, true );
supportedPlan.documentBytes[0] = 0;
supportedPlan.fragment.bytes[0] = 0;
assert.deepEqual( supported.contextBytes, contextBytes );
assert.deepEqual( supported.getProcessedBytes(), fragmentBytes );
const returnedContext = supported.contextBytes;
returnedContext[0] = 0;
assert.deepEqual( supported.contextBytes, contextBytes );

const unsupported = new ByteRuntimeController( {
	url: fragmentUrl,
	supports: { create_fragment_advanced: false },
	request: async ( body ) => responseFor( body ),
	replaceUrl: () => {},
	confirmConversion: () => false,
} );
const unsupportedPlan = unsupported.getPreviewPlan();
assert.deepEqual( unsupportedPlan.documentBytes, fragmentBytes );
assert.equal( unsupportedPlan.fragment, null );
assert.equal(
	unsupported.getCanonicalUrl().searchParams.get( 'context64' ),
	encodeBase64url( contextBytes ),
);

await supported.start();
assert.deepEqual(
	supported.getProcessedBytes( 1 ),
	Uint8Array.of( 0xc3, 0xbf, 0xff, 0x41 ),
);
const returnedPlayback = supported.getProcessedBytes( 1 );
returnedPlayback[0] = 0;
assert.deepEqual(
	supported.getProcessedBytes( 1 ),
	Uint8Array.of( 0xc3, 0xbf, 0xff, 0x41 ),
);
const span = supported.splitProcessedSpan( 2, 1, 1 );
assert.deepEqual( span.before, Uint8Array.of( 0xc3, 0xbf ) );
assert.deepEqual( span.current, Uint8Array.of( 0xff ) );
assert.deepEqual( span.after, Uint8Array.of( 0x41 ) );
span.before[0] = 0;
span.current[0] = 0;
span.after[0] = 0;
const freshSpan = supported.splitProcessedSpan( 2, 1, 1 );
assert.deepEqual( freshSpan.before, Uint8Array.of( 0xc3, 0xbf ) );
assert.deepEqual( freshSpan.current, Uint8Array.of( 0xff ) );
assert.deepEqual( freshSpan.after, Uint8Array.of( 0x41 ) );

const playground = supported.getPlaygroundUrl(
	new URL( 'https://playground.wordpress.net/?plugin=html-api-debugger' ),
	'CIV',
	'nightly',
);
assert.equal( playground.searchParams.get( 'wp' ), 'nightly' );
const nested = new URL(
	playground.searchParams.get( 'url' ),
	'https://example.test',
);
assert.equal( nested.searchParams.get( 'html64' ), encodeBase64url( fragmentBytes ) );
assert.equal( nested.searchParams.get( 'context64' ), encodeBase64url( contextBytes ) );
assert.equal( nested.searchParams.get( 'opts' ), 'CIV' );
for ( const field of [ 'format', 'html64', 'context64', 'selector', 'opts' ] ) {
	assert.equal( nested.searchParams.getAll( field ).length, 1 );
}

assert.equal( supported.isUrlUnusuallyLong( 1 ), true );
assert.throws( () => supported.isUrlUnusuallyLong( 0 ), RangeError );

/** @returns {{promise: Promise<unknown>, resolve: (value: unknown) => void, reject: (error: unknown) => void}} */
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise( ( resolvePromise, rejectPromise ) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	} );
	return { promise, resolve, reject };
}

const deferredRequests = [];
const raceController = new ByteRuntimeController( {
	url: new URL( `${ admin }&format=v1&html64=QQ&context64=&selector=&opts=` ),
	supports: { create_fragment_advanced: true },
	request: ( body ) => {
		const wait = deferred();
		deferredRequests.push( { body, wait } );
		return wait.promise;
	},
	replaceUrl: () => {},
	confirmConversion: () => false,
} );
const firstProcess = raceController.start();
const secondProcess = raceController.editSource( 'html', 'B' );
assert.equal( raceController.rawResponse, null );
assert.deepEqual( raceController.getProcessedBytes(), Uint8Array.of( 0x42 ) );
assert.deepEqual( raceController.getPreviewPlan().documentBytes, Uint8Array.of( 0x42 ) );

deferredRequests[1].wait.resolve( responseFor( deferredRequests[1].body, 'new' ) );
await secondProcess;
assert.equal( raceController.projectedResponse.result.tree.nodeName, 'new' );
deferredRequests[0].wait.resolve( responseFor( deferredRequests[0].body, 'old' ) );
await firstProcess;
assert.equal( raceController.projectedResponse.result.tree.nodeName, 'new' );
assert.deepEqual( raceController.getProcessedBytes(), Uint8Array.of( 0x42 ) );

const rejectedRequests = [];
const staleFailureController = new ByteRuntimeController( {
	url: new URL( `${ admin }&format=v1&html64=QQ&context64=&selector=&opts=` ),
	supports: { create_fragment_advanced: true },
	request: ( body ) => {
		const wait = deferred();
		rejectedRequests.push( { body, wait } );
		return wait.promise;
	},
	replaceUrl: () => {},
	confirmConversion: () => false,
} );
const staleFailure = staleFailureController.start();
const currentSuccess = staleFailureController.editSource( 'html', 'B' );
rejectedRequests[1].wait.resolve(
	responseFor( rejectedRequests[1].body, 'new-after-failure' ),
);
await currentSuccess;
rejectedRequests[0].wait.reject( new Error( 'stale failure' ) );
assert.equal( await staleFailure, null );
assert.equal(
	staleFailureController.projectedResponse.result.tree.nodeName,
	'new-after-failure',
);

console.log( 'All runtime controller tests passed.' );
