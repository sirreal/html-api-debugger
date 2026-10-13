<?php
/**
 * Regression tests for legacy URL migration.
 *
 * Run with:
 *
 *     php tests/legacy-url-regression.php
 *
 * @package HtmlApiDebugger
 */

// phpcs:disable
// This standalone CLI harness intentionally defines a WordPress stub and writes TAP-like output.

function wp_unslash( $value ) {
	if ( is_array( $value ) ) {
		return array_map( 'wp_unslash', $value );
	}
	return stripslashes( $value );
}

require dirname( __DIR__ ) . '/html-api-debugger/byte-transport.php';
require dirname( __DIR__ ) . '/html-api-debugger/legacy-url.php';

function html_api_debugger_legacy_fail( string $message ): void {
	fwrite( STDERR, "not ok - {$message}\n" );
	exit( 1 );
}

function html_api_debugger_legacy_assert_same( string $label, $expected, $actual ): void {
	if ( $expected !== $actual ) {
		html_api_debugger_legacy_fail(
			$label . "\nExpected: " . var_export( $expected, true ) . "\nActual: " . var_export( $actual, true )
		);
	}
	echo "ok - {$label}\n";
}

function html_api_debugger_legacy_slash( string $value ): string {
	return addslashes( $value );
}

function html_api_debugger_legacy_migrate( array $query ): ?array {
	foreach ( $query as $key => $value ) {
		if ( is_string( $value ) ) {
			$query[ $key ] = html_api_debugger_legacy_slash( $value );
		}
	}
	return HTML_API_Debugger\get_legacy_redirect_params( $query );
}

$raw_ff = html_api_debugger_legacy_migrate( array( 'html' => "\xff" ) );
$utf8_ff = html_api_debugger_legacy_migrate( array( 'html' => "\xc3\xbf" ) );
html_api_debugger_legacy_assert_same( 'raw FF becomes _w', '_w', $raw_ff['html64'] );
html_api_debugger_legacy_assert_same( 'UTF-8 C3 BF becomes w78', 'w78', $utf8_ff['html64'] );

$acceptance_bytes = hex2bin( '3c696672616d653e41ff423c2f696672616d653e' );
if ( false === $acceptance_bytes ) {
	html_api_debugger_legacy_fail( 'could not construct acceptance bytes' );
}
$acceptance = html_api_debugger_legacy_migrate( array( 'html' => $acceptance_bytes ) );
html_api_debugger_legacy_assert_same(
	'acceptance bytes survive legacy migration',
	$acceptance_bytes,
	HTML_API_Debugger\decode_base64url( $acceptance['html64'] )
);

$slashes_and_nul = "a\\b\0c";
$escaped = html_api_debugger_legacy_migrate( array( 'html' => $slashes_and_nul ) );
html_api_debugger_legacy_assert_same(
	'literal backslashes and NUL survive exactly one unslash',
	$slashes_and_nul,
	HTML_API_Debugger\decode_base64url( $escaped['html64'] )
);

$complete = html_api_debugger_legacy_migrate(
	array(
		'html' => '',
		'contextHTML' => " \n",
		'selector' => '.emoji-💣',
		'html-opts' => 'CicVvI?c',
	)
);
html_api_debugger_legacy_assert_same(
	'canonical migration has exactly five ordered fields',
	array( 'format', 'html64', 'context64', 'selector', 'opts' ),
	array_keys( $complete )
);
html_api_debugger_legacy_assert_same( 'empty HTML is preserved', '', $complete['html64'] );
html_api_debugger_legacy_assert_same(
	'context whitespace is preserved',
	" \n",
	HTML_API_Debugger\decode_base64url( $complete['context64'] )
);
html_api_debugger_legacy_assert_same( 'Unicode selector is preserved', '.emoji-💣', $complete['selector'] );
html_api_debugger_legacy_assert_same( 'legacy options use last-wins canonical order', 'cIv', $complete['opts'] );

$selector_only = html_api_debugger_legacy_migrate( array( 'selector' => '.x' ) );
html_api_debugger_legacy_assert_same( 'selector-only URL migrates', '.x', $selector_only['selector'] );
html_api_debugger_legacy_assert_same( 'selector-only URL gets empty byte fields', '', $selector_only['html64'] . $selector_only['context64'] );

$options_only = html_api_debugger_legacy_migrate( array( 'html-opts' => 'vCCi' ) );
html_api_debugger_legacy_assert_same( 'html-opts-only URL migrates', 'Civ', $options_only['opts'] );

html_api_debugger_legacy_assert_same(
	'bare query does not migrate',
	null,
	HTML_API_Debugger\get_legacy_redirect_params( array() )
);

foreach (
	array(
		array( 'format' => 'v2' ),
		array( 'format' => 'v1', 'html' => 'x' ),
		array( 'html64' => 'eA' ),
		array( 'context64' => '', 'contextHTML' => 'x' ),
		array( 'opts' => 'C' ),
		array( 'html' => 'x', 'opts' => 'C' ),
		array( 'selector' => '.x', 'opts' => 'C' ),
		array( 'html-opts' => 'V', 'opts' => 'C' ),
	) as $canonical_or_mixed
) {
	html_api_debugger_legacy_assert_same(
		'canonical or mixed input never falls back',
		null,
		HTML_API_Debugger\get_legacy_redirect_params( $canonical_or_mixed )
	);
}

$invalid_queries = array(
	null,
	array( 'html' => array( 'x' ) ),
	array( 'contextHTML' => array() ),
	array( 'selector' => array( '.x' ) ),
	array( 'html-opts' => false ),
	array( 'selector' => "\xff" ),
);
foreach ( $invalid_queries as $invalid_query ) {
	try {
		HTML_API_Debugger\get_legacy_redirect_params( $invalid_query );
		html_api_debugger_legacy_fail( 'invalid legacy input was accepted' );
	} catch ( InvalidArgumentException $e ) {
		echo "ok - invalid legacy input is rejected\n";
	}
}

$redirect_params = HTML_API_Debugger\get_legacy_redirect_params(
	array(
		'html' => html_api_debugger_legacy_slash( "\xff" ),
		'contextHTML' => html_api_debugger_legacy_slash( "\xc3\xbf" ),
		'selector' => html_api_debugger_legacy_slash( '*~ !()💣' ),
		'html-opts' => html_api_debugger_legacy_slash( 'CiV' ),
	)
);
$redirect_url = HTML_API_Debugger\build_canonical_admin_url(
	'https://example.test/wp-admin/admin.php',
	'html-api-debugger',
	$redirect_params
);
html_api_debugger_legacy_assert_same(
	'canonical redirect spelling matches browser form encoding',
	'https://example.test/wp-admin/admin.php?page=html-api-debugger&format=v1&html64=_w&context64=w78&selector=*%7E+%21%28%29%F0%9F%92%A3&opts=CiV',
	$redirect_url
);

$query = array();
parse_str( (string) parse_url( $redirect_url, PHP_URL_QUERY ), $query );
html_api_debugger_legacy_assert_same( 'redirect query round-trips raw FF', "\xff", HTML_API_Debugger\decode_base64url( $query['html64'] ) );
html_api_debugger_legacy_assert_same( 'redirect query round-trips UTF-8 C3 BF', "\xc3\xbf", HTML_API_Debugger\decode_base64url( $query['context64'] ) );
html_api_debugger_legacy_assert_same( 'redirect query round-trips selector', '*~ !()💣', $query['selector'] );

$redirect_with_base_query = HTML_API_Debugger\build_canonical_admin_url(
	'https://example.test/wp-admin/admin.php?unrelated=a%20b',
	'html-api-debugger',
	$redirect_params
);
html_api_debugger_legacy_assert_same(
	'unrelated base query spelling is preserved',
	true,
	0 === strpos( $redirect_with_base_query, 'https://example.test/wp-admin/admin.php?unrelated=a%20b&page=' )
);

$invalid_redirects = array(
	array( 'https://example.test/wp-admin/admin.php', 'x&format=v2', $redirect_params ),
	array( 'https://example.test/wp-admin/admin.php', 'x y', $redirect_params ),
	array( 'https://example.test/wp-admin/admin.php', 'x%0A', $redirect_params ),
	array( "https://example.test/wp-admin/admin.php\r\n", 'html-api-debugger', $redirect_params ),
	array( 'https://example.test/wp admin/admin.php', 'html-api-debugger', $redirect_params ),
	array( 'ftp://example.test/admin.php', 'html-api-debugger', $redirect_params ),
	array( 'https:///admin.php', 'html-api-debugger', $redirect_params ),
	array( 'https://example.test/admin.php#fragment', 'html-api-debugger', $redirect_params ),
	array( 'https://example.test/admin.php?format=v2', 'html-api-debugger', $redirect_params ),
	array( 'https://example.test/admin.php?html64=bad', 'html-api-debugger', $redirect_params ),
	array( 'https://example.test/admin.php?ht%6Dl64=bad', 'html-api-debugger', $redirect_params ),
	array( 'https://example.test/admin.php?page=other', 'html-api-debugger', $redirect_params ),
	array( 'https://example.test/admin.php?%GG=x', 'html-api-debugger', $redirect_params ),
	array( 'https://example.test/admin.php', 'html-api-debugger', array_merge( $redirect_params, array( 'extra' => '' ) ) ),
	array( 'https://example.test/admin.php', 'html-api-debugger', array_merge( $redirect_params, array( 'format' => 'v2' ) ) ),
	array( 'https://example.test/admin.php', 'html-api-debugger', array_merge( $redirect_params, array( 'html64' => 'Zg==' ) ) ),
	array( 'https://example.test/admin.php', 'html-api-debugger', array_merge( $redirect_params, array( 'selector' => "\xff" ) ) ),
	array( 'https://example.test/admin.php', 'html-api-debugger', array_merge( $redirect_params, array( 'opts' => 'IC' ) ) ),
);
foreach ( $invalid_redirects as $invalid_redirect ) {
	try {
		HTML_API_Debugger\build_canonical_admin_url( $invalid_redirect[0], $invalid_redirect[1], $invalid_redirect[2] );
		html_api_debugger_legacy_fail( 'invalid canonical redirect was accepted' );
	} catch ( InvalidArgumentException $e ) {
		echo "ok - invalid canonical redirect is rejected\n";
	}
}

echo "All legacy URL migration tests passed.\n";
