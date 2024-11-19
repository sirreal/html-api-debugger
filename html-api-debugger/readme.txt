=== HTML API Debugger ===
Contributors: jonsurrell, bernhard-reiter
Tags: HTML API, development, debug
Requires at least: 6.7
Tested up to: 6.8
Stable tag: 2.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add a WP Admin page for debugging the HTML API.

== Contributing ==

Please file issues and pull requests on the [GitHub repository](https://github.com/sirreal/html-api-debugger).

== Changelog ==

= 2.4 =

= 2.3 =
* Inline tree copy buttons.
* Add line breaks to overflowing attribute names and values.

= 2.2 =
* Drop support for WordPress 6.6.
* Drop basic fragment parsing and quirks mode support.
* Add advanced context and fragment parsing when supported (WordPress 6.8+).
* Add functionality to copy textual representations of the generated trees.

= 2.1 =
* Add text-wrap styling fallback for unsupported browsers.

= 2.0 =
* Add ability to replay token processing.
* Fix quirks mode fragment parsing.
* Drop support for WordPress 6.5.

= 1.9 =
* Update WordPress Playground links to use current query args.
* Improve span highlighting reliability.
* Fix an uncuaght exception on undefined clearSpan function.

= 1.8 =
* Highlight spans in HTML input on hover.
* Fix a bug in tree construction with self-closing tags in foreign content.

= 1.7 =
* Update DOM tree when HTML document is mutated.
* Fix deprecation notice on WordPress 6.7.
* Register script modules unconditionally.

= 1.6 =
* Replace TABLE based layout with CSS grid.
* Fix a crash on meta tags with a content attribute.
* Display namespace on tag closers.
* Display normalized HTML when supported.

= 1.5 =
* Improve initial rendering and reduce layout shift.
* Allow copying playground links to latest, beta, and nightly versions.
* Allow copying playground links to specific wordpress-develop PRs.

= 1.4 =
* Show invisible characters in the tree in attribute names, values, and tag names.
* Handle DOCTYPE nodes.
* Prevent newlines from automatically being added to the HTML input.
* Use async event directives if available.
* Handle DOCTYPE tokens and display information about quirks-mode.

= 1.3 =
* Replace wp-api-fetch script dependency with native fetch.
* Improve error messages.
* Display templates consistently between DOM and HTML API trees.
* Use "qualified" names. SVG and MathML tags and attributes have some specialized casing.

= 1.2 =
* Handle CDATA sections.
* Use WordPress Script Modules API for all modules.

= 1.1 =
* Print tag namespaces.

= 1.0 =
* Prevent flash of "�" replacing null-byte in input on initial render.
* Support HTML API quirks mode.
* Support for full HTML processor.
* Configurable hover information on nodes: depth and breadcrumbs or insertion mode.

= 0.9 =
* Fix a bug where "}" was replaced as an invisible character.
* Add a quirks mode toggle that allows changing the DOCTYPE used.

= 0.8 =
* Show invisible characters in processed HTML spans.
* Fix null-byte rendering in the initial page render.

= 0.7 =
* Fix some issues where parsing errors could crash the client.

= 0.6 =
* Add better unsupported error messages when possible. (WordPress >= 6.7)

= 0.5 =
* Use regular REST API result response shape.
* Display text content of "atomic" HTML API nodes like TEXTAREA or XMP.

= 0.4 =
* Improve debugger visibility controls.
* Add handling for real/virtual nodes.

= 0.3 =
* Add button to copy instant playground link.

= 0.2 =
* Remove redundant module.
* Rearrange debugging panes.
* Add option to show invisible characters.

= 0.1 =
* Initial release.
