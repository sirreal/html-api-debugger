<?php
/**
 * Regression tests for byte-safe transport helpers.
 *
 * Run with:
 *
 *     php tests/byte-transport-regression.php
 *
 * @package HtmlApiDebugger
 */

// phpcs:disable
// This standalone CLI harness intentionally writes TAP-like output.

require dirname( __DIR__ ) . '/html-api-debugger/byte-transport.php';

/**
 * Fail the test process.
 *
 * @param string $message Failure details.
 */
function html_api_debugger_transport_fail( string $message ): void {
	fwrite( STDERR, "not ok - {$message}\n" );
	exit( 1 );
}

/**
 * Assert strict equality.
 *
 * @param string $label    Test label.
 * @param mixed  $expected Expected value.
 * @param mixed  $actual   Actual value.
 */
function html_api_debugger_transport_assert_same( string $label, $expected, $actual ): void {
	if ( $expected !== $actual ) {
		html_api_debugger_transport_fail(
			$label . "\nExpected: " . var_export( $expected, true ) . "\nActual: " . var_export( $actual, true )
		);
	}

	echo "ok - {$label}\n";
}

/**
 * Assert that canonical base64url decoding rejects a value.
 *
 * @param string $encoded Invalid encoded value.
 */
function html_api_debugger_transport_assert_rejected( string $encoded ): void {
	try {
		HTML_API_Debugger\decode_base64url( $encoded );
	} catch ( InvalidArgumentException $e ) {
		echo 'ok - rejects ' . var_export( $encoded, true ) . "\n";
		return;
	}

	html_api_debugger_transport_fail( 'accepted non-canonical base64url ' . var_export( $encoded, true ) );
}

$all_bytes = '';
for ( $byte = 0; $byte <= 0xff; ++$byte ) {
	$all_bytes .= chr( $byte );
}

foreach (
	array(
		'empty bytes' => '',
		'all byte values' => $all_bytes,
		'raw FF' => "\xff",
		'UTF-8 C3 BF' => "\xc3\xbf",
	) as $label => $bytes
) {
	$encoded = HTML_API_Debugger\encode_base64url( $bytes );
	html_api_debugger_transport_assert_same(
		"{$label} round trips",
		$bytes,
		HTML_API_Debugger\decode_base64url( $encoded )
	);
}

html_api_debugger_transport_assert_same( 'raw FF spelling', '_w', HTML_API_Debugger\encode_base64url( "\xff" ) );
html_api_debugger_transport_assert_same( 'UTF-8 C3 BF spelling', 'w78', HTML_API_Debugger\encode_base64url( "\xc3\xbf" ) );

foreach ( array( 'Zg==', '+w', '/w', 'a', 'Zh', '*', "_w\n", '💣' ) as $invalid ) {
	html_api_debugger_transport_assert_rejected( $invalid );
}

$source_object         = new stdClass();
$source_object->utf8   = "\xc3\xbf";
$source_object->number = 7;

$enveloped = HTML_API_Debugger\envelope_response_strings(
	array(
		'ascii' => 'ok',
		'bad' => "\xff",
		'nested' => $source_object,
		'false' => false,
		'null' => null,
	)
);

html_api_debugger_transport_assert_same(
	'recursively envelopes strings and preserves protocol keys and scalars',
	array(
		'ascii' => array( '__bytesBase64url' => 'b2s' ),
		'bad' => array( '__bytesBase64url' => '_w' ),
		'nested' => array(
			'utf8' => array( '__bytesBase64url' => 'w78' ),
			'number' => 7,
		),
		'false' => false,
		'null' => null,
	),
	$enveloped
);

html_api_debugger_transport_assert_same( 'does not mutate source objects', "\xc3\xbf", $source_object->utf8 );

$json = json_encode( $enveloped );
if ( false === $json ) {
	html_api_debugger_transport_fail( 'enveloped malformed UTF-8 must JSON encode' );
}
echo "ok - enveloped malformed UTF-8 JSON encodes\n";

echo "All byte transport regression tests passed.\n";
