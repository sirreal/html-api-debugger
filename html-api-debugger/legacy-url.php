<?php
/**
 * Legacy URL migration helpers.
 *
 * @package HtmlApiDebugger
 */

namespace HTML_API_Debugger;

/**
 * Convert a WordPress-slashed legacy query to canonical v1 parameters.
 *
 * Canonical-only fields always suppress legacy interpretation. The caller can
 * then render a visible canonical-format error instead of silently falling
 * back to the old string transport.
 *
 * @param mixed $query WordPress-slashed query parameters.
 * @return array<string, string>|null Canonical transport parameters, or null when no migration applies.
 * @throws \InvalidArgumentException When a recognized legacy value is not a valid string.
 */
function get_legacy_redirect_params( $query ): ?array {
	if ( ! is_array( $query ) ) {
		throw new \InvalidArgumentException( 'Invalid legacy URL.' );
	}

	foreach ( array( 'format', 'html64', 'context64', 'opts' ) as $canonical_only_key ) {
		if ( array_key_exists( $canonical_only_key, $query ) ) {
			return null;
		}
	}

	$legacy_keys = array( 'html', 'contextHTML', 'selector', 'html-opts' );
	$has_legacy  = false;
	foreach ( $legacy_keys as $key ) {
		if ( ! array_key_exists( $key, $query ) ) {
			continue;
		}
		$has_legacy = true;
		if ( ! is_string( $query[ $key ] ) ) {
			throw new \InvalidArgumentException( 'Invalid legacy URL.' );
		}
	}

	if ( ! $has_legacy ) {
		return null;
	}

	$html = array_key_exists( 'html', $query )
		? \wp_unslash( $query['html'] )
		: '';
	$context_html = array_key_exists( 'contextHTML', $query )
		? \wp_unslash( $query['contextHTML'] )
		: '';
	$selector = array_key_exists( 'selector', $query )
		? \wp_unslash( $query['selector'] )
		: '';
	$legacy_opts = array_key_exists( 'html-opts', $query )
		? \wp_unslash( $query['html-opts'] )
		: '';

	if ( 1 !== preg_match( '//u', $selector ) ) {
		throw new \InvalidArgumentException( 'Invalid legacy URL.' );
	}

	return array(
		'format' => 'v1',
		'html64' => encode_base64url( $html ),
		'context64' => encode_base64url( $context_html ),
		'selector' => $selector,
		'opts' => normalize_legacy_url_options( $legacy_opts ),
	);
}

/**
 * Normalize old option flags to the unique canonical order.
 *
 * Legacy parsing applied flags from left to right and let the final case for
 * each option win. Unknown flags were ignored.
 *
 * @param string $legacy_opts Legacy html-opts value.
 * @return string Canonical C/c, I/i, V/v flags.
 */
function normalize_legacy_url_options( string $legacy_opts ): string {
	$states = array(
		'C' => null,
		'I' => null,
		'V' => null,
	);

	for ( $offset = 0; $offset < strlen( $legacy_opts ); ++$offset ) {
		$flag  = $legacy_opts[ $offset ];
		$upper = strtoupper( $flag );
		if ( array_key_exists( $upper, $states ) ) {
			$states[ $upper ] = $flag;
		}
	}

	return implode( '', array_filter( $states, 'is_string' ) );
}

/**
 * Build a redirect URL using the browser's canonical form spelling.
 *
 * @param string                $admin_url Admin endpoint URL.
 * @param string                $page      Safe admin page slug.
 * @param array<string, string> $params    Canonical transport parameters.
 * @return string Canonical redirect URL.
 * @throws \InvalidArgumentException When the target is not canonical and safe.
 */
function build_canonical_admin_url( string $admin_url, string $page, array $params ): string {
	$expected_keys = array( 'format', 'html64', 'context64', 'selector', 'opts' );
	if ( $expected_keys !== array_keys( $params ) ) {
		throw new \InvalidArgumentException( 'Invalid canonical redirect.' );
	}
	foreach ( $params as $value ) {
		if ( ! is_string( $value ) ) {
			throw new \InvalidArgumentException( 'Invalid canonical redirect.' );
		}
	}

	if (
		'v1' !== $params['format'] ||
		1 !== preg_match( '/\A[A-Za-z0-9_-]+\z/D', $page ) ||
		1 !== preg_match( '//u', $params['selector'] ) ||
		1 !== preg_match( '/\A[Cc]?[Ii]?[Vv]?\z/D', $params['opts'] )
	) {
		throw new \InvalidArgumentException( 'Invalid canonical redirect.' );
	}

	try {
		decode_base64url( $params['html64'] );
		decode_base64url( $params['context64'] );
	} catch ( \InvalidArgumentException $e ) {
		throw new \InvalidArgumentException( 'Invalid canonical redirect.' );
	}

	if ( 1 === preg_match( '/[\x00-\x20\x7F]/', $admin_url ) ) {
		throw new \InvalidArgumentException( 'Invalid canonical redirect.' );
	}
	$parts = parse_url( $admin_url );
	if (
		false === $parts ||
		! isset( $parts['scheme'], $parts['host'] ) ||
		! in_array( strtolower( $parts['scheme'] ), array( 'http', 'https' ), true ) ||
		'' === $parts['host'] ||
		isset( $parts['fragment'] )
	) {
		throw new \InvalidArgumentException( 'Invalid canonical redirect.' );
	}

	$reserved_names = array_merge(
		array( 'page', 'format', 'html64', 'context64', 'selector', 'opts' ),
		array( 'html', 'contextHTML', 'html-opts' )
	);
	if ( isset( $parts['query'] ) && '' !== $parts['query'] ) {
		foreach ( explode( '&', $parts['query'] ) as $pair ) {
			$equals   = strpos( $pair, '=' );
			$raw_name = false === $equals ? $pair : substr( $pair, 0, $equals );
			$name     = decode_form_query_name( $raw_name );
			if ( in_array( $name, $reserved_names, true ) ) {
				throw new \InvalidArgumentException( 'Invalid canonical redirect.' );
			}
		}
	}

	$query = array(
		'page=' . $page,
		'format=v1',
		'html64=' . $params['html64'],
		'context64=' . $params['context64'],
		'selector=' . str_replace( '%2A', '*', urlencode( $params['selector'] ) ),
		'opts=' . $params['opts'],
	);

	return $admin_url . ( isset( $parts['query'] ) ? '&' : '?' ) . implode( '&', $query );
}

/**
 * Strictly form-decode a base-query name for collision checks.
 *
 * @param string $raw_name Raw query name.
 * @return string Decoded bytes.
 * @throws \InvalidArgumentException When percent encoding is malformed.
 */
function decode_form_query_name( string $raw_name ): string {
	$decoded = '';
	$length  = strlen( $raw_name );
	for ( $offset = 0; $offset < $length; ++$offset ) {
		$character = $raw_name[ $offset ];
		if ( '+' === $character ) {
			$decoded .= ' ';
			continue;
		}
		if ( '%' !== $character ) {
			$decoded .= $character;
			continue;
		}
		if (
			$offset + 2 >= $length ||
			! ctype_xdigit( $raw_name[ $offset + 1 ] . $raw_name[ $offset + 2 ] )
		) {
			throw new \InvalidArgumentException( 'Invalid canonical redirect.' );
		}
		$decoded .= chr( hexdec( substr( $raw_name, $offset + 1, 2 ) ) );
		$offset  += 2;
	}
	return $decoded;
}
