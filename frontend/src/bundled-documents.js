const bundledMarkdownModules = import.meta.glob('./docs/*.md', { as: 'raw', eager: true });

export async function loadBundledMarkdown(path) {
    const cleanName = path.replace(/^\/+/, '');
    const globKey = `./docs/${cleanName}`;
    if (typeof bundledMarkdownModules[globKey] === 'string') {
        return bundledMarkdownModules[globKey];
    }

    try {
        const response = await fetch(path);
        if (response.ok) {
            return await response.text();
        }
    } catch {
        // fetch fallback
    }

    try {
        const response = await fetch('.' + path);
        if (response.ok) {
            return await response.text();
        }
    } catch {
        // relative fetch fallback
    }

    throw new Error(`Failed to load bundled markdown: ${path}`);
}

