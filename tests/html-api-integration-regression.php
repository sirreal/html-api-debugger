<?php
/**
 * Regression tests for the HTML API integration tree builder.
 *
 * Run with:
 *
 *     WP_CORE_DIR=/path/to/wordpress/src php tests/html-api-integration-regression.php
 *
 * @package HtmlApiDebugger
 */

// phpcs:disable
// This standalone CLI harness intentionally defines minimal WordPress stubs and writes TAP-like output.
error_reporting( E_ALL & ~E_DEPRECATED );

if ( ! function_exists( '__' ) ) {
	function __( $text, $domain = 'default' ) {
		return $text;
	}
}

if ( ! function_exists( '_doing_it_wrong' ) ) {
	function _doing_it_wrong( $function_name, $message, $version ) {
	}
}

if ( ! function_exists( 'wp_trigger_error' ) ) {
	function wp_trigger_error( $function_name, $message, $error_level = E_USER_NOTICE ) {
	}
}

if ( ! function_exists( 'add_filter' ) ) {
	function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
		return true;
	}
}

if ( ! function_exists( 'remove_filter' ) ) {
	function remove_filter( $hook_name, $callback, $priority = 10 ) {
		return true;
	}
}

if ( ! function_exists( 'apply_filters' ) ) {
	function apply_filters( $hook_name, $value, ...$args ) {
		return $value;
	}
}

if ( ! function_exists( 'do_action' ) ) {
	function do_action( $hook_name, ...$args ) {
	}
}

$core_dir = getenv( 'WP_CORE_DIR' );
if ( ! $core_dir ) {
	fwrite( STDERR, "Set WP_CORE_DIR to a WordPress src checkout.\n" );
	exit( 2 );
}

$core_dir    = rtrim( $core_dir, '/' );
$include_dir = "{$core_dir}/wp-includes";

if ( ! file_exists( "{$include_dir}/html-api/class-wp-html-processor.php" ) ) {
	fwrite( STDERR, "WP_CORE_DIR must point to a WordPress src checkout containing wp-includes/html-api.\n" );
	exit( 2 );
}

if ( ! class_exists( 'WP_HTML_Processor' ) ) {
	$required_files = array(
		"{$include_dir}/class-wp-token-map.php",
		"{$include_dir}/html-api/class-wp-html-text-replacement.php",
		"{$include_dir}/html-api/class-wp-html-span.php",
		"{$include_dir}/html-api/class-wp-html-attribute-token.php",
		"{$include_dir}/html-api/class-wp-html-doctype-info.php",
		"{$include_dir}/html-api/class-wp-html-unsupported-exception.php",
		"{$include_dir}/html-api/class-wp-html-decoder.php",
		"{$include_dir}/html-api/class-wp-html-tag-processor.php",
		"{$include_dir}/html-api/class-wp-html-token.php",
		"{$include_dir}/html-api/class-wp-html-stack-event.php",
		"{$include_dir}/html-api/class-wp-html-open-elements.php",
		"{$include_dir}/html-api/class-wp-html-active-formatting-elements.php",
		"{$include_dir}/html-api/class-wp-html-processor-state.php",
		"{$include_dir}/html-api/class-wp-html-processor.php",
	);

	// Verify every dependency exists before requiring any of them so a moved or
	// renamed file produces a clear message instead of a fatal mid-bootstrap.
	$missing_files = array();
	foreach ( $required_files as $file ) {
		if ( ! file_exists( $file ) ) {
			$missing_files[] = $file;
		}
	}

	if ( $missing_files ) {
		fwrite( STDERR, "Cannot bootstrap the HTML API from WP_CORE_DIR; the following required files are missing:\n" );
		fwrite( STDERR, '  - ' . implode( "\n  - ", $missing_files ) . "\n" );
		fwrite( STDERR, "This WordPress version may be incompatible with the regression harness.\n" );
		exit( 2 );
	}

	foreach ( $required_files as $file ) {
		require $file;
	}
}

// Bail clearly if the HTML API still is not available after bootstrap.
if ( ! class_exists( 'WP_HTML_Processor' ) ) {
	fwrite( STDERR, "Bootstrap completed but WP_HTML_Processor is undefined; the HTML API may have changed in this WordPress version.\n" );
	exit( 2 );
}

$integration_file = dirname( __DIR__ ) . '/html-api-debugger/html-api-integration.php';
if ( ! file_exists( $integration_file ) ) {
	fwrite( STDERR, "Missing plugin integration file: {$integration_file}\n" );
	exit( 2 );
}
require $integration_file;

if ( ! function_exists( 'HTML_API_Debugger\HTML_API_Integration\get_tree' ) ) {
	fwrite( STDERR, "Plugin integration loaded but HTML_API_Debugger\\HTML_API_Integration\\get_tree() is undefined.\n" );
	exit( 2 );
}

/**
 * Convert a debugger tree into stable text lines.
 *
 * @param array $node  Tree node.
 * @param int   $depth Current output depth.
 * @return string[] Tree lines.
 */
function html_api_debugger_test_tree_lines( array $node, int $depth = 0 ): array {
	$lines = array();

	foreach ( $node['childNodes'] ?? array() as $child ) {
		if ( ! empty( $child['_closer'] ) ) {
			continue;
		}

		$line = str_repeat( '  ', $depth ) . $child['nodeName'];
		if ( isset( $child['nodeValue'] ) ) {
			$value = str_replace( array( "\r", "\n" ), array( '\\r', '\\n' ), $child['nodeValue'] );
			$line .= ':' . $value;
		}

		$lines[] = $line;
		array_push( $lines, ...html_api_debugger_test_tree_lines( $child, $depth + 1 ) );
	}

	return $lines;
}

/**
 * Assert a single debugger tree shape.
 *
 * @param string      $label        Test label.
 * @param string      $html         Input HTML.
 * @param string|null $context_html Optional fragment context.
 * @param string[]    $expected     Expected tree lines.
 */
function html_api_debugger_assert_tree( string $label, string $html, ?string $context_html, array $expected ): void {
	$result = HTML_API_Debugger\HTML_API_Integration\get_tree(
		$html,
		array(
			'context_html' => $context_html,
			'selector' => null,
		)
	);

	$actual = html_api_debugger_test_tree_lines( $result['tree'] );
	if ( $actual === $expected ) {
		echo "ok - {$label}\n";
		return;
	}

	echo "not ok - {$label}\n";
	echo "Expected:\n";
	echo implode( "\n", $expected ), "\n";
	echo "Actual:\n";
	echo implode( "\n", $actual ), "\n";
	exit( 1 );
}

$body_context = '<!DOCTYPE html><body>';

html_api_debugger_assert_tree(
	'full parser preserves document nesting',
	'<div><p>a</p>b</div>c',
	null,
	array(
		'HTML',
		'  HEAD',
		'  BODY',
		'    DIV',
		'      P',
		'        #text:a',
		'      #text:b',
		'    #text:c',
	)
);

html_api_debugger_assert_tree(
	'body fragment keeps atomic element siblings at root',
	'<textarea>x</textarea><after>',
	$body_context,
	array(
		'TEXTAREA',
		'  #text:x',
		'AFTER',
	)
);

html_api_debugger_assert_tree(
	'body fragment keeps adjacent atomic elements as siblings',
	'<textarea>X</textarea><textarea>Y</textarea>z',
	$body_context,
	array(
		'TEXTAREA',
		'  #text:X',
		'TEXTAREA',
		'  #text:Y',
		'#text:z',
	)
);

html_api_debugger_assert_tree(
	'body fragment handles implied paragraph closer',
	'<p>one<div>two</div>',
	$body_context,
	array(
		'P',
		'  #text:one',
		'DIV',
		'  #text:two',
	)
);

html_api_debugger_assert_tree(
	'list fragment handles implied list item closer',
	'<ul><li>one<li>two</ul>',
	$body_context,
	array(
		'UL',
		'  LI',
		'    #text:one',
		'  LI',
		'    #text:two',
	)
);

html_api_debugger_assert_tree(
	'div context strips fragment context prefix',
	'<p>a</p>b',
	'<!DOCTYPE html><body><main><div>',
	array(
		'P',
		'  #text:a',
		'#text:b',
	)
);

html_api_debugger_assert_tree(
	'table context preserves implied table descendants',
	'<tr><td>a</td></tr>',
	'<!DOCTYPE html><body><table>',
	array(
		'TBODY',
		'  TR',
		'    TD',
		'      #text:a',
	)
);

html_api_debugger_assert_tree(
	'table row context handles implied table cell closer',
	'<td>one<td>two',
	'<!DOCTYPE html><body><table><tbody><tr>',
	array(
		'TD',
		'  #text:one',
		'TD',
		'  #text:two',
	)
);

html_api_debugger_assert_tree(
	'select context handles implied option closer',
	'<option>one<option>two',
	'<!DOCTYPE html><body><select>',
	array(
		'OPTION',
		'  #text:one',
		'OPTION',
		'  #text:two',
	)
);

html_api_debugger_assert_tree(
	'template context uses template insertion mode without leaking context node',
	'<p>a</p>',
	'<!DOCTYPE html><body><template>',
	array(
		'P',
		'  #text:a',
	)
);

echo "All HTML API integration regression tests passed.\n";
