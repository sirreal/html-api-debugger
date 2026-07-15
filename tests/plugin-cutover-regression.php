<?php
/**
 * Regression tests for the atomic byte-safe plugin cutover.
 *
 * Run with:
 *
 *     php tests/plugin-cutover-regression.php
 *
 * @package HtmlApiDebugger
 */

// phpcs:disable
// This standalone CLI harness intentionally defines WordPress stubs and writes TAP-like output.

class WP_HTML_Processor {
}

$test_hooks                = array();
$test_routes               = array();
$test_modules              = array();
$test_styles               = array();
$test_enqueued_modules     = array();
$test_menu_page_callback   = null;
$test_interactivity_config = array();
$test_interactivity_state  = array();

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
	global $test_hooks;
	$test_hooks[ $hook ][ $priority ][] = array( $callback, $accepted_args );
}

function do_action( $hook, ...$args ) {
	global $test_hooks;
	$priorities = $test_hooks[ $hook ] ?? array();
	ksort( $priorities );
	foreach ( $priorities as $callbacks ) {
		foreach ( $callbacks as $registered ) {
			call_user_func_array( $registered[0], array_slice( $args, 0, $registered[1] ) );
		}
	}
}

function register_rest_route( $namespace, $route, $options ) {
	global $test_routes;
	$test_routes[] = array( $namespace, $route, $options );
}

function current_user_can( $capability ) {
	return 'edit_posts' === $capability;
}

function wp_register_script_module( $id, $src, $dependencies = array(), $version = false ) {
	global $test_modules;
	$test_modules[ $id ] = array(
		'src' => $src,
		'dependencies' => $dependencies,
		'version' => $version,
	);
}

function wp_enqueue_script_module( $id ) {
	global $test_enqueued_modules;
	$test_enqueued_modules[] = $id;
}

function wp_enqueue_style( $id, $src, $dependencies = array(), $version = false ) {
	global $test_styles;
	$test_styles[ $id ] = array(
		'src' => $src,
		'dependencies' => $dependencies,
		'version' => $version,
	);
}

function plugins_url( $path, $file ) {
	return 'https://example.test/wp-content/plugins/html-api-debugger/' . $path;
}

function add_menu_page( $page_title, $menu_title, $capability, $slug, $callback, $icon ) {
	global $test_menu_page_callback;
	$test_menu_page_callback = $callback;
	return 'toplevel_page_' . $slug;
}

function rest_url( $path ) {
	return 'https://example.test/wp-json/' . $path;
}

function wp_create_nonce( $action ) {
	return 'test-nonce-' . $action;
}

function wp_interactivity_config( $namespace, $config ) {
	global $test_interactivity_config;
	$test_interactivity_config[ $namespace ] = $config;
}

function wp_interactivity_state( $namespace, $state ) {
	global $test_interactivity_state;
	$test_interactivity_state[ $namespace ] = $state;
}

function wp_interactivity_process_directives( $html ) {
	return $html;
}

function esc_attr( $value ) {
	return htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
}

function wp_unslash( $value ) {
	if ( is_array( $value ) ) {
		return array_map( 'wp_unslash', $value );
	}
	return stripslashes( $value );
}

function admin_url( $path ) {
	return 'https://example.test/wp-admin/' . $path;
}

function wp_safe_redirect( $location, $status = 302, $application = '' ) {
	echo 'REDIRECT:', $status, ':', $application, ':', $location;
	return true;
}

function wp_die( $message, $title = '', $args = array() ) {
	echo 'DIE:', $args['response'] ?? 500, ':', $title, ':', $message;
	exit;
}

function html_api_debugger_cutover_fail( string $message ): void {
	fwrite( STDERR, "not ok - {$message}\n" );
	exit( 1 );
}

function html_api_debugger_cutover_assert_same( string $label, $expected, $actual ): void {
	if ( $expected !== $actual ) {
		html_api_debugger_cutover_fail(
			$label . "\nExpected: " . var_export( $expected, true ) . "\nActual: " . var_export( $actual, true )
		);
	}
	echo "ok - {$label}\n";
}

$mode = $argv[1] ?? '';
if ( 'redirect' === $mode ) {
	$_GET = array(
		'page' => 'html-api-debugger',
		'html' => addslashes( "\xff" ),
	);
	require dirname( __DIR__ ) . '/html-api-debugger/html-api-debugger.php';
	do_action( 'init' );
	do_action( 'admin_init' );
	html_api_debugger_cutover_fail( 'legacy redirect callback returned' );
}

if ( 'invalid' === $mode ) {
	$_GET = array(
		'page' => 'html-api-debugger',
		'html' => array( 'invalid' ),
	);
	require dirname( __DIR__ ) . '/html-api-debugger/html-api-debugger.php';
	do_action( 'init' );
	do_action( 'admin_init' );
	html_api_debugger_cutover_fail( 'invalid legacy callback returned' );
}

require dirname( __DIR__ ) . '/html-api-debugger/html-api-debugger.php';

html_api_debugger_cutover_assert_same( 'plugin version constant is cache-busted', '3.0', HTML_API_Debugger\VERSION );

do_action( 'init' );

$admin_init_callbacks = $test_hooks['admin_init'][0] ?? array();
html_api_debugger_cutover_assert_same( 'legacy redirect is registered at admin_init priority zero', 1, count( $admin_init_callbacks ) );
html_api_debugger_cutover_assert_same(
	'legacy redirect hook uses the named callback',
	'HTML_API_Debugger\\maybe_redirect_legacy_url',
	$admin_init_callbacks[0][0]
);

do_action( 'rest_api_init' );
html_api_debugger_cutover_assert_same( 'exactly one REST route is registered', 1, count( $test_routes ) );
html_api_debugger_cutover_assert_same( 'only the v2 REST namespace is active', 'html-api-debugger/v2', $test_routes[0][0] );
html_api_debugger_cutover_assert_same( 'v2 REST route is POST-only', 'POST', $test_routes[0][2]['methods'] );
html_api_debugger_cutover_assert_same(
	'v2 REST route uses the byte handler',
	'HTML_API_Debugger\\handle_byte_htmlapi_request',
	$test_routes[0][2]['callback']
);

foreach ( $test_modules as $id => $module ) {
	html_api_debugger_cutover_assert_same( "module {$id} uses version 3.0", '3.0', $module['version'] );
}
html_api_debugger_cutover_assert_same(
	'main module is registered',
	true,
	isset( $test_modules['@html-api-debugger/main'] )
);

do_action( 'admin_enqueue_scripts', 'toplevel_page_html-api-debugger' );
html_api_debugger_cutover_assert_same( 'debugger stylesheet uses version 3.0', '3.0', $test_styles['html-api-debugger']['version'] );
html_api_debugger_cutover_assert_same( 'main module is enqueued on the debugger page', array( '@html-api-debugger/main' ), $test_enqueued_modules );

do_action( 'admin_menu' );
html_api_debugger_cutover_assert_same( 'admin page callback is registered', true, is_callable( $test_menu_page_callback ) );

function html_api_debugger_render_shell( array $query ): array {
	global $test_menu_page_callback, $test_interactivity_config, $test_interactivity_state;
	$_GET = $query;
	$test_interactivity_config = array();
	$test_interactivity_state  = array();
	ob_start();
	call_user_func( $test_menu_page_callback );
	$html = ob_get_clean();
	return array( $html, $test_interactivity_config, $test_interactivity_state );
}

$first_shell = html_api_debugger_render_shell(
	array(
		'page' => 'html-api-debugger',
		'format' => 'v1',
		'html64' => '_w',
		'context64' => '',
	)
);
$second_shell = html_api_debugger_render_shell(
	array(
		'page' => 'html-api-debugger',
		'format' => 'future',
		'html64' => array( 'hostile' ),
		'contextHTML' => "\xff",
	)
);
html_api_debugger_cutover_assert_same( 'application shell is independent of every query value', $first_shell, $second_shell );
html_api_debugger_cutover_assert_same(
	'shell config points only at the v2 byte endpoint',
	'https://example.test/wp-json/html-api-debugger/v2/htmlapi',
	$first_shell[1]['html-api-debugger']['restEndpoint']
);
html_api_debugger_cutover_assert_same(
	'shell contains byte inspection controls',
	true,
	false !== strpos( $first_shell[0], 'Exact REST response envelopes' ) && false !== strpos( $first_shell[0], 'Convert and edit as UTF-8' )
);

$page_reflection = new ReflectionFunction( 'HTML_API_Debugger\\Interactivity\\generate_page' );
html_api_debugger_cutover_assert_same( 'shell generator accepts no input', 0, $page_reflection->getNumberOfParameters() );

$redirect_command = escapeshellarg( PHP_BINARY ) . ' ' . escapeshellarg( __FILE__ ) . ' redirect';
$redirect_output  = array();
$redirect_status  = null;
exec( $redirect_command, $redirect_output, $redirect_status );
$redirect_text = implode( "\n", $redirect_output );
html_api_debugger_cutover_assert_same( 'activated legacy redirect exits successfully', 0, $redirect_status );
html_api_debugger_cutover_assert_same(
	'activated redirect preserves raw FF as canonical _w before rendering',
	true,
	false !== strpos( $redirect_text, 'format=v1&html64=_w&context64=&selector=&opts=' )
);

$invalid_command = escapeshellarg( PHP_BINARY ) . ' ' . escapeshellarg( __FILE__ ) . ' invalid';
$invalid_output  = array();
$invalid_status  = null;
exec( $invalid_command, $invalid_output, $invalid_status );
html_api_debugger_cutover_assert_same( 'invalid legacy URL exits through wp_die', 0, $invalid_status );
html_api_debugger_cutover_assert_same(
	'invalid legacy URL produces a generic visible 400',
	true,
	false !== strpos( implode( "\n", $invalid_output ), 'DIE:400:Invalid HTML API Debugger URL:Invalid legacy HTML API Debugger URL.' )
);

echo "All plugin cutover regression tests passed.\n";
