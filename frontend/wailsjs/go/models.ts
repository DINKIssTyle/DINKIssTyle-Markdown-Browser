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
	    aiGeneralEnabled: boolean;
	    aiGeneralEndpoint: string;
	    aiGeneralModel: string;
	    aiGeneralKey: string;
	    aiGeneralTemp: number;
	    aiFimEnabled: boolean;
	    aiFimEndpoint: string;
	    aiFimModel: string;
	    aiFimKey: string;
	    aiFimTemp: number;
	    aiGeneralProvider: string;
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
	        this.aiGeneralEnabled = source["aiGeneralEnabled"];
	        this.aiGeneralEndpoint = source["aiGeneralEndpoint"];
	        this.aiGeneralModel = source["aiGeneralModel"];
	        this.aiGeneralKey = source["aiGeneralKey"];
	        this.aiGeneralTemp = source["aiGeneralTemp"];
	        this.aiFimEnabled = source["aiFimEnabled"];
	        this.aiFimEndpoint = source["aiFimEndpoint"];
	        this.aiFimModel = source["aiFimModel"];
	        this.aiFimKey = source["aiFimKey"];
	        this.aiFimTemp = source["aiFimTemp"];
	        this.aiGeneralProvider = source["aiGeneralProvider"];
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

