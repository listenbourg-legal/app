const { createRequire } = require('node:module');
require = createRequire(__filename);
require("./gitmanager")
const modul={}
const path = require("path")
const fs = require("fs")
const simpleGit = require('simple-git');
const { Octokit } = require('@octokit/rest');
const t = require("git-credential-node")
const loadlogin=()=>{
    let log=t.fillSync("https://github.com")
    if(!log){
        const { execSync } = require('child_process');
        const username = execSync('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(\'Entrez votre nom d\'utilisateur GitHub\', \'GitHub Login\', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)"').toString();
        const password = execSync('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(\'Entrez votre mot de passe GitHub trouvable sur https://github.com/settings/tokens (cocher tout)\', \'GitHub Login\', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)"').toString();
        
        log = {
            username: username.trim(),
            password: password.trim()
        };
        
        // Sauvegarder les identifiants
        t.approveSync({
            username: log.username,
            password: log.password,
            url: "https://github.com"
        });
    }
    return log;
}
const login = loadlogin()
const pacote = require("pacote")
const logger = require('./logger');
const semver = require('semver');
const axios = require('axios');
const net = require('net');
const {
    
    setInterval,
  } = require('node:timers/promises');
const { exec,spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const os = require('os');
const { ChildProcess } = require('node:child_process');
async function manageRepo(repo) {
    const { name, url, path: repoPath } = repo;
    let isSyncing = false; // Flag pour suivre l'état de synchronisation

    // Fonction pour créer un répertoire s'il n'existe pas
    function ensureDirectoryExistence(dirPath) {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`Répertoire créé: ${dirPath}`);
            }
        } catch (err) {
            console.log(err);
        }
    }

    // Fonction pour cloner un dépôt
    async function cloneRepo(repoPath, repoUrl) {
        try {
            console.log(`Clonage du dépôt ${repoUrl}...`);
            await simpleGit().clone(repoUrl, repoPath);
            console.log(`Dépôt ${repoUrl} cloné avec succès.`);
        } catch (err) {
            console.log(err);
        }
    }

    // Fonction pour commit des modifications
    async function commitChanges(repoPath) {
        const git = simpleGit(repoPath);
        try {
            const status = await git.status();
            if (status.modified.length > 0 || status.not_added.length > 0 || status.deleted.length > 0) {
                //console.log(`Des modifications ont été détectées dans ${repoPath}. Commit en cours...`);
                await git.add(['*', '*/*']);
                //await git.rebase(await git.branch())
                await git.commit('Mise à jour automatique des fichiers');
                //console.log(`Modifications commitées pour ${repoPath}.`);
                return true;
            } else {
               // console.log(`Aucune modification détectée dans ${repoPath}.`);
                return false;
            }
        } catch (err) {
            console.log(err);
            return false;
        }
    }

    // Fonction pour synchroniser un dépôt
    async function syncRepo(repoPath) {
        //await new Promise(resolve => setTimeout(resolve, 60000)); // Attend 1 minute
        
        if (isSyncing) {
            //console.log(`Une synchronisation est déjà en cours pour ${repoPath}, nouvelle demande ignorée.`);
            return;
        }

        isSyncing = true;
        const git = simpleGit(repoPath);
        try {
            //console.log(`Synchronisation du dépôt ${repoPath}...`);
            const changesCommitted = await commitChanges(repoPath);
           
           // console.log(`Dépôt ${repoPath} synchronisé avec succès.`);
            if (changesCommitted) {
                await git.pull();
                await git.push();
                const octokit = new Octokit({
                    auth: login.password // Utilisez un token si nécessaire
                });
                await octokit.request('POST /repos/listenbourg-legal/recueil-des-loi/actions/workflows/update-submodules.yml/dispatches', {

                    ref: 'main',
                    inputs: {
                      
                    },
                    headers: {
                      'X-GitHub-Api-Version': '2022-11-28'
                    }})
                //console.log(`Modifications poussées pour ${repoPath}.`);
            } else {
                // Vérifier s'il y a des fichiers non commités
                const status = await git.status();
                if (status.modified.length > 0 || status.not_added.length > 0 || status.deleted.length > 0) {
                    //console.log(`Des fichiers non commités détectés, nouvelle tentative de synchronisation...`);
                    await syncRepo(repoPath);
                }else{
                    await git.pull();
                    await git.push();
                }
            }
        } catch (err) {
           // console.log(`Erreur lors de la synchronisation: ${err.message}`);
            
        } finally {
            isSyncing = false;
        }
    }

    // Fonction pour surveiller les changements
    function watchRepo(repoPath) {
        let changeCount = 0;
        const CHANGE_THRESHOLD = 2;
        
        const watcher = fs.watch(repoPath, { recursive: true }, async (eventType, filename) => {
            const FORBIDDEN_FILES = [
                '.git',
                '.gitignore', 
                '.gitattributes',
                'index.lock',
                ".git\\index.lock",
            ];

            if (filename && !FORBIDDEN_FILES.some(forbidden => filename.endsWith(forbidden))) {
                changeCount++;
             //   console.log(`Changement détecté (${changeCount}/${CHANGE_THRESHOLD})`);
                
                if (changeCount >= CHANGE_THRESHOLD) {
                    await syncRepo(repoPath);
                    changeCount = 0;
                }
            }
        });
        //console.log(`Surveillance du dépôt ${repoPath} activée`);
        return watcher;
    }

    try {
        ensureDirectoryExistence(repoPath);
        if (fs.existsSync(path.join(repoPath, '.git'))) {
            await syncRepo(repoPath);
            watchRepo(repoPath);
        } else {
            await cloneRepo(repoPath, url);
            watchRepo(repoPath);
        }
    } catch (err) {
        console.log(err)
    }
}
function lancerDansNouvelleFenetre(programme) {
    let commande, args;
  
    switch (os.platform()) {
      case 'win32':
        commande = 'cmd.exe';
        args = ['/C', 'start', programme];
        break;
      case 'darwin':
        commande = 'open';
        args = ['-a', 'Terminal', programme];
        break;
      case 'linux':
        commande = 'gnome-terminal';
        args = ['--', programme];
        break;
      default:
        throw new Error('Plateforme non supportée');
    }
  
    const child = spawn(commande, args, {
      detached: true,
      stdio: 'ignore'
    });
  
    child.unref();
  
    console.log(`Le programme ${programme} a été lancé dans une nouvelle fenêtre.`);
  }
const resolve = (moduleName) => {
    logger.info(`Résolution du module: ${moduleName}`);
    
    // Vérifier si c'est un module Node.js intégré
    if (moduleName.startsWith('node:')) {
        return require.resolve(moduleName);
    }
    
    // Vérifier si c'est un chemin relatif ou absolu
    if (moduleName.startsWith('./') || moduleName.startsWith('/')) {
        return path.resolve(process.cwd(), moduleName);
    }
    
    // Chercher dans node_modules
    const nodeModulesPath = path.join(process.cwd(), 'node_modules', moduleName);
    if (fs.existsSync(nodeModulesPath)) {
        const packageJsonPath = path.join(nodeModulesPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const mainFile = packageJson.main || 'index.js';
            const mainPath = path.join(nodeModulesPath, mainFile);
            
            if (fs.existsSync(mainPath)) {
                if (fs.statSync(mainPath).isDirectory()) {
                    const packageJsonPath = path.join(mainPath, 'package.json');
                    const indexJsPath = path.join(mainPath, 'index.js');
                    
                    if (fs.existsSync(packageJsonPath)) {
                        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                        const mainFile = packageJson.main || 'index.js';
                        return path.join(mainPath, mainFile);
                    } else if (fs.existsSync(indexJsPath)) {
                        return indexJsPath;
                    }
                }
                return mainPath;
            }
            if (fs.existsSync(mainPath + '.js')) {
                return mainPath + '.js';
            }
            if(fs.existsSync(path.join(mainPath,"index.js"))){
                return path.join(mainPath,"index.js")
            }
        }
    }
    
    // Si le module n'est pas trouvé, essayer avec require.resolve
    try {
        return require.resolve(moduleName);
    } catch (error) {
        logger.error(`Module non trouvé: ${moduleName}`);
        throw error;
    }
}
const syncInProgress = new Map();

// Configuration des dossiers sécurisés pour Git
const SAFE_DIRECTORIES = [
    './dist',
    './source',
    
];
async function getGitConfig() {
    const config = {};
    try {
        config.user = login.username
     
        config.remoteUrl = "https://github.com/vbcq-volley/temp.git"
    } catch (error) {
        logger.error(`Error getting Git config: ${error.message}`);
    }
    return config;
}
// Fonction pour configurer les dossiers sécurisés
async function configureSafeDirectories() {
    const git = simpleGit();
    try {
        // Configurer les dossiers comme étant sécurisés
        for (const dir of SAFE_DIRECTORIES) {
            const absolutePath = path.resolve(dir);
            await git.raw(['config', '--global', '--add', 'safe.directory', absolutePath]);
            logger.info(`Dossier configuré comme sécurisé: ${absolutePath}`);
        }
        
        //config.user = login.username;
       // config.remoteUrl = "https://github.com/vbcq-volley/temp.git";
    } catch (error) {
        logger.error(`Error getting Git config: ${error.message}`);
    }
    return /*config*/;
}

// Fonction pour extraire le propriétaire et le dépôt à partir de l'URL du dépôt distant
function extractRepoInfo(remoteUrl) {
    const match = remoteUrl.match(/github\.com[:\/](.+?)\/(.+?)(?:\.git)?$/);
    if (match) {
        return {
            owner: match[1],
            repo: match[2]
        };
    }
    return null;
}

// Fonction pour créer une issue pour une erreur
async function createIssueForError(context,errorMessage) {
    const config = await getGitConfig();
    if (!config.remoteUrl) {
        logger.error('Remote URL not found in Git config');
        return;
    }

    const repoInfo = extractRepoInfo(config.remoteUrl);
    if (!repoInfo) {
        logger.error('Could not extract repository information from remote URL');
        return;
    }

    const { owner, repo } = repoInfo;

    // Initialiser Octokit avec authentification (si nécessaire)
    const octokit = new Octokit({
        auth: login.password // Utilisez un token si nécessaire
    });

    try {
        const response = await octokit.issues.create({
            owner,
            repo,
            title: `Error Report: ${new Date().toISOString()} ${context}`,
            body: `An error occurred:\n\n\`\`\`\n${errorMessage}\n\`\`\``,
            labels: ['bug']
        });
        logger.info(errorMessage)
        logger.info(`Issue created: ${response.data.html_url}`);
    } catch (error) {
        console.log(error)
        logger.error(`Error creating issue: ${error.message}`);
    }
}
// Classe pour gérer les erreurs
class ErrorCollector {
    constructor() {
        this.errors = [];
    }

    addError(error, context) {
        this.errors.push({
            timestamp: new Date(),
            error: error,
            context: context
        });
        //createIssueForError(`Erreur dans ${context}:`, error);
        logger.error(error, context);
    }

    getErrors() {
        return this.errors;
    }

    clearErrors() {
        this.errors = [];
    }

    hasErrors() {
        return this.errors.length > 0;
    }
}

// Créer une instance globale du collecteur d'erreurs
global.errorCollector = new ErrorCollector();

// Exemple d'utilisation de la fonction manageRepo


// Appel de la fonction d'installation du thème avant l'initialisation de Hexo





async function extractModule(moduleName,version="latest") {
    try {
      // Extraire le nom du package du moduleName
      const packageName = moduleName
      
      // Créer le chemin du sous-dossier dans node_modules
      const targetDir = path.join(process.cwd(), 'node_modules', packageName);
      
      // Vérifier si le module existe déjà
      if (fs.existsSync(targetDir)) {
        logger.info(`Le module ${packageName} existe déjà dans ${targetDir}`);
        return { from: moduleName, resolved: targetDir, integrity: 'existing' };
      }
      
      // Créer le dossier
      fs.mkdirSync(targetDir, { recursive: true });
      logger.info(`install ${moduleName}`)
      // Extraire le module dans le sous-dossier
      const result = await pacote.extract(moduleName+"@"+version, targetDir);
      
      // Lire le package.json pour obtenir les dépendances
      const packageJsonPath = path.join(targetDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Extraire les dépendances
        const dependencies = {
          ...packageJson.dependencies
        };
        
        // Extraire récursivement les dépendances
        for (const [depName, depVersion] of Object.entries(dependencies)) {
          try {
            await extractModule(depName,depVersion);
          } catch (depError) {
            logger.warn(`Impossible d'extraire la dépendance ${depName}: ${depError.message}`);
          }
        }
      }
      
      logger.info(`Module extrait avec succès dans ${targetDir}`);
      logger.info(`Source: ${result.from}`);
      logger.info(`Chemin résolu: ${result.resolved}`);
      logger.info(`Intégrité: ${result.integrity}`);
      
      return result;
    } catch (error) {
        global.errorCollector.addError(error, `extractModule(${moduleName})`);
      logger.error(`Erreur lors de l'extraction du module: ${error.message}`);
      throw error;
    }
  }

// Configuration Hexo


async function main() {
    try {
        logger.info("Démarrage de l'application...");
        
        // Gérer le verrouillage de l'application
        const lockFilePath = path.join(os.tmpdir(), 'adminpanel.lock');
        
        // Vérifier si le fichier de verrouillage existe
        if (fs.existsSync(lockFilePath)) {
            try {
                // Lire le PID stocké dans le fichier
                const pid = parseInt(fs.readFileSync(lockFilePath, 'utf8'));
                
                // Vérifier si le processus existe toujours
                try {
                    process.kill(pid, 0);
                    // Le processus existe toujours
                    logger.info("Une instance est déjà en cours d'exécution. Arrêt de l'ancienne instance...");
                    process.kill(pid, 'SIGTERM');
                    // Attendre un peu pour que l'ancienne instance se termine
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (e) {
                    // Le processus n'existe plus, on peut supprimer le fichier de verrouillage
                    fs.unlinkSync(lockFilePath);
                }
            } catch (e) {
                // En cas d'erreur de lecture, supprimer le fichier de verrouillage
                fs.unlinkSync(lockFilePath);
            }
        }
        
        // Créer le nouveau fichier de verrouillage
        fs.writeFileSync(lockFilePath, process.pid.toString());
        
        // Nettoyer le fichier de verrouillage à la sortie
        process.on('exit', () => {
            try {
                if (fs.existsSync(lockFilePath)) {
                    fs.unlinkSync(lockFilePath);
                }
            } catch (e) {
                // Ignorer les erreurs lors du nettoyage
            }
        });
        
        await extractModule("@yao-pkg/pkg");
        modul["pkg"]=require("@yao-pkg/pkg")
        // Vérifier les mises à jour au démarrage
       
        
        await manageRepo({ name: 'plugins', url: 'https://github.com/vbcq-volley/plugin-build.git', path: './dist' });
        await manageRepo({ name: 'source', url: 'https://github.com/listenbourg-legal/source.git', path: './source' });
        await configureSafeDirectories()
        await extractModule("hexo");
        logger.log(typeof resolve)
        const hexo = require(resolve("hexo"));
        logger.log('Hexo chargé avec succès');
        
        const admin = new hexo(process.cwd(), {
            debug: false,
            silent: false,
        });
        
        // Remplacer le logger Hexo par notre logger global
        admin.log = logger;
       
        await extractModule("hexo-theme-landscape");
        await admin.init();
        await admin.load();
    
        const plugins = fs.readdirSync("./dist")
            .filter(item => !fs.statSync(path.join("./dist", item)).isDirectory());
            
        for (const plugin of plugins) {
            if(plugin===".git"){
                console.log(plugin)
            }else{
                logger.info(`Chargement du plugin ${plugin}`);
                await admin.loadPlugin(path.join("./dist", plugin));
            }
            
        }
            
        logger.log('État de Hexo:', admin.env);
        await admin.call("server", { i: "127.0.0.1", port: 8080 });
        logger.log('Serveur Hexo démarré sur http://127.0.0.1:8080');
    } catch (err) {
        global.errorCollector.addError(err, 'main()');
    }
}

main();


process.on("SIGKILL", () => {
    try {
        admin.exit();
        logger.info('Application arrêtée proprement');
    } catch (err) {
        global.errorCollector.addError(err, 'SIGKILL handler');
    }
});
process.on("SIGTERM", () => {
    try {
        admin.exit();
        logger.info('Application arrêtée proprement');
    } catch (err) {
        global.errorCollector.addError(err, 'SIGTERM handler');
    }
});
// Fonction pour vérifier les mises à jour
async function checkForUpdates() {
    try {
        const octokit = new Octokit({
            auth: login.password
        });
        
        // Récupérer la version actuelle
        const currentVersion = require('./package.json').version;
        
        // Récupérer la dernière release depuis GitHub
        const { data: releases } = await octokit.repos.listReleases({
            owner: 'listenbourg-legal',
            repo: 'app'
        });

        if (releases.length === 0) {
            logger.info('Aucune release trouvée sur GitHub');
            return;
        }

        const latestRelease = releases[0];
        const latestVersion = latestRelease.tag_name.replace('v', '');
        
        // Comparer les versions
        if (semver.gt(latestVersion, currentVersion)) {
            logger.info(`Une nouvelle version est disponible : ${latestVersion}`);
            
            // Obtenir le nom du fichier exécutable actuel
            const currentExecutableName = path.basename(process.execPath);
            
            // Trouver l'asset qui correspond exactement au nom du fichier actuel
            const asset = latestRelease.assets.find(a => a.name === currentExecutableName);
            if (!asset) {
                logger.error(`Aucun asset trouvé correspondant à ${currentExecutableName}`);
                return;
            }

            logger.info('Téléchargement de la mise à jour...');
            const response = await axios({
                method: 'GET',
                url: asset.browser_download_url,
                responseType: 'arraybuffer'
            });

            // Sauvegarder l'ancienne version dans un dossier temporaire
            const tempDir = os.tmpdir();
            const backupFile = path.join(tempDir, `adminpanel-${currentVersion}.exe`);
            fs.copyFileSync(process.execPath, backupFile);

            // Écrire la nouvelle version dans un fichier temporaire
            const newVersionFile = path.join(tempDir, 'new-version.exe');
            fs.writeFileSync(newVersionFile, Buffer.from(response.data));

            logger.log('Mise à jour téléchargée. Redémarrage nécessaire.');
            
            // Lancer le script de mise à jour
            const updateScript = path.join(path.dirname(process.execPath), 'update.js');
            fs.writeFileSync(updateScript, `
                const fs = require('fs');
                const path = require('path');
                const { spawn } = require('child_process');
                const os = require("os")
                const sourceFile = '${newVersionFile.replace(/\\/g, '/')}';
                const targetFile = '${path.normalize(process.execPath).replace(/\\/g, '/')}';
                
function lancerDansNouvelleFenetre(programme) {
  let commande, args;

  switch (os.platform()) {
    case 'win32':
      commande = 'cmd.exe';
      args = ['/C', 'start', programme];
      break;
    case 'darwin':
      commande = 'open';
      args = ['-a', 'Terminal', programme];
      break;
    case 'linux':
      commande = 'gnome-terminal';
      args = ['--', programme];
      break;
    default:
      throw new Error('Plateforme non supportée');
  }

  const child = spawn(commande, args, {
    detached: true,
    stdio: 'ignore'
  });

  child.unref();

  console.log(\`Le programme \${programme} a été lancé dans une nouvelle fenêtre.\`);
}
                setTimeout(() => {
                    try {
                        if (fs.existsSync(targetFile)) {
                            fs.unlinkSync(targetFile);
                        }
                        fs.copyFileSync(sourceFile, targetFile);
                        fs.unlinkSync(sourceFile);
                        
                        console.log('Mise à jour terminée');
                        
                        lancerDansNouvelleFenetre(targetFile)
                        
                        process.exit(0);
                    } catch (err) {
                        console.error('Erreur:', err);
                        process.exit(1);
                    }
                }, 2000);
            `);
            while(!fs.existsSync(updateScript)){
                console.log("wait")
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            console.log(modul["pkg"])
            function getOS() {
                const platform = os.platform();
                switch(platform) {
                    case 'win32':
                        return 'win';
                    case 'darwin':
                        return 'macos';
                    case 'linux':
                        return 'linux';
                    default:
                        return 'unknown';
                }
            }
             await modul["pkg"].exec([updateScript,"--out-path",path.dirname(updateScript),"--targets",getOS()])

             await new Promise(resolve => setTimeout(resolve, 1000));
             await new Promise(resolve => setTimeout(resolve, 1000));
             await new Promise(resolve => setTimeout(resolve, 1000));
             await new Promise(resolve => setTimeout(resolve, 1000));
         
             console.log("build fini")
             console.log(getOS())
                await new Promise(resolve => setTimeout(resolve, 1000));
                fs.readdirSync(path.dirname(updateScript)).forEach(async(item)=>{
               //     console.log(item)
                    if(item.startsWith(path.basename(updateScript,".js")+`-${getOS()}`)&&!item.endsWith(".js")){
                        console.log(item)
                      
                       lancerDansNouvelleFenetre(`${path.dirname(updateScript)}${path.sep}${item}`)
                    }
                })
            // Lancer le script de mise à jour
            process.exit(0)
           
        } else {
            logger.info('Vous utilisez la dernière version disponible');
        }
    } catch (error) {
        logger.error(`Erreur lors de la vérification des mises à jour : ${error.message}`);
    }
}
setInterval(60*1000,checkForUpdates())

