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

function fakeElement( localName, children = [], hasOtherNodes = false ) {
	return {
		localName,
		children,
		hasChildNodes: () => hasOtherNodes || children.length > 0,
	};
}

function fakeContextDocument( {
	body = fakeElement( 'body' ),
	head = fakeElement( 'head' ),
	documentElement = null,
} = {} ) {
	return {
		body,
		head,
		documentElement: documentElement ?? fakeElement( 'html', [ head, body ] ),
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

const nestedContext = fakeElement( 'span' );
const populatedContextDocument = fakeContextDocument( {
	body: fakeElement( 'body', [ fakeElement( 'main', [ nestedContext ] ) ] ),
} );
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( populatedContextDocument ),
		'<!DOCTYPE html><body><main><span>',
	),
	nestedContext,
	'populated context uses the final parsed element',
);

const titledHead = fakeElement( 'head', [ fakeElement( 'title' ) ] );
const titledDocument = fakeContextDocument( { head: titledHead } );
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( titledDocument ),
		'<!doctype html><head><!-- <body> --><title>x</title>',
	),
	titledHead.children[ 0 ],
	'comment text cannot author BODY',
);
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( titledDocument ),
		'<!doctype html><head><title>x</title></head><body>',
	),
	titledDocument.body,
	'an explicit empty BODY outranks a populated HEAD',
);
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( titledDocument ),
		'<title></title x="</title><body>',
	),
	titledHead.children[ 0 ],
	'an incomplete appropriate RCDATA end tag consumes through EOF',
);

for ( const context of [
	'<body-foo>',
	'<div data-context="<body>">',
	'<style><body></style>',
	'<textarea><body></textarea>',
	'<plaintext><body>',
	'<template><body></template>',
	'<!DOCTYPE html SYSTEM "x<body">',
] ) {
	assert.equal(
		resolveFragmentTarget( /** @type {any} */ ( emptyContextDocument ), context ),
		emptyContextDocument.documentElement,
		`${ context } cannot falsely author BODY`,
	);
}

assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( emptyContextDocument ),
		'<!doctype html><!--><body>',
	),
	emptyContextDocument.body,
	'an abrupt empty comment exposes the following authored BODY',
);
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( emptyContextDocument ),
		'<body a=b">',
	),
	emptyContextDocument.body,
	'a quote in an unquoted attribute does not swallow the tag closer',
);
for ( const context of [
	'<body =">',
	'<!doctype html><head><meta ="x><body></body><!--">',
	'<!DOCTYPE html SYSTEM "x><body>">',
] ) {
	assert.equal(
		resolveFragmentTarget( /** @type {any} */ ( emptyContextDocument ), context ),
		emptyContextDocument.body,
		`${ context } consumes a leading equals sign as an attribute name`,
	);
}

const scriptHeadDocument = fakeContextDocument( {
	head: fakeElement( 'head', [ fakeElement( 'script' ) ] ),
} );
for ( const context of [
	'<!doctype html><head><script><!x<script></script><body></script>',
	'<!doctype html><head><script><!-x<script></script><body></script>',
] ) {
	assert.equal(
		resolveFragmentTarget( /** @type {any} */ ( scriptHeadDocument ), context ),
		scriptHeadDocument.body,
		`${ context } returns from escape start to script data`,
	);
}

const textBodyDocument = fakeContextDocument( {
	body: fakeElement( 'body', [], true ),
} );
assert.equal(
	resolveFragmentTarget( /** @type {any} */ ( textBodyDocument ), '0' ),
	textBodyDocument.body,
	'implicit BODY text selects BODY',
);

const templateLeaf = fakeElement( 'strong' );
const template = fakeElement( 'template' );
template.content = { children: [ fakeElement( 'em' ), templateLeaf ] };
const foreignRealmTemplateDocument = fakeContextDocument( {
	body: fakeElement( 'body', [ fakeElement( 'main' ), template ] ),
} );
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( foreignRealmTemplateDocument ),
		'<!doctype html><body><main></main><template><em></em><strong>',
	),
	templateLeaf,
	'template content is traversed without realm-specific instanceof checks',
);

const framesetDocument = fakeContextDocument( {
	body: fakeElement( 'frameset' ),
} );
assert.equal(
	resolveFragmentTarget(
		/** @type {any} */ ( framesetDocument ),
		'<!doctype html><frameset>',
	),
	framesetDocument.body,
	'empty FRAMESET remains the context root',
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
