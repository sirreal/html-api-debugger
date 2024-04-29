<?php

/*
 * Plugin Name:       HTML API Debugger
 * Plugin URI:        …
 * Description:       Add an HTML API debug page to wp-admin.
 * Version:           1.0.0
 * Requires at least: 6.5
 * Author:            jonsurrell
 * Author URI:        https://profiles.wordpress.org/jonsurrell/
 * License:           GPL-2.0
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 */

abstract class HTML_API_Debugger {

	const SLUG = 'html-api-debugger';

	const NODE_TYPE_ELEMENT                = 1;
	const NODE_TYPE_ATTRIBUTE              = 2;
	const NODE_TYPE_TEXT                   = 3;
	const NODE_TYPE_CDATA_SECTION          = 4;
	const NODE_TYPE_ENTITY_REFERENCE       = 5;
	const NODE_TYPE_ENTITY                 = 6;
	const NODE_TYPE_PROCESSING_INSTRUCTION = 7;
	const NODE_TYPE_COMMENT                = 8;
	const NODE_TYPE_DOCUMENT               = 9;
	const NODE_TYPE_DOCUMENT_TYPE          = 10;
	const NODE_TYPE_DOCUMENT_FRAGMENT      = 11;
	const NODE_TYPE_NOTATION               = 12;

	/** Init */
	public static function init() {
		add_action(
			'rest_api_init',
			function () {
				register_rest_route(
					self::SLUG . '/v1',
					'/htmlapi',
					array(
						'methods'             => 'POST',
						'callback'            => function ( WP_REST_Request $request ) {
							$html = $request->get_json_params()['html'];
							try {
								$result = self::build_html_tree( $html );
								return array( 'result' => $result );
							} catch ( Exception $e ) {
								return array( 'error' => $e );
							}
						},
						'permission_callback' => '__return_true',
					)
				);
			}
		);

		add_action(
			'admin_enqueue_scripts',
			function ( $hook_suffix ) {
				if ( $hook_suffix === 'toplevel_page_' . self::SLUG ) {
						wp_enqueue_script( 'wp-api-fetch' );
						wp_enqueue_style( self::SLUG, plugins_url( 'style.css', __FILE__ ), );
						wp_enqueue_script_module(
							'@htmlapidebugger/view',
							plugins_url( 'view.js', __FILE__ ),
							array( '@wordpress/interactivity' ),
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
					'unfiltered_html',
					self::SLUG,
					function () {
						wp_interactivity_state(
							self::SLUG,
							array(
								'DOM'           => array(
									'renderingMode' => '',
									'title'         => '',
								),
								'htmlapiResult' => "<html>\n  <head>\n  <body>\n",
								'htmlapiError'  => '',
							)
						);
						ob_start();
						?>
		<table
			id="html-api-debugger-table"
			data-wp-interactive="<?php echo esc_attr( self::SLUG ); ?>"
			data-wp-watch="watch"
			data-wp-run="run"
			data-wp-init="state.updateData"
		>
		<tbody>
		<tr>
			<td>
				<div id="html-input-note"></div>
				<textarea data-wp-on--input="handleChange"></textarea>
			</td>
			<td>
				<div>
					<p>Title: <code data-wp-text="state.DOM.title"></code></p>
					<p>Rendering mode: <code data-wp-text="state.DOM.renderingMode"></code></p>
				</div>
				<iframe id="rendered_iframe" src="about:blank" data-wp-on--load="onRenderedIframeLoad"></iframe>
			</td>
		</tr>
		<tr>
			<td>
				<ul id="dom_tree" data-wp-ignore></ul>
			</td>
			<td>
				<div class="hide-on-empty error-holder" data-wp-text="state.htmlapiError"></div>
				<ul id="html_api_result_holder" class="hide-on-empty" data-wp-ignore></ul>
			</td>
		</tr>
		<tr>
			<td><pre data-wp-text="state.htmlapiResult"></pre></td>
		</tr>
		</tbody>
		</table>
						<?php
						echo wp_interactivity_process_directives( ob_get_clean() );
					},
					include __DIR__ . '/icon.php'
				);
			}
		);
	}

	private static function build_html_tree( string $html ): array {
		$processor = WP_HTML_Processor::create_fragment( $html );
		if ( null === $processor ) {
			return array(
				'error' => 'could not process html',
			);
		}

		$result = array(
			'nodeType'   => self::NODE_TYPE_DOCUMENT,
			'nodeName'   => '#document',
			'childNodes' => array(
				array(
					'nodeType'  => self::NODE_TYPE_DOCUMENT_TYPE,
					'nodeName'  => 'html',
					'nodeValue' => '',
				),
				array(
					'nodeType'   => self::NODE_TYPE_ELEMENT,
					'nodeName'   => 'HTML',
					'attributes' => array(),
					'childNodes' => array(
						array(
							'nodeType'   => self::NODE_TYPE_ELEMENT,
							'nodeName'   => 'HEAD',
							'attributes' => array(),
							'childNodes' => array(),
						),
						array(
							'nodeType'   => self::NODE_TYPE_ELEMENT,
							'nodeName'   => 'BODY',
							'attributes' => array(),
							'childNodes' => array(),
						),
					),
				),
			),
		);

		$cursor = array( 1, 1 );

		while ( $processor->next_token() ) {
			if ( ! is_null( $processor->get_last_error() ) ) {
				return null;
			}

			$current = &$result;
			foreach ( $cursor as $path ) {
				$current = &$current['childNodes'][ $path ];
			}

			// var_dump( $cursor, $current, $result );
			// echo "\n\n";

			switch ( $processor->get_token_type() ) {
				case '#tag':
					if ( $processor->is_tag_closer() ) {
						array_pop( $cursor );
						break;
					}

					$tag_name = $processor->get_tag();

					$attributes      = array();
					$attribute_names = $processor->get_attribute_names_with_prefix( '' );
					foreach ( $attribute_names as $attribute_name ) {
						$val = $processor->get_attribute( $attribute_name );
						/*
						 * Attributes with no value are `true` with the HTML API,
						 * We map use the empty string value in the tree structure.
						 */
						if ( true === $val ) {
							$val = '';
						}
						$attributes[] = array(
							'nodeType'  => self::NODE_TYPE_ATTRIBUTE,
							'specified' => true,
							'nodeName'  => $attribute_name,
							'nodeValue' => $val,
						);
					}

					$self = array(
						'nodeType'   => self::NODE_TYPE_ELEMENT,
						'nodeName'   => $tag_name,
						'attributes' => $attributes,
						'childNodes' => array(),
					);

					$current['childNodes'][] = $self;

					if ( ! WP_HTML_Processor::is_void( $tag_name ) ) {
						$cursor[] = count( $current['childNodes'] ) - 1;
					}

					break;

				case '#text':
					$self = array(
						'nodeType'  => self::NODE_TYPE_TEXT,
						'nodeName'  => $processor->get_token_name(),
						'nodeValue' => $processor->get_modifiable_text(),
					);

					$current['childNodes'][] = $self;
					break;

				case '#comment':
					switch ( $processor->get_comment_type() ) {
						case WP_HTML_Processor::COMMENT_AS_ABRUPTLY_CLOSED_COMMENT:
						case WP_HTML_Processor::COMMENT_AS_HTML_COMMENT:
							$comment_text_content = $processor->get_modifiable_text();
							break;

						case WP_HTML_Processor::COMMENT_AS_CDATA_LOOKALIKE:
							$comment_text_content = "[CDATA[{$processor->get_modifiable_text()}]]";
							break;

						default:
							// phpcs:ignore
							throw new Error( "Unhandled comment type for tree construction: {$processor->get_comment_type()}" );
					}

					$self                    = array(
						'nodeType'    => self::NODE_TYPE_COMMENT,
						'textContent' => $comment_text_content,
					);
					$current['childNodes'][] = $self;
					break;

				default:
					// phpcs:ignore
					$serialized_token_type = var_export( $processor->get_token_type(), true );
					// phpcs:ignore
					throw new Error( "Unhandled token type for tree construction: {$serialized_token_type}" );
			}
		}

		if ( ! is_null( $processor->get_last_error() ) ) {
			throw new Exception( $processor->get_last_error() );
		}

		if ( $processor->paused_at_incomplete_token() ) {
			throw new Exception( 'Paused at incomplete token' );
		}

		return $result;
	}
}

HTML_API_Debugger::init();
