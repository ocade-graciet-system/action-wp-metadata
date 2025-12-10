const core = require('@actions/core');
const github = require('@actions/github');
const readFileSync = require("fs").readFileSync;
const writeFileSync = require("fs").writeFileSync;

/**
 * @Description Normalise les fins de ligne (CRLF -> LF)
 * @Params **content**: contenu à normaliser
 * @Return **string**: contenu avec fins de ligne LF uniquement
 */
const normalizeLineEndings = (content) => {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
};

/**
 * @Params 
 * **pathFile**: path du fichier à lire
 * @Return **string**: contenu du fichier (normalisé en LF)
 */
const getFileContent = (pathFile) => {
  try {
    const content = readFileSync(pathFile, {encoding: "utf8"});
    return normalizeLineEndings(content);
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
  const splitVersion = oldVersion.trim().split(".");
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
  return content.indexOf(valueSearch) === 0;
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
  if (!fileContent) {
    throw Error("🆘 Contenu du fichier vide ou invalide");
  }
  
  // Regex pour plugin PHP : <?php suivi de /** ... */
  const regexPlugin = /^<\?php\n\/\*\*\n(\*.*\n)*\*\//;
  // Regex pour thème CSS : /* ... */ ou /*! ... */
  const regexTheme = /^\/\*!?\n(.*\n)*?\*\//;
  
  const regexp = isContentBegin(fileContent, "<?php") ? regexPlugin : regexTheme;
  const matches = fileContent.match(regexp);
  
  if (matches && matches[0]) {
    return matches[0];
  }
  
  throw Error("🆘 Impossible d'extraire le commentaire du fichier. Vérifiez le format du header.");
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
    throw Error("🆘 Impossible de lire le package.json");
  }
};

/**
 * @Description Extraction de la version des commentaires 
 */
const extractVersionComment = (indexFile) => {
  const comment = extractComment(getFileContent(indexFile));
  const regexp = /Version\s?:(.*)/g;
  const matches = [...comment.matchAll(regexp)];
  
  if (matches.length && matches[0].length >= 2) {
    return incrementeVersion(matches[0][1]);
  }
  
  throw Error("🆘 Impossible de trouver la version dans le commentaire");
};

/**
* @Description Extraction de la version si possible du package.json sinon du fichier d'index 
 */
const extractVersion = (indexFile) => {
  if (indexFile === "./package.json") {
    return extractVersionPackageJson(indexFile);
  }
  return extractVersionComment(indexFile);
};

/**
 * @Params 
 * - **comment**: commentaire extrait du fichier plugin/theme
 * @Return **json**: json contenant les informations du commentaire 
 */
const commentToJSON = (comment) => {
  const output = {};
  const isPHP = isContentBegin(comment, "<?php");
  
  comment.split("\n").forEach(line => {
    // Ignorer les lignes de structure du commentaire
    if (["<?php", "/**", "*/", "*", "/*!"].includes(line.trim()) 
        || line.trim().indexOf("* @") === 0
        || line.trim() === "") {
      return;
    }
    
    // Retirer le préfixe "* " pour les fichiers PHP
    let cleanLine = isPHP ? line.replace(/^\s*\*\s?/, '') : line;
    
    // Séparer clé et valeur
    const colonIndex = cleanLine.indexOf(": ");
    if (colonIndex > -1) {
      const key = cleanLine.substring(0, colonIndex).trim();
      const value = cleanLine.substring(colonIndex + 2).trim();
      if (key && value) {
        output[toKebabCase(key)] = value;
      }
    }
  });
  
  return output;
};

/**
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

const RunVersionning = (indexFile = false) => {
  const pathIndex = !indexFile ? "./style.css" : indexFile;
  
  console.log(`📄 Lecture du fichier: ${pathIndex}`);
  
  const newVersion = extractVersion(pathIndex);
  console.log(`📌 Nouvelle version: ${newVersion}`);
  
  core.setOutput("version", newVersion);
  
  const fileContent = getFileContent(pathIndex);
  const comment = extractComment(fileContent);
  const commentNewVersion = comment.replace(/Version\s?:.*\n/, `Version: ${newVersion}\n`);
  const json = commentToJSON(commentNewVersion);
  json["is_plugin"] = indexFile ? true : false;
  
  // Remplacer le commentaire par le nouveau
  const newContentIndexFile = fileContent.replace(comment, commentNewVersion);

  writeFileSync(pathIndex, newContentIndexFile, {encoding: "utf8"});
  writeFileSync("./metadata.json", JSON.stringify(json, null, 2), {encoding: "utf8"});
  
  console.log(`✅ Fichier ${pathIndex} mis à jour`);
  console.log(`✅ metadata.json généré`);
};

try {
  const indexFile = core.getInput('indexFile');
  
  if (!indexFile || indexFile === "" || indexFile === "style.css") {
    RunVersionning();
  } else {
    RunVersionning(indexFile);
  }
} catch (error) {
  core.setFailed(error.message);
}
