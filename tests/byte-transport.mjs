import assert from 'node:assert/strict';

import {
	decodeBase64url,
	decodeUtf8,
	encodeBase64url,
	encodeUtf8,
	formatByteRows,
	isByteEnvelope,
	isValidUtf8,
	projectResponseStrings,
	projectUtf8,
} from '../html-api-debugger/byte-transport.mjs';

const allBytes = Uint8Array.from( { length: 256 }, ( _, index ) => index );

for ( const [ label, bytes ] of [
	[ 'empty bytes', new Uint8Array() ],
	[ 'all byte values', allBytes ],
	[ 'raw FF', Uint8Array.of( 0xff ) ],
	[ 'UTF-8 C3 BF', Uint8Array.of( 0xc3, 0xbf ) ],
] ) {
	assert.deepEqual(
		decodeBase64url( encodeBase64url( bytes ) ),
		bytes,
		`${ label } round trips`,
	);
}

assert.equal( encodeBase64url( Uint8Array.of( 0xff ) ), '_w' );
assert.equal( encodeBase64url( Uint8Array.of( 0xc3, 0xbf ) ), 'w78' );

for ( const invalid of [
	'Zg==',
	'+w',
	'/w',
	'a',
	'Zh',
	'Zm9',
	'*',
	'_w\n',
	'💣',
] ) {
	assert.throws(
		() => decodeBase64url( invalid ),
		TypeError,
		`rejects ${ JSON.stringify( invalid ) }`,
	);
}

const bomText = '\ufeffA';
const bomBytes = Uint8Array.of( 0xef, 0xbb, 0xbf, 0x41 );
assert.equal( decodeUtf8( bomBytes ), bomText, 'UTF-8 decoding preserves BOM' );
assert.deepEqual( encodeUtf8( decodeUtf8( bomBytes ) ), bomBytes );
assert.equal( isValidUtf8( bomBytes ), true );

const malformed = Uint8Array.of( 0x41, 0xff, 0x42 );
assert.equal( isValidUtf8( malformed ), false );
assert.throws( () => decodeUtf8( malformed ), TypeError );
assert.equal( projectUtf8( malformed ), 'A\ufffdB' );
assert.notDeepEqual( encodeUtf8( projectUtf8( malformed ) ), malformed );

const rawResponse = {
	ok: { __bytesBase64url: 'b2s' },
	bad: { __bytesBase64url: '_w' },
	nested: [ { __bytesBase64url: 'w78' }, 7, false, null ],
};
const projectedResponse = projectResponseStrings( rawResponse );
assert.deepEqual( projectedResponse, {
	ok: 'ok',
	bad: '\ufffd',
	nested: [ 'ÿ', 7, false, null ],
} );
assert.deepEqual( rawResponse, {
	ok: { __bytesBase64url: 'b2s' },
	bad: { __bytesBase64url: '_w' },
	nested: [ { __bytesBase64url: 'w78' }, 7, false, null ],
} );

assert.equal( isByteEnvelope( { __bytesBase64url: '' } ), true );
assert.equal( isByteEnvelope( { __bytesBase64url: '', extra: 1 } ), false );
assert.equal( isByteEnvelope( { __bytesBase64url: 1 } ), false );
assert.equal( isByteEnvelope( [ { __bytesBase64url: '' } ] ), false );

for ( const invalidResponse of [
	'unenveloped',
	{ nested: 'unenveloped' },
	{ __bytesBase64url: 1 },
	{ __bytesBase64url: '', extra: null },
	{ __bytesBase64url: '*' },
	new Uint8Array(),
	undefined,
	Number.NaN,
] ) {
	assert.throws(
		() => projectResponseStrings( invalidResponse ),
		TypeError,
		'rejects a non-protocol response value',
	);
}

const dangerous = JSON.parse(
	'{"__proto__":{"__bytesBase64url":"b2s"},"safe":{"__bytesBase64url":"b2s"}}',
);
const projectedDangerous = projectResponseStrings( dangerous );
assert.equal( Object.getPrototypeOf( projectedDangerous ), Object.prototype );
assert.equal(
	Object.prototype.hasOwnProperty.call( projectedDangerous, '__proto__' ),
	true,
);
assert.equal( projectedDangerous.__proto__, 'ok' );
assert.equal( projectedDangerous.safe, 'ok' );

assert.deepEqual(
	formatByteRows(
		Uint8Array.of( 0x20, 0x41, 0x7e, 0x1f, 0x80, 0xff ),
		4,
	),
	[
		{ offset: 0, hex: '20 41 7E 1F', gutter: ' A~\ufffd' },
		{ offset: 4, hex: '80 FF', gutter: '\ufffd\ufffd' },
	],
);

for ( const invalidWidth of [ 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY ] ) {
	assert.throws(
		() => formatByteRows( allBytes, invalidWidth ),
		RangeError,
		`rejects row width ${ invalidWidth }`,
	);
}

console.log( 'All browser byte transport tests passed.' );
