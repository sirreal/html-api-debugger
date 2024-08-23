# XML API Debugger

This is a WordPress plugin to help debug the behavior of the XML API.

The XML API is currently under development and only available in WordPress development builds.

To get started:

- Check out this repository.
- Check out a branch of WordPress Develop with the XML API, [for example this branch](https://github.com/sirreal/wordpress-develop/tree/xml-processor-continue).
- In the WordPress Develop Directory, add a `.wp-env.json` file like the following:
  ```json
  {
    "core": "./src",
    "plugins": ["…/path/to/plugin-xml-api-debugger/xml-api-debugger"]
  }
  ```
- From the WordPress Develop directory, run `wp-env start`.

[It is a fork of the HTML API Debugger.](https://wordpress.org/plugins/html-api-debugger/)
