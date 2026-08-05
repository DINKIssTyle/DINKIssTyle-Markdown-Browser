export namespace app {
	
	export class AIModelInfo {
	    id: string;
	    displayName: string;
	    isLoaded: boolean;
	    stateLabel: string;
	    primaryLoadedInstanceId: string;
	
	    static createFrom(source: any = {}) {
	        return new AIModelInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.displayName = source["displayName"];
	        this.isLoaded = source["isLoaded"];
	        this.stateLabel = source["stateLabel"];
	        this.primaryLoadedInstanceId = source["primaryLoadedInstanceId"];
	    }
	}
	export class AppSettings {
	    theme: string;
	    lightAccentColor: string;
	    darkAccentColor: string;
	    scrollbarVisibility: string;
	    mainToolbarNewDocument: boolean;
	    mainToolbarEdit: boolean;
	    mainToolbarTranslate: boolean;
	    mainToolbarFontSize: boolean;
	    mainToolbarTheme: boolean;
	    fontSize: number;
	    engine: string;
	    editorRenderMode: string;
	    editorToolbarMode: string;
	    editorAuthor: string;
	    editorPreviewScrollSync: boolean;
	    editorOrderedListStyle: string;
	    editorTokenColorsEnabled: boolean;
	    editorTokenColors: Record<string, string>;
	    editorBackgroundColor: string;
	    fileTreeFilterEnabled: boolean;
	    recentFileDisplayLimit: number;
	    outlineHeadingFormat: boolean;
	    aiFeaturesDisabled: boolean;
	    aiGeneralEnabled: boolean;
	    aiGeneralToolbarEnabled: boolean;
	    aiToolbarCollapsed: boolean;
	    aiGeneralEndpoint: string;
	    aiGeneralModel: string;
	    aiGeneralKey: string;
	    aiGeneralTemp: number;
	    aiFimEnabled: boolean;
	    aiFimToolbarEnabled: boolean;
	    aiFimEndpoint: string;
	    aiFimModel: string;
	    aiFimKey: string;
	    aiFimTemp: number;
	    aiGeneralProvider: string;
	    aiSelectionContext: boolean;
	    aiGithubCompatible: boolean;
	    aiSupportAgent: boolean;
	    koreanImeEnterFix: boolean;
	    lastVersion: string;
	    updateCheckInterval: string;
	    lastUpdateCheck: string;
	    documentMargin: string;
	    viewerFontFamily: string;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.lightAccentColor = source["lightAccentColor"];
	        this.darkAccentColor = source["darkAccentColor"];
	        this.scrollbarVisibility = source["scrollbarVisibility"];
	        this.mainToolbarNewDocument = source["mainToolbarNewDocument"];
	        this.mainToolbarEdit = source["mainToolbarEdit"];
	        this.mainToolbarTranslate = source["mainToolbarTranslate"];
	        this.mainToolbarFontSize = source["mainToolbarFontSize"];
	        this.mainToolbarTheme = source["mainToolbarTheme"];
	        this.fontSize = source["fontSize"];
	        this.engine = source["engine"];
	        this.editorRenderMode = source["editorRenderMode"];
	        this.editorToolbarMode = source["editorToolbarMode"];
	        this.editorAuthor = source["editorAuthor"];
	        this.editorPreviewScrollSync = source["editorPreviewScrollSync"];
	        this.editorOrderedListStyle = source["editorOrderedListStyle"];
	        this.editorTokenColorsEnabled = source["editorTokenColorsEnabled"];
	        this.editorTokenColors = source["editorTokenColors"];
	        this.editorBackgroundColor = source["editorBackgroundColor"];
	        this.fileTreeFilterEnabled = source["fileTreeFilterEnabled"];
	        this.recentFileDisplayLimit = source["recentFileDisplayLimit"];
	        this.outlineHeadingFormat = source["outlineHeadingFormat"];
	        this.aiFeaturesDisabled = source["aiFeaturesDisabled"];
	        this.aiGeneralEnabled = source["aiGeneralEnabled"];
	        this.aiGeneralToolbarEnabled = source["aiGeneralToolbarEnabled"];
	        this.aiToolbarCollapsed = source["aiToolbarCollapsed"];
	        this.aiGeneralEndpoint = source["aiGeneralEndpoint"];
	        this.aiGeneralModel = source["aiGeneralModel"];
	        this.aiGeneralKey = source["aiGeneralKey"];
	        this.aiGeneralTemp = source["aiGeneralTemp"];
	        this.aiFimEnabled = source["aiFimEnabled"];
	        this.aiFimToolbarEnabled = source["aiFimToolbarEnabled"];
	        this.aiFimEndpoint = source["aiFimEndpoint"];
	        this.aiFimModel = source["aiFimModel"];
	        this.aiFimKey = source["aiFimKey"];
	        this.aiFimTemp = source["aiFimTemp"];
	        this.aiGeneralProvider = source["aiGeneralProvider"];
	        this.aiSelectionContext = source["aiSelectionContext"];
	        this.aiGithubCompatible = source["aiGithubCompatible"];
	        this.aiSupportAgent = source["aiSupportAgent"];
	        this.koreanImeEnterFix = source["koreanImeEnterFix"];
	        this.lastVersion = source["lastVersion"];
	        this.updateCheckInterval = source["updateCheckInterval"];
	        this.lastUpdateCheck = source["lastUpdateCheck"];
	        this.documentMargin = source["documentMargin"];
	        this.viewerFontFamily = source["viewerFontFamily"];
	    }
	}
	export class FileResult {
	    path: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new FileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.content = source["content"];
	    }
	}
	export class FileTreeNode {
	    name: string;
	    path: string;
	    isDir: boolean;
	    hasItems: boolean;
	    children?: FileTreeNode[];
	
	    static createFrom(source: any = {}) {
	        return new FileTreeNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isDir = source["isDir"];
	        this.hasItems = source["hasItems"];
	        this.children = this.convertValues(source["children"], FileTreeNode);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FontInfo {
	    family: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new FontInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.family = source["family"];
	        this.path = source["path"];
	    }
	}
	export class RecentFile {
	    path: string;
	    name: string;
	    pinned: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RecentFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.pinned = source["pinned"];
	    }
	}
	export class SpellCheckLanguage {
	    code: string;
	    name: string;
	    nativeName: string;
	    auto: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SpellCheckLanguage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.name = source["name"];
	        this.nativeName = source["nativeName"];
	        this.auto = source["auto"];
	    }
	}
	export class TranslationAIConfig {
	    provider: string;
	    endpoint: string;
	    model: string;
	    key: string;
	    temperature: number;
	
	    static createFrom(source: any = {}) {
	        return new TranslationAIConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.endpoint = source["endpoint"];
	        this.model = source["model"];
	        this.key = source["key"];
	        this.temperature = source["temperature"];
	    }
	}
	export class SpellCheckRequest {
	    content: string;
	    language: SpellCheckLanguage;
	    ai: TranslationAIConfig;
	
	    static createFrom(source: any = {}) {
	        return new SpellCheckRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.content = source["content"];
	        this.language = this.convertValues(source["language"], SpellCheckLanguage);
	        this.ai = this.convertValues(source["ai"], TranslationAIConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SpellCheckSuggestion {
	    original: string;
	    replacement: string;
	    start: number;
	    end: number;
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new SpellCheckSuggestion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.original = source["original"];
	        this.replacement = source["replacement"];
	        this.start = source["start"];
	        this.end = source["end"];
	        this.reason = source["reason"];
	    }
	}
	export class SpellCheckResult {
	    suggestions: SpellCheckSuggestion[];
	
	    static createFrom(source: any = {}) {
	        return new SpellCheckResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.suggestions = this.convertValues(source["suggestions"], SpellCheckSuggestion);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class TranslationLanguage {
	    code: string;
	    name: string;
	    nativeName: string;
	    suffix: string;
	
	    static createFrom(source: any = {}) {
	        return new TranslationLanguage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.name = source["name"];
	        this.nativeName = source["nativeName"];
	        this.suffix = source["suffix"];
	    }
	}
	export class TranslateDocumentRequest {
	    sourcePath: string;
	    content: string;
	    languages: TranslationLanguage[];
	    ai: TranslationAIConfig;
	    overwriteExisting: boolean;
	    inMemory: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TranslateDocumentRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourcePath = source["sourcePath"];
	        this.content = source["content"];
	        this.languages = this.convertValues(source["languages"], TranslationLanguage);
	        this.ai = this.convertValues(source["ai"], TranslationAIConfig);
	        this.overwriteExisting = source["overwriteExisting"];
	        this.inMemory = source["inMemory"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TranslatedDocumentTarget {
	    code: string;
	    name: string;
	    nativeName: string;
	    path: string;
	    fileName: string;
	    exists: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TranslatedDocumentTarget(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.name = source["name"];
	        this.nativeName = source["nativeName"];
	        this.path = source["path"];
	        this.fileName = source["fileName"];
	        this.exists = source["exists"];
	    }
	}
	export class TranslatedDocumentResult {
	    targets: TranslatedDocumentTarget[];
	    translations: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new TranslatedDocumentResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.targets = this.convertValues(source["targets"], TranslatedDocumentTarget);
	        this.translations = source["translations"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class UpdateAsset {
	    name: string;
	    downloadUrl: string;
	    size: number;
	    digest: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateAsset(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.downloadUrl = source["downloadUrl"];
	        this.size = source["size"];
	        this.digest = source["digest"];
	    }
	}
	export class UpdateInfo {
	    available: boolean;
	    currentVersion: string;
	    latestVersion: string;
	    releaseName: string;
	    releaseNotes: string;
	    releaseUrl: string;
	    publishedAt: string;
	    checkedAt: string;
	    operatingSystem: string;
	    architecture: string;
	    asset?: UpdateAsset;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.releaseName = source["releaseName"];
	        this.releaseNotes = source["releaseNotes"];
	        this.releaseUrl = source["releaseUrl"];
	        this.publishedAt = source["publishedAt"];
	        this.checkedAt = source["checkedAt"];
	        this.operatingSystem = source["operatingSystem"];
	        this.architecture = source["architecture"];
	        this.asset = this.convertValues(source["asset"], UpdateAsset);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace options {
	
	export class SecondInstanceData {
	    Args: string[];
	    WorkingDirectory: string;
	
	    static createFrom(source: any = {}) {
	        return new SecondInstanceData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Args = source["Args"];
	        this.WorkingDirectory = source["WorkingDirectory"];
	    }
	}

}

