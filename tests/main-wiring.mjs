import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const plugin = new URL( '../html-api-debugger/', import.meta.url );

async function source( name ) {
	return readFile( new URL( name, plugin ), 'utf8' );
}

function runtimeRelativeImports( text ) {
	return [
		...text.matchAll(
			/^\s*import\s+(?:[^'"\n]+?\s+from\s+)?['"](\.[^'"]+)['"];?$/gmu,
		),
	].map( ( match ) => match[ 1 ] );
}

const graph = {
	'main.mjs': await source( 'main.mjs' ),
	'runtime-controller.mjs': await source( 'runtime-controller.mjs' ),
	'canonical-url.mjs': await source( 'canonical-url.mjs' ),
	'response-transport.mjs': await source( 'response-transport.mjs' ),
	'runtime-wiring.mjs': await source( 'runtime-wiring.mjs' ),
	'byte-preview.mjs': await source( 'byte-preview.mjs' ),
	'byte-transport.mjs': await source( 'byte-transport.mjs' ),
};

assert.deepEqual( runtimeRelativeImports( graph[ 'main.mjs' ] ), [
	'./byte-preview.mjs?ver=3.0',
	'./byte-transport.mjs?ver=3.0',
	'./runtime-controller.mjs?ver=3.0',
	'./runtime-wiring.mjs?ver=3.0',
] );
assert.deepEqual( runtimeRelativeImports( graph[ 'runtime-controller.mjs' ] ), [
	'./canonical-url.mjs?ver=3.0',
	'./byte-preview.mjs?ver=3.0',
	'./byte-transport.mjs?ver=3.0',
	'./response-transport.mjs?ver=3.0',
] );
assert.deepEqual( runtimeRelativeImports( graph[ 'canonical-url.mjs' ] ), [
	'./byte-transport.mjs?ver=3.0',
] );
assert.deepEqual( runtimeRelativeImports( graph[ 'response-transport.mjs' ] ), [
	'./byte-transport.mjs?ver=3.0',
] );
assert.deepEqual( runtimeRelativeImports( graph[ 'runtime-wiring.mjs' ] ), [] );
assert.deepEqual( runtimeRelativeImports( graph[ 'byte-preview.mjs' ] ), [] );
assert.deepEqual( runtimeRelativeImports( graph[ 'byte-transport.mjs' ] ), [] );

for ( const [ file, text ] of Object.entries( graph ) ) {
	for ( const specifier of runtimeRelativeImports( text ) ) {
		assert.match( specifier, /\?ver=3\.0$/u, `${ file } has an unversioned live relative import` );
	}
}

const main = graph[ 'main.mjs' ];
assert.match( main, /new ByteRequestBoundary\s*\(/u );
assert.match( main, /new ByteRuntimeController\s*\(/u );
assert.match( main, /request:\s*\( body \) => requestBoundary\.request\( body \)/u );
assert.match( main, /new ByteDocumentPreview\s*\( RENDERED_IFRAME \)/u );
assert.match( main, /new BytePreviewCoordinator\s*\(/u );
assert.match( main, /previewCoordinator\.render\s*\(/u );
assert.match( main, /controller\.getPreviewPlan\s*\(/u );
assert.match( main, /requestBoundary\.dispose\s*\(/u );
assert.match( main, /function beginPendingResponse\s*\(\)/u );
assert.match( main, /store\.state\.playbackPoint\s*=\s*null;[\s\S]+?store\.state\.htmlapiResponse\s*=\s*\{/u );
assert.match( main, /async function settleControllerOperation\s*\([^)]*\)\s*\{\s*beginPendingResponse\(\);/u );
assert.match( main, /watch\(\)\s*\{\s*renderHtmlApiOutput\(\);\s*redrawCurrentDomTree\(\);/u );
assert.match( main, /resolveFragmentTarget\(\s*document,\s*projectUtf8\( controller\.contextBytes \)/u );
assert.doesNotMatch( main, /\.document\.write\s*\(|\.write\s*\(\s*html/u );
assert.doesNotMatch( main, /searchParams\.(?:set|get|has|delete)\(\s*['"](?:html|contextHTML|html-opts)['"]/u );
assert.doesNotMatch( main, /RENDERED_IFRAME\.src\s*=/u );

console.log( 'All main wiring tests passed.' );
