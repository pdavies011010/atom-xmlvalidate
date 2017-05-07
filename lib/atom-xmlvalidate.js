'use babel';

import AtomXmlvalidateView from './atom-xmlvalidate-view';
import { CompositeDisposable } from 'atom';

import _ from 'lodash';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import url from 'url';
import xsd from 'libxml-xsd';
let libxmljs = xsd.libxmljs;

const VALIDATION_HEADER = 'XML Validation Results';

export default {

  atomXmlvalidateView: null,
  bottomPanel: null,
  subscriptions: null,
  config: {
    "autoOpen": {
      "description": "Automatically open the validation results panel when an XML file is opened/saved.",
      "type": "boolean",
      "default": false
    }
  },

  activate(state) {
    this.atomXmlvalidateView = new AtomXmlvalidateView(state.atomXmlvalidateViewState);
    this.bottomPanel = atom.workspace.addBottomPanel({
      item: this.atomXmlvalidateView.getElement(),
      visible: false
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();
    let subscriptions = this.subscriptions;

    // Register commands that toggle the message panel and validate the current document
    subscriptions.add(atom.commands.add('atom-workspace', {
      'atom-xmlvalidate:toggle': () => {
        let shown = this.toggle();
        if (shown) {
          this.validateCurrent();
        }
      },
      'atom-xmlvalidate:validate': () => {
        this.open();
        this.validateCurrent();
      }
    }));

    // Subscribe to 'on save' and 'on open' events
    subscriptions.add(atom.workspace.observeTextEditors(((editor) => {
			subscriptions.add(editor.onDidSave(((event) => {
        let autoOpen = atom.config.get('atom-xmlvalidate.autoOpen');
        let path = event.path;
        if (autoOpen && path && path.endsWith('.xml')) {
          this.open();
        }

        this.validateCurrent(editor, path);
     }).bind(this)));
    }).bind(this)));

    subscriptions.add(atom.workspace.onDidOpen(((event) => {
      if (_.isString(event.uri) && event.item) {
        let autoOpen = atom.config.get('atom-xmlvalidate.autoOpen');
        let path = event.uri;
        if (autoOpen  && path && path.endsWith('.xml')) {
          this.open();
        }

        this.validateCurrent(event.item, path);
      }
    }).bind(this)));
  },

  deactivate() {
    this.bottomPanel.destroy();
    this.subscriptions.dispose();
    this.atomXmlvalidateView.destroy();
  },

  fetchSchema(schemaLocation, callback) {
    // Need to be able to get the schema from a URL or the local filesystem
    let schemaUrl = url.parse(schemaLocation);
    if (_.isNil(schemaUrl.protocol) || _.isEmpty(schemaUrl.protocol) || schemaUrl.protocol === 'file:') {
      // Assume this is local
      // Normalize
      let originalPath = schemaUrl.href;
      let schemaPath = path.normalize(_.replace(originalPath, 'file:///', ''));

      // Check if file exists and parse
      fs.exists(schemaPath, ((xsdFileExists) => {
        if (xsdFileExists) {
          xsd.parseFile(schemaPath, ((err, schema) => {
            if (err) {
              this.writeToPanel('Error parsing schema file: ' + originalPath);
              callback(err);
              this.writeToPanel(err);
            } else {
              callback(null, schema);
            }
          }).bind(this));
        } else {
          this.writeToPanel('Unable to find schema file: ' + originalPath);
        }
      }).bind(this));

    } else {
      // Assume remote, pull it down and parse
      let schemaHref = schemaUrl.href;
      let agent;
      if (schemaUrl.protocol == 'http:') {
        agent = http;
      } else if (schemaUrl.protocol == 'https:') {
        agent = https;
      } else {
        this.writeToPanel('Protocol for schema location is neither http/https');
      }

      agent.get(schemaHref, ((res) => {
        const statusCode = res.statusCode;
        const contentType = res.headers['content-type'];

        let error;
        if (statusCode !== 200) {
          error = new Error(`Request Failed.\n` +
                            `Status Code: ${statusCode}`);
        }
        if (error) {
          this.writeToPanel(error.message);

          // consume response data to free up memory
          res.resume();
          return;
        }

        // Probably shouldn't make this assumption
        res.setEncoding('utf8');

        let rawData = '';
        res.on('data', (chunk) => rawData += chunk);
        res.on('end', (() => {
          try {
            xsd.parse(rawData, ((err, schema) => {
              if (err) {
                this.writeToPanel('Error parsing schema: ' + schemaHref);
                callback(err);
              } else {
                callback(null, schema);
              }
            }).bind(this));
          } catch (e) {
            this.writeToPanel(e.message);
          }
        }).bind(this));
      }).bind(this)).on('error', (e) => {
        this.writeToPanel(`Error making http request: ${e.message}`);
      });
    }
  },

  // Handle valdation of the xml content
  handleValidation(xmlContent) {
    // Return if we're not showing our bottom panel
    if (!this.bottomPanel.isVisible()) {
      return;
    }

    // Search for xsi:schemaLocation OR xsi:noNamespaceSchemaLocation on the root element
    // If they are both there, or if xsi:schemaLocation has more than one namespace defined,
    // then this document is too complex for libxml-xsd to validate (it only accepts one schema definition)
    let xmlDoc, schemaLocation, noNamespaceSchemaLocation;
    try {
      xmlDoc = libxmljs.parseXml(xmlContent);
    } catch (e) {
      // Log parsing errors
      this.writeToPanel(e.message);
      return;
    }

    // Try to get the schema from either the schemaLocation or noNamespaceSchemaLocation attributes
    schemaLocation = xmlDoc.root().attr('schemaLocation');
    noNamespaceSchemaLocation = xmlDoc.root().attr('noNamespaceSchemaLocation');

    // Perform a little validation
    if (schemaLocation && noNamespaceSchemaLocation) {
      this.writeToPanel('Document too complex for libxml-xsd, need a single schema on the root element to validate against. Unable to validate');
      return;
    } else if (!schemaLocation && !noNamespaceSchemaLocation)  {
      this.writeToPanel('No schema in root level schemaLocation or noNamespaceSchemaLocation attribute. Unable to validate');
      return;
    }

    // Now either schema location or noNamespaceSchemaLocation should have something...
    schemaLocation = schemaLocation ? this.parseSchemaLocation(schemaLocation.value()) : noNamespaceSchemaLocation.value();
    if (!schemaLocation) {
      this.writeToPanel('Unable to determine schema. Unable to validate');
      return;
    }

    this.fetchSchema(schemaLocation, ((err, schema) => {
      if (err) {
        this.writeToPanel(err);
      } else {
        this.performValidation(xmlDoc, schema);
      }
    }).bind(this));
  },

  // Open the bottom panel
  open() {
    this.bottomPanel.show();
  },

  // Parse schema location from either the schemaLocation or noNamespaceSchemaLocation attributes
  parseSchemaLocation(sl) {
    let result = null;
    // Assume element contents are split around a space. I'm sure there's a better way to do this.
    let pieces = sl.split(' ');

    // What we're looking for is a single URL, but the schemaLocation attribute is in the format
    // <namespace> <URL> <namespace> <URL>
    // So if there's fewer or greater than 2 pieces, we can't truly resolve
    if (!pieces || (pieces.length != 2)) {
      this.writeToPanel('Unable to determine schema from schemaLocation attribute');
      return result;
    }

    return pieces[1];
  },

  // Method that actually does the validation !! !!
  performValidation(xmlDoc, schema) {
    // Write out validation header
    this.writeToPanel(VALIDATION_HEADER, true);

    schema.validate(xmlDoc, ((err, valErrors) => {
      if (err) {
        this.writeToPanel('Error performing schema validation');
        this.writeToPanel(err);
      } else if (_.isNil(valErrors) || _.isEmpty(valErrors)) {
        this.writeToPanel('Validation completed without error');
      } else {
        _.each(valErrors, ((valError) => {
          this.writeToPanel('Validation error: ' + valError);
        }).bind(this));
      }
    }).bind(this));
  },

  // Serialize settings
  serialize() {
    return {
      atomXmlvalidateViewState: this.atomXmlvalidateView.serialize()
    };
  },

  // Toggle the bottom panel
  toggle() {
    let shown = this.bottomPanel.isVisible();
    if (shown) {
      this.bottomPanel.hide();
    } else {
      this.bottomPanel.show();

      // Write out validation header
      this.writeToPanel(VALIDATION_HEADER, true);
    }
    return !shown;
  },

  // Validate the text in the current editor (called via context menu)
  validateCurrent (editor, path) {
    editor = editor || atom.workspace.getActiveTextEditor();

    // There must be a better way to check that what we opened was actually an editor
    if (!editor || !editor.getBuffer) {
      return;
    }

    path = path || editor.getPath();
    let text = editor.getBuffer().getText();

    // Write out validation header
    this.writeToPanel(VALIDATION_HEADER, true);

    if (path && path.endsWith('.xml')) {
      this.handleValidation(text);
    }
  },

  // Write a message to the output panel
  writeToPanel (message, overwrite) {
    let ele = this.atomXmlvalidateView.getElement();
    if (overwrite) {
      while (ele.hasChildNodes()) {
        ele.removeChild(ele.firstChild);
      }
    }

    const messageEle = document.createElement('div');
    messageEle.textContent = message;
    messageEle.classList.add('message');
    ele.appendChild(messageEle);
  }

};
