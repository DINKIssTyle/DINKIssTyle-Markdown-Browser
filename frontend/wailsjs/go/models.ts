export namespace main {
	
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
	    fontSize: number;
	    engine: string;
	    editorRenderMode: string;
	    editorPreviewScrollSync: boolean;
	    editorOrderedListStyle: string;
	    editorTokenColorsEnabled: boolean;
	    editorTokenColors: Record<string, string>;
	    editorBackgroundColor: string;
	    fileTreeFilterEnabled: boolean;
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
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.fontSize = source["fontSize"];
	        this.engine = source["engine"];
	        this.editorRenderMode = source["editorRenderMode"];
	        this.editorPreviewScrollSync = source["editorPreviewScrollSync"];
	        this.editorOrderedListStyle = source["editorOrderedListStyle"];
	        this.editorTokenColorsEnabled = source["editorTokenColorsEnabled"];
	        this.editorTokenColors = source["editorTokenColors"];
	        this.editorBackgroundColor = source["editorBackgroundColor"];
	        this.fileTreeFilterEnabled = source["fileTreeFilterEnabled"];
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
	export class RecentFile {
	    path: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
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

