<?php
/**
 * Plugin Name:       HTML API Debugger
 * Plugin URI:        https://github.com/sirreal/html-api-debugger
 * Description:       Add a page to wp-admin for debugging the HTML API.
 * Version:           3.0
 * Requires at least: 6.7
 * Tested up to:      6.8
 * Author:            Jon Surrell
 * Author URI:        https://profiles.wordpress.org/jonsurrell/
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 *
 * @package HtmlApiDebugger
 */

namespace HTML_API_Debugger;

use Exception;

require_once __DIR__ . '/html-api-integration.php';
require_once __DIR__ . '/byte-transport.php';
require_once __DIR__ . '/legacy-url.php';
require_once __DIR__ . '/rest-api.php';

const SLUG    = 'html-api-debugger';
const VERSION = '3.0';

/** Set up the plugin. */
function init() {
	static $done = false;
	if ( $done ) {
		return;
	}
	$done = true;

	add_action(
		'rest_api_init',
		function () {
			register_rest_route(
				SLUG . '/v2',
				'/htmlapi',
				array(
					'methods' => 'POST',
					'callback' => __NAMESPACE__ . '\\handle_byte_htmlapi_request',
					'permission_callback' => function () {
						return current_user_can( 'edit_posts' );
					},
				)
			);

		}
	);

	add_action( 'admin_init', __NAMESPACE__ . '\\maybe_redirect_legacy_url', 0 );

	wp_register_script_module(
		'@html-api-debugger/replace-invisible-chars',
		plugins_url( 'replace-invisible-chars.mjs', __FILE__ ),
		array(),
		VERSION
	);

	wp_register_script_module(
		'@html-api-debugger/print-html-tree',
		plugins_url( 'print-html-tree.mjs', __FILE__ ),
		array(
			array(
				'id' => '@html-api-debugger/replace-invisible-chars',
				'import' => 'dynamic',
			),
		),
		VERSION
	);

	wp_register_script_module(
		'@html-api-debugger/main',
		plugins_url( 'main.mjs', __FILE__ ),
		array(
			'@wordpress/interactivity',
			'@html-api-debugger/print-html-tree',
			array(
				'id' => '@html-api-debugger/replace-invisible-chars',
				'import' => 'dynamic',
			),
		),
		VERSION
	);

	add_action(
		'admin_enqueue_scripts',
		function ( $hook_suffix ) {
			if ( $hook_suffix === 'toplevel_page_' . SLUG ) {
					wp_enqueue_style( SLUG, plugins_url( 'style.css', __FILE__ ), array(), VERSION );
					wp_enqueue_script_module( '@html-api-debugger/main' );
			}
		}
	);

	add_action(
		'admin_menu',
		function () {
			add_menu_page(
				'HTML API Debugger',
				'HTML API Debugger',
				'edit_posts',
				SLUG,
				function () {
					require_once __DIR__ . '/interactivity.php';
					// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
					echo namespace\Interactivity\generate_page();
				},
				include __DIR__ . '/icon.php'
			);
		}
	);
}

/**
 * Redirect legacy string URLs before the application shell is rendered.
 */
function maybe_redirect_legacy_url(): void {
	// phpcs:disable WordPress.Security.NonceVerification.Recommended
	if (
		! isset( $_GET['page'] ) ||
		! is_string( $_GET['page'] ) ||
		SLUG !== wp_unslash( $_GET['page'] )
	) {
		return;
	}

	try {
		$params = get_legacy_redirect_params( $_GET );
		if ( null === $params ) {
			return;
		}
		$target = build_canonical_admin_url( admin_url( 'admin.php' ), SLUG, $params );
	} catch ( \InvalidArgumentException $e ) {
		wp_die(
			'Invalid legacy HTML API Debugger URL.',
			'Invalid HTML API Debugger URL',
			array( 'response' => 400 )
		);
		return;
	}
	// phpcs:enable WordPress.Security.NonceVerification.Recommended

	if ( ! wp_safe_redirect( $target, 302, 'HTML API Debugger' ) ) {
		wp_die(
			'Could not redirect the legacy HTML API Debugger URL.',
			'HTML API Debugger redirect failed',
			array( 'response' => 500 )
		);
		return;
	}
	exit;
}

/**
 * Prepare a result object.
 *
 * @param string $html The HTML.
 * @param array  $options Options.
 */
function prepare_html_result_object( string $html, ?array $options = null ): array {
	$response = array(
		'supports' => HTML_API_Integration\get_supports(),
		'html' => $html,
		'error' => null,
		'result' => null,
		'normalizedHtml' => HTML_API_Integration\get_normalized_html( $html, $options ),
	);

	try {
		$response['result'] = HTML_API_Integration\get_tree( $html, $options );
	} catch ( Exception $e ) {
		$response['error'] = (string) $e;
	}

	return $response;
}

add_action( 'init', __NAMESPACE__ . '\\init' );
