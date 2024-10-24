<?php
namespace HTML_API_Debugger\HTML_API_Integration;

use Exception;
use ReflectionClass;
use ReflectionMethod;
use ReflectionProperty;
use WP_HTML_Processor;
use WP_HTML_Processor_State;

/**
 * Get information about HTML API supported features
 */
function get_supports(): array {
	$html_processor_rc       = new ReflectionClass( WP_HTML_Processor::class );
	$html_processor_state_rc = new ReflectionClass( WP_HTML_Processor_State::class );

	return array(
		'is_virtual' => $html_processor_rc->hasMethod( 'is_virtual' ),
		'full_parser' => method_exists( WP_HTML_Processor::class, 'create_full_parser' ),
		'quirks_mode' => $html_processor_rc->hasProperty( 'compat_mode' ),
		'doctype' => method_exists( WP_HTML_Processor::class, 'get_doctype_info' ),
		'normalize' => method_exists( WP_HTML_Processor::class, 'normalize' ),
	);
}


/**
 * Get the normalized HTML.
 *
 * @param string $html The HTML.
 * @return string|null The normalized HTML or null if not supported.
 */
function get_normalized_html( string $html ): ?string {
	if ( ! method_exists( WP_HTML_Processor::class, 'normalize' ) ) {
		return null;
	}
	return WP_HTML_Processor::normalize( $html );
}

/**
 * Build a DOM-like tree using the HTML API
 *
 * @throws Exception Throws when stuff breaks :D
 *
 * @param string $html    The HTML.
 * @param array  $options The options.
 */
function get_tree( string $html, array $options ): array {
	$processor_state = new ReflectionProperty( WP_HTML_Processor::class, 'state' );
	$processor_state->setAccessible( true );

	$processor_bookmarks = new ReflectionProperty( WP_HTML_Processor::class, 'bookmarks' );
	$processor_bookmarks->setAccessible( true );

	$use_full_parser = method_exists( WP_HTML_Processor::class, 'create_full_parser' ) && ( $options['full_parser'] ?? false );

	$processor = $use_full_parser
		? WP_HTML_Processor::create_full_parser( $html )
		: WP_HTML_Processor::create_fragment( $html );

	$doctype_value = $use_full_parser ? '' : 'html';
	if (
		! $use_full_parser &&
		( $options['quirks_mode'] ?? false ) &&
		property_exists( WP_HTML_Processor::class, 'compat_mode' ) &&
		defined( WP_HTML_Processor::class . '::QUIRKS_MODE' )
	) {
		$processor_compat_mode = new ReflectionProperty( WP_HTML_Processor::class, 'compat_mode' );
		$processor_compat_mode->setValue( $processor, WP_HTML_Processor::QUIRKS_MODE );
		$doctype_value = '';
	}

	$rc = new ReflectionClass( WP_HTML_Processor::class );

	$is_virtual = function () {
		return null;
	};

	if ( $rc->hasMethod( 'is_virtual' ) ) {
		$processor_is_virtual = new ReflectionMethod( WP_HTML_Processor::class, 'is_virtual' );
		$processor_is_virtual->setAccessible( true );
		$is_virtual = function () use ( $processor_is_virtual, $processor ) {
			return $processor_is_virtual->invoke( $processor );
		};
	}

	$get_current_depth = method_exists( WP_HTML_Processor::class, 'get_current_depth' )
		? function () use ( $processor ): int {
			return $processor->get_current_depth();
		}
		: function () use ( $processor ): int {
			return count( $processor->get_breadcrumbs() );
		};

	$get_tag_name = method_exists( WP_HTML_Processor::class, 'get_qualified_tag_name' )
		? function () use ( $processor ): string {
			return $processor->get_qualified_tag_name();
		}
		: function () use ( $processor ): string {
			return $processor->get_tag();
		};

	$get_attribute_name = method_exists( WP_HTML_Processor::class, 'get_qualified_attribute_name' )
		? function ( string $attribute_name ) use ( $processor ): string {
			return $processor->get_qualified_attribute_name( $attribute_name );
		}
		: function ( string $attribute_name ): string {
			return $attribute_name;
		};

	if ( null === $processor ) {
		throw new Exception( 'could not process html' );
	}

	$tree = array(
		'nodeType' => NODE_TYPE_DOCUMENT,
		'nodeName' => '#document',
		'childNodes' => array(),
	);

	$cursor = array( 0 );
	if ( ! $use_full_parser ) {
		$tree['childNodes'][] = array(
			'nodeType' => NODE_TYPE_DOCUMENT_TYPE,
			'nodeName' => $doctype_value,
			'nodeValue' => '',
		);
		$tree['childNodes'][] = array(
			'nodeType' => NODE_TYPE_ELEMENT,
			'nodeName' => 'HTML',
			'attributes' => array(),
			'childNodes' => array(
				array(
					'nodeType' => NODE_TYPE_ELEMENT,
					'nodeName' => 'HEAD',
					'attributes' => array(),
					'childNodes' => array(),
				),
				array(
					'nodeType' => NODE_TYPE_ELEMENT,
					'nodeName' => 'BODY',
					'attributes' => array(),
					'childNodes' => array(),
				),
			),
		);
		$cursor               = array( 1, 1 );
	}

	$compat_mode               = 'CSS1Compat';
	$doctype_name              = null;
	$doctype_public_identifier = null;
	$doctype_system_identifier = null;

	$playback = array();

	$last_html = '';
	while ( $processor->next_token() ) {
		$playback[] = array( $last_html, $tree );
		/**
		 * The bookmark of the current token.
		 *
		 * @var \WP_HTML_Span
		 */
		$bookmark  = $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ];
		$last_html = substr( $html, 0, $bookmark->start + $bookmark->length );

		if ( $processor->get_last_error() !== null ) {
			break;
		}

		if ( ( count( $cursor ) + 1 ) > $get_current_depth() ) {
			array_pop( $cursor );
		}
		$current = &$tree;
		foreach ( $cursor as $path ) {
			$current = &$current['childNodes'][ $path ];
		}

		$token_type = $processor->get_token_type();

		switch ( $token_type ) {
			case '#doctype':
				if ( method_exists( WP_HTML_Processor::class, 'get_doctype_info' ) ) {
					$doctype = $processor->get_doctype_info();

					$doctype_name              = $doctype->name;
					$doctype_public_identifier = $doctype->public_identifier;
					$doctype_system_identifier = $doctype->system_identifier;

					if ( $doctype->indicated_compatability_mode === 'quirks' ) {
						$compat_mode = 'BackCompat';
					}

					$current['childNodes'][] = array(
						'nodeType' => NODE_TYPE_DOCUMENT_TYPE,
						'nodeName' => $doctype_name,
						'_span' => $bookmark,
						'_mode' => $processor_state->getValue( $processor )->insertion_mode,
						'_bc' => $processor->get_breadcrumbs(),
						'_depth' => $get_current_depth(),
					);
				}
				break;

			case '#tag':
				$tag_name = $get_tag_name();

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
							'nodeType' => NODE_TYPE_ATTRIBUTE,
							'specified' => true,
							'nodeName' => $get_attribute_name( $attribute_name ),
							'nodeValue' => $val,
						);
					}
				}

				$namespace = method_exists( WP_HTML_Processor::class, 'get_namespace' ) ? $processor->get_namespace() : 'html';

				$self = array(
					'nodeType' => NODE_TYPE_ELEMENT,
					'nodeName' => $tag_name,
					'attributes' => $attributes,
					'childNodes' => array(),
					'_closer' => (bool) $processor->is_tag_closer(),
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $get_current_depth(),
					'_namespace' => $namespace,
				);

				// Self-contained tags contain their inner contents as modifiable text.
				$modifiable_text = $processor->get_modifiable_text();
				if ( '' !== $modifiable_text ) {
					$self['childNodes'][] = array(
						'nodeType' => NODE_TYPE_TEXT,
						'nodeName' => '#text',
						'nodeValue' => $modifiable_text,
						'_span' => null,
						'_mode' => $processor_state->getValue( $processor )->insertion_mode,
						'_bc' => array_merge( $processor->get_breadcrumbs(), array( '#text' ) ),
						'_virtual' => $is_virtual(),
						'_depth' => $get_current_depth() + 1,
					);
				}

				$current['childNodes'][] = $self;

				if (
					$processor->is_tag_closer() ||
					( $namespace !== 'html' && $processor->has_self_closing_flag() )
				) {
					break;
				}

				if ( ! WP_HTML_Processor::is_void( $tag_name ) ) {
					$cursor[] = count( $current['childNodes'] ) - 1;
				}

				break;

			case '#text':
				$self = array(
					'nodeType' => NODE_TYPE_TEXT,
					'nodeName' => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $get_current_depth(),
				);

				$current['childNodes'][] = $self;
				break;

			case '#cdata-section':
				$self = array(
					'nodeType' => NODE_TYPE_CDATA_SECTION,
					'nodeName' => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $get_current_depth(),
				);

				$current['childNodes'][] = $self;
				break;

			case '#presumptuous-tag':
				$self                    = array(
					'nodeType' => NODE_TYPE_COMMENT,
					'nodeName' => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $get_current_depth(),
				);
				$current['childNodes'][] = $self;
				break;

			case '#funky-comment':
				$self                    = array(
					'nodeType' => NODE_TYPE_COMMENT,
					'nodeName' => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $get_current_depth(),
				);
				$current['childNodes'][] = $self;
				break;

			case '#comment':
				$self = array(
					'nodeType' => NODE_TYPE_COMMENT,
					'_span' => $bookmark,
					'_mode' => $processor_state->getValue( $processor )->insertion_mode,
					'_bc' => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth' => $get_current_depth(),
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
								'nodeType'  => NODE_TYPE_PROCESSING_INSTRUCTION,
								'nodeName' => $processor->get_tag(),
								'nodeValue' => $processor->get_modifiable_text(),
							),
						);
						break;

					case WP_HTML_Processor::COMMENT_AS_CDATA_LOOKALIKE:
						$self['nodeName']  = "{$processor->get_token_name()}({$processor->get_comment_type()})";
						$self['nodeValue'] = $processor->get_modifiable_text();
						break;

					case WP_HTML_Processor::COMMENT_AS_INVALID_HTML:
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
				// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_var_export
				$serialized_token_type = var_export( $token_type, true );
				// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
				throw new Exception( "Unhandled token type for tree construction: {$serialized_token_type}" );
		}
	}
	$playback[] = array( $last_html, $tree );

	if ( null !== $processor->get_last_error() ) {
		if ( method_exists( WP_HTML_Processor::class, 'get_unsupported_exception' ) && $processor->get_unsupported_exception() ) {
			throw $processor->get_unsupported_exception();
		} else {
			// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
			throw new Exception( $processor->get_last_error() );
		}
	}

	if ( $processor->paused_at_incomplete_token() ) {
		throw new Exception( 'Paused at incomplete token' );
	}

	return array(
		'tree' => $tree,
		'playback' => $playback,
		'compatMode' => $compat_mode,
		'doctypeName' => $doctype_name,
		'doctypePublicId' => $doctype_public_identifier,
		'doctypeSystemId' => $doctype_system_identifier,
	);
}

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
