// Live binding shared by editor features; the editor controller owns creation.
export let cmView = null;

export function setEditorView(view) {
    cmView = view;
}
