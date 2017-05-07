'use babel';

import AtomXmlvalidate from '../lib/atom-xmlvalidate';

// Use the command `window:run-package-specs` (cmd-alt-ctrl-p) to run specs.
//
// To run a specific `it` or `describe` block add an `f` to the front (e.g. `fit`
// or `fdescribe`). Remove the `f` to unfocus the block.

describe('AtomXmlvalidate', () => {
  let workspaceElement, activationPromise;

  beforeEach(() => {
    workspaceElement = atom.views.getView(atom.workspace);
    activationPromise = atom.packages.activatePackage('atom-xmlvalidate');
  });

  describe('when the atom-xmlvalidate:toggle event is triggered', () => {
    it('hides and shows the panel', () => {
      let atomXmlValidateElement = workspaceElement.querySelector('.atom-xmlvalidate');

      // Before the activation event the view is not on the DOM, and no panel
      // has been created
      expect(atomXmlValidateElement).toExist();
      let atomXmlValidatePanel = atom.workspace.panelForItem(atomXmlValidateElement);
      let visible = atomXmlValidatePanel.isVisible();

      // This is an activation event, triggering it will cause the package to be
      // activated.
      atom.commands.dispatch(workspaceElement, 'atom-xmlvalidate:toggle');

      expect(visible).toNotBe(atomXmlValidatePanel.isVisible());
    });
  });
});
