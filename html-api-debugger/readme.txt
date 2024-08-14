=== HTML API Debugger ===
Contributors: jonsurrell
Tags: HTML API, development, debug
Requires at least: 6.5
Tested up to: 6.6
Stable tag: 1.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add a page to wp-admin for debugging the HTML API.

== Changelog ==

= 0.1 =
* Initial release.

= 0.2 =
* Remove redundant module.
* Rearrange debugging panes.
* Add option to show invisible characters.

= 0.3 =
* Add button to copy instant playground link.

= 0.4 =
* Improve debugger visibility controls.
* Add handling for real/virtual nodes.

= 0.5 =
* Use regular REST API result response shape.
* Display text content of "atomic" HTML API nodes like `textarea` or `xmp`.

= 0.6 =
* Add better unsupported error messages when possible. (WordPress >= 6.7)

= 0.7 =
* Fix some issues where parsing errors could crash the client.

= 0.8 =
* Show invisible characters in processed HTML spans.
* Fix null-byte rendering in the initial page render.

= 0.9 =
* Fix a bug where "}" was replaced as an invisible character.
* Add a quirks mode toggle that allows changing the doctype used.

= 1.0 =
* Prevent flash of "�" replacing null-byte in input on initial render.
* Support HTML API quirks mode.
* Support for full HTML processor.
* Configurable hover information on nodes: depth and breadcrumbs or insertion mode.

= 1.1 =
* Print tag namespaces.

= 1.2 =
* Handle CDATA sections.
* Use WordPress Script Modules API for all modules.

= 1.3 =
* Replace wp-api-fetch script dependency with native fetch.
* Improve error messages.
* Display templates consistently between DOM and HTML API trees.
* Use "qualified" names. SVG and MathML tags and attributes have some specialized casing.

= 1.4 =
* Show invisible characters in the tree in attribute names, values, and tag names.
* Handle DOCTYPE nodes.
