<?php

namespace HTML_API_Debugger\HTML_API_Integration;

use Exception;
use ReflectionClass;
use ReflectionMethod;
use ReflectionProperty;
use WP_HTML_Processor;
use WP_HTML_Processor_State;

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

function get_supports(): array {
	$html_processor_rc       = new ReflectionClass( WP_HTML_Processor::class );
	$html_processor_state_rc = new ReflectionClass( WP_HTML_Processor_State::class );

	return array(
		'is_virtual'  => $html_processor_rc->hasMethod( 'is_virtual' ),
		'full_parser' => method_exists( WP_HTML_Processor::class, 'create_full_parser' ),
		'quirks_mode' => $html_processor_state_rc->hasProperty( 'document_mode' ),
	);
}

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
		property_exists( WP_HTML_Processor_State::class, 'document_mode' ) &&
		defined( WP_HTML_Processor_State::class . '::QUIRKS_MODE' )
	) {
		$processor_state->getValue( $processor )->document_mode = WP_HTML_Processor_State::QUIRKS_MODE;
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
		'nodeType'   => NODE_TYPE_DOCUMENT,
		'nodeName'   => '#document',
		'childNodes' => array(),
	);

	$cursor = array( 0 );
	if ( ! $use_full_parser ) {
		$tree['childNodes'][] = array(
			'nodeType'  => NODE_TYPE_DOCUMENT_TYPE,
			'nodeName'  => $doctype_value,
			'nodeValue' => '',
		);
		$tree['childNodes'][] = array(
			'nodeType'   => NODE_TYPE_ELEMENT,
			'nodeName'   => 'HTML',
			'attributes' => array(),
			'childNodes' => array(
				array(
					'nodeType'   => NODE_TYPE_ELEMENT,
					'nodeName'   => 'HEAD',
					'attributes' => array(),
					'childNodes' => array(),
				),
				array(
					'nodeType'   => NODE_TYPE_ELEMENT,
					'nodeName'   => 'BODY',
					'attributes' => array(),
					'childNodes' => array(),
				),
			),
		);
		$cursor               = array( 1, 1 );
	}

	while ( $processor->next_token() ) {
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
				$current['childNodes'][] = array(
					'nodeType' => NODE_TYPE_DOCUMENT_TYPE,
					'nodeName' => $processor->get_modifiable_text(),
					'_span'    => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_mode'    => $processor_state->getValue( $processor )->insertion_mode,
					'_bc'      => $processor->get_breadcrumbs(),
					'_depth'   => $get_current_depth(),
				);
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
							'nodeType'  => NODE_TYPE_ATTRIBUTE,
							'specified' => true,
							'nodeName'  => $get_attribute_name( $attribute_name ),
							'nodeValue' => $val,
						);
					}
				}

				$self = array(
					'nodeType'   => NODE_TYPE_ELEMENT,
					'nodeName'   => $tag_name,
					'attributes' => $attributes,
					'childNodes' => array(),
					'_closer'    => (bool) $processor->is_tag_closer(),
					'_span'      => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_mode'      => $processor_state->getValue( $processor )->insertion_mode,
					'_bc'        => $processor->get_breadcrumbs(),
					'_virtual'   => $is_virtual(),
					'_depth'     => $get_current_depth(),
					'_namespace' => method_exists( WP_HTML_Processor::class, 'get_namespace' ) ? $processor->get_namespace() : 'html',
				);

				// Self-contained tags contain their inner contents as modifiable text.
				$modifiable_text = $processor->get_modifiable_text();
				if ( '' !== $modifiable_text ) {
					$self['childNodes'][] = array(
						'nodeType'  => NODE_TYPE_TEXT,
						'nodeName'  => '#text',
						'nodeValue' => $modifiable_text,
						'_span'     => null,
						'_mode'     => $processor_state->getValue( $processor )->insertion_mode,
						'_bc'       => array_merge( $processor->get_breadcrumbs(), array( '#text' ) ),
						'_virtual'  => $is_virtual(),
						'_depth'    => $get_current_depth() + 1,
					);
				}

				$current['childNodes'][] = $self;

				if ( $processor->is_tag_closer() ) {
					break;
				}

				if ( ! WP_HTML_Processor::is_void( $tag_name ) ) {
					$cursor[] = count( $current['childNodes'] ) - 1;
				}

				break;

			case '#text':
				$self = array(
					'nodeType'  => NODE_TYPE_TEXT,
					'nodeName'  => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span'     => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_mode'     => $processor_state->getValue( $processor )->insertion_mode,
					'_bc'       => $processor->get_breadcrumbs(),
					'_virtual'  => $is_virtual(),
					'_depth'    => $get_current_depth(),
				);

				$current['childNodes'][] = $self;
				break;

			case '#cdata-section':
				$self = array(
					'nodeType'  => NODE_TYPE_CDATA_SECTION,
					'nodeName'  => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span'     => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_mode'     => $processor_state->getValue( $processor )->insertion_mode,
					'_bc'       => $processor->get_breadcrumbs(),
					'_virtual'  => $is_virtual(),
					'_depth'    => $get_current_depth(),
				);

				$current['childNodes'][] = $self;
				break;

			case '#presumptuous-tag':
				$self                    = array(
					'nodeType'  => NODE_TYPE_COMMENT,
					'nodeName'  => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span'     => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_mode'     => $processor_state->getValue( $processor )->insertion_mode,
					'_bc'       => $processor->get_breadcrumbs(),
					'_virtual'  => $is_virtual(),
					'_depth'    => $get_current_depth(),
				);
				$current['childNodes'][] = $self;
				break;

			case '#funky-comment':
				$self                    = array(
					'nodeType'  => NODE_TYPE_COMMENT,
					'nodeName'  => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span'     => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_mode'     => $processor_state->getValue( $processor )->insertion_mode,
					'_bc'       => $processor->get_breadcrumbs(),
					'_virtual'  => $is_virtual(),
					'_depth'    => $get_current_depth(),
				);
				$current['childNodes'][] = $self;
				break;

			case '#comment':
				$self = array(
					'nodeType' => NODE_TYPE_COMMENT,
					'_span'    => $processor_bookmarks->getValue( $processor )[ $processor_state->getValue( $processor )->current_token->bookmark_name ],
					'_mode'    => $processor_state->getValue( $processor )->insertion_mode,
					'_bc'      => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth'   => $get_current_depth(),
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
								'nodeName'  => $processor->get_tag(),
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

	return $tree;
}
