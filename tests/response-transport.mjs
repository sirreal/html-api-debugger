import assert from 'node:assert/strict';

import { encodeBase64url } from '../html-api-debugger/byte-transport.mjs';
import { decodeHtmlApiResponse } from '../html-api-debugger/response-transport.mjs';

/** @param {Uint8Array} bytes */
const envelope = ( bytes ) => ( {
	__bytesBase64url: encodeBase64url( bytes ),
} );
/** @param {string} text */
const textEnvelope = ( text ) => envelope( new TextEncoder().encode( text ) );

const rawFf = Uint8Array.of( 0xff );
const utf8Replacement = Uint8Array.of( 0xef, 0xbf, 0xbd );
const playbackSource = Uint8Array.of( 0xc3, 0xbf, 0xff, 0x41 );
const raw = {
	supports: {
		create_fragment_advanced: true,
		selectors: true,
	},
	html: envelope( rawFf ),
	error: envelope( utf8Replacement ),
	normalizedHtml: envelope( rawFf ),
	result: {
		tree: {
			nodeType: 9,
			nodeName: textEnvelope( '#document' ),
			childNodes: [
				{
					nodeType: 3,
					nodeName: textEnvelope( '#text' ),
					nodeValue: envelope( rawFf ),
					_span: { start: 0, length: 1 },
				},
			],
		},
		playback: [
			[ envelope( playbackSource ), { childNodes: [] } ],
			[ envelope( rawFf ), { childNodes: [] } ],
		],
		warnings: [ textEnvelope( 'warning' ) ],
	},
};
const snapshot = JSON.stringify( raw );
const decoded = decodeHtmlApiResponse( raw );

assert.equal( decoded.raw, raw );
assert.equal( JSON.stringify( raw ), snapshot );
assert.match( snapshot, /"__bytesBase64url"/u );
assert.deepEqual( decoded.htmlBytes, rawFf );
assert.deepEqual( decoded.normalizedBytes, rawFf );
assert.deepEqual( decoded.errorBytes, utf8Replacement );
assert.deepEqual( decoded.playbackBytes, [ playbackSource, rawFf ] );
assert.equal( decoded.projected.html, '\ufffd' );
assert.equal( decoded.projected.normalizedHtml, '\ufffd' );
assert.equal( decoded.projected.error, '\ufffd' );
assert.equal( decoded.projected.result.tree.nodeName, '#document' );
assert.equal( decoded.projected.result.tree.childNodes[0].nodeValue, '\ufffd' );
assert.equal( decoded.projected.result.playback[0][0], 'ÿ\ufffdA' );
assert.equal( decoded.projected.result.warnings[0], 'warning' );
assert.notDeepEqual( decoded.normalizedBytes, decoded.errorBytes );

const nullResponse = {
	supports: {},
	html: textEnvelope( '' ),
	error: null,
	normalizedHtml: null,
	result: null,
};
const decodedNull = decodeHtmlApiResponse( nullResponse );
assert.equal( decodedNull.normalizedBytes, null );
assert.equal( decodedNull.errorBytes, null );
assert.deepEqual( decodedNull.playbackBytes, [] );

const base = () => ( {
	supports: {},
	html: textEnvelope( '' ),
	error: null,
	normalizedHtml: null,
	result: null,
} );

const invalidResponses = [
	'unenveloped',
	{ ...base(), html: 'bare' },
	{ ...base(), html: { __bytesBase64url: '*' } },
	{ ...base(), html: null },
	( () => {
		const value = base();
		delete value.html;
		return value;
	} )(),
	{ ...base(), supports: [] },
	{ ...base(), result: [] },
	{ ...base(), result: {} },
	{ ...base(), result: { playback: [ [ textEnvelope( '' ) ] ] } },
	{ ...base(), result: { playback: [ [ null, {} ] ] } },
	{ ...base(), result: { playback: [ [ textEnvelope( '' ), {}, null ] ] } },
	{ ...base(), extra: new Date() },
];

for ( const invalid of invalidResponses ) {
	assert.throws(
		() => decodeHtmlApiResponse( invalid ),
		TypeError,
		'rejects malformed response',
	);
}

console.log( 'All response transport tests passed.' );
