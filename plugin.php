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

		// return some HTML API representation

		return array(
			'result' => $html,
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
				wp_interactivity_state( $slug, array('src'=>'https://software.hixie.ch/utilities/js/live-dom-viewer/'));
				ob_start();
?>
<table data-wp-interactive="<?php echo esc_attr( $slug ); ?>" data-wp-watch="watch">
<tbody>
<tr>
	<td>
		<textarea data-wp-on--input="handleChange"></textarea>
	</td>
	<td>
		<iframe data-wp-bind--src="state.src"></iframe>
	</td>
	<td>
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
