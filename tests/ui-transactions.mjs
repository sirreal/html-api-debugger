import assert from 'node:assert/strict';

import { ByteRuntimeController } from '../html-api-debugger/runtime-controller.mjs';
import {
	beginUiOperation,
	settleUiConversion,
} from '../html-api-debugger/ui-transactions.mjs';

const admin =
	'https://example.test/wp-admin/admin.php?page=html-api-debugger&format=v1&html64=QQ&context64=&selector=&opts=';

let resolveOlderRequest;
const requests = [];
let rejectUrlWrite = false;
const controller = new ByteRuntimeController( {
	url: new URL( admin ),
	supports: { create_fragment_advanced: true },
	request: ( body ) => {
		requests.push( body );
		return new Promise( ( resolve ) => {
			resolveOlderRequest = resolve;
		} );
	},
	replaceUrl: () => {
		if ( rejectUrlWrite ) {
			throw new Error( 'URL write failed' );
		}
	},
	confirmConversion: () => false,
} );

const olderRequest = controller.start();
const projectedResponse = { result: { tree: 'older tree' } };
const state = {
	view: 'bytes',
	playback: 1,
	projectedResponse,
	error: null,
};
rejectUrlWrite = true;
const failedStart = beginUiOperation(
	() => controller.editSource( 'html', 'B' ),
	() => {
		state.view = 'text';
		state.playback = null;
		state.projectedResponse = null;
	},
	( error ) => {
		state.error = error;
	},
);
assert.deepEqual( failedStart, { started: false } );
assert.equal( state.view, 'bytes' );
assert.equal( state.playback, 1 );
assert.equal( state.projectedResponse, projectedResponse );
assert.match( state.error.message, /URL write failed/u );
assert.equal( requests.length, 1 );
assert.equal( controller.isProcessing, true );
resolveOlderRequest( null );
await assert.rejects( olderRequest, TypeError );

const newerResponse = { result: { tree: 'newer tree' } };
const conversionState = {
	playback: 7,
	projectedResponse: newerResponse,
	applications: 0,
};
assert.equal(
	await settleUiConversion( Promise.resolve( null ), () => {
		conversionState.playback = null;
		conversionState.projectedResponse = { result: { tree: 'stale tree' } };
		++conversionState.applications;
	} ),
	false,
);
assert.equal( conversionState.playback, 7 );
assert.equal( conversionState.projectedResponse, newerResponse );
assert.equal( conversionState.applications, 0 );

assert.equal(
	await settleUiConversion( Promise.resolve( 'converted' ), ( value ) => {
		assert.equal( value, 'converted' );
		conversionState.playback = null;
		++conversionState.applications;
	} ),
	true,
);
assert.equal( conversionState.playback, null );
assert.equal( conversionState.applications, 1 );

let uiErrorWasMisreported = false;
assert.throws(
	() =>
		beginUiOperation(
			() => 'started',
			() => {
				throw new Error( 'UI commit failed' );
			},
			() => {
				uiErrorWasMisreported = true;
			},
		),
	/UI commit failed/u,
);
assert.equal( uiErrorWasMisreported, false );

console.log( 'All UI transaction tests passed.' );
