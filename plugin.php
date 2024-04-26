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

$slug = 'html-api-debugger';

add_action( 'rest_api_init', function () use ($slug) {
  register_rest_route( "$slug/v1", '/htmlapi', array(
    'methods' => 'POST',
	'callback' => function( WP_REST_Request $request ) {
		$html = $request->get_json_params()['html'];

		$processor = WP_HTML_Processor::create_fragment($html);
		if (null === $processor) {
			return array(
				'error'=> 'could not process html'
			);
		}

		$output = "<html>\n  <head>\n  <body>\n";

		// Initially, assume we're 2 levels deep at: html > body > [position]
		$indent_level = 2;
		$indent       = '  ';

		while ( $processor->next_token() ) {
			if ( ! is_null( $processor->get_last_error() ) ) {
				return null;
			}

			switch ( $processor->get_token_type() ) {
				case '#tag':
					$tag_name = strtolower( $processor->get_tag() );

					if ( $processor->is_tag_closer() ) {
						--$indent_level;
						break;
					}

					$tag_indent = count( $processor->get_breadcrumbs() ) - 1;

					if ( ! WP_HTML_Processor::is_void( $tag_name ) ) {
						$indent_level = $tag_indent + 1;
					}

					$output .= str_repeat( $indent, $tag_indent ) . "<{$tag_name}>\n";

					$attribute_names = $processor->get_attribute_names_with_prefix( '' );
					if ( $attribute_names ) {
						sort( $attribute_names, SORT_STRING );

						foreach ( $attribute_names as $attribute_name ) {
							$val = $processor->get_attribute( $attribute_name );
							/*
							 * Attributes with no value are `true` with the HTML API,
							 * We map use the empty string value in the tree structure.
							 */
							if ( true === $val ) {
								$val = '';
							}
							$output .= str_repeat( $indent, $tag_indent + 1 ) . "{$attribute_name}=\"{$val}\"\n";
						}
					}

					break;

				case '#text':
					$output .= str_repeat( $indent, $indent_level ) . "\"{$processor->get_modifiable_text()}\"\n";
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
							throw new Error( "Unhandled comment type for tree construction: {$processor->get_comment_type()}" );
					}
					// Comments must be "<" then "!-- " then the data then " -->".
					$output .= str_repeat( $indent, $indent_level ) . "<!-- {$comment_text_content} -->\n";
					break;

				default:
					$serialized_token_type = var_export( $processor->get_token_type(), true );
					throw new Error( "Unhandled token type for tree construction: {$serialized_token_type}" );
			}
		}

		if ( ! is_null( $processor->get_last_error() ) ) {
			return array(
				'error' => $processor->get_last_error(),
			);
		}

		if ( $processor->paused_at_incomplete_token() ) {
			return array(
				'error' => 'Paused at incomplete token',
			);
		}


		return array(
			'result' => $output,
		);
	},
	'permission_callback' => '__return_true'
  ) );
} );

add_action(
	'admin_enqueue_scripts',
	function( $hook_suffix ) use ($slug) {
		if ( $hook_suffix === "toplevel_page_$slug") {
				wp_enqueue_script( 'wp-api-fetch' );
				wp_enqueue_style( $slug, plugins_url( 'style.css', __FILE__ ),);
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
	function () use ($slug) {
		add_menu_page(
			'HTML API Debugger',
			'HTML API Debugger',
			'unfiltered_html',
			$slug,
			function () use ($slug) {
				wp_interactivity_state( $slug, array(
					'DOM' => array(
						  'renderingMode' => "",
						  'title' => "",
						),
				));
				ob_start();
?>
<table
	data-wp-interactive="<?php echo esc_attr( $slug ); ?>"
	data-wp-watch="watch"
	data-wp-run="run"
	data-wp-init="state.updateData"
>
<tbody>
<tr>
	<td>
		This will include an implicit:
		<pre><?php echo esc_html("<!DOCTYPE html>\n<html>\n<body>"); ?></pre>
		<textarea data-wp-on--input="handleChange"></textarea>
	</td>
	<td>
		<div>
			<code>Title: <span data-wp-text="state.DOM.title"></span></code>
			<br>
			<code>Rendering mode: <span data-wp-text="state.DOM.renderingMode"></span></code>
		</div>
		<iframe id="rendered_iframe" src="about:blank" data-wp-on--load="onRenderedIframeLoad"></iframe>
	</td>
	<td>
		<ul id="dom_tree" data-wp-ignore></ul>
	</td>
	<td>
		<div style="background:red;" data-wp-text="state.htmlapiError"></div>
		<pre style="background:#fff;padding:1em;" data-wp-text="state.htmlapiResult"></pre>
	</td>
<tr>
</tbody>
</table>
<?php
				echo wp_interactivity_process_directives( ob_get_clean() );
			},
			include __DIR__ . "/icon.php"
		);
	}
);
