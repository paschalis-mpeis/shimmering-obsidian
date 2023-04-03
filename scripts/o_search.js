#!/usr/bin/env osascript -l JavaScript

ObjC.import("stdlib");
ObjC.import("Foundation");
const app = Application.currentApplication();
app.includeStandardAdditions = true;
const externalLinkRegex = /\[[^\]]*\]\([^)]+\)/;

function readFile(path) {
	const data = $.NSFileManager.defaultManager.contentsAtPath(path);
	const str = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
	return ObjC.unwrap(str);
}

function parentFolder(filePath) {
	if (!filePath.includes("/")) return "/";
	return filePath.split("/").slice(0, -1).join("/");
}

function alfredMatcher(str) {
	const clean = str.replace(/[-()_.:#/\\;,[\]]/g, " ");
	const camelCaseSeperated = str.replace(/([A-Z])/g, " $1");
	return [clean, camelCaseSeperated, str].join(" ") + " ";
}

function fileExists(filePath) {
	return Application("Finder").exists(Path(filePath));
}

//──────────────────────────────────────────────────────────────────────────────
// Read and Parse data

function getVaultPath() {
	const theApp = Application.currentApplication();
	theApp.includeStandardAdditions = true;
	const dataFile = $.NSFileManager.defaultManager.contentsAtPath("./vaultPath");
	const vault = $.NSString.alloc.initWithDataEncoding(dataFile, $.NSUTF8StringEncoding);
	return ObjC.unwrap(vault).replace(/^~/, theApp.pathTo("home folder"));
}
const vaultPath = getVaultPath();
const metadataJSON = vaultPath + "/.obsidian/plugins/metadata-extractor/metadata.json";
const canvasJSON = vaultPath + "/.obsidian/plugins/metadata-extractor/canvas.json";
const starredJSON = vaultPath + "/.obsidian/starred.json";
const bookmarkJSON = vaultPath + "/.obsidian/bookmarks.json";
const excludeFilterJSON = vaultPath + "/.obsidian/app.json";
const superIconFile = $.getenv("supercharged_icon_file").replace(/^~/, app.pathTo("home folder"));

let recentJSON = vaultPath + "/.obsidian/workspace.json";
if (!fileExists(recentJSON)) recentJSON = recentJSON.slice(0, -5); // Obsidian 0.16 uses workspace.json → https://discord.com/channels/686053708261228577/716028884885307432/1013906018578743478

const excludeFilter = fileExists(excludeFilterJSON) ? JSON.parse(readFile(excludeFilterJSON)).userIgnoreFilters : [];
console.log("excludeFilter: " + excludeFilter);

const recentFiles = fileExists(recentJSON) ? JSON.parse(readFile(recentJSON)).lastOpenFiles : [];
console.log("recentFiles length: " + recentFiles.length);

let canvasArray = fileExists(canvasJSON) ? JSON.parse(readFile(canvasJSON)) : [];
console.log("canvasArray length: " + canvasArray.length);

//──────────────────────────────────────────────────────────────────────────────
// BOOKMARKS & STARS

let stars = [];
const bookmarks = [];
if (fileExists(starredJSON)) {
	stars = JSON.parse(readFile(starredJSON))
		.items.filter(item => item.type === "file")
		.map(item => item.path);
}

// recursively flatten the array and collect the paths in the collective
function bmFlatten(input, collector) {
	input.forEach(item => {
		if (item.type === "file") collector.push(item.path);
		if (item.type === "group") bmFlatten(item.items, collector);
	});
}

if (fileExists(bookmarkJSON)) {
	const bookm = JSON.parse(readFile(bookmarkJSON)).items;
	bmFlatten(bookm, bookmarks);
}
const starsAndBookmarks = [...new Set([...stars, ...bookmarks])]
console.log("starsAndBookmarks length:", starsAndBookmarks.length);

//──────────────────────────────────────────────────────────────────────────────
// ICONS
let superIconList = [];
if (superIconFile && fileExists(superIconFile)) {
	superIconList = readFile(superIconFile)
		.split("\n")
		.filter(line => line.length !== 0);
}
console.log("superIconList length: " + superIconList.length);

let fileArray;
if (fileExists(metadataJSON)) fileArray = JSON.parse(readFile(metadataJSON));
else console.log("metadata.json missing.");

const jsonArray = [];

//──────────────────────────────────────────────────────────────────────────────
// DETERMINE PATH TO SEARCH
let currentFolder;
let pathToCheck;
// either searches the vault, or a subfolder of the vault
try {
	currentFolder = $.getenv("browse_folder");
	pathToCheck = vaultPath + "/" + currentFolder;
	if (pathToCheck.endsWith("//")) pathToCheck = vaultPath; // when going back up from child of vault root
} catch (error) {
	pathToCheck = vaultPath;
}

let folderArray = app.doShellScript(`find "${pathToCheck}" -type d -mindepth 1 -not -path "*/.*"`).split("\r"); // returns *absolute* paths
if (!folderArray) folderArray = [];

//──────────────────────────────────────────────────────────────────────────────
// EXCLUSION & IGNORING

function applyExcludeFilter(array, isFolder) {
	if (!excludeFilter || excludeFilter.length === 0 || array.length === 0) return array;

	return array.filter(item => {
		let include = true;
		if (isFolder) item += "/";
		excludeFilter.forEach(filter => {
			const isRegexFilter = filter.startsWith("/");
			const relPath = isFolder ? item.slice(vaultPath.length + 1) : item.relativePath;
			if (isRegexFilter && relPath.includes(filter)) include = false;
			if (!isRegexFilter && relPath.startsWith(filter)) include = false;
		});
		return include;
	});
}

folderArray = applyExcludeFilter(folderArray, true);
canvasArray = applyExcludeFilter(canvasArray, false);
fileArray = applyExcludeFilter(fileArray, false);

// if in subfolder, filder files outside subfolder
if (pathToCheck !== vaultPath) fileArray = fileArray.filter(file => file.relativePath.startsWith(currentFolder));

// IGNORED HEADINGS
const hLVLignore = $.getenv("h_lvl_ignore");
const headingIgnore = [true];
for (let i = 1; i < 7; i++) {
	if (hLVLignore.includes(i.toString())) headingIgnore.push(true);
	else headingIgnore.push(false);
}

//──────────────────────────────────────────────────────────────────────────────
// CONSTRUCTION OF JSON FOR ALFRED

// FILES
fileArray.forEach(file => {
	const filename = file.fileName;
	const relativePath = file.relativePath;
	const absolutePath = vaultPath + "/" + relativePath;

	let tagMatcher = "";
	if (file.tags) tagMatcher = " #" + file.tags.join(" #");

	// icon & emojis
	let iconpath = "icons/note.png";
	let emoji = "";
	let additionalMatcher = "";
	if (starsAndBookmarks.includes(relativePath)) {
		emoji += "🔖 ";
		additionalMatcher += "starred bookmarked ";
	}
	if (recentFiles.includes(relativePath)) {
		emoji += "🕑 ";
		additionalMatcher += "recent ";
	}
	if (filename.toLowerCase().includes("kanban")) iconpath = "icons/kanban.png";

	let superchargedIcon = "";
	let superchargedIcon2 = "";
	if (superIconList.length > 0 && file.tags) {
		superIconList.forEach(pair => {
			const tag = pair.split(",")[0].toLowerCase().replaceAll("#", "");
			const icon = pair.split(",")[1];
			const icon2 = pair.split(",")[2];
			if (file.tags.includes(tag) && icon) superchargedIcon = icon + " ";
			else if (file.tags.includes(tag) && icon2) superchargedIcon2 = " " + icon2;
		});
	}

	// check link existence of file
	let hasLinks = Boolean(file.links?.some(link => link.relativePath) || file.backlinks); // no relativePath => unresolved link
	if (!hasLinks) hasLinks = externalLinkRegex.test(readFile(absolutePath)); // readFile only executed when no other links found for performance
	let linksSubtitle = "⛔️ Note without Outgoing Links or Backlinks";
	if (hasLinks) linksSubtitle = "⇧: Browse Links in Note";

	// exclude cssclass: private
	let displayName = filename;
	const censorChar = $.getenv("censor_char");
	const isPrivateNote = file.frontmatter?.cssclass?.includes("private");
	const privacyModeOn = $.getenv("privacy_mode") === "1";
	const applyCensoring = isPrivateNote && privacyModeOn;
	if (applyCensoring) displayName = filename.replace(/./g, censorChar);

	// Notes (file names)
	jsonArray.push({
		title: emoji + superchargedIcon + displayName + superchargedIcon2,
		match: alfredMatcher(filename) + tagMatcher + " filename name title",
		subtitle: "▸ " + parentFolder(relativePath),
		arg: relativePath,
		quicklookurl: absolutePath,
		type: "file:skipcheck",
		uid: relativePath,
		icon: { path: iconpath },
		mods: {
			shift: {
				valid: hasLinks,
				subtitle: linksSubtitle,
			},
		},
	});

	// Aliases
	if (file.aliases) {
		file.aliases.forEach(alias => {
			let displayAlias = alias;
			if (applyCensoring) displayAlias = displayAlias.replace(/./g, censorChar);
			jsonArray.push({
				title: superchargedIcon + displayAlias + superchargedIcon2,
				match: additionalMatcher + "alias " + alfredMatcher(alias),
				subtitle: "↪ " + displayName,
				arg: relativePath,
				quicklookurl: absolutePath,
				type: "file:skipcheck",
				uid: alias + "_" + relativePath,
				icon: { path: "icons/alias.png" },
				mods: {
					shift: {
						valid: hasLinks,
						subtitle: linksSubtitle,
					},
				},
			});
		});
	}

	// Headings
	if (!file.headings) return; // skips iteration if no heading
	file.headings.forEach(heading => {
		const hName = heading.heading;
		const hLevel = heading.level;
		if (headingIgnore[hLevel]) return; // skips iteration if heading has been configured as ignore
		iconpath = "icons/headings/h" + hLevel.toString() + ".png";
		const matchStr = "h" + hLevel.toString() + " " + alfredMatcher(hName) + " ";
		let displayHeading = hName;
		if (applyCensoring) displayHeading = displayHeading.replace(/./g, censorChar);

		jsonArray.push({
			title: displayHeading,
			match: matchStr,
			subtitle: "➣ " + displayName,
			arg: relativePath + "#" + hName,
			quicklookurl: absolutePath,
			type: "file:skipcheck",
			uid: hName + "_" + relativePath,
			icon: { path: iconpath },
			mods: {
				shift: {
					valid: hasLinks,
					subtitle: linksSubtitle,
					arg: relativePath,
				},
				alt: { arg: relativePath },
			},
		});
	});
});

// CANVASES
canvasArray.forEach(file => {
	const name = file.basename;
	const relativePath = file.relativePath;
	const denyForCanvas = {
		valid: false,
		subtitle: "⛔ Cannot do that with a canvas.",
	};

	jsonArray.push({
		title: name,
		match: alfredMatcher(name) + " canvas",
		subtitle: "▸ " + parentFolder(relativePath),
		arg: relativePath,
		type: "file:skipcheck",
		icon: { path: "icons/canvas.png" },
		uid: relativePath,
		mods: {
			shift: denyForCanvas,
			fn: denyForCanvas,
		},
	});
});

// FOLDERS
folderArray.forEach(absolutePath => {
	const name = absolutePath.split("/").pop();
	const relativePath = absolutePath.slice(vaultPath.length + 1);
	if (!name) return; // root on 2 level deep folder search

	jsonArray.push({
		title: name,
		match: alfredMatcher(name) + " folder",
		subtitle: "▸ " + parentFolder(relativePath) + "   [↵: Browse]",
		arg: relativePath,
		type: "file:skipcheck",
		uid: relativePath,
		icon: { path: "icons/folder.png" },
		mods: {
			alt: { subtitle: "⌥: Open Folder in Finder" },
			cmd: {
				valid: false,
				subtitle: "⛔️ Cannot open folders",
			},
			shift: {
				valid: false,
				subtitle: "⛔️ Folders have no links.",
			},
			ctrl: {
				valid: false,
				subtitle: "⛔️ Linking not possible for folders",
			},
			fn: {
				valid: false,
				subtitle: "⛔️ Cannot append to folders.",
			},
		},
	});
});

// Additional options when browsing a folder
if (pathToCheck !== vaultPath) {
	// New File in Folder
	jsonArray.push({
		title: "Create new Note in here",
		subtitle: "▸ " + currentFolder,
		arg: "new",
		icon: { path: "icons/new.png" },
	});

	// go up to parent folder
	jsonArray.push({
		title: "⬆️ Up to Parent Folder",
		match: "up back parent folder directory browse .. cd",
		subtitle: "▸ " + parentFolder(currentFolder),
		arg: parentFolder(currentFolder),
		icon: { path: "icons/folder.png" },
	});
}

JSON.stringify({ items: jsonArray });
