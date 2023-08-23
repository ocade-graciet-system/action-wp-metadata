const core = require('@actions/core');
const github = require('@actions/github');
const readFileSync = require("fs").readFileSync;
const writeFileSync = require("fs").writeFileSync;

/**
 * @Params 
 * **pathFile**: path du fichier à lire
 * @Return **string**: contenu du fichier
 */
const getFileContent = (pathFile) => {
  try {
    return readFileSync(pathFile, {encoding: "utf8"});
  } catch (e) {
    throw Error(`🆘 Impossible de lire le fichier: ${pathFile}`);
  }
};

/**
 * 
 * @param 
 * **oldVersion**: version non incrémentée (ex: 0.0.1)
 * @returns 
 * **newVersion** (ex: 0.0.2)
 */
const incrementeVersion = (oldVersion) => {
  const splitVersion = oldVersion.split(".");
  const lastElementValue = (splitVersion[splitVersion.length - 1])
  splitVersion[splitVersion.length - 1] = parseInt(lastElementValue) + 1;
  return splitVersion.join(".");    
};

/**
 * @Description Permet de savoir si une string commence par une valeur donnée.
 * @Params 
 * - **content**: contenu du fichier où chercher.
 * - **valueSearch**: valeur recherchée
 * @Returns Boolean
 */
const isContentBegin = (content, valueSearch) => {
  return (content.indexOf(valueSearch) === 0) ? true : false;
};

/**
 * @Description convertir une string en kebab-case 
 * @Params **string**: valeur à convertir
 * @Return String
*/
const toKebabCase = (string) => {
  return string.replaceAll(" ", "_").toLowerCase();
};

/**
 * @Description extrait une partie du contenue en respectant une regexp.
 * @Params **fileContent**: contenu d'un fichier 
*/
const extractComment = (fileContent) => {
  let regexPlugin = "^<\\?php\\n\\/\\*\\*\\n(\\*.*\\n)*\\*\\/";
  let regexTheme = "^\\/\\*\!?\\n(.*\\n)*\\*\\/";
  regexp = (isContentBegin(fileContent, "<?php")) ? (regexPlugin) : (regexTheme);
  regexp = new RegExp(regexp, "g");
  const matches = [...fileContent.matchAll(regexp)];
  if (matches.length && matches[0].length) {
    for (match of matches) {
      return match[0] // Correspond à la première capture
    }
  }
};

/**
 * @Description Extraction du path du dossier où est situé le fichier indexFile.
 */
const extractFolder = (filePath) => {
  return filePath.split("/").slice(0,-1).join("/");
};

/**
 * @Description Extraction de la version du package.json 
 */
const extractVersionPackageJson = (indexFile) => {
  try {
    const packageJson = JSON.parse(getFileContent("./"+ extractFolder(indexFile) +"/package.json"));
    return packageJson.version;
  } catch (e) {
    throw Error();
  }
};

/**
 * 
 * @Description Extraction de la version des commentaires 
 */
const extractVersionComment = (indexFile) => {
  const comment = extractComment(getFileContent(indexFile));
  regexp = "Version(\\s)?:(.*)";
  regexp = new RegExp(regexp, "g");
  const matches = [...comment.matchAll(regexp)];
  if (matches.length && matches[0].length) {
    for (match of matches) {
      return incrementeVersion(match[2]);
    }
  }
};

/**
* @Description Extraction de la version si possible du package.json sinon du fichier d'index 
 */
const extractVersion = (indexFile) => {
  if (indexFile === "./package.json") return extractVersionPackageJson(indexFile);
  else return extractVersionComment(indexFile);
};

/**
 * @Params 
 * - **comment**: commentaire extrait du fichier plugin/theme
 * @Return **json**: json contenant les informations du commentaire 
 */
const commentToJSON = (comment) => {
  const output = {};
  comment.split("\n").forEach(line => {
    if ((["<?php", "/**", "*/", "*", "/*!"].includes(line))
      || (line.indexOf("* @") == 0)) {
      return;
    }
    line = (isContentBegin(comment, "<?php")) ? line.slice(2) : line;
    line = line.split(": ", 2);
    output[toKebabCase(line[0])] = line[1];
  });
  return output;
};

/**
 * ?! Non utilisé, seulement la version updated.
 * !! Garde parce qu'exemple forEach Object.
 * @Description Convertie un json en commentaire WP
 * @Params
 * - **json**: informations plugin/thème
 * - **isPHP**: extension du fichier recevant le commentaire
 */
const JSONtoComment = (json, isPHP) => {
  const output = [];
  if (isPHP) {
    output.push("<?php");
  }
  output.push("/**");
  Object.entries(json).forEach(([key, value]) => {
    output.push("* "+key+": "+value)
  })
  output.push("*/");
  return output.join("\n");
};

const RunVersionning = (indexFile=false) => {
  const pathIndex = !indexFile ? "./style.css" : indexFile;
  const newVersion = extractVersion(pathIndex);
  core.setOutput("version", newVersion);
  const comment = extractComment(getFileContent(pathIndex));
  const commentNewVersion = comment.replace(/(Version:)(\s*)([^\n]*)\n/, (match, p1, p2, p3) => {
    return `${p1} ${newVersion}\n`;
  });  
  const json = commentToJSON(commentNewVersion);
  json["is_plugin"] = indexFile ?  true : false;
  // Que ce soit un fichier .php on style.css on remplace le commentaire par le nouveau
  const newContentIndexFile = getFileContent(pathIndex).replace(comment, commentNewVersion);

  writeFileSync(pathIndex, newContentIndexFile ,{encoding: "utf8"});
  writeFileSync("./metadata.json", JSON.stringify(json) ,{encoding: "utf8"});
};


try {
  if ((core.getInput('indexFile') === "") || (core.getInput('indexFile') === "style.css")) {
    RunVersionning();
  } else {
    RunVersionning(core.getInput('indexFile'));
  }
} catch (error) {
  core.setFailed(error.message);
}