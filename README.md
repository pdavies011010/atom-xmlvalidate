# atom-xmlvalidate package

Validate XML documents against their XSD schemas

## Table of contents

- [Installation](#installation)
- [Usage](#usage)
- [To-Do](#todo)

## Installation

Note: This package depends libxml which is a native library built using node-gyp. It's requirements are:
[github.com/nodejs/node-gyp](https://github.com/nodejs/node-gyp#installation)

In short:
- node, npm and Python 2 (>=2.7.0)
- Some OS specific requirements:
  - MacOs: XCode
  - Windows: I got it working by first installing Windows SDK, Visual Studio 2013 Express; although the link above should have 'official'

To Install:
```
$ apm install atom-xmlvalidate
```

Or you can install through the Settings view by searching for 'XML Validate'.

## Usage

- atom-xmlvalidate looks for a schema referenced in either the top level *schemaLocation* or *noNamespaceSchemaLocation* attribute. Currently it only supports validating against a single schema, so when using the *schemaLocation* attribute there must be only one schema supplied in `[namespace] [location]` format
- Open the XML validation results panel by going to `Packages -> XML Validate -> Toggle`. Documents
  will automatically validate when they are saved.
- Force validation using the `Validate XML` context-menu item.
- Go to the Settings view for this package and set the `Auto Open` option which will cause
   the results panel to open automatically when an XML file is opened or saved.

## To-Do

- Test installation and usage on \*nix platforms
- Rewrite using a non-native XML validation library (which from what I can tell doesn't exist yet)
