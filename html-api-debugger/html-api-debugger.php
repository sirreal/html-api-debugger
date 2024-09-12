<?php
/**
 * Plugin Name:       HTML API Debugger
 * Plugin URI:        https://github.com/sirreal/html-api-debugger
 * Description:       Add a page to wp-admin for debugging the HTML API.
 * Version:           1.6
 * Requires at least: 6.5
 * Tested up to:      6.6
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
const VERSION = '1.6';

/** Set up the plugin. */
function init() {
	static $done = false;
	if ( $done ) {
		return;
	}
	$done = true;

	// WP 6.5 doesn't support script modules or Interactivity API in wp-admin.
	if ( ! has_action( 'admin_print_footer_scripts', array( wp_script_modules(), 'print_import_map' ) ) ) {
		add_action( 'admin_print_footer_scripts', array( wp_script_modules(), 'print_import_map' ) );
		add_action( 'admin_print_footer_scripts', array( wp_script_modules(), 'print_enqueued_script_modules' ) );
		add_action( 'admin_print_footer_scripts', array( wp_script_modules(), 'print_script_module_preloads' ) );
	}
	if ( ! has_action( 'admin_enqueue_scripts', array( wp_interactivity(), 'register_script_modules' ) ) ) {
		add_action( 'admin_enqueue_scripts', array( wp_interactivity(), 'register_script_modules' ) );
		add_action( 'admin_print_footer_scripts', array( wp_interactivity(), 'print_client_interactivity_data' ) );
	}

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
							'quirks_mode' => $request->get_json_params()['quirksMode'] ?? false,
							'full_parser' => $request->get_json_params()['fullParser'] ?? false,
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

	add_action(
		'admin_enqueue_scripts',
		function ( $hook_suffix ) {
			if ( $hook_suffix === 'toplevel_page_' . SLUG ) {
					wp_enqueue_style( SLUG, plugins_url( 'style.css', __FILE__ ), array(), VERSION );

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

					wp_enqueue_script_module(
						'@html-api-debugger/view',
						plugins_url( 'view.js', __FILE__ ),
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

					$html = '';
					// phpcs:disable WordPress.Security.NonceVerification.Recommended
					if ( isset( $_GET['html'] ) && is_string( $_GET['html'] ) ) {
						$html = stripslashes( $_GET['html'] );
					}

					$options = array();
					// @todo Add query args for other options

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
		'normalizedHtml' => HTML_API_Integration\get_normalized_html( $html ),
	);

	try {
		$response['result'] = HTML_API_Integration\get_tree( $html, $options );
	} catch ( Exception $e ) {
		$response['error'] = (string) $e;
	}

	return $response;
}

add_action( 'init', __NAMESPACE__ . '\\init' );
