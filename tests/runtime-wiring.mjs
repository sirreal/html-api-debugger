import assert from 'node:assert/strict';

import { ByteDocumentPreview } from '../html-api-debugger/byte-preview.mjs';
import {
	BytePreviewCoordinator,
	ByteRequestBoundary,
	DisposedRuntimeBoundaryError,
	SupersededRuntimeOperationError,
} from '../html-api-debugger/runtime-wiring.mjs';

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise( ( res, rej ) => {
		resolve = res;
		reject = rej;
	} );
	return { promise, resolve, reject };
}

function fakeResponse( value, { nonce = null, ok = true } = {} ) {
	return {
		ok,
		headers: {
			get( name ) {
				return name === 'X-WP-Nonce' ? nonce : null;
			},
		},
		async json() {
			return value;
		},
	};
}

function createClock() {
	let nextId = 1;
	const tasks = new Map();
	return {
		setTimer( callback, delay ) {
			assert.equal( delay, 150 );
			const id = nextId++;
			tasks.set( id, callback );
			return id;
		},
		clearTimer( id ) {
			tasks.delete( id );
		},
		run() {
			const callbacks = [ ...tasks.values() ];
			tasks.clear();
			for ( const callback of callbacks ) {
				callback();
			}
		},
		get size() {
			return tasks.size;
		},
	};
}

class FakeAbortController {
	constructor() {
		this.signal = { aborted: false, reason: undefined };
	}

	abort( reason ) {
		this.signal.aborted = true;
		this.signal.reason = reason;
	}
}

const clock = createClock();
const fetches = [];
const requestBoundary = new ByteRequestBoundary( {
	endpoint: 'https://example.test/wp-json/html-api-debugger/v2/htmlapi',
	nonce: 'nonce-1',
	fetch: ( url, options ) => {
		const response = deferred();
		fetches.push( { url, options, response } );
		return response.promise;
	},
	AbortController: FakeAbortController,
	setTimer: clock.setTimer,
	clearTimer: clock.clearTimer,
} );

const bodyA = { html64: '_w', context64: '', selector: '' };
const bodyB = { html64: 'w78', context64: 'IA', selector: '.x' };
const pendingA = requestBoundary.request( bodyA );
const pendingARejection = assert.rejects(
	pendingA,
	SupersededRuntimeOperationError,
);
const pendingB = requestBoundary.request( bodyB );
await pendingARejection;
assert.equal( clock.size, 1, 'replacement keeps only one debounce timer' );
clock.run();
assert.equal( fetches.length, 1, 'debounced requests coalesce to one fetch' );
assert.equal( fetches[ 0 ].url.includes( '/v2/' ), true );
assert.deepEqual( JSON.parse( fetches[ 0 ].options.body ), bodyB );
assert.deepEqual( fetches[ 0 ].options.headers, {
	'Content-Type': 'application/json',
	'X-WP-Nonce': 'nonce-1',
} );
fetches[ 0 ].response.resolve( fakeResponse( { newest: true }, { nonce: 'nonce-2' } ) );
assert.deepEqual( await pendingB, { newest: true } );

const reverseOld = requestBoundary.request( bodyA );
clock.run();
const oldFetch = fetches.at( -1 );
const reverseNew = requestBoundary.request( bodyB );
assert.equal( oldFetch.options.signal.aborted, true, 'replacement aborts an active fetch immediately' );
clock.run();
const newFetch = fetches.at( -1 );
newFetch.response.resolve( fakeResponse( { generation: 'new' }, { nonce: 'nonce-new' } ) );
assert.deepEqual( await reverseNew, { generation: 'new' } );
oldFetch.response.resolve( fakeResponse( { generation: 'old' }, { nonce: 'nonce-old' } ) );
await assert.rejects( reverseOld, SupersededRuntimeOperationError );

const nonceProbe = requestBoundary.request( bodyA );
clock.run();
const probeFetch = fetches.at( -1 );
assert.equal( probeFetch.options.headers[ 'X-WP-Nonce' ], 'nonce-new', 'late aborted success cannot overwrite the newest nonce' );

const replacementProbe = requestBoundary.request( bodyB );
assert.equal( probeFetch.options.signal.aborted, true, 'late cleanup cannot clear the newer active controller' );
clock.run();
const replacementFetch = fetches.at( -1 );
replacementFetch.response.resolve( fakeResponse( { replacement: true } ) );
await replacementProbe;
probeFetch.response.resolve( fakeResponse( { stale: true } ) );
await assert.rejects( nonceProbe, SupersededRuntimeOperationError );

const staleNonOk = requestBoundary.request( bodyA );
clock.run();
const staleNonOkFetch = fetches.at( -1 );
const currentAfterNonOk = requestBoundary.request( bodyB );
clock.run();
const currentAfterNonOkFetch = fetches.at( -1 );
currentAfterNonOkFetch.response.resolve( fakeResponse( { current: true }, { nonce: 'nonce-current' } ) );
await currentAfterNonOk;
staleNonOkFetch.response.resolve( fakeResponse( null, { nonce: 'nonce-stale-error', ok: false } ) );
await assert.rejects( staleNonOk, SupersededRuntimeOperationError );

const currentNonOk = requestBoundary.request( bodyA );
clock.run();
const currentNonOkFetch = fetches.at( -1 );
const nonOkResponse = fakeResponse( null, { nonce: 'nonce-error', ok: false } );
currentNonOkFetch.response.resolve( nonOkResponse );
await assert.rejects( currentNonOk, ( error ) => error === nonOkResponse );
const nonceAfterError = requestBoundary.request( bodyB );
clock.run();
const nonceAfterErrorFetch = fetches.at( -1 );
assert.equal( nonceAfterErrorFetch.options.headers[ 'X-WP-Nonce' ], 'nonce-error', 'a current non-ok response refreshes the nonce' );
nonceAfterErrorFetch.response.resolve( fakeResponse( {} ) );
await nonceAfterError;

const disposedPending = requestBoundary.request( bodyA );
requestBoundary.dispose();
await assert.rejects( disposedPending, DisposedRuntimeBoundaryError );
await assert.rejects(
	requestBoundary.request( bodyA ),
	DisposedRuntimeBoundaryError,
);

class FakeIframe {
	constructor() {
		this.listeners = new Map();
		this.failAssignment = false;
		this._src = 'about:blank';
		this.locationValue = 'about:blank';
		this.locationThrows = false;
		this.contentWindow = {
			document: { marker: 'document' },
			location: {},
		};
		Object.defineProperty( this.contentWindow.location, 'href', {
			get: () => {
				if ( this.locationThrows ) {
					throw new Error( 'location failed' );
				}
				return this.locationValue;
			},
		} );
	}

	get src() {
		return this._src;
	}

	set src( value ) {
		if ( this.failAssignment ) {
			throw new Error( 'src assignment failed' );
		}
		this._src = value;
	}

	addEventListener( type, listener ) {
		const listeners = this.listeners.get( type ) ?? new Set();
		listeners.add( listener );
		this.listeners.set( type, listeners );
	}

	removeEventListener( type, listener ) {
		this.listeners.get( type )?.delete( listener );
	}

	dispatchLoad( url ) {
		this.locationValue = url;
		for ( const listener of [ ...( this.listeners.get( 'load' ) ?? [] ) ] ) {
			listener( { type: 'load' } );
		}
	}

	listenerCount( type ) {
		return this.listeners.get( type )?.size ?? 0;
	}
}

class FakeEventTarget {
	constructor() {
		this.listeners = new Map();
	}

	addEventListener( type, listener ) {
		this.listeners.set( type, listener );
	}

	removeEventListener( type, listener ) {
		if ( this.listeners.get( type ) === listener ) {
			this.listeners.delete( type );
		}
	}

	dispatch( type ) {
		this.listeners.get( type )?.( { type } );
	}
}

function plan( documentBytes, fragmentBytes = null, text = '', lossy = false ) {
	return {
		documentBytes: Uint8Array.from( documentBytes ),
		fragment:
			fragmentBytes === null
				? null
				: {
						bytes: Uint8Array.from( fragmentBytes ),
						text,
						lossy,
					},
	};
}

const iframe = new FakeIframe();
const pagehideTarget = new FakeEventTarget();
const revoked = [];
let nextUrl = 1;
let failCreation = false;
const urlApi = {
	createObjectURL() {
		if ( failCreation ) {
			throw new Error( 'object URL failed' );
		}
		return `blob:preview-${ nextUrl++ }`;
	},
	revokeObjectURL( url ) {
		revoked.push( url );
	},
};
const preview = new ByteDocumentPreview( iframe, urlApi, Blob );
const order = [];
const restored = [];
const contextElement = { innerHTML: '' };
let resolveFailure = false;
let assignmentFailure = false;
let observerFailure = false;
const fragmentTarget = {};
Object.defineProperty( fragmentTarget, 'innerHTML', {
	get() {
		return contextElement.innerHTML;
	},
	set( value ) {
		order.push( `fragment:${ value }` );
		if ( assignmentFailure ) {
			throw new Error( 'fragment assignment failed' );
		}
		contextElement.innerHTML = value;
	},
} );
const coordinator = new BytePreviewCoordinator( {
	preview,
	iframe,
	resolveFragmentTarget() {
		order.push( 'resolve' );
		if ( resolveFailure ) {
			throw new Error( 'resolve failed' );
		}
		return fragmentTarget;
	},
	onCurrentDocument( details ) {
		order.push( `observe:${ details.url }` );
		if ( observerFailure ) {
			throw new Error( 'observer failed' );
		}
	},
	restoreCurrentDocument( details ) {
		restored.push( details.url );
	},
	disconnectObserver() {
		order.push( 'disconnect' );
	},
	pagehideTarget,
} );

const fragmentPlanA = plan( [ 0x3c, 0x62, 0x6f, 0x64, 0x79, 0x3e ], [ 0xff ], '\ufffd', true );
assert.equal( coordinator.render( fragmentPlanA ), true );
const urlA = iframe.src;
assert.equal( coordinator.render( fragmentPlanA ), false, 'identical pending plan does not navigate twice' );
assert.equal( iframe.src, urlA );
assert.equal( iframe.listenerCount( 'load' ), 1 );
iframe.dispatchLoad( 'about:blank' );
assert.equal( iframe.listenerCount( 'load' ), 1, 'mismatched load retains the rightful pending handler' );
assert.equal( contextElement.innerHTML, '' );
iframe.dispatchLoad( urlA );
assert.equal( contextElement.innerHTML, '\ufffd' );
assert.deepEqual( order.slice( -3 ), [ 'resolve', 'fragment:\ufffd', `observe:${ urlA }` ], 'fragment is applied once before observation' );
assert.equal( iframe.listenerCount( 'load' ), 0 );
contextElement.innerHTML = 'mutated';
assert.equal( coordinator.render( fragmentPlanA ), false, 'committed identical plan does not reset mutations' );
assert.equal( contextElement.innerHTML, 'mutated' );

const documentPlan = plan( [ 0x41 ] );
assert.equal( coordinator.render( documentPlan ), true );
const documentUrl = iframe.src;
assert.deepEqual( revoked, [ urlA ], 'a superseded object URL is revoked' );
iframe.dispatchLoad( urlA );
assert.equal( iframe.listenerCount( 'load' ), 1, 'stale old URL cannot consume the new handler' );
iframe.dispatchLoad( documentUrl );
assert.equal( iframe.listenerCount( 'load' ), 0 );

failCreation = true;
assert.throws( () => coordinator.render( plan( [ 0x42 ] ) ), /object URL failed/ );
failCreation = false;
assert.equal( coordinator.render( documentPlan ), false, 'pre-navigation creation failure retains a true prior commit' );
assert.equal( restored.at( -1 ), documentUrl );

iframe.failAssignment = true;
assert.throws( () => coordinator.render( plan( [ 0x43 ] ) ), /src assignment failed/ );
iframe.failAssignment = false;
assert.equal( coordinator.render( documentPlan ), false, 'pre-navigation assignment failure retains a true prior commit' );
assert.equal( iframe.listenerCount( 'load' ), 0, 'failed load leaks no handler' );

resolveFailure = true;
const failingFragment = plan( [ 0x44 ], [ 0x45 ], 'E' );
assert.equal( coordinator.render( failingFragment ), true );
const failingUrl = iframe.src;
iframe.dispatchLoad( failingUrl );
resolveFailure = false;
assert.equal( restored.at( -1 ), failingUrl );
assert.equal( coordinator.render( documentPlan ), true, 'old plan navigates after post-navigation failure invalidates its old commit' );
const retriedOldUrl = iframe.src;
iframe.dispatchLoad( retriedOldUrl );

const pendingPlanA = plan( [ 0x50 ] );
const pendingPlanB = plan( [ 0x51 ] );
assert.equal( coordinator.render( pendingPlanA ), true );
const pendingUrlA = iframe.src;
failCreation = true;
assert.throws( () => coordinator.render( pendingPlanB ), /object URL failed/ );
failCreation = false;
assert.equal( coordinator.render( pendingPlanA ), true, 'failed supersession leaves prior pending plan retryable' );
assert.notEqual( iframe.src, pendingUrlA );
iframe.dispatchLoad( iframe.src );
assert.equal( coordinator.render( pendingPlanB ), true, 'failed superseding plan is independently retryable' );
iframe.dispatchLoad( iframe.src );

for ( const failure of [ 'location', 'assignment', 'observer' ] ) {
	const failurePlan = plan( [ failure.length ], [ 0x58 ], failure );
	iframe.locationThrows = failure === 'location';
	assignmentFailure = failure === 'assignment';
	observerFailure = failure === 'observer';
	assert.equal( coordinator.render( failurePlan ), true );
	const failureUrl = iframe.src;
	iframe.dispatchLoad( failureUrl );
	iframe.locationThrows = false;
	assignmentFailure = false;
	observerFailure = false;
	assert.equal( coordinator.render( failurePlan ), true, `${ failure } failure leaves the plan retryable` );
	iframe.dispatchLoad( iframe.src );
}

const finalUrl = iframe.src;
pagehideTarget.dispatch( 'pagehide' );
assert.equal( revoked.filter( ( url ) => url === finalUrl ).length, 1, 'pagehide revokes the final URL exactly once' );
coordinator.dispose();
assert.equal( revoked.filter( ( url ) => url === finalUrl ).length, 1, 'dispose is idempotent' );
assert.throws( () => coordinator.render( documentPlan ), DisposedRuntimeBoundaryError );

console.log( 'All runtime wiring tests passed.' );
