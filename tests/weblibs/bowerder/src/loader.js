/* the bower components loader for browsers
 ________________________________________________________________________________________
 *
 * Easly Import your components or libraries installed via bower to your project.
 * 
 * @license MIT
 * @author  [Tindo N. Arsel](mailto:devtnga@gmail.com)
*/

// manage possible conflict with loader namespace definition.
if (typeof bower !== 'undefined' && !(bower.components instanceof Object)) {

   console.warn('Seem like `bower` namespace is use for another purpose. Taking risk of an overwrite ...');
   window.bower = bower = {};
   console.warn('Forcing `bower` namespace initialization ... done.');

} else if (typeof bower === 'undefined') {

   window.bower = {};
}

/* importing package is an interresting hack when we have to avoid duplicate import and manage dependencies.
 * the method here is to have a registry where we will add package's configuration in particular order (function of dependency or not).
 * package's configuration is an object build from `bower.json` assciated file.
 * dependencies will always be imported before package of which depends; this influences how order is done in packages's configuration registry.
 * package have to have a unique occurrence on the registry; this assure that we will not have duplicate component's import.
 * that particular registry is the *dependencies package's tree registry*.
 * there will be also a main registry which is the *local packages's registry*, that will content all project's components's configurations installed via bower.
 * there will be therefore a provided command line tools (`bowerder`) that will help developer to generate the considered *local packages's registry* for a target project.
 * if the loader can't use any associated *local packages's registry* to import packages, it will try to use Ajax API to resolve the operation.
 * bower components directory have to be provided to loader so that it can know where to find packages main files. (this can be done through the global `dir` property)
 * however setting a `data-bowerreg` attribute to bowerder's script tag will be sufficient to it for determination of some needed like `bower components directory`.
 * 
 * with each import instruction, can be associated a callback function.
 * considered callback is executed when associated package's importation is fully done.
 * package's importation is fully done when all it main files and it dependencies main files (if defined) are loaded *in the DOM*.
 * a callback take an object as argument with the following properties:
 * `occured` : a boolean which inform if the associated package's importation was fully done or not (if an error occured or not);
 * `from` : a string which inform about the place where the error occured, possible value are "browser" or "bowerder";
 *    if the value is "bowerder" it's maybe an internal/connection error when loading package configuration (bower.json),
 *    if the value is "browser" it's maybe a 404/connection error on loading main files *in the DOM*;
 *    therefore, console is the place to see what really happen.
 * that object is usefull to check if there isn't an error (conditions are good) for some instructions.
 * in case of contionnal or timed importation, if a package is already fully imported or have already adressed a full loading process, the associated callback will be immediatly executed.
 * this is to introduce the fact that many callbacks can be associated to a package's importation via multiple `import's` instructions.
 * that said there will be a registry where we can acces to any package's associated callbacks, via the package's name.
 * 
 * for some globals tasks, global callbacks can be managed through the special bowerder "reserved" package's named `#bowerder`.
 * global callback take an object as argument with the following properties:
 * `occured` : a boolean which inform if all package's importation was fully done or not (if an error occured or not);
 * `fromBrowser` : an array which inform about packages where error occured and if it was from "browser" loading operations;
 * `fromBowerder` : an array which inform about packages where error occured and if it was from "bowerder" loading operations;
 *    therefore, console is the place to see what really happen.
 *    
 * to better manage some stuff, the loader can set extras porperties through the `browser` object, which will be itself a property of the package's configuration object. 
*/

bower.dir = './bower_components';      // bower base directory
bower.devMode = false;      // bower base directory
bower.loadingCount = 0;   // number of package that are in loading process
bower.total = 0;          // total number of packages that must to be loaded
bower.callbacks = {};     // packages's callback functions registry 
bower.packagesTree = [];  // packages's configuration registry

bower.browser = {          // these properties will help in some case for bowerder global processing.
   loaded: false,
   regTag: undefined,    // reference to *local packages's registry* script tag
   loaderTag: undefined, // reference to bowerder's script tag
   waitingCB: [],         // index of callbacks's to be execute after full packages's importation "in the DOM" 
   waitingImport: [],     // for package that will wait for *local packages's registry* state, before to be imported
   error: {occured: false, fromBrowser: [], fromBowerder: []},
};


/**
 * get the text reponse through an ajax request from a given path
 * @param   {string}   path     path where to get file's content
 * @param   {boolean}  isAsync  enable request asynchrone or not
 * @param   {function} callback the function to execute after the end of request process. take the returned object as argument 
 * @returns {object}   content the answer informations with this properties {error: boolean, status: number, statusText: string, text: string}
 */
bower.xhrGet = function (path, isAsync, callback) {

   if (typeof path !== 'string' && !(path instanceof String)) {

      console.error('bowerder: path must be give as a string');
      return null;
   }

   isAsync = (typeof isAsync === 'boolean' || isAsync instanceof Boolean) ? isAsync : true;
   callback = (typeof callback === 'function' || callback instanceof Function) ? callback : undefined;

   var xhr = undefined;

   if (window.XMLHttpRequest) {

      xhr = new XMLHttpRequest(); // For Chrome, Firefox, Opera and others...

      if (xhr.overrideMimeType)
         xhr.overrideMimeType('text/xml'); // Avoid Safari’s bug
   }
   else if (window.ActiveXObject) {
      // For Internet Explorer
      try {
         xhr = new ActiveXObject('Msxml2.XMLHTTP');  
      } catch (e1) {
         try {
            xhr = new ActiveXObject('Microsoft.XMLHTTP');  
         } catch (e2) {
            console.warn( e1.message );
            console.warn( e2.message );
         }
      }
   }

   if (!(xhr instanceof Object)) {

      console.error("bowerder: Can’t init Ajax functionalities. Maybe it’s your browser version ?");
      return null;
   }

   // on soumet les champs de connexion à la page de traitement approprié pour vérification
   xhr.open('GET', path, true);
   // xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
   // Si la requêtte s'est exécutée sans erreur on recupère le resultat du traitement
   xhr.send();

   xhr.onreadystatechange = function() {

      var response = {};
      response.error = false;

      if(xhr.readyState == 4 && xhr.status == 200) {

         response.status = xhr.status;
         response.text = xhr.responseText;

         if (callback) callback( response );

         return response;
      } 
      else if (xhr.readyState == 4 && xhr.status != 200) {

         response.status = xhr.status;
         response.statusText = xhr.statusText;
         response.error = true;
         console.error('bowerder: Ajax request error (status: '+ xhr.status +'), try to check your connection. ');

         if (callback) callback( response );

         return response;
      }
   }  
};

/**
 * helpfull to determine if a package is in the packages's configuration registry
 * @param   {string} pkgName the name of the package
 * @returns {number} index of the first occurrence of the given package. -1 if it's isn't in the registry.
 */
bower.packageIndex = function (pkgName) {

   if (typeof pkgName !== 'string' && !(pkgName instanceof String)) {

      console.error('bowerder:packageIndex: argument must be a string' );
   }
   else {

      for (i in bower.packagesTree) {

         if (bower.packagesTree[i].name === pkgName) return i;
      }
   }

   return -1;
};

/**
 * helpfull to get a package's configuration from the registry
 * @param   {string} pkgName the name of the package
 * @returns {object} the first occurrence of the given package. undefined if it's isn't in the registry.
 */
bower.package = function (pkgName) {

   return bower.packagesTree[ bower.packageIndex( pkgName ) ];
};

/**
 * check the correct moment to execute callbacks associated to a package and do it.
 * @param {string} pkgName the name of a package
 */
bower.checkCallback = function (pkgName) {

   /* the hack here is to be sure that all associated main files of considered package are loaded in the browser.
    * this is checked with a counter which content the number of main files that was loaded (event if the loading fail with browser loading process).
    * therefore the package is fully imported when the counter is equal to total of the package's main files.
    * callback is executed only if the package is fully imported.
   */
   if (!bower.package( pkgName ).browser.loaded) bower.package( pkgName ).browser.counter++;

   if (bower.package( pkgName ).browser.counter === bower.package( pkgName ).browser.main.length) {

      bower.package( pkgName ).browser.loaded = true; 

      if (bower.callbacks[ pkgName ]) {

         bower.callbacks[ pkgName ].forEach( function (callback) {

            callback( bower.package( pkgName ).browser.error );
         });
      }

      //will check if all packages are fully imported for global callbacks's executions
      bower.ready(); 
   }
}

/**
 * usefull to run callbacks after full packages's importation "in the DOM".
 * @param {function} callback function to execute. If empty, the function will try to run waiting callbacks.
 */
bower.ready = function (callback) {

   if (callback) {

      if (typeof callback !== 'function' && !(callback instanceof Function)) {

         console.warn('bowerder:ready: argument must be a function' );
      }
      else {

         if (!bower.callbacks['#bowerder']) bower.callbacks['#bowerder'] = [];

         bower.callbacks['#bowerder'].push( callback );

         /* with current ready's process, callback which is added to the callbacks's registry have the last index for the associated package,
          * that index is keeped and will be use to access to that callback if necessary in certains conditions
         */
         bower.browser.waitingCB.push( bower.callbacks['#bowerder'].length - 1 );
      }
   }

   if (bower.packagesTree.length > 0) bower.browser.loaded = true;

   for (var i=0; i<bower.packagesTree.length; i++) {

      if (!bower.packagesTree[i].browser.loaded) {

         bower.browser.loaded = false;
         break;
      }
   }

   if (bower.browser.loaded) {

      bower.browser.waitingCB.forEach( function (cbIndex) {

         bower.callbacks['#bowerder'][cbIndex]( bower.browser.error );
      });
   }
};  

/**
 * attach considered package's callbacks to it main files browser `load` event
 * @param   {Element}  node    element to attach callbacks on it `load` event
 * @param   {string}   pkgName package's name to use associated callbacks
*/
bower.attachPackageCB = function (node, pkgName) {

   if (!(node instanceof Element)) {

      console.warn('bowerder:attachPackageCB: argument must be an Element');
      return null;
   }

   // Set up load listener. Test attachEvent first because IE9 has
   // a subtle issue in its addEventListener and script onload firings
   // that do not match the behavior of all other browsers with
   // addEventListener support, which fire the onload event for a
   // script right after the script execution. See:
   // https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
   // UNFORTUNATELY Opera implements attachEvent but does not follow the script
   // script execution mode.
   if (node.attachEvent &&
       // Check if node.attachEvent is artificially added by custom script or
       // natively supported by browser
       // read https://github.com/requirejs/requirejs/issues/187
       // if we can NOT find [native code] then it must NOT natively supported.
       // in IE8, node.attachEvent does not have toString()
       // Note the test for "[native code" with no closing brace, see:
       // https://github.com/requirejs/requirejs/issues/273
       !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
       !isOpera) {
      // Probably IE. IE (at least 6-8) do not fire
      // script onload right after executing the script, so
      // we cannot tie the anonymous define call to a name.
      // However, IE reports the script as being in 'interactive'
      // readyState at the time of the define call.

      node.attachEvent('onreadystatechange', function () { bower.checkCallback( pkgName ); });
      // It would be great to add an error handler here to catch
      // 404s in IE9+. However, onreadystatechange will fire before
      // the error handler, so that does not help. If addEventListener
      // is used, then IE will fire error before load, but we cannot
      // use that pathway given the connect.microsoft.com issue
      // mentioned above about not doing the 'script execute,
      // then fire the script load event listener before execute
      // next script' that other browsers do.
      // Best hope: IE10 fixes the issues,
      // and then destroys all installs of IE 6-9.
      // node.attachEvent('onerror', context.onScriptError);
   } else {

      node.addEventListener('load', function () { bower.checkCallback( pkgName ); }, false);
      node.addEventListener('error', function () { 

         bower.package( pkgName ).browser.error = {occured: true, from: 'browser'};
         bower.browser.error.occured = true;
         bower.browser.error.fromBrowser.push( pkgName );

         bower.checkCallback( pkgName ); 
      }, false );
   }
}

/**
 * helpfull to determine which html tag have to be used to import a component in the DOM
 * @param   {string} targetFile component's file to include
 * @returns {object} an object that contains informations about html tag to use
 */
bower.parseTagType = function (targetFile) {

   if (typeof targetFile !== 'string' && !(targetFile instanceof String)) {

      console.error('bowerder:parseTagType: argument must be a string' );
      targetFile = "";
   }

   var tag = {name: 'unknow', type: 'unknow'};
   // get the target file extension
   tag.fext = targetFile.slice((Math.max(0, targetFile.lastIndexOf('.')) || Infinity) + 1);

   if (tag.fext === 'js') { // it's a js like file

      tag.name = 'script';
      tag.type = 'text/javascript';        
   }
   if (tag.fext === 'css' || tag.fext ==='scss' || tag.fext ==='sass' || tag.fext ==='less') { // it's a css like

      tag.name = 'link';
      tag.type = 'text/css';

      if (/\.css$/.test( targetFile )) tag.rel = 'stylesheet';
      else tag.rel = 'stylesheet/'+ tag.fext;            
   }
   if (tag.fext === 'txt') { // it's a plain text like file

      tag.name = 'link';
      tag.type = 'text/plain';        
      tag.rel = 'alternate';
      // @TODO set the tag.title with the name of the targetFile (regex must be usefull here)
   }

   return tag;
};

/**
 * organize packages's tree dependencies, process their importation "in the DOM" with asssociated callback if available
 * @param   {string}   pkgName   package's name
 * @param   {string}   pkgCaller package's of package which depends of first (argument) given package. usefull for dependencies management.
 * @param   {number}   cbIndex   index of current associated callback in callbacks's registry (if given)
 */
bower.addPackage = function (pkgName, pkgCaller, cbIndex) {

   if (typeof pkgName !== 'string' && !(pkgName instanceof String)) {

      console.error("bowerder:addPackage: package's name must be a string");
      return null;
   }
   if (pkgCaller && (typeof pkgCaller !== 'string') && !(pkgCaller instanceof String)) console.warn("bowerder:addPackage: package caller's name must be a string");
   if (cbIndex && (typeof cbIndex !== 'number') && !(cbIndex instanceof Number)) console.warn("bowerder:addPackage: callback index must be a number");

   var isAlreadyOk = false;

   /* check if package to load is already present in the registry.
    * if it's a dependency, check if it's present in the registry before package of which depends.
    * if so, nothing will be done, else the adding operation to the registry will be process.
   */
   if (bower.package( pkgName )) {

      isAlreadyOk = true;

      // if the package is already fully loaded *in the DOM*, the current associated callback is executed.
      if (cbIndex && bower.package( pkgName ).browser.loaded && bower.callbacks[ pkgName ]) {

         bower.callbacks[ pkgName ][cbIndex]( bower.package( pkgName ).browser.error );
      }

      if (pkgCaller && (bower.packageIndex( pkgCaller ) != -1) ) {
         /* major browsers load and execute script included by another script asynchronously.
          * the problem here is that, package which have dependencies have to be execute after them.
          * therefore, for these package, it's primordial to load them synchronously.
         */
         bower.package( pkgName ).browser.async = false;
         bower.package( pkgCaller ).browser.async = false;

         if (bower.packageIndex( pkgCaller ) < bower.packageIndex( pkgName )) isAlreadyOk = false;
      }
   }

   if (!isAlreadyOk) { // process the adding operation to the registry.

      bower.loadingCount++;
      bower.total++;

      if ((bower.components instanceof Object) && bower.components[ pkgName ]) {

         var pkgConfig = bower.components[ pkgName ];
         /* for reason due to size some properties in `bower.json` have been deleted with provided local registry (using bowerder on command line).
          * `name` is one of them, and the reason of it was removed was to avoid duplication since as once can see, package's configuration is accessible with package's name.
          * this is valable for `bower.components` (local registry), but not for `bower.packagesTree` (import registry), which need that `name` property to be set.
         */
         pkgConfig.name = pkgName;

         loadPackageConfig( pkgConfig );

         checkReadyToImport();
      }
      else {

         if ((bower.components instanceof Object) && !bower.components[ pkgName ]) {

            console.warn("bowerder:addPackage: can't found `"+ pkgName +"` in project's local registry; will try to import package through Ajax API.");
         }

         bower.xhrGet( bower.dir +'/'+ pkgName +'/bower.json', true, function (reponse) {

            if (reponse.error) {

               console.error('bowerder:addPackage: unable to load `'+ pkgName +'` component.' );

               /* considering that the package will not be imported and
                * then will not be added to the packages's configuration registry,
                * associated callback functions are executed with error from bowerder.
               */
               if ((typeof cbIndex === 'number' || cbIndex instanceof Number) && bower.callbacks[ pkgName ]) {

                  bower.callbacks[ pkgName ][cbIndex]( {occured: true, from: 'bowerder'} );
               } 

               bower.browser.error.occured = true;
               bower.browser.error.fromBowerder.push( pkgName );                
            }
            else {

               var pkgConfig = JSON.parse( reponse.text ); 

               if (pkgConfig instanceof Object) {

                  delete pkgConfig['ignore'];
                  delete pkgConfig['keywords'];
                  delete pkgConfig['moduleType'];
                  delete pkgConfig['resolutions'];

                  loadPackageConfig( pkgConfig );
               }
               else {

                  console.warn('bowerder:addPackage: unable to load `'+ pkgName +'` component.' );
               }
            } 

            checkReadyToImport();
         });
      }

      /**
       * register package's configuration with it dependencies (if defined) in the packages's tree registry.
       * @param {object} pkgConfig package's configuration from it `bower.json`
       * @private
      */
      function loadPackageConfig (pkgConfig) {

         if (!(pkgConfig.browser instanceof Object)) pkgConfig.browser = {};
         // by default,load and execute script asynchronously
         pkgConfig.browser.async = true;
         // by default, files to load from the package aren't yet imported
         pkgConfig.browser.loaded = false;
         // by default, set importation status to done without error  
         pkgConfig.browser.error = {occured: false, from: undefined};
         // init the number of imported file counter for the package
         pkgConfig.browser.counter = 0;

         /* minification is a way for developer to have for some files a better loading optimization. 
          * however, `bower.json` spec do not allow to use minified files as mains files for a component.
          * developers use to set associated `main` property with sources or developments files.
          * considering how web projects are now build, that pratice isn't advantageous for browsers.
          * indeed, set an `index.scss` or an unminified `index.js` files *(depending of size)* as main file isn't good for browsers to digest.
          * that why is now recommended to also set a `browser: {main: []}` properties for mains files that browsers can easly digest.
          * minified files with sourcemaps are specialy welcome in that case.
          * bowerder will use that properties to load component *in the DOM*; if they aren't set, it will use the `main` property. 
          * here is an example illustration for bowerder to well do it job:
          * // bower.json
          *    main: ["dist/index.scss", "dist/index.coffee"], // keep bower json spec
          *    browser: {
          *       main: ["dist/index.min.css", "dist/index.min.js"] // for browsers through bowerder
          *    }
          *    ... // others properties
         */
         if (!pkgConfig.browser.main) {

            if (!pkgConfig.main) {

               console.warn("bowerder:addPackage: there isn't main files indication for "+ pkgName);
               pkgConfig.main = [];
            }

            pkgConfig.browser.main = (typeof pkgConfig.main === 'string') ? [pkgConfig.main] : pkgConfig.main;
         }

         /* if `pkgCaller` is set, then current loading package adress by `pkgName` is a dependency.
          * therefore, it have to be added before the `pkgCaller` in the packages's configuration registry.
          * else it's just a package to add in the considered registry.
         */
         if (pkgCaller) {

            // mark package to be synchronously loaded and executed
            pkgConfig.browser.async = false;
            bower.package( pkgCaller ).browser.async = false;

            if (bower.packageIndex( pkgCaller ) != -1) {

               bower.packagesTree.splice( bower.packageIndex( pkgCaller ), 0, pkgConfig);
            }
         }
         else {

            bower.packagesTree.push( pkgConfig );
         }

         // if the current loading package have dependencies, then also process their loading
         if (pkgConfig['dependencies']) {

            var pkgDeps = Object.getOwnPropertyNames( pkgConfig['dependencies'] );

            pkgDeps.forEach( function (name) {

               bower.addPackage( name, pkgConfig['name']);
            });
         }
      }

      /**
       * make sure that loadings packages's configuration process are ok with good dependencies organization,
       * and proceed to packages importation *in the DOM* with correct order and associated behavior (callback, ...).
       * @private
      */
      function checkReadyToImport() {

         bower.loadingCount--;

         // when all the loading package process are finished, process their importation on the DOM.
         if (bower.loadingCount === 0) {

            /* if all loading package's configuration process have failed, 
             * directly run globals callbacks (if they are).
             * this, considering the fact that error can be check from callback by using the `error` argument.
            */
            if (bower.packagesTree.length === 0) {

               bower.browser.loaded = true;
               bower.ready();
            }
            else {

               // be sure to have unique package occurence in package's tree
               for (var i=0; i < bower.packagesTree.length; i++) {

                  for (var j=i+1; j < bower.packagesTree.length; j++) {

                     if (bower.packagesTree[i].name === bower.packagesTree[j].name) {

                        bower.packagesTree.splice( j, 1);
                        bower.total--;

                        j--;
                     }
                  }
               }

               var pkgScriptTags = [],
                   pkgLinkTags = [],
                   isAlreadyLoaded = false,
                   // Oh the tragedy, detecting opera. See the usage of isOpera for reason.
                   isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
                   loaderTag = undefined,
                   domLoaderTags = undefined,
                   devLinkTag = undefined,   // first custom link tag include by developer *in the document's <head>*
                   devScriptTag = undefined, // first custom Script tag include by developer *in the document's <head>*
                   getTag = undefined;       // supported tag

               bower.packagesTree.forEach( function (pkg) {

                  isAlreadyLoaded = false;
                  /* before include a loader tag in the DOM, it's primordial to check if the associated file isn't already loaded in.
                   * this assure to have an unique instance of a package in the DOM include by our `bower loader`.
                  */
                  if (document.querySelector) {
                     // efficient : this is for all major browsers and IE>8
                     if (document.head.querySelector('[data-bowerpkg ="'+pkg.name+'"]')) isAlreadyLoaded = true;
                  }
                  else { // alternative with more hack : this is specialy for IE<=8

                     domLoaderTags = [].slice.call( document.head.getElementsByTagName('link') );
                     domLoaderTags = domLoaderTags.concat( [].slice.call( document.head.getElementsByTagName('scrpit') ) );
                     for (var j=0; j < domLoaderTags.length; j++) {

                        if (domLoaderTags[j].getAttribute('data-bowerpkg') === pkg.name ) {

                           isAlreadyLoaded = true;
                           break;
                        }
                     }
                  }

                  if (!isAlreadyLoaded) {

                     for (index in pkg.browser.main) {

                        getTag = bower.parseTagType( pkg.browser.main[ index ] );

                        if (getTag.name === 'script') { 

                           loaderTag = document.createElement('script');
                           loaderTag.setAttribute('data-bowerpkg', pkg.name);
                           loaderTag.type = getTag.type;
                           loaderTag.async = pkg.browser.async;

                           /* with time, for other script support, paid attention to `load` event issue for some file by browsers.
                            * look at comments below for `link` tag hack for more details.
                           */
                           bower.attachPackageCB( loaderTag, pkg.name );

                           loaderTag.src = bower.dir +'/'+ pkg.name +'/'+ pkg.browser.main[ index ];

                           pkgScriptTags.push( loaderTag );
                        }
                        if (getTag.name === 'link') {

                           loaderTag = document.createElement('link');
                           loaderTag.setAttribute('data-bowerpkg', pkg.name);
                           loaderTag.rel = getTag.rel;
                           loaderTag.type = getTag.type;

                           /* browsers (as tested on firefox and chrome) seems to not execute event listeners 
                            * attached to `load` envent of some file (exception for css).
                            * unless will find hack to resolve that, callbacks assignement will be directly checked
                            * before considered files will have their path set to be included to the DOM.
                           */
                           if (getTag.fext !== "css") {

                              console.warn("bowerder: can't attach callback to `onload` event of "+ pkg.name +"/"+ pkg.browser.main[ index ]);
                              bower.checkCallback( pkg.name );
                           }
                           else bower.attachPackageCB( loaderTag, pkg.name );

                           loaderTag.href = bower.dir +'/'+ pkg.name +'/'+ pkg.browser.main[ index ];

                           pkgLinkTags.push( loaderTag );
                        }  
                        if (getTag.name === 'unknow') {

                           // console.warn('bowerder: unable to load unsupported file: '+ bower.dir +'/'+ pkg.name +'/'+ pkg.browser.main[ index ]);
                           // count the file for loading's fetching state 
                           bower.package( pkg.name ).browser.counter++;
                        }                       
                     }
                  }
               });

               /* generally, developer use to include custom stylesheets or scripts,
                * to overwrite library's properties or functions.
                * this is done by including library first, before that custom hacks.
                * therefore bowerder have to do the same to maintain that habit.
                * loader can identify it imported packages with the `data-bowerpkg` attribute.
                * it just to make sure to import them before non `data-bowerpkg` considered tag *in document <head>*.
               */ 
               domLoaderTags = document.head.getElementsByTagName('link');
               for (var i=0; i < domLoaderTags.length; i++) {

                  if (!domLoaderTags[i].getAttribute('data-bowerpkg') && domLoaderTags[i].rel && (domLoaderTags[i].rel !== 'icon')) {

                     devLinkTag = domLoaderTags[i];
                     break;
                  }
               }
               domLoaderTags = document.head.getElementsByTagName('script');
               for (var i=0; i < domLoaderTags.length; i++) {

                  if (!domLoaderTags[i].getAttribute('data-bowerpkg')) {

                     devScriptTag = domLoaderTags[i];
                     break;
                  }
               }

               // Link tags importation process "in the DOM"
               if (devLinkTag) {

                  pkgLinkTags.forEach( function (loaderTag) {

                     document.head.insertBefore( loaderTag, devLinkTag );
                  });
               }
               else {

                  pkgLinkTags.forEach( function (loaderTag) {

                     document.head.appendChild( loaderTag );
                  });
               }

               // Script tags importation process "in the DOM"
               if (devScriptTag) {

                  pkgScriptTags.forEach( function (loaderTag) {

                     document.head.insertBefore( loaderTag, devScriptTag );
                  });
               }
               else {

                  pkgScriptTags.forEach( function (loaderTag) {

                     document.head.appendChild( loaderTag );
                  });
               }

               if (bower.devMode) console.log( bower.packagesTree );
            }
         }
      }
   }
};


/**
 * import packages "in the DOM" with their dependecies 
 * @param   {string}   pkgName  package's name
 * @param   {function} callback function to run after full package's importation
*/
bower.import = function (pkgName, callback) {

   if (typeof pkgName !== 'string' && !(pkgName instanceof String)) {

      console.error('bowerder:import: argument must be a string' );
      return null;
   }

   if (callback) {

      if (typeof callback !== 'function' && !(callback instanceof Function)) {

         console.warn('bowerder:import: argument must be a function' );
      }
      else {

         if (!bower.callbacks[ pkgName ]) bower.callbacks[ pkgName ] = [];

         bower.callbacks[ pkgName ].push( callback );

         /* with current import's process, callback which is added to the callbacks's registry have the last index.
          * that index is keeped and will be use to access to that callback if necessary in certains conditions.
          * loader will be able to import package when the bower components's local registry state will be determinate.
         */
         if (!(bower.components instanceof Object) && bower.components !== null) {

            bower.browser.waitingImport.push( {name: pkgName, cbIndex: (bower.callbacks[ pkgName ].length - 1)} );
         }
         else bower.addPackage( pkgName, null, (bower.callbacks[ pkgName ].length - 1) );
      }
   }
   else {

      if (!(bower.components instanceof Object) && bower.components !== null) {

         bower.browser.waitingImport.push( {name: pkgName, cbIndex: undefined} );
      }
      else bower.addPackage( pkgName );
   } 

};


/* first execution zone
------------------------*/
/* developer can manually include the bower components's local registry *in the DOM*.
 * if not, the bowerder have to try to include it by itself for better performence for loading process.
*/
if (bower.components === undefined) {
   /* loader script have to be include *in the DOM* with the `data-bowerreg` attribute setting.
    * that attribute will help to know which tag have to be use to automate local packages's registry loading.
   */
   if (document.querySelector) {
      // efficient : this is for all major browsers and IE>8
      bower.browser.loaderTag = document.querySelector('script[data-bowerreg]');
   }
   else { // alternative with more hack : this is specialy for IE<=8

      var domScriptTags = document.getElementsByTagName('scrpit');

      for (var j=0; j < domScriptTags.length; j++) {

         if (domScriptTags[j].getAttribute('data-bowerreg')) {

            bower.browser.loaderTag = domScriptTags[j];
            break;
         }
      }
   }

   if (bower.browser.loaderTag) {

      // assuming that loader path will usually be `path-to-bowerdir/bowerder/dist/loader.js`
      bower.dir = bower.browser.loaderTag.src;
      for (var i=0; i<3; i++) bower.dir = bower.dir.slice(0, bower.dir.lastIndexOf('/') );

      bower.browser.regTag = document.createElement('script');
      bower.browser.regTag.onload = function () {

         if (!(bower.components instanceof Object)) {

            bower.components = null; // will allow not already run import's function call to skip waiting import step
            console.warn('bowerder: local registry isn\'t found, loader will try to import package through Ajax API.');
         }

         bower.browser.waitingImport.forEach( function (pkgInfo) {

            bower.addPackage( pkgInfo.name, null, pkgInfo.cbIndex );
         });
         bower.browser.waitingImport = [];
      };
      bower.browser.regTag.onreadystatechange = bower.browser.regTag.onerror = bower.browser.regTag.onload;

      bower.browser.regTag.setAttribute('data-bowerpkg', '#bowerder');
      bower.browser.regTag.src = bower.dir +'/.bowerreg.js';

      document.head.appendChild( bower.browser.regTag );
   }
   else {

      bower.components = null; // will allow not already run import's function call to skip waiting import step
      console.warn('bowerder: seems that local registry isn\'t provided; if so, loader will try to import package through Ajax API.');
   }
}