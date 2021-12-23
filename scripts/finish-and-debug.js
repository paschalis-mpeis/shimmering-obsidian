#!/usr/bin/env osascript -l JavaScript

function run(argv) {
	ObjC.import("stdlib");
	ObjC.import("Foundation");
	const app = Application.currentApplication();
	app.includeStandardAdditions = true;
	function readFile (path, encoding) {
		if (!encoding) encoding = $.NSUTF8StringEncoding;
		const fm = $.NSFileManager.defaultManager;
		const data = fm.contentsAtPath(path);
		const str = $.NSString.alloc.initWithDataEncoding(data, encoding);
		return ObjC.unwrap(str);
	}
	const onlineJSON = url => JSON.parse(app.doShellScript("curl -sL '" + url + "'"));

	// input parameters
	let odebug = false;
	if (argv.join("") === "odebug") odebug = true;
	const vaultPath = $.getenv("vault_path").replace(/^~/, app.pathTo("home folder"));
	let output = "";

	// either logs to console or returns for clipboard
	function log (str) {
		if (odebug) output += str + "\n";
		else console.log (str);
	}

	function debugLog () {
		const appTempPath = app.pathTo("home folder") + "/Library/Application Support/obsidian/";
		const obsiVer = app.doShellScript("cd '" + appTempPath + "'; ls *.asar | grep -Eo '(\\d|\\.)*'").slice (0, -1);
		const macVer = app.doShellScript("sw_vers -productVersion");
		const advancedUriVer = JSON.parse(readFile(vaultPath + "/.obsidian/plugins/obsidian-advanced-uri/manifest.json")).version;
		const metadataExVer = JSON.parse(readFile(vaultPath + "/.obsidian/plugins/metadata-extractor/manifest.json")).version;

		const advancedUriVerOnline = onlineJSON("https://github.com/Vinzent03/obsidian-advanced-uri/releases/latest/download/manifest.json")
			.version;
		const metadataExVerOnline = onlineJSON("https://github.com/kometenstaub/metadata-extractor/releases/latest/download/manifest.json")
			.version;
		const obsiVerOnline = onlineJSON("https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json")
			.latestVersion;
		const obsiVerBetaOnline = onlineJSON("https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json")
			.beta.latestVersion;
		const workflowVerOnline = onlineJSON("https://api.github.com/repos/chrisgrieser/shimmering-obsidian/tags")[0]
			.name;

		const numberOfJSONS = app.doShellScript("ls '" + vaultPath + "/.obsidian/plugins/metadata-extractor/' | grep \".json\" | grep -v \"manifest\" | grep -v \"^data\" | wc -l | tr -d \" \"");

		log("_");
		log("-------------------------------");
		log("Metadata JSONs: " + numberOfJSONS + "/3");
		if (numberOfJSONS < 3) log("Metadata not found. Please run `osetup` and retry.")
		log("-------------------------------");
		log("INSTALLED VERSION");
		log("macOS: " + macVer);
		log("Obsidian: " + obsiVer);
		log("Alfred: " + $.getenv("alfred_version"));
		log("Workflow: " + $.getenv("alfred_workflow_version"));
		log("Advanced URI Extractor: " + advancedUriVer);
		log("Metadata Extractor: " + metadataExVer);
		log("-------------------------------");
		log("LATEST VERSION");
		log("Obsidian: " + obsiVerOnline);
		log("Obsidian (Insider): " + obsiVerBetaOnline);
		log("Workflow: " + workflowVerOnline);
		log("Advanced URI Extractor: " + advancedUriVerOnline);
		log("Metadata Extractor: " + metadataExVerOnline);
		log("-------------------------------");
	}

	// remove config
	Application("com.runningwithcrayons.Alfred").removeConfiguration("ObRunning", { inWorkflow: $.getenv("alfred_workflow_bundleid") } );

	// log Version info to debugging log
	// stop when no debugging required https://www.alfredapp.com/help/workflows/script-environment-variables/
	if (odebug) {
		debugLog();
		return output;
	}
	if ($.getenv("alfred_debug") === "1") debugLog();

}

