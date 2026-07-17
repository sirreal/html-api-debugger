<?php
/**
 * Regression tests for the byte-safe REST API transport.
 *
 * Run with:
 *
 *     php tests/rest-api-regression.php
 *
 * @package HtmlApiDebugger
 */

// phpcs:disable
// This standalone CLI harness intentionally defines WordPress stubs and writes TAP-like output.

namespace {
	class WP_REST_Request {
		private $params;

		public function __construct( $params ) {
			$this->params = $params;
		}

		public function get_json_params() {
			return $this->params;
		}
	}

	class WP_Error {
		public $code;
		public $message;
		public $data;

		public function __construct( $code, $message, $data ) {
			$this->code    = $code;
			$this->message = $message;
			$this->data    = $data;
		}
	}
}

namespace HTML_API_Debugger {
	$test_processing_calls   = array();
	$test_response_object    = null;
	$test_use_non_ascii_key  = false;

	function prepare_html_result_object( string $html, ?array $options = null ): array {
		global $test_processing_calls, $test_response_object, $test_use_non_ascii_key;

		$test_processing_calls[] = array( $html, $options );

		$test_response_object        = new \stdClass();
		$test_response_object->label = "\xff";
		$test_response_object->start = 0;

		$response = array(
			'supports' => array( 'selectors' => true ),
			'html' => $html,
			'error' => null,
			'result' => array(
				'message' => 'ok',
				'span' => $test_response_object,
			),
			'normalizedHtml' => "\xff",
		);

		if ( $test_use_non_ascii_key ) {
			$response[ "bad\xc3\xa9" ] = 'no';
		}

		return $response;
	}
}

namespace {
	require dirname( __DIR__ ) . '/html-api-debugger/byte-transport.php';
	require dirname( __DIR__ ) . '/html-api-debugger/rest-api.php';

	function html_api_debugger_rest_fail( string $message ): void {
		fwrite( STDERR, "not ok - {$message}\n" );
		exit( 1 );
	}

	function html_api_debugger_rest_assert_same( string $label, $expected, $actual ): void {
		if ( $expected !== $actual ) {
			html_api_debugger_rest_fail(
				$label . "\nExpected: " . var_export( $expected, true ) . "\nActual: " . var_export( $actual, true )
			);
		}
		echo "ok - {$label}\n";
	}

	function html_api_debugger_rest_request( string $html, string $context = '', string $selector = '' ): WP_REST_Request {
		return new WP_REST_Request(
			array(
				'html64' => HTML_API_Debugger\encode_base64url( $html ),
				'context64' => HTML_API_Debugger\encode_base64url( $context ),
				'selector' => $selector,
			)
		);
	}

	function html_api_debugger_rest_assert_enveloped( $value ): void {
		if ( ! is_array( $value ) ) {
			if ( is_string( $value ) || is_object( $value ) ) {
				html_api_debugger_rest_fail( 'response contains an unenveloped string or object' );
			}
			return;
		}

		if ( array( '__bytesBase64url' ) === array_keys( $value ) ) {
			if ( ! is_string( $value['__bytesBase64url'] ) ) {
				html_api_debugger_rest_fail( 'byte envelope payload is not a string' );
			}
			HTML_API_Debugger\decode_base64url( $value['__bytesBase64url'] );
			return;
		}

		foreach ( $value as $key => $item ) {
			if ( is_string( $key ) && 1 !== preg_match( '/\A[\x20-\x7E]+\z/D', $key ) ) {
				html_api_debugger_rest_fail( 'response contains a non-ASCII key' );
			}
			html_api_debugger_rest_assert_enveloped( $item );
		}
	}

	$acceptance_bytes = hex2bin( '3c696672616d653e41ff423c2f696672616d653e' );
	if ( false === $acceptance_bytes ) {
		html_api_debugger_rest_fail( 'could not construct acceptance bytes' );
	}

	$response = HTML_API_Debugger\handle_byte_htmlapi_request(
		html_api_debugger_rest_request( $acceptance_bytes )
	);
	html_api_debugger_rest_assert_same(
		'acceptance bytes reach processing unchanged',
		$acceptance_bytes,
		$test_processing_calls[0][0]
	);
	html_api_debugger_rest_assert_same(
		'response input envelope round trips acceptance bytes',
		$acceptance_bytes,
		HTML_API_Debugger\decode_base64url( $response['html']['__bytesBase64url'] )
	);

	HTML_API_Debugger\handle_byte_htmlapi_request( html_api_debugger_rest_request( "\xff" ) );
	HTML_API_Debugger\handle_byte_htmlapi_request( html_api_debugger_rest_request( "\xc3\xbf" ) );
	html_api_debugger_rest_assert_same( 'raw FF reaches processing', "\xff", $test_processing_calls[1][0] );
	html_api_debugger_rest_assert_same( 'UTF-8 C3 BF reaches processing', "\xc3\xbf", $test_processing_calls[2][0] );

	HTML_API_Debugger\handle_byte_htmlapi_request(
		html_api_debugger_rest_request( 'x', " \n", ' div ' )
	);
	html_api_debugger_rest_assert_same( 'context whitespace is preserved', " \n", $test_processing_calls[3][1]['context_html'] );
	html_api_debugger_rest_assert_same( 'selector whitespace is preserved', ' div ', $test_processing_calls[3][1]['selector'] );

	HTML_API_Debugger\handle_byte_htmlapi_request( html_api_debugger_rest_request( 'x', '0' ) );
	html_api_debugger_rest_assert_same( 'zero context remains fragment context', '0', $test_processing_calls[4][1]['context_html'] );

	HTML_API_Debugger\handle_byte_htmlapi_request( html_api_debugger_rest_request( 'x' ) );
	html_api_debugger_rest_assert_same( 'empty context means document mode', null, $test_processing_calls[5][1]['context_html'] );
	html_api_debugger_rest_assert_same( 'empty selector means no selector', null, $test_processing_calls[5][1]['selector'] );

	$valid_params = array(
		'html64' => 'eA',
		'context64' => '',
		'selector' => '',
	);
	$invalid_requests = array(
		null,
		array(),
		array( 'html64' => 'eA', 'context64' => '' ),
		array_merge( $valid_params, array( 'extra' => '' ) ),
		array_merge( $valid_params, array( 'html64' => 'Zg==' ) ),
		array_merge( $valid_params, array( 'context64' => '*' ) ),
		array_merge( $valid_params, array( 'html64' => array() ) ),
		array_merge( $valid_params, array( 'selector' => "\xff" ) ),
	);

	foreach ( $invalid_requests as $invalid_request ) {
		$call_count = count( $test_processing_calls );
		$error      = HTML_API_Debugger\handle_byte_htmlapi_request( new WP_REST_Request( $invalid_request ) );
		html_api_debugger_rest_assert_same( 'invalid request returns WP_Error', true, $error instanceof WP_Error );
		html_api_debugger_rest_assert_same( 'invalid request error code is stable', 'html_api_debugger_invalid_byte_request', $error->code );
		html_api_debugger_rest_assert_same( 'invalid request error message is stable', 'Invalid byte transport request.', $error->message );
		html_api_debugger_rest_assert_same( 'invalid request status is 400', array( 'status' => 400 ), $error->data );
		html_api_debugger_rest_assert_same( 'invalid request is not processed', $call_count, count( $test_processing_calls ) );
	}

	html_api_debugger_rest_assert_enveloped( $response );
	html_api_debugger_rest_assert_same( 'response object was not mutated', "\xff", $test_response_object->label );
	if ( false === json_encode( $response ) ) {
		html_api_debugger_rest_fail( 'enveloped malformed response must JSON encode' );
	}
	echo "ok - complete malformed response is byte-enveloped and JSON-safe\n";

	$test_use_non_ascii_key = true;
	try {
		HTML_API_Debugger\handle_byte_htmlapi_request( html_api_debugger_rest_request( 'x' ) );
		html_api_debugger_rest_fail( 'non-ASCII response key was accepted' );
	} catch ( UnexpectedValueException $e ) {
		echo "ok - non-ASCII response keys are rejected\n";
	}

	echo "All byte-safe REST API regression tests passed.\n";
}
