/**
 * Start a controller operation before committing its corresponding UI state.
 *
 * Only the controller boundary is caught. UI commit failures remain visible to
 * the caller and are never mislabeled as transport failures.
 *
 * @template T
 * @param {() => T} start Synchronous controller-operation prelude.
 * @param {(value: T) => void} onStarted UI commit after a successful prelude.
 * @param {(error: unknown) => void} onError Controller-prelude failure handler.
 * @returns {{started: true, value: T}|{started: false}} Tagged start result.
 */
export function beginUiOperation( start, onStarted, onError ) {
	/** @type {T} */
	let value;
	try {
		value = start();
	} catch ( error ) {
		onError( error );
		return { started: false };
	}

	onStarted( value );
	return { started: true, value };
}

/**
 * Apply conversion UI only when the completing operation is still current.
 *
 * @template T
 * @param {Promise<T|null>} operation Generation-aware conversion operation.
 * @param {(value: T) => void} onCurrent UI commit for a current completion.
 * @returns {Promise<boolean>} Whether current conversion UI was applied.
 */
export async function settleUiConversion( operation, onCurrent ) {
	const value = await operation;
	if ( value === null ) {
		return false;
	}
	onCurrent( value );
	return true;
}
