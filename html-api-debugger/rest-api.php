<?php
/**
 * REST API transport for exact HTML bytes.
 *
 * @package HtmlApiDebugger
 */

namespace HTML_API_Debugger;

/**
 * Validate and decode a byte-safe HTML API request.
 *
 * @param mixed $params Decoded JSON request parameters.
 * @return array{0: string, 1: array{context_html: ?string, selector: ?string}} Decoded input and options.
 * @throws \InvalidArgumentException When the request does not match the wire contract.
 */
function decode_byte_htmlapi_request( $params ): array {
	if ( ! is_array( $params ) ) {
		throw new \InvalidArgumentException( 'Invalid byte transport request.' );
	}

	$expected_keys = array( 'context64', 'html64', 'selector' );
	$actual_keys   = array_keys( $params );
	sort( $actual_keys );
	if ( $expected_keys !== $actual_keys ) {
		throw new \InvalidArgumentException( 'Invalid byte transport request.' );
	}

	foreach ( $expected_keys as $key ) {
		if ( ! is_string( $params[ $key ] ) ) {
			throw new \InvalidArgumentException( 'Invalid byte transport request.' );
		}
	}

	if ( 1 !== preg_match( '//u', $params['selector'] ) ) {
		throw new \InvalidArgumentException( 'Invalid byte transport request.' );
	}

	$html         = decode_base64url( $params['html64'] );
	$context_html = decode_base64url( $params['context64'] );

	return array(
		$html,
		array(
			'context_html' => '' === $context_html ? null : $context_html,
			'selector' => '' === $params['selector'] ? null : $params['selector'],
		),
	);
}

/**
 * Assert that response object keys are printable ASCII protocol keys.
 *
 * @param mixed $value Response value.
 * @throws \UnexpectedValueException When a protocol key is not printable ASCII.
 */
function assert_ascii_protocol_keys( $value ): void {
	if ( is_object( $value ) ) {
		$value = get_object_vars( $value );
	}

	if ( ! is_array( $value ) ) {
		return;
	}

	foreach ( $value as $key => $item ) {
		if ( is_string( $key ) && 1 !== preg_match( '/\A[\x20-\x7E]+\z/D', $key ) ) {
			throw new \UnexpectedValueException( 'Response contains a non-ASCII protocol key.' );
		}
		assert_ascii_protocol_keys( $item );
	}
}

/**
 * Process a byte-safe HTML API REST request.
 *
 * @param \WP_REST_Request $request REST request.
 * @return array|\WP_Error Byte-enveloped response or request error.
 */
function handle_byte_htmlapi_request( \WP_REST_Request $request ) {
	try {
		list( $html, $options ) = decode_byte_htmlapi_request( $request->get_json_params() );
	} catch ( \InvalidArgumentException $e ) {
		return new \WP_Error(
			'html_api_debugger_invalid_byte_request',
			'Invalid byte transport request.',
			array( 'status' => 400 )
		);
	}

	$response = prepare_html_result_object( $html, $options );
	assert_ascii_protocol_keys( $response );

	return envelope_response_strings( $response );
}
