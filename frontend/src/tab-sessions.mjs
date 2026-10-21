// The active editor lives in global state; inactive editors live on their tabs.
export function collectUnsavedSessions(state) {
    return state.tabs.flatMap(tab => {
        const active = tab.id === state.activeTabId;
        const editor = active ? state : tab;
        const content = editor.currentMarkdownSource || '';
        if (!editor.isEditing || content === (editor.editorOriginalContent || '')) return [];
        return [{
            TabID: tab.id,
            IsEditing: true,
            HasUnsaved: true,
            CurrentPath: editor.editingSourcePath || (active ? state.currentFilePath : tab.path) || '',
            Content: content,
            Title: tab.title || '',
        }];
    });
}
