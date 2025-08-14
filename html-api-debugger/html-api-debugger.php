<?php
/**
 * Plugin Name:       HTML API Debugger
 * Plugin URI:        https://github.com/sirreal/html-api-debugger
 * Description:       Add a page to wp-admin for debugging the HTML API.
 * Version:           2.8
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

use WP_REST_Request;
use Exception;

require_once __DIR__ . '/html-api-integration.php';

const SLUG    = 'html-api-debugger';
const VERSION = '2.8';

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
				SLUG . '/v1',
				'/htmlapi',
				array(
					'methods' => 'POST',
					'callback' => function ( WP_REST_Request $request ) {
						// phpcs:ignore Universal.Operators.DisallowShortTernary.Found
						$html = $request->get_json_params()['html'] ?: '';
						$options = array(
							// phpcs:ignore Universal.Operators.DisallowShortTernary.Found
							'context_html' => $request->get_json_params()['contextHTML'] ?: null,
							// phpcs:ignore Universal.Operators.DisallowShortTernary.Found
							'selector' => $request->get_json_params()['selector'] ?: null,
						);
						return prepare_html_result_object( $html, $options );
					},
					'permission_callback' => function () {
						return current_user_can( 'edit_posts' );
					},
				)
			);
		}
	);

	wp_register_script_module(
		'@html-api-debugger/replace-invisible-chars',
		plugins_url( 'replace-invisible-chars.js', __FILE__ ),
		array(),
		VERSION
	);

	wp_register_script_module(
		'@html-api-debugger/print-html-tree',
		plugins_url( 'print-html-tree.js', __FILE__ ),
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
		plugins_url( 'main.js', __FILE__ ),
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

					$options = array(
						'context_html' => null,
						'selector' => null,
					);

					$html = '';
					// phpcs:disable WordPress.Security.NonceVerification.Recommended
					if ( isset( $_GET['html'] ) && is_string( $_GET['html'] ) ) {
						$html = stripslashes( $_GET['html'] );
					}
					if ( isset( $_GET['contextHTML'] ) && is_string( $_GET['contextHTML'] ) ) {
						$options['context_html'] = stripslashes( $_GET['contextHTML'] );
					}
					if ( isset( $_GET['selector'] ) && is_string( $_GET['selector'] ) ) {
						$options['selector'] = stripslashes( $_GET['selector'] );
					}
					// phpcs:enable WordPress.Security.NonceVerification.Recommended

					// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
					echo namespace\Interactivity\generate_page( $html, $options );
				},
				include __DIR__ . '/icon.php'
			);
		}
	);
}

/**
 * Prepare a result object.
 *
 * @param string $html The HTML.
 * @param array  $options Options.
 */
function prepare_html_result_object( string $html, array $options = null ): array {
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
