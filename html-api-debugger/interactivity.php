<?php

namespace HTML_API_Debugger\Interactivity;

function generate_page() {
	$html = '';
	// phpcs:disable WordPress.Security.NonceVerification.Recommended
	if ( isset( $_GET['html'] ) && is_string( $_GET['html'] ) ) {
		$html = stripslashes( $_GET['html'] );
	}
	// phpcs:enable WordPress.Security.NonceVerification.Recommended
	$htmlapi_response = \HTML_API_Debugger\prepare_html_result_object( $html );

	wp_interactivity_state(
		\HTML_API_Debugger\SLUG,
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
	data-wp-interactive="<?php echo esc_attr( \HTML_API_Debugger\SLUG ); ?>"
	data-wp-watch="watch"
	data-wp-run="run"
	data-wp-init="state.updateData"
>
	<tbody>
		<tr>
			<td>
				<h2>Input HTML</h2>
				<textarea id='input_html' data-wp-on--input="handleChange"><?php echo "\n" . esc_textarea( $html ); ?></textarea>
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
	return wp_interactivity_process_directives( ob_get_clean() );
}
