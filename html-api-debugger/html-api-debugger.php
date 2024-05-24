<?php
/**
 * Plugin Name:       HTML API Debugger
 * Plugin URI:        https://github.com/sirreal/html-api-debugger
 * Description:       Add a page to wp-admin for debugging the HTML API.
 * Version:           0.1
 * Requires at least: 6.5
 * Tested up to:      6.5
 * Author:            Jon Surrell
 * Author URI:        https://profiles.wordpress.org/jonsurrell/
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 *
 * @package HtmlApiDebugger
 */

/**
 * The plugin class.
 */
abstract class HTML_API_Debugger {

	const SLUG    = 'html-api-debugger';
	const VERSION = '0.1';

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
					self::SLUG . '/v1',
					'/htmlapi',
					array(
						'methods'             => 'POST',
						'callback'            => function ( WP_REST_Request $request ) {
							$html = $request->get_json_params()['html'] ?: '';
							return self::prepare_html_result_object( $html );
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
				if ( $hook_suffix === 'toplevel_page_' . self::SLUG ) {
						wp_enqueue_script( 'wp-api-fetch' );
						wp_enqueue_style( self::SLUG, plugins_url( 'style.css', __FILE__ ), array(), self::VERSION );
						wp_enqueue_script_module(
							'@htmlapidebugger/view',
							plugins_url( 'view.js', __FILE__ ),
							array( '@wordpress/interactivity' ),
							self::VERSION
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
					self::SLUG,
					function () {
						$html = '';
						// phpcs:disable WordPress.Security.NonceVerification.Recommended
						if ( isset( $_GET['html'] ) && is_string( $_GET['html'] ) ) {
							$html = stripslashes( $_GET['html'] );
						}
						// phpcs:enable WordPress.Security.NonceVerification.Recommended
						$htmlapi_response = self::prepare_html_result_object( $html );

						wp_interactivity_state(
							self::SLUG,
							array(
								'DOM'             => array(
									'renderingMode' => '',
									'title'         => '',
								),
								'html'            => $html,
								'htmlapiResponse' => $htmlapi_response,
								'span'            => null,
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
				<h2>Input HTML</h2>
				<textarea id='input_html' data-wp-on--input="handleChange"><?php echo "\n" . esc_html( $html ); ?></textarea>
				<p>
					Note: Because HTML API operates in body at this time, this will be prepended:
					<br>
					<code><?php echo esc_html( '<!DOCTYPE html><html><body>' ); ?></code>
				</p>
			</td>
			<td>
				<h2>Rendered output</h2>
				<iframe id="rendered_iframe" src="about:blank" data-wp-on--load="onRenderedIframeLoad"></iframe>
				<p>Title:&nbsp;<code data-wp-text="state.DOM.title"></code> Rendering mode:&nbsp;<code data-wp-text="state.DOM.renderingMode"></code></p>
			</td>
		</tr>
		<tr>
			<td>
				<h2>Interpreted from DOM</h2>
				<ul id="dom_tree" data-wp-ignore></ul>
			</td>
			<td data-wp-on--click="handleSpanClick">
				<h2>Interpreted by HTML API</h2>
				<pre  class="hide-on-empty error-holder" data-wp-text="state.htmlapiResponse.error"></pre>
				<ul id="html_api_result_holder" class="hide-on-empty" data-wp-ignore></ul>
				<p>Click a node above to see its span details below.</p>
			</td>
		</tr>
		<tr data-wp-bind--hidden="state.span">
			<td colspan="2">
				<h2>Processed HTML</h2>
				<pre class="html-text" data-wp-text="state.hoverSpan"></pre>
			</td>
		</tr>
		<tr data-wp-bind--hidden="!state.span">
			<td colspan="2">
				<h2>Processed HTML selected span</h2>
				<button data-wp-on--click="clearSpan" type="button">Clear span selection 🧹</button>
				<div class="htmlSpanContainer">
					<pre class="html-text html-span" data-wp-text="state.hoverSpanSplit.0"></pre>
					<pre class="html-text html-span html selected span" data-wp-text="state.hoverSpanSplit.1"></pre>
					<pre class="html-text html-span" data-wp-text="state.hoverSpanSplit.2"></pre>
				</div>
			</td>
		</tr>
		<tr>
			<td>
				<details>
					<summary>debug response</summary>
					<pre data-wp-text="state.formattedHtmlapiResponse"></pre>
				</details>
			</td>
		</tr>
	</tbody>
</table>
						<?php
						// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
						echo wp_interactivity_process_directives( ob_get_clean() );
					},
					include __DIR__ . '/icon.php'
				);
			}
		);
	}

	/**
	 * Build the HTML API tree.
	 *
	 * @param string $html The HTML.
	 */
	private static function build_html_tree( string $html ): array {
		$processor = WP_HTML_Processor::create_fragment( $html );

		$processor_parser_state = new ReflectionProperty( 'WP_HTML_Processor', 'parser_state' );
		$processor_parser_state->setAccessible( true );

		$processor_state = new ReflectionProperty( 'WP_HTML_Processor', 'state' );
		$processor_state->setAccessible( true );

		$processor_bookmarks = new ReflectionProperty( 'WP_HTML_Processor', 'bookmarks' );
		$processor_bookmarks->setAccessible( true );

		if ( null === $processor ) {
			throw new Exception( 'could not process html' );
		}

		$tree = array(
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
				break;
			}

			if ( ( count( $cursor ) + 1 ) > count( $processor->get_breadcrumbs() ) ) {
				array_pop( $cursor );
			}
			$current = &$tree;
			foreach ( $cursor as $path ) {
				$current = &$current['childNodes'][ $path ];
			}

			switch ( $processor->get_token_type() ) {
				case '#tag':
					if ( $processor->is_tag_closer() ) {
						break;
					}

					$tag_name = $processor->get_tag();

					$attributes      = array();
					$attribute_names = $processor->get_attribute_names_with_prefix( '' );
					if ( null !== $attribute_names ) {
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
					}

					$self = array(
						'nodeType'   => self::NODE_TYPE_ELEMENT,
						'nodeName'   => $tag_name,
						'attributes' => $attributes,
						'childNodes' => array(),
						'_span'      => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
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
						'_span'     => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					);

					$current['childNodes'][] = $self;
					break;

				case '#presumptuous-tag':
					$self                    = array(
						'nodeType'  => self::NODE_TYPE_COMMENT,
						'nodeName'  => $processor->get_token_name(),
						'nodeValue' => $processor->get_modifiable_text(),
						'_span'     => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					);
					$current['childNodes'][] = $self;
					break;

				case '#funky-comment':
					$self                    = array(
						'nodeType'  => self::NODE_TYPE_COMMENT,
						'nodeName'  => $processor->get_token_name(),
						'nodeValue' => $processor->get_modifiable_text(),
						'_span'     => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					);
					$current['childNodes'][] = $self;
					break;

				case '#comment':
					$self = array(
						'nodeType' => self::NODE_TYPE_COMMENT,
						'_span'    => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					);
					switch ( $processor->get_comment_type() ) {
						case WP_HTML_Processor::COMMENT_AS_ABRUPTLY_CLOSED_COMMENT:
						case WP_HTML_Processor::COMMENT_AS_HTML_COMMENT:
							$self['nodeName']  = $processor->get_token_name();
							$self['nodeValue'] = $processor->get_modifiable_text();
							break;

						case WP_HTML_Processor::COMMENT_AS_PI_NODE_LOOKALIKE:
							$self['nodeName']   = "{$processor->get_token_name()}({$processor->get_comment_type()})";
							$self['childNodes'] = array(
								array(
									'nodeType'  => self::NODE_TYPE_PROCESSING_INSTRUCTION,
									'nodeName'  => $processor->get_tag(),
									'nodeValue' => $processor->get_modifiable_text(),
								),
							);
							break;

						case WP_HTML_Processor::COMMENT_AS_CDATA_LOOKALIKE:
							$self['nodeName']  = "{$processor->get_token_name()}({$processor->get_comment_type()})";
							$self['nodeValue'] = $processor->get_modifiable_text();
							break;

						default:
							// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
							throw new Exception( "Unhandled comment type for tree construction: {$processor->get_comment_type()}" );
					}

					$current['childNodes'][] = $self;
					break;

				default:
					$serialized_token_type = var_export( $processor->get_token_type(), true );
					// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
					throw new Exception( "Unhandled token type for tree construction: {$serialized_token_type}" );
			}
		}

		if ( ! is_null( $processor->get_last_error() ) ) {
			// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
			throw new Exception( $processor->get_last_error() );
		}

		if ( $processor->paused_at_incomplete_token() ) {
			throw new Exception( 'Paused at incomplete token' );
		}

		return array(
			'tree'            => $tree,
			'last_error'      => $processor->get_last_error(),
			'parser_state'    => $processor_parser_state->getValue( $processor ),
			'processor_state' => $processor_state->getValue( $processor ),
			'last_error'      => $processor->get_last_error(),
		);
	}

	/**
	 * Prepare a result object.
	 *
	 * @param string $html The HTML.
	 */
	private static function prepare_html_result_object( string $html ): array {
		try {
			$result = self::build_html_tree( $html );

			return array(
				'result' => array_merge(
					$result,
					array(
						'html' => $html,
					)
				),
			);
		} catch ( Exception $e ) {
			return array( 'error' => (string) $e );
		}
	}
}

add_action( 'init', array( 'HTML_API_Debugger', 'init' ) );
