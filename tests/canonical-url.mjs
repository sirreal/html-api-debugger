import assert from 'node:assert/strict';

import {
	CanonicalUrlError,
	canonicalUrlPath,
	parseCanonicalUrl,
	serializeCanonicalUrl,
} from '../html-api-debugger/canonical-url.mjs';

const admin = 'https://example.test/wp-admin/admin.php?page=html-api-debugger';
const emptyState = {
	htmlBytes: new Uint8Array(),
	contextBytes: new Uint8Array(),
	selector: '',
	opts: '',
};

const bare = parseCanonicalUrl( new URL( admin ) );
assert.deepEqual( bare, { ...emptyState, needsCanonicalization: true } );

const canonicalEmpty = serializeCanonicalUrl( new URL( admin ), emptyState );
assert.equal(
	canonicalEmpty.href,
	`${ admin }&format=v1&html64=&context64=&selector=&opts=`,
);
assert.deepEqual( parseCanonicalUrl( canonicalEmpty ), {
	...emptyState,
	needsCanonicalization: false,
} );

const bareEmptyUrl = new URL(
	`${ admin }&format=v1&html64=PGZvbz4&context64&selector&opts`,
);
const parsedBareEmpty = parseCanonicalUrl( bareEmptyUrl );
assert.deepEqual(
	parsedBareEmpty.htmlBytes,
	new TextEncoder().encode( '<foo>' ),
);
assert.deepEqual( parsedBareEmpty.contextBytes, new Uint8Array() );
assert.equal( parsedBareEmpty.selector, '' );
assert.equal( parsedBareEmpty.opts, '' );
assert.equal( parsedBareEmpty.needsCanonicalization, true );
assert.equal(
	serializeCanonicalUrl( bareEmptyUrl, parsedBareEmpty ).href,
	`${ admin }&format=v1&html64=PGZvbz4&context64=&selector=&opts=`,
);

const allBytes = Uint8Array.from( { length: 256 }, ( _, index ) => index );
const state = {
	htmlBytes: allBytes,
	contextBytes: Uint8Array.of( 0xff ),
	selector: '.emoji-💣 > [title="ÿ"]',
	opts: 'CiV',
};
const canonical = serializeCanonicalUrl( new URL( `${ admin }&unrelated=kept` ), state );
const reparsed = parseCanonicalUrl( new URL( canonical.href ) );
assert.deepEqual( reparsed.htmlBytes, allBytes );
assert.deepEqual( reparsed.contextBytes, Uint8Array.of( 0xff ) );
assert.equal( reparsed.selector, state.selector );
assert.equal( reparsed.opts, state.opts );
assert.equal( reparsed.needsCanonicalization, false );
assert.equal( canonical.searchParams.get( 'unrelated' ), 'kept' );

const rawFf = serializeCanonicalUrl( new URL( admin ), {
	...emptyState,
	htmlBytes: Uint8Array.of( 0xff ),
} );
const utf8Ff = serializeCanonicalUrl( new URL( admin ), {
	...emptyState,
	htmlBytes: Uint8Array.of( 0xc3, 0xbf ),
} );
assert.equal( rawFf.searchParams.get( 'html64' ), '_w' );
assert.equal( utf8Ff.searchParams.get( 'html64' ), 'w78' );

for ( const opts of [ '', 'C', 'c', 'I', 'i', 'V', 'v', 'CIV', 'civ', 'CiV' ] ) {
	const url = serializeCanonicalUrl( new URL( admin ), { ...emptyState, opts } );
	assert.equal( parseCanonicalUrl( url ).opts, opts );
}

for ( const opts of [ 'IC', 'CC', 'Ii', 'X', 'C V' ] ) {
	assert.throws(
		() =>
			serializeCanonicalUrl( new URL( admin ), {
				...emptyState,
				opts,
			} ),
		CanonicalUrlError,
	);
}

for ( const invalidQuery of [
	'html64=&context64=&selector=&opts=',
	'format=v2&html64=&context64=&selector=&opts=',
	'format=v%31&html64=&context64=&selector=&opts=',
	'format=v1&html64=&context64=&selector=&opts=&html64=',
	'format=v1&html64=&context64=&selector=&opts=&html=x',
	'format=v1&html64=Zg%3D%3D&context64=&selector=&opts=',
	'format=v1&html64=%5Fw&context64=&selector=&opts=',
	'format=v1&html64=+w&context64=&selector=&opts=',
	'format=v1&html64=Zh&context64=&selector=&opts=',
	'format=v1&html64=&context64=%5Fw&selector=&opts=',
	'format=v1&ht%6Dl64=&context64=&selector=&opts=',
	'format=v1&html64=&context64&context64=&selector=&opts=',
	'format=v1&html64=&context64=&selector=&opts=%43',
	'format=v1&html64=&context64=&selector=&opts=IC',
	'html=x',
	'contextHTML=x',
	'html-opts=C',
	'selector=.x',
] ) {
	assert.throws(
		() => parseCanonicalUrl( new URL( `${ admin }&${ invalidQuery }` ) ),
		CanonicalUrlError,
		invalidQuery,
	);
}

for ( const rawSelector of [
	'%',
	'%0',
	'%GG',
	'%FF',
	'%C3',
	'%C0%AF',
	'%ED%A0%80',
	'%f0%9f%92%a3',
] ) {
	assert.throws(
		() =>
			parseCanonicalUrl(
				new URL(
					`${ admin }&format=v1&html64=&context64=&selector=${ rawSelector }&opts=`,
				),
			),
		CanonicalUrlError,
		rawSelector,
	);
}

const intentionalReplacement = parseCanonicalUrl(
	new URL(
		`${ admin }&format=v1&html64=&context64=&selector=%EF%BF%BD&opts=`,
	),
);
assert.equal( intentionalReplacement.selector, '\ufffd' );

assert.throws(
	() =>
		serializeCanonicalUrl( new URL( admin ), {
			...emptyState,
			selector: '\ud800',
		} ),
	CanonicalUrlError,
);
assert.throws(
	() =>
		serializeCanonicalUrl( new URL( admin ), {
			...emptyState,
			selector: '\udc00',
		} ),
	CanonicalUrlError,
);

const dirtyBase = new URL(
	`${ admin }&html=old&contextHTML=old&html-opts=C&keep=yes`,
);
const cleaned = serializeCanonicalUrl( dirtyBase, emptyState );
assert.equal( cleaned.searchParams.has( 'html' ), false );
assert.equal( cleaned.searchParams.has( 'contextHTML' ), false );
assert.equal( cleaned.searchParams.has( 'html-opts' ), false );
assert.equal( cleaned.searchParams.get( 'keep' ), 'yes' );
assert.match(
	cleaned.search,
	/keep=yes&format=v1&html64=&context64=&selector=&opts=$/u,
);

const playground = new URL(
	'https://playground.wordpress.net/?plugin=html-api-debugger',
);
playground.searchParams.set( 'url', canonicalUrlPath( rawFf ) );
const nestedPath = playground.searchParams.get( 'url' );
assert.equal( nestedPath, canonicalUrlPath( rawFf ) );
const nested = parseCanonicalUrl( new URL( nestedPath, 'https://example.test' ) );
assert.deepEqual( nested.htmlBytes, Uint8Array.of( 0xff ) );
assert.equal(
	new URL( nestedPath, 'https://example.test' ).searchParams.get( 'html64' ),
	'_w',
);

assert.deepEqual(
	parseCanonicalUrl( new URL( `${ admin }&unrelated=only` ) ),
	{ ...emptyState, needsCanonicalization: true },
);

console.log( 'All canonical URL tests passed.' );
