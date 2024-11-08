<?php
namespace HTML_API_Debugger\Interactivity;

/**
 * Make an "on" directive
 *
 * Depending on supported behavior, this can be sync or async.
 *
 * @param string $on The event name.
 * @param string $directive The directive name.
 */
function wp_on_directive( string $on, string $directive ): void {
	static $supports_async_on = null;
	if ( null === $supports_async_on ) {
		$supports_async_on = version_compare( get_bloginfo( 'version' ), '6.6', '>=' );
	}

	echo $supports_async_on ?
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		"data-wp-on-async--{$on}=\"{$directive}\"" :
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		"data-wp-on--{$on}=\"{$directive}\"";
}

/**
 * Generate the WP Admin page HTML.
 *
 * @param string $html The input html.
 * @param array  $options The input html.
 * @return The page HTML as rendered by the Interactivity API. This is intended to be printed directly to the page with no additional escaping.
 */
function generate_page( string $html, array $options ): string {
	// phpcs:enable WordPress.Security.NonceVerification.Recommended
	$htmlapi_response = \HTML_API_Debugger\prepare_html_result_object( $html, $options );

	wp_interactivity_config(
		\HTML_API_Debugger\SLUG,
		array(
			'restEndpoint' => rest_url( 'html-api-debugger/v1/htmlapi' ),
			'nonce' => wp_create_nonce( 'wp_rest' ),
		)
	);
	wp_interactivity_state(
		\HTML_API_Debugger\SLUG,
		array(
			'DOM' => array(
				'renderingMode' => '',
				'doctypeName' => '',
				'doctypeSystemId' => '',
				'doctypePublicId' => '',
			),
			'hasMutatedDom' => false,
			'html' => $html,
			'htmlapiResponse' => $htmlapi_response,

			'showClosers' => false,
			'showInvisible' => false,
			'showVirtual' => false,
			'contextHTML' => $options['context_html'] ?? '',

			'hoverInfo' => 'breadcrumbs',
			'hoverBreadcrumbs' => true,
			'hoverInsertion' => false,
			'checkingForPRPlaygroundLink' => false,

			'htmlApiDoctypeName' => $htmlapi_response['result']['doctypeName'] ?? '[unknown]',
			'htmlApiDoctypePublicId' => $htmlapi_response['result']['doctypePublicId'] ?? '[unknown]',
			'htmlApiDoctypeSytemId' => $htmlapi_response['result']['doctypeSystemId'] ?? '[unknown]',
			'normalizedHtml' => $htmlapi_response['normalizedHtml'] ?? '',
		)
	);
	ob_start();
	?>
<div
	data-wp-interactive="<?php echo esc_attr( \HTML_API_Debugger\SLUG ); ?>"
	data-wp-watch--main="watch"
	data-wp-watch--url="watchURL"
	data-wp-run="run"
	class="html-api-debugger-container html-api-debugger--grid"
>
	<div>
		<h2>Input HTML</h2>
		<textarea
			id='input_html'
			autocapitalize="off"
			autocomplete="off"
			spellcheck="false"
			wrap="off"
			<?php wp_on_directive( 'input', 'handleInput' ); ?>
		><?php echo "\n" . esc_textarea( str_replace( "\0", '', $html ) ); ?></textarea>
	</div>
	<div>
		<h2>Rendered output</h2>
		<iframe
			<?php wp_on_directive( 'load', 'onRenderedIframeLoad' ); ?>
			src="about:blank"
			id="rendered_iframe"
			referrerpolicy="no-referrer"
			sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"></iframe>
	</div>
	<details class="full-width">
		<summary>HTML API Normalized HTML</summary>
		<pre class="html-text" data-wp-text="state.normalizedHtml"></pre>
	</details>
	<details class="full-width">
		<summary>Document info</summary>

		<div class="html-api-debugger--grid">
			<div>
				Rendering mode:&nbsp;<code data-wp-text="state.htmlapiResponse.result.compatMode"></code><br>
				Doctype name:&nbsp;<code data-wp-text="state.htmlApiDoctypeName"></code><br>
				Doctype publicId:&nbsp;<code data-wp-text="state.htmlApiDoctypePublicId"></code><br>
				Doctype systemId:&nbsp;<code data-wp-text="state.htmlApiDoctypeSystemId"></code><br>
				Context node:&nbsp;<code data-wp-text="state.htmlapiResponse.result.contextNode"></code>
			</div>
			<div>
				Rendering mode:&nbsp;<code data-wp-text="state.DOM.renderingMode"></code><br>
				Doctype name:&nbsp;<code data-wp-text="state.DOM.doctypeName"></code><br>
				Doctype publicId:&nbsp;<code data-wp-text="state.DOM.doctypePublicId"></code><br>
				Doctype systemId:&nbsp;<code data-wp-text="state.DOM.doctypeSystemId"></code><br>
				Context node:&nbsp;<code data-wp-text="state.DOM.contextNode"></code>
			</div>
		</div>
	</details>
	<div class="full-width html-api-debugger--grid">
		<div>
			<h2>Interpreted by HTML API</h2>
			<div
				<?php
					wp_on_directive( 'mouseover', 'handleSpanOver' );
					wp_on_directive( 'mouseleave', 'clearSpan' );
				?>
			>
				<pre class="error-holder" data-wp-bind--hidden="!state.htmlapiResponse.error" data-wp-text="state.htmlapiResponse.error"></pre>
				<div data-wp-bind--hidden="state.htmlapiResponse.error">
					<ul id="html_api_result_holder" data-wp-ignore></ul>
				</div>
			</div>
		</div>
		<div>
			<h2>Interpreted from DOM</h2>
			<div data-wp-class--mutated="state.hasMutatedDom"><ul id="dom_tree" data-wp-ignore></ul></div>
		</div>
	</div>

	<div class="full-width">
		<div>
			<div>
				<label>Show closers <input type="checkbox" data-wp-bind--checked="state.showClosers" <?php wp_on_directive( 'input', 'handleShowClosersClick' ); ?>></label>
				<label>Show invisible <input type="checkbox" data-wp-bind--checked="state.showInvisible" <?php wp_on_directive( 'input', 'handleShowInvisibleClick' ); ?>></label>
				<span><label>Show virtual <input type="checkbox" data-wp-bind--checked="state.showVirtual" <?php wp_on_directive( 'input', 'handleShowVirtualClick' ); ?>></label></span>
				<div data-wp-bind--hidden="!state.htmlapiResponse.supports.create_fragment_advanced">
					<label>Context html
						<textarea
							class="context-html"
							placeholder="Provide a fragment context, for example:&#x0A;<!DOCTYPE html><body>"
							rows="2"
							<?php wp_on_directive( 'input', 'handleContextHtmlInput' ); ?>
						><?php echo "\n" . esc_textarea( str_replace( "\0", '', $options['context_html'] ?? '' ) ); ?></textarea>
				</label>
				</div>
			</div>
			<div>
				<label>
					Hover information
					<select <?php wp_on_directive( 'change', 'hoverInfoChange' ); ?>>
						<option data-wp-bind--selected="state.hoverBreadcrumbs" value="breadcrumbs">(depth) Breadcrumbs…</option>
						<option data-wp-bind--selected="state.hoverInsertion" value="insertionMode">Insertion mode</option>
					</select>
				</label>
			</div>
		</div>

		<div>
			<h2>Processed HTML</h2>
			<div data-wp-bind--hidden="!state.htmlapiResponse.result.playback">
				<label>
					Move the slider to replay token processing:
					<input
						type="range"
						min="2"
						style="width:100%"
						data-wp-bind--max="state.htmlapiResponse.result.playback.length"
						data-wp-bind--value="state.htmlapiResponse.result.playback.length"
						data-wp-on--input="handlePlaybackChange"
					>
				</label>
			</div>
			<pre class="html-text" id="processed-html" data-wp-ignore><?php echo esc_html( $html ); ?></pre>
		</div>

		<p>
			<label>
				<select id="htmlapi-wp-version">
					<option value="latest">latest</option>
					<option value="nightly">nightly</option>
					<option value="beta">beta</option>
					<option value="6.7">6.7</option>
				</select>
			</label>
			<button <?php wp_on_directive( 'click', 'handleCopyClick' ); ?> type="button">Copy shareable playground link</button><br>
		</p>
		<p>
			<label>
				<code>WordPress/develop</code> PR number:
				<input type="number" min="1" <?php wp_on_directive( 'input', 'handleCopyCorePrInput' ); ?>>
			</label>
			<label>
				<code>WordPress/gutenberg</code> PR number:
				<input type="number" min="1" <?php wp_on_directive( 'input', 'handleCopyGutenbergPrInput' ); ?>>
			</label>
			<button <?php wp_on_directive( 'click', 'handleCopyPrClick' ); ?>>Copy shareable playground link to PR</button>
			<span data-wp-bind--hidden="!state.previewCoreLink">
				<a
					data-wp-bind--href="state.previewCoreLink.href"
					data-wp-text="state.previewCoreLink.text"
					rel="noopener noreferrer"
				></a>
			</span>
			<span data-wp-bind--hidden="!state.previewGutenbergLink">
				<a
					data-wp-bind--href="state.previewGutenbergLink.href"
					data-wp-text="state.previewGutenbergLink.text"
					rel="noopener noreferrer"
				></a>
			</span>
		</p>
		<div>
			<details>
				<summary>debug response</summary>
				<pre data-wp-text="state.formattedHtmlapiResponse"></pre>
			</details>
		</div>
	</div>
</div>
	<?php
	return wp_interactivity_process_directives( ob_get_clean() );
}
