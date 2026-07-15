import assert from 'node:assert/strict';

import {
	ByteDocumentPreview,
	resolveFragmentTarget,
	splitByteSpan,
} from '../html-api-debugger/byte-preview.mjs';

class FakeUrlApi {
	constructor() {
		this.nextId = 1;
		/** @type {Map<string, Blob>} */
		this.blobs = new Map();
		/** @type {string[]} */
		this.revoked = [];
		this.failCreation = false;
	}

	/** @param {Blob} blob */
	createObjectURL( blob ) {
		if ( this.failCreation ) {
			throw new Error( 'URL creation failed' );
		}
		const url = `blob:test-${ this.nextId++ }`;
		this.blobs.set( url, blob );
		return url;
	}

	/** @param {string} url */
	revokeObjectURL( url ) {
		this.revoked.push( url );
	}
}

let assignedSrc = 'about:blank';
let failAssignment = false;
const iframe = {
	get src() {
		return assignedSrc;
	},
	set src( value ) {
		if ( failAssignment ) {
			throw new Error( 'navigation failed' );
		}
		assignedSrc = value;
	},
};
const urlApi = new FakeUrlApi();
const preview = new ByteDocumentPreview( iframe, urlApi );

const acceptanceBytes = Uint8Array.from(
	Buffer.from( '3c696672616d653e41ff423c2f696672616d653e', 'hex' ),
);
const firstUrl = preview.load( acceptanceBytes );
const firstBlob = urlApi.blobs.get( firstUrl );
assert.ok( firstBlob instanceof Blob );
assert.equal( firstBlob.type, 'text/html;charset=utf-8' );
assert.deepEqual( new Uint8Array( await firstBlob.arrayBuffer() ), acceptanceBytes );
assert.equal( iframe.src, firstUrl );
assert.equal( preview.isCurrent( firstUrl ), true );
assert.deepEqual( urlApi.revoked, [] );

const secondBytes = Uint8Array.of( 0xff, 0xc3, 0xbf );
const secondUrl = preview.load( secondBytes );
assert.notEqual( secondUrl, firstUrl );
assert.equal( preview.isCurrent( firstUrl ), false );
assert.equal( preview.isCurrent( secondUrl ), true );
assert.deepEqual( urlApi.revoked, [ firstUrl ] );
assert.equal( urlApi.revoked.includes( secondUrl ), false );
assert.deepEqual(
	new Uint8Array( await urlApi.blobs.get( secondUrl ).arrayBuffer() ),
	secondBytes,
);

failAssignment = true;
assert.throws( () => preview.load( Uint8Array.of( 1 ) ), /navigation failed/u );
const orphanUrl = 'blob:test-3';
assert.equal( preview.isCurrent( secondUrl ), true );
assert.equal( iframe.src, secondUrl );
assert.deepEqual( urlApi.revoked, [ firstUrl, orphanUrl ] );

urlApi.failCreation = true;
assert.throws( () => preview.load( Uint8Array.of( 2 ) ), /URL creation failed/u );
assert.equal( preview.isCurrent( secondUrl ), true );
assert.deepEqual( urlApi.revoked, [ firstUrl, orphanUrl ] );
urlApi.failCreation = false;
failAssignment = false;

preview.dispose();
preview.dispose();
assert.equal( preview.isCurrent( secondUrl ), false );
assert.deepEqual( urlApi.revoked, [ firstUrl, orphanUrl, secondUrl ] );

assert.throws(
	() => preview.load( /** @type {any} */ ( 'not bytes' ) ),
	TypeError,
);

const spanBytes = Uint8Array.of( 0xc3, 0xbf, 0xff, 0x41 );
assert.deepEqual( splitByteSpan( spanBytes, 2, 1 ), {
	before: Uint8Array.of( 0xc3, 0xbf ),
	current: Uint8Array.of( 0xff ),
	after: Uint8Array.of( 0x41 ),
} );
assert.deepEqual( splitByteSpan( spanBytes, 0, 0 ), {
	before: new Uint8Array(),
	current: new Uint8Array(),
	after: spanBytes,
} );
assert.deepEqual( splitByteSpan( spanBytes, spanBytes.length, 0 ), {
	before: spanBytes,
	current: new Uint8Array(),
	after: new Uint8Array(),
} );

for ( const [ start, length ] of [
	[ -1, 1 ],
	[ 0, -1 ],
	[ 4, 1 ],
	[ 3, 2 ],
] ) {
	assert.throws( () => splitByteSpan( spanBytes, start, length ), RangeError );
}
for ( const [ start, length ] of [
	[ Number.NaN, 0 ],
	[ Number.POSITIVE_INFINITY, 0 ],
	[ 0.5, 1 ],
	[ 0, 1.5 ],
] ) {
	assert.throws( () => splitByteSpan( spanBytes, start, length ), TypeError );
}

function fakeContextDocument( walkedElements = [], bodyHasNodes = false, headHasNodes = false ) {
	const body = { name: 'BODY', hasChildNodes: () => bodyHasNodes };
	const head = { name: 'HEAD', hasChildNodes: () => headHasNodes };
	const documentElement = { name: 'HTML' };
	let offset = -1;
	const walker = {
		currentNode: documentElement,
		nextNode() {
			offset += 1;
			if ( offset >= walkedElements.length ) {
				return false;
			}
			this.currentNode = walkedElements[ offset ];
			return true;
		},
	};
	return {
		body,
		head,
		documentElement,
		createTreeWalker() {
			return walker;
		},
	};
}

const emptyContextDocument = fakeContextDocument();
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( emptyContextDocument ),
		'<!DOCTYPE html><head>',
	),
	emptyContextDocument.head,
	'empty authored HEAD remains the native fragment context',
);
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( emptyContextDocument ),
		'<!DOCTYPE html><body>',
	),
	emptyContextDocument.body,
	'empty authored BODY remains the native fragment context',
);
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( emptyContextDocument ),
		'<!DOCTYPE html><html>',
	),
	emptyContextDocument.documentElement,
	'empty authored HTML uses the document element',
);
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( emptyContextDocument ),
		'<!DOCTYPE html>',
	),
	emptyContextDocument.documentElement,
	'doctype-only context falls back to the document element',
);

const nestedContext = { name: 'SPAN' };
const populatedContextDocument = fakeContextDocument(
	[ { name: 'HTML' }, { name: 'BODY' }, { name: 'MAIN' }, nestedContext ],
	true,
);
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( populatedContextDocument ),
		'<!DOCTYPE html><body><main><span>',
	),
	nestedContext,
	'populated context uses the final parsed element',
);
assert.throws(
	() =>
		resolveFragmentTarget(
			/** @type {any} */ ( emptyContextDocument ),
			/** @type {any} */ ( null ),
		),
	TypeError,
);

console.log( 'All byte preview tests passed.' );
